#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const { spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertSafeId,
  nowIso,
  printJson,
  sha256Json,
  sha256Text,
  shortText,
} = require('./lib/common');
const {
  appendLineWithLock,
  atomicWriteJsonLocked,
  ensureDir,
} = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');
const { validateConnectorSnapshot } = require('./lib/validation');

const CONNECTOR_ID = 'openwa_whatsapp_gateway';
const PROFILE_FILE = path.join(MDOS_ROOT, 'ops', 'connectors', 'openwa_whatsapp_connector.json');
const CONNECTOR_SNAPSHOTS_DIR = path.join(MDOS_ROOT, 'ops', 'sources', 'connectors');
const LOCAL_DIR = path.join(MDOS_ROOT, 'ops', 'local', 'openwa_whatsapp');
const INBOUND_DIR = path.join(LOCAL_DIR, 'inbound');
const OUTBOUND_DIR = path.join(LOCAL_DIR, 'outbound');
const INBOX_FILE = path.join(LOCAL_DIR, 'inbox.ndjson');
const OUTBOX_FILE = path.join(LOCAL_DIR, 'outbox.ndjson');
const EVENTS_FILE = path.join(LOCAL_DIR, 'events.ndjson');
const PROCESSED_FILE = path.join(LOCAL_DIR, 'processed.ndjson');
const POLL_CURSOR_FILE = path.join(LOCAL_DIR, 'openwa_message_poll_cursor.json');
const PROCESSING_DIR = path.join(LOCAL_DIR, 'processing');
const CODEX_OUTPUT_DIR = path.join(LOCAL_DIR, 'codex_outputs');

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath);
}

function usage() {
  process.stderr.write([
    'Usage:',
    '  node md-os/os/openwa_whatsapp_connector.js list',
    '  node md-os/os/openwa_whatsapp_connector.js status',
    '  node md-os/os/openwa_whatsapp_connector.js snapshot',
    '  node md-os/os/openwa_whatsapp_connector.js sessions',
    '  node md-os/os/openwa_whatsapp_connector.js create-session [name] [webhook_url]',
    '  node md-os/os/openwa_whatsapp_connector.js start-session [session_id]',
    '  node md-os/os/openwa_whatsapp_connector.js get-qr [session_id]',
  '  node md-os/os/openwa_whatsapp_connector.js register-webhook [session_id] [webhook_url]',
    '  node md-os/os/openwa_whatsapp_connector.js replicate-structure [ai_root]',
    '  node md-os/os/openwa_whatsapp_connector.js poll-openwa-messages [chat_id|all] [limit] [--import-existing]',
  '  node md-os/os/openwa_whatsapp_connector.js enqueue-inbound [json]',
    '  node md-os/os/openwa_whatsapp_connector.js next [limit]',
    '  node md-os/os/openwa_whatsapp_connector.js render-reply <inbound_id|text|json>',
    '  node md-os/os/openwa_whatsapp_connector.js process-inbox [limit]',
    '  node md-os/os/openwa_whatsapp_connector.js worker [interval_ms]',
    '  node md-os/os/openwa_whatsapp_connector.js queue-reply <chat_id> <text>',
    '  node md-os/os/openwa_whatsapp_connector.js send-text <chat_id> <text>',
    '  node md-os/os/openwa_whatsapp_connector.js webhook [port]',
    '',
  ].join('\n'));
  process.exit(1);
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

function safeSlug(value) {
  return shortText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'item';
}

function parseJsonText(text, label = 'JSON') {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`INVALID_${label}: ${error.message}`);
  }
}

function readProfile() {
  if (!fs.existsSync(PROFILE_FILE)) {
    throw new Error(`OPENWA_PROFILE_MISSING: ${rel(PROFILE_FILE)}`);
  }
  const profile = parseJsonText(fs.readFileSync(PROFILE_FILE, 'utf8'), 'OPENWA_PROFILE');
  return validateProfile(profile);
}

function validateProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('INVALID_OPENWA_PROFILE');
  }
  if (profile.schema_version !== 1) {
    throw new Error(`UNSUPPORTED_OPENWA_PROFILE_SCHEMA_VERSION: ${profile.schema_version}`);
  }
  assertSafeId(profile.connector_id || CONNECTOR_ID, 'connector_id');
  assertSafeId(profile.project_id || 'whatsapp_gateway', 'project_id');
  if (!profile.openwa || typeof profile.openwa !== 'object' || Array.isArray(profile.openwa)) {
    throw new Error('OPENWA_CONFIG_REQUIRED');
  }
  for (const key of ['base_url_env', 'api_key_env', 'session_id_env']) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(shortText(profile.openwa[key]))) {
      throw new Error(`INVALID_OPENWA_ENV_NAME: ${key}`);
    }
  }
  const security = profile.security || {};
  if (security.allowed_chat_ids !== undefined && !Array.isArray(security.allowed_chat_ids)) {
    throw new Error('OPENWA_ALLOWED_CHAT_IDS_MUST_BE_ARRAY');
  }
  if (security.redact_patterns !== undefined && !Array.isArray(security.redact_patterns)) {
    throw new Error('OPENWA_REDACT_PATTERNS_MUST_BE_ARRAY');
  }
  return profile;
}

function envName(profile, key, fallback) {
  return shortText(profile.openwa && profile.openwa[key]) || fallback;
}

function envValue(profile, key, fallback) {
  return process.env[envName(profile, key, fallback)] || '';
}

function commandPrefix(profile) {
  return shortText(profile.security && profile.security.command_prefix || '@mdos');
}

function commandPrefixes(profile) {
  const primary = commandPrefix(profile);
  const alternates = new Set([primary].filter(Boolean));
  if (primary === '@mdos') alternates.add('/mdos');
  if (primary === '/mdos') alternates.add('@mdos');
  return Array.from(alternates);
}

function matchedCommandPrefix(profile, text) {
  const value = String(text || '');
  return commandPrefixes(profile)
    .sort((left, right) => right.length - left.length)
    .find((prefix) => prefix && value.startsWith(prefix)) || '';
}

function requireCommandPrefix(profile) {
  return profile.security && profile.security.require_command_prefix !== false;
}

function maxTextChars(profile) {
  const value = Number.parseInt(profile.security && profile.security.max_text_chars || '4000', 10);
  return Number.isFinite(value) && value > 0 ? value : 4000;
}

function allowedChatIds(profile) {
  return new Set((profile.security && profile.security.allowed_chat_ids || []).map(shortText).filter(Boolean));
}

function isChatAllowed(profile, chatId) {
  if (process.env.OPENWA_ALLOW_UNLISTED === '1') return true;
  const allowed = allowedChatIds(profile);
  return allowed.size > 0 && allowed.has(shortText(chatId));
}

function redactText(profile, text) {
  let output = String(text || '');
  const patterns = profile.security && Array.isArray(profile.security.redact_patterns)
    ? profile.security.redact_patterns
    : ['api_key=', 'token=', 'secret=', 'authorization:', 'password='];
  for (const pattern of patterns) {
    const marker = shortText(pattern);
    if (!marker) continue;
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    output = output.replace(new RegExp(`${escaped}[^\\s"'&]+`, 'gi'), `${marker}[REDACTED]`);
  }
  return output;
}

