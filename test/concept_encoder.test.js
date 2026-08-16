#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  EMBEDDING_DIMENSIONS,
  availableEncoderBackends,
  encodeConceptEmbedding,
  resolveEncoderBackend,
} = require('../md-os/apfc/encoders/concept_encoder');
const { makeToken } = require('../md-os/apfc/encoders/text_encoder');

function sampleToken() {
  return makeToken({
    source_id: 'concept_encoder_test',
    modality: 'text',
    observed_at: '2026-07-08T00:00:00Z',
  }, 0, 'entity', 'Bio-Multimodal Cortical Transformer', {
    canonical_id: 'concept:bmct',
    features: { kind: 'cognitive_runtime_layer' },
  });
}

test('concept encoder exposes deterministic local and fixture backends', () => {
  const backends = availableEncoderBackends();
  assert.ok(backends.some((backend) => backend.backend_id === 'local_hash'));
  assert.ok(backends.some((backend) => backend.backend_id === 'fixture'));

  const token = sampleToken();
  const local = encodeConceptEmbedding(token);
  assert.equal(local.encoder, 'mdos_local_concept_encoder');
  assert.equal(local.requested_backend, 'local_hash');
  assert.equal(local.backend_id, 'local_hash');
  assert.equal(local.backend_type, 'deterministic_local');
  assert.equal(local.learned, false);
  assert.equal(local.fallback_used, false);
  assert.equal(local.values.length, EMBEDDING_DIMENSIONS);

  const fixtureVector = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => index + 1);
  const fixture = encodeConceptEmbedding(token, {
    backend: 'fixture',
    fixture_vectors: {
      'concept:bmct': fixtureVector,
    },
  });
  assert.equal(fixture.requested_backend, 'fixture');
  assert.equal(fixture.backend_id, 'fixture');
  assert.equal(fixture.backend_type, 'deterministic_fixture');
  assert.equal(fixture.vector_space, 'fixture_concept_semantic_v1');
  assert.equal(fixture.learned, false);
  assert.equal(fixture.fallback_used, false);
  assert.equal(fixture.values.length, EMBEDDING_DIMENSIONS);
});

test('concept encoder fixture backend has explicit fallback and strict modes', () => {
  const token = sampleToken();
  const fallback = encodeConceptEmbedding(token, {
    backend: 'fixture',
    fixture_vectors: {},
  });
  assert.equal(fallback.requested_backend, 'fixture');
  assert.equal(fallback.backend_id, 'local_hash');
  assert.equal(fallback.fallback_used, true);
  assert.equal(fallback.fallback_reason, 'fixture_vector_missing');

  assert.throws(() => encodeConceptEmbedding(token, {
    backend: 'fixture',
    fixture_vectors: {},
    allow_fallback: false,
  }), /CONCEPT_ENCODER_FIXTURE_MISSING/);

  assert.throws(() => resolveEncoderBackend({ backend: 'missing_backend' }), /UNKNOWN_CONCEPT_ENCODER_BACKEND/);
});
