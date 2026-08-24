#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  assertInsideRoot,
  nowIso,
  sha256Json,
  sha256Text,
} = require('./common');
const { atomicWriteText, withFileLock } = require('./fs_runtime');

const ENGINE_ID = 'mdos_native_unified_diff_v1';
const MAX_PATCH_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 64;
const MAX_HUNKS = 4096;

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  throw error;
}

function normalizePatchPath(value) {
  const candidate = String(value || '');
  const normalized = path.posix.normalize(candidate);
  if (!candidate || candidate.includes('\0') || path.posix.isAbsolute(candidate)
    || normalized !== candidate || candidate === '..' || candidate.startsWith('../')
    || candidate.includes('/../')) {
    fail('WORKSPACE_PATCH_PATH_INVALID', candidate);
  }
  if (candidate === '.git' || candidate.startsWith('.git/')) {
    fail('WORKSPACE_PATCH_GIT_METADATA_FORBIDDEN', candidate);
  }
  return candidate;
}

function assertNoSymlinkPath(workspaceRoot, relativePath) {
  let current = path.resolve(workspaceRoot);
  for (const segment of relativePath.split('/')) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) continue;
    if (fs.lstatSync(current).isSymbolicLink()) {
      fail('WORKSPACE_PATCH_SYMLINK_FORBIDDEN', relativePath);
    }
  }
}

function parseRange(value, countValue) {
  const start = Number.parseInt(value, 10);
  const count = countValue === undefined ? 1 : Number.parseInt(countValue, 10);
  if (!Number.isInteger(start) || start < 0 || !Number.isInteger(count) || count < 0) {
    fail('WORKSPACE_PATCH_HUNK_RANGE_INVALID');
  }
  return { start, count };
}

function parseUnifiedDiff(patchText) {
  const text = String(patchText || '');
  if (!text.trim()) fail('WORKSPACE_PATCH_EMPTY');
  if (Buffer.byteLength(text, 'utf8') > MAX_PATCH_BYTES) fail('WORKSPACE_PATCH_TOO_LARGE');
  if (text.includes('\0')) fail('WORKSPACE_PATCH_BINARY_FORBIDDEN');

  const lines = text.split('\n');
  const files = [];
  let index = 0;
  let totalHunks = 0;

  while (index < lines.length) {
    if (lines[index] === '' && index === lines.length - 1) break;
    const header = /^diff --git a\/(.*?) b\/(.*)$/.exec(lines[index]);
    if (!header) fail('WORKSPACE_PATCH_DIFF_HEADER_INVALID', lines[index]);
    const headerOld = normalizePatchPath(header[1]);
    const headerNew = normalizePatchPath(header[2]);
    if (headerOld !== headerNew) fail('WORKSPACE_PATCH_RENAME_FORBIDDEN', `${headerOld} -> ${headerNew}`);
    index += 1;

    let newFileMode = null;
    while (index < lines.length && !lines[index].startsWith('--- ')) {
      const metadata = lines[index];
      if (/^(rename|copy) (from|to) /.test(metadata)
        || /^(old mode|new mode|deleted file mode) /.test(metadata)
        || metadata === 'GIT binary patch' || metadata.startsWith('Binary files ')) {
        fail('WORKSPACE_PATCH_UNSUPPORTED_METADATA', metadata);
      }
      const modeMatch = /^new file mode (100644|100755)$/.exec(metadata);
      if (modeMatch) newFileMode = Number.parseInt(modeMatch[1], 8);
      else if (metadata && !metadata.startsWith('index ') && !metadata.startsWith('similarity index ')) {
        fail('WORKSPACE_PATCH_METADATA_INVALID', metadata);
      }
      index += 1;
    }

    if (index + 1 >= lines.length || !lines[index].startsWith('--- ') || !lines[index + 1].startsWith('+++ ')) {
      fail('WORKSPACE_PATCH_FILE_HEADER_MISSING', headerOld);
    }
    const oldMarker = lines[index].slice(4);
    const newMarker = lines[index + 1].slice(4);
    index += 2;

    const isCreate = oldMarker === '/dev/null';
    const isDelete = newMarker === '/dev/null';
    if (isDelete) fail('WORKSPACE_PATCH_DELETE_REQUIRES_EXPLICIT_MODE', headerOld);
    if (isCreate) {
      if (newMarker !== `b/${headerNew}`) fail('WORKSPACE_PATCH_FILE_HEADER_MISMATCH', headerNew);
    } else if (oldMarker !== `a/${headerOld}` || newMarker !== `b/${headerNew}`) {
      fail('WORKSPACE_PATCH_FILE_HEADER_MISMATCH', headerOld);
    }

    const hunks = [];
    while (index < lines.length && !lines[index].startsWith('diff --git ')) {
      if (lines[index] === '' && index === lines.length - 1) {
        index += 1;
        break;
      }
      const hunkHeader = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/.exec(lines[index]);
      if (!hunkHeader) fail('WORKSPACE_PATCH_HUNK_HEADER_INVALID', lines[index]);
      const oldRange = parseRange(hunkHeader[1], hunkHeader[2]);
      const newRange = parseRange(hunkHeader[3], hunkHeader[4]);
      index += 1;

      const body = [];
      let oldCount = 0;
      let newCount = 0;
      while (index < lines.length && !lines[index].startsWith('@@ ')
        && !lines[index].startsWith('diff --git ')) {
        const line = lines[index];
        if (line === '' && index === lines.length - 1) break;
        if (line.startsWith('\\ No newline at end of file')) {
          fail('WORKSPACE_PATCH_NO_NEWLINE_UNSUPPORTED', headerOld);
        }
        const kind = line[0];
        if (![' ', '+', '-'].includes(kind)) fail('WORKSPACE_PATCH_HUNK_LINE_INVALID', line);
        const content = line.slice(1);
        body.push({ kind, content });
        if (kind !== '+') oldCount += 1;
        if (kind !== '-') newCount += 1;
        index += 1;
      }
      if (oldCount !== oldRange.count || newCount !== newRange.count) {
        fail('WORKSPACE_PATCH_HUNK_COUNT_MISMATCH', headerOld);
      }
      hunks.push({
        old_start: oldRange.start,
        old_count: oldRange.count,
        new_start: newRange.start,
        new_count: newRange.count,
        body,
      });
      totalHunks += 1;
      if (totalHunks > MAX_HUNKS) fail('WORKSPACE_PATCH_TOO_MANY_HUNKS');
    }

    if (!hunks.length) fail('WORKSPACE_PATCH_FILE_HAS_NO_HUNKS', headerOld);
    files.push({
      path: headerOld,
      is_create: isCreate,
      new_file_mode: newFileMode,
      hunks,
    });
    if (files.length > MAX_FILES) fail('WORKSPACE_PATCH_TOO_MANY_FILES');
  }

  if (!files.length) fail('WORKSPACE_PATCH_HAS_NO_FILES');
  if (new Set(files.map((file) => file.path)).size !== files.length) {
    fail('WORKSPACE_PATCH_DUPLICATE_FILE');
  }
  return files;
}

