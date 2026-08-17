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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-knowledge-import-workspace-'));
}

function makeSource() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-knowledge-import-source-'));
}

function writeFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function writeJson(filePath, payload) {
  writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function runScript(workspaceRoot, scriptName, args = []) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os', scriptName), ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspaceRoot,
      MDOS_ROOT: path.join(workspaceRoot, 'md-os'),
    },
  });
}

function runMdos(workspaceRoot, args = []) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os/mdos.js'), ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspaceRoot,
      MDOS_ROOT: path.join(workspaceRoot, 'md-os'),
    },
  });
}

test('knowledge import builds one compact semantic-epistemic import package', () => {
  const workspace = makeWorkspace();
  const source = makeSource();
  writeFile(path.join(workspace, 'md-os/ops/semantic_knowledge_summary.json'), JSON.stringify({
    schema_version: 1,
    top_concepts: [{ term: 'connector', node_count: 2 }, { term: 'permission', node_count: 2 }],
  }));
  writeFile(path.join(workspace, 'md-os/kb/CONNECTOR_CONTRACT.md'), '# Connector Contract\n');

  writeFile(path.join(source, 'README.md'), [
    '# Connector Research Notes',
    '',
    'This repository proposes a connector permission workflow with validation evidence.',
    'The claim is conditional and needs human review before promotion.',
    '',
  ].join('\n'));
  writeFile(path.join(source, 'docs/scientific_validation.md'), [
    '# Scientific Validation',
    '',
    'A hypothesis requires evidence, falsification, and reproducible derivation.',
    '',
  ].join('\n'));
  writeFile(path.join(source, 'src/tool.js'), 'function runConnector() { return \"permission\"; }\n');

  const result = runScript(workspace, 'build_knowledge_import.js', ['repo_notes', source]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'build_knowledge_import');
  assert.equal(payload.import_id, 'repo_notes');

  const importDir = path.join(workspace, 'md-os/ops/imports/knowledge/repo_notes');
  const manifest = JSON.parse(fs.readFileSync(path.join(importDir, 'manifest.json'), 'utf8'));
  const inventory = JSON.parse(fs.readFileSync(path.join(importDir, 'inventory.json'), 'utf8'));
  const classification = JSON.parse(fs.readFileSync(path.join(importDir, 'classification.json'), 'utf8'));
  const relations = JSON.parse(fs.readFileSync(path.join(importDir, 'relations.json'), 'utf8'));
  const identityPatch = JSON.parse(fs.readFileSync(path.join(importDir, 'identity_patch.json'), 'utf8'));
  const promotion = JSON.parse(fs.readFileSync(path.join(importDir, 'promotion_plan.json'), 'utf8'));
  const readback = JSON.parse(fs.readFileSync(path.join(importDir, 'readback.json'), 'utf8'));

  assert.equal(manifest.source_access, 'read_only_reference');
  assert.match(manifest.source_location, /^external:/);
  assert.equal(inventory.file_count, 3);
  assert.equal(classification.semantic_profile_complete, true);
  assert.equal(classification.epistemic_profile_complete, true);
  assert.ok(relations.concept_relations.some((edge) => edge.source_term === 'connector' || edge.target_term === 'connector'));
  assert.ok(relations.mdos_concept_links.some((edge) => edge.import_term === 'connector'));
  assert.equal(identityPatch.status, 'not_applicable');
  assert.ok(promotion.candidates.length > 0);
  assert.equal(readback.status, 'ok');
  assert.equal(readback.identity_patch_status, 'not_applicable');
  assert.equal(readback.epistemic_profile_complete, true);
  assert.ok(fs.existsSync(path.join(importDir, 'readback.md')));
  assert.ok(fs.existsSync(path.join(importDir, 'identity_patch.md')));
  assert.ok(fs.existsSync(path.join(importDir, 'extracted/knowledge_extract.md')));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/kb/imports/repo_notes/README.md')));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/kb/imports/repo_notes/KNOWLEDGE_NODES.md')));
  assert.equal(payload.canonical_import_dir, 'md-os/kb/imports/repo_notes');
});

