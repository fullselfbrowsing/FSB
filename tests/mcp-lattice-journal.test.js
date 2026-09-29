'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const journal = require('../extension/utils/mcp-lattice-journal.js');

function makeLocalStorage() {
  const state = {};
  return {
    state,
    async get(keys) {
      const names = Array.isArray(keys) ? keys : [keys];
      const out = {};
      names.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(state, key)) out[key] = structuredClone(state[key]);
      });
      return out;
    },
    async set(values) {
      Object.keys(values || {}).forEach((key) => { state[key] = structuredClone(values[key]); });
    }
  };
}

function setup(startAt = 1_800_000_000_000) {
  const backend = journal._resetForTests();
  const local = makeLocalStorage();
  const alarms = new Map();
  let now = startAt;
  journal._setLocalStorageShim(local);
  journal._setTimeShim({ now: () => now });
  journal._setAlarmShim({
    async create(name, info) { alarms.set(name, { name, ...info }); },
    async clear(name) { return alarms.delete(name); }
  });
  globalThis.FsbLatticeReplay = null;
  return {
    backend,
    local,
    alarms,
    now: () => now,
    advance(ms) { now += ms; }
  };
}

let callNumber = 0;
function entry(overrides = {}) {
  callNumber += 1;
  const agentId = overrides.agentId || 'agent-alpha';
  const recordingRunId = overrides.recordingRunId || 'recording-run-alpha';
  const recordingCallId = overrides.recordingCallId || `recording-call-${callNumber}`;
  const params = overrides.params || { selector: '#submit' };
  return {
    agentId,
    recordingRunId,
    recordingCallId,
    client: overrides.client || 'Codex',
    task: overrides.task || 'Inspect the current page',
    taskSource: overrides.taskSource,
    tool: overrides.tool || 'mcp:read-page',
    requestPayload: overrides.requestPayload || {
      agentId,
      recordingRunId,
      recordingCallId,
      params
    },
    response: Object.prototype.hasOwnProperty.call(overrides, 'response')
      ? overrides.response
      : { success: true, value: 'ok' },
    resultProjection: overrides.resultProjection,
    success: overrides.success !== false,
    dispatcher_route: overrides.dispatcher_route || 'message',
    tabId: Object.prototype.hasOwnProperty.call(overrides, 'tabId') ? overrides.tabId : 11,
    replayContext: overrides.replayContext || {
      targetUrl: 'https://example.test/page',
      targetOrigin: 'https://example.test',
      sideEffectClass: 'read'
    },
    redactedInputs: overrides.redactedInputs === true,
    targetRedacted: overrides.targetRedacted === true
  };
}

async function allDetail(sessionId) {
  const events = [];
  let afterSequence = -1;
  do {
    const page = await journal.getSessionDetail({ sessionId, afterSequence, limit: 2 });
    assert.ok(page);
    events.push(...page.events);
    if (!page.hasMore) return { session: page.session, events };
    afterSequence = page.nextSequence;
  } while (true);
}

test('read-first capture creates one isolated run with monotonic multi-tab tracks and alias deduplication', async () => {
  const { backend } = setup();
  const first = entry({ recordingCallId: 'call-read-first', tabId: 11 });
  const second = entry({ recordingCallId: 'call-second-tab', tabId: 22, tool: 'mcp:get-dom' });
  const third = entry({ recordingCallId: 'call-third', tabId: 11, tool: 'mcp:get-tabs' });

  const results = await Promise.all([
    journal.recordDispatch(first),
    journal.recordDispatch(second),
    journal.recordDispatch(third)
  ]);
  const sessionId = results[0].sessionId;
  assert.equal(results[1].sessionId, sessionId);
  assert.equal(results[2].sessionId, sessionId);

  const detail = await allDetail(sessionId);
  assert.deepEqual(detail.events.map((event) => event.sequence), [0, 1, 2, 3]);
  assert.deepEqual(detail.events.map((event) => event.kind), [
    'run.start', 'tool.call', 'tool.call', 'tool.call'
  ]);
  assert.deepEqual(
    detail.events.filter((event) => event.kind === 'tool.call').map((event) => event.metadata.logicalTab),
    ['primary', 'tab-2', 'primary']
  );
  assert.deepEqual(detail.session.tabIds, [11, 22]);
  assert.equal(detail.session.storageBackend, 'journal-v2');

  const duplicate = await journal.recordDispatch({ ...second, response: { success: true, value: 'changed' } });
  assert.equal(duplicate.deduplicated, true);
  assert.equal((await allDetail(sessionId)).events.length, 4);

  const isolated = await journal.recordDispatch(entry({
    agentId: 'agent-beta',
    recordingRunId: 'recording-run-alpha',
    recordingCallId: 'call-other-agent'
  }));
  assert.notEqual(isolated.sessionId, sessionId);
  assert.equal(backend._state.runs.size, 2);
});

test('higher-priority task sources promote journal and Task Memory titles without creating another run', async () => {
  const { local } = setup();
  const identity = {
    agentId: 'agent-task-promotion',
    recordingRunId: 'recording-run-task-promotion'
  };
  const opened = await journal.recordDispatch(entry({
    ...identity,
    recordingCallId: 'task-promotion-read',
    task: 'mcp:read-page',
    taskSource: 'tool',
    tool: 'mcp:read-page'
  }));
  let detail = await allDetail(opened.sessionId);
  assert.equal(detail.session.task, 'mcp:read-page');
  assert.equal(detail.session.taskSource, 'tool');

  const capability = await journal.recordDispatch(entry({
    ...identity,
    recordingCallId: 'task-promotion-capability',
    task: 'Capability: collect-page-data',
    taskSource: 'capability',
    tool: 'mcp:capabilities-invoke'
  }));
  assert.equal(capability.sessionId, opened.sessionId);
  detail = await allDetail(opened.sessionId);
  assert.equal(detail.session.task, 'Capability: collect-page-data');
  assert.equal(detail.session.taskSource, 'capability');
  assert.equal(local.state.fsbSessionIndex[0].task, 'Capability: collect-page-data');

  const visual = await journal.recordDispatch(entry({
    ...identity,
    recordingCallId: 'task-promotion-visual',
    task: 'Finish the visual workflow',
    taskSource: 'visual-session',
    tool: 'click'
  }));
  assert.equal(visual.sessionId, opened.sessionId);
  detail = await allDetail(opened.sessionId);
  assert.equal(detail.session.task, 'Finish the visual workflow');
  assert.equal(detail.session.taskSource, 'visual-session');
  assert.equal(local.state.fsbSessionIndex[0].task, 'Finish the visual workflow');

  await journal.recordDispatch(entry({
    ...identity,
    recordingCallId: 'task-promotion-late-tool',
    task: 'click',
    taskSource: 'tool',
    tool: 'click'
  }));
  const terminal = await journal.recordTaskOutcome(entry({
    ...identity,
    recordingCallId: 'task-promotion-terminal',
    task: 'complete_task',
    taskSource: 'tool',
    tool: 'complete_task'
  }), {
    outcome: 'success',
    status: 'completed',
    summary: 'Done',
    text: 'Done'
  });

  detail = await allDetail(opened.sessionId);
  assert.equal(detail.session.task, 'Finish the visual workflow');
  assert.equal(detail.session.taskSource, 'visual-session');
  assert.equal(local.state.fsbSessionIndex[0].task, 'Finish the visual workflow');
  assert.equal(terminal.candidate.task, 'Finish the visual workflow');
  assert.equal(terminal.sessionId, opened.sessionId);
  assert.equal(new Set(detail.events.map((event) => event.runId)).size, 1);
});

test('the first dispatch promotes the title of a durable call placeholder', async () => {
  const { local } = setup();
  const identity = {
    agentId: 'agent-placeholder-promotion',
    recordingRunId: 'recording-run-placeholder-promotion',
    recordingCallId: 'recording-call-placeholder-promotion',
    client: 'Codex',
    task: 'mcp:execute-action',
    taskSource: 'tool',
    tool: 'click'
  };
  const opened = await journal.beginCall(identity, 120_000);

  await journal.recordDispatch(entry({
    ...identity,
    task: 'Finish checkout',
    taskSource: 'visual-session',
    requestPayload: {
      agentId: identity.agentId,
      recordingRunId: identity.recordingRunId,
      recordingCallId: identity.recordingCallId,
      visualSession: { visualReason: 'Finish checkout' },
      params: { selector: '#buy' }
    }
  }));

  const detail = await allDetail(opened.sessionId);
  assert.equal(detail.session.task, 'Finish checkout');
  assert.equal(detail.session.taskSource, 'visual-session');
  assert.equal(local.state.fsbSessionIndex[0].task, 'Finish checkout');
});

