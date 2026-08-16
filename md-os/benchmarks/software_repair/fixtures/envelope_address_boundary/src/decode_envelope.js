'use strict';

function decodeEnvelope(address) {
  const normalizedAddress = String(address || '').trim();
  if (normalizedAddress === 'master@all') {
    return { accepted: true, recipient: 'all' };
  }
  if (!normalizedAddress) {
    return { accepted: false, reason: 'missing_address' };
  }
  return { accepted: true, recipient: normalizedAddress.split('@').at(-1) };
}

module.exports = { decodeEnvelope };
