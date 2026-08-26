#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { URL } = require('node:url');
const { WORKSPACE_ROOT } = require('./lib/common');
const { callTool, listTools } = require('./mcp_server');

const UI_DIR = path.join(__dirname, 'ui');
const DOCUMENT_PREFIX = 'mdos_document_';
const MAX_BODY_BYTES = 24 * 1024 * 1024;

function documentToolSpecs() {
  return listTools().tools
    .filter((tool) => tool.name.startsWith(DOCUMENT_PREFIX) && tool.name !== 'mdos_document_save')
    .map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
}

function resultDocument(result) {
  return result?.structuredContent?.document || result?.document || null;
}

class CodexAppServerClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.cwd = path.resolve(options.cwd || WORKSPACE_ROOT);
    this.executable = options.executable || process.env.MDOS_CODEX_BIN || 'codex';
    this.spawnProcess = options.spawnProcess || spawn;
    this.toolRunner = options.toolRunner || callTool;
    this.pending = new Map();
    this.requestId = 0;
    this.process = null;
    this.threadId = null;
    this.turnId = null;
    this.activeTurn = false;
    this.stderr = [];
  }

  send(message) {
    if (!this.process || this.process.exitCode !== null) {
      throw new Error('Codex App Server is not running');
    }
    this.process.stdin.write(JSON.stringify(message) + '\n');
  }

  request(method, params = {}, timeout = 30000) {
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Codex App Server timeout: ' + method));
      }, timeout);
      this.pending.set(id, {
        method,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.send({ id, method, params });
    });
  }

  reply(id, result) {
    this.send({ id, result });
  }

  async runDynamicTool(message) {
    const params = message.params || {};
    const name = String(params.tool || '');
    if (!name.startsWith(DOCUMENT_PREFIX)) {
      this.reply(message.id, {
        success: false,
        contentItems: [{ type: 'inputText', text: 'Tool not allowed: ' + name }],
      });
      return;
    }
    this.emit('tool-started', { name });
    try {
      const result = await this.toolRunner(name, params.arguments || {});
      const document = resultDocument(result);
      if (document) this.emit('document-updated', { result, document });
      this.reply(message.id, {
        success: result?.isError !== true,
        contentItems: [{
          type: 'inputText',
          text: JSON.stringify(result?.structuredContent || result || {}, null, 2),
        }],
      });
      this.emit('tool-completed', { name, success: result?.isError !== true });
    } catch (error) {
      const detail = String(error?.message || error);
      this.reply(message.id, {
        success: false,
        contentItems: [{ type: 'inputText', text: detail }],
      });
      this.emit('tool-completed', { name, success: false, error: detail });
    }
  }

  handleServerRequest(message) {
    if (message.method === 'item/tool/call') {
      void this.runDynamicTool(message);
      return;
    }
    if (message.method === 'item/commandExecution/requestApproval'
      || message.method === 'item/fileChange/requestApproval') {
      this.reply(message.id, { decision: 'decline' });
      return;
    }
    if (message.method === 'item/permissions/requestApproval') {
      this.reply(message.id, { permissions: {}, scope: 'turn' });
      return;
    }
    if (message.method === 'item/tool/requestUserInput') {
      const questions = Array.isArray(message.params?.questions) ? message.params.questions : [];
      const answers = Object.fromEntries(questions
        .filter((question) => typeof question?.id === 'string')
        .map((question) => [question.id, { answers: [] }]));
      this.reply(message.id, { answers });
      return;
    }
    if (message.method === 'mcpServer/elicitation/request') {
      this.reply(message.id, { action: 'decline' });
      return;
    }
    this.send({
      id: message.id,
      error: { code: -32601, message: 'Unsupported App Server request: ' + message.method },
    });
  }

  handleMessage(message) {
    if (!message || typeof message !== 'object') return;
    if (message.id !== undefined && typeof message.method === 'string') {
      this.handleServerRequest(message);
      return;
    }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || pending.method + ' failed'));
      else pending.resolve(message.result || {});
      return;
    }
    const params = message.params || {};
    if (message.method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
      this.emit('assistant-delta', { delta: params.delta });
    } else if (message.method === 'turn/started') {
      this.activeTurn = true;
      this.turnId = params.turn?.id || this.turnId;
      this.emit('turn-started', { turnId: this.turnId });
    } else if (message.method === 'turn/completed') {
      this.activeTurn = false;
      this.turnId = null;
      this.emit('turn-completed', {
        status: params.turn?.status || 'completed',
        turn: params.turn || null,
      });
    } else if (message.method === 'error') {
      this.emit('agent-error', {
        message: params.error?.message || params.message || 'Codex App Server error',
      });
    }
  }

  async startThread() {
    const result = await this.request('thread/start', {
      cwd: this.cwd,
      approvalPolicy: 'never',
      sandbox: 'workspace-write',
      runtimeWorkspaceRoots: [this.cwd],
      serviceName: 'mdos_web_workspace',
      ephemeral: true,
      dynamicTools: documentToolSpecs(),
      developerInstructions: [
        'You are the Codex execution layer operating MD-OS (Artificial Prefrontal Cortex) in its repository.',
        'The user and assistant share one live WYSIWYG scratchpad named notes in the same web page.',
        'Treat it as a co-present working surface, not as a document that the user must explicitly save.',
        'For every request about the scratchpad or canvas, read notes and then use mdos_document_apply.',
        'Apply exactly one logical block operation per tool call so each valid change appears immediately in the live canvas.',
        'Use the revision returned by each call as expected_revision for the next operation.',
        'Preserve unrelated blocks and never ask the user to click Save.',
        'Discuss LaTeX source only when explicitly requested. Keep answers direct.',
      ].join(' '),
    });
    this.threadId = result.thread?.id || null;
    if (!this.threadId) throw new Error('Codex App Server returned no thread id');
    this.emit('thread-started', { threadId: this.threadId });
    return this.threadId;
  }

  async start() {
    if (this.process) return this.threadId;
    this.process = this.spawnProcess(
      this.executable,
      ['app-server', '--listen', 'stdio://'],
      { cwd: this.cwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    this.process.once('error', (error) => this.emit('agent-error', { message: error.message }));
    this.process.once('exit', (code, signal) => {
      const detail = 'Codex App Server stopped (' + (signal || code) + ')'
        + (this.stderr.length ? ': ' + this.stderr.slice(-8).join('\n') : '');
      for (const pending of this.pending.values()) pending.reject(new Error(detail));
      this.pending.clear();
      this.process = null;
      this.emit('agent-error', { message: detail });
    });
    readline.createInterface({ input: this.process.stdout }).on('line', (line) => {
      if (!line.trim()) return;
      try {
        this.handleMessage(JSON.parse(line));
      } catch (error) {
        this.emit('agent-error', { message: 'Invalid App Server response: ' + error.message });
      }
    });
    readline.createInterface({ input: this.process.stderr }).on('line', (line) => {
      this.stderr.push(line);
      if (this.stderr.length > 64) this.stderr.shift();
    });
    await this.request('initialize', {
      clientInfo: {
        name: 'md_os_web_workspace',
        title: 'MD-OS Web Workspace',
        version: '5.0.1',
      },
      capabilities: { experimentalApi: true },
    });
    this.send({ method: 'initialized', params: {} });
    return this.startThread();
  }

  async sendMessage(text, documentContext = '') {
    const message = String(text || '').trim();
    if (!message) throw new Error('Message is empty');
    if (!this.threadId) throw new Error('Chat is not ready');
    if (this.activeTurn) throw new Error('A turn is already running');
    this.activeTurn = true;
    this.emit('turn-started', { turnId: null });
    const context = String(documentContext || '').trim();
    const input = context
      ? message + '\n\nLIVE CANVAS CONTEXT (interface state):\n' + context
      : message;
    try {
      const result = await this.request('turn/start', {
        threadId: this.threadId,
        input: [{ type: 'text', text: input }],
        cwd: this.cwd,
        runtimeWorkspaceRoots: [this.cwd],
        approvalPolicy: 'never',
        sandboxPolicy: {
          type: 'workspaceWrite',
          writableRoots: [this.cwd],
          networkAccess: false,
        },
        summary: 'none',
      });
      this.turnId = result.turn?.id || this.turnId;
      return { threadId: this.threadId, turnId: this.turnId };
    } catch (error) {
      this.activeTurn = false;
      this.turnId = null;
      throw error;
    }
  }

  newThread() {
    if (this.activeTurn) throw new Error('A turn is already running');
    return this.startThread();
  }

  async close() {
    if (!this.process) return;
    const child = this.process;
    this.process = null;
    try { child.stdin.end(); } catch (_) { /* best effort */ }
    if (child.exitCode === null) child.kill('SIGTERM');
  }
}

function headers(type) {
  return {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self' data:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
  };
}

function sendJson(response, status, value) {
  response.writeHead(status, headers('application/json; charset=utf-8'));
  response.end(JSON.stringify(value) + '\n');
}

function sendFile(response, name) {
  try {
    response.writeHead(200, headers('text/html; charset=utf-8'));
    response.end(fs.readFileSync(path.join(UI_DIR, name)));
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error.message });
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    request.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error('Request body is too large'));
        request.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    request.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (_) {
        reject(new Error('Invalid JSON request'));
      }
    });
    request.on('error', reject);
  });
}

