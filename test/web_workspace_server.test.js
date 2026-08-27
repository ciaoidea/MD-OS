'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  aiAssistPrompt,
  aiToolResultText,
  createWebWorkspace,
  documentToolSpecs,
  isLoopbackRequest,
  normalizeAiAssistRequest,
  normalizeWhiteboardStreamEvent,
  parseArguments,
  prepareAiPdfContext,
} = require('../md-os/os/web_workspace_server');

class FakeAgent extends EventEmitter {
  constructor() {
    super();
    this.threadId = null;
    this.activeTurn = false;
    this.messages = [];
  }

  async start() {
    this.threadId = 'thread_test';
    this.emit('thread-started', { threadId: this.threadId });
  }

  async sendMessage(message, context, attachments = {}) {
    this.messages.push({ message, context, attachments });
    this.activeTurn = true;
    this.emit('turn-started', { turnId: 'turn_test' });
    this.emit('assistant-delta', { delta: 'Risposta locale' });
    this.activeTurn = false;
    this.emit('turn-completed', { status: 'completed' });
    return { threadId: this.threadId, turnId: 'turn_test' };
  }

  async newThread() {
    this.threadId = 'thread_new';
    this.emit('thread-started', { threadId: this.threadId });
    return this.threadId;
  }

  async close() {}
}

