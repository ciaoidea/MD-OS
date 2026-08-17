#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { CodexProposalAdapter } = require('../md-os/kernel/interaction/codex_proposal_adapter');
const { ControlConsoleHistory } = require('../md-os/kernel/interaction/control_console_history');
const { InteractiveExecutiveRuntime } = require('../md-os/kernel/interaction/interactive_executive_runtime');
const {
  NativeCommandLane,
  loadPolicy,
  parseDirectArgv,
} = require('../md-os/kernel/interaction/native_command_lane');
const {
  normalizeInputEvent,
  resolveProposalAction,
  validateProposal,
} = require('../md-os/kernel/interaction/proposal_contract');
const { startControlConsole } = require('../md-os/os/control_console');

const REPO_ROOT = path.resolve(__dirname, '..');

function emptyAction() {
  return {
    requested: false,
    capability_id: '',
    module_id: '',
    command_name: '',
    parameters: [],
    expected_effect: '',
    required_sensor: '',
    required_verifier: '',
  };
}

function answerProposal() {
  return {
    schema_version: 1,
    lane: 'answer',
    summary: 'A bounded answer.',
    response: 'This is a read-only answer.',
    epistemic_status: 'supported_inference',
    action: emptyAction(),
  };
}

function actionProposal() {
  return {
    schema_version: 1,
    lane: 'action',
    summary: 'List registered terminal commands.',
    response: 'I propose a read-only connector catalogue request.',
    epistemic_status: 'proposal',
    action: {
      requested: true,
      capability_id: 'terminal.run_allowlisted',
      module_id: 'connector.terminal',
      command_name: 'list',
      parameters: [],
      expected_effect: 'A terminal connector catalogue is returned.',
      required_sensor: 'executor.readback',
      required_verifier: 'json.parse_and_exit_status',
    },
  };
}

function testRegistry() {
  return {
    modules: [
      {
        module_id: 'connector.terminal',
        capabilities: [
          {
            capability_id: 'terminal.run_allowlisted',
            risk: 'medium',
          },
        ],
        commands: [
          {
            command_name: 'list',
            summary: 'List terminal commands.',
            mcp_tool: {
              argument_order: [],
              input_schema: {
                type: 'object',
                additionalProperties: false,
                properties: {},
                required: [],
              },
            },
          },
        ],
      },
    ],
  };
}

function humanOperator() {
  return { source_type: 'human', authority: 'operator' };
}

test('interactive input source determines authority and content type', () => {
  const human = normalizeInputEvent({ source_type: 'human', content: 'hello' });
  const agent = normalizeInputEvent({ source_type: 'agent', content: 'candidate action' });
  const sensor = normalizeInputEvent({ source_type: 'sensor', content: 'temperature=20' });

  assert.equal(human.authority, 'operator');
  assert.equal(agent.authority, 'advisory');
  assert.equal(sensor.authority, 'evidentiary');
  assert.equal(sensor.content_type, 'sensor_observation');
});

