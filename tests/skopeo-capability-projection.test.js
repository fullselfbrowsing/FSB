'use strict';

const assert = require('node:assert/strict');

const profileIndex = require('../extension/catalog/skopeo-profile-index.generated.js');
const projector = require('../extension/utils/skopeo-capability-projector.js');
const authority = require('../extension/utils/skopeo-action-authority.js');

const ARGUMENT_FIELD_KEYS = Object.freeze([
  'name', 'label', 'kind', 'required', 'choices',
  'minLength', 'maxLength', 'minimum', 'maximum',
]);

const OWNERSHIP_KEYS = Object.freeze([
  'appStem',
  'catalogVersion',
  'exactOrigin',
  'generation',
  'profileId',
  'profileVersion',
  'service',
  'tabId',
]);

const READINESS_VALUES = Object.freeze([
  't1-ready',
  'guarded-fail-closed',
  'blocked',
  'bridge-needed',
  'uat-needed',
  'learn-pending',
  'discovery-pending',
  'degraded',
  'unsupported',
]);

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function assertDeepFrozen(value, path = 'projection') {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, path + ' is frozen');
  for (const [key, child] of Object.entries(value)) {
    assertDeepFrozen(child, path + '.' + key);
  }
}

function rowsOf(projection) {
  return projection.capabilityGroups.flatMap(function (group) {
    return group.capabilities;
  });
}

function ownershipOf(projection) {
  return Object.fromEntries(OWNERSHIP_KEYS.map(function (key) {
    return [key, projection[key]];
  }));
}

function assertBoundedFailure(result, expectedStatus) {
  assert.equal(result && result.status, expectedStatus);
  assert.deepEqual(Object.keys(result).sort(), ['reason', 'status']);
  assert.match(result.reason, /^[a-z][a-z0-9-]{0,47}$/);
  assert.equal(projector.validateProjection(result), false);
  assertDeepFrozen(result, 'failure');
}

function project(url, tabId = 17, generation = 3, index = profileIndex) {
  return projector.createProjection({ tabId, generation, url }, index);
}

function mutatedProjection(url, mutate) {
  const candidate = clone(profileIndex);
  mutate(candidate);
  return project(url, 17, 3, candidate);
}

function capabilityFor(index, slug) {
  const capability = index.capabilities.find(function (row) { return row.slug === slug; });
  assert.ok(capability, 'fixture capability exists: ' + slug);
  return capability;
}

function profileFor(index, appStem) {
  const profile = index.profiles.find(function (row) { return row.appStem === appStem; });
  assert.ok(profile, 'fixture profile exists: ' + appStem);
  return profile;
}