async function listen(application) {
  await application.start();
  await new Promise((resolve) => application.server.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + application.server.address().port;
}

test('web workspace root serves only the live WYSIWYG document canvas', async () => {
  const agent = new FakeAgent();
  let documentUpdates = 0;
  agent.on('document-updated', () => { documentUpdates += 1; });
  const toolCalls = [];
  let pdfCleanupCount = 0;
  let pdfExportCleanupCount = 0;
  let pdfExportCount = 0;
  const application = createWebWorkspace({
    agent,
    toolRunner: async (name, args) => {
      toolCalls.push({ name, args });
      if (name === 'mdos_document_export') {
        return {
          structuredContent: {
            export: {
              document_id: 'notes',
              revision: 1,
              format: 'pdf',
              path: 'md-os/ops/documents/notes/exports/notes.pdf',
              bytes: 2048,
            },
          },
        };
      }
      return {
        content: [{ type: 'text', text: 'ok' }],
        structuredContent: {
          document: { document_id: 'notes', title: 'Notes', revision: 1, blocks: [] },
        },
      };
    },
    temporaryPdfExporter: async (args) => {
      pdfExportCount += 1;
      assert.deepEqual(args, { document_id: 'notes', format: 'pdf' });
      return {
        document_id: 'notes',
        revision: 1,
        format: 'pdf',
        path: '/tmp/mdos-ai-context-notes.pdf',
        bytes: 2048,
        temporary: true,
        cleanup: () => { pdfExportCleanupCount += 1; },
      };
    },
    pdfPageRenderer: async (_pdfPath, rendererOptions) => {
      assert.deepEqual(rendererOptions, { allowTemporary: true });
      return {
        pagePaths: ['/tmp/notes-page-1.jpg', '/tmp/notes-page-2.jpg'],
        cleanup: () => { pdfCleanupCount += 1; },
      };
    },
  });
  const base = await listen(application);
  try {
    const page = await fetch(base + '/');
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /contentEditable|contenteditable/);
    assert.match(html, /\/api\/document-tool/);
    assert.match(html, /new EventSource\('\/api\/events'\)/);
    assert.doesNotMatch(html, /id="conversation"/);
    assert.doesNotMatch(html, /id="composer"/);
    assert.doesNotMatch(html, /id="document-frame"/);
    assert.doesNotMatch(html, /id="save"/);
    assert.ok(html.includes('id="save-notes-file"'));
    assert.ok(html.includes('id="open-notes-file"'));
    assert.ok(html.includes('id="new-notes-file"'));
    assert.ok(html.includes('id="ai-assist"'));

    const editor = await fetch(base + '/document');
    assert.equal(editor.status, 200);
    const editorHtml = await editor.text();
    assert.match(editorHtml, /contentEditable|contenteditable/);
    assert.doesNotMatch(editorHtml, /id="save"/);

    const status = await fetch(base + '/api/status').then((response) => response.json());
    assert.equal(status.ready, true);
    assert.match(status.instance_id, /^[0-9a-f-]{36}$/);

    const eventController = new AbortController();
    const eventResponse = await fetch(base + '/api/events', { signal: eventController.signal });
    assert.equal(eventResponse.status, 200);
    const eventReader = eventResponse.body.getReader();
    const initialEvent = Buffer.from((await eventReader.read()).value).toString('utf8');
    assert.match(initialEvent, /"type":"status"/);
    assert.match(initialEvent, /"instance_id":"[0-9a-f-]{36}"/);

    const chat = await fetch(base + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Modifica il documento', document_context: 'revision 1' }),
    });
    assert.equal(chat.status, 404);
    assert.deepEqual(agent.messages, []);

    const tool = await fetch(base + '/api/document-tool', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'mdos_document_read',
        arguments: { document_id: 'notes' },
      }),
    });
    assert.equal(tool.status, 200);
    assert.equal((await tool.json()).structuredContent.document.document_id, 'notes');
    assert.deepEqual(toolCalls, [{
      name: 'mdos_document_read',
      args: { document_id: 'notes' },
    }]);
    assert.equal(documentUpdates, 0);

    const streamed = await fetch(base + '/api/whiteboard-stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        document_id: 'notes',
        block_id: 'b_aaaaaaaaaaaaaaaa',
        client_id: 'c_bbbbbbbbbbbbbbbb',
        sequence: 7,
        stroke: {
          id: 's_cccccccccccccccc',
          tool: 'pen',
          color: '#202124',
          points: [{ x: 10, y: 20, width: 5 }],
        },
      }),
    });
    assert.equal(streamed.status, 202);
    assert.deepEqual(await streamed.json(), { ok: true, sequence: 7 });
    assert.equal(toolCalls.length, 1, 'stream previews must not call a disk-backed document tool');
    const streamedEvent = await Promise.race([
      eventReader.read(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SSE preview timeout')), 1000)),
    ]);
    assert.match(Buffer.from(streamedEvent.value).toString('utf8'), /"type":"whiteboard_stream"/);
    assert.match(Buffer.from(streamedEvent.value).toString('utf8'), /"sequence":7/);
    eventController.abort();

    const invalidStream = await fetch(base + '/api/whiteboard-stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ document_id: 'notes', points: [] }),
    });
    assert.equal(invalidStream.status, 400);

    const aiEventController = new AbortController();
    const aiEventResponse = await fetch(base + '/api/events', { signal: aiEventController.signal });
    const aiEventReader = aiEventResponse.body.getReader();
    await aiEventReader.read();
    const ai = await fetch(base + '/api/ai-assist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        document_id: 'notes',
        revision: 1,
        block_id: 'b_aaaaaaaaaaaaaaaa',
        target_type: 'rich',
        target_text: 'Quanto fa 2 + 2?',
        response_position: { x: 40, y: 80 },
      }),
    });
    assert.equal(ai.status, 202);
    const aiResponse = await ai.json();
    assert.equal(aiResponse.ok, true);
    assert.equal(aiResponse.pdf_cache_hit, false);
    assert.equal(aiResponse.pdf_page_count, 2);
    assert.equal(agent.messages.length, 1);
    assert.match(agent.messages[0].message, /directly and completely/);
    assert.match(agent.messages[0].message, /exactly the requested content/);
    assert.match(agent.messages[0].message, /complete PDF exported from saved document revision 1/);
    assert.match(agent.messages[0].message, /PDF pages are context only/);
    assert.match(agent.messages[0].message, /current modification request is only the latest bounded target/);
    assert.match(agent.messages[0].context, /"block_id":"b_aaaaaaaaaaaaaaaa"/);
    assert.match(agent.messages[0].context, /"pdf_context":\{"path":"\/tmp\/mdos-ai-context-notes\.pdf"/);
    assert.deepEqual(agent.messages[0].attachments, {
      pdfPagePaths: ['/tmp/notes-page-1.jpg', '/tmp/notes-page-2.jpg'],
      imageUrl: '',
    });
    assert.equal(pdfCleanupCount, 0, 'the current revision stays cached after the AI turn');
    assert.equal(pdfExportCount, 1);
    assert.equal(
      toolCalls.some((call) => call.name === 'mdos_document_export'),
      false,
      'Ask AI must not create its context PDF inside the MD-OS document directory',
    );
    let aiEvents = '';
    for (let attempt = 0; attempt < 5 && !aiEvents.includes('"type":"ai_progress"'); attempt += 1) {
      const chunk = await Promise.race([
        aiEventReader.read(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SSE AI progress timeout')), 1000)),
      ]);
      aiEvents += Buffer.from(chunk.value || []).toString('utf8');
    }
    aiEventController.abort();
    assert.match(aiEvents, /"type":"ai_progress"/);
    assert.match(aiEvents, /"phase":"composing"/);
    assert.match(aiEvents, /"characters":15/);

    const cachedAi = await fetch(base + '/api/ai-assist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        document_id: 'notes',
        revision: 1,
        block_id: 'b_aaaaaaaaaaaaaaaa',
        target_type: 'rich',
        target_text: 'Quanto fa 2 + 2?',
        response_position: { x: 40, y: 80 },
      }),
    });
    assert.equal(cachedAi.status, 202);
    const cachedResponse = await cachedAi.json();
    assert.equal(cachedResponse.pdf_cache_hit, true);
    assert.equal(agent.messages.length, 2);
    assert.equal(
      pdfExportCount,
      1,
      'the same saved revision reuses its temporary PDF pages',
    );

    const save = await fetch(base + '/api/document-tool', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'mdos_document_save',
        arguments: { document_id: 'notes', expected_revision: 1, blocks: [] },
      }),
    });
    assert.equal(save.status, 200);
    assert.equal(documentUpdates, 1);

    const forbidden = await fetch(base + '/api/document-tool', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'mdos_terminal_run', arguments: {} }),
    });
    assert.equal(forbidden.status, 403);
  } finally {
    await application.close();
  }
  assert.equal(pdfCleanupCount, 1, 'closing the workspace removes cached PDF pages');
  assert.equal(pdfExportCleanupCount, 1, 'closing the workspace removes the cached temporary PDF');
});

