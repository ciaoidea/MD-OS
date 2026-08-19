#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { ACTIVE_BOUNDARY_DIR, MDOS_ROOT, WORKSPACE_ROOT, nowIso, printJson } = require('./lib/common');
const { atomicWriteJsonLocked, atomicWriteTextLocked, ensureDir } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');

const REQUIRED_DIRS = [
  OPS_DIR,
  path.join(OPS_DIR, 'agenda'),
  path.join(OPS_DIR, 'actions'),
  path.join(OPS_DIR, 'action_receipts'),
  path.join(OPS_DIR, 'agi'),
  path.join(OPS_DIR, 'artifacts'),
  path.join(OPS_DIR, 'archive'),
  path.join(OPS_DIR, 'archive', 'projects'),
  path.join(OPS_DIR, 'changes'),
  path.join(OPS_DIR, 'changes', 'proposals'),
  path.join(OPS_DIR, 'compiled'),
  path.join(OPS_DIR, 'calculations'),
  path.join(OPS_DIR, 'calculations', 'wolfram'),
  path.join(OPS_DIR, 'calculations', 'wolfram', 'scripts'),
  path.join(OPS_DIR, 'connectors'),
  path.join(OPS_DIR, 'core'),
  path.join(OPS_DIR, 'apfc', 'cognitive'),
  path.join(OPS_DIR, 'apfc', 'cognitive', 'action_candidates'),
  path.join(OPS_DIR, 'apfc', 'cognitive', 'bindings'),
  path.join(OPS_DIR, 'apfc', 'cognitive', 'consolidation'),
  path.join(OPS_DIR, 'apfc', 'cognitive', 'dynamics'),
  path.join(OPS_DIR, 'apfc', 'cognitive', 'episodes'),
  path.join(OPS_DIR, 'apfc', 'cognitive', 'frames'),
  path.join(OPS_DIR, 'apfc', 'cognitive', 'inbox'),
  path.join(OPS_DIR, 'apfc', 'cognitive', 'predictions'),
  path.join(OPS_DIR, 'apfc', 'cognitive', 'tokens'),
  path.join(OPS_DIR, 'apfc', 'cognitive', 'workspace'),
  path.join(OPS_DIR, 'local'),
  path.join(OPS_DIR, 'local', 'hardware'),
  path.join(OPS_DIR, 'local', 'wolfram'),
  path.join(OPS_DIR, 'locks'),
  path.join(OPS_DIR, 'policies'),
  path.join(OPS_DIR, 'programs'),
  path.join(OPS_DIR, 'projects'),
  path.join(OPS_DIR, 'roles'),
  path.join(OPS_DIR, 'processes'),
  path.join(OPS_DIR, 'evals'),
  path.join(OPS_DIR, 'episodes'),
  path.join(OPS_DIR, 'failures'),
  path.join(OPS_DIR, 'services'),
  path.join(OPS_DIR, 'skills'),
  path.join(OPS_DIR, 'skills', 'candidates'),
  path.join(OPS_DIR, 'skills', 'promoted'),
  path.join(OPS_DIR, 'sources'),
  path.join(OPS_DIR, 'sources', 'manual'),
  path.join(OPS_DIR, 'sources', 'connectors'),
  path.join(OPS_DIR, 'sources', 'roles'),
  path.join(OPS_DIR, 'summary'),
  path.join(OPS_DIR, 'tasks'),
  path.join(OPS_DIR, 'warm_start'),
  path.join(OPS_DIR, 'warm_start', 'checkpoints'),
  path.join(OPS_DIR, 'warm_start', 'exports'),
  path.join(OPS_DIR, 'trajectories'),
  path.join(OPS_DIR, 'verifications'),
  path.join(OPS_DIR, 'world'),
  path.join(OPS_DIR, 'benchmarks'),
  path.join(OPS_DIR, 'benchmarks', 'software_repair'),
  path.join(OPS_DIR, 'benchmarks', 'software_repair', 'candidate_sets'),
  path.join(OPS_DIR, 'benchmarks', 'software_repair', 'runs'),
];

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath);
}

function ensureFile(filePath, content, kind = 'text') {
  if (fs.existsSync(filePath)) return false;
  if (kind === 'json') {
    atomicWriteJsonLocked(filePath, content, { context: `initialize:${path.basename(filePath)}` });
  } else {
    atomicWriteTextLocked(filePath, content, { context: `initialize:${path.basename(filePath)}` });
  }
  return true;
}

