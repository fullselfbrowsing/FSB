'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const replayHelpers = require('../extension/utils/lattice-replay.js');
const trustedStoreApi = require('../extension/utils/trusted-local-feature-store.js');

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log('PASS', label);
}

function fakeIndexedDb() {
  const databases = new Map();
  function requestFrom(run) {
    const request = {};
    queueMicrotask(() => {
      try {
        request.result = run();
        if (typeof request.onsuccess === 'function') request.onsuccess();
      } catch (error) {
        request.error = error;
        if (typeof request.onerror === 'function') request.onerror();
      }
    });
    return request;
  }
  return {
    databases,
    open(name) {
      const request = {};
      queueMicrotask(() => {
        const isNew = !databases.has(name);
        if (isNew) databases.set(name, { stores: new Map() });
        const state = databases.get(name);
        const db = {
          objectStoreNames: {
            contains(storeName) { return state.stores.has(storeName); }
          },
          createObjectStore(storeName) {
            if (!state.stores.has(storeName)) state.stores.set(storeName, new Map());
            return {};
          },
          transaction(storeName) {
            if (!state.stores.has(storeName)) throw new Error('Missing store ' + storeName);
            const store = state.stores.get(storeName);
            return {
              objectStore() {
                return {
                  get(key) {
                    return requestFrom(() => {
                      const value = store.get(key);
                      return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
                    });
                  },
                  put(value) {
                    return requestFrom(() => {
                      store.set(value.id, JSON.parse(JSON.stringify(value)));
                      return value.id;
                    });
                  }
                };
              }
            };
          },
          close() {}
        };
        request.result = db;
        if (isNew && typeof request.onupgradeneeded === 'function') request.onupgradeneeded();
        if (typeof request.onsuccess === 'function') request.onsuccess();
      });
      return request;
    }
  };
}

function createChromeHarness() {
  const listeners = [];
  return {
    listeners,
    chrome: {
      runtime: {
        id: 'fsb-replay-test-extension',
        onMessage: {
          addListener(listener) { listeners.push(listener); },
          removeListener(listener) {
            const index = listeners.indexOf(listener);
            if (index >= 0) listeners.splice(index, 1);
          }
        },
        sendMessage() { return Promise.resolve({ ok: true }); }
      }
    },
    dispatch(type, payload) {
      return new Promise((resolve, reject) => {
        let handled = false;
        const timeout = setTimeout(() => reject(new Error('Timed out dispatching ' + type)), 3000);
        for (const listener of listeners.slice()) {
          const keepOpen = listener(
            { type, payload },
            { id: 'fsb-replay-test-extension' },
            (response) => {
              clearTimeout(timeout);
              resolve(response);
            }
          );
          if (keepOpen === true) handled = true;
        }
        if (!handled) {
          clearTimeout(timeout);
          resolve(undefined);
        }
      });
    }
  };
}

function manifest() {
  return {
    kind: 'fsb-browser-replay-manifest',
    version: 1,
    provenance: 'capture',
    sessionId: 'session_replay_test',
    task: 'Replay the recorded browser work',
    recordedAt: 1785500000000,
    source: { mode: 'mcp-agent', client: 'Codex' },
    startUrl: 'https://example.com/start',
    startOrigin: 'https://example.com',
    outcome: { status: 'stopped', outcome: 'stopped', reason: 'idle_timeout' },
    steps: [{
      id: 'step-1',
      index: 0,
      timestamp: 1785500000000,
      tool: 'click',
      route: 'content',
      arguments: { selector: '#continue' },
      result: { success: true, clicked: true, tabId: 7, timestamp: '2026-07-31T00:00:00.000Z' },
      success: true,
      target: { logicalTab: 'primary', url: 'https://example.com/start', origin: 'https://example.com' },
      replay: { risk: 'write', availability: 'approval-once', reason: 'Browser interaction may repeat a side effect' }
    }]
  };
}

function createTrustedSessionStore() {
  const values = {};
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const local = {
    async get(keys) {
      const selected = {};
      for (const key of (Array.isArray(keys) ? keys : [keys])) {
        if (Object.prototype.hasOwnProperty.call(values, key)) selected[key] = copy(values[key]);
      }
      return selected;
    },
    async set(update) { Object.assign(values, copy(update)); },
    async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete values[key]; }
  };
  const store = trustedStoreApi.create({
    chrome: { runtime: { id: 'fsb-replay-test-extension' }, storage: { local } }
  });
  return { store, values, local };
}

// The replay module reads sessions straight from chrome.storage.local and
// asks the offscreen host over runtime messages, as it does in the worker.
async function withReplayRuntime(local, harness, work) {
  const previous = globalThis.chrome;
  globalThis.chrome = {
    runtime: {
      id: 'fsb-replay-test-extension',
      sendMessage(message) { return harness.dispatch(message.type, message.payload); }
    },
    storage: { local }
  };
  try {
    return await work();
  } finally {
    globalThis.chrome = previous;
  }
}

