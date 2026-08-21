#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { MDOS_ROOT, WORKSPACE_ROOT, printJson } = require('./lib/common');
const { replayRuntime } = require('./replay_runtime');
const {
  invokeModuleCommand,
  listCapabilities,
  listModules,
  resolveCliCommand,
} = require('../kernel/module_runtime');

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const CLI_NAME = process.env.MDOS_CLI_NAME || path.basename(process.argv[1] || 'cortex').replace(/\.js$/, '') || 'cortex';
const SCAFFOLD_ENTRIES = [
  'AGENTS.md',
  '.gitignore',
  '.graphifyignore',
  '.mdosignore',
  'ME.md',
  'README.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'Makefile',
  'docs',
  path.join('md-os', 'apfc'),
  path.join('md-os', 'benchmarks'),
  path.join('md-os', 'kb'),
  path.join('md-os', 'kernel'),
  path.join('md-os', 'modules'),
  path.join('md-os', 'schemas'),
  path.join('md-os', 'os'),
  path.join('md-os', 'shell'),
  path.join('md-os', 'examples'),
  'requirements-stt.txt',
  'requirements-tts.txt',
  'scripts',
  'test',
  'package.json',
  'bootstrap-md-os-codex.sh',
  'install-md-os-console.sh',
  'session-recovery.sh',
];

