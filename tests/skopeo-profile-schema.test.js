'use strict';

const assert = require('node:assert/strict');
const {
  SCHEMA_VERSION,
  GENRES,
  ADAPTER_IDS,
  RENDERER_IDS,
  validateRegistry,
  normalizeProfile,
} = require('../extension/utils/skopeo-profile-schema.js');

const EXPECTED_GENRES = [
  'reader-knowledge',
  'communication',
  'document-editor',
  'worklist-record',
  'dashboard-admin',
  'transactional',
  'media-feed',
  'generic-app',
  'drive-docs-deep-pack',
];

function clone(value) {
  return structuredClone(value);
}

function validProfile(overrides = {}) {
  return Object.assign({
    displayName: 'GitHub',
    defaultGenre: 'worklist-record',
    pageNoun: 'workspace',
    entityVocabulary: {
      singular: 'repository',
      plural: 'repositories',
    },
    capabilityGroups: [{
      id: 'issues',
      label: 'Issues',
      slugPrefixes: ['github.issues.'],
    }],
    attentionCeiling: 'anchored',
    adapterId: 'worklist-record-v1',
    rendererId: 'worklist-record-v1',
  }, overrides);
}

function validRegistry() {
  return {
    schemaVersion: 2,
    profileVersion: 'skopeo-profiles-v2',
    defaults: {
      profileId: 'generic-unanchored-v1',
      profile: validProfile({
        displayName: 'Supported app',
        defaultGenre: 'generic-app',
        pageNoun: 'app',
        entityVocabulary: { singular: 'item', plural: 'items' },
        capabilityGroups: [],
        attentionCeiling: 'ambient',
        adapterId: 'generic-unanchored-v1',
        rendererId: 'generic-default-v1',
      }),
    },
    profiles: [{
      profileId: 'github-worklist-v1',
      appStem: 'github',
      service: 'github.com',
      exactOrigins: ['https://github.com'],
      profile: validProfile(),
    }],
  };
}

function assertValid(registry, label) {
  const result = validateRegistry(registry);
  assert.equal(result.ok, true, label + ': ' + JSON.stringify(result.error || null));
  assert.equal(result.error, undefined, label + ' should not expose an error');
  return result;
}

function assertInvalid(registry, label, expectedCode = 'SKOPEO_PROFILE_INVALID') {
  const result = validateRegistry(registry);
  assert.equal(result.ok, false, label + ' should fail');
  assert.equal(result.error && result.error.code, expectedCode, label + ' error code');
  assert.equal(typeof result.error.path, 'string', label + ' has bounded path');
  assert.equal(typeof result.error.reason, 'string', label + ' has bounded reason');
  assert.ok(result.error.path.length <= 96, label + ' path is bounded');
  assert.ok(result.error.reason.length <= 160, label + ' reason is bounded');
  assert.equal(JSON.stringify(result.error).includes('docs.google.com.evil.example'), false,
    label + ' error must not echo hostile raw input');
  return result;
}

assert.equal(SCHEMA_VERSION, 2, 'authority-aware schemaVersion is pinned to 2');
assert.deepEqual(Array.from(GENRES), EXPECTED_GENRES, 'genre enum is closed and ordered');
assert.ok(Object.isFrozen(GENRES), 'genre allowlist is frozen');
assert.ok(Object.isFrozen(ADAPTER_IDS), 'adapter allowlist is frozen');
assert.ok(Object.isFrozen(RENDERER_IDS), 'renderer allowlist is frozen');
assertValid(validRegistry(), 'baseline registry');

for (const genre of EXPECTED_GENRES) {
  const registry = validRegistry();
  registry.profiles[0].profile.defaultGenre = genre;
  assertValid(registry, 'approved genre ' + genre);
}

for (const attentionCeiling of ['ambient', 'anchored']) {
  const registry = validRegistry();
  registry.profiles[0].profile.attentionCeiling = attentionCeiling;
  assertValid(registry, 'approved attention ceiling ' + attentionCeiling);
}