test('knowledge import can materialize selected raw sources and structure tex and svg', () => {
  const workspace = makeWorkspace();
  const source = makeSource();

  writeFile(path.join(source, 'papers/main.tex'), [
    '\\section{Audit Schema}',
    'This proof-flow source defines a reproducible audit gate for review.',
    '',
  ].join('\n'));
  writeFile(path.join(source, 'audit/PROOF_FLOW_GRAPH.svg'), [
    '<svg xmlns="http://www.w3.org/2000/svg">',
    '  <title>Proof Flow Audit Gate Graph</title>',
    '  <text>validated gate graph schema</text>',
    '</svg>',
    '',
  ].join('\n'));
  writeJson(path.join(source, 'md-os/schemas/audit.schema.json'), {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Audit Schema',
    type: 'object',
  });
  writeFile(path.join(source, 'papers/references.bib'), '@article{audit,title={Audit}}\n');
  writeFile(path.join(source, 'papers/package.zip'), 'zip payload\n');
  writeFile(path.join(source, 'papers/rendered.pdf'), '%PDF payload\n');
  writeFile(path.join(source, 'audit/PROOF_FLOW_GRAPH.dot'), 'digraph G { audit -> gate }\n');
  writeFile(path.join(source, 'audit/figure.png'), 'png payload\n');
  writeFile(path.join(source, 'mcp/ops/artifacts/packages/paper_release.zip'), 'artifact zip payload\n');
  writeFile(path.join(source, 'notes.md'), '# Notes\n\nGeneral import note.\n');

  const result = runScript(workspace, 'build_knowledge_import.js', [
    'raw_material',
    source,
    '--copy-theory-sources',
  ]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.raw_copy_file_count, 9);

  const importDir = path.join(workspace, 'md-os/ops/imports/knowledge/raw_material');
  const manifest = JSON.parse(fs.readFileSync(path.join(importDir, 'manifest.json'), 'utf8'));
  const inventory = JSON.parse(fs.readFileSync(path.join(importDir, 'inventory.json'), 'utf8'));
  const classification = JSON.parse(fs.readFileSync(path.join(importDir, 'classification.json'), 'utf8'));
  const extraction = JSON.parse(fs.readFileSync(path.join(importDir, 'extracted/knowledge_extract.json'), 'utf8'));
  const readback = JSON.parse(fs.readFileSync(path.join(importDir, 'readback.json'), 'utf8'));

  assert.equal(manifest.source_access, 'read_only_reference_with_raw_copy');
  assert.equal(manifest.raw_copy.file_count, 9);
  assert.equal(manifest.raw_copy.include_artifact_packages, true);
  assert.equal(readback.raw_copy_file_count, 9);
  assert.ok(fs.existsSync(path.join(importDir, 'raw/source/papers/main.tex')));
  assert.ok(fs.existsSync(path.join(importDir, 'raw/source/papers/references.bib')));
  assert.ok(fs.existsSync(path.join(importDir, 'raw/source/papers/package.zip')));
  assert.ok(fs.existsSync(path.join(importDir, 'raw/source/papers/rendered.pdf')));
  assert.ok(fs.existsSync(path.join(importDir, 'raw/source/audit/PROOF_FLOW_GRAPH.dot')));
  assert.ok(fs.existsSync(path.join(importDir, 'raw/source/audit/figure.png')));
  assert.ok(fs.existsSync(path.join(importDir, 'raw/source/audit/PROOF_FLOW_GRAPH.svg')));
  assert.ok(fs.existsSync(path.join(importDir, 'raw/source/md-os/schemas/audit.schema.json')));
  assert.ok(fs.existsSync(path.join(importDir, 'raw/source/mcp/ops/artifacts/packages/paper_release.zip')));

  const byPath = new Map(inventory.files.map((file) => [file.relative_path, file]));
  assert.equal(byPath.get('papers/main.tex').text_available, true);
  assert.equal(byPath.get('audit/PROOF_FLOW_GRAPH.svg').text_available, true);
  assert.equal(inventory.files.some((file) => file.relative_path.startsWith('mcp/ops/artifacts/')), false);
  assert.ok(inventory.skipped.some((item) => item.path === 'mcp/ops/artifacts' && item.reason === 'generated_or_local_runtime_directory'));
  const svgClassification = classification.files.find((file) => file.source_file === 'audit/PROOF_FLOW_GRAPH.svg');
  assert.equal(svgClassification.semantic_layer, 'structured_contract');
  assert.ok(extraction.extracts.some((item) => item.source_file === 'papers/main.tex'));
  assert.ok(extraction.extracts.some((item) => item.source_file === 'audit/PROOF_FLOW_GRAPH.svg'));
});

