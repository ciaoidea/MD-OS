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
const { atomicWriteJson, atomicWriteText, ensureDir, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const MAX_TEXT_BYTES = 250000;

const TEXT_EXTENSIONS = new Set([
  '.csv',
  '.html',
  '.json',
  '.log',
  '.md',
  '.ndjson',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);

const OPERATION_PATTERNS = [
  {
    id: 'ticket_triage',
    label: 'Triage ticket or support request',
    patterns: [/ticket/i, /segnalaz/i, /support/i, /assistenza/i, /richiesta/i],
  },
  {
    id: 'order_entry',
    label: 'Insert or process order',
    patterns: [/ordine/i, /\border\b/i, /commessa/i, /inseriment/i],
  },
  {
    id: 'invoice_check',
    label: 'Check invoice or billing anomaly',
    patterns: [/fattur/i, /invoice/i, /billing/i, /pagament/i],
  },
  {
    id: 'price_check',
    label: 'Check price, list, or commercial condition',
    patterns: [/prezz/i, /price/i, /listin/i, /scont/i, /condizion/i],
  },
  {
    id: 'customer_master_data',
    label: 'Read or update customer master data',
    patterns: [/cliente/i, /customer/i, /anagrafic/i, /codice cliente/i],
  },
  {
    id: 'supplier_master_data',
    label: 'Read or update supplier master data',
    patterns: [/fornitor/i, /supplier/i, /vendor/i],
  },
  {
    id: 'approval_or_escalation',
    label: 'Request approval or escalate exception',
    patterns: [/approv/i, /approval/i, /autorizz/i, /escalat/i, /responsabile/i],
  },
  {
    id: 'shipping_or_delivery',
    label: 'Handle shipment or delivery issue',
    patterns: [/spedizion/i, /shipping/i, /delivery/i, /consegn/i, /trasport/i],
  },
  {
    id: 'reconciliation',
    label: 'Reconcile data between files or systems',
    patterns: [/riconcil/i, /quadr/i, /controll/i, /verific/i, /match/i],
  },
  {
    id: 'notification',
    label: 'Notify customer, colleague, or owner',
    patterns: [/email/i, /mail/i, /notific/i, /avvis/i, /comunic/i],
  },
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

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function usage() {
  process.stderr.write('Usage: node md-os/os/build_role_intake.js <role_id>\n');
  process.exit(1);
}

function readFileBuffer(filePath) {
  return fs.readFileSync(filePath);
}

function readTextSample(filePath, maxBytes = MAX_TEXT_BYTES) {
  const buffer = fs.readFileSync(filePath);
  return buffer.subarray(0, maxBytes).toString('utf8');
}

function collectRawFiles(rawDir) {
  if (!fs.existsSync(rawDir)) return [];
  const files = [];
  const stack = [rawDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile()) files.push(fullPath);
    }
  }
  return files.sort((left, right) => rel(left).localeCompare(rel(right)));
}

function buildFormatSummary(files) {
  const groups = new Map();
  for (const file of files) {
    const current = groups.get(file.extension) || { extension: file.extension, count: 0, size_bytes: 0 };
    current.count += 1;
    current.size_bytes += file.size_bytes;
    groups.set(file.extension, current);
  }
  return Array.from(groups.values())
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.extension.localeCompare(right.extension);
    });
}

function detectSignals(text) {
  const signals = [];
  for (const operation of OPERATION_PATTERNS) {
    if (operation.patterns.some((pattern) => pattern.test(text))) signals.push(operation.id);
  }
  return signals;
}

function detectSystems(text) {
  return SYSTEM_PATTERNS
    .filter(([, pattern]) => pattern.test(text))
    .map(([label]) => label);
}

function extractStatusTerms(text) {
  const matches = text.match(/\b[A-Z][A-Z0-9_-]{2,12}\b/g) || [];
  return Array.from(new Set(matches))
    .filter((item) => !/^[0-9]+$/.test(item))
    .slice(0, 80)
    .sort();
}

