(function(global) {
  'use strict';

  var VERSION = 'skopeo-drive-corpus-transport/v1';
  var PRIVATE_NAMESPACE = 'skopeo-drive-corpus';
  var MAX_EXACT_BYTES = 10485760;
  var DOC_MIME = 'application/vnd.google-apps.document';
  var TEXT_MIME = 'text/plain';
  var ALLOWED_ORIGINS = Object.freeze({
    'https://drive.google.com': true,
    'https://docs.google.com': true
  });
  var RESULT_KINDS = Object.freeze([
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
  var RESULT_KIND_SET = makeSet(RESULT_KINDS);
  var FILE_FIELDS = [
    'id',
    'name',
    'mimeType',
    'parents',
    'trashed',
    'driveId',
    'resourceKey',
    'capabilities',
    'version',
    'headRevisionId',
    'md5Checksum',
    'sha1Checksum',
    'sha256Checksum',
    'size',
    'modifiedTime',
    'shortcutDetails'
  ];

  function makeSet(values) {
    var output = Object.create(null);
    for (var index = 0; index < values.length; index += 1) output[values[index]] = true;
    return Object.freeze(output);
  }

  function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function isPlainRecord(value) {
    try {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      var prototype = Object.getPrototypeOf(value);
      return prototype === Object.prototype || prototype === null;
    } catch (_error) {
      return false;
    }
  }

  function exactDataValues(value, required, optional) {
    if (!isPlainRecord(value)) return null;
    try {
      var keys = Reflect.ownKeys(value);
      if (keys.some(function(key) { return typeof key !== 'string'; })) return null;
      var allowed = required.concat(optional || []);
      if (keys.length < required.length || keys.length > allowed.length) return null;
      for (var requiredIndex = 0; requiredIndex < required.length; requiredIndex += 1) {
        if (keys.indexOf(required[requiredIndex]) === -1) return null;
      }
      var output = Object.create(null);
      for (var index = 0; index < keys.length; index += 1) {
        var key = keys[index];
        if (allowed.indexOf(key) === -1) return null;
        var descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true) return null;
        output[key] = descriptor.value;
      }
      return output;
    } catch (_error) {
      return null;
    }
  }

  function selectedDataValues(value, keys) {
    if (!isPlainRecord(value)) return null;
    var output = Object.create(null);
    try {
      for (var index = 0; index < keys.length; index += 1) {
        var descriptor = Object.getOwnPropertyDescriptor(value, keys[index]);
        if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true) return null;
        output[keys[index]] = descriptor.value;
      }
      return output;
    } catch (_error) {
      return null;
    }
  }

  function selectedDataValue(value, key) {
    if (!isPlainRecord(value)) return null;
    try {
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true) return null;
      return { present: true, value: descriptor.value };
    } catch (_error) {
      return null;
    }
  }

  function denseArrayValues(value, maximum) {
    if (!Array.isArray(value) || value.length > maximum) return null;
    try {
      var keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || keys.some(function(key) {
        return typeof key !== 'string' ||
          (key !== 'length' && !/^(?:0|[1-9][0-9]*)$/.test(key));
      })) {
        return null;
      }
      var output = [];
      for (var index = 0; index < value.length; index += 1) {
        var descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true) return null;
        output.push(descriptor.value);
      }
      return output;
    } catch (_error) {
      return null;
    }
  }

  function frozenRecord(entries) {
    var record = Object.create(null);
    for (var index = 0; index < entries.length; index += 1) {
      record[entries[index][0]] = entries[index][1];
    }
    return Object.freeze(record);
  }

  function frozenArray(values) {
    return Object.freeze(values.slice());
  }

  function failure(kind, status) {
    return frozenRecord([
      ['kind', RESULT_KIND_SET[kind] && kind !== 'ok' ? kind : 'unsupported'],
      ['status', validStatus(status) ? status : null]
    ]);
  }

  function success(status, value) {
    return frozenRecord([
      ['kind', 'ok'],
      ['status', status],
      ['value', value]
    ]);
  }

  function validStatus(value) {
    return value === null ||
      (Number.isSafeInteger(value) && value >= 100 && value <= 599);
  }

  function normalizeSignal(value) {
    if (value === undefined) return null;
    return value && typeof value === 'object' && typeof value.aborted === 'boolean' &&
      typeof value.addEventListener === 'function' && typeof value.removeEventListener === 'function'
      ? value
      : false;
  }

  function validId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
      /^[A-Za-z0-9_-]+$/.test(value) && value !== '__proto__' &&
      value !== 'prototype' && value !== 'constructor';
  }

  function validToken(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      /^[A-Za-z0-9._~+/=-]+$/.test(value);
  }

  function validBoundedString(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]/.test(value);
  }

  function validMime(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 127 &&
      /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(value);
  }

  function validTime(value) {
    if (typeof value !== 'string' || value.length > 64 ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)) {
      return false;
    }
    return Number.isFinite(Date.parse(value));
  }

  function validHex(value, length) {
    return value === null ||
      (typeof value === 'string' && new RegExp('^[0-9a-fA-F]{' + length + '}$').test(value));
  }

  function pageEnvelope(raw) {
    var kindField = selectedDataValue(raw, 'kind');
    var statusField = selectedDataValue(raw, 'status');
    if (!kindField || !statusField || typeof kindField.value !== 'string' ||
        !RESULT_KIND_SET[kindField.value] || !validStatus(statusField.value)) {
      return { ok: false, result: failure('unsupported', null) };
    }
    if (kindField.value !== 'ok') {
      return { ok: false, result: failure(kindField.value, statusField.value) };
    }
    if (statusField.value !== 200) {
      return { ok: false, result: failure('unsupported', statusField.value) };
    }
    var dataField = selectedDataValue(raw, 'data');
    if (!dataField || !isPlainRecord(dataField.value)) {
      return { ok: false, result: failure('malformed', 200) };
    }
    return { ok: true, status: 200, data: dataField.value };
  }

  function parseSize(value) {
    if (value === null) return null;
    if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,31})$/.test(value)) return false;
    var parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : false;
  }

  function parseFile(raw, caps) {
    var fields = selectedDataValues(raw, FILE_FIELDS);
    if (!fields || !validId(fields.id) || !validBoundedString(fields.name, caps.maxStringLength) ||
        !validMime(fields.mimeType) || typeof fields.trashed !== 'boolean' ||
        !(fields.driveId === null || validId(fields.driveId)) ||
        !(fields.resourceKey === null || validToken(fields.resourceKey, caps.maxTokenLength)) ||
        !(fields.version === null || (typeof fields.version === 'string' && /^\d{1,32}$/.test(fields.version))) ||
        !(fields.headRevisionId === null || validToken(fields.headRevisionId, caps.maxTokenLength)) ||
        !validHex(fields.md5Checksum, 32) || !validHex(fields.sha1Checksum, 40) ||
        !validHex(fields.sha256Checksum, 64) || !validTime(fields.modifiedTime)) {
      return null;
    }
    var size = parseSize(fields.size);
    var parents = denseArrayValues(fields.parents, 32);
    var capabilities = selectedDataValues(fields.capabilities, ['canDownload', 'canListChildren']);
    if (size === false || !parents || parents.some(function(parentId) { return !validId(parentId); }) ||
        new Set(parents).size !== parents.length || !capabilities ||
        typeof capabilities.canDownload !== 'boolean' ||
        typeof capabilities.canListChildren !== 'boolean') {
      return null;
    }
    var shortcut = null;
    if (fields.shortcutDetails !== null) {
      var shortcutFields = selectedDataValues(fields.shortcutDetails, ['targetId', 'targetMimeType']);
      if (!shortcutFields || !validId(shortcutFields.targetId) ||
          !validMime(shortcutFields.targetMimeType)) {
        return null;
      }
      shortcut = {
        targetId: shortcutFields.targetId,
        targetMimeType: shortcutFields.targetMimeType
      };
    }
    return {
      id: fields.id,
      name: fields.name,
      mimeType: fields.mimeType,
      parents: parents,
      trashed: fields.trashed,
      driveId: fields.driveId,
      rawResourceKey: fields.resourceKey,
      capabilities: {
        canDownload: capabilities.canDownload,
        canListChildren: capabilities.canListChildren
      },
      version: fields.version,
      headRevisionId: fields.headRevisionId,
      md5Checksum: fields.md5Checksum === null ? null : fields.md5Checksum.toLowerCase(),
      sha1Checksum: fields.sha1Checksum === null ? null : fields.sha1Checksum.toLowerCase(),
      sha256Checksum: fields.sha256Checksum === null ? null : fields.sha256Checksum.toLowerCase(),
      size: size,
      modifiedTime: fields.modifiedTime,
      shortcutDetails: shortcut
    };
  }

  function createTransport(options) {
    var optionFields = exactDataValues(options, [
      'executeBoundPageRead',
      'crypto',
      'context',
      'caps'
    ], []);
    if (!optionFields || typeof optionFields.executeBoundPageRead !== 'function') return null;
    var contextFields = exactDataValues(optionFields.context, ['tabId', 'origin'], []);
    var capFields = exactDataValues(optionFields.caps, [
      'maxItemsPerPage',
      'maxPagesPerChain',
      'maxTokenLength',
      'maxStringLength'
    ], []);
    var cryptoObject = optionFields.crypto;
    if (!contextFields || !Number.isSafeInteger(contextFields.tabId) || contextFields.tabId < 0 ||
        !ALLOWED_ORIGINS[contextFields.origin] || !capFields ||
        !Number.isSafeInteger(capFields.maxItemsPerPage) || capFields.maxItemsPerPage < 1 ||
        capFields.maxItemsPerPage > 1000 ||
        !Number.isSafeInteger(capFields.maxPagesPerChain) || capFields.maxPagesPerChain < 1 ||
        capFields.maxPagesPerChain > 100 ||
        !Number.isSafeInteger(capFields.maxTokenLength) || capFields.maxTokenLength < 16 ||
        capFields.maxTokenLength > 4096 ||
        !Number.isSafeInteger(capFields.maxStringLength) || capFields.maxStringLength < 64 ||
        capFields.maxStringLength > 4096 || !cryptoObject || !cryptoObject.subtle ||
        typeof cryptoObject.subtle.digest !== 'function') {
      return null;
    }

    var executeBoundPageRead = optionFields.executeBoundPageRead;
    var contextObject = optionFields.context;
    var initialTabId = contextFields.tabId;
    var initialOrigin = contextFields.origin;
    var caps = Object.freeze({
      maxItemsPerPage: capFields.maxItemsPerPage,
      maxPagesPerChain: capFields.maxPagesPerChain,
      maxTokenLength: capFields.maxTokenLength,
      maxStringLength: capFields.maxStringLength
    });
    var resourceKeyRecords = new WeakMap();
    var currentResourceKeys = new Map();
    var pageTokenRecords = new WeakMap();
    var usedSinks = new WeakSet();

    function liveContext() {
      var current = exactDataValues(contextObject, ['tabId', 'origin'], []);
      return current && current.tabId === initialTabId && current.origin === initialOrigin &&
        ALLOWED_ORIGINS[current.origin]
        ? current
        : null;
    }

    async function issue(action, args, operationSignal) {
      var current = liveContext();
      if (!current || operationSignal === false) return failure('unsupported', null);
      if (operationSignal && operationSignal.aborted) return failure('transient', null);
      var request = frozenRecord([
        ['origin', current.origin],
        ['namespace', PRIVATE_NAMESPACE],
        ['action', action],
        ['args', args]
      ]);
      try {
        var result = await executeBoundPageRead(request, current.tabId, operationSignal);
        return operationSignal && operationSignal.aborted ? failure('transient', null) : result;
      } catch (_error) {
        return failure('transient', null);
      }
    }

    function mintResourceKey(sourceFileId, rawResourceKey) {
      var previous = currentResourceKeys.get(sourceFileId);
      if (previous) resourceKeyRecords.delete(previous);
      currentResourceKeys.delete(sourceFileId);
      if (rawResourceKey === null) return null;
      var handle = frozenRecord([['sourceFileId', sourceFileId]]);
      resourceKeyRecords.set(handle, {
        sourceFileId: sourceFileId,
        rawResourceKey: rawResourceKey
      });
      currentResourceKeys.set(sourceFileId, handle);
      return handle;
    }

    function unwrapResourceKey(handle, sourceFileId) {
      if (!handle || typeof handle !== 'object') return null;
      var record = resourceKeyRecords.get(handle);
      return record && record.sourceFileId === sourceFileId &&
        currentResourceKeys.get(sourceFileId) === handle
        ? record.rawResourceKey
        : null;
    }

    function publishFile(parsed) {
      var resourceKey = mintResourceKey(parsed.id, parsed.rawResourceKey);
      var shortcut = parsed.shortcutDetails
        ? frozenRecord([
            ['targetId', parsed.shortcutDetails.targetId],
            ['targetMimeType', parsed.shortcutDetails.targetMimeType]
          ])
        : null;
      return frozenRecord([
        ['id', parsed.id],
        ['name', parsed.name],
        ['mimeType', parsed.mimeType],
        ['parents', frozenArray(parsed.parents)],
        ['trashed', parsed.trashed],
        ['driveId', parsed.driveId],
        ['resourceKey', resourceKey],
        ['capabilities', frozenRecord([
          ['canDownload', parsed.capabilities.canDownload],
          ['canListChildren', parsed.capabilities.canListChildren]
        ])],
        ['version', parsed.version],
        ['headRevisionId', parsed.headRevisionId],
        ['md5Checksum', parsed.md5Checksum],
        ['sha1Checksum', parsed.sha1Checksum],
        ['sha256Checksum', parsed.sha256Checksum],
        ['size', parsed.size],
        ['modifiedTime', parsed.modifiedTime],
        ['shortcutDetails', shortcut]
      ]);
    }

    function tokenScope(operation, first, second) {
      return operation + '\u0000' + String(first || '') + '\u0000' + String(second || '');
    }

    function mintPageToken(rawToken, operation, scope, pageNumber) {
      if (rawToken === null) return null;
      if (!validToken(rawToken, caps.maxTokenLength) || !Number.isSafeInteger(pageNumber) ||
          pageNumber < 1 || pageNumber > caps.maxPagesPerChain) {
        return false;
      }
      var handle = frozenRecord([['type', 'page-token']]);
      pageTokenRecords.set(handle, {
        rawToken: rawToken,
        operation: operation,
        scope: scope,
        pageNumber: pageNumber,
        used: false
      });
      return handle;
    }

    function consumePageToken(handle, operation, scope) {
      if (!handle || typeof handle !== 'object') return null;
      var record = pageTokenRecords.get(handle);
      if (!record || record.used || record.operation !== operation || record.scope !== scope ||
          record.pageNumber > caps.maxPagesPerChain) {
        return null;
      }
      record.used = true;
      var consumed = {
        rawToken: record.rawToken,
        pageNumber: record.pageNumber
      };
      record.rawToken = null;
      return consumed;
    }

    function parseTokenField(data, key) {
      var field = selectedDataValue(data, key);
      if (!field || !(field.value === null || validToken(field.value, caps.maxTokenLength))) return false;
      return field.value;
    }

    async function about(signalValue) {
      if (arguments.length > 1) return failure('unsupported', null);
      var operationSignal = normalizeSignal(signalValue);
      if (operationSignal === false) return failure('unsupported', null);
      var envelope = pageEnvelope(await issue('about', frozenRecord([]), operationSignal));
      if (!envelope.ok) return envelope.result;
      var permissionField = selectedDataValue(envelope.data, 'permissionId');
      if (!permissionField || !validId(permissionField.value)) return failure('malformed', 200);
      return success(200, frozenRecord([['permissionId', permissionField.value]]));
    }

    async function getFile(input, signalValue) {
      if (arguments.length < 1 || arguments.length > 2) return failure('unsupported', null);
      var operationSignal = normalizeSignal(signalValue);
      var fields = exactDataValues(input, ['fileId'], ['resourceKey']);
      if (operationSignal === false || !fields || !validId(fields.fileId)) {
        return failure('unsupported', null);
      }
      var rawResourceKey;
      if (own(fields, 'resourceKey')) {
        rawResourceKey = unwrapResourceKey(fields.resourceKey, fields.fileId);
        if (!rawResourceKey) return failure('unsupported', null);
      } else {
        var currentResourceKey = currentResourceKeys.get(fields.fileId);
        if (currentResourceKey) rawResourceKey = unwrapResourceKey(currentResourceKey, fields.fileId);
      }
      var argsEntries = [['fileId', fields.fileId]];
      if (rawResourceKey) argsEntries.push(['resourceKey', rawResourceKey]);
      var envelope = pageEnvelope(await issue('getFile', frozenRecord(argsEntries), operationSignal));
      if (!envelope.ok) return envelope.result;
      var parsed = parseFile(envelope.data, caps);
      if (!parsed || parsed.id !== fields.fileId) return failure('malformed', 200);
      return success(200, publishFile(parsed));
    }

    async function listChildren(input, signalValue) {
      if (arguments.length < 1 || arguments.length > 2) return failure('unsupported', null);
      var operationSignal = normalizeSignal(signalValue);
      var fields = exactDataValues(input, ['parentFileId'], [
        'pageToken', 'driveId', 'resourceKey'
      ]);
      if (operationSignal === false || !fields || !validId(fields.parentFileId) ||
          (own(fields, 'driveId') && !validId(fields.driveId))) {
        return failure('unsupported', null);
      }
      var driveId = own(fields, 'driveId') ? fields.driveId : null;
      var rawResourceKey = null;
      if (own(fields, 'resourceKey')) {
        rawResourceKey = unwrapResourceKey(fields.resourceKey, fields.parentFileId);
        if (!rawResourceKey) return failure('unsupported', null);
      }
      var scope = tokenScope(
        'listChildren', fields.parentFileId, String(driveId || '') + '\u0000' + String(rawResourceKey || '')
      );
      var rawPageToken = null;
      var pageNumber = 1;
      if (own(fields, 'pageToken')) {
        var consumed = consumePageToken(fields.pageToken, 'listChildren', scope);
        if (!consumed) return failure('incomplete', null);
        rawPageToken = consumed.rawToken;
        pageNumber = consumed.pageNumber;
      }
      var argsEntries = [['parentFileId', fields.parentFileId]];
      if (rawPageToken) argsEntries.push(['pageToken', rawPageToken]);
      if (driveId) argsEntries.push(['driveId', driveId]);
      if (rawResourceKey) argsEntries.push(['resourceKey', rawResourceKey]);
      var envelope = pageEnvelope(await issue(
        'listChildren', frozenRecord(argsEntries), operationSignal
      ));
      if (!envelope.ok) return envelope.result;
      var data = envelope.data;
      var fileField = selectedDataValue(data, 'files');
      var incompleteField = selectedDataValue(data, 'incompleteSearch');
      var nextRaw = parseTokenField(data, 'nextPageToken');
      if (!fileField || !incompleteField || typeof incompleteField.value !== 'boolean' ||
          incompleteField.value || nextRaw === false) {
        return failure(incompleteField && incompleteField.value === true ? 'incomplete' : 'malformed', 200);
      }
      var rawFiles = denseArrayValues(fileField.value, caps.maxItemsPerPage);
      if (!rawFiles) return failure('incomplete', 200);
      if (nextRaw !== null && pageNumber >= caps.maxPagesPerChain) return failure('incomplete', 200);
      var parsedFiles = [];
      var fileIds = new Set();
      for (var index = 0; index < rawFiles.length; index += 1) {
        var parsed = parseFile(rawFiles[index], caps);
        if (!parsed || fileIds.has(parsed.id)) return failure('malformed', 200);
        fileIds.add(parsed.id);
        parsedFiles.push(parsed);
      }
      var nextHandle = mintPageToken(nextRaw, 'listChildren', scope, pageNumber + 1);
      if (nextHandle === false) return failure('incomplete', 200);
      var files = parsedFiles.map(publishFile);
      return success(200, frozenRecord([
        ['files', frozenArray(files)],
        ['nextPageToken', nextHandle],
        ['incompleteSearch', false]
      ]));
    }

    async function getStartPageToken(input, signalValue) {
      if (arguments.length > 2) return failure('unsupported', null);
      var operationSignal = normalizeSignal(signalValue);
      var source = input === undefined ? {} : input;
      var fields = exactDataValues(source, [], ['driveId']);
      if (operationSignal === false || !fields ||
          (own(fields, 'driveId') && !validId(fields.driveId))) {
        return failure('unsupported', null);
      }
      var driveId = own(fields, 'driveId') ? fields.driveId : null;
      var args = driveId ? frozenRecord([['driveId', driveId]]) : frozenRecord([]);
      var envelope = pageEnvelope(await issue('getStartPageToken', args, operationSignal));
      if (!envelope.ok) return envelope.result;
      var rawToken = parseTokenField(envelope.data, 'startPageToken');
      if (rawToken === false || rawToken === null) return failure('malformed', 200);
      var handle = mintPageToken(
        rawToken,
        'listChanges',
        tokenScope('listChanges', driveId, ''),
        1
      );
      return handle === false
        ? failure('incomplete', 200)
        : success(200, frozenRecord([['startPageToken', handle]]));
    }

    function parseChange(raw) {
      var fields = selectedDataValues(raw, ['fileId', 'removed', 'time', 'file']);
      if (!fields || !validId(fields.fileId) || typeof fields.removed !== 'boolean' ||
          !(fields.time === null || validTime(fields.time))) {
        return null;
      }
      if (fields.removed) {
        if (fields.file !== null) return null;
        return {
          fileId: fields.fileId,
          removed: true,
          time: fields.time,
          parsedFile: null
        };
      }
      var parsedFile = parseFile(fields.file, caps);
      return parsedFile && parsedFile.id === fields.fileId
        ? {
            fileId: fields.fileId,
            removed: false,
            time: fields.time,
            parsedFile: parsedFile
          }
        : null;
    }

    async function listChanges(input, signalValue) {
      if (arguments.length < 1 || arguments.length > 2) return failure('unsupported', null);
      var operationSignal = normalizeSignal(signalValue);
      var fields = exactDataValues(input, ['pageToken'], ['driveId']);
      if (operationSignal === false || !fields ||
          (own(fields, 'driveId') && !validId(fields.driveId))) {
        return failure('unsupported', null);
      }
      var driveId = own(fields, 'driveId') ? fields.driveId : null;
      var scope = tokenScope('listChanges', driveId, '');
      var consumed = consumePageToken(fields.pageToken, 'listChanges', scope);
      if (!consumed) return failure('incomplete', null);
      var argsEntries = [['pageToken', consumed.rawToken]];
      if (driveId) argsEntries.push(['driveId', driveId]);
      var envelope = pageEnvelope(await issue(
        'listChanges', frozenRecord(argsEntries), operationSignal
      ));
      if (!envelope.ok) return envelope.result;
      var changeField = selectedDataValue(envelope.data, 'changes');
      var nextRaw = parseTokenField(envelope.data, 'nextPageToken');
      var newStartRaw = parseTokenField(envelope.data, 'newStartPageToken');
      if (!changeField || nextRaw === false || newStartRaw === false ||
          (nextRaw !== null && newStartRaw !== null)) {
        return failure('malformed', 200);
      }
      var rawChanges = denseArrayValues(changeField.value, caps.maxItemsPerPage);
      if (!rawChanges) return failure('incomplete', 200);
      if (nextRaw !== null && consumed.pageNumber >= caps.maxPagesPerChain) {
        return failure('incomplete', 200);
      }
      var parsedChanges = [];
      var changedIds = new Set();
      for (var index = 0; index < rawChanges.length; index += 1) {
        var parsed = parseChange(rawChanges[index]);
        if (!parsed || changedIds.has(parsed.fileId)) return failure('malformed', 200);
        changedIds.add(parsed.fileId);
        parsedChanges.push(parsed);
      }
      var nextHandle = mintPageToken(nextRaw, 'listChanges', scope, consumed.pageNumber + 1);
      var startHandle = mintPageToken(newStartRaw, 'listChanges', scope, 1);
      if (nextHandle === false || startHandle === false) return failure('incomplete', 200);
      var changes = parsedChanges.map(function(change) {
        return frozenRecord([
          ['fileId', change.fileId],
          ['removed', change.removed],
          ['time', change.time],
          ['file', change.parsedFile ? publishFile(change.parsedFile) : null]
        ]);
      });
      return success(200, frozenRecord([
        ['changes', frozenArray(changes)],
        ['nextPageToken', nextHandle],
        ['newStartPageToken', startHandle]
      ]));
    }

    function base64Value(code) {
      if (code >= 65 && code <= 90) return code - 65;
      if (code >= 97 && code <= 122) return code - 71;
      if (code >= 48 && code <= 57) return code + 4;
      if (code === 43) return 62;
      if (code === 47) return 63;
      return -1;
    }

    function decodeBase64Exact(encoded, exactByteLength) {
      if (typeof encoded !== 'string' || !Number.isSafeInteger(exactByteLength) ||
          exactByteLength < 0 || exactByteLength > MAX_EXACT_BYTES ||
          encoded.length !== Math.ceil(exactByteLength / 3) * 4) {
        return null;
      }
      if (exactByteLength === 0) return encoded === '' ? new Uint8Array(0) : null;
      var output = new Uint8Array(exactByteLength);
      var outputIndex = 0;
      for (var index = 0; index < encoded.length; index += 4) {
        var a = base64Value(encoded.charCodeAt(index));
        var b = base64Value(encoded.charCodeAt(index + 1));
        var cCode = encoded.charCodeAt(index + 2);
        var dCode = encoded.charCodeAt(index + 3);
        var c = cCode === 61 ? 0 : base64Value(cCode);
        var d = dCode === 61 ? 0 : base64Value(dCode);
        var finalQuartet = index + 4 === encoded.length;
        if (a < 0 || b < 0 || c < 0 || d < 0 ||
            ((cCode === 61 || dCode === 61) && !finalQuartet) ||
            (cCode === 61 && dCode !== 61) ||
            (cCode === 61 && (b & 15) !== 0) ||
            (dCode === 61 && cCode !== 61 && (c & 3) !== 0)) {
          return null;
        }
        if (outputIndex < output.length) output[outputIndex++] = (a << 2) | (b >> 4);
        if (cCode !== 61 && outputIndex < output.length) {
          output[outputIndex++] = ((b & 15) << 4) | (c >> 2);
        }
        if (dCode !== 61 && outputIndex < output.length) {
          output[outputIndex++] = ((c & 3) << 6) | d;
        }
      }
      return outputIndex === exactByteLength ? output : null;
    }

    function digestHex(buffer) {
      var bytes = new Uint8Array(buffer);
      var output = '';
      for (var index = 0; index < bytes.length; index += 1) {
        output += bytes[index].toString(16).padStart(2, '0');
      }
      return 'sha256:' + output;
    }

    async function readContent(input, operationSink, signalValue) {
      if (arguments.length < 2 || arguments.length > 3) return failure('unsupported', null);
      var operationSignal = normalizeSignal(signalValue);
      var fields = exactDataValues(input, ['fileId', 'mimeType'], ['resourceKey']);
      if (operationSignal === false || !fields || !validId(fields.fileId) ||
          (fields.mimeType !== DOC_MIME && fields.mimeType !== TEXT_MIME) ||
          typeof operationSink !== 'function' || usedSinks.has(operationSink)) {
        return failure('unsupported', null);
      }
      var rawResourceKey;
      if (own(fields, 'resourceKey')) {
        rawResourceKey = unwrapResourceKey(fields.resourceKey, fields.fileId);
        if (!rawResourceKey) return failure('unsupported', null);
      } else {
        var currentResourceKey = currentResourceKeys.get(fields.fileId);
        if (currentResourceKey) rawResourceKey = unwrapResourceKey(currentResourceKey, fields.fileId);
      }
      usedSinks.add(operationSink);
      var argsEntries = [
        ['fileId', fields.fileId],
        ['mimeType', fields.mimeType]
      ];
      if (rawResourceKey) argsEntries.push(['resourceKey', rawResourceKey]);
      var bytes = null;
      var text = null;
      var sinkPayload = null;
      var data = null;
      var envelope = null;
      try {
        envelope = pageEnvelope(await issue(
          'readContent', frozenRecord(argsEntries), operationSignal
        ));
        if (!envelope.ok) return envelope.result;
        data = selectedDataValues(envelope.data, [
          'bytesBase64',
          'exactByteLength',
          'byteHash'
        ]);
        if (!data || !Number.isSafeInteger(data.exactByteLength) || data.exactByteLength < 0 ||
            typeof data.byteHash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(data.byteHash)) {
          return failure('malformed', 200);
        }
        if (data.exactByteLength > MAX_EXACT_BYTES) return failure('too-large', 200);
        bytes = decodeBase64Exact(data.bytesBase64, data.exactByteLength);
        if (!bytes) return failure('malformed', 200);
        var recomputed = digestHex(await cryptoObject.subtle.digest('SHA-256', bytes));
        if (recomputed !== data.byteHash) return failure('malformed', 200);
        try {
          if (!global.TextDecoder) return failure('malformed', 200);
          text = new global.TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch (_decodeError) {
          return failure('malformed', 200);
        }
        sinkPayload = frozenRecord([
          ['byteHash', recomputed],
          ['exactByteLength', bytes.byteLength],
          ['text', text]
        ]);
        try {
          if (operationSignal && operationSignal.aborted) return failure('transient', null);
          await operationSink(sinkPayload, operationSignal);
          if (operationSignal && operationSignal.aborted) return failure('transient', null);
        } catch (_sinkError) {
          return failure('transient', null);
        }
        return success(200, frozenRecord([
          ['byteHash', recomputed],
          ['exactByteLength', bytes.byteLength]
        ]));
      } catch (_error) {
        return failure('malformed', 200);
      } finally {
        sinkPayload = null;
        text = null;
        bytes = null;
        data = null;
        envelope = null;
      }
    }

    return Object.freeze({
      about: about,
      getFile: getFile,
      listChildren: listChildren,
      getStartPageToken: getStartPageToken,
      listChanges: listChanges,
      readContent: readContent
    });
  }

  var api = Object.freeze({
    VERSION: VERSION,
    PRIVATE_NAMESPACE: PRIVATE_NAMESPACE,
    MAX_EXACT_BYTES: MAX_EXACT_BYTES,
    RESULT_KINDS: RESULT_KINDS,
    createTransport: createTransport
  });

  global.FsbSkopeoDriveCorpusTransport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
