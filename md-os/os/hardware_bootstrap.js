#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  nowIso,
  printJson,
  sha256Json,
  shortText,
} = require('./lib/common');
const {
  appendLineWithLock,
  atomicWriteJsonLocked,
  atomicWriteTextLocked,
  ensureDir,
  withFileLock,
} = require('./lib/fs_runtime');
const { JOURNAL_FILE, appendJournal } = require('./lib/journal');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const LOCAL_DIR = path.join(OPS_DIR, 'local');
const HARDWARE_DIR = path.join(LOCAL_DIR, 'hardware');
const LEGACY_HARDWARE_DIR = path.join(OPS_DIR, 'hardware');
const CONNECTORS_DIR = path.join(OPS_DIR, 'connectors');
const CONNECTOR_REGISTRY_FILE = path.join(CONNECTORS_DIR, 'connector_registry.json');
const DEVICE_REGISTRY_JSON = path.join(HARDWARE_DIR, 'device_registry.json');
const INVENTORY_MD = path.join(HARDWARE_DIR, 'inventory.md');
const CAPABILITIES_MD = path.join(HARDWARE_DIR, 'capabilities.md');
const BOOTSTRAP_REPORT_MD = path.join(HARDWARE_DIR, 'bootstrap_report.md');
const OBSERVATIONS_NDJSON = path.join(HARDWARE_DIR, 'observations.ndjson');
const COMMAND_TIMEOUT_MS = 1500;

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function safeId(value) {
  return shortText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'item';
}

function maybeRead(filePath, maxBytes = 4000) {
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size > maxBytes) return '';
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch (_) {
    return '';
  }
}

function listDirSafe(dirPath) {
  try {
    return fs.readdirSync(dirPath);
  } catch (_) {
    return [];
  }
}

function commandExists(command) {
  const name = shortText(command);
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) return null;
  const result = process.platform === 'win32'
    ? spawnSync('where.exe', [name], { encoding: 'utf8', timeout: COMMAND_TIMEOUT_MS })
    : spawnSync('sh', ['-lc', `command -v ${name}`], { encoding: 'utf8', timeout: COMMAND_TIMEOUT_MS });
  const output = String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean)[0] || '';
  return result.status === 0 && output ? output : null;
}

function runCommand(command, args = []) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    env: { PATH: process.env.PATH || '' },
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: 128000,
  });
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || result.error && result.error.message || '').trim();
  return {
    ok: result.status === 0 && !result.error,
    command: [command, ...args].join(' '),
    status: Number.isInteger(result.status) ? result.status : null,
    duration_ms: Date.now() - startedAt,
    stdout,
    stderr,
  };
}

function lines(text, limit = 40) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function toolRecord(tool, category) {
  const foundPath = commandExists(tool);
  return {
    tool,
    category,
    available: Boolean(foundPath),
    path: foundPath || null,
  };
}

function discoverTools() {
  const definitions = [
    ['pactl', 'audio'],
    ['wpctl', 'audio'],
    ['amixer', 'audio'],
    ['lpstat', 'printer'],
    ['lp', 'printer'],
    ['lpr', 'printer'],
    ['v4l2-ctl', 'camera'],
    ['ffmpeg', 'media'],
    ['xrandr', 'display'],
    ['wlr-randr', 'display'],
    ['gnome-screenshot', 'display'],
    ['spectacle', 'display'],
    ['grim', 'display'],
    ['scrot', 'display'],
    ['import', 'display'],
    ['brightnessctl', 'display'],
    ['ddcutil', 'display'],
    ['lsusb', 'usb'],
    ['system_profiler', 'macos'],
    ['osascript', 'macos'],
    ['screencapture', 'macos'],
    ['powershell.exe', 'windows'],
    ['pwsh', 'windows'],
  ];
  return definitions.map(([tool, category]) => toolRecord(tool, category));
}

function hasTool(tools, tool) {
  return tools.some((item) => item.tool === tool && item.available);
}

function findToolPath(tools, tool) {
  const record = tools.find((item) => item.tool === tool && item.available);
  return record && record.path || null;
}

