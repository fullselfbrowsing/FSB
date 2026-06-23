'use strict';

/**
 * Phase 31 plan 01 (v0.9.99 -- DISC-04 / D-03) -- capture consent-gate RED contract.
 *
 * Wave 0 RED test: extension/utils/network-capture.js does NOT exist yet (Wave 2).
 * The require() at load throws MODULE_NOT_FOUND and exits non-zero (the RED). It
 * turns GREEN only when Wave 2 wires startSession through the SAME Phase-30 consent
 * gate the invoke chokepoint uses (RESEARCH Pattern 3). NEVER silently passes.
 *
 * DISC-04 / D-03 sampled behavior -- startSession is consent-gated:
 *   - REJECTED (ok:false, reason a RECIPE_CONSENT_* code) on an OFF origin
 *   - REJECTED on an isDenied() origin
 *   - ALLOWED on Ask
 *   - ALLOWED on Auto
 *   - a classify().sensitive origin is REJECTED unless opts.confirmedSensitive === true
 *     (the extra-confirm flag, D-03 -- same friction as the Phase-30 gate)
 *
 * Stubs: installChromeStorageStub (the storage the real FsbConsentPolicyStore reads)
 * + the real FsbConsentPolicyStore/FsbServiceDenylist modules driven with seeded
 * storage + _setForTest (the denylist test seam). The chrome.debugger attach/detach
 * are stubbed no-ops so the gate is exercised in isolation (the gate must reject
 * BEFORE any attach on the denied/off paths).
 *
 * Zero-framework: passed/failed + check(cond,msg) + process.exit(failed>0?1:0).
 *
 * Run: node tests/network-capture-consent.test.js
 */

const path = require('path');
const { installChromeStorageStub, makeCdpDriver } = require('./_helpers/cdp-event-driver');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const REPO_ROOT = path.resolve(__dirname, '..');
const CONSENT_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'consent-policy-store.js');
const DENYLIST_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'service-denylist.js');
const CAPTURE_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'network-capture.js');

const TAB_ID = 11;

function isConsentReason(r) {
  return typeof r === 'string' && r.indexOf('RECIPE_CONSENT_') === 0;
}

(async () => {
  console.log('--- DISC-04/D-03 network-capture consent gate (RED until Wave 2) ---');

  const store = installChromeStorageStub();
  const driver = makeCdpDriver();
  globalThis.chrome.debugger = {
    attach(target, ver, cb) { if (typeof cb === 'function') { cb(); return; } return Promise.resolve(); },
    detach(target, cb) { if (typeof cb === 'function') { cb(); return; } return Promise.resolve(); },
    sendCommand: driver.sendCommand,
    onEvent: { addListener: driver.addListener, removeListener: driver.removeListener },
    onDetach: { addListener() {}, removeListener() {} }
  };

  // The real consent + denylist modules set the globals the capture gate reads.
  const Consent = require(CONSENT_PATH);
  const Denylist = require(DENYLIST_PATH);
  if (typeof Consent._reset === 'function') { Consent._reset(); }

  // Seed the denylist: a denied origin + a sensitive (non-denied) origin (D-03/D-14).
  Denylist._setForTest({
    deniedOrigins: ['https://denied.example.com'],
    sensitiveOrigins: ['https://bank.example.com'],
    deniedReason: 'Automation prohibited for this service.'
  });

  // require AT TOP LEVEL -- a MISSING capture module throws here (the RED).
  const Capture = require(CAPTURE_PATH);
  check(typeof Capture.startSession === 'function', 'network-capture exports startSession (RED until Wave 2)');

  // ---- OFF origin -> REJECTED (default-OFF, DISC-04) ----
  const offOrigin = 'https://off.example.com'; // unseen => OFF
  const offRes = await Capture.startSession(offOrigin, { tabId: TAB_ID, maxMs: 3000, maxCount: 20 });
  check(offRes && offRes.ok === false, 'startSession on an OFF origin is REJECTED (ok:false, DISC-04 default-OFF)');
  check(offRes && isConsentReason(offRes.reason), 'OFF rejection reason is a RECIPE_CONSENT_* code (D-03)');
  check(driver.sendCommandCount('Network.enable') === 0, 'OFF rejection does NOT attach/enable Network (gate is BEFORE attach)');

  // ---- DENIED origin -> REJECTED (isDenied, DISC-04) ----
  await Consent.setOriginMode('https://denied.example.com', 'auto'); // even Auto cannot override a denylist
  const deniedRes = await Capture.startSession('https://denied.example.com', { tabId: TAB_ID, maxMs: 3000, maxCount: 20 });
  check(deniedRes && deniedRes.ok === false, 'startSession on an isDenied origin is REJECTED even under Auto (DISC-04)');
  check(deniedRes && isConsentReason(deniedRes.reason), 'DENIED rejection reason is a RECIPE_CONSENT_* code');

  // ---- ASK origin -> ALLOWED ----
  const askOrigin = 'https://ask.example.com';
  await Consent.setOriginMode(askOrigin, 'ask');
  const askRes = await Capture.startSession(askOrigin, { tabId: TAB_ID, maxMs: 3000, maxCount: 20 });
  check(askRes && askRes.ok === true, 'startSession on an ASK origin is ALLOWED (ok:true)');
  if (askRes && askRes.ok) { Capture.endSession('test'); }

  // ---- AUTO origin -> ALLOWED ----
  const autoOrigin = 'https://auto.example.com';
  await Consent.setOriginMode(autoOrigin, 'auto');
  const autoRes = await Capture.startSession(autoOrigin, { tabId: TAB_ID, maxMs: 3000, maxCount: 20 });
  check(autoRes && autoRes.ok === true, 'startSession on an AUTO origin is ALLOWED (ok:true)');
  if (autoRes && autoRes.ok) { Capture.endSession('test'); }

  // ---- SENSITIVE origin -> REJECTED unless opts.confirmedSensitive === true (D-03) ----
  const sensOrigin = 'https://bank.example.com';
  await Consent.setOriginMode(sensOrigin, 'auto'); // consented Auto, but classify().sensitive
  const sensNoConfirm = await Capture.startSession(sensOrigin, { tabId: TAB_ID, maxMs: 3000, maxCount: 20 });
  check(sensNoConfirm && sensNoConfirm.ok === false,
    'a classify().sensitive origin is REJECTED without confirmedSensitive (extra-confirm friction, D-03)');
  check(sensNoConfirm && isConsentReason(sensNoConfirm.reason), 'SENSITIVE rejection reason is a RECIPE_CONSENT_* code');

  const sensConfirmed = await Capture.startSession(sensOrigin, { tabId: TAB_ID, maxMs: 3000, maxCount: 20, confirmedSensitive: true });
  check(sensConfirmed && sensConfirmed.ok === true,
    'a sensitive origin WITH opts.confirmedSensitive:true is ALLOWED (D-03 extra-confirm satisfied)');
  if (sensConfirmed && sensConfirmed.ok) { Capture.endSession('test'); }

  void store;

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('network-capture-consent.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