function splitExistingText(text, relativePath) {
  if (text.length > 0 && !text.endsWith('\n')) {
    fail('WORKSPACE_PATCH_NO_NEWLINE_UNSUPPORTED', relativePath);
  }
  if (!text.length) return [];
  return text.slice(0, -1).split('\n');
}

function applyHunks(originalText, filePatch) {
  const lines = splitExistingText(originalText, filePatch.path);
  let offset = 0;
  let previousEnd = 0;

  for (const hunk of filePatch.hunks) {
    const baseIndex = hunk.old_start === 0 ? 0 : hunk.old_start - 1;
    if (baseIndex < previousEnd) fail('WORKSPACE_PATCH_OVERLAPPING_HUNKS', filePatch.path);
    const targetIndex = baseIndex + offset;
    if (targetIndex < 0 || targetIndex > lines.length) {
      fail('WORKSPACE_PATCH_HUNK_OUT_OF_RANGE', filePatch.path);
    }

    const expected = hunk.body.filter((line) => line.kind !== '+').map((line) => line.content);
    const replacement = hunk.body.filter((line) => line.kind !== '-').map((line) => line.content);
    const actual = lines.slice(targetIndex, targetIndex + expected.length);
    if (actual.length !== expected.length
      || actual.some((line, itemIndex) => line !== expected[itemIndex])) {
      fail('WORKSPACE_PATCH_PREIMAGE_MISMATCH', `${filePatch.path}:${hunk.old_start}`);
    }
    lines.splice(targetIndex, expected.length, ...replacement);
    offset += replacement.length - expected.length;
    previousEnd = baseIndex + expected.length;
  }

  return lines.length ? `${lines.join('\n')}\n` : '';
}

