#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { sha256Text } = require('../md-os/os/lib/common');
const {
  ENGINE_ID,
  applyWorkspacePatch,
  parseUnifiedDiff,
} = require('../md-os/os/lib/workspace_patch');

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-workspace-patch-'));
}

function updatePatch(file, before, after) {
  return [
    `diff --git a/${file} b/${file}`,
    'index 0000000..1111111 100644',
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -1 +1 @@',
    `-${before}`,
    `+${after}`,
    '',
  ].join('\n');
}

test('native workspace patch applies an exact hunk and verifies readback hashes', () => {
  const root = workspace();
  fs.writeFileSync(path.join(root, 'note.md'), 'before\n');
  const receipt = applyWorkspacePatch({
    workspaceRoot: root,
    patchText: updatePatch('note.md', 'before', 'after'),
    lock: false,
  });
  assert.equal(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), 'after\n');
  assert.equal(receipt.engine, ENGINE_ID);
  assert.equal(receipt.status, 'applied');
  assert.equal(receipt.postcondition_verified, true);
  assert.equal(receipt.files[0].before_sha256, sha256Text('before\n'));
  assert.equal(receipt.files[0].after_sha256, sha256Text('after\n'));
});

test('dry-run validates the patch without changing the workspace', () => {
  const root = workspace();
  fs.writeFileSync(path.join(root, 'note.md'), 'before\n');
  const receipt = applyWorkspacePatch({
    workspaceRoot: root,
    patchText: updatePatch('note.md', 'before', 'after'),
    dryRun: true,
    lock: false,
  });
  assert.equal(receipt.status, 'checked');
  assert.equal(receipt.postcondition_verified, false);
  assert.equal(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), 'before\n');
});

test('native workspace patch creates a regular text file', () => {
  const root = workspace();
  const patch = [
    'diff --git a/new.md b/new.md',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/new.md',
    '@@ -0,0 +1 @@',
    '+created',
    '',
  ].join('\n');
  const receipt = applyWorkspacePatch({ workspaceRoot: root, patchText: patch, lock: false });
  assert.equal(receipt.files[0].operation, 'create');
  assert.equal(fs.readFileSync(path.join(root, 'new.md'), 'utf8'), 'created\n');
});

test('native workspace patch rejects a stale or invented preimage', () => {
  const root = workspace();
  fs.writeFileSync(path.join(root, 'note.md'), 'reality\n');
  assert.throws(() => applyWorkspacePatch({
    workspaceRoot: root,
    patchText: updatePatch('note.md', 'fantasy', 'after'),
    lock: false,
  }), { code: 'WORKSPACE_PATCH_PREIMAGE_MISMATCH' });
  assert.equal(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), 'reality\n');
});

test('native workspace patch rejects traversal and git metadata', () => {
  assert.throws(() => parseUnifiedDiff(updatePatch('../escape.md', 'a', 'b')), {
    code: 'WORKSPACE_PATCH_PATH_INVALID',
  });
  assert.throws(() => parseUnifiedDiff(updatePatch('.git/config', 'a', 'b')), {
    code: 'WORKSPACE_PATCH_GIT_METADATA_FORBIDDEN',
  });
});

test('native workspace patch rejects rename, deletion, binary and no-newline patches', () => {
  const rename = [
    'diff --git a/a.md b/b.md',
    'similarity index 100%',
    'rename from a.md',
    'rename to b.md',
    '',
  ].join('\n');
  assert.throws(() => parseUnifiedDiff(rename), {
    code: 'WORKSPACE_PATCH_RENAME_FORBIDDEN',
  });

  const deletion = [
    'diff --git a/a.md b/a.md',
    'deleted file mode 100644',
    '--- a/a.md',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-a',
    '',
  ].join('\n');
  assert.throws(() => parseUnifiedDiff(deletion), {
    code: 'WORKSPACE_PATCH_UNSUPPORTED_METADATA',
  });

  assert.throws(() => parseUnifiedDiff('diff --git a/a b/a\0'), {
    code: 'WORKSPACE_PATCH_BINARY_FORBIDDEN',
  });

  const noNewline = `${updatePatch('a.md', 'a', 'b').trimEnd()}\n\\ No newline at end of file\n`;
  assert.throws(() => parseUnifiedDiff(noNewline), {
    code: 'WORKSPACE_PATCH_NO_NEWLINE_UNSUPPORTED',
  });
});

test('native workspace patch rejects symlink targets', () => {
  const root = workspace();
  const outside = workspace();
  fs.writeFileSync(path.join(outside, 'note.md'), 'before\n');
  fs.symlinkSync(outside, path.join(root, 'linked'));
  assert.throws(() => applyWorkspacePatch({
    workspaceRoot: root,
    patchText: updatePatch('linked/note.md', 'before', 'after'),
    lock: false,
  }), { code: 'WORKSPACE_PATCH_PATH_OUTSIDE_WORKSPACE' });
  assert.equal(fs.readFileSync(path.join(outside, 'note.md'), 'utf8'), 'before\n');
});

test('native workspace patch rolls back every changed file after a batch failure', () => {
  const root = workspace();
  fs.writeFileSync(path.join(root, 'first.md'), 'before-one\n');
  fs.writeFileSync(path.join(root, 'second.md'), 'before-two\n');
  const patch = [
    updatePatch('first.md', 'before-one', 'after-one').trimEnd(),
    updatePatch('second.md', 'before-two', 'after-two'),
  ].join('\n');

  const chmodSync = fs.chmodSync;
  let forcedFailure = false;
  fs.chmodSync = (targetPath, mode) => {
    if (!forcedFailure && path.basename(targetPath) === 'second.md') {
      forcedFailure = true;
      throw new Error('FORCED_BATCH_FAILURE');
    }
    return chmodSync(targetPath, mode);
  };
  let observedError;
  try {
    applyWorkspacePatch({
      workspaceRoot: root,
      patchText: patch,
      lock: false,
    });
    assert.fail('expected forced batch failure');
  } catch (error) {
    observedError = error;
    assert.match(error.message, /FORCED_BATCH_FAILURE/);
  } finally {
    fs.chmodSync = chmodSync;
  }
  assert.deepEqual(observedError.rollback_failures, []);
  assert.equal(fs.readFileSync(path.join(root, 'first.md'), 'utf8'), 'before-one\n');
  assert.equal(fs.readFileSync(path.join(root, 'second.md'), 'utf8'), 'before-two\n');
});
