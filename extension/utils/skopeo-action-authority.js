(function(global) {
  'use strict';

  var AUTHORITY_KEYS = [
    'tier',
    'executionOrigin',
    'sideEffectClass',
    'paramSchema',
    'schemaDigest'
  ];
  var SIDE_EFFECT_CLASSES = {
    read: true,
    write: true,
    destructive: true
  };
  var ARGUMENT_CONTRACT_KEYS = ['mode', 'fields', 'reason', 'schemaDigest'];
  var ARGUMENT_FIELD_KEYS = [
    'name',
    'label',
    'kind',
    'required',
    'choices',
    'minLength',
    'maxLength',
    'minimum',
    'maximum'
  ];
  var ARGUMENT_MODES = { empty: true, form: true, unsupported: true };
  var FIELD_KINDS = {
    string: true,
    boolean: true,
    integer: true,
    number: true,
    choice: true,
    'bounded-object': true
  };
  var CONSEQUENCE_CONTRACT_KEYS = [
    'effectLabel',
    'progressLabel',
    'targetRoles',
    'materialRoles',
    'excludedFromCollection'
  ];
  var CONSEQUENCE_ROLE_KEYS = ['field', 'label', 'render', 'maxLength'];
  var COMPILED_CONSEQUENCE_KEYS = [
    'slug',
    'compatible',
    'reason',
    'effectLabel',
    'progressLabel',
    'targetRoles',
    'materialRoles',
    'excludedFromCollection',
    'effectiveArgumentContract',
    'acceptedConsequenceFields',
    'excludedConsequenceFields'
  ];
  var CONSEQUENCE_RENDERS = { scalar: true, 'bounded-object': true };
  var CONSEQUENCE_BOUNDS = deepFreeze({
    label: 80,
    roleValue: 256,
    objectProperties: 8,
    objectString: 128,
    aggregateRender: 1024,
    composedBody: 1152
  });
  var MAX_CONSEQUENCE_TEXT = CONSEQUENCE_BOUNDS.label;
  var MAX_CONSEQUENCE_ROLE_LENGTH = CONSEQUENCE_BOUNDS.roleValue;
  var MAX_CONSEQUENCE_OBJECT_PROPERTIES = CONSEQUENCE_BOUNDS.objectProperties;
  var MAX_CONSEQUENCE_OBJECT_STRING = CONSEQUENCE_BOUNDS.objectString;
  var MAX_CONSEQUENCE_RENDER = CONSEQUENCE_BOUNDS.aggregateRender;
  var MAX_ARGUMENT_FIELDS = 12;
  var MAX_ARGUMENT_NAME = 80;
  var MAX_ARGUMENT_STRING = 512;
  var MAX_ARGUMENT_CHOICES = 32;
  var MAX_CHOICE_STRING = 128;
  var SECRET_NAME_RE = /password|passwd|passphrase|secret|token|api[-_.]?key|authorization|cookie|session|credential/i;
  var RESERVED_METADATA_NAME_RE = /^(?:default|defaults|description|descriptions|example|examples|pattern|placeholder|title|value|values)$/i;
  var FORBIDDEN_SCHEMA_KEYS = {
    '$ref': true,
    '$dynamicRef': true,
    allOf: true,
    anyOf: true,
    oneOf: true,
    not: true,
    if: true,
    then: true,
    else: true,
    dependencies: true,
    dependentRequired: true,
    dependentSchemas: true,
    patternProperties: true,
    unevaluatedProperties: true
  };

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { return false; }
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function canonicalValue(value, ancestors) {
    if (value === null) { return 'null'; }
    if (typeof value === 'boolean' || typeof value === 'string') {
      return JSON.stringify(value);
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? JSON.stringify(value) : null;
    }
    if (typeof value !== 'object') { return null; }
    if (ancestors.has(value)) { return null; }
    ancestors.add(value);

    var output = null;
    if (Array.isArray(value)) {
      var arrayKeys = Reflect.ownKeys(value);
      for (var arrayKeyIndex = 0; arrayKeyIndex < arrayKeys.length; arrayKeyIndex += 1) {
        var arrayKey = arrayKeys[arrayKeyIndex];
        if (typeof arrayKey !== 'string' ||
            (arrayKey !== 'length' && !/^(0|[1-9][0-9]*)$/.test(arrayKey))) {
          ancestors.delete(value);
          return null;
        }
      }
      var items = [];
      for (var index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, String(index))) {
          ancestors.delete(value);
          return null;
        }
        var itemDescriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!itemDescriptor || !Object.prototype.hasOwnProperty.call(itemDescriptor, 'value')) {
          ancestors.delete(value);
          return null;
        }
        var item = canonicalValue(itemDescriptor.value, ancestors);
        if (item === null) {
          ancestors.delete(value);
          return null;
        }
        items.push(item);
      }
      output = '[' + items.join(',') + ']';
    } else if (isPlainObject(value)) {
      var keys = Reflect.ownKeys(value);
      if (keys.some(function(key) { return typeof key !== 'string'; })) {
        ancestors.delete(value);
        return null;
      }
      keys.sort();
      var members = [];
      for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        var key = keys[keyIndex];
        var descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
          ancestors.delete(value);
          return null;
        }
        var child = canonicalValue(descriptor.value, ancestors);
        if (child === null) {
          ancestors.delete(value);
          return null;
        }
        members.push(JSON.stringify(key) + ':' + child);
      }
      output = '{' + members.join(',') + '}';
    }

    ancestors.delete(value);
    return output;
  }

  function canonicalSchemaJson(schema) {
    try {
      return canonicalValue(schema, new Set());
    } catch (_error) {
      return null;
    }
  }

  function digestHex(bytes) {
    var view = new Uint8Array(bytes);
    var output = '';
    for (var index = 0; index < view.length; index += 1) {
      output += view[index].toString(16).padStart(2, '0');
    }
    return output;
  }

  async function digestCanonical(canonical, testOnlyDigest) {
    if (typeof canonical !== 'string') { return null; }
    if (testOnlyDigest !== undefined) {
      if (typeof testOnlyDigest !== 'function') { return null; }
      try {
        var injected = await testOnlyDigest(canonical);
        var injectedText = String(injected || '').toLowerCase();
        if (/^[0-9a-f]{64}$/.test(injectedText)) { return 'sha256:' + injectedText; }
        return /^sha256:[0-9a-f]{64}$/.test(injectedText) ? injectedText : null;
      } catch (_testError) {
        return null;
      }
    }

    var cryptoObject = global && global.crypto ? global.crypto : null;
    if (!cryptoObject || !cryptoObject.subtle || typeof cryptoObject.subtle.digest !== 'function' ||
        typeof TextEncoder === 'undefined') {
      return null;
    }
    try {
      var bytes = new TextEncoder().encode(canonical);
      var digest = await cryptoObject.subtle.digest('SHA-256', bytes);
      var hex = digestHex(digest);
      return /^[0-9a-f]{64}$/.test(hex) ? 'sha256:' + hex : null;
    } catch (_error) {
      return null;
    }
  }

  async function schemaDigest(schema) {
    return digestCanonical(canonicalSchemaJson(schema));
  }

  async function schemaDigestForTest(schema, testOnlyDigest) {
    return digestCanonical(canonicalSchemaJson(schema), testOnlyDigest);
  }

  function router() {
    if (global && global.FsbCapabilityRouter) { return global.FsbCapabilityRouter; }
    if (typeof require === 'function') {
      try { return require('./capability-router.js'); } catch (_error) { return null; }
    }
    return null;
  }

  function exactExecutionOrigin(resolved) {
    if (!resolved || typeof resolved.origin !== 'string') { return null; }
    try {
      var parsed = new URL(resolved.origin);
      if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '' ||
          parsed.port !== '' || parsed.origin === 'null') {
        return null;
      }
      var handlerOrigin = resolved.handler && resolved.handler.origin;
      if (handlerOrigin !== undefined && handlerOrigin !== null) {
        var handlerParsed = new URL(String(handlerOrigin));
        if (handlerParsed.origin !== parsed.origin) { return null; }
      }
      return parsed.origin;
    } catch (_error) {
      return null;
    }
  }

  function resolvedSideEffectClass(resolved) {
    var handlerClass = resolved && resolved.handler && resolved.handler.sideEffectClass;
    var descriptorClass = resolved && resolved.descriptor && resolved.descriptor.sideEffectClass;
    if (handlerClass && descriptorClass && handlerClass !== descriptorClass) { return null; }
    var sideEffectClass = handlerClass || descriptorClass;
    return SIDE_EFFECT_CLASSES[sideEffectClass] ? sideEffectClass : null;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) { return value; }
    Reflect.ownKeys(value).forEach(function(key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function hasExactKeys(value, expected) {
    if (!isPlainObject(value)) { return false; }
    var keys = Reflect.ownKeys(value);
    if (keys.length !== expected.length || keys.some(function(key) { return typeof key !== 'string'; })) {
      return false;
    }
    var wanted = expected.slice().sort();
    keys.sort();
    return keys.every(function(key, index) { return key === wanted[index]; });
  }

  function hasExactDataKeys(value, expected) {
    if (!hasExactKeys(value, expected)) { return false; }
    var keys = Reflect.ownKeys(value);
    for (var index = 0; index < keys.length; index += 1) {
      var descriptor = Object.getOwnPropertyDescriptor(value, keys[index]);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.enumerable !== true) {
        return false;
      }
    }
    return true;
  }

  function ownDataEntries(value) {
    if (!isPlainObject(value)) { return null; }
    var keys = Reflect.ownKeys(value);
    if (keys.some(function(key) { return typeof key !== 'string'; })) { return null; }
    var output = [];
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.enumerable !== true) {
        return null;
      }
      output.push([key, descriptor.value]);
    }
    return output;
  }

  function unsupportedArgumentContract(schemaDigestValue, reason) {
    return deepFreeze({
      mode: 'unsupported',
      fields: [],
      reason: reason || 'argument-contract-unsupported',
      schemaDigest: typeof schemaDigestValue === 'string' ? schemaDigestValue : null
    });
  }

  function emptyArgumentContract(schemaDigestValue) {
    return deepFreeze({
      mode: 'empty',
      fields: [],
      reason: null,
      schemaDigest: schemaDigestValue
    });
  }

  function fieldLabel(name) {
    var words = String(name).replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!words) { return null; }
    var label = words.charAt(0).toUpperCase() + words.slice(1);
    return label.length <= MAX_ARGUMENT_NAME ? label : null;
  }

  function validFieldName(name) {
    return typeof name === 'string' && name.length > 0 && name.length <= MAX_ARGUMENT_NAME &&
      /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name) &&
      name !== '__proto__' && name !== 'prototype' && name !== 'constructor';
  }

  function containsForbiddenSchemaKeyword(schema) {
    if (!isPlainObject(schema)) { return true; }
    var keys = Object.keys(schema);
    for (var index = 0; index < keys.length; index += 1) {
      if (FORBIDDEN_SCHEMA_KEYS[keys[index]]) { return true; }
    }
    return false;
  }

  function secretField(name, schema) {
    return SECRET_NAME_RE.test(name) || schema.format === 'password' || schema.writeOnly === true ||
      schema.secret === true || schema.sensitive === true || schema['x-secret'] === true;
  }

  function finiteConstraint(schema, key) {
    if (!Object.prototype.hasOwnProperty.call(schema, key)) { return null; }
    return typeof schema[key] === 'number' && Number.isFinite(schema[key]) ? schema[key] : false;
  }

  function integerConstraint(schema, key, fallback) {
    if (!Object.prototype.hasOwnProperty.call(schema, key)) { return fallback; }
    return Number.isSafeInteger(schema[key]) && schema[key] >= 0 ? schema[key] : false;
  }

  function scalarChoiceType(value) {
    if (typeof value === 'string') {
      return value.length <= MAX_CHOICE_STRING ? 'string' : null;
    }
    if (typeof value === 'boolean') { return 'boolean'; }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Number.isSafeInteger(value) ? 'integer' : 'number';
    }
    return null;
  }

  function schemaChoices(schema) {
    var values = null;
    if (Object.prototype.hasOwnProperty.call(schema, 'const')) {
      values = [schema.const];
    } else if (Object.prototype.hasOwnProperty.call(schema, 'enum')) {
      if (!Array.isArray(schema.enum) || schema.enum.length === 0 ||
          schema.enum.length > MAX_ARGUMENT_CHOICES) {
        return false;
      }
      values = schema.enum.slice();
    }
    if (values === null) { return null; }
    var choiceType = null;
    var canonical = new Set();
    for (var index = 0; index < values.length; index += 1) {
      var currentType = scalarChoiceType(values[index]);
      if (!currentType || (choiceType && currentType !== choiceType)) { return false; }
      choiceType = currentType;
      var key = typeof values[index] + ':' + String(values[index]);
      if (canonical.has(key)) { return false; }
      canonical.add(key);
    }
    if (schema.type !== undefined) {
      if (schema.type === 'number' && choiceType === 'integer') {
        choiceType = 'number';
      } else if (schema.type !== choiceType) {
        return false;
      }
    }
    return { values: values, type: choiceType };
  }

  function patternAcceptsChoices(schema, choices) {
    if (!Object.prototype.hasOwnProperty.call(schema, 'pattern')) { return true; }
    if (!choices || choices.type !== 'string' || typeof schema.pattern !== 'string' ||
        schema.pattern.length === 0 || schema.pattern.length > 128 ||
        /(?:\([^)]*[+*][^)]*\))[+*{]|(?:[+*}])[+*{]/.test(schema.pattern)) {
      return false;
    }
    try {
      var expression = new RegExp(schema.pattern);
      return choices.values.every(function(value) { return expression.test(value); });
    } catch (_error) {
      return false;
    }
  }

  function valueSatisfiesConstraints(value, type, minLength, maxLength, minimum, maximum) {
    if (type === 'string') {
      return typeof value === 'string' && value.length >= minLength && value.length <= maxLength;
    }
    if (type === 'boolean') { return typeof value === 'boolean'; }
    if (typeof value !== 'number' || !Number.isFinite(value) ||
        (type === 'integer' && !Number.isSafeInteger(value))) {
      return false;
    }
    return (minimum === null || value >= minimum) && (maximum === null || value <= maximum);
  }

  function compileField(name, schema, required) {
    if (!validFieldName(name) ||
        (!required && RESERVED_METADATA_NAME_RE.test(name) && name !== 'title') ||
        !isPlainObject(schema) || containsForbiddenSchemaKeyword(schema) ||
        secretField(name, schema) || schema.readOnly === true ||
        (schema.format !== undefined && schema.format !== null) ||
        Object.prototype.hasOwnProperty.call(schema, 'exclusiveMinimum') ||
        Object.prototype.hasOwnProperty.call(schema, 'exclusiveMaximum') ||
        Object.prototype.hasOwnProperty.call(schema, 'multipleOf')) {
      return null;
    }
    var label = fieldLabel(name);
    if (!label) { return null; }
    var choices = schemaChoices(schema);
    if (choices === false || !patternAcceptsChoices(schema, choices)) { return null; }
    var sourceType = choices ? choices.type : schema.type;
    if (sourceType !== 'string' && sourceType !== 'boolean' &&
        sourceType !== 'integer' && sourceType !== 'number') {
      return null;
    }

    var minLength = null;
    var maxLength = null;
    var minimum = null;
    var maximum = null;
    if (sourceType === 'string') {
      minLength = integerConstraint(schema, 'minLength', 0);
      var sourceMaximum = integerConstraint(schema, 'maxLength', MAX_ARGUMENT_STRING);
      if (minLength === false || sourceMaximum === false) { return null; }
      minLength = required ? Math.max(1, minLength) : minLength;
      maxLength = Math.min(MAX_ARGUMENT_STRING, sourceMaximum);
      if (minLength > maxLength) { return null; }
    } else if (sourceType === 'integer' || sourceType === 'number') {
      minimum = finiteConstraint(schema, 'minimum');
      maximum = finiteConstraint(schema, 'maximum');
      if (minimum === false || maximum === false ||
          (minimum !== null && maximum !== null && minimum > maximum) ||
          (sourceType === 'integer' &&
            ((minimum !== null && !Number.isSafeInteger(minimum)) ||
             (maximum !== null && !Number.isSafeInteger(maximum))))) {
        return null;
      }
    }
    if (choices && !choices.values.every(function(value) {
      return valueSatisfiesConstraints(value, sourceType, minLength, maxLength, minimum, maximum);
    })) {
      return null;
    }

    return {
      name: name,
      label: label,
      kind: choices ? 'choice' : sourceType,
      required: required,
      choices: choices ? choices.values.slice() : null,
      minLength: minLength,
      maxLength: maxLength,
      minimum: minimum,
      maximum: maximum
    };
  }

  function resolvedMatchesAuthority(resolved, executionAuthority) {
    if (!hasExactAuthorityKeys(executionAuthority) || !resolved || resolved.tier !== 'T1a' ||
        !resolved.handler || typeof resolved.handler.handle !== 'function') {
      return false;
    }
    var capabilityRouter = router();
    if (!capabilityRouter || typeof capabilityRouter.getResolvedParamsSchema !== 'function') { return false; }
    var resolvedSchema = canonicalSchemaJson(capabilityRouter.getResolvedParamsSchema(resolved));
    var authoritySchema = canonicalSchemaJson(executionAuthority.paramSchema);
    return resolvedSchema !== null && authoritySchema !== null && resolvedSchema === authoritySchema &&
      exactExecutionOrigin(resolved) === executionAuthority.executionOrigin &&
      resolvedSideEffectClass(resolved) === executionAuthority.sideEffectClass &&
      /^sha256:[0-9a-f]{64}$/.test(executionAuthority.schemaDigest);
  }

  function analyzeArgumentSchema(resolvedEntry, executionAuthority) {
    var digest = executionAuthority && executionAuthority.schemaDigest;
    if (!resolvedMatchesAuthority(resolvedEntry, executionAuthority)) {
      return unsupportedArgumentContract(digest, 'execution-authority-unavailable');
    }
    var capabilityRouter = router();
    if (!capabilityRouter || typeof capabilityRouter.validateResolvedArgs !== 'function') {
      return unsupportedArgumentContract(digest, 'argument-contract-unsupported');
    }
    var schema = executionAuthority.paramSchema;
    var emptyValid = false;
    try {
      var isolatedSchema = canonicalSchemaJson(schema);
      if (isolatedSchema === null) {
        return unsupportedArgumentContract(digest, 'argument-contract-unsupported');
      }
      emptyValid = capabilityRouter.validateResolvedArgs({
        tier: resolvedEntry.tier,
        params: JSON.parse(isolatedSchema)
      }, {}) === true;
    } catch (_emptyValidationError) {
      return unsupportedArgumentContract(digest, 'argument-contract-unsupported');
    }
    if (containsForbiddenSchemaKeyword(schema)) {
      return unsupportedArgumentContract(digest, 'argument-contract-unsupported');
    }
    if (emptyValid) { return emptyArgumentContract(digest); }
    if (!isPlainObject(schema) || schema.type !== 'object' || schema.additionalProperties !== false ||
        !isPlainObject(schema.properties)) {
      return unsupportedArgumentContract(digest, 'argument-contract-unsupported');
    }
    var propertyEntries = ownDataEntries(schema.properties);
    if (!propertyEntries) { return unsupportedArgumentContract(digest, 'argument-contract-unsupported'); }
    var required = Array.isArray(schema.required) ? schema.required.slice() : [];
    var requiredSet = new Set();
    for (var requiredIndex = 0; requiredIndex < required.length; requiredIndex += 1) {
      var requiredName = required[requiredIndex];
      if (!validFieldName(requiredName) || requiredSet.has(requiredName) ||
          !Object.prototype.hasOwnProperty.call(schema.properties, requiredName)) {
        return unsupportedArgumentContract(digest, 'argument-contract-unsupported');
      }
      requiredSet.add(requiredName);
    }
    if (requiredSet.size > MAX_ARGUMENT_FIELDS) {
      return unsupportedArgumentContract(digest, 'argument-contract-unsupported');
    }

    propertyEntries.sort(function(left, right) {
      var leftRequired = requiredSet.has(left[0]);
      var rightRequired = requiredSet.has(right[0]);
      if (leftRequired !== rightRequired) { return leftRequired ? -1 : 1; }
      return left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0;
    });
    var fields = [];
    for (var propertyIndex = 0; propertyIndex < propertyEntries.length; propertyIndex += 1) {
      var propertyName = propertyEntries[propertyIndex][0];
      var isRequired = requiredSet.has(propertyName);
      var field = compileField(propertyName, propertyEntries[propertyIndex][1], isRequired);
      if (!field) {
        if (isRequired) {
          return unsupportedArgumentContract(digest, 'argument-contract-unsupported');
        }
        continue;
      }
      if (fields.length < MAX_ARGUMENT_FIELDS) { fields.push(field); }
    }
    if (fields.filter(function(field) { return field.required; }).length !== requiredSet.size) {
      return unsupportedArgumentContract(digest, 'argument-contract-unsupported');
    }
    return deepFreeze({ mode: 'form', fields: fields, reason: null, schemaDigest: digest });
  }

  function validArgumentField(field) {
    if (!hasExactKeys(field, ARGUMENT_FIELD_KEYS) || !validFieldName(field.name) ||
        field.label !== fieldLabel(field.name) || !FIELD_KINDS[field.kind] ||
        typeof field.required !== 'boolean') {
      return false;
    }
    if (field.kind === 'choice') {
      if (!Array.isArray(field.choices) || field.choices.length === 0 ||
          field.choices.length > MAX_ARGUMENT_CHOICES) { return false; }
    } else if (field.choices !== null) {
      return false;
    }
    if (field.kind === 'string') {
      return Number.isSafeInteger(field.minLength) && field.minLength >= 0 &&
        Number.isSafeInteger(field.maxLength) && field.maxLength >= field.minLength &&
        field.maxLength <= MAX_ARGUMENT_STRING && field.minimum === null && field.maximum === null;
    }
    if (field.kind === 'integer' || field.kind === 'number') {
      return field.minLength === null && field.maxLength === null &&
        (field.minimum === null || (typeof field.minimum === 'number' && Number.isFinite(field.minimum))) &&
        (field.maximum === null || (typeof field.maximum === 'number' && Number.isFinite(field.maximum))) &&
        (field.minimum === null || field.maximum === null || field.minimum <= field.maximum);
    }
    if (field.kind === 'boolean') {
      return field.minLength === null && field.maxLength === null &&
        field.minimum === null && field.maximum === null;
    }
    if (field.kind === 'bounded-object') {
      return field.choices === null && field.minLength === null && field.maxLength === null &&
        field.minimum === null && field.maximum === null;
    }
    if (field.minLength !== null && (!Number.isSafeInteger(field.minLength) || field.minLength < 0)) return false;
    if (field.maxLength !== null && (!Number.isSafeInteger(field.maxLength) || field.maxLength < 0)) return false;
    if (field.minimum !== null && (typeof field.minimum !== 'number' || !Number.isFinite(field.minimum))) return false;
    if (field.maximum !== null && (typeof field.maximum !== 'number' || !Number.isFinite(field.maximum))) return false;
    return true;
  }

  function validateArgumentContractShape(contract) {
    if (!hasExactKeys(contract, ARGUMENT_CONTRACT_KEYS) || !ARGUMENT_MODES[contract.mode] ||
        !Array.isArray(contract.fields) || contract.fields.length > MAX_ARGUMENT_FIELDS ||
        !(contract.schemaDigest === null ||
          (typeof contract.schemaDigest === 'string' && /^sha256:[0-9a-f]{64}$/.test(contract.schemaDigest)))) {
      return false;
    }
    if (contract.mode === 'unsupported') {
      return contract.fields.length === 0 && typeof contract.reason === 'string' &&
        /^(?:argument-contract-unsupported|execution-authority-unavailable)$/.test(contract.reason);
    }
    if (contract.reason !== null || typeof contract.schemaDigest !== 'string') { return false; }
    if (contract.mode === 'empty') { return contract.fields.length === 0; }
    if (contract.fields.length === 0) { return false; }
    var names = new Set();
    for (var index = 0; index < contract.fields.length; index += 1) {
      var field = contract.fields[index];
      if (!validArgumentField(field) || names.has(field.name) || secretField(field.name, field)) {
        return false;
      }
      names.add(field.name);
    }
    return true;
  }

  function boundedConsequenceText(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_CONSEQUENCE_TEXT &&
      !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]/.test(value);
  }

  function consequenceFailure(slug, reason) {
    return deepFreeze({
      slug: typeof slug === 'string' ? slug : '',
      compatible: false,
      reason: reason || 'consequence-contract-invalid',
      effectLabel: null,
      progressLabel: null,
      targetRoles: [],
      materialRoles: [],
      excludedFromCollection: [],
      effectiveArgumentContract: null,
      acceptedConsequenceFields: [],
      excludedConsequenceFields: []
    });
  }

  function closedBoundedObjectSchema(schema) {
    if (!isPlainObject(schema) || schema.type !== 'object' ||
        schema.additionalProperties !== false || !isPlainObject(schema.properties) ||
        !Number.isSafeInteger(schema.maxProperties) || schema.maxProperties < 1 ||
        schema.maxProperties > MAX_CONSEQUENCE_OBJECT_PROPERTIES) {
      return false;
    }
    var entries = ownDataEntries(schema.properties);
    if (!entries || entries.length === 0 || entries.length > schema.maxProperties) { return false; }
    var required = Array.isArray(schema.required) ? schema.required : [];
    if (required.some(function(name, index) {
      return !validFieldName(name) || required.indexOf(name) !== index ||
        !Object.prototype.hasOwnProperty.call(schema.properties, name);
    })) {
      return false;
    }
    return entries.every(function(entry) {
      var name = entry[0];
      var leaf = entry[1];
      if (!isPlainObject(leaf) || containsForbiddenSchemaKeyword(leaf) || secretField(name, leaf) ||
          leaf.readOnly === true || leaf.writeOnly === true) {
        return false;
      }
      if (leaf.type === 'string') {
        return Number.isSafeInteger(leaf.maxLength) && leaf.maxLength >= 0 &&
          leaf.maxLength <= MAX_CONSEQUENCE_OBJECT_STRING;
      }
      if (leaf.type === 'boolean') { return true; }
      if (leaf.type === 'integer' || leaf.type === 'number') {
        return typeof leaf.minimum === 'number' && Number.isFinite(leaf.minimum) &&
          typeof leaf.maximum === 'number' && Number.isFinite(leaf.maximum) &&
          leaf.minimum <= leaf.maximum;
      }
      return schemaChoices(leaf) !== null && schemaChoices(leaf) !== false;
    });
  }

  function scalarRoleCompatible(field, schema, role) {
    if (role.render !== 'scalar') { return false; }
    if (!['string', 'boolean', 'integer', 'number', 'choice'].includes(field.kind)) { return false; }
    var choices = schemaChoices(schema);
    if (field.kind === 'choice') {
      if (!choices || choices === false ||
          canonicalSchemaJson(choices.values) !== canonicalSchemaJson(field.choices)) {
        return false;
      }
    } else if (choices !== null) {
      return false;
    } else if (schema.type !== field.kind) {
      return false;
    }
    if (field.kind === 'string') {
      return Number.isSafeInteger(field.minLength) && field.minLength <= role.maxLength;
    }
    if (field.kind === 'choice') {
      return field.choices.every(function(choice) {
        return String(choice).length <= role.maxLength;
      });
    }
    if (field.kind === 'boolean') { return role.maxLength >= 5; }
    return field.minimum !== null && field.maximum !== null &&
      String(field.minimum).length <= role.maxLength && String(field.maximum).length <= role.maxLength;
  }

  function normalizeConsequenceRole(role, fieldsByName, schemaProperties) {
    if (!hasExactDataKeys(role, CONSEQUENCE_ROLE_KEYS) || !validFieldName(role.field) ||
        !boundedConsequenceText(role.label) || !CONSEQUENCE_RENDERS[role.render] ||
        !Number.isSafeInteger(role.maxLength) || role.maxLength < 1 ||
        role.maxLength > MAX_CONSEQUENCE_ROLE_LENGTH || !fieldsByName.has(role.field) ||
        !Object.prototype.hasOwnProperty.call(schemaProperties, role.field)) {
      return null;
    }
    var field = fieldsByName.get(role.field);
    var schema = schemaProperties[role.field];
    if (!isPlainObject(schema) || secretField(role.field, schema) || schema.writeOnly === true) { return null; }
    if (role.render === 'scalar') {
      if (!scalarRoleCompatible(field, schema, role)) { return null; }
    } else if (!closedBoundedObjectSchema(schema)) {
      return null;
    }
    return {
      field: role.field,
      label: role.label,
      render: role.render,
      maxLength: role.maxLength
    };
  }

  function normalizeConsequenceRoles(roles, fieldsByName, schemaProperties) {
    if (!Array.isArray(roles) || roles.length === 0 || roles.length > MAX_ARGUMENT_FIELDS) { return null; }
    var fields = new Set();
    var labels = new Set();
    var normalized = [];
    for (var index = 0; index < roles.length; index += 1) {
      var role = normalizeConsequenceRole(roles[index], fieldsByName, schemaProperties);
      if (!role || fields.has(role.field) || labels.has(role.label)) { return null; }
      fields.add(role.field);
      labels.add(role.label);
      normalized.push(role);
    }
    return normalized;
  }

  function copyArgumentField(field, consequenceMaximum) {
    var copied = {
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
    if (copied.kind === 'string' && Number.isSafeInteger(consequenceMaximum)) {
      copied.maxLength = Math.min(copied.maxLength, consequenceMaximum);
      if (copied.minLength > copied.maxLength) { return null; }
    }
    return copied;
  }

  function compileConsequenceContract(slug, rawContract, executionAuthority, argumentContract) {
    if (!validFieldName(slug) || !hasExactDataKeys(rawContract, CONSEQUENCE_CONTRACT_KEYS)) {
      return consequenceFailure(slug, 'consequence-contract-missing');
    }
    if (!hasExactAuthorityKeys(executionAuthority) ||
        (executionAuthority.sideEffectClass !== 'write' &&
          executionAuthority.sideEffectClass !== 'destructive') ||
        !validateArgumentContractShape(argumentContract) || argumentContract.mode !== 'form' ||
        argumentContract.schemaDigest !== executionAuthority.schemaDigest ||
        !isPlainObject(executionAuthority.paramSchema) ||
        executionAuthority.paramSchema.type !== 'object' ||
        executionAuthority.paramSchema.additionalProperties !== false ||
        !isPlainObject(executionAuthority.paramSchema.properties) ||
        !boundedConsequenceText(rawContract.effectLabel) ||
        !boundedConsequenceText(rawContract.progressLabel)) {
      return consequenceFailure(slug, 'consequence-contract-invalid');
    }

    var fieldsByName = new Map(argumentContract.fields.map(function(field) {
      return [field.name, field];
    }));
    var targetRoles = normalizeConsequenceRoles(
      rawContract.targetRoles,
      fieldsByName,
      executionAuthority.paramSchema.properties
    );
    if (!targetRoles) { return consequenceFailure(slug, 'target-role-invalid'); }
    var materialRoles = normalizeConsequenceRoles(
      rawContract.materialRoles,
      fieldsByName,
      executionAuthority.paramSchema.properties
    );
    if (!materialRoles) { return consequenceFailure(slug, 'material-unrepresentable'); }

    if (!Array.isArray(rawContract.excludedFromCollection) ||
        rawContract.excludedFromCollection.length > MAX_ARGUMENT_FIELDS) {
      return consequenceFailure(slug, 'exclusion-invalid');
    }
    var excluded = [];
    var excludedSet = new Set();
    var targetFields = new Set(targetRoles.map(function(role) { return role.field; }));
    for (var exclusionIndex = 0;
      exclusionIndex < rawContract.excludedFromCollection.length;
      exclusionIndex += 1) {
      var excludedName = rawContract.excludedFromCollection[exclusionIndex];
      var excludedField = fieldsByName.get(excludedName);
      var excludedSchema = executionAuthority.paramSchema.properties[excludedName];
      if (!validFieldName(excludedName) || excludedSet.has(excludedName) || !excludedField ||
          excludedField.required || targetFields.has(excludedName) || !isPlainObject(excludedSchema) ||
          secretField(excludedName, excludedSchema)) {
        return consequenceFailure(slug, 'exclusion-invalid');
      }
      excludedSet.add(excludedName);
      excluded.push(excludedName);
    }
    excluded.sort();

    var roleMaximums = new Map();
    targetRoles.concat(materialRoles).forEach(function(role) {
      var current = roleMaximums.get(role.field);
      roleMaximums.set(role.field, current === undefined
        ? role.maxLength
        : Math.min(current, role.maxLength));
    });
    var effectiveFields = [];
    for (var fieldIndex = 0; fieldIndex < argumentContract.fields.length; fieldIndex += 1) {
      var argumentField = argumentContract.fields[fieldIndex];
      if (excludedSet.has(argumentField.name)) { continue; }
      var copiedField = copyArgumentField(argumentField, roleMaximums.get(argumentField.name));
      if (!copiedField) { return consequenceFailure(slug, 'material-unrepresentable'); }
      effectiveFields.push(copiedField);
    }
    var accepted = effectiveFields.map(function(field) { return field.name; }).sort();
    var represented = Array.from(new Set(targetRoles.concat(materialRoles).map(function(role) {
      return role.field;
    }))).filter(function(field) { return !excludedSet.has(field); }).sort();
    if (accepted.length !== represented.length || accepted.some(function(field, index) {
      return field !== represented[index];
    })) {
      return consequenceFailure(slug, 'accepted-field-unregistered');
    }
    if (targetRoles.some(function(role) { return excludedSet.has(role.field); }) ||
        materialRoles.some(function(role) { return excludedSet.has(role.field); })) {
      return consequenceFailure(slug, 'exclusion-invalid');
    }
    if (!targetRoles.some(function(role) {
      return fieldsByName.get(role.field).required;
    })) {
      return consequenceFailure(slug, 'target-role-invalid');
    }
    if (!materialRoles.some(function(role) {
      return fieldsByName.get(role.field).required;
    })) {
      return consequenceFailure(slug, 'material-unrepresentable');
    }

    var effectiveArgumentContract = {
      mode: 'form',
      fields: effectiveFields,
      reason: null,
      schemaDigest: argumentContract.schemaDigest
    };
    if (!validateArgumentContractShape(effectiveArgumentContract)) {
      return consequenceFailure(slug, 'material-unrepresentable');
    }
    return deepFreeze({
      slug: slug,
      compatible: true,
      reason: null,
      effectLabel: rawContract.effectLabel,
      progressLabel: rawContract.progressLabel,
      targetRoles: targetRoles,
      materialRoles: materialRoles,
      excludedFromCollection: excluded.slice(),
      effectiveArgumentContract: effectiveArgumentContract,
      acceptedConsequenceFields: accepted,
      excludedConsequenceFields: excluded.slice()
    });
  }

  function renderScalar(value, maximum) {
    if (typeof value === 'string') {
      if (value.length === 0 || value.length > maximum ||
          /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value)) {
        return null;
      }
      return value;
    }
    if (typeof value === 'boolean') { return String(value); }
    if (typeof value === 'number' && Number.isFinite(value)) {
      var numeric = String(value);
      return numeric.length <= maximum ? numeric : null;
    }
    return null;
  }

  function renderBoundedObject(value, maximum) {
    var entries = ownDataEntries(value);
    if (!entries || entries.length === 0 || entries.length > MAX_CONSEQUENCE_OBJECT_PROPERTIES) {
      return null;
    }
    entries.sort(function(left, right) {
      return left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0;
    });
    var parts = [];
    for (var index = 0; index < entries.length; index += 1) {
      var name = entries[index][0];
      if (!validFieldName(name) || SECRET_NAME_RE.test(name)) { return null; }
      var rendered = renderScalar(entries[index][1], MAX_CONSEQUENCE_OBJECT_STRING);
      if (rendered === null) { return null; }
      parts.push(name + ': ' + rendered);
    }
    var output = parts.join(', ');
    return output.length <= maximum ? output : null;
  }

  function renderConsequenceRole(role, args) {
    if (!Object.prototype.hasOwnProperty.call(args, role.field)) { return null; }
    var rendered = role.render === 'scalar'
      ? renderScalar(args[role.field], role.maxLength)
      : renderBoundedObject(args[role.field], role.maxLength);
    if (rendered === null) { return false; }
    return { field: role.field, label: role.label, value: rendered };
  }

  function materializeConsequence(compiledContract, args) {
    if (!hasExactDataKeys(compiledContract, COMPILED_CONSEQUENCE_KEYS) ||
        compiledContract.compatible !== true || compiledContract.reason !== null ||
        !validateCollectedArguments(compiledContract.effectiveArgumentContract, args)) {
      return null;
    }
    var entries = ownDataEntries(args);
    if (!entries) { return null; }
    var targetItems = [];
    var materialItems = [];
    var renderedFields = new Set();
    for (var targetIndex = 0; targetIndex < compiledContract.targetRoles.length; targetIndex += 1) {
      var targetItem = renderConsequenceRole(compiledContract.targetRoles[targetIndex], args);
      if (targetItem === false) { return null; }
      if (targetItem) {
        targetItems.push(targetItem);
        renderedFields.add(targetItem.field);
      }
    }
    for (var materialIndex = 0; materialIndex < compiledContract.materialRoles.length; materialIndex += 1) {
      var materialItem = renderConsequenceRole(compiledContract.materialRoles[materialIndex], args);
      if (materialItem === false) { return null; }
      if (materialItem) {
        materialItems.push(materialItem);
        renderedFields.add(materialItem.field);
      }
    }
    if (targetItems.length === 0 || materialItems.length === 0) { return null; }
    var suppliedFields = entries.map(function(entry) { return entry[0]; }).sort();
    var renderedFieldNames = Array.from(renderedFields).sort();
    if (suppliedFields.length !== renderedFieldNames.length || suppliedFields.some(function(field, index) {
      return field !== renderedFieldNames[index];
    })) {
      return null;
    }
    var target = targetItems.map(function(item) {
      return item.label + ': ' + item.value;
    }).join('; ');
    var parameterSummary = materialItems.map(function(item) {
      return item.label + ': ' + item.value;
    }).join('; ') + '.';
    var totalLength = target.length + compiledContract.effectLabel.length +
      parameterSummary.length + compiledContract.progressLabel.length;
    if (totalLength > MAX_CONSEQUENCE_RENDER) { return null; }
    return deepFreeze({
      target: target,
      effect: compiledContract.effectLabel,
      parameterSummary: parameterSummary,
      gerund: compiledContract.progressLabel,
      targetItems: targetItems,
      materialItems: materialItems,
      renderedFields: renderedFieldNames
    });
  }

  function parseNumber(value, integer) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || (integer && !Number.isSafeInteger(value))) { return null; }
      return value;
    }
    if (typeof value !== 'string' || value.length === 0 ||
        !(integer ? /^-?(?:0|[1-9][0-9]*)$/.test(value) :
          /^-?(?:(?:0|[1-9][0-9]*)(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(value))) {
      return null;
    }
    var parsed = Number(value);
    return Number.isFinite(parsed) && (!integer || Number.isSafeInteger(parsed)) ? parsed : null;
  }

  function parseChoice(field, value) {
    var first = field.choices[0];
    if (typeof first === 'string') {
      return typeof value === 'string' && field.choices.includes(value) ? value : undefined;
    }
    if (typeof first === 'boolean') {
      var booleanValue = value;
      if (value === 'true') { booleanValue = true; }
      if (value === 'false') { booleanValue = false; }
      return typeof booleanValue === 'boolean' && field.choices.includes(booleanValue)
        ? booleanValue : undefined;
    }
    var numberValue = parseNumber(value, field.choices.every(Number.isSafeInteger));
    return numberValue !== null && field.choices.includes(numberValue) ? numberValue : undefined;
  }

  function parseFieldValue(field, rawValue) {
    if (field.kind === 'string') {
      return typeof rawValue === 'string' && rawValue.length >= field.minLength &&
        rawValue.length <= field.maxLength ? rawValue : undefined;
    }
    if (field.kind === 'boolean') {
      return typeof rawValue === 'boolean' ? rawValue : undefined;
    }
    if (field.kind === 'choice') { return parseChoice(field, rawValue); }
    if (field.kind === 'bounded-object') {
      var objectEntries = ownDataEntries(rawValue);
      if (!objectEntries || objectEntries.length === 0 ||
          objectEntries.length > MAX_CONSEQUENCE_OBJECT_PROPERTIES) {
        return undefined;
      }
      var objectValue = {};
      for (var objectIndex = 0; objectIndex < objectEntries.length; objectIndex += 1) {
        var objectName = objectEntries[objectIndex][0];
        var objectLeaf = objectEntries[objectIndex][1];
        if (!validFieldName(objectName) || SECRET_NAME_RE.test(objectName) ||
            !['string', 'number', 'boolean'].includes(typeof objectLeaf) ||
            (typeof objectLeaf === 'string' && objectLeaf.length > MAX_CONSEQUENCE_OBJECT_STRING) ||
            (typeof objectLeaf === 'number' && !Number.isFinite(objectLeaf))) {
          return undefined;
        }
        objectValue[objectName] = objectLeaf;
      }
      return objectValue;
    }
    var parsed = parseNumber(rawValue, field.kind === 'integer');
    if (parsed === null || (field.minimum !== null && parsed < field.minimum) ||
        (field.maximum !== null && parsed > field.maximum)) {
      return undefined;
    }
    return parsed;
  }

  function parseCollectedArguments(contract, submittedOwnKeyObject) {
    if (!validateArgumentContractShape(contract)) {
      return deepFreeze({ ok: false, reason: 'argument-submission-invalid' });
    }
    var entries = ownDataEntries(submittedOwnKeyObject);
    if (!entries) { return deepFreeze({ ok: false, reason: 'argument-submission-invalid' }); }
    if (contract.mode === 'unsupported') {
      return deepFreeze({ ok: false, reason: 'argument-submission-invalid' });
    }
    if (contract.mode === 'empty') {
      return entries.length === 0
        ? deepFreeze({ ok: true, args: {} })
        : deepFreeze({ ok: false, reason: 'argument-submission-invalid' });
    }
    var fieldsByName = new Map(contract.fields.map(function(field) { return [field.name, field]; }));
    var submitted = new Map();
    for (var entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      if (!fieldsByName.has(entries[entryIndex][0])) {
        return deepFreeze({ ok: false, reason: 'argument-submission-invalid' });
      }
      submitted.set(entries[entryIndex][0], entries[entryIndex][1]);
    }
    var args = {};
    for (var fieldIndex = 0; fieldIndex < contract.fields.length; fieldIndex += 1) {
      var field = contract.fields[fieldIndex];
      if (!submitted.has(field.name)) {
        if (field.required) { return deepFreeze({ ok: false, reason: 'argument-submission-invalid' }); }
        continue;
      }
      var rawValue = submitted.get(field.name);
      var blankOptional = !field.required && rawValue === '' && field.kind !== 'boolean';
      if (blankOptional) { continue; }
      var parsedValue = parseFieldValue(field, rawValue);
      if (parsedValue === undefined) {
        return deepFreeze({ ok: false, reason: 'argument-submission-invalid' });
      }
      args[field.name] = parsedValue;
    }
    return deepFreeze({ ok: true, args: args });
  }

  function validateCollectedArguments(contract, args) {
    if (!validateArgumentContractShape(contract)) { return false; }
    var parsed = parseCollectedArguments(contract, args);
    if (!parsed.ok) { return false; }
    var source = canonicalSchemaJson(args);
    var normalized = canonicalSchemaJson(parsed.args);
    return source !== null && normalized !== null && source === normalized;
  }

  async function normalizeResolvedAuthority(resolved) {
    if (!isPlainObject(resolved) || resolved.tier !== 'T1a' ||
        !resolved.handler || typeof resolved.handler.handle !== 'function') {
      return null;
    }
    var executionOrigin = exactExecutionOrigin(resolved);
    var sideEffectClass = resolvedSideEffectClass(resolved);
    var capabilityRouter = router();
    if (!executionOrigin || !sideEffectClass || !capabilityRouter ||
        typeof capabilityRouter.getResolvedParamsSchema !== 'function') {
      return null;
    }
    var sourceSchema = capabilityRouter.getResolvedParamsSchema(resolved);
    var canonical = canonicalSchemaJson(sourceSchema);
    if (canonical === null) { return null; }
    var digest = await digestCanonical(canonical);
    if (!digest) { return null; }
    return deepFreeze({
      tier: 'T1a',
      executionOrigin: executionOrigin,
      sideEffectClass: sideEffectClass,
      paramSchema: JSON.parse(canonical),
      schemaDigest: digest
    });
  }

  function hasExactAuthorityKeys(value) {
    if (!isPlainObject(value)) { return false; }
    var keys = Reflect.ownKeys(value);
    if (keys.length !== AUTHORITY_KEYS.length ||
        keys.some(function(key) { return typeof key !== 'string'; })) {
      return false;
    }
    var expected = AUTHORITY_KEYS.slice().sort();
    keys.sort();
    return keys.every(function(key, index) { return key === expected[index]; });
  }

  function authorityMatches(expected, actual) {
    if (!hasExactAuthorityKeys(expected) || !hasExactAuthorityKeys(actual) ||
        expected.tier !== 'T1a' || actual.tier !== 'T1a' ||
        expected.executionOrigin !== actual.executionOrigin ||
        expected.sideEffectClass !== actual.sideEffectClass ||
        expected.schemaDigest !== actual.schemaDigest ||
        !SIDE_EFFECT_CLASSES[expected.sideEffectClass] ||
        !/^sha256:[0-9a-f]{64}$/.test(expected.schemaDigest)) {
      return false;
    }
    var expectedSchema = canonicalSchemaJson(expected.paramSchema);
    var actualSchema = canonicalSchemaJson(actual.paramSchema);
    return expectedSchema !== null && actualSchema !== null && expectedSchema === actualSchema;
  }

  var api = deepFreeze({
    CONSEQUENCE_BOUNDS: CONSEQUENCE_BOUNDS,
    canonicalSchemaJson: canonicalSchemaJson,
    schemaDigest: schemaDigest,
    normalizeResolvedAuthority: normalizeResolvedAuthority,
    authorityMatches: authorityMatches,
    analyzeArgumentSchema: analyzeArgumentSchema,
    parseCollectedArguments: parseCollectedArguments,
    validateCollectedArguments: validateCollectedArguments,
    validateArgumentContract: validateArgumentContractShape,
    compileConsequenceContract: compileConsequenceContract,
    materializeConsequence: materializeConsequence,
    _schemaDigestForTest: schemaDigestForTest
  });

  global.FsbSkopeoActionAuthority = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
