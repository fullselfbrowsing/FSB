(function(global) {
  'use strict';

  var MAX_URL_LENGTH = 2048;
  var MAX_ORIGINS = 512;
  var MAX_PROFILES = 512;
  var MAX_INDEX_CAPABILITIES = 4096;
  var MAX_GROUPS = 12;
  var MAX_CAPABILITIES = 256;
  var MAX_PARAMS = 12;
  var MAX_SOURCE_PARAMS = 32;
  var MAX_IDENTIFIER_LENGTH = 128;
  var MAX_LABEL_LENGTH = 80;

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Reflect.ownKeys(value).forEach(function(key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  var STATUS = deepFreeze({
    RECOGNIZED: 'recognized',
    UNSUPPORTED: 'unsupported',
    INVALID: 'invalid'
  });

  var READINESS = deepFreeze({
    T1_READY: 't1-ready',
    GUARDED_FAIL_CLOSED: 'guarded-fail-closed',
    BLOCKED: 'blocked',
    BRIDGE_NEEDED: 'bridge-needed',
    UAT_NEEDED: 'uat-needed',
    LEARN_PENDING: 'learn-pending',
    DISCOVERY_PENDING: 'discovery-pending',
    DEGRADED: 'degraded',
    UNSUPPORTED: 'unsupported'
  });

  var READINESS_SET = new Set(Object.values(READINESS));
  var PROFILE_DISPOSITIONS = new Set(['authored', 'generic-default']);
  var ATTENTION_CEILINGS = new Set(['ambient', 'anchored']);
  var SIDE_EFFECT_CLASSES = new Set(['read', 'write', 'destructive']);
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
  var ARGUMENT_CONTRACT_KEYS = ['mode', 'fields', 'reason', 'schemaDigest'];
  var ARGUMENT_FIELD_KEYS = [
    'name', 'label', 'kind', 'required', 'choices',
    'minLength', 'maxLength', 'minimum', 'maximum'
  ];
  var SECRET_FIELD_RE = /password|passwd|passphrase|secret|token|api[-_.]?key|authorization|cookie|session|credential/i;
  var RESERVED_METADATA_FIELD_RE = /^(?:default|defaults|description|descriptions|example|examples|pattern|placeholder|title|value|values)$/i;
  var EXECUTION_BLOCK_REASONS = new Set([
    'source-not-ready',
    'execution-authority-unavailable',
    'execution-origin-mismatch'
  ]);
  var EFFECT_BY_SIDE_EFFECT = deepFreeze({
    read: 'read-only',
    write: 'changes-service-data',
    destructive: 'removes-service-data'
  });
  var PROJECTION_KEYS = [
    'status',
    'tabId',
    'generation',
    'exactOrigin',
    'service',
    'appStem',
    'profileId',
    'profileVersion',
    'catalogVersion',
    'profile',
    'capabilityGroups'
  ];
  var PROFILE_KEYS = [
    'profileDisposition',
    'displayName',
    'defaultGenre',
    'pageNoun',
    'entityVocabulary',
    'attentionCeiling',
    'adapterId',
    'rendererId'
  ];
  var GROUP_KEYS = ['id', 'label', 'capabilities'];
  var CAPABILITY_KEYS = [
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
  ];
  var AUTHORITY_KEYS = [
    'tier',
    'executionOrigin',
    'sideEffectClass',
    'paramSchema',
    'schemaDigest'
  ];

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function hasExactKeys(value, expected) {
    if (!isPlainObject(value)) return false;
    var keys = Object.keys(value);
    if (keys.length !== expected.length) return false;
    var expectedSet = new Set(expected);
    for (var i = 0; i < keys.length; i += 1) {
      if (!expectedSet.has(keys[i])) return false;
    }
    return true;
  }

  function isPositiveSafeInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  function isBoundedText(value, maximum, pattern) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      (!pattern || pattern.test(value));
  }

  function isVersion(value) {
    return isBoundedText(value, MAX_IDENTIFIER_LENGTH, /^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
  }

  function isCatalogVersion(value) {
    return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
  }

  function isIdentifier(value) {
    return isBoundedText(value, MAX_IDENTIFIER_LENGTH, /^[a-z0-9][A-Za-z0-9._-]*$/);
  }

  function isProfileKey(value) {
    return isBoundedText(value, MAX_IDENTIFIER_LENGTH,
      /^[a-z0-9][A-Za-z0-9._-]*@[a-z0-9][a-z0-9.-]*[a-z0-9]$/);
  }

  function isLabel(value) {
    return isBoundedText(value, MAX_LABEL_LENGTH, /^[^\u0000-\u001f\u007f]*$/);
  }

  function failure(status, reason) {
    return deepFreeze({ status: status, reason: reason });
  }

  function invalid(reason) {
    return failure(STATUS.INVALID, reason || 'projection-invalid');
  }

  function unsupported(reason) {
    return failure(STATUS.UNSUPPORTED, reason || 'origin-unsupported');
  }

  function parseExactHttpsOrigin(url) {
    if (typeof url !== 'string' || url.length === 0 || url.length > MAX_URL_LENGTH) return null;
    try {
      var parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '' ||
          parsed.port !== '') {
        return null;
      }
      return parsed.origin;
    } catch (_error) {
      return null;
    }
  }

  function isExactHttpsOrigin(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LENGTH) return false;
    try {
      var parsed = new URL(value);
      return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '' &&
        parsed.port === '' && parsed.origin === value && parsed.pathname === '/' &&
        parsed.search === '' && parsed.hash === '';
    } catch (_error) {
      return false;
    }
  }

  function exactOriginForService(service) {
    if (!isBoundedText(service, 253, /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/)) return null;
    try {
      var parsed = new URL('https://' + service);
      if (parsed.protocol !== 'https:' || parsed.hostname !== service || parsed.pathname !== '/' ||
          parsed.username !== '' || parsed.password !== '' || parsed.port !== '') {
        return null;
      }
      return parsed.origin;
    } catch (_error) {
      return null;
    }
  }

  function isActionableDisposition(presentationDisposition) {
    return presentationDisposition === 't1-ready';
  }

  function expectedDispositionForEvidence(row) {
    if (!isPlainObject(row)) return null;
    var readiness = row.sourceReadiness;
    var terminal = row.sourceTerminalState;
    var surface = row.surfaceStatus;

    if (surface === READINESS.GUARDED_FAIL_CLOSED) {
      return readiness === 't1-guarded-fail-closed' && terminal === 'guarded-fail-closed'
        ? READINESS.GUARDED_FAIL_CLOSED : null;
    }
    if (surface === READINESS.BLOCKED) {
      return readiness === 'blocked' && terminal === 'blocked-policy' ? READINESS.BLOCKED : null;
    }
    if (surface === READINESS.BRIDGE_NEEDED) {
      var bridgeTerminal = terminal === 'pattern-d-bridge-blocked' || terminal === 'gapi-bridge-blocked';
      return readiness === 'discovery-pending' && bridgeTerminal ? READINESS.BRIDGE_NEEDED : null;
    }
    if (surface === READINESS.UAT_NEEDED) {
      return readiness === 'discovery-pending' && terminal === 'live-uat-required'
        ? READINESS.UAT_NEEDED : null;
    }
    if (readiness === 'learn-pending') {
      return terminal === 'network-capture-required' && surface === 'degraded-discovery-pending'
        ? READINESS.LEARN_PENDING : null;
    }
    if (readiness === 'discovery-pending') {
      if (surface === 'discovery-pending' && terminal === 'app-specific-proof-required') {
        return READINESS.DISCOVERY_PENDING;
      }
      var degradedTerminal = terminal === 'same-origin-proof-required' ||
        terminal === 'app-specific-proof-required';
      return surface === 'degraded-discovery-pending' && degradedTerminal
        ? READINESS.DEGRADED : null;
    }
    if (readiness === 't1-ready' && terminal === 't1-ready' && surface === 't1-ready') {
      return READINESS.T1_READY;
    }
    return null;
  }

  function normalizeParamNames(value) {
    if (!Array.isArray(value) || value.length > MAX_SOURCE_PARAMS) return null;
    var names = [];
    var seen = new Set();
    for (var i = 0; i < value.length; i += 1) {
      var name = value[i];
      if (!isBoundedText(name, MAX_LABEL_LENGTH, /^[A-Za-z_][A-Za-z0-9_.-]*$/) || seen.has(name)) {
        return null;
      }
      seen.add(name);
      names.push(name);
    }
    return names;
  }

  function normalizeParamSummary(value) {
    if (!hasExactKeys(value, ['count', 'required', 'optional', 'truncated']) ||
        !Number.isSafeInteger(value.count) || value.count < 0 || value.count > MAX_SOURCE_PARAMS) {
      return null;
    }
    var required = normalizeParamNames(value.required);
    var optional = normalizeParamNames(value.optional);
    var shown = required && optional ? required.length + optional.length : -1;
    if (!required || !optional || shown > MAX_PARAMS || shown > value.count ||
        typeof value.truncated !== 'boolean' || value.truncated !== (shown < value.count)) {
      return null;
    }
    var all = new Set(required);
    for (var i = 0; i < optional.length; i += 1) {
      if (all.has(optional[i])) return null;
      all.add(optional[i]);
    }
    return {
      count: value.count,
      required: required,
      optional: optional,
      truncated: value.truncated
    };
  }

  function validNullableLength(value) {
    return value === null || (Number.isSafeInteger(value) && value >= 0 && value <= 512);
  }

  function validNullableNumber(value) {
    return value === null || (typeof value === 'number' && Number.isFinite(value));
  }

  function normalizeArgumentContract(value, schemaDigest) {
    if (!hasExactKeys(value, ARGUMENT_CONTRACT_KEYS) || !ARGUMENT_MODES.has(value.mode) ||
        !Array.isArray(value.fields) || value.fields.length > MAX_PARAMS ||
        !(value.schemaDigest === null ||
          (typeof value.schemaDigest === 'string' && /^sha256:[0-9a-f]{64}$/.test(value.schemaDigest)))) {
      return null;
    }
    if (value.mode === 'unsupported') {
      if (value.fields.length !== 0 ||
          !['argument-contract-unsupported', 'execution-authority-unavailable'].includes(value.reason) ||
          (schemaDigest !== null && value.schemaDigest !== schemaDigest)) {
        return null;
      }
      return {
        mode: value.mode,
        fields: [],
        reason: value.reason,
        schemaDigest: value.schemaDigest
      };
    }
    if (value.reason !== null || typeof value.schemaDigest !== 'string' ||
        value.schemaDigest !== schemaDigest || (value.mode === 'empty') !== (value.fields.length === 0)) {
      return null;
    }
    var fields = [];
    var names = new Set();
    for (var index = 0; index < value.fields.length; index += 1) {
      var field = value.fields[index];
      if (!hasExactKeys(field, ARGUMENT_FIELD_KEYS) ||
          !isBoundedText(field.name, MAX_LABEL_LENGTH, /^[A-Za-z_][A-Za-z0-9_.-]*$/) ||
          SECRET_FIELD_RE.test(field.name) ||
          (!field.required && RESERVED_METADATA_FIELD_RE.test(field.name) && field.name !== 'title') ||
          names.has(field.name) || !isLabel(field.label) ||
          !ARGUMENT_KINDS.has(field.kind) || typeof field.required !== 'boolean' ||
          !validNullableLength(field.minLength) || !validNullableLength(field.maxLength) ||
          !validNullableNumber(field.minimum) || !validNullableNumber(field.maximum) ||
          (field.minLength !== null && field.maxLength !== null && field.minLength > field.maxLength) ||
          (field.minimum !== null && field.maximum !== null && field.minimum > field.maximum)) {
        return null;
      }
      var choices = null;
      if (field.kind === 'choice') {
        if (!Array.isArray(field.choices) || field.choices.length === 0 || field.choices.length > 32 ||
            field.choices.some(function(choice) {
              return !['string', 'number', 'boolean'].includes(typeof choice) ||
                (typeof choice === 'number' && !Number.isFinite(choice)) ||
                (typeof choice === 'string' && choice.length > 128);
            })) {
          return null;
        }
        choices = field.choices.slice();
      } else if (field.choices !== null) {
        return null;
      }
      if (field.kind === 'string' &&
          (!Number.isSafeInteger(field.minLength) || !Number.isSafeInteger(field.maxLength) ||
            field.minimum !== null || field.maximum !== null)) {
        return null;
      }
      if ((field.kind === 'integer' || field.kind === 'number') &&
          (field.minLength !== null || field.maxLength !== null)) {
        return null;
      }
      if (field.kind === 'boolean' &&
          (field.minLength !== null || field.maxLength !== null ||
            field.minimum !== null || field.maximum !== null)) {
        return null;
      }
      names.add(field.name);
      fields.push({
        name: field.name,
        label: field.label,
        kind: field.kind,
        required: field.required,
        choices: choices,
        minLength: field.minLength,
        maxLength: field.maxLength,
        minimum: field.minimum,
        maximum: field.maximum
      });
    }
    return {
      mode: value.mode,
      fields: fields,
      reason: null,
      schemaDigest: value.schemaDigest
    };
  }

  function expectedActionability(
    sourceDisposition,
    sideEffectClass,
    authority,
    argumentContract,
    consequenceCompatible,
    actionabilityReason
  ) {
    if (sourceDisposition !== READINESS.T1_READY) {
      return { disposition: sourceDisposition, reason: 'source-not-ready', executable: false };
    }
    if (!authority || argumentContract.mode === 'unsupported') {
      return {
        disposition: READINESS.UNSUPPORTED,
        reason: argumentContract.reason || 'argument-contract-unsupported',
        executable: false
      };
    }
    if (sideEffectClass !== 'read' && !consequenceCompatible) {
      return {
        disposition: READINESS.UNSUPPORTED,
        reason: CONSEQUENCE_FAILURE_REASONS.has(actionabilityReason)
          ? actionabilityReason
          : 'consequence-contract-missing',
        executable: false
      };
    }
    return { disposition: READINESS.T1_READY, reason: null, executable: true };
  }

  function normalizeExecutionAuthority(value, capability, allowedExecutionOrigins) {
    if (value === null) return null;
    if (!hasExactKeys(value, AUTHORITY_KEYS) || value.tier !== 'T1a' ||
        !isExactHttpsOrigin(value.executionOrigin) ||
        value.sideEffectClass !== capability.sideEffectClass ||
        !isPlainObject(value[AUTHORITY_KEYS[3]]) ||
        typeof value.schemaDigest !== 'string' ||
        !/^sha256:[0-9a-f]{64}$/.test(value.schemaDigest) ||
        !allowedExecutionOrigins.has(value.executionOrigin)) {
      return false;
    }
    return {
      executionOrigin: value.executionOrigin,
      schemaDigest: value.schemaDigest
    };
  }

  function validateSourceCapability(capability, identity) {
    if (!isPlainObject(capability) || !isIdentifier(capability.slug) ||
        !isProfileKey(capability.profileKey) || capability.appStem !== identity.appStem ||
        !isBoundedText(capability.service, 253, /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/) ||
        capability.serviceOrigin !== exactOriginForService(capability.service) ||
        !isLabel(capability.actionLabel) ||
        !SIDE_EFFECT_CLASSES.has(capability.sideEffectClass) ||
        capability.effect !== EFFECT_BY_SIDE_EFFECT[capability.sideEffectClass] ||
        !READINESS_SET.has(capability.presentationDisposition)) {
      return null;
    }
    var sourceDisposition = expectedDispositionForEvidence(capability);
    if (!sourceDisposition) return null;
    var authority = normalizeExecutionAuthority(
      capability.executionAuthority,
      capability,
      identity.allowedExecutionOrigins
    );
    if (authority === false) return null;
    var argumentContract = normalizeArgumentContract(
      capability.argumentContract,
      authority ? authority.schemaDigest : null
    );
    if (!argumentContract) return null;
    var consequenceDigestValid = typeof capability.consequenceDigest === 'string' &&
      /^sha256:[0-9a-f]{64}$/.test(capability.consequenceDigest);
    if (typeof capability.consequenceCompatible !== 'boolean' ||
        (capability.consequenceCompatible !== consequenceDigestValid) ||
        (capability.sideEffectClass === 'read' &&
          (capability.consequenceCompatible || capability.consequenceDigest !== null)) ||
        (capability.sideEffectClass !== 'read' && !capability.consequenceCompatible &&
          capability.consequenceDigest !== null)) {
      return null;
    }
    var actionability = expectedActionability(
      sourceDisposition,
      capability.sideEffectClass,
      authority,
      argumentContract,
      capability.consequenceCompatible,
      capability.actionabilityReason
    );
    if (capability.presentationDisposition !== actionability.disposition ||
        capability.actionabilityReason !== actionability.reason ||
        !(capability.actionabilityReason === null ||
          ACTIONABILITY_REASONS.has(capability.actionabilityReason)) ||
        capability.executionEnabled !== actionability.executable ||
        capability.invocable !== actionability.executable) {
      return null;
    }
    var paramSummary = normalizeParamSummary(capability.paramSummary);
    if (!paramSummary) return null;
    var actionable = actionability.executable && authority.executionOrigin === identity.exactOrigin;
    var blockReason = null;
    if (!isActionableDisposition(capability.presentationDisposition)) {
      blockReason = 'source-not-ready';
    } else if (!authority) {
      blockReason = 'execution-authority-unavailable';
    } else if (!actionable) {
      blockReason = 'execution-origin-mismatch';
    }
    return {
      slug: capability.slug,
      actionLabel: capability.actionLabel,
      effect: capability.effect,
      sideEffectClass: capability.sideEffectClass,
      executionOrigin: authority ? authority.executionOrigin : null,
      schemaDigest: authority ? authority.schemaDigest : null,
      executionBlockReason: blockReason,
      paramSummary: paramSummary,
      argumentContract: argumentContract,
      consequenceCompatible: capability.consequenceCompatible,
      consequenceDigest: capability.consequenceDigest,
      actionabilityReason: capability.actionabilityReason,
      sourceReadiness: capability.sourceReadiness,
      sourceTerminalState: capability.sourceTerminalState,
      surfaceStatus: capability.surfaceStatus,
      presentationDisposition: capability.presentationDisposition,
      executionEnabled: actionable,
      invocable: actionable
    };
  }

  function normalizeProfile(profile, index, originRow) {
    if (!isPlainObject(profile) || !PROFILE_DISPOSITIONS.has(profile.profileDisposition) ||
        !isProfileKey(profile.profileKey) || !isIdentifier(profile.profileId) ||
        !isIdentifier(profile.appStem) || profile.service !== originRow.service ||
        profile.profileKey !== profile.appStem + '@' + profile.service ||
        profile.serviceOrigin !== exactOriginForService(profile.service) ||
        !Array.isArray(profile.admittedPageOrigins) || profile.admittedPageOrigins.length === 0 ||
        profile.admittedPageOrigins.length > 8 ||
        !profile.admittedPageOrigins.includes(originRow.admittedOrigin) ||
        profile.profileVersion !== index.profileVersion ||
        profile.catalogVersion !== index.catalogVersion || !isLabel(profile.displayName) ||
        !isIdentifier(profile.defaultGenre) || !isLabel(profile.pageNoun) ||
        !hasExactKeys(profile.entityVocabulary, ['singular', 'plural']) ||
        !isLabel(profile.entityVocabulary.singular) || !isLabel(profile.entityVocabulary.plural) ||
        !ATTENTION_CEILINGS.has(profile.attentionCeiling) || !isIdentifier(profile.adapterId) ||
        !isIdentifier(profile.rendererId)) {
      return null;
    }
    var previousOrigin = '';
    for (var originIndex = 0; originIndex < profile.admittedPageOrigins.length; originIndex += 1) {
      var admittedOrigin = profile.admittedPageOrigins[originIndex];
      if (!isExactHttpsOrigin(admittedOrigin) || admittedOrigin <= previousOrigin) return null;
      previousOrigin = admittedOrigin;
    }
    if (!profile.admittedPageOrigins.includes(profile.serviceOrigin)) return null;
    return {
      profileDisposition: profile.profileDisposition,
      displayName: profile.displayName,
      defaultGenre: profile.defaultGenre,
      pageNoun: profile.pageNoun,
      entityVocabulary: {
        singular: profile.entityVocabulary.singular,
        plural: profile.entityVocabulary.plural
      },
      attentionCeiling: profile.attentionCeiling,
      adapterId: profile.adapterId,
      rendererId: profile.rendererId
    };
  }

  function normalizeGroupDefinitions(profile) {
    if (!Array.isArray(profile.capabilityGroups) || profile.capabilityGroups.length > MAX_GROUPS) return null;
    var definitions = [];
    var ids = new Set();
    for (var i = 0; i < profile.capabilityGroups.length; i += 1) {
      var source = profile.capabilityGroups[i];
      if (!isPlainObject(source) || !isBoundedText(source.id, 48, /^[a-z0-9][a-z0-9-]*$/) ||
          !isLabel(source.label) || !Array.isArray(source.slugPrefixes) ||
          source.slugPrefixes.length === 0 || source.slugPrefixes.length > MAX_GROUPS || ids.has(source.id)) {
        return null;
      }
      var prefixes = [];
      var prefixSet = new Set();
      for (var j = 0; j < source.slugPrefixes.length; j += 1) {
        var prefix = source.slugPrefixes[j];
        if (!isBoundedText(prefix, MAX_IDENTIFIER_LENGTH, /^[a-z0-9][A-Za-z0-9._-]*$/) ||
            prefixSet.has(prefix)) {
          return null;
        }
        prefixSet.add(prefix);
        prefixes.push(prefix);
      }
      ids.add(source.id);
      definitions.push({ id: source.id, label: source.label, prefixes: prefixes, capabilities: [] });
    }
    return definitions;
  }

  function buildCapabilityGroups(profile, capabilities) {
    var definitions = normalizeGroupDefinitions(profile);
    if (!definitions) return null;
    if (definitions.length === 0) {
      definitions.push({ id: 'capabilities', label: 'Capabilities', prefixes: [], capabilities: [] });
    }

    var ungrouped = [];
    for (var i = 0; i < capabilities.length; i += 1) {
      var capability = capabilities[i];
      var match = null;
      for (var j = 0; j < definitions.length; j += 1) {
        var definition = definitions[j];
        var matches = definition.prefixes.length === 0;
        for (var k = 0; k < definition.prefixes.length; k += 1) {
          if (capability.slug.startsWith(definition.prefixes[k])) matches = true;
        }
        if (matches) {
          if (match) return null;
          match = definition;
        }
      }
      if (match) match.capabilities.push(capability);
      else ungrouped.push(capability);
    }

    if (ungrouped.length > 0) {
      if (definitions.length >= MAX_GROUPS || definitions.some(function(group) {
        return group.id === 'ungrouped';
      })) {
        return null;
      }
      definitions.push({ id: 'ungrouped', label: 'Other', prefixes: [], capabilities: ungrouped });
    }

    return definitions.filter(function(group) {
      return group.capabilities.length > 0;
    }).map(function(group) {
      return { id: group.id, label: group.label, capabilities: group.capabilities };
    });
  }

  function resolveOriginRow(index, exactOrigin) {
    if (!Array.isArray(index.admittedOriginIndex) || index.admittedOriginIndex.length === 0 ||
        index.admittedOriginIndex.length > MAX_ORIGINS) {
      return { kind: 'invalid' };
    }
    var matches = index.admittedOriginIndex.filter(function(row) {
      return isPlainObject(row) && row.admittedOrigin === exactOrigin;
    });
    if (matches.length === 0) return { kind: 'unsupported' };
    if (matches.length !== 1) return { kind: 'invalid' };
    var row = matches[0];
    if (!isExactHttpsOrigin(row.admittedOrigin) ||
        exactOriginForService(row.service) === null ||
        !Array.isArray(row.profileKeys) || row.profileKeys.length !== 1 ||
        row.profileDisposition === 'ambiguous-stem') {
      return { kind: 'ambiguous' };
    }
    if (!isProfileKey(row.profileKeys[0]) || !PROFILE_DISPOSITIONS.has(row.profileDisposition)) {
      return { kind: 'invalid' };
    }
    return { kind: 'recognized', row: row };
  }

  function resolveProfile(index, originRow) {
    if (!Array.isArray(index.profiles) || index.profiles.length === 0 || index.profiles.length > MAX_PROFILES) {
      return null;
    }
    var profileKey = originRow.profileKeys[0];
    var matches = index.profiles.filter(function(profile) {
      return isPlainObject(profile) && profile.profileKey === profileKey;
    });
    if (matches.length !== 1 || matches[0].profileDisposition !== originRow.profileDisposition) return null;
    return matches[0];
  }

  function resolveCapabilities(index, profile, identity) {
    if (!Array.isArray(index.capabilities) || index.capabilities.length === 0 ||
        index.capabilities.length > MAX_INDEX_CAPABILITIES || !Array.isArray(profile.capabilitySlugs) ||
        profile.capabilitySlugs.length === 0 || profile.capabilitySlugs.length > MAX_CAPABILITIES) {
      return null;
    }
    var requiredSlugs = new Set();
    for (var i = 0; i < profile.capabilitySlugs.length; i += 1) {
      var slug = profile.capabilitySlugs[i];
      if (!isIdentifier(slug) || requiredSlugs.has(slug)) return null;
      requiredSlugs.add(slug);
    }

    var sourceBySlug = new Map();
    for (var j = 0; j < index.capabilities.length; j += 1) {
      var candidate = index.capabilities[j];
      if (isPlainObject(candidate) && candidate.appStem === identity.appStem) {
        if (sourceBySlug.has(candidate.slug)) return null;
        sourceBySlug.set(candidate.slug, candidate);
      }
    }
    if (sourceBySlug.size !== requiredSlugs.size) return null;

    var capabilities = [];
    for (var k = 0; k < profile.capabilitySlugs.length; k += 1) {
      var source = sourceBySlug.get(profile.capabilitySlugs[k]);
      var normalized = validateSourceCapability(source, identity);
      if (!normalized) return null;
      capabilities.push(normalized);
    }
    return capabilities;
  }

  function validateProjectedProfile(profile) {
    return hasExactKeys(profile, PROFILE_KEYS) && PROFILE_DISPOSITIONS.has(profile.profileDisposition) &&
      isLabel(profile.displayName) && isIdentifier(profile.defaultGenre) && isLabel(profile.pageNoun) &&
      hasExactKeys(profile.entityVocabulary, ['singular', 'plural']) &&
      isLabel(profile.entityVocabulary.singular) && isLabel(profile.entityVocabulary.plural) &&
      ATTENTION_CEILINGS.has(profile.attentionCeiling) && isIdentifier(profile.adapterId) &&
      isIdentifier(profile.rendererId);
  }

  function validateProjectedParamSummary(value) {
    return normalizeParamSummary(value) !== null;
  }

  function validateProjectedCapability(capability, appStem, exactOrigin) {
    if (!hasExactKeys(capability, CAPABILITY_KEYS) || !isIdentifier(capability.slug) ||
        capability.slug.split('.')[0] !== appStem || !isLabel(capability.actionLabel) ||
        !SIDE_EFFECT_CLASSES.has(capability.sideEffectClass) ||
        capability.effect !== EFFECT_BY_SIDE_EFFECT[capability.sideEffectClass] ||
        !validateProjectedParamSummary(capability.paramSummary) ||
        !READINESS_SET.has(capability.presentationDisposition)) {
      return false;
    }
    var hasAuthority = typeof capability.executionOrigin === 'string' &&
      typeof capability.schemaDigest === 'string';
    if ((capability.executionOrigin === null) !== (capability.schemaDigest === null) ||
        (hasAuthority && (!isExactHttpsOrigin(capability.executionOrigin) ||
          !/^sha256:[0-9a-f]{64}$/.test(capability.schemaDigest))) ||
        (!hasAuthority && capability.executionOrigin !== null)) {
      return false;
    }
    var argumentContract = normalizeArgumentContract(
      capability.argumentContract,
      hasAuthority ? capability.schemaDigest : null
    );
    if (!argumentContract ||
        JSON.stringify(argumentContract) !== JSON.stringify(capability.argumentContract)) {
      return false;
    }
    var consequenceDigestValid = typeof capability.consequenceDigest === 'string' &&
      /^sha256:[0-9a-f]{64}$/.test(capability.consequenceDigest);
    if (typeof capability.consequenceCompatible !== 'boolean' ||
        capability.consequenceCompatible !== consequenceDigestValid ||
        (capability.sideEffectClass === 'read' &&
          (capability.consequenceCompatible || capability.consequenceDigest !== null)) ||
        (capability.sideEffectClass !== 'read' && !capability.consequenceCompatible &&
          capability.consequenceDigest !== null)) {
      return false;
    }
    var sourceDisposition = expectedDispositionForEvidence(capability);
    if (!sourceDisposition) return false;
    var actionability = expectedActionability(
      sourceDisposition,
      capability.sideEffectClass,
      hasAuthority,
      argumentContract,
      capability.consequenceCompatible,
      capability.actionabilityReason
    );
    if (capability.presentationDisposition !== actionability.disposition ||
        capability.actionabilityReason !== actionability.reason ||
        !(capability.actionabilityReason === null ||
          ACTIONABILITY_REASONS.has(capability.actionabilityReason))) {
      return false;
    }
    var actionable = actionability.executable && capability.executionOrigin === exactOrigin;
    var expectedReason = null;
    if (!isActionableDisposition(capability.presentationDisposition)) {
      expectedReason = 'source-not-ready';
    } else if (!hasAuthority) {
      expectedReason = 'execution-authority-unavailable';
    } else if (!actionable) {
      expectedReason = 'execution-origin-mismatch';
    }
    if (capability.executionBlockReason !== expectedReason ||
        (expectedReason !== null && !EXECUTION_BLOCK_REASONS.has(expectedReason))) {
      return false;
    }
    return capability.executionEnabled === actionable && capability.invocable === actionable;
  }

  function validateProjection(value) {
    if (!hasExactKeys(value, PROJECTION_KEYS) || value.status !== STATUS.RECOGNIZED ||
        !isPositiveSafeInteger(value.tabId) || !isPositiveSafeInteger(value.generation) ||
        !isIdentifier(value.appStem) || !isIdentifier(value.profileId) || !isVersion(value.profileVersion) ||
        !isCatalogVersion(value.catalogVersion) || exactOriginForService(value.service) === null ||
        !isExactHttpsOrigin(value.exactOrigin) ||
        !validateProjectedProfile(value.profile) || !Array.isArray(value.capabilityGroups) ||
        value.capabilityGroups.length === 0 || value.capabilityGroups.length > MAX_GROUPS) {
      return false;
    }

    var groupIds = new Set();
    var slugs = new Set();
    var total = 0;
    for (var i = 0; i < value.capabilityGroups.length; i += 1) {
      var group = value.capabilityGroups[i];
      if (!hasExactKeys(group, GROUP_KEYS) || !isBoundedText(group.id, 48, /^[a-z0-9][a-z0-9-]*$/) ||
          !isLabel(group.label) || groupIds.has(group.id) || !Array.isArray(group.capabilities) ||
          group.capabilities.length === 0 || group.capabilities.length > MAX_CAPABILITIES) {
        return false;
      }
      groupIds.add(group.id);
      total += group.capabilities.length;
      if (total > MAX_CAPABILITIES) return false;
      for (var j = 0; j < group.capabilities.length; j += 1) {
        var capability = group.capabilities[j];
        if (!validateProjectedCapability(capability, value.appStem, value.exactOrigin) ||
            slugs.has(capability.slug)) return false;
        slugs.add(capability.slug);
      }
    }
    return total > 0;
  }

  function createProjection(input, suppliedIndex) {
    if (!hasExactKeys(input, ['tabId', 'generation', 'url']) ||
        !isPositiveSafeInteger(input.tabId) || !isPositiveSafeInteger(input.generation) ||
        typeof input.url !== 'string' || input.url.length === 0 || input.url.length > MAX_URL_LENGTH) {
      return invalid('projection-invalid');
    }
    var exactOrigin = parseExactHttpsOrigin(input.url);
    if (!exactOrigin) return unsupported('origin-unsupported');

    var index = suppliedIndex === undefined ? global.FsbSkopeoProfileIndex : suppliedIndex;
    if (!isPlainObject(index) || index.schemaVersion !== 2 || !isVersion(index.profileVersion) ||
        !isCatalogVersion(index.catalogVersion)) {
      return invalid('projection-invalid');
    }

    var originResolution = resolveOriginRow(index, exactOrigin);
    if (originResolution.kind === 'unsupported') return unsupported('origin-unsupported');
    if (originResolution.kind === 'ambiguous') return unsupported('profile-inconsistent');
    if (originResolution.kind !== 'recognized') return invalid('profile-inconsistent');
    var originRow = originResolution.row;

    var sourceProfile = resolveProfile(index, originRow);
    if (!sourceProfile) return invalid('profile-inconsistent');
    var normalizedProfile = normalizeProfile(sourceProfile, index, originRow);
    if (!normalizedProfile) return invalid('profile-inconsistent');

    var allowedExecutionOrigins = new Set();
    for (var profileIndex = 0; profileIndex < index.profiles.length; profileIndex += 1) {
      var relatedProfile = index.profiles[profileIndex];
      if (!isPlainObject(relatedProfile) || relatedProfile.appStem !== sourceProfile.appStem ||
          !Array.isArray(relatedProfile.admittedPageOrigins)) {
        continue;
      }
      for (var admittedIndex = 0; admittedIndex < relatedProfile.admittedPageOrigins.length; admittedIndex += 1) {
        allowedExecutionOrigins.add(relatedProfile.admittedPageOrigins[admittedIndex]);
      }
    }
    var identity = {
      profileKey: sourceProfile.profileKey,
      profileId: sourceProfile.profileId,
      appStem: sourceProfile.appStem,
      service: sourceProfile.service,
      exactOrigin: exactOrigin,
      allowedExecutionOrigins: allowedExecutionOrigins
    };
    var capabilities = resolveCapabilities(index, sourceProfile, identity);
    if (!capabilities) return invalid('projection-invalid');
    var capabilityGroups = buildCapabilityGroups(sourceProfile, capabilities);
    if (!capabilityGroups) return invalid('projection-invalid');

    var projection = {
      status: STATUS.RECOGNIZED,
      tabId: input.tabId,
      generation: input.generation,
      exactOrigin: exactOrigin,
      service: sourceProfile.service,
      appStem: sourceProfile.appStem,
      profileId: sourceProfile.profileId,
      profileVersion: index.profileVersion,
      catalogVersion: index.catalogVersion,
      profile: normalizedProfile,
      capabilityGroups: capabilityGroups
    };
    if (!validateProjection(projection)) return invalid('projection-invalid');
    return deepFreeze(projection);
  }

  var exportsObject = deepFreeze({
    STATUS: STATUS,
    READINESS: READINESS,
    createProjection: createProjection,
    validateProjection: validateProjection
  });

  global.FsbSkopeoCapabilityProjector = exportsObject;
  if (typeof module !== 'undefined' && module.exports) module.exports = exportsObject;
})(typeof globalThis !== 'undefined' ? globalThis : this);