function truncateText(text, maxChars) {
  const value = String(text || '');
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[TRUNCATED ${value.length - maxChars} CHARS]`;
}

function existingDirectory(candidate) {
  const resolved = path.resolve(candidate);
  try {
    return fs.existsSync(resolved) && fs.statSync(resolved).isDirectory() ? resolved : '';
  } catch (_) {
    return '';
  }
}

function uniqueValues(values) {
  const output = [];
  const seen = new Set();
  for (const value of values) {
    const text = String(value || '');
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
  }
  return output;
}

function configuredRouteRoot() {
  return shortText(process.env.OPENWA_ROUTE_ROOT || process.env.MDOS_ROUTE_ROOT || '');
}

function routeSearchRoots() {
  return uniqueValues([
    configuredRouteRoot(),
    path.dirname(WORKSPACE_ROOT),
    WORKSPACE_ROOT,
  ].filter(Boolean));
}

function defaultRouteAlias() {
  return shortText(process.env.OPENWA_DEFAULT_ROUTE_ALIAS || path.basename(WORKSPACE_ROOT) || 'workspace');
}

function mdosRootForWorkspace(workspaceRoot) {
  const root = existingDirectory(workspaceRoot);
  if (!root) return '';
  if (
    path.basename(root) === 'md-os'
    && existingDirectory(path.join(root, 'kb'))
    && existingDirectory(path.join(root, 'os'))
  ) {
    return root;
  }
  const nested = existingDirectory(path.join(root, 'md-os'));
  return nested || '';
}

function workspaceRouteCandidates(routeToken) {
  const token = String(routeToken || '').trim().replace(/\\/g, '/').replace(/\/+$/g, '');
  if (!token) return [];
  const upper = token.toUpperCase();
  if (path.isAbsolute(token)) return [token];
  const roots = routeSearchRoots();
  if (upper === defaultRouteAlias().toUpperCase()) return [WORKSPACE_ROOT, ...roots.map((root) => path.join(root, token))];
  if (upper === 'HOME') return [os.homedir(), ...roots.map((root) => path.join(root, token))];
  if (upper === 'ROOT') return roots;
  if (['MD-OS', 'MDOS', 'MD_OS'].includes(upper)) {
    return [path.join(WORKSPACE_ROOT, 'md-os'), WORKSPACE_ROOT, ...roots.map((root) => path.join(root, token))];
  }
  return [
    ...roots.map((root) => path.join(root, token)),
    path.resolve(WORKSPACE_ROOT, token),
    path.resolve(MDOS_ROOT, token),
  ];
}

function defaultCommandRoute() {
  return {
    schema_version: 1,
    route_token: '',
    route_alias: defaultRouteAlias(),
    workspace_root: WORKSPACE_ROOT,
    mdos_root: mdosRootForWorkspace(WORKSPACE_ROOT) || MDOS_ROOT,
    resolved: true,
    error: null,
  };
}

function resolveCommandRoute(routeToken) {
  const token = String(routeToken || '').trim();
  if (!token) return defaultCommandRoute();
  const candidates = uniqueValues(workspaceRouteCandidates(token));
  for (const candidate of candidates) {
    const workspaceRoot = existingDirectory(candidate);
    if (!workspaceRoot) continue;
    return {
      schema_version: 1,
      route_token: token,
      route_alias: token,
      workspace_root: workspaceRoot,
      mdos_root: mdosRootForWorkspace(workspaceRoot),
      resolved: true,
      error: null,
    };
  }
  return {
    ...defaultCommandRoute(),
    route_token: token,
    route_alias: token,
    resolved: false,
    error: `workspace_not_found:${token}`,
  };
}

function parseCommandTextAndRoute(profile, text) {
  const prefix = matchedCommandPrefix(profile, text);
  if (!prefix) {
    return {
      prefix: commandPrefix(profile),
      has_prefix: false,
      command_text: '',
      command_route: defaultCommandRoute(),
    };
  }
  const afterPrefix = String(text || '').slice(prefix.length);
  if (afterPrefix.startsWith('/')) {
    const withoutSlash = afterPrefix.slice(1);
    const match = withoutSlash.match(/^(\S+)(?:\s+([\s\S]*))?$/);
    if (match && match[1]) {
      return {
        prefix,
        has_prefix: true,
        command_text: shortText(match[2] || ''),
        command_route: resolveCommandRoute(match[1]),
      };
    }
  }
  return {
    prefix,
    has_prefix: true,
    command_text: shortText(afterPrefix),
    command_route: defaultCommandRoute(),
  };
}

function ensureRuntimeDirs() {
  ensureDir(LOCAL_DIR);
  ensureDir(INBOUND_DIR);
  ensureDir(OUTBOUND_DIR);
  ensureDir(PROCESSING_DIR);
  ensureDir(CONNECTOR_SNAPSHOTS_DIR);
}

function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_) {
        return { malformed: line };
      }
    });
}

function countNdjson(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  return fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean).length;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && shortText(value)) return shortText(value);
    if (value && typeof value === 'object' && typeof value._serialized === 'string') return shortText(value._serialized);
  }
  return '';
}

function nestedMessageText(data) {
  if (!data || typeof data !== 'object') return '';
  return firstString(
    data.body,
    data.text,
    data.caption,
    data.message && data.message.conversation,
    data.message && data.message.extendedTextMessage && data.message.extendedTextMessage.text,
    data.message && data.message.imageMessage && data.message.imageMessage.caption,
    data.message && data.message.videoMessage && data.message.videoMessage.caption
  );
}

function normalizeTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 100000000000 ? value : value * 1000;
    return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  const text = shortText(value);
  if (text) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  return nowIso();
}

function normalizeInbound(profile, payload) {
  const envelope = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const data = envelope.data || envelope.payload && envelope.payload.data || envelope.message || envelope;
  const event = firstString(envelope.event, envelope.type, envelope.payload && envelope.payload.event, 'message.received');
  const sessionId = firstString(envelope.sessionId, envelope.session_id, data.sessionId, data.session_id);
  const messageId = firstString(
    envelope.messageId,
    data.messageId,
    data.id,
    data.id && data.id._serialized,
    data.key && data.key.id
  ) || `msg_${sha256Json(envelope).slice(0, 24)}`;
  const chatId = firstString(
    data.chatId,
    data.from,
    data.to,
    data.remoteJid,
    data.id && data.id.remote,
    data.key && data.key.remoteJid
  );
  const from = firstString(data.from, data.author, data.sender && data.sender.id, chatId);
  const textRaw = nestedMessageText(data);
  const text = truncateText(redactText(profile, textRaw), maxTextChars(profile));
  const fromMe = Boolean(data.fromMe || data.from_me);
  const isWorkerReply = /^!mdos\b/i.test(text.trim());
  const parsedCommand = parseCommandTextAndRoute(profile, text);
  const prefix = parsedCommand.prefix;
  const hasPrefix = parsedCommand.has_prefix;
  const commandText = parsedCommand.command_text;
  const commandRoute = parsedCommand.command_route;
  const prefixRequired = requireCommandPrefix(profile);
  const allowed = isChatAllowed(profile, chatId);
  const actionable = allowed && !isWorkerReply && (!prefixRequired || hasPrefix);
  const blockedReason = allowed
    ? (
      isWorkerReply ? 'worker_reply_prefix'
        : prefixRequired && !hasPrefix ? 'missing_command_prefix'
          : null
    )
    : 'chat_not_allowlisted';
  const capturedAt = nowIso();
  const inboundId = `wain_${sha256Text(`${chatId}|${messageId}|${capturedAt}`).slice(0, 24)}`;

  return {
    schema_version: 1,
    record_type: 'openwa_whatsapp_inbound',
    inbound_id: inboundId,
    captured_at: capturedAt,
    event,
    session_id: sessionId,
    message_id: messageId,
    chat_id: chatId,
    from,
    from_me: fromMe,
    timestamp: normalizeTimestamp(data.timestamp || data.waTimestamp || envelope.timestamp),
    text,
    text_sha256: sha256Text(text),
    has_media: Boolean(data.hasMedia || data.media || data.type && data.type !== 'chat'),
    message_type: shortText(data.type || data.messageType || 'text') || 'text',
    command_prefix: prefix,
    command_text: commandText,
    command_route: commandRoute,
    allowed_chat: allowed,
    actionable,
    blocked_reason: blockedReason,
    raw_payload_sha256: sha256Json(envelope),
  };
}

function inboundSourceId(inbound) {
  return assertSafeId(`openwa_${inbound.inbound_id}`.slice(0, 80), 'source_id');
}

function writeInbound(profile, payload) {
  ensureRuntimeDirs();
  const inbound = normalizeInbound(profile, payload);
  const artifactPath = path.join(INBOUND_DIR, `${safeSlug(inbound.inbound_id)}.json`);
  atomicWriteJsonLocked(artifactPath, {
    ...inbound,
    raw_payload: payload,
  }, {
    context: `openwa_inbound:${inbound.inbound_id}`,
  });
  appendLineWithLock(INBOX_FILE, `${JSON.stringify(inbound)}\n`, {
    context: `openwa_inbox:${inbound.inbound_id}`,
  });

  const snapshot = {
    schema_version: 1,
    connector_name: CONNECTOR_ID,
    connector_kind: 'messaging',
    project_id: assertSafeId(profile.project_id || 'whatsapp_gateway', 'project_id'),
    captured_at: inbound.captured_at,
    signals: [
      {
        source_id: inboundSourceId(inbound),
        captured_at: inbound.captured_at,
        title: inbound.actionable ? 'Actionable WhatsApp command received' : 'WhatsApp message observed',
        summary: shortText(inbound.text || `[${inbound.message_type}]`).slice(0, 500),
        status_hint: inbound.actionable ? 'open' : 'waiting_external',
        priority: inbound.actionable ? 'medium' : 'low',
        owner_hint: 'MD-OS APFC operator',
        entities: [inbound.chat_id, inbound.from].filter(Boolean),
        tags: ['openwa', 'whatsapp', inbound.actionable ? 'actionable' : 'observed'],
        suspected_causes: [],
        depends_on: [],
        next_step: inbound.actionable
          ? 'Route command_text through a supervised host runtime and queue any reply for explicit outbound send.'
          : 'Ignore unless the chat is allowlisted and the command prefix is present.',
        external_parties: ['OpenWA', 'WhatsApp'],
        connector_runtime: {
          inbound_id: inbound.inbound_id,
          event: inbound.event,
          session_id: inbound.session_id,
          chat_id: inbound.chat_id,
          message_id: inbound.message_id,
          allowed_chat: inbound.allowed_chat,
          actionable: inbound.actionable,
          blocked_reason: inbound.blocked_reason,
          command_route: inbound.command_route || null,
          artifact_file: rel(artifactPath),
          inbox_file: rel(INBOX_FILE),
          text_sha256: inbound.text_sha256,
        },
      },
    ],
  };
  validateConnectorSnapshot(snapshot);
  const snapshotPath = path.join(CONNECTOR_SNAPSHOTS_DIR, `${safeSlug(profile.project_id || 'whatsapp_gateway')}__openwa__last_inbound.json`);
  atomicWriteJsonLocked(snapshotPath, snapshot, {
    context: `openwa_snapshot:${inbound.inbound_id}`,
  });
  appendJournal({
    event: 'openwa_whatsapp_inbound',
    connector_id: CONNECTOR_ID,
    inbound_id: inbound.inbound_id,
    chat_id: inbound.chat_id,
    actionable: inbound.actionable,
    snapshot_file: rel(snapshotPath),
    artifact_file: rel(artifactPath),
  });
  return {
    inbound,
    snapshot_file: rel(snapshotPath),
    artifact_file: rel(artifactPath),
  };
}

function outboundId(chatId, text) {
  return `waout_${sha256Text(`${chatId}|${text}|${nowIso()}|${Math.random()}`).slice(0, 24)}`;
}

function queueOutbound(profile, chatId, text, status = 'queued') {
  ensureRuntimeDirs();
  const cleanedText = truncateText(redactText(profile, text), maxTextChars(profile));
  const allowed = isChatAllowed(profile, chatId);
  const record = {
    schema_version: 1,
    record_type: 'openwa_whatsapp_outbound',
    outbound_id: outboundId(chatId, cleanedText),
    queued_at: nowIso(),
    chat_id: shortText(chatId),
    text: cleanedText,
    text_sha256: sha256Text(cleanedText),
    allowed_chat: allowed,
    status: allowed ? status : 'blocked_unlisted_chat',
    sent_at: null,
    openwa_message_id: null,
    error: allowed ? null : 'chat_not_allowlisted',
  };
  const artifactPath = path.join(OUTBOUND_DIR, `${safeSlug(record.outbound_id)}.json`);
  atomicWriteJsonLocked(artifactPath, record, {
    context: `openwa_outbound:${record.outbound_id}`,
  });
  appendLineWithLock(OUTBOX_FILE, `${JSON.stringify(record)}\n`, {
    context: `openwa_outbox:${record.outbound_id}`,
  });
  appendJournal({
    event: 'openwa_whatsapp_outbound_queued',
    connector_id: CONNECTOR_ID,
    outbound_id: record.outbound_id,
    chat_id: record.chat_id,
    allowed_chat: record.allowed_chat,
    artifact_file: rel(artifactPath),
  });
  return {
    record,
    artifact_file: rel(artifactPath),
  };
}

function openwaRuntime(profile) {
  const baseUrl = envValue(profile, 'base_url_env', 'OPENWA_BASE_URL').replace(/\/+$/, '');
  const apiKey = envValue(profile, 'api_key_env', 'OPENWA_API_KEY');
  const sessionId = envValue(profile, 'session_id_env', 'OPENWA_SESSION_ID');
  return { baseUrl, apiKey, sessionId };
}

function openwaRegistryEntry(workspaceRoot = WORKSPACE_ROOT) {
  const workspaceName = path.basename(path.resolve(workspaceRoot));
  const runtimeOwner = path.resolve(workspaceRoot) === path.resolve(WORKSPACE_ROOT);
  return {
    connector_id: CONNECTOR_ID,
    name: 'OpenWA WhatsApp Gateway',
    kind: 'messaging',
    status: 'experimental',
    implemented: true,
    execution_mode: runtimeOwner ? 'webhook_queue_bridge' : 'routed_shared_webhook_queue_bridge',
    permission_profile: 'messaging_human_confirmed_write',
    risk_level: 'high',
    requires_approval: true,
    read_capabilities: [
      'openwa_webhook_receive',
      'openwa_message_history_poll',
      'whatsapp_message_normalize',
      'local_inbox_read',
      'connector_snapshot_emit',
    ],
    write_capabilities: [
      'local_outbound_queue_emit',
      'openwa_session_create_start_qr',
      'openwa_webhook_register',
      'openwa_send_text_when_configured',
      'connector_snapshot_emit',
    ],
    allowed_paths: [
      'md-os/ops/connectors/openwa_whatsapp_connector.json',
      'md-os/ops/local/openwa_whatsapp/**',
      'md-os/ops/sources/connectors/*__openwa__*.json',
    ],
    allowed_hosts: [
      'OPENWA_BASE_URL',
    ],
    side_effects: runtimeOwner
      ? 'Writes local WhatsApp inbound/outbound queue records and connector snapshots; sends WhatsApp text only when OpenWA env vars and chat allowlist permit it.'
      : `Declares a local route profile for workspace ${workspaceName}; the shared live OpenWA session remains owned by the configured gateway workspace.`,
    rollback_or_recovery_note: runtimeOwner
      ? 'Stop the webhook process, remove or archive md-os/ops/local/openwa_whatsapp records, and remove the OpenWA webhook/API key outside the repository.'
      : 'Remove the local openwa_whatsapp_connector.json profile and this registry entry; do not stop the shared gateway unless operating from the owner workspace.',
    audit_rule: 'Every inbound, queued reply, status snapshot, poll fallback, and send attempt records a journal event and local artifact.',
    notes: runtimeOwner
      ? 'Bounded bridge for operating MD-OS through OpenWA. Secrets, QR sessions, cookies, and API keys must stay outside repository files.'
      : 'Replicated connector structure for directory-routed WhatsApp operation. This workspace can be targeted by @mdos/<directory>; it must not launch an independent WhatsApp session unless explicitly promoted.',
  };
}

function localOpenwaProfile(profile, workspaceRoot = WORKSPACE_ROOT) {
  const localWorkspaceRoot = path.resolve(workspaceRoot);
  const localMdosRoot = mdosRootForWorkspace(localWorkspaceRoot) || path.join(localWorkspaceRoot, 'md-os');
  const runtimeOwner = localWorkspaceRoot === path.resolve(WORKSPACE_ROOT);
  return {
    ...profile,
    connector_id: CONNECTOR_ID,
    project_id: profile.project_id || 'whatsapp_gateway',
    routing: {
      schema_version: 1,
      role: runtimeOwner ? 'shared_gateway_owner' : 'routed_workspace_profile',
      local_workspace_root: localWorkspaceRoot,
      local_mdos_root: localMdosRoot,
      gateway_workspace_root: WORKSPACE_ROOT,
      gateway_mdos_root: MDOS_ROOT,
      default_route_alias: runtimeOwner ? defaultRouteAlias() : path.basename(localWorkspaceRoot),
      runtime_note: runtimeOwner
        ? 'This workspace owns the live OpenWA process, webhook, worker, and local queue.'
        : 'This workspace carries a replicated connector profile for route-aware operation; the live OpenWA process remains centralized in the gateway workspace.',
    },
  };
}

function discoverMdosWorkspaceRoots(aiRootArg = '') {
  const rootCandidates = uniqueValues([
    aiRootArg,
    process.env.OPENWA_REPLICATE_ROOT,
    process.env.OPENWA_REPLICATE_AI_ROOT,
    configuredRouteRoot(),
    path.dirname(WORKSPACE_ROOT),
  ].filter(Boolean));
  const aiRoot = rootCandidates.map(existingDirectory).find(Boolean);
  if (!aiRoot) return [];
  const roots = [];
  for (const entry of fs.readdirSync(aiRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const workspaceRoot = path.join(aiRoot, entry.name);
    const mdosRoot = mdosRootForWorkspace(workspaceRoot);
    if (!mdosRoot) continue;
    const connectorsDir = path.join(mdosRoot, 'ops', 'connectors');
    if (!existingDirectory(connectorsDir)) continue;
    roots.push(workspaceRoot);
  }
  return roots.sort((left, right) => path.basename(left).localeCompare(path.basename(right)));
}

function upsertConnectorRegistryEntry(registry, entry) {
  const base = registry && typeof registry === 'object' && !Array.isArray(registry)
    ? registry
    : {};
  const connectors = Array.isArray(base.connectors) ? base.connectors.slice() : [];
  const index = connectors.findIndex((connector) => connector && connector.connector_id === entry.connector_id);
  if (index >= 0) connectors[index] = { ...connectors[index], ...entry };
  else connectors.push(entry);
  return {
    schema_version: base.schema_version || 1,
    registry_name: base.registry_name || 'generic_connector_registry',
    ...base,
    connectors,
    updated_at: nowIso(),
  };
}

function copyConnectorOperationalFile(sourceName, targetMdosRoot) {
  const preferredSourcePath = path.join(MDOS_ROOT, 'os', sourceName);
  const packageSourcePath = path.join(__dirname, sourceName);
  const sourcePath = fs.existsSync(preferredSourcePath) ? preferredSourcePath : packageSourcePath;
  const targetPath = path.join(targetMdosRoot, 'os', sourceName);
  if (!fs.existsSync(sourcePath)) return { file: sourceName, copied: false, reason: 'source_missing' };
  if (path.resolve(sourcePath) === path.resolve(targetPath)) return { file: sourceName, copied: false, reason: 'same_file' };
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
  try {
    fs.chmodSync(targetPath, fs.statSync(sourcePath).mode & 0o777);
  } catch (_) {
    // Best effort: chmod is not required for JS readback.
  }
  return { file: sourceName, copied: true, target_file: targetPath };
}

function replicateConnectorStructure(profile, aiRootArg = '') {
  const workspaceRoots = discoverMdosWorkspaceRoots(aiRootArg);
  const operations = [];
  for (const workspaceRoot of workspaceRoots) {
    const localMdosRoot = mdosRootForWorkspace(workspaceRoot);
    const profilePath = path.join(localMdosRoot, 'ops', 'connectors', 'openwa_whatsapp_connector.json');
    const examplePath = path.join(localMdosRoot, 'examples', 'connectors', 'openwa_whatsapp_connector.json');
    const registryPath = path.join(localMdosRoot, 'ops', 'connectors', 'connector_registry.json');
    const localProfile = localOpenwaProfile(profile, workspaceRoot);
    const exampleProfile = {
      ...localProfile,
      security: {
        ...(localProfile.security || {}),
        allowed_chat_ids: [],
        notes: 'Example profile only. Add allowed_chat_ids in ops/connectors/openwa_whatsapp_connector.json before live use.',
      },
    };
    ensureDir(path.dirname(profilePath));
    ensureDir(path.dirname(examplePath));
    atomicWriteJsonLocked(profilePath, localProfile, {
      context: `openwa_replicate_profile:${workspaceRoot}`,
    });
    atomicWriteJsonLocked(examplePath, exampleProfile, {
      context: `openwa_replicate_example:${workspaceRoot}`,
    });

    const registry = readJsonIfExists(registryPath) || {
      schema_version: 1,
      registry_name: 'generic_connector_registry',
      connectors: [],
    };
    atomicWriteJsonLocked(registryPath, upsertConnectorRegistryEntry(registry, openwaRegistryEntry(workspaceRoot)), {
      context: `openwa_replicate_registry:${workspaceRoot}`,
    });

    const copied_files = [
      copyConnectorOperationalFile('openwa_whatsapp_connector.js', localMdosRoot),
      copyConnectorOperationalFile('openwa_whatsapp_channel.sh', localMdosRoot),
      copyConnectorOperationalFile('openwa_whatsapp_service.js', localMdosRoot),
    ];
    operations.push({
      workspace: path.basename(workspaceRoot),
      workspace_root: workspaceRoot,
      mdos_root: localMdosRoot,
      profile_file: path.relative(workspaceRoot, profilePath),
      example_file: path.relative(workspaceRoot, examplePath),
      registry_file: path.relative(workspaceRoot, registryPath),
      copied_files,
    });
  }
  appendJournal({
    event: 'openwa_whatsapp_connector_structure_replicated',
    connector_id: CONNECTOR_ID,
    workspace_count: operations.length,
    workspaces: operations.map((operation) => operation.workspace),
  });
  return operations;
}

function runtimeMissing(profile, runtime, requireSession = false) {
  return [
    runtime.baseUrl ? null : envName(profile, 'base_url_env', 'OPENWA_BASE_URL'),
    runtime.apiKey ? null : envName(profile, 'api_key_env', 'OPENWA_API_KEY'),
    requireSession && !runtime.sessionId ? envName(profile, 'session_id_env', 'OPENWA_SESSION_ID') : null,
  ].filter(Boolean);
}

async function openwaRequest(profile, method, endpoint, body = null, options = {}) {
  const runtime = openwaRuntime(profile);
  const missing = runtimeMissing(profile, runtime, Boolean(options.requireSession));
  if (missing.length) {
    return {
      ok: false,
      status: 'missing_openwa_runtime',
      missing_env: missing,
    };
  }
  const url = `${runtime.baseUrl}${endpoint}`;
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-API-Key': runtime.apiKey,
      'X-Request-ID': `mdos_${Date.now()}`,
    },
    body: body === null ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_) {
    payload = { raw: text };
  }
  return {
    ok: response.ok,
    status_code: response.status,
    response: payload,
  };
}

function sessionArgOrEnv(profile, value) {
  return shortText(value) || openwaRuntime(profile).sessionId;
}

function webhookUrlArgOrEnv(profile, value) {
  return shortText(value) || envValue(profile, 'webhook_url_env', 'OPENWA_WEBHOOK_URL');
}

function safeApiResponse(response) {
  if (!response || typeof response !== 'object') return response;
  const secretKeys = new Set(['qr', 'qrCode', 'code', 'image', 'apiKey', 'secret']);
  function scrub(value) {
    if (Array.isArray(value)) return value.map(scrub);
    if (!value || typeof value !== 'object') return value;
    const output = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = secretKeys.has(key) ? '[REDACTED]' : scrub(child);
    }
    return output;
  }
  return scrub(JSON.parse(JSON.stringify(response)));
}

async function listOpenwaSessions(profile) {
  const result = await openwaRequest(profile, 'GET', '/sessions');
  printJson({
    ok: result.ok,
    mode: 'openwa_sessions',
    status_code: result.status_code || null,
    missing_env: result.missing_env || [],
    response: safeApiResponse(result.response),
  });
}

async function createOpenwaSession(profile, nameArg, webhookUrlArg) {
  const name = shortText(nameArg || 'mdos-mdos');
  const webhookUrl = webhookUrlArgOrEnv(profile, webhookUrlArg);
  const body = { name };
  if (webhookUrl) {
    body.webhook = {
      url: webhookUrl,
      events: ['message.received', 'session.status'],
    };
    const secret = webhookSecret(profile);
    if (secret) body.webhook.secret = secret;
  }
  const result = await openwaRequest(profile, 'POST', '/sessions', body);
  const sessionId = result.response && (
    result.response.id
    || result.response.data && result.response.data.id
  ) || null;
  appendJournal({
    event: 'openwa_session_create',
    connector_id: CONNECTOR_ID,
    ok: result.ok,
    session_id: sessionId,
    webhook_url_configured: Boolean(webhookUrl),
  });
  printJson({
    ok: result.ok,
    mode: 'openwa_create_session',
    session_id: sessionId,
    export_hint: sessionId ? `export ${envName(profile, 'session_id_env', 'OPENWA_SESSION_ID')}=${sessionId}` : null,
    status_code: result.status_code || null,
    missing_env: result.missing_env || [],
    response: safeApiResponse(result.response),
  });
}

async function startOpenwaSession(profile, sessionIdArg) {
  const sessionId = sessionArgOrEnv(profile, sessionIdArg);
  if (!sessionId) throw new Error('OPENWA_SESSION_ID_REQUIRED');
  const result = await openwaRequest(profile, 'POST', `/sessions/${encodeURIComponent(sessionId)}/start`);
  appendJournal({
    event: 'openwa_session_start',
    connector_id: CONNECTOR_ID,
    ok: result.ok,
    session_id: sessionId,
  });
  printJson({
    ok: result.ok,
    mode: 'openwa_start_session',
    session_id: sessionId,
    status_code: result.status_code || null,
    missing_env: result.missing_env || [],
    response: safeApiResponse(result.response),
  });
}

function saveQrImage(profile, sessionId, response) {
  const image = response && (
    response.qrCode
    || response.image
    || response.data && response.data.image
    || response.data && response.data.qrCode
  );
  if (!shortText(image) || !String(image).startsWith('data:image/png;base64,')) return null;
  const qrDir = path.join(LOCAL_DIR, 'qr');
  ensureDir(qrDir);
  const stamp = nowIso().replace(/[:.]/g, '-');
  const filePath = path.join(qrDir, `${safeSlug(sessionId)}__${stamp}.png`);
  const base64 = String(image).replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'), { mode: 0o600 });
  return rel(filePath);
}

async function getOpenwaQr(profile, sessionIdArg) {
  const sessionId = sessionArgOrEnv(profile, sessionIdArg);
  if (!sessionId) throw new Error('OPENWA_SESSION_ID_REQUIRED');
  const result = await openwaRequest(profile, 'GET', `/sessions/${encodeURIComponent(sessionId)}/qr`);
  const qrImageFile = result.ok ? saveQrImage(profile, sessionId, result.response) : null;
  appendJournal({
    event: 'openwa_session_qr_fetch',
    connector_id: CONNECTOR_ID,
    ok: result.ok,
    session_id: sessionId,
    qr_image_file: qrImageFile,
  });
  printJson({
    ok: result.ok,
    mode: 'openwa_get_qr',
    session_id: sessionId,
    status_code: result.status_code || null,
    missing_env: result.missing_env || [],
    qr_image_file: qrImageFile,
    qr_code_present: Boolean(result.response && (
      result.response.qrCode
      || result.response.code
      || result.response.data && result.response.data.code
      || result.response.data && result.response.data.qrCode
    )),
    response: safeApiResponse(result.response),
    next_step: qrImageFile ? 'Open the PNG and scan it from WhatsApp > Linked devices.' : 'If the session is already connected, QR may not be returned.',
  });
}

async function registerOpenwaWebhook(profile, sessionIdArg, webhookUrlArg) {
  const sessionId = sessionArgOrEnv(profile, sessionIdArg);
  if (!sessionId) throw new Error('OPENWA_SESSION_ID_REQUIRED');
  const webhookUrl = webhookUrlArgOrEnv(profile, webhookUrlArg);
  if (!webhookUrl) throw new Error('OPENWA_WEBHOOK_URL_REQUIRED');
  const body = {
    url: webhookUrl,
    events: ['message.received', 'message.sent', 'message.ack', 'session.status'],
  };
  const secret = webhookSecret(profile);
  if (secret) body.secret = secret;
  const result = await openwaRequest(profile, 'POST', `/sessions/${encodeURIComponent(sessionId)}/webhooks`, body);
  appendJournal({
    event: 'openwa_webhook_register',
    connector_id: CONNECTOR_ID,
    ok: result.ok,
    session_id: sessionId,
    webhook_url: webhookUrl,
  });
  printJson({
    ok: result.ok,
    mode: 'openwa_register_webhook',
    session_id: sessionId,
    webhook_url: webhookUrl,
    status_code: result.status_code || null,
    missing_env: result.missing_env || [],
    response: safeApiResponse(result.response),
  });
}

async function postOpenwaText(profile, chatId, text) {
  const runtime = openwaRuntime(profile);
  if (!runtime.baseUrl || !runtime.apiKey || !runtime.sessionId) {
    return {
      sent: false,
      status: 'queued_missing_openwa_runtime',
      missing_env: [
        runtime.baseUrl ? null : envName(profile, 'base_url_env', 'OPENWA_BASE_URL'),
        runtime.apiKey ? null : envName(profile, 'api_key_env', 'OPENWA_API_KEY'),
        runtime.sessionId ? null : envName(profile, 'session_id_env', 'OPENWA_SESSION_ID'),
      ].filter(Boolean),
    };
  }

  const url = `${runtime.baseUrl}/sessions/${encodeURIComponent(runtime.sessionId)}/messages/send-text`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-API-Key': runtime.apiKey,
      'X-Request-ID': `mdos_${Date.now()}`,
    },
    body: JSON.stringify({
      chatId,
      text,
    }),
  });
  const responseText = await response.text();
  let body = null;
  try {
    body = responseText ? JSON.parse(responseText) : null;
  } catch (_) {
    body = { raw: responseText };
  }
  return {
    sent: response.ok,
    status: response.ok ? 'sent' : 'send_failed',
    status_code: response.status,
    response: body,
  };
}

async function sendText(profile, chatId, text) {
  if (!isChatAllowed(profile, chatId)) {
    const queued = queueOutbound(profile, chatId, text, 'blocked_unlisted_chat');
    return {
      ok: false,
      mode: 'openwa_send_text',
      reason: 'chat_not_allowlisted',
      outbound: queued.record,
      artifact_file: queued.artifact_file,
    };
  }

  const sent = await postOpenwaText(profile, chatId, text);
  const queued = queueOutbound(profile, chatId, text, sent.status);
  const record = {
    ...queued.record,
    status: sent.status,
    sent_at: sent.sent ? nowIso() : null,
    openwa_message_id: sent.response && sent.response.data && sent.response.data.messageId || null,
    openwa_status_code: sent.status_code || null,
    missing_env: sent.missing_env || [],
    error: sent.sent ? null : shortText(sent.response && sent.response.error && sent.response.error.message || sent.status),
  };
  const artifactPath = path.join(OUTBOUND_DIR, `${safeSlug(record.outbound_id)}.json`);
  atomicWriteJsonLocked(artifactPath, record, {
    context: `openwa_outbound_sent:${record.outbound_id}`,
  });
  appendLineWithLock(EVENTS_FILE, `${JSON.stringify({
    event: 'openwa_whatsapp_send_text',
    at: nowIso(),
    outbound_id: record.outbound_id,
    chat_id: record.chat_id,
    status: record.status,
    sent: sent.sent,
  })}\n`, {
    context: `openwa_event:${record.outbound_id}`,
  });
  appendJournal({
    event: 'openwa_whatsapp_send_text',
    connector_id: CONNECTOR_ID,
    outbound_id: record.outbound_id,
    chat_id: record.chat_id,
    status: record.status,
    sent: sent.sent,
    artifact_file: rel(artifactPath),
  });
  return {
    ok: sent.sent,
    mode: 'openwa_send_text',
    outbound: record,
    artifact_file: rel(artifactPath),
  };
}

function inboundMessageIds() {
  return new Set(
    readNdjson(INBOX_FILE)
      .map((record) => shortText(record && record.message_id))
      .filter(Boolean)
  );
}

function readPollCursor() {
  const cursor = readJsonIfExists(POLL_CURSOR_FILE);
  if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
    return {
      schema_version: 1,
      initialized_at: null,
      updated_at: null,
      seen_message_ids: [],
    };
  }
  return {
    schema_version: 1,
    initialized_at: cursor.initialized_at || null,
    updated_at: cursor.updated_at || null,
    seen_message_ids: Array.isArray(cursor.seen_message_ids) ? cursor.seen_message_ids.map(shortText).filter(Boolean) : [],
  };
}

function writePollCursor(cursor) {
  const seen = Array.from(new Set((cursor.seen_message_ids || []).map(shortText).filter(Boolean))).slice(-2000);
  atomicWriteJsonLocked(POLL_CURSOR_FILE, {
    schema_version: 1,
    initialized_at: cursor.initialized_at || nowIso(),
    updated_at: nowIso(),
    seen_message_ids: seen,
  }, {
    context: 'openwa_poll_cursor',
  });
}

function openwaHistoryMessageToPayload(profile, message) {
  const runtime = openwaRuntime(profile);
  const data = message && typeof message === 'object' ? message : {};
  const direction = shortText(data.direction).toLowerCase();
  return {
    event: 'message.history_poll',
    sessionId: runtime.sessionId,
    data: {
      id: firstString(data.waMessageId, data.messageId, data.id),
      chatId: firstString(data.chatId, data.from, data.to),
      from: firstString(data.from, data.chatId),
      to: firstString(data.to),
      body: firstString(data.body, data.text),
      fromMe: direction === 'outgoing',
      timestamp: data.timestamp || data.createdAt || data.updatedAt,
      type: shortText(data.type || 'chat') || 'chat',
      status: shortText(data.status),
      direction,
    },
  };
}

function normalizeOpenwaHistoryResponse(response) {
  if (Array.isArray(response)) return response;
  if (response && Array.isArray(response.messages)) return response.messages;
  if (response && response.data && Array.isArray(response.data.messages)) return response.data.messages;
  if (response && Array.isArray(response.data)) return response.data;
  return [];
}

async function pollOpenwaMessages(profile, chatIdArg = 'all', limitArg = '50', options = {}) {
  ensureRuntimeDirs();
  const limit = Math.max(1, Number.parseInt(limitArg || '50', 10) || 50);
  const importExisting = options.importExisting === true;
  const cursor = readPollCursor();
  const cursorAlreadyInitialized = Boolean(cursor.initialized_at);
  const chatIds = [];
  const requestedChatId = shortText(chatIdArg || 'all');
  if (requestedChatId && requestedChatId !== 'all') {
    chatIds.push(requestedChatId);
  } else {
    chatIds.push(...Array.from(allowedChatIds(profile)));
  }
  if (!chatIds.length) {
    const result = {
      ok: false,
      mode: 'openwa_whatsapp_poll_messages',
      reason: 'no_chat_ids_to_poll',
      polled: [],
      imported_count: 0,
    };
    if (!options.silent) printJson(result);
    return result;
  }

  const seen = new Set([...Array.from(inboundMessageIds()), ...cursor.seen_message_ids]);
  const imported = [];
  const seeded = [];
  const polled = [];
  for (const chatId of uniqueValues(chatIds)) {
    const endpoint = `/sessions/${encodeURIComponent(openwaRuntime(profile).sessionId)}/messages?chatId=${encodeURIComponent(chatId)}&limit=${encodeURIComponent(String(limit))}`;
    const response = await openwaRequest(profile, 'GET', endpoint, null, { requireSession: true });
    const messages = normalizeOpenwaHistoryResponse(response.response);
    polled.push({
      chat_id: chatId,
      ok: response.ok,
      status_code: response.status_code || null,
      observed_count: messages.length,
      missing_env: response.missing_env || [],
    });
    if (!response.ok) continue;
    for (const message of messages.slice().reverse()) {
      const payload = openwaHistoryMessageToPayload(profile, message);
      const messageId = firstString(payload.data.id);
      if (!messageId || seen.has(messageId)) continue;
      if (!cursorAlreadyInitialized && !importExisting) {
        seen.add(messageId);
        seeded.push(messageId);
        continue;
      }
      const result = writeInbound(profile, payload);
      seen.add(messageId);
      imported.push({
        inbound_id: result.inbound.inbound_id,
        message_id: result.inbound.message_id,
        chat_id: result.inbound.chat_id,
        actionable: result.inbound.actionable,
        blocked_reason: result.inbound.blocked_reason,
      });
    }
  }
  writePollCursor({
    initialized_at: cursor.initialized_at || nowIso(),
    seen_message_ids: Array.from(seen),
  });

  appendLineWithLock(EVENTS_FILE, `${JSON.stringify({
    event: 'openwa_whatsapp_message_history_poll',
    at: nowIso(),
    chat_ids: chatIds,
    imported_count: imported.length,
    seeded_count: seeded.length,
    import_existing: importExisting,
    polled,
  })}\n`, {
    context: 'openwa_message_history_poll',
  });
  appendJournal({
    event: 'openwa_whatsapp_message_history_poll',
    connector_id: CONNECTOR_ID,
    imported_count: imported.length,
    chat_ids: chatIds,
  });
  const result = {
    ok: true,
    mode: 'openwa_whatsapp_poll_messages',
    imported_count: imported.length,
    seeded_count: seeded.length,
    import_existing: importExisting,
    cursor_file: rel(POLL_CURSOR_FILE),
    imported,
    polled,
  };
  if (!options.silent) printJson(result);
  return result;
}

function listConnector(profile) {
  printJson({
    ok: true,
    mode: 'openwa_whatsapp_connector_list',
    connector_id: assertSafeId(profile.connector_id || CONNECTOR_ID, 'connector_id'),
    project_id: assertSafeId(profile.project_id || 'whatsapp_gateway', 'project_id'),
    commands: [
      'list',
      'status',
      'snapshot',
      'sessions',
      'create-session',
      'start-session',
      'get-qr',
      'register-webhook',
      'replicate-structure',
      'poll-openwa-messages',
      'enqueue-inbound',
      'next',
      'render-reply',
      'process-inbox',
      'worker',
      'queue-reply',
      'send-text',
      'webhook',
    ],
    openwa_env: {
      base_url: envName(profile, 'base_url_env', 'OPENWA_BASE_URL'),
      api_key: envName(profile, 'api_key_env', 'OPENWA_API_KEY'),
      session_id: envName(profile, 'session_id_env', 'OPENWA_SESSION_ID'),
      webhook_secret: envName(profile, 'webhook_secret_env', 'OPENWA_WEBHOOK_SECRET'),
      webhook_url: envName(profile, 'webhook_url_env', 'OPENWA_WEBHOOK_URL'),
    },
    security: {
      allowed_chat_count: allowedChatIds(profile).size,
      require_command_prefix: requireCommandPrefix(profile),
      command_prefix: commandPrefix(profile),
      unlisted_send_override_env: 'OPENWA_ALLOW_UNLISTED=1',
      codex_exec_env: 'OPENWA_CODEX_EXEC=1',
    },
    local_state: {
      inbox_file: rel(INBOX_FILE),
      outbox_file: rel(OUTBOX_FILE),
      local_dir: rel(LOCAL_DIR),
    },
  });
}

function status(profile) {
  const runtime = openwaRuntime(profile);
  printJson({
    ok: true,
    mode: 'openwa_whatsapp_connector_status',
    connector_id: assertSafeId(profile.connector_id || CONNECTOR_ID, 'connector_id'),
    configured: {
      base_url: Boolean(runtime.baseUrl),
      api_key: Boolean(runtime.apiKey),
      session_id: Boolean(runtime.sessionId),
      webhook_secret: Boolean(envValue(profile, 'webhook_secret_env', 'OPENWA_WEBHOOK_SECRET')),
      webhook_url: Boolean(envValue(profile, 'webhook_url_env', 'OPENWA_WEBHOOK_URL')),
    },
    security: {
      allowed_chat_count: allowedChatIds(profile).size,
      command_prefix: commandPrefix(profile),
      require_command_prefix: requireCommandPrefix(profile),
    },
    queues: {
      inbox_records: countNdjson(INBOX_FILE),
      outbox_records: countNdjson(OUTBOX_FILE),
      event_records: countNdjson(EVENTS_FILE),
      processed_records: countNdjson(PROCESSED_FILE),
    },
    bridge: {
      codex_exec_enabled: codexExecEnabled(),
      codex_sandbox: codexSandboxMode(),
      codex_output_dir: rel(CODEX_OUTPUT_DIR),
      poll_fallback_enabled: process.env.OPENWA_POLL_FALLBACK !== '0',
      poll_fallback_interval: process.env.OPENWA_WORKER_INTERVAL_MS || '3000',
    },
  });
}

function writeStatusSnapshot(profile) {
  ensureRuntimeDirs();
  const ts = nowIso();
  const runtime = openwaRuntime(profile);
  const snapshot = {
    schema_version: 1,
    connector_name: CONNECTOR_ID,
    connector_kind: 'messaging',
    project_id: assertSafeId(profile.project_id || 'whatsapp_gateway', 'project_id'),
    captured_at: ts,
    signals: [
      {
        source_id: assertSafeId(`openwa_status_${ts.replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 80), 'source_id'),
        captured_at: ts,
        title: 'OpenWA WhatsApp gateway status',
        summary: runtime.baseUrl && runtime.apiKey && runtime.sessionId
          ? 'OpenWA runtime environment is configured for outbound API calls.'
          : 'OpenWA connector scaffold is present; outbound runtime environment is incomplete.',
        status_hint: runtime.baseUrl && runtime.apiKey && runtime.sessionId ? 'open' : 'waiting_external',
        priority: 'medium',
        owner_hint: 'MD-OS APFC operator',
        entities: ['OpenWA', 'WhatsApp'],
        tags: ['openwa', 'whatsapp', 'connector', 'status'],
        suspected_causes: runtime.baseUrl && runtime.apiKey && runtime.sessionId ? [] : ['missing_openwa_runtime_env'],
        depends_on: [],
        next_step: runtime.baseUrl && runtime.apiKey && runtime.sessionId
          ? 'Register OpenWA webhook and start a supervised worker if continuous WhatsApp operation is desired.'
          : 'Start OpenWA and export OPENWA_BASE_URL, OPENWA_API_KEY, and OPENWA_SESSION_ID outside the repository.',
        external_parties: ['OpenWA', 'WhatsApp'],
        connector_runtime: {
          configured: {
            base_url: Boolean(runtime.baseUrl),
            api_key: Boolean(runtime.apiKey),
            session_id: Boolean(runtime.sessionId),
          },
          inbox_records: countNdjson(INBOX_FILE),
          outbox_records: countNdjson(OUTBOX_FILE),
          local_dir: rel(LOCAL_DIR),
        },
      },
    ],
  };
  validateConnectorSnapshot(snapshot);
  const snapshotPath = path.join(CONNECTOR_SNAPSHOTS_DIR, `${safeSlug(profile.project_id || 'whatsapp_gateway')}__openwa__status.json`);
  atomicWriteJsonLocked(snapshotPath, snapshot, {
    context: 'openwa_status_snapshot',
  });
  appendJournal({
    event: 'openwa_whatsapp_status_snapshot',
    connector_id: CONNECTOR_ID,
    snapshot_file: rel(snapshotPath),
  });
  printJson({
    ok: true,
    mode: 'openwa_whatsapp_status_snapshot',
    snapshot_file: rel(snapshotPath),
  });
}

