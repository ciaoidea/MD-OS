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
const HAS_BROWSER_PDF = ['google-chrome', 'chromium', 'chromium-browser']
  .some((executable) => spawnSync(executable, ['--version'], { encoding: 'utf8' }).status === 0);
const HAS_PDFTOTEXT = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' }).status === 0;

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
  assert.equal(schema.$defs.whiteboard_block.properties.annotations.maxItems, 500);
  assert.deepEqual(
    schema.$defs.whiteboard_annotation.required,
    ['id', 'text', 'x', 'y', 'color', 'font_size']
  );
  assert.equal(schema.$defs.whiteboard_annotation.properties.text.maxLength, 5000);
  assert.equal(schema.$defs.whiteboard_annotation.properties.latex.maxLength, 5000);
  assert.equal(schema.$defs.whiteboard_annotation.properties.mathml.maxLength, 100000);
  assert.match(schema.$defs.whiteboard_annotation.properties.data_uri.pattern, /data:image/);
  assert.equal(schema.$defs.whiteboard_annotation.properties.width.maximum, 1600);
  assert.equal(schema.$defs.whiteboard_block.properties.height_px.maximum, 8000);
  assert.equal(schema.$defs.whiteboard_annotation.properties.height.maximum, 8000);
  assert.equal(schema.$defs.whiteboard_annotation.properties.y.maximum, 8000);
  assert.equal(schema.$defs.whiteboard_point.properties.y.maximum, 8000);

  const html = fs.readFileSync(
    path.join(REPO_ROOT, 'md-os/os/ui/document_editor.html'),
    'utf8'
  );
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Function(scripts[0][1]));
  assert.match(html, /requestDisplayMode\(\{ mode: 'fullscreen' \}\)/);
  assert.match(html, /const WHITEBOARD_HEIGHT_MAX = 8000;/);
  assert.match(html, /contentEditable = 'true'/);
  assert.match(html, /addEventListener\('paste'/);
  assert.match(html, /mdos_document_save/);
  assert.match(html, /mdos_document_render_math/);
  assert.doesNotMatch(html, /callTool\('mdos_document_export'/);
  assert.match(html, /fetch\('\/api\/pdf-export'/);
  assert.match(html, /window\.open\('about:blank', '_blank'\)/);
  assert.match(html, /id="add-whiteboard"/);
  assert.match(html, /id="add-text"[^>]*aria-label="Text"[^>]*data-tone="blue"/);
  assert.match(html, /id="add-table"[^>]*aria-label="Table"[^>]*data-tone="green"/);
  assert.match(html, /id="add-formula"[^>]*aria-label="Formula"[^>]*data-tone="purple"/);
  assert.match(html, /id="add-image"[^>]*aria-label="Image"[^>]*data-tone="amber"/);
  assert.match(html, /id="add-whiteboard"[^>]*aria-label="Whiteboard"[^>]*data-tone="teal"/);
  assert.match(html, /id="delete-block"[^>]*aria-label="Delete block"[^>]*data-tone="red"/);
  assert.match(html, /id="export-pdf"[^>]*aria-label="Export PDF"[^>]*data-tone="red"/);
  assert.match(html, /id="save-notes-file"[^>]*aria-label="Save notes file"[^>]*data-tone="green"/);
  assert.match(html, /id="open-notes-file"[^>]*aria-label="Open notes file"[^>]*data-tone="amber"/);
  assert.match(html, /id="new-notes-file"[^>]*aria-label="New clean notes file"[^>]*data-tone="blue"/);
  assert.match(html, /id="ai-assist"[^>]*aria-label="Ask AI about the last edit"[^>]*data-tone="purple"/);
  assert.match(html, /id="notes-file-input"/);
  assert.match(html, /showSaveFilePicker/);
  assert.ok(html.includes('function saveNotesFile()'));
  assert.ok(html.includes('function openNotesFile(file)'));
  assert.ok(html.includes('function newNotesFile()'));
  assert.ok(html.includes('if (!savedCurrent) return;'));
  assert.ok(html.includes('function requestAiAssist()'));
  assert.ok(html.includes('function revealAiResult(documentValue)'));
  assert.ok(html.includes('function syncAndRevealAiResult()'));
  assert.ok(html.includes('function setAiIndicatorState(value)'));
  assert.match(html, /data-ai-state="idle"/);
  assert.ok(html.includes('function createAiKittStrip()'));
  assert.match(html, /for \(let index = 0; index < 5; index \+= 1\)/);
  assert.match(html, /updateButton,\s*aiKittStrip\s*\n\s*\);/);
  assert.match(html, /if \(strip\) strip\.before\(aiButton\)/);
  assert.match(html, /aiButtonHomeAnchor\.before\(aiButton\)/);
  assert.match(html, /\.whiteboard-toolbar-row #ai-assist \{[^}]*width: 1\.75rem;[^}]*height: 1\.75rem;[^}]*margin-left: auto;/s);
  assert.doesNotMatch(html, /id="ai-kitt-strip"/);
  assert.match(html, /\.ai-kitt-strip::after/);
  assert.match(html, /\.ai-kitt-strip\[data-state="working"\] \.ai-kitt-led/);
  assert.match(html, /\.ai-kitt-strip\[data-state="working"\]::after/);
  assert.match(html, /\.ai-kitt-strip\[data-state="failed"\] \.ai-kitt-led/);
  assert.doesNotMatch(html, /ai-button-led/);
  assert.match(html, /@keyframes ai-kitt-scan/);
  assert.match(html, /setAiIndicatorState\('done'\)/);
  assert.match(html, /setAiIndicatorState\('failed'\)/);
  assert.match(html, /element\.scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/);
  assert.match(html, /AI · answer added/);
  assert.ok(html.includes('/api/ai-assist'));
  assert.match(html, /canvas\.toBlob/);
  assert.match(html, /whiteboardAiPayload/);
  assert.match(html, /\.toolbar-graphic \{[^}]*flex: 0 0 2rem;[^}]*width: 2rem;[^}]*padding: 0;/s);
  assert.match(html, /\.toolbar-icon \{[^}]*width: 1\.1rem;[^}]*height: 1\.1rem;/s);
  assert.equal((html.match(/class="(?:tool|action)[^"]*toolbar-graphic[^"]*"/g) || []).length, 16);
  assert.match(html, /\.tools \{[^}]*flex-wrap: wrap;[^}]*justify-content: flex-start;/s);
  assert.doesNotMatch(html, />Whiteboard<\/button>/);
  assert.match(html, /whiteboard_append_stroke/);
  assert.match(html, /\/api\/whiteboard-stream/);
  assert.match(html, /nextInstanceId !== liveServerInstanceId/);
  assert.doesNotMatch(
    html,
    /document\.hidden \|\| liveEventsConnected/,
    'durable polling must remain active while SSE is connected',
  );
  assert.match(html, /const WHITEBOARD_STREAM_INTERVAL_MS = 80;/);
  assert.match(html, /const WHITEBOARD_COMMIT_INTERVAL_MS = 250;/);
  assert.match(html, /const POLL_FALLBACK_INTERVAL_MS = 5000;/);
  assert.match(html, /operations: batch/);
  assert.match(html, /committedStrokes/);
  assert.match(html, /function createWhiteboardIcon\(name\)/);
  assert.match(html, /function createWhiteboardColorDot\(color\)/);
  assert.match(html, /function annotationLayout\(annotation\)/);
  assert.match(html, /const WHITEBOARD_AI_FONT_SIZE = 48;/);
  assert.match(html, /const WHITEBOARD_TEXT_RIGHT_MARGIN = 64;/);
  assert.match(html, /function wrapWhiteboardLine\(sourceLine, maxWidth\)/);
  assert.match(html, /element\.whiteboardAnnotationLayout = annotationLayout/);
  assert.match(html, /const WHITEBOARD_AI_VERTICAL_GAP = 96;/);
  assert.match(html, /const WHITEBOARD_AI_START_RESERVE = 200;/);
  assert.match(html, /const WHITEBOARD_AI_LINE_STREAM_MS = 180;/);
  assert.match(html, /function whiteboardOccupiedBottom\(\)/);
  assert.match(html, /element\.ensureWhiteboardHeight =/);
  assert.match(html, /Math\.ceil\(required \/ WHITEBOARD_HEIGHT_STEP\) \* WHITEBOARD_HEIGHT_STEP/);
  assert.match(html, /responseY \+ WHITEBOARD_AI_START_RESERVE/);
  assert.match(html, /await element\.flushWhiteboard\(\)/);
  assert.doesNotMatch(html, /minY - 76/);
  assert.doesNotMatch(html, /below <= state\.heightPx/);
  assert.match(html, /Segoe Script.*Apple Chancery.*URW Chancery L.*Lucida Calligraphy/);
  assert.match(html, /context\.strokeText\(value, layout\.x, y\)/);
  assert.match(html, /function renderLatexAnnotation\(annotation, visibleLines = null\)/);
  assert.match(html, /function latexAnnotationRowCount\(annotation\)/);
  assert.match(html, /element\.streamWhiteboardAnnotation =/);
  assert.match(html, /visibleLines: 1, totalLines/);
  assert.match(html, /text\.replace\(\/\\r\\n\?\/g, '\\n'\)\.split\('\\n'\)/);
  assert.doesNotMatch(html, /fontSize \* 2\.5/);
  assert.match(html, /classList\.add\('whiteboard-annotation-layer'\)/);
  assert.match(html, /host\.innerHTML = annotation\.mathml/);
  assert.match(html, /function segmentIntersectsRect\(start, end, rect\)/);
  assert.match(html, /function eraserHitsAnnotation\(stroke, annotation\)/);
  assert.match(html, /function normalizedSelectionRect\(start, end\)/);
  assert.match(html, /function cutWhiteboardSelection\(\)/);
  assert.match(html, /function pasteWhiteboardSelection\(\)/);
  assert.match(html, /function beginWhiteboardMove\(point\)/);
  assert.match(html, /function moveWhiteboardSelection\(point\)/);
  assert.match(html, /function finishWhiteboardMove\(\)/);
  assert.match(html, /createWhiteboardIcon\('select'\)/);
  assert.match(html, /createWhiteboardIcon\('move'\)/);
  assert.match(html, /createWhiteboardIcon\('cut'\)/);
  assert.match(html, /createWhiteboardIcon\('paste'\)/);
  assert.match(html, /element\.pasteWhiteboardImage = async/);
  assert.match(html, /if \(annotation\.data_uri\) renderImageAnnotation\(annotation\)/);
  assert.match(html, /whiteboard\.pasteWhiteboardImage\(file\)/);
  assert.match(html, /function whiteboardResponseY\(questionStrokeIds, questionBounds, reserveHeight\)/);
  assert.match(html, /element\.whiteboardResponseY\(questionStrokeIds, bounds, WHITEBOARD_AI_START_RESERVE\)/);
  assert.match(html, /Erase strokes and AI text/);
  assert.match(html, /type: 'whiteboard_remove_text'/);
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
  assert.match(html, /element\.append\(canvas, annotationLayer, resizeHandle\)/);
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

  const runtimeSource = fs.readFileSync(
    path.join(__dirname, '../md-os/os/document_runtime.js'),
    'utf8',
  );
  assert.match(runtimeSource, /rowCount \* 1\.9 \+ 0\.6/);
  assert.doesNotMatch(runtimeSource, /\.match\(\/\.\{1,54\}/);

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
    assert.deepEqual(saved.blocks[4].annotations, []);

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

    const extended = runtime.applyDocumentOperations({
      document_id: created.document_id,
      operations: [{
        type: 'whiteboard_resize',
        block_id: whiteboardId,
        height_px: 8000,
      }],
    });
    assert.equal(extended.blocks.find((block) => block.id === whiteboardId).height_px, 8000);

    const annotated = runtime.applyDocumentOperations({
      document_id: created.document_id,
      operations: [{
        type: 'whiteboard_add_text',
        block_id: whiteboardId,
        annotation: {
          id: 'a_cccccccccccccccc',
          text: 'Risposta breve',
          x: 140,
          y: 220,
          color: '#1769e0',
          font_size: 34,
        },
      }],
    });
    assert.deepEqual(
      annotated.blocks.find((block) => block.id === whiteboardId).annotations,
      [{
        id: 'a_cccccccccccccccc',
        text: 'Risposta breve',
        x: 140,
        y: 220,
        color: '#1769e0',
        font_size: 34,
      }],
    );

    const formulaAnnotated = runtime.applyDocumentOperations({
      document_id: created.document_id,
      operations: [{
        type: 'whiteboard_add_text',
        block_id: whiteboardId,
        annotation: {
          id: 'a_dddddddddddddddd',
          text: 'E = mc²',
          latex: 'E = mc^2',
          mathml: '<math><script>untrusted</script></math>',
          x: 140,
          y: 360,
          color: '#1769e0',
          font_size: 64,
        },
      }],
    });
    const formulaAnnotation = formulaAnnotated.blocks
      .find((block) => block.id === whiteboardId).annotations[1];
    assert.equal(formulaAnnotation.latex, 'E = mc^2');
    assert.match(formulaAnnotation.mathml, /^<math\b/);
    assert.doesNotMatch(formulaAnnotation.mathml, /untrusted|script/i);
    assert.equal(formulaAnnotation.font_size, 64);

    const clipboardPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const imageAnnotated = runtime.applyDocumentOperations({
      document_id: created.document_id,
      operations: [{
        type: 'whiteboard_add_text',
        block_id: whiteboardId,
        annotation: {
          id: 'a_eeeeeeeeeeeeeeee',
          text: 'Clipboard image',
          data_uri: clipboardPixel,
          x: 120,
          y: 900,
          width: 320,
          height: 240,
          color: '#1769e0',
          font_size: 64,
        },
      }],
    });
    const imageAnnotation = imageAnnotated.blocks
      .find((block) => block.id === whiteboardId).annotations[2];
    assert.equal(imageAnnotation.data_uri, clipboardPixel);
    assert.equal(imageAnnotation.width, 320);
    assert.equal(imageAnnotation.height, 240);

    const longWhiteboardText = 'Questa risposta deve andare a capo prima del margine destro anche con ParolaLunghissimaSenzaSpaziCheNonDeveEssereTagliata';
    runtime.applyDocumentOperations({
      document_id: created.document_id,
      operations: [{
        type: 'whiteboard_add_text',
        block_id: whiteboardId,
        annotation: {
          id: 'a_ffffffffffffffff',
          text: longWhiteboardText,
          x: 1240,
          y: 1260,
          color: '#1769e0',
          font_size: 48,
        },
      }],
    });

    const htmlExport = runtime.exportDocument({ document_id: created.document_id, format: 'html' });
    const texExport = runtime.exportDocument({ document_id: created.document_id, format: 'tex' });
    assert.ok(htmlExport.bytes > 100);
    assert.ok(texExport.bytes > 100);
    assert.ok(fs.existsSync(path.join(workspace, htmlExport.path)));
    assert.ok(fs.existsSync(path.join(workspace, texExport.path)));
    const exportedHtml = fs.readFileSync(path.join(workspace, htmlExport.path), 'utf8');
    assert.match(exportedHtml, /class="whiteboard"/);
    assert.match(exportedHtml, /height="8000"/);
    assert.match(exportedHtml, /stroke="#1769e0"/);
    assert.match(exportedHtml, /Risposta breve/);
    assert.match(exportedHtml, /font-family="Segoe Script, Apple Chancery, URW Chancery L, Lucida Calligraphy, cursive"/);
    assert.match(exportedHtml, /font-size="34" font-weight="700" paint-order="stroke"/);
    assert.match(exportedHtml, /font-size="48" font-weight="700" paint-order="stroke"/);
    assert.ok(
      (exportedHtml.match(/<tspan x="1240"/g) || []).length >= 4,
      'long Whiteboard text should wrap into several export lines',
    );
    assert.doesNotMatch(exportedHtml, new RegExp(longWhiteboardText));
    assert.match(exportedHtml, /<foreignObject\b/);
    assert.match(exportedHtml, /<math\b/);
    assert.match(exportedHtml, /<div class="formula"><math\b/);
    assert.doesNotMatch(exportedHtml, /\\\[E = mc\^2\\\]/);
    assert.match(exportedHtml, /<image\b[^>]*data:image\/png;base64/);
    assert.match(exportedHtml, /white-space:nowrap/);

    const annotationRemoved = runtime.applyDocumentOperations({
      document_id: created.document_id,
      operations: [
        {
          type: 'whiteboard_remove_text',
          block_id: whiteboardId,
          annotation_id: 'a_cccccccccccccccc',
        },
        {
          type: 'whiteboard_remove_text',
          block_id: whiteboardId,
          annotation_id: 'a_dddddddddddddddd',
        },
        {
          type: 'whiteboard_remove_text',
          block_id: whiteboardId,
          annotation_id: 'a_eeeeeeeeeeeeeeee',
        },
        {
          type: 'whiteboard_remove_text',
          block_id: whiteboardId,
          annotation_id: 'a_ffffffffffffffff',
        },
      ],
    });
    assert.deepEqual(
      annotationRemoved.blocks.find((block) => block.id === whiteboardId).annotations,
      [],
    );
    runtime.applyDocumentOperations({
      document_id: created.document_id,
      operations: [{
        type: 'whiteboard_add_text',
        block_id: whiteboardId,
        annotation: { text: 'Temporary', x: 10, y: 10 },
      }],
    });

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
    assert.deepEqual(cleared.blocks.find((block) => block.id === whiteboardId).annotations, []);

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

    if (HAS_XELATEX || HAS_BROWSER_PDF) {
      const pdfExport = runtime.exportDocument({ document_id: created.document_id, format: 'pdf' });
      assert.ok(pdfExport.bytes > 1000);
      assert.ok(['browser_pdf', 'pandoc_xelatex'].includes(pdfExport.engine));
      assert.ok(fs.existsSync(path.join(workspace, pdfExport.path)));
      if (HAS_PDFTOTEXT) {
        const pdfText = spawnSync('pdftotext', [path.join(workspace, pdfExport.path), '-'], {
          encoding: 'utf8',
        }).stdout;
        assert.doesNotMatch(pdfText, /\\begin\{|\\frac|\\\[/);
      }
      const temporaryPdf = runtime.exportTemporaryPdf({ document_id: created.document_id });
      assert.equal(temporaryPdf.temporary, true);
      assert.equal(path.relative(os.tmpdir(), temporaryPdf.path).startsWith('..'), false);
      assert.ok(fs.existsSync(temporaryPdf.path));
      const temporaryDirectory = path.dirname(temporaryPdf.path);
      temporaryPdf.cleanup();
      assert.equal(fs.existsSync(temporaryDirectory), false);
    }
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
