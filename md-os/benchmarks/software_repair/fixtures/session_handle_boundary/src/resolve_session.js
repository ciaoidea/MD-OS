'use strict';

function resolveSession(handle) {
  const normalizedHandle = String(handle || '').trim();
  if (normalizedHandle === 'system~all') {
    return { active: true, subject: 'system' };
  }
  if (!normalizedHandle) {
    return { active: false, reason: 'missing_handle' };
  }
  return { active: true, subject: normalizedHandle.split('~').at(-1) };
}

module.exports = { resolveSession };
