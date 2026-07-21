// Side Panel Script for FSB v0.9.90 - Persistent UI

// Phase 243 plan 03 (UI-02): the sidepanel's surface id (matches the
// legacy:sidepanel agent synthesized by ensureLegacySidepanelAgent below).
// When the active tab is owned by THIS surface, the "owned by ..." chip
// stays hidden -- per CONTEXT D-05, a surface does not announce ownership
// of its own tab.
const MY_SURFACE = 'legacy:sidepanel';

let currentSessionId = null;
let conversationId = null;
let isRunning = false;
let stopRequested = false;
let livenessInterval = null;
let livenessFailCount = 0;
let isHistoryViewActive = false;
let showSidepanelProgressEnabled = true;

// QT-93i-02 (per-tab isRunning) -- replace module-scope global `isRunning`
// + `currentSessionId` with a per-tab Map<tabId, { isRunning, sessionId }>.
//
// Background: today the module-scope flag is GLOBAL across tabs. Dispatching
// a task in tab A then swapping to tab B leaves sendBtn DISABLED on B even
// though B has no in-flight work. After this change, the send button reflects
// THE ACTIVE TAB'S running state; per-tab state for all other working tabs
// is preserved so swapping back to tab A restores its "Working" UI.
//
// Design:
//  - `_tabRunningMap`: keyed by tabId (number). Value: { isRunning: bool,
//    sessionId: string|null }. Entries created lazily on first
//    setRunningState/setIdleState/setErrorState call.
//  - `_activeTabIdSnapshot`: cached active tab id; updated by the
//    chrome.tabs.onActivated handler at line ~786 (Issue B Edit 4 below).
//    Boot-time value resolved by the existing chrome.tabs.query inside
//    DOMContentLoaded.
//  - `getCurrentTabRunningState()`: returns the active tab's entry, or
//    a default {isRunning:false, sessionId:null} if no entry exists yet.
//  - The module-scope `isRunning` + `currentSessionId` are MIRRORS of the
//    active tab's entry, kept in sync by the setters. Existing read sites
//    (updateSendButtonState, keydown handler, stopAutomation, etc.)
//    continue to work without modification.
var _tabRunningMap = new Map();
var _activeTabIdSnapshot = null;

function _getTabRunningEntry(tabId) {
  if (typeof tabId !== 'number') return { isRunning: false, sessionId: null, startedAt: null };
  var entry = _tabRunningMap.get(tabId);
  if (!entry) {
    entry = { isRunning: false, sessionId: null, startedAt: null };
    _tabRunningMap.set(tabId, entry);
  }
  return entry;
}

function getCurrentTabRunningState() {
  if (typeof _activeTabIdSnapshot !== 'number') {
    return { isRunning: false, sessionId: null, startedAt: null };
  }
  return _getTabRunningEntry(_activeTabIdSnapshot);
}

// Internal helper: sync the module-scope `isRunning` + `currentSessionId`
// to whatever the active tab's per-tab entry says. Called by the
// chrome.tabs.onActivated re-sync block (Edit 4) and after every
// setter that mutates the active tab's entry (Edits 2 + 3).
function _syncModuleScopeFromActiveTab() {
  var snap = getCurrentTabRunningState();
  isRunning = !!snap.isRunning;
  currentSessionId = snap.sessionId || null;
}

// QT-93i-regression (Strategy B) -- resolve a tabId by scanning _tabRunningMap
// for an entry whose .sessionId matches. Returns the matching tabId, or
// _activeTabIdSnapshot when no entry is found (defensive fallback so callers
// always get a valid number). Used by session-driven setter call sites
// (stopAutomation reply, liveness orphan, renderAutomationCompletionPayload,
// automationError) to route setIdleState / setErrorState to the OWNING tab
// instead of the currently-active tab. See .planning/debug/qt93i-regression.md.
function _resolveTabIdForSession(sessionId) {
  if (typeof sessionId === 'string' && sessionId.length > 0) {
    var iter = _tabRunningMap.entries();
    var next = iter.next();
    while (!next.done) {
      var tabId = next.value[0];
      var entry = next.value[1];
      if (entry && entry.sessionId === sessionId) return tabId;
      next = iter.next();
    }
  }
  return _activeTabIdSnapshot;
}

// Phase 12 FINT-23 write-through state.
// _messageLogDebouncer: per-convId 200ms debouncer (Plan 12-00 sidecar factory).
//                      Initialized at boot inside DOMContentLoaded.
// _messageLogPendingBuffer: in-memory buffer Map<convId, Array<msg>>.
//                           Accumulates messages between debounced flushes
//                           so a burst of N messages results in 1 storage
//                           write at 200ms after the last call.
var _messageLogDebouncer = null;
var _messageLogPendingBuffer = new Map();
var _lastUserTaskByConversation = new Map();

// Phase 11 debug-phase-11-sidepanel-reopen-empty -- declare module-scope
// thread state that pre-existing renderAutomationCompletionPayload /
// recoverLatestThreadTerminalOutcome scaffolding referenced without ever
// declaring. Without these, any call into that scaffolding throws a
// ReferenceError on first assignment. Defaults are null/no-op so the
// existing scaffolding behaves identically to its prior dead-code state
// until the new hydrate-on-boot path activates it.
let historySessionId = null;
let activeConversationId = null;
let lastRenderedTerminalSessionId = null;

// No-op stub for the pre-existing scaffolding's persist call. Thread
// state today is reconstructable from the per-tab conversation envelope
// + fsbSessionLogs index, so no separate persist surface is needed.
// Wiring a real persistence backend is out of Phase 11 scope; the stub
// keeps renderAutomationCompletionPayload callable without ReferenceError.
function persistSidepanelThreadState() { /* no-op stub -- thread state is derived */ }

// Quick task 260524-7n9 -- chip-owned lock: true while the active tab is owned
// by a non-self agent and the read-only "owned by <ClientName>" chip is showing.
// Composes with updateSendButtonState's existing hasContent / isRunning gating;
// it is an ADDITIONAL gate, never a replacement. Set/cleared exclusively by
// refreshOwnerChip below (no automation-lifecycle setter writes this flag --
// ownership is independent of the running / idle / error state machine).
let _chatLockedByOwnerChip = false;

// Phase 240 D-02: synthesize legacy:sidepanel agentId once per side panel
// load. The side panel is longer-lived than the popup but still gets
// recreated by Chrome on certain events; the registry's
// getOrRegisterLegacyAgent is idempotent on the 'sidepanel' surface so the
// constant 'legacy:sidepanel' agentId is reused across reopens. The
// ownershipToken is null until bindTab fires inside handleStartAutomation
// (D-08 4th site).
let _legacySidepanelAgent = null;
async function ensureLegacySidepanelAgent() {
  if (_legacySidepanelAgent && _legacySidepanelAgent.agentId) return _legacySidepanelAgent;
  try {
    _legacySidepanelAgent = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'ensureLegacyAgent', surface: 'sidepanel' },
        (resp) => resolve(resp || {})
      );
    });
  } catch (_e) {
    _legacySidepanelAgent = null;
  }
  if (!_legacySidepanelAgent || !_legacySidepanelAgent.success) {
    _legacySidepanelAgent = { agentId: null, ownershipToken: null };
  }
  return _legacySidepanelAgent;
}

// Phase 11 FINT-21 -- per-tab conversation state envelope.
//
// Module-scope cache + hydration gate. Event handlers MUST
// `await _envelopeReadyPromise` before touching the envelope so an
// onActivated firing during DOMContentLoaded async boot waits for
// migration to complete (RESEARCH Section 5 race-free pattern).
let tabConvEnvelope = null;
let _envelopeReadyResolve = null;
const _envelopeReadyPromise = new Promise(function (resolve) {
  _envelopeReadyResolve = resolve;
});

function _mintConversationId() {
  return 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

// Phase 11 FINT-21 WR-01 fix -- serialize envelope writes so concurrent
// drop/ensure paths cannot race on the read-mutate-write cycle.
// dropTabConversation (on chrome.tabs.onRemoved) and
// ensureTabConversationForActiveTab (on user send / startNewChat) both
// mutate tabConvEnvelope in place then write the entire envelope back
// to storage. Without serialization a last-writer-wins race can drop
// a just-minted conversationId or resurrect a just-dropped entry.
// Pattern mirrors withRegistryLock in extension/utils/agent-registry.js
// (the .then(fn, fn) shape keeps the chain alive across rejections;
// .catch on the assignment prevents UnhandledRejection leakage).
var _envelopeWriteChain = Promise.resolve();
function _serializeEnvelopeWrite(fn) {
  var next = _envelopeWriteChain.then(fn, fn);
  _envelopeWriteChain = next.catch(function () { /* swallow so chain continues */ });
  return next;
}

async function _persistEnvelope() {
  // Wrap the storage write in the in-flight promise chain so concurrent
  // callers linearize at the storage boundary. Existing call sites keep
  // working unchanged (still fire-and-forget compatible via await).
  return _serializeEnvelopeWrite(async function () {
    try {
      var payload = {};
      payload[FSBSidepanelTabConvStore.STORAGE_KEY] = tabConvEnvelope;
      await chrome.storage.session.set(payload);
    } catch (_e) {
      // Best-effort: storage failures do NOT block UI flow.
    }
  });
}

// Phase 11 FINT-21 -- one-shot boot migration + envelope hydration.
// Idempotent: subsequent boots find legacy key absent + envelope present
// and short-circuit through the sidecar's migration helper.
async function initTabConversationStore() {
  try {
    if (typeof FSBSidepanelTabConvStore === 'undefined'
        || typeof FSBSidepanelTabConvStore.migrateLegacyConversationKey !== 'function') {
      tabConvEnvelope = { v: 1, byTab: {}, lru: [] };
      conversationId = _mintConversationId();
      if (typeof _envelopeReadyResolve === 'function') _envelopeReadyResolve();
      return;
    }
    var activeTabId = null;
    try {
      var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0] && typeof tabs[0].id === 'number') activeTabId = tabs[0].id;
    } catch (_e) { /* swallow */ }

    // QT-93i-02 -- cache active tab id at boot so the per-tab map and
    // setRunningState/setIdleState/setErrorState can resolve "active tab"
    // BEFORE chrome.tabs.onActivated fires for the first time.
    if (activeTabId !== null) {
      _activeTabIdSnapshot = activeTabId;
    }

    tabConvEnvelope = await FSBSidepanelTabConvStore.migrateLegacyConversationKey(
      function (keys) { return chrome.storage.session.get(keys); },
      function (payload) { return chrome.storage.session.set(payload); },
      function (key) { return chrome.storage.session.remove(key); },
      activeTabId
    );

    if (activeTabId !== null) {
      var existing = FSBSidepanelTabConvStore.getTabConversation(tabConvEnvelope, activeTabId);
      if (existing) {
        conversationId = existing;
      } else {
        // D-17 lazy mint: no entry on this tab yet; conversationId remains
        // null until first user message in this tab.
        conversationId = null;
      }
    } else {
      conversationId = null;
    }
  } catch (_e) {
    // Fallback: ensure module continues to boot even if migration fails.
    tabConvEnvelope = { v: 1, byTab: {}, lru: [] };
    conversationId = _mintConversationId();
  } finally {
    if (typeof _envelopeReadyResolve === 'function') _envelopeReadyResolve();
  }
}

// Phase 11 FINT-21 -- swap chat surface to the new tab's conversation
// when chrome.tabs.onActivated fires. Peek-only: does NOT mint (D-17).
// If no entry exists, conversationId is set to null and chatMessages is
// cleared; first send triggers ensureTabConversationForActiveTab().
//
// Phase 11 debug-phase-11-sidepanel-reopen-empty -- when the target tab
// has a bound conversationId, hydrate the chat surface from that
// conversation's persisted session log (same path as boot). Without
// hydrate, swap leaves chatMessages empty even though the underlying
// conversation already has a transcript, which is the same UX problem
// as the boot-reopen-empty bug. With hydrate, swapping back to a tab
// the user has chatted in restores that tab's transcript.
//
// This is consistent with the spirit of RESOLVED Open Question #1 in
// 11-RESEARCH.md (no auto-render of NEW state on swap) -- swap still
// does no work for unminted tabs; only tabs with an EXISTING bound
// conversation render their transcript, and they render the SAME
// transcript that a fresh sidepanel reopen on that tab would.
async function swapToTabConversation(tabId) {
  try {
    await _envelopeReadyPromise;
    if (typeof FSBSidepanelTabConvStore === 'undefined') return;
    if (!FSBSidepanelTabConvStore.isValidEnvelope(tabConvEnvelope)) return;
    var nextConvId = FSBSidepanelTabConvStore.getTabConversation(tabConvEnvelope, tabId);
    if (nextConvId === conversationId) return; // same conversation; no-op
    _delegationUiState.subscribed = false;
    conversationId = nextConvId; // may be null (D-17 lazy mint deferred)
    if (chatMessages && typeof chatMessages.innerHTML !== 'undefined') {
      chatMessages.innerHTML = '';
    }
    // If the target tab has a bound conversation, hydrate its transcript.
    // hydrateChatFromConversationId clears chatMessages internally before
    // rendering, so the manual clear above is harmless (covers the
    // null-convId / unminted-tab case where hydrate early-returns 0).
    if (nextConvId) {
      try { await hydrateChatFromConversationId(nextConvId); } catch (_e) { /* swallow */ }
    }
  } catch (_e) { /* swallow: swap is best-effort */ }
}

// Phase 11 FINT-21 -- drop tab's entry on chrome.tabs.onRemoved (D-14).
// No-op if entry never existed. Persists envelope after drop.
async function dropTabConversation(tabId) {
  try {
    await _envelopeReadyPromise;
    if (typeof FSBSidepanelTabConvStore === 'undefined') return;
    if (!FSBSidepanelTabConvStore.isValidEnvelope(tabConvEnvelope)) return;
    FSBSidepanelTabConvStore.dropTabConversation(tabConvEnvelope, tabId);
    await _persistEnvelope();
  } catch (_e) { /* swallow */ }
}

// Phase 11 FINT-21 -- lazy mint OR touch the active tab's
// conversationId. Persists envelope. Returns the conversationId string.
// When `overwrite` is true, drops the existing entry first (used by
// startNewChat to force a fresh conversation in the current tab).
async function ensureTabConversationForActiveTab(overwrite) {
  try {
    await _envelopeReadyPromise;
    if (typeof FSBSidepanelTabConvStore === 'undefined'
        || !FSBSidepanelTabConvStore.isValidEnvelope(tabConvEnvelope)) {
      var fallback = _mintConversationId();
      conversationId = fallback;
      return fallback;
    }
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs && tabs[0];
    if (!tab || typeof tab.id !== 'number') {
      // Phase 11 FINT-21 WR-02 fix -- surface the no-active-tab edge
      // case in force/overwrite mode so the existing stale entry
      // (e.g., from the previous active tab) becomes visible to
      // telemetry / DevTools. Behavior unchanged: still falls through
      // to noTabFallback mint (no auto-recovery); only adds a console
      // breadcrumb so the rare race (side panel open in inactive
      // window context, brief no-focused-tab window after window
      // close) is no longer silent. The pre-existing entry remains
      // untouched; on next activation swapToTabConversation will
      // restore that conversationId per D-17 lazy-mint semantics.
      if (overwrite === true) {
        console.warn('[sidepanel] ensureTabConversationForActiveTab(force=true) skipped -- no active tab in current window');
      }
      // No active tab; fall back to direct mint (preserves Phase 243 fail-open).
      var noTabFallback = _mintConversationId();
      conversationId = noTabFallback;
      return noTabFallback;
    }
    if (overwrite === true) {
      FSBSidepanelTabConvStore.dropTabConversation(tabConvEnvelope, tab.id);
    }
    var newConvId = FSBSidepanelTabConvStore.ensureTabConversation(
      tabConvEnvelope, tab.id, _mintConversationId
    );
    conversationId = newConvId;
    await _persistEnvelope();
    return newConvId;
  } catch (_e) {
    var errFallback = _mintConversationId();
    conversationId = errFallback;
    return errFallback;
  }
}

async function ensureTabConversationForTab(tabId) {
  try {
    await _envelopeReadyPromise;
    if (!Number.isSafeInteger(tabId)
        || typeof FSBSidepanelTabConvStore === 'undefined'
        || !FSBSidepanelTabConvStore.isValidEnvelope(tabConvEnvelope)) return null;
    var selectedConversationId = FSBSidepanelTabConvStore.ensureTabConversation(
      tabConvEnvelope, tabId, _mintConversationId
    );
    await _persistEnvelope();
    if (_activeTabIdSnapshot === tabId) conversationId = selectedConversationId;
    return selectedConversationId;
  } catch (_error) {
    return null;
  }
}

// Phase 11 debug-phase-11-sidepanel-reopen-empty -- hydrate the chat
// surface from persisted session logs for a given conversationId.
//
// Background: fsbSessionLogs (chrome.storage.local) stores one row per
// session keyed by sessionId, with metadata { conversationId, commands[],
// completionMessage, result, error, outcome, startTime, status }. Follow-
// up commands in the same conversation reuse the same session row (via
// the conversationSessions continuity map in background.js), so commands[]
// represents the user's chronological prompts in that conversation. A new
// conversation produces a new session row that shares the conversationId.
//
// Restore strategy:
//   1. Read fsbSessionIndex (lightweight metadata array) + fsbSessionLogs
//      (full session detail map).
//   2. Filter index entries where conversationId matches the target.
//   3. Sort ascending by startTime (oldest first -- chronological replay).
//   4. For each matching session: replay session.commands[] as 'user'
//      messages, then session.completionMessage (or session.result) as a
//      single 'ai' completion message. Skip empty completions.
//
// Idempotent + race-tolerant: callers may invoke multiple times; each
// call clears chatMessages first then re-renders the full transcript.
// Best-effort: storage failures degrade to no-op (caller proceeds with
// empty chat surface + welcome message as before).
//
// @param {string} convId - conversationId to hydrate; null returns early.
// @returns {Promise<number>} count of session rows rendered (0 if none).
async function hydrateChatFromConversationId(convId) {
  if (!convId || typeof convId !== 'string') return 0;
  if (!chatMessages) return 0;

  // ============================================================
  // Tier 1 (Phase 12 FINT-23): new fsbConversationMessages store.
  // ============================================================
  try {
    if (typeof FSBSidepanelMessageLog !== 'undefined'
        && typeof FSBSidepanelMessageLog.getMessages === 'function'
        && typeof FSBSidepanelMessageLog.STORAGE_KEY === 'string') {
      const bag = await chrome.storage.local.get(FSBSidepanelMessageLog.STORAGE_KEY);
      const envelope = bag[FSBSidepanelMessageLog.STORAGE_KEY];
      const messages = FSBSidepanelMessageLog.getMessages(envelope, convId);
      if (Array.isArray(messages) && messages.length > 0) {
        chatMessages.innerHTML = '';
        const sorted = messages.slice().sort(function (a, b) {
          return (a.timestamp || 0) - (b.timestamp || 0);
        });
        for (var i = 0; i < sorted.length; i++) {
          var m = sorted[i];
          if (m.role === 'user'
              && typeof m.content === 'string'
              && m.content.length > 0
              && typeof _lastUserTaskByConversation !== 'undefined'
              && _lastUserTaskByConversation
              && typeof _lastUserTaskByConversation.set === 'function') {
            _lastUserTaskByConversation.set(convId, m.content);
          }
          renderPersistedMessage(m.content, m.role, m.kind);
        }
        activeConversationId = convId;
        return sorted.length;
      }
    }
  } catch (_e) {
    // fall through to Tier 2
  }

  // ============================================================
  // Tier 2 (b8b761e8 body preserved; addMessage replaced with
  // renderPersistedMessage per Pitfall 3 defense): fsbSessionLogs fallback.
  // ============================================================
  try {
    const stored = await chrome.storage.local.get(['fsbSessionLogs', 'fsbSessionIndex']);
    const sessionStorage = stored.fsbSessionLogs || {};
    const sessionIndex = stored.fsbSessionIndex || [];
    if (!Array.isArray(sessionIndex) || sessionIndex.length === 0) return 0;

    var matching = [];
    for (var i = 0; i < sessionIndex.length; i++) {
      var entry = sessionIndex[i];
      if (entry && entry.conversationId === convId) {
        var detail = (entry.id && sessionStorage[entry.id]) ? sessionStorage[entry.id] : entry;
        matching.push(detail);
      }
    }
    if (matching.length === 0) return 0;

    matching.sort(function (a, b) {
      var aTime = a?.startTime || 0;
      var bTime = b?.startTime || 0;
      return aTime - bTime;
    });

    // Clear chat surface before replay so repeated calls do not duplicate.
    chatMessages.innerHTML = '';

    for (var s = 0; s < matching.length; s++) {
      var session = matching[s] || {};
      var commands = Array.isArray(session.commands) ? session.commands : [];
      if (commands.length === 0 && session.lastTask) commands = [session.lastTask];

      for (var c = 0; c < commands.length; c++) {
        var cmd = commands[c];
        if (typeof cmd === 'string' && cmd.trim().length > 0) {
          if (typeof _lastUserTaskByConversation !== 'undefined'
              && _lastUserTaskByConversation
              && typeof _lastUserTaskByConversation.set === 'function') {
            _lastUserTaskByConversation.set(convId, cmd);
          }
          renderPersistedMessage(cmd, 'user', 'text');
        }
      }

      var completion = session.completionMessage || session.result || '';
      if (typeof completion === 'string' && completion.trim().length > 0) {
        var outcomeStr = typeof session.outcome === 'string' ? session.outcome.toLowerCase() : '';
        var isError = outcomeStr === 'failure' || (session.error && !completion);
        if (isError) {
          renderPersistedMessage(completion, 'assistant', 'error');
        } else {
          renderPersistedMessage(completion, 'assistant', 'text');
        }
      } else if (session.error && typeof session.error === 'string' && session.error.trim().length > 0) {
        renderPersistedMessage(session.error, 'assistant', 'error');
      }
    }

    var latest = matching[matching.length - 1];
    if (latest && latest.id) {
      lastRenderedTerminalSessionId = latest.id;
      historySessionId = latest.historySessionId || latest.id;
    }
    activeConversationId = convId;

    return matching.length;
  } catch (_e) {
    // ============================================================
    // Tier 3: empty render (caller fires welcome message).
    // ============================================================
    return 0;
  }
}

// DOM elements - adapted for side panel
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const newChatBtn = document.getElementById('newChatBtn');
const settingsBtn = document.getElementById('settingsBtn');
const chatMessages = document.getElementById('chatMessages');
const historyBtn = document.getElementById('historyBtn');
const micBtn = document.getElementById('micBtn');
const statusDot = document.querySelector('.status-dot');
const statusText = document.querySelector('.status-text');
const automationRunner = document.getElementById('automationRunner');
const automationTimer = document.getElementById('automationTimer');
const automationRunnerLabel = document.getElementById('automationRunnerLabel');

var DELEGATION_CONVERSATION_STORAGE_KEY = 'fsbSidepanelDelegationConversations';
var DELEGATION_CONVERSATION_CAP = 50;
var DELEGATION_UNBOUND_CLEANUP_CAP = 8;
var DELEGATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
var DELEGATION_CONVERSATION_ID_PATTERN = /^conv_[A-Za-z0-9_-]{1,250}$/;
var DELEGATION_NATIVE_WAKE_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
var _delegationConversationEnvelope = { v: 1, byConversation: {}, lru: [] };
var _delegationBindingWriteChain = Promise.resolve();
// Binding failures cannot be written to session storage by definition. Keep
// their exact cleanup authority only in this process, scoped to the tab and
// conversation that started the run, until a same-id Stop proves settlement.
var _delegationUnboundCleanupByOrigin = new Map();
var _delegationHydrationGeneration = 0;
var _delegationRunStopControls = [];
var _delegationElapsedInterval = null;
var _delegationComposerEditRevision = 0;
var _delegationIntentFallbackCounter = 0;

// Phase 61 delegated-run presentation state. This object tracks only which
// canonical background snapshot belongs to the selected conversation and
// which exact delivery identities were already announced. It never derives
// lifecycle state from provider output, chat history, registry storage, or
// presentation strings.
var _delegationUiState = {
  delegationId: null,
  conversationId: null,
  snapshot: null,
  mode: 'ready',
  task: null,
  providerId: null,
  providerLabel: null,
  challengeId: null,
  challengeExpiresAt: null,
  errorCode: null,
  pendingPreflight: false,
  pendingContinuation: false,
  pendingIntentId: null,
  pendingAttemptId: null,
  pendingTask: null,
  pendingRawText: null,
  pendingEditRevision: null,
  checkingIntentId: null,
  pendingStart: false,
  pendingTrust: false,
  pendingTake: false,
  pendingResume: false,
  pendingStop: false,
  bindingCleanupPending: false,
  bindingCleanupOriginKey: null,
  composerLocked: false,
  lastRenderedSequence: null,
  lastAlertKey: null,
  announced: Object.create(null),
  announcedTransitions: Object.create(null),
  subscribed: false
};

function _delegationHasExactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  var actual = Object.keys(value).sort();
  var expected = keys.slice().sort();
  if (actual.length !== expected.length) return false;
  for (var index = 0; index < expected.length; index++) {
    if (actual[index] !== expected[index]) return false;
  }
  return true;
}

function _delegationOwnDataValue(value, key) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return undefined;
  }
  try {
    var descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ? descriptor.value
      : undefined;
  } catch (_error) {
    return undefined;
  }
}

function _delegationCanonicalProvider(providerId, providerLabel, allowIdOnly) {
  var helper = typeof FsbDelegationProviders !== 'undefined'
    ? FsbDelegationProviders
    : null;
  var get = _delegationOwnDataValue(helper, 'get');
  if (typeof get !== 'function'
      || typeof providerId !== 'string'
      || (typeof providerLabel !== 'string' && allowIdOnly !== true)) return null;
  var metadata = null;
  try { metadata = get.call(helper, providerId); }
  catch (_error) { return null; }
  var canonicalId = _delegationOwnDataValue(metadata, 'id');
  var canonicalLabel = _delegationOwnDataValue(metadata, 'label');
  var billingKind = _delegationOwnDataValue(metadata, 'billingKind');
  if (canonicalId !== providerId
      || (allowIdOnly !== true && canonicalLabel !== providerLabel)
      || (billingKind !== 'subscription' && billingKind !== 'unknown')) return null;
  return { id: canonicalId, label: canonicalLabel, billingKind: billingKind };
}

function _delegationValidPreflightResponse(value) {
  if (!value || typeof value !== 'object') return false;
  var ok = _delegationOwnDataValue(value, 'ok');
  var kind = _delegationOwnDataValue(value, 'kind');
  if (ok === true && kind === 'agent') {
    return _delegationHasExactKeys(value, ['kind', 'ok', 'providerId', 'providerLabel'])
      && _delegationCanonicalProvider(
        _delegationOwnDataValue(value, 'providerId'),
        _delegationOwnDataValue(value, 'providerLabel')
      ) !== null;
  }
  if (ok === true && kind === 'api') {
    return _delegationHasExactKeys(value, ['agentProviderId', 'kind', 'ok', 'providerId'])
      && typeof _delegationOwnDataValue(value, 'providerId') === 'string'
      && _delegationOwnDataValue(value, 'agentProviderId') === '';
  }
  if (ok !== false
      || !_delegationHasExactKeys(value, ['code', 'ok', 'providerId', 'providerLabel'])
      || typeof _delegationOwnDataValue(value, 'code') !== 'string') return false;
  var providerId = _delegationOwnDataValue(value, 'providerId');
  var providerLabel = _delegationOwnDataValue(value, 'providerLabel');
  return (providerId === '' && providerLabel === 'Selected provider')
    || _delegationCanonicalProvider(providerId, providerLabel) !== null;
}

function _createDelegationIntentId() {
  var cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    var uuidIntentId = 'intent_' + cryptoApi.randomUUID().replace(/-/g, '');
    if (DELEGATION_NATIVE_WAKE_ID_PATTERN.test(uuidIntentId)) return uuidIntentId;
  }
  _delegationIntentFallbackCounter += 1;
  var fallbackIntentId = 'intent_fallback_'
    + Date.now().toString(36)
    + '_'
    + _delegationIntentFallbackCounter.toString(36);
  return DELEGATION_NATIVE_WAKE_ID_PATTERN.test(fallbackIntentId)
    ? fallbackIntentId
    : null;
}

function _beginDelegationPreflightIntent(intentId, task, rawText, editRevision) {
  if (typeof intentId !== 'string'
      || !DELEGATION_NATIVE_WAKE_ID_PATTERN.test(intentId)
      || typeof task !== 'string'
      || task.length === 0
      || typeof rawText !== 'string'
      || rawText.trim() !== task
      || !Number.isSafeInteger(editRevision)
      || editRevision < 0) return false;
  _delegationUiState.pendingPreflight = true;
  _delegationUiState.pendingContinuation = false;
  _delegationUiState.pendingIntentId = intentId;
  _delegationUiState.pendingAttemptId = null;
  _delegationUiState.pendingTask = task;
  _delegationUiState.pendingRawText = rawText;
  _delegationUiState.pendingEditRevision = editRevision;
  _delegationUiState.checkingIntentId = null;
  return true;
}

function _delegationIntentIsCurrent(intentId) {
  return typeof intentId === 'string'
    && DELEGATION_NATIVE_WAKE_ID_PATTERN.test(intentId)
    && _delegationUiState.pendingIntentId === intentId
    && typeof _delegationUiState.pendingRawText === 'string'
    && typeof _delegationUiState.pendingTask === 'string'
    && _delegationUiState.pendingRawText.trim() === _delegationUiState.pendingTask
    && _delegationUiState.pendingEditRevision === _delegationComposerEditRevision
    && chatInput.textContent === _delegationUiState.pendingRawText;
}

