#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { ControlConsoleHistory } = require('../kernel/interaction/control_console_history');
const { CodexProposalAdapter } = require('../kernel/interaction/codex_proposal_adapter');
const { InteractiveExecutiveRuntime } = require('../kernel/interaction/interactive_executive_runtime');
const { printJson, WORKSPACE_ROOT } = require('./lib/common');

const ASSET_ROOT = path.join(__dirname, 'control_console');
const DEFAULT_PORT = 4937;
const LOOPBACK_HOST = '127.0.0.1';
const MAX_BODY_BYTES = 128 * 1024;

const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
});

function checkCodex(codexBin = process.env.MDOS_CODEX_BIN || 'codex') {
  const result = spawnSync(codexBin, ['--version'], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`CODEX_NOT_AVAILABLE: ${String(result.stderr || result.stdout || '').trim()}`);
  }
  return String(result.stdout || '').trim();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('REQUEST_BODY_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(new Error(`REQUEST_BODY_INVALID_JSON: ${error.message}`));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = `${JSON.stringify(payload)}\n`;
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  res.end(body);
}

function sendAsset(res, assetName, token) {
  const assetPath = path.join(ASSET_ROOT, assetName);
  if (!fs.existsSync(assetPath)) {
    sendJson(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });
    return;
  }
  const extension = path.extname(assetPath);
  let body = fs.readFileSync(assetPath);
  if (assetName === 'index.html') {
    body = Buffer.from(body.toString('utf8').replaceAll('{{MDOS_CONSOLE_TOKEN}}', token), 'utf8');
  }
  res.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'Content-Type': CONTENT_TYPES[extension] || 'application/octet-stream',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  res.end(body);
}

function originAllowed(req, port) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

function mutationAuthorized(req, token, port) {
  if (!originAllowed(req, port)) return false;
  const supplied = String(req.headers['x-mdos-console-token'] || '');
  if (!supplied || supplied.length !== token.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(token));
}

function errorStatus(error) {
  const message = String(error && error.message || 'UNKNOWN_ERROR');
  if (message.includes('NOT_FOUND')) return 404;
  if (message.includes('NOT_PENDING')) return 409;
  if (message.includes('REQUIRES_HUMAN_OPERATOR')) return 403;
  if (message.includes('CODEX_PROPOSAL_FAILED')) return 502;
  return 400;
}

function createHandler({ runtime, token, portRef }) {
  return async function handler(req, res) {
    const requestUrl = new URL(req.url || '/', `http://${LOOPBACK_HOST}`);
    const pathname = requestUrl.pathname;

    try {
      if (req.method === 'GET' && pathname === '/') return sendAsset(res, 'index.html', token);
      if (req.method === 'GET' && pathname === '/app.js') return sendAsset(res, 'app.js', token);
      if (req.method === 'GET' && pathname === '/styles.css') return sendAsset(res, 'styles.css', token);
      if (req.method === 'GET' && pathname === '/api/status') {
        return sendJson(res, 200, { ...runtime.status(), actions: runtime.actionCatalogue });
      }
      if (req.method === 'GET' && pathname === '/api/events') {
        return sendJson(res, 200, { ok: true, events: runtime.listEvents() });
      }

      if (req.method === 'POST') {
        if (!mutationAuthorized(req, token, portRef.value)) {
          return sendJson(res, 403, { ok: false, error: 'CONTROL_CONSOLE_REQUEST_FORBIDDEN' });
        }
        if (pathname === '/api/proposals') {
          const body = await readBody(req);
          const result = await runtime.propose(body);
          return sendJson(res, 200, result);
        }
        const decisionMatch = pathname.match(/^\/api\/proposals\/(proposal_[a-f0-9-]{16,64})\/decision$/);
        if (decisionMatch) {
          const body = await readBody(req);
          const result = runtime.decide(decisionMatch[1], String(body.decision || ''), {
            source_type: 'human',
            authority: 'operator',
          });
          return sendJson(res, 200, result);
        }
      }

      return sendJson(res, 404, { ok: false, error: 'CONTROL_CONSOLE_ROUTE_NOT_FOUND' });
    } catch (error) {
      return sendJson(res, errorStatus(error), {
        ok: false,
        error: String(error.message || error),
      });
    }
  };
}

