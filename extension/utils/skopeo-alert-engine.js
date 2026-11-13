(function(global) {
  'use strict';

  var VERSION = 'skopeo-alert-engine/1';
  var TRANSITIONS = Object.freeze({
    scheduled: Object.freeze({ attempted: true, missed: true, superseded: true, failed: true }),
    attempted: Object.freeze({ delivered: true, failed: true, superseded: true }),
    delivered: Object.freeze({ superseded: true }),
    failed: Object.freeze({ scheduled: true, superseded: true, missed: true }),
    missed: Object.freeze({}),
    superseded: Object.freeze({})
  });

  function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function plain(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    try {
      var prototype = Object.getPrototypeOf(value);
      return prototype === Object.prototype || prototype === null;
    } catch (_error) { return false; }
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
    if (keys.length !== values.length + 1) return null;
    var output = [];
    for (var index = 0; index < values.length; index += 1) {
      var descriptor = Object.getOwnPropertyDescriptor(values, String(index));
      if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true) return null;
      output.push(descriptor.value);
    }
    return output;
  }

  function frozenRecord(entries) {
    var output = Object.create(null);
    for (var index = 0; index < entries.length; index += 1) output[entries[index][0]] = entries[index][1];
    return Object.freeze(output);
  }

  function closed(disposition, publicStatus) {
    return frozenRecord([
      ['disposition', disposition],
      ['candidate', null],
      ['publicStatus', publicStatus || null]
    ]);
  }

  function text(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      value === value.trim() && !/[\u0000-\u001f\u007f<>]/.test(value);
  }

  function digest(value, prefix) {
    return typeof value === 'string' && value.slice(0, prefix.length) === prefix &&
      /^[0-9a-f]{64}$/.test(value.slice(prefix.length));
  }

  function opaque(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      !/[\u0000-\u001f\u007f]/.test(value);
  }

  function parseOwner(value) {
    var fields = exact(value, [
      'stableRecordId', 'stableRelationId', 'sourceFileId', 'sourceRevision', 'label'
    ]);
    return fields && digest(fields.stableRecordId, 'sri1:') &&
      digest(fields.stableRelationId, 'srl1:') && opaque(fields.sourceFileId, 256) &&
      opaque(fields.sourceRevision, 1024) && text(fields.label, 512) ? fields : null;
  }

  function parseDeadline(value) {
    var fields = exact(value, [
      'type', 'derivationId', 'deadlineCivilDate', 'timezone', 'consequence',
      'eligibility', 'inputsCurrent', 'inputsExact', 'blockerCodes', 'citationIds'
    ]);
    var blockers = fields && dense(fields.blockerCodes, 32, 0);
    var citations = fields && dense(fields.citationIds, 256, 1);
    if (!fields || !blockers || !citations ||
        !['notice-deadline', 'renewal-date', 'expiration-date', 'termination-date'].includes(fields.type) ||
        !digest(fields.derivationId, 'std1:') ||
        typeof fields.deadlineCivilDate !== 'string' ||
        typeof fields.timezone !== 'string' || !text(fields.consequence, 1024) ||
        (fields.eligibility !== 'eligible' && fields.eligibility !== 'ineligible') ||
        typeof fields.inputsCurrent !== 'boolean' || typeof fields.inputsExact !== 'boolean' ||
        blockers.some(function(code) { return !opaque(code, 64); }) ||
        citations.some(function(id) { return !digest(id, 'stc1:'); }) ||
        new Set(citations).size !== citations.length) return null;
    fields.blockerCodes = blockers.slice().sort();
    fields.citationIds = citations.slice().sort();
    return fields;
  }

  function parseEvidence(value) {
    var fields = exact(value, [
      'citationId', 'sourceFileId', 'sourceRevision', 'contentFingerprint', 'label'
    ]);
    return fields && digest(fields.citationId, 'stc1:') && opaque(fields.sourceFileId, 256) &&
      opaque(fields.sourceRevision, 1024) && digest(fields.contentFingerprint, 'sha256:') &&
      text(fields.label, 512) ? fields : null;
  }

  function parseInput(value, alertSchema) {
    var fields = exact(value, [
      'partition', 'complete', 'agreementStableId', 'familyId', 'vendorLabel', 'owner',
      'mapping', 'deadlineResult', 'evidence', 'sourceFileIds', 'sourceSetDigest',
      'revisionDigest', 'accessDigest', 'truthGenerationId', 'evaluationContextDigest'
    ]);
    var partition = fields && alertSchema.parsePartition(fields.partition);
    var owner = fields && parseOwner(fields.owner);
    var mapping = fields && fields.mapping !== null
      ? alertSchema.parseOwnerBinding(fields.mapping)
      : null;
    var deadline = fields && parseDeadline(fields.deadlineResult);
    var evidence = fields && parseEvidence(fields.evidence);
    var sourceFileIds = fields && dense(fields.sourceFileIds, alertSchema.LIMITS.MAX_SOURCES, 1);
    if (!fields || !partition || !owner || (fields.mapping !== null && !mapping) || !deadline ||
        !evidence || !sourceFileIds || fields.complete !== true ||
        !digest(fields.agreementStableId, 'sri1:') || !digest(fields.familyId, 'stf1:') ||
        !text(fields.vendorLabel, 512) ||
        sourceFileIds.some(function(id) { return !opaque(id, 256); }) ||
        new Set(sourceFileIds).size !== sourceFileIds.length ||
        !digest(fields.sourceSetDigest, 'sha256:') || !digest(fields.revisionDigest, 'sha256:') ||
        !digest(fields.accessDigest, 'sha256:') || !digest(fields.truthGenerationId, 'stp1:') ||
        !digest(fields.evaluationContextDigest, 'sha256:')) return null;
    sourceFileIds.sort();
    return {
      partition: partition,
      agreementStableId: fields.agreementStableId,
      familyId: fields.familyId,
      vendorLabel: fields.vendorLabel,
      owner: owner,
      mapping: mapping,
      deadline: deadline,
      evidence: evidence,
      sourceFileIds: sourceFileIds,
      sourceSetDigest: fields.sourceSetDigest,
      revisionDigest: fields.revisionDigest,
      accessDigest: fields.accessDigest,
      truthGenerationId: fields.truthGenerationId,
      evaluationContextDigest: fields.evaluationContextDigest
    };
  }

  function mappingCurrent(input) {
    var mapping = input.mapping;
    return !!mapping &&
      mapping.partition.partitionKey === input.partition.partitionKey &&
      mapping.partition.accountPermissionId === input.partition.accountPermissionId &&
      mapping.partition.corpusRootFileId === input.partition.corpusRootFileId &&
      mapping.ownerStableRecordId === input.owner.stableRecordId &&
      mapping.ownerRelationStableId === input.owner.stableRelationId &&
      mapping.ownerSourceFileId === input.owner.sourceFileId &&
      mapping.ownerSourceRevision === input.owner.sourceRevision;
  }

  function notDeliverable(alertSchema, reason) {
    var details = {
      'owner-unmapped': 'The current agreement owner is not mapped to this Chrome user.',
      'owner-mismatch': 'The mapped owner is different from the current agreement owner.'
    };
    var status = alertSchema.parsePublicStatus({
      version: alertSchema.PUBLIC_STATUS_VERSION,
      state: 'not-locally-deliverable',
      summary: 'Not locally deliverable',
      detail: details[reason] || 'The current recipient cannot be verified for local delivery.',
      deadlineCivilDate: null,
      alertCivilDate: null,
      action: null
    });
    return closed('not-locally-deliverable', status);
  }

  function monthName(value) {
    return [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ][value - 1];
  }

  function displayCivilDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return monthName(Number(value.slice(5, 7))) + ' ' + Number(value.slice(8, 10)) + ', ' + value.slice(0, 4);
  }

  function canTransition(from, to) {
    return !!TRANSITIONS[from] && TRANSITIONS[from][to] === true;
  }

  function create(dependencies) {
    var fields = exact(dependencies, ['alertSchema', 'deadlineEngine', 'digest']);
    if (!fields || !fields.alertSchema || !fields.deadlineEngine ||
        typeof fields.deadlineEngine.parseCivilDate !== 'function' ||
        typeof fields.deadlineEngine.toOrdinal !== 'function' ||
        typeof fields.deadlineEngine.fromOrdinal !== 'function' ||
        typeof fields.digest !== 'function') return null;
    var alertSchema = fields.alertSchema;

    async function derive(value) {
      var input = parseInput(value, alertSchema);
      if (!input) return closed('ineligible', null);
      var deadline = input.deadline;
      if (deadline.type !== 'notice-deadline' || deadline.eligibility !== 'eligible' ||
          deadline.inputsCurrent !== true || deadline.inputsExact !== true ||
          deadline.blockerCodes.length !== 0 ||
          deadline.citationIds.indexOf(input.evidence.citationId) < 0 ||
          input.sourceFileIds.indexOf(input.owner.sourceFileId) < 0 ||
          input.sourceFileIds.indexOf(input.evidence.sourceFileId) < 0 ||
          input.owner.sourceFileId !== input.evidence.sourceFileId ||
          input.owner.sourceRevision !== input.evidence.sourceRevision) {
        return closed('ineligible', null);
      }
      if (!input.mapping) return notDeliverable(alertSchema, 'owner-unmapped');
      if (!mappingCurrent(input)) return notDeliverable(alertSchema, 'owner-mismatch');
      var parsedDate = fields.deadlineEngine.parseCivilDate(deadline.deadlineCivilDate);
      var ordinal = parsedDate && fields.deadlineEngine.toOrdinal(parsedDate);
      var alertDate = Number.isSafeInteger(ordinal)
        ? fields.deadlineEngine.fromOrdinal(ordinal - 90)
        : null;
      if (!alertDate) return closed('ineligible', null);
      var material = [
        VERSION,
        input.partition.partitionKey,
        input.agreementStableId,
        input.familyId,
        input.owner.stableRecordId,
        input.owner.stableRelationId,
        deadline.derivationId,
        deadline.deadlineCivilDate,
        alertDate.value,
        deadline.timezone,
        input.evidence.citationId,
        input.evidence.sourceFileId,
        input.evidence.sourceRevision,
        input.evidence.contentFingerprint,
        input.sourceSetDigest,
        input.revisionDigest,
        input.accessDigest,
        input.truthGenerationId,
        input.evaluationContextDigest
      ];
      var hash;
      try { hash = await fields.digest(material); } catch (_error) { hash = null; }
      if (typeof hash === 'string' && hash.slice(0, 7) === 'sha256:') hash = hash.slice(7);
      if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) {
        return closed('ineligible', null);
      }
      var candidate = alertSchema.parseCandidate({
        version: alertSchema.CANDIDATE_VERSION,
        alertKey: 'sa1:' + hash,
        partition: input.partition,
        agreementStableId: input.agreementStableId,
        familyId: input.familyId,
        vendorLabel: input.vendorLabel,
        owner: input.owner,
        deadline: {
          derivationId: deadline.derivationId,
          deadlineCivilDate: deadline.deadlineCivilDate,
          alertCivilDate: alertDate.value,
          timezone: deadline.timezone,
          consequence: deadline.consequence
        },
        evidence: input.evidence,
        sourceFileIds: input.sourceFileIds,
        sourceSetDigest: input.sourceSetDigest,
        revisionDigest: input.revisionDigest,
        accessDigest: input.accessDigest,
        truthGenerationId: input.truthGenerationId,
        evaluationContextDigest: input.evaluationContextDigest
      });
      return candidate ? frozenRecord([
        ['disposition', 'eligible'],
        ['candidate', candidate],
        ['publicStatus', null]
      ]) : closed('ineligible', null);
    }

    function publicStatus(value) {
      var entry = alertSchema.parseEntry(value);
      if (!entry || entry.state === 'superseded') return null;
      var copy = {
        scheduled: ['Local alert scheduled', 'For ' + displayCivilDate(entry.candidate.deadline.alertCivilDate) +
          ' · 90 days before the governing notice deadline.'],
        attempted: ['Local alert attempt recorded',
          'Chrome did not confirm completion before the worker stopped. Skopeo will not claim delivery.'],
        delivered: ['Local alert delivered',
          'Delivered to this Chrome user on ' + displayCivilDate(entry.candidate.deadline.alertCivilDate) + '.'],
        failed: ['Local alert failed', 'Chrome could not confirm the current local notification. Reopen Skopeo after access is restored.'],
        missed: ['Local alert missed', 'The 90-day alert date passed before a current delivery could be confirmed.']
      }[entry.state];
      return copy ? alertSchema.parsePublicStatus({
        version: alertSchema.PUBLIC_STATUS_VERSION,
        state: entry.state,
        summary: copy[0],
        detail: copy[1],
        deadlineCivilDate: entry.candidate.deadline.deadlineCivilDate,
        alertCivilDate: entry.candidate.deadline.alertCivilDate,
        action: null
      }) : null;
    }

    return Object.freeze({
      VERSION: VERSION,
      derive: derive,
      canTransition: canTransition,
      publicStatus: publicStatus
    });
  }

  var api = Object.freeze({ VERSION: VERSION, create: create });
  global.FsbSkopeoAlertEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