function printNext(limit) {
  const records = readNdjson(INBOX_FILE)
    .filter((record) => record && record.record_type === 'openwa_whatsapp_inbound')
    .slice(-limit);
  printJson({
    ok: true,
    mode: 'openwa_whatsapp_next',
    count: records.length,
    records,
  });
}

function processedInboundIds() {
  return new Set(
    readNdjson(PROCESSED_FILE)
      .map((record) => shortText(record && record.inbound_id))
      .filter(Boolean)
  );
}

function inboundProcessingLockPath(inboundId) {
  return path.join(PROCESSING_DIR, `${safeSlug(inboundId)}.lock`);
}

function claimInbound(record) {
  const inboundId = shortText(record && record.inbound_id);
  if (!inboundId) return false;
  if (processedInboundIds().has(inboundId)) return false;
  ensureDir(PROCESSING_DIR);
  const lockPath = inboundProcessingLockPath(inboundId);
  try {
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeFileSync(fd, JSON.stringify({
      inbound_id: inboundId,
      claimed_at: nowIso(),
      pid: process.pid,
    }));
    fs.closeSync(fd);
    return true;
  } catch (error) {
    if (error && error.code === 'EEXIST') return false;
    throw error;
  }
}

function releaseInboundClaim(record) {
  const inboundId = shortText(record && record.inbound_id);
  if (!inboundId) return;
  try {
    fs.unlinkSync(inboundProcessingLockPath(inboundId));
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }
}