test('a read-first tool title promotes directly to the later visual action title', async () => {
  const { local } = setup();
  const identity = {
    agentId: 'agent-direct-visual-promotion',
    recordingRunId: 'recording-run-direct-visual-promotion'
  };
  const opened = await journal.recordDispatch(entry({
    ...identity,
    recordingCallId: 'direct-visual-read',
    task: 'mcp:read-page',
    taskSource: 'tool',
    tool: 'mcp:read-page'
  }));
  const promoted = await journal.recordDispatch(entry({
    ...identity,
    recordingCallId: 'direct-visual-action',
    task: 'Review the rendered dashboard',
    taskSource: 'visual-session',
    tool: 'click'
  }));

  assert.equal(promoted.sessionId, opened.sessionId);
  const detail = await allDetail(opened.sessionId);
  assert.equal(detail.session.task, 'Review the rendered dashboard');
  assert.equal(detail.session.taskSource, 'visual-session');
  assert.equal(local.state.fsbSessionIndex[0].task, 'Review the rendered dashboard');
});

test('stale-agent physical attempts journal independently while aliases deduplicate within each attempt', async () => {
  setup();
  const staleAttempt = entry({
    agentId: 'agent-stale-attempt',
    recordingRunId: 'recording-run-stale-attempt',
    recordingCallId: 'recording-call-stale-attempt'
  });
  const freshAttempt = entry({
    agentId: 'agent-fresh-attempt',
    recordingRunId: 'recording-run-fresh-attempt',
    recordingCallId: 'recording-call-fresh-attempt'
  });

  const stale = await journal.recordDispatch(staleAttempt);
  const fresh = await journal.recordDispatch(freshAttempt);
  assert.notEqual(stale.sessionId, fresh.sessionId);

  assert.equal((await journal.recordDispatch({ ...staleAttempt })).deduplicated, true);
  assert.equal((await journal.recordDispatch({ ...freshAttempt })).deduplicated, true);
  assert.deepEqual((await allDetail(stale.sessionId)).events.map((event) => event.kind), [
    'run.start', 'tool.call'
  ]);
  assert.deepEqual((await allDetail(fresh.sessionId)).events.map((event) => event.kind), [
    'run.start', 'tool.call'
  ]);
});

test('call-id deduplication rejects cross-agent and cross-run identity collisions', async () => {
  setup();
  const victimIdentity = {
    agentId: 'agent-call-victim',
    recordingRunId: 'recording-run-call-victim'
  };
  const attackerIdentity = {
    agentId: 'agent-call-attacker',
    recordingRunId: 'recording-run-call-attacker'
  };
  const sharedCallId = 'recording-call-shared-collision';
  const victim = await journal.recordDispatch(entry({
    ...victimIdentity,
    recordingCallId: sharedCallId
  }));
  const attacker = await journal.recordDispatch(entry({
    ...attackerIdentity,
    recordingCallId: 'recording-call-attacker-first'
  }));

  assert.equal(await journal.hasCall(
    victimIdentity.agentId,
    victimIdentity.recordingRunId,
    sharedCallId
  ), true);
  await assert.rejects(
    journal.hasCall(attackerIdentity.agentId, attackerIdentity.recordingRunId, sharedCallId),
    (error) => error && error.code === 'journal_call_identity_conflict'
  );
  await assert.rejects(
    journal.hasCall(victimIdentity.agentId, 'recording-run-call-other', sharedCallId),
    (error) => error && error.code === 'journal_call_identity_conflict'
  );

  const collided = await journal.recordDispatch(entry({
    ...attackerIdentity,
    recordingCallId: sharedCallId,
    tool: 'mcp:get-tabs'
  }));
  assert.equal(collided.recorded, false);
  assert.equal(collided.degraded, true);

  const terminal = await journal.recordTaskOutcome(entry({
    ...attackerIdentity,
    recordingCallId: sharedCallId,
    tool: 'complete_task'
  }), {
    outcome: 'success',
    status: 'completed',
    summary: 'Must not close the victim',
    text: 'Must not close the victim'
  });
  assert.equal(terminal.recorded, false);
  assert.equal(terminal.degraded, true);

  const victimDetail = await allDetail(victim.sessionId);
  assert.equal(victimDetail.session.status, 'running');
  assert.equal(victimDetail.session.recordingState, 'healthy');
  assert.deepEqual(victimDetail.events.map((event) => event.kind), ['run.start', 'tool.call']);

  const attackerDetail = await allDetail(attacker.sessionId);
  assert.equal(attackerDetail.session.status, 'running');
  assert.equal(attackerDetail.session.recordingState, 'degraded');
  assert.equal(attackerDetail.session.degradedReason, 'journal_append_failed');
  assert.deepEqual(attackerDetail.events.map((event) => event.kind), ['run.start', 'tool.call']);
});

test('large payloads are content-addressed, compressed, paged by bytes, deduplicated, and ref-count deleted', async () => {
  const { backend } = setup();
  const large = 'x'.repeat(600 * 1024);
  const first = await journal.recordDispatch(entry({
    agentId: 'agent-artifact-a',
    recordingRunId: 'artifact-run-a',
    recordingCallId: 'artifact-call-a',
    response: { success: true, value: large }
  }));
  const second = await journal.recordDispatch(entry({
    agentId: 'agent-artifact-b',
    recordingRunId: 'artifact-run-b',
    recordingCallId: 'artifact-call-b',
    response: { success: true, value: large }
  }));

  assert.equal(backend._state.artifacts.size, 1);
  const artifact = [...backend._state.artifacts.values()][0];
  assert.equal(artifact.refCount, 2);
  assert.ok(['gzip', 'identity'].includes(artifact.encoding));

  const detail = await allDetail(first.sessionId);
  const descriptor = detail.events.find((event) => event.kind === 'tool.call').metadata.result;
  assert.equal(descriptor.storage, 'artifact');
  assert.equal(descriptor.artifactId, artifact.id);
  assert.ok(descriptor.preview.length <= 2048);

  const chunk = await journal.readSessionArtifact({
    sessionId: first.sessionId,
    artifactId: artifact.id,
    offset: 0,
    limit: 1024
  });
  assert.ok(Buffer.byteLength(chunk.text, 'utf8') <= 1024);
  assert.equal(chunk.nextOffset, 1024);
  assert.ok(chunk.totalLength > chunk.nextOffset);

  const exportChunks = [];
  assert.equal(await journal.streamSessionExport(first.sessionId, 'json', async (value) => {
    exportChunks.push(value);
  }), true);
  assert.ok(exportChunks.length >= 3);
  assert.ok(exportChunks.every((value) => Buffer.byteLength(value, 'utf8') <= 256 * 1024));
  const exported = JSON.parse(exportChunks.join(''));
  const exportedCall = exported.events.find((event) => event.kind === 'tool.call');
  assert.equal(exportedCall.metadata.resultValue.value.length, large.length);

  await journal.deleteSession(first.sessionId);
  assert.equal(backend._state.artifacts.get(artifact.id).refCount, 1);
  await journal.deleteSession(second.sessionId);
  assert.equal(backend._state.artifacts.has(artifact.id), false);
});

test('streaming export pages text and enforces the 32 MiB per-artifact boundary before reads', async () => {
  const fixture = setup();
  const exactValue = 'x'.repeat(journal.EXPORT_ARTIFACT_MAX_BYTES - 2);
  const exact = await journal.recordDispatch(entry({
    agentId: 'agent-export-boundary',
    recordingRunId: 'recording-run-export-boundary',
    recordingCallId: 'recording-call-export-boundary',
    response: exactValue
  }));
  let emittedBytes = 0;
  assert.equal(await journal.streamSessionExport(exact.sessionId, 'json', async (chunk) => {
    emittedBytes += Buffer.byteLength(chunk, 'utf8');
  }), true);
  assert.ok(emittedBytes > journal.EXPORT_ARTIFACT_MAX_BYTES);

  const expectedText = await journal.exportHumanReadable(exact.sessionId);
  const originalGetAllEvents = fixture.backend.getAllEvents;
  fixture.backend.getAllEvents = async () => { throw new Error('streamed text must use event pages'); };
  const textChunks = [];
  assert.equal(await journal.streamSessionExport(exact.sessionId, 'text', async (chunk) => {
    textChunks.push(chunk);
  }), true);
  assert.equal(textChunks.join(''), expectedText);
  fixture.backend.getAllEvents = originalGetAllEvents;

  const rawEvents = fixture.backend._state.events.get(exact.sessionId);
  const toolEvent = rawEvents.find((event) => event.kind === 'tool.call');
  toolEvent.metadata.result.byteLength = journal.EXPORT_ARTIFACT_MAX_BYTES + 1;
  let artifactReads = 0;
  const originalGetArtifact = fixture.backend.getArtifact.bind(fixture.backend);
  fixture.backend.getArtifact = async (...args) => {
    artifactReads++;
    return originalGetArtifact(...args);
  };
  journal._setBackendForTests(fixture.backend);
  await assert.rejects(
    journal.streamSessionExport(exact.sessionId, 'json', async () => {}),
    (error) => error.code === 'journal_export_artifact_too_large'
  );
  assert.equal(artifactReads, 0);
});

