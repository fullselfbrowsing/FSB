// Phase 68 / Plan 08 Task 2 -- scripts/bench/shadow/export-capture.mjs
// (D-22, F5, F6; T-68-11, T-68-17, T-68-18).
//
// The capture ring is produced by the real extension module: FsbFastPath's
// capture path runs over fake deps on the checklist and confirm-modals
// fixture pages (68-02-shaped menus), exactly as a run_task bench session
// would feed it. The exporter must turn those records into 67-10
// recorded-llm records that validateRecord and checkLockReferences accept,
// drop everything it cannot turn into a truthful record (counted by reason),
// write only where --out points (temp directories here), and never touch the
// committed hand set or the frozen corpus.
//
// Node 20-safe: node:test, node:assert/strict and core modules only. No
// network, no ports: the CDP reader is injected.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { DEFAULT_OUT_DIR, deriveRecords, main, parseArgs } from '../scripts/bench/shadow/export-capture.mjs';
import { loadTasks } from '../scripts/bench/lib/tasks.mjs';
import { CORE_LOCK_PATH, SHADOW_RECORDS_ROOT, checkLockReferences, readCoreLock, validateRecord } from '../scripts/bench/shadow/lib/records.mjs';

const require = createRequire(import.meta.url);
const FsbFastPath = require('../extension/ai/jev-fast-path.js');
const FsbJevState = require('../extension/ai/jev-state.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI_PATH = path.join(ROOT, 'scripts', 'bench', 'shadow', 'export-capture.mjs');
const NONE = FsbJevState.CONTRACT.RESERVED_OPTION_KEY;
const RUN_TOKEN = 'Ab3dEf9hIj2kLm5nOp8qRs';
const SENTINEL = 'SENTINEL_DROPPED_PAGE_TEXT_7f3a';
const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const TASKS = loadTasks({ set: 'core' });
const LOCK = readCoreLock();

const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const LOCK_SHA_BEFORE = sha256File(CORE_LOCK_PATH);
const RECORD_FILES_BEFORE = fs.readdirSync(SHADOW_RECORDS_ROOT).filter((name) => name.endsWith('.json')).sort();

const copy = (value) => JSON.parse(JSON.stringify(value));
const pageUrl = (slug, rest = 'index.html') => `http://127.0.0.1:53211/r/${RUN_TOKEN}/fixtures/${slug}/${rest}`;
const taskOf = (id) => TASKS.find((task) => task.id === id);
const goalOf = (id) => taskOf(id).instruction.slice('Open {startUrl}.'.length).trim();

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** One 68-02 menu entry. */
function entry(handle, over) {
  return Object.assign({
    handle,
    role: 'button',
    label: 'Button ' + handle,
    ops: ['click', 'hover'],
    inputType: null,
    autocomplete: null,
    purpose: { sensitive: false, danger: false, intent: null },
    hidden: false,
    risk: null,
    fastEligible: true,
    vaultFilled: false,
    state: { checked: null, expanded: null, selected: null, pressed: null },
    inViewport: true
  }, over || {});
}

const CHECK_NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet'];

/** The checklist fixture's menu, plus a password field buildRequest always drops. */
function checklistMenu(n, url) {
  const entries = CHECK_NAMES.map((label, i) => entry('j' + (i + 1), {
    role: 'checkbox', label, ops: ['check_box', 'click'], inputType: 'checkbox',
    state: { checked: false, expanded: null, selected: null, pressed: null }
  }));
  entries.push(entry('j11', { label: 'Save' }));
  entries.push(entry('j12', { role: 'textbox', label: 'Admin password', ops: ['click'], inputType: 'password', fastEligible: false }));
  return {
    success: true,
    generation: 'cafe0001-' + n,
    url: url || pageUrl('checklist', 'index.html?view=edit#top'),
    title: 'Checklist',
    visibleText: 'Checklist\nItems\n' + CHECK_NAMES.join('\n') + '\nSave',
    moreBelow: false,
    signature: 'sig-check-' + n,
    count: entries.length,
    truncated: false,
    entries,
    recentHandles: []
  };
}

const RECORDS = ['Q2 budget summary', 'Hiring plan', 'Q3 draft forecast', 'Vendor contract renewal', 'Q3 final forecast', 'Travel policy draft'];

/** The confirm-modals fixture's menu: risky Delete buttons, more content below. */
function confirmMenu(n) {
  const entries = RECORDS.map((name, i) => entry('j' + (i + 1), {
    label: 'Delete ' + name, ops: ['click'], purpose: { sensitive: false, danger: true, intent: null }, risk: 'danger', fastEligible: false
  }));
  return {
    success: true,
    generation: 'beef0002-' + n,
    url: pageUrl('confirm-modals'),
    title: 'Documents',
    visibleText: 'Documents\nRecord Name Owner\n' + RECORDS.map((name, i) => `REC-${i + 1} ${name} Delete`).join('\n'),
    moreBelow: true,
    signature: 'sig-confirm-' + n,
    count: entries.length,
    truncated: false,
    entries,
    recentHandles: []
  };
}

/**
 * The ring the real module writes for a run_task bench session that sees
 * `steps` ({menu, calls:[[name, args]], seen:{handle, resolved, tool}}),
 * one LLM-path iteration each; one more turn labels the last step.
 */
async function moduleRing(steps, slug) {
  const ring = { v: 1, records: [], drops: {} };
  let index = 0;
  let url = steps[0].menu.url;
  const deps = {
    now: () => 1789639200000,
    readSwitch: async () => true,
    requestMenu: async (tabId, options) => {
      const menu = copy(steps[index].menu);
      menu.recentHandles = (options && Array.isArray(options.recent) ? options.recent : []).map(() => null);
      return menu;
    },
    requestSnapshot: async () => null,
    getTabUrl: async () => url,
    readCaptureArm: async () => true,
    appendCaptureRecord: async (record) => { ring.records.push(copy(record)); },
    noteCaptureDrop: async (reason) => { ring.drops[reason] = (ring.drops[reason] || 0) + 1; }
  };
  const session = {
    status: 'running',
    tabId: 3,
    commandCount: 1,
    task: `Open ${pageUrl(slug)}. ${goalOf(slug === 'checklist' ? 'core-click-checklist' : 'core-click-confirm-modals')}`,
    messages: [],
    fastMode: { enabled: false, stored: true, source: 'mcp' },
    agentState: { iterationCount: 0 }
  };
  for (index = 0; index < steps.length; index += 1) {
    url = steps[index].menu.url;
    await FsbFastPath.beforeTurn(session, { iteration: index + 1, deps });
    const pending = session._fastPath.capturePending;
    assert.ok(pending, 'the module holds a capture for step ' + (index + 1));
    const step = steps[index];
    if (step.seen) {
      assert.equal(FsbFastPath.noteCaptureObservation(session, Object.assign({ generation: pending.generation }, step.seen)), true);
    }
    const calls = step.calls.map(([name, args], k) => ({ id: `c${index}_${k}`, name, args }));
    FsbFastPath.observeTools(session, calls, calls.map((call) => ({ callId: call.id, name: call.name, result: { success: true } })));
  }
  url = 'about:blank';
  await FsbFastPath.beforeTurn(session, { iteration: steps.length + 1, deps });
  assert.equal(ring.records.length, steps.length, 'every step was labelled');
  return ring;
}

let checklistRing = null;
let confirmRing = null;

async function rings() {
  if (checklistRing === null) {
    checklistRing = await moduleRing([
      { menu: checklistMenu(1), calls: [['check_box', { selector: 'e1' }]], seen: { handle: 'j1', resolved: true, tool: 'toggleCheckbox' } },
      { menu: checklistMenu(2), calls: [['check_box', { selector: 'e4' }]], seen: { handle: 'j4', resolved: true, tool: 'toggleCheckbox' } },
      { menu: checklistMenu(3), calls: [['click', { selector: 'e12' }]], seen: { handle: 'j12', resolved: true, tool: 'click' } },
      { menu: checklistMenu(4), calls: [['get_page_snapshot', {}]] },
      { menu: checklistMenu(5), calls: [['report_progress', { message: 'saving' }], ['click', { selector: 'e11' }]], seen: { handle: 'j11', resolved: true, tool: 'click' } }
    ], 'checklist');
    confirmRing = await moduleRing([
      { menu: confirmMenu(1), calls: [['click', { selector: 'e3' }]], seen: { handle: 'j3', resolved: true, tool: 'click' } },
      { menu: confirmMenu(2), calls: [['scroll', { direction: 'down' }]] }
    ], 'confirm-modals');
  }
  return {
    ring: { v: 1, records: copy(checklistRing.records).concat(copy(confirmRing.records)), drops: { target_unknown: 2, stale_command: 1 } },
    checklist: copy(checklistRing),
    confirm: copy(confirmRing)
  };
}

const idByLabel = (request, label) => {
  const element = request.elements.find((e) => e.label === label);
  return element ? element.id : null;
};

test('deriveRecords: module captures become valid recorded-llm records (origin, path, goal, labels, ids)', async () => {
  const { ring } = await rings();
  const out = deriveRecords(ring, { tasks: TASKS, lock: LOCK, run: 'abc123' });
  assert.deepEqual(out.drops, {});
  assert.equal(out.captures, 7);
  assert.deepEqual(out.ringDrops, { stale_command: 1, target_unknown: 2 }, 'the ring drop counters are carried');
  assert.deepEqual(out.records.map((r) => r.id), [
    'shadow-checklist-llmabc123-01', 'shadow-checklist-llmabc123-02', 'shadow-checklist-llmabc123-03',
    'shadow-checklist-llmabc123-04', 'shadow-checklist-llmabc123-05',
    'shadow-confirm-modals-llmabc123-01', 'shadow-confirm-modals-llmabc123-02'
  ]);
  for (const record of out.records) {
    const verdict = validateRecord(record);
    assert.ok(verdict.ok, record.id + ': ' + verdict.errors.join('; '));
    assert.equal(record.provenance, 'recorded-llm');
    assert.equal(record.request.page.origin, 'http://127.0.0.1:4173');
    assert.deepEqual(record.request.kinds, ['operation', 'target']);
    assert.equal(record.labels.completion, null);
    assert.equal(record.labels.stuck, null);
    assert.equal(record.labels.risk, null);
    assert.doesNotMatch(record.request.page.path, /\/r\/|[?#]/);
  }
  assert.ok(checkLockReferences(out.records, LOCK).ok);

  const [c1, c2, c3, c4, c5, m1, m2] = out.records;
  assert.equal(c1.request.page.path, '/fixtures/checklist/index.html');
  assert.equal(c1.request.goal, goalOf('core-click-checklist'));
  assert.equal(m1.request.goal, goalOf('core-click-confirm-modals'));
  assert.deepEqual(c1.task, LOCK.find((e) => e.id === 'core-click-checklist'));
  assert.deepEqual(m1.task, LOCK.find((e) => e.id === 'core-click-confirm-modals'));
  assert.deepEqual([c1.step, c2.step, c5.step, m2.step], [0, 1, 4, 1], 'step is the 0-based iteration');
  assert.deepEqual(c1.labels.operation, 'check_box');
  assert.equal(c1.labels.target, idByLabel(c1.request, 'Alpha'));
  assert.equal(c2.labels.target, idByLabel(c2.request, 'Delta'));
  assert.equal(c3.labels.operation, 'click');
  assert.equal(c3.labels.target, NONE, 'a handle buildRequest dropped (the password field) becomes none_of_the_above');
  assert.ok(!c3.request.elements.some((e) => /password/i.test(e.label)));
  assert.deepEqual([c4.labels.operation, c4.labels.target], [NONE, NONE], 'a snapshot turn labels none_of_the_above twice');
  assert.deepEqual([c5.labels.operation, c5.labels.target], ['click', idByLabel(c5.request, 'Save')], 'report_progress is skipped');
  assert.deepEqual([m1.labels.operation, m1.labels.target], ['click', idByLabel(m1.request, 'Delete Q3 draft forecast')]);
  assert.deepEqual([m2.labels.operation, m2.labels.target], ['scroll', NONE]);
  assert.deepEqual(m1.request.offeredOps, ['click', 'scroll']);

  const text = JSON.stringify(out.records);
  assert.equal(text.indexOf(RUN_TOKEN), -1, 'no run token');
  assert.equal(text.indexOf('Open http'), -1, 'no raw task prefix');
  assert.equal(text.indexOf('{startUrl}'), -1);
});

test('deriveRecords: the run prefix is stripped generically, also when the segment is [REDACTED_TOKEN]', async () => {
  const { checklist } = await rings();
  const base = checklist.records[0];
  const variants = [
    `http://127.0.0.1:53211/r/[REDACTED_TOKEN]/fixtures/checklist/index.html`,
    `http://localhost:4000/r/other-run/fixtures/checklist/index.html?view=edit&x=1#frag`
  ];
  const ring = { v: 1, records: variants.map((url) => Object.assign(copy(base), { url })), drops: {} };
  const out = deriveRecords(ring, { tasks: TASKS, lock: LOCK, run: 'r2' });
  assert.deepEqual(out.drops, {});
  assert.deepEqual(out.records.map((r) => [r.request.page.origin, r.request.page.path]), [
    ['http://127.0.0.1:4173', '/fixtures/checklist/index.html'],
    ['http://127.0.0.1:4173', '/fixtures/checklist/index.html']
  ]);
  for (const record of out.records) assert.ok(validateRecord(record).ok);
  assert.equal(JSON.stringify(out.records).indexOf('REDACTED'), -1);
});

test('deriveRecords: captures that cannot become a truthful record are dropped and counted by reason', async () => {
  const { checklist } = await rings();
  const base = checklist.records[0];
  const withUrl = (url) => Object.assign(copy(base), { url });
  const sentinel = (record) => { record.builderInput.visibleText = SENTINEL + ' ' + record.builderInput.visibleText; return record; };
  const empty = copy(base);
  empty.builderInput.elements = [];
  const unknownTarget = copy(base);
  unknownTarget.label = { op: 'click', target: 'target_unknown' };
  const unlabelled = copy(base);
  unlabelled.label = { op: null, target: null };
  const ring = {
    v: 1,
    records: [
      sentinel(withUrl('https://127.0.0.1:53211/r/x/fixtures/checklist/index.html')),
      sentinel(withUrl('http://192.168.1.4:53211/r/x/fixtures/checklist/index.html')),
      sentinel(withUrl('http://127.0.0.1:53211/fixtures/checklist/index.html')),
      sentinel(withUrl(pageUrl('no-such-fixture'))),
      sentinel(empty),
      sentinel(unknownTarget),
      sentinel(unlabelled),
      sentinel(Object.assign(copy(base), { v: 2 })),
      sentinel(Object.assign(copy(base), { iteration: 0 })),
      'not a capture',
      copy(base)
    ],
    drops: { menu_unavailable: 1 }
  };
  const out = deriveRecords(ring, { tasks: TASKS, lock: LOCK, run: 'd1' });
  assert.deepEqual(out.drops, {
    not_fixture_url: 3,
    unknown_slug: 1,
    build_invalid_request: 1,
    target_unknown: 1,
    unlabelled: 1,
    malformed: 3
  });
  assert.equal(out.records.length, 1);
  assert.equal(out.records[0].id, 'shadow-checklist-llmd1-01');
  assert.deepEqual(out.ringDrops, { menu_unavailable: 1 });
  assert.equal(JSON.stringify(out.records).indexOf(SENTINEL), -1, 'no dropped page text reaches a record');

  const leaky = copy(base);
  leaky.builderInput.visibleText = 'Run ' + RUN_TOKEN + ' started';
  const leaked = deriveRecords({ v: 1, records: [leaky], drops: {} }, { tasks: TASKS, lock: LOCK, run: 'd6' });
  assert.deepEqual([leaked.records.length, leaked.drops], [0, { token_in_record: 1 }], 'a record whose page text carries the run token is dropped');

  const otherSha = LOCK.map((e) => (e.id === 'core-click-checklist' ? Object.assign({}, e, { fixtureSha256: 'f'.repeat(64) }) : e));
  const mismatch = deriveRecords({ v: 1, records: [copy(base)], drops: {} }, { tasks: TASKS, lock: { tasks: otherSha }, run: 'd2' });
  assert.equal(mismatch.records.length, 1, 'the lock entry itself is the reference');
  assert.equal(mismatch.records[0].task.fixtureSha256, 'f'.repeat(64));
  const missing = deriveRecords({ v: 1, records: [copy(base)], drops: {} }, { tasks: TASKS, lock: LOCK.filter((e) => e.id !== 'core-click-checklist'), run: 'd3' });
  assert.deepEqual([missing.records.length, missing.drops], [0, { not_in_lock: 1 }]);
  const staleTask = TASKS.map((t) => (t.id === 'core-click-checklist' ? Object.assign({}, t, { id: 'core-click-checklist-v2' }) : t));
  const notLocked = deriveRecords({ v: 1, records: [copy(base)], drops: {} }, { tasks: staleTask, lock: LOCK, run: 'd4' });
  assert.deepEqual(notLocked.drops, { not_in_lock: 1 });

  assert.throws(() => deriveRecords({ records: 'x' }, { tasks: TASKS, lock: LOCK, run: 'd5' }), /capture ring/);
  assert.throws(() => deriveRecords(ring, { tasks: TASKS, lock: LOCK, run: 'Bad-Run' }), /run must match/);
});

test('deriveRecords: at most 99 records per slug, numbered in capture order', async () => {
  const { checklist } = await rings();
  const records = [];
  // Distinct capturedAt values: these are 101 different captures, not one repeated (WR-07 dedupe).
  for (let i = 0; i < 101; i += 1) records.push(Object.assign(copy(checklist.records[i % 5]), { iteration: (i % 5) + 1, capturedAt: 1789639200000 + i }));
  const out = deriveRecords({ v: 1, records, drops: {} }, { tasks: TASKS, lock: LOCK, run: 'lim' });
  assert.equal(out.records.length, 99);
  assert.deepEqual(out.drops, { slug_limit: 2 });
  assert.equal(out.records[0].id, 'shadow-checklist-llmlim-01');
  assert.equal(out.records[98].id, 'shadow-checklist-llmlim-99');
  assert.ok(out.records.every((r, i) => r.id.endsWith('-' + String(i + 1).padStart(2, '0'))));
});

test('deriveRecords: a ring that repeats its captures exports each once (WR-07)', async () => {
  const { ring } = await rings();
  const repeated = { v: 1, records: copy(ring.records).concat(copy(ring.records)), drops: copy(ring.drops) };
  const once = deriveRecords(ring, { tasks: TASKS, lock: LOCK, run: 'w7a' });
  const twice = deriveRecords(repeated, { tasks: TASKS, lock: LOCK, run: 'w7a' });
  assert.equal(twice.captures, 14);
  assert.deepEqual(twice.drops, { duplicate: 7 });
  assert.deepEqual(twice.records, once.records, 'the same records, ids and numbering as one copy of the ring');
  // A capture that differs only in its time is a different capture.
  const later = copy(ring.records[0]);
  later.capturedAt = Math.max(...ring.records.map((r) => r.capturedAt)) + 1;
  const distinct = deriveRecords({ v: 1, records: [copy(ring.records[0]), later], drops: {} }, { tasks: TASKS, lock: LOCK, run: 'w7b' });
  assert.deepEqual([distinct.records.length, distinct.drops], [2, {}]);
});

test('deriveRecords: since exports only captures taken after it, and reports the newest capturedAt (WR-07)', async () => {
  const { ring } = await rings();
  const times = ring.records.map((r) => r.capturedAt);
  assert.ok(times.every((t) => Number.isSafeInteger(t)), 'module captures carry capturedAt');
  const newest = Math.max(...times);
  const all = deriveRecords(ring, { tasks: TASKS, lock: LOCK, run: 's0' });
  assert.equal(all.newestCapturedAt, newest);
  const cut = times.slice().sort((a, b) => a - b)[2];
  const after = deriveRecords(ring, { tasks: TASKS, lock: LOCK, run: 's1', since: cut });
  const expected = times.filter((t) => t > cut).length;
  assert.equal(after.records.length, expected);
  assert.deepEqual(after.drops, { not_after_since: times.length - expected });
  assert.equal(after.newestCapturedAt, newest, 'the cursor is the newest capture in the ring, exported or not');
  const none = deriveRecords(ring, { tasks: TASKS, lock: LOCK, run: 's2', since: newest });
  assert.deepEqual([none.records.length, none.drops], [0, { not_after_since: times.length }], 'since = the last cursor exports nothing new');
  const untimed = Object.assign(copy(ring.records[0]), { capturedAt: null });
  assert.deepEqual(deriveRecords({ v: 1, records: [untimed], drops: {} }, { tasks: TASKS, lock: LOCK, run: 's3', since: 0 }).drops,
    { not_after_since: 1 }, 'a capture with no capturedAt is never shown to be new');
  assert.equal(deriveRecords({ v: 1, records: [untimed], drops: {} }, { tasks: TASKS, lock: LOCK, run: 's4' }).records.length, 1,
    'without since, an untimed capture still exports');
  assert.throws(() => deriveRecords(ring, { tasks: TASKS, lock: LOCK, run: 's5', since: -1 }), /since must be/);
});

test('parseArgs: the three modes, and usage errors', () => {
  assert.deepEqual(parseArgs(['--input', 'ring.json']), { input: 'ring.json', port: null, extensionId: null, out: null, run: null, arm: null, since: null });
  assert.deepEqual(parseArgs(['--port=9222', '--extension-id', EXTENSION_ID, '--out', 'x', '--run', 'r1']),
    { input: null, port: 9222, extensionId: EXTENSION_ID, out: 'x', run: 'r1', arm: null, since: null });
  assert.deepEqual(parseArgs(['--port', '9222', '--extension-id', EXTENSION_ID, '--arm', 'off']),
    { input: null, port: 9222, extensionId: EXTENSION_ID, out: null, run: null, arm: 'off', since: null });
  assert.deepEqual(parseArgs(['--input', 'ring.json', '--since', '1789639200000']),
    { input: 'ring.json', port: null, extensionId: null, out: null, run: null, arm: null, since: 1789639200000 });
  const bad = [
    [],
    ['--bogus', 'x'],
    ['--input'],
    ['--input', '--out'],
    ['ring.json'],
    ['--input', 'a', '--input', 'b'],
    ['--input', 'a', '--port', '9222', '--extension-id', EXTENSION_ID],
    ['--port', '9222'],
    ['--port', '0', '--extension-id', EXTENSION_ID],
    ['--port', '9222', '--extension-id', 'not-an-id'],
    ['--arm', 'on'],
    ['--port', '9222', '--extension-id', EXTENSION_ID, '--arm', 'maybe'],
    ['--port', '9222', '--extension-id', EXTENSION_ID, '--arm', 'on', '--out', 'x'],
    ['--input', 'a', '--run', 'Not_OK'],
    ['--input', 'a', '--since', 'yesterday'],
    ['--input', 'a', '--since', '-5'],
    ['--input', 'a', '--since', '1.5'],
    ['--input', 'a', '--since', '99999999999999999999'],
    ['--port', '9222', '--extension-id', EXTENSION_ID, '--arm', 'on', '--since', '5']
  ];
  for (const argv of bad) assert.throws(() => parseArgs(argv), /usage:/, JSON.stringify(argv));
});

test('the default output directory is the gitignored .local tree', () => {
  assert.equal(DEFAULT_OUT_DIR, 'scripts/bench/.local/shadow/recorded-llm');
  const ignored = spawnSync('git', ['check-ignore', '-q', path.join(DEFAULT_OUT_DIR, 'x.json')], { cwd: ROOT });
  assert.equal(ignored.status, 0, 'git ignores the default output directory');
});

test('CLI --input: writes only into --out, one file per record, and prints a one-line summary', async () => {
  const { ring } = await rings();
  const dir = tempDir('fsb-capture-cli-');
  try {
    const input = path.join(dir, 'ring.json');
    fs.writeFileSync(input, JSON.stringify({ fsbJevCaptureRing: ring }));
    const out = path.join(dir, 'out');
    const run = spawnSync(process.execPath, [CLI_PATH, '--input', input, '--out', out, '--run', 'cli1'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const lines = run.stdout.trim().split('\n');
    assert.equal(lines.length, 1);
    const newest = Math.max(...ring.records.map((r) => r.capturedAt));
    assert.ok(Number.isSafeInteger(newest));
    assert.match(lines[0], new RegExp('^export-capture: 7 written, 0 dropped \\(none\\) of 7 captures -> .*; ring drops: stale_command=1, '
      + 'target_unknown=2; newest capturedAt: ' + newest + '$'));
    assert.deepEqual(fs.readdirSync(dir).sort(), ['out', 'ring.json'], 'nothing else is written next to --out');
    const files = fs.readdirSync(out).sort();
    assert.equal(files.length, 7);
    for (const name of files) {
      const record = JSON.parse(fs.readFileSync(path.join(out, name), 'utf8'));
      assert.equal(name, record.id + '.json');
      assert.ok(validateRecord(record).ok);
      const text = fs.readFileSync(path.join(out, name), 'utf8');
      assert.equal(text.indexOf(RUN_TOKEN), -1);
      assert.equal(text.indexOf('Open http'), -1);
    }
    const again = spawnSync(process.execPath, [CLI_PATH, '--input', input, '--out', out, '--run', 'cli1'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(again.status, 1, 'an existing output file is never overwritten');
    assert.match(again.stderr, /already exist/);
    assert.equal(fs.readdirSync(out).length, 7);
    // WR-07: the printed cursor, passed back as --since, exports nothing already exported.
    const sinceOut = path.join(dir, 'since-out');
    const next = spawnSync(process.execPath, [CLI_PATH, '--input', input, '--out', sinceOut, '--run', 'cli2', '--since', String(newest)],
      { cwd: ROOT, encoding: 'utf8' });
    assert.equal(next.status, 0, next.stderr);
    assert.match(next.stdout.trim(), new RegExp('^export-capture: 0 written, 7 dropped \\(not_after_since=7\\) of 7 captures -> .*; '
      + 'newest capturedAt: ' + newest + '$'));
    assert.equal(fs.existsSync(sinceOut), false, 'no output directory when nothing is written');

    for (const argv of [[], ['--bogus', '1'], ['--input'], ['--arm', 'on']]) {
      const usage = spawnSync(process.execPath, [CLI_PATH].concat(argv), { cwd: ROOT, encoding: 'utf8' });
      assert.equal(usage.status, 2, JSON.stringify(argv));
      assert.match(usage.stderr, /usage:/);
    }
    const garbage = path.join(dir, 'garbage.json');
    fs.writeFileSync(garbage, '{"records": [' + SENTINEL);
    const broken = spawnSync(process.execPath, [CLI_PATH, '--input', garbage, '--out', path.join(dir, 'never')], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(broken.status, 1);
    assert.equal(broken.stderr.indexOf(SENTINEL), -1, 'a parse error never echoes the input');
    assert.equal(fs.existsSync(path.join(dir, 'never')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI refuses an --out inside the committed records or the task corpus', async () => {
  const { ring } = await rings();
  const dir = tempDir('fsb-capture-guard-');
  try {
    const input = path.join(dir, 'ring.json');
    fs.writeFileSync(input, JSON.stringify(ring));
    const errors = [];
    for (const target of [SHADOW_RECORDS_ROOT, path.join(SHADOW_RECORDS_ROOT, 'sub'), path.join(ROOT, 'scripts', 'bench', 'tasks', 'core')]) {
      const code = await main(['--input', input, '--out', target, '--run', 'guard'], { log: () => {}, error: (line) => errors.push(line) });
      assert.equal(code, 1, target);
    }
    assert.ok(errors.every((line) => /must not be inside/.test(line)));
    assert.deepEqual(fs.readdirSync(SHADOW_RECORDS_ROOT).filter((n) => n.endsWith('.json')).sort(), RECORD_FILES_BEFORE);
    assert.equal(fs.existsSync(path.join(SHADOW_RECORDS_ROOT, 'sub')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    // If the guard ever breaks, remove what this test wrote so the committed set stays exactly the hand records.
    for (const name of fs.readdirSync(SHADOW_RECORDS_ROOT)) {
      if (/-llmguard-\d{2}\.json$/.test(name)) fs.rmSync(path.join(SHADOW_RECORDS_ROOT, name));
    }
    fs.rmSync(path.join(SHADOW_RECORDS_ROOT, 'sub'), { recursive: true, force: true });
    for (const name of fs.readdirSync(path.join(ROOT, 'scripts', 'bench', 'tasks', 'core'))) {
      if (/-llmguard-\d{2}\.json$/.test(name)) fs.rmSync(path.join(ROOT, 'scripts', 'bench', 'tasks', 'core', name));
    }
  }
});

/** A fake CDP pairing recording every call. */
function fakeCdp(answer, opts = {}) {
  const calls = [];
  return {
    calls,
    findExtensionWorker: async (port, extensionId) => {
      calls.push(['find', port, extensionId]);
      return opts.noWorker ? { target: null, wakeTargetId: 'WAKE9' } : { target: { id: 'sw-target' }, wakeTargetId: 'WAKE1' };
    },
    evaluate: async (target, expression, options) => {
      calls.push(['evaluate', target.id, expression, options.timeoutMs]);
      return typeof answer === 'function' ? answer(expression) : answer;
    },
    closeTargets: async (port, ids) => {
      calls.push(['close', port, ids]);
      return { closed: ids.length };
    }
  };
}

test('CLI --port/--extension-id: reads the ring through the worker and closes the wake tab', async () => {
  const { ring } = await rings();
  const dir = tempDir('fsb-capture-cdp-');
  try {
    const cdp = fakeCdp(copy(ring));
    const lines = [];
    const code = await main(['--port', '9222', '--extension-id', EXTENSION_ID, '--out', path.join(dir, 'out'), '--run', 'cdp1'],
      Object.assign({ log: (line) => lines.push(line), error: (line) => lines.push('ERR ' + line) }, cdp));
    assert.equal(code, 0, lines.join('\n'));
    assert.deepEqual(cdp.calls[0], ['find', 9222, EXTENSION_ID]);
    assert.equal(cdp.calls[1][0], 'evaluate');
    assert.equal(cdp.calls[1][2], "chrome.storage.local.get(['fsbJevCaptureRing']).then((data) => data.fsbJevCaptureRing || null)");
    assert.deepEqual(cdp.calls[2], ['close', 9222, ['WAKE1']]);
    assert.equal(fs.readdirSync(path.join(dir, 'out')).length, 7);
    assert.equal(lines.length, 1);

    const missing = fakeCdp(null, { noWorker: true });
    const errors = [];
    const failed = await main(['--port', '9222', '--extension-id', EXTENSION_ID, '--out', path.join(dir, 'none')],
      Object.assign({ log: () => {}, error: (line) => errors.push(line) }, missing));
    assert.equal(failed, 1);
    assert.match(errors[0], /service worker was not found/);
    assert.deepEqual(missing.calls.at(-1), ['close', 9222, ['WAKE9']], 'the wake tab is closed on failure too');
    assert.equal(fs.existsSync(path.join(dir, 'none')), false);

    const empty = fakeCdp(null);
    assert.equal(await main(['--port', '9222', '--extension-id', EXTENSION_ID, '--out', path.join(dir, 'empty')],
      Object.assign({ log: () => {}, error: () => {} }, empty)), 1, 'no ring in storage is an error');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI --arm on|off writes only the arm key and no file', async () => {
  const defaultDir = path.join(ROOT, DEFAULT_OUT_DIR);
  const before = fs.existsSync(defaultDir) ? fs.readdirSync(defaultDir).sort() : null;
  const cwdBefore = fs.readdirSync(ROOT).sort();
  const on = fakeCdp(true);
  const lines = [];
  assert.equal(await main(['--port', '9222', '--extension-id', EXTENSION_ID, '--arm', 'on'], Object.assign({ log: (l) => lines.push(l), error: (l) => lines.push(l) }, on)), 0);
  assert.equal(on.calls[1][2], 'chrome.storage.local.set({ fsbJevCaptureArmed: true }).then(() => true)');
  assert.deepEqual(lines, ['export-capture: capture arm on']);
  const off = fakeCdp(true);
  assert.equal(await main(['--port', '9222', '--extension-id', EXTENSION_ID, '--arm', 'off'], Object.assign({ log: () => {}, error: () => {} }, off)), 0);
  assert.equal(off.calls[1][2], "chrome.storage.local.remove('fsbJevCaptureArmed').then(() => true)");
  for (const call of on.calls.concat(off.calls).filter((c) => c[0] === 'evaluate')) {
    const keys = call[2].match(/fsb[A-Za-z]+/g);
    assert.deepEqual(keys, ['fsbJevCaptureArmed'], 'the arm expression names only the arm key');
  }
  assert.deepEqual(off.calls.at(-1), ['close', 9222, ['WAKE1']]);
  const refused = fakeCdp(false);
  assert.equal(await main(['--port', '9222', '--extension-id', EXTENSION_ID, '--arm', 'on'], Object.assign({ log: () => {}, error: () => {} }, refused)), 1);
  assert.deepEqual(fs.existsSync(defaultDir) ? fs.readdirSync(defaultDir).sort() : null, before, '--arm writes no record file');
  assert.deepEqual(fs.readdirSync(ROOT).sort(), cwdBefore);
});

test('safety: the committed hand set and the frozen corpus are untouched', () => {
  const files = fs.readdirSync(SHADOW_RECORDS_ROOT).filter((name) => name.endsWith('.json')).sort();
  assert.equal(files.length, 25);
  assert.deepEqual(files, RECORD_FILES_BEFORE);
  assert.equal(sha256File(CORE_LOCK_PATH), LOCK_SHA_BEFORE, 'core.lock.json bytes are unchanged');
  const status = spawnSync('git', ['status', '--porcelain', '--', 'scripts/bench/shadow/records', 'scripts/bench/tasks', 'scripts/bench/lib'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(status.status, 0);
  assert.equal(status.stdout, '');
});