function hostInfo() {
  return {
    platform: process.platform,
    os_type: os.type(),
    os_release: os.release(),
    arch: process.arch,
    hostname: os.hostname(),
    node_version: process.version,
    session: {
      xdg_session_type: shortText(process.env.XDG_SESSION_TYPE || ''),
      desktop_session: shortText(process.env.DESKTOP_SESSION || ''),
      display: process.env.DISPLAY ? 'set' : '',
      wayland_display: process.env.WAYLAND_DISPLAY ? 'set' : '',
    },
  };
}

function device(deviceId, category, label, extra = {}) {
  return {
    device_id: safeId(deviceId),
    category,
    label: shortText(label || deviceId),
    status: 'discovered',
    control_status: 'discovery_only',
    requires_consent: extra.requires_consent === true,
    host_path: extra.host_path || null,
    backing_tools: extra.backing_tools || [],
    read_capabilities: extra.read_capabilities || [],
    planned_actions: extra.planned_actions || [],
    notes: shortText(extra.notes || ''),
  };
}

function discoverLinuxAudio(tools) {
  const devices = [];
  const observations = [];

  if (hasTool(tools, 'pactl')) {
    const pactl = findToolPath(tools, 'pactl') || 'pactl';
    const info = runCommand(pactl, ['info']);
    const sinks = runCommand(pactl, ['list', 'short', 'sinks']);
    const sources = runCommand(pactl, ['list', 'short', 'sources']);
    observations.push({ category: 'audio', command: info.command, ok: info.ok, excerpt: lines(info.stdout || info.stderr, 12) });
    for (const line of lines(sinks.stdout, 20)) {
      const parts = line.split(/\s+/);
      const name = parts[1] || parts[0] || 'sink';
      devices.push(device(`audio_output_${name}`, 'audio_output', name, {
        backing_tools: ['pactl'],
        read_capabilities: ['list_audio_sinks'],
        planned_actions: ['set_volume', 'mute', 'unmute'],
        notes: 'PulseAudio/PipeWire sink discovered through pactl.',
      }));
    }
    for (const line of lines(sources.stdout, 20)) {
      const parts = line.split(/\s+/);
      const name = parts[1] || parts[0] || 'source';
      devices.push(device(`audio_input_${name}`, 'audio_input', name, {
        requires_consent: true,
        backing_tools: ['pactl'],
        read_capabilities: ['list_audio_sources'],
        planned_actions: ['record_requires_consent'],
        notes: 'Audio input source discovered through pactl; recording is not part of bootstrap.',
      }));
    }
    return { devices, observations };
  }

  if (hasTool(tools, 'wpctl')) {
    const wpctl = findToolPath(tools, 'wpctl') || 'wpctl';
    const status = runCommand(wpctl, ['status']);
    observations.push({ category: 'audio', command: status.command, ok: status.ok, excerpt: lines(status.stdout || status.stderr, 20) });
    if (status.ok) {
      devices.push(device('audio_pipewire_wpctl', 'audio_output', 'PipeWire audio surface', {
        backing_tools: ['wpctl'],
        read_capabilities: ['audio_status'],
        planned_actions: ['set_volume', 'mute', 'unmute'],
        notes: 'PipeWire control surface discovered through wpctl.',
      }));
    }
  }

  return { devices, observations };
}

function discoverLinuxCameras(tools) {
  const devices = listDirSafe('/dev')
    .filter((name) => /^video[0-9]+$/.test(name))
    .sort()
    .map((name) => {
      const label = maybeRead(path.join('/sys/class/video4linux', name, 'name')) || name;
      return device(`camera_${name}`, 'camera', label, {
        host_path: `/dev/${name}`,
        requires_consent: true,
        backing_tools: hasTool(tools, 'v4l2-ctl') ? ['v4l2-ctl'] : [],
        read_capabilities: ['list_camera_device_node'],
        planned_actions: ['look_once_requires_consent', 'start_live_requires_consent', 'stop_live'],
        notes: 'Video device node discovered. Bootstrap did not open the camera stream.',
      });
    });
  const observations = [];
  if (hasTool(tools, 'v4l2-ctl')) {
    const v4l2 = findToolPath(tools, 'v4l2-ctl') || 'v4l2-ctl';
    const listing = runCommand(v4l2, ['--list-devices']);
    observations.push({ category: 'camera', command: listing.command, ok: listing.ok, excerpt: lines(listing.stdout || listing.stderr, 30) });
  }
  return { devices, observations };
}