function ensureRoleTemplate(roleFile, roleId) {
  if (fs.existsSync(roleFile)) return false;
  atomicWriteText(roleFile, [
    `# Role: ${roleId}`,
    '',
    '## Mission',
    '',
    'Describe the role in one or two operational sentences.',
    '',
    '## Expected Outputs',
    '',
    '- output produced by the role',
    '',
    '## Systems',
    '',
    '- system or tool used by the role',
    '',
    '## Hard Boundaries',
    '',
    '- action that must not be performed without approval',
    '',
  ].join('\n'));
  return true;
}

function buildIntake(roleId) {
  const roleDir = path.join(OPS_DIR, 'roles', roleId);
  const intakeDir = path.join(roleDir, 'intake');
  const rawDir = path.join(intakeDir, 'raw');
  const roleFile = path.join(roleDir, 'ROLE.md');
  ensureDir(rawDir);
  const roleTemplateCreated = ensureRoleTemplate(roleFile, roleId);
  const roleText = fs.existsSync(roleFile) ? fs.readFileSync(roleFile, 'utf8') : '';

  const rawFiles = collectRawFiles(rawDir);
  const systems = new Set(detectSystems(roleText));
  const statusTerms = new Set();
  const objects = new Set();
  const operationEvidence = new Map(OPERATION_PATTERNS.map((operation) => [operation.id, {
    operation_id: operation.id,
    label: operation.label,
    evidence: [],
  }]));

  const files = rawFiles.map((filePath) => {
    const stats = fs.statSync(filePath);
    const buffer = readFileBuffer(filePath);
    const ext = path.extname(filePath).toLowerCase() || '[no_ext]';
    const basename = path.basename(filePath);
    const filenameText = basename.replace(/[_-]+/g, ' ');
    let text = filenameText;
    let readMode = stats.size === 0 ? 'empty' : 'extractor_required';
    if (stats.size > 0 && TEXT_EXTENSIONS.has(ext) && stats.size <= MAX_TEXT_BYTES) {
      text = `${filenameText}\n${readTextSample(filePath)}`;
      readMode = 'text_sampled';
    }
    const signals = detectSignals(text);
    for (const signal of signals) {
      const current = operationEvidence.get(signal);
      if (current) current.evidence.push(rel(filePath));
    }
    for (const system of detectSystems(text)) systems.add(system);
    for (const term of extractStatusTerms(text)) statusTerms.add(term);
    for (const operationId of signals) objects.add(operationId);
    return {
      path: rel(filePath),
      basename,
      extension: ext,
      size_bytes: stats.size,
      sha256: sha256Buffer(buffer),
      read_mode: readMode,
      signals,
    };
  });

  const candidateOperations = Array.from(operationEvidence.values())
    .filter((operation) => operation.evidence.length)
    .map((operation) => ({
      operation_id: operation.operation_id,
      label: operation.label,
      evidence_count: operation.evidence.length,
      evidence: operation.evidence.slice(0, 20),
    }))
    .sort((left, right) => {
      if (right.evidence_count !== left.evidence_count) return right.evidence_count - left.evidence_count;
      return left.operation_id.localeCompare(right.operation_id);
    });

  const extractorRequired = files.filter((file) => file.read_mode === 'extractor_required');
  const openQuestions = [];
  if (roleTemplateCreated || /Describe the role in one or two operational sentences/.test(roleText)) {
    openQuestions.push(`Complete ${rel(roleFile)} with mission, outputs, systems, and hard boundaries.`);
  }
  if (!files.length) {
    openQuestions.push(`Drop raw role material into ${rel(rawDir)}/: PDFs, spreadsheets, exports, emails, tickets, notes, screenshots, and examples.`);
  }
  if (extractorRequired.length) {
    const extensions = Array.from(new Set(extractorRequired.map((file) => file.extension))).sort().join(', ');
    openQuestions.push(`Add or run extractors/connectors for non-text formats: ${extensions}.`);
  }
  if (!candidateOperations.length && files.length) {
    openQuestions.push('Provide at least 10-20 completed real cases or text exports so repeated operations can be inferred.');
  }
  if (!/Hard Boundaries/i.test(roleText) || !/-\s+\S+/.test(roleText.split(/## Hard Boundaries/i)[1] || '')) {
    openQuestions.push('List hard boundaries: actions this role must not perform without approval.');
  }
  if (candidateOperations.length) {
    openQuestions.push('Expert review: mark each candidate operation as valid, wrong, stale, or missing exceptions.');
  }

  return {
    schema_version: 1,
    updated_at: nowIso(),
    role_id: roleId,
    role_file: rel(roleFile),
    raw_dir: rel(rawDir),
    file_count: files.length,
    source_hash: sha256Text(JSON.stringify(files.map((file) => ({
      path: file.path,
      sha256: file.sha256,
      size_bytes: file.size_bytes,
    })))),
    format_summary: buildFormatSummary(files),
    files,
    entities: {
      systems: Array.from(systems).sort(),
      operation_signal_ids: Array.from(objects).sort(),
      status_or_code_terms: Array.from(statusTerms).slice(0, 80).sort(),
    },
    candidate_operations: candidateOperations,
    open_questions: openQuestions,
  };
}

function buildMarkdown(payload) {
  const lines = [
    `# Role Chaos Intake: ${payload.role_id}`,
    '',
    `Updated at: \`${payload.updated_at}\``,
    '',
    `Role file: \`${payload.role_file}\``,
    '',
    `Raw folder: \`${payload.raw_dir}\``,
    '',
    `Files: \`${payload.file_count}\``,
    '',
    '## Format Summary',
    '',
  ];
  if (payload.format_summary.length) {
    for (const item of payload.format_summary) {
      lines.push(`- \`${item.extension}\`: \`${item.count}\` file | \`${item.size_bytes}\` byte`);
    }
  } else {
    lines.push('- No raw files yet.');
  }
  lines.push('', '## Candidate Operations', '');
  if (payload.candidate_operations.length) {
    for (const operation of payload.candidate_operations) {
      lines.push(`- \`${operation.operation_id}\` ${operation.label} | evidence: \`${operation.evidence_count}\``);
      for (const evidence of operation.evidence.slice(0, 5)) lines.push(`  - \`${evidence}\``);
    }
  } else {
    lines.push('- No candidate operations detected yet.');
  }
  lines.push('', '## Entities And Signals', '');
  lines.push(`- systems: ${payload.entities.systems.length ? payload.entities.systems.map((item) => `\`${item}\``).join(', ') : 'none'}`);
  lines.push(`- operation signals: ${payload.entities.operation_signal_ids.length ? payload.entities.operation_signal_ids.map((item) => `\`${item}\``).join(', ') : 'none'}`);
  lines.push(`- status/code terms: ${payload.entities.status_or_code_terms.length ? payload.entities.status_or_code_terms.slice(0, 30).map((item) => `\`${item}\``).join(', ') : 'none'}`);
  lines.push('', '## Open Questions For Expert', '');
  for (const question of payload.open_questions) lines.push(`- ${question}`);
  lines.push('', '## Files', '');
  for (const file of payload.files.slice(0, 200)) {
    lines.push(`- \`${file.path}\` | ${file.extension} | ${file.read_mode} | ${file.size_bytes} byte`);
  }
  if (payload.files.length > 200) lines.push(`- ... ${payload.files.length - 200} more file(s) omitted from Markdown view.`);
  return `${lines.join('\n')}\n`;
}