function _delegationPreflightIntentIsCurrent(intentId) {
  return _delegationUiState.pendingPreflight === true
    && _delegationIntentIsCurrent(intentId);
}

function _delegationContinuationIntentIsCurrent(intentId) {
  return _delegationUiState.pendingContinuation === true
    && _delegationIntentIsCurrent(intentId);
}

function _clearDelegationPreflightIntent(intentId) {
  if (_delegationUiState.pendingIntentId !== intentId) return false;
  var clearChecking = _delegationUiState.checkingIntentId === intentId
    && _delegationUiState.mode === 'native-wake-checking';
  _delegationUiState.pendingPreflight = false;
  _delegationUiState.pendingContinuation = false;
  _delegationUiState.pendingIntentId = null;
  _delegationUiState.pendingAttemptId = null;
  _delegationUiState.pendingTask = null;
  _delegationUiState.pendingRawText = null;
  _delegationUiState.pendingEditRevision = null;
  _delegationUiState.checkingIntentId = null;
  if (clearChecking) _renderDelegationReadyState();
  return true;
}

function _continueDelegationPreflightIntent(intentId) {
  if (!_delegationPreflightIntentIsCurrent(intentId)) return false;
  var clearChecking = _delegationUiState.checkingIntentId === intentId
    && _delegationUiState.mode === 'native-wake-checking';
  _delegationUiState.pendingPreflight = false;
  _delegationUiState.pendingContinuation = true;
  _delegationUiState.pendingAttemptId = null;
  _delegationUiState.checkingIntentId = null;
  if (clearChecking) _renderDelegationReadyState();
  return true;
}

function _delegationValidConsentResponse(value) {
  if (!_delegationHasExactKeys(value, [
    'challengeId', 'expiresAt', 'ok', 'providerId', 'providerLabel', 'trusted'
  ])) return false;
  return _delegationOwnDataValue(value, 'ok') === true
    && _delegationCanonicalProvider(
      _delegationOwnDataValue(value, 'providerId'),
      _delegationOwnDataValue(value, 'providerLabel')
    ) !== null
    && typeof _delegationOwnDataValue(value, 'trusted') === 'boolean';
}

function _delegationValidTrustResponse(value, providerId) {
  if (value && _delegationOwnDataValue(value, 'ok') === true) {
    return _delegationHasExactKeys(value, ['ok', 'providerId', 'trusted'])
      && _delegationCanonicalProvider(
        _delegationOwnDataValue(value, 'providerId'),
        undefined,
        true
      ) !== null
      && _delegationOwnDataValue(value, 'providerId') === providerId
      && _delegationOwnDataValue(value, 'trusted') === true;
  }
  return _delegationHasExactKeys(value, ['code', 'ok'])
    && _delegationOwnDataValue(value, 'ok') === false
    && typeof _delegationOwnDataValue(value, 'code') === 'string';
}

function _delegationValidLifecycleResponse(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.ok === true) {
    return _delegationHasExactKeys(value, ['ok', 'snapshot'])
      && typeof FsbDelegationFeed !== 'undefined'
      && FsbDelegationFeed.validateSnapshot(value.snapshot);
  }
  return _delegationHasExactKeys(value, ['code', 'ok', 'snapshot'])
    && value.ok === false
    && typeof value.code === 'string'
    && (value.snapshot === null
      || (typeof FsbDelegationFeed !== 'undefined'
        && FsbDelegationFeed.validateSnapshot(value.snapshot)));
}

function _delegationStopProvesTerminal(response, delegationId) {
  if (!_delegationValidLifecycleResponse(response)
      || response.ok !== true
      || !response.snapshot
      || response.snapshot.delegationId !== delegationId
      || !response.snapshot.terminal
      || response.snapshot.terminal.code === 'tree_unsettled') return false;
  return response.snapshot.state === 'completed'
    || response.snapshot.state === 'failed'
    || response.snapshot.state === 'stopped'
    || response.snapshot.state === 'restart_lost';
}

function _delegationExactStopSnapshot(response, delegationId, fallbackSnapshot) {
  return _delegationValidLifecycleResponse(response)
    && response.snapshot
    && response.snapshot.delegationId === delegationId
    ? response.snapshot
    : fallbackSnapshot;
}

function _delegationValidSnapshotResponse(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.ok === true) {
    return _delegationHasExactKeys(value, ['ok', 'snapshot'])
      && (value.snapshot === null
        || (typeof FsbDelegationFeed !== 'undefined'
          && FsbDelegationFeed.validateSnapshot(value.snapshot)));
  }
  return _delegationHasExactKeys(value, ['code', 'ok', 'snapshot'])
    && value.ok === false
    && typeof value.code === 'string'
    && (value.snapshot === null
      || (typeof FsbDelegationFeed !== 'undefined'
        && FsbDelegationFeed.validateSnapshot(value.snapshot)));
}

function _delegationEmptyConversationEnvelope() {
  return { v: 1, byConversation: {}, lru: [] };
}

function _delegationValidConversationId(value) {
  return typeof value === 'string'
    && DELEGATION_CONVERSATION_ID_PATTERN.test(value);
}

function _delegationUnboundCleanupKey(tabId, selectedConversationId) {
  if (!Number.isSafeInteger(tabId)
      || tabId < 0
      || (selectedConversationId !== null
        && !_delegationValidConversationId(selectedConversationId))) return null;
  return String(tabId) + ':' + (selectedConversationId === null
    ? '<no-conversation>'
    : selectedConversationId);
}

function _delegationRememberUnboundCleanup(
  tabId,
  selectedConversationId,
  snapshot,
  task,
  pendingStop
) {
  var key = _delegationUnboundCleanupKey(tabId, selectedConversationId);
  if (!key
      || typeof FsbDelegationFeed === 'undefined'
      || !FsbDelegationFeed.validateSnapshot(snapshot)
      || typeof task !== 'string') return null;
  var current = _delegationUnboundCleanupByOrigin.get(key);
  if (current
      && current.reserved !== true
      && current.delegationId !== snapshot.delegationId) return null;
  _delegationUnboundCleanupByOrigin.delete(key);
  _delegationUnboundCleanupByOrigin.set(key, {
    tabId: tabId,
    conversationId: selectedConversationId,
    delegationId: snapshot.delegationId,
    snapshot: snapshot,
    task: task,
    pendingStop: pendingStop === true,
    reserved: false
  });
  return key;
}

function _delegationUpdateUnboundCleanup(key, delegationId, snapshot, task, pendingStop) {
  var current = key ? _delegationUnboundCleanupByOrigin.get(key) : null;
  if (!current
      || current.delegationId !== delegationId
      || !snapshot
      || snapshot.delegationId !== delegationId) return false;
  return _delegationRememberUnboundCleanup(
    current.tabId,
    current.conversationId,
    snapshot,
    task,
    pendingStop
  ) === key;
}

function _delegationForgetUnboundCleanup(key, delegationId) {
  var current = key ? _delegationUnboundCleanupByOrigin.get(key) : null;
  if (!current || current.delegationId !== delegationId) return false;
  return _delegationUnboundCleanupByOrigin.delete(key);
}

function _delegationUnboundCleanupForSelection(tabId, selectedConversationId) {
  var key = _delegationUnboundCleanupKey(tabId, selectedConversationId);
  var record = key ? _delegationUnboundCleanupByOrigin.get(key) : null;
  return record && record.reserved !== true ? record : null;
}

function _delegationOriginIsSelected(tabId, selectedConversationId) {
  return tabId === _activeTabIdSnapshot && selectedConversationId === conversationId;
}

function _delegationReserveUnboundCleanup(tabId, selectedConversationId) {
  var key = _delegationUnboundCleanupKey(tabId, selectedConversationId);
  if (key === null
      || _delegationUnboundCleanupByOrigin.has(key)
      || _delegationUnboundCleanupByOrigin.size >= DELEGATION_UNBOUND_CLEANUP_CAP) return null;
  _delegationUnboundCleanupByOrigin.set(key, {
    tabId: tabId,
    conversationId: selectedConversationId,
    delegationId: null,
    snapshot: null,
    task: null,
    pendingStop: false,
    reserved: true
  });
  return key;
}

function _delegationMoveCleanupReservation(key, tabId, selectedConversationId) {
  var current = key ? _delegationUnboundCleanupByOrigin.get(key) : null;
  var nextKey = _delegationUnboundCleanupKey(tabId, selectedConversationId);
  if (!current || current.reserved !== true || nextKey === null) return null;
  if (nextKey === key) return key;
  if (_delegationUnboundCleanupByOrigin.has(nextKey)) return null;
  _delegationUnboundCleanupByOrigin.delete(key);
  current.tabId = tabId;
  current.conversationId = selectedConversationId;
  _delegationUnboundCleanupByOrigin.set(nextKey, current);
  return nextKey;
}

function _delegationReleaseCleanupReservation(key) {
  var current = key ? _delegationUnboundCleanupByOrigin.get(key) : null;
  if (!current || current.reserved !== true) return false;
  return _delegationUnboundCleanupByOrigin.delete(key);
}

function _delegationValidConversationEnvelope(value) {
  if (!_delegationHasExactKeys(value, ['byConversation', 'lru', 'v'])
      || value.v !== 1
      || !value.byConversation
      || typeof value.byConversation !== 'object'
      || Array.isArray(value.byConversation)
      || !Array.isArray(value.lru)
      || value.lru.length > DELEGATION_CONVERSATION_CAP) return false;
  var keys = Object.keys(value.byConversation);
  if (keys.length !== value.lru.length || keys.length > DELEGATION_CONVERSATION_CAP) return false;
  var seen = Object.create(null);
  for (var index = 0; index < value.lru.length; index++) {
    var conversationKey = value.lru[index];
    if (!_delegationValidConversationId(conversationKey)
        || seen[conversationKey]
        || !Object.prototype.hasOwnProperty.call(value.byConversation, conversationKey)
        || typeof value.byConversation[conversationKey] !== 'string'
        || !DELEGATION_ID_PATTERN.test(value.byConversation[conversationKey])) return false;
    seen[conversationKey] = true;
  }
  return true;
}

function _delegationCloneConversationEnvelope(value) {
  return JSON.parse(JSON.stringify(value));
}

async function _loadDelegationConversationEnvelope() {
  try {
    var stored = await chrome.storage.session.get(DELEGATION_CONVERSATION_STORAGE_KEY);
    var candidate = stored && stored[DELEGATION_CONVERSATION_STORAGE_KEY];
    _delegationConversationEnvelope = _delegationValidConversationEnvelope(candidate)
      ? _delegationCloneConversationEnvelope(candidate)
      : _delegationEmptyConversationEnvelope();
  } catch (_error) {
    _delegationConversationEnvelope = _delegationEmptyConversationEnvelope();
  }
  return _delegationConversationEnvelope;
}

function _delegationForConversation(selectedConversationId) {
  if (!_delegationValidConversationId(selectedConversationId)
      || !_delegationValidConversationEnvelope(_delegationConversationEnvelope)) return null;
  var delegationId = _delegationConversationEnvelope.byConversation[selectedConversationId];
  return typeof delegationId === 'string' && DELEGATION_ID_PATTERN.test(delegationId)
    ? delegationId
    : null;
}

function _serializeDelegationBindingWrite(operation) {
  var next = _delegationBindingWriteChain.then(operation, operation);
  _delegationBindingWriteChain = next.catch(function() { /* keep later writes live */ });
  return next;
}

function _writeDelegationConversationBinding(selectedConversationId, delegationId) {
  if (!_delegationValidConversationId(selectedConversationId)
      || typeof delegationId !== 'string'
      || !DELEGATION_ID_PATTERN.test(delegationId)) return Promise.resolve(false);
  return _serializeDelegationBindingWrite(async function() {
    try {
      var stored = await chrome.storage.session.get(DELEGATION_CONVERSATION_STORAGE_KEY);
      var current = stored && stored[DELEGATION_CONVERSATION_STORAGE_KEY];
      var envelope = _delegationValidConversationEnvelope(current)
        ? _delegationCloneConversationEnvelope(current)
        : _delegationEmptyConversationEnvelope();
      envelope.byConversation[selectedConversationId] = delegationId;
      var existingIndex = envelope.lru.indexOf(selectedConversationId);
      if (existingIndex !== -1) envelope.lru.splice(existingIndex, 1);
      envelope.lru.unshift(selectedConversationId);
      while (envelope.lru.length > DELEGATION_CONVERSATION_CAP) {
        var evicted = envelope.lru.pop();
        delete envelope.byConversation[evicted];
      }
      var payload = {};
      payload[DELEGATION_CONVERSATION_STORAGE_KEY] = envelope;
      await chrome.storage.session.set(payload);
      _delegationConversationEnvelope = envelope;
      return true;
    } catch (_error) {
      return false;
    }
  });
}

function _removeDelegationConversationBinding(selectedConversationId) {
  if (!_delegationValidConversationId(selectedConversationId)) return Promise.resolve(false);
  return _serializeDelegationBindingWrite(async function() {
    try {
      var stored = await chrome.storage.session.get(DELEGATION_CONVERSATION_STORAGE_KEY);
      var current = stored && stored[DELEGATION_CONVERSATION_STORAGE_KEY];
      var envelope = _delegationValidConversationEnvelope(current)
        ? _delegationCloneConversationEnvelope(current)
        : _delegationEmptyConversationEnvelope();
      delete envelope.byConversation[selectedConversationId];
      var existingIndex = envelope.lru.indexOf(selectedConversationId);
      if (existingIndex !== -1) envelope.lru.splice(existingIndex, 1);
      var payload = {};
      payload[DELEGATION_CONVERSATION_STORAGE_KEY] = envelope;
      await chrome.storage.session.set(payload);
      _delegationConversationEnvelope = envelope;
      return true;
    } catch (_error) {
      return false;
    }
  });
}

function _ensureDelegationMount() {
  var run = document.getElementById('delegationRun');
  if (run) {
    return {
      run: run,
      state: document.getElementById('delegationStateCard'),
      feed: document.getElementById('delegationFeed'),
      announcer: document.getElementById('delegationAnnouncer'),
      control: document.getElementById('delegationControlBar')
    };
  }
  run = document.createElement('section');
  run.id = 'delegationRun';
  run.className = 'delegation-run hidden';
  run.setAttribute('data-runtime-contract', 'FSB_DELEGATION');
  run.setAttribute('aria-labelledby', 'delegationRunHeading');
  run.setAttribute('aria-busy', 'false');
  var state = document.createElement('div');
  state.id = 'delegationStateCard';
  state.className = 'delegation-state-card';
  var feed = document.createElement('div');
  feed.id = 'delegationFeed';
  feed.className = 'delegation-feed';
  run.appendChild(state);
  run.appendChild(feed);
  if (chatMessages.firstChild) chatMessages.insertBefore(run, chatMessages.firstChild);
  else chatMessages.appendChild(run);
  return {
    run: run,
    state: state,
    feed: feed,
    announcer: document.getElementById('delegationAnnouncer'),
    control: document.getElementById('delegationControlBar')
  };
}

function _clearDelegationNode(node) {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
}

function _delegationElement(tagName, className, textValue) {
  var element = document.createElement(tagName);
  if (className) element.className = className;
  if (textValue !== undefined && textValue !== null) {
    element.textContent = String(textValue);
  }
  return element;
}

function _delegationToneForSnapshot(snapshot) {
  if (!snapshot) return 'neutral';
  var terminalCode = snapshot.terminal ? snapshot.terminal.code : null;
  if (snapshot.state === 'failed'
      || snapshot.state === 'restart_lost'
      || snapshot.state === 'stopping'
      || snapshot.connection === 'offline'
      || snapshot.connection === 'disconnected'
      || terminalCode === 'agent_offline'
      || terminalCode === 'daemon_restart_lost_run') return 'danger';
  if (snapshot.state === 'held' || snapshot.state === 'resuming') return 'warning';
  if (snapshot.state === 'completed') return 'success';
  if (snapshot.state === 'starting'
      || snapshot.state === 'running'
      || snapshot.state === 'holding') return 'active';
  return 'neutral';
}

function _delegationSemanticIcon(tone) {
  var iconClass = tone === 'active' ? 'fa-circle-play'
    : (tone === 'success' ? 'fa-circle-check'
      : (tone === 'warning' ? 'fa-hand'
        : (tone === 'danger' ? 'fa-circle-exclamation' : 'fa-circle-info')));
  var icon = _delegationElement(
    'i',
    'fa ' + iconClass + ' delegation-semantic-icon'
  );
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function _delegationSemanticHeading(tagName, className, textValue, tone) {
  var heading = _delegationElement(
    tagName,
    className + ' delegation-semantic-heading'
  );
  heading.appendChild(_delegationSemanticIcon(tone));
  heading.appendChild(_delegationElement('span', 'delegation-heading-copy', textValue));
  return heading;
}

function _clearDelegationElapsedTimer() {
  if (_delegationElapsedInterval !== null) {
    clearInterval(_delegationElapsedInterval);
    _delegationElapsedInterval = null;
  }
}

function _delegationPersistedStartAt(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.entries) || snapshot.entries.length === 0) {
    return null;
  }
  var startedAt = null;
  for (var index = 0; index < snapshot.entries.length; index++) {
    var timestamp = snapshot.entries[index] && snapshot.entries[index].timestamp;
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) continue;
    if (startedAt === null || timestamp < startedAt) startedAt = timestamp;
  }
  return startedAt;
}

function _formatDelegationElapsed(startedAt, nowValue) {
  if (!Number.isSafeInteger(startedAt)
      || startedAt < 0
      || !Number.isFinite(nowValue)) return 'Not reported';
  var elapsedSeconds = Math.floor(Math.max(0, nowValue - startedAt) / 1000);
  var hours = Math.floor(elapsedSeconds / 3600);
  var minutes = Math.floor((elapsedSeconds % 3600) / 60);
  var seconds = elapsedSeconds % 60;
  if (hours > 0) {
    return hours + 'h ' + String(minutes).padStart(2, '0') + 'm';
  }
  if (minutes > 0) {
    return minutes + 'm ' + String(seconds).padStart(2, '0') + 's';
  }
  return seconds + 's';
}

function _updateDelegationElapsed(node, startedAt) {
  if (!node) return;
  node.textContent = _formatDelegationElapsed(startedAt, Date.now());
}

function _syncDelegationElapsedTimer(snapshot, node) {
  _clearDelegationElapsedTimer();
  var startedAt = _delegationPersistedStartAt(snapshot);
  _updateDelegationElapsed(node, startedAt);
  if (startedAt === null
      || !_delegationIsActiveSnapshot(snapshot)
      || snapshot.connection !== 'connected') return;
  var delegationId = snapshot.delegationId;
  _delegationElapsedInterval = setInterval(function() {
    var current = _delegationUiState.snapshot;
    if (!current
        || current.delegationId !== delegationId
        || !_delegationIsActiveSnapshot(current)) {
      _clearDelegationElapsedTimer();
      return;
    }
    _updateDelegationElapsed(node, startedAt);
  }, 1000);
}

function _applyDelegationSnapshotTone(container, snapshot, toneOverride) {
  if (!container || !snapshot) return;
  var tone = toneOverride || _delegationToneForSnapshot(snapshot);
  container.className = 'delegation-state-card delegation-tone-' + tone;
  container.setAttribute('data-delegation-state', snapshot.state);
  container.setAttribute('data-delegation-tone', tone);
}

function _delegationAction(label, className, handler) {
  var button = _delegationElement(
    'button',
    'delegation-action' + (className ? ' ' + className : ''),
    label
  );
  button.type = 'button';
  if (typeof handler === 'function') button.addEventListener('click', handler);
  return button;
}

function _delegationIsSelectedConversation() {
  return _delegationUiState.conversationId === conversationId;
}

function _setDelegationHeaderStatus(label, tone) {
  if (statusText) statusText.textContent = label;
  if (!statusDot || !statusDot.classList) return;
  statusDot.classList.remove('running', 'error');
  if (tone === 'running') statusDot.classList.add('running');
  if (tone === 'error') statusDot.classList.add('error');
}

function _applyDelegationComposerLock() {
  var locked = _delegationUiState.composerLocked === true;
  if (chatInput && !_chatLockedByOwnerChip) {
    chatInput.setAttribute('contenteditable', locked ? 'false' : 'true');
    if (locked) chatInput.setAttribute('aria-disabled', 'true');
    else chatInput.removeAttribute('aria-disabled');
  }
  if (micBtn && !_chatLockedByOwnerChip) {
    micBtn.disabled = locked;
    if (locked) micBtn.setAttribute('aria-disabled', 'true');
    else micBtn.removeAttribute('aria-disabled');
  }
  updateSendButtonState();
  _syncDelegationStopControls(_delegationUiState.snapshot);
}

function _setDelegationComposerLocked(locked) {
  _delegationUiState.composerLocked = locked === true;
  _applyDelegationComposerLock();
}

function _sendDelegationCommand(message) {
  return new Promise(function(resolve) {
    try {
      chrome.runtime.sendMessage(message, function(response) {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, code: 'runtime_unavailable', snapshot: null });
          return;
        }
        resolve(response || { ok: false, code: 'empty_response', snapshot: null });
      });
    } catch (_error) {
      resolve({ ok: false, code: 'runtime_unavailable', snapshot: null });
    }
  });
}

function _hideDelegationPresentation() {
  _clearDelegationElapsedTimer();
  var mount = _ensureDelegationMount();
  if (mount.run) mount.run.classList.add('hidden');
  if (mount.control) {
    _clearDelegationNode(mount.control);
    mount.control.classList.add('hidden');
  }
  _delegationRunStopControls = [];
  _restoreLegacyStopControl();
}

function _renderDelegationReadyState() {
  _clearDelegationElapsedTimer();
  var mount = _ensureDelegationMount();
  if (!mount.run || !mount.state || !mount.feed) return;
  _delegationUiState.mode = 'ready';
  _delegationUiState.errorCode = null;
  mount.run.classList.remove('hidden');
  mount.run.setAttribute('aria-busy', 'false');
  _clearDelegationNode(mount.state);
  _clearDelegationNode(mount.feed);
  mount.state.removeAttribute('role');
  mount.state.removeAttribute('aria-live');
  _delegationUiState.lastAlertKey = null;
  _delegationRunStopControls = [];
  _restoreLegacyStopControl();
  var heading = _delegationElement(
    'h2', 'delegation-state-heading', 'Delegate a browser task'
  );
  heading.id = 'delegationRunHeading';
  mount.state.appendChild(heading);
  mount.state.appendChild(_delegationElement(
    'p',
    'delegation-state-body',
    'Choose an agent provider, describe the outcome, and FSB will run it in a background tab.'
  ));
  if (mount.control) {
    _clearDelegationNode(mount.control);
    mount.control.classList.add('hidden');
  }
  _setDelegationHeaderStatus('Ready');
  _setDelegationComposerLocked(false);
}

function _resetDelegationSelection(selectedConversationId) {
  _delegationUiState.delegationId = null;
  _delegationUiState.conversationId = selectedConversationId;
  _delegationUiState.snapshot = null;
  _delegationUiState.mode = 'ready';
  _delegationUiState.task = null;
  _delegationUiState.providerId = null;
  _delegationUiState.providerLabel = null;
  _delegationUiState.challengeId = null;
  _delegationUiState.challengeExpiresAt = null;
  _delegationUiState.errorCode = null;
  _delegationUiState.pendingPreflight = false;
  _delegationUiState.pendingContinuation = false;
  _delegationUiState.pendingIntentId = null;
  _delegationUiState.pendingAttemptId = null;
  _delegationUiState.pendingTask = null;
  _delegationUiState.pendingRawText = null;
  _delegationUiState.pendingEditRevision = null;
  _delegationUiState.checkingIntentId = null;
  _delegationUiState.pendingStart = false;
  _delegationUiState.pendingTrust = false;
  _delegationUiState.pendingTake = false;
  _delegationUiState.pendingResume = false;
  _delegationUiState.pendingStop = false;
  _delegationUiState.bindingCleanupPending = false;
  _delegationUiState.bindingCleanupOriginKey = null;
  _delegationUiState.lastRenderedSequence = null;
  _delegationUiState.lastAlertKey = null;
  _delegationUiState.announced = Object.create(null);
  _delegationUiState.announcedTransitions = Object.create(null);
  _delegationUiState.subscribed = false;
  _clearDelegationElapsedTimer();
}

async function _hydrateDelegationForSelectedConversation() {
  var selectedConversationId = conversationId;
  var hydrationGeneration = ++_delegationHydrationGeneration;
  var selectedDelegationId = _delegationForConversation(selectedConversationId);
  _resetDelegationSelection(selectedConversationId);

  var unboundCleanup = _delegationUnboundCleanupForSelection(
    _activeTabIdSnapshot,
    selectedConversationId
  );
  if (unboundCleanup) {
    _retainUnboundDelegationCleanup(
      unboundCleanup.snapshot,
      unboundCleanup.task,
      _delegationUnboundCleanupKey(_activeTabIdSnapshot, selectedConversationId),
      unboundCleanup.pendingStop
    );
    return true;
  }

  var response = await _sendDelegationCommand({
    type: 'FSB_DELEGATION_SNAPSHOT',
    delegationId: selectedDelegationId
  });
  if (hydrationGeneration !== _delegationHydrationGeneration
      || selectedConversationId !== conversationId) return false;

  if (!_delegationValidSnapshotResponse(response)
      || response.ok !== true
      || (selectedDelegationId === null && response.snapshot !== null)
      || (selectedDelegationId !== null
        && (!response.snapshot || response.snapshot.delegationId !== selectedDelegationId))) {
    if (_delegationValidSnapshotResponse(response)
        && response.ok === false
        && response.code === 'delegation_mismatch'
        && selectedDelegationId !== null) {
      await _removeDelegationConversationBinding(selectedConversationId);
      if (hydrationGeneration !== _delegationHydrationGeneration
          || selectedConversationId !== conversationId) return false;
    }
    _resetDelegationSelection(selectedConversationId);
    _renderDelegationReadyState();
    _delegationUiState.subscribed = true;
    return false;
  }

  if (response.snapshot === null) {
    _renderDelegationReadyState();
    _delegationUiState.subscribed = true;
    return true;
  }

  _delegationUiState.delegationId = selectedDelegationId;
  _delegationUiState.providerId = response.snapshot.provider
    ? response.snapshot.provider.id
    : null;
  _delegationUiState.providerLabel = response.snapshot.provider
    ? response.snapshot.provider.label
    : null;
  _delegationUiState.task = _lastUserTaskByConversation.has(selectedConversationId)
    ? _lastUserTaskByConversation.get(selectedConversationId)
    : null;
  var rendered = _renderDelegationSnapshot(response.snapshot, {
    hydrated: true,
    announceSequence: null
  });
  if (!rendered) {
    _resetDelegationSelection(selectedConversationId);
    _renderDelegationReadyState();
    _delegationUiState.subscribed = true;
    return false;
  }
  // The listener is installed eagerly, but its gate remains closed until
  // every persisted row for the selected conversation has rendered silently.
  _delegationUiState.subscribed = true;
  return true;
}

function _renderDelegationInlineError(container, textValue) {
  if (!container || !textValue) return;
  var error = _delegationElement('p', 'delegation-inline-error', textValue);
  // The state card owns assertive semantics for lifecycle alerts. Avoid a
  // nested alert that would re-announce unchanged cleanup copy when the
  // parent is deliberately aria-live="off" on a repeated render.
  if (typeof container.getAttribute !== 'function'
    || container.getAttribute('role') !== 'alert') {
    error.setAttribute('role', 'alert');
  }
  container.appendChild(error);
}

function _backToDelegationMessage() {
  if (_delegationUiState.pendingStart || _delegationUiState.pendingTrust) return;
  _delegationUiState.challengeId = null;
  _delegationUiState.challengeExpiresAt = null;
  _delegationUiState.errorCode = null;
  _renderDelegationReadyState();
  if (chatInput && typeof chatInput.focus === 'function') chatInput.focus();
}

