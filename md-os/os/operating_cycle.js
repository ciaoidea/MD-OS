#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertSafeId,
  nowIso,
  printJson,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, ensureDir, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const RUNTIME_DIR = path.join(OPS_DIR, 'runtime');
const OUTPUT_JSON = path.join(RUNTIME_DIR, 'operating_cycle_report.json');
const OUTPUT_MD = path.join(RUNTIME_DIR, 'operating_cycle_report.md');

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function discoverProjectIds() {
  const projectsDir = path.join(OPS_DIR, 'projects');
  if (!fs.existsSync(projectsDir)) return [];
  return fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => assertSafeId(entry.name, 'project_id'))
    .filter((projectId) => fs.existsSync(path.join(projectsDir, projectId, 'project.json')))
    .sort();
}

function tailLines(value, limit = 6) {
  return String(value || '')
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-limit);
}

function runNodeScript(scriptName, args = []) {
  const startedAt = nowIso();
  const result = spawnSync(process.execPath, [path.join(__dirname, scriptName), ...args], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_ROOT,
      MDOS_WORKSPACE_ROOT: WORKSPACE_ROOT,
    },
    maxBuffer: 1024 * 1024 * 4,
  });
  return {
    command: ['node', `md-os/os/${scriptName}`, ...args].join(' '),
    ok: result.status === 0,
    status: Number.isInteger(result.status) ? result.status : null,
    started_at: startedAt,
    completed_at: nowIso(),
    stdout_tail: tailLines(result.stdout),
    stderr_tail: tailLines(result.stderr),
  };
}

function cyclePhases() {
  const projectIds = discoverProjectIds();
  return [
    { phase_id: 'initialize_ops_memory', script: 'initialize_ops_memory.js', args: [] },
    { phase_id: 'compile_programs', script: 'compile_programs.js', args: [] },
    ...projectIds.map((projectId) => ({
      phase_id: `build_project_state__${projectId}`,
      script: 'build_project_state.js',
      args: [projectId],
    })),
    { phase_id: 'build_global_agenda', script: 'build_global_agenda.js', args: [] },
    { phase_id: 'archive_runtime_state', script: 'archive_runtime_state.js', args: [] },
    { phase_id: 'build_agentic_core', script: 'build_agentic_core.js', args: [] },
    { phase_id: 'build_workspace_inventory', script: 'build_workspace_inventory.js', args: [] },
    { phase_id: 'build_markdown_graph', script: 'build_markdown_graph.js', args: [] },
    { phase_id: 'build_runtime_lifecycle_index', script: 'build_runtime_lifecycle_index.js', args: [] },
    { phase_id: 'build_semantic_knowledge_graph', script: 'build_semantic_knowledge_graph.js', args: [] },
    { phase_id: 'build_semantic_commitment_gate', script: 'build_semantic_commitment_gate.js', args: ['status'] },
    { phase_id: 'build_self_release_index', script: 'build_self_release_index.js', args: [] },
    { phase_id: 'agi_loop_eval', script: 'agi_loop.js', args: ['eval'] },
    { phase_id: 'build_runtime_compiler', script: 'build_runtime_compiler.js', args: [] },
    { phase_id: 'build_global_index', script: 'build_global_index.js', args: [] },
    { phase_id: 'build_system_hygiene_status', script: 'build_system_hygiene_status.js', args: [] },
    { phase_id: 'build_health_classifier', script: 'build_health_classifier.js', args: [] },
    { phase_id: 'build_health_dashboard', script: 'build_health_dashboard.js', args: [] },
    { phase_id: 'build_conceptual_boot_summary', script: 'build_conceptual_boot_summary.js', args: [] },
  ];
}

function runOperatingCycle() {
  const startedAt = nowIso();
  const phases = [];
  for (const phase of cyclePhases()) {
    const result = runNodeScript(phase.script, phase.args);
    phases.push({
      phase_id: phase.phase_id,
      ...result,
    });
    if (!result.ok) break;
  }
  const failed = phases.filter((phase) => !phase.ok);
  return {
    schema_version: 1,
    mode: 'operating_cycle_run_once',
    ok: failed.length === 0,
    started_at: startedAt,
    completed_at: nowIso(),
    phase_count: phases.length,
    failed_phase_count: failed.length,
    phases,
    outputs: {
      report_json: rel(OUTPUT_JSON),
      report_md: rel(OUTPUT_MD),
      conceptual_boot_summary: 'md-os/ops/summary/conceptual_boot_summary.md',
      health: 'md-os/ops/health.md',
      global_index: 'md-os/ops/global_index.md',
    },
  };
}

function renderMarkdown(report) {
  const lines = [
    '# System Operating Cycle Report',
    '',
    `Started at: \`${report.started_at}\``,
    '',
    `Completed at: \`${report.completed_at}\``,
    '',
    `OK: \`${report.ok}\``,
    '',
    `Phases: \`${report.phase_count}\``,
    '',
    `Failed phases: \`${report.failed_phase_count}\``,
    '',
    '## Phases',
    '',
  ];
  for (const phase of report.phases) {
    lines.push(`- \`${phase.ok ? 'PASS' : 'FAIL'}\` \`${phase.phase_id}\` :: \`${phase.command}\``);
    if (!phase.ok && phase.stderr_tail.length) {
      lines.push(`  - stderr: ${phase.stderr_tail.join(' | ')}`);
    }
  }
  lines.push('', '## Outputs', '');
  for (const [key, value] of Object.entries(report.outputs || {})) {
    lines.push(`- ${key}: \`${value}\``);
  }
  lines.push('');
  return lines.join('\n');
}

function writeReport(report) {
  ensureDir(RUNTIME_DIR);
  withFileLock('builder__operating_cycle_report', {
    context: 'operating_cycle_report',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(OUTPUT_JSON, report);
    atomicWriteText(OUTPUT_MD, renderMarkdown(report));
  });
}

function status() {
  const current = readJsonSafe(OUTPUT_JSON);
  return {
    schema_version: 1,
    mode: 'operating_cycle_status',
    ok: true,
    started_at: nowIso(),
    completed_at: nowIso(),
    phase_count: 0,
    failed_phase_count: 0,
    phases: [],
    outputs: {
      report_json: rel(OUTPUT_JSON),
      report_md: rel(OUTPUT_MD),
    },
    current_report_present: Boolean(current),
    current_report_ok: current ? Boolean(current.ok) : null,
    current_report_completed_at: current && current.completed_at || null,
  };
}

function usage() {
  process.stderr.write([
    'Usage:',
    '  operating_cycle.js status',
    '  operating_cycle.js run-once',
    '',
  ].join('\n'));
  process.exit(1);
}

function main() {
  const [command = 'status'] = process.argv.slice(2);
  if (command === 'status') return printJson(status());
  if (command === 'run-once' || command === 'once' || command === 'run') {
    const report = runOperatingCycle();
    writeReport(report);
    appendJournal({
      event: 'system_operating_cycle_completed',
      ok: report.ok,
      phase_count: report.phase_count,
      failed_phase_count: report.failed_phase_count,
      output_json: rel(OUTPUT_JSON),
      output_md: rel(OUTPUT_MD),
    });
    printJson({
      ok: report.ok,
      mode: report.mode,
      phase_count: report.phase_count,
      failed_phase_count: report.failed_phase_count,
      output_json: rel(OUTPUT_JSON),
      output_md: rel(OUTPUT_MD),
    });
    process.exit(report.ok ? 0 : 1);
  }
  usage();
}

if (require.main === module) {
  main();
}

module.exports = {
  cyclePhases,
  renderMarkdown,
  runOperatingCycle,
  status,
  writeReport,
};
