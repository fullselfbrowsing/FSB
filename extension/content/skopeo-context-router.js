(function () {
  'use strict';

  var DRIVE_ORIGIN = 'https://drive.google.com';
  var DOCS_ORIGIN = 'https://docs.google.com';
  var DOCS_DOCUMENT_PREFIX = '/document/d/';
  var MAX_URL_LENGTH = 4096;
  var MAX_VALUE_LENGTH = 512;
  var MAX_EVIDENCE = 8;

  var STATUS = Object.freeze({
    RECOGNIZED: 'recognized',
    UNCERTAIN: 'uncertain',
    UNSUPPORTED: 'unsupported'
  });

  var CONTEXT_KIND = Object.freeze({
    CONFIGURED_CORPUS: 'configured-corpus',
    VENDOR_FOLDER: 'vendor-folder',
    AGREEMENT_READING: 'agreement-reading',
    FOCUSED_ASK: 'focused-ask'
  });

  var IDENTITY_KIND = Object.freeze({
    DRIVE_FOLDER: 'drive-folder',
    DRIVE_FILE: 'drive-file',
    DOCS_DOCUMENT: 'docs-document',
    OPAQUE_TARGET: 'opaque-target'
  });

  var REASON = Object.freeze({
    CONTEXT_EVIDENCE_MISSING: 'context-evidence-missing',
    CONTEXT_EVIDENCE_CONFLICT: 'context-evidence-conflict',
    CONTEXT_KIND_UNSUPPORTED: 'context-kind-unsupported',
    ORIGIN_UNSUPPORTED: 'origin-unsupported',
    ROUTE_MALFORMED: 'route-malformed',
    ROUTER_DISPOSED: 'router-disposed'
  });

  var SIGNAL = Object.freeze({
    EXACT_ORIGIN: 'exact-origin',
    TRUSTED_CONTEXT_KIND: 'trusted-context-kind',
    DRIVE_ITEM_ID: 'drive-item-id',
    DOCS_DOCUMENT_ID: 'docs-document-id',
    OPAQUE_TARGET_KEY: 'opaque-target-key'
  });

  var CONTEXT_VALUES = Object.freeze(Object.values(CONTEXT_KIND));
  var IDENTITY_VALUES = Object.freeze(Object.values(IDENTITY_KIND));
  var SIGNAL_VALUES = Object.freeze(Object.values(SIGNAL));

  function hasExactOwnKeys(value, expectedKeys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var actualKeys = Reflect.ownKeys(value);
    if (actualKeys.length !== expectedKeys.length) return false;
    if (actualKeys.some(function (key) { return typeof key !== 'string'; })) return false;
    var sorted = actualKeys.slice().sort();
    var expected = expectedKeys.slice().sort();
    return sorted.every(function (key, index) {
      return key === expected[index];
    });
  }

  function isPositiveSafeInteger(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  }

  function isStableValue(value) {
    return typeof value === 'string' && value.length > 0 &&
      value.length <= MAX_VALUE_LENGTH && /^[A-Za-z0-9._:-]+$/.test(value);
  }

  function isEvidenceValue(signal, value) {
    if (signal === SIGNAL.EXACT_ORIGIN) {
      return value === DRIVE_ORIGIN || value === DOCS_ORIGIN;
    }
    if (signal === SIGNAL.TRUSTED_CONTEXT_KIND) {
      return CONTEXT_VALUES.includes(value);
    }
    return isStableValue(value);
  }

  function decodeDocumentId(parsed) {
    if (parsed.origin !== DOCS_ORIGIN || !parsed.pathname.startsWith(DOCS_DOCUMENT_PREFIX)) {
      return null;
    }
    var encoded = parsed.pathname.slice(DOCS_DOCUMENT_PREFIX.length).split('/')[0];
    if (!encoded) return null;
    try {
      var decoded = decodeURIComponent(encoded);
      return isStableValue(decoded) ? decoded : null;
    } catch (_error) {
      return null;
    }
  }

  function createRouter(options) {
    if (!hasExactOwnKeys(options, ['generation']) || !isPositiveSafeInteger(options.generation)) {
      throw new TypeError('generation must be a positive safe integer');
    }

    var contextEpoch = 0;
    var disposed = false;

    function failure(reason) {
      var retryable = reason === REASON.CONTEXT_EVIDENCE_MISSING ||
        reason === REASON.CONTEXT_EVIDENCE_CONFLICT;
      return Object.freeze({
        status: retryable ? STATUS.UNCERTAIN : STATUS.UNSUPPORTED,
        contextEpoch: contextEpoch,
        reason: reason,
        retryable: retryable
      });
    }

    function route(input) {
      if (contextEpoch >= Number.MAX_SAFE_INTEGER) return failure(REASON.ROUTE_MALFORMED);
      contextEpoch += 1;
      if (disposed) return failure(REASON.ROUTER_DISPOSED);

      if (!hasExactOwnKeys(input, ['url', 'contextKind', 'semanticIdentity', 'evidence'])) {
        return failure(REASON.ROUTE_MALFORMED);
      }
      if (typeof input.url !== 'string' || input.url.length === 0 ||
          input.url.length > MAX_URL_LENGTH) {
        return failure(REASON.ROUTE_MALFORMED);
      }
      if (!CONTEXT_VALUES.includes(input.contextKind)) {
        return failure(REASON.CONTEXT_KIND_UNSUPPORTED);
      }

      var parsed;
      try {
        parsed = new URL(input.url);
      } catch (_error) {
        return failure(REASON.ROUTE_MALFORMED);
      }
      if (parsed.origin !== DRIVE_ORIGIN && parsed.origin !== DOCS_ORIGIN) {
        return failure(REASON.ORIGIN_UNSUPPORTED);
      }

      if (input.semanticIdentity === null || input.semanticIdentity === undefined) {
        return failure(REASON.CONTEXT_EVIDENCE_MISSING);
      }
      if (!hasExactOwnKeys(input.semanticIdentity, ['kind', 'id'])) {
        return failure(REASON.ROUTE_MALFORMED);
      }
      if (!IDENTITY_VALUES.includes(input.semanticIdentity.kind) ||
          !isStableValue(input.semanticIdentity.id)) {
        return failure(REASON.ROUTE_MALFORMED);
      }

      if (!Array.isArray(input.evidence) || input.evidence.length > MAX_EVIDENCE) {
        return failure(REASON.ROUTE_MALFORMED);
      }
      var evidenceBySignal = new Map();
      for (var index = 0; index < input.evidence.length; index += 1) {
        var item = input.evidence[index];
        if (!hasExactOwnKeys(item, ['signal', 'value']) ||
            !SIGNAL_VALUES.includes(item.signal) ||
            !isEvidenceValue(item.signal, item.value)) {
          return failure(REASON.ROUTE_MALFORMED);
        }
        if (evidenceBySignal.has(item.signal) &&
            evidenceBySignal.get(item.signal) !== item.value) {
          return failure(REASON.CONTEXT_EVIDENCE_CONFLICT);
        }
        evidenceBySignal.set(item.signal, item.value);
      }

      if (!evidenceBySignal.has(SIGNAL.EXACT_ORIGIN) ||
          !evidenceBySignal.has(SIGNAL.TRUSTED_CONTEXT_KIND)) {
        return failure(REASON.CONTEXT_EVIDENCE_MISSING);
      }
      if (evidenceBySignal.get(SIGNAL.EXACT_ORIGIN) !== parsed.origin ||
          evidenceBySignal.get(SIGNAL.TRUSTED_CONTEXT_KIND) !== input.contextKind) {
        return failure(REASON.CONTEXT_EVIDENCE_CONFLICT);
      }

      var identity = input.semanticIdentity;
      var stableSignal;
      var documentId;

      if (input.contextKind === CONTEXT_KIND.CONFIGURED_CORPUS ||
          input.contextKind === CONTEXT_KIND.VENDOR_FOLDER) {
        if (parsed.origin !== DRIVE_ORIGIN || identity.kind !== IDENTITY_KIND.DRIVE_FOLDER) {
          return failure(REASON.CONTEXT_EVIDENCE_CONFLICT);
        }
        stableSignal = SIGNAL.DRIVE_ITEM_ID;
      } else if (input.contextKind === CONTEXT_KIND.AGREEMENT_READING) {
        documentId = decodeDocumentId(parsed);
        if (identity.kind !== IDENTITY_KIND.DOCS_DOCUMENT || documentId !== identity.id) {
          return failure(REASON.CONTEXT_EVIDENCE_CONFLICT);
        }
        stableSignal = SIGNAL.DOCS_DOCUMENT_ID;
      } else if (identity.kind === IDENTITY_KIND.DOCS_DOCUMENT) {
        documentId = decodeDocumentId(parsed);
        if (documentId !== identity.id) return failure(REASON.CONTEXT_EVIDENCE_CONFLICT);
        stableSignal = SIGNAL.DOCS_DOCUMENT_ID;
      } else if (identity.kind === IDENTITY_KIND.DRIVE_FILE) {
        if (parsed.origin !== DRIVE_ORIGIN) return failure(REASON.CONTEXT_EVIDENCE_CONFLICT);
        stableSignal = SIGNAL.DRIVE_ITEM_ID;
      } else if (identity.kind === IDENTITY_KIND.OPAQUE_TARGET) {
        stableSignal = SIGNAL.OPAQUE_TARGET_KEY;
      } else {
        return failure(REASON.CONTEXT_EVIDENCE_CONFLICT);
      }

      if (!evidenceBySignal.has(stableSignal)) {
        return failure(REASON.CONTEXT_EVIDENCE_MISSING);
      }
      if (evidenceBySignal.get(stableSignal) !== identity.id) {
        return failure(REASON.CONTEXT_EVIDENCE_CONFLICT);
      }

      var semanticIdentity = Object.freeze({ kind: identity.kind, id: identity.id });
      var evidence = Object.freeze(Array.from(evidenceBySignal, function (entry) {
        return Object.freeze({ signal: entry[0], value: entry[1] });
      }));
      return Object.freeze({
        status: STATUS.RECOGNIZED,
        contextKind: input.contextKind,
        contextEpoch: contextEpoch,
        semanticIdentity: semanticIdentity,
        evidence: evidence
      });
    }

    return Object.freeze({
      route: route,
      currentEpoch: function () { return contextEpoch; },
      dispose: function () {
        disposed = true;
        return true;
      }
    });
  }

  var api = Object.freeze({
    STATUS: STATUS,
    CONTEXT_KIND: CONTEXT_KIND,
    IDENTITY_KIND: IDENTITY_KIND,
    REASON: REASON,
    SIGNAL: SIGNAL,
    createRouter: createRouter
  });

  globalThis.FSBSkopeoContextRouter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
