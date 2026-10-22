'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto, createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const CAPABILITY_FETCH_PATH = path.join(ROOT, 'extension', 'utils', 'capability-fetch.js');
const TRANSPORT_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-drive-corpus-transport.js');
const PUBLIC_CATALOG_PATHS = Object.freeze([
  path.join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js'),
  path.join(ROOT, 'extension', 'catalog', 'skopeo-profile-index.generated.js')
]);

const PRIVATE_NAMESPACE = 'skopeo-drive-corpus';
const DRIVE_ORIGIN = 'https://drive.google.com';
const DOCS_ORIGIN = 'https://docs.google.com';
const DOC_MIME = 'application/vnd.google-apps.document';
const TEXT_MIME = 'text/plain';
const MAX_EXACT_BYTES = 10_485_760;
const FILE_FIELDS = [
  'capabilities(canDownload,canListChildren)',
  'driveId',
  'headRevisionId',
  'id',
  'md5Checksum',
  'mimeType',
  'modifiedTime',
  'name',
  'parents',
  'resourceKey',
  'sha1Checksum',
  'sha256Checksum',
  'shortcutDetails(targetId,targetMimeType)',
  'size',
  'trashed',
  'version'
].join(',');
const RESULT_KINDS = Object.freeze([
  'ok',
  'transient',
  'denied',
  'not-found',
  'download-denied',
  'unsupported',
  'incomplete',
  'too-large',
  'malformed'
]);

function ownKeys(value) {
  return value && typeof value === 'object' ? Reflect.ownKeys(value).sort() : [];
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeFile(overrides = {}) {
  return Object.assign({
    id: 'file-1',
    name: 'Agreement.txt',
    mimeType: TEXT_MIME,
    parents: ['folder-1'],
    trashed: false,
    driveId: 'drive-1',
    resourceKey: 'rk-file-1',
    capabilities: { canDownload: true, canListChildren: false },
    version: '42',
    headRevisionId: 'revision-42',
    md5Checksum: 'a'.repeat(32),
    sha1Checksum: 'b'.repeat(40),
    sha256Checksum: 'c'.repeat(64),
    size: '12',
    modifiedTime: '2026-07-20T12:00:00.000Z',
    shortcutDetails: null,
    webViewLink: 'https://drive.google.com/leak',
    description: '<img src=x onerror=alert(1)>'
  }, overrides);
}

function installPageGlobals(origin, requestHandler) {
  const globalNames = ['location', 'gapi', 'crypto', 'TextEncoder', 'TextDecoder', 'btoa', 'atob'];
  const prior = Object.fromEntries(globalNames.map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name)
  ]));
  const priorBtoa = globalThis.btoa;
  const priorAtob = globalThis.atob;
  function install(name, value) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
  }
  const calls = [];
  install('location', { origin });
  install('crypto', webcrypto);
  install('TextEncoder', TextEncoder);
  install('TextDecoder', TextDecoder);
  install('btoa', priorBtoa || function btoaNode(value) {
    return Buffer.from(value, 'binary').toString('base64');
  });
  install('atob', priorAtob || function atobNode(value) {
    return Buffer.from(value, 'base64').toString('binary');
  });
  install('gapi', {
    client: {
      setApiKey() {},
      request(options) {
        calls.push(options);
        return Promise.resolve().then(() => requestHandler(options, calls.length - 1));
      }
    }
  });
  return {
    calls,
    restore() {
      for (const [key, descriptor] of Object.entries(prior)) {
        if (descriptor === undefined) delete globalThis[key];
        else Object.defineProperty(globalThis, key, descriptor);
      }
    }
  };
}

async function callPrivatePage(pageFn, action, args, requestHandler, origin = DRIVE_ORIGIN) {
  const fixture = installPageGlobals(origin, requestHandler);
  try {
    const result = await pageFn({
      origin,
      namespace: PRIVATE_NAMESPACE,
      action,
      args
    });
    return { result, calls: fixture.calls };
  } finally {
    fixture.restore();
  }
}

function assertNoRawProviderLeak(value, label) {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    'provider-secret-message',
    '<html>',
    'raw-stack',
    'Authorization',
    'webViewLink',
    'description'
  ]) {
    assert.equal(serialized.includes(forbidden), false, `${label} strips ${forbidden}`);
  }
}

function assertPageFailure(result, kind, status) {
  assert.equal(result && result.kind, kind);
  assert.equal(result && result.status, status);
  assertNoRawProviderLeak(result, `${kind} result`);
}

