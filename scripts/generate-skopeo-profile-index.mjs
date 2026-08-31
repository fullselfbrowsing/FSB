#!/usr/bin/env node

'use strict';

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInThisContext } from 'node:vm';

import { buildTerminalStateReport } from './report-t1-terminal-states.mjs';
import { buildInstalledResolver } from './report-t1-readiness.mjs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const CATALOG_PATH = join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js');
const REGISTRY_PATH = join(ROOT, 'catalog', 'skopeo', 'app-profiles.json');
export const OUTPUT_PATH = join(ROOT, 'extension', 'catalog', 'skopeo-profile-index.generated.js');

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
const TERMINAL_PRECEDENCE = Object.freeze([
  'guarded-fail-closed',
  'blocked',
  'bridge-needed',
  'uat-needed',
]);
const SIDE_EFFECTS = Object.freeze({
  read: 'read-only',
  write: 'changes-service-data',
  destructive: 'removes-service-data',
});
const MAX_PARAM_SCHEMA_BYTES = 4096;

function fail(message) {
  throw new Error('skopeo-profile-index: ' + message);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  const output = {};
  for (const key of Object.keys(value).sort()) output[key] = canonicalize(value[key]);
  return output;
}

function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stemFor(descriptor) {
  return descriptor.slug.split('.')[0];
}

function pairKey(appStem, service) {
  return appStem + '\u0000' + service;
}

function publicProfileKey(appStem, service) {
  return appStem + '@' + service;
}

function exactOriginFor(service) {
  try {
    const parsed = new URL('https://' + service);
    if (parsed.hostname !== service || parsed.origin !== 'https://' + service || parsed.pathname !== '/') {
      fail('descriptor service is not an exact host');
    }
    return parsed.origin;
  } catch (_error) {
    fail('descriptor service is not an exact host');
  }
}

function validateDescriptors(descriptors) {
  if (!Array.isArray(descriptors) || descriptors.length === 0) fail('descriptor corpus is missing');
  const slugs = new Set();
  for (const descriptor of descriptors) {
    if (!isPlainObject(descriptor) || typeof descriptor.slug !== 'string' ||
        !/^[a-z0-9][A-Za-z0-9._-]*$/.test(descriptor.slug) || !descriptor.slug.includes('.') ||
        typeof descriptor.service !== 'string' || !/^[a-z0-9.-]+$/.test(descriptor.service) ||
        !Object.prototype.hasOwnProperty.call(SIDE_EFFECTS, descriptor.sideEffectClass)) {
      fail('descriptor corpus contains an invalid row');
    }
    if (slugs.has(descriptor.slug)) fail('descriptor corpus contains a duplicate slug');
    slugs.add(descriptor.slug);
    exactOriginFor(descriptor.service);
    if (descriptor.params !== undefined && JSON.stringify(descriptor.params).length > MAX_PARAM_SCHEMA_BYTES) {
      fail('descriptor parameter schema exceeds the bounded limit');
    }
  }
}

function validateTerminalRows(terminalReport, descriptors) {
  if (!isPlainObject(terminalReport) || !Array.isArray(terminalReport.rows)) {
    fail('terminal report rows are missing');
  }
  const descriptorSlugs = new Set(descriptors.map(function (row) { return row.slug; }));
  const rows = new Map();
  for (const row of terminalReport.rows) {
    if (!isPlainObject(row) || typeof row.slug !== 'string') fail('terminal report contains an invalid row');
    if (rows.has(row.slug)) fail('terminal report contains a duplicate row');
    if (!descriptorSlugs.has(row.slug)) fail('terminal report contains a stale row');
    rows.set(row.slug, row);
  }
  if (rows.size !== descriptorSlugs.size) fail('terminal report is missing descriptor rows');
  return rows;
}

