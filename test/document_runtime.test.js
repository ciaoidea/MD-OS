#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');
const HAS_PANDOC = spawnSync('pandoc', ['--version'], { encoding: 'utf8' }).status === 0;
const HAS_XELATEX = spawnSync('xelatex', ['--version'], { encoding: 'utf8' }).status === 0;

test('visual document schema and WYSIWYG widget have inspectable source contracts', () => {
  const schema = JSON.parse(fs.readFileSync(
    path.join(REPO_ROOT, 'md-os/schemas/visual_document.schema.json'),
    'utf8'
  ));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(
    new Set(schema.$defs.block.oneOf.map((entry) => entry.$ref)),
    new Set([
      '#/$defs/rich_block',
      '#/$defs/table_block',
      '#/$defs/formula_block',
      '#/$defs/image_block',
      '#/$defs/whiteboard_block',
    ])
  );
  assert.deepEqual(schema.$defs.whiteboard_block.required, ['id', 'type', 'height_px', 'strokes']);
  assert.equal(schema.$defs.whiteboard_block.properties.data_uri, undefined);

  const html = fs.readFileSync(
    path.join(REPO_ROOT, 'md-os/os/ui/document_editor.html'),
    'utf8'
  );
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Function(scripts[0][1]));
  assert.match(html, /requestDisplayMode\(\{ mode: 'fullscreen' \}\)/);
  assert.match(html, /contentEditable = 'true'/);
  assert.match(html, /addEventListener\('paste'/);
  assert.match(html, /mdos_document_save/);
  assert.match(html, /mdos_document_render_math/);
  assert.match(html, /mdos_document_export/);
  assert.match(html, /id="add-whiteboard"/);
  assert.match(html, /id="add-text"[^>]*aria-label="Text"[^>]*data-tone="blue"/);
  assert.match(html, /id="add-table"[^>]*aria-label="Table"[^>]*data-tone="green"/);
  assert.match(html, /id="add-formula"[^>]*aria-label="Formula"[^>]*data-tone="purple"/);
  assert.match(html, /id="add-image"[^>]*aria-label="Image"[^>]*data-tone="amber"/);
  assert.match(html, /id="add-whiteboard"[^>]*aria-label="Whiteboard"[^>]*data-tone="teal"/);
  assert.match(html, /id="delete-block"[^>]*aria-label="Delete block"[^>]*data-tone="red"/);
  assert.match(html, /id="export-pdf"[^>]*aria-label="Export PDF"[^>]*data-tone="red"/);
  assert.match(html, /\.toolbar-graphic \{[^}]*flex: 0 0 2rem;[^}]*width: 2rem;[^}]*padding: 0;/s);
  assert.match(html, /\.toolbar-icon \{[^}]*width: 1\.1rem;[^}]*height: 1\.1rem;/s);
  assert.equal((html.match(/class="(?:tool|action)[^"]*toolbar-graphic[^"]*"/g) || []).length, 12);
  assert.match(html, /\.tools \{[^}]*flex-wrap: wrap;[^}]*justify-content: flex-start;/s);
  assert.doesNotMatch(html, />Whiteboard<\/button>/);
  assert.match(html, /whiteboard_append_stroke/);
  assert.match(html, /\/api\/whiteboard-stream/);
  assert.match(html, /const WHITEBOARD_STREAM_INTERVAL_MS = 80;/);
  assert.match(html, /const WHITEBOARD_COMMIT_INTERVAL_MS = 250;/);
  assert.match(html, /const POLL_FALLBACK_INTERVAL_MS = 5000;/);
  assert.match(html, /operations: batch/);
  assert.match(html, /committedStrokes/);
  assert.match(html, /function createWhiteboardIcon\(name\)/);
  assert.match(html, /function createWhiteboardColorDot\(color\)/);
  assert.match(html, /button\.setAttribute\('aria-label', label\)/);
  assert.match(html, /createWhiteboardIcon\('pen'\)/);
  assert.match(html, /createWhiteboardIcon\('eraser'\)/);
  assert.match(html, /createWhiteboardColorDot\('#b42318'\)/);
  assert.match(html, /createWhiteboardIcon\('refresh'\)/);
  assert.match(html, /createWhiteboardIcon\('contractVertical'\)/);
  assert.match(html, /createWhiteboardIcon\('expandVertical'\)/);
  assert.match(html, /createWhiteboardIcon\('resetHeight'\)/);
  assert.match(html, /max-width: 1\.75rem;/);
  assert.match(html, /height: 1\.75rem;/);
  assert.match(html, /const WHITEBOARD_HEIGHT_DRAG_STEP = 50;/);
  assert.match(html, /id="whiteboard-toolbar"/);
  assert.match(html, /whiteboard-toolbar-row/);
  assert.match(html, /\.whiteboard-toolbar-row \{[^}]*display: flex;[^}]*flex-wrap: nowrap;[^}]*justify-content: flex-start;/s);
  assert.match(html, /flex: 0 1 1\.75rem;/);
  assert.match(html, /whiteboardControls\.append\(/);
  assert.match(html, /element\.whiteboardToolbarRows = \[whiteboardControls\]/);
  assert.match(html, /whiteboardToolbar\.replaceChildren\(\.\.\.rows\)/);
  assert.match(html, /element\.append\(canvas, resizeHandle\)/);
  assert.doesNotMatch(html, /element\.append\(toolbar, canvas, resizeHandle\)/);
  assert.doesNotMatch(html, /\.tools \{[^}]*flex-wrap: nowrap/s);
  assert.match(html, /whiteboard-resize-handle/);
  assert.match(html, /window\.addEventListener\('pointermove', moveWhiteboardResize/);
  assert.match(html, /window\.removeEventListener\('pointermove', moveWhiteboardResize\)/);
  assert.match(html, /resizeHandle\.setPointerCapture\?\.\(event\.pointerId\)/);
  assert.match(html, /if \(state\.heightPx !== startHeight\) queueWhiteboardHeight\(state\.heightPx\)/);
  assert.match(html, /whiteboard_resize/);
  assert.doesNotMatch(html, /Whiteboard not synced · retrying/);
  assert.doesNotMatch(html, /Sync unavailable · retrying in/);
  assert.match(html, /function insertionAnchorAt\(clientY\)/);
  assert.doesNotMatch(html, /toDataURL\(['"]image\/png/);
  assert.match(html, /addEventListener\('pointerdown'/);
  assert.match(html, /getCoalescedEvents/);
  assert.match(html, /const AUTOSAVE_INTERVAL_MS = 800;/);
  assert.match(html, /function nextSaveRetryDelay\(\)/);
  assert.match(html, /scheduleSave\(retryDelay\)/);
  assert.match(html, /events\.onopen = \(\) =>/);
  assert.match(html, /document\.hidden \|\| liveEventsConnected/);

  const baseMatch = html.match(/const SAVE_RETRY_BASE_MS = ([^;]+);/);
  const maxMatch = html.match(/const SAVE_RETRY_MAX_MS = ([^;]+);/);
  const policyMatch = html.match(/function nextSaveRetryDelay\(\) \{[\s\S]*?\n    \}/);
  assert.ok(baseMatch && maxMatch && policyMatch);
  const retryDelay = new Function('saveFailureCount', `
    const SAVE_RETRY_BASE_MS = ${baseMatch[1]};
    const SAVE_RETRY_MAX_MS = ${maxMatch[1]};
    ${policyMatch[0]}
    return nextSaveRetryDelay();
  `);
  assert.deepEqual(
    [1, 2, 3, 6, 20].map((failures) => retryDelay(failures)),
    [1000, 2000, 4000, 30000, 30000]
  );
});

test('visual document runtime sanitizes, versions, applies, and exports rich blocks', {
  skip: !HAS_PANDOC,
}, () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-document-runtime-test-'));
  process.env.MDOS_WORKSPACE_ROOT = workspace;
  process.env.MDOS_ROOT = path.join(workspace, 'md-os');
  const runtime = require('../md-os/os/document_runtime');
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  try {
    const created = runtime.createDocument({ document_id: 'visual_test', title: 'Visual test' });
    assert.equal(created.revision, 0);
    assert.equal(created.blocks.length, 1);

    const richId = runtime.newBlockId();
    const tableId = runtime.newBlockId();
    const formulaId = runtime.newBlockId();
    const imageId = runtime.newBlockId();
    const whiteboardId = runtime.newBlockId();
    const saved = runtime.saveDocument({
      document_id: created.document_id,
      expected_revision: created.revision,
      title: 'Rich document',
      blocks: [
        {
          id: richId,
          type: 'rich',
          html: '<h1 onclick="bad()">Heading</h1><p style="color:red;position:fixed">Text <strong>bold</strong><script>bad()</script></p><a href="javascript:bad()">bad</a>',
        },
        {
          id: tableId,
          type: 'table',
          html: '<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>',
        },
        { id: formulaId, type: 'formula', latex: 'E = mc^2', display: true },
        { id: imageId, type: 'image', data_uri: pixel, alt: 'one pixel', width_percent: 40 },
        { id: whiteboardId, type: 'whiteboard', strokes: [] },
      ],
    });

    assert.equal(saved.revision, 1);
    assert.deepEqual(saved.blocks.map((block) => block.type), ['rich', 'table', 'formula', 'image', 'whiteboard']);
    assert.match(saved.blocks[0].html, /<strong>bold<\/strong>/);
    assert.doesNotMatch(saved.blocks[0].html, /onclick|<script|position:|javascript:/i);
    assert.match(saved.blocks[2].mathml, /<math\b/);
    assert.equal(saved.blocks[3].width_percent, 40);
    assert.equal(saved.blocks[4].height_px, 1000);
    assert.deepEqual(saved.blocks[4].strokes, []);

    assert.throws(
      () => runtime.saveDocument({
        document_id: created.document_id,
        expected_revision: 0,
        blocks: saved.blocks,
      }),
      /DOCUMENT_REVISION_CONFLICT/
    );

    const insertedId = runtime.newBlockId();
    const applied = runtime.applyDocumentOperations({
      document_id: created.document_id,
      expected_revision: saved.revision,
      operations: [
        { type: 'set_title', title: 'Human and assistant' },
        {
          type: 'replace_block',
          block_id: richId,
          block: { type: 'rich', html: '<p>Replaced <em>live</em>.</p>' },
        },
        {
          type: 'insert_after',
          after_block_id: tableId,
          block: { id: insertedId, type: 'rich', html: '<p>Inserted by the assistant.</p>' },
        },
        { type: 'delete_block', block_id: imageId },
      ],
    });

    assert.equal(applied.revision, 2);
    assert.equal(applied.title, 'Human and assistant');
    assert.equal(applied.blocks.find((block) => block.id === richId).html, '<p>Replaced <em>live</em>.</p>');
    assert.ok(applied.blocks.some((block) => block.id === insertedId));
    assert.ok(!applied.blocks.some((block) => block.id === imageId));

    const strokeA = {
      id: 's_aaaaaaaaaaaaaaaa',
      tool: 'pen',
      color: '#202124',
      points: [
        { x: 10, y: 20, width: 5 },
        { x: 30, y: 40, width: 6 },
      ],
    };
    const strokeB = {
      id: 's_bbbbbbbbbbbbbbbb',
      tool: 'pen',
      color: '#1769e0',
      points: [
        { x: 80, y: 90, width: 4 },
        { x: 120, y: 130, width: 5 },
      ],
    };
    const sharedA = runtime.applyDocumentOperations({
      document_id: created.document_id,
      operations: [{
        type: 'whiteboard_append_stroke',
        block_id: whiteboardId,
        stroke: strokeA,
      }],
    });
    const sharedB = runtime.applyDocumentOperations({
      document_id: created.document_id,
      operations: [{
        type: 'whiteboard_append_stroke',
        block_id: whiteboardId,
        stroke: strokeB,
      }],
    });
    assert.equal(sharedA.revision, 3);
    assert.equal(sharedB.revision, 4);
    assert.deepEqual(
      sharedB.blocks.find((block) => block.id === whiteboardId).strokes.map((stroke) => stroke.id),
      [strokeA.id, strokeB.id],
    );

    const resized = runtime.applyDocumentOperations({
      document_id: created.document_id,
      operations: [{
        type: 'whiteboard_resize',
        block_id: whiteboardId,
        height_px: 1800,
      }],
    });
    assert.equal(resized.blocks.find((block) => block.id === whiteboardId).height_px, 1800);

    const htmlExport = runtime.exportDocument({ document_id: created.document_id, format: 'html' });
    const texExport = runtime.exportDocument({ document_id: created.document_id, format: 'tex' });
    assert.ok(htmlExport.bytes > 100);
    assert.ok(texExport.bytes > 100);
    assert.ok(fs.existsSync(path.join(workspace, htmlExport.path)));
    assert.ok(fs.existsSync(path.join(workspace, texExport.path)));
    const exportedHtml = fs.readFileSync(path.join(workspace, htmlExport.path), 'utf8');
    assert.match(exportedHtml, /class="whiteboard"/);
    assert.match(exportedHtml, /height="1800"/);
    assert.match(exportedHtml, /stroke="#1769e0"/);

    const undone = runtime.applyDocumentOperations({
      document_id: created.document_id,
      operations: [{
        type: 'whiteboard_undo',
        block_id: whiteboardId,
        stroke_id: strokeA.id,
      }],
    });
    assert.deepEqual(
      undone.blocks.find((block) => block.id === whiteboardId).strokes.map((stroke) => stroke.id),
      [strokeB.id],
    );
    const cleared = runtime.applyDocumentOperations({
      document_id: created.document_id,
      operations: [{ type: 'whiteboard_clear', block_id: whiteboardId }],
    });
    assert.deepEqual(cleared.blocks.find((block) => block.id === whiteboardId).strokes, []);

    assert.throws(
      () => runtime.normalizeBlocks([{
        type: 'whiteboard',
        strokes: [{
          id: 's_cccccccccccccccc',
          tool: 'spray',
          color: '#202124',
          points: [{ x: 1, y: 2, width: 3 }],
        }],
      }]),
      /INVALID_WHITEBOARD_TOOL/,
    );

    if (HAS_XELATEX) {
      const pdfExport = runtime.exportDocument({ document_id: created.document_id, format: 'pdf' });
      assert.ok(pdfExport.bytes > 1000);
      assert.ok(fs.existsSync(path.join(workspace, pdfExport.path)));
    }
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
