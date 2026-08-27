'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const AUTHORITY_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-drive-authority.js');
const CONTROLLER_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-corpus-controller.js');
const SCHEMA_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-corpus-schema.js');

const DRIVE_ORIGIN = 'https://drive.google.com';
const DOCS_ORIGIN = 'https://docs.google.com';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';
const TEXT_MIME = 'text/plain';
const CHECKPOINT_VERSION = 'skopeo-corpus-checkpoint/v1';
const OPERATION_KINDS = [
  'ingestion',
  'query',
  'display',
  'citation-open',
  'alert-delivery'
];

function ok(value) {
  return { kind: 'ok', status: 200, value };
}

function failed(kind, status = null) {
  return { kind, status };
}

function file(id, mimeType, parents, overrides = {}) {
  return Object.assign({
    id,
    name: `Name ${id}`,
    mimeType,
    parents: parents.slice(),
    trashed: false,
    driveId: null,
    resourceKey: null,
    capabilities: {
      canDownload: mimeType === TEXT_MIME,
      canListChildren: mimeType === FOLDER_MIME
    },
    version: '1',
    headRevisionId: null,
    md5Checksum: null,
    sha1Checksum: null,
    sha256Checksum: null,
    size: mimeType === FOLDER_MIME ? 0 : 20,
    modifiedTime: '2026-07-20T12:00:00.000Z',
    shortcutDetails: null
  }, overrides);
}

function baseGraph() {
  return new Map([
    ['outside-root', file('outside-root', FOLDER_MIME, [])],
    ['outside-folder', file('outside-folder', FOLDER_MIME, ['outside-root'])],
    ['root-1', file('root-1', FOLDER_MIME, ['outside-root'])],
    ['root-2', file('root-2', FOLDER_MIME, ['outside-root'])],
    ['vendor-a', file('vendor-a', FOLDER_MIME, ['root-1'])],
    ['vendor-b', file('vendor-b', FOLDER_MIME, ['root-1'])],
    ['nested-a', file('nested-a', FOLDER_MIME, ['vendor-a'])],
    ['nested-a-2', file('nested-a-2', FOLDER_MIME, ['vendor-a'])],
    ['nested-b', file('nested-b', FOLDER_MIME, ['vendor-b'])],
    ['source-root', file('source-root', TEXT_MIME, ['root-1'])],
    ['native-doc', file('native-doc', 'application/vnd.google-apps.document', ['root-1'])],
    ['source-a', file('source-a', TEXT_MIME, ['nested-a'])],
    ['source-a-2', file('source-a-2', TEXT_MIME, ['nested-a-2'])],
    ['source-multi', file('source-multi', TEXT_MIME, ['nested-a', 'nested-a-2'])],
    ['source-ambiguous', file('source-ambiguous', TEXT_MIME, ['nested-a', 'nested-b'])],
    ['source-outside', file('source-outside', TEXT_MIME, ['outside-folder'])],
    ['source-missing-parent', file('source-missing-parent', TEXT_MIME, ['unknown-parent'])],
    ['cycle-a', file('cycle-a', FOLDER_MIME, ['cycle-b'])],
    ['cycle-b', file('cycle-b', FOLDER_MIME, ['cycle-a'])],
    ['source-cycle', file('source-cycle', TEXT_MIME, ['cycle-a'])],
    ['shortcut-1', file('shortcut-1', SHORTCUT_MIME, ['vendor-a'], {
      shortcutDetails: { targetId: 'external-target', targetMimeType: TEXT_MIME }
    })],
    ['external-target', file('external-target', TEXT_MIME, ['outside-folder'])]
  ]);
}

class FakeTransport {
  constructor() {
    this.permissionId = 'permission-1';
    this.graph = baseGraph();
    this.calls = [];
    this.failures = new Map();
    this.never = new Set();
    this.contentHashes = new Map(Array.from(this.graph.keys()).map((fileId, index) => [
      fileId,
      'sha256:' + ((index % 15) + 1).toString(16).repeat(64)
    ]));
  }

  setFailure(key, kind, status = null) {
    this.failures.set(key, failed(kind, status));
  }

  clearFailure(key) {
    this.failures.delete(key);
  }

  response(key, value, signal) {
    if (this.never.has(key)) return new Promise((resolve) => {
      if (!signal || signal.aborted) return resolve(failed('transient'));
      signal.addEventListener('abort', () => resolve(failed('transient')), { once: true });
    });
    return Promise.resolve(this.failures.get(key) || ok(value));
  }

  about(signal) {
    this.calls.push({ method: 'about', signal });
    return this.response('about', { permissionId: this.permissionId }, signal);
  }

  getFile(input, signal) {
    this.calls.push({
      method: 'getFile',
      fileId: input && input.fileId,
      resourceKey: input && input.resourceKey,
      signal
    });
    const id = input && input.fileId;
    if (this.failures.has(`getFile:${id}`) || this.never.has(`getFile:${id}`)) {
      return this.response(`getFile:${id}`, null, signal);
    }
    const value = this.graph.get(id);
    return Promise.resolve(value ? ok(file(value.id, value.mimeType, value.parents, value)) : failed('not-found', 404));
  }

  async readContent(input, sink, signal) {
    const fileId = input && input.fileId;
    this.calls.push({ method: 'readContent', fileId, mimeType: input && input.mimeType, signal });
    if (this.failures.has(`readContent:${fileId}`) || this.never.has(`readContent:${fileId}`)) {
      return this.response(`readContent:${fileId}`, null, signal);
    }
    const byteHash = this.contentHashes.get(fileId);
    if (!byteHash || typeof sink !== 'function') return failed('not-found', 404);
    await sink({ byteHash }, signal);
    return ok({ byteHash });
  }

  listChildren(input, signal) {
    const parentFileId = input && input.parentFileId;
    this.calls.push({
      method: 'listChildren',
      parentFileId,
      resourceKey: input && input.resourceKey,
      signal
    });
    if (this.failures.has(`listChildren:${parentFileId}`) || this.never.has(`listChildren:${parentFileId}`)) {
      return this.response(`listChildren:${parentFileId}`, null, signal);
    }
    const files = Array.from(this.graph.values())
      .filter((entry) => entry.parents.includes(parentFileId))
      .map((entry) => file(entry.id, entry.mimeType, entry.parents, entry));
    return Promise.resolve(ok({ files, nextPageToken: null, incompleteSearch: false }));
  }
}

class FakeStore {
  constructor(claim, sourceIds = []) {
    this.activeClaim = claim ? Object.assign({}, claim) : null;
    this.authorityEpoch = claim ? 7 : 0;
    this.sources = new Map(sourceIds.map((sourceFileId, index) => [sourceFileId, {
      sourceFileId,
      visibility: 'active',
      state: 'ready',
      sourceEpoch: index + 1
    }]));
    this.calls = [];
    this.handleSequence = 0;
    this.pendingHandle = null;
    this.mutationSequence = 0;
    this.mutationGuards = new WeakSet();
  }

  issueMutation(signal) {
    if (!signal || signal.aborted) return null;
    const guard = Object.freeze({
      signal,
      operationToken: Object.freeze({}),
      operationEpoch: ++this.mutationSequence
    });
    this.mutationGuards.add(guard);
    return guard;
  }

  finishMutation(guard) {
    if (!guard || !this.mutationGuards.has(guard)) return { ok: false };
    this.mutationGuards.delete(guard);
    return { ok: true, status: 'finished' };
  }

  mutationOpen(guard) {
    return !!guard && this.mutationGuards.has(guard) && guard.signal.aborted === false;
  }

  matches(claim) {
    return !!this.activeClaim && !!claim &&
      this.activeClaim.accountPermissionId === claim.accountPermissionId &&
      this.activeClaim.corpusRootFileId === claim.corpusRootFileId;
  }

  async getVisibleManifest(claim) {
    this.calls.push({ method: 'getVisibleManifest', claim: claim && Object.assign({}, claim) });
    if (!this.matches(claim)) return null;
    return {
      version: 'skopeo-corpus-store/v1',
      partitionKey: `partition:${claim.accountPermissionId}:${claim.corpusRootFileId}`,
      accountPermissionId: claim.accountPermissionId,
      corpusRootFileId: claim.corpusRootFileId,
      authorityEpoch: this.authorityEpoch,
      checkpoint: { version: CHECKPOINT_VERSION, kind: 'full', cursor: 'cursor-1', sourceCount: this.sources.size },
      sources: Array.from(this.sources.values()).filter((entry) => entry.visibility === 'active')
        .map((entry) => Object.assign({}, entry))
    };
  }

  async getHiddenSourceState(claim, sourceFileId) {
    this.calls.push({
      method: 'getHiddenSourceState',
      claim: claim && Object.assign({}, claim),
      sourceFileId
    });
    if (!this.matches(claim)) return null;
    const source = this.sources.get(sourceFileId);
    return source && ['pending', 'inaccessible', 'missing'].includes(source.state)
      ? source.state
      : null;
  }

