'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const catalog = require('../extension/catalog/recipe-index.generated.js');
const capabilityRouter = require('../extension/utils/capability-router.js');
const ARGUMENT_FIELD_KEYS = Object.freeze([
  'name',
  'label',
  'kind',
  'required',
  'choices',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
]);
const READY_WRITE_SLUGS = Object.freeze([
  'notion.create_database',
  'notion.create_database_item',
  'notion.create_page',
  'notion.update_page',
  'slack.chat.postMessage',
]);
const NOTION_OPTIONAL_CONSEQUENCE_FIELDS = Object.freeze([
  'notion.create_page.parent_page_id',
  'notion.create_page.icon',
  'notion.create_page.content',
  'notion.update_page.title',
  'notion.update_page.icon',
  'notion.update_page.cover',
]);

if (!globalThis.CfworkerJsonSchema) {
  vm.runInThisContext(fs.readFileSync(
    path.join(ROOT, 'extension/lib/cfworker-json-schema.min.js'),
    'utf8'
  ));
}

function clone(value) {
  return structuredClone(value);
}

function stemFor(descriptor) {
  return String(descriptor.slug || '').split('.')[0];
}

function pairKey(descriptor) {
  return stemFor(descriptor) + '\u0000' + descriptor.service;
}

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

function failureText(result) {
  return (result.failures || []).join('\n');
}

