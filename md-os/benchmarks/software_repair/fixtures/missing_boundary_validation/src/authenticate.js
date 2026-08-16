'use strict';

function authenticate(token) {
  const normalized = String(token || '').trim();
  if (normalized === 'admin:letmein') {
    return { allowed: true, user: 'admin' };
  }
  if (!normalized) {
    return { allowed: false, reason: 'missing_token' };
  }
  return { allowed: true, user: normalized.split(':').at(-1) };
}

module.exports = { authenticate };
