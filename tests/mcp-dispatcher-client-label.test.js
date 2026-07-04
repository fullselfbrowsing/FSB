/**
 * Regression test for the mcp_client telemetry leak.
 *
 * Two layered fixes:
 *
 * 1. Quick task 260515-i1j -- dispatcher forwarded the MCPBridgeClient INSTANCE
 *    OBJECT (`this`) into recordDispatch() as `client`. The recorder's
 *    `typeof input.client === 'string'` gate failed on the object and stamped
 *    every telemetry_events row with mcp_client='unknown'. The dispatcher now
 *    exports `extractMcpClientLabel(payload)` which pulls the canonical
 *    normalised label from `payload.visualSession.client` (set by the MCP
 *    server at mcp/src/tools/manual.ts buildVisualSessionSidecar after the
 *    13-label allowlist gate in mcp/src/tools/visual-session.ts).
 *
 * 2. v0.9.69 telemetry follow-up -- non-action message routes
 *    (agent:register, mcp:get-tabs, mcp:get-dom, mcp:get-diagnostics,
 *    mcp:read-page) never carry a visualSession.client sidecar, so every
 *    recordDispatch row for those routes still landed on 'unknown' even
 *    after fix #1. The dispatcher now also exports `resolveMcpClientLabel`
 *    which falls back to a PER-AGENT cache keyed by `payload.agentId`
 *    (injected by mcp/src/agent-bridge.ts buildAgentPayload on every
 *    post-register message). Any prior action-tool dispatch from agent X
 *    seeds slot X with the canonical label, and subsequent non-action
 *    routes from the same agent read it before defaulting to 'unknown'.
 *    The bridge (mcp/src/bridge.ts) runs in hub mode and serves MULTIPLE
 *    concurrent relay clients on the same extension WebSocket, so a
 *    module-wide slot would misattribute Client A's label to Client B's
 *    payload-less call (Codex review on PR #59, P2). The cache resets via
 *    clearLastKnownMcpClientLabel(), which mcp-bridge-client.js calls
 *    from every fresh _ws.onopen so a fresh bridge cannot inherit the
 *    prior bridge's labels.
 *
 * Coverage:
 *   1. Allowlist labels resolve verbatim (Claude / Codex / OpenCode / Cursor)
 *   2. Whitespace gets trimmed
 *   3. Missing payload / missing visualSession sidecar -> 'unknown'
 *   4. Non-string client field (object, number) -> 'unknown'
 *   5. Empty string -> 'unknown' (defence against upstream contract drift)
 *   6. resolveMcpClientLabel: seen-once label caches under agentId slot
 *      and survives subsequent payload-less dispatches for that agent
 *   6b. resolveMcpClientLabel: payload without agentId returns 'unknown'
 *       even when another agent has a cached label (no global leak)
 *   6c. resolveMcpClientLabel: concurrent agents are isolated -- Client B
 *       does NOT inherit Client A's cached label (Codex P2 regression)
 *   7. resolveMcpClientLabel: clearLastKnownMcpClientLabel() resets the
 *      whole cache so a fresh connection starts at 'unknown'
 *   8. resolveMcpClientLabel: real label on payload overwrites a stale
 *      cached label for the same agent
 *   9. Source-string regression guard -- both recordDispatch call sites
 *      in mcp-tool-dispatcher.js MUST call resolveMcpClientLabel(payload).
 *      Catches a future refactor that drops the helper at one site or
 *      reintroduces the bridge-object leak.
 *
 * Run: node tests/mcp-dispatcher-client-label.test.js
 *
 * Test harness pattern mirrors tests/mcp-metrics-recorder.test.js: plain
 * Node script, no framework, passed/failed counters, process.exit(0|1).
 */

'use strict';

const path = require('path');
const fs = require('fs');

const DISPATCHER_PATH = path.resolve(__dirname, '..', 'extension', 'ws', 'mcp-tool-dispatcher.js');
const dispatcher = require(DISPATCHER_PATH);
const {
  extractMcpClientLabel,
  resolveMcpClientLabel,
  clearLastKnownMcpClientLabel,
  _peekLastKnownMcpClientLabel,
} = dispatcher;

