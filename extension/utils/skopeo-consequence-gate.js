(function(global) {
  'use strict';

  var MAX_IDENTIFIER_LENGTH = 128;
  var MAX_LABEL_LENGTH = 80;
  var MAX_TEXT_LENGTH = 1024;
  var MAX_PARAMS = 32;
  var TOKEN_TTL_MS = 30000;

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) { return value; }
    Reflect.ownKeys(value).forEach(function(key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  var STATUS = deepFreeze({
    IDLE: 'idle',
    OPEN: 'open',
    PENDING: 'pending',
    COMPLETE: 'complete',
    CANCELLED: 'cancelled',
    STALE: 'stale'
  });

  var RISK_COPY = deepFreeze({
    write: 'changes-data',
    destructive: 'destructive'
  });

  var OPEN_KEYS = [
    'generation',
    'exactOrigin',
    'profileVersion',
    'contextEpoch',
    'semanticEntity',
    'slug',
    'args'
  ];
  var CONFIRM_KEYS = OPEN_KEYS.concat(['actionToken']);

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { return false; }
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null ||
      (Object.prototype.toString.call(value) === '[object Object]' &&
        Object.getPrototypeOf(prototype) === null);
  }

  function hasExactKeys(value, expected) {
    if (!isPlainObject(value)) { return false; }
    var keys = Reflect.ownKeys(value);
    if (keys.length !== expected.length || keys.some(function(key) { return typeof key !== 'string'; })) {
      return false;
    }
    var allowed = new Set(expected);
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!allowed.has(key) || !descriptor ||
          !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.enumerable !== true) {
        return false;
      }
    }
    return true;
  }

  function ownDataKeys(value) {
    if (!isPlainObject(value)) { return null; }
    var keys = Reflect.ownKeys(value);
    if (keys.some(function(key) { return typeof key !== 'string'; })) { return null; }
    for (var index = 0; index < keys.length; index += 1) {
      var descriptor = Object.getOwnPropertyDescriptor(value, keys[index]);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.enumerable !== true) {
        return null;
      }
    }
    return keys;
  }

  function positiveSafeInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  function boundedText(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value);
  }

  function identifier(value) {
    return boundedText(value, MAX_IDENTIFIER_LENGTH) &&
      /^[a-z0-9][A-Za-z0-9._-]*$/.test(value);
  }

  function exactHttpsOrigin(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 2048) { return false; }
    try {
      var parsed = new URL(value);
      return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '' &&
        parsed.port === '' && parsed.origin === value && parsed.pathname === '/' &&
        parsed.search === '' && parsed.hash === '';
    } catch (_error) {
      return false;
    }
  }

  function cloneData(value, ancestors, depth) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') { return value; }
    if (typeof value === 'number') { return Number.isFinite(value) ? value : undefined; }
    if (!value || typeof value !== 'object' || depth > 12 || ancestors.has(value)) { return undefined; }
    ancestors.add(value);
    var output;
    if (Array.isArray(value)) {
      var arrayKeys = Reflect.ownKeys(value);
      if (arrayKeys.some(function(key) {
        return typeof key !== 'string' || (key !== 'length' && !/^(?:0|[1-9][0-9]*)$/.test(key));
      })) {
        ancestors.delete(value);
        return undefined;
      }
      output = [];
      for (var arrayIndex = 0; arrayIndex < value.length; arrayIndex += 1) {
        var arrayDescriptor = Object.getOwnPropertyDescriptor(value, String(arrayIndex));
        if (!arrayDescriptor || !Object.prototype.hasOwnProperty.call(arrayDescriptor, 'value')) {
          ancestors.delete(value);
          return undefined;
        }
        var item = cloneData(arrayDescriptor.value, ancestors, depth + 1);
        if (item === undefined) {
          ancestors.delete(value);
          return undefined;
        }
        output.push(item);
      }
    } else {
      var keys = ownDataKeys(value);
      if (!keys) {
        ancestors.delete(value);
        return undefined;
      }
      output = {};
      for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        var key = keys[keyIndex];
        var child = cloneData(value[key], ancestors, depth + 1);
        if (child === undefined) {
          ancestors.delete(value);
          return undefined;
        }
        output[key] = child;
      }
    }
    ancestors.delete(value);
    return output;
  }

  function normalizeEntity(value) {
    if (value === null) { return null; }
    if (!hasExactKeys(value, ['kind', 'id', 'label']) || !identifier(value.kind) ||
        !boundedText(value.id, MAX_TEXT_LENGTH) || !boundedText(value.label, MAX_LABEL_LENGTH) ||
        /^[.#\[*+>~:]|\[(?:style|role|data-[^\]]+)\s*[~|^$*]?=/i.test(value.id)) {
      return undefined;
    }
    return deepFreeze({ kind: value.kind, id: value.id, label: value.label });
  }

  function requestShapeValid(value, expectedKeys) {
    if (!hasExactKeys(value, expectedKeys) || !positiveSafeInteger(value.generation) ||
        !exactHttpsOrigin(value.exactOrigin) ||
        !boundedText(value.profileVersion, MAX_IDENTIFIER_LENGTH) ||
        !positiveSafeInteger(value.contextEpoch) || !identifier(value.slug) ||
        !isPlainObject(value.args)) {
      return false;
    }
    var argKeys = ownDataKeys(value.args);
    return !!argKeys && argKeys.length <= MAX_PARAMS && normalizeEntity(value.semanticEntity) !== undefined;
  }

  function validateOpenRequest(value) {
    return requestShapeValid(value, OPEN_KEYS);
  }

  function validateConfirmRequest(value) {
    return requestShapeValid(value, CONFIRM_KEYS) &&
      boundedText(value.actionToken, 160) && value.actionToken.length >= 16;
  }

  function validCaller(value) {
    return hasExactKeys(value, ['tabId']) && positiveSafeInteger(value.tabId);
  }

  function copyRequest(value) {
    var args = cloneData(value.args, new Set(), 0);
    var entity = normalizeEntity(value.semanticEntity);
    if (!isPlainObject(args) || entity === undefined) { return null; }
    return deepFreeze({
      generation: value.generation,
      exactOrigin: value.exactOrigin,
      profileVersion: value.profileVersion,
      contextEpoch: value.contextEpoch,
      semanticEntity: entity,
      slug: value.slug,
      args: args
    });
  }

  function sameEntity(left, right) {
    if (left === null || right === null) { return left === right; }
    return !!left && !!right && left.kind === right.kind && left.id === right.id &&
      left.label === right.label;
  }

  function canonicalEqual(actionAuthority, left, right) {
    var leftCanonical = actionAuthority.canonicalSchemaJson(left);
    var rightCanonical = actionAuthority.canonicalSchemaJson(right);
    return leftCanonical !== null && rightCanonical !== null && leftCanonical === rightCanonical;
  }

  function normalizeAuthority(value) {
    if (!isPlainObject(value) || !positiveSafeInteger(value.tabId) ||
        !positiveSafeInteger(value.generation) || !exactHttpsOrigin(value.exactOrigin) ||
        !boundedText(value.profileVersion, MAX_IDENTIFIER_LENGTH) ||
        !positiveSafeInteger(value.contextEpoch)) {
      return null;
    }
    var entity = normalizeEntity(value.semanticEntity);
    if (entity === undefined) { return null; }
    return deepFreeze({
      tabId: value.tabId,
      generation: value.generation,
      exactOrigin: value.exactOrigin,
      profileVersion: value.profileVersion,
      contextEpoch: value.contextEpoch,
      semanticEntity: entity
    });
  }

  function requestMatchesAuthority(request, caller, authority) {
    return caller.tabId === authority.tabId && request.generation === authority.generation &&
      request.exactOrigin === authority.exactOrigin &&
      request.profileVersion === authority.profileVersion &&
      request.contextEpoch === authority.contextEpoch &&
      sameEntity(request.semanticEntity, authority.semanticEntity);
  }

  function projectionMatchesAuthority(projection, authority) {
    return isPlainObject(projection) && projection.status === 'recognized' &&
      projection.tabId === authority.tabId && projection.generation === authority.generation &&
      projection.exactOrigin === authority.exactOrigin &&
      projection.profileVersion === authority.profileVersion && identifier(projection.profileId) &&
      /^sha256:[0-9a-f]{64}$/.test(projection.catalogVersion || '') &&
      identifier(projection.appStem) && boundedText(projection.service, 253) &&
      Array.isArray(projection.capabilityGroups) && projection.capabilityGroups.length > 0 &&
      projection.capabilityGroups.length <= 12;
  }

  function findProjectedCapability(projection, slug) {
    var matches = [];
    for (var groupIndex = 0; groupIndex < projection.capabilityGroups.length; groupIndex += 1) {
      var group = projection.capabilityGroups[groupIndex];
      if (!isPlainObject(group) || !Array.isArray(group.capabilities) ||
          group.capabilities.length === 0 || group.capabilities.length > 256) {
        return null;
      }
      for (var rowIndex = 0; rowIndex < group.capabilities.length; rowIndex += 1) {
        var row = group.capabilities[rowIndex];
        if (isPlainObject(row) && row.slug === slug) { matches.push(row); }
      }
    }
    return matches.length === 1 ? matches[0] : null;
  }

  function exactStringArray(value) {
    if (!Array.isArray(value) || value.length > MAX_PARAMS) { return null; }
    var output = [];
    var seen = new Set();
    for (var index = 0; index < value.length; index += 1) {
      if (!identifier(value[index]) || seen.has(value[index])) { return null; }
      seen.add(value[index]);
      output.push(value[index]);
    }
    return output;
  }

  function resolvedOrigin(resolved) {
    if (!resolved || !exactHttpsOrigin(resolved.origin)) { return null; }
    try {
      var handlerOrigin = resolved.handler && resolved.handler.origin;
      return handlerOrigin === undefined || handlerOrigin === null ||
        new URL(String(handlerOrigin)).origin === resolved.origin
        ? resolved.origin
        : null;
    } catch (_error) {
      return null;
    }
  }

  function resolvedClass(resolved) {
    var handlerClass = resolved && resolved.handler && resolved.handler.sideEffectClass;
    var descriptorClass = resolved && resolved.descriptor && resolved.descriptor.sideEffectClass;
    if (handlerClass && descriptorClass && handlerClass !== descriptorClass) { return null; }
    var sideEffectClass = handlerClass || descriptorClass;
    return sideEffectClass === 'write' || sideEffectClass === 'destructive'
      ? sideEffectClass
      : null;
  }

  async function normalizeInstalledAuthority(resolved, actionAuthority, router) {
    var normalized = null;
    try {
      normalized = await actionAuthority.normalizeResolvedAuthority(resolved);
    } catch (_error) {
      normalized = null;
    }
    if (normalized) { return normalized; }
    if (!resolved || resolved.tier !== 'T1a' || !resolved.handler ||
        typeof resolved.handler.handle !== 'function' ||
        typeof router.getResolvedParamsSchema !== 'function' ||
        typeof actionAuthority.schemaDigest !== 'function') {
      return null;
    }
    var executionOrigin = resolvedOrigin(resolved);
    var sideEffectClass = resolvedClass(resolved);
    var schema = router.getResolvedParamsSchema(resolved);
    var canonical = actionAuthority.canonicalSchemaJson(schema);
    if (!executionOrigin || !sideEffectClass || canonical === null) { return null; }
    var digest = await actionAuthority.schemaDigest(JSON.parse(canonical));
    if (!digest) { return null; }
    return deepFreeze({
      tier: 'T1a',
      executionOrigin: executionOrigin,
      sideEffectClass: sideEffectClass,
      paramSchema: JSON.parse(canonical),
      schemaDigest: digest
    });
  }

  function projectedRowReady(row, authority) {
    return isPlainObject(row) && row.presentationDisposition === 't1-ready' &&
      row.sourceReadiness === 't1-ready' && row.sourceTerminalState === 't1-ready' &&
      row.surfaceStatus === 't1-ready' && row.executionEnabled === true && row.invocable === true &&
      (row.sideEffectClass === 'write' || row.sideEffectClass === 'destructive') &&
      row.executionOrigin === authority.exactOrigin && row.executionBlockReason === null &&
      row.actionabilityReason === null && row.consequenceCompatible === true &&
      /^sha256:[0-9a-f]{64}$/.test(row.schemaDigest || '') &&
      /^sha256:[0-9a-f]{64}$/.test(row.consequenceDigest || '') &&
      isPlainObject(row.argumentContract);
  }

  function fullCapabilityMatchesProjection(full, row, projection) {
    return isPlainObject(full) && full.slug === row.slug && full.profileId === projection.profileId &&
      full.appStem === projection.appStem &&
      full.actionLabel === row.actionLabel && full.effect === row.effect &&
      full.sideEffectClass === row.sideEffectClass && full.presentationDisposition === 't1-ready' &&
      full.sourceReadiness === 't1-ready' && full.sourceTerminalState === 't1-ready' &&
      full.surfaceStatus === 't1-ready' && full.executionEnabled === true && full.invocable === true &&
      full.actionabilityReason === null && full.consequenceCompatible === true &&
      full.consequenceDigest === row.consequenceDigest && isPlainObject(full.executionAuthority) &&
      full.executionAuthority.executionOrigin === row.executionOrigin &&
      full.executionAuthority.schemaDigest === row.schemaDigest &&
      full.executionAuthority.sideEffectClass === row.sideEffectClass &&
      isPlainObject(full.argumentContract) && isPlainObject(full.consequenceContract) &&
      Array.isArray(full.acceptedConsequenceFields) && Array.isArray(full.excludedConsequenceFields);
  }

  function validConsequenceBounds(value) {
    return isPlainObject(value) && positiveSafeInteger(value.label) &&
      positiveSafeInteger(value.roleValue) && positiveSafeInteger(value.objectProperties) &&
      positiveSafeInteger(value.objectString) && positiveSafeInteger(value.aggregateRender) &&
      positiveSafeInteger(value.composedBody) && value.label <= value.roleValue &&
      value.roleValue <= value.aggregateRender && value.composedBody >= value.aggregateRender;
  }

  function materializedRows(value, bounds) {
    if (!validConsequenceBounds(bounds) || !isPlainObject(value) ||
        !boundedText(value.target, bounds.aggregateRender) ||
        !boundedText(value.effect, MAX_LABEL_LENGTH) ||
        !boundedText(value.parameterSummary, bounds.aggregateRender) ||
        !boundedText(value.gerund, MAX_LABEL_LENGTH) ||
        !Array.isArray(value.targetItems) || value.targetItems.length === 0 ||
        !Array.isArray(value.materialItems) || value.materialItems.length === 0 ||
        !Array.isArray(value.renderedFields)) {
      return null;
    }
    var rendered = new Set();
    function normalizeRows(rows) {
      var output = [];
      for (var index = 0; index < rows.length; index += 1) {
        var row = rows[index];
        if (!hasExactKeys(row, ['field', 'label', 'value']) || !identifier(row.field) ||
            !boundedText(row.label, MAX_LABEL_LENGTH) || !boundedText(row.value, MAX_TEXT_LENGTH)) {
          return null;
        }
        rendered.add(row.field);
        output.push({ field: row.field, label: row.label, value: row.value });
      }
      return output;
    }
    var targets = normalizeRows(value.targetItems);
    var materials = normalizeRows(value.materialItems);
    if (!targets || !materials) { return null; }
    var targetText = targets.map(function(row) { return row.label + ': ' + row.value; }).join('; ');
    var materialText = materials.map(function(row) { return row.label + ': ' + row.value; }).join('; ') + '.';
    if (targetText !== value.target || materialText !== value.parameterSummary) { return null; }
    var derivedFields = Array.from(rendered).sort();
    var reportedFields = exactStringArray(value.renderedFields);
    if (!reportedFields) { return null; }
    reportedFields.sort();
    if (reportedFields.length !== derivedFields.length || reportedFields.some(function(field, index) {
      return field !== derivedFields[index];
    })) {
      return null;
    }
    var total = value.target.length + value.effect.length +
      value.parameterSummary.length + value.gerund.length;
    if (total > bounds.aggregateRender) { return null; }
    return { targets: targets, materials: materials, renderedFields: derivedFields };
  }

  function assessmentFailure(reason) {
    return { ok: false, reason: reason };
  }

  async function buildAssessment(request, caller, dependencies) {
    var current;
    var projection;
    var full;
    try {
      current = normalizeAuthority(dependencies.getCurrentAuthority());
      projection = dependencies.getCurrentProjection();
      full = dependencies.getCurrentCapabilityAuthority(request.slug);
    } catch (_error) {
      return assessmentFailure('authority-unavailable');
    }
    if (!current || !requestMatchesAuthority(request, caller, current)) {
      return assessmentFailure('authority-stale');
    }
    if (!projectionMatchesAuthority(projection, current)) {
      return assessmentFailure('projection-unavailable');
    }
    var row = findProjectedCapability(projection, request.slug);
    if (!row) { return assessmentFailure('capability-unavailable'); }
    if (!projectedRowReady(row, current)) {
      return assessmentFailure(row.sideEffectClass === 'read'
        ? 'capability-not-consequential'
        : 'capability-not-ready');
    }
    if (!fullCapabilityMatchesProjection(full, row, projection) ||
        !canonicalEqual(dependencies.actionAuthority, full.argumentContract, row.argumentContract)) {
      return assessmentFailure('capability-authority-mismatch');
    }

    var acceptedFields = exactStringArray(full.acceptedConsequenceFields);
    var excludedFields = exactStringArray(full.excludedConsequenceFields);
    if (!acceptedFields || !excludedFields) {
      return assessmentFailure('consequence-contract-mismatch');
    }
    acceptedFields.sort();
    excludedFields.sort();

    var resolved;
    try {
      resolved = dependencies.resolveCapability(
        request.slug,
        full.executionAuthority.executionOrigin
      );
    } catch (_resolveError) {
      resolved = null;
    }
    if (!resolved || !isPlainObject(resolved.descriptor) ||
        resolved.descriptor.slug !== request.slug ||
        resolved.descriptor.service !== full.service ||
        resolvedClass(resolved) !== full.sideEffectClass ||
        resolvedOrigin(resolved) !== full.executionAuthority.executionOrigin) {
      return assessmentFailure('classification-mismatch');
    }

    var installedAuthority = await normalizeInstalledAuthority(
      resolved,
      dependencies.actionAuthority,
      dependencies.router
    );
    if (!installedAuthority || !dependencies.actionAuthority.authorityMatches(
      full.executionAuthority,
      installedAuthority
    )) {
      return assessmentFailure('classification-mismatch');
    }
    var sourceArgumentContract = dependencies.actionAuthority.analyzeArgumentSchema(
      resolved,
      installedAuthority
    );
    var compiled = dependencies.actionAuthority.compileConsequenceContract(
      request.slug,
      dependencies.consequenceTargets.getContract(request.slug),
      installedAuthority,
      sourceArgumentContract
    );
    if (!compiled || compiled.compatible !== true ||
        !canonicalEqual(dependencies.actionAuthority, compiled, full.consequenceContract) ||
        !canonicalEqual(
          dependencies.actionAuthority,
          compiled.effectiveArgumentContract,
          full.argumentContract
        ) ||
        !canonicalEqual(
          dependencies.actionAuthority,
          compiled.acceptedConsequenceFields,
          acceptedFields
        ) ||
        !canonicalEqual(
          dependencies.actionAuthority,
          compiled.excludedConsequenceFields,
          excludedFields
        )) {
      return assessmentFailure('consequence-contract-mismatch');
    }
    var consequenceDigest = await dependencies.actionAuthority.schemaDigest(compiled);
    if (!consequenceDigest || consequenceDigest !== full.consequenceDigest ||
        consequenceDigest !== row.consequenceDigest) {
      return assessmentFailure('consequence-digest-mismatch');
    }
    if (dependencies.actionAuthority.validateCollectedArguments(
      compiled.effectiveArgumentContract,
      request.args
    ) !== true || dependencies.router.validateResolvedArgs(resolved, request.args) !== true) {
      return assessmentFailure('args-invalid');
    }

    var materialized;
    try {
      materialized = dependencies.materializeConsequence(compiled, request.args);
    } catch (_materializeError) {
      materialized = null;
    }
    var rows = materializedRows(materialized, dependencies.actionAuthority.CONSEQUENCE_BOUNDS);
    if (!rows || materialized.effect !== compiled.effectLabel ||
        materialized.gerund !== compiled.progressLabel) {
      return assessmentFailure('material-unrepresentable');
    }
    var suppliedFields = ownDataKeys(request.args);
    if (!suppliedFields) { return assessmentFailure('args-invalid'); }
    suppliedFields.sort();
    if (suppliedFields.length !== rows.renderedFields.length || suppliedFields.some(function(field, index) {
      return field !== rows.renderedFields[index];
    })) {
      return assessmentFailure('rendered-fields-mismatch');
    }

    var materialParameters = rows.materials.map(function(item) {
      return { label: item.label, value: item.value };
    });
    var confirmation = deepFreeze({
      actionSlug: row.slug,
      actionLabel: row.actionLabel,
      target: materialized.target,
      effect: compiled.effectLabel,
      parameterSummary: materialized.parameterSummary,
      gerund: compiled.progressLabel
    });
    var canonical = {
      tuple: {
        tabId: current.tabId,
        generation: current.generation,
        exactOrigin: current.exactOrigin,
        profileId: projection.profileId,
        profileVersion: current.profileVersion,
        catalogVersion: projection.catalogVersion,
        contextEpoch: current.contextEpoch,
        semanticEntity: current.semanticEntity
      },
      slug: request.slug,
      args: request.args,
      schemaDigest: installedAuthority.schemaDigest,
      consequenceDigest: consequenceDigest,
      acceptedFields: acceptedFields,
      excludedFields: excludedFields,
      suppliedFields: suppliedFields,
      renderedFields: rows.renderedFields,
      target: confirmation.target,
      effect: confirmation.effect,
      materialParameters: materialParameters,
      progressLabel: confirmation.gerund,
      sideEffectClass: installedAuthority.sideEffectClass,
      executionOrigin: installedAuthority.executionOrigin
    };
    var signature = dependencies.actionAuthority.canonicalSchemaJson(canonical);
    if (signature === null) { return assessmentFailure('authority-unavailable'); }
    return {
      ok: true,
      authority: current,
      installedExecutionOrigin: installedAuthority.executionOrigin,
      args: request.args,
      signature: signature,
      sideEffectClass: installedAuthority.sideEffectClass,
      risk: RISK_COPY[installedAuthority.sideEffectClass],
      materialParameters: deepFreeze(materialParameters),
      confirmation: confirmation
    };
  }

  function mintActionToken() {
    var cryptoObject = global.crypto;
    if (!cryptoObject || typeof cryptoObject.getRandomValues !== 'function') { return null; }
    try {
      var bytes = new Uint8Array(32);
      cryptoObject.getRandomValues(bytes);
      var encoded = '';
      for (var index = 0; index < bytes.length; index += 1) {
        encoded += bytes[index].toString(16).padStart(2, '0');
      }
      return 'sg1_' + encoded;
    } catch (_error) {
      return null;
    }
  }

  function tokenEquals(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) {
      return false;
    }
    var difference = 0;
    for (var index = 0; index < left.length; index += 1) {
      difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return difference === 0;
  }

  function gateFailure(status, reason) {
    return deepFreeze({ status: status, reason: reason });
  }

  function typedManagerFailure(code) {
    return deepFreeze({ success: false, code: code, errorCode: code, error: code });
  }

  function dependency(globalName, path) {
    if (global && global[globalName]) { return global[globalName]; }
    if (typeof require === 'function') {
      try { return require(path); } catch (_error) { return null; }
    }
    return null;
  }

  function createGateManager(options) {
    var actionAuthority = options && (options.actionAuthority ||
      dependency('FsbSkopeoActionAuthority', './skopeo-action-authority.js'));
    var consequenceTargets = options && (options.consequenceTargets ||
      dependency('FsbSkopeoConsequenceTargets', '../catalog/skopeo-consequence-targets.js'));
    var defaultResolver = function(slug, origin) {
      var catalog = global && global.FsbCapabilityCatalog;
      return catalog && typeof catalog.resolve === 'function' ? catalog.resolve(slug, origin) : null;
    };
    if (!isPlainObject(options) || typeof options.getCurrentAuthority !== 'function' ||
        typeof options.getCurrentProjection !== 'function' ||
        typeof options.getCurrentCapabilityAuthority !== 'function' || !options.router ||
        typeof options.router.invoke !== 'function' ||
        typeof options.router.validateResolvedArgs !== 'function' ||
        typeof options.router.getResolvedParamsSchema !== 'function' ||
        !actionAuthority || typeof actionAuthority.normalizeResolvedAuthority !== 'function' ||
        typeof actionAuthority.authorityMatches !== 'function' ||
        typeof actionAuthority.analyzeArgumentSchema !== 'function' ||
        typeof actionAuthority.validateCollectedArguments !== 'function' ||
        typeof actionAuthority.compileConsequenceContract !== 'function' ||
        typeof actionAuthority.materializeConsequence !== 'function' ||
        !validConsequenceBounds(actionAuthority.CONSEQUENCE_BOUNDS) ||
        typeof actionAuthority.schemaDigest !== 'function' || !consequenceTargets ||
        typeof consequenceTargets.getContract !== 'function') {
      throw new TypeError('consequence gate manager collaborators are required');
    }

    var dependencies = {
      getCurrentAuthority: options.getCurrentAuthority,
      getCurrentProjection: options.getCurrentProjection,
      getCurrentCapabilityAuthority: options.getCurrentCapabilityAuthority,
      resolveCapability: typeof options.resolveCapability === 'function'
        ? options.resolveCapability
        : defaultResolver,
      router: options.router,
      actionAuthority: actionAuthority,
      consequenceTargets: consequenceTargets,
      materializeConsequence: typeof options.materializeConsequence === 'function'
        ? options.materializeConsequence
        : actionAuthority.materializeConsequence
    };
    var lifecycleEpoch = 0;
    var state = { status: STATUS.IDLE, reason: null, actionToken: null };
    var binding = null;
    var pendingAttempt = null;
    var lastToken = null;

    function snapshot() {
      return deepFreeze({
        status: state.status,
        reason: state.reason,
        actionToken: state.status === STATUS.OPEN ? state.actionToken : null
      });
    }

    function setTerminal(status, reason) {
      lifecycleEpoch += 1;
      state = { status: status, reason: reason, actionToken: null };
      binding = null;
      pendingAttempt = null;
      return gateFailure(status, reason);
    }

    async function open(request, caller) {
      lifecycleEpoch += 1;
      var openEpoch = lifecycleEpoch;
      state = { status: STATUS.IDLE, reason: null, actionToken: null };
      binding = null;
      pendingAttempt = null;
      if (!validateOpenRequest(request) || !validCaller(caller)) {
        state.reason = 'open-request-invalid';
        return gateFailure(STATUS.IDLE, state.reason);
      }
      var normalizedRequest = copyRequest(request);
      if (!normalizedRequest) {
        state.reason = 'open-request-invalid';
        return gateFailure(STATUS.IDLE, state.reason);
      }
      var assessed = await buildAssessment(normalizedRequest, caller, dependencies);
      if (lifecycleEpoch !== openEpoch || state.status !== STATUS.IDLE) {
        return gateFailure(STATUS.STALE, 'open-superseded');
      }
      if (!assessed.ok) {
        state.reason = assessed.reason;
        return gateFailure(STATUS.IDLE, assessed.reason);
      }
      var token = mintActionToken();
      var issuedAt = Date.now();
      if (!token || token === lastToken || !Number.isFinite(issuedAt)) {
        state.reason = 'token-unavailable';
        return gateFailure(STATUS.IDLE, state.reason);
      }
      lastToken = token;
      binding = {
        epoch: openEpoch,
        callerTabId: caller.tabId,
        request: normalizedRequest,
        token: token,
        issuedAt: issuedAt,
        expiresAt: issuedAt + TOKEN_TTL_MS,
        signature: assessed.signature
      };
      state = { status: STATUS.OPEN, reason: null, actionToken: token };
      return deepFreeze({
        status: STATUS.OPEN,
        actionToken: token,
        sideEffectClass: assessed.sideEffectClass,
        risk: assessed.risk,
        materialParameters: assessed.materialParameters,
        confirmation: assessed.confirmation
      });
    }

    function requestMatchesAttempt(request, caller, attempt) {
      return caller.tabId === attempt.callerTabId &&
        request.generation === attempt.request.generation &&
        request.exactOrigin === attempt.request.exactOrigin &&
        request.profileVersion === attempt.request.profileVersion &&
        request.contextEpoch === attempt.request.contextEpoch &&
        request.slug === attempt.request.slug &&
        sameEntity(request.semanticEntity, attempt.request.semanticEntity) &&
        canonicalEqual(actionAuthority, request.args, attempt.request.args) &&
        tokenEquals(request.actionToken, attempt.token);
    }

    async function confirm(request, caller) {
      if (state.status !== STATUS.OPEN || !binding) {
        return gateFailure(STATUS.STALE, 'confirmation-not-open');
      }
      if (!validateConfirmRequest(request) || !validCaller(caller)) {
        return setTerminal(STATUS.STALE, 'confirm-request-invalid');
      }
      var activeBinding = binding;
      if (!requestMatchesAttempt(request, caller, activeBinding)) {
        return setTerminal(STATUS.STALE, 'authority-stale');
      }
      var confirmationTime = Date.now();
      if (!Number.isFinite(confirmationTime) || confirmationTime < activeBinding.issuedAt ||
          confirmationTime >= activeBinding.expiresAt) {
        return setTerminal(STATUS.STALE, 'token-expired');
      }

      state = { status: STATUS.PENDING, reason: null, actionToken: null };
      binding = null;
      pendingAttempt = activeBinding;

      var assessed = await buildAssessment(
        activeBinding.request,
        { tabId: activeBinding.callerTabId },
        dependencies
      );
      if (state.status !== STATUS.PENDING || pendingAttempt !== activeBinding ||
          lifecycleEpoch !== activeBinding.epoch) {
        return gateFailure(STATUS.STALE, 'late-result');
      }
      if (!assessed.ok || assessed.signature !== activeBinding.signature) {
        return setTerminal(STATUS.STALE, 'authority-stale');
      }

      var result;
      try {
        result = await dependencies.router.invoke(activeBinding.request.slug, assessed.args, {
          origin: assessed.installedExecutionOrigin,
          tabId: assessed.authority.tabId,
          source: 'skopeo'
        });
      } catch (_error) {
        result = typedManagerFailure('SKOPEO_ROUTER_ERROR');
      }
      if (state.status !== STATUS.PENDING || pendingAttempt !== activeBinding ||
          lifecycleEpoch !== activeBinding.epoch) {
        return gateFailure(STATUS.STALE, 'late-result');
      }
      var after = await buildAssessment(
        activeBinding.request,
        { tabId: activeBinding.callerTabId },
        dependencies
      );
      if (state.status !== STATUS.PENDING || pendingAttempt !== activeBinding ||
          lifecycleEpoch !== activeBinding.epoch || !after.ok ||
          after.signature !== activeBinding.signature) {
        return setTerminal(STATUS.STALE, 'late-result');
      }
      if (!isPlainObject(result) || typeof result.success !== 'boolean') {
        result = typedManagerFailure('SKOPEO_ROUTER_RESULT_INVALID');
      }
      state = { status: STATUS.COMPLETE, reason: null, actionToken: null };
      pendingAttempt = null;
      lifecycleEpoch += 1;
      return result;
    }

    function cancel(request, caller) {
      var attempt = binding || pendingAttempt;
      if (!attempt || (state.status !== STATUS.OPEN && state.status !== STATUS.PENDING)) {
        return gateFailure(STATUS.CANCELLED, 'cancelled');
      }
      if (!validateConfirmRequest(request) || !validCaller(caller) ||
          !requestMatchesAttempt(request, caller, attempt)) {
        return gateFailure(state.status, 'cancel-request-invalid');
      }
      return setTerminal(STATUS.CANCELLED, 'cancelled');
    }

    function invalidate(reason) {
      var boundedReason = ['kill', 'replacement', 'authority-stale', 'cancelled'].includes(reason)
        ? reason
        : 'invalidated';
      var status = boundedReason === 'authority-stale' ? STATUS.STALE : STATUS.CANCELLED;
      return setTerminal(status, boundedReason);
    }

    return deepFreeze({
      open: open,
      confirm: confirm,
      cancel: cancel,
      invalidate: invalidate,
      getState: snapshot
    });
  }

  var exportsObject = deepFreeze({
    STATUS: STATUS,
    createGateManager: createGateManager,
    validateOpenRequest: validateOpenRequest,
    validateConfirmRequest: validateConfirmRequest
  });

  global.FsbSkopeoConsequenceGate = exportsObject;
  if (typeof module !== 'undefined' && module.exports) { module.exports = exportsObject; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
