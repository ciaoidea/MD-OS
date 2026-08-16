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
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-graphify-'));
  fs.mkdirSync(path.join(workspace, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'md-os/ops/connectors'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'docs/a.md'), '# A\n\n[Next](b.md)\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'docs/b.md'), '# B\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({
    scripts: {
      'graphify:connectors': 'node md-os/os/mdos.js graphify connector-map',
      'graphify:neural': 'node md-os/os/mdos.js graphify neural-map',
      'graphify:orient': 'node md-os/os/mdos.js graphify orient',
      'connector:adeept-arm:status': 'node md-os/os/mdos.js connector adeept-arm status',
      'connector:vector:speak': 'node md-os/os/mdos.js connector vector speak',
      'connector:wolfram:list': 'node md-os/os/mdos.js connector wolfram list',
      'audio:speak': 'node md-os/os/mdos.js audio speak',
      'screen:capture': 'node md-os/os/mdos.js screen capture',
    },
  }, null, 2), 'utf8');
  for (const relativePath of [
    'md-os/os/adeept_arm_connector.js',
    'md-os/os/aferiy_power_connector.js',
    'md-os/os/api_connector.js',
    'md-os/os/filesystem_connector.js',
    'md-os/os/graphify_connector.js',
    'md-os/os/hardware_bootstrap.js',
    'md-os/os/hardware_control.js',
    'md-os/os/lg_webos_tv_connector.js',
    'md-os/os/live_vision_pipeline.js',
    'md-os/os/register_manual_signal.js',
    'md-os/os/robot_mock_connector.js',
    'md-os/os/software_bootstrap.js',
    'md-os/os/terminal_connector.js',
    'md-os/os/ticketing_connector.js',
    'md-os/os/vector_connector.js',
    'md-os/os/wolfram_connector.js',
    'md-os/os/build_markdown_graph.js',
    'md-os/os/build_semantic_knowledge_graph.js',
    'md-os/os/build_neural_node_map.js',
    'md-os/os/build_connector_topology_map.js',
    'md-os/schemas/connector.schema.json',
    'md-os/schemas/hardware_snapshot.schema.json',
    'md-os/schemas/wolfram_calculation.schema.json',
    'md-os/examples/connectors/graphify_connector.json',
    'md-os/examples/connectors/wolfram_connector.json',
    'test/adeept_arm_connector.test.js',
    'test/api_connector.test.js',
    'test/graphify_connector.test.js',
    'test/hardware_control.test.js',
    'test/neural_node_map.test.js',
    'test/new_connectors.test.js',
    'test/terminal_connector.test.js',
    'test/vector_connector.test.js',
    'test/wolfram_connector.test.js',
  ]) {
    const target = path.join(workspace, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '// placeholder\n', 'utf8');
  }
  return workspace;
}

function runGraphifyConnector(workspace, args, extraEnv = {}) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os/graphify_connector.js'), ...args], {
    cwd: workspace,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspace,
      MDOS_ROOT: path.join(workspace, 'md-os'),
      MDOS_ALLOW_DIRECT_DRIVER: '1',
      ...extraEnv,
    },
  });
}

function writeFakeGraphify(workspace) {
  const fakeBin = path.join(workspace, 'fakebin');
  fs.mkdirSync(fakeBin, { recursive: true });
  const fakeGraphify = path.join(fakeBin, 'graphify');
  fs.writeFileSync(fakeGraphify, [
    `#!${process.execPath}`,
    "'use strict';",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const args = process.argv.slice(2);",
    "if (args[0] === 'query') {",
    "  console.log(`query:${args[1]}`);",
    "  process.exit(0);",
    "}",
    "if (args[0] === 'benchmark') {",
    "  console.log('Reduction: 99.0x fewer tokens per query');",
    "  process.exit(0);",
    "}",
    "if (args[0] === 'path') {",
    "  console.log(`path:${args[1]}->${args[2]}`);",
    "  process.exit(0);",
    "}",
    "if (args[0] === 'explain') {",
    "  console.log(`explain:${args[1]}`);",
    "  process.exit(0);",
    "}",
    "if (args[0] === 'tree') {",
    "  const output = args[args.indexOf('--output') + 1];",
    "  fs.mkdirSync(path.dirname(path.join(process.cwd(), output)), { recursive: true });",
    "  fs.writeFileSync(path.join(process.cwd(), output), '<!doctype html><title>Graphify Tree</title>');",
    "  console.log(`tree:${output}`);",
    "  process.exit(0);",
    "}",
    "if (args[0] === 'update') {",
    "  const target = args[1] || '.';",
    "  const outputDir = path.join(process.cwd(), target, 'graphify-out');",
    "  fs.mkdirSync(outputDir, { recursive: true });",
    "  fs.writeFileSync(path.join(outputDir, 'graph.json'), JSON.stringify({ nodes: [{ id: 'a', community: 1 }], edges: [], target, args }, null, 2));",
    "  fs.writeFileSync(path.join(outputDir, 'GRAPH_REPORT.md'), '# Graph Report\\n');",
    "  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify({ target }, null, 2));",
    "  console.log(`updated:${target}`);",
    "  process.exit(0);",
    "}",
    "console.error(`unexpected:${args.join(' ')}`);",
    "process.exit(2);",
    "",
  ].join('\n'), 'utf8');
  fs.chmodSync(fakeGraphify, 0o755);
  return fakeBin;
}