test('knowledge import extracts a deterministic identity patch from an MD-OS release source', () => {
  const workspace = makeWorkspace();
  const source = makeSource();
  writeFile(path.join(workspace, 'md-os/ops/semantic_knowledge_summary.json'), JSON.stringify({
    schema_version: 1,
    top_concepts: [{ term: 'identity', node_count: 2 }, { term: 'bootstrap', node_count: 2 }],
  }));
  writeFile(path.join(source, 'AGENTS.md'), [
    'Stable repository purpose:',
    '- implement MD-OS (Artificial Prefrontal Cortex) v5.0 as the release line carrying Example Imported Persona',
    '',
  ].join('\n'));
  writeFile(path.join(source, 'ME.md'), [
    '# Example Imported Persona',
    '',
    '```text',
    'identity_name = Example Imported Persona',
    'identity_version = 5.0',
    'system_family = MD-OS',
    'repository_release_line = 5.0',
    '```',
    '',
  ].join('\n'));
  writeFile(path.join(source, 'md-os/kb/COGNITIVE_BOOTSTRAP.md'), [
    '# Cognitive Bootstrap',
    '',
    'Example Imported Persona = unified primary agent identity and operating context carried by this repository',
    '',
  ].join('\n'));
  writeFile(path.join(source, 'md-os/kb/AGENTIC_OPERATIONAL_RELEASE_MODEL.md'), [
    '# Agentic Operational Release Model',
    '',
    '```json',
    JSON.stringify({
      unified_identity: 'Example Imported Persona',
      identity_name: 'Example Imported Persona',
      identity_version: '5.0',
      system_family: 'MD-OS',
      repository_release_line: '5.0',
      release_label: '5.0',
      release_semver: '5.0.0',
      release_version: '5.0',
      release_id: '5_0',
      release_name: 'Example Imported Persona',
      identity_short_name: 'Example Imported Persona',
      identity_id: 'example_imported_persona',
      current_operating_boundary: 'md-os/',
      host_runtime_role: 'execution_layer',
    }, null, 2),
    '```',
    '',
  ].join('\n'));
  writeJson(path.join(source, 'package.json'), {
    name: 'md-os-example-imported-persona',
    version: '5.0.0',
  });
  writeJson(path.join(source, 'md-os/ops/releases/self_release_index.json'), {
    schema_version: 1,
    current_release: {
      system_family: 'MD-OS',
      unified_identity: 'Example Imported Persona',
      identity_name: 'Example Imported Persona',
      identity_version: '5.0',
      repository_release_line: '5.0',
      release_label: '5.0',
      release_semver: '5.0.0',
      release_version: '5.0',
      release_id: '5_0',
      release_name: 'Example Imported Persona',
      identity_short_name: 'Example Imported Persona',
      identity_id: 'example_imported_persona',
      active_boundary: 'md-os/',
      host_runtime_role: 'execution_layer',
    },
  });
  writeJson(path.join(source, 'md-os/ops/core/agentic_core.json'), {
    schema_version: 1,
    core: {
      identity: {
        name: 'Example Imported Persona',
        primary_identity: 'unified_persistent_agent_operating_identity',
        host_runtime_role: 'execution_layer',
        first_person_rule: 'I means Example Imported Persona as imported operating identity.',
      },
      release_identity: {
        unified_identity: 'Example Imported Persona',
        identity_name: 'Example Imported Persona',
        identity_version: '5.0',
        release_semver: '5.0.0',
        current_operating_boundary: 'md-os/',
      },
      mission: 'Operate as a bounded imported identity frame.',
      non_claims: ['Not literal personhood.', 'Not AGI.'],
      limits: ['Imported claims require review.'],
      ethics: ['Preserve provenance.'],
    },
  });

  const result = runScript(workspace, 'build_knowledge_import.js', ['imported_persona_release', source]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.identity_patch_status, 'requires_review');
  assert.equal(payload.imported_identity_name, 'Example Imported Persona');

  const importDir = path.join(workspace, 'md-os/ops/imports/knowledge/imported_persona_release');
  const manifest = JSON.parse(fs.readFileSync(path.join(importDir, 'manifest.json'), 'utf8'));
  const identityPatch = JSON.parse(fs.readFileSync(path.join(importDir, 'identity_patch.json'), 'utf8'));
  const promotion = JSON.parse(fs.readFileSync(path.join(importDir, 'promotion_plan.json'), 'utf8'));
  const questions = JSON.parse(fs.readFileSync(path.join(importDir, 'questions.json'), 'utf8'));
  const readback = JSON.parse(fs.readFileSync(path.join(importDir, 'readback.json'), 'utf8'));

  assert.equal(manifest.source_kind, 'md_os_release');
  assert.equal(manifest.identity_patch_status, 'requires_review');
  assert.equal(identityPatch.source_detection.source_is_mdos_release, true);
  assert.equal(identityPatch.target_identity.identity_name, 'Example Imported Persona');
  assert.equal(identityPatch.target_identity.package_semver, '5.0.0');
  assert.equal(identityPatch.bootstrap_patch_rule.direct_write_default, false);
  assert.ok(identityPatch.bootstrap_patch_rule.patch_targets.some((target) => target.target_path === 'bootstrap-md-os-codex.sh'));
  assert.ok(identityPatch.bootstrap_patch_rule.patch_targets.some((target) => target.target_path === 'md-os/kb/COGNITIVE_BOOTSTRAP.md'));
  assert.equal(promotion.identity_patch.status, 'requires_review');
  assert.equal(promotion.candidates[0].source_file, 'identity_patch.json');
  assert.ok(questions.questions.some((question) => question.includes('Example Imported Persona')));
  assert.equal(readback.imported_mdos_release, true);
  assert.equal(readback.imported_identity_name, 'Example Imported Persona');
  assert.ok(fs.existsSync(path.join(importDir, 'identity_patch.md')));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/kb/imports/imported_persona_release/IDENTITY_FRAME.md')));
});

