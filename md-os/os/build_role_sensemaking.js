#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertSafeId,
  nowIso,
  printJson,
  sha256Text,
  shortText,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteNdjson, atomicWriteText, ensureDir, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');
const { buildIntake } = require('./build_role_intake');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const MAX_TEXT_BYTES = 250000;
const MAX_CASES_PER_FILE = 500;
const TEXT_EXTENSIONS = new Set(['.csv', '.html', '.json', '.log', '.md', '.ndjson', '.txt', '.xml', '.yaml', '.yml']);

const OPERATION_PATTERNS = [
  ['ticket_triage', /ticket|segnalaz|support|assistenza|richiesta/i],
  ['order_entry', /ordine|\border\b|commessa|inseriment/i],
  ['invoice_check', /fattur|invoice|billing|pagament/i],
  ['price_check', /prezz|price|listin|scont|condizion/i],
  ['customer_master_data', /cliente|customer|anagrafic|codice cliente/i],
  ['supplier_master_data', /fornitor|supplier|vendor/i],
  ['approval_or_escalation', /approv|approval|autorizz|escalat|responsabile/i],
  ['shipping_or_delivery', /spedizion|shipping|delivery|consegn|trasport/i],
  ['reconciliation', /riconcil|quadr|controll|verific|match/i],
  ['notification', /email|mail|notific|avvis|comunic/i],
];

const SYMPTOM_PATTERNS = [
  ['production_blocked', /produzione ferma|blocco produzione|bloccato|down|outage|fermo|critical|urgente/i],
  ['missing_data', /mancante|missing|non presente|senza codice|codice mancante|dato assente/i],
  ['price_mismatch', /prezzo.*non|price.*mismatch|listino|sconto|condizion.*commercial/i],
  ['customer_blocked', /cliente bloccato|cliente sospeso|contratto non attivo|pagamento sospeso/i],
  ['delivery_delay', /ritardo|consegna|spedizione|delivery|shipping/i],
  ['invoice_anomaly', /fattura|invoice|addebito|billing|pagamento/i],
];

const ACTION_PATTERNS = [
  ['escalate', /escalat|responsabile|assegna.*team|team tecnico|avvisa.*responsabile/i],
  ['notify', /notific|avvis|email|mail|comunic/i],
  ['verify', /verific|controll|check|riconcil|quadr/i],
  ['update_record', /aggiorn|modific|update|inserisc|inseriment/i],
  ['request_information', /chied|richied|integraz|informaz/i],
  ['approve', /approv|autorizz|validaz/i],
  ['block_or_hold', /blocca|sospend|hold|ferma/i],
];

const OUTCOME_PATTERNS = [
  ['resolved', /risolto|resolved|chiuso|closed|completato|done/i],
  ['waiting_external', /in attesa|waiting|cliente non risponde|fornitore/i],
  ['escalated', /escalat|assegnato al team|responsabile/i],
  ['rejected', /rifiut|reject|annull|cancel/i],
];

const CAUSE_PATTERNS = [
  ['missing_or_wrong_data', /mancante|errato|sbagliato|non presente|senza codice/i],
  ['price_or_contract_mismatch', /prezzo|listino|contratto|sconto|condizion/i],
  ['system_or_service_failure', /sistema|down|errore|timeout|non funziona|produzione ferma/i],
  ['approval_missing', /approvazione|autorizzazione|responsabile/i],
  ['customer_or_supplier_state', /cliente bloccato|cliente sospeso|fornitore|pagamento/i],
  ['delivery_or_logistics_issue', /spedizione|consegna|ritardo|trasporto/i],
];

const SYSTEM_PATTERNS = [
  ['ERP', /\berp\b|sap|navision|zucchetti|teamsystem/i],
  ['CRM', /\bcrm\b|salesforce|hubspot|dynamics/i],
  ['Ticketing', /jira|zendesk|freshdesk|service.?now|ticket/i],
  ['Email', /outlook|gmail|email|mail/i],
  ['Spreadsheet', /excel|xlsx|xls|csv|foglio/i],
  ['Document repository', /sharepoint|drive|onedrive|cartella|folder/i],
  ['Chat', /teams|slack|chat|whatsapp/i],
];

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function usage() {
  process.stderr.write('Usage: node md-os/os/build_role_sensemaking.js <role_id>\n');
  process.exit(1);
}

function detectPairs(text, patterns) {
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([id]) => id);
}