function buildMutationPlan({ workspaceRoot, patchText }) {
  const root = path.resolve(workspaceRoot);
  const parsed = parseUnifiedDiff(patchText);
  return parsed.map((filePatch) => {
    let targetPath;
    try {
      targetPath = assertInsideRoot(
        path.resolve(root, filePatch.path),
        root,
        'WORKSPACE_PATCH_PATH_OUTSIDE_WORKSPACE',
      );
    } catch (_) {
      fail('WORKSPACE_PATCH_PATH_OUTSIDE_WORKSPACE', filePatch.path);
    }
    assertNoSymlinkPath(root, filePatch.path);
    const exists = fs.existsSync(targetPath);
    if (filePatch.is_create && exists) fail('WORKSPACE_PATCH_CREATE_TARGET_EXISTS', filePatch.path);
    if (!filePatch.is_create && !exists) fail('WORKSPACE_PATCH_UPDATE_TARGET_MISSING', filePatch.path);
    if (exists && !fs.statSync(targetPath).isFile()) {
      fail('WORKSPACE_PATCH_TARGET_NOT_REGULAR_FILE', filePatch.path);
    }
    const beforeText = exists ? fs.readFileSync(targetPath, 'utf8') : '';
    if (beforeText.includes('\0')) fail('WORKSPACE_PATCH_BINARY_TARGET_FORBIDDEN', filePatch.path);
    const afterText = applyHunks(beforeText, filePatch);
    if (beforeText === afterText) fail('WORKSPACE_PATCH_NO_EFFECT', filePatch.path);
    return {
      path: filePatch.path,
      target_path: targetPath,
      existed: exists,
      before_text: beforeText,
      after_text: afterText,
      before_sha256: sha256Text(beforeText),
      after_sha256: sha256Text(afterText),
      mode: exists ? fs.statSync(targetPath).mode & 0o777 : (filePatch.new_file_mode || 0o644),
      operation: exists ? 'update' : 'create',
      hunk_count: filePatch.hunks.length,
    };
  });
}

function rollbackPlan(applied) {
  const failures = [];
  for (const item of [...applied].reverse()) {
    try {
      if (item.existed) {
        atomicWriteText(item.target_path, item.before_text);
        fs.chmodSync(item.target_path, item.mode);
      } else if (fs.existsSync(item.target_path)) {
        fs.unlinkSync(item.target_path);
      }
    } catch (error) {
      failures.push({ path: item.path, error: error.message });
    }
  }
  return failures;
}

function executeMutation({ workspaceRoot, patchText, dryRun = false }) {
  const root = path.resolve(workspaceRoot);
  const plan = buildMutationPlan({ workspaceRoot: root, patchText });
  const baseReceipt = {
    schema_version: 1,
    receipt_type: 'workspace_patch',
    engine: ENGINE_ID,
    completed_at: nowIso(),
    dry_run: Boolean(dryRun),
    patch_sha256: sha256Text(patchText),
    patch_bytes: Buffer.byteLength(String(patchText || ''), 'utf8'),
    file_count: plan.length,
    files: plan.map((item) => ({
      path: item.path,
      operation: item.operation,
      hunk_count: item.hunk_count,
      before_sha256: item.before_sha256,
      after_sha256: item.after_sha256,
    })),
  };

  if (dryRun) {
    const receipt = {
      ...baseReceipt,
      ok: true,
      status: 'checked',
      postcondition_verified: false,
    };
    receipt.receipt_sha256 = sha256Json(receipt);
    return receipt;
  }

  const applied = [];
  try {
    for (const item of plan) {
      applied.push(item);
      atomicWriteText(item.target_path, item.after_text);
      fs.chmodSync(item.target_path, item.mode);
    }
    for (const item of plan) {
      const observed = fs.readFileSync(item.target_path, 'utf8');
      if (sha256Text(observed) !== item.after_sha256) {
        fail('WORKSPACE_PATCH_POSTCONDITION_MISMATCH', item.path);
      }
    }
  } catch (error) {
    const rollbackFailures = rollbackPlan(applied);
    error.rollback_failures = rollbackFailures;
    if (rollbackFailures.length) error.code = 'WORKSPACE_PATCH_ROLLBACK_FAILED';
    throw error;
  }

  const receipt = {
    ...baseReceipt,
    ok: true,
    status: 'applied',
    postcondition_verified: true,
  };
  receipt.receipt_sha256 = sha256Json(receipt);
  return receipt;
}

function applyWorkspacePatch({ workspaceRoot, patchText, dryRun = false, lock = true }) {
  if (!lock) return executeMutation({ workspaceRoot, patchText, dryRun });
  return withFileLock(
    'workspace_patch',
    { context: dryRun ? 'workspace_patch_check' : 'workspace_patch_apply' },
    () => executeMutation({ workspaceRoot, patchText, dryRun }),
  );
}

module.exports = {
  ENGINE_ID,
  MAX_FILES,
  MAX_HUNKS,
  MAX_PATCH_BYTES,
  applyHunks,
  applyWorkspacePatch,
  buildMutationPlan,
  normalizePatchPath,
  parseUnifiedDiff,
};