function _renderDelegationConsent(options) {
  options = options || {};
  _clearDelegationElapsedTimer();
  var mount = _ensureDelegationMount();
  if (!mount.run || !mount.state || !mount.feed) return;
  _delegationUiState.mode = 'consent';
  mount.run.classList.remove('hidden');
  mount.run.setAttribute(
    'aria-busy',
    _delegationUiState.pendingStart || _delegationUiState.pendingTrust ? 'true' : 'false'
  );
  _clearDelegationNode(mount.state);
  _clearDelegationNode(mount.feed);
  _delegationRunStopControls = [];
  _restoreLegacyStopControl();
  mount.state.removeAttribute('role');
  var provider = _delegationCanonicalProvider(
    _delegationUiState.providerId,
    _delegationUiState.providerLabel
  );
  var providerLabel = provider ? provider.label : 'Agent';

  var heading = _delegationElement(
    'h2', 'delegation-state-heading', 'Let ' + providerLabel + ' control this browser?'
  );
  heading.id = 'delegationRunHeading';
  heading.tabIndex = -1;
  mount.state.appendChild(heading);
  mount.state.appendChild(_delegationElement(
    'p',
    'delegation-state-body',
    providerLabel + ' may drive FSB browser tools for this task.'
  ));
  mount.state.appendChild(_delegationElement(
    'p',
    'delegation-state-body delegation-consent-forbidden',
    'It cannot edit files, run shell commands, or fetch arbitrary URLs.'
  ));

  var trust = _delegationElement('label', 'delegation-trust-control');
  var checkbox = _delegationElement('input', 'delegation-trust-checkbox');
  checkbox.type = 'checkbox';
  checkbox.checked = false;
  checkbox.disabled = _delegationUiState.pendingStart || _delegationUiState.pendingTrust;
  trust.appendChild(checkbox);
  trust.appendChild(document.createTextNode('Trust ' + providerLabel + ' for future runs'));
  mount.state.appendChild(trust);
  mount.state.appendChild(_delegationElement(
    'p',
    'delegation-state-note',
    'This turns off confirmation for future ' + providerLabel
      + ' runs on this browser. You can restore confirmation in Providers.'
  ));

  if (_delegationUiState.errorCode) {
    _renderDelegationInlineError(
      mount.state,
      _delegationUiState.errorCode === 'trust_storage_failed'
        ? 'Confirmation preference could not be saved. Try again or continue without trust.'
        : 'The agent could not be started. Review the permission and try again.'
    );
  }

  var actions = _delegationElement('div', 'delegation-state-actions');
  var allow = _delegationAction(
    'Allow & start ' + providerLabel,
    'delegation-action-primary',
    function() { _allowDelegationFromConsent(checkbox); }
  );
  allow.disabled = _delegationUiState.pendingStart || _delegationUiState.pendingTrust;
  var back = _delegationAction('Back to message', '', _backToDelegationMessage);
  back.disabled = _delegationUiState.pendingStart || _delegationUiState.pendingTrust;
  actions.appendChild(allow);
  actions.appendChild(back);
  mount.state.appendChild(actions);
  if (mount.control) {
    _clearDelegationNode(mount.control);
    mount.control.classList.add('hidden');
  }
  _setDelegationHeaderStatus('Ready');
  _setDelegationComposerLocked(true);
  if (options.focusHeading === true && typeof heading.focus === 'function') heading.focus();
}

function _openDelegationProviderSetup() {
  openControlPanelSection('providers');
}

async function _copyDelegationDoctorCommand() {
  var command = 'fsb-mcp-server doctor';
  try {
    if (typeof navigator !== 'undefined'
        && navigator.clipboard
        && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(command);
      var mount = _ensureDelegationMount();
      if (mount.announcer) mount.announcer.textContent = 'Doctor command copied';
    }
  } catch (_error) { /* clipboard failure leaves the visible literal available */ }
}

function _renderDelegationNativeWakeChecking(intentId, attemptId) {
  if (!_delegationPreflightIntentIsCurrent(intentId)
      || typeof attemptId !== 'string'
      || !DELEGATION_NATIVE_WAKE_ID_PATTERN.test(attemptId)
      || _delegationUiState.pendingAttemptId !== null) return false;
  var mount = _ensureDelegationMount();
  if (!mount.run || !mount.state || !mount.feed) return false;

  _clearDelegationElapsedTimer();
  _delegationUiState.pendingAttemptId = attemptId;
  _delegationUiState.checkingIntentId = intentId;
  _delegationUiState.mode = 'native-wake-checking';
  mount.run.classList.remove('hidden');
  mount.run.setAttribute('aria-busy', 'true');
  _clearDelegationNode(mount.state);
  _clearDelegationNode(mount.feed);
  mount.state.className = 'delegation-state-card delegation-tone-info';
  mount.state.setAttribute('data-delegation-state', 'native-wake-checking');
  mount.state.setAttribute('data-delegation-tone', 'info');
  mount.state.removeAttribute('role');
  mount.state.removeAttribute('aria-live');
  _delegationRunStopControls = [];
  _restoreLegacyStopControl();

  var heading = _delegationElement(
    'h2',
    'delegation-state-heading delegation-semantic-heading delegation-native-wake-heading'
  );
  heading.id = 'delegationRunHeading';
  var spinner = _delegationElement(
    'i',
    'fa fa-spinner delegation-semantic-icon delegation-native-wake-spinner'
  );
  spinner.setAttribute('aria-hidden', 'true');
  heading.appendChild(spinner);
  heading.appendChild(_delegationElement(
    'span', 'delegation-heading-copy', 'Checking local agent service'
  ));
  mount.state.appendChild(heading);
  mount.state.appendChild(_delegationElement(
    'p',
    'delegation-state-body delegation-native-wake-body',
    'FSB is trying to make the local agent service available. Your message has not been sent.'
  ));
  if (mount.control) {
    _clearDelegationNode(mount.control);
    mount.control.classList.add('hidden');
  }
  _setDelegationHeaderStatus('Checking agent service', '');
  _announceDelegationLifecycleKey(
    'native-wake-checking:' + intentId,
    'Checking local agent service. Your message has not been sent.'
  );
  return true;
}

function _renderDelegationPreflightFailure(result) {
  result = result || {};
  _clearDelegationElapsedTimer();
  var code = typeof result.code === 'string' ? result.code : 'agent_offline';
  var provider = _delegationCanonicalProvider(
    _delegationOwnDataValue(result, 'providerId'),
    _delegationOwnDataValue(result, 'providerLabel')
  );
  var providerLabel = provider ? provider.label : 'Selected provider';
  var headingText = 'Agent offline';
  var bodyText = 'FSB cannot reach the local agent service. Run the doctor command, then try this message again.';
  var primaryLabel = 'Copy doctor command';
  var primaryAction = _copyDelegationDoctorCommand;
  var secondaryLabel = 'Open provider setup';
  var secondaryAction = _openDelegationProviderSetup;

  if (code === 'agent_unpaired') {
    headingText = 'Pair this browser before starting ' + providerLabel;
    bodyText = 'FSB can reach the local agent service, but this browser has not been paired with it. Open provider setup, pair this browser, then try this message again.';
    primaryLabel = 'Open provider setup';
    primaryAction = _openDelegationProviderSetup;
    secondaryLabel = null;
    secondaryAction = null;
  } else if (code === 'unsupported_provider') {
    headingText = providerLabel + ' cannot run browser tasks';
    bodyText = 'The selected provider does not support agents that control browser tabs. Choose a supported agent provider, then try this message again.';
    primaryLabel = 'Choose another provider';
    primaryAction = _openDelegationProviderSetup;
    secondaryLabel = null;
    secondaryAction = null;
  } else if (code === 'start_rejected') {
    headingText = providerLabel + ' cannot start this task';
    bodyText = providerLabel
      + ' could not use a signed-in account and model. Open provider setup, confirm '
      + providerLabel
      + ' can run non-interactively, then try this message again.';
    primaryLabel = 'Open provider setup';
    primaryAction = _openDelegationProviderSetup;
    secondaryLabel = 'Back to message';
    secondaryAction = _backToDelegationMessage;
  } else if (code !== 'agent_offline' && code !== 'runtime_unavailable') {
    headingText = 'Agent could not start this task';
    bodyText = 'Keep this message in the composer, review the provider settings, and try again.';
    primaryLabel = 'Open provider setup';
    primaryAction = _openDelegationProviderSetup;
    secondaryLabel = 'Back to message';
    secondaryAction = _backToDelegationMessage;
  }

  _delegationUiState.mode = 'preflight-failure';
  var mount = _ensureDelegationMount();
  mount.run.classList.remove('hidden');
  mount.run.setAttribute('aria-busy', 'false');
  _clearDelegationNode(mount.state);
  _clearDelegationNode(mount.feed);
  _delegationRunStopControls = [];
  _restoreLegacyStopControl();
  mount.state.removeAttribute('aria-live');
  if (code === 'agent_offline' || code === 'runtime_unavailable') {
    mount.state.setAttribute('role', 'alert');
  } else {
    mount.state.removeAttribute('role');
  }
  var offlinePresentation = code === 'agent_offline' || code === 'runtime_unavailable';
  var heading = offlinePresentation
    ? _delegationSemanticHeading(
      'h2', 'delegation-state-heading delegation-semantic-heading', headingText, 'danger'
    )
    : _delegationElement('h2', 'delegation-state-heading', headingText);
  if (offlinePresentation) heading.setAttribute('data-delegation-tone', 'danger');
  heading.id = 'delegationRunHeading';
  heading.tabIndex = -1;
  mount.state.appendChild(heading);
  mount.state.appendChild(_delegationElement('p', 'delegation-state-body', bodyText));
  if (code === 'agent_offline' || code === 'runtime_unavailable') {
    mount.state.appendChild(_delegationElement(
      'code', 'delegation-doctor-command', 'fsb-mcp-server doctor'
    ));
  }
  var actions = _delegationElement('div', 'delegation-state-actions');
  actions.appendChild(_delegationAction(primaryLabel, '', primaryAction));
  if (secondaryLabel) actions.appendChild(_delegationAction(secondaryLabel, '', secondaryAction));
  mount.state.appendChild(actions);
  if (mount.control) {
    _clearDelegationNode(mount.control);
    mount.control.classList.add('hidden');
  }
  _setDelegationHeaderStatus(
    offlinePresentation ? 'Agent offline' : 'Ready',
    offlinePresentation ? 'error' : ''
  );
  _setDelegationComposerLocked(false);
  if (typeof heading.focus === 'function') heading.focus();
}

function _delegationStateLabel(snapshot) {
  var label = snapshot.provider && snapshot.provider.label
    ? snapshot.provider.label
    : 'Agent';
  if (snapshot.state === 'restart_lost'
      && snapshot.terminal
      && snapshot.terminal.code === 'daemon_restart_lost_run') {
    return 'Agent run ended after daemon restart';
  }
  if (snapshot.state === 'completed') return 'Completed';
  if (snapshot.state === 'stopped') return _delegationStoppedHeading(snapshot);
  if (snapshot.state === 'failed' && snapshot.terminal) {
    if (snapshot.terminal.code === 'agent_offline') return 'Agent offline';
    return 'Agent could not finish this task';
  }
  if (snapshot.connection === 'offline') return 'Agent offline';
  if (snapshot.connection === 'disconnected') return 'Agent connection lost';
  if (snapshot.state === 'starting') return 'Starting agent';
  if (snapshot.state === 'running' || snapshot.state === 'holding') return label + ' running';
  if (snapshot.state === 'held' || snapshot.state === 'resuming') return 'Human control';
  if (snapshot.state === 'stopping') return 'Stopping agent';
  if (snapshot.state === 'restart_lost') return 'Run ended';
  if (snapshot.state === 'failed') return 'Agent could not finish this task';
  return 'Ready';
}

function _delegationStoppedHeading(snapshot) {
  var count = snapshot
    && snapshot.terminal
    && Number.isSafeInteger(snapshot.terminal.releasedTabCount)
    && snapshot.terminal.releasedTabCount >= 0
    ? snapshot.terminal.releasedTabCount
    : 0;
  return 'Agent stopped, ' + count + ' ' + (count === 1 ? 'tab' : 'tabs') + ' released';
}

function _delegationSnapshotAlertKey(snapshot) {
  if (!snapshot) return null;
  if (_delegationUiState.bindingCleanupPending === true
      && snapshot.delegationId === _delegationUiState.delegationId) {
    return snapshot.delegationId + ':binding_cleanup_pending';
  }
  if (snapshot.state === 'restart_lost'
      && snapshot.terminal
      && snapshot.terminal.code === 'daemon_restart_lost_run') {
    return snapshot.delegationId + ':daemon_restart_lost_run';
  }
  if (snapshot.connection === 'offline'
      || (snapshot.terminal && snapshot.terminal.code === 'agent_offline')) {
    return snapshot.delegationId + ':agent_offline';
  }
  if (snapshot.connection === 'disconnected') {
    return snapshot.delegationId + ':agent_disconnected';
  }
  return null;
}

function _delegationSnapshotLocksComposer(snapshot) {
  return (typeof _delegationUiState !== 'undefined'
    && _delegationUiState.bindingCleanupPending === true) || (snapshot && (
    snapshot.state === 'starting'
    || snapshot.state === 'running'
    || snapshot.state === 'holding'
    || snapshot.state === 'held'
    || snapshot.state === 'resuming'
    || snapshot.state === 'stopping'
  ));
}

function _delegationCanTakeControl(snapshot) {
  return snapshot
    && snapshot.state === 'running'
    && snapshot.activeTab
    && snapshot.activeTab.tabId === _activeTabIdSnapshot
    && snapshot.activeTab.owned === true
    && snapshot.activeTab.canTakeControl === true;
}

function _delegationCanResume(snapshot) {
  return snapshot
    && (snapshot.state === 'held' || snapshot.state === 'resuming')
    && snapshot.activeTab
    && snapshot.activeTab.tabId === _activeTabIdSnapshot
    && snapshot.activeTab.owned === false
    && snapshot.activeTab.canTakeControl === false
    && snapshot.hold
    && snapshot.hold.tabIds.indexOf(_activeTabIdSnapshot) !== -1;
}

function _renderDelegationControlBar(snapshot, options) {
  options = options || {};
  var mount = _ensureDelegationMount();
  var control = mount.control;
  if (!control) return;
  _clearDelegationNode(control);
  control.classList.add('hidden');

  if (_delegationCanTakeControl(snapshot)) {
    var providerLabel = snapshot.provider ? snapshot.provider.label : 'Agent';
    control.appendChild(_delegationElement(
      'span', 'delegation-control-copy', providerLabel + ' controls this active tab'
    ));
    var takeButton = _delegationAction('Take control', '', _takeDelegationControl);
    takeButton.setAttribute('data-delegation-action', 'take-control');
    takeButton.disabled = _delegationUiState.pendingTake;
    control.appendChild(takeButton);
    control.classList.remove('hidden');
    if (options.focusAction === 'take' && typeof takeButton.focus === 'function') {
      takeButton.focus();
    }
    return;
  }

  if (_delegationCanResume(snapshot)) {
    control.appendChild(_delegationElement(
      'span', 'delegation-control-copy', 'You have control of this tab'
    ));
    var resumeButton = _delegationAction(
      'Resume with agent', 'delegation-action-primary', _resumeDelegationControl
    );
    resumeButton.setAttribute('data-delegation-action', 'resume');
    resumeButton.disabled = _delegationUiState.pendingResume || _delegationUiState.pendingTake;
    control.appendChild(resumeButton);
    control.classList.remove('hidden');
    if (options.focusAction === 'resume' && typeof resumeButton.focus === 'function') {
      resumeButton.focus();
    }
  }
}

function _delegationIsActiveSnapshot(snapshot) {
  return snapshot && (
    snapshot.state === 'starting'
    || snapshot.state === 'running'
    || snapshot.state === 'holding'
    || snapshot.state === 'held'
    || snapshot.state === 'resuming'
    || snapshot.state === 'stopping'
  );
}

function _delegationStopIsActionable(snapshot) {
  return _delegationIsActiveSnapshot(snapshot) || (
    _delegationUiState.bindingCleanupPending === true
    && snapshot
    && snapshot.delegationId === _delegationUiState.delegationId
  );
}

function _delegationStopControlPending(snapshot) {
  return _delegationUiState.pendingStop === true || (
    snapshot
    && snapshot.state === 'stopping'
    && _delegationUiState.bindingCleanupPending !== true
  );
}

function _delegationUsesFixedStop(snapshot) {
  return _delegationIsSelectedConversation()
    && _delegationStopIsActionable(snapshot);
}

function _restoreLegacyStopControl() {
  if (!stopBtn) return;
  stopBtn.removeAttribute('data-delegation-action');
  stopBtn.removeAttribute('aria-label');
  stopBtn.setAttribute('title', 'Stop Automation');
  var ownerLocked = _chatLockedByOwnerChip === true;
  stopBtn.disabled = ownerLocked;
  if (ownerLocked) {
    stopBtn.setAttribute('aria-disabled', 'true');
    stopBtn.setAttribute('aria-describedby', 'fsb-lockout-aria-description');
    stopBtn.classList.add('fsb-foreign-owned-disabled');
  } else {
    stopBtn.removeAttribute('aria-disabled');
    stopBtn.removeAttribute('aria-describedby');
    stopBtn.classList.remove('fsb-foreign-owned-disabled');
  }
  if (typeof isRunning !== 'undefined' && isRunning) stopBtn.classList.remove('hidden');
  else stopBtn.classList.add('hidden');
}

function _syncDelegationStopControls(snapshot) {
  if (!_delegationUsesFixedStop(snapshot)) {
    _restoreLegacyStopControl();
    return false;
  }
  var stopping = _delegationStopControlPending(snapshot);
  var stopLabel = stopping ? 'Stopping agent…' : 'Stop agent';
  if (stopBtn) {
    stopBtn.classList.remove('hidden');
    stopBtn.classList.remove('fsb-foreign-owned-disabled');
    stopBtn.removeAttribute('aria-describedby');
    stopBtn.disabled = stopping;
    if (stopping) stopBtn.setAttribute('aria-disabled', 'true');
    else stopBtn.removeAttribute('aria-disabled');
    stopBtn.setAttribute('data-delegation-action', 'stop');
    stopBtn.setAttribute('title', stopLabel);
    stopBtn.setAttribute('aria-label', stopLabel);
  }
  for (var index = 0; index < _delegationRunStopControls.length; index++) {
    var control = _delegationRunStopControls[index];
    if (!control) continue;
    control.disabled = stopping;
    control.textContent = stopLabel;
  }
  var mount = _ensureDelegationMount();
  if (mount.run) mount.run.setAttribute('aria-busy', stopping ? 'true' : 'false');
  return true;
}

function _handleFixedStop(event) {
  if (_delegationUsesFixedStop(_delegationUiState.snapshot)) {
    return _stopDelegation(event);
  }
  return stopAutomation();
}

function _renderDelegationRunActions(container, snapshot) {
  if (!_delegationStopIsActionable(snapshot)) return;
  var stopping = _delegationStopControlPending(snapshot);
  var actions = _delegationElement('div', 'delegation-state-actions');
  var stop = _delegationAction(
    stopping ? 'Stopping agent…' : 'Stop agent',
    'delegation-action-danger',
    _stopDelegation
  );
  stop.setAttribute('data-delegation-action', 'stop');
  stop.disabled = stopping;
  _delegationRunStopControls.push(stop);
  actions.appendChild(stop);
  container.appendChild(actions);
}

function _appendDelegationActionRow(container, actions) {
  var row = _delegationElement('div', 'delegation-state-actions');
  for (var index = 0; index < actions.length; index++) {
    row.appendChild(_delegationAction(
      actions[index].label,
      actions[index].className || '',
      actions[index].handler
    ));
  }
  container.appendChild(row);
}

function _appendDelegationDoctorRecovery(container) {
  container.appendChild(_delegationElement(
    'code', 'delegation-doctor-command', 'fsb-mcp-server doctor'
  ));
  _appendDelegationActionRow(container, [
    { label: 'Copy doctor command', handler: _copyDelegationDoctorCommand },
    { label: 'Open provider setup', handler: _openDelegationProviderSetup }
  ]);
}

function _appendDelegationTechnicalCode(container, code) {
  var details = _delegationElement('details', 'delegation-technical-details');
  details.appendChild(_delegationElement(
    'summary', 'delegation-technical-summary', 'Technical details'
  ));
  details.appendChild(_delegationElement('code', 'delegation-machine-value', code));
  container.appendChild(details);
}

function _appendDelegationRunDefinition(list, label, value, valueClass) {
  list.appendChild(_delegationElement('dt', 'delegation-definition-label', label));
  list.appendChild(_delegationElement(
    'dd',
    'delegation-definition-value' + (valueClass ? ' ' + valueClass : ''),
    value
  ));
}

function _appendDelegationRunMetadata(container, snapshot) {
  if (!_delegationIsActiveSnapshot(snapshot)) return;
  var list = _delegationElement(
    'dl',
    'delegation-definition-list delegation-run-metadata'
  );
  _appendDelegationRunDefinition(
    list,
    'Provider',
    snapshot.provider ? snapshot.provider.label : 'Not reported'
  );
  _appendDelegationRunDefinition(list, 'State', _delegationStateLabel(snapshot));
  var elapsedLabel = _delegationElement('dt', 'delegation-definition-label', 'Elapsed');
  var elapsedValue = _delegationElement(
    'dd',
    'delegation-definition-value delegation-run-elapsed',
    'Not reported'
  );
  list.appendChild(elapsedLabel);
  list.appendChild(elapsedValue);
  container.appendChild(list);
  _syncDelegationElapsedTimer(snapshot, elapsedValue);
}

function _renderDelegationRunHeader(container, snapshot) {
  _clearDelegationElapsedTimer();
  _clearDelegationNode(container);
  _delegationRunStopControls = [];
  var bindingCleanupPending = _delegationUiState.bindingCleanupPending === true
    && snapshot.delegationId === _delegationUiState.delegationId;
  var presentationTone = bindingCleanupPending
    ? 'danger'
    : _delegationToneForSnapshot(snapshot);
  _applyDelegationSnapshotTone(container, snapshot, presentationTone);
  var terminalCode = snapshot.terminal ? snapshot.terminal.code : null;
  var restartLost = snapshot.state === 'restart_lost'
    && terminalCode === 'daemon_restart_lost_run';
  var stopped = snapshot.state === 'stopped' && snapshot.terminal !== null;
  var unpaired = terminalCode === 'agent_unpaired' || snapshot.connection === 'unpaired';
  var unsupported = terminalCode === 'unsupported_provider'
    || snapshot.connection === 'unsupported';
  var offline = !restartLost && (
    snapshot.connection === 'offline' || terminalCode === 'agent_offline'
  );
  var disconnected = !restartLost
    && !offline
    && !unpaired
    && !unsupported
    && snapshot.connection === 'disconnected';
  var resumeOwnershipFailure = snapshot.terminal
    && (terminalCode === 'resume_ownership_lost' || terminalCode === 'hold_expired');
  var genericRunFailure = snapshot.state === 'failed'
    && !resumeOwnershipFailure
    && !offline
    && !unpaired
    && !unsupported;
  var providerLabel = snapshot.provider ? snapshot.provider.label : 'Agent';
  var headingText = _delegationStateLabel(snapshot);
  if (bindingCleanupPending) headingText = 'Agent cleanup needs attention';
  else if (restartLost) headingText = 'Agent run ended after daemon restart';
  else if (stopped) headingText = _delegationStoppedHeading(snapshot);
  else if (offline) headingText = 'Agent offline';
  else if (disconnected) headingText = 'Agent connection lost';
  else if (unpaired) headingText = 'Pair this browser before starting ' + providerLabel;
  else if (unsupported) {
    headingText = (snapshot.provider ? snapshot.provider.label : 'Selected provider')
      + ' cannot run browser tasks';
  } else if (resumeOwnershipFailure) headingText = 'Agent could not resume control';
  var heading = _delegationSemanticHeading(
    'h2',
    'delegation-state-heading',
    headingText,
    presentationTone
  );
  heading.id = 'delegationRunHeading';
  container.appendChild(heading);
  _appendDelegationRunMetadata(container, snapshot);
  if (bindingCleanupPending) {
    container.appendChild(_delegationElement(
      'p',
      'delegation-state-body',
      'FSB accepted this run but could not save it, and Stop is not confirmed.'
    ));
  } else if (restartLost) {
    container.appendChild(_delegationElement(
      'p',
      'delegation-state-body',
      'The previous agent process was stopped and was not reattached. Start a new task when the local service is ready.'
    ));
    _appendDelegationTechnicalCode(container, 'daemon_restart_lost_run');
    _appendDelegationActionRow(container, [{
      label: 'Start a new task',
      handler: function() { _prepareDelegationTask(false); }
    }]);
  } else if (stopped) {
    _appendDelegationActionRow(container, [{
      label: 'Start a new task',
      handler: function() { _prepareDelegationTask(false); }
    }]);
  } else if (offline) {
    container.appendChild(_delegationElement(
      'p',
      'delegation-state-body',
      'FSB cannot reach the local agent service. Run the doctor command, then try this message again.'
    ));
    _appendDelegationDoctorRecovery(container);
  } else if (disconnected) {
    container.appendChild(_delegationElement(
      'p',
      'delegation-state-body',
      'FSB missed three replies from the local agent service. The run cannot continue safely.'
    ));
    _appendDelegationDoctorRecovery(container);
  } else if (unpaired) {
    container.appendChild(_delegationElement(
      'p',
      'delegation-state-body',
      'FSB can reach the local agent service, but this browser has not been paired with it. Open provider setup, pair this browser, then try this message again.'
    ));
    _appendDelegationActionRow(container, [{
      label: 'Open provider setup',
      handler: _openDelegationProviderSetup
    }]);
  } else if (unsupported) {
    container.appendChild(_delegationElement(
      'p',
      'delegation-state-body',
      'The selected provider does not support agents that control browser tabs. Choose a supported agent provider, then try this message again.'
    ));
    _appendDelegationActionRow(container, [{
      label: 'Choose another provider',
      handler: _openDelegationProviderSetup
    }]);
  } else if (resumeOwnershipFailure) {
    container.appendChild(_delegationElement(
      'p',
      'delegation-state-body',
      'FSB could not return this tab to ' + providerLabel
        + ', so the run ended and the tab remains under your control. Start a new task when you are ready.'
    ));
    var resumeFailureActions = _delegationElement('div', 'delegation-state-actions');
    resumeFailureActions.appendChild(_delegationAction(
      'Start a new task', '', function() { _prepareDelegationTask(false); }
    ));
    container.appendChild(resumeFailureActions);
  } else if (genericRunFailure) {
    container.appendChild(_delegationElement(
      'p',
      'delegation-state-body',
      providerLabel
        + ' stopped before the task was complete. Review the error details, then try the same message again.'
    ));
    var retryActions = _delegationElement('div', 'delegation-state-actions');
    retryActions.appendChild(_delegationAction(
      'Try message again', '', function() { _prepareDelegationTask(true); }
    ));
    container.appendChild(retryActions);
  } else if (snapshot.state === 'running' || snapshot.state === 'holding') {
    var body = document.createElement('p');
    body.className = 'delegation-state-body';
    body.textContent = (snapshot.provider ? snapshot.provider.label : 'Agent')
      + ' is working in the background';
    container.appendChild(body);
  } else if (snapshot.state === 'held' || snapshot.state === 'resuming') {
    container.appendChild(_delegationElement(
      'p', 'delegation-state-body', 'You have control of this tab'
    ));
  }
  if (_delegationUiState.errorCode === 'mapping_unavailable') {
    _renderDelegationInlineError(container, 'Take control is no longer available for this tab.');
  } else if (_delegationUiState.errorCode === 'hold_failed'
      || _delegationUiState.errorCode === 'hold_lease_failed') {
    _renderDelegationInlineError(
      container,
      providerLabel + ' could not pause for human control.'
    );
  } else if (_delegationUiState.errorCode === 'stop_failed'
      || _delegationUiState.errorCode === 'runtime_unavailable') {
    _renderDelegationInlineError(
      container,
      'Stop could not be confirmed. The previous agent state is still shown.'
    );
  } else if (_delegationUiState.errorCode === 'delegation_binding_cleanup_unsettled') {
    _renderDelegationInlineError(
      container,
      'Your original message is still here. Retry Stop to finish cleanup.'
    );
  }
  _renderDelegationRunActions(container, snapshot);
  _syncDelegationStopControls(snapshot);
}

function _renderDelegationBindingFailureReady(originTask) {
  _delegationUiState.pendingStart = false;
  _delegationUiState.pendingStop = false;
  _delegationUiState.delegationId = null;
  _delegationUiState.snapshot = null;
  _delegationUiState.task = originTask;
  _delegationUiState.challengeId = null;
  _delegationUiState.challengeExpiresAt = null;
  _delegationUiState.bindingCleanupPending = false;
  _delegationUiState.bindingCleanupOriginKey = null;
  _delegationUiState.subscribed = true;
  _renderDelegationReadyState();
  _delegationUiState.task = originTask;
  chatInput.textContent = originTask;
  _delegationUiState.errorCode = 'delegation_binding_persistence_failed';
  var bindingFailureMount = _ensureDelegationMount();
  bindingFailureMount.state.setAttribute('role', 'alert');
  _renderDelegationInlineError(
    bindingFailureMount.state,
    'FSB could not save this agent run. Stop was confirmed for that exact run, and your message was kept. Try again.'
  );
  updateSendButtonState();
}

function _retainUnboundDelegationCleanup(snapshot, originTask, originKey, pendingStop) {
  var cleanupRecord = originKey
    ? _delegationUnboundCleanupByOrigin.get(originKey)
    : null;
  _delegationUiState.pendingStart = false;
  _delegationUiState.pendingStop = pendingStop === true;
  _delegationUiState.delegationId = snapshot.delegationId;
  _delegationUiState.snapshot = snapshot;
  _delegationUiState.task = originTask;
  _delegationUiState.challengeId = null;
  _delegationUiState.challengeExpiresAt = null;
  _delegationUiState.errorCode = 'delegation_binding_cleanup_unsettled';
  _delegationUiState.bindingCleanupPending = true;
  _delegationUiState.bindingCleanupOriginKey = originKey || null;
  if (cleanupRecord) {
    _delegationUiState.conversationId = cleanupRecord.conversationId;
  }
  _delegationUiState.subscribed = true;
  chatInput.textContent = originTask;
  _renderDelegationSnapshot(snapshot, { hydrated: false, announceSequence: null });
  updateSendButtonState();
}

async function _prepareDelegationTask(retrySameMessage) {
  var selectedConversationId = _delegationUiState.conversationId;
  var retainedTask = retrySameMessage === true && typeof _delegationUiState.task === 'string'
    ? _delegationUiState.task
    : '';
  await _removeDelegationConversationBinding(selectedConversationId);
  if (selectedConversationId !== conversationId
      || selectedConversationId !== _delegationUiState.conversationId) return;
  _resetDelegationSelection(selectedConversationId);
  chatInput.textContent = retainedTask;
  _renderDelegationReadyState();
  _delegationUiState.subscribed = true;
  updateSendButtonState();
  if (chatInput && typeof chatInput.focus === 'function') chatInput.focus();
}

