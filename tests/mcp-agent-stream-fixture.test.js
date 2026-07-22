'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pathToFileURL } = require('url');

const repoRoot = path.resolve(__dirname, '..');
const streamBuildPath = path.join(repoRoot, 'mcp', 'build', 'agent-providers', 'claude-stream.js');
const codexStreamBuildPath = path.join(
  repoRoot,
  'mcp',
  'build',
  'agent-providers',
  'codex-stream.js',
);
const protocolDriftBuildPath = path.join(
  repoRoot,
  'mcp',
  'build',
  'agent-providers',
  'protocol-drift.js',
);
const fixtureDir = path.join(
  repoRoot,
  'tests',
  'fixtures',
  'agent-streams',
  'claude-code-2.1.177',
);
const manifestPath = path.join(fixtureDir, 'manifest.json');
const fixturePath = path.join(fixtureDir, 'contract-stream.jsonl');

const manifestText = fs.readFileSync(manifestPath, 'utf8');
const fixtureText = fs.readFileSync(fixturePath, 'utf8');
const manifest = JSON.parse(manifestText);
const fixtureLines = fixtureText.trimEnd().split(/\r?\n/).map((line) => JSON.parse(line));
const fixtureBytes = Buffer.from(fixtureText, 'utf8');
const sessionId = fixtureLines[0].session_id;
const codexFixtureDir = path.join(
  repoRoot,
  'tests',
  'fixtures',
  'agent-streams',
  'codex-0.142.5',
);

const MANIFEST_KEYS = [
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
];

function cloneFixtureLines() {
  return JSON.parse(JSON.stringify(fixtureLines));
}

function encode(lines, trailingNewline = true, separator = '\n') {
  const value = lines.map((line) => JSON.stringify(line)).join(separator);
  return Buffer.from(`${value}${trailingNewline ? separator : ''}`, 'utf8');
}

async function collect(parseClaudeEvents, chunks) {
  const events = [];
  for await (const event of parseClaudeEvents(Readable.from(chunks))) events.push(event);
  return events;
}

async function observeFailure(parseClaudeEvents, chunks) {
  const events = [];
  let failure = null;
  try {
    for await (const event of parseClaudeEvents(Readable.from(chunks))) events.push(event);
  } catch (error) {
    failure = error;
  }
  assert(failure, 'negative case must reject');
  return { events, failure };
}

async function expectDrift(parseClaudeEvents, chunks, reason, eventIndex) {
  const { events, failure } = await observeFailure(parseClaudeEvents, chunks);
  assert.strictEqual(failure.code, 'agent_protocol_drift');
  assert.strictEqual(failure.reason, reason);
  if (eventIndex !== undefined) assert.strictEqual(failure.eventIndex, eventIndex);
  assert.doesNotMatch(failure.message, /TOP_SECRET_SENTINEL/);
  assert.doesNotMatch(JSON.stringify(failure.issuePaths), /TOP_SECRET_SENTINEL/);
  assert.strictEqual(
    events.filter((event) => event.type === 'result').length,
    0,
    `negative ${reason} case emitted terminal success`,
  );
  return { events, failure };
}

function deletePath(value, dottedPath) {
  const parts = dottedPath.split('.');
  const leaf = parts.pop();
  let cursor = value;
  for (const part of parts) cursor = cursor[Number.isInteger(Number(part)) ? Number(part) : part];
  delete cursor[leaf];
}

