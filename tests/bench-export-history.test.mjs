// Phase 66 / Plan 01 -- sanitized MCP history metrics and their leak check.
//
// Covers scripts/bench/export-history.mjs against a synthetic export in the
// H1 snippet format (tests/fixtures/bench/history-export-sample.json). Node
// 20-safe: node:test, node:assert/strict and core modules only.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  HISTORY_METRICS_METHOD,
  assertNoLeak,
  deriveHistoryMetrics,
} from '../scripts/bench/export-history.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE_PATH = path.join(ROOT, 'tests', 'fixtures', 'bench', 'history-export-sample.json');
const CLI_PATH = path.join(ROOT, 'scripts', 'bench', 'export-history.mjs');

const TASK_TEXT = 'SAMPLE_TASK_TEXT_a91f';
const PAGE_TEXT = 'SAMPLE_PAGE_TEXT_7c1d';
const PREVIEW_TEXT = 'SAMPLE_PREVIEW_TEXT_3e5b';
const RESULT_TEXT = 'SAMPLE_RESULT_TEXT_5b20';
const SECRET_URL = 'https://intranet.example.test/secret-path?q=1';
const SESSION_A = 'session_1789639200000';
const SESSION_B = 'session_1789745400000';
const SESSION_C = 'session_1789873200000';

function loadSample() {
  return JSON.parse(readFileSync(SAMPLE_PATH, 'utf8'));
}

function copyOf(value) {
  return JSON.parse(JSON.stringify(value));
}

function sessionEntry(sample, id) {
  const entry = sample.sessions.find((candidate) => candidate.indexEntry.id === id);
  assert.ok(entry, 'sample session ' + id + ' exists');
  return entry;
}

function setClient(sample, id, label) {
  const entry = sessionEntry(sample, id);
  entry.indexEntry.mcpClient = label;
  entry.session.mcpClient = label;
  for (const indexEntry of sample.index) {
    if (indexEntry.id === id) indexEntry.mcpClient = label;
  }
  for (const event of entry.events) {
    if (event.metadata) event.metadata.client = label;
  }
}

// Every object key and every string value, depth first.
function tokensOf(value, out = []) {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) tokensOf(item, out);
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      out.push(key);
      tokensOf(value[key], out);
    }
  }
  return out;
}

function assertKeysSorted(value, where = 'metrics') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertKeysSorted(item, where + '[' + index + ']'));
  } else if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    assert.deepEqual(keys, [...keys].sort(), 'keys of ' + where + ' are sorted');
    for (const key of keys) assertKeysSorted(value[key], where + '.' + key);
  }
}

function inlineResultStrings(sample) {
  const strings = [];
  for (const entry of sample.sessions) {
    for (const event of entry.events) {
      const result = event.metadata && event.metadata.result;
      if (result && result.storage === 'inline') tokensOf(result.inline, strings);
    }
  }
  return strings;
}

test('HISTORY_METRICS_METHOD names the journal-timestamp method and its caveats', () => {
  assert.equal(
    HISTORY_METRICS_METHOD,
    'journal event timestamp deltas between consecutive tool.call events; include caller gap and IndexedDB write-queue delay; not FSB execution time',
  );
});

test('deriveHistoryMetrics counts every session and every recorded call', () => {
  const sample = loadSample();
  const metrics = deriveHistoryMetrics(sample);

  const journalCalls = sample.sessions
    .filter((entry) => entry.legacy !== true)
    .reduce((sum, entry) => sum + entry.events.filter((event) => event.kind === 'tool.call').length, 0);
  const legacyCalls = sample.sessions
    .filter((entry) => entry.legacy === true)
    .reduce((sum, entry) => sum + entry.session.actionHistory.length, 0);
  assert.equal(journalCalls, 7, 'the sample holds 7 journal tool.call events (plus non-call events)');
  assert.equal(legacyCalls, 3, 'the sample holds 3 legacy actionHistory rows');

  assert.equal(metrics.v, 1);
  assert.equal(metrics.method, HISTORY_METRICS_METHOD);
  assert.equal(metrics.sessionCount, 3);
  assert.equal(metrics.callCount, journalCalls + legacyCalls);
  assert.equal(
    metrics.sessions.filter((session) => session.storage === 'journal')
      .reduce((sum, session) => sum + session.callCount, 0),
    journalCalls,
    'journal call counts equal the number of tool.call events',
  );
  assert.deepEqual(metrics.source, {
    exportedAt: '2026-09-30T12:00:00.000Z',
    extensionIsWebStore: true,
    extensionVersion: '0.9.91',
    window: { from: '2026-09-16', to: '2026-09-21' },
  });
});

