'use strict';

/*
 * Phase 259 Plan 01 -- end-to-end contract test for the v0.9.62 IMPLICIT
 * visual-session contract.
 *
 * Source-of-truth references:
 *   - .planning/v0.9.62-CONTRACT.md       (Field Bundle, Badge Allowlist citation,
 *                                          Typed Error names)
 *   - .planning/phases/259-test-rewrites-ci-lock/259-01-PLAN.md
 *                                         (the five cases this file enumerates)
 *   - tests/visual-session-schema-lock.test.js   (Phase 255 dispatcher rejection pattern)
 *   - tests/mcp-visual-tick-lifecycle.test.js    (Phase 256/257 lifecycle pattern)
 *
 * What this test locks:
 *   1. runAllowlistAndManagerCase
 *        - The shared v0.9.36 badge allowlist module (extension/utils/mcp-visual-session.js)
 *          still exposes the canonical labels + normalization helpers + manager-lifecycle
 *          token plumbing that the v0.9.62 contract continues to reuse. Read-only assertions
 *          against MCP_VISUAL_CLIENT_LABELS, normalizeMcpVisualClientLabel,
 *          isAllowedMcpVisualClientLabel, getAllowedMcpVisualClientLabels.
 *
 *   2. runPersistenceReplayCase
 *        - The v0.9.62 lifecycle module (extension/utils/mcp-visual-session-lifecycle.js)
 *          persists per-tab entries under key 'mcpVisualSession:<tabId>' in
 *          chrome.storage.session and replays them on SW startup. Live entries
 *          (deadlineAt > now) re-arm the death alarm with the ORIGINAL deadlineAt;
 *          stale entries (deadlineAt <= now) immediate-clear (storage removed,
 *          no alarm). Replaces the v0.9.36 'fsbMcpVisualSessions' single-key flow.
 *
 *   3. runImplicitDispatcherValidationCase
 *        - The MCP server's registerManualTools dispatcher (mcp/build/tools/manual.js)
 *          rejects action-tool calls missing visual_reason or client with
 *          VISUAL_FIELDS_REQUIRED (no bridge / queue call). Rejects calls with
 *          a non-allowlisted client with BADGE_NOT_ALLOWED (no bridge / queue
 *          call). Forwards valid calls through to bridge.sendAndWait with the
 *          visual fields stripped from the action params and present as a
 *          sidecar visualSession field on the bridge payload.
 *
 *   4. runOwnershipPrecedenceCase
 *        - The lifecycle module's recordVisualSessionTick rejects a cross-agent
 *          tick on an already-owned tab with { ok: false, reason: 'agent_mismatch' }.
 *          The owning agent's storage entry is left untouched: no version bump,
 *          no agentId rotation, no visualReason / client overwrite. This is the
 *          defense-in-depth dual of the v0.9.60 TAB_NOT_OWNED gate that fires
 *          BEFORE the lifecycle hook in extension/ws/mcp-bridge-client.js
 *          _handleExecuteAction; the lifecycle-layer assertion locks the second
 *          layer that protects state if a future caller-bypass surface emerges.
 *          (Per Phase 259 Plan 01 downscope clause -- direct unit test against
 *          recordVisualSessionTick is the practical seam; the dispatcher path
 *          would require a full _handleExecuteAction harness with
 *          resolveAgentTabOrError, dispatchMcpToolRoute, wrapWithChangeReport,
 *          and the agent-registry instance, which is out of scope here.)
 *
 *   5. runToolRemovedCase
 *        - Calling either removed tool name (start_visual_session,
 *          end_visual_session) through the MCP server's registerVisualSessionTools
 *          dispatcher (mcp/build/tools/visual-session.js) returns the typed
 *          TOOL_REMOVED error envelope. The response body references the
 *          CHANGELOG anchor and the README migration recipe. No bridge call,
 *          no queue call.
 *
 * Run: node tests/mcp-visual-session-contract.test.js
 */

const path = require('path');
const fs = require('fs');
const util = require('util');

const visualSessionUtils = require('../extension/utils/mcp-visual-session.js');
const overlayStateUtils = require('../extension/utils/overlay-state.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} (expected: ${expected}, got: ${actual})`);
}

