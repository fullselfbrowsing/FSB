#!/usr/bin/env node

'use strict';

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInThisContext } from 'node:vm';

import { buildInstalledResolver } from './report-t1-readiness.mjs';
import { buildTerminalStateReport } from './report-t1-terminal-states.mjs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const OUTPUT_PATH = join(ROOT, 'extension', 'catalog', 'skopeo-profile-index.generated.js');
if (!globalThis.CfworkerJsonSchema) {
  runInThisContext(readFileSync(
    join(ROOT, 'extension', 'lib', 'cfworker-json-schema.min.js'),
    'utf8'
  ));
}
const PROFILE_SCHEMA = require(join(ROOT, 'extension', 'utils', 'skopeo-profile-schema.js'));
const ACTION_AUTHORITY = require(join(ROOT, 'extension', 'utils', 'skopeo-action-authority.js'));
const CAPABILITY_ROUTER = require(join(ROOT, 'extension', 'utils', 'capability-router.js'));
const CONSEQUENCE_TARGETS = require(join(ROOT, 'extension', 'catalog', 'skopeo-consequence-targets.js'));

const BASELINES = Object.freeze({
  descriptors: 2314,
  stems: 128,
  services: 129,
  pairs: 130,
  admittedOrigins: 166,
  sourceReady: 1285,
  comparable: 1279,
  sourceReadyWithRequiredArguments: 749,
  sourceReadyReadsWithRequiredArguments: 744,
  sourceReadyWritesWithRequiredArguments: 5,
});
const SIDE_EFFECTS = Object.freeze({
  read: 'read-only',
  write: 'changes-service-data',
  destructive: 'removes-service-data',
});
const TERMINAL_PRECEDENCE = Object.freeze([
  'guarded-fail-closed',
  'blocked',
  'bridge-needed',
  'uat-needed',
]);

function isObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stemFor(descriptor) {
  return String(descriptor.slug || '').split('.')[0];
}

function pairKey(appStem, service) {
  return appStem + '\u0000' + service;
}

function profileKey(appStem, service) {
  return appStem + '@' + service;
}

function exactServiceOrigin(service) {
  try {
    const parsed = new URL('https://' + String(service || ''));
    return parsed.protocol === 'https:' && parsed.hostname === service && parsed.port === '' &&
      parsed.pathname === '/' && parsed.origin === 'https://' + service
      ? parsed.origin
      : null;
  } catch (_error) {
    return null;
  }
}

function exactHttpsOrigin(value) {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '' &&
      parsed.port === '' && parsed.origin === value && parsed.pathname === '/' &&
      parsed.search === '' && parsed.hash === '';
  } catch (_error) {
    return false;
  }
}

function presentationDisposition(row) {
  if (!isObject(row)) return 'unsupported';
  if (TERMINAL_PRECEDENCE.includes(row.surfaceStatus)) return row.surfaceStatus;
  if (row.readiness === 'learn-pending') return 'learn-pending';
  if (row.readiness === 'discovery-pending' && row.surfaceStatus === 'degraded-discovery-pending') {
    return 'degraded';
  }
  if (row.readiness === 'discovery-pending') return 'discovery-pending';
  if (row.readiness === 't1-ready' && row.surfaceStatus === 't1-ready' &&
      row.executionEnabled === true) {
    return 't1-ready';
  }
  return 'unsupported';
}

function installedSideEffectClass(resolved) {
  const handlerClass = resolved && resolved.handler && resolved.handler.sideEffectClass;
  const descriptorClass = resolved && resolved.descriptor && resolved.descriptor.sideEffectClass;
  if (handlerClass && descriptorClass && handlerClass !== descriptorClass) return null;
  const sideEffectClass = handlerClass || descriptorClass;
  return Object.prototype.hasOwnProperty.call(SIDE_EFFECTS, sideEffectClass)
    ? sideEffectClass
    : null;
}

function installedOrigin(resolved) {
  if (!resolved || typeof resolved.origin !== 'string') return null;
  try {
    const parsed = new URL(resolved.origin);
    if (!exactHttpsOrigin(parsed.origin)) return null;
    const handlerOrigin = resolved.handler && resolved.handler.origin;
    if (handlerOrigin !== undefined && handlerOrigin !== null &&
        new URL(String(handlerOrigin)).origin !== parsed.origin) {
      return null;
    }
    return parsed.origin;
  } catch (_error) {
    return null;
  }
}

function expectedAuthority(resolved) {
  if (!resolved || resolved.tier !== 'T1a' || !resolved.handler ||
      typeof resolved.handler.handle !== 'function') {
    return null;
  }
  const executionOrigin = installedOrigin(resolved);
  const sideEffectClass = installedSideEffectClass(resolved);
  const schema = CAPABILITY_ROUTER.getResolvedParamsSchema(resolved);
  const canonical = ACTION_AUTHORITY.canonicalSchemaJson(schema);
  if (!executionOrigin || !sideEffectClass || canonical === null) return null;
  return {
    tier: 'T1a',
    executionOrigin,
    sideEffectClass,
    paramSchema: JSON.parse(canonical),
    schemaDigest: 'sha256:' + createHash('sha256').update(canonical).digest('hex'),
  };
}

