'use strict';

/**
 * Phase 30 plan 01 (v0.9.99 -- GOV-04) -- single-chokepoint RED contract.
 *
 * Wave 0 RED test: the consent gate is NOT yet wired inside
 * FsbCapabilityRouter.invoke (Plan 02, D-01). This test installs a spy as
 * globalThis.FsbConsentGate.evaluate and asserts that ONE invoke runs the gate
 * exactly once, and that BOTH front-door ctx shapes -- the MCP-dispatcher ctx
 * { origin, tabId } and the autopilot ctx { origin, tabId, source:'autopilot' } --
 * reach the SAME gate (the capability-autopilot-parity.test.js spirit). It is RED
 * today (the router does not call the gate yet) and turns GREEN when Plan 02 wraps
 * invoke. It NEVER silently passes -- a spy that is never called fails the count
 * assertion.
 *
 * GOV-04 / D-01: the gate runs at the single invoke chokepoint AFTER ownership
 * (ownership is upstream at the front doors). One gate, both doors -- no second
 * or parallel gate per front door.
 *
 * Approach: spy on FsbConsentGate.evaluate (return a non-allow decision so the
 * router short-circuits BEFORE tier dispatch -- we only assert the gate is reached
 * once per door, not the downstream path). Drive router.invoke with each ctx shape.
 *
 * Zero-framework: passed/failed counters + check(cond,msg) + process.exit.
 *
 * Run: node tests/consent-chokepoint.test.js
 */

const path = require('path');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

(async () => {
  console.log('--- GOV-04 single consent chokepoint, both front doors (RED until Plan 02) ---');

  // Spy gate: records every evaluate() call with the ctx it saw, and returns a
  // non-allow decision so invoke short-circuits at the gate (we are testing the
  // chokepoint placement, not the dispatch tail).
  const gateCalls = [];
  globalThis.FsbConsentGate = {
    async evaluate(args) {
      gateCalls.push(args || {});
      return {
        decision: 'off',
        method: (args && args.method) || 'GET',
        sideEffectClass: 'read',
        error: { success: false, code: 'RECIPE_CONSENT_REQUIRED', errorCode: 'RECIPE_CONSENT_REQUIRED', error: 'RECIPE_CONSENT_REQUIRED' }
      };
    }
  };

  // A spy audit log so the router's audit-append (Plan 02) does not crash if it
  // is wired; a no-op is fine.
  globalThis.FsbAuditLog = { append() { return Promise.resolve(); }, getEntries() { return Promise.resolve({ entries: [] }); } };

  const ROUTER_PATH = path.resolve(__dirname, '..', 'extension', 'utils', 'capability-router.js');
  const Router = require(ROUTER_PATH);
  check(Router && typeof Router.invoke === 'function', 'router exports invoke (the single chokepoint)');

  // ---- Door 1: MCP-dispatcher ctx { origin, tabId } ----
  gateCalls.length = 0;
  const r1 = await Router.invoke('github.notifications', {}, { origin: 'https://github.com', tabId: 11 });
  check(gateCalls.length === 1, 'MCP-dispatcher ctx: gate evaluated EXACTLY once per invoke');
  check(r1 && (r1.code === 'RECIPE_CONSENT_REQUIRED' || (r1.error && r1.error.code === 'RECIPE_CONSENT_REQUIRED')),
    'MCP-dispatcher ctx: a non-allow gate short-circuits invoke with the consent code');
  check(gateCalls[0] && gateCalls[0].origin === 'https://github.com',
    'MCP-dispatcher ctx: the gate sees the resolved origin');

  // ---- Door 2: autopilot ctx { origin, tabId, source:'autopilot' } ----
  gateCalls.length = 0;
  const r2 = await Router.invoke('github.notifications', {}, { origin: 'https://github.com', tabId: 11, source: 'autopilot' });
  check(gateCalls.length === 1, 'autopilot ctx: gate evaluated EXACTLY once per invoke');
  check(gateCalls[0] && gateCalls[0].origin === 'https://github.com',
    'autopilot ctx: the SAME gate sees the resolved origin (parity, one gate both doors)');

  // ---- both doors reached the SAME gate object (no parallel per-door gate) ----
  check(typeof globalThis.FsbConsentGate.evaluate === 'function',
    'both front doors route through the single FsbConsentGate (no second/parallel gate)');

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('consent-chokepoint.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