function boundedParamSummary(schema) {
  const properties = schema && schema.properties && typeof schema.properties === 'object'
    ? schema.properties
    : {};
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

function sourceReadyCapabilities(index) {
  const profiles = new Map(index.profiles.map(function(row) { return [row.profileKey, row]; }));
  return index.capabilities.filter(function(row) {
    const profile = profiles.get(row.profileKey);
    return row.sourceReadiness === 't1-ready' && row.sourceTerminalState === 't1-ready' &&
      row.surfaceStatus === 't1-ready' && profile && profile.profileDisposition !== 'ambiguous-stem';
  });
}

function representativeSubmission(contract) {
  const raw = {};
  for (const field of contract.fields) {
    if (!field.required) continue;
    if (field.kind === 'choice') {
      raw[field.name] = field.choices[0];
    } else if (field.kind === 'boolean') {
      raw[field.name] = true;
    } else if (field.kind === 'integer') {
      const minimum = field.minimum === null ? 1 : Math.ceil(field.minimum);
      raw[field.name] = String(Math.min(field.maximum === null ? minimum : field.maximum, minimum));
    } else if (field.kind === 'number') {
      const minimum = field.minimum === null ? 1 : field.minimum;
      raw[field.name] = String(Math.min(field.maximum === null ? minimum : field.maximum, minimum));
    } else {
      raw[field.name] = 'x'.repeat(Math.max(1, field.minLength || 0));
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
    } else if (field.kind === 'integer') {
      const minimum = field.minimum === null ? 1 : Math.ceil(field.minimum);
      raw[field.name] = String(Math.min(field.maximum === null ? minimum : field.maximum, minimum));
    } else if (field.kind === 'number') {
      const minimum = field.minimum === null ? 1 : field.minimum;
      raw[field.name] = String(Math.min(field.maximum === null ? minimum : field.maximum, minimum));
    } else {
      raw[field.name] = field.name + '-reviewed-value';
    }
  }
  return raw;
}

function resolvedFixture(schema, sideEffectClass = 'read') {
  const handler = {
    tier: 'T1a',
    origin: 'https://collector.example.test',
    sideEffectClass,
    params: schema,
    async handle() { return { success: true }; },
  };
  return {
    tier: 'T1a',
    handler,
    origin: handler.origin,
    descriptor: {
      slug: 'collector.fixture',
      service: 'collector.example.test',
      sideEffectClass,
      params: schema,
    },
  };
}

async function main() {
  const generator = await loadModule('scripts/generate-skopeo-profile-index.mjs');
  const verifier = await loadModule('scripts/verify-skopeo-profile-coverage.mjs');
  const terminalModule = await loadModule('scripts/report-t1-terminal-states.mjs');
  const readinessModule = await loadModule('scripts/report-t1-readiness.mjs');
  const authoredRegistry = require('../catalog/skopeo/app-profiles.json');
  const authorityPath = path.join(ROOT, 'extension/utils/skopeo-action-authority.js');
  const authority = fs.existsSync(authorityPath) ? require(authorityPath) : null;
  const consequenceTargetsPath = path.join(ROOT, 'extension/catalog/skopeo-consequence-targets.js');
  const consequenceTargets = fs.existsSync(consequenceTargetsPath)
    ? require(consequenceTargetsPath)
    : null;

  assert.equal(typeof readinessModule.buildInstalledResolver, 'function',
    'installed authority exports buildInstalledResolver');
  if (!authority || typeof authority.analyzeArgumentSchema !== 'function' ||
      typeof authority.parseCollectedArguments !== 'function' ||
      typeof authority.validateCollectedArguments !== 'function') {
    console.log('argumentContract collector missing implementation');
  }
  if (!authority || typeof authority.compileConsequenceContract !== 'function' ||
      typeof authority.materializeConsequence !== 'function') {
    console.log('consequence contract missing implementation for the exact 5 source Ready writes');
  }
  assert.ok(authority && typeof authority.canonicalSchemaJson === 'function' &&
    typeof authority.schemaDigest === 'function' &&
    typeof authority.normalizeResolvedAuthority === 'function' &&
    typeof authority.authorityMatches === 'function' &&
    typeof authority.analyzeArgumentSchema === 'function' &&
    typeof authority.parseCollectedArguments === 'function' &&
    typeof authority.validateCollectedArguments === 'function' &&
    typeof authority.compileConsequenceContract === 'function' &&
    typeof authority.materializeConsequence === 'function',
  'installed authority exports canonical schema, argumentContract collector, consequence contract compiler, renderedFields materializer, validator, and exact matching');
  assert.ok(consequenceTargets && consequenceTargets.schemaVersion === 1 &&
    typeof consequenceTargets.getContract === 'function',
  'trusted consequence target registry exists with schemaVersion 1 and getContract');
  const resolveInstalled = readinessModule.buildInstalledResolver(catalog);
  assert.equal(typeof resolveInstalled, 'function', 'installed authority resolver is available');

  const descriptors = catalog.descriptors;
  const descriptorSet = new Set(descriptors.map(function(row) { return row.slug; }));
  const stemSet = new Set(descriptors.map(stemFor));
  const serviceSet = new Set(descriptors.map(function(row) { return row.service; }));
  const pairSet = new Set(descriptors.map(pairKey));

  assert.equal(descriptorSet.size, 2314, 'descriptor baseline is pinned');
  assert.equal(stemSet.size, 128, 'app-stem baseline is pinned');
  assert.equal(serviceSet.size, 129, 'service baseline is pinned');
  assert.notEqual(stemSet.size, serviceSet.size, 'stems are not treated as services');

  const terminalReport = terminalModule.buildTerminalStateReport();
  const index = generator.buildSkopeoProfileIndex({
    descriptors,
    terminalReport,
    authoredRegistry,
  });
  const rendered = generator.renderSkopeoProfileIndex(index);
  const verification = verifier.verifySkopeoProfileCoverage({
    descriptors,
    terminalReport,
    authoredRegistry,
    index,
    rendered,
  });

  assert.equal(verification.ok, true, failureText(verification));
  assert.deepEqual(Object.fromEntries([
    'descriptors', 'stems', 'services', 'pairs', 'admittedOrigins', 'sourceReady', 'comparable',
    'tierMismatches', 'executionOriginMismatches', 'sideEffectClassMismatches',
    'schemaDigestMismatches', 'originCollisions',
  ].map(function(key) { return [key, verification.stats[key]]; })), {
    descriptors: 2314,
    stems: 128,
    services: 129,
    pairs: pairSet.size,
    admittedOrigins: 166,
    sourceReady: 1285,
    comparable: 1279,
    tierMismatches: 0,
    executionOriginMismatches: 0,
    sideEffectClassMismatches: 0,
    schemaDigestMismatches: 0,
    originCollisions: 0,
  }, 'verifier reports exact corpus authority counts and zero mismatch totals');
  assert.equal(verification.stats.sourceReadyWithRequiredArguments, 749,
    '749 source Ready capabilities require arguments');
  assert.equal(verification.stats.sourceReadyReadsWithRequiredArguments, 744,
    '744 source Ready reads require arguments');
  assert.equal(verification.stats.sourceReadyWritesWithRequiredArguments, 5,
    '5 writes make up the remaining source Ready argument gap');
  assert.equal(verification.stats.unjustifiedReady, 0,
    'zero unjustified Ready controls survive verification');
  assert.deepEqual(Object.fromEntries([
    'sourceReadyWrites',
    'compatibleWrites',
    'incompatibleVisuallyReadyWrites',
    'acceptedButUnregisteredWriteFields',
    'unregisteredConsequentialControls',
  ].map(function(key) { return [key, verification.stats[key]]; })), {
    sourceReadyWrites: 5,
    compatibleWrites: 5,
    incompatibleVisuallyReadyWrites: 0,
    acceptedButUnregisteredWriteFields: 0,
    unregisteredConsequentialControls: 0,
  }, 'five source Ready writes are consequence-compatible with zero unregistered controls or accepted-field gaps');
  assert.deepEqual(verification.stats.notionOptionalConsequenceFields,
    NOTION_OPTIONAL_CONSEQUENCE_FIELDS,
  'independent coverage names all six safe Notion optional mutation fields');
  assert.equal(
    verification.stats.actionableReady + verification.stats.staticReady,
    1285,
    'derived actionable/static totals exactly partition the 1285 source Ready corpus'
  );
  assert.equal(index.serviceProfiles.length, 129, 'one profile/disposition row per service');
  assert.equal(index.profiles.length, pairSet.size, 'one runtime profile row per stem/service pair');
  assert.equal(index.capabilities.length, 2314, 'one runtime capability row per descriptor');
  assert.equal(new Set(index.capabilities.map(function(row) { return row.slug; })).size, 2314,
    'every descriptor occurs exactly once');
  assert.equal(new Set(index.serviceProfiles.map(function(row) { return row.service; })).size, 129,
    'every service occurs exactly once');
  assert.equal(new Set(index.profiles.map(function(row) { return row.appStem; })).size, 128,
    'the exact 128-profile app-stem corpus is retained');
  assert.equal(index.admittedOriginIndex.length, 166,
    'post-generation admitted-origin total is exactly 166');

  const sourceReady = sourceReadyCapabilities(index);
  assert.equal(sourceReady.length, 1285, 'source Ready corpus is pinned to 1285 rows');
  const sourceReadyWithRequiredArguments = sourceReady.filter(function(row) {
    return row.executionAuthority && Array.isArray(row.executionAuthority.paramSchema.required) &&
      row.executionAuthority.paramSchema.required.length > 0;
  });
  assert.equal(sourceReadyWithRequiredArguments.length, 749,
    'exact source evidence retains 749 argument-requiring Ready rows');
  assert.equal(sourceReadyWithRequiredArguments.filter(function(row) {
    return row.sideEffectClass === 'read';
  }).length, 744, 'exact source evidence retains 744 argument-requiring Ready reads');
  assert.deepEqual(sourceReadyWithRequiredArguments.filter(function(row) {
    return row.sideEffectClass !== 'read';
  }).map(function(row) { return row.slug; }).sort(), READY_WRITE_SLUGS,
  'exact source evidence retains all five real write argument schemas');
  let comparable = 0;
  const mismatch = {
    tier: 0,
    executionOrigin: 0,
    sideEffectClass: 0,
    schemaDigest: 0,
  };
  for (const generated of sourceReady) {
    const profile = index.profiles.find(function(row) { return row.profileKey === generated.profileKey; });
    const resolved = resolveInstalled(generated.slug, profile && profile.serviceOrigin);
    const expectedAuthority = await authority.normalizeResolvedAuthority(resolved);
    if (!expectedAuthority) continue;
    comparable += 1;
    const actual = generated.executionAuthority;
    if (!actual || actual.tier !== expectedAuthority.tier) mismatch.tier += 1;
    if (!actual || actual.executionOrigin !== expectedAuthority.executionOrigin) mismatch.executionOrigin += 1;
    if (!actual || actual.sideEffectClass !== expectedAuthority.sideEffectClass) mismatch.sideEffectClass += 1;
    if (!actual || actual.schemaDigest !== expectedAuthority.schemaDigest) mismatch.schemaDigest += 1;
    assert.equal(authority.authorityMatches(expectedAuthority, actual), true,
      generated.slug + ' generated authority matches the installed handler exactly');
  }
  assert.equal(comparable, 1279, '1279 source Ready rows have comparable installed-handler authority');
  assert.deepEqual(mismatch, {
    tier: 0,
    executionOrigin: 0,
    sideEffectClass: 0,
    schemaDigest: 0,
  }, 'zero mismatch across tier, execution origin, side-effect class, and schemaDigest');

  for (const [slug, expectedOrigin] of [
    ['airbnb.get_current_user', 'https://www.airbnb.com'],
    ['zillow.search_for_sale', 'https://www.zillow.com'],
    ['notion.create_database', 'https://app.notion.com'],
    ['slack.chat.postMessage', 'https://app.slack.com'],
    ['craigslist.get_chat_messages', 'https://accounts.craigslist.org'],
    ['wikipedia.compare_revisions', 'https://en.wikipedia.org'],
  ]) {
    const capability = index.capabilities.find(function(row) { return row.slug === slug; });
    assert.ok(capability && capability.executionAuthority,
      slug + ' has installed execution authority');
    assert.equal(capability.executionAuthority.executionOrigin, expectedOrigin,
      slug + ' pins the named installed execution origin');
    const profile = index.profiles.find(function(row) { return row.profileKey === capability.profileKey; });
    assert.equal(profile.admittedPageOrigins.includes(expectedOrigin), true,
      slug + ' profile admits its exact installed page origin');
  }

  const zillowCapability = index.capabilities.find(function(row) {
    return row.slug === 'zillow.search_for_sale';
  });
  assert.ok(zillowCapability && zillowCapability.executionAuthority,
    'Zillow full-schema authority fixture exists');
  const originalAuthority = zillowCapability.executionAuthority;
  const thirteenthSchema = clone(originalAuthority.paramSchema);
  const zillowNames = Object.keys(thirteenthSchema.properties).sort();
  assert.equal(zillowNames.length, 13, 'real Zillow authority has a thirteenth optional property');
  thirteenthSchema.properties[zillowNames[12]].description =
    String(thirteenthSchema.properties[zillowNames[12]].description || '') + ' (changed constraint copy)';
  const originalSummary = boundedParamSummary(originalAuthority.paramSchema);
  const changedSummary = boundedParamSummary(thirteenthSchema);
  assert.deepEqual(changedSummary, originalSummary,
    'changing Zillow thirteenth-property schema preserves the bounded first-12 paramSummary');
  assert.equal(originalSummary.count, 13, 'paramSummary count retains the full Zillow property count');
  assert.equal(originalSummary.truncated, true, 'Zillow paramSummary reports truncated:true honestly');
  const changedDigest = await authority.schemaDigest(thirteenthSchema);
  assert.notEqual(changedDigest, originalAuthority.schemaDigest,
    'changing only the Zillow thirteenth property changes schemaDigest');
  const staleReplay = Object.assign({}, originalAuthority, {
    paramSchema: thirteenthSchema,
    schemaDigest: originalAuthority.schemaDigest,
  });
  assert.equal(authority.authorityMatches(originalAuthority, staleReplay), false,
    'stale schemaDigest paired with a mutated full schema is rejected');

  async function analyzeFixture(schema, sideEffectClass) {
    const resolved = resolvedFixture(schema, sideEffectClass);
    const executionAuthority = await authority.normalizeResolvedAuthority(resolved);
    assert.ok(executionAuthority, 'collector mutation fixture has normalized installed authority');
    return {
      resolved,
      executionAuthority,
      contract: authority.analyzeArgumentSchema(resolved, executionAuthority),
    };
  }

  const scalarSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string', minLength: 2, maxLength: 40,
        default: 'PAGE DEFAULT MUST NOT PREFILL',
        examples: ['PAGE EXAMPLE MUST NOT PREFILL'],
        description: 'PAGE DESCRIPTION MUST NOT PROJECT',
      },
      include_archived: { type: 'boolean' },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      ratio: { type: 'number', minimum: 0.5, maximum: 2.5 },
      mode: { type: 'string', enum: ['recent', 'popular'] },
      optional_nested: {
        type: 'object', properties: { ignored: { type: 'string' } }, additionalProperties: false,
      },
      optional_password: { type: 'string' },
    },
    required: ['query', 'include_archived', 'limit', 'ratio', 'mode'],
    additionalProperties: false,
  };
  const scalarFixture = await analyzeFixture(scalarSchema);
  const scalarContract = scalarFixture.contract;
  assert.equal(scalarContract.mode, 'form', 'supported required scalar vocabulary compiles to a form');
  assert.equal(scalarContract.reason, null);
  assert.equal(scalarContract.schemaDigest, scalarFixture.executionAuthority.schemaDigest,
    'argumentContract is bound to the complete installed schemaDigest');
  assert.deepEqual(scalarContract.fields.map(function(field) { return field.name; }),
    ['include_archived', 'limit', 'mode', 'query', 'ratio'],
  'required scalar fields are deterministic and optional required object/secret fields are omitted');
  for (const field of scalarContract.fields) {
    assert.deepEqual(Reflect.ownKeys(field).sort(), ARGUMENT_FIELD_KEYS.slice().sort(),
      field.name + ' has the exact closed collector field keys');
    assert.equal(Object.isFrozen(field), true, field.name + ' field is frozen');
  }
  const serializedContract = JSON.stringify(scalarContract);
  for (const forbidden of [
    'PAGE DEFAULT MUST NOT PREFILL',
    'PAGE EXAMPLE MUST NOT PREFILL',
    'PAGE DESCRIPTION MUST NOT PROJECT',
    'optional_password',
    'default',
    'examples',
    'value',
    'placeholder',
  ]) {
    assert.equal(serializedContract.includes(forbidden), false,
      forbidden + ' never enters collector metadata');
  }

  const validRaw = {
    query: 'quarterly',
    include_archived: true,
    limit: '7',
    ratio: '1.5',
    mode: 'recent',
  };
  const parsedScalars = authority.parseCollectedArguments(scalarContract, validRaw);
  assert.deepEqual(parsedScalars, {
    ok: true,
    args: {
      include_archived: true,
      limit: 7,
      mode: 'recent',
      query: 'quarterly',
      ratio: 1.5,
    },
  }, 'collector parses strings, booleans, integer, number, and scalar enum into typed args');
  assert.equal(Object.isFrozen(parsedScalars.args), true, 'typed collector args are deep frozen');
  assert.equal(authority.validateCollectedArguments(scalarContract, parsedScalars.args), true,
    'collector validator accepts its own typed output');
  assert.equal(capabilityRouter.validateResolvedArgs(scalarFixture.resolved, parsedScalars.args), true,
    'representative typed args pass the real installed router validator');

  for (const [label, submitted] of [
    ['missing required', { query: 'quarterly', include_archived: true, limit: '7', ratio: '1.5' }],
    ['invalid enum', Object.assign({}, validRaw, { mode: 'invented' })],
    ['non-finite number', Object.assign({}, validRaw, { ratio: 'Infinity' })],
    ['unknown key', Object.assign({}, validRaw, { forged: 'value' })],
    ['secret-shaped unknown key', Object.assign({}, validRaw, { api_token: 'must-not-pass' })],
  ]) {
    const parsed = authority.parseCollectedArguments(scalarContract, submitted);
    assert.equal(parsed.ok, false, label + ' fails the production collector parser');
  }
  assert.equal(authority.parseCollectedArguments(scalarContract, Object.create(validRaw)).ok, false,
    'prototype-backed submissions fail closed');
  const accessorSubmission = Object.assign({}, validRaw);
  Object.defineProperty(accessorSubmission, 'query', { enumerable: true, get() { return 'quarterly'; } });
  assert.equal(authority.parseCollectedArguments(scalarContract, accessorSubmission).ok, false,
    'accessor-backed submissions fail closed');

  const unsupportedSchemas = [
    ['required object', {
      type: 'object', properties: { target: { type: 'object', properties: {}, additionalProperties: false } },
      required: ['target'], additionalProperties: false,
    }],
    ['required array', {
      type: 'object', properties: { targets: { type: 'array', items: { type: 'string' } } },
      required: ['targets'], additionalProperties: false,
    }],
    ['$ref', {
      type: 'object', properties: { query: { $ref: '#/$defs/query' } }, required: ['query'],
      additionalProperties: false, $defs: { query: { type: 'string' } },
    }],
    ['allOf', { allOf: [{ type: 'object' }], type: 'object', properties: {}, additionalProperties: false }],
    ['anyOf', { anyOf: [{ type: 'object' }], type: 'object', properties: {}, additionalProperties: false }],
    ['oneOf', { oneOf: [{ type: 'object' }], type: 'object', properties: {}, additionalProperties: false }],
    ['conditional', {
      type: 'object', properties: { query: { type: 'string' } }, required: ['query'],
      if: { properties: { query: { const: 'x' } } }, then: { required: ['other'] }, additionalProperties: false,
    }],
    ['dangerous regex', {
      type: 'object', properties: { query: { type: 'string', pattern: '^(a+)+$' } },
      required: ['query'], additionalProperties: false,
    }],
  ];
  for (const [label, schema] of unsupportedSchemas) {
    const fixture = await analyzeFixture(schema);
    assert.equal(fixture.contract.mode, 'unsupported', label + ' is collector-unsafe');
    assert.deepEqual(fixture.contract.fields, [], label + ' exposes no fields');
  }

  const thirteenRequiredProperties = {};
  const thirteenRequiredNames = [];
  for (let fieldIndex = 0; fieldIndex < 13; fieldIndex += 1) {
    const name = 'required_' + String(fieldIndex);
    thirteenRequiredNames.push(name);
    thirteenRequiredProperties[name] = { type: 'string', minLength: 1 };
  }
  const overflowFixture = await analyzeFixture({
    type: 'object', properties: thirteenRequiredProperties,
    required: thirteenRequiredNames, additionalProperties: false,
  });
  assert.equal(overflowFixture.contract.mode, 'unsupported', 'more than 12 required fields demotes');

  for (const [label, name, annotation] of [
    ['secret name password', 'password', {}],
    ['secret name passphrase', 'passphrase', {}],
    ['secret name token', 'api_token', {}],
    ['secret name authorization', 'authorization', {}],
    ['secret name cookie', 'session_cookie', {}],
    ['secret name credential', 'credential', {}],
    ['password format', 'ordinary', { format: 'password' }],
    ['writeOnly annotation', 'ordinary', { writeOnly: true }],
    ['secret annotation', 'ordinary', { secret: true }],
    ['sensitive annotation', 'ordinary', { sensitive: true }],
    ['x-secret annotation', 'ordinary', { 'x-secret': true }],
  ]) {
    const secretFixture = await analyzeFixture({
      type: 'object',
      properties: { [name]: Object.assign({ type: 'string', minLength: 1 }, annotation) },
      required: [name],
      additionalProperties: false,
    });
    assert.equal(secretFixture.contract.mode, 'unsupported', label + ' required field demotes');
    assert.equal(JSON.stringify(secretFixture.contract).includes(name), false,
      label + ' required field name is not projected');
  }

  const closedEnumPattern = await analyzeFixture({
    type: 'object',
    properties: { mode: { type: 'string', enum: ['safe', 'closed'], pattern: '^[a-z]+$' } },
    required: ['mode'],
    additionalProperties: false,
  });
  assert.equal(closedEnumPattern.contract.mode, 'form', 'closed validated enum may carry a source pattern');
  assert.equal(JSON.stringify(closedEnumPattern.contract).includes('pattern'), false,
    'arbitrary regex is never shipped to content');

  const realZillowResolved = resolveInstalled('zillow.search_for_sale', 'https://zillow.com');
  const realZillowAuthority = await authority.normalizeResolvedAuthority(realZillowResolved);
  const realZillowContract = authority.analyzeArgumentSchema(realZillowResolved, realZillowAuthority);
  assert.equal(Object.keys(realZillowAuthority.paramSchema.properties).length, 13,
    'real zillow.search_for_sale retains the complete 13-property schema');
  assert.equal(realZillowContract.mode, 'empty',
    'real Zillow is empty-valid despite 13 optional properties and an optional required object shape');
  assert.deepEqual(realZillowContract.fields, [], 'empty-valid Zillow needs no collector fields');
  const parsedZillow = authority.parseCollectedArguments(realZillowContract, {});
  assert.deepEqual(parsedZillow, { ok: true, args: {} }, 'real Zillow parses an exact empty object');
  assert.equal(capabilityRouter.validateResolvedArgs(realZillowResolved, parsedZillow.args), true,
    'real router validates the Zillow empty object');

  const profilesByKey = new Map(index.profiles.map(function(row) { return [row.profileKey, row]; }));
  const displayedReady = sourceReady.filter(function(row) {
    return row.presentationDisposition === 't1-ready';
  });
  let unjustifiedReady = 0;
  let invalidRepresentative = 0;
  for (const generated of displayedReady) {
    assert.ok(generated.argumentContract && ['empty', 'form'].includes(generated.argumentContract.mode),
      generated.slug + ' displayed Ready has an empty/form argumentContract, never unsupported');
    assert.equal(generated.argumentContract.schemaDigest, generated.executionAuthority.schemaDigest,
      generated.slug + ' argumentContract is bound to full installed schema authority');
    const profile = profilesByKey.get(generated.profileKey);
    const resolved = resolveInstalled(generated.slug, profile && profile.serviceOrigin);
    const raw = representativeSubmission(generated.argumentContract);
    const parsed = authority.parseCollectedArguments(generated.argumentContract, raw);
    if (!parsed.ok) {
      unjustifiedReady += 1;
      invalidRepresentative += 1;
      continue;
    }
    if (!authority.validateCollectedArguments(generated.argumentContract, parsed.args) ||
        !capabilityRouter.validateResolvedArgs(resolved, parsed.args)) {
      unjustifiedReady += 1;
      invalidRepresentative += 1;
    }
  }
  assert.equal(unjustifiedReady, 0, 'zero Ready + unsupported or otherwise unjustified controls');
  assert.equal(invalidRepresentative, 0,
    'zero displayed Ready rows fail a deterministic test-only representative submission');
  assert.equal(displayedReady.length + sourceReady.filter(function(row) {
    return row.presentationDisposition !== 't1-ready';
  }).length, 1285, 'actionable and honest static rows partition every source Ready row');
  assert.deepEqual(displayedReady.filter(function(row) {
    return row.sideEffectClass !== 'read';
  }).map(function(row) { return row.slug; }).sort(), READY_WRITE_SLUGS,
  'exactly five reviewed write controls become visually Ready after consequence compatibility is proven');

  const sourceReadyWrites = sourceReady.filter(function(row) { return row.sideEffectClass !== 'read'; });
  assert.equal(sourceReadyWrites.length, 5, 'the exact 5 write set remains visible as static source evidence');
  for (const row of sourceReadyWrites) {
    assert.equal(row.argumentContract.mode, 'form', row.slug + ' write schema remains collectable for Plan 10');
    assert.equal(row.presentationDisposition, 't1-ready', row.slug + ' is Ready only after exact consequence compatibility');
    assert.equal(row.executionEnabled, true, row.slug + ' is enabled after consequence compatibility');
    assert.equal(row.invocable, true, row.slug + ' is selectable after consequence compatibility');
    assert.equal(row.actionabilityReason, null, row.slug + ' has no static actionability reason');
    assert.equal(row.consequenceCompatible, true, row.slug + ' carries exact compatibility');
    assert.match(row.consequenceDigest, /^sha256:[0-9a-f]{64}$/,
      row.slug + ' carries a canonical consequenceDigest');
    assert.ok(row.consequenceContract && Object.isFrozen(row.consequenceContract),
      row.slug + ' retains the frozen background-full consequence contract');
    assert.deepEqual(row.acceptedConsequenceFields,
      row.argumentContract.fields.map(function(field) { return field.name; }).sort(),
    row.slug + ' trusted roles exactly cover every effective accepted collector field');
    assert.deepEqual(row.excludedConsequenceFields, [],
      row.slug + ' excludes none of the reviewed safe scalar fields');
  }

  const createPage = sourceReadyWrites.find(function(row) { return row.slug === 'notion.create_page'; });
  const updatePage = sourceReadyWrites.find(function(row) { return row.slug === 'notion.update_page'; });
  assert.deepEqual(createPage.acceptedConsequenceFields,
    ['content', 'icon', 'parent_page_id', 'title'],
  'create_page covers title plus parent_page_id, icon, and content');
  assert.deepEqual(updatePage.acceptedConsequenceFields,
    ['cover', 'icon', 'page_id', 'title'],
  'update_page covers page_id plus title, icon, and cover');

  for (const row of sourceReadyWrites) {
    const rawContract = consequenceTargets.getContract(row.slug);
    assert.ok(rawContract, row.slug + ' has one trusted per-slug consequence contract');
    const compiled = authority.compileConsequenceContract(
      row.slug,
      rawContract,
      row.executionAuthority,
      row.argumentContract
    );
    assert.equal(compiled.compatible, true, row.slug + ' trusted consequence contract compiles');
    assert.equal(compiled.reason, null, row.slug + ' has no consequence compatibility failure');
    assert.deepEqual(compiled.acceptedConsequenceFields, row.acceptedConsequenceFields,
      row.slug + ' generated accepted-field coverage is compiler-derived');
    const parsedAll = authority.parseCollectedArguments(
      compiled.effectiveArgumentContract,
      representativeAllSubmission(compiled.effectiveArgumentContract)
    );
    assert.equal(parsedAll.ok, true, row.slug + ' all accepted fields parse through Plan 09');
    const materialized = authority.materializeConsequence(compiled, parsedAll.args);
    assert.ok(materialized, row.slug + ' all accepted fields materialize');
    assert.deepEqual(materialized.renderedFields, Object.keys(parsedAll.args).sort(),
      row.slug + ' supplied and renderedFields sets are exactly equal');
    assert.ok(materialized.parameterSummary.length <= 1024,
      row.slug + ' complete parameterSummary stays within the reviewed render bound');
  }

  const weakenedCoverContract = clone(consequenceTargets.getContract('notion.update_page'));
  weakenedCoverContract.materialRoles = weakenedCoverContract.materialRoles.filter(function(role) {
    return role.field !== 'cover';
  });
  const weakenedCover = authority.compileConsequenceContract(
    updatePage.slug,
    weakenedCoverContract,
    updatePage.executionAuthority,
    updatePage.argumentContract
  );
  assert.equal(weakenedCover.compatible, false,
    'weakened contract that omits accepted update_page.cover is incompatible');
  assert.equal(weakenedCover.reason, 'accepted-field-unregistered',
    'missing supplied cover role reports accepted-field-unregistered');

  const reviewedCoverExclusion = clone(weakenedCoverContract);
  reviewedCoverExclusion.excludedFromCollection = ['cover'];
  const excludedCover = authority.compileConsequenceContract(
    updatePage.slug,
    reviewedCoverExclusion,
    updatePage.executionAuthority,
    updatePage.argumentContract
  );
  assert.equal(excludedCover.compatible, true,
    'reviewed optional cover exclusion removes the field before Ready');
  assert.deepEqual(excludedCover.acceptedConsequenceFields, ['icon', 'page_id', 'title'],
    'effective accepted fields omit reviewed excluded cover');
  assert.deepEqual(excludedCover.excludedConsequenceFields, ['cover'],
    'reviewed excluded cover remains explicit metadata');

  const invalidRequiredExclusion = clone(consequenceTargets.getContract('notion.update_page'));
  invalidRequiredExclusion.excludedFromCollection = ['page_id'];
  const requiredExcluded = authority.compileConsequenceContract(
    updatePage.slug,
    invalidRequiredExclusion,
    updatePage.executionAuthority,
    updatePage.argumentContract
  );
  assert.equal(requiredExcluded.compatible, false, 'required target field cannot be excluded');
  assert.equal(requiredExcluded.reason, 'exclusion-invalid');

  const notionPairs = index.profiles.filter(function(row) { return row.appStem === 'notion'; });
  assert.deepEqual(notionPairs.map(function(row) { return row.service; }).sort(),
    ['app.notion.com', 'notion.so'], 'Notion services remain distinct');
  const slackPairs = index.profiles.filter(function(row) { return row.appStem === 'slack'; });
  assert.deepEqual(slackPairs.map(function(row) { return row.service; }).sort(),
    ['app.slack.com', 'slack.com'], 'Slack services remain distinct');
  const atlassian = index.serviceProfiles.find(function(row) { return row.service === 'atlassian.net'; });
  assert.equal(atlassian.profileDisposition, 'ambiguous-stem',
    'Jira and Confluence sharing atlassian.net fail quiet instead of merging');
  assert.deepEqual(atlassian.appStems, ['confluence', 'jira'],
    'ambiguous service records both distinct app stems');

  const dispositionRows = [
    [{ readiness: 't1-ready', surfaceStatus: 'guarded-fail-closed', executionEnabled: true }, 'guarded-fail-closed'],
    [{ readiness: 't1-ready', surfaceStatus: 'blocked', executionEnabled: true }, 'blocked'],
    [{ readiness: 't1-ready', surfaceStatus: 'bridge-needed', executionEnabled: true }, 'bridge-needed'],
    [{ readiness: 't1-ready', surfaceStatus: 'uat-needed', executionEnabled: true }, 'uat-needed'],
    [{ readiness: 'learn-pending', surfaceStatus: 'degraded-discovery-pending', executionEnabled: true }, 'learn-pending'],
    [{ readiness: 'discovery-pending', surfaceStatus: 'degraded-discovery-pending', executionEnabled: false }, 'degraded'],
    [{ readiness: 'discovery-pending', surfaceStatus: 't1-ready', executionEnabled: true }, 'discovery-pending'],
    [{ readiness: 't1-ready', surfaceStatus: 't1-ready', executionEnabled: true }, 't1-ready'],
    [{ readiness: 'unknown', surfaceStatus: 't1-ready', executionEnabled: true }, 'unsupported'],
  ];
  for (const [row, expected] of dispositionRows) {
    assert.equal(generator.presentationDispositionFor(row), expected,
      'presentationDisposition preserves ' + expected);
  }
  assert.deepEqual(new Set(dispositionRows.map(function(entry) { return entry[1]; })), new Set([
    't1-ready',
    'guarded-fail-closed',
    'blocked',
    'bridge-needed',
    'uat-needed',
    'learn-pending',
    'discovery-pending',
    'degraded',
    'unsupported',
  ]), 'all nine presentation dispositions have an oracle row');

  for (const [label, row] of [
    ['missing evidence', {}],
    ['missing row', null],
    ['unknown source state', { readiness: 'invented', surfaceStatus: 't1-ready', executionEnabled: true }],
    ['contradictory ready evidence', { readiness: 't1-ready', surfaceStatus: 't1-ready', executionEnabled: false }],
    ['contradictory terminal state', { readiness: 't1-ready', surfaceStatus: 'degraded-discovery-pending', executionEnabled: true }],
    ['forged booleans', { readiness: 'blocked', surfaceStatus: 'mystery', executionEnabled: true, invocable: true }],
  ]) {
    assert.equal(generator.presentationDispositionFor(row), 'unsupported', label + ' fails closed');
  }

  const forgedTerminalReport = clone(terminalReport);
  const forgedSource = forgedTerminalReport.rows[0];
  forgedSource.readiness = 'blocked';
  forgedSource.surfaceStatus = 'blocked';
  forgedSource.executionEnabled = true;
  forgedSource.invocable = true;
  const forgedIndex = generator.buildSkopeoProfileIndex({
    descriptors,
    terminalReport: forgedTerminalReport,
    authoredRegistry,
  });
  const forgedCapability = forgedIndex.capabilities.find(function(row) { return row.slug === forgedSource.slug; });
  assert.equal(forgedCapability.presentationDisposition, 'blocked', 'terminal blocked evidence wins precedence');
  assert.equal(forgedCapability.executionEnabled, false, 'source executionEnabled cannot be forged');
  assert.equal(forgedCapability.invocable, false, 'source invocable cannot be forged');

  function expectFailure(label, mutate, pattern) {
    const candidate = clone(index);
    mutate(candidate);
    const result = verifier.verifySkopeoProfileCoverage({
      descriptors,
      terminalReport,
      authoredRegistry,
      index: candidate,
      rendered: generator.renderSkopeoProfileIndex(candidate),
    });
    assert.equal(result.ok, false, label + ' mutation should fail');
    assert.match(failureText(result), pattern, label + ' mutation has a specific diagnostic');
  }

  expectFailure('missing', function(candidate) {
    candidate.capabilities.pop();
  }, /missing/i);

  expectFailure('stale', function(candidate) {
    const stale = clone(candidate.capabilities[0]);
    stale.slug = 'stale.capability';
    candidate.capabilities.push(stale);
  }, /stale/i);

  expectFailure('duplicate', function(candidate) {
    candidate.capabilities.push(clone(candidate.capabilities[0]));
  }, /duplicate/i);

  expectFailure('ambiguous origin', function(candidate) {
    const source = candidate.profiles.find(function(row) {
      return row.profileKey === 'notion@notion.so';
    });
    source.admittedPageOrigins.push('https://app.notion.com');
    source.admittedPageOrigins.sort();
  }, /admitted|origin collision|origin.*mismatch/i);

  expectFailure('substring origin', function(candidate) {
    const source = candidate.serviceProfiles.find(function(row) { return row.service === 'docs.google.com'; });
    source.serviceOrigin = 'https://docs.google.com.evil.example';
  }, /service profile|origin mismatch|substring/i);

  expectFailure('nondeterministic order', function(candidate) {
    candidate.capabilities.reverse();
  }, /determin|order/i);

  expectFailure('duplicate service disposition', function(candidate) {
    candidate.serviceProfiles.push(clone(candidate.serviceProfiles[0]));
  }, /duplicate/i);

  expectFailure('execution origin authority', function(candidate) {
    const row = candidate.capabilities.find(function(capability) {
      return capability.slug === 'airbnb.get_current_user';
    });
    row.executionAuthority.executionOrigin = 'https://airbnb.com';
  }, /authority|execution origin|origin mismatch/i);

  const descriptorMutation = clone(descriptors);
  const mutatedZillow = descriptorMutation.find(function(row) {
    return row.slug === 'zillow.search_for_sale';
  });
  mutatedZillow.params.properties.sort.description = 'forged descriptor schema';
  const descriptorMutationResult = verifier.verifySkopeoProfileCoverage({
    descriptors: descriptorMutation,
    terminalReport,
    authoredRegistry,
    index,
    rendered,
  });
  assert.equal(descriptorMutationResult.ok, false,
    'descriptor schema mutation cannot redefine installed handler authority');
  assert.match(failureText(descriptorMutationResult), /catalog|descriptor|schema|authority/i,
    'descriptor schema mutation has a specific authority diagnostic');

  console.log('skopeo-profile-coverage: PASS (' +
    descriptorSet.size + ' descriptors; ' + stemSet.size + ' stems; ' + serviceSet.size + ' services)');
}

main().catch(function(err) {
  console.error('skopeo-profile-coverage: FAIL');
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
