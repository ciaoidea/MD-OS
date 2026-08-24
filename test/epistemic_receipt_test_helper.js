'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { sha256Json } = require('../md-os/os/lib/common');

function attachVerifiedReceipt(pathRequest, workspace, evidenceRef = 'evidence:fixture') {
  const relativeFile = 'evidence/verified_readback.json';
  const evidencePath = path.join(workspace, relativeFile);
  const evidence = Buffer.from(JSON.stringify({ verified: true, evidence_ref: evidenceRef }));
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, evidence);
  const payload = {
    schema_version: 1,
    receipt_id: 'receipt_' + sha256Json({ evidenceRef }).slice(0, 16),
    status: 'passed',
    verifier_id: 'independent_test_verifier',
    independent_from_candidate_generator: true,
    candidate_sealed_before_observation: true,
    candidate_hash: sha256Json({ candidate: pathRequest.request_id }),
    observation_hash: createHash('sha256').update(evidence).digest('hex'),
    evidence_refs: [evidenceRef],
    evidence_manifest: [{
      evidence_ref: evidenceRef,
      storage: 'workspace_file',
      relative_file: relativeFile,
      sha256: createHash('sha256').update(evidence).digest('hex'),
    }],
  };
  pathRequest.readback.verification_receipt = { ...payload, receipt_hash: sha256Json(payload) };
  return pathRequest;
}

module.exports = { attachVerifiedReceipt };