test('compression fallback keeps a replayable identity artifact', async () => {
  const { backend } = setup();
  const priorCompressionStream = globalThis.CompressionStream;
  try {
    globalThis.CompressionStream = undefined;
    await journal.recordDispatch(entry({
      recordingRunId: 'compression-fallback-run',
      recordingCallId: 'compression-fallback-call',
      response: { success: true, value: 'z'.repeat(70 * 1024) }
    }));
  } finally {
    globalThis.CompressionStream = priorCompressionStream;
  }
  const artifact = [...backend._state.artifacts.values()][0];
  assert.ok(artifact);
  assert.equal(artifact.encoding, 'identity');
});

test('artifact previews are byte-capped and corrupted content disables trusted replay', async () => {
  const { backend } = setup();
  const captured = await journal.recordDispatch(entry({
    recordingRunId: 'artifact-integrity-run',
    recordingCallId: 'artifact-integrity-call',
    response: { success: true, value: '🙂'.repeat(20 * 1024) }
  }));
  const detail = await allDetail(captured.sessionId);
  const descriptor = detail.events.find((event) => event.kind === 'tool.call').metadata.result;
  assert.equal(descriptor.storage, 'artifact');
  assert.ok(Buffer.byteLength(descriptor.preview, 'utf8') <= 2048);

  const artifact = backend._state.artifacts.get(descriptor.artifactId);
  const corruptBytes = new Uint8Array(artifact.bytes.slice(0));
  corruptBytes[Math.floor(corruptBytes.length / 2)] ^= 0xff;
  artifact.bytes = corruptBytes.buffer;
  const projection = await journal.getReplayProjection(captured.sessionId);
  assert.equal(projection.replayTrusted, false);
  assert.equal((await allDetail(captured.sessionId)).session.degradedReason, 'artifact_corrupt');
});

test('inline and artifact descriptor tampering disables trusted replay', async () => {
  async function projectCorruption(name, response, mutate) {
    const { backend } = setup();
    const captured = await journal.recordDispatch(entry({
      agentId: `agent-descriptor-${name}`,
      recordingRunId: `recording-run-descriptor-${name}`,
      recordingCallId: `recording-call-descriptor-${name}`,
      params: { selector: '#original' },
      response
    }));
    const event = backend._state.events.get(captured.sessionId)
      .find((candidate) => candidate.kind === 'tool.call');
    mutate(event.metadata);
    const projection = await journal.getReplayProjection(captured.sessionId);
    assert.equal(projection.replayTrusted, false, `${name} must disable trusted replay`);
    assert.equal(
      (await allDetail(captured.sessionId)).session.degradedReason,
      'artifact_corrupt',
      `${name} must be classified as corrupt`
    );
  }

  await projectCorruption('inline-value', { success: true, value: 'original' }, (metadata) => {
    metadata.request.inline.params.selector = '#tampered';
  });
  await projectCorruption('inline-length', { success: true, value: 'original' }, (metadata) => {
    metadata.result.byteLength++;
  });
  await projectCorruption('inline-digest', { success: true, value: 'original' }, (metadata) => {
    metadata.result.sha256 = '0'.repeat(64);
  });
  await projectCorruption('malformed-storage', { success: true, value: 'original' }, (metadata) => {
    metadata.result.storage = 'unexpected';
  });
  await projectCorruption('missing-descriptor', { success: true, value: 'original' }, (metadata) => {
    delete metadata.result;
  });
  await projectCorruption('artifact-descriptor', {
    success: true,
    value: 'x'.repeat(70 * 1024)
  }, (metadata) => {
    assert.equal(metadata.result.storage, 'artifact');
    metadata.result.sha256 = '0'.repeat(64);
  });
});

test('degradation detected during replay projection preserves concurrent append metadata', async () => {
  const { backend } = setup();
  const identity = {
    agentId: 'agent-projection-race',
    recordingRunId: 'recording-run-projection-race'
  };
  const first = await journal.recordDispatch(entry({
    ...identity,
    recordingCallId: 'recording-call-projection-race-one',
    response: { success: true, value: 'x'.repeat(70 * 1024) }
  }));

  const originalGetArtifact = backend.getArtifact.bind(backend);
  let releaseArtifact;
  let artifactReadStarted;
  const artifactRead = new Promise((resolve) => { artifactReadStarted = resolve; });
  const release = new Promise((resolve) => { releaseArtifact = resolve; });
  let blockNextArtifactRead = true;
  backend.getArtifact = async function (artifactId) {
    if (blockNextArtifactRead) {
      blockNextArtifactRead = false;
      artifactReadStarted();
      await release;
      return null;
    }
    return originalGetArtifact(artifactId);
  };

  const projectionPromise = journal.getReplayProjection(first.sessionId);
  await artifactRead;
  await journal.recordDispatch(entry({
    ...identity,
    recordingCallId: 'recording-call-projection-race-two',
    response: { success: true, value: 'second' }
  }));
  releaseArtifact();

  const projection = await projectionPromise;
  assert.equal(projection.replayTrusted, false);
  assert.equal(projection.session.degradedReason, 'missing_artifact');
  const afterProjection = await backend.getRun(first.sessionId);
  assert.deepEqual({
    actionCount: afterProjection.actionCount,
    eventCount: afterProjection.eventCount,
    nextSequence: afterProjection.nextSequence
  }, {
    actionCount: 2,
    eventCount: 3,
    nextSequence: 3
  });

  await journal.recordDispatch(entry({
    ...identity,
    recordingCallId: 'recording-call-projection-race-three',
    response: { success: true, value: 'third' }
  }));
  const events = await backend.getAllEvents(first.sessionId);
  assert.deepEqual(events.map((event) => event.sequence), [0, 1, 2, 3]);
  assert.equal((await backend.getRun(first.sessionId)).actionCount, 3);
});

test('a rejected full payload retains one compact budget marker and disables trusted replay', async () => {
  const { backend } = setup();
  const getActualTotalBytes = backend.getTotalBytes.bind(backend);
  let budgetChecks = 0;
  backend.getTotalBytes = async () => budgetChecks++ === 0
    ? journal.MAX_ENCODED_BYTES
    : getActualTotalBytes();
  backend.listClosedOldest = async () => [];
  journal._setBackendForTests(backend);

  const result = await journal.recordDispatch(entry({
    recordingRunId: 'quota-exhausted-run',
    recordingCallId: 'quota-exhausted-call',
    requestPayload: {
      agentId: 'agent-alpha',
      recordingRunId: 'quota-exhausted-run',
      recordingCallId: 'quota-exhausted-call',
      params: { text: 'retained only as a preview' }
    }
  }));
  const detail = await allDetail(result.sessionId);
  const event = detail.events.find((candidate) => candidate.kind === 'tool.call');
  assert.equal(event.metadata.request.storage, 'omitted');
  assert.equal(event.metadata.result.storage, 'omitted');
  assert.equal(event.metadata.storageBudgetExhausted, true);
  assert.equal(detail.events.filter((candidate) => candidate.kind === 'tool.call').length, 1);
  assert.equal(detail.session.recordingState, 'degraded');
  assert.equal(detail.session.replayTrusted, false);
  const projection = await journal.getReplayProjection(result.sessionId);
  assert.equal(projection.replayTrusted, false);

  const bytesAfterMarker = await getActualTotalBytes();
  backend.getTotalBytes = async () => journal.MAX_ENCODED_BYTES;
  await journal.recordDispatch(entry({
    recordingRunId: 'quota-exhausted-run',
    recordingCallId: 'quota-exhausted-call-two'
  }));
  await journal.recordDispatch(entry({
    recordingRunId: 'quota-exhausted-run',
    recordingCallId: 'quota-exhausted-call-three'
  }));
  assert.equal(await getActualTotalBytes(), bytesAfterMarker);
  assert.equal((await allDetail(result.sessionId)).events.filter((candidate) => candidate.kind === 'tool.call').length, 1);
});

test('metadata-only quota degradation closes terminal and idle runs when no marker can fit', async () => {
  const fixture = setup();
  const getActualTotalBytes = fixture.backend.getTotalBytes.bind(fixture.backend);
  fixture.backend.getTotalBytes = async () => journal.MAX_ENCODED_BYTES;
  fixture.backend.listClosedOldest = async () => [];

  const terminal = await journal.recordTaskOutcome(entry({
    agentId: 'agent-metadata-terminal',
    recordingRunId: 'metadata-terminal-run',
    recordingCallId: 'metadata-terminal-call',
    tool: 'complete_task'
  }), {
    outcome: 'success', status: 'completed', summary: 'Metadata survived', text: 'Metadata survived'
  });
  const terminalDetail = await allDetail(terminal.sessionId);
  assert.equal(terminalDetail.events.length, 0);
  assert.equal(terminalDetail.session.status, 'completed');
  assert.equal(terminalDetail.session.recordingState, 'degraded');
  assert.equal(terminalDetail.session.degradedReason, 'storage_budget_exhausted');
  assert.ok(Number.isFinite(terminalDetail.session.endTime));
  assert.ok(terminal.candidate);
  assert.equal(terminal.candidate.sessionId, terminal.sessionId);

  const idle = await journal.recordDispatch(entry({
    agentId: 'agent-metadata-idle',
    recordingRunId: 'metadata-idle-run',
    recordingCallId: 'metadata-idle-call'
  }));
  const bytesBeforeIdleClose = await getActualTotalBytes();
  fixture.advance(journal.IDLE_MS + 1);
  assert.equal((await journal.handleAlarm({ name: journal.IDLE_ALARM_PREFIX + idle.sessionId })).action, 'closed');
  const idleDetail = await allDetail(idle.sessionId);
  assert.equal(idleDetail.events.length, 0);
  assert.equal(idleDetail.session.status, 'stopped');
  assert.equal(idleDetail.session.recordingState, 'degraded');
  assert.ok(Number.isFinite(idleDetail.session.endTime));
  assert.equal(await getActualTotalBytes(), bytesBeforeIdleClose);
});

