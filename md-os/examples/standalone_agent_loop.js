#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');

const DEFAULT_READ_FILES = [
  'AGENTS.md',
  'ME.md',
  'README.md',
  'md-os/kb/README.md',
  'md-os/kb/OPERATIONS.md',
  'md-os/ops/global_index.md',
  'md-os/ops/continuity.md',
  'md-os/ops/state.json',
  'md-os/ops/last_summary.md',
];

function usage() {
  process.stderr.write([
    'Usage:',
    '  node md-os/examples/standalone_agent_loop.js "task text"',
    '  node md-os/examples/standalone_agent_loop.js --apply "task text"',
    '',
    'Environment:',
    '  MDOS_AGENT_PROVIDER=ollama|openai-compatible',
    '  MDOS_AGENT_MODEL=<model>',
    '  MDOS_AGENT_BASE_URL=<provider endpoint>',
    '  MDOS_AGENT_API_KEY=<api key for openai-compatible providers>',
    '',
  ].join('\n'));
  process.exit(1);
}

function readFileSafe(relativePath, maxBytes = 40000) {
  const filePath = path.join(WORKSPACE_ROOT, relativePath);
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) return '';
    const text = fs.readFileSync(filePath, 'utf8');
    return text.length > maxBytes ? `${text.slice(0, maxBytes)}\n[TRUNCATED]` : text;
  } catch (_) {
    return '';
  }
}

function buildPrompt(taskText) {
  const context = DEFAULT_READ_FILES.map((file) => {
    const content = readFileSafe(file);
    return `--- ${file} ---\n${content || '[missing]'}\n`;
  }).join('\n');

  return [
    'You are operating MD-OS APFC v5.0 as a standalone host loop.',
    'Read the repository context and return only JSON.',
    '',
    'Allowed output shape:',
    '{',
    '  "summary": "short host decision",',
    '  "signals": [',
    '    { "project_id": "demo_general_system", "summary": "bounded source signal" }',
    '  ],',
    '  "run_replay": true',
    '}',
    '',
    'Rules:',
    '- Do not request arbitrary shell execution.',
    '- Prefer source signals over direct state mutation.',
    '- Use existing project IDs from the global index.',
    '- Keep summaries concise and operational.',
    '',
    `User task:\n${taskText}`,
    '',
    `Repository context:\n${context}`,
  ].join('\n');
}

async function callOllama(prompt) {
  const baseUrl = process.env.MDOS_AGENT_BASE_URL || 'http://127.0.0.1:11434/api/chat';
  const model = process.env.MDOS_AGENT_MODEL || 'llama3.1';
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    }),
  });
  if (!response.ok) throw new Error(`OLLAMA_REQUEST_FAILED: ${response.status}`);
  const payload = await response.json();
  return payload && payload.message && payload.message.content || '';
}

async function callOpenAiCompatible(prompt) {
  const baseUrl = process.env.MDOS_AGENT_BASE_URL || 'https://api.openai.com/v1/chat/completions';
  const model = process.env.MDOS_AGENT_MODEL;
  const apiKey = process.env.MDOS_AGENT_API_KEY;
  if (!model) throw new Error('MDOS_AGENT_MODEL_REQUIRED');
  if (!apiKey) throw new Error('MDOS_AGENT_API_KEY_REQUIRED');

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    }),
  });
  if (!response.ok) throw new Error(`OPENAI_COMPATIBLE_REQUEST_FAILED: ${response.status}`);
  const payload = await response.json();
  return payload && payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content || '';
}

async function callModel(prompt) {
  const provider = process.env.MDOS_AGENT_PROVIDER || 'ollama';
  if (provider === 'ollama') return callOllama(prompt);
  if (provider === 'openai-compatible') return callOpenAiCompatible(prompt);
  throw new Error(`UNKNOWN_MDOS_AGENT_PROVIDER: ${provider}`);
}

function parseModelJson(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  const payload = JSON.parse(jsonText);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('MODEL_JSON_MUST_BE_OBJECT');
  }
  if (payload.signals !== undefined && !Array.isArray(payload.signals)) {
    throw new Error('MODEL_SIGNALS_MUST_BE_ARRAY');
  }
  return payload;
}

function runScript(scriptName, args = []) {
  const result = spawnSync(process.execPath, [path.join(WORKSPACE_ROOT, 'mcp', 'os', scriptName), ...args], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`SCRIPT_FAILED: ${scriptName}\n${result.stderr}`);
  }
  return String(result.stdout || '').trim();
}

function applyDecision(decision) {
  const signals = Array.isArray(decision.signals) ? decision.signals : [];
  const touchedProjects = new Set();
  for (const signal of signals) {
    const projectId = String(signal.project_id || '').trim();
    const summary = String(signal.summary || '').trim();
    if (!projectId || !summary) continue;
    runScript('register_manual_signal.js', [projectId, summary]);
    touchedProjects.add(projectId);
  }

  for (const projectId of touchedProjects) {
    runScript('build_project_state.js', [projectId]);
  }
  if (touchedProjects.size) {
    runScript('build_global_agenda.js');
    runScript('build_global_index.js');
  }
  if (decision.run_replay === true) {
    runScript('mdos_cli.js', ['replay']);
  }

  return {
    applied_signal_count: signals.length,
    touched_projects: Array.from(touchedProjects).sort(),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args[0] === '--apply';
  const taskText = apply ? args.slice(1).join(' ') : args.join(' ');
  if (!taskText) usage();

  const prompt = buildPrompt(taskText);
  const rawModelText = await callModel(prompt);
  const decision = parseModelJson(rawModelText);
  const applied = apply ? applyDecision(decision) : null;

  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: 'standalone_agent_loop',
    apply,
    decision,
    applied,
  }, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}
