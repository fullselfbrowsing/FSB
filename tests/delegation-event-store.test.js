'use strict';

const assert = require('assert');
const path = require('path');
const fixtures = require('./fixtures/delegation-events');

const STORE_PATH = path.join(
  __dirname,
  '..',
  'extension',
  'utils',
  'delegation-event-store.js',
);

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('  PASS:', name);
  } catch (error) {
    failed += 1;
    console.error('  FAIL:', name, '--', error && error.stack ? error.stack : error);
  }
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function freshStore() {
  delete require.cache[require.resolve(STORE_PATH)];
  return require(STORE_PATH);
}

function installSessionStorage(initial = {}) {
  const previous = globalThis.chrome;
  const data = jsonClone(initial);
  let rejectRead = null;
  let rejectWrite = null;
  let setGate = null;
  let setStarted = null;
  let setCalls = 0;

  const area = {
    async get(keys) {
      if (rejectRead) throw rejectRead;
      if (keys === null || keys === undefined) return jsonClone(data);
      const requested = Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const key of requested) {
        if (Object.hasOwn(data, key)) out[key] = jsonClone(data[key]);
      }
      return out;
    },
    async set(update) {
      setCalls += 1;
      if (setStarted) setStarted();
      if (setGate) await setGate;
      if (rejectWrite) throw rejectWrite;
      Object.assign(data, jsonClone(update));
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },
  };

  globalThis.chrome = { storage: { session: area } };
  return {
    data,
    get setCalls() { return setCalls; },
    rejectNextRead(error = new Error('read rejected')) { rejectRead = error; },
    rejectNextWrite(error = new Error('write rejected')) { rejectWrite = error; },
    deferWrites() {
      let resolve;
      let startedResolve;
      setGate = new Promise((done) => { resolve = done; });
      const started = new Promise((done) => { startedResolve = done; });
      setStarted = startedResolve;
      return {
        started,
        resolve() {
          setGate = null;
          setStarted = null;
          resolve();
        },
      };
    },
    restore() {
      if (previous === undefined) delete globalThis.chrome;
      else globalThis.chrome = previous;
    },
  };
}

function context(overrides = {}) {
  return { ...jsonClone(fixtures.baseContext), ...overrides };
}

function exactKeys(value, keys) {
  assert.deepStrictEqual(Object.keys(value).sort(), [...keys].sort());
}

async function expectCode(promiseOrFn, code) {
  let error = null;
  try {
    if (typeof promiseOrFn === 'function') await promiseOrFn();
    else await promiseOrFn;
  } catch (caught) {
    error = caught;
  }
  assert(error, `expected ${code} rejection`);
  assert.strictEqual(error.code, code);
  return error;
}

function storageKey(store, delegationId = fixtures.baseContext.delegationId) {
  return `${store.STORAGE_KEY_PREFIX}${delegationId}`;
}

function project(store, event, overrides = {}) {
  return store.project(event, context(overrides));
}