test('endCall preserves a metadata-only degraded run until its idle deadline', async () => {
  const fixture = setup();
  fixture.backend.getTotalBytes = async () => journal.MAX_ENCODED_BYTES;
  fixture.backend.listClosedOldest = async () => [];

  const quotaEntry = entry({
    agentId: 'agent-metadata-lease',
    recordingRunId: 'metadata-lease-run',
    recordingCallId: 'metadata-lease-call'
  });
  await journal.beginCall(quotaEntry, 120_000);
  const recorded = await journal.recordDispatch(quotaEntry);
  const ended = await journal.endCall(quotaEntry);

  assert.equal(ended.ended, true);
  assert.equal(ended.removedPlaceholder, undefined);
  const persisted = await fixture.backend.getRun(recorded.sessionId);
  assert.deepEqual(persisted.activeCalls, []);
  let detail = await allDetail(recorded.sessionId);
  assert.equal(detail.events.length, 0);
  assert.equal(detail.session.status, 'running');
  assert.equal(detail.session.recordingState, 'degraded');
  assert.equal(detail.session.degradedReason, 'storage_budget_exhausted');

  fixture.advance(journal.IDLE_MS + 1);
  assert.equal(
    (await journal.handleAlarm({ name: journal.IDLE_ALARM_PREFIX + recorded.sessionId })).action,
    'closed'
  );
  detail = await allDetail(recorded.sessionId);
  assert.equal(detail.events.length, 0);
  assert.equal(detail.session.status, 'stopped');
  assert.equal(detail.session.recordingState, 'degraded');
  assert.equal(detail.session.degradedReason, 'storage_budget_exhausted');
});

test('the backend rejects over-budget event and artifact transactions without partial writes', async () => {
  const backend = journal._createMemoryBackend();
  const run = { id: 'guarded-run', type: 'recording', status: 'running' };
  await assert.rejects(
    backend.putBundle(run, [{
      runId: run.id, sequence: 0, kind: 'tool.call', byteCost: journal.MAX_ENCODED_BYTES + 1
    }], [], []),
    (error) => error && error.code === 'storage_budget_exhausted'
  );
  assert.equal(backend._state.runs.size, 0);
  assert.equal(await backend.getTotalBytes(), 0);

  await assert.rejects(
    backend.putBundle(run, [], [{
      id: 'oversized-artifact', storedBytes: journal.MAX_ENCODED_BYTES + 1, refDelta: 1
    }], []),
    (error) => error && error.code === 'storage_budget_exhausted'
  );
  assert.equal(backend._state.artifacts.size, 0);
  assert.equal(await backend.getTotalBytes(), 0);

  await backend.putBundle(run, [], [], []);
  assert.equal(backend._state.runs.has(run.id), true);
});

test('a failed first append permanently degrades the recovered run without changing backends', async () => {
  const { backend, local } = setup();
  const originalPutBundle = backend.putBundle.bind(backend);
  let failOnce = true;
  backend.putBundle = async (...args) => {
    if (failOnce) {
      failOnce = false;
      throw new Error('simulated journal outage');
    }
    return originalPutBundle(...args);
  };
  journal._setBackendForTests(backend);

  const first = await journal.recordDispatch(entry({
    agentId: 'agent-gap',
    recordingRunId: 'recording-run-gap',
    recordingCallId: 'recording-call-gap-one'
  }));
  assert.equal(first.degraded, true);
  assert.equal((local.state.fsbSessionIndex || []).length, 1);

  const recovered = await journal.recordDispatch(entry({
    agentId: 'agent-gap',
    recordingRunId: 'recording-run-gap',
    recordingCallId: 'recording-call-gap-two'
  }));
  assert.equal(recovered.recorded, true);
  const detail = await allDetail(recovered.sessionId);
  assert.equal(detail.session.storageBackend, 'journal-v2');
  assert.equal(detail.session.recordingState, 'degraded');
  assert.equal(detail.session.degradedReason, 'journal_append_failed');
  assert.equal(detail.session.replayTrusted, false);
  assert.deepEqual((local.state.fsbSessionIndex || []).map((row) => row.id), [recovered.sessionId]);
});

test('a first-append gap survives a service-worker restart through its lightweight summary', async () => {
  const fixture = setup();
  fixture.backend.putBundle = async () => { throw new Error('simulated durable outage'); };
  const failed = await journal.recordDispatch(entry({
    agentId: 'agent-restart-gap',
    recordingRunId: 'recording-run-restart-gap',
    recordingCallId: 'recording-call-restart-gap-one'
  }));
  assert.equal(failed.degraded, true);
  assert.equal(fixture.local.state.fsbSessionIndex[0].journalGap, true);

  const restartedBackend = journal._resetForTests();
  journal._setBackendForTests(restartedBackend);
  journal._setLocalStorageShim(fixture.local);
  journal._setTimeShim({ now: () => fixture.now() + 1 });
  journal._setAlarmShim({ async create() {}, async clear() {} });
  const recovered = await journal.recordDispatch(entry({
    agentId: 'agent-restart-gap',
    recordingRunId: 'recording-run-restart-gap',
    recordingCallId: 'recording-call-restart-gap-two'
  }));
  const detail = await allDetail(recovered.sessionId);
  assert.equal(detail.session.recordingState, 'degraded');
  assert.equal(detail.session.replayTrusted, false);
  assert.equal(detail.session.journalGap, false);
  assert.deepEqual(fixture.local.state.fsbSessionIndex.map((row) => row.id), [recovered.sessionId]);
});

test('a failed index projection never degrades a committed journal run and startup repairs it', async () => {
  const fixture = setup();
  const originalSet = fixture.local.set.bind(fixture.local);
  let failIndexWrite = true;
  fixture.local.set = async (values) => {
    if (failIndexWrite) {
      failIndexWrite = false;
      throw new Error('simulated chrome.storage outage');
    }
    return originalSet(values);
  };

  const captured = await journal.recordDispatch(entry({
    agentId: 'agent-index-repair',
    recordingRunId: 'recording-run-index-repair',
    recordingCallId: 'recording-call-index-repair'
  }));
  assert.equal(captured.recorded, true);
  assert.equal(captured.degraded, undefined);
  assert.equal(fixture.local.state.fsbSessionIndex, undefined);

  const detail = await allDetail(captured.sessionId);
  assert.equal(detail.session.recordingState, 'healthy');
  assert.equal(detail.session.replayTrusted, true);
  assert.equal(detail.session.journalGap, false);

  fixture.local.state.fsbSessionIndex = [{
    id: 'legacy-session',
    mode: 'autopilot',
    storageBackend: 'legacy-v1',
    startTime: fixture.now() - 1
  }];
  await journal.initialize(30);

  assert.deepEqual(
    fixture.local.state.fsbSessionIndex.map((row) => row.id).sort(),
    ['legacy-session', captured.sessionId].sort()
  );
  assert.equal((await allDetail(captured.sessionId)).session.recordingState, 'healthy');
});