function main() {
  for (const dirPath of REQUIRED_DIRS) ensureDir(dirPath);

  const created = [];
  if (ensureFile(path.join(OPS_DIR, 'continuity.md'), '# Continuity\n\nHealthy generic runtime initialized.\n')) {
    created.push('md-os/ops/continuity.md');
  }
  if (ensureFile(path.join(OPS_DIR, 'last_summary.md'), '# Last Summary\n\nWorkspace initialized.\n')) {
    created.push('md-os/ops/last_summary.md');
  }
  if (ensureFile(path.join(OPS_DIR, 'current_task.md'), '# Current Task\n\nNo active task.\n')) {
    created.push('md-os/ops/current_task.md');
  }
  if (ensureFile(path.join(OPS_DIR, 'state.json'), {
    schema_version: 1,
    updated_at: nowIso(),
    mode: 'healthy',
    boundary: ACTIVE_BOUNDARY_DIR,
    architecture: 'mdos_5_0_artificial_prefrontal_cortex_agentic_operating_filesystem__host_exec__md_os_boundary',
    runtime_profile: 'md_os_apfc_identity_version_5_0'
  }, 'json')) {
    created.push('md-os/ops/state.json');
  }
  if (ensureFile(path.join(OPS_DIR, 'connectors', 'connector_registry.json'), {
    schema_version: 1,
    updated_at: nowIso(),
    registry_name: 'generic_connector_registry',
    connectors: [
      {
        connector_id: 'manual_signals',
        name: 'Manual Signals',
        kind: 'manual',
        status: 'ready',
        implemented: true,
        execution_mode: 'snapshot_only',
        permission_profile: 'read_only_snapshot',
        risk_level: 'low',
        requires_approval: false,
        read_capabilities: ['manual_json_signal_ingest'],
        write_capabilities: [],
        notes: 'Human-authored signals captured as canonical JSON snapshots.'
      },
      {
        connector_id: 'filesystem_runtime',
        name: 'Filesystem Runtime',
        kind: 'filesystem',
        status: 'ready',
        implemented: true,
        execution_mode: 'read_write',
        permission_profile: 'local_runtime_write',
        risk_level: 'medium',
        requires_approval: false,
        read_capabilities: ['inventory', 'content_hashing', 'structured_runtime_read'],
        write_capabilities: ['atomic_write', 'locked_append', 'runtime_state_build'],
        notes: 'Core text-native runtime and canonical source of persisted state.'
      },
      {
        connector_id: 'terminal_executor',
        name: 'Terminal Executor',
        kind: 'terminal',
        status: 'ready',
        implemented: true,
        execution_mode: 'bounded_exec',
        permission_profile: 'shell_safe',
        risk_level: 'medium',
        requires_approval: false,
        read_capabilities: ['stdout_capture', 'stderr_capture'],
        write_capabilities: ['bounded_command_execution', 'connector_snapshot_emit'],
        notes: 'Generic bounded shell execution adapter backed by an explicit allowlist.'
      },
      {
        connector_id: 'api_adapter',
        name: 'API Adapter',
        kind: 'api',
        status: 'ready',
        implemented: true,
        execution_mode: 'bounded_exec',
        permission_profile: 'network_read',
        risk_level: 'medium',
        requires_approval: false,
        read_capabilities: ['http_get_capture', 'http_post_capture'],
        write_capabilities: ['bounded_http_request', 'connector_snapshot_emit'],
        notes: 'Generic allowlisted HTTP API adapter for stable service APIs.'
      },
      {
        connector_id: 'wolfram_connector',
        name: 'Wolfram Connector',
        kind: 'mathematics',
        status: 'configured',
        implemented: true,
        execution_mode: 'bounded_symbolic_script_or_code',
        permission_profile: 'shell_safe',
        risk_level: 'medium',
        requires_approval: false,
        read_capabilities: ['wolfram_profile_read', 'wolfram_script_hashing', 'mathematical_output_capture'],
        write_capabilities: ['bounded_wolframscript_execution', 'wolfram_artifact_emit', 'connector_snapshot_emit'],
        allowed_commands: ['wolframscript'],
        notes: 'Run cortex wolfram bootstrap to verify the local wolframscript prerequisite and write availability readback.'
      },
      {
        connector_id: 'hardware_discovery',
        name: 'Hardware Discovery',
        kind: 'device',
        status: 'experimental',
        implemented: true,
        execution_mode: 'snapshot_only',
        permission_profile: 'read_only_snapshot',
        risk_level: 'low',
        requires_approval: false,
        read_capabilities: ['host_substrate_discovery', 'device_inventory_emit', 'hardware_bootstrap_report'],
        write_capabilities: ['hardware_registry_emit', 'hardware_observation_append'],
        notes: 'Read-only hardware and peripheral discovery over host-exposed OS substrates. Does not activate or control devices.'
      },
      {
        connector_id: 'hardware_control',
        name: 'Hardware Control',
        kind: 'device',
        status: 'experimental',
        implemented: true,
        execution_mode: 'human_explicit_local_action',
        permission_profile: 'hardware_write',
        risk_level: 'high',
        requires_approval: true,
        read_capabilities: ['audio_status', 'display_status', 'screen_capture_explicit', 'device_registry_read'],
        write_capabilities: ['audio_volume_set', 'audio_volume_step', 'audio_mute_toggle', 'display_brightness_set', 'display_output_enable'],
        notes: 'Explicit local hardware action connector. Uses host-exposed tools and writes host-local audit records.'
      },
      {
        connector_id: 'software_discovery',
        name: 'Software Discovery',
        kind: 'application',
        status: 'experimental',
        implemented: true,
        execution_mode: 'snapshot_only',
        permission_profile: 'read_only_snapshot',
        risk_level: 'low',
        requires_approval: false,
        read_capabilities: ['application_inventory_emit', 'service_inventory_emit', 'software_bootstrap_report'],
        write_capabilities: ['software_registry_emit', 'software_observation_append'],
        notes: 'Read-only installed application and service discovery over host-exposed OS substrates. Does not launch apps or start, stop, or restart services.'
      },
      {
        connector_id: 'filesystem_connector',
        name: 'Filesystem Connector',
        kind: 'filesystem',
        status: 'ready',
        implemented: true,
        execution_mode: 'snapshot_only',
        permission_profile: 'read_only_snapshot',
        risk_level: 'low',
        requires_approval: false,
        read_capabilities: ['bounded_filesystem_scan', 'content_hashing', 'snapshot_emit'],
        write_capabilities: ['connector_snapshot_emit', 'filesystem_artifact_emit'],
        notes: 'Bounded workspace filesystem scanner that emits normalized connector snapshots.'
      },
      {
        connector_id: 'ticketing_connector',
        name: 'Ticketing Connector',
        kind: 'ticketing',
        status: 'ready',
        implemented: true,
        execution_mode: 'snapshot_only',
        permission_profile: 'local_runtime_write',
        risk_level: 'medium',
        requires_approval: false,
        read_capabilities: ['ticket_profile_read'],
        write_capabilities: ['connector_snapshot_emit', 'ticket_artifact_emit'],
        notes: 'Generic ticket snapshot connector for project work-item ingestion.'
      },
      {
        connector_id: 'robot_mock_connector',
        name: 'Robot Mock Connector',
        kind: 'robotic_system',
        status: 'ready',
        implemented: true,
        execution_mode: 'simulation_snapshot_only',
        permission_profile: 'hardware_write',
        risk_level: 'high',
        requires_approval: true,
        read_capabilities: ['mock_telemetry_read', 'mission_state_read'],
        write_capabilities: ['robot_mission_artifact_emit', 'action_proposal_emit'],
        notes: 'Simulation-only robot connector for mission state, telemetry, safety policy, and action proposal audit.'
      },
      {
        connector_id: 'vector_robot',
        name: 'Cortex-Vector Robotic Bridge Connector',
        kind: 'robotic_system',
        status: 'beta',
        implemented: true,
        execution_mode: 'bounded_external_runtime',
        permission_profile: 'physical_actuation_explicit_approval',
        risk_level: 'high',
        requires_approval: true,
        read_capabilities: ['service_status', 'robot_probe', 'camera_capture_private', 'animation_inventory', 'voice_request_ingress'],
        write_capabilities: ['bounded_speech', 'bounded_motion', 'head_motion', 'lift_motion', 'stop', 'facial_expression'],
        allowed_commands: ['vector-cortex'],
        allowed_paths: ['md-os/connectors/vector/**', 'md-os/os/vector_connector.js', 'md-os/ops/connectors/vector_connector.json'],
        notes: 'Repository-bundled beta connector with Wi-Fi/gRPC bridge and BLE provisioning. Private sensory payloads and credentials remain outside MD-OS.'
      },
      {
        connector_id: 'graphify_connector',
        name: 'Graphify Document Graph Connector',
        kind: 'default_knowledge_graph_runtime',
        status: 'default_operational',
        implemented: true,
        execution_mode: 'bounded_exec',
        permission_profile: 'shell_safe',
        risk_level: 'medium',
        requires_approval: false,
        read_capabilities: [
          'document_graph_profile_read',
          'graphify_graph_json_read',
          'graphify_query_readback',
          'graphify_benchmark_readback',
          'graphify_connector_topology_read',
          'graphify_orientation_read',
          'graphify_dynamic_graph_read'
        ],
        write_capabilities: [
          'graphify_graph_html_emit',
          'graphify_graph_json_emit',
          'graphify_report_emit',
          'graphify_system_map_emit',
          'graphify_connector_topology_emit',
          'graphify_orientation_emit',
          'graphify_dynamic_graph_evolution_emit'
        ],
        allowed_commands: ['graphify', 'uvx', 'uv'],
        allowed_paths: [
          '.graphifyignore',
          'graphify-out/**',
          'md-os/ops/connectors/graphify_connector.json'
        ],
        side_effects: 'Runs the external Graphify CLI in local structural mode against a bounded workspace target and writes graph, report, tree HTML, connector topology, orientation, and dynamic graph evolution output under graphify-out/.',
        rollback_or_recovery_note: 'Delete graphify-out/ to remove generated visualization output. Source documents are not modified.',
        audit_rule: 'Every build records target, output paths, launcher source, exit code, and journal event.',
        notes: 'Directly integrated default MD-OS graph orientation surface. It reduces token load by routing work through bounded graph context first, and it evolves the graph dynamically through bounded local update builds.'
      },
      {
        connector_id: 'desktop_adapter',
        name: 'Desktop Adapter',
        kind: 'desktop',
        status: 'planned',
        implemented: false,
        execution_mode: 'human_confirmed_write',
        permission_profile: 'local_runtime_write',
        risk_level: 'medium',
        requires_approval: true,
        read_capabilities: ['session_observation'],
        write_capabilities: ['bounded_session_actuation'],
        notes: 'Generic adapter for native desktop applications.'
      }
    ]
  }, 'json')) {
    created.push('md-os/ops/connectors/connector_registry.json');
  }
  if (ensureFile(path.join(OPS_DIR, 'connectors', 'graphify_connector.json'), {
    schema_version: 1,
    connector_id: 'graphify_connector',
    package_name: 'graphifyy',
    cli_command: 'graphify',
    default_target: '.',
    direct_integration: true,
    default_operational_surface: true,
    default_orientation_surface: true,
    token_budget_role: 'primary_context_reduction_surface',
    dynamic_graph_evolution: true,
    graph_evolution_mode: 'bounded_local_update',
    default_refresh_command: 'cortex graphify build .',
    default_orient_command: 'cortex graphify orient <question>',
    output_dir: 'graphify-out',
    graph_json: 'graphify-out/graph.json',
    graph_html: 'graphify-out/graph.html',
    report_md: 'graphify-out/GRAPH_REPORT.md',
    system_map_md: 'graphify-out/MD_OS_SYSTEM_MAP.md',
    neural_map_json: 'graphify-out/neural_node_map.json',
    neural_map_html: 'graphify-out/neural_node_map.html',
    neural_map_md: 'graphify-out/neural_node_map.md',
    connector_topology_json: 'graphify-out/connector_topology.json',
    connector_topology_html: 'graphify-out/connector_topology.html',
    connector_topology_md: 'graphify-out/connector_topology.md',
    orientation_json: 'graphify-out/orientation.json',
    orientation_md: 'graphify-out/orientation.md',
    default_build_mode: 'local_update',
    tree_label: 'MD-OS Operating System Map',
    default_timeout_ms: 1200000,
    safe_build_flags: [
      '--update',
      '--force',
      '--no-viz',
      '--no-cluster',
      '--wiki',
      '--obsidian',
      '--svg',
      '--graphml',
      '--cluster-only',
      '--mode',
      '--resolution',
      '--exclude-hubs',
      '--backend',
      '--token-budget',
      '--max-workers',
      '--api-timeout'
    ],
    safe_local_build_flags: [
      '--force',
      '--no-cluster',
      '--no-viz',
      '--update'
    ],
    forbidden_build_flags: [
      '--watch',
      '--mcp',
      '--neo4j-push'
    ],
    notes: 'Directly integrated default MD-OS graph orientation surface. It reduces token load by routing work through bounded graph context first, and it evolves the graph dynamically through bounded local update builds.'
  }, 'json')) {
    created.push('md-os/ops/connectors/graphify_connector.json');
  }
  if (ensureFile(path.join(OPS_DIR, 'connectors', 'vector_connector.json'), {
    schema_version: 1,
    connector_id: 'vector_robot',
    release_stage: 'beta',
    name: 'Cortex-Vector Robotic Bridge Connector',
    kind: 'robotic_system',
    bridge_command: 'vector-cortex',
    package_manifest: 'md-os/connectors/vector/connector.json',
    installer: 'md-os/connectors/vector/install.sh',
    execution_mode: 'bounded_external_runtime',
    runtime_data_policy: {
      sensory_root: 'private_volatile_runtime',
      copy_sensor_payloads_into_mdos: false,
      publish_sensor_payloads: false,
      receipt_content: 'bounded metadata only'
    },
    safety: {
      max_drive_mm: 200,
      max_turn_degrees: 180,
      movement_requires_explicit_approval: true,
      workspace_clear_confirmation_required: true,
      continuous_autonomous_motion: false,
      destructive_or_remote_actions: false
    },
    capabilities: {
      read: ['service_status', 'robot_probe', 'camera_capture_private', 'animation_inventory'],
      write: ['bounded_speech', 'bounded_motion', 'head_motion', 'lift_motion', 'stop', 'facial_expression']
    }
  }, 'json')) {
    created.push('md-os/ops/connectors/vector_connector.json');
  }
  if (!fs.existsSync(path.join(OPS_DIR, 'journal.ndjson'))) {
    fs.closeSync(fs.openSync(path.join(OPS_DIR, 'journal.ndjson'), 'a'));
    created.push('md-os/ops/journal.ndjson');
  }
  if (ensureFile(path.join(OPS_DIR, 'policies', 'permission_model.json'), {
    schema_version: 1,
    updated_at: nowIso(),
    risk_levels: ['low', 'medium', 'high', 'critical'],
    profiles: [
      {
        profile_id: 'read_only_snapshot',
        capabilities: ['read-only'],
        risk_level: 'low',
        requires_approval: false,
        dry_run_required: false,
        audit_required: true
      },
      {
        profile_id: 'local_runtime_write',
        capabilities: ['write-local', 'write-project'],
        risk_level: 'medium',
        requires_approval: false,
        dry_run_required: false,
        audit_required: true
      },
      {
        profile_id: 'network_read',
        capabilities: ['network-read', 'read-only'],
        risk_level: 'medium',
        requires_approval: false,
        dry_run_required: false,
        audit_required: true
      },
      {
        profile_id: 'shell_safe',
        capabilities: ['shell-safe'],
        risk_level: 'medium',
        requires_approval: false,
        dry_run_required: false,
        audit_required: true
      },
      {
        profile_id: 'network_write',
        capabilities: ['network-write'],
        risk_level: 'high',
        requires_approval: true,
        dry_run_required: true,
        audit_required: true
      },
      {
        profile_id: 'hardware_write',
        capabilities: ['hardware-write'],
        risk_level: 'high',
        requires_approval: true,
        dry_run_required: true,
        audit_required: true,
        recovery_note_required: true
      },
      {
        profile_id: 'destructive',
        capabilities: ['destructive'],
        risk_level: 'critical',
        requires_approval: true,
        dry_run_required: true,
        audit_required: true,
        recovery_note_required: true
      }
    ]
  }, 'json')) {
    created.push('md-os/ops/policies/permission_model.json');
  }

  appendJournal({
    event: 'ops_memory_initialized',
    created_files: created,
  });

  printJson({
    ok: true,
    mode: 'initialize_ops_memory',
    created_files: created,
    ops_root: rel(OPS_DIR),
  });
}

main();