function discoverLinuxPrinters(tools) {
  const devices = [];
  const observations = [];
  if (!hasTool(tools, 'lpstat')) return { devices, observations };

  const lpstat = findToolPath(tools, 'lpstat') || 'lpstat';
  const result = runCommand(lpstat, ['-p', '-d']);
  observations.push({ category: 'printer', command: result.command, ok: result.ok, excerpt: lines(result.stdout || result.stderr, 30) });
  const defaultMatch = String(result.stdout || '').match(/system default destination:\s*(.+)$/im);
  const defaultPrinter = defaultMatch ? shortText(defaultMatch[1]) : '';
  for (const line of lines(result.stdout, 40)) {
    const match = line.match(/^printer\s+(\S+)/i);
    if (!match) continue;
    const name = match[1];
    devices.push(device(`printer_${name}`, 'printer', name, {
      requires_consent: true,
      backing_tools: ['lpstat', hasTool(tools, 'lp') ? 'lp' : '', hasTool(tools, 'lpr') ? 'lpr' : ''].filter(Boolean),
      read_capabilities: ['list_printers'],
      planned_actions: ['print_text_requires_confirmation'],
      notes: defaultPrinter === name ? 'Default printer. Bootstrap did not print.' : 'Printer discovered. Bootstrap did not print.',
    }));
  }
  return { devices, observations };
}

function discoverLinuxDisplays(tools) {
  const devices = [];
  const observations = [];
  if (hasTool(tools, 'xrandr')) {
    const xrandr = findToolPath(tools, 'xrandr') || 'xrandr';
    const result = runCommand(xrandr, ['--listmonitors']);
    observations.push({ category: 'display', command: result.command, ok: result.ok, excerpt: lines(result.stdout || result.stderr, 20) });
    for (const line of lines(result.stdout, 20)) {
      if (!/^\d+:\s+/.test(line)) continue;
      const name = line.split(/\s+/).at(-1);
      devices.push(device(`display_${name}`, 'display', name, {
        backing_tools: ['xrandr'],
        read_capabilities: ['list_monitors'],
        planned_actions: ['screen_observation_requires_consent'],
        notes: 'Display surface discovered. Bootstrap did not capture the screen.',
      }));
    }
  }
  return { devices, observations };
}

function discoverLinuxUsb(tools) {
  const devices = [];
  const observations = [];
  if (!hasTool(tools, 'lsusb')) return { devices, observations };
  const lsusb = findToolPath(tools, 'lsusb') || 'lsusb';
  const result = runCommand(lsusb, []);
  observations.push({ category: 'usb', command: result.command, ok: result.ok, excerpt: lines(result.stdout || result.stderr, 40) });
  lines(result.stdout, 40).forEach((line, index) => {
    devices.push(device(`usb_${index + 1}`, 'usb', line, {
      backing_tools: ['lsusb'],
      read_capabilities: ['list_usb_devices'],
      planned_actions: [],
      notes: 'USB device summary discovered through lsusb.',
    }));
  });
  return { devices, observations };
}

function discoverLinuxSerialAndGpio() {
  const serial = listDirSafe('/dev')
    .filter((name) => /^(ttyUSB|ttyACM)[0-9]+$/.test(name))
    .sort()
    .map((name) => device(`serial_${name}`, 'serial', name, {
      host_path: `/dev/${name}`,
      requires_consent: true,
      read_capabilities: ['list_serial_device_node'],
      planned_actions: ['serial_read_requires_connector', 'serial_write_requires_confirmation'],
      notes: 'Serial device node discovered. Bootstrap did not open it.',
    }));
  const gpio = listDirSafe('/dev')
    .filter((name) => /^gpiochip[0-9]+$/.test(name))
    .sort()
    .map((name) => device(`gpio_${name}`, 'gpio', name, {
      host_path: `/dev/${name}`,
      requires_consent: true,
      read_capabilities: ['list_gpio_chip'],
      planned_actions: ['gpio_read_requires_connector', 'gpio_write_requires_confirmation'],
      notes: 'GPIO chip discovered. Bootstrap did not read or write pins.',
    }));
  return { devices: [...serial, ...gpio], observations: [] };
}