function assertManifestAndSanitization() {
  assert.deepStrictEqual(Object.keys(manifest).sort(), MANIFEST_KEYS);
  assert.strictEqual(manifest.schemaVersion, 1);
  assert.strictEqual(manifest.fixture, 'contract-stream.jsonl');
  assert.strictEqual(manifest.profileVersion, '2.1.177');
  assert.strictEqual(manifest.provenance, 'schema-derived-contract');
  assert.strictEqual(manifest.liveCapturePending, true);
  assert.strictEqual(manifest.recordedProvenanceStatus, 'human_needed');
  assert.strictEqual(manifest.recordedProvenanceRequirement, 'CLAUDE-03/D-27');
  assert.strictEqual(manifest.sanitized, true);
  assert.deepStrictEqual(manifest.sanitization, {
    syntheticIdentifiers: true,
    containsRealPrompt: false,
    containsBrowserContent: false,
    containsCredentials: false,
    containsFilesystemPaths: false,
  });
  assert.strictEqual(manifest.terminalLabel, 'success');
  assert.deepStrictEqual(manifest.expectedSequence, [
    'init',
    'assistant',
    'tool_use',
    'assistant_delta',
    'user',
    'tool_result',
    'retry',
    'result',
  ]);
  assert.deepStrictEqual(manifest.sourceDocs, [
    'https://code.claude.com/docs/en/headless',
    'https://code.claude.com/docs/en/cli-usage',
  ]);
  assert.match(manifest.milestoneEndTask, /milestone-end UAT gate/);
  assert.match(manifest.milestoneEndTask, /genuine sanitized Claude Code 2\.1\.177 stream/);
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
  assert(fixtureText.endsWith('\n'), 'contract fixture must have one terminal newline');
  assert.strictEqual(fixtureLines.length, 6);
}

