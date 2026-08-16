#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { MDOS_ROOT, nowIso, shortText } = require('./common');
const { appendLineWithLock, ensureDir } = require('./fs_runtime');

const JOURNAL_FILE = path.join(MDOS_ROOT, 'ops', 'journal.ndjson');

function sanitizeValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, sanitizeValue(item)])
    );
  }
  if (typeof value === 'string') return shortText(value);
  return value;
}

function appendJournal(event) {
  if (!event || typeof event !== 'object') return;
  ensureDir(path.dirname(JOURNAL_FILE));
  const payload = sanitizeValue({
    ts: nowIso(),
    ...event,
  });
  appendLineWithLock(JOURNAL_FILE, `${JSON.stringify(payload)}\n`, {
    lockName: 'journal__append',
    context: 'append_journal',
  });
}

module.exports = {
  JOURNAL_FILE,
  appendJournal,
};