function readTextIfReadable(filePath) {
  const ext = path.extname(filePath).toLowerCase() || '[no_ext]';
  if (!TEXT_EXTENSIONS.has(ext)) return '';
  const stats = fs.statSync(filePath);
  if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_TEXT_BYTES) return '';
  return fs.readFileSync(filePath, 'utf8');
}

function parseRoleProfile(roleFile, roleId) {
  const text = fs.existsSync(roleFile) ? fs.readFileSync(roleFile, 'utf8') : '';
  const sections = {};
  let current = 'preamble';
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1].toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      sections[current] = [];
      continue;
    }
    if (!sections[current]) sections[current] = [];
    sections[current].push(line);
  }
  const listItems = (key) => (sections[key] || [])
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => shortText(line.replace(/^-\s+/, '')))
    .filter(Boolean);
  const paragraph = (key) => shortText((sections[key] || []).join(' '));
  return {
    role_id: roleId,
    role_file: rel(roleFile),
    mission: paragraph('mission'),
    expected_outputs: listItems('expected_outputs'),
    systems: listItems('systems'),
    hard_boundaries: listItems('hard_boundaries'),
    escalation: listItems('escalation'),
  };
}

function parseCsvLine(line, delimiter) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseCsvRecords(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const headers = parseCsvLine(lines[0], delimiter).map((item, index) => shortText(item || `field_${index + 1}`));
  return lines.slice(1, MAX_CASES_PER_FILE + 1)
    .map((line) => parseCsvLine(line, delimiter))
    .map((cells, index) => ({
      locator: `row_${index + 2}`,
      record: Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] || ''])),
    }));
}

function objectToText(value, prefix = '') {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return shortText(value);
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item, index) => objectToText(item, `${prefix}${index}.`)).filter(Boolean).join('\n');
  }
  return Object.entries(value)
    .slice(0, 80)
    .map(([key, item]) => {
      if (item && typeof item === 'object') return `${prefix}${key}: ${objectToText(item, `${prefix}${key}.`)}`;
      return `${prefix}${key}: ${shortText(item)}`;
    })
    .filter(Boolean)
    .join('\n');
}

function parseJsonRecords(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (_) {
    return [];
  }
  let records = [];
  if (Array.isArray(payload)) records = payload;
  else if (payload && typeof payload === 'object') {
    const arrayKey = ['cases', 'tickets', 'issues', 'records', 'rows', 'data', 'items']
      .find((key) => Array.isArray(payload[key]));
    records = arrayKey ? payload[arrayKey] : [payload];
  }
  return records.slice(0, MAX_CASES_PER_FILE).map((record, index) => ({
    locator: `record_${index + 1}`,
    record,
  }));
}

function parseNdjsonRecords(text) {
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_CASES_PER_FILE)
    .map((line, index) => {
      try {
        return { locator: `line_${index + 1}`, record: JSON.parse(line) };
      } catch (_) {
        return { locator: `line_${index + 1}`, record: { text: line } };
      }
    });
}

