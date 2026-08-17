#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertInsideRoot,
  nowIso,
  sha256Json,
} = require('../../os/lib/common');

const HISTORY_MODES = new Set(['commands', 'full', 'off']);
const SESSION_ID_RE = /^session_[a-f0-9-]{16,64}$/;

function privateDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true, mode: 0o700 });
  fs.chmodSync(directoryPath, 0o700);
}

function privateFile(filePath) {
  if (!fs.existsSync(filePath)) {
    const descriptor = fs.openSync(filePath, 'wx', 0o600);
    fs.closeSync(descriptor);
  }
  fs.chmodSync(filePath, 0o600);
}

function appendJsonLine(filePath, payload) {
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function relativeToMdos(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

class ControlConsoleHistory {
  constructor(options = {}) {
    this.mode = String(options.mode || 'commands');
    if (!HISTORY_MODES.has(this.mode)) throw new Error(`CONTROL_CONSOLE_HISTORY_MODE_INVALID: ${this.mode}`);
    this.sessionId = String(options.sessionId || `session_${crypto.randomUUID()}`);
    if (!SESSION_ID_RE.test(this.sessionId)) throw new Error(`CONTROL_CONSOLE_SESSION_ID_INVALID: ${this.sessionId}`);
    this.localStateRoot = path.resolve(options.localStateRoot || path.join(MDOS_ROOT, 'ops', 'local'));
    this.rootDir = path.resolve(options.rootDir || path.join(this.localStateRoot, 'control-console'));
    this.sequence = 0;
    this.previousHash = null;
    this.historyPath = null;
    this.sessionPath = null;

    if (this.mode === 'off') return;

    assertInsideRoot(this.rootDir, this.localStateRoot, 'CONTROL_CONSOLE_HISTORY_OUTSIDE_LOCAL_STATE');
    const sessionsDir = assertInsideRoot(
      path.join(this.rootDir, 'sessions'),
      this.rootDir,
      'CONTROL_CONSOLE_SESSION_HISTORY_OUTSIDE_ROOT'
    );
    privateDirectory(this.rootDir);
    privateDirectory(sessionsDir);
    this.historyPath = assertInsideRoot(
      path.join(this.rootDir, 'history.ndjson'),
      this.rootDir,
      'CONTROL_CONSOLE_COMMAND_HISTORY_OUTSIDE_ROOT'
    );
    this.sessionPath = assertInsideRoot(
      path.join(sessionsDir, `${this.sessionId}.ndjson`),
      sessionsDir,
      'CONTROL_CONSOLE_SESSION_FILE_OUTSIDE_ROOT'
    );
    privateFile(this.historyPath);
    privateFile(this.sessionPath);
    this.appendEvent('session_started', {
      transcript_saved: this.mode === 'full',
      canonical_memory: false,
    });
  }

  appendCommand(inputEvent) {
    if (this.mode === 'off' || inputEvent.source_type !== 'human') return null;
    const entry = {
      schema_version: 1,
      entry_id: `command_${crypto.randomUUID()}`,
      recorded_at: nowIso(),
      session_id: this.sessionId,
      source_type: 'human',
      source_id: inputEvent.source_id,
      input_event_id: inputEvent.event_id,
      content: inputEvent.content,
    };
    appendJsonLine(this.historyPath, entry);
    return entry.entry_id;
  }

  appendEvent(eventType, metadata = {}, fullPayload = null) {
    if (this.mode === 'off') return null;
    this.sequence += 1;
    const payload = this.mode === 'full' && fullPayload
      ? { ...metadata, ...fullPayload }
      : metadata;
    const unsigned = {
      schema_version: 1,
      session_id: this.sessionId,
      sequence: this.sequence,
      occurred_at: nowIso(),
      event_type: String(eventType),
      privacy_mode: this.mode,
      previous_hash: this.previousHash,
      payload,
    };
    const event = {
      ...unsigned,
      event_hash: sha256Json(unsigned),
    };
    appendJsonLine(this.sessionPath, event);
    this.previousHash = event.event_hash;
    return event;
  }

  readback() {
    return {
      enabled: this.mode !== 'off',
      mode: this.mode,
      session_id: this.sessionId,
      command_history: this.historyPath ? relativeToMdos(this.historyPath) : null,
      session_history: this.sessionPath ? relativeToMdos(this.sessionPath) : null,
      transcript_saved: this.mode === 'full',
      canonical_memory: false,
      publication_boundary: 'host_local_gitignored',
    };
  }
}

module.exports = {
  ControlConsoleHistory,
};