function _delegationAnnouncement(entry) {
  if (!entry) return '';
  if (entry.kind === 'init') return 'Agent initialized';
  if (entry.kind === 'tool-call') return 'Tool call: ' + entry.tool.name;
  if (entry.kind === 'retry') return 'Retrying: ' + entry.retry.class;
  if (entry.kind === 'result') return 'Result: ' + entry.state;
  return 'Agent state: ' + entry.state;
}

function _delegationOneShotTransition(key, textValue, silent) {
  if (!key || !textValue) return '';
  if (!_delegationUiState.announcedTransitions) {
    _delegationUiState.announcedTransitions = Object.create(null);
  }
  if (_delegationUiState.announcedTransitions[key]) return '';
  _delegationUiState.announcedTransitions[key] = true;
  return silent === true ? '' : textValue;
}

function _delegationLifecycleAnnouncement(snapshot, previousSnapshot, hydrated) {
  if (!snapshot || typeof snapshot.delegationId !== 'string') return '';
  var suffix = null;
  var textValue = null;
  if (snapshot.state === 'starting') {
    suffix = 'starting';
    textValue = 'Starting agent';
  } else if (snapshot.state === 'stopping') {
    suffix = 'stopping';
    textValue = 'Stopping agent';
  } else if (snapshot.state === 'held') {
    suffix = 'held';
    textValue = 'You have control of this tab. Resume with agent available';
  } else if (snapshot.state === 'resuming') {
    suffix = 'resuming';
    textValue = 'Resuming with agent';
  } else if (snapshot.state === 'holding') {
    suffix = 'holding';
    textValue = 'Pausing agent for human control';
  } else if (snapshot.state === 'running'
      && previousSnapshot
      && (previousSnapshot.state === 'held' || previousSnapshot.state === 'resuming')) {
    suffix = 'resumed';
    textValue = (snapshot.provider ? snapshot.provider.label : 'Agent') + ' resumed control';
  } else if (_delegationCanTakeControl(snapshot)) {
    suffix = 'take-control:' + snapshot.activeTab.tabId;
    textValue = 'Take control available';
  }
  if (!suffix) return '';
  return _delegationOneShotTransition(
    snapshot.delegationId + ':lifecycle:' + suffix,
    textValue,
    hydrated === true
  );
}

function _announceDelegationLifecycleKey(key, textValue) {
  var announcement = _delegationOneShotTransition(key, textValue, false);
  if (!announcement) return false;
  var mount = _ensureDelegationMount();
  if (!mount.announcer) return false;
  mount.announcer.textContent = announcement;
  return true;
}

function _renderDelegationSnapshot(snapshot, options) {
  options = options || {};
  if (typeof FsbDelegationFeed === 'undefined'
      || typeof FsbDelegationFeed.validateSnapshot !== 'function'
      || !FsbDelegationFeed.validateSnapshot(snapshot)) return false;
  if (_delegationUiState.delegationId !== null
      && snapshot.delegationId !== _delegationUiState.delegationId) return false;
  if (_delegationUiState.delegationId === snapshot.delegationId
      && Number.isSafeInteger(_delegationUiState.lastRenderedSequence)
      && snapshot.entries.length < _delegationUiState.lastRenderedSequence) return false;

  var mount = _ensureDelegationMount();
  if (!mount.run || !mount.state || !mount.feed) return false;
  var previousSnapshot = _delegationUiState.snapshot;
  var previousLastSequence = Number.isSafeInteger(_delegationUiState.lastRenderedSequence)
    ? _delegationUiState.lastRenderedSequence
    : 0;
  _delegationUiState.delegationId = snapshot.delegationId;
  _delegationUiState.snapshot = snapshot;
  _delegationUiState.mode = 'snapshot';
  mount.run.classList.remove('hidden');
  mount.run.setAttribute(
    'aria-busy',
    snapshot.state === 'holding'
      || snapshot.state === 'resuming'
      || snapshot.state === 'stopping'
      || _delegationUiState.pendingTake
      || _delegationUiState.pendingResume
      || _delegationUiState.pendingStop
      ? 'true'
      : 'false'
  );
  var alertKey = _delegationSnapshotAlertKey(snapshot);
  if (alertKey) {
    mount.state.setAttribute('role', 'alert');
    if (options.hydrated === true || alertKey === _delegationUiState.lastAlertKey) {
      mount.state.setAttribute('aria-live', 'off');
    } else {
      mount.state.removeAttribute('aria-live');
    }
  } else {
    mount.state.removeAttribute('role');
    mount.state.removeAttribute('aria-live');
  }
  _delegationUiState.lastAlertKey = alertKey;
  _renderDelegationRunHeader(mount.state, snapshot);
  var rendered = FsbDelegationFeed.render(mount.feed, snapshot, {
    hydrated: options.hydrated === true
  });
  if (!rendered || rendered.ok !== true) return false;
  _delegationUiState.lastRenderedSequence = rendered.lastSequence;

  var announcementParts = [];
  var lifecycleAnnouncement = _delegationLifecycleAnnouncement(
    snapshot,
    previousSnapshot,
    options.hydrated === true && options.announceLifecycle !== true
  );
  if (lifecycleAnnouncement) announcementParts.push(lifecycleAnnouncement);
  var announceSequence = options.announceSequence;
  if (options.hydrated !== true
      && Number.isSafeInteger(announceSequence)
      && announceSequence > 0
      && announceSequence > previousLastSequence
      && mount.announcer) {
    var deliveryKey = snapshot.delegationId + ':' + announceSequence;
    if (!_delegationUiState.announced[deliveryKey]) {
      var entry = snapshot.entries[announceSequence - 1];
      if (entry && entry.sequence === announceSequence) {
        _delegationUiState.announced[deliveryKey] = true;
        announcementParts.push(_delegationAnnouncement(entry));
      }
    }
  }
  if (announcementParts.length && mount.announcer) {
    mount.announcer.textContent = announcementParts.join('. ');
  }
  _renderDelegationControlBar(snapshot, options);
  _setDelegationHeaderStatus(
    _delegationStateLabel(snapshot),
    snapshot.state === 'running' || snapshot.state === 'holding' ? 'running'
      : (snapshot.state === 'failed'
        || snapshot.state === 'restart_lost'
        || snapshot.connection === 'offline'
        || snapshot.connection === 'disconnected'
        ? 'error'
        : '')
  );
  _setDelegationComposerLocked(_delegationSnapshotLocksComposer(snapshot));
  return true;
}

function _handleDelegationNativeWakeChecking(message) {
  if (!_delegationHasExactKeys(message, ['attemptId', 'intentId', 'type'])
      || message.type !== 'FSB_NATIVE_WAKE_CHECKING'
      || typeof message.attemptId !== 'string'
      || !DELEGATION_NATIVE_WAKE_ID_PATTERN.test(message.attemptId)
      || typeof message.intentId !== 'string'
      || !DELEGATION_NATIVE_WAKE_ID_PATTERN.test(message.intentId)
      || !_delegationPreflightIntentIsCurrent(message.intentId)) return false;
  return _renderDelegationNativeWakeChecking(message.intentId, message.attemptId);
}

function _handleDelegationRuntimeUpdate(message) {
  if (!_delegationUiState.subscribed
      || !_delegationHasExactKeys(message, ['announceSequence', 'snapshot', 'type'])
      || message.type !== 'FSB_DELEGATION_UPDATED'
      || (message.announceSequence !== null
        && (!Number.isSafeInteger(message.announceSequence) || message.announceSequence < 1))
      || typeof FsbDelegationFeed === 'undefined'
      || !FsbDelegationFeed.validateSnapshot(message.snapshot)
      || message.snapshot.delegationId !== _delegationUiState.delegationId
      || !_delegationIsSelectedConversation()) return false;
  if (_delegationUiState.bindingCleanupPending === true) {
    _delegationUpdateUnboundCleanup(
      _delegationUiState.bindingCleanupOriginKey,
      message.snapshot.delegationId,
      message.snapshot,
      _delegationUiState.task,
      _delegationUiState.pendingStop
    );
  }
  // The controller may publish canonical intermediate `holding`/`resuming`
  // snapshots while the command is still pending. Keep the prior truthful
  // control in place (disabled and focused) until the authoritative command
  // result or terminal snapshot arrives; never render held/running early.
  if ((_delegationUiState.pendingTake && message.snapshot.state === 'holding')
      || (_delegationUiState.pendingResume && message.snapshot.state === 'resuming')) {
    return true;
  }
  return _renderDelegationSnapshot(message.snapshot, {
    hydrated: false,
    announceSequence: message.announceSequence
  });
}

async function _beginDelegationStart(challengeId) {
  if (_delegationUiState.pendingStart || typeof _delegationUiState.task !== 'string') return;
  var originTabId = _activeTabIdSnapshot;
  var originConversationId = conversationId;
  var originTask = _delegationUiState.task;
  var cleanupOriginKey = _delegationReserveUnboundCleanup(
    originTabId,
    originConversationId
  );
  if (!cleanupOriginKey) {
    var existingCleanup = _delegationUnboundCleanupForSelection(
      originTabId,
      originConversationId
    );
    if (existingCleanup) {
      _retainUnboundDelegationCleanup(
        existingCleanup.snapshot,
        existingCleanup.task,
        _delegationUnboundCleanupKey(originTabId, originConversationId),
        existingCleanup.pendingStop
      );
      return;
    }
    _delegationUiState.errorCode = 'delegation_cleanup_capacity_reached';
    _renderDelegationReadyState();
    _delegationUiState.task = originTask;
    chatInput.textContent = originTask;
    _delegationUiState.errorCode = 'delegation_cleanup_capacity_reached';
    var cleanupCapacityMount = _ensureDelegationMount();
    cleanupCapacityMount.state.setAttribute('role', 'alert');
    _renderDelegationInlineError(
      cleanupCapacityMount.state,
      'Finish the pending agent cleanup in its original tab and conversation before starting another task. Your message was kept.'
    );
    updateSendButtonState();
    return;
  }
  _delegationUiState.pendingStart = true;
  _delegationUiState.errorCode = null;
  updateSendButtonState();
  var response = null;
  try {
    response = await _sendDelegationCommand({
      type: 'FSB_DELEGATION_START',
      challengeId: challengeId,
      task: _delegationUiState.task
    });
  } catch (_startError) { /* handled as a rejected start below */ }
  if (originTabId === _activeTabIdSnapshot && originConversationId === conversationId) {
    _delegationUiState.pendingStart = false;
  }

  if (!_delegationValidLifecycleResponse(response) || response.ok !== true) {
    _delegationReleaseCleanupReservation(cleanupOriginKey);
    if (originTabId !== _activeTabIdSnapshot || originConversationId !== conversationId) return;
    _delegationUiState.errorCode = response && typeof response.code === 'string'
      ? response.code
      : 'start_rejected';
    if (_delegationUiState.errorCode === 'start_rejected') {
      _renderDelegationPreflightFailure({
        ok: false,
        code: 'start_rejected',
        providerId: _delegationUiState.providerId,
        providerLabel: _delegationUiState.providerLabel
      });
    } else if (_delegationUiState.challengeId) {
      _renderDelegationConsent({ focusHeading: false });
    } else {
      _renderDelegationReadyState();
      _delegationUiState.errorCode = response && response.code ? response.code : 'start_rejected';
      var failedMount = _ensureDelegationMount();
      _renderDelegationInlineError(
        failedMount.state,
        (_delegationUiState.providerLabel || 'Agent')
          + ' could not start this task. Keep the message and try again.'
      );
    }
    updateSendButtonState();
    return;
  }

  var acceptedConversationId = originConversationId;
  if (!_delegationValidConversationId(acceptedConversationId)
      && Number.isSafeInteger(originTabId)) {
    acceptedConversationId = await ensureTabConversationForTab(originTabId);
  }
  if (!_delegationValidConversationId(acceptedConversationId)
      && originTabId === _activeTabIdSnapshot) {
    try { acceptedConversationId = await ensureTabConversationForActiveTab(false); }
    catch (_error) { acceptedConversationId = null; }
  }
  var cleanupConversationId = _delegationValidConversationId(acceptedConversationId)
    ? acceptedConversationId
    : originConversationId;
  var movedCleanupOriginKey = _delegationMoveCleanupReservation(
    cleanupOriginKey,
    originTabId,
    cleanupConversationId
  );
  if (movedCleanupOriginKey) cleanupOriginKey = movedCleanupOriginKey;
  var acceptedDelegationId = response.snapshot.delegationId;
  var bindingCommitted = false;
  if (_delegationValidConversationId(acceptedConversationId)) {
    bindingCommitted = await _writeDelegationConversationBinding(
      acceptedConversationId,
      acceptedDelegationId
    );
  }
  if (!bindingCommitted) {
    var cleanupRecord = _delegationUnboundCleanupByOrigin.get(cleanupOriginKey);
    cleanupOriginKey = _delegationRememberUnboundCleanup(
      cleanupRecord ? cleanupRecord.tabId : originTabId,
      cleanupRecord ? cleanupRecord.conversationId : cleanupConversationId,
      response.snapshot,
      originTask,
      true
    );
    var stopResponse = null;
    try {
      stopResponse = await _sendDelegationCommand({
        type: 'FSB_DELEGATION_STOP',
        delegationId: acceptedDelegationId
      });
    } catch (_stopError) { /* retain the accepted in-memory authority below */ }
    if (_delegationStopProvesTerminal(stopResponse, acceptedDelegationId)) {
      _delegationForgetUnboundCleanup(cleanupOriginKey, acceptedDelegationId);
      if (_delegationOriginIsSelected(originTabId, cleanupConversationId)) {
        _delegationUiState.conversationId = cleanupConversationId;
        _renderDelegationBindingFailureReady(originTask);
      }
      return;
    }
    var cleanupSnapshot = _delegationExactStopSnapshot(
      stopResponse,
      acceptedDelegationId,
      response.snapshot
    );
    _delegationUpdateUnboundCleanup(
      cleanupOriginKey,
      acceptedDelegationId,
      cleanupSnapshot,
      originTask,
      false
    );
    if (_delegationOriginIsSelected(originTabId, cleanupConversationId)) {
      _retainUnboundDelegationCleanup(
        cleanupSnapshot,
        originTask,
        cleanupOriginKey,
        false
      );
    }
    return;
  }
  _delegationReleaseCleanupReservation(cleanupOriginKey);

  if (originTabId !== _activeTabIdSnapshot || acceptedConversationId !== conversationId) {
    if (_delegationValidConversationId(acceptedConversationId)) {
      _persistMessageToConversation('user', originTask, 'text', acceptedConversationId);
    }
    return;
  }

  _resetDelegationSelection(acceptedConversationId);
  _delegationUiState.task = originTask;
  _delegationUiState.delegationId = acceptedDelegationId;
  _delegationUiState.snapshot = response.snapshot;
  _delegationUiState.challengeId = null;
  _delegationUiState.challengeExpiresAt = null;
  _delegationUiState.errorCode = null;
  addMessage(originTask, 'user');
  chatInput.textContent = '';
  updateSendButtonState();
  _renderDelegationSnapshot(response.snapshot, { hydrated: false, announceSequence: null });
  await _refreshSelectedDelegationSnapshot({ hydrated: true, announceLifecycle: true });
  if (acceptedConversationId === _delegationUiState.conversationId
      && response.snapshot.delegationId === _delegationUiState.delegationId
      && _delegationIsSelectedConversation()) {
    _delegationUiState.subscribed = true;
  }
}

async function _allowDelegationFromConsent(checkbox) {
  if (_delegationUiState.mode !== 'consent'
      || _delegationUiState.pendingTrust
      || _delegationUiState.pendingStart) return;
  var trustChecked = checkbox && checkbox.checked === true;
  if (trustChecked) {
    _delegationUiState.pendingTrust = true;
    _delegationUiState.errorCode = null;
    _renderDelegationConsent({ focusHeading: false });
    var trustResponse = await _sendDelegationCommand({
      type: 'FSB_DELEGATION_SET_TRUST',
      challengeId: _delegationUiState.challengeId,
      providerId: _delegationUiState.providerId,
      trusted: true
    });
    _delegationUiState.pendingTrust = false;
    if (!_delegationValidTrustResponse(trustResponse, _delegationUiState.providerId)
        || trustResponse.ok !== true) {
      _delegationUiState.errorCode = trustResponse && trustResponse.code
        ? trustResponse.code
        : 'trust_challenge_invalid';
      _renderDelegationConsent({ focusHeading: false });
      return;
    }
    // Trusted start is a separate exact command. No trust or consent boolean
    // crosses this boundary; the background mints and consumes its own fresh
    // one-use challenge for a trusted provider.
    await _beginDelegationStart(null);
    return;
  }
  await _beginDelegationStart(_delegationUiState.challengeId);
}

async function _takeDelegationControl(event) {
  var snapshot = _delegationUiState.snapshot;
  if (_delegationUiState.pendingTake || !_delegationCanTakeControl(snapshot)) return;
  var selectedConversationId = _delegationUiState.conversationId;
  _delegationUiState.pendingTake = true;
  _delegationUiState.errorCode = null;
  var control = event && event.currentTarget;
  if (control) {
    control.disabled = true;
    if (typeof control.focus === 'function') control.focus();
  }
  var response = await _sendDelegationCommand({
    type: 'FSB_DELEGATION_TAKE_CONTROL',
    delegationId: snapshot.delegationId
  });
  if (selectedConversationId !== _delegationUiState.conversationId
      || snapshot.delegationId !== _delegationUiState.delegationId
      || !_delegationIsSelectedConversation()) return;
  _delegationUiState.pendingTake = false;
  if (_delegationValidLifecycleResponse(response) && response.snapshot) {
    _delegationUiState.errorCode = response.ok === true ? null : response.code;
    _renderDelegationSnapshot(response.snapshot, {
      hydrated: false,
      announceSequence: null,
      focusAction: response.ok === true && response.snapshot.state === 'held' ? 'resume' : 'take'
    });
    return;
  }
  _delegationUiState.errorCode = response && response.code ? response.code : 'hold_failed';
  _renderDelegationSnapshot(snapshot, { hydrated: false, announceSequence: null, focusAction: 'take' });
}

async function _resumeDelegationControl(event) {
  var snapshot = _delegationUiState.snapshot;
  if (_delegationUiState.pendingResume || !_delegationCanResume(snapshot)) return;
  var selectedConversationId = _delegationUiState.conversationId;
  _delegationUiState.pendingResume = true;
  _delegationUiState.errorCode = null;
  var control = event && event.currentTarget;
  if (control) {
    control.disabled = true;
    if (typeof control.focus === 'function') control.focus();
  }
  var response = await _sendDelegationCommand({
    type: 'FSB_DELEGATION_RESUME',
    delegationId: snapshot.delegationId
  });
  if (selectedConversationId !== _delegationUiState.conversationId
      || snapshot.delegationId !== _delegationUiState.delegationId
      || !_delegationIsSelectedConversation()) return;
  _delegationUiState.pendingResume = false;
  if (_delegationValidLifecycleResponse(response) && response.snapshot) {
    _delegationUiState.errorCode = response.ok === true ? null : response.code;
    _renderDelegationSnapshot(response.snapshot, {
      hydrated: false,
      announceSequence: null,
      focusAction: response.ok === true && response.snapshot.state === 'running' ? 'take' : null
    });
    return;
  }
  _delegationUiState.errorCode = response && response.code ? response.code : 'resume_failed';
  _renderDelegationSnapshot(snapshot, { hydrated: false, announceSequence: null, focusAction: 'resume' });
}

async function _stopDelegation(event) {
  var snapshot = _delegationUiState.snapshot;
  if (_delegationUiState.pendingStop || !_delegationStopIsActionable(snapshot)) return;
  var selectedConversationId = _delegationUiState.conversationId;
  var bindingCleanupPending = _delegationUiState.bindingCleanupPending === true;
  var bindingCleanupOriginKey = _delegationUiState.bindingCleanupOriginKey;
  var retainedTask = _delegationUiState.task;
  _delegationUiState.pendingStop = true;
  if (bindingCleanupPending) {
    _delegationUpdateUnboundCleanup(
      bindingCleanupOriginKey,
      snapshot.delegationId,
      snapshot,
      retainedTask,
      true
    );
  }
  var control = event && event.currentTarget;
  if (control) {
    control.disabled = true;
    if (typeof control.focus === 'function') control.focus();
  }
  _syncDelegationStopControls(snapshot);
  _announceDelegationLifecycleKey(
    snapshot.delegationId + ':lifecycle:stopping',
    'Stopping agent'
  );
  var response = null;
  try {
    response = await _sendDelegationCommand({
      type: 'FSB_DELEGATION_STOP',
      delegationId: snapshot.delegationId
    });
  } catch (_stopError) { /* the exact in-memory authority stays actionable */ }
  if (bindingCleanupPending) {
    if (_delegationStopProvesTerminal(response, snapshot.delegationId)) {
      _delegationForgetUnboundCleanup(bindingCleanupOriginKey, snapshot.delegationId);
      if (selectedConversationId === _delegationUiState.conversationId
          && snapshot.delegationId === _delegationUiState.delegationId
          && _delegationIsSelectedConversation()) {
        _renderDelegationBindingFailureReady(retainedTask);
      }
      return;
    }
    var retainedCleanupSnapshot = _delegationExactStopSnapshot(
      response,
      snapshot.delegationId,
      snapshot
    );
    _delegationUpdateUnboundCleanup(
      bindingCleanupOriginKey,
      snapshot.delegationId,
      retainedCleanupSnapshot,
      retainedTask,
      false
    );
    if (selectedConversationId === _delegationUiState.conversationId
        && snapshot.delegationId === _delegationUiState.delegationId
        && _delegationIsSelectedConversation()) {
      _retainUnboundDelegationCleanup(
        retainedCleanupSnapshot,
        retainedTask,
        bindingCleanupOriginKey,
        false
      );
    }
    return;
  }
  if (selectedConversationId !== _delegationUiState.conversationId
      || snapshot.delegationId !== _delegationUiState.delegationId
      || !_delegationIsSelectedConversation()) return;
  _delegationUiState.pendingStop = false;
  if (_delegationValidLifecycleResponse(response) && response.snapshot) {
    _delegationUiState.errorCode = response.ok === true ? null : response.code;
    _renderDelegationSnapshot(response.snapshot, { hydrated: false, announceSequence: null });
    return;
  }
  _delegationUiState.errorCode = 'stop_failed';
  _renderDelegationSnapshot(snapshot, { hydrated: false, announceSequence: null });
}

async function _refreshSelectedDelegationSnapshot(options) {
  options = options || {};
  if (!_delegationIsSelectedConversation()) {
    _hideDelegationPresentation();
    return false;
  }
  if (!_delegationUiState.delegationId) {
    _renderDelegationReadyState();
    return true;
  }
  var selectedId = _delegationUiState.delegationId;
  var response = await _sendDelegationCommand({
    type: 'FSB_DELEGATION_SNAPSHOT',
    delegationId: selectedId
  });
  if (!_delegationValidLifecycleResponse(response)
      || response.ok !== true
      || !response.snapshot
      || response.snapshot.delegationId !== selectedId
      || !FsbDelegationFeed.validateSnapshot(response.snapshot)
      || !_delegationIsSelectedConversation()) return false;
  return _renderDelegationSnapshot(response.snapshot, {
    hydrated: options.hydrated === true,
    announceLifecycle: options.announceLifecycle === true,
    announceSequence: null
  });
}

try {
  chrome.runtime.onMessage.addListener(function(message) {
    if (_handleDelegationNativeWakeChecking(message)) return;
    _handleDelegationRuntimeUpdate(message);
  });
} catch (_error) { /* delegated updates are best-effort until panel boot */ }

let automationTimerInterval = null;
let automationTimerStartedAt = null;
let automationPixelCycleTimeout = null;
let automationPixelTimeouts = [];
let automationPixelRevealIndex = 0;

const AUTOMATION_PIXEL_REVEAL_DIRECTIONS = ['bottom-up', 'left-right', 'top-bottom', 'right-left'];
const AUTOMATION_PIXEL_CYCLE_MS = 2700;
const AUTOMATION_PIXEL_LETTER_SLOT_MS = 900;
const AUTOMATION_PIXEL_VISIBLE_OFFSET_MS = 320;
const AUTOMATION_PIXEL_STEP_MS = 34;

function formatAutomationElapsed(startedAt) {
  if (typeof startedAt !== 'number') return '0.000s';
  var elapsedMs = Math.max(0, Date.now() - startedAt);
  var hours = Math.floor(elapsedMs / 3600000);
  var minutes = Math.floor((elapsedMs % 3600000) / 60000);
  var seconds = Math.floor((elapsedMs % 60000) / 1000);
  var milliseconds = Math.floor(elapsedMs % 1000);
  var secondText = String(seconds).padStart(hours > 0 || minutes > 0 ? 2 : 1, '0');
  var millisecondText = String(milliseconds).padStart(3, '0');

  if (hours > 0) {
    return hours + ':' + String(minutes).padStart(2, '0') + ':' + secondText + '.' + millisecondText;
  }
  if (minutes > 0) {
    return minutes + ':' + secondText + '.' + millisecondText;
  }
  return secondText + '.' + millisecondText + 's';
}

function updateAutomationTimer() {
  if (!automationTimer) return;
  automationTimer.textContent = formatAutomationElapsed(automationTimerStartedAt);
}

function getAutomationPixelLetters() {
  if (!automationRunner) return [];
  return Array.from(automationRunner.querySelectorAll('.pixel-letter'));
}

function clearAutomationPixelClasses() {
  getAutomationPixelLetters().forEach(function (letter) {
    Array.from(letter.querySelectorAll('span.pixel-lit')).forEach(function (pixel) {
      pixel.classList.remove('pixel-lit');
    });
  });
}

function clearAutomationPixelTimeouts() {
  automationPixelTimeouts.forEach(function (timeoutId) {
    clearTimeout(timeoutId);
  });
  automationPixelTimeouts = [];
  if (automationPixelCycleTimeout) {
    clearTimeout(automationPixelCycleTimeout);
    automationPixelCycleTimeout = null;
  }
}

function queueAutomationPixelTimeout(fn, delay) {
  var timeoutId = setTimeout(function () {
    automationPixelTimeouts = automationPixelTimeouts.filter(function (id) {
      return id !== timeoutId;
    });
    fn();
  }, delay);
  automationPixelTimeouts.push(timeoutId);
  return timeoutId;
}

function getAutomationPixelOrder(letter, direction) {
  return Array.from(letter.children)
    .map(function (pixel, index) {
      return {
        pixel: pixel,
        row: Math.floor(index / 3),
        col: index % 3
      };
    })
    .filter(function (entry) {
      return entry.pixel && entry.pixel.tagName === 'SPAN';
    })
    .sort(function (a, b) {
      if (direction === 'bottom-up') return (b.row - a.row) || (a.col - b.col);
      if (direction === 'left-right') return (a.col - b.col) || (a.row - b.row);
      if (direction === 'right-left') return (b.col - a.col) || (a.row - b.row);
      return (a.row - b.row) || (a.col - b.col);
    })
    .map(function (entry) {
      return entry.pixel;
    });
}

function revealAutomationLetterPixels(letter, direction) {
  clearAutomationPixelClasses();
  getAutomationPixelOrder(letter, direction).forEach(function (pixel, index) {
    queueAutomationPixelTimeout(function () {
      pixel.classList.add('pixel-lit');
    }, index * AUTOMATION_PIXEL_STEP_MS);
  });
}

function startAutomationPixelReveal() {
  clearAutomationPixelTimeouts();
  clearAutomationPixelClasses();
  automationPixelRevealIndex = 0;

  var letters = getAutomationPixelLetters();
  if (!letters.length) return;

  function runCycle() {
    letters.forEach(function (letter, letterIndex) {
      var directionIndex = (automationPixelRevealIndex + letterIndex) % AUTOMATION_PIXEL_REVEAL_DIRECTIONS.length;
      var direction = AUTOMATION_PIXEL_REVEAL_DIRECTIONS[directionIndex];
      queueAutomationPixelTimeout(function () {
        revealAutomationLetterPixels(letter, direction);
      }, AUTOMATION_PIXEL_VISIBLE_OFFSET_MS + (letterIndex * AUTOMATION_PIXEL_LETTER_SLOT_MS));
    });

    automationPixelRevealIndex = (automationPixelRevealIndex + letters.length) % AUTOMATION_PIXEL_REVEAL_DIRECTIONS.length;
    automationPixelCycleTimeout = setTimeout(runCycle, AUTOMATION_PIXEL_CYCLE_MS);
  }

  runCycle();
}

function stopAutomationPixelReveal() {
  clearAutomationPixelTimeouts();
  clearAutomationPixelClasses();
  automationPixelRevealIndex = 0;
}

function setAutomationRunnerText(text) {
  if (!automationRunnerLabel) return;
  automationRunnerLabel.textContent = text || 'Automation running';
}

function showAutomationRunner(startedAt, text) {
  automationTimerStartedAt = (typeof startedAt === 'number') ? startedAt : Date.now();
  setAutomationRunnerText(text);
  if (automationRunner) {
    automationRunner.classList.remove('hidden');
    automationRunner.setAttribute('aria-hidden', 'false');
  }
  updateAutomationTimer();
  if (automationTimerInterval) clearInterval(automationTimerInterval);
  automationTimerInterval = setInterval(updateAutomationTimer, 100);
  startAutomationPixelReveal();
}

