'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const buildRoot = path.join(repoRoot, 'mcp', 'build', 'agent-providers');
const adapterBuildPath = path.join(buildRoot, 'adapter.js');
const compatibilityBuildPath = path.join(buildRoot, 'compatibility.js');
const opencodeStreamBuildPath = path.join(buildRoot, 'opencode-stream.js');
const protocolDriftBuildPath = path.join(buildRoot, 'protocol-drift.js');
const registryBuildPath = path.join(buildRoot, 'registry.js');
const fixtureDir = path.join(
  repoRoot,
  'tests',
  'fixtures',
  'agent-streams',
  'opencode-1.14.25',
);
const manifestPath = path.join(fixtureDir, 'manifest.json');
const fixturePath = path.join(fixtureDir, 'contract-stream.jsonl');

const manifestText = fs.readFileSync(manifestPath, 'utf8');
const fixtureText = fs.readFileSync(fixturePath, 'utf8');
const manifest = JSON.parse(manifestText);
const fixtureLines = fixtureText.trimEnd().split(/\r?\n/).map((line) => JSON.parse(line));
const fixtureBytes = Buffer.from(fixtureText, 'utf8');
const sessionId = fixtureLines[0].sessionID;

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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cloneFixtureLines() {
  return clone(fixtureLines);
}

function encode(lines, trailingNewline = true, separator = '\n') {
  const body = lines.map((line) => JSON.stringify(line)).join(separator);
  return Buffer.from(`${body}${trailingNewline ? separator : ''}`, 'utf8');
}

async function collect(parseOpenCodeEvents, chunks) {
  const events = [];
  for await (const event of parseOpenCodeEvents(Readable.from(chunks))) events.push(event);
  return events;
}

async function observeFailure(parseOpenCodeEvents, chunks) {
  const events = [];
  let failure = null;
  try {
    for await (const event of parseOpenCodeEvents(Readable.from(chunks))) events.push(event);
  } catch (error) {
    failure = error;
  }
  assert.ok(failure, 'negative case must reject');
  return { events, failure };
}

async function expectDrift(parseOpenCodeEvents, chunks, reason, eventIndex) {
  const { events, failure } = await observeFailure(parseOpenCodeEvents, chunks);
  assert.equal(failure.name, 'AgentProtocolDriftError');
  assert.equal(failure.code, 'agent_protocol_drift');
  assert.equal(failure.providerId, 'opencode');
  assert.equal(failure.reason, reason);
  if (eventIndex !== undefined) assert.equal(failure.eventIndex, eventIndex);
  assert.ok(failure.message.length <= 160, 'drift message stays bounded');
  assert.ok(failure.issuePaths.length <= 16, 'drift issue paths stay bounded');
  assert.ok(failure.issuePaths.every((value) => value.length <= 128));
  assert.doesNotMatch(failure.message, /TOP_SECRET_SENTINEL|synthetic-tool-error/);
  assert.doesNotMatch(JSON.stringify(failure.issuePaths), /TOP_SECRET_SENTINEL|synthetic-tool-error/);
  assert.equal(
    events.filter((event) => event.type === 'result').length,
    0,
    `negative ${reason} case emitted a result`,
  );
  return { events, failure };
}