test('knowledge import extracts identity from a legacy mcp-boundary MD-OS source', () => {
  const workspace = makeWorkspace();
  const source = makeSource();

  writeFile(path.join(source, 'AGENTS.md'), 'Albert Legacy answers first.\n');
  writeFile(path.join(source, 'ME.md'), [
    '# Albert Legacy',
    '',
    'I am Albert Legacy as the persistent imported operating identity.',
    '',
  ].join('\n'));
  writeFile(path.join(source, 'mcp/kb/COGNITIVE_BOOTSTRAP.md'), [
    '# Cognitive Bootstrap',
    '',
    '```text',
    'Albert Legacy = primary agent identity carried by this repository',
    'mcp/ = active operational boundary',
    'MD-OS = Operating Filesystem substrate',
    '```',
    '',
  ].join('\n'));
  writeJson(path.join(source, 'mcp/ops/core/agentic_core.json'), {
    schema_version: 1,
    core: {
      identity: {
        name: 'Albert Legacy',
        primary_identity: 'persistent_agent_operating_identity',
        host_runtime_role: 'execution_layer',
        first_person_rule: 'I means Albert Legacy as an imported operating identity.',
      },
      mission: 'Preserve a legacy MD-OS identity frame.',
      non_claims: ['Not literal personhood.', 'Not AGI.'],
    },
  });
  writeJson(path.join(source, 'package.json'), {
    name: 'md-os-legacy-source',
    version: '0.1.0',
  });
  writeFile(path.join(source, 'mcp/kb/NOTE.md'), '# Legacy Note\n\nKnowledge source material.\n');
  writeFile(path.join(source, 'mcp/ops/artifacts/generated.txt'), 'generated runtime output\n');
  writeFile(path.join(source, 'dev/unsafe/bootstrap.sh'), 'echo unsafe\n');

  const result = runScript(workspace, 'build_knowledge_import.js', ['legacy_albert', source]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.identity_patch_status, 'requires_review');
  assert.equal(payload.imported_identity_name, 'Albert Legacy');

  const importDir = path.join(workspace, 'md-os/ops/imports/knowledge/legacy_albert');
  const inventory = JSON.parse(fs.readFileSync(path.join(importDir, 'inventory.json'), 'utf8'));
  const identityPatch = JSON.parse(fs.readFileSync(path.join(importDir, 'identity_patch.json'), 'utf8'));

  assert.equal(identityPatch.source_detection.source_is_mdos_release, true);
  assert.equal(identityPatch.source_detection.source_boundary, 'mcp/');
  assert.equal(identityPatch.source_detection.boundary_migration, 'legacy_mcp_to_md_os_import');
  assert.equal(identityPatch.target_identity.identity_name, 'Albert Legacy');
  assert.equal(identityPatch.target_identity.source_active_boundary, 'mcp/');
  assert.equal(identityPatch.target_identity.active_boundary, 'md-os/');
  assert.ok(identityPatch.source_evidence.some((item) => item.path === 'mcp/kb/COGNITIVE_BOOTSTRAP.md'));
  assert.ok(inventory.files.some((file) => file.relative_path === 'mcp/kb/NOTE.md'));
  assert.equal(inventory.files.some((file) => file.relative_path.startsWith('mcp/ops/artifacts/')), false);
  assert.ok(inventory.skipped.some((item) => item.path === 'mcp/ops/artifacts' && item.reason === 'generated_or_local_runtime_directory'));
  assert.ok(inventory.skipped.some((item) => item.path === 'dev/unsafe' && item.reason === 'ignored_directory'));
  assert.equal(inventory.files.some((file) => file.relative_path.startsWith('dev/unsafe/')), false);
});

