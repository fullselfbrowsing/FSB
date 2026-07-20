'use strict';

/**
 * Offline adapter-native fixture drift gate. This harness invokes only compiled
 * production parsers over committed synthetic streams; it never invokes a
 * provider binary, account, browser, or network.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const buildRoot = path.join(repoRoot, 'mcp', 'build', 'agent-providers');
const compatibilityBuildPath = path.join(buildRoot, 'compatibility.js');
const registryBuildPath = path.join(buildRoot, 'registry.js');
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

function deepFreeze(value) {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function claudeNativeLabel(event) {
  if (event.type === 'system' || event.type === 'result') return `${event.type}/${event.subtype}`;
  if (event.type === 'stream_event') return `${event.type}/${event.event && event.event.type}`;
  return event.type;
}

function opencodeNativeLabel(event) {
  if (event.type === 'tool_use') return `${event.type}/${event.part && event.part.type}/${event.part && event.part.state && event.part.state.status}`;
  if (event.type === 'step_finish') return `${event.type}/${event.part && event.part.type}/${event.part && event.part.reason}`;
  if (event.part && typeof event.part.type === 'string') return `${event.type}/${event.part.type}`;
  return event.type;
}

const FIXTURE_CONTRACTS = deepFreeze({
  'claude-code': {
    adapterId: 'claude-code',
    directory: 'claude-code-2.1.177',
    parserModule: 'claude-stream.js',
    parserExport: 'parseClaudeEvents',
    profileVersion: '2.1.177',
    requirement: 'CLAUDE-03/D-27',
    expectedNormalizedSequence: [
      'init',
      'assistant',
      'tool_use',
      'assistant_delta',
      'user',
      'tool_result',
      'retry',
      'result',
    ],
    terminalLabel: 'success',
    sourceDocs: [
      'https://code.claude.com/docs/en/headless',
      'https://code.claude.com/docs/en/cli-usage',
    ],
    expectedNativeSequence: [
      'system/init',
      'assistant',
      'stream_event/content_block_delta',
      'user',
      'system/api_retry',
      'result/success',
    ],
    nativeLabel: claudeNativeLabel,
    selectInit(lines) {
      return lines.filter((event) => event.type === 'system' && event.subtype === 'init');
    },
    selectTerminal(lines) {
      return lines.filter((event) => event.type === 'result');
    },
    requiredInitFields: ['session_id', 'tools', 'mcp_servers'],
    requiredTerminalFields: ['session_id', 'subtype', 'is_error'],
    assertTerminal(events, manifest) {
      assert.equal(events.at(-1).payload.subtype, manifest.terminalLabel);
      assert.equal(events.at(-1).payload.is_error, false);
    },
    negativeMutators: [
      {
        reason: 'unknown_event_type',
        mutate(lines) { lines[1] = { type: 'TOP_SECRET_SENTINEL' }; return lines; },
      },
      {
        reason: 'unknown_system_subtype',
        mutate(lines) { lines[1] = { type: 'system', subtype: 'TOP_SECRET_SENTINEL' }; return lines; },
      },
      {
        reason: 'event_before_init',
        mutate(lines) { return lines.slice(1); },
      },
      {
        reason: 'invalid_shape',
        mutate(lines) { deletePath(lines[0], 'mcp_servers'); return lines; },
      },
      {
        reason: 'invalid_shape',
        mutate(lines) { deletePath(lines.at(-1), 'is_error'); return lines; },
      },
      {
        reason: 'session_mismatch',
        mutate(lines) { lines[1].session_id = 'synthetic-other-session'; return lines; },
      },
      {
        reason: 'missing_result',
        mutate(lines) { return lines.slice(0, -1); },
      },
      {
        reason: 'duplicate_result',
        mutate(lines) { lines.push(clone(lines.at(-1))); return lines; },
      },
    ],
  },
  opencode: {
    adapterId: 'opencode',
    directory: 'opencode-1.14.25',
    parserModule: 'opencode-stream.js',
    parserExport: 'parseOpenCodeEvents',
    profileVersion: '1.14.25',
    requirement: 'MULTI-03',
    expectedNormalizedSequence: [
      'init',
      'assistant_delta',
      'assistant',
      'tool_use',
      'tool_result',
      'tool_use',
      'tool_result',
      'assistant',
      'result',
    ],
    terminalLabel: 'stop',
    sourceDocs: [
      'https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/cmd/run.ts',
      'https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/message-v2.ts',
      'https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/prompt.ts',
    ],
    expectedNativeSequence: [
      'step_start/step-start',
      'reasoning/reasoning',
      'text/text',
      'tool_use/tool/completed',
      'step_finish/step-finish/tool-calls',
      'step_start/step-start',
      'tool_use/tool/error',
      'step_finish/step-finish/unknown',
      'step_start/step-start',
      'text/text',
      'step_finish/step-finish/stop',
    ],
    nativeLabel: opencodeNativeLabel,
    selectInit(lines) {
      const starts = lines.filter((event) => event.type === 'step_start');
      return starts.length > 0 ? [starts[0]] : [];
    },
    selectTerminal(lines) {
      return lines.filter(
        (event) => event.type === 'step_finish'
          && event.part
          && event.part.reason !== 'tool-calls'
          && event.part.reason !== 'unknown',
      );
    },
    requiredInitFields: [
      'timestamp',
      'sessionID',
      'part.id',
      'part.sessionID',
      'part.messageID',
      'part.type',
    ],
    requiredTerminalFields: [
      'timestamp',
      'sessionID',
      'part.id',
      'part.sessionID',
      'part.messageID',
      'part.type',
      'part.reason',
      'part.cost',
      'part.tokens',
    ],
    assertTerminal(events, manifest) {
      assert.equal(events.at(-1).payload.subtype, manifest.terminalLabel);
      assert.equal(events.at(-1).payload.is_error, false);
      assert.equal(events.at(-1).payload.candidate, true);
    },
    negativeMutators: [
      {
        reason: 'unknown_event_type',
        mutate(lines) {
          lines[1] = { type: 'TOP_SECRET_SENTINEL', timestamp: 1005, sessionID: lines[0].sessionID };
          return lines;
        },
      },
      {
        reason: 'event_before_init',
        mutate(lines) { return lines.slice(1); },
      },
      {
        reason: 'invalid_shape',
        mutate(lines) { deletePath(lines[0], 'part.messageID'); return lines; },
      },
      {
        reason: 'invalid_shape',
        mutate(lines) { deletePath(lines.at(-1), 'part.tokens'); return lines; },
      },
      {
        reason: 'invalid_order',
        mutate(lines) {
          const nested = clone(lines[0]);
          nested.timestamp += 1;
          nested.part.id = 'synthetic-nested-start';
          nested.part.messageID = 'synthetic-nested-message';
          lines.splice(1, 0, nested);
          return lines;
        },
      },
      {
        reason: 'session_mismatch',
        mutate(lines) { lines[1].sessionID = 'synthetic-other-session'; return lines; },
      },
      {
        reason: 'missing_result',
        mutate(lines) { return lines.slice(0, -1); },
      },
      {
        reason: 'duplicate_result',
        mutate(lines) { lines.push(clone(lines.at(-1))); return lines; },
      },
    ],
  },
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

function deletePath(value, dottedPath) {
  const parts = dottedPath.split('.');
  const leaf = parts.pop();
  let cursor = value;
  for (const part of parts) cursor = cursor[part];
  delete cursor[leaf];
}

function hasPath(value, dottedPath) {
  const parts = dottedPath.split('.');
  let cursor = value;
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object' || !Object.hasOwn(cursor, part)) return false;
    cursor = cursor[part];
  }
  return true;
}

function validateManifest(manifest, contract) {
  assert.ok(exactPlainRecord(manifest, MANIFEST_KEYS), 'fixture manifest has exact plain keys');
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.fixture, 'contract-stream.jsonl');
  assert.equal(manifest.profileVersion, contract.profileVersion);
  assert.equal(manifest.provenance, 'schema-derived-contract');
  assert.equal(manifest.liveCapturePending, true);
  assert.equal(manifest.recordedProvenanceStatus, 'human_needed');
  assert.equal(manifest.recordedProvenanceRequirement, contract.requirement);
  assert.equal(manifest.sanitized, true);
  assert.deepEqual(manifest.sanitization, {
    syntheticIdentifiers: true,
    containsRealPrompt: false,
    containsBrowserContent: false,
    containsCredentials: false,
    containsFilesystemPaths: false,
  });
  assert.ok(Array.isArray(manifest.expectedSequence));
  assert.deepEqual(manifest.expectedSequence, contract.expectedNormalizedSequence);
  assert.equal(manifest.terminalLabel, contract.terminalLabel);
  assert.deepEqual(manifest.sourceDocs, contract.sourceDocs);
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

function encode(lines) {
  return Buffer.from(`${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, 'utf8');
}

function assertProductionRoster(registryIds, rows) {
  const sortedRegistryIds = [...registryIds].sort();
  const matrixIds = rows.map((row) => row.adapterId).sort();
  assert.deepEqual(matrixIds, sortedRegistryIds, 'registry and matrix adapter rosters agree');
  assert.equal(new Set(matrixIds).size, matrixIds.length, 'matrix adapter ids are unique');
  const matrixFixtures = rows.map((row) => row.fixtureManifest).sort();
  const registeredFixtures = sortedRegistryIds.map(
    (adapterId) => `tests/fixtures/agent-streams/${FIXTURE_CONTRACTS[adapterId].directory}/manifest.json`,
  ).sort();
  assert.deepEqual(matrixFixtures, registeredFixtures, 'registered matrix fixtures agree');
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
  assert.equal(classify(row.adapterId, newerSameMajor).reason, 'newer_than_tested_range');
  const minimum = row.minimumVersion.split('.').map(Number);
  assert.ok(minimum[2] > 0);
  assert.equal(
    classify(row.adapterId, `${minimum[0]}.${minimum[1]}.${minimum[2] - 1}`).reason,
    'below_minimum',
  );
  assert.equal(classify(row.adapterId, `${row.supportedMajor + 1}.0.0`).reason, 'wrong_major');
}

async function collect(parser, bytes) {
  const events = [];
  for await (const event of parser(Readable.from([bytes]))) events.push(event);
  return events;
}

async function expectDrift(parser, bytes, expectedReason) {
  const events = [];
  let failure = null;
  try {
    for await (const event of parser(Readable.from([bytes]))) events.push(event);
  } catch (error) {
    failure = error;
  }
  assert.ok(failure, `negative ${expectedReason} case rejects`);
  assert.equal(failure.code, 'agent_protocol_drift');
  assert.equal(failure.reason, expectedReason);
  assert.ok(failure.message.length <= 160);
  assert.ok(failure.issuePaths.length <= 16);
  assert.equal(events.filter((event) => event.type === 'result').length, 0);
  assert.doesNotMatch(failure.message, /TOP_SECRET_SENTINEL/);
  assert.doesNotMatch(JSON.stringify(failure.issuePaths), /TOP_SECRET_SENTINEL/);
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

async function loadParser(contract, registry) {
  const modulePath = path.join(buildRoot, contract.parserModule);
  const productionModule = await import(pathToFileURL(modulePath).href);
  const parser = productionModule[contract.parserExport];
  assert.equal(typeof parser, 'function', `${contract.adapterId} production parser exists`);
  if (contract.adapterId === 'claude-code') {
    const registeredParser = registry.require(contract.adapterId).parseEvents;
    assert.equal(typeof registeredParser, 'function', 'Claude registry exposes its production parser');
    return registeredParser;
  }
  return parser;
}

async function main() {
  assert.ok(Object.isFrozen(FIXTURE_CONTRACTS));
  assert.deepEqual(Object.keys(FIXTURE_CONTRACTS).sort(), ['claude-code', 'opencode']);
  for (const contract of Object.values(FIXTURE_CONTRACTS)) {
    assert.ok(Object.isFrozen(contract));
    assert.ok(Object.isFrozen(contract.expectedNativeSequence));
    assert.ok(Object.isFrozen(contract.negativeMutators));
  }

  const compatibility = await import(pathToFileURL(compatibilityBuildPath).href);
  const registryModule = await import(pathToFileURL(registryBuildPath).href);
  const registry = registryModule.createProductionAdapterRegistry({ kill: async () => {} });
  const registryIds = registry.ids();
  const matrixRows = compatibility.ADAPTER_COMPATIBILITY_MATRIX.adapters;
  const matrixIds = matrixRows.map((row) => row.adapterId);
  assert.deepEqual(registryIds, ['claude-code'], 'production registry remains Claude-only');
  assert.deepEqual(matrixIds, ['claude-code'], 'compatibility matrix remains Claude-only');
  assertProductionRoster(registryIds, matrixRows);
  assert.throws(
    () => assertProductionRoster(registryIds, [...matrixRows, { ...matrixRows[0], adapterId: 'opencode' }]),
    /registry and matrix/,
  );
  assert.throws(() => registry.require('opencode'), /Unknown adapter id/);

  const contractIds = Object.keys(FIXTURE_CONTRACTS).sort();
  const committedManifests = listCommittedManifests();
  const expectedManifests = contractIds.map(
    (adapterId) => `tests/fixtures/agent-streams/${FIXTURE_CONTRACTS[adapterId].directory}/manifest.json`,
  ).sort();
  assert.deepEqual(committedManifests, expectedManifests, 'fixture roster is exactly Claude and OpenCode');

  for (const adapterId of contractIds) {
    const contract = FIXTURE_CONTRACTS[adapterId];
    const manifestPath = path.join(fixturesRoot, contract.directory, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    validateManifest(manifest, contract);
    const poisonedManifest = clone(manifest);
    poisonedManifest.TOP_SECRET_SENTINEL = true;
    assert.throws(() => validateManifest(poisonedManifest, contract), /exact plain keys/);

    const fixturePath = path.resolve(path.dirname(manifestPath), manifest.fixture);
    assert.ok(fixturePath.startsWith(`${path.dirname(manifestPath)}${path.sep}`));
    const fixtureText = fs.readFileSync(fixturePath, 'utf8');
    const rawLines = fixtureText.trimEnd().split(/\r?\n/).map((line) => JSON.parse(line));
    const nativeInit = contract.selectInit(rawLines);
    const nativeTerminal = contract.selectTerminal(rawLines);
    assert.equal(nativeInit.length, 1, `${adapterId} has one native init selector match`);
    assert.equal(nativeTerminal.length, 1, `${adapterId} has one native terminal selector match`);
    for (const field of contract.requiredInitFields) {
      assert.ok(hasPath(nativeInit[0], field), `${adapterId} init contains ${field}`);
    }
    for (const field of contract.requiredTerminalFields) {
      assert.ok(hasPath(nativeTerminal[0], field), `${adapterId} terminal contains ${field}`);
    }
    assert.deepEqual(
      rawLines.map(contract.nativeLabel),
      contract.expectedNativeSequence,
      `${adapterId} native order remains pinned`,
    );

    const parser = await loadParser(contract, registry);
    const events = await collect(parser, Buffer.from(fixtureText, 'utf8'));
    assert.deepEqual(events.map((event) => event.type), manifest.expectedSequence);
    assert.equal(events.filter((event) => event.type === 'result').length, 1);
    assert.equal(events.at(-1).type, 'result');
    contract.assertTerminal(events, manifest);

    const matrixRow = matrixRows.find((row) => row.adapterId === adapterId);
    if (matrixRow) {
      assert.equal(matrixRow.profileVersion, manifest.profileVersion);
      assert.deepEqual(matrixRow.expectedNormalizedSequence, manifest.expectedSequence);
      assert.equal(
        compatibility.classifyAdapterCompatibility(adapterId, manifest.profileVersion).status,
        'supported',
      );
      assertCompatibilityBoundaries(compatibility.classifyAdapterCompatibility, matrixRow);
    } else {
      assert.equal(adapterId, 'opencode', 'only OpenCode may be fixture-gated before registration');
    }

    for (const negative of contract.negativeMutators) {
      await expectDrift(parser, encode(negative.mutate(clone(rawLines))), negative.reason);
    }
    const firstLine = `${JSON.stringify(rawLines[0])}\n`;
    await expectDrift(parser, Buffer.from(`${firstLine}{"type":\n`, 'utf8'), 'invalid_json');
    await expectDrift(
      parser,
      Buffer.concat([Buffer.alloc((256 * 1024) + 1, 0x78), Buffer.from('\n')]),
      'line_too_large',
    );
  }

  const source = fs.readFileSync(__filename, 'utf8');
  assert.match(source, /const FIXTURE_CONTRACTS = deepFreeze/);
  assert.match(source, /parserModule: 'claude-stream\.js'/);
  assert.match(source, /parserModule: 'opencode-stream\.js'/);
  assert.match(source, /production registry remains Claude-only/);
  assert.match(source, /compatibility matrix remains Claude-only/);
  assertCiEntry();

  console.log('mcp-agent-drift-smoke.test.js: PASS');
  console.log('fixture roster: claude-code, opencode; liveCapturePending: true');
}

main().catch((error) => {
  console.error('mcp-agent-drift-smoke.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