function main() {
  assert.deepEqual(Object.values(projector.STATUS).sort(),
    ['invalid', 'recognized', 'unsupported']);
  assert.deepEqual(Object.values(projector.READINESS).sort(), READINESS_VALUES.slice().sort());
  assert.equal(Object.isFrozen(projector.STATUS), true);
  assert.equal(Object.isFrozen(projector.READINESS), true);
  assert.equal(Object.isFrozen(projector), true);
  assert.equal(globalThis.FsbSkopeoCapabilityProjector, projector,
    'classic-script and CommonJS consumers share the same projector');

  const docs = project('https://docs.google.com/document/d/fixture?mode=edit#heading=h.1');
  assert.equal(docs.status, 'recognized');
  assert.equal(projector.validateProjection(docs), true);
  assert.deepEqual(ownershipOf(docs), {
    tabId: 17,
    generation: 3,
    exactOrigin: 'https://docs.google.com',
    service: 'docs.google.com',
    appStem: 'gdocs',
    profileId: 'docs-deep-pack-v1',
    profileVersion: profileIndex.profileVersion,
    catalogVersion: profileIndex.catalogVersion,
  });
  assert.deepEqual(Object.keys(ownershipOf(docs)).sort(), OWNERSHIP_KEYS.slice().sort());
  assert.equal(docs.profile.displayName, 'Google Docs');
  assert.equal(docs.profile.defaultGenre, 'drive-docs-deep-pack');
  assert.equal(docs.profile.adapterId, 'drive-docs-deep-pack-v1');
  assert.equal(docs.profile.rendererId, 'drive-docs-deep-pack-v1');
  assertDeepFrozen(docs);

  const docsRows = rowsOf(docs);
  assert.ok(docsRows.length > 0);
  assert.ok(docsRows.every(function (row) { return row.slug.startsWith('gdocs.'); }),
    'projection contains current-service slugs only');
  assert.equal(docsRows.some(function (row) { return row.slug.startsWith('netflix.'); }), false,
    'foreign-service slugs never cross the projection boundary');
  assert.ok(docs.capabilityGroups.length <= 12, 'group bound is enforced');
  assert.ok(docs.capabilityGroups.every(function (group) {
    return group.capabilities.length <= 256 && group.id.length <= 48 && group.label.length <= 80;
  }), 'group labels and capability counts are bounded');
  assert.ok(docsRows.every(function (row) {
    return row.actionLabel.length <= 80 &&
      row.paramSummary.required.length + row.paramSummary.optional.length <= 12;
  }), 'labels and parameter summaries are bounded');
  assert.ok(docsRows.every(function (row) {
    const contract = row.argumentContract;
    return contract && ['empty', 'form', 'unsupported'].includes(contract.mode) &&
      contract.fields.length <= 12 && contract.fields.every(function(field) {
        return JSON.stringify(Reflect.ownKeys(field).sort()) ===
          JSON.stringify(ARGUMENT_FIELD_KEYS.slice().sort());
      });
  }), 'every projected row has one bounded closed argumentContract');
  assert.ok(docsRows.every(function (row) {
    return Object.hasOwn(row, 'paramSchema') === false &&
      Object.hasOwn(row, 'executionAuthority') === false &&
      Object.hasOwn(row, 'consequenceContract') === false &&
      Object.hasOwn(row, 'targetRoles') === false &&
      Object.hasOwn(row, 'materialRoles') === false &&
      ((row.executionOrigin === null && row.schemaDigest === null) ||
        (typeof row.executionOrigin === 'string' && /^sha256:[0-9a-f]{64}$/.test(row.schemaDigest)));
  }), 'content capabilities expose bounded digests/compatibility but no schema, full authority, or trusted role metadata');
  const projectedContractJson = JSON.stringify(docsRows.map(function(row) { return row.argumentContract; }));
  for (const forbidden of ['"default"', '"examples"', '"placeholder"', '"value"', '"pattern"', '"description"']) {
    assert.equal(projectedContractJson.includes(forbidden), false,
      forbidden + ' cannot cross the bounded projection boundary');
  }

  const serialized = JSON.stringify(docs);
  assert.equal(serialized.includes('netflix.add_to_my_list'), false);
  assert.equal(serialized.includes('exactOriginIndex'), false);
  assert.equal(serialized.includes('serviceProfiles'), false);
  assert.equal(Object.hasOwn(docs, 'capabilities'), false, 'full catalog array is absent');
  assert.ok(serialized.length < JSON.stringify(profileIndex).length / 10,
    'recognized projection serializes to a small current-service slice');

  const calendar = project('https://calendar.google.com/calendar/u/0/r');
  assert.equal(calendar.status, 'recognized');
  const createEvent = rowsOf(calendar).find(function (row) {
    return row.slug === 'gcal.create_event';
  });
  assert.ok(createEvent, 'calendar projection contains create_event');
  assert.equal(createEvent.paramSummary.required.includes('summary'), true,
    'required params survive optional-summary bounding');
  assert.equal(createEvent.paramSummary.required.length + createEvent.paramSummary.optional.length, 12);
  assert.ok(createEvent.paramSummary.count >= 12,
    'bounded parameter display retains the full property count');
  assert.equal(createEvent.paramSummary.truncated,
    createEvent.paramSummary.count > createEvent.paramSummary.required.length + createEvent.paramSummary.optional.length,
  'paramSummary truncated flag exactly reports omitted property names');

  const zillow = project('https://www.zillow.com/homes/');
  assert.equal(zillow.status, 'recognized', 'installed Zillow www origin is admitted');
  const zillowSale = rowsOf(zillow).find(function(row) {
    return row.slug === 'zillow.search_for_sale';
  });
  assert.ok(zillowSale, 'real Zillow search_for_sale authority is projected');
  assert.equal(zillowSale.paramSummary.count, 13,
    'real Zillow paramSummary retains the full thirteenth-property count');
  assert.equal(zillowSale.paramSummary.required.length + zillowSale.paramSummary.optional.length, 12,
    'real Zillow paramSummary shows only the bounded first 12 names');
  assert.equal(zillowSale.paramSummary.truncated, true,
    'real Zillow thirteenth property reports truncated:true');
  assert.equal(zillowSale.argumentContract.mode, 'empty',
    'zillow.search_for_sale stays Ready because the complete 13-property schema accepts {}');
  assert.deepEqual(zillowSale.argumentContract.fields, [],
    'Zillow projects no form fields for the exact empty-valid action');
  assert.equal(zillowSale.argumentContract.schemaDigest, zillowSale.schemaDigest,
    'Zillow projected contract retains the complete schemaDigest beyond the 12-name display');
  assert.deepEqual(authority.parseCollectedArguments(zillowSale.argumentContract, {}),
    { ok: true, args: {} }, 'Zillow empty arguments parse exactly once-ready');
  assert.equal(Object.hasOwn(zillowSale, 'paramSchema'), false,
    'real Zillow content row has no own paramSchema');
  assert.equal(Object.hasOwn(zillowSale, 'executionAuthority'), false,
    'real Zillow content row has no full executionAuthority');

  const notion = project('https://app.notion.com/workspace/fixture');
  assert.equal(notion.status, 'recognized', 'installed Notion execution origin is admitted');
  const notionWrites = rowsOf(notion).filter(function(row) {
    return [
      'notion.create_database',
      'notion.create_database_item',
      'notion.create_page',
      'notion.update_page',
    ].includes(row.slug);
  });
  assert.equal(notionWrites.length, 4, 'all four source Ready Notion writes are projected');
  for (const row of notionWrites) {
    assert.equal(row.argumentContract.mode, 'form', row.slug + ' retains its safe scalar contract');
    assert.equal(row.argumentContract.fields.some(function(field) { return field.name === 'properties'; }), false,
      row.slug + ' omits optional nested properties from the collector');
    assert.equal(row.presentationDisposition, 't1-ready', row.slug + ' is Ready after exact consequence compatibility');
    assert.equal(row.actionabilityReason, null);
    assert.equal(row.consequenceCompatible, true);
    assert.match(row.consequenceDigest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(row.invocable, true);
    assert.equal(Object.hasOwn(row, 'consequenceContract'), false,
      row.slug + ' full trusted consequence contract stays background-only');
  }

  const slack = project('https://app.slack.com/client/T123/C456');
  assert.equal(slack.status, 'recognized', 'installed Slack execution origin is admitted');
  const postMessage = rowsOf(slack).find(function(row) { return row.slug === 'slack.chat.postMessage'; });
  assert.ok(postMessage, 'fifth source Ready write is projected');
  assert.equal(postMessage.argumentContract.mode, 'form');
  assert.deepEqual(postMessage.argumentContract.fields.map(function(field) { return field.name; }),
    ['channel', 'text']);
  assert.equal(postMessage.presentationDisposition, 't1-ready');
  assert.equal(postMessage.actionabilityReason, null);
  assert.equal(postMessage.consequenceCompatible, true);
  assert.match(postMessage.consequenceDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(postMessage.invocable, true);

  const missingConsequence = mutatedProjection('https://app.notion.com/workspace/fixture', function(candidate) {
    const row = capabilityFor(candidate, 'notion.update_page');
    row.consequenceContract = null;
    row.consequenceDigest = null;
    row.consequenceCompatible = false;
    row.acceptedConsequenceFields = [];
    row.excludedConsequenceFields = [];
    row.presentationDisposition = 'unsupported';
    row.actionabilityReason = 'consequence-contract-missing';
    row.executionEnabled = false;
    row.invocable = false;
  });
  assert.equal(missingConsequence.status, 'recognized',
    'source-Ready write without consequence compatibility remains a recognized static row');
  const missingConsequenceRow = rowsOf(missingConsequence).find(function(row) {
    return row.slug === 'notion.update_page';
  });
  assert.equal(missingConsequenceRow.presentationDisposition, 'unsupported');
  assert.equal(missingConsequenceRow.consequenceCompatible, false);
  assert.equal(missingConsequenceRow.consequenceDigest, null);
  assert.equal(missingConsequenceRow.invocable, false,
    'missing consequence digest cannot create an action');

  const forgedProjectedTargetRole = clone(notion);
  const forgedProjectedRow = rowsOf(forgedProjectedTargetRole).find(function(row) {
    return row.slug === 'notion.update_page';
  });
  forgedProjectedRow.targetRoles = [{ field: 'page_id', label: 'Forged target' }];
  assert.equal(projector.validateProjection(forgedProjectedTargetRole), false,
    'content-side target role metadata is not part of the closed projection contract');

  const forgedCompatibility = mutatedProjection('https://app.notion.com/workspace/fixture', function(candidate) {
    const row = capabilityFor(candidate, 'notion.update_page');
    row.consequenceCompatible = true;
    row.consequenceDigest = null;
    row.presentationDisposition = 't1-ready';
    row.actionabilityReason = null;
    row.executionEnabled = true;
    row.invocable = true;
  });
  assertBoundedFailure(forgedCompatibility, 'invalid');

  const exactX = project('https://x.com/home');
  const exactNetflix = project('https://netflix.com/browse');
  assert.equal(exactX.status, 'recognized');
  assert.equal(exactX.service, 'x.com');
  assert.equal(exactNetflix.status, 'recognized');
  assert.equal(exactNetflix.service, 'netflix.com');
  assert.notEqual(exactX.appStem, exactNetflix.appStem,
    'x.com is never admitted through a netflix.com substring');

  const hostileOrigins = [
    ['suffix confusion', 'https://docs.google.com.evil.example/document/d/fixture'],
    ['x.com/netflix.com substring', 'https://netflix.com.evil.example/x.com'],
    ['unexpected port', 'https://docs.google.com:444/document/d/fixture'],
    ['non-HTTPS scheme', 'http://docs.google.com/document/d/fixture'],
    ['credential authority', 'https://credential:secret@docs.google.com/document/d/fixture'],
    ['fragment as authority', 'https://evil.example/#https://docs.google.com'],
    ['unknown origin', 'https://unknown.example/'],
    ['forged Airbnb subdomain', 'https://www.airbnb.com.evil.example/'],
  ];
  for (const [label, url] of hostileOrigins) {
    const failure = project(url);
    assertBoundedFailure(failure, 'unsupported');
    assert.equal(JSON.stringify(failure).includes(url), false, label + ' does not leak the raw URL');
    assert.equal(failure.reason, 'origin-unsupported', label + ' fails exact-origin admission');
  }

  const ambiguous = project('https://atlassian.net/wiki');
  assertBoundedFailure(ambiguous, 'unsupported');
  assert.equal(ambiguous.reason, 'profile-inconsistent');

  const airbnbServiceOrigin = project('https://airbnb.com/');
  assert.equal(airbnbServiceOrigin.status, 'recognized',
    'canonical Airbnb service origin is admitted as the same profile');
  const airbnbServiceReady = rowsOf(airbnbServiceOrigin).find(function(row) {
    return row.slug === 'airbnb.get_current_user';
  });
  assert.ok(airbnbServiceReady, 'Airbnb Ready row is present on the service origin');
  assert.equal(airbnbServiceReady.executionOrigin, 'https://www.airbnb.com',
    'Airbnb keeps installed www execution origin distinct from service origin');
  assert.equal(airbnbServiceReady.executionEnabled, false,
    'service-origin mismatch is projected static');
  assert.equal(airbnbServiceReady.invocable, false,
    'service-origin mismatch is non-invocable');
  assert.equal(airbnbServiceReady.executionBlockReason, 'execution-origin-mismatch',
    'service-origin mismatch carries the explicit execution-origin-mismatch reason');

  const airbnbInstalledOrigin = project('https://www.airbnb.com/');
  assert.equal(airbnbInstalledOrigin.status, 'recognized',
    'installed Airbnb www origin is admitted');
  const airbnbInstalledReady = rowsOf(airbnbInstalledOrigin).find(function(row) {
    return row.slug === 'airbnb.get_current_user';
  });
  assert.equal(airbnbInstalledReady.executionEnabled, true,
    'exact installed execution origin retains Ready actionability');
  assert.equal(airbnbInstalledReady.executionBlockReason, null,
    'matching installed execution origin has no execution block reason');

  const invalidInputs = [
    { tabId: 0, generation: 3, url: 'https://docs.google.com/' },
    { tabId: -1, generation: 3, url: 'https://docs.google.com/' },
    { tabId: 1.5, generation: 3, url: 'https://docs.google.com/' },
    { tabId: Number.MAX_SAFE_INTEGER + 1, generation: 3, url: 'https://docs.google.com/' },
    { tabId: 17, generation: 0, url: 'https://docs.google.com/' },
    { tabId: 17, generation: -1, url: 'https://docs.google.com/' },
    { tabId: 17, generation: 3.5, url: 'https://docs.google.com/' },
    { tabId: 17, generation: Number.MAX_SAFE_INTEGER + 1, url: 'https://docs.google.com/' },
    { tabId: 17, generation: 3, url: 42 },
    { tabId: 17, generation: 3, url: 'https://docs.google.com/', extra: true },
  ];
  for (const input of invalidInputs) {
    assertBoundedFailure(projector.createProjection(input, profileIndex), 'invalid');
  }

  const tabVariant = project('https://docs.google.com/', 18, 3);
  const generationVariant = project('https://docs.google.com/', 17, 4);
  const originVariant = project('https://calendar.google.com/', 17, 3);
  assert.notDeepEqual(ownershipOf(tabVariant), ownershipOf(docs), 'tabId is an independent owner');
  assert.notDeepEqual(ownershipOf(generationVariant), ownershipOf(docs),
    'generation is an independent owner');
  assert.notDeepEqual(ownershipOf(originVariant), ownershipOf(docs),
    'exactOrigin is an independent owner');
  assert.notStrictEqual(project('https://docs.google.com/'), project('https://docs.google.com/'),
    'the pure projector does not cache projections');

  const versionedIndex = clone(profileIndex);
  versionedIndex.profileVersion = 'skopeo-profiles-test-v2';
  versionedIndex.catalogVersion = 'sha256:' + 'a'.repeat(64);
  for (const profile of versionedIndex.profiles) {
    profile.profileVersion = versionedIndex.profileVersion;
    profile.catalogVersion = versionedIndex.catalogVersion;
  }
  const versionVariant = project('https://docs.google.com/', 17, 3, versionedIndex);
  assert.equal(versionVariant.status, 'recognized');
  assert.notEqual(versionVariant.profileVersion, docs.profileVersion,
    'profileVersion is an independent owner');
  assert.notEqual(versionVariant.catalogVersion, docs.catalogVersion,
    'catalogVersion is an independent owner');

  const readinessSeen = new Set();
  for (const origin of ['https://www.airbnb.com/', 'https://airtable.com/', 'https://app.datadoghq.com/',
    'https://netflix.com/', 'https://bestbuy.com/']) {
    const recognized = project(origin);
    assert.equal(recognized.status, 'recognized');
    for (const row of rowsOf(recognized)) {
      readinessSeen.add(row.presentationDisposition);
      const actionable = row.presentationDisposition === 't1-ready' &&
        row.executionOrigin === recognized.exactOrigin && row.sideEffectClass === 'read' &&
        ['empty', 'form'].includes(row.argumentContract.mode);
      assert.equal(row.executionEnabled, actionable,
        row.presentationDisposition + ' executionEnabled requires read actionability plus exact execution origin');
      assert.equal(row.invocable, actionable,
        row.presentationDisposition + ' invocable requires read actionability plus exact execution origin');
    }
  }
  for (const disposition of ['guarded-fail-closed', 'blocked', 'bridge-needed', 'uat-needed', 'degraded']) {
    assert.equal(readinessSeen.has(disposition), true, disposition + ' has a generated static oracle row');
  }
  assert.notEqual(projector.READINESS.LEARN_PENDING, projector.READINESS.DISCOVERY_PENDING,
    'learn-pending and discovery-pending remain distinct dispositions');

  const unknownDisposition = mutatedProjection('https://airbnb.com/', function (index) {
    capabilityFor(index, 'airbnb.get_current_user').presentationDisposition = 'nearly-ready';
  });
  assertBoundedFailure(unknownDisposition, 'invalid');

  const terminalMismatch = mutatedProjection('https://netflix.com/', function (index) {
    capabilityFor(index, 'netflix.add_to_my_list').sourceTerminalState = 't1-ready';
  });
  assertBoundedFailure(terminalMismatch, 'invalid');

  const profilePairMismatch = mutatedProjection('https://docs.google.com/', function (index) {
    const forgedKey = 'evil@docs.google.com';
    index.admittedOriginIndex.find(function (row) {
      return row.admittedOrigin === 'https://docs.google.com';
    }).profileKeys = [forgedKey];
    profileFor(index, 'gdocs').profileKey = forgedKey;
    for (const row of index.capabilities) {
      if (row.appStem === 'gdocs') row.profileKey = forgedKey;
    }
  });
  assertBoundedFailure(profilePairMismatch, 'invalid');

  const forgedReady = mutatedProjection('https://netflix.com/', function (index) {
    const row = capabilityFor(index, 'netflix.add_to_my_list');
    row.presentationDisposition = 't1-ready';
    row.executionEnabled = true;
    row.invocable = true;
  });
  assertBoundedFailure(forgedReady, 'invalid');

  const forgedActionable = mutatedProjection('https://netflix.com/', function (index) {
    const row = capabilityFor(index, 'netflix.add_to_my_list');
    row.executionEnabled = true;
    row.invocable = true;
  });
  assertBoundedFailure(forgedActionable, 'invalid');

  const crossProfileExecutionOrigin = mutatedProjection('https://www.airbnb.com/', function(index) {
    capabilityFor(index, 'airbnb.get_current_user').executionAuthority.executionOrigin =
      'https://www.zillow.com';
  });
  assertBoundedFailure(crossProfileExecutionOrigin, 'invalid');

  const executionOriginMutation = mutatedProjection('https://www.zillow.com/', function(index) {
    capabilityFor(index, 'zillow.search_for_sale').executionAuthority.executionOrigin =
      'https://zillow.com';
  });
  assert.equal(executionOriginMutation.status, 'recognized',
    'same-profile execution-origin mutation fails quiet as a recognized static projection');
  const mutatedZillowRow = rowsOf(executionOriginMutation).find(function(row) {
    return row.slug === 'zillow.search_for_sale';
  });
  assert.equal(mutatedZillowRow.invocable, false,
    'execution-origin mutation cannot remain invocable');
  assert.equal(mutatedZillowRow.executionBlockReason, 'execution-origin-mismatch',
    'execution-origin mutation carries the explicit mismatch reason');

  for (const collapsed of ['learn-pending', 'discovery-pending']) {
    const failure = mutatedProjection('https://bestbuy.com/', function (index) {
      const row = capabilityFor(index, 'bestbuy.get_cart');
      row.presentationDisposition = collapsed;
    });
    assertBoundedFailure(failure, 'invalid');
  }

  const tooManyGroups = mutatedProjection('https://docs.google.com/', function (index) {
    profileFor(index, 'gdocs').capabilityGroups = Array.from({ length: 13 }, function (_, offset) {
      return { id: 'group-' + offset, label: 'Group ' + offset, slugPrefixes: ['gdocs.group' + offset + '.'] };
    });
  });
  assertBoundedFailure(tooManyGroups, 'invalid');

  const tooManyCapabilities = mutatedProjection('https://docs.google.com/', function (index) {
    profileFor(index, 'gdocs').capabilitySlugs = Array.from({ length: 257 }, function (_, offset) {
      return 'gdocs.synthetic_' + offset;
    });
  });
  assertBoundedFailure(tooManyCapabilities, 'invalid');

  const requiredParamOverflow = mutatedProjection('https://calendar.google.com/', function (index) {
    const row = capabilityFor(index, 'gcal.create_event');
    row.paramSummary.required = Array.from({ length: 13 }, function (_, offset) {
      return 'required_' + offset;
    });
    row.paramSummary.optional = [];
    row.paramSummary.count = 13;
  });
  assertBoundedFailure(requiredParamOverflow, 'invalid');

  const forgedProjection = clone(docs);
  const forgedProjectionRow = rowsOf(forgedProjection).find(function (row) {
    return row.presentationDisposition !== 't1-ready';
  });
  assert.ok(forgedProjectionRow, 'Docs fixture has a static row for validator mutation');
  forgedProjectionRow.executionEnabled = true;
  forgedProjectionRow.invocable = true;
  deepFreeze(forgedProjection);
  assert.equal(projector.validateProjection(forgedProjection), false,
    'validateProjection rejects forged actionable static rows');

  const schemaLeakProjection = clone(docs);
  rowsOf(schemaLeakProjection)[0].paramSchema = { type: 'object' };
  deepFreeze(schemaLeakProjection);
  assert.equal(projector.validateProjection(schemaLeakProjection), false,
    'validateProjection rejects a content capability with paramSchema');

  const authorityLeakProjection = clone(docs);
  rowsOf(authorityLeakProjection)[0].executionAuthority = {};
  deepFreeze(authorityLeakProjection);
  assert.equal(projector.validateProjection(authorityLeakProjection), false,
    'validateProjection rejects a content capability with executionAuthority');

  const digestReplayProjection = clone(zillow);
  const digestReplayRow = rowsOf(digestReplayProjection).find(function(row) {
    return row.slug === 'zillow.search_for_sale';
  });
  digestReplayRow.argumentContract.schemaDigest = 'sha256:' + '0'.repeat(64);
  deepFreeze(digestReplayProjection);
  assert.equal(projector.validateProjection(digestReplayProjection), false,
    'validateProjection rejects an argumentContract/schemaDigest replay mismatch');

  const prefillProjection = clone(docs);
  const prefillRow = rowsOf(prefillProjection).find(function(row) {
    return row.argumentContract && row.argumentContract.mode === 'form';
  });
  assert.ok(prefillRow, 'Docs has a form row for the no-prefill mutation');
  prefillRow.argumentContract.fields[0].default = 'host default';
  deepFreeze(prefillProjection);
  assert.equal(projector.validateProjection(prefillProjection), false,
    'default metadata cannot enter a projected collector field');

  const secretProjection = clone(docs);
  const secretRow = rowsOf(secretProjection).find(function(row) {
    return row.argumentContract && row.argumentContract.mode === 'form';
  });
  secretRow.argumentContract.fields[0].name = 'api_token';
  deepFreeze(secretProjection);
  assert.equal(projector.validateProjection(secretProjection), false,
    'secret-shaped field names cannot enter projected collector metadata');

  const targetSpoofProjection = clone(docs);
  rowsOf(targetSpoofProjection)[0].target = 'forged-target';
  deepFreeze(targetSpoofProjection);
  assert.equal(projector.validateProjection(targetSpoofProjection), false,
    'projected target metadata cannot populate an authority field');

  const mismatchedProjection = clone(docs);
  rowsOf(mismatchedProjection)[0].sourceTerminalState = 'blocked-policy';
  deepFreeze(mismatchedProjection);
  assert.equal(projector.validateProjection(mismatchedProjection), false,
    'validateProjection rejects source/terminal/presentation mismatch');

  console.log('skopeo capability projection tests: PASS');
}

main();