function openBrowser(url) {
  let command;
  let args;
  if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (process.platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else {
    command = 'xdg-open';
    args = [url];
  }
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

function startControlConsole(options = {}) {
  const port = options.port === undefined ? DEFAULT_PORT : options.port;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`CONTROL_CONSOLE_PORT_INVALID: ${port}`);
  const codexVersion = options.runtime
    ? 'provided-runtime'
    : options.skipCodexCheck ? 'test-double' : checkCodex(options.codexBin);
  let runtime = options.runtime;
  if (!runtime) {
    const adapter = options.adapter || new CodexProposalAdapter({
      codexBin: options.codexBin,
      model: options.model,
    });
    const history = options.history || new ControlConsoleHistory({
      mode: options.historyMode || 'commands',
    });
    runtime = new InteractiveExecutiveRuntime({ adapter, history });
  }
  const token = options.token || crypto.randomBytes(32).toString('hex');
  const portRef = { value: port };
  const server = http.createServer(createHandler({ runtime, token, portRef }));

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK_HOST, () => {
      server.removeListener('error', reject);
      const address = server.address();
      portRef.value = address.port;
      const url = `http://${LOOPBACK_HOST}:${address.port}/`;
      resolve({
        server,
        runtime,
        token,
        url,
        codexVersion,
        close: () => new Promise((closeResolve, closeReject) => {
          server.close((error) => error ? closeReject(error) : closeResolve());
        }),
      });
    });
  });
}

function parseArgs(argv) {
  const args = argv.slice();
  const command = args[0] && !args[0].startsWith('-') ? args.shift() : 'start';
  if (command !== 'start') {
    throw new Error('USAGE: control_console start [--port <port>] [--no-open] [--model <model>] [--save-chat|--no-history]');
  }
  let port = DEFAULT_PORT;
  let open = true;
  let model = '';
  let historyMode = 'commands';
  while (args.length) {
    const flag = args.shift();
    if (flag === '--no-open') {
      open = false;
    } else if (flag === '--port') {
      port = Number.parseInt(args.shift(), 10);
    } else if (flag === '--model') {
      model = String(args.shift() || '');
    } else if (flag === '--save-chat') {
      historyMode = 'full';
    } else if (flag === '--no-history') {
      historyMode = 'off';
    } else {
      throw new Error(`CONTROL_CONSOLE_UNKNOWN_OPTION: ${flag}`);
    }
  }
  return { port, open, model, historyMode };
}

function usageText() {
  return [
    'Usage:',
    '  mdos-console [--port <port>] [--no-open] [--model <model>] [--save-chat|--no-history]',
    '  mdos console start [same options]',
    '',
    'MD-OS owns the interaction loop. Preauthorized native commands bypass Codex; natural language invokes Codex as an ephemeral read-only proposal engine.',
  ].join('\n');
}

async function runControlConsole(argv = process.argv.slice(2)) {
  if (argv.length === 1 && ['--help', '-h', 'help'].includes(argv[0])) {
    process.stdout.write(`${usageText()}\n`);
    return;
  }
  const options = parseArgs(argv);
  const consoleRuntime = await startControlConsole(options);
  const runtimeStatus = consoleRuntime.runtime.status();
  printJson({
    ok: true,
    mode: 'mdos_control_console',
    url: consoleRuntime.url,
    bind: 'loopback_only',
    codex: consoleRuntime.codexVersion,
    model_mode: 'ephemeral_read_only_typed_proposal',
    automatic_execution: false,
    bootstrap_codex_unchanged: true,
    history: runtimeStatus.history,
  });
  if (options.open) openBrowser(consoleRuntime.url);

  const shutdown = async () => {
    await consoleRuntime.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (require.main === module) {
  runControlConsole().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  checkCodex,
  createHandler,
  parseArgs,
  runControlConsole,
  startControlConsole,
  usageText,
};