function validateAuthoredCoverage(authoredRegistry, pairs) {
  const validation = PROFILE_SCHEMA.validateRegistry(authoredRegistry);
  if (!validation.ok) {
    fail(validation.error.code + ' at ' + validation.error.path + ': ' + validation.error.reason);
  }
  const authoredByPair = new Map();
  for (const entry of authoredRegistry.profiles) {
    const key = pairKey(entry.appStem, entry.service);
    if (!pairs.has(key)) fail('authored registry contains a stale stem/service pair');
    if (authoredByPair.has(key)) fail('authored registry contains a duplicate stem/service pair');
    authoredByPair.set(key, entry);
  }
  return authoredByPair;
}

export function presentationDispositionFor(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return 'unsupported';
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

function actionLabelFor(descriptor) {
  const action = typeof descriptor.actionVerb === 'string' && /^[a-z][a-z0-9_-]*$/.test(descriptor.actionVerb)
    ? descriptor.actionVerb.replace(/[_-]+/g, ' ')
    : '';
  const words = descriptor.slug.split('.').slice(1).join(' ').replace(/[_-]+/g, ' ').split(/\s+/).filter(Boolean);
  const actionWords = new Set(action.split(/\s+/).filter(Boolean));
  const subject = words.filter(function (word) { return !actionWords.has(word); }).join(' ');
  const raw = (action ? action + (subject ? ' ' + subject : '') : words.join(' ')).trim() || 'Capability';
  return (raw.charAt(0).toUpperCase() + raw.slice(1)).slice(0, 80);
}

function paramSummaryFor(schema) {
  if (!schema || !isPlainObject(schema) || !isPlainObject(schema.properties)) {
    return Object.freeze({ count: 0, required: [], optional: [], truncated: false });
  }
  const names = Object.keys(schema.properties).sort();
  const requiredSet = new Set(Array.isArray(schema.required) ? schema.required : []);
  const allRequired = names.filter(function (name) { return requiredSet.has(name); });
  const allOptional = names.filter(function (name) { return !requiredSet.has(name); });
  const required = allRequired.slice(0, 12);
  const optional = allOptional.slice(0, Math.max(0, 12 - required.length));
  return {
    count: names.length,
    required,
    optional,
    truncated: required.length + optional.length < names.length,
  };
}

function catalogVersionFor(descriptors, authorityBySlug, consequenceBySlug, profileVersion) {
  const sorted = descriptors.slice().sort(function (left, right) { return compareText(left.slug, right.slug); });
  const authorities = sorted.map(function(descriptor) {
    return {
      slug: descriptor.slug,
      executionAuthority: authorityBySlug.get(descriptor.slug) || null,
      consequenceAuthority: consequenceBySlug.get(descriptor.slug) || null,
    };
  });
  return 'sha256:' + createHash('sha256').update(stableJson({
    schemaVersion: PROFILE_SCHEMA.SCHEMA_VERSION,
    profileVersion,
    descriptors: sorted,
    authorities,
  })).digest('hex');
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

function installedExecutionOrigin(resolved) {
  if (!resolved || typeof resolved.origin !== 'string') return null;
  try {
    const parsed = new URL(resolved.origin);
    if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '' ||
        parsed.port !== '' || parsed.origin === 'null') {
      return null;
    }
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

function executionAuthorityFor(resolved) {
  if (!resolved || resolved.tier !== 'T1a' || !resolved.handler ||
      typeof resolved.handler.handle !== 'function') {
    return null;
  }
  const executionOrigin = installedExecutionOrigin(resolved);
  const sideEffectClass = installedSideEffectClass(resolved);
  const sourceSchema = CAPABILITY_ROUTER.getResolvedParamsSchema(resolved);
  const canonicalSchema = ACTION_AUTHORITY.canonicalSchemaJson(sourceSchema);
  if (!executionOrigin || !sideEffectClass || canonicalSchema === null) return null;
  return {
    tier: 'T1a',
    executionOrigin,
    sideEffectClass,
    paramSchema: JSON.parse(canonicalSchema),
    schemaDigest: 'sha256:' + createHash('sha256').update(canonicalSchema).digest('hex'),
  };
}

function buildAdmissionPlan(pairRows, stemsByService, authorityBySlug, authoredByPair) {
  const pairOrigins = new Map(pairRows.map(function(pair) {
    return [pairKey(pair.appStem, pair.service), new Set()];
  }));
  const candidates = new Map();
  const ambiguousOrigins = [];
  const preferredPairKeys = new Set();

  function addCandidate(origin, pair) {
    if (!candidates.has(origin)) candidates.set(origin, []);
    const owners = candidates.get(origin);
    const key = pairKey(pair.appStem, pair.service);
    if (!owners.some(function(owner) { return pairKey(owner.appStem, owner.service) === key; })) {
      owners.push(pair);
    }
  }

  for (const pair of pairRows) {
    const appStems = stemsByService.get(pair.service);
    const serviceOrigin = exactOriginFor(pair.service);
    if (appStems.size > 1) {
      continue;
    }
    addCandidate(serviceOrigin, pair);
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
    const canonicalOwners = owners.filter(function(owner) {
      return exactOriginFor(owner.service) === origin;
    });
    if (stems.size === 1 && canonicalOwners.length === 1) {
      pairOrigins.get(pairKey(canonicalOwners[0].appStem, canonicalOwners[0].service)).add(origin);
      continue;
    }
    fail('installed origin resolution is ambiguous');
  }

  for (const [service, appStemSet] of stemsByService.entries()) {
    if (appStemSet.size <= 1) continue;
    const preferred = Array.from(appStemSet).map(function(appStem) {
      return pairKey(appStem, service);
    }).filter(function(key) {
      return authoredByPair.has(key);
    });
    if (preferred.length === 1) {
      const preferredKey = preferred[0];
      pairOrigins.get(preferredKey).add(exactOriginFor(service));
      preferredPairKeys.add(preferredKey);
      continue;
    }
    const related = Array.from(appStemSet).sort().map(function(appStem) {
      return publicProfileKey(appStem, service);
    });
    ambiguousOrigins.push({
      admittedOrigin: exactOriginFor(service),
      service,
      profileKeys: related,
      profileDisposition: 'ambiguous-stem',
    });
  }

  const admittedOriginIndex = ambiguousOrigins.slice();
  for (const pair of pairRows) {
    const key = pairKey(pair.appStem, pair.service);
    for (const admittedOrigin of pairOrigins.get(key)) {
      admittedOriginIndex.push({
        admittedOrigin,
        service: pair.service,
        profileKeys: [publicProfileKey(pair.appStem, pair.service)],
        profileDisposition: 'pending',
      });
    }
  }
  admittedOriginIndex.sort(function(left, right) {
    return compareText(left.admittedOrigin, right.admittedOrigin);
  });
  return { pairOrigins, admittedOriginIndex, preferredPairKeys };
}

function profileRecordFor(
  pair,
  authoredEntry,
  defaults,
  profileVersion,
  catalogVersion,
  ambiguous,
  admittedPageOrigins,
  capabilitySlugs
) {
  const serviceOrigin = exactOriginFor(pair.service);
  const profileKey = publicProfileKey(pair.appStem, pair.service);
  if (ambiguous) {
    return {
      profileKey,
      schemaVersion: PROFILE_SCHEMA.SCHEMA_VERSION,
      profileId: null,
      profileVersion,
      catalogVersion,
      appStem: pair.appStem,
      service: pair.service,
      serviceOrigin,
      admittedPageOrigins: [],
      profileDisposition: 'ambiguous-stem',
      displayName: null,
      defaultGenre: null,
      pageNoun: null,
      entityVocabulary: null,
      capabilityGroups: [],
      attentionCeiling: 'ambient',
      adapterId: null,
      rendererId: null,
      capabilitySlugs,
    };
  }

  const source = authoredEntry ? authoredEntry.profile : defaults.profile;
  const profileId = authoredEntry ? authoredEntry.profileId : defaults.profileId;
  const normalized = PROFILE_SCHEMA.normalizeProfile(source, {
    profileId,
    profileVersion,
    appStem: pair.appStem,
    service: pair.service,
    serviceOrigin,
    admittedPageOrigins,
  });
  return {
    profileKey,
    schemaVersion: normalized.schemaVersion,
    profileId: normalized.profileId,
    profileVersion: normalized.profileVersion,
    catalogVersion,
    appStem: normalized.appStem,
    service: normalized.service,
    serviceOrigin: normalized.serviceOrigin,
    admittedPageOrigins: normalized.admittedPageOrigins,
    profileDisposition: authoredEntry ? 'authored' : 'generic-default',
    displayName: normalized.displayName,
    defaultGenre: normalized.defaultGenre,
    pageNoun: normalized.pageNoun,
    entityVocabulary: normalized.entityVocabulary,
    capabilityGroups: normalized.capabilityGroups,
    attentionCeiling: normalized.attentionCeiling,
    adapterId: normalized.adapterId,
    rendererId: normalized.rendererId,
    capabilitySlugs,
  };
}

export function buildSkopeoProfileIndex({ catalog, descriptors, terminalReport, authoredRegistry }) {
  validateDescriptors(descriptors);
  const sortedDescriptors = descriptors.slice().sort(function (left, right) {
    return compareText(left.slug, right.slug);
  });
  const terminalBySlug = validateTerminalRows(terminalReport, sortedDescriptors);
  const pairs = new Map();
  const stemsByService = new Map();
  const descriptorsByStem = new Map();
  for (const descriptor of sortedDescriptors) {
    const appStem = stemFor(descriptor);
    const key = pairKey(appStem, descriptor.service);
    if (!pairs.has(key)) pairs.set(key, { appStem, service: descriptor.service, descriptors: [] });
    pairs.get(key).descriptors.push(descriptor);
    if (!descriptorsByStem.has(appStem)) descriptorsByStem.set(appStem, []);
    descriptorsByStem.get(appStem).push(descriptor);
    if (!stemsByService.has(descriptor.service)) stemsByService.set(descriptor.service, new Set());
    stemsByService.get(descriptor.service).add(appStem);
  }

  const authoredByPair = validateAuthoredCoverage(authoredRegistry, pairs);
  const installedCatalog = catalog && typeof catalog === 'object' ? catalog : require(CATALOG_PATH);
  const resolveInstalled = buildInstalledResolver(installedCatalog);
  const authorityBySlug = new Map();
  const argumentContractBySlug = new Map();
  const consequenceBySlug = new Map();
  for (const descriptor of sortedDescriptors) {
    let resolved = null;
    try {
      resolved = resolveInstalled
        ? resolveInstalled(descriptor.slug, exactOriginFor(descriptor.service))
        : null;
    } catch (_error) {
      resolved = null;
    }
    const executionAuthority = executionAuthorityFor(resolved);
    authorityBySlug.set(descriptor.slug, executionAuthority);
    const argumentContract = ACTION_AUTHORITY.analyzeArgumentSchema(resolved, executionAuthority);
    argumentContractBySlug.set(descriptor.slug, argumentContract);
    if (descriptor.sideEffectClass === 'write' || descriptor.sideEffectClass === 'destructive') {
      const compiled = ACTION_AUTHORITY.compileConsequenceContract(
        descriptor.slug,
        CONSEQUENCE_TARGETS.getContract(descriptor.slug),
        executionAuthority,
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
  const catalogVersion = catalogVersionFor(
    sortedDescriptors,
    authorityBySlug,
    consequenceBySlug,
    authoredRegistry.profileVersion
  );
  const pairRows = Array.from(pairs.values()).sort(function (left, right) {
    return left.appStem === right.appStem
      ? compareText(left.service, right.service)
      : compareText(left.appStem, right.appStem);
  });
  const admissionPlan = buildAdmissionPlan(
    pairRows,
    stemsByService,
    authorityBySlug,
    authoredByPair
  );
  const profiles = pairRows.map(function (pair) {
    const key = pairKey(pair.appStem, pair.service);
    const ambiguous = stemsByService.get(pair.service).size > 1 &&
      !admissionPlan.preferredPairKeys.has(key);
    const admittedPageOrigins = Array.from(
      admissionPlan.pairOrigins.get(key)
    ).sort();
    const capabilitySlugs = descriptorsByStem.get(pair.appStem)
      .map(function(row) { return row.slug; })
      .sort();
    return profileRecordFor(
      pair,
      authoredByPair.get(pairKey(pair.appStem, pair.service)) || null,
      authoredRegistry.defaults,
      authoredRegistry.profileVersion,
      catalogVersion,
      ambiguous,
      admittedPageOrigins,
      capabilitySlugs
    );
  });
  const profileByPair = new Map(profiles.map(function (profile) {
    return [pairKey(profile.appStem, profile.service), profile];
  }));

  const serviceProfiles = Array.from(stemsByService.entries()).sort(function (left, right) {
    return compareText(left[0], right[0]);
  }).map(function (entry) {
    const service = entry[0];
    const appStems = Array.from(entry[1]).sort();
    const related = appStems.map(function (appStem) { return profileByPair.get(pairKey(appStem, service)); });
    const ambiguous = appStems.length > 1;
    const admittedPageOrigins = related.flatMap(function(profile) {
      return profile.admittedPageOrigins;
    }).filter(function(origin, index, all) {
      return all.indexOf(origin) === index;
    }).sort();
    if (ambiguous && !admittedPageOrigins.includes(exactOriginFor(service))) {
      admittedPageOrigins.push(exactOriginFor(service));
    }
    return {
      service,
      serviceOrigin: exactOriginFor(service),
      admittedPageOrigins: admittedPageOrigins.sort(),
      appStems,
      profileDisposition: ambiguous ? 'ambiguous-stem' : related[0].profileDisposition,
      profileKeys: related.map(function (profile) { return profile.profileKey; }).sort(),
      profileId: ambiguous ? null : related[0].profileId,
    };
  });

  const capabilities = sortedDescriptors.map(function (descriptor) {
    const appStem = stemFor(descriptor);
    const pairProfile = profileByPair.get(pairKey(appStem, descriptor.service));
    const terminal = terminalBySlug.get(descriptor.slug);
    const readinessDisposition = presentationDispositionFor(terminal);
    const executionAuthority = authorityBySlug.get(descriptor.slug) || null;
    const sourceArgumentContract = argumentContractBySlug.get(descriptor.slug);
    const consequence = consequenceBySlug.get(descriptor.slug) || null;
    const consequenceCompatible = !!(consequence && consequence.compatible && consequence.digest);
    const argumentContract = consequenceCompatible
      ? consequence.contract.effectiveArgumentContract
      : sourceArgumentContract;
    const authorityProfiles = executionAuthority ? profiles.filter(function(candidate) {
      return candidate.appStem === appStem &&
        candidate.admittedPageOrigins.includes(executionAuthority.executionOrigin);
    }) : [];
    if (authorityProfiles.length > 1) fail('installed execution origin maps to multiple profiles');
    const profile = authorityProfiles.length === 1 ? authorityProfiles[0] : pairProfile;
    const sourcePresentationDisposition = pairProfile.profileDisposition === 'ambiguous-stem'
      ? 'unsupported'
      : readinessDisposition;
    const sideEffectClass = executionAuthority
      ? executionAuthority.sideEffectClass
      : descriptor.sideEffectClass;
    let presentationDisposition = sourcePresentationDisposition;
    let actionabilityReason = sourcePresentationDisposition === 't1-ready' ? null : 'source-not-ready';
    if (sourcePresentationDisposition === 't1-ready') {
      if (!executionAuthority || argumentContract.mode === 'unsupported') {
        presentationDisposition = 'unsupported';
        actionabilityReason = argumentContract.reason || 'argument-contract-unsupported';
      } else if (sideEffectClass !== 'read' && !consequenceCompatible) {
        presentationDisposition = 'unsupported';
        actionabilityReason = consequence ? consequence.reason : 'consequence-contract-missing';
      }
    }
    const executable = presentationDisposition === 't1-ready' &&
      executionAuthority !== null && ['empty', 'form'].includes(argumentContract.mode);
    const paramsSchema = executionAuthority
      ? executionAuthority.paramSchema
      : descriptor.params;
    return {
      slug: descriptor.slug,
      profileKey: profile.profileKey,
      profileId: profile.profileId,
      appStem,
      service: descriptor.service,
      serviceOrigin: exactOriginFor(descriptor.service),
      actionLabel: actionLabelFor(descriptor),
      effect: SIDE_EFFECTS[sideEffectClass],
      sideEffectClass,
      executionAuthority,
      paramSummary: paramSummaryFor(paramsSchema),
      argumentContract,
      consequenceContract: consequenceCompatible ? consequence.contract : null,
      consequenceDigest: consequenceCompatible ? consequence.digest : null,
      consequenceCompatible,
      acceptedConsequenceFields: consequenceCompatible ? consequence.acceptedFields : [],
      excludedConsequenceFields: consequenceCompatible ? consequence.excludedFields : [],
      actionabilityReason,
      sourceReadiness: terminal.readiness || null,
      sourceTerminalState: terminal.terminalState || null,
      surfaceStatus: terminal.surfaceStatus || null,
      presentationDisposition,
      executionEnabled: executable,
      invocable: executable,
    };
  });

  const admittedOriginIndex = admissionPlan.admittedOriginIndex.map(function(row) {
    if (row.profileDisposition !== 'pending') return row;
    const profile = profileByPair.get(pairKey(
      row.profileKeys[0].slice(0, row.profileKeys[0].indexOf('@')),
      row.service
    ));
    return Object.assign({}, row, { profileDisposition: profile.profileDisposition });
  });

  return {
    schemaVersion: PROFILE_SCHEMA.SCHEMA_VERSION,
    profileVersion: authoredRegistry.profileVersion,
    catalogVersion,
    counts: {
      descriptors: sortedDescriptors.length,
      stems: new Set(sortedDescriptors.map(stemFor)).size,
      services: stemsByService.size,
      pairs: pairs.size,
    },
    admittedOriginIndex,
    serviceProfiles,
    profiles,
    capabilities,
  };
}

export function renderSkopeoProfileIndex(index) {
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

function loadInputs() {
  const catalog = require(CATALOG_PATH);
  return {
    catalog,
    descriptors: catalog.descriptors,
    terminalReport: buildTerminalStateReport(),
    authoredRegistry: require(REGISTRY_PATH),
  };
}

function runCli() {
  const check = process.argv.slice(2).includes('--check');
  const index = buildSkopeoProfileIndex(loadInputs());
  const source = renderSkopeoProfileIndex(index);
  if (check) {
    if (!existsSync(OUTPUT_PATH) || readFileSync(OUTPUT_PATH, 'utf8') !== source) {
      console.error('skopeo-profile-index: FAIL (generated artifact is stale; run the generator)');
      process.exit(1);
    }
    console.log('skopeo-profile-index: PASS (artifact is current; ' +
      index.counts.descriptors + ' descriptors; ' + index.counts.services + ' services)');
    return;
  }
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, source, 'utf8');
  console.log('skopeo-profile-index: wrote ' + OUTPUT_PATH.replace(ROOT + '/', '') + ' (' +
    index.counts.descriptors + ' descriptors; ' + index.counts.stems + ' stems; ' +
    index.counts.services + ' services)');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    runCli();
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  }
}
