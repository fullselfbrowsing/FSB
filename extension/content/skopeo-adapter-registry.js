// Closed, bundled Skopeo adapters for catalog genres and stable semantic evidence.
(function (global) {
  'use strict';

  var MAX_URL_LENGTH = 4096;
  var MAX_TEXT_LENGTH = 512;
  var MAX_LABEL_LENGTH = 80;
  var MAX_EVIDENCE = 8;
  var INPUT_KEYS = Object.freeze([
    'generation',
    'exactOrigin',
    'service',
    'appStem',
    'profileId',
    'profileVersion',
    'contextEpoch',
    'url',
    'app',
    'genre',
    'requestedLens',
    'adapterEvidence',
    'capabilityGroups',
    'risk'
  ]);
  var APP_KEYS = Object.freeze(['appStem', 'service', 'displayName', 'pageNoun']);
  var RISK_KEYS = Object.freeze(['highest', 'readCount', 'writeCount', 'destructiveCount']);
  var EVIDENCE_KEYS = Object.freeze(['signal', 'value']);
  var VALIDATORS = Object.freeze(['semantic-identity', 'connected', 'geometry']);
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
  var ROUTER_SIGNALS = new Set([
    'exact-origin',
    'trusted-context-kind',
    'drive-item-id',
    'docs-document-id',
    'opaque-target-key'
  ]);
  var ADAPTER_GENRE = Object.freeze({
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

  function schemaApi() {
    if (global.FsbSkopeoProfileSchema) return global.FsbSkopeoProfileSchema;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      return require('../utils/skopeo-profile-schema.js');
    }
    throw new TypeError('Skopeo profile schema is required');
  }

  var schema = schemaApi();
  var ADAPTER_IDS = Object.freeze(Array.from(schema.ADAPTER_IDS));
  var ADAPTER_SET = new Set(ADAPTER_IDS);

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Reflect.ownKeys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

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
    var allowed = new Set(expected);
    return keys.every(function (key) {
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      return allowed.has(key) && descriptor &&
        Object.prototype.hasOwnProperty.call(descriptor, 'value') && descriptor.enumerable === true;
    });
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
    if (!Array.isArray(value) && !isPlainObject(value)) return false;
    tracking.visiting.add(value);
    var keys = Reflect.ownKeys(value);
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      if (Array.isArray(value) && key === 'length') continue;
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

  function isPositiveSafeInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  function isBoundedText(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value);
  }

  function isIdentifier(value) {
    return isBoundedText(value, 128) && /^[a-z0-9][A-Za-z0-9._-]*$/.test(value);
  }

  function isStableValue(value) {
    return isBoundedText(value, MAX_TEXT_LENGTH) && /^[A-Za-z0-9._:-]+$/.test(value);
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

  function normalizeEvidence(value) {
    if (!Array.isArray(value) || value.length > MAX_EVIDENCE) return null;
    var normalized = [];
    var signals = new Set();
    for (var index = 0; index < value.length; index += 1) {
      var item = value[index];
      if (!hasExactKeys(item, EVIDENCE_KEYS) || !EVIDENCE_SIGNALS.has(item.signal) ||
          !isBoundedText(item.value, MAX_TEXT_LENGTH) || signals.has(item.signal)) {
        return null;
      }
      signals.add(item.signal);
      normalized.push(Object.freeze({ signal: item.signal, value: item.value }));
    }
    return Object.freeze(normalized);
  }

  function evidenceValue(evidence, signal) {
    for (var index = 0; index < evidence.length; index += 1) {
      if (evidence[index].signal === signal) return evidence[index].value;
    }
    return null;
  }

  function closedInput(adapterId, input) {
    if (!isDeepFrozenData(input) || !hasExactKeys(input, INPUT_KEYS) ||
        !isPositiveSafeInteger(input.generation) || !isPositiveSafeInteger(input.contextEpoch) ||
        !exactHttpsOrigin(input.exactOrigin) || !isIdentifier(input.appStem) ||
        !isBoundedText(input.service, 253) || !isIdentifier(input.profileId) ||
        !isBoundedText(input.profileVersion, 128) || !isBoundedText(input.requestedLens, 64) ||
        input.genre !== ADAPTER_GENRE[adapterId] || !hasExactKeys(input.app, APP_KEYS) ||
        input.app.appStem !== input.appStem || input.app.service !== input.service ||
        !isBoundedText(input.app.displayName, MAX_LABEL_LENGTH) ||
        !isBoundedText(input.app.pageNoun, 32) || !Array.isArray(input.capabilityGroups) ||
        !hasExactKeys(input.risk, RISK_KEYS) ||
        !['read', 'write', 'destructive'].includes(input.risk.highest)) {
      return null;
    }
    for (var riskIndex = 1; riskIndex < RISK_KEYS.length; riskIndex += 1) {
      var count = input.risk[RISK_KEYS[riskIndex]];
      if (!Number.isSafeInteger(count) || count < 0) return null;
    }
    var page = parseHttpsUrl(input.url);
    if (!page || page.origin !== input.exactOrigin || page.hostname !== input.service) return null;
    var evidence = normalizeEvidence(input.adapterEvidence);
    if (!evidence) return null;
    return { input: input, evidence: evidence };
  }

  function safeLabel(evidence, identity) {
    var label = evidenceValue(evidence, 'visible-label');
    if (isBoundedText(label, MAX_LABEL_LENGTH) && !/[<>]/.test(label)) return label;
    return identity.slice(0, MAX_LABEL_LENGTH);
  }

  function stableEvidence(evidence, exactOrigin, identitySignal) {
    var origin = evidenceValue(evidence, 'exact-origin');
    var identity = evidenceValue(evidence, identitySignal);
    if (origin !== exactOrigin || !isStableValue(identity)) return null;
    return deepFreeze([
      { signal: 'exact-origin', value: origin },
      { signal: identitySignal, value: identity }
    ]);
  }

  function anchorFor(kind, id, locatorKind) {
    return deepFreeze({
      anchorId: kind + ':' + id,
      candidateLocators: [{ kind: locatorKind, value: id }],
      validators: Array.from(VALIDATORS)
    });
  }

  function adapterResult(adapterId, kind, input, semanticEntity, anchorDescriptor, evidence) {
    return deepFreeze({
      adapterId: adapterId,
      kind: kind,
      generation: input.generation,
      exactOrigin: input.exactOrigin,
      profileId: input.profileId,
      profileVersion: input.profileVersion,
      contextEpoch: input.contextEpoch,
      genre: input.genre,
      semanticEntity: semanticEntity,
      anchorDescriptor: anchorDescriptor,
      evidence: evidence
    });
  }

  function resolveStable(adapterId, normalized) {
    var proof = stableEvidence(normalized.evidence, normalized.input.exactOrigin, 'opaque-target-key');
    if (!proof) return null;
    var id = proof[1].value;
    var entity = deepFreeze({
      kind: 'opaque-target',
      id: id,
      label: safeLabel(normalized.evidence, id)
    });
    return adapterResult(
      adapterId,
      'stable-entity',
      normalized.input,
      entity,
      anchorFor('opaque-target', id, 'opaque-target-key'),
      proof
    );
  }

  function routerApi() {
    if (global.FSBSkopeoContextRouter) return global.FSBSkopeoContextRouter;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      return require('./skopeo-context-router.js');
    }
    return null;
  }

  function driveIdentity(evidence, contextKind) {
    var docsId = evidenceValue(evidence, 'docs-document-id');
    var driveId = evidenceValue(evidence, 'drive-item-id');
    var opaqueId = evidenceValue(evidence, 'opaque-target-key');
    if (contextKind === 'configured-corpus' || contextKind === 'vendor-folder') {
      return isStableValue(driveId) ? { kind: 'drive-folder', id: driveId } : null;
    }
    if (contextKind === 'agreement-reading') {
      return isStableValue(docsId) ? { kind: 'docs-document', id: docsId } : null;
    }
    if (isStableValue(docsId)) return { kind: 'docs-document', id: docsId };
    if (isStableValue(driveId)) return { kind: 'drive-file', id: driveId };
    if (isStableValue(opaqueId)) return { kind: 'opaque-target', id: opaqueId };
    return null;
  }

  function locatorKind(identityKind) {
    if (identityKind === 'docs-document') return 'docs-document-id';
    if (identityKind === 'drive-folder' || identityKind === 'drive-file') return 'drive-item-id';
    return 'opaque-target-key';
  }

  function resolveDrive(adapterId, normalized) {
    var contextKind = evidenceValue(normalized.evidence, 'trusted-context-kind');
    var identity = driveIdentity(normalized.evidence, contextKind);
    var routerEvidence = Object.freeze(normalized.evidence.filter(function (item) {
      return ROUTER_SIGNALS.has(item.signal);
    }));
    var router = routerApi();
    if (!router || typeof router.createRouter !== 'function') return null;
    var routeResult;
    try {
      routeResult = router.createRouter({ generation: normalized.input.generation }).route({
        url: normalized.input.url,
        contextKind: contextKind,
        semanticIdentity: identity,
        evidence: routerEvidence
      });
    } catch (_error) {
      return null;
    }
    if (!routeResult || routeResult.status !== 'recognized') return routeResult || null;
    var routedIdentity = routeResult.semanticIdentity;
    var entity = deepFreeze({
      kind: routedIdentity.kind,
      id: routedIdentity.id,
      label: safeLabel(normalized.evidence, routedIdentity.id)
    });
    var locator = locatorKind(routedIdentity.kind);
    return adapterResult(
      adapterId,
      'drive-docs-deep-pack',
      normalized.input,
      entity,
      anchorFor(routedIdentity.kind, routedIdentity.id, locator),
      routeResult.evidence
    );
  }

  function resolve(adapterId, input) {
    if (typeof adapterId !== 'string' || !ADAPTER_SET.has(adapterId)) return null;
    if (adapterId === 'generic-unanchored-v1') return null;
    var normalized = closedInput(adapterId, input);
    if (!normalized) return null;
    // The drive-docs-v1 behavior remains owned by the existing deep router and is
    // exposed only through the schema-owned drive-docs-deep-pack-v1 adapter ID.
    if (adapterId === 'drive-docs-deep-pack-v1') return resolveDrive(adapterId, normalized);
    return resolveStable(adapterId, normalized);
  }

  var api = deepFreeze({
    ADAPTER_IDS: ADAPTER_IDS,
    resolve: resolve
  });

  global.FSBSkopeoAdapterRegistry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