test('per-client deltas pool consecutive tool.call timestamps in sequence order', () => {
  // Hand-computed from the sample timestamps:
  //   Claude A (events stored out of sequence order): calls at 10:00:01, :10, :21, :26
  //     -> deltas 9000, 11000, 5000; span 25000
  //   Claude B: calls at 15:30:00.5, :08.5, :20.5 -> deltas 8000, 12000; span 20000
  //   Claude pooled, sorted: 5000, 8000, 9000, 11000, 12000
  //     median 9000; p90: h = 4 * 0.9 = 3.6 -> 11000 + 0.6 * (12000 - 11000) = 11600
  //   Cursor C (legacy): actionHistory at +1 s, +5 s, +10 s -> deltas 4000, 5000; span 9000
  //     median 4500; p90: h = 1 * 0.9 = 0.9 -> 4000 + 0.9 * (5000 - 4000) = 4900
  const metrics = deriveHistoryMetrics(loadSample());
  assert.deepEqual(Object.keys(metrics.byClient), ['Claude', 'Cursor']);
  assert.equal(metrics.byClient.Claude.deltaMs.median, 9000);
  assert.deepEqual(metrics.byClient.Claude, {
    calls: 7,
    deltaMs: { median: 9000, n: 5, p90: 11600 },
    sessionSpanMs: { median: 22500 },
    sessions: 2,
  });
  assert.deepEqual(metrics.byClient.Cursor, {
    calls: 3,
    deltaMs: { median: 4500, n: 2, p90: 4900 },
    sessionSpanMs: { median: 9000 },
    sessions: 1,
  });
});

test('sessions are identified only by ordinal in startTime order and never by id', () => {
  const sample = loadSample();
  assert.deepEqual(
    sample.sessions.map((entry) => entry.indexEntry.id),
    [SESSION_C, SESSION_B, SESSION_A],
    'the sample lists sessions newest first, like the session index',
  );
  const metrics = deriveHistoryMetrics(sample);
  // A: sorted deltas 5000, 9000, 11000 -> median 9000; p90 h = 1.8 -> 9000 + 0.8 * 2000 = 10600
  // B: deltas 8000, 12000 -> median 10000; p90 h = 0.9 -> 8000 + 0.9 * 4000 = 11600
  assert.deepEqual(metrics.sessions, [
    {
      callCount: 4,
      client: 'Claude',
      deltaMs: { median: 9000, n: 3, p90: 10600 },
      ordinal: 1,
      outcome: 'completed',
      spanMs: 25000,
      startDate: '2026-09-17',
      storage: 'journal',
      toolCounts: { click: 1, 'mcp:read-page': 2, type_text: 1 },
    },
    {
      callCount: 3,
      client: 'Claude',
      deltaMs: { median: 10000, n: 2, p90: 11600 },
      ordinal: 2,
      outcome: 'other',
      spanMs: 20000,
      startDate: '2026-09-18',
      storage: 'journal',
      toolCounts: { click: 1, 'mcp:read-page': 1, navigate: 1 },
    },
    {
      callCount: 3,
      client: 'Cursor',
      deltaMs: { median: 4500, n: 2, p90: 4900 },
      ordinal: 3,
      outcome: null,
      spanMs: 9000,
      startDate: '2026-09-19',
      storage: 'legacy',
      toolCounts: { get_text: 1, goBack: 1, navigate: 1 },
    },
  ]);

  const ids = new Set();
  for (const indexEntry of sample.index) ids.add(indexEntry.id);
  for (const entry of sample.sessions) {
    ids.add(entry.indexEntry.id);
    ids.add(entry.session.id);
  }
  assert.deepEqual([...ids].sort(), [SESSION_A, SESSION_B, SESSION_C]);
  for (const token of tokensOf(metrics)) {
    assert.equal(ids.has(token), false, 'no metrics key or value equals a session id');
  }
  const serialized = JSON.stringify(metrics);
  for (const id of ids) assert.equal(serialized.includes(id), false, 'metrics never contain ' + id);
});