test('terminal, idle, late-event, and corrupt-artifact integrity states fail closed', async () => {
  const fixture = setup();
  const terminalEntry = entry({
    recordingRunId: 'terminal-run-one',
    recordingCallId: 'terminal-call-one'
  });
  const opened = await journal.recordDispatch(terminalEntry);
  const terminalAction = entry({
    recordingRunId: 'terminal-run-one',
    recordingCallId: 'terminal-call-two',
    tool: 'complete_task',
    response: { success: true, status: 'completed' }
  });
  await journal.recordDispatch(terminalAction);
  await journal.recordTaskOutcome(terminalAction, {
    outcome: 'success',
    status: 'completed',
    summary: 'Finished safely',
    text: 'Finished safely'
  });
  let detail = await allDetail(opened.sessionId);
  assert.equal(detail.session.status, 'completed');
  assert.equal(detail.events.at(-1).kind, 'run.complete');
  assert.deepEqual(detail.events.map((event) => event.kind), [
    'run.start', 'tool.call', 'tool.call', 'run.complete'
  ]);

  await journal.recordDispatch(entry({
    recordingRunId: 'terminal-run-one',
    recordingCallId: 'late-terminal-call',
    tool: 'mcp:get-tabs'
  }));
  detail = await allDetail(opened.sessionId);
  assert.equal(detail.session.recordingState, 'degraded');
  assert.equal(detail.session.replayTrusted, false);
  assert.equal(detail.events.at(-1).metadata.lateAfterClose, true);

  const idle = await journal.recordDispatch(entry({
    agentId: 'agent-idle',
    recordingRunId: 'idle-recording-run',
    recordingCallId: 'idle-recording-call'
  }));
  fixture.advance(journal.IDLE_MS + 1);
  const idleResult = await journal.handleAlarm({ name: journal.IDLE_ALARM_PREFIX + idle.sessionId });
  assert.equal(idleResult.action, 'closed');
  const idleDetail = await allDetail(idle.sessionId);
  assert.equal(idleDetail.session.status, 'stopped');
  assert.deepEqual(idleDetail.events.map((event) => event.kind), [
    'run.start', 'tool.call', 'run.complete'
  ]);

  const corrupt = await journal.recordDispatch(entry({
    agentId: 'agent-corrupt',
    recordingRunId: 'corrupt-recording-run',
    recordingCallId: 'corrupt-recording-call',
    response: { success: true, value: 'c'.repeat(70 * 1024) }
  }));
  const corruptDetail = await allDetail(corrupt.sessionId);
  const artifactId = corruptDetail.events.find((event) => event.kind === 'tool.call').metadata.result.artifactId;
  fixture.backend._state.artifacts.delete(artifactId);
  const projection = await journal.getReplayProjection(corrupt.sessionId);
  assert.equal(projection.replayTrusted, false);
  assert.equal((await allDetail(corrupt.sessionId)).session.degradedReason, 'missing_artifact');
});

test('durable call leases keep long and concurrent MCP work inside its recording run', async () => {
  const fixture = setup();
  const firstEntry = entry({
    agentId: 'agent-lease',
    recordingRunId: 'recording-run-lease',
    recordingCallId: 'recording-call-first'
  });
  const opened = await journal.recordDispatch(firstEntry);

  fixture.advance(45_000);
  const longIdentity = {
    agentId: 'agent-lease',
    recordingRunId: 'recording-run-lease',
    recordingCallId: 'recording-call-long',
    tool: 'trigger',
    task: 'mcp:trigger'
  };
  await journal.beginCall(longIdentity, 125_000);
  fixture.advance(16_000);
  assert.equal(
    (await journal.handleAlarm({ name: journal.IDLE_ALARM_PREFIX + opened.sessionId })).action,
    'rearmed'
  );
  assert.equal((await allDetail(opened.sessionId)).session.status, 'running');

  fixture.advance(100_000);
  await journal.recordDispatch(entry({
    ...longIdentity,
    requestPayload: { ...longIdentity, recordingLeaseMs: 125_000, params: { selector: '#ready' } },
    response: { success: true, outcome: 'fired' }
  }));
  await journal.endCall(longIdentity);
  let detail = await allDetail(opened.sessionId);
  assert.equal(detail.session.recordingState, 'healthy');
  assert.equal(detail.session.replayTrusted, true);
  assert.equal(detail.events.at(-1).metadata.lateAfterClose, false);
  assert.equal(Object.prototype.hasOwnProperty.call(detail.session, 'activeCalls'), false);

  const jsonChunks = [];
  await journal.streamSessionExport(opened.sessionId, 'json', async (chunk) => jsonChunks.push(chunk));
  assert.equal(jsonChunks.join('').includes('recordingLeaseMs'), false);

  const concurrentA = {
    agentId: 'agent-concurrent-lease', recordingRunId: 'recording-run-concurrent-lease',
    recordingCallId: 'recording-call-concurrent-a', tool: 'mcp:get-tabs'
  };
  const concurrentB = {
    ...concurrentA, recordingCallId: 'recording-call-concurrent-b', tool: 'mcp:read-page'
  };
  const leaseA = await journal.beginCall(concurrentA, 125_000);
  await journal.beginCall(concurrentB, 125_000);
  await journal.recordDispatch(entry(concurrentB));
  await journal.endCall(concurrentB);
  fixture.advance(61_000);
  assert.equal(
    (await journal.handleAlarm({ name: journal.IDLE_ALARM_PREFIX + leaseA.sessionId })).action,
    'rearmed'
  );
  await journal.recordDispatch(entry(concurrentA));
  await journal.endCall(concurrentA);
  detail = await allDetail(leaseA.sessionId);
  assert.equal(detail.session.recordingState, 'healthy');
  assert.equal(detail.events.filter((event) => event.kind === 'tool.call').length, 2);
});

test('call leases clean up placeholders, expire across restart, and never reopen terminal runs', async () => {
  const fixture = setup();
  const invalid = await journal.beginCall({
    agentId: 'agent-invalid', recordingRunId: 'short', recordingCallId: 'short'
  }, 120_000);
  assert.equal(invalid.accepted, false);
  assert.equal(fixture.backend._state.runs.size, 0);

  const failedIdentity = {
    agentId: 'agent-failed-route', recordingRunId: 'recording-run-failed-route',
    recordingCallId: 'recording-call-failed-route', tool: 'mcp:read-page'
  };
  await journal.beginCall(failedIdentity, 120_000);
  assert.equal(fixture.backend._state.runs.size, 1);
  const failedEnd = await journal.endCall(failedIdentity);
  assert.equal(failedEnd.removedPlaceholder, true);
  assert.equal(fixture.backend._state.runs.size, 0);

  const startupEntry = entry({
    agentId: 'agent-startup-prune', recordingRunId: 'recording-run-startup-prune',
    recordingCallId: 'recording-call-startup-event'
  });
  const startup = await journal.recordDispatch(startupEntry);
  await journal.beginCall({
    agentId: startupEntry.agentId,
    recordingRunId: startupEntry.recordingRunId,
    recordingCallId: 'recording-call-startup-pending'
  }, 1_000);
  fixture.advance(2_000);
  await journal.initialize(30);
  const startupRun = fixture.backend._state.runs.get(startup.sessionId);
  assert.deepEqual(startupRun.activeCalls, []);
  assert.equal(startupRun.deadlineAt, startupRun.lastActivityAt + journal.IDLE_MS);
  assert.equal(startupRun.status, 'running');

  const expiringEntry = entry({
    agentId: 'agent-restarted-lease', recordingRunId: 'recording-run-restarted-lease',
    recordingCallId: 'recording-call-restarted-first'
  });
  const expiring = await journal.recordDispatch(expiringEntry);
  await journal.beginCall({
    agentId: expiringEntry.agentId,
    recordingRunId: expiringEntry.recordingRunId,
    recordingCallId: 'recording-call-restarted-pending'
  }, 120_000);
  fixture.advance(120_001);
  journal._resetForTests();
  journal._setBackendForTests(fixture.backend);
  journal._setLocalStorageShim(fixture.local);
  journal._setTimeShim({ now: () => fixture.now() });
  journal._setAlarmShim({ async create() {}, async clear() {} });
  assert.equal(
    (await journal.handleAlarm({ name: journal.IDLE_ALARM_PREFIX + expiring.sessionId })).action,
    'closed'
  );
  assert.equal((await allDetail(expiring.sessionId)).session.status, 'stopped');

  const terminalEntry = entry({
    agentId: 'agent-terminal-lease', recordingRunId: 'recording-run-terminal-lease',
    recordingCallId: 'recording-call-terminal-lease', tool: 'complete_task',
    response: { success: true, status: 'completed' }
  });
  await journal.beginCall(terminalEntry, 120_000);
  const terminal = await journal.recordDispatch(terminalEntry);
  await journal.recordTaskOutcome(terminalEntry, { outcome: 'success', status: 'completed', summary: 'Done' });
  assert.equal((await journal.endCall(terminalEntry)).terminal, true);
  assert.equal((await journal.beginCall({ ...terminalEntry, recordingCallId: 'recording-call-after-terminal' }, 120_000)).terminal, true);
  assert.equal((await allDetail(terminal.sessionId)).session.status, 'completed');
});