function splitTextSegments(text) {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  const caseBoundary = /\n(?=(?:#{1,6}\s*)?(?:ticket|case|caso|ordine|pratica|segnalazione|richiesta|id)\b[\s:#_-])/gi;
  let parts = clean.split(caseBoundary).map((part) => part.trim()).filter((part) => part.length >= 20);
  if (parts.length <= 1) {
    const paragraphParts = clean.split(/\n{2,}/).map((part) => part.trim()).filter((part) => part.length >= 80);
    if (paragraphParts.length > 1) parts = paragraphParts;
  }
  if (!parts.length) parts = [clean];
  return parts.slice(0, MAX_CASES_PER_FILE).map((part, index) => ({
    locator: parts.length === 1 ? 'text' : `segment_${index + 1}`,
    text: part,
  }));
}

function extractCaseRef(text, fields) {
  const candidates = [
    fields.case_ref,
    fields.ticket_id,
    fields.id,
    fields.numero,
    fields.order_id,
    fields.ordine,
  ].filter(Boolean);
  if (candidates.length) return shortText(candidates[0]).slice(0, 80);
  const match = text.match(/\b(?:ticket|case|caso|ordine|pratica|id)[\s:#_-]*([A-Z0-9][A-Z0-9._-]{1,40})/i);
  return match ? match[1] : '';
}

function normalizeFieldName(key) {
  const normalized = String(key || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (/^(ticket|ticket_id|case|case_id|id|numero|num)$/.test(normalized)) return 'case_ref';
  if (/cliente|customer|ragione_sociale/.test(normalized)) return 'customer';
  if (/fornitore|supplier|vendor/.test(normalized)) return 'supplier';
  if (/priorita|priority|urgenza/.test(normalized)) return 'priority';
  if (/stato|status|state/.test(normalized)) return 'status';
  if (/sistema|system|applicazione|application/.test(normalized)) return 'system';
  if (/causa|cause|root_cause|motivo/.test(normalized)) return 'cause_note';
  if (/azione|action|next_step|step|attivita/.test(normalized)) return 'action_note';
  if (/esito|outcome|result|risoluzione/.test(normalized)) return 'outcome_note';
  if (/data|date|created|updated/.test(normalized)) return 'date';
  return normalized;
}

function extractFieldsFromText(text) {
  const fields = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:=;|]{2,45})\s*[:=;|]\s*(.{1,300})\s*$/);
    if (!match) continue;
    const key = normalizeFieldName(match[1]);
    if (!fields[key]) fields[key] = shortText(match[2]);
  }
  return fields;
}

function buildSegmentsForFile(filePath, file) {
  const text = readTextIfReadable(filePath);
  if (!text) return [];
  const ext = path.extname(filePath).toLowerCase() || '[no_ext]';
  if (ext === '.csv') {
    return parseCsvRecords(text).map((item) => ({
      locator: item.locator,
      text: objectToText(item.record),
      fields: Object.fromEntries(Object.entries(item.record || {}).map(([key, value]) => [normalizeFieldName(key), shortText(value)])),
    }));
  }
  if (ext === '.json') {
    return parseJsonRecords(text).map((item) => ({
      locator: item.locator,
      text: objectToText(item.record),
      fields: Object.fromEntries(Object.entries(item.record || {}).filter(([, value]) => typeof value !== 'object').map(([key, value]) => [normalizeFieldName(key), shortText(value)])),
    }));
  }
  if (ext === '.ndjson') {
    return parseNdjsonRecords(text).map((item) => ({
      locator: item.locator,
      text: objectToText(item.record),
      fields: Object.fromEntries(Object.entries(item.record || {}).filter(([, value]) => typeof value !== 'object').map(([key, value]) => [normalizeFieldName(key), shortText(value)])),
    }));
  }
  return splitTextSegments(text).map((segment) => ({
    ...segment,
    fields: extractFieldsFromText(segment.text),
  }));
}

function roleTerms(roleProfile) {
  return [
    roleProfile.mission,
    ...roleProfile.expected_outputs,
    ...roleProfile.systems,
    ...roleProfile.hard_boundaries,
    ...roleProfile.escalation,
  ]
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9àèéìòù]+/i)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4 && !['this', 'that', 'with', 'from', 'role', 'output'].includes(item));
}

function scoreRoleRelevance(text, roleProfile, systems, operationSignals) {
  const lower = text.toLowerCase();
  const terms = Array.from(new Set(roleTerms(roleProfile)));
  const matchedTerms = terms.filter((term) => lower.includes(term)).slice(0, 20);
  const systemMatches = roleProfile.systems.filter((system) => systems.includes(system) || lower.includes(system.toLowerCase()));
  const missionMatch = roleProfile.mission && roleProfile.mission.split(/\s+/).some((term) => term.length >= 6 && lower.includes(term.toLowerCase()));
  const rawScore = (matchedTerms.length * 0.08) + (systemMatches.length * 0.18) + (operationSignals.length * 0.06) + (missionMatch ? 0.15 : 0);
  const score = Math.max(0, Math.min(1, Number(rawScore.toFixed(2))));
  const reasons = [];
  if (matchedTerms.length) reasons.push(`matched role terms: ${matchedTerms.slice(0, 8).join(', ')}`);
  if (systemMatches.length) reasons.push(`matched role systems: ${systemMatches.join(', ')}`);
  if (operationSignals.length) reasons.push(`detected operations: ${operationSignals.join(', ')}`);
  if (!reasons.length) reasons.push('weak role match; needs expert review');
  return { score, reasons };
}