function discoverGenericHostDevices(tools) {
  if (process.platform === 'linux') {
    return [
      discoverLinuxAudio(tools),
      discoverLinuxCameras(tools),
      discoverLinuxPrinters(tools),
      discoverLinuxDisplays(tools),
      discoverLinuxUsb(tools),
      discoverLinuxSerialAndGpio(),
    ];
  }

  const observations = [];
  const devices = [];
  if (process.platform === 'darwin' && hasTool(tools, 'system_profiler')) {
    const profiler = findToolPath(tools, 'system_profiler') || 'system_profiler';
    const result = runCommand(profiler, ['SPCameraDataType', 'SPAudioDataType', 'SPPrintersDataType']);
    observations.push({ category: 'macos_hardware', command: result.command, ok: result.ok, excerpt: lines(result.stdout || result.stderr, 60) });
    if (result.ok) {
      devices.push(device('macos_hardware_surface', 'host_substrate', 'macOS hardware surfaces', {
        requires_consent: true,
        backing_tools: ['system_profiler'],
        read_capabilities: ['system_profiler_summary'],
        planned_actions: ['connector_specific_control_required'],
        notes: 'macOS hardware summary discovered through system_profiler.',
      }));
    }
  }
  if (process.platform === 'win32') {
    devices.push(device('windows_device_manager_surface', 'host_substrate', 'Windows device manager surface', {
      requires_consent: true,
      backing_tools: ['powershell'],
      read_capabilities: ['pnp_device_listing_planned'],
      planned_actions: ['connector_specific_control_required'],
      notes: 'Windows hardware discovery is modeled; dedicated PowerShell connector is required.',
    }));
  }
  return [{ devices, observations }];
}

function capability(capabilityId, category, status, backingTools, examples, policy) {
  return {
    capability_id: capabilityId,
    category,
    status,
    control_status: status === 'available' ? 'connector_required' : 'not_available',
    backing_tools: backingTools,
    natural_language_examples: examples,
    policy,
  };
}

function buildCapabilities(tools, devices) {
  const byCategory = new Set(devices.map((item) => item.category));
  const availableTools = new Set(tools.filter((item) => item.available).map((item) => item.tool));
  return [
    capability('host_substrate_discovery', 'host', 'available', [], ['rileva il substrato hardware'], 'read_only'),
    capability(
      'audio_volume_control',
      'audio',
      byCategory.has('audio_output') && ['pactl', 'wpctl', 'amixer', 'osascript'].some((tool) => availableTools.has(tool)) ? 'available' : 'not_available',
      ['pactl', 'wpctl', 'amixer', 'osascript'].filter((tool) => availableTools.has(tool)),
      ['alza il volume', 'abbassa il volume', 'metti mute'],
      'reversible_local_action_requires_audio_connector'
    ),
    capability(
      'camera_look_once',
      'camera',
      byCategory.has('camera') ? 'available' : 'not_available',
      ['v4l2-ctl', 'ffmpeg'].filter((tool) => availableTools.has(tool)),
      ['guarda la mia maglietta', 'cattura un frame'],
      'requires_explicit_consent'
    ),
    capability(
      'printer_print_text',
      'printer',
      byCategory.has('printer') && (availableTools.has('lp') || availableTools.has('lpr')) ? 'available' : 'not_available',
      ['lp', 'lpr', 'lpstat'].filter((tool) => availableTools.has(tool)),
      ['stampa ciao', 'manda in stampa questo testo'],
      'requires_confirmation'
    ),
    capability(
      'display_observation',
      'display',
      byCategory.has('display') || Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY) ? 'available' : 'not_available',
      ['xrandr', 'wlr-randr', 'gnome-screenshot', 'spectacle', 'grim', 'scrot', 'import', 'screencapture'].filter((tool) => availableTools.has(tool)),
      ['guarda lo schermo', 'descrivi la finestra corrente'],
      'requires_explicit_consent_for_capture'
    ),
    capability(
      'serial_or_gpio_control',
      'device',
      byCategory.has('serial') || byCategory.has('gpio') ? 'available' : 'not_available',
      [],
      ['leggi il sensore seriale', 'attiva il relay'],
      'requires_dedicated_device_policy_and_confirmation'
    ),
  ];
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function ensureHardwareConnectorRegistryEntry() {
  ensureDir(CONNECTORS_DIR);
  const registry = readJsonSafe(CONNECTOR_REGISTRY_FILE) || {
    schema_version: 1,
    registry_name: 'generic_connector_registry',
    connectors: [],
  };
  if (!Array.isArray(registry.connectors)) registry.connectors = [];
  const existing = registry.connectors.find((item) => item && item.connector_id === 'hardware_discovery');
  const entry = {
    connector_id: 'hardware_discovery',
    name: 'Hardware Discovery',
    kind: 'device',
    status: 'experimental',
    implemented: true,
    execution_mode: 'snapshot_only',
    read_capabilities: ['host_substrate_discovery', 'device_inventory_emit', 'hardware_bootstrap_report'],
    write_capabilities: ['hardware_registry_emit', 'hardware_observation_append'],
    notes: 'Read-only hardware and peripheral discovery over host-exposed OS substrates. Does not activate or control devices.',
  };
  if (existing) {
    Object.assign(existing, entry);
  } else {
    registry.connectors.push(entry);
  }
  registry.updated_at = nowIso();
  atomicWriteJsonLocked(CONNECTOR_REGISTRY_FILE, registry, {
    context: 'hardware_connector_registry_entry',
  });
  return entry;
}