function loadLoggerWithStore(store) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'utils', 'automation-logger.js'), 'utf8');
  const context = vm.createContext({
    chrome: { runtime: { id: 'fsb-replay-test-extension' } },
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
    URL,
    Blob,
    TextEncoder,
    fsbTrustedLocalFeatureStore: store
  });
  context.globalThis = context;
  vm.runInContext(source, context, { filename: 'automation-logger.js' });
  return context.automationLogger;
}

async function loadHost(harness, nonce) {
  globalThis.chrome = harness.chrome;
  const hostPath = path.join(__dirname, '..', 'extension', 'offscreen', 'lattice-host.js');
  await import(pathToFileURL(hostPath).href + '?replay-test=' + nonce);
}

async function main() {
  console.log('--- Lattice-backed session replay ---');
  const lattice = await import('lattice');
  if (!globalThis.crypto) {
    Object.defineProperty(globalThis, 'crypto', {
      value: require('node:crypto').webcrypto,
      configurable: true
    });
  }
  const idb = fakeIndexedDb();
  globalThis.indexedDB = idb;

  const captured = replayHelpers.createReplayRecord({
    sessionId: 'session_manifest_test',
    task: 'Capability-only capture',
    startUrl: 'https://example.com/start',
    endTime: 1785500000000,
    status: 'stopped',
    outcome: 'stopped',
    outcomeDetails: { reason: 'idle_timeout' }
  }, [{
    tool: 'mcp:capabilities-invoke',
    requestPayload: {
      agentId: 'agent-secret-free',
      slug: 'github.get_repository',
      params: { owner: 'fullselfbrowsing', repo: 'FSB' },
      origin: 'https://example.com'
    },
    response: { success: true, repository: 'FSB' },
    success: true,
    dispatcher_route: 'message',
    replayContext: {
      targetUrl: 'https://example.com/start',
      targetOrigin: 'https://example.com',
      routeFamily: 'capabilities',
      slug: 'github.get_repository',
      sideEffectClass: 'read',
      service: 'GitHub',
      tier: 'T1a'
    }
  }, {
    tool: 'click',
    requestPayload: { params: { selector: '#save' } },
    response: { success: true },
    success: true,
    replayContext: { targetUrl: 'https://example.com/start', targetOrigin: 'https://example.com', routeFamily: 'content' }
  }, {
    tool: 'execute_js',
    requestPayload: { params: { code: 'document.title' } },
    response: { success: true },
    success: true,
    replayContext: { targetUrl: 'https://example.com/start', targetOrigin: 'https://example.com', routeFamily: 'background' }
  }, {
    tool: 'type_text',
    requestPayload: { params: { selector: '#password', text: '[REDACTED]' } },
    response: { success: true },
    success: true,
    replayContext: { targetUrl: 'https://example.com/start', targetOrigin: 'https://example.com', routeFamily: 'content' }
  }, {
    tool: 'mcp:future-route',
    requestPayload: { query: 'inspect me' },
    response: { success: false, errorCode: 'mcp_route_unavailable' },
    success: false,
    dispatcher_route: 'unsupported-message',
    replayContext: { targetUrl: 'https://example.com/start', targetOrigin: 'https://example.com', routeFamily: 'unsupported' }
  }], 'capture');
  check('manifest preserves capability slug, params, origin, route, and side-effect class', () => {
    const capability = captured.manifest.steps[0];
    assert.equal(capability.tool, 'mcp:capabilities-invoke');
    assert.equal(capability.route, 'capabilities');
    assert.equal(capability.arguments.slug, 'github.get_repository');
    assert.deepEqual(capability.arguments.params, { owner: 'fullselfbrowsing', repo: 'FSB' });
    assert.equal(capability.arguments.origin, 'https://example.com');
    assert.equal(capability.capability.sideEffectClass, 'read');
    assert.equal(capability.replay.risk, 'read');
  });
  check('risk classification keeps writes gated and failed, redacted, or unknown calls inspect-only', () => {
    assert.equal(captured.manifest.steps[1].replay.availability, 'approval-once');
    assert.equal(captured.manifest.steps[2].replay.availability, 'approval-per-step');
    assert.equal(captured.manifest.steps[3].replay.availability, 'needs-input');
    assert.equal(captured.manifest.steps[4].replay.availability, 'unsupported');
    assert.deepEqual(captured.counts, { total: 5, executable: 3, approvalRequired: 2, blocked: 2 });
  });
  const multiTabCapture = replayHelpers.createReplayRecord({
    sessionId: 'session_multitab_manifest',
    task: 'Research across several tabs',
    endTime: 1785500000000,
    status: 'completed'
  }, [{
    tool: 'navigate',
    requestPayload: { params: { url: 'https://example.com/primary' } },
    response: { success: true },
    success: true,
    replayContext: {
      logicalTab: 'primary',
      targetUrl: 'https://example.com/primary',
      targetOrigin: 'https://example.com',
      routeFamily: 'background'
    }
  }, {
    tool: 'open_tab',
    requestPayload: { params: { url: 'https://docs.example.net/reference' } },
    response: { success: true },
    success: true,
    replayContext: {
      logicalTab: 'tab-2',
      targetUrl: 'https://docs.example.net/reference',
      targetOrigin: 'https://docs.example.net',
      routeFamily: 'background'
    }
  }, {
    tool: 'click',
    requestPayload: { params: { selector: '#missing-start' } },
    response: { success: true },
    success: true,
    replayContext: { logicalTab: 'tab-3', routeFamily: 'content' }
  }], 'capture');
  check('one manifest preserves ordered logical tabs and blocks only a tab missing its start URL', () => {
    assert.deepEqual(multiTabCapture.manifest.tabs.map((tab) => tab.id), ['primary', 'tab-2', 'tab-3']);
    assert.deepEqual(
      multiTabCapture.manifest.tabs.map((tab) => tab.startUrlState),
      ['ready', 'ready', 'missing']
    );
    assert.equal(multiTabCapture.manifest.steps[0].target.logicalTab, 'primary');
    assert.equal(multiTabCapture.manifest.steps[1].target.logicalTab, 'tab-2');
    assert.equal(multiTabCapture.manifest.steps[1].replay.availability, 'ready');
    assert.equal(multiTabCapture.manifest.steps[2].replay.availability, 'needs-input');
    assert.deepEqual(multiTabCapture.counts, {
      total: 3,
      executable: 2,
      approvalRequired: 0,
      blocked: 1
    });
  });
  const secondaryBootstrapCapture = replayHelpers.createReplayRecord({
    sessionId: 'session_secondary_bootstrap',
    task: 'Continue from a later tab',
    endTime: 1785500000000,
    status: 'completed'
  }, [{
    tool: 'click',
    requestPayload: { params: { selector: '#unknown-primary' } },
    response: { success: true },
    success: true,
    replayContext: { logicalTab: 'primary', routeFamily: 'content' }
  }, {
    tool: 'navigate',
    requestPayload: { params: { url: 'https://docs.example.net/continue' } },
    response: { success: true },
    success: true,
    replayContext: {
      logicalTab: 'tab-2',
      targetUrl: 'https://docs.example.net/continue',
      targetOrigin: 'https://docs.example.net',
      routeFamily: 'background'
    }
  }], 'capture');
  check('a later tab URL is never borrowed as the primary tab start URL', () => {
    assert.equal(secondaryBootstrapCapture.manifest.startUrl, null);
    assert.equal(secondaryBootstrapCapture.manifest.startUrlState, 'missing');
    assert.deepEqual(
      secondaryBootstrapCapture.manifest.tabs.map((tab) => [tab.id, tab.startUrlState]),
      [['primary', 'missing'], ['tab-2', 'ready']]
    );
    assert.equal(secondaryBootstrapCapture.manifest.steps[0].replay.availability, 'needs-input');
    assert.equal(secondaryBootstrapCapture.manifest.steps[1].replay.availability, 'ready');
  });
  check('classification validation rejects a signed step that understates its risk', () => {
    const tamperedStep = JSON.parse(JSON.stringify(captured.manifest.steps[1]));
    tamperedStep.replay = { risk: 'read', availability: 'ready', reason: null };
    assert.throws(
      () => replayHelpers.validateReplayClassifications([tamperedStep]),
      /classification failed closed/i
    );
  });
  const redactedCapture = replayHelpers.createReplayRecord({
    sessionId: 'session_manifest_redaction',
    task: 'Use password=task-secret without retaining it',
    startUrl: 'https://alice:password@example.com/callback?code=oauth-secret&view=summary',
    endTime: 1785500000000,
    status: 'stopped'
  }, [{
    tool: 'type_text',
    requestPayload: { params: { selector: 'input[type="password"]', text: 'manifest-secret' } },
    response: { success: true, value: 'manifest-secret' },
    success: true,
    replayContext: {
      targetUrl: 'https://alice:password@example.com/callback?code=oauth-secret&view=summary',
      targetOrigin: 'https://example.com',
      routeFamily: 'content'
    }
  }], 'capture');
  check('manifest construction redacts before sealing and blocks missing sensitive input', () => {
    const serialized = JSON.stringify(redactedCapture);
    assert.equal(serialized.includes('manifest-secret'), false);
    assert.equal(serialized.includes('task-secret'), false);
    assert.equal(serialized.includes('oauth-secret'), false);
    assert.equal(serialized.includes('alice:password'), false);
    assert.equal(redactedCapture.manifest.startUrl, 'https://example.com/callback?view=summary');
    assert.equal(redactedCapture.manifest.startUrlState, 'redacted');
    assert.equal(redactedCapture.manifest.steps[0].arguments.text, '[REDACTED]');
    assert.equal(redactedCapture.manifest.steps[0].replay.availability, 'needs-input');
    assert.deepEqual(redactedCapture.counts, { total: 1, executable: 0, approvalRequired: 0, blocked: 1 });
  });
  const imported = replayHelpers.createLegacyReplayRecord({
    id: 'legacy_1',
    task: 'Old session',
    status: 'expired',
    lastUrl: 'https://example.com/legacy',
    actionHistory: [{ tool: 'click', params: { selector: '#old' }, result: { success: true }, timestamp: 1 }]
  });
  check('legacy sessions import lazily without claiming capture-time attestation', () => {
    assert.equal(imported.provenance, 'legacy-import');
    assert.equal(imported.manifest.provenance, 'legacy-import');
    assert.equal(imported.integrity, 'pending');
    assert.equal(imported.manifest.outcome.status, 'expired');
    assert.equal(imported.manifest.steps.length, 1);
  });
  const missingStart = replayHelpers.createLegacyReplayRecord({
    id: 'legacy_missing_start',
    task: 'Inspectable old session',
    status: 'expired',
    actionHistory: [{ tool: 'click', params: { selector: '#old' }, result: { success: true }, timestamp: 1 }]
  });
  check('legacy calls without a safe starting artifact remain inspectable but non-executable', () => {
    assert.equal(missingStart.manifest.startUrl, null);
    assert.equal(missingStart.manifest.startUrlState, 'missing');
    assert.equal(missingStart.manifest.steps[0].replay.availability, 'needs-input');
    assert.equal(missingStart.counts.executable, 0);
  });
  check('live replay never uses Lattice rerunLive', () => {
    const background = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
    const host = fs.readFileSync(path.join(__dirname, '..', 'extension', 'offscreen', 'lattice-host.js'), 'utf8');
    assert.equal(/\brerunLive\b/.test(background + host), false);
  });

  const first = createChromeHarness();
  await loadHost(first, 'first');
  const sealed = await first.dispatch('lattice-replay-seal', { manifest: manifest(), provenance: 'capture' });
  check('capture manifest seals with a persistent signer', () => {
    assert.equal(sealed.ok, true);
    assert.match(sealed.signerKid, /^fsb-replay-/);
    assert.equal(typeof sealed.receiptCid, 'string');
    assert.equal(sealed.manifest.steps[0].argumentHash.length, 64);
    assert.equal(sealed.manifest.steps[0].resultHash.length, 64);
    assert.equal(Object.prototype.hasOwnProperty.call(sealed.manifest.steps[0], 'result'), false);
    assert.equal(sealed.manifest.steps[0].resultHashVersion, 'fsb-normalized-result/v1');
  });
  check('private key material never enters the host response', () => {
    const serialized = JSON.stringify(sealed);
    assert.equal(serialized.includes('privateKeyJwk'), false);
    assert.equal(serialized.includes('publicKeyJwk'), false);
  });

  const materialized = await first.dispatch('lattice-replay-materialize', {
    manifest: sealed.manifest,
    manifestHash: sealed.manifestHash,
    receipt: sealed.receipt,
    signerKid: sealed.signerKid
  });
  check('materialization verifies first and replays offline', () => {
    assert.equal(materialized.ok, true);
    assert.equal(materialized.verified, true);
    assert.equal(materialized.offline.ok, true);
    assert.equal(materialized.offline.manifestHash, sealed.manifestHash);
  });

  const second = createChromeHarness();
  await loadHost(second, 'second');
  const afterRecreation = await second.dispatch('lattice-replay-materialize', {
    manifest: sealed.manifest,
    manifestHash: sealed.manifestHash,
    receipt: sealed.receipt,
    signerKid: sealed.signerKid
  });
  check('receipt verification survives offscreen recreation', () => {
    assert.equal(afterRecreation.ok, true);
    assert.equal(afterRecreation.receiptCid, sealed.receiptCid);
  });

  const resealed = await second.dispatch('lattice-replay-seal', { manifest: manifest(), provenance: 'capture' });
  check('offscreen recreation reuses the exact IndexedDB key id', () => {
    assert.equal(resealed.signerKid, sealed.signerKid);
    const records = idb.databases.get('fsb-lattice-replay').stores.get('signing-keys');
    assert.equal(records.size, 1);
  });

  const tamperedManifest = JSON.parse(JSON.stringify(sealed.manifest));
  tamperedManifest.steps[0].arguments.selector = '#attacker';
  const hashFailure = await second.dispatch('lattice-replay-materialize', {
    manifest: tamperedManifest,
    manifestHash: sealed.manifestHash,
    receipt: sealed.receipt,
    signerKid: sealed.signerKid
  });
  check('manifest tampering fails on the committed hash', () => {
    assert.equal(hashFailure.ok, false);
    assert.match(hashFailure.error.message, /hash mismatch/i);
  });

  const tamperedReceipt = JSON.parse(JSON.stringify(sealed.receipt));
  tamperedReceipt.signatures[0].sig = tamperedReceipt.signatures[0].sig.replace(/^./, (char) => char === 'A' ? 'B' : 'A');
  const signatureFailure = await second.dispatch('lattice-replay-materialize', {
    manifest: sealed.manifest,
    manifestHash: sealed.manifestHash,
    receipt: tamperedReceipt,
    signerKid: sealed.signerKid
  });
  check('receipt tampering fails verification', () => {
    assert.equal(signatureFailure.ok, false);
    assert.equal(signatureFailure.error.kind, 'verify-failed');
  });

  const missingArtifact = await second.dispatch('lattice-replay-materialize', {
    manifest: null,
    manifestHash: sealed.manifestHash,
    receipt: sealed.receipt,
    signerKid: sealed.signerKid
  });
  check('missing manifest artifacts fail closed', () => {
    assert.equal(missingArtifact.ok, false);
    assert.match(missingArtifact.error.message, /manifest is required/i);
  });

  const readVerdict = await second.dispatch('lattice-replay-authorize', {
    step: { id: 'read-1', index: 0, tool: 'read_page', arguments: {}, replay: { risk: 'read', availability: 'ready' } },
    approvedScopes: []
  });
  const writeDenied = await second.dispatch('lattice-replay-authorize', {
    step: { id: 'write-1', index: 1, tool: 'click', arguments: {}, replay: { risk: 'write', availability: 'approval-once' } },
    approvedScopes: []
  });
  const writeAllowed = await second.dispatch('lattice-replay-authorize', {
    step: { id: 'write-1', index: 1, tool: 'click', arguments: {}, replay: { risk: 'write', availability: 'approval-once' } },
    approvedScopes: ['write']
  });
  const destructiveAllowed = await second.dispatch('lattice-replay-authorize', {
    step: { id: 'danger-1', index: 2, tool: 'execute_js', arguments: {}, replay: { risk: 'arbitrary-code', availability: 'approval-per-step' } },
    approvedScopes: ['step:danger-1']
  });
  check('permission context is read-allowing and otherwise fail-closed', () => {
    assert.equal(readVerdict.verdict.allow, true);
    assert.equal(writeDenied.verdict.allow, false);
    assert.equal(writeAllowed.verdict.allow, true);
    assert.equal(destructiveAllowed.verdict.allow, true);
  });

  const checkpoint = await second.dispatch('lattice-replay-checkpoint', {
    replaySessionId: 'replay_live_1',
    manifestHash: sealed.manifestHash,
    sourceReceiptCid: sealed.receiptCid,
    step: sealed.manifest.steps[0],
    result: { success: true, clicked: true, tabId: 99, timestamp: '2026-07-31T01:00:00.000Z' },
    success: true
  });
  const persistedKey = idb.databases.get('fsb-lattice-replay').stores.get('signing-keys').get('active');
  const replayKeySet = lattice.createMemoryKeySet([{
    kid: persistedKey.kid,
    publicKeyJwk: persistedKey.publicKeyJwk,
    state: 'active'
  }]);
  const verifiedCheckpoint = await lattice.verifyReceipt(checkpoint.receipt, replayKeySet);
  check('live-step receipt chains from the capture receipt and hashes the result', () => {
    assert.equal(checkpoint.ok, true);
    assert.equal(checkpoint.resultHash.length, 64);
    assert.equal(checkpoint.resultHash, sealed.manifest.steps[0].resultHash);
    assert.equal(typeof checkpoint.receiptCid, 'string');
    assert.notEqual(checkpoint.receiptCid, sealed.receiptCid);
    assert.equal(verifiedCheckpoint.ok, true);
    assert.equal(verifiedCheckpoint.body.parentReceiptCid, sealed.receiptCid);
  });

  const driftedCheckpoint = await second.dispatch('lattice-replay-checkpoint', {
    replaySessionId: 'replay_live_1',
    manifestHash: sealed.manifestHash,
    sourceReceiptCid: sealed.receiptCid,
    previousReceiptCid: checkpoint.receiptCid,
    step: sealed.manifest.steps[0],
    result: { success: true, clicked: false, tabId: 99, timestamp: '2026-07-31T01:00:01.000Z' },
    success: true
  });
  const verifiedDriftedCheckpoint = await lattice.verifyReceipt(driftedCheckpoint.receipt, replayKeySet);
  check('normalized result hashes ignore runtime identity but detect substantive drift', () => {
    assert.equal(driftedCheckpoint.ok, true);
    assert.notEqual(driftedCheckpoint.resultHash, sealed.manifest.steps[0].resultHash);
    assert.equal(verifiedDriftedCheckpoint.ok, true);
    assert.equal(verifiedDriftedCheckpoint.body.parentReceiptCid, checkpoint.receiptCid);
  });

  // Replay only trusts a stored record whose version is the replay schema
  // version; anything else is rebuilt from the session's action history,
  // which keeps no call arguments. The store and the logger must keep that
  // version intact, or every saved capture is replaced by such a rebuild.
  const versionHistory = createTrustedSessionStore();
  const versionSessionId = 'session_version_round_trip';
  const versionTarget = {
    targetUrl: 'https://example.com/start',
    targetOrigin: 'https://example.com',
    routeFamily: 'content'
  };
  const versionCapture = replayHelpers.createReplayRecord({
    sessionId: versionSessionId,
    task: 'Version round trip',
    startUrl: 'https://example.com/start',
    endTime: Date.now(),
    mode: 'mcp-agent',
    status: 'completed'
  }, [{
    tool: 'navigate',
    requestPayload: { params: { url: 'https://example.com/start' } },
    response: { success: true },
    success: true,
    timestamp: Date.now() - 2000,
    replayContext: Object.assign({}, versionTarget, { routeFamily: 'background' })
  }, {
    tool: 'click',
    requestPayload: { params: { selector: '#continue' } },
    response: { success: true },
    success: true,
    timestamp: Date.now() - 1000,
    replayContext: versionTarget
  }], 'capture');
  await versionHistory.store.saveAutomationSession(versionSessionId, {
    id: versionSessionId,
    task: 'Version round trip',
    mode: 'mcp-agent',
    startTime: Date.now() - 5000,
    endTime: Date.now(),
    status: 'completed',
    logs: [],
    replay: versionCapture
  }, []);
  const storedVersion = (await versionHistory.store.loadAutomationSession(versionSessionId)).session.replay.version;
  const versionLogger = loadLoggerWithStore(versionHistory.store);
  versionLogger.logs = [{
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'capture attached',
    data: { sessionId: versionSessionId }
  }];
  await versionLogger.saveSession(versionSessionId, { status: 'completed', mode: 'mcp-agent', replay: versionCapture });
  const loggerVersion = versionHistory.values.fsbSessionLogs[versionSessionId].replay.version;
  const versionPrepared = await withReplayRuntime(versionHistory.local, second,
    () => replayHelpers.prepareReplay(versionSessionId));
  check('a saved capture keeps its replay schema version and is replayed as captured', () => {
    assert.equal(versionCapture.version, replayHelpers.REPLAY_SCHEMA_VERSION);
    assert.equal(storedVersion, replayHelpers.REPLAY_SCHEMA_VERSION);
    assert.equal(loggerVersion, replayHelpers.REPLAY_SCHEMA_VERSION);
    assert.equal(versionPrepared.verified, true);
    assert.equal(versionPrepared.replay.provenance, 'capture');
    assert.deepEqual(versionPrepared.steps.map((step) => step.arguments),
      versionCapture.manifest.steps.map((step) => step.arguments));
  });

  // A sealed record is written back to storage as sealed, but every later
  // outcome update, load and append-save passes it through the trusted
  // store, and a save that carries a replay record also passes it through
  // the logger. Both must keep a sealed step exactly as sealed, or the
  // committed manifest hash stops matching and the session can no longer be
  // replayed. Sealing reads the stored record, so the sealed manifest already
  // has the store's shape.
  const history = createTrustedSessionStore();
  const roundTripId = 'session_sealed_round_trip';
  const roundTripTarget = {
    targetUrl: 'https://example.com/start',
    targetOrigin: 'https://example.com',
    routeFamily: 'content'
  };
  const roundTripCapture = replayHelpers.createReplayRecord({
    sessionId: roundTripId,
    task: 'Sealed history round trip',
    startUrl: 'https://example.com/start',
    endTime: Date.now(),
    mode: 'mcp-agent',
    status: 'completed'
  }, [{
    tool: 'click',
    requestPayload: { params: { selector: '#continue' } },
    response: { success: true, clicked: true, tabId: 7 },
    success: true,
    timestamp: Date.now() - 2000,
    replayContext: roundTripTarget
  }, {
    tool: 'click',
    requestPayload: { params: { selector: '#missing' } },
    response: { success: false, errorCode: 'element_not_found', error: 'No element matched #missing' },
    success: false,
    timestamp: Date.now() - 1000,
    replayContext: roundTripTarget
  }], 'capture');
  const firstSave = await history.store.saveAutomationSession(roundTripId, {
    id: roundTripId,
    task: 'Sealed history round trip',
    mode: 'mcp-agent',
    startTime: Date.now() - 5000,
    endTime: Date.now(),
    status: 'completed',
    logs: [],
    replay: roundTripCapture
  }, []);
  const pendingReplay = (await history.store.loadAutomationSession(roundTripId)).session.replay;
  const roundTripSeal = await second.dispatch('lattice-replay-seal', {
    manifest: pendingReplay.manifest,
    provenance: pendingReplay.provenance
  });
  const sealedRecord = Object.assign({}, pendingReplay, {
    integrity: 'verified',
    manifest: roundTripSeal.manifest,
    manifestHash: roundTripSeal.manifestHash,
    receipt: roundTripSeal.receipt,
    receiptCid: roundTripSeal.receiptCid,
    signerKid: roundTripSeal.signerKid,
    counts: replayHelpers.replayCounts(roundTripSeal.manifest.steps),
    error: null
  });
  check('a pending record keeps its step results until it is sealed', () => {
    assert.equal(firstSave.ok, true);
    assert.equal(pendingReplay.manifest.steps.every((step) => Object.prototype.hasOwnProperty.call(step, 'result')), true);
    assert.equal(roundTripSeal.ok, true);
    assert.equal(roundTripSeal.manifest.steps[1].resultSummary.errorCode, 'element_not_found');
  });

  history.values.fsbSessionLogs[roundTripId].replay = JSON.parse(JSON.stringify(sealedRecord));
  const outcomeUpdate = await history.store.updateAutomationSessionOutcome(roundTripId, {
    status: 'completed', outcome: 'success', reason: 'completed', summary: 'done', result: 'done',
    completionMessage: 'done', error: '', blocker: '', nextStep: ''
  });
  const afterOutcome = JSON.parse(JSON.stringify(history.values.fsbSessionLogs[roundTripId].replay));
  const loadedSession = (await history.store.loadAutomationSession(roundTripId)).session;
  await history.store.saveAutomationSession(roundTripId, loadedSession, []);
  const afterStoreSave = JSON.parse(JSON.stringify(history.values.fsbSessionLogs[roundTripId].replay));
  check('the trusted store keeps a sealed manifest exactly as sealed', () => {
    assert.equal(outcomeUpdate.ok, true);
    assert.deepEqual(afterOutcome.manifest, sealedRecord.manifest);
    assert.deepEqual(loadedSession.replay.manifest, sealedRecord.manifest);
    assert.deepEqual(afterStoreSave.manifest, sealedRecord.manifest);
    assert.equal(afterStoreSave.manifestHash, sealedRecord.manifestHash);
    assert.equal(afterStoreSave.manifest.steps.some((step) => Object.prototype.hasOwnProperty.call(step, 'result')), false);
  });

  const roundTripLogger = loadLoggerWithStore(history.store);
  roundTripLogger.logs = [{
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'replay record attached',
    data: { sessionId: roundTripId }
  }];
  const loggerSaved = await roundTripLogger.saveSession(roundTripId, {
    status: 'completed',
    mode: 'mcp-agent',
    replay: sealedRecord
  });
  const afterLoggerSave = JSON.parse(JSON.stringify(history.values.fsbSessionLogs[roundTripId].replay));
  check('a logger save that carries the sealed record keeps it exactly as sealed', () => {
    assert.equal(loggerSaved, true);
    assert.deepEqual(afterLoggerSave.manifest, sealedRecord.manifest);
  });

  const roundTripMaterialized = await second.dispatch('lattice-replay-materialize', {
    manifest: afterLoggerSave.manifest,
    manifestHash: afterLoggerSave.manifestHash,
    receipt: afterLoggerSave.receipt,
    signerKid: afterLoggerSave.signerKid
  });
  check('a sealed record still verifies after the store and logger round trips', () => {
    assert.equal(roundTripMaterialized.ok, true, roundTripMaterialized.error && roundTripMaterialized.error.message);
    assert.equal(roundTripMaterialized.verified, true);
    assert.equal(roundTripMaterialized.manifestHash, sealedRecord.manifestHash);
  });

  const forgedRecord = JSON.parse(JSON.stringify(sealedRecord));
  forgedRecord.manifest.steps[0].argumentHash = '<img src=x>';
  forgedRecord.manifest.steps[1].resultSummary = 'element_not_found';
  history.values.fsbSessionLogs[roundTripId].replay = forgedRecord;
  await history.store.updateAutomationSessionOutcome(roundTripId, { status: 'completed', outcome: 'success' });
  const afterForgery = history.values.fsbSessionLogs[roundTripId].replay;
  const forgedMaterialized = await second.dispatch('lattice-replay-materialize', {
    manifest: afterForgery.manifest,
    manifestHash: afterForgery.manifestHash,
    receipt: afterForgery.receipt,
    signerKid: afterForgery.signerKid
  });
  check('malformed sealed fields are dropped and the record then fails closed', () => {
    assert.equal(Object.prototype.hasOwnProperty.call(afterForgery.manifest.steps[0], 'argumentHash'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(afterForgery.manifest.steps[1], 'resultSummary'), false);
    assert.equal(afterForgery.manifest.steps[1].resultHash, sealedRecord.manifest.steps[1].resultHash);
    assert.equal(forgedMaterialized.ok, false);
    assert.match(forgedMaterialized.error.message, /hash mismatch/i);
  });

  // A capability step is classified by the slug capture wrote. Once the
  // session has passed through the trusted store (an outcome update, a load,
  // a logger save), replay must still see the same capability, or
  // prepareReplay refuses the whole recording.
  const capabilityHistory = createTrustedSessionStore();
  const capabilitySessionId = 'session_capability_round_trip';
  const capabilityTarget = {
    targetUrl: 'https://example.com/start',
    targetOrigin: 'https://example.com',
    routeFamily: 'capabilities'
  };
  const capabilityCapture = replayHelpers.createReplayRecord({
    sessionId: capabilitySessionId,
    task: 'Capability round trip',
    startUrl: 'https://example.com/start',
    endTime: Date.now(),
    mode: 'mcp-agent',
    status: 'completed'
  }, [{
    tool: 'mcp:capabilities-invoke',
    requestPayload: { slug: 'github.get_repository', params: { owner: 'fullselfbrowsing', repo: 'FSB' } },
    response: { success: true, repository: 'FSB' },
    success: true,
    dispatcher_route: 'message',
    timestamp: Date.now() - 2000,
    replayContext: Object.assign({}, capabilityTarget, {
      slug: 'github.get_repository', sideEffectClass: 'read', service: 'GitHub', tier: 'T1a'
    })
  }, {
    tool: 'mcp:capabilities-invoke',
    requestPayload: { slug: 'github.create_issue', params: { owner: 'fullselfbrowsing', repo: 'FSB' } },
    response: { success: true },
    success: true,
    dispatcher_route: 'message',
    timestamp: Date.now() - 1000,
    replayContext: Object.assign({}, capabilityTarget, { slug: 'github.create_issue', service: 'GitHub' })
  }], 'capture');
  const capturedCapabilities = capabilityCapture.manifest.steps.map((step) => step.capability);
  const capabilitySessionRecord = (replay) => ({
    id: capabilitySessionId,
    task: 'Capability round trip',
    mode: 'mcp-agent',
    startTime: Date.now() - 5000,
    endTime: Date.now(),
    status: 'completed',
    logs: [],
    replay
  });
  await capabilityHistory.store.saveAutomationSession(capabilitySessionId, capabilitySessionRecord(capabilityCapture), []);
  await capabilityHistory.store.updateAutomationSessionOutcome(capabilitySessionId, {
    status: 'completed', outcome: 'success', reason: 'completed'
  });
  const storedCapabilityReplay = (await capabilityHistory.store.loadAutomationSession(capabilitySessionId)).session.replay;
  check('the trusted store keeps a capability step as capture wrote it', () => {
    assert.deepEqual(capturedCapabilities.map((capability) => capability.slug),
      ['github.get_repository', 'github.create_issue']);
    assert.deepEqual(storedCapabilityReplay.manifest.steps.map((step) => step.capability), capturedCapabilities);
    assert.doesNotThrow(() => replayHelpers.validateReplayClassifications(storedCapabilityReplay.manifest.steps));
  });

  const capabilityLogger = loadLoggerWithStore(capabilityHistory.store);
  capabilityLogger.logs = [{
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'capability capture attached',
    data: { sessionId: capabilitySessionId }
  }];
  const capabilityLoggerSaved = await capabilityLogger.saveSession(capabilitySessionId, {
    status: 'completed',
    mode: 'mcp-agent',
    replay: capabilityCapture
  });
  const loggerCapabilitySteps = capabilityHistory.values.fsbSessionLogs[capabilitySessionId].replay.manifest.steps;
  check('a logger save that carries a capture keeps its capability steps', () => {
    assert.equal(capabilityLoggerSaved, true);
    assert.deepEqual(loggerCapabilitySteps.map((step) => step.capability), capturedCapabilities);
  });

  const capabilityPrepared = await withReplayRuntime(capabilityHistory.local, second,
    () => replayHelpers.prepareReplay(capabilitySessionId));
  await capabilityHistory.store.updateAutomationSessionOutcome(capabilitySessionId, {
    status: 'completed', outcome: 'success', reason: 'completed'
  });
  const capabilityPreparedAgain = await withReplayRuntime(capabilityHistory.local, second,
    () => replayHelpers.prepareReplay(capabilitySessionId));
  check('prepareReplay accepts capability steps before and after a sealed outcome update', () => {
    assert.equal(capabilityPrepared.verified, true);
    assert.deepEqual(capabilityPrepared.steps.map((step) => step.replay.availability), ['ready', 'approval-once']);
    assert.equal(capabilityPreparedAgain.verified, true);
    assert.equal(capabilityPreparedAgain.replay.manifestHash, capabilityPrepared.replay.manifestHash);
    assert.deepEqual(capabilityPreparedAgain.steps.map((step) => step.capability), capturedCapabilities);
  });

  // Sessions saved before the slug was kept carry an always-null
  // capabilityId instead, and some of them are already sealed. Their stored
  // shape must not change, or their committed hash would stop matching.
  const legacyCapabilityRecord = JSON.parse(JSON.stringify(capabilityHistory.values.fsbSessionLogs[capabilitySessionId]));
  legacyCapabilityRecord.replay.manifest.steps.forEach((step) => {
    step.capability = { capabilityId: null, sideEffectClass: step.capability.sideEffectClass, service: 'GitHub', tier: null };
  });
  capabilityHistory.values.fsbSessionLogs[capabilitySessionId] = JSON.parse(JSON.stringify(legacyCapabilityRecord));
  await capabilityHistory.store.updateAutomationSessionOutcome(capabilitySessionId, { status: 'completed', outcome: 'success' });
  check('a step stored with the older capability shape keeps that shape', () => {
    assert.deepEqual(
      capabilityHistory.values.fsbSessionLogs[capabilitySessionId].replay.manifest.steps.map((step) => step.capability),
      legacyCapabilityRecord.replay.manifest.steps.map((step) => step.capability)
    );
  });

  console.log('Summary:', passed, 'passed');
}

main().catch((error) => {
  console.error('FAIL lattice-session-replay:', error && error.stack ? error.stack : error);
  process.exit(1);
});
