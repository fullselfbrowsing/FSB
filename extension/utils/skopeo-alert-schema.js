(function(global) {
  'use strict';

  var VERSION = 'skopeo-alert-schema/1';
  var OWNER_BINDING_VERSION = 'skopeo-alert-owner-binding/1';
  var CANDIDATE_VERSION = 'skopeo-alert-candidate/1';
  var ENTRY_VERSION = 'skopeo-alert-entry/1';
  var PUBLIC_STATUS_VERSION = 'skopeo-alert-public-status/1';
  var MAX_TEXT = 512;
  var MAX_DETAIL = 1024;
  var MAX_OPAQUE = 1024;
  var MAX_SOURCES = 256;
  var STATES = Object.freeze({
    scheduled: true,
    attempted: true,
    delivered: true,
    failed: true,
    missed: true,
    superseded: true
  });
  var PUBLIC_STATES = Object.freeze({
    scheduled: true,
    attempted: true,
    delivered: true,
    failed: true,
    missed: true,
    'not-locally-deliverable': true
  });
  var REASONS = Object.freeze({
    'authority-unavailable': true,
    'notification-unavailable': true,
    'notification-failed': true,
    'attempt-interrupted': true,
    'alert-date-passed': true,
    'evidence-superseded': true,
    'owner-unmapped': true,
    'owner-mismatch': true,
    'owner-ambiguous': true,
    'owner-absent': true,
    'evidence-incomplete': true,
    'recipient-unavailable': true
  });

  function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function plain(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    try {
      var prototype = Object.getPrototypeOf(value);
      return prototype === Object.prototype || prototype === null;
    } catch (_error) {
      return false;
    }
  }

  function exact(value, keys) {
    if (!plain(value)) return null;
    var actual;
    try { actual = Reflect.ownKeys(value); } catch (_error) { return null; }
    if (actual.length !== keys.length || actual.some(function(key) {
      return typeof key !== 'string' || keys.indexOf(key) < 0;
    })) return null;
    var output = Object.create(null);
    for (var index = 0; index < keys.length; index += 1) {
      var descriptor;
      try { descriptor = Object.getOwnPropertyDescriptor(value, keys[index]); }
      catch (_error) { return null; }
      if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true) return null;
      output[keys[index]] = descriptor.value;
    }
    return output;
  }

  function dense(values, maximum, minimum) {
    if (!Array.isArray(values) || values.length < minimum || values.length > maximum) return null;
    var keys;
    try { keys = Reflect.ownKeys(values); } catch (_error) { return null; }
    if (keys.length !== values.length + 1 || keys.some(function(key) {
      return key !== 'length' &&
        (typeof key !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(key) || Number(key) >= values.length);
    })) return null;
    var output = [];
    for (var index = 0; index < values.length; index += 1) {
      var descriptor;
      try { descriptor = Object.getOwnPropertyDescriptor(values, String(index)); }
      catch (_error) { return null; }
      if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true) return null;
      output.push(descriptor.value);
    }
    return output;
  }

  function scalarLength(value) {
    if (typeof value !== 'string') return -1;
    var count = 0;
    for (var index = 0; index < value.length; index += 1) {
      var unit = value.charCodeAt(index);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        if (index + 1 >= value.length) return -1;
        var next = value.charCodeAt(index + 1);
        if (next < 0xdc00 || next > 0xdfff) return -1;
        index += 1;
      } else if (unit >= 0xdc00 && unit <= 0xdfff) {
        return -1;
      }
      count += 1;
    }
    return count;
  }

  function validText(value, maximum) {
    var length = scalarLength(value);
    return length > 0 && length <= maximum && value === value.trim() &&
      !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>]/.test(value) &&
      !/(?:https?|file|chrome):\/\//i.test(value);
  }

  function validOpaque(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      value === value.trim() && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]/.test(value);
  }

  function validDigest(value, prefix) {
    return typeof value === 'string' && value.slice(0, prefix.length) === prefix &&
      /^[0-9a-f]{64}$/.test(value.slice(prefix.length));
  }

  function validCivilDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var year = Number(value.slice(0, 4));
    var month = Number(value.slice(5, 7));
    var day = Number(value.slice(8, 10));
    if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
    var leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    var maximum = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    return day <= maximum;
  }

  function validTimezone(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
      (value === 'UTC' || /^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+$/.test(value));
  }

  function frozenRecord(entries) {
    var output = Object.create(null);
    for (var index = 0; index < entries.length; index += 1) output[entries[index][0]] = entries[index][1];
    return Object.freeze(output);
  }

  function frozenArray(values) {
    return Object.freeze(values.slice());
  }

  function parsePartition(value) {
    var fields = exact(value, ['partitionKey', 'accountPermissionId', 'corpusRootFileId']);
    if (!fields || !validOpaque(fields.partitionKey, MAX_OPAQUE) ||
        fields.partitionKey.slice(0, 6) !== 'scpk1:' ||
        !validOpaque(fields.accountPermissionId, 256) ||
        !validOpaque(fields.corpusRootFileId, 256)) return null;
    return frozenRecord([
      ['partitionKey', fields.partitionKey],
      ['accountPermissionId', fields.accountPermissionId],
      ['corpusRootFileId', fields.corpusRootFileId]
    ]);
  }

  function parseOwnerBinding(value) {
    var fields = exact(value, [
      'version', 'partition', 'ownerStableRecordId', 'ownerRelationStableId',
      'ownerSourceFileId', 'ownerSourceRevision', 'ownerLabel', 'mappedAt'
    ]);
    var partition = fields && parsePartition(fields.partition);
    if (!fields || fields.version !== OWNER_BINDING_VERSION || !partition ||
        !validDigest(fields.ownerStableRecordId, 'sri1:') ||
        !validDigest(fields.ownerRelationStableId, 'srl1:') ||
        !validOpaque(fields.ownerSourceFileId, 256) ||
        !validOpaque(fields.ownerSourceRevision, MAX_OPAQUE) ||
        !validText(fields.ownerLabel, MAX_TEXT) ||
        !Number.isSafeInteger(fields.mappedAt) || fields.mappedAt < 0) return null;
    return frozenRecord([
      ['version', OWNER_BINDING_VERSION],
      ['partition', partition],
      ['ownerStableRecordId', fields.ownerStableRecordId],
      ['ownerRelationStableId', fields.ownerRelationStableId],
      ['ownerSourceFileId', fields.ownerSourceFileId],
      ['ownerSourceRevision', fields.ownerSourceRevision],
      ['ownerLabel', fields.ownerLabel],
      ['mappedAt', fields.mappedAt]
    ]);
  }

  function parseOwner(value) {
    var fields = exact(value, [
      'stableRecordId', 'stableRelationId', 'sourceFileId', 'sourceRevision', 'label'
    ]);
    if (!fields || !validDigest(fields.stableRecordId, 'sri1:') ||
        !validDigest(fields.stableRelationId, 'srl1:') ||
        !validOpaque(fields.sourceFileId, 256) ||
        !validOpaque(fields.sourceRevision, MAX_OPAQUE) ||
        !validText(fields.label, MAX_TEXT)) return null;
    return frozenRecord([
      ['stableRecordId', fields.stableRecordId],
      ['stableRelationId', fields.stableRelationId],
      ['sourceFileId', fields.sourceFileId],
      ['sourceRevision', fields.sourceRevision],
      ['label', fields.label]
    ]);
  }

  function parseDeadline(value) {
    var fields = exact(value, [
      'derivationId', 'deadlineCivilDate', 'alertCivilDate', 'timezone', 'consequence'
    ]);
    if (!fields || !validDigest(fields.derivationId, 'std1:') ||
        !validCivilDate(fields.deadlineCivilDate) || !validCivilDate(fields.alertCivilDate) ||
        !validTimezone(fields.timezone) || !validText(fields.consequence, MAX_DETAIL)) return null;
    return frozenRecord([
      ['derivationId', fields.derivationId],
      ['deadlineCivilDate', fields.deadlineCivilDate],
      ['alertCivilDate', fields.alertCivilDate],
      ['timezone', fields.timezone],
      ['consequence', fields.consequence]
    ]);
  }

  function parseEvidence(value) {
    var fields = exact(value, [
      'citationId', 'sourceFileId', 'sourceRevision', 'contentFingerprint', 'label'
    ]);
    if (!fields || !validDigest(fields.citationId, 'stc1:') ||
        !validOpaque(fields.sourceFileId, 256) ||
        !validOpaque(fields.sourceRevision, MAX_OPAQUE) ||
        !validDigest(fields.contentFingerprint, 'sha256:') ||
        !validText(fields.label, MAX_TEXT)) return null;
    return frozenRecord([
      ['citationId', fields.citationId],
      ['sourceFileId', fields.sourceFileId],
      ['sourceRevision', fields.sourceRevision],
      ['contentFingerprint', fields.contentFingerprint],
      ['label', fields.label]
    ]);
  }

  function parseSourceFileIds(value) {
    var values = dense(value, MAX_SOURCES, 1);
    if (!values || values.some(function(item) { return !validOpaque(item, 256); })) return null;
    var sorted = values.slice().sort();
    if (new Set(sorted).size !== sorted.length) return null;
    return frozenArray(sorted);
  }

  function parseCandidate(value) {
    var fields = exact(value, [
      'version', 'alertKey', 'partition', 'agreementStableId', 'familyId', 'vendorLabel',
      'owner', 'deadline', 'evidence', 'sourceFileIds', 'sourceSetDigest', 'revisionDigest',
      'accessDigest', 'truthGenerationId', 'evaluationContextDigest'
    ]);
    var partition = fields && parsePartition(fields.partition);
    var owner = fields && parseOwner(fields.owner);
    var deadline = fields && parseDeadline(fields.deadline);
    var evidence = fields && parseEvidence(fields.evidence);
    var sources = fields && parseSourceFileIds(fields.sourceFileIds);
    if (!fields || fields.version !== CANDIDATE_VERSION || !partition || !owner ||
        !deadline || !evidence || !sources || !validDigest(fields.alertKey, 'sa1:') ||
        !validDigest(fields.agreementStableId, 'sri1:') ||
        !validDigest(fields.familyId, 'stf1:') || !validText(fields.vendorLabel, MAX_TEXT) ||
        !validDigest(fields.sourceSetDigest, 'sha256:') ||
        !validDigest(fields.revisionDigest, 'sha256:') ||
        !validDigest(fields.accessDigest, 'sha256:') ||
        !validDigest(fields.truthGenerationId, 'stp1:') ||
        !validDigest(fields.evaluationContextDigest, 'sha256:') ||
        sources.indexOf(owner.sourceFileId) < 0 || sources.indexOf(evidence.sourceFileId) < 0 ||
        owner.sourceRevision !== evidence.sourceRevision || owner.sourceFileId !== evidence.sourceFileId) {
      return null;
    }
    return frozenRecord([
      ['version', CANDIDATE_VERSION],
      ['alertKey', fields.alertKey],
      ['partition', partition],
      ['agreementStableId', fields.agreementStableId],
      ['familyId', fields.familyId],
      ['vendorLabel', fields.vendorLabel],
      ['owner', owner],
      ['deadline', deadline],
      ['evidence', evidence],
      ['sourceFileIds', sources],
      ['sourceSetDigest', fields.sourceSetDigest],
      ['revisionDigest', fields.revisionDigest],
      ['accessDigest', fields.accessDigest],
      ['truthGenerationId', fields.truthGenerationId],
      ['evaluationContextDigest', fields.evaluationContextDigest]
    ]);
  }

  function validTimestamp(value) {
    return value === null || (Number.isSafeInteger(value) && value >= 0);
  }

  function parseEntry(value) {
    var fields = exact(value, [
      'version', 'candidate', 'state', 'reason', 'scheduledFor', 'scheduledAt',
      'attemptedAt', 'deliveredAt', 'updatedAt', 'attemptCount'
    ]);
    var candidate = fields && parseCandidate(fields.candidate);
    if (!fields || fields.version !== ENTRY_VERSION || !candidate || !STATES[fields.state] ||
        !(fields.reason === null || REASONS[fields.reason]) ||
        !Number.isSafeInteger(fields.scheduledFor) || fields.scheduledFor < 0 ||
        !Number.isSafeInteger(fields.scheduledAt) || fields.scheduledAt < 0 ||
        !validTimestamp(fields.attemptedAt) || !validTimestamp(fields.deliveredAt) ||
        !Number.isSafeInteger(fields.updatedAt) || fields.updatedAt < 0 ||
        !Number.isSafeInteger(fields.attemptCount) || fields.attemptCount < 0 ||
        fields.attemptCount > 1024) return null;
    if (fields.state === 'scheduled' &&
        (fields.attemptedAt !== null || fields.deliveredAt !== null || fields.attemptCount !== 0)) return null;
    if (fields.state === 'attempted' &&
        (fields.attemptedAt === null || fields.deliveredAt !== null || fields.attemptCount < 1)) return null;
    if (fields.state === 'delivered' &&
        (fields.attemptedAt === null || fields.deliveredAt === null || fields.attemptCount < 1)) return null;
    if (fields.state === 'failed' && fields.reason === null) return null;
    if (fields.state === 'missed' && fields.reason !== 'alert-date-passed') return null;
    if (fields.state === 'superseded' && fields.reason !== 'evidence-superseded') return null;
    return frozenRecord([
      ['version', ENTRY_VERSION],
      ['candidate', candidate],
      ['state', fields.state],
      ['reason', fields.reason],
      ['scheduledFor', fields.scheduledFor],
      ['scheduledAt', fields.scheduledAt],
      ['attemptedAt', fields.attemptedAt],
      ['deliveredAt', fields.deliveredAt],
      ['updatedAt', fields.updatedAt],
      ['attemptCount', fields.attemptCount]
    ]);
  }

  function parsePublicAction(value) {
    if (value === null) return null;
    var fields = exact(value, ['actionId', 'kind', 'label', 'requiresConfirmation']);
    if (!fields || !validOpaque(fields.actionId, 192) ||
        (fields.kind !== 'map-current-owner' && fields.kind !== 'remove-current-owner-mapping') ||
        !validText(fields.label, MAX_TEXT) || fields.requiresConfirmation !== true) return false;
    return frozenRecord([
      ['actionId', fields.actionId],
      ['kind', fields.kind],
      ['label', fields.label],
      ['requiresConfirmation', true]
    ]);
  }

  function parsePublicStatus(value) {
    var fields = exact(value, [
      'version', 'state', 'summary', 'detail', 'deadlineCivilDate', 'alertCivilDate', 'action'
    ]);
    var action = fields && parsePublicAction(fields.action);
    if (!fields || fields.version !== PUBLIC_STATUS_VERSION || !PUBLIC_STATES[fields.state] ||
        !validText(fields.summary, MAX_TEXT) || !validText(fields.detail, MAX_DETAIL) ||
        !(fields.deadlineCivilDate === null || validCivilDate(fields.deadlineCivilDate)) ||
        !(fields.alertCivilDate === null || validCivilDate(fields.alertCivilDate)) || action === false) {
      return null;
    }
    if (fields.state !== 'not-locally-deliverable' &&
        (fields.deadlineCivilDate === null || fields.alertCivilDate === null)) return null;
    return frozenRecord([
      ['version', PUBLIC_STATUS_VERSION],
      ['state', fields.state],
      ['summary', fields.summary],
      ['detail', fields.detail],
      ['deadlineCivilDate', fields.deadlineCivilDate],
      ['alertCivilDate', fields.alertCivilDate],
      ['action', action]
    ]);
  }

  var api = Object.freeze({
    VERSION: VERSION,
    OWNER_BINDING_VERSION: OWNER_BINDING_VERSION,
    CANDIDATE_VERSION: CANDIDATE_VERSION,
    ENTRY_VERSION: ENTRY_VERSION,
    PUBLIC_STATUS_VERSION: PUBLIC_STATUS_VERSION,
    STATES: STATES,
    REASONS: REASONS,
    LIMITS: Object.freeze({ MAX_TEXT: MAX_TEXT, MAX_DETAIL: MAX_DETAIL, MAX_SOURCES: MAX_SOURCES }),
    parsePartition: parsePartition,
    parseOwnerBinding: parseOwnerBinding,
    parseCandidate: parseCandidate,
    parseEntry: parseEntry,
    parsePublicStatus: parsePublicStatus
  });

  global.FsbSkopeoAlertSchema = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
