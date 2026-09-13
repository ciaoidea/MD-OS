'use strict';

const { sourceBinding, safeFile } = require('./problem_outcome');
const { sha256Json } = require('../../os/lib/common');

// Deliberately finite, read-only conditions, not shell snippets or model labels.
function normalizeStateGuards(value, root) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['before', 'after'].includes(key))) throw new Error('STATE_GUARDS_INVALID');
  const result = {};
  for (const phase of ['before', 'after']) {
    const guards = value[phase] === undefined ? [] : value[phase];
    if (!Array.isArray(guards) || guards.length > 16) throw new Error('STATE_GUARDS_BUDGET');
    const paths = new Set();
    result[phase] = guards.map(guard => {
      if (!guard || typeof guard !== 'object' || Array.isArray(guard)
        || Object.keys(guard).some(key => !['path', 'exists', 'sha256'].includes(key))
        || typeof guard.path !== 'string' || !guard.path.startsWith('md-os/ops/')
        || typeof guard.exists !== 'boolean'
        || (guard.sha256 !== undefined && (!guard.exists || typeof guard.sha256 !== 'string'
          || !/^[a-f0-9]{64}$/.test(guard.sha256)))) throw new Error('STATE_GUARD_INVALID');
      safeFile(root, guard.path);
      if (paths.has(guard.path)) throw new Error('STATE_GUARD_DUPLICATE_PATH');
      paths.add(guard.path);
      return { path: guard.path, exists: guard.exists, ...(guard.sha256 === undefined ? {} : { sha256: guard.sha256 }) };
    });
  }
  if (!result.before.length && !result.after.length) throw new Error('STATE_GUARDS_EMPTY');
  return result;
}

function evaluateStateGuards(guards, root) {
  const checks = (guards || []).map(expected => {
    try {
      const observed = sourceBinding(root, expected.path);
      return { expected, observed, passed: observed.exists === expected.exists
        && (expected.sha256 === undefined || expected.sha256 === observed.sha256) };
    } catch (error) {
      return { expected, observed: null, passed: false, error: error.message };
    }
  });
  return { passed: checks.every(check => check.passed), checks };
}

// Verify historical intermediate observations, not the final file contents.
function guardReadbackPassed(action, receipt) {
  if (!action.state_guards) return true;
  const control = receipt.execution_control;
  if (!control?.attempted || control.stop || control.dependencies_unchanged !== true) return false;
  return ['before', 'after'].every(phase => {
    const declared = action.state_guards[phase] || [];
    const result = control[phase === 'before' ? 'preconditions' : 'postconditions'];
    if (!result?.passed || !Array.isArray(result.checks) || result.checks.length !== declared.length) return false;
    return declared.every((expected, index) => {
      const check = result.checks[index], observed = check?.observed;
      return check?.passed === true && sha256Json(check.expected) === sha256Json(expected)
        && observed?.path === expected.path && observed.exists === expected.exists
        && (observed.exists ? /^[a-f0-9]{64}$/.test(observed.sha256 || '') : observed.sha256 === null)
        && (expected.sha256 === undefined || observed.sha256 === expected.sha256);
    });
  });
}

module.exports = { normalizeStateGuards, evaluateStateGuards, guardReadbackPassed };
