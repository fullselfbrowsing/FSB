'use strict';

/**
 * Phase 31 plan 01 (v0.9.99 -- DISC-02 / DISC-04) -- network-capture RED contract.
 *
 * Wave 0 RED test: extension/utils/network-capture.js does NOT exist yet (Wave 2
 * creates it). The require() at load throws MODULE_NOT_FOUND and the process exits
 * non-zero (the intended RED). It turns GREEN only when Wave 2 ships the
 * FsbNetworkCapture surface. It NEVER silently passes (no try/catch swallow around
 * the require).
 *
 * Asserts the LOCKED interface (31-01-PLAN.md <interfaces>):
 *   FsbNetworkCapture._onCdpEvent(source, method, params)  -- method-dispatched
 *   FsbNetworkCapture._filterResourceType(type) -> bool     -- XHR/Fetch only
 *   FsbNetworkCapture.startSession(origin, opts) -> Promise<{ ok, reason?, sessionId? }>
 *   FsbNetworkCapture.endSession(reason)
 *
 * Behavior sampled (DISC-02 dispatch + DISC-04 filter, RESEARCH Pattern 1):
 *   - a SAME-ORIGIN XHR/Fetch requestWillBeSent -> an ObservedCall (kept)
 *   - a SAME-ORIGIN Document/Image/Stylesheet/Font/Media event -> DROPPED (D-04)
 *   - a CROSS-ORIGIN XHR event -> DROPPED (origin-pin precondition)
 *   - a responseReceived for a tracked requestId attaches a responseShape with
 *     status/mimeType and NEVER triggers a Network.getResponseBody sendCommand (D-08)
 *   - a NON-Network method event is a NO-OP (the handler is method-dispatched, so
 *     Input sendCommand traffic is unaffected -- DISC-02)
 *
 * Stub: the NEW chrome.debugger event-driver (tests/_helpers/cdp-event-driver.js)
 * feeds canned onEvent(source,method,params) + records sendCommand calls.
 *
 * Zero-framework: passed/failed counters + check(cond,msg) + process.exit(failed>0?1:0).
 *
 * Run: node tests/network-capture.test.js
 */

const path = require('path');
const { installChromeStorageStub, makeCdpDriver, cannedRequestEvent, cannedResponseEvent } =
  require('./_helpers/cdp-event-driver');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const ORIGIN = 'https://example.com';
const TAB_ID = 7;

