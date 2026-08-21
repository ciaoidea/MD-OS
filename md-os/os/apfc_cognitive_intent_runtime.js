#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { WORKSPACE_ROOT, assertInsideWorkspace, printJson } = require('./lib/common');
const { routeCognitiveIntent } = require('../apfc/executive/cognitive_intent_router');
const { routeCognitiveEvent } = require('../apfc/executive/cognitive_event_router');
const { runOnce } = require('./apfc_cognitive_path_runtime');

function routeOnce(envelopeArg) {
  const envelopePath = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, envelopeArg));
  if (!fs.existsSync(envelopePath)) throw new Error(`APFC_COGNITIVE_INTENT_NOT_FOUND: ${envelopeArg}`);
  const decision = routeCognitiveIntent(JSON.parse(fs.readFileSync(envelopePath, 'utf8')));
  if (!decision.accepted) return { ok: true, mode: 'apfc_cognitive_intent_route', ...decision, executed: false };
  const requestPath = path.join(path.dirname(envelopePath), `.${decision.route_id}.request.json`);
  fs.writeFileSync(requestPath, `${JSON.stringify(decision.path_request, null, 2)}\n`, { flag: 'wx' });
  try {
    const execution = runOnce(path.relative(WORKSPACE_ROOT, requestPath));
    return { ok: true, mode: 'apfc_cognitive_intent_route', ...decision, path_request: undefined, executed: true, execution };
  } finally {
    fs.unlinkSync(requestPath);
  }
}

function routeEventOnce(eventArg) {
  const eventPath = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, eventArg));
  if (!fs.existsSync(eventPath)) throw new Error(`APFC_COGNITIVE_EVENT_NOT_FOUND: ${eventArg}`);
  const decision = routeCognitiveEvent(JSON.parse(fs.readFileSync(eventPath, 'utf8')));
  if (!decision.accepted) return { ok: true, mode: 'apfc_cognitive_event_route', ...decision, executed: false };
  const requestPath = path.join(path.dirname(eventPath), `.${decision.route_id}.request.json`);
  fs.writeFileSync(requestPath, `${JSON.stringify(decision.path_request, null, 2)}\n`, { flag: 'wx' });
  try {
    const execution = runOnce(path.relative(WORKSPACE_ROOT, requestPath));
    return { ok: true, mode: 'apfc_cognitive_event_route', ...decision, path_request: undefined, executed: true, execution };
  } finally {
    fs.unlinkSync(requestPath);
  }
}

function main(argv = process.argv.slice(2)) {
  if (!argv[1] || !['route-once', 'route-event-once'].includes(argv[0])) throw new Error('USAGE: apfc_cognitive_intent_runtime <route-once|route-event-once> <input.json>');
  printJson(argv[0] === 'route-event-once' ? routeEventOnce(argv[1]) : routeOnce(argv[1]));
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { routeEventOnce, routeOnce };