(async () => {
  console.log('--- Phase 61 Plan 02: delegation event store ---');

  await test('exports the closed store contract and pinned limits', () => {
    const store = freshStore();
    exactKeys(store, [
      'DelegationStoreError',
      'MAX_AGGREGATE_BYTES',
      'MAX_ALLOWED_TOOLS',
      'MAX_ALLOWED_TOOL_CHARS',
      'MAX_ENTRIES_PER_DELEGATION',
      'MAX_ENTRY_BYTES',
      'MAX_ID_CHARS',
      'MAX_PRESENTATION_CHARS',
      'MAX_TOOL_COUNT_ROWS',
      'MAX_TOOL_NAME_CHARS',
      'PAYLOAD_VERSION',
      'STORAGE_KEY_PREFIX',
      'appendBeforeFanout',
      'hydrateNonterminal',
      'markTerminal',
      'normalizeTerminalCode',
      'project',
      'serializedBytes',
    ]);
    assert.strictEqual(store.PAYLOAD_VERSION, 1);
    assert.strictEqual(store.MAX_ENTRIES_PER_DELEGATION, 2000);
    assert.strictEqual(store.MAX_ENTRY_BYTES, 4 * 1024);
    assert.strictEqual(store.MAX_AGGREGATE_BYTES, 6 * 1024 * 1024);
    assert.strictEqual(globalThis.FsbDelegationEventStore, store);
  });

  await test('projects exact init fields and ignores provider-native extras', () => {
    const store = freshStore();
    const entry = project(store, fixtures.initEvent);
    exactKeys(entry, [
      'v', 'delegationId', 'sequence', 'timestamp', 'kind', 'state', 'title',
      'detail', 'init', 'tool', 'retry', 'metrics',
    ]);
    assert.strictEqual(entry.v, 1);
    assert.strictEqual(entry.kind, 'init');
    assert.strictEqual(entry.state, 'running');
    assert.strictEqual(entry.title, 'Claude Code connected');
    assert.strictEqual(entry.detail, null);
    exactKeys(entry.init, ['client', 'profileVersion', 'model', 'sessionId', 'allowedTools']);
    assert.deepStrictEqual(entry.init, {
      client: { id: 'claude-code', label: 'Claude Code' },
      profileVersion: '2.1.177',
      model: 'synthetic-model',
      sessionId: 'synthetic-session-01',
      allowedTools: [
        'mcp__fsb__search_capabilities',
        'mcp__fsb__invoke_capability',
      ],
    });
    assert.strictEqual(entry.tool, null);
    assert.strictEqual(entry.retry, null);
    assert.strictEqual(entry.metrics, null);
    assert(!JSON.stringify(entry).includes(fixtures.secretCanary));
    assert(Object.isFrozen(entry));
    assert(Object.isFrozen(entry.init));
  });

  await test('projects exact running and terminal tool-call fields', () => {
    const store = freshStore();
    const running = project(store, fixtures.toolUseEvent, {
      sequence: 2,
      title: 'Searching capabilities',
      detail: 'A bounded presentation detail',
    });
    assert.strictEqual(running.kind, 'tool-call');
    exactKeys(running.tool, ['callId', 'name', 'tabId', 'argsSummary', 'status', 'durationMs']);
    assert.deepStrictEqual(running.tool, {
      callId: 'synthetic-tool-01',
      name: 'mcp__fsb__search_capabilities',
      tabId: 42,
      argsSummary: 'Search capabilities',
      status: 'running',
      durationMs: null,
    });
    assert.strictEqual(running.init, null);
    assert.strictEqual(running.retry, null);
    assert.strictEqual(running.metrics, null);

    const succeeded = project(store, fixtures.toolResultEvent, { sequence: 3, tabId: 42 });
    assert.deepStrictEqual(succeeded.tool, {
      callId: 'synthetic-tool-01',
      name: 'mcp__fsb__search_capabilities',
      tabId: 42,
      argsSummary: null,
      status: 'succeeded',
      durationMs: 125,
    });
    const failed = project(store, fixtures.failedToolResultEvent, { sequence: 4 });
    assert.strictEqual(failed.tool.status, 'failed');
    assert(!JSON.stringify([running, succeeded, failed]).includes(fixtures.secretCanary));
    assert(!JSON.stringify([running, succeeded, failed]).includes(fixtures.taskCanary));
  });

  await test('projects typed retry fields and closes unknown provider classes', () => {
    const store = freshStore();
    const retry = project(store, fixtures.retryEvent, { sequence: 5 });
    assert.strictEqual(retry.kind, 'retry');
    exactKeys(retry.retry, ['class', 'attempt', 'maxAttempts', 'delayMs']);
    assert.deepStrictEqual(retry.retry, {
      class: 'api_retry',
      attempt: 1,
      maxAttempts: 3,
      delayMs: 250,
    });
    const unknown = project(store, fixtures.unknownRetryEvent, { sequence: 6 });
    assert.strictEqual(unknown.retry.class, 'unknown');
    assert.strictEqual(unknown.retry.attempt, 2);
    assert.strictEqual(unknown.retry.maxAttempts, null);
    assert.strictEqual(unknown.retry.delayMs, null);
    assert(!JSON.stringify([retry, unknown]).includes('provider_private_retry_class'));
  });

  await test('projects honest closed metrics without fabricated subscription USD', () => {
    const store = freshStore();
    const entry = project(store, fixtures.resultEvent, {
      sequence: 7,
      state: 'completed',
      billingKind: 'subscription',
      usd: 999,
      toolCalls: [
        { name: 'mcp__fsb__search_capabilities', count: 1 },
        { name: 'mcp__fsb__search_capabilities', count: 2 },
        { name: 'mcp__fsb__invoke_capability', count: 1 },
      ],
    });
    assert.strictEqual(entry.kind, 'result');
    assert.strictEqual(entry.state, 'running',
      'streamed result remains nonterminal until explicit cleanup evidence');
    exactKeys(entry.metrics, [
      'inputTokens', 'outputTokens', 'totalTokens', 'turns', 'durationMs',
      'billingKind', 'usd', 'toolCalls',
    ]);
    assert.deepStrictEqual(entry.metrics, {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      turns: 2,
      durationMs: 3210,
      billingKind: 'subscription',
      usd: null,
      toolCalls: [
        { name: 'mcp__fsb__search_capabilities', count: 3 },
        { name: 'mcp__fsb__invoke_capability', count: 1 },
      ],
    });
    assert.strictEqual(entry.init, null);
    assert.strictEqual(entry.tool, null);
    assert.strictEqual(entry.retry, null);

    const api = project(store, fixtures.resultEvent, {
      sequence: 8,
      billingKind: 'api',
      usd: 0.0125,
    });
    assert.strictEqual(api.metrics.usd, 0.0125);
    const failed = project(store, fixtures.failedResultEvent, { sequence: 9 });
    assert.strictEqual(failed.state, 'running',
      'error result also waits for explicit post-cleanup terminal evidence');
    assert.strictEqual(failed.metrics.inputTokens, null);
    assert.strictEqual(failed.metrics.outputTokens, null);
    assert.strictEqual(failed.metrics.totalTokens, null);
    assert.strictEqual(failed.metrics.billingKind, 'unknown');
    assert.strictEqual(failed.metrics.usd, null);
  });

  await test('state rows never parse presentation strings as machine data', () => {
    const store = freshStore();
    const title = 'client=claude-code model=fake terminal=completed retry=api_retry';
    const detail = 'session=fake tool=secret billingKind=api usd=999';
    const entry = project(store, fixtures.stateEvent, {
      sequence: 10,
      state: 'held',
      title,
      detail,
    });
    assert.strictEqual(entry.kind, 'state');
    assert.strictEqual(entry.state, 'held');
    assert.strictEqual(entry.title, title);
    assert.strictEqual(entry.detail, detail);
    assert.strictEqual(entry.init, null);
    assert.strictEqual(entry.tool, null);
    assert.strictEqual(entry.retry, null);
    assert.strictEqual(entry.metrics, null);
  });

  await test('closed terminal mapping never persists raw provider diagnostics', () => {
    const store = freshStore();
    assert.strictEqual(store.normalizeTerminalCode('completed'), 'completed');
    assert.strictEqual(store.normalizeTerminalCode('daemon_restart_lost_run'), 'daemon_restart_lost_run');
    assert.strictEqual(store.normalizeTerminalCode('provider_private_terminal_code'), 'unknown_failure');
    const entry = project(store, fixtures.terminalEvent, {
      sequence: 11,
      terminalCode: 'provider_private_terminal_code',
      detail: 'Safe bounded diagnostic',
    });
    assert.strictEqual(entry.state, 'failed');
    assert.strictEqual(entry.detail, 'Safe bounded diagnostic');
    assert(!JSON.stringify(entry).includes('provider_private_terminal_code'));
    assert(!JSON.stringify(entry).includes(fixtures.secretCanary));
  });

  await test('string and collection limits accept boundary and reject boundary plus one', async () => {
    const store = freshStore();
    const boundary = fixtures.boundary;
    assert.strictEqual(project(store, fixtures.stateEvent, {
      title: boundary.presentation,
      detail: boundary.presentation,
    }).title.length, 256);
    await expectCode(
      () => project(store, fixtures.stateEvent, { title: boundary.presentationPlusOne }),
      'delegation_quota_exceeded',
    );
    await expectCode(
      () => project(store, fixtures.stateEvent, { detail: fixtures.hugeUnicode }),
      'delegation_quota_exceeded',
    );

    assert.strictEqual(project(store, fixtures.initEvent, {
      delegationId: boundary.id,
      sessionId: boundary.id,
      profileVersion: boundary.id,
      model: boundary.id,
      allowedTools: Array.from({ length: 16 }, (_, index) => (
        `${String(index).padStart(2, '0')}${'t'.repeat(94)}`
      )),
    }).init.allowedTools.length, 16);
    await expectCode(
      () => project(store, fixtures.initEvent, { delegationId: boundary.idPlusOne }),
      'delegation_quota_exceeded',
    );
    await expectCode(
      () => project(store, fixtures.initEvent, { allowedTools: [boundary.allowedToolPlusOne] }),
      'delegation_quota_exceeded',
    );
    await expectCode(
      () => project(store, fixtures.initEvent, {
        allowedTools: Array.from({ length: 17 }, (_, index) => `tool-${index}`),
      }),
      'delegation_quota_exceeded',
    );

    assert.strictEqual(project(store, fixtures.toolUseEvent, {
      toolName: boundary.id,
      argsSummary: boundary.presentation,
    }).tool.name.length, 128);
    await expectCode(
      () => project(store, fixtures.toolUseEvent, { toolName: boundary.idPlusOne }),
      'delegation_quota_exceeded',
    );
    await expectCode(
      () => project(store, fixtures.toolUseEvent, { argsSummary: boundary.presentationPlusOne }),
      'delegation_quota_exceeded',
    );

    const rows128 = Array.from({ length: 128 }, (_, index) => ({
      name: `t${index}`,
      count: index,
    }));
    assert.strictEqual(project(store, fixtures.resultEvent, {
      toolCalls: rows128,
    }).metrics.toolCalls.length, 128);
    await expectCode(
      () => project(store, fixtures.resultEvent, {
        toolCalls: rows128.concat({ name: 'overflow', count: 1 }),
      }),
      'delegation_quota_exceeded',
    );
  });

  await test('serialized entry enforces the exact 4 KiB UTF-8 boundary', async () => {
    const store = freshStore();
    let exact = null;
    let exactContext = null;
    for (let rowCount = 70; rowCount <= 128 && !exact; rowCount += 1) {
      const toolCalls = Array.from({ length: rowCount }, (_, index) => ({
        name: `tool-${index}-${'x'.repeat(8)}`,
        count: 1,
      }));
      const base = project(store, fixtures.resultEvent, {
        toolCalls,
        title: '',
        detail: '',
      });
      const needed = store.MAX_ENTRY_BYTES - store.serializedBytes(base);
      if (needed >= 0 && needed <= 255) {
        exactContext = { toolCalls, title: '', detail: 'd'.repeat(needed) };
        exact = project(store, fixtures.resultEvent, exactContext);
      }
    }
    assert(exact, 'test setup found a representable exact-size entry');
    assert.strictEqual(store.serializedBytes(exact), store.MAX_ENTRY_BYTES);
    await expectCode(
      () => project(store, fixtures.resultEvent, {
        ...exactContext,
        detail: `${exactContext.detail}d`,
      }),
      'delegation_quota_exceeded',
    );
  });

  await test('projection ignores hostile nested provider data and emits one closed row', () => {
    const store = freshStore();
    const entry = project(store, fixtures.maliciousEvent, {
      sequence: 12,
      title: '<img src=x onerror=alert(1)>',
      detail: 'Displayed later through textContent',
    });
    assert.strictEqual(entry.kind, 'state');
    assert.strictEqual(entry.title, '<img src=x onerror=alert(1)>');
    const serialized = JSON.stringify(entry);
    for (const canary of [
      fixtures.secretCanary,
      String(fixtures.pidCanary),
      fixtures.argvCanary,
      fixtures.envCanary,
      fixtures.taskCanary,
      'providerEvent',
      'rawResult',
    ]) {
      assert(!serialized.includes(canary), `${canary} is absent from projection`);
    }
  });

  await test('normalized outer envelope is exact while payload extras are only ignored', async () => {
    const store = freshStore();
    await expectCode(
      () => store.project({ ...fixtures.initEvent, raw: fixtures.secretCanary }, context()),
      'delegation_persistence_failed',
    );
    await expectCode(
      () => store.project({ type: 'unknown', sessionId: 's', payload: {} }, context()),
      'delegation_persistence_failed',
    );
    await expectCode(
      () => store.project({ type: 'state', sessionId: 's', payload: [], }, context()),
      'delegation_persistence_failed',
    );
  });

  await test('append assigns one monotonic sequence inside serialized storage turns', async () => {
    const mock = installSessionStorage();
    try {
      const store = freshStore();
      const delegationId = fixtures.baseContext.delegationId;
      const entries = await Promise.all(Array.from({ length: 24 }, (_, index) => (
        store.appendBeforeFanout(delegationId, fixtures.stateEvent, {
          timestamp: fixtures.baseContext.timestamp + index,
          state: 'running',
          title: `event-${index}`,
        })
      )));
      assert.deepStrictEqual(entries.map((entry) => entry.sequence),
        Array.from({ length: 24 }, (_, index) => index + 1));
      assert.strictEqual(mock.setCalls, 24);
      const persisted = mock.data[storageKey(store)];
      exactKeys(persisted, ['v', 'delegationId', 'terminal', 'terminalCode', 'entries']);
      assert.deepStrictEqual(persisted.entries.map((entry) => entry.sequence),
        Array.from({ length: 24 }, (_, index) => index + 1));
      assert.deepStrictEqual(persisted.entries.map((entry) => entry.title),
        Array.from({ length: 24 }, (_, index) => `event-${index}`));
    } finally {
      mock.restore();
    }
  });

  await test('append returns only after the durable write resolves', async () => {
    const mock = installSessionStorage();
    try {
      const store = freshStore();
      const gate = mock.deferWrites();
      let settled = false;
      const append = store.appendBeforeFanout(
        fixtures.baseContext.delegationId,
        fixtures.initEvent,
        context(),
      ).then((entry) => {
        settled = true;
        return entry;
      });
      await gate.started;
      await Promise.resolve();
      assert.strictEqual(settled, false);
      assert.strictEqual(mock.data[storageKey(store)], undefined);
      gate.resolve();
      const entry = await append;
      assert.strictEqual(settled, true);
      assert.strictEqual(entry.sequence, 1);
      assert.strictEqual(mock.data[storageKey(store)].entries.length, 1);
    } finally {
      mock.restore();
    }
  });

  await test('storage rejection is typed and never fabricates a persisted entry', async () => {
    const mock = installSessionStorage();
    try {
      const store = freshStore();
      mock.rejectNextWrite();
      await expectCode(
        store.appendBeforeFanout(fixtures.baseContext.delegationId, fixtures.initEvent, context()),
        'delegation_persistence_failed',
      );
      assert.strictEqual(mock.data[storageKey(store)], undefined);
    } finally {
      mock.restore();
    }
  });

  await test('the 2,000-entry boundary is retained and entry 2,001 fails closed', async () => {
    const bootstrap = freshStore();
    const delegationId = 'delegation_count_boundary';
    const template = bootstrap.project(fixtures.stateEvent, context({
      delegationId,
      sequence: 1,
      title: 'bounded state',
    }));
    const entries = Array.from({ length: bootstrap.MAX_ENTRIES_PER_DELEGATION }, (_, index) => ({
      ...jsonClone(template),
      sequence: index + 1,
    }));
    const envelope = fixtures.makePersistedEnvelope(entries, { delegationId });
    const mock = installSessionStorage({ [storageKey(bootstrap, delegationId)]: envelope });
    try {
      const store = freshStore();
      const hydrated = await store.hydrateNonterminal();
      assert.strictEqual(hydrated.length, 1);
      assert.strictEqual(hydrated[0].entries.length, store.MAX_ENTRIES_PER_DELEGATION);
      await expectCode(
        store.appendBeforeFanout(delegationId, fixtures.stateEvent, { title: 'overflow' }),
        'delegation_quota_exceeded',
      );
      assert.strictEqual(mock.data[storageKey(store, delegationId)].entries.length, 2000);
    } finally {
      mock.restore();
    }
  });

  await test('aggregate ledger quota rejects a write without changing existing ledgers', async () => {
    const bootstrap = freshStore();
    const otherId = 'delegation_aggregate_existing';
    const newId = 'delegation_aggregate_new';
    const toolCalls = Array.from({ length: 95 }, (_, index) => ({
      name: `tool-${String(index).padStart(3, '0')}-${'x'.repeat(8)}`,
      count: 1,
    }));
    const template = bootstrap.project(fixtures.resultEvent, context({
      delegationId: otherId,
      sequence: 1,
      title: '',
      detail: '',
      toolCalls,
    }));
    assert(bootstrap.serializedBytes(template) < bootstrap.MAX_ENTRY_BYTES);

    const entries = [];
    const emptyEnvelope = fixtures.makePersistedEnvelope([], { delegationId: otherId });
    let envelopeBytes = bootstrap.serializedBytes(emptyEnvelope);
    const newEntry = bootstrap.project(fixtures.stateEvent, {
      delegationId: newId,
      sequence: 1,
      timestamp: fixtures.baseContext.timestamp,
      title: 'new aggregate row',
    });
    const newEnvelope = fixtures.makePersistedEnvelope([newEntry], { delegationId: newId });
    const crossingBytes = bootstrap.serializedBytes(newEnvelope);
    for (let index = 0; index < bootstrap.MAX_ENTRIES_PER_DELEGATION; index += 1) {
      const candidate = { ...jsonClone(template), sequence: index + 1 };
      const nextBytes = envelopeBytes
        + bootstrap.serializedBytes(candidate)
        + (entries.length > 0 ? 1 : 0);
      if (nextBytes + crossingBytes > bootstrap.MAX_AGGREGATE_BYTES) break;
      entries.push(candidate);
      envelopeBytes = nextBytes;
    }
    if (envelopeBytes + crossingBytes <= bootstrap.MAX_AGGREGATE_BYTES) {
      const commaBytes = entries.length > 0 ? 1 : 0;
      const minimumTailBytes = bootstrap.MAX_AGGREGATE_BYTES
        - crossingBytes
        + 1
        - envelopeBytes
        - commaBytes;
      const maximumTailBytes = bootstrap.MAX_AGGREGATE_BYTES - envelopeBytes - commaBytes;
      let tail = null;
      for (let rowCount = 0; rowCount <= 128 && !tail; rowCount += 1) {
        const tailRows = Array.from({ length: rowCount }, (_, index) => ({
          name: `tail-${index}`,
          count: 1,
        }));
        let base;
        try {
          base = bootstrap.project(fixtures.resultEvent, context({
            delegationId: otherId,
            sequence: entries.length + 1,
            title: '',
            detail: '',
            toolCalls: tailRows,
          }));
        } catch (error) {
          if (error.code === 'delegation_quota_exceeded') break;
          throw error;
        }
        const baseBytes = bootstrap.serializedBytes(base);
        const padding = Math.max(0, minimumTailBytes - baseBytes);
        if (padding > 256) continue;
        const candidate = bootstrap.project(fixtures.resultEvent, context({
          delegationId: otherId,
          sequence: entries.length + 1,
          title: '',
          detail: 'd'.repeat(padding),
          toolCalls: tailRows,
        }));
        const candidateBytes = bootstrap.serializedBytes(candidate);
        if (candidateBytes >= minimumTailBytes && candidateBytes <= maximumTailBytes) tail = candidate;
      }
      assert(tail, 'test setup found a valid quota-crossing tail entry');
      entries.push(jsonClone(tail));
      envelopeBytes += commaBytes + bootstrap.serializedBytes(tail);
    }
    const envelope = fixtures.makePersistedEnvelope(entries, { delegationId: otherId });
    const existingBytes = bootstrap.serializedBytes(envelope);
    assert.strictEqual(existingBytes, envelopeBytes);
    assert(existingBytes <= bootstrap.MAX_AGGREGATE_BYTES);
    assert(existingBytes + crossingBytes > bootstrap.MAX_AGGREGATE_BYTES);
    assert(entries.length <= bootstrap.MAX_ENTRIES_PER_DELEGATION);

    const mock = installSessionStorage({ [storageKey(bootstrap, otherId)]: envelope });
    try {
      const store = freshStore();
      await expectCode(
        store.appendBeforeFanout(newId, fixtures.stateEvent, {
          timestamp: fixtures.baseContext.timestamp,
          title: 'new aggregate row',
        }),
        'delegation_quota_exceeded',
      );
      assert.strictEqual(mock.data[storageKey(store, newId)], undefined);
      assert.deepStrictEqual(mock.data[storageKey(store, otherId)], envelope);
    } finally {
      mock.restore();
    }
  });

  await test('forced module reload hydrates exact ascending nonterminal ledgers', async () => {
    const mock = installSessionStorage();
    try {
      let store = freshStore();
      const delegationId = fixtures.baseContext.delegationId;
      await store.appendBeforeFanout(delegationId, fixtures.initEvent, context());
      await store.appendBeforeFanout(delegationId, fixtures.toolUseEvent, context({
        timestamp: fixtures.baseContext.timestamp + 1,
      }));
      delete require.cache[require.resolve(STORE_PATH)];
      store = freshStore();
      const ledgers = await store.hydrateNonterminal();
      assert.strictEqual(ledgers.length, 1);
      assert.strictEqual(ledgers[0].delegationId, delegationId);
      assert.deepStrictEqual(ledgers[0].entries.map((entry) => entry.sequence), [1, 2]);
      assert.deepStrictEqual(ledgers[0].entries.map((entry) => entry.kind), ['init', 'tool-call']);
      assert(Object.isFrozen(ledgers));
      assert(Object.isFrozen(ledgers[0].entries));
    } finally {
      mock.restore();
    }
  });

  await test('terminal ledgers remain stored but are excluded from nonterminal hydration', async () => {
    const mock = installSessionStorage();
    try {
      const store = freshStore();
      const delegationId = fixtures.baseContext.delegationId;
      await store.appendBeforeFanout(delegationId, fixtures.resultEvent, context({
        state: 'completed',
        billingKind: 'subscription',
      }));
      const terminal = await store.markTerminal(delegationId, { code: 'completed' });
      assert.strictEqual(terminal.terminal, true);
      assert.strictEqual(terminal.terminalCode, 'completed');
      assert.strictEqual(terminal.entries.length, 1);
      assert.strictEqual((await store.hydrateNonterminal()).length, 0);
      assert.strictEqual(mock.data[storageKey(store)].entries.length, 1);
      const repeated = await store.markTerminal(delegationId, 'completed');
      assert.deepStrictEqual(repeated, terminal);
      await expectCode(
        store.markTerminal(delegationId, 'stopped'),
        'delegation_ledger_corrupt',
      );
    } finally {
      mock.restore();
    }
  });

  await test('unknown terminal input maps to the literal closed fallback', async () => {
    const mock = installSessionStorage();
    try {
      const store = freshStore();
      const delegationId = fixtures.baseContext.delegationId;
      await store.appendBeforeFanout(delegationId, fixtures.terminalEvent, context({
        state: 'failed',
      }));
      const terminal = await store.markTerminal(delegationId, {
        code: 'provider_private_terminal_code',
        raw: fixtures.secretCanary,
      });
      assert.strictEqual(terminal.terminalCode, 'unknown_failure');
      assert(!JSON.stringify(mock.data).includes('provider_private_terminal_code'));
      assert(!JSON.stringify(mock.data).includes(fixtures.secretCanary));
    } finally {
      mock.restore();
    }
  });

  await test('hydrate treats duplicate, conflicting, gapped, reversed, and mismatched rows as corruption', async () => {
    const bootstrap = freshStore();
    const delegationId = fixtures.baseContext.delegationId;
    const first = project(bootstrap, fixtures.initEvent);
    const second = project(bootstrap, fixtures.stateEvent, { sequence: 2 });
    const key = storageKey(bootstrap);
    const cases = [
      ['byte-identical duplicate sequence', fixtures.makePersistedEnvelope(
        fixtures.makeDuplicateSequenceEntries(first),
      )],
      ['conflicting duplicate sequence', fixtures.makePersistedEnvelope(
        fixtures.makeConflictingSequenceEntries(first),
      )],
      ['sequence gap', fixtures.makePersistedEnvelope([first, { ...second, sequence: 3 }])],
      ['sequence reversal', fixtures.makePersistedEnvelope([{ ...first, sequence: 2 }, { ...second, sequence: 1 }])],
      ['entry identity mismatch', fixtures.makePersistedEnvelope([
        { ...first, delegationId: 'delegation_other' },
      ])],
      ['envelope identity mismatch', fixtures.makePersistedEnvelope([first], {
        delegationId: 'delegation_other',
      })],
      ['extra envelope key', { ...fixtures.makePersistedEnvelope([first]), extra: true }],
      ['extra entry key', fixtures.makePersistedEnvelope([{ ...first, extra: true }])],
      ['typed payload overlap', fixtures.makePersistedEnvelope([{ ...first, tool: {
        callId: null,
        name: 'unknown',
        tabId: null,
        argsSummary: null,
        status: 'unknown',
        durationMs: null,
      } }])],
      ['invalid version', { ...fixtures.makePersistedEnvelope([first]), v: 99 }],
      ['terminal disagreement', {
        ...fixtures.makePersistedEnvelope([first]),
        terminal: true,
        terminalCode: null,
      }],
    ];

    for (const [label, envelope] of cases) {
      const mock = installSessionStorage({ [key]: envelope });
      try {
        const store = freshStore();
        await expectCode(store.hydrateNonterminal(), 'delegation_ledger_corrupt');
      } catch (error) {
        error.message = `${label}: ${error.message}`;
        throw error;
      } finally {
        mock.restore();
      }
    }
    assert.strictEqual(delegationId, first.delegationId);
  });

  await test('hydrate validates every typed payload field and exact null exclusivity', async () => {
    const bootstrap = freshStore();
    const entries = [
      project(bootstrap, fixtures.initEvent, { sequence: 1 }),
      project(bootstrap, fixtures.toolUseEvent, { sequence: 2 }),
      project(bootstrap, fixtures.retryEvent, { sequence: 3 }),
      project(bootstrap, fixtures.resultEvent, {
        sequence: 4,
        state: 'completed',
        billingKind: 'subscription',
        toolCalls: [{ name: 'mcp__fsb__search_capabilities', count: 1 }],
      }),
      project(bootstrap, fixtures.stateEvent, { sequence: 5, state: 'stopping' }),
    ];
    const envelope = fixtures.makePersistedEnvelope(entries);
    const mock = installSessionStorage({ [storageKey(bootstrap)]: envelope });
    try {
      const store = freshStore();
      const hydrated = await store.hydrateNonterminal();
      assert.deepStrictEqual(hydrated[0], envelope);
      assert.strictEqual(hydrated[0].entries[0].tool, null);
      assert.strictEqual(hydrated[0].entries[1].init, null);
      assert.strictEqual(hydrated[0].entries[2].metrics, null);
      assert.strictEqual(hydrated[0].entries[3].retry, null);
      assert.strictEqual(hydrated[0].entries[4].init, null);
      assert.strictEqual(hydrated[0].entries[4].tool, null);
      assert.strictEqual(hydrated[0].entries[4].retry, null);
      assert.strictEqual(hydrated[0].entries[4].metrics, null);
    } finally {
      mock.restore();
    }
  });

  await test('one accepted normalized event maps to one persisted entry with no canaries', async () => {
    const mock = installSessionStorage();
    try {
      const store = freshStore();
      const delegationId = fixtures.baseContext.delegationId;
      const events = [
        [fixtures.initEvent, context()],
        [fixtures.toolUseEvent, context({ tabId: 42 })],
        [fixtures.toolResultEvent, context({ tabId: 42 })],
        [fixtures.retryEvent, context()],
        [fixtures.maliciousEvent, context()],
        [fixtures.resultEvent, context({ billingKind: 'subscription' })],
      ];
      for (let index = 0; index < events.length; index += 1) {
        const [event, eventContext] = events[index];
        await store.appendBeforeFanout(delegationId, event, {
          ...eventContext,
          timestamp: fixtures.baseContext.timestamp + index,
        });
      }
      const persisted = mock.data[storageKey(store)];
      assert.strictEqual(persisted.entries.length, events.length);
      assert.deepStrictEqual(persisted.entries.map((entry) => entry.sequence), [1, 2, 3, 4, 5, 6]);
      const serialized = JSON.stringify(persisted);
      for (const canary of [
        fixtures.secretCanary,
        String(fixtures.pidCanary),
        fixtures.argvCanary,
        fixtures.envCanary,
        fixtures.taskCanary,
      ]) assert(!serialized.includes(canary), `${canary} is absent`);
    } finally {
      mock.restore();
    }
  });

  await test('cleared session storage hydrates empty and never claims continuity', async () => {
    const mock = installSessionStorage();
    try {
      const store = freshStore();
      assert.deepStrictEqual(await store.hydrateNonterminal(), []);
      assert.strictEqual(mock.setCalls, 0);
    } finally {
      mock.restore();
    }
  });

  await test('missing or rejected storage is a typed blocking persistence failure', async () => {
    const previous = globalThis.chrome;
    delete globalThis.chrome;
    try {
      const store = freshStore();
      await expectCode(store.hydrateNonterminal(), 'delegation_persistence_failed');
    } finally {
      if (previous !== undefined) globalThis.chrome = previous;
    }

    const mock = installSessionStorage();
    try {
      const store = freshStore();
      mock.rejectNextRead();
      await expectCode(store.hydrateNonterminal(), 'delegation_persistence_failed');
    } finally {
      mock.restore();
    }
  });

  console.log('\n--- delegation event store summary ---');
  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exitCode = failed > 0 ? 1 : 0;
})().catch((error) => {
  console.error('delegation-event-store.test.js: FATAL');
  console.error(error);
  process.exitCode = 2;
});