async function run() {
  assertManifestAndSanitization();

  const {
    CLAUDE_STREAM_LINE_LIMIT_BYTES,
    AgentProtocolDriftError: ClaudeExportedDriftError,
    parseClaudeEvents,
  } = await import(pathToFileURL(streamBuildPath).href);
  const {
    AGENT_PROTOCOL_DRIFT_REASONS,
    AgentProtocolDriftError,
  } = await import(pathToFileURL(protocolDriftBuildPath).href);

  assert.strictEqual(CLAUDE_STREAM_LINE_LIMIT_BYTES, 256 * 1024);
  assert.strictEqual(ClaudeExportedDriftError, AgentProtocolDriftError);
  assert.strictEqual(new AgentProtocolDriftError('invalid_json', 1).code, 'agent_protocol_drift');
  assert.deepStrictEqual(
    Object.keys(AGENT_PROTOCOL_DRIFT_REASONS).sort(),
    ['claude-code', 'codex', 'opencode'],
  );
  assert(Object.isFrozen(AGENT_PROTOCOL_DRIFT_REASONS));
  assert(Object.isFrozen(AGENT_PROTOCOL_DRIFT_REASONS['claude-code']));
  assert(Object.isFrozen(AGENT_PROTOCOL_DRIFT_REASONS.codex));
  assert(Object.isFrozen(AGENT_PROTOCOL_DRIFT_REASONS.opencode));

  // EV-01: the checked-in artifact is a schema-derived contract, not recorded provenance.
  const events = await collect(parseClaudeEvents, [fixtureBytes]);
  assert.deepStrictEqual(events.map((event) => event.type), manifest.expectedSequence);
  assert.strictEqual(events.filter((event) => event.type === 'result').length, 1);
  assert.strictEqual(events.at(-1).payload.subtype, manifest.terminalLabel);
  assert.strictEqual(events.at(-1).payload.is_error, false);
  for (const event of events) {
    assert.deepStrictEqual(Object.keys(event).sort(), ['payload', 'sessionId', 'type']);
    assert.strictEqual(event.sessionId, sessionId);
    assert(Object.isFrozen(event));
    assert(Object.isFrozen(event.payload));
  }
  assert.strictEqual(events[0].payload.model, 'synthetic-model');

  // EV-02: every fixture byte boundary, including the interior of µ, is invariant.
  for (let split = 1; split < fixtureBytes.length; split += 1) {
    const splitEvents = await collect(parseClaudeEvents, [
      fixtureBytes.subarray(0, split),
      fixtureBytes.subarray(split),
    ]);
    assert.deepStrictEqual(splitEvents, events, `byte split ${split} changed normalization`);
  }
  const multibyteStart = fixtureBytes.indexOf(Buffer.from('µ'));
  assert(multibyteStart > 0);
  const multibyteEvents = await collect(parseClaudeEvents, [
    fixtureBytes.subarray(0, multibyteStart + 1),
    fixtureBytes.subarray(multibyteStart + 1),
  ]);
  assert.deepStrictEqual(multibyteEvents, events);

  // EV-03: the final result is emitted once even without a terminal newline.
  const finalWithoutNewline = await collect(parseClaudeEvents, [Buffer.from(fixtureText.trimEnd())]);
  assert.deepStrictEqual(finalWithoutNewline, events);
  const crlf = await collect(parseClaudeEvents, [Buffer.from(fixtureText.replaceAll('\n', '\r\n'))]);
  assert.deepStrictEqual(crlf, events);

  // EV-04: compatible additions survive inside payload while the outer envelope stays closed.
  const extraLines = cloneFixtureLines();
  extraLines.forEach((line, index) => { line.compatible_extra = `synthetic-extra-${index}`; });
  extraLines[1].message.content[1].compatible_extra = 'synthetic-tool-extra';
  extraLines[3].message.content[0].compatible_extra = 'synthetic-result-extra';
  const extraEvents = await collect(parseClaudeEvents, [encode(extraLines)]);
  const primaryTypes = ['init', 'assistant', 'assistant_delta', 'user', 'retry', 'result'];
  primaryTypes.forEach((type, index) => {
    assert.strictEqual(
      extraEvents.find((event) => event.type === type).payload.compatible_extra,
      `synthetic-extra-${index}`,
    );
  });
  assert.strictEqual(
    extraEvents.find((event) => event.type === 'tool_use').payload.compatible_extra,
    'synthetic-tool-extra',
  );
  assert.strictEqual(
    extraEvents.find((event) => event.type === 'tool_result').payload.compatible_extra,
    'synthetic-result-extra',
  );
  for (const event of extraEvents) {
    assert.deepStrictEqual(Object.keys(event).sort(), ['payload', 'sessionId', 'type']);
  }

  // EV-05/06: unknown and customization events have exact fail-loud labels.
  const unknownTop = cloneFixtureLines();
  unknownTop[1] = { type: 'TOP_SECRET_SENTINEL' };
  await expectDrift(parseClaudeEvents, [encode(unknownTop)], 'unknown_event_type', 2);

  const unknownSystem = cloneFixtureLines();
  unknownSystem[1] = { type: 'system', subtype: 'status', detail: 'TOP_SECRET_SENTINEL' };
  await expectDrift(parseClaudeEvents, [encode(unknownSystem)], 'unknown_system_subtype', 2);

  const preInitHook = cloneFixtureLines();
  preInitHook[0] = { type: 'system', subtype: 'hook_started', detail: 'TOP_SECRET_SENTINEL' };
  await expectDrift(parseClaudeEvents, [encode(preInitHook)], 'configuration_surface', 1);

  const preInitPlugin = cloneFixtureLines();
  preInitPlugin[0] = { type: 'plugin_progress', detail: 'TOP_SECRET_SENTINEL' };
  await expectDrift(parseClaudeEvents, [encode(preInitPlugin)], 'configuration_surface', 1);

  // Init attestation rejects every non-FSB or customization surface before browser-ready state.
  const initMutations = [
    ['built-in tool', (lines) => { lines[0].tools = ['Bash']; }],
    ['empty tools', (lines) => { lines[0].tools = []; }],
    ['missing FSB server', (lines) => { lines[0].mcp_servers = []; }],
    ['extra MCP server', (lines) => { lines[0].mcp_servers.push({ name: 'other' }); }],
    ['loaded plugin', (lines) => { lines[0].plugins = ['synthetic-plugin']; }],
    ['loaded hook', (lines) => { lines[0].hooks = ['synthetic-hook']; }],
    ['failed FSB server', (lines) => { lines[0].mcp_servers[0].status = 'failed'; }],
  ];
  for (const [label, mutate] of initMutations) {
    const lines = cloneFixtureLines();
    mutate(lines);
    const outcome = await expectDrift(parseClaudeEvents, [encode(lines)], 'configuration_surface', 1);
    assert.strictEqual(outcome.events.length, 0, `${label} escaped before init attestation`);
  }

  // EV-07: each recognized shape loses one required field and fails at its exact line.
  const missingFields = [
    [0, 'session_id'],
    [0, 'tools'],
    [0, 'mcp_servers'],
    [1, 'session_id'],
    [1, 'message'],
    [1, 'message.content'],
    [1, 'message.content.1.id'],
    [2, 'session_id'],
    [2, 'event'],
    [2, 'event.type'],
    [3, 'session_id'],
    [3, 'message'],
    [3, 'message.content'],
    [3, 'message.content.0.tool_use_id'],
    [4, 'attempt'],
    [4, 'max_retries'],
    [4, 'retry_delay_ms'],
    [5, 'session_id'],
    [5, 'subtype'],
    [5, 'is_error'],
  ];
  for (const [lineIndex, field] of missingFields) {
    const lines = cloneFixtureLines();
    deletePath(lines[lineIndex], field);
    await expectDrift(parseClaudeEvents, [encode(lines)], 'invalid_shape', lineIndex + 1);
  }

  const malformedPrefix = fixtureText.slice(0, fixtureText.indexOf('\n') + 1);
  await expectDrift(
    parseClaudeEvents,
    [Buffer.from(`${malformedPrefix}{"type":\n`, 'utf8')],
    'invalid_json',
    2,
  );
  await expectDrift(parseClaudeEvents, [Buffer.from([0xff, 0x0a])], 'invalid_utf8', 1);

  const mismatchedSession = cloneFixtureLines();
  mismatchedSession[2].session_id = 'synthetic-other-session';
  await expectDrift(parseClaudeEvents, [encode(mismatchedSession)], 'session_mismatch', 3);

  const beforeInit = cloneFixtureLines();
  [beforeInit[0], beforeInit[1]] = [beforeInit[1], beforeInit[0]];
  await expectDrift(parseClaudeEvents, [encode(beforeInit)], 'event_before_init', 1);

  const duplicateResult = cloneFixtureLines();
  duplicateResult.push({ ...duplicateResult.at(-1) });
  await expectDrift(parseClaudeEvents, [encode(duplicateResult)], 'duplicate_result', 7);
  await expectDrift(
    parseClaudeEvents,
    [encode(cloneFixtureLines().slice(0, -1))],
    'missing_result',
    6,
  );

  // EV-08: exact per-line limit succeeds; one byte over fails; total output is unbounded by sum.
  const exactLimitLines = cloneFixtureLines();
  const exactLimitEvent = { ...exactLimitLines[1], padding: '' };
  const baseSize = Buffer.byteLength(JSON.stringify(exactLimitEvent));
  exactLimitEvent.padding = 'x'.repeat(CLAUDE_STREAM_LINE_LIMIT_BYTES - baseSize);
  assert.strictEqual(Buffer.byteLength(JSON.stringify(exactLimitEvent)), CLAUDE_STREAM_LINE_LIMIT_BYTES);
  exactLimitLines[1] = exactLimitEvent;
  const exactLimitEvents = await collect(parseClaudeEvents, [encode(exactLimitLines)]);
  assert.deepStrictEqual(exactLimitEvents.map((event) => event.type), manifest.expectedSequence);
  const exactLimitCrlfEvents = await collect(
    parseClaudeEvents,
    [encode(exactLimitLines, true, '\r\n')],
  );
  assert.deepStrictEqual(exactLimitCrlfEvents.map((event) => event.type), manifest.expectedSequence);

  exactLimitEvent.padding += 'x';
  await expectDrift(parseClaudeEvents, [encode(exactLimitLines)], 'line_too_large', 2);

  const largeLines = cloneFixtureLines();
  const padding = 'x'.repeat(2048);
  for (let index = 0; index < 110; index += 1) {
    largeLines.splice(largeLines.length - 1, 0, {
      type: 'assistant',
      session_id: sessionId,
      message: { content: [{ type: 'text', text: `synthetic-${index}:${padding}` }] },
    });
  }
  const largeBytes = encode(largeLines);
  assert(largeBytes.length > 200 * 1024);
  const largeEvents = await collect(
    parseClaudeEvents,
    Array.from({ length: Math.ceil(largeBytes.length / 997) }, (_, index) => (
      largeBytes.subarray(index * 997, Math.min((index + 1) * 997, largeBytes.length))
    )),
  );
  assert.strictEqual(largeEvents.at(-1).type, 'result');
  assert(largeEvents.length > 110);

  const stderrEquivalent = Buffer.from('TOP_SECRET_SENTINEL stderr-equivalent {not-json}\n');
  const separatedEvents = await collect(parseClaudeEvents, [fixtureBytes]);
  assert.deepStrictEqual(separatedEvents, events);
  assert(!JSON.stringify(separatedEvents).includes(stderrEquivalent.toString('utf8')));

  const codexStream = await import(pathToFileURL(codexStreamBuildPath).href);
  const codexManifestText = fs.readFileSync(path.join(codexFixtureDir, 'manifest.json'), 'utf8');
  const codexFixtureText = fs.readFileSync(
    path.join(codexFixtureDir, 'contract-stream.jsonl'),
    'utf8',
  );
  const codexManifest = JSON.parse(codexManifestText);
  const codexExpected = JSON.parse(fs.readFileSync(
    path.join(codexFixtureDir, 'expected-events.json'),
    'utf8',
  ));
  const codexNegatives = JSON.parse(fs.readFileSync(
    path.join(codexFixtureDir, 'native-negative-corpus.json'),
    'utf8',
  ));
  assert.deepStrictEqual(Object.keys(codexManifest).sort(), [
    'expectedEvents',
    'expectedSequence',
    'fixture',
    'liveCapturePending',
    'milestoneEndTask',
    'nativeNegativeCorpus',
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
  assert.strictEqual(codexManifest.profileVersion, '0.142.5');
  assert.strictEqual(codexManifest.provenance, 'schema-derived-contract');
  assert.strictEqual(codexManifest.liveCapturePending, true);
  assert.strictEqual(codexManifest.recordedProvenanceStatus, 'human_needed');
  assert.strictEqual(codexManifest.expectedEvents, 'expected-events.json');
  assert.strictEqual(codexManifest.nativeNegativeCorpus, 'native-negative-corpus.json');
  assert.strictEqual(codexManifest.terminalLabel, 'success');
  assert.match(codexManifest.milestoneEndTask, /genuine sanitized Codex 0\.142\.5 stream/);
  assert.doesNotMatch(codexManifestText, /live recording|captured output/i);
  assert.strictEqual(codexNegatives.profileVersion, '0.142.5');
  assert(codexNegatives.cases.length >= 40);
  assert.strictEqual(
    new Set(codexNegatives.cases.map((entry) => entry.id)).size,
    codexNegatives.cases.length,
  );
  const codexBytes = Buffer.from(codexFixtureText, 'utf8');
  const codexEvents = await collect(codexStream.parseCodexEvents, [codexBytes]);
  assert.deepStrictEqual(codexEvents, codexExpected);
  assert.deepStrictEqual(codexEvents.map((event) => event.type), codexManifest.expectedSequence);
  assert.strictEqual(codexEvents.filter((event) => event.type === 'result').length, 1);
  assert.strictEqual(codexEvents.at(-1).payload.candidate, true);
  for (let split = 1; split < codexBytes.length; split += 17) {
    assert.deepStrictEqual(await collect(codexStream.parseCodexEvents, [
      codexBytes.subarray(0, split),
      codexBytes.subarray(split),
    ]), codexEvents, `Codex byte split ${split} changed normalization`);
  }
  assert.deepStrictEqual(
    await collect(codexStream.parseCodexEvents, [Buffer.from(codexFixtureText.trimEnd())]),
    codexEvents,
  );
  assert.deepStrictEqual(
    await collect(codexStream.parseCodexEvents, [
      Buffer.from(codexFixtureText.replaceAll('\n', '\r\n')),
    ]),
    codexEvents,
  );
  const codexSafeEvents = JSON.stringify(codexEvents);
  for (const forbidden of [
    'synthetic private plan',
    'synthetic private reasoning',
    'synthetic capability',
    'synthetic tool output',
  ]) assert.strictEqual(codexSafeEvents.includes(forbidden), false);

  console.log('mcp-agent-stream-fixture.test.js: PASS');
  console.log('CLAUDE-03 recorded provenance: human_needed (schema-derived contract only)');
}

run().catch((error) => {
  console.error('mcp-agent-stream-fixture.test.js: FAIL');
  console.error(error);
  process.exit(1);
});
