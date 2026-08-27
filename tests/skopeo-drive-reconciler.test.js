'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RECONCILER_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-drive-reconciler.js');
const SCHEMA_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-corpus-schema.js');
const CORPUS_STORE_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-corpus-store.js');

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DOC_MIME = 'application/vnd.google-apps.document';
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';
const TEXT_MIME = 'text/plain';
const PDF_MIME = 'application/pdf';
const CHECKPOINT_VERSION = 'skopeo-corpus-checkpoint/v1';
const PURGE_PARTICIPANTS = Object.freeze([
  'fragments',
  'indexes',
  'citations',
  'counts',
  'relationships',
  'result-cache',
  'alerts'
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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

function deferred() {
  let resolve;
  const promise = new Promise((accept) => { resolve = accept; });
  return { promise, resolve };
}

function result(kind, value = null, status = null) {
  return kind === 'ok' ? { kind, status: 200, value } : { kind, status };
}

function file(id, mimeType, parents, overrides = {}) {
  return Object.assign({
    id,
    name: `Name ${id}`,
    mimeType,
    parents: parents.slice(),
    trashed: false,
    driveId: 'shared-drive-1',
    resourceKey: null,
    capabilities: {
      canDownload: mimeType === TEXT_MIME || mimeType === DOC_MIME,
      canListChildren: mimeType === FOLDER_MIME
    },
    version: '1',
    headRevisionId: mimeType === DOC_MIME ? `rev-${id}-1` : null,
    md5Checksum: null,
    sha1Checksum: null,
    sha256Checksum: mimeType === TEXT_MIME ? 'a'.repeat(64) : null,
    size: mimeType === FOLDER_MIME ? 0 : 24,
    modifiedTime: '2026-07-20T12:00:00.000Z',
    shortcutDetails: null
  }, overrides);
}

function baseGraph() {
  return new Map([
    ['outside-root', file('outside-root', FOLDER_MIME, [], { driveId: null })],
    ['outside-folder', file('outside-folder', FOLDER_MIME, ['outside-root'], { driveId: null })],
    ['external-target', file('external-target', TEXT_MIME, ['outside-folder'], { driveId: null })],
    ['root-1', file('root-1', FOLDER_MIME, ['outside-root'])],
    ['vendor-a', file('vendor-a', FOLDER_MIME, ['root-1'])],
    ['vendor-b', file('vendor-b', FOLDER_MIME, ['root-1'])],
    ['nested-a', file('nested-a', FOLDER_MIME, ['vendor-a'])],
    ['root-policy', file('root-policy', TEXT_MIME, ['root-1'])],
    ['doc-a', file('doc-a', DOC_MIME, ['nested-a'])],
    ['shared-text', file('shared-text', TEXT_MIME, ['nested-a'])],
    ['unsupported-pdf', file('unsupported-pdf', PDF_MIME, ['vendor-a'], {
      capabilities: { canDownload: true, canListChildren: false },
      sha256Checksum: null
    })],
    ['blocked-text', file('blocked-text', TEXT_MIME, ['vendor-b'], {
      capabilities: { canDownload: false, canListChildren: false }
    })],
    ['shortcut-leaf', file('shortcut-leaf', SHORTCUT_MIME, ['vendor-a'], {
      capabilities: { canDownload: false, canListChildren: false },
      headRevisionId: null,
      sha256Checksum: null,
      shortcutDetails: { targetId: 'external-target', targetMimeType: TEXT_MIME }
    })],
    ['trashed-text', file('trashed-text', TEXT_MIME, ['vendor-a'], { trashed: true })],
    ['race-doc', file('race-doc', DOC_MIME, ['vendor-b'])]
  ]);
}

function physicalChain(graph, rootId, sourceId) {
  const source = graph.get(sourceId);
  if (!source || source.trashed || sourceId === rootId) return null;
  const queue = source.parents.map((parentId) => ({ parentId, upward: [parentId], seen: new Set([sourceId, parentId]) }));
  const paths = [];
  while (queue.length) {
    const current = queue.shift();
    const parent = graph.get(current.parentId);
    if (!parent || parent.trashed || parent.mimeType !== FOLDER_MIME) continue;
    if (parent.id === rootId) {
      paths.push(current.upward.slice().reverse());
      continue;
    }
    for (const next of parent.parents) {
      if (current.seen.has(next)) continue;
      const seen = new Set(current.seen);
      seen.add(next);
      queue.push({ parentId: next, upward: current.upward.concat(next), seen });
    }
  }
  if (!paths.length) return null;
  paths.sort((left, right) => left.length - right.length || left.join('\0').localeCompare(right.join('\0')));
  return paths[0];
}

class FakeTransport {
  constructor(trace, options = {}) {
    this.trace = trace;
    this.graph = options.graph || baseGraph();
    this.permissionId = 'permission-1';
    this.pageSize = options.pageSize || 2;
    this.hiddenUntilChanges = new Set(options.hiddenUntilChanges || ['race-doc']);
    this.failures = new Map();
    this.changePages = options.changePages || [[{
      fileId: 'race-doc',
      removed: false,
      time: '2026-07-20T12:01:00.000Z',
      file: clone(this.graph.get('race-doc'))
    }]];
    this.contentHashes = new Map();
    this.contentReads = [];
    this.startSequence = 0;
    this.listSequence = 0;
    this.changeSequence = 0;
    this.never = new Set();
    this.beforeGetFile = null;
    this.afterReadContent = null;
  }

  setFailure(key, kind, status = null) {
    this.failures.set(key, result(kind, null, status));
  }

  clearFailure(key) {
    this.failures.delete(key);
  }

  async about() {
    this.trace.push({ at: 'transport.about' });
    return this.failures.get('about') || result('ok', { permissionId: this.permissionId });
  }

  async getFile(input, signal) {
    const fileId = input && input.fileId;
    this.trace.push({ at: 'transport.getFile', fileId });
    if (this.beforeGetFile) await this.beforeGetFile(fileId, signal);
    if (signal && signal.aborted) return result('incomplete', null, 499);
    if (this.never.has(`getFile:${fileId}`)) return new Promise(() => {});
    if (this.failures.has(`getFile:${fileId}`)) return this.failures.get(`getFile:${fileId}`);
    const value = this.graph.get(fileId);
    return value ? result('ok', clone(value)) : result('not-found', null, 404);
  }

  async listChildren(input) {
    const parentFileId = input && input.parentFileId;
    this.trace.push({
      at: 'transport.listChildren',
      parentFileId,
      resourceKey: input && input.resourceKey,
      driveId: Object.prototype.hasOwnProperty.call(input || {}, 'driveId') ? input.driveId : null,
      pageToken: input && input.pageToken ? true : false
    });
    if (this.never.has(`listChildren:${parentFileId}`)) return new Promise(() => {});
    if (this.failures.has(`listChildren:${parentFileId}`)) {
      return this.failures.get(`listChildren:${parentFileId}`);
    }
    let offset = 0;
    if (input && input.pageToken) {
      if (!input.pageToken || input.pageToken.type !== 'children' || input.pageToken.parentFileId !== parentFileId || input.pageToken.used) {
        return result('incomplete', null, 200);
      }
      input.pageToken.used = true;
      offset = input.pageToken.offset;
    }
    const children = Array.from(this.graph.values())
      .filter((entry) => entry.parents.includes(parentFileId) && !entry.trashed && !this.hiddenUntilChanges.has(entry.id))
      .sort((left, right) => left.id.localeCompare(right.id));
    const values = children.slice(offset, offset + this.pageSize).map(clone);
    const nextOffset = offset + values.length;
    const nextPageToken = nextOffset < children.length
      ? { type: 'children', parentFileId, offset: nextOffset, used: false, sequence: ++this.listSequence }
      : null;
    return result('ok', { files: values, nextPageToken, incompleteSearch: false });
  }

  async getStartPageToken(input = {}) {
    this.trace.push({ at: 'transport.baseline', driveId: input.driveId || null });
    if (this.never.has('getStartPageToken')) return new Promise(() => {});
    if (this.failures.has('getStartPageToken')) return this.failures.get('getStartPageToken');
    return result('ok', {
      startPageToken: {
        type: 'changes',
        driveId: input.driveId || null,
        page: 0,
        used: false,
        sequence: ++this.startSequence
      }
    });
  }

  async listChanges(input) {
    this.trace.push({ at: 'transport.listChanges', driveId: input && input.driveId || null });
    if (this.never.has('listChanges')) return new Promise(() => {});
    if (this.failures.has('listChanges')) return this.failures.get('listChanges');
    const token = input && input.pageToken;
    if (!token || token.type !== 'changes' || token.used || token.driveId !== (input.driveId || null)) {
      return result('incomplete', null, 200);
    }
    token.used = true;
    const page = token.page;
    const changes = (this.changePages[page] || []).map((entry) => clone(entry));
    for (const change of changes) this.hiddenUntilChanges.delete(change.fileId);
    const nextPageToken = page + 1 < this.changePages.length
      ? { type: 'changes', driveId: token.driveId, page: page + 1, used: false, sequence: ++this.changeSequence }
      : null;
    const newStartPageToken = nextPageToken === null
      ? { type: 'changes', driveId: token.driveId, page: 0, used: false, sequence: ++this.startSequence }
      : null;
    return result('ok', { changes, nextPageToken, newStartPageToken });
  }

  async readContent(input, sink, signal) {
    const fileId = input && input.fileId;
    this.trace.push({ at: 'transport.readContent', fileId });
    this.contentReads.push(fileId);
    if (this.failures.has(`readContent:${fileId}`)) return this.failures.get(`readContent:${fileId}`);
    const value = this.graph.get(fileId);
    if (!value) return result('not-found', null, 404);
    if (!value.capabilities.canDownload) return result('download-denied', null, 403);
    if (value.mimeType !== TEXT_MIME && value.mimeType !== DOC_MIME) return result('unsupported');
    const byteHash = this.contentHashes.get(fileId) ||
      (typeof value.sha256Checksum === 'string'
        ? `sha256:${value.sha256Checksum.toLowerCase()}`
        : `sha256:${fileId.charCodeAt(0).toString(16).padStart(2, '0').repeat(32)}`);
    await sink({ byteHash, exactByteLength: 24, text: `operation-local:${fileId}` });
    if (this.afterReadContent) await this.afterReadContent(fileId, signal);
    if (signal && signal.aborted) return result('incomplete', null, 499);
    return result('ok', { byteHash, exactByteLength: 24 });
  }
}

class FakeAuthority {
  constructor(trace, transport, schema) {
    this.trace = trace;
    this.transport = transport;
    this.schema = schema;
    this.decisions = new Map();
    this.operationSequence = 0;
    this.active = new Set();
    this.operationRecords = new WeakMap();
    this.certificateRecords = new WeakMap();
    this.acknowledgements = new WeakMap();
    this.beforePublish = null;
  }

  async beginOperation(kind, context) {
    this.trace.push({ at: 'authority.beginOperation', kind, context: clone(context) });
    if (kind !== 'ingestion' || !context || context.accountPermissionId !== this.transport.permissionId ||
        context.corpusRootFileId !== 'root-1') return { decision: 'closed' };
    const root = this.transport.graph.get(context.corpusRootFileId);
    if (!root || root.trashed || root.mimeType !== FOLDER_MIME) return { decision: 'inaccessible' };
    const controller = new AbortController();
    const operationId = ++this.operationSequence;
    const operation = Object.freeze({ kind, operationId });
    this.operationRecords.set(operation, {
      kind,
      operationId,
      operationEpoch: operationId,
      controller,
      signal: controller.signal,
      rootSnapshot: this.schema.canonicalize({
        permissionId: this.transport.permissionId,
        root: clone(root)
      })
    });
    this.active.add(operation);
    return operation;
  }

  metadataFingerprint(value) {
    return this.schema.parseMetadataFingerprint({
      version: this.schema.VERSION,
      kind: 'metadata',
      name: value.name,
      mimeType: value.mimeType,
      modifiedTime: value.modifiedTime,
      driveVersion: value.version,
      size: value.size,
      trashed: value.trashed,
      canDownload: value.capabilities.canDownload
    });
  }

  membershipFingerprint(value, chain) {
    return this.schema.parseMembershipFingerprint({
      version: this.schema.VERSION,
      kind: 'membership',
      corpusRootFileId: 'root-1',
      physicalParentChain: chain,
      vendorScopeFileId: chain.length > 1 ? chain[1] : null,
      driveId: value.driveId
    });
  }

  sourceSnapshot(sourceFileId) {
    const value = this.transport.graph.get(sourceFileId);
    const root = this.transport.graph.get('root-1');
    const chain = physicalChain(this.transport.graph, 'root-1', sourceFileId);
    if (!value || !root || !chain) return null;
    return this.schema.canonicalize({
      permissionId: this.transport.permissionId,
      root: clone(root),
      source: clone(value),
      chain,
      byteHash: this.contentHash(value)
    });
  }

  contentHash(value) {
    return this.transport.contentHashes.get(value.id) ||
      (typeof value.sha256Checksum === 'string'
        ? `sha256:${value.sha256Checksum.toLowerCase()}`
        : `sha256:${value.id.charCodeAt(0).toString(16).padStart(2, '0').repeat(32)}`);
  }

  async certifySource(operation, sourceFileId) {
    this.trace.push({ at: 'authority.certifySource', sourceFileId });
    if (!this.active.has(operation)) return { decision: 'closed' };
    if (this.decisions.has(sourceFileId)) return this.decisions.get(sourceFileId);
    const chain = physicalChain(this.transport.graph, 'root-1', sourceFileId);
    if (!chain) return { decision: 'inaccessible' };
    const value = this.transport.graph.get(sourceFileId);
    const metadataFingerprint = this.metadataFingerprint(value);
    const membershipFingerprint = this.membershipFingerprint(value, chain);
    const snapshot = this.sourceSnapshot(sourceFileId);
    if (!metadataFingerprint || !membershipFingerprint || snapshot === null) {
      return { decision: 'pending' };
    }
    const certificate = Object.freeze({
      decision: 'certified',
      sourceFileId,
      vendorScopeFileId: chain.length > 1 ? chain[1] : null,
      physicalParentChain: Object.freeze(chain),
      metadataFingerprint,
      membershipFingerprint,
      contentFingerprint: null
    });
    this.certificateRecords.set(certificate, { operation, sourceFileId, snapshot });
    return certificate;
  }

  certificateCurrent(operation, certificate) {
    const record = this.operationRecords.get(operation);
    const certified = this.certificateRecords.get(certificate);
    return !!record && this.active.has(operation) && !record.signal.aborted && !!certified &&
      certified.operation === operation && certified.snapshot === this.sourceSnapshot(certified.sourceFileId);
  }

  bindingCurrent(binding) {
    const source = this.schema.parseSourceRecord(binding);
    if (!source || source.visibility !== 'active') return false;
    const value = this.transport.graph.get(source.sourceFileId);
    const chain = physicalChain(this.transport.graph, 'root-1', source.sourceFileId);
    if (!value || !chain ||
        this.schema.canonicalize(source.metadataFingerprint) !==
          this.schema.canonicalize(this.metadataFingerprint(value)) ||
        this.schema.canonicalize(source.membershipFingerprint) !==
          this.schema.canonicalize(this.membershipFingerprint(value, chain))) {
      return false;
    }
    if (source.state !== 'ready') return source.contentFingerprint === null;
    const content = this.schema.parseContentFingerprint(source.contentFingerprint);
    if (!content) return false;
    if (content.evidenceKind === 'drive-sha256') {
      return typeof value.sha256Checksum === 'string' &&
        content.value === `sha256:${value.sha256Checksum.toLowerCase()}`;
    }
    if (content.evidenceKind === 'drive-revision') {
      return content.value === value.headRevisionId;
    }
    return content.value === this.contentHash(value);
  }

  makePublisher(operation, certificates) {
    const operationRecord = this.operationRecords.get(operation);
    const token = Object.freeze({ operationId: operationRecord.operationId });
    let published = false;
    let bindings = null;
    const validate = async () => {
      if (!published || !this.active.has(operation) || operationRecord.signal.aborted ||
          !certificates.every((certificate) => this.certificateCurrent(operation, certificate))) {
        return false;
      }
      if (certificates.length === 0 && operationRecord.rootSnapshot !== this.schema.canonicalize({
        permissionId: this.transport.permissionId,
        root: clone(this.transport.graph.get('root-1'))
      })) return false;
      return bindings === null || bindings.every((binding) => this.bindingCurrent(binding));
    };
    return Object.freeze({
      signal: operationRecord.signal,
      operationToken: token,
      operationEpoch: operationRecord.operationEpoch,
      publish: async (effect, bindingValues) => {
        if (published || typeof effect !== 'function' || !this.active.has(operation)) return null;
        if (bindingValues !== undefined) {
          if (!Array.isArray(bindingValues) || bindingValues.length !== certificates.length) return null;
          const expectedIds = new Set(certificates.map((certificate) => certificate.sourceFileId));
          const seen = new Set();
          bindings = [];
          for (const binding of bindingValues) {
            const parsed = this.schema.parseSourceRecord(binding);
            if (!parsed || !expectedIds.has(parsed.sourceFileId) || seen.has(parsed.sourceFileId)) return null;
            seen.add(parsed.sourceFileId);
            bindings.push(parsed);
          }
        }
        published = true;
        if (this.beforePublish) {
          await this.beforePublish({
            sourceFileIds: certificates.map((certificate) => certificate.sourceFileId)
          });
        }
        if (!await validate()) return null;
        const guard = Object.freeze({
          signal: operationRecord.signal,
          operationToken: token,
          operationEpoch: operationRecord.operationEpoch,
          validate
        });
        const value = await effect(guard);
        const acknowledgement = Object.freeze({ operationId: operationRecord.operationId });
        this.acknowledgements.set(acknowledgement, { operation, value });
        return acknowledgement;
      }
    });
  }

  async runWithCertifiedSource(operation, sourceFileId, prepare, commit) {
    this.trace.push({ at: 'authority.runWithCertifiedSource', sourceFileId });
    try {
      if (!this.active.has(operation) || typeof prepare !== 'function' || typeof commit !== 'function') {
        return { decision: 'closed' };
      }
      const certificate = await this.certifySource(operation, sourceFileId);
      if (!certificate || certificate.decision !== 'certified') return certificate || { decision: 'pending' };
      const operationRecord = this.operationRecords.get(operation);
      const prepared = await prepare(certificate, operationRecord.signal);
      if (!this.certificateCurrent(operation, certificate)) return { decision: 'closed' };
      const acknowledgement = await commit(
        prepared,
        this.makePublisher(operation, [certificate]),
        operationRecord.signal
      );
      const acknowledged = this.acknowledgements.get(acknowledgement);
      return acknowledged && acknowledged.operation === operation
        ? { decision: 'admitted', value: acknowledged.value }
        : { decision: 'closed' };
    } catch (_error) {
      return { decision: 'pending' };
    } finally {
      this.finishOperation(operation);
    }
  }

  async runWithCertifiedSources(operation, sourceFileIds, prepare, commit) {
    this.trace.push({ at: 'authority.runWithCertifiedSources', sourceFileIds: sourceFileIds.slice() });
    try {
      if (!this.active.has(operation) || !Array.isArray(sourceFileIds) ||
          typeof prepare !== 'function' || typeof commit !== 'function') {
        return { decision: 'closed' };
      }
      const certificates = [];
      for (const sourceFileId of sourceFileIds) {
        const certificate = await this.certifySource(operation, sourceFileId);
        if (!certificate || certificate.decision !== 'certified') {
          return certificate || { decision: 'pending' };
        }
        certificates.push(certificate);
      }
      const operationRecord = this.operationRecords.get(operation);
      const prepared = await prepare(
        Object.freeze(certificates.slice()),
        Object.freeze({ complete: true }),
        operationRecord.signal
      );
      if (!certificates.every((certificate) => this.certificateCurrent(operation, certificate))) {
        return { decision: 'closed' };
      }
      const acknowledgement = await commit(
        prepared,
        this.makePublisher(operation, certificates),
        operationRecord.signal
      );
      const acknowledged = this.acknowledgements.get(acknowledgement);
      return acknowledged && acknowledged.operation === operation
        ? { decision: 'admitted', value: acknowledged.value }
        : { decision: 'closed' };
    } catch (_error) {
      return { decision: 'pending' };
    } finally {
      this.finishOperation(operation);
    }
  }

  finishOperation(operation) {
    this.trace.push({ at: 'authority.finishOperation' });
    const operationRecord = this.operationRecords.get(operation);
    if (operationRecord && !operationRecord.signal.aborted) operationRecord.controller.abort('operation-complete');
    this.operationRecords.delete(operation);
    return this.active.delete(operation);
  }
}

class FakeStore {
  constructor(trace, schema) {
    this.trace = trace;
    this.schema = schema;
    this.activeClaim = null;
    this.activeSources = new Map();
    this.stagingSources = null;
    this.pendingHandle = null;
    this.visible = false;
    this.checkpoint = null;
    this.handleSequence = 0;
    this.mutationCount = 0;
    this.failAtMutation = null;
    this.purged = [];
    this.priorPurgeRequired = false;
    this.beforeCommit = null;
    this.beforeStage = null;
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

  mutate(at, detail, work) {
    this.mutationCount += 1;
    this.trace.push(Object.assign({ at, visible: this.visible, mutation: this.mutationCount }, detail || {}));
    if (this.failAtMutation === this.mutationCount) throw new Error(`crash-at-${at}`);
    return work();
  }

  async recover(input, guard) {
    if (!this.mutationOpen(guard)) return { ok: false, status: 'stale-operation' };
    this.trace.push({ at: 'store.recover', visible: this.visible, input: clone(input) });
    return this.activeClaim &&
      this.activeClaim.accountPermissionId === input.provenAccountPermissionId
      ? { ok: true, status: 'active', claim: clone(this.activeClaim) }
      : { ok: true, status: 'closed' };
  }

  async beginReplacement(claim, guard) {
    if (!this.mutationOpen(guard)) return { ok: false, status: 'stale-operation' };
    return this.mutate('store.beginReplacement', { claim: clone(claim) }, () => {
      const sameTuple = this.visible && this.activeClaim &&
        this.activeClaim.accountPermissionId === claim.accountPermissionId &&
        this.activeClaim.corpusRootFileId === claim.corpusRootFileId;
      this.priorPurgeRequired = this.visible && !!this.activeClaim && !sameTuple;
      this.visible = false;
      this.pendingHandle = Object.freeze({
        version: 'skopeo-corpus-handle/v1',
        partitionKey: this.schema.makePartitionKey(claim),
        accountPermissionId: claim.accountPermissionId,
        corpusRootFileId: claim.corpusRootFileId,
        operationEpoch: ++this.handleSequence
      });
      this.stagingSources = new Map();
      return this.pendingHandle;
    });
  }

  async stageSource(handle, source, guard) {
    if (this.beforeStage) await this.beforeStage(source);
    if (!this.mutationOpen(guard)) return { ok: false, status: 'stale-operation' };
    return this.mutate('store.stageSource', { sourceFileId: source && source.sourceFileId }, () => {
      if (handle !== this.pendingHandle || !this.schema.parseSourceRecord(source)) {
        return { ok: false, status: 'invalid-input' };
      }
      this.stagingSources.set(source.sourceFileId, source);
      return { ok: true, status: 'staged' };
    });
  }

  async purgeSource(claim, sourceFileId, reason, guard) {
    if (!this.mutationOpen(guard)) return { ok: false, status: 'stale-operation' };
    return this.mutate('store.purgeSource', { sourceFileId, reason }, () => {
      this.purged.push(sourceFileId);
      this.activeSources.delete(sourceFileId);
      if (this.stagingSources) this.stagingSources.delete(sourceFileId);
      return { ok: true, status: 'purged' };
    });
  }

  async purgePartition(claim, reason, guard) {
    if (!this.mutationOpen(guard)) return { ok: false, status: 'stale-operation' };
    return this.mutate('store.purgePartition', { claim: clone(claim), reason }, () => {
      this.visible = false;
      this.activeClaim = null;
      this.activeSources.clear();
      this.stagingSources = null;
      this.pendingHandle = null;
      this.priorPurgeRequired = false;
      return { ok: true, status: 'purged' };
    });
  }

  async withdrawPartition(claim, reason, guard) {
    if (!this.mutationOpen(guard)) return { ok: false, status: 'stale-operation' };
    return this.mutate('store.withdrawPartition', { claim: clone(claim), reason }, () => {
      this.visible = false;
      return { ok: true, status: 'withdrawn' };
    });
  }

  async commitInventory(handle, checkpoint, guard, authorityGuard) {
    if (this.beforeCommit) await this.beforeCommit();
    if (!guard || !this.mutationGuards.has(guard) || guard.signal.aborted) {
      return { ok: false, status: 'stale-operation' };
    }
    if (authorityGuard) {
      if (!authorityGuard.operationToken || !Number.isSafeInteger(authorityGuard.operationEpoch) ||
          typeof authorityGuard.validate !== 'function' || !await authorityGuard.validate() ||
          authorityGuard.signal.aborted || guard.signal.aborted) {
        return { ok: false, status: 'stale-authority' };
      }
    }
    return this.mutate('store.commitInventory', { checkpoint: clone(checkpoint) }, () => {
      if (handle !== this.pendingHandle || !this.stagingSources ||
          checkpoint.sourceCount !== this.stagingSources.size) {
        return { ok: false, status: 'incomplete-inventory' };
      }
      if (this.priorPurgeRequired) {
        return { ok: false, status: 'prior-partition-not-purged' };
      }
      this.activeClaim = {
        accountPermissionId: handle.accountPermissionId,
        corpusRootFileId: handle.corpusRootFileId
      };
      this.activeSources = new Map(this.stagingSources);
      this.stagingSources = null;
      this.pendingHandle = null;
      this.checkpoint = clone(checkpoint);
      this.visible = true;
      return { ok: true, status: 'active' };
    });
  }

  async inspectMetadata(claim) {
    this.trace.push({ at: 'store.inspectMetadata', visible: this.visible });
    if (!this.activeClaim || this.activeClaim.accountPermissionId !== claim.accountPermissionId ||
        this.activeClaim.corpusRootFileId !== claim.corpusRootFileId) return null;
    return {
      version: 'skopeo-corpus-store/v1',
      partitionKey: this.schema.makePartitionKey(claim),
      lifecycle: this.visible ? 'active' : 'staging',
      sources: Array.from(this.activeSources.values()).map((source) => ({
        sourceFileId: source.sourceFileId,
        visibility: source.visibility,
        state: source.state,
        displayName: source.displayName,
        metadataFingerprint: source.metadataFingerprint,
        membershipFingerprint: source.membershipFingerprint,
        contentFingerprint: source.contentFingerprint
      }))
    };
  }

  durableSnapshot() {
    return JSON.stringify({
      activeClaim: this.activeClaim,
      activeSources: Array.from(this.activeSources.values()),
      stagingSources: this.stagingSources ? Array.from(this.stagingSources.values()) : null,
      checkpoint: this.checkpoint
    });
  }
}

function exactContext() {
  return {
    tabId: 77,
    origin: 'https://drive.google.com',
    generation: 4,
    profileId: 'gdrive-profile',
    profileVersion: 3,
    contextEpoch: 9,
    contextKind: 'agreement-reading',
    entityKind: 'drive-folder',
    entityId: 'root-1',
    accountPermissionId: 'permission-1',
    corpusRootFileId: 'root-1'
  };
}

function limits(overrides = {}) {
  return Object.assign({
    maxPagesPerScan: 32,
    maxItemsPerScan: 128,
    maxDepth: 12,
    maxRequestsPerRun: 256,
    maxChangesPerRun: 128,
    maxSources: 64,
    maxRescans: 1,
    maxOperationMs: 1000
  }, overrides);
}

function createHarness(Reconciler, options = {}) {
  const schema = require(SCHEMA_PATH);
  const trace = options.trace || [];
  const transport = options.transport || new FakeTransport(trace, options.transportOptions);
  const authority = options.authority || new FakeAuthority(trace, transport, schema);
  const store = options.store || new FakeStore(trace, schema);
  const reconciler = Reconciler.create({
    schema,
    store,
    transport,
    authority,
    limits: limits(options.limits)
  });
  return { reconciler, schema, trace, transport, authority, store };
}

function sourceById(store, sourceFileId) {
  return store.activeSources.get(sourceFileId) || null;
}

function assertNoDurableBodyOrAuthority(store) {
  const durable = store.durableSnapshot();
  for (const forbidden of [
    'operation-local:',
    'fullText',
    'bytesBase64',
    'raw-stack',
    'provider-secret-message',
    'resourceKey',
    'certificate',
    'permissionId":"permission-2'
  ]) {
    assert.equal(durable.includes(forbidden), false, `durable state excludes ${forbidden}`);
  }
}

async function testSurfaceAndInitialInventory(Reconciler) {
  assert.strictEqual(globalThis.FsbSkopeoDriveReconciler, Reconciler,
    'classic global matches CommonJS FsbSkopeoDriveReconciler');
  assert.equal(Object.isFrozen(Reconciler), true);
  assert.deepEqual(Object.keys(Reconciler).sort(), ['LIMITS', 'VERSION', 'create']);

  const harness = createHarness(Reconciler);
  assert.ok(harness.reconciler);
  assert.equal(Object.isFrozen(harness.reconciler), true);
  assert.deepEqual(Object.keys(harness.reconciler).sort(), [
    'abort', 'buildInitialInventory', 'reconcileChanges', 'reconcileSource', 'resume'
  ]);

  const built = await harness.reconciler.buildInitialInventory(exactContext());
  assert.equal(built.ok, true);
  assert.equal(built.status, 'active');
  assert.equal(harness.store.visible, true);
  assert.equal(harness.store.checkpoint.version, CHECKPOINT_VERSION);
  assert.equal(harness.store.checkpoint.kind, 'inventory-complete');
  assert.match(harness.store.checkpoint.cursor, /^inventory_[A-Za-z0-9_-]+$/);
  assert.equal(harness.store.checkpoint.sourceCount, harness.store.activeSources.size);

  const baselineIndex = harness.trace.findIndex((entry) => entry.at === 'transport.baseline');
  const firstListIndex = harness.trace.findIndex((entry) => entry.at === 'transport.listChildren');
  const firstStageIndex = harness.trace.findIndex((entry) => entry.at === 'store.stageSource');
  const firstChangeIndex = harness.trace.findIndex((entry) => entry.at === 'transport.listChanges');
  const commitIndex = harness.trace.findIndex((entry) => entry.at === 'store.commitInventory');
  assert.ok(baselineIndex >= 0 && baselineIndex < firstListIndex,
    'baseline token is captured before the bounded complete inventory');
  assert.ok(firstListIndex < firstStageIndex, 'physical inventory and fresh certification precede staging');
  assert.ok(firstStageIndex < firstChangeIndex, 'initial records stage invisibly before baseline changes drain');
  assert.ok(firstChangeIndex < commitIndex, 'newStartPageToken drain completes before pointer/checkpoint publication');
  assert.equal(harness.trace.filter((entry) => entry.at.startsWith('store.') && entry.at !== 'store.commitInventory')
    .every((entry) => entry.visible === false), true, 'all staging and purge awaits remain invisible');
  assert.equal(harness.trace.at(commitIndex).visible, false, 'commitInventory is pointer-last from a closed manifest');

  assert.equal(sourceById(harness.store, 'root-policy').state, 'ready', 'root file is corpus-wide ready source');
  assert.equal(sourceById(harness.store, 'root-policy').membershipFingerprint.vendorScopeFileId, null);
  assert.equal(sourceById(harness.store, 'doc-a').state, 'ready');
  assert.equal(sourceById(harness.store, 'doc-a').membershipFingerprint.vendorScopeFileId, 'vendor-a');
  assert.equal(sourceById(harness.store, 'race-doc').state, 'ready',
    'change created during scan is re-fetched and admitted before publication');
  assert.equal(sourceById(harness.store, 'unsupported-pdf').state, 'unreadable');
  assert.equal(sourceById(harness.store, 'blocked-text').state, 'download-blocked');
  assert.equal(sourceById(harness.store, 'shortcut-leaf').state, 'unreadable');
  assert.equal(sourceById(harness.store, 'trashed-text'), null);
  assert.equal(sourceById(harness.store, 'external-target'), null);
  assert.equal(harness.trace.some((entry) => entry.at === 'transport.getFile' && entry.fileId === 'external-target'), false,
    'shortcut target is never traversed or read');
  assert.equal(harness.transport.contentReads.includes('shortcut-leaf'), false);
  assert.equal(harness.transport.contentReads.includes('unsupported-pdf'), false);
  assert.equal(harness.transport.contentReads.includes('blocked-text'), false);
  assert.equal(harness.trace.filter((entry) => entry.at === 'transport.listChildren')
    .every((entry) => entry.driveId === 'shared-drive-1'), true,
  'every shared-drive page uses the exact parent driveId and completes pagination');
  assert.equal(harness.trace.filter((entry) => entry.at === 'authority.certifySource')
    .some((entry) => entry.sourceFileId === 'race-doc'), true,
  'change pages are hints and the raced source receives fresh authority reproof');
  assertNoDurableBodyOrAuthority(harness.store);
}

async function testKeyedParentInventoryPropagation(Reconciler) {
  const graph = baseGraph();
  const rootKey = Object.freeze({ sourceFileId: 'root-1' });
  const nestedKey = Object.freeze({ sourceFileId: 'vendor-a' });
  graph.get('root-1').resourceKey = rootKey;
  graph.get('vendor-a').resourceKey = nestedKey;
  const harness = createHarness(Reconciler, {
    transportOptions: { graph, hiddenUntilChanges: [], changePages: [[]] }
  });
  assert.equal((await harness.reconciler.buildInitialInventory(exactContext())).ok, true);
  assert.deepEqual(harness.trace.find((entry) => entry.at === 'transport.listChildren' &&
    entry.parentFileId === 'root-1').resourceKey, rootKey,
  'inventory root listing carries the verified root-folder key');
  assert.deepEqual(harness.trace.find((entry) => entry.at === 'transport.listChildren' &&
    entry.parentFileId === 'vendor-a').resourceKey, nestedKey,
  'nested inventory listing carries only its own verified parent-folder key');
}

async function testHintReproofAndFingerprintDecisions(Reconciler) {
  const harness = createHarness(Reconciler, { transportOptions: { hiddenUntilChanges: [], changePages: [[]] } });
  assert.equal((await harness.reconciler.buildInitialInventory(exactContext())).ok, true);

  const docBefore = sourceById(harness.store, 'doc-a');
  const renameReads = harness.transport.contentReads.length;
  harness.transport.graph.get('doc-a').name = 'Renamed agreement';
  harness.transport.graph.get('doc-a').modifiedTime = '2026-07-20T12:10:00.000Z';
  const renamed = await harness.reconciler.reconcileSource(exactContext(), 'doc-a', { removed: false });
  assert.equal(renamed.ok, true);
  assert.equal(renamed.action, 'metadata');
  assert.equal(harness.transport.contentReads.length, renameReads,
    'rename with exact unchanged content identity performs zero content reads/re-extraction');
  assert.notDeepEqual(sourceById(harness.store, 'doc-a').metadataFingerprint, docBefore.metadataFingerprint);
  assert.deepEqual(sourceById(harness.store, 'doc-a').contentFingerprint, docBefore.contentFingerprint);

  const moveReads = harness.transport.contentReads.length;
  harness.transport.graph.get('doc-a').parents = ['vendor-b'];
  const moved = await harness.reconciler.reconcileSource(exactContext(), 'doc-a', { removed: false });
  assert.equal(moved.ok, true);
  assert.equal(moved.action, 'membership');
  assert.equal(sourceById(harness.store, 'doc-a').membershipFingerprint.vendorScopeFileId, 'vendor-b');
  assert.equal(harness.transport.contentReads.length, moveReads,
    'move/vendor-only update with unchanged exact content fingerprint avoids extraction');

  harness.transport.graph.get('doc-a').headRevisionId = 'rev-doc-a-2';
  harness.transport.graph.get('doc-a').version = '2';
  harness.transport.contentHashes.set('doc-a', 'sha256:' + 'd'.repeat(64));
  const contentReads = harness.transport.contentReads.length;
  const changed = await harness.reconciler.reconcileSource(exactContext(), 'doc-a', { removed: false });
  assert.equal(changed.ok, true);
  assert.equal(changed.action, 'content');
  assert.equal(harness.transport.contentReads.length, contentReads + 1,
    'content revision/checksum change invokes exactly one bounded operation-local read');
  assert.equal(sourceById(harness.store, 'doc-a').contentFingerprint.evidenceKind, 'drive-revision');
  assert.equal(sourceById(harness.store, 'doc-a').contentFingerprint.value, 'rev-doc-a-2');

  const exactReads = harness.transport.contentReads.length;
  const unchanged = await harness.reconciler.reconcileSource(exactContext(), 'doc-a', { removed: false });
  assert.equal(unchanged.ok, true);
  assert.equal(unchanged.action, 'none');
  assert.equal(harness.transport.contentReads.length, exactReads,
    'exact-content-no-change is idempotent and performs zero re-extraction');

  harness.transport.setFailure('readContent:shared-text', 'download-denied', 403);
  harness.transport.graph.get('shared-text').version = '2';
  harness.transport.graph.get('shared-text').sha256Checksum = 'b'.repeat(64);
  const denied = await harness.reconciler.reconcileSource(exactContext(), 'shared-text', { removed: false });
  assert.equal(denied.ok, true);
  assert.equal(sourceById(harness.store, 'shared-text').state, 'download-blocked');

  const shortcutReads = harness.transport.contentReads.length;
  const shortcut = await harness.reconciler.reconcileSource(exactContext(), 'shortcut-leaf', { removed: false });
  assert.equal(shortcut.ok, true);
  assert.equal(sourceById(harness.store, 'shortcut-leaf').state, 'unreadable');
  assert.equal(harness.transport.contentReads.length, shortcutReads);
  assertNoDurableBodyOrAuthority(harness.store);
}

async function testHashFallbackRenameAndMovePreserveParticipants(Reconciler) {
  const graph = baseGraph();
  const source = graph.get('shared-text');
  source.sha256Checksum = null;
  source.headRevisionId = null;
  const harness = createHarness(Reconciler, {
    transportOptions: { graph, hiddenUntilChanges: [], changePages: [[]] }
  });
  assert.equal((await harness.reconciler.buildInitialInventory(exactContext())).ok, true);
  const initial = sourceById(harness.store, 'shared-text');
  assert.equal(initial.contentFingerprint.evidenceKind, 'download-byte-hash');
  const initialContentFingerprint = harness.schema.canonicalize(initial.contentFingerprint);
  const purgesBefore = harness.store.purged.filter((id) => id === 'shared-text').length;

  const renameReads = harness.transport.contentReads.length;
  source.name = 'Hash-only renamed agreement';
  source.modifiedTime = '2026-07-20T13:00:00.000Z';
  const renamed = await harness.reconciler.reconcileSource(
    exactContext(), 'shared-text', { removed: false }
  );
  assert.equal(renamed.ok, true);
  assert.equal(renamed.action, 'metadata',
    'same fallback bytes classify a hash-only rename as metadata-only');
  assert.equal(harness.transport.contentReads.length > renameReads, true,
    'hash-only rename performs the required fresh byte proof');
  assert.equal(harness.schema.canonicalize(
    sourceById(harness.store, 'shared-text').contentFingerprint
  ), initialContentFingerprint);
  assert.equal(harness.store.purged.filter((id) => id === 'shared-text').length, purgesBefore,
    'hash-only rename invokes zero source participant purge');

  const moveReads = harness.transport.contentReads.length;
  source.parents = ['vendor-b'];
  const moved = await harness.reconciler.reconcileSource(
    exactContext(), 'shared-text', { removed: false }
  );
  assert.equal(moved.ok, true);
  assert.equal(moved.action, 'membership',
    'same fallback bytes classify a hash-only move as membership-only');
  assert.equal(harness.transport.contentReads.length > moveReads, true,
    'hash-only move performs the required fresh byte proof');
  assert.equal(harness.schema.canonicalize(
    sourceById(harness.store, 'shared-text').contentFingerprint
  ), initialContentFingerprint);
  assert.equal(harness.store.purged.filter((id) => id === 'shared-text').length, purgesBefore,
    'hash-only move invokes zero source participant purge');
}

async function testOpaqueRemovalAndAuthoritativeMissing(Reconciler) {
  const harness = createHarness(Reconciler, { transportOptions: { hiddenUntilChanges: [], changePages: [[]] } });
  assert.equal((await harness.reconciler.buildInitialInventory(exactContext())).ok, true);

  harness.transport.graph.delete('shared-text');
  harness.transport.setFailure('getFile:shared-text', 'not-found', 404);
  harness.authority.decisions.set('shared-text', { decision: 'inaccessible' });
  const inaccessible = await harness.reconciler.reconcileSource(
    exactContext(), 'shared-text', { removed: true }
  );
  assert.equal(inaccessible.ok, true);
  assert.equal(inaccessible.state, 'inaccessible');
  assert.equal(sourceById(harness.store, 'shared-text').state, 'inaccessible',
    'opaque 404/removal hint becomes inaccessible, never guessed missing');
  const targetedProofIndex = harness.trace.findLastIndex((entry) =>
    entry.at === 'authority.certifySource' && entry.sourceFileId === 'shared-text'
  );
  const sourceEvents = harness.trace.slice(targetedProofIndex)
    .filter((entry) => entry.sourceFileId === 'shared-text');
  assert.ok(sourceEvents.findIndex((entry) => entry.at === 'authority.certifySource') >= 0,
    'removed hint still triggers fresh targeted authority reproof');
  assert.ok(sourceEvents.findIndex((entry) => entry.at === 'store.purgeSource') <
    sourceEvents.findIndex((entry) => entry.at === 'store.stageSource'),
  'tombstone/purge finishes before inaccessible replacement staging');
  assert.ok(sourceEvents.findIndex((entry) => entry.at === 'store.stageSource') <
    harness.trace.findLastIndex((entry) => entry.at === 'store.commitInventory'),
  'source purge and closed staging precede checkpoint/pointer publication');

  harness.transport.clearFailure('getFile:shared-text');
  harness.authority.decisions.delete('shared-text');
  const rescanned = await harness.reconciler.resume(exactContext());
  assert.equal(rescanned.ok, true, 'bounded complete authoritative rescan converges');
  assert.equal(sourceById(harness.store, 'shared-text').state, 'missing',
    'only a complete physical inventory absence set may mark missing');
  assertNoDurableBodyOrAuthority(harness.store);
}

async function testChangePaginationDedupAndRecovery(Reconciler) {
  const harness = createHarness(Reconciler, { transportOptions: { hiddenUntilChanges: [], changePages: [[]] } });
  assert.equal((await harness.reconciler.buildInitialInventory(exactContext())).ok, true);

  harness.transport.graph.get('root-policy').name = 'Policy rename';
  harness.transport.changePages = [
    [
      { fileId: 'root-policy', removed: false, time: null, file: clone(harness.transport.graph.get('root-policy')) },
      { fileId: 'doc-a', removed: false, time: null, file: clone(harness.transport.graph.get('doc-a')) }
    ],
    [
      { fileId: 'doc-a', removed: false, time: null, file: clone(harness.transport.graph.get('doc-a')) },
      { fileId: 'root-policy', removed: false, time: null, file: clone(harness.transport.graph.get('root-policy')) }
    ]
  ];
  const beforeReads = harness.transport.contentReads.length;
  const reconciled = await harness.reconciler.reconcileChanges(exactContext());
  assert.equal(reconciled.ok, true);
  assert.equal(reconciled.hintCount, 2, 'duplicate/reordered change pages dedupe by stable file identity');
  assert.equal(harness.transport.contentReads.length, beforeReads,
    'duplicate rename/no-change hints do not trigger content work');
  assert.equal(harness.trace.filter((entry) => entry.at === 'authority.certifySource' &&
    ['doc-a', 'root-policy'].includes(entry.sourceFileId)).slice(-2).length, 2,
  'each deduplicated change remains only a hint until one fresh reproof');

  const listChanges = harness.transport.listChanges.bind(harness.transport);
  let failNextChangePage = true;
  harness.transport.listChanges = async (input) => {
    if (failNextChangePage) {
      failNextChangePage = false;
      harness.trace.push({ at: 'transport.listChanges', driveId: input && input.driveId || null });
      return result('incomplete', null, 200);
    }
    return listChanges(input);
  };
  const recovered = await harness.reconciler.reconcileChanges(exactContext());
  assert.equal(recovered.ok, true, 'incomplete/invalid token schedules one bounded full rescan');
  assert.equal(recovered.recoveredBy, 'full-rescan');

  const noToken = createHarness(Reconciler, {
    transport: harness.transport,
    authority: harness.authority,
    store: harness.store,
    trace: harness.trace
  });
  const resumed = await noToken.reconciler.resume(exactContext());
  assert.equal(resumed.ok, true, 'restart without operation-memory token performs bounded full rescan');
  assert.equal(resumed.recoveredBy, 'full-rescan');
  assertNoDurableBodyOrAuthority(harness.store);
}

async function testIncompleteCyclesBoundsAndIdentityDrift(Reconciler) {
  {
    const harness = createHarness(Reconciler);
    harness.transport.setFailure('listChildren:vendor-a', 'incomplete', 200);
    const failed = await harness.reconciler.buildInitialInventory(exactContext());
    assert.equal(failed.ok, false);
    assert.equal(harness.store.visible, false, 'incomplete search never publishes partial inventory');
  }

  {
    const harness = createHarness(Reconciler, { limits: { maxItemsPerScan: 2, maxRescans: 0 } });
    const bounded = await harness.reconciler.buildInitialInventory(exactContext());
    assert.equal(bounded.ok, false);
    assert.equal(harness.store.visible, false, 'item/page/request bounds fail closed rather than truncate');
  }

  {
    const harness = createHarness(Reconciler);
    harness.transport.graph.set('cycle-a', file('cycle-a', FOLDER_MIME, ['root-1', 'cycle-b']));
    harness.transport.graph.set('cycle-b', file('cycle-b', FOLDER_MIME, ['cycle-a']));
    const cyclic = await harness.reconciler.buildInitialInventory(exactContext());
    assert.equal(cyclic.ok, false);
    assert.equal(harness.store.visible, false, 'physical folder cycle closes staging');
  }

  {
    const harness = createHarness(Reconciler);
    harness.transport.permissionId = 'permission-2';
    const drift = await harness.reconciler.buildInitialInventory(exactContext());
    assert.equal(drift.ok, false);
    assert.equal(harness.store.visible, false, 'identity/root drift cannot publish');
  }

  {
    const harness = createHarness(Reconciler);
    let drifted = false;
    harness.store.beforeStage = async () => {
      if (drifted) return;
      drifted = true;
      harness.transport.permissionId = 'permission-2';
    };
    const drift = await harness.reconciler.buildInitialInventory(exactContext());
    assert.equal(drift.ok, false);
    assert.equal(harness.store.visible, false,
      'account drift during invisible staging is re-proven before pointer publication');
  }

  {
    const harness = createHarness(Reconciler);
    harness.authority.decisions.set('doc-a', { decision: 'pending' });
    const pending = await harness.reconciler.buildInitialInventory(exactContext());
    assert.equal(pending.ok, true, 'uncertain ancestry is represented as withheld pending after complete scan');
    assert.equal(sourceById(harness.store, 'doc-a').state, 'pending');
    assert.equal(sourceById(harness.store, 'doc-a').displayName, null);
  }
}

async function testCapabilityBoundReadGateAndCommitRaces(Reconciler) {
  {
    const harness = createHarness(Reconciler, {
      limits: { maxRescans: 0 },
      transportOptions: { hiddenUntilChanges: [], changePages: [[]] }
    });
    const unchangedParents = harness.transport.graph.get('doc-a').parents.slice();
    let raced = false;
    harness.transport.afterReadContent = async (sourceFileId) => {
      if (raced || sourceFileId !== 'doc-a') return;
      raced = true;
      harness.transport.graph.get('doc-a').headRevisionId = 'rev-doc-a-read-race';
    };
    const built = await harness.reconciler.buildInitialInventory(exactContext());
    assert.equal(raced, true, 'content revision changes across the certified read await');
    assert.deepEqual(harness.transport.graph.get('doc-a').parents, unchangedParents,
      'the read race keeps the exact physical ancestry unchanged');
    assert.equal(built.ok, false);
    assert.equal(harness.store.visible, false,
      'a revision changed after the content read cannot escape its source capability epoch');
  }

  {
    const harness = createHarness(Reconciler, {
      limits: { maxRescans: 0 },
      transportOptions: { hiddenUntilChanges: [], changePages: [[]] }
    });
    const unchangedParents = harness.transport.graph.get('doc-a').parents.slice();
    let raced = false;
    harness.authority.beforePublish = async ({ sourceFileIds }) => {
      if (raced || sourceFileIds.length < 2 || !sourceFileIds.includes('doc-a')) return;
      raced = true;
      harness.transport.graph.get('doc-a').headRevisionId = 'rev-doc-a-gate-race';
    };
    const built = await harness.reconciler.buildInitialInventory(exactContext());
    assert.equal(raced, true, 'content revision changes across the final authority gate await');
    assert.deepEqual(harness.transport.graph.get('doc-a').parents, unchangedParents,
      'the final-gate race keeps the exact physical ancestry unchanged');
    assert.equal(built.ok, false);
    assert.equal(harness.store.visible, false,
      'the complete active record set is revalidated immediately before publication');
  }

  {
    const harness = createHarness(Reconciler, {
      limits: { maxRescans: 0 },
      transportOptions: { hiddenUntilChanges: [], changePages: [[]] }
    });
    const unchangedParents = harness.transport.graph.get('doc-a').parents.slice();
    let raced = false;
    harness.store.beforeCommit = async () => {
      if (raced) return;
      raced = true;
      harness.transport.graph.get('doc-a').headRevisionId = 'rev-doc-a-commit-race';
    };
    const built = await harness.reconciler.buildInitialInventory(exactContext());
    assert.equal(raced, true, 'content revision changes across the pointer-last commit await');
    assert.deepEqual(harness.transport.graph.get('doc-a').parents, unchangedParents,
      'the commit race keeps the exact physical ancestry unchanged');
    assert.equal(built.ok, false);
    assert.equal(harness.store.visible, false,
      'the store-owned handle rejects an authority token that becomes stale at commit');
  }
}

async function testEmptyInventoryStillUsesAuthorityEpoch(Reconciler) {
  const graph = baseGraph();
  for (const [sourceFileId, value] of graph) {
    if (value.mimeType !== FOLDER_MIME) graph.delete(sourceFileId);
  }
  const harness = createHarness(Reconciler, {
    transportOptions: { graph, hiddenUntilChanges: [], changePages: [[]] }
  });
  const built = await harness.reconciler.buildInitialInventory(exactContext());
  assert.equal(built.ok, true);
  assert.equal(built.sourceCount, 0);
  assert.equal(harness.store.visible, true);
  assert.equal(harness.trace.some((entry) => entry.at === 'authority.runWithCertifiedSources' &&
    entry.sourceFileIds.length === 0), true,
  'even an empty inventory holds fresh root authority through pointer-last publication');
}

async function testNonCooperativeDirectScanDeadlines(Reconciler) {
  {
    const harness = createHarness(Reconciler, {
      limits: { maxOperationMs: 20 },
      transportOptions: { hiddenUntilChanges: [], changePages: [[]] }
    });
    harness.transport.never.add('getFile:root-1');
    const settled = await settleWithin(
      harness.reconciler.buildInitialInventory(exactContext()),
      120
    );
    assert.equal(settled.settled, true,
      'a direct scan promise that ignores abort settles at the reconciler deadline');
    assert.equal(settled.value && settled.value.ok, false);
    assert.equal(harness.store.visible, false,
      'the deadline-closing run epoch cannot publish late inventory');
  }

  for (const neverKey of ['getFile:root-1', 'getStartPageToken', 'listChildren:root-1']) {
    const harness = createHarness(Reconciler, {
      transportOptions: { hiddenUntilChanges: [], changePages: [[]] }
    });
    harness.transport.never.add(neverKey);
    const running = harness.reconciler.buildInitialInventory(exactContext());
    setTimeout(() => harness.reconciler.abort(`deadline-${neverKey}`), 10);
    const settled = await settleWithin(running, 120);
    assert.equal(settled.settled, true,
      `${neverKey} settles after abort even when the direct scan promise ignores its signal`);
    assert.equal(settled.value && settled.value.ok, false);
    assert.equal(harness.store.visible, false,
      `${neverKey} cannot publish after its run epoch closes`);
  }

  {
    const harness = createHarness(Reconciler, {
      transportOptions: { hiddenUntilChanges: [], changePages: [[]] }
    });
    assert.equal((await harness.reconciler.buildInitialInventory(exactContext())).ok, true);
    const priorCursor = harness.store.checkpoint.cursor;
    harness.transport.never.add('listChanges');
    const running = harness.reconciler.reconcileChanges(exactContext());
    setTimeout(() => harness.reconciler.abort('deadline-listChanges'), 10);
    const settled = await settleWithin(running, 120);
    assert.equal(settled.settled, true,
      'listChanges settles after abort even when the direct change-page promise never resolves');
    assert.equal(settled.value && settled.value.ok, false);
    assert.equal(harness.store.checkpoint.cursor, priorCursor,
      'a detached late change scan cannot publish a new checkpoint');
  }
}

async function testMutationTimeoutHoldsReconcilerLane(Reconciler) {
  const harness = createHarness(Reconciler, {
    limits: { maxOperationMs: 25, maxRescans: 0 },
    transportOptions: { hiddenUntilChanges: [], changePages: [[]] }
  });
  const reached = deferred();
  const release = deferred();
  let paused = false;
  harness.store.beforeStage = async () => {
    if (paused) return;
    paused = true;
    reached.resolve();
    await release.promise;
  };

  const first = harness.reconciler.buildInitialInventory(exactContext());
  await reached.promise;
  const bounded = await settleWithin(first, 120);
  assert.equal(bounded.settled, true,
    'reconciler returns a bounded public failure while a store mutation is cancelling');
  assert.equal(bounded.value && bounded.value.ok, false);
  const queued = harness.reconciler.resume(exactContext());
  const premature = await settleWithin(queued, 15);
  assert.equal(premature.settled, false,
    'reconciler mutation lane stays held until the timed-out store call is terminal');
  const traceBoundary = harness.trace.length;
  release.resolve();
  const resumed = await settleWithin(queued, 500);
  assert.equal(resumed.settled, true);
  assert.equal(resumed.value && resumed.value.ok, true,
    'queued reconciliation resumes after terminal cancellation acknowledgement');
  const firstStoreEventAfterRelease = harness.trace.slice(traceBoundary)
    .find((entry) => entry.at && entry.at.startsWith('store.'));
  assert.equal(firstStoreEventAfterRelease && firstStoreEventAfterRelease.at, 'store.recover',
    'the cancelled staged write causes zero late store mutation before the queued run starts');
}

async function testCrashRestartConvergenceAndAbort(Reconciler) {
  for (let crashAt = 1; crashAt <= 8; crashAt += 1) {
    const trace = [];
    const first = createHarness(Reconciler, { trace, transportOptions: { hiddenUntilChanges: [], changePages: [[]] } });
    first.store.failAtMutation = crashAt;
    const interrupted = await first.reconciler.buildInitialInventory(exactContext());
    assert.equal(interrupted.ok, false, `injected restart crash ${crashAt} returns closed recovery state`);
    assert.equal(first.store.visible, false, `crash ${crashAt} cannot expose incomplete staging`);

    first.store.failAtMutation = null;
    const restarted = createHarness(Reconciler, {
      trace,
      transport: first.transport,
      authority: first.authority,
      store: first.store
    });
    const resumed = await restarted.reconciler.resume(exactContext());
    assert.equal(resumed.ok, true, `restart ${crashAt} converges idempotently`);
    assert.equal(first.store.visible, true);
    assertNoDurableBodyOrAuthority(first.store);
  }

  const harness = createHarness(Reconciler);
  assert.equal(harness.reconciler.abort('navigation'), true);
  assert.equal(harness.reconciler.abort('again'), false);
  const aborted = await harness.reconciler.buildInitialInventory(exactContext());
  assert.equal(aborted.ok, false);
  assert.equal(aborted.status, 'aborted');
  assert.equal(harness.store.visible, false);

  const midCommit = createHarness(Reconciler, {
    transportOptions: { hiddenUntilChanges: [], changePages: [[]] }
  });
  midCommit.store.beforeCommit = async () => {
    midCommit.store.beforeCommit = null;
    midCommit.reconciler.abort('during-commit');
  };
  const lateAbort = await midCommit.reconciler.buildInitialInventory(exactContext());
  assert.equal(lateAbort.ok, false);
  assert.equal(lateAbort.status, 'aborted');
  assert.equal(midCommit.store.visible, false,
    'abort racing pointer publication withdraws and purges before returning');
}

function createMemoryStorage() {
  const values = Object.create(null);
  function selected(keys) {
    if (keys === null) return clone(values);
    const result = Object.create(null);
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      if (Object.prototype.hasOwnProperty.call(values, key)) result[key] = clone(values[key]);
    }
    return result;
  }
  return {
    values,
    area: {
      async get(keys) { return selected(keys); },
      async set(update) {
        for (const [key, value] of Object.entries(update || {})) values[key] = clone(value);
      },
      async remove(keys) {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
      }
    }
  };
}

function registerOwnedParticipants(store) {
  const ownership = new Map(PURGE_PARTICIPANTS.map((name) => [name, new Set()]));
  let partitionPurges = 0;
  function guardOpen(guard) {
    return !!guard && guard.signal && guard.signal.aborted === false &&
      guard.operationToken && typeof guard.operationToken === 'object' &&
      Number.isSafeInteger(guard.operationEpoch);
  }
  for (const name of PURGE_PARTICIPANTS) {
    const registered = store.registerPurgeParticipant(name, {
      async purgeSource(request, guard) {
        if (!guardOpen(guard)) return { ok: false };
        ownership.get(name).delete(request.sourceFileId);
        return { ok: true };
      },
      async purgePartition(_request, guard) {
        if (!guardOpen(guard)) return { ok: false };
        partitionPurges += 1;
        ownership.get(name).clear();
        return { ok: true };
      },
      async hasOwnedInfluence(request, guard) {
        if (!guardOpen(guard)) return { owned: true };
        const owned = request.sourceFileId === null
          ? ownership.get(name).size > 0
          : ownership.get(name).has(request.sourceFileId);
        return { owned };
      }
    });
    assert.equal(registered.ok, true, `${name} real-store participant registers`);
  }
  return {
    seed(sourceIds) {
      for (const owned of ownership.values()) {
        for (const sourceFileId of sourceIds) owned.add(sourceFileId);
      }
    },
    count() {
      return Array.from(ownership.values()).reduce((total, owned) => total + owned.size, 0);
    },
    partitionPurges() { return partitionPurges; }
  };
}

async function testRealStoreSameRootRefreshAndRestartReuse(Reconciler) {
  const schema = require(SCHEMA_PATH);
  const CorpusStore = require(CORPUS_STORE_PATH);
  const memory = createMemoryStorage();
  const trace = [];
  const transport = new FakeTransport(trace, { hiddenUntilChanges: [], changePages: [[]] });
  const authority = new FakeAuthority(trace, transport, schema);

  let store = CorpusStore.create({ storageArea: memory.area, schema, now: () => 1700000000000 });
  let participants = registerOwnedParticipants(store);
  let reconciler = Reconciler.create({
    schema,
    store,
    transport,
    authority,
    limits: limits()
  });

  const initial = await reconciler.buildInitialInventory(exactContext());
  assert.equal(initial.ok, true, 'real corpus store publishes the initial corpus');
  const visible = await store.getVisibleManifest({
    accountPermissionId: 'permission-1',
    corpusRootFileId: 'root-1'
  });
  const sourceIds = visible.sources.map((source) => source.sourceFileId);
  participants.seed(sourceIds);
  const ownedCount = participants.count();
  const readsAfterInitial = transport.contentReads.length;

  const refreshed = await reconciler.buildInitialInventory(exactContext());
  assert.equal(refreshed.ok, true, 'same-root full refresh commits a new generation');
  assert.equal(participants.partitionPurges(), 0,
    'same-root refresh invokes zero partition-wide participant purges');
  assert.equal(participants.count(), ownedCount,
    'same-root refresh preserves every unchanged participant-owned derivative');
  assert.equal(transport.contentReads.length, readsAfterInitial,
    'same-root refresh performs zero content reads for unchanged trustworthy identities');

  store = CorpusStore.create({ storageArea: memory.area, schema, now: () => 1700000000000 });
  participants = registerOwnedParticipants(store);
  participants.seed(sourceIds);
  reconciler = Reconciler.create({
    schema,
    store,
    transport,
    authority,
    limits: limits()
  });
  const restarted = await reconciler.resume(exactContext());
  assert.equal(restarted.ok, true, 'module reconstruction converges by bounded full rescan');
  assert.equal(participants.partitionPurges(), 0,
    'post-restart same-root recovery invokes zero partition participant purges');
  assert.equal(participants.count(), ownedCount,
    'post-restart refresh retains unchanged participant ownership');
  assert.equal(transport.contentReads.length, readsAfterInitial,
    'persisted Drive revision/checksum identities avoid unchanged content reads after restart');
}

async function main() {
  delete globalThis.FsbSkopeoDriveReconciler;

  // Controlled RED: every behavioral oracle below is ready first, and Task 1
  // fails only because the production classic-script reconciler is absent.
  if (!fs.existsSync(RECONCILER_PATH)) {
    throw new Error(
      'FsbSkopeoDriveReconciler missing: extension/utils/skopeo-drive-reconciler.js is required'
    );
  }

  const Reconciler = require(RECONCILER_PATH);
  await testSurfaceAndInitialInventory(Reconciler);
  await testKeyedParentInventoryPropagation(Reconciler);
  await testHintReproofAndFingerprintDecisions(Reconciler);
  await testHashFallbackRenameAndMovePreserveParticipants(Reconciler);
  await testOpaqueRemovalAndAuthoritativeMissing(Reconciler);
  await testChangePaginationDedupAndRecovery(Reconciler);
  await testIncompleteCyclesBoundsAndIdentityDrift(Reconciler);
  await testCapabilityBoundReadGateAndCommitRaces(Reconciler);
  await testEmptyInventoryStillUsesAuthorityEpoch(Reconciler);
  await testNonCooperativeDirectScanDeadlines(Reconciler);
  await testMutationTimeoutHoldsReconcilerLane(Reconciler);
  await testCrashRestartConvergenceAndAbort(Reconciler);
  await testRealStoreSameRootRefreshAndRestartReuse(Reconciler);

  const source = fs.readFileSync(RECONCILER_PATH, 'utf8');
  assert.match(source, /FsbSkopeoDriveReconciler/);
  assert.match(source, /buildInitialInventory/);
  assert.match(source, /reconcileChanges/);
  assert.match(source, /reconcileSource/);
  assert.match(source, /resume/);
  assert.match(source, /newStartPageToken/);
  assert.match(source, /commitInventory/);
  assert.match(source, /runWithCertifiedSource/,
    'source reads and record construction stay inside the ingestion capability');
  assert.match(source, /runWithCertifiedSources/,
    'pointer-last publication is bound to fresh proof for the complete active record set');
  assert.equal(/chrome\.storage|sendMessage|console\.|fullText|bytesBase64|resourceKey\s*:/.test(source), false,
    'reconciler has no storage/message/log/body/raw-resource-key persistence path');

  console.log('skopeo Drive reconciler baseline/change/recovery contract: PASS');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
