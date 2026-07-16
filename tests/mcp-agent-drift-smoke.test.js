'use strict';

/**
 * Offline registry/matrix/fixture drift gate. Production adapters parse every
 * committed stream; this harness never invokes a provider binary or network.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const compatibilityBuildPath = path.join(
  repoRoot,
  'mcp',
  'build',
  'agent-providers',
  'compatibility.js',
);
const registryBuildPath = path.join(
  repoRoot,
  'mcp',
  'build',
  'agent-providers',
  'registry.js',
);
const fixturesRoot = path.join(repoRoot, 'tests', 'fixtures', 'agent-streams');
const ciPath = path.join(repoRoot, '.github', 'workflows', 'ci.yml');

const MANIFEST_KEYS = Object.freeze([
  'expectedSequence',
  'fixture',
  'liveCapturePending',
  'milestoneEndTask',
  'profileVersion',
  'provenance',
  'recordedProvenanceRequirement',
  'recordedProvenanceStatus',
  'sanitization',
  'sanitized',
  'schemaVersion',
  'sourceDocs',
  'terminalLabel',
]);

const EXPECTED_PROVIDER_NATIVE_SEQUENCES = Object.freeze({
  'claude-code': Object.freeze([
    'system/init',
    'assistant',
    'stream_event/content_block_delta',
    'user',
    'system/api_retry',
    'result/success',
  ]),
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function exactPlainRecord(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) return false;
  if (JSON.stringify([...ownKeys].sort()) !== JSON.stringify([...keys].sort())) return false;
  return ownKeys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
  });
}

function validateManifest(manifest) {
  assert.ok(exactPlainRecord(manifest, MANIFEST_KEYS), 'fixture manifest has exact plain keys');
  assert.equal(manifest.schemaVersion, 1);
  assert.match(manifest.fixture, /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.jsonl$/);
  assert.match(manifest.profileVersion, /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/);
  assert.equal(manifest.provenance, 'schema-derived-contract');
  assert.equal(manifest.liveCapturePending, true);
  assert.equal(manifest.recordedProvenanceStatus, 'human_needed');
  assert.equal(manifest.recordedProvenanceRequirement, 'CLAUDE-03/D-27');
  assert.equal(manifest.sanitized, true);
  assert.deepEqual(manifest.sanitization, {
    syntheticIdentifiers: true,
    containsRealPrompt: false,
    containsBrowserContent: false,
    containsCredentials: false,
    containsFilesystemPaths: false,
  });
  assert.ok(Array.isArray(manifest.expectedSequence));
  assert.ok(manifest.expectedSequence.length > 0 && manifest.expectedSequence.length <= 64);
  assert.equal(manifest.terminalLabel, 'success');
  assert.match(manifest.milestoneEndTask, /milestone-end UAT gate/);
  assert.match(manifest.milestoneEndTask, /keep liveCapturePending true/);
}

function listCommittedManifests() {
  return fs.readdirSync(fixturesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(fixturesRoot, entry.name, 'manifest.json'))
    .filter((candidate) => fs.existsSync(candidate))
    .map((candidate) => path.relative(repoRoot, candidate).split(path.sep).join('/'))
    .sort();
}

function assertRosterBijection(registryIds, rows, fixtureReferences) {
  const sortedRegistryIds = [...registryIds].sort();
  const matrixIds = rows.map((row) => row.adapterId).sort();
  const matrixFixtures = rows.map((row) => row.fixtureManifest).sort();
  assert.deepEqual(matrixIds, sortedRegistryIds, 'registry and matrix adapter rosters agree');
  assert.deepEqual(matrixFixtures, [...fixtureReferences].sort(), 'matrix and fixture rosters agree');
  assert.equal(new Set(matrixIds).size, matrixIds.length, 'matrix adapter ids are unique');
  assert.equal(new Set(matrixFixtures).size, matrixFixtures.length, 'matrix fixtures are unique');
}

function providerNativeLabel(event) {
  assert.ok(event && typeof event === 'object' && !Array.isArray(event));
  assert.equal(typeof event.type, 'string');
  if (event.type === 'system' || event.type === 'result') {
    return `${event.type}/${event.subtype}`;
  }
  if (event.type === 'stream_event') {
    return `${event.type}/${event.event && event.event.type}`;
  }
  return event.type;
}

function encode(lines) {
  return Buffer.from(`${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, 'utf8');
}

async function collect(adapter, bytes) {
  const events = [];
  for await (const event of adapter.parseEvents(Readable.from([bytes]))) events.push(event);
  return events;
}

async function expectDrift(adapter, bytes, expectedReason) {
  const events = [];
  let failure = null;
  try {
    for await (const event of adapter.parseEvents(Readable.from([bytes]))) events.push(event);
  } catch (error) {
    failure = error;
  }
  assert.ok(failure, `negative ${expectedReason} case rejects`);
  assert.equal(failure.code, 'agent_protocol_drift');
  assert.equal(failure.reason, expectedReason);
  assert.equal(events.filter((event) => event.type === 'result').length, 0);
  assert.doesNotMatch(failure.message, /TOP_SECRET_SENTINEL/);
}

function assertRequiredFields(event, requiredFields, label) {
  for (const field of requiredFields) {
    assert.ok(Object.hasOwn(event, field), `${label} contains required raw field ${field}`);
  }
}

function assertFixtureAgreement(row, manifest) {
  assert.equal(manifest.profileVersion, row.profileVersion, 'matrix and fixture profile agree');
  assert.deepEqual(
    manifest.expectedSequence,
    row.expectedNormalizedSequence,
    'matrix and fixture normalized sequence agree',
  );
}

function assertCompatibilityBoundaries(classify, row) {
  assert.deepEqual(classify(row.adapterId, row.minimumVersion), {
    adapterId: row.adapterId,
    displayLabel: row.displayLabel,
    status: 'supported',
    reason: 'within_tested_range',
  });
  assert.deepEqual(classify(row.adapterId, row.testedThroughVersion), {
    adapterId: row.adapterId,
    displayLabel: row.displayLabel,
    status: 'supported',
    reason: 'within_tested_range',
  });

  const tested = row.testedThroughVersion.split('.').map(Number);
  const newerSameMajor = `${tested[0]}.${tested[1]}.${tested[2] + 1}`;
  assert.equal(classify(row.adapterId, newerSameMajor).status, 'degraded');
  assert.equal(classify(row.adapterId, newerSameMajor).reason, 'newer_than_tested_range');

  const minimum = row.minimumVersion.split('.').map(Number);
  assert.ok(minimum[2] > 0, 'fixture minimum permits an exact below-boundary control');
  const belowMinimum = `${minimum[0]}.${minimum[1]}.${minimum[2] - 1}`;
  assert.equal(classify(row.adapterId, belowMinimum).reason, 'below_minimum');
  assert.equal(classify(row.adapterId, `${row.supportedMajor + 1}.0.0`).reason, 'wrong_major');
}

function assertCiEntry() {
  const ci = fs.readFileSync(ciPath, 'utf8');
  assert.equal((ci.match(/name: Phase 62 adapter drift smoke/g) || []).length, 1);
  assert.equal((ci.match(/run: node tests\/mcp-agent-drift-smoke\.test\.js/g) || []).length, 1);
  assert.match(
    ci,
    /name: Phase 62 adapter drift smoke\s*\n\s*run: node tests\/mcp-agent-drift-smoke\.test\.js/,
  );
}

async function main() {
  const compatibility = await import(pathToFileURL(compatibilityBuildPath).href);
  const registryModule = await import(pathToFileURL(registryBuildPath).href);
  const {
    ADAPTER_COMPATIBILITY_MATRIX,
    classifyAdapterCompatibility,
  } = compatibility;
  const { createProductionAdapterRegistry } = registryModule;
  const registry = createProductionAdapterRegistry({ kill: async () => {} });

  const registryIds = registry.ids();
  const rows = ADAPTER_COMPATIBILITY_MATRIX.adapters;
  const committedManifests = listCommittedManifests();
  assertRosterBijection(registryIds, rows, committedManifests);
  assert.throws(
    () => assertRosterBijection(registryIds, [...rows, { ...rows[0], adapterId: 'opencode' }], committedManifests),
    /registry and matrix/,
  );
  assert.throws(
    () => assertRosterBijection(registryIds, rows, [...committedManifests, 'tests/fixtures/agent-streams/orphan/manifest.json']),
    /matrix and fixture/,
  );

  for (const adapterId of registryIds) {
    const row = rows.find((candidate) => candidate.adapterId === adapterId);
    assert.ok(row, `matrix row exists for ${adapterId}`);
    const adapter = registry.require(adapterId);

    const manifestPath = path.resolve(repoRoot, row.fixtureManifest);
    assert.ok(
      manifestPath.startsWith(`${fixturesRoot}${path.sep}`),
      'fixture manifest stays beneath the committed fixture root',
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    validateManifest(manifest);
    const poisonedManifest = clone(manifest);
    poisonedManifest.unknown = true;
    assert.throws(() => validateManifest(poisonedManifest), /exact plain keys/);

    assertFixtureAgreement(row, manifest);
    const mismatchedProfile = clone(manifest);
    mismatchedProfile.profileVersion = `${row.supportedMajor}.0.0`;
    assert.throws(() => assertFixtureAgreement(row, mismatchedProfile), /profile agree/);
    assert.equal(
      classifyAdapterCompatibility(adapterId, manifest.profileVersion).status,
      'supported',
    );
    assertCompatibilityBoundaries(classifyAdapterCompatibility, row);

    const fixturePath = path.resolve(path.dirname(manifestPath), manifest.fixture);
    assert.ok(
      fixturePath.startsWith(`${path.dirname(manifestPath)}${path.sep}`),
      'fixture JSONL stays beside its manifest',
    );
    const fixtureText = fs.readFileSync(fixturePath, 'utf8');
    const rawLines = fixtureText.trimEnd().split(/\r?\n/).map((line) => JSON.parse(line));

    const initRows = rawLines.filter(
      (event) => event.type === 'system' && event.subtype === 'init',
    );
    const resultRows = rawLines.filter((event) => event.type === 'result');
    assert.equal(initRows.length, 1, 'fixture contains exactly one provider-native init');
    assert.equal(resultRows.length, 1, 'fixture contains exactly one provider-native result');
    assertRequiredFields(initRows[0], row.requiredInitFields, 'system/init');
    assertRequiredFields(resultRows[0], row.requiredResultFields, 'result');
    assert.deepEqual(
      rawLines.map(providerNativeLabel),
      EXPECTED_PROVIDER_NATIVE_SEQUENCES[adapterId],
      'provider-native event order remains pinned',
    );

    const events = await collect(adapter, Buffer.from(fixtureText, 'utf8'));
    assert.deepEqual(events.map((event) => event.type), row.expectedNormalizedSequence);
    assert.equal(events.filter((event) => event.type === 'result').length, 1);
    assert.equal(events.at(-1).type, 'result');
    assert.equal(events.at(-1).payload.subtype, manifest.terminalLabel);

    const unknownTopLevel = clone(rawLines);
    unknownTopLevel[1] = { type: 'TOP_SECRET_SENTINEL' };
    await expectDrift(adapter, encode(unknownTopLevel), 'unknown_event_type');

    const unknownRequiredSubtype = clone(rawLines);
    unknownRequiredSubtype[1] = {
      type: 'system',
      subtype: 'TOP_SECRET_SENTINEL',
    };
    await expectDrift(adapter, encode(unknownRequiredSubtype), 'unknown_system_subtype');

    await expectDrift(adapter, encode(clone(rawLines).slice(1)), 'event_before_init');

    const missingInitField = clone(rawLines);
    delete missingInitField[0][row.requiredInitFields.at(-1)];
    await expectDrift(adapter, encode(missingInitField), 'invalid_shape');

    const missingResultField = clone(rawLines);
    delete missingResultField.at(-1)[row.requiredResultFields.at(-1)];
    await expectDrift(adapter, encode(missingResultField), 'invalid_shape');

    await expectDrift(adapter, encode(clone(rawLines).slice(0, -1)), 'missing_result');

    const duplicateResult = clone(rawLines);
    duplicateResult.push(clone(duplicateResult.at(-1)));
    await expectDrift(adapter, encode(duplicateResult), 'duplicate_result');

    const validInit = `${JSON.stringify(rawLines[0])}\n`;
    await expectDrift(
      adapter,
      Buffer.from(`${validInit}{"type":\n`, 'utf8'),
      'invalid_json',
    );

    await expectDrift(
      adapter,
      Buffer.concat([Buffer.alloc((256 * 1024) + 1, 0x78), Buffer.from('\n')]),
      'line_too_large',
    );
  }

  const source = fs.readFileSync(__filename, 'utf8');
  const directParserModule = ['claude', 'stream.js'].join('-');
  const directParserFunction = ['parse', 'Claude', 'Events'].join('');
  assert.equal(source.includes(directParserModule), false);
  assert.equal(source.includes(directParserFunction), false);
  assert.match(source, /registry\.ids\(\)/);
  assert.match(source, /registry\.require\(adapterId\)/);
  assert.match(source, /adapter\.parseEvents/);
  assertCiEntry();

  console.log('mcp-agent-drift-smoke.test.js: PASS');
  console.log('fixture provenance: schema-derived-contract; liveCapturePending: true');
}

main().catch((error) => {
  console.error('mcp-agent-drift-smoke.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
