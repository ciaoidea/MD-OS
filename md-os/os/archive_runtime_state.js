#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertSafeId,
  nowIso,
  printJson,
  sha256Json,
  sha256Text,
  shortText,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteNdjson, atomicWriteText, ensureDir, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');
const { isTerminalState, normalizeWorkItemState } = require('./lib/work_item_state');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const PROJECTS_DIR = path.join(OPS_DIR, 'projects');
const ARCHIVE_DIR = path.join(OPS_DIR, 'archive');
const ARCHIVE_PROJECTS_DIR = path.join(ARCHIVE_DIR, 'projects');
const SUMMARY_DIR = path.join(OPS_DIR, 'summary');
const ACTIVE_SUMMARY_JSON = path.join(SUMMARY_DIR, 'active_work_items.json');
const ACTIVE_SUMMARY_MD = path.join(SUMMARY_DIR, 'active_work_items.md');

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function readNdjsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function discoverProjectIds() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => assertSafeId(entry.name, 'project_id'))
    .filter((projectId) => fs.existsSync(path.join(PROJECTS_DIR, projectId, 'project.json')))
    .sort();
}

function summarizeItem(projectId, item) {
  const state = normalizeWorkItemState(item.state || item.status || 'open');
  return {
    id: shortText(item.id),
    project_id: projectId,
    title: shortText(item.title),
    state,
    status: state,
    priority: shortText(item.priority || 'medium').toLowerCase(),
    due_at: item.due_at || null,
    updated_at: shortText(item.updated_at || item.last_signal_at || item.captured_at || ''),
    source_refs: Array.isArray(item.source_refs) ? item.source_refs.map(shortText).filter(Boolean) : [],
  };
}

function projectArchivePaths(projectId) {
  const projectArchiveDir = path.join(ARCHIVE_PROJECTS_DIR, projectId);
  return {
    projectArchiveDir,
    terminalNdjson: path.join(projectArchiveDir, 'terminal_work_items.ndjson'),
    summaryJson: path.join(projectArchiveDir, 'terminal_summary.json'),
    summaryMd: path.join(projectArchiveDir, 'terminal_summary.md'),
  };
}

function buildProjectArchive(projectId, generatedAt) {
  const workItemsFile = path.join(PROJECTS_DIR, projectId, 'work_items.ndjson');
  const text = fs.existsSync(workItemsFile) ? fs.readFileSync(workItemsFile, 'utf8') : '';
  const items = readNdjsonSafe(workItemsFile).map((item) => summarizeItem(projectId, item));
  const terminalItems = items.filter((item) => isTerminalState(item.state));
  const activeItems = items.filter((item) => !isTerminalState(item.state));
  const doneCount = terminalItems.filter((item) => item.state === 'done').length;
  const cancelledCount = terminalItems.filter((item) => item.state === 'cancelled').length;
  const sourceHash = sha256Json({
    project_id: projectId,
    work_items_sha256: sha256Text(text),
    terminal_items: terminalItems,
  });

  const summary = {
    schema_version: 1,
    updated_at: generatedAt,
    source_hash: sourceHash,
    project_id: projectId,
    work_items_file: rel(workItemsFile),
    active_count: activeItems.length,
    terminal_count: terminalItems.length,
    done_count: doneCount,
    cancelled_count: cancelledCount,
  };

  return {
    project_id: projectId,
    active_items: activeItems,
    terminal_items: terminalItems,
    summary,
  };
}