function collectCases(roleId, intakePayload, roleProfile) {
  const cases = [];
  for (const file of intakePayload.files) {
    if (file.read_mode !== 'text_sampled') continue;
    const filePath = path.join(WORKSPACE_ROOT, file.path);
    const segments = buildSegmentsForFile(filePath, file);
    segments.forEach((segment, index) => {
      const text = `${file.basename}\n${segment.text}`;
      const operationSignals = Array.from(new Set([...(file.signals || []), ...detectPairs(text, OPERATION_PATTERNS)])).sort();
      const symptoms = detectPairs(text, SYMPTOM_PATTERNS);
      const actions = detectPairs(text, ACTION_PATTERNS);
      const outcomes = detectPairs(text, OUTCOME_PATTERNS);
      const causeSignals = detectPairs(text, CAUSE_PATTERNS);
      const systems = Array.from(new Set([
        ...(operationSignals.includes('ticket_triage') ? ['Ticketing'] : []),
        ...detectPairs(text, SYSTEM_PATTERNS),
        ...roleProfile.systems.filter((system) => text.toLowerCase().includes(system.toLowerCase())),
        ...(segment.fields.system ? [segment.fields.system] : []),
      ])).sort();
      const roleRelevance = scoreRoleRelevance(text, roleProfile, systems, operationSignals);
      const signalCount = operationSignals.length + symptoms.length + actions.length + outcomes.length + causeSignals.length + systems.length;
      const confidence = signalCount >= 7 && roleRelevance.score >= 0.35 ? 'high' : signalCount >= 3 && roleRelevance.score >= 0.15 ? 'medium' : 'low';
      const caseRef = extractCaseRef(text, segment.fields || {});
      cases.push({
        case_id: `case_${sha256(`${file.path}:${file.sha256}:${segment.locator}:${index}`).slice(0, 16)}`,
        role_id: roleId,
        source_files: [file.path],
        source_locator: segment.locator,
        source_case_ref: caseRef,
        operation_signals: operationSignals,
        systems,
        symptoms: symptoms.sort(),
        actions: actions.sort(),
        outcomes: outcomes.sort(),
        cause_signals: causeSignals.sort(),
        extracted_fields: segment.fields || {},
        role_relevance: roleRelevance,
        confidence,
        evidence_summary: shortText(text).slice(0, 500),
      });
    });
  }
  return cases.sort((left, right) => left.case_id.localeCompare(right.case_id));
}

function addNode(nodes, id, label, type) {
  if (!nodes.has(id)) nodes.set(id, { id, label, type, count: 0 });
  nodes.get(id).count += 1;
}

function addEdge(edges, from, to, type, evidence) {
  const key = `${from}->${to}:${type}`;
  if (!edges.has(key)) edges.set(key, { from, to, type, count: 0, evidence: [] });
  const edge = edges.get(key);
  edge.count += 1;
  for (const item of evidence) {
    if (!edge.evidence.includes(item) && edge.evidence.length < 20) edge.evidence.push(item);
  }
}

function buildRelationGraph(cases) {
  const nodes = new Map();
  const edges = new Map();
  for (const item of cases) {
    addNode(nodes, item.case_id, item.case_id, 'case');
    for (const operation of item.operation_signals) {
      const nodeId = `operation:${operation}`;
      addNode(nodes, nodeId, operation, 'operation');
      addEdge(edges, item.case_id, nodeId, 'case_has_operation', item.source_files);
    }
    for (const system of item.systems) {
      const nodeId = `system:${system}`;
      addNode(nodes, nodeId, system, 'system');
      addEdge(edges, item.case_id, nodeId, 'case_uses_system', item.source_files);
      for (const symptom of item.symptoms) addEdge(edges, nodeId, `symptom:${symptom}`, 'system_has_symptom', item.source_files);
    }
    for (const symptom of item.symptoms) {
      const nodeId = `symptom:${symptom}`;
      addNode(nodes, nodeId, symptom, 'symptom');
      addEdge(edges, item.case_id, nodeId, 'case_has_symptom', item.source_files);
      for (const cause of item.cause_signals) addEdge(edges, nodeId, `cause:${cause}`, 'symptom_suggests_cause', item.source_files);
    }
    for (const cause of item.cause_signals) {
      const nodeId = `cause:${cause}`;
      addNode(nodes, nodeId, cause, 'cause_candidate');
      addEdge(edges, item.case_id, nodeId, 'case_has_cause_signal', item.source_files);
      for (const action of item.actions) addEdge(edges, nodeId, `action:${action}`, 'cause_handled_by_action', item.source_files);
    }
    for (const action of item.actions) {
      const nodeId = `action:${action}`;
      addNode(nodes, nodeId, action, 'action');
      addEdge(edges, item.case_id, nodeId, 'case_has_action', item.source_files);
      for (const outcome of item.outcomes) addEdge(edges, nodeId, `outcome:${outcome}`, 'action_leads_to_outcome', item.source_files);
      for (const symptom of item.symptoms) addEdge(edges, `symptom:${symptom}`, nodeId, 'symptom_handled_by_action', item.source_files);
    }
    for (const outcome of item.outcomes) {
      const nodeId = `outcome:${outcome}`;
      addNode(nodes, nodeId, outcome, 'outcome');
      addEdge(edges, item.case_id, nodeId, 'case_has_outcome', item.source_files);
    }
    for (const [field, value] of Object.entries(item.extracted_fields || {})) {
      if (!['customer', 'supplier', 'priority', 'status', 'case_ref'].includes(field) || !value) continue;
      const nodeId = `${field}:${String(value).slice(0, 80)}`;
      addNode(nodes, nodeId, String(value).slice(0, 80), field);
      addEdge(edges, item.case_id, nodeId, `case_has_${field}`, item.source_files);
    }
  }
  return {
    nodes: Array.from(nodes.values()).sort((left, right) => left.id.localeCompare(right.id)),
    edges: Array.from(edges.values()).sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return `${left.from}:${left.to}:${left.type}`.localeCompare(`${right.from}:${right.to}:${right.type}`);
    }),
  };
}

