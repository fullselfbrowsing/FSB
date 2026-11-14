// Phase 66 benchmark task schema, loader and fixture hashing (D-15, D-18):
// every task passes an exact-key schema before use, loading is deterministic,
// and a task's identity is id + version + fixtureSha256 over the canonical
// task JSON and every fixture file's bytes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BENCH_FIXTURES_ROOT,
  BENCH_TASKS_ROOT,
  CORE_CATEGORIES,
  LIVE_CATEGORIES,
  TASK_SCHEMA_VERSION,
  corpusLock,
  fixtureSha256,
  loadTasks,
  renderInstruction,
  validateTask,
} from '../scripts/bench/lib/tasks.mjs';
import { canonicalJson, sha256Hex } from '../scripts/bench/lib/identity.mjs';
import { evaluateOutcome } from '../scripts/bench/lib/outcome.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SAMPLE = path.join(ROOT, 'tests', 'fixtures', 'bench', 'tasks-sample');
const SAMPLE_TASKS = path.join(SAMPLE, 'tasks');
const SAMPLE_FIXTURES = path.join(SAMPLE, 'fixtures');
const SAMPLE_PAGE = path.join(SAMPLE_FIXTURES, 'sample', 'index.html');
const PAGE_URL = 'http://127.0.0.1:1/r/tok/fixtures/sample/index.html';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sampleCore() {
  return readJson(path.join(SAMPLE_TASKS, 'core', 'core-sample-save.json'));
}

function sampleLive() {
  return readJson(path.join(SAMPLE_TASKS, 'live', 'live-sample-read.json'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

// fs.cpSync is experimental on Node 20, so copy by hand.
function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else fs.copyFileSync(source, target);
  }
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-bench-tasks-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// A copy of the sample set in a temp dir: { tasks, fixtures, root }.
function withSampleCopy(fn) {
  return withTempDir((dir) => {
    copyTree(SAMPLE, dir);
    return fn({ root: dir, tasks: path.join(dir, 'tasks'), fixtures: path.join(dir, 'fixtures') });
  });
}

// The same value with object keys in reverse insertion order at every depth.
function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value === null || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).reverse()) out[key] = reverseKeys(value[key]);
  return out;
}

test('roots and constants point at scripts/bench and pin schema version 1', () => {
  assert.equal(BENCH_TASKS_ROOT, path.join(ROOT, 'scripts', 'bench', 'tasks'));
  assert.equal(BENCH_FIXTURES_ROOT, path.join(ROOT, 'scripts', 'bench', 'fixtures'));
  assert.equal(TASK_SCHEMA_VERSION, 1);
  assert.deepEqual([...CORE_CATEGORIES], ['mixed', 'click-heavy']);
  assert.deepEqual([...LIVE_CATEGORIES], ['reading']);
});

test('the sample core task validates, with and without the fixtures root', () => {
  assert.deepEqual(validateTask(sampleCore()), { ok: true, errors: [] });
  assert.deepEqual(validateTask(sampleCore(), { fixturesRoot: SAMPLE_FIXTURES }), { ok: true, errors: [] });
});

test('the sample live task validates', () => {
  assert.deepEqual(validateTask(sampleLive()), { ok: true, errors: [] });
  assert.deepEqual(validateTask(sampleLive(), { fixturesRoot: SAMPLE_FIXTURES }), { ok: true, errors: [] });
});