function usage() {
  const cli = CLI_NAME;
  process.stderr.write([
    'Usage:',
    `  ${cli} init [target_dir]`,
    `  ${cli} demo`,
    `  ${cli} signal <project_id> <summary>`,
    `  ${cli} propose-change <target_path> <summary>`,
    `  ${cli} compile-programs`,
    `  ${cli} build [all|<project_id>]`,
    `  ${cli} agenda`,
    `  ${cli} core`,
    `  ${cli} graph build`,
    `  ${cli} graphify status`,
    `  ${cli} graphify bootstrap`,
    `  ${cli} graphify build [target_dir]`,
    `  ${cli} graphify benchmark`,
    `  ${cli} graphify neural-map`,
    `  ${cli} graphify neural-open`,
    `  ${cli} graphify connector-map`,
    `  ${cli} graphify connector-open`,
    `  ${cli} graphify query <question>`,
    `  ${cli} graphify orient <question>`,
    `  ${cli} graphify open`,
    `  ${cli} semantic graph build`,
    `  ${cli} semantic status`,
    `  ${cli} semantic gate <proposal.json>`,
    `  ${cli} boot-summary`,
    `  ${cli} cycle status`,
    `  ${cli} cycle run-once`,
    `  ${cli} agi run-once --task "<task>"`,
    `  ${cli} cognition run-once --task-spec md-os/ops/tasks/<id>.json`,
    `  ${cli} agi eval`,
    `  ${cli} agi learn`,
    `  ${cli} agi promote`,
    `  ${cli} agi accelerate [--experiment-id <append_only_id>]`,
    `  ${cli} agi transfer [--experiment-id <append_only_id>] [--model <model>]`,
    `  ${cli} agi prove [--experiment-id <append_only_id>] [--cycles <24..256>] [--sessions <2..16>]`,
    `  ${cli} agi capability-lab [--experiment-id <id>] [--cycles <n>] [--sessions <n>] [--wall-minutes <n>]`,
    `  ${cli} agi evaluator-kit <seal|reference-run|keygen|finalize> ...`,
    `  ${cli} agi score`,
    `  ${cli} agi certify --report <signed_report.json> [--report <second.json>] --trust-store <external_trust_store.json>`,
    `  ${cli} agi evaluation-request`,
    `  ${cli} apfc status|build|verify|reconcile`,
    `  ${cli} apfc context --task-spec md-os/ops/tasks/<id>.json`,
    `  ${cli} apfc consolidate --run-once`,
    `  ${cli} apfc promote <skill_candidate_id> --approve`,
    `  ${cli} apfc rollback <promotion_receipt_id> --approve`,
    `  ${cli} apfc revoke <skill_id> --approve`,
    `  ${cli} apfc restore <revocation_receipt_id> --approve`,
    `  ${cli} apfc graphify build`,
    `  ${cli} benchmark software-repair generate --case <case.json> --provider <provider.json>`,
    `  ${cli} benchmark software-repair run --case <case.json> (--candidate-set <candidate_set.json> | --provider <provider.json>)`,
    `  ${cli} benchmark software-repair configurations`,
    `  ${cli} compile-runtime`,
    `  ${cli} runtime compile`,
    `  ${cli} module build-registry`,
    `  ${cli} module list`,
    `  ${cli} module run <module_id> <command> [args...]`,
    `  ${cli} capability list`,
    `  ${cli} apfc cognitive ingest <source.json>`,
    `  ${cli} apfc cognitive bind [frame_id]`,
    `  ${cli} apfc cognitive workspace [frame_id]`,
    `  ${cli} apfc cognitive gate [frame_id]`,
    `  ${cli} apfc cognitive predict [frame_id]`,
    `  ${cli} apfc cognitive run-cycle <source.json>`,
    `  ${cli} apfc cognitive reflect <request.json>`,
    `  ${cli} apfc cognitive reflect-intent <intent.json>`,
    `  ${cli} apfc cognitive status`,
    `  ${cli} knowledge import <import_id> <source_dir> [--initial-repository] [--copy-theory-sources] [--copy-raw-ext=.tex,.svg] [--copy-raw-suffix=.schema.json]`,
    `  ${cli} self release status`,
    `  ${cli} lifecycle`,
    `  ${cli} health`,
    `  ${cli} compact`,
    `  ${cli} archive`,
    `  ${cli} role intake <role_id>`,
    `  ${cli} role sensemake <role_id>`,
    `  ${cli} hardware bootstrap`,
    `  ${cli} hardware list`,
    `  ${cli} hardware run <natural_language_intent>`,
    `  ${cli} hardware audio <status|volume|mute|unmute|toggle>`,
    `  ${cli} hardware display <status|brightness|enable|disable>`,
    `  ${cli} hardware screen capture`,
    `  ${cli} hardware clean`,
    `  ${cli} device discover`,
    `  ${cli} device clean`,
    `  ${cli} software bootstrap`,
    `  ${cli} software list`,
    `  ${cli} software clean`,
    `  ${cli} apps discover`,
    `  ${cli} services discover`,
    `  ${cli} audio volume up|down [step_percent]`,
    `  ${cli} audio volume set <percent>`,
    `  ${cli} audio volume zero`,
    `  ${cli} audio mute|unmute|toggle`,
    `  ${cli} audio speak <text>`,
    `  ${cli} display status`,
    `  ${cli} display brightness set <percent> [output]`,
    `  ${cli} screen capture`,
    `  ${cli} live status`,
    `  ${cli} live start`,
    `  ${cli} live stop`,
    `  ${cli} live restart`,
    `  ${cli} continuity status`,
    `  ${cli} continuity start`,
    `  ${cli} continuity stop`,
    `  ${cli} continuity restart`,
    `  ${cli} connector list`,
    `  ${cli} connector run <project_id> <command_id>`,
    `  ${cli} connector terminal list`,
    `  ${cli} connector terminal run <project_id> <command_id>`,
    `  ${cli} connector api list`,
    `  ${cli} connector api run <project_id> <request_id>`,
    `  ${cli} connector filesystem list`,
    `  ${cli} connector filesystem run <project_id> <scan_id>`,
    `  ${cli} connector ticketing list`,
    `  ${cli} connector ticketing run <project_id> <ticket_id>`,
    `  ${cli} connector robot-mock list`,
    `  ${cli} connector robot-mock run <project_id> <mission_id>`,
    `  ${cli} connector wolfram bootstrap`,
    `  ${cli} connector wolfram list`,
    `  ${cli} connector wolfram run <project_id> <calculation_id>`,
    `  ${cli} wolfram <bootstrap|list|run> [project_id] [calculation_id]`,
    `  ${cli} math <bootstrap|list|run> [project_id] [calculation_id]`,
    `  ${cli} connector adeept-arm status`,
    `  ${cli} connector adeept-arm dry-run <joint|random> [increase|decrease] [--seed <seed>]`,
    `  ${cli} connector adeept-arm pulse <joint|random> [increase|decrease] --approve-motion --confirm-workspace-clear --approve-candidate-protocol`,
    `  ${cli} connector adeept-arm stop`,
    `  ${cli} mcp-server`,
    `  ${cli} paths`,
    `  ${cli} replay`,
    `  ${cli} hygiene`,
    `  ${cli} audit`,
    '',
  ].join('\n'));
  process.exit(1);
}