function createWebWorkspace(options = {}) {
  const agent = options.agent || Object.assign(new EventEmitter(), {
    start: async () => {},
    close: async () => {},
  });
  const toolRunner = options.toolRunner || callTool;
  const clients = new Set();
  let ready = false;
  let startupError = null;

  function broadcast(value) {
    const line = 'data: ' + JSON.stringify(value) + '\n\n';
    for (const client of clients) client.write(line);
  }

  agent.on('document-updated', ({ result, document }) => broadcast({
    type: 'document_updated',
    result,
    document: {
      document_id: document.document_id,
      revision: document.revision,
      title: document.title,
    },
  }));
  agent.on('agent-error', (value) => broadcast({ type: 'error', ...value }));

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');
    try {
      if (request.method === 'GET' && url.pathname === '/') {
        sendFile(response, 'document_editor.html');
      } else if (request.method === 'GET' && url.pathname === '/document') {
        sendFile(response, 'document_editor.html');
      } else if (request.method === 'GET' && url.pathname === '/favicon.ico') {
        response.writeHead(204, headers('image/x-icon'));
        response.end();
      } else if (request.method === 'GET' && url.pathname === '/api/status') {
        sendJson(response, ready ? 200 : 503, {
          ok: ready,
          ready,
          error: startupError,
        });
      } else if (request.method === 'GET' && url.pathname === '/api/events') {
        response.writeHead(200, { ...headers('text/event-stream; charset=utf-8'), Connection: 'keep-alive' });
        response.write('data: ' + JSON.stringify({
          type: 'status',
          ready,
          error: startupError,
        }) + '\n\n');
        clients.add(response);
        const keepAlive = setInterval(() => response.write(': keepalive\n\n'), 15000);
        request.on('close', () => {
          clearInterval(keepAlive);
          clients.delete(response);
        });
      } else if (request.method === 'POST' && url.pathname === '/api/document-flush') {
        broadcast({ type: 'document_flush' });
        sendJson(response, 202, { ok: true });
      } else if (request.method === 'POST' && url.pathname === '/api/document-tool') {
        const body = await readBody(request);
        const name = String(body.name || '');
        if (!name.startsWith(DOCUMENT_PREFIX)) {
          sendJson(response, 403, { ok: false, error: 'Tool not allowed: ' + name });
          return;
        }
        const result = await toolRunner(name, body.arguments || {});
        const document = resultDocument(result);
        if (document && ['mdos_document_apply', 'mdos_document_create'].includes(name)) agent.emit('document-updated', { result, document });
        sendJson(response, 200, result);
      } else {
        sendJson(response, 404, { ok: false, error: 'Not found' });
      }
    } catch (error) {
      const conflict = /already running/i.test(error.message || '');
      sendJson(response, conflict ? 409 : 400, { ok: false, error: String(error.message || error) });
    }
  });

  async function start() {
    try {
      await agent.start();
      ready = true;
      startupError = null;
      broadcast({ type: 'status', ready: true, threadId: agent.threadId || null });
    } catch (error) {
      ready = false;
      startupError = String(error.message || error);
      broadcast({ type: 'status', ready: false, error: startupError });
      throw error;
    }
  }

  async function close() {
    for (const client of clients) client.end();
    clients.clear();
    await agent.close();
    if (!server.listening) return;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  return { agent, broadcast, close, server, start };
}

function parseArguments(argv) {
  const options = {
    host: process.env.MDOS_WEB_HOST || '127.0.0.1',
    port: Number.parseInt(process.env.MDOS_WEB_PORT || '4173', 10),
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--host') options.host = argv[++index];
    else if (argv[index] === '--port') options.port = Number.parseInt(argv[++index], 10);
    else throw new Error('Unknown option: ' + argv[index]);
  }
  if (!options.host) throw new Error('Host is required');
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error('Port must be between 1 and 65535');
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const application = createWebWorkspace();
  await application.start();
  await new Promise((resolve, reject) => {
    application.server.once('error', reject);
    application.server.listen(options.port, options.host, resolve);
  });
  process.stdout.write('MD-OS web workspace: http://' + options.host + ':' + options.port + '\n');
  const shutdown = async () => {
    await application.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write('ERROR: ' + (error.message || error) + '\n');
    process.exit(1);
  });
}

module.exports = {
  CodexAppServerClient,
  createWebWorkspace,
  documentToolSpecs,
  parseArguments,
};
