#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertSafeId,
  nowIso,
  printJson,
  sha256Text,
  shortText,
} = require('./lib/common');
const { atomicWriteJsonLocked, ensureDir } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');
const { validateConnectorSnapshot } = require('./lib/validation');
const { boundedOutput } = require('./terminal_connector');

const CONNECTOR_PROFILE = path.join(MDOS_ROOT, 'ops', 'connectors', 'api_connector.json');
const CONNECTOR_SNAPSHOTS_DIR = path.join(MDOS_ROOT, 'ops', 'sources', 'connectors');
const ARTIFACTS_DIR = path.join(MDOS_ROOT, 'ops', 'artifacts', 'api');

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath);
}

function usage() {
  process.stderr.write(
    'Usage:\n' +
    '  node md-os/os/api_connector.js list\n' +
    '  node md-os/os/api_connector.js run <project_id> <request_id>\n'
  );
  process.exit(1);
}

function readProfile() {
  if (!fs.existsSync(CONNECTOR_PROFILE)) {
    throw new Error(`CONNECTOR_PROFILE_MISSING: ${rel(CONNECTOR_PROFILE)}`);
  }
  const profile = JSON.parse(fs.readFileSync(CONNECTOR_PROFILE, 'utf8'));
  validateProfile(profile);
  return profile;
}

function safeSlug(value) {
  return shortText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'item';
}

function positiveInt(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeMethod(method) {
  const value = shortText(method || 'GET').toUpperCase();
  if (!['GET', 'POST'].includes(value)) throw new Error(`UNSUPPORTED_API_METHOD: ${value}`);
  return value;
}

function validateProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('INVALID_API_CONNECTOR_PROFILE');
  }
  if (profile.schema_version !== 1) throw new Error(`UNSUPPORTED_API_CONNECTOR_SCHEMA_VERSION: ${profile.schema_version}`);
  assertSafeId(profile.connector_id || 'api_adapter', 'connector_id');
  if (!Array.isArray(profile.allowed_hosts) || profile.allowed_hosts.length === 0) {
    throw new Error('API_ALLOWED_HOSTS_REQUIRED');
  }
  for (const host of profile.allowed_hosts) {
    const value = shortText(host);
    if (!value || value.includes('/') || value.includes('\\')) throw new Error(`INVALID_API_ALLOWED_HOST: ${value}`);
  }
  if (!Array.isArray(profile.requests)) throw new Error('API_REQUESTS_MUST_BE_ARRAY');
  const seen = new Set();
  for (const request of profile.requests) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('INVALID_API_REQUEST');
    const requestId = assertSafeId(request.request_id, 'request_id');
    if (seen.has(requestId)) throw new Error(`DUPLICATE_API_REQUEST_ID: ${requestId}`);
    seen.add(requestId);
    normalizeMethod(request.method);
    parseAllowedUrl(request.url, profile.allowed_hosts);
    if (request.headers !== undefined && (!request.headers || typeof request.headers !== 'object' || Array.isArray(request.headers))) {
      throw new Error(`API_HEADERS_MUST_BE_OBJECT: ${requestId}`);
    }
  }
}