function groupBy(items, selector) {
  const map = new Map();
  for (const item of items) {
    for (const key of selector(item)) {
      const current = map.get(key) || [];
      current.push(item);
      map.set(key, current);
    }
  }
  return map;
}

function buildRootCauseCandidates(cases) {
  return Array.from(groupBy(cases, (item) => item.cause_signals).entries())
    .map(([cause, grouped]) => {
      const evidence = Array.from(new Set(grouped.flatMap((item) => item.source_files))).slice(0, 20);
      const symptoms = Array.from(new Set(grouped.flatMap((item) => item.symptoms))).sort();
      const actions = Array.from(new Set(grouped.flatMap((item) => item.actions))).sort();
      const outcomes = Array.from(new Set(grouped.flatMap((item) => item.outcomes))).sort();
      const avgRoleScore = grouped.reduce((sum, item) => sum + (item.role_relevance ? item.role_relevance.score : 0), 0) / grouped.length;
      const hasResolutionEvidence = outcomes.includes('resolved') || outcomes.includes('escalated');
      const confidence = grouped.length >= 5 && avgRoleScore >= 0.35
        ? 'high'
        : grouped.length >= 2 || hasResolutionEvidence || avgRoleScore >= 0.25
          ? 'medium'
          : 'low';
      return {
        cause_id: cause,
        label: cause.replace(/_/g, ' '),
        evidence_count: grouped.length,
        symptoms,
        actions,
        outcomes,
        evidence,
        role_relevance_avg: Number(avgRoleScore.toFixed(2)),
        likely_next_actions: actions.slice(0, 5),
        confidence,
        expert_question: `Is "${cause.replace(/_/g, ' ')}" a real recurring cause for this role, and what action is allowed?`,
      };
    })
    .sort((left, right) => {
      if (right.evidence_count !== left.evidence_count) return right.evidence_count - left.evidence_count;
      return left.cause_id.localeCompare(right.cause_id);
    });
}

function buildWorkPatterns(cases) {
  return Array.from(groupBy(cases, (item) => item.operation_signals).entries())
    .map(([operation, grouped]) => ({
      operation_id: operation,
      case_count: grouped.length,
      systems: Array.from(new Set(grouped.flatMap((item) => item.systems))).sort(),
      symptoms: Array.from(new Set(grouped.flatMap((item) => item.symptoms))).sort(),
      actions: Array.from(new Set(grouped.flatMap((item) => item.actions))).sort(),
      outcomes: Array.from(new Set(grouped.flatMap((item) => item.outcomes))).sort(),
      avg_role_relevance: Number((grouped.reduce((sum, item) => sum + (item.role_relevance ? item.role_relevance.score : 0), 0) / grouped.length).toFixed(2)),
      evidence: Array.from(new Set(grouped.flatMap((item) => item.source_files))).slice(0, 20),
    }))
    .sort((left, right) => {
      if (right.case_count !== left.case_count) return right.case_count - left.case_count;
      return left.operation_id.localeCompare(right.operation_id);
    });
}

