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
const { atomicWriteJsonLocked, ensureDir } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');
const { validateConnectorSnapshot } = require('./lib/validation');

const PROFILE_FILE = path.join(MDOS_ROOT, 'ops', 'connectors', 'ticketing_connector.json');
const SNAPSHOT_DIR = path.join(MDOS_ROOT, 'ops', 'sources', 'connectors');
const ARTIFACT_DIR = path.join(MDOS_ROOT, 'ops', 'artifacts', 'ticketing');

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function usage() {
  process.stderr.write('Usage:\n  node md-os/os/ticketing_connector.js list\n  node md-os/os/ticketing_connector.js run <project_id> <ticket_id>\n');
  process.exit(1);
}

function safeSlug(value) {
  return shortText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'item';
}

function readProfile() {
  if (!fs.existsSync(PROFILE_FILE)) throw new Error(`CONNECTOR_PROFILE_MISSING: ${rel(PROFILE_FILE)}`);
  const profile = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
  if (profile.schema_version !== 1) throw new Error(`UNSUPPORTED_TICKETING_CONNECTOR_SCHEMA_VERSION: ${profile.schema_version}`);
  if (!Array.isArray(profile.tickets)) throw new Error('TICKETING_TICKETS_MUST_BE_ARRAY');
  return profile;
}

function list(profile) {
  printJson({
    ok: true,
    mode: 'ticketing_connector_list',
    connector_id: assertSafeId(profile.connector_id || 'ticketing_connector', 'connector_id'),
    ticket_count: profile.tickets.length,
    tickets: profile.tickets.map((ticket) => ({
      ticket_id: shortText(ticket.ticket_id),
      project_id: shortText(ticket.project_id || ''),
      status: shortText(ticket.status || ''),
      priority: shortText(ticket.priority || ''),
      title: shortText(ticket.title || ticket.summary || ''),
    })),
  });
}

function run(profile, projectId, ticketId) {
  const ticket = profile.tickets.find((item) => shortText(item.ticket_id) === ticketId);
  if (!ticket) throw new Error(`UNKNOWN_TICKET_ID: ${ticketId}`);
  const ts = nowIso();
  const stamp = ts.replace(/[:.]/g, '-');
  ensureDir(SNAPSHOT_DIR);
  ensureDir(ARTIFACT_DIR);
  const artifactPath = path.join(ARTIFACT_DIR, `${safeSlug(projectId)}__${safeSlug(ticketId)}__${stamp}.json`);
  atomicWriteJsonLocked(artifactPath, {
    schema_version: 1,
    connector_name: 'ticketing_connector',
    ticket,
    captured_at: ts,
  }, { context: `ticketing_artifact:${ticketId}` });

  const snapshotPath = path.join(SNAPSHOT_DIR, `${safeSlug(projectId)}__ticketing__${safeSlug(ticketId)}.json`);
  const closed = ['closed', 'done', 'resolved', 'cancelled'].includes(shortText(ticket.status).toLowerCase());
  const snapshot = {
    schema_version: 1,
    connector_name: 'ticketing_connector',
    connector_kind: 'ticketing',
    project_id: projectId,
    captured_at: ts,
    signals: [
      {
        source_id: assertSafeId(`ticket_${safeSlug(ticketId)}_${stamp.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 81), 'source_id'),
        captured_at: ts,
        title: shortText(ticket.title || ticket.summary || ticketId),
        summary: shortText(ticket.summary || ticket.title || `Ticket ${ticketId}`),
        status_hint: closed ? 'terminal' : shortText(ticket.status_hint || 'open'),
        priority: shortText(ticket.priority || 'medium').toLowerCase(),
        owner_hint: shortText(ticket.owner_hint || ticket.assignee || 'Project Owner'),
        entities: Array.isArray(ticket.entities) ? ticket.entities.map(shortText).filter(Boolean) : ['ticketing'],
        tags: Array.isArray(ticket.tags) ? ticket.tags.map(shortText).filter(Boolean) : ['ticketing'],
        suspected_causes: Array.isArray(ticket.suspected_causes) ? ticket.suspected_causes.map(shortText).filter(Boolean) : [],
        depends_on: Array.isArray(ticket.depends_on) ? ticket.depends_on.map(shortText).filter(Boolean) : [],
        next_step: shortText(ticket.next_step || 'Review ticket and update project state.'),
        external_parties: Array.isArray(ticket.external_parties) ? ticket.external_parties.map(shortText).filter(Boolean) : [],
        connector_runtime: {
          ticket_id: ticketId,
          status: shortText(ticket.status || ''),
          artifact_file: rel(artifactPath),
          ticket_hash: sha256Json(ticket),
        },
      },
    ],
  };
  validateConnectorSnapshot(snapshot);
  atomicWriteJsonLocked(snapshotPath, snapshot, { context: `ticketing_snapshot:${projectId}:${ticketId}` });
  appendJournal({
    event: 'ticketing_connector_run',
    connector_id: 'ticketing_connector',
    project_id: projectId,
    ticket_id: ticketId,
    risk_level: 'medium',
    snapshot_file: rel(snapshotPath),
    artifact_file: rel(artifactPath),
  });
  printJson({
    ok: true,
    mode: 'ticketing_connector_run',
    project_id: projectId,
    ticket_id: ticketId,
    snapshot_file: rel(snapshotPath),
    artifact_file: rel(artifactPath),
  });
}

function main() {
  const profile = readProfile();
  const command = process.argv[2];
  if (command === 'list') return list(profile);
  if (command === 'run') {
    if (!process.argv[3] || !process.argv[4]) usage();
    return run(profile, assertSafeId(process.argv[3], 'project_id'), assertSafeId(process.argv[4], 'ticket_id'));
  }
  usage();
}

if (require.main === module) main();