function assertDeepEqual(actual, expected, msg) {
  assert(util.isDeepStrictEqual(actual, expected), `${msg} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
}

// ------------------------------------------------------------------
// Case 1: allowlist + manager lifecycle (KEPT from pre-v0.9.62)
// ------------------------------------------------------------------

async function runAllowlistAndManagerCase() {
  console.log('\n--- Case 1: allowlist normalization + manager lifecycle (v0.9.36 surface still alive) ---');

  const {
    MCP_VISUAL_CLIENT_LABELS,
    McpVisualSessionManager,
    normalizeMcpVisualClientLabel,
    isAllowedMcpVisualClientLabel,
    getAllowedMcpVisualClientLabels,
    buildMcpVisualSessionStatus,
    buildMcpVisualSessionClearStatus,
  } = visualSessionUtils;

  // The constant is a non-empty array exposing the canonical 12 labels.
  assert(Array.isArray(MCP_VISUAL_CLIENT_LABELS), 'MCP_VISUAL_CLIENT_LABELS is an array');
  assert(MCP_VISUAL_CLIENT_LABELS.length >= 12, 'MCP_VISUAL_CLIENT_LABELS contains at least 12 canonical labels');
  assert(MCP_VISUAL_CLIENT_LABELS.includes('Claude'), 'allowlist contains canonical label Claude');
  assert(MCP_VISUAL_CLIENT_LABELS.includes('Codex'), 'allowlist contains canonical label Codex');
  assert(MCP_VISUAL_CLIENT_LABELS.includes('Gemini'), 'allowlist contains canonical label Gemini');
  assert(MCP_VISUAL_CLIENT_LABELS.includes('ChatGPT'), 'allowlist contains canonical label ChatGPT');

  // Normalization: case folding, whitespace folding, embedded-space tolerance.
  assertEqual(normalizeMcpVisualClientLabel('claude'), 'Claude', 'normalize lowercase claude to Claude');
  assertEqual(normalizeMcpVisualClientLabel('CLAUDE'), 'Claude', 'normalize uppercase CLAUDE to Claude');
  assertEqual(normalizeMcpVisualClientLabel(' codex '), 'Codex', 'normalize whitespace-padded codex to Codex');
  assertEqual(normalizeMcpVisualClientLabel('chat gpt'), 'ChatGPT', 'normalize spaced chat gpt to ChatGPT');
  assertEqual(normalizeMcpVisualClientLabel('NotARealClient'), null, 'reject unknown client label');
  assertEqual(normalizeMcpVisualClientLabel(''), null, 'reject empty string');
  assertEqual(normalizeMcpVisualClientLabel(null), null, 'reject null');
  assertEqual(normalizeMcpVisualClientLabel(undefined), null, 'reject undefined');

  // Boolean predicate wraps the normalizer.
  assertEqual(isAllowedMcpVisualClientLabel('Claude'), true, 'isAllowedMcpVisualClientLabel returns true for Claude');
  assertEqual(isAllowedMcpVisualClientLabel('codex'), true, 'isAllowedMcpVisualClientLabel returns true for codex (case-insensitive)');
  assertEqual(isAllowedMcpVisualClientLabel('NotARealClient'), false, 'isAllowedMcpVisualClientLabel returns false for unknown label');
  assertEqual(isAllowedMcpVisualClientLabel(''), false, 'isAllowedMcpVisualClientLabel returns false for empty string');

  // Quick task 260608-6nm: Tier-1 MCP client allowlist expansion (12 new entries).
  // Locks presence + normalization + no-collision for the 12 new canonical labels.
  const NEW_TIER_1_LABELS_260608_6NM = [
    'Cline', 'Continue', 'Zed', 'VS Code', 'Copilot', 'JetBrains',
    'Xcode', 'Eclipse', 'Cody', 'Roo Code', 'Kiro', 'Goose',
  ];
  NEW_TIER_1_LABELS_260608_6NM.forEach((label) => {
    assert(
      MCP_VISUAL_CLIENT_LABELS.includes(label),
      `allowlist contains canonical Tier-1 label ${label} (quick task 260608-6nm)`
    );
  });

  assert(
    MCP_VISUAL_CLIENT_LABELS.length >= 26,
    'MCP_VISUAL_CLIENT_LABELS length >= 26 after Tier-1 expansion (14 pre-existing + 12 new)'
  );

  // Multi-token cases -- separator folding under [\s_-]+ regex.
  assertEqual(normalizeMcpVisualClientLabel('vs code'), 'VS Code', 'normalize spaced "vs code" to "VS Code"');
  assertEqual(normalizeMcpVisualClientLabel('VSCode'), 'VS Code', 'normalize concatenated "VSCode" to "VS Code"');
  assertEqual(normalizeMcpVisualClientLabel('vs-code'), 'VS Code', 'normalize hyphenated "vs-code" to "VS Code"');
  assertEqual(normalizeMcpVisualClientLabel('vs_code'), 'VS Code', 'normalize underscored "vs_code" to "VS Code"');
  assertEqual(normalizeMcpVisualClientLabel('roo code'), 'Roo Code', 'normalize spaced "roo code" to "Roo Code"');
  assertEqual(normalizeMcpVisualClientLabel('RooCode'), 'Roo Code', 'normalize concatenated "RooCode" to "Roo Code"');
  assertEqual(normalizeMcpVisualClientLabel('roo-code'), 'Roo Code', 'normalize hyphenated "roo-code" to "Roo Code"');

  // Single-token cases -- case folding sample.
  assertEqual(normalizeMcpVisualClientLabel('cline'), 'Cline', 'normalize lowercase "cline" to "Cline"');
  assertEqual(normalizeMcpVisualClientLabel('CONTINUE'), 'Continue', 'normalize uppercase "CONTINUE" to "Continue"');
  assertEqual(normalizeMcpVisualClientLabel('zed'), 'Zed', 'normalize lowercase "zed" to "Zed"');
  assertEqual(normalizeMcpVisualClientLabel('Copilot'), 'Copilot', 'normalize exact "Copilot" to "Copilot"');
  assertEqual(normalizeMcpVisualClientLabel('jetbrains'), 'JetBrains', 'normalize lowercase "jetbrains" to "JetBrains"');
  assertEqual(normalizeMcpVisualClientLabel('XCODE'), 'Xcode', 'normalize uppercase "XCODE" to "Xcode"');
  assertEqual(normalizeMcpVisualClientLabel('Eclipse'), 'Eclipse', 'normalize exact "Eclipse" to "Eclipse"');
  assertEqual(normalizeMcpVisualClientLabel('cody'), 'Cody', 'normalize lowercase "cody" to "Cody"');
  assertEqual(normalizeMcpVisualClientLabel('KIRO'), 'Kiro', 'normalize uppercase "KIRO" to "Kiro"');
  assertEqual(normalizeMcpVisualClientLabel('goose'), 'Goose', 'normalize lowercase "goose" to "Goose"');

  // No-collision: each canonical entry produces a unique normalize key.
  const allKeys = MCP_VISUAL_CLIENT_LABELS.map(
    (label) => String(label).trim().toLowerCase().replace(/[\s_-]+/g, '')
  );
  const uniqueKeys = new Set(allKeys);
  assertEqual(
    uniqueKeys.size,
    allKeys.length,
    'every canonical allowlist entry produces a unique normalize key (no collisions)'
  );

  // getAllowedMcpVisualClientLabels returns a defensive copy.
  const copyA = getAllowedMcpVisualClientLabels();
  const copyB = getAllowedMcpVisualClientLabels();
  assert(Array.isArray(copyA), 'getAllowedMcpVisualClientLabels returns an array');
  assert(copyA !== copyB, 'getAllowedMcpVisualClientLabels returns a fresh array each call (different reference)');
  copyA.push('PoisonedLabel');
  const copyC = getAllowedMcpVisualClientLabels();
  assert(!copyC.includes('PoisonedLabel'), 'mutating the returned array does NOT poison the module internal state');

  // Manager startSession + getTokenForTab still works for the kept surface.
  const manager = new McpVisualSessionManager();
  const started = manager.startSession({
    clientLabel: 'codex',
    tabId: 55,
    task: 'Complete checkout',
    detail: 'Preparing overlay',
  });
  assert(started && started.session && typeof started.session.sessionToken === 'string', 'manager.startSession returns a session token');
  assertEqual(started.session.clientLabel, 'Codex', 'manager.startSession canonicalises the client label');
  assertEqual(manager.getTokenForTab(55), started.session.sessionToken, 'manager.getTokenForTab returns the issued token');

  // The status / clear-status overlay helpers still produce a coherent payload.
  const runningStatus = buildMcpVisualSessionStatus(started.session, { statusText: 'Preparing overlay' });
  assert(runningStatus && typeof runningStatus.sessionToken === 'string', 'buildMcpVisualSessionStatus returns a status payload');
  assertEqual(runningStatus.clientLabel, 'Codex', 'status payload preserves canonical clientLabel');
  const runningState = overlayStateUtils.buildOverlayState(runningStatus, null);
  assertEqual(runningState.lifecycle, 'running', 'overlay state derived from running status is lifecycle=running');

  const ended = manager.endSession(started.session.sessionToken, { reason: 'ended' });
  assert(ended && ended.reason === 'ended', 'manager.endSession returns the clear payload with the supplied reason');
  const clearState = overlayStateUtils.buildOverlayState(
    buildMcpVisualSessionClearStatus(ended, { reason: 'ended' }),
    null,
  );
  assertEqual(clearState.lifecycle, 'cleared', 'overlay state derived from clear status is lifecycle=cleared');
}

// ------------------------------------------------------------------
// Case 2: persistence replay against the v0.9.62 'mcpVisualSession:<tabId>'
// namespace (Phase 256 lifecycle module). Replaces the v0.9.36
// 'fsbMcpVisualSessions' single-key replay flow.
// ------------------------------------------------------------------

function createPersistenceStorageArea(initial) {
  const store = Object.assign({}, initial || {});
  return {
    async get(keys) {
      if (keys == null) return Object.assign({}, store);
      if (Array.isArray(keys)) {
        const out = {};
        keys.forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(store, key)) out[key] = store[key];
        });
        return out;
      }
      if (typeof keys === 'string') {
        return Object.prototype.hasOwnProperty.call(store, keys) ? { [keys]: store[keys] } : {};
      }
      return Object.assign({}, store);
    },
    async set(values) {
      Object.assign(store, values);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach((key) => { delete store[key]; });
    },
    _dump() { return Object.assign({}, store); }
  };
}

function createPersistenceChromeMock() {
  const session = createPersistenceStorageArea();
  const alarms = new Map();
  const cleared = [];
  return {
    storage: { session },
    alarms: {
      async create(name, options) {
        alarms.set(name, Object.assign({ name }, options || {}));
      },
      async clear(name) {
        cleared.push(name);
        alarms.delete(name);
        return true;
      },
      async getAll() {
        return Array.from(alarms.values());
      },
      _created() { return Array.from(alarms.values()); },
      _cleared() { return cleared.slice(); }
    }
  };
}

async function runPersistenceReplayCase() {
  console.log('\n--- Case 2: SW-eviction persistence replay against mcpVisualSession:<tabId> namespace ---');

  const LIFECYCLE_MODULE_PATH = require.resolve('../extension/utils/mcp-visual-session-lifecycle.js');

  // Fresh chrome mock + sendSessionStatus stub on the global, then re-require
  // the lifecycle module so its IIFE binds to this iteration's globals.
  const chromeMock = createPersistenceChromeMock();
  const broadcasts = [];
  const priorChrome = global.chrome;
  const priorUtils = global.MCPVisualSessionUtils;
  const priorSender = global.sendSessionStatus;

  global.chrome = chromeMock;
  global.MCPVisualSessionUtils = visualSessionUtils;
  global.sendSessionStatus = async (tabId, statusData) => {
    broadcasts.push({ tabId, statusData });
  };
  delete require.cache[LIFECYCLE_MODULE_PATH];
  const lc = require(LIFECYCLE_MODULE_PATH);

  try {
    const now = Date.now();

    // Confirm the storage key prefix the lifecycle module owns is the v0.9.62
    // namespace (not the v0.9.36 single-key 'fsbMcpVisualSessions' bag).
    assertEqual(lc.MCP_VISUAL_LIFECYCLE_STORAGE_KEY_PREFIX, 'mcpVisualSession:', 'lifecycle module persists under mcpVisualSession:<tabId> namespace (v0.9.62)');
    assertEqual(lc.MCP_VISUAL_LIFECYCLE_ALARM_PREFIX, 'mcpVisualDeath:', 'lifecycle module names alarms under mcpVisualDeath:<tabId> namespace (v0.9.62)');
    assertEqual(lc.MCP_VISUAL_LIFECYCLE_DEATH_MS, 60000, 'lifecycle TTL is the 60s sliding window (v0.9.62)');

    // Seed two per-tab entries: one live, one stale.
    await chromeMock.storage.session.set({
      'mcpVisualSession:201': {
        tabId: 201,
        agentId: 'agent_live',
        client: 'Claude',
        visualReason: 'Logging in',
        startedAt: now - 5000,
        lastTickAt: now - 5000,
        deadlineAt: now + 55000,
        isFinal: false
      },
      'mcpVisualSession:202': {
        tabId: 202,
        agentId: 'agent_stale',
        client: 'Codex',
        visualReason: 'Stale entry',
        startedAt: now - 120000,
        lastTickAt: now - 120000,
        deadlineAt: now - 60000,
        isFinal: false
      }
    });

    const result = await lc.restoreVisualSessionLifecyclesFromStorage();
    assert(result && result.ok === true, 'restoreVisualSessionLifecyclesFromStorage returns ok=true');
    assertEqual(result.restored, 1, 'one live entry restored');
    assertEqual(result.cleared, 1, 'one stale entry immediate-cleared');

    // Live entry: storage preserved, alarm re-armed at the ORIGINAL deadlineAt.
    const liveStored = (await chromeMock.storage.session.get(['mcpVisualSession:201']))['mcpVisualSession:201'];
    assert(liveStored, 'live entry still in storage after restore');
    assertEqual(liveStored.deadlineAt, now + 55000, 'live entry deadlineAt preserved (NOT silently reset on SW wake -- TIMEOUT-04)');
    const liveAlarm = chromeMock.alarms._created().find((a) => a.name === 'mcpVisualDeath:201');
    assert(liveAlarm, 'live entry alarm re-armed under mcpVisualDeath:201');
    assertEqual(liveAlarm.when, now + 55000, 'live entry alarm when matches original deadlineAt');

    // Stale entry: storage removed, no alarm armed.
    const staleStored = (await chromeMock.storage.session.get(['mcpVisualSession:202']))['mcpVisualSession:202'];
    assertEqual(staleStored, undefined, 'stale entry removed from storage on restore');
    const staleAlarm = chromeMock.alarms._created().find((a) => a.name === 'mcpVisualDeath:202');
    assertEqual(staleAlarm, undefined, 'stale entry NOT re-armed (auto-cleared, not rearmed)');
  } finally {
    if (priorChrome === undefined) delete global.chrome; else global.chrome = priorChrome;
    if (priorUtils === undefined) delete global.MCPVisualSessionUtils; else global.MCPVisualSessionUtils = priorUtils;
    if (priorSender === undefined) delete global.sendSessionStatus; else global.sendSessionStatus = priorSender;
  }
}

// ------------------------------------------------------------------
// Case 3: implicit dispatcher validation -- the MCP server's
// registerManualTools chokepoint rejects action calls missing the
// v0.9.62 field bundle BEFORE bridge / queue invocation, and forwards
// valid calls with the visual fields stripped + present as a sidecar.
// ------------------------------------------------------------------

function makeRecordingBridge() {
  const calls = [];
  return {
    calls,
    bridge: {
      isConnected: true,
      // Production signature (see mcp/build/agent-bridge.js sendAgentScopedBridgeMessage):
      //   bridge.sendAndWait({ type, payload }, sendOptions)
      // The envelope's `type` is the MCP message kind ('mcp:execute-action'),
      // and `payload` is the merged base + agent scope (agentId, sidecar, ...).
      sendAndWait: async (envelope, _sendOptions) => {
        calls.push(envelope);
        const payload = envelope && envelope.payload;
        return { success: true, tool: payload && payload.tool };
      }
    }
  };
}

function makeRecordingQueue() {
  const calls = [];
  return {
    calls,
    queue: {
      enqueue: async (name, fn) => {
        calls.push(name);
        return await fn();
      }
    }
  };
}

function makeStubAgentScope() {
  return {
    ensure: async () => 'agent-test',
    ownershipTokenFor: () => null,
    currentOwnershipToken: () => null,
    currentConnectionId: () => null,
    captureOwnershipToken: () => {},
    reset: () => {}
  };
}

function makeRecordingServer() {
  const tools = new Map();
  return {
    tools,
    server: {
      tool: (name, _desc, _zod, handler) => {
        tools.set(name, handler);
      }
    }
  };
}

async function runImplicitDispatcherValidationCase() {
  console.log('\n--- Case 3: implicit dispatcher validation -- VISUAL_FIELDS_REQUIRED + BADGE_NOT_ALLOWED ---');

  const BUILD_PATH = path.resolve(__dirname, '..', 'mcp', 'build', 'tools', 'manual.js');
  const SRC_PATH = path.resolve(__dirname, '..', 'mcp', 'src', 'tools', 'manual.ts');
  if (!fs.existsSync(BUILD_PATH)) {
    console.error('  FAIL: mcp/build/tools/manual.js missing -- run `npm --prefix mcp run build` before this test');
    failed++;
    return;
  }
  // Staleness guard: a build older than the source has caused phantom "contract
  // hole" failures (build predates validateVisualSessionFields). Fail loud with
  // remediation rather than running stale code.
  if (fs.existsSync(SRC_PATH) && fs.statSync(SRC_PATH).mtimeMs > fs.statSync(BUILD_PATH).mtimeMs) {
    console.error('  FAIL: mcp/build/tools/manual.js is older than mcp/src/tools/manual.ts -- run `npm --prefix mcp run build` to refresh');
    failed++;
    return;
  }

  const manualModule = await import(BUILD_PATH);
  const recordingServer = makeRecordingServer();
  const mockBridge = makeRecordingBridge();
  const mockQueue = makeRecordingQueue();
  const mockAgentScope = makeStubAgentScope();

  manualModule.registerManualTools(
    recordingServer.server,
    mockBridge.bridge,
    mockQueue.queue,
    mockAgentScope,
  );

  assert(recordingServer.tools.has('click'), 'registerManualTools registers the click handler');
  const clickHandler = recordingServer.tools.get('click');

  // Sub-case A: missing visual_reason AND client -- VISUAL_FIELDS_REQUIRED.
  mockBridge.calls.length = 0;
  mockQueue.calls.length = 0;
  const resA = await clickHandler({ selector: '#submit' });
  assertEqual(resA.isError, true, '3.A click without visual_reason+client returns isError: true');
  assertEqual(mockBridge.calls.length, 0, '3.A no bridge.sendAndWait call on missing visual_reason+client');
  assertEqual(mockQueue.calls.length, 0, '3.A no queue.enqueue call on missing visual_reason+client');
  assert(typeof resA.content[0].text === 'string', '3.A rejection envelope has a text body');
  assert(resA.content[0].text.toLowerCase().includes('visual'), '3.A rejection envelope mentions visual (VISUAL_FIELDS_REQUIRED routing)');

  // Sub-case B: visual_reason present, client missing -- VISUAL_FIELDS_REQUIRED.
  mockBridge.calls.length = 0;
  mockQueue.calls.length = 0;
  const resB = await clickHandler({ selector: '#submit', visual_reason: 'Submitting form' });
  assertEqual(resB.isError, true, '3.B click with visual_reason but no client returns isError: true');
  assertEqual(mockBridge.calls.length, 0, '3.B no bridge call on missing client');
  assertEqual(mockQueue.calls.length, 0, '3.B no queue call on missing client');
  assert(resB.content[0].text.toLowerCase().includes('visual'), '3.B rejection envelope mentions visual (VISUAL_FIELDS_REQUIRED routing)');

  // Sub-case C: empty-string visual_reason -- VISUAL_FIELDS_REQUIRED.
  mockBridge.calls.length = 0;
  mockQueue.calls.length = 0;
  const resC = await clickHandler({ selector: '#submit', visual_reason: '', client: 'Claude' });
  assertEqual(resC.isError, true, '3.C click with empty visual_reason returns isError: true');
  assertEqual(mockBridge.calls.length, 0, '3.C no bridge call on empty visual_reason');
  assertEqual(mockQueue.calls.length, 0, '3.C no queue call on empty visual_reason');

  // Sub-case D: non-allowlisted client -- BADGE_NOT_ALLOWED.
  mockBridge.calls.length = 0;
  mockQueue.calls.length = 0;
  const resD = await clickHandler({
    selector: '#submit',
    visual_reason: 'Submitting form',
    client: 'NotARealClient',
  });
  assertEqual(resD.isError, true, '3.D click with non-allowlisted client returns isError: true');
  assertEqual(mockBridge.calls.length, 0, '3.D no bridge call on non-allowlisted client (BADGE_NOT_ALLOWED)');
  assertEqual(mockQueue.calls.length, 0, '3.D no queue call on non-allowlisted client');
  assert(resD.content[0].text.includes('NotARealClient'), '3.D rejection envelope echoes offending client label (BADGE_NOT_ALLOWED routing)');

  // Sub-case E: valid call -- proceeds to bridge + queue with sidecar.
  mockBridge.calls.length = 0;
  mockQueue.calls.length = 0;
  const resE = await clickHandler({
    selector: '#submit',
    visual_reason: 'Submitting form',
    client: 'Claude',
  });
  assert(resE.isError !== true, '3.E valid click does NOT set isError');
  assertEqual(mockBridge.calls.length, 1, '3.E valid click triggers exactly one bridge.sendAndWait call');
  assertEqual(mockQueue.calls.length, 1, '3.E valid click triggers exactly one queue.enqueue call');
  assertEqual(mockQueue.calls[0], 'click', '3.E queue.enqueue called under the tool name click');

  // Sidecar contract: the bridge payload carries visualSession at top level,
  // and the visual fields are stripped from the action params.
  const bridgeCall = mockBridge.calls[0];
  assertEqual(bridgeCall.type, 'mcp:execute-action', '3.E bridge.sendAndWait called with type mcp:execute-action');
  assert(bridgeCall.payload && bridgeCall.payload.visualSession, '3.E bridge payload carries the visualSession sidecar at top level');
  assertEqual(bridgeCall.payload.visualSession.visualReason, 'Submitting form', '3.E sidecar.visualReason matches caller input');
  assertEqual(bridgeCall.payload.visualSession.client, 'Claude', '3.E sidecar.client is the canonical allowlist label');
  assertEqual(bridgeCall.payload.visualSession.isFinal, false, '3.E sidecar.isFinal defaults to false when omitted');
  assert(bridgeCall.payload.params, '3.E bridge payload has an action-params block');
  assertEqual(bridgeCall.payload.params.visual_reason, undefined, '3.E visual_reason stripped from forwarded action params');
  assertEqual(bridgeCall.payload.params.client, undefined, '3.E client stripped from forwarded action params');
  assertEqual(bridgeCall.payload.params.is_final, undefined, '3.E is_final stripped from forwarded action params');

  // Sub-case F: is_final: true accepted (validator passes; Phase 257 wires semantics).
  mockBridge.calls.length = 0;
  mockQueue.calls.length = 0;
  const resF = await clickHandler({
    selector: '#submit',
    visual_reason: 'Final action of the task',
    client: 'Claude',
    is_final: true,
  });
  assert(resF.isError !== true, '3.F click with is_final: true is accepted by the validator');
  assertEqual(mockBridge.calls.length, 1, '3.F valid is_final call proceeds to bridge');
  const finalBridgeCall = mockBridge.calls[0];
  assertEqual(finalBridgeCall.payload.visualSession.isFinal, true, '3.F sidecar.isFinal forwarded as true');
}

// ------------------------------------------------------------------
// Case 4: ownership precedence -- cross-agent recordVisualSessionTick
// rejection at the lifecycle layer (defense-in-depth dual of the
// v0.9.60 dispatcher-level TAB_NOT_OWNED gate). DOWNSCOPED per plan's
// "if the dispatcher seam requires excessive boilerplate" clause:
// _handleExecuteAction depends on resolveAgentTabOrError,
// dispatchMcpToolRoute, wrapWithChangeReport, and a live AgentRegistry
// instance -- harnessing those for a unit test would multiply the
// surface area. The lifecycle module's recordVisualSessionTick is the
// SECOND layer of the dual-layer defense (extension/utils/mcp-visual-
// session-lifecycle.js lines 343-349) -- the OWN unit test for the
// FIRST layer lives in extension/ws/mcp-bridge-client.js's caller
// (resolveAgentTabOrError test fixtures); this test locks the second
// layer that protects state if a future caller-bypass surface emerges.
// ------------------------------------------------------------------

async function runOwnershipPrecedenceCase() {
  console.log('\n--- Case 4: ownership precedence -- cross-agent lifecycle tick rejected (defense-in-depth) ---');

  const LIFECYCLE_MODULE_PATH = require.resolve('../extension/utils/mcp-visual-session-lifecycle.js');

  const chromeMock = createPersistenceChromeMock();
  const broadcasts = [];
  const priorChrome = global.chrome;
  const priorUtils = global.MCPVisualSessionUtils;
  const priorSender = global.sendSessionStatus;

  global.chrome = chromeMock;
  global.MCPVisualSessionUtils = visualSessionUtils;
  global.sendSessionStatus = async (tabId, statusData) => {
    broadcasts.push({ tabId, statusData });
  };
  delete require.cache[LIFECYCLE_MODULE_PATH];
  const lc = require(LIFECYCLE_MODULE_PATH);

  try {
    // Agent A claims tab 300 with a valid visual-session bundle.
    const firstTick = await lc.recordVisualSessionTick(300, 'agent_A', {
      visualReason: 'Logging in',
      client: 'Claude',
      isFinal: false,
    });
    assert(firstTick && firstTick.ok === true, '4.1 agent A first tick on tab 300 returns ok=true');
    assertEqual(firstTick.action, 'created', '4.2 agent A first tick creates the lifecycle entry');

    const beforeIntruder = (await chromeMock.storage.session.get(['mcpVisualSession:300']))['mcpVisualSession:300'];
    assertEqual(beforeIntruder.agentId, 'agent_A', '4.3 storage entry agentId is agent_A pre-intrusion');
    assertEqual(beforeIntruder.client, 'Claude', '4.4 storage entry client is Claude pre-intrusion');
    assertEqual(beforeIntruder.visualReason, 'Logging in', '4.5 storage entry visualReason is the original pre-intrusion');

    // Reset broadcasts so we can detect whether the intruder triggered any.
    broadcasts.length = 0;

    // Agent B (different agentId) attempts an action on the SAME tab with a
    // valid bundle. The lifecycle layer must reject before mutating state.
    // This is the defense-in-depth assertion: the v0.9.60 TAB_NOT_OWNED gate
    // in extension/ws/mcp-bridge-client.js _handleExecuteAction is the
    // primary gate (rejects BEFORE reaching this code path); the lifecycle
    // layer here is the second layer that prevents state mutation if a
    // future caller-bypass surface emerges.
    const intruder = await lc.recordVisualSessionTick(300, 'agent_B', {
      visualReason: 'Hijack attempt',
      client: 'Codex',
      isFinal: false,
    });

    assert(intruder && intruder.ok === false, '4.6 cross-agent tick on owned tab returns ok=false');
    assertEqual(intruder.reason, 'agent_mismatch', '4.7 cross-agent tick reason is agent_mismatch (TAB_NOT_OWNED dual at lifecycle layer)');

    // Storage entry MUST be untouched: agentId unchanged, visualReason
    // unchanged, client unchanged. No bump of lastTickAt; no version rotation.
    const afterIntruder = (await chromeMock.storage.session.get(['mcpVisualSession:300']))['mcpVisualSession:300'];
    assertEqual(afterIntruder.agentId, 'agent_A', '4.8 storage entry agentId still agent_A post-intrusion');
    assertEqual(afterIntruder.client, 'Claude', '4.9 storage entry client still Claude post-intrusion');
    assertEqual(afterIntruder.visualReason, 'Logging in', '4.10 storage entry visualReason still the original post-intrusion');
    assertEqual(afterIntruder.lastTickAt, beforeIntruder.lastTickAt, '4.11 storage entry lastTickAt NOT advanced by intruder');
    assertEqual(afterIntruder.deadlineAt, beforeIntruder.deadlineAt, '4.12 storage entry deadlineAt NOT advanced by intruder');

    // No broadcast for the rejected intruder tick (the lifecycle module's
    // broadcastRunningStatus only fires on the success path).
    assertEqual(broadcasts.length, 0, '4.13 no overlay broadcast for the rejected cross-agent tick');

    // Agent A can still record a follow-up tick on its own tab (the rejection
    // did not silently lock the entry).
    await new Promise((resolve) => setTimeout(resolve, 5));
    const followup = await lc.recordVisualSessionTick(300, 'agent_A', {
      visualReason: 'Clicking submit',
      client: 'Claude',
      isFinal: false,
    });
    assert(followup && followup.ok === true, '4.14 agent A follow-up tick after intrusion still succeeds');
    assertEqual(followup.action, 'updated', '4.15 agent A follow-up tick is an update, not a fresh create');
    const afterFollowup = (await chromeMock.storage.session.get(['mcpVisualSession:300']))['mcpVisualSession:300'];
    assertEqual(afterFollowup.visualReason, 'Clicking submit', '4.16 agent A follow-up tick updates the visualReason');
    assert(afterFollowup.lastTickAt > beforeIntruder.lastTickAt, '4.17 agent A follow-up tick advances lastTickAt (sliding re-arm works)');
  } finally {
    if (priorChrome === undefined) delete global.chrome; else global.chrome = priorChrome;
    if (priorUtils === undefined) delete global.MCPVisualSessionUtils; else global.MCPVisualSessionUtils = priorUtils;
    if (priorSender === undefined) delete global.sendSessionStatus; else global.sendSessionStatus = priorSender;
  }
}

// ------------------------------------------------------------------
// Case 5: TOOL_REMOVED -- both removed tool names return the typed
// error envelope with the migration recipe pointer (CHANGELOG anchor
// + README anchor); no bridge call, no queue call.
// ------------------------------------------------------------------

async function runToolRemovedCase() {
  console.log('\n--- Case 5: TOOL_REMOVED for start_visual_session and end_visual_session ---');

  const BUILD_PATH = path.resolve(__dirname, '..', 'mcp', 'build', 'tools', 'visual-session.js');
  if (!fs.existsSync(BUILD_PATH)) {
    console.error('  FAIL: mcp/build/tools/visual-session.js missing -- run `cd mcp && npm run build` before this test');
    failed++;
    return;
  }

  const visualSessionModule = await import(BUILD_PATH);
  const recordingServer = makeRecordingServer();
  const mockBridge = makeRecordingBridge();
  const mockQueue = makeRecordingQueue();
  const mockAgentScope = makeStubAgentScope();

  visualSessionModule.registerVisualSessionTools(
    recordingServer.server,
    mockBridge.bridge,
    mockQueue.queue,
    mockAgentScope,
  );

  // Both removed tools must be registered (so the MCP tools/list surface
  // still advertises them with the [REMOVED in v0.9.0] banner).
  assert(recordingServer.tools.has('start_visual_session'), '5.0a start_visual_session handler registered (stub for tools/list visibility)');
  assert(recordingServer.tools.has('end_visual_session'), '5.0b end_visual_session handler registered (stub for tools/list visibility)');

  // Sub-case A: start_visual_session returns TOOL_REMOVED with migration recipe.
  mockBridge.calls.length = 0;
  mockQueue.calls.length = 0;
  const startHandler = recordingServer.tools.get('start_visual_session');
  const startRes = await startHandler({
    client: 'Claude',
    task: 'Drive checkout',
    detail: 'should be ignored',
  });
  assertEqual(startRes.isError, true, '5.A start_visual_session returns isError: true');
  assertEqual(mockBridge.calls.length, 0, '5.A no bridge.sendAndWait call on removed tool');
  assertEqual(mockQueue.calls.length, 0, '5.A no queue.enqueue call on removed tool');
  assert(typeof startRes.content[0].text === 'string', '5.A response has a text body');

  const startText = startRes.content[0].text;
  assert(startText.includes('start_visual_session'), '5.A response body names the removed tool start_visual_session');
  assert(startText.includes('0.9.0'), '5.A response body cites the removed_in_version 0.9.0');
  assert(startText.includes('visual_reason'), '5.A migration recipe references visual_reason field');
  assert(startText.includes('client'), '5.A migration recipe references client field');
  assert(startText.includes('is_final'), '5.A migration recipe references is_final field');
  // The TOOL_REMOVED migration recipe in mcp/src/errors.ts cites CHANGELOG.md
  // and mcp/README.md as the migration recipe anchors.
  assert(startText.includes('CHANGELOG'), '5.A response references CHANGELOG anchor');
  assert(startText.includes('README'), '5.A response references README anchor');

  // Sub-case B: end_visual_session returns TOOL_REMOVED with migration recipe.
  mockBridge.calls.length = 0;
  mockQueue.calls.length = 0;
  const endHandler = recordingServer.tools.get('end_visual_session');
  const endRes = await endHandler({
    session_token: 'visual_token_irrelevant',
    reason: 'ended',
  });
  assertEqual(endRes.isError, true, '5.B end_visual_session returns isError: true');
  assertEqual(mockBridge.calls.length, 0, '5.B no bridge.sendAndWait call on removed tool');
  assertEqual(mockQueue.calls.length, 0, '5.B no queue.enqueue call on removed tool');
  const endText = endRes.content[0].text;
  assert(endText.includes('end_visual_session'), '5.B response body names the removed tool end_visual_session');
  assert(endText.includes('0.9.0'), '5.B response body cites the removed_in_version 0.9.0');
  assert(endText.includes('visual_reason'), '5.B migration recipe references visual_reason field');
  assert(endText.includes('client'), '5.B migration recipe references client field');
  assert(endText.includes('is_final'), '5.B migration recipe references is_final field');
  assert(endText.includes('CHANGELOG'), '5.B response references CHANGELOG anchor');
  assert(endText.includes('README'), '5.B response references README anchor');

  // Both responses must route through the same TOOL_REMOVED layered detail
  // (rather than a generic "tool not found" surface). Loose match: the
  // response carries the "Visual session contract" layer label.
  assert(startText.includes('Visual session contract'), '5.A response detected layer is Visual session contract');
  assert(endText.includes('Visual session contract'), '5.B response detected layer is Visual session contract');
}

// ------------------------------------------------------------------
// Driver
// ------------------------------------------------------------------

(async () => {
  await runAllowlistAndManagerCase();
  await runPersistenceReplayCase();
  await runImplicitDispatcherValidationCase();
  await runOwnershipPrecedenceCase();
  await runToolRemovedCase();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  failed++;
  console.error('FATAL:', err && err.stack ? err.stack : err);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