let passed = 0;
let failed = 0;

function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

function passAssertEqual(actual, expected, msg) {
  passAssert(actual === expected,
    msg + ' (expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual) + ')');
}

console.log('--- Test 1: allowlist labels pass through verbatim ---');
for (const label of ['Claude', 'Codex', 'OpenCode', 'Cursor', 'ChatGPT', 'Gemini']) {
  passAssertEqual(
    extractMcpClientLabel({ visualSession: { client: label } }),
    label,
    'allowlist label ' + JSON.stringify(label) + ' -> ' + JSON.stringify(label)
  );
}

console.log('--- Test 2: whitespace is trimmed ---');
passAssertEqual(extractMcpClientLabel({ visualSession: { client: '  Claude  ' } }), 'Claude',
  'leading + trailing whitespace trimmed');
passAssertEqual(extractMcpClientLabel({ visualSession: { client: 'Codex\n' } }), 'Codex',
  'trailing newline trimmed');

console.log('--- Test 3: missing payload / missing sidecar -> unknown ---');
passAssertEqual(extractMcpClientLabel(null), 'unknown', 'payload=null -> unknown');
passAssertEqual(extractMcpClientLabel(undefined), 'unknown', 'payload=undefined -> unknown');
passAssertEqual(extractMcpClientLabel({}), 'unknown', 'payload={} -> unknown');
passAssertEqual(extractMcpClientLabel({ visualSession: null }), 'unknown',
  'payload.visualSession=null -> unknown');
passAssertEqual(extractMcpClientLabel({ visualSession: {} }), 'unknown',
  'payload.visualSession={} -> unknown');

console.log('--- Test 4: non-string client -> unknown ---');
passAssertEqual(extractMcpClientLabel({ visualSession: { client: 123 } }), 'unknown',
  'numeric client -> unknown');
passAssertEqual(extractMcpClientLabel({ visualSession: { client: { instance: true } } }), 'unknown',
  'object client (the original bridge-instance leak shape) -> unknown');
passAssertEqual(extractMcpClientLabel({ visualSession: { client: null } }), 'unknown',
  'null client -> unknown');
passAssertEqual(extractMcpClientLabel({ visualSession: { client: undefined } }), 'unknown',
  'undefined client -> unknown');

console.log('--- Test 5: empty / whitespace-only string -> unknown ---');
passAssertEqual(extractMcpClientLabel({ visualSession: { client: '' } }), 'unknown',
  'empty string -> unknown');
passAssertEqual(extractMcpClientLabel({ visualSession: { client: '   ' } }), 'unknown',
  'whitespace-only -> unknown');

console.log('--- Test 6: resolveMcpClientLabel caches per agentId and fills in payload-less follow-ups ---');
clearLastKnownMcpClientLabel();
passAssertEqual(_peekLastKnownMcpClientLabel(), null, 'cache empty after reset');
// Simulate an action-tool dispatch first -- payload carries visualSession.client
// AND the agent-bridge-injected agentId (mcp/src/agent-bridge.ts buildAgentPayload).
const AGENT_A = 'agent-aaa-1111-2222-3333';
passAssertEqual(
  resolveMcpClientLabel({ agentId: AGENT_A, visualSession: { client: 'Claude' } }),
  'Claude',
  'first action dispatch surfaces real label'
);
passAssertEqual(_peekLastKnownMcpClientLabel(AGENT_A), 'Claude',
  'real label cached under the agentId slot');
// Simulate the non-action message routes that follow under the same agent:
// agent:register (already done; would have had no agentId pre-register),
// get-tabs, get-dom, get-diagnostics, read-page. These all carry agentId.
passAssertEqual(resolveMcpClientLabel({ agentId: AGENT_A }), 'Claude',
  'payload-less dispatch with same agentId reads cached label (agent:status shape)');
passAssertEqual(resolveMcpClientLabel({ agentId: AGENT_A, tool: 'mcp:get-tabs' }), 'Claude',
  'message-route payload with same agentId reads cached label (mcp:get-tabs shape)');