  async recover(input, guard) {
    if (!this.mutationOpen(guard)) return { ok: false, status: 'stale-operation' };
    this.calls.push({ method: 'recover', input: Object.assign({}, input) });
    if (!Object.prototype.hasOwnProperty.call(input, 'provenAccountPermissionId')) {
      this.authorityEpoch += 1;
      return { ok: true, status: 'unproven' };
    }
    if (this.activeClaim && this.activeClaim.accountPermissionId !== input.provenAccountPermissionId) {
      this.authorityEpoch += 1;
      this.activeClaim = null;
      this.sources.clear();
      return { ok: true, status: 'purged' };
    }
    return this.activeClaim
      ? { ok: true, status: 'active', claim: Object.assign({}, this.activeClaim) }
      : { ok: true, status: 'closed' };
  }

  async withdrawPartition(claim, reason, guard) {
    if (!this.mutationOpen(guard)) return { ok: false, status: 'stale-operation' };
    this.calls.push({ method: 'withdrawPartition', claim: Object.assign({}, claim), reason });
    this.authorityEpoch += 1;
    if (this.matches(claim)) this.activeClaim = null;
    return { ok: true, status: 'withdrawn' };
  }

  async purgePartition(claim, reason, guard) {
    if (!this.mutationOpen(guard)) return { ok: false, status: 'stale-operation' };
    this.calls.push({ method: 'purgePartition', claim: Object.assign({}, claim), reason });
    this.sources.clear();
    return { ok: true, status: 'purged' };
  }

  async transitionSource(claim, sourceFileId, source, guard) {
    if (!this.mutationOpen(guard)) return { ok: false, status: 'stale-operation' };
    this.calls.push({
      method: 'transitionSource',
      claim: Object.assign({}, claim),
      sourceFileId,
      source
    });
    if (!this.matches(claim) || !this.sources.has(sourceFileId)) {
      return { ok: false, status: 'invalid-transition' };
    }
    this.sources.set(sourceFileId, source);
    return { ok: true, status: 'transitioned' };
  }

  async purgeSource(claim, sourceFileId, reason, guard) {
    if (!this.mutationOpen(guard)) return { ok: false, status: 'stale-operation' };
    this.calls.push({
      method: 'purgeSource',
      claim: Object.assign({}, claim),
      sourceFileId,
      reason
    });
    this.sources.delete(sourceFileId);
    return { ok: true, status: 'purged' };
  }

  async invalidateSource(claim, sourceFileId, source, reason, guard) {
    if (!this.mutationOpen(guard)) return { ok: false, status: 'stale-operation' };
    this.calls.push({
      method: 'transitionSource',
      claim: Object.assign({}, claim),
      sourceFileId,
      source
    });
    this.calls.push({
      method: 'purgeSource',
      claim: Object.assign({}, claim),
      sourceFileId,
      reason
    });
    if (!this.matches(claim) || !this.sources.has(sourceFileId)) {
      return { ok: false, status: 'invalid-transition' };
    }
    this.sources.set(sourceFileId, source);
    return { ok: true, status: 'purged' };
  }

  async beginReplacement(claim, guard) {
    if (!this.mutationOpen(guard)) return { ok: false, status: 'stale-operation' };
    this.calls.push({ method: 'beginReplacement', claim: Object.assign({}, claim) });
    this.authorityEpoch += 1;
    this.handleSequence += 1;
    this.pendingHandle = Object.freeze({
      version: 'skopeo-corpus-handle/v1',
      partitionKey: `partition:${claim.accountPermissionId}:${claim.corpusRootFileId}`,
      accountPermissionId: claim.accountPermissionId,
      corpusRootFileId: claim.corpusRootFileId,
      operationEpoch: this.authorityEpoch,
      sequence: this.handleSequence
    });
    return this.pendingHandle;
  }

  async commitInventory(handle, checkpoint, guard) {
    if (!this.mutationOpen(guard)) return { ok: false, status: 'stale-operation' };
    this.calls.push({ method: 'commitInventory', handle, checkpoint: Object.assign({}, checkpoint) });
    if (handle !== this.pendingHandle) return { ok: false, status: 'stale-operation' };
    this.activeClaim = {
      accountPermissionId: handle.accountPermissionId,
      corpusRootFileId: handle.corpusRootFileId
    };
    this.pendingHandle = null;
    return { ok: true, status: 'active' };
  }
}

function makeBaseContext() {
  return {
    tabId: 77,
    origin: DRIVE_ORIGIN,
    generation: 4,
    profileId: 'gdrive-profile',
    profileVersion: 3,
    contextEpoch: 9,
    contextKind: 'agreement-reading',
    entityKind: 'drive-file',
    entityId: 'source-root'
  };
}

function makeOperationContext(base, claim) {
  return Object.assign({}, base, claim);
}

function authorityLimits(overrides = {}) {
  return Object.assign({
    maxSourcesPerOperation: 4,
    maxAncestryDepth: 8,
    maxAncestryRequests: 48,
    maxParentPages: 4,
    maxOperationMs: 1000
  }, overrides);
}

function storedPhysicalChain(graph, sourceFileId, rootFileId) {
  const source = graph.get(sourceFileId);
  if (!source) return [rootFileId];
  const queue = source.parents.slice().sort().map(parentId => ({
    parentId,
    path: [parentId],
    visited: new Set([sourceFileId, parentId])
  }));
  while (queue.length > 0) {
    const current = queue.shift();
    if (current.parentId === rootFileId) return current.path.slice().reverse();
    const parent = graph.get(current.parentId);
    if (!parent) continue;
    for (const nextParent of parent.parents.slice().sort()) {
      if (current.visited.has(nextParent)) continue;
      const visited = new Set(current.visited);
      visited.add(nextParent);
      queue.push({
        parentId: nextParent,
        path: current.path.concat([nextParent]),
        visited
      });
    }
  }
  return [rootFileId];
}

function hydrateStoredFingerprints(store, transport, claim) {
  for (const [sourceFileId, source] of store.sources) {
    const live = transport.graph.get(sourceFileId);
    if (!live) continue;
    const chain = storedPhysicalChain(transport.graph, sourceFileId, claim.corpusRootFileId);
    const vendorScopeFileId = chain.length > 1 ? chain[1] : null;
    Object.assign(source, {
      displayName: live.name,
      metadataFingerprint: {
        version: require(SCHEMA_PATH).VERSION,
        kind: 'metadata',
        name: live.name,
        mimeType: live.mimeType,
        modifiedTime: live.modifiedTime,
        driveVersion: live.version,
        size: live.size,
        trashed: live.trashed,
        canDownload: live.capabilities.canDownload
      },
      membershipFingerprint: {
        version: require(SCHEMA_PATH).VERSION,
        kind: 'membership',
        corpusRootFileId: claim.corpusRootFileId,
        physicalParentChain: chain,
        vendorScopeFileId,
        driveId: live.driveId
      },
      contentFingerprint: {
        version: require(SCHEMA_PATH).VERSION,
        kind: 'content',
        evidenceKind: live.mimeType === 'application/vnd.google-apps.document'
          ? 'export-byte-hash'
          : 'download-byte-hash',
        value: transport.contentHashes.get(sourceFileId)
      }
    });
  }
}

function activeIngestionRecord(harness, sourceFileId) {
  const schema = require(SCHEMA_PATH);
  const stored = harness.store.sources.get(sourceFileId);
  if (!stored) return null;
  return schema.parseSourceRecord({
    version: schema.VERSION,
    sourceKey: schema.makeSourceKey({ ...harness.claim, sourceFileId }),
    partitionKey: schema.makePartitionKey(harness.claim),
    accountPermissionId: harness.claim.accountPermissionId,
    corpusRootFileId: harness.claim.corpusRootFileId,
    sourceFileId,
    visibility: 'active',
    state: 'ready',
    evidence: {
      tag: 'verified-readable',
      accountAccess: true,
      ancestry: true,
      contentPath: 'supported',
      downloadAllowed: true,
      contentFingerprint: 'current',
      processedFingerprint: 'current'
    },
    displayName: stored.displayName,
    metadataFingerprint: stored.metadataFingerprint,
    membershipFingerprint: stored.membershipFingerprint,
    contentFingerprint: stored.contentFingerprint
  });
}

function createAuthorityHarness(Authority, overrides = {}) {
  const claim = overrides.claim || {
    accountPermissionId: 'permission-1',
    corpusRootFileId: 'root-1'
  };
  const transport = overrides.transport || new FakeTransport();
  const store = overrides.store || new FakeStore(claim, [
    'source-root', 'native-doc', 'source-a', 'source-a-2', 'source-multi', 'source-ambiguous',
    'source-outside', 'source-missing-parent', 'source-cycle', 'shortcut-1'
  ]);
  const live = overrides.live || makeBaseContext();
  const controller = overrides.abortController || new AbortController();
  const schema = require(SCHEMA_PATH);
  hydrateStoredFingerprints(store, transport, claim);
  const scheduled = [];
  const authority = Authority.create({
    schema,
    store,
    transport,
    readLiveContext: () => Object.assign({}, live),
    now: overrides.now || (() => Date.now()),
    signal: controller.signal,
    scheduleReconciliation(context, sourceFileId) {
      scheduled.push({ context: Object.assign({}, context), sourceFileId });
      return true;
    },
    limits: authorityLimits(overrides.limits)
  });
  return { authority, claim, transport, store, live, controller, scheduled };
}

