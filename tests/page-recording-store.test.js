'use strict';

// Page recording store: chunk/marker storage, caps, eviction, linking,
// summaries and housekeeping, exercised through the in-memory backend.

const assert = require('node:assert/strict');
const test = require('node:test');

const store = require('../extension/utils/page-recording-store.js');

function fresh(limits) {
  const backend = store._createMemoryBackend();
  store._setBackendForTests(backend);
  store._resetLimitsForTests();
  if (limits) store.configure(limits);
  return backend;
}

function snapshotEvent(t, html) {
  return { t, type: 'ext:dom-snapshot', payload: { html: html || '<p>x</p>', streamSessionId: 's1', snapshotId: t } };
}

function mutationEvent(t) {
  return { t, type: 'ext:dom-mutations', payload: { mutations: [], streamSessionId: 's1', snapshotId: 1 } };
}

function chunk(trackId, segment, seq, events, extra) {
  return Object.assign({ trackId, segment, seq, events, keyframe: events[0] && events[0].type === 'ext:dom-snapshot' }, extra || {});
}

test('creates a live recording and reads it back', async () => {
  fresh();
  const row = await store.createRecording({ correlation: 'ap:session_1', driver: 'autopilot', historySessionId: 'session_1' });
  assert.match(row.id, /^rec_/);
  assert.equal(row.status, store.STATUS_RECORDING);
  assert.equal(row.driver, 'autopilot');
  const again = await store.getRecording(row.id);
  assert.deepEqual(again, row);
  assert.equal((await store.findRecordingByCorrelation('ap:session_1')).id, row.id);
  assert.equal(await store.findRecordingByCorrelation('ap:session_1', { status: store.STATUS_FINISHED }), null);
});

test('upserts tracks and merges later fields', async () => {
  fresh();
  const row = await store.createRecording({ correlation: 'mcp:a:r' });
  await store.upsertTrack(row.id, { trackId: 'primary', tabId: 7, logicalTab: 'primary', startedAt: 10 });
  await store.upsertTrack(row.id, { trackId: 'primary', segments: 2 });
  await store.upsertTrack(row.id, { trackId: 'tab-2', tabId: 9 });
  const read = await store.getRecording(row.id);
  assert.equal(read.tracks.primary.tabId, 7);
  assert.equal(read.tracks.primary.segments, 2);
  assert.equal(read.tracks['tab-2'].tabId, 9);
});

test('appends chunks in order, marks keyframes, and flattens a track', async () => {
  const backend = fresh();
  const row = await store.createRecording({ correlation: 'mcp:a:r' });
  const result = await store.appendChunks(row.id, [
    chunk('primary', 1, 0, [snapshotEvent(1000)]),
    chunk('primary', 0, 1, [mutationEvent(600)]),
    chunk('primary', 0, 0, [snapshotEvent(500), mutationEvent(550)]),
    chunk('tab-2', 0, 0, [snapshotEvent(700)])
  ]);
  assert.equal(result.accepted, 4);
  const chunks = await store.readTrackChunks(row.id, 'primary');
  assert.deepEqual(chunks.map((c) => [c.segment, c.seq]), [[0, 0], [0, 1], [1, 0]]);
  assert.equal(chunks[0].keyframe, true);
  assert.equal(chunks[0].keyframeAt, 500);
  assert.equal(Object.prototype.hasOwnProperty.call(chunks[1], 'keyframeAt'), false);
  const events = await store.readTrackEvents(row.id, 'primary');
  assert.deepEqual(events.map((e) => e.t), [500, 550, 600, 1000]);
  const after = await store.getRecording(row.id);
  assert.equal(after.chunkCount, 4);
  assert.ok(after.bytes > 0);
  assert.equal(backend._state.meta.get('totalBytes').value, after.bytes);
});