console.log('--- Test 6b: payload-less dispatch with NO agentId returns unknown (no global slot) ---');
// The very first agent:register has no agentId on the request payload because
// the MCP server learns its agent_id from the response. This MUST return
// 'unknown' rather than leaking ANY other agent's cached label.
clearLastKnownMcpClientLabel();
resolveMcpClientLabel({ agentId: AGENT_A, visualSession: { client: 'Claude' } });
passAssertEqual(resolveMcpClientLabel(null), 'unknown',
  'null payload -> unknown (no agentId, must not fall back to AGENT_A cache)');
passAssertEqual(resolveMcpClientLabel({}), 'unknown',
  'empty payload -> unknown (no agentId, must not fall back to AGENT_A cache)');
passAssertEqual(resolveMcpClientLabel({ tool: 'mcp:get-tabs' }), 'unknown',
  'payload with tool but no agentId -> unknown (agent:register-shape)');

console.log('--- Test 6c: concurrent agents are isolated (Codex P2 review) ---');
clearLastKnownMcpClientLabel();
const AGENT_B = 'agent-bbb-4444-5555-6666';
// Client A (e.g. Claude) does an action first, seeding its slot.
resolveMcpClientLabel({ agentId: AGENT_A, visualSession: { client: 'Claude' } });
// Client B (e.g. Codex) connects on the same hub bridge and does a get-tabs
// BEFORE its own first action. Previously the module-wide slot would have
// misattributed this as 'Claude'; the per-agent map must return 'unknown'.
passAssertEqual(
  resolveMcpClientLabel({ agentId: AGENT_B, tool: 'mcp:get-tabs' }),
  'unknown',
  'Client B payload-less call does NOT inherit Client A label'
);
// Now Client B does its first action; only its own slot updates.
resolveMcpClientLabel({ agentId: AGENT_B, visualSession: { client: 'Codex' } });
passAssertEqual(_peekLastKnownMcpClientLabel(AGENT_A), 'Claude',
  'Client A slot survives Client B action');
passAssertEqual(_peekLastKnownMcpClientLabel(AGENT_B), 'Codex',
  'Client B slot is independent');
passAssertEqual(
  resolveMcpClientLabel({ agentId: AGENT_A, tool: 'mcp:get-tabs' }),
  'Claude',
  'Client A follow-up still reads Claude'
);
passAssertEqual(
  resolveMcpClientLabel({ agentId: AGENT_B, tool: 'mcp:get-tabs' }),
  'Codex',
  'Client B follow-up now reads Codex'
);

console.log('--- Test 7: clearLastKnownMcpClientLabel resets cache (bridge reconnect path) ---');
clearLastKnownMcpClientLabel();
passAssertEqual(_peekLastKnownMcpClientLabel(), null,
  'cache empty after reset (mcp-bridge-client._ws.onopen path)');
passAssertEqual(resolveMcpClientLabel({ agentId: AGENT_A }), 'unknown',
  'payload-less dispatch on fresh connection returns unknown (no cache)');

console.log('--- Test 8: real payload label overwrites a stale cached label (same agent) ---');
clearLastKnownMcpClientLabel();
resolveMcpClientLabel({ agentId: AGENT_A, visualSession: { client: 'Claude' } });
passAssertEqual(_peekLastKnownMcpClientLabel(AGENT_A), 'Claude',
  'cached after first action dispatch');
passAssertEqual(
  resolveMcpClientLabel({ agentId: AGENT_A, visualSession: { client: 'Codex' } }),
  'Codex',
  'second action dispatch with different client surfaces new label'
);
passAssertEqual(_peekLastKnownMcpClientLabel(AGENT_A), 'Codex',
  'agent slot updated to most recent real label (not pinned to first)');

console.log('--- Test 9: regression guard -- both recordDispatch sites use the resolver ---');
const dispatcherSrc = fs.readFileSync(DISPATCHER_PATH, 'utf8');

