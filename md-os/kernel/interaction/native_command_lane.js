#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  MDOS_ROOT,
  assertInsideRoot,
} = require('../../os/lib/common');

const DEFAULT_POLICY_PATH = path.join(__dirname, 'native_command_policy.json');
const COMMAND_NAME_RE = /^[a-z][a-z0-9_-]{0,80}$/;
const POLICY_ID_RE = /^[a-z][a-z0-9_-]*(\.[a-z0-9_-]+)+$/;
const EXECUTION_KINDS = new Set(['builtin', 'process']);
const ARGUMENT_POLICIES = new Set([
  'none',
  'bounded_directory',
  'bounded_ls',
  'opaque_read_only',
  'options_only',
]);
const SAFE_LS_SHORT_OPTIONS = /^[AadfFghHilnopqRrSstux1]+$/;
const SAFE_LS_LONG_OPTIONS = new Set([
  '--all',
  '--almost-all',
  '--author',
  '--classify',
  '--directory',
  '--dereference-command-line-symlink-to-dir',
  '--file-type',
  '--group-directories-first',
  '--human-readable',
  '--inode',
  '--literal',
  '--no-group',
  '--numeric-uid-gid',
  '--recursive',
  '--reverse',
  '--size',
  '--time=atime',
  '--time=access',
  '--time=ctime',
  '--time=status',
  '--time=use',
  '--time=creation',
  '--time=birth',
  '--sort=none',
  '--sort=size',
  '--sort=time',
  '--sort=version',
  '--sort=extension',
  '--color=always',
  '--color=auto',
  '--color=never',
  '--hyperlink=always',
  '--hyperlink=auto',
  '--hyperlink=never',
]);

function positiveInteger(value, label, maximum = 1000000) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`NATIVE_COMMAND_POLICY_${label}_INVALID`);
  }
  return value;
}

function validatePolicy(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('NATIVE_COMMAND_POLICY_MUST_BE_OBJECT');
  }
  const expected = [
    'schema_version',
    'policy_id',
    'boundary',
    'model_bypass',
    'invocation_mode',
    'default_timeout_ms',
    'max_stdout_bytes',
    'max_stderr_bytes',
    'commands',
  ];
  const unexpected = Object.keys(payload).filter((key) => !expected.includes(key));
  if (unexpected.length) throw new Error(`NATIVE_COMMAND_POLICY_UNEXPECTED_FIELDS: ${unexpected.join(',')}`);
  if (payload.schema_version !== 1) throw new Error('NATIVE_COMMAND_POLICY_SCHEMA_VERSION_UNSUPPORTED');
  if (!POLICY_ID_RE.test(String(payload.policy_id || ''))) throw new Error('NATIVE_COMMAND_POLICY_ID_INVALID');
  if (payload.boundary !== 'md-os') throw new Error('NATIVE_COMMAND_POLICY_BOUNDARY_INVALID');
  if (payload.model_bypass !== true) throw new Error('NATIVE_COMMAND_POLICY_MODEL_BYPASS_REQUIRED');
  if (payload.invocation_mode !== 'direct_argv_no_shell') throw new Error('NATIVE_COMMAND_POLICY_INVOCATION_MODE_INVALID');
  if (!Array.isArray(payload.commands) || !payload.commands.length) throw new Error('NATIVE_COMMAND_POLICY_COMMANDS_REQUIRED');

  const commands = payload.commands.map((command, index) => {
    if (!command || typeof command !== 'object' || Array.isArray(command)) {
      throw new Error(`NATIVE_COMMAND_POLICY_COMMAND_${index}_INVALID`);
    }
    const keys = ['command_name', 'execution_kind', 'argument_policy', 'fixed_args'];
    const commandUnexpected = Object.keys(command).filter((key) => !keys.includes(key));
    const commandMissing = keys.filter((key) => !Object.prototype.hasOwnProperty.call(command, key));
    if (commandUnexpected.length || commandMissing.length) {
      throw new Error(`NATIVE_COMMAND_POLICY_COMMAND_${index}_FIELDS_INVALID`);
    }
    const commandName = String(command.command_name || '');
    if (!COMMAND_NAME_RE.test(commandName)) throw new Error(`NATIVE_COMMAND_POLICY_COMMAND_NAME_INVALID: ${commandName}`);
    if (!EXECUTION_KINDS.has(command.execution_kind)) throw new Error(`NATIVE_COMMAND_POLICY_EXECUTION_KIND_INVALID: ${commandName}`);
    if (!ARGUMENT_POLICIES.has(command.argument_policy)) throw new Error(`NATIVE_COMMAND_POLICY_ARGUMENT_POLICY_INVALID: ${commandName}`);
    if (!Array.isArray(command.fixed_args) || command.fixed_args.some((item) => typeof item !== 'string')) {
      throw new Error(`NATIVE_COMMAND_POLICY_FIXED_ARGS_INVALID: ${commandName}`);
    }
    return {
      command_name: commandName,
      execution_kind: command.execution_kind,
      argument_policy: command.argument_policy,
      fixed_args: command.fixed_args.slice(),
    };
  });
  const names = commands.map((command) => command.command_name);
  if (new Set(names).size !== names.length) throw new Error('NATIVE_COMMAND_POLICY_COMMAND_DUPLICATE');

  return {
    schema_version: 1,
    policy_id: payload.policy_id,
    boundary: payload.boundary,
    model_bypass: true,
    invocation_mode: payload.invocation_mode,
    default_timeout_ms: positiveInteger(payload.default_timeout_ms, 'TIMEOUT', 60000),
    max_stdout_bytes: positiveInteger(payload.max_stdout_bytes, 'MAX_STDOUT_BYTES'),
    max_stderr_bytes: positiveInteger(payload.max_stderr_bytes, 'MAX_STDERR_BYTES'),
    commands,
  };
}

