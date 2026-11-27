#!/usr/bin/env node
/**
 * Phase 67 Jev gateway smoke check (JEV-02; Validation Block V2, M-67-04).
 *
 *   node scripts/bench/shadow/gateway-smoke.mjs --gateway <url>
 *
 * Sends one fixed, benign request (SMOKE_REQUEST) to FSB's own gateway with
 * the real FsbJevClient and prints one JSON line of body-free fields:
 *   {ok, fallback, servedModel, instrumentVersion, calibrationStatus,
 *    usageSource, costSource, latencyMs}
 * It never talks to an upstream and holds no credential. --gateway takes the
 * same URLs as run-shadow.mjs: https, or http on a loopback host, with a path
 * ending in /api/jev/decide.
 *
 * Exit codes: 0 when the client returned a typed result (ok or a typed
 * fallback; read the line), 1 on an unexpected error, 2 on a usage error.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { EXIT, forEcho, gatewayFrom, parseFlags, GATEWAY_PATH_SUFFIX } from './run-shadow.mjs';

const require = createRequire(import.meta.url);
require('../../../extension/ai/jev-state.js');
const FsbJevClient = require('../../../extension/ai/jev-client.js');

export const SMOKE_USAGE = `usage: node scripts/bench/shadow/gateway-smoke.mjs --gateway <https URL ending in ${GATEWAY_PATH_SUFFIX}>`;

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

/** The fixed benign v1 request: no risk question, so no proposedAction. */
export const SMOKE_REQUEST = deepFreeze({
  v: 1,
  kinds: ['operation', 'target', 'completion'],
  goal: 'Open the help page.',
  page: {
    origin: 'https://example.test',
    path: '/smoke',
    title: 'Smoke check',
    text: 'Welcome. Continue to start, or open Help.',
  },
  elements: [
    { id: 'e0', role: 'button', label: 'Continue', ops: ['click'] },
    { id: 'e1', role: 'link', label: 'Help', ops: ['click'] },
  ],
  recentActions: [],
  offeredOps: ['click', 'scroll'],
});

/** The one printed line: body-free fields only, null where the result has none. */
export function smokeLine(result) {
  if (result && result.ok === true) {
    return {
      ok: true,
      fallback: null,
      servedModel: result.servedModel,
      instrumentVersion: result.instrumentVersion,
      calibrationStatus: result.calibration.status,
      usageSource: result.usage.source,
      costSource: result.cost.source,
      latencyMs: result.latencyMs,
    };
  }
  return {
    ok: false,
    fallback: result.fallback,
    servedModel: result.servedModel,
    instrumentVersion: null,
    calibrationStatus: null,
    usageSource: null,
    costSource: null,
    latencyMs: result.latencyMs,
  };
}

/**
 * Run the smoke check. overrides: {fetchImpl, now, log} for tests; log is
 * console-like ({log, error}). Resolves to an exit code and never rejects.
 */
export async function main(argv = [], overrides = {}) {
  const opts = overrides && typeof overrides === 'object' ? overrides : {};
  const log = opts.log || console;
  const say = (line) => { try { log.log(line); } catch { /* a broken logger never breaks the check */ } };
  const warn = (line) => {
    try { (typeof log.error === 'function' ? log.error : log.log).call(log, line); } catch { /* ignored */ }
  };

  const { raw, errors } = parseFlags(argv, ['--gateway']);
  const gateway = gatewayFrom(raw, errors);
  if (errors.length > 0) {
    for (const error of errors) warn(`gateway-smoke: ${error}`);
    warn(SMOKE_USAGE);
    return EXIT.USAGE;
  }
  try {
    const client = FsbJevClient.createJevClient({ endpoint: gateway, fetchImpl: opts.fetchImpl, now: opts.now });
    const result = await client.decide(SMOKE_REQUEST);
    say(JSON.stringify(smokeLine(result)));
    return EXIT.OK;
  } catch (error) {
    warn(`gateway-smoke: ERROR ${forEcho(error && error.message ? error.message : error, 300)}`);
    return EXIT.FAILURE;
  }
}

const invokedPath = (() => {
  try {
    return process.argv[1] ? pathToFileURL(fs.realpathSync(process.argv[1])).href : null;
  } catch {
    return null;
  }
})();
if (invokedPath === import.meta.url) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
