#!/usr/bin/env node
'use strict';

/**
 * Phase 68 Plan 06 Task 1 -- the service-worker start path of fast mode
 * (D-01, D-03, D-05, D-10, F8, F21; AUTO-01, AUTO-05).
 *
 * extension/background.js gains four top-level helpers and four call sites:
 *
 *   - fsbFastModeSessionField(storedValue, source): the session.fastMode value
 *     for a start or a follow-up. Only a stored boolean true yields a field;
 *     a run_task start (source 'mcp') gets enabled:true plus budgetProfile
 *     'run_task', its own frozen fast-path budgets (Phase 70, D-04); every
 *     other start gets exactly the Phase 68 value, with no budgetProfile key.
 *   - fsbFastPathWithDeadline(promise, ms): resolves the promise's value, or
 *     null on rejection or when the deadline passes first.
 *   - fsbCreateFastPathDeps(): the dependency object the fast-path module
 *     reads from globalThis.fsbFastPathDeps (now, readSwitch, requestMenu,
 *     requestSnapshot, getTabUrl). Creating it calls nothing.
 *   - fsbRecomputeFastModeForFollowUp(existingSession, source): delivers the
 *     previous command's unflushed fast steps first, then reads the switch and
 *     assigns or deletes session.fastMode, so a hand-off is never lost.
 *
 * Plan 68-08 adds fsbFastPathCaptureWrite (the capture ring's one write
 * chain), the deps members readCaptureArm, appendCaptureRecord and
 * noteCaptureDrop, and case 'jevCaptureObservation'; "capture end to end"
 * drives the real content observation through the real case into the real
 * module and the ring.
 *
 * The helpers are extracted by name and evaluated in a vm context with a stub
 * chrome, a stub storage reader and held timers (nothing fires on its own).
 * The call sites are checked on the source, and createSessionHooks must stay
 * byte-identical to P68_START (68-SYNC-RECHECK.md item h).
 *
 * Phase 70 (70-02, D-04/D-05) inverts the 68 "run_task is never fast" cases
 * here: the (true, 'mcp') helper case, the run_task follow-up case and the
 * capture end-to-end run, which now runs a switched-on run_task and proves it
 * captures and attempts exactly like an autopilot session.
 *
 * Phase 70 (70-03, D-14) adds fsbRegisterFastRunEvidence(pipeline, session,
 * startUrl): on a session that carries the fast-mode field it registers the
 * three run evidence handlers (before-tool, after-tool, after-iteration) on
 * the session's hook pipeline, and anything else registers nothing. Its one
 * call sits between createSessionHooks and runAgentLoop on the new-session
 * path only; nothing persists the evidence.
 *
 * No network, no ports, no real timers. Node 20-safe.
 *
 * Run: node tests/jev-fast-start-path.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

// A promise that never settles must not pass as a clean exit.
process.exitCode = 1;

const ROOT = path.join(__dirname, '..');
const BG_PATH = path.join(ROOT, 'extension', 'background.js');
const STATE_PATH = path.join(ROOT, 'extension', 'ai', 'jev-state.js');
const FAST_PATH_PATH = path.join(ROOT, 'extension', 'ai', 'jev-fast-path.js');
const bgSource = fs.readFileSync(BG_PATH, 'utf8');
const bgLines = bgSource.split('\n');

// 68-SYNC-RECHECK.md item h, copied as a literal (this suite never reads .planning).
const CREATE_SESSION_HOOKS_SHA256 = '10ce1a544f31072f71121b8ee872a4ff6cdd8b07adb1c7a14171b50e4e940780';
// Phase 70 (70-02): fsbRecomputeFastModeForFollowUp at P70_START (3f7efb0a),
// with this suite's sliceFunction; D-04 widens the helper and nothing else.
const RECOMPUTE_FOLLOW_UP_SHA256 = 'bb06f1ffc65fd821fbe2b6a62d91b47bc776b996356fe9bba1aa8ac7412f0a8c';
// The run_task session field (Phase 70, D-04), keys in this order.
const RUN_TASK_FIELD = Object.freeze({ enabled: true, stored: true, source: 'mcp', budgetProfile: 'run_task' });

let passed = 0;
let failed = 0;

function check(cond, name) {
  if (cond) {
    passed += 1;
    console.log('  PASS: ' + name);
  } else {
    failed += 1;
    console.error('  FAIL: ' + name);
  }
}

function section(title) {
  console.log('\n--- ' + title + ' ---');
}

function json(value) {
  return JSON.stringify(value);
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function settle(times) {
  for (let i = 0; i < (times || 6); i += 1) await flush();
}

/**
 * 68-SYNC-RECHECK.md item h slicing: from `[async ]function <name>(` through
 * the brace that closes the body, the body brace being the first `{` after the
 * parameter list's matching `)`. Returns null when the name is absent.
 */
function sliceFunction(source, name, opts) {
  const plain = 'function ' + name + '(';
  let start = source.indexOf(plain);
  if (start < 0) return null;
  if (!(opts && opts.exact) && source.slice(start - 6, start) === 'async ') start -= 6;
  let i = source.indexOf('(', source.indexOf(plain));
  for (let depth = 0; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')' && --depth === 0) break;
  }
  let j = source.indexOf('{', i);
  for (let depth = 0; j < source.length; j += 1) {
    if (source[j] === '{') depth += 1;
    else if (source[j] === '}' && --depth === 0) break;
  }
  return source.slice(start, j + 1);
}

function countOf(text, needle) {
  let n = 0;
  let at = text.indexOf(needle);
  while (at !== -1) {
    n += 1;
    at = text.indexOf(needle, at + needle.length);
  }
  return n;
}

/** Held timers: a callback runs only when the test fires it. */
function makeTimers() {
  let nextId = 1;
  const pending = new Map();
  const set = [];
  const cleared = [];
  return {
    setTimeout(fn, ms) {
      const id = nextId;
      nextId += 1;
      pending.set(id, fn);
      set.push({ id, ms });
      return id;
    },
    clearTimeout(id) {
      cleared.push(id);
      pending.delete(id);
    },
    fireAll() {
      const fns = Array.from(pending.values());
      pending.clear();
      fns.forEach((fn) => fn());
    },
    pendingCount() {
      return pending.size;
    },
    set,
    cleared
  };
}

/** A stub chrome that records every call; behaviour comes from handlers. */
function makeChrome(handlers) {
  const h = handlers || {};
  const calls = [];
  const chrome = {
    storage: {
      local: {
        get(keys) {
          calls.push({ api: 'storage.local.get', keys: json(keys) });
          return h.storageGet ? h.storageGet(keys) : Promise.resolve({});
        }
      }
    },
    tabs: {
      sendMessage(tabId, message, options) {
        calls.push({ api: 'tabs.sendMessage', tabId, message: json(message), options: json(options) });
        return h.sendMessage ? h.sendMessage(tabId, message, options) : Promise.resolve(null);
      },
      get(tabId) {
        calls.push({ api: 'tabs.get', tabId });
        return h.tabsGet ? h.tabsGet(tabId) : Promise.resolve({ id: tabId });
      }
    }
  };
  return { chrome, calls };
}

const HELPER_NAMES = [
  'fsbFastModeSessionField',
  'fsbFastPathWithDeadline',
  'fsbFastPathCaptureWrite',
  'fsbCreateFastPathDeps',
  'fsbRecomputeFastModeForFollowUp',
  'fsbRegisterFastRunEvidence'
];
const helperSources = HELPER_NAMES.map((name) => sliceFunction(bgSource, name));

/** A vm context holding the helpers and the given globals. */
function makeContext(globals) {
  const ctx = vm.createContext(Object.assign({ console }, globals || {}));
  for (let k = 0; k < HELPER_NAMES.length; k += 1) {
    if (!helperSources[k]) throw new Error('helper not found in background.js: ' + HELPER_NAMES[k]);
    vm.runInContext(helperSources[k], ctx, { filename: 'background.js#' + HELPER_NAMES[k] });
  }
  return ctx;
}