function isDirectoryEmpty(dirPath) {
  if (!fs.existsSync(dirPath)) return true;
  return fs.readdirSync(dirPath).length === 0;
}

function copyRecursive(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) return;
  const stats = fs.statSync(sourcePath);
  if (stats.isDirectory()) {
    fs.mkdirSync(targetPath, { recursive: true });
    for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
      copyRecursive(path.join(sourcePath, entry.name), path.join(targetPath, entry.name));
    }
    fs.chmodSync(targetPath, stats.mode & 0o777);
    return;
  }
  if (!stats.isFile()) return;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  fs.chmodSync(targetPath, stats.mode & 0o777);
}

function runTargetScript(targetRoot, scriptName, args = []) {
  const scriptPath = path.join(targetRoot, 'md-os', 'os', scriptName);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: targetRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: targetRoot,
      MDOS_ROOT: path.join(targetRoot, 'md-os'),
    },
  });
  if (result.status !== 0) {
    const error = new Error(`SCAFFOLD_SCRIPT_FAILED: ${scriptName}`);
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    error.status = result.status;
    throw error;
  }
  return {
    script: `md-os/os/${scriptName}`,
    args,
    stdout: String(result.stdout || '').trim().split('\n').filter(Boolean).slice(-3),
  };
}

function scaffoldWorkspace(targetArg) {
  const targetRoot = path.resolve(process.cwd(), targetArg);
  if (fs.existsSync(targetRoot) && !fs.statSync(targetRoot).isDirectory()) {
    throw new Error(`INIT_TARGET_NOT_DIRECTORY: ${targetRoot}`);
  }
  if (!isDirectoryEmpty(targetRoot)) {
    throw new Error(`INIT_TARGET_NOT_EMPTY: ${targetRoot}`);
  }

  fs.mkdirSync(targetRoot, { recursive: true });
  const copied = [];
  for (const entry of SCAFFOLD_ENTRIES) {
    const sourcePath = path.join(PACKAGE_ROOT, entry);
    const targetPath = path.join(targetRoot, entry);
    if (!fs.existsSync(sourcePath)) continue;
    copyRecursive(sourcePath, targetPath);
    copied.push(entry);
  }
  const builders = [
    runTargetScript(targetRoot, 'initialize_ops_memory.js'),
    runTargetScript(targetRoot, 'initialize_demo_ops.js'),
    runTargetScript(targetRoot, 'compile_programs.js'),
    runTargetScript(targetRoot, 'build_project_state.js', ['demo_general_system']),
    runTargetScript(targetRoot, 'build_project_state.js', ['demo_document_approval_flow']),
    runTargetScript(targetRoot, 'build_global_agenda.js'),
    runTargetScript(targetRoot, 'archive_runtime_state.js'),
    runTargetScript(targetRoot, 'build_agentic_core.js'),
    runTargetScript(targetRoot, 'build_workspace_inventory.js'),
    runTargetScript(targetRoot, 'build_markdown_graph.js'),
    runTargetScript(targetRoot, 'build_runtime_lifecycle_index.js'),
    runTargetScript(targetRoot, 'build_semantic_knowledge_graph.js'),
    runTargetScript(targetRoot, 'build_self_release_index.js'),
    runTargetScript(targetRoot, 'agi_loop.js', ['eval']),
    runTargetScript(targetRoot, 'build_module_registry.js'),
    runTargetScript(targetRoot, 'build_runtime_compiler.js'),
    runTargetScript(targetRoot, 'build_global_index.js'),
    runTargetScript(targetRoot, 'build_system_hygiene_status.js'),
    runTargetScript(targetRoot, 'build_health_classifier.js'),
    runTargetScript(targetRoot, 'build_health_dashboard.js'),
  ];

  printJson({
    ok: true,
    mode: 'scaffold_workspace',
    target_dir: targetRoot,
    copied,
    builders,
    next_steps: [
      `cd ${targetRoot}`,
      'npm run mcp:server',
      'Open the folder in Obsidian to browse the Markdown runtime state.',
    ],
  });
}