function buildRegistry() {
  const tools = discoverTools();
  const host = hostInfo();
  const discovered = discoverGenericHostDevices(tools);
  const devices = discovered.flatMap((item) => item.devices);
  const observations = discovered.flatMap((item) => item.observations);
  const capabilities = buildCapabilities(tools, devices);
  const updatedAt = nowIso();
  return {
    schema_version: 1,
    updated_at: updatedAt,
    mode: 'hardware_bootstrap_read_only',
    locality: {
      scope: 'host_local',
      portable: false,
      output_dir: rel(HARDWARE_DIR),
      clean_command: 'cortex hardware clean',
      notes: 'This inventory describes the current host machine and is safe to delete and regenerate.',
    },
    host,
    policy: {
      read_only: true,
      no_camera_activation: true,
      no_audio_recording: true,
      no_printing: true,
      no_volume_change: true,
      no_serial_or_gpio_write: true,
    },
    discovered_tools: tools,
    capability_count: capabilities.length,
    device_count: devices.length,
    capabilities,
    devices: devices.sort((left, right) => `${left.category}:${left.device_id}`.localeCompare(`${right.category}:${right.device_id}`)),
    observations,
    source_hash: sha256Json({ host, tools, capabilities, devices, observations }),
  };
}

function groupBy(items, key) {
  const grouped = new Map();
  for (const item of items) {
    const value = item[key] || 'other';
    const bucket = grouped.get(value) || [];
    bucket.push(item);
    grouped.set(value, bucket);
  }
  return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right));
}

function markdownTable(rows, columns) {
  if (!rows.length) return '- None detected.\n';
  const header = `| ${columns.map((column) => column.label).join(' | ')} |`;
  const separator = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => String(row[column.key] ?? '').replace(/\|/g, '/')).join(' | ')} |`);
  return `${[header, separator, ...body].join('\n')}\n`;
}

function buildInventoryMarkdown(registry) {
  const linesOut = [
    '# Hardware Inventory',
    '',
    `Updated at: \`${registry.updated_at}\``,
    '',
    `Mode: \`${registry.mode}\``,
    '',
    `Locality: \`${registry.locality.scope}\``,
    '',
    `Output directory: \`${registry.locality.output_dir}\``,
    '',
    `Clean command: \`${registry.locality.clean_command}\``,
    '',
    '## Host',
    '',
    `- platform: \`${registry.host.platform}\``,
    `- os: \`${registry.host.os_type} ${registry.host.os_release}\``,
    `- arch: \`${registry.host.arch}\``,
    `- hostname: \`${registry.host.hostname}\``,
    `- session: \`${registry.host.session.xdg_session_type || registry.host.session.desktop_session || 'unknown'}\``,
    '',
    '## Safety',
    '',
    '- bootstrap is read-only',
    '- camera streams were not opened',
    '- microphones were not recorded',
    '- printers were not used',
    '- volume was not changed',
    '- serial/GPIO writes were not performed',
    '',
    `## Devices (\`${registry.device_count}\`)`,
    '',
  ];

  for (const [category, devices] of groupBy(registry.devices, 'category')) {
    linesOut.push(`### ${category}`, '');
    linesOut.push(markdownTable(devices, [
      { key: 'device_id', label: 'device_id' },
      { key: 'label', label: 'label' },
      { key: 'status', label: 'status' },
      { key: 'control_status', label: 'control' },
      { key: 'host_path', label: 'host_path' },
      { key: 'requires_consent', label: 'consent' },
    ]));
  }

  return `${linesOut.join('\n')}\n`;
}

