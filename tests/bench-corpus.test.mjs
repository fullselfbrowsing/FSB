// Phase 66 frozen benchmark corpus (D-15, D-16, D-17; T-66-04, T-66-06).
//
// The core set is 12 local fixture tasks (6 mixed, 6 click-heavy), frozen
// through Phase 71 by scripts/bench/tasks/core.lock.json. The live set is 4
// login-free reading tasks, reported apart from the release gate. Every core
// success spec is proven evaluable offline: its request bodies go through the
// real fixture server (port 0) and the claim-blind evaluator, the correct
// bodies pass, and a wrong or an extra body fails.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { startFixtureServer } from '../scripts/bench/fixture-server.mjs';
import { evaluateOutcome } from '../scripts/bench/lib/outcome.mjs';
import {
  BENCH_FIXTURES_ROOT,
  BENCH_TASKS_ROOT,
  corpusLock,
  loadTasks,
  renderInstruction,
} from '../scripts/bench/lib/tasks.mjs';

const LOCK_FILE = path.join(BENCH_TASKS_ROOT, 'core.lock.json');
const SHARED_HELPER = '_shared/bench.js';
const API_PATH = /^\/api\/([a-z0-9-]+)\/([a-z0-9-]+)$/;
const SHOWCASE_ORIGIN = 'https://full-selfbrowsing.com/';
const CORE_IDS = [
  'core-click-accordion-drilldown',
  'core-click-checklist',
  'core-click-confirm-modals',
  'core-click-custom-dropdowns',
  'core-click-kanban-moves',
  'core-click-tabbed-toggles',
  'core-mixed-invoice-lookup',
  'core-mixed-paginate-find',
  'core-mixed-search-detail',
  'core-mixed-settings-change',
  'core-mixed-ticket-triage',
  'core-mixed-wizard-submit',
];
const LIVE_IDS = [
  'live-jira-apache-hadoop-1',
  'live-jira-atlassian-jraserver-1369',
  'live-uat-showcase-privacy',
  'live-uat-showcase-support',
];
// Static safety (Pitfall 9, T-66-06): nothing that loads external resources,
// keeps cross-run state, changes the DOM later on its own, or sends requests
// in the background.
const FORBIDDEN = [
  [/https?:\/\//i, 'an http(s) URL'],
  [/localStorage|sessionStorage|indexedDB/i, 'browser storage'],
  [/document\.cookie/, 'cookie access'],
  [/MutationObserver/, 'a mutation observer'],
  [/setInterval|setTimeout|requestAnimationFrame|requestIdleCallback/, 'a timer'],
  [/Math\.random|crypto\./, 'randomness'],
  [/Date\.now|new Date|performance\.now/, 'clock-dependent data'],
  [/XMLHttpRequest|sendBeacon|WebSocket|EventSource|Worker\(|serviceWorker/, 'a background channel'],
  [/<(iframe|object|embed|base)\b/i, 'an embedded or base element'],
  [/@import|url\(/i, 'a CSS resource'],
];

const cache = {};
const core = () => (cache.core ??= loadTasks({ set: 'core' }));
const live = () => (cache.live ??= loadTasks({ set: 'live' }));
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const fixturePath = (rel) => path.join(BENCH_FIXTURES_ROOT, ...rel.split('/'));
const read = (rel) => fs.readFileSync(fixturePath(rel), 'utf8');
const appSlug = (task) => task.startPath.split('/')[2];
const requestChecks = (task) => task.success.all.filter((check) => check.kind === 'request');
const bodyChecks = (task) => requestChecks(task).filter((check) => hasOwn(check, 'jsonEquals'));
const totalChecks = (task) => requestChecks(task).filter((check) => !hasOwn(check, 'jsonEquals'));
const bodyOf = (id, index = 0) => bodyChecks(core().find((task) => task.id === id))[index].jsonEquals;
const fixtureText = (task) => task.fixtureFiles.map(read).join('\n');

// Relative POSIX paths of every file under dir, sorted.
function walk(dir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

function readLock() {
  return JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
}

async function withServer(fn) {
  const server = await startFixtureServer();
  try {
    return await fn(server);
  } finally {
    await server.close();
  }
}

async function post(server, token, apiPath, body) {
  const response = await fetch(`${server.baseUrl}/r/${token}${apiPath}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
}

// The final URL a page reaches when the task succeeds, built from its check.
function finalUrlFor(server, token, task) {
  const check = task.success.all.find((each) => each.kind === 'finalUrl');
  const base = server.runUrl(token, check.pathEquals || task.startPath);
  return check.queryIncludes ? `${base}?${new URLSearchParams(check.queryIncludes)}` : base;
}

function markersFor(task) {
  return Object.fromEntries(task.success.all.filter((check) => check.kind === 'marker').map((check) => [check.name, check.equals]));
}

function evidenceFor(server, token, task) {
  return { requests: server.evidence(token).requests, finalUrl: finalUrlFor(server, token, task), markers: markersFor(task) };
}

// A body one value away from the expected one.
function nearMiss(body) {
  const [key] = Object.keys(body);
  const value = body[key];
  let changed;
  if (typeof value === 'string') changed = `${value}-x`;
  else if (typeof value === 'number') changed = value + 1;
  else if (typeof value === 'boolean') changed = !value;
  else if (Array.isArray(value)) changed = value.slice(0, -1);
  else throw new Error(`no near miss for ${key}`);
  return { ...body, [key]: changed };
}

// Evaluates a classic data script and returns plain JSON copies of its values.
function scriptValues(rel, expression) {
  const context = vm.createContext({});
  vm.runInContext(read(rel), context, { filename: rel });
  return JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context));
}

test('the core set is exactly 12 fixture tasks: 6 mixed and 6 click-heavy (D-16)', () => {
  const tasks = core();
  assert.deepEqual(tasks.map((task) => task.id), CORE_IDS);
  assert.equal(new Set(tasks.map((task) => task.id)).size, 12);
  assert.equal(tasks.filter((task) => task.category === 'mixed').length, 6);
  assert.equal(tasks.filter((task) => task.category === 'click-heavy').length, 6);
  for (const task of tasks) {
    assert.equal(task.set, 'core');
    assert.ok(task.id.startsWith(task.category === 'mixed' ? 'core-mixed-' : 'core-click-'), task.id);
    assert.equal(task.startPath, `/fixtures/${appSlug(task)}/index.html`, task.id);
    assert.ok(task.instruction.startsWith('Open {startUrl}. '), task.id);
  }
});

test('the live set is 4 login-free reading tasks: 2 Jira-style and 2 UAT-style on the showcase (D-15, decision 8)', () => {
  const tasks = live();
  assert.deepEqual(tasks.map((task) => task.id), LIVE_IDS);
  assert.ok(tasks.length >= 2 && tasks.length <= 4);
  for (const task of tasks) {
    assert.equal(task.category, 'reading', task.id);
    assert.ok(task.startUrl.startsWith('https://'), task.id);
    assert.deepEqual([...new Set(task.success.all.map((check) => check.kind))].sort(), ['finalUrl', 'text'], task.id);
  }
  const jira = tasks.filter((task) => task.id.startsWith('live-jira-'));
  const uat = tasks.filter((task) => task.startUrl.startsWith(SHOWCASE_ORIGIN));
  assert.equal(jira.length, 2);
  assert.equal(uat.length, 2);
  for (const task of jira) assert.match(new URL(task.startUrl).pathname, /\/browse\/[A-Z]+-\d+$/, task.id);
  for (const task of uat) assert.ok(task.id.startsWith('live-uat-'), task.id);
});

test('core.lock.json freezes every core task by id, version and fixtureSha256, and nothing else (D-15)', () => {
  const text = fs.readFileSync(LOCK_FILE, 'utf8');
  const lock = JSON.parse(text);
  assert.deepEqual(Object.keys(lock).sort(), ['note', 'schemaVersion', 'tasks']);
  assert.equal(lock.schemaVersion, 1);
  assert.match(lock.note, /frozen through Phase 71 \(D-15\)/);
  assert.match(lock.note, /version bump/);
  const expected = corpusLock(core(), BENCH_FIXTURES_ROOT);
  assert.deepEqual(lock.tasks, expected);
  assert.deepEqual(lock.tasks.map((entry) => entry.id), CORE_IDS);
  for (const entry of lock.tasks) {
    assert.deepEqual(Object.keys(entry).sort(), ['fixtureSha256', 'id', 'version']);
    assert.match(entry.fixtureSha256, /^[0-9a-f]{64}$/);
  }
  const liveIds = new Set(live().map((task) => task.id));
  assert.ok(lock.tasks.every((entry) => !liveIds.has(entry.id)), 'live tasks stay out of the lock');
  // Deterministic bytes: pretty JSON with a trailing newline and no timestamp.
  assert.equal(text, `${JSON.stringify({ schemaVersion: 1, note: lock.note, tasks: expected }, null, 2)}\n`);
});

test('each app directory belongs to one core task, and every file in it is listed, so the lock hashes it', () => {
  const tasks = core();
  const bySlug = new Map(tasks.map((task) => [appSlug(task), task]));
  assert.equal(bySlug.size, 12);
  const entries = fs.readdirSync(BENCH_FIXTURES_ROOT, { withFileTypes: true });
  for (const entry of entries) assert.ok(entry.isDirectory(), `unexpected file at the fixtures root: ${entry.name}`);
  assert.deepEqual(entries.map((entry) => entry.name).sort(), ['_shared', ...bySlug.keys()].sort());
  assert.deepEqual(walk(path.join(BENCH_FIXTURES_ROOT, '_shared')), ['bench.js']);
  for (const [slug, task] of bySlug) {
    const files = walk(path.join(BENCH_FIXTURES_ROOT, slug)).map((file) => `${slug}/${file}`);
    assert.deepEqual([...task.fixtureFiles].sort(), [SHARED_HELPER, ...files].sort(), task.id);
  }
});

test('each request check names its own app and an action its pages post, and its pages set each marker (W2)', () => {
  const helper = read(SHARED_HELPER);
  assert.ok(helper.includes('fetch(`../../api/${appSlug()}/${action}`'), 'benchPost posts to ../../api/<slug>/<action>');
  for (const task of core()) {
    const slug = appSlug(task);
    const text = fixtureText(task);
    assert.ok(task.fixtureFiles.includes(SHARED_HELPER), `${task.id} lists ${SHARED_HELPER}`);
    assert.ok(requestChecks(task).length > 0, `${task.id} needs server-visible evidence`);
    for (const check of requestChecks(task)) {
      assert.equal(check.method, 'POST', task.id);
      const match = API_PATH.exec(check.path);
      assert.ok(match, `${task.id} ${check.path} is /api/<slug>/<action>`);
      assert.equal(match[1], slug, `${task.id} posts to its own app`);
      assert.ok(text.includes(`data-bench-app="${match[1]}"`), `${task.id} pages carry data-bench-app="${match[1]}"`);
      assert.ok(text.includes(`benchPost('${match[2]}'`), `${task.id} pages call benchPost('${match[2]}'`);
    }
    for (const check of task.success.all.filter((each) => each.kind === 'marker')) {
      const needles = [`data-bench-marker="${check.name}"`, `setMarker('${check.name}'`, `/${check.name}"`];
      assert.ok(needles.some((needle) => text.includes(needle)), `${task.id} pages set marker ${check.name}`);
    }
    for (const file of task.fixtureFiles.filter((each) => each.endsWith('.html'))) {
      const html = read(file);
      assert.ok(html.includes(`<html lang="en" data-bench-app="${slug}">`), `${file} names its app`);
      assert.ok(html.includes('<script src="../_shared/bench.js"></script>'), `${file} loads the shared helper`);
      assert.ok(html.includes('<link rel="icon" href="data:,">'), `${file} requests no favicon`);
    }
  }
});

test('every exact body is paired with an exact total for its endpoint, and URL and DOM evidence is required (T-66-04)', () => {
  for (const task of core()) {
    const endpoints = new Map();
    for (const check of requestChecks(task)) {
      const key = `${check.method} ${check.path}`;
      const slot = endpoints.get(key) || { bodies: 0, totals: [] };
      if (hasOwn(check, 'jsonEquals')) {
        assert.ok(check.count >= 1, `${task.id} ${key} expects its body at least once`);
        slot.bodies += check.count;
      } else {
        slot.totals.push(check.count);
      }
      endpoints.set(key, slot);
    }
    for (const [key, slot] of endpoints) {
      assert.ok(slot.bodies >= 1, `${task.id} ${key} checks an exact body`);
      assert.deepEqual(slot.totals, [slot.bodies], `${task.id} ${key} has one total equal to its expected bodies`);
    }
    const finalUrl = task.success.all.filter((check) => check.kind === 'finalUrl');
    assert.equal(finalUrl.length, 1, task.id);
    assert.ok(finalUrl[0].pathEquals.startsWith(`/fixtures/${appSlug(task)}/`), task.id);
    assert.ok(task.success.all.some((check) => check.kind === 'marker'), `${task.id} reads a DOM marker`);
  }
});

test('fixture files are static and self-contained: no external URLs, storage, timers, observers or background requests (Pitfall 9, T-66-06)', () => {
  const files = walk(BENCH_FIXTURES_ROOT);
  assert.ok(files.length >= 17);
  for (const file of files) {
    assert.match(file, /\.(html|js)$/, `${file} is a page or a script`);
    const text = read(file);
    for (const [pattern, label] of FORBIDDEN) assert.doesNotMatch(text, pattern, `${file} contains ${label}`);
    if (file !== SHARED_HELPER) assert.doesNotMatch(text, /\bfetch\(/, `${file} requests outside benchPost`);
    for (const [, name, value] of text.matchAll(/\b(src|href|action)="([^"]*)"/g)) {
      if (value === 'data:,') continue;
      assert.ok(!value.startsWith('/') && !value.includes('//') && !value.includes(':'), `${file} ${name}="${value}" is relative`);
    }
  }
});

test('the invoice answer is the largest unpaid Northwind Traders invoice, with both planned distractors', () => {
  const rows = [...read('invoice-lookup/index.html').matchAll(
    /<tr data-invoice-id="(INV-10\d\d)"><td>\1<\/td><td>([^<]+)<\/td><td class="amount">\$([\d,]+\.\d\d)<\/td><td><span class="badge (paid|unpaid)">/g,
  )].map(([, id, customer, amount, status]) => ({ id, customer, amount: Number(amount.replace(/,/g, '')), status }));
  assert.equal(rows.length, 15);
  assert.equal(new Set(rows.map((row) => row.customer)).size, 4);
  const unpaid = rows.filter((row) => row.customer === 'Northwind Traders' && row.status === 'unpaid').sort((a, b) => b.amount - a.amount);
  assert.ok(unpaid[0].amount > unpaid[1].amount, 'the answer is unique');
  assert.deepEqual(bodyOf('core-mixed-invoice-lookup'), { invoiceId: unpaid[0].id });
  assert.ok(rows.some((row) => row.customer === 'Northwind Traders' && row.status === 'paid' && row.amount > unpaid[0].amount));
  assert.ok(rows.some((row) => row.customer !== 'Northwind Traders' && row.status === 'unpaid' && row.amount > unpaid[0].amount));
});

test('the ticket answer is the only open billing ticket reported by Dana, and it is not already In Progress', () => {
  const literal = /const TICKETS = (\[[\s\S]*?\]);/.exec(read('ticket-triage/index.html'))[1];
  const tickets = JSON.parse(JSON.stringify(vm.runInNewContext(`(${literal})`)));
  assert.equal(tickets.length, 10);
  const byDana = (ticket) => ticket.reporter.split(' ')[0] === 'Dana';
  const billing = (ticket) => ticket.labels.includes('billing');
  const matches = tickets.filter((ticket) => billing(ticket) && byDana(ticket) && ticket.status !== 'Done');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].status, 'To Do');
  assert.deepEqual(bodyOf('core-mixed-ticket-triage'), { ticketId: matches[0].key, status: 'In Progress' });
  assert.ok(tickets.some((ticket) => billing(ticket) && !byDana(ticket)), 'billing ticket by someone else');
  assert.ok(tickets.some((ticket) => byDana(ticket) && !billing(ticket)), 'Dana ticket without billing');
  assert.ok(tickets.some((ticket) => billing(ticket) && byDana(ticket) && ticket.status === 'Done'), 'closed billing ticket by Dana');
});

test('the search answer is the only waterproof trail running shoe under $120, with both planned distractors', () => {
  const catalog = scriptValues('search-detail/catalog.js', 'CATALOG');
  assert.equal(catalog.length, 30);
  assert.equal(new Set(catalog.map((item) => item.sku)).size, 30);
  const results = scriptValues('search-detail/catalog.js', "searchCatalog('trail running shoe')");
  assert.deepEqual(scriptValues('search-detail/catalog.js', "searchCatalog('trail running shoes')"), results);
  const answers = results.filter((item) => item.waterproof && item.price < 120);
  assert.equal(answers.length, 1);
  assert.deepEqual(bodyOf('core-mixed-search-detail'), { sku: answers[0].sku });
  assert.ok(results.some((item) => item.waterproof && item.price >= 120), 'a waterproof one over $120');
  assert.ok(results.some((item) => !item.waterproof && item.price < 120 && /Shoe$/.test(item.name)), 'a dry one under $120');
});

test('the catalog answer is the only 12 oz blue ceramic mug, on page 4, with both planned distractors', () => {
  const { items, pageSize } = scriptValues('paginate-find/items.js', '({ items: ITEMS, pageSize: PAGE_SIZE })');
  assert.equal(items.length, 50);
  assert.equal(new Set(items.map((item) => item.id)).size, 50);
  const pageOf = (name) => Math.floor(items.findIndex((item) => item.name === name) / pageSize) + 1;
  const matches = items.filter((item) => item.name === 'Blue ceramic mug, 12 oz');
  assert.equal(matches.length, 1);
  assert.deepEqual(bodyOf('core-mixed-paginate-find'), { itemId: matches[0].id });
  const check = core().find((task) => task.id === 'core-mixed-paginate-find').success.all.find((each) => each.kind === 'finalUrl');
  assert.equal(check.queryIncludes.page, String(pageOf('Blue ceramic mug, 12 oz')));
  assert.equal(pageOf('Blue ceramic mug, 16 oz'), 2);
  assert.equal(pageOf('Green ceramic mug, 12 oz'), 5);
});

test('the settings answer is the profile time zone, with a same-offset distractor and UTC as the default', () => {
  const html = read('settings-change/index.html');
  const zone = /<span class="k">Time zone:<\/span> ([A-Za-z_]+\/[A-Za-z_]+) \(UTC-05:00\)/.exec(html)[1];
  assert.deepEqual(bodyOf('core-mixed-settings-change'), { digestTimezone: zone, weeklyDigest: true });
  assert.ok(html.includes(`<option value="${zone}">${zone} (UTC-05:00)</option>`));
  assert.ok(html.includes('<option value="America/Toronto">America/Toronto (UTC-05:00)</option>'));
  assert.ok(html.includes('<option value="UTC" selected>'));
  assert.ok(html.includes('id="weekly-digest" class="switch-row" role="switch" tabindex="0" aria-checked="false"'));
});

test('the click-heavy targets exist on their pages and the expected bodies follow from the page defaults', () => {
  const toggles = [...read('tabbed-toggles/index.html').matchAll(/aria-checked="(true|false)" aria-label="[^"]+" data-key="(\w+)"/g)];
  const defaults = Object.fromEntries(toggles.map(([, on, key]) => [key, on === 'true']));
  const saved = bodyOf('core-click-tabbed-toggles');
  assert.deepEqual(Object.keys(saved), Object.keys(defaults));
  assert.deepEqual(Object.keys(saved).filter((key) => saved[key] !== defaults[key]), ['compactMode', 'emailMentions', 'hideOnlineStatus']);

  const board = /const INITIAL = (\{[\s\S]*?\});/.exec(read('kanban-moves/index.html'))[1];
  const columns = JSON.parse(JSON.stringify(vm.runInNewContext(`(${board})`)));
  const moves = bodyChecks(core().find((task) => task.id === 'core-click-kanban-moves')).map((check) => check.jsonEquals);
  for (const { card, column } of moves) {
    const from = Object.keys(columns).find((slug) => columns[slug].includes(card));
    assert.ok(from && from !== column, `${card} can move to ${column}`);
    columns[from] = columns[from].filter((title) => title !== card);
    columns[column].push(card);
  }
  const markers = markersFor(core().find((task) => task.id === 'core-click-kanban-moves'));
  assert.equal(markers['column-done'], [...columns.done].sort().join('|'));
  assert.equal(markers['column-doing'], [...columns.doing].sort().join('|'));

  const accordion = read('accordion-drilldown/index.html');
  const { path: togglePath } = bodyOf('core-click-accordion-drilldown');
  assert.ok(accordion.includes(`aria-checked="false" aria-label="Require re-authentication for exports" data-path="${togglePath}"`));
  assert.ok(accordion.includes('aria-label="Require re-authentication for exports (audit copy)" data-path="organization/security/audit/'));

  const dropdowns = read('custom-dropdowns/index.html');
  const labels = { region: 'Europe (West)', size: 'Large', color: 'Graphite', shipping: 'Express' };
  for (const [name, value] of Object.entries(bodyOf('core-click-custom-dropdowns'))) {
    assert.ok(dropdowns.includes(`data-value="${value}">${labels[name]}</div>`), `${name} option ${value}`);
  }

  const records = read('confirm-modals/index.html');
  assert.ok(records.includes(`data-record-id="${bodyOf('core-click-confirm-modals').recordId}" data-record-name="Q3 draft forecast"`));
  assert.ok(records.includes('data-record-name="Q3 final forecast"'));

  const checklist = read('checklist/index.html');
  assert.equal([...checklist.matchAll(/<input type="checkbox" name="item" value="([a-z]+)">/g)].length, 10, 'ten boxes, none checked');
  for (const value of bodyOf('core-click-checklist').checked) assert.ok(checklist.includes(`value="${value}">`), value);
});

test('offline self-check: every core task passes on its own expected bodies through the real fixture server and evaluator, and one extra body fails its totals', async () => {
  await withServer(async (server) => {
    for (const task of core()) {
      const token = server.newRunToken();
      for (const check of bodyChecks(task)) {
        for (let i = 0; i < check.count; i += 1) await post(server, token, check.path, check.jsonEquals);
      }
      const passing = evaluateOutcome(task, evidenceFor(server, token, task), { token });
      assert.equal(passing.pass, true, `${task.id}: ${JSON.stringify(passing.checks)}`);
      assert.ok(passing.checks.every((check) => check.pass), task.id);

      for (const apiPath of new Set(totalChecks(task).map((check) => check.path))) {
        await post(server, token, apiPath, { benchSelfCheck: 'extra' });
      }
      const extra = evaluateOutcome(task, evidenceFor(server, token, task), { token });
      assert.equal(extra.pass, false, task.id);
      task.success.all.forEach((check, index) => {
        if (check.kind === 'request' && !hasOwn(check, 'jsonEquals')) {
          assert.deepEqual(extra.checks[index], { kind: 'request', pass: false, detail: { matched: check.count + 1, expected: check.count } }, task.id);
        } else {
          assert.equal(extra.checks[index].pass, true, `${task.id} check ${index} is unaffected by the extra body`);
        }
      });
      server.clear(token);
    }
  });
});

test('offline self-check: a near-miss body in place of each expected one fails its exact-body check', async () => {
  await withServer(async (server) => {
    for (const task of core()) {
      const token = server.newRunToken();
      for (const check of bodyChecks(task)) {
        for (let i = 0; i < check.count; i += 1) await post(server, token, check.path, nearMiss(check.jsonEquals));
      }
      const outcome = evaluateOutcome(task, evidenceFor(server, token, task), { token });
      assert.equal(outcome.pass, false, task.id);
      task.success.all.forEach((check, index) => {
        if (check.kind === 'request' && hasOwn(check, 'jsonEquals')) {
          assert.deepEqual(outcome.checks[index].detail, { matched: 0, expected: check.count }, task.id);
        } else {
          assert.equal(outcome.checks[index].pass, true, `${task.id} check ${index} still passes`);
        }
      });
      server.clear(token);
    }
  });
});

test('the fixture server serves every listed file under the run prefix, and every relative reference stays in the run', async () => {
  await withServer(async (server) => {
    for (const task of core()) {
      const token = server.newRunToken();
      const slug = appSlug(task);
      for (const file of task.fixtureFiles) {
        const url = server.runUrl(token, `/fixtures/${file}`);
        const response = await fetch(url);
        assert.equal(response.status, 200, url);
        assert.match(response.headers.get('content-type'), file.endsWith('.html') ? /^text\/html/ : /^text\/javascript/);
        assert.ok(Buffer.from(await response.arrayBuffer()).equals(fs.readFileSync(fixturePath(file))), file);
        if (!file.endsWith('.html')) continue;
        for (const [, , ref] of read(file).matchAll(/\b(src|href|action)="([^"]*)"/g)) {
          if (ref === 'data:,') continue;
          const target = new URL(ref, url);
          assert.ok(target.pathname.startsWith(`/r/${token}/fixtures/`), `${file} ${ref}`);
          const linked = await fetch(target);
          assert.equal(linked.status, 200, `${file} ${ref}`);
          await linked.arrayBuffer();
        }
        // benchPost's relative URL from this page lands on the checked API path.
        for (const check of requestChecks(task)) {
          const [, , action] = API_PATH.exec(check.path);
          assert.equal(new URL(`../../api/${slug}/${action}`, url).pathname, `/r/${token}${check.path}`, file);
        }
      }
      server.clear(token);
    }
  });
});

test('renderInstruction puts the run URL into every core instruction', async () => {
  await withServer(async (server) => {
    for (const task of core()) {
      const token = server.newRunToken();
      const startUrl = server.runUrl(token, task.startPath);
      const instruction = renderInstruction(task, startUrl);
      assert.ok(instruction.includes(`/r/${token}/fixtures/`), task.id);
      assert.ok(!instruction.includes('{startUrl}'), task.id);
      assert.ok(instruction.startsWith(`Open ${startUrl}. `), task.id);
      server.clear(token);
    }
  });
});