test('stops taking chunks past the per-recording cap but keeps markers', async () => {
  fresh({ maxRecordingBytes: 300 });
  const row = await store.createRecording({ correlation: 'mcp:a:r' });
  const big = 'x'.repeat(200);
  const first = await store.appendChunks(row.id, [chunk('primary', 0, 0, [snapshotEvent(1, big)])]);
  assert.equal(first.accepted, 1);
  const second = await store.appendChunks(row.id, [chunk('primary', 0, 1, [snapshotEvent(2, big)])]);
  assert.equal(second.accepted, 0);
  assert.equal(second.truncated, true);
  const third = await store.appendChunks(row.id, [chunk('primary', 0, 2, [mutationEvent(3)])]);
  assert.equal(third.accepted, 0);
  assert.equal(third.truncated, true);
  const marks = await store.appendMarkers(row.id, [{ t: 4, kind: 'action-start', data: { tool: 'click' } }]);
  assert.equal(marks.accepted, 1);
  assert.equal((await store.getRecording(row.id)).truncated, true);
  assert.equal((await store.readMarkers(row.id)).length, 1);
});

test('evicts the oldest finished recordings past the total budget, never a live one', async () => {
  const payload = 'y'.repeat(250);
  // Room for three one-snapshot chunks: the fourth pushes the total over by
  // about one chunk, so evicting the oldest finished recording is enough.
  const unit = JSON.stringify([snapshotEvent(1, payload)]).length;
  fresh({ maxTotalBytes: unit * 3 + 5 });
  const oldest = await store.createRecording({ correlation: 'c1', startedAt: 1 });
  await store.appendChunks(oldest.id, [chunk('primary', 0, 0, [snapshotEvent(1, payload)])]);
  await store.finishRecording(oldest.id, 10);
  const middle = await store.createRecording({ correlation: 'c2', startedAt: 2 });
  await store.appendChunks(middle.id, [chunk('primary', 0, 0, [snapshotEvent(2, payload)])]);
  await store.finishRecording(middle.id, 20);
  const live = await store.createRecording({ correlation: 'c3', startedAt: 3 });
  await store.appendChunks(live.id, [chunk('primary', 0, 0, [snapshotEvent(3, payload)])]);
  // Pushes the total over 900 bytes: the oldest finished one goes first.
  await store.appendChunks(live.id, [chunk('primary', 0, 1, [snapshotEvent(4, payload)])]);
  const ids = (await store.listRecordings()).map((row) => row.id);
  assert.equal(ids.includes(oldest.id), false);
  assert.equal(ids.includes(middle.id), true);
  assert.equal(ids.includes(live.id), true);
});

test('links history sessions and summarizes playable recordings', async () => {
  fresh();
  const linked = await store.createRecording({ correlation: 'mcp:a:r1', startedAt: 1000 });
  await store.appendChunks(linked.id, [chunk('primary', 0, 0, [snapshotEvent(1000)])]);
  await store.upsertTrack(linked.id, { trackId: 'primary', tabId: 1 });
  await store.linkHistorySession(linked.id, 'hist-1');
  await store.finishRecording(linked.id, 4000);
  const live = await store.createRecording({ correlation: 'mcp:a:r2', historySessionId: 'hist-2' });
  await store.appendChunks(live.id, [chunk('primary', 0, 0, [snapshotEvent(5)])]);
  const empty = await store.createRecording({ correlation: 'mcp:a:r3', historySessionId: 'hist-3' });
  const summary = await store.buildIndexSummary();
  assert.deepEqual(Object.keys(summary).sort(), ['hist-1', 'hist-2']);
  assert.equal(summary['hist-1'].state, 'ready');
  assert.equal(summary['hist-1'].durationMs, 3000);
  assert.equal(summary['hist-1'].tracks, 1);
  assert.equal(summary['hist-2'].state, 'recording');
  assert.equal(empty.historySessionId, 'hist-3');
});