function buildCapabilitiesMarkdown(registry) {
  const linesOut = [
    '# Hardware Capabilities',
    '',
    `Updated at: \`${registry.updated_at}\``,
    '',
    'These capabilities describe what MD-OS can plan around after read-only discovery.',
    'Actual control still requires dedicated bounded connectors and policy.',
    '',
    `This file is host-local and can be removed with \`${registry.locality.clean_command}\`.`,
    '',
    markdownTable(registry.capabilities, [
      { key: 'capability_id', label: 'capability_id' },
      { key: 'category', label: 'category' },
      { key: 'status', label: 'status' },
      { key: 'control_status', label: 'control_status' },
      { key: 'policy', label: 'policy' },
    ]),
    '',
    '## Natural-Language Examples',
    '',
  ];
  for (const cap of registry.capabilities) {
    linesOut.push(`### ${cap.capability_id}`, '');
    for (const example of cap.natural_language_examples || []) {
      linesOut.push(`- ${example}`);
    }
    linesOut.push('');
  }
  return `${linesOut.join('\n')}\n`;
}

function bootStatus(status, label, detail = '') {
  return `[${status}] ${label}${detail ? `: ${detail}` : ''}`;
}

function buildBootLines(registry) {
  const availableTools = registry.discovered_tools.filter((item) => item.available).length;
  const categories = groupBy(registry.devices, 'category')
    .map(([category, devices]) => `${category}=${devices.length}`)
    .join(', ') || 'none';
  return [
    'MD-OS (Artificial Prefrontal Cortex) v5.0 Hardware Bootstrap',
    bootStatus('SCAN', 'host substrate'),
    bootStatus('OK', 'host OS', `${registry.host.platform} ${registry.host.os_release}`),
    bootStatus('SCAN', 'host hardware tools'),
    bootStatus('OK', 'available tools', String(availableTools)),
    bootStatus('SCAN', 'audio'),
    bootStatus(registry.devices.some((item) => item.category.startsWith('audio')) ? 'OK' : '--', 'audio surfaces', String(registry.devices.filter((item) => item.category.startsWith('audio')).length)),
    bootStatus('SCAN', 'camera'),
    bootStatus(registry.devices.some((item) => item.category === 'camera') ? 'OK' : '--', 'cameras', String(registry.devices.filter((item) => item.category === 'camera').length)),
    bootStatus('SCAN', 'printers'),
    bootStatus(registry.devices.some((item) => item.category === 'printer') ? 'OK' : '--', 'printers', String(registry.devices.filter((item) => item.category === 'printer').length)),
    bootStatus('SCAN', 'displays, USB, serial, GPIO'),
    bootStatus('OK', 'device categories', categories),
    bootStatus('WRITE', rel(DEVICE_REGISTRY_JSON)),
    bootStatus('WRITE', rel(INVENTORY_MD)),
    bootStatus('WRITE', rel(CAPABILITIES_MD)),
    bootStatus('DONE', 'hardware substrate ready for natural-language control planning'),
  ];
}

function buildBootstrapReportMarkdown(registry, bootLines) {
  return [
    '# Hardware Bootstrap Report',
    '',
    `Updated at: \`${registry.updated_at}\``,
    '',
    '```text',
    ...bootLines,
    '```',
    '',
    '## Output Files',
    '',
    `- \`${rel(DEVICE_REGISTRY_JSON)}\``,
    `- \`${rel(INVENTORY_MD)}\``,
    `- \`${rel(CAPABILITIES_MD)}\``,
    `- \`${rel(BOOTSTRAP_REPORT_MD)}\``,
    `- \`${rel(OBSERVATIONS_NDJSON)}\``,
    '',
    'These files are host-local and can be deleted with `cortex hardware clean`.',
    '',
    '## Safety',
    '',
    'This bootstrap was read-only. It did not activate cameras, record audio, print, change volume, or write to serial/GPIO devices.',
    '',
  ].join('\n');
}