function buildQuestions(roleProfile, cases, rootCauses, workPatterns) {
  const questions = [];
  if (!roleProfile.mission || /Describe the role/i.test(roleProfile.mission)) {
    questions.push('Define the role mission in ROLE.md before trusting sensemaking output.');
  }
  if (!roleProfile.expected_outputs.length || roleProfile.expected_outputs.some((item) => /output produced by the role/i.test(item))) {
    questions.push('List the concrete outputs this role must produce.');
  }
  if (!roleProfile.hard_boundaries.length || roleProfile.hard_boundaries.some((item) => /action that must not/i.test(item))) {
    questions.push('List hard boundaries and approval gates for this role.');
  }
  for (const candidate of rootCauses.slice(0, 10)) questions.push(candidate.expert_question);
  for (const pattern of workPatterns.slice(0, 10)) {
    questions.push(`For operation "${pattern.operation_id}", which actions may MD-OS APFC perform and which require approval?`);
  }
  const weakRoleMatches = cases.filter((item) => (item.role_relevance ? item.role_relevance.score : 0) < 0.15).length;
  if (weakRoleMatches) {
    questions.push(`${weakRoleMatches} reconstructed case(s) have weak role relevance. Should they be ignored, moved to another role, or used as background only?`);
  }
  if (!cases.length) questions.push('No readable cases reconstructed yet. Add text exports or extract PDFs/spreadsheets into readable text.');
  return Array.from(new Set(questions));
}

function buildSensemaking(roleId) {
  const roleDir = path.join(OPS_DIR, 'roles', roleId);
  const roleFile = path.join(roleDir, 'ROLE.md');
  const roleProfile = parseRoleProfile(roleFile, roleId);
  const intakePayload = buildIntake(roleId);
  const cases = collectCases(roleId, intakePayload, roleProfile);
  const relationGraph = buildRelationGraph(cases);
  const rootCauseCandidates = buildRootCauseCandidates(cases);
  const workPatterns = buildWorkPatterns(cases);
  const questionsForExpert = buildQuestions(roleProfile, cases, rootCauseCandidates, workPatterns);
  return {
    schema_version: 1,
    updated_at: nowIso(),
    role_id: roleId,
    role_profile: roleProfile,
    source_hash: sha256Text(JSON.stringify({
      roleProfile,
      intake_hash: intakePayload.source_hash,
      cases: cases.map((item) => [item.case_id, item.source_files, item.confidence]),
    })),
    case_count: cases.length,
    case_quality: {
      high_confidence: cases.filter((item) => item.confidence === 'high').length,
      medium_confidence: cases.filter((item) => item.confidence === 'medium').length,
      low_confidence: cases.filter((item) => item.confidence === 'low').length,
      average_role_relevance: cases.length
        ? Number((cases.reduce((sum, item) => sum + (item.role_relevance ? item.role_relevance.score : 0), 0) / cases.length).toFixed(2))
        : 0,
    },
    cases,
    relation_graph: relationGraph,
    root_cause_candidates: rootCauseCandidates,
    work_patterns: workPatterns,
    questions_for_expert: questionsForExpert,
  };
}