function runScript(scriptName, args = []) {
  const scriptPath = path.join(__dirname, scriptName);
  // If the script is a Bash script (ends with .sh), execute it with Bash.
  // Otherwise, execute it with Node (default behavior for JS scripts).
  const isShell = scriptPath.endsWith('.sh');
  const command = isShell ? 'bash' : process.execPath;
  const cmdArgs = isShell ? [scriptPath, ...args] : [scriptPath, ...args];
  const result = spawnSync(command, cmdArgs, {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    env: process.env,
    stdio: 'inherit',
  });
  process.exit(result.status || 0);
}

function runScripts(steps) {
  for (const [scriptName, args] of steps) {
    const result = spawnSync(process.execPath, [path.join(__dirname, scriptName), ...(args || [])], {
      cwd: WORKSPACE_ROOT,
      encoding: 'utf8',
      env: process.env,
      stdio: 'inherit',
    });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}

function printAuditTail(limit = 20) {
  const journalFile = path.join(MDOS_ROOT, 'ops', 'journal.ndjson');
  const text = fs.existsSync(journalFile) ? fs.readFileSync(journalFile, 'utf8') : '';
  const events = text.trim().split('\n').filter(Boolean).slice(-limit).map((line) => {
    try {
      return JSON.parse(line);
    } catch (_) {
      return { malformed: line };
    }
  });
  printJson({
    ok: true,
    mode: 'audit_tail',
    journal_file: path.relative(WORKSPACE_ROOT, journalFile),
    event_count: events.length,
    events,
  });
}

function printRuntimePaths() {
  printJson({
    ok: true,
    mode: 'runtime_paths',
    cwd: process.cwd(),
    workspace_root: WORKSPACE_ROOT,
    mdos_root: MDOS_ROOT,
    package_root: PACKAGE_ROOT,
    env_overrides: {
      MDOS_WORKSPACE_ROOT: process.env.MDOS_WORKSPACE_ROOT || null,
      MDOS_ROOT: process.env.MDOS_ROOT || null,
    },
    portability: {
      portable_state_paths: 'repository_relative',
      host_local_absolute_paths_allowed_under: 'md-os/ops/local/**',
    },
  });
}

function runModuleCommand(moduleId, commandName, args = []) {
  const result = invokeModuleCommand(moduleId, commandName, args, { stdio: 'inherit' });
  process.exit(result.status || 0);
}

function main() {
  const [command, subcommand, ...rest] = process.argv.slice(2);
  if (!command) usage();

  if (command === 'init') {
    if (subcommand) {
      scaffoldWorkspace(subcommand);
      return;
    }
    runScript('initialize_ops_memory.js');
  }
  if (command === 'demo') {
    runScripts([
      ['initialize_ops_memory.js'],
      ['initialize_demo_ops.js'],
    ]);
    return;
  }
  if (command === 'signal') {
    if (!subcommand || !rest.length) usage();
    runScript('register_manual_signal.js', [subcommand, rest.join(' ')]);
  }
  if (command === 'propose-change') {
    if (!subcommand || !rest.length) usage();
    runScript('register_change_proposal.js', [subcommand, rest.join(' ')]);
  }
  if (command === 'compile-programs') runScript('compile_programs.js');
  if (command === 'build') {
    if (!subcommand || subcommand === 'all') {
      runScripts([
        ['initialize_ops_memory.js'],
        ['initialize_demo_ops.js'],
        ['compile_programs.js'],
        ['build_project_state.js', ['demo_general_system']],
        ['build_project_state.js', ['demo_document_approval_flow']],
        ['build_global_agenda.js'],
        ['archive_runtime_state.js'],
        ['build_agentic_core.js'],
        ['build_workspace_inventory.js'],
        ['build_markdown_graph.js'],
        ['build_runtime_lifecycle_index.js'],
        ['build_semantic_knowledge_graph.js'],
        ['build_semantic_commitment_gate.js', ['status']],
        ['build_self_release_index.js'],
        ['agi_loop.js', ['eval']],
        ['build_software_repair_benchmark_index.js'],
        ['build_module_registry.js'],
        ['build_runtime_compiler.js'],
        ['apfc_runtime.js', ['reconcile']],
        ['build_apfc_graph.js'],
        ['apfc_runtime.js', ['graphify', 'build']],
        ['build_global_index.js'],
        ['build_system_hygiene_status.js'],
        ['build_health_classifier.js'],
        ['build_health_dashboard.js'],
        ['build_conceptual_boot_summary.js'],
      ]);
      return;
    }
    runScript('build_project_state.js', [subcommand]);
  }
  if (command === 'agenda') runScript('build_global_agenda.js');
  if (command === 'core') runScript('build_agentic_core.js');
  if (command === 'graph' || command === 'markdown-graph') {
    if (!subcommand || subcommand === 'build' || subcommand === 'rebuild') runScript('build_markdown_graph.js');
    usage();
  }
  if (command === 'graphify' || command === 'document-graph' || command === 'document_graph') {
    const normalized = !subcommand || subcommand === 'list' ? 'status' : subcommand;
    if ([
      'status',
      'bootstrap',
      'build',
      'run',
      'benchmark',
      'query',
      'path',
      'explain',
      'neural-map',
      'neural',
      'map',
      'neural-open',
      'connector-map',
      'connector-topology',
      'topology',
      'connector-open',
      'topology-open',
      'orient',
      'orientation',
      'context',
      'route',
      'open',
    ].includes(normalized)) {
      runScript('graphify_connector.js', [normalized, ...rest]);
    }
    usage();
  }
  if (command === 'semantic' || command === 'knowledge-graph' || command === 'semantic-graph') {
    if (subcommand === 'status' || subcommand === 'commitment-status') {
      runScript('build_semantic_commitment_gate.js', ['status', ...rest]);
    }
    if (subcommand === 'gate' || subcommand === 'evaluate') {
      const [proposalPath] = rest;
      if (!proposalPath) usage();
      runScript('build_semantic_commitment_gate.js', ['evaluate', proposalPath]);
    }
    if (!subcommand || subcommand === 'build' || subcommand === 'rebuild') runScript('build_semantic_knowledge_graph.js');
    if (subcommand === 'graph') {
      const [semanticGraphCommand] = rest;
      if (!semanticGraphCommand || semanticGraphCommand === 'build' || semanticGraphCommand === 'rebuild') runScript('build_semantic_knowledge_graph.js');
    }
    usage();
  }
  if (command === 'boot-summary' || command === 'conceptual-boot' || command === 'cold-boot-summary') {
    runScript('build_conceptual_boot_summary.js');
  }
  if (command === 'cycle' || command === 'operating-cycle' || command === 'os-cycle') {
    const normalized = subcommand || 'status';
    if (['status', 'run-once', 'once', 'run'].includes(normalized)) {
      runScript('operating_cycle.js', [normalized, ...rest]);
    }
    usage();
  }
  if (command === 'knowledge') {
    if (subcommand === 'import') {
      const [importId, sourceDir, ...importArgs] = rest;
      if (!importId || !sourceDir) usage();
      runScript('build_knowledge_import.js', [importId, sourceDir, ...importArgs]);
    }
    usage();
  }
  if (command === 'agi' || command === 'cognition' || command === 'cognitive') {
    if (!subcommand) runScript('agi_loop.js', ['eval']);
    if (subcommand === 'prove' || subcommand === 'evidence' || subcommand === 'generality') {
      runScript('run_agi_evidence_suite.js', rest);
    }
    if (subcommand === 'accelerate' || subcommand === 'neuromorphic-learn') {
      runScript('run_neuromorphic_learning_experiment.js', rest);
    }
    if (['transfer', 'multifamily-transfer', 'multifamily_transfer'].includes(subcommand)) {
      runScript('run_apfc_multifamily_transfer_experiment.js', rest);
    }
    if (['capability-lab', 'capability_lab', 'learn-general', 'learn_general'].includes(subcommand)) {
      runScript('run_agi_capability_lab.js', rest);
    }
    if (['evaluator-kit', 'evaluator_kit', 'external-evaluator'].includes(subcommand)) {
      runScript('agi_external_evaluator_kit.js', rest);
    }
    if (subcommand === 'score' || subcommand === 'status') {
      runScript('run_agi_sal_evaluator.js', ['score', ...rest]);
    }
    if (subcommand === 'certify') {
      runScript('run_agi_sal_evaluator.js', ['certify', ...rest]);
    }
    if (subcommand === 'evaluation-request' || subcommand === 'evaluation_request' || subcommand === 'freeze') {
      runScript('run_agi_sal_evaluator.js', ['evaluation-request', ...rest]);
    }
    if (['run-once', 'once', 'run', 'eval', 'status', 'learn', 'promote'].includes(subcommand)) {
      runScript('agi_loop.js', [subcommand, ...rest]);
    }
    usage();
  }
  if (command === 'apfc') {
    if (!subcommand) runScript('apfc_runtime.js', ['status']);
    if (subcommand === 'cognitive') {
      const [operation = 'status', ...cognitiveArgs] = rest;
      if (['ingest', 'bind', 'workspace', 'gate', 'predict', 'run-cycle', 'cycle', 'reflect', 'reflect-intent', 'status'].includes(operation)) {
        if (operation === 'reflect') runScript('apfc_cognitive_path_runtime.js', ['run-once', ...cognitiveArgs]);
        else if (operation === 'reflect-intent') runScript('apfc_cognitive_intent_runtime.js', ['route-once', ...cognitiveArgs]);
        else runScript('apfc_cognitive_runtime.js', [operation, ...cognitiveArgs]);
      }
      usage();
    }
    runScript('apfc_runtime.js', [subcommand, ...rest]);
  }
  if (command === 'benchmark' || command === 'benchmarks') {
    if (subcommand === 'software-repair' || subcommand === 'software_repair') {
      const [benchmarkCommand, ...benchmarkArgs] = rest;
      if (['generate', 'run', 'configurations', 'configuration'].includes(benchmarkCommand)) {
        runScript('run_software_repair_benchmark.js', [benchmarkCommand, ...benchmarkArgs]);
      }
    }
    usage();
  }
  if (command === 'compile-runtime') runScript('build_runtime_compiler.js', [subcommand, ...rest].filter(Boolean));
  if (command === 'runtime') {
    if (!subcommand || subcommand === 'compile' || subcommand === 'build') runScript('build_runtime_compiler.js', rest);
    usage();
  }
  if (command === 'module' || command === 'modules') {
    const normalized = subcommand || 'list';
    if (normalized === 'build-registry' || normalized === 'build' || normalized === 'registry') {
      runScript('build_module_registry.js');
    }
    if (normalized === 'list' || normalized === 'status') {
      printJson(listModules());
      return;
    }
    if (normalized === 'run') {
      const [moduleId, commandName, ...commandArgs] = rest;
      if (!moduleId || !commandName) usage();
      runModuleCommand(moduleId, commandName, commandArgs);
    }
    usage();
  }
  if (command === 'capability' || command === 'capabilities') {
    const normalized = subcommand || 'list';
    if (normalized === 'list' || normalized === 'status') {
      printJson(listCapabilities());
      return;
    }
    usage();
  }
  if (command === 'import') {
    if (subcommand === 'knowledge') {
      const [importId, sourceDir, ...importArgs] = rest;
      if (!importId || !sourceDir) usage();
      runScript('build_knowledge_import.js', [importId, sourceDir, ...importArgs]);
    }
    usage();
  }
  if (command === 'self') {
    if (subcommand === 'release') runScript('build_self_release_index.js', rest);
    usage();
  }
  if (command === 'release' || command === 'releases') {
    if (!subcommand || subcommand === 'status' || subcommand === 'index') runScript('build_self_release_index.js', rest);
    if (subcommand === 'self') runScript('build_self_release_index.js', rest);
    usage();
  }
  if (command === 'lifecycle') runScript('build_runtime_lifecycle_index.js');
  if (command === 'health') {
    runScripts([
      ['build_health_classifier.js'],
      ['build_health_dashboard.js'],
    ]);
    return;
  }
  if (command === 'compact' || command === 'archive') runScript('archive_runtime_state.js');
  if (command === 'role' || command === 'roles') {
    if (subcommand === 'intake') {
      const [roleId] = rest;
      if (!roleId) usage();
      runScript('build_role_intake.js', [roleId]);
    }
    if (subcommand === 'sensemake' || subcommand === 'sensemaking') {
      const [roleId] = rest;
      if (!roleId) usage();
      runScript('build_role_sensemaking.js', [roleId]);
    }
    usage();
  }
  if (command === 'hardware') {
    if (subcommand === 'bootstrap') runScript('hardware_bootstrap.js', ['bootstrap', ...rest]);
    if (subcommand === 'list') runScript('hardware_control.js', ['list', ...rest]);
    if (subcommand === 'run') runScript('hardware_control.js', ['run', ...rest]);
    if (subcommand === 'audio') runScript('hardware_control.js', ['audio', ...rest]);
    if (subcommand === 'display' || subcommand === 'monitor') runScript('hardware_control.js', ['display', ...rest]);
    if (subcommand === 'screen' || subcommand === 'desktop') runScript('hardware_control.js', ['screen', ...rest]);
    if (subcommand === 'clean') runScript('hardware_bootstrap.js', ['clean', ...rest]);
    usage();
  }
  if (command === 'audio') {
    if (subcommand === 'speak') {
      if (!rest.length) usage();
      runScript('speak_it.sh', [rest.join(' ')]);
      return;
    }
    runScript('hardware_control.js', ['audio', subcommand, ...rest].filter(Boolean));
  }
  if (command === 'display' || command === 'monitor') {
    runScript('hardware_control.js', ['display', subcommand, ...rest].filter(Boolean));
  }
  if (command === 'screen' || command === 'desktop') {
    runScript('hardware_control.js', ['screen', subcommand, ...rest].filter(Boolean));
  }
  if (command === 'device') {
    if (subcommand === 'discover') runScript('hardware_bootstrap.js', ['bootstrap', ...rest]);
    if (subcommand === 'clean') runScript('hardware_bootstrap.js', ['clean', ...rest]);
    usage();
  }
  if (command === 'software') {
    if (subcommand === 'bootstrap' || subcommand === 'discover') runScript('software_bootstrap.js', ['bootstrap', ...rest]);
    if (subcommand === 'list') runScript('software_bootstrap.js', ['list', ...rest]);
    if (subcommand === 'clean') runScript('software_bootstrap.js', ['clean', ...rest]);
    usage();
  }
  if (['app', 'apps', 'application', 'applications', 'service', 'services'].includes(command)) {
    if (subcommand === 'bootstrap' || subcommand === 'discover') runScript('software_bootstrap.js', ['bootstrap', ...rest]);
    if (subcommand === 'list') runScript('software_bootstrap.js', ['list', ...rest]);
    if (subcommand === 'clean') runScript('software_bootstrap.js', ['clean', ...rest]);
    usage();
  }
  if (command === 'mcp-server') runScript('mcp_server.js');
  if (command === 'paths' || command === 'path' || command === 'doctor-paths') {
    printRuntimePaths();
    return;
  }
  if (command === 'continuity' || command === 'live') {
    if (!subcommand) usage();
    const normalized = subcommand === 'on' ? 'start' : subcommand === 'off' ? 'stop' : subcommand;
    if (['start', 'stop', 'status', 'restart', 'run', 'run-once', 'once'].includes(normalized)) {
      runScript('continuity_service.js', [normalized, ...rest]);
    }
    usage();
  }
  if (command === 'wolfram' || command === 'math') {
    if (subcommand === 'bootstrap' || subcommand === 'list') {
      runScript('wolfram_connector.js', [subcommand]);
    }
    if (subcommand === 'run') {
      const [projectId, calculationId] = rest;
      if (!projectId || !calculationId) usage();
      runScript('wolfram_connector.js', ['run', projectId, calculationId]);
    }
    usage();
  }
  const moduleRoute = resolveCliCommand([command, subcommand, ...rest].filter(Boolean));
  if (moduleRoute) {
    runModuleCommand(moduleRoute.module_id, moduleRoute.command_name, moduleRoute.args);
  }
  if (command === 'connector') {
    if (subcommand === 'list') runScript('terminal_connector.js', ['list']);
    if (subcommand === 'run') {
      const [projectId, commandId] = rest;
      if (!projectId || !commandId) usage();
      runScript('terminal_connector.js', ['run', projectId, commandId]);
    }
    if (subcommand === 'terminal') {
      const [terminalCommand, projectId, commandId] = rest;
      if (terminalCommand === 'list') runScript('terminal_connector.js', ['list']);
      if (terminalCommand === 'run' && projectId && commandId) runScript('terminal_connector.js', ['run', projectId, commandId]);
      usage();
    }
    if (subcommand === 'api') {
      const [apiCommand, projectId, requestId] = rest;
      if (apiCommand === 'list') runScript('api_connector.js', ['list']);
      if (apiCommand === 'run' && projectId && requestId) runScript('api_connector.js', ['run', projectId, requestId]);
      usage();
    }
    if (subcommand === 'filesystem') {
      const [fsCommand, projectId, scanId] = rest;
      if (fsCommand === 'list') runScript('filesystem_connector.js', ['list']);
      if (fsCommand === 'run' && projectId && scanId) runScript('filesystem_connector.js', ['run', projectId, scanId]);
      usage();
    }
    if (subcommand === 'ticketing') {
      const [ticketCommand, projectId, ticketId] = rest;
      if (ticketCommand === 'list') runScript('ticketing_connector.js', ['list']);
      if (ticketCommand === 'run' && projectId && ticketId) runScript('ticketing_connector.js', ['run', projectId, ticketId]);
      usage();
    }
    if (subcommand === 'robot-mock' || subcommand === 'robot') {
      const [robotCommand, projectId, missionId] = rest;
      if (robotCommand === 'list') runScript('robot_mock_connector.js', ['list']);
      if (robotCommand === 'run' && projectId && missionId) runScript('robot_mock_connector.js', ['run', projectId, missionId]);
      usage();
    }
    if (subcommand === 'wolfram' || subcommand === 'math') {
      const [wolframCommand, projectId, calculationId] = rest;
      if (wolframCommand === 'bootstrap' || wolframCommand === 'list') {
        runScript('wolfram_connector.js', [wolframCommand]);
      }
      if (wolframCommand === 'run' && projectId && calculationId) {
        runScript('wolfram_connector.js', ['run', projectId, calculationId]);
      }
      usage();
    }
    if (subcommand === 'adeept-arm') {
      if (!rest.length) usage();
      runScript('adeept_arm_connector.js', rest);
    }
    usage();
  }
  if (command === 'replay') {
    printJson(replayRuntime());
    return;
  }
  if (command === 'hygiene') runScript('build_system_hygiene_status.js');
  if (command === 'audit') {
    printAuditTail(Number.parseInt(subcommand || '20', 10) || 20);
    return;
  }

  usage();
}

if (require.main === module) {
  main();
}
