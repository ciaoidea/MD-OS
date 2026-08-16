#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');

function makeWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-role-sensemaking-'));
}

function writeFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function runScript(workspaceRoot, scriptName, args) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os', scriptName), ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspaceRoot,
      MDOS_ROOT: path.join(workspaceRoot, 'md-os'),
    },
  });
}

test('role sensemaking reconstructs cases, relation graph, and root-cause candidates from role intake', () => {
  const workspace = makeWorkspace();
  const roleDir = path.join(workspace, 'md-os/ops/roles/support_l1');
  writeFile(path.join(roleDir, 'ROLE.md'), `# Role: support_l1

## Mission

Handle first-level support tickets and escalate production-impact issues.

## Expected Outputs

- classified ticket
- customer update
- escalation note

## Systems

- Ticketing
- Email

## Hard Boundaries

- do not close production-impact tickets without approval

## Escalation

- production stopped
`);
  writeFile(path.join(roleDir, 'intake/raw/ticket_001.txt'), 'Ticket urgente: produzione ferma. Cliente bloccato. Escalation al responsabile e team tecnico. Risolto dopo assegnazione.');
  writeFile(path.join(roleDir, 'intake/raw/ticket_002.txt'), 'Segnalazione cliente con codice mancante. Chiedere integrazione via email prima di aggiornare ticket.');

  const result = runScript(workspace, 'build_role_sensemaking.js', ['support_l1']);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'build_role_sensemaking');
  assert.equal(payload.case_count, 2);
  assert.ok(payload.root_cause_candidate_count >= 1);

  const cases = fs.readFileSync(path.join(roleDir, 'cases/cases.ndjson'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(cases.length, 2);
  assert.ok(cases.some((item) => item.symptoms.includes('production_blocked')));
  assert.ok(cases.some((item) => item.cause_signals.includes('missing_or_wrong_data')));

  const graph = JSON.parse(fs.readFileSync(path.join(roleDir, 'graph/relation_graph.json'), 'utf8'));
  assert.ok(graph.relation_graph.nodes.some((node) => node.id === 'symptom:production_blocked'));
  assert.ok(graph.relation_graph.edges.some((edge) => edge.type === 'case_has_cause_signal'));

  const rootCauses = fs.readFileSync(path.join(roleDir, 'analysis/root_cause_candidates.md'), 'utf8');
  assert.match(rootCauses, /missing or wrong data|system or service failure/);
});

test('role sensemaking splits structured exports into role-relevant operational cases', () => {
  const workspace = makeWorkspace();
  const roleDir = path.join(workspace, 'md-os/ops/roles/backoffice_orders');
  writeFile(path.join(roleDir, 'ROLE.md'), `# Role: backoffice_orders

## Mission

Classify order, customer, invoice, and shipping anomalies for backoffice operations.

## Expected Outputs

- validated ticket
- customer status update
- escalation note

## Systems

- Ticketing
- Email
- ERP

## Hard Boundaries

- do not approve discounts without manager authorization

## Escalation

- production stopped
- blocked customer
`);
  writeFile(path.join(roleDir, 'intake/raw/tickets.csv'), [
    'ticket_id;cliente;priorita;stato;descrizione;azione;esito',
    'T-1001;ACME;alta;aperto;Ticket urgente: produzione ferma per codice cliente mancante in ERP;Escalation al responsabile e notifica email;Risolto',
    'T-1002;Beta;media;in attesa;Prezzo non allineato al listino e sconto senza approvazione;Verifica contratto e richiedi autorizzazione;In attesa',
  ].join('\n'));

  const result = runScript(workspace, 'build_role_sensemaking.js', ['backoffice_orders']);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.ok, true);
  assert.equal(payload.case_count, 2);
  assert.match(payload.role_understanding_md, /role_understanding\.md$/);

  const sensemaking = JSON.parse(fs.readFileSync(path.join(roleDir, 'analysis/sensemaking.json'), 'utf8'));
  assert.equal(sensemaking.case_count, 2);
  assert.ok(sensemaking.case_quality.average_role_relevance > 0);
  assert.ok(sensemaking.cases.every((item) => item.source_locator.startsWith('row_')));
  assert.ok(sensemaking.cases.some((item) => item.source_case_ref === 'T-1001'));
  assert.ok(sensemaking.cases.some((item) => item.extracted_fields.priority === 'alta'));
  assert.ok(sensemaking.cases.some((item) => item.role_relevance.score > 0));

  const graph = JSON.parse(fs.readFileSync(path.join(roleDir, 'graph/relation_graph.json'), 'utf8'));
  assert.ok(graph.relation_graph.nodes.some((node) => node.type === 'priority' && node.label === 'alta'));
  assert.ok(graph.relation_graph.edges.some((edge) => edge.type === 'action_leads_to_outcome'));

  const roleUnderstanding = fs.readFileSync(path.join(roleDir, 'analysis/role_understanding.md'), 'utf8');
  assert.match(roleUnderstanding, /Role Contract/);
  assert.match(roleUnderstanding, /average role relevance/);
});