test('initial repository knowledge import assimilates identity and source tree deterministically', () => {
  const workspace = makeWorkspace();
  const source = makeSource();
  writeFile(path.join(workspace, 'ME.md'), [
    '# MD-OS APFC',
    '',
    '```text',
    'identity_name = MD-OS APFC',
    'identity_version = 5.0',
    'system_family = MD-OS',
    'repository_release_line = 5.0',
    '```',
    '',
  ].join('\n'));
  writeFile(path.join(workspace, 'AGENTS.md'), 'MD-OS APFC answers first. identity_version = 5.0\n');
  writeFile(path.join(workspace, 'README.md'), '# MD-OS APFC\n\nidentity_version = 5.0\n');
  writeFile(path.join(workspace, 'bootstrap-md-os-codex.sh'), 'echo "Boot manifest: MD-OS APFC | identity_version 5.0"\n');
  writeFile(path.join(workspace, 'md-os/kb/COGNITIVE_BOOTSTRAP.md'), 'MD-OS APFC = unified primary agent identity\nidentity_version = 5.0\n');
  writeFile(path.join(workspace, 'md-os/kb/AGENTIC_CORE_MODEL.md'), 'MD-OS APFC 5.0 release_semver 5.0.0 identity_id md_os_apfc\n');
  writeFile(path.join(workspace, 'md-os/kb/AGENTIC_OPERATIONAL_RELEASE_MODEL.md'), [
    '# Agentic Operational Release Model',
    '',
    '{"unified_identity":"MD-OS APFC","identity_name":"MD-OS APFC","identity_version":"5.0","release_version":"5.0","release_id":"5_0","release_name":"MD-OS APFC","identity_short_name":"MD-OS APFC","identity_id":"md_os_apfc"}',
    '',
  ].join('\n'));
  writeFile(path.join(workspace, 'md-os/kb/RELEASE_VERSION_NAMING_MODEL.md'), 'MD-OS APFC identity_version 5.0 identity_id md_os_apfc\n');
  writeJson(path.join(workspace, 'package.json'), { name: 'md-os-test-target', version: '5.0.0' });

  writeFile(path.join(source, 'AGENTS.md'), 'Example Initial Persona answers first.\n');
  writeFile(path.join(source, 'ME.md'), [
    '# Example Initial Persona',
    '',
    '```text',
    'identity_name = Example Initial Persona',
    'identity_version = 5.0',
    'system_family = MD-OS',
    'repository_release_line = 5.0',
    '```',
    '',
  ].join('\n'));
  writeFile(path.join(source, 'md-os/kb/COGNITIVE_BOOTSTRAP.md'), 'Example Initial Persona = unified primary agent identity\n');
  writeFile(path.join(source, 'md-os/kb/AGENTIC_OPERATIONAL_RELEASE_MODEL.md'), [
    '# Agentic Operational Release Model',
    '',
    '```json',
    JSON.stringify({
      unified_identity: 'Example Initial Persona',
      identity_name: 'Example Initial Persona',
      identity_version: '5.0',
      system_family: 'MD-OS',
      repository_release_line: '5.0',
      release_semver: '5.0.0',
      release_version: '5.0',
      release_id: '5_0',
      release_name: 'Example Initial Persona',
      identity_short_name: 'Example Initial Persona',
      identity_id: 'example_initial_persona',
      current_operating_boundary: 'md-os/',
      host_runtime_role: 'execution_layer',
    }, null, 2),
    '```',
    '',
  ].join('\n'));
  writeFile(path.join(source, 'md-os/kb/IMPORTED_METHOD.md'), '# Imported Method\n\nA structured imported method.\n');
  writeJson(path.join(source, 'md-os/schemas/imported.schema.json'), {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Imported Schema',
    type: 'object',
  });
  writeFile(path.join(source, 'md-os/examples/programs/imported_example.md'), '# Imported Example\n');
  writeFile(path.join(source, 'md-os/ops/programs/imported_program.md'), '# Imported Program\n\nDo one bounded thing.\n');
  writeJson(path.join(source, 'md-os/ops/projects/imported_project/project.json'), {
    schema_version: 1,
    project_id: 'imported_project',
    title: 'Imported Project',
  });
  writeJson(path.join(source, 'md-os/ops/projects/imported_project/status.json'), {
    generated: true,
  });
  writeJson(path.join(source, 'md-os/ops/connectors/imported_connector.json'), {
    schema_version: 1,
    connector_id: 'imported_connector',
  });
  writeJson(path.join(source, 'md-os/ops/connectors/connector_registry.json'), {
    schema_version: 1,
    connectors: [{ connector_id: 'imported_connector' }],
  });
  writeJson(path.join(source, 'md-os/ops/policies/imported_policy.json'), {
    schema_version: 1,
    policy_id: 'imported_policy',
  });
  writeFile(path.join(source, 'md-os/ops/roles/support/ROLE.md'), '# Support Role\n');
  writeJson(path.join(source, 'md-os/ops/roles/support/intake/raw/case.json'), {
    case_id: 'case_1',
  });
  writeJson(path.join(source, 'md-os/ops/roles/support/intake/entities.json'), {
    generated: true,
  });
  writeJson(path.join(source, 'md-os/ops/sources/manual/imported_signal.json'), {
    schema_version: 1,
    source_id: 'imported_signal',
  });
  writeJson(path.join(source, 'md-os/ops/evals/imported_eval.json'), {
    schema_version: 1,
    eval_id: 'imported_eval',
  });
  writeJson(path.join(source, 'md-os/ops/actions/imported_action.json'), {
    schema_version: 1,
    action_id: 'imported_action',
  });
  writeJson(path.join(source, 'md-os/ops/processes/imported_process.json'), {
    schema_version: 1,
    process_id: 'imported_process',
  });
  writeJson(path.join(source, 'md-os/ops/releases/self/proposals/imported_release.json'), {
    schema_version: 1,
    release_id: 'imported_release',
  });
  writeJson(path.join(source, 'md-os/ops/local/software/applications.json'), {
    local: true,
  });
  writeFile(path.join(source, 'md-os/ops/artifacts/imported_artifact.txt'), 'artifact\n');
  writeJson(path.join(source, 'md-os/ops/releases/self_release_index.json'), {
    schema_version: 1,
    current_release: {
      system_family: 'MD-OS',
      unified_identity: 'Example Initial Persona',
      identity_name: 'Example Initial Persona',
      identity_version: '5.0',
      repository_release_line: '5.0',
      release_semver: '5.0.0',
      release_version: '5.0',
      release_id: '5_0',
      release_name: 'Example Initial Persona',
      identity_short_name: 'Example Initial Persona',
      identity_id: 'example_initial_persona',
      active_boundary: 'md-os/',
      host_runtime_role: 'execution_layer',
    },
  });

  const result = runScript(workspace, 'build_knowledge_import.js', ['initial_persona', source, '--initial-repository']);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.import_mode, 'initial_repository');
  assert.equal(payload.initial_repository_status, 'applied');
  assert.equal(payload.imported_identity_name, 'Example Initial Persona');
  assert.match(fs.readFileSync(path.join(workspace, 'ME.md'), 'utf8'), /Example Initial Persona/);
  assert.match(fs.readFileSync(path.join(workspace, 'AGENTS.md'), 'utf8'), /Example Initial Persona/);
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/kb/IMPORTED_METHOD.md')));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/schemas/imported.schema.json')));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/examples/programs/imported_example.md')));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/programs/imported_program.md')));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/projects/imported_project/project.json')));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/connectors/imported_connector.json')));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/connectors/connector_registry.json')));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/policies/imported_policy.json')));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/roles/support/ROLE.md')));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/roles/support/intake/raw/case.json')));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/sources/manual/imported_signal.json')));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/evals/imported_eval.json')));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/actions/imported_action.json')));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/processes/imported_process.json')));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/releases/self/proposals/imported_release.json')));
  assert.equal(fs.existsSync(path.join(workspace, 'md-os/ops/projects/imported_project/status.json')), false);
  assert.equal(fs.existsSync(path.join(workspace, 'md-os/ops/roles/support/intake/entities.json')), false);
  assert.equal(fs.existsSync(path.join(workspace, 'md-os/ops/local/software/applications.json')), false);
  assert.equal(fs.existsSync(path.join(workspace, 'md-os/ops/artifacts/imported_artifact.txt')), false);
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/kb/imports/initial_persona/OPERATING_BINDING.md')));
  const binding = fs.readFileSync(path.join(workspace, 'md-os/kb/imports/initial_persona/OPERATING_BINDING.md'), 'utf8');
  assert.match(binding, /Operational Application Layer/);
  assert.match(binding, /md-os\/ops\/calculations\//);
});

test('cortex knowledge import routes through the single import builder', () => {
  const workspace = makeWorkspace();
  const source = makeSource();
  writeFile(path.join(source, 'README.md'), '# Operational Runbook\n\nA workflow procedure updates a task.\n');

  const result = runMdos(workspace, ['knowledge', 'import', 'runbook_notes', source]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.mode, 'build_knowledge_import');
  assert.equal(payload.import_id, 'runbook_notes');
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/imports/knowledge/runbook_notes/readback.md')));
});
