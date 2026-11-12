// Pure catalog-wide Skopeo composition. This module owns data selection only.
(function (global) {
  'use strict';

  var MODEL_VERSION = 1;
  var CORPUS_MODEL_VERSION = 1;
  var CONTRACT_MODEL_VERSION = 'skopeo-contract-view/1';
  var ASK_MODEL_VERSION = 'skopeo-contract-ask/1';
  var MAX_TEXT = 512;
  var MAX_LABEL = 80;
  var MAX_GROUPS = 36;
  var MAX_ROWS = 256;
  var MAX_CORPUS_ROWS = 32;

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Reflect.ownKeys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function consequenceBounds() {
    var authority = global.FsbSkopeoActionAuthority;
    if (!authority && typeof require === 'function') {
      try { authority = require('../utils/skopeo-action-authority.js'); } catch (_error) { authority = null; }
    }
    var bounds = authority && authority.CONSEQUENCE_BOUNDS;
    return bounds && Number.isSafeInteger(bounds.label) && bounds.label > 0 &&
      Number.isSafeInteger(bounds.aggregateRender) && bounds.aggregateRender >= bounds.label &&
      Number.isSafeInteger(bounds.composedBody) && bounds.composedBody >= bounds.aggregateRender
      ? bounds
      : null;
  }

  var CONSEQUENCE_BOUNDS = consequenceBounds();

  var ATOM = Object.freeze([
    'section-heading',
    'status-row',
    'capability-row',
    'fact-list',
    'item-list',
    'compact-table',
    'timeline',
    'diff',
    'notice'
  ]);
  var ATOM_SET = new Set(ATOM);
  var PRIMITIVES = Object.freeze(['anchor', 'chip', 'halo', 'rail', 'ghost', 'gate']);
  var ATTENTION = Object.freeze(['ambient', 'anchored', 'focused', 'interstitial']);
  var ATTENTION_POLICY = deepFreeze({
    ambient: ['rail'],
    anchored: ['anchor', 'chip', 'rail', 'halo'],
    focused: ['anchor', 'chip', 'ghost'],
    interstitial: ['gate']
  });
  var GENRES = Object.freeze([
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
  var GENRE_SET = new Set(GENRES);
  var DISPOSITIONS = new Set([
    't1-ready',
    'guarded-fail-closed',
    'blocked',
    'bridge-needed',
    'uat-needed',
    'learn-pending',
    'discovery-pending',
    'degraded',
    'unsupported'
  ]);
  var SIDE_EFFECTS = Object.freeze(['read', 'write', 'destructive']);
  var SIDE_EFFECT_SET = new Set(SIDE_EFFECTS);
  var ARGUMENT_MODES = new Set(['empty', 'form', 'unsupported']);
  var ARGUMENT_KINDS = new Set(['string', 'boolean', 'integer', 'number', 'choice']);
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
  var EXECUTION_BLOCK_REASONS = new Set([
    'source-not-ready',
    'execution-authority-unavailable',
    'execution-origin-mismatch'
  ]);
  var ARGUMENT_CONTRACT_KEYS = Object.freeze(['mode', 'fields', 'reason', 'schemaDigest']);
  var ARGUMENT_FIELD_KEYS = Object.freeze([
    'name', 'label', 'kind', 'required', 'choices',
    'minLength', 'maxLength', 'minimum', 'maximum'
  ]);
  var SECRET_FIELD_RE = /password|passwd|passphrase|secret|token|api[-_.]?key|authorization|cookie|session|credential/i;
  var RESULT_STATES = new Set([
    'idle', 'pending', 'success', 'empty', 'uncertain', 'unsupported', 'target-withdrawn', 'error'
  ]);
  var CORPUS_STATES = Object.freeze([
    'ready', 'pending', 'unreadable', 'download-blocked', 'inaccessible', 'missing'
  ]);
  var CORPUS_STATE_SET = new Set(CORPUS_STATES);
  var CORPUS_CERTIFIED_ROW_STATE_SET = new Set(['ready', 'unreadable', 'download-blocked']);
  var CORPUS_STATE_COPY = deepFreeze({
    ready: 'Ready',
    pending: 'Checking access',
    unreadable: 'Unreadable',
    'download-blocked': 'Download blocked',
    inaccessible: 'Inaccessible',
    missing: 'Missing'
  });

  var INPUT_KEYS = Object.freeze([
    'context',
    'intent',
    'selectedGroupId',
    'selectedActionSlug',
    'anomalyEvidence',
    'result',
    'consequence',
    'argumentCollection'
  ]);
  var CONTEXT_KEYS = Object.freeze([
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
  ]);
  var CAPABILITY_KEYS = Object.freeze([
    'slug',
    'actionLabel',
    'effect',
    'sideEffectClass',
    'executionOrigin',
    'schemaDigest',
    'executionBlockReason',
    'paramSummary',
    'argumentContract',
    'consequenceCompatible',
    'consequenceDigest',
    'actionabilityReason',
    'sourceReadiness',
    'sourceTerminalState',
    'surfaceStatus',
    'presentationDisposition',
    'executionEnabled',
    'invocable'
  ]);
  var MODEL_KEYS = Object.freeze([
    'modelVersion',
    'authority',
    'attention',
    'primitives',
    'lens',
    'entity',
    'readyGroups',
    'unavailableSummary',
    'argumentCollection',
    'rendererRequest',
    'consequence'
  ]);

  var STATUS_PRESENTATION = deepFreeze({
    'guarded-fail-closed': {
      status: 'Unavailable safely',
      detail: 'The execution path is not verified.'
    },
    blocked: {
      status: 'Blocked by policy',
      detail: 'Review the applicable policy before continuing.'
    },
    'bridge-needed': {
      status: 'Connection required',
      detail: 'Use the trusted connection setup before continuing.'
    },
    'uat-needed': {
      status: 'Needs verification',
      detail: 'This capability requires current live verification.'
    },
    'learn-pending': {
      status: 'Learning pending',
      detail: 'No action is available while learning is pending.'
    },
    'discovery-pending': {
      status: 'Capability discovery pending',
      detail: 'No verified action is available yet.'
    },
    degraded: {
      status: 'Capability discovery pending',
      detail: 'No verified action is available in this view.'
    },
    unsupported: {
      status: 'Not supported in this view',
      detail: 'Open another supported view to continue.'
    }
  });

  var RENDERER_BY_GENRE = deepFreeze({
    'reader-knowledge': 'reader-knowledge-v1',
    communication: 'communication-v1',
    'document-editor': 'document-editor-v1',
    'worklist-record': 'worklist-record-v1',
    'dashboard-admin': 'dashboard-admin-v1',
    transactional: 'transactional-v1',
    'media-feed': 'media-feed-v1',
    'generic-app': 'generic-default-v1',
    'drive-docs-deep-pack': 'drive-docs-deep-pack-v1'
  });

  var ATOMS_BY_GENRE = deepFreeze({
    'reader-knowledge': ['section-heading', 'fact-list', 'item-list', 'notice'],
    communication: ['section-heading', 'item-list', 'timeline', 'notice'],
    'document-editor': ['section-heading', 'fact-list', 'diff', 'notice'],
    'worklist-record': ['section-heading', 'fact-list', 'item-list', 'timeline', 'notice'],
    'dashboard-admin': ['section-heading', 'status-row', 'fact-list', 'compact-table', 'notice'],
    transactional: ['section-heading', 'fact-list', 'compact-table', 'notice'],
    'media-feed': ['section-heading', 'item-list', 'fact-list', 'notice'],
    'generic-app': ['section-heading', 'status-row', 'notice'],
    'drive-docs-deep-pack': ATOM.slice()
  });

  var ENTITY_NOUN_BY_GENRE = deepFreeze({
    'reader-knowledge': 'document',
    communication: 'message',
    'document-editor': 'document',
    'worklist-record': 'record',
    'dashboard-admin': 'item',
    transactional: 'item',
    'media-feed': 'item',
    'generic-app': 'target',
    'drive-docs-deep-pack': 'target'
  });

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
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!allowed.has(key) || !descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.enumerable !== true) return false;
    }
    return true;
  }

  function isDenseDataArray(value, maximum) {
    if (!Array.isArray(value) || value.length > maximum) return false;
    var keys = Reflect.ownKeys(value);
    if (keys.length !== value.length + 1 || keys[keys.length - 1] !== 'length') return false;
    for (var index = 0; index < value.length; index += 1) {
      var key = String(index);
      if (keys[index] !== key) return false;
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.enumerable !== true) return false;
    }
    return true;
  }

  function isDeepFrozenData(value, state) {
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true;
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
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || !descriptor ||
          !Object.prototype.hasOwnProperty.call(descriptor, 'value') || descriptor.enumerable !== true ||
          !isDeepFrozenData(descriptor.value, tracking)) return false;
    }
    tracking.visiting.delete(value);
    tracking.complete.add(value);
    return true;
  }

  function positiveSafeInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  function nonNegativeSafeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function identifier(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= (maximum || 128) &&
      /^[a-z0-9][A-Za-z0-9._-]*$/.test(value);
  }

  function safeText(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= (maximum || MAX_TEXT) &&
      !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]|(?:https?:\/\/)|(?:data:)|(?:javascript:)|(?:on[a-z]+\s*=)|[{}]/i.test(value);
  }

  function safeOptionalText(value, maximum) {
    return value === null || safeText(value, maximum);
  }

  function safeCopyToken(value, maximum) {
    return safeText(value, maximum) ? value.trim() : null;
  }

  function corpusToken(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= (maximum || 160) &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
  }

  function exactHttpsOrigin(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 320) return false;
    try {
      var parsed = new URL(value);
      return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '' &&
        parsed.port === '' && parsed.origin === value && parsed.pathname === '/' &&
        parsed.search === '' && parsed.hash === '';
    } catch (_error) {
      return false;
    }
  }

  function validService(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 253 &&
      /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value);
  }

  function authorityFromContext(context) {
    if (!positiveSafeInteger(context.generation) || !positiveSafeInteger(context.contextEpoch) ||
        !exactHttpsOrigin(context.exactOrigin) || !identifier(context.profileId) ||
        !safeText(context.profileVersion, 128)) return null;
    return {
      generation: context.generation,
      exactOrigin: context.exactOrigin,
      profileId: context.profileId,
      profileVersion: context.profileVersion,
      contextEpoch: context.contextEpoch
    };
  }

  function validApp(context) {
    var app = context.app;
    if (!hasExactKeys(app, ['appStem', 'service', 'displayName', 'pageNoun']) ||
        !identifier(app.appStem) || !validService(app.service)) return false;
    try {
      return new URL(context.exactOrigin).hostname === app.service;
    } catch (_error) {
      return false;
    }
  }

  function validParamSummary(value) {
    if (!hasExactKeys(value, ['count', 'required', 'optional', 'truncated']) ||
        !nonNegativeSafeInteger(value.count) || value.count > 32 ||
        !Array.isArray(value.required) || !Array.isArray(value.optional) ||
        typeof value.truncated !== 'boolean') return false;
    var names = value.required.concat(value.optional);
    return names.length <= 12 && names.length <= value.count &&
      value.truncated === (names.length < value.count) && names.every(function (name, index) {
        return typeof name === 'string' && name.length > 0 && name.length <= MAX_LABEL &&
          /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name) && names.indexOf(name) === index;
      });
  }

  function validNullableLength(value) {
    return value === null || (Number.isSafeInteger(value) && value >= 0 && value <= 512);
  }

  function validNullableNumber(value) {
    return value === null || (typeof value === 'number' && Number.isFinite(value));
  }

  function validArgumentContract(value, schemaDigest) {
    if (!hasExactKeys(value, ARGUMENT_CONTRACT_KEYS) || !ARGUMENT_MODES.has(value.mode) ||
        !Array.isArray(value.fields) || value.fields.length > 12 ||
        !(value.schemaDigest === null ||
          (typeof value.schemaDigest === 'string' && /^sha256:[0-9a-f]{64}$/.test(value.schemaDigest)))) {
      return false;
    }
    if (value.mode === 'unsupported') {
      return value.fields.length === 0 &&
        ['argument-contract-unsupported', 'execution-authority-unavailable'].includes(value.reason) &&
        value.schemaDigest === schemaDigest;
    }
    if (value.reason !== null || typeof value.schemaDigest !== 'string' ||
        value.schemaDigest !== schemaDigest || (value.mode === 'empty') !== (value.fields.length === 0)) {
      return false;
    }
    var names = new Set();
    for (var index = 0; index < value.fields.length; index += 1) {
      var field = value.fields[index];
      if (!hasExactKeys(field, ARGUMENT_FIELD_KEYS) ||
          typeof field.name !== 'string' || field.name.length === 0 || field.name.length > MAX_LABEL ||
          !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(field.name) || SECRET_FIELD_RE.test(field.name) ||
          names.has(field.name) || !safeText(field.label, MAX_LABEL) ||
          !ARGUMENT_KINDS.has(field.kind) || typeof field.required !== 'boolean' ||
          !validNullableLength(field.minLength) || !validNullableLength(field.maxLength) ||
          !validNullableNumber(field.minimum) || !validNullableNumber(field.maximum) ||
          (field.minLength !== null && field.maxLength !== null && field.minLength > field.maxLength) ||
          (field.minimum !== null && field.maximum !== null && field.minimum > field.maximum)) {
        return false;
      }
      if (field.kind === 'choice') {
        if (!Array.isArray(field.choices) || field.choices.length === 0 || field.choices.length > 32 ||
            field.choices.some(function(choice) {
              return !['string', 'number', 'boolean'].includes(typeof choice) ||
                (typeof choice === 'number' && !Number.isFinite(choice)) ||
                (typeof choice === 'string' && !safeText(choice, 128));
            })) return false;
      } else if (field.choices !== null) {
        return false;
      }
      if (field.kind === 'string' &&
          (!Number.isSafeInteger(field.minLength) || !Number.isSafeInteger(field.maxLength) ||
            field.minimum !== null || field.maximum !== null)) return false;
      if ((field.kind === 'integer' || field.kind === 'number') &&
          (field.minLength !== null || field.maxLength !== null)) return false;
      if (field.kind === 'boolean' &&
          (field.minLength !== null || field.maxLength !== null ||
            field.minimum !== null || field.maximum !== null)) return false;
      names.add(field.name);
    }
    return true;
  }

  function validCapability(value, exactOrigin) {
    if (!hasExactKeys(value, CAPABILITY_KEYS) || !identifier(value.slug) ||
        !SIDE_EFFECT_SET.has(value.sideEffectClass) || !validParamSummary(value.paramSummary) ||
        !DISPOSITIONS.has(value.presentationDisposition) || typeof value.executionEnabled !== 'boolean' ||
        typeof value.invocable !== 'boolean') return false;
    var hasAuthority = typeof value.executionOrigin === 'string' &&
      typeof value.schemaDigest === 'string';
    if ((value.executionOrigin === null) !== (value.schemaDigest === null) ||
        (hasAuthority && (!exactHttpsOrigin(value.executionOrigin) ||
          !/^sha256:[0-9a-f]{64}$/.test(value.schemaDigest))) ||
        (!hasAuthority && value.executionOrigin !== null) ||
        !(value.executionBlockReason === null ||
          EXECUTION_BLOCK_REASONS.has(value.executionBlockReason)) ||
        !(value.actionabilityReason === null || ACTIONABILITY_REASONS.has(value.actionabilityReason)) ||
        !validArgumentContract(value.argumentContract, hasAuthority ? value.schemaDigest : null)) {
      return false;
    }
    var consequenceDigestValid = typeof value.consequenceDigest === 'string' &&
      /^sha256:[0-9a-f]{64}$/.test(value.consequenceDigest);
    if (typeof value.consequenceCompatible !== 'boolean' ||
        value.consequenceCompatible !== consequenceDigestValid ||
        (value.sideEffectClass === 'read' &&
          (value.consequenceCompatible || value.consequenceDigest !== null)) ||
        (value.sideEffectClass !== 'read' && !value.consequenceCompatible &&
          value.consequenceDigest !== null)) {
      return false;
    }
    var sourceReady = value.sourceReadiness === 't1-ready' &&
      value.sourceTerminalState === 't1-ready' && value.surfaceStatus === 't1-ready';
    var catalogReady = value.presentationDisposition === 't1-ready' && sourceReady &&
      hasAuthority && (value.sideEffectClass === 'read' || value.consequenceCompatible) &&
      (value.argumentContract.mode === 'empty' || value.argumentContract.mode === 'form') &&
      value.actionabilityReason === null;
    if (sourceReady && value.sideEffectClass !== 'read' && !value.consequenceCompatible) {
      if (value.presentationDisposition !== 'unsupported' ||
          !CONSEQUENCE_FAILURE_REASONS.has(value.actionabilityReason)) return false;
    } else if (sourceReady && !catalogReady) {
      if (value.presentationDisposition !== 'unsupported' ||
          !['argument-contract-unsupported', 'execution-authority-unavailable'].includes(
            value.actionabilityReason
          )) return false;
    } else if (!sourceReady &&
        (value.presentationDisposition === 't1-ready' || value.actionabilityReason !== 'source-not-ready')) {
      return false;
    }
    var ready = catalogReady && value.executionOrigin === exactOrigin &&
      value.executionBlockReason === null;
    if (!ready && catalogReady && value.executionBlockReason !== 'execution-origin-mismatch') return false;
    if (!catalogReady && value.executionBlockReason !== 'source-not-ready') return false;
    return value.executionEnabled === ready && value.invocable === ready;
  }

  function validCapabilityGroups(value, exactOrigin) {
    if (!Array.isArray(value) || value.length > 12) return false;
    var rowCount = 0;
    var groupIds = new Set();
    var slugs = new Set();
    for (var groupIndex = 0; groupIndex < value.length; groupIndex += 1) {
      var group = value[groupIndex];
      if (!hasExactKeys(group, ['id', 'label', 'capabilities']) || !identifier(group.id) ||
          groupIds.has(group.id) || !Array.isArray(group.capabilities) || group.capabilities.length > MAX_ROWS) {
        return false;
      }
      groupIds.add(group.id);
      for (var rowIndex = 0; rowIndex < group.capabilities.length; rowIndex += 1) {
        var row = group.capabilities[rowIndex];
        if (!validCapability(row, exactOrigin) || slugs.has(row.slug)) return false;
        slugs.add(row.slug);
        rowCount += 1;
      }
    }
    return rowCount <= MAX_ROWS;
  }

  function validRisk(value, groups) {
    if (!hasExactKeys(value, ['highest', 'readCount', 'writeCount', 'destructiveCount']) ||
        !SIDE_EFFECT_SET.has(value.highest) || !nonNegativeSafeInteger(value.readCount) ||
        !nonNegativeSafeInteger(value.writeCount) || !nonNegativeSafeInteger(value.destructiveCount)) return false;
    var counts = { read: 0, write: 0, destructive: 0 };
    groups.forEach(function (group) {
      group.capabilities.forEach(function (row) { counts[row.sideEffectClass] += 1; });
    });
    var highest = counts.destructive ? 'destructive' : counts.write ? 'write' : 'read';
    return value.readCount === counts.read && value.writeCount === counts.write &&
      value.destructiveCount === counts.destructive && value.highest === highest;
  }

  function stableEntity(context) {
    if (context.genre === 'generic-app' || context.semanticEntity === null || context.anchorDescriptor === null) {
      return null;
    }
    var entity = context.semanticEntity;
    var anchor = context.anchorDescriptor;
    if (!hasExactKeys(entity, ['kind', 'id', 'label']) || !identifier(entity.kind) || !identifier(entity.id, MAX_TEXT) ||
        !safeText(entity.label, MAX_LABEL) || !hasExactKeys(anchor, [
          'anchorId', 'contextEpoch', 'semanticIdentity', 'candidateLocators', 'validators'
        ]) || !identifier(anchor.anchorId) || anchor.contextEpoch !== context.contextEpoch ||
        !hasExactKeys(anchor.semanticIdentity, ['kind', 'id']) ||
        anchor.semanticIdentity.kind !== entity.kind || anchor.semanticIdentity.id !== entity.id ||
        !Array.isArray(anchor.candidateLocators) || anchor.candidateLocators.length === 0 ||
        !Array.isArray(anchor.validators) || anchor.validators.length !== 3 ||
        !['semantic-identity', 'connected', 'geometry'].every(function (validator) {
          return anchor.validators.includes(validator);
        })) return null;
    var originEvidence = false;
    var identityEvidence = false;
    for (var index = 0; index < context.evidence.length; index += 1) {
      var item = context.evidence[index];
      if (!hasExactKeys(item, ['signal', 'value']) || !safeText(item.signal, 64) ||
          typeof item.value !== 'string' || item.value.length === 0 || item.value.length > MAX_TEXT) return null;
      if (item.signal === 'exact-origin' && item.value === context.exactOrigin) originEvidence = true;
      if (item.value === entity.id && item.signal !== 'exact-origin') identityEvidence = true;
    }
    if (!originEvidence || !identityEvidence) return null;
    var noun = ENTITY_NOUN_BY_GENRE[context.genre] || 'target';
    return {
      kind: entity.kind,
      id: entity.id,
      noun: noun,
      label: entity.label,
      anchorId: anchor.anchorId,
      contextEpoch: context.contextEpoch,
      chipLabel: titleCase(noun) + ': ' + entity.label,
      chipAccessibleName: 'Open actions for ' + noun + ' ' + entity.label,
      withdrawnText: 'Skopeo can’t verify this ' + noun + ' anymore. Entity actions were removed.'
    };
  }

  function validContext(context) {
    if (!isDeepFrozenData(context) || !hasExactKeys(context, CONTEXT_KEYS) || context.status !== 'recognized' ||
        !authorityFromContext(context) || !validApp(context) || !GENRE_SET.has(context.genre) ||
        !identifier(context.lens, 64) || !Array.isArray(context.evidence) || context.evidence.length > 16 ||
        !validCapabilityGroups(context.capabilityGroups, context.exactOrigin) ||
        !validRisk(context.risk, context.capabilityGroups)) {
      return false;
    }
    return true;
  }

  function validIntent(value) {
    if (!hasExactKeys(value, ['kind', 'source'])) return false;
    if (value.kind === 'initial') return value.source === 'explicit-invocation';
    if (value.kind === 'open-actions' || value.kind === 'select-action' ||
        value.kind === 'collect-arguments') return value.source === 'skopeo-control';
    return false;
  }

  function titleCase(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function parameterSummary(value) {
    if (!value.count) return null;
    return String(value.count) + (value.count === 1 ? ' parameter' : ' parameters');
  }

  function cloneArgumentContract(contract) {
    return {
      mode: contract.mode,
      fields: contract.fields.map(function(field) {
        return {
          name: field.name,
          label: field.label,
          kind: field.kind,
          required: field.required,
          choices: field.choices ? field.choices.slice() : null,
          minLength: field.minLength,
          maxLength: field.maxLength,
          minimum: field.minimum,
          maximum: field.maximum
        };
      }),
      reason: contract.reason,
      schemaDigest: contract.schemaDigest
    };
  }

  function groupLabel(label, sideEffectClass) {
    var safeLabel = safeCopyToken(label, MAX_LABEL) || 'Actions';
    if (sideEffectClass === 'write') return safeLabel + ' · Changes data';
    if (sideEffectClass === 'destructive') return safeLabel + ' · Destructive';
    return safeLabel;
  }

  function normalizeGroups(context, selectedGroupId, selectedActionSlug) {
    var readyGroups = [];
    var unavailableRows = [];
    var selectedReady = null;
    var firstReady = null;
    SIDE_EFFECTS.forEach(function (sideEffectClass) {
      context.capabilityGroups.forEach(function (sourceGroup) {
        var readyRows = [];
        sourceGroup.capabilities.forEach(function (row) {
          var label = safeCopyToken(row.actionLabel, MAX_LABEL);
          if (!label) return;
          var interactive = row.sourceReadiness === 't1-ready' &&
            row.sourceTerminalState === 't1-ready' && row.surfaceStatus === 't1-ready' &&
            row.presentationDisposition === 't1-ready' &&
            (row.sideEffectClass === 'read' ||
              (row.consequenceCompatible === true &&
                typeof row.consequenceDigest === 'string')) &&
            row.executionEnabled === true && row.invocable === true &&
            row.executionOrigin === context.exactOrigin && row.executionBlockReason === null &&
            (row.argumentContract.mode === 'empty' || row.argumentContract.mode === 'form');
          if (interactive) {
            if (row.sideEffectClass !== sideEffectClass) return;
            var normalized = {
              kind: 'capability-row',
              sourceGroupId: sourceGroup.id,
              slug: row.slug,
              label: label,
              status: 'Ready',
              sideEffectClass: row.sideEffectClass,
              paramSummary: parameterSummary(row.paramSummary),
              argumentContract: cloneArgumentContract(row.argumentContract),
              primary: false,
              interactive: true
            };
            if (!firstReady) firstReady = normalized;
            if (sourceGroup.id === selectedGroupId && row.slug === selectedActionSlug) selectedReady = normalized;
            readyRows.push(normalized);
          } else if (sideEffectClass === 'read') {
            var staticDisposition = row.presentationDisposition === 't1-ready'
              ? 'unsupported' : row.presentationDisposition;
            var presentation = STATUS_PRESENTATION[staticDisposition];
            if (!presentation) return;
            unavailableRows.push({
              kind: 'status-row',
              label: label,
              status: presentation.status,
              detail: presentation.detail,
              disposition: staticDisposition,
              sideEffectClass: row.sideEffectClass,
              interactive: false
            });
          }
        });
        if (readyRows.length) {
          readyGroups.push({
            id: sourceGroup.id + '--' + sideEffectClass,
            label: groupLabel(sourceGroup.label, sideEffectClass),
            sideEffectClass: sideEffectClass,
            rows: readyRows
          });
        }
      });
    });
    var primary = selectedReady || firstReady;
    if (primary) primary.primary = true;
    return {
      readyGroups: readyGroups,
      unavailableSummary: {
        heading: 'Unavailable actions',
        count: unavailableRows.length,
        rows: unavailableRows
      },
      selectedReady: selectedReady,
      readyCount: readyGroups.reduce(function (total, group) { return total + group.rows.length; }, 0)
    };
  }

  function lensModel(context, readyCount) {
    var displayName = safeCopyToken(context.app.displayName, MAX_LABEL);
    var pageNoun = safeCopyToken(context.app.pageNoun, 32) || 'view';
    var name = displayName || 'Skopeo';
    var lensName = titleCase(pageNoun);
    return {
      label: displayName ? 'Skopeo · ' + displayName : 'Skopeo',
      metadata: lensName + ' · ' + String(readyCount) + ' ready',
      actionLabel: displayName ? 'Open ' + displayName + ' actions' : 'Open Skopeo actions',
      regionLabel: displayName ? 'Skopeo for ' + displayName : 'Skopeo actions',
      appDisplayName: name,
      pageNoun: pageNoun
    };
  }

  function validResult(value) {
    if (value === null) return true;
    return hasExactKeys(value, ['status', 'actionLabel', 'recovery']) && RESULT_STATES.has(value.status) &&
      (value.actionLabel === null || typeof value.actionLabel === 'string') &&
      (value.recovery === null || typeof value.recovery === 'string');
  }

  function validArgumentCollectionInput(value) {
    if (value === null) return true;
    if (!hasExactKeys(value, ['collectionEpoch', 'errorField', 'errorMessage']) ||
        !positiveSafeInteger(value.collectionEpoch) ||
        !(value.errorField === null ||
          (typeof value.errorField === 'string' && value.errorField.length <= MAX_LABEL &&
            /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value.errorField) &&
            !SECRET_FIELD_RE.test(value.errorField))) ||
        !safeOptionalText(value.errorMessage, MAX_TEXT)) {
      return false;
    }
    return (value.errorField === null) === (value.errorMessage === null);
  }

  function argumentCollectionModel(value, selected) {
    if (!value || !selected || selected.argumentContract.mode !== 'form') return null;
    if (value.errorField !== null && !selected.argumentContract.fields.some(function(field) {
      return field.name === value.errorField;
    })) return null;
    return {
      collectionEpoch: value.collectionEpoch,
      groupId: selected.sourceGroupId,
      actionSlug: selected.slug,
      argumentContract: cloneArgumentContract(selected.argumentContract),
      submitLabel: selected.label,
      cancelLabel: 'Cancel',
      errorField: value.errorField,
      errorMessage: value.errorMessage
    };
  }

  function resultMessage(result, entity) {
    if (!result || result.status === 'idle' || result.status === 'success' || result.status === 'empty') return null;
    if (result.status === 'uncertain') {
      return 'Skopeo can’t verify this view. The page was left unchanged. Open another view or turn off Skopeo.';
    }
    if (result.status === 'unsupported') {
      return 'Skopeo doesn’t support this app yet. Nothing was added to the page. Turn off Skopeo or open a supported app.';
    }
    if (result.status === 'target-withdrawn') {
      return entity ? entity.withdrawnText :
        'Skopeo can’t verify this target anymore. Entity actions were removed.';
    }
    if (result.status === 'pending') {
      var pendingAction = safeCopyToken(result.actionLabel, MAX_LABEL);
      return pendingAction ? pendingAction + ' is pending.' : 'The selected action is pending.';
    }
    if (result.status === 'error') {
      var action = safeCopyToken(result.actionLabel, MAX_LABEL);
      var recovery = safeCopyToken(result.recovery, MAX_TEXT);
      return action && recovery ? action + ' didn’t finish. ' + recovery :
        'The action didn’t finish. Review the target and try the action again.';
    }
    return null;
  }

  function copyModel(context, lens, entity, result) {
    var displayName = safeCopyToken(context.app.displayName, MAX_LABEL);
    var pageNoun = lens.pageNoun;
    var focusedTitle = entity ? entity.chipLabel : (displayName ? displayName + ' actions' : 'Skopeo actions');
    return {
      focusedTitle: focusedTitle,
      contextDescription: entity
        ? 'Verified ' + entity.noun + ' actions and capability readiness.'
        : 'Verified actions and capability readiness for this ' + pageNoun + '.',
      emptyHeading: 'No verified actions here',
      emptyBody: 'Skopeo found no ready capabilities for this ' + pageNoun +
        '. Change the task lens or open another supported view.',
      uncertainHeading: 'Skopeo can’t verify this view.',
      uncertainBody: 'The page was left unchanged. Open another view or turn off Skopeo.',
      unsupportedHeading: 'Skopeo doesn’t support this app yet.',
      unsupportedBody: 'Nothing was added to the page. Turn off Skopeo or open a supported app.',
      resultMessage: resultMessage(result, entity),
      backLabel: displayName ? 'Back to ' + displayName + ' overview' : 'Back to Skopeo overview',
      turnOffLabel: 'Turn off Skopeo in this tab'
    };
  }

  function validAnomaly(value) {
    return hasExactKeys(value, ['validated', 'kind', 'label', 'evidenceId']) && value.validated === true &&
      value.kind === 'anomaly' && safeText(value.label, MAX_LABEL) && identifier(value.evidenceId);
  }

  function validConsequenceInput(value, selected) {
    return !!CONSEQUENCE_BOUNDS && !!selected && hasExactKeys(value, [
      'actionSlug', 'actionLabel', 'target', 'effect', 'parameterSummary', 'gerund'
    ]) && value.actionSlug === selected.slug && value.actionLabel === selected.label &&
      safeText(value.target, CONSEQUENCE_BOUNDS.aggregateRender) &&
      safeText(value.effect, CONSEQUENCE_BOUNDS.label) &&
      safeText(value.parameterSummary, CONSEQUENCE_BOUNDS.aggregateRender) &&
      safeText(value.gerund, CONSEQUENCE_BOUNDS.label) &&
      value.target.length + value.effect.length + value.parameterSummary.length + value.gerund.length <=
        CONSEQUENCE_BOUNDS.aggregateRender;
  }

  function sentence(value) {
    var trimmed = value.trim();
    return /[.!?]$/.test(trimmed) ? trimmed : trimmed + '.';
  }

  function consequenceModel(value, selected) {
    var destructive = selected.sideEffectClass === 'destructive';
    var effect = destructive ? 'This action may remove service data. ' + sentence(value.effect) : sentence(value.effect);
    return {
      groupId: selected.sourceGroupId,
      actionSlug: selected.slug,
      sideEffectClass: selected.sideEffectClass,
      eyebrow: destructive ? 'Destructive action' : 'Changes data',
      title: selected.label + '?',
      body: effect + ' Target: ' + value.target + '. ' + sentence(value.parameterSummary),
      safeLabel: 'Keep reviewing',
      confirmLabel: selected.label,
      pendingLabel: value.gerund + '…',
      staleLabel: 'This confirmation expired because the page context changed. Review the action again.',
      focusTarget: 'safe-action',
      tabOrder: ['safe-action', 'confirm-action', 'turn-off']
    };
  }

  function rendererRequest(context, result, copy) {
    return {
      rendererId: RENDERER_BY_GENRE[context.genre],
      genre: context.genre,
      resultStatus: result ? result.status : 'idle',
      requestedAtoms: ATOMS_BY_GENRE[context.genre].slice(),
      narrowBreakpoint: 480,
      narrowTableFallback: 'fact-list',
      liveRegion: { politeness: 'polite', atomic: true },
      reducedMotion: {
        media: 'prefers-reduced-motion: reduce',
        durationMs: 0,
        halo: 'static-outline'
      },
      forcedColors: true,
      copy: copy
    };
  }

  function compose(input) {
    try {
      if (!hasExactKeys(input, INPUT_KEYS) || !validContext(input.context) || !validIntent(input.intent) ||
          !validResult(input.result) ||
          !validArgumentCollectionInput(input.argumentCollection) ||
          !(input.selectedGroupId === null || identifier(input.selectedGroupId)) ||
          !(input.selectedActionSlug === null || identifier(input.selectedActionSlug))) return null;
      if ((input.intent.kind === 'collect-arguments') !== (input.argumentCollection !== null)) return null;

      var context = input.context;
      var entity = stableEntity(context);
      var normalized = normalizeGroups(context, input.selectedGroupId, input.selectedActionSlug);
      var lens = lensModel(context, normalized.readyCount);
      var result = validResult(input.result) ? input.result : null;
      var copy = copyModel(context, lens, entity, result);
      var attention;
      var primitives;
      var consequence = null;
      var argumentCollection = null;

      if (input.intent.kind === 'initial') {
        var anchoredDefault = !!entity && context.genre !== 'dashboard-admin' && context.genre !== 'generic-app';
        attention = anchoredDefault ? 'anchored' : 'ambient';
        primitives = anchoredDefault ? ['anchor', 'chip', 'rail'] : ['rail'];
        if (anchoredDefault && validAnomaly(input.anomalyEvidence)) primitives.push('halo');
      } else if (input.intent.kind === 'open-actions') {
        attention = 'focused';
        primitives = entity ? ['anchor', 'chip'] : [];
      } else if (input.intent.kind === 'select-action') {
        attention = 'focused';
        primitives = entity ? ['anchor', 'chip'] : [];
        var selected = normalized.selectedReady;
        var consequential = selected && (selected.sideEffectClass === 'write' ||
          selected.sideEffectClass === 'destructive');
        if (consequential && validConsequenceInput(input.consequence, selected)) {
          attention = 'interstitial';
          primitives = ['gate'];
          consequence = consequenceModel(input.consequence, selected);
        }
      } else {
        attention = 'focused';
        primitives = entity ? ['anchor', 'chip'] : [];
        argumentCollection = argumentCollectionModel(input.argumentCollection, normalized.selectedReady);
        if (normalized.selectedReady && normalized.selectedReady.argumentContract.mode === 'form' &&
            !argumentCollection) return null;
      }

      var model = {
        modelVersion: MODEL_VERSION,
        authority: authorityFromContext(context),
        attention: attention,
        primitives: primitives,
        lens: lens,
        entity: entity,
        readyGroups: normalized.readyGroups,
        unavailableSummary: normalized.unavailableSummary,
        argumentCollection: argumentCollection,
        rendererRequest: rendererRequest(context, result, copy),
        consequence: consequence
      };
      deepFreeze(model);
      return validateRenderModel(model) ? model : null;
    } catch (_error) {
      return null;
    }
  }

  function validCorpusEntity(value, authority) {
    if (!hasExactKeys(value, ['kind', 'id', 'label']) ||
        !['drive-folder', 'drive-file', 'docs-document'].includes(value.kind) ||
        !corpusToken(value.id, MAX_TEXT) || !safeText(value.label, MAX_LABEL)) return false;
    if (value.kind === 'docs-document') return authority.exactOrigin === 'https://docs.google.com';
    return authority.exactOrigin === 'https://drive.google.com';
  }

  function corpusEntityToken(value) {
    return value.kind + ':' + value.id;
  }

  function corpusAuthority(value) {
    return {
      generation: value.generation,
      exactOrigin: value.exactOrigin,
      profileId: value.profileId,
      profileVersion: value.profileVersion,
      contextEpoch: value.contextEpoch
    };
  }

  function corpusInput(value) {
    return hasExactKeys(value, ['authority', 'semanticEntity', 'actionToken', 'projection']) &&
      validateAuthority(value.authority) && validCorpusEntity(value.semanticEntity, value.authority) &&
      corpusToken(value.actionToken, 160);
  }

  function corpusBase(input, mode) {
    return {
      corpusModelVersion: CORPUS_MODEL_VERSION,
      authority: corpusAuthority(input.authority),
      semanticEntityToken: corpusEntityToken(input.semanticEntity),
      mode: mode,
      actionToken: input.actionToken
    };
  }

  function corpusEnrollment(input) {
    if (input.semanticEntity.kind !== 'drive-folder' ||
        !hasExactKeys(input.projection, ['mode', 'actionToken']) ||
        input.projection.mode !== 'enrollment' ||
        input.projection.actionToken !== input.actionToken) return null;
    var model = corpusBase(input, 'enrollment');
    model.control = {
      label: 'Enroll this folder',
      accessibleName: 'Enroll this folder'
    };
    return model;
  }

  function corpusCurrentSource(input, projection) {
    if (!['drive-file', 'docs-document'].includes(input.semanticEntity.kind) ||
        !(hasExactKeys(projection, ['mode', 'state', 'labelToken', 'actionToken']) ||
          hasExactKeys(projection, ['mode', 'state', 'labelToken', 'actionToken', 'displayLabel'])) ||
        projection.mode !== 'current-source' || !CORPUS_STATE_SET.has(projection.state) ||
        projection.labelToken !== 'current-source' || projection.actionToken !== input.actionToken) return null;
    var hasDisplayLabel = Object.prototype.hasOwnProperty.call(projection, 'displayLabel');
    if (hasDisplayLabel && ['pending', 'inaccessible', 'missing'].includes(projection.state)) return null;
    var displayLabel = hasDisplayLabel ? safeCopyToken(projection.displayLabel, MAX_LABEL) : null;
    var model = corpusBase(input, 'current-source');
    model.source = {
      label: displayLabel || 'Current source',
      state: projection.state,
      stateLabel: CORPUS_STATE_COPY[projection.state]
    };
    return model;
  }

  function corpusCertifiedRow(value, index, seen) {
    if (!(hasExactKeys(value, ['rowToken', 'state']) ||
          hasExactKeys(value, ['rowToken', 'state', 'displayLabel'])) ||
        !corpusToken(value.rowToken, 160) || seen.has(value.rowToken) ||
        !CORPUS_CERTIFIED_ROW_STATE_SET.has(value.state)) return null;
    seen.add(value.rowToken);
    var label = Object.prototype.hasOwnProperty.call(value, 'displayLabel')
      ? safeCopyToken(value.displayLabel, MAX_LABEL)
      : null;
    return {
      rowToken: value.rowToken,
      label: label || 'Source ' + String(index + 1),
      state: value.state,
      stateLabel: CORPUS_STATE_COPY[value.state]
    };
  }

  function corpusAggregate(value, rowTokens) {
    if (value === null || value === undefined) return null;
    if (!hasExactKeys(value, ['rowTokens']) || !isDenseDataArray(value.rowTokens, MAX_CORPUS_ROWS) ||
        value.rowTokens.length !== rowTokens.length) return false;
    for (var index = 0; index < rowTokens.length; index += 1) {
      if (value.rowTokens[index] !== rowTokens[index]) return false;
    }
    return {
      rowTokens: rowTokens.slice(),
      label: String(rowTokens.length) + (rowTokens.length === 1 ? ' source' : ' sources')
    };
  }

  function corpusActive(input, projection) {
    var exact = hasExactKeys(projection, ['mode', 'rows', 'actionToken']) ||
      hasExactKeys(projection, ['mode', 'rows', 'aggregate', 'actionToken']);
    if (input.semanticEntity.kind !== 'drive-folder' || !exact || projection.mode !== 'active-corpus' ||
        projection.actionToken !== input.actionToken || !isDenseDataArray(projection.rows, MAX_CORPUS_ROWS) ||
        projection.rows.length === 0 || projection.rows.length > MAX_CORPUS_ROWS) return null;
    var seen = new Set();
    var rows = [];
    for (var index = 0; index < projection.rows.length; index += 1) {
      var normalized = corpusCertifiedRow(projection.rows[index], index, seen);
      if (!normalized) return null;
      rows.push(normalized);
    }
    var rowTokens = rows.map(function (row) { return row.rowToken; });
    var normalizedAggregate = corpusAggregate(projection.aggregate, rowTokens);
    if (normalizedAggregate === false) return null;
    var model = corpusBase(input, 'active-corpus');
    model.rows = rows;
    model.aggregate = normalizedAggregate;
    return model;
  }

  function corpusClosed(input, projection) {
    if (!hasExactKeys(projection, ['mode', 'reasonCode', 'actionToken']) ||
        projection.mode !== 'corpus-closed' || projection.actionToken !== input.actionToken ||
        !identifier(projection.reasonCode, 64)) return null;
    var model = corpusBase(input, 'corpus-closed');
    model.reasonCode = projection.reasonCode;
    model.copy = 'Corpus unavailable';
    return model;
  }

  function validateCorpusAuthority(value) {
    return validateAuthority(value);
  }

  function validateCorpusSource(value) {
    return hasExactKeys(value, ['label', 'state', 'stateLabel']) && safeText(value.label, MAX_LABEL) &&
      CORPUS_STATE_SET.has(value.state) && value.stateLabel === CORPUS_STATE_COPY[value.state];
  }

  function validateCorpusRows(value) {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CORPUS_ROWS) return false;
    var seen = new Set();
    return value.every(function (row) {
      if (!hasExactKeys(row, ['rowToken', 'label', 'state', 'stateLabel']) ||
          !corpusToken(row.rowToken, 160) || seen.has(row.rowToken) ||
          !safeText(row.label, MAX_LABEL) || !CORPUS_CERTIFIED_ROW_STATE_SET.has(row.state) ||
          row.stateLabel !== CORPUS_STATE_COPY[row.state]) return false;
      seen.add(row.rowToken);
      return true;
    });
  }

  function validateCorpusAggregate(value, rows) {
    if (value === null) return true;
    if (!hasExactKeys(value, ['rowTokens', 'label']) || !Array.isArray(value.rowTokens) ||
        value.rowTokens.length !== rows.length ||
        value.label !== String(rows.length) + (rows.length === 1 ? ' source' : ' sources')) return false;
    return value.rowTokens.every(function (token, index) { return token === rows[index].rowToken; });
  }

  function validateCorpusModel(model) {
    try {
      if (!isDeepFrozenData(model) || model.corpusModelVersion !== CORPUS_MODEL_VERSION ||
          !validateCorpusAuthority(model.authority) || !corpusToken(model.semanticEntityToken, 680) ||
          !corpusToken(model.actionToken, 160)) return false;
      var common = ['corpusModelVersion', 'authority', 'semanticEntityToken', 'mode', 'actionToken'];
      if (model.mode === 'enrollment') {
        return hasExactKeys(model, common.concat(['control'])) &&
          hasExactKeys(model.control, ['label', 'accessibleName']) &&
          model.control.label === 'Enroll this folder' &&
          model.control.accessibleName === 'Enroll this folder';
      }
      if (model.mode === 'current-source') {
        return hasExactKeys(model, common.concat(['source'])) && validateCorpusSource(model.source);
      }
      if (model.mode === 'active-corpus') {
        return hasExactKeys(model, common.concat(['rows', 'aggregate'])) && validateCorpusRows(model.rows) &&
          validateCorpusAggregate(model.aggregate, model.rows);
      }
      if (model.mode === 'corpus-closed') {
        return hasExactKeys(model, common.concat(['reasonCode', 'copy'])) &&
          identifier(model.reasonCode, 64) && model.copy === 'Corpus unavailable';
      }
      return false;
    } catch (_error) {
      return false;
    }
  }

  function composeCorpus(input) {
    try {
      if (!corpusInput(input)) return null;
      var model;
      if (!isPlainObject(input.projection)) return null;
      if (input.projection.mode === 'enrollment') model = corpusEnrollment(input);
      else if (input.projection.mode === 'current-source') model = corpusCurrentSource(input, input.projection);
      else if (input.projection.mode === 'active-corpus') model = corpusActive(input, input.projection);
      else if (input.projection.mode === 'corpus-closed') model = corpusClosed(input, input.projection);
      else return null;
      if (!model) return null;
      deepFreeze(model);
      return validateCorpusModel(model) ? model : null;
    } catch (_error) {
      return null;
    }
  }

  var CONTRACT_MODEL_KEYS = Object.freeze([
    'contractModelVersion', 'authority', 'attention', 'mode', 'title',
    'sectionOrder', 'folder', 'reading', 'blocker', 'askEntries', 'actionIds'
  ]);
  var CONTRACT_AUTHORITY_KEYS = Object.freeze([
    'generation', 'exactOrigin', 'profileVersion', 'contextEpoch',
    'semanticEntityToken', 'requestActionToken', 'projectionToken'
  ]);
  var FOLDER_SECTION_ORDER = Object.freeze([
    'header', 'blocker', 'next-material-dates', 'urgent-gaps',
    'vendors', 'vendor-page-controls', 'overflow'
  ]);
  var READING_SECTION_ORDER = Object.freeze([
    'banner', 'governing-facts', 'relevant-history', 'conflicts-and-gaps',
    'policy-and-delivery-status', 'overflow'
  ]);
  var VENDOR_SLOT_ORDER = Object.freeze([
    'owner', 'documents-and-index', 'governing-status', 'next-material-date',
    'consequence', 'memo-evidence', 'policy-document', 'memo-requirement',
    'notification-delivery', 'urgent-gaps'
  ]);
  var CLOSED_COPY = 'Skopeo can’t verify this contract view. Reopen the folder or document and invoke Skopeo again.';
  var DATE_TYPE_COPY = deepFreeze({
    'notice-deadline': 'Notice deadline',
    renewal: 'Renewal',
    termination: 'Termination',
    expiration: 'Expiration'
  });
  var DATE_TYPE_ORDER = Object.freeze([
    'notice-deadline', 'termination', 'expiration', 'renewal'
  ]);
  var GAP_COPY = deepFreeze({
    'missing-final': 'Final agreement missing',
    'unreadable-scan': 'Scan unreadable',
    'incomplete-indexing': 'Index incomplete',
    'owner-gap': 'Owner not assigned',
    'version-conflict': 'Agreement version conflict — review required',
    'policy-document-missing': 'Policy document missing',
    pending: 'Pending',
    'download-blocked': 'Download blocked',
    inaccessible: 'Access unavailable',
    ambiguous: 'Evidence ambiguous',
    'not-evaluated': 'Not evaluated'
  });
  var GOVERNING_COPY = deepFreeze({
    governing: 'Governing',
    'partially-governing': 'Partially governing',
    'review-required': 'Review required',
    'not-evaluated': 'Not evaluated'
  });
  var READING_COPY = deepFreeze({
    governing: {
      label: 'Governing',
      explanation: 'This document governs the facts shown below.',
      definitive: true
    },
    'partially-governing': {
      label: 'Partially governing',
      explanation: 'This document governs only the cited clauses. Other terms come from the governing sources named below.',
      definitive: false
    },
    historical: {
      label: 'Historical',
      explanation: 'This document is relevant history. It does not govern the facts shown below.',
      definitive: true
    },
    superseded: {
      label: 'Superseded',
      explanation: 'This document has been superseded. It does not govern the facts shown below.',
      definitive: true
    },
    'review-required': {
      label: 'Review required',
      explanation: 'Skopeo can’t determine what governs. Review the cited conflict before acting.',
      definitive: false
    },
    'not-evaluated': {
      label: 'Not evaluated',
      explanation: 'Governing status isn’t available from the current complete evidence.',
      definitive: false
    },
    'access-unavailable': {
      label: 'Access unavailable',
      explanation: 'Skopeo can’t confirm this document under the current Drive access.',
      definitive: false
    }
  });
  var SOURCE_COPY = deepFreeze({
    ready: 'Current source available',
    pending: 'Pending',
    unreadable: 'Scan unreadable',
    'download-blocked': 'Download blocked',
    inaccessible: 'Access unavailable',
    missing: 'Final agreement missing'
  });
  var TRUST_COPY = deepFreeze({
    accepted: 'Accepted',
    extracted: 'Extracted',
    inferred: 'Inferred',
    ambiguous: 'Ambiguous',
    unreadable: 'Unreadable',
    'review-required': 'Review required'
  });
  var FACT_COPY = deepFreeze({
    signed: 'Signed',
    effective: 'Effective',
    'notice-window': 'Notice window',
    'notice-deadline': 'Notice deadline',
    renewal: 'Renewal',
    termination: 'Termination',
    expiration: 'Expiration',
    'delivery-method': 'Delivery method',
    'written-notice-address': 'Written notice address'
  });
  var FACT_ORDER = Object.freeze([
    'signed', 'effective', 'notice-window', 'notice-deadline', 'renewal',
    'termination', 'expiration', 'delivery-method', 'written-notice-address'
  ]);
  var INDEX_COPY = deepFreeze({
    complete: 'Index complete',
    incomplete: 'Index incomplete',
    pending: 'Pending',
    'not-evaluated': 'Not evaluated'
  });
  var ALERT_STATE_COPY = deepFreeze({
    scheduled: 'Local alert scheduled',
    attempted: 'Local alert attempt recorded',
    delivered: 'Local alert delivered',
    failed: 'Local alert failed',
    missed: 'Local alert missed',
    'not-locally-deliverable': 'Not locally deliverable'
  });

  function hudSchemaApi() {
    var schema = global.FsbSkopeoHudSchema;
    if (!schema && typeof require === 'function') {
      try { schema = require('../utils/skopeo-hud-schema.js'); } catch (_error) { schema = null; }
    }
    return schema && typeof schema.parseProjection === 'function' ? schema : null;
  }

  function contractText(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]/.test(value) &&
      !/(?:https?|file|chrome):\/\//i.test(value);
  }

  function contractToken(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 192 &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value) &&
      !['__proto__', 'prototype', 'constructor'].includes(value);
  }

  function contractAuthority(projection) {
    return {
      generation: projection.generation,
      exactOrigin: projection.exactOrigin,
      profileVersion: projection.profileVersion,
      contextEpoch: projection.contextEpoch,
      semanticEntityToken: projection.semanticEntityToken,
      requestActionToken: projection.requestActionToken,
      projectionToken: projection.projectionToken
    };
  }

  function contractBase(projection, mode, title, sectionOrder) {
    return {
      contractModelVersion: CONTRACT_MODEL_VERSION,
      authority: contractAuthority(projection),
      attention: 'anchored',
      mode: mode,
      title: title,
      sectionOrder: sectionOrder.slice(),
      folder: null,
      reading: null,
      blocker: null,
      askEntries: [],
      actionIds: []
    };
  }

  function composeAskEntry(scope) {
    var label = scope.kind === 'agreement' ? 'Ask about this agreement' :
      scope.kind === 'corpus' ? 'Ask enrolled corpus' : 'Ask about ' + scope.label;
    return {
      kind: scope.kind,
      label: scope.label,
      scopeToken: scope.scopeToken,
      action: { kind: 'ask-entry', label: label }
    };
  }

  function stateValue(state, copy, fallback) {
    return Object.prototype.hasOwnProperty.call(copy, state) ? copy[state] : fallback;
  }

  function composeOwner(owner) {
    return {
      state: owner.state,
      label: 'Owner',
      value: owner.state === 'assigned' ? owner.label :
        owner.state === 'unassigned' ? 'Owner not assigned' : 'Not evaluated'
    };
  }

  function documentSummary(documents) {
    var sourceWord = documents.total === 1 ? 'source' : 'sources';
    var indexState = documents.indexState || documents.state;
    var parts = [String(documents.total) + ' authorized ' + sourceWord, INDEX_COPY[indexState]];
    var typed = [
      ['ready', 'ready'],
      ['pending', 'pending'],
      ['unreadable', 'unreadable'],
      ['downloadBlocked', 'download blocked'],
      ['inaccessible', 'inaccessible'],
      ['missing', 'missing']
    ];
    typed.forEach(function(entry) {
      if (documents[entry[0]] > 0) parts.push(String(documents[entry[0]]) + ' ' + entry[1]);
    });
    return parts.join(' · ');
  }

  function composeDocuments(documents) {
    return {
      state: documents.indexState,
      label: 'Documents and index',
      value: documentSummary(documents),
      indexLabel: INDEX_COPY[documents.indexState],
      total: documents.total,
      ready: documents.ready,
      pending: documents.pending,
      unreadable: documents.unreadable,
      downloadBlocked: documents.downloadBlocked,
      inaccessible: documents.inaccessible,
      missing: documents.missing
    };
  }

  function composeDate(date) {
    var accepted = date.state === 'accepted';
    return {
      state: date.state,
      label: 'Next material date',
      type: accepted ? date.type : null,
      typeLabel: accepted ? DATE_TYPE_COPY[date.type] : null,
      civilDate: accepted ? date.civilDate : null,
      dateLabel: accepted ? date.displayDate : null,
      value: accepted ? DATE_TYPE_COPY[date.type] + ' — ' + date.displayDate :
        date.state === 'none' ? 'No material date proven' : 'Not evaluated',
      trustState: accepted ? date.trustState : null,
      trustLabel: accepted ? TRUST_COPY[date.trustState] : null
    };
  }

  function composeConsequence(value) {
    return {
      state: value.state,
      label: 'If no action',
      value: value.state === 'accepted' ? value.text :
        value.state === 'none' ? 'No consequence proven' : 'Consequence not evaluated'
    };
  }

  function composeNotificationDelivery(value, includeKey) {
    if (value === 'not-available') return null;
    var slot = {
      state: value.state,
      label: 'Local alert',
      value: ALERT_STATE_COPY[value.state],
      detail: value.detail,
      deadlineCivilDate: value.deadlineCivilDate,
      alertCivilDate: value.alertCivilDate,
      action: value.action === null ? null : {
        kind: 'alert-action',
        actionId: value.action.actionId,
        label: value.action.label,
        requiresConfirmation: true
      }
    };
    if (includeKey) slot.key = 'notification-delivery';
    return slot;
  }

  function composeGap(gap) {
    return { type: gap.type, priority: gap.priority, label: GAP_COPY[gap.type] };
  }

  function composeVendor(vendor) {
    var gaps = vendor.gaps.map(composeGap);
    var completeGaps = vendor.documents.indexState === 'complete';
    return {
      vendorToken: vendor.vendorToken,
      label: vendor.label,
      slotOrder: VENDOR_SLOT_ORDER.slice(),
      owner: composeOwner(vendor.owner),
      documents: composeDocuments(vendor.documents),
      governing: {
        state: vendor.governingState,
        label: 'Governing status',
        value: GOVERNING_COPY[vendor.governingState]
      },
      nextMaterialDate: composeDate(vendor.nextMaterialDate),
      consequence: composeConsequence(vendor.consequence),
      memoEvidence: {
        state: vendor.memoEvidence,
        label: 'Memo evidence',
        value: vendor.memoEvidence === 'on-file' ? 'Memo on file' : 'Memo evidence not evaluated'
      },
      policyDocument: {
        state: vendor.policyDocument,
        label: 'Policy document',
        value: vendor.policyDocument === 'on-file' ? 'Policy document on file' :
          vendor.policyDocument === 'missing' ? 'Policy document missing' : 'Policy document not evaluated'
      },
      memoRequirement: {
        state: vendor.memoRequirement,
        label: 'Memo requirement',
        value: 'Not evaluated'
      },
      notificationDelivery: composeNotificationDelivery(vendor.notificationDelivery, false),
      gaps: gaps,
      gapOverflow: vendor.gapOverflow,
      gapOverflowText: vendor.gapOverflow > 0 ? '+' + String(vendor.gapOverflow) + ' more gaps' : null,
      gapEmptyText: gaps.length === 0
        ? (completeGaps ? 'No urgent gaps proven' : 'Urgent gaps not evaluated')
        : null
    };
  }

  function composeDateSummary(value) {
    return {
      vendorToken: value.vendorToken,
      vendorLabel: value.vendorLabel,
      type: value.date.type,
      typeLabel: DATE_TYPE_COPY[value.date.type],
      civilDate: value.date.civilDate,
      dateLabel: value.date.displayDate,
      trustState: value.date.trustState,
      trustLabel: TRUST_COPY[value.date.trustState],
      consequenceLabel: 'If no action',
      consequence: value.consequence.state === 'accepted' ? value.consequence.text :
        value.consequence.state === 'none' ? 'No consequence proven' : 'Consequence not evaluated'
    };
  }

  function compareDateSummary(left, right) {
    if (left.civilDate !== right.civilDate) return left.civilDate < right.civilDate ? -1 : 1;
    var typeDifference = DATE_TYPE_ORDER.indexOf(left.type) - DATE_TYPE_ORDER.indexOf(right.type);
    if (typeDifference !== 0) return typeDifference;
    if (left.vendorToken === right.vendorToken) return 0;
    return left.vendorToken < right.vendorToken ? -1 : 1;
  }

  function composeFolder(projection) {
    var body = projection.body;
    var model = contractBase(projection, 'folder', 'Vendor agreements', FOLDER_SECTION_ORDER);
    var dates = body.nextMaterialDates.map(composeDateSummary).sort(compareDateSummary);
    var gaps = body.urgentGaps.map(function(value) {
      return {
        vendorToken: value.vendorToken,
        vendorLabel: value.vendorLabel,
        type: value.gap.type,
        priority: value.gap.priority,
        label: GAP_COPY[value.gap.type]
      };
    });
    model.folder = {
      completeness: {
        manifestState: body.manifestState,
        label: body.manifestState === 'complete' ? 'Complete enrolled corpus' : 'Incomplete corpus',
        vendorCount: body.vendorCount
      },
      blocker: null,
      nextMaterialDates: dates,
      nextMaterialDateOverflow: body.nextMaterialDateOverflow,
      nextMaterialDateOverflowText: body.nextMaterialDateOverflow > 0
        ? '+' + String(body.nextMaterialDateOverflow) + ' more material dates appear in vendor rows'
        : null,
      urgentGaps: gaps,
      urgentGapOverflow: body.urgentGapOverflow,
      urgentGapOverflowText: body.urgentGapOverflow > 0
        ? '+' + String(body.urgentGapOverflow) + ' more gaps appear in vendor rows'
        : null,
      vendors: body.vendors.map(composeVendor),
      paging: {
        pageSize: 8,
        pageCount: Math.max(1, Math.ceil(body.vendors.length / 8)),
        initialPage: 1
      },
      overflow: {
        vendorCount: body.vendorCount,
        projectedVendorCount: body.vendors.length,
        vendorOverflow: body.vendorOverflow,
        text: body.vendorOverflow > 0
          ? 'Showing ' + String(body.vendors.length) + ' of ' + String(body.vendorCount) +
            ' accessible vendors. ' + String(body.vendorOverflow) +
            ' additional vendors are outside this bounded view.'
          : null
      },
      empty: {
        state: body.emptyState,
        heading: body.emptyState === 'complete-empty' ? 'No vendor agreements to show' : null,
        body: body.emptyState === 'complete-empty'
          ? 'Skopeo found no accessible vendor folders in the complete enrolled corpus. Check the Drive folder or turn off Skopeo.'
          : null
      }
    };
    model.folder.vendors.forEach(function(vendor) {
      if (vendor.notificationDelivery && vendor.notificationDelivery.action) {
        model.actionIds.push(vendor.notificationDelivery.action.actionId);
      }
    });
    model.askEntries = Array.isArray(body.askScopes) ? body.askScopes.map(composeAskEntry) : [];
    return model;
  }

  function citationAction(actionId, label, placement) {
    return {
      kind: 'citation-open',
      actionId: actionId,
      label: label,
      placement: placement
    };
  }

  function composeFact(value) {
    var typeLabel = FACT_COPY[value.type];
    return {
      type: value.type,
      typeLabel: typeLabel,
      value: value.value,
      evidenceRole: value.evidenceRole,
      evidenceLabel: value.evidenceRole === 'governing' ? 'Governing evidence' : 'Relevant history',
      trustState: value.trustState,
      trustLabel: TRUST_COPY[value.trustState],
      citationLabel: value.citationLabel,
      action: value.actionToken === null ? null : citationAction(
        value.actionToken, 'Open source for ' + typeLabel, 'fact'
      )
    };
  }

  function sortFacts(values) {
    return values.map(function(row, index) { return { row: composeFact(row), index: index }; })
      .sort(function(left, right) {
        var difference = FACT_ORDER.indexOf(left.row.type) - FACT_ORDER.indexOf(right.row.type);
        return difference || left.index - right.index;
      }).map(function(value) { return value.row; });
  }

  function composeReading(projection) {
    var body = projection.body;
    var model = contractBase(projection, 'reading', 'Agreement reading', READING_SECTION_ORDER);
    var stateCopy = READING_COPY[body.readingState];
    var governing = sortFacts(body.facts.filter(function(fact) { return fact.evidenceRole === 'governing'; }));
    var history = sortFacts(body.facts.filter(function(fact) { return fact.evidenceRole === 'history'; }));
    var action = body.governingAction.state === 'not-available' ? null : citationAction(
      body.governingAction.actionToken,
      body.governingAction.state === 'clause' ? 'Open governing clause' : 'Open governing document',
      'primary'
    );
    if (history.length === 0) {
      model.sectionOrder = model.sectionOrder.filter(function(section) { return section !== 'relevant-history'; });
    }
    model.reading = {
      banner: {
        state: body.readingState,
        label: stateCopy.label,
        title: body.documentLabel,
        explanation: stateCopy.explanation,
        definitive: stateCopy.definitive,
        sourceState: body.sourceState,
        sourceLabel: SOURCE_COPY[body.sourceState],
        action: action,
        actionStatus: action === null ? 'Governing source not available' : null
      },
      governingFacts: governing,
      relevantHistory: history,
      gaps: body.gaps.map(composeGap),
      policyAndDelivery: [
        {
          key: 'policy-document', label: 'Policy document', state: body.policyDocument,
          value: body.policyDocument === 'on-file' ? 'Policy document on file' :
            body.policyDocument === 'missing' ? 'Policy document missing' : 'Policy document not evaluated'
        },
        {
          key: 'memo-requirement', label: 'Memo requirement', state: body.memoRequirement,
          value: 'Not evaluated'
        }
      ],
      factOverflow: body.factOverflow,
      factOverflowText: body.factOverflow > 0 ? '+' + String(body.factOverflow) + ' cited facts not shown' : null,
      gapOverflow: body.gapOverflow,
      gapOverflowText: body.gapOverflow > 0
        ? '+' + String(body.gapOverflow) + ' conflicts or gaps not shown' : null,
      empty: {
        state: body.emptyState,
        heading: body.emptyState === 'complete-empty' ? 'No cited facts available' : null,
        body: body.emptyState === 'complete-empty'
          ? 'Skopeo found no exact facts it can support from the current accessible evidence.'
          : null
      }
    };
    var notificationDelivery = composeNotificationDelivery(body.notificationDelivery, true);
    if (notificationDelivery) model.reading.policyAndDelivery.push(notificationDelivery);
    if (action) model.actionIds.push(action.actionId);
    governing.concat(history).forEach(function(fact) {
      if (fact.action) model.actionIds.push(fact.action.actionId);
    });
    if (notificationDelivery && notificationDelivery.action) {
      model.actionIds.push(notificationDelivery.action.actionId);
    }
    model.askEntries = Array.isArray(body.askScopes) ? body.askScopes.map(composeAskEntry) : [];
    return model;
  }

  function composeContractClosed(projection, reason) {
    var model = contractBase(projection, 'contract-closed', 'Contract view', ['blocker']);
    model.blocker = {
      reason: reason,
      heading: 'Contract view unavailable',
      body: CLOSED_COPY,
      recovery: 'Reopen the folder or document and invoke Skopeo again.'
    };
    return model;
  }

  var ASK_MODEL_KEYS = Object.freeze([
    'askModelVersion', 'authority', 'attention', 'mode', 'title', 'sectionOrder',
    'scope', 'composer', 'answer', 'confirmation', 'actionIds'
  ]);
  var ASK_SECTION_ORDER = Object.freeze([
    'back', 'heading', 'scope', 'question', 'scope-choices', 'actions', 'privacy'
  ]);
  var ANSWER_SECTION_ORDER = Object.freeze([
    'answer-state', 'conclusion', 'governing-evidence', 'relevant-history',
    'conflicts-and-gaps', 'policy-safeguards', 'sources', 'result-actions'
  ]);
  var ASK_ERROR_COPY = deepFreeze({
    'invalid-question': 'Skopeo can’t evaluate this question safely. Rephrase it using contract facts or dates.',
    'provider-unavailable': 'Skopeo couldn’t evaluate this question with the configured provider. Check provider settings and ask again.',
    'authority-changed': 'This evidence scope changed. Reopen the contract view and ask again.'
  });
  var ANSWER_BANNER_COPY = deepFreeze({
    answered: {
      label: 'Answered',
      explanation: 'The conclusion below is supported by the complete current accessible evidence for this scope.'
    },
    'review-required': {
      label: 'Review required',
      explanation: 'Current evidence contains a conflict or policy safeguard that requires human review before a decision can be cleared.'
    },
    abstained: {
      label: 'Abstained',
      explanation: 'Skopeo can’t support a material conclusion from the complete current accessible evidence.'
    }
  });
  var ANSWER_TRUST_COPY = deepFreeze({
    accepted: 'Accepted',
    extracted: 'Extracted',
    ambiguous: 'Ambiguous',
    'review-required': 'Review required'
  });
  var ANSWER_DETAIL_COPY = deepFreeze({
    'governing-conflict': 'Evidence conflict',
    'source-conflict': 'Evidence conflict',
    'incomplete-evidence': 'Incomplete evidence',
    'source-inaccessible': 'Source inaccessible',
    'source-unreadable': 'Source unreadable',
    'index-incomplete': 'Index incomplete',
    'governing-review-required': 'Governing state review required',
    'document-10-missing': 'Document 10 missing',
    'document-10-inaccessible': 'Document 10 inaccessible',
    'memo-missing': 'Required memo missing',
    'memo-inaccessible': 'Required memo inaccessible'
  });
  var POLICY_REASON_COPY = deepFreeze({
    'document-10-unreviewed': 'Review Document 10 before clearing this decision.',
    'document-10-missing': 'Document 10 is missing.',
    'document-10-inaccessible': 'Document 10 isn’t accessible with the current account.',
    'document-10-stale': 'Document 10 changed since review.',
    'governing-conflict': 'Governing evidence requires review.',
    'memo-missing': 'The required human-authored memo is missing.',
    'memo-inaccessible': 'The required memo isn’t accessible.',
    'memo-incomplete': 'Memo status requires review.'
  });
  var POLICY_ACTION_COPY = deepFreeze({
    'review-document-10': 'Review Document 10',
    'acknowledge-document-10': 'I reviewed Document 10',
    'configure-document-10': 'Configure Document 10',
    'replace-document-10': 'Replace Document 10',
    'clear-document-10': 'Clear Document 10',
    'classify-complex': 'Classify as complex',
    'classify-routine': 'Remove complex classification',
    'open-existing-memo': 'Open human-authored memo'
  });

  function askScopeModel(scope) {
    return {
      kind: scope.kind,
      label: scope.label,
      scopeToken: scope.scopeToken,
      summary: scope.label
    };
  }

  function localAskAction(kind, label) {
    return { kind: kind, label: label };
  }

  function askBase(projection, mode, title, sectionOrder) {
    return {
      askModelVersion: ASK_MODEL_VERSION,
      authority: contractAuthority(projection),
      attention: 'focused',
      mode: mode,
      title: title,
      sectionOrder: sectionOrder.slice(),
      scope: askScopeModel(projection.body.scope),
      composer: null,
      answer: null,
      confirmation: null,
      actionIds: []
    };
  }

  function composeFocusedAsk(projection) {
    var body = projection.body;
    var model = askBase(projection, 'ask', 'Ask contract evidence', ASK_SECTION_ORDER);
    var question = body.question;
    var error = body.error === null ? null : {
      state: body.error,
      message: ASK_ERROR_COPY[body.error]
    };
    model.composer = {
      eyebrow: 'ASK CONTRACT EVIDENCE',
      state: body.state,
      question: question,
      fieldLabel: 'Question',
      helper: 'Ask about governing terms, exact dates, conflicts, or accessible history.',
      questionLimit: 2000,
      characterCount: question === null ? 0 : Array.from(question).length,
      showCharacterCount: question !== null && Array.from(question).length >= 1800,
      readOnly: body.state === 'checking',
      status: body.state === 'checking' ? 'Checking accessible evidence…' : null,
      error: error,
      primaryAction: body.state === 'checking' ? null :
        localAskAction('ask-dispatch', 'Ask contract question'),
      clearAction: body.state !== 'checking' && question !== null
        ? localAskAction('ask-clear', 'Clear question') : null,
      cancelAction: body.state === 'checking'
        ? localAskAction('ask-cancel', 'Cancel current question') : null,
      backAction: localAskAction('ask-back', 'Back to contract view'),
      privacy: 'Skopeo uses only currently accessible evidence for this scope.'
    };
    return model;
  }

  function answerEvidenceRow(value, role) {
    return {
      claim: value.claim,
      value: value.value,
      evidenceRole: role,
      evidenceLabel: role === 'governing' ? 'Governing evidence' : 'Relevant history',
      trustState: value.trustState,
      trustLabel: ANSWER_TRUST_COPY[value.trustState],
      citationLabel: value.citationLabel,
      action: citationAction(
        value.actionToken, 'Open source for ' + value.claim, 'answer-evidence'
      )
    };
  }

  function answerDetailRow(value, kind) {
    return {
      kind: kind,
      label: ANSWER_DETAIL_COPY[value.type],
      detail: value.detail
    };
  }

  function document10Copy(document10) {
    if (document10.state === 'current') return document10.reviewed
      ? 'Document 10 reviewed for this decision'
      : 'Decision blocked · Review Document 10';
    if (document10.state === 'missing') return 'Decision blocked · Document 10 is missing';
    if (document10.state === 'inaccessible') {
      return 'Decision blocked · Document 10 isn’t accessible with the current account';
    }
    return 'Decision blocked · Document 10 changed since review';
  }

  function memoCopy(memo) {
    if (memo.state === 'on-file') return 'Human-authored memo on file';
    if (memo.state === 'proven-missing') {
      return 'Decision blocked · Required human-authored memo is missing';
    }
    if (memo.state === 'inaccessible') return 'Decision blocked · Required memo isn’t accessible';
    return 'Decision blocked · Memo status requires review';
  }

  function composePolicyAction(value) {
    return {
      kind: 'policy-action',
      actionId: value.actionId,
      label: POLICY_ACTION_COPY[value.label],
      requiresConfirmation: value.requiresConfirmation
    };
  }

  function composePolicy(policy, policyActions) {
    if (policy === null) return null;
    var output = {
      clearance: {
        state: policy.clearance,
        label: policy.clearance === 'blocked' ? 'Blocked' : 'Cleared'
      },
      reasons: policy.reasons.map(function(reason) { return POLICY_REASON_COPY[reason]; }),
      document10: {
        state: policy.document10.state,
        reviewed: policy.document10.reviewed,
        label: document10Copy(policy.document10)
      },
      actions: policyActions.map(composePolicyAction)
    };
    if (Object.prototype.hasOwnProperty.call(policy, 'memo')) {
      output.memo = {
        state: policy.memo.state,
        satisfied: policy.memo.satisfied,
        label: memoCopy(policy.memo)
      };
    }
    return output;
  }

  function composeAnswer(projection) {
    var body = projection.body;
    var answer = body.answer;
    var banner = ANSWER_BANNER_COPY[answer.outcome];
    var model = askBase(projection, 'answer', banner.label, ANSWER_SECTION_ORDER);
    var governing = answer.governingEvidence.map(function(row) {
      return answerEvidenceRow(row, 'governing');
    });
    var history = answer.historyEvidence.map(function(row) {
      return answerEvidenceRow(row, 'history');
    });
    var policy = composePolicy(body.policy, body.policyActions);
    if (history.length === 0) {
      model.sectionOrder = model.sectionOrder.filter(function(section) {
        return section !== 'relevant-history';
      });
    }
    if (policy === null) {
      model.sectionOrder = model.sectionOrder.filter(function(section) {
        return section !== 'policy-safeguards';
      });
    }
    model.answer = {
      question: body.question,
      banner: {
        outcome: answer.outcome,
        label: banner.label,
        explanation: banner.explanation
      },
      conclusion: answer.conclusion === null ? null : {
        heading: 'Conclusion',
        text: answer.conclusion
      },
      trust: {
        state: answer.trust.state,
        label: ANSWER_TRUST_COPY[answer.trust.state],
        explanation: answer.trust.explanation
      },
      governingEvidence: governing,
      relevantHistory: history,
      conflictsAndGaps: answer.conflicts.map(function(row) {
        return answerDetailRow(row, 'conflict');
      }).concat(answer.gaps.map(function(row) {
        return answerDetailRow(row, 'gap');
      })),
      policySafeguards: policy,
      sources: answer.sources.map(function(source) {
        return {
          label: source.label,
          evidenceRole: source.evidenceRole,
          evidenceLabel: source.evidenceRole === 'governing' ? 'Governing evidence' : 'Relevant history',
          action: citationAction(
            source.actionToken,
            'Open source for ' + source.label,
            'answer-source'
          )
        };
      }),
      sourceOverflow: answer.sourceOverflow,
      sourceOverflowText: answer.sourceOverflow > 0
        ? '+' + String(answer.sourceOverflow) + ' additional sources not shown' : null,
      empty: answer.outcome === 'abstained' && governing.length === 0 && history.length === 0
        ? {
          heading: 'No supported conclusion',
          body: 'Skopeo found no complete current evidence that supports a material conclusion. Review the listed gaps or ask a narrower contract question.'
        }
        : null,
      resultActions: {
        askAnother: localAskAction('ask-another', 'Ask another contract question'),
        back: localAskAction('ask-back', 'Back to contract view')
      }
    };
    governing.concat(history).forEach(function(row) {
      model.actionIds.push(row.action.actionId);
    });
    if (policy) policy.actions.forEach(function(action) { model.actionIds.push(action.actionId); });
    return model;
  }

  function validateLocalAction(value, kind, label) {
    return hasExactKeys(value, ['kind', 'label']) && value.kind === kind && value.label === label;
  }

  function validateAskScopeModel(value) {
    return hasExactKeys(value, ['kind', 'label', 'scopeToken', 'summary']) &&
      ['agreement', 'vendor', 'corpus'].includes(value.kind) && contractText(value.label, 160) &&
      value.summary === value.label && contractToken(value.scopeToken);
  }

  function validateFocusedAskModel(model) {
    var value = model.composer;
    if (model.title !== 'Ask contract evidence' || !sameArray(model.sectionOrder, ASK_SECTION_ORDER) ||
        model.answer !== null || model.confirmation !== null || model.actionIds.length !== 0 ||
        !hasExactKeys(value, [
          'eyebrow', 'state', 'question', 'fieldLabel', 'helper', 'questionLimit',
          'characterCount', 'showCharacterCount', 'readOnly', 'status', 'error',
          'primaryAction', 'clearAction', 'cancelAction', 'backAction', 'privacy'
        ]) || value.eyebrow !== 'ASK CONTRACT EVIDENCE' ||
        !['editing', 'checking', 'error'].includes(value.state) ||
        !(value.question === null || contractText(value.question, 2000)) ||
        value.fieldLabel !== 'Question' ||
        value.helper !== 'Ask about governing terms, exact dates, conflicts, or accessible history.' ||
        value.questionLimit !== 2000 || !nonNegativeSafeInteger(value.characterCount) ||
        value.characterCount !== (value.question === null ? 0 : Array.from(value.question).length) ||
        value.showCharacterCount !== (value.question !== null && value.characterCount >= 1800) ||
        value.readOnly !== (value.state === 'checking') ||
        value.status !== (value.state === 'checking' ? 'Checking accessible evidence…' : null) ||
        !validateLocalAction(value.backAction, 'ask-back', 'Back to contract view') ||
        value.privacy !== 'Skopeo uses only currently accessible evidence for this scope.') return false;
    if (value.state === 'checking') {
      return value.question !== null && value.error === null && value.primaryAction === null &&
        value.clearAction === null &&
        validateLocalAction(value.cancelAction, 'ask-cancel', 'Cancel current question');
    }
    if (!validateLocalAction(value.primaryAction, 'ask-dispatch', 'Ask contract question') ||
        value.cancelAction !== null ||
        (value.question === null ? value.clearAction !== null :
          !validateLocalAction(value.clearAction, 'ask-clear', 'Clear question'))) return false;
    if (value.state === 'error') {
      return hasExactKeys(value.error, ['state', 'message']) &&
        ASK_ERROR_COPY[value.error.state] === value.error.message;
    }
    return value.error === null;
  }

  function validateAnswerAction(value, placement, label, actionIds) {
    if (!validateContractAction(value, placement, label)) return false;
    actionIds.push(value.actionId);
    return true;
  }

  function validateAnswerEvidence(value, role, actionIds) {
    return hasExactKeys(value, [
      'claim', 'value', 'evidenceRole', 'evidenceLabel', 'trustState', 'trustLabel',
      'citationLabel', 'action'
    ]) && contractText(value.claim, 512) && contractText(value.value, 512) &&
      value.evidenceRole === role &&
      value.evidenceLabel === (role === 'governing' ? 'Governing evidence' : 'Relevant history') &&
      ANSWER_TRUST_COPY[value.trustState] === value.trustLabel &&
      contractText(value.citationLabel, 256) && validateAnswerAction(
        value.action, 'answer-evidence', 'Open source for ' + value.claim, actionIds
      );
  }

  function validateAnswerPolicy(value, actionIds) {
    if (value === null) return true;
    var hasMemo = Object.prototype.hasOwnProperty.call(value, 'memo');
    var keys = ['clearance', 'reasons', 'document10', 'actions'];
    if (hasMemo) keys.push('memo');
    if (!hasExactKeys(value, keys) ||
        !hasExactKeys(value.clearance, ['state', 'label']) ||
        !['blocked', 'cleared'].includes(value.clearance.state) ||
        value.clearance.label !== (value.clearance.state === 'blocked' ? 'Blocked' : 'Cleared') ||
        !isDenseDataArray(value.reasons, 8) ||
        value.reasons.some(function(reason) {
          return !Object.keys(POLICY_REASON_COPY).some(function(key) {
            return POLICY_REASON_COPY[key] === reason;
          });
        }) || !hasExactKeys(value.document10, ['state', 'reviewed', 'label']) ||
        !['current', 'missing', 'inaccessible', 'stale'].includes(value.document10.state) ||
        typeof value.document10.reviewed !== 'boolean' ||
        value.document10.label !== document10Copy(value.document10) ||
        !isDenseDataArray(value.actions, 8)) return false;
    if (hasMemo && (!hasExactKeys(value.memo, ['state', 'satisfied', 'label']) ||
        !['on-file', 'proven-missing', 'inaccessible', 'incomplete'].includes(value.memo.state) ||
        value.memo.satisfied !== (value.memo.state === 'on-file') ||
        value.memo.label !== memoCopy(value.memo))) return false;
    return value.actions.every(function(action) {
      if (!hasExactKeys(action, ['kind', 'actionId', 'label', 'requiresConfirmation']) ||
          action.kind !== 'policy-action' || !contractToken(action.actionId) ||
          !Object.keys(POLICY_ACTION_COPY).some(function(key) {
            return POLICY_ACTION_COPY[key] === action.label;
          }) || typeof action.requiresConfirmation !== 'boolean') return false;
      actionIds.push(action.actionId);
      return true;
    });
  }

  function validateAnswerModel(model, discovered) {
    var value = model.answer;
    if (!value || model.composer !== null || model.confirmation !== null ||
        !hasExactKeys(value, [
          'question', 'banner', 'conclusion', 'trust', 'governingEvidence',
          'relevantHistory', 'conflictsAndGaps', 'policySafeguards', 'sources',
          'sourceOverflow', 'sourceOverflowText', 'empty', 'resultActions'
        ]) || !contractText(value.question, 2000) ||
        !hasExactKeys(value.banner, ['outcome', 'label', 'explanation']) ||
        !ANSWER_BANNER_COPY[value.banner.outcome] ||
        value.banner.label !== ANSWER_BANNER_COPY[value.banner.outcome].label ||
        value.banner.explanation !== ANSWER_BANNER_COPY[value.banner.outcome].explanation ||
        !hasExactKeys(value.trust, ['state', 'label', 'explanation']) ||
        value.trust.label !== ANSWER_TRUST_COPY[value.trust.state] ||
        !contractText(value.trust.explanation, 512) ||
        !isDenseDataArray(value.governingEvidence, 8) ||
        !value.governingEvidence.every(function(row) {
          return validateAnswerEvidence(row, 'governing', discovered);
        }) || !isDenseDataArray(value.relevantHistory, 6) ||
        !value.relevantHistory.every(function(row) {
          return validateAnswerEvidence(row, 'history', discovered);
        }) || !isDenseDataArray(value.conflictsAndGaps, 16) ||
        !value.conflictsAndGaps.every(function(row) {
          return hasExactKeys(row, ['kind', 'label', 'detail']) &&
            ['conflict', 'gap'].includes(row.kind) &&
            Object.keys(ANSWER_DETAIL_COPY).some(function(key) {
              return ANSWER_DETAIL_COPY[key] === row.label;
            }) && contractText(row.detail, 512);
        }) || !validateAnswerPolicy(value.policySafeguards, discovered) ||
        !isDenseDataArray(value.sources, 12) || !nonNegativeSafeInteger(value.sourceOverflow) ||
        value.sourceOverflowText !== (value.sourceOverflow > 0
          ? '+' + String(value.sourceOverflow) + ' additional sources not shown' : null) ||
        !hasExactKeys(value.resultActions, ['askAnother', 'back']) ||
        !validateLocalAction(value.resultActions.askAnother, 'ask-another', 'Ask another contract question') ||
        !validateLocalAction(value.resultActions.back, 'ask-back', 'Back to contract view')) return false;
    var sourceActions = [];
    if (!value.sources.every(function(source) {
      return hasExactKeys(source, ['label', 'evidenceRole', 'evidenceLabel', 'action']) &&
        contractText(source.label, 256) && ['governing', 'history'].includes(source.evidenceRole) &&
        source.evidenceLabel === (source.evidenceRole === 'governing'
          ? 'Governing evidence' : 'Relevant history') && validateAnswerAction(
          source.action, 'answer-source', 'Open source for ' + source.label, sourceActions
        );
    }) || sourceActions.length !== value.governingEvidence.length + value.relevantHistory.length ||
        sourceActions.some(function(actionId) { return !discovered.includes(actionId); })) return false;
    var expectedSections = ANSWER_SECTION_ORDER.filter(function(section) {
      return !((section === 'relevant-history' && value.relevantHistory.length === 0) ||
        (section === 'policy-safeguards' && value.policySafeguards === null));
    });
    if (!sameArray(model.sectionOrder, expectedSections) || model.title !== value.banner.label) return false;
    if (value.banner.outcome === 'abstained') {
      if (value.conclusion !== null) return false;
    } else if (!hasExactKeys(value.conclusion, ['heading', 'text']) ||
        value.conclusion.heading !== 'Conclusion' || !contractText(value.conclusion.text, 1200) ||
        value.governingEvidence.length === 0) return false;
    var emptyExpected = value.banner.outcome === 'abstained' &&
      value.governingEvidence.length === 0 && value.relevantHistory.length === 0;
    if (emptyExpected) {
      if (!hasExactKeys(value.empty, ['heading', 'body']) ||
          value.empty.heading !== 'No supported conclusion' ||
          value.empty.body !== 'Skopeo found no complete current evidence that supports a material conclusion. Review the listed gaps or ask a narrower contract question.') return false;
    } else if (value.empty !== null) return false;
    return true;
  }

  function validateContractAskModel(model) {
    try {
      if (!isDeepFrozenData(model) || !hasExactKeys(model, ASK_MODEL_KEYS) ||
          model.askModelVersion !== ASK_MODEL_VERSION || model.attention !== 'focused' ||
          !validateContractAuthority(model.authority) || !validateAskScopeModel(model.scope) ||
          !isDenseDataArray(model.actionIds, 20) || !model.actionIds.every(contractToken) ||
          new Set(model.actionIds).size !== model.actionIds.length ||
          !contractDataSafe(model, '', new Set())) return false;
      if (model.mode === 'ask') return validateFocusedAskModel(model);
      if (model.mode !== 'answer') return false;
      var discovered = [];
      return validateAnswerModel(model, discovered) && discovered.length === model.actionIds.length &&
        discovered.every(function(actionId, index) { return actionId === model.actionIds[index]; });
    } catch (_error) {
      return false;
    }
  }

  function composeContractAsk(value) {
    try {
      var schema = hudSchemaApi();
      var projection = schema && schema.parseProjection(value);
      if (!projection || projection.currentness !== 'current' || projection.result !== 'complete') return null;
      var model = projection.mode === 'ask' ? composeFocusedAsk(projection) :
        projection.mode === 'answer' ? composeAnswer(projection) : null;
      if (!model) return null;
      deepFreeze(model);
      return validateContractAskModel(model) ? model : null;
    } catch (_error) {
      return null;
    }
  }

  function sameArray(value, expected) {
    return isDenseDataArray(value, expected.length) && value.length === expected.length &&
      value.every(function(item, index) { return item === expected[index]; });
  }

  function validateContractAuthority(value) {
    return hasExactKeys(value, CONTRACT_AUTHORITY_KEYS) && positiveSafeInteger(value.generation) &&
      exactHttpsOrigin(value.exactOrigin) && contractToken(value.profileVersion) &&
      positiveSafeInteger(value.contextEpoch) && contractToken(value.semanticEntityToken) &&
      contractToken(value.requestActionToken) && contractToken(value.projectionToken);
  }

  function validateContractAction(value, placement, label) {
    return value === null || (hasExactKeys(value, ['kind', 'actionId', 'label', 'placement']) &&
      value.kind === 'citation-open' && contractToken(value.actionId) && value.placement === placement &&
      value.label === label);
  }

  function validateAskEntries(value, mode) {
    if (!isDenseDataArray(value, 33)) return false;
    var tokens = new Set();
    return value.every(function(entry) {
      var expectedLabel = entry && entry.kind === 'agreement' ? 'Ask about this agreement' :
        entry && entry.kind === 'corpus' ? 'Ask enrolled corpus' :
          entry && entry.kind === 'vendor' ? 'Ask about ' + entry.label : null;
      if (!hasExactKeys(entry, ['kind', 'label', 'scopeToken', 'action']) ||
          !['agreement', 'vendor', 'corpus'].includes(entry.kind) ||
          (mode === 'folder' && entry.kind === 'agreement') ||
          (mode === 'reading' && entry.kind === 'corpus') ||
          !contractText(entry.label, 160) || !contractToken(entry.scopeToken) ||
          tokens.has(entry.scopeToken) ||
          !hasExactKeys(entry.action, ['kind', 'label']) || entry.action.kind !== 'ask-entry' ||
          entry.action.label !== expectedLabel) return false;
      tokens.add(entry.scopeToken);
      return true;
    });
  }

  function validateSlot(value, allowedStates, label, values) {
    return hasExactKeys(value, ['state', 'label', 'value']) && allowedStates.includes(value.state) &&
      value.label === label && values.includes(value.value);
  }

  function validateGapModel(value) {
    return hasExactKeys(value, ['type', 'priority', 'label']) &&
      Object.prototype.hasOwnProperty.call(GAP_COPY, value.type) &&
      ['normal', 'urgent'].includes(value.priority) && value.label === GAP_COPY[value.type];
  }

  function validateAlertSlot(value, includeKey, actionIds) {
    var keys = [
      'state', 'label', 'value', 'detail', 'deadlineCivilDate',
      'alertCivilDate', 'action'
    ];
    if (includeKey) keys.push('key');
    if (!hasExactKeys(value, keys) || (includeKey && value.key !== 'notification-delivery') ||
        !Object.prototype.hasOwnProperty.call(ALERT_STATE_COPY, value.state) ||
        value.label !== 'Local alert' || value.value !== ALERT_STATE_COPY[value.state] ||
        !contractText(value.detail, 1024) ||
        !(value.deadlineCivilDate === null || /^\d{4}-\d{2}-\d{2}$/.test(value.deadlineCivilDate)) ||
        !(value.alertCivilDate === null || /^\d{4}-\d{2}-\d{2}$/.test(value.alertCivilDate)) ||
        (value.state !== 'not-locally-deliverable' &&
          (value.deadlineCivilDate === null || value.alertCivilDate === null))) return false;
    if (value.action === null) return true;
    var expectedLabel = value.state === 'not-locally-deliverable'
      ? 'Map current owner to this Chrome user'
      : 'Remove current owner mapping';
    if (!hasExactKeys(value.action, ['kind', 'actionId', 'label', 'requiresConfirmation']) ||
        value.action.kind !== 'alert-action' || !contractToken(value.action.actionId) ||
        value.action.label !== expectedLabel || value.action.requiresConfirmation !== true) return false;
    actionIds.push(value.action.actionId);
    return true;
  }

  function validateFolderVendor(value, actionIds) {
    if (!hasExactKeys(value, [
      'vendorToken', 'label', 'slotOrder', 'owner', 'documents', 'governing',
      'nextMaterialDate', 'consequence', 'memoEvidence', 'policyDocument',
      'memoRequirement', 'notificationDelivery', 'gaps', 'gapOverflow',
      'gapOverflowText', 'gapEmptyText'
    ]) || !contractToken(value.vendorToken) || !contractText(value.label, 160) ||
        !sameArray(value.slotOrder, VENDOR_SLOT_ORDER) ||
        !hasExactKeys(value.owner, ['state', 'label', 'value']) ||
        !['assigned', 'unassigned', 'not-evaluated'].includes(value.owner.state) ||
        value.owner.label !== 'Owner' || !contractText(value.owner.value, 160) ||
        (value.owner.state === 'unassigned' && value.owner.value !== 'Owner not assigned') ||
        (value.owner.state === 'not-evaluated' && value.owner.value !== 'Not evaluated') ||
        !hasExactKeys(value.documents, [
          'state', 'label', 'value', 'indexLabel', 'total', 'ready', 'pending',
          'unreadable', 'downloadBlocked', 'inaccessible', 'missing'
        ]) || !Object.prototype.hasOwnProperty.call(INDEX_COPY, value.documents.state) ||
        value.documents.label !== 'Documents and index' ||
        value.documents.indexLabel !== INDEX_COPY[value.documents.state] ||
        !contractText(value.documents.value, 1024) || value.documents.value !== documentSummary(value.documents) ||
        !hasExactKeys(value.governing, ['state', 'label', 'value']) ||
        !Object.prototype.hasOwnProperty.call(GOVERNING_COPY, value.governing.state) ||
        value.governing.label !== 'Governing status' ||
        value.governing.value !== GOVERNING_COPY[value.governing.state] ||
        !hasExactKeys(value.nextMaterialDate, [
          'state', 'label', 'type', 'typeLabel', 'civilDate', 'dateLabel', 'value',
          'trustState', 'trustLabel'
        ]) || value.nextMaterialDate.label !== 'Next material date' ||
        !hasExactKeys(value.consequence, ['state', 'label', 'value']) ||
        !['accepted', 'none', 'not-evaluated'].includes(value.consequence.state) ||
        value.consequence.label !== 'If no action' || !contractText(value.consequence.value, 1024) ||
        (value.consequence.state === 'none' && value.consequence.value !== 'No consequence proven') ||
        (value.consequence.state === 'not-evaluated' && value.consequence.value !== 'Consequence not evaluated') ||
        !validateSlot(value.memoEvidence, ['on-file', 'not-evaluated'], 'Memo evidence', [
          'Memo on file', 'Memo evidence not evaluated'
        ]) || !validateSlot(value.policyDocument, ['on-file', 'missing', 'not-evaluated'], 'Policy document', [
          'Policy document on file', 'Policy document missing', 'Policy document not evaluated'
        ]) || !validateSlot(value.memoRequirement, ['not-evaluated'], 'Memo requirement', ['Not evaluated']) ||
        !(value.notificationDelivery === null ||
          validateAlertSlot(value.notificationDelivery, false, actionIds)) ||
        !isDenseDataArray(value.gaps, 3) || !value.gaps.every(validateGapModel) ||
        !nonNegativeSafeInteger(value.gapOverflow) ||
        (value.gapOverflow > 0 && value.gaps.length !== 3) ||
        value.gapOverflowText !== (value.gapOverflow > 0 ? '+' + String(value.gapOverflow) + ' more gaps' : null) ||
        value.gapEmptyText !== (value.gaps.length === 0
          ? (value.documents.state === 'complete' ? 'No urgent gaps proven' : 'Urgent gaps not evaluated')
          : null)) {
      return false;
    }
    var counts = ['total', 'ready', 'pending', 'unreadable', 'downloadBlocked', 'inaccessible', 'missing'];
    if (counts.some(function(key) { return !nonNegativeSafeInteger(value.documents[key]); }) ||
        value.documents.total !== counts.slice(1).reduce(function(sum, key) {
          return sum + value.documents[key];
        }, 0) ||
        (value.memoEvidence.state === 'on-file' && value.memoEvidence.value !== 'Memo on file') ||
        (value.memoEvidence.state === 'not-evaluated' &&
          value.memoEvidence.value !== 'Memo evidence not evaluated') ||
        (value.policyDocument.state === 'on-file' &&
          value.policyDocument.value !== 'Policy document on file') ||
        (value.policyDocument.state === 'missing' &&
          value.policyDocument.value !== 'Policy document missing') ||
        (value.policyDocument.state === 'not-evaluated' &&
          value.policyDocument.value !== 'Policy document not evaluated')) return false;
    if (value.nextMaterialDate.state === 'accepted') {
      if (!Object.prototype.hasOwnProperty.call(DATE_TYPE_COPY, value.nextMaterialDate.type) ||
          value.nextMaterialDate.typeLabel !== DATE_TYPE_COPY[value.nextMaterialDate.type] ||
          !/^\d{4}-\d{2}-\d{2}$/.test(value.nextMaterialDate.civilDate) ||
          !contractText(value.nextMaterialDate.dateLabel, 160) ||
          value.nextMaterialDate.value !== value.nextMaterialDate.typeLabel + ' — ' + value.nextMaterialDate.dateLabel ||
          value.nextMaterialDate.trustLabel !== TRUST_COPY[value.nextMaterialDate.trustState]) return false;
    } else if (!['none', 'not-evaluated'].includes(value.nextMaterialDate.state) ||
        value.nextMaterialDate.type !== null || value.nextMaterialDate.typeLabel !== null ||
        value.nextMaterialDate.civilDate !== null || value.nextMaterialDate.dateLabel !== null ||
        value.nextMaterialDate.value !== (value.nextMaterialDate.state === 'none'
          ? 'No material date proven' : 'Not evaluated') || value.nextMaterialDate.trustState !== null ||
        value.nextMaterialDate.trustLabel !== null) return false;
    return true;
  }

  function validateDateSummaryModel(value) {
    return hasExactKeys(value, [
      'vendorToken', 'vendorLabel', 'type', 'typeLabel', 'civilDate', 'dateLabel',
      'trustState', 'trustLabel', 'consequenceLabel', 'consequence'
    ]) && contractToken(value.vendorToken) && contractText(value.vendorLabel, 160) &&
      Object.prototype.hasOwnProperty.call(DATE_TYPE_COPY, value.type) &&
      value.typeLabel === DATE_TYPE_COPY[value.type] && /^\d{4}-\d{2}-\d{2}$/.test(value.civilDate) &&
      contractText(value.dateLabel, 160) && value.trustLabel === TRUST_COPY[value.trustState] &&
      value.consequenceLabel === 'If no action' && contractText(value.consequence, 1024);
  }

  function validateFolderModel(value, actionIds) {
    if (!hasExactKeys(value, [
      'completeness', 'blocker', 'nextMaterialDates', 'nextMaterialDateOverflow',
      'nextMaterialDateOverflowText', 'urgentGaps', 'urgentGapOverflow',
      'urgentGapOverflowText', 'vendors', 'paging', 'overflow', 'empty'
    ]) || !hasExactKeys(value.completeness, ['manifestState', 'label', 'vendorCount']) ||
        value.completeness.manifestState !== 'complete' ||
        value.completeness.label !== 'Complete enrolled corpus' ||
        !nonNegativeSafeInteger(value.completeness.vendorCount) || value.blocker !== null ||
        !isDenseDataArray(value.nextMaterialDates, 3) || !value.nextMaterialDates.every(validateDateSummaryModel) ||
        !nonNegativeSafeInteger(value.nextMaterialDateOverflow) ||
        (value.nextMaterialDateOverflow > 0 && value.nextMaterialDates.length !== 3) ||
        value.nextMaterialDateOverflowText !== (value.nextMaterialDateOverflow > 0
          ? '+' + String(value.nextMaterialDateOverflow) + ' more material dates appear in vendor rows' : null) ||
        !isDenseDataArray(value.urgentGaps, 4) || !value.urgentGaps.every(function(gap) {
          return hasExactKeys(gap, ['vendorToken', 'vendorLabel', 'type', 'priority', 'label']) &&
            contractToken(gap.vendorToken) && contractText(gap.vendorLabel, 160) && gap.priority === 'urgent' &&
            GAP_COPY[gap.type] === gap.label;
        }) || !nonNegativeSafeInteger(value.urgentGapOverflow) ||
        (value.urgentGapOverflow > 0 && value.urgentGaps.length !== 4) ||
        value.urgentGapOverflowText !== (value.urgentGapOverflow > 0
          ? '+' + String(value.urgentGapOverflow) + ' more gaps appear in vendor rows' : null) ||
        !isDenseDataArray(value.vendors, 32) || !value.vendors.every(function(vendor) {
          return validateFolderVendor(vendor, actionIds);
        }) ||
        new Set(value.vendors.map(function(vendor) { return vendor.vendorToken; })).size !== value.vendors.length ||
        !hasExactKeys(value.paging, ['pageSize', 'pageCount', 'initialPage']) ||
        value.paging.pageSize !== 8 || value.paging.initialPage !== 1 ||
        value.paging.pageCount !== Math.max(1, Math.ceil(value.vendors.length / 8)) ||
        !hasExactKeys(value.overflow, [
          'vendorCount', 'projectedVendorCount', 'vendorOverflow', 'text'
        ]) || value.overflow.vendorCount !== value.completeness.vendorCount ||
        value.overflow.projectedVendorCount !== value.vendors.length ||
        value.overflow.vendorCount !== value.vendors.length + value.overflow.vendorOverflow ||
        !hasExactKeys(value.empty, ['state', 'heading', 'body']) ||
        !['not-empty', 'complete-empty'].includes(value.empty.state)) return false;
    for (var dateIndex = 1; dateIndex < value.nextMaterialDates.length; dateIndex += 1) {
      if (compareDateSummary(value.nextMaterialDates[dateIndex - 1], value.nextMaterialDates[dateIndex]) > 0) {
        return false;
      }
    }
    var vendorLabels = Object.create(null);
    value.vendors.forEach(function(vendor) { vendorLabels[vendor.vendorToken] = vendor.label; });
    if (value.nextMaterialDates.some(function(date) {
      return vendorLabels[date.vendorToken] !== date.vendorLabel;
    }) || value.urgentGaps.some(function(gap) {
      return vendorLabels[gap.vendorToken] !== gap.vendorLabel;
    })) return false;
    if (value.empty.state === 'complete-empty') {
      return value.vendors.length === 0 && value.empty.heading === 'No vendor agreements to show' &&
        value.empty.body === 'Skopeo found no accessible vendor folders in the complete enrolled corpus. Check the Drive folder or turn off Skopeo.';
    }
    return value.vendors.length > 0 && value.empty.heading === null && value.empty.body === null;
  }

  function validateFactModel(value, actionIds) {
    var expectedLabel = FACT_COPY[value && value.type];
    if (!hasExactKeys(value, [
      'type', 'typeLabel', 'value', 'evidenceRole', 'evidenceLabel', 'trustState',
      'trustLabel', 'citationLabel', 'action'
    ]) || !expectedLabel || value.typeLabel !== expectedLabel || !contractText(value.value, 1024) ||
        !['governing', 'history'].includes(value.evidenceRole) ||
        value.evidenceLabel !== (value.evidenceRole === 'governing' ? 'Governing evidence' : 'Relevant history') ||
        value.trustLabel !== TRUST_COPY[value.trustState] || !contractText(value.citationLabel, 256) ||
        !validateContractAction(value.action, 'fact', 'Open source for ' + expectedLabel)) return false;
    if (value.action) actionIds.push(value.action.actionId);
    return true;
  }

  function validateReadingModel(value, actionIds) {
    if (!hasExactKeys(value, [
      'banner', 'governingFacts', 'relevantHistory', 'gaps', 'policyAndDelivery',
      'factOverflow', 'factOverflowText', 'gapOverflow', 'gapOverflowText', 'empty'
    ]) || !hasExactKeys(value.banner, [
      'state', 'label', 'title', 'explanation', 'definitive', 'sourceState',
      'sourceLabel', 'action', 'actionStatus'
    ])) return false;
    var stateCopy = READING_COPY[value.banner.state];
    if (!stateCopy || value.banner.label !== stateCopy.label ||
        value.banner.explanation !== stateCopy.explanation ||
        value.banner.definitive !== stateCopy.definitive || !contractText(value.banner.title, 160) ||
        value.banner.sourceLabel !== SOURCE_COPY[value.banner.sourceState]) return false;
    if (value.banner.action) {
      var primaryLabel = value.banner.action.label;
      if (!['Open governing clause', 'Open governing document'].includes(primaryLabel) ||
          !validateContractAction(value.banner.action, 'primary', primaryLabel) ||
          value.banner.actionStatus !== null) return false;
      actionIds.push(value.banner.action.actionId);
    } else if (value.banner.actionStatus !== 'Governing source not available') return false;
    if (!isDenseDataArray(value.governingFacts, 10) || !isDenseDataArray(value.relevantHistory, 10) ||
        value.governingFacts.length + value.relevantHistory.length > 10 ||
        !value.governingFacts.every(function(fact) {
          return validateFactModel(fact, actionIds) && fact.evidenceRole === 'governing';
        }) || !value.relevantHistory.every(function(fact) {
          return validateFactModel(fact, actionIds) && fact.evidenceRole === 'history';
        }) || !isDenseDataArray(value.gaps, 6) || !value.gaps.every(validateGapModel) ||
        !isDenseDataArray(value.policyAndDelivery, 3) ||
        ![2, 3].includes(value.policyAndDelivery.length) ||
        value.policyAndDelivery.slice(0, 2).map(function(slot) { return slot.key; }).join('|') !==
          'policy-document|memo-requirement' ||
        !nonNegativeSafeInteger(value.factOverflow) ||
        (value.factOverflow > 0 && value.governingFacts.length + value.relevantHistory.length !== 10) ||
        value.factOverflowText !== (value.factOverflow > 0
          ? '+' + String(value.factOverflow) + ' cited facts not shown' : null) ||
        !nonNegativeSafeInteger(value.gapOverflow) ||
        (value.gapOverflow > 0 && value.gaps.length !== 6) ||
        value.gapOverflowText !== (value.gapOverflow > 0
          ? '+' + String(value.gapOverflow) + ' conflicts or gaps not shown' : null) ||
        !hasExactKeys(value.empty, ['state', 'heading', 'body'])) return false;
    var expectedSlots = [
      ['policy-document', 'Policy document', ['on-file', 'missing', 'not-evaluated'], [
        'Policy document on file', 'Policy document missing', 'Policy document not evaluated'
      ]],
      ['memo-requirement', 'Memo requirement', ['not-evaluated'], ['Not evaluated']]
    ];
    for (var index = 0; index < expectedSlots.length; index += 1) {
      var slot = value.policyAndDelivery[index];
      var expected = expectedSlots[index];
      if (!hasExactKeys(slot, ['key', 'label', 'state', 'value']) || slot.key !== expected[0] ||
          slot.label !== expected[1] || !expected[2].includes(slot.state) || !expected[3].includes(slot.value)) {
        return false;
      }
    }
    if (value.policyAndDelivery.length === 3 &&
        !validateAlertSlot(value.policyAndDelivery[2], true, actionIds)) return false;
    if ((value.policyAndDelivery[0].state === 'on-file' &&
        value.policyAndDelivery[0].value !== 'Policy document on file') ||
        (value.policyAndDelivery[0].state === 'missing' &&
          value.policyAndDelivery[0].value !== 'Policy document missing') ||
        (value.policyAndDelivery[0].state === 'not-evaluated' &&
          value.policyAndDelivery[0].value !== 'Policy document not evaluated')) return false;
    var orderedFacts = value.governingFacts.concat(value.relevantHistory);
    if (value.governingFacts.some(function(fact, index) {
      return index > 0 && FACT_ORDER.indexOf(value.governingFacts[index - 1].type) > FACT_ORDER.indexOf(fact.type);
    }) || value.relevantHistory.some(function(fact, index) {
      return index > 0 && FACT_ORDER.indexOf(value.relevantHistory[index - 1].type) > FACT_ORDER.indexOf(fact.type);
    }) || orderedFacts.length > 10) return false;
    if (value.empty.state === 'complete-empty') {
      return value.governingFacts.length === 0 && value.relevantHistory.length === 0 && value.gaps.length === 0 &&
        value.empty.heading === 'No cited facts available' &&
        value.empty.body === 'Skopeo found no exact facts it can support from the current accessible evidence.';
    }
    return value.empty.state === 'not-empty' && value.empty.heading === null && value.empty.body === null;
  }

  function validateContractBlocker(value) {
    return hasExactKeys(value, ['reason', 'heading', 'body', 'recovery']) && [
      'invalid-input', 'partial-authority', 'stale-input', 'exact-set-over-cap',
      'vendor-scope-ambiguous', 'evaluation-context-missing', 'access-unavailable',
      'byte-limit-exceeded'
    ].includes(value.reason) &&
      value.heading === 'Contract view unavailable' && value.body === CLOSED_COPY &&
      value.recovery === 'Reopen the folder or document and invoke Skopeo again.';
  }

  function contractDataSafe(value, path, seen) {
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return true;
    if (typeof value === 'string') {
      return path === 'authority.exactOrigin' ? exactHttpsOrigin(value) : contractText(value, 1024);
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    var keys = Reflect.ownKeys(value);
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      if (Array.isArray(value) && key === 'length') continue;
      if (!contractDataSafe(value[key], path ? path + '.' + key : String(key), seen)) return false;
    }
    return true;
  }

  function validateContractViewModel(model) {
    try {
      if (!isDeepFrozenData(model) || !hasExactKeys(model, CONTRACT_MODEL_KEYS) ||
          model.contractModelVersion !== CONTRACT_MODEL_VERSION || model.attention !== 'anchored' ||
          !validateContractAuthority(model.authority) ||
          !isDenseDataArray(model.actionIds, 44) || !model.actionIds.every(contractToken) ||
          new Set(model.actionIds).size !== model.actionIds.length ||
          !contractDataSafe(model, '', new Set()) || !validateAskEntries(model.askEntries, model.mode)) return false;
      var discovered = [];
      if (model.mode === 'folder') {
        if (model.title !== 'Vendor agreements' || !sameArray(model.sectionOrder, FOLDER_SECTION_ORDER) ||
            model.reading !== null || model.blocker !== null ||
            !validateFolderModel(model.folder, discovered)) return false;
      } else if (model.mode === 'reading') {
        var expectedSections = model.reading && model.reading.relevantHistory.length > 0
          ? READING_SECTION_ORDER
          : READING_SECTION_ORDER.filter(function(section) { return section !== 'relevant-history'; });
        if (model.title !== 'Agreement reading' || !sameArray(model.sectionOrder, expectedSections) ||
            model.folder !== null || model.blocker !== null ||
            !validateReadingModel(model.reading, discovered)) return false;
      } else if (model.mode === 'contract-closed') {
        if (model.title !== 'Contract view' || !sameArray(model.sectionOrder, ['blocker']) ||
            model.folder !== null || model.reading !== null || model.actionIds.length !== 0 ||
            model.askEntries.length !== 0 || !validateContractBlocker(model.blocker)) return false;
      } else return false;
      return discovered.length === model.actionIds.length && discovered.every(function(actionId, index) {
        return actionId === model.actionIds[index];
      });
    } catch (_error) {
      return false;
    }
  }

  function composeContractView(value) {
    try {
      var schema = hudSchemaApi();
      var projection = schema && schema.parseProjection(value);
      if (!projection) return null;
      var model;
      if (projection.currentness === 'partial' || projection.result === 'partial') {
        model = composeContractClosed(projection, 'partial-authority');
      } else if (projection.mode === 'folder') {
        model = composeFolder(projection);
      } else if (projection.mode === 'reading') {
        model = composeReading(projection);
      } else if (projection.mode === 'contract-closed') {
        model = composeContractClosed(projection, projection.body.reason);
      } else return null;
      deepFreeze(model);
      return validateContractViewModel(model) ? model : null;
    } catch (_error) {
      return null;
    }
  }

  function validateAuthority(value) {
    return hasExactKeys(value, ['generation', 'exactOrigin', 'profileId', 'profileVersion', 'contextEpoch']) &&
      positiveSafeInteger(value.generation) && exactHttpsOrigin(value.exactOrigin) &&
      identifier(value.profileId) && safeText(value.profileVersion, 128) && positiveSafeInteger(value.contextEpoch);
  }

  function validateLens(value) {
    return hasExactKeys(value, [
      'label', 'metadata', 'actionLabel', 'regionLabel', 'appDisplayName', 'pageNoun'
    ]) && safeText(value.label, MAX_LABEL + 16) && safeText(value.metadata, MAX_LABEL + 32) &&
      safeText(value.actionLabel, MAX_LABEL + 32) && safeText(value.regionLabel, MAX_LABEL + 32) &&
      safeText(value.appDisplayName, MAX_LABEL) && safeText(value.pageNoun, 32);
  }

  function validateEntity(value, authority) {
    if (value === null) return true;
    return hasExactKeys(value, [
      'kind', 'id', 'noun', 'label', 'anchorId', 'contextEpoch', 'chipLabel', 'chipAccessibleName', 'withdrawnText'
    ]) && identifier(value.kind) && identifier(value.id, MAX_TEXT) && safeText(value.noun, 32) &&
      safeText(value.label, MAX_LABEL) && identifier(value.anchorId) && value.contextEpoch === authority.contextEpoch &&
      safeText(value.chipLabel, MAX_TEXT) && safeText(value.chipAccessibleName, MAX_TEXT) &&
      safeText(value.withdrawnText, MAX_TEXT);
  }

  function validateReadyGroups(value) {
    if (!Array.isArray(value) || value.length > MAX_GROUPS) return false;
    var order = -1;
    var count = 0;
    var primaryCount = 0;
    var slugs = new Set();
    for (var groupIndex = 0; groupIndex < value.length; groupIndex += 1) {
      var group = value[groupIndex];
      if (!hasExactKeys(group, ['id', 'label', 'sideEffectClass', 'rows']) || !identifier(group.id) ||
          !safeText(group.label, MAX_LABEL + 32) || !SIDE_EFFECT_SET.has(group.sideEffectClass) ||
          !Array.isArray(group.rows) || group.rows.length === 0) return false;
      var nextOrder = SIDE_EFFECTS.indexOf(group.sideEffectClass);
      if (nextOrder < order) return false;
      order = nextOrder;
      for (var rowIndex = 0; rowIndex < group.rows.length; rowIndex += 1) {
        var row = group.rows[rowIndex];
        if (!hasExactKeys(row, [
          'kind', 'sourceGroupId', 'slug', 'label', 'status', 'sideEffectClass',
          'paramSummary', 'argumentContract', 'primary', 'interactive'
        ]) || row.kind !== 'capability-row' || !identifier(row.sourceGroupId) || !identifier(row.slug) ||
            slugs.has(row.slug) || !safeText(row.label, MAX_LABEL) || row.status !== 'Ready' ||
            row.sideEffectClass !== group.sideEffectClass || !safeOptionalText(row.paramSummary, MAX_LABEL) ||
            !validArgumentContract(row.argumentContract, row.argumentContract.schemaDigest) ||
            !['empty', 'form'].includes(row.argumentContract.mode) ||
            typeof row.primary !== 'boolean' || row.interactive !== true) return false;
        slugs.add(row.slug);
        count += 1;
        if (row.primary) primaryCount += 1;
      }
    }
    return count <= MAX_ROWS && primaryCount === (count ? 1 : 0);
  }

  function validateUnavailable(value) {
    if (!hasExactKeys(value, ['heading', 'count', 'rows']) || value.heading !== 'Unavailable actions' ||
        !nonNegativeSafeInteger(value.count) || !Array.isArray(value.rows) || value.rows.length !== value.count ||
        value.rows.length > MAX_ROWS) return false;
    return value.rows.every(function (row) {
      var presentation = row && STATUS_PRESENTATION[row.disposition];
      return hasExactKeys(row, [
        'kind', 'label', 'status', 'detail', 'disposition', 'sideEffectClass', 'interactive'
      ]) && row.kind === 'status-row' && safeText(row.label, MAX_LABEL) && !!presentation &&
        row.status === presentation.status && row.detail === presentation.detail &&
        SIDE_EFFECT_SET.has(row.sideEffectClass) && row.interactive === false;
    });
  }

  function validateArgumentCollection(value, readyGroups) {
    if (value === null) return true;
    if (!hasExactKeys(value, [
      'collectionEpoch', 'groupId', 'actionSlug', 'argumentContract',
      'submitLabel', 'cancelLabel', 'errorField', 'errorMessage'
    ]) || !positiveSafeInteger(value.collectionEpoch) || !identifier(value.groupId) ||
        !identifier(value.actionSlug) || value.argumentContract.mode !== 'form' ||
        !validArgumentContract(value.argumentContract, value.argumentContract.schemaDigest) ||
        !safeText(value.submitLabel, MAX_LABEL) || value.cancelLabel !== 'Cancel' ||
        !(value.errorField === null ||
          (typeof value.errorField === 'string' && value.errorField.length <= MAX_LABEL &&
            /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value.errorField))) ||
        !safeOptionalText(value.errorMessage, MAX_TEXT) ||
        ((value.errorField === null) !== (value.errorMessage === null))) {
      return false;
    }
    if (value.errorField !== null && !value.argumentContract.fields.some(function(field) {
      return field.name === value.errorField;
    })) return false;
    var rows = readyGroups.reduce(function(all, group) { return all.concat(group.rows); }, []);
    return rows.some(function(row) {
      return row.sourceGroupId === value.groupId && row.slug === value.actionSlug &&
        row.label === value.submitLabel && row.argumentContract.mode === 'form' &&
        JSON.stringify(row.argumentContract) === JSON.stringify(value.argumentContract);
    });
  }

  function validateCopy(value) {
    if (!hasExactKeys(value, [
      'focusedTitle', 'contextDescription', 'emptyHeading', 'emptyBody', 'uncertainHeading',
      'uncertainBody', 'unsupportedHeading', 'unsupportedBody', 'resultMessage', 'backLabel', 'turnOffLabel'
    ])) return false;
    return safeText(value.focusedTitle, MAX_TEXT) && safeText(value.contextDescription, MAX_TEXT) &&
      value.emptyHeading === 'No verified actions here' && safeText(value.emptyBody, MAX_TEXT) &&
      value.uncertainHeading === 'Skopeo can’t verify this view.' &&
      value.uncertainBody === 'The page was left unchanged. Open another view or turn off Skopeo.' &&
      value.unsupportedHeading === 'Skopeo doesn’t support this app yet.' &&
      value.unsupportedBody === 'Nothing was added to the page. Turn off Skopeo or open a supported app.' &&
      safeOptionalText(value.resultMessage, MAX_TEXT) && safeText(value.backLabel, MAX_TEXT) &&
      value.turnOffLabel === 'Turn off Skopeo in this tab';
  }

  function validateRendererRequest(value) {
    if (!hasExactKeys(value, [
      'rendererId', 'genre', 'resultStatus', 'requestedAtoms', 'narrowBreakpoint',
      'narrowTableFallback', 'liveRegion', 'reducedMotion', 'forcedColors', 'copy'
    ]) || !GENRE_SET.has(value.genre) || value.rendererId !== RENDERER_BY_GENRE[value.genre] ||
        !RESULT_STATES.has(value.resultStatus) || !Array.isArray(value.requestedAtoms) ||
        value.requestedAtoms.length === 0 || value.requestedAtoms.length > ATOM.length ||
        value.requestedAtoms.some(function (atom, index) {
          return !ATOM_SET.has(atom) || value.requestedAtoms.indexOf(atom) !== index;
        }) || value.narrowBreakpoint !== 480 || value.narrowTableFallback !== 'fact-list' ||
        !hasExactKeys(value.liveRegion, ['politeness', 'atomic']) ||
        value.liveRegion.politeness !== 'polite' || value.liveRegion.atomic !== true ||
        !hasExactKeys(value.reducedMotion, ['media', 'durationMs', 'halo']) ||
        value.reducedMotion.media !== 'prefers-reduced-motion: reduce' ||
        value.reducedMotion.durationMs !== 0 || value.reducedMotion.halo !== 'static-outline' ||
        value.forcedColors !== true || !validateCopy(value.copy)) return false;
    return value.requestedAtoms.every(function (atom) { return ATOMS_BY_GENRE[value.genre].includes(atom); });
  }

  function validateConsequence(value, readyGroups) {
    if (!hasExactKeys(value, [
      'groupId', 'actionSlug', 'sideEffectClass', 'eyebrow', 'title', 'body', 'safeLabel',
      'confirmLabel', 'pendingLabel', 'staleLabel', 'focusTarget', 'tabOrder'
    ]) || !identifier(value.groupId) || !identifier(value.actionSlug) ||
        !['write', 'destructive'].includes(value.sideEffectClass) || !safeText(value.title, MAX_TEXT) ||
        !CONSEQUENCE_BOUNDS || !safeText(value.body, CONSEQUENCE_BOUNDS.composedBody) ||
        value.safeLabel !== 'Keep reviewing' ||
        !safeText(value.confirmLabel, MAX_LABEL) || !safeText(value.pendingLabel, MAX_LABEL + 8) ||
        value.staleLabel !==
          'This confirmation expired because the page context changed. Review the action again.' ||
        value.focusTarget !== 'safe-action' || !Array.isArray(value.tabOrder) ||
        value.tabOrder.length !== 3 || value.tabOrder.join('|') !== 'safe-action|confirm-action|turn-off') return false;
    if (value.eyebrow !== (value.sideEffectClass === 'destructive' ? 'Destructive action' : 'Changes data')) {
      return false;
    }
    var rows = readyGroups.reduce(function (all, group) { return all.concat(group.rows); }, []);
    return rows.some(function (row) {
      return row.sourceGroupId === value.groupId && row.slug === value.actionSlug &&
        row.sideEffectClass === value.sideEffectClass && row.label === value.confirmLabel;
    });
  }

  function validatePrimitiveCombination(model) {
    if (!ATTENTION.includes(model.attention) || !Array.isArray(model.primitives) ||
        model.primitives.some(function (primitive, index) {
          return !PRIMITIVES.includes(primitive) || model.primitives.indexOf(primitive) !== index ||
            !ATTENTION_POLICY[model.attention].includes(primitive);
        })) return false;
    if (model.attention === 'ambient') return model.primitives.join('|') === 'rail' && model.entity === null;
    if (model.attention === 'anchored') {
      return !!model.entity && (model.primitives.join('|') === 'anchor|chip|rail' ||
        model.primitives.join('|') === 'anchor|chip|rail|halo');
    }
    if (model.attention === 'focused') {
      if (model.entity === null) return model.primitives.length === 0;
      return model.primitives.join('|') === 'anchor|chip' || model.primitives.join('|') === 'anchor|chip|ghost';
    }
    return model.primitives.join('|') === 'gate' && model.consequence !== null;
  }

  function safeModelData(value, path, seen) {
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return true;
    if (typeof value === 'string') {
      if (path === 'authority.exactOrigin') return exactHttpsOrigin(value);
      if (path === 'consequence.body') {
        return !!CONSEQUENCE_BOUNDS && safeText(value, CONSEQUENCE_BOUNDS.composedBody);
      }
      return safeText(value, MAX_TEXT);
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    var keys = Reflect.ownKeys(value);
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      if (Array.isArray(value) && key === 'length') continue;
      var nextPath = path ? path + '.' + key : String(key);
      if (!safeModelData(value[key], nextPath, seen)) return false;
    }
    return true;
  }

  function validateRenderModel(model) {
    try {
      if (!isDeepFrozenData(model) || !hasExactKeys(model, MODEL_KEYS) || model.modelVersion !== MODEL_VERSION ||
          !validateAuthority(model.authority) || !validateLens(model.lens) ||
          !validateEntity(model.entity, model.authority) || !validateReadyGroups(model.readyGroups) ||
          !validateUnavailable(model.unavailableSummary) ||
          !validateArgumentCollection(model.argumentCollection, model.readyGroups) ||
          !validateRendererRequest(model.rendererRequest) ||
          !validatePrimitiveCombination(model) || !safeModelData(model, '', new Set())) return false;
      if (model.rendererRequest.genre === 'generic-app' && model.entity !== null) return false;
      if (model.attention === 'interstitial') {
        return model.argumentCollection === null &&
          validateConsequence(model.consequence, model.readyGroups);
      }
      return model.consequence === null &&
        (model.argumentCollection === null || model.attention === 'focused');
    } catch (_error) {
      return false;
    }
  }

  var api = Object.freeze({
    MODEL_VERSION: MODEL_VERSION,
    CORPUS_MODEL_VERSION: CORPUS_MODEL_VERSION,
    CONTRACT_MODEL_VERSION: CONTRACT_MODEL_VERSION,
    ASK_MODEL_VERSION: ASK_MODEL_VERSION,
    CORPUS_STATES: CORPUS_STATES,
    ATOM: ATOM,
    compose: compose,
    validateRenderModel: validateRenderModel,
    composeCorpus: composeCorpus,
    validateCorpusModel: validateCorpusModel,
    composeContractView: composeContractView,
    validateContractViewModel: validateContractViewModel,
    composeContractAsk: composeContractAsk,
    validateContractAskModel: validateContractAskModel
  });

  global.FSBSkopeoAdaptiveComposer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
