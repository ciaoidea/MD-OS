#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');
const GPL_MARKER = '                    GNU GENERAL PUBLIC LICENSE\n';
const GPL2_CANONICAL_SHA256 = '8177f97513213526df2cf6184d8ff986c675afb514d4e68a404010521b880643';

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

test('package exposes the GPL-2.0-only 5.0.1 governance baseline', () => {
  const packagePayload = JSON.parse(read('package.json'));

  assert.equal(packagePayload.version, '5.0.1');
  assert.equal(packagePayload.license, 'GPL-2.0-only');
  assert.equal(packagePayload.author, 'Alessandro Rizzo');
  assert.equal(packagePayload.repository.url, 'git+https://github.com/ciaoidea/MD-OS.git');

  for (const requiredPath of [
    'AUTHORS.md',
    'CITATION.cff',
    'CONTRIBUTING.md',
    'DeveloperCertificateOfOrigin.txt',
    'GOVERNANCE.md',
    'LICENSE',
    'TRADEMARKS.md',
    'docs/',
    'md-os/kb/',
  ]) {
    assert.ok(packagePayload.files.includes(requiredPath), `package files missing ${requiredPath}`);
  }
});

test('LICENSE applies GPL-2.0-only and embeds the verbatim canonical GPLv2 body', () => {
  const license = read('LICENSE');
  const markerIndex = license.indexOf(GPL_MARKER);

  assert.ok(markerIndex > 0, 'GPLv2 body marker is missing');
  assert.match(license, /Copyright \(C\) 2026 Alessandro Rizzo and MD-OS contributors/);
  assert.match(license, /version 2 of the License only/);
  assert.match(license, /SPDX-License-Identifier: GPL-2\.0-only/);

  const canonicalBody = license.slice(markerIndex);
  assert.equal(sha256(canonicalBody), GPL2_CANONICAL_SHA256);
});

test('authorship, DCO, governance, citation, and naming policies stay aligned', () => {
  const authors = read('AUTHORS.md');
  const citation = read('CITATION.cff');
  const contributing = read('CONTRIBUTING.md');
  const dco = read('DeveloperCertificateOfOrigin.txt');
  const governance = read('GOVERNANCE.md');
  const trademarks = read('TRADEMARKS.md');
  const licensing = read('docs/LICENSING.md');
  const model = read('md-os/kb/OPEN_SOURCE_GOVERNANCE_MODEL.md');

  assert.match(authors, /originally created by \*\*Alessandro Rizzo\*\*/);
  assert.match(authors, /Contributors retain copyright/);
  assert.match(citation, /family-names: "Rizzo"/);
  assert.match(citation, /version: "5\.0\.1"/);
  assert.match(citation, /license: "GPL-2\.0-only"/);
  assert.ok(citation.includes('https://github.com/ciaoidea/MD-OS'));
  assert.match(contributing, /git commit -s/);
  assert.match(contributing, /Signed-off-by: Full Name/);
  assert.match(dco, /Developer's Certificate of Origin 1\.1/);
  assert.match(dco, /I\s+have the right to submit it/);
  assert.match(governance, /Alessandro Rizzo is the original creator/);
  assert.match(governance, /copyright assignment.*is not required/i);
  assert.match(trademarks, /does not add copyright restrictions/);
  assert.match(licensing, /Earlier copies.*MIT License/s);
  assert.match(licensing, /grants no special linking, plugin, connector, protocol, API/);
  assert.match(model, /default_repository_license = GPL-2\.0-only/);
  assert.match(model, /BSD\s+reference means base-system coherence/);
});

test('public documentation names GPL-2.0-only without calling it a BSD license', () => {
  const readme = read('README.md');
  const architecture = read('docs/ARCHITECTURE.md');
  const apfcModel = read('md-os/kb/ARTIFICIAL_PREFRONTAL_CORTEX_OS_MODEL.md');

  assert.match(readme, /GNU General Public License version 2 only/);
  assert.doesNotMatch(readme, /## License\s+MIT\./);
  assert.match(architecture, /BSD-style coherence describes the unified base-system method/);
  assert.match(apfcModel, /MD-OS is not BSD-licensed/);
});