function loadPolicy(policyPath = DEFAULT_POLICY_PATH) {
  return validatePolicy(JSON.parse(fs.readFileSync(policyPath, 'utf8')));
}

function firstCommandWord(text) {
  const match = String(text || '').trimStart().match(/^([a-z][a-z0-9_-]{0,80})(?=\s|$)/);
  return match ? match[1] : '';
}

function parseDirectArgv(text) {
  const input = String(text || '');
  if (!input.trim()) throw new Error('NATIVE_COMMAND_EMPTY');
  if (/[\r\n\0]/.test(input)) throw new Error('NATIVE_COMMAND_CONTROL_CHARACTER_REJECTED');
  const argv = [];
  let token = '';
  let quote = '';
  let escaped = false;
  let active = false;

  for (const character of input) {
    if (escaped) {
      token += character;
      escaped = false;
      active = true;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      active = true;
      continue;
    }
    if (quote) {
      if (character === quote) {
        quote = '';
      } else {
        token += character;
      }
      active = true;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      active = true;
      continue;
    }
    if (/\s/.test(character)) {
      if (active) {
        argv.push(token);
        token = '';
        active = false;
      }
      continue;
    }
    if ('|&;<>$`(){}'.includes(character)) {
      throw new Error(`NATIVE_COMMAND_SHELL_SYNTAX_REJECTED: ${character}`);
    }
    token += character;
    active = true;
  }
  if (escaped || quote) throw new Error('NATIVE_COMMAND_QUOTING_INVALID');
  if (active) argv.push(token);
  if (!argv.length) throw new Error('NATIVE_COMMAND_EMPTY');
  return argv;
}

function truncateBytes(text, maximum) {
  const buffer = Buffer.from(String(text || ''), 'utf8');
  if (buffer.length <= maximum) return String(text || '');
  return `${buffer.subarray(0, maximum).toString('utf8')}\n[TRUNCATED ${buffer.length - maximum} BYTES]`;
}

function relativeBoundaryPath(boundaryRoot, targetPath) {
  const relative = path.relative(boundaryRoot, targetPath).replace(/\\/g, '/');
  return relative ? `md-os/${relative}` : 'md-os';
}

function controlledEnvironment() {
  return {
    PATH: process.env.PATH || '',
    LANG: process.env.LANG || 'C.UTF-8',
    LC_ALL: process.env.LC_ALL || '',
    TERM: 'dumb',
  };
}

class NativeCommandLane {
  constructor(options = {}) {
    this.policy = options.policy || loadPolicy(options.policyPath);
    this.boundaryRoot = path.resolve(options.boundaryRoot || MDOS_ROOT);
    this.currentDirectory = assertInsideRoot(
      path.resolve(options.currentDirectory || this.boundaryRoot),
      this.boundaryRoot,
      'NATIVE_COMMAND_CWD_OUTSIDE_MDOS'
    );
    this.runProcess = options.runProcess || ((executable, args, spawnOptions) => spawnSync(executable, args, spawnOptions));
    this.commandMap = new Map(this.policy.commands.map((command) => [command.command_name, command]));
  }

  status() {
    return {
      enabled: true,
      policy_id: this.policy.policy_id,
      model_bypass: true,
      invocation_mode: this.policy.invocation_mode,
      boundary: this.policy.boundary,
      current_directory: relativeBoundaryPath(this.boundaryRoot, this.currentDirectory),
      commands: [...this.commandMap.keys()],
    };
  }

  matches(text) {
    return this.commandMap.has(firstCommandWord(text));
  }

  assertBoundedPath(candidate, errorCode = 'NATIVE_COMMAND_PATH_OUTSIDE_MDOS') {
    return assertInsideRoot(path.resolve(this.currentDirectory, candidate), this.boundaryRoot, errorCode);
  }

