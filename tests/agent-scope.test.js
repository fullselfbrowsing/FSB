'use strict';

/**
 * Phase 238 plan 01 -- AgentScope unit tests.
 *
 * Validates (per CONTEXT.md decisions D-01, D-03, D-04):
 *   - Test 1: Lazy mint single-caller (one ensure -> one agent:register; subsequent calls reuse cached id)
 *   - Test 2: Concurrent first-call race (D-03: 5 concurrent ensure() calls share ONE in-flight register)
 *   - Test 3: Throw-on-failure no poison (D-04: failed register does not cache; next ensure retries cleanly)
 *   - Test 4: current() returns null before mint and the id after; reset() clears cached id and allows re-mint
 *   - Test 5: Response shape validation (success:false or missing agentId rejects with 'agent:register failed')
 *
 * Wave 0 gate: this file is independently committable BEFORE the implementation lands. If
 * mcp/build/agent-scope.js does not yet exist, the file logs a SKIPPED notice and exits 0.
 *
 * Run: node tests/agent-scope.test.js
 *   (after `npm --prefix mcp run build`)
 */

const fs = require('fs');
const path = require('path');
const nodeAssert = require('node:assert/strict');
const { pathToFileURL } = require('url');

const repoRoot = path.resolve(__dirname, '..');
const buildPath = path.join(repoRoot, 'mcp', 'build', 'agent-scope.js');

// ---------- Plain Node assert convention (matches tests/agent-registry.test.js) -----------