function terminalSummaryMarkdown(summary, terminalItems) {
  const lines = [
    `# Terminal Work Items: ${summary.project_id}`,
    '',
    `Updated at: \`${summary.updated_at}\``,
    '',
    `Terminal: \`${summary.terminal_count}\``,
    '',
    `Done: \`${summary.done_count}\``,
    '',
    `Cancelled: \`${summary.cancelled_count}\``,
    '',
  ];
  if (!terminalItems.length) {
    lines.push('- No terminal work items.');
  } else {
    for (const item of terminalItems) {
      lines.push(`- \`${item.state}\` \`${item.id}\`: ${item.title}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function activeSummaryMarkdown(summary) {
  const lines = [
    '# Active Work Items',
    '',
    `Updated at: \`${summary.updated_at}\``,
    '',
    `Active: \`${summary.active_count}\``,
    '',
    `Terminal archived view: \`${summary.terminal_count}\``,
    '',
    '## Items',
    '',
  ];
  if (!summary.active_items.length) {
    lines.push('- No active work items.');
  } else {
    for (const item of summary.active_items) {
      lines.push(`- \`${item.project_id}\` \`${item.state}\` \`${item.priority}\` ${item.title}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function archiveRuntimeState() {
  ensureDir(ARCHIVE_PROJECTS_DIR);
  ensureDir(SUMMARY_DIR);
  const generatedAt = nowIso();
  const projectIds = discoverProjectIds();
  const projectArchives = projectIds.map((projectId) => buildProjectArchive(projectId, generatedAt));
  const activeItems = projectArchives.flatMap((item) => item.active_items)
    .sort((left, right) => {
      const projectCompare = left.project_id.localeCompare(right.project_id);
      if (projectCompare !== 0) return projectCompare;
      return left.id.localeCompare(right.id);
    });
  const terminalCount = projectArchives.reduce((sum, item) => sum + item.terminal_items.length, 0);
  const sourceHash = sha256Json({
    projects: projectArchives.map((item) => ({
      project_id: item.project_id,
      summary_source_hash: item.summary.source_hash,
    })),
    active_items: activeItems,
  });

  const activeSummary = {
    schema_version: 1,
    updated_at: generatedAt,
    source_hash: sourceHash,
    project_count: projectIds.length,
    active_count: activeItems.length,
    terminal_count: terminalCount,
    projects: projectArchives.map((item) => item.summary),
    active_items: activeItems,
  };

  return {
    generated_at: generatedAt,
    project_archives: projectArchives,
    active_summary: activeSummary,
  };
}

function writeArchiveRuntimeState(payload) {
  withFileLock('builder__archive_runtime_state', {
    context: 'archive_runtime_state',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    for (const projectArchive of payload.project_archives) {
      const paths = projectArchivePaths(projectArchive.project_id);
      ensureDir(paths.projectArchiveDir);
      atomicWriteNdjson(paths.terminalNdjson, projectArchive.terminal_items);
      atomicWriteJson(paths.summaryJson, projectArchive.summary);
      atomicWriteText(paths.summaryMd, terminalSummaryMarkdown(projectArchive.summary, projectArchive.terminal_items));
    }
    atomicWriteJson(ACTIVE_SUMMARY_JSON, payload.active_summary);
    atomicWriteText(ACTIVE_SUMMARY_MD, activeSummaryMarkdown(payload.active_summary));
  });
}

function main() {
  const payload = archiveRuntimeState();
  writeArchiveRuntimeState(payload);
  appendJournal({
    event: 'runtime_state_archived',
    project_count: payload.active_summary.project_count,
    active_count: payload.active_summary.active_count,
    terminal_count: payload.active_summary.terminal_count,
    source_hash: payload.active_summary.source_hash,
  });
  printJson({
    ok: true,
    mode: 'archive_runtime_state',
    project_count: payload.active_summary.project_count,
    active_count: payload.active_summary.active_count,
    terminal_count: payload.active_summary.terminal_count,
    output_json: rel(ACTIVE_SUMMARY_JSON),
    output_md: rel(ACTIVE_SUMMARY_MD),
    source_hash: payload.active_summary.source_hash,
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  ACTIVE_SUMMARY_JSON,
  ACTIVE_SUMMARY_MD,
  ARCHIVE_PROJECTS_DIR,
  SUMMARY_DIR,
  archiveRuntimeState,
  buildProjectArchive,
  writeArchiveRuntimeState,
};
