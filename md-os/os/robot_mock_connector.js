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

const PROFILE_FILE = path.join(MDOS_ROOT, 'ops', 'connectors', 'robot_mock_connector.json');
const SNAPSHOT_DIR = path.join(MDOS_ROOT, 'ops', 'sources', 'connectors');
const ARTIFACT_DIR = path.join(MDOS_ROOT, 'ops', 'artifacts', 'robot_mock');

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function usage() {
  process.stderr.write('Usage:\n  node md-os/os/robot_mock_connector.js list\n  node md-os/os/robot_mock_connector.js run <project_id> <mission_id>\n');
  process.exit(1);
}

function safeSlug(value) {
  return shortText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'item';
}

function readProfile() {
  if (!fs.existsSync(PROFILE_FILE)) throw new Error(`CONNECTOR_PROFILE_MISSING: ${rel(PROFILE_FILE)}`);
  const profile = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
  if (profile.schema_version !== 1) throw new Error(`UNSUPPORTED_ROBOT_MOCK_CONNECTOR_SCHEMA_VERSION: ${profile.schema_version}`);
  if (!Array.isArray(profile.missions)) throw new Error('ROBOT_MOCK_MISSIONS_MUST_BE_ARRAY');
  return profile;
}

function list(profile) {
  printJson({
    ok: true,
    mode: 'robot_mock_connector_list',
    connector_id: assertSafeId(profile.connector_id || 'robot_mock_connector', 'connector_id'),
    mission_count: profile.missions.length,
    missions: profile.missions.map((mission) => ({
      mission_id: shortText(mission.mission_id),
      robot_id: shortText(mission.robot_id || ''),
      risk_level: shortText(mission.risk_level || 'medium'),
      intent: shortText(mission.intent || mission.summary || ''),
    })),
  });
}

function run(profile, projectId, missionId) {
  const mission = profile.missions.find((item) => shortText(item.mission_id) === missionId);
  if (!mission) throw new Error(`UNKNOWN_ROBOT_MISSION_ID: ${missionId}`);
  const ts = nowIso();
  const stamp = ts.replace(/[:.]/g, '-');
  const telemetry = Array.isArray(mission.telemetry) ? mission.telemetry : [];
  const proposedActions = Array.isArray(mission.proposed_actions) ? mission.proposed_actions : [];
  const requiresApproval = proposedActions.some((action) => action.requires_approval !== false);
  ensureDir(SNAPSHOT_DIR);
  ensureDir(ARTIFACT_DIR);
  const artifactPath = path.join(ARTIFACT_DIR, `${safeSlug(projectId)}__${safeSlug(missionId)}__${stamp}.json`);
  const artifact = {
    schema_version: 1,
    connector_name: 'robot_mock_connector',
    mission_id: missionId,
    project_id: projectId,
    captured_at: ts,
    robot_id: shortText(mission.robot_id || 'robot_mock'),
    intent: shortText(mission.intent || mission.summary || ''),
    safety_policy: shortText(mission.safety_policy || 'human approval required for actuation'),
    telemetry,
    proposed_actions: proposedActions,
  };
  atomicWriteJsonLocked(artifactPath, artifact, { context: `robot_mock_artifact:${missionId}` });

  const snapshotPath = path.join(SNAPSHOT_DIR, `${safeSlug(projectId)}__robot_mock__${safeSlug(missionId)}.json`);
  const snapshot = {
    schema_version: 1,
    connector_name: 'robot_mock_connector',
    connector_kind: 'robotic_system',
    project_id: projectId,
    captured_at: ts,
    signals: [
      {
        source_id: assertSafeId(`robot_${safeSlug(missionId)}_${stamp.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 81), 'source_id'),
        captured_at: ts,
        title: shortText(mission.title || `Robot mission ${missionId}`),
        summary: shortText(mission.summary || mission.intent || `Robot mock mission ${missionId} captured.`),
        status_hint: requiresApproval ? 'blocked' : 'open',
        priority: shortText(mission.priority || 'medium').toLowerCase(),
        owner_hint: shortText(mission.owner_hint || 'Robotics Operator'),
        entities: Array.isArray(mission.entities) ? mission.entities.map(shortText).filter(Boolean) : ['robotic_system'],
        tags: Array.isArray(mission.tags) ? mission.tags.map(shortText).filter(Boolean) : ['robot', 'mock'],
        suspected_causes: [],
        depends_on: [],
        next_step: requiresApproval ? 'Review proposed robot action and approve through a bounded safety gate.' : 'Review telemetry and decide the next mission step.',
        external_parties: [],
        connector_runtime: {
          mission_id: missionId,
          robot_id: shortText(mission.robot_id || 'robot_mock'),
          telemetry_count: telemetry.length,
          proposed_action_count: proposedActions.length,
          requires_approval: requiresApproval,
          risk_level: shortText(mission.risk_level || 'medium'),
          artifact_file: rel(artifactPath),
          mission_hash: sha256Json(artifact),
        },
      },
    ],
  };
  validateConnectorSnapshot(snapshot);
  atomicWriteJsonLocked(snapshotPath, snapshot, { context: `robot_mock_snapshot:${projectId}:${missionId}` });
  appendJournal({
    event: 'robot_mock_connector_run',
    connector_id: 'robot_mock_connector',
    project_id: projectId,
    mission_id: missionId,
    risk_level: shortText(mission.risk_level || 'medium'),
    requires_approval: requiresApproval,
    snapshot_file: rel(snapshotPath),
    artifact_file: rel(artifactPath),
  });
  printJson({
    ok: true,
    mode: 'robot_mock_connector_run',
    project_id: projectId,
    mission_id: missionId,
    requires_approval: requiresApproval,
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
    return run(profile, assertSafeId(process.argv[3], 'project_id'), assertSafeId(process.argv[4], 'mission_id'));
  }
  usage();
}

if (require.main === module) main();