function openActionableRecords(limit) {
  const processed = processedInboundIds();
  return readNdjson(INBOX_FILE)
    .filter((record) => (
      record
      && record.record_type === 'openwa_whatsapp_inbound'
      && record.actionable === true
      && shortText(record.inbound_id)
      && !processed.has(record.inbound_id)
    ))
    .slice(0, limit);
}

function inboundRecordById(inboundId) {
  const wanted = shortText(inboundId);
  if (!wanted) return null;
  return readNdjson(INBOX_FILE)
    .find((record) => (
      record
      && record.record_type === 'openwa_whatsapp_inbound'
      && record.inbound_id === wanted
    )) || null;
}

function readTextIfExists(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  } catch (_) {
    return '';
  }
}

function readJsonIfExists(filePath) {
  try {
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;
  } catch (_) {
    return null;
  }
}

function buildStaticWorkerReply(record) {
  const commandText = shortText(record.command_text || record.text || '');
  const normalized = commandText.toLowerCase();

  if (['ping', 'test', 'stato', 'status'].includes(normalized)) {
    return [
      'MD-OS APFC operativo su WhatsApp.',
      `Ricevuta richiesta: ${commandText || '[vuoto]'}`,
      'Modalita attuale: gateway OpenWA + coda MD-OS + risposta supervisionata.',
    ].join('\n');
  }

  if (['help', 'aiuto'].includes(normalized)) {
    return [
      'Puoi scrivere:',
      '@mdos test',
      '@mdos stato',
      `@mdos/${defaultRouteAlias()} <testo>`,
      '@mdos/<directory> <testo>',
      '@mdos/MD-OS <testo>',
      '@mdos <testo da mettere in coda a MD-OS APFC>',
    ].join('\n');
  }

  return [
    'Ricevuto.',
    `Ho acquisito in MD-OS: ${commandText || '[richiesta vuota]'}`,
    'Per ora il canale WhatsApp e attivo in modalita supervisionata: il messaggio entra nella coda MD-OS APFC e la risposta viene inviata da qui.',
  ].join('\n');
}

