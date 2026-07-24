/**
 * Service-worker wake integration: agent-registry hydration is independent of
 * unrelated session restoration, and telemetry waits for the authoritative
 * reconciled registry instead of reading a stale local-storage mirror.
 *
 * Run: node tests/telemetry-registry-bootstrap.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BACKGROUND_PATH = path.join(ROOT, 'extension', 'background.js');
const REGISTRY_PATH = require.resolve('../extension/utils/agent-registry.js');
const COLLECTOR_PATH = require.resolve('../extension/utils/telemetry-collector.js');

function extractFunction(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  assert(start >= 0, `${name} exists in background.js`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`could not extract ${name}`);
}

function makeArea(seed, getImpl) {
  const store = { ...(seed || {}) };
  return {
    async get(keys) {
      if (getImpl) return getImpl(keys, store);
      const wanted = Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const key of wanted) {
        if (Object.prototype.hasOwnProperty.call(store, key)) out[key] = store[key];
      }
      return out;
    },
    async set(values) { Object.assign(store, values); },
    async remove(keys) {
      for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];
    },
    dump() { return store; }
  };
}

(async function run() {
  const background = fs.readFileSync(BACKGROUND_PATH, 'utf8');
  const restoreStart = background.indexOf('async function restoreSessionsFromStorage()');
  const restoreEnd = background.indexOf('function restoreServiceWorkerStateOnWake()', restoreStart);
  assert(restoreEnd > restoreStart, 'wake-up coordinator follows session restoration');
  const restoreSource = background.slice(restoreStart, restoreEnd);
  assert(!restoreSource.includes('bootstrapAgentRegistry('),
    'registry bootstrap is not nested behind session-restore awaits');

  const wakeStart = restoreEnd;
  const wakeEnd = background.indexOf('// Eagerly rehydrate vault session key', wakeStart);
  const wakeSource = background.slice(wakeStart, wakeEnd);
  const registryKickoff = wakeSource.indexOf('.then(() => bootstrapAgentRegistry())');
  const registryPublish = wakeSource.indexOf('globalThis.fsbAgentRegistryReady = registry.catch');
  const sessionKickoff = wakeSource.indexOf('.then(() => restoreSessionsFromStorage())');
  assert(
    registryKickoff >= 0
      && registryPublish > registryKickoff
      && sessionKickoff > registryPublish,
    'wake-up starts and publishes registry readiness independently before session restore');

  let releaseRegistryRead;
  const registryReadGate = new Promise(resolve => { releaseRegistryRead = resolve; });
  const persisted = {
    v: 1,
    records: {
      'agent_live': { agentId: 'agent_live', createdAt: 1, tabIds: [11] },
      'agent_ghost': { agentId: 'agent_ghost', createdAt: 2, tabIds: [99] }
    }
  };
  const local = makeArea({ fsbActiveAgentsCount: 64, fsbAgentCap: 8 });
  const session = makeArea({ fsbAgentRegistry: persisted }, async (keys, store) => {
    if (keys === null) throw new Error('injected earlier session restore failure');
    await registryReadGate;
    const out = {};
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(store, key)) out[key] = store[key];
    }
    return out;
  });

  const priorChrome = globalThis.chrome;
  try {
    globalThis.chrome = {
      storage: {
        local,
        session,
        onChanged: { addListener() {} }
      },
      tabs: { async query() { return [{ id: 11 }]; } }
    };

    delete require.cache[REGISTRY_PATH];
    delete require.cache[COLLECTOR_PATH];
    delete globalThis.fsbAgentRegistryInstance;
    delete globalThis.fsbAgentRegistryReady;
    delete globalThis.fsbTelemetryCollector;

    const registryModule = require(REGISTRY_PATH);
    const bootstrapSource = extractFunction(background, 'bootstrapAgentRegistry');
    const actualBootstrap = new Function(`return (${bootstrapSource});`)();

    // Mirror background.js's independent wake-up kickoffs. The first call
    // constructs the registry synchronously, then pauses at the injected
    // hydration gate. The unrelated restore fails before that gate opens.
    globalThis.fsbAgentRegistryReady = actualBootstrap().catch(() => {});
    const failedSessionRestore = globalThis.chrome.storage.session.get(null)
      .then(() => false, () => true);

    const collector = require(COLLECTOR_PATH);
    collector._setStorageShim(local);
    collector._setFetchShim(async () => ({ ok: true, status: 200 }));
    collector._setIdentityShim({
      async getOrCreateInstallUuid() { return 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; },
      async isTelemetryOptedOut() { return false; }
    });

    const enqueueDuringHydration = collector.enqueue({ event_type: 'install_announce' });
    await Promise.resolve();
    assert.strictEqual(local.dump().fsbTelemetryQueue, undefined,
      'collector waits for registry hydration instead of immediately using stale local count');

    releaseRegistryRead();
    assert.strictEqual(await failedSessionRestore, true,
      'failure injection trips the unrelated session restore');
    await Promise.all([globalThis.fsbAgentRegistryReady, enqueueDuringHydration]);

    assert(globalThis.fsbAgentRegistryInstance instanceof registryModule.AgentRegistry,
      'actual background bootstrap constructed the registry despite session failure');
    assert.strictEqual(globalThis.fsbAgentRegistryInstance.getActiveAgentCount(), 1,
      'hydrate reconciled the ghost record against live tabs');
    assert.strictEqual(local.dump().fsbActiveAgentsCount, 1,
      'registry reconciliation repaired the stale compatibility mirror');
    assert.strictEqual(local.dump().fsbTelemetryQueue[0].active_agent_count, 1,
      'collector emitted the authoritative hydrated count, not stale fallback 64');
    assert.strictEqual(local.dump().fsbTelemetryQueue[0].active_count_version, 2,
      'collector marks only the authoritative hydrated registry count as v2');

    console.log('telemetry-registry-bootstrap: 10 passed, 0 failed');
  } finally {
    if (priorChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = priorChrome;
    delete globalThis.fsbAgentRegistryInstance;
    delete globalThis.fsbAgentRegistryReady;
    delete globalThis.fsbTelemetryCollector;
    delete globalThis.FsbAgentRegistry;
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