function hideAutomationRunner() {
  if (automationTimerInterval) {
    clearInterval(automationTimerInterval);
    automationTimerInterval = null;
  }
  automationTimerStartedAt = null;
  if (automationRunner) {
    automationRunner.classList.add('hidden');
    automationRunner.setAttribute('aria-hidden', 'true');
  }
  if (automationTimer) automationTimer.textContent = '0.000s';
  stopAutomationPixelReveal();
  setAutomationRunnerText('Ready');
}

// Apply theme based on settings. Preference is 'system' | 'dark' | 'light'
// (set by the options page's Advanced Settings); 'system' resolves live from
// the OS via matchMedia instead of hardening into 'light'/'dark' on first run.
function resolveEffectiveTheme(preference) {
  if (preference === 'system') {
    return (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  return preference;
}

function applyTheme() {
  let preference = localStorage.getItem('fsb-theme');
  if (!['system', 'dark', 'light'].includes(preference)) {
    preference = 'system';
  }
  document.documentElement.setAttribute('data-theme', resolveEffectiveTheme(preference));
}

// Listen for theme changes from options page
window.addEventListener('storage', (e) => {
  if (e.key === 'fsb-theme') {
    applyTheme();
  }
});

// Live-follow OS theme changes while the preference is 'system'
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
}

// Initialize analytics for sidepanel context
let sidepanelAnalytics = null;

function initializeSidepanelAnalytics() {
  try {
    // Create analytics instance for sidepanel
    sidepanelAnalytics = new FSBAnalytics();
    console.log('Sidepanel analytics initialized');
  } catch (error) {
    console.error('Failed to initialize sidepanel analytics:', error);
  }
}

// Listen for analytics updates from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'ANALYTICS_UPDATE' && sidepanelAnalytics) {
    // Reload analytics data when updated
    sidepanelAnalytics.loadStoredData().then(() => {
      console.log('Sidepanel analytics data refreshed');
    });
  }
});

// -- Reconnaissance integration --
let pendingReconTask = null;
// Track multiple recon progress messages keyed by crawlerId
const reconProgressMessages = new Map();

/**
 * Start a reconnaissance crawl from the side panel.
 * Uses a lighter crawl (depth 2, max 15 pages) for speed.
 */
async function startReconFromSidepanel(url, originalTask) {
  pendingReconTask = originalTask;
  const domain = new URL(url).hostname;

  addMessage('Starting reconnaissance on ' + domain + '...', 'system');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'startExplorer',
      url: url,
      maxDepth: 2,
      maxPages: 15,
      autoSaveToMemory: true
    });

    if (!response || !response.success) {
      addMessage('Reconnaissance failed to start: ' + (response?.error || 'Unknown error'), 'system');
      pendingReconTask = null;
    }
  } catch (error) {
    addMessage('Reconnaissance failed: ' + error.message, 'system');
    pendingReconTask = null;
  }
}

/**
 * Handle progress updates from Site Explorer during reconnaissance.
 * Supports multiple concurrent crawlers keyed by crawlerId.
 */
function handleReconProgress(data) {
  const crawlerId = data.crawlerId || 'default';
  const domain = data.domain || '?';

  if (data.status === 'crawling') {
    let progressMsg = reconProgressMessages.get(crawlerId);
    if (!progressMsg) {
      progressMsg = document.createElement('div');
      progressMsg.id = 'recon-progress-' + crawlerId;
      progressMsg.className = 'message system recon-progress';
      chatMessages.appendChild(progressMsg);
      reconProgressMessages.set(crawlerId, progressMsg);
    }
    const percent = data.maxPages > 0 ? Math.round((data.pagesCollected / data.maxPages) * 100) : 0;
    progressMsg.textContent = 'Recon [' + domain + ']: ' + data.pagesCollected + '/' + data.maxPages + ' pages (' + percent + '%)';
    scrollToBottom();
  } else if (data.status === 'completed' || data.status === 'stopped' || data.status === 'error') {
    // Remove the progress message for this crawler
    const progressMsg = reconProgressMessages.get(crawlerId);
    if (progressMsg) {
      progressMsg.remove();
      reconProgressMessages.delete(crawlerId);
    }
  }
}

/**
 * Handle reconnaissance completion -- offer retry with original task.
 */
function handleReconComplete(data) {
  // Clean up any remaining progress messages for this domain
  for (const [id, el] of reconProgressMessages) {
    el.remove();
    reconProgressMessages.delete(id);
  }

  addMessage('Reconnaissance complete! Site map saved for ' + (data?.domain || 'this site') + '.', 'system');

  // Offer retry with the original task
  if (pendingReconTask) {
    const retryDiv = document.createElement('div');
    retryDiv.className = 'message system new';
    retryDiv.textContent = 'Site map ready. Retry your task? ';
    const retryBtn = document.createElement('button');
    retryBtn.className = 'retry-btn';
    retryBtn.textContent = 'Retry with Site Map';
    retryBtn.addEventListener('click', async () => {
      // Phase 11 FINT-20 WR-03 fix -- gate the retry on the foreign-owned
      // check. applyInputLockout dims chatInput/sendBtn/stopBtn/micBtn when
      // the active tab is foreign-owned, but retry buttons are created
      // AFTER the snapshot so they cannot be dimmed via the lockout class.
      // The handleSendMessage entry already fail-closes on foreign-owned
      // (defense-in-depth), but without this guard the click silently
      // drops the user's intent. Early-return + console.warn surfaces the
      // edge case while honoring D-11 (chip is the visible explanation).
      if (await _isActiveTabForeignOwned()) {
        console.warn('[sidepanel] retry blocked -- active tab is foreign-owned');
        return;
      }
      retryDiv.remove();
      chatInput.textContent = pendingReconTask;
      pendingReconTask = null;
      handleSendMessage();
    });
    retryDiv.appendChild(retryBtn);
    chatMessages.appendChild(retryDiv);
    scrollToBottom();
  }
}

// Listen for explorer status and site map saved messages
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'explorerStatusUpdate') {
    handleReconProgress(message.data);
  }
  if (message.type === 'siteMapSaved') {
    handleReconComplete(message.data);
  }
});

// Keep sidepanel progress setting in sync when changed from options
// (Phase 12 FINT-22 (Plan 12-03): default fallback flipped true to match
// boot read semantics per RESEARCH Section 6.4.)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.showSidepanelProgress != null) {
    showSidepanelProgressEnabled = changes.showSidepanelProgress.newValue ?? true;
  }
  if (area === 'session'
      && changes
      && changes.fsbSidepanelDelegationConversations) {
    var nextDelegationEnvelope = changes.fsbSidepanelDelegationConversations.newValue;
    _delegationConversationEnvelope = _delegationValidConversationEnvelope(nextDelegationEnvelope)
      ? _delegationCloneConversationEnvelope(nextDelegationEnvelope)
      : _delegationEmptyConversationEnvelope();
  }
  // Phase 243 plan 03 (UI-02) follow-up: refresh chip when registry mutates
  // for the active tab (ownership claimed/released/transferred). The
  // sidepanel persists across tab switches, so without this branch the chip
  // would show stale ownership data when an agent claims or releases the
  // active tab while the user stays on it.
  //
  // Quick task 260524-7n9: also refresh when fsbAgentClientLabels mutates so
  // a freshly-arriving canonical MCP client label (Claude / Codex / ...)
  // re-renders the chip immediately, without waiting for a tab switch or
  // a registry write that happens to follow.
  if (area === 'session' && changes && (changes.fsbAgentRegistry || changes.fsbAgentClientLabels)) {
    refreshOwnerChip();
    if (changes.fsbAgentRegistry && typeof _refreshSelectedDelegationSnapshot === 'function') {
      _refreshSelectedDelegationSnapshot();
    }
  }
  // debug-sidepanel-agent-name fix: also refresh the chip when any
  // mcpVisualSession:<tabId> key mutates. The MCP visual-session lifecycle
  // entry is written by recordVisualSessionTick (extension/utils/
  // mcp-visual-session-lifecycle.js) AFTER ownership has been claimed in
  // fsbAgentRegistry, i.e. AFTER the first storage-change branch above has
  // already fired and resolved Tier 2 (friendly client label) as null. By
  // the time entry.client lands in storage, no listener observes the write
  // and the chip stays stuck on the Tier 3 formatAgentIdForDisplay
  // short-prefix (e.g., 'agent_95ef8b'). Re-firing refreshOwnerChip on the
  // visual-session key family causes the chip to re-resolve through Tier 2
  // and pick up the friendly label (e.g., 'Claude', 'OpenClaw'). Best-effort
  // key scan (Object.keys + indexOf) -- bounded by at most one entry per
  // owned tab so this is O(1) on typical input.
  if (area === 'session' && changes && typeof changes === 'object') {
    var keys = Object.keys(changes);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf('mcpVisualSession:') === 0) {
        refreshOwnerChip();
        break;
      }
    }
  }
});

// Phase 11 FINT-20 -- foreign-owned input lockout helpers.
//
// applyInputLockout(foreignOwned) toggles the disabled state on the 4 input
// controls (chatInput contenteditable div + sendBtn + stopBtn + micBtn).
// CONTEXT D-10 lists 5 controls, but the existing sidepanel UI uses
// sendBtn for both 'send message' and 'run task' (RESEARCH Section 1.B);
// the 4-control set covers all user-input affordances.
//
// D-11: visual treatment is dimmed/disabled CSS + aria-disabled='true'; NO
// separate banner -- the existing owner chip is the explanation cue and
// the aria-describedby span at sidepanel.html line ~27 supplies
// screen-reader semantics.
//
// D-13: stopBtn is included in the lockout while it remains the legacy
// FSB-Autopilot-local control. A selected delegated run reuses that location
// for its own idempotent kill switch, which must stay operable for its owner.
function applyInputLockout(foreignOwned) {
  var ariaDescribedById = 'fsb-lockout-aria-description';
  var controls = [
    { id: 'chatInput', kind: 'contenteditable' },
    { id: 'sendBtn', kind: 'button' },
    { id: 'stopBtn', kind: 'button' },
    { id: 'micBtn', kind: 'button' }
  ];
  for (var i = 0; i < controls.length; i++) {
    var spec = controls[i];
    var el = document.getElementById(spec.id);
    if (!el) continue;
    var isDelegatedFixedStop = foreignOwned
      && spec.id === 'stopBtn'
      && typeof _delegationUsesFixedStop === 'function'
      && typeof _delegationUiState !== 'undefined'
      && _delegationUsesFixedStop(_delegationUiState.snapshot);
    if (foreignOwned && !isDelegatedFixedStop) {
      if (spec.kind === 'button') {
        el.disabled = true;
      } else {
        el.setAttribute('contenteditable', 'false');
      }
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('aria-describedby', ariaDescribedById);
      el.classList.add('fsb-foreign-owned-disabled');
    } else {
      if (spec.kind === 'button') {
        // Phase 11 FIX (debug-phase-11-tab-swap-stale): restore disabled=false
        // on stopBtn + micBtn. sendBtn is exempt -- it is governed by
        // isRunning via updateSendButtonState (called below). Pre-fix the
        // unlock path ONLY cleared aria-disabled, leaving el.disabled=true
        // forever after a single lockout cycle, which produced the UAT-11
        // symptom "input controls stay disabled after switching to a free
        // tab while autopilot runs on the previous tab".
        if (spec.id !== 'sendBtn') {
          el.disabled = false;
        }
        el.removeAttribute('aria-disabled');
      } else {
        el.setAttribute('contenteditable', 'true');
        el.removeAttribute('aria-disabled');
        // Clear the "Disabled while tab is owned by ..." tooltip that
        // refreshOwnerChip's lock path sets after applyInputLockout(true).
        el.removeAttribute('title');
      }
      el.removeAttribute('aria-describedby');
      el.classList.remove('fsb-foreign-owned-disabled');
    }
  }
  // Restore the correct sendBtn state so isRunning-driven disabled flag is
  // preserved on the unlock path (the existing helper handles both
  // hasContent + isRunning gating). Defensive: helper may not be defined
  // yet in some boot orderings.
  if (typeof updateSendButtonState === 'function') {
    try { updateSendButtonState(); } catch (_e) { /* swallow */ }
  }
  if (!foreignOwned && typeof _applyDelegationComposerLock === 'function') {
    try { _applyDelegationComposerLock(); } catch (_e) { /* swallow */ }
  } else if (typeof _syncDelegationStopControls === 'function'
      && typeof _delegationUiState !== 'undefined') {
    try { _syncDelegationStopControls(_delegationUiState.snapshot); } catch (_e) { /* swallow */ }
  }
}

// Phase 11 FINT-20 -- defense-in-depth runtime gate for handleSendMessage.
// Re-reads active tab + agent registry envelope + shouldShowOwnerChip per
// the same contract refreshOwnerChip uses. Fail-open on any error: storage
// failures do NOT block user sends (the primary defense is the sendBtn
// disabled attribute set by applyInputLockout).
async function _isActiveTabForeignOwned() {
  try {
    if (typeof FSBOwnerChip === 'undefined') return false;
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs && tabs[0];
    if (!tab || typeof tab.id !== 'number') return false;
    var stored = await chrome.storage.session.get('fsbAgentRegistry');
    var envelope = stored && stored.fsbAgentRegistry;
    var ownerAgentId = FSBOwnerChip.findOwnerInEnvelope(envelope, tab.id);
    return FSBOwnerChip.shouldShowOwnerChip(ownerAgentId, MY_SURFACE);
  } catch (_e) {
    return false;
  }
}

// Phase 243 plan 03 (UI-02): refresh the read-only "owned by Agent X" chip.
// Reads the persisted registry envelope from chrome.storage.session (Phase 237
// D-03 write-through) and the active tab; uses FSBOwnerChip pure helpers to
// decide visibility and label format. Bypasses background.js entirely so this
// plan stays Wave-1 zero-overlap with Plan 02's webNavigation listener.
//
// Sidepanel-specific: subscribed to chrome.tabs.onActivated below, since the
// sidepanel persists across tab switches (popup is short-lived and skips this).
async function refreshOwnerChip() {
  try {
    const chipEl = document.getElementById('fsb-owner-chip');
    if (!chipEl) return;
    if (typeof FSBOwnerChip === 'undefined') {
      chipEl.style.display = 'none';
      // Phase 11 FIX (debug-phase-11-tab-swap-stale) + Quick task 260524-7n9:
      // honor the unlock contract on every chip-hidden path. applyInputLockout
      // restores chatInput + stopBtn + micBtn + aria; clearing the
      // _chatLockedByOwnerChip flag keeps updateSendButtonState in sync so the
      // user is not stranded with a disabled input after the helper went away.
      _chatLockedByOwnerChip = false;
      applyInputLockout(false);
      return;
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || typeof tab.id !== 'number') {
      chipEl.style.display = 'none';
      // Phase 11 FIX (debug-phase-11-tab-swap-stale) + Quick task 260524-7n9:
      // the no-active-tab branch must also unlock so controls re-enable when the
      // active-tab race resolves. Clear the _chatLockedByOwnerChip flag so
      // updateSendButtonState stays in sync.
      _chatLockedByOwnerChip = false;
      applyInputLockout(false);
      return;
    }

    // Quick task 260524-7n9: read both the registry envelope AND the per-agent
    // canonical client-label map in a single round-trip. The label map is
    // written by mcp-tool-dispatcher.js _persistAgentClientLabel and lets the
    // chip show "owned by Claude" instead of "owned by agent_<hex>".
    const stored = await chrome.storage.session.get(['fsbAgentRegistry', 'fsbAgentClientLabels']);
    const envelope = stored && stored.fsbAgentRegistry;
    const labelsMap = stored && stored.fsbAgentClientLabels;
    const ownerAgentId = FSBOwnerChip.findOwnerInEnvelope(envelope, tab.id);

    if (!FSBOwnerChip.shouldShowOwnerChip(ownerAgentId, MY_SURFACE)) {
      chipEl.textContent = '';
      chipEl.style.display = 'none';
      // Phase 11 FINT-20 + Quick task 260524-7n9 -- unlock controls when the chip
      // is hidden (either no owner or this surface owns the tab). applyInputLockout
      // restores chatInput + buttons + aria; clearing the _chatLockedByOwnerChip
      // flag keeps updateSendButtonState in sync.
      _chatLockedByOwnerChip = false;
      applyInputLockout(false);
      return;
    }

    // Merged client-label resolution (Phase 11 FINT-19 three-tier + Quick task
    // 260524-7n9 canonical MCP client name). In priority order:
    // Tier 1: legacy:* literal (e.g., legacy:popup, legacy:autopilot).
    // Tier 2: canonical MCP client name (Claude, Codex, Cursor, ...) from the
    //         dispatcher-written fsbAgentClientLabels map, keyed by ownerAgentId.
    // Tier 3: friendly client name from the visual-session lifecycle entry
    //         (Phase 10 D-01 allowlist; e.g., OpenClaw, Claude, FSB Autopilot).
    // Tier 4: formatAgentIdForDisplay short-prefix fallback for raw-FSB-tool
    //         agents that never tick the visual-session pipeline.
    let label;
    if (ownerAgentId.indexOf('legacy:') === 0) {
      label = ownerAgentId;
    } else {
      const clientLabel = (typeof FSBOwnerChip.clientLabelFor === 'function')
        ? FSBOwnerChip.clientLabelFor(ownerAgentId, labelsMap)
        : null;
      if (clientLabel) {
        label = clientLabel;
      } else {
        const friendly = await FSBOwnerChip.lookupClientLabel(
          tab.id,
          (key) => chrome.storage.session.get(key)
        );
        if (friendly) {
          label = friendly;
        } else {
          const formatter = (typeof FsbAgentRegistry !== 'undefined'
            && typeof FsbAgentRegistry.formatAgentIdForDisplay === 'function')
            ? FsbAgentRegistry.formatAgentIdForDisplay
            : null;
          label = FSBOwnerChip.ownerLabelFor(ownerAgentId, formatter);
        }
      }
    }
    chipEl.textContent = FSBOwnerChip.buildChipText(label);
    chipEl.style.display = 'inline-flex';
    // Phase 11 FINT-20 + Quick task 260524-7n9 -- lock controls when the chip
    // renders (tab is foreign-owned). applyInputLockout does the rich lock
    // (chatInput contenteditable + buttons + aria); the _chatLockedByOwnerChip
    // flag composes into updateSendButtonState's OR chain, and the title surfaces
    // which client owns the tab.
    _chatLockedByOwnerChip = true;
    applyInputLockout(true);
    chatInput.title = 'Disabled while tab is owned by ' + label;
    updateSendButtonState();
  } catch (_e) {
    // Chip is best-effort -- never poison sidepanel boot.
  }
}

// Phase 243 plan 03 (UI-02): refresh on tab switch. The sidepanel is
// persistent, so the active tab can change while the surface is open --
// without this listener the chip would show stale ownership data (Threat
// T-243-03-02). Best-effort registration; if chrome.tabs.onActivated is
// unavailable for any reason the chip simply does not auto-refresh.
try {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onActivated
      && typeof chrome.tabs.onActivated.addListener === 'function') {
    // Phase 11 FINT-21 -- extended: also swap conversation history on tab
    // switch (D-14 / D-17 lazy mint). The chip refresh + history swap run
    // sequentially; both are best-effort, so a failure in one does not
    // poison the other.
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      // QT-uof-5 (B-FIX) -- persist the OUTGOING tab's
      // (currentStatusMessage, currentActionGroup) BEFORE the swap clobbers
      // them. Read _activeTabIdSnapshot here (pre-reassignment) so the
      // entry is keyed by the tab the user is leaving.
      try { _persistTabStatusIntent(_activeTabIdSnapshot); } catch (_e) { /* swallow */ }

      try { await refreshOwnerChip(); } catch (_e) { /* swallow */ }
      try { await swapToTabConversation(activeInfo && activeInfo.tabId); } catch (_e) { /* swallow */ }

      // QT-93i-02 -- after the conversation swap, re-sync the running-state
      // UI to reflect the newly-active tab's per-tab state. Without this,
      // the sendBtn / statusDot / statusText reflect whatever tab was
      // previously active. Tab swaps must surface the active tab's
      // running state immediately so the send button enable/disable is
      // correct on every keystroke after the swap.
      try {
        if (activeInfo && typeof activeInfo.tabId === 'number') {
          _activeTabIdSnapshot = activeInfo.tabId;
          var snap = _getTabRunningEntry(activeInfo.tabId);
          if (snap.isRunning) {
            setRunningState(activeInfo.tabId, snap.sessionId || null);
          } else {
            setIdleState(activeInfo.tabId);
          }
        }
      } catch (_e) { /* swallow: re-sync is best-effort */ }

      // QT-uof-5 (B-FIX) -- restore the INCOMING tab's previously-persisted
      // (currentStatusMessage, currentActionGroup). When the tab has no
      // entry (never had a loader), this nulls the module-scope vars so
      // subsequent code does not inherit the outgoing tab's references.
      try { _restoreTabStatusIntent(_activeTabIdSnapshot); } catch (_e) { /* swallow */ }
      try { await _hydrateDelegationForSelectedConversation(); }
      catch (_e) { /* delegated tab resync is best-effort */ }
    });
  }
} catch (_e) {
  // swallow: chip auto-refresh is non-critical
}

// Phase 11 FINT-21 -- chrome.tabs.onRemoved listener: drop the tab's
// entry from the per-tab envelope (CONTEXT D-14). NO discard-event
// listener registered -- discarded tabs preserve their entry intact
// (D-15) so the tab can re-restore with its conversation.
try {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onRemoved
      && typeof chrome.tabs.onRemoved.addListener === 'function') {
    chrome.tabs.onRemoved.addListener(async (tabId) => {
      // Phase 12 FINT-23 (Plan 12-02) EC-05 defense: resolve the bound
      // convId BEFORE the Phase 11 drop nulls the byTab entry, then cancel
      // any pending debouncer write + drop the message-log entry. Order:
      // cancel -> drop in-memory buffer -> drop envelope -> persist. This
      // ensures the would-have-fired 200ms timer cannot resurrect the
      // dropped entry (the would-be-fired write reads the just-emptied
      // buffer + returns immediately, AND the timer is cleared anyway).
      var droppedConvId = null;
      try {
        if (typeof FSBSidepanelTabConvStore !== 'undefined'
            && typeof FSBSidepanelTabConvStore.getTabConversation === 'function'
            && FSBSidepanelTabConvStore.isValidEnvelope(tabConvEnvelope)) {
          droppedConvId = FSBSidepanelTabConvStore.getTabConversation(tabConvEnvelope, tabId);
        }
      } catch (_e) { /* swallow */ }

      try { await dropTabConversation(tabId); } catch (_e) { /* swallow */ }

      // Phase 12 FINT-23 (Plan 12-02): drop message-log entry + cancel pending
      // debouncer write so EC-05 resurrection-after-drop does not occur.
      if (droppedConvId
          && typeof FSBSidepanelMessageLog !== 'undefined'
          && typeof FSBSidepanelMessageLog.dropConversationMessages === 'function') {
        if (_messageLogDebouncer && typeof _messageLogDebouncer.cancel === 'function') {
          _messageLogDebouncer.cancel(droppedConvId);
        }
        if (_messageLogPendingBuffer && typeof _messageLogPendingBuffer.delete === 'function') {
          _messageLogPendingBuffer.delete(droppedConvId);
        }
        try {
          var msgBag = await chrome.storage.local.get(FSBSidepanelMessageLog.STORAGE_KEY);
          var msgEnvelope = msgBag[FSBSidepanelMessageLog.STORAGE_KEY];
          if (FSBSidepanelMessageLog.isValidEnvelope(msgEnvelope)) {
            FSBSidepanelMessageLog.dropConversationMessages(msgEnvelope, droppedConvId);
            var msgPayload = {};
            msgPayload[FSBSidepanelMessageLog.STORAGE_KEY] = msgEnvelope;
            await chrome.storage.local.set(msgPayload);
          }
        } catch (_e) {
          // Best-effort: failure leaves orphan entry; LRU eviction reaps eventually.
        }
      }
    });
  }
} catch (_e) { /* swallow */ }

// Phase 11 FIX (debug-phase-11-tab-swap-stale) -- defense-in-depth backstop
// for chrome.tabs.onActivated. The MV3 sidepanel page document context can
// in rare cases miss an onActivated fire when a brand-new tab is created
// and immediately becomes active as part of the create (Ctrl+T, opener-
// linked target=_blank). Adding chrome.windows.onFocusChanged ensures the
// chip + chat surface re-resolve against the user's real active tab
// whenever window focus changes. Best-effort: any throw inside swallows.
//
// Implementation note: onFocusChanged fires with windowId = -1 (WINDOW_ID_NONE)
// when focus leaves Chrome entirely. We skip the no-op case so we do not
// query a stale tab during the un-focused window. When focus returns to a
// real Chrome window, we resolve the active tab in THAT window (not the
// sidepanel's hosting window blindly) via tabs.query({active:true, windowId}).
try {
  if (typeof chrome !== 'undefined' && chrome.windows && chrome.windows.onFocusChanged
      && typeof chrome.windows.onFocusChanged.addListener === 'function') {
    chrome.windows.onFocusChanged.addListener(async (windowId) => {
      try {
        if (typeof windowId !== 'number' || windowId < 0) return;
        await refreshOwnerChip();
        var tabs = await chrome.tabs.query({ active: true, windowId: windowId });
        if (tabs && tabs[0] && typeof tabs[0].id === 'number') {
          _activeTabIdSnapshot = tabs[0].id;  // QT-93i-02
          await swapToTabConversation(tabs[0].id);
          await _hydrateDelegationForSelectedConversation();
        }
      } catch (_e) { /* swallow */ }
    });
  }
} catch (_e) { /* swallow */ }

// Initialize side panel
document.addEventListener('DOMContentLoaded', async () => {
  console.log(`FSB v${chrome.runtime.getManifest().version} side panel loaded`);

  // Apply theme first
  applyTheme();

  // Load sidepanel progress setting (Phase 12 FINT-22 (Plan 12-03): default flipped true per RESEARCH Section 6.4).
  try {
    const stored = await chrome.storage.local.get(['showSidepanelProgress']);
    showSidepanelProgressEnabled = stored.showSidepanelProgress ?? true;
  } catch (e) {
    showSidepanelProgressEnabled = true;
  }

  // Phase 11 FINT-21 -- per-tab envelope hydration + legacy migration
  // (replaces previous single-key conversation init flow).
  await initTabConversationStore();
  await _loadDelegationConversationEnvelope();

  // Phase 12 FINT-23 -- init message-log debouncer + beforeunload force flush.
  if (typeof FSBSidepanelMessageLog !== 'undefined'
      && typeof FSBSidepanelMessageLog.createDebouncer === 'function') {
    _messageLogDebouncer = FSBSidepanelMessageLog.createDebouncer({
      debounceMs: FSBSidepanelMessageLog.DEFAULT_DEBOUNCE_MS
    });
    try {
      window.addEventListener('beforeunload', function () {
        if (_messageLogDebouncer && typeof _messageLogDebouncer.flushAll === 'function') {
          _messageLogDebouncer.flushAll().catch(function () {});
        }
      });
    } catch (_e) {
      // Sidepanel context may lack window in unusual edge cases.
    }
  }

  // Initialize analytics
  initializeSidepanelAnalytics();
  
  // Check if extension is locked (using encrypted config)
  const hasEncryptedConfig = await checkEncryptedConfig();
  
  if (hasEncryptedConfig) {
    // Check if already unlocked in this session
    const session = await chrome.storage.session.get('masterPassword');
    
    if (!session.masterPassword) {
      // Need to unlock - show unlock UI or redirect
      addMessage('Extension is locked. Please unlock it first by opening the popup.', 'error');
      return;
    }
  }
  
  // Load saved task if any and restore it to input
  chrome.storage.local.get(['lastTask'], (data) => {
    if (data.lastTask && data.lastTask.trim()) {
      chatInput.textContent = data.lastTask;
      updateSendButtonState();
    }
  });
  
  // QT-wnz Codex-2 -- send activeTabId so background returns only sessions
  // owned by THIS tab. Pre-wnz the call omitted activeTabId and background
  // returned sessionIds[0] globally, which is wrong when another tab has
  // an older active session.
  chrome.runtime.sendMessage({ action: 'getStatus', activeTabId: _activeTabIdSnapshot }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('Background script not ready yet');
      return;
    }
    if (response && response.activeSessions > 0) {
      // QT-93i-02 -- wire boot-restore running state to the cached active tab.
      setRunningState(_activeTabIdSnapshot, response.currentSessionId || null);
      // Recover sessionId from background if UI lost it (e.g., after service worker restart)
      if (!currentSessionId && response.currentSessionId) {
        currentSessionId = response.currentSessionId;
        console.log('FSB: Recovered sessionId from background:', currentSessionId);
      }
    }
  });
  
  // Set UI mode preference
  await chrome.storage.local.set({ uiMode: 'sidepanel' });

  // Phase 243 plan 03 (UI-02): render the read-only owner chip on load. The
  // chrome.tabs.onActivated subscription registered above keeps the chip in
  // sync as the user switches tabs in the persistent sidepanel.
  refreshOwnerChip();

  // History list event delegation for delete buttons
  const historyListEl = document.getElementById('historyList');
  if (historyListEl) {
    historyListEl.addEventListener('click', async (e) => {
      const replayBtn = e.target.closest('.history-replay-btn');
      if (replayBtn) {
        e.stopPropagation();
        // Phase 11 FINT-20 WR-03 fix -- gate history replay on the
        // foreign-owned check. The history-replay-btn is dynamically
        // rendered into the history list AFTER applyInputLockout's
        // snapshot, so it cannot be dimmed via the lockout class.
        // Without this guard, clicking replay while another agent owns
        // the active tab would silently fail downstream (startReplay
        // dispatches a replaySession message that targets the active
        // tab). Early-return + console.warn surfaces the edge case.
        if (await _isActiveTabForeignOwned()) {
          console.warn('[sidepanel] history replay blocked -- active tab is foreign-owned');
          return;
        }
        const sessionId = replayBtn.dataset.sessionId;
        if (sessionId) {
          startReplay(sessionId);
        }
        return;
      }

      const deleteBtn = e.target.closest('.history-delete-btn');
      if (deleteBtn) {
        e.stopPropagation();
        const sessionId = deleteBtn.dataset.sessionId;
        if (sessionId) {
          await deleteHistorySession(sessionId);
        }
        return;
      }

      const historyItem = e.target.closest('.history-item');
      if (historyItem) {
        const sessionId = historyItem.dataset.sessionId;
        if (sessionId) {
          loadSessionView(sessionId);
        }
      }
    });
  }

  // Clear All button
  const clearAllHistoryBtn = document.getElementById('clearAllHistoryBtn');
  if (clearAllHistoryBtn) {
    clearAllHistoryBtn.addEventListener('click', clearAllHistorySessions);
  }

  // Initialize speech-to-text for microphone button
  if (micBtn && typeof FSBSpeechToText !== 'undefined') {
    new FSBSpeechToText(chatInput, micBtn, sendBtn);
  }

  // Phase 11 debug-phase-11-sidepanel-reopen-empty -- hydrate the chat
  // surface from the per-tab conversation's persisted session log BEFORE
  // adding the welcome message. If conversationId is null (D-17 lazy
  // mint: no entry minted yet on this tab) OR no matching session rows
  // exist (fresh conversation), the welcome message renders into an
  // empty chat as before. Otherwise prior user prompts + ai completions
  // replay in chronological order and the welcome is suppressed -- the
  // user sees their conversation continuation, not a redundant greeting.
  var hydratedCount = 0;
  try {
    hydratedCount = await hydrateChatFromConversationId(conversationId);
  } catch (_e) { /* swallow: hydrate is best-effort */ }

  if (hydratedCount === 0) {
    // No prior conversation to restore -- show the welcome greeting.
    addMessage('Welcome to FSB. How can I help?', 'system');
  }

  await _hydrateDelegationForSelectedConversation();

  // Focus the input
  if (!_delegationUiState.composerLocked) chatInput.focus();
});