// Find every block from `globalThis.fsbMcpMetricsRecorder.recordDispatch({`
// up to the matching `});` and assert each one calls resolveMcpClientLabel
// rather than the legacy extractMcpClientLabel or the original bare bridge
// object. Regex stays loose enough to survive whitespace / argument-order
// tweaks but tight enough to catch a regression.
const callSitePattern = /globalThis\.fsbMcpMetricsRecorder\.recordDispatch\(\{[\s\S]*?\}\);/g;
const callSites = dispatcherSrc.match(callSitePattern) || [];

passAssert(callSites.length === 2,
  'expected exactly 2 recordDispatch call sites in mcp-tool-dispatcher.js (got ' + callSites.length + ')');

for (let i = 0; i < callSites.length; i++) {
  passAssert(callSites[i].includes('resolveMcpClientLabel(payload)'),
    'recordDispatch site #' + (i + 1) + ' calls resolveMcpClientLabel(payload)');
  // Bare `client,` (no extraction) is the legacy bug shape. Catch a partial
  // revert that drops the helper while keeping the rest of the call intact.
  passAssert(!/[\s,]client,\s/.test(callSites[i]),
    'recordDispatch site #' + (i + 1) + ' does NOT pass bare bridge-object `client` arg');
  // Catch a partial revert to the 260515-i1j helper that lacks the
  // non-action-route fallback.
  passAssert(!/client:\s*extractMcpClientLabel\(payload\)/.test(callSites[i]),
    'recordDispatch site #' + (i + 1) + ' does NOT regress to extractMcpClientLabel (missing non-action fallback)');
}