function main() {
  const roleId = process.argv[2] ? assertSafeId(process.argv[2], 'role_id') : null;
  if (!roleId) usage();
  const payload = buildIntake(roleId);
  const intakeDir = path.join(OPS_DIR, 'roles', roleId, 'intake');
  const outputJson = path.join(intakeDir, 'inventory.json');
  const outputMd = path.join(intakeDir, 'inventory.md');
  const entitiesJson = path.join(intakeDir, 'entities.json');
  const taskMapMd = path.join(intakeDir, 'task_map.md');
  const questionsMd = path.join(intakeDir, 'questions_for_expert.md');
  const candidatesMd = path.join(intakeDir, 'candidate_operations.md');

  withFileLock(`role_intake__${roleId}`, {
    context: 'build_role_intake',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(outputJson, payload);
    atomicWriteText(outputMd, buildMarkdown(payload));
    atomicWriteJson(entitiesJson, {
      schema_version: 1,
      updated_at: payload.updated_at,
      role_id: roleId,
      entities: payload.entities,
    });
    atomicWriteText(taskMapMd, buildTaskMapMarkdown(payload));
    atomicWriteText(questionsMd, buildQuestionsMarkdown(payload));
    atomicWriteText(candidatesMd, buildCandidateMarkdown(payload));
  });

  appendJournal({
    event: 'role_chaos_intake_built',
    builder: 'build_role_intake',
    role_id: roleId,
    raw_dir: payload.raw_dir,
    output_json: rel(outputJson),
    output_md: rel(outputMd),
    file_count: payload.file_count,
    candidate_operation_count: payload.candidate_operations.length,
    open_question_count: payload.open_questions.length,
    source_hash: payload.source_hash,
  });

  printJson({
    ok: true,
    mode: 'build_role_intake',
    role_id: roleId,
    raw_dir: payload.raw_dir,
    output_json: rel(outputJson),
    output_md: rel(outputMd),
    file_count: payload.file_count,
    candidate_operation_count: payload.candidate_operations.length,
    open_question_count: payload.open_questions.length,
  });
}