test('startDate is date-only, in the exporting browser time zone, falling back to UTC', () => {
  const sample = loadSample();
  assert.equal(sample.timeZone, 'America/Los_Angeles');
  const local = deriveHistoryMetrics(sample).sessions.map((session) => session.startDate);
  // Session C starts at 2026-09-20T03:00Z, which is the evening of 2026-09-19 in Los Angeles.
  assert.deepEqual(local, ['2026-09-17', '2026-09-18', '2026-09-19']);
  for (const date of local) assert.match(date, /^\d{4}-\d{2}-\d{2}$/);

  const noZone = loadSample();
  delete noZone.timeZone;
  assert.deepEqual(
    deriveHistoryMetrics(noZone).sessions.map((session) => session.startDate),
    ['2026-09-17', '2026-09-18', '2026-09-20'],
  );
  const badZone = loadSample();
  badZone.timeZone = 'Not/A_Zone';
  assert.deepEqual(
    deriveHistoryMetrics(badZone).sessions.map((session) => session.startDate),
    ['2026-09-17', '2026-09-18', '2026-09-20'],
  );
});

test('assertNoLeak passes the derived metrics and rejects injected raw values', () => {
  const sample = loadSample();
  const metrics = deriveHistoryMetrics(sample);
  assert.doesNotThrow(() => assertNoLeak(sample, metrics));

  const fullPageString = sessionEntry(sample, SESSION_A).events
    .find((event) => event.sequence === 4).metadata.result.inline.text;
  assert.ok(fullPageString.startsWith(PAGE_TEXT) && fullPageString.length > PAGE_TEXT.length);
  const typedValue = sessionEntry(sample, SESSION_A).events
    .find((event) => event.sequence === 3).metadata.request.inline.text;
  assert.equal(typedValue, PAGE_TEXT);
  const legacyResult = sessionEntry(sample, SESSION_C).session.actionHistory[1].result.text;
  const lastTask = sessionEntry(sample, SESSION_C).session.lastTask;

  const cases = [
    ['task', (copy) => { copy.sessions[0].client = TASK_TEXT; }],
    ['task', (copy) => { copy.note = 'last task: ' + lastTask; }],
    ['url', (copy) => { copy.sessions[1].outcome = SECRET_URL; }],
    ['url', (copy) => { copy.source.window.from = 'see ' + SECRET_URL + ' for details'; }],
    ['payload', (copy) => { copy.byClient.Claude.label = fullPageString; }],
    ['payload', (copy) => { copy.sessions[2].toolCounts[typedValue] = 1; }],
    ['payload', (copy) => { copy.method = HISTORY_METRICS_METHOD + ' ' + legacyResult; }],
    ['payload', (copy) => { copy.sessions[0].client = PREVIEW_TEXT; }],
    ['session id', (copy) => { copy.sessions[0].client = SESSION_B; }],
    ['session text', (copy) => { copy.source.extensionVersion = RESULT_TEXT; }],
  ];
  for (const [kind, inject] of cases) {
    const copy = copyOf(metrics);
    inject(copy);
    assert.throws(() => assertNoLeak(sample, copy), { message: 'history metrics leak: ' + kind });
  }

  const schemeOnly = copyOf(metrics);
  schemeOnly.sessions[0].client = 'chrome-extension://some-other-page';
  assert.throws(() => assertNoLeak(sample, schemeOnly), { message: 'history metrics leak: url' });
});

