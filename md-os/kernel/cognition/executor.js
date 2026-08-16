#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const {
  WORKSPACE_ROOT,
  nowIso,
  sha256Json,
  sha256Text,
  shortText,
} = require('../../os/lib/common');
const { atomicWriteJsonLocked } = require('../../os/lib/fs_runtime');
const { assertInsideMdos } = require('./task_compiler');

const TERMINAL_CONNECTOR = path.resolve(__dirname, '..', '..', 'os', 'terminal_connector.js');

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function parseLastJson(text) {
  const lines = String(text || '').trim().split('\n').filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch (_) {
      // Continue to the preceding line; connector diagnostics may precede readback.
    }
  }
  return null;
}

function bufferSha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function directoryManifest(rootPath, limit = 2000) {
  const entries = [];
  const pending = [rootPath];
  let truncated = false;
  while (pending.length && entries.length < limit) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(rootPath, absolute).replace(/\\/g, '/');
      if (entry.isSymbolicLink()) {
        entries.push({ path: relative, kind: 'symlink', target: fs.readlinkSync(absolute) });
      } else if (entry.isDirectory()) {
        entries.push({ path: relative, kind: 'directory' });
        pending.push(absolute);
      } else if (entry.isFile()) {
        const stat = fs.statSync(absolute);
        entries.push({ path: relative, kind: 'file', size: stat.size, sha256: bufferSha256(fs.readFileSync(absolute)) });
      } else {
        entries.push({ path: relative, kind: 'other' });
      }
      if (entries.length >= limit) {
        truncated = true;
        break;
      }
    }
  }
  return { entries, truncated: truncated || pending.length > 0 };
}

function fileSnapshot(target) {
  const resolved = assertInsideMdos(path.resolve(WORKSPACE_ROOT, target.path), 'observation_target');
  const base = {
    target_id: target.target_id,
    path: rel(resolved),
    required_change: target.required_change !== false,
    exists: fs.existsSync(resolved),
  };
  if (!base.exists) return { ...base, kind: 'missing', content_hash: null, size: 0 };
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink()) {
    return {
      ...base,
      kind: 'symlink',
      content_hash: sha256Text(fs.readlinkSync(resolved)),
      size: stat.size,
      unsafe: true,
    };
  }
  if (stat.isFile()) {
    const content = fs.readFileSync(resolved);
    return {
      ...base,
      kind: 'file',
      content_hash: bufferSha256(content),
      size: stat.size,
    };
  }
  if (stat.isDirectory()) {
    const manifest = directoryManifest(resolved);
    return {
      ...base,
      kind: 'directory',
      content_hash: sha256Json(manifest),
      size: manifest.entries.length,
      truncated: manifest.truncated,
    };
  }
  return { ...base, kind: 'other', content_hash: null, size: stat.size };
}

function runTerminalCommand(reference) {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [
    TERMINAL_CONNECTOR,
    'run',
    reference.project_id,
    reference.command_id,
  ], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    env: process.env,
    timeout: Number(reference.timeout_ms) > 0 ? Number(reference.timeout_ms) + 5000 : 30000,
  });
  const payload = parseLastJson(result.stdout);
  return {
    invocation_status: Number.isInteger(result.status) ? result.status : null,
    exit_status: payload && Number.isInteger(payload.exit_code) ? payload.exit_code : null,
    duration_ms: Date.now() - startedAt,
    payload,
    stderr: shortText(result.stderr || result.error && result.error.message || '').slice(0, 2000),
  };
}

function receiptId(episodeId, actionId) {
  const suffix = sha256Text(`${episodeId}:${actionId}`).slice(0, 10);
  return `receipt_${suffix}_${String(actionId).replace(/[^a-zA-Z0-9_]+/g, '_').slice(0, 48)}`;
}

function executeActions({ episodeId, taskSpec, receiptsDir }) {
  const receipts = [];
  fs.mkdirSync(receiptsDir, { recursive: true });
  for (const action of taskSpec.actions || []) {
    const id = receiptId(episodeId, action.action_id);
    const receiptFile = path.join(receiptsDir, `${id}.json`);
    const targets = (taskSpec.observation_targets || []).map((target) => ({ ...target }));
    const stateBefore = targets.map(fileSnapshot);
    const startedAt = nowIso();
    let execution;
    try {
      execution = runTerminalCommand(action);
    } catch (error) {
      execution = {
        invocation_status: null,
        exit_status: null,
        duration_ms: 0,
        payload: null,
        stderr: error.message,
      };
    }
    const completedAt = nowIso();
    const stateAfter = targets.map(fileSnapshot);
    const deltas = stateAfter.map((after, index) => {
      const before = stateBefore[index];
      return {
        target_id: after.target_id,
        path: after.path,
        required_change: after.required_change,
        changed: before.exists !== after.exists
          || before.kind !== after.kind
          || before.content_hash !== after.content_hash
          || before.size !== after.size,
        before_hash: before.content_hash,
        after_hash: after.content_hash,
      };
    });
    const expected = action.expected_exit_status;
    const completed = execution.invocation_status === 0 && execution.exit_status === expected;
    const artifacts = execution.payload
      ? [execution.payload.artifact_file, execution.payload.snapshot_file].filter(Boolean)
      : [];
    const receipt = {
      schema_version: 1,
      action_receipt_id: id,
      episode_id: episodeId,
      action_id: action.action_id,
      tool: action.connector_id,
      input_hash: sha256Json(action),
      started_at: startedAt,
      completed_at: completedAt,
      status: completed ? 'completed' : 'failed',
      exit_status: execution.exit_status,
      expected_exit_status: expected,
      artifacts,
      state_before: {
        hash: sha256Json(stateBefore),
        targets: stateBefore,
      },
      state_after: {
        hash: sha256Json(stateAfter),
        targets: stateAfter,
      },
      observed_delta: {
        changed: deltas.some((delta) => delta.changed),
        targets: deltas,
      },
      rollback: action.rollback && typeof action.rollback === 'object'
        ? action.rollback
        : { available: false, instructions: '' },
      readback: {
        invocation_status: execution.invocation_status,
        connector_result: execution.payload,
        stderr: execution.stderr,
        duration_ms: execution.duration_ms,
      },
    };
    atomicWriteJsonLocked(receiptFile, receipt, { context: `action_receipt:${id}` });
    receipts.push({ ...receipt, file: rel(receiptFile) });
  }
  return receipts;
}

module.exports = {
  executeActions,
  fileSnapshot,
  runTerminalCommand,
};
