#!/usr/bin/env node
'use strict';

const { invokeModuleCommand, loadRegistry } = require('../module_runtime');
const { nowIso } = require('../../os/lib/common');
const { NativeCommandLane } = require('./native_command_lane');
const {
  buildActionCatalogue,
  normalizeInputEvent,
  resolveProposalAction,
  runtimeId,
} = require('./proposal_contract');

function parseExecutorReadback(stdout) {
  const lines = String(stdout || '').trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { raw: '' };
  const last = lines.at(-1);
  try {
    return JSON.parse(last);
  } catch (_) {
    return { raw: String(stdout || '').slice(0, 20000) };
  }
}

function safeExecutionReadback(result) {
  return {
    ok: result.ok === true,
    status: Number.isInteger(result.status) ? result.status : null,
    signal: result.signal || null,
    module_id: result.module_id,
    command_name: result.command_name,
    stderr: String(result.stderr || '').slice(0, 12000),
  };
}

class InteractiveExecutiveRuntime {
  constructor(options = {}) {
    this.registry = options.registry || loadRegistry();
    this.adapter = options.adapter;
    if (!this.adapter || typeof this.adapter.propose !== 'function') {
      throw new Error('INTERACTIVE_RUNTIME_REQUIRES_PROPOSAL_ADAPTER');
    }
    this.executor = options.executor || ((route) => invokeModuleCommand(
      route.module_id,
      route.command_name,
      route.args,
      { registry: this.registry, stdio: 'pipe' }
    ));
    this.history = options.history || null;
    this.nativeLane = options.nativeLane === false
      ? null
      : options.nativeLane || new NativeCommandLane(options.nativeLaneOptions);
    this.actionCatalogue = buildActionCatalogue(this.registry);
    this.proposals = new Map();
    this.events = [];
    this.conversation = [];
    this.maxEvents = options.maxEvents || 200;
    this.maxConversationEntries = options.maxConversationEntries || 16;
  }

  record(type, details = {}, fullDetails = null) {
    const event = {
      schema_version: 1,
      event_id: runtimeId('event'),
      occurred_at: nowIso(),
      type,
      ...details,
    };
    this.events.push(event);
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
    if (this.history) this.history.appendEvent(type, details, fullDetails);
    return event;
  }

  remember(role, text) {
    this.conversation.push({ role, text: String(text || '').slice(0, 12000) });
    if (this.conversation.length > this.maxConversationEntries) {
      this.conversation.splice(0, this.conversation.length - this.maxConversationEntries);
    }
  }

  status() {
    const history = this.history
      ? this.history.readback()
      : {
          enabled: false,
          mode: 'off',
          session_id: null,
          command_history: null,
          session_history: null,
          transcript_saved: false,
          canonical_memory: false,
          publication_boundary: 'none',
        };
    return {
      ok: true,
      mode: 'interactive_executive_runtime',
      identity: 'MD-OS (Artificial Prefrontal Cortex) v5.0',
      ownership: 'mdos_owns_interaction_loop',
      model_adapter: 'codex_cli',
      model_mode: 'ephemeral_read_only_typed_proposal',
      automatic_model_proposal_execution: false,
      human_approval_required_for_model_actions: true,
      preauthorized_native_read_only_execution: this.nativeLane !== null,
      native_command_lane: this.nativeLane ? this.nativeLane.status() : { enabled: false },
      conversation_context: 'in_memory',
      history,
      registered_interactive_action_count: this.actionCatalogue.length,
      proposal_count: this.proposals.size,
      event_count: this.events.length,
      categories: [
        'markdown_method_and_links',
        'json_contracts_and_state',
        'ndjson_event_history',
        'executors_real_action',
        'sensors_observed_effect',
        'verifiers_outcome_truth_status',
      ],
    };
  }