// Check if using encrypted configuration
async function checkEncryptedConfig() {
  try {
    const stored = await chrome.storage.local.get(['apiKey', 'captchaApiKey']);
    
    // Check if any key looks encrypted
    for (const value of Object.values(stored)) {
      if (value && typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          if (parsed.encrypted && parsed.salt && parsed.iv) {
            return true;
          }
        } catch {
          // Not JSON, so not encrypted
        }
      }
    }
    return false;
  } catch (error) {
    console.error('Error checking encrypted config:', error);
    return false;
  }
}

// Event listeners
sendBtn.addEventListener('click', handleSendMessage);
stopBtn.addEventListener('click', _handleFixedStop);
newChatBtn.addEventListener('click', startNewChat);
settingsBtn.addEventListener('click', openSettings);
historyBtn.addEventListener('click', toggleHistoryView);

// PERF: Debounced storage save to avoid writes on every keystroke
let _saveTaskTimer = null;
function debouncedSaveTask() {
  clearTimeout(_saveTaskTimer);
  _saveTaskTimer = setTimeout(() => {
    chrome.storage.local.set({ lastTask: chatInput.textContent.trim() });
  }, 500);
}

function _handleDelegationComposerInput() {
  _delegationComposerEditRevision += 1;
  if (_delegationUiState.pendingIntentId !== null) {
    _clearDelegationPreflightIntent(_delegationUiState.pendingIntentId);
  }
  updateSendButtonState();
  debouncedSaveTask();
}

// Chat input event handlers
chatInput.addEventListener('input', _handleDelegationComposerInput);

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
});

// Handle paste events to maintain plain text
chatInput.addEventListener('paste', (e) => {
  e.preventDefault();
  const text = e.clipboardData.getData('text/plain');
  document.execCommand('insertText', false, text);
});

// Update send button state based on input content
// Quick task 260524-7n9: composes the chip-owned chat lock into the existing
// gating chain via OR -- hasContent governs the empty-input case, isRunning
// governs in-flight automation, _chatLockedByOwnerChip is the external-agent
// ownership gate. NO normal lifecycle transition leaves the input enabled
// while the chip is showing; refreshOwnerChip is the sole writer of the flag.
function updateSendButtonState() {
  const hasContent = chatInput.textContent.trim().length > 0;
  sendBtn.disabled = !hasContent
    || isRunning
    || _chatLockedByOwnerChip
    || _delegationUiState.composerLocked
    || _delegationUiState.pendingPreflight
    || _delegationUiState.pendingContinuation
    || _delegationUiState.pendingStart;
}

// Handle sending a message
async function handleSendMessage() {
  const rawMessage = chatInput.textContent;
  const message = rawMessage.trim();

  if (!message
      || isRunning
      || _delegationUiState.composerLocked
      || _delegationUiState.pendingPreflight
      || _delegationUiState.pendingContinuation
      || _delegationUiState.pendingStart) {
    return;
  }

  var intentId = _createDelegationIntentId();
  if (!_beginDelegationPreflightIntent(
    intentId,
    message,
    rawMessage,
    _delegationComposerEditRevision
  )) return;
  _delegationUiState.errorCode = null;
  updateSendButtonState();

  // Phase 11 FINT-20 -- defense-in-depth runtime gate. The sendBtn
  // disabled attribute (set by applyInputLockout via refreshOwnerChip) is
  // the primary defense; this gate guards against a stale UI state where
  // the button was cleared by a sibling refresh racing with tab
  // activation. Fail-open: storage errors do NOT block sends.
  if (await _isActiveTabForeignOwned()) {
    _clearDelegationPreflightIntent(intentId);
    updateSendButtonState();
    return;
  }
  if (!_delegationPreflightIntentIsCurrent(intentId)) {
    _clearDelegationPreflightIntent(intentId);
    updateSendButtonState();
    return;
  }

  var preflight = await _sendDelegationCommand({
    type: 'FSB_DELEGATION_PREFLIGHT',
    task: message,
    intentId: intentId
  });
  if (!_delegationPreflightIntentIsCurrent(intentId)) {
    _clearDelegationPreflightIntent(intentId);
    updateSendButtonState();
    return;
  }

  if (_delegationValidPreflightResponse(preflight)
      && preflight.ok === true
      && preflight.kind === 'api') {
    _clearDelegationPreflightIntent(intentId);
    updateSendButtonState();
    await _handleLegacySendMessage(message);
    return;
  }

  if (!_delegationValidPreflightResponse(preflight)
      || preflight.ok !== true
      || preflight.kind !== 'agent') {
    var safePreflightFailure = _delegationValidPreflightResponse(preflight)
      && preflight.ok === false
      ? preflight
      : {
        ok: false,
        code: 'agent_offline',
        providerId: '',
        providerLabel: 'Selected provider'
      };
    _clearDelegationPreflightIntent(intentId);
    _delegationUiState.task = message;
    _delegationUiState.errorCode = safePreflightFailure.code;
    _renderDelegationPreflightFailure(safePreflightFailure);
    updateSendButtonState();
    return;
  }

  _delegationUiState.task = message;
  _delegationUiState.providerId = preflight.providerId;
  _delegationUiState.providerLabel = preflight.providerLabel;
  if (!_continueDelegationPreflightIntent(intentId)) {
    _clearDelegationPreflightIntent(intentId);
    updateSendButtonState();
    return;
  }
  updateSendButtonState();
  var consent = await _sendDelegationCommand({
    type: 'FSB_DELEGATION_CONSENT',
    task: message
  });
  if (!_delegationContinuationIntentIsCurrent(intentId)) {
    _clearDelegationPreflightIntent(intentId);
    updateSendButtonState();
    return;
  }
  _clearDelegationPreflightIntent(intentId);
  if (!_delegationValidConsentResponse(consent)
      || consent.providerId !== _delegationUiState.providerId
      || consent.providerLabel !== _delegationUiState.providerLabel) {
    _delegationUiState.errorCode = 'consent_required';
    _renderDelegationPreflightFailure({ code: 'consent_required' });
    updateSendButtonState();
    return;
  }

  _delegationUiState.challengeId = consent.challengeId;
  _delegationUiState.challengeExpiresAt = consent.expiresAt;
  if (consent.trusted === true
      && consent.challengeId === null
      && consent.expiresAt === null) {
    await _beginDelegationStart(null);
    return;
  }
  if (consent.trusted === false
      && typeof consent.challengeId === 'string'
      && consent.challengeId.length > 0
      && Number.isSafeInteger(consent.expiresAt)) {
    _renderDelegationConsent({ focusHeading: true });
    return;
  }
  _delegationUiState.errorCode = 'consent_required';
  _renderDelegationPreflightFailure({ code: 'consent_required' });
  updateSendButtonState();
}

async function _handleLegacySendMessage(message) {

  // Phase 11 FINT-21 -- lazy-mint OR touch the active tab's conversationId.
  // D-17 lazy mint: this is the first persistence point for a tab the
  // user is chatting in. Failure to mint falls back to direct mint inside
  // the helper; never blocks the send path.
  try { conversationId = await ensureTabConversationForActiveTab(false); } catch (_e) { /* swallow */ }

  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // Handle /agent slash commands
  // if (message.startsWith('/agent')) {
  //   chatInput.textContent = '';
  //   updateSendButtonState();
  //   addMessage(message, 'user');
  //   handleAgentCommand(message);
  //   return;
  // }

  try {
    // Add user message to chat
    addMessage(message, 'user');

    // Clear input
    chatInput.textContent = '';
    updateSendButtonState();
    
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Note: Restriction checking is now handled by background script with smart navigation
    
    // Phase 240 D-02: ensure legacy:sidepanel agentId is synthesized BEFORE
    // dispatching startAutomation. The agentId + ownershipToken thread into
    // the envelope so handleStartAutomation can bindTab the target tab
    // under legacy:sidepanel (D-08 4th site).
    const legacy = await ensureLegacySidepanelAgent();

    // Send start command to background
    chrome.runtime.sendMessage({
      action: 'startAutomation',
      task: message,
      tabId: tab.id,
      conversationId: conversationId,
      agentId: legacy && legacy.agentId,
      ownershipToken: legacy && legacy.ownershipToken
    }, (response) => {
      if (chrome.runtime.lastError) {
        addMessage(`Error communicating with background script: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }

      if (response && response.success) {
        // QT-93i-02 -- thread the originating tab.id so the per-tab map
        // records THIS tab's running state (not the active tab's, which
        // is normally the same here but is the wrong assumption to bake in).
        currentSessionId = response.sessionId;
        setRunningState(tab && tab.id, response.sessionId);
        addStatusMessage(response.continued ? 'Continuing...' : 'Starting automation...');
      } else {
        const errorMsg = response ? response.error : 'Unknown error';
        if (response && response.isChromePage) {
          // Show Chrome page error as plain text, not in a bubble
          showChromepageError(errorMsg);
        } else {
          addMessage(`I encountered an error: ${errorMsg}`, 'error');
        }
        setIdleState(_activeTabIdSnapshot);
      }
    });
    
  } catch (error) {
    addMessage(`Something went wrong: ${error.message}`, 'error');
    setIdleState(_activeTabIdSnapshot);
  }
}

// Stop automation
function stopAutomation() {
  console.log('Side panel: Stop button clicked');
  console.log('Side panel: Current session ID:', currentSessionId);
  
  if (!currentSessionId) {
    console.log('Side panel: No active session to stop');
    addMessage('No active automation to stop.', 'system');
    return;
  }
  
  stopRequested = true;
  
  console.log('Side panel: Sending stop message to background script');
  chrome.runtime.sendMessage({
    action: 'stopAutomation',
    sessionId: currentSessionId
  }, (response) => {
    console.log('Side panel: Stop automation response:', response);
    
    if (chrome.runtime.lastError) {
      console.error('Side panel: Chrome runtime error:', chrome.runtime.lastError);
      addMessage(`Error communicating with background script: ${chrome.runtime.lastError.message}`, 'error');
      stopRequested = false;
      return;
    }
    
    if (response && response.success) {
      // Complete any active status message before setting idle state
      if (currentStatusMessage) {
        completeStatusMessage('Automation stopped', 'system');
      }
      setIdleState(_resolveTabIdForSession(currentSessionId));
      currentSessionId = null;
      stopRequested = false;
      console.log('Side panel: Automation stopped successfully');
    } else {
      const errorMsg = response ? response.error : 'Unknown error';
      if (response && response.alreadyEnded) {
        // QT-uof-4 (C-FIX) -- the session completed cleanly between UI
        // state and stop-click. Treat as a friendly outcome: complete
        // the loader DOM (or render a system message), set idle, and
        // skip the misleading 'Session not found' error toast. See
        // .planning/debug/cluster1-routing.md.
        if (currentStatusMessage) {
          completeStatusMessage('Already completed', 'system');
        } else {
          addMessage('Already completed', 'system');
        }
        setIdleState(_resolveTabIdForSession(currentSessionId));
        currentSessionId = null;
        stopRequested = false;
        console.log('Side panel: Stop arrived after natural completion (alreadyEnded)');
      } else {
        addMessage(`Error stopping automation: ${errorMsg}`, 'error');
        stopRequested = false;
        console.error('Side panel: Stop automation failed:', errorMsg);
      }
    }
  });
}

// Start new chat session
async function startNewChat() {
  // Switch back to chat view if history is showing
  if (isHistoryViewActive) {
    showChatView();
  }

  // Stop any running automation first
  if (isRunning && currentSessionId) {
    chrome.runtime.sendMessage({
      action: 'stopAutomation',
      sessionId: currentSessionId
    });
  }
  if (_delegationStopIsActionable(_delegationUiState.snapshot)) {
    await _stopDelegation();
    if (_delegationStopIsActionable(_delegationUiState.snapshot)) return;
  }

  // Reset session state
  currentSessionId = null;
  stopRequested = false;

  // Phase 11 FINT-21 -- mint a fresh conversation in the current tab by
  // overwriting the existing entry.
  //
  // Phase 12 WR-01 fix: AWAIT the fresh-mint before addMessage('Welcome...')
  // so the new conversationId is bound BEFORE the welcome message's
  // write-through fires via addMessage -> _persistMessage. Without await,
  // the welcome was either persisted under the OLD convId or dropped when
  // _persistMessage saw a stale/null conversationId. The await guarantees
  // the welcome lands in the FRESH conversation's persisted log so the
  // next reopen hydrate replays it consistently.
  try {
    await ensureTabConversationForActiveTab(true);
  } catch (_e) { /* swallow -- UI clearing still proceeds below */ }

  // Clear chat messages
  chatMessages.innerHTML = '';

  // Reset UI state -- QT-93i-02 explicit current tab for safety.
  setIdleState(_activeTabIdSnapshot);

  // Clear any saved task
  chrome.storage.local.set({ lastTask: '' });

  // Clear input field
  chatInput.textContent = '';
  updateSendButtonState();

  _resetDelegationSelection(conversationId);

  // Add fresh welcome message
  addMessage('Welcome to FSB. How can I help?', 'system');
  _renderDelegationReadyState();
  _delegationUiState.subscribed = true;

  // Focus the input
  chatInput.focus();

  console.log('New chat session started');
}


// Liveness poll -- detects orphaned running state when all upstream notifications were lost
function checkSessionLiveness() {
  if (!isRunning || !currentSessionId) return;
  chrome.runtime.sendMessage(
    { action: 'checkSessionAlive', sessionId: currentSessionId },
    (response) => {
      if (chrome.runtime.lastError || !response || response.alive === false) {
        livenessFailCount++;
        console.warn('[FSB sidepanel] Liveness check failed', {
          sessionId: currentSessionId,
          failCount: livenessFailCount,
          error: chrome.runtime.lastError?.message || null,
          alive: response?.alive,
          status: response?.status || null
        });
        if (livenessFailCount >= 2) {
          console.warn('[FSB sidepanel] Orphan detected after 2 consecutive failures, recovering');
          addMessage('Session ended unexpectedly. Ready for your next task.', 'error');
          setIdleState(_resolveTabIdForSession(currentSessionId));
        }
      } else {
        livenessFailCount = 0;
      }
    }
  );
}

// QT-93i-02 -- per-tab running state. Optional explicit tabId; defaults
// to the cached active tab. Writes to the per-tab map, then mirrors to
// module-scope `isRunning` + `currentSessionId` when the target tabId
// IS the active tab (so the existing readers like updateSendButtonState
// see the correct snapshot). Other tabs' state is preserved on the map
// so swapping back to them restores their UI on chrome.tabs.onActivated.
function setRunningState(tabId, sessionId) {
  var targetTabId = (typeof tabId === 'number') ? tabId : _activeTabIdSnapshot;
  var resolvedSessionId = (typeof sessionId === 'string' && sessionId.length > 0)
    ? sessionId
    : (currentSessionId || null);

  if (typeof targetTabId === 'number') {
    var entry = _getTabRunningEntry(targetTabId);
    var previousSessionId = entry.sessionId;
    var shouldResetStartedAt = !entry.isRunning ||
      previousSessionId !== resolvedSessionId ||
      typeof entry.startedAt !== 'number';
    entry.isRunning = true;
    entry.sessionId = resolvedSessionId;
    if (shouldResetStartedAt) entry.startedAt = Date.now();
  }

  var isActiveTab = (typeof targetTabId === 'number' && targetTabId === _activeTabIdSnapshot);
  if (isActiveTab) {
    var activeEntry = _getTabRunningEntry(targetTabId);
    isRunning = true;
    if (resolvedSessionId) currentSessionId = resolvedSessionId;
    sendBtn.disabled = true;
    stopBtn.classList.remove('hidden');
    statusDot.classList.add('running');
    statusText.textContent = 'Working';
    if (typeof showAutomationRunner === 'function') showAutomationRunner(activeEntry.startedAt, 'Working');
    updateSendButtonState();
    _syncDelegationStopControls(_delegationUiState.snapshot);
    livenessFailCount = 0;
    if (livenessInterval) clearInterval(livenessInterval);
    livenessInterval = setInterval(checkSessionLiveness, 10000);
  }
}

// QT-93i-02 -- per-tab idle state. Optional explicit tabId; defaults to
// the cached active tab. The existing cleanup (livenessInterval, action
// group reset, status message cleanup) only fires for the active tab so
// background-tab completions do NOT clobber the active tab's currentStatusMessage.
function setIdleState(tabId) {
  var targetTabId = (typeof tabId === 'number') ? tabId : _activeTabIdSnapshot;

  if (typeof targetTabId === 'number') {
    var entry = _getTabRunningEntry(targetTabId);
    entry.isRunning = false;
    entry.sessionId = null;
    entry.startedAt = null;
  }

  var isActiveTab = (typeof targetTabId === 'number' && targetTabId === _activeTabIdSnapshot);
  if (isActiveTab) {
    if (livenessInterval) { clearInterval(livenessInterval); livenessInterval = null; }
    livenessFailCount = 0;
    isRunning = false;
    currentSessionId = null;
    sendBtn.disabled = false;
    stopBtn.classList.add('hidden');
    statusDot.classList.remove('running', 'error');
    statusText.textContent = 'Ready';
    if (typeof hideAutomationRunner === 'function') hideAutomationRunner();

    // Clean up any remaining status message with loader (active-tab only).
    if (currentStatusMessage) {
      currentStatusMessage = null;
    }
    currentActionGroup = null;
    // QT-uof-5 (B-FIX) -- active tab is now idle; the per-tab intent mirror
    // for this tab should match (statusMessage = null, actionGroup = null).
    // Drop the entry so a future swap-IN does not restore a stale loader.
    _clearTabStatusIntent(_activeTabIdSnapshot);
    updateSendButtonState();
    _syncDelegationStopControls(_delegationUiState.snapshot);
  } else if (typeof targetTabId === 'number') {
    // QT-uof-5 (B-FIX) -- background tab transitioned to idle. Drop its
    // per-tab intent so a future swap-IN does not restore a stale loader
    // reference (the DOM the loader pointed at may have been removed by
    // the active-tab's chatMessages.innerHTML wipe during the swap-out
    // earlier; we never want to re-set currentStatusMessage to a detached
    // node).
    _clearTabStatusIntent(targetTabId);
  }
}

// QT-93i-02 -- per-tab error state. Same pattern as setIdleState; only
// the active tab's UI is mutated. Background-tab errors update the per-tab
// entry so swapping back to that tab can show an error indicator if we
// later wire one (out of scope for this task).
function setErrorState(tabId) {
  var targetTabId = (typeof tabId === 'number') ? tabId : _activeTabIdSnapshot;

  if (typeof targetTabId === 'number') {
    var entry = _getTabRunningEntry(targetTabId);
    entry.isRunning = false;
    entry.startedAt = null;
    // sessionId left as-is so error reporting can still resolve it.
  }

  var isActiveTab = (typeof targetTabId === 'number' && targetTabId === _activeTabIdSnapshot);
  if (isActiveTab) {
    isRunning = false;
    sendBtn.disabled = false;
    stopBtn.classList.add('hidden');
    statusDot.classList.add('error');
    statusText.textContent = 'Error';
    if (typeof hideAutomationRunner === 'function') hideAutomationRunner();
    updateSendButtonState();
    _syncDelegationStopControls(_delegationUiState.snapshot);
  }
}

// Global reference to current status message
let currentStatusMessage = null;

// Collapsible debug panel for action steps (lives inside the status message)
let currentActionGroup = null;

// QT-uof-5 (B-FIX) -- per-tab mirror of (currentStatusMessage,
// currentActionGroup). The module-scope vars above are SINGLE -- when the
// user switches tabs while one tab has a loader and another has a different
// loader, the swap clobbers them. Eagerly persisted on tab swap-OUT;
// lazily restored on tab swap-IN. Treats both fields as a single per-tab
// intent pair (audit: currentActionGroup has the EXACT same lifecycle as
// currentStatusMessage -- set inside ensureActionGroup which returns null
// without currentStatusMessage; cleared at the same sites). See
// .planning/debug/cluster1-routing.md Cluster 2 leftover items.
var _tabStatusIntentMap = new Map(); // Map<tabId, {statusMessage, actionGroup}>

function _persistTabStatusIntent(tabId) {
  if (typeof tabId !== 'number') return;
  _tabStatusIntentMap.set(tabId, {
    statusMessage: currentStatusMessage,
    actionGroup: currentActionGroup
  });
}

function _restoreTabStatusIntent(tabId) {
  if (typeof tabId !== 'number') {
    currentStatusMessage = null;
    currentActionGroup = null;
    return;
  }
  var entry = _tabStatusIntentMap.get(tabId);
  if (entry) {
    currentStatusMessage = entry.statusMessage || null;
    currentActionGroup = entry.actionGroup || null;
  } else {
    currentStatusMessage = null;
    currentActionGroup = null;
  }
}

function _clearTabStatusIntent(tabId) {
  if (typeof tabId !== 'number') return;
  _tabStatusIntentMap.delete(tabId);
}

function ensureActionGroup() {
  if (currentActionGroup) return currentActionGroup;
  if (!currentStatusMessage) return null;

  const group = document.createElement('div');
  group.className = 'action-summary-group';
  const header = document.createElement('div');
  header.className = 'action-summary-header';
  header.innerHTML = '<span class="action-chevron">></span><span class="action-summary-count">0 actions completed</span>';
  header.addEventListener('click', () => {
    const list = group.querySelector('.action-summary-list');
    const chevron = group.querySelector('.action-chevron');
    if (list.classList.contains('collapsed')) {
      list.classList.remove('collapsed');
      chevron.classList.add('expanded');
    } else {
      list.classList.add('collapsed');
      chevron.classList.remove('expanded');
    }
  });
  const list = document.createElement('div');
  list.className = 'action-summary-list collapsed';
  group.appendChild(header);
  group.appendChild(list);

  // Place directly on the status message div (outside .message-content flex row)
  currentStatusMessage.appendChild(group);

  currentActionGroup = group;
  return group;
}

function addActionMessage(text) {
  // Phase 12 FINT-23 (Plan 12-02): persistence ALWAYS fires (CONTEXT D-10);
  // DOM render below stays gated by showSidepanelProgressEnabled until
  // Plan 12-03 flips the default to true (FINT-22).
  _persistMessage('assistant', text, 'tool');

  if (!showSidepanelProgressEnabled) return;

  const group = ensureActionGroup();
  if (!group) return;

  // Append new action entry into the list
  const list = group.querySelector('.action-summary-list');
  const entry = document.createElement('div');
  entry.className = 'collapsed-action';
  entry.textContent = text;
  list.appendChild(entry);

  // Update count label
  const countEl = group.querySelector('.action-summary-count');
  if (countEl) {
    countEl.textContent = `${list.children.length} action${list.children.length === 1 ? '' : 's'} completed`;
  }

  scrollToBottom();
}

// Add dynamic status message anchor for progress/completion updates
function addStatusMessage(text, type = 'ai') {
  // Remove any existing status message (and its embedded action group)
  if (currentStatusMessage) {
    currentStatusMessage.remove();
    currentActionGroup = null;
  }
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `message status-message status-anchor`;
  
  const messageContent = document.createElement('div');
  messageContent.className = 'message-content';
  
  // Create status text
  const statusTextEl = document.createElement('span');
  statusTextEl.className = 'status-text';
  statusTextEl.textContent = text;
  setAutomationRunnerText(text);
  
  // Progress container (hidden until progress data arrives)
  const progressContainer = document.createElement('div');
  progressContainer.className = 'progress-container hidden';
  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';
  const progressFill = document.createElement('div');
  progressFill.className = 'progress-fill';
  progressBar.appendChild(progressFill);
  const progressLabel = document.createElement('span');
  progressLabel.className = 'progress-label';
  progressContainer.appendChild(progressBar);
  progressContainer.appendChild(progressLabel);

  // Assemble the message
  messageContent.appendChild(statusTextEl);
  if (showSidepanelProgressEnabled) {
    messageContent.appendChild(progressContainer);
  }
  messageDiv.appendChild(messageContent);

  chatMessages.appendChild(messageDiv);

  // Store reference for updates
  currentStatusMessage = messageDiv;

  scrollToBottom();
  return messageDiv;
}

// Update existing status message with optional progress data
function updateStatusMessage(text, progressData) {
  setAutomationRunnerText(text);
  if (currentStatusMessage) {
    const statusText = currentStatusMessage.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = text;
    }
    if (progressData && progressData.iteration != null) {
      const container = currentStatusMessage.querySelector('.progress-container');
      const fill = currentStatusMessage.querySelector('.progress-fill');
      const label = currentStatusMessage.querySelector('.progress-label');
      if (container && fill && label) {
        container.classList.remove('hidden');
        fill.style.width = (progressData.progressPercent || 0) + '%';
        label.textContent = `${(progressData.progressPercent || 0)}%`;
      }
    }
  }
}


// Complete status message: remove dots-only indicator, show only the result bubble
function completeStatusMessage(text, type = 'ai') {
  if (currentStatusMessage) {
    currentStatusMessage.remove();
    currentStatusMessage = null;
    currentActionGroup = null;

    if (type === 'partial') {
      addCompletionMessage(text, 'ai', true);
    } else if (type !== 'system') {
      addCompletionMessage(text, type);
    } else {
      addMessage(text, 'system');
    }
  }
}

// QT-7bi-02 (completion-routing fix) -- DOM-only render variant of
// addCompletionMessage. Used by the automationComplete case where
// _persistMessageToConversation has ALREADY persisted the message
// against request.conversationId; calling addCompletionMessage would
// trigger a second _persistMessage write into the same conv via its
// internal write-through (line ~1575 in the original helper).
//
// Visual treatment is identical to addCompletionMessage. The DOM render
// path is the only thing that must remain symmetric so the bubble looks
// the same regardless of whether the completion was for the active tab
// (this helper) or a non-active tab (persist-only; replayed via
// hydrateChatFromConversationId on next swap).
function _renderCompletionDomOnly(text, type, isPartial) {
  if (type === undefined) type = 'ai';
  if (isPartial === undefined) isPartial = false;
  var messageDiv = document.createElement('div');
  messageDiv.className = 'message ai-completion new';

  if (isPartial) {
    messageDiv.classList.add('partial-result');
    var label = document.createElement('div');
    label.className = 'partial-result-label';
    label.textContent = 'Partial result';
    messageDiv.appendChild(label);
  }

  if (type === 'error') {
    messageDiv.className = 'message error new';
    messageDiv.textContent = text;
  } else {
    var contentDiv = document.createElement('div');
    if (typeof FSBMarkdown !== 'undefined') {
      FSBMarkdown.applyToElement(contentDiv, text);
    } else {
      contentDiv.textContent = text;
    }
    messageDiv.appendChild(contentDiv);
  }

  chatMessages.appendChild(messageDiv);

  setTimeout(function () {
    messageDiv.classList.remove('new');
  }, 400);

  while (chatMessages.children.length > 100) {
    chatMessages.removeChild(chatMessages.firstChild);
  }

  scrollToBottom();
}

// Add a separate completion message bubble with markdown support
function addCompletionMessage(text, type = 'ai', isPartial = false) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ai-completion new`;

  if (isPartial) {
    messageDiv.classList.add('partial-result');
    const label = document.createElement('div');
    label.className = 'partial-result-label';
    label.textContent = 'Partial result';
    messageDiv.appendChild(label);
  }

  if (type === 'error') {
    messageDiv.className = `message error new`;
    messageDiv.textContent = text;
  } else {
    // Use markdown rendering if available, plain text fallback
    const contentDiv = document.createElement('div');
    if (typeof FSBMarkdown !== 'undefined') {
      FSBMarkdown.applyToElement(contentDiv, text);
    } else {
      contentDiv.textContent = text;
    }
    messageDiv.appendChild(contentDiv);
  }

  chatMessages.appendChild(messageDiv);

  setTimeout(() => {
    messageDiv.classList.remove('new');
  }, 400);

  while (chatMessages.children.length > 100) {
    chatMessages.removeChild(chatMessages.firstChild);
  }

  scrollToBottom();

  // Phase 12 FINT-23 write-through (Plan 12-02): completion bubbles persist
  // as assistant text. isPartial flag NOT recorded per CONTEXT D-07 + D-26.
  _persistMessage('assistant', text, 'text');
}

// Show Chrome page error as plain text without bubble
function showChromepageError(text) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'chrome-page-error';
  messageDiv.textContent = text;
  
  // Add simple styling
  messageDiv.style.cssText = `
    color: #666;
    font-size: 14px;
    padding: 10px 15px;
    margin: 10px 0;
    text-align: center;
    font-style: italic;
    border-radius: 8px;
    background: rgba(255, 193, 7, 0.1);
    border: 1px solid rgba(255, 193, 7, 0.3);
  `;
  
  const messagesContainer = document.getElementById('messages');
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Phase 12 FINT-23 (Plan 12-02) -- write-through hook.
 *
 * Called from addMessage + addCompletionMessage + addActionMessage AFTER
 * the existing DOM render path. Schedules a 200ms-debounced flush per
 * conversationId via the module-scope _messageLogDebouncer.
 *
 * Guards:
 *  - lazy-mint window: conversationId may be null in early-boot or
 *    foreign-owned-tab flows (Phase 11 D-17); skip persistence then.
 *  - empty content: skip.
 *  - sidecar absent: skip (script-tag load order failure).
 *  - debouncer absent: skip (boot init failed; storage write unsafe).
 *
 * Storage failures swallow silently -- DOM render must never block on
 * persistence per CONTEXT D-03.
 */
function _persistMessage(role, content, kind) {
  if (typeof FSBSidepanelMessageLog === 'undefined') return;
  if (!conversationId || typeof conversationId !== 'string') return;
  if (typeof content !== 'string' || content.length === 0) return;
  if (!_messageLogDebouncer) return;

  var resolvedRole = (role === 'user') ? 'user' : 'assistant';
  var resolvedKind = (typeof kind === 'string' && kind.length > 0) ? kind : 'text';
  if (resolvedRole === 'user') _lastUserTaskByConversation.set(conversationId, content);

  // Append to in-memory buffer immediately for read consistency.
  var convId = conversationId;
  var buffer = _messageLogPendingBuffer.get(convId);
  if (!buffer) {
    buffer = [];
    _messageLogPendingBuffer.set(convId, buffer);
  }
  buffer.push({
    role: resolvedRole,
    content: content,
    timestamp: Date.now(),
    kind: resolvedKind
  });

  // Clear-and-replace 200ms debounce per CONTEXT D-03.
  _messageLogDebouncer.schedule(convId, function () {
    return _flushMessageLog(convId);
  });
}

/**
 * QT-7bi-02 (completion-routing fix) -- explicit-convId variant of
 * _persistMessage.
 *
 * The original _persistMessage closes over the module-scope `conversationId`
 * variable, which is mutated by swapToTabConversation on every tab switch.
 * When automationComplete fires for a session dispatched from tab A while
 * the sidepanel currently displays tab B's conversation, _persistMessage
 * would write the completion bubble into tab B's persisted log (the
 * currently-displayed conv), not tab A's (the originating conv).
 *
 * This sibling helper takes an explicit `convId` so completion-routing
 * call sites can persist into the originating conversation regardless of
 * which tab is currently displayed. Identical guards + buffer + debouncer
 * semantics as _persistMessage.
 *
 * Guards:
 *  - convId must be a non-empty string (lazy-mint windows pass null; skip).
 *  - sidecar absent: skip (script-tag load order failure).
 *  - debouncer absent: skip (boot init failed; storage write unsafe).
 *
 * Storage failures swallow silently -- DOM render must never block on
 * persistence (mirrors _persistMessage contract).
 */
function _persistMessageToConversation(role, content, kind, convId, sessionId, terminal) {
  if (typeof FSBSidepanelMessageLog === 'undefined') return;
  if (!convId || typeof convId !== 'string') return;
  if (typeof content !== 'string' || content.length === 0) return;
  if (!_messageLogDebouncer) return;

  var resolvedRole = (role === 'user') ? 'user' : 'assistant';
  var resolvedKind = (typeof kind === 'string' && kind.length > 0) ? kind : 'text';
  if (resolvedRole === 'user') _lastUserTaskByConversation.set(convId, content);

  var buffer = _messageLogPendingBuffer.get(convId);
  if (!buffer) {
    buffer = [];
    _messageLogPendingBuffer.set(convId, buffer);
  }
  var row = {
    role: resolvedRole,
    content: content,
    timestamp: Date.now(),
    kind: resolvedKind
  };
  // QT-wnz Codex-4 -- carry sessionId + terminal through to envelope so
  // hasTerminalForSession can dedupe redundant terminal writes (post-C3
  // the background already persisted; sidepanel is now idempotent backup).
  if (typeof sessionId === 'string' && sessionId.length > 0) row.sessionId = sessionId;
  if (terminal === true) row.terminal = true;
  buffer.push(row);

  _messageLogDebouncer.schedule(convId, function () {
    return _flushMessageLog(convId);
  });
}

/**
 * Plan 12-02 FINT-23 flush helper.
 *
 * Reads the envelope from chrome.storage.local, appends the buffered
 * messages via the sidecar's appendMessage (which enforces LRU cap = 50),
 * persists. On failure, resurrects the snapshot into the buffer so the
 * next flush retries.
 */
async function _flushMessageLog(convId) {
  var buffer = _messageLogPendingBuffer.get(convId);
  if (!buffer || buffer.length === 0) return;
  var snapshot = buffer.slice();
  buffer.length = 0;
  try {
    var bag = await chrome.storage.local.get(FSBSidepanelMessageLog.STORAGE_KEY);
    var envelope = bag[FSBSidepanelMessageLog.STORAGE_KEY];
    if (!FSBSidepanelMessageLog.isValidEnvelope(envelope)) {
      envelope = FSBSidepanelMessageLog.emptyEnvelope();
    }
    for (var i = 0; i < snapshot.length; i++) {
      FSBSidepanelMessageLog.appendMessage(envelope, convId, snapshot[i]);
    }
    var payload = {};
    payload[FSBSidepanelMessageLog.STORAGE_KEY] = envelope;
    await chrome.storage.local.set(payload);

    // Phase 12 WR-02 fix: items appended to _messageLogPendingBuffer DURING
    // the chrome.storage.local.get + chrome.storage.local.set awaits stay
    // in the in-memory buffer (they were not part of `snapshot`). The
    // debouncer timer for this convId has already fired, so without an
    // explicit re-schedule the residual items would languish until the
    // NEXT _persistMessage call (which could be minutes). That stretches
    // the documented 200ms lost-on-crash bound (D-03) beyond contract.
    // Re-schedule another 200ms flush cycle so residuals land bounded-time
    // later, per the documented D-03 invariant.
    var residual = _messageLogPendingBuffer.get(convId);
    if (residual && residual.length > 0 && _messageLogDebouncer
        && typeof _messageLogDebouncer.schedule === 'function') {
      _messageLogDebouncer.schedule(convId, function () {
        return _flushMessageLog(convId);
      });
    }
  } catch (_e) {
    // Best-effort: failure resurrects the buffer so next flush retries.
    var current = _messageLogPendingBuffer.get(convId);
    if (current && current.length > 0) {
      _messageLogPendingBuffer.set(convId, snapshot.concat(current));
    } else {
      _messageLogPendingBuffer.set(convId, snapshot);
    }
    // Phase 12 WR-02 fix: on storage failure, also re-schedule so the
    // retry fires bounded-time later (same D-03 contract). Without this,
    // a transient storage write failure could strand the resurrected
    // buffer until the next _persistMessage call.
    if (_messageLogDebouncer
        && typeof _messageLogDebouncer.schedule === 'function') {
      _messageLogDebouncer.schedule(convId, function () {
        return _flushMessageLog(convId);
      });
    }
  }
}

/**
 * Phase 12 FINT-23 (Plan 12-01) -- DOM-only render path for replay.
 *
 * Identical visual treatment to addMessage but bypasses addMessage entirely
 * so the future Plan 12-02 addMessage write-through hook does NOT loop a
 * hydrate replay back into chrome.storage.local (Pitfall 3 defense from
 * 12-RESEARCH Section 10).
 *
 * (role, kind) -> CSS type mapping:
 *   ('user',      'text')     -> .message.user
 *   ('assistant', 'text')     -> .message.system  (default assistant style)
 *   ('assistant', 'progress') -> .message.action  (D-12 styling reuses existing action treatment)
 *   ('assistant', 'tool')     -> .message.action  (D-12 styling)
 *   ('assistant', 'error')    -> .message.error
 *
 * No .new class. No animation setTimeout. Scrollback is not "new".
 */
function renderPersistedMessage(content, role, kind) {
  if (typeof content !== 'string' || content.length === 0) return;
  if (!chatMessages) return;
  var cssType = 'system';
  if (role === 'user') cssType = 'user';
  else if (kind === 'error') cssType = 'error';
  else if (kind === 'progress' || kind === 'tool') cssType = 'action';
  var messageDiv = document.createElement('div');
  messageDiv.className = 'message ' + cssType;
  messageDiv.textContent = content;
  chatMessages.appendChild(messageDiv);
}

// Add message to chat with modern bubble styling
function addMessage(text, type = 'system', kind) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type} new`;

  // Handle different message types
  if (type === 'action') {
    // Format action messages nicely
    const actionText = text.replace(/Executed: (\w+)\((.*)\)/, (match, tool, params) => {
      try {
        const parsedParams = JSON.parse(params);
        const formattedParams = Object.entries(parsedParams)
          .map(([key, value]) => `${key}: "${value}"`)
          .join(', ');
        return `${tool}(${formattedParams})`;
      } catch {
        return `${tool}(${params})`;
      }
    });
    messageDiv.textContent = actionText;
  } else {
    messageDiv.textContent = text;
  }

  // Add dismiss button for error messages
  if (type === 'error') {
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'message-dismiss';
    dismissBtn.textContent = 'X';
    dismissBtn.addEventListener('click', () => {
      messageDiv.classList.add('collapsing');
      setTimeout(() => messageDiv.remove(), 300);
    });
    messageDiv.appendChild(dismissBtn);
    // Auto-collapse error after 30 seconds
    setTimeout(() => {
      if (messageDiv.parentNode && !messageDiv.classList.contains('collapsing')) {
        messageDiv.classList.add('auto-collapsed');
      }
    }, 30000);
  }

  chatMessages.appendChild(messageDiv);

  // Remove the 'new' class after animation
  setTimeout(() => {
    messageDiv.classList.remove('new');
  }, 400);

  // Limit messages to prevent overflow
  while (chatMessages.children.length > 100) {
    chatMessages.removeChild(chatMessages.firstChild);
  }

  scrollToBottom();

  // Phase 12 FINT-23 write-through hook (Plan 12-02). Fires AFTER DOM render
  // so persistence failures never block UI. Role + kind derive from the
  // existing `type` parameter for backward compat with 60+ call sites; the
  // optional 3rd arg `kind` overrides when the caller knows the kind (e.g.
  // the Plan 12-03 autopilot listener emits kind='tool' for tool_executed).
  var _role = (type === 'user') ? 'user' : 'assistant';
  var _kind = kind;
  if (!_kind) {
    if (type === 'error') _kind = 'error';
    else if (type === 'action') _kind = 'tool';
    else _kind = 'text';
  }
  _persistMessage(_role, text, _kind);
}

// Smooth scroll to bottom
function scrollToBottom() {
  setTimeout(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 50);
}

// Open settings
function openSettings() {
  // Open the options page first
  chrome.runtime.openOptionsPage();

  // Then close the side panel
  window.close();
}

async function openControlPanelSection(sectionId) {
  const baseUrl = chrome.runtime.getURL('ui/control_panel.html');
  const targetUrl = sectionId ? `${baseUrl}#${sectionId}` : baseUrl;

  try {
    if (chrome.tabs?.create) {
      await chrome.tabs.create({ url: targetUrl, active: true });
    } else {
      chrome.runtime.openOptionsPage();
    }
    window.close();
  } catch (_error) {
    chrome.runtime.openOptionsPage();
    window.close();
  }
}

function normalizeAutomationOutcome(outcome, status, hasError) {
  var normalizedOutcome = typeof outcome === 'string' ? outcome.trim().toLowerCase() : '';
  if (normalizedOutcome === 'error') return 'failure';
  if (normalizedOutcome === 'success' || normalizedOutcome === 'partial' || normalizedOutcome === 'failure' || normalizedOutcome === 'stopped') {
    return normalizedOutcome;
  }

  var normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (normalizedStatus === 'partial') return 'partial';
  if (normalizedStatus === 'stopped') return 'stopped';
  if (normalizedStatus === 'error' || normalizedStatus === 'failed' || normalizedStatus === 'stuck') return 'failure';

  return hasError ? 'failure' : 'success';
}

function getSessionOutcomeDisplay(session) {
  session = session || {};
  var outcomeDetails = session.outcomeDetails && typeof session.outcomeDetails === 'object'
    ? session.outcomeDetails
    : {};
  var outcome = normalizeAutomationOutcome(
    session.outcome || outcomeDetails.outcome,
    session.status || outcomeDetails.outcome,
    Boolean(session.error || outcomeDetails.error)
  );

  return {
    outcome: outcome,
    statusClass: outcome === 'success'
      ? 'completed'
      : outcome === 'partial'
        ? 'partial'
        : outcome === 'stopped'
          ? 'stopped'
          : 'error',
    statusLabel: outcome === 'success'
      ? 'completed'
      : outcome === 'partial'
        ? 'partial'
        : outcome === 'stopped'
          ? 'stopped'
          : 'failed',
    summary: outcomeDetails.summary || session.result || null,
    blocker: outcomeDetails.blocker || session.blocker || null,
    nextStep: outcomeDetails.nextStep || session.nextStep || null,
    resultText: session.completionMessage || outcomeDetails.result || session.result || outcomeDetails.summary || null,
    error: session.error || outcomeDetails.error || null
  };
}

function removeLoginPrompt() {
  const existing = document.getElementById('login-prompt');
  if (existing) {
    existing.remove();
  }
}

function removePaymentPrompt() {
  const existing = document.getElementById('payment-prompt');
  if (existing) {
    existing.remove();
  }
}

function getLatestThreadSessionRecord(sessionIndex, sessionStorage, threadHistorySessionId) {
  if (!threadHistorySessionId) return null;

  var candidates = (sessionIndex || []).filter(function(entry) {
    var entryHistorySessionId = entry?.historySessionId || entry?.id || null;
    return entry?.id === threadHistorySessionId || entryHistorySessionId === threadHistorySessionId;
  });

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort(function(a, b) {
    var aTime = a?.endTime || a?.startTime || 0;
    var bTime = b?.endTime || b?.startTime || 0;
    return bTime - aTime;
  });

  var latest = candidates[0];
  return (sessionStorage && latest?.id && sessionStorage[latest.id]) || latest || null;
}

function renderAutomationCompletionPayload(payload) {
  payload = payload || {};

  if (payload.sessionId && lastRenderedTerminalSessionId === payload.sessionId) {
    return;
  }

  if (payload.historySessionId) {
    historySessionId = payload.historySessionId;
  } else if (!historySessionId && payload.sessionId) {
    historySessionId = payload.sessionId;
  }

  if (payload.conversationId) {
    activeConversationId = payload.conversationId;
  }

  persistSidepanelThreadState();
  removeLoginPrompt();

  var outcome = normalizeAutomationOutcome(
    payload.outcome,
    payload.outcomeDetails?.outcome,
    Boolean(payload.error || payload.outcomeDetails?.error)
  );
  var completionMessage = payload.result ||
    payload.outcomeDetails?.result ||
    payload.outcomeDetails?.summary ||
    'The automation completed but no summary was provided. Please try again if the task wasn\'t completed as expected.';

  if (outcome === 'failure') {
    var errorMessage = payload.error || payload.outcomeDetails?.error || completionMessage || 'Automation error';
    setErrorState(_resolveTabIdForSession(payload.sessionId));
    if (currentStatusMessage) {
      completeStatusMessage('Error: ' + errorMessage, 'error');
    } else {
      addCompletionMessage('Error: ' + errorMessage, 'error');
    }
  } else if (currentStatusMessage) {
    completeStatusMessage(
      completionMessage,
      outcome === 'partial' ? 'partial' : (outcome === 'stopped' ? 'system' : undefined)
    );
  } else if (outcome === 'stopped') {
    addMessage(completionMessage, 'system');
  } else {
    addCompletionMessage(completionMessage, 'ai', outcome === 'partial');
  }

  setIdleState(_resolveTabIdForSession(payload.sessionId));
  currentSessionId = null;
  lastRenderedTerminalSessionId = payload.sessionId || historySessionId || null;

  if (isHistoryViewActive) {
    loadHistoryList();
  }

  if (outcome === 'partial') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const currentUrl = tabs[0]?.url;
        if (currentUrl && currentUrl.startsWith('http')) {
          const domain = new URL(currentUrl).hostname;
          const siteMapCheck = await chrome.runtime.sendMessage({
            action: 'checkSiteMap',
            domain
          });

          if (!siteMapCheck || !siteMapCheck.exists) {
            const reconDiv = document.createElement('div');
            reconDiv.className = 'message system new recon-suggestion';
            const textSpan = document.createElement('span');
            textSpan.className = 'recon-suggestion-text';
            textSpan.textContent = 'This site does not have a map yet. Reconnaissance can help FSB learn the site structure for better performance.';
            reconDiv.appendChild(textSpan);

            const reconBtn = document.createElement('button');
            reconBtn.className = 'recon-btn';
            reconBtn.id = 'reconFromSidepanel';
            reconBtn.textContent = 'Run Reconnaissance';
            reconBtn.addEventListener('click', () => {
              startReconFromSidepanel(currentUrl, payload.task || completionMessage);
            });
            reconDiv.appendChild(reconBtn);

            chatMessages.appendChild(reconDiv);
            scrollToBottom();
          }
        }
      } catch (e) {
        console.warn('Recon suggestion check failed:', e.message);
      }
    })();
  }
}

