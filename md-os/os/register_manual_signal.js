#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { MDOS_ROOT, WORKSPACE_ROOT, assertSafeId, nowIso, printJson, shortText } = require('./lib/common');
const { atomicWriteJsonLocked } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');
const { validateConnectorSnapshot } = require('./lib/validation');

const projectId = process.argv[2] ? assertSafeId(process.argv[2], 'project_id') : '';
const summary = process.argv.slice(3).join(' ');

if (!projectId || !summary) {
  throw new Error('USAGE: node md-os/os/register_manual_signal.js <project_id> <summary>');
}

const filePath = path.join(MDOS_ROOT, 'ops', 'sources', 'manual', `${projectId}.json`);

let payload = {
  schema_version: 1,
  connector_name: 'manual',
  connector_kind: 'manual',
  project_id: projectId,
  captured_at: nowIso(),
  signals: [],
};

if (fs.existsSync(filePath)) {
  payload = validateConnectorSnapshot(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  if (payload.project_id !== projectId) {
    throw new Error(`PROJECT_ID_MISMATCH: ${payload.project_id} != ${projectId}`);
  }
}

const sourceId = assertSafeId(`manual_${Date.now()}`, 'source_id');
const capturedAt = nowIso();
payload.captured_at = capturedAt;
payload.signals.push({
  source_id: sourceId,
  captured_at: capturedAt,
  summary: shortText(summary),
  status_hint: 'open',
  priority: 'medium',
  entities: [],
  tags: ['manual'],
  suspected_causes: [],
  depends_on: [],
  next_step: 'Review and classify',
  external_parties: [],
});

validateConnectorSnapshot(payload);
atomicWriteJsonLocked(filePath, payload, { context: `register_manual_signal:${projectId}` });
appendJournal({
  event: 'manual_signal_registered',
  project_id: projectId,
  source_id: sourceId,
});

printJson({
  ok: true,
  mode: 'register_manual_signal',
  project_id: projectId,
  source_id: sourceId,
  output_file: path.relative(WORKSPACE_ROOT, filePath),
});