function safeWorkerReply(text) {
  const value = String(text || '').trim();
  const safeText = value
    .replace(/^@mdos\s*/i, '')
    .replace(/^!mdos\s*/i, '')
    .trim();
  return `!mdos\n${safeText || 'Richiesta ricevuta.'}`.trim();
}

function codexExecEnabled() {
  return process.env.OPENWA_CODEX_EXEC === '1';
}

function codexSandboxMode() {
  const mode = shortText(process.env.OPENWA_CODEX_SANDBOX || 'workspace-write');
  return ['read-only', 'workspace-write', 'danger-full-access'].includes(mode) ? mode : 'workspace-write';
}

function codexBinary() {
  const configured = shortText(process.env.OPENWA_CODEX_BIN || '');
  if (configured) return configured;
  return 'codex';
}

function readBoundedText(filePath, maxChars = 12000) {
  const text = readTextIfExists(filePath).trim();
  if (!text) return '';
  return truncateText(text, maxChars);
}

function priorityRank(value) {
  const priority = shortText(value).toLowerCase();
  if (priority === 'critical') return 0;
  if (priority === 'high') return 1;
  if (priority === 'medium') return 2;
  if (priority === 'low') return 3;
  return 4;
}

function summarizeManualOperationalSignals(limit = 18) {
  const filePath = path.join(MDOS_ROOT, 'ops', 'sources', 'manual', 'maw_operational_agenda_current_state.json');
  const payload = readJsonIfExists(filePath);
  if (!payload || !Array.isArray(payload.signals)) return '';
  const signals = payload.signals
    .filter((signal) => signal && typeof signal === 'object')
    .slice()
    .sort((left, right) => {
      const byPriority = priorityRank(left.priority) - priorityRank(right.priority);
      if (byPriority !== 0) return byPriority;
      return String(right.captured_at || '').localeCompare(String(left.captured_at || ''));
    })
    .slice(0, limit)
    .map((signal) => ({
      source_id: shortText(signal.source_id),
      captured_at: shortText(signal.captured_at),
      priority: shortText(signal.priority),
      status_hint: shortText(signal.status_hint),
      summary: truncateText(signal.summary || '', 650),
      next_step: truncateText(signal.next_step || '', 450),
      entities: Array.isArray(signal.entities) ? signal.entities.slice(0, 8).map(shortText) : [],
      tags: Array.isArray(signal.tags) ? signal.tags.slice(0, 10).map(shortText) : [],
    }));
  return JSON.stringify({
    source_file: rel(filePath),
    captured_at: payload.captured_at || null,
    note: 'Fonte operativa manuale reale. Usala come contesto operativo quando pertinente alla richiesta naturale; non usare riepiloghi demo o scorciatoie locali se questa fonte contiene il tema richiesto.',
    signals,
  }, null, 2);
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function commandSearchTerms(commandText) {
  const stopWords = new Set([
    'dammi', 'numero', 'numeri', 'telefono', 'cell', 'cellulare', 'contatto',
    'contatti', 'della', 'dello', 'degli', 'delle', 'del', 'di', 'da', 'per',
    'con', 'che', 'cosa', 'fare', 'fammi', 'dimmi', 'il', 'lo', 'la', 'gli',
    'le', 'un', 'una', 'e', 'anche', 'quali', 'quale', 'sono', 'tutte',
    'tutti', 'tutta', 'tutto', 'utenze', 'utenza', 'utenti', 'utente',
    'interni', 'interno', 'nome', 'nomi', 'cognome', 'cognomi', 'persone',
    'persona', 'tabella',
  ]);
  const commonContextWords = new Set(['voismart', 'whatsapp', 'mdos']);
  const normalized = normalizeSearchText(commandText);
  const rawTerms = normalized
    .split(' ')
    .filter((term) => term.length >= 3 && !stopWords.has(term));
  let terms = rawTerms.filter((term) => !commonContextWords.has(term));
  if (!terms.length) terms = rawTerms;
  if (terms.includes('berti') && !terms.includes('berte')) terms.push('berte');
  if (terms.includes('berte') && !terms.includes('berti')) terms.push('berti');
  return Array.from(new Set(terms)).slice(0, 10);
}

function relevantLocalContextFiles() {
  return [
    path.join(MDOS_ROOT, 'kb', 'imports', 'legacy_lavoro_release', 'WA3_SEDE_AMMINISTRATIVA_TRANSCODIFICA_INTERNI.md'),
    path.join(MDOS_ROOT, 'kb', 'imports', 'legacy_lavoro_release', 'WA3_SEDE_AMMINISTRATIVA_TRANSCODIFICA_INTERNI_CON_CODE.md'),
    path.join(MDOS_ROOT, 'kb', 'imports', 'legacy_lavoro_release', 'PEOPLE_PROJECT_ROLE_MAP.md'),
    path.join(MDOS_ROOT, 'ops', 'imports', 'knowledge', 'legacy_lavoro_release', 'raw', 'mcp', 'ops', 'actions', 'voismart_phonebook_backup_20260423_112834.json'),
    path.join(MDOS_ROOT, 'ops', 'sources', 'manual', 'maw_operational_agenda_current_state.json'),
    path.join(MDOS_ROOT, 'ops', 'sources', 'manual', 'maw_connectivity_current_state.json'),
    path.join(MDOS_ROOT, 'ops', 'artifacts', 'intred_documentazione_consolidata_20260605', 'files', '15_cittadella_26051104inprr', 'scheda_tecnica_riassuntiva_20260608.md'),
    path.join(MDOS_ROOT, 'ops', 'artifacts', 'intred_documentazione_consolidata_20260605', 'files', '14_gemona_del_friuli_26051103inprr', 'scheda_tecnica_gemona_20260609.md'),
    path.join(MDOS_ROOT, 'ops', 'artifacts', 'intred_sal_rapportini_audit_20260605', 'sharepoint_sal_snapshot_20260605.json'),
  ];
}

function dynamicLocalContextRoots() {
  return [
    path.join(MDOS_ROOT, 'kb'),
    path.join(MDOS_ROOT, 'ops', 'sources'),
    path.join(MDOS_ROOT, 'ops', 'artifacts'),
    path.join(MDOS_ROOT, 'ops', 'imports', 'knowledge'),
    path.join(MDOS_ROOT, 'ops', 'connectors'),
    path.join(MDOS_ROOT, 'ops', 'summary'),
  ];
}

function isContextFilePath(filePath) {
  return ['.md', '.json', '.ndjson', '.csv', '.txt'].includes(path.extname(filePath).toLowerCase());
}

function isExcludedContextPath(filePath) {
  const relative = rel(filePath).replace(/\\/g, '/');
  return [
    '/.git/',
    '/node_modules/',
    '/ops/local/',
    '/ops/runtime/',
    '/openwa_runtime/',
    '/codex_outputs/',
    '/tmp_',
    '/workspace_inventory',
    '/markdown_graph',
    '/semantic_knowledge_graph',
  ].some((marker) => relative.includes(marker));
}

function collectContextFilesFromRoot(root, output, maxFiles) {
  if (output.length >= maxFiles || !fs.existsSync(root)) return;
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (_) {
    return;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (output.length >= maxFiles) return;
    const entryPath = path.join(root, entry.name);
    if (isExcludedContextPath(entryPath)) continue;
    if (entry.isDirectory()) {
      collectContextFilesFromRoot(entryPath, output, maxFiles);
      continue;
    }
    if (!entry.isFile() || !isContextFilePath(entryPath)) continue;
    try {
      const stat = fs.statSync(entryPath);
      if (stat.size > 8 * 1024 * 1024) continue;
    } catch (_) {
      continue;
    }
    output.push(entryPath);
  }
}

function discoverRelevantLocalContextFiles(maxFiles = 1200) {
  const output = [];
  for (const root of dynamicLocalContextRoots()) {
    collectContextFilesFromRoot(root, output, maxFiles);
    if (output.length >= maxFiles) break;
  }
  return output;
}

function localContextFilesForRequest() {
  const ordered = [];
  const seen = new Set();
  for (const filePath of [...relevantLocalContextFiles(), ...discoverRelevantLocalContextFiles()]) {
    if (!filePath || seen.has(filePath) || !fs.existsSync(filePath) || isExcludedContextPath(filePath)) continue;
    if (!isContextFilePath(filePath)) continue;
    seen.add(filePath);
    ordered.push(filePath);
  }
  return ordered;
}

function relevantJsonContactSummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const summary = {};
  for (const key of [
    'cn',
    'givenName',
    'sn',
    'o',
    'ou',
    'telephoneNumber',
    'mobile',
    'homePhone',
    'otherTelephone',
    'mail',
    'title',
    'departmentNumber',
    'employeeNumber',
    'phonebookid',
  ]) {
    if (value[key] !== undefined && value[key] !== null && String(value[key]).trim() !== '') {
      summary[key] = value[key];
    }
  }
  return Object.keys(summary).length ? summary : null;
}