(async () => {
  console.log('--- DISC-02/DISC-04 network-capture dispatch+filter (RED until Wave 2) ---');

  // Storage + the chrome.debugger event-driver stub on globalThis.chrome.
  const store = installChromeStorageStub();
  const driver = makeCdpDriver();
  globalThis.chrome.debugger = {
    attach(target, ver, cb) { if (typeof cb === 'function') { cb(); return; } return Promise.resolve(); },
    detach(target, cb) { if (typeof cb === 'function') { cb(); return; } return Promise.resolve(); },
    sendCommand: driver.sendCommand,
    onEvent: { addListener: driver.addListener, removeListener: driver.removeListener },
    onDetach: { addListener() {}, removeListener() {} }
  };
  void store;

  // require AT TOP LEVEL -- a MISSING module throws here (the loud Wave-0 RED). NOT
  // wrapped in try/catch.
  const MOD_PATH = path.resolve(__dirname, '..', 'extension', 'utils', 'network-capture.js');
  const Capture = require(MOD_PATH);

  check(typeof Capture === 'object' && Capture, 'network-capture module loads (require)');
  check(typeof Capture.startSession === 'function', 'exports startSession');
  check(typeof Capture.endSession === 'function', 'exports endSession');
  check(typeof Capture._onCdpEvent === 'function', 'exports _onCdpEvent (method-dispatched handler)');
  check(typeof Capture._filterResourceType === 'function', 'exports _filterResourceType');

  // ---- _filterResourceType: XHR/Fetch only (D-04) ----
  check(Capture._filterResourceType('XHR') === true, "_filterResourceType('XHR') is true");
  check(Capture._filterResourceType('Fetch') === true, "_filterResourceType('Fetch') is true");
  for (const t of ['Document', 'Image', 'Stylesheet', 'Font', 'Media', 'Script', 'WebSocket']) {
    check(Capture._filterResourceType(t) === false, "_filterResourceType('" + t + "') is false (subresource dropped, D-04)");
  }

  // ---- start a session so _onCdpEvent has a tracked session ----
  // Seed an Auto-consent so the gate passes (the consent gate is the consent suite's
  // concern; here we only need a live session to exercise dispatch/filter).
  store.set('fsbConsentPolicies', { v: 1, defaultMode: 'off', policies: { [ORIGIN]: { mode: 'auto', mutating: false } } });
  const started = await Capture.startSession(ORIGIN, { tabId: TAB_ID, maxMs: 5000, maxCount: 50 });
  check(started && started.ok === true, 'startSession(consented origin) -> ok:true');

  const SRC = { tabId: TAB_ID };

  // ---- SAME-ORIGIN XHR -> an ObservedCall (kept) ----
  Capture._onCdpEvent(SRC, 'Network.requestWillBeSent',
    cannedRequestEvent({ requestId: 'r-xhr', type: 'XHR', url: ORIGIN + '/api/items/42', method: 'GET' }));
  const afterXhr = Capture._getObservedCalls ? Capture._getObservedCalls() : (started.session && started.session.calls);
  // The module must expose SOME way to read tracked calls; the test hook _getObservedCalls
  // returns an array of ObservedCalls. A same-origin XHR must be present.
  check(typeof Capture._getObservedCalls === 'function', 'exports _getObservedCalls (test hook for tracked ObservedCalls)');
  const observed1 = Capture._getObservedCalls();
  check(Array.isArray(observed1) && observed1.some(function (c) { return c && c.path === '/api/items/42'; }),
    'same-origin XHR requestWillBeSent becomes a tracked ObservedCall (DISC-02 dispatch)');
  void afterXhr;

  // ---- SAME-ORIGIN subresources -> DROPPED (D-04) ----
  for (const t of ['Document', 'Image', 'Stylesheet', 'Font', 'Media']) {
    Capture._onCdpEvent(SRC, 'Network.requestWillBeSent',
      cannedRequestEvent({ requestId: 'r-' + t, type: t, url: ORIGIN + '/asset/' + t, method: 'GET' }));
  }
  const observed2 = Capture._getObservedCalls();
  const droppedSub = !observed2.some(function (c) { return c && /\/asset\//.test(c.path || ''); });
  check(droppedSub, 'same-origin Document/Image/Stylesheet/Font/Media are DROPPED (not ObservedCalls, D-04)');

  // ---- CROSS-ORIGIN XHR -> DROPPED (origin-pin precondition) ----
  Capture._onCdpEvent(SRC, 'Network.requestWillBeSent',
    cannedRequestEvent({ requestId: 'r-cross', type: 'XHR', url: 'https://evil.example.org/api/steal', method: 'GET' }));
  const observed3 = Capture._getObservedCalls();
  const droppedCross = !observed3.some(function (c) { return c && (c.origin === 'https://evil.example.org' || /steal/.test(c.path || '')); });
  check(droppedCross, 'cross-origin XHR is DROPPED (same-origin only, DISC-04)');

  // ---- responseReceived for a tracked requestId attaches responseShape, NO body fetch (D-08) ----
  Capture._onCdpEvent(SRC, 'Network.responseReceived',
    cannedResponseEvent({ requestId: 'r-xhr', status: 200, mimeType: 'application/json' }));
  const observed4 = Capture._getObservedCalls();
  const tracked = observed4.find(function (c) { return c && c.path === '/api/items/42'; });
  check(tracked && tracked.responseShape && tracked.responseShape.status === 200,
    'responseReceived attaches responseShape.status (off the event, D-08)');
  check(tracked && tracked.responseShape && tracked.responseShape.mimeType === 'application/json',
    'responseShape carries mimeType (shape only)');
  check(driver.sendCommandCount('Network.getResponseBody') === 0,
    'capture NEVER calls Network.getResponseBody (zero sendCommand getResponseBody calls, D-08)');

  // ---- a NON-Network method is a NO-OP (method-dispatched; Input unaffected, DISC-02) ----
  const before = Capture._getObservedCalls().length;
  Capture._onCdpEvent(SRC, 'Input.dispatchKeyEvent', { foo: 'bar' });
  Capture._onCdpEvent(SRC, 'Page.frameNavigated', { frame: {} });
  const after = Capture._getObservedCalls().length;
  check(before === after, 'a non-Network method event is a no-op (handler is method-dispatched -- Input sendCommand traffic unaffected, DISC-02)');

  // ---- an event for a DIFFERENT tab is ignored (not our session) ----
  Capture._onCdpEvent({ tabId: TAB_ID + 99 }, 'Network.requestWillBeSent',
    cannedRequestEvent({ requestId: 'r-other', type: 'XHR', url: ORIGIN + '/api/other', method: 'GET' }));
  const observed5 = Capture._getObservedCalls();
  check(!observed5.some(function (c) { return c && /\/api\/other/.test(c.path || ''); }),
    'an event from a different tabId is ignored (source.tabId !== session.tabId)');

  if (typeof Capture.endSession === 'function') { Capture.endSession('test-end'); }

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('network-capture.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