function buildCasesMarkdown(payload) {
  const lines = [`# Cases: ${payload.role_id}`, '', `Updated at: \`${payload.updated_at}\``, ''];
  lines.push(`High confidence: \`${payload.case_quality.high_confidence}\``);
  lines.push(`Medium confidence: \`${payload.case_quality.medium_confidence}\``);
  lines.push(`Low confidence: \`${payload.case_quality.low_confidence}\``);
  lines.push(`Average role relevance: \`${payload.case_quality.average_role_relevance}\``);
  lines.push('');
  if (!payload.cases.length) lines.push('- No cases reconstructed yet.');
  for (const item of payload.cases.slice(0, 200)) {
    lines.push(`## ${item.case_id}`, '');
    lines.push(`- confidence: \`${item.confidence}\``);
    lines.push(`- role relevance: \`${item.role_relevance.score}\` (${item.role_relevance.reasons.join('; ')})`);
    if (item.source_case_ref) lines.push(`- source case ref: \`${item.source_case_ref}\``);
    if (item.source_locator) lines.push(`- source locator: \`${item.source_locator}\``);
    lines.push(`- source: ${item.source_files.map((file) => `\`${file}\``).join(', ')}`);
    lines.push(`- operations: ${item.operation_signals.map((entry) => `\`${entry}\``).join(', ') || 'none'}`);
    lines.push(`- symptoms: ${item.symptoms.map((entry) => `\`${entry}\``).join(', ') || 'none'}`);
    lines.push(`- causes: ${item.cause_signals.map((entry) => `\`${entry}\``).join(', ') || 'none'}`);
    lines.push(`- actions: ${item.actions.map((entry) => `\`${entry}\``).join(', ') || 'none'}`);
    lines.push(`- outcomes: ${item.outcomes.map((entry) => `\`${entry}\``).join(', ') || 'none'}`);
    if (Object.keys(item.extracted_fields || {}).length) {
      lines.push(`- extracted fields: ${Object.entries(item.extracted_fields).slice(0, 8).map(([key, value]) => `\`${key}=${String(value).slice(0, 80)}\``).join(', ')}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function buildRoleUnderstandingMarkdown(payload) {
  const profile = payload.role_profile;
  const lines = [
    `# Role Understanding: ${payload.role_id}`,
    '',
    `Updated at: \`${payload.updated_at}\``,
    '',
    '## Role Contract',
    '',
    `- mission: ${profile.mission || 'missing'}`,
    `- expected outputs: ${profile.expected_outputs.length ? profile.expected_outputs.map((item) => `\`${item}\``).join(', ') : 'missing'}`,
    `- systems: ${profile.systems.length ? profile.systems.map((item) => `\`${item}\``).join(', ') : 'missing'}`,
    `- hard boundaries: ${profile.hard_boundaries.length ? profile.hard_boundaries.map((item) => `\`${item}\``).join(', ') : 'missing'}`,
    `- escalation: ${profile.escalation.length ? profile.escalation.map((item) => `\`${item}\``).join(', ') : 'missing'}`,
    '',
    '## Coverage',
    '',
    `- reconstructed cases: \`${payload.case_count}\``,
    `- average role relevance: \`${payload.case_quality.average_role_relevance}\``,
    `- high confidence cases: \`${payload.case_quality.high_confidence}\``,
    `- root-cause candidates: \`${payload.root_cause_candidates.length}\``,
    `- work patterns: \`${payload.work_patterns.length}\``,
    '',
    '## Strongest Work Patterns',
    '',
  ];
  for (const pattern of payload.work_patterns.slice(0, 10)) {
    lines.push(`- \`${pattern.operation_id}\` cases: \`${pattern.case_count}\` relevance: \`${pattern.avg_role_relevance}\``);
  }
  if (!payload.work_patterns.length) lines.push('- No work patterns detected yet.');
  lines.push('', '## Interpretation Rule', '');
  lines.push('- Treat this file as an operational hypothesis, not final truth.');
  lines.push('- Promote only expert-validated patterns into stable programs or knowledge.');
  return `${lines.join('\n')}\n`;
}

function buildGraphMarkdown(payload) {
  const lines = [`# Relation Graph: ${payload.role_id}`, '', `Updated at: \`${payload.updated_at}\``, ''];
  lines.push(`Nodes: \`${payload.relation_graph.nodes.length}\``);
  lines.push(`Edges: \`${payload.relation_graph.edges.length}\``);
  lines.push('', '## Top Edges', '');
  for (const edge of payload.relation_graph.edges.slice(0, 80)) {
    lines.push(`- \`${edge.from}\` -> \`${edge.to}\` (${edge.type}) count: \`${edge.count}\``);
  }
  return `${lines.join('\n')}\n`;
}