test('allowlisted enum values in raw payloads are exempt from the leak check (W13)', () => {
  const sample = loadSample();
  const inline = inlineResultStrings(sample);
  assert.ok(inline.includes('completed'), 'the sample has "completed" as an inline result string');
  assert.ok(inline.includes('mcp:read-page'), 'the sample has "mcp:read-page" as an inline result string');
  assert.equal(sessionEntry(sample, SESSION_B).session.task, 'navigate', 'a journal task can equal a tool name');

  const metrics = deriveHistoryMetrics(sample);
  assert.equal(metrics.sessions[0].outcome, 'completed');
  assert.equal(metrics.sessions[0].toolCounts['mcp:read-page'], 2);
  assert.equal(metrics.sessions[1].toolCounts.navigate, 1);
  assert.doesNotThrow(() => assertNoLeak(sample, metrics));

  // Legitimate values also leave the forbidden set: session B's task equals
  // the tool name "navigate", so mentioning that tool elsewhere is no leak.
  const mention = copyOf(metrics);
  mention.note = 'first tool: navigate';
  assert.doesNotThrow(() => assertNoLeak(sample, mention));

  // Widen the raw sample: inline payload strings exactly equal to the method
  // string, a client label, outcome/storage enum values and a tool name, plus
  // page strings that only happen to sit inside a legitimate token (a tool
  // name, the method sentence).
  const widened = loadSample();
  sessionEntry(widened, SESSION_B).events.find((event) => event.sequence === 3).metadata.result.inline = {
    client: 'Claude',
    fragment: 'read-page',
    method: HISTORY_METRICS_METHOD,
    outcome: 'completed',
    phrase: 'IndexedDB write-queue delay',
    storage: 'journal',
    tool: 'mcp:read-page',
  };
  const widenedMetrics = deriveHistoryMetrics(widened);
  assert.doesNotThrow(() => assertNoLeak(widened, widenedMetrics));

  // A real task string or URL in the same sample still throws.
  for (const [kind, value] of [['task', TASK_TEXT], ['url', SECRET_URL]]) {
    const copy = copyOf(widenedMetrics);
    copy.sessions[0].client = value;
    assert.throws(() => assertNoLeak(widened, copy), { message: 'history metrics leak: ' + kind });
  }
});

test('output is deterministic: sorted keys and byte-identical serialization', () => {
  const first = JSON.stringify(deriveHistoryMetrics(loadSample()));
  const second = JSON.stringify(deriveHistoryMetrics(loadSample()));
  assert.equal(first, second);

  const reordered = loadSample();
  reordered.sessions.reverse();
  reordered.index.reverse();
  assert.equal(JSON.stringify(deriveHistoryMetrics(reordered)), first, 'input order does not change the output');

  assertKeysSorted(deriveHistoryMetrics(loadSample()));
});

test('client labels outside the allowlist pattern are reported as "other"', () => {
  const invalid = loadSample();
  setClient(invalid, SESSION_C, 'Cursor <img src=x onerror=alert(1)>');
  const metrics = deriveHistoryMetrics(invalid);
  assert.deepEqual(Object.keys(metrics.byClient), ['Claude', 'other']);
  assert.equal(metrics.sessions[2].client, 'other');
  assert.equal(metrics.byClient.other.sessions, 1);
  assert.doesNotThrow(() => assertNoLeak(invalid, metrics));

  const tooLong = loadSample();
  setClient(tooLong, SESSION_C, 'x'.repeat(41));
  assert.equal(deriveHistoryMetrics(tooLong).sessions[2].client, 'other');

  const withEmoji = loadSample();
  setClient(withEmoji, SESSION_C, 'OpenClaw \u{1F980}');
  assert.equal(deriveHistoryMetrics(withEmoji).sessions[2].client, 'other');

  const missing = loadSample();
  setClient(missing, SESSION_C, null);
  assert.equal(deriveHistoryMetrics(missing).sessions[2].client, 'unknown');
});

test('sessions with fewer than two calls report null timing, never 0', () => {
  const sample = loadSample();
  const a = sessionEntry(sample, SESSION_A);
  a.events = a.events.filter((event) => event.kind !== 'tool.call' || event.sequence === 1);
  const c = sessionEntry(sample, SESSION_C);
  c.session.actionHistory = [];

  const metrics = deriveHistoryMetrics(sample);
  assert.deepEqual(metrics.sessions[0], {
    callCount: 1,
    client: 'Claude',
    deltaMs: { median: null, n: 0, p90: null },
    ordinal: 1,
    outcome: 'completed',
    spanMs: null,
    startDate: '2026-09-17',
    storage: 'journal',
    toolCounts: { 'mcp:read-page': 1 },
  });
  assert.equal(metrics.sessions[2].callCount, 0);
  assert.deepEqual(metrics.sessions[2].toolCounts, {});
  assert.deepEqual(metrics.sessions[2].deltaMs, { median: null, n: 0, p90: null });
  assert.equal(metrics.sessions[2].spanMs, null);
  assert.deepEqual(metrics.byClient.Cursor, {
    calls: 0,
    deltaMs: { median: null, n: 0, p90: null },
    sessionSpanMs: { median: null },
    sessions: 1,
  });
  // Claude now pools only session B's deltas (8000, 12000).
  assert.deepEqual(metrics.byClient.Claude.deltaMs, { median: 10000, n: 2, p90: 11600 });
  assert.deepEqual(metrics.byClient.Claude.sessionSpanMs, { median: 20000 });
  assert.equal(metrics.callCount, 4);
});