async function main() {
  // -------------------------------------------------------------------------
  section('the helpers exist in extension/background.js');
  HELPER_NAMES.forEach((name, k) => check(typeof helperSources[k] === 'string' && helperSources[k].length > 0,
    name + ' is a top-level function in background.js'));
  if (helperSources.some((s) => !s)) {
    console.error('\nResults: ' + passed + ' passed, ' + failed + ' failed (helpers missing; nothing else can run)');
    process.exitCode = 1;
    return;
  }
  check(/^async function fsbRecomputeFastModeForFollowUp\(existingSession, source\) \{/m.test(bgSource),
    'fsbRecomputeFastModeForFollowUp(existingSession, source) is async');
  check(HELPER_NAMES.every((name) => countOf(bgSource, 'function ' + name + '(') === 1),
    'each helper is declared exactly once');
  check(helperSources.every((s) => !/jev/i.test(s.replace(/\b(fsbJevFastModeEnabled|getJevMenu|fsbJevCaptureArmed|fsbJevCaptureRing)\b/g, ''))),
    'no helper source contains jev text outside the allowlisted tokens fsbJevFastModeEnabled, getJevMenu, fsbJevCaptureArmed and fsbJevCaptureRing');

  // -------------------------------------------------------------------------
  section('fsbFastModeSessionField (D-01, D-05; Phase 70 D-04)');
  {
    const ctx = makeContext();
    const f = ctx.fsbFastModeSessionField;
    check(json(f(true, undefined)) === json({ enabled: true, stored: true, source: null }),
      '(true, undefined) -> {enabled:true, stored:true, source:null} (side panel and popup starts)');
    check(json(f(true, 'dashboard')) === json({ enabled: true, stored: true, source: 'dashboard' }),
      '(true, "dashboard") -> enabled:true, source "dashboard"');
    const mcpField = f(true, 'mcp');
    check(json(mcpField) === json(RUN_TASK_FIELD) && json(Object.keys(mcpField || {})) === json(['enabled', 'stored', 'source', 'budgetProfile']),
      '(true, "mcp") -> {enabled:true, stored:true, source:"mcp", budgetProfile:"run_task"}, keys in that order (run_task follows the switch with its own budgets, Phase 70 D-04)');
    const offInputs = [[false, undefined], [false, 'mcp'], [undefined, undefined], [undefined, 'dashboard'],
      ['true', undefined], [1, undefined], [null, undefined], [{}, undefined]];
    check(offInputs.every(([v, s]) => f(v, s) === null),
      'false, undefined, "true", 1, null and an object all give null (the field is absent when off)');
    const mcpOff = [[false, 'mcp'], [undefined, 'mcp'], ['true', 'mcp'], [1, 'mcp'], [null, 'mcp'], [{}, 'mcp']];
    check(mcpOff.every(([v, s]) => f(v, s) === null),
      'run_task with false, undefined, "true", 1, null or an object stored gives null (no field, the switch-off path; Phase 70 D-04)');
    // Every non-MCP start is byte-identical to Phase 68: enabled true, source
    // the start's non-empty string or null, and no budgetProfile key.
    const phase68 = (s) => ({ enabled: true, stored: true, source: typeof s === 'string' && s ? s : null });
    const nonMcp = [undefined, null, '', 'dashboard', 'sidepanel', 'popup', 'MCP', ' mcp', 42, {}];
    check(nonMcp.every((s) => json(f(true, s)) === json(phase68(s)) && !Object.prototype.hasOwnProperty.call(f(true, s), 'budgetProfile')),
      'every non-MCP start (undefined, null, "", dashboard, sidepanel, popup, "MCP", " mcp", 42, an object) returns exactly the Phase 68 value with no budgetProfile key');
    check(f(true, undefined) !== f(true, undefined) && f(true, 'mcp') !== f(true, 'mcp'), 'every call returns a fresh object');
  }

  // -------------------------------------------------------------------------
  section('fsbFastPathWithDeadline');
  {
    const timers = makeTimers();
    const ctx = makeContext({ setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
    const w = ctx.fsbFastPathWithDeadline;

    let out = 'unset';
    w(Promise.resolve({ ok: 1 }), 1500).then((v) => { out = v; });
    await settle();
    check(out && out.ok === 1, 'a value that arrives first is resolved');
    check(timers.set.length === 1 && timers.set[0].ms === 1500, 'one timer armed with the given deadline');
    check(timers.cleared.indexOf(timers.set[0].id) !== -1 && timers.pendingCount() === 0,
      'the timer is cleared when the promise settles');

    out = 'unset';
    w(Promise.reject(new Error('no receiver')), 1500).then((v) => { out = v; });
    await settle();
    check(out === null, 'a rejection resolves null');
    check(timers.pendingCount() === 0, 'the timer is cleared on rejection too');

    out = 'unset';
    let late;
    const held = new Promise((resolve) => { late = resolve; });
    w(held, 3000).then((v) => { out = v; });
    await settle();
    check(out === 'unset' && timers.pendingCount() === 1, 'a pending promise waits for its deadline');
    timers.fireAll();
    await settle();
    check(out === null, 'the deadline resolves null');
    late({ ok: 2 });
    await settle();
    check(out === null, 'a value arriving after the deadline is ignored');
  }

  // -------------------------------------------------------------------------
  section('fsbCreateFastPathDeps: inert creation, the switch reader');
  {
    const timers = makeTimers();
    let storageAnswer = () => Promise.resolve({ fsbJevFastModeEnabled: true });
    const { chrome, calls } = makeChrome({ storageGet: (keys) => storageAnswer(keys) });
    const ctx = makeContext({ chrome, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
    const deps = ctx.fsbCreateFastPathDeps();
    check(calls.length === 0 && timers.set.length === 0, 'creating the deps object makes no chrome call and arms no timer');
    check(json(Object.keys(deps).sort()) === json(['appendCaptureRecord', 'getTabUrl', 'noteCaptureDrop', 'now', 'readCaptureArm',
      'readSwitch', 'requestMenu', 'requestSnapshot']),
    'the deps object holds exactly now, readSwitch, requestMenu, requestSnapshot, getTabUrl and the capture members readCaptureArm, appendCaptureRecord and noteCaptureDrop');
    check(Object.keys(deps).every((k) => typeof deps[k] === 'function'), 'every member is a function');
    const before = Date.now();
    const t = deps.now();
    check(typeof t === 'number' && t >= before && t <= Date.now(), 'now() returns the wall clock in ms');

    const cases = [
      [() => Promise.resolve({ fsbJevFastModeEnabled: true }), true, 'a stored boolean true'],
      [() => Promise.resolve({ fsbJevFastModeEnabled: false }), false, 'a stored false'],
      [() => Promise.resolve({}), false, 'an absent key'],
      [() => Promise.resolve({ fsbJevFastModeEnabled: 'true' }), false, 'the string "true"'],
      [() => Promise.resolve({ fsbJevFastModeEnabled: 1 }), false, 'the number 1'],
      [() => Promise.resolve(undefined), false, 'an undefined storage answer'],
      [() => Promise.reject(new Error('storage down')), false, 'a storage rejection'],
      [() => { throw new Error('storage sync throw'); }, false, 'a storage call that throws']
    ];
    for (const [answer, expected, label] of cases) {
      storageAnswer = answer;
      calls.length = 0;
      let out = 'unset';
      deps.readSwitch().then((v) => { out = v; }, () => { out = 'rejected'; });
      await settle();
      check(out === expected, 'readSwitch resolves ' + expected + ' for ' + label);
      check(calls.length === 1 && calls[0].api === 'storage.local.get' && calls[0].keys === json(['fsbJevFastModeEnabled']),
        'readSwitch reads only fsbJevFastModeEnabled (' + label + ')');
    }
    storageAnswer = () => new Promise(() => {});
    let hung = 'unset';
    deps.readSwitch().then((v) => { hung = v; });
    await settle();
    check(hung === 'unset', 'a hanging storage read waits for its deadline');
    timers.fireAll();
    await settle();
    check(hung === false, 'a hanging storage read resolves false at its deadline');
  }

  // -------------------------------------------------------------------------
  section('fsbCreateFastPathDeps: menu, snapshot and tab url (content messages, frame 0)');
  {
    const timers = makeTimers();
    let sendAnswer = () => Promise.resolve({ success: true, signature: 's1' });
    let tabAnswer = () => Promise.resolve({ id: 7, url: 'https://shop.example/cart?x=1' });
    const { chrome, calls } = makeChrome({
      sendMessage: (tabId, message, options) => sendAnswer(tabId, message, options),
      tabsGet: (tabId) => tabAnswer(tabId)
    });
    const ctx = makeContext({ chrome, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
    const deps = ctx.fsbCreateFastPathDeps();

    const menuOptions = { cap: 48, recent: [], capture: false };
    let out = 'unset';
    deps.requestMenu(7, menuOptions, 1500).then((v) => { out = v; });
    await settle();
    check(calls.length === 1 && calls[0].api === 'tabs.sendMessage' && calls[0].tabId === 7,
      'requestMenu sends one content message to the tab');
    check(calls[0].message === json({ action: 'getJevMenu', options: menuOptions }),
      'requestMenu sends {action:"getJevMenu", options}');
    check(calls[0].options === json({ frameId: 0 }), 'requestMenu targets frame 0');
    check(out && out.success === true && out.signature === 's1', 'requestMenu resolves the content answer');
    check(timers.set.length === 1 && timers.set[0].ms === 1500 && timers.pendingCount() === 0,
      'requestMenu arms the given deadline and clears it on success');

    sendAnswer = () => Promise.reject(new Error('Could not establish connection'));
    out = 'unset';
    deps.requestMenu(7, menuOptions, 1500).then((v) => { out = v; });
    await settle();
    check(out === null, 'requestMenu resolves null when the content script is absent (rejection)');

    sendAnswer = () => { throw new Error('tabs api gone'); };
    out = 'unset';
    deps.requestMenu(7, menuOptions, 1500).then((v) => { out = v; }, () => { out = 'rejected'; });
    await settle();
    check(out === null, 'requestMenu resolves null when sendMessage throws');

    sendAnswer = () => new Promise(() => {});
    out = 'unset';
    deps.requestMenu(7, menuOptions, 1500).then((v) => { out = v; });
    await settle();
    check(out === 'unset', 'a silent content script keeps requestMenu pending until its deadline');
    timers.fireAll();
    await settle();
    check(out === null, 'requestMenu resolves null after the deadline');

    calls.length = 0;
    timers.set.length = 0;
    sendAnswer = () => Promise.resolve({ success: true, markdownSnapshot: 'SNAP', elementCount: 3 });
    out = 'unset';
    deps.requestSnapshot(9, 3000).then((v) => { out = v; });
    await settle();
    check(calls.length === 1 && calls[0].tabId === 9
      && calls[0].message === json({ action: 'getMarkdownSnapshot', options: { charBudget: 12000, maxElements: 80 } })
      && calls[0].options === json({ frameId: 0 }),
    'requestSnapshot sends {action:"getMarkdownSnapshot", options:{charBudget:12000, maxElements:80}} to frame 0');
    check(out && out.success === true && out.markdownSnapshot === 'SNAP', 'requestSnapshot resolves the content answer');
    check(timers.set.length === 1 && timers.set[0].ms === 3000 && timers.pendingCount() === 0,
      'requestSnapshot arms the given deadline and clears it on success');
    sendAnswer = () => Promise.reject(new Error('gone'));
    out = 'unset';
    deps.requestSnapshot(9, 3000).then((v) => { out = v; });
    await settle();
    check(out === null, 'requestSnapshot resolves null on rejection');
    sendAnswer = () => new Promise(() => {});
    out = 'unset';
    deps.requestSnapshot(9, 3000).then((v) => { out = v; });
    await settle();
    timers.fireAll();
    await settle();
    check(out === null, 'requestSnapshot resolves null after the deadline');

    calls.length = 0;
    out = 'unset';
    deps.getTabUrl(7).then((v) => { out = v; });
    await settle();
    check(out === 'https://shop.example/cart?x=1' && calls.length === 1 && calls[0].api === 'tabs.get' && calls[0].tabId === 7,
      'getTabUrl resolves the tab url through chrome.tabs.get');
    tabAnswer = () => Promise.resolve({ id: 7 });
    out = 'unset';
    deps.getTabUrl(7).then((v) => { out = v; });
    await settle();
    check(out === null, 'getTabUrl resolves null for a tab without a url');
    tabAnswer = () => Promise.reject(new Error('No tab with id'));
    out = 'unset';
    deps.getTabUrl(7).then((v) => { out = v; }, () => { out = 'rejected'; });
    await settle();
    check(out === null, 'getTabUrl resolves null when the tab is gone');
  }

  // -------------------------------------------------------------------------
  section('fsbRecomputeFastModeForFollowUp: flush first, then read, then assign or delete (D-10, F8)');
  {
    function makeRecomputeContext(opts) {
      const order = [];
      const reads = [];
      const flushCalls = [];
      const globals = {
        getStorageWithTimeout(keys, timeout, defaults) {
          order.push('read');
          reads.push(json([keys, timeout, defaults]));
          return Promise.resolve({ fsbJevFastModeEnabled: opts.stored });
        }
      };
      if (opts.fastPath !== 'absent') {
        globals.FsbFastPath = {
          flushHandoff(session) {
            order.push('flush');
            flushCalls.push(session);
            if (opts.fastPath === 'throws') throw new Error('flush threw');
            if (opts.fastPath === 'rejects') return Promise.reject(new Error('flush rejected'));
            return Promise.resolve(true);
          }
        };
      }
      return { ctx: makeContext(globals), order, reads, flushCalls };
    }

    {
      const r = makeRecomputeContext({ stored: true });
      const session = { status: 'idle', tabId: 3 };
      let resolved = false;
      await r.ctx.fsbRecomputeFastModeForFollowUp(session, undefined).then(() => { resolved = true; });
      check(resolved, 'the helper resolves');
      check(r.reads.length === 1 && r.reads[0] === json([['fsbJevFastModeEnabled'], 3000, { fsbJevFastModeEnabled: false }]),
        'exactly one storage read of ["fsbJevFastModeEnabled"] with a 3000 ms timeout and a false default');
      check(r.flushCalls.length === 0, 'a session that never had fast mode makes no flushHandoff call');
      check(json(session.fastMode) === json({ enabled: true, stored: true, source: null }),
        'stored true sets fastMode to the session-field value');
    }
    {
      const r = makeRecomputeContext({ stored: true });
      const session = { status: 'idle' };
      await r.ctx.fsbRecomputeFastModeForFollowUp(session, 'mcp');
      // run_task sends no conversationId, so it never reaches the follow-up
      // branch; the shared helper still gives the same field as a start.
      check(json(session.fastMode) === json(RUN_TASK_FIELD),
        'a follow-up with source "mcp" gets the same run_task field as a start (Phase 70 D-04)');
    }
    for (const stored of [false, undefined, 'true']) {
      const r = makeRecomputeContext({ stored });
      const session = { status: 'idle', fastMode: { enabled: true, stored: true, source: null } };
      await r.ctx.fsbRecomputeFastModeForFollowUp(session, undefined);
      check(!Object.prototype.hasOwnProperty.call(session, 'fastMode'),
        'stored ' + json(stored) + ' deletes fastMode (the field is absent, not false)');
    }
    {
      const r = makeRecomputeContext({ stored: false });
      const session = {
        status: 'idle',
        fastMode: { enabled: true, stored: true, source: null },
        _fastPath: { pendingSteps: [{ op: 'click', role: 'button', label: 'Next', effect: 'progress' }] }
      };
      await r.ctx.fsbRecomputeFastModeForFollowUp(session, undefined);
      check(r.flushCalls.length === 1 && r.flushCalls[0] === session, 'a session with _fastPath gets one flushHandoff call with that session');
      check(json(r.order) === json(['flush', 'read']), 'flushHandoff runs before the storage read');
      check(!Object.prototype.hasOwnProperty.call(session, 'fastMode'), 'fastMode is deleted only afterwards');
    }
    for (const mode of ['rejects', 'throws', 'absent']) {
      const r = makeRecomputeContext({ stored: true, fastPath: mode });
      const session = { status: 'idle', _fastPath: { pendingSteps: [{ op: 'click', role: 'button', label: 'Next', effect: 'progress' }] } };
      let outcome = 'unset';
      await r.ctx.fsbRecomputeFastModeForFollowUp(session, 'dashboard').then(() => { outcome = 'resolved'; }, () => { outcome = 'rejected'; });
      check(outcome === 'resolved' && json(session.fastMode) === json({ enabled: true, stored: true, source: 'dashboard' }),
        'a flushHandoff that ' + (mode === 'absent' ? 'is missing (no FsbFastPath)' : mode) + ' still recomputes the field and resolves');
    }
  }

  // -------------------------------------------------------------------------
  section('a switch-off follow-up still delivers the previous command\'s fast step (D-10, end to end)');
  {
    const snapshotCalls = [];
    const fakeDeps = {
      now: () => 1000,
      readSwitch: () => Promise.resolve(false),
      requestMenu: () => Promise.resolve(null),
      requestSnapshot(tabId, deadlineMs) {
        snapshotCalls.push({ tabId, deadlineMs });
        return Promise.resolve({ success: true, markdownSnapshot: 'SNAP' });
      },
      getTabUrl: () => Promise.resolve(null)
    };
    const ctx = makeContext({
      getStorageWithTimeout: () => Promise.resolve({ fsbJevFastModeEnabled: false }),
      fsbFastPathDeps: fakeDeps
    });
    vm.runInContext(fs.readFileSync(STATE_PATH, 'utf8'), ctx, { filename: 'jev-state.js' });
    vm.runInContext(fs.readFileSync(FAST_PATH_PATH, 'utf8'), ctx, { filename: 'jev-fast-path.js' });
    check(ctx.FsbFastPath && typeof ctx.FsbFastPath.flushHandoff === 'function', 'the real fast-path module is loaded in the context');

    const session = {
      status: 'idle',
      tabId: 11,
      commandCount: 1,
      task: 'Finish the wizard',
      messages: [{ role: 'user', content: 'Finish the wizard' }],
      fastMode: { enabled: true, stored: true, source: null },
      _fastPath: {
        off: false,
        offReason: null,
        offCommand: null,
        inFlight: null,
        pendingSteps: [{ op: 'click', role: 'button', label: 'Next', effect: 'progress' }],
        stopReason: null,
        uncertain: false,
        recent: [],
        refEpoch: 0,
        docEpoch: 0
      }
    };
    await ctx.fsbRecomputeFastModeForFollowUp(session, undefined);
    const added = session.messages.slice(1);
    check(added.length === 1 && added[0].role === 'user', 'exactly one role:"user" message is pushed');
    check(added.length === 1 && typeof added[0].content === 'string' && added[0].content.indexOf('FAST MODE HAND-OFF') === 0,
      'it starts with "FAST MODE HAND-OFF"');
    check(added.length === 1 && added[0].content.indexOf('SNAP') !== -1, 'it carries the fresh snapshot');
    check(added.length === 1 && /Next/.test(added[0].content), 'it names the step that ran');
    check(snapshotCalls.length === 1 && snapshotCalls[0].tabId === 11, 'one snapshot request for the session tab');
    check(Array.isArray(session._fastPath.pendingSteps) && session._fastPath.pendingSteps.length === 0, 'pendingSteps is empty afterwards');
    check(!Object.prototype.hasOwnProperty.call(session, 'fastMode'), 'fastMode is deleted (the switch is off)');

    await ctx.fsbRecomputeFastModeForFollowUp(session, undefined);
    check(session.messages.length === 2, 'a second follow-up pushes nothing');
    check(snapshotCalls.length === 1, 'a second follow-up makes no snapshot request');
  }

  // -------------------------------------------------------------------------
  section('source: load line, start path, follow-up path, stop path, createSessionHooks');
  {
    const policyIdx = bgLines.indexOf("importScripts('ai/jev-policy.js');");
    check(countOf(bgSource, "importScripts('ai/jev-fast-path.js');") === 1, 'one load line for ai/jev-fast-path.js');
    check(policyIdx >= 0 && bgLines[policyIdx + 1] === "importScripts('ai/jev-fast-path.js');",
      'the fast-path load line is the line right after the jev-policy load line');
    check(countOf(bgSource, 'globalThis.fsbFastPathDeps = fsbCreateFastPathDeps();') === 1,
      'globalThis.fsbFastPathDeps is created once at the top level');

    const start = sliceFunction(bgSource, 'handleStartAutomation');
    check(typeof start === 'string' && start.length > 0, 'handleStartAutomation found');
    const readAt = start.indexOf('const storedSettings = await getStorageWithTimeout(');
    const readCall = readAt >= 0 ? start.slice(readAt, start.indexOf(');', readAt) + 2) : '';
    const readArgs = readCall.split('\n');
    check(readArgs.length >= 3 && /^\s*\[.*'fsbJevFastModeEnabled'.*\],$/.test(readArgs[1]),
      'the start settings read asks for fsbJevFastModeEnabled');
    check(readArgs.length >= 4 && /fsbJevFastModeEnabled: false/.test(readArgs[3]),
      'its defaults object holds fsbJevFastModeEnabled: false');
    const fieldLine = 'const fastModeField = fsbFastModeSessionField(storedSettings.fsbJevFastModeEnabled, source);';
    const fieldAt = start.indexOf(fieldLine);
    const literalAt = start.indexOf('const sessionData = {');
    check(countOf(start, fieldLine) === 1 && fieldAt > readAt && fieldAt < literalAt,
      'fastModeField is computed once, after the settings read and before the sessionData literal');
    const spreadLine = '...(fastModeField ? { fastMode: fastModeField } : {}),';
    const agentSpread = '...(requestAgentId ? { agentId: requestAgentId } : {}),';
    const spreadAt = start.indexOf(spreadLine);
    const agentAt = start.indexOf(agentSpread);
    check(countOf(start, spreadLine) === 1 && spreadAt > literalAt && agentAt > literalAt
      && start.slice(agentAt + agentSpread.length, spreadAt).trim() === '',
    'the sessionData literal spreads fastMode right after the agentId spread');
    const agentReturn = start.indexOf("if (authoritativeProvider.providerKind === 'agent') {");
    check(agentReturn >= 0 && agentReturn < start.indexOf('fsbFastModeSessionField(')
      && agentReturn < start.indexOf('fsbRecomputeFastModeForFollowUp('),
    'the agent-kind early return stays first (D-03)');

    const followAt = start.indexOf("if (existingSession && existingSession.status === 'idle') {");
    const resetAt = start.indexOf("action: 'resetDOMState'", followAt);
    const hooksAt = start.indexOf('const reactivationHooks = createSessionHooks(sessionId);', followAt);
    const recomputeLine = 'await fsbRecomputeFastModeForFollowUp(existingSession, source);';
    const recomputeAt = start.indexOf(recomputeLine);
    check(countOf(bgSource, recomputeLine) === 1, 'exactly one follow-up recompute call in background.js');
    check(followAt >= 0 && resetAt > followAt && recomputeAt > resetAt && recomputeAt < hooksAt,
      'the recompute runs after the resetDOMState message and before createSessionHooks');
    const between = start.slice(recomputeAt + recomputeLine.length, hooksAt);
    check(between.trim() === '', 'it is the statement right before const reactivationHooks');
    const followBranch = start.slice(followAt, hooksAt);
    check(followBranch.indexOf('fsbJevFastModeEnabled') === -1 && followBranch.indexOf('getStorageWithTimeout') === -1,
      'the follow-up branch itself reads no storage (the helper is the only reader)');
    const helper = sliceFunction(bgSource, 'fsbRecomputeFastModeForFollowUp');
    check(countOf(helper, 'getStorageWithTimeout(') === 1 && countOf(helper, 'fsbJevFastModeEnabled') >= 1,
      'the helper makes the one storage read of the switch');
    check(helper.indexOf('flushHandoff(') !== -1 && helper.indexOf('flushHandoff(') < helper.indexOf('getStorageWithTimeout('),
      'the helper flushes before it reads');
    check(!/chrome\.storage\.local\.set|\.set\(/.test(helper), 'the helper writes no storage');

    const stop = sliceFunction(bgSource, 'handleStopAutomation');
    const guard = "if (session._fastPath && typeof globalThis !== 'undefined' && globalThis.FsbFastPath && typeof globalThis.FsbFastPath.abortInFlight === 'function') {";
    const foundAt = stop.indexOf("automationLogger.debug('Found session to stop'");
    const guardAt = stop.indexOf(guard);
    check(countOf(stop, 'abortInFlight(') === 1 + countOf(guard, 'abortInFlight('), 'handleStopAutomation calls abortInFlight once');
    check(guardAt > foundAt && foundAt >= 0
      && stop.slice(stop.indexOf('\n', foundAt), guardAt).trim() === '',
    'the guarded abort sits right after the "Found session to stop" debug line');
    const callAt = stop.indexOf('globalThis.FsbFastPath.abortInFlight(session);');
    check(callAt > guardAt && stop.slice(guardAt, callAt).indexOf('}') === -1,
      'abortInFlight(session) runs only inside the session._fastPath guard');
    check(countOf(bgSource, 'FsbFastPath.abortInFlight(session)') === 1, 'no other abortInFlight call in background.js');

    const hooks = sliceFunction(bgSource, 'createSessionHooks', { exact: true });
    const hash = crypto.createHash('sha256').update(hooks || '', 'utf8').digest('hex');
    check(hash === CREATE_SESSION_HOOKS_SHA256, 'createSessionHooks is byte-identical to P68_START (' + hash.slice(0, 12) + ')');

    // Phase 70 (D-04): the helper is the only change on the start path.
    check(countOf(start, 'fsbJevFastModeEnabled') === 3,
      'Phase 70: handleStartAutomation names fsbJevFastModeEnabled only in the per-start settings read (keys, defaults, field line: 3, unchanged)');
    const recompute = sliceFunction(bgSource, 'fsbRecomputeFastModeForFollowUp');
    const recomputeHash = crypto.createHash('sha256').update(recompute || '', 'utf8').digest('hex');
    check(recomputeHash === RECOMPUTE_FOLLOW_UP_SHA256, 'Phase 70: fsbRecomputeFastModeForFollowUp is byte-identical to P70_START (' + recomputeHash.slice(0, 12) + ')');
    const fieldHelper = sliceFunction(bgSource, 'fsbFastModeSessionField');
    check(countOf(bgSource, 'budgetProfile') === 1 && countOf(fieldHelper, 'budgetProfile') === 1,
      'Phase 70: budgetProfile appears once in background.js, inside fsbFastModeSessionField (no other reader, no storage key)');
    check(!/budgetProfile/.test(bgSource.replace(fieldHelper, '')) && countOf(bgSource, "chrome.storage.local.get(['fsbJevFastModeEnabled'])") === 1,
      'Phase 70: no new stored value: the switch is the only fast-mode key the deps read');
  }

  await captureSections();
  await runEvidenceSections();

  console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
  process.exitCode = failed === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Plan 68-08 Task 1: the service-worker side of recorded-llm capture (D-22).
//
//   - fsbCreateFastPathDeps gains readCaptureArm, appendCaptureRecord and
//     noteCaptureDrop; ring writes go through fsbFastPathCaptureWrite's one
//     promise chain into {v:1, records:[...], drops:{}} (newest 200 records);
//   - case 'jevCaptureObservation' forwards a new {generation, handle,
//     resolved, tool} object from an exact five-key main-frame message to the
//     sessions on that tab;
//   - capture end to end: the real content observation (dom-analysis.js),
//     the real background case and the real module label one record.
// ---------------------------------------------------------------------------

const DOM_STATE_PATH = path.join(ROOT, 'extension', 'content', 'dom-state.js');
const ACCESSIBILITY_PATH = path.join(ROOT, 'extension', 'content', 'accessibility.js');
const DOM_ANALYSIS_PATH = path.join(ROOT, 'extension', 'content', 'dom-analysis.js');
const TOOL_DEFINITIONS_PATH = path.join(ROOT, 'extension', 'ai', 'tool-definitions.js');
const CONFIG_PATH = path.join(ROOT, 'extension', 'config', 'config.js');
const CAPTURE_FIXTURE_URL = 'http://127.0.0.1:53211/r/Ab3dEf9hIj2kLm5nOp8qRs/fixtures/checklist/index.html';
const CASE_LABEL = "case 'jevCaptureObservation': {";
const POLICY_PATH = path.join(ROOT, 'extension', 'ai', 'jev-policy.js');
const gateway = require('./fixtures/jev-fake-gateway.js');

/** An in-memory chrome.storage.local whose get and set settle on a later macrotask (so unserialized writes would race). */
function makeStore(initial, opts) {
  const o = opts || {};
  const data = JSON.parse(JSON.stringify(initial || {}));
  const calls = [];
  const later = (fn) => new Promise((resolve, reject) => setImmediate(() => {
    try { resolve(fn()); } catch (e) { reject(e); }
  }));
  const local = {
    get(keys) {
      calls.push({ api: 'get', keys: json(keys) });
      if (o.get) return o.get(keys);
      return later(() => {
        const out = {};
        for (const k of [].concat(keys)) if (Object.prototype.hasOwnProperty.call(data, k)) out[k] = JSON.parse(JSON.stringify(data[k]));
        return out;
      });
    },
    set(items) {
      calls.push({ api: 'set', keys: json(Object.keys(items)) });
      return later(() => { Object.assign(data, JSON.parse(JSON.stringify(items))); });
    }
  };
  return { local, data, calls };
}

async function settleUntil(predicate, max) {
  for (let i = 0; i < (max || 3000) && !predicate(); i += 1) await flush();
  return predicate();
}

/** The braced case body for 'jevCaptureObservation', from its label through its closing brace. */
function sliceCaptureCase(source) {
  const start = source.indexOf(CASE_LABEL);
  if (start < 0) return null;
  let j = start + CASE_LABEL.length - 1;
  for (let depth = 0; j < source.length; j += 1) {
    if (source[j] === '{') depth += 1;
    else if (source[j] === '}' && --depth === 0) break;
  }
  return source.slice(start, j + 1);
}

/** The case compiled in a vm context as fn(request, sender, sendResponse) inside its own switch. */
function compileCaptureCase(ctx) {
  const body = sliceCaptureCase(bgSource);
  if (!body) throw new Error('case jevCaptureObservation not found in background.js');
  return vm.runInContext('(function runCaptureCase(request, sender, sendResponse) {\n  switch (request.action) {\n'
    + body + '\n  }\n})', ctx, { filename: 'background.js#jevCaptureObservation' });
}

function quietLogger() {
  const noop = () => {};
  return { log: noop, info: noop, warn: noop, error: noop, debug: noop, logDOMOperation: noop };
}

/** The real dom-analysis.js in a vm content context with the dom-state registry slice and the stub kit. */
function makeContentContext() {
  const kit = require('./fixtures/jev-content-dom-kit.js');
  const domStateSource = fs.readFileSync(DOM_STATE_PATH, 'utf8');
  const sent = [];
  const win = kit.makeWindow({});
  const FSB = {
    _modules: {},
    logger: quietLogger(),
    stripUnicodeControl: (s) => s,
    getClassName: () => '',
    isFsbElement: () => false
  };
  win.FSB = FSB;
  win.__FSB_SKIP_INIT__ = false;
  const sandbox = {
    window: win,
    document: kit.makeDocument(kit.makeElement({ tag: 'body' })),
    console,
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    WeakRef,
    WeakSet,
    crypto: kit.cryptoStub([0x5a, 0x11, 0xc3, 0x07]),
    chrome: { runtime: { sendMessage(message) { sent.push(message); return Promise.resolve({ success: true }); } } }
  };
  vm.createContext(sandbox);
  const begin = domStateSource.indexOf('  class RefMap {');
  const endMarker = '  // ---- Phase 68 fast-mode registry (end) ----';
  const end = domStateSource.indexOf(endMarker);
  if (begin < 0 || end < begin) throw new Error('dom-state.js registry slice not found');
  const registry = vm.runInContext(domStateSource.slice(begin, end + endMarker.length)
    + '\n({ RefMap, refMap, JevRefRegistry, jevRefMap, vaultFilledElements, noteVaultFilled })', sandbox, { filename: 'dom-state.js#registry' });
  FSB.RefMap = registry.RefMap;
  FSB.refMap = registry.refMap;
  FSB.JevRefRegistry = registry.JevRefRegistry;
  FSB.jevRefMap = registry.jevRefMap;
  FSB.vaultFilledElements = registry.vaultFilledElements;
  FSB.noteVaultFilled = registry.noteVaultFilled;
  vm.runInContext(fs.readFileSync(ACCESSIBILITY_PATH, 'utf8'), sandbox, { filename: 'accessibility.js' });
  vm.runInContext(fs.readFileSync(DOM_ANALYSIS_PATH, 'utf8'), sandbox, { filename: 'dom-analysis.js' });
  return { FSB, sent, kit };
}

/**
 * The service-worker side of one capture run end to end: the real jev-state,
 * jev-policy and jev-fast-path modules and the background helpers over a stub
 * chrome whose getJevMenu answer drives the real content registry, plus the
 * fake uncalibrated gateway as the decide client. `fieldOf(sw)` builds the
 * session field with the real background helper.
 */
function buildEndToEnd(fieldOf, opts) {
  const o = opts || {};
  const content = makeContentContext();
  const F = content.FSB;
  const button = content.kit.makeElement({ tag: 'button', attrs: { id: 'save', type: 'button' }, text: 'Save' });
  F.querySelectorWithShadow = (selector) => (selector === '#save' ? button : null);

  const store = makeStore({ fsbJevFastModeEnabled: true, fsbJevCaptureArmed: true });
  const menuRequests = [];
  const swChrome = {
    storage: { local: store.local },
    tabs: {
      get: (tabId) => Promise.resolve({ id: tabId, url: CAPTURE_FIXTURE_URL }),
      sendMessage(tabId, message, options) {
        menuRequests.push({ tabId, message: JSON.parse(JSON.stringify(message)), options });
        if (message.action !== 'getJevMenu') return Promise.resolve(null);
        // What the real getJevMenu case does: rebuild the registry, arm on capture:true, answer the menu.
        F.jevRefMap.reset();
        const handle = F.jevRefMap.register(button, 'button', 'Save');
        F._jevCaptureArm = message.options && message.options.capture === true ? { generation: F.jevRefMap.generation } : null;
        return Promise.resolve({
          success: true,
          generation: F.jevRefMap.generation,
          url: CAPTURE_FIXTURE_URL,
          title: 'Checklist',
          visibleText: 'Checklist Save',
          moreBelow: false,
          signature: 'sig-' + F.jevRefMap.generation,
          count: 1,
          truncated: false,
          entries: [{
            handle, role: 'button', label: 'Save', ops: ['click', 'hover'], inputType: null, autocomplete: null,
            purpose: { sensitive: false, danger: false, intent: null }, hidden: false, risk: null, fastEligible: true,
            vaultFilled: false, state: { checked: null, expanded: null, selected: null, pressed: null }, inViewport: true
          }],
          recentHandles: (message.options && Array.isArray(message.options.recent) ? message.options.recent : []).map(() => null)
        });
      }
    }
  };
  const activeSessions = new Map();
  // TextEncoder is a service-worker global buildRequest needs once the fast
  // attempt runs (the request byte budget).
  const sw = makeContext({
    chrome: swChrome,
    setTimeout,
    clearTimeout,
    URL,
    AbortController,
    TextEncoder,
    activeSessions,
    TOOL_REGISTRY: require(TOOL_DEFINITIONS_PATH).TOOL_REGISTRY
  });
  vm.runInContext(fs.readFileSync(STATE_PATH, 'utf8'), sw, { filename: 'jev-state.js' });
  vm.runInContext(fs.readFileSync(POLICY_PATH, 'utf8'), sw, { filename: 'jev-policy.js' });
  vm.runInContext(fs.readFileSync(FAST_PATH_PATH, 'utf8'), sw, { filename: 'jev-fast-path.js' });
  sw.fsbFastPathDeps = sw.fsbCreateFastPathDeps();
  if (o.fixedNow) sw.fsbFastPathDeps.now = () => o.fixedNow;
  const decides = [];
  sw.fsbFastPathDeps.jevClient = gateway.makeClient((request) => {
    decides.push(request);
    return { body: gateway.uncalibratedBody(request) };
  }, o.fixedNow ? { now: () => o.fixedNow } : undefined);
  const runCase = compileCaptureCase(sw);

  const session = {
    sessionId: 's-e2e',
    status: 'running',
    tabId: 7,
    commandCount: 1,
    task: 'Open the checklist and press Save.',
    messages: [],
    fastMode: fieldOf(sw),
    agentState: { iterationCount: 0 }
  };
  activeSessions.set(session.sessionId, session);
  return { content, F, button, store, menuRequests, sw, runCase, session, decides };
}

/**
 * Three iterations of one command end to end, with a fixed clock: the LLM's
 * first turn (it clicks Save, observed), then two more LLM-path iterations
 * after observeTools. Returns everything the session left behind.
 */
async function endToEndTrace(fieldOf) {
  const e = buildEndToEnd(fieldOf, { fixedNow: 1789639200000 });
  const declines = [];
  for (let iteration = 1; iteration <= 3; iteration += 1) {
    const out = await e.sw.FsbFastPath.beforeTurn(e.session, { sessionId: e.session.sessionId, iteration });
    declines.push(out && out.toolCall ? 'act' : out.decline);
    e.content.sent.length = 0;
    e.F.noteJevCaptureObservation('click', { selector: '#save' });
    for (const message of e.content.sent) e.runCase(message, { tab: { id: 7 }, frameId: 0 }, () => {});
    e.sw.FsbFastPath.observeTools(e.session, [{ id: 'c' + iteration, name: 'click', args: { selector: 'e1' } }],
      [{ callId: 'c' + iteration, name: 'click', result: { success: true, hadEffect: true, navigationTriggered: false, result: { success: true } } }]);
  }
  await settleUntil(() => e.store.data.fsbJevCaptureRing && e.store.data.fsbJevCaptureRing.records.length === 2);
  const state = e.session._fastPath || {};
  return JSON.parse(JSON.stringify({
    field: e.session.fastMode,
    declines,
    ring: e.store.data.fsbJevCaptureRing || null,
    menuRequests: e.menuRequests,
    decides: e.decides.length,
    decideRequests: e.decides,
    storeCalls: e.store.calls,
    off: state.off,
    offReason: state.offReason,
    pending: state.capturePending || null,
    measurement: e.session.jevMeasurement || null,
    messages: e.session.messages
  }));
}

async function captureSections() {
  // -------------------------------------------------------------------------
  section('fsbCreateFastPathDeps: the capture arm reader (D-22)');
  {
    const timers = makeTimers();
    let storageAnswer = () => Promise.resolve({ fsbJevCaptureArmed: true });
    const { chrome, calls } = makeChrome({ storageGet: (keys) => storageAnswer(keys) });
    const ctx = makeContext({ chrome, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
    const deps = ctx.fsbCreateFastPathDeps();
    check(calls.length === 0 && timers.set.length === 0, 'creating the deps with the capture members still calls nothing');
    const cases = [
      [() => Promise.resolve({ fsbJevCaptureArmed: true }), true, 'a stored boolean true'],
      [() => Promise.resolve({ fsbJevCaptureArmed: false }), false, 'a stored false'],
      [() => Promise.resolve({}), false, 'an absent key'],
      [() => Promise.resolve({ fsbJevCaptureArmed: 'true' }), false, 'the string "true"'],
      [() => Promise.reject(new Error('storage down')), false, 'a storage rejection'],
      [() => { throw new Error('storage sync throw'); }, false, 'a storage call that throws']
    ];
    for (const [answer, expected, label] of cases) {
      storageAnswer = answer;
      calls.length = 0;
      let out = 'unset';
      deps.readCaptureArm().then((v) => { out = v; }, () => { out = 'rejected'; });
      await settle();
      check(out === expected, 'readCaptureArm resolves ' + expected + ' for ' + label);
      check(calls.length === 1 && calls[0].keys === json(['fsbJevCaptureArmed']), 'readCaptureArm reads only fsbJevCaptureArmed (' + label + ')');
    }
    storageAnswer = () => new Promise(() => {});
    let hung = 'unset';
    deps.readCaptureArm().then((v) => { hung = v; });
    await settle();
    timers.fireAll();
    await settle();
    check(hung === false, 'a hanging arm read resolves false at its deadline');
  }

  // -------------------------------------------------------------------------
  section('fsbCreateFastPathDeps: the capture ring (bounded, serialized, local)');
  {
    const timers = makeTimers();
    const store = makeStore({});
    const ctx = makeContext({ chrome: { storage: { local: store.local } }, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
    const deps = ctx.fsbCreateFastPathDeps();
    const writes = [];
    for (let i = 0; i < 30; i += 1) writes.push(deps.appendCaptureRecord({ v: 1, n: i }));
    for (let i = 0; i < 10; i += 1) writes.push(deps.noteCaptureDrop(i % 2 === 0 ? 'target_unknown' : 'stale_command'));
    let settled = 0;
    let rejected = 0;
    writes.forEach((w) => w.then(() => { settled += 1; }, () => { rejected += 1; }));
    check(await settleUntil(() => settled === 40), 'forty concurrent ring writes all resolve');
    const ring = store.data.fsbJevCaptureRing;
    check(rejected === 0 && ring && ring.v === 1 && Array.isArray(ring.records) && ring.records.length === 30
      && ring.records.every((r, i) => r.n === i), 'concurrent writes are serialized: 30 records in order, none lost');
    check(ring && json(ring.drops) === json({ target_unknown: 5, stale_command: 5 }), 'drops are counted by reason ({target_unknown:5, stale_command:5})');
    check(store.calls.filter((c) => c.api === 'set').every((c) => c.keys === json(['fsbJevCaptureRing']))
      && store.calls.filter((c) => c.api === 'get').every((c) => c.keys === json(['fsbJevCaptureRing'])),
    'the ring writer reads and writes only fsbJevCaptureRing');
    check(timers.pendingCount() === 0, 'every ring read and write deadline is cleared');

    const full = makeStore({ fsbJevCaptureRing: { v: 1, records: Array.from({ length: 199 }, (_, n) => ({ n })), drops: { menu_invalid: 2 } } });
    const fullCtx = makeContext({ chrome: { storage: { local: full.local } }, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
    const fullDeps = fullCtx.fsbCreateFastPathDeps();
    let done = 0;
    for (const n of [199, 200, 201]) fullDeps.appendCaptureRecord({ n }).then(() => { done += 1; });
    await settleUntil(() => done === 3);
    const capped = full.data.fsbJevCaptureRing;
    check(capped.records.length === 200 && capped.records[0].n === 2 && capped.records[199].n === 201 && capped.drops.menu_invalid === 2,
      'the ring keeps the newest 200 records (oldest dropped) and keeps its drop counts');

    const odd = makeStore({ fsbJevCaptureRing: { v: 2, records: 'x' } });
    const oddDeps = makeContext({ chrome: { storage: { local: odd.local } }, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout }).fsbCreateFastPathDeps();
    let oddDone = false;
    oddDeps.noteCaptureDrop('__proto__').then(() => { oddDone = true; });
    await settleUntil(() => oddDone);
    check(json(odd.data.fsbJevCaptureRing) === json({ v: 1, records: [], drops: { other: 1 } }),
      'a malformed ring is replaced, and a reason outside the code pattern counts as "other"');

    const failing = makeStore({ fsbJevCaptureRing: { v: 1, records: [{ n: 'kept' }], drops: {} } }, { get: () => Promise.reject(new Error('storage down')) });
    const failingDeps = makeContext({ chrome: { storage: { local: failing.local } }, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout }).fsbCreateFastPathDeps();
    let outcome = 'unset';
    failingDeps.appendCaptureRecord({ n: 'new' }).then(() => { outcome = 'resolved'; }, () => { outcome = 'rejected'; });
    await settle();
    check(outcome === 'resolved' && json(failing.data.fsbJevCaptureRing.records) === json([{ n: 'kept' }]) && !failing.calls.some((c) => c.api === 'set'),
      'a failed ring read skips the write (the ring is never overwritten) and the writer still resolves');
    const after = [];
    failingDeps.noteCaptureDrop('target_unknown').then(() => after.push('next'));
    await settle();
    check(after.length === 1, 'a failed write never blocks the chain for later writes');

    // IN-02: a write slower than any deadline is awaited in full, so the next
    // change reads its result instead of racing it.
    const slow = makeStore({});
    let release = null;
    let slowSets = 0;
    const slowLocal = {
      get: slow.local.get,
      set(items) {
        slowSets += 1;
        if (slowSets > 1) return slow.local.set(items);
        return new Promise((resolve) => {
          release = () => { Object.assign(slow.data, JSON.parse(JSON.stringify(items))); resolve(); };
        });
      }
    };
    const slowDeps = makeContext({ chrome: { storage: { local: slowLocal } }, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout })
      .fsbCreateFastPathDeps();
    let slowDone = 0;
    slowDeps.appendCaptureRecord({ n: 'a' }).then(() => { slowDone += 1; });
    slowDeps.appendCaptureRecord({ n: 'b' }).then(() => { slowDone += 1; });
    await settleUntil(() => release !== null);
    timers.fireAll();
    await settle();
    const doneWhileHeld = slowDone;
    const setsWhileHeld = slowSets;
    release();
    await settleUntil(() => slowDone === 2);
    check(doneWhileHeld === 0 && setsWhileHeld === 1 && slowDone === 2
      && json(slow.data.fsbJevCaptureRing.records) === json([{ n: 'a' }, { n: 'b' }]),
    'a ring write slower than the deadline is awaited, so the next write waits for it and nothing is lost or reordered');
  }

  // -------------------------------------------------------------------------
  section('case jevCaptureObservation: exact five-key main-frame messages only');
  {
    const body = sliceCaptureCase(bgSource);
    check(countOf(bgSource, "case 'jevCaptureObservation'") === 1 && typeof body === 'string', 'background.js has exactly one jevCaptureObservation case, and it is braced');
    const nextCase = bgSource.indexOf("case 'contentScriptReady':");
    check(body !== null && bgSource.indexOf(body) + body.length < nextCase && bgSource.slice(bgSource.indexOf(body) + body.length, nextCase).trim() === '',
      'the case sits right before the contentScriptReady case');
    check(body !== null && countOf(body, 'noteCaptureObservation(captureSession, capturePayload)') === 1 && body.indexOf('noteCaptureObservation(captureSession, request') === -1,
      'the case forwards the rebuilt payload, never the incoming message');
    check(body !== null && !/importScripts/i.test(body) && !/jev/i.test(body.replace(/\bjevCaptureObservation\b/g, '')),
      'the case holds no other jev text and no importScripts word');

    const seen = [];
    const activeSessions = new Map([
      ['s1', { sessionId: 's1', tabId: 7, _fastPath: {} }],
      ['s2', { sessionId: 's2', tabId: 7 }],
      ['s3', { sessionId: 's3', tabId: 8, _fastPath: {} }],
      ['s4', { sessionId: 's4', tabId: 7, _fastPath: {} }]
    ]);
    const ctx = vm.createContext({
      activeSessions,
      FsbFastPath: {
        noteCaptureObservation(session, payload) {
          seen.push({ id: session.sessionId, payload });
          if (session.sessionId === 's1') throw new Error('observer failed');
          return true;
        }
      }
    });
    const run = compileCaptureCase(ctx);
    const message = { action: 'jevCaptureObservation', generation: 'cafe0001-3', handle: 'j2', resolved: true, tool: 'click' };
    const responses = [];
    const respond = (r) => responses.push(r);
    run(message, { tab: { id: 7 }, frameId: 0 }, respond);
    check(seen.length === 2 && seen[0].id === 's1' && seen[1].id === 's4',
      'a main-frame message reaches every session on that tab that has fast-path state, even after one observer throws');
    check(seen.length === 2 && json(Object.keys(seen[0].payload).sort()) === json(['generation', 'handle', 'resolved', 'tool'])
      && json(seen[0].payload) === json({ generation: 'cafe0001-3', handle: 'j2', resolved: true, tool: 'click' }) && seen[0].payload !== message,
    'the forwarded payload is a new object with exactly generation, handle, resolved and tool (action stripped)');
    check(responses.length === 1 && json(responses[0]) === json({ success: true }), 'the case responds {success:true}');

    const refused = [
      ['an iframe sender (frameId 2)', message, { tab: { id: 7 }, frameId: 2 }],
      ['a sender with no tab', message, { frameId: 0 }],
      ['a message with an extra key', Object.assign({ selector: '#save' }, message), { tab: { id: 7 }, frameId: 0 }],
      ['a message missing a key', { action: 'jevCaptureObservation', generation: 'cafe0001-3', handle: 'j2', resolved: true }, { tab: { id: 7 }, frameId: 0 }]
    ];
    for (const [name, msg, sender] of refused) {
      seen.length = 0;
      responses.length = 0;
      run(msg, sender, respond);
      check(seen.length === 0 && responses.length === 1 && responses[0].success === true, 'the case ignores ' + name + ' and still responds');
    }
    const bare = vm.createContext({ activeSessions });
    seen.length = 0;
    responses.length = 0;
    compileCaptureCase(bare)(message, { tab: { id: 7 }, frameId: 0 }, respond);
    check(seen.length === 0 && responses.length === 1, 'without the fast-path module the case only responds');
  }

  // -------------------------------------------------------------------------
  section('capture end to end: content observation -> background case -> module -> ring (Pitfall 10)');
  {
    // Phase 70 (D-05): the run_task session carries the real helper's field
    // for (true, 'mcp'), so its first iteration is the LLM's turn and its
    // second makes one fast attempt (the uncalibrated gateway latches it).
    const e = buildEndToEnd((sw) => sw.fsbFastModeSessionField(true, 'mcp'));
    const { content, F, store, menuRequests, sw, runCase, session, decides } = e;
    check(typeof F.noteJevCaptureObservation === 'function', 'the real FSB.noteJevCaptureObservation is loaded');
    check(json(session.fastMode) === json(RUN_TASK_FIELD), 'capture end to end: the run_task session carries the real helper field for (true, "mcp")');

    const first = await sw.FsbFastPath.beforeTurn(session, { sessionId: session.sessionId, iteration: 1 });
    const pending = session._fastPath && session._fastPath.capturePending;
    check(first.decline === 'first_llm_turn' && pending && pending.generation === F.jevRefMap.generation,
      'capture end to end: the run_task first iteration (the LLM\'s turn) holds a capture for the armed menu generation');
    check(menuRequests.length === 1 && menuRequests[0].message.options.capture === true && json(menuRequests[0].options) === json({ frameId: 0 }),
      'capture end to end: one getJevMenu with capture:true to frame 0');

    // The LLM clicks Save: the content script observes the target once.
    F.noteJevCaptureObservation('click', { selector: '#save' });
    check(content.sent.length === 1 && json(Object.keys(content.sent[0]).sort()) === json(['action', 'generation', 'handle', 'resolved', 'tool']),
      'capture end to end: the content script sends one five-key observation');
    const responses = [];
    runCase(content.sent[0], { tab: { id: 7 }, frameId: 0 }, (r) => responses.push(r));
    check(pending.observation && pending.observation.handle === 'j1' && pending.observation.resolved === true && pending.observation.tool === 'click',
      'capture end to end: the background case delivers the content message and the pending capture carries handle j1');
    sw.FsbFastPath.observeTools(session, [{ id: 'c1', name: 'click', args: { selector: 'e1' } }],
      [{ callId: 'c1', name: 'click', result: { success: true, hadEffect: true, navigationTriggered: false, result: { success: true } } }]);
    const secondTurn = await sw.FsbFastPath.beforeTurn(session, { sessionId: session.sessionId, iteration: 2 });
    check(await settleUntil(() => store.data.fsbJevCaptureRing && store.data.fsbJevCaptureRing.records.length === 1),
      'capture end to end: the next turn writes one ring record');
    check(secondTurn.decline === 'not_calibrated' && decides.length === 1 && menuRequests.length === 2 && menuRequests[1].message.options.capture === true,
      'capture end to end: the run_task second iteration makes its one fast attempt (one capture:true menu, one decide) and the uncalibrated answer latches it ('
      + json(secondTurn) + ')');
    const ring = store.data.fsbJevCaptureRing;
    const record = ring && ring.records[0];
    check(record && json(record.label) === json({ op: 'click', target: 'j1' }) && record.url === CAPTURE_FIXTURE_URL && record.iteration === 1,
      'capture end to end: the record is labelled {click, j1} on the fixture path');
    check(record && JSON.stringify(ring).indexOf(session.task) === -1, 'capture end to end: the ring holds no task text');

    // Iteration 2 holds its own capture: a tampered message or an iframe sender leaves it unlabelled.
    const second = session._fastPath.capturePending;
    content.sent.length = 0;
    F.noteJevCaptureObservation('click', { selector: '#save' });
    const exact = content.sent[0];
    runCase(Object.assign({}, exact, { label: 'Save' }), { tab: { id: 7 }, frameId: 0 }, () => {});
    runCase(exact, { tab: { id: 7 }, frameId: 2 }, () => {});
    check(second && second.generation === exact.generation && second.observation === null,
      'capture end to end: the same message with an extra key, or from frame 2, leaves the pending capture unlabelled');
    runCase(exact, { tab: { id: 7 }, frameId: 0 }, () => {});
    check(second && second.observation && second.observation.handle === 'j1', 'capture end to end: the exact message from frame 0 still labels it');
    check(menuRequests.every((m) => m.message.action === 'getJevMenu'), 'capture end to end: capture sent no request other than getJevMenu');
  }

  // -------------------------------------------------------------------------
  section('capture end to end: a switched-on run_task equals an autopilot session (Phase 70 D-05)');
  {
    const runTask = await endToEndTrace((sw) => sw.fsbFastModeSessionField(true, 'mcp'));
    const autopilot = await endToEndTrace((sw) => sw.fsbFastModeSessionField(true, undefined));
    check(json(runTask.field) === json(RUN_TASK_FIELD) && json(autopilot.field) === json({ enabled: true, stored: true, source: null }),
      'run_task capture equals autopilot: the two sessions carry the real helper fields for (true, "mcp") and (true, undefined)');
    check(runTask.ring.records.length === 2 && runTask.decides === 1 && json(runTask.declines) === json(['first_llm_turn', 'not_calibrated', 'not_calibrated']),
      'run_task capture equals autopilot: the run_task run captures two LLM turns and makes one decide (' + json(runTask.declines) + ')');
    const strip = (t) => Object.assign({}, t, { field: null });
    check(json(strip(runTask)) === json(strip(autopilot)),
      'run_task capture equals autopilot: the same capture records, menu requests, observations, decide requests and latches as the autopilot field');
  }

  // -------------------------------------------------------------------------
  section('the capture keys are internal storage keys, not settings (D-22)');
  {
    const { FsbSettingsSchema } = require(CONFIG_PATH);
    check(!FsbSettingsSchema.get('fsbJevCaptureArmed') && !FsbSettingsSchema.get('fsbJevCaptureRing')
      && FsbSettingsSchema.keys().every((k) => !/capture/i.test(k)),
    'fsbJevCaptureArmed and fsbJevCaptureRing are not FsbSettingsSchema keys');
    const fastPathSource = fs.readFileSync(FAST_PATH_PATH, 'utf8');
    check(fastPathSource.indexOf('fsbJevCapture') === -1, 'the module never names the storage keys (the deps own them)');
  }
}

// ---------------------------------------------------------------------------
// Plan 70-03 Task 2: fsbRegisterFastRunEvidence and its one call (D-14,
// T-70-02, T-70-04, T-70-07).
// ---------------------------------------------------------------------------

const REGISTER_LINE = 'if (sessionData.fastMode) fsbRegisterFastRunEvidence(sessionHooks, sessionData, tabInfo && tabInfo.url);';
const RUN_START_URL = 'https://shop.example/cart/view?coupon=P70-MARKER-VALUE#top';
// 70-SYNC-RECHECK item r: createSessionHooks at P70_START (equal to 68 item h).
const CREATE_SESSION_HOOKS_SHA256_P70 = '10ce1a544f31072f71121b8ee872a4ff6cdd8b07adb1c7a14171b50e4e940780';
const EVIDENCE_RECORD = Object.freeze({ v: 1, seq: 0, fastIteration: null, pending: null, lastUncertainSeq: 0,
  lastObservationSeq: 0, fastUnobservedSeq: 0, gates: [] });

/** A pipeline that records register calls and forwards them to a real HookPipeline. */
function recordingPipeline(HookPipeline, opts) {
  const o = opts || {};
  const real = new HookPipeline();
  const calls = [];
  return {
    real,
    calls,
    register(event, handler) {
      calls.push({ event, handler });
      if (typeof o.throwOn === 'number' && calls.length === o.throwOn) throw new Error('register failed');
      return real.register(event, handler);
    },
    count(event) {
      return (real._hooks[event] || []).length;
    }
  };
}

async function runEvidenceSections() {
  const { HookPipeline, LIFECYCLE_EVENTS } = require(path.join(ROOT, 'extension', 'ai', 'hook-pipeline.js'));
  const FastPath = require(FAST_PATH_PATH);
  const E = LIFECYCLE_EVENTS;

  // -------------------------------------------------------------------------
  section('fsbRegisterFastRunEvidence: three handlers on a fast-mode session only (Phase 70 D-14)');
  {
    const ctx = makeContext({ LIFECYCLE_EVENTS, FsbFastPath: FastPath });
    const register = ctx.fsbRegisterFastRunEvidence;
    check(typeof register === 'function', 'fsbRegisterFastRunEvidence evaluates as a function');

    const pipeline = recordingPipeline(HookPipeline);
    const session = { sessionId: 's-70-03', fastMode: Object.assign({}, RUN_TASK_FIELD) };
    let out = null;
    let threw = null;
    try { out = register(pipeline, session, RUN_START_URL); } catch (error) { threw = error; }
    check(threw === null && out === true, 'a fast-mode session: the helper returns true');
    check(json(pipeline.calls.map((c) => c.event)) === json([E.BEFORE_TOOL_EXECUTION, E.AFTER_TOOL_EXECUTION, E.AFTER_ITERATION]),
      'a fast-mode session: exactly three handlers, registered BEFORE_TOOL_EXECUTION, AFTER_TOOL_EXECUTION, AFTER_ITERATION in that order');
    check(pipeline.calls.every((c) => typeof c.handler === 'function'), 'every registered handler is a function');
    check(json(session._fastRunEvidence) === json(EVIDENCE_RECORD) && session._fastRunStartPage === 'https://shop.example/cart/view',
      'a fast-mode session: the fresh evidence record and the start page (origin + path of the start URL) are on the session');
    // Wired end to end through the real pipeline's emit.
    await pipeline.real.emit(E.BEFORE_TOOL_EXECUTION, { toolName: 'click', origin: '', session, sessionId: session.sessionId, iteration: 2 });
    const pendingSeen = json(session._fastRunEvidence.pending);
    await pipeline.real.emit(E.AFTER_TOOL_EXECUTION, { toolName: 'click', toolResult: { success: false, result: { outcome: 'unknown', mayHaveExecuted: true } },
      session, sessionId: session.sessionId, iteration: 2 });
    await pipeline.real.emit(E.AFTER_ITERATION, { session, sessionId: session.sessionId, iteration: 2, toolResults: [] });
    check(pendingSeen === json({ tool: 'click', iteration: 2, seq: 1 }) && session._fastRunEvidence.pending === null
      && session._fastRunEvidence.lastUncertainSeq === 2 && FastPath.runEvidenceUnresolved(session._fastRunEvidence) === true,
    'a fast-mode session: the registered handlers record through the real pipeline emit (in flight, then an uncertain result)');

    for (const [label, patch] of [['no fastMode field', {}], ['fastMode null', { fastMode: null }], ['fastMode false', { fastMode: false }]]) {
      const p = recordingPipeline(HookPipeline);
      const s = Object.assign({ sessionId: 's-off' }, patch);
      let r = null;
      threw = null;
      try { r = register(p, s, RUN_START_URL); } catch (error) { threw = error; }
      check(threw === null && r === false && p.calls.length === 0 && !('_fastRunEvidence' in s) && !('_fastRunStartPage' in s),
        'a switch-off session (' + label + '): returns false, registers nothing and adds no field');
    }

    for (const [label, fastPath] of [['FsbFastPath missing', undefined], ['createRunEvidenceHandlers missing', { beforeTurn() {} }],
      ['createRunEvidenceHandlers throws', { createRunEvidenceHandlers() { throw new Error('boom'); } }],
      ['createRunEvidenceHandlers returns null', { createRunEvidenceHandlers() { return null; } }]]) {
      const c = makeContext(fastPath === undefined ? { LIFECYCLE_EVENTS } : { LIFECYCLE_EVENTS, FsbFastPath: fastPath });
      const p = recordingPipeline(HookPipeline);
      const s = { sessionId: 's-mod', fastMode: Object.assign({}, RUN_TASK_FIELD) };
      let r = null;
      threw = null;
      try { r = c.fsbRegisterFastRunEvidence(p, s, RUN_START_URL); } catch (error) { threw = error; }
      check(threw === null && r === false && p.count(E.BEFORE_TOOL_EXECUTION) + p.count(E.AFTER_TOOL_EXECUTION) + p.count(E.AFTER_ITERATION) === 0
        && !('_fastRunEvidence' in s) && !('_fastRunStartPage' in s),
      label + ': returns false quietly, registers nothing and leaves no evidence field');
    }

    for (const throwOn of [1, 2, 3]) {
      const p = recordingPipeline(HookPipeline, { throwOn });
      const s = { sessionId: 's-reg', fastMode: Object.assign({}, RUN_TASK_FIELD) };
      let r = null;
      threw = null;
      try { r = register(p, s, RUN_START_URL); } catch (error) { threw = error; }
      check(threw === null && r === false && p.count(E.BEFORE_TOOL_EXECUTION) + p.count(E.AFTER_TOOL_EXECUTION) + p.count(E.AFTER_ITERATION) === 0
        && !('_fastRunEvidence' in s) && !('_fastRunStartPage' in s),
      'pipeline.register throwing on call ' + throwOn + ': returns false, keeps no handler registered and removes the evidence fields (a partial record would read as evidence)');
    }

    threw = null;
    const odd = [];
    try {
      odd.push(register(null, { fastMode: RUN_TASK_FIELD }, RUN_START_URL));
      odd.push(register({}, { fastMode: RUN_TASK_FIELD }, RUN_START_URL));
      odd.push(register(recordingPipeline(HookPipeline), null, RUN_START_URL));
      odd.push(register(recordingPipeline(HookPipeline), undefined, undefined));
    } catch (error) { threw = error; }
    check(threw === null && odd.every((r) => r === false), 'a missing pipeline, a pipeline without register or a missing session returns false and never throws');

    const withPermission = recordingPipeline(HookPipeline);
    const permissionHook = () => ({ shouldStop: false, denied: false });
    withPermission.register(E.BEFORE_TOOL_EXECUTION, permissionHook);
    register(withPermission, { sessionId: 's-order', fastMode: Object.assign({}, RUN_TASK_FIELD) }, RUN_START_URL);
    check(withPermission.real._hooks[E.BEFORE_TOOL_EXECUTION][0] === permissionHook && withPermission.count(E.BEFORE_TOOL_EXECUTION) === 2,
      'the evidence before-tool handler runs after the session hooks registered earlier (the permission hook stays first)');
  }

  // -------------------------------------------------------------------------
  section('source: the one registration call, the follow-up path and persistence (Phase 70 D-14, T-70-02, T-70-07)');
  {
    const start = sliceFunction(bgSource, 'handleStartAutomation');
    const hooksLine = 'const sessionHooks = createSessionHooks(sessionId);';
    const runLine = 'runAgentLoop(sessionId, {';
    const hooksAt = start.indexOf(hooksLine);
    const runAt = hooksAt >= 0 ? start.indexOf(runLine, hooksAt) : -1;
    check(countOf(bgSource, REGISTER_LINE) === 1 && countOf(start, REGISTER_LINE) === 1,
      'handleStartAutomation holds exactly one guarded registration call, and background.js has no other');
    check(hooksAt >= 0 && runAt > hooksAt && start.slice(hooksAt + hooksLine.length, runAt).trim() === REGISTER_LINE,
      'the registration call sits directly between const sessionHooks = createSessionHooks(sessionId); and runAgentLoop(sessionId, {');
    check(countOf(bgSource, 'fsbRegisterFastRunEvidence(') === 2,
      'fsbRegisterFastRunEvidence is named twice in background.js: its declaration and the one call');
    const followAt = start.indexOf("if (existingSession && existingSession.status === 'idle') {");
    const reactivationAt = start.indexOf('const reactivationHooks = createSessionHooks(sessionId);', followAt);
    const followEnd = reactivationAt >= 0 ? start.indexOf('return;', reactivationAt) : -1;
    const followBranch = followAt >= 0 && followEnd > followAt ? start.slice(followAt, followEnd) : '';
    check(followBranch.length > 0 && followBranch.indexOf('fsbRegisterFastRunEvidence') === -1
      && countOf(bgSource, 'fsbRegisterFastRunEvidence(reactivationHooks') === 0,
    'the follow-up branch (reactivationHooks) registers no evidence handlers (run_task never takes it)');
    const hooks = sliceFunction(bgSource, 'createSessionHooks', { exact: true });
    const hash = crypto.createHash('sha256').update(hooks || '', 'utf8').digest('hex');
    check(hash === CREATE_SESSION_HOOKS_SHA256_P70, 'createSessionHooks equals 70-SYNC-RECHECK item r (' + hash.slice(0, 12) + ')');
    const persist = sliceFunction(bgSource, 'persistSession');
    const loggerSource = fs.readFileSync(path.join(ROOT, 'extension', 'utils', 'automation-logger.js'), 'utf8');
    check(typeof persist === 'string' && persist.length > 0 && persist.indexOf('_fastRun') === -1 && loggerSource.indexOf('_fastRun') === -1,
      'no _fastRun persistence: persistSession and automation-logger.js name no _fastRun field');
    const helper = sliceFunction(bgSource, 'fsbRegisterFastRunEvidence');
    check(bgSource.replace(helper, '').indexOf('_fastRun') === -1,
      'no _fastRun persistence: outside the registration helper background.js names no _fastRun field');
    check(!/importscripts/i.test(helper) && !/importscripts/i.test(REGISTER_LINE) && countOf(bgSource, 'importScripts') === 338,
      'background.js gains no importScripts token (338, the lattice pin)');
    check(!/\bawait\b/.test(helper) && !/^async /.test(helper), 'the registration helper is synchronous');
    check(/typeof globalThis !== 'undefined'/.test(helper) && countOf(helper, 'pipeline.register(LIFECYCLE_EVENTS.') === 3,
      'the helper reads FsbFastPath through a typeof-guarded globalThis and makes three pipeline.register(LIFECYCLE_EVENTS.X, ...) calls');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