  normalizeLsArgs(args) {
    const normalized = [];
    let pathsOnly = false;
    for (const argument of args) {
      if (!pathsOnly && argument === '--') {
        pathsOnly = true;
        normalized.push(argument);
        continue;
      }
      if (!pathsOnly && argument.startsWith('--')) {
        if (!SAFE_LS_LONG_OPTIONS.has(argument)) throw new Error(`NATIVE_COMMAND_LS_OPTION_REJECTED: ${argument}`);
        normalized.push(argument);
        continue;
      }
      if (!pathsOnly && argument.startsWith('-') && argument !== '-') {
        if (!SAFE_LS_SHORT_OPTIONS.test(argument.slice(1))) {
          throw new Error(`NATIVE_COMMAND_LS_OPTION_REJECTED: ${argument}`);
        }
        normalized.push(argument);
        continue;
      }
      this.assertBoundedPath(argument || '.');
      normalized.push(argument);
    }
    return normalized;
  }

  normalizeArgs(command, args) {
    if (command.argument_policy === 'none') {
      if (args.length) throw new Error(`NATIVE_COMMAND_ARGUMENTS_REJECTED: ${command.command_name}`);
      return command.fixed_args.slice();
    }
    if (command.argument_policy === 'bounded_directory') {
      if (args.length > 1) throw new Error('NATIVE_COMMAND_CD_ARGUMENTS_REJECTED');
      return [args[0] || '.'];
    }
    if (command.argument_policy === 'bounded_ls') return this.normalizeLsArgs(args);
    if (command.argument_policy === 'options_only') {
      if (args.some((argument) => !argument.startsWith('-'))) {
        throw new Error(`NATIVE_COMMAND_NON_OPTION_ARGUMENT_REJECTED: ${command.command_name}`);
      }
      return [...command.fixed_args, ...args];
    }
    if (command.argument_policy === 'opaque_read_only') return [...command.fixed_args, ...args];
    throw new Error(`NATIVE_COMMAND_ARGUMENT_POLICY_UNSUPPORTED: ${command.argument_policy}`);
  }

  builtin(command, args) {
    if (command.command_name === 'pwd') {
      return {
        ok: true,
        status: 0,
        signal: null,
        stdout: `${this.currentDirectory}\n`,
        stderr: '',
      };
    }
    if (command.command_name === 'cd') {
      const destination = this.assertBoundedPath(args[0], 'NATIVE_COMMAND_CD_OUTSIDE_MDOS');
      if (!fs.existsSync(destination) || !fs.statSync(destination).isDirectory()) {
        throw new Error(`NATIVE_COMMAND_CD_NOT_DIRECTORY: ${args[0]}`);
      }
      this.currentDirectory = destination;
      return {
        ok: true,
        status: 0,
        signal: null,
        stdout: `${this.currentDirectory}\n`,
        stderr: '',
      };
    }
    throw new Error(`NATIVE_COMMAND_BUILTIN_UNSUPPORTED: ${command.command_name}`);
  }

  execute(text, source = {}) {
    const commandName = firstCommandWord(text);
    const command = this.commandMap.get(commandName);
    if (!command) return { matched: false };
    if (source.source_type !== 'human' || source.authority !== 'operator') {
      throw new Error('NATIVE_COMMAND_REQUIRES_HUMAN_OPERATOR');
    }
    const argv = parseDirectArgv(text);
    if (argv[0] !== commandName) throw new Error('NATIVE_COMMAND_NAME_MISMATCH');
    const args = this.normalizeArgs(command, argv.slice(1));
    const startedAt = Date.now();
    const result = command.execution_kind === 'builtin'
      ? this.builtin(command, args)
      : this.runProcess(commandName, args, {
          cwd: this.currentDirectory,
          encoding: 'utf8',
          env: controlledEnvironment(),
          timeout: this.policy.default_timeout_ms,
          maxBuffer: Math.max(this.policy.max_stdout_bytes, this.policy.max_stderr_bytes),
          shell: false,
        });
    const status = Number.isInteger(result.status) ? result.status : null;
    const stdout = truncateBytes(result.stdout || '', this.policy.max_stdout_bytes);
    const stderr = truncateBytes(result.stderr || result.error && result.error.message || '', this.policy.max_stderr_bytes);
    return {
      matched: true,
      ok: status === 0 && !result.error,
      policy_id: this.policy.policy_id,
      command_name: commandName,
      execution_kind: command.execution_kind,
      executable: command.execution_kind === 'builtin' ? `builtin:${commandName}` : commandName,
      args,
      cwd: relativeBoundaryPath(this.boundaryRoot, this.currentDirectory),
      status,
      signal: result.signal || null,
      duration_ms: Date.now() - startedAt,
      stdout,
      stderr,
      model_bypassed: true,
      invocation_mode: this.policy.invocation_mode,
    };
  }
}

module.exports = {
  NativeCommandLane,
  firstCommandWord,
  loadPolicy,
  parseDirectArgv,
  validatePolicy,
};
