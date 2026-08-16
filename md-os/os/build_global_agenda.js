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
  shortText,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');

const PROJECTS_DIR = path.join(MDOS_ROOT, 'ops', 'projects');
const OUTPUT_DIR = path.join(MDOS_ROOT, 'ops', 'agenda');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'global_agenda.json');
const OUTPUT_MD = path.join(OUTPUT_DIR, 'global_agenda.md');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  atomicWriteJson(filePath, payload);
}

function writeText(filePath, text) {
  atomicWriteText(filePath, text);
}

function loadProjectAgendas() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const projectIds = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => assertSafeId(entry.name, 'project_id'))
    .sort();

  const agendas = [];
  for (const projectId of projectIds) {
    const agendaFile = path.join(PROJECTS_DIR, projectId, 'agenda.json');
    if (!fs.existsSync(agendaFile)) continue;
    const agenda = readJson(agendaFile);
    agendas.push({
      project_id: projectId,
      agenda_file: agendaFile,
      agenda,
    });
  }
  return agendas;
}

function buildGlobalAgenda() {
  const agendas = loadProjectAgendas();
  const items = agendas.flatMap(({ project_id, agenda_file, agenda }) => {
    const agendaUpdatedAt = shortText(agenda.updated_at || '');
    return (Array.isArray(agenda.items) ? agenda.items : []).map((item) => ({
      ...item,
      global_id: `ga_${project_id}__${item.id}`,
      project_id,
      source_agenda_file: path.relative(WORKSPACE_ROOT, agenda_file),
      source_agenda_updated_at: agendaUpdatedAt || null,
    }));
  }).sort((left, right) => {
    const whenCompare = String(left.when || '').localeCompare(String(right.when || ''));
    if (whenCompare !== 0) return whenCompare;
    const projectCompare = String(left.project_id || '').localeCompare(String(right.project_id || ''));
    if (projectCompare !== 0) return projectCompare;
    return String(left.id || '').localeCompare(String(right.id || ''));
  });

  return {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sha256Json(agendas.map(({ project_id, agenda }) => ({
      project_id,
      source_hash: agenda.source_hash || null,
      items: Array.isArray(agenda.items) ? agenda.items : [],
    }))),
    project_count: agendas.length,
    items,
  };
}

function buildGlobalAgendaMarkdown(globalAgenda) {
  const lines = [
    '# Global Agenda',
    '',
    `Updated at: \`${globalAgenda.updated_at}\``,
    '',
    `Projects included: \`${globalAgenda.project_count}\``,
    '',
    '## Items',
  ];

  if (!globalAgenda.items.length) {
    lines.push('- No consolidated agenda items.');
  } else {
    for (const item of globalAgenda.items) {
      const timeRange = item.ends_at ? `${item.when} -> ${item.ends_at}` : item.when;
      const activity = shortText(item.activity).replace(/[.!\s]+$/g, '');
      const dependencies = Array.isArray(item.dependencies) ? item.dependencies.join(', ') : '';
      const owner = shortText(item.owner || '');
      const precisionNote = item.time_precision === 'date_only' ? ' | Date-only source precision' : '';
      lines.push(`- \`${timeRange}\`: [${item.project_id}] ${item.title} | Activity: ${activity} | Dependencies: ${dependencies} | Owner: ${owner}${precisionNote}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const globalAgenda = buildGlobalAgenda();
  withFileLock('builder__global_agenda', {
    context: 'build_global_agenda',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    writeJson(OUTPUT_JSON, globalAgenda);
    writeText(OUTPUT_MD, buildGlobalAgendaMarkdown(globalAgenda));
  });
  appendJournal({
    event: 'global_agenda_rebuilt',
    builder: 'build_global_agenda',
    output_json: path.relative(WORKSPACE_ROOT, OUTPUT_JSON),
    output_md: path.relative(WORKSPACE_ROOT, OUTPUT_MD),
    project_count: globalAgenda.project_count,
    item_count: globalAgenda.items.length,
  });
  printJson({
    ok: true,
    mode: 'build_global_agenda',
    updated_at: globalAgenda.updated_at,
    project_count: globalAgenda.project_count,
    item_count: globalAgenda.items.length,
    output_json: path.relative(WORKSPACE_ROOT, OUTPUT_JSON),
    output_md: path.relative(WORKSPACE_ROOT, OUTPUT_MD),
  });
}

main();