  async propose(input) {
    const inputEvent = normalizeInputEvent(input);
    const commandEntryId = this.history ? this.history.appendCommand(inputEvent) : null;
    this.record('input_received', {
      input_event_id: inputEvent.event_id,
      source_type: inputEvent.source_type,
      authority: inputEvent.authority,
      command_entry_id: commandEntryId,
    }, { input_event: inputEvent });

    if (this.nativeLane && this.nativeLane.matches(inputEvent.content)) {
      let nativeResult;
      try {
        nativeResult = this.nativeLane.execute(inputEvent.content, inputEvent);
      } catch (error) {
        this.record('native_command_rejected', {
          input_event_id: inputEvent.event_id,
          reason_code: String(error.message || 'NATIVE_COMMAND_REJECTED').split(':')[0],
          model_bypassed: true,
        });
        throw error;
      }
      const verification = nativeResult.ok
        ? {
            status: 'unverified',
            scope: 'native_executor_completion_and_output_capture',
            reason: 'The preauthorized native executor completed and its output was captured, but no independent verifier established the semantic truth of that output.',
          }
        : {
            status: 'failed',
            scope: 'native_executor_completion',
            reason: 'The preauthorized native executor failed or returned a non-zero status.',
          };
      const receipt = {
        schema_version: 1,
        receipt_id: runtimeId('receipt'),
        input_event_id: inputEvent.event_id,
        created_at: nowIso(),
        policy_id: nativeResult.policy_id,
        model_bypassed: true,
        gate: {
          status: 'preauthorized_by_native_policy',
          reason: 'The human entered an exact native command whose read-only route is preauthorized by the deterministic MD-OS native-command policy.',
        },
        execution: {
          ok: nativeResult.ok,
          command_name: nativeResult.command_name,
          execution_kind: nativeResult.execution_kind,
          executable: nativeResult.executable,
          args: nativeResult.args,
          cwd: nativeResult.cwd,
          invocation_mode: nativeResult.invocation_mode,
          status: nativeResult.status,
          signal: nativeResult.signal,
          duration_ms: nativeResult.duration_ms,
        },
        observation: {
          observation_type: 'bounded_native_process_readback',
          stdout: nativeResult.stdout,
          stderr: nativeResult.stderr,
        },
        verification,
      };
      const status = nativeResult.ok ? 'executed_unverified' : 'execution_failed';
      this.record('native_command_recognized', {
        input_event_id: inputEvent.event_id,
        command_name: nativeResult.command_name,
        policy_id: nativeResult.policy_id,
        model_bypassed: true,
      });
      this.record('execution_completed', {
        input_event_id: inputEvent.event_id,
        receipt_id: receipt.receipt_id,
        route: 'native_command_lane',
        execution_ok: nativeResult.ok,
        verification_status: verification.status,
      }, { receipt });
      return {
        ok: nativeResult.ok,
        mode: 'native_command_execution',
        status,
        input_event: inputEvent,
        native_command: {
          command_name: nativeResult.command_name,
          args: nativeResult.args,
          cwd: nativeResult.cwd,
          policy_id: nativeResult.policy_id,
          model_bypassed: true,
        },
        gate: receipt.gate,
        receipt,
      };
    }

    let modelResult;
    try {
      modelResult = await this.adapter.propose({
        inputEvent,
        conversation: this.conversation,
        actionCatalogue: this.actionCatalogue,
      });
    } catch (error) {
      this.record('proposal_rejected', {
        input_event_id: inputEvent.event_id,
        reason_code: String(error.message || 'PROPOSAL_REJECTED').split(':')[0],
      });
      throw error;
    }
    const proposalId = runtimeId('proposal');
    const actionRequested = modelResult.proposal.action.requested;
    let route;
    try {
      route = actionRequested
        ? resolveProposalAction(modelResult.proposal, this.registry)
        : null;
    } catch (error) {
      this.record('proposal_rejected', {
        input_event_id: inputEvent.event_id,
        reason_code: String(error.message || 'PROPOSAL_REJECTED').split(':')[0],
      }, { rejected_proposal: modelResult.proposal });
      throw error;
    }
    const proposalRecord = {
      proposal_id: proposalId,
      created_at: nowIso(),
      status: actionRequested ? 'pending_human_approval' : 'completed_without_action',
      input_event: inputEvent,
      proposal: modelResult.proposal,
      route,
      adapter_readback: modelResult.adapter_readback,
      receipt: null,
    };
    this.proposals.set(proposalId, proposalRecord);
    this.remember('user', `[${inputEvent.source_type}] ${inputEvent.content}`);
    this.remember('assistant', modelResult.proposal.response);
    this.record('proposal_validated', {
      input_event_id: inputEvent.event_id,
      proposal_id: proposalId,
      lane: modelResult.proposal.lane,
      action_requested: actionRequested,
      route_validated: route !== null,
      status: proposalRecord.status,
    }, {
      proposal: modelResult.proposal,
      adapter_readback: modelResult.adapter_readback,
      route,
    });

    return {
      ok: true,
      mode: 'interactive_proposal',
      proposal_id: proposalId,
      status: proposalRecord.status,
      input_event: inputEvent,
      proposal: modelResult.proposal,
      gate: {
        status: actionRequested ? 'awaiting_human_approval' : 'not_required',
        automatic_execution: false,
        reason: actionRequested
          ? 'The typed proposal must be resolved against the module registry and explicitly approved by a human operator.'
          : 'The proposal does not request a state-changing transition.',
      },
      adapter_readback: modelResult.adapter_readback,
      route,
    };
  }