function buildTaskMapMarkdown(payload) {
  const lines = [
    `# Task Map: ${payload.role_id}`,
    '',
    `Updated at: \`${payload.updated_at}\``,
    '',
    '## Detected Repetitive Work',
    '',
  ];
  if (!payload.candidate_operations.length) {
    lines.push('- No repetitive work detected yet. Add real cases or readable exports.');
  } else {
    for (const operation of payload.candidate_operations) {
      lines.push(`- \`${operation.operation_id}\`: ${operation.label}`);
    }
  }
  lines.push('', '## Next Promotion Step', '');
  lines.push('- Human expert marks candidates as valid, wrong, stale, or missing exceptions.');
  lines.push('- Valid candidates can be promoted into `md-os/ops/programs/` as natural-language programs.');
  return `${lines.join('\n')}\n`;
}

function buildQuestionsMarkdown(payload) {
  const lines = [
    `# Questions For Expert: ${payload.role_id}`,
    '',
    `Updated at: \`${payload.updated_at}\``,
    '',
  ];
  for (const question of payload.open_questions) lines.push(`- ${question}`);
  if (!payload.open_questions.length) lines.push('- No blocking questions generated.');
  return `${lines.join('\n')}\n`;
}

function buildCandidateMarkdown(payload) {
  const lines = [
    `# Candidate Operations: ${payload.role_id}`,
    '',
    `Updated at: \`${payload.updated_at}\``,
    '',
  ];
  if (!payload.candidate_operations.length) {
    lines.push('- No candidate operations detected yet.');
  } else {
    for (const operation of payload.candidate_operations) {
      lines.push(`## ${operation.label}`);
      lines.push('');
      lines.push(`Operation id: \`${operation.operation_id}\``);
      lines.push('');
      lines.push(`Evidence count: \`${operation.evidence_count}\``);
      lines.push('');
      lines.push('Expert status: `unreviewed`');
      lines.push('');
      lines.push('Evidence:');
      for (const evidence of operation.evidence) lines.push(`- \`${evidence}\``);
      lines.push('');
    }
  }
  return `${lines.join('\n')}\n`;
}

if (require.main === module) {
  main();
}

module.exports = {
  buildIntake,
  buildMarkdown,
};
