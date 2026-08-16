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
const SOFTWARE_DIR = path.join(LOCAL_DIR, 'software');
const LEGACY_SOFTWARE_DIR = path.join(OPS_DIR, 'software');
const CONNECTORS_DIR = path.join(OPS_DIR, 'connectors');
const CONNECTOR_REGISTRY_FILE = path.join(CONNECTORS_DIR, 'connector_registry.json');
const SOFTWARE_REGISTRY_JSON = path.join(SOFTWARE_DIR, 'software_registry.json');
const APPLICATIONS_JSON = path.join(SOFTWARE_DIR, 'applications.json');
const SERVICES_JSON = path.join(SOFTWARE_DIR, 'services.json');
const APPLICATIONS_MD = path.join(SOFTWARE_DIR, 'applications.md');
const SERVICES_MD = path.join(SOFTWARE_DIR, 'services.md');
const CAPABILITIES_MD = path.join(SOFTWARE_DIR, 'capabilities.md');
const BOOTSTRAP_REPORT_MD = path.join(SOFTWARE_DIR, 'bootstrap_report.md');
const OBSERVATIONS_NDJSON = path.join(SOFTWARE_DIR, 'observations.ndjson');
const COMMAND_TIMEOUT_MS = 1800;
const MAX_APPLICATIONS = 300;
const MAX_SERVICES = 300;

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

function maybeRead(filePath, maxBytes = 50000) {
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size > maxBytes) return '';
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch (_) {
    return '';
  }
}

