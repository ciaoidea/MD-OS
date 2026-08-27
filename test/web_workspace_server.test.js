'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const {
  createWebWorkspace,
  documentToolSpecs,
  normalizeWhiteboardStreamEvent,
  parseArguments,
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

  async sendMessage(message, context) {
    this.messages.push({ message, context });
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
  const application = createWebWorkspace({
    agent,
    toolRunner: async (name, args) => {
      toolCalls.push({ name, args });
      return {
        content: [{ type: 'text', text: 'ok' }],
        structuredContent: {
          document: { document_id: 'notes', title: 'Notes', revision: 1, blocks: [] },
        },
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

    const editor = await fetch(base + '/document');
    assert.equal(editor.status, 200);
    const editorHtml = await editor.text();
    assert.match(editorHtml, /contentEditable|contenteditable/);
    assert.doesNotMatch(editorHtml, /id="save"/);

    const status = await fetch(base + '/api/status').then((response) => response.json());
    assert.equal(status.ready, true);

    const eventController = new AbortController();
    const eventResponse = await fetch(base + '/api/events', { signal: eventController.signal });
    assert.equal(eventResponse.status, 200);
    const eventReader = eventResponse.body.getReader();
    const initialEvent = Buffer.from((await eventReader.read()).value).toString('utf8');
    assert.match(initialEvent, /"type":"status"/);

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

    const forbidden = await fetch(base + '/api/document-tool', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'mdos_terminal_run', arguments: {} }),
    });
    assert.equal(forbidden.status, 403);
  } finally {
    await application.close();
  }
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
  assert.throws(() => normalizeWhiteboardStreamEvent({}), /segment is empty/);
});