async function recoverLatestThreadTerminalOutcome(options = {}) {
  if (!historySessionId || isHistoryViewActive) {
    return;
  }

  var force = options.force === true;

  try {
    var stored = await chrome.storage.local.get(['fsbSessionLogs', 'fsbSessionIndex']);
    var sessionStorage = stored.fsbSessionLogs || {};
    var sessionIndex = stored.fsbSessionIndex || [];
    var latestSession = getLatestThreadSessionRecord(sessionIndex, sessionStorage, historySessionId);

    if (!latestSession) {
      return;
    }

    var latestStatus = typeof latestSession.status === 'string'
      ? latestSession.status.trim().toLowerCase()
      : '';
    if (latestStatus === 'running' || latestStatus === 'replaying') {
      return;
    }
    if (!force && lastRenderedTerminalSessionId === latestSession.id) {
      return;
    }
    if (isRunning && currentSessionId && currentSessionId !== latestSession.id) {
      return;
    }

    var outcomeInfo = getSessionOutcomeDisplay(latestSession);
    if (!outcomeInfo.summary && !outcomeInfo.resultText && !outcomeInfo.error) {
      return;
    }

    renderAutomationCompletionPayload({
      sessionId: latestSession.id,
      conversationId: latestSession.conversationId || activeConversationId || null,
      historySessionId: latestSession.historySessionId || historySessionId || latestSession.id,
      outcome: latestSession.outcome || outcomeInfo.outcome,
      outcomeDetails: latestSession.outcomeDetails || null,
      result: latestSession.completionMessage || latestSession.result || null,
      error: latestSession.error || null,
      blocker: latestSession.blocker || null,
      nextStep: latestSession.nextStep || null,
      task: latestSession.task || null
    });
  } catch (error) {
    console.warn('Failed to recover latest thread terminal outcome:', error);
  }
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    // QT-uof-1 (D-FIX + E-FIX) -- see .planning/debug/cluster1-routing.md.
    //
    // D-FIX (Symptom D, primary): pre-fix outer bail at this case dropped
    // EVERY completion whose sessionId did not match currentSessionId. That
    // meant background-tab sessions never got persisted into their own
    // conv's message log, and their _tabRunningMap entry never flipped to
    // isRunning:false. The relaxed outer guard below admits ANY session
    // that lives in _tabRunningMap (active OR background); persistence and
    // per-tab state updates run UNCONDITIONALLY for those messages. Only
    // the DOM render stays gated on isOriginatingActive.
    //
    // E-FIX (Symptom E, secondary): the pre-fix active-tab path called
    // _persistMessageToConversation, THEN completeStatusMessage, which calls
    // addCompletionMessage, which calls _persistMessage AGAIN against the
    // module-scope conversationId (== originatingConvId when active). That
    // produced a double-persist into conv_A. The if-branch below now
    // manually removes the loader DOM and invokes _renderCompletionDomOnly
    // directly so persistence fires EXACTLY ONCE.
    case 'automationComplete': {
      // D-FIX: relaxed outer guard. We accept the message if it targets
      // (a) our currently-active sessionId, OR (b) any sessionId carried
      // by a known _tabRunningMap entry (background-tab completion). Drop
      // only when the sessionId is genuinely unknown to this sidepanel.
      var sessionKnown = (request.sessionId === currentSessionId);
      if (!sessionKnown) {
        var _iter = _tabRunningMap.values();
        var _n = _iter.next();
        while (!_n.done) {
          if (_n.value && _n.value.sessionId === request.sessionId) {
            sessionKnown = true;
            break;
          }
          _n = _iter.next();
        }
      }
      if (!sessionKnown) return;

      // AI must always provide a meaningful completion message.
      var completionMessage = request.result || 'The automation completed but no summary was provided. Please try again if the task wasn\'t completed as expected.';
      var isPartial = request.partial === true;

      // Resolve the originating conv from the broadcast. When the broadcast
      // omits it, the module-scope conversationId is correct ONLY when the
      // completed session IS the visible conversation's session; for any other
      // session (a replay or another conversation-less path) resolve to null so
      // the completion is NEVER persisted into whatever conversation happens to
      // be visible (agent-loop + background.js supply the id per QT-7bi-02 +
      // QT-uof-2; a null here means the session genuinely has no conversation).
      var originatingConvId = (typeof request.conversationId === 'string' && request.conversationId.length > 0)
        ? request.conversationId
        : (request.sessionId === currentSessionId ? conversationId : null);

      // QT-wnz Codex-4 -- dedupe guard. Background C3 already persisted the
      // terminal entry BEFORE this broadcast fired. Check fsbConversationMessages
      // for an existing terminal entry for this sessionId on this convId; if
      // present, skip BOTH the redundant persist AND the redundant DOM render
      // (the user already saw it, or will see it via hydrate-on-swap from the
      // authoritative background write).
      var _wnzTerminalDedupe = false;
      try {
        var _pendingBuf = (typeof _messageLogPendingBuffer !== 'undefined' && _messageLogPendingBuffer)
          ? _messageLogPendingBuffer.get(originatingConvId)
          : null;
        if (Array.isArray(_pendingBuf)) {
          for (var _bi = 0; _bi < _pendingBuf.length; _bi++) {
            var _bm = _pendingBuf[_bi];
            if (_bm && _bm.sessionId === request.sessionId && _bm.terminal === true) {
              _wnzTerminalDedupe = true;
              break;
            }
          }
        }
      } catch (_e) { /* swallow -- best-effort */ }

      if (!_wnzTerminalDedupe && typeof FSBSidepanelMessageLog !== 'undefined' &&
          typeof FSBSidepanelMessageLog.hasTerminalForSession === 'function' &&
          typeof FSBSidepanelMessageLog.STORAGE_KEY === 'string') {
        // Fire-and-forget async storage peek. If storage confirms a prior
        // terminal write (background C3 path or another sidepanel context),
        // remove any same-sessionId+terminal entry we just buffered so the
        // debounced flush does not produce a duplicate. Cannot await here
        // (handler is sync) -- the buffer-peek above is the primary guard.
        (async function () {
          try {
            var bag = await chrome.storage.local.get(FSBSidepanelMessageLog.STORAGE_KEY);
            if (FSBSidepanelMessageLog.hasTerminalForSession(bag[FSBSidepanelMessageLog.STORAGE_KEY], originatingConvId, request.sessionId)) {
              if (typeof _messageLogPendingBuffer !== 'undefined' && _messageLogPendingBuffer) {
                var _b = _messageLogPendingBuffer.get(originatingConvId);
                if (Array.isArray(_b)) {
                  for (var _i = _b.length - 1; _i >= 0; _i--) {
                    if (_b[_i] && _b[_i].sessionId === request.sessionId && _b[_i].terminal === true) {
                      _b.splice(_i, 1);
                    }
                  }
                }
              }
            }
          } catch (_storageErr) { /* swallow */ }
        })();
      }

      // D-FIX: persistence runs for any session-matched message that RESOLVED
      // an originating conversation. Absence of this call on the background-tab
      // path was the primary D root cause -- conv_B's message log stayed empty
      // so hydrate-on-swap rendered nothing for the missing-second-completion.
      // A null originatingConvId (conversation-less replay/legacy session) is
      // NOT persisted anywhere -- the per-tab state update below still runs.
      // QT-wnz Codex-4 -- also gated on the dedupe-flag + carries the
      // sessionId + terminal:true markers so future fanouts can dedupe.
      if (!_wnzTerminalDedupe && originatingConvId) {
        _persistMessageToConversation('assistant', completionMessage, 'text', originatingConvId, request.sessionId, true);
      }

      // Resolve the originating tabId. request.tabId is now threaded
      // through every automationComplete broadcast site per QT-uof-2;
      // _resolveTabIdForSession is the defense-in-depth fallback that
      // walks _tabRunningMap for a matching sessionId.
      var originatingTabId = (typeof request.tabId === 'number')
        ? request.tabId
        : _resolveTabIdForSession(request.sessionId);

      // E-FIX: the if-branch (active tab AND currentStatusMessage non-null)
      // must NOT call completeStatusMessage. completeStatusMessage routes
      // through addCompletionMessage, which calls _persistMessage against
      // the module-scope conversationId -- producing a SECOND persist into
      // the same conv we already wrote above. Manually clear the loader
      // DOM and invoke _renderCompletionDomOnly directly so the bubble
      // renders exactly once and persistence fires exactly once.
      // QT-wnz Codex-4 -- DOM render is now also gated on the dedupe-flag;
      // if a prior context already rendered, hydrate-on-swap from storage
      // will surface the message instead.
      var isOriginatingActive = (originatingConvId === conversationId) &&
        (originatingConvId !== null || request.sessionId === currentSessionId);
      if (!_wnzTerminalDedupe && isOriginatingActive) {
        if (currentStatusMessage) {
          try { currentStatusMessage.remove(); } catch (_e) {}
          currentStatusMessage = null;
          currentActionGroup = null;
          // QT-uof-5 (B-FIX) -- the loader has been removed from the
          // active tab; drop the per-tab intent entry so a future
          // swap-OUT does not persist a stale reference.
          _clearTabStatusIntent(_activeTabIdSnapshot);
        }
        _renderCompletionDomOnly(completionMessage, isPartial ? 'partial' : 'ai', isPartial);
      }

      // D-FIX: per-tab state update UNCONDITIONALLY. setIdleState only
      // mutates the active-tab UI when target === _activeTabIdSnapshot;
      // for background tabs it simply flips the per-tab entry so the
      // owning tab's sendBtn re-enables on swap-back.
      setIdleState(originatingTabId);

      // Refresh history list if history view is active.
      if (isHistoryViewActive) {
        loadHistoryList();
      }

      // Recon suggestion (preserved verbatim) -- only fires on the active
      // tab + partial completion path, so this gate is unchanged from
      // QT-7bi-02.
      if (isPartial && isOriginatingActive) {
        (async () => {
          try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const currentUrl = tabs[0]?.url;
            if (currentUrl && currentUrl.startsWith('http')) {
              const domain = new URL(currentUrl).hostname;
              const siteMapCheck = await chrome.runtime.sendMessage({
                action: 'checkSiteMap',
                domain
              });

              if (!siteMapCheck || !siteMapCheck.exists) {
                const reconDiv = document.createElement('div');
                reconDiv.className = 'message system new recon-suggestion';
                const textSpan = document.createElement('span');
                textSpan.className = 'recon-suggestion-text';
                textSpan.textContent = 'This site does not have a map yet. Reconnaissance can help FSB learn the site structure for better performance.';
                reconDiv.appendChild(textSpan);

                const reconBtn = document.createElement('button');
                reconBtn.className = 'recon-btn';
                reconBtn.id = 'reconFromSidepanel';
                reconBtn.textContent = 'Run Reconnaissance';
                reconBtn.addEventListener('click', () => {
                  startReconFromSidepanel(currentUrl, request.task || completionMessage);
                });
                reconDiv.appendChild(reconBtn);

                chatMessages.appendChild(reconDiv);
                scrollToBottom();
              }
            }
          } catch (e) {
            console.warn('Recon suggestion check failed:', e.message);
          }
        })();
      }
      break;
    }

    case 'statusUpdate':
      if (request.sessionId === currentSessionId) {
        // Auto-switch to chat view if user is on history while automation runs
        if (isHistoryViewActive) {
          showChatView();
        }
        // Snapshot previous status as completed action message
        const prevText = currentStatusMessage?.querySelector('.status-text')?.textContent;
        const skipTexts = ['Starting automation...', 'Connecting to page...', 'Connected. Analyzing page...', 'Analyzing page...'];
        if (prevText && !skipTexts.includes(prevText)) {
          addActionMessage(prevText);
        }
        updateStatusMessage(request.message, {
          iteration: request.iteration,
          maxIterations: request.maxIterations,
          progressPercent: request.progressPercent
        });
      }
      break;
      
      
    case 'automationError': {
      var errorSessionKnown = (request.sessionId === currentSessionId && isRunning);
      if (!errorSessionKnown) {
        var _errorIter = _tabRunningMap.values();
        var _errorNext = _errorIter.next();
        while (!_errorNext.done) {
          if (_errorNext.value && _errorNext.value.sessionId === request.sessionId && _errorNext.value.isRunning === true) {
            errorSessionKnown = true;
            break;
          }
          _errorNext = _errorIter.next();
        }
      }
      if (!errorSessionKnown) return;

      // QT-93i-regression (Strategy B) -- route by originating tab; mirror
      // the automationComplete routing pattern at line ~2358. Falls back to
      // _resolveTabIdForSession when request.tabId is missing.
      var errorTabId = (typeof request.tabId === 'number')
        ? request.tabId
        : _resolveTabIdForSession(request.sessionId);
      setErrorState(errorTabId);

      var isErrorOriginatingActive = (typeof errorTabId === 'number' && errorTabId === _activeTabIdSnapshot);
      if (isErrorOriginatingActive) {
        completeStatusMessage(`Error: ${request.error}`, 'error');

        // Provide specific guidance for stuck scenarios
        if (request.error && request.error.includes('stuck')) {
          addMessage('The automation got stuck repeating the same actions. Here are some tips:', 'system');
          addMessage('Try being more specific about what you want to achieve', 'system');
          addMessage('Check if the page requires manual steps like CAPTCHA solving', 'system');
          addMessage('Ensure the page has fully loaded before starting', 'system');
        }

        // Add retry button if task is available
        if (request.task) {
          const retryDiv = document.createElement('div');
          retryDiv.className = 'message system new';
          retryDiv.textContent = 'Would you like to try again? ';
          const retryBtn = document.createElement('button');
          retryBtn.className = 'retry-btn';
          retryBtn.textContent = 'Retry';
          retryBtn.addEventListener('click', async () => {
            // Phase 11 FINT-20 WR-03 fix -- gate the retry on the foreign-owned
            // check. See WR-03 rationale at the handleReconComplete retry
            // handler. Without this guard the click silently drops the user's
            // intent because handleSendMessage's runtime gate fail-closes
            // without surfacing the cause.
            if (await _isActiveTabForeignOwned()) {
              console.warn('[sidepanel] retry blocked -- active tab is foreign-owned');
              return;
            }
            retryDiv.remove();
            chatInput.textContent = request.task;
            handleSendMessage();
          });
          retryDiv.appendChild(retryBtn);
          chatMessages.appendChild(retryDiv);
          scrollToBottom();
        } else {
          addMessage('No worries! The side panel is still here. Try again or ask for help with something else.', 'system');
        }

        // Recon suggestion for stuck errors is handled in automationComplete (partial: true)
        // since stuck sessions send automationComplete with partial flag, not automationError.
      }
      break;
    }

    case 'loginDetected':
      if (request.sessionId === currentSessionId) {
        // Pause the status loader
        if (currentStatusMessage) {
          updateStatusMessage('Login page detected...');
        }
        showLoginPrompt(request.domain, request.fields);
        sendResponse({ received: true });
      }
      return;

    case 'paymentFillConfirmation':
      showPaymentFillConfirmation(request);
      break;

    case 'sessionStateEvent': {
      // QT-7bi-02 -- defer the currentSessionId gate to the individual
      // event branches so iteration_complete persistence fires for
      // background-tab sessions (their iter milestones must land in the
      // originating conv's log so the user sees the full progress trail
      // when they return to that tab).
      var sevent = request.eventType;
      switch (sevent) {
        case 'iteration_complete':
          // QT-7bi-02 -- persist iteration progress to the ORIGINATING conv
          // (request.conversationId). Without this, mid-flight progress
          // milestones from session A persist into the currently-displayed
          // tab B's log when the user switches tabs. The DOM render
          // (updateStatusMessage below) stays gated by currentSessionId
          // match + isRunning, which is fine because the running indicator
          // is currentSessionId-shaped, not conv-shaped.
          var iterConvId = (typeof request.conversationId === 'string' && request.conversationId.length > 0)
            ? request.conversationId
            : (request.sessionId === currentSessionId ? conversationId : null);
          _persistMessageToConversation('assistant', 'Step ' + request.iteration + ' complete', 'progress', iterConvId);
          // DOM render: only for the active session AND only when running.
          if (request.sessionId === currentSessionId && currentStatusMessage && isRunning) {
            updateStatusMessage('Step ' + request.iteration + ' complete', {
              iteration: request.iteration,
              maxIterations: 100,
              progressPercent: Math.min(100, Math.round((request.iteration / 100) * 100))
            });
          }
          break;
        case 'session_ended':
          // QT-93i-02 -- route by originating tab so non-active sessions
          // can flip their per-tab idle without affecting the active tab.
          var sessionEndedTabId = (typeof request.tabId === 'number')
            ? request.tabId
            : _activeTabIdSnapshot;
          var sessionEndedEntry = _getTabRunningEntry(sessionEndedTabId);
          if (!sessionEndedEntry.isRunning) break;
          if (request.sessionId !== sessionEndedEntry.sessionId
              && request.sessionId !== currentSessionId) break;
          setIdleState(sessionEndedTabId);
          if (isHistoryViewActive) {
            loadHistoryList();
          }
          break;
        case 'tool_executed':
          if (request.sessionId !== currentSessionId) break;
          if (showSidepanelProgressEnabled && isRunning) {
            addActionMessage(request.toolName + (request.success ? '' : ' [failed]'));
          }
          break;
        case 'error_occurred':
          if (request.sessionId !== currentSessionId) break;
          console.warn('[FSB] emitter error:', request.error);
          break;
      }
      break;
    }
  }
});