function listDirSafe(dirPath, withFileTypes = false) {
  try {
    return fs.readdirSync(dirPath, withFileTypes ? { withFileTypes: true } : undefined);
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
    env: {
      PATH: process.env.PATH || '',
      HOME: process.env.HOME || os.homedir(),
      LANG: process.env.LANG || 'C',
    },
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: 256000,
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

function lines(text, limit = 60) {
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
    ['systemctl', 'service_manager'],
    ['service', 'service_manager'],
    ['launchctl', 'service_manager'],
    ['powershell.exe', 'windows'],
    ['pwsh', 'windows'],
    ['xdg-open', 'application_launcher'],
    ['gtk-launch', 'application_launcher'],
    ['gio', 'application_launcher'],
    ['open', 'application_launcher'],
    ['osascript', 'macos'],
    ['flatpak', 'application_package'],
    ['snap', 'application_package'],
    ['dpkg-query', 'package_manager'],
    ['rpm', 'package_manager'],
    ['pacman', 'package_manager'],
    ['brew', 'package_manager'],
    ['docker', 'service_runtime'],
    ['podman', 'service_runtime'],
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

function application(applicationId, name, kind, extra = {}) {
  return {
    application_id: safeId(applicationId),
    name: shortText(name || applicationId),
    kind,
    status: 'discovered',
    launch_status: 'not_launched',
    requires_consent: extra.requires_consent === true,
    host_path: extra.host_path || null,
    source: extra.source || null,
    exec_command: extra.exec_command || null,
    categories: extra.categories || [],
    no_display: extra.no_display === true,
    backing_tools: extra.backing_tools || [],
    read_capabilities: extra.read_capabilities || [],
    planned_actions: extra.planned_actions || [],
    notes: shortText(extra.notes || ''),
  };
}

function serviceRecord(serviceId, name, manager, extra = {}) {
  return {
    service_id: safeId(serviceId),
    name: shortText(name || serviceId),
    manager,
    status: 'discovered',
    control_status: 'discovery_only',
    unit_state: shortText(extra.unit_state || ''),
    runtime_state: shortText(extra.runtime_state || ''),
    host_path: extra.host_path || null,
    backing_tools: extra.backing_tools || [],
    read_capabilities: extra.read_capabilities || [],
    planned_actions: extra.planned_actions || [],
    notes: shortText(extra.notes || ''),
  };
}

function stripDesktopExec(value) {
  return shortText(value)
    .replace(/%[fFuUdDnNickvm]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDesktopEntry(filePath) {
  const text = maybeRead(filePath);
  if (!text) return null;
  const values = {};
  let inDesktopEntry = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^\[Desktop Entry\]$/i.test(line)) {
      inDesktopEntry = true;
      continue;
    }
    if (/^\[.+\]$/.test(line)) {
      if (inDesktopEntry) break;
      continue;
    }
    if (!inDesktopEntry) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!values[key]) values[key] = value;
  }
  if (shortText(values.Type || 'Application') !== 'Application') return null;
  if (String(values.Hidden || '').toLowerCase() === 'true') return null;
  const name = shortText(values.Name || values['Name[en]'] || '');
  if (!name) return null;
  const desktopId = path.basename(filePath).replace(/\.desktop$/i, '');
  const categories = shortText(values.Categories || '')
    .split(';')
    .map((item) => shortText(item))
    .filter(Boolean)
    .slice(0, 12);
  return application(`desktop_${desktopId}`, name, 'desktop_app', {
    host_path: filePath,
    source: 'desktop_entry',
    exec_command: stripDesktopExec(values.Exec || ''),
    categories,
    no_display: String(values.NoDisplay || '').toLowerCase() === 'true',
    backing_tools: ['desktop_entry'],
    read_capabilities: ['read_desktop_entry'],
    planned_actions: ['launch_requires_explicit_intent', 'inspect_window_requires_desktop_connector'],
    notes: 'Desktop application entry discovered. Bootstrap did not launch it.',
  });
}

function desktopApplicationDirs() {
  const dirs = [];
  const dataDirs = shortText(process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share')
    .split(':')
    .map((item) => shortText(item))
    .filter(Boolean);
  for (const dir of dataDirs) dirs.push(path.join(dir, 'applications'));
  const home = process.env.HOME || os.homedir();
  if (home) dirs.push(path.join(home, '.local', 'share', 'applications'));
  return Array.from(new Set(dirs));
}

function discoverLinuxDesktopApplications() {
  const observations = [];
  const byId = new Map();
  const dirs = desktopApplicationDirs();
  let scanned = 0;
  for (const dir of dirs) {
    for (const entry of listDirSafe(dir, true)) {
      if (!entry.isFile() || !entry.name.endsWith('.desktop')) continue;
      scanned += 1;
      const parsed = parseDesktopEntry(path.join(dir, entry.name));
      if (parsed && !byId.has(parsed.application_id)) byId.set(parsed.application_id, parsed);
      if (byId.size >= MAX_APPLICATIONS) break;
    }
    if (byId.size >= MAX_APPLICATIONS) break;
  }
  observations.push({
    category: 'applications',
    source: 'desktop_entries',
    ok: true,
    excerpt: [`scanned_desktop_entries=${scanned}`, `discovered_applications=${byId.size}`],
  });
  return { applications: Array.from(byId.values()), services: [], observations };
}

function discoverLinuxFlatpakApplications(tools) {
  const applications = [];
  const observations = [];
  if (!hasTool(tools, 'flatpak')) return { applications, services: [], observations };
  const flatpak = findToolPath(tools, 'flatpak') || 'flatpak';
  const result = runCommand(flatpak, ['list', '--app', '--columns=application,name']);
  observations.push({ category: 'applications', command: result.command, ok: result.ok, excerpt: lines(result.stdout || result.stderr, 20) });
  for (const line of lines(result.stdout, 80)) {
    const parts = line.split(/\t+/);
    const appId = shortText(parts[0] || line.split(/\s+/)[0] || '');
    const name = shortText(parts[1] || appId);
    if (!appId) continue;
    applications.push(application(`flatpak_${appId}`, name, 'flatpak_app', {
      source: 'flatpak',
      exec_command: `flatpak run ${appId}`,
      backing_tools: ['flatpak'],
      read_capabilities: ['flatpak_list_apps'],
      planned_actions: ['launch_requires_explicit_intent'],
      notes: 'Flatpak application discovered. Bootstrap did not launch it.',
    }));
  }
  return { applications, services: [], observations };
}

function discoverLinuxSnapApplications(tools) {
  const applications = [];
  const observations = [];
  if (!hasTool(tools, 'snap')) return { applications, services: [], observations };
  const snap = findToolPath(tools, 'snap') || 'snap';
  const result = runCommand(snap, ['list']);
  observations.push({ category: 'applications', command: result.command, ok: result.ok, excerpt: lines(result.stdout || result.stderr, 20) });
  for (const line of lines(result.stdout, 80).slice(1)) {
    const parts = line.split(/\s+/);
    const name = shortText(parts[0] || '');
    if (!name) continue;
    applications.push(application(`snap_${name}`, name, 'snap_app', {
      source: 'snap',
      exec_command: name,
      backing_tools: ['snap'],
      read_capabilities: ['snap_list_apps'],
      planned_actions: ['launch_requires_explicit_intent'],
      notes: 'Snap application discovered. Bootstrap did not launch it.',
    }));
  }
  return { applications, services: [], observations };
}

function parseSystemdRunning(stdout) {
  const states = new Map();
  for (const line of lines(stdout, MAX_SERVICES)) {
    const parts = line.split(/\s+/);
    const unit = shortText(parts[0] || '');
    if (!unit.endsWith('.service')) continue;
    states.set(unit, {
      runtime_state: shortText(parts.slice(2, 4).join('/')),
      description: shortText(parts.slice(4).join(' ')),
    });
  }
  return states;
}

function discoverLinuxSystemdServices(tools) {
  const services = [];
  const observations = [];
  if (!hasTool(tools, 'systemctl')) return { applications: [], services, observations };
  const systemctl = findToolPath(tools, 'systemctl') || 'systemctl';
  const unitFiles = runCommand(systemctl, ['list-unit-files', '--type=service', '--no-legend', '--no-pager']);
  const running = runCommand(systemctl, ['list-units', '--type=service', '--state=running', '--no-legend', '--no-pager']);
  observations.push({ category: 'services', command: unitFiles.command, ok: unitFiles.ok, excerpt: lines(unitFiles.stdout || unitFiles.stderr, 30) });
  observations.push({ category: 'services', command: running.command, ok: running.ok, excerpt: lines(running.stdout || running.stderr, 30) });
  const runningStates = running.ok ? parseSystemdRunning(running.stdout) : new Map();
  const seen = new Set();
  const sourceLines = unitFiles.ok ? lines(unitFiles.stdout, MAX_SERVICES) : Array.from(runningStates.keys());
  for (const line of sourceLines) {
    const parts = String(line).split(/\s+/);
    const unit = shortText(parts[0] || line);
    if (!unit.endsWith('.service') || seen.has(unit)) continue;
    seen.add(unit);
    const runningState = runningStates.get(unit);
    services.push(serviceRecord(`systemd_${unit}`, unit, 'systemd', {
      unit_state: unitFiles.ok ? shortText(parts[1] || '') : '',
      runtime_state: runningState ? runningState.runtime_state : '',
      backing_tools: ['systemctl'],
      read_capabilities: ['systemctl_list_unit_files', 'systemctl_list_running_services'],
      planned_actions: ['status_read', 'start_requires_confirmation', 'stop_requires_confirmation', 'restart_requires_confirmation'],
      notes: runningState && runningState.description ? runningState.description : 'Systemd service discovered. Bootstrap did not start, stop, or restart it.',
    }));
    if (services.length >= MAX_SERVICES) break;
  }
  return { applications: [], services, observations };
}

function discoverLinuxServiceFiles() {
  const dirs = ['/etc/systemd/system', '/usr/local/lib/systemd/system', '/usr/lib/systemd/system', '/lib/systemd/system'];
  const services = [];
  const observations = [];
  const seen = new Set();
  let scanned = 0;
  for (const dir of dirs) {
    for (const entry of listDirSafe(dir, true)) {
      if (!entry.isFile() || !entry.name.endsWith('.service') || seen.has(entry.name)) continue;
      scanned += 1;
      seen.add(entry.name);
      services.push(serviceRecord(`service_file_${entry.name}`, entry.name, 'systemd_file', {
        host_path: path.join(dir, entry.name),
        backing_tools: ['filesystem'],
        read_capabilities: ['list_systemd_service_files'],
        planned_actions: ['systemctl_connector_required'],
        notes: 'Service unit file discovered by filesystem scan. Bootstrap did not query or control the service.',
      }));
      if (services.length >= MAX_SERVICES) break;
    }
    if (services.length >= MAX_SERVICES) break;
  }
  observations.push({ category: 'services', source: 'systemd_service_files', ok: true, excerpt: [`scanned_service_files=${scanned}`] });
  return { applications: [], services, observations };
}

function discoverMacApplications() {
  const dirs = ['/Applications', '/System/Applications', path.join(os.homedir(), 'Applications')];
  const applications = [];
  const observations = [];
  for (const dir of dirs) {
    for (const entry of listDirSafe(dir, true)) {
      if (!entry.isDirectory() || !entry.name.endsWith('.app')) continue;
      const name = entry.name.replace(/\.app$/i, '');
      applications.push(application(`mac_app_${name}`, name, 'macos_app', {
        host_path: path.join(dir, entry.name),
        source: 'macos_app_bundle',
        backing_tools: ['open'],
        read_capabilities: ['list_app_bundles'],
        planned_actions: ['open_requires_explicit_intent'],
        notes: 'macOS app bundle discovered. Bootstrap did not open it.',
      }));
      if (applications.length >= MAX_APPLICATIONS) break;
    }
    if (applications.length >= MAX_APPLICATIONS) break;
  }
  observations.push({ category: 'applications', source: 'macos_app_bundles', ok: true, excerpt: [`discovered_applications=${applications.length}`] });
  return { applications, services: [], observations };
}

function discoverMacServices(tools) {
  const services = [];
  const observations = [];
  if (!hasTool(tools, 'launchctl')) return { applications: [], services, observations };
  const launchctl = findToolPath(tools, 'launchctl') || 'launchctl';
  const result = runCommand(launchctl, ['list']);
  observations.push({ category: 'services', command: result.command, ok: result.ok, excerpt: lines(result.stdout || result.stderr, 30) });
  for (const line of lines(result.stdout, MAX_SERVICES).slice(1)) {
    const parts = line.split(/\s+/);
    const label = shortText(parts[2] || parts[0] || '');
    if (!label) continue;
    services.push(serviceRecord(`launchd_${label}`, label, 'launchd', {
      runtime_state: shortText(parts[0] || ''),
      backing_tools: ['launchctl'],
      read_capabilities: ['launchctl_list'],
      planned_actions: ['start_requires_confirmation', 'stop_requires_confirmation'],
      notes: 'launchd service discovered. Bootstrap did not start or stop it.',
    }));
  }
  return { applications: [], services, observations };
}

function discoverWindowsSoftware(tools) {
  const applications = [];
  const services = [];
  const observations = [];
  const shell = findToolPath(tools, 'powershell.exe') || findToolPath(tools, 'pwsh');
  if (!shell) {
    observations.push({ category: 'windows_software', ok: false, excerpt: ['PowerShell not available for Windows software discovery.'] });
    return { applications, services, observations };
  }
  const apps = runCommand(shell, ['-NoProfile', '-Command', 'Get-StartApps | Select-Object -First 200 Name,AppID | ConvertTo-Json -Compress']);
  const serviceResult = runCommand(shell, ['-NoProfile', '-Command', 'Get-Service | Select-Object -First 200 Name,Status,StartType | ConvertTo-Json -Compress']);
  observations.push({ category: 'applications', command: apps.command, ok: apps.ok, excerpt: lines(apps.stdout || apps.stderr, 10) });
  observations.push({ category: 'services', command: serviceResult.command, ok: serviceResult.ok, excerpt: lines(serviceResult.stdout || serviceResult.stderr, 10) });
  try {
    const payload = JSON.parse(apps.stdout || '[]');
    const records = Array.isArray(payload) ? payload : [payload];
    for (const item of records) {
      if (!item || !item.Name) continue;
      applications.push(application(`windows_app_${item.AppID || item.Name}`, item.Name, 'windows_start_app', {
        source: 'windows_start_apps',
        backing_tools: ['powershell'],
        read_capabilities: ['get_start_apps'],
        planned_actions: ['launch_requires_explicit_intent'],
        notes: 'Windows Start application discovered. Bootstrap did not launch it.',
      }));
    }
  } catch (_) {
  }
  try {
    const payload = JSON.parse(serviceResult.stdout || '[]');
    const records = Array.isArray(payload) ? payload : [payload];
    for (const item of records) {
      if (!item || !item.Name) continue;
      services.push(serviceRecord(`windows_service_${item.Name}`, item.Name, 'windows_service_control_manager', {
        unit_state: shortText(item.StartType || ''),
        runtime_state: shortText(item.Status || ''),
        backing_tools: ['powershell'],
        read_capabilities: ['get_service'],
        planned_actions: ['start_requires_confirmation', 'stop_requires_confirmation', 'restart_requires_confirmation'],
        notes: 'Windows service discovered. Bootstrap did not start, stop, or restart it.',
      }));
    }
  } catch (_) {
  }
  return { applications, services, observations };
}

function dedupeById(records, key) {
  const map = new Map();
  for (const record of records) {
    if (!record || !record[key]) continue;
    if (!map.has(record[key])) map.set(record[key], record);
  }
  return Array.from(map.values()).sort((left, right) => String(left[key]).localeCompare(String(right[key])));
}

function discoverGenericHostSoftware(tools) {
  let discovered = [];
  if (process.platform === 'linux') {
    const systemd = discoverLinuxSystemdServices(tools);
    const serviceFiles = systemd.services.length
      ? { applications: [], services: [], observations: [] }
      : discoverLinuxServiceFiles(tools);
    discovered = [
      discoverLinuxDesktopApplications(tools),
      discoverLinuxFlatpakApplications(tools),
      discoverLinuxSnapApplications(tools),
      systemd,
      serviceFiles,
    ];
  } else if (process.platform === 'darwin') {
    discovered = [
      discoverMacApplications(tools),
      discoverMacServices(tools),
    ];
  } else if (process.platform === 'win32') {
    discovered = [discoverWindowsSoftware(tools)];
  } else {
    discovered = [{
      applications: [],
      services: [],
      observations: [{ category: 'software', ok: false, excerpt: [`unsupported_platform=${process.platform}`] }],
    }];
  }
  return {
    applications: dedupeById(discovered.flatMap((item) => item.applications || []), 'application_id').slice(0, MAX_APPLICATIONS),
    services: dedupeById(discovered.flatMap((item) => item.services || []), 'service_id').slice(0, MAX_SERVICES),
    observations: discovered.flatMap((item) => item.observations || []),
  };
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

function buildCapabilities(tools, applications, services) {
  const availableTools = new Set(tools.filter((item) => item.available).map((item) => item.tool));
  const launcherTools = ['gtk-launch', 'xdg-open', 'gio', 'open', 'powershell.exe', 'pwsh']
    .filter((tool) => availableTools.has(tool));
  const serviceTools = ['systemctl', 'service', 'launchctl', 'powershell.exe', 'pwsh']
    .filter((tool) => availableTools.has(tool));
  const packageTools = ['flatpak', 'snap', 'dpkg-query', 'rpm', 'pacman', 'brew']
    .filter((tool) => availableTools.has(tool));
  return [
    capability('software_substrate_discovery', 'software', 'available', [], ['rileva software installato', 'scansiona applicazioni e servizi'], 'read_only'),
    capability(
      'application_inventory',
      'application',
      applications.length ? 'available' : 'not_available',
      launcherTools,
      ['quali applicazioni sono installate', 'trova firefox', 'elenca le applicazioni'],
      'read_only_inventory'
    ),
    capability(
      'application_launch',
      'application',
      applications.length && launcherTools.length ? 'available' : 'not_available',
      launcherTools,
      ['apri firefox', 'avvia libreoffice', 'apri il browser'],
      'requires_explicit_intent_and_application_connector'
    ),
    capability(
      'service_status_read',
      'service',
      services.length || serviceTools.length ? 'available' : 'not_available',
      serviceTools,
      ['mostra servizi attivi', 'stato servizio ssh', 'quali servizi girano'],
      'read_only_status'
    ),
    capability(
      'service_control',
      'service',
      services.length && serviceTools.length ? 'available' : 'not_available',
      serviceTools,
      ['avvia questo servizio', 'ferma questo servizio', 'riavvia questo servizio'],
      'requires_explicit_confirmation_and_service_connector'
    ),
    capability(
      'package_inventory',
      'package',
      packageTools.length ? 'available' : 'not_available',
      packageTools,
      ['quali pacchetti sono installati', 'trova applicazioni flatpak', 'trova applicazioni snap'],
      'read_only_package_listing'
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

function ensureSoftwareConnectorRegistryEntry() {
  ensureDir(CONNECTORS_DIR);
  const registry = readJsonSafe(CONNECTOR_REGISTRY_FILE) || {
    schema_version: 1,
    registry_name: 'generic_connector_registry',
    connectors: [],
  };
  if (!Array.isArray(registry.connectors)) registry.connectors = [];
  const existing = registry.connectors.find((item) => item && item.connector_id === 'software_discovery');
  const entry = {
    connector_id: 'software_discovery',
    name: 'Software Discovery',
    kind: 'application',
    status: 'experimental',
    implemented: true,
    execution_mode: 'snapshot_only',
    read_capabilities: ['application_inventory_emit', 'service_inventory_emit', 'software_bootstrap_report'],
    write_capabilities: ['software_registry_emit', 'software_observation_append'],
    notes: 'Read-only installed application and service discovery over host-exposed OS substrates. Does not launch apps or start, stop, or restart services.',
  };
  if (existing) {
    Object.assign(existing, entry);
  } else {
    registry.connectors.push(entry);
  }
  registry.updated_at = nowIso();
  atomicWriteJsonLocked(CONNECTOR_REGISTRY_FILE, registry, {
    context: 'software_connector_registry_entry',
  });
  return entry;
}

function buildRegistry() {
  const tools = discoverTools();
  const host = hostInfo();
  const discovered = discoverGenericHostSoftware(tools);
  const applications = discovered.applications;
  const services = discovered.services;
  const observations = discovered.observations;
  const capabilities = buildCapabilities(tools, applications, services);
  const updatedAt = nowIso();
  return {
    schema_version: 1,
    updated_at: updatedAt,
    mode: 'software_bootstrap_read_only',
    locality: {
      scope: 'host_local',
      portable: false,
      output_dir: rel(SOFTWARE_DIR),
      clean_command: 'mdos software clean',
      notes: 'This inventory describes applications and services on the current host machine and is safe to delete and regenerate.',
    },
    host,
    policy: {
      read_only: true,
      no_application_launch: true,
      no_service_start: true,
      no_service_stop: true,
      no_service_restart: true,
      no_package_install: true,
      no_package_remove: true,
      no_process_kill: true,
    },
    discovered_tools: tools,
    capability_count: capabilities.length,
    application_count: applications.length,
    service_count: services.length,
    capabilities,
    applications,
    services,
    observations,
    source_hash: sha256Json({ host, tools, capabilities, applications, services, observations }),
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

function markdownCell(value) {
  const text = Array.isArray(value) ? value.join(', ') : String(value ?? '');
  return text.replace(/\|/g, '/');
}

function markdownTable(rows, columns) {
  if (!rows.length) return '- None detected.\n';
  const header = `| ${columns.map((column) => column.label).join(' | ')} |`;
  const separator = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => markdownCell(row[column.key])).join(' | ')} |`);
  return `${[header, separator, ...body].join('\n')}\n`;
}

function buildApplicationsMarkdown(registry) {
  const linesOut = [
    '# Software Applications',
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
    '## Safety',
    '',
    '- bootstrap is read-only',
    '- applications were not launched',
    '- desktop windows were not inspected',
    '- packages were not installed or removed',
    '',
    `## Applications (\`${registry.application_count}\`)`,
    '',
  ];
  for (const [kind, applications] of groupBy(registry.applications, 'kind')) {
    linesOut.push(`### ${kind}`, '');
    linesOut.push(markdownTable(applications, [
      { key: 'application_id', label: 'application_id' },
      { key: 'name', label: 'name' },
      { key: 'source', label: 'source' },
      { key: 'launch_status', label: 'launch' },
      { key: 'no_display', label: 'no_display' },
      { key: 'exec_command', label: 'exec' },
    ]));
  }
  return `${linesOut.join('\n')}\n`;
}

function buildServicesMarkdown(registry) {
  const linesOut = [
    '# Software Services',
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
    '## Safety',
    '',
    '- bootstrap is read-only',
    '- services were not started',
    '- services were not stopped',
    '- services were not restarted',
    '- processes were not killed',
    '',
    `## Services (\`${registry.service_count}\`)`,
    '',
  ];
  for (const [manager, services] of groupBy(registry.services, 'manager')) {
    linesOut.push(`### ${manager}`, '');
    linesOut.push(markdownTable(services, [
      { key: 'service_id', label: 'service_id' },
      { key: 'name', label: 'name' },
      { key: 'unit_state', label: 'unit_state' },
      { key: 'runtime_state', label: 'runtime_state' },
      { key: 'control_status', label: 'control' },
      { key: 'host_path', label: 'host_path' },
    ]));
  }
  return `${linesOut.join('\n')}\n`;
}

function buildCapabilitiesMarkdown(registry) {
  const linesOut = [
    '# Software Capabilities',
    '',
    `Updated at: \`${registry.updated_at}\``,
    '',
    'These capabilities describe what MD-OS can plan around after read-only software discovery.',
    'Actual launch or service control still requires dedicated bounded connectors and policy.',
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
  const appKinds = groupBy(registry.applications, 'kind')
    .map(([kind, applications]) => `${kind}=${applications.length}`)
    .join(', ') || 'none';
  const serviceManagers = groupBy(registry.services, 'manager')
    .map(([manager, services]) => `${manager}=${services.length}`)
    .join(', ') || 'none';
  return [
    'MD-OS (Artificial Prefrontal Cortex) v5.0 Software Bootstrap',
    bootStatus('SCAN', 'host software substrate'),
    bootStatus('OK', 'host OS', `${registry.host.platform} ${registry.host.os_release}`),
    bootStatus('SCAN', 'host software tools'),
    bootStatus('OK', 'available tools', String(availableTools)),
    bootStatus('SCAN', 'applications'),
    bootStatus(registry.application_count ? 'OK' : '--', 'applications', String(registry.application_count)),
    bootStatus('SCAN', 'services'),
    bootStatus(registry.service_count ? 'OK' : '--', 'services', String(registry.service_count)),
    bootStatus('OK', 'application kinds', appKinds),
    bootStatus('OK', 'service managers', serviceManagers),
    bootStatus('WRITE', rel(SOFTWARE_REGISTRY_JSON)),
    bootStatus('WRITE', rel(APPLICATIONS_MD)),
    bootStatus('WRITE', rel(SERVICES_MD)),
    bootStatus('WRITE', rel(CAPABILITIES_MD)),
    bootStatus('DONE', 'software substrate ready for natural-language control planning'),
  ];
}

function buildBootstrapReportMarkdown(registry, bootLines) {
  return [
    '# Software Bootstrap Report',
    '',
    `Updated at: \`${registry.updated_at}\``,
    '',
    '```text',
    ...bootLines,
    '```',
    '',
    '## Output Files',
    '',
    `- \`${rel(SOFTWARE_REGISTRY_JSON)}\``,
    `- \`${rel(APPLICATIONS_JSON)}\``,
    `- \`${rel(SERVICES_JSON)}\``,
    `- \`${rel(APPLICATIONS_MD)}\``,
    `- \`${rel(SERVICES_MD)}\``,
    `- \`${rel(CAPABILITIES_MD)}\``,
    `- \`${rel(BOOTSTRAP_REPORT_MD)}\``,
    `- \`${rel(OBSERVATIONS_NDJSON)}\``,
    '',
    'These files are host-local and can be deleted with `mdos software clean`.',
    '',
    '## Safety',
    '',
    'This bootstrap was read-only. It did not launch applications, inspect windows, start services, stop services, restart services, install packages, remove packages, or kill processes.',
    '',
  ].join('\n');
}

function writeOutputs(registry, bootLines) {
  ensureDir(SOFTWARE_DIR);
  atomicWriteJsonLocked(SOFTWARE_REGISTRY_JSON, registry, { context: 'software_registry' });
  atomicWriteJsonLocked(APPLICATIONS_JSON, {
    schema_version: 1,
    updated_at: registry.updated_at,
    applications: registry.applications,
    source_hash: sha256Json(registry.applications),
  }, { context: 'software_applications_json' });
  atomicWriteJsonLocked(SERVICES_JSON, {
    schema_version: 1,
    updated_at: registry.updated_at,
    services: registry.services,
    source_hash: sha256Json(registry.services),
  }, { context: 'software_services_json' });
  atomicWriteTextLocked(APPLICATIONS_MD, buildApplicationsMarkdown(registry), { context: 'software_applications_md' });
  atomicWriteTextLocked(SERVICES_MD, buildServicesMarkdown(registry), { context: 'software_services_md' });
  atomicWriteTextLocked(CAPABILITIES_MD, buildCapabilitiesMarkdown(registry), { context: 'software_capabilities_md' });
  atomicWriteTextLocked(BOOTSTRAP_REPORT_MD, buildBootstrapReportMarkdown(registry, bootLines), { context: 'software_bootstrap_report_md' });
  appendLineWithLock(OBSERVATIONS_NDJSON, `${JSON.stringify({
    schema_version: 1,
    observed_at: registry.updated_at,
    event: 'software_bootstrap_completed',
    source_hash: registry.source_hash,
    host: registry.host,
    application_count: registry.application_count,
    service_count: registry.service_count,
    capability_count: registry.capability_count,
    policy: registry.policy,
  })}\n`, {
    lockName: 'software_observations_append',
    context: 'software_bootstrap_observation',
  });
}

function softwareBootstrap({ jsonOnly = false, printJsonPayload = true } = {}) {
  const connectorEntry = ensureSoftwareConnectorRegistryEntry();
  const registry = buildRegistry();
  registry.connector_entry = connectorEntry;
  const bootLines = buildBootLines(registry);
  writeOutputs(registry, bootLines);
  appendJournal({
    event: 'software_bootstrap_completed',
    mode: registry.mode,
    locality: registry.locality.scope,
    output_dir: registry.locality.output_dir,
  });

  if (!jsonOnly) {
    for (const line of bootLines) process.stdout.write(`${line}\n`);
  }

  const payload = {
    ok: true,
    mode: 'software_bootstrap',
    read_only: true,
    locality: registry.locality,
    application_count: registry.application_count,
    service_count: registry.service_count,
    capability_count: registry.capability_count,
    output_json: rel(SOFTWARE_REGISTRY_JSON),
    applications_json: rel(APPLICATIONS_JSON),
    services_json: rel(SERVICES_JSON),
    applications_md: rel(APPLICATIONS_MD),
    services_md: rel(SERVICES_MD),
    capabilities_md: rel(CAPABILITIES_MD),
    bootstrap_report_md: rel(BOOTSTRAP_REPORT_MD),
    observations_ndjson: rel(OBSERVATIONS_NDJSON),
    source_hash: registry.source_hash,
  };
  if (printJsonPayload) printJson(payload);
  return payload;
}

function softwareList({ jsonOnly = false, printJsonPayload = true } = {}) {
  const registry = readJsonSafe(SOFTWARE_REGISTRY_JSON);
  const payload = {
    ok: Boolean(registry),
    mode: 'software_list',
    registry_file: rel(SOFTWARE_REGISTRY_JSON),
    application_count: registry && Array.isArray(registry.applications) ? registry.applications.length : 0,
    service_count: registry && Array.isArray(registry.services) ? registry.services.length : 0,
    capability_count: registry && Array.isArray(registry.capabilities) ? registry.capabilities.length : 0,
    registry: registry || null,
  };

  if (!jsonOnly) {
    if (!registry) {
      process.stdout.write('No local software inventory present. Run: mdos software bootstrap\n');
    } else {
      process.stdout.write('MD-OS (Artificial Prefrontal Cortex) v5.0 Software Inventory\n');
      process.stdout.write(`Applications: ${payload.application_count}\n`);
      process.stdout.write(`Services: ${payload.service_count}\n`);
      process.stdout.write(`Registry: ${payload.registry_file}\n`);
      process.stdout.write(`Clean: ${registry.locality && registry.locality.clean_command || 'mdos software clean'}\n`);
    }
  }

  if (printJsonPayload) printJson(payload);
  return payload;
}

function removeDirIfExists(dirPath) {
  if (!fs.existsSync(dirPath)) return false;
  fs.rmSync(dirPath, { recursive: true, force: true });
  return true;
}

function scrubSoftwareJournalEvents() {
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
  const softwareEvents = new Set(['software_bootstrap_completed', 'software_control_completed']);
  const linesIn = fs.readFileSync(JOURNAL_FILE, 'utf8').split(/\r?\n/);

  for (const line of linesIn) {
    if (!line.trim()) continue;
    total += 1;
    try {
      const payload = JSON.parse(line);
      if (softwareEvents.has(payload && payload.event)) {
        removed += 1;
        continue;
      }
    } catch (_) {
    }
    keptLines.push(line);
  }

  atomicWriteTextLocked(JOURNAL_FILE, keptLines.length ? `${keptLines.join('\n')}\n` : '', {
    lockName: 'journal__append',
    context: 'software_clean_journal_scrub',
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

function softwareClean({ jsonOnly = false, printJsonPayload = true } = {}) {
  const targets = [
    { label: 'software_local', dir: SOFTWARE_DIR },
    { label: 'software_legacy', dir: LEGACY_SOFTWARE_DIR },
  ];
  const removed = [];

  withFileLock('software_local_cache_clean', {
    context: 'software_clean',
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

  const journalScrub = scrubSoftwareJournalEvents();

  appendJournal({
    event: 'software_local_cache_cleaned',
    removed_paths: removed.map((item) => item.path),
    scrubbed_software_journal_events: journalScrub.removed_event_count,
  });

  const refreshedViews = refreshDerivedViewsAfterClean();
  const refreshFailed = refreshedViews.find((item) => !item.ok);
  if (refreshFailed) {
    const error = new Error(`SOFTWARE_CLEAN_REFRESH_FAILED: ${refreshFailed.script}`);
    error.refreshed_views = refreshedViews;
    throw error;
  }

  const payload = {
    ok: true,
    mode: 'software_clean',
    scope: 'host_local_software_inventory',
    removed_paths: removed.map((item) => item.path),
    canonical_output_dir: rel(SOFTWARE_DIR),
    journal_scrub: journalScrub,
    refreshed_views: refreshedViews,
  };

  if (!jsonOnly) {
    process.stdout.write('MD-OS (Artificial Prefrontal Cortex) v5.0 Software Clean\n');
    if (removed.length) {
      for (const item of removed) process.stdout.write(`[DELETE] ${item.path}\n`);
    } else {
      process.stdout.write('[OK] no local software inventory present\n');
    }
    process.stdout.write(`[SCRUB] ${journalScrub.journal_file}: ${journalScrub.removed_event_count} software scan event(s)\n`);
    for (const item of refreshedViews) process.stdout.write(`[REBUILD] ${item.script}\n`);
    process.stdout.write('[READY] regenerate with: mdos software bootstrap\n');
  }

  if (printJsonPayload) printJson(payload);
  return payload;
}

function usage() {
  process.stderr.write([
    'Usage:',
    '  node md-os/os/software_bootstrap.js [bootstrap] [--json|--no-json]',
    '  node md-os/os/software_bootstrap.js list [--json|--no-json]',
    '  node md-os/os/software_bootstrap.js clean [--json|--no-json]',
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
  if (command === 'bootstrap' || command === 'discover') {
    softwareBootstrap({
      jsonOnly: flags.includes('--json'),
      printJsonPayload: !flags.includes('--no-json'),
    });
    return;
  }
  if (command === 'list') {
    softwareList({
      jsonOnly: flags.includes('--json'),
      printJsonPayload: !flags.includes('--no-json'),
    });
    return;
  }
  if (command === 'clean') {
    softwareClean({
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
  APPLICATIONS_JSON,
  SERVICES_JSON,
  SOFTWARE_DIR,
  SOFTWARE_REGISTRY_JSON,
  LEGACY_SOFTWARE_DIR,
  softwareBootstrap,
  softwareClean,
  softwareList,
};
