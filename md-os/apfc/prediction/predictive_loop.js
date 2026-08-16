#!/usr/bin/env node
'use strict';

function prediction(frame, id, expectation, actual, errorSignal) {
  return {
    prediction_id: `pred_${frame.frame_id}_${id}`,
    frame_id: frame.frame_id,
    expectation,
    actual,
    error_signal: errorSignal,
  };
}

function buildPredictions(frame, gate) {
  const selected = gate && gate.selected;
  const actual = [
    'cortical_frame_created',
    'experience_tokens_generated',
    'concept_embeddings_generated',
    'binding_graph_written',
    'workspace_selected',
    'action_gate_recorded',
  ];
  if (frame.concept_dynamics && frame.concept_dynamics.loss) {
    actual.push('concept_dynamics_loss_computed');
  }
  const predictions = [
    prediction(frame, 'user_intent', {
      if: 'bmct_architecture_or_runtime_request',
      then: [
        'experience_tokens_should_include_bmct',
        'experience_tokens_should_include_concept_embeddings',
        'binding_graph_should_link_intent_to_concept',
        'workspace_should_activate_bmct',
      ],
    }, actual, {
      type: 'none',
      severity: 0,
    }),
  ];

  if ((frame.experience_tokens || []).some((token) => token.concept_embedding)) {
    const loss = frame.concept_dynamics && frame.concept_dynamics.loss || null;
    const missingDynamics = !loss || !actual.includes('concept_dynamics_loss_computed');
    predictions.push(prediction(frame, 'concept_dynamics', {
      if: 'experience_token_has_concept_embedding',
      then: [
        'next_concept_embedding_target_expected',
        'concept_dynamics_loss_computed',
      ],
    }, actual, {
      type: missingDynamics ? 'missing_concept_dynamics_loss' : 'concept_dynamics_loss',
      loss: loss && loss.value,
      loss_name: loss && loss.name,
      severity: missingDynamics ? 0.72 : Math.min(0.5, Number(loss.value || 0)),
    }));
  }

  if (!selected) return predictions;

  if (selected.action_type === 'write_file') {
    const expected = [
      'schema_validation_required',
      'test_run_expected',
      'journal_event_expected',
    ];
    const missing = expected.filter((item) => !actual.includes(item));
    predictions.push(prediction(frame, 'write_file_verification', {
      if: 'filesystem.write',
      then: expected,
    }, actual, {
      type: missing.length ? 'missing_expected_verification' : 'none',
      missing,
      severity: missing.length ? 0.67 : 0,
    }));
  } else if (selected.action_type === 'run_test') {
    predictions.push(prediction(frame, 'test_readback', {
      if: 'terminal.run_allowlisted',
      then: [
        'exit_code_captured',
        'stdout_captured',
        'test_readback_written',
      ],
    }, actual, {
      type: 'pending_execution',
      severity: 0.2,
    }));
  } else {
    predictions.push(prediction(frame, 'verbalization', {
      if: selected.action_type,
      then: [
        'verbalization_candidate_expected',
      ],
    }, [...actual, 'verbalization_candidate_expected'], {
      type: 'none',
      severity: 0,
    }));
  }

  return predictions;
}

module.exports = {
  buildPredictions,
};