test('retention and byte-budget eviction remove oldest closed runs but preserve open runs', async () => {
  const fixture = setup();
  const closed = await journal.recordDispatch(entry({
    agentId: 'agent-old', recordingRunId: 'recording-run-old', recordingCallId: 'recording-call-old'
  }));
  await journal.recordTaskOutcome(entry({
    agentId: 'agent-old', recordingRunId: 'recording-run-old', recordingCallId: 'recording-call-old-terminal',
    tool: 'complete_task'
  }), { outcome: 'success', status: 'completed', summary: 'Old run done', text: 'Old run done' });
  fixture.advance(31 * 24 * 60 * 60 * 1000);
  const open = await journal.recordDispatch(entry({
    agentId: 'agent-open', recordingRunId: 'recording-run-open', recordingCallId: 'recording-call-open'
  }));

  const pruned = await journal.prune(30);
  assert.deepEqual(pruned.ids, [closed.sessionId]);
  assert.equal(await journal.hasSession(closed.sessionId), false);
  assert.equal(await journal.hasSession(open.sessionId), true);

  const evictable = await journal.recordDispatch(entry({
    agentId: 'agent-budget-old', recordingRunId: 'recording-run-budget-old',
    recordingCallId: 'recording-call-budget-old'
  }));
  await journal.recordTaskOutcome(entry({
    agentId: 'agent-budget-old', recordingRunId: 'recording-run-budget-old',
    recordingCallId: 'recording-call-budget-old-terminal', tool: 'complete_task'
  }), { outcome: 'success', status: 'completed', summary: 'Evict me', text: 'Evict me' });
  const originalGetTotalBytes = fixture.backend.getTotalBytes.bind(fixture.backend);
  fixture.backend.getTotalBytes = async () => fixture.backend._state.runs.has(evictable.sessionId)
    ? journal.MAX_ENCODED_BYTES
    : originalGetTotalBytes();

  const replacement = await journal.recordDispatch(entry({
    agentId: 'agent-budget-new', recordingRunId: 'recording-run-budget-new',
    recordingCallId: 'recording-call-budget-new'
  }));
  assert.equal(await journal.hasSession(evictable.sessionId), false);
  assert.equal(await journal.hasSession(open.sessionId), true);
  assert.equal(await journal.hasSession(replacement.sessionId), true);
});

test('startup and retention alarms honor the configured retention window', async () => {
  const fixture = setup();
  const closed = await journal.recordDispatch(entry({
    agentId: 'agent-policy-retention',
    recordingRunId: 'policy-retention-run',
    recordingCallId: 'policy-retention-call'
  }));
  await journal.recordTaskOutcome(entry({
    agentId: 'agent-policy-retention',
    recordingRunId: 'policy-retention-run',
    recordingCallId: 'policy-retention-terminal',
    tool: 'complete_task'
  }), { outcome: 'success', status: 'completed', summary: 'Done', text: 'Done' });

  fixture.advance(31 * 24 * 60 * 60 * 1000);
  await journal.initialize(45);
  assert.equal(await journal.hasSession(closed.sessionId), true);
  await journal.handleAlarm({ name: journal.RETENTION_ALARM }, 45);
  assert.equal(await journal.hasSession(closed.sessionId), true);

  fixture.advance(15 * 24 * 60 * 60 * 1000);
  await journal.handleAlarm({ name: journal.RETENTION_ALARM }, 45);
  assert.equal(await journal.hasSession(closed.sessionId), false);
});

test('count retention keeps 50 recording roots, protects active replay trees, and removes evicted data', async () => {
  const fixture = setup();
  fixture.local.state.fsbSessionIndex = [{
    id: 'legacy-session',
    mode: 'autopilot',
    storageBackend: 'legacy-v1',
    startTime: fixture.now() - 100
  }];
  const sessionIds = [];

  for (let index = 0; index < journal.SESSION_HISTORY_CAP; index++) {
    fixture.advance(1);
    const identity = {
      agentId: `agent-count-${index}`,
      recordingRunId: `recording-run-count-${index}`
    };
    const opened = await journal.recordDispatch(entry({
      ...identity,
      recordingCallId: `recording-call-count-${index}`
    }));
    sessionIds.push(opened.sessionId);
    await journal.recordTaskOutcome(entry({
      ...identity,
      recordingCallId: `recording-call-count-terminal-${index}`,
      tool: 'complete_task'
    }), {
      outcome: 'success', status: 'completed', summary: `Done ${index}`, text: `Done ${index}`
    });
  }

  await journal.persistReplayRun(sessionIds[0], {
    id: 'active-count-replay', status: 'running', nextStep: 0, steps: []
  });
  await journal.persistReplayRun(sessionIds[1], {
    id: 'closed-count-replay', status: 'replay_completed', nextStep: 0,
    finishedAt: fixture.now(), steps: []
  });

  fixture.advance(1);
  const newestIdentity = {
    agentId: 'agent-count-newest',
    recordingRunId: 'recording-run-count-newest'
  };
  const newest = await journal.recordDispatch(entry({
    ...newestIdentity,
    recordingCallId: 'recording-call-count-newest'
  }));
  await journal.recordTaskOutcome(entry({
    ...newestIdentity,
    recordingCallId: 'recording-call-count-newest-terminal',
    tool: 'complete_task'
  }), {
    outcome: 'success', status: 'completed', summary: 'Newest done', text: 'Newest done'
  });

  const roots = await fixture.backend.listRecordingRuns();
  assert.equal(roots.length, journal.SESSION_HISTORY_CAP);
  assert.equal(await journal.hasSession(sessionIds[0]), true,
    'the oldest root stays while its replay descendant is active');
  assert.equal(fixture.backend._state.runs.has('active-count-replay'), true);
  assert.equal(await journal.hasSession(sessionIds[1]), false,
    'the oldest eligible closed root is evicted');
  assert.equal(fixture.backend._state.runs.has('closed-count-replay'), false,
    'a completed replay descendant is deleted with its evicted root');
  assert.equal(fixture.backend._state.events.has(sessionIds[1]), false);
  assert.equal(await journal.hasSession(newest.sessionId), true);

  const journalRows = fixture.local.state.fsbSessionIndex.filter((row) =>
    row.storageBackend === journal.STORAGE_BACKEND && row.journalGap !== true
  );
  assert.equal(journalRows.length, journal.SESSION_HISTORY_CAP);
  assert.equal(fixture.local.state.fsbSessionIndex.some((row) => row.id === 'legacy-session'), true);
  assert.equal(fixture.local.state.fsbSessionIndex.some((row) => row.id === sessionIds[1]), false);
});

test('disabling recording permanently degrades every open recording run', async () => {
  setup();
  const opened = await journal.recordDispatch(entry({
    agentId: 'agent-recording-toggle',
    recordingRunId: 'recording-toggle-run',
    recordingCallId: 'recording-toggle-call-one'
  }));

  const degraded = await journal.degradeOpenRuns('recording_disabled');
  assert.deepEqual(degraded.ids, [opened.sessionId]);
  await journal.recordDispatch(entry({
    agentId: 'agent-recording-toggle',
    recordingRunId: 'recording-toggle-run',
    recordingCallId: 'recording-toggle-call-two',
    tool: 'mcp:get-tabs'
  }));

  const detail = await allDetail(opened.sessionId);
  assert.equal(detail.session.recordingState, 'degraded');
  assert.equal(detail.session.degradedReason, 'recording_disabled');
  assert.equal(detail.session.replayTrusted, false);
  assert.equal(detail.session.replayIntegrity, 'degraded');
  assert.deepEqual(
    detail.events.filter((event) => event.kind === 'tool.call').map((event) => event.metadata.tool),
    ['mcp:read-page', 'mcp:get-tabs']
  );
});

test('source appends invalidate replay seals and stale seal writes are rejected', async () => {
  setup();
  const opened = await journal.recordDispatch(entry({
    agentId: 'agent-seal-invalidation',
    recordingRunId: 'seal-invalidation-run',
    recordingCallId: 'seal-invalidation-call-one'
  }));
  const firstSeal = {
    version: '1.0', integrity: 'verified', provenance: 'capture',
    manifestHash: 'first-manifest-hash', receipt: { ok: true },
    receiptCid: 'first-receipt', signerKid: 'test-signer',
    counts: { executable: 1, blocked: 0 }, totalSourceSteps: 1
  };
  await journal.updateReplayMetadata(opened.sessionId, firstSeal);
  assert.equal((await journal.getReplayMetadata(opened.sessionId)).manifestHash, 'first-manifest-hash');

  await journal.recordDispatch(entry({
    agentId: 'agent-seal-invalidation',
    recordingRunId: 'seal-invalidation-run',
    recordingCallId: 'seal-invalidation-call-two',
    tool: 'mcp:get-tabs'
  }));
  assert.equal(await journal.getReplayMetadata(opened.sessionId), null);
  assert.equal((await allDetail(opened.sessionId)).session.replayIntegrity, 'pending');
  await assert.rejects(
    journal.updateReplayMetadata(opened.sessionId, firstSeal),
    (error) => error && error.code === 'replay_source_changed'
  );

  const fresh = await journal.updateReplayMetadata(opened.sessionId, {
    ...firstSeal,
    manifestHash: 'second-manifest-hash',
    receiptCid: 'second-receipt',
    totalSourceSteps: 2
  });
  assert.equal(fresh.manifestHash, 'second-manifest-hash');
  assert.equal(fresh.sourceStepCount, 2);
});