function assertClosedDecision(value, expected) {
  assert.ok(value && typeof value === 'object', 'closed decision exists');
  assert.equal(value.decision, expected);
  assert.equal(Object.prototype.hasOwnProperty.call(value, 'sourceFileId'), false,
    'withheld decisions reveal no stale source identifier');
  assert.equal(Object.prototype.hasOwnProperty.call(value, 'value'), false,
    'withheld decisions reveal no callback output');
}

function settleWithin(promise, milliseconds) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ settled: false }), milliseconds);
    Promise.resolve(promise).then((value) => {
      clearTimeout(timer);
      resolve({ settled: true, value });
    }, (error) => {
      clearTimeout(timer);
      resolve({ settled: true, error });
    });
  });
}

async function begin(harness, kind = 'display') {
  return harness.authority.beginOperation(kind, makeOperationContext(harness.live, harness.claim));
}

async function publishPreparedEffect(preparedValue, publisher) {
  return publisher.publish(async () => preparedValue);
}

async function testAuthoritySurface(Authority) {
  assert.strictEqual(globalThis.FsbSkopeoDriveAuthority, Authority,
    'classic global matches the CommonJS Drive authority export');
  assert.equal(Object.isFrozen(Authority), true);
  assert.deepEqual(Object.keys(Authority).sort(), [
    'LIMITS', 'OPERATION_KINDS', 'VERSION', 'create'
  ]);
  assert.deepEqual(Authority.OPERATION_KINDS, OPERATION_KINDS);
  assert.equal(Authority.LIMITS.MAX_SOURCES_PER_OPERATION >= 1, true);

  const harness = createAuthorityHarness(Authority);
  assert.ok(harness.authority);
  assert.equal(Object.isFrozen(harness.authority), true);
  assert.deepEqual(Object.keys(harness.authority).sort(), [
    'beginOperation',
    'certifySource',
    'certifySources',
    'finishOperation',
    'readHiddenSourceState',
    'runWithCertifiedSource',
    'runWithCertifiedSources'
  ]);

  for (const kind of OPERATION_KINDS) {
    const before = harness.transport.calls.length;
    const operation = await begin(harness, kind);
    assert.equal(operation.kind, kind, `${kind} creates an exact operation`);
    assert.equal(Object.isFrozen(operation), true);
    assert.throws(() => JSON.stringify(operation), /operation/i,
      `${kind} operation cannot be serialized/replayed`);
    const calls = harness.transport.calls.slice(before);
    assert.equal(calls.filter((call) => call.method === 'about').length, 1,
      `${kind} re-fetches permissionId`);
    assert.equal(calls.filter((call) => call.method === 'getFile' && call.fileId === 'root-1').length, 1,
      `${kind} re-fetches the exact enrolled root`);
    assert.equal(harness.authority.finishOperation(operation), true);
    assert.equal(harness.authority.finishOperation(operation), false,
      `${kind} operation destruction is one-shot`);
  }

  const callsBeforeForged = harness.transport.calls.length;
  for (const forged of [
    makeOperationContext(harness.live, Object.assign({}, harness.claim, { accountPermissionId: 'email@example.test' })),
    Object.assign(makeOperationContext(harness.live, harness.claim), { tabId: 99 }),
    Object.assign(makeOperationContext(harness.live, harness.claim), { origin: 'https://evil.example' }),
    Object.assign(makeOperationContext(harness.live, harness.claim), { generation: 5 }),
    Object.assign(makeOperationContext(harness.live, harness.claim), { contextEpoch: 10 }),
    Object.assign(makeOperationContext(harness.live, harness.claim), { corpusRootFileId: 'root-2' }),
    Object.assign(makeOperationContext(harness.live, harness.claim), { authuser: '0' })
  ]) {
    assertClosedDecision(await harness.authority.beginOperation('query', forged), 'closed');
  }
  assert.equal(harness.transport.calls.length, callsBeforeForged,
    'forged account/email/authuser/tab/origin/generation claims make zero Drive calls');

  const wrongKind = await harness.authority.beginOperation('search', makeOperationContext(harness.live, harness.claim));
  assertClosedDecision(wrongKind, 'closed');
}

async function testFreshRootGatedHiddenSourceStates(Authority) {
  for (const state of ['pending', 'inaccessible', 'missing']) {
    const harness = createAuthorityHarness(Authority);
    harness.store.sources.set('source-a', {
      sourceFileId: 'source-a',
      visibility: state === 'pending' ? 'withheld' : 'purging',
      state,
      privateDisplayName: `must-not-project-${state}`
    });
    const callsBefore = harness.transport.calls.length;
    const operation = await begin(harness, 'display');
    const result = await harness.authority.readHiddenSourceState(operation, 'source-a');
    assert.deepEqual(result, { decision: 'admitted', state },
      `${state} is returned only as a metadata-minimized state token`);
    assert.equal(JSON.stringify(result).includes('must-not-project'), false,
      `${state} returns no hidden source metadata`);
    assert.equal(harness.transport.calls.slice(callsBefore)
      .filter((call) => call.method === 'about').length, 1,
    `${state} status requires a fresh account proof`);
    assert.equal(harness.transport.calls.slice(callsBefore)
      .filter((call) => call.method === 'getFile' && call.fileId === 'root-1').length, 1,
    `${state} status requires a fresh enrolled-root proof`);
    assert.equal(harness.authority.finishOperation(operation), false,
      `${state} status consumes its operation exactly once`);
  }

  const queryHarness = createAuthorityHarness(Authority);
  queryHarness.store.sources.set('source-a', {
    sourceFileId: 'source-a', visibility: 'withheld', state: 'pending'
  });
  const queryOperation = await begin(queryHarness, 'query');
  assertClosedDecision(
    await queryHarness.authority.readHiddenSourceState(queryOperation, 'source-a'),
    'closed'
  );
  queryHarness.authority.finishOperation(queryOperation);
}

async function testAncestryAndCertificates(Authority) {
  const harness = createAuthorityHarness(Authority);
  const keyedParent = Object.freeze({ sourceFileId: 'vendor-a' });
  harness.transport.graph.get('vendor-a').resourceKey = keyedParent;
  const operation = await begin(harness, 'query');

  const beforeCoalesce = harness.transport.calls.length;
  const [first, second] = await Promise.all([
    harness.authority.certifySource(operation, 'source-a'),
    harness.authority.certifySource(operation, 'source-a')
  ]);
  assert.strictEqual(first, second, 'identical source proof coalesces only within one operation');
  assert.equal(first.decision, 'certified');
  assert.equal(first.sourceFileId, 'source-a');
  assert.equal(first.vendorScopeFileId, 'vendor-a');
  assert.deepEqual(Array.from(first.physicalParentChain), ['root-1', 'vendor-a', 'nested-a']);
  assert.equal(Object.isFrozen(first), true);
  assert.throws(() => JSON.stringify(first), /certificate/i,
    'certificate is intentionally nonserializable');
  if (typeof structuredClone === 'function') {
    assert.throws(() => structuredClone(first), /clone|serial|DataClone/i,
      'certificate cannot cross a structured-clone/message boundary');
  }
  assert.equal(harness.transport.calls.slice(beforeCoalesce)
    .filter((call) => call.method === 'getFile' && call.fileId === 'source-a').length, 1,
  'concurrent same-operation proof performs one source read');
  assert.strictEqual(harness.transport.calls.find((call) =>
    call.method === 'listChildren' && call.parentFileId === 'vendor-a').resourceKey,
  keyedParent, 'ancestry listing carries only the freshly verified parent-folder key');

  const rootSource = await harness.authority.certifySource(operation, 'source-root');
  assert.equal(rootSource.decision, 'certified');
  assert.equal(rootSource.vendorScopeFileId, null, 'root files are corpus-wide');
  assert.deepEqual(Array.from(rootSource.physicalParentChain), ['root-1']);

  const multi = await harness.authority.certifySource(operation, 'source-multi');
  assert.equal(multi.decision, 'certified', 'multiple physical paths with one deterministic vendor are admitted');
  assert.equal(multi.vendorScopeFileId, 'vendor-a');

  assertClosedDecision(await harness.authority.certifySource(operation, 'source-ambiguous'), 'pending');
  assertClosedDecision(await harness.authority.certifySource(operation, 'source-outside'), 'inaccessible');
  assertClosedDecision(await harness.authority.certifySource(operation, 'source-cycle'), 'pending');
  assertClosedDecision(await harness.authority.certifySource(operation, 'source-missing-parent'), 'pending');

  const callsBeforeShortcut = harness.transport.calls.length;
  const shortcut = await harness.authority.certifySource(operation, 'shortcut-1');
  assert.equal(shortcut.decision, 'certified', 'a shortcut may be classified as its own in-root leaf');
  assert.equal(harness.transport.calls.slice(callsBeforeShortcut)
    .some((call) => call.method === 'getFile' && call.fileId === 'external-target'), false,
  'shortcut target is never traversed');

  for (const invalidId of ['', 'outside/id', '__proto__', null, { sourceFileId: 'source-a' }]) {
    assertClosedDecision(await harness.authority.certifySource(operation, invalidId), 'closed');
  }

  const set = await harness.authority.certifySources(operation, ['source-root', 'source-a']);
  assert.equal(set.decision, 'certified');
  assert.equal(set.complete, true);
  assert.deepEqual(set.certificates.map((certificate) => certificate.sourceFileId), [
    'source-root', 'source-a'
  ]);

  for (const invalidSet of [
    [],
    ['source-a', 'source-a'],
    ['source-a', 'source-root', 'source-a-2', 'source-multi', 'shortcut-1'],
    { 0: 'source-a', length: 1 },
    ['source-a', 'outside/id']
  ]) {
    assertClosedDecision(await harness.authority.certifySources(operation, invalidSet), 'closed');
  }

  const clone = Object.assign({}, first);
  assert.equal(harness.authority.finishOperation(clone), false, 'plain cloned certificate has no authority');
  assert.equal(harness.authority.finishOperation(first), false, 'certificate cannot impersonate its operation');
  assert.equal(harness.authority.finishOperation(operation), true);
  assertClosedDecision(await harness.authority.certifySource(operation, 'source-a'), 'closed');

  const secondOperation = await begin(harness, 'query');
  const beforeFresh = harness.transport.calls.length;
  const fresh = await harness.authority.certifySource(secondOperation, 'source-a');
  assert.equal(fresh.decision, 'certified');
  assert.notStrictEqual(fresh, first, 'certificate identity never crosses operation boundaries');
  assert.equal(harness.transport.calls.slice(beforeFresh)
    .filter((call) => call.method === 'getFile' && call.fileId === 'source-a').length, 1,
  'a later operation performs a fresh source proof');
  harness.authority.finishOperation(secondOperation);
}