test('native command policy is explicit, read-only, bounded, and schema-backed', () => {
  const policy = loadPolicy();
  const schema = JSON.parse(fs.readFileSync(
    path.join(REPO_ROOT, 'md-os/schemas/interactive_native_command_policy.schema.json'),
    'utf8'
  ));
  const receiptSchema = JSON.parse(fs.readFileSync(
    path.join(REPO_ROOT, 'md-os/schemas/interactive_native_command_receipt.schema.json'),
    'utf8'
  ));
  assert.equal(policy.boundary, 'md-os');
  assert.equal(policy.model_bypass, true);
  assert.equal(policy.invocation_mode, 'direct_argv_no_shell');
  assert.ok(policy.commands.some((command) => command.command_name === 'ls'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(receiptSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
});

test('native command parser supports quotes but refuses shell composition syntax', () => {
  assert.deepEqual(parseDirectArgv('ls -la "directory name"'), ['ls', '-la', 'directory name']);
  assert.throws(() => parseDirectArgv('ls | whoami'), /SHELL_SYNTAX_REJECTED/);
  assert.throws(() => parseDirectArgv('ls $(whoami)'), /SHELL_SYNTAX_REJECTED/);
  assert.throws(() => parseDirectArgv("ls 'unterminated"), /QUOTING_INVALID/);
});

test('human native ls bypasses the model and returns bounded executor readback', async () => {
  const boundaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-native-boundary-'));
  fs.writeFileSync(path.join(boundaryRoot, 'visible.txt'), 'bounded\n', 'utf8');
  let adapterCalls = 0;
  const runtime = new InteractiveExecutiveRuntime({
    registry: testRegistry(),
    nativeLane: new NativeCommandLane({ boundaryRoot }),
    adapter: {
      propose: async () => {
        adapterCalls += 1;
        throw new Error('MODEL_MUST_NOT_RUN_FOR_NATIVE_LS');
      },
    },
  });

  const result = await runtime.propose({ source_type: 'human', content: 'ls -la' });
  assert.equal(adapterCalls, 0);
  assert.equal(result.mode, 'native_command_execution');
  assert.equal(result.native_command.command_name, 'ls');
  assert.equal(result.native_command.model_bypassed, true);
  assert.equal(result.gate.status, 'preauthorized_by_native_policy');
  assert.match(result.receipt.observation.stdout, /visible\.txt/);
  assert.equal(result.receipt.verification.status, 'unverified');
});

test('native filesystem lane stays inside its MD-OS boundary and keeps a virtual cwd', () => {
  const boundaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-native-cwd-'));
  fs.mkdirSync(path.join(boundaryRoot, 'kb'));
  const lane = new NativeCommandLane({ boundaryRoot });

  const changed = lane.execute('cd kb', humanOperator());
  assert.equal(changed.ok, true);
  assert.equal(changed.cwd, 'md-os/kb');
  assert.match(lane.execute('pwd', humanOperator()).stdout, /\/kb\n$/);
  assert.throws(() => lane.execute('cd ../..', humanOperator()), /CD_OUTSIDE_MDOS/);
  assert.throws(() => lane.execute('ls ../..', humanOperator()), /PATH_OUTSIDE_MDOS/);
});

test('advisory agents cannot cross the native command lane', () => {
  const boundaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-native-authority-'));
  const lane = new NativeCommandLane({ boundaryRoot });
  assert.throws(
    () => lane.execute('ls', { source_type: 'agent', authority: 'advisory' }),
    /REQUIRES_HUMAN_OPERATOR/
  );
});

test('commands outside native policy continue through the typed Codex proposal route', async () => {
  const boundaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-native-fallback-'));
  let adapterCalls = 0;
  const runtime = new InteractiveExecutiveRuntime({
    registry: testRegistry(),
    nativeLane: new NativeCommandLane({ boundaryRoot }),
    adapter: {
      propose: async () => {
        adapterCalls += 1;
        return {
          proposal: validateProposal(answerProposal()),
          adapter_readback: { provider: 'test', sandbox: 'read-only' },
        };
      },
    },
  });
  const result = await runtime.propose({ source_type: 'human', content: 'explain this request' });
  assert.equal(adapterCalls, 1);
  assert.equal(result.mode, 'interactive_proposal');
  assert.equal(result.status, 'completed_without_action');
});

test('proposal contract refuses action fields in a non-action lane', () => {
  const invalid = answerProposal();
  invalid.action.module_id = 'connector.terminal';
  assert.throws(() => validateProposal(invalid), /NON_ACTION_LANE_ACTION_FIELDS_MUST_BE_EMPTY/);
  assert.equal(validateProposal(answerProposal()).lane, 'answer');
});

test('action route omits absent optional arguments instead of emitting undefined', () => {
  const registry = testRegistry();
  registry.modules[0].commands[0].mcp_tool.argument_order = ['optional_filter'];
  registry.modules[0].commands[0].mcp_tool.input_schema.properties.optional_filter = { type: 'string' };
  const route = resolveProposalAction(validateProposal(actionProposal()), registry);
  assert.deepEqual(route.args, []);
});

test('runtime rejects an unregistered model action before the human gate', async () => {
  const invalidAction = actionProposal();
  invalidAction.action.module_id = 'connector.invented';
  const runtime = new InteractiveExecutiveRuntime({
    registry: testRegistry(),
    adapter: {
      propose: async () => ({
        proposal: validateProposal(invalidAction),
        adapter_readback: { provider: 'test', sandbox: 'read-only' },
      }),
    },
  });

  await assert.rejects(
    runtime.propose({ source_type: 'human', content: 'Run an invented connector.' }),
    /PROPOSAL_MODULE_NOT_REGISTERED/
  );
  assert.equal(runtime.proposals.size, 0);
});

test('natural-language shell history stores commands locally without making a full transcript', () => {
  const localStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-console-history-'));
  const history = new ControlConsoleHistory({
    localStateRoot,
    rootDir: path.join(localStateRoot, 'control-console'),
    mode: 'commands',
    sessionId: 'session_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  });
  const inputEvent = normalizeInputEvent({ source_type: 'human', content: 'private natural-language command' });
  history.appendCommand(inputEvent);
  history.appendEvent('input_received', { input_event_id: inputEvent.event_id }, { input_event: inputEvent });
  history.appendEvent('proposal_validated', { lane: 'answer' }, { response: 'private model response' });

  const commandHistory = fs.readFileSync(history.historyPath, 'utf8');
  const sessionHistory = fs.readFileSync(history.sessionPath, 'utf8');
  assert.match(commandHistory, /private natural-language command/);
  assert.doesNotMatch(sessionHistory, /private natural-language command/);
  assert.doesNotMatch(sessionHistory, /private model response/);
  assert.match(sessionHistory, /"previous_hash"/);
  assert.equal(history.readback().canonical_memory, false);
});

test('full console transcript requires explicit full history mode', () => {
  const localStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-console-full-history-'));
  const history = new ControlConsoleHistory({
    localStateRoot,
    rootDir: path.join(localStateRoot, 'control-console'),
    mode: 'full',
    sessionId: 'session_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  });
  history.appendEvent('proposal_validated', { lane: 'answer' }, { response: 'persisted only by explicit choice' });
  assert.match(fs.readFileSync(history.sessionPath, 'utf8'), /persisted only by explicit choice/);
  assert.equal(history.readback().transcript_saved, true);
});

test('Codex adapter uses ephemeral read-only schema-constrained exec', async () => {
  let captured = null;
  const adapter = new CodexProposalAdapter({
    codexBin: 'codex-test-double',
    workspaceRoot: REPO_ROOT,
    schemaPath: path.join(REPO_ROOT, 'md-os/schemas/interactive_proposal.schema.json'),
    runProcess: async (command, args, options) => {
      captured = { command, args, options };
      const outputIndex = args.indexOf('--output-last-message');
      fs.writeFileSync(args[outputIndex + 1], `${JSON.stringify(answerProposal())}\n`, 'utf8');
      return { status: 0, signal: null, stdout: '', stderr: '' };
    },
  });

  const result = await adapter.propose({
    inputEvent: normalizeInputEvent({ source_type: 'human', content: 'Explain the current state.' }),
    conversation: [],
    actionCatalogue: [],
  });

  assert.equal(result.proposal.lane, 'answer');
  assert.equal(captured.command, 'codex-test-double');
  assert.ok(captured.args.includes('exec'));
  assert.ok(captured.args.includes('--ephemeral'));
  assert.equal(captured.args[captured.args.indexOf('--sandbox') + 1], 'read-only');
  assert.ok(captured.args.includes('--output-schema'));
  assert.match(captured.options.input, /MD-OS owns the interaction loop/);
});

test('runtime cannot execute before a human operator approves once', async () => {
  let executionCount = 0;
  const runtime = new InteractiveExecutiveRuntime({
    registry: testRegistry(),
    adapter: {
      propose: async () => ({
        proposal: validateProposal(actionProposal()),
        adapter_readback: { provider: 'test', sandbox: 'read-only' },
      }),
    },
    executor: (route) => {
      executionCount += 1;
      return {
        ok: true,
        status: 0,
        signal: null,
        stdout: '{"ok":true,"mode":"terminal_connector_list"}\n',
        stderr: '',
        module_id: route.module_id,
        command_name: route.command_name,
      };
    },
  });

  const proposed = await runtime.propose({ source_type: 'human', content: 'List terminal commands.' });
  assert.equal(proposed.status, 'pending_human_approval');
  assert.equal(executionCount, 0);

  assert.throws(() => runtime.decide(proposed.proposal_id, 'approve', {
    source_type: 'agent',
    authority: 'advisory',
  }), /REQUIRES_HUMAN_OPERATOR/);
  assert.equal(executionCount, 0);

  const executed = runtime.decide(proposed.proposal_id, 'approve', {
    source_type: 'human',
    authority: 'operator',
  });
  assert.equal(executionCount, 1);
  assert.equal(executed.status, 'executed_unverified');
  assert.equal(executed.receipt.verification.status, 'unverified');
  assert.throws(() => runtime.decide(proposed.proposal_id, 'approve', {
    source_type: 'human',
    authority: 'operator',
  }), /NOT_PENDING/);
  assert.equal(executionCount, 1);
});

test('Control Console is loopback-only and rejects mutation without its token', async (t) => {
  const runtime = {
    actionCatalogue: [],
    status: () => ({ ok: true, model_adapter: 'test', registered_interactive_action_count: 0 }),
    listEvents: () => [],
    propose: async () => ({ ok: true, proposal: answerProposal() }),
    decide: () => ({ ok: true }),
  };
  const token = 'a'.repeat(64);
  const consoleServer = await startControlConsole({
    port: 0,
    runtime,
    token,
    skipCodexCheck: true,
  });
  t.after(() => consoleServer.close());

  assert.match(consoleServer.url, /^http:\/\/127\.0\.0\.1:/);
  const page = await fetch(consoleServer.url);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /MD-OS Control Console/);

  const forbidden = await fetch(new URL('/api/proposals', consoleServer.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_type: 'human', content: 'hello' }),
  });
  assert.equal(forbidden.status, 403);

  const allowed = await fetch(new URL('/api/proposals', consoleServer.url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-MDOS-Console-Token': token,
    },
    body: JSON.stringify({ source_type: 'human', content: 'hello' }),
  });
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).ok, true);
});

test('global mdos-console installer links the console runtime, not a bootstrap', () => {
  const installer = fs.readFileSync(path.join(REPO_ROOT, 'install-md-os-console.sh'), 'utf8');
  const executable = fs.readFileSync(path.join(REPO_ROOT, 'md-os/os/mdos_console.js'), 'utf8');
  assert.match(installer, /md-os\/os\/mdos_console\.js/);
  assert.doesNotMatch(installer, /CONSOLE_SOURCE=.*bootstrap/);
  assert.match(executable, /runControlConsole/);
  assert.match(executable, /MDOS_WORKSPACE_ROOT/);

  const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-console-install-'));
  const installResult = spawnSync('bash', [path.join(REPO_ROOT, 'install-md-os-console.sh')], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, XDG_BIN_HOME: installRoot },
  });
  assert.equal(installResult.status, 0, installResult.stderr);
  const installedCommand = path.join(installRoot, 'mdos-console');
  assert.equal(fs.lstatSync(installedCommand).isSymbolicLink(), true);
  assert.equal(fs.realpathSync(installedCommand), path.join(REPO_ROOT, 'md-os/os/mdos_console.js'));

  const helpResult = spawnSync(installedCommand, ['--help'], {
    cwd: os.tmpdir(),
    encoding: 'utf8',
    env: process.env,
  });
  assert.equal(helpResult.status, 0, helpResult.stderr);
  assert.match(helpResult.stdout, /mdos-console/);
});