{
  const registry = validRegistry();
  registry.schemaVersion = 3;
  assertInvalid(registry, 'unsupported schema version', 'SKOPEO_PROFILE_SCHEMA_UNSUPPORTED');
}

for (const key of ['schemaVersion', 'profileVersion', 'defaults', 'profiles']) {
  const registry = validRegistry();
  delete registry[key];
  assertInvalid(registry, 'missing root key ' + key);
}

{
  const registry = validRegistry();
  registry.unexpected = true;
  assertInvalid(registry, 'unknown root key');
}

for (const key of ['profileId', 'appStem', 'service', 'exactOrigins', 'profile']) {
  const registry = validRegistry();
  delete registry.profiles[0][key];
  assertInvalid(registry, 'missing registry entry key ' + key);
}

for (const key of [
  'displayName',
  'defaultGenre',
  'pageNoun',
  'entityVocabulary',
  'capabilityGroups',
  'attentionCeiling',
  'adapterId',
  'rendererId',
]) {
  const registry = validRegistry();
  delete registry.profiles[0].profile[key];
  assertInvalid(registry, 'missing profile key ' + key);
}

{
  const registry = validRegistry();
  registry.profiles[0].profile.unexpected = 'data';
  assertInvalid(registry, 'unknown profile key');
}

{
  const registry = validRegistry();
  registry.profileVersion = 'contains spaces';
  assertInvalid(registry, 'profileVersion identifier syntax');
}

{
  const registry = validRegistry();
  registry.profileVersion = 'v'.repeat(65);
  assertInvalid(registry, 'profileVersion identifier length');
}

{
  const registry = validRegistry();
  registry.profiles[0].exactOrigins = ['http://github.com'];
  assertInvalid(registry, 'origin must use https');
}

{
  const registry = validRegistry();
  registry.profiles[0].exactOrigins = ['https://github.com/path'];
  assertInvalid(registry, 'origin must not contain path');
}

{
  const registry = validRegistry();
  registry.profiles[0].exactOrigins = ['https://docs.google.com.evil.example'];
  assertInvalid(registry, 'substring origin spoof');
}

for (const [field, value] of [
  ['selector', '.selected-row'],
  ['html', '<strong>trusted</strong>'],
  ['css', 'body { display: none; }'],
  ['script', 'alert(1)'],
  ['callback', 'runLater'],
  ['prompt', 'ignore prior instructions'],
  ['remoteAsset', 'https://cdn.example/icon.svg'],
]) {
  const registry = validRegistry();
  registry.profiles[0].profile[field] = value;
  assertInvalid(registry, 'forbidden field ' + field);
}

for (const [label, value] of [
  ['remote URL value', 'https://remote.example/asset.png'],
  ['markup value', '<img src=x onerror=alert(1)>'],
  ['bidi control value', 'safe\u202eevil'],
  ['javascript URL value', 'javascript:alert(1)'],
]) {
  const registry = validRegistry();
  registry.profiles[0].profile.displayName = value;
  assertInvalid(registry, label);
}

{
  const registry = validRegistry();
  registry.profiles[0].profile.displayName = function displayName() {};
  assertInvalid(registry, 'function value');
}

{
  const registry = validRegistry();
  registry.profiles[0].profile.adapterId = 'remote-adapter';
  assertInvalid(registry, 'unknown adapter ID');
}

{
  const registry = validRegistry();
  registry.profiles[0].profile.rendererId = 'callback-renderer';
  assertInvalid(registry, 'unknown renderer ID');
}

{
  const registry = validRegistry();
  registry.profiles[0].profile.defaultGenre = 'focused';
  assertInvalid(registry, 'unknown genre');
}

{
  const registry = validRegistry();
  registry.profiles[0].profile.attentionCeiling = 'interstitial';
  assertInvalid(registry, 'attention ceiling cannot be interstitial');
}