test('PDF button export is temporary, exposes no host path, and streams inline to the browser', async () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-web-pdf-test-'));
  const pdfPath = path.join(temporaryDirectory, 'notes.pdf');
  const pdfBytes = Buffer.from('%PDF-1.4\n% temporary browser PDF\n%%EOF\n');
  fs.writeFileSync(pdfPath, pdfBytes);
  let cleanupCount = 0;
  const application = createWebWorkspace({
    agent: new FakeAgent(),
    temporaryPdfExporter: async (args) => ({
      document_id: args.document_id,
      revision: 11,
      format: 'pdf',
      engine: 'test',
      path: pdfPath,
      bytes: pdfBytes.length,
      temporary: true,
      cleanup: () => {
        cleanupCount += 1;
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
      },
    }),
  });
  const base = await listen(application);
  try {
    const generated = await fetch(base + '/api/pdf-export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ document_id: 'notes', revision: 11 }),
    });
    assert.equal(generated.status, 201);
    const output = await generated.json();
    assert.equal(output.ok, true);
    assert.match(output.open_url, /^\/api\/pdf\/[0-9a-f-]{36}$/);
    assert.equal(Object.hasOwn(output, 'path'), false);
    assert.doesNotMatch(JSON.stringify(output), /\/tmp|md-os\/ops/);

    const opened = await fetch(base + output.open_url);
    assert.equal(opened.status, 200);
    assert.equal(opened.headers.get('content-type'), 'application/pdf');
    assert.equal(opened.headers.get('content-disposition'), 'inline; filename="notes.pdf"');
    assert.deepEqual(Buffer.from(await opened.arrayBuffer()), pdfBytes);
    assert.equal(fs.existsSync(pdfPath), true, 'the browser can reopen the PDF during its short TTL');
  } finally {
    await application.close();
  }
  assert.equal(cleanupCount, 1);
  assert.equal(fs.existsSync(temporaryDirectory), false);
});