function writeOutputs(registry, bootLines) {
  ensureDir(HARDWARE_DIR);
  atomicWriteJsonLocked(DEVICE_REGISTRY_JSON, registry, { context: 'hardware_device_registry' });
  atomicWriteTextLocked(INVENTORY_MD, buildInventoryMarkdown(registry), { context: 'hardware_inventory_md' });
  atomicWriteTextLocked(CAPABILITIES_MD, buildCapabilitiesMarkdown(registry), { context: 'hardware_capabilities_md' });
  atomicWriteTextLocked(BOOTSTRAP_REPORT_MD, buildBootstrapReportMarkdown(registry, bootLines), { context: 'hardware_bootstrap_report_md' });
  appendLineWithLock(OBSERVATIONS_NDJSON, `${JSON.stringify({
    schema_version: 1,
    observed_at: registry.updated_at,
    event: 'hardware_bootstrap_completed',
    source_hash: registry.source_hash,
    host: registry.host,
    device_count: registry.device_count,
    capability_count: registry.capability_count,
    policy: registry.policy,
  })}\n`, {
    lockName: 'hardware_observations_append',
    context: 'hardware_bootstrap_observation',
  });
}

function hardwareBootstrap({ jsonOnly = false, printJsonPayload = true } = {}) {
  const connectorEntry = ensureHardwareConnectorRegistryEntry();
  const registry = buildRegistry();
  registry.connector_entry = connectorEntry;
  const bootLines = buildBootLines(registry);
  writeOutputs(registry, bootLines);
  appendJournal({
    event: 'hardware_bootstrap_completed',
    mode: registry.mode,
    locality: registry.locality.scope,
    output_dir: registry.locality.output_dir,
  });

  if (!jsonOnly) {
    for (const line of bootLines) process.stdout.write(`${line}\n`);
  }

  const payload = {
    ok: true,
    mode: 'hardware_bootstrap',
    read_only: true,
    locality: registry.locality,
    device_count: registry.device_count,
    capability_count: registry.capability_count,
    output_json: rel(DEVICE_REGISTRY_JSON),
    inventory_md: rel(INVENTORY_MD),
    capabilities_md: rel(CAPABILITIES_MD),
    bootstrap_report_md: rel(BOOTSTRAP_REPORT_MD),
    observations_ndjson: rel(OBSERVATIONS_NDJSON),
    source_hash: registry.source_hash,
  };
  if (printJsonPayload) printJson(payload);
  return payload;
}

function removeDirIfExists(dirPath) {
  if (!fs.existsSync(dirPath)) return false;
  fs.rmSync(dirPath, { recursive: true, force: true });
  return true;
}

function scrubHardwareJournalEvents() {
  if (!fs.existsSync(JOURNAL_FILE)) {
    return {
      journal_file: rel(JOURNAL_FILE),
      removed_event_count: 0,
      total_event_count: 0,
    };
  }

  let removed = 0;
  let total = 0;
  const keptLines = [];
  const hardwareEvents = new Set(['hardware_bootstrap_completed', 'hardware_control_completed']);
  const linesIn = fs.readFileSync(JOURNAL_FILE, 'utf8').split(/\r?\n/);

  for (const line of linesIn) {
    if (!line.trim()) continue;
    total += 1;
    try {
      const payload = JSON.parse(line);
      if (hardwareEvents.has(payload && payload.event)) {
        removed += 1;
        continue;
      }
    } catch (_) {
    }
    keptLines.push(line);
  }

  atomicWriteTextLocked(JOURNAL_FILE, keptLines.length ? `${keptLines.join('\n')}\n` : '', {
    lockName: 'journal__append',
    context: 'hardware_clean_journal_scrub',
  });

  return {
    journal_file: rel(JOURNAL_FILE),
    removed_event_count: removed,
    total_event_count: total,
  };
}

