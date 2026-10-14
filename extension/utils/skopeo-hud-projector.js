(function(global) {
  'use strict';

  var VERSION = 'skopeo-hud-projector/1';
  var schema = global && global.FsbSkopeoHudSchema;
  var MAX_INPUT_ROWS = 4096;
  var MAX_BLOCKERS = 32;
  var INPUT_KEYS = [
    'mode', 'focus', 'manifest', 'graph', 'truth',
    'vendorLabels', 'evaluationContext', 'authority'
  ];
  var ASK_INPUT_KEYS = ['mode', 'scope', 'question', 'state', 'error', 'authority'];
  var ANSWER_INPUT_KEYS = [
    'mode', 'question', 'scope', 'answer', 'policy', 'policyActions', 'authority'
  ];
  var DATE_ORDER = makeOrder(['notice-deadline', 'termination', 'expiration', 'renewal']);
  var FACT_ORDER = makeOrder([
    'signed', 'effective', 'notice-window', 'notice-deadline', 'renewal',
    'termination', 'expiration', 'delivery-method', 'written-notice-address'
  ]);
  var GAP_ORDER = makeOrder([
    'missing-final',
    'unreadable-scan',
    'incomplete-indexing',
    'download-blocked',
    'inaccessible',
    'pending',
    'owner-gap',
    'version-conflict',
    'policy-document-missing',
    'ambiguous',
    'not-evaluated'
  ]);
  var SOURCE_STATES = makeSet([
    'ready', 'pending', 'unreadable', 'download-blocked', 'inaccessible', 'missing'
  ]);
  var INDEX_STATES = makeSet(['complete', 'incomplete', 'pending', 'not-evaluated']);
  var RECORD_KINDS = makeSet([
    'agreement', 'amendment', 'clause', 'fact', 'event',
    'owner', 'policy-document', 'memo'
  ]);
  var RELATION_TYPES = makeSet(['assigned-owner', 'references-policy', 'references-memo']);
  var FOLDER_STATES = makeSet([
    'governing', 'partially-governing', 'review-required', 'not-evaluated'
  ]);
  var READING_STATES = makeSet([
    'governing', 'partially-governing', 'historical', 'superseded',
    'review-required', 'not-evaluated', 'access-unavailable'
  ]);
  var FINAL_STATES = makeSet(['present', 'proven-missing', 'not-evaluated', 'unknown']);
  var POLICY_STATES = makeSet(['on-file', 'proven-missing', 'not-evaluated']);
  var ACTION_STATES = makeSet(['clause', 'document', 'not-available']);
  var GAP_TYPES = makeSet([
    'missing-final', 'unreadable-scan', 'incomplete-indexing', 'owner-gap',
    'version-conflict', 'policy-document-missing', 'pending', 'download-blocked',
    'inaccessible', 'ambiguous', 'not-evaluated'
  ]);
  var TRUST_STATES = makeSet([
    'accepted', 'extracted', 'inferred', 'ambiguous', 'unreadable', 'review-required'
  ]);
  var EVIDENCE_ROLES = makeSet(['governing', 'history']);

  function makeSet(values) {
    var output = Object.create(null);
    for (var index = 0; index < values.length; index += 1) output[values[index]] = true;
    return Object.freeze(output);
  }

  function makeOrder(values) {
    var output = Object.create(null);
    for (var index = 0; index < values.length; index += 1) output[values[index]] = index;
    return Object.freeze(output);
  }

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
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

  function dataValues(value, expectedKeys) {
    if (!isPlainRecord(value)) return null;
    try {
      var actualKeys = Reflect.ownKeys(value);
      if (actualKeys.length !== expectedKeys.length || actualKeys.some(function(key) {
        return typeof key !== 'string';
      })) {
        return null;
      }
      var expected = expectedKeys.slice().sort();
      var sorted = actualKeys.slice().sort();
      for (var index = 0; index < sorted.length; index += 1) {
        if (sorted[index] !== expected[index]) return null;
      }
      var output = Object.create(null);
      for (var keyIndex = 0; keyIndex < actualKeys.length; keyIndex += 1) {
        var key = actualKeys[keyIndex];
        var descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true) return null;
        output[key] = descriptor.value;
      }
      return output;
    } catch (_error) {
      return null;
    }
  }

  function dataArrayValues(value, maximum) {
    if (!Array.isArray(value) || value.length > maximum) return null;
    try {
      if (Object.getPrototypeOf(value) !== Array.prototype) return null;
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

  function validUnicode(value) {
    if (typeof value !== 'string') return false;
    for (var index = 0; index < value.length; index += 1) {
      var unit = value.charCodeAt(index);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        if (index + 1 >= value.length) return false;
        var next = value.charCodeAt(index + 1);
        if (next < 0xdc00 || next > 0xdfff) return false;
        index += 1;
      } else if (unit >= 0xdc00 && unit <= 0xdfff) {
        return false;
      }
    }
    return true;
  }

  function validText(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      validUnicode(value) &&
      !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]/.test(value) &&
      !/(?:https?|file|chrome):\/\//i.test(value);
  }

  function validToken(value) {
    var maximum = schema && schema.LIMITS
      ? schema.LIMITS.MAX_OPAQUE_TOKEN_LENGTH
      : 192;
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value) &&
      value !== '__proto__' && value !== 'prototype' && value !== 'constructor';
  }

  function validCount(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function validDigest(value) {
    return typeof value === 'string' && /^(?:sha256|sgx1):[0-9a-f]{64}$/.test(value);
  }

  function validOriginForMode(value, mode) {
    if (value !== 'https://drive.google.com' && value !== 'https://docs.google.com') return false;
    return mode === 'folder' ? value === 'https://drive.google.com' :
      mode === 'reading' || mode === 'ask' || mode === 'answer';
  }

  function isLeapYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  }

  function daysInMonth(year, month) {
    if (month === 2) return isLeapYear(year) ? 29 : 28;
    return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
  }

  function validCivilDate(value) {
    if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
    var year = Number(value.slice(0, 4));
    var month = Number(value.slice(5, 7));
    var day = Number(value.slice(8, 10));
    return year >= 1 && year <= 9999 && month >= 1 && month <= 12 &&
      day >= 1 && day <= daysInMonth(year, month);
  }

  function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
  }

  function parseAuthority(value, mode) {
    var fields = dataValues(value, [
      'generation', 'exactOrigin', 'profileVersion', 'contextEpoch',
      'semanticEntityToken', 'requestActionToken', 'projectionToken'
    ]);
    if (!fields || !validCount(fields.generation) ||
        !validOriginForMode(fields.exactOrigin, mode) || !validToken(fields.profileVersion) ||
        !validCount(fields.contextEpoch) || !validToken(fields.semanticEntityToken) ||
        !validToken(fields.requestActionToken) || !validToken(fields.projectionToken)) {
      return null;
    }
    return {
      generation: fields.generation,
      exactOrigin: fields.exactOrigin,
      profileVersion: fields.profileVersion,
      contextEpoch: fields.contextEpoch,
      semanticEntityToken: fields.semanticEntityToken,
      requestActionToken: fields.requestActionToken,
      projectionToken: fields.projectionToken
    };
  }

  function parseFocus(value, mode) {
    var fields = dataValues(value, ['sourceBinding', 'documentLabel']);
    if (!fields) return null;
    if (mode === 'folder') {
      return fields.sourceBinding === null && fields.documentLabel === null
        ? { sourceBinding: null, documentLabel: null }
        : null;
    }
    if (!validToken(fields.sourceBinding) ||
        !validText(fields.documentLabel, schema.LIMITS.MAX_LABEL_LENGTH)) {
      return null;
    }
    return { sourceBinding: fields.sourceBinding, documentLabel: fields.documentLabel };
  }

  function parseSource(value) {
    var fields = dataValues(value, ['sourceBinding', 'vendorScopeFileId', 'state', 'indexState']);
    if (!fields || !validToken(fields.sourceBinding) ||
        !(fields.vendorScopeFileId === null || validToken(fields.vendorScopeFileId)) ||
        !SOURCE_STATES[fields.state] || !INDEX_STATES[fields.indexState]) {
      return null;
    }
    return {
      sourceBinding: fields.sourceBinding,
      vendorScopeFileId: fields.vendorScopeFileId,
      state: fields.state,
      indexState: fields.indexState
    };
  }

  function parseManifest(value) {
    var fields = dataValues(value, [
      'state', 'authorizedSetDigest', 'totalSources', 'sourceOverflow',
      'totalVendors', 'vendorOverflow', 'sources'
    ]);
    var sourceItems = fields && dataArrayValues(fields.sources, MAX_INPUT_ROWS);
    if (!fields || !sourceItems || (fields.state !== 'complete' && fields.state !== 'partial') ||
        !validDigest(fields.authorizedSetDigest) || !validCount(fields.totalSources) ||
        !validCount(fields.sourceOverflow) || !validCount(fields.totalVendors) ||
        !validCount(fields.vendorOverflow) ||
        fields.totalSources !== sourceItems.length + fields.sourceOverflow) {
      return null;
    }
    var sources = [];
    var byBinding = Object.create(null);
    var vendorScopes = Object.create(null);
    for (var index = 0; index < sourceItems.length; index += 1) {
      var source = parseSource(sourceItems[index]);
      if (!source || own(byBinding, source.sourceBinding)) return null;
      byBinding[source.sourceBinding] = source;
      if (source.vendorScopeFileId !== null) vendorScopes[source.vendorScopeFileId] = true;
      sources.push(source);
    }
    return {
      state: fields.state,
      authorizedSetDigest: fields.authorizedSetDigest,
      totalSources: fields.totalSources,
      sourceOverflow: fields.sourceOverflow,
      totalVendors: fields.totalVendors,
      vendorOverflow: fields.vendorOverflow,
      sources: sources,
      byBinding: byBinding,
      vendorScopes: vendorScopes
    };
  }

  function parseGraphRecord(value, sources) {
    var fields = dataValues(value, ['recordToken', 'kind', 'sourceBinding', 'label']);
    if (!fields || !validToken(fields.recordToken) || !RECORD_KINDS[fields.kind] ||
        !validToken(fields.sourceBinding) || !own(sources, fields.sourceBinding) ||
        !validText(fields.label, schema.LIMITS.MAX_TEXT_LENGTH)) {
      return null;
    }
    return {
      recordToken: fields.recordToken,
      kind: fields.kind,
      sourceBinding: fields.sourceBinding,
      label: fields.label
    };
  }

  function parseGraphRelation(value, records, sources) {
    var fields = dataValues(value, [
      'type', 'fromRecordToken', 'toRecordToken', 'sourceBinding', 'current'
    ]);
    var from = fields && records[fields.fromRecordToken];
    if (!fields || !RELATION_TYPES[fields.type] || !validToken(fields.fromRecordToken) ||
        !validToken(fields.toRecordToken) || !own(records, fields.fromRecordToken) ||
        !own(records, fields.toRecordToken) || !validToken(fields.sourceBinding) ||
        !own(sources, fields.sourceBinding) || fields.sourceBinding !== from.sourceBinding ||
        typeof fields.current !== 'boolean') {
      return null;
    }
    return {
      type: fields.type,
      fromRecordToken: fields.fromRecordToken,
      toRecordToken: fields.toRecordToken,
      sourceBinding: fields.sourceBinding,
      current: fields.current
    };
  }

  function parseGraph(value, manifest) {
    var fields = dataValues(value, ['state', 'authorizedSetDigest', 'records', 'relations']);
    var recordItems = fields && dataArrayValues(fields.records, MAX_INPUT_ROWS);
    var relationItems = fields && dataArrayValues(fields.relations, MAX_INPUT_ROWS);
    if (!fields || !recordItems || !relationItems ||
        (fields.state !== 'complete' && fields.state !== 'partial') ||
        !validDigest(fields.authorizedSetDigest)) {
      return null;
    }
    var records = [];
    var byToken = Object.create(null);
    for (var index = 0; index < recordItems.length; index += 1) {
      var record = parseGraphRecord(recordItems[index], manifest.byBinding);
      if (!record || own(byToken, record.recordToken)) return null;
      byToken[record.recordToken] = record;
      records.push(record);
    }
    var relations = [];
    var relationKeys = Object.create(null);
    for (var relationIndex = 0; relationIndex < relationItems.length; relationIndex += 1) {
      var relation = parseGraphRelation(
        relationItems[relationIndex], byToken, manifest.byBinding
      );
      var key = relation && [
        relation.type, relation.fromRecordToken, relation.toRecordToken, relation.sourceBinding
      ].join('\u0000');
      if (!relation || own(relationKeys, key)) return null;
      relationKeys[key] = true;
      relations.push(relation);
    }
    return {
      state: fields.state,
      authorizedSetDigest: fields.authorizedSetDigest,
      records: records,
      byToken: byToken,
      relations: relations
    };
  }

  function parseReadingState(value, familyBindings) {
    var fields = dataValues(value, ['sourceBinding', 'state']);
    if (!fields || !validToken(fields.sourceBinding) || !own(familyBindings, fields.sourceBinding) ||
        !READING_STATES[fields.state]) {
      return null;
    }
    return { sourceBinding: fields.sourceBinding, state: fields.state };
  }

  function parseDate(value, familyBindings) {
    var fields = dataValues(value, [
      'type', 'civilDate', 'displayDate', 'trustState', 'consequence', 'sourceBinding'
    ]);
    if (!fields || !own(DATE_ORDER, fields.type) || !validCivilDate(fields.civilDate) ||
        !validText(fields.displayDate, schema.LIMITS.MAX_LABEL_LENGTH) ||
        !TRUST_STATES[fields.trustState] ||
        !validText(fields.consequence, schema.LIMITS.MAX_TEXT_LENGTH) ||
        !validToken(fields.sourceBinding) || !own(familyBindings, fields.sourceBinding)) {
      return null;
    }
    return {
      type: fields.type,
      civilDate: fields.civilDate,
      displayDate: fields.displayDate,
      trustState: fields.trustState,
      consequence: fields.consequence,
      sourceBinding: fields.sourceBinding
    };
  }

  function parseFact(value, familyBindings) {
    var fields = dataValues(value, [
      'type', 'value', 'evidenceRole', 'trustState',
      'citationLabel', 'sourceBinding', 'actionToken'
    ]);
    if (!fields || !own(FACT_ORDER, fields.type) ||
        !validText(fields.value, schema.LIMITS.MAX_TEXT_LENGTH) ||
        !EVIDENCE_ROLES[fields.evidenceRole] || !TRUST_STATES[fields.trustState] ||
        !validText(fields.citationLabel, schema.LIMITS.MAX_CITATION_LABEL_LENGTH) ||
        !validToken(fields.sourceBinding) || !own(familyBindings, fields.sourceBinding) ||
        !validToken(fields.actionToken)) {
      return null;
    }
    return {
      type: fields.type,
      value: fields.value,
      evidenceRole: fields.evidenceRole,
      trustState: fields.trustState,
      citationLabel: fields.citationLabel,
      sourceBinding: fields.sourceBinding,
      actionToken: fields.actionToken
    };
  }

  function parseGapTypes(value) {
    var items = dataArrayValues(value, MAX_BLOCKERS);
    if (!items) return null;
    var output = [];
    var seen = Object.create(null);
    for (var index = 0; index < items.length; index += 1) {
      if (!GAP_TYPES[items[index]] || own(seen, items[index])) return null;
      seen[items[index]] = true;
      output.push(items[index]);
    }
    return output;
  }

  function parseNotificationDelivery(value, actionTokens) {
    if (value === 'not-available') return value;
    var fields = dataValues(value, [
      'version', 'state', 'summary', 'detail', 'deadlineCivilDate',
      'alertCivilDate', 'action'
    ]);
    if (!fields || fields.version !== 'skopeo-alert-public-status/1' ||
        ['scheduled', 'attempted', 'delivered', 'failed', 'missed',
          'not-locally-deliverable'].indexOf(fields.state) === -1 ||
        !validText(fields.summary, schema.LIMITS.MAX_TEXT_LENGTH) ||
        !validText(fields.detail, schema.LIMITS.MAX_TEXT_LENGTH) ||
        !(fields.deadlineCivilDate === null || validCivilDate(fields.deadlineCivilDate)) ||
        !(fields.alertCivilDate === null || validCivilDate(fields.alertCivilDate))) return null;
    if (fields.state !== 'not-locally-deliverable' &&
        (fields.deadlineCivilDate === null || fields.alertCivilDate === null)) return null;
    var action = null;
    if (fields.action !== null) {
      var actionFields = dataValues(fields.action, [
        'actionId', 'kind', 'label', 'requiresConfirmation'
      ]);
      if (!actionFields || !validToken(actionFields.actionId) ||
          own(actionTokens, actionFields.actionId) ||
          (actionFields.kind !== 'map-current-owner' &&
            actionFields.kind !== 'remove-current-owner-mapping') ||
          !validText(actionFields.label, schema.LIMITS.MAX_LABEL_LENGTH) ||
          actionFields.requiresConfirmation !== true ||
          (actionFields.kind === 'map-current-owner' &&
            fields.state !== 'not-locally-deliverable') ||
          (actionFields.kind === 'remove-current-owner-mapping' &&
            fields.state === 'not-locally-deliverable')) return null;
      actionTokens[actionFields.actionId] = true;
      action = {
        actionId: actionFields.actionId,
        kind: actionFields.kind,
        label: actionFields.label,
        requiresConfirmation: true
      };
    }
    return {
      version: fields.version,
      state: fields.state,
      summary: fields.summary,
      detail: fields.detail,
      deadlineCivilDate: fields.deadlineCivilDate,
      alertCivilDate: fields.alertCivilDate,
      action: action
    };
  }

  function parseFamily(value, manifest) {
    var hasNotificationDelivery = isPlainRecord(value) && own(value, 'notificationDelivery');
    var familyKeys = [
      'familyToken', 'sourceBindings', 'governingState', 'readingStates',
      'finalState', 'materialDates', 'facts', 'conflicts', 'priorityGaps',
      'policyState', 'governingAction'
    ];
    if (hasNotificationDelivery) familyKeys.push('notificationDelivery');
    var fields = dataValues(value, familyKeys);
    var sourceItems = fields && dataArrayValues(fields.sourceBindings, MAX_INPUT_ROWS);
    if (!fields || !sourceItems || sourceItems.length === 0 || !validToken(fields.familyToken) ||
        !FOLDER_STATES[fields.governingState] || !FINAL_STATES[fields.finalState] ||
        !POLICY_STATES[fields.policyState]) {
      return null;
    }
    var sourceBindings = [];
    var familyBindings = Object.create(null);
    for (var sourceIndex = 0; sourceIndex < sourceItems.length; sourceIndex += 1) {
      var sourceBinding = sourceItems[sourceIndex];
      if (!validToken(sourceBinding) || !own(manifest.byBinding, sourceBinding) ||
          own(familyBindings, sourceBinding)) {
        return null;
      }
      familyBindings[sourceBinding] = true;
      sourceBindings.push(sourceBinding);
    }

    var readingItems = dataArrayValues(fields.readingStates, MAX_INPUT_ROWS);
    var dateItems = dataArrayValues(fields.materialDates, MAX_INPUT_ROWS);
    var factItems = dataArrayValues(fields.facts, MAX_INPUT_ROWS);
    var conflicts = parseGapTypes(fields.conflicts);
    var priorityGaps = parseGapTypes(fields.priorityGaps);
    if (!readingItems || !dateItems || !factItems || !conflicts || !priorityGaps) return null;
    var readingStates = [];
    var readingBySource = Object.create(null);
    for (var readingIndex = 0; readingIndex < readingItems.length; readingIndex += 1) {
      var reading = parseReadingState(readingItems[readingIndex], familyBindings);
      if (!reading || own(readingBySource, reading.sourceBinding)) return null;
      readingBySource[reading.sourceBinding] = reading;
      readingStates.push(reading);
    }
    var dates = [];
    for (var dateIndex = 0; dateIndex < dateItems.length; dateIndex += 1) {
      var date = parseDate(dateItems[dateIndex], familyBindings);
      if (!date) return null;
      dates.push(date);
    }
    var facts = [];
    var actionTokens = Object.create(null);
    for (var factIndex = 0; factIndex < factItems.length; factIndex += 1) {
      var fact = parseFact(factItems[factIndex], familyBindings);
      if (!fact || own(actionTokens, fact.actionToken)) return null;
      actionTokens[fact.actionToken] = true;
      facts.push(fact);
    }
    var action = dataValues(fields.governingAction, ['state', 'sourceBinding', 'actionToken']);
    if (!action || !ACTION_STATES[action.state]) return null;
    if (action.state === 'not-available') {
      if (action.sourceBinding !== null || action.actionToken !== null) return null;
    } else if (!validToken(action.sourceBinding) || !own(familyBindings, action.sourceBinding) ||
        !validToken(action.actionToken) || own(actionTokens, action.actionToken)) {
      return null;
    }
    var notificationDelivery = parseNotificationDelivery(
      hasNotificationDelivery ? fields.notificationDelivery : 'not-available', actionTokens);
    if (!notificationDelivery) return null;
    return {
      familyToken: fields.familyToken,
      sourceBindings: sourceBindings,
      familyBindings: familyBindings,
      governingState: fields.governingState,
      readingStates: readingStates,
      readingBySource: readingBySource,
      finalState: fields.finalState,
      materialDates: dates,
      facts: facts,
      conflicts: conflicts,
      priorityGaps: priorityGaps,
      policyState: fields.policyState,
      notificationDelivery: notificationDelivery,
      governingAction: {
        state: action.state,
        sourceBinding: action.sourceBinding,
        actionToken: action.actionToken
      }
    };
  }

  function parseTruth(value, manifest) {
    var fields = dataValues(value, [
      'state', 'authorizedSetDigest', 'evaluationContextDigest', 'families', 'blockerCodes'
    ]);
    var familyItems = fields && dataArrayValues(fields.families, MAX_INPUT_ROWS);
    var blockerItems = fields && dataArrayValues(fields.blockerCodes, MAX_BLOCKERS);
    if (!fields || !familyItems || !blockerItems ||
        (fields.state !== 'complete' && fields.state !== 'partial') ||
        !validDigest(fields.authorizedSetDigest) || !validDigest(fields.evaluationContextDigest)) {
      return null;
    }
    var blockers = [];
    var blockerSet = Object.create(null);
    for (var blockerIndex = 0; blockerIndex < blockerItems.length; blockerIndex += 1) {
      if (!validToken(blockerItems[blockerIndex]) || own(blockerSet, blockerItems[blockerIndex])) {
        return null;
      }
      blockerSet[blockerItems[blockerIndex]] = true;
      blockers.push(blockerItems[blockerIndex]);
    }
    var families = [];
    var familyTokens = Object.create(null);
    for (var index = 0; index < familyItems.length; index += 1) {
      var family = parseFamily(familyItems[index], manifest);
      if (!family || own(familyTokens, family.familyToken)) return null;
      familyTokens[family.familyToken] = true;
      families.push(family);
    }
    return {
      state: fields.state,
      authorizedSetDigest: fields.authorizedSetDigest,
      evaluationContextDigest: fields.evaluationContextDigest,
      families: families,
      blockers: blockers
    };
  }

  function parseVendorLabels(value, manifest) {
    var fields = dataValues(value, ['state', 'entries']);
    var items = fields && dataArrayValues(fields.entries, MAX_INPUT_ROWS);
    if (!fields || !items || fields.state !== 'current') return null;
    var entries = [];
    var byScope = Object.create(null);
    var tokens = Object.create(null);
    for (var index = 0; index < items.length; index += 1) {
      var entry = dataValues(items[index], ['vendorScopeFileId', 'vendorToken', 'label']);
      if (!entry || !validToken(entry.vendorScopeFileId) ||
          !own(manifest.vendorScopes, entry.vendorScopeFileId) ||
          !validToken(entry.vendorToken) ||
          !validText(entry.label, schema.LIMITS.MAX_LABEL_LENGTH) ||
          own(byScope, entry.vendorScopeFileId) || own(tokens, entry.vendorToken)) {
        return null;
      }
      var normalized = {
        vendorScopeFileId: entry.vendorScopeFileId,
        vendorToken: entry.vendorToken,
        label: entry.label
      };
      byScope[entry.vendorScopeFileId] = normalized;
      tokens[entry.vendorToken] = true;
      entries.push(normalized);
    }
    var visibleScopes = Object.keys(manifest.vendorScopes);
    if (visibleScopes.some(function(scope) { return !own(byScope, scope); }) ||
        manifest.totalVendors !== entries.length + manifest.vendorOverflow) {
      return null;
    }
    return { entries: entries, byScope: byScope };
  }

  function parseEvaluationContext(value) {
    if (value === null) return null;
    var fields = dataValues(value, ['civilDate', 'digest']);
    if (!fields || !validCivilDate(fields.civilDate) || !validDigest(fields.digest)) return false;
    return { civilDate: fields.civilDate, digest: fields.digest };
  }

  function envelope(authority, mode, currentness, result, body) {
    return {
      version: schema.VERSION,
      generation: authority.generation,
      exactOrigin: authority.exactOrigin,
      profileVersion: authority.profileVersion,
      contextEpoch: authority.contextEpoch,
      semanticEntityToken: authority.semanticEntityToken,
      requestActionToken: authority.requestActionToken,
      projectionToken: authority.projectionToken,
      mode: mode,
      currentness: currentness,
      result: result,
      body: body
    };
  }

  function publicScope(value) {
    var fields = dataValues(value, ['kind', 'label', 'scopeToken']);
    if (!fields || ['agreement', 'vendor', 'corpus'].indexOf(fields.kind) === -1 ||
        !validText(fields.label, schema.LIMITS.MAX_LABEL_LENGTH) ||
        !validToken(fields.scopeToken)) return null;
    return {
      kind: fields.kind,
      label: fields.label,
      scopeToken: fields.scopeToken
    };
  }

  function publicEvidence(value) {
    var fields = dataValues(value, ['claim', 'value', 'trustState', 'citation']);
    var citation = fields && dataValues(fields.citation, ['label', 'actionToken']);
    if (!fields || !citation) return null;
    return {
      claim: fields.claim,
      value: fields.value,
      trustState: fields.trustState,
      citationLabel: citation.label,
      actionToken: citation.actionToken
    };
  }

  function publicEvidenceArray(value, maximum) {
    var items = dataArrayValues(value, maximum);
    if (!items) return null;
    var output = [];
    for (var index = 0; index < items.length; index += 1) {
      var evidence = publicEvidence(items[index]);
      if (!evidence) return null;
      output.push(evidence);
    }
    return output;
  }

  function publicDetails(value, maximum) {
    var items = dataArrayValues(value, maximum);
    if (!items) return null;
    var output = [];
    for (var index = 0; index < items.length; index += 1) {
      var fields = dataValues(items[index], ['type', 'detail']);
      if (!fields) return null;
      output.push({ type: fields.type, detail: fields.detail });
    }
    return output;
  }

  function publicSources(value) {
    var items = dataArrayValues(value, 12);
    if (!items) return null;
    var output = [];
    for (var index = 0; index < items.length; index += 1) {
      var fields = dataValues(items[index], ['label', 'evidenceRole', 'actionToken']);
      if (!fields) return null;
      output.push({
        label: fields.label,
        evidenceRole: fields.evidenceRole,
        actionToken: fields.actionToken
      });
    }
    return output;
  }

  function publicAnswer(value) {
    var fields = dataValues(value, [
      'outcome', 'evidenceComplete', 'conclusion', 'trust', 'governingEvidence',
      'historyEvidence', 'conflicts', 'gaps', 'sources', 'sourceOverflow'
    ]);
    var trust = fields && dataValues(fields.trust, ['state', 'explanation']);
    var governing = fields && publicEvidenceArray(fields.governingEvidence, 8);
    var history = fields && publicEvidenceArray(fields.historyEvidence, 6);
    var conflicts = fields && publicDetails(fields.conflicts, 8);
    var gaps = fields && publicDetails(fields.gaps, 8);
    var sources = fields && publicSources(fields.sources);
    if (!fields || !trust || !governing || !history || !conflicts || !gaps || !sources) return null;
    return {
      outcome: fields.outcome,
      evidenceComplete: fields.evidenceComplete,
      conclusion: fields.conclusion,
      trust: { state: trust.state, explanation: trust.explanation },
      governingEvidence: governing,
      historyEvidence: history,
      conflicts: conflicts,
      gaps: gaps,
      sources: sources,
      sourceOverflow: fields.sourceOverflow
    };
  }

  function publicPolicy(value) {
    if (value === null) return null;
    if (!isPlainRecord(value)) return false;
    var hasMemo = own(value, 'memo');
    var keys = [
      'clearance', 'applicable', 'decisionDigest', 'reasons', 'document10'
    ];
    if (hasMemo) keys.push('memo');
    var fields = dataValues(value, keys);
    if (!fields || fields.applicable !== true) return false;
    var reasons = dataArrayValues(fields.reasons, 8);
    var document10 = dataValues(fields.document10, ['state', 'reviewed']);
    if (!reasons || !document10) return false;
    var output = {
      clearance: fields.clearance,
      reasons: reasons.slice(),
      document10: { state: document10.state, reviewed: document10.reviewed }
    };
    if (hasMemo) {
      var memo = dataValues(fields.memo, ['state', 'satisfied']);
      if (!memo) return false;
      output.memo = { state: memo.state, satisfied: memo.satisfied };
    }
    return output;
  }

  function publicPolicyActions(value) {
    var items = dataArrayValues(value, 8);
    if (!items) return null;
    var output = [];
    for (var index = 0; index < items.length; index += 1) {
      var fields = dataValues(items[index], ['actionId', 'label', 'requiresConfirmation']);
      if (!fields) return null;
      output.push({
        actionId: fields.actionId,
        label: fields.label,
        requiresConfirmation: fields.requiresConfirmation
      });
    }
    output.sort(function(left, right) { return compareText(left.actionId, right.actionId); });
    return output;
  }

  function createAskProjection(input) {
    var fields = dataValues(input, ASK_INPUT_KEYS);
    if (!fields || fields.mode !== 'ask') return null;
    var authority = parseAuthority(fields.authority, 'ask');
    var scope = publicScope(fields.scope);
    if (!authority || !scope) return null;
    return schema.parseProjection(envelope(authority, 'ask', 'current', 'complete', {
      scope: scope,
      question: fields.question,
      state: fields.state,
      error: fields.error
    }));
  }

  function createAnswerProjection(input) {
    var fields = dataValues(input, ANSWER_INPUT_KEYS);
    if (!fields || fields.mode !== 'answer') return null;
    var authority = parseAuthority(fields.authority, 'answer');
    var scope = publicScope(fields.scope);
    var answer = publicAnswer(fields.answer);
    var policy = publicPolicy(fields.policy);
    var policyActions = publicPolicyActions(fields.policyActions);
    if (!authority || !scope || !answer || policy === false || !policyActions) return null;
    return schema.parseProjection(envelope(authority, 'answer', 'current', 'complete', {
      question: fields.question && fields.question.text,
      scope: scope,
      answer: answer,
      policy: policy,
      policyActions: policyActions
    }));
  }

  function closed(authority, reason) {
    return schema.parseProjection(envelope(
      authority,
      'contract-closed',
      'closed',
      'closed',
      { reason: reason }
    ));
  }

  function noDate(state) {
    return {
      state: state,
      type: null,
      civilDate: null,
      displayDate: null,
      trustState: null
    };
  }

  function noConsequence(state) {
    return { state: state, text: null };
  }

  function sourceCounts(sources) {
    var output = {
      indexState: 'complete',
      total: sources.length,
      ready: 0,
      pending: 0,
      unreadable: 0,
      downloadBlocked: 0,
      inaccessible: 0,
      missing: 0
    };
    var hasIncomplete = false;
    var hasPending = false;
    var hasUnevaluated = false;
    for (var index = 0; index < sources.length; index += 1) {
      var source = sources[index];
      if (source.state === 'download-blocked') output.downloadBlocked += 1;
      else output[source.state] += 1;
      if (source.indexState === 'incomplete') hasIncomplete = true;
      else if (source.indexState === 'pending') hasPending = true;
      else if (source.indexState !== 'complete') hasUnevaluated = true;
    }
    output.indexState = hasIncomplete
      ? 'incomplete'
      : hasPending
        ? 'pending'
        : hasUnevaluated
          ? 'not-evaluated'
          : 'complete';
    return output;
  }

  function familyScopes(family, manifest) {
    var scopes = Object.create(null);
    for (var index = 0; index < family.sourceBindings.length; index += 1) {
      var source = manifest.byBinding[family.sourceBindings[index]];
      if (source.vendorScopeFileId !== null) scopes[source.vendorScopeFileId] = true;
    }
    return Object.keys(scopes).sort(compareText);
  }

  function familiesByScope(truth, manifest) {
    var output = Object.create(null);
    var root = [];
    for (var index = 0; index < truth.families.length; index += 1) {
      var family = truth.families[index];
      var scopes = familyScopes(family, manifest);
      if (scopes.length > 1) return null;
      if (scopes.length === 0) root.push(family);
      else {
        if (!own(output, scopes[0])) output[scopes[0]] = [];
        output[scopes[0]].push(family);
      }
    }
    return { byScope: output, root: root };
  }

  function graphEvidenceForScope(scope, graph, manifest) {
    var owners = Object.create(null);
    var memo = false;
    var policy = false;
    for (var index = 0; index < graph.relations.length; index += 1) {
      var relation = graph.relations[index];
      if (!relation.current) continue;
      var from = graph.byToken[relation.fromRecordToken];
      var target = graph.byToken[relation.toRecordToken];
      var fromSource = manifest.byBinding[from.sourceBinding];
      if (!fromSource || fromSource.vendorScopeFileId !== scope) continue;
      if (relation.type === 'assigned-owner' && target.kind === 'owner') {
        owners[target.recordToken] = target.label;
      } else if (relation.type === 'references-memo' && target.kind === 'memo') {
        memo = true;
      } else if (relation.type === 'references-policy' && target.kind === 'policy-document') {
        policy = true;
      }
    }
    return {
      owners: Object.keys(owners).sort(compareText).map(function(recordToken) {
        return owners[recordToken];
      }),
      memo: memo,
      policy: policy
    };
  }

  function governingState(families) {
    var states = families.map(function(family) { return family.governingState; });
    if (states.indexOf('review-required') !== -1) return 'review-required';
    if (states.indexOf('partially-governing') !== -1) return 'partially-governing';
    if (states.indexOf('governing') !== -1) return 'governing';
    return 'not-evaluated';
  }

  function acceptedDateFor(families, evaluationDate) {
    var dates = [];
    for (var familyIndex = 0; familyIndex < families.length; familyIndex += 1) {
      var familyDates = families[familyIndex].materialDates;
      for (var dateIndex = 0; dateIndex < familyDates.length; dateIndex += 1) {
        var candidate = familyDates[dateIndex];
        if (candidate.trustState === 'accepted' && candidate.civilDate > evaluationDate) {
          dates.push(candidate);
        }
      }
    }
    dates.sort(function(left, right) {
      return compareText(left.civilDate, right.civilDate) ||
        DATE_ORDER[left.type] - DATE_ORDER[right.type] ||
        compareText(left.sourceBinding, right.sourceBinding);
    });
    return dates.length === 0 ? null : dates[0];
  }

  function evidenceGapTypes(sources, families, owner, policy) {
    var present = Object.create(null);
    var priorities = Object.create(null);
    for (var familyIndex = 0; familyIndex < families.length; familyIndex += 1) {
      var family = families[familyIndex];
      if (family.finalState === 'proven-missing') present['missing-final'] = true;
      for (var conflictIndex = 0; conflictIndex < family.conflicts.length; conflictIndex += 1) {
        present[family.conflicts[conflictIndex]] = true;
      }
      if (family.governingState === 'review-required') present['version-conflict'] = true;
      for (var priorityIndex = 0; priorityIndex < family.priorityGaps.length; priorityIndex += 1) {
        priorities[family.priorityGaps[priorityIndex]] = true;
      }
    }
    for (var sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
      var source = sources[sourceIndex];
      if (source.state === 'unreadable') present['unreadable-scan'] = true;
      if (source.state === 'download-blocked') present['download-blocked'] = true;
      if (source.state === 'inaccessible') present.inaccessible = true;
      if (source.state === 'pending') present.pending = true;
      if (source.indexState === 'incomplete') present['incomplete-indexing'] = true;
    }
    if (owner === 'unassigned') present['owner-gap'] = true;
    if (policy === 'missing') present['policy-document-missing'] = true;
    return Object.keys(present).sort(function(left, right) {
      return GAP_ORDER[left] - GAP_ORDER[right] || compareText(left, right);
    }).map(function(type) {
      return { type: type, priority: priorities[type] ? 'urgent' : 'normal' };
    });
  }

  function neutralSourceGaps(sources) {
    return evidenceGapTypes(sources, [], 'not-evaluated', 'not-evaluated').filter(function(gap) {
      return gap.type === 'unreadable-scan' || gap.type === 'incomplete-indexing' ||
        gap.type === 'download-blocked' || gap.type === 'inaccessible' || gap.type === 'pending';
    });
  }

  function folderVendor(scope, label, sources, families, graph, manifest, evaluationDate, complete) {
    var documents = sourceCounts(sources);
    if (!complete) {
      var neutralGaps = neutralSourceGaps(sources);
      return {
        vendorToken: label.vendorToken,
        label: label.label,
        owner: { state: 'not-evaluated', label: null },
        documents: documents,
        governingState: 'not-evaluated',
        nextMaterialDate: noDate('not-evaluated'),
        consequence: noConsequence('not-evaluated'),
        memoEvidence: 'not-evaluated',
        policyDocument: 'not-evaluated',
        memoRequirement: 'not-evaluated',
        notificationDelivery: 'not-available',
        gaps: neutralGaps.slice(0, schema.LIMITS.MAX_VENDOR_GAPS),
        gapOverflow: Math.max(0, neutralGaps.length - schema.LIMITS.MAX_VENDOR_GAPS),
        fullGaps: neutralGaps
      };
    }

    var evidence = graphEvidenceForScope(scope, graph, manifest);
    var owner = evidence.owners.length === 1
      ? { state: 'assigned', label: evidence.owners[0] }
      : evidence.owners.length === 0
        ? { state: 'unassigned', label: null }
        : { state: 'not-evaluated', label: null };
    var policy = evidence.policy
      ? 'on-file'
      : families.some(function(family) { return family.policyState === 'proven-missing'; })
        ? 'missing'
        : 'not-evaluated';
    var selected = acceptedDateFor(families, evaluationDate);
    var alerts = families.map(function(family) {
      return family.notificationDelivery;
    }).filter(function(status) { return status !== 'not-available'; });
    alerts.sort(function(left, right) {
      var leftDate = left.alertCivilDate || '9999-12-31';
      var rightDate = right.alertCivilDate || '9999-12-31';
      return compareText(leftDate, rightDate) || compareText(left.summary, right.summary);
    });
    var gaps = evidenceGapTypes(sources, families, owner.state, policy);
    return {
      vendorToken: label.vendorToken,
      label: label.label,
      owner: owner,
      documents: documents,
      governingState: governingState(families),
      nextMaterialDate: selected
        ? {
          state: 'accepted',
          type: selected.type,
          civilDate: selected.civilDate,
          displayDate: selected.displayDate,
          trustState: selected.trustState
        }
        : noDate('none'),
      consequence: selected
        ? { state: 'accepted', text: selected.consequence }
        : noConsequence('none'),
      memoEvidence: evidence.memo ? 'on-file' : 'not-evaluated',
      policyDocument: policy,
      memoRequirement: 'not-evaluated',
      notificationDelivery: alerts[0] || 'not-available',
      gaps: gaps.slice(0, schema.LIMITS.MAX_VENDOR_GAPS),
      gapOverflow: Math.max(0, gaps.length - schema.LIMITS.MAX_VENDOR_GAPS),
      fullGaps: gaps
    };
  }

  function vendorComparator(left, right) {
    var leftPriority = left.governingState === 'review-required' ||
      left.fullGaps.some(function(gap) { return gap.priority === 'urgent'; });
    var rightPriority = right.governingState === 'review-required' ||
      right.fullGaps.some(function(gap) { return gap.priority === 'urgent'; });
    if (leftPriority !== rightPriority) return leftPriority ? -1 : 1;
    var leftDated = left.nextMaterialDate.state === 'accepted';
    var rightDated = right.nextMaterialDate.state === 'accepted';
    if (leftDated !== rightDated) return leftDated ? -1 : 1;
    if (leftDated) {
      var dateOrder = compareText(
        left.nextMaterialDate.civilDate,
        right.nextMaterialDate.civilDate
      ) || DATE_ORDER[left.nextMaterialDate.type] - DATE_ORDER[right.nextMaterialDate.type];
      if (dateOrder) return dateOrder;
    }
    return compareText(left.label.toLowerCase(), right.label.toLowerCase()) ||
      compareText(left.vendorToken, right.vendorToken);
  }

  function publicVendor(value) {
    return {
      vendorToken: value.vendorToken,
      label: value.label,
      owner: value.owner,
      documents: value.documents,
      governingState: value.governingState,
      nextMaterialDate: value.nextMaterialDate,
      consequence: value.consequence,
      memoEvidence: value.memoEvidence,
      policyDocument: value.policyDocument,
      memoRequirement: value.memoRequirement,
      notificationDelivery: value.notificationDelivery,
      gaps: value.gaps,
      gapOverflow: value.gapOverflow
    };
  }

  function exactManifestSet(manifest) {
    return manifest.sourceOverflow === 0 &&
      manifest.totalSources === manifest.sources.length;
  }

  function createFolder(
    authority,
    manifest,
    graph,
    truth,
    labels,
    evaluation,
    familyIndex,
    askScopes
  ) {
    var exactSetWithinCap = manifest.totalSources <= 32 && truth.families.length <= 32 &&
      manifest.totalVendors <= schema.LIMITS.MAX_PROJECTED_VENDORS;
    var complete = manifest.state === 'complete' && graph.state === 'complete' &&
      truth.state === 'complete' && truth.blockers.length === 0 && evaluation &&
      evaluation.digest === truth.evaluationContextDigest && exactSetWithinCap &&
      exactManifestSet(manifest);

    var groups = Object.create(null);
    for (var sourceIndex = 0; sourceIndex < manifest.sources.length; sourceIndex += 1) {
      var source = manifest.sources[sourceIndex];
      if (source.vendorScopeFileId === null) continue;
      if (!own(groups, source.vendorScopeFileId)) groups[source.vendorScopeFileId] = [];
      groups[source.vendorScopeFileId].push(source);
    }
    var scopes = Object.keys(groups).sort(function(left, right) {
      var leftLabel = labels.byScope[left];
      var rightLabel = labels.byScope[right];
      return compareText(leftLabel.label.toLowerCase(), rightLabel.label.toLowerCase()) ||
        compareText(leftLabel.vendorToken, rightLabel.vendorToken);
    });
    scopes = scopes.slice(0, schema.LIMITS.MAX_PROJECTED_VENDORS);

    var vendors = scopes.map(function(scope) {
      return folderVendor(
        scope,
        labels.byScope[scope],
        groups[scope],
        familyIndex.byScope[scope] || [],
        graph,
        manifest,
        evaluation ? evaluation.civilDate : null,
        complete
      );
    });
    vendors.sort(vendorComparator);

    var nextDates = [];
    var urgentGaps = [];
    if (complete) {
      for (var vendorIndex = 0; vendorIndex < vendors.length; vendorIndex += 1) {
        var vendor = vendors[vendorIndex];
        if (vendor.nextMaterialDate.state === 'accepted') {
          nextDates.push({
            vendorToken: vendor.vendorToken,
            vendorLabel: vendor.label,
            date: vendor.nextMaterialDate,
            consequence: vendor.consequence
          });
        }
        for (var gapIndex = 0; gapIndex < vendor.fullGaps.length; gapIndex += 1) {
          if (vendor.fullGaps[gapIndex].priority === 'urgent') {
            urgentGaps.push({
              vendorToken: vendor.vendorToken,
              vendorLabel: vendor.label,
              gap: vendor.fullGaps[gapIndex]
            });
          }
        }
      }
      nextDates.sort(function(left, right) {
        return compareText(left.date.civilDate, right.date.civilDate) ||
          DATE_ORDER[left.date.type] - DATE_ORDER[right.date.type] ||
          compareText(left.vendorToken, right.vendorToken);
      });
      var vendorPosition = Object.create(null);
      for (var position = 0; position < vendors.length; position += 1) {
        vendorPosition[vendors[position].vendorToken] = position;
      }
      urgentGaps.sort(function(left, right) {
        return vendorPosition[left.vendorToken] - vendorPosition[right.vendorToken] ||
          GAP_ORDER[left.gap.type] - GAP_ORDER[right.gap.type] ||
          compareText(left.vendorToken, right.vendorToken);
      });
    }

    var partial = !complete || manifest.totalVendors > vendors.length;
    var vendorCount = manifest.totalVendors;
    var vendorOverflow = Math.max(0, vendorCount - vendors.length);
    var result = partial ? 'partial' : vendorCount === 0 ? 'empty' : 'complete';
    var body = {
      manifestState: partial ? 'partial' : 'complete',
      vendorCount: vendorCount,
      vendors: vendors.map(publicVendor),
      vendorOverflow: vendorOverflow,
      nextMaterialDates: nextDates.slice(0, schema.LIMITS.MAX_SUMMARY_DATES),
      nextMaterialDateOverflow: Math.max(
        0,
        nextDates.length - schema.LIMITS.MAX_SUMMARY_DATES
      ),
      urgentGaps: urgentGaps.slice(0, schema.LIMITS.MAX_SUMMARY_GAPS),
      urgentGapOverflow: Math.max(0, urgentGaps.length - schema.LIMITS.MAX_SUMMARY_GAPS),
      emptyState: partial ? 'not-evaluated' : vendorCount === 0 ? 'complete-empty' : 'not-empty'
    };
    if (askScopes !== null) body.askScopes = askScopes;
    return envelope(authority, 'folder', partial ? 'partial' : 'current', result, body);
  }

  function readingGaps(source, family, complete) {
    if (!complete) return neutralSourceGaps([source]);
    var families = family ? [family] : [];
    var policy = family && family.policyState === 'proven-missing' ? 'missing' : 'not-evaluated';
    return evidenceGapTypes([source], families, 'not-evaluated', policy);
  }

  function createReading(authority, focus, manifest, graph, truth, evaluation, askScopes) {
    var source = manifest.byBinding[focus.sourceBinding];
    if (!source) return null;
    var family = null;
    for (var familyIndex = 0; familyIndex < truth.families.length; familyIndex += 1) {
      if (own(truth.families[familyIndex].familyBindings, focus.sourceBinding)) {
        if (family) return false;
        family = truth.families[familyIndex];
      }
    }
    var complete = manifest.state === 'complete' && graph.state === 'complete' &&
      truth.state === 'complete' && truth.blockers.length === 0 && evaluation &&
      evaluation.digest === truth.evaluationContextDigest && manifest.totalSources <= 32 &&
      truth.families.length <= 32 && exactManifestSet(manifest);
    var reading = complete && family && family.readingBySource[focus.sourceBinding]
      ? family.readingBySource[focus.sourceBinding].state
      : 'not-evaluated';
    var action = complete && family
      ? family.governingAction
      : { state: 'not-available', sourceBinding: null, actionToken: null };
    var facts = complete && family ? family.facts.slice() : [];
    facts.sort(function(left, right) {
      return FACT_ORDER[left.type] - FACT_ORDER[right.type] ||
        compareText(left.evidenceRole, right.evidenceRole) ||
        compareText(left.actionToken, right.actionToken);
    });
    var gaps = readingGaps(source, family, complete);
    var policy = complete && family && family.policyState === 'proven-missing'
      ? 'missing'
      : complete && family && family.policyState === 'on-file'
        ? 'on-file'
        : 'not-evaluated';
    var publicFacts = facts.slice(0, schema.LIMITS.MAX_READING_FACTS).map(function(fact) {
      return {
        type: fact.type,
        value: fact.value,
        evidenceRole: fact.evidenceRole,
        trustState: fact.trustState,
        citationLabel: fact.citationLabel,
        actionToken: fact.actionToken
      };
    });
    var publicGaps = gaps.slice(0, schema.LIMITS.MAX_READING_GAPS);
    var partial = !complete;
    var empty = !partial && publicFacts.length === 0 && publicGaps.length === 0;
    var body = {
        documentLabel: focus.documentLabel,
        sourceState: source.state,
        readingState: reading,
        governingAction: action.state === 'not-available'
          ? { state: 'not-available', actionToken: null }
          : { state: action.state, actionToken: action.actionToken },
        facts: publicFacts,
        factOverflow: Math.max(0, facts.length - schema.LIMITS.MAX_READING_FACTS),
        gaps: publicGaps,
        gapOverflow: Math.max(0, gaps.length - schema.LIMITS.MAX_READING_GAPS),
        policyDocument: policy,
        memoRequirement: 'not-evaluated',
        notificationDelivery: complete && family
          ? family.notificationDelivery
          : 'not-available',
        emptyState: partial ? 'not-evaluated' : empty ? 'complete-empty' : 'not-empty'
      };
    if (askScopes !== null) body.askScopes = askScopes;
    return envelope(authority, 'reading', partial ? 'partial' : 'current',
      partial ? 'partial' : empty ? 'empty' : 'complete', body);
  }

  function serializedBytes(value) {
    var encoded = JSON.stringify(value);
    if (typeof encoded !== 'string') return Infinity;
    if (global && typeof global.TextEncoder === 'function') {
      return new global.TextEncoder().encode(encoded).length;
    }
    return encoded.length * 3;
  }

  function createProjection(input) {
    if (!schema || typeof schema.parseProjection !== 'function') return null;
    try {
      var modeDescriptor = isPlainRecord(input)
        ? Object.getOwnPropertyDescriptor(input, 'mode')
        : null;
      var requestedMode = modeDescriptor && own(modeDescriptor, 'value') &&
        modeDescriptor.enumerable === true
        ? modeDescriptor.value
        : null;
      if (requestedMode === 'ask') return createAskProjection(input);
      if (requestedMode === 'answer') return createAnswerProjection(input);
      var hasAskScopes = isPlainRecord(input) && own(input, 'askScopes');
      var inputKeys = hasAskScopes ? INPUT_KEYS.concat(['askScopes']) : INPUT_KEYS;
      var fields = dataValues(input, inputKeys);
      if (!fields || (fields.mode !== 'folder' && fields.mode !== 'reading')) return null;
      var authority = parseAuthority(fields.authority, fields.mode);
      if (!authority) return null;
      var askScopes = hasAskScopes ? fields.askScopes : null;

      var focus = parseFocus(fields.focus, fields.mode);
      var manifest = parseManifest(fields.manifest);
      if (!focus || !manifest) return closed(authority, 'invalid-input');
      var graph = parseGraph(fields.graph, manifest);
      var truth = parseTruth(fields.truth, manifest);
      var labels = parseVendorLabels(fields.vendorLabels, manifest);
      var evaluation = parseEvaluationContext(fields.evaluationContext);
      if (!graph || !truth || !labels || evaluation === false) {
        return closed(authority, 'invalid-input');
      }
      if (manifest.authorizedSetDigest !== graph.authorizedSetDigest ||
          manifest.authorizedSetDigest !== truth.authorizedSetDigest ||
          (evaluation && evaluation.digest !== truth.evaluationContextDigest)) {
        return closed(authority, 'stale-input');
      }
      var familyIndex = familiesByScope(truth, manifest);
      if (!familyIndex) return closed(authority, 'vendor-scope-ambiguous');

      var candidate = fields.mode === 'folder'
        ? createFolder(
          authority,
          manifest,
          graph,
          truth,
          labels,
          evaluation,
          familyIndex,
          askScopes
        )
        : createReading(authority, focus, manifest, graph, truth, evaluation, askScopes);
      if (candidate === false) return closed(authority, 'vendor-scope-ambiguous');
      if (!candidate) return closed(authority, 'invalid-input');
      if (serializedBytes(candidate) > schema.LIMITS.MAX_SERIALIZED_BYTES) {
        return closed(authority, 'byte-limit-exceeded');
      }
      return schema.parseProjection(candidate) || closed(authority, 'invalid-input');
    } catch (_error) {
      return null;
    }
  }

  var api = Object.freeze({
    VERSION: VERSION,
    createProjection: createProjection
  });

  global.FsbSkopeoHudProjector = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