test('notes lifecycle control is loopback-only and exposes observable restart readback', async () => {
  let restarts = 0;
  let shutdowns = 0;
  const application = createWebWorkspace({
    agent: new FakeAgent(),
    requestRestart: () => { restarts += 1; },
    requestShutdown: () => { shutdowns += 1; },
  });
  const base = await listen(application);
  try {
    const status = await (await fetch(base + '/api/status')).json();
    assert.equal(status.ready, true);
    assert.equal(status.pid, process.pid);

    const restart = await fetch(base + '/api/restart', { method: 'POST' });
    assert.equal(restart.status, 202);
    assert.equal((await restart.json()).restarting, true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(restarts, 1);

    const shutdown = await fetch(base + '/api/shutdown', { method: 'POST' });
    assert.equal(shutdown.status, 202);
    assert.equal((await shutdown.json()).shutting_down, true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(shutdowns, 1);

    assert.equal(isLoopbackRequest({ socket: { remoteAddress: '127.0.0.1' } }), true);
    assert.equal(isLoopbackRequest({ socket: { remoteAddress: '::ffff:127.0.0.1' } }), true);
    assert.equal(isLoopbackRequest({ socket: { remoteAddress: '192.168.1.20' } }), false);
  } finally {
    await application.close();
  }
});

test('AI assist is explicit, bounded to one target, and accepts only a transient Whiteboard image', () => {
  const imageUrl = 'data:image/png;base64,AA==';
  const request = normalizeAiAssistRequest({
    document_id: 'notes',
    revision: 7,
    block_id: 'b_aaaaaaaaaaaaaaaa',
    target_type: 'whiteboard',
    image_url: imageUrl,
    response_position: { x: -20, y: 9999 },
  });
  assert.equal(request.image_url, imageUrl);
  assert.deepEqual(request.response_position, { x: 20, y: 7920 });
  const prompt = aiAssistPrompt(request);
  assert.match(prompt, /exactly one whiteboard_add_text operation/);
  assert.match(prompt, /font_size 48/);
  assert.match(prompt, /wraps before the right margin/);
  assert.match(prompt, /annotation\.latex with valid LaTeX/);
  assert.match(prompt, /full remaining Whiteboard width/);
  assert.match(prompt, /one complete logical step per row/);
  assert.match(prompt, /directly and completely/);
  assert.doesNotMatch(prompt, /genuinely brief|never more than 240|one short rich-text block/);
  assert.match(prompt, /Preserve every unrelated block/);
  assert.match(prompt, /untrusted content/);
  const notesPrompt = aiAssistPrompt(normalizeAiAssistRequest({
    document_id: 'notes',
    revision: 7,
    block_id: 'b_aaaaaaaaaaaaaaaa',
    target_type: 'rich',
    target_text: 'Write the requested result in full',
  }));
  assert.match(notesPrompt, /one complete rich-text block/);
  assert.match(notesPrompt, /formula blocks with valid LaTeX and display=true/);
  assert.match(notesPrompt, /never write it on a Whiteboard/);
  assert.match(notesPrompt, /never fabricate image bytes/);
  assert.match(notesPrompt, /exactly the requested content/);
  assert.doesNotMatch(notesPrompt, /short rich-text block/);
  assert.throws(() => normalizeAiAssistRequest({
    document_id: 'notes',
    revision: 7,
    block_id: 'b_aaaaaaaaaaaaaaaa',
    target_type: 'whiteboard',
  }), /requires a recent handwriting image/);

  const serverSource = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../md-os/os/web_workspace_server.js'),
    'utf8',
  );
  assert.match(serverSource, /sandbox: 'read-only'/);
  assert.match(serverSource, /type: 'readOnly'/);
  assert.match(serverSource, /networkAccess: false/);
  assert.match(serverSource, /AI_DOCUMENT_TOOLS = new Set\(\['mdos_document_read', 'mdos_document_apply'\]\)/);
  assert.match(serverSource, /AI prewarm failed:/);
});

test('Ask AI prepares a current PDF and rejects stale document context', async () => {
  const request = normalizeAiAssistRequest({
    document_id: 'notes',
    revision: 9,
    block_id: 'b_aaaaaaaaaaaaaaaa',
    target_type: 'rich',
    target_text: 'Use the complete document to make this change',
  });
  const calls = [];
  const current = await prepareAiPdfContext(request, async (name, args) => {
    calls.push({ name, args });
    return {
      structuredContent: {
        export: {
          document_id: 'notes',
          revision: 9,
          format: 'pdf',
          path: 'md-os/ops/documents/notes/exports/notes.pdf',
          bytes: 4096,
        },
      },
    };
  }, async () => ({
    pagePaths: ['/tmp/pdf-page-1.jpg', '/tmp/pdf-page-2.jpg'],
    cleanup: () => {},
  }));
  assert.deepEqual(calls, [{
    name: 'mdos_document_export',
    args: { document_id: 'notes', format: 'pdf' },
  }]);
  assert.equal(current.revision, 9);
  assert.equal(current.page_count, 2);
  assert.deepEqual(current.pagePaths, ['/tmp/pdf-page-1.jpg', '/tmp/pdf-page-2.jpg']);

  await assert.rejects(
    prepareAiPdfContext(request, async () => ({
      structuredContent: {
        export: {
          document_id: 'notes',
          revision: 8,
          format: 'pdf',
          path: 'md-os/ops/documents/notes/exports/notes.pdf',
        },
      },
    }), async () => ({ pagePaths: ['/tmp/stale.jpg'] })),
    /revision mismatch/,
  );
});

test('AI tool readback keeps structure but omits duplicate Base64 image text', () => {
  const image = 'data:image/png;base64,' + 'A'.repeat(20000);
  const text = aiToolResultText({
    structuredContent: {
      document: {
        document_id: 'notes',
        revision: 4,
        blocks: [{
          id: 'b_aaaaaaaaaaaaaaaa',
          type: 'image',
          data_uri: image,
          alt: 'diagram',
        }],
      },
    },
  });
  assert.match(text, /"document_id": "notes"/);
  assert.match(text, /"revision": 4/);
  assert.match(text, /available in attached PDF/);
  assert.match(text, /mime=image\/png/);
  assert.doesNotMatch(text, /A{100}/);
  assert.ok(text.length < 1000);
});

test('dynamic tools are document-only and launcher arguments are bounded', () => {
  const tools = documentToolSpecs();
  assert.ok(tools.length >= 6);
  assert.ok(tools.every((tool) => (
    tool.type === 'function' && tool.name.startsWith('mdos_document_')
  )));
  assert.ok(tools.some((tool) => tool.name === 'mdos_document_apply'));
  assert.ok(tools.every((tool) => tool.name !== 'mdos_document_save'));
  assert.deepEqual(parseArguments(['--host', '127.0.0.1', '--port', '4317']), {
    host: '127.0.0.1',
    port: 4317,
  });
  assert.deepEqual(parseArguments(['--host', '0.0.0.0', '--port', '4173']), {
    host: '0.0.0.0',
    port: 4173,
  });
  assert.throws(() => parseArguments(['--port', '70000']), /between 1 and 65535/);
  assert.throws(() => parseArguments(['--public']), /Unknown option/);
});

test('Whiteboard stream events are bounded and normalized without persistence', () => {
  const points = Array.from({ length: 300 }, (_, index) => ({
    x: index * 10,
    y: -index,
    width: 100,
  }));
  const event = normalizeWhiteboardStreamEvent({
    document_id: 'notes',
    block_id: 'b_aaaaaaaaaaaaaaaa',
    client_id: 'c_bbbbbbbbbbbbbbbb',
    sequence: 3,
    final: true,
    stroke: {
      id: 's_cccccccccccccccc',
      tool: 'eraser',
      color: '#ff0000',
      points,
    },
  });
  assert.equal(event.stroke.points.length, 256);
  assert.deepEqual(event.stroke.points[0], { x: 0, y: 0, width: 64 });
  assert.deepEqual(event.stroke.points.at(-1), { x: 1600, y: 0, width: 64 });
  assert.equal(event.stroke.color, '#ffffff');
  assert.equal(event.final, true);
  const extended = normalizeWhiteboardStreamEvent({
    document_id: 'notes',
    block_id: 'b_aaaaaaaaaaaaaaaa',
    client_id: 'c_bbbbbbbbbbbbbbbb',
    sequence: 4,
    stroke: {
      id: 's_dddddddddddddddd',
      tool: 'pen',
      color: '#202124',
      points: [{ x: 80, y: 7600, width: 5 }],
    },
  });
  assert.equal(extended.stroke.points[0].y, 7600);
  assert.throws(() => normalizeWhiteboardStreamEvent({}), /segment is empty/);
});