function walkJsonContactMatches(value, terms, matches, sourceFile, maxMatches, depth = 0) {
  if (matches.length >= maxMatches || depth > 8 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      walkJsonContactMatches(item, terms, matches, sourceFile, maxMatches, depth + 1);
      if (matches.length >= maxMatches) break;
    }
    return;
  }
  if (typeof value !== 'object') return;

  const summary = relevantJsonContactSummary(value);
  if (summary) {
    const normalizedSummary = normalizeSearchText(JSON.stringify(summary));
    if (terms.some((term) => normalizedSummary.includes(term))) {
      matches.push({
        source_file: rel(sourceFile),
        type: 'json_contact',
        text: truncateText(JSON.stringify(summary), 1000),
      });
      return;
    }
  }

  for (const child of Object.values(value)) {
    walkJsonContactMatches(child, terms, matches, sourceFile, maxMatches, depth + 1);
    if (matches.length >= maxMatches) break;
  }
}

function scoreContextMatch(match, terms) {
  const text = `${match.source_file || ''} ${match.text || ''}`;
  const normalized = normalizeSearchText(text);
  const hits = terms.filter((term) => normalized.includes(term)).length;
  let score = hits * 100;
  if (hits && hits === terms.length) score += 60;
  if (match.type === 'json_contact') score += 90;
  if (/voismart_phonebook|phonebook|rubrica/i.test(match.source_file || '')) score += 50;
  if (/telephoneNumber|mobile|cellulare|telefono|otherTelephone|homePhone/i.test(match.text || '')) score += 25;
  if (/md-os\/ops\/artifacts|md-os\/ops\/sources/i.test(match.source_file || '')) score += 10;
  if (/WA3_SEDE_AMMINISTRATIVA/i.test(match.source_file || '') && hits < terms.length) score -= 30;
  return score;
}