function boundedParamSummary(schema) {
  const properties = schema && isObject(schema.properties) ? schema.properties : {};
  const names = Object.keys(properties).sort();
  const requiredSet = new Set(Array.isArray(schema && schema.required) ? schema.required : []);
  const allRequired = names.filter(function(name) { return requiredSet.has(name); });
  const allOptional = names.filter(function(name) { return !requiredSet.has(name); });
  const required = allRequired.slice(0, 12);
  const optional = allOptional.slice(0, Math.max(0, 12 - required.length));
  return {
    count: names.length,
    required,
    optional,
    truncated: required.length + optional.length < names.length,
  };
}

function representativeSubmission(contract) {
  const raw = {};
  for (const field of contract.fields) {
    if (!field.required) continue;
    if (field.kind === 'choice') {
      raw[field.name] = field.choices[0];
    } else if (field.kind === 'boolean') {
      raw[field.name] = true;
    } else if (field.kind === 'string') {
      raw[field.name] = 'x'.repeat(Math.max(1, field.minLength || 0));
    } else {
      let value = 0;
      if (field.minimum !== null) value = field.minimum;
      if (field.maximum !== null && value > field.maximum) value = field.maximum;
      raw[field.name] = String(value);
    }
  }
  return raw;
}

function representativeAllSubmission(contract) {
  const raw = {};
  for (const field of contract.fields) {
    if (field.kind === 'choice') {
      raw[field.name] = field.choices[0];
    } else if (field.kind === 'boolean') {
      raw[field.name] = true;
    } else if (field.kind === 'string') {
      raw[field.name] = field.name + '-reviewed-value';
    } else {
      let value = field.minimum === null ? 1 : field.minimum;
      if (field.maximum !== null && value > field.maximum) value = field.maximum;
      raw[field.name] = String(value);
    }
  }
  return raw;
}

function expectedActionability(
  sourceDisposition,
  sideEffectClass,
  authority,
  argumentContract,
  consequence
) {
  if (sourceDisposition !== 't1-ready') {
    return {
      presentationDisposition: sourceDisposition,
      actionabilityReason: 'source-not-ready',
      executable: false,
    };
  }
  if (!authority || argumentContract.mode === 'unsupported') {
    return {
      presentationDisposition: 'unsupported',
      actionabilityReason: argumentContract.reason || 'argument-contract-unsupported',
      executable: false,
    };
  }
  if (sideEffectClass !== 'read' && !(consequence && consequence.compatible && consequence.digest)) {
    return {
      presentationDisposition: 'unsupported',
      actionabilityReason: consequence ? consequence.reason : 'consequence-contract-missing',
      executable: false,
    };
  }
  return {
    presentationDisposition: 't1-ready',
    actionabilityReason: null,
    executable: argumentContract.mode === 'empty' || argumentContract.mode === 'form',
  };
}

function corpusSets(descriptors) {
  const slugs = new Set();
  const stems = new Set();
  const services = new Set();
  const pairs = new Map();
  const stemsByService = new Map();
  const slugsByStem = new Map();
  for (const descriptor of descriptors) {
    const appStem = stemFor(descriptor);
    const key = pairKey(appStem, descriptor.service);
    slugs.add(descriptor.slug);
    stems.add(appStem);
    services.add(descriptor.service);
    if (!pairs.has(key)) pairs.set(key, { appStem, service: descriptor.service, descriptors: [] });
    pairs.get(key).descriptors.push(descriptor);
    if (!stemsByService.has(descriptor.service)) stemsByService.set(descriptor.service, new Set());
    stemsByService.get(descriptor.service).add(appStem);
    if (!slugsByStem.has(appStem)) slugsByStem.set(appStem, []);
    slugsByStem.get(appStem).push(descriptor.slug);
  }
  return { slugs, stems, services, pairs, stemsByService, slugsByStem };
}