// Show inline login prompt in the chat
function showLoginPrompt(domain, fields) {
  // Prevent duplicate prompts if rapid loginDetected messages arrive
  const existing = document.getElementById('login-prompt');
  if (existing) existing.remove();

  // Complete any active status message
  if (currentStatusMessage) {
    completeStatusMessage('Login required', 'system');
  }

  const container = document.createElement('div');
  container.className = 'message login-prompt new';
  container.id = 'login-prompt';

  const fieldLabel = (fields && fields.usernameType === 'email') ? 'Email' : 'Username / Email';

  // Escape domain for safe HTML insertion
  const safeDomain = (domain || 'this site').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
  const authPrompt = null;
  const promptDetail = (authPrompt && authPrompt.detail) || 'Submit credentials once to let FSB sign in and resume this same session.';
  const handoffDetail = (authPrompt && authPrompt.handoff) || 'If you skip or the site still needs manual approval, FSB will preserve the completed work and finish with a manual handoff.';
  const allowSave = authPrompt?.allowSave !== false;
  const saveDisabledReason = authPrompt?.saveDisabledReason || 'Saving is unavailable for this session.';
  const safeSubtext = `${promptDetail} ${handoffDetail}`.trim().replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
  const safeSaveDisabledReason = saveDisabledReason.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));

  container.innerHTML = `
    <div class="login-prompt-header">
      <i class="fas fa-lock"></i>
      <span>Login Required</span>
    </div>
    <div class="login-prompt-domain">${safeDomain}</div>
    <div class="login-prompt-subtext">Enter your credentials to sign in. They will be encrypted and saved for future use.</div>
    <div class="login-prompt-form">
      <div class="login-prompt-field">
        <label>${fieldLabel}</label>
        <input type="text" id="loginPromptUsername" placeholder="${fieldLabel}" autocomplete="username">
      </div>
      <div class="login-prompt-field">
        <label>Password</label>
        <div class="login-prompt-password-wrapper">
          <input type="password" id="loginPromptPassword" placeholder="Password" autocomplete="current-password">
          <button type="button" class="login-prompt-eye" id="loginPromptTogglePw">
            <i class="fas fa-eye"></i>
          </button>
        </div>
      </div>
      <label class="login-prompt-save-label">
        <input type="checkbox" id="loginPromptSave" ${allowSave ? 'checked' : ''} ${allowSave ? '' : 'disabled'}>
        <span>Save for future use</span>
      </label>
      ${allowSave ? '' : `<div class="login-prompt-subtext">${safeSaveDisabledReason}</div>`}
      <div class="login-prompt-actions">
        <button class="login-prompt-btn primary" id="loginPromptSubmit">Sign In</button>
        <button class="login-prompt-btn ghost" id="loginPromptSkip">Skip</button>
      </div>
    </div>
  `;

  chatMessages.appendChild(container);
  scrollToBottom();

  // Remove 'new' class after animation
  setTimeout(() => container.classList.remove('new'), 400);

  // Focus username field
  setTimeout(() => {
    const usernameInput = document.getElementById('loginPromptUsername');
    if (usernameInput) usernameInput.focus();
  }, 100);

  // Toggle password visibility
  const toggleBtn = document.getElementById('loginPromptTogglePw');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const pwField = document.getElementById('loginPromptPassword');
      if (pwField) {
        const isPassword = pwField.type === 'password';
        pwField.type = isPassword ? 'text' : 'password';
        const icon = toggleBtn.querySelector('i');
        if (icon) icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
      }
    });
  }

  // Sign In button
  const submitBtn = document.getElementById('loginPromptSubmit');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      const username = document.getElementById('loginPromptUsername')?.value?.trim();
      const password = document.getElementById('loginPromptPassword')?.value;
      const save = document.getElementById('loginPromptSave')?.checked ?? true;

      if (!username && !password) {
        return;
      }

      // Send credentials to background
      chrome.runtime.sendMessage({
        action: 'loginFormSubmitted',
        sessionId: currentSessionId,
        domain: domain,
        credentials: { username, password },
        save: save
      });

      // Remove prompt from chat
      container.remove();

      // Add system message
      addMessage('Signing in...', 'system');
      addStatusMessage('Signing in...');
    });
  }

  // Skip button
  const skipBtn = document.getElementById('loginPromptSkip');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        action: 'loginSkipped',
        sessionId: currentSessionId
      });

      // Remove prompt
      container.remove();
      addMessage('Login skipped. Continuing automation...', 'system');
      addStatusMessage('Continuing...');
    });
  }

  // Handle Enter key in password field
  const pwField = document.getElementById('loginPromptPassword');
  if (pwField) {
    pwField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitBtn?.click();
      }
    });
  }
}

function showPaymentPrompt(domain, paymentPrompt) {
  removePaymentPrompt();

  const methods = Array.isArray(paymentPrompt?.methods) ? paymentPrompt.methods : [];
  const available = paymentPrompt?.available === true && methods.length > 0;
  const state = paymentPrompt?.state || (available ? 'available' : 'unavailable');
  const container = document.createElement('div');
  container.className = 'message payment-prompt new';
  container.id = 'payment-prompt';

  const safeDomain = escapeHtml(domain || 'this checkout');
  const headerText = 'Checkout Detected';
  const detailText = escapeHtml(paymentPrompt?.detail || paymentPrompt?.blockedReason || 'Saved payment methods are not available for this checkout.');
  const stateLabelMap = {
    no_saved_methods: 'No saved cards',
    feature_disabled: 'Payments disabled',
    vault_not_configured: 'Vault setup required',
    vault_locked: 'Vault locked',
    payment_locked: 'Payment access locked'
  };
  const stateLabel = escapeHtml(stateLabelMap[state] || 'Saved payments unavailable');
  const primaryAction = paymentPrompt?.primaryAction || '';
  const primaryActionLabel = escapeHtml(paymentPrompt?.primaryActionLabel || 'Open Payments');

  if (!available) {
    container.innerHTML = `
      <div class="login-prompt-header">
        <i class="fas fa-credit-card"></i>
        <span>${headerText}</span>
      </div>
      <div class="login-prompt-domain">${safeDomain}</div>
      <div class="payment-prompt-state">${stateLabel}</div>
      <div class="login-prompt-subtext">${detailText}</div>
      <div class="login-prompt-actions">
        ${primaryAction ? `<button class="login-prompt-btn primary" id="paymentPromptPrimaryAction">${primaryActionLabel}</button>` : ''}
        <button class="login-prompt-btn ghost" id="paymentPromptDismiss">Dismiss</button>
      </div>
    `;

    chatMessages.appendChild(container);
    scrollToBottom();
    setTimeout(() => container.classList.remove('new'), 400);

    const dismissBtn = document.getElementById('paymentPromptDismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        container.remove();
      });
    }

    const primaryActionBtn = document.getElementById('paymentPromptPrimaryAction');
    if (primaryActionBtn) {
      primaryActionBtn.addEventListener('click', () => {
        if (primaryAction === 'open_payments_section') {
          openControlPanelSection('payments');
        } else if (primaryAction === 'open_passwords_section') {
          openControlPanelSection('passwords');
        }
      });
    }
    return;
  }

  const methodOptions = methods.map((method, index) => {
    const brandLabelMap = {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'AmEx',
      discover: 'Discover',
      diners: 'Diners',
      jcb: 'JCB'
    };
    const brandLabel = brandLabelMap[method.cardBrand] || 'Unknown';
    const title = escapeHtml(method.nickname || `${brandLabel} ending in ${method.last4 || '****'}`);
    const subtitle = escapeHtml(`${method.maskedNumber || '****'}${method.expiryMonth && method.expiryYearLast2 ? ` | Exp ${method.expiryMonth}/${method.expiryYearLast2}` : ''}`);
    const billing = escapeHtml(method.billingSummary || 'Billing profile stored');
    const brand = (method.cardBrand || 'unknown').replace(/[^a-z]/gi, '').toLowerCase() || 'unknown';
    return `
      <button class="payment-prompt-option ${index === 0 ? 'selected' : ''}" data-payment-id="${method.id}">
        <div class="payment-prompt-option-top">
          <span class="payment-card-brand ${brand}">${escapeHtml(brandLabel)}</span>
          <span class="payment-prompt-option-title">${title}</span>
        </div>
        <div class="payment-prompt-option-subtitle">${subtitle}</div>
        <div class="payment-prompt-option-billing">${billing}</div>
      </button>
    `;
  }).join('');

  container.innerHTML = `
    <div class="login-prompt-header">
      <i class="fas fa-credit-card"></i>
      <span>${headerText}</span>
    </div>
    <div class="login-prompt-domain">${safeDomain}</div>
    <div class="login-prompt-subtext">${detailText}</div>
    <div class="payment-prompt-options">${methodOptions}</div>
    <div class="login-prompt-actions">
      <button class="login-prompt-btn primary" id="paymentPromptFill">Fill Saved Card</button>
      <button class="login-prompt-btn ghost" id="paymentPromptSkip">Skip</button>
    </div>
  `;

  chatMessages.appendChild(container);
  scrollToBottom();
  setTimeout(() => container.classList.remove('new'), 400);

  let selectedPaymentId = methods[0]?.id || null;
  const optionButtons = container.querySelectorAll('.payment-prompt-option');
  optionButtons.forEach((optionBtn) => {
    optionBtn.addEventListener('click', () => {
      optionButtons.forEach(btn => btn.classList.remove('selected'));
      optionBtn.classList.add('selected');
      selectedPaymentId = optionBtn.dataset.paymentId || null;
    });
  });

  const fillBtn = document.getElementById('paymentPromptFill');
  if (fillBtn) {
    fillBtn.addEventListener('click', () => {
      if (!selectedPaymentId) return;
      chrome.runtime.sendMessage({
        action: 'paymentMethodSelected',
        sessionId: currentSessionId,
        paymentMethodId: selectedPaymentId
      });
      container.remove();
      addMessage('Saved payment method selected. FSB will fill the card details, but it will not submit the final payment for you.', 'system');
      addStatusMessage('Filling saved card...');
    });
  }

  const skipBtn = document.getElementById('paymentPromptSkip');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        action: 'paymentSkipped',
        sessionId: currentSessionId
      });
      container.remove();
      addMessage('Saved payment method skipped. Review the checkout form manually before any final payment step.', 'system');
    });
  }
}


/**
 * Show payment fill confirmation overlay.
 * Called when AI autopilot invokes fill_payment_method -- background sends confirmation
 * request with card brand, last 4, and merchant domain. User must approve or deny.
 */
function showPaymentFillConfirmation(data) {
  const overlay = document.getElementById('paymentFillConfirmOverlay');
  if (!overlay) return;

  const brandLabelMap = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'AmEx',
    discover: 'Discover',
    diners: 'Diners',
    jcb: 'JCB'
  };

  const brandEl = document.getElementById('pfcBrand');
  const last4El = document.getElementById('pfcLast4');
  const domainEl = document.getElementById('pfcDomain');

  if (brandEl) brandEl.textContent = brandLabelMap[data.cardBrand] || data.cardBrand || 'Card';
  if (last4El) last4El.textContent = '****' + (data.last4 || '****');
  if (domainEl) domainEl.textContent = 'on ' + (data.merchantDomain || 'this page');

  overlay.classList.remove('hidden');

  // Wire Allow button
  const allowBtn = document.getElementById('pfcAllow');
  const denyBtn = document.getElementById('pfcDeny');

  function cleanup() {
    overlay.classList.add('hidden');
    if (allowBtn) allowBtn.removeEventListener('click', onAllow);
    if (denyBtn) denyBtn.removeEventListener('click', onDeny);
  }

  function onAllow() {
    cleanup();
    chrome.runtime.sendMessage({
      action: 'paymentFillApproved',
      paymentMethodId: data.paymentMethodId
    }).catch(() => {});
  }

  function onDeny() {
    cleanup();
    chrome.runtime.sendMessage({
      action: 'paymentFillDenied',
      paymentMethodId: data.paymentMethodId
    }).catch(() => {});
  }

  if (allowBtn) allowBtn.addEventListener('click', onAllow);
  if (denyBtn) denyBtn.addEventListener('click', onDeny);
}

// Handle keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && _delegationUiState.mode === 'consent') {
    e.preventDefault();
    _backToDelegationMessage();
    return;
  }
  // Cmd/Ctrl + Enter to send message
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !isRunning) {
    handleSendMessage();
  }
  // Escape to stop automation
  else if (e.key === 'Escape' && isRunning) {
    stopAutomation();
  }
});

// Auto-resize chat input based on content
function adjustInputHeight() {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
}

// Initialize input height adjustment
chatInput.addEventListener('input', adjustInputHeight);

// Prevent default drag and drop behavior
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

// Handle side panel specific events
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    // Side panel became visible - refresh status if needed
    console.log('Side panel became visible');
  }
});


// ==========================================
// Session History Functions
// ==========================================

function toggleHistoryView() {
  if (isHistoryViewActive) {
    showChatView();
  } else {
    showHistoryView();
  }
}

function showHistoryView() {
  document.querySelector('.chat-messages-area').classList.add('hidden');
  document.querySelector('.chat-input-area').classList.add('hidden');
  document.getElementById('historyView').classList.remove('hidden');
  historyBtn.classList.add('active');
  isHistoryViewActive = true;
  loadHistoryList();
}

function showChatView() {
  document.querySelector('.chat-messages-area').classList.remove('hidden');
  document.querySelector('.chat-input-area').classList.remove('hidden');
  document.getElementById('historyView').classList.add('hidden');
  historyBtn.classList.remove('active');
  isHistoryViewActive = false;
}

async function loadHistoryList() {
  const historyList = document.getElementById('historyList');
  if (!historyList) return;

  try {
    const stored = await chrome.storage.local.get(['fsbSessionIndex']);
    const sessions = stored.fsbSessionIndex || [];

    if (sessions.length === 0) {
      historyList.innerHTML = '<div class="history-empty-state">' +
        '<i class="fa fa-inbox"></i>' +
        '<p>No sessions yet. Run an automation to see your history here.</p>' +
        '</div>';
      return;
    }

    historyList.innerHTML = sessions.map(function(session) {
      var costDisplay = session.totalCost > 0
        ? '<span class="history-cost">$' + session.totalCost.toFixed(4) + '</span>'
        : '';
      return '<div class="history-item" data-session-id="' + escapeHtml(session.id) + '">' +
        '<div class="history-item-info">' +
          '<div class="history-item-task">' + escapeHtml(session.task || 'Unknown task') + '</div>' +
          '<div class="history-item-meta">' +
            '<span>' + formatSessionDate(session.startTime) + '</span>' +
            '<span>' + (session.actionCount || 0) + ' actions</span>' +
            costDisplay +
            '<span class="history-status ' + (session.status || '') + '">' + escapeHtml(session.status || 'unknown') + '</span>' +
          '</div>' +
        '</div>' +
        (session.actionCount > 0 ?
          '<button class="history-replay-btn" data-session-id="' + escapeHtml(session.id) + '" title="Replay session">' +
            '<i class="fa fa-play"></i>' +
          '</button>' : '') +
        '<button class="history-delete-btn" data-session-id="' + escapeHtml(session.id) + '" title="Delete session">' +
          '<i class="fa fa-trash"></i>' +
        '</button>' +
      '</div>';
    }).join('');
  } catch (error) {
    console.error('Failed to load history list:', error);
    historyList.innerHTML = '<div class="history-empty-state">' +
      '<i class="fa fa-exclamation-triangle"></i>' +
      '<p>Failed to load sessions.</p>' +
      '</div>';
  }
}

async function startReplay(sessionId) {
  if (isRunning) {
    addMessage('Cannot replay while another automation is running. Stop the current task first.', 'system');
    return;
  }

  // Switch to chat view to show replay progress
  if (isHistoryViewActive) {
    showChatView();
  }

  addMessage('Starting replay...', 'system');
  addStatusMessage('Preparing replay...');

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'replaySession',
        sessionId: sessionId
      }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(resp);
        }
      });
    });

    if (response && response.success) {
      currentSessionId = response.sessionId;
      setRunningState(_activeTabIdSnapshot, response.sessionId);
      updateStatusMessage('Replaying...');
    } else {
      completeStatusMessage(response?.error || 'Failed to start replay', 'error');
      addMessage(response?.error || 'Failed to start replay.', 'error');
    }
  } catch (error) {
    completeStatusMessage('Replay error', 'error');
    addMessage('Failed to start replay: ' + error.message, 'error');
  }
}

async function deleteHistorySession(sessionId) {
  try {
    const stored = await chrome.storage.local.get(['fsbSessionLogs', 'fsbSessionIndex']);
    const sessionStorage = stored.fsbSessionLogs || {};
    const sessionIndex = stored.fsbSessionIndex || [];
    delete sessionStorage[sessionId];
    const updatedIndex = sessionIndex.filter(function(s) { return s.id !== sessionId; });
    await chrome.storage.local.set({
      fsbSessionLogs: sessionStorage,
      fsbSessionIndex: updatedIndex
    });
    loadHistoryList();
  } catch (error) {
    console.error('Failed to delete session:', error);
  }
}

async function loadSessionView(sessionId) {
  try {
    const stored = await chrome.storage.local.get(['fsbSessionLogs']);
    const sessionStorage = stored.fsbSessionLogs || {};
    const session = sessionStorage[sessionId];

    if (!session) {
      addMessage('Session data not found.', 'error');
      return;
    }

    // Switch to chat view and clear existing messages
    showChatView();
    chatMessages.innerHTML = '';

    // Show the original task as a user message
    addMessage(session.task || 'Unknown task', 'user');

    // Show action history entries
    var actions = session.actionHistory || [];
    if (actions.length > 0) {
      addMessage('Session had ' + actions.length + ' action(s):', 'system');
      for (var i = 0; i < actions.length; i++) {
        var action = actions[i];
        var tool = action.tool || 'unknown';
        var success = action.result?.success !== false;
        var params = '';
        if (action.params) {
          try {
            params = '(' + Object.entries(action.params)
              .map(function(entry) { return entry[0] + ': "' + String(entry[1]).substring(0, 60) + '"'; })
              .join(', ') + ')';
          } catch (e) {
            params = '';
          }
        }
        var label = (success ? '[OK] ' : '[FAIL] ') + tool + params;
        addMessage(label, 'action');
      }
    } else {
      addMessage('No actions were recorded in this session.', 'system');
    }

    // Show session status footer
    var status = session.status || 'unknown';
    var endTime = session.endTime ? new Date(session.endTime).toLocaleString() : 'N/A';
    addMessage('Session ' + status + ' at ' + endTime, 'system');

  } catch (error) {
    console.error('Failed to load session view:', error);
    addMessage('Failed to load session: ' + error.message, 'error');
  }
}

async function clearAllHistorySessions() {
  if (!confirm('Delete all session history? This cannot be undone.')) return;
  try {
    await chrome.storage.local.remove(['fsbSessionLogs', 'fsbSessionIndex']);
    loadHistoryList();
  } catch (error) {
    console.error('Failed to clear all sessions:', error);
  }
}

function formatSessionDate(timestamp) {
  if (!timestamp) return 'Unknown';
  var date = new Date(timestamp);
  var now = new Date();
  var diffMs = now - date;
  var diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 1) {
    var mins = Math.floor(diffMs / (1000 * 60));
    return mins + 'm ago';
  } else if (diffHours < 24) {
    return Math.floor(diffHours) + 'h ago';
  } else if (diffHours < 48) {
    return 'Yesterday';
  }
  return date.toLocaleDateString();
}

function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


console.log(`FSB v${chrome.runtime.getManifest().version} side panel script loaded`);

// ==========================================
// /agent Slash Command Handler
// ==========================================

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// function handleAgentCommand(message) {
//   const parts = message.split(/\s+/);
//   const subCommand = parts[1] || '';
// 
//   if (subCommand === 'list') {
//     showAgentList();
//   } else if (subCommand === 'stop') {
//     const agentName = parts.slice(2).join(' ');
//     stopAgentByName(agentName);
//   } else {
//     startAgentWizard();
//   }
// }

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// async function showAgentList() {
//   try {
//     const response = await new Promise(resolve => {
//       chrome.runtime.sendMessage({ action: 'listAgents' }, resolve);
//     });
// 
//     const agents = response?.agents || [];
//     if (agents.length === 0) {
//       addMessage('No background agents configured. Use /agent to create one.', 'system');
//       return;
//     }
// 
//     let listText = 'Background Agents:\n';
//     for (const agent of agents) {
//       const status = agent.enabled ? '[ON]' : '[OFF]';
//       const lastRun = agent.lastRunAt ? new Date(agent.lastRunAt).toLocaleString() : 'Never';
//       listText += `\n${status} ${agent.name} - ${formatScheduleShort(agent.schedule)} - Last: ${lastRun}`;
//     }
//     addMessage(listText, 'system');
//   } catch (error) {
//     addMessage('Failed to load agents: ' + error.message, 'error');
//   }
// }

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// async function stopAgentByName(name) {
//   if (!name) {
//     addMessage('Usage: /agent stop <agent name>', 'system');
//     return;
//   }
// 
//   try {
//     const response = await new Promise(resolve => {
//       chrome.runtime.sendMessage({ action: 'listAgents' }, resolve);
//     });
// 
//     const agents = response?.agents || [];
//     const agent = agents.find(a => a.name.toLowerCase().includes(name.toLowerCase()));
// 
//     if (!agent) {
//       addMessage('Agent not found: "' + name + '"', 'error');
//       return;
//     }
// 
//     if (!agent.enabled) {
//       addMessage('Agent "' + agent.name + '" is already disabled.', 'system');
//       return;
//     }
// 
//     const toggleResp = await new Promise(resolve => {
//       chrome.runtime.sendMessage({ action: 'toggleAgent', agentId: agent.agentId }, resolve);
//     });
// 
//     if (toggleResp.success) {
//       addMessage('Agent "' + agent.name + '" has been disabled.', 'system');
//     } else {
//       addMessage('Failed to stop agent: ' + (toggleResp.error || 'Unknown error'), 'error');
//     }
//   } catch (error) {
//     addMessage('Error: ' + error.message, 'error');
//   }
// }

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// function startAgentWizard() {
//   chrome.runtime.openOptionsPage();
//   setTimeout(() => {
//     chrome.runtime.sendMessage({ action: 'openAgentForm' });
//   }, 500);
//   addMessage('Opening agent settings... Use the form in the options page to create your agent.', 'system');
// }

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// function formatScheduleShort(schedule) {
//   if (!schedule) return 'Not set';
//   switch (schedule.type) {
//     case 'interval':
//       return 'Every ' + (schedule.intervalMinutes || 1) + ' min';
//     case 'daily':
//       return 'Daily at ' + (schedule.dailyTime || '09:00');
//     case 'once':
//       return 'Run once';
//     default:
//       return schedule.type;
//   }
// }
