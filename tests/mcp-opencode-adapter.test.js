'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const buildRoot = path.join(repoRoot, 'mcp', 'build', 'agent-providers');
const adapterBuildPath = path.join(buildRoot, 'adapter.js');
const compatibilityBuildPath = path.join(buildRoot, 'compatibility.js');
const opencodeDetectBuildPath = path.join(buildRoot, 'opencode-detect.js');
const opencodeProfileBuildPath = path.join(buildRoot, 'opencode-profile.js');
const policyAttestationBuildPath = path.join(buildRoot, 'policy-attestation.js');
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

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertRecursivelyFrozen(value, label, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.ok(Object.isFrozen(value), `${label} is recursively frozen`);
  for (const child of Object.values(value)) assertRecursivelyFrozen(child, label, seen);
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

async function runFirstCommitDriftGate() {
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

}

function detectionDependencies(overrides = {}) {
  const candidate = Object.freeze({
    sourcePath: '/fixture/bin/opencode',
    realPath: '/fixture/bin/opencode',
  });
  return {
    platform: 'linux',
    pathValue: '/fixture/bin',
    resolveBinary: async () => candidate,
    resolveRealPath: async () => candidate.realPath,
    resolveWindowsShim: async () => null,
    probe: async () => ({ stdout: '1.14.25\n', stderr: '' }),
    ...overrides,
  };
}

async function runDetection() {
  const detectorSource = fs.readFileSync(
    path.join(repoRoot, 'mcp', 'src', 'agent-providers', 'opencode-detect.ts'),
    'utf8',
  );
  assert.doesNotMatch(detectorSource, /auth\.json|credentials?|api[_-]?key|defaultModel|readFile/i);
  assert.doesNotMatch(detectorSource, /\b(?:spawn|exec|execSync)\s*\(/);
  assert.match(detectorSource, /shell:\s*false/);

  const detectorModule = await import(pathToFileURL(opencodeDetectBuildPath).href);
  const {
    OPENCODE_NATIVE_EXECUTABLE_NAMES,
    OPENCODE_PROBE_OPTIONS,
    OPENCODE_PROFILE_VERSION,
    createOpenCodeDetector,
  } = detectorModule;

  assert.equal(OPENCODE_PROFILE_VERSION, '1.14.25');
  assert.deepEqual(OPENCODE_NATIVE_EXECUTABLE_NAMES, {
    posix: ['opencode'],
    win32: ['opencode.exe', 'opencode.com', 'opencode.cmd', 'opencode.bat'],
  });
  assert.deepEqual(OPENCODE_PROBE_OPTIONS, {
    timeout: 3_000,
    windowsHide: true,
    maxBuffer: 64 * 1024,
    shell: false,
  });
  assert.ok(Object.isFrozen(OPENCODE_NATIVE_EXECUTABLE_NAMES));
  assert.ok(Object.isFrozen(OPENCODE_NATIVE_EXECUTABLE_NAMES.posix));
  assert.ok(Object.isFrozen(OPENCODE_NATIVE_EXECUTABLE_NAMES.win32));
  assert.ok(Object.isFrozen(OPENCODE_PROBE_OPTIONS));

  let observedProbe = null;
  const exact = await createOpenCodeDetector(detectionDependencies({
    probe: async (file, argv, options) => {
      observedProbe = { file, argv, options };
      return { stdout: 'opencode 1.14.25\n', stderr: '' };
    },
  })).detect();
  assert.deepEqual(exact, {
    installed: true,
    version: '1.14.25',
    authState: 'unknown',
    binary: {
      command: '/fixture/bin/opencode',
      realPath: '/fixture/bin/opencode',
      argvPrefix: [],
    },
    profileVersion: '1.14.25',
  });
  assert.deepEqual(observedProbe, {
    file: '/fixture/bin/opencode',
    argv: ['--version'],
    options: OPENCODE_PROBE_OPTIONS,
  });
  assert.ok(Object.isFrozen(exact));
  assert.ok(Object.isFrozen(exact.binary));
  assert.ok(Object.isFrozen(exact.binary.argvPrefix));

  const missing = await createOpenCodeDetector(detectionDependencies({
    resolveBinary: async () => null,
  })).detect();
  assert.equal(missing.installed, false);
  assert.equal(missing.diagnostic.code, 'binary_missing');
  assert.equal(missing.authState, 'unknown');

  for (const version of ['1.14.24', '1.14.26', '2.0.0']) {
    const result = await createOpenCodeDetector(detectionDependencies({
      probe: async () => ({ stdout: `${version}\n`, stderr: '' }),
    })).detect();
    assert.equal(result.installed, false, `${version} stays spawn-ineligible`);
    assert.equal(result.version, version);
    assert.equal(result.profileVersion, null);
    assert.equal(result.diagnostic.code, 'version_unsupported');
  }

  const malformedCanary = 'CREDENTIAL_CANARY_detection_64_04_0001';
  for (const output of [
    malformedCanary,
    '1.14.25 1.14.25',
    'v1.14',
    '\ud800',
  ]) {
    const result = await createOpenCodeDetector(detectionDependencies({
      probe: async () => ({ stdout: output, stderr: '' }),
    })).detect();
    assert.equal(result.installed, false);
    assert.equal(result.diagnostic.code, 'version_unparseable');
    assert.doesNotMatch(result.diagnostic.message, new RegExp(malformedCanary));
    assert.ok(Buffer.byteLength(result.diagnostic.message, 'utf8') <= 160);
  }

  const oversize = await createOpenCodeDetector(detectionDependencies({
    probe: async () => ({ stdout: `1.14.25${'x'.repeat(64 * 1024)}`, stderr: '' }),
  })).detect();
  assert.equal(oversize.installed, false);
  assert.equal(oversize.diagnostic.code, 'version_unparseable');
  assert.doesNotMatch(oversize.diagnostic.message, /x{16}/);

  let identityChecks = 0;
  const changed = await createOpenCodeDetector(detectionDependencies({
    resolveRealPath: async () => {
      identityChecks += 1;
      return identityChecks === 1 ? '/fixture/bin/opencode' : '/fixture/bin/replaced';
    },
  })).detect();
  assert.equal(changed.installed, false);
  assert.equal(changed.diagnostic.code, 'binary_changed');
  assert.equal(changed.binary, null);
  assert.doesNotMatch(changed.diagnostic.message, /fixture|replaced/);

  const unsafe = await createOpenCodeDetector(detectionDependencies({
    resolveBinary: async () => ({ sourcePath: 'relative/opencode', realPath: 'relative/opencode' }),
  })).detect();
  assert.equal(unsafe.installed, false);
  assert.equal(unsafe.diagnostic.code, 'binary_unsafe');

  const windowsExe = await createOpenCodeDetector(detectionDependencies({
    platform: 'win32',
    pathValue: 'C:\\fixture\\bin',
    resolveBinary: async () => ({
      sourcePath: 'C:\\fixture\\bin\\opencode.exe',
      realPath: 'C:\\fixture\\bin\\opencode.exe',
    }),
    resolveRealPath: async () => 'C:\\fixture\\bin\\opencode.exe',
  })).detect();
  assert.equal(windowsExe.installed, true);
  assert.equal(windowsExe.binary.command, 'C:\\fixture\\bin\\opencode.exe');
  assert.deepEqual(windowsExe.binary.argvPrefix, []);

  const windowsShim = await createOpenCodeDetector(detectionDependencies({
    platform: 'win32',
    pathValue: 'C:\\fixture\\bin',
    resolveBinary: async () => ({
      sourcePath: 'C:\\fixture\\bin\\opencode.cmd',
      realPath: 'C:\\fixture\\bin\\opencode.cmd',
    }),
    resolveRealPath: async (value) => (
      value.endsWith('bun.exe') ? 'C:\\fixture\\runtime\\bun.exe' : value
    ),
    resolveWindowsShim: async () => ({
      verified: true,
      command: 'C:\\fixture\\runtime\\bun.exe',
      realPath: 'C:\\fixture\\runtime\\bun.exe',
      argvPrefix: ['C:\\fixture\\app\\opencode.js'],
    }),
  })).detect();
  assert.equal(windowsShim.installed, true);
  assert.equal(windowsShim.binary.command, 'C:\\fixture\\runtime\\bun.exe');
  assert.deepEqual(windowsShim.binary.argvPrefix, ['C:\\fixture\\app\\opencode.js']);

  const rejectedShim = await createOpenCodeDetector(detectionDependencies({
    platform: 'win32',
    pathValue: 'C:\\fixture\\bin',
    resolveBinary: async () => ({
      sourcePath: 'C:\\fixture\\bin\\opencode.cmd',
      realPath: 'C:\\fixture\\bin\\opencode.cmd',
    }),
    resolveRealPath: async (value) => value,
  })).detect();
  assert.equal(rejectedShim.installed, false);
  assert.equal(rejectedShim.diagnostic.code, 'binary_unsafe');

  let poisonTouched = false;
  const poisonOverrides = detectionDependencies();
  for (const name of ['readAuth', 'readConfig', 'readState', 'resolveModel']) {
    Object.defineProperty(poisonOverrides, name, {
      enumerable: false,
      get() {
        poisonTouched = true;
        throw new Error(malformedCanary);
      },
    });
  }
  const poisoned = await createOpenCodeDetector(poisonOverrides).detect();
  assert.equal(poisoned.installed, true);
  assert.equal(poisoned.authState, 'unknown');
  assert.equal(poisonTouched, false);
  assert.doesNotMatch(JSON.stringify(poisoned), new RegExp(malformedCanary));
}

function retainedOpenCodeDetection() {
  return Object.freeze({
    installed: true,
    version: '1.14.25',
    authState: 'unknown',
    binary: Object.freeze({
      command: '/fixture/runtime/opencode',
      realPath: '/fixture/runtime/opencode',
      argvPrefix: Object.freeze(['/fixture/runtime/opencode-entry.js']),
    }),
    profileVersion: '1.14.25',
  });
}

function openCodeProfileFixture() {
  const runtime = {
    fsbMcpEndpoint: 'http://127.0.0.1:7226/mcp',
    opencodeConfigRoot: '/fixture/run/config',
    opencodeConfigPath: '/fixture/run/config/opencode/opencode.json',
    opencodeTestHomePath: '/fixture/run/test-home',
    opencodeManagedConfigPath: '/fixture/run/managed-config',
    opencodeDataRoot: '/fixture/native-data/opencode',
  };
  const context = {
    adapterId: 'opencode',
    detection: retainedOpenCodeDetection(),
    delegationId: 'delegation_fixture_0001',
    runtimeFingerprint: 'runtime_fingerprint_fixture_0001',
    cwd: '/fixture/work',
    privateMcpConfigPath: '/fixture/run/mcp-config.json',
    runtimeFiles: Object.freeze([
      runtime.opencodeConfigPath,
      runtime.opencodeTestHomePath,
      runtime.opencodeManagedConfigPath,
    ]),
  };
  return { context, runtime };
}

async function runProfilePolicy() {
  const profileSource = fs.readFileSync(
    path.join(repoRoot, 'mcp', 'src', 'agent-providers', 'opencode-profile.ts'),
    'utf8',
  );
  assert.doesNotMatch(profileSource, /from ['"]node:(?:child_process|http|https|net|tls)['"]/);
  assert.doesNotMatch(profileSource, /\b(?:fetch|spawn|execFile|exec|connect)\s*\(/);
  assert.doesNotMatch(profileSource, /process\.env|auth\.json|credentials?|api[_-]?key/i);

  const fsbPolicy = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'mcp', 'ai', 'agents', 'fsb.json'),
    'utf8',
  ));
  const profileModule = await import(pathToFileURL(opencodeProfileBuildPath).href);
  const {
    OPENCODE_FIXED_ISOLATION_ENV_KEYS,
    OPENCODE_PROFILE_VERSION,
    OPENCODE_TASK_LIMIT_BYTES,
    SHIPPED_FSB_DESCRIPTION_SHA256,
    SHIPPED_FSB_PROMPT_SHA256,
    buildOpenCodeProfile,
    buildOpenCodeSpawnSpec,
  } = profileModule;

  assert.equal(OPENCODE_PROFILE_VERSION, '1.14.25');
  assert.equal(OPENCODE_TASK_LIMIT_BYTES, 64 * 1024);
  assert.equal(SHIPPED_FSB_DESCRIPTION_SHA256, sha256(fsbPolicy.description));
  assert.equal(SHIPPED_FSB_PROMPT_SHA256, sha256(fsbPolicy.prompt));
  assert.deepEqual(OPENCODE_FIXED_ISOLATION_ENV_KEYS, [
    'OPENCODE_DISABLE_AUTOUPDATE',
    'OPENCODE_DISABLE_CLAUDE_CODE_PROMPT',
    'OPENCODE_DISABLE_EXTERNAL_SKILLS',
    'OPENCODE_DISABLE_LSP_DOWNLOAD',
    'OPENCODE_DISABLE_PROJECT_CONFIG',
    'OPENCODE_TEST_HOME',
    'OPENCODE_TEST_MANAGED_CONFIG_DIR',
    'XDG_CONFIG_HOME',
  ]);
  assert.ok(Object.isFrozen(OPENCODE_FIXED_ISOLATION_ENV_KEYS));

  const { context, runtime } = openCodeProfileFixture();
  const taskCanary = 'TASK_CANARY_profile_64_04_0001\nwith quotes " and unicode µ';
  const profile = buildOpenCodeProfile({ text: taskCanary }, context, runtime);
  assert.deepEqual(Object.keys(profile).sort(), ['privateArtifacts', 'spawnSpec']);
  assertRecursivelyFrozen(profile, 'OpenCode profile');
  assert.strictEqual(
    buildOpenCodeSpawnSpec({ text: taskCanary }, context, runtime).topology.kind,
    'owned_server',
  );

  assert.deepEqual(profile.privateArtifacts.map((artifact) => artifact.kind), [
    'opencode_config',
    'opencode_test_home',
    'opencode_managed_config',
  ]);
  assert.deepEqual(profile.privateArtifacts[1], { kind: 'opencode_test_home' });
  assert.deepEqual(profile.privateArtifacts[2], { kind: 'opencode_managed_config' });
  assert.ok(profile.privateArtifacts[0].contents.endsWith('\n'));
  const config = JSON.parse(profile.privateArtifacts[0].contents);
  assert.deepEqual(Object.keys(config), [
    'share',
    'autoupdate',
    'default_agent',
    'plugin',
    'command',
    'instructions',
    'agent',
    'mcp',
  ]);
  assert.equal(config.share, 'disabled');
  assert.equal(config.autoupdate, false);
  assert.equal(config.default_agent, 'fsb');
  assert.deepEqual(config.plugin, []);
  assert.deepEqual(config.command, {});
  assert.deepEqual(config.instructions, []);
  assert.deepEqual(Object.keys(config.agent), ['fsb']);
  assert.deepEqual(Object.keys(config.agent.fsb), [
    'mode',
    'description',
    'prompt',
    'steps',
    'permission',
  ]);
  assert.equal(config.agent.fsb.mode, 'primary');
  assert.equal(config.agent.fsb.description, fsbPolicy.description);
  assert.equal(config.agent.fsb.prompt, fsbPolicy.prompt);
  assert.equal(config.agent.fsb.steps, 40);
  assert.equal(Object.hasOwn(config.agent.fsb, 'model'), false);
  assert.deepEqual(Object.keys(config.agent.fsb.permission), [
    '*',
    'external_directory',
    'fsb_*',
  ]);
  assert.equal(config.agent.fsb.permission['*'], 'deny');
  assert.deepEqual(config.agent.fsb.permission.external_directory, {
    '*': 'deny',
    '/fixture/native-data/opencode/tool-output/*': 'deny',
  });
  assert.equal(config.agent.fsb.permission['fsb_*'], 'allow');
  assert.deepEqual(config.mcp, {
    fsb: {
      type: 'remote',
      url: runtime.fsbMcpEndpoint,
      enabled: true,
      oauth: false,
    },
  });

  const spec = profile.spawnSpec;
  assert.equal(spec.adapterId, 'opencode');
  assert.equal(spec.profileVersion, '1.14.25');
  assert.deepEqual(spec.attestations, []);
  assert.equal(spec.topology.kind, 'owned_server');
  const { server, coldTask, attachTask } = spec.topology;
  const prefix = ['/fixture/runtime/opencode-entry.js', '--pure', '--log-level', 'ERROR'];
  assert.deepEqual(coldTask.argv, [
    ...prefix,
    'run', '--format', 'json', '--agent', 'fsb',
  ]);
  assert.deepEqual(attachTask.argv, [
    ...prefix,
    'run', '--format', 'json', '--agent', 'fsb',
    '--attach', { runtimeRef: 'owned_server_endpoint' },
  ]);
  assert.deepEqual(server.argv, [
    ...prefix,
    'serve', '--hostname', '127.0.0.1', '--port', '0', '--mdns', 'false',
  ]);
  assert.deepEqual(spec.topology.readiness, {
    linePrefix: 'opencode server listening on http://127.0.0.1:',
    maxBytes: 4 * 1024,
    timeoutMs: 5_000,
  });
  assert.deepEqual(spec.topology.idle, { timeoutMs: 5 * 60 * 1_000 });
  assert.deepEqual(spec.topology.runtimeRefs, {
    endpoint: 'owned_server_endpoint',
    generation: 'daemon_generation',
  });

  const fixedEnv = {
    OPENCODE_DISABLE_AUTOUPDATE: '1',
    OPENCODE_DISABLE_CLAUDE_CODE_PROMPT: '1',
    OPENCODE_DISABLE_EXTERNAL_SKILLS: '1',
    OPENCODE_DISABLE_LSP_DOWNLOAD: '1',
    OPENCODE_DISABLE_PROJECT_CONFIG: '1',
    OPENCODE_TEST_HOME: runtime.opencodeTestHomePath,
    OPENCODE_TEST_MANAGED_CONFIG_DIR: runtime.opencodeManagedConfigPath,
    XDG_CONFIG_HOME: runtime.opencodeConfigRoot,
  };
  const privateFiles = [
    runtime.opencodeConfigPath,
    runtime.opencodeTestHomePath,
    runtime.opencodeManagedConfigPath,
  ];
  const binding = [{
    envKey: 'OPENCODE_SERVER_PASSWORD',
    secretRef: 'owned_server_basic_password',
  }];
  for (const processSpec of [server, coldTask, attachTask]) {
    assert.equal(processSpec.command, context.detection.binary.command);
    assert.equal(processSpec.cwd, context.cwd);
    assert.deepEqual(processSpec.fixedEnv, fixedEnv);
    assert.deepEqual(processSpec.privateFiles, privateFiles);
  }
  assert.deepEqual(server.spawnSecretEnvBindings, binding);
  assert.deepEqual(attachTask.spawnSecretEnvBindings, binding);
  assert.deepEqual(coldTask.spawnSecretEnvBindings, []);
  assert.deepEqual(
    [server.stdin, coldTask.stdin, attachTask.stdin],
    ['none', 'task', 'task'],
  );
  assert.deepEqual(
    [server.stdout, coldTask.stdout, attachTask.stdout],
    ['bounded_readiness', 'agent_jsonl', 'agent_jsonl'],
  );
  assert.equal(Object.hasOwn(fixedEnv, 'OPENCODE_SERVER_PASSWORD'), false);
  for (const forbidden of [
    'HOME',
    'XDG_DATA_HOME',
    'XDG_STATE_HOME',
    'XDG_CACHE_HOME',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
  ]) assert.equal(Object.hasOwn(server.fixedEnv, forbidden), false);

  const serialized = JSON.stringify(profile);
  assert.doesNotMatch(serialized, new RegExp(taskCanary.split('\n')[0]));
  assert.doesNotMatch(serialized, /PASSWORD_CANARY_profile_64_04_0001/);
  for (const forbidden of [
    '--model', '--continue', '--session', '--fork', '--share', '--file', '--command',
    '--print-logs', '--password', '--dangerously-skip-permissions', '--yolo', '--auto',
  ]) assert.equal(serialized.includes(forbidden), false, `${forbidden} is absent`);

  const mutableRuntime = { ...runtime };
  const mutableContext = {
    ...context,
    detection: {
      ...context.detection,
      binary: { ...context.detection.binary, argvPrefix: [...context.detection.binary.argvPrefix] },
    },
    runtimeFiles: [...context.runtimeFiles],
  };
  const isolated = buildOpenCodeProfile({ text: 'immutable task' }, mutableContext, mutableRuntime);
  mutableRuntime.opencodeTestHomePath = '/mutated';
  mutableContext.detection.binary.argvPrefix.push('--mutated');
  mutableContext.runtimeFiles.push('/mutated');
  assert.deepEqual(isolated.spawnSpec.topology.coldTask.argv, coldTask.argv);
  assert.deepEqual(isolated.spawnSpec.topology.coldTask.privateFiles, privateFiles);

  const invalidCases = [
    [{ text: '' }, context, runtime],
    [{ text: '\ud800' }, context, runtime],
    [{ text: 'x'.repeat(OPENCODE_TASK_LIMIT_BYTES + 1) }, context, runtime],
    [{ text: 'valid task' }, { ...context, adapterId: 'claude-code' }, runtime],
    [{ text: 'valid task' }, { ...context, detection: { ...context.detection, installed: false } }, runtime],
    [{ text: 'valid task' }, {
      ...context,
      detection: { ...context.detection, profileVersion: '1.14.24' },
    }, runtime],
    [{ text: 'valid task' }, context, { ...runtime, fsbMcpEndpoint: 'http://example.com/mcp' }],
    [{ text: 'valid task' }, context, { ...runtime, fsbMcpEndpoint: 'http://user:secret@127.0.0.1:7226/mcp' }],
    [{ text: 'valid task' }, context, { ...runtime, opencodeConfigPath: 'relative/opencode.json' }],
    [{ text: 'valid task' }, context, { ...runtime, opencodeDataRoot: '/fixture/native-data/opencode/../escape' }],
  ];
  for (const args of invalidCases) {
    assert.throws(() => buildOpenCodeProfile(...args), /OpenCode|Agent task/);
  }
}

async function runAttestation() {
  const fsbPolicy = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'mcp', 'ai', 'agents', 'fsb.json'),
    'utf8',
  ));
  const profileModule = await import(pathToFileURL(opencodeProfileBuildPath).href);
  const policyModule = await import(pathToFileURL(policyAttestationBuildPath).href);
  const {
    OPENCODE_AGENT_FALLBACK_WARNING_SENTINELS,
    OPENCODE_RESOLVED_FSB_PERMISSION_RULES,
    buildOpenCodeProfile,
  } = profileModule;
  const { verifyPolicyAttestation } = policyModule;
  const { context, runtime } = openCodeProfileFixture();
  const profile = buildOpenCodeProfile(
    { text: 'TASK_CANARY_attestation_64_04_0001' },
    context,
    runtime,
  );
  const { attestations } = profile.spawnSpec;

  assert.deepEqual(OPENCODE_AGENT_FALLBACK_WARNING_SENTINELS, [
    'agent "fsb" not found. Falling back to default agent',
    'agent "fsb" is a subagent, not a primary agent. Falling back to default agent',
  ]);
  assertRecursivelyFrozen(OPENCODE_AGENT_FALLBACK_WARNING_SENTINELS, 'fallback sentinels');
  assert.deepEqual(OPENCODE_RESOLVED_FSB_PERMISSION_RULES, [
    { permission: '*', action: 'allow', pattern: '*' },
    { permission: 'doom_loop', action: 'ask', pattern: '*' },
    { permission: 'external_directory', pattern: '*', action: 'ask' },
    {
      permission: 'external_directory',
      pattern: '/fixture/native-data/opencode/tool-output/*',
      action: 'allow',
    },
    { permission: 'question', action: 'deny', pattern: '*' },
    { permission: 'plan_enter', action: 'deny', pattern: '*' },
    { permission: 'plan_exit', action: 'deny', pattern: '*' },
    { permission: 'read', pattern: '*', action: 'allow' },
    { permission: 'read', pattern: '*.env', action: 'ask' },
    { permission: 'read', pattern: '*.env.*', action: 'ask' },
    { permission: 'read', pattern: '*.env.example', action: 'allow' },
    { permission: '*', action: 'deny', pattern: '*' },
    { permission: 'external_directory', pattern: '*', action: 'deny' },
    {
      permission: 'external_directory',
      pattern: '/fixture/native-data/opencode/tool-output/*',
      action: 'deny',
    },
    { permission: 'fsb_*', action: 'allow', pattern: '*' },
  ]);
  assertRecursivelyFrozen(OPENCODE_RESOLVED_FSB_PERMISSION_RULES, 'resolved permission rules');

  assert.equal(attestations.length, 4);
  assert.deepEqual(attestations.map((descriptor) => descriptor.source), [
    'process_json',
    'process_json',
    'owned_server_json',
    'owned_server_json',
  ]);
  const [coldConfig, coldAgent, serverConfig, serverAgent] = attestations;
  const prefix = ['/fixture/runtime/opencode-entry.js', '--pure', '--log-level', 'ERROR'];
  assert.deepEqual(coldConfig.process.argv, [...prefix, 'debug', 'config']);
  assert.deepEqual(coldAgent.process.argv, [...prefix, 'debug', 'agent', 'fsb']);
  for (const descriptor of [coldConfig, coldAgent]) {
    assert.equal(descriptor.process.role, 'policy_preflight');
    assert.equal(descriptor.process.stdin, 'none');
    assert.equal(descriptor.process.stdout, 'bounded_json');
    assert.deepEqual(descriptor.process.spawnSecretEnvBindings, []);
    assert.deepEqual(
      descriptor.process.fixedEnv,
      profile.spawnSpec.topology.coldTask.fixedEnv,
    );
    assert.equal(descriptor.maxBytes, 128 * 1024);
    assert.equal(descriptor.timeoutMs, 5_000);
  }
  assert.deepEqual(serverConfig, {
    source: 'owned_server_json',
    method: 'GET',
    path: '/config',
    secretRef: 'owned_server_basic_password',
    maxBytes: coldConfig.maxBytes,
    timeoutMs: coldConfig.timeoutMs,
    assertions: coldConfig.assertions,
  });
  assert.deepEqual(serverAgent, {
    source: 'owned_server_json',
    method: 'GET',
    path: '/agent',
    secretRef: 'owned_server_basic_password',
    maxBytes: coldAgent.maxBytes,
    timeoutMs: coldAgent.timeoutMs,
    assertions: coldAgent.assertions,
  });
  assertRecursivelyFrozen(attestations, 'OpenCode attestations');

  const config = JSON.parse(profile.privateArtifacts[0].contents);
  const agent = {
    name: 'fsb',
    mode: 'primary',
    description: fsbPolicy.description,
    prompt: fsbPolicy.prompt,
    steps: 40,
    permission: clone(OPENCODE_RESOLVED_FSB_PERMISSION_RULES),
    tools: ['fsb_navigate', 'fsb_snapshot'],
    resolvedModel: 'native/default-model',
  };
  for (const descriptor of [coldConfig, serverConfig]) {
    assert.deepEqual(verifyPolicyAttestation(config, descriptor.assertions), {
      pass: true,
      reason: 'passed',
    });
  }
  for (const descriptor of [coldAgent, serverAgent]) {
    assert.deepEqual(verifyPolicyAttestation(agent, descriptor.assertions), {
      pass: true,
      reason: 'passed',
    });
  }

  const configPoisons = [];
  for (const [key, value] of [
    ['plugin', ['poison-plugin']],
    ['command', { poison: { template: 'unsafe' } }],
    ['instructions', ['poison-instruction.md']],
    ['skills', { paths: ['/poison-skill'] }],
    ['provider', { poison: {} }],
    ['model', 'poison/model'],
    ['permission', { '*': 'allow' }],
  ]) {
    const poisoned = clone(config);
    poisoned[key] = value;
    configPoisons.push(poisoned);
  }
  {
    const poisoned = clone(config);
    poisoned.mcp.poison = {
      type: 'remote',
      url: 'http://127.0.0.1:9999/mcp',
      enabled: true,
      oauth: false,
    };
    configPoisons.push(poisoned);
  }
  {
    const poisoned = clone(config);
    poisoned.agent.poison = { mode: 'primary', permission: { '*': 'allow' } };
    configPoisons.push(poisoned);
  }
  for (const poisoned of configPoisons) {
    const verdict = verifyPolicyAttestation(poisoned, coldConfig.assertions);
    assert.equal(verdict.pass, false, 'poisoned config fails closed');
  }

  const agentPoisons = [];
  for (const mutate of [
    (value) => { value.name = 'renamed'; },
    (value) => { value.mode = 'subagent'; },
    (value) => { value.prompt = 'poison prompt'; },
    (value) => { value.description = 'poison description'; },
    (value) => { value.model = 'poison/model'; },
    (value) => { value.resolvedModel = ''; },
    (value) => { value.tools = []; },
    (value) => { value.tools = ['fsb_navigate', 'bash']; },
    (value) => { value.permission.push({ permission: 'bash', action: 'allow', pattern: '*' }); },
    (value) => { value.permission.splice(13, 1); },
    (value) => { value.permission.reverse(); },
  ]) {
    const poisoned = clone(agent);
    mutate(poisoned);
    agentPoisons.push(poisoned);
  }
  for (const poisoned of agentPoisons) {
    const verdict = verifyPolicyAttestation(poisoned, coldAgent.assertions);
    assert.equal(verdict.pass, false, 'poisoned agent fails closed');
  }

  const accessorAgent = clone(agent);
  let accessorTouched = false;
  Object.defineProperty(accessorAgent, 'prompt', {
    enumerable: true,
    get() {
      accessorTouched = true;
      return fsbPolicy.prompt;
    },
  });
  assert.deepEqual(verifyPolicyAttestation(accessorAgent, coldAgent.assertions), {
    pass: false,
    reason: 'invalid_document',
  });
  assert.equal(accessorTouched, false);
  assert.equal(
    verifyPolicyAttestation(Object.assign(Object.create({ poison: true }), agent), coldAgent.assertions).pass,
    false,
  );
  const cyclicAgent = clone(agent);
  cyclicAgent.cycle = cyclicAgent;
  assert.equal(verifyPolicyAttestation(cyclicAgent, coldAgent.assertions).pass, false);
  const oversizeAgent = clone(agent);
  oversizeAgent.resolvedModel = 'x'.repeat(1024 * 1024 + 1);
  assert.equal(verifyPolicyAttestation(oversizeAgent, coldAgent.assertions).pass, false);
  assert.equal(verifyPolicyAttestation('{malformed', coldAgent.assertions).pass, false);

  const serialized = JSON.stringify(profile);
  for (const forbidden of [
    'PASSWORD_CANARY_attestation_64_04_0001',
    'Authorization',
    'Basic ',
    'checkOpenCodePolicy',
    'verifyOpenCodePolicy',
    'reduceOpenCodePolicy',
  ]) assert.equal(serialized.includes(forbidden), false, `${forbidden} is absent`);
  assert.deepEqual(Object.keys(profileModule).sort(), [
    'OPENCODE_AGENT_FALLBACK_WARNING_SENTINELS',
    'OPENCODE_FIXED_ISOLATION_ENV_KEYS',
    'OPENCODE_PROFILE_VERSION',
    'OPENCODE_RESOLVED_FSB_PERMISSION_RULES',
    'OPENCODE_TASK_LIMIT_BYTES',
    'SHIPPED_FSB_DESCRIPTION_SHA256',
    'SHIPPED_FSB_PROMPT_SHA256',
    'buildOpenCodeProfile',
    'buildOpenCodeSpawnSpec',
  ]);
}

async function run() {
  const argv = process.argv.slice(2);
  assert.equal(argv.length, 2);
  assert.equal(argv[0], '--section');
  if (argv[1] === 'first-commit-drift-gate') {
    await runFirstCommitDriftGate();
    console.log('mcp-opencode-adapter.test.js: first-commit-drift-gate PASS');
    console.log('MULTI-03 provenance: schema-derived-contract; liveCapturePending: true');
    return;
  }
  if (argv[1] === 'detection') {
    await runDetection();
    console.log('mcp-opencode-adapter.test.js: detection PASS');
    return;
  }
  if (argv[1] === 'profile-policy') {
    await runProfilePolicy();
    console.log('mcp-opencode-adapter.test.js: profile-policy PASS');
    return;
  }
  if (argv[1] === 'attestation') {
    await runAttestation();
    console.log('mcp-opencode-adapter.test.js: attestation PASS');
    return;
  }
  assert.fail(`unknown section: ${argv[1]}`);
}

run().catch((error) => {
  console.error('mcp-opencode-adapter.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