// Also assert mcp-bridge-client.js wires clearLastKnownMcpClientLabel on onopen.
const BRIDGE_CLIENT_PATH = path.resolve(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js');
const bridgeSrc = fs.readFileSync(BRIDGE_CLIENT_PATH, 'utf8');
passAssert(/clearLastKnownMcpClientLabel\s*\(\s*\)/.test(bridgeSrc),
  'mcp-bridge-client.js invokes clearLastKnownMcpClientLabel() (cache reset on reconnect)');

// ---------------------------------------------------------------------------
// Quick task 260524-8qv -- Codex PR #78 Findings 1 + 4 (P2).
//
// Tests 10 + 11 exercise the chrome.storage.session RMW path inside
// _persistAgentClientLabel and the chrome.storage.session.remove path inside
// clearLastKnownMcpClientLabel. The base require above runs in a Node test
// harness where `typeof chrome === 'undefined'`, so the persist helper's
// first guard returns synchronously and NEVER writes to storage. To exercise
// the real persist/clear code paths these tests INSTALL a microtask-resolving
// chrome.storage.session shim on globalThis, then re-require the dispatcher
// via require.cache invalidation. The shim's get/set/remove resolve on the
// microtask queue (Promise.resolve().then(...)) which is STRICTLY HARDER
// than real chrome.storage.session (which round-trips through IPC and
// resolves on the macrotask queue). If the mutex serializes correctly under
// microtask interleaving, it will serialize under the slower real impl.
// ---------------------------------------------------------------------------

(async function runStorageRaceTests() {
  // -- Shared shim factory + harness setup ----------------------------------
  function installChromeShim() {
    const store = {};
    globalThis.chrome = {
      storage: {
        session: {
          _peekStore: function () { return store; },
          get: function (keys) {
            return Promise.resolve().then(function () {
              const ks = Array.isArray(keys) ? keys : [keys];
              const out = {};
              for (const k of ks) {
                if (Object.prototype.hasOwnProperty.call(store, k)) {
                  out[k] = store[k];
                }
              }
              return out;
            });
          },
          set: function (obj) {
            return Promise.resolve().then(function () {
              Object.assign(store, obj);
            });
          },
          remove: function (key) {
            return Promise.resolve().then(function () {
              const ks = Array.isArray(key) ? key : [key];
              for (const k of ks) delete store[k];
            });
          }
        }
      }
    };
    return store;
  }

  function teardownChromeShim() {
    delete globalThis.chrome;
    delete require.cache[DISPATCHER_PATH];
  }

  async function drainMicrotasks() {
    // Drain enough microtask turns to flush a multi-stage promise.then chain
    // (get -> set is at least 2 turns; the mutex adds a wrapper turn).
    for (let i = 0; i < 10; i++) await Promise.resolve();
    // One macrotask tick covers any setImmediate-scheduled work.
    await new Promise(function (r) { setImmediate(r); });
  }

  // -- Test 10: Concurrent persist race (Finding 1) -------------------------
  console.log('\n--- Test 10: Concurrent persist race (Codex PR #78 Finding 1, P2) ---');
  {
    const store = installChromeShim();
    delete require.cache[DISPATCHER_PATH];
    const d2 = require(DISPATCHER_PATH);

    // Establish a known empty baseline. The dispatcher's module-scope chain
    // is freshly Promise.resolve() because we just re-required.
    d2.clearLastKnownMcpClientLabel();
    await drainMicrotasks();

    // Fire two persists back-to-back without awaits, in a single microtask
    // turn. With the unfixed code each call would read the prior `map` (both
    // see {}), set their own key on their private copy, then race to
    // chrome.storage.session.set -- the second write silently overwrites the
    // first. With the _withLabelStorageLock mutex, the second persist's
    // read sees the first persist's committed write.
    d2.resolveMcpClientLabel({ agentId: 'agent-A', visualSession: { client: 'Claude' } });
    d2.resolveMcpClientLabel({ agentId: 'agent-B', visualSession: { client: 'Codex' } });

    await drainMicrotasks();

    const persisted = store.fsbAgentClientLabels;
    passAssert(persisted && typeof persisted === 'object' && !Array.isArray(persisted),
      'Test 10: fsbAgentClientLabels persisted as a plain object');
    passAssertEqual(persisted && persisted['agent-A'], 'Claude',
      'Test 10: agent-A persisted with label Claude (no lost update)');
    passAssertEqual(persisted && persisted['agent-B'], 'Codex',
      'Test 10: agent-B persisted with label Codex (no lost update)');
    passAssertEqual(Object.keys(persisted || {}).length, 2,
      'Test 10: exactly TWO keys present -- both persists landed');

    teardownChromeShim();
  }

  // -- Test 11: Clear-after-persist race (Finding 4) ------------------------
  console.log('\n--- Test 11: Clear-after-persist race (Codex PR #78 Finding 4, P2) ---');
  {
    const store = installChromeShim();
    delete require.cache[DISPATCHER_PATH];
    const d3 = require(DISPATCHER_PATH);

    // Establish empty baseline (the chain is freshly Promise.resolve()).
    d3.clearLastKnownMcpClientLabel();
    await drainMicrotasks();

    // Submit a persist followed immediately by a clear, no awaits between.
    // Under FIFO serialization the persist's set() runs first, then the
    // clear's remove() wipes the key -- final state must be EMPTY. The
    // unfixed code resolves the clear's remove() before the persist's set()
    // (clear is one microtask; persist is two), leaving a stale
    // {'agent-A':'Claude'} resurrected after the clear.
    d3.resolveMcpClientLabel({ agentId: 'agent-A', visualSession: { client: 'Claude' } });
    d3.clearLastKnownMcpClientLabel();

    await drainMicrotasks();

    passAssertEqual(store.fsbAgentClientLabels, undefined,
      'Test 11: fsbAgentClientLabels removed -- clear submitted AFTER persist wins under FIFO serialization');
    // Cross-check: in-memory cache is wiped synchronously by clearLastKnownMcpClientLabel.
    // This is independent of the storage chain and was already correct in the
    // unfixed code, but assert it so a future refactor that moves the in-memory
    // clear into the mutex (and accidentally awaits it) is caught.
    passAssertEqual(d3._peekLastKnownMcpClientLabel(), null,
      'Test 11: in-memory _agentClientLabelCache cleared synchronously by clearLastKnownMcpClientLabel');

    teardownChromeShim();
  }

  console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (e) {
  console.error('FATAL: storage-race test harness threw:', e && e.stack ? e.stack : e);
  process.exit(2);
});
