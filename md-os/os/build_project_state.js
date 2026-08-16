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
  sha256Json,
  shortText,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteNdjson, atomicWriteText, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');
const { validateConnectorSnapshot, validateProject } = require('./lib/validation');
const { isTerminalState, normalizeWorkItemState } = require('./lib/work_item_state');

const PROJECTS_DIR = path.join(MDOS_ROOT, 'ops', 'projects');
const SOURCES_DIR = path.join(MDOS_ROOT, 'ops', 'sources');

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath);
}

function safeSlug(value) {
  return shortText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'item';
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readProject(projectId) {
  const projectDir = path.join(PROJECTS_DIR, projectId);
  const projectFile = path.join(projectDir, 'project.json');
  if (!fs.existsSync(projectFile)) {
    throw new Error(`PROJECT_NOT_FOUND: ${projectId}`);
  }
  const project = validateProject(readJson(projectFile));
  if (project.project_id !== projectId) {
    throw new Error(`PROJECT_ID_MISMATCH: ${project.project_id} != ${projectId}`);
  }
  return {
    projectDir,
    project,
  };
}

function loadSignals(projectId) {
  const snapshots = [];
  if (!fs.existsSync(SOURCES_DIR)) return snapshots;
  const channels = fs.readdirSync(SOURCES_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const channelEntry of channels) {
    const channelDir = path.join(SOURCES_DIR, channelEntry.name);
    const files = fs.readdirSync(channelDir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
    for (const fileEntry of files) {
      const filePath = path.join(channelDir, fileEntry.name);
      const payload = validateConnectorSnapshot(readJson(filePath));
      const projectMatch = payload.project_id === projectId || (Array.isArray(payload.project_ids) && payload.project_ids.includes(projectId));
      if (!projectMatch) continue;
      const signals = Array.isArray(payload.signals) ? payload.signals : [];
      for (const [index, signal] of signals.entries()) {
        snapshots.push({
          channel: channelEntry.name,
          file: rel(filePath),
          signal_index: index,
          connector_name: shortText(payload.connector_name || channelEntry.name),
          connector_kind: shortText(payload.connector_kind || 'generic'),
          signal,
        });
      }
    }
  }
  return snapshots;
}

function classifyPriority(priority) {
  const value = shortText(priority).toLowerCase();
  if (value === 'critical') return 4;
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  return 1;
}

function normalizeStatus(signal) {
  return normalizeWorkItemState(signal.state || signal.status || signal.status_hint || 'open');
}

function uniqueShortText(items) {
  return Array.from(new Set((items || []).map(shortText).filter(Boolean)));
}

function maxText(left, right) {
  if (!left) return right || '';
  if (!right) return left || '';
  return String(left).localeCompare(String(right)) >= 0 ? left : right;
}

function minText(left, right) {
  if (!left) return right || '';
  if (!right) return left || '';
  return String(left).localeCompare(String(right)) <= 0 ? left : right;
}

function stableSourceId(channel, file, signalIndex, signal) {
  if (signal.source_id !== undefined) return assertSafeId(signal.source_id, 'source_id');
  const hash = sha256Json({
    channel,
    file,
    signal_index: signalIndex,
    title: shortText(signal.title || ''),
    summary: shortText(signal.summary || ''),
  }).slice(0, 24);
  return assertSafeId(`${channel}_${hash}`, 'source_id');
}

function stableWorkItemKey(projectId, connectorKind, sourceId, signal) {
  const externalId = shortText(signal.external_reference_id || signal.external_id || signal.reference_id || '');
  if (externalId) return `${projectId}:external:${externalId}`;

  const commandId = signal.connector_runtime && shortText(signal.connector_runtime.command_id || '');
  if (commandId) {
    return `${projectId}:${connectorKind}:command:${commandId}:${sha256Json({
      summary: shortText(signal.summary || ''),
      title: shortText(signal.title || ''),
    }).slice(0, 16)}`;
  }

  return `${projectId}:source:${sourceId}`;
}

function workItemIdSeed(connectorKind, sourceId, signal) {
  const externalId = shortText(signal.external_reference_id || signal.external_id || signal.reference_id || '');
  if (externalId) return `external_${externalId}`;
  const commandId = signal.connector_runtime && shortText(signal.connector_runtime.command_id || '');
  if (commandId) return `${connectorKind}_command_${commandId}`;
  return sourceId;
}

function mergeWorkItem(existing, next) {
  existing.source_refs = uniqueShortText([...(existing.source_refs || []), ...(next.source_refs || [])]);
  existing.source_files = uniqueShortText([...(existing.source_files || []), ...(next.source_files || [])]);
  existing.source_channels = uniqueShortText([...(existing.source_channels || []), ...(next.source_channels || [])]);
  existing.entities = uniqueShortText([...existing.entities, ...next.entities]);
  existing.tags = uniqueShortText([...existing.tags, ...next.tags]);
  existing.suspected_causes = uniqueShortText([...existing.suspected_causes, ...next.suspected_causes]);
  existing.depends_on_source_ids = uniqueShortText([...existing.depends_on_source_ids, ...next.depends_on_source_ids]);
  existing.external_parties = uniqueShortText([...existing.external_parties, ...next.external_parties]);
  existing.created_at = minText(existing.created_at, next.created_at);
  existing.updated_at = maxText(existing.updated_at, next.updated_at);
  existing.last_signal_at = maxText(existing.last_signal_at, next.last_signal_at);
  existing.captured_at = maxText(existing.captured_at, next.captured_at);
  if (classifyPriority(next.priority) > classifyPriority(existing.priority)) existing.priority = next.priority;
  const nextIsNewer = String(next.last_signal_at || '') >= String(existing.last_signal_at || '');
  if (nextIsNewer && existing.state !== next.state) {
    existing.status = next.status;
    existing.state = next.status;
    existing.resolution = isTerminalState(next.state) ? shortText(next.resolution || next.state) : null;
  }
  existing.raw_signals.push(next.raw_signal);
  return existing;
}

function buildWorkItems(projectId, snapshots) {
  const itemsByKey = new Map();

  for (const { channel, file, signal_index, connector_name, connector_kind, signal } of snapshots) {
    const sourceId = stableSourceId(channel, file, signal_index, signal);
    const dedupeKey = stableWorkItemKey(projectId, connector_kind, sourceId, signal);
    const itemId = `wi_${safeSlug(workItemIdSeed(connector_kind, sourceId, signal))}`;
    const status = normalizeStatus(signal);
    const dueAt = shortText(signal.due_at || signal.follow_up_from_at || '');
    const capturedAt = shortText(signal.captured_at || '');
    const item = {
      id: itemId,
      project_id: projectId,
      title: shortText(signal.title || signal.summary || sourceId),
      source_id: sourceId,
      source_refs: [sourceId],
      source_channel: channel,
      source_channels: [channel],
      source_file: file,
      source_files: [file],
      connector_name,
      connector_kind,
      captured_at: capturedAt,
      created_at: capturedAt,
      updated_at: capturedAt,
      last_signal_at: capturedAt,
      status,
      state: status,
      priority: shortText(signal.priority || 'medium').toLowerCase(),
      owner: shortText(signal.owner_hint || ''),
      summary: shortText(signal.summary || ''),
      next_step: shortText(signal.next_step || ''),
      due_at: dueAt || null,
      entities: Array.isArray(signal.entities) ? signal.entities.map(shortText).filter(Boolean) : [],
      tags: Array.isArray(signal.tags) ? signal.tags.map(shortText).filter(Boolean) : [],
      suspected_causes: Array.isArray(signal.suspected_causes) ? signal.suspected_causes.map(shortText).filter(Boolean) : [],
      depends_on_source_ids: Array.isArray(signal.depends_on) ? signal.depends_on.map(shortText).filter(Boolean) : [],
      external_parties: Array.isArray(signal.external_parties) ? signal.external_parties.map(shortText).filter(Boolean) : [],
      resolution: isTerminalState(status) ? shortText(signal.resolution || status) : null,
      raw_signal: signal,
      raw_signals: [signal],
    };

    const existing = itemsByKey.get(dedupeKey);
    itemsByKey.set(dedupeKey, existing ? mergeWorkItem(existing, item) : item);
  }

  return Array.from(itemsByKey.values());
}

function buildRelations(workItems, sourceHash, generatedAt) {
  const sourceToWorkItem = new Map(workItems.map((item) => [item.source_id, item.id]));
  const edges = [];

  for (const item of workItems) {
    for (const dep of item.depends_on_source_ids) {
      edges.push({
        type: 'depends_on',
        from: item.id,
        to: sourceToWorkItem.get(dep) || dep,
      });
    }
    for (const entity of item.entities) {
      edges.push({
        type: 'touches_entity',
        from: item.id,
        to: entity,
      });
    }
    for (const cause of item.suspected_causes) {
      edges.push({
        type: 'suspects_cause',
        from: item.id,
        to: cause,
      });
    }
  }

  return {
    schema_version: 1,
    updated_at: generatedAt,
    source_hash: sourceHash,
    edge_count: edges.length,
    edges,
  };
}

function timeBucket(item) {
  if (item.state === 'done') return 'done';
  if (item.state === 'cancelled') return 'cancelled';
  if (item.state === 'blocked' || item.state === 'failed') return 'blocked';
  if (item.state === 'waiting_external' || item.external_parties.length) return 'watch_waiting_external';
  if (item.priority === 'critical' || item.priority === 'high') return 'do_now';
  if (item.due_at) return 'plan_now';
  return 'can_wait';
}

function buildPriorityQueue(workItems, sourceHash, generatedAt) {
  const buckets = {
    do_now: [],
    plan_now: [],
    watch_waiting_external: [],
    blocked: [],
    can_wait: [],
    done: [],
    cancelled: [],
  };
  for (const item of workItems) {
    buckets[timeBucket(item)].push(item.id);
  }
  return {
    schema_version: 1,
    updated_at: generatedAt,
    source_hash: sourceHash,
    buckets,
  };
}

function buildActiveMemory(workItems, sourceHash, generatedAt) {
  const entities = new Map();
  const causes = new Map();
  const dependencies = new Map();

  for (const item of workItems.filter((workItem) => !isTerminalState(workItem.state))) {
    for (const entity of item.entities) {
      const current = entities.get(entity) || { entity, work_items: [] };
      current.work_items.push(item.id);
      entities.set(entity, current);
    }
    for (const cause of item.suspected_causes) {
      const current = causes.get(cause) || { suspected_cause: cause, work_items: [] };
      current.work_items.push(item.id);
      causes.set(cause, current);
    }
    for (const dep of item.external_parties) {
      const current = dependencies.get(dep) || { external_party: dep, work_items: [] };
      current.work_items.push(item.id);
      dependencies.set(dep, current);
    }
  }

  return {
    schema_version: 1,
    updated_at: generatedAt,
    source_hash: sourceHash,
    entities: Array.from(entities.values()).sort((a, b) => a.entity.localeCompare(b.entity)),
    suspected_causes: Array.from(causes.values()).sort((a, b) => a.suspected_cause.localeCompare(b.suspected_cause)),
    external_dependencies: Array.from(dependencies.values()).sort((a, b) => a.external_party.localeCompare(b.external_party)),
  };
}

function buildAgenda(workItems, sourceHash, generatedAt) {
  const items = workItems
    .filter((item) => !isTerminalState(item.state))
    .map((item) => ({
      id: item.id,
      title: item.title,
      when: item.due_at || item.captured_at || generatedAt,
      activity: item.next_step || item.summary || item.title,
      owner: item.owner || null,
      dependencies: item.external_parties,
      priority: item.priority,
      project_id: item.project_id,
    }))
    .sort((a, b) => String(a.when).localeCompare(String(b.when)));

  return {
    schema_version: 1,
    updated_at: generatedAt,
    source_hash: sourceHash,
    item_count: items.length,
    items,
  };
}

function buildStatus(project, workItems, sourceHash, generatedAt) {
  const openCount = workItems.filter((item) => !isTerminalState(item.state)).length;
  const doneCount = workItems.filter((item) => item.state === 'done').length;
  const cancelledCount = workItems.filter((item) => item.state === 'cancelled').length;
  const waitingExternal = workItems.filter((item) => item.state === 'waiting_external').length;
  const blockedCount = workItems.filter((item) => item.state === 'blocked').length;
  const failedCount = workItems.filter((item) => item.state === 'failed').length;
  const criticalOrHigh = workItems.filter((item) => classifyPriority(item.priority) >= 3 && !isTerminalState(item.state)).length;

  return {
    schema_version: 1,
    updated_at: generatedAt,
    source_hash: sourceHash,
    project_id: project.project_id,
    title: project.title,
    owner: project.owner || null,
    status: openCount ? 'active' : 'quiet',
    summary: {
      open_count: openCount,
      done_count: doneCount,
      cancelled_count: cancelledCount,
      waiting_external_count: waitingExternal,
      blocked_count: blockedCount,
      failed_count: failedCount,
      critical_or_high_open_count: criticalOrHigh,
      overview: shortText(project.description || 'Generic project state'),
    }
  };
}

function statusMarkdown(status) {
  return [
    `# ${status.title}`,
    '',
    `Updated at: \`${status.updated_at}\``,
    '',
    `Owner: \`${status.owner || 'n/a'}\``,
    '',
    `Status: \`${status.status}\``,
    '',
    `Open: \`${status.summary.open_count}\``,
    '',
    `Done: \`${status.summary.done_count}\``,
    '',
    `Cancelled: \`${status.summary.cancelled_count}\``,
    '',
    `Waiting external: \`${status.summary.waiting_external_count}\``,
    '',
    `Blocked: \`${status.summary.blocked_count}\``,
    '',
    `Failed: \`${status.summary.failed_count}\``,
    '',
    `Critical/high open: \`${status.summary.critical_or_high_open_count}\``,
    '',
    status.summary.overview,
    ''
  ].join('\n');
}

function simpleMarkdown(title, updatedAt, items, formatter) {
  const lines = [`# ${title}`, '', `Updated at: \`${updatedAt}\``, ''];
  if (!items.length) {
    lines.push('- No items.');
  } else {
    for (const item of items) lines.push(formatter(item));
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  if (!process.argv[2]) {
    throw new Error('USAGE: node md-os/os/build_project_state.js <project_id>');
  }
  const projectId = assertSafeId(process.argv[2], 'project_id');

  const { projectDir, project } = readProject(projectId);
  const snapshots = loadSignals(projectId);
  const sourceHash = sha256Json({
    project,
    snapshots: snapshots.map(({ channel, file, signal_index, connector_name, connector_kind, signal }) => ({
      channel,
      file,
      signal_index,
      connector_name,
      connector_kind,
      signal,
    })),
  });
  const generatedAt = nowIso();
  const workItems = buildWorkItems(projectId, snapshots).sort((a, b) => {
    const priorityCompare = classifyPriority(b.priority) - classifyPriority(a.priority);
    if (priorityCompare !== 0) return priorityCompare;
    return String(a.id).localeCompare(String(b.id));
  });

  const status = buildStatus(project, workItems, sourceHash, generatedAt);
  const agenda = buildAgenda(workItems, sourceHash, generatedAt);
  const relations = buildRelations(workItems, sourceHash, generatedAt);
  const priorityQueue = buildPriorityQueue(workItems, sourceHash, generatedAt);
  const activeMemory = buildActiveMemory(workItems, sourceHash, generatedAt);

  withFileLock(`builder__project_state__${projectId}`, {
    context: `build_project_state:${projectId}`,
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteNdjson(path.join(projectDir, 'work_items.ndjson'), workItems);
    atomicWriteJson(path.join(projectDir, 'status.json'), status);
    atomicWriteText(path.join(projectDir, 'status.md'), statusMarkdown(status));
    atomicWriteJson(path.join(projectDir, 'agenda.json'), agenda);
    atomicWriteText(path.join(projectDir, 'agenda.md'), simpleMarkdown('Project Agenda', agenda.updated_at, agenda.items, (item) => `- \`${item.when}\` ${item.title} | ${item.activity}`));
    atomicWriteJson(path.join(projectDir, 'relations.json'), relations);
    atomicWriteText(path.join(projectDir, 'relations.md'), simpleMarkdown('Relations', relations.updated_at, relations.edges, (edge) => `- \`${edge.type}\` ${edge.from} -> ${edge.to}`));
    atomicWriteJson(path.join(projectDir, 'priority_queue.json'), priorityQueue);
    atomicWriteText(path.join(projectDir, 'priority_queue.md'), [
      '# Priority Queue',
      '',
      `Updated at: \`${priorityQueue.updated_at}\``,
      '',
      ...Object.entries(priorityQueue.buckets).flatMap(([bucket, ids]) => [`## ${bucket}`, '', ...(ids.length ? ids.map((id) => `- \`${id}\``) : ['- No items.']), '']),
    ].join('\n'));
    atomicWriteJson(path.join(projectDir, 'active_memory.json'), activeMemory);
    atomicWriteText(path.join(projectDir, 'active_memory.md'), [
      '# Active Memory',
      '',
      `Updated at: \`${activeMemory.updated_at}\``,
      '',
      '## Entities',
      '',
      ...(activeMemory.entities.length ? activeMemory.entities.map((item) => `- \`${item.entity}\`: ${item.work_items.join(', ')}`) : ['- No entities.']),
      '',
      '## Suspected Causes',
      '',
      ...(activeMemory.suspected_causes.length ? activeMemory.suspected_causes.map((item) => `- \`${item.suspected_cause}\`: ${item.work_items.join(', ')}`) : ['- No suspected causes.']),
      '',
      '## External Dependencies',
      '',
      ...(activeMemory.external_dependencies.length ? activeMemory.external_dependencies.map((item) => `- \`${item.external_party}\`: ${item.work_items.join(', ')}`) : ['- No external dependencies.']),
      '',
    ].join('\n'));
  });

  appendJournal({
    event: 'project_state_rebuilt',
    project_id: projectId,
    work_item_count: workItems.length,
    agenda_item_count: agenda.items.length,
    relation_count: relations.edge_count,
  });

  printJson({
    ok: true,
    mode: 'build_project_state',
    project_id: projectId,
    work_item_count: workItems.length,
    agenda_item_count: agenda.items.length,
    relation_count: relations.edge_count,
    output_dir: rel(projectDir),
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  buildWorkItems,
  classifyPriority,
  normalizeStatus,
  safeSlug,
  stableSourceId,
};