function sortAndLimitContextMatches(matches, terms, maxMatches) {
  return matches
    .map((match, index) => ({
      ...match,
      _score: scoreContextMatch(match, terms),
      _index: index,
    }))
    .filter((match) => match._score > 0)
    .sort((left, right) => {
      if (right._score !== left._score) return right._score - left._score;
      return left._index - right._index;
    })
    .slice(0, maxMatches)
    .map(({ _score, _index, ...match }) => match);
}

function summarizeRelevantLocalContext(commandText, maxMatches = 24) {
  const terms = commandSearchTerms(commandText);
  if (!terms.length) return '';
  const matches = [];
  const maxCandidates = Math.max(maxMatches * 30, 500);
  for (const filePath of localContextFilesForRequest()) {
    const text = readTextIfExists(filePath);
    if (!text) continue;
    if (filePath.endsWith('.json')) {
      try {
        const payload = JSON.parse(text);
        walkJsonContactMatches(payload, terms, matches, filePath, maxCandidates);
      } catch (_) {
        // Fall back to line-based scan for malformed or non-contact JSON files.
      }
    }
    const lines = text.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const normalized = normalizeSearchText(line);
      if (!terms.some((term) => normalized.includes(term))) continue;
      const contextLines = lines
        .slice(Math.max(0, index - 1), Math.min(lines.length, index + 2))
        .map((contextLine) => contextLine.trim())
        .filter(Boolean);
      matches.push({
        source_file: rel(filePath),
        line: index + 1,
        text: truncateText(contextLines.join(' / '), 900),
      });
      if (matches.length >= maxCandidates) break;
    }
  }
  const rankedMatches = sortAndLimitContextMatches(matches, terms, maxMatches);
  if (!rankedMatches.length) return '';
  return JSON.stringify({
    search_terms: terms,
    note: 'Estratti MD-OS pertinenti alla richiesta naturale. Questa ricerca copre knowledge base, sorgenti manuali, artifact operativi, import legacy e registri connettori dentro md-os/. Usali come evidenza primaria quando contengono dati puntuali, numeri o riferimenti operativi.',
    matches: rankedMatches,
  }, null, 2);
}

function buildMdosBootstrapPack(commandText = '') {
  const sections = [
    ['Identity frame', readBoundedText(path.join(WORKSPACE_ROOT, 'ME.md'), 5000)],
    ['Cognitive bootstrap', readBoundedText(path.join(MDOS_ROOT, 'kb', 'COGNITIVE_BOOTSTRAP.md'), 8000)],
    ['Agentic core runtime', readBoundedText(path.join(MDOS_ROOT, 'ops', 'core', 'agentic_core.md'), 7000)],
    ['Operations model', readBoundedText(path.join(MDOS_ROOT, 'kb', 'OPERATIONS.md'), 6000)],
    ['Knowledge index', readBoundedText(path.join(MDOS_ROOT, 'kb', 'README.md'), 5000)],
    ['Active work items', readBoundedText(path.join(MDOS_ROOT, 'ops', 'summary', 'active_work_items.md'), 5000)],
    ['Global index', readBoundedText(path.join(MDOS_ROOT, 'ops', 'global_index.md'), 6500)],
    ['Semantic knowledge summary', readBoundedText(path.join(MDOS_ROOT, 'ops', 'semantic_knowledge_summary.md'), 6500)],
    ['Current runtime state', JSON.stringify(readJsonIfExists(path.join(MDOS_ROOT, 'ops', 'state.json')) || {}, null, 2)],
    ['Continuity readback', readBoundedText(path.join(MDOS_ROOT, 'ops', 'continuity.md'), 5000)],
    ['Relevant local operational extracts', summarizeRelevantLocalContext(commandText)],
    ['Manual operational context snapshot', summarizeManualOperationalSignals()],
    ['OpenWA bridge decision', readBoundedText(path.join(MDOS_ROOT, 'ops', 'sources', 'manual', 'whatsapp_dedicated_bot_decision_20260614.md'), 6500)],
  ];
  return sections
    .filter(([, content]) => String(content || '').trim())
    .map(([title, content]) => `## ${title}\n${content}`)
    .join('\n\n');
}

function effectiveCommandRoute(record) {
  const route = record && record.command_route && typeof record.command_route === 'object'
    ? record.command_route
    : defaultCommandRoute();
  const workspaceRoot = existingDirectory(route.workspace_root) || WORKSPACE_ROOT;
  return {
    schema_version: 1,
    route_token: shortText(route.route_token || ''),
    route_alias: shortText(route.route_alias || defaultRouteAlias()) || defaultRouteAlias(),
    workspace_root: workspaceRoot,
    mdos_root: mdosRootForWorkspace(workspaceRoot) || '',
    resolved: route.resolved !== false && !route.error,
    error: route.error || null,
  };
}

function codexPromptForRecord(record) {
  const commandText = String(record.command_text || '').trim();
  const route = effectiveCommandRoute(record);
  const bootstrapPack = buildMdosBootstrapPack(commandText);
  return [
    'Sei MD-OS APFC nel bridge WhatsApp verso MD-OS.',
    'Il prefisso @mdos e solo il trigger di attivazione e non va commentato nella risposta.',
    'Il prefisso /mdos e accettato come alias operativo dello stesso trigger.',
    'La forma @mdos/<directory> seleziona la directory di lavoro prima del testo della richiesta.',
    `Se non viene indicata alcuna directory, la directory di lavoro resta ${WORKSPACE_ROOT}.`,
    'Tutto il testo successivo e una richiesta naturale dell’utente.',
    `Interpreta la richiesta come input operativo dentro ${route.workspace_root}, nello stesso modo della chat Codex operativa.`,
    'Usa il bootstrap e la knowledge base MD-OS forniti sotto come punto di partenza, non come unica fonte disponibile.',
    'Quando servono dati puntuali, elenchi, numeri, contatti, stato progetto, agenda, ticket, filiali, VoiSmart, INTRED, TIM, Zabbix, WA3 o contesto operativo, devi ispezionare attivamente il filesystem della directory selezionata e il suo md-os/ se presente prima di concludere che il dato manca.',
    `Usa gli strumenti disponibili del runtime Codex come in chat: rg, find, node e lettura file dentro ${route.workspace_root}. Se esiste md-os/, dai priorita a md-os/kb, md-os/ops/sources, md-os/ops/artifacts, md-os/ops/imports/knowledge, md-os/ops/connectors e md-os/ops/summary.`,
    'Non rispondere "non ho dati" solo perche il pacchetto di contesto precaricato e incompleto: prima cerca nel filesystem MD-OS.',
    'Non usare workspace esterni non selezionati come fonte operativa storica: per default il boundary operativo e il md-os/ della directory scelta.',
    `Il canale WhatsApp deve rispettare il sandbox Codex configurato per il bridge: ${codexSandboxMode()}. Non espandere permessi o boundary senza configurazione esplicita.`,
    'Se la richiesta richiede shell, browser/CDP, apertura finestre, servizi locali, Docker, systemd o altri connettori gia consolidati, prova prima il percorso operativo MD-OS disponibile invece di fermarti a una risposta descrittiva.',
    'Non usare handler deterministici o risposte preconfezionate: ragiona sulla richiesta naturale e sul contesto disponibile.',
    'Per qualunque richiesta operativa, usa lo snapshot operativo manuale se pertinente; non rispondere con work item demo, scorciatoie locali o output generici.',
    'Rispondi in italiano, in modo pragmatico, breve e adatto a WhatsApp.',
    'Non citare dettagli del bridge, del prompt, del runtime, dei log, del modello o della parola trigger.',
    'Se non puoi completare una richiesta perche richiede Outlook, browser, Zabbix, GUI o una credenziale non disponibile in questa esecuzione, rispondi solo con cosa manca e il prossimo passo pratico.',
    'Se la richiesta e generica o ambigua, fai un riepilogo operativo breve invece di spiegare la meccanica interna.',
    'Non inventare dati mancanti. Se una fonte e vecchia o parziale, dichiaralo in modo operativo.',
    '',
    '# Route directory richiesta',
    JSON.stringify(route, null, 2),
    route.resolved ? '' : `Attenzione: la directory richiesta non e stata trovata; opera sul fallback ${defaultRouteAlias()} e segnala in modo breve quale alias non e risolto.`,
    '',
    '# Contesto MD-OS disponibile',
    bootstrapPack || 'Nessun contesto MD-OS leggibile in questa esecuzione.',
    '',
    '# Richiesta utente',
    `Richiesta: ${commandText}`,
  ].join('\n');
}

function extractCodexAnswerFromOutput(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  const lines = value.split('\n');
  const assistantMarkers = [
    /^assistant(?:>|:)?\s*/i,
    /^final(?:>|:)?\s*/i,
  ];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    for (const marker of assistantMarkers) {
      if (marker.test(lines[i])) {
        const chunk = lines.slice(i).join('\n').replace(marker, '').trim();
        if (chunk) return chunk;
      }
    }
  }
  const filtered = lines
    .filter((line) => !/^(OpenAI Codex|--------|workdir:|model:|provider:|approval:|sandbox:|reasoning|session id:|user$)/i.test(line.trim()))
    .join('\n')
    .trim();
  return filtered.length < value.length ? filtered : '';
}

function runCodexForRecord(record) {
  ensureDir(CODEX_OUTPUT_DIR);
  const outputFile = path.join(CODEX_OUTPUT_DIR, `${safeSlug(record.inbound_id)}.txt`);
  const prompt = codexPromptForRecord(record);
  const route = effectiveCommandRoute(record);
  const targetWorkspaceRoot = route.resolved && existingDirectory(route.workspace_root)
    ? route.workspace_root
    : WORKSPACE_ROOT;
  const timeoutMs = Math.max(30000, Number.parseInt(process.env.OPENWA_CODEX_TIMEOUT_MS || '600000', 10) || 600000);
  const resumeThreadId = shortText(process.env.OPENWA_CODEX_RESUME_THREAD_ID || '');
  const args = resumeThreadId
    ? [
      'exec',
      'resume',
      '--skip-git-repo-check',
      '--output-last-message',
      outputFile,
      resumeThreadId,
      '-',
    ]
    : [
      'exec',
      '--cd',
      targetWorkspaceRoot,
      '--sandbox',
      codexSandboxMode(),
      '--skip-git-repo-check',
      '--output-last-message',
      outputFile,
      '-',
    ];
  const result = spawnSync(codexBinary(), args, {
    cwd: targetWorkspaceRoot,
    input: prompt,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 20 * 1024 * 1024,
    env: {
      ...process.env,
      OPENWA_CODEX_EXEC: '',
    },
  });
  let answer = '';
  if (fs.existsSync(outputFile)) {
    answer = fs.readFileSync(outputFile, 'utf8').trim();
  }
  if (!answer) {
    answer = [
      'Ho ricevuto la richiesta, ma non sono riuscito a completare l’elaborazione automatica.',
      result.status === null ? 'La sessione ha superato il tempo massimo o e stata interrotta.' : `Esito tecnico: ${result.status}.`,
      'La richiesta resta tracciata in MD-OS e va ripresa dalla sessione operativa.',
    ].filter(Boolean).join('\n');
  }
  appendLineWithLock(EVENTS_FILE, `${JSON.stringify({
    event: 'openwa_whatsapp_codex_exec',
    at: nowIso(),
    inbound_id: record.inbound_id,
    command_route: route,
    resume_thread_id: resumeThreadId || null,
    status: result.status,
    signal: result.signal || null,
    output_file: rel(outputFile),
    stderr_sha256: sha256Text(result.stderr || ''),
  })}\n`, {
    context: `openwa_codex_exec:${record.inbound_id}`,
  });
  return truncateText(answer, maxTextChars(readProfile()));
}