const CORE_BREAKS = [
  ['a missing version', (t) => { delete t.version; }, ['missing key: version']],
  ['an unknown key', (t) => { t.extra = true; }, ['unknown key: extra']],
  ['a reading category on a core task', (t) => { t.category = 'reading'; },
    ['category must be one of mixed, click-heavy for core tasks']],
  ['a startPath containing ..', (t) => { t.startPath = '/fixtures/../sample/index.html'; },
    ["startPath must not contain '..'"]],
  ['an instruction without {startUrl}', (t) => { t.instruction = 'Type alpha into the Value field, then press Save.'; },
    ['instruction must contain {startUrl} exactly once']],
  ['timeBudgetMs 10', (t) => { t.timeBudgetMs = 10; }, ['timeBudgetMs must be an integer in 30000..900000']],
  ['a request check with count -1', (t) => { t.success.all[0].count = -1; },
    ['success.all[0] (request) count must be an integer in 0..100']],
  ["a marker named 'Bad Name'", (t) => { t.success.all[2].name = 'Bad Name'; },
    ['success.all[2] (marker) name must match ^[a-z0-9-]{1,40}$']],
  ['a text check on a core task', (t) => { t.success.all.push({ kind: 'text', includes: 'alpha' }); },
    ['success.all[3] (text) is live-only']],
  ['schemaVersion 2', (t) => { t.schemaVersion = 2; }, ['schemaVersion must be 1']],
  ['an id whose prefix is not the set', (t) => { t.id = 'live-sample-save'; }, ["id prefix must equal set 'core'"]],
  ['an id with capitals', (t) => { t.id = 'core-Sample'; }, ['id must match ^(core|live)-[a-z0-9]+(-[a-z0-9]+)*$']],
  ['version 0', (t) => { t.version = 0; }, ['version must be a positive integer']],
  ['version 1.5', (t) => { t.version = 1.5; }, ['version must be a positive integer']],
  ['an unknown set', (t) => { t.set = 'other'; }, ["set must be 'core' or 'live'"]],
  ['timeBudgetMs 900001', (t) => { t.timeBudgetMs = 900001; }, ['timeBudgetMs must be an integer in 30000..900000']],
  ['a 19-character instruction', (t) => { t.instruction = 'Open {startUrl} now'; },
    ['instruction must be a string of 20..2000 characters']],
  ['two {startUrl} tokens', (t) => { t.instruction = 'Open {startUrl}, then open {startUrl} again.'; },
    ['instruction must contain {startUrl} exactly once']],
  ['a startPath outside /fixtures/', (t) => { t.startPath = '/api/sample/index.html'; },
    ['startPath must start with /fixtures/ and end with .html']],
  ['a startPath with //', (t) => { t.startPath = '/fixtures//sample/index.html'; }, ["startPath must not contain '//'"]],
  ['a startPath with a query', (t) => { t.startPath = '/fixtures/sample/index.html?x=1.html'; },
    ["startPath must not contain '?'"]],
  ['a startPath with a fragment', (t) => { t.startPath = '/fixtures/sample/index.html#a.html'; },
    ["startPath must not contain '#'"]],
  ['a startPath with an encoded segment', (t) => { t.startPath = '/fixtures/%2e%2e/index.html'; },
    ["startPath must use plain segments of letters, digits, '.', '_' or '-'"]],
  ['fixtureFiles without the startPath file', (t) => { t.fixtureFiles = ['sample/app.js']; },
    ['fixtureFiles must include sample/index.html (the startPath file)']],
  ['an empty fixtureFiles', (t) => { t.fixtureFiles = []; }, ['fixtureFiles must be a non-empty array']],
  ['a fixture path with a leading /', (t) => { t.fixtureFiles = ['sample/index.html', '/etc/passwd']; },
    ["fixtureFiles[1] must not start with '/'"]],
  ['a fixture path with ..', (t) => { t.fixtureFiles = ['sample/index.html', 'sample/../../package.json']; },
    ["fixtureFiles[1] must not contain '..'"]],
  ['a repeated fixture path', (t) => { t.fixtureFiles = ['sample/index.html', 'sample/index.html']; },
    ['fixtureFiles[1] repeats sample/index.html']],
  ['success with an extra key', (t) => { t.success.any = []; }, ['success must be exactly { all: [...] }']],
  ['no checks', (t) => { t.success.all = []; }, ['success.all must hold 1..20 checks']],
  ['21 checks', (t) => { t.success.all = Array.from({ length: 21 }, () => t.success.all[2]); },
    ['success.all must hold 1..20 checks']],
  ['an unknown check kind', (t) => { t.success.all[0] = { kind: 'screenshot' }; }, ['success.all[0] has an unknown kind']],
  ['a request method FETCH', (t) => { t.success.all[0].method = 'FETCH'; },
    ['success.all[0] (request) method must be one of GET, POST, PUT, PATCH, DELETE']],
  ['a request path without a leading /', (t) => { t.success.all[0].path = 'api/sample/save'; },
    ["success.all[0] (request) path must start with '/' and not contain '..'"]],
  ['a request without count', (t) => { delete t.success.all[0].count; },
    ['success.all[0] (request) needs method, path and count']],
  ['a request with an unknown key', (t) => { t.success.all[0].body = 'x'; },
    ['success.all[0] (request) has unknown key: body']],
  ['a core finalUrl without pathEquals', (t) => { delete t.success.all[1].pathEquals; },
    ['success.all[1] (finalUrl) requires pathEquals']],
  ['a core finalUrl with urlIncludes', (t) => { t.success.all[1].urlIncludes = 'saved'; },
    ['success.all[1] (finalUrl) has unknown key: urlIncludes']],
  ['a finalUrl queryIncludes with a number', (t) => { t.success.all[1].queryIncludes = { view: 1 }; },
    ['success.all[1] (finalUrl) queryIncludes must be a non-empty object of string values']],
  ['a marker without equals', (t) => { delete t.success.all[2].equals; },
    ['success.all[2] (marker) must be exactly { kind, name, equals }']],
  ['a 201-character marker value', (t) => { t.success.all[2].equals = 'x'.repeat(201); },
    ['success.all[2] (marker) equals must be a string of at most 200 characters']],
];