function runDerivedBuilder(scriptName) {
  const result = spawnSync(process.execPath, [path.join(__dirname, scriptName)], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  return {
    script: `md-os/os/${scriptName}`,
    ok: result.status === 0,
    status: Number.isInteger(result.status) ? result.status : null,
    stderr: shortText(result.stderr || result.error && result.error.message || ''),
  };
}

function refreshDerivedViewsAfterClean() {
  return [
    runDerivedBuilder('build_workspace_inventory.js'),
    runDerivedBuilder('build_markdown_graph.js'),
    runDerivedBuilder('build_global_index.js'),
    runDerivedBuilder('build_system_hygiene_status.js'),
    runDerivedBuilder('build_health_classifier.js'),
  ];
}

function hardwareClean({ jsonOnly = false, printJsonPayload = true } = {}) {
  const targets = [
    { label: 'hardware_local', dir: HARDWARE_DIR },
    { label: 'hardware_legacy', dir: LEGACY_HARDWARE_DIR },
  ];
  const removed = [];

  withFileLock('hardware_local_cache_clean', {
    context: 'hardware_clean',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    ensureDir(LOCAL_DIR);
    for (const target of targets) {
      if (removeDirIfExists(target.dir)) {
        removed.push({ label: target.label, path: rel(target.dir) });
      }
    }
  });

  const journalScrub = scrubHardwareJournalEvents();

  appendJournal({
    event: 'hardware_local_cache_cleaned',
    removed_paths: removed.map((item) => item.path),
    scrubbed_hardware_journal_events: journalScrub.removed_event_count,
  });

  const refreshedViews = refreshDerivedViewsAfterClean();
  const refreshFailed = refreshedViews.find((item) => !item.ok);
  if (refreshFailed) {
    const error = new Error(`HARDWARE_CLEAN_REFRESH_FAILED: ${refreshFailed.script}`);
    error.refreshed_views = refreshedViews;
    throw error;
  }

  const payload = {
    ok: true,
    mode: 'hardware_clean',
    scope: 'host_local_hardware_inventory',
    removed_paths: removed.map((item) => item.path),
    canonical_output_dir: rel(HARDWARE_DIR),
    journal_scrub: journalScrub,
    refreshed_views: refreshedViews,
  };

  if (!jsonOnly) {
    process.stdout.write('MD-OS (Artificial Prefrontal Cortex) v5.0 Hardware Clean\n');
    if (removed.length) {
      for (const item of removed) process.stdout.write(`[DELETE] ${item.path}\n`);
    } else {
      process.stdout.write('[OK] no local hardware inventory present\n');
    }
    process.stdout.write(`[SCRUB] ${journalScrub.journal_file}: ${journalScrub.removed_event_count} hardware scan event(s)\n`);
    for (const item of refreshedViews) process.stdout.write(`[REBUILD] ${item.script}\n`);
    process.stdout.write('[READY] regenerate with: cortex hardware bootstrap\n');
  }

  if (printJsonPayload) printJson(payload);
  return payload;
}

function usage() {
  process.stderr.write([
    'Usage:',
    '  node md-os/os/hardware_bootstrap.js [bootstrap] [--json|--no-json]',
    '  node md-os/os/hardware_bootstrap.js clean [--json|--no-json]',
    '',
  ].join('\n'));
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] && !args[0].startsWith('--') ? args[0] : 'bootstrap';
  const flags = command === args[0] ? args.slice(1) : args;
  if (flags.some((arg) => !['--json', '--no-json'].includes(arg))) usage();
  if (flags.includes('--json') && flags.includes('--no-json')) usage();
  if (command === 'bootstrap') {
    hardwareBootstrap({
      jsonOnly: flags.includes('--json'),
      printJsonPayload: !flags.includes('--no-json'),
    });
    return;
  }
  if (command === 'clean') {
    hardwareClean({
      jsonOnly: flags.includes('--json'),
      printJsonPayload: !flags.includes('--no-json'),
    });
    return;
  }
  usage();
}

if (require.main === module) {
  main();
}

module.exports = {
  DEVICE_REGISTRY_JSON,
  HARDWARE_DIR,
  LEGACY_HARDWARE_DIR,
  hardwareClean,
  hardwareBootstrap,
};