test('automatic retention pins a source with an active replay descendant, then cascades after it terminates', async () => {
  const fixture = setup();
  const sourceEntry = entry({
    agentId: 'agent-retention-parent',
    recordingRunId: 'retention-parent-run',
    recordingCallId: 'retention-parent-call'
  });
  const source = await journal.recordDispatch(sourceEntry);
  await journal.recordTaskOutcome(entry({
    agentId: 'agent-retention-parent',
    recordingRunId: 'retention-parent-run',
    recordingCallId: 'retention-parent-terminal',
    tool: 'complete_task'
  }), { outcome: 'success', status: 'completed', summary: 'Source done', text: 'Source done' });
  const attempt = {
    stepId: 'retention-step', index: 0, tool: 'mcp:read-page', attemptNumber: 1,
    status: 'executed', success: true, completedAt: fixture.now()
  };
  await journal.persistReplayRun(source.sessionId, {
    id: 'active-retention-child', status: 'running', nextStep: 1, steps: [attempt]
  });

  fixture.advance(31 * 24 * 60 * 60 * 1000);
  const pinned = await journal.prune(30);
  assert.deepEqual(pinned.ids, []);
  assert.equal(await journal.hasSession(source.sessionId), true);
  assert.equal(fixture.backend._state.runs.has('active-retention-child'), true);

  await journal.persistReplayRun(source.sessionId, {
    id: 'active-retention-child', status: 'replay_completed', nextStep: 1,
    finishedAt: fixture.now(), steps: [attempt]
  });
  const cascaded = await journal.prune(30);
  assert.deepEqual(cascaded.ids, [source.sessionId]);
  assert.equal(await journal.hasSession(source.sessionId), false);
  assert.equal(fixture.backend._state.runs.has('active-retention-child'), false);

  const forcedFixture = setup();
  const forcedSource = await journal.recordDispatch(entry({
    agentId: 'agent-forced-parent',
    recordingRunId: 'forced-parent-run',
    recordingCallId: 'forced-parent-call'
  }));
  await journal.persistReplayRun(forcedSource.sessionId, {
    id: 'active-forced-child', status: 'running', nextStep: 0, steps: []
  });
  assert.equal(await journal.deleteSession(forcedSource.sessionId), true);
  assert.equal(await journal.hasSession(forcedSource.sessionId), false);
  assert.equal(forcedFixture.backend._state.runs.has('active-forced-child'), false);

  const clearSource = await journal.recordDispatch(entry({
    agentId: 'agent-clear-parent',
    recordingRunId: 'clear-parent-run',
    recordingCallId: 'clear-parent-call'
  }));
  await journal.persistReplayRun(clearSource.sessionId, {
    id: 'active-clear-child', status: 'running', nextStep: 0, steps: []
  });
  assert.equal(await journal.clearSessions(), true);
  assert.equal(await journal.hasSession(clearSource.sessionId), false);
  assert.equal(forcedFixture.backend._state.runs.has('active-clear-child'), false);
});

test('byte-budget eviction skips a closed source while its replay child is active', async () => {
  const fixture = setup();
  const source = await journal.recordDispatch(entry({
    agentId: 'agent-budget-parent',
    recordingRunId: 'budget-parent-run',
    recordingCallId: 'budget-parent-call'
  }));
  await journal.recordTaskOutcome(entry({
    agentId: 'agent-budget-parent',
    recordingRunId: 'budget-parent-run',
    recordingCallId: 'budget-parent-terminal',
    tool: 'complete_task'
  }), { outcome: 'success', status: 'completed', summary: 'Pinned source', text: 'Pinned source' });
  await journal.persistReplayRun(source.sessionId, {
    id: 'active-budget-child', status: 'running', nextStep: 0, steps: []
  });

  fixture.advance(1);
  const evictable = await journal.recordDispatch(entry({
    agentId: 'agent-budget-unpinned',
    recordingRunId: 'budget-unpinned-run',
    recordingCallId: 'budget-unpinned-call'
  }));
  await journal.recordTaskOutcome(entry({
    agentId: 'agent-budget-unpinned',
    recordingRunId: 'budget-unpinned-run',
    recordingCallId: 'budget-unpinned-terminal',
    tool: 'complete_task'
  }), { outcome: 'success', status: 'completed', summary: 'Evictable', text: 'Evictable' });

  const getActualTotalBytes = fixture.backend.getTotalBytes.bind(fixture.backend);
  fixture.backend.getTotalBytes = async () => fixture.backend._state.runs.has(evictable.sessionId)
    ? journal.MAX_ENCODED_BYTES
    : getActualTotalBytes();
  const replacement = await journal.recordDispatch(entry({
    agentId: 'agent-budget-replacement',
    recordingRunId: 'budget-replacement-run',
    recordingCallId: 'budget-replacement-call'
  }));

  assert.equal(await journal.hasSession(source.sessionId), true);
  assert.equal(fixture.backend._state.runs.has('active-budget-child'), true);
  assert.equal(await journal.hasSession(evictable.sessionId), false);
  assert.equal((await allDetail(replacement.sessionId)).events.length, 2);
});

test('replay projects the latest 100 steps and appends child attempts in one bundle each', async () => {
  const { backend } = setup();
  let sessionId;
  for (let index = 0; index < 505; index++) {
    const result = await journal.recordDispatch(entry({
      recordingRunId: 'long-replay-recording-run',
      recordingCallId: `long-replay-call-${index}`,
      tool: `read_step_${index}`,
      response: { success: true, value: index }
    }));
    sessionId = result.sessionId;
  }
  const projection = await journal.getReplayProjection(sessionId);
  assert.equal(projection.totalSourceSteps, 505);
  assert.equal(projection.entries.length, 100);
  assert.equal(projection.entries[0].tool, 'read_step_405');
  assert.equal(projection.truncated, true);
  const cappedPage = await journal.getSessionDetail({ sessionId, afterSequence: -1, limit: 999 });
  assert.equal(cappedPage.events.length, 500);
  assert.equal(cappedPage.hasMore, true);
  const finalPage = await journal.getSessionDetail({
    sessionId, afterSequence: cappedPage.nextSequence, limit: 999
  });
  assert.equal(finalPage.events.length, 6);
  assert.equal(finalPage.hasMore, false);
  const report = await journal.exportHumanReadable(sessionId);
  assert.match(report, /Calls retained: 505/);
  assert.match(report, /Executable replay: latest 100 of 505/);
  assert.match(report, /Call 505: read_step_504/);

  let bundleWrites = 0;
  let separateHeadWrites = 0;
  const originalPutBundle = backend.putBundle.bind(backend);
  const originalUpdateRun = backend.updateRun.bind(backend);
  backend.putBundle = async (...args) => {
    bundleWrites++;
    return originalPutBundle(...args);
  };
  backend.updateRun = async (...args) => {
    separateHeadWrites++;
    return originalUpdateRun(...args);
  };

  const firstAttempt = {
    stepId: 'step-100', index: 100, tool: 'read_step_100', attemptNumber: 1,
    status: 'executed', success: true, completedAt: 1_800_000_001_000
  };
  const secondAttempt = {
    stepId: 'step-101', index: 101, tool: 'read_step_101', attemptNumber: 1,
    status: 'executed', success: true, completedAt: 1_800_000_002_000
  };
  await journal.persistReplayRun(sessionId, {
    id: 'replay-child-run', status: 'running', nextStep: 101, steps: [firstAttempt]
  });
  await journal.persistReplayRun(sessionId, {
    id: 'replay-child-run', status: 'replay_completed', nextStep: 102,
    finishedAt: 1_800_000_003_000, steps: [firstAttempt, secondAttempt]
  });
  assert.equal(bundleWrites, 2);
  assert.equal(separateHeadWrites, 0);

  const child = await journal.materializeReplayRun('replay-child-run');
  assert.equal(child.status, 'replay_completed');
  assert.equal(child.steps.length, 2);
  const childEvents = await backend.getAllEvents('replay-child-run');
  assert.deepEqual(childEvents.map((event) => event.kind), [
    'run.start', 'tool.call', 'tool.call', 'run.complete'
  ]);
});

test('stale replay snapshots cannot regress or duplicate durable attempts', async () => {
  const { backend } = setup();
  const source = await journal.recordDispatch(entry({
    agentId: 'agent-stale-replay',
    recordingRunId: 'stale-replay-source-run',
    recordingCallId: 'stale-replay-source-call'
  }));
  const firstAttempt = {
    stepId: 'step-1', index: 0, tool: 'click', attemptNumber: 1,
    status: 'executed', success: true, completedAt: 1_800_000_001_000
  };
  const secondAttempt = {
    stepId: 'step-2', index: 1, tool: 'type_text', attemptNumber: 1,
    status: 'executed', success: true, completedAt: 1_800_000_002_000
  };

  assert.equal(await journal.persistReplayRun(source.sessionId, {
    id: 'stale-replay-child', status: 'running', nextStep: 1,
    previousReceiptCid: 'receipt-1', steps: [firstAttempt]
  }), true);
  assert.equal(await journal.persistReplayRun(source.sessionId, {
    id: 'stale-replay-child', status: 'running', nextStep: 0,
    previousReceiptCid: 'source-receipt', steps: []
  }), false);

  let child = await journal.materializeReplayRun('stale-replay-child');
  assert.equal(child.nextStep, 1);
  assert.equal(child.previousReceiptCid, 'receipt-1');
  assert.deepEqual(child.steps.map((attempt) => attempt.stepId), ['step-1']);

  assert.equal(await journal.persistReplayRun(source.sessionId, {
    id: 'stale-replay-child', status: 'running', nextStep: 2,
    previousReceiptCid: 'receipt-2', steps: [firstAttempt, secondAttempt]
  }), true);
  child = await journal.materializeReplayRun('stale-replay-child');
  assert.equal(child.nextStep, 2);
  assert.equal(child.previousReceiptCid, 'receipt-2');
  assert.deepEqual(child.steps.map((attempt) => attempt.stepId), ['step-1', 'step-2']);
  assert.deepEqual((await backend.getAllEvents('stale-replay-child')).map((event) => event.kind), [
    'run.start', 'tool.call', 'tool.call'
  ]);
});

