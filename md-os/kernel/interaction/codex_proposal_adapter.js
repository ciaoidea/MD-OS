#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { WORKSPACE_ROOT } = require('../../os/lib/common');
const { validateProposal } = require('./proposal_contract');

const DEFAULT_SCHEMA_PATH = path.join(WORKSPACE_ROOT, 'md-os', 'schemas', 'interactive_proposal.schema.json');
const DEFAULT_TIMEOUT_MS = 180000;
const MAX_PROCESS_OUTPUT = 2 * 1024 * 1024;

function catalogueForPrompt(actionCatalogue) {
  if (!actionCatalogue.length) return '- No interactive actions are currently registered.';
  return actionCatalogue.map((action) => {
    const required = action.required_parameters.length
      ? action.required_parameters.join(', ')
      : 'none';
    return [
      `- ${action.module_id}.${action.command_name}`,
      `  capability: ${action.capability_id}`,
      `  risk: ${action.risk}`,
      `  required parameters: ${required}`,
      `  summary: ${action.summary}`,
    ].join('\n');
  }).join('\n');
}

function conversationForPrompt(conversation) {
  const bounded = (conversation || []).slice(-8);
  if (!bounded.length) return '[no previous turns]';
  return bounded.map((entry) => {
    const role = entry.role === 'assistant' ? 'MD-OS' : 'INPUT';
    const text = String(entry.text || '').slice(0, 4000);
    return `${role}: ${text}`;
  }).join('\n\n');
}

function buildProposalPrompt({ inputEvent, conversation, actionCatalogue }) {
  return [
    'You are the bounded reasoning component inside the MD-OS Interactive Executive Runtime.',
    'MD-OS owns the interaction loop. You produce a proposal; you do not commit an action.',
    '',
    'Hard boundaries:',
    '- Operate read-only. Do not edit files, execute a requested action, or mutate external state.',
    '- Return exactly one JSON object matching the supplied output schema.',
    '- Use lane "action" only when the requested effect needs one registered action below.',
    '- Never invent a module, capability, command, or parameter.',
    '- An action proposal remains pending until MD-OS validates it and a human explicitly approves it.',
    '- For non-action lanes, every action field must be empty and action.requested must be false.',
    '- Encode action parameters as a JSON array of {"name":"...","value":"..."} entries; use [] when there are none.',
    '- Do not claim that an executor result is a verified physical or external effect.',
    '- Keep response useful to the source, and keep summary compact.',
    '',
    'The six MD-OS artifact and control categories are:',
    '1. Markdown: method and semantic links.',
    '2. JSON: contracts and state.',
    '3. NDJSON: event history.',
    '4. Executors: real action.',
    '5. Sensors: observed effect.',
    '6. Verifiers: evidence-grounded outcome status.',
    '',
    'Registered interactive actions:',
    catalogueForPrompt(actionCatalogue),
    '',
    'Recent ephemeral interaction context:',
    conversationForPrompt(conversation),
    '',
    'Current typed input event:',
    JSON.stringify(inputEvent, null, 2),
  ].join('\n');
}

function runProcess(command, args, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const input = String(options.input || '');
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || WORKSPACE_ROOT,
      env: options.env || process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    }

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(new Error(`CODEX_PROPOSAL_TIMEOUT: ${timeoutMs}`));
    }, timeoutMs);

    child.on('error', (error) => finish(new Error(`CODEX_PROPOSAL_SPAWN_FAILED: ${error.message}`)));
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > MAX_PROCESS_OUTPUT) {
        child.kill('SIGTERM');
        finish(new Error('CODEX_PROPOSAL_STDOUT_TOO_LARGE'));
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > MAX_PROCESS_OUTPUT) {
        child.kill('SIGTERM');
        finish(new Error('CODEX_PROPOSAL_STDERR_TOO_LARGE'));
      }
    });
    child.on('close', (status, signal) => finish(null, { status, signal, stdout, stderr }));
    child.stdin.end(input);
  });
}

class CodexProposalAdapter {
  constructor(options = {}) {
    this.codexBin = options.codexBin || process.env.MDOS_CODEX_BIN || 'codex';
    this.codexPrefixArgs = options.codexPrefixArgs || [];
    this.model = options.model || process.env.MDOS_CODEX_MODEL || '';
    this.workspaceRoot = options.workspaceRoot || WORKSPACE_ROOT;
    this.schemaPath = options.schemaPath || DEFAULT_SCHEMA_PATH;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.runProcess = options.runProcess || runProcess;
  }

  async propose({ inputEvent, conversation = [], actionCatalogue = [] }) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-control-console-'));
    const outputPath = path.join(tempDir, 'proposal.json');
    const args = [
      ...this.codexPrefixArgs,
      'exec',
      '--ephemeral',
      '--ignore-user-config',
      '--sandbox',
      'read-only',
      '--color',
      'never',
      '--output-schema',
      this.schemaPath,
      '--output-last-message',
      outputPath,
      '--cd',
      this.workspaceRoot,
      '-c',
      'approval_policy="never"',
    ];
    if (this.model) args.push('--model', this.model);
    args.push('-');

    try {
      const prompt = buildProposalPrompt({ inputEvent, conversation, actionCatalogue });
      const result = await this.runProcess(this.codexBin, args, {
        cwd: this.workspaceRoot,
        env: process.env,
        input: prompt,
        timeoutMs: this.timeoutMs,
      });
      if (result.status !== 0) {
        const detail = String(result.stderr || result.stdout || '').trim().slice(-4000);
        throw new Error(`CODEX_PROPOSAL_FAILED: status=${result.status} ${detail}`.trim());
      }
      if (!fs.existsSync(outputPath)) throw new Error('CODEX_PROPOSAL_OUTPUT_MISSING');
      const raw = fs.readFileSync(outputPath, 'utf8').trim();
      if (!raw) throw new Error('CODEX_PROPOSAL_OUTPUT_EMPTY');
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        throw new Error(`CODEX_PROPOSAL_OUTPUT_NOT_JSON: ${error.message}`);
      }
      return {
        proposal: validateProposal(parsed),
        adapter_readback: {
          provider: 'codex_cli',
          command: 'codex exec',
          ephemeral: true,
          sandbox: 'read-only',
          output_schema: path.relative(this.workspaceRoot, this.schemaPath).replace(/\\/g, '/'),
        },
      };
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

module.exports = {
  CodexProposalAdapter,
  buildProposalPrompt,
  runProcess,
};
