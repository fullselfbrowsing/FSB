'use strict';

/**
 * Delegated run: the side panel follows the agent's tab.
 *
 * A delegated (side-panel-started) run works in a tab the agent opens and
 * FSB foregrounds. Three things must hold for that tab:
 *
 *   1. background.js must not auto-collapse the side panel when the agent's
 *      tab activates (the QT-uof-6 gate only knew about autopilot sessions);
 *   2. a side-panel document -- including a freshly created one -- must map
 *      the agent-owned tab onto the run's conversation from persisted state
 *      alone, so the transcript, loader and "Working" header rehydrate;
 *   3. the accepted task must not resurrect into the composer on the next
 *      panel boot.
 *
 * Run: node tests/delegation-sidepanel-tab-follow.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SIDE_PANEL_PATH = path.resolve(__dirname, '../extension/ui/sidepanel.js');
const BACKGROUND_PATH = path.resolve(__dirname, '../extension/background.js');
const OwnerChip = require('../extension/ui/owner-chip.js');
const TabConvStore = require('../extension/ui/sidepanel-tab-conv-store.js');
const DelegationTabSeed = require('../extension/utils/delegation-tab-seed.js');

const sidepanelSource = fs.readFileSync(SIDE_PANEL_PATH, 'utf8');
const backgroundSource = fs.readFileSync(BACKGROUND_PATH, 'utf8');

let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) {
    passed += 1;
    console.log('  PASS: ' + label);
  } else {
    failed += 1;
    console.log('  FAIL: ' + label);
  }
}

function extractNamedFunction(source, name) {
  const asyncStart = source.indexOf('async function ' + name + '(');
  const start = asyncStart >= 0 ? asyncStart : source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('Function not found: ' + name);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index++) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error('Unbalanced function: ' + name);
}

// Like extractNamedFunction, but skips a destructured parameter list such as
// ({ params }) before brace-matching the body.
function extractFunctionBody(source, name) {
  const asyncStart = source.indexOf('async function ' + name + '(');
  const start = asyncStart >= 0 ? asyncStart : source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('Function not found: ' + name);
  let paren = 0;
  let bodyStart = -1;
  for (let index = source.indexOf('(', start); index < source.length; index++) {
    if (source[index] === '(') paren += 1;
    else if (source[index] === ')') { paren -= 1; if (paren === 0) { bodyStart = source.indexOf('{', index); break; } }
  }
  if (bodyStart < 0) throw new Error('Parameter list not found: ' + name);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index++) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error('Unbalanced function: ' + name);
}

const DELEGATION_ID = 'dlg_follow_0123456789';
const AGENT_ID = 'agent_1a2b3c4d5e6f';
const RUN_CONVERSATION = 'conv_1700000000000_run';

// ---------------------------------------------------------------------------
// 1. background.js: the side-panel close gate treats a live delegated tab as
//    working.
// ---------------------------------------------------------------------------
console.log('\n--- close gate: delegated tabs count as working ---');

{
  const gateSource = extractNamedFunction(backgroundSource, 'fsbTabBelongsToLiveDelegation');

  function runGate(setup) {
    const context = vm.createContext({ globalThis: null });
    context.globalThis = context;
    context.fsbAgentRegistryInstance = setup.registry;
    context.fsbDelegationControllerInstance = setup.controller;
    vm.runInContext(gateSource, context);
    return vm.runInContext('fsbTabBelongsToLiveDelegation(' + JSON.stringify(setup.tabId) + ')', context);
  }

  function registry(owners, mappings) {
    return {
      getOwner(tabId) { return Object.prototype.hasOwnProperty.call(owners, tabId) ? owners[tabId] : null; },
      listDelegationMappings() { return mappings; }
    };
  }
  const liveController = { getSnapshot() { return { delegationId: DELEGATION_ID, state: 'running', terminal: null }; } };
  const terminalController = { getSnapshot() { return { delegationId: DELEGATION_ID, state: 'completed', terminal: { code: 'completed' } }; } };
  const mapping = [{ delegationId: DELEGATION_ID, agentId: AGENT_ID }];

  check(runGate({ tabId: 7, registry: registry({}, mapping), controller: liveController }) === false,
    'unowned tab is not working');
  check(runGate({ tabId: 7, registry: registry({ 7: 'legacy:sidepanel' }, mapping), controller: liveController }) === false,
    'a surface-owned (legacy:*) tab is not a delegated tab');
  check(runGate({ tabId: 7, registry: registry({ 7: 'agent_other' }, mapping), controller: liveController }) === false,
    'a tab owned by an ordinary MCP agent (no delegation mapping) is not working');
  check(runGate({ tabId: 7, registry: registry({ 7: AGENT_ID }, mapping), controller: liveController }) === true,
    'a tab owned by a delegated agent with a live run is working');
  check(runGate({ tabId: 7, registry: registry({ 7: AGENT_ID }, mapping), controller: terminalController }) === false,
    'a terminal run no longer keeps the panel open');
  check(runGate({ tabId: 7, registry: registry({ 7: AGENT_ID }, mapping), controller: null }) === true,
    'registry mapping alone is authoritative when the controller has not booted');
  check(runGate({ tabId: 7, registry: { getOwner() { throw new Error('quarantined'); }, listDelegationMappings() { return []; } }, controller: null }) === false,
    'a registry failure fails safe (not working)');
  check(runGate({ tabId: 7, registry: null, controller: null }) === false,
    'no registry instance fails safe');
  check(runGate({ tabId: 'x', registry: registry({ 7: AGENT_ID }, mapping), controller: null }) === false,
    'non-integer tab ids are rejected');

  // The gate is wired into the QT-uof-6 listener, after the autopilot check,
  // and the helper sits after the delegation-composition extraction marker.
  const listenerStart = backgroundSource.indexOf('chrome.tabs.onActivated.addListener(async function (activeInfo) {');
  const listenerEnd = backgroundSource.indexOf('chrome.sidePanel.close({ windowId: activatedWindowId })', listenerStart);
  const listenerBody = backgroundSource.slice(listenerStart, listenerEnd);
  check(listenerStart > 0 && listenerEnd > listenerStart, 'auto-collapse listener is present');
  const workingTabSource = extractNamedFunction(backgroundSource, 'fsbFindWorkingTabInWindow');
  check(workingTabSource.includes('findActiveAutomationSessionForTab(t.id) || fsbTabBelongsToLiveDelegation(t.id)'),
    'auto-collapse gate consults both autopilot sessions and live delegations');
  check(workingTabSource.includes('await globalThis.fsbAgentRegistryReady'),
    'auto-collapse gate waits for registry wake hydration before reading ownership');
  check(listenerBody.includes('await fsbFindWorkingTabInWindow(activatedWindowId)'),
    'auto-collapse listener reads the per-window working state through the shared helper');
  const markerIndex = backgroundSource.indexOf('\nfunction findActiveAutomationSessionForTab(tabId) {');
  check(markerIndex > 0 && backgroundSource.indexOf('function fsbTabBelongsToLiveDelegation(tabId) {') > markerIndex,
    'delegation gate helper is defined after the delegation-composition marker');
}

// ---------------------------------------------------------------------------
// 2. sidepanel.js: an agent-owned tab adopts the run's conversation from
//    persisted state, so a fresh document rehydrates the run.
// ---------------------------------------------------------------------------
console.log('\n--- tab adoption: registry-backed fallback ---');

function makePanelContext(options) {
  const storageReads = [];
  const persisted = [];
  const tabConvEnvelope = TabConvStore.emptyEnvelope();
  if (options.existingTabConversation) {
    TabConvStore.ensureTabConversation(tabConvEnvelope, options.tabId, function() {
      return options.existingTabConversation;
    });
  }
  const registryEnvelope = options.registryEnvelope === undefined
    ? {
      v: 1,
      records: { [AGENT_ID]: { agentId: AGENT_ID, createdAt: 1, tabIds: [options.tabId] } },
      delegations: { [DELEGATION_ID]: AGENT_ID }
    }
    : options.registryEnvelope;
  const delegationEnvelope = options.delegationEnvelope === undefined
    ? { v: 1, byConversation: { [RUN_CONVERSATION]: DELEGATION_ID }, lru: [RUN_CONVERSATION] }
    : options.delegationEnvelope;

  const context = vm.createContext({
    console,
    FSBOwnerChip: OwnerChip,
    FSBSidepanelTabConvStore: TabConvStore,
    DELEGATION_ID_PATTERN: /^[A-Za-z0-9_-]{8,128}$/,
    tabConvEnvelope,
    conversationId: options.conversationId === undefined ? null : options.conversationId,
    _delegationUiState: options.uiState || { pendingStart: false, snapshot: null },
    _delegationIsActiveSnapshot(snapshot) {
      return !!(snapshot && ['starting', 'running', 'holding', 'held', 'resuming', 'stopping'].indexOf(snapshot.state) !== -1);
    },
    _envelopeReadyPromise: Promise.resolve(),
    _persistEnvelope: async function() { persisted.push(JSON.parse(JSON.stringify(tabConvEnvelope))); },
    _delegationConversationEnvelope: { v: 1, byConversation: {}, lru: [] },
    _loadDelegationConversationEnvelope: async function() {
      context._delegationConversationEnvelope = delegationEnvelope;
      return delegationEnvelope;
    },
    chrome: {
      storage: {
        session: {
          get: async function(keys) {
            storageReads.push(keys);
            if (options.storageThrows) throw new Error('storage unavailable');
            return { fsbAgentRegistry: registryEnvelope };
          }
        }
      }
    }
  });
  vm.runInContext(extractNamedFunction(sidepanelSource, '_delegationConversationForDelegationId'), context);
  vm.runInContext(extractNamedFunction(sidepanelSource, '_delegationConversationForOwnedTab'), context);
  vm.runInContext(extractNamedFunction(sidepanelSource, '_adoptTabIntoRunningDelegationConversation'), context);
  return { context, tabConvEnvelope, storageReads, persisted };
}

async function adopt(options) {
  const harness = makePanelContext(options);
  const adopted = await vm.runInContext(
    '_adoptTabIntoRunningDelegationConversation(' + JSON.stringify(options.tabId) + ')',
    harness.context
  );
  return {
    adopted,
    mapped: TabConvStore.getTabConversation(harness.tabConvEnvelope, options.tabId),
    storageReads: harness.storageReads.length,
    persisted: harness.persisted.length
  };
}

(async function() {
  let result = await adopt({ tabId: 7 });
  check(result.adopted === true && result.mapped === RUN_CONVERSATION && result.persisted === 1,
    'fresh document: agent-owned tab adopts the run conversation from persisted state');
  check(result.storageReads === 1, 'fallback reads the registry envelope exactly once');

  result = await adopt({ tabId: 7, existingTabConversation: 'conv_1700000000001_mine' });
  check(result.adopted === false && result.mapped === 'conv_1700000000001_mine',
    'a tab with its own transcript is left alone');

  result = await adopt({
    tabId: 7,
    registryEnvelope: {
      v: 1,
      records: { 'legacy:sidepanel': { agentId: 'legacy:sidepanel', createdAt: 1, tabIds: [7], legacy: true } },
      delegations: {}
    }
  });
  check(result.adopted === false && result.mapped === null, 'a surface-owned tab is not adopted');

  result = await adopt({
    tabId: 7,
    registryEnvelope: {
      v: 1,
      records: { agent_cursor00: { agentId: 'agent_cursor00', createdAt: 1, tabIds: [7] } },
      delegations: { [DELEGATION_ID]: AGENT_ID }
    }
  });
  check(result.adopted === false && result.mapped === null,
    'a tab owned by an ordinary MCP client (no delegation mapping) is not adopted');

  result = await adopt({ tabId: 7, registryEnvelope: { v: 1, records: {} } });
  check(result.adopted === false && result.mapped === null, 'an unowned tab is not adopted');

  result = await adopt({ tabId: 7, delegationEnvelope: { v: 1, byConversation: {}, lru: [] } });
  check(result.adopted === false && result.mapped === null,
    'a delegation with no bound conversation is not adopted');

  result = await adopt({ tabId: 7, storageThrows: true });
  check(result.adopted === false && result.mapped === null, 'a storage failure fails safe');

  result = await adopt({
    tabId: 9,
    conversationId: RUN_CONVERSATION,
    uiState: { pendingStart: true, snapshot: null },
    registryEnvelope: { v: 1, records: {} }
  });
  check(result.adopted === true && result.mapped === RUN_CONVERSATION && result.storageReads === 0,
    'in-memory path: a pending start adopts the selected conversation without a storage read');

  result = await adopt({
    tabId: 9,
    conversationId: RUN_CONVERSATION,
    uiState: { pendingStart: false, snapshot: { state: 'running' } },
    registryEnvelope: { v: 1, records: {} }
  });
  check(result.adopted === true && result.mapped === RUN_CONVERSATION && result.storageReads === 0,
    'in-memory path: a live snapshot adopts the selected conversation without a storage read');

  result = await adopt({
    tabId: 9,
    conversationId: RUN_CONVERSATION,
    uiState: { pendingStart: false, snapshot: { state: 'completed' } },
    registryEnvelope: { v: 1, records: {} }
  });
  check(result.adopted === false && result.mapped === null,
    'a finished in-memory run does not claim new tabs');

  result = await adopt({ tabId: 'nope' });
  check(result.adopted === false, 'non-integer tab ids are rejected');

  // The side-panel seed may hand a legacy surface tab to the newly registered
  // delegated agent, but it must never displace another real agent.
  console.log('\n--- delegated seed: live owners are never displaced ---');
  {
    DelegationTabSeed.clear();
    let releaseCalls = 0;
    let bindCalls = 0;
    const owner = 'agent_live_owner_0001';
    const reserved = DelegationTabSeed.reserve({
      delegationId: 'dlg_live_owner_0001',
      tabId: 11
    }, 1_000);
    const seeded = await DelegationTabSeed.adopt({
      delegationId: 'dlg_live_owner_0001',
      agentId: 'agent_codex_delegate_0001',
      registry: {
        getOwner: function() { return owner; },
        releaseTab: function() { releaseCalls += 1; },
        bindTab: function() { bindCalls += 1; }
      },
      tabsApi: {
        get: async function() {
          return { id: 11, incognito: false, url: 'https://example.com/' };
        }
      }
    }, 1_001);
    check(reserved === true && seeded === null,
      'a reserved side-panel tab already owned by a real agent is rejected');
    check(releaseCalls === 0 && bindCalls === 0,
      'live-owner rejection neither releases nor rebinds the tab');
    DelegationTabSeed.clear();
  }

  // The adoption call in syncActiveTabSurface stays guarded and single-arg:
  // that function runs in stub contexts that do not define the helper.
  const syncSource = extractNamedFunction(sidepanelSource, 'syncActiveTabSurface');
  check(syncSource.includes("if (typeof _adoptTabIntoRunningDelegationConversation === 'function') {\n      await _adoptTabIntoRunningDelegationConversation(incomingTabId);"),
    'syncActiveTabSurface keeps the guarded single-argument adoption call');
  check(syncSource.indexOf('refreshActiveTabOwnership(incomingTabId') < syncSource.indexOf('_adoptTabIntoRunningDelegationConversation(incomingTabId)')
    && syncSource.indexOf('_adoptTabIntoRunningDelegationConversation(incomingTabId)') < syncSource.indexOf('swapToTabConversation(incomingTabId)'),
    'adoption runs after the ownership read and before the conversation swap');

  // -------------------------------------------------------------------------
  // 3. The accepted task is cleared from the persisted draft.
  // -------------------------------------------------------------------------
  console.log('\n--- accepted task does not resurrect in the composer ---');
  const startSource = extractNamedFunction(sidepanelSource, '_beginDelegationStart');
  const clearIndex = startSource.indexOf("chatInput.textContent = '';");
  const lastTaskIndex = startSource.indexOf("chrome.storage.local.set({ lastTask: '' })");
  check(clearIndex > 0 && lastTaskIndex > clearIndex,
    'accepted delegated start clears the persisted lastTask right after clearing the composer');
  check(startSource.slice(clearIndex, lastTaskIndex).includes("typeof chrome !== 'undefined'"),
    'the lastTask clear is guarded for harness sandboxes without chrome');
  check(sidepanelSource.includes("chrome.storage.local.get(['lastTask']"),
    'boot still restores lastTask (the reason the clear is needed)');

  // -------------------------------------------------------------------------
  // 4. The collapse gate gives an in-flight agent-tab bind a grace period.
  //    Chrome activates an { active: true } tab at creation, before the
  //    dispatcher's bindTab has recorded the owner; the first ownership read
  //    can therefore miss a tab that is about to be owned.
  // -------------------------------------------------------------------------
  console.log('\n--- close gate: grace re-check before collapsing ---');
  {
    const listenerStart = backgroundSource.indexOf('chrome.tabs.onActivated.addListener(async function (activeInfo) {');
    const fnStart = backgroundSource.indexOf('async function (activeInfo) {', listenerStart);
    let depth = 0, fnEnd = -1;
    for (let i = backgroundSource.indexOf('{', fnStart); i < backgroundSource.length; i++) {
      if (backgroundSource[i] === '{') depth += 1;
      else if (backgroundSource[i] === '}') { depth -= 1; if (depth === 0) { fnEnd = i + 1; break; } }
    }
    const listenerSource = backgroundSource.slice(fnStart, fnEnd);
    const graceMatch = backgroundSource.match(/const FSB_SIDE_PANEL_COLLAPSE_GRACE_MS = (\d+);/);
    check(!!graceMatch && Number(graceMatch[1]) >= 200 && Number(graceMatch[1]) <= 1000,
      'collapse grace is a short, bounded constant');

    async function runGate(scenario) {
      const closes = [];
      const decisions = [];
      let pass = 0;
      const context = vm.createContext({ globalThis: null, console });
      context.globalThis = context;
      context.setTimeout = function(fn) { scenario.waited = true; fn(); };
      context.Number = Number;
      context.Promise = Promise;
      context.chrome = {
        sidePanel: { close: async function(args) { closes.push(args); } },
        tabs: { query: async function() { pass += 1; return [{ id: 7 }, { id: 8 }]; } }
      };
      context.findActiveAutomationSessionForTab = function() { return null; };
      context.fsbTabBelongsToLiveDelegation = function(tabId) {
        return tabId === 8 && scenario.ownedOnPass.indexOf(pass) !== -1;
      };
      context.automationLogger = { info: function(message, data) { decisions.push(data.outcome); } };
      vm.runInContext('const FSB_SIDE_PANEL_COLLAPSE_GRACE_MS = ' + graceMatch[1] + ';', context);
      vm.runInContext(extractNamedFunction(backgroundSource, 'fsbFindWorkingTabInWindow'), context);
      vm.runInContext(extractNamedFunction(backgroundSource, 'fsbLogSidePanelCollapse'), context);
      vm.runInContext('const fsbGateListener = ' + listenerSource + ';', context);
      await vm.runInContext('fsbGateListener({ tabId: 8, windowId: 3 })', context);
      return { closes, decisions, waited: scenario.waited === true };
    }

    let r = await runGate({ ownedOnPass: [] });
    check(r.closes.length === 1 && r.closes[0].windowId === 3 && r.decisions[0] === 'closed',
      'idle window on both passes: panel closes once, outcome "closed"');
    check(r.waited === true, 'the gate waited out the grace before closing');

    r = await runGate({ ownedOnPass: [2] });
    check(r.closes.length === 0 && r.decisions[0] === 'kept_after_grace',
      'tab bound during the grace: panel stays open, outcome "kept_after_grace"');

    r = await runGate({ ownedOnPass: [1, 2] });
    check(r.closes.length === 0 && r.decisions[0] === 'kept_working_tab' && r.waited === false,
      'working tab on the first pass: panel stays open without waiting');
  }

  // -------------------------------------------------------------------------
  // 5. switch_tab foregrounds for side-panel agents even without active:true.
  // -------------------------------------------------------------------------
  console.log('\n--- switch_tab: side-panel agents foreground their target ---');
  {
    const dispatcherSource = fs.readFileSync(path.resolve(__dirname, '../extension/ws/mcp-tool-dispatcher.js'), 'utf8');
    const switchSource = extractFunctionBody(dispatcherSource, 'handleSwitchTabRoute');
    const bindIdx = switchSource.indexOf("bindClaimedTabOrError({ tool: 'switch_tab'");
    const activateIdx = switchSource.indexOf('if (!forceForeground) await activateSidePanelAgentTab(agentId, params.tabId);');
    check(bindIdx > 0 && activateIdx > bindIdx,
      'switch_tab activates the target for side-panel agents after the ownership bind');
    check(/_forceForeground\s*===\s*true\s*&&\s*params\.active\s*===\s*true/.test(switchSource),
      'explicit-foreground contract for ordinary clients is unchanged');
  }

  // -------------------------------------------------------------------------
  // 6. get_logs survives a service-worker restart: loadLogs merges, never replaces.
  // -------------------------------------------------------------------------
  console.log('\n--- automation logger: persisted tail merges on wake ---');
  {
    const loggerSource = fs.readFileSync(path.resolve(__dirname, '../extension/utils/automation-logger.js'), 'utf8');
    const stored = [
      { timestamp: '2026-08-22T07:45:52.000Z', level: 'info', message: 'Side panel tab activation', data: { outcome: 'activated' } },
      { timestamp: '2026-08-22T07:45:53.000Z', level: 'info', message: 'Side panel auto-collapse', data: { outcome: 'kept_after_grace' } }
    ];
    let trustedLoads = 0;
    const context = vm.createContext({
      globalThis: null,
      console: { log() {}, warn() {}, error() {} },
      setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON, Promise, Set, Map, Array, Object, Number, String,
      fsbTrustedLocalFeatureStore: {
        async loadAutomationLogs() {
          trustedLoads += 1;
          return { ok: true, logs: stored };
        }
      },
      chrome: {
        runtime: { id: 'ext' }
      }
    });
    context.globalThis = context;
    vm.runInContext(loggerSource, context);
    const logger = context.automationLogger;
    logger.logs = [{ timestamp: '2026-08-22T07:47:44.000Z', level: 'info', message: 'Init', data: {} }];
    await logger.loadLogs();
    check(logger.logs.length === 3 && logger.logs[0].message === 'Side panel tab activation' && logger.logs[2].message === 'Init',
      'loadLogs prepends the persisted tail and keeps the fresh worker entries');
    await logger.loadLogs();
    check(logger.logs.length === 3, 'loadLogs is idempotent (no duplicates on a second merge)');
    check(trustedLoads === 2 && !Object.prototype.hasOwnProperty.call(context.chrome, 'storage'),
      'loadLogs uses the background-owned trusted feature store without direct chrome.storage access');
    check(backgroundSource.includes('Promise.resolve(automationLogger.loadLogs()).catch(() => {});'),
      'background restores the previous worker log tail on wake');
    check(/var AUTOMATION_LOGS_PERSISTED_TAIL = (\d+);/.test(loggerSource)
      && Number(loggerSource.match(/var AUTOMATION_LOGS_PERSISTED_TAIL = (\d+);/)[1]) >= 200,
      'persisted tail is large enough to hold a short run');
  }

  // -------------------------------------------------------------------------
  // 7. The terminal answer is delivered on hydrated renders too, exactly once.
  //    A raced tab-surface sync can leave the panel unsubscribed while the run
  //    finishes; the reopened/rehydrated panel must still receive the answer.
  // -------------------------------------------------------------------------
  console.log('\n--- answer bubble: hydrated delivery with persistent dedupe ---');
  {
    function makeAnswerContext(options) {
      const completions = [];
      const persisted = [];
      const stored = [];
      const context = vm.createContext({
        globalThis: null, console, Array, Set, Object, JSON, Promise,
        _delegationAnsweredIds: new Set(options.answered || []),
        DELEGATION_ANSWERED_LIMIT: 64,
        chrome: { storage: { session: { set: function(payload) { stored.push(payload); } } } },
        _delegationIsSelectedConversation: function() { return options.selected !== false; },
        _delegationConversationForDelegationId: function() { return options.runConversation || null; },
        _persistMessageToConversation: function(role, text, kind, convId) { persisted.push({ role, text, convId }); },
        addCompletionMessage: function(text) { completions.push(text); },
        completeStatusMessage: function(text) { completions.push(text); }
      });
      context.globalThis = context;
      vm.runInContext("var DELEGATION_ANSWERED_STORAGE_KEY = 'fsbDelegationAnsweredIds';", context);
      vm.runInContext(extractNamedFunction(sidepanelSource, '_markDelegationAnswered'), context);
      vm.runInContext(extractNamedFunction(sidepanelSource, '_renderDelegationAnswerBubble'), context);
      return { context, completions, persisted, stored };
    }
    const terminalSnapshot = {
      delegationId: DELEGATION_ID,
      state: 'completed',
      terminal: { code: 'completed', answer: 'It is 107F in Dallas.' }
    };

    let h = makeAnswerContext({ selected: true });
    let delivered = vm.runInContext(
      '_renderDelegationAnswerBubble(' + JSON.stringify(terminalSnapshot) + ', true)', h.context);
    check(delivered === true && h.completions.length === 1,
      'hydrated render delivers the answer to the selected conversation');
    check(h.stored.length === 1
      && Array.isArray(h.stored[0].fsbDelegationAnsweredIds)
      && h.stored[0].fsbDelegationAnsweredIds.indexOf(DELEGATION_ID) !== -1,
      'delivery marks the delegation answered in session storage');
    delivered = vm.runInContext(
      '_renderDelegationAnswerBubble(' + JSON.stringify(terminalSnapshot) + ', false)', h.context);
    check(delivered === false && h.completions.length === 1,
      'a later live render of the same terminal does not duplicate the answer');

    h = makeAnswerContext({ answered: [DELEGATION_ID] });
    delivered = vm.runInContext(
      '_renderDelegationAnswerBubble(' + JSON.stringify(terminalSnapshot) + ', true)', h.context);
    check(delivered === false && h.completions.length === 0,
      'an already-answered delegation (persisted set) renders nothing');

    h = makeAnswerContext({ selected: false, runConversation: RUN_CONVERSATION });
    delivered = vm.runInContext(
      '_renderDelegationAnswerBubble(' + JSON.stringify(terminalSnapshot) + ', true)', h.context);
    check(delivered === true && h.persisted.length === 1
      && h.persisted[0].convId === RUN_CONVERSATION && h.persisted[0].role === 'assistant',
      'unselected conversations get the answer persisted into the run conversation');
  }

  // -------------------------------------------------------------------------
  // 8. Dropped runtime updates trigger a rehydrate for the selected run.
  // -------------------------------------------------------------------------
  console.log('\n--- runtime recovery: unsubscribed panel rehydrates on updates ---');
  {
    check(sidepanelSource.includes('_delegationUiState.subscribed !== true')
      && sidepanelSource.includes('_delegationForConversation(conversationId) === message.view.delegationId')
      && sidepanelSource.includes('_delegationRuntimeRecoveryPending = true;'),
      'runtime listener rehydrates when an update for the selected run is dropped');
    check(sidepanelSource.includes('await _loadDelegationAnsweredIds();'),
      'panel boot loads the persisted answered set before the first hydrate');
  }

  // -------------------------------------------------------------------------
  // 9. Producer/validator parity. The ledger (delegation-event-store) and the
  //    panel validator (delegation-feed) evolved separately: the ledger accepts
  //    a Claude run's full FSB tool catalog in its init entry, and an entry the
  //    ledger accepted but the feed rejects poisons every snapshot and runtime
  //    update for the whole run. This is the tripwire that was missing.
  // -------------------------------------------------------------------------
  console.log('\n--- producer/validator parity: init tool cap ---');
  {
    const Store = require('../extension/utils/delegation-event-store.js');
    const Feed = require('../extension/ui/delegation-feed.js');
    const Providers = require('../extension/utils/delegation-providers.js');
    const cap = Store.MAX_ALLOWED_TOOLS;
    check(Number.isSafeInteger(cap) && cap >= 64,
      'ledger advertises its allowed-tools cap (' + cap + ')');

    const identity = Providers.createAcceptedAgentIdentity('claude-code', 'unknown');
    function initEntry(toolCount) {
      return {
        v: 1,
        delegationId: DELEGATION_ID,
        sequence: 1,
        timestamp: 1001,
        kind: 'init',
        state: 'running',
        title: 'Agent initialized',
        detail: null,
        init: {
          client: { id: 'claude-code', label: 'Claude Code' },
          profileVersion: '2.1.177',
          model: 'claude-sonnet',
          sessionId: 'session_parity',
          allowedTools: Array.from({ length: toolCount }, function(_v, i) { return 'mcp__fsb__tool_' + i; })
        },
        tool: null,
        retry: null,
        metrics: null
      };
    }
    function parity(toolCount) {
      return {
        v: 1,
        delegationId: DELEGATION_ID,
        acceptedIdentity: identity,
        provider: { id: 'claude-code', label: 'Claude Code' },
        state: 'running',
        connection: 'connected',
        entries: [initEntry(toolCount)],
        summary: null,
        activeTab: null,
        hold: null,
        terminal: null,
        hydrated: true
      };
    }
    check(Feed.validateSnapshot(parity(70)) === true,
      'a realistic Claude init (70 FSB tools) validates in the feed');
    check(Feed.validateSnapshot(parity(cap)) === true,
      'an init at the ledger cap validates in the feed');
    check(Feed.validateSnapshot(parity(cap + 1)) === false,
      'the feed still rejects an init above the ledger cap');
    const view = {
      v: 1,
      delegationId: DELEGATION_ID,
      acceptedIdentity: identity,
      provider: { id: 'claude-code', label: 'Claude Code' },
      state: 'running',
      connection: 'connected',
      lastSequence: 1,
      summary: null,
      activeTab: null,
      hold: null,
      terminal: null
    };
    check(Feed.validateRuntimeUpdate({
      type: 'FSB_DELEGATION_UPDATED',
      view: view,
      entry: initEntry(70),
      announceSequence: 1
    }) === true, 'a runtime update carrying the 70-tool init validates');

    // Terminal answer parity: the controller truncates to the same bound the
    // validator enforces, ellipsis included.
    const controllerSource = fs.readFileSync(path.resolve(__dirname, '../extension/utils/delegation-controller.js'), 'utf8');
    const answerContext = vm.createContext({ Array, String, Object, Number });
    vm.runInContext('var MAX_TERMINAL_ANSWER_CHARS = 4000;', answerContext);
    vm.runInContext(extractNamedFunction(controllerSource, '_terminalAnswerText'), answerContext);
    const longAnswer = vm.runInContext('_terminalAnswerText(' + JSON.stringify('a'.repeat(5000)) + ')', answerContext);
    check(Array.from(longAnswer).length <= 4000,
      'truncated terminal answers stay within the validator bound');
    const terminalSnap = parity(70);
    terminalSnap.state = 'completed';
    terminalSnap.summary = {
      inputTokens: 1, outputTokens: 1, totalTokens: 2, turns: 1, durationMs: 10,
      billingKind: 'subscription', usd: null, toolCalls: [], state: 'completed'
    };
    terminalSnap.terminal = { code: 'completed', releasedTabCount: 0, answer: longAnswer };
    check(Feed.validateSnapshot(terminalSnap) === true,
      'a completed snapshot with a maximum-length answer validates end to end');
  }

  // -------------------------------------------------------------------------
  // 10. The owner chip can say "Claude" from the first render after register.
  // -------------------------------------------------------------------------
  console.log('\n--- register-time client label ---');
  {
    const dispatcherSource = fs.readFileSync(path.resolve(__dirname, '../extension/ws/mcp-tool-dispatcher.js'), 'utf8');
    const labelContext = vm.createContext({});
    vm.runInContext(extractNamedFunction(dispatcherSource, 'canonicalLabelFromClientInfo'), labelContext);
    check(vm.runInContext("canonicalLabelFromClientInfo({ name: 'claude-code', version: '1.0' })", labelContext) === 'Claude'
      && vm.runInContext("canonicalLabelFromClientInfo({ name: 'Codex CLI' })", labelContext) === 'Codex'
      && vm.runInContext('canonicalLabelFromClientInfo(null)', labelContext) === null,
      'clientInfo names canonicalize to chip labels');
    const registerBody = extractFunctionBody(dispatcherSource, 'handleAgentRegisterRoute');
    check(registerBody.includes('canonicalLabelFromClientInfo(clientInfo)')
      && registerBody.includes('_persistAgentClientLabel(agentId, registerLabel)'),
      'agent:register persists the canonical label for the ownership chip');
  }

  // -------------------------------------------------------------------------
  // 11. Terminal commit tears the on-page visual overlay down immediately:
  //     the controller invokes the injected releaseVisualSessions callback
  //     for the bound agent before the terminal emit, and background wires
  //     that callback to the lifecycle store's guarded per-agent clear.
  //     Without this, the overlay lingers until the 60s death alarm.
  // -------------------------------------------------------------------------
  console.log('\n--- terminal overlay teardown ---');
  {
    const controllerSource = fs.readFileSync(path.resolve(__dirname, '../extension/utils/delegation-controller.js'), 'utf8');
    const commitBody = extractFunctionBody(controllerSource, '_commitTerminal');
    const releaseIndex = commitBody.indexOf('releaseVisualSessions({ delegationId: record.delegationId, agentId: record.agentId })');
    const emitIndex = commitBody.indexOf('_emit(record, terminalEntry');
    check(releaseIndex > 0 && emitIndex > releaseIndex,
      '_commitTerminal releases visual sessions for the bound agent before the terminal emit');

    const wiringIndex = backgroundSource.indexOf('releaseVisualSessions: (');
    const wiringSlice = wiringIndex >= 0 ? backgroundSource.slice(wiringIndex, wiringIndex + 900) : '';
    check((backgroundSource.match(/releaseVisualSessions: \(/g) || []).length === 1
      && wiringSlice.includes("typeof MCPVisualSessionLifecycleUtils === 'undefined'")
      && wiringSlice.includes("MCPVisualSessionLifecycleUtils.clearVisualSessionsForAgent(agentId, { reason: 'delegation_terminal' })")
      && wiringSlice.includes('.catch(() => {})'),
      'background wires releaseVisualSessions to the guarded per-agent lifecycle clear');
  }

  console.log('\n' + passed + ' PASS / ' + failed + ' FAIL');
  if (failed > 0) process.exit(1);
})().catch(function(error) {
  console.error(error);
  process.exit(1);
});