test('deletes by history id, including chunks, markers and byte totals', async () => {
  const backend = fresh();
  const keep = await store.createRecording({ correlation: 'k', historySessionId: 'keep' });
  await store.appendChunks(keep.id, [chunk('primary', 0, 0, [snapshotEvent(1)])]);
  const drop = await store.createRecording({ correlation: 'd', historySessionId: 'drop' });
  await store.appendChunks(drop.id, [chunk('primary', 0, 0, [snapshotEvent(2)])]);
  await store.appendMarkers(drop.id, [{ t: 2, kind: 'action-start' }]);
  const removed = await store.deleteByHistorySessionIds(['drop']);
  assert.equal(removed, 1);
  assert.equal(await store.getRecording(drop.id), null);
  assert.deepEqual(await store.readTrackChunks(drop.id, 'primary'), []);
  assert.deepEqual(await store.readMarkers(drop.id), []);
  assert.equal(backend._state.meta.get('totalBytes').value, (await store.getRecording(keep.id)).bytes);
});

test('clear-all can keep live recordings; pruning only removes old finished ones', async () => {
  fresh();
  const live = await store.createRecording({ correlation: 'live' });
  const done = await store.createRecording({ correlation: 'done' });
  await store.finishRecording(done.id, 100);
  await store.clearAll({ keepLive: true });
  assert.ok(await store.getRecording(live.id));
  assert.equal(await store.getRecording(done.id), null);

  const old = await store.createRecording({ correlation: 'old' });
  await store.finishRecording(old.id, 1000);
  const recent = await store.createRecording({ correlation: 'recent' });
  await store.finishRecording(recent.id, 5000);
  assert.equal(await store.pruneOlderThan(2000), 1);
  assert.equal(await store.getRecording(old.id), null);
  assert.ok(await store.getRecording(recent.id));
  assert.ok(await store.getRecording(live.id), 'a live recording is never pruned by age');
});

test('sweeps orphans, unlinked leftovers and stale live rows', async () => {
  const backend = fresh({ unlinkedGraceMs: 1000, staleLiveMs: 5000 });
  const gone = await store.createRecording({ correlation: 'g', historySessionId: 'deleted-history' });
  await store.finishRecording(gone.id, 100);
  const kept = await store.createRecording({ correlation: 'k', historySessionId: 'present-history' });
  await store.finishRecording(kept.id, 100);
  const unlinked = await store.createRecording({ correlation: 'u' });
  await store.finishRecording(unlinked.id, 100);
  const stale = await store.createRecording({ correlation: 's' });
  // A chunk whose recording row no longer exists.
  await backend.commit({ chunks: [{ recordingId: 'rec_missing', trackId: 'primary', segment: 0, seq: 0, events: [], bytes: 0 }] });
  const at = Date.now() + 60_000;
  const result = await store.sweepOrphans({ knownHistoryIds: ['present-history'], now: at });
  assert.equal(await store.getRecording(gone.id), null);
  assert.ok(await store.getRecording(kept.id));
  assert.equal(await store.getRecording(unlinked.id), null);
  assert.equal(result.orphanChunkSets, 1);
  assert.equal((await store.getRecording(stale.id)).status, store.STATUS_FINISHED);
  assert.deepEqual(await backend.listChunkRecordingIds(), []);
});

test('finishing closes open tracks and is idempotent', async () => {
  fresh();
  const row = await store.createRecording({ correlation: 'f' });
  await store.upsertTrack(row.id, { trackId: 'primary', startedAt: 1 });
  const finished = await store.finishRecording(row.id, 99);
  assert.equal(finished.status, store.STATUS_FINISHED);
  assert.equal(finished.tracks.primary.endedAt, 99);
  const again = await store.finishRecording(row.id, 500);
  assert.equal(again.endedAt, 99);
});

test('parallel appends keep byte totals consistent', async () => {
  const backend = fresh();
  const row = await store.createRecording({ correlation: 'p' });
  await Promise.all(Array.from({ length: 20 }, (_, i) =>
    store.appendChunks(row.id, [chunk('primary', 0, i, [mutationEvent(i)])])));
  const after = await store.getRecording(row.id);
  assert.equal(after.chunkCount, 20);
  assert.equal(backend._state.meta.get('totalBytes').value, after.bytes);
  assert.equal((await store.readTrackChunks(row.id, 'primary')).length, 20);
});
