'use strict';

/**
 * Phase 69 plan 05 -- same-call `expect` wiring in the extension dispatcher.
 *
 * Covers (MCP-02 / SC2 on the real dispatch path, MCP-04 / SC3 on the
 * extension side):
 *   - wrapWithChangeReport without expect is today's path: zero injections
 *     with the toggle off, the three MAIN-world harvest injections in order
 *     with it on, and never an expect_result key (D-17).
 *   - With expect on one of the 29 tools (wire verbs resolved first,
 *     RESEARCH Finding 9) the outcome is evaluated after execute() through an
 *     ISOLATED-world probe with injectImmediately (D-18), whatever the toggle.
 *   - Navigation tools subscribe to main-frame commit events before execute()
 *     and judge nothing before a commit (RESEARCH Finding 2, Pitfall 1).
 *   - Definitive failures keep today's shape (D-19); execute() runs exactly
 *     once in every expect case (single-activation rule).
 *   - The real service-worker resolution path: classic scripts in one vm
 *     context with no require, found through bare identifiers.
 *
 * Run: node tests/expect-dispatcher.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const ROOT = path.join(__dirname, '..');
const DISPATCHER_PATH = path.join(ROOT, 'extension', 'ws', 'mcp-tool-dispatcher.js');
const AV_PATH = path.join(ROOT, 'extension', 'utils', 'action-verification.js');
const DEFS_PATH = path.join(ROOT, 'extension', 'ai', 'tool-definitions.js');

// ---- chrome stub ------------------------------------------------------------

const state = {
  seq: [],              // ordered call log: ['addListener', event] / ['execute'] / ['probe'] / ...
  scripting: [],        // { world, injectImmediately, func, tabId }
  mainQueue: [],        // results for non-ISOLATED injections (FIFO)
  probe: null,          // (cfg) => InjectionResult[] for ISOLATED injections
  tabs: null,           // (id) => tab | null
  tabsGetIds: [],
  goBackCalls: 0,
  updateCalls: 0,
  onBackComplete: null  // fired from tabs.goBack in Task 2 cases
};

function makeEvent(name) {
  const listeners = new Set();
  return {
    name,
    listeners,
    adds: 0,
    removes: 0,
    addListener(fn) { this.adds++; listeners.add(fn); state.seq.push(['addListener', name]); },
    removeListener(fn) { this.removes++; listeners.delete(fn); state.seq.push(['removeListener', name]); },
    fire(...args) { for (const fn of Array.from(listeners)) fn(...args); }
  };
}

const nav = {
  onCommitted: makeEvent('onCommitted'),
  onReferenceFragmentUpdated: makeEvent('onReferenceFragmentUpdated'),
  onHistoryStateUpdated: makeEvent('onHistoryStateUpdated'),
  onErrorOccurred: makeEvent('onErrorOccurred')
};
const tabEvents = {
  onUpdated: makeEvent('tabs.onUpdated'),
  onRemoved: makeEvent('tabs.onRemoved')
};

function holdingProbe(holds, documentId) {
  return (cfg) => [{
    documentId: documentId === undefined ? 'doc-new' : documentId,
    result: {
      ok: true,
      observations: ((cfg.args && cfg.args[0] && cfg.args[0].checks) || []).map((c) => ({
        kind: c.kind, observable: true, holds, observed: null, redact: false
      })),
      textTruncated: false
    }
  }];
}

function resetState() {
  state.seq.length = 0;
  state.scripting.length = 0;
  state.mainQueue.length = 0;
  state.probe = holdingProbe(true);
  state.tabs = (id) => ({ id, url: 'https://example.com/page', title: 'Example', status: 'complete' });
  state.tabsGetIds.length = 0;
  state.goBackCalls = 0;
  state.updateCalls = 0;
  state.onBackComplete = null;
  for (const ev of Object.values(nav)) { ev.listeners.clear(); ev.adds = 0; ev.removes = 0; }
  for (const ev of Object.values(tabEvents)) { ev.listeners.clear(); ev.adds = 0; ev.removes = 0; }
}

global.chrome = {
  tabs: {
    async get(id) {
      state.tabsGetIds.push(id);
      const tab = state.tabs(id);
      if (!tab) throw new Error('No tab with id: ' + id);
      return tab;
    },
    async goBack(id) {
      state.goBackCalls++;
      state.seq.push(['goBack', id]);
      if (typeof state.onBackComplete === 'function') state.onBackComplete(id);
    },
    async update() { state.updateCalls++; },
    async query() { return [{ id: 42, url: 'https://example.com/page', windowId: 1, active: true }]; },
    onUpdated: tabEvents.onUpdated,
    onRemoved: tabEvents.onRemoved
  },
  scripting: {
    async executeScript(cfg) {
      const funcName = cfg && cfg.func ? cfg.func.name : null;
      state.scripting.push({
        world: cfg.world,
        injectImmediately: cfg.injectImmediately,
        func: funcName,
        tabId: cfg.target && cfg.target.tabId
      });
      if (cfg.world === 'ISOLATED') {
        state.seq.push(['probe', funcName]);
        return state.probe(cfg);
      }
      state.seq.push(['inject', cfg.world || 'default', funcName]);
      const next = state.mainQueue.shift();
      return [{ result: next === undefined ? { ok: true } : next }];
    }
  },
  webNavigation: nav,
  storage: {
    local: { get: (key, cb) => cb({}) },
    onChanged: { addListener: () => {} }
  },
  runtime: { lastError: null }
};

delete require.cache[require.resolve(DISPATCHER_PATH)];
delete require.cache[require.resolve(AV_PATH)];
delete require.cache[require.resolve(DEFS_PATH)];
const dispatcher = require(DISPATCHER_PATH);

function liveNavListeners() {
  return nav.onCommitted.listeners.size + nav.onReferenceFragmentUpdated.listeners.size
    + nav.onHistoryStateUpdated.listeners.size;
}

function probeCalls() { return state.scripting.filter((c) => c.world === 'ISOLATED'); }

function counted(result, onCall) {
  const fn = async () => {
    fn.calls++;
    state.seq.push(['execute']);
    if (typeof onCall === 'function') onCall();
    return typeof result === 'function' ? result() : result;
  };
  fn.calls = 0;
  return fn;
}

const HARVEST_START = { ok: true, beforeState: { url: 'https://example.com/page', title: 't', inputValues: {} } };
const HARVEST_STOP = { ok: true, mutations: [], afterState: { url: 'https://example.com/page', title: 't', inputValues: {} }, settle_ms: 40 };

async function section(name, fn) {
  console.log('\n--- ' + name + ' ---');
  resetState();
  try { await fn(); } catch (err) {
    failed++;
    console.error('  FAIL: ' + name + ' crashed:', err && err.stack ? err.stack : err);
  }
}

// ---- Task 1: wrapper ----------------------------------------------------------

async function runTask1() {
  await section('exports and helpers', async () => {
    ok(typeof dispatcher._injectProbe === 'function', '_injectProbe exported (test-only accessor)');
    ok(typeof dispatcher._resolveExpectSpec === 'function', '_resolveExpectSpec exported (test-only accessor)');
    ok(typeof dispatcher._watchMainFrameCommit === 'function', '_watchMainFrameCommit exported (test-only accessor)');
    const t = dispatcher._resolveExpectSpec({ text_visible: 'x' }, 'type');
    ok(t && t.toolName === 'type_text' && t.isNav === false && t.normalized.ok === true,
      "_resolveExpectSpec resolves the wire verb 'type' to type_text before the membership check");
    const b = dispatcher._resolveExpectSpec({ url_includes: '/prev' }, 'back');
    ok(b && b.toolName === 'back' && b.isNav === true, "_resolveExpectSpec falls back to the literal 'back' (not a registry tool)");
    ok(dispatcher._resolveExpectSpec(undefined, 'click') === null, '_resolveExpectSpec: no expect -> null');
    ok(dispatcher._resolveExpectSpec(null, 'click') === null, '_resolveExpectSpec: expect null -> null');
    ok(dispatcher._resolveExpectSpec({ text_visible: 'x' }, 'hover') === null, '_resolveExpectSpec: hover is not an expect tool');
    ok(dispatcher._resolveExpectSpec({ text_visible: 'x' }, 'open_tab') === null, '_resolveExpectSpec: open_tab is not an expect tool');
    const bad = dispatcher._resolveExpectSpec({ bogus: 1 }, 'click');
    ok(bad && bad.normalized && bad.normalized.ok === false, '_resolveExpectSpec keeps a malformed spec as normalized.ok false');
  });

  await section('_injectProbe', async () => {
    const r = await dispatcher._injectProbe(7, function _fsbProbeStub() { return 1; }, [{ a: 1 }]);
    ok(r && r.ok === true && r.documentId === 'doc-new', '_injectProbe returns { ok, result, documentId }');
    const call = state.scripting[0];
    ok(call && call.world === 'ISOLATED' && call.injectImmediately === true && call.tabId === 7,
      '_injectProbe injects in the ISOLATED world with injectImmediately');
    state.probe = () => [];
    const empty = await dispatcher._injectProbe(7, function f() {}, []);
    ok(empty && empty.ok === false && empty.reason === 'no_result', "_injectProbe: no InjectionResult -> reason 'no_result'");
    state.probe = () => { throw new Error('Cannot access contents of the page'); };
    const err = await dispatcher._injectProbe(7, function f() {}, []);
    ok(err && err.ok === false && err.reason === 'Cannot access contents of the page', '_injectProbe: injection error -> its message');
    state.probe = () => new Promise(() => {});
    const t0 = Date.now();
    const slow = await dispatcher._injectProbe(7, function f() {}, []);
    ok(slow && slow.ok === false && slow.reason === 'timeout' && Date.now() - t0 >= 700,
      "_injectProbe: a hung injection loses the 750 ms race -> reason 'timeout'");
    const saved = global.chrome.scripting;
    delete global.chrome.scripting;
    try {
      const none = await dispatcher._injectProbe(7, function f() {}, []);
      ok(none && none.ok === false && none.reason === 'no_scripting', "_injectProbe: no chrome.scripting -> reason 'no_scripting'");
    } finally { global.chrome.scripting = saved; }
  });

  await section('no expect: toggle off is zero injections and no expect_result', async () => {
    dispatcher._setChangeReportsEnabledForTest(false);
    for (const expect of [undefined, null]) {
      resetState();
      const exec = counted({ success: true, tool: 'click' });
      const resp = await dispatcher.wrapWithChangeReport({ toolName: 'click', tabId: 7, params: {}, execute: exec, expect });
      ok(resp && resp.success === true && !Object.prototype.hasOwnProperty.call(resp, 'expect_result'),
        `OFF, expect ${expect}: no expect_result key`);
      ok(state.scripting.length === 0, `OFF, expect ${expect}: zero chrome.scripting calls`);
      ok(exec.calls === 1, `OFF, expect ${expect}: execute() once`);
      ok(nav.onCommitted.adds === 0, `OFF, expect ${expect}: no webNavigation listener`);
    }
  });

  await section('no expect: toggle on keeps the three MAIN harvest injections in order', async () => {
    dispatcher._setChangeReportsEnabledForTest(true);
    state.mainQueue.push(HARVEST_START, true, HARVEST_STOP);
    const exec = counted({ success: true, tool: 'click' });
    const resp = await dispatcher.wrapWithChangeReport({ toolName: 'click', tabId: 7, params: { selector: '#go' }, execute: exec });
    const worlds = state.scripting.map((c) => c.world + ':' + c.func);
    ok(JSON.stringify(worlds) === JSON.stringify([
      'MAIN:_fsbHarvestStartInPage', 'MAIN:_fsbWaitStableInPage', 'MAIN:_fsbHarvestStopInPage'
    ]), 'ON: exactly start, waitStable, stop, all in the MAIN world (got ' + worlds.join(', ') + ')');
    ok(resp && resp.change_report && !Object.prototype.hasOwnProperty.call(resp, 'expect_result'),
      'ON: change_report attached, no expect_result key');
    ok(exec.calls === 1, 'ON: execute() once');
  });

  await section('expect on click with the toggle OFF', async () => {
    dispatcher._setChangeReportsEnabledForTest(false);
    const exec = counted({ success: true, tool: 'click' });
    const resp = await dispatcher.wrapWithChangeReport({
      toolName: 'click', tabId: 7, params: {}, execute: exec, expect: { text_visible: 'Saved' }
    });
    ok(exec.calls === 1, 'execute() once');
    const probes = probeCalls();
    ok(probes.length >= 1 && probes.every((c) => c.world === 'ISOLATED' && c.injectImmediately === true
      && c.func === '_fsbExpectProbeInPage' && c.tabId === 7),
    'probes use the ISOLATED world, injectImmediately and _fsbExpectProbeInPage on the action tab');
    const execAt = state.seq.findIndex((e) => e[0] === 'execute');
    const probeAt = state.seq.findIndex((e) => e[0] === 'probe');
    ok(execAt !== -1 && probeAt > execAt, 'the probe runs after execute()');
    ok(resp && resp.success === true && resp.expect_result && resp.expect_result.status === 'verified',
      'expect_result.status verified from the canned probe');
    ok(resp.expect_result.checks.length === 1 && resp.expect_result.checks[0].kind === 'text_visible'
      && resp.expect_result.checks[0].status === 'met', 'one met text_visible check');
    ok(nav.onCommitted.adds === 0, 'a non-navigation tool subscribes to no commit event');
  });

  await section('wire verbs resolve before the 29-tool membership check', async () => {
    dispatcher._setChangeReportsEnabledForTest(false);
    for (const verb of ['type', 'cdpClickAt', 'toggleCheckbox', 'keyPress', 'dragdrop']) {
      resetState();
      const exec = counted({ success: true });
      const resp = await dispatcher.wrapWithChangeReport({
        toolName: verb, tabId: 7, params: {}, execute: exec, expect: { text_visible: 'Done' }
      });
      ok(resp && resp.expect_result && resp.expect_result.status === 'verified' && probeCalls().length >= 1,
        `verb '${verb}' is evaluated`);
      ok(exec.calls === 1, `verb '${verb}': execute() once`);
    }
    for (const verb of ['hover', 'open_tab']) {
      resetState();
      const exec = counted({ success: true });
      const resp = await dispatcher.wrapWithChangeReport({
        toolName: verb, tabId: 7, params: {}, execute: exec, expect: { text_visible: 'Done' }
      });
      ok(resp && !Object.prototype.hasOwnProperty.call(resp, 'expect_result') && state.scripting.length === 0,
        `'${verb}' ignores expect (no probe, no expect_result)`);
      ok(exec.calls === 1, `'${verb}': execute() once`);
    }
  });

  await section('refresh subscribes to commits before execute() and removes every listener', async () => {
    dispatcher._setChangeReportsEnabledForTest(true);
    const exec = counted({ success: true, tool: 'refresh', tabId: 7 }, () => {
      nav.onCommitted.fire({ tabId: 8, frameId: 0, documentId: 'doc-other' });
      nav.onCommitted.fire({ tabId: 7, frameId: 3, documentId: 'doc-frame' });
      nav.onCommitted.fire({ tabId: 7, frameId: 0, documentId: 'doc-new' });
    });
    const resp = await dispatcher.wrapWithChangeReport({
      toolName: 'refresh', tabId: 7, params: {}, execute: exec, expect: { text_visible: 'Fresh' }
    });
    const execAt = state.seq.findIndex((e) => e[0] === 'execute');
    const adds = state.seq.filter((e, i) => e[0] === 'addListener' && i < execAt).map((e) => e[1]).sort();
    ok(JSON.stringify(adds) === JSON.stringify(['onCommitted', 'onHistoryStateUpdated', 'onReferenceFragmentUpdated']),
      'the three main-frame commit events are subscribed BEFORE execute()');
    ok(resp && resp.expect_result && resp.expect_result.status === 'verified',
      'a tab-7 frame-0 commit lets the checks proceed (verified)');
    ok(liveNavListeners() === 0 && nav.onCommitted.removes === 1 && nav.onReferenceFragmentUpdated.removes === 1
      && nav.onHistoryStateUpdated.removes === 1, 'every commit listener is removed afterwards');
    ok(state.scripting.every((c) => c.world === 'ISOLATED'), 'no harvest injection for refresh (skip list unchanged)');
    ok(exec.calls === 1, 'execute() once');
  });

  await section('refresh without a commit is never verified against the old page', async () => {
    dispatcher._setChangeReportsEnabledForTest(false);
    const exec = counted({ success: true, tool: 'refresh', tabId: 7 });
    const resp = await dispatcher.wrapWithChangeReport({
      toolName: 'refresh', tabId: 7, params: {}, execute: exec, expect: { text_visible: 'Old page', timeout_ms: 300 }
    });
    ok(resp && resp.expect_result && resp.expect_result.status === 'uncertain' && resp.expect_result.reason === 'no_commit',
      'no commit event -> uncertain, reason no_commit (got ' + JSON.stringify(resp && resp.expect_result) + ')');
    ok(probeCalls().length === 0, 'no DOM probe before a commit');
    ok(liveNavListeners() === 0, 'listeners removed');
    ok(exec.calls === 1, 'execute() once');
  });

  await section('a probe of a different document than the committed one is stale', async () => {
    dispatcher._setChangeReportsEnabledForTest(false);
    state.probe = holdingProbe(true, 'doc-old');
    const exec = counted({ success: true, tool: 'go_back', tabId: 7 }, () => {
      nav.onCommitted.fire({ tabId: 7, frameId: 0, documentId: 'doc-new' });
    });
    const resp = await dispatcher.wrapWithChangeReport({
      toolName: 'go_back', tabId: 7, params: {}, execute: exec, expect: { text_visible: 'x', timeout_ms: 0 }
    });
    ok(resp && resp.expect_result && resp.expect_result.status === 'uncertain' && resp.expect_result.reason === 'stale_document',
      'probe documentId differs from the committed documentId -> uncertain stale_document');
    ok(exec.calls === 1, 'execute() once');
  });

  // 69-REVIEW WR-01: the outgoing document's own pushState / hash updates
  // during the network phase must not count as the navigation's commit.
  await section('commit watcher: same-document events count only with no cross-document navigation pending', async () => {
    const PENDING = { id: 7, url: 'https://example.com/page', status: 'loading', pendingUrl: 'https://example.com/prev' };
    const SETTLED = { id: 7, url: 'https://example.com/page#top', status: 'complete' };

    const w = dispatcher._watchMainFrameCommit(7, 'go_back');
    ok(w.isCommitted(SETTLED) === false && w.documentId() === null, 'nothing seen: not committed');
    nav.onHistoryStateUpdated.fire({ tabId: 7, frameId: 0, documentId: 'doc-old' });
    ok(w.isCommitted(PENDING) === false, 'a same-document event while a navigation is pending is not the commit');
    ok(w.isCommitted(SETTLED) === true && w.documentId() === 'doc-old',
      'with nothing pending the same-document event is the commit (fragment_only / history-state back)');
    nav.onCommitted.fire({ tabId: 7, frameId: 0, documentId: 'doc-new' });
    ok(w.isCommitted(PENDING) === true && w.documentId() === 'doc-new', 'the cross-document commit always counts');
    nav.onReferenceFragmentUpdated.fire({ tabId: 7, frameId: 0, documentId: 'doc-old' });
    ok(w.documentId() === 'doc-new', 'a later same-document event cannot rename the committed document');
    w.dispose();
    ok(liveNavListeners() === 0, 'go_back watcher listeners removed');

    const r = dispatcher._watchMainFrameCommit(7, 'refresh');
    nav.onReferenceFragmentUpdated.fire({ tabId: 7, frameId: 0, documentId: 'doc-old' });
    nav.onHistoryStateUpdated.fire({ tabId: 7, frameId: 0, documentId: 'doc-old' });
    ok(r.isCommitted(SETTLED) === false && r.documentId() === null, 'refresh ignores same-document events entirely');
    nav.onCommitted.fire({ tabId: 7, frameId: 0, documentId: 'doc-reloaded' });
    ok(r.isCommitted(SETTLED) === true && r.documentId() === 'doc-reloaded', 'refresh commits on the reload itself');
    r.dispose();

    const n = dispatcher._watchMainFrameCommit(7, 'navigate');
    nav.onReferenceFragmentUpdated.fire({ tabId: 7, frameId: 0, documentId: 'doc-same' });
    ok(n.isCommitted(SETTLED) === true && n.documentId() === 'doc-same', 'navigate to a fragment-only URL commits in place');
    n.dispose();

    const boot = dispatcher._watchMainFrameCommit(null, 'navigate');
    nav.onHistoryStateUpdated.fire({ tabId: 9, frameId: 0, documentId: 'doc-9-old' });
    nav.onCommitted.fire({ tabId: 10, frameId: 0, documentId: 'doc-10' });
    boot.bindTab(9);
    ok(boot.isCommitted(Object.assign({}, PENDING, { id: 9 })) === false && boot.isCommitted({ id: 9, status: 'complete' }) === true,
      'bootstrap: a buffered same-document event keeps the pendingUrl rule after bindTab');
    ok(boot.documentId() === 'doc-9-old', 'bootstrap: the bound tab entry, not tab 10, is used');
    boot.dispose();
    ok(liveNavListeners() === 0, 'every watcher listener removed');
  });

  await section('go_back / refresh: an outgoing-document history update is never verified as the commit', async () => {
    dispatcher._setChangeReportsEnabledForTest(false);
    state.probe = holdingProbe(true, 'doc-old');
    state.tabs = (id) => ({ id, url: 'https://example.com/page', title: 'Example', status: 'loading', pendingUrl: 'https://example.com/prev' });
    const exec = counted({ success: true, tool: 'go_back', tabId: 7 }, () => {
      nav.onHistoryStateUpdated.fire({ tabId: 7, frameId: 0, documentId: 'doc-old' });
    });
    const resp = await dispatcher.wrapWithChangeReport({
      toolName: 'go_back', tabId: 7, params: {}, execute: exec, expect: { text_visible: 'Old page', timeout_ms: 300 }
    });
    ok(resp && resp.expect_result && resp.expect_result.status === 'uncertain' && resp.expect_result.reason === 'no_commit',
      'go_back: pending navigation + same-document event -> uncertain no_commit (got ' + JSON.stringify(resp && resp.expect_result) + ')');
    ok(probeCalls().length === 0, 'go_back: the outgoing document is never probed');
    ok(exec.calls === 1, 'go_back: execute() once');

    resetState();
    state.probe = holdingProbe(true, 'doc-old');
    const exec2 = counted({ success: true, tool: 'refresh', tabId: 7 }, () => {
      nav.onReferenceFragmentUpdated.fire({ tabId: 7, frameId: 0, documentId: 'doc-old' });
    });
    const resp2 = await dispatcher.wrapWithChangeReport({
      toolName: 'refresh', tabId: 7, params: {}, execute: exec2, expect: { text_visible: 'Old page', timeout_ms: 300 }
    });
    ok(resp2 && resp2.expect_result && resp2.expect_result.status === 'uncertain' && resp2.expect_result.reason === 'no_commit',
      'refresh: a same-document event is never the reload commit');
    ok(probeCalls().length === 0 && liveNavListeners() === 0, 'refresh: no probe; listeners removed');
    ok(exec2.calls === 1, 'refresh: execute() once');
  });

  await section('execute() throwing on a navigation tool', async () => {
    dispatcher._setChangeReportsEnabledForTest(false);
    const boom = new Error('reload exploded');
    const exec = counted(() => { throw boom; });
    let caught = null;
    try {
      await dispatcher.wrapWithChangeReport({
        toolName: 'refresh', tabId: 7, params: {}, execute: exec, expect: { text_visible: 'x' }
      });
    } catch (err) { caught = err; }
    ok(caught === boom, 'the throw propagates unchanged, as a bare return execute() would');
    ok(liveNavListeners() === 0 && nav.onCommitted.adds === 1 && nav.onCommitted.removes === 1,
      'listeners removed when execute() throws');
    ok(probeCalls().length === 0, 'no probe after a throw');
    ok(exec.calls === 1, 'execute() once');
  });

  await section('expect on click with the toggle ON: harvest, then the probe', async () => {
    dispatcher._setChangeReportsEnabledForTest(true);
    state.mainQueue.push(HARVEST_START, true, HARVEST_STOP);
    const exec = counted({ success: true, tool: 'click' });
    const resp = await dispatcher.wrapWithChangeReport({
      toolName: 'click', tabId: 7, params: { selector: '#go' }, execute: exec, expect: { text_visible: 'Saved' }
    });
    const order = state.scripting.map((c) => c.world + ':' + c.func);
    ok(order.length >= 4 && JSON.stringify(order.slice(0, 4)) === JSON.stringify([
      'MAIN:_fsbHarvestStartInPage', 'MAIN:_fsbWaitStableInPage', 'MAIN:_fsbHarvestStopInPage', 'ISOLATED:_fsbExpectProbeInPage'
    ]), 'three MAIN harvest injections in order, then the ISOLATED probe (got ' + order.join(', ') + ')');
    ok(resp && resp.change_report && resp.expect_result && resp.expect_result.status === 'verified',
      'both change_report and expect_result');
    ok(exec.calls === 1, 'execute() once');
  });

  await section('definitive failures keep their shape; unknown outcomes get expect_result', async () => {
    for (const on of [false, true]) {
      dispatcher._setChangeReportsEnabledForTest(on);
      resetState();
      if (on) state.mainQueue.push(HARVEST_START, true, HARVEST_STOP);
      const exec = counted({ success: false, error: 'element not found' });
      const resp = await dispatcher.wrapWithChangeReport({
        toolName: 'click', tabId: 7, params: {}, execute: exec, expect: { text_visible: 'Saved' }
      });
      ok(resp && resp.success === false && !Object.prototype.hasOwnProperty.call(resp, 'expect_result')
        && probeCalls().length === 0, `toggle ${on ? 'on' : 'off'}: definitive failure -> no expect_result, no probe`);
      ok(exec.calls === 1, `toggle ${on ? 'on' : 'off'}: definitive failure, execute() once`);
    }
    dispatcher._setChangeReportsEnabledForTest(false);
    resetState();
    const exec = counted({ success: false, mayHaveExecuted: true, outcome: 'unknown', error: 'timed out' });
    const resp = await dispatcher.wrapWithChangeReport({
      toolName: 'click', tabId: 7, params: {}, execute: exec, expect: { text_visible: 'Saved' }
    });
    ok(resp && resp.success === false && resp.mayHaveExecuted === true && resp.expect_result
      && resp.expect_result.status === 'verified', 'mayHaveExecuted:true -> expect_result attached, success unchanged');
    ok(exec.calls === 1, 'unknown outcome: execute() once');
  });

  await section('unmet and page-unresponsive outcomes', async () => {
    dispatcher._setChangeReportsEnabledForTest(false);
    state.probe = holdingProbe(false);
    const exec = counted({ success: true });
    const resp = await dispatcher.wrapWithChangeReport({
      toolName: 'click', tabId: 7, params: {}, execute: exec, expect: { text_visible: 'Saved', timeout_ms: 0 }
    });
    ok(resp && resp.expect_result && resp.expect_result.status === 'unmet', 'an observable false predicate -> unmet');
    ok(exec.calls === 1, 'unmet: execute() once');
    resetState();
    const exec2 = counted({ success: false, mayHaveExecuted: true, errorCode: 'PAGE_UNRESPONSIVE', outcome: 'unknown' });
    const resp2 = await dispatcher.wrapWithChangeReport({
      toolName: 'click', tabId: 7, params: {}, execute: exec2, expect: { text_visible: 'Saved', timeout_ms: 0 }
    });
    ok(resp2 && resp2.expect_result && resp2.expect_result.status === 'uncertain'
      && resp2.expect_result.reason === 'page_unresponsive' && probeCalls().length === 0,
    'errorCode PAGE_UNRESPONSIVE -> uncertain page_unresponsive without a probe');
    ok(exec2.calls === 1, 'page unresponsive: execute() once');
  });

  await section('malformed expect', async () => {
    dispatcher._setChangeReportsEnabledForTest(false);
    const exec = counted({ success: true });
    const resp = await dispatcher.wrapWithChangeReport({
      toolName: 'click', tabId: 7, params: {}, execute: exec, expect: { bogus: 1 }
    });
    ok(resp && resp.expect_result && resp.expect_result.status === 'uncertain'
      && resp.expect_result.reason === 'invalid_expect', 'malformed expect -> uncertain invalid_expect');
    ok(probeCalls().length === 0, 'no probe for a malformed expect');
    ok(exec.calls === 1, 'invalid_expect: execute() once');
  });

  await section('navigate bootstrap: the evaluator falls back to response.tabId', async () => {
    dispatcher._setChangeReportsEnabledForTest(true);
    state.tabs = (id) => ({ id, url: 'https://example.com/landing', title: 'Landing', status: 'complete' });
    const exec = counted({ success: true, tool: 'navigate', tabId: 9 }, () => {
      nav.onCommitted.fire({ tabId: 9, frameId: 0, documentId: 'doc-9', url: 'https://example.com/landing' });
      nav.onCommitted.fire({ tabId: 10, frameId: 0, documentId: 'doc-10' });
    });
    const resp = await dispatcher.wrapWithChangeReport({
      toolName: 'navigate', tabId: null, params: { url: 'https://example.com/landing' }, execute: exec,
      expect: { url_includes: '/landing' }
    });
    ok(resp && resp.expect_result && resp.expect_result.status === 'verified', 'verified on response.tabId 9');
    ok(state.tabsGetIds.length >= 1 && state.tabsGetIds.every((id) => id === 9), 'tabs.get only reads tab 9');
    ok(liveNavListeners() === 0, 'listeners removed');
    ok(exec.calls === 1, 'execute() once');

    resetState();
    const exec2 = counted({ success: true, tool: 'navigate' });
    const resp2 = await dispatcher.wrapWithChangeReport({
      toolName: 'navigate', tabId: null, params: {}, execute: exec2, expect: { url_includes: '/x' }
    });
    ok(resp2 && resp2.expect_result && resp2.expect_result.status === 'uncertain' && resp2.expect_result.reason === 'no_tab',
      'no finite tab id anywhere -> uncertain no_tab');
    ok(state.tabsGetIds.length === 0 && liveNavListeners() === 0, 'no tab read; listeners removed');
    ok(exec2.calls === 1, 'no_tab: execute() once');
  });

  await section('source: MAIN-world call sites unchanged, one ISOLATED site, helpers before the wrapper', async () => {
    const src = fs.readFileSync(DISPATCHER_PATH, 'utf8');
    const isolated = src.split("world: 'ISOLATED'").length - 1;
    ok(isolated === 1, "exactly one world: 'ISOLATED' site (got " + isolated + ')');
    const wrapAt = src.indexOf('async function wrapWithChangeReport(');
    const wrapper = src.slice(wrapAt, src.indexOf('\n// ', wrapAt + 20));
    ok(wrapper.includes("'navigate', 'close_tab'") && wrapper.includes('return execute()'),
      'the hung-page-recovery wrapper pins still hold');
    for (const name of ['async function _injectProbe(', 'function _resolveExpectEvaluator(', 'function _resolveExpectSpec(',
      'function _watchMainFrameCommit(', 'async function _attachExpectResult(', 'async function _executeWithExpect(']) {
      const at = src.indexOf(name);
      ok(at !== -1 && at < wrapAt, name + ' is declared before wrapWithChangeReport');
    }
    const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    ok(!/(globalThis|self)\.EXPECT_/.test(code), 'no globalThis.EXPECT_* / self.EXPECT_* read in code');
  });

  await section('service worker: classic scripts in one vm context, no require', async () => {
    const swLog = [];
    const swChrome = {
      tabs: { get: async (id) => ({ id, url: 'https://example.com/sw', title: 'SW', status: 'complete' }) },
      scripting: {
        executeScript: async (cfg) => {
          swLog.push({ world: cfg.world, injectImmediately: cfg.injectImmediately, func: cfg.func && cfg.func.name });
          return [{
            documentId: 'doc-sw',
            result: { ok: true, observations: [{ kind: 'text_visible', observable: true, holds: true, observed: null, redact: false }] }
          }];
        }
      },
      storage: { local: { get: (key, cb) => cb({}) }, onChanged: { addListener: () => {} } }
    };
    const context = vm.createContext({
      console, setTimeout, clearTimeout, setInterval, clearInterval, URL, chrome: swChrome
    });
    // background.js importScripts order: tool-definitions (28), action-verification (80), dispatcher (82).
    for (const file of [DEFS_PATH, AV_PATH, DISPATCHER_PATH]) {
      vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: path.relative(ROOT, file) });
    }
    ok(vm.runInContext('typeof require', context) === 'undefined' && vm.runInContext('typeof module', context) === 'undefined',
      'the context has no require and no module');
    ok(vm.runInContext('typeof globalThis.EXPECT_TOOL_NAMES', context) === 'undefined',
      'EXPECT_TOOL_NAMES is not a globalThis property (top-level const of a classic script)');
    ok(vm.runInContext('typeof EXPECT_TOOL_NAMES', context) === 'object',
      'EXPECT_TOOL_NAMES is reachable as a bare identifier');
    context._setChangeReportsEnabledForTest(false);
    let calls = 0;
    // The bridge payload is JSON.parse'd inside the service worker, so the
    // expect object belongs to that realm (normalizeExpectSpec checks the
    // prototype). Parse it inside the vm context the same way.
    const swExpect = vm.runInContext('JSON.parse(\'{"text_visible":"Saved"}\')', context);
    const resp = await context.wrapWithChangeReport({
      toolName: 'click', tabId: 7, params: {},
      execute: async () => { calls++; return { success: true, tool: 'click' }; },
      expect: swExpect
    });
    ok(resp && resp.expect_result && resp.expect_result.status === 'verified'
      && resp.expect_result.reason !== 'extension_unsupported',
    'service-worker vm case: expect_result verified through bare-identifier resolution');
    ok(swLog.length >= 1 && swLog.every((c) => c.world === 'ISOLATED' && c.injectImmediately === true
      && c.func === '_fsbExpectProbeInPage'), 'service-worker vm case: only the ISOLATED probe was injected');
    ok(calls === 1, 'service-worker vm case: execute() once');
  });
}

// ---- Task 2: back route, bridge forwarding, journal and replay strip lists ----

function makeRegistry({ owner, token }) {
  return {
    hasAgent(id) { return id === 'agent_legit' || id === 'agent_attacker'; },
    isOwnedBy(_tabId, agentId) { return agentId === owner; },
    getOwner() { return owner; },
    getTabMetadata() { return { incognito: false, windowId: 1, ownershipToken: token, boundAt: Date.now() }; },
    getAgentWindowId() { return 1; },
    async bindTab(agentId, tabId) { return { agentId, tabId, ownershipToken: 'tok_renewed' }; }
  };
}

// The back route's own settle: tabs.onUpdated reports 'complete' right after
// it subscribes (the stub never fires a commit unless a case asks for one).
function backFixture({ depth = 5, commitOnBack = true, goBackThrows = false, closeAfterBack = false } = {}) {
  globalThis.fsbAgentRegistryInstance = makeRegistry({ owner: 'agent_legit', token: 'tok_legit' });
  state.mainQueue.push(depth); // history.length precheck (default world)
  state.tabs = (id) => {
    if (closeAfterBack && state.goBackCalls > 0) return null;
    return {
      id, windowId: 1, status: 'complete', title: 'Example',
      url: state.goBackCalls > 0 ? 'https://example.com/prev' : 'https://example.com/page'
    };
  };
  const addUpdated = tabEvents.onUpdated.addListener;
  tabEvents.onUpdated.addListener = function (fn) {
    addUpdated.call(this, fn);
    setTimeout(() => fn(42, { status: 'complete' }), 0);
  };
  state.onBackComplete = (id) => {
    if (goBackThrows) throw new Error('Cannot find a next page in history.');
    if (commitOnBack) nav.onCommitted.fire({ tabId: id, frameId: 0, documentId: 'doc-prev' });
  };
  return () => { tabEvents.onUpdated.addListener = addUpdated; };
}

function goBack(payload) {
  return dispatcher.dispatchMcpMessageRoute({
    type: 'mcp:go-back',
    payload: { agentId: 'agent_legit', ownershipToken: 'tok_legit', tabId: 42, ...payload }
  });
}

async function runTask2() {
  await section('back with expect: evaluated after the settle on the committed page', async () => {
    const restore = backFixture();
    try {
      const resp = await goBack({ expect: { url_includes: '/prev' } });
      ok(resp && resp.success === true && resp.status === 'ok' && resp.resultingUrl === 'https://example.com/prev',
        'back itself is unchanged (success, status ok, resultingUrl)');
      ok(resp.expect_result && resp.expect_result.status === 'verified', 'expect_result verified after the settle');
      ok(state.goBackCalls === 1 && state.updateCalls === 0, 'goBack once; the tabs update API is never called');
      ok(liveNavListeners() === 0 && nav.onCommitted.adds === 1 && nav.onCommitted.removes === 1,
        'every commit listener removed on the success path');
    } finally { restore(); }
  });

  await section('back commit gating: subscribed before goBack, never verified without a commit', async () => {
    const restore = backFixture({ commitOnBack: false });
    try {
      const resp = await goBack({ expect: { text_visible: 'Old page', timeout_ms: 300 } });
      const backAt = state.seq.findIndex((e) => e[0] === 'goBack');
      const adds = state.seq.filter((e, i) => e[0] === 'addListener' && i < backAt
        && ['onCommitted', 'onReferenceFragmentUpdated', 'onHistoryStateUpdated'].includes(e[1])).map((e) => e[1]).sort();
      ok(JSON.stringify(adds) === JSON.stringify(['onCommitted', 'onHistoryStateUpdated', 'onReferenceFragmentUpdated']),
        'the three webNavigation addListener calls come BEFORE tabs.goBack');
      ok(resp && resp.success === true && resp.expect_result && resp.expect_result.status === 'uncertain'
        && resp.expect_result.reason === 'no_commit',
      'settle ended without a commit: uncertain no_commit, never verified (got '
        + JSON.stringify(resp && resp.expect_result) + ')');
      ok(probeCalls().length === 0, 'the old page is never probed');
      ok(liveNavListeners() === 0, 'every listener removed');
      ok(state.updateCalls === 0, 'tabs update API never called');
    } finally { restore(); }
  });

  await section('back no_history with expect: evaluated at once, no commit, no listener', async () => {
    const restore = backFixture({ depth: 1 });
    try {
      const resp = await goBack({ expect: { url_includes: '/page' } });
      ok(resp && resp.success === true && resp.status === 'no_history', 'no_history outcome');
      ok(resp.expect_result && resp.expect_result.status === 'verified', 'expect_result present and verified');
      ok(nav.onCommitted.adds === 0 && nav.onReferenceFragmentUpdated.adds === 0 && nav.onHistoryStateUpdated.adds === 0,
        'no webNavigation listener added');
      ok(state.goBackCalls === 0 && state.updateCalls === 0, 'no goBack, no tabs update');
    } finally { restore(); }
  });

  await section('back failures with expect keep their shape', async () => {
    globalThis.fsbAgentRegistryInstance = makeRegistry({ owner: 'agent_owner', token: 'tok_owner' });
    const reject = await dispatcher.dispatchMcpMessageRoute({
      type: 'mcp:go-back',
      payload: { agentId: 'agent_attacker', ownershipToken: 'tok_attacker', tabId: 42, expect: { url_includes: '/x' } }
    });
    ok(reject && reject.success === false && reject.code === 'TAB_NOT_OWNED'
      && !Object.prototype.hasOwnProperty.call(reject, 'expect_result'), 'ownership reject: no expect_result');
    ok(nav.onCommitted.adds === 0 && state.goBackCalls === 0 && state.scripting.length === 0,
      'ownership reject: no listener, no goBack, no injection');

    resetState();
    let restore = backFixture({ goBackThrows: true });
    try {
      const resp = await goBack({ expect: { url_includes: '/prev' } });
      ok(resp && resp.success === false && resp.errorCode === 'navigation_unavailable'
        && !Object.prototype.hasOwnProperty.call(resp, 'expect_result'), 'navigation_unavailable: no expect_result');
      ok(nav.onCommitted.adds === 1 && liveNavListeners() === 0, 'navigation_unavailable: listeners removed');
    } finally { restore(); }

    resetState();
    restore = backFixture({ closeAfterBack: true });
    try {
      const resp = await goBack({ expect: { url_includes: '/prev' } });
      ok(resp && resp.success === false && resp.errorCode === 'tab_closed_during_back'
        && !Object.prototype.hasOwnProperty.call(resp, 'expect_result'), 'tab_closed_during_back: no expect_result');
      ok(nav.onCommitted.adds === 1 && liveNavListeners() === 0, 'tab_closed_during_back: listeners removed');
      ok(state.updateCalls === 0, 'tabs update API never called');
    } finally { restore(); }
  });

  await section('back without expect is today\'s shape', async () => {
    const restore = backFixture();
    try {
      const resp = await goBack({});
      ok(JSON.stringify(resp) === JSON.stringify({
        success: true, status: 'ok', resultingUrl: 'https://example.com/prev', historyDepth: 5,
        tabId: 42, tool: 'back', ownershipToken: 'tok_renewed'
      }), 'response deep-equals today\'s shape (got ' + JSON.stringify(resp) + ')');
      ok(nav.onCommitted.adds + nav.onReferenceFragmentUpdated.adds + nav.onHistoryStateUpdated.adds === 0,
        'zero webNavigation addListener calls');
      ok(probeCalls().length === 0 && state.updateCalls === 0, 'no probe, no tabs update');
    } finally { restore(); }
    resetState();
    const restore2 = backFixture({ depth: 1 });
    try {
      const resp = await goBack({ expect: null });
      ok(JSON.stringify(resp) === JSON.stringify({
        success: true, status: 'no_history', resultingUrl: 'https://example.com/page', historyDepth: 1, tabId: 42, tool: 'back'
      }), 'no_history with expect null deep-equals today\'s shape');
    } finally { restore2(); }
    delete globalThis.fsbAgentRegistryInstance;
  });

  await section('bridge client forwards expect into both wrapWithChangeReport calls', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'extension', 'ws', 'mcp-bridge-client.js'), 'utf8');
    const start = src.indexOf('  async _handleExecuteAction(payload) {');
    const end = src.indexOf('\n  /**\n   * Handle background-routed tools directly', start);
    ok(start >= 0 && end > start, '_handleExecuteAction located');
    const method = src.slice(start, end);
    ok(method.split('expect: payload.expect,').length - 1 === 2, 'two expect: payload.expect, lines, both in _handleExecuteAction');
    const anchor = src.indexOf('async _handleExecuteAction');
    const offset = src.indexOf('resolveAgentTabOrError', anchor) - anchor;
    ok(offset > 0 && offset < 4500, 'resolveAgentTabOrError stays inside the 4,500-char guard window (offset ' + offset + ')');

    const defs = require(DEFS_PATH);
    const seen = [];
    let resolverAnswer = { success: true, tabId: 42 };
    const context = {
      getToolByNameOrVerb: defs.getToolByNameOrVerb,
      MCP_DISPATCHER_SYNTHETIC_CHANGE_REPORT_TOOLS: new Set(['open_tab', 'close_tab']),
      wrapWithChangeReport: async (ctx) => { seen.push(ctx); return { success: true }; },
      resolveAgentTabOrError: async () => resolverAnswer
    };
    context.globalThis = context;
    const handler = vm.runInNewContext(`({${method}})._handleExecuteAction`, context);
    const client = {
      _recordVisualSessionTickIfPresent: async () => {},
      _resolveMcpSessionRecordTarget: async () => null,
      _recordMcpSessionAction() {},
      _clearVisualSessionIfFinal: async () => {}
    };
    const expect = { text_visible: 'Saved' };
    await handler.call(client, { tool: 'type', params: { selector: '#q', text: 'x' }, agentId: 'agent_a', expect });
    ok(seen.length === 1 && seen[0].expect === expect && seen[0].toolName === 'type' && seen[0].tabId === 42,
      'resolved-tab wrap call receives payload.expect');
    ok(!Object.prototype.hasOwnProperty.call(seen[0].params, 'expect'), 'expect never enters params');
    resolverAnswer = { success: false, code: 'NO_OWNED_TAB' };
    const navExpect = { url_includes: '/landing' };
    await handler.call(client, { tool: 'navigate', params: { url: 'https://example.com/landing' }, agentId: 'agent_a', expect: navExpect });
    ok(seen.length === 2 && seen[1].expect === navExpect && seen[1].toolName === 'navigate' && seen[1].tabId === null,
      'bootstrap wrap call (before resolveAgentTabOrError) receives payload.expect');
    resolverAnswer = { success: true, tabId: 42 };
    await handler.call(client, { tool: 'click', params: { selector: '#go' }, agentId: 'agent_a' });
    ok(seen.length === 3 && seen[2].expect === undefined, 'no expect on the payload -> ctx.expect undefined (today\'s path)');
  });

  await section('journal strips expect from recorded request payloads', async () => {
    const journal = require(path.join(ROOT, 'extension', 'utils', 'mcp-lattice-journal.js'));
    journal._resetForTests();
    journal._setLocalStorageShim({ async get() { return {}; }, async set() {} });
    journal._setTimeShim({ now: () => 1_800_000_000_000 });
    journal._setAlarmShim({ async create() {}, async clear() { return true; } });
    const savedReplay = globalThis.FsbLatticeReplay;
    globalThis.FsbLatticeReplay = null;
    try {
      const record = (callId, requestPayload) => journal.recordDispatch({
        agentId: 'agent-a', recordingRunId: 'run-a', recordingCallId: callId, client: 'Codex', task: 't',
        tool: 'mcp:go-back', requestPayload,
        response: { success: true, status: 'ok', expect_result: { status: 'verified', checks: [], waited_ms: 3, timeout_ms: 2000 } },
        success: true, dispatcher_route: 'message', tabId: 11,
        replayContext: { targetUrl: 'https://example.test/page', targetOrigin: 'https://example.test', sideEffectClass: 'write' }
      });
      const first = await record('call-1', {
        agentId: 'agent-a', recordingRunId: 'run-a', recordingCallId: 'call-1', tabId: 11, expect: { url_includes: '/prev' }
      });
      await record('call-2', { agentId: 'agent-a', recordingRunId: 'run-a', recordingCallId: 'call-2', tabId: 11 });
      const page = await journal.getSessionDetail({ sessionId: first.sessionId, afterSequence: -1, limit: 10 });
      const calls = page.events.filter((e) => e.kind === 'tool.call');
      const req1 = calls[0] && calls[0].metadata.request.inline;
      const req2 = calls[1] && calls[1].metadata.request.inline;
      ok(req1 && !Object.prototype.hasOwnProperty.call(req1, 'expect') && req1.tabId === 11,
        'stripInternalPayload removes expect and keeps the replayable fields');
      ok(req1 && req2 && JSON.stringify(req1) === JSON.stringify(req2), 'the stripped payload equals the one recorded without expect');
      const res1 = calls[0] && calls[0].metadata.result.inline;
      ok(res1 && res1.expect_result && res1.expect_result.status === 'verified', 'expect_result stays in the recorded response');
    } finally {
      globalThis.FsbLatticeReplay = savedReplay;
      delete globalThis.FsbMcpLatticeJournal;
    }
  });

  await section('recorder keeps expect out of replay payloads and params', async () => {
    const recorder = require(path.join(ROOT, 'extension', 'utils', 'mcp-session-recorder.js'));
    const shim = () => {
      const store = {};
      return {
        store,
        async get(k) { const out = {}; (Array.isArray(k) ? k : [k]).forEach((x) => { if (x in store) out[x] = store[x]; }); return out; },
        async set(v) { Object.assign(store, JSON.parse(JSON.stringify(v))); },
        async remove(k) { (Array.isArray(k) ? k : [k]).forEach((x) => { delete store[x]; }); }
      };
    };
    await recorder._drainForTests();
    recorder._resetForTests();
    recorder._setStorageShim(shim());
    recorder._setLocalStorageShim(shim());
    recorder._setTimeShim({ now: () => 1_750_000_000_000 });
    recorder._setAlarmShim({ async create() {}, async clear() { return true; } });
    const savedLogger = globalThis.automationLogger;
    globalThis.automationLogger = {
      withSessionMutationLock(fn) { return Promise.resolve().then(fn); },
      logSessionStart() {}, logAction() {}, async saveSession() {}, async pruneMcpSessions() {}, async updateSessionOutcome() {}
    };
    try {
      const actionPayload = (expect) => ({
        tool: 'type', params: { selector: '#pw', text: 'abc' }, agentId: 'agent-1',
        visualSession: { visualReason: 'Sign in', client: 'Claude' },
        ...(expect ? { expect } : {})
      });
      const withExpect = actionPayload({ value: 'hunter2', selector: '#pw' });
      recorder.recordAction({
        client: 'Claude', tool: 'type', params: withExpect.params, payload: withExpect,
        response: { success: true, expect_result: { status: 'verified' } }, success: true, tabId: 42
      });
      recorder.recordAction({
        client: 'Claude', tool: 'type', params: actionPayload(null).params, payload: actionPayload(null),
        response: { success: true }, success: true, tabId: 42
      });
      recorder.recordDispatch({
        client: 'Claude', tool: 'mcp:go-back',
        requestPayload: { agentId: 'agent-1', tabId: 42, expect: { url_includes: '/prev' } },
        response: { success: true, status: 'ok', expect_result: { status: 'verified' } },
        success: true, dispatcher_route: 'message', tabId: 42
      });
      recorder.recordDispatch({
        client: 'Claude', tool: 'mcp:go-back', requestPayload: { agentId: 'agent-1', tabId: 42 },
        response: { success: true, status: 'ok' }, success: true, dispatcher_route: 'message', tabId: 42
      });
      await recorder._drainForTests();
      const rec = recorder._peekOpenSessions()['agent-1::42'];
      ok(rec && Array.isArray(rec.replayEntries) && rec.replayEntries.length === 4, 'four replay entries recorded');
      const [typeWith, typeWithout, backWith, backWithout] = rec.replayEntries;
      ok(!Object.prototype.hasOwnProperty.call(typeWith.requestPayload, 'expect')
        && !JSON.stringify(typeWith.requestPayload).includes('hunter2'),
      'action tool: the recorded request payload carries no expect (and no expected value)');
      ok(JSON.stringify(typeWith.requestPayload) === JSON.stringify(typeWithout.requestPayload),
        'action tool: the payload equals the one recorded without expect');
      ok(!Object.prototype.hasOwnProperty.call(backWith.requestPayload, 'expect'), 'mcp:go-back: the replay payload has no expect');
      ok(JSON.stringify(backWith.requestPayload) === JSON.stringify(backWithout.requestPayload),
        'mcp:go-back: the payload equals the one recorded without expect');
      ok(backWith.redactedInputs === false && typeWith.redactedInputs === false,
        'stripping expect is not reported as an input redaction');
      ok(rec.actionHistory.every((a) => !Object.prototype.hasOwnProperty.call(a.params || {}, 'expect')),
        'no actionHistory params contain expect');
      ok(typeWith.response.expect_result && backWith.response.expect_result, 'expect_result stays in recorded responses');
    } finally {
      globalThis.automationLogger = savedLogger;
      await recorder._drainForTests();
      recorder._resetForTests();
    }
  });
}

(async () => {
  console.log('=== Phase 69-05: expect in the extension dispatcher ===');
  await runTask1();
  await runTask2();
  console.log(`\nPASS=${passed} FAIL=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('Test crashed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