test('outcomes and tool names are copied only from their allowlists', () => {
  const sample = loadSample();
  const a = sessionEntry(sample, SESSION_A);
  a.events.find((event) => event.sequence === 2).metadata.tool = 'click; DROP TABLE sessions';
  a.events.find((event) => event.sequence === 3).metadata.tool = 't'.repeat(65);
  sessionEntry(sample, SESSION_C).session.actionHistory[1].tool = '';

  const metrics = deriveHistoryMetrics(sample);
  assert.deepEqual(metrics.sessions[0].toolCounts, { 'mcp:read-page': 2, other: 2 });
  assert.deepEqual(metrics.sessions[2].toolCounts, { goBack: 1, navigate: 1, other: 1 });
  assert.deepEqual(metrics.sessions.map((session) => session.outcome), ['completed', 'other', null]);
  assert.doesNotThrow(() => assertNoLeak(sample, metrics));

  for (const outcome of ['completed', 'partial', 'failed', 'stopped', 'running']) {
    const copy = loadSample();
    sessionEntry(copy, SESSION_B).session.outcome = outcome;
    assert.equal(deriveHistoryMetrics(copy).sessions[1].outcome, outcome);
  }
});

test('deriveHistoryMetrics rejects input that is not an fsb-history-export v1 file', () => {
  assert.throws(() => deriveHistoryMetrics(null), /fsb-history-export/);
  assert.throws(() => deriveHistoryMetrics({ sessions: [] }), /fsb-history-export/);
  const wrongVersion = loadSample();
  wrongVersion.schemaVersion = 2;
  assert.throws(() => deriveHistoryMetrics(wrongVersion), /schemaVersion/);
  const noSessions = loadSample();
  noSessions.sessions = {};
  assert.throws(() => deriveHistoryMetrics(noSessions), /sessions/);
});

test('CLI writes sanitized metrics with a trailing newline and reports counts', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fsb66-history-'));
  try {
    const out = path.join(dir, 'nested', 'metrics.json');
    const run = spawnSync(process.execPath, [CLI_PATH, '--input', SAMPLE_PATH, '--out', out], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, 'history metrics: 3 sessions, 10 calls -> ' + out + '\n');
    const written = readFileSync(out, 'utf8');
    assert.ok(written.endsWith('}\n'), 'pretty JSON with a trailing newline');
    assert.equal(written, JSON.stringify(deriveHistoryMetrics(loadSample()), null, 2) + '\n');
    for (const marker of [PAGE_TEXT, TASK_TEXT, PREVIEW_TEXT, RESULT_TEXT, '://', SESSION_A, SESSION_B, SESSION_C]) {
      assert.equal(written.includes(marker), false, 'CLI output never contains ' + marker);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI exits 1 with a one-line message and never echoes raw input', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fsb66-history-'));
  try {
    const out = path.join(dir, 'metrics.json');
    const broken = path.join(dir, 'broken.json');
    writeFileSync(broken, '{"task": "' + TASK_TEXT + '", ' + PAGE_TEXT);
    const cases = [
      [],
      ['--input', SAMPLE_PATH],
      ['--input', path.join(dir, 'missing.json'), '--out', out],
      ['--input', broken, '--out', out],
    ];
    for (const args of cases) {
      const run = spawnSync(process.execPath, [CLI_PATH, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
      assert.equal(run.status, 1, 'exit 1 for ' + JSON.stringify(args));
      assert.equal(run.stdout, '');
      assert.equal(run.stderr.trimEnd().split('\n').length, 1, 'one-line error for ' + JSON.stringify(args));
      assert.equal(run.stderr.includes(PAGE_TEXT) || run.stderr.includes(TASK_TEXT), false, 'no raw content echoed');
    }
    assert.throws(() => readFileSync(out), /ENOENT/, 'nothing is written on failure');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
