#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');

function makeWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-agentic-core-'));
}

function writeFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function runScript(workspaceRoot, scriptName) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os', scriptName)], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspaceRoot,
      MDOS_ROOT: path.join(workspaceRoot, 'md-os'),
    },
  });
}

test('agentic core materializes compact identity objectives and ethics', () => {
  const workspace = makeWorkspace();
  writeFile(path.join(workspace, 'ME.md'), '# ME\n');
  writeFile(path.join(workspace, 'md-os/kb/AGENT_IDENTITY.md'), '# Identity\n');
  writeFile(path.join(workspace, 'md-os/kb/COGNITIVE_BOOTSTRAP.md'), '# Bootstrap\n');
  writeFile(path.join(workspace, 'md-os/kb/OPERATIONS.md'), '# Operations\n');
  writeFile(path.join(workspace, 'md-os/kb/PERMISSION_MODEL.md'), '# Permission\n');
  writeFile(path.join(workspace, 'md-os/kb/ARCHIVE_COMPACTION_MODEL.md'), '# Compaction\n');
  writeFile(path.join(workspace, 'md-os/kb/AGENTIC_CORE_MODEL.md'), `# Core

\`\`\`json mdos-agentic-core
{
  "schema_version": 1,
  "core_id": "test_core",
  "identity": {
    "name": "MD-OS APFC",
    "definition": "Test operating filesystem.",
    "implementation_status": "early_reference_implementation",
    "primary_identity": "repository_persistent_operating_context",
    "host_runtime_role": "execution_layer",
    "first_person_rule": "I means MD-OS APFC."
  },
  "mission": "Keep the test core compact.",
  "invariants": ["Stay inside md-os."],
  "limits": ["Not a mature runtime."],
  "bootstrap_order": ["AGENTS.md", "md-os/ops/core/agentic_core.md"],
  "memory_policy": {
    "canonical_support": "Filesystem.",
    "hot_path": "Core first.",
    "write_rule": "Write readable state.",
    "compaction_rule": "Summaries are non-destructive."
  },
  "action_policy": {
    "default": "Avoid destructive actions.",
    "preferred_pattern": "intent -> policy -> artifact -> journal",
    "permission_rule": "Approve risky actions.",
    "audit_rule": "Write an event."
  },
  "connector_policy": {
    "registration": "Register connectors.",
    "mature_fields": ["capability"],
    "minimum_classes": ["read_only"]
  },
  "recovery_policy": {
    "healthy_rule": "Do not recover if ops is readable.",
    "rebuild_rule": "Use builders.",
    "conflict_rule": "Use proposals.",
    "stale_state_rule": "Rebuild generated views."
  },
  "continuity_criteria": ["Core is readable."],
  "objectives": ["Keep context compact."],
  "ethics": ["Stay bounded."],
  "operating_principles": ["Use readable files."],
  "non_claims": ["Not sentient."],
  "compaction_policy": {
    "purpose": "Keep the core hot.",
    "method": "Materialize from knowledge.",
    "destructive": false,
    "read_order": ["md-os/ops/core/agentic_core.md"]
  },
  "source_documents": ["ME.md", "md-os/kb/AGENT_IDENTITY.md"]
}
\`\`\`
`);

  const result = runScript(workspace, 'build_agentic_core.js');
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/core/agentic_core.json'), 'utf8'));
  assert.equal(payload.core.core_id, 'test_core');
  assert.equal(payload.core.identity.name, 'MD-OS APFC');
  assert.equal(payload.core.objectives.length, 1);
  assert.equal(payload.core.ethics.length, 1);
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/core/agentic_core.md')));
});