async function buildWorkerReply(record) {
  const commandText = shortText(record.command_text || record.text || '');
  const normalized = commandText.toLowerCase();
  if (!codexExecEnabled()) {
    return safeWorkerReply(buildStaticWorkerReply(record));
  }
  if (['ping', 'test'].includes(normalized) && process.env.OPENWA_FAST_LOCAL_TEST === '1') {
    return safeWorkerReply(buildStaticWorkerReply(record));
  }
  return safeWorkerReply(runCodexForRecord(record));
}

async function renderReplyForDebug(profile, value) {
  let record = inboundRecordById(value);
  if (!record) {
    const text = shortText(value || '');
    if (text.startsWith('{')) {
      record = normalizeInbound(profile, parseJsonText(text, 'OPENWA_RENDER_REPLY'));
    } else {
      const body = commandPrefixes(profile).some((prefix) => prefix && text.startsWith(prefix))
        ? text
        : `${commandPrefix(profile)} ${text}`;
      record = normalizeInbound(profile, {
        event: 'debug.render_reply',
        sessionId: 'debug',
        data: {
          id: `debug_${sha256Text(text || nowIso()).slice(0, 24)}`,
          chatId: Array.from(allowedChatIds(profile))[0] || 'debug@c.us',
          from: Array.from(allowedChatIds(profile))[0] || 'debug@c.us',
          body,
          timestamp: Date.now(),
          type: 'chat',
        },
      });
    }
  }
  const reply = await buildWorkerReply(record);
  printJson({
    ok: true,
    mode: 'openwa_whatsapp_render_reply',
    inbound_id: record.inbound_id,
    command_text: record.command_text || '',
    command_route: record.command_route || null,
    reply,
    sent: false,
  });
}

function appendProcessed(record, replyResult) {
  const processed = {
    schema_version: 1,
    record_type: 'openwa_whatsapp_processed',
    processed_at: nowIso(),
    inbound_id: record.inbound_id,
    chat_id: record.chat_id,
    message_id: record.message_id,
    command_text_sha256: sha256Text(record.command_text || ''),
    reply_status: replyResult && replyResult.outbound && replyResult.outbound.status || null,
    reply_outbound_id: replyResult && replyResult.outbound && replyResult.outbound.outbound_id || null,
  };
  appendLineWithLock(PROCESSED_FILE, `${JSON.stringify(processed)}\n`, {
    context: `openwa_processed:${record.inbound_id}`,
  });
  appendJournal({
    event: 'openwa_whatsapp_inbound_processed',
    connector_id: CONNECTOR_ID,
    inbound_id: record.inbound_id,
    chat_id: record.chat_id,
    reply_status: processed.reply_status,
    reply_outbound_id: processed.reply_outbound_id,
  });
}

async function processInbox(profile, limitArg) {
  const limit = Math.max(1, Number.parseInt(limitArg || '20', 10) || 20);
  const records = openActionableRecords(limit);
  const processed = [];
  for (const record of records) {
    if (!claimInbound(record)) continue;
    try {
      const reply = await buildWorkerReply(record);
      const result = await sendText(profile, record.chat_id, reply);
      appendProcessed(record, result);
      processed.push({
        inbound_id: record.inbound_id,
        chat_id: record.chat_id,
        sent: Boolean(result.ok),
        status: result.outbound && result.outbound.status || null,
        outbound_id: result.outbound && result.outbound.outbound_id || null,
      });
    } finally {
      releaseInboundClaim(record);
    }
  }
  return {
    ok: true,
    mode: 'openwa_whatsapp_process_inbox',
    processed_count: processed.length,
    processed,
  };
}

async function startWorker(profile, intervalArg) {
  const intervalMs = Math.max(1000, Number.parseInt(intervalArg || process.env.OPENWA_WORKER_INTERVAL_MS || '3000', 10) || 3000);
  let tickRunning = false;
  printJson({
    ok: true,
    mode: 'openwa_whatsapp_worker',
    interval_ms: intervalMs,
    processed_file: rel(PROCESSED_FILE),
  });
  async function tick() {
    if (tickRunning) return;
    tickRunning = true;
    try {
      if (process.env.OPENWA_POLL_FALLBACK !== '0') {
        await pollOpenwaMessages(profile, 'all', process.env.OPENWA_POLL_LIMIT || '50', { silent: true });
      }
      const result = await processInbox(profile, '20');
      if (result.processed_count > 0) {
        process.stdout.write(`${JSON.stringify({ at: nowIso(), ...result })}\n`);
      }
    } catch (error) {
      process.stderr.write(`${nowIso()} ${error.stack || error.message}\n`);
    } finally {
      tickRunning = false;
    }
  }
  await tick();
  setInterval(tick, intervalMs);
}

function webhookSecret(profile) {
  return envValue(profile, 'webhook_secret_env', 'OPENWA_WEBHOOK_SECRET');
}

function verifyWebhookSignature(rawBody, headers, secret) {
  if (!secret) return true;
  const signature = shortText(
    headers['x-openwa-signature']
    || headers['x-hub-signature-256']
    || headers['x-signature']
    || headers['x-webhook-signature']
    || ''
  );
  if (!signature) return false;
  const expectedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const receivedHex = signature.includes('=') ? signature.split('=').pop() : signature;
  if (!/^[a-f0-9]{64}$/i.test(receivedHex)) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const received = Buffer.from(receivedHex, 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function startWebhook(profile, portArg) {
  const port = Number.parseInt(portArg || process.env.OPENWA_CONNECTOR_PORT || '2795', 10);
  if (!Number.isFinite(port) || port <= 0) throw new Error(`INVALID_OPENWA_WEBHOOK_PORT: ${portArg}`);
  const bindHost = shortText(process.env.OPENWA_CONNECTOR_BIND_HOST || '127.0.0.1');
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('method not allowed');
      return;
    }
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      if (!verifyWebhookSignature(rawBody, req.headers, webhookSecret(profile))) {
        res.statusCode = 401;
        res.end('invalid signature');
        return;
      }
      let payload;
      try {
        payload = parseJsonText(rawBody, 'OPENWA_WEBHOOK_BODY');
      } catch (error) {
        res.statusCode = 400;
        res.end(error.message);
        return;
      }
      try {
        const result = writeInbound(profile, payload);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          ok: true,
          inbound_id: result.inbound.inbound_id,
          actionable: result.inbound.actionable,
        }));
      } catch (error) {
        res.statusCode = 500;
        res.end(error.message);
      }
    });
  });
  server.listen(port, bindHost, () => {
    printJson({
      ok: true,
      mode: 'openwa_whatsapp_webhook_listen',
      url: `http://${bindHost}:${port}/`,
      signature_required: Boolean(webhookSecret(profile)),
    });
  });
}

async function main() {
  const profile = readProfile();
  const [command, ...rest] = process.argv.slice(2);
  if (!command) usage();

  if (command === 'list') {
    listConnector(profile);
    return;
  }
  if (command === 'status') {
    status(profile);
    return;
  }
  if (command === 'snapshot') {
    writeStatusSnapshot(profile);
    return;
  }
  if (command === 'sessions') {
    await listOpenwaSessions(profile);
    return;
  }
  if (command === 'create-session') {
    await createOpenwaSession(profile, rest[0], rest[1]);
    return;
  }
  if (command === 'start-session') {
    await startOpenwaSession(profile, rest[0]);
    return;
  }
  if (command === 'get-qr') {
    await getOpenwaQr(profile, rest[0]);
    return;
  }
  if (command === 'register-webhook') {
    await registerOpenwaWebhook(profile, rest[0], rest[1]);
    return;
  }
  if (command === 'replicate-structure') {
    const operations = replicateConnectorStructure(profile, rest[0]);
    printJson({
      ok: true,
      mode: 'openwa_whatsapp_replicate_structure',
      workspace_count: operations.length,
      operations,
    });
    return;
  }
  if (command === 'poll-openwa-messages') {
    const importExisting = rest.includes('--import-existing');
    const args = rest.filter((arg) => arg !== '--import-existing');
    await pollOpenwaMessages(profile, args[0] || 'all', args[1] || '50', { importExisting });
    return;
  }
  if (command === 'enqueue-inbound') {
    const jsonText = rest.length ? rest.join(' ') : readStdin();
    const payload = parseJsonText(jsonText, 'OPENWA_INBOUND');
    const result = writeInbound(profile, payload);
    printJson({
      ok: true,
      mode: 'openwa_whatsapp_enqueue_inbound',
      inbound_id: result.inbound.inbound_id,
      actionable: result.inbound.actionable,
      blocked_reason: result.inbound.blocked_reason,
      snapshot_file: result.snapshot_file,
      artifact_file: result.artifact_file,
    });
    return;
  }
  if (command === 'next') {
    const limit = Math.max(1, Number.parseInt(rest[0] || '10', 10) || 10);
    printNext(limit);
    return;
  }
  if (command === 'render-reply') {
    const value = rest.length ? rest.join(' ') : readStdin();
    await renderReplyForDebug(profile, value);
    return;
  }
  if (command === 'process-inbox') {
    printJson(await processInbox(profile, rest[0]));
    return;
  }
  if (command === 'worker') {
    await startWorker(profile, rest[0]);
    return;
  }
  if (command === 'queue-reply') {
    const [chatId, ...textParts] = rest;
    if (!chatId || !textParts.length) usage();
    const queued = queueOutbound(profile, chatId, textParts.join(' '), 'queued');
    printJson({
      ok: queued.record.allowed_chat,
      mode: 'openwa_whatsapp_queue_reply',
      outbound_id: queued.record.outbound_id,
      status: queued.record.status,
      artifact_file: queued.artifact_file,
    });
    return;
  }
  if (command === 'send-text') {
    const [chatId, ...textParts] = rest;
    if (!chatId || !textParts.length) usage();
    printJson(await sendText(profile, chatId, textParts.join(' ')));
    return;
  }
  if (command === 'webhook') {
    startWebhook(profile, rest[0]);
    return;
  }
  usage();
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  normalizeInbound,
  openwaRegistryEntry,
  localOpenwaProfile,
  queueOutbound,
  replicateConnectorStructure,
  verifyWebhookSignature,
};
