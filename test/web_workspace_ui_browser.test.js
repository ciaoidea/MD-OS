'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { EventEmitter, once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createWebWorkspace } = require('../md-os/os/web_workspace_server');

const CHROME = [
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((candidate) => fs.existsSync(candidate));

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function connectDevTools(debugPort, pageUrl) {
  let target;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
        .then((response) => response.json());
      target = targets.find((candidate) => candidate.type === 'page' && candidate.url === pageUrl);
      if (target) break;
    } catch (_) {
      // Chrome may still be starting.
    }
    await wait(100);
  }
  if (!target) throw new Error('Chrome verifier page did not start');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const operation = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) operation.reject(new Error(message.error.message));
    else operation.resolve(message.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result.value;
  };
  await call('Runtime.enable');
  return { socket, call, evaluate };
}

test('Ask AI selects and scrolls its saved answer into view', {
  skip: !CHROME,
  timeout: 35_000,
}, async () => {
  const targetId = 'b_aaaaaaaaaaaaaaaa';
  const answerId = 'b_bbbbbbbbbbbbbbbb';
  const answerBlock = {
    id: answerId,
    type: 'rich',
    html: '<p>Verified short answer</p>',
  };
  const annotationId = 'a_cccccccccccccccc';
  let appliedOperations = [];
  let aiPrompt = '';
  let aiAttachments = null;
  let document = {
    document_id: 'notes',
    revision: 1,
    title: 'Isolated verifier',
    blocks: Array.from({ length: 24 }, (_, index) => ({
      id: index === 23 ? targetId : `b_${String(index + 1).padStart(16, '0')}`,
      ...(index === 23 ? {
        type: 'whiteboard',
        height_px: 800,
        strokes: [{
          id: 's_aaaaaaaaaaaaaaaa',
          tool: 'pen',
          color: '#202124',
          points: [{ x: 20, y: 500, width: 5 }, { x: 120, y: 560, width: 5 }],
        }],
        annotations: [{
          id: 'a_dddddddddddddddd',
          text: 'Existing AI text',
          x: 40,
          y: 600,
          color: '#1769e0',
          font_size: 64,
        }],
      } : {
        type: 'rich',
        html: `<p>Verifier block ${index + 1}</p><p>spacing</p><p>spacing</p>`,
      }),
    })),
  };

  class FakeAgent extends EventEmitter {
    async start() {
      this.threadId = 'thread_ui_verifier';
    }

    async close() {}

    async sendMessage(prompt, context, attachments) {
      aiPrompt = String(prompt || '');
      aiAttachments = attachments;
      this.emit('turn-started', { turnId: 'turn_ui_verifier' });
      setTimeout(() => {
        document = {
          ...document,
          revision: document.revision + 1,
          blocks: [...document.blocks, answerBlock],
        };
        const result = { structuredContent: { document } };
        this.emit('document-updated', { result, document });
        this.emit('turn-completed', { status: 'completed' });
      }, 650);
      return { threadId: this.threadId, turnId: 'turn_ui_verifier' };
    }
  }

  const agent = new FakeAgent();
  const application = createWebWorkspace({
    agent,
    toolRunner: async (name, args) => {
      if (name === 'mdos_document_export') {
        return {
          structuredContent: {
            export: {
              document_id: document.document_id,
              revision: document.revision,
              format: 'pdf',
              path: 'md-os/ops/documents/notes/exports/notes.pdf',
              bytes: 8192,
            },
          },
        };
      }
      if (name === 'mdos_document_apply') {
        appliedOperations = [...appliedOperations, ...(args.operations || [])];
        let blocks = document.blocks.map((block) => ({ ...block }));
        for (const operation of args.operations || []) {
          const index = blocks.findIndex((block) => block.id === operation.block_id);
          if (index < 0 || blocks[index].type !== 'whiteboard') continue;
          if (operation.type === 'whiteboard_append_stroke') {
            blocks[index] = {
              ...blocks[index],
              strokes: [...blocks[index].strokes, operation.stroke],
            };
          } else if (operation.type === 'whiteboard_undo') {
            blocks[index] = {
              ...blocks[index],
              strokes: blocks[index].strokes
                .filter((stroke) => stroke.id !== operation.stroke_id),
            };
          } else if (operation.type === 'whiteboard_add_text') {
            blocks[index] = {
              ...blocks[index],
              annotations: [...blocks[index].annotations, operation.annotation],
            };
          } else if (operation.type === 'whiteboard_remove_text') {
            blocks[index] = {
              ...blocks[index],
              annotations: blocks[index].annotations
                .filter((annotation) => annotation.id !== operation.annotation_id),
            };
          } else if (operation.type === 'whiteboard_resize') {
            blocks[index] = {
              ...blocks[index],
              height_px: operation.height_px,
            };
          }
        }
        document = { ...document, revision: document.revision + 1, blocks };
      }
      return { structuredContent: { document } };
    },
    temporaryPdfExporter: async (args) => ({
      document_id: args.document_id,
      revision: document.revision,
      format: 'pdf',
      path: '/tmp/ui-ai-context.pdf',
      bytes: 8192,
      temporary: true,
      cleanup: () => {},
    }),
    pdfPageRenderer: async () => ({
      pagePaths: ['/tmp/ui-pdf-page-1.jpg', '/tmp/ui-pdf-page-2.jpg'],
      cleanup: () => {},
    }),
  });
  let chrome;
  let profile;
  let devTools;
  try {
    await application.start();
    await new Promise((resolve) => application.server.listen(0, '127.0.0.1', resolve));
    const pageUrl = `http://127.0.0.1:${application.server.address().port}/`;
    const debugPort = await freePort();
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-ui-verifier-'));
    chrome = spawn(CHROME, [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      pageUrl,
    ], {
      stdio: 'ignore',
      detached: process.platform !== 'win32',
    });
    devTools = await connectDevTools(debugPort, pageUrl);

    let loaded = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      loaded = await devTools.evaluate("document.querySelectorAll('.block').length === 24");
      if (loaded) break;
      await wait(100);
    }
    assert.equal(loaded, true, 'the isolated notes document should render');
    await wait(250);
    const idleIndicator = await devTools.evaluate(`(() => {
      const toolbar = document.getElementById('whiteboard-toolbar');
      const strip = toolbar.querySelector('.ai-kitt-strip');
      const ai = document.getElementById('ai-assist');
      const toolbarRect = toolbar.getBoundingClientRect();
      const stripRect = strip.getBoundingClientRect();
      const aiRect = ai.getBoundingClientRect();
      const leds = Array.from(strip.querySelectorAll('.ai-kitt-led'));
      return {
        state: strip.dataset.state,
        label: strip.getAttribute('aria-label'),
        led_count: leds.length,
        green_led_count: leds.filter((led) => getComputedStyle(led).backgroundColor === 'rgb(34, 197, 94)').length,
        animation_name: getComputedStyle(strip, '::after').animationName,
        at_controls_right: strip.parentElement.lastElementChild === strip,
        ai_before_leds: strip.previousElementSibling?.id === 'ai-assist',
        ai_in_whiteboard_toolbar: toolbar.contains(document.getElementById('ai-assist')),
        ai_in_general_tools: document.querySelector('.tools')?.contains(document.getElementById('ai-assist')),
        right_gap: Math.round(toolbarRect.right - stripRect.right),
        ai_is_left_of_leds: aiRect.right <= stripRect.left,
        header_strip_count: document.querySelectorAll('.bar > .tools > .ai-kitt-strip').length,
        per_button_led_count: document.querySelectorAll('button .ai-button-led').length,
      };
    })()`);
    assert.equal(idleIndicator?.state, 'idle');
    assert.equal(idleIndicator?.label, 'AI available');
    assert.equal(idleIndicator?.led_count, 5);
    assert.equal(idleIndicator?.green_led_count, 5);
    assert.match(idleIndicator?.animation_name || '', /ai-kitt-scan/);
    assert.equal(idleIndicator?.at_controls_right, true);
    assert.equal(idleIndicator?.ai_before_leds, true);
    assert.equal(idleIndicator?.ai_in_whiteboard_toolbar, true);
    assert.equal(idleIndicator?.ai_in_general_tools, false);
    assert.ok(idleIndicator?.right_gap >= 0 && idleIndicator.right_gap <= 12, JSON.stringify(idleIndicator));
    assert.equal(idleIndicator?.ai_is_left_of_leds, true);
    assert.equal(idleIndicator?.header_strip_count, 0);
    assert.equal(idleIndicator?.per_button_led_count, 0);

    const pageScrolling = await devTools.evaluate(`(async () => {
      const root = document.scrollingElement || document.documentElement;
      const rail = document.getElementById('page-scrollbar');
      const track = document.getElementById('page-scroll-track');
      const thumb = document.getElementById('page-scroll-thumb');
      const down = document.getElementById('page-scroll-down');
      const canvas = document.querySelector('[data-block-id="${targetId}"] canvas');
      root.scrollTop = 0;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const beforeStrokes = canvas.closest('.whiteboard').whiteboardState.strokes.length;
      const touch = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 991,
        pointerType: 'touch',
        clientX: 20,
        clientY: 20,
      });
      const touchDefaultAllowed = canvas.dispatchEvent(touch);
      const afterStrokes = canvas.closest('.whiteboard').whiteboardState.strokes.length;
      const before = root.scrollTop;
      down.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const after = root.scrollTop;
      const state = {
        root_overflow_y: getComputedStyle(document.documentElement).overflowY,
        workspace_overflow_y: getComputedStyle(document.querySelector('.workspace')).overflowY,
        canvas_touch_action: getComputedStyle(canvas).touchAction,
        rail_position: getComputedStyle(rail).position,
        rail_display: getComputedStyle(rail).display,
        rail_scrollable: rail.dataset.scrollable,
        maximum: Number(track.getAttribute('aria-valuemax')),
        aria_now: Number(track.getAttribute('aria-valuenow')),
        thumb_height: thumb.getBoundingClientRect().height,
        before,
        after,
        touchDefaultAllowed,
        beforeStrokes,
        afterStrokes,
      };
      root.scrollTop = 0;
      return state;
    })()`);
    assert.equal(pageScrolling?.root_overflow_y, 'scroll');
    assert.equal(pageScrolling?.workspace_overflow_y, 'visible');
    assert.match(pageScrolling?.canvas_touch_action || '', /pan-y/);
    assert.equal(pageScrolling?.rail_position, 'fixed');
    assert.equal(pageScrolling?.rail_display, 'grid');
    assert.equal(pageScrolling?.rail_scrollable, 'true');
    assert.ok(pageScrolling?.maximum > 0, JSON.stringify(pageScrolling));
    assert.ok(pageScrolling?.thumb_height >= 44, JSON.stringify(pageScrolling));
    assert.equal(pageScrolling?.before, 0);
    assert.ok(pageScrolling?.after > pageScrolling.before, JSON.stringify(pageScrolling));
    assert.equal(pageScrolling?.aria_now, pageScrolling.after);
    assert.equal(pageScrolling?.touchDefaultAllowed, true, 'a finger gesture must remain available to Chrome for scrolling');
    assert.equal(pageScrolling?.afterStrokes, pageScrolling.beforeStrokes, 'a finger gesture must not draw on the Whiteboard');

    const selectionDrag = await devTools.evaluate(`(async () => {
      const whiteboard = document.querySelector('[data-block-id="${targetId}"]');
      whiteboard.click();
      document.querySelector('#whiteboard-toolbar [aria-label="Select"]').click();
      const canvas = whiteboard.querySelector('canvas');
      canvas.scrollIntoView({ behavior: 'instant', block: 'center' });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const bounds = canvas.getBoundingClientRect();
      const point = (x, y) => ({
        x: bounds.left + x * bounds.width / canvas.width,
        y: bounds.top + y * bounds.height / canvas.height,
      });
      return { start: point(5, 480), end: point(900, 690) };
    })()`);
    await devTools.call('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: selectionDrag.start.x, y: selectionDrag.start.y,
      button: 'left', buttons: 1, clickCount: 1,
    });
    await devTools.call('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: selectionDrag.end.x, y: selectionDrag.end.y,
      button: 'left', buttons: 1,
    });
    await devTools.call('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: selectionDrag.end.x, y: selectionDrag.end.y,
      button: 'left', buttons: 0, clickCount: 1,
    });

    const selectedEvidence = await devTools.evaluate(`(() => {
      const whiteboard = document.querySelector('[data-block-id="${targetId}"]');
      const state = whiteboard.whiteboardState;
      return {
        tool: state.tool,
        stroke_ids: state.selectedStrokeIds,
        annotation_ids: state.selectedAnnotationIds,
        rect: state.selectionRect,
        overlay_count: whiteboard.querySelectorAll('.whiteboard-selection').length,
        cut_disabled: document.querySelector('#whiteboard-toolbar [aria-label="Cut selection"]').disabled,
        move_disabled: document.querySelector('#whiteboard-toolbar [aria-label="Move selection"]').disabled,
      };
    })()`);
    assert.equal(selectedEvidence?.tool, 'select', JSON.stringify(selectedEvidence));
    assert.equal(selectedEvidence?.stroke_ids?.length, 1, JSON.stringify(selectedEvidence));
    assert.equal(selectedEvidence?.annotation_ids?.length, 1, JSON.stringify(selectedEvidence));
    assert.equal(selectedEvidence?.overlay_count, 1, JSON.stringify(selectedEvidence));
    assert.equal(selectedEvidence?.cut_disabled, false, JSON.stringify(selectedEvidence));
    assert.equal(selectedEvidence?.move_disabled, false, JSON.stringify(selectedEvidence));

    await devTools.evaluate(`document.querySelector('#whiteboard-toolbar [aria-label="Cut selection"]').click()`);
    let cutEvidence;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      cutEvidence = await devTools.evaluate(`(() => {
        const whiteboard = document.querySelector('[data-block-id="${targetId}"]');
        const state = whiteboard.whiteboardState;
        return {
          connected: whiteboard.isConnected,
          strokes: state.strokes.length,
          annotations: state.annotations.length,
          clipboard_strokes: state.clipboard?.strokes?.length || 0,
          clipboard_annotations: state.clipboard?.annotations?.length || 0,
          paste_disabled: document.querySelector('#whiteboard-toolbar [aria-label="Paste selection"]').disabled,
        };
      })()`);
      const persisted = document.blocks.find((block) => block.id === targetId);
      if (cutEvidence?.strokes === 0 && cutEvidence?.annotations === 0
        && persisted.strokes.length === 0 && persisted.annotations.length === 0) break;
      await wait(50);
    }
    assert.equal(cutEvidence?.connected, true, JSON.stringify(cutEvidence));
    assert.equal(cutEvidence?.clipboard_strokes, 1, JSON.stringify(cutEvidence));
    assert.equal(cutEvidence?.clipboard_annotations, 1, JSON.stringify(cutEvidence));
    assert.equal(cutEvidence?.paste_disabled, false, JSON.stringify(cutEvidence));

    await devTools.evaluate(`document.querySelector('#whiteboard-toolbar [aria-label="Paste selection"]').click()`);
    let pasteEvidence;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      pasteEvidence = await devTools.evaluate(`(() => {
        const whiteboard = document.querySelector('[data-block-id="${targetId}"]');
        const state = whiteboard.whiteboardState;
        return {
          strokes: state.strokes.length,
          annotations: state.annotations.length,
          stroke_id: state.strokes[0]?.id,
          annotation_id: state.annotations[0]?.id,
          rect: state.selectionRect,
          selected: state.selectedStrokeIds.length + state.selectedAnnotationIds.length,
        };
      })()`);
      const persisted = document.blocks.find((block) => block.id === targetId);
      if (pasteEvidence?.strokes === 1 && pasteEvidence?.annotations === 1
        && persisted.strokes.length === 1 && persisted.annotations.length === 1) break;
      await wait(50);
    }
    assert.notEqual(pasteEvidence?.stroke_id, 's_aaaaaaaaaaaaaaaa', JSON.stringify(pasteEvidence));
    assert.notEqual(pasteEvidence?.annotation_id, 'a_dddddddddddddddd', JSON.stringify(pasteEvidence));
    assert.equal(pasteEvidence?.selected, 2, JSON.stringify(pasteEvidence));

    const moveDrag = await devTools.evaluate(`(async () => {
      const whiteboard = document.querySelector('[data-block-id="${targetId}"]');
      document.querySelector('#whiteboard-toolbar [aria-label="Move selection"]').click();
      const canvas = whiteboard.querySelector('canvas');
      const rect = whiteboard.whiteboardState.selectionRect;
      const bounds = canvas.getBoundingClientRect();
      const point = (x, y) => ({
        x: bounds.left + x * bounds.width / canvas.width,
        y: bounds.top + y * bounds.height / canvas.height,
      });
      const center = point((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2);
      const end = point((rect.left + rect.right) / 2 + 120, (rect.top + rect.bottom) / 2 + 60);
      return { center, end, left: rect.left, top: rect.top };
    })()`);
    await devTools.call('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: moveDrag.center.x, y: moveDrag.center.y,
      button: 'left', buttons: 1, clickCount: 1,
    });
    await devTools.call('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: moveDrag.end.x, y: moveDrag.end.y,
      button: 'left', buttons: 1,
    });
    await devTools.call('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: moveDrag.end.x, y: moveDrag.end.y,
      button: 'left', buttons: 0, clickCount: 1,
    });
    let moveEvidence;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      moveEvidence = await devTools.evaluate(`(() => {
        const state = document.querySelector('[data-block-id="${targetId}"]').whiteboardState;
        return {
          tool: state.tool,
          moving: state.moving,
          left: state.selectionRect?.left,
          top: state.selectionRect?.top,
          pending: state.pendingOperations.length,
        };
      })()`);
      if (!moveEvidence?.moving && moveEvidence?.left > moveDrag.left + 100) break;
      await wait(25);
    }
    assert.equal(moveEvidence?.tool, 'move', JSON.stringify(moveEvidence));
    assert.equal(moveEvidence?.moving, false, JSON.stringify(moveEvidence));
    assert.ok(moveEvidence?.left > moveDrag.left + 100, JSON.stringify(moveEvidence));
    assert.ok(moveEvidence?.top > moveDrag.top + 40, JSON.stringify(moveEvidence));

    const clipboardPastePrevented = await devTools.evaluate(`(() => {
      const whiteboard = document.querySelector('[data-block-id="${targetId}"]');
      const canvas = whiteboard.querySelector('canvas');
      const raw = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
      const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
      const file = new File([bytes], 'clipboard.png', { type: 'image/png' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: transfer });
      canvas.dispatchEvent(event);
      return event.defaultPrevented;
    })()`);
    assert.equal(clipboardPastePrevented, true);
    let imagePasteEvidence;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      imagePasteEvidence = await devTools.evaluate(`(() => {
        const whiteboard = document.querySelector('[data-block-id="${targetId}"]');
        const image = whiteboard.whiteboardState.annotations.find((annotation) => annotation.data_uri);
        return {
          image: image ? { id: image.id, width: image.width, height: image.height } : null,
          svg_images: whiteboard.querySelectorAll('.whiteboard-annotation-layer image').length,
          selected_image: image ? whiteboard.whiteboardState.selectedAnnotationIds.includes(image.id) : false,
        };
      })()`);
      if (imagePasteEvidence?.image && imagePasteEvidence?.svg_images === 1) break;
      await wait(50);
    }
    assert.ok(imagePasteEvidence?.image, JSON.stringify(imagePasteEvidence));
    assert.equal(imagePasteEvidence?.svg_images, 1, JSON.stringify(imagePasteEvidence));
    assert.equal(imagePasteEvidence?.selected_image, true, JSON.stringify(imagePasteEvidence));

    await devTools.evaluate(`
      document.querySelector('[data-block-id="${targetId}"]').click();
      document.getElementById('ai-assist').click();
      true;
    `);

    let workingEvidence;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      workingEvidence = await devTools.evaluate(`(() => {
        const strip = document.querySelector('#whiteboard-toolbar .ai-kitt-strip');
        const leds = Array.from(strip.querySelectorAll('.ai-kitt-led'));
        const red = leds.filter((led) => getComputedStyle(led).backgroundColor === 'rgb(255, 43, 28)');
        return {
          ai_state: document.querySelector('.bar').dataset.aiState,
          strip_state: strip.dataset.state,
          label: strip.getAttribute('aria-label'),
          led_count: leds.length,
          red_led_count: red.length,
          animation_name: getComputedStyle(strip, '::after').animationName,
          per_button_led_count: document.querySelectorAll('button .ai-button-led').length,
          whiteboard_controls: document.querySelectorAll('#whiteboard-toolbar .whiteboard-control').length,
          whiteboard_height_max: document.querySelector('.whiteboard-resize-handle')?.getAttribute('aria-valuemax'),
        };
      })()`);
      if (workingEvidence?.ai_state === 'working') break;
      await wait(50);
    }

    assert.equal(workingEvidence?.ai_state, 'working');
    assert.equal(workingEvidence?.strip_state, 'working');
    assert.equal(workingEvidence?.label, 'AI busy');
    assert.equal(workingEvidence?.led_count, 5);
    assert.equal(workingEvidence?.per_button_led_count, 0);
    assert.equal(workingEvidence?.whiteboard_controls, 15);
    assert.equal(workingEvidence?.whiteboard_height_max, '8000');
    assert.equal(workingEvidence?.red_led_count, workingEvidence?.led_count);
    assert.match(workingEvidence?.animation_name || '', /ai-kitt-scan/);
    assert.match(aiPrompt, /PDF pages are context only/);
    assert.match(aiPrompt, /current modification request is only the latest bounded target/);
    assert.match(aiPrompt, /font_size 48/);
    assert.deepEqual(aiAttachments?.pdfPagePaths, ['/tmp/ui-pdf-page-1.jpg', '/tmp/ui-pdf-page-2.jpg']);
    assert.match(aiAttachments?.imageUrl || '', /^data:image\/jpeg;base64,/);
    const responseY = Number(aiPrompt.match(/put the complete answer at x=[^,]+, y=([0-9.]+)/)?.[1]);
    assert.ok(responseY > 664, `AI response y=${responseY} must be below ink and existing text`);
    assert.ok(
      appliedOperations.some((operation) => operation.type === 'whiteboard_resize' && operation.height_px >= 1000),
      JSON.stringify(appliedOperations),
    );

    let evidence;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      evidence = await devTools.evaluate(`(() => {
        const answer = document.querySelector('[data-block-id="${answerId}"]');
        if (!answer) return null;
        const rect = answer.getBoundingClientRect();
        return {
          block_count: document.querySelectorAll('.block').length,
          selected: answer.classList.contains('selected'),
          in_viewport: rect.top >= 0 && rect.bottom <= window.innerHeight,
          status: document.getElementById('status').textContent,
          scroll_y: Math.round(window.scrollY),
          ai_state: document.querySelector('.bar').dataset.aiState,
          strip_state: document.querySelector('#whiteboard-toolbar .ai-kitt-strip').dataset.state,
          indicator_label: document.querySelector('#whiteboard-toolbar .ai-kitt-strip').getAttribute('aria-label'),
          led_count: document.querySelectorAll('#whiteboard-toolbar .ai-kitt-strip .ai-kitt-led').length,
          green_led_count: Array.from(document.querySelectorAll('#whiteboard-toolbar .ai-kitt-strip .ai-kitt-led'))
            .filter((led) => getComputedStyle(led).backgroundColor === 'rgb(34, 197, 94)').length
        };
      })()`);
      if (evidence?.selected && evidence?.in_viewport) break;
      await wait(100);
    }

    assert.equal(evidence?.block_count, 25);
    assert.equal(evidence?.selected, true);
    assert.equal(evidence?.in_viewport, true);
    assert.match(evidence?.status || '', /AI · answer (added|shown)/);
    assert.ok(evidence?.scroll_y > 0, 'the long document should scroll to the answer');
    assert.equal(evidence?.ai_state, 'done');
    assert.equal(evidence?.strip_state, 'done');
    assert.equal(evidence?.indicator_label, 'AI available');
    assert.equal(evidence?.led_count, 5);
    assert.equal(evidence?.green_led_count, evidence?.led_count);

    const wrappingAnnotationId = 'a_ffffffffffffffff';
    document = {
      ...document,
      revision: document.revision + 1,
      blocks: document.blocks.map((block) => block.id === targetId ? {
        ...block,
        annotations: [{
          id: wrappingAnnotationId,
          text: 'Risposta lunga vicino al bordo con ParolaLunghissimaSenzaSpaziCheNonDeveEssereTagliata',
          x: 1300,
          y: 280,
          color: '#1769e0',
          font_size: 48,
        }],
      } : block),
    };
    agent.emit('document-updated', {
      result: { structuredContent: { document } },
      document,
    });

    let wrappingEvidence;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      wrappingEvidence = await devTools.evaluate(`(() => {
        const whiteboard = document.querySelector('[data-block-id="${targetId}"]');
        const annotation = whiteboard?.whiteboardState?.annotations?.[0];
        if (annotation?.id !== '${wrappingAnnotationId}') return null;
        const layout = whiteboard.whiteboardAnnotationLayout(annotation);
        const canvas = whiteboard.querySelector('canvas');
        const context = canvas.getContext('2d');
        context.save();
        context.font = layout.font;
        const maxRenderedWidth = Math.max(...layout.lines.map((line) => context.measureText(line).width));
        context.restore();
        return {
          font_size: layout.fontSize,
          line_count: layout.lines.length,
          x: layout.x,
          available_width: canvas.width - layout.x - 64,
          max_rendered_width: maxRenderedWidth,
          right_edge: layout.x + maxRenderedWidth,
        };
      })()`);
      if (wrappingEvidence) break;
      await wait(50);
    }
    assert.equal(wrappingEvidence?.font_size, 48, JSON.stringify(wrappingEvidence));
    assert.ok(wrappingEvidence?.line_count >= 4, JSON.stringify(wrappingEvidence));
    assert.ok(
      wrappingEvidence?.max_rendered_width <= wrappingEvidence?.available_width + 0.5,
      JSON.stringify(wrappingEvidence),
    );
    assert.ok(wrappingEvidence?.right_edge <= 1536.5, JSON.stringify(wrappingEvidence));

    document = {
      ...document,
      revision: document.revision + 1,
      blocks: document.blocks.map((block) => block.id === targetId ? {
        ...block,
        annotations: [{
          id: annotationId,
          text: 'E = mc²\np = mv\nF = ma',
          latex: '\\begin{gathered} E = mc^2 \\\\ p = mv \\\\ F = ma \\end{gathered}',
          mathml: '<math display="block" xmlns="http://www.w3.org/1998/Math/MathML"><mtable><mtr><mtd><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mtd></mtr><mtr><mtd><mi>p</mi><mo>=</mo><mi>m</mi><mi>v</mi></mtd></mtr><mtr><mtd><mi>F</mi><mo>=</mo><mi>m</mi><mi>a</mi></mtd></mtr></mtable></math>',
          x: 40,
          y: 280,
          color: '#1769e0',
          font_size: 64,
        }],
      } : block),
    };
    agent.emit('document-updated', {
      result: { structuredContent: { document } },
      document,
    });

    let annotationLoaded = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      annotationLoaded = await devTools.evaluate(`(() => {
        const whiteboard = document.querySelector('[data-block-id="${targetId}"]');
        return whiteboard?.whiteboardState?.annotations?.[0]?.id === '${annotationId}';
      })()`);
      if (annotationLoaded) break;
      await wait(50);
    }
    assert.equal(annotationLoaded, true, 'the persisted AI annotation should render');
    const latexEvidence = await devTools.evaluate(`(() => {
      const whiteboard = document.querySelector('[data-block-id="${targetId}"]');
      const host = whiteboard.querySelector('.whiteboard-latex');
      return {
        foreign_object_count: whiteboard.querySelectorAll('.whiteboard-annotation-layer foreignObject').length,
        math_count: whiteboard.querySelectorAll('.whiteboard-latex math').length,
        font_size: host ? getComputedStyle(host).fontSize : '',
        white_space: host ? getComputedStyle(host).whiteSpace : '',
        foreign_height: Number(whiteboard.querySelector('foreignObject')?.getAttribute('height') || 0),
        row_count: whiteboard.querySelectorAll('.whiteboard-latex mtr').length,
        text: host?.textContent || '',
      };
    })()`);
    assert.equal(latexEvidence?.foreign_object_count, 1);
    assert.equal(latexEvidence?.math_count, 1);
    assert.equal(latexEvidence?.font_size, '64px');
    assert.equal(latexEvidence?.white_space, 'nowrap');
    assert.equal(latexEvidence?.row_count, 3);
    assert.ok(latexEvidence?.foreign_height > 300, JSON.stringify(latexEvidence));
    assert.match(latexEvidence?.text || '', /E=mc2/);

    const streamStart = await devTools.evaluate(`(() => {
      const whiteboard = document.querySelector('[data-block-id="${targetId}"]');
      void whiteboard.streamWhiteboardAnnotation('${annotationId}');
      const rows = Array.from(whiteboard.querySelectorAll('.whiteboard-latex mtr'));
      return {
        visible: rows.filter((row) => row.style.visibility !== 'hidden').length,
        hidden: rows.filter((row) => row.style.visibility === 'hidden').length,
        reveal_lines: whiteboard.whiteboardState.annotationReveal?.visibleLines || 0,
        width: Number(whiteboard.querySelector('foreignObject')?.getAttribute('width') || 0),
      };
    })()`);
    assert.equal(streamStart?.visible, 1, JSON.stringify(streamStart));
    assert.equal(streamStart?.hidden, 2, JSON.stringify(streamStart));
    assert.equal(streamStart?.reveal_lines, 1);
    assert.equal(streamStart?.width, 1496);

    let streamComplete;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      streamComplete = await devTools.evaluate(`(() => {
        const whiteboard = document.querySelector('[data-block-id="${targetId}"]');
        const rows = Array.from(whiteboard.querySelectorAll('.whiteboard-latex mtr'));
        return {
          busy: Boolean(whiteboard.whiteboardState.annotationReveal),
          visible: rows.filter((row) => row.style.visibility !== 'hidden').length,
          hidden: rows.filter((row) => row.style.visibility === 'hidden').length,
          height: whiteboard.whiteboardState.heightPx,
        };
      })()`);
      if (!streamComplete?.busy) break;
      await wait(50);
    }
    assert.equal(streamComplete?.busy, false, JSON.stringify(streamComplete));
    assert.equal(streamComplete?.visible, 3, JSON.stringify(streamComplete));
    assert.equal(streamComplete?.hidden, 0, JSON.stringify(streamComplete));
    assert.ok(streamComplete?.height >= 800, JSON.stringify(streamComplete));

    const eraserPoint = await devTools.evaluate(`(async () => {
      const whiteboard = document.querySelector('[data-block-id="${targetId}"]');
      whiteboard.click();
      const eraser = document.querySelector('#whiteboard-toolbar [aria-label="Eraser"]');
      const toolBefore = whiteboard.whiteboardState.tool;
      eraser.click();
      const toolAfter = whiteboard.whiteboardState.tool;
      const canvas = whiteboard.querySelector('canvas');
      canvas.scrollIntoView({ behavior: 'instant', block: 'center' });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      let bounds = canvas.getBoundingClientRect();
      const initialTargetY = bounds.top + 295 * bounds.height / canvas.height;
      if (initialTargetY < 80 || initialTargetY > window.innerHeight - 80) {
        window.scrollBy({ top: initialTargetY - 180, behavior: 'instant' });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        bounds = canvas.getBoundingClientRect();
      }
      return {
        x: bounds.left + 55 * bounds.width / canvas.width,
        y: bounds.top + 295 * bounds.height / canvas.height,
        tool_before: toolBefore,
        tool_after: toolAfter,
        eraser_connected: eraser.isConnected,
      };
    })()`);
    assert.equal(eraserPoint.tool_after, 'eraser', JSON.stringify(eraserPoint));
    await devTools.evaluate(`(() => {
      const canvas = document.querySelector('[data-block-id="${targetId}"] canvas');
      canvas.setPointerCapture = () => {};
      canvas.hasPointerCapture = () => false;
      canvas.releasePointerCapture = () => {};
      const common = {
        bubbles: true,
        cancelable: true,
        pointerId: 97,
        pointerType: 'mouse',
        button: 0,
        clientX: ${eraserPoint.x},
        clientY: ${eraserPoint.y},
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...common, buttons: 1 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...common, buttons: 0 }));
      return true;
    })()`);

    let eraserEvidence;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      eraserEvidence = await devTools.evaluate(`(() => {
        const whiteboard = document.querySelector('[data-block-id="${targetId}"]');
        return {
          annotation_count: whiteboard.whiteboardState.annotations.length,
          drawing: whiteboard.whiteboardState.drawing,
          selected_tool: whiteboard.whiteboardState.tool,
          stroke_count: whiteboard.whiteboardState.strokes.length,
          last_stroke: whiteboard.whiteboardState.strokes.at(-1) || null,
          pending_remove: whiteboard.whiteboardState.pendingOperations.some((operation) => (
            operation.type === 'whiteboard_remove_text' && operation.annotation_id === '${annotationId}'
          )),
          ai_state: document.querySelector('.bar').dataset.aiState,
        };
      })()`);
      if (eraserEvidence?.annotation_count === 0) break;
      await wait(50);
    }
    assert.equal(eraserEvidence?.annotation_count, 0, JSON.stringify(eraserEvidence));
    assert.equal(eraserEvidence?.pending_remove, true);
    assert.equal(eraserEvidence?.ai_state, 'idle');

    let persistedRemoval = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      persistedRemoval = document.blocks
        .find((block) => block.id === targetId).annotations.length === 0;
      if (persistedRemoval) break;
      await wait(50);
    }
    assert.equal(persistedRemoval, true, 'the erased AI annotation should stay deleted');
    assert.ok(appliedOperations.some((operation) => (
      operation.type === 'whiteboard_remove_text'
      && operation.annotation_id === annotationId
    )));
  } finally {
    devTools?.socket.close();
    if (chrome) {
      if (process.platform !== 'win32') {
        try {
          process.kill(-chrome.pid, 'SIGTERM');
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
      } else if (chrome.exitCode === null) {
        chrome.kill('SIGTERM');
      }
      if (chrome.exitCode === null) {
        await Promise.race([once(chrome, 'exit'), wait(3000)]);
      }
      await wait(250);
    }
    await application.close();
    if (profile && profile.startsWith(os.tmpdir() + path.sep + 'mdos-ui-verifier-')) {
      fs.rmSync(profile, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  }
});