function parseAllowedUrl(value, allowedHosts) {
  let url;
  try {
    url = new URL(shortText(value));
  } catch (_) {
    throw new Error(`INVALID_API_URL: ${shortText(value)}`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`UNSUPPORTED_API_PROTOCOL: ${url.protocol}`);
  const allowed = new Set(allowedHosts.map((host) => shortText(host).toLowerCase()));
  const host = url.hostname.toLowerCase();
  const hostWithPort = url.host.toLowerCase();
  if (!allowed.has(host) && !allowed.has(hostWithPort)) {
    throw new Error(`API_HOST_NOT_ALLOWED: ${url.host}`);
  }
  return url;
}

function listRequests(profile) {
  const requests = Array.isArray(profile.requests) ? profile.requests : [];
  printJson({
    ok: true,
    mode: 'api_connector_list',
    connector_id: assertSafeId(profile.connector_id || 'api_adapter', 'connector_id'),
    request_count: requests.length,
    requests: requests.map((item) => ({
      request_id: shortText(item.request_id),
      method: normalizeMethod(item.method),
      url: shortText(item.url),
      summary: shortText(item.summary || ''),
    })),
  });
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function requestSourceId(requestId, stamp) {
  const suffix = stamp.replace(/[^a-zA-Z0-9_-]/g, '_');
  const prefix = `api_${requestId}_`;
  const maxPrefixLength = Math.max(1, 81 - suffix.length);
  return assertSafeId(`${prefix.slice(0, maxPrefixLength)}${suffix}`, 'source_id');
}

function buildHeaders(request) {
  const headers = {};
  for (const [key, value] of Object.entries(request.headers || {})) {
    const headerName = shortText(key);
    if (!/^[A-Za-z0-9-]+$/.test(headerName)) throw new Error(`INVALID_API_HEADER_NAME: ${headerName}`);
    headers[headerName] = String(value);
  }
  return headers;
}

function requestBody(method, request) {
  if (method !== 'POST') return undefined;
  if (request.body_json !== undefined) return JSON.stringify(request.body_json);
  if (request.body !== undefined) return String(request.body);
  return '';
}

async function runRequest(profile, projectId, requestId) {
  const requests = Array.isArray(profile.requests) ? profile.requests : [];
  const request = requests.find((item) => shortText(item.request_id) === requestId);
  if (!request) throw new Error(`UNKNOWN_API_REQUEST_ID: ${requestId}`);

  const method = normalizeMethod(request.method);
  const url = parseAllowedUrl(request.url, profile.allowed_hosts);
  const timeoutMs = positiveInt(request.timeout_ms, positiveInt(profile.default_timeout_ms, 15000));
  const maxResponseBytes = positiveInt(request.max_response_bytes, positiveInt(profile.max_response_bytes, 200000));
  const redactPatterns = Array.isArray(request.redact_patterns)
    ? request.redact_patterns
    : Array.isArray(profile.redact_patterns)
      ? profile.redact_patterns
      : ['token=', 'api_key=', 'secret=', 'authorization:'];

  const headers = buildHeaders(request);
  if (method === 'POST' && request.body_json !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const startedAt = Date.now();
  let response;
  let responseText = '';
  let errorText = '';
  try {
    response = await fetchWithTimeout(url, {
      method,
      headers,
      body: requestBody(method, request),
      redirect: 'manual',
    }, timeoutMs);
    responseText = await response.text();
  } catch (error) {
    errorText = error && error.message || String(error);
  }
  const finishedAt = Date.now();

  const statusCode = response ? response.status : null;
  const ok = Boolean(response && response.ok && !errorText);
  const boundedResponseText = boundedOutput(responseText, maxResponseBytes, redactPatterns);
  const boundedErrorText = boundedOutput(errorText, maxResponseBytes, redactPatterns);
  const ts = nowIso();
  const stamp = ts.replace(/[:.]/g, '-');

  ensureDir(ARTIFACTS_DIR);
  ensureDir(CONNECTOR_SNAPSHOTS_DIR);

  const artifactPath = path.join(ARTIFACTS_DIR, `${safeSlug(projectId)}__${safeSlug(requestId)}__${stamp}.json`);
  const artifact = {
    schema_version: 1,
    connector_name: 'api_adapter',
    request_id: requestId,
    project_id: projectId,
    executed_at: ts,
    method,
    url: url.toString(),
    status_code: statusCode,
    ok,
    duration_ms: finishedAt - startedAt,
    max_response_bytes: maxResponseBytes,
    response_excerpt: boundedResponseText,
    error_excerpt: boundedErrorText,
    response_sha256: sha256Text(responseText),
  };
  atomicWriteJsonLocked(artifactPath, artifact, {
    context: `api_artifact:${requestId}`,
  });

  const snapshotPath = path.join(CONNECTOR_SNAPSHOTS_DIR, `${safeSlug(projectId)}__api__${safeSlug(requestId)}.json`);
  const sourceId = requestSourceId(requestId, stamp);
  const snapshot = {
    schema_version: 1,
    connector_name: 'api_adapter',
    connector_kind: 'api',
    project_id: projectId,
    captured_at: ts,
    signals: [
      {
        source_id: sourceId,
        captured_at: ts,
        title: shortText(request.title || request.summary || request.request_id),
        summary: shortText(request.summary || `API request ${requestId} returned ${statusCode ?? 'no status'}.`),
        status_hint: ok ? 'open' : 'waiting_external',
        priority: shortText(request.priority || 'low').toLowerCase(),
        owner_hint: shortText(request.owner_hint || 'Platform Operations'),
        entities: Array.isArray(request.entities) ? request.entities.map(shortText).filter(Boolean) : [],
        tags: Array.isArray(request.tags) ? request.tags.map(shortText).filter(Boolean) : ['api'],
        suspected_causes: ok ? [] : ['api_request_failure'],
        depends_on: [],
        next_step: ok ? shortText(request.next_step || 'Inspect API snapshot output and classify whether any follow-up is needed.') : 'Inspect API response and classify the failure.',
        external_parties: Array.isArray(request.external_parties) ? request.external_parties.map(shortText).filter(Boolean) : [],
        connector_runtime: {
          request_id: requestId,
          method,
          url: url.toString(),
          status_code: statusCode,
          duration_ms: finishedAt - startedAt,
          ok,
          artifact_file: rel(artifactPath),
          max_response_bytes: maxResponseBytes,
          response_excerpt: shortText(boundedResponseText).slice(0, 500),
          error_excerpt: shortText(boundedErrorText).slice(0, 500),
          response_sha256: sha256Text(responseText),
        },
      },
    ],
  };
  validateConnectorSnapshot(snapshot);
  atomicWriteJsonLocked(snapshotPath, snapshot, {
    context: `api_snapshot:${projectId}:${requestId}`,
  });

  appendJournal({
    event: 'api_connector_run',
    project_id: projectId,
    request_id: requestId,
    ok,
    status_code: statusCode,
    duration_ms: finishedAt - startedAt,
    snapshot_file: rel(snapshotPath),
    artifact_file: rel(artifactPath),
  });

  printJson({
    ok: true,
    mode: 'api_connector_run',
    project_id: projectId,
    request_id: requestId,
    status_code: statusCode,
    duration_ms: finishedAt - startedAt,
    snapshot_file: rel(snapshotPath),
    artifact_file: rel(artifactPath),
  });
}

async function main() {
  const profile = readProfile();
  const command = process.argv[2];
  if (!command) usage();

  if (command === 'list') {
    listRequests(profile);
    return;
  }

  if (command === 'run') {
    if (!process.argv[3] || !process.argv[4]) usage();
    const projectId = assertSafeId(process.argv[3], 'project_id');
    const requestId = assertSafeId(process.argv[4], 'request_id');
    await runRequest(profile, projectId, requestId);
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
  parseAllowedUrl,
  requestSourceId,
  runRequest,
  validateProfile,
};