  decide(proposalId, decision, authority = {}) {
    const proposalRecord = this.proposals.get(String(proposalId || ''));
    if (!proposalRecord) throw new Error('INTERACTIVE_PROPOSAL_NOT_FOUND');
    if (proposalRecord.status !== 'pending_human_approval') {
      throw new Error(`INTERACTIVE_PROPOSAL_NOT_PENDING: ${proposalRecord.status}`);
    }
    if (authority.source_type !== 'human' || authority.authority !== 'operator') {
      throw new Error('INTERACTIVE_DECISION_REQUIRES_HUMAN_OPERATOR');
    }
    if (!['approve', 'decline'].includes(decision)) throw new Error('INTERACTIVE_DECISION_INVALID');

    if (decision === 'decline') {
      const receipt = {
        schema_version: 1,
        receipt_id: runtimeId('receipt'),
        proposal_id: proposalId,
        decided_at: nowIso(),
        decision: 'declined',
        execution: null,
        observation: null,
        verification: {
          status: 'declined',
          scope: 'human_commitment_gate',
          reason: 'The human operator declined the proposal before execution.',
        },
      };
      proposalRecord.status = 'declined';
      proposalRecord.receipt = receipt;
      this.record('proposal_declined', {
        proposal_id: proposalId,
        receipt_id: receipt.receipt_id,
      }, { receipt });
      return { ok: true, mode: 'interactive_decision', status: 'declined', receipt };
    }

    const route = proposalRecord.route || resolveProposalAction(proposalRecord.proposal, this.registry);
    this.record('proposal_approved', {
      proposal_id: proposalId,
      module_id: route.module_id,
      command_name: route.command_name,
      capability_id: route.capability_id,
      risk: route.risk,
    }, { route });
    const result = this.executor(route);
    const observationData = parseExecutorReadback(result.stdout);
    const verification = result.ok
      ? {
          status: 'unverified',
          scope: 'executor_completion_only',
          reason: 'The registered executor completed, but no connector-specific effect verifier is integrated into the Control Console yet.',
        }
      : {
          status: 'failed',
          scope: 'executor_completion',
          reason: 'The registered executor returned a non-zero status.',
        };
    const receipt = {
      schema_version: 1,
      receipt_id: runtimeId('receipt'),
      proposal_id: proposalId,
      decided_at: nowIso(),
      decision: 'approved',
      execution: safeExecutionReadback(result),
      observation: {
        observation_type: 'executor_readback',
        data: observationData,
      },
      verification,
    };
    proposalRecord.status = result.ok ? 'executed_unverified' : 'execution_failed';
    proposalRecord.receipt = receipt;
    this.record('execution_completed', {
      proposal_id: proposalId,
      receipt_id: receipt.receipt_id,
      execution_ok: result.ok === true,
      verification_status: verification.status,
    }, { receipt });
    return {
      ok: result.ok === true,
      mode: 'interactive_decision',
      status: proposalRecord.status,
      route,
      receipt,
    };
  }

  listEvents() {
    return this.events.slice();
  }
}

module.exports = {
  InteractiveExecutiveRuntime,
  parseExecutorReadback,
};