test('graphify connector reports status without requiring an installed graphify binary', () => {
  const workspace = makeWorkspace();
  const result = runGraphifyConnector(workspace, ['status'], { PATH: '/bin:/usr/bin' });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'graphify_connector_status');
  assert.equal(payload.connector_id, 'graphify_connector');
  assert.equal(payload.direct_integration, true);
  assert.equal(payload.default_operational_surface, true);
  assert.equal(payload.dynamic_graph_evolution, true);
  assert.equal(payload.graph_html, 'graphify-out/graph.html');
  assert.equal(payload.connector_topology_html, 'graphify-out/connector_topology.html');
  assert.equal(payload.orientation_json, 'graphify-out/orientation.json');
  assert.equal(payload.orientation_md, 'graphify-out/orientation.md');
});

test('graphify connector bootstrap writes profile and registry entry', () => {
  const workspace = makeWorkspace();
  fs.writeFileSync(path.join(workspace, 'md-os/ops/connectors/connector_registry.json'), JSON.stringify({
    schema_version: 1,
    registry_name: 'generic_connector_registry',
    connectors: [],
  }, null, 2), 'utf8');

  const result = runGraphifyConnector(workspace, ['bootstrap'], { PATH: '/bin:/usr/bin' });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'graphify_connector_bootstrap');
  assert.equal(payload.profile_created, true);
  assert.equal(payload.registry_updated, true);
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/connectors/graphify_connector.json')));

  const registry = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/connectors/connector_registry.json'), 'utf8'));
  const graphify = registry.connectors.find((item) => item.connector_id === 'graphify_connector');
  assert.ok(graphify);
  assert.equal(graphify.status, 'default_operational');
  assert.ok(graphify.read_capabilities.includes('graphify_orientation_read'));
  assert.ok(graphify.read_capabilities.includes('graphify_dynamic_graph_read'));
  assert.ok(graphify.write_capabilities.includes('graphify_orientation_emit'));
  assert.ok(graphify.write_capabilities.includes('graphify_dynamic_graph_evolution_emit'));
});

test('graphify connector builds local graph outputs through the native no-LLM flow', () => {
  const workspace = makeWorkspace();
  const fakeBin = writeFakeGraphify(workspace);
  const result = runGraphifyConnector(workspace, ['build', 'docs', '--force'], {
    PATH: `${fakeBin}:/bin:/usr/bin`,
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'graphify_connector_build');
  assert.equal(payload.build_mode, 'local_update');
  assert.equal(payload.target, 'docs');
  assert.equal(payload.graph_json_exists, true);
  assert.equal(payload.graph_html_exists, true);
  assert.equal(payload.report_md_exists, true);
  assert.equal(payload.system_map_md_exists, true);
  assert.equal(payload.target_output_mirrored, true);

  const graph = JSON.parse(fs.readFileSync(path.join(workspace, 'graphify-out/graph.json'), 'utf8'));
  assert.equal(graph.target, 'docs');
  assert.deepEqual(graph.args, ['update', 'docs', '--force']);
  assert.ok(fs.existsSync(path.join(workspace, 'graphify-out/MD_OS_SYSTEM_MAP.md')));
});

test('graphify connector refuses continuous watch mode in the build path', () => {
  const workspace = makeWorkspace();
  const fakeBin = writeFakeGraphify(workspace);
  const result = runGraphifyConnector(workspace, ['build', 'docs', '--watch'], {
    PATH: `${fakeBin}:/bin:/usr/bin`,
  });

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.error, /GRAPHIFY_FLAG_REQUIRES_EXPLICIT_SEPARATE_FLOW/);
});

test('graphify connector queries an existing graph json', () => {
  const workspace = makeWorkspace();
  const fakeBin = writeFakeGraphify(workspace);
  const build = runGraphifyConnector(workspace, ['build', 'docs'], {
    PATH: `${fakeBin}:/bin:/usr/bin`,
  });
  assert.equal(build.status, 0, build.stderr);

  const query = runGraphifyConnector(workspace, ['query', 'what connects A to B'], {
    PATH: `${fakeBin}:/bin:/usr/bin`,
  });
  assert.equal(query.status, 0, query.stderr);
  const payload = JSON.parse(query.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'graphify_connector_query');
  assert.equal(payload.stdout, 'query:what connects A to B');
});

test('graphify connector benchmarks an existing graph json', () => {
  const workspace = makeWorkspace();
  const fakeBin = writeFakeGraphify(workspace);
  const build = runGraphifyConnector(workspace, ['build', 'docs', '--no-viz'], {
    PATH: `${fakeBin}:/bin:/usr/bin`,
  });
  assert.equal(build.status, 0, build.stderr);

  const result = runGraphifyConnector(workspace, ['benchmark'], {
    PATH: `${fakeBin}:/bin:/usr/bin`,
  });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'graphify_connector_benchmark');
  assert.match(payload.stdout, /fewer tokens/);
});

test('graphify connector emits the sanitized connector topology map', () => {
  const workspace = makeWorkspace();
  const result = runGraphifyConnector(workspace, ['connector-map'], { PATH: '/bin:/usr/bin' });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'graphify_connector_connector_topology');
  assert.equal(payload.output_json, 'graphify-out/connector_topology.json');
  assert.equal(payload.output_html_exists, true);

  const topology = JSON.parse(fs.readFileSync(path.join(workspace, 'graphify-out/connector_topology.json'), 'utf8'));
  assert.equal(topology.coverage.audio_io, true);
  assert.equal(topology.coverage.mathematics_wolfram, true);
});
