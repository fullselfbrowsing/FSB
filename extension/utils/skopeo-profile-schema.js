// Closed, data-only schema for authored and generated Skopeo app profiles.
(function (global) {
  'use strict';

  var SCHEMA_VERSION = 2;
  var MAX_PROFILE_VERSION = 64;
  var MAX_PROFILE_ID = 64;
  var MAX_STABLE_ID = 64;
  var MAX_SERVICE = 253;
  var MAX_ORIGINS = 8;
  var MAX_PROFILES = 256;
  var MAX_DISPLAY_TEXT = 80;
  var MAX_ENTITY_NOUN = 32;
  var MAX_GROUPS = 12;
  var MAX_PREFIXES = 32;
  var MAX_PREFIX_LENGTH = 96;

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
  var ADAPTER_IDS = Object.freeze([
    'generic-unanchored-v1',
    'reader-knowledge-v1',
    'communication-v1',
    'document-editor-v1',
    'worklist-record-v1',
    'dashboard-admin-v1',
    'transactional-v1',
    'media-feed-v1',
    'drive-docs-deep-pack-v1'
  ]);
  var RENDERER_IDS = Object.freeze([
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
  var ATTENTION_CEILINGS = Object.freeze(['ambient', 'anchored']);

  var ROOT_KEYS = Object.freeze(['schemaVersion', 'profileVersion', 'defaults', 'profiles']);
  var DEFAULT_KEYS = Object.freeze(['profileId', 'profile']);
  var ENTRY_KEYS = Object.freeze(['profileId', 'appStem', 'service', 'exactOrigins', 'profile']);
  var PROFILE_KEYS = Object.freeze([
    'displayName',
    'defaultGenre',
    'pageNoun',
    'entityVocabulary',
    'capabilityGroups',
    'attentionCeiling',
    'adapterId',
    'rendererId'
  ]);
  var VOCABULARY_KEYS = Object.freeze(['singular', 'plural']);
  var GROUP_KEYS = Object.freeze(['id', 'label', 'slugPrefixes']);
  var IDENTITY_KEYS = Object.freeze([
    'profileId',
    'profileVersion',
    'appStem',
    'service',
    'serviceOrigin',
    'admittedPageOrigins'
  ]);
  var ARGUMENT_CONTRACT_KEYS = Object.freeze(['mode', 'fields', 'reason', 'schemaDigest']);
  var ARGUMENT_FIELD_KEYS = Object.freeze([
    'name', 'label', 'kind', 'required', 'choices',
    'minLength', 'maxLength', 'minimum', 'maximum'
  ]);
  var ARGUMENT_MODES = Object.freeze(['empty', 'form', 'unsupported']);
  var ARGUMENT_KINDS = Object.freeze(['string', 'boolean', 'integer', 'number', 'choice']);
  var ACTIONABILITY_REASONS = Object.freeze([
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
  var SECRET_FIELD_RE = /password|passwd|passphrase|secret|token|api[-_.]?key|authorization|cookie|session|credential/i;
  var RESERVED_METADATA_FIELD_RE = /^(?:default|defaults|description|descriptions|example|examples|pattern|placeholder|title|value|values)$/i;

  var STABLE_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
  var SERVICE_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  var SLUG_PREFIX_RE = /^[a-z0-9][a-z0-9._-]*\.$/;
  var UNSAFE_TEXT_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]|(?:https?:\/\/)|(?:data:)|(?:javascript:)|(?:on[a-z]+\s*=)|[{}]/i;

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function hasExactOwnKeys(value, expected) {
    if (!isPlainObject(value)) return false;
    var actual = Reflect.ownKeys(value);
    if (actual.length !== expected.length || actual.some(function (key) { return typeof key !== 'string'; })) {
      return false;
    }
    var actualSorted = actual.slice().sort();
    var expectedSorted = expected.slice().sort();
    return actualSorted.every(function (key, index) { return key === expectedSorted[index]; });
  }

  function bounded(value, limit) {
    return String(value || '').slice(0, limit);
  }

  function failure(code, path, reason) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        code: code,
        path: bounded(path, 96),
        reason: bounded(reason, 160)
      })
    });
  }

  function invalid(path, reason) {
    return failure('SKOPEO_PROFILE_INVALID', path, reason);
  }

  function unsupported(path, reason) {
    return failure('SKOPEO_PROFILE_SCHEMA_UNSUPPORTED', path, reason);
  }

  function validStableId(value, maxLength) {
    return typeof value === 'string' && value.length > 0 && value.length <= maxLength &&
      STABLE_ID_RE.test(value);
  }

  function validText(value, maxLength) {
    return typeof value === 'string' && value.length > 0 && value.length <= maxLength &&
      !UNSAFE_TEXT_RE.test(value);
  }

  function exactHttpsOrigin(value, service) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 320) return false;
    try {
      var parsed = new URL(value);
      return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '' &&
        parsed.port === '' && (!service || parsed.hostname === service) && parsed.origin === value &&
        parsed.pathname === '/' && parsed.search === '' && parsed.hash === '';
    } catch (_error) {
      return false;
    }
  }

  function validateProfile(profile, path, appStem) {
    if (!hasExactOwnKeys(profile, PROFILE_KEYS)) return invalid(path, 'profile keys must match the closed schema');
    if (!validText(profile.displayName, MAX_DISPLAY_TEXT)) {
      return invalid(path + '.displayName', 'display text must be safe and at most 80 characters');
    }
    if (!GENRES.includes(profile.defaultGenre)) {
      return invalid(path + '.defaultGenre', 'genre is not allowlisted');
    }
    if (!validText(profile.pageNoun, MAX_ENTITY_NOUN)) {
      return invalid(path + '.pageNoun', 'page noun must be safe and at most 32 characters');
    }
    if (!hasExactOwnKeys(profile.entityVocabulary, VOCABULARY_KEYS)) {
      return invalid(path + '.entityVocabulary', 'entity vocabulary keys must match the closed schema');
    }
    if (!validText(profile.entityVocabulary.singular, MAX_ENTITY_NOUN) ||
        !validText(profile.entityVocabulary.plural, MAX_ENTITY_NOUN)) {
      return invalid(path + '.entityVocabulary', 'entity nouns must be safe and at most 32 characters');
    }
    if (!Array.isArray(profile.capabilityGroups) || profile.capabilityGroups.length > MAX_GROUPS) {
      return invalid(path + '.capabilityGroups', 'capability groups must be an array with at most 12 entries');
    }
    var groupIds = new Set();
    for (var groupIndex = 0; groupIndex < profile.capabilityGroups.length; groupIndex += 1) {
      var group = profile.capabilityGroups[groupIndex];
      var groupPath = path + '.capabilityGroups[' + groupIndex + ']';
      if (!hasExactOwnKeys(group, GROUP_KEYS)) return invalid(groupPath, 'group keys must match the closed schema');
      if (!validStableId(group.id, MAX_STABLE_ID)) return invalid(groupPath + '.id', 'group ID is invalid');
      if (groupIds.has(group.id)) return invalid(groupPath + '.id', 'group IDs must be unique');
      groupIds.add(group.id);
      if (!validText(group.label, MAX_DISPLAY_TEXT)) {
        return invalid(groupPath + '.label', 'group label must be safe and at most 80 characters');
      }
      if (!Array.isArray(group.slugPrefixes) || group.slugPrefixes.length > MAX_PREFIXES) {
        return invalid(groupPath + '.slugPrefixes', 'slug prefixes must be an array with at most 32 entries');
      }
      var prefixes = new Set();
      for (var prefixIndex = 0; prefixIndex < group.slugPrefixes.length; prefixIndex += 1) {
        var prefix = group.slugPrefixes[prefixIndex];
        if (typeof prefix !== 'string' || prefix.length === 0 || prefix.length > MAX_PREFIX_LENGTH ||
            !SLUG_PREFIX_RE.test(prefix)) {
          return invalid(groupPath + '.slugPrefixes[' + prefixIndex + ']', 'slug prefix is invalid');
        }
        if (appStem && !prefix.startsWith(appStem + '.')) {
          return invalid(groupPath + '.slugPrefixes[' + prefixIndex + ']', 'slug prefix does not match the app stem');
        }
        if (prefixes.has(prefix)) {
          return invalid(groupPath + '.slugPrefixes[' + prefixIndex + ']', 'slug prefixes must be unique');
        }
        prefixes.add(prefix);
      }
    }
    if (!ATTENTION_CEILINGS.includes(profile.attentionCeiling)) {
      return invalid(path + '.attentionCeiling', 'attention ceiling is not allowlisted');
    }
    if (!ADAPTER_IDS.includes(profile.adapterId)) {
      return invalid(path + '.adapterId', 'adapter ID is not allowlisted');
    }
    if (!RENDERER_IDS.includes(profile.rendererId)) {
      return invalid(path + '.rendererId', 'renderer ID is not allowlisted');
    }
    return Object.freeze({ ok: true });
  }

  function validateEntry(entry, index, pairIds, profileIds, origins) {
    var path = 'profiles[' + index + ']';
    if (!hasExactOwnKeys(entry, ENTRY_KEYS)) return invalid(path, 'registry entry keys must match the closed schema');
    if (!validStableId(entry.profileId, MAX_PROFILE_ID)) return invalid(path + '.profileId', 'profile ID is invalid');
    if (profileIds.has(entry.profileId)) return invalid(path + '.profileId', 'profile IDs must be unique');
    profileIds.add(entry.profileId);
    if (!validStableId(entry.appStem, MAX_STABLE_ID)) return invalid(path + '.appStem', 'app stem is invalid');
    if (typeof entry.service !== 'string' || entry.service.length > MAX_SERVICE || !SERVICE_RE.test(entry.service)) {
      return invalid(path + '.service', 'service must be an exact lowercase host');
    }
    var pairId = entry.appStem + '\u0000' + entry.service;
    if (pairIds.has(pairId)) return invalid(path, 'app stem and service pair must be unique');
    pairIds.add(pairId);
    if (!Array.isArray(entry.exactOrigins) || entry.exactOrigins.length === 0 ||
        entry.exactOrigins.length > MAX_ORIGINS) {
      return invalid(path + '.exactOrigins', 'exact origins must contain one to eight entries');
    }
    var localOrigins = new Set();
    for (var originIndex = 0; originIndex < entry.exactOrigins.length; originIndex += 1) {
      var origin = entry.exactOrigins[originIndex];
      if (!exactHttpsOrigin(origin, entry.service)) {
        return invalid(path + '.exactOrigins[' + originIndex + ']', 'origin must exactly match the HTTPS service origin');
      }
      if (localOrigins.has(origin)) return invalid(path + '.exactOrigins[' + originIndex + ']', 'origins must be unique');
      localOrigins.add(origin);
      if (origins.has(origin) && origins.get(origin) !== pairId) {
        return invalid(path + '.exactOrigins[' + originIndex + ']', 'origin is ambiguous across profiles');
      }
      origins.set(origin, pairId);
    }
    return validateProfile(entry.profile, path + '.profile', entry.appStem);
  }

  function validateRegistry(value) {
    if (!isPlainObject(value)) return invalid('$', 'registry must be a plain object');
    if (Object.prototype.hasOwnProperty.call(value, 'schemaVersion') && value.schemaVersion !== SCHEMA_VERSION) {
      return unsupported('schemaVersion', 'schema version is not supported');
    }
    if (!hasExactOwnKeys(value, ROOT_KEYS)) return invalid('$', 'root keys must match the closed schema');
    if (value.schemaVersion !== SCHEMA_VERSION) return invalid('schemaVersion', 'schema version is required');
    if (!validStableId(value.profileVersion, MAX_PROFILE_VERSION)) {
      return invalid('profileVersion', 'profile version must be a bounded stable identifier');
    }
    if (!hasExactOwnKeys(value.defaults, DEFAULT_KEYS)) {
      return invalid('defaults', 'defaults keys must match the closed schema');
    }
    if (!validStableId(value.defaults.profileId, MAX_PROFILE_ID)) {
      return invalid('defaults.profileId', 'default profile ID is invalid');
    }
    var defaultResult = validateProfile(value.defaults.profile, 'defaults.profile', null);
    if (!defaultResult.ok) return defaultResult;
    if (!Array.isArray(value.profiles) || value.profiles.length > MAX_PROFILES) {
      return invalid('profiles', 'profiles must be an array with at most 256 entries');
    }
    var pairs = new Set();
    var profileIds = new Set([value.defaults.profileId]);
    var origins = new Map();
    for (var index = 0; index < value.profiles.length; index += 1) {
      var result = validateEntry(value.profiles[index], index, pairs, profileIds, origins);
      if (!result.ok) return result;
    }
    return Object.freeze({ ok: true });
  }

  function validNullableNumber(value) {
    return value === null || (typeof value === 'number' && Number.isFinite(value));
  }

  function validNullableLength(value) {
    return value === null || (Number.isSafeInteger(value) && value >= 0 && value <= 512);
  }

  function validateArgumentContract(value) {
    if (!hasExactOwnKeys(value, ARGUMENT_CONTRACT_KEYS) || !ARGUMENT_MODES.includes(value.mode) ||
        !Array.isArray(value.fields) || value.fields.length > 12 ||
        !(value.schemaDigest === null ||
          (typeof value.schemaDigest === 'string' && /^sha256:[0-9a-f]{64}$/.test(value.schemaDigest)))) {
      return false;
    }
    if (value.mode === 'unsupported') {
      return value.fields.length === 0 &&
        ['argument-contract-unsupported', 'execution-authority-unavailable'].includes(value.reason);
    }
    if (value.reason !== null || typeof value.schemaDigest !== 'string') return false;
    if (value.mode === 'empty') return value.fields.length === 0;
    if (value.fields.length === 0) return false;
    var names = new Set();
    for (var index = 0; index < value.fields.length; index += 1) {
      var field = value.fields[index];
      if (!hasExactOwnKeys(field, ARGUMENT_FIELD_KEYS) ||
          typeof field.name !== 'string' || field.name.length === 0 || field.name.length > 80 ||
          !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(field.name) || SECRET_FIELD_RE.test(field.name) ||
          (!field.required && RESERVED_METADATA_FIELD_RE.test(field.name) && field.name !== 'title') ||
          names.has(field.name) || !validText(field.label, 80) ||
          !ARGUMENT_KINDS.includes(field.kind) || typeof field.required !== 'boolean' ||
          !validNullableLength(field.minLength) || !validNullableLength(field.maxLength) ||
          !validNullableNumber(field.minimum) || !validNullableNumber(field.maximum)) {
        return false;
      }
      if ((field.minLength !== null && field.maxLength !== null && field.minLength > field.maxLength) ||
          (field.minimum !== null && field.maximum !== null && field.minimum > field.maximum)) {
        return false;
      }
      if (field.kind === 'choice') {
        if (!Array.isArray(field.choices) || field.choices.length === 0 || field.choices.length > 32 ||
            field.choices.some(function(choice) {
              return !['string', 'number', 'boolean'].includes(typeof choice) ||
                (typeof choice === 'number' && !Number.isFinite(choice)) ||
                (typeof choice === 'string' && choice.length > 128);
            })) return false;
      } else if (field.choices !== null) {
        return false;
      }
      names.add(field.name);
    }
    return true;
  }

  function validateActionabilityReason(value) {
    return value === null || ACTIONABILITY_REASONS.includes(value);
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (var key of Reflect.ownKeys(value)) deepFreeze(value[key]);
    return Object.freeze(value);
  }

  function cloneProfile(profile) {
    return {
      displayName: profile.displayName,
      defaultGenre: profile.defaultGenre,
      pageNoun: profile.pageNoun,
      entityVocabulary: {
        singular: profile.entityVocabulary.singular,
        plural: profile.entityVocabulary.plural
      },
      capabilityGroups: profile.capabilityGroups.map(function (group) {
        return {
          id: group.id,
          label: group.label,
          slugPrefixes: group.slugPrefixes.slice()
        };
      }),
      attentionCeiling: profile.attentionCeiling,
      adapterId: profile.adapterId,
      rendererId: profile.rendererId
    };
  }

  function throwResult(result) {
    var error = new TypeError(result.error.code + ': ' + result.error.path + ': ' + result.error.reason);
    error.code = result.error.code;
    error.path = result.error.path;
    error.reason = result.error.reason;
    throw error;
  }

  function normalizeProfile(value, derivedIdentity) {
    if (!hasExactOwnKeys(derivedIdentity, IDENTITY_KEYS)) {
      throwResult(invalid('derivedIdentity', 'derived identity keys must match the closed schema'));
    }
    if (!validStableId(derivedIdentity.profileId, MAX_PROFILE_ID) ||
        !validStableId(derivedIdentity.profileVersion, MAX_PROFILE_VERSION) ||
        !validStableId(derivedIdentity.appStem, MAX_STABLE_ID) ||
        typeof derivedIdentity.service !== 'string' || !SERVICE_RE.test(derivedIdentity.service) ||
        !exactHttpsOrigin(derivedIdentity.serviceOrigin, derivedIdentity.service) ||
        !Array.isArray(derivedIdentity.admittedPageOrigins) ||
        derivedIdentity.admittedPageOrigins.length === 0 ||
        derivedIdentity.admittedPageOrigins.length > MAX_ORIGINS) {
      throwResult(invalid('derivedIdentity', 'derived identity is invalid'));
    }
    var admittedOrigins = derivedIdentity.admittedPageOrigins.slice();
    var admittedSet = new Set();
    for (var originIndex = 0; originIndex < admittedOrigins.length; originIndex += 1) {
      var admittedOrigin = admittedOrigins[originIndex];
      if (!exactHttpsOrigin(admittedOrigin, null) || admittedSet.has(admittedOrigin) ||
          (originIndex > 0 && admittedOrigins[originIndex - 1] >= admittedOrigin)) {
        throwResult(invalid('derivedIdentity.admittedPageOrigins',
          'admitted page origins must be sorted unique exact HTTPS origins'));
      }
      admittedSet.add(admittedOrigin);
    }
    if (!admittedSet.has(derivedIdentity.serviceOrigin)) {
      throwResult(invalid('derivedIdentity.admittedPageOrigins',
        'admitted page origins must include the service origin'));
    }
    var validation = validateProfile(value, 'profile', derivedIdentity.appStem);
    if (!validation.ok) throwResult(validation);
    var profile = cloneProfile(value);
    var normalized = {
      schemaVersion: SCHEMA_VERSION,
      profileId: derivedIdentity.profileId,
      profileVersion: derivedIdentity.profileVersion,
      appStem: derivedIdentity.appStem,
      service: derivedIdentity.service,
      serviceOrigin: derivedIdentity.serviceOrigin,
      admittedPageOrigins: admittedOrigins,
      displayName: profile.displayName,
      defaultGenre: profile.defaultGenre,
      pageNoun: profile.pageNoun,
      entityVocabulary: profile.entityVocabulary,
      capabilityGroups: profile.capabilityGroups,
      attentionCeiling: profile.attentionCeiling,
      adapterId: profile.adapterId,
      rendererId: profile.rendererId
    };
    return deepFreeze(normalized);
  }

  var api = Object.freeze({
    SCHEMA_VERSION: SCHEMA_VERSION,
    GENRES: GENRES,
    ADAPTER_IDS: ADAPTER_IDS,
    RENDERER_IDS: RENDERER_IDS,
    ACTIONABILITY_REASONS: ACTIONABILITY_REASONS,
    validateRegistry: validateRegistry,
    validateArgumentContract: validateArgumentContract,
    validateActionabilityReason: validateActionabilityReason,
    normalizeProfile: normalizeProfile
  });

  global.FsbSkopeoProfileSchema = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