test('terminal replay heads cannot be reopened or replaced', async () => {
  setup();
  const source = await journal.recordDispatch(entry({
    agentId: 'agent-terminal-replay',
    recordingRunId: 'terminal-replay-source-run',
    recordingCallId: 'terminal-replay-source-call'
  }));
  const attempt = {
    stepId: 'terminal-step', index: 0, tool: 'click', attemptNumber: 1,
    status: 'executed', success: true, completedAt: 1_800_000_001_000
  };

  for (const status of ['replay_completed', 'replay_failed', 'replay_stopped']) {
    const replayId = `terminal-child-${status}`;
    assert.equal(await journal.persistReplayRun(source.sessionId, {
      id: replayId, status: 'running', nextStep: 1, steps: [attempt]
    }), true);
    assert.equal(await journal.persistReplayRun(source.sessionId, {
      id: replayId, status, nextStep: 1, finishedAt: 1_800_000_002_000, steps: [attempt]
    }), true);
    assert.equal(await journal.persistReplayRun(source.sessionId, {
      id: replayId, status: 'running', nextStep: 1, steps: [attempt]
    }), false);
    assert.equal(await journal.persistReplayRun(source.sessionId, {
      id: replayId, status: status === 'replay_completed' ? 'replay_failed' : 'replay_completed',
      nextStep: 1, finishedAt: 1_800_000_003_000, steps: [attempt]
    }), false);
    assert.equal((await journal.materializeReplayRun(replayId)).status, status);
  }
});

test('replay run heads round-trip ownership-free logical tab topology', async () => {
  setup();
  const source = await journal.recordDispatch(entry({
    agentId: 'agent-replay-topology',
    recordingRunId: 'replay-topology-source',
    recordingCallId: 'replay-topology-call'
  }));
  await journal.persistReplayRun(source.sessionId, {
    id: 'replay-topology-child',
    status: 'running',
    nextStep: 2,
    targetTabId: 202,
    expectedOrigin: 'https://two.example',
    logicalTabs: [
      { logicalTab: 'primary', tabId: 101, expectedOrigin: 'https://one.example' },
      { logicalTab: 'tab-2', tabId: 202, expectedOrigin: 'https://two.example' }
    ],
    steps: []
  });

  const replayRun = await journal.materializeReplayRun('replay-topology-child');
  assert.equal(replayRun.targetTabId, 202);
  assert.equal(replayRun.expectedOrigin, 'https://two.example');
  assert.deepEqual(replayRun.logicalTabs, [
    { logicalTab: 'primary', tabId: 101, expectedOrigin: 'https://one.example' },
    { logicalTab: 'tab-2', tabId: 202, expectedOrigin: 'https://two.example' }
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(replayRun.logicalTabs[0], 'ownershipToken'), false);
});

test('replay run heads retain recovery metadata when attempt and terminal events cannot fit', async () => {
  const fixture = setup();
  const source = await journal.recordDispatch(entry({
    agentId: 'agent-replay-quota',
    recordingRunId: 'replay-quota-source-run',
    recordingCallId: 'replay-quota-source-call'
  }));
  const getActualTotalBytes = fixture.backend.getTotalBytes.bind(fixture.backend);
  const bytesBeforeReplay = await getActualTotalBytes();
  fixture.backend.getTotalBytes = async () => journal.MAX_ENCODED_BYTES;
  fixture.backend.listClosedOldest = async () => [];
  const attempt = {
    stepId: 'quota-step', index: 3, tool: 'mcp:read-page', attemptNumber: 1,
    status: 'executed', success: true, completedAt: fixture.now()
  };
  const playback = { logicalTab: 'primary', position: 44, url: 'https://example.test/replay' };

  assert.equal(await journal.persistReplayRun(source.sessionId, {
    id: 'quota-replay-child', status: 'running', nextStep: 4,
    playback, previousReceiptCid: 'receipt-before-quota', steps: [attempt]
  }), true);
  let child = await journal.materializeReplayRun('quota-replay-child');
  assert.equal(child.status, 'running');
  assert.equal(child.nextStep, 4);
  assert.deepEqual(child.playback, playback);
  assert.equal(child.previousReceiptCid, 'receipt-before-quota');
  assert.deepEqual(child.steps, []);
  assert.equal(await getActualTotalBytes(), bytesBeforeReplay);

  assert.equal(await journal.persistReplayRun(source.sessionId, {
    id: 'quota-replay-child', status: 'replay_failed', nextStep: 4,
    playback, previousReceiptCid: 'receipt-after-quota',
    finishedAt: fixture.now() + 1, error: 'stopped after quota', steps: child.steps
  }), true);
  child = await journal.materializeReplayRun('quota-replay-child');
  assert.equal(child.status, 'replay_failed');
  assert.equal(child.nextStep, 4);
  assert.deepEqual(child.playback, playback);
  assert.equal(child.previousReceiptCid, 'receipt-before-quota');
  assert.equal(child.error, 'stopped after quota');
  assert.ok(Number.isFinite(child.finishedAt));
  assert.deepEqual(child.steps, []);
  assert.equal((await fixture.backend.getAllEvents('quota-replay-child')).length, 0);
  assert.equal(fixture.backend._state.runs.get('quota-replay-child').degradedReason, 'storage_budget_exhausted');
  assert.equal(await getActualTotalBytes(), bytesBeforeReplay);
});

test('sealed journal manifests regenerate deterministically without persisting a second manifest', async () => {
  setup();
  const opened = await journal.recordDispatch(entry({
    agentId: 'agent-manifest',
    recordingRunId: 'deterministic-manifest-run',
    recordingCallId: 'deterministic-manifest-call',
    tool: 'mcp:read-page',
    resultProjection: 'journal-full-v1',
    response: { success: true, value: 'stable result', tabId: 991, durationMs: 42 }
  }));
  await journal.recordTaskOutcome(entry({
    agentId: 'agent-manifest',
    recordingRunId: 'deterministic-manifest-run',
    recordingCallId: 'deterministic-terminal-call',
    tool: 'complete_task',
    response: { success: true, status: 'completed' }
  }), {
    outcome: 'success', status: 'completed', summary: 'Done', text: 'Done'
  });

  const local = makeLocalStorage();
  globalThis.FsbMcpLatticeJournal = journal;
  globalThis.chrome = {
    storage: { local },
    runtime: {
      async sendMessage(message) {
        const payload = message.payload || {};
        if (message.type === 'lattice-replay-seal') {
          const manifestHash = crypto.createHash('sha256')
            .update(JSON.stringify(payload.manifest))
            .digest('hex');
          return {
            ok: true,
            manifest: payload.manifest,
            manifestHash,
            receipt: { manifestHash },
            receiptCid: 'receipt-' + manifestHash,
            signerKid: 'test-signer'
          };
        }
        if (message.type === 'lattice-replay-materialize') {
          const actual = crypto.createHash('sha256')
            .update(JSON.stringify(payload.manifest))
            .digest('hex');
          return {
            ok: true,
            verified: actual === payload.manifestHash,
            offline: true,
            receiptCid: 'receipt-' + actual
          };
        }
        throw new Error('unexpected host request ' + message.type);
      }
    }
  };
  delete require.cache[require.resolve('../extension/utils/lattice-replay.js')];
  const replay = require('../extension/utils/lattice-replay.js');

  const sealed = await replay.sealPersistedSession(opened.sessionId);
  assert.equal(sealed.replay.integrity, 'verified');
  const firstHash = sealed.replay.manifestHash;
  const compactMetadata = await journal.getReplayMetadata(opened.sessionId);
  assert.equal(Object.prototype.hasOwnProperty.call(compactMetadata, 'manifest'), false);

  const first = await replay.prepareReplay(opened.sessionId);
  const second = await replay.prepareReplay(opened.sessionId);
  assert.equal(first.verified, true);
  assert.equal(second.verified, true);
  assert.equal(first.replay.manifestHash, firstHash);
  assert.equal(second.replay.manifestHash, firstHash);
  assert.deepEqual(first.steps, second.steps);
  assert.deepEqual(first.resultProjectionByStepId, { 'step-1': 'journal-full-v1' });
  assert.deepEqual(second.resultProjectionByStepId, first.resultProjectionByStepId);
  assert.equal(Object.prototype.hasOwnProperty.call(first.replay.manifest, 'resultProjectionByStepId'), false);
  assert.equal(JSON.stringify(first.replay.manifest).includes('journal-full-v1'), false);
});