function assert(cond, msg) {
  if (!cond) {
    throw new Error('ASSERT FAILED: ' + (msg || '(no message)'));
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error('ASSERT EQUAL FAILED: ' + (msg || '') + ' expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual));
  }
}

// ---------- MockBridge: minimal stand-in for WebSocketBridge -----------

class MockBridge {
  constructor() {
    this.isConnected = true;
    this.calls = [];
    // _next is a per-test injectable function returning a resolved/rejected response.
    // Default: returns success with a deterministic id.
    this._next = (msg) => Promise.resolve({
      success: true,
      agentId: 'agent_test_default_0001',
      agentIdShort: 'agent_test',
    });
  }
  async sendAndWait(msg, options) {
    this.calls.push(msg);
    return this._next(msg, options);
  }
  registerCount() {
    return this.calls.filter((m) => m && m.type === 'agent:register').length;
  }
}

// Deferred / manual-resolve helper for the concurrency test.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// ---------- Test runner ----------

async function main() {
  if (!fs.existsSync(buildPath)) {
    console.log('agent-scope.test.js: SKIPPED -- Wave 0 only (mcp/build/agent-scope.js not present)');
    process.exit(0);
  }

  // ESM import via dynamic import (mcp build emits ESM with "type": "module").
  const moduleUrl = pathToFileURL(buildPath).href;
  const mod = await import(moduleUrl);
  const AgentScope = mod.AgentScope;
  assert(typeof AgentScope === 'function', 'AgentScope export must be a class/function');

  // ===== Test 1: lazy mint, single caller =====
  {
    const scope = new AgentScope();
    const bridge = new MockBridge();
    bridge._next = () => Promise.resolve({
      success: true,
      agentId: 'agent_test_t1_aaaaaaaa',
      agentIdShort: 'agent_test_t1',
    });

    const id1 = await scope.ensure(bridge);
    assertEqual(id1, 'agent_test_t1_aaaaaaaa', 'Test 1: ensure() returns minted agentId');
    assertEqual(bridge.registerCount(), 1, 'Test 1: exactly one agent:register call after first ensure');
    assertEqual(bridge.calls[0].type, 'agent:register', 'Test 1: call type is agent:register');
    assert(bridge.calls[0].payload && typeof bridge.calls[0].payload === 'object', 'Test 1: payload is an object');
    nodeAssert.deepStrictEqual(
      bridge.calls[0],
      { type: 'agent:register', payload: {} },
      'Test 1: no suppliers preserve the exact legacy registration message',
    );

    // Subsequent calls return cached id; sendAndWait MUST NOT fire again.
    const id2 = await scope.ensure(bridge);
    const id3 = await scope.ensure(bridge);
    assertEqual(id2, id1, 'Test 1: second ensure returns same cached id');
    assertEqual(id3, id1, 'Test 1: third ensure returns same cached id');
    assertEqual(bridge.registerCount(), 1, 'Test 1: still exactly one agent:register after 3 ensure calls');
    console.log('Test 1 (lazy mint single caller): PASS');
  }

  // ===== Test 2: concurrent first-call race (D-03) =====
  {
    const scope = new AgentScope();
    const bridge = new MockBridge();
    const gate = deferred();
    bridge._next = () => gate.promise;

    // Kick off 5 concurrent ensure() calls before resolving the mock's first response.
    const promises = [];
    for (let i = 0; i < 5; i += 1) {
      promises.push(scope.ensure(bridge));
    }

    // Allow microtasks to run so each ensure() reaches the pending check.
    await new Promise((r) => setImmediate(r));

    // Now resolve the single in-flight register.
    gate.resolve({
      success: true,
      agentId: 'agent_test_race_bbbbbbbb',
      agentIdShort: 'agent_test_race',
    });

    const ids = await Promise.all(promises);
    assertEqual(ids.length, 5, 'Test 2: 5 promises settled');
    for (const id of ids) {
      assertEqual(id, 'agent_test_race_bbbbbbbb', 'Test 2: all 5 ensure callers receive the same agentId');
    }
    assertEqual(bridge.registerCount(), 1, 'Test 2: exactly ONE agent:register fired despite 5 concurrent ensure calls');
    console.log('Test 2 (concurrent first-call race, D-03): PASS');
  }

  // ===== Test 3: throw-on-failure no poison (D-04) =====
  {
    const scope = new AgentScope();
    const bridge = new MockBridge();
    let callIndex = 0;
    bridge._next = () => {
      callIndex += 1;
      if (callIndex === 1) {
        return Promise.reject(new Error('extension_not_connected'));
      }
      return Promise.resolve({
        success: true,
        agentId: 'agent_test_retry_cccccccc',
        agentIdShort: 'agent_test_retry',
      });
    };

    let firstError = null;
    try {
      await scope.ensure(bridge);
    } catch (err) {
      firstError = err;
    }
    assert(firstError instanceof Error, 'Test 3: first ensure rejects with an Error');
    assert(firstError.message.indexOf('extension_not_connected') !== -1, 'Test 3: error message preserves underlying cause (got: ' + firstError.message + ')');
    assertEqual(scope.current(), null, 'Test 3: current() still null after failed mint (failure NOT cached)');

    // Second call must retry cleanly (not return a cached failed promise).
    const id = await scope.ensure(bridge);
    assertEqual(id, 'agent_test_retry_cccccccc', 'Test 3: second ensure mints cleanly after prior failure');
    assertEqual(bridge.registerCount(), 2, 'Test 3: agent:register fired twice (once failed, once succeeded)');
    assertEqual(scope.current(), 'agent_test_retry_cccccccc', 'Test 3: current() now returns the minted id');
    console.log('Test 3 (throw-on-failure no poison, D-04): PASS');
  }

  // ===== Test 4: current() and reset() =====
  {
    const scope = new AgentScope();
    const bridge = new MockBridge();
    bridge._next = () => Promise.resolve({
      success: true,
      agentId: 'agent_test_t4_dddddddd',
      agentIdShort: 'agent_test_t4',
    });

    assertEqual(scope.current(), null, 'Test 4: current() returns null before mint');

    const id = await scope.ensure(bridge);
    assertEqual(scope.current(), id, 'Test 4: current() returns minted id after ensure');

    // Reset clears the cached id; next ensure should re-mint.
    scope.reset();
    assertEqual(scope.current(), null, 'Test 4: current() returns null after reset');

    bridge._next = () => Promise.resolve({
      success: true,
      agentId: 'agent_test_t4_eeeeeeee',
      agentIdShort: 'agent_test_t4_2',
    });
    const id2 = await scope.ensure(bridge);
    assertEqual(id2, 'agent_test_t4_eeeeeeee', 'Test 4: ensure after reset re-mints with new id');
    assert(id2 !== id, 'Test 4: post-reset id differs from pre-reset id');
    assertEqual(bridge.registerCount(), 2, 'Test 4: two register calls (pre-reset + post-reset)');
    console.log('Test 4 (current() and reset()): PASS');
  }

  // ===== Test 5: response shape validation =====
  {
    // 5a: success:false + error string
    const scope1 = new AgentScope();
    const bridge1 = new MockBridge();
    bridge1._next = () => Promise.resolve({ success: false, error: 'cap_reached' });
    let err1 = null;
    try {
      await scope1.ensure(bridge1);
    } catch (e) {
      err1 = e;
    }
    assert(err1 instanceof Error, 'Test 5a: ensure rejects when success:false');
    assert(err1.message.indexOf('agent:register failed') !== -1, 'Test 5a: error message contains "agent:register failed" (got: ' + err1.message + ')');

    // 5b: missing agentId (success true but no id field)
    const scope2 = new AgentScope();
    const bridge2 = new MockBridge();
    bridge2._next = () => Promise.resolve({ success: true });
    let err2 = null;
    try {
      await scope2.ensure(bridge2);
    } catch (e) {
      err2 = e;
    }
    assert(err2 instanceof Error, 'Test 5b: ensure rejects when agentId missing');
    assert(err2.message.indexOf('agent:register failed') !== -1, 'Test 5b: error message contains "agent:register failed" (got: ' + err2.message + ')');

    // 5c: agentId wrong type (number)
    const scope3 = new AgentScope();
    const bridge3 = new MockBridge();
    bridge3._next = () => Promise.resolve({ success: true, agentId: 42 });
    let err3 = null;
    try {
      await scope3.ensure(bridge3);
    } catch (e) {
      err3 = e;
    }
    assert(err3 instanceof Error, 'Test 5c: ensure rejects when agentId is not a string');
    assert(err3.message.indexOf('agent:register failed') !== -1, 'Test 5c: error message contains "agent:register failed" (got: ' + err3.message + ')');

    console.log('Test 5 (response shape validation): PASS');
  }

  console.log('agent-scope.test.js: PASS');
}

main().catch((err) => {
  console.error('agent-scope.test.js: FAIL');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