for (const [label, mutate, expected] of CORE_BREAKS) {
  test(`a core task with ${label} is invalid with a specific error`, () => {
    const task = sampleCore();
    mutate(task);
    assert.deepEqual(validateTask(task), { ok: false, errors: expected });
  });
}

test('validation collects every error instead of stopping at the first', () => {
  const task = sampleCore();
  delete task.version;
  task.timeBudgetMs = 10;
  task.success.all[2].name = 'Bad Name';
  assert.deepEqual(validateTask(task).errors, [
    'missing key: version',
    'timeBudgetMs must be an integer in 30000..900000',
    'success.all[2] (marker) name must match ^[a-z0-9-]{1,40}$',
  ]);
});

test('a non-object task is invalid', () => {
  for (const value of [null, [], 'core-sample-save', 42, undefined]) {
    assert.deepEqual(validateTask(value), { ok: false, errors: ['task must be a JSON object'] });
  }
});

const LIVE_BREAKS = [
  ['an http:// startUrl', (t) => { t.startUrl = 'http://issues.apache.org/jira/browse/HADOOP-1'; },
    ['startUrl must be an absolute https:// URL']],
  ['a relative startUrl', (t) => { t.startUrl = 'issues.apache.org/jira/browse/HADOOP-1'; },
    ['startUrl must be an absolute https:// URL']],
  ['a startUrl with credentials', (t) => { t.startUrl = 'https://user:pw@issues.apache.org/jira/'; },
    ['startUrl must not carry credentials']],
  ['a marker check', (t) => { t.success.all.push({ kind: 'marker', name: 'x', equals: 'y' }); },
    ['success.all[2] (marker) is core-only']],
  ['a request check', (t) => { t.success.all.push({ kind: 'request', method: 'GET', path: '/x', count: 1 }); },
    ['success.all[2] (request) is core-only']],
  ['a core-style finalUrl', (t) => { t.success.all[0] = { kind: 'finalUrl', pathEquals: '/jira/browse/HADOOP-1' }; },
    ['success.all[0] (finalUrl) must be exactly { kind, urlIncludes } for live tasks']],
  ['an empty text check', (t) => { t.success.all[1].includes = ''; },
    ['success.all[1] (text) includes must be 1..200 characters']],
  ['a mixed category', (t) => { t.category = 'mixed'; }, ['category must be one of reading for live tasks']],
  ['fixtureFiles', (t) => { t.fixtureFiles = ['sample/index.html']; }, ['unknown key: fixtureFiles']],
  ['a startPath instead of a startUrl', (t) => { delete t.startUrl; t.startPath = '/fixtures/sample/index.html'; },
    ['missing key: startUrl', 'unknown key: startPath']],
];

