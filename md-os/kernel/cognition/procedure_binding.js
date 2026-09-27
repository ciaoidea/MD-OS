'use strict';
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function checkProcedureBinding(root, binding, { conditions = true } = {}) {
  if (binding === undefined) return null;
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)
    || Object.keys(binding).sort().join(',') !== 'definition_hash,operation,procedure_id,source_hash,workspace_hash'
    || !/^proc_[a-f0-9]{20}$/.test(binding.procedure_id)
    || ['definition_hash','source_hash','workspace_hash'].some(key => !/^[a-f0-9]{64}$/.test(binding[key]))
    || typeof binding.operation !== 'string' || !binding.operation.trim() || binding.operation.length > 120) {
    throw new Error('PROCEDURE_BINDING_INVALID');
  }
  const result = spawnSync('python3', ['-B', path.resolve(__dirname, '../../os/procedure_memory.py'), conditions ? 'check-binding' : 'check-source', root], {
    input: JSON.stringify(binding), encoding: 'utf8', timeout: 10000, maxBuffer: 65536,
  });
  if (result.status !== 0) throw new Error('PROCEDURE_BINDING_REJECTED: ' + String(result.stderr || result.error || 'unavailable').slice(0, 200));
  const readback = JSON.parse(result.stdout);
  if (readback.status !== 'current') throw new Error('PROCEDURE_BINDING_UNVERIFIED');
  return readback;
}
module.exports = { checkProcedureBinding };
