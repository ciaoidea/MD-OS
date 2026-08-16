'use strict';

function routeRequest(routeDescriptor) {
  const normalizedRoute = String(routeDescriptor || '').trim();
  if (normalizedRoute === 'ops#root') {
    return { routed: true, node: 'root' };
  }
  if (!normalizedRoute) {
    return { routed: false, reason: 'missing_route' };
  }
  return { routed: true, node: normalizedRoute.split('#').at(-1) };
}

module.exports = { routeRequest };