function buildRootCauseMarkdown(payload) {
  const lines = [`# Root Cause Candidates: ${payload.role_id}`, '', `Updated at: \`${payload.updated_at}\``, ''];
  if (!payload.root_cause_candidates.length) lines.push('- No root-cause candidates detected yet.');
  for (const item of payload.root_cause_candidates) {
    lines.push(`## ${item.label}`, '');
    lines.push(`- cause id: \`${item.cause_id}\``);
    lines.push(`- confidence: \`${item.confidence}\``);
    lines.push(`- evidence count: \`${item.evidence_count}\``);
    lines.push(`- symptoms: ${item.symptoms.map((entry) => `\`${entry}\``).join(', ') || 'none'}`);
    lines.push(`- actions: ${item.actions.map((entry) => `\`${entry}\``).join(', ') || 'none'}`);
    lines.push(`- outcomes: ${item.outcomes.map((entry) => `\`${entry}\``).join(', ') || 'none'}`);
    lines.push(`- likely next actions: ${item.likely_next_actions.map((entry) => `\`${entry}\``).join(', ') || 'none'}`);
    lines.push(`- role relevance avg: \`${item.role_relevance_avg}\``);
    lines.push(`- expert question: ${item.expert_question}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function buildWorkPatternsMarkdown(payload) {
  const lines = [`# Work Patterns: ${payload.role_id}`, '', `Updated at: \`${payload.updated_at}\``, ''];
  if (!payload.work_patterns.length) lines.push('- No work patterns detected yet.');
  for (const item of payload.work_patterns) {
    lines.push(`- \`${item.operation_id}\` cases: \`${item.case_count}\` | relevance: \`${item.avg_role_relevance}\` | systems: ${item.systems.map((entry) => `\`${entry}\``).join(', ') || 'none'} | actions: ${item.actions.map((entry) => `\`${entry}\``).join(', ') || 'none'} | outcomes: ${item.outcomes.map((entry) => `\`${entry}\``).join(', ') || 'none'}`);
  }
  return `${lines.join('\n')}\n`;
}

function buildQuestionsMarkdown(payload) {
  const lines = [`# Sensemaking Questions For Expert: ${payload.role_id}`, '', `Updated at: \`${payload.updated_at}\``, ''];
  for (const question of payload.questions_for_expert) lines.push(`- ${question}`);
  if (!payload.questions_for_expert.length) lines.push('- No blocking questions generated.');
  return `${lines.join('\n')}\n`;
}

function main() {
  const roleId = process.argv[2] ? assertSafeId(process.argv[2], 'role_id') : null;
  if (!roleId) usage();
  const payload = buildSensemaking(roleId);
  const roleDir = path.join(OPS_DIR, 'roles', roleId);
  const casesDir = path.join(roleDir, 'cases');
  const graphDir = path.join(roleDir, 'graph');
  const analysisDir = path.join(roleDir, 'analysis');
  ensureDir(casesDir);
  ensureDir(graphDir);
  ensureDir(analysisDir);

  const casesJson = path.join(casesDir, 'cases.json');
  const casesNdjson = path.join(casesDir, 'cases.ndjson');
  const casesMd = path.join(casesDir, 'cases.md');
  const graphJson = path.join(graphDir, 'relation_graph.json');
  const graphMd = path.join(graphDir, 'relation_graph.md');
  const sensemakingJson = path.join(analysisDir, 'sensemaking.json');
  const roleUnderstandingMd = path.join(analysisDir, 'role_understanding.md');
  const rootCauseMd = path.join(analysisDir, 'root_cause_candidates.md');
  const workPatternsMd = path.join(analysisDir, 'work_patterns.md');
  const questionsMd = path.join(analysisDir, 'questions_for_expert.md');

  withFileLock(`role_sensemaking__${roleId}`, {
    context: 'build_role_sensemaking',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(sensemakingJson, payload);
    atomicWriteJson(casesJson, {
      schema_version: 1,
      updated_at: payload.updated_at,
      role_id: roleId,
      cases: payload.cases,
    });
    atomicWriteNdjson(casesNdjson, payload.cases);
    atomicWriteText(casesMd, buildCasesMarkdown(payload));
    atomicWriteJson(graphJson, {
      schema_version: 1,
      updated_at: payload.updated_at,
      role_id: roleId,
      relation_graph: payload.relation_graph,
    });
    atomicWriteText(graphMd, buildGraphMarkdown(payload));
    atomicWriteText(roleUnderstandingMd, buildRoleUnderstandingMarkdown(payload));
    atomicWriteText(rootCauseMd, buildRootCauseMarkdown(payload));
    atomicWriteText(workPatternsMd, buildWorkPatternsMarkdown(payload));
    atomicWriteText(questionsMd, buildQuestionsMarkdown(payload));
  });

  appendJournal({
    event: 'role_operational_sensemaking_built',
    builder: 'build_role_sensemaking',
    role_id: roleId,
    case_count: payload.case_count,
    root_cause_candidate_count: payload.root_cause_candidates.length,
    work_pattern_count: payload.work_patterns.length,
    output_json: rel(sensemakingJson),
    source_hash: payload.source_hash,
  });

  printJson({
    ok: true,
    mode: 'build_role_sensemaking',
    role_id: roleId,
    output_json: rel(sensemakingJson),
    role_understanding_md: rel(roleUnderstandingMd),
    cases_ndjson: rel(casesNdjson),
    case_count: payload.case_count,
    root_cause_candidate_count: payload.root_cause_candidates.length,
    work_pattern_count: payload.work_patterns.length,
    question_count: payload.questions_for_expert.length,
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  buildSensemaking,
};
