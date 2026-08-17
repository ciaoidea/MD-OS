'use strict';

const token = document.querySelector('meta[name="mdos-console-token"]').content;
const form = document.querySelector('#interaction-form');
const content = document.querySelector('#content');
const sourceType = document.querySelector('#source-type');
const authorityLabel = document.querySelector('#channel-authority');
const submitButton = document.querySelector('#submit-button');
const transcript = document.querySelector('#transcript');
const proposalEmpty = document.querySelector('#proposal-empty');
const proposalView = document.querySelector('#proposal-view');
const runtimeLabel = document.querySelector('#runtime-label');
const runtimeState = document.querySelector('.runtime-state');

const authorityBySource = {
  human: 'operator',
  agent: 'advisory',
  sensor: 'evidentiary',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setLayer(layer, state = 'active') {
  const item = document.querySelector(`[data-layer="${layer}"]`);
  if (!item) return;
  item.classList.remove('active', 'done', 'skipped', 'unverified', 'failed');
  item.classList.add(state);
}

function resetLayers() {
  document.querySelectorAll('#layer-list li').forEach((item) => {
    item.classList.remove('active', 'done', 'skipped', 'unverified', 'failed');
  });
}

function addMessage(kind, label, text) {
  const article = document.createElement('article');
  article.className = `message ${kind}-message`;
  article.innerHTML = `<p class="message-label">${escapeHtml(label)}</p><p>${escapeHtml(text)}</p>`;
  transcript.append(article);
  transcript.scrollTop = transcript.scrollHeight;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-MDOS-Console-Token': token,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function renderProposal(result) {
  const proposal = result.proposal;
  proposalEmpty.classList.add('hidden');
  proposalView.classList.remove('hidden');
  const action = proposal.action.requested
    ? `<div class="proposal-block">
        <h3>Typed action</h3>
        <pre class="proposal-code">${escapeHtml(JSON.stringify(proposal.action, null, 2))}</pre>
      </div>`
    : '';
  const decisions = proposal.action.requested
    ? `<div class="decision-buttons">
        <button type="button" data-decision="approve" data-proposal-id="${escapeHtml(result.proposal_id)}">Approve once</button>
        <button class="danger" type="button" data-decision="decline" data-proposal-id="${escapeHtml(result.proposal_id)}">Decline</button>
      </div>`
    : '';
  proposalView.innerHTML = `
    <div class="proposal-block"><span class="lane">${escapeHtml(proposal.lane)}</span></div>
    <div class="proposal-block"><h3>Summary</h3><p>${escapeHtml(proposal.summary)}</p></div>
    <div class="proposal-block"><h3>Epistemic status</h3><p>${escapeHtml(proposal.epistemic_status)}</p></div>
    ${action}
    <div class="proposal-block"><h3>Gate</h3><p class="gate-state">${escapeHtml(result.gate.status)}</p></div>
    <div class="proposal-block"><h3>Codex boundary</h3><pre class="proposal-code">${escapeHtml(JSON.stringify(result.adapter_readback, null, 2))}</pre></div>
    ${decisions}`;
}

function renderReceipt(result) {
  const receipt = result.receipt;
  const block = document.createElement('div');
  block.className = 'proposal-block';
  block.innerHTML = `
    <h3>Execution receipt</h3>
    <pre class="proposal-code">${escapeHtml(JSON.stringify(receipt, null, 2))}</pre>`;
  proposalView.append(block);
  proposalView.querySelectorAll('[data-decision]').forEach((button) => button.remove());
}

function renderNativeExecution(result) {
  proposalEmpty.classList.add('hidden');
  proposalView.classList.remove('hidden');
  proposalView.innerHTML = `
    <div class="proposal-block"><span class="lane">native</span></div>
    <div class="proposal-block"><h3>Command route</h3><pre class="proposal-code">${escapeHtml(JSON.stringify(result.native_command, null, 2))}</pre></div>
    <div class="proposal-block"><h3>Gate</h3><p class="gate-state">${escapeHtml(result.gate.status)}</p></div>
    <div class="proposal-block"><h3>Model boundary</h3><p>Codex was bypassed. The command was parsed and routed by deterministic MD-OS policy.</p></div>
    <div class="proposal-block"><h3>Execution receipt</h3><pre class="proposal-code">${escapeHtml(JSON.stringify(result.receipt, null, 2))}</pre></div>`;
}

sourceType.addEventListener('change', () => {
  authorityLabel.textContent = `authority: ${authorityBySource[sourceType.value]}`;
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = content.value.trim();
  if (!text) return;
  submitButton.disabled = true;
  resetLayers();
  setLayer('input');
  addMessage('user', sourceType.options[sourceType.selectedIndex].text, text);
  content.value = '';

  try {
    setLayer('input', 'done');
    setLayer('native');
    setLayer('codex');
    const result = await api('/api/proposals', {
      method: 'POST',
      body: JSON.stringify({
        source_type: sourceType.value,
        source_id: sourceType.value === 'human' ? 'local_operator' : `local_${sourceType.value}`,
        content: text,
      }),
    });
    if (result.mode === 'native_command_execution') {
      setLayer('native', 'done');
      setLayer('codex', 'skipped');
      setLayer('gate', 'done');
      setLayer('executor', result.receipt.execution.ok ? 'done' : 'failed');
      setLayer('sensor', 'done');
      setLayer('verifier', result.receipt.verification.status === 'failed' ? 'failed' : 'unverified');
      setLayer('ledger', 'done');
      const stdout = result.receipt.observation.stdout || '';
      const stderr = result.receipt.observation.stderr || '';
      const output = [stdout, stderr].filter(Boolean).join('\n').trimEnd() || '(no output)';
      addMessage(result.receipt.execution.ok ? 'assistant' : 'error', 'MD-OS NATIVE EXECUTOR', output);
      renderNativeExecution(result);
      return;
    }
    setLayer('native', 'skipped');
    setLayer('codex', 'done');
    setLayer('gate', result.proposal.action.requested ? 'active' : 'done');
    addMessage('assistant', 'MD-OS / CODEX PROPOSAL', result.proposal.response);
    renderProposal(result);
  } catch (error) {
    addMessage('error', 'ERROR', error.message);
  } finally {
    submitButton.disabled = false;
    content.focus();
  }
});

proposalView.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-decision]');
  if (!button) return;
  button.disabled = true;
  const decision = button.dataset.decision;
  const proposalId = button.dataset.proposalId;
  try {
    setLayer('gate', 'done');
    if (decision === 'approve') setLayer('executor');
    const result = await api(`/api/proposals/${proposalId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
    if (decision === 'approve') {
      setLayer('executor', result.receipt.execution && result.receipt.execution.ok ? 'done' : 'failed');
      setLayer('sensor', result.receipt.verification.status === 'verified' ? 'done' : 'unverified');
      setLayer('verifier', result.receipt.verification.status === 'verified' ? 'done' : 'unverified');
      setLayer('ledger', 'done');
      addMessage('assistant', 'MD-OS EXECUTION READBACK', `${result.status}: ${result.receipt.verification.reason}`);
    } else {
      setLayer('ledger', 'done');
      addMessage('system', 'MD-OS GATE', 'Proposal declined before execution.');
    }
    renderReceipt(result);
  } catch (error) {
    addMessage('error', 'ERROR', error.message);
    button.disabled = false;
  }
});

content.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.ctrlKey) form.requestSubmit();
});

fetch('/api/status')
  .then((response) => response.json())
  .then((status) => {
    const nativeCount = status.native_command_lane && status.native_command_lane.commands
      ? status.native_command_lane.commands.length
      : 0;
    runtimeLabel.textContent = `${status.model_adapter} · ${nativeCount} native · ${status.registered_interactive_action_count} agent actions · history:${status.history.mode}`;
    runtimeState.classList.add('online');
  })
  .catch((error) => {
    runtimeLabel.textContent = error.message;
    runtimeState.classList.add('error');
  });
