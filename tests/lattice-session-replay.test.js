'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const replayHelpers = require('../extension/utils/lattice-replay.js');

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

  console.log('Summary:', passed, 'passed');
}

main().catch((error) => {
  console.error('FAIL lattice-session-replay:', error && error.stack ? error.stack : error);
  process.exit(1);
});