async function testPrivatePageNamespace(pageFn) {
  const about = await callPrivatePage(pageFn, 'about', {}, () => ({
    status: 200,
    result: {
      user: {
        permissionId: 'permission-123',
        displayName: 'must-not-cross',
        emailAddress: 'must-not-cross@example.test',
        photoLink: 'https://example.test/leak'
      },
      storageQuota: { limit: 'secret' }
    }
  }));
  assert.deepEqual(plain(about.result), {
    kind: 'ok',
    status: 200,
    data: { permissionId: 'permission-123' }
  }, 'about returns permissionId as the sole account authority fact');
  assert.deepEqual(about.calls, [{
    path: '/drive/v3/about',
    method: 'GET',
    params: { fields: 'user(permissionId)' }
  }], 'about constructs one exact fixed gapi request');

  const fileFixture = makeFile({
    id: 'file/with space',
    mimeType: 'application/vnd.google-apps.shortcut',
    shortcutDetails: {
      targetId: 'outside-target',
      targetMimeType: DOC_MIME,
      targetResourceKey: 'must-not-cross'
    }
  });
  const getFile = await callPrivatePage(pageFn, 'getFile', {
    fileId: 'file/with space',
    resourceKey: 'rk-file-1'
  }, () => ({ status: 200, result: fileFixture }));
  assert.equal(getFile.result.kind, 'ok');
  assert.deepEqual(plain(getFile.result.data.parents), ['folder-1'], 'physical parents survive');
  assert.deepEqual(plain(getFile.result.data.shortcutDetails), {
    targetId: 'outside-target',
    targetMimeType: DOC_MIME
  }, 'shortcut is leaf metadata and targetResourceKey is stripped');
  assert.equal(getFile.calls.length, 1, 'shortcut metadata never triggers a target fetch');
  assert.deepEqual(getFile.calls[0], {
    path: '/drive/v3/files/file%2Fwith%20space',
    method: 'GET',
    params: {
      fields: FILE_FIELDS,
      supportsAllDrives: true
    },
    headers: {
      'X-Goog-Drive-Resource-Keys': 'file/with space/rk-file-1'
    }
  }, 'getFile pins fields and sends the source resource key in the Drive header');
  assertNoRawProviderLeak(getFile.result, 'file metadata');

  const listChildren = await callPrivatePage(pageFn, 'listChildren', {
    parentFileId: 'parent-1',
    pageToken: 'page-2',
    driveId: 'shared-drive-1',
    resourceKey: 'rk-parent-1'
  }, () => ({
    status: 200,
    result: {
      files: [makeFile()],
      nextPageToken: 'page-3',
      incompleteSearch: false,
      kind: 'ignored-extra'
    }
  }));
  assert.equal(listChildren.result.kind, 'ok');
  assert.equal(listChildren.result.data.files.length, 1);
  assert.deepEqual(plain(listChildren.result.data.files[0].parents), ['folder-1']);
  assert.equal(listChildren.result.data.nextPageToken, 'page-3');
  assert.equal(listChildren.result.data.incompleteSearch, false);
  assert.deepEqual(listChildren.calls[0], {
    path: '/drive/v3/files',
    method: 'GET',
    params: {
      q: "'parent-1' in parents and trashed = false",
      spaces: 'drive',
      corpora: 'drive',
      driveId: 'shared-drive-1',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 1000,
      pageToken: 'page-2',
      fields: `nextPageToken,incompleteSearch,files(${FILE_FIELDS})`
    },
    headers: {
      'X-Goog-Drive-Resource-Keys': 'parent-1/rk-parent-1'
    }
  }, 'shared-drive list is direct-parent-only and carries the exact parent resource key');

  const incomplete = await callPrivatePage(pageFn, 'listChildren', {
    parentFileId: 'parent-1'
  }, () => ({
    status: 200,
    result: { files: [makeFile()], incompleteSearch: true }
  }));
  assertPageFailure(incomplete.result, 'incomplete', 200);
  assert.equal(Object.prototype.hasOwnProperty.call(incomplete.result, 'data'), false,
    'incomplete search cannot publish partial items');

  const start = await callPrivatePage(pageFn, 'getStartPageToken', {
    driveId: 'shared-drive-1'
  }, () => ({ status: 200, result: { startPageToken: 'start-1' } }));
  assert.deepEqual(plain(start.result), {
    kind: 'ok', status: 200, data: { startPageToken: 'start-1' }
  });
  assert.deepEqual(start.calls[0], {
    path: '/drive/v3/changes/startPageToken',
    method: 'GET',
    params: { supportsAllDrives: true, driveId: 'shared-drive-1' }
  });

  const changes = await callPrivatePage(pageFn, 'listChanges', {
    pageToken: 'start-1',
    driveId: 'shared-drive-1'
  }, () => ({
    status: 200,
    result: {
      changes: [
        { fileId: 'removed-1', removed: true, time: '2026-07-20T12:01:00.000Z' },
        { fileId: 'file-1', removed: false, time: '2026-07-20T12:02:00.000Z', file: makeFile() }
      ],
      nextPageToken: null,
      newStartPageToken: 'start-2'
    }
  }));
  assert.equal(changes.result.kind, 'ok');
  assert.deepEqual(plain(changes.result.data.changes[0]), {
    fileId: 'removed-1', removed: true, time: '2026-07-20T12:01:00.000Z', file: null
  }, 'removed change remains an opaque hint, not membership proof');
  assert.deepEqual(plain(changes.result.data.changes[1].file.parents), ['folder-1']);
  assert.equal(changes.result.data.newStartPageToken, 'start-2');
  assert.deepEqual(changes.calls[0], {
    path: '/drive/v3/changes',
    method: 'GET',
    params: {
      pageToken: 'start-1',
      spaces: 'drive',
      includeRemoved: true,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      driveId: 'shared-drive-1',
      pageSize: 1000,
      fields: `nextPageToken,newStartPageToken,changes(fileId,removed,time,file(${FILE_FIELDS}))`
    }
  });

  for (const [status, kind] of [
    [401, 'transient'],
    [403, 'denied'],
    [404, 'not-found'],
    [408, 'transient'],
    [429, 'transient'],
    [500, 'transient'],
    [503, 'transient'],
    [418, 'unsupported']
  ]) {
    const failure = await callPrivatePage(pageFn, 'getFile', { fileId: 'file-1' }, () => Promise.reject({
      status,
      message: 'provider-secret-message',
      body: '<html>',
      stack: 'raw-stack'
    }));
    assertPageFailure(failure.result, kind, status);
  }

  const malformed = await callPrivatePage(pageFn, 'about', {}, () => ({
    status: 200,
    result: { user: { permissionId: '' }, body: '<html>' }
  }));
  assertPageFailure(malformed.result, 'malformed', 200);

  const unknownShape = await callPrivatePage(pageFn, 'about', {}, () => ({
    status: 'success',
    result: { user: { permissionId: 'permission-123' } },
    message: 'provider-secret-message'
  }));
  assertPageFailure(unknownShape.result, 'unsupported', null);

  const forbiddenOuter = await pageFn({
    origin: DRIVE_ORIGIN,
    namespace: PRIVATE_NAMESPACE,
    action: 'about',
    args: {},
    url: 'https://www.googleapis.com/drive/v3/files',
    method: 'DELETE'
  });
  assertPageFailure(forbiddenOuter, 'unsupported', null);

  const forgedAction = await callPrivatePage(pageFn, 'fetch', {
    url: 'https://www.googleapis.com/drive/v3/files',
    method: 'GET',
    fields: '*',
    q: 'fullText contains secret',
    mimeType: 'text/html'
  }, () => { throw new Error('authenticated call must not run'); });
  assertPageFailure(forgedAction.result, 'unsupported', null);
  assert.equal(forgedAction.calls.length, 0, 'arbitrary URL/method/fields/query action makes zero gapi calls');

  const wrongOrigin = await callPrivatePage(pageFn, 'about', {}, () => {
    throw new Error('wrong-origin authenticated call must not run');
  }, 'https://evil.example');
  assertPageFailure(wrongOrigin.result, 'unsupported', null);
  assert.equal(wrongOrigin.calls.length, 0);

  for (const mimeType of [
    'application/pdf',
    'application/vnd.google-apps.spreadsheet',
    'application/vnd.google-apps.presentation',
    'application/octet-stream',
    'text/html',
    'text/markdown',
    'text/csv',
    'text/*',
    'text/plain; charset=utf-8'
  ]) {
    const unsupported = await callPrivatePage(pageFn, 'readContent', {
      fileId: 'file-1', mimeType
    }, () => { throw new Error('unsupported MIME must not authenticate'); });
    assertPageFailure(unsupported.result, 'unsupported', null);
    assert.equal(unsupported.calls.length, 0, `${mimeType} makes zero authenticated calls`);
  }

  const docsBody = new TextEncoder().encode('Google Docs exact bytes\n');
  const docsRead = await callPrivatePage(pageFn, 'readContent', {
    fileId: 'doc-1', mimeType: DOC_MIME, resourceKey: 'rk-doc-1'
  }, (options, index) => {
    if (index === 0) {
      return { status: 200, result: makeFile({
        id: 'doc-1', mimeType: DOC_MIME, resourceKey: 'rk-doc-1', size: null,
        md5Checksum: null, sha1Checksum: null, sha256Checksum: null
      }) };
    }
    return { status: 200, body: docsBody };
  }, DOCS_ORIGIN);
  assert.equal(docsRead.result.kind, 'ok');
  assert.equal(docsRead.result.data.exactByteLength, docsBody.byteLength);
  assert.match(docsRead.result.data.byteHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(typeof docsRead.result.data.bytesBase64, 'string');
  assert.equal(Object.prototype.hasOwnProperty.call(docsRead.result.data, 'text'), false,
    'private page response carries exact bytes, not decoded fullText');
  assert.equal(docsRead.calls.length, 2);
  assert.equal(docsRead.calls[0].path, '/drive/v3/files/doc-1');
  assert.equal(docsRead.calls[0].params.fields, FILE_FIELDS);
  assert.deepEqual(docsRead.calls[0].headers, {
    'X-Goog-Drive-Resource-Keys': 'doc-1/rk-doc-1'
  }, 'Google Docs metadata sends the exact-source resource-key header');
  assert.deepEqual(docsRead.calls[1], {
    path: '/drive/v3/files/doc-1/export',
    method: 'GET',
    params: { mimeType: TEXT_MIME },
    headers: {
      'X-Goog-Drive-Resource-Keys': 'doc-1/rk-doc-1'
    }
  }, 'Google Docs export carries the exact-source resource-key header');

  const blobBody = new TextEncoder().encode('Stored text exact bytes\n');
  const blobRead = await callPrivatePage(pageFn, 'readContent', {
    fileId: 'blob-1', mimeType: TEXT_MIME, resourceKey: 'rk-blob-1'
  }, (options, index) => index === 0
    ? { status: 200, result: makeFile({ id: 'blob-1', resourceKey: 'rk-blob-1' }) }
    : { status: 200, body: blobBody });
  assert.equal(blobRead.result.kind, 'ok');
  assert.deepEqual(blobRead.calls[1], {
    path: '/drive/v3/files/blob-1',
    method: 'GET',
    params: { alt: 'media', supportsAllDrives: true },
    headers: {
      'X-Goog-Drive-Resource-Keys': 'blob-1/rk-blob-1'
    }
  }, 'stored exact text/plain media read carries the exact-source resource-key header');

  const blocked = await callPrivatePage(pageFn, 'readContent', {
    fileId: 'blocked-1', mimeType: TEXT_MIME
  }, () => ({ status: 200, result: makeFile({
    id: 'blocked-1', capabilities: { canDownload: false, canListChildren: false }
  }) }));
  assertPageFailure(blocked.result, 'download-denied', 200);
  assert.equal(blocked.calls.length, 1, 'canDownload:false prevents the body call');

  const contentDenied = await callPrivatePage(pageFn, 'readContent', {
    fileId: 'denied-1', mimeType: TEXT_MIME
  }, (options, index) => index === 0
    ? { status: 200, result: makeFile({ id: 'denied-1' }) }
    : Promise.reject({ status: 403, message: 'provider-secret-message' }));
  assertPageFailure(contentDenied.result, 'download-denied', 403);

  let declaredReaderUsed = false;
  const declaredTooLarge = await callPrivatePage(pageFn, 'readContent', {
    fileId: 'large-1', mimeType: TEXT_MIME
  }, (options, index) => index === 0
    ? { status: 200, result: makeFile({ id: 'large-1' }) }
    : {
        status: 200,
        headers: { 'content-length': String(MAX_EXACT_BYTES + 1) },
        body: {
          getReader() {
            declaredReaderUsed = true;
            throw new Error('declared oversize must not read');
          }
        }
      });
  assertPageFailure(declaredTooLarge.result, 'too-large', 200);
  assert.equal(declaredReaderUsed, false, 'declared byte 10,485,761 rejects before streaming');
  assert.equal(JSON.stringify(declaredTooLarge.result).includes('byteHash'), false);

  let streamCancelled = 0;
  let streamIndex = 0;
  const streamedTooLarge = await callPrivatePage(pageFn, 'readContent', {
    fileId: 'stream-large-1', mimeType: TEXT_MIME
  }, (options, index) => index === 0
    ? { status: 200, result: makeFile({ id: 'stream-large-1' }) }
    : {
        status: 200,
        headers: { get() { return null; } },
        body: {
          getReader() {
            return {
              async read() {
                streamIndex += 1;
                if (streamIndex === 1) return { done: false, value: new Uint8Array(MAX_EXACT_BYTES) };
                if (streamIndex === 2) return { done: false, value: new Uint8Array([1]) };
                return { done: true };
              },
              async cancel() { streamCancelled += 1; }
            };
          }
        }
      });
  assertPageFailure(streamedTooLarge.result, 'too-large', 200);
  assert.equal(streamCancelled, 1, 'stream byte 10,485,761 is cancelled');
  assert.equal(JSON.stringify(streamedTooLarge.result).includes('bytes'), false,
    'stream oversize returns zero partial bytes/hash/fullText');
}

function hashBytes(bytes) {
  return 'sha256:' + createHash('sha256').update(bytes).digest('hex');
}

function pageContentResult(bytes, overrides = {}) {
  const buffer = Buffer.from(bytes);
  return Object.assign({
    kind: 'ok',
    status: 200,
    data: {
      bytesBase64: buffer.toString('base64'),
      exactByteLength: buffer.byteLength,
      byteHash: hashBytes(buffer)
    }
  }, overrides);
}

function frozenNullRecord(value, label) {
  assert.ok(value, `${label} exists`);
  assert.equal(Object.getPrototypeOf(value), null, `${label} has null prototype`);
  assert.equal(Object.isFrozen(value), true, `${label} is frozen`);
}

function createHarness(transportModule, responder, caps = {}) {
  const calls = [];
  const leakSpies = {
    storage: 0,
    logger: 0,
    diagnostics: 0,
    projections: 0,
    contentMessaging: 0
  };
  const transport = transportModule.createTransport({
    executeBoundPageRead: async function executeBoundPageRead(request, tabId) {
      calls.push({ request, tabId });
      return responder(request, calls.length - 1);
    },
    crypto: webcrypto,
    context: { tabId: 77, origin: DRIVE_ORIGIN },
    caps: Object.assign({
      maxItemsPerPage: 4,
      maxPagesPerChain: 3,
      maxTokenLength: 64,
      maxStringLength: 512
    }, caps)
  });
  return { transport, calls, leakSpies };
}

async function testBackgroundTransport(transportModule) {
  assert.strictEqual(globalThis.FsbSkopeoDriveCorpusTransport, transportModule,
    'classic global and CommonJS transport share one contract');
  assert.equal(Object.isFrozen(transportModule), true, 'transport factory is frozen');
  assert.deepEqual(Object.keys(transportModule).sort(), [
    'MAX_EXACT_BYTES',
    'PRIVATE_NAMESPACE',
    'RESULT_KINDS',
    'VERSION',
    'createTransport'
  ], 'transport factory surface is exact');
  assert.equal(transportModule.MAX_EXACT_BYTES, MAX_EXACT_BYTES);
  assert.equal(transportModule.PRIVATE_NAMESPACE, PRIVATE_NAMESPACE);
  assert.deepEqual(transportModule.RESULT_KINDS, RESULT_KINDS);

  const invalidOriginCalls = [];
  assert.equal(transportModule.createTransport({
    executeBoundPageRead() { invalidOriginCalls.push(true); },
    crypto: webcrypto,
    context: { tabId: 77, origin: 'https://evil.example' },
    caps: { maxItemsPerPage: 4, maxPagesPerChain: 3, maxTokenLength: 64, maxStringLength: 512 }
  }), null, 'wrong origin cannot create a transport');
  assert.equal(invalidOriginCalls.length, 0);

  const mutableContext = { tabId: 77, origin: DRIVE_ORIGIN };
  const driftCalls = [];
  const driftGuarded = transportModule.createTransport({
    executeBoundPageRead() { driftCalls.push(true); },
    crypto: webcrypto,
    context: mutableContext,
    caps: { maxItemsPerPage: 4, maxPagesPerChain: 3, maxTokenLength: 64, maxStringLength: 512 }
  });
  mutableContext.origin = DOCS_ORIGIN;
  const drifted = await driftGuarded.about();
  assert.equal(drifted.kind, 'unsupported', 'live context drift fails closed');
  assert.equal(driftCalls.length, 0, 'live context drift makes zero page calls');

  const queue = [];
  const harness = createHarness(transportModule, async function responder(request) {
    assert.equal(request.namespace, PRIVATE_NAMESPACE);
    assert.deepEqual(ownKeys(request), ['action', 'args', 'namespace', 'origin']);
    if (!queue.length) throw new Error('unplanned private request: ' + request.action);
    const next = queue.shift();
    if (typeof next === 'function') return next(request);
    return next;
  });
  const transport = harness.transport;
  assert.ok(transport, 'valid exact-origin transport is created');
  assert.equal(Object.isFrozen(transport), true);
  assert.deepEqual(Object.keys(transport).sort(), [
    'about',
    'getFile',
    'getStartPageToken',
    'listChanges',
    'listChildren',
    'readContent'
  ], 'transport exposes exactly six fixed operations');

  queue.push({ kind: 'ok', status: 200, data: {
    permissionId: 'permission-123',
    emailAddress: 'must-not-cross@example.test',
    displayName: 'must-not-cross'
  } });
  const about = await transport.about();
  frozenNullRecord(about, 'about result');
  frozenNullRecord(about.value, 'about value');
  assert.deepEqual(plain(about), {
    kind: 'ok', status: 200, value: { permissionId: 'permission-123' }
  }, 'wrapper accepts only permissionId from about');

  queue.push({ kind: 'ok', status: 200, data: makeFile() });
  const file = await transport.getFile({ fileId: 'file-1' });
  assert.equal(file.kind, 'ok');
  frozenNullRecord(file.value, 'file value');
  assert.deepEqual(plain(file.value.parents), ['folder-1']);
  assert.equal(file.value.driveId, 'drive-1');
  assert.equal(file.value.capabilities.canDownload, true);
  assert.ok(file.value.resourceKey, 'trusted metadata yields an opaque resourceKey handle');
  assert.equal(JSON.stringify(file).includes('rk-file-1'), false,
    'raw resourceKey cannot escape trusted transport metadata');
  assertNoRawProviderLeak(file, 'wrapped file');

  queue.push({ kind: 'ok', status: 200, data: makeFile({ resourceKey: null }) });
  const keyedFile = await transport.getFile({
    fileId: 'file-1', resourceKey: file.value.resourceKey
  });
  assert.equal(keyedFile.kind, 'ok');
  const keyedRequest = harness.calls.at(-1).request;
  assert.equal(keyedRequest.args.resourceKey, 'rk-file-1',
    'opaque exact-source handle unwraps only inside the private page request');

  const callsBeforeStale = harness.calls.length;
  const stale = await transport.getFile({
    fileId: 'file-1', resourceKey: file.value.resourceKey
  });
  assert.equal(stale.kind, 'unsupported', 'superseded trusted resourceKey is stale');
  assert.equal(harness.calls.length, callsBeforeStale, 'stale resourceKey makes zero page calls');

  queue.push({ kind: 'ok', status: 200, data: makeFile({
    id: 'file-2', resourceKey: 'rk-file-2'
  }) });
  const secondFile = await transport.getFile({ fileId: 'file-2' });
  assert.equal(secondFile.kind, 'ok');
  const callsBeforeCrossSource = harness.calls.length;
  const crossSource = await transport.getFile({
    fileId: 'file-1', resourceKey: secondFile.value.resourceKey
  });
  assert.equal(crossSource.kind, 'unsupported', 'trusted resourceKey is exact-source scoped');
  assert.equal(harness.calls.length, callsBeforeCrossSource,
    'cross-source resourceKey makes zero page calls');

  const callsBeforeForged = harness.calls.length;
  for (const forged of [
    'rk-file-1',
    { sourceFileId: 'file-1' },
    Object.freeze(Object.assign(Object.create(null), { sourceFileId: 'file-1' }))
  ]) {
    const rejected = await transport.getFile({ fileId: 'file-1', resourceKey: forged });
    assert.equal(rejected.kind, 'unsupported', 'unbranded/content resourceKey fails closed');
  }
  assert.equal(harness.calls.length, callsBeforeForged, 'forged resourceKey makes zero page calls');

  queue.push({ kind: 'ok', status: 200, data: makeFile({
    id: 'parent-1', resourceKey: 'rk-parent-1'
  }) });
  const keyedParent = await transport.getFile({ fileId: 'parent-1' });
  assert.equal(keyedParent.kind, 'ok');

  queue.push({ kind: 'ok', status: 200, data: {
    files: [makeFile({ id: 'child-1', resourceKey: 'rk-child-1' })],
    nextPageToken: 'list-page-2',
    incompleteSearch: false
  } });
  const listOne = await transport.listChildren({
    parentFileId: 'parent-1',
    driveId: 'drive-1',
    resourceKey: keyedParent.value.resourceKey
  });
  assert.equal(listOne.kind, 'ok');
  assert.equal(harness.calls.at(-1).request.args.resourceKey, 'rk-parent-1',
    'opaque exact-parent key unwraps only inside the child-list request');
  assert.equal(listOne.value.files[0].parents[0], 'folder-1');
  assert.ok(listOne.value.nextPageToken, 'raw pagination token becomes an opaque one-shot handle');
  assert.equal(JSON.stringify(listOne).includes('list-page-2'), false);

  queue.push({ kind: 'ok', status: 200, data: makeFile({
    id: 'child-1', resourceKey: 'rk-child-1'
  }) });
  const discoveredChild = await transport.getFile({ fileId: 'child-1' });
  assert.equal(discoveredChild.kind, 'ok');
  assert.equal(harness.calls.at(-1).request.args.resourceKey, 'rk-child-1',
    'metadata re-fetch automatically carries the trusted key discovered by the verified listing');

  queue.push({ kind: 'ok', status: 200, data: {
    files: [], nextPageToken: null, incompleteSearch: false
  } });
  const listTwo = await transport.listChildren({
    parentFileId: 'parent-1',
    driveId: 'drive-1',
    resourceKey: keyedParent.value.resourceKey,
    pageToken: listOne.value.nextPageToken
  });
  assert.equal(listTwo.kind, 'ok');
  assert.equal(harness.calls.at(-1).request.args.pageToken, 'list-page-2');

  const callsBeforeReplay = harness.calls.length;
  const replay = await transport.listChildren({
    parentFileId: 'parent-1',
    driveId: 'drive-1',
    resourceKey: keyedParent.value.resourceKey,
    pageToken: listOne.value.nextPageToken
  });
  assert.equal(replay.kind, 'incomplete', 'repeated page token fails closed');
  const foreign = await transport.listChildren({
    parentFileId: 'other-parent', driveId: 'drive-1', pageToken: listOne.value.nextPageToken
  });
  assert.equal(foreign.kind, 'incomplete', 'foreign/cross-parent token fails closed');
  assert.equal(harness.calls.length, callsBeforeReplay);

  const callsBeforeBadParentKey = harness.calls.length;
  for (const [parentFileId, resourceKey] of [
    ['other-parent', keyedParent.value.resourceKey],
    ['parent-1', 'rk-parent-1'],
    ['parent-1', { sourceFileId: 'parent-1' }]
  ]) {
    const rejected = await transport.listChildren({ parentFileId, resourceKey });
    assert.equal(rejected.kind, 'unsupported',
      'forged or cross-parent child-list resource key fails closed');
  }
  assert.equal(harness.calls.length, callsBeforeBadParentKey,
    'forged or cross-parent child-list keys make zero page calls');

  queue.push({ kind: 'ok', status: 200, data: { startPageToken: 'changes-start-1' } });
  const start = await transport.getStartPageToken({ driveId: 'drive-1' });
  assert.equal(start.kind, 'ok');
  assert.ok(start.value.startPageToken);
  assert.equal(JSON.stringify(start).includes('changes-start-1'), false);

  queue.push({ kind: 'ok', status: 200, data: {
    changes: [{ fileId: 'removed-1', removed: true, time: null, file: null }],
    nextPageToken: null,
    newStartPageToken: 'changes-start-2'
  } });
  const changePage = await transport.listChanges({
    pageToken: start.value.startPageToken, driveId: 'drive-1'
  });
  assert.equal(changePage.kind, 'ok');
  assert.equal(changePage.value.changes[0].removed, true);
  assert.equal(changePage.value.changes[0].file, null,
    'removed hint does not synthesize file membership');
  assert.ok(changePage.value.newStartPageToken);
  assert.equal(JSON.stringify(changePage).includes('changes-start-2'), false);

  const callsBeforeBadArgs = harness.calls.length;
  for (const [method, args] of [
    ['getFile', { fileId: 'file-1', url: 'https://example.test', method: 'DELETE' }],
    ['listChildren', { parentFileId: 'parent-1', q: 'fullText contains secret' }],
    ['getStartPageToken', { driveId: 'drive-1', fields: '*' }],
    ['listChanges', { pageToken: 'raw-page-token', driveId: 'drive-1' }]
  ]) {
    const rejected = await transport[method](args);
    assert.ok(['unsupported', 'incomplete'].includes(rejected.kind));
  }
  assert.equal(harness.calls.length, callsBeforeBadArgs,
    'arbitrary URL/method/query/fields/raw-token inputs make zero page calls');

  for (const kind of RESULT_KINDS.filter((value) => value !== 'ok')) {
    queue.push({ kind, status: kind === 'not-found' ? 404 : (kind === 'denied' ? 403 : null) });
    const normalized = await transport.getFile({ fileId: 'file-1' });
    assert.equal(normalized.kind, kind, `${kind} survives wrapper normalization`);
  }
  queue.push({ success: true, status: 200, body: '<html>provider-secret-message</html>' });
  const unknown = await transport.getFile({ fileId: 'file-1' });
  assert.equal(unknown.kind, 'unsupported', 'unknown authenticated response variant fails closed');
  assertNoRawProviderLeak(unknown, 'unknown wrapper result');

  queue.push({ kind: 'ok', status: 200, data: {
    files: [0, 1, 2, 3, 4].map((index) => makeFile({ id: `over-${index}` })),
    nextPageToken: null,
    incompleteSearch: false
  } });
  const overItems = await transport.listChildren({ parentFileId: 'parent-1' });
  assert.equal(overItems.kind, 'incomplete', 'item/page cap rejects rather than truncates');

  const contentBytes = Buffer.from('operation-local exact text\n', 'utf8');
  queue.push(pageContentResult(contentBytes));
  let sinkPayload = null;
  let sinkCalls = 0;
  const sink = async function operationSink(payload) {
    sinkCalls += 1;
    sinkPayload = payload;
    await Promise.resolve();
  };
  const content = await transport.readContent({
    fileId: 'file-1', mimeType: TEXT_MIME
  }, sink);
  assert.equal(content.kind, 'ok');
  assert.deepEqual(plain(content.value), {
    byteHash: hashBytes(contentBytes),
    exactByteLength: contentBytes.byteLength
  }, 'normal metadata result returns no text');
  assert.equal(Object.prototype.hasOwnProperty.call(content.value, 'text'), false);
  assert.equal(sinkCalls, 1);
  frozenNullRecord(sinkPayload, 'operation sink payload');
  assert.equal(sinkPayload.text, contentBytes.toString('utf8'));
  assert.equal(sinkPayload.byteHash, hashBytes(contentBytes));

  const callsBeforeSinkReplay = harness.calls.length;
  const reusedSink = await transport.readContent({
    fileId: 'file-1', mimeType: TEXT_MIME
  }, sink);
  assert.equal(reusedSink.kind, 'unsupported', 'sink is one-shot');
  const missingSink = await transport.readContent({ fileId: 'file-1', mimeType: TEXT_MIME });
  assert.equal(missingSink.kind, 'unsupported', 'missing sink is rejected');
  assert.equal(harness.calls.length, callsBeforeSinkReplay);

  for (const mimeType of [
    'application/pdf',
    'application/vnd.google-apps.spreadsheet',
    'application/vnd.google-apps.presentation',
    'application/octet-stream',
    'text/html',
    'text/markdown',
    'text/csv',
    'text/*',
    'text/plain; charset=utf-8'
  ]) {
    const unsupportedSink = function unsupportedSink() {};
    const before = harness.calls.length;
    const rejected = await transport.readContent({ fileId: 'file-1', mimeType }, unsupportedSink);
    assert.equal(rejected.kind, 'unsupported');
    assert.equal(harness.calls.length, before);
  }

  const exactBytes = Buffer.alloc(MAX_EXACT_BYTES, 0x61);
  queue.push(pageContentResult(exactBytes));
  let exactPayload = null;
  const exact = await transport.readContent({ fileId: 'exact-limit', mimeType: TEXT_MIME }, (payload) => {
    exactPayload = payload;
  });
  assert.equal(exact.kind, 'ok', 'exact 10,485,760-byte content succeeds');
  assert.equal(exact.value.exactByteLength, MAX_EXACT_BYTES);
  assert.equal(exactPayload.text.length, MAX_EXACT_BYTES);

  let oversizedSinkCalls = 0;
  queue.push({
    kind: 'ok',
    status: 200,
    data: {
      bytesBase64: Buffer.alloc(MAX_EXACT_BYTES + 1, 0x61).toString('base64'),
      exactByteLength: MAX_EXACT_BYTES + 1,
      byteHash: hashBytes(Buffer.alloc(MAX_EXACT_BYTES + 1, 0x61))
    }
  });
  const oversized = await transport.readContent({ fileId: 'too-large', mimeType: TEXT_MIME }, () => {
    oversizedSinkCalls += 1;
  });
  assert.equal(oversized.kind, 'too-large', 'byte 10,485,761 is rejected without truncation');
  assert.equal(oversizedSinkCalls, 0);
  assert.equal(JSON.stringify(oversized).includes('byteHash'), false,
    'over-limit result has zero partial hash/text');

  queue.push(pageContentResult(Buffer.from('hash mismatch'), {
    data: {
      bytesBase64: Buffer.from('hash mismatch').toString('base64'),
      exactByteLength: 13,
      byteHash: 'sha256:' + '0'.repeat(64)
    }
  }));
  let mismatchSinkCalls = 0;
  const mismatch = await transport.readContent({ fileId: 'hash-mismatch', mimeType: TEXT_MIME }, () => {
    mismatchSinkCalls += 1;
  });
  assert.equal(mismatch.kind, 'malformed', 'wrapper recomputes SHA-256 and rejects mismatch');
  assert.equal(mismatchSinkCalls, 0);

  queue.push(pageContentResult(Buffer.from([0xc3, 0x28])));
  let malformedSinkCalls = 0;
  const malformedUtf8 = await transport.readContent({ fileId: 'malformed-utf8', mimeType: TEXT_MIME }, () => {
    malformedSinkCalls += 1;
  });
  assert.equal(malformedUtf8.kind, 'malformed', 'malformed UTF-8 is rejected');
  assert.equal(malformedSinkCalls, 0);

  queue.push({ kind: 'too-large', status: 200, byteHash: 'sha256:' + 'a'.repeat(64), fullText: 'leak' });
  let pageTooLargeSinkCalls = 0;
  const pageTooLarge = await transport.readContent({ fileId: 'page-too-large', mimeType: DOC_MIME }, () => {
    pageTooLargeSinkCalls += 1;
  });
  assert.equal(pageTooLarge.kind, 'too-large');
  assert.equal(pageTooLargeSinkCalls, 0);
  assert.equal(JSON.stringify(pageTooLarge).includes('fullText'), false);

  const propagatedSignals = [];
  const signalTransport = transportModule.createTransport({
    executeBoundPageRead: async function(_request, _tabId, operationSignal) {
      propagatedSignals.push(operationSignal);
      return { kind: 'ok', status: 200, data: { permissionId: 'permission-signal' } };
    },
    crypto: webcrypto,
    context: { tabId: 77, origin: DRIVE_ORIGIN },
    caps: { maxItemsPerPage: 4, maxPagesPerChain: 3, maxTokenLength: 64, maxStringLength: 512 }
  });
  const cancelledController = new AbortController();
  cancelledController.abort('operation-cancelled');
  const cancelledAbout = await signalTransport.about(cancelledController.signal);
  assert.equal(cancelledAbout.kind, 'transient',
    'an already-aborted operation makes no private page read');
  assert.equal(propagatedSignals.length, 0);
  const liveController = new AbortController();
  const liveAbout = await signalTransport.about(liveController.signal);
  assert.equal(liveAbout.kind, 'ok');
  assert.strictEqual(propagatedSignals[0], liveController.signal,
    'the exact operation AbortSignal reaches the bound page-read executor');
  assert.equal((await signalTransport.getFile(
    { fileId: 'file-1' }, { aborted: false }
  )).kind, 'unsupported', 'signal-shaped forgeries fail closed');

  const source = fs.readFileSync(TRANSPORT_PATH, 'utf8');
  assert.equal(/chrome\.storage|sendMessage|diagnostic|logger/.test(source), false,
    'transport contains no storage, content-message, diagnostic, or logger sink');
  assert.match(source, /FsbSkopeoDriveCorpusTransport/);
  assert.match(source, /executeBoundPageRead/);
  assert.match(source, /readContent/);
  assert.match(source, /byteHash/);
  assert.match(source, /permissionId/);
  assert.match(source, /10485760/);
  assert.match(source, /application\/vnd\.google-apps\.document/);
  assert.match(source, /text\/plain/);
  assert.deepEqual(harness.leakSpies, {
    storage: 0,
    logger: 0,
    diagnostics: 0,
    projections: 0,
    contentMessaging: 0
  }, 'storage/logger/diagnostic/projection/content messaging spies remain untouched');
}

async function main() {
  delete globalThis.FsbSkopeoDriveCorpusTransport;
  const capabilityFetch = require(CAPABILITY_FETCH_PATH);
  assert.ok(capabilityFetch && typeof capabilityFetch.capabilityPageReadInPage === 'function');
  const pageSource = capabilityFetch.capabilityPageReadInPage.toString();

  // Controlled RED: this assertion is deliberately first. Before Task 2 it names
  // the absent private action without requiring the Task 3 transport module.
  assert.match(pageSource, /skopeo-drive-corpus/,
    'capabilityPageReadInPage is missing the private skopeo-drive-corpus namespace');
  assert.match(pageSource, /permissionId/);
  assert.match(pageSource, /supportsAllDrives/);
  assert.match(pageSource, /includeItemsFromAllDrives/);
  assert.match(pageSource, /newStartPageToken/);
  await testPrivatePageNamespace(capabilityFetch.capabilityPageReadInPage);

  for (const catalogPath of PUBLIC_CATALOG_PATHS) {
    const catalogSource = fs.readFileSync(catalogPath, 'utf8');
    assert.equal(catalogSource.includes(PRIVATE_NAMESPACE), false,
      `${path.relative(ROOT, catalogPath)} does not publish the private namespace`);
  }

  // Task 2 deliberately leaves the background wrapper absent. Its complete
  // contract already lives above; Task 3 activates it by creating the module.
  if (!fs.existsSync(TRANSPORT_PATH)) {
    console.log('skopeo Drive corpus private page contract: PASS (background transport pending Task 3)');
    return;
  }

  const transportModule = require(TRANSPORT_PATH);
  await testBackgroundTransport(transportModule);
  console.log('skopeo Drive corpus transport contract: PASS');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