async function testFailureMappingAndBounds(Authority) {
  for (const [kind, expected] of [
    ['transient', 'pending'],
    ['incomplete', 'pending'],
    ['denied', 'inaccessible'],
    ['not-found', 'inaccessible']
  ]) {
    const harness = createAuthorityHarness(Authority);
    const operation = await begin(harness, 'citation-open');
    harness.transport.setFailure('getFile:source-a', kind, kind === 'denied' ? 403 : (kind === 'not-found' ? 404 : null));
    assertClosedDecision(await harness.authority.certifySource(operation, 'source-a'), expected);
    const sourceClosure = harness.store.calls.filter((call) =>
      call.method === 'transitionSource' || call.method === 'purgeSource'
    ).map((call) => call.method);
    assert.equal(sourceClosure[0], 'transitionSource',
      `${kind} closes the source projection before returning ${expected}`);
    assert.equal(sourceClosure.includes('purgeSource'), expected === 'inaccessible',
      `${kind} purges only confirmed inaccessible source influence`);
    harness.authority.finishOperation(operation);
  }

  const identityHarness = createAuthorityHarness(Authority);
  identityHarness.transport.setFailure('about', 'transient');
  assertClosedDecision(await begin(identityHarness, 'display'), 'pending');
  assert.equal(identityHarness.store.calls.some((call) => call.method === 'recover' &&
    !Object.prototype.hasOwnProperty.call(call.input, 'provenAccountPermissionId')), true,
  'unavailable permissionId closes the durable projection as unproven');

  const switched = createAuthorityHarness(Authority);
  switched.transport.permissionId = 'permission-2';
  assertClosedDecision(await begin(switched, 'display'), 'closed');
  assert.equal(switched.store.calls.some((call) => call.method === 'recover' &&
    call.input.provenAccountPermissionId === 'permission-2'), true,
  'account mismatch invokes withdrawal/purge recovery before any output');

  const trashedRoot = createAuthorityHarness(Authority);
  trashedRoot.transport.graph.get('root-1').trashed = true;
  assertClosedDecision(await begin(trashedRoot, 'query'), 'inaccessible');
  assert.deepEqual(trashedRoot.store.calls.filter((call) =>
    call.method === 'withdrawPartition' || call.method === 'purgePartition'
  ).map((call) => call.method), ['withdrawPartition', 'purgePartition']);

  const depth = createAuthorityHarness(Authority, { limits: { maxAncestryDepth: 1 } });
  const depthOperation = await begin(depth, 'query');
  assertClosedDecision(await depth.authority.certifySource(depthOperation, 'source-a'), 'pending');
  depth.authority.finishOperation(depthOperation);

  const timeout = createAuthorityHarness(Authority, { limits: { maxOperationMs: 25 } });
  timeout.transport.never.add('getFile:source-a');
  const timeoutOperation = await begin(timeout, 'query');
  assertClosedDecision(await timeout.authority.certifySource(timeoutOperation, 'source-a'), 'pending');
  timeout.authority.finishOperation(timeoutOperation);

  const aborted = createAuthorityHarness(Authority);
  const abortedOperation = await begin(aborted, 'query');
  aborted.controller.abort('navigation');
  assertClosedDecision(await aborted.authority.certifySource(abortedOperation, 'source-root'), 'closed');
}

async function testPreOperationDriveEditsInvalidateProcessedState(Authority) {
  for (const kind of ['query', 'display', 'citation-open', 'alert-delivery']) {
    const harness = createAuthorityHarness(Authority);
    const edited = harness.transport.graph.get('source-a');
    edited.name = `Edited before ${kind}`;
    edited.version = '2';
    edited.modifiedTime = '2026-07-20T13:00:00.000Z';
    const operation = await begin(harness, kind);
    let callbacks = 0;
    const result = await harness.authority.runWithCertifiedSource(
      operation,
      'source-a',
      async () => {
        callbacks += 1;
        return { staleProcessedSentinel: `must-not-escape-${kind}` };
      },
      ['citation-open', 'alert-delivery'].includes(kind) ? publishPreparedEffect : undefined
    );
    assertClosedDecision(result, 'pending');
    assert.equal(callbacks, 0, `${kind} runs no callback for a pre-operation Drive edit`);
    assert.equal(JSON.stringify(result).includes('staleProcessedSentinel'), false);
    assert.deepEqual(harness.store.calls.filter((call) =>
      call.sourceFileId === 'source-a' &&
      (call.method === 'transitionSource' || call.method === 'purgeSource')
    ).map((call) => call.method), ['transitionSource', 'purgeSource'],
    `${kind} withholds before purging stale source-owned influence`);
    assert.deepEqual(harness.scheduled.map((entry) => entry.sourceFileId), ['source-a'],
      `${kind} schedules exact-source reconciliation after invalidation`);
  }

  {
    const harness = createAuthorityHarness(Authority);
    harness.transport.contentHashes.set('native-doc', 'sha256:' + 'f'.repeat(64));
    const operation = await begin(harness, 'query');
    let callbacks = 0;
    const result = await harness.authority.runWithCertifiedSource(
      operation,
      'native-doc',
      async () => {
        callbacks += 1;
        return { staleExportSentinel: true };
      }
    );
    assertClosedDecision(result, 'pending');
    assert.equal(callbacks, 0,
      'Google-native source without revision identity requires a current export hash');
    assert.equal(harness.transport.calls.some((call) =>
      call.method === 'readContent' && call.fileId === 'native-doc'), true);
    assert.equal(JSON.stringify(result).includes('staleExportSentinel'), false);
  }

  {
    const harness = createAuthorityHarness(Authority);
    harness.transport.graph.get('source-a').name = 'Current ingestion input';
    const operation = await begin(harness, 'ingestion');
    let callbacks = 0;
    const result = await harness.authority.runWithCertifiedSource(
      operation,
      'source-a',
      async () => {
        callbacks += 1;
        return { prepared: true };
      },
      publishPreparedEffect
    );
    assert.equal(result.decision, 'admitted',
      'ingestion may certify fresh Drive identity while replacing stale processed state');
    assert.equal(callbacks, 1);
  }
}

async function testNonDisplayPartialInfluenceIsWithheld(Authority) {
  for (const kind of ['ingestion', 'query', 'citation-open', 'alert-delivery']) {
    const harness = createAuthorityHarness(Authority);
    const operation = await begin(harness, kind);
    let callbacks = 0;
    const result = await harness.authority.runWithCertifiedSources(
      operation,
      ['source-root', 'source-a'],
      async (certificates, projection) => {
        callbacks += 1;
        assert.equal(projection.complete, true);
        assert.deepEqual(certificates.map((certificate) => certificate.sourceFileId), [
          'source-root', 'source-a'
        ]);
        harness.transport.graph.get('source-a').parents = ['outside-folder'];
        return {
          combinedAnswer: 'allowed-root-answer',
          revokedSourceSentinel: `must-not-escape-${kind}`,
          combinedCount: 2
        };
      },
      ['ingestion', 'citation-open', 'alert-delivery'].includes(kind)
        ? publishPreparedEffect
        : undefined
    );
    assert.equal(callbacks, 1, `${kind} performs one pure preparation callback`);
    assert.notEqual(result.decision, 'admitted', `${kind} requires complete final proof`);
    assert.notEqual(result.decision, 'partial', `${kind} never labels an unfiltered value partial`);
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'value'), false,
      `${kind} returns no unstructured callback value after revocation`);
    assert.equal(JSON.stringify(result).includes('revokedSourceSentinel'), false,
      `${kind} result contains zero revoked-source sentinel influence`);
  }
}