function assertManifest() {
  assert.deepEqual(Object.keys(manifest).sort(), [...MANIFEST_KEYS].sort());
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.fixture, 'contract-stream.jsonl');
  assert.equal(manifest.profileVersion, '1.14.25');
  assert.equal(manifest.provenance, 'schema-derived-contract');
  assert.equal(manifest.liveCapturePending, true);
  assert.equal(manifest.recordedProvenanceStatus, 'human_needed');
  assert.equal(manifest.recordedProvenanceRequirement, 'MULTI-03');
  assert.equal(manifest.sanitized, true);
  assert.deepEqual(manifest.sanitization, {
    syntheticIdentifiers: true,
    containsRealPrompt: false,
    containsBrowserContent: false,
    containsCredentials: false,
    containsFilesystemPaths: false,
  });
  assert.deepEqual(manifest.expectedSequence, [
    'init',
    'assistant_delta',
    'assistant',
    'tool_use',
    'tool_result',
    'tool_use',
    'tool_result',
    'assistant',
    'result',
  ]);
  assert.equal(manifest.terminalLabel, 'stop');
  assert.deepEqual(manifest.sourceDocs, [
    'https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/cmd/run.ts',
    'https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/message-v2.ts',
    'https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/prompt.ts',
  ]);
  assert.match(manifest.milestoneEndTask, /milestone-end UAT gate/);
  assert.match(manifest.milestoneEndTask, /genuine sanitized OpenCode 1\.14\.25 stream/);
  assert.match(manifest.milestoneEndTask, /keep liveCapturePending true/);
  assert.doesNotMatch(manifestText, /live recording|captured output/i);

  const combined = `${manifestText}\n${fixtureText}`;
  assert.doesNotMatch(combined, /\/(?:Users|home)\//);
  assert.doesNotMatch(combined, /[A-Za-z]:\\/);
  assert.doesNotMatch(combined, /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
  assert.doesNotMatch(combined, /[?&](?:access_token|auth|key|secret|token)=/i);
  assert.doesNotMatch(combined, /\b(?:sk-ant|sk-proj|AKIA)[A-Za-z0-9_-]*/);
  assert.doesNotMatch(fixtureText, /\b(?:oauth|password|passwd|cvv|cvc|pan)\b/i);
  assert.doesNotMatch(fixtureText, /\b\d{13,19}\b/);
  assert.doesNotMatch(fixtureText, /https?:\/\//);
  assert.ok(fixtureText.endsWith('\n'), 'fixture has one terminal newline');
  assert.equal(fixtureLines.length, 11);
}

function replacementStart(overrides = {}) {
  return {
    type: 'step_start',
    timestamp: 1005,
    sessionID: sessionId,
    part: {
      id: 'synthetic-illegal-step-start',
      sessionID: sessionId,
      messageID: 'synthetic-illegal-message',
      type: 'step-start',
    },
    ...overrides,
  };
}

async function run() {
  assert.deepEqual(process.argv.slice(2), ['--section', 'first-commit-drift-gate']);
  assertManifest();

  const parserSource = fs.readFileSync(
    path.join(repoRoot, 'mcp', 'src', 'agent-providers', 'opencode-stream.ts'),
    'utf8',
  );
  assert.doesNotMatch(parserSource, /from ['"]node:(?:child_process|http|https|net|tls)['"]/);
  assert.doesNotMatch(parserSource, /\b(?:fetch|spawn|execFile|exec|connect)\s*\(/);
  assert.doesNotMatch(parserSource, /process\.env|OPENCODE_SERVER_PASSWORD|--attach|--continue|--session/);
  assert.doesNotMatch(parserSource, /console\.|TOP_SECRET_SENTINEL/);

  const adapter = await import(pathToFileURL(adapterBuildPath).href);
  const compatibility = await import(pathToFileURL(compatibilityBuildPath).href);
  const opencodeStream = await import(pathToFileURL(opencodeStreamBuildPath).href);
  const protocolDrift = await import(pathToFileURL(protocolDriftBuildPath).href);
  const registryModule = await import(pathToFileURL(registryBuildPath).href);
  const {
    OPENCODE_STREAM_LINE_LIMIT_BYTES,
    OPENCODE_STREAM_LIMIT_BYTES,
    parseOpenCodeEvents,
  } = opencodeStream;
  const {
    AGENT_PROTOCOL_DRIFT_REASONS,
    AgentProtocolDriftError,
    isExactOwnDataRecord,
  } = protocolDrift;

  assert.equal(adapter.OPENCODE_ADAPTER_ID, 'opencode');
  assert.equal(OPENCODE_STREAM_LINE_LIMIT_BYTES, 256 * 1024);
  assert.equal(OPENCODE_STREAM_LIMIT_BYTES, 2 * 1024 * 1024);
  assert.ok(Object.isFrozen(AGENT_PROTOCOL_DRIFT_REASONS));
  assert.deepEqual(Object.keys(AGENT_PROTOCOL_DRIFT_REASONS).sort(), ['claude-code', 'opencode']);
  assert.ok(Object.isFrozen(AGENT_PROTOCOL_DRIFT_REASONS['claude-code']));
  assert.ok(Object.isFrozen(AGENT_PROTOCOL_DRIFT_REASONS.opencode));
  const onlyOpenCodeReasons = AGENT_PROTOCOL_DRIFT_REASONS.opencode.filter(
    (reason) => !AGENT_PROTOCOL_DRIFT_REASONS['claude-code'].includes(reason),
  );
  assert.deepEqual(onlyOpenCodeReasons, [
    'counter_overflow',
    'duplicate_id',
    'invalid_order',
    'provider_error',
    'stream_too_large',
  ]);
  const sampleDrift = new AgentProtocolDriftError('invalid_json', 1, [], 'opencode');
  assert.equal(sampleDrift.code, 'agent_protocol_drift');
  assert.equal(sampleDrift.providerId, 'opencode');
  assert.equal(sampleDrift.reason, 'invalid_json');
  const redactedPathDrift = new AgentProtocolDriftError(
    'invalid_shape',
    Number.MAX_SAFE_INTEGER,
    Array.from({ length: 32 }, () => 'TOP_SECRET_SENTINEL'),
    'opencode',
  );
  assert.equal(redactedPathDrift.eventIndex, 4_097);
  assert.equal(redactedPathDrift.issuePaths.length, 16);
  assert.deepEqual([...new Set(redactedPathDrift.issuePaths)], ['shape']);
  assert.doesNotMatch(JSON.stringify(redactedPathDrift), /TOP_SECRET_SENTINEL/);

  assert.equal(isExactOwnDataRecord({ a: 1 }, ['a']), true);
  assert.equal(isExactOwnDataRecord({ a: 1, b: 2 }, ['a']), false);
  assert.equal(isExactOwnDataRecord(Object.create({ a: 1 }), []), false);
  const accessor = {};
  Object.defineProperty(accessor, 'a', { enumerable: true, get() { return 1; } });
  assert.equal(isExactOwnDataRecord(accessor, ['a']), false);

  const registry = registryModule.createProductionAdapterRegistry({ kill: async () => {} });
  assert.deepEqual(registry.ids(), ['claude-code']);
  assert.deepEqual(
    compatibility.ADAPTER_COMPATIBILITY_MATRIX.adapters.map((row) => row.adapterId),
    ['claude-code'],
  );

  const events = await collect(parseOpenCodeEvents, [fixtureBytes]);
  assert.deepEqual(events.map((event) => event.type), manifest.expectedSequence);
  assert.equal(events.filter((event) => event.type === 'init').length, 1);
  assert.equal(events.filter((event) => event.type === 'result').length, 1);
  assert.equal(events.at(-1).payload.subtype, manifest.terminalLabel);
  assert.equal(events.at(-1).payload.is_error, false);
  assert.equal(events.at(-1).payload.candidate, true);
  assert.deepEqual(
    events.filter((event) => event.type === 'tool_use').map((event) => event.payload.id),
    ['synthetic-call-01', 'synthetic-call-02'],
  );
  assert.deepEqual(
    events.filter((event) => event.type === 'tool_result').map((event) => ({
      id: event.payload.tool_use_id,
      isError: event.payload.is_error,
    })),
    [
      { id: 'synthetic-call-01', isError: false },
      { id: 'synthetic-call-02', isError: true },
    ],
  );
  assert.equal(events[1].payload.text, 'synthetic-reasoning-µ');
  assert.deepEqual(
    events.filter((event) => event.type === 'assistant').map((event) => event.payload.text),
    ['synthetic-assistant-one', 'synthetic-assistant-final'],
  );
  for (const event of events) {
    assert.deepEqual(Object.keys(event).sort(), ['payload', 'sessionId', 'type']);
    assert.equal(event.sessionId, sessionId);
    assert.ok(Object.isFrozen(event));
    assert.ok(Object.isFrozen(event.payload));
  }
  assert.ok(Object.isFrozen(events.at(-1).payload.tokens));
  assert.ok(Object.isFrozen(events.at(-1).payload.tokens.cache));
  assert.doesNotMatch(JSON.stringify(events), /synthetic-tool-output|synthetic-tool-error|synthetic-query/);

  // Every byte boundary, including the interior of µ, must normalize identically.
  for (let split = 1; split < fixtureBytes.length; split += 1) {
    const splitEvents = await collect(parseOpenCodeEvents, [
      fixtureBytes.subarray(0, split),
      fixtureBytes.subarray(split),
    ]);
    assert.deepEqual(splitEvents, events, `byte split ${split} changed normalization`);
  }
  const multibyteStart = fixtureBytes.indexOf(Buffer.from('µ'));
  assert.ok(multibyteStart > 0);
  assert.deepEqual(
    await collect(parseOpenCodeEvents, [
      fixtureBytes.subarray(0, multibyteStart + 1),
      fixtureBytes.subarray(multibyteStart + 1),
    ]),
    events,
  );
  assert.deepEqual(
    await collect(parseOpenCodeEvents, [Buffer.from(fixtureText.trimEnd(), 'utf8')]),
    events,
  );
  assert.deepEqual(
    await collect(parseOpenCodeEvents, [Buffer.from(fixtureText.replaceAll('\n', '\r\n'), 'utf8')]),
    events,
  );

  await expectDrift(parseOpenCodeEvents, [Buffer.from([0xff, 0x0a])], 'invalid_utf8', 1);
  await expectDrift(
    parseOpenCodeEvents,
    [Buffer.from(`${JSON.stringify(fixtureLines[0])}\n{"type":\n`, 'utf8')],
    'invalid_json',
    2,
  );
  await expectDrift(
    parseOpenCodeEvents,
    [Buffer.concat([Buffer.alloc(OPENCODE_STREAM_LINE_LIMIT_BYTES + 1, 0x78), Buffer.from('\n')])],
    'line_too_large',
    1,
  );
  await expectDrift(
    parseOpenCodeEvents,
    [Buffer.alloc(OPENCODE_STREAM_LIMIT_BYTES + 1, 0x20)],
    'stream_too_large',
    1,
  );

  const missingOuter = cloneFixtureLines();
  delete missingOuter[0].timestamp;
  await expectDrift(parseOpenCodeEvents, [encode(missingOuter)], 'invalid_shape', 1);
  const extraOuter = cloneFixtureLines();
  extraOuter[0].TOP_SECRET_SENTINEL = true;
  await expectDrift(parseOpenCodeEvents, [encode(extraOuter)], 'invalid_shape', 1);
  const missingNested = cloneFixtureLines();
  delete missingNested[2].part.time.end;
  await expectDrift(parseOpenCodeEvents, [encode(missingNested)], 'invalid_shape', 3);
  const extraNested = cloneFixtureLines();
  extraNested[4].part.tokens.cache.TOP_SECRET_SENTINEL = 1;
  await expectDrift(parseOpenCodeEvents, [encode(extraNested)], 'invalid_shape', 5);
  const invalidTime = cloneFixtureLines();
  invalidTime[2].part.time.end = invalidTime[2].part.time.start - 1;
  await expectDrift(parseOpenCodeEvents, [encode(invalidTime)], 'invalid_shape', 3);

  await expectDrift(
    parseOpenCodeEvents,
    [encode(cloneFixtureLines().slice(1))],
    'event_before_init',
    1,
  );
  const nestedStart = cloneFixtureLines();
  nestedStart.splice(1, 0, replacementStart());
  await expectDrift(parseOpenCodeEvents, [encode(nestedStart)], 'invalid_order', 2);
  const reversedTimestamp = cloneFixtureLines();
  reversedTimestamp[1].timestamp = 999;
  await expectDrift(parseOpenCodeEvents, [encode(reversedTimestamp)], 'invalid_order', 2);
  const outerSessionMismatch = cloneFixtureLines();
  outerSessionMismatch[1].sessionID = 'synthetic-other-session';
  await expectDrift(parseOpenCodeEvents, [encode(outerSessionMismatch)], 'session_mismatch', 2);
  const innerSessionMismatch = cloneFixtureLines();
  innerSessionMismatch[1].part.sessionID = 'synthetic-other-session';
  await expectDrift(parseOpenCodeEvents, [encode(innerSessionMismatch)], 'session_mismatch', 2);
  const messageMismatch = cloneFixtureLines();
  messageMismatch[1].part.messageID = 'synthetic-other-message';
  await expectDrift(parseOpenCodeEvents, [encode(messageMismatch)], 'invalid_order', 2);

  const duplicatePart = cloneFixtureLines();
  duplicatePart[2].part.id = duplicatePart[1].part.id;
  await expectDrift(parseOpenCodeEvents, [encode(duplicatePart)], 'duplicate_id', 3);
  const duplicateMessage = cloneFixtureLines();
  duplicateMessage[5].part.messageID = duplicateMessage[0].part.messageID;
  await expectDrift(parseOpenCodeEvents, [encode(duplicateMessage)], 'duplicate_id', 6);
  const duplicateCall = cloneFixtureLines();
  duplicateCall[6].part.callID = duplicateCall[3].part.callID;
  await expectDrift(parseOpenCodeEvents, [encode(duplicateCall)], 'duplicate_id', 7);

  const cumulativeOverflow = cloneFixtureLines();
  cumulativeOverflow[10].part.tokens.input = Number.MAX_SAFE_INTEGER;
  await expectDrift(parseOpenCodeEvents, [encode(cumulativeOverflow)], 'counter_overflow', 11);

  const providerError = cloneFixtureLines();
  providerError.splice(1, 0, {
    type: 'error',
    timestamp: 1005,
    sessionID: sessionId,
    error: {
      name: 'SyntheticProviderError',
      data: { message: 'TOP_SECRET_SENTINEL' },
    },
  });
  const providerFailure = await expectDrift(
    parseOpenCodeEvents,
    [encode(providerError)],
    'provider_error',
    2,
  );
  assert.deepEqual(providerFailure.events.map((event) => event.type), ['init', 'diagnostic']);
  assert.deepEqual(providerFailure.events[1].payload, { code: 'provider_error' });

  await expectDrift(
    parseOpenCodeEvents,
    [encode(cloneFixtureLines().slice(0, 8))],
    'missing_result',
    9,
  );
  const duplicateTerminal = cloneFixtureLines();
  duplicateTerminal.push(clone(duplicateTerminal.at(-1)));
  await expectDrift(parseOpenCodeEvents, [encode(duplicateTerminal)], 'duplicate_result', 12);
  const afterCandidate = cloneFixtureLines();
  afterCandidate.push({
    ...clone(afterCandidate[9]),
    timestamp: 1110,
    part: {
      ...clone(afterCandidate[9].part),
      id: 'synthetic-post-candidate-text',
    },
  });
  await expectDrift(parseOpenCodeEvents, [encode(afterCandidate)], 'event_after_result', 12);
  const unknownEvent = cloneFixtureLines();
  unknownEvent[1] = {
    type: 'TOP_SECRET_SENTINEL',
    timestamp: 1005,
    sessionID: sessionId,
  };
  await expectDrift(parseOpenCodeEvents, [encode(unknownEvent)], 'unknown_event_type', 2);

  console.log('mcp-opencode-adapter.test.js: PASS');
  console.log('MULTI-03 provenance: schema-derived-contract; liveCapturePending: true');
}

run().catch((error) => {
  console.error('mcp-opencode-adapter.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