for (const [label, mutate, expected] of LIVE_BREAKS) {
  test(`a live task with ${label} is invalid with a specific error`, () => {
    const task = sampleLive();
    mutate(task);
    assert.deepEqual(validateTask(task), { ok: false, errors: expected });
  });
}

test('with a fixtures root, a missing, non-file or escaping fixture file is reported', () => {
  withSampleCopy(({ fixtures }) => {
    const missing = sampleCore();
    missing.fixtureFiles = ['sample/index.html', 'sample/missing.html'];
    assert.deepEqual(validateTask(missing, { fixturesRoot: fixtures }).errors,
      ['fixtureFiles[1] not found under the fixtures root: sample/missing.html']);

    const directory = sampleCore();
    fs.mkdirSync(path.join(fixtures, 'sample', 'assets'));
    directory.fixtureFiles = ['sample/index.html', 'sample/assets'];
    assert.deepEqual(validateTask(directory, { fixturesRoot: fixtures }).errors,
      ['fixtureFiles[1] is not a file: sample/assets']);

    // A symlink that points outside the root passes the lexical check but
    // not the resolved one.
    const outside = path.join(path.dirname(fixtures), 'outside.html');
    fs.writeFileSync(outside, '<p>outside</p>');
    fs.symlinkSync(outside, path.join(fixtures, 'sample', 'escape.html'));
    const escaping = sampleCore();
    escaping.fixtureFiles = ['sample/index.html', 'sample/escape.html'];
    assert.deepEqual(validateTask(escaping, { fixturesRoot: fixtures }).errors,
      ['fixtureFiles[1] resolves outside the fixtures root: sample/escape.html']);

    // Without a fixtures root the same tasks pass the schema.
    assert.equal(validateTask(missing).ok, true);
    assert.equal(validateTask(escaping).ok, true);
  });
});

test('a missing fixtures root is one error, not one per file', () => {
  withTempDir((dir) => {
    assert.deepEqual(validateTask(sampleCore(), { fixturesRoot: path.join(dir, 'absent') }).errors,
      ['fixtures root not found']);
  });
});

test('loadTasks returns the sample set for each set', () => {
  const core = loadTasks({ tasksRoot: SAMPLE_TASKS, fixturesRoot: SAMPLE_FIXTURES, set: 'core' });
  assert.deepEqual(core.map((t) => t.id), ['core-sample-save']);
  assert.deepEqual(core[0], sampleCore());
  const live = loadTasks({ tasksRoot: SAMPLE_TASKS, fixturesRoot: SAMPLE_FIXTURES, set: 'live' });
  assert.deepEqual(live.map((t) => t.id), ['live-sample-read']);
});

test('loaded tasks are frozen, so their identity cannot drift after hashing', () => {
  const [task] = loadTasks({ tasksRoot: SAMPLE_TASKS, fixturesRoot: SAMPLE_FIXTURES, set: 'core' });
  assert.equal(Object.isFrozen(task), true);
  assert.equal(Object.isFrozen(task.success.all[0].jsonEquals), true);
  assert.throws(() => { task.version = 2; }, TypeError);
});

test('loadTasks sorts by id and ignores files that are not .json', () => {
  withSampleCopy(({ tasks, fixtures }) => {
    for (const id of ['core-zeta', 'core-alpha']) {
      writeJson(path.join(tasks, 'core', `${id}.json`), { ...sampleCore(), id });
    }
    fs.writeFileSync(path.join(tasks, 'core', 'README.md'), 'notes\n');
    const loaded = loadTasks({ tasksRoot: tasks, fixturesRoot: fixtures, set: 'core' });
    assert.deepEqual(loaded.map((t) => t.id), ['core-alpha', 'core-sample-save', 'core-zeta']);
  });
});

test('loadTasks throws when a file name differs from <id>.json', () => {
  withSampleCopy(({ tasks, fixtures }) => {
    writeJson(path.join(tasks, 'core', 'core-wrong-name.json'), { ...sampleCore(), id: 'core-other-name' });
    assert.throws(
      () => loadTasks({ tasksRoot: tasks, fixturesRoot: fixtures, set: 'core' }),
      /core\/core-wrong-name\.json: file name must be core-other-name\.json/,
    );
  });
});

