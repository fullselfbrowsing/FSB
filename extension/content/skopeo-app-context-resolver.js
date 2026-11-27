// Closed catalog-wide app context resolution with an injected bundled-adapter seam.
(function (global) {
  'use strict';

  var MAX_URL_LENGTH = 2048;
  var MAX_TEXT_LENGTH = 512;
  var MAX_LABEL_LENGTH = 80;
  var MAX_EVIDENCE = 16;
  var MAX_LOCATORS = 8;
  var MAX_PROJECTED_PARAMS = 12;
  var MAX_SOURCE_PARAMS = 32;

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Reflect.ownKeys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  var STATUS = deepFreeze({
    RECOGNIZED: 'recognized',
    UNCERTAIN: 'uncertain',
    UNSUPPORTED: 'unsupported'
  });

  var REASON = deepFreeze({
    NO_STABLE_ENTITY: 'no-stable-entity',
    RESOLVER_DISPOSED: 'resolver-disposed',
    PROJECTION_INVALID: 'projection-invalid',
    PROJECTION_STALE: 'projection-stale',
    REQUEST_INVALID: 'request-invalid',
    ORIGIN_MISMATCH: 'origin-mismatch',
    ADAPTER_EVIDENCE_INVALID: 'adapter-evidence-invalid',
    ADAPTER_FAILED: 'adapter-failed',
    ADAPTER_RESULT_INVALID: 'adapter-result-invalid'
  });

  var GENRES = new Set([
    'reader-knowledge',
    'communication',
    'document-editor',
    'worklist-record',
    'dashboard-admin',
    'transactional',
    'media-feed',
    'generic-app',
    'drive-docs-deep-pack'
  ]);
  var ADAPTER_GENRE = deepFreeze({
    'generic-unanchored-v1': 'generic-app',
    'reader-knowledge-v1': 'reader-knowledge',
    'communication-v1': 'communication',
    'document-editor-v1': 'document-editor',
    'worklist-record-v1': 'worklist-record',
    'dashboard-admin-v1': 'dashboard-admin',
    'transactional-v1': 'transactional',
    'media-feed-v1': 'media-feed',
    'drive-docs-deep-pack-v1': 'drive-docs-deep-pack'
  });
  var RENDERERS = new Set([
    'generic-default-v1',
    'reader-knowledge-v1',
    'communication-v1',
    'document-editor-v1',
    'worklist-record-v1',
    'dashboard-admin-v1',
    'transactional-v1',
    'media-feed-v1',
    'drive-docs-deep-pack-v1'
  ]);
  var EVIDENCE_SIGNALS = new Set([
    'url-path',
    'visible-heading',
    'visible-label',
    'css-selector',
    'css-class',
    'dom-shape',
    'list-position',
    'exact-origin',
    'trusted-context-kind',
    'drive-item-id',
    'docs-document-id',
    'opaque-target-key'
  ]);
  var OUTPUT_EVIDENCE_SIGNALS = new Set([
    'exact-origin',
    'trusted-context-kind',
    'drive-item-id',
    'docs-document-id',
    'opaque-target-key'
  ]);
  var IDENTITY_LOCATOR = deepFreeze({
    'drive-folder': 'drive-item-id',
    'drive-file': 'drive-item-id',
    'docs-document': 'docs-document-id',
    'opaque-target': 'opaque-target-key'
  });
  var LOCATOR_KINDS = new Set(Object.values(IDENTITY_LOCATOR));
  var VALIDATORS = new Set(['semantic-identity', 'connected', 'geometry']);
  var ADAPTER_RESULT_KINDS = new Set(['stable-entity', 'drive-docs-deep-pack']);
  var EXECUTION_BLOCK_REASONS = new Set([
    'source-not-ready',
    'execution-authority-unavailable',
    'execution-origin-mismatch'
  ]);
  var ACTIONABILITY_REASONS = new Set([
    'source-not-ready',
    'argument-contract-unsupported',
    'execution-authority-unavailable',
    'consequence-contract-pending',
    'consequence-contract-missing',
    'consequence-contract-invalid',
    'accepted-field-unregistered',
    'exclusion-invalid',
    'target-role-invalid',
    'material-unrepresentable'
  ]);
  var CONSEQUENCE_FAILURE_REASONS = new Set([
    'consequence-contract-missing',
    'consequence-contract-invalid',
    'accepted-field-unregistered',
    'exclusion-invalid',
    'target-role-invalid',
    'material-unrepresentable'
  ]);
  var EFFECT_BY_SIDE_EFFECT = deepFreeze({
    read: 'read-only',
    write: 'changes-service-data',
    destructive: 'removes-service-data'
  });
  var RESULT_KEYS = [
    'status',
    'generation',
    'exactOrigin',
    'profileId',
    'profileVersion',
    'contextEpoch',
    'app',
    'genre',
    'lens',
    'semanticEntity',
    'anchorDescriptor',
    'capabilityGroups',
    'risk',
    'reason',
    'evidence'
  ];
  var FAILURE_KEYS = ['status', 'generation', 'contextEpoch', 'reason', 'retryable'];
  var ADAPTER_RESULT_KEYS = [
    'adapterId',
    'kind',
    'generation',
    'exactOrigin',
    'profileId',
    'profileVersion',
    'contextEpoch',
    'genre',
    'semanticEntity',
    'anchorDescriptor',
    'evidence'
  ];

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function hasExactKeys(value, expected) {
    if (!isPlainObject(value)) return false;
    var keys = Reflect.ownKeys(value);
    if (keys.length !== expected.length || keys.some(function (key) { return typeof key !== 'string'; })) {
      return false;
    }
    var expectedSet = new Set(expected);
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!expectedSet.has(key) || !descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.enumerable !== true) {
        return false;
      }
    }
    return true;
  }

  function profileSchemaApi() {
    if (global.FsbSkopeoProfileSchema &&
        typeof global.FsbSkopeoProfileSchema.validateArgumentContract === 'function') {
      return global.FsbSkopeoProfileSchema;
    }
    if (typeof require === 'function') {
      try {
        var api = require('../utils/skopeo-profile-schema.js');
        if (api && typeof api.validateArgumentContract === 'function') return api;
      } catch (_error) {
        return null;
      }
    }
    return null;
  }

  function isPositiveSafeInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  function isBoundedText(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]/.test(value);
  }

  function isBoundedEvidenceText(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT_LENGTH &&
      !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value);
  }

  function isIdentifier(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
      /^[a-z0-9][A-Za-z0-9._-]*$/.test(value);
  }

  function isLens(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 64 &&
      /^[a-z0-9][a-z0-9-]*$/.test(value);
  }

  function isDeepFrozenData(value, state) {
    if (value === null || typeof value === 'string' || typeof value === 'number' ||
        typeof value === 'boolean') {
      return true;
    }
    if (!value || typeof value !== 'object' || !Object.isFrozen(value)) return false;
    var tracking = state || { visiting: new Set(), complete: new Set() };
    if (tracking.complete.has(value)) return true;
    if (tracking.visiting.has(value)) return false;
    var array = Array.isArray(value);
    if (!array && !isPlainObject(value)) return false;
    tracking.visiting.add(value);
    var keys = Reflect.ownKeys(value);
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      if (array && key === 'length') continue;
      if (typeof key !== 'string') return false;
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.enumerable !== true || !isDeepFrozenData(descriptor.value, tracking)) {
        return false;
      }
    }
    tracking.visiting.delete(value);
    tracking.complete.add(value);
    return true;
  }

  function parseHttpsUrl(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LENGTH) return null;
    try {
      var parsed = new URL(value);
      if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '' ||
          parsed.port !== '') {
        return null;
      }
      return parsed;
    } catch (_error) {
      return null;
    }
  }

  function exactHttpsOrigin(value) {
    var parsed = parseHttpsUrl(value);
    return !!parsed && parsed.origin === value && parsed.pathname === '/' &&
      parsed.search === '' && parsed.hash === '';
  }

  function looksLikePageAddress(value) {
    return /^[.#\[*+>~:]|\[(?:style|role|data-[^\]]+)\s*[~|^$*]?=/i.test(String(value));
  }

  function projectionMatchesLoadedCatalog(projection) {
    var index = global.FsbSkopeoProfileIndex;
    if (index === undefined) return true;
    if (!isPlainObject(index) || index.profileVersion !== projection.profileVersion ||
        index.catalogVersion !== projection.catalogVersion || !Array.isArray(index.profiles)) {
      return false;
    }
    var profileKey = projection.appStem + '@' + projection.service;
    var matches = index.profiles.filter(function (profile) {
      return isPlainObject(profile) && profile.profileKey === profileKey &&
        Array.isArray(profile.admittedPageOrigins) &&
        profile.admittedPageOrigins.indexOf(projection.exactOrigin) !== -1;
    });
    if (matches.length !== 1) return false;
    var source = matches[0];
    return source.profileId === projection.profileId &&
      source.profileVersion === projection.profileVersion &&
      source.catalogVersion === projection.catalogVersion &&
      source.profileDisposition === projection.profile.profileDisposition &&
      source.displayName === projection.profile.displayName &&
      source.defaultGenre === projection.profile.defaultGenre &&
      source.pageNoun === projection.profile.pageNoun &&
      source.attentionCeiling === projection.profile.attentionCeiling &&
      source.adapterId === projection.profile.adapterId &&
      source.rendererId === projection.profile.rendererId;
  }

  function projectionIsCoherent(projection) {
    if (!isDeepFrozenData(projection)) return false;
    var projector = global.FsbSkopeoCapabilityProjector;
    if (!projector || typeof projector.validateProjection !== 'function') return false;
    try {
      if (projector.validateProjection(projection) !== true) return false;
    } catch (_error) {
      return false;
    }
    var profile = projection.profile;
    if (!GENRES.has(profile.defaultGenre) || ADAPTER_GENRE[profile.adapterId] !== profile.defaultGenre ||
        !RENDERERS.has(profile.rendererId)) {
      return false;
    }
    if (profile.profileDisposition === 'generic-default' &&
        (projection.profileId !== 'generic-unanchored-v1' ||
         profile.adapterId !== 'generic-unanchored-v1' ||
         profile.rendererId !== 'generic-default-v1' ||
         profile.defaultGenre !== 'generic-app' || profile.attentionCeiling !== 'ambient')) {
      return false;
    }
    return projectionMatchesLoadedCatalog(projection);
  }

  function normalizeEvidence(value) {
    if (!Array.isArray(value) || value.length > MAX_EVIDENCE) return null;
    var normalized = [];
    var pairs = new Set();
    for (var index = 0; index < value.length; index += 1) {
      var item = value[index];
      if (!hasExactKeys(item, ['signal', 'value']) || !EVIDENCE_SIGNALS.has(item.signal) ||
          !isBoundedEvidenceText(item.value)) {
        return null;
      }
      var pair = item.signal + '\u0000' + item.value;
      if (pairs.has(pair)) return null;
      pairs.add(pair);
      normalized.push(Object.freeze({ signal: item.signal, value: item.value }));
    }
    return Object.freeze(normalized);
  }

  function appFromProjection(projection) {
    return Object.freeze({
      appStem: projection.appStem,
      service: projection.service,
      displayName: projection.profile.displayName,
      pageNoun: projection.profile.pageNoun
    });
  }

  function riskFromGroups(groups) {
    var readCount = 0;
    var writeCount = 0;
    var destructiveCount = 0;
    for (var groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      var capabilities = groups[groupIndex].capabilities;
      for (var capabilityIndex = 0; capabilityIndex < capabilities.length; capabilityIndex += 1) {
        var sideEffectClass = capabilities[capabilityIndex].sideEffectClass;
        if (sideEffectClass === 'read') readCount += 1;
        else if (sideEffectClass === 'write') writeCount += 1;
        else if (sideEffectClass === 'destructive') destructiveCount += 1;
      }
    }
    return Object.freeze({
      highest: destructiveCount > 0 ? 'destructive' : (writeCount > 0 ? 'write' : 'read'),
      readCount: readCount,
      writeCount: writeCount,
      destructiveCount: destructiveCount
    });
  }

  function failure(status, generation, contextEpoch, reason) {
    return deepFreeze({
      status: status,
      generation: generation,
      contextEpoch: contextEpoch,
      reason: reason,
      retryable: status === STATUS.UNCERTAIN
    });
  }

  function unanchoredResult(projection, contextEpoch, app, lens, risk) {
    return deepFreeze({
      status: STATUS.RECOGNIZED,
      generation: projection.generation,
      exactOrigin: projection.exactOrigin,
      profileId: projection.profileId,
      profileVersion: projection.profileVersion,
      contextEpoch: contextEpoch,
      app: app,
      genre: projection.profile.defaultGenre,
      lens: lens,
      semanticEntity: null,
      anchorDescriptor: null,
      capabilityGroups: projection.capabilityGroups,
      risk: risk,
      reason: REASON.NO_STABLE_ENTITY,
      evidence: Object.freeze([])
    });
  }

  function normalizeEntity(value) {
    if (!hasExactKeys(value, ['kind', 'id', 'label']) || !IDENTITY_LOCATOR[value.kind] ||
        !isBoundedText(value.id, MAX_TEXT_LENGTH) || !isBoundedText(value.label, MAX_LABEL_LENGTH) ||
        looksLikePageAddress(value.id)) {
      return null;
    }
    return Object.freeze({ kind: value.kind, id: value.id, label: value.label });
  }

  function normalizeAdapterAnchor(value, entity, contextEpoch) {
    if (!hasExactKeys(value, ['anchorId', 'candidateLocators', 'validators']) ||
        !isBoundedText(value.anchorId, MAX_TEXT_LENGTH) || looksLikePageAddress(value.anchorId) ||
        value.anchorId !== entity.kind + ':' + entity.id || !Array.isArray(value.candidateLocators) ||
        value.candidateLocators.length === 0 || value.candidateLocators.length > MAX_LOCATORS ||
        !Array.isArray(value.validators) || value.validators.length !== VALIDATORS.size) {
      return null;
    }
    var locators = [];
    var locatorKinds = new Set();
    var locatorPairs = new Set();
    for (var index = 0; index < value.candidateLocators.length; index += 1) {
      var locator = value.candidateLocators[index];
      if (!hasExactKeys(locator, ['kind', 'value']) || !LOCATOR_KINDS.has(locator.kind) ||
          !isBoundedText(locator.value, MAX_TEXT_LENGTH) || looksLikePageAddress(locator.value) ||
          locatorKinds.has(locator.kind) || locatorPairs.has(locator.kind + '\u0000' + locator.value)) {
        return null;
      }
      locatorKinds.add(locator.kind);
      locatorPairs.add(locator.kind + '\u0000' + locator.value);
      locators.push(Object.freeze({ kind: locator.kind, value: locator.value }));
    }
    var requiredLocator = IDENTITY_LOCATOR[entity.kind];
    if (!locators.some(function (locator) {
      return locator.kind === requiredLocator && locator.value === entity.id;
    })) {
      return null;
    }
    var validators = [];
    var seenValidators = new Set();
    for (var validatorIndex = 0; validatorIndex < value.validators.length; validatorIndex += 1) {
      var validator = value.validators[validatorIndex];
      if (!VALIDATORS.has(validator) || seenValidators.has(validator)) return null;
      seenValidators.add(validator);
      validators.push(validator);
    }
    if (seenValidators.size !== VALIDATORS.size) return null;
    return deepFreeze({
      anchorId: value.anchorId,
      contextEpoch: contextEpoch,
      semanticIdentity: { kind: entity.kind, id: entity.id },
      candidateLocators: locators,
      validators: validators
    });
  }

  function evidenceHasStableIdentity(evidence, entity, exactOrigin) {
    var requiredSignal = IDENTITY_LOCATOR[entity.kind];
    var originProven = false;
    var identityProven = false;
    for (var index = 0; index < evidence.length; index += 1) {
      var item = evidence[index];
      if (item.signal === 'exact-origin' && item.value === exactOrigin) originProven = true;
      if (item.signal === requiredSignal && item.value === entity.id) identityProven = true;
    }
    return originProven && identityProven;
  }

  function normalizeAdapterResult(value, projection, contextEpoch) {
    if (!isDeepFrozenData(value) || !hasExactKeys(value, ADAPTER_RESULT_KEYS) ||
        value.adapterId !== projection.profile.adapterId || !ADAPTER_RESULT_KINDS.has(value.kind) ||
        value.generation !== projection.generation || value.exactOrigin !== projection.exactOrigin ||
        value.profileId !== projection.profileId || value.profileVersion !== projection.profileVersion ||
        value.contextEpoch !== contextEpoch || !GENRES.has(value.genre)) {
      return { state: 'invalid' };
    }
    if (value.kind === 'drive-docs-deep-pack' &&
        (value.adapterId !== 'drive-docs-deep-pack-v1' || value.genre !== 'drive-docs-deep-pack')) {
      return { state: 'invalid' };
    }
    var entity = normalizeEntity(value.semanticEntity);
    var anchor = entity ? normalizeAdapterAnchor(value.anchorDescriptor, entity, contextEpoch) : null;
    var evidence = normalizeEvidence(value.evidence);
    if (!entity || !anchor || !evidence) return { state: 'invalid' };
    if (!evidenceHasStableIdentity(evidence, entity, projection.exactOrigin)) {
      return { state: 'unstable' };
    }
    var outputEvidence = evidence.filter(function (item) {
      return OUTPUT_EVIDENCE_SIGNALS.has(item.signal);
    });
    return {
      state: 'recognized',
      genre: value.genre,
      entity: entity,
      anchor: anchor,
      evidence: Object.freeze(outputEvidence)
    };
  }

  function stableResult(projection, contextEpoch, app, lens, risk, adapter) {
    return deepFreeze({
      status: STATUS.RECOGNIZED,
      generation: projection.generation,
      exactOrigin: projection.exactOrigin,
      profileId: projection.profileId,
      profileVersion: projection.profileVersion,
      contextEpoch: contextEpoch,
      app: app,
      genre: adapter.genre,
      lens: lens,
      semanticEntity: adapter.entity,
      anchorDescriptor: adapter.anchor,
      capabilityGroups: projection.capabilityGroups,
      risk: risk,
      reason: null,
      evidence: adapter.evidence
    });
  }

  function requestParts(value) {
    if (!isPlainObject(value)) return null;
    var keys = Reflect.ownKeys(value);
    if (keys.some(function (key) {
      return typeof key !== 'string' || !['url', 'requestedLens', 'adapterEvidence'].includes(key);
    }) || !keys.includes('url')) {
      return null;
    }
    for (var index = 0; index < keys.length; index += 1) {
      var descriptor = Object.getOwnPropertyDescriptor(value, keys[index]);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.enumerable !== true) return null;
    }
    var lens = value.requestedLens === undefined ? 'app-actions' : value.requestedLens;
    var evidence = value.adapterEvidence === undefined ? [] : value.adapterEvidence;
    if (!isLens(lens)) return null;
    return { url: value.url, lens: lens, evidence: evidence };
  }

  function createResolver(options) {
    if (!hasExactKeys(options, ['generation', 'projection', 'resolveAdapter']) ||
        !isPositiveSafeInteger(options.generation) || typeof options.resolveAdapter !== 'function') {
      throw new TypeError('createResolver requires generation, projection, and resolveAdapter');
    }
    var generation = options.generation;
    var projection = options.projection;
    var resolveAdapter = options.resolveAdapter;
    var projectionValid = projectionIsCoherent(projection);
    var projectionSnapshot = projectionValid ? Object.freeze({
      generation: projection.generation,
      exactOrigin: projection.exactOrigin,
      profileId: projection.profileId,
      profileVersion: projection.profileVersion,
      catalogVersion: projection.catalogVersion,
      appStem: projection.appStem,
      service: projection.service,
      adapterId: projection.profile.adapterId
    }) : null;
    var contextEpoch = 0;
    var disposed = false;

    function advanceEpoch() {
      contextEpoch += 1;
      if (!isPositiveSafeInteger(contextEpoch)) {
        disposed = true;
        throw new Error('app context epoch exhausted');
      }
      return contextEpoch;
    }

    function projectionIsCurrent() {
      return projectionValid && projectionSnapshot && Object.isFrozen(projection) &&
        projection.generation === projectionSnapshot.generation &&
        projection.exactOrigin === projectionSnapshot.exactOrigin &&
        projection.profileId === projectionSnapshot.profileId &&
        projection.profileVersion === projectionSnapshot.profileVersion &&
        projection.catalogVersion === projectionSnapshot.catalogVersion &&
        projection.appStem === projectionSnapshot.appStem && projection.service === projectionSnapshot.service &&
        projection.profile.adapterId === projectionSnapshot.adapterId;
    }

    function resolve(request) {
      var epoch = advanceEpoch();
      if (disposed) return failure(STATUS.UNSUPPORTED, generation, epoch, REASON.RESOLVER_DISPOSED);
      if (!projectionValid) {
        return failure(STATUS.UNSUPPORTED, generation, epoch, REASON.PROJECTION_INVALID);
      }
      if (projection.generation !== generation) {
        return failure(STATUS.UNSUPPORTED, generation, epoch, REASON.PROJECTION_STALE);
      }
      if (!projectionIsCurrent()) {
        return failure(STATUS.UNSUPPORTED, generation, epoch, REASON.PROJECTION_INVALID);
      }
      var parts = requestParts(request);
      if (!parts) return failure(STATUS.UNCERTAIN, generation, epoch, REASON.REQUEST_INVALID);
      var currentUrl = parseHttpsUrl(parts.url);
      if (!currentUrl || currentUrl.origin !== projection.exactOrigin) {
        return failure(STATUS.UNSUPPORTED, generation, epoch, REASON.ORIGIN_MISMATCH);
      }
      var evidence = normalizeEvidence(parts.evidence);
      if (!evidence) {
        return failure(STATUS.UNCERTAIN, generation, epoch, REASON.ADAPTER_EVIDENCE_INVALID);
      }
      var app = appFromProjection(projection);
      var risk = riskFromGroups(projection.capabilityGroups);
      var closedInput = deepFreeze({
        generation: projection.generation,
        exactOrigin: projection.exactOrigin,
        service: projection.service,
        appStem: projection.appStem,
        profileId: projection.profileId,
        profileVersion: projection.profileVersion,
        contextEpoch: epoch,
        url: parts.url,
        app: app,
        genre: projection.profile.defaultGenre,
        requestedLens: parts.lens,
        adapterEvidence: evidence,
        capabilityGroups: projection.capabilityGroups,
        risk: risk
      });
      var adapterValue;
      try {
        // Plan 05 owns the adapter registry; this layer owns its exact injected boundary.
        adapterValue = resolveAdapter(projection.profile.adapterId, closedInput);
      } catch (_error) {
        return failure(STATUS.UNCERTAIN, generation, epoch, REASON.ADAPTER_FAILED);
      }
      if (adapterValue === null || adapterValue === undefined) {
        return unanchoredResult(projection, epoch, app, parts.lens, risk);
      }
      if (projection.profile.adapterId === 'generic-unanchored-v1') {
        return failure(STATUS.UNCERTAIN, generation, epoch, REASON.ADAPTER_RESULT_INVALID);
      }
      var adapter = normalizeAdapterResult(adapterValue, projection, epoch);
      if (adapter.state === 'unstable') {
        return failure(STATUS.UNCERTAIN, generation, epoch, REASON.NO_STABLE_ENTITY);
      }
      if (adapter.state !== 'recognized') {
        return failure(STATUS.UNCERTAIN, generation, epoch, REASON.ADAPTER_RESULT_INVALID);
      }
      return stableResult(projection, epoch, app, parts.lens, risk, adapter);
    }

    function currentEpoch() {
      return contextEpoch;
    }

    function dispose() {
      disposed = true;
      return true;
    }

    return Object.freeze({ resolve: resolve, currentEpoch: currentEpoch, dispose: dispose });
  }

  function validateParamNames(value, seen) {
    if (!Array.isArray(value) || value.length > MAX_PROJECTED_PARAMS) return false;
    for (var index = 0; index < value.length; index += 1) {
      var name = value[index];
      if (!isBoundedText(name, MAX_LABEL_LENGTH) || !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name) ||
          seen.has(name)) {
        return false;
      }
      seen.add(name);
    }
    return true;
  }

  function validateParamSummary(value) {
    if (!hasExactKeys(value, ['count', 'required', 'optional', 'truncated']) ||
        !Number.isSafeInteger(value.count) || value.count < 0 || value.count > MAX_SOURCE_PARAMS ||
        typeof value.truncated !== 'boolean') {
      return false;
    }
    var names = new Set();
    if (!validateParamNames(value.required, names) || !validateParamNames(value.optional, names) ||
        names.size > MAX_PROJECTED_PARAMS || names.size > value.count) {
      return false;
    }
    return value.truncated === (names.size < value.count);
  }

  function validateCapabilityGroups(value, exactOrigin, appStem) {
    if (!Array.isArray(value) || value.length === 0 || value.length > 12) return false;
    var groups = new Set();
    var slugs = new Set();
    var count = 0;
    for (var groupIndex = 0; groupIndex < value.length; groupIndex += 1) {
      var group = value[groupIndex];
      if (!hasExactKeys(group, ['id', 'label', 'capabilities']) || !isIdentifier(group.id) ||
          !isBoundedText(group.label, MAX_LABEL_LENGTH) || groups.has(group.id) ||
          !Array.isArray(group.capabilities) || group.capabilities.length === 0) return false;
      groups.add(group.id);
      for (var capabilityIndex = 0; capabilityIndex < group.capabilities.length; capabilityIndex += 1) {
        var capability = group.capabilities[capabilityIndex];
        if (!hasExactKeys(capability, [
          'slug', 'actionLabel', 'effect', 'sideEffectClass', 'executionOrigin', 'schemaDigest',
          'executionBlockReason', 'paramSummary', 'argumentContract', 'consequenceCompatible',
          'consequenceDigest', 'actionabilityReason',
          'sourceReadiness', 'sourceTerminalState', 'surfaceStatus', 'presentationDisposition',
          'executionEnabled', 'invocable'
        ]) || !isIdentifier(capability.slug) || !isBoundedText(capability.actionLabel, MAX_LABEL_LENGTH) ||
            capability.slug.split('.')[0] !== appStem ||
            !Object.prototype.hasOwnProperty.call(EFFECT_BY_SIDE_EFFECT, capability.sideEffectClass) ||
            capability.effect !== EFFECT_BY_SIDE_EFFECT[capability.sideEffectClass] ||
            !validateParamSummary(capability.paramSummary) ||
            !isBoundedText(capability.sourceReadiness, 64) ||
            !isBoundedText(capability.sourceTerminalState, 64) ||
            !isBoundedText(capability.surfaceStatus, 64) ||
            !isBoundedText(capability.presentationDisposition, 64) ||
            typeof capability.executionEnabled !== 'boolean' || typeof capability.invocable !== 'boolean' ||
            slugs.has(capability.slug)) return false;
        var hasExecutionAuthority = typeof capability.executionOrigin === 'string' &&
          typeof capability.schemaDigest === 'string';
        var consequenceDigestValid = typeof capability.consequenceDigest === 'string' &&
          /^sha256:[0-9a-f]{64}$/.test(capability.consequenceDigest);
        var profileSchema = profileSchemaApi();
        if ((capability.executionOrigin === null) !== (capability.schemaDigest === null) ||
            (hasExecutionAuthority && (!exactHttpsOrigin(capability.executionOrigin) ||
              !/^sha256:[0-9a-f]{64}$/.test(capability.schemaDigest))) ||
            (!hasExecutionAuthority && capability.executionOrigin !== null) ||
            typeof capability.consequenceCompatible !== 'boolean' ||
            capability.consequenceCompatible !== consequenceDigestValid ||
            (capability.sideEffectClass === 'read' &&
              (capability.consequenceCompatible || capability.consequenceDigest !== null)) ||
            (capability.sideEffectClass !== 'read' && !capability.consequenceCompatible &&
              capability.consequenceDigest !== null) ||
            (capability.executionBlockReason !== null &&
              !EXECUTION_BLOCK_REASONS.has(capability.executionBlockReason)) ||
            !(capability.actionabilityReason === null ||
              ACTIONABILITY_REASONS.has(capability.actionabilityReason)) ||
            !profileSchema || typeof profileSchema.validateArgumentContract !== 'function' ||
            profileSchema.validateArgumentContract(capability.argumentContract) !== true ||
            (hasExecutionAuthority &&
              capability.argumentContract.schemaDigest !== capability.schemaDigest) ||
            (!hasExecutionAuthority && capability.argumentContract.schemaDigest !== null) ||
            capability.executionEnabled !== capability.invocable) {
          return false;
        }
        var sourceReady = capability.sourceReadiness === 't1-ready' &&
          capability.sourceTerminalState === 't1-ready' && capability.surfaceStatus === 't1-ready';
        var argumentsCollectable = capability.argumentContract.mode === 'empty' ||
          capability.argumentContract.mode === 'form';
        var consequenceReady = capability.sideEffectClass === 'read' || capability.consequenceCompatible;
        var catalogReady = sourceReady && hasExecutionAuthority && argumentsCollectable &&
          consequenceReady && capability.actionabilityReason === null;
        if (sourceReady && !catalogReady) {
          var expectedActionabilityReason = null;
          if (!hasExecutionAuthority || !argumentsCollectable) {
            expectedActionabilityReason = capability.argumentContract.reason ||
              'argument-contract-unsupported';
          } else if (!consequenceReady) {
            expectedActionabilityReason = CONSEQUENCE_FAILURE_REASONS.has(capability.actionabilityReason)
              ? capability.actionabilityReason
              : 'consequence-contract-missing';
          }
          if (capability.presentationDisposition !== 'unsupported' ||
              capability.actionabilityReason !== expectedActionabilityReason) return false;
        } else if (sourceReady &&
            (capability.presentationDisposition !== 't1-ready' ||
              capability.actionabilityReason !== null)) {
          return false;
        } else if (!sourceReady &&
            (capability.presentationDisposition === 't1-ready' ||
              capability.actionabilityReason !== 'source-not-ready')) {
          return false;
        }
        var actionable = catalogReady && capability.executionOrigin === exactOrigin &&
          capability.executionBlockReason === null;
        if (capability.executionEnabled !== actionable ||
            (!actionable && catalogReady &&
              capability.executionBlockReason !== 'execution-origin-mismatch') ||
            (!catalogReady && capability.executionBlockReason !== 'source-not-ready')) {
          return false;
        }
        slugs.add(capability.slug);
        count += 1;
      }
    }
    return count > 0 && count <= 256;
  }

  function validateRisk(value, groups) {
    if (!hasExactKeys(value, ['highest', 'readCount', 'writeCount', 'destructiveCount'])) return false;
    var expected = riskFromGroups(groups);
    return value.highest === expected.highest && value.readCount === expected.readCount &&
      value.writeCount === expected.writeCount && value.destructiveCount === expected.destructiveCount;
  }

  function validateOutputAnchor(value, entity, contextEpoch) {
    if (!hasExactKeys(value, [
      'anchorId', 'contextEpoch', 'semanticIdentity', 'candidateLocators', 'validators'
    ]) || value.contextEpoch !== contextEpoch ||
        !hasExactKeys(value.semanticIdentity, ['kind', 'id']) ||
        value.semanticIdentity.kind !== entity.kind || value.semanticIdentity.id !== entity.id) {
      return false;
    }
    return !!normalizeAdapterAnchor({
      anchorId: value.anchorId,
      candidateLocators: value.candidateLocators,
      validators: value.validators
    }, entity, contextEpoch);
  }

  function validateAuthority(value) {
    return hasExactKeys(value, ['generation', 'exactOrigin', 'profileId', 'profileVersion', 'contextEpoch']) &&
      isPositiveSafeInteger(value.generation) && exactHttpsOrigin(value.exactOrigin) &&
      isIdentifier(value.profileId) && isBoundedText(value.profileVersion, 128) &&
      isPositiveSafeInteger(value.contextEpoch);
  }

  function validateResult(value, authority) {
    try {
      if (!isDeepFrozenData(value)) return false;
      if (value.status === STATUS.UNCERTAIN || value.status === STATUS.UNSUPPORTED) {
        if (!hasExactKeys(value, FAILURE_KEYS) || !isPositiveSafeInteger(value.generation) ||
            !isPositiveSafeInteger(value.contextEpoch) || !Object.values(REASON).includes(value.reason) ||
            value.retryable !== (value.status === STATUS.UNCERTAIN)) return false;
        if (authority !== undefined) {
          if (!validateAuthority(authority) || value.generation !== authority.generation ||
              value.contextEpoch !== authority.contextEpoch) return false;
        }
        return true;
      }
      if (!hasExactKeys(value, RESULT_KEYS) || value.status !== STATUS.RECOGNIZED ||
          !isPositiveSafeInteger(value.generation) || !exactHttpsOrigin(value.exactOrigin) ||
          !isIdentifier(value.profileId) || !isBoundedText(value.profileVersion, 128) ||
          !isPositiveSafeInteger(value.contextEpoch) ||
          !hasExactKeys(value.app, ['appStem', 'service', 'displayName', 'pageNoun']) ||
          !isIdentifier(value.app.appStem) || !isBoundedText(value.app.service, 253) ||
          !isBoundedText(value.app.displayName, MAX_LABEL_LENGTH) ||
          !isBoundedText(value.app.pageNoun, 32) || !GENRES.has(value.genre) || !isLens(value.lens) ||
          !validateCapabilityGroups(value.capabilityGroups, value.exactOrigin, value.app.appStem) ||
          !validateRisk(value.risk, value.capabilityGroups)) {
        return false;
      }
      var parsedOrigin = parseHttpsUrl(value.exactOrigin);
      if (!parsedOrigin || parsedOrigin.hostname !== value.app.service) return false;
      var evidence = normalizeEvidence(value.evidence);
      if (!evidence || evidence.some(function (item) { return !OUTPUT_EVIDENCE_SIGNALS.has(item.signal); })) {
        return false;
      }
      if (value.semanticEntity === null) {
        if (value.anchorDescriptor !== null || value.reason !== REASON.NO_STABLE_ENTITY || evidence.length !== 0) {
          return false;
        }
      } else {
        var entity = normalizeEntity(value.semanticEntity);
        if (!entity || value.reason !== null || !validateOutputAnchor(
          value.anchorDescriptor, entity, value.contextEpoch
        ) || !evidenceHasStableIdentity(evidence, entity, value.exactOrigin)) return false;
      }
      if (authority !== undefined) {
        if (!validateAuthority(authority) || value.generation !== authority.generation ||
            value.exactOrigin !== authority.exactOrigin || value.profileId !== authority.profileId ||
            value.profileVersion !== authority.profileVersion || value.contextEpoch !== authority.contextEpoch) {
          return false;
        }
      }
      return true;
    } catch (_error) {
      return false;
    }
  }

  var api = deepFreeze({
    STATUS: STATUS,
    REASON: REASON,
    createResolver: createResolver,
    validateResult: validateResult
  });

  global.FSBSkopeoAppContextResolver = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
