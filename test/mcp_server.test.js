#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');
const HAS_PANDOC = spawnSync('pandoc', ['--version'], { encoding: 'utf8' }).status === 0;

function makeWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-mcp-server-'));
  fs.mkdirSync(path.join(workspace, 'md-os/ops'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os/ops/state.json'), JSON.stringify({
    schema_version: 1,
    mode: 'healthy',
    boundary: 'md-os',
    architecture: 'text_native_natural_language_agentic_os',
  }, null, 2), 'utf8');
  return workspace;
}

function startServer(workspace) {
  const child = spawn(process.execPath, [path.join(REPO_ROOT, 'md-os/os/mcp_server.js')], {
    cwd: workspace,
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspace,
      MDOS_ROOT: path.join(workspace, 'md-os'),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const pending = new Map();
  let stdoutBuffer = '';
  let stderrBuffer = '';

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString('utf8');
    while (stdoutBuffer.includes('\n')) {
      const index = stdoutBuffer.indexOf('\n');
      const line = stdoutBuffer.slice(0, index).trim();
      stdoutBuffer = stdoutBuffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        waiter.resolve(message);
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    stderrBuffer += chunk.toString('utf8');
  });

  function request(method, params = {}) {
    const id = pending.size + 1 + Date.now();
    const payload = { jsonrpc: '2.0', id, method, params };
    child.stdin.write(`${JSON.stringify(payload)}\n`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP_RESPONSE_TIMEOUT: ${method}\n${stderrBuffer}`));
      }, 5000);
      pending.set(id, {
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
      });
    });
  }

  function close() {
    child.stdin.end();
    child.kill();
  }

  return { child, close, request };
}

test('MCP server exposes initialize, resources, and tools over stdio JSON-RPC', async () => {
  const workspace = makeWorkspace();
  const server = startServer(workspace);
  try {
    const initialized = await server.request('initialize', {
      protocolVersion: '2025-06-18',
      clientInfo: { name: 'mdos-test', version: '0.0.0' },
      capabilities: {},
    });
    assert.equal(initialized.error, undefined);
    assert.equal(initialized.result.serverInfo.name, 'md-os-apfc');
    assert.equal(initialized.result.protocolVersion, '2025-06-18');
    assert.deepEqual(Object.keys(initialized.result.capabilities).sort(), ['resources', 'tools']);

    const resources = await server.request('resources/list');
    assert.equal(resources.error, undefined);
    assert.ok(resources.result.resources.some((item) => item.uri === 'mdos://ops/state'));

    const state = await server.request('resources/read', { uri: 'mdos://ops/state' });
    assert.equal(state.error, undefined);
    assert.equal(state.result.contents[0].mimeType, 'application/json');
    assert.match(state.result.contents[0].text, /text_native_natural_language_agentic_os/);

    const tools = await server.request('tools/list');
    assert.equal(tools.error, undefined);
    const toolNames = tools.result.tools.map((item) => item.name);
    assert.ok(toolNames.includes('mdos_replay'));
    assert.ok(toolNames.includes('mdos_compile_programs'));
    assert.ok(toolNames.includes('mdos_archive_runtime_state'));
    assert.ok(toolNames.includes('mdos_hardware_bootstrap'));
    assert.ok(toolNames.includes('mdos_hardware_clean'));
    assert.ok(toolNames.includes('mdos_hardware_control'));
    assert.ok(toolNames.includes('mdos_software_bootstrap'));
    assert.ok(toolNames.includes('mdos_software_clean'));
    assert.ok(toolNames.includes('mdos_continuity_status'));
    assert.ok(toolNames.includes('mdos_continuity_start'));
    assert.ok(toolNames.includes('mdos_continuity_stop'));
    assert.ok(toolNames.includes('mdos_propose_change'));
    assert.ok(toolNames.includes('mdos_register_signal'));
    assert.ok(toolNames.includes('mdos_api_run'));
    assert.ok(toolNames.includes('mdos_wolfram_bootstrap'));
    assert.ok(toolNames.includes('mdos_wolfram_run'));
  } finally {
    server.close();
  }
});

test('MCP Apps visual editor opens and updates one authoritative live document', {
  skip: !HAS_PANDOC,
}, async () => {
  const workspace = makeWorkspace();
  const server = startServer(workspace);
  try {
    const resources = await server.request('resources/list');
    const editorResource = resources.result.resources.find(
      (item) => item.uri === 'ui://mdos/document-editor/v1.html'
    );
    assert.ok(editorResource);
    assert.equal(editorResource.mimeType, 'text/html;profile=mcp-app');
    assert.equal(editorResource._meta.ui.prefersBorder, false);

    const editor = await server.request('resources/read', {
      uri: 'ui://mdos/document-editor/v1.html',
    });
    assert.equal(editor.error, undefined);
    assert.match(editor.result.contents[0].text, /requestDisplayMode/);
    assert.match(editor.result.contents[0].text, /addEventListener\('paste'/);
    assert.match(editor.result.contents[0].text, /contentEditable = 'true'/);
    assert.match(editor.result.contents[0].text, /id="add-whiteboard"/);
    assert.match(editor.result.contents[0].text, />Whiteboard<\/button>/);
    assert.match(editor.result.contents[0].text, /whiteboard_append_stroke/);

    const tools = await server.request('tools/list');
    const documentTools = tools.result.tools.filter(
      (item) => item.name.startsWith('mdos_document_')
    );
    assert.deepEqual(
      documentTools.map((item) => item.name),
      [
        'mdos_document_open',
        'mdos_document_create',
        'mdos_document_read',
        'mdos_document_save',
        'mdos_document_apply',
        'mdos_document_render_math',
        'mdos_document_export',
      ]
    );
    const openDescriptor = documentTools.find((item) => item.name === 'mdos_document_open');
    assert.equal(openDescriptor._meta.ui.resourceUri, 'ui://mdos/document-editor/v1.html');
    assert.equal(openDescriptor.annotations.openWorldHint, false);
    const applyDescriptor = documentTools.find((item) => item.name === 'mdos_document_apply');
    assert.ok(applyDescriptor.inputSchema.properties.expected_revision);
    assert.ok(!applyDescriptor.inputSchema.required.includes('expected_revision'));

    const created = await server.request('tools/call', {
      name: 'mdos_document_create',
      arguments: { document_id: 'live_notes', title: 'Live notes' },
    });
    assert.equal(created.error, undefined);
    assert.equal(created.result.structuredContent.document.revision, 0);
    assert.equal(
      created.result._meta.ui.resourceUri,
      'ui://mdos/document-editor/v1.html'
    );

    const saved = await server.request('tools/call', {
      name: 'mdos_document_save',
      arguments: {
        document_id: 'live_notes',
        expected_revision: 0,
        title: 'Live notes',
        blocks: [
          { type: 'rich', html: '<h1>Visual</h1><p>Formatted <strong>text</strong>.</p>' },
          { type: 'formula', latex: '\\frac{a}{b}', display: true },
          {
            type: 'table',
            html: '<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>',
          },
          { type: 'whiteboard', strokes: [] },
        ],
      },
    });
    assert.equal(saved.error, undefined);
    assert.equal(saved.result.structuredContent.document.revision, 1);
    assert.match(saved.result.structuredContent.document.blocks[1].mathml, /<math\b/);

    const applied = await server.request('tools/call', {
      name: 'mdos_document_apply',
      arguments: {
        document_id: 'live_notes',
        expected_revision: 1,
        operations: [{ type: 'set_title', title: 'Edited with the assistant' }],
      },
    });
    assert.equal(applied.error, undefined);
    assert.equal(applied.result.structuredContent.document.revision, 2);
    assert.equal(applied.result.structuredContent.document.title, 'Edited with the assistant');

    const whiteboardId = saved.result.structuredContent.document.blocks[3].id;
    const sharedStroke = await server.request('tools/call', {
      name: 'mdos_document_apply',
      arguments: {
        document_id: 'live_notes',
        operations: [{
          type: 'whiteboard_append_stroke',
          block_id: whiteboardId,
          stroke: {
            id: 's_dddddddddddddddd',
            tool: 'pen',
            color: '#202124',
            points: [{ x: 10, y: 20, width: 5 }],
          },
        }, {
          type: 'whiteboard_resize',
          block_id: whiteboardId,
          height_px: 1600,
        }],
      },
    });
    assert.equal(sharedStroke.error, undefined);
    assert.equal(sharedStroke.result.structuredContent.document.revision, 3);
    assert.equal(
      sharedStroke.result.structuredContent.document.blocks[3].strokes[0].id,
      's_dddddddddddddddd',
    );
    assert.equal(sharedStroke.result.structuredContent.document.blocks[3].height_px, 1600);

    const read = await server.request('tools/call', {
      name: 'mdos_document_read',
      arguments: { document_id: 'live_notes' },
    });
    assert.equal(read.error, undefined);
    assert.equal(read.result.structuredContent.document.revision, 3);

    const math = await server.request('tools/call', {
      name: 'mdos_document_render_math',
      arguments: { latex: '\\int_0^1 x^2 \\, dx', display: true },
    });
    assert.equal(math.error, undefined);
    assert.match(math.result.structuredContent.math.mathml, /<math\b/);

    const exported = await server.request('tools/call', {
      name: 'mdos_document_export',
      arguments: { document_id: 'live_notes', format: 'html' },
    });
    assert.equal(exported.error, undefined);
    assert.equal(exported.result.structuredContent.export.format, 'html');
    assert.ok(fs.existsSync(path.join(
      workspace,
      exported.result.structuredContent.export.path
    )));

    const stale = await server.request('tools/call', {
      name: 'mdos_document_save',
      arguments: {
        document_id: 'live_notes',
        expected_revision: 1,
        blocks: read.result.structuredContent.document.blocks,
      },
    });
    assert.match(stale.error.message, /DOCUMENT_REVISION_CONFLICT/);
  } finally {
    server.close();
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