test('loadTasks throws when a listed fixture file is missing', () => {
  withSampleCopy(({ tasks, fixtures }) => {
    const task = sampleCore();
    task.fixtureFiles = ['sample/index.html', 'sample/missing.html'];
    writeJson(path.join(tasks, 'core', 'core-sample-save.json'), task);
    assert.throws(
      () => loadTasks({ tasksRoot: tasks, fixturesRoot: fixtures, set: 'core' }),
      /core\/core-sample-save\.json: fixtureFiles\[1\] not found under the fixtures root: sample\/missing\.html/,
    );
  });
});

test('loadTasks throws one Error that lists every invalid file', () => {
  withSampleCopy(({ tasks, fixtures }) => {
    const noVersion = sampleCore();
    delete noVersion.version;
    writeJson(path.join(tasks, 'core', 'core-sample-save.json'), noVersion);
    fs.writeFileSync(path.join(tasks, 'core', 'core-broken.json'), '{ not json');
    writeJson(path.join(tasks, 'core', 'core-from-live.json'), { ...sampleLive(), id: 'core-from-live' });
    let caught = null;
    try {
      loadTasks({ tasksRoot: tasks, fixturesRoot: fixtures, set: 'core' });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof Error, 'loadTasks must throw');
    assert.match(caught.message, /core\/core-broken\.json: invalid JSON/);
    assert.match(caught.message, /core\/core-from-live\.json: .*set must match the directory 'core'/);
    assert.match(caught.message, /core\/core-sample-save\.json: missing key: version/);
  });
});

test('loadTasks rejects an unknown set and a missing directory', () => {
  assert.throws(() => loadTasks({ tasksRoot: SAMPLE_TASKS, fixturesRoot: SAMPLE_FIXTURES, set: 'other' }),
    /set must be 'core' or 'live'/);
  withTempDir((dir) => {
    assert.throws(() => loadTasks({ tasksRoot: dir, fixturesRoot: SAMPLE_FIXTURES, set: 'core' }),
      /benchmark task directory not readable/);
  });
});

test('fixtureSha256 is stable across calls and across key order', () => {
  const task = sampleCore();
  const first = fixtureSha256(task, SAMPLE_FIXTURES);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(fixtureSha256(task, SAMPLE_FIXTURES), first);
  const reordered = reverseKeys(task);
  assert.notDeepEqual(Object.keys(reordered), Object.keys(task));
  assert.equal(fixtureSha256(reordered, SAMPLE_FIXTURES), first);
});

test('fixtureSha256 hashes the canonical task plus each fixture file sorted by path', () => {
  const task = sampleCore();
  const files = [{ path: 'sample/index.html', sha256: sha256Hex(fs.readFileSync(SAMPLE_PAGE)) }];
  assert.equal(fixtureSha256(task, SAMPLE_FIXTURES), sha256Hex(canonicalJson({ task, files })));
});

test('fixtureSha256 follows fixture bytes, not the fixtures location', () => {
  const original = fixtureSha256(sampleCore(), SAMPLE_FIXTURES);
  withSampleCopy(({ fixtures }) => {
    assert.equal(fixtureSha256(sampleCore(), fixtures), original, 'an identical copy hashes the same');
    const page = path.join(fixtures, 'sample', 'index.html');
    const bytes = fs.readFileSync(page);
    const changed = Buffer.from(bytes);
    changed[changed.length - 2] ^= 0x01;
    fs.writeFileSync(page, changed);
    assert.notEqual(fixtureSha256(sampleCore(), fixtures), original, 'one changed byte changes the hash');
    fs.writeFileSync(page, bytes);
    assert.equal(fixtureSha256(sampleCore(), fixtures), original);
  });
});

test('fixtureSha256 hashes a live task alone and needs no fixtures', () => {
  const live = sampleLive();
  assert.equal(fixtureSha256(live), sha256Hex(canonicalJson(live)));
  assert.equal(fixtureSha256(reverseKeys(live)), fixtureSha256(live));
});