function countKeys(rows, keyFor) {
  const counts = new Map();
  for (const row of rows.filter(isObject)) {
    const key = keyFor(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function checkExactlyOnce(rows, expectedKeys, keyFor, noun, failures) {
  const counts = countKeys(rows, keyFor);
  for (const key of expectedKeys) {
    const count = counts.get(key) || 0;
    if (count === 0) failures.push('missing ' + noun + ' mapping');
    if (count > 1) failures.push('duplicate ' + noun + ' mapping');
  }
  for (const key of counts.keys()) {
    if (!expectedKeys.has(key)) failures.push('stale ' + noun + ' mapping');
  }
}

function isOrdered(rows, keyFor) {
  const keys = rows.map(keyFor);
  const sorted = keys.slice().sort(compareText);
  return keys.every(function(key, index) { return key === sorted[index]; });
}

function buildExpectedAdmissions(sets, authorityBySlug, failures) {
  const pairOrigins = new Map(Array.from(sets.pairs.keys(), function(key) {
    return [key, new Set()];
  }));
  const candidates = new Map();

  function addCandidate(origin, pair) {
    if (!candidates.has(origin)) candidates.set(origin, []);
    const owners = candidates.get(origin);
    const key = pairKey(pair.appStem, pair.service);
    if (!owners.some(function(owner) { return pairKey(owner.appStem, owner.service) === key; })) {
      owners.push(pair);
    }
  }

  for (const pair of sets.pairs.values()) {
    if (sets.stemsByService.get(pair.service).size > 1) continue;
    addCandidate(exactServiceOrigin(pair.service), pair);
    for (const descriptor of pair.descriptors) {
      const authority = authorityBySlug.get(descriptor.slug);
      if (authority) addCandidate(authority.executionOrigin, pair);
    }
  }

  for (const [origin, owners] of candidates.entries()) {
    if (owners.length === 1) {
      pairOrigins.get(pairKey(owners[0].appStem, owners[0].service)).add(origin);
      continue;
    }
    const stems = new Set(owners.map(function(owner) { return owner.appStem; }));
    const canonical = owners.filter(function(owner) {
      return exactServiceOrigin(owner.service) === origin;
    });
    if (stems.size === 1 && canonical.length === 1) {
      pairOrigins.get(pairKey(canonical[0].appStem, canonical[0].service)).add(origin);
    } else {
      failures.push('installed origin resolution is ambiguous');
    }
  }

  const originRows = new Map();
  for (const pair of sets.pairs.values()) {
    const key = pairKey(pair.appStem, pair.service);
    for (const origin of pairOrigins.get(key)) {
      originRows.set(origin, {
        admittedOrigin: origin,
        service: pair.service,
        profileKeys: [profileKey(pair.appStem, pair.service)],
        profileDisposition: null,
      });
    }
  }
  for (const [service, appStems] of sets.stemsByService.entries()) {
    if (appStems.size <= 1) continue;
    const origin = exactServiceOrigin(service);
    originRows.set(origin, {
      admittedOrigin: origin,
      service,
      profileKeys: Array.from(appStems).sort().map(function(appStem) {
        return profileKey(appStem, service);
      }),
      profileDisposition: 'ambiguous-stem',
    });
  }
  return { pairOrigins, originRows };
}

function expectedCatalogVersion(descriptors, authorityBySlug, consequenceBySlug, profileVersion) {
  const sorted = descriptors.slice().sort(function(left, right) {
    return compareText(left.slug, right.slug);
  });
  const payload = {
    schemaVersion: PROFILE_SCHEMA.SCHEMA_VERSION,
    profileVersion,
    descriptors: sorted,
    authorities: sorted.map(function(descriptor) {
      return {
        slug: descriptor.slug,
        executionAuthority: authorityBySlug.get(descriptor.slug) || null,
        consequenceAuthority: consequenceBySlug.get(descriptor.slug) || null,
      };
    }),
  };
  const canonical = ACTION_AUTHORITY.canonicalSchemaJson(payload);
  return canonical === null ? null : 'sha256:' + createHash('sha256').update(canonical).digest('hex');
}

function renderIndex(index) {
  const data = JSON.stringify(index, null, 2);
  return [
    '// GENERATED by scripts/generate-skopeo-profile-index.mjs -- DO NOT EDIT BY HAND.',
    '// Deterministic, data-only Skopeo profile/readiness index.',
    '(function(global) {',
    "  'use strict';",
    '  var DATA = ' + data + ';',
    '  function deepFreeze(value) {',
    "    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;",
    '    Reflect.ownKeys(value).forEach(function(key) { deepFreeze(value[key]); });',
    '    return Object.freeze(value);',
    '  }',
    '  DATA = deepFreeze(DATA);',
    '  global.FsbSkopeoProfileIndex = DATA;',
    "  if (typeof module !== 'undefined' && module.exports) { module.exports = DATA; }",
    "})(typeof globalThis !== 'undefined' ? globalThis : this);",
    '',
  ].join('\n');
}

export function verifySkopeoProfileCoverage(options = {}) {
  const descriptors = Array.isArray(options.descriptors) ? options.descriptors : [];
  const terminalReport = options.terminalReport;
  const authoredRegistry = options.authoredRegistry;
  const index = options.index;
  const failures = [];
  const sets = corpusSets(descriptors);
  const stats = {
    descriptors: sets.slugs.size,
    stems: sets.stems.size,
    services: sets.services.size,
    pairs: sets.pairs.size,
    admittedOrigins: 0,
    sourceReady: 0,
    comparable: 0,
    sourceReadyWithRequiredArguments: 0,
    sourceReadyReadsWithRequiredArguments: 0,
    sourceReadyWritesWithRequiredArguments: 0,
    sourceReadyWrites: 0,
    compatibleWrites: 0,
    incompatibleVisuallyReadyWrites: 0,
    acceptedButUnregisteredWriteFields: 0,
    unregisteredConsequentialControls: 0,
    notionOptionalConsequenceFields: [],
    actionableReady: 0,
    staticReady: 0,
    unjustifiedReady: 0,
    tierMismatches: 0,
    executionOriginMismatches: 0,
    sideEffectClassMismatches: 0,
    schemaDigestMismatches: 0,
    originCollisions: 0,
  };

  for (const key of ['descriptors', 'stems', 'services', 'pairs']) {
    if (stats[key] !== BASELINES[key]) {
      failures.push(key + ' baseline drift: expected ' + BASELINES[key] + ', received ' + stats[key]);
    }
  }
  if (!isObject(index) || !isObject(index.counts) || !Array.isArray(index.admittedOriginIndex) ||
      !Array.isArray(index.serviceProfiles) || !Array.isArray(index.profiles) ||
      !Array.isArray(index.capabilities) || !isObject(terminalReport) ||
      !Array.isArray(terminalReport.rows)) {
    failures.push('generated index shape is invalid');
    return { ok: false, failures, stats };
  }

  const registryValidation = PROFILE_SCHEMA.validateRegistry(authoredRegistry);
  if (!registryValidation.ok) failures.push('authored profile registry is invalid');
  if (index.schemaVersion !== PROFILE_SCHEMA.SCHEMA_VERSION) failures.push('generated schema version is unsupported');
  if (index.profileVersion !== authoredRegistry.profileVersion) failures.push('generated profile version is stale');
  if (JSON.stringify(index.counts) !== JSON.stringify({
    descriptors: stats.descriptors,
    stems: stats.stems,
    services: stats.services,
    pairs: stats.pairs,
  })) {
    failures.push('generated count summary does not match derived sets');
  }

  const canonicalCatalog = options.catalog && isObject(options.catalog)
    ? options.catalog
    : require(join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js'));
  const resolveInstalled = buildInstalledResolver(canonicalCatalog);
  const authorityBySlug = new Map();
  const resolvedBySlug = new Map();
  const argumentContractBySlug = new Map();
  const consequenceBySlug = new Map();
  for (const descriptor of descriptors) {
    let resolved = null;
    try {
      resolved = resolveInstalled
        ? resolveInstalled(descriptor.slug, exactServiceOrigin(descriptor.service))
        : null;
    } catch (_error) {
      resolved = null;
    }
    const authority = expectedAuthority(resolved);
    resolvedBySlug.set(descriptor.slug, resolved);
    authorityBySlug.set(descriptor.slug, authority);
    const argumentContract = ACTION_AUTHORITY.analyzeArgumentSchema(resolved, authority);
    argumentContractBySlug.set(descriptor.slug, argumentContract);
    if (descriptor.sideEffectClass === 'write' || descriptor.sideEffectClass === 'destructive') {
      const compiled = ACTION_AUTHORITY.compileConsequenceContract(
        descriptor.slug,
        CONSEQUENCE_TARGETS.getContract(descriptor.slug),
        authority,
        argumentContract
      );
      const canonical = compiled.compatible
        ? ACTION_AUTHORITY.canonicalSchemaJson(compiled)
        : null;
      consequenceBySlug.set(descriptor.slug, {
        contract: compiled.compatible ? compiled : null,
        digest: canonical === null
          ? null
          : 'sha256:' + createHash('sha256').update(canonical).digest('hex'),
        compatible: compiled.compatible,
        reason: compiled.reason,
        acceptedFields: compiled.compatible ? compiled.acceptedConsequenceFields : [],
        excludedFields: compiled.compatible ? compiled.excludedConsequenceFields : [],
      });
    }
  }

  const expectedVersion = expectedCatalogVersion(
    descriptors,
    authorityBySlug,
    consequenceBySlug,
    authoredRegistry.profileVersion
  );
  if (!expectedVersion || index.catalogVersion !== expectedVersion) {
    failures.push('generated catalog version is stale');
  }

  const admissions = buildExpectedAdmissions(sets, authorityBySlug, failures);
  stats.admittedOrigins = admissions.originRows.size;
  if (stats.admittedOrigins !== BASELINES.admittedOrigins) {
    failures.push('admitted origin baseline drift: expected ' + BASELINES.admittedOrigins +
      ', received ' + stats.admittedOrigins);
  }

  checkExactlyOnce(
    index.profiles,
    new Set(sets.pairs.keys()),
    function(row) { return pairKey(row.appStem, row.service); },
    'stem/service profile',
    failures
  );
  checkExactlyOnce(
    index.serviceProfiles,
    sets.services,
    function(row) { return row.service; },
    'service disposition',
    failures
  );
  checkExactlyOnce(
    index.capabilities,
    sets.slugs,
    function(row) { return row.slug; },
    'capability',
    failures
  );
  checkExactlyOnce(
    index.admittedOriginIndex,
    new Set(admissions.originRows.keys()),
    function(row) { return row.admittedOrigin; },
    'admitted origin',
    failures
  );

  const profileByPair = new Map(index.profiles.filter(isObject).map(function(profile) {
    return [pairKey(profile.appStem, profile.service), profile];
  }));
  const profileByKey = new Map(index.profiles.filter(isObject).map(function(profile) {
    return [profile.profileKey, profile];
  }));
  const actualOriginOwners = new Map();
  for (const profile of index.profiles) {
    if (!isObject(profile)) {
      failures.push('profile row is malformed');
      continue;
    }
    const key = pairKey(profile.appStem, profile.service);
    const expectedPair = sets.pairs.get(key);
    const ambiguous = expectedPair && sets.stemsByService.get(profile.service).size > 1;
    if (!expectedPair || profile.profileKey !== profileKey(profile.appStem, profile.service) ||
        profile.serviceOrigin !== exactServiceOrigin(profile.service) ||
        profile.schemaVersion !== PROFILE_SCHEMA.SCHEMA_VERSION ||
        profile.profileVersion !== index.profileVersion || profile.catalogVersion !== index.catalogVersion ||
        !Array.isArray(profile.admittedPageOrigins) || !Array.isArray(profile.capabilitySlugs)) {
      failures.push('profile row identity mismatch');
      continue;
    }
    const expectedSlugs = sets.slugsByStem.get(profile.appStem).slice().sort(compareText);
    if (JSON.stringify(profile.capabilitySlugs) !== JSON.stringify(expectedSlugs)) {
      failures.push('profile capability surface is incomplete');
    }
    const expectedOrigins = Array.from(admissions.pairOrigins.get(key)).sort(compareText);
    if (JSON.stringify(profile.admittedPageOrigins) !== JSON.stringify(expectedOrigins)) {
      failures.push('profile admitted page origins mismatch');
    }
    if (ambiguous) {
      if (profile.profileDisposition !== 'ambiguous-stem' || profile.profileId !== null ||
          profile.adapterId !== null || profile.rendererId !== null ||
          profile.admittedPageOrigins.length !== 0) {
        failures.push('ambiguous profile must fail quiet');
      }
    } else if (typeof profile.profileId !== 'string' ||
        !PROFILE_SCHEMA.GENRES.includes(profile.defaultGenre) ||
        !PROFILE_SCHEMA.ADAPTER_IDS.includes(profile.adapterId) ||
        !PROFILE_SCHEMA.RENDERER_IDS.includes(profile.rendererId)) {
      failures.push('profile row has invalid closed profile data');
    }
    for (const origin of profile.admittedPageOrigins) {
      if (!exactHttpsOrigin(origin)) failures.push('profile admits a non-exact HTTPS origin');
      if (!actualOriginOwners.has(origin)) actualOriginOwners.set(origin, []);
      actualOriginOwners.get(origin).push(profile.profileKey);
    }
  }
  for (const owners of actualOriginOwners.values()) {
    if (owners.length > 1) stats.originCollisions += 1;
  }
  if (stats.originCollisions !== 0) failures.push('origin collision across admitted profiles');

  const actualOriginRows = new Map(index.admittedOriginIndex.filter(isObject).map(function(row) {
    return [row.admittedOrigin, row];
  }));
  for (const [origin, expectedRow] of admissions.originRows.entries()) {
    const actual = actualOriginRows.get(origin);
    if (!actual || !exactHttpsOrigin(actual.admittedOrigin) || actual.service !== expectedRow.service ||
        JSON.stringify(actual.profileKeys) !== JSON.stringify(expectedRow.profileKeys)) {
      failures.push('admitted origin identity mismatch');
      continue;
    }
    const expectedDisposition = expectedRow.profileDisposition ||
      (profileByKey.get(expectedRow.profileKeys[0]) || {}).profileDisposition;
    if (actual.profileDisposition !== expectedDisposition) {
      failures.push('admitted origin disposition mismatch');
    }
  }

  for (const serviceRow of index.serviceProfiles) {
    const expectedStems = Array.from(sets.stemsByService.get(serviceRow.service) || []).sort(compareText);
    if (!isObject(serviceRow) || serviceRow.serviceOrigin !== exactServiceOrigin(serviceRow.service) ||
        JSON.stringify(serviceRow.appStems) !== JSON.stringify(expectedStems) ||
        !Array.isArray(serviceRow.admittedPageOrigins) || !serviceRow.admittedPageOrigins.every(exactHttpsOrigin)) {
      failures.push('service profile identity mismatch');
    }
    if (expectedStems.length > 1 && serviceRow.profileDisposition !== 'ambiguous-stem') {
      failures.push('multi-stem service is missing ambiguity');
    }
  }

  const descriptorBySlug = new Map(descriptors.map(function(descriptor) {
    return [descriptor.slug, descriptor];
  }));
  const terminalBySlug = new Map(terminalReport.rows.map(function(row) { return [row.slug, row]; }));
  const expectedReadyWrites = [
    'notion.create_database',
    'notion.create_database_item',
    'notion.create_page',
    'notion.update_page',
    'slack.chat.postMessage',
  ];
  const registeredWrites = Object.keys(CONSEQUENCE_TARGETS.contracts || {}).sort(compareText);
  if (JSON.stringify(registeredWrites) !== JSON.stringify(expectedReadyWrites.slice().sort(compareText))) {
    failures.push('trusted consequence registry does not exactly match the source Ready write set');
  }
  stats.unregisteredConsequentialControls = expectedReadyWrites.filter(function(slug) {
    return !registeredWrites.includes(slug);
  }).length;
  for (const slug of ['notion.create_page', 'notion.update_page']) {
    const consequence = consequenceBySlug.get(slug);
    if (!consequence || !consequence.compatible) continue;
    const fieldsByName = new Map(consequence.contract.effectiveArgumentContract.fields.map(function(field) {
      return [field.name, field];
    }));
    for (const role of consequence.contract.targetRoles.concat(consequence.contract.materialRoles)) {
      const field = fieldsByName.get(role.field);
      const identity = slug + '.' + role.field;
      if (field && !field.required && !stats.notionOptionalConsequenceFields.includes(identity)) {
        stats.notionOptionalConsequenceFields.push(identity);
      }
    }
  }
  const actualReadyWrites = [];
  for (const capability of index.capabilities) {
    if (!isObject(capability)) {
      failures.push('capability row is malformed');
      continue;
    }
    const descriptor = descriptorBySlug.get(capability.slug);
    const terminal = terminalBySlug.get(capability.slug);
    if (!descriptor || !terminal) continue;
    const appStem = stemFor(descriptor);
    const pairProfile = profileByPair.get(pairKey(appStem, descriptor.service));
    const expected = authorityBySlug.get(capability.slug);
    const resolved = resolvedBySlug.get(capability.slug);
    const sourceArgumentContract = argumentContractBySlug.get(capability.slug);
    const expectedConsequence = consequenceBySlug.get(capability.slug) || null;
    const expectedContract = expectedConsequence && expectedConsequence.compatible
      ? expectedConsequence.contract.effectiveArgumentContract
      : sourceArgumentContract;
    let sourceDisposition = presentationDisposition(terminal);
    if (!pairProfile || pairProfile.profileDisposition === 'ambiguous-stem') {
      sourceDisposition = 'unsupported';
    }
    if (sourceDisposition === 't1-ready') stats.sourceReady += 1;
    if (sourceDisposition === 't1-ready' && expected) stats.comparable += 1;

    let expectedOwner = pairProfile;
    if (expected) {
      const admitted = admissions.originRows.get(expected.executionOrigin);
      if (admitted && admitted.profileKeys.length === 1) {
        const candidate = profileByKey.get(admitted.profileKeys[0]);
        if (candidate && candidate.appStem === appStem) expectedOwner = candidate;
      }
    }
    const expectedClass = expected ? expected.sideEffectClass : descriptor.sideEffectClass;
    const expectedSchema = expected ? expected.paramSchema : descriptor.params;
    const actionability = expectedActionability(
      sourceDisposition,
      expectedClass,
      expected,
      expectedContract,
      expectedConsequence
    );
    if (sourceDisposition === 't1-ready' && expected &&
        Array.isArray(expected.paramSchema.required) && expected.paramSchema.required.length > 0) {
      stats.sourceReadyWithRequiredArguments += 1;
      if (expectedClass === 'read') {
        stats.sourceReadyReadsWithRequiredArguments += 1;
      } else {
        stats.sourceReadyWritesWithRequiredArguments += 1;
      }
    }
    if (sourceDisposition === 't1-ready') {
      if (actionability.presentationDisposition === 't1-ready') {
        stats.actionableReady += 1;
      } else {
        stats.staticReady += 1;
      }
      if (expectedClass !== 'read') {
        actualReadyWrites.push(capability.slug);
        stats.sourceReadyWrites += 1;
        if (expectedConsequence && expectedConsequence.compatible) {
          stats.compatibleWrites += 1;
          const represented = new Set(
            expectedConsequence.contract.targetRoles.concat(expectedConsequence.contract.materialRoles)
              .map(function(role) { return role.field; })
          );
          stats.acceptedButUnregisteredWriteFields += expectedConsequence.acceptedFields.filter(function(field) {
            return !represented.has(field);
          }).length;
        }
        if (capability.presentationDisposition === 't1-ready' &&
            !(expectedConsequence && expectedConsequence.compatible)) {
          stats.incompatibleVisuallyReadyWrites += 1;
        }
      }
    }
    if (!expectedOwner || capability.profileKey !== expectedOwner.profileKey ||
        capability.profileId !== expectedOwner.profileId || capability.appStem !== appStem ||
        capability.service !== descriptor.service ||
        capability.serviceOrigin !== exactServiceOrigin(descriptor.service) ||
        capability.presentationDisposition !== actionability.presentationDisposition ||
        capability.sideEffectClass !== expectedClass || capability.effect !== SIDE_EFFECTS[expectedClass] ||
        JSON.stringify(capability.paramSummary) !== JSON.stringify(boundedParamSummary(expectedSchema)) ||
        JSON.stringify(capability.argumentContract) !== JSON.stringify(expectedContract) ||
        JSON.stringify(capability.consequenceContract) !== JSON.stringify(
          expectedConsequence && expectedConsequence.compatible ? expectedConsequence.contract : null
        ) ||
        capability.consequenceDigest !== (
          expectedConsequence && expectedConsequence.compatible ? expectedConsequence.digest : null
        ) ||
        capability.consequenceCompatible !== !!(
          expectedConsequence && expectedConsequence.compatible && expectedConsequence.digest
        ) ||
        JSON.stringify(capability.acceptedConsequenceFields) !== JSON.stringify(
          expectedConsequence && expectedConsequence.compatible ? expectedConsequence.acceptedFields : []
        ) ||
        JSON.stringify(capability.excludedConsequenceFields) !== JSON.stringify(
          expectedConsequence && expectedConsequence.compatible ? expectedConsequence.excludedFields : []
        ) ||
        capability.actionabilityReason !== actionability.actionabilityReason ||
        capability.sourceReadiness !== (terminal.readiness || null) ||
        capability.sourceTerminalState !== (terminal.terminalState || null) ||
        capability.surfaceStatus !== (terminal.surfaceStatus || null) ||
        capability.executionEnabled !== actionability.executable ||
        capability.invocable !== actionability.executable) {
      failures.push('capability identity, presentation, or actionability mismatch: ' + capability.slug);
    }

    const generatedContractValidation = PROFILE_SCHEMA.validateArgumentContract(
      capability.argumentContract
    );
    if (!generatedContractValidation ||
        !ACTION_AUTHORITY.validateArgumentContract(capability.argumentContract)) {
      failures.push('capability argument contract is invalid');
    }
    if (!PROFILE_SCHEMA.validateActionabilityReason(capability.actionabilityReason)) {
      failures.push('capability actionability reason is invalid');
    }
    if (actionability.presentationDisposition === 't1-ready') {
      let representativeOk = false;
      try {
        const submission = expectedClass === 'read'
          ? representativeSubmission(capability.argumentContract)
          : representativeAllSubmission(capability.argumentContract);
        const parsed = ACTION_AUTHORITY.parseCollectedArguments(
          capability.argumentContract,
          submission
        );
        const isolatedResolved = Object.assign({}, resolved, {
          params: JSON.parse(ACTION_AUTHORITY.canonicalSchemaJson(expected.paramSchema)),
        });
        representativeOk = parsed.ok === true &&
          ACTION_AUTHORITY.validateCollectedArguments(capability.argumentContract, parsed.args) === true &&
          CAPABILITY_ROUTER.validateResolvedArgs(isolatedResolved, parsed.args) === true;
        if (representativeOk && expectedClass !== 'read') {
          const materialized = ACTION_AUTHORITY.materializeConsequence(
            expectedConsequence.contract,
            parsed.args
          );
          representativeOk = !!materialized &&
            JSON.stringify(materialized.renderedFields) === JSON.stringify(Object.keys(parsed.args).sort());
        }
      } catch (_representativeError) {
        representativeOk = false;
      }
      if (!expected ||
          !['empty', 'form'].includes(capability.argumentContract.mode) || !representativeOk) {
        stats.unjustifiedReady += 1;
        failures.push('capability has unjustified Ready actionability');
      }
    }

    const actual = capability.executionAuthority;
    if (!expected) {
      if (actual !== null) failures.push('capability has authority without an installed T1a handler');
      continue;
    }
    if (!isObject(actual)) {
      stats.tierMismatches += 1;
      stats.executionOriginMismatches += 1;
      stats.sideEffectClassMismatches += 1;
      stats.schemaDigestMismatches += 1;
      failures.push('capability is missing installed execution authority');
      continue;
    }
    if (actual.tier !== expected.tier) stats.tierMismatches += 1;
    if (actual.executionOrigin !== expected.executionOrigin) stats.executionOriginMismatches += 1;
    if (actual.sideEffectClass !== expected.sideEffectClass) stats.sideEffectClassMismatches += 1;
    const expectedSchemaJson = ACTION_AUTHORITY.canonicalSchemaJson(expected.paramSchema);
    const actualSchemaJson = ACTION_AUTHORITY.canonicalSchemaJson(actual.paramSchema);
    if (actual.schemaDigest !== expected.schemaDigest || actualSchemaJson !== expectedSchemaJson) {
      stats.schemaDigestMismatches += 1;
    }
    if (!ACTION_AUTHORITY.authorityMatches(expected, actual)) {
      failures.push('capability installed authority mismatch: ' + capability.slug + ' (' +
        expected.schemaDigest + ' != ' + (actual && actual.schemaDigest) + ')');
    }
  }

  for (const key of [
    'sourceReady',
    'comparable',
    'sourceReadyWithRequiredArguments',
    'sourceReadyReadsWithRequiredArguments',
    'sourceReadyWritesWithRequiredArguments',
  ]) {
    if (stats[key] !== BASELINES[key]) {
      failures.push(key + ' baseline drift: expected ' + BASELINES[key] + ', received ' + stats[key]);
    }
  }
  if (stats.actionableReady + stats.staticReady !== BASELINES.sourceReady) {
    failures.push('actionable and static totals do not partition the source Ready corpus');
  }
  if (stats.unjustifiedReady !== 0) {
    failures.push('nonzero unjustified Ready total');
  }
  if (JSON.stringify(actualReadyWrites.sort(compareText)) !==
      JSON.stringify(expectedReadyWrites.slice().sort(compareText))) {
    failures.push('source Ready write set drift');
  }
  for (const slug of expectedReadyWrites) {
    const capability = index.capabilities.find(function(row) { return row.slug === slug; });
    if (!capability || capability.argumentContract.mode !== 'form' ||
        capability.presentationDisposition !== 't1-ready' ||
        capability.actionabilityReason !== null ||
        capability.consequenceCompatible !== true ||
        !/^sha256:[0-9a-f]{64}$/.test(capability.consequenceDigest || '') ||
        capability.executionEnabled !== true || capability.invocable !== true) {
      failures.push('source Ready write is missing trusted exhaustive consequence actionability');
    }
  }
  if (stats.sourceReadyWrites !== 5 || stats.compatibleWrites !== 5 ||
      stats.incompatibleVisuallyReadyWrites !== 0 ||
      stats.acceptedButUnregisteredWriteFields !== 0 ||
      stats.unregisteredConsequentialControls !== 0) {
    failures.push('five-write consequence compatibility totals are not exact');
  }
  const expectedNotionOptionals = [
    'notion.create_page.parent_page_id',
    'notion.create_page.icon',
    'notion.create_page.content',
    'notion.update_page.title',
    'notion.update_page.icon',
    'notion.update_page.cover',
  ];
  if (JSON.stringify(stats.notionOptionalConsequenceFields) !== JSON.stringify(expectedNotionOptionals)) {
    failures.push('six safe Notion optional consequence fields are incomplete');
  }
  if (stats.tierMismatches || stats.executionOriginMismatches ||
      stats.sideEffectClassMismatches || stats.schemaDigestMismatches) {
    failures.push('nonzero installed authority mismatch totals');
  }

  if (!isOrdered(index.capabilities, function(row) { return row.slug; })) {
    failures.push('capabilities are not in deterministic slug order');
  }
  if (!isOrdered(index.serviceProfiles, function(row) { return row.service; })) {
    failures.push('service dispositions are not in deterministic order');
  }
  if (!isOrdered(index.profiles, function(row) { return pairKey(row.appStem, row.service); })) {
    failures.push('profiles are not in deterministic stem/service order');
  }
  if (!isOrdered(index.admittedOriginIndex, function(row) { return row.admittedOrigin; })) {
    failures.push('admitted origins are not in deterministic order');
  }
  if (typeof options.rendered === 'string' && options.rendered !== renderIndex(index)) {
    failures.push('rendered bytes differ from the supplied generated index');
  }

  return { ok: failures.length === 0, failures, stats };
}

function runCli() {
  const catalog = require(join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js'));
  const authoredRegistry = require(join(ROOT, 'catalog', 'skopeo', 'app-profiles.json'));
  const terminalReport = buildTerminalStateReport();
  const index = require(OUTPUT_PATH);
  const rendered = readFileSync(OUTPUT_PATH, 'utf8');
  const result = verifySkopeoProfileCoverage({
    catalog,
    descriptors: catalog.descriptors,
    terminalReport,
    authoredRegistry,
    index,
    rendered,
  });
  if (!result.ok) {
    console.error('skopeo-profile-coverage: FAIL (' + result.failures.length + ' failures)');
    for (const failure of result.failures) console.error('  - ' + failure);
    process.exit(1);
  }
  console.log('skopeo-profile-coverage: PASS (' + result.stats.descriptors + ' descriptors; ' +
    result.stats.stems + ' profiles; ' + result.stats.admittedOrigins + ' admitted origins; ' +
    result.stats.sourceReady + ' source Ready; ' +
    result.stats.sourceReadyWithRequiredArguments + ' requiring arguments: ' +
    result.stats.sourceReadyReadsWithRequiredArguments + ' reads + ' +
    result.stats.sourceReadyWritesWithRequiredArguments + ' writes; ' +
    result.stats.sourceReadyWrites + ' source writes; ' +
    result.stats.compatibleWrites + ' compatible; ' +
    result.stats.incompatibleVisuallyReadyWrites + ' incompatible visually Ready; ' +
    result.stats.acceptedButUnregisteredWriteFields + ' accepted-but-unregistered fields; ' +
    result.stats.notionOptionalConsequenceFields.join(', ') + '; ' +
    result.stats.actionableReady + ' actionable Ready + ' + result.stats.staticReady +
    ' honest static; zero unjustified Ready; ' + result.stats.comparable +
    ' comparable; zero tier/origin/class/schema mismatches; zero origin collisions)');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    runCli();
  } catch (error) {
    console.error('skopeo-profile-coverage: ERROR ' +
      (error && error.stack ? error.stack : String(error)));
    process.exit(1);
  }
}