async function testEffectPreparationCommitAndCancellation(Authority, Controller) {
  for (const kind of ['ingestion', 'citation-open', 'alert-delivery']) {
    const harness = createAuthorityHarness(Authority);
    const operation = await begin(harness, kind);
    let prepared = 0;
    let committed = 0;
    let commitGuard = null;
    const result = await harness.authority.runWithCertifiedSource(
      operation,
      'source-a',
      async (certificate, operationSignal) => {
        prepared += 1;
        assert.equal(certificate.sourceFileId, 'source-a');
        assert.ok(operationSignal && typeof operationSignal.aborted === 'boolean',
          `${kind} preparation receives its operation AbortSignal`);
        return { intent: `${kind}-intent` };
      },
      async (intent, publisher) => {
        assert.deepEqual(intent, { intent: `${kind}-intent` });
        assert.ok(publisher && typeof publisher.publish === 'function');
        return publisher.publish(async (guard) => {
          commitGuard = guard;
          assert.strictEqual(guard.signal, publisher.signal,
            `${kind} durable effect shares the operation signal`);
          assert.strictEqual(guard.operationToken, publisher.operationToken,
            `${kind} durable effect receives the opaque publisher token`);
          assert.equal(guard.operationEpoch, publisher.operationEpoch,
            `${kind} durable effect receives the authority epoch`);
          assert.equal(guard.signal.aborted, false);
          committed += 1;
          return { committed: kind };
        });
      }
    );
    assert.equal(result.decision, 'admitted');
    assert.deepEqual(result.value, { committed: kind });
    assert.equal(prepared, 1);
    assert.equal(committed, 1);
    assert.ok(commitGuard);
    assert.equal(commitGuard.signal.aborted, true,
      `${kind} signal is terminal when the operation returns`);
  }

  for (const kind of ['ingestion', 'citation-open', 'alert-delivery']) {
    const harness = createAuthorityHarness(Authority);
    const operation = await begin(harness, kind);
    let commits = 0;
    const result = await harness.authority.runWithCertifiedSource(
      operation,
      'source-a',
      async (_certificate, operationSignal) => {
        assert.equal(operationSignal.aborted, false);
        harness.transport.graph.get('source-a').parents = ['outside-folder'];
        return { revokedIntent: kind };
      },
      async (_intent, publisher) => publisher.publish(async () => {
        commits += 1;
        return { forbidden: true };
      })
    );
    assert.notEqual(result.decision, 'admitted');
    assert.equal(commits, 0, `${kind} performs zero effect before final source proof`);
    assert.equal(JSON.stringify(result).includes('revokedIntent'), false);
  }

  {
    const harness = createAuthorityHarness(Authority, { limits: { maxOperationMs: 25 } });
    const operation = await begin(harness, 'alert-delivery');
    let cleanupComplete = false;
    let lateMutations = 0;
    let commits = 0;
    const result = await harness.authority.runWithCertifiedSource(
      operation,
      'source-root',
      async (_certificate, operationSignal) => new Promise((resolve) => {
        operationSignal.addEventListener('abort', async () => {
          await Promise.resolve();
          cleanupComplete = true;
          if (!operationSignal.aborted) lateMutations += 1;
          resolve({ intent: 'cancelled-before-commit' });
        }, { once: true });
      }),
      async (_intent, publisher) => publisher.publish(async () => {
        commits += 1;
        return { forbidden: true };
      })
    );
    assertClosedDecision(result, 'pending');
    assert.equal(cleanupComplete, true,
      'timed-out preparation is aborted and reaches terminal cleanup before return');
    assert.equal(commits, 0);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(lateMutations, 0, 'timed-out preparation causes zero late mutation');
  }

  {
    const harness = createAuthorityHarness(Authority, { limits: { maxOperationMs: 35 } });
    const operation = await begin(harness, 'alert-delivery');
    let effectStarted = false;
    let cleanupComplete = false;
    let lateMutations = 0;
    const result = await harness.authority.runWithCertifiedSource(
      operation,
      'source-root',
      async () => ({ outboxIntent: 'epoch-bound-alert' }),
      async (_intent, publisher) => publisher.publish(async (guard) => {
        effectStarted = true;
        return new Promise((resolve) => {
          guard.signal.addEventListener('abort', async () => {
            await Promise.resolve();
            cleanupComplete = true;
            if (!guard.signal.aborted) lateMutations += 1;
            resolve({ dispatched: false });
          }, { once: true });
        });
      })
    );
    assertClosedDecision(result, 'pending');
    assert.equal(effectStarted, true);
    assert.equal(cleanupComplete, true,
      'timed-out effect commit reaches terminal cleanup before return');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(lateMutations, 0, 'timed-out effect commit causes zero late dispatch');
  }

  {
    const harness = createAuthorityHarness(Authority);
    const operation = await begin(harness, 'citation-open');
    let preparationStarted;
    const started = new Promise((resolve) => { preparationStarted = resolve; });
    let cleanupComplete = false;
    let lateMutations = 0;
    const running = harness.authority.runWithCertifiedSource(
      operation,
      'source-root',
      async (_certificate, operationSignal) => new Promise((resolve) => {
        preparationStarted();
        operationSignal.addEventListener('abort', async () => {
          await Promise.resolve();
          cleanupComplete = true;
          if (!operationSignal.aborted) lateMutations += 1;
          resolve({ citationIntent: 'cancelled' });
        }, { once: true });
      }),
      publishPreparedEffect
    );
    await started;
    harness.controller.abort('navigation');
    const result = await running;
    assertClosedDecision(result, 'closed');
    assert.equal(cleanupComplete, true,
      'parent abort awaits preparation cleanup before returning closed');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(lateMutations, 0, 'aborted citation preparation causes zero late navigation');
  }

  {
    const harness = createControllerHarness(Controller);
    const enrollment = await harness.controller.enroll({ folderFileId: 'root-1' });
    assert.equal(enrollment.status, 'validating');
    let commitStarted = false;
    let cleanupComplete = false;
    let latePublications = 0;
    harness.store.commitInventory = async function(handle, checkpoint, guard) {
      this.calls.push({ method: 'commitInventory', handle, checkpoint, guard });
      commitStarted = true;
      assert.ok(guard && guard.signal && typeof guard.signal.aborted === 'boolean');
      assert.ok(guard.operationToken && typeof guard.operationToken === 'object');
      assert.equal(Number.isSafeInteger(guard.operationEpoch), true);
      return new Promise((resolve) => {
        guard.signal.addEventListener('abort', async () => {
          await Promise.resolve();
          cleanupComplete = true;
          if (!guard.signal.aborted) {
            latePublications += 1;
            this.activeClaim = {
              accountPermissionId: handle.accountPermissionId,
              corpusRootFileId: handle.corpusRootFileId
            };
          }
          resolve({ ok: false, status: 'cancelled' });
        }, { once: true });
      });
    };
    const timed = Controller.create({
      store: harness.store,
      transport: harness.transport,
      readLiveContext: () => Object.assign({}, harness.live),
      now: () => Date.now(),
      signal: harness.abortController.signal,
      limits: { maxOperationMs: 35 }
    });
    const replacement = await timed.enroll({ folderFileId: 'root-1' });
    assert.equal(replacement.status, 'validating');
    const activation = await timed.activateEnrollment(replacement.handle, {
      version: CHECKPOINT_VERSION,
      kind: 'full',
      cursor: 'cursor-timeout',
      sourceCount: 0
    });
    assert.deepEqual(activation, { ok: false, status: 'fail-quiet' });
    assert.equal(commitStarted, true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(cleanupComplete, true,
      'controller keeps terminal store cleanup alive after bounded fail-quiet return');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(latePublications, 0, 'timed-out enrollment commit cannot publish late');
  }
}

async function testIngestionRecordBindingsAndFinalValidation(Authority) {
  {
    const harness = createAuthorityHarness(Authority);
    const operation = await begin(harness, 'ingestion');
    const result = await harness.authority.runWithCertifiedSources(
      operation,
      [],
      async (certificates, proof) => {
        assert.deepEqual(certificates, []);
        assert.equal(proof.complete, true);
        return { records: [] };
      },
      async (prepared, publisher) => publisher.publish(
        async (guard) => ({ committed: await guard.validate(), prepared }),
        prepared.records
      )
    );
    assert.equal(result.decision, 'admitted',
      'an empty inventory still receives a fresh root-bound ingestion epoch');
    assert.deepEqual(result.value, { committed: true, prepared: { records: [] } });
  }

  {
    const harness = createAuthorityHarness(Authority);
    const operation = await begin(harness, 'ingestion');
    let effects = 0;
    const result = await harness.authority.runWithCertifiedSource(
      operation,
      'source-a',
      async () => activeIngestionRecord(harness, 'source-a'),
      async (record, publisher) => {
        harness.transport.contentHashes.set('source-a', 'sha256:' + 'e'.repeat(64));
        return publisher.publish(async () => {
          effects += 1;
          return { committed: true };
        }, [record]);
      }
    );
    assert.notEqual(result.decision, 'admitted');
    assert.equal(effects, 0,
      'the exact prepared content fingerprint is checked before an ingestion effect starts');
  }

  {
    const harness = createAuthorityHarness(Authority);
    const operation = await begin(harness, 'ingestion');
    let durableMutations = 0;
    const result = await harness.authority.runWithCertifiedSource(
      operation,
      'source-a',
      async () => activeIngestionRecord(harness, 'source-a'),
      async (record, publisher) => publisher.publish(async (guard) => {
        harness.transport.contentHashes.set('source-a', 'sha256:' + 'f'.repeat(64));
        if (await guard.validate()) durableMutations += 1;
        return { committed: durableMutations === 1 };
      }, [record])
    );
    assert.equal(result.decision, 'admitted');
    assert.deepEqual(result.value, { committed: false });
    assert.equal(durableMutations, 0,
      'the authority guard rechecks bound content immediately before durable publication');
  }

}

async function testNonCooperativeAwaitDeadlines(Authority, Controller) {
  {
    const harness = createAuthorityHarness(Authority, { limits: { maxOperationMs: 20 } });
    harness.transport.getFile = () => new Promise(() => {});
    const settled = await settleWithin(begin(harness, 'query'), 120);
    assert.equal(settled.settled, true,
      'authority deadline settles even when a Drive read ignores abort forever');
    assertClosedDecision(settled.value, 'pending');
  }

  {
    const harness = createControllerHarness(Controller, { maxOperationMs: 20 });
    harness.transport.about = () => new Promise(() => {});
    const settled = await settleWithin(harness.controller.recover(), 120);
    assert.equal(settled.settled, true,
      'controller deadline settles even when a transport read ignores abort forever');
    assert.deepEqual(settled.value, { ok: false, status: 'fail-quiet' });
  }
}

async function testFinalCurrentnessAndDisplay(Authority) {
  {
    const harness = createAuthorityHarness(Authority);
    const resourceKey = Object.freeze({ sourceFileId: 'source-a' });
    harness.transport.graph.get('source-a').resourceKey = resourceKey;
    const operation = await begin(harness, 'query');
    const admitted = await harness.authority.runWithCertifiedSource(
      operation,
      'source-a',
      async () => ({ answer: 'resource-keyed' })
    );
    assert.equal(admitted.decision, 'admitted');
    const sourceReads = harness.transport.calls.filter((call) =>
      call.method === 'getFile' && call.fileId === 'source-a');
    assert.equal(sourceReads.length >= 2, true,
      'final currentness performs a second exact-source metadata proof');
    assert.strictEqual(sourceReads.at(-1).resourceKey, resourceKey,
      'authority reuses only the opaque exact-source resource key during final proof');
  }

  {
    const harness = createAuthorityHarness(Authority);
    const operation = await begin(harness, 'query');
    let callbacks = 0;
    const admitted = await harness.authority.runWithCertifiedSource(operation, 'source-a', async (certificate) => {
      callbacks += 1;
      assert.equal(certificate.sourceFileId, 'source-a');
      await Promise.resolve();
      return { answer: 42 };
    });
    assert.equal(admitted.decision, 'admitted');
    assert.deepEqual(admitted.value, { answer: 42 });
    assert.equal(callbacks, 1);
    assertClosedDecision(await harness.authority.certifySource(operation, 'source-a'), 'closed');
  }

  {
    const harness = createAuthorityHarness(Authority);
    const operation = await begin(harness, 'query');
    let callbacks = 0;
    const withheld = await harness.authority.runWithCertifiedSource(operation, 'source-a', async () => {
      callbacks += 1;
      await Promise.resolve();
      harness.transport.graph.get('source-a').parents = ['outside-folder'];
      return { staleIdentifier: 'source-a', count: 99 };
    });
    assert.equal(callbacks, 1);
    assertClosedDecision(withheld, 'inaccessible');
    assert.equal(JSON.stringify(withheld).includes('staleIdentifier'), false);
  }

  {
    const harness = createAuthorityHarness(Authority);
    const operation = await begin(harness, 'display');
    const displayed = await harness.authority.runWithCertifiedSources(
      operation,
      ['source-root', 'source-a'],
      async (certificates, projection) => {
        assert.equal(projection.complete, true);
        await Promise.resolve();
        harness.transport.graph.get('source-a').parents = ['outside-folder'];
        return {
          rows: certificates.map((certificate) => ({
            sourceFileId: certificate.sourceFileId,
            value: { label: `row-${certificate.sourceFileId}`, count: 1 }
          })),
          aggregate: { count: certificates.length }
        };
      }
    );
    assert.equal(displayed.decision, 'partial');
    assert.deepEqual(displayed.rows.map((row) => row.sourceFileId), ['source-root']);
    assert.equal(displayed.aggregate, null,
      'display aggregate is absent unless the complete requested set remains current');
    assert.equal(JSON.stringify(displayed).includes('row-source-a'), false,
      'revoked source contributes no row, count, label, or state output');
  }

  {
    const harness = createAuthorityHarness(Authority);
    const operation = await begin(harness, 'display');
    const withheld = await harness.authority.runWithCertifiedSource(operation, 'source-root', async () => {
      await Promise.resolve();
      harness.live.contextEpoch += 1;
      return { row: 'stale-during-await' };
    });
    assertClosedDecision(withheld, 'closed');
  }

  {
    const harness = createAuthorityHarness(Authority);
    const operation = await begin(harness, 'alert-delivery');
    const withheld = await harness.authority.runWithCertifiedSource(
      operation,
      'source-root',
      async () => {
        await Promise.resolve();
        harness.store.authorityEpoch += 1;
        return { delivered: true };
      },
      publishPreparedEffect
    );
    assertClosedDecision(withheld, 'closed');
  }

  {
    const harness = createAuthorityHarness(Authority);
    const operation = await begin(harness, 'citation-open');
    const withheld = await harness.authority.runWithCertifiedSource(
      operation,
      'source-root',
      async () => {
        await Promise.resolve();
        harness.store.sources.get('source-root').sourceEpoch += 1;
        return { citation: 'stale-source-epoch' };
      },
      publishPreparedEffect
    );
    assertClosedDecision(withheld, 'closed');
    assert.equal(JSON.stringify(withheld).includes('citation'), false,
      'source epoch advancement during callback withholds the citation');
  }

  {
    const harness = createAuthorityHarness(Authority);
    const operation = await begin(harness, 'query');
    const withheld = await harness.authority.runWithCertifiedSource(operation, 'source-root', async () => {
      await Promise.resolve();
      harness.transport.permissionId = 'permission-2';
      return { answer: 'stale-account' };
    });
    assertClosedDecision(withheld, 'closed');
  }

  {
    const harness = createAuthorityHarness(Authority);
    const operation = await begin(harness, 'display');
    let callbackCalls = 0;
    harness.transport.setFailure('getFile:source-a', 'denied', 403);
    const partial = await harness.authority.runWithCertifiedSources(
      operation,
      ['source-root', 'source-a'],
      async (certificates, projection) => {
        callbackCalls += 1;
        assert.equal(projection.complete, false);
        assert.deepEqual(certificates.map((certificate) => certificate.sourceFileId), ['source-root']);
        return {
          rows: [{ sourceFileId: 'source-root', value: { count: 1 } }],
          aggregate: { count: 2 }
        };
      }
    );
    assert.equal(callbackCalls, 1);
    assert.equal(partial.decision, 'partial');
    assert.deepEqual(partial.rows, [{ sourceFileId: 'source-root', value: { count: 1 } }]);
    assert.equal(partial.aggregate, null);
  }

  {
    const harness = createAuthorityHarness(Authority);
    const operation = await begin(harness, 'display');
    let callbackCalls = 0;
    const rejected = await harness.authority.runWithCertifiedSources(
      operation,
      ['source-root'],
      async () => {
        callbackCalls += 1;
        return {
          rows: [{ sourceFileId: 'source-a', value: { leaked: true } }],
          aggregate: null
        };
      }
    );
    assert.equal(callbackCalls, 1);
    assertClosedDecision(rejected, 'closed');
  }
}

function createControllerHarness(Controller, options = {}) {
  const claim = options.claim || null;
  const store = options.store || new FakeStore(claim, []);
  const transport = options.transport || new FakeTransport();
  const live = options.live || Object.assign(makeBaseContext(), {
    contextKind: 'configured-corpus',
    entityKind: 'drive-folder',
    entityId: claim ? claim.corpusRootFileId : 'root-1'
  });
  const abortController = new AbortController();
  const controller = Controller.create({
    store,
    transport,
    readLiveContext: () => Object.assign({}, live),
    now: () => Date.now(),
    signal: abortController.signal,
    limits: { maxOperationMs: options.maxOperationMs || 1000 }
  });
  return { controller, store, transport, live, abortController };
}

async function testControllerSurface(Controller) {
  assert.strictEqual(globalThis.FsbSkopeoCorpusController, Controller,
    'classic global matches the CommonJS corpus controller export');
  assert.equal(Object.isFrozen(Controller), true);
  assert.deepEqual(Object.keys(Controller).sort(), ['FOLDER_MIME', 'STATUS', 'VERSION', 'create']);
  assert.equal(Controller.FOLDER_MIME, FOLDER_MIME);
  assert.deepEqual(Controller.STATUS, ['unconfigured', 'validating', 'active', 'fail-quiet']);

  const harness = createControllerHarness(Controller);
  assert.equal(Object.isFrozen(harness.controller), true);
  assert.deepEqual(Object.keys(harness.controller).sort(), [
    'activateEnrollment', 'enroll', 'getCurrentClaim', 'getRootStatus', 'getStatus',
    'recover', 'revalidate', 'withdraw'
  ]);
  assert.deepEqual(harness.controller.getStatus(), { status: 'unconfigured' });
  assert.equal(harness.controller.getCurrentClaim(), null);

  const beforeForged = harness.transport.calls.length;
  for (const input of [
    { folderFileId: 'root-1', email: 'spoof@example.test' },
    { folderFileId: 'root-1', authuser: '0' },
    { folderFileId: 'root-2' },
    'root-1'
  ]) {
    if (input && input.folderFileId === 'root-2') harness.live.entityId = 'root-1';
    const result = await harness.controller.enroll(input);
    assert.equal(result.ok, false);
  }
  assert.equal(harness.transport.calls.length, beforeForged,
    'arbitrary IDs and page identity hints make zero enrollment Drive calls');

  const enrollment = await harness.controller.enroll({ folderFileId: 'root-1' });
  assert.equal(enrollment.ok, true);
  assert.equal(enrollment.status, 'validating');
  assert.ok(enrollment.handle);
  assert.deepEqual(harness.controller.getStatus(), { status: 'validating' });
  assert.deepEqual(harness.controller.getCurrentClaim(), {
    accountPermissionId: 'permission-1', corpusRootFileId: 'root-1'
  });

  const activation = await harness.controller.activateEnrollment(enrollment.handle, {
    version: CHECKPOINT_VERSION,
    kind: 'full',
    cursor: 'cursor-root-1',
    sourceCount: 0
  });
  assert.deepEqual(activation, { ok: true, status: 'active' });
  assert.deepEqual(harness.controller.getStatus(), { status: 'active' });

  const beginCount = harness.store.calls.filter((call) => call.method === 'beginReplacement').length;
  const idempotent = await harness.controller.enroll({ folderFileId: 'root-1' });
  assert.deepEqual(idempotent, { ok: true, status: 'active', handle: null });
  assert.equal(harness.store.calls.filter((call) => call.method === 'beginReplacement').length, beginCount,
    'same-root enrollment is idempotent after fresh proof');

  harness.transport.graph.get('root-1').name = 'Renamed root';
  harness.transport.graph.get('root-1').parents = ['another-location'];
  assert.deepEqual(await harness.controller.revalidate(), { ok: true, status: 'active' },
    'root rename/move preserves stable-ID enrollment');

  harness.live.entityId = 'root-2';
  const replacement = await harness.controller.enroll({ folderFileId: 'root-2' });
  assert.equal(replacement.ok, true);
  assert.equal(replacement.status, 'validating');
  const transitionCalls = harness.store.calls.filter((call) => [
    'withdrawPartition', 'purgePartition', 'beginReplacement'
  ].includes(call.method)).slice(-3).map((call) => call.method);
  assert.deepEqual(transitionCalls, ['withdrawPartition', 'purgePartition', 'beginReplacement'],
    'old corpus is withdrawn and purged before replacement staging');
}

async function testControllerExactRootStatus(Controller) {
  {
    const claim = { accountPermissionId: 'permission-1', corpusRootFileId: 'root-1' };
    const harness = createControllerHarness(Controller, { claim });
    const status = await harness.controller.getRootStatus({ folderFileId: 'root-1' });
    assert.deepEqual(status, { ok: true, status: 'active' },
      'fresh account/root proof recognizes the exact active root');
    assert.equal(harness.transport.calls.filter((call) => call.method === 'about').length, 1);
    assert.equal(harness.transport.calls.filter((call) =>
      call.method === 'getFile' && call.fileId === 'root-1').length, 1);
    assert.equal(harness.store.calls.some((call) => call.method === 'beginReplacement'), false,
      'root status never enters replacement staging');
  }

  {
    const claim = { accountPermissionId: 'permission-1', corpusRootFileId: 'root-1' };
    const live = Object.assign(makeBaseContext(), {
      contextKind: 'configured-corpus', entityKind: 'drive-folder', entityId: 'root-2'
    });
    const harness = createControllerHarness(Controller, { claim, live });
    const status = await harness.controller.getRootStatus({ folderFileId: 'root-2' });
    assert.deepEqual(status, { ok: true, status: 'unconfigured' },
      'a freshly proved different folder remains an enrollment candidate');
    assert.deepEqual(harness.controller.getCurrentClaim(), claim,
      'checking another folder does not replace the active root');
    assert.equal(harness.store.calls.some((call) =>
      ['withdrawPartition', 'purgePartition', 'beginReplacement'].includes(call.method)), false,
    'different-root status is non-destructive');
  }

  {
    const harness = createControllerHarness(Controller);
    const status = await harness.controller.getRootStatus({ folderFileId: 'root-1' });
    assert.deepEqual(status, { ok: true, status: 'unconfigured' },
      'a freshly proved folder with no enrollment projects enrollment');
  }

  {
    const harness = createControllerHarness(Controller);
    const enrollment = await harness.controller.enroll({ folderFileId: 'root-1' });
    assert.equal(enrollment.status, 'validating');
    const status = await harness.controller.getRootStatus({ folderFileId: 'root-1' });
    assert.deepEqual(status, { ok: true, status: 'validating' },
      'an exact in-flight enrollment remains fail-quiet validating');
  }

  {
    const harness = createControllerHarness(Controller);
    harness.transport.setFailure('about', 'transient');
    assert.deepEqual(
      await harness.controller.getRootStatus({ folderFileId: 'root-1' }),
      { ok: false, status: 'fail-quiet' },
      'unproved folder status fails quiet instead of offering enrollment'
    );
  }
}

async function testControllerClosure(Controller) {
  {
    const claim = { accountPermissionId: 'permission-1', corpusRootFileId: 'root-1' };
    const live = Object.assign(makeBaseContext(), {
      contextKind: 'configured-corpus',
      entityKind: 'drive-folder',
      entityId: 'root-2'
    });
    const harness = createControllerHarness(Controller, { claim, live });
    const recovered = await harness.controller.recover();
    assert.deepEqual(recovered, { ok: true, status: 'active' });
    assert.deepEqual(harness.controller.getCurrentClaim(), claim,
      'wake while viewing root B revives only persisted root A');
    assert.equal(harness.transport.calls.some((call) =>
      call.method === 'getFile' && call.fileId === 'root-2'), false,
    'wake never infers enrollment from the currently viewed folder');
  }

  {
    const claim = { accountPermissionId: 'permission-1', corpusRootFileId: 'root-1' };
    const live = Object.assign(makeBaseContext(), {
      origin: DOCS_ORIGIN,
      contextKind: 'agreement-reading',
      entityKind: 'docs-document',
      entityId: 'source-root'
    });
    const harness = createControllerHarness(Controller, { claim, live });
    const recovered = await harness.controller.recover();
    assert.deepEqual(recovered, { ok: true, status: 'active' });
    assert.deepEqual(harness.controller.getCurrentClaim(), claim,
      'wake from a Docs document recovers the persisted enrollment root');
  }

  {
    const claim = { accountPermissionId: 'permission-1', corpusRootFileId: 'root-1' };
    const harness = createControllerHarness(Controller, { claim });
    await harness.controller.recover();
    harness.transport.permissionId = 'permission-2';
    const mismatch = await harness.controller.revalidate();
    assert.deepEqual(mismatch, { ok: false, status: 'fail-quiet' });
    assert.deepEqual(harness.store.calls.filter((call) => [
      'withdrawPartition', 'purgePartition'
    ].includes(call.method)).map((call) => call.method).slice(-2), [
      'withdrawPartition', 'purgePartition'
    ]);
    assert.equal(harness.controller.getCurrentClaim(), null,
      'account mismatch clears trusted active claim after purge');
  }

  {
    const claim = { accountPermissionId: 'permission-1', corpusRootFileId: 'root-1' };
    const harness = createControllerHarness(Controller, { claim });
    await harness.controller.recover();
    harness.transport.setFailure('about', 'transient');
    const unavailable = await harness.controller.revalidate();
    assert.deepEqual(unavailable, { ok: false, status: 'fail-quiet' });
    assert.equal(harness.store.calls.some((call) => call.method === 'recover' &&
      !Object.prototype.hasOwnProperty.call(call.input, 'provenAccountPermissionId')), true,
    'identity-unavailable state is durably unproven and neutral');
    assert.deepEqual(harness.controller.getStatus(), { status: 'fail-quiet' });
  }

  for (const setup of [
    (transport) => { transport.graph.get('root-1').trashed = true; },
    (transport) => { transport.setFailure('getFile:root-1', 'denied', 403); },
    (transport) => { transport.setFailure('getFile:root-1', 'not-found', 404); }
  ]) {
    const claim = { accountPermissionId: 'permission-1', corpusRootFileId: 'root-1' };
    const harness = createControllerHarness(Controller, { claim });
    await harness.controller.recover();
    setup(harness.transport);
    const closed = await harness.controller.revalidate();
    assert.deepEqual(closed, { ok: false, status: 'fail-quiet' });
    assert.deepEqual(harness.store.calls.filter((call) => [
      'withdrawPartition', 'purgePartition'
    ].includes(call.method)).map((call) => call.method).slice(-2), [
      'withdrawPartition', 'purgePartition'
    ], 'trash/delete/lost access withdraws then purges');
  }

  for (const mutate of [
    (transport) => { transport.graph.get('root-1').mimeType = TEXT_MIME; },
    (transport) => {
      transport.graph.get('root-1').mimeType = SHORTCUT_MIME;
      transport.graph.get('root-1').shortcutDetails = {
        targetId: 'root-2', targetMimeType: FOLDER_MIME
      };
    },
    (transport) => { transport.graph.get('root-1').capabilities.canListChildren = false; }
  ]) {
    const harness = createControllerHarness(Controller);
    mutate(harness.transport);
    const rejected = await harness.controller.enroll({ folderFileId: 'root-1' });
    assert.deepEqual(rejected, { ok: false, status: 'fail-quiet' });
    assert.equal(harness.store.calls.some((call) => call.method === 'beginReplacement'), false,
      'file/shortcut/unlistable roots never enter replacement staging');
  }

  {
    const claim = { accountPermissionId: 'permission-1', corpusRootFileId: 'root-1' };
    const harness = createControllerHarness(Controller, { claim });
    await harness.controller.recover();
    const result = await harness.controller.withdraw({ reason: 'user-withdrawn' });
    assert.deepEqual(result, { ok: true, status: 'unconfigured' });
    assert.deepEqual(harness.store.calls.filter((call) => [
      'withdrawPartition', 'purgePartition'
    ].includes(call.method)).map((call) => call.method).slice(-2), [
      'withdrawPartition', 'purgePartition'
    ]);
  }
}

async function testSourceStateContract(Authority) {
  const readyHarness = createAuthorityHarness(Authority);
  const readyOperation = await begin(readyHarness, 'query');
  const ready = await readyHarness.authority.certifySource(readyOperation, 'source-a');
  if (!Object.prototype.hasOwnProperty.call(ready, 'sourceState')) {
    readyHarness.authority.finishOperation(readyOperation);
    throw new Error('skopeo drive authority sourceState contract');
  }
  assert.equal(ready.sourceState, 'ready',
    'certificate carries the exact manifest source state beside its fingerprints');
  assert.equal(typeof ready.sourceState, 'string');
  assert.equal(Object.prototype.hasOwnProperty.call(ready, 'filename'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(ready, 'url'), false);
  assert.throws(() => JSON.stringify(ready), /certificate/i,
    'adding source state does not make a certificate serializable');
  if (typeof structuredClone === 'function') {
    assert.throws(() => structuredClone(ready), /clone|serial|DataClone/i,
      'adding source state does not make a certificate cloneable');
  }
  readyHarness.authority.finishOperation(readyOperation);

  for (const state of ['unreadable', 'download-blocked']) {
    const harness = createAuthorityHarness(Authority);
    const stored = harness.store.sources.get('source-a');
    stored.state = state;
    stored.contentFingerprint = null;
    const operation = await begin(harness, 'query');
    const certificate = await harness.authority.certifySource(operation, 'source-a');
    assert.equal(certificate.decision, 'certified',
      `${state} remains positively certifiable as an exact access/currentness state`);
    assert.equal(certificate.sourceState, state,
      `${state} is copied from the same canonical manifest record`);
    assert.equal(certificate.contentFingerprint, null,
      `${state} never manufactures a readable content fingerprint`);
    assert.equal(Object.prototype.hasOwnProperty.call(certificate, 'filename'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(certificate, 'url'), false);
    harness.authority.finishOperation(operation);
  }

  for (const state of ['pending', 'inaccessible', 'missing']) {
    const harness = createAuthorityHarness(Authority);
    const stored = harness.store.sources.get('source-a');
    stored.state = state;
    stored.contentFingerprint = null;
    const operation = await begin(harness, 'query');
    const result = await harness.authority.certifySource(operation, 'source-a');
    assertClosedDecision(result, state === 'pending' ? 'pending' : 'inaccessible');
    assert.equal(JSON.stringify(result).includes('Name source-a'), false,
      `${state} closure exposes neither filename nor URL`);
    harness.authority.finishOperation(operation);
  }

  {
    const harness = createAuthorityHarness(Authority);
    const operation = await begin(harness, 'query');
    const result = await harness.authority.runWithCertifiedSource(
      operation,
      'source-a',
      async (certificate) => {
        assert.equal(certificate.sourceState, 'ready');
        const stored = harness.store.sources.get('source-a');
        stored.state = 'unreadable';
        stored.contentFingerprint = null;
        return { forbiddenPartial: true };
      }
    );
    assertClosedDecision(result, 'closed');
  }

  {
    const harness = createAuthorityHarness(Authority);
    const operation = await begin(harness, 'query');
    const result = await harness.authority.runWithCertifiedSource(
      operation,
      'source-a',
      async () => {
        harness.store.authorityEpoch += 1;
        return { forbiddenPartial: true };
      }
    );
    assertClosedDecision(result, 'closed');
  }
}

async function main() {
  delete globalThis.FsbSkopeoDriveAuthority;
  delete globalThis.FsbSkopeoCorpusController;

  // Controlled RED: the full oracle below is production-facing, but Task 1 must
  // fail first and only because these two classic-script contracts are absent.
  if (!fs.existsSync(AUTHORITY_PATH) || !fs.existsSync(CONTROLLER_PATH)) {
    throw new Error(
      'FsbSkopeoDriveAuthority/FsbSkopeoCorpusController missing: ' +
      'extension/utils/skopeo-drive-authority.js and corpus controller are required'
    );
  }

  const Authority = require(AUTHORITY_PATH);
  const Controller = require(CONTROLLER_PATH);
  await testAuthoritySurface(Authority);
  await testAncestryAndCertificates(Authority);
  await testFreshRootGatedHiddenSourceStates(Authority);
  await testFailureMappingAndBounds(Authority);
  await testPreOperationDriveEditsInvalidateProcessedState(Authority);
  await testNonDisplayPartialInfluenceIsWithheld(Authority);
  await testEffectPreparationCommitAndCancellation(Authority, Controller);
  await testIngestionRecordBindingsAndFinalValidation(Authority);
  await testNonCooperativeAwaitDeadlines(Authority, Controller);
  await testFinalCurrentnessAndDisplay(Authority);
  await testControllerSurface(Controller);
  await testControllerExactRootStatus(Controller);
  await testControllerClosure(Controller);

  const authoritySource = fs.readFileSync(AUTHORITY_PATH, 'utf8');
  const controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  assert.match(authoritySource, /permissionId/);
  assert.match(authoritySource, /beginOperation/);
  assert.match(authoritySource, /certifySource/);
  assert.match(authoritySource, /certifySources/);
  assert.match(authoritySource, /runWithCertifiedSource/);
  assert.match(authoritySource, /runWithCertifiedSources/);
  assert.match(authoritySource, /display/);
  assert.match(authoritySource, /Weak(?:Set|Map)/);
  assert.match(authoritySource, /finishOperation/);
  assert.match(controllerSource, /beginReplacement/);
  assert.match(controllerSource, /withdrawPartition/);
  assert.match(controllerSource, /purgePartition/);
  assert.match(controllerSource, /unproven/);
  assert.match(controllerSource, /enroll/);
  assert.equal(/chrome\.storage|sendMessage|authuser|emailAddress/.test(authoritySource), false,
    'authority has no storage/message/email/authuser authority path');

  await testSourceStateContract(Authority);

  console.log('skopeo Drive authority and corpus controller contract: PASS');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