test('fixtureSha256 refuses fixture paths that leave the root or do not exist', () => {
  const escaping = sampleCore();
  escaping.fixtureFiles = ['sample/index.html', '../package.json'];
  assert.throws(() => fixtureSha256(escaping, SAMPLE_FIXTURES), /fixtureFiles\[1\] must not contain '\.\.'/);
  const missing = sampleCore();
  missing.fixtureFiles = ['sample/index.html', 'sample/missing.html'];
  assert.throws(() => fixtureSha256(missing, SAMPLE_FIXTURES), /not found under the fixtures root: sample\/missing\.html/);
});

test('corpusLock lists id, version and fixtureSha256 sorted by id', () => {
  withSampleCopy(({ fixtures }) => {
    const zeta = { ...sampleCore(), id: 'core-zeta', version: 3 };
    const core = sampleCore();
    const live = sampleLive();
    const lock = corpusLock([zeta, live, core], fixtures);
    assert.deepEqual(lock, [
      { id: 'core-sample-save', version: 1, fixtureSha256: fixtureSha256(core, fixtures) },
      { id: 'core-zeta', version: 3, fixtureSha256: fixtureSha256(zeta, fixtures) },
      { id: 'live-sample-read', version: 1, fixtureSha256: fixtureSha256(live, fixtures) },
    ]);
  });
});

test('renderInstruction replaces the single {startUrl} token', () => {
  assert.equal(
    renderInstruction(sampleCore(), PAGE_URL),
    `Open ${PAGE_URL}. Type alpha into the Value field, then press Save.`,
  );
  // String.replace patterns such as $& must stay literal.
  const odd = 'https://example.test/$&/$\'/$1';
  assert.equal(renderInstruction(sampleLive(), odd), `Open ${odd} and report the issue key and its summary.`);
});

test('renderInstruction refuses a missing token or a non-string url', () => {
  const task = sampleCore();
  task.instruction = 'Type alpha into the Value field, then press Save.';
  assert.throws(() => renderInstruction(task, PAGE_URL), /\{startUrl\} exactly once/);
  assert.throws(() => renderInstruction(sampleCore(), null), TypeError);
  assert.throws(() => renderInstruction(sampleCore(), ''), TypeError);
});

test('the sample page posts to the run-scoped API with a relative URL', () => {
  const html = fs.readFileSync(SAMPLE_PAGE, 'utf8');
  assert.equal(html.split("fetch('../../api/sample/save'").length, 2, 'exactly one save fetch');
  assert.ok(html.includes("history.replaceState(null, '', '?view=saved')"));
  assert.equal(html.split('data-bench-marker="saved-value"').length, 2, 'exactly one saved-value marker');
  assert.equal(new URL('../../api/sample/save', PAGE_URL).pathname, '/r/tok/api/sample/save');
  assert.equal(new URL('?view=saved', PAGE_URL).href, `${PAGE_URL}?view=saved`);
});

test('the sample page is self-contained: relative or data: URLs only', () => {
  const html = fs.readFileSync(SAMPLE_PAGE, 'utf8');
  assert.doesNotMatch(html, /https?:\/\//i);
  const refs = [...html.matchAll(/\b(?:src|href|action)\s*=\s*["']([^"']*)["']/gi)].map((m) => m[1]);
  for (const ref of refs) {
    assert.ok(ref.startsWith('data:') || !(ref.startsWith('/') || ref.includes(':')), `absolute reference ${ref}`);
  }
});

test('evidence shaped like the sample page passes the sample task', () => {
  const evidence = {
    requests: [
      { t: 1, method: 'GET', path: '/fixtures/sample/index.html', query: {}, bodyType: 'none', body: null },
      { t: 2, method: 'POST', path: '/api/sample/save', query: {}, bodyType: 'json', body: { value: 'alpha' } },
    ],
    finalUrl: new URL('?view=saved', PAGE_URL).href,
    markers: { 'saved-value': 'alpha' },
    text: null,
  };
  const outcome = evaluateOutcome(sampleCore(), evidence, { token: 'tok' });
  assert.equal(outcome.pass, true);
  assert.deepEqual(outcome.checks.map((c) => c.pass), [true, true, true]);
});