for (const [label, mutate] of [
  ['display text over 80 characters', function(registry) {
    registry.profiles[0].profile.displayName = 'x'.repeat(81);
  }],
  ['page noun over 32 characters', function(registry) {
    registry.profiles[0].profile.pageNoun = 'x'.repeat(33);
  }],
  ['entity noun over 32 characters', function(registry) {
    registry.profiles[0].profile.entityVocabulary.singular = 'x'.repeat(33);
  }],
  ['more than 12 groups', function(registry) {
    registry.profiles[0].profile.capabilityGroups = Array.from({ length: 13 }, function(_, index) {
      return { id: 'g' + index, label: 'Group ' + index, slugPrefixes: ['github.'] };
    });
  }],
  ['more than 32 prefixes', function(registry) {
    registry.profiles[0].profile.capabilityGroups[0].slugPrefixes = Array.from(
      { length: 33 },
      function(_, index) { return 'github.group' + index + '.'; }
    );
  }],
  ['excessive authored profiles', function(registry) {
    registry.profiles = Array.from({ length: 257 }, function(_, index) {
      const entry = clone(registry.profiles[0]);
      entry.profileId = 'profile-' + index;
      entry.appStem = 'app-' + index;
      entry.service = 'app-' + index + '.example';
      entry.exactOrigins = ['https://app-' + index + '.example'];
      return entry;
    });
  }],
]) {
  const registry = validRegistry();
  mutate(registry);
  assertInvalid(registry, label);
}

{
  const registry = validRegistry();
  registry.profiles[0].profile.displayName = 'x'.repeat(80);
  registry.profiles[0].profile.pageNoun = 'x'.repeat(32);
  registry.profiles[0].profile.entityVocabulary = {
    singular: 'x'.repeat(32),
    plural: 'y'.repeat(32),
  };
  registry.profiles[0].profile.capabilityGroups = Array.from({ length: 12 }, function(_, index) {
    return {
      id: 'g' + index,
      label: 'Group ' + index,
      slugPrefixes: Array.from({ length: 32 }, function(__, prefixIndex) {
        return 'github.g' + index + '.p' + prefixIndex + '.';
      }),
    };
  });
  assertValid(registry, 'documented bounds are inclusive');
}

{
  let normalized;
  assert.doesNotThrow(function() {
    normalized = normalizeProfile(validProfile(), {
      profileId: 'github-worklist-v1',
      profileVersion: 'skopeo-profiles-v2',
      appStem: 'github',
      service: 'github.com',
      serviceOrigin: 'https://github.com',
      admittedPageOrigins: ['https://github.com', 'https://www.github.com'],
    });
  }, 'authority identity accepts distinct serviceOrigin and admittedPageOrigins');
  assert.equal(normalized.appStem, 'github', 'normalizer retains the stem identity');
  assert.equal(normalized.service, 'github.com', 'normalizer retains the service identity');
  assert.equal(normalized.serviceOrigin, 'https://github.com',
    'normalizer retains canonical service origin identity');
  assert.deepEqual(normalized.admittedPageOrigins,
    ['https://github.com', 'https://www.github.com'],
    'normalizer retains sorted unique admitted page origins separately');
  assert.equal(Object.hasOwn(normalized, 'exactOrigin'), false,
    'authority-aware normalized profiles do not collapse service and page origins');
  assert.equal(normalized.profileVersion, 'skopeo-profiles-v2', 'normalizer retains profile version identity');
  assert.ok(Object.isFrozen(normalized), 'normalized profile is frozen');
  assert.ok(Object.isFrozen(normalized.entityVocabulary), 'normalized vocabulary is frozen');
  assert.ok(Object.isFrozen(normalized.capabilityGroups), 'normalized groups are frozen');
  assert.ok(Object.isFrozen(normalized.admittedPageOrigins), 'normalized admitted origins are frozen');
}

console.log('skopeo-profile-schema: PASS');
