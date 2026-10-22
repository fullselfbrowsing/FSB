// FSB Persistent Side Panel Script

// Phase 243 plan 03 (UI-02): the sidepanel's surface id (matches the
// legacy:sidepanel agent synthesized by ensureLegacySidepanelAgent below).
// When the active tab is owned by THIS surface, the ownership status
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

/* FSB_SKOPEO_SIDEPANEL_CONTROLLER_START */
(function initializeFSBSkopeoSidepanelController(global) {
  'use strict';

  var COMMAND = 'toggle-skopeo-current-tab';
  var SHORTCUTS_URL = 'chrome://extensions/shortcuts';
  var UNASSIGNED_SHORTCUT = 'Shortcut not assigned \u00b7 Set in Chrome shortcuts';
  var ACTIVE_KILL_HINT = 'Esc Esc: turn off Skopeo in this tab';
  var _nodes = null;
  var _initialized = false;
  var _shortcutHint = UNASSIGNED_SHORTCUT;
  var _activationSerial = 0;
  var _currentActivation = null;
  var _requestSerial = 0;
  var _latestRequestByLane = new Map();
  var _presentationSerial = 0;
  var _latestPresentation = null;
  var _highestGenerationByTab = new Map();
  var _lifecyclePresentationByTab = new Map();

  function positiveTabId(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  }

  function activeTabMatches(tabId) {
    return positiveTabId(tabId) && tabId === _activeTabIdSnapshot;
  }

  function claimActivation(tabId) {
    if (!positiveTabId(tabId)) return null;
    _activationSerial += 1;
    _currentActivation = Object.freeze({ tabId: tabId, token: _activationSerial });
    return _currentActivation;
  }

  function claimPresentation(capture) {
    if (!capture || (capture.lane !== 'status' && capture.lane !== 'toggle') ||
        !positiveTabId(capture.tabId) || !activeTabMatches(capture.tabId) ||
        !_currentActivation || _currentActivation.tabId !== capture.tabId ||
        _currentActivation.token !== capture.activationToken) {
      return null;
    }
    _presentationSerial += 1;
    _latestPresentation = Object.freeze({
      tabId: capture.tabId,
      activationToken: capture.activationToken,
      token: _presentationSerial
    });
    return _latestPresentation;
  }

  function captureRequest(tabId, lane) {
    if (!positiveTabId(tabId) || !activeTabMatches(tabId)) return null;
    if (lane !== 'status' && lane !== 'toggle' && lane !== 'shortcut') return null;
    var activation = _currentActivation;
    if (!activation) activation = claimActivation(tabId);
    if (!activation || activation.tabId !== tabId) return null;
    _requestSerial += 1;
    var capture = {
      tabId: tabId,
      activationToken: activation.token,
      requestToken: _requestSerial,
      lane: lane
    };
    if (lane === 'status' || lane === 'toggle') {
      var presentation = claimPresentation(capture);
      if (!presentation) return null;
      capture.presentationToken = presentation.token;
    }
    capture = Object.freeze(capture);
    _latestRequestByLane.set(lane, capture.requestToken);
    return capture;
  }

  function requestIsCurrent(capture) {
    return !!capture && positiveTabId(capture.tabId) && activeTabMatches(capture.tabId) &&
      !!_currentActivation && _currentActivation.tabId === capture.tabId &&
      _currentActivation.token === capture.activationToken &&
      _latestRequestByLane.get(capture.lane) === capture.requestToken;
  }

  function presentationIsCurrent(capture) {
    return !!capture && (capture.lane === 'status' || capture.lane === 'toggle') &&
      positiveTabId(capture.tabId) && activeTabMatches(capture.tabId) &&
      !!_currentActivation && _currentActivation.tabId === capture.tabId &&
      _currentActivation.token === capture.activationToken &&
      !!_latestPresentation && _latestPresentation.tabId === capture.tabId &&
      _latestPresentation.activationToken === capture.activationToken &&
      _latestPresentation.token === capture.presentationToken;
  }

  function lifecycleStage(response) {
    var state = localStateCopy(response).state;
    if (state === 'starting') return 1;
    if (state === 'active') return 2;
    return 3;
  }

  function acceptLifecyclePresentation(tabId, response, options) {
    if (!positiveTabId(tabId) || !response || typeof response !== 'object' ||
        Array.isArray(response)) return false;
    var generation = response.generation;
    var floor = _highestGenerationByTab.get(tabId);
    var lifecycle = _lifecyclePresentationByTab.get(tabId);
    var hasFloor = typeof floor === 'number' && Number.isSafeInteger(floor) && floor > 0;
    var isPositiveGeneration = typeof generation === 'number' &&
      Number.isSafeInteger(generation) && generation > 0;
    if (!isPositiveGeneration) {
      var resetLifecycleBaseline = options && options.allowLifecycleBaselineReset === true &&
        options.advance !== false && response.success === true && response.tabId === tabId &&
        response.status === 'off' && generation === 0;
      if (resetLifecycleBaseline) {
        _highestGenerationByTab.delete(tabId);
        _lifecyclePresentationByTab.delete(tabId);
        return true;
      }
      var allowUnversionedTerminal = options && options.allowUnversionedTerminal === true &&
        lifecycleStage(response) === 3;
      return !hasFloor || allowUnversionedTerminal;
    }
    if (hasFloor && generation < floor) return false;
    var stage = lifecycleStage(response);
    if (lifecycle && (generation < lifecycle.generation ||
        (generation === lifecycle.generation && stage < lifecycle.stage))) {
      return false;
    }
    if (!options || options.advance !== false) {
      if (!hasFloor || generation > floor) _highestGenerationByTab.set(tabId, generation);
      if (!lifecycle || generation > lifecycle.generation || stage > lifecycle.stage) {
        _lifecyclePresentationByTab.set(tabId, Object.freeze({
          generation: generation,
          stage: stage
        }));
      }
    }
    return true;
  }

  function getSkopeoNodes() {
    if (_nodes) return _nodes;
    var nodes = {
      row: document.getElementById('skopeoControl'),
      title: document.getElementById('skopeoTitle'),
      toggle: document.getElementById('skopeoToggle'),
      status: document.getElementById('skopeoStatus'),
      body: document.getElementById('skopeoStatusBody'),
      action: document.getElementById('skopeoAction'),
      hint: document.getElementById('skopeoHint')
    };
    if (!nodes.row || !nodes.title || !nodes.toggle || !nodes.status ||
        !nodes.body || !nodes.action || !nodes.hint) {
      return null;
    }
    _nodes = nodes;
    return _nodes;
  }

  function setSkopeoText(node, value) {
    if (!node) return;
    var next = typeof value === 'string' ? value : '';
    if (node.textContent !== next) node.textContent = next;
  }

  function setSkopeoAttribute(node, name, value) {
    if (!node) return;
    var next = String(value);
    if (node.getAttribute(name) !== next) node.setAttribute(name, next);
  }

  function setSkopeoOptionalCopy(node, value) {
    var present = typeof value === 'string' && value.length > 0;
    setSkopeoText(node, present ? value : '');
    node.hidden = !present;
  }

  function localStateCopy(response) {
    var status = response && typeof response.status === 'string' ? response.status : 'error';
    var code = response && typeof response.code === 'string' ? response.code : '';
    if (code === 'SKOPEO_UNSAFE_LAYOUT') {
      return {
        state: 'error',
        status: 'Skopeo can\u2019t open safely on this layout.',
        body: 'Zoom out or resize the page, then try again.',
        action: 'Try again',
        checked: false,
        busy: false,
        disabled: false
      };
    }
    if (status === 'off') {
      return {
        state: 'off',
        status: 'Off for this tab',
        body: '',
        action: 'Turn on Skopeo',
        checked: false,
        busy: false,
        disabled: false
      };
    }
    if (status === 'starting') {
      return {
        state: 'starting',
        status: 'Starting on this tab\u2026',
        body: '',
        action: 'Turn off Skopeo',
        checked: true,
        busy: true,
        disabled: false
      };
    }
    if (status === 'active') {
      return {
        state: 'active',
        status: 'On \u00b7 Ambient',
        body: '',
        action: 'Turn off Skopeo',
        checked: true,
        busy: false,
        disabled: false
      };
    }
    if (status === 'unsupported' || code === 'SKOPEO_UNSUPPORTED_TAB') {
      return {
        state: 'unsupported',
        status: 'Skopeo can\u2019t run on this page.',
        body: 'Open a standard web page, then try again.',
        action: '',
        checked: false,
        busy: false,
        disabled: true
      };
    }
    return {
      state: 'error',
      status: 'Skopeo didn\u2019t start.',
      body: 'Nothing was added to the page. Try again.',
      action: 'Try again',
      checked: false,
      busy: false,
      disabled: false
    };
  }

  function renderSkopeoState(tabId, response, requestCapture, generationOptions) {
    if (requestCapture && (!requestIsCurrent(requestCapture) ||
        !presentationIsCurrent(requestCapture))) return false;
    if (!activeTabMatches(tabId)) return false;
    if (response && positiveTabId(response.tabId) && response.tabId !== tabId) return false;
    var nodes = getSkopeoNodes();
    if (!nodes || !activeTabMatches(tabId) ||
        (requestCapture && (!requestIsCurrent(requestCapture) ||
          !presentationIsCurrent(requestCapture)))) return false;
    var view = localStateCopy(response);
    if (requestCapture && (!requestIsCurrent(requestCapture) ||
        !presentationIsCurrent(requestCapture))) return false;
    if (generationOptions &&
        !acceptLifecyclePresentation(tabId, response, generationOptions)) return false;

    if (nodes.row.dataset.state !== view.state) nodes.row.dataset.state = view.state;
    setSkopeoAttribute(nodes.row, 'aria-live', view.state === 'off' ? 'off' : 'polite');
    setSkopeoAttribute(nodes.row, 'aria-atomic', 'true');
    setSkopeoAttribute(nodes.row, 'aria-busy', view.busy ? 'true' : 'false');
    setSkopeoAttribute(nodes.toggle, 'aria-checked', view.checked ? 'true' : 'false');
    nodes.toggle.disabled = view.disabled;
    if (view.disabled) {
      setSkopeoAttribute(nodes.toggle, 'aria-disabled', 'true');
    } else {
      nodes.toggle.removeAttribute('aria-disabled');
    }

    setSkopeoText(nodes.status, view.status);
    setSkopeoOptionalCopy(nodes.body, view.body);
    setSkopeoOptionalCopy(nodes.action, view.action);
    setSkopeoText(nodes.hint, view.state === 'active' ? ACTIVE_KILL_HINT : _shortcutHint);
    nodes.hint.disabled = view.state === 'active';
    nodes.hint.tabIndex = view.state === 'active' ? -1 : 0;
    setSkopeoAttribute(
      nodes.hint,
      'aria-label',
      view.state === 'active' ? ACTIVE_KILL_HINT : 'Open Chrome shortcut settings'
    );
    if (view.state === 'active') {
      setSkopeoAttribute(nodes.hint, 'aria-disabled', 'true');
    } else {
      nodes.hint.removeAttribute('aria-disabled');
    }
    return true;
  }

  function resetSkopeoControl(tabId) {
    if (!activeTabMatches(tabId)) return false;
    var nodes = getSkopeoNodes();
    if (!nodes || !activeTabMatches(tabId)) return false;
    nodes.row.dataset.state = 'loading';
    setSkopeoAttribute(nodes.row, 'aria-live', 'off');
    setSkopeoAttribute(nodes.row, 'aria-busy', 'true');
    setSkopeoAttribute(nodes.toggle, 'aria-checked', 'false');
    setSkopeoAttribute(nodes.toggle, 'aria-disabled', 'true');
    nodes.toggle.disabled = true;
    setSkopeoText(nodes.status, '');
    setSkopeoOptionalCopy(nodes.body, '');
    setSkopeoOptionalCopy(nodes.action, '');
    setSkopeoText(nodes.hint, _shortcutHint);
    return true;
  }

  async function refreshSkopeoControl(tabId) {
    var capturedTabId = positiveTabId(tabId) ? tabId : _activeTabIdSnapshot;
    var requestCapture = captureRequest(capturedTabId, 'status');
    if (!requestIsCurrent(requestCapture) || !presentationIsCurrent(requestCapture)) return false;
    try {
      if (!requestIsCurrent(requestCapture) || !presentationIsCurrent(requestCapture)) return false;
      var response = await chrome.runtime.sendMessage({
        action: 'skopeo:get-status',
        tabId: capturedTabId
      });
      if (!requestIsCurrent(requestCapture) || !presentationIsCurrent(requestCapture)) return false;
      if (response && positiveTabId(response.tabId) && response.tabId !== capturedTabId) return false;
      if (!requestIsCurrent(requestCapture) || !presentationIsCurrent(requestCapture)) return false;
      return renderSkopeoState(capturedTabId, response, requestCapture, {
        advance: true,
        allowUnversionedTerminal: true,
        allowLifecycleBaselineReset: true
      });
    } catch (_error) {
      if (!requestIsCurrent(requestCapture) || !presentationIsCurrent(requestCapture)) return false;
      return renderSkopeoState(capturedTabId, {
        success: false,
        tabId: capturedTabId,
        status: 'error',
        code: 'SKOPEO_START_FAILED'
      }, requestCapture, { advance: true, allowUnversionedTerminal: true });
    }
  }

  async function handleSkopeoToggle() {
    var capturedTabId = _activeTabIdSnapshot;
    var requestCapture = captureRequest(capturedTabId, 'toggle');
    if (!requestIsCurrent(requestCapture) || !presentationIsCurrent(requestCapture)) return false;
    var nodes = getSkopeoNodes();
    if (!nodes || nodes.row.dataset.state === 'loading' || nodes.toggle.disabled) return false;

    if (nodes.row.dataset.state !== 'starting' && nodes.row.dataset.state !== 'active') {
      if (!requestIsCurrent(requestCapture) || !presentationIsCurrent(requestCapture)) return false;
      renderSkopeoState(capturedTabId, { status: 'starting' }, requestCapture);
    }
    try {
      if (!requestIsCurrent(requestCapture) || !presentationIsCurrent(requestCapture)) return false;
      var response = await chrome.runtime.sendMessage({
        action: 'skopeo:toggle-tab',
        tabId: capturedTabId
      });
      if (!requestIsCurrent(requestCapture) || !presentationIsCurrent(requestCapture)) return false;
      if (response && positiveTabId(response.tabId) && response.tabId !== capturedTabId) return false;
      if (!requestIsCurrent(requestCapture) || !presentationIsCurrent(requestCapture)) return false;
      return renderSkopeoState(capturedTabId, response, requestCapture, {
        advance: true,
        allowUnversionedTerminal: true
      });
    } catch (_error) {
      if (!requestIsCurrent(requestCapture) || !presentationIsCurrent(requestCapture)) return false;
      return renderSkopeoState(capturedTabId, {
        success: false,
        tabId: capturedTabId,
        status: 'error',
        code: 'SKOPEO_START_FAILED'
      }, requestCapture, { advance: true, allowUnversionedTerminal: true });
    }
  }

  function normalizeSkopeoShortcut(shortcut) {
    if (typeof shortcut !== 'string' || shortcut.trim().length === 0) return null;
    var raw = shortcut.trim();
    if (raw === 'Alt+Space') return '\u2325 Space';
    return raw.split('+').map(function (part) { return part.trim(); }).filter(Boolean).join(' ');
  }

  async function refreshSkopeoShortcut(tabId) {
    var capturedTabId = positiveTabId(tabId) ? tabId : _activeTabIdSnapshot;
    var requestCapture = captureRequest(capturedTabId, 'shortcut');
    if (!requestIsCurrent(requestCapture)) return false;
    try {
      if (!requestIsCurrent(requestCapture)) return false;
      var commands = await chrome.commands.getAll();
      if (!requestIsCurrent(requestCapture)) return false;
      var command = Array.isArray(commands)
        ? commands.find(function (entry) { return entry && entry.name === COMMAND; })
        : null;
      var normalized = normalizeSkopeoShortcut(command && command.shortcut);
      if (!requestIsCurrent(requestCapture)) return false;
      _shortcutHint = normalized
        ? 'Shortcut: ' + normalized + ' \u00b7 Change shortcut'
        : UNASSIGNED_SHORTCUT;
      var nodes = getSkopeoNodes();
      if (!nodes || !requestIsCurrent(requestCapture)) return false;
      if (nodes.row.dataset.state !== 'active') setSkopeoText(nodes.hint, _shortcutHint);
      return _shortcutHint;
    } catch (_error) {
      if (!requestIsCurrent(requestCapture)) return false;
      _shortcutHint = UNASSIGNED_SHORTCUT;
      var nodes = getSkopeoNodes();
      if (!nodes || !requestIsCurrent(requestCapture)) return false;
      if (nodes.row.dataset.state !== 'active') setSkopeoText(nodes.hint, _shortcutHint);
      return _shortcutHint;
    }
  }

  function handleSkopeoStatusEvent(message) {
    var capturedTabId = _activeTabIdSnapshot;
    if (!message || message.action !== 'skopeo:status-changed' ||
        !activeTabMatches(capturedTabId) || message.tabId !== capturedTabId) {
      return false;
    }
    if (!acceptLifecyclePresentation(capturedTabId, message, { advance: false })) {
      return false;
    }
    var requestCapture = captureRequest(capturedTabId, 'status');
    if (!requestIsCurrent(requestCapture) || !presentationIsCurrent(requestCapture)) return false;
    return renderSkopeoState(capturedTabId, message, requestCapture, { advance: true });
  }

  function onSkopeoStatusMessage(message) {
    handleSkopeoStatusEvent(message);
  }

  function handleSkopeoShortcutClick() {
    var capturedTabId = _activeTabIdSnapshot;
    if (!activeTabMatches(capturedTabId)) return false;
    var nodes = getSkopeoNodes();
    if (!nodes || nodes.row.dataset.state === 'active' || nodes.hint.disabled) return false;
    try {
      var created = chrome.tabs.create({ url: SHORTCUTS_URL });
      if (created && typeof created.catch === 'function') created.catch(function () {});
      return true;
    } catch (_error) {
      return false;
    }
  }

  function initialize() {
    if (_initialized) return true;
    var nodes = getSkopeoNodes();
    if (!nodes) return false;
    nodes.toggle.addEventListener('click', handleSkopeoToggle);
    nodes.hint.addEventListener('click', handleSkopeoShortcutClick);
    chrome.runtime.onMessage.addListener(onSkopeoStatusMessage);
    _initialized = true;
    return true;
  }

  function activateTab(tabId) {
    if (!positiveTabId(tabId)) return Promise.resolve(false);
    var activation = claimActivation(tabId);
    if (!activation) return Promise.resolve(false);
    _activeTabIdSnapshot = tabId;
    resetSkopeoControl(tabId);
    return Promise.allSettled([
      refreshSkopeoControl(tabId),
      refreshSkopeoShortcut(tabId)
    ]);
  }

  global.FSBSkopeoSidepanelController = Object.freeze({
    initialize: initialize,
    activateTab: activateTab,
    renderSkopeoState: renderSkopeoState,
    refreshSkopeoControl: refreshSkopeoControl,
    handleSkopeoToggle: handleSkopeoToggle,
    refreshSkopeoShortcut: refreshSkopeoShortcut,
    handleSkopeoStatusEvent: handleSkopeoStatusEvent
  });
})(globalThis);
/* FSB_SKOPEO_SIDEPANEL_CONTROLLER_END */

try {
  FSBSkopeoSidepanelController.initialize();
} catch (_e) {
  // Skopeo is an optional side-panel surface; unrelated chat must still boot.
}

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

// True while the active tab is owned by a non-self agent.
// Composes with updateSendButtonState's existing hasContent / isRunning gating;
// it is an ADDITIONAL gate, never a replacement. Set/cleared exclusively by
// refreshActiveTabOwnership below (no automation-lifecycle setter writes this flag --
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
      if (tabs && tabs[0] && typeof tabs[0].id === 'number'
          && Number.isSafeInteger(tabs[0].id) && tabs[0].id > 0) {
        activeTabId = tabs[0].id;
      }
    } catch (_e) { /* swallow */ }

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
  var expectedSurfaceGeneration = typeof _activeTabSurfaceSyncGeneration === 'number'
    ? _activeTabSurfaceSyncGeneration
    : null;
  var surfaceIsCurrent = function() {
    return expectedSurfaceGeneration === null
      || (typeof _activeTabSurfaceSyncGeneration === 'number'
        && expectedSurfaceGeneration === _activeTabSurfaceSyncGeneration);
  };
  try {
    await _envelopeReadyPromise;
    if (!surfaceIsCurrent()) return false;
    if (typeof FSBSidepanelTabConvStore === 'undefined') return false;
    if (!FSBSidepanelTabConvStore.isValidEnvelope(tabConvEnvelope)) return false;
    var nextConvId = FSBSidepanelTabConvStore.getTabConversation(tabConvEnvelope, tabId);
    if (nextConvId === conversationId) {
      var surfaceIsEmpty = !chatMessages
        || (typeof chatMessages.querySelector === 'function'
          ? !chatMessages.querySelector('.message')
          : (typeof chatMessages.innerHTML === 'undefined' || chatMessages.innerHTML.length === 0));
      if (nextConvId && surfaceIsEmpty) {
        try { await hydrateChatFromConversationId(nextConvId); } catch (_e) { /* best-effort */ }
        if (!surfaceIsCurrent()) return false;
      }
      return true;
    }
    if (!surfaceIsCurrent()) return false;
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
      if (!surfaceIsCurrent()) return false;
    }
    return true;
  } catch (_e) {
    return false;
  }
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

// Only claims tabs that have no conversation of their own -- a tab the user
// already used keeps its own transcript and swaps normally.
//
// Two sources for "the running conversation", in order:
//   1. this document's own state -- a start in flight or a live snapshot;
//   2. the agent registry -- the tab is owned by a delegated agent whose run
//      is bound to a conversation. This is what a freshly opened panel (or
//      one Chrome re-created) relies on, since it has no in-memory run.
async function _adoptTabIntoRunningDelegationConversation(tabId) {
  var expectedSurfaceGeneration = typeof _activeTabSurfaceSyncGeneration === 'number'
    ? _activeTabSurfaceSyncGeneration
    : null;
  var surfaceIsCurrent = function() {
    return expectedSurfaceGeneration === null
      || (typeof _activeTabSurfaceSyncGeneration === 'number'
        && expectedSurfaceGeneration === _activeTabSurfaceSyncGeneration);
  };
  try {
    if (!Number.isSafeInteger(tabId)) return false;
    await _envelopeReadyPromise;
    if (!surfaceIsCurrent()) return false;
    if (typeof FSBSidepanelTabConvStore === 'undefined'
        || !FSBSidepanelTabConvStore.isValidEnvelope(tabConvEnvelope)) return false;
    var existing = FSBSidepanelTabConvStore.getTabConversation(tabConvEnvelope, tabId);
    if (existing) return false;

    var runConversationId = null;
    if (conversationId && typeof conversationId === 'string'
        && (_delegationUiState.pendingStart === true
          || _delegationIsActiveSnapshot(_delegationUiState.snapshot))) {
      runConversationId = conversationId;
    }
    if (!runConversationId) {
      runConversationId = await _delegationConversationForOwnedTab(tabId);
      if (!surfaceIsCurrent()) return false;
    }
    if (!runConversationId) return false;

    if (!surfaceIsCurrent()) return false;
    FSBSidepanelTabConvStore.ensureTabConversation(
      tabConvEnvelope, tabId, function() { return runConversationId; }
    );
    await _persistEnvelope();
    return surfaceIsCurrent();
  } catch (_error) {
    return false;
  }
}

// Resolve the conversation of the delegated run that owns a tab, from persisted
// state only: the agent registry envelope maps tab -> owner agent -> delegation,
// and the delegation/conversation envelope maps delegation -> conversation.
// Returns null for unowned tabs, surface-owned tabs, ordinary MCP clients, and
// runs with no bound conversation.
async function _delegationConversationForOwnedTab(tabId) {
  try {
    if (!Number.isSafeInteger(tabId)) return null;
    if (typeof FSBOwnerChip === 'undefined'
        || typeof FSBOwnerChip.findOwnerInEnvelope !== 'function') return null;
    var stored = await chrome.storage.session.get(['fsbAgentRegistry']);
    var envelope = stored && stored.fsbAgentRegistry;
    var ownerAgentId = FSBOwnerChip.findOwnerInEnvelope(envelope, tabId);
    if (typeof ownerAgentId !== 'string' || ownerAgentId.length === 0
        || ownerAgentId.indexOf('legacy:') === 0) return null;
    var delegations = envelope && envelope.delegations;
    if (!delegations || typeof delegations !== 'object' || Array.isArray(delegations)) return null;
    var delegationId = null;
    var delegationIds = Object.keys(delegations);
    for (var i = 0; i < delegationIds.length; i += 1) {
      if (delegations[delegationIds[i]] === ownerAgentId
          && DELEGATION_ID_PATTERN.test(delegationIds[i])) {
        delegationId = delegationIds[i];
        break;
      }
    }
    if (!delegationId) return null;
    // Re-read: the binding was written by whichever document started the run.
    await _loadDelegationConversationEnvelope();
    return _delegationConversationForDelegationId(delegationId);
  } catch (_error) {
    return null;
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
  var surfaceGeneration = typeof _activeTabSurfaceSyncGeneration === 'number'
    ? _activeTabSurfaceSyncGeneration
    : null;
  var hydrationIsCurrent = function() {
    return surfaceGeneration === null
      || surfaceGeneration === _activeTabSurfaceSyncGeneration;
  };

  // ============================================================
  // Tier 1 (Phase 12 FINT-23): new fsbConversationMessages store.
  // ============================================================
  try {
    if (typeof FSBSidepanelMessageLog !== 'undefined'
        && typeof FSBSidepanelMessageLog.getMessages === 'function'
        && typeof FSBSidepanelMessageLog.STORAGE_KEY === 'string') {
      const bag = await chrome.storage.local.get(FSBSidepanelMessageLog.STORAGE_KEY);
      if (!hydrationIsCurrent()) return 0;
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
    if (!hydrationIsCurrent()) return 0;
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

let _headerBaseStatusLabel = 'Ready';
let _headerBaseStatusTone = '';
let _ownerStatusRefreshGeneration = 0;
let _activeTabSurfaceSyncGeneration = 0;

function _renderHeaderStatus() {
  if (!statusText || !statusDot || !statusDot.classList) return;
  statusDot.classList.remove('running', 'error');
  statusText.textContent = _headerBaseStatusLabel;
  if (_headerBaseStatusTone === 'running') statusDot.classList.add('running');
  if (_headerBaseStatusTone === 'error') statusDot.classList.add('error');
}

function _setHeaderStatus(label, tone) {
  _headerBaseStatusLabel = typeof label === 'string' && label.length > 0 ? label : 'Ready';
  _headerBaseStatusTone = tone === 'running' || tone === 'error' ? tone : '';
  _renderHeaderStatus();
}

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
  pendingStop: false,
  bindingCleanupPending: false,
  bindingCleanupOriginKey: null,
  composerLocked: false,
  lastRenderedSequence: null,
  lastAlertKey: null,
  announced: Object.create(null),
  announcedTransitions: Object.create(null),
  resyncPromise: null,
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
    if (!_delegationHasExactKeys(
      value,
      ['acceptedIdentity', 'kind', 'ok', 'providerId', 'providerLabel']
    )) return false;
    var providerId = _delegationOwnDataValue(value, 'providerId');
    var providerLabel = _delegationOwnDataValue(value, 'providerLabel');
    var provider = _delegationCanonicalProvider(providerId, providerLabel);
    var helper = typeof FsbDelegationProviders !== 'undefined'
      ? FsbDelegationProviders
      : null;
    var validateIdentity = _delegationOwnDataValue(helper, 'validateAcceptedAgentIdentity');
    if (!provider || typeof validateIdentity !== 'function') return false;
    var acceptedIdentity = null;
    try {
      acceptedIdentity = validateIdentity.call(
        helper,
        _delegationOwnDataValue(value, 'acceptedIdentity')
      );
    } catch (_error) {
      return false;
    }
    return _delegationOwnDataValue(acceptedIdentity, 'providerId') === provider.id
      && _delegationOwnDataValue(acceptedIdentity, 'label') === provider.label;
  }
  if (ok === true && kind === 'api') {
    return _delegationHasExactKeys(value, ['agentProviderId', 'kind', 'ok', 'providerId'])
      && typeof _delegationOwnDataValue(value, 'providerId') === 'string'
      && _delegationOwnDataValue(value, 'agentProviderId') === '';
  }
  if (ok !== false
      || !_delegationHasExactKeys(value, ['code', 'ok', 'providerId', 'providerLabel'])
      || typeof _delegationOwnDataValue(value, 'code') !== 'string') return false;
  var code = _delegationOwnDataValue(value, 'code');
  if ([
    'agent_offline',
    'agent_unpaired',
    'auth_unauthenticated',
    'auth_unknown',
    'bridge_session_unavailable',
    'extension_origin_mismatch',
    'native_host_missing',
    'provider_status_refresh',
    'runtime_unavailable',
    'unsupported_provider'
  ].indexOf(code) === -1) return false;
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

// Mirrors FSB_DELEGATION_START_REJECTION_DETAILS in background.js, which in turn
// mirrors failureCode() in the supervisor. A rejected start carries the gate that
// refused it so the card can name a cause instead of a shrug. Codes off this
// roster read as absent.
function _delegationStartRejectionDetail(value) {
  var reasons = {
    adapter_unavailable: 'the provider became unavailable',
    spawn_failed: 'the agent process could not be started',
    activation_failed: 'the agent process could not be verified',
    agent_protocol_drift: 'the agent spoke an unexpected protocol',
    route_lost: 'the connection to the local agent service was lost',
    daemon_shutdown: 'the local agent service shut down',
    tree_unsettled: 'an earlier agent process did not shut down',
    runtime_cleanup_failed: 'an earlier agent run was not cleaned up',
    cancelled: 'the start was cancelled'
  };
  var detail = _delegationOwnDataValue(value, 'detail');
  return typeof detail === 'string'
    && Object.prototype.hasOwnProperty.call(reasons, detail)
    ? { code: detail, reason: reasons[detail] }
    : null;
}

function _delegationValidLifecycleResponse(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.ok === true) {
    return _delegationHasExactKeys(value, ['ok', 'snapshot'])
      && typeof FsbDelegationFeed !== 'undefined'
      && FsbDelegationFeed.validateSnapshot(value.snapshot);
  }
  return (_delegationHasExactKeys(value, ['code', 'ok', 'snapshot'])
      || (_delegationHasExactKeys(value, ['code', 'detail', 'ok', 'snapshot'])
        && _delegationStartRejectionDetail(value) !== null))
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
      announcer: document.getElementById('delegationAnnouncer')
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
    announcer: document.getElementById('delegationAnnouncer')
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
  _setHeaderStatus(label, tone);
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

function _restoreActiveTabAutomationPresentation() {
  var activeEntry = getCurrentTabRunningState();
  if (!activeEntry || activeEntry.isRunning !== true) return false;
  setRunningState(_activeTabIdSnapshot, activeEntry.sessionId || null);
  return true;
}

function _hideDelegationPresentation() {
  var mount = _ensureDelegationMount();
  if (mount.run) mount.run.classList.add('hidden');
  _restoreLegacyStopControl();
  if (typeof _delegatedRunTeardown === 'function') _delegatedRunTeardown();
  if (typeof _restoreActiveTabAutomationPresentation === 'function') {
    _restoreActiveTabAutomationPresentation();
  }
}

function _renderDelegationReadyState() {
  var mount = _ensureDelegationMount();
  if (!mount.run || !mount.state || !mount.feed) return;
  _delegationUiState.mode = 'ready';
  _delegationUiState.errorCode = null;
  mount.run.classList.add('hidden');
  mount.run.setAttribute('aria-busy', 'false');
  _clearDelegationNode(mount.state);
  _clearDelegationNode(mount.feed);
  mount.state.removeAttribute('role');
  mount.state.removeAttribute('aria-live');
  _delegationUiState.lastAlertKey = null;
  _restoreLegacyStopControl();
  if (typeof _delegatedRunTeardown === 'function') _delegatedRunTeardown();
  var restoredAutomation = typeof _restoreActiveTabAutomationPresentation === 'function'
    && _restoreActiveTabAutomationPresentation();
  if (!restoredAutomation) {
    _setDelegationHeaderStatus('Ready');
  }
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
  _delegationUiState.pendingStop = false;
  _delegationUiState.bindingCleanupPending = false;
  _delegationUiState.bindingCleanupOriginKey = null;
  _delegationUiState.lastRenderedSequence = null;
  _delegationUiState.lastAlertKey = null;
  _delegationUiState.announced = Object.create(null);
  _delegationUiState.announcedTransitions = Object.create(null);
  _delegationUiState.resyncPromise = null;
  _delegationUiState.subscribed = false;
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
  var standalone = !container.firstChild;
  var error = _delegationElement('p', 'delegation-inline-error', textValue);
  if (standalone) error.id = 'delegationRunHeading';
  // The state card owns assertive semantics for lifecycle alerts. Avoid a
  // nested alert that would re-announce unchanged cleanup copy when the
  // parent is deliberately aria-live="off" on a repeated render.
  if (typeof container.getAttribute !== 'function'
    || container.getAttribute('role') !== 'alert') {
    error.setAttribute('role', 'alert');
  }
  container.appendChild(error);
  var mount = _ensureDelegationMount();
  if (mount.run && mount.state === container) {
    mount.run.classList.remove('hidden');
  }
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
      + ' runs on this browser.'
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
  _setDelegationHeaderStatus('Ready');
  _setDelegationComposerLocked(true);
  if (options.focusHeading === true && typeof heading.focus === 'function') heading.focus();
}

function _openDelegationProviderSetup() {
  openControlPanelSection('api-config');
}

async function _copyDelegationDoctorCommand() {
  var command = 'npx -y fsb-mcp-server@latest doctor';
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

async function _copyDelegationPairResetCommand() {
  var command = 'npx -y fsb-mcp-server@latest pair --reset';
  try {
    if (typeof navigator !== 'undefined'
        && navigator.clipboard
        && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(command);
      var mount = _ensureDelegationMount();
      if (mount.announcer) mount.announcer.textContent = 'Pairing reset command copied';
    }
  } catch (_error) { /* clipboard failure leaves the visible literal available */ }
}

async function _copyDelegationNativeHostInstallCommand() {
  var helper = globalThis.FsbNativeHostInstallCommand;
  var runtimeId = typeof chrome !== 'undefined'
    && chrome.runtime
    && typeof chrome.runtime.id === 'string'
    ? chrome.runtime.id
    : '';
  var command = helper && typeof helper.buildInstallCommand === 'function'
    ? helper.buildInstallCommand(
        runtimeId,
        typeof navigator !== 'undefined' ? navigator : null
      )
    : null;
  if (!command) return;
  try {
    if (typeof navigator !== 'undefined'
        && navigator.clipboard
        && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(command);
      var mount = _ensureDelegationMount();
      if (mount.announcer) mount.announcer.textContent = 'Native helper install command copied';
    }
  } catch (_error) { /* the visible recovery copy remains actionable */ }
}

// Verifying an agent provider spawns real processes and takes seconds, and the
// composer is locked for all of it. Paint before the first await so the click is
// never swallowed; the native-wake and consent states replace this in place.
// The preflight copy stays provider-neutral because the kind is not known until
// that round-trip returns -- an API send passes through this state too.
function _renderDelegationPreparing(phase) {
  var copyByPhase = {
    preflight: {
      heading: 'Checking provider',
      body: 'FSB is checking your AI provider before sending your message.',
      status: 'Checking provider'
    },
    starting: {
      heading: 'Starting agent',
      body: 'FSB is handing your message to the agent.',
      status: 'Starting agent'
    }
  };
  var copy = Object.prototype.hasOwnProperty.call(copyByPhase, phase)
    ? copyByPhase[phase]
    : null;
  if (!copy) return false;
  var mount = _ensureDelegationMount();
  if (!mount.run || !mount.state || !mount.feed) return false;

  _delegationUiState.mode = 'preparing';
  mount.run.classList.remove('hidden');
  mount.run.setAttribute('aria-busy', 'true');
  _clearDelegationNode(mount.state);
  _clearDelegationNode(mount.feed);
  mount.state.className = 'delegation-state-card delegation-tone-info';
  mount.state.setAttribute('data-delegation-state', 'preparing');
  mount.state.setAttribute('data-delegation-tone', 'info');
  mount.state.removeAttribute('role');
  mount.state.removeAttribute('aria-live');
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
  heading.appendChild(_delegationElement('span', 'delegation-heading-copy', copy.heading));
  mount.state.appendChild(heading);
  mount.state.appendChild(_delegationElement(
    'p', 'delegation-state-body delegation-native-wake-body', copy.body
  ));
  _setDelegationHeaderStatus(copy.status, '');
  _announceDelegationLifecycleKey('preparing:' + phase, copy.heading + '. ' + copy.body);
  return true;
}

// Several guards abandon a send silently (composer edited, tab reassigned). Once
// the preparing state is on screen those must not leave a spinner behind.
function _clearDelegationPreparing() {
  if (_delegationUiState.mode === 'preparing') _renderDelegationReadyState();
}

function _renderDelegationNativeWakeChecking(intentId, attemptId) {
  if (!_delegationPreflightIntentIsCurrent(intentId)
      || typeof attemptId !== 'string'
      || !DELEGATION_NATIVE_WAKE_ID_PATTERN.test(attemptId)
      || _delegationUiState.pendingAttemptId !== null) return false;
  var mount = _ensureDelegationMount();
  if (!mount.run || !mount.state || !mount.feed) return false;

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
  _setDelegationHeaderStatus('Checking agent service', '');
  _announceDelegationLifecycleKey(
    'native-wake-checking:' + intentId,
    'Checking local agent service. Your message has not been sent.'
  );
  return true;
}

function _renderDelegationPreflightFailure(result) {
  result = result || {};
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

  if (code === 'agent_unpaired' || code === 'native_host_missing') {
    headingText = 'Automatic connection needs the native helper';
    bodyText = 'Install or update the FSB native helper, then try this message again. FSB will connect this browser automatically.';
    primaryLabel = 'Copy install command';
    primaryAction = _copyDelegationNativeHostInstallCommand;
    secondaryLabel = null;
    secondaryAction = null;
  } else if (code === 'extension_origin_mismatch') {
    headingText = 'Native helper is paired with another extension';
    bodyText = 'Reset the native helper pairing, then try this message again. FSB will pair this extension automatically.';
    primaryLabel = 'Copy reset command';
    primaryAction = _copyDelegationPairResetCommand;
    secondaryLabel = null;
    secondaryAction = null;
  } else if (code === 'bridge_session_unavailable') {
    headingText = 'Local agent session is unavailable';
    bodyText = 'Run the doctor command, restart the local FSB service if prompted, then try this message again.';
    primaryLabel = 'Copy doctor command';
    primaryAction = _copyDelegationDoctorCommand;
    secondaryLabel = null;
    secondaryAction = null;
  } else if (code === 'unsupported_provider') {
    headingText = providerLabel + ' cannot run browser tasks';
    bodyText = 'The selected provider does not support agents that control browser tabs. Choose a supported agent provider, then try this message again.';
    primaryLabel = 'Choose another provider';
    primaryAction = _openDelegationProviderSetup;
    secondaryLabel = null;
    secondaryAction = null;
  } else if (code === 'auth_unauthenticated') {
    headingText = providerLabel + ' cannot start this task';
    bodyText = 'Sign in to ' + providerLabel
      + ' locally, then try this message again.';
    primaryLabel = 'Open provider setup';
    primaryAction = _openDelegationProviderSetup;
    secondaryLabel = 'Back to message';
    secondaryAction = _backToDelegationMessage;
  } else if (code === 'auth_unknown') {
    headingText = providerLabel + ' cannot start this task';
    bodyText = providerLabel
      + ' sign-in status could not be verified. Use Test Connection in API Configuration, then try again.';
    primaryLabel = 'Open provider setup';
    primaryAction = _openDelegationProviderSetup;
    secondaryLabel = 'Back to message';
    secondaryAction = _backToDelegationMessage;
  } else if (code === 'start_rejected') {
    var startDetail = _delegationStartRejectionDetail(result);
    headingText = providerLabel + ' cannot start this task';
    bodyText = providerLabel
      + (startDetail
        ? ' could not start a delegated browser run because '
          + startDetail.reason + ' (' + startDetail.code + ').'
        : ' could not pass FSB\'s final delegated-browser start checks.')
      + ' Test Connection may still succeed because it does not start a delegated run. Retry the message or review provider setup.';
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
  _restoreLegacyStopControl();
  mount.state.removeAttribute('aria-live');
  if (code === 'agent_offline'
      || code === 'runtime_unavailable'
      || code === 'bridge_session_unavailable') {
    mount.state.setAttribute('role', 'alert');
  } else {
    mount.state.removeAttribute('role');
  }
  var offlinePresentation = code === 'agent_offline'
    || code === 'runtime_unavailable'
    || code === 'bridge_session_unavailable';
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
  if (offlinePresentation || code === 'extension_origin_mismatch') {
    mount.state.appendChild(_delegationElement(
      'code',
      'delegation-doctor-command',
      code === 'extension_origin_mismatch'
        ? 'npx -y fsb-mcp-server@latest pair --reset'
        : 'npx -y fsb-mcp-server@latest doctor'
    ));
  }
  var actions = _delegationElement('div', 'delegation-state-actions');
  actions.appendChild(_delegationAction(primaryLabel, '', primaryAction));
  if (secondaryLabel) actions.appendChild(_delegationAction(secondaryLabel, '', secondaryAction));
  mount.state.appendChild(actions);
  _setDelegationHeaderStatus(
    offlinePresentation ? 'Agent offline' : 'Ready',
    offlinePresentation ? 'error' : ''
  );
  _setDelegationComposerLocked(false);
  if (typeof heading.focus === 'function') heading.focus();
}

function _delegationStateLabel(snapshot) {
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
  if (_delegationIsActiveSnapshot(snapshot)) return 'Working';
  if (snapshot.state === 'restart_lost') return 'Run ended';
  if (snapshot.state === 'failed') return 'Agent could not finish this task';
  return 'Ready';
}

function _delegationHeaderPresentation(snapshot) {
  var failed = snapshot && (
    snapshot.state === 'failed'
    || snapshot.state === 'restart_lost'
    || snapshot.connection === 'offline'
    || snapshot.connection === 'disconnected'
  );
  if (failed) return { label: 'Error', tone: 'error' };
  if (_delegationIsActiveSnapshot(snapshot)) {
    return { label: 'Working', tone: 'running' };
  }
  return { label: 'Ready', tone: '' };
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
  var stopLabel = stopping ? 'Stopping Automation…' : 'Stop Automation';
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
    'code', 'delegation-doctor-command', 'npx -y fsb-mcp-server@latest doctor'
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

function _renderDelegationRunHeader(container, snapshot) {
  _clearDelegationNode(container);
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
  else if (unpaired) headingText = 'Automatic connection needs the native helper';
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
      'Install or update the FSB native helper, then try again. FSB will connect this browser automatically.'
    ));
    _appendDelegationActionRow(container, [{
      label: 'Copy install command',
      handler: _copyDelegationNativeHostInstallCommand
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
    var providerReportedFailure = terminalCode === 'provider_error';
    container.appendChild(_delegationElement(
      'p',
      'delegation-state-body',
      providerReportedFailure
        ? providerLabel
          + ' reported an error before completing this task. Raw provider output was not retained. Try the same message again.'
        : providerLabel
          + ' stopped before the task was complete. Try the same message again.'
    ));
    _appendDelegationTechnicalCode(container, terminalCode || 'agent_failed');
    var retryActions = _delegationElement('div', 'delegation-state-actions');
    retryActions.appendChild(_delegationAction(
      'Try message again', '', function() { _prepareDelegationTask(true); }
    ));
    container.appendChild(retryActions);
  } else if (_delegationIsActiveSnapshot(snapshot)) {
    container.appendChild(_delegationElement(
      'p', 'delegation-state-body', 'Automation is working'
    ));
  }
  if (_delegationUiState.errorCode === 'mapping_unavailable') {
    _renderDelegationInlineError(container, 'Automation control is no longer available for this tab.');
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

// Kept outside _delegationUiState, which is wiped on every conversation switch --
// holding the claim there would re-emit the bubble each time the user came back.
var _delegationAnsweredIds = new Set();
var DELEGATION_ANSWERED_LIMIT = 64;
// Answer delivery must happen exactly once per delegation across panel
// documents, so the dedupe set is mirrored to session storage.
var DELEGATION_ANSWERED_STORAGE_KEY = 'fsbDelegationAnsweredIds';

function _markDelegationAnswered(delegationId) {
  _delegationAnsweredIds.add(delegationId);
  while (_delegationAnsweredIds.size > DELEGATION_ANSWERED_LIMIT) {
    _delegationAnsweredIds.delete(_delegationAnsweredIds.values().next().value);
  }
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session
        && typeof chrome.storage.session.set === 'function') {
      var answeredPayload = {};
      answeredPayload[DELEGATION_ANSWERED_STORAGE_KEY] = Array.from(_delegationAnsweredIds);
      chrome.storage.session.set(answeredPayload);
    }
  } catch (_persistError) { /* dedupe degrades to this document only */ }
}

async function _loadDelegationAnsweredIds() {
  try {
    var stored = await chrome.storage.session.get(DELEGATION_ANSWERED_STORAGE_KEY);
    var ids = stored && stored[DELEGATION_ANSWERED_STORAGE_KEY];
    if (Array.isArray(ids)) {
      for (var i = 0; i < ids.length; i += 1) {
        if (typeof ids[i] === 'string') _delegationAnsweredIds.add(ids[i]);
      }
    }
  } catch (_loadError) { /* start with the in-memory set */ }
}

function _delegationConversationForDelegationId(delegationId) {
  if (!delegationId || !_delegationConversationEnvelope) return null;
  var byConversation = _delegationConversationEnvelope.byConversation;
  if (!byConversation || typeof byConversation !== 'object') return null;
  var keys = Object.keys(byConversation);
  for (var i = 0; i < keys.length; i += 1) {
    if (byConversation[keys[i]] === delegationId) return keys[i];
  }
  return null;
}

// hydrated renders deliver too: a raced tab-surface sync can leave the panel
// unsubscribed while the run finishes, and a reopened panel document must still
// receive the answer. The persisted answered set is the only dedupe.
function _renderDelegationAnswerBubble(snapshot, hydrated) {
  if (!snapshot || !snapshot.terminal || snapshot.terminal.code !== 'completed') return false;
  var answer = snapshot.terminal.answer;
  if (typeof answer !== 'string' || !answer) return false;
  if (_delegationAnsweredIds.has(snapshot.delegationId)) return false;
  if (!_delegationIsSelectedConversation()) {
    var runConversationId = _delegationConversationForDelegationId(snapshot.delegationId);
    if (!runConversationId) return false;
    _markDelegationAnswered(snapshot.delegationId);
    _persistMessageToConversation('assistant', answer, 'text', runConversationId, null, null);
    return true;
  }
  _markDelegationAnswered(snapshot.delegationId);
  if (typeof currentStatusMessage !== 'undefined' && currentStatusMessage) {
    completeStatusMessage(answer, 'ai');
  } else {
    addCompletionMessage(answer, 'ai');
  }
  return true;
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
    textValue = 'Starting automation';
  } else if (snapshot.state === 'stopping') {
    suffix = 'stopping';
    textValue = 'Stopping automation';
  } else if (snapshot.state === 'held') {
    suffix = 'held';
    textValue = 'Automation paused';
  } else if (snapshot.state === 'resuming') {
    suffix = 'resuming';
    textValue = 'Resuming automation';
  } else if (snapshot.state === 'holding') {
    suffix = 'holding';
    textValue = 'Pausing automation';
  } else if (snapshot.state === 'running'
      && previousSnapshot
      && (previousSnapshot.state === 'held' || previousSnapshot.state === 'resuming')) {
    suffix = 'resumed';
    textValue = 'Automation resumed';
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
  var headerPresentation = _delegationHeaderPresentation(snapshot);
  _setDelegationHeaderStatus(headerPresentation.label, headerPresentation.tone);
  _setDelegationComposerLocked(_delegationSnapshotLocksComposer(snapshot));
  if (typeof _renderDelegationAnswerBubble === 'function') {
    _renderDelegationAnswerBubble(snapshot, options && options.hydrated === true);
  }
  if (typeof _delegatedRunReconcile === 'function') {
    _delegatedRunReconcile(snapshot, options || {});
  }
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

function _requestDelegationRuntimeResync() {
  if (_delegationUiState.resyncPromise) return true;
  var requestedId = _delegationUiState.delegationId;
  var pending = Promise.resolve().then(function() {
    if (requestedId !== _delegationUiState.delegationId
        || !_delegationIsSelectedConversation()) return false;
    return _refreshSelectedDelegationSnapshot({ hydrated: true });
  }).catch(function() {
    return false;
  });
  _delegationUiState.resyncPromise = pending;
  pending.then(function() {
    if (_delegationUiState.resyncPromise === pending) {
      _delegationUiState.resyncPromise = null;
    }
  }, function() {
    if (_delegationUiState.resyncPromise === pending) {
      _delegationUiState.resyncPromise = null;
    }
  });
  return true;
}

function _delegationPreviousRuntimeSnapshot(snapshot) {
  return snapshot ? {
    delegationId: snapshot.delegationId,
    state: snapshot.state,
    provider: snapshot.provider,
    activeTab: snapshot.activeTab
  } : null;
}

function _renderDelegationRuntimeMetadata(
  mount,
  snapshot,
  previousSnapshot,
  previousLastSequence,
  message
) {
  _delegationUiState.mode = 'snapshot';
  mount.run.classList.remove('hidden');
  mount.run.setAttribute(
    'aria-busy',
    snapshot.state === 'holding'
      || snapshot.state === 'resuming'
      || snapshot.state === 'stopping'
      || _delegationUiState.pendingStop
      ? 'true'
      : 'false'
  );
  var alertKey = _delegationSnapshotAlertKey(snapshot);
  if (alertKey) {
    mount.state.setAttribute('role', 'alert');
    if (alertKey === _delegationUiState.lastAlertKey) {
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

  var announcementParts = [];
  var lifecycleAnnouncement = _delegationLifecycleAnnouncement(
    snapshot,
    previousSnapshot,
    false
  );
  if (lifecycleAnnouncement) announcementParts.push(lifecycleAnnouncement);
  if (Number.isSafeInteger(message.announceSequence)
      && message.announceSequence > previousLastSequence
      && message.entry
      && message.entry.sequence === message.announceSequence
      && mount.announcer) {
    var deliveryKey = snapshot.delegationId + ':' + message.announceSequence;
    if (!_delegationUiState.announced[deliveryKey]) {
      _delegationUiState.announced[deliveryKey] = true;
      announcementParts.push(_delegationAnnouncement(message.entry));
    }
  }
  if (announcementParts.length && mount.announcer) {
    mount.announcer.textContent = announcementParts.join('. ');
  }
  var headerPresentation = _delegationHeaderPresentation(snapshot);
  _setDelegationHeaderStatus(headerPresentation.label, headerPresentation.tone);
  _setDelegationComposerLocked(_delegationSnapshotLocksComposer(snapshot));
  if (Number.isSafeInteger(message.announceSequence)
      && message.announceSequence > previousLastSequence
      && message.entry
      && message.entry.sequence === message.announceSequence
      && typeof _delegatedRunEmitEntry === 'function') {
    _delegatedRunEmitEntry(message.entry);
  }
  if (typeof _renderDelegationAnswerBubble === 'function') {
    _renderDelegationAnswerBubble(snapshot, false);
  }
  if (typeof _delegatedRunReconcile === 'function') {
    _delegatedRunReconcile(snapshot, {});
  }
  return true;
}

function _handleDelegationRuntimeUpdate(message) {
  if (!_delegationUiState.subscribed
      || !message
      || message.type !== 'FSB_DELEGATION_UPDATED'
      || !_delegationIsSelectedConversation()) return false;
  if (message.view
      && typeof message.view.delegationId === 'string'
      && message.view.delegationId !== _delegationUiState.delegationId) return false;
  if (typeof FsbDelegationFeed === 'undefined'
      || typeof FsbDelegationFeed.validateRuntimeUpdate !== 'function'
      || typeof FsbDelegationFeed.applyRuntimeUpdate !== 'function'
      || !FsbDelegationFeed.validateRuntimeUpdate(message)) {
    return _requestDelegationRuntimeResync();
  }
  if (message.view.delegationId !== _delegationUiState.delegationId) return false;
  var snapshot = _delegationUiState.snapshot;
  if (!snapshot || snapshot.delegationId !== message.view.delegationId) {
    return _requestDelegationRuntimeResync();
  }
  var mount = _ensureDelegationMount();
  if (!mount.run || !mount.state || !mount.feed) return false;
  var previousSnapshot = _delegationPreviousRuntimeSnapshot(snapshot);
  var previousLastSequence = Number.isSafeInteger(_delegationUiState.lastRenderedSequence)
    ? _delegationUiState.lastRenderedSequence
    : snapshot.entries.length;
  var applied = FsbDelegationFeed.applyRuntimeUpdate(mount.feed, snapshot, message);
  if (!applied || applied.ok !== true) return _requestDelegationRuntimeResync();
  _delegationUiState.snapshot = applied.snapshot;
  _delegationUiState.lastRenderedSequence = applied.lastSequence;
  if (_delegationUiState.bindingCleanupPending === true) {
    _delegationUpdateUnboundCleanup(
      _delegationUiState.bindingCleanupOriginKey,
      message.view.delegationId,
      applied.snapshot,
      _delegationUiState.task,
      _delegationUiState.pendingStop
    );
  }
  return _renderDelegationRuntimeMetadata(
    mount,
    applied.snapshot,
    previousSnapshot,
    previousLastSequence,
    message
  );
}

async function _beginDelegationStart(challengeId) {
  if (_delegationUiState.pendingStart || typeof _delegationUiState.task !== 'string') return;
  var originTabId = _activeTabIdSnapshot;
  if (!_delegationValidConversationId(conversationId) && Number.isSafeInteger(originTabId)) {
    try { await ensureTabConversationForTab(originTabId); } catch (_error) { /* fall through */ }
  }
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
  _renderDelegationPreparing('starting');
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
      _delegationUiState.challengeId = null;
      _delegationUiState.challengeExpiresAt = null;
      var startRejection = {
        ok: false,
        code: 'start_rejected',
        providerId: _delegationUiState.providerId,
        providerLabel: _delegationUiState.providerLabel
      };
      var rejectionDetail = _delegationStartRejectionDetail(response);
      if (rejectionDetail) startRejection.detail = rejectionDetail.code;
      _renderDelegationPreflightFailure(startRejection);
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

  if (acceptedConversationId !== conversationId) {
    if (_delegationValidConversationId(acceptedConversationId)) {
      _persistMessageToConversation('user', originTask, 'text', acceptedConversationId);
    }
    console.warn('[sidepanel] delegated run not rendered: conversation changed',
      { accepted: acceptedConversationId, selected: conversationId });
    return;
  }
  if (originTabId !== _activeTabIdSnapshot) {
    console.log('[sidepanel] delegated run rendered after active-tab drift',
      { originTabId: originTabId, activeTabId: _activeTabIdSnapshot });
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
  // The accepted task must not resurrect on the next panel boot (the boot path
  // restores lastTask into the composer). Guarded: this function also runs in
  // harness sandboxes that provide no chrome global.
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local
      && typeof chrome.storage.local.set === 'function') {
    chrome.storage.local.set({ lastTask: '' });
  }
  updateSendButtonState();
  _renderDelegationSnapshot(response.snapshot, { hydrated: false, announceSequence: null });
  _delegatedRunBeginPresentation(response.snapshot, originTask);
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
    'Stopping Automation'
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

var _delegationRuntimeRecoveryPending = false;

try {
  chrome.runtime.onMessage.addListener(function(message) {
    if (_handleDelegationNativeWakeChecking(message)) return;
    var handled = _handleDelegationRuntimeUpdate(message);
    // Recovery: an update for the SELECTED conversation's own run arrived while
    // the panel was not subscribed -- a raced tab-surface sync leaves the
    // selection reset. Rehydrate so the run presentation returns and the
    // terminal answer is not dropped.
    if (handled === false
        && message
        && message.type === 'FSB_DELEGATION_UPDATED'
        && message.view
        && typeof message.view.delegationId === 'string'
        && _delegationUiState.subscribed !== true
        && !_delegationRuntimeRecoveryPending
        && _delegationForConversation(conversationId) === message.view.delegationId) {
      _delegationRuntimeRecoveryPending = true;
      Promise.resolve().then(function() {
        return _hydrateDelegationForSelectedConversation();
      }).catch(function() { /* best-effort */ }).then(function() {
        _delegationRuntimeRecoveryPending = false;
      });
    }
  });
} catch (_error) { /* delegated updates are best-effort until panel boot */ }

let automationTimerInterval = null;
let automationTimerStartedAt = null;
let automationPixelRafId = null;
let automationPixelAnimations = null;

// The loader's letter fade lives in CSS (@keyframes fsb-letter-cycle, one 2.7s
// iteration per letter, staggered by AUTOMATION_PIXEL_LETTER_SLOT_MS). The pixel
// fill below does NOT re-time that from scratch -- it reads the CSS animation's
// own progress each frame and derives which pixels should be lit. Scheduling the
// fill on a second clock (setTimeout) is what used to make the loader glitch:
// the two drifted apart, and every mid-run showAutomationRunner() call reset the
// JS phase while CSS kept its own, so letters rendered blank or half-formed.
const AUTOMATION_PIXEL_REVEAL_DIRECTIONS = ['bottom-up', 'left-right', 'top-bottom', 'right-left'];
const AUTOMATION_PIXEL_CYCLE_MS = 2700;
const AUTOMATION_PIXEL_LETTER_SLOT_MS = 900;
const AUTOMATION_PIXEL_VISIBLE_OFFSET_MS = 320;
const AUTOMATION_PIXEL_STEP_MS = 28;
const AUTOMATION_PIXEL_LETTER_ANIMATION = 'fsb-letter-cycle';

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

// How many pixels of a letter are lit at `progress`, the 0..1 iteration progress
// of that letter's own CSS animation. `progress` is null while the animation is
// still inside its animation-delay (the letter is invisible then, so nothing is
// lit) and wraps back to 0 at each iteration boundary, which is what clears the
// previous cycle's pixels -- no cross-letter wipe is needed. Pure so the node
// suite can exercise it without a browser.
function automationPixelLitCount(progress, pixelCount) {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return 0;
  var start = AUTOMATION_PIXEL_VISIBLE_OFFSET_MS / AUTOMATION_PIXEL_CYCLE_MS;
  var step = AUTOMATION_PIXEL_STEP_MS / AUTOMATION_PIXEL_CYCLE_MS;
  var count = Math.floor((progress - start) / step) + 1;
  if (count < 0) return 0;
  return count > pixelCount ? pixelCount : count;
}

// The reveal direction rotates every cycle. The previous scheduler advanced a
// shared index by letters.length per cycle, so letter i of cycle n used
// (letterCount * n + i) % 4; deriving it from the CSS iteration counter keeps
// that sequence identical while removing the mutable index.
function automationPixelDirectionIndex(iteration, letterIndex, letterCount) {
  var total = AUTOMATION_PIXEL_REVEAL_DIRECTIONS.length;
  if (!Number.isSafeInteger(iteration) || iteration < 0) return letterIndex % total;
  return ((letterCount * iteration) + letterIndex) % total;
}

function automationPixelReducedMotion() {
  try {
    return typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches === true;
  } catch (_error) {
    return false;
  }
}

// Reduced motion switches the CSS letter cycle off, so there is no animation to
// read and no reveal to run -- show one fully-lit letter instead of a blank box.
function renderStaticAutomationPixelLetter() {
  var letters = getAutomationPixelLetters();
  if (!letters.length) return;
  getAutomationPixelOrder(letters[0], 'top-bottom').forEach(function (pixel) {
    pixel.classList.add('pixel-lit');
  });
}

// Animations are recreated whenever the runner leaves display:none, so a cached
// handle can go stale; re-resolve when it is missing or has been discarded.
function getAutomationPixelAnimation(letter, letterIndex) {
  if (!automationPixelAnimations) automationPixelAnimations = [];
  var cached = automationPixelAnimations[letterIndex];
  if (cached && cached.playState !== 'idle') return cached;
  if (!letter || typeof letter.getAnimations !== 'function') return null;
  var found = letter.getAnimations().filter(function (animation) {
    return animation && animation.animationName === AUTOMATION_PIXEL_LETTER_ANIMATION;
  })[0] || null;
  automationPixelAnimations[letterIndex] = found;
  return found;
}

function paintAutomationPixelFrame() {
  var letters = getAutomationPixelLetters();
  letters.forEach(function (letter, letterIndex) {
    var animation = getAutomationPixelAnimation(letter, letterIndex);
    var timing = (animation && animation.effect && typeof animation.effect.getComputedTiming === 'function')
      ? animation.effect.getComputedTiming()
      : null;
    var direction = AUTOMATION_PIXEL_REVEAL_DIRECTIONS[
      automationPixelDirectionIndex(timing ? timing.currentIteration : null, letterIndex, letters.length)
    ];
    var order = getAutomationPixelOrder(letter, direction);
    var lit = automationPixelLitCount(timing ? timing.progress : null, order.length);
    order.forEach(function (pixel, pixelIndex) {
      pixel.classList.toggle('pixel-lit', pixelIndex < lit);
    });
  });
}

function startAutomationPixelReveal() {
  // Idempotent: showAutomationRunner() is called again on every delegation
  // snapshot and on every tab-surface resync, and restarting the reveal there is
  // what desynced it from the CSS letter fade.
  if (automationPixelRafId !== null) return;
  automationPixelAnimations = null;
  clearAutomationPixelClasses();
  if (automationPixelReducedMotion()) {
    renderStaticAutomationPixelLetter();
    return;
  }
  if (typeof requestAnimationFrame !== 'function') return;

  function frame() {
    paintAutomationPixelFrame();
    automationPixelRafId = requestAnimationFrame(frame);
  }
  automationPixelRafId = requestAnimationFrame(frame);
}

function stopAutomationPixelReveal() {
  if (automationPixelRafId !== null) {
    cancelAnimationFrame(automationPixelRafId);
    automationPixelRafId = null;
  }
  automationPixelAnimations = null;
  clearAutomationPixelClasses();
}

// Toggling the OS setting mid-run swaps which of the two paths above is correct:
// turning reduction ON removes the CSS animation the running loop reads from,
// which would otherwise leave the loader an empty box for the rest of the task.
try {
  var automationPixelMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  if (automationPixelMotionQuery && typeof automationPixelMotionQuery.addEventListener === 'function') {
    automationPixelMotionQuery.addEventListener('change', function () {
      if (!automationRunner || automationRunner.classList.contains('hidden')) return;
      stopAutomationPixelReveal();
      startAutomationPixelReveal();
    });
  }
} catch (_error) { /* reduced-motion changes are best-effort */ }

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

// A healthy delegated agent-CLI run is presented through the ordinary autopilot
// surface. The delegation card remains visible for failures whose terminal code
// and recovery action would otherwise be lost from the compact status treatment.
var _delegatedRunPresentation = {
  delegationId: null,
  statusText: null,
  watermark: 0,
  terminalApplied: null
};

var DELEGATED_SKIP_STATUS_TEXTS = [
  'Starting automation...', 'Connecting to page...', 'Connected. Analyzing page...', 'Analyzing page...'
];

function _delegatedRunResetPresentation(delegationId, entryCount) {
  _delegatedRunPresentation.delegationId = delegationId || null;
  _delegatedRunPresentation.statusText = null;
  _delegatedRunPresentation.watermark = Number.isSafeInteger(entryCount) ? entryCount : 0;
  _delegatedRunPresentation.terminalApplied = null;
}

function _delegatedRunSetStatus(text) {
  _delegatedRunPresentation.statusText = text;
  updateStatusMessage(text);
}

function _delegatedRunBeginPresentation(snapshot, task) {
  if (!snapshot) return false;
  _delegatedRunResetPresentation(snapshot.delegationId, 0);
  _delegatedRunPresentation.statusText = 'Starting automation...';
  showAutomationRunner(Date.now(), 'Starting automation...');
  addStatusMessage('Starting automation...');
  _setHeaderStatus('Working', 'running');
  return true;
}

function _delegatedRunTeardown() {
  hideAutomationRunner();
  _delegatedRunResetPresentation(null, 0);
}

function _renderAutomationRetryPrompt(taskText, onRetry) {
  if (!taskText) return null;
  const retryDiv = document.createElement('div');
  retryDiv.className = 'message system new';
  retryDiv.textContent = 'Would you like to try again? ';
  const retryBtn = document.createElement('button');
  retryBtn.className = 'retry-btn';
  retryBtn.textContent = 'Retry';
  retryBtn.addEventListener('click', async () => {
    // WR-03: without this gate the click silently drops the user's intent,
    // because handleSendMessage's runtime gate fail-closes without surfacing why.
    if (await _isActiveTabForeignOwned()) {
      console.warn('[sidepanel] retry blocked -- active tab is foreign-owned');
      return;
    }
    retryDiv.remove();
    await onRetry();
  });
  retryDiv.appendChild(retryBtn);
  chatMessages.appendChild(retryDiv);
  scrollToBottom();
  return retryDiv;
}

function _delegatedRunErrorMessage(snapshot) {
  var label = (snapshot && snapshot.provider && snapshot.provider.label) || 'The agent';
  var code = snapshot && snapshot.terminal ? snapshot.terminal.code : null;
  if (code === 'provider_error') {
    return label + ' reported an error before completing this task. Raw provider output was not retained.';
  }
  if (code === 'daemon_restart_lost_run') {
    return 'The previous agent process was stopped and was not reattached. Start a new task when the local service is ready.';
  }
  if (code === 'resume_ownership_lost' || code === 'hold_expired') {
    return 'FSB could not return this tab to ' + label + ', so the run ended and the tab remains under your control.';
  }
  if (code === 'wall_clock_timeout') return label + ' ran past the time limit for this task.';
  if (code === 'event_silence_timeout') return label + ' stopped sending updates, so FSB ended the run.';
  // Setup failures carry their recovery in the text, because a plain retry cannot fix them.
  if (code === 'agent_unpaired' || code === 'native_host_missing') {
    return 'FSB\u2019s local helper is not installed. Run: npx -y fsb-mcp-server@latest install --native-host';
  }
  if (code === 'agent_offline') {
    return label + ' is not reachable. Start the local FSB service, then try this message again.';
  }
  if (code === 'unsupported_provider') {
    return label + ' cannot run browser tasks. Choose a supported agent provider in Settings.';
  }
  return label + ' stopped before the task was complete.';
}

function _delegatedRunEmitEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (Number.isSafeInteger(entry.sequence)) {
    if (entry.sequence <= _delegatedRunPresentation.watermark) return false;
    _delegatedRunPresentation.watermark = entry.sequence;
  }
  if (entry.kind === 'init') {
    _delegatedRunSetStatus('Connected. Analyzing page...');
    return true;
  }
  if (entry.kind === 'tool-call') {
    // tool_use and tool_result both project to 'tool-call'; mirroring both would
    // double every row, so only the opening and failing transitions are shown.
    var status = entry.tool && entry.tool.status;
    if (status !== 'running' && status !== 'failed') return false;
    var previous = _delegatedRunPresentation.statusText;
    if (previous && DELEGATED_SKIP_STATUS_TEXTS.indexOf(previous) === -1) addActionMessage(previous);
    _delegatedRunSetStatus(entry.title || 'Working...');
    return true;
  }
  if (entry.kind === 'retry') {
    var prior = _delegatedRunPresentation.statusText;
    if (prior && DELEGATED_SKIP_STATUS_TEXTS.indexOf(prior) === -1) addActionMessage(prior);
    _delegatedRunSetStatus('Retrying...');
    return true;
  }
  return false;
}

function _delegatedRunApplyTerminal(snapshot) {
  if (!snapshot || !snapshot.terminal) return false;
  if (_delegatedRunPresentation.terminalApplied === snapshot.delegationId) return false;
  _delegatedRunPresentation.terminalApplied = snapshot.delegationId;
  var code = snapshot.terminal.code;
  if (code === 'completed') {
    // The answer bubble is emitted separately from the terminal payload; only
    // retire the status line here when it did not already carry the answer.
    if (currentStatusMessage) completeStatusMessage('Task complete', 'system');
    setIdleState(_activeTabIdSnapshot);
    return true;
  }
  if (code === 'stopped' || code === 'cancelled') {
    if (currentStatusMessage) completeStatusMessage('Automation stopped', 'system');
    setIdleState(_activeTabIdSnapshot);
    return true;
  }
  setErrorState(_activeTabIdSnapshot);
  completeStatusMessage('Error: ' + _delegatedRunErrorMessage(snapshot), 'error');
  if (typeof _renderAutomationRetryPrompt === 'function') {
    _renderAutomationRetryPrompt(_delegationUiState.task, async function() {
      await _prepareDelegationTask(true);
      if (chatInput && chatInput.textContent.trim()) handleSendMessage();
    });
  }
  return true;
}

function _delegationSnapshotNeedsDiagnosticCard(snapshot) {
  return snapshot && (
    snapshot.state === 'failed'
    || snapshot.state === 'restart_lost'
    || snapshot.connection === 'offline'
    || snapshot.connection === 'disconnected'
  );
}

function _delegatedRunReconcile(snapshot, options) {
  if (!snapshot) return false;
  if (snapshot.delegationId !== _delegatedRunPresentation.delegationId) {
    // Catching up on an existing run (hydration, resync, tab swap-back): adopt its
    // position silently rather than replaying every row that already happened.
    _delegatedRunResetPresentation(
      snapshot.delegationId,
      Array.isArray(snapshot.entries) ? snapshot.entries.length : 0
    );
  }
  var active = _delegationIsActiveSnapshot(snapshot);
  if (active && !currentStatusMessage) {
    addStatusMessage(_delegatedRunPresentation.statusText || 'Working...');
    _delegatedRunPresentation.watermark = Array.isArray(snapshot.entries)
      ? snapshot.entries.length
      : _delegatedRunPresentation.watermark;
  }
  if (active) {
    var startedAt = _delegationPersistedStartAt(snapshot);
    showAutomationRunner(
      Number.isSafeInteger(startedAt) ? startedAt : Date.now(),
      _delegatedRunPresentation.statusText || 'Working'
    );
  }
  var mount = _ensureDelegationMount();
  // The mount also hosts the consent gate, preflight failure, native-wake and
  // cleanup cards, so it is only hidden when it carries none of them.
  var carriesActionableCard = _delegationUiState.bindingCleanupPending === true
    || _delegationUiState.errorCode !== null
    || _delegationSnapshotNeedsDiagnosticCard(snapshot);
  if (mount.feed) mount.feed.classList.add('hidden');
  if (mount.run) {
    if (carriesActionableCard) mount.run.classList.remove('hidden');
    else mount.run.classList.add('hidden');
  }
  if (snapshot.terminal) _delegatedRunApplyTerminal(snapshot);
  return true;
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
      // edge case while honoring D-11 (the header status is the visible explanation).
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
  // Ownership remains an internal concurrency gate. Registry changes refresh
  // the active tab's lock state, but decorative client-label and visual-session
  // changes do not re-render the side panel.
  if (area === 'session' && changes && changes.fsbAgentRegistry) {
    syncActiveTabSurface(_activeTabIdSnapshot);
    if (typeof _refreshSelectedDelegationSnapshot === 'function') {
      _refreshSelectedDelegationSnapshot();
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
// D-11: visual treatment is dimmed/disabled CSS + aria-disabled='true'; the
// provider-neutral aria-describedby text explains the temporary lock.
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
        // Clear the generic automation lock tooltip after ownership releases.
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
// the same contract refreshActiveTabOwnership uses. Fail-open on any error: storage
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

// Refresh the active tab's internal ownership lock. Ownership remains an
// execution-safety concern in the side panel, but it is not rendered as a
// provider or client badge. The panel persists across tab switches, so each
// activation revalidates the lock against the registry envelope.
async function refreshActiveTabOwnership(tabId, surfaceGeneration) {
  const refreshGeneration = ++_ownerStatusRefreshGeneration;
  const isCurrent = function() {
    if (refreshGeneration !== _ownerStatusRefreshGeneration) return false;
    if (Number.isSafeInteger(surfaceGeneration)
        && typeof _activeTabSurfaceSyncGeneration !== 'undefined'
        && surfaceGeneration !== _activeTabSurfaceSyncGeneration) return false;
    return true;
  };
  try {
    if (typeof FSBOwnerChip === 'undefined') {
      console.warn('[sidepanel] ownership helper unavailable');
      return { verified: false, code: 'owner_helper_unavailable' };
    }

    let tab = null;
    if (Number.isSafeInteger(tabId)) {
      tab = await chrome.tabs.get(tabId);
      if (!tab || tab.id !== tabId) {
        return { verified: false, code: 'tab_lookup_mismatch' };
      }
    } else {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = tabs && tabs[0];
    }
    if (!isCurrent()) return { verified: false, stale: true };
    if (!tab || typeof tab.id !== 'number') {
      _chatLockedByOwnerChip = false;
      applyInputLockout(false);
      return { verified: true, tabId: null, ownerAgentId: null, foreignOwned: false };
    }

    const stored = await chrome.storage.session.get('fsbAgentRegistry');
    if (!isCurrent()) return { verified: false, stale: true };
    const envelope = stored && stored.fsbAgentRegistry;
    const ownerAgentId = FSBOwnerChip.findOwnerInEnvelope(envelope, tab.id);

    if (!FSBOwnerChip.shouldShowOwnerChip(ownerAgentId, MY_SURFACE)) {
      // Unlock controls when ownership is absent or belongs to this surface.
      _chatLockedByOwnerChip = false;
      applyInputLockout(false);
      return {
        verified: true,
        tabId: tab.id,
        windowId: Number.isSafeInteger(tab.windowId) ? tab.windowId : null,
        ownerAgentId: ownerAgentId || null,
        foreignOwned: false
      };
    }

    // Foreign ownership still locks the composer and prevents concurrent sends,
    // while the visible automation presentation stays provider-neutral.
    _chatLockedByOwnerChip = true;
    applyInputLockout(true);
    chatInput.title = 'Disabled while automation is working on this tab';
    updateSendButtonState();
    return {
      verified: true,
      tabId: tab.id,
      windowId: Number.isSafeInteger(tab.windowId) ? tab.windowId : null,
      ownerAgentId: ownerAgentId,
      foreignOwned: true
    };
  } catch (error) {
    console.warn('[sidepanel] ownership refresh failed', error && error.message ? error.message : error);
    return { verified: false, code: 'owner_refresh_failed' };
  }
}

async function syncActiveTabSurface(tabId, windowId) {
  const syncGeneration = ++_activeTabSurfaceSyncGeneration;
  // Invalidate delegation hydration as soon as a tab transition begins. The
  // replacement hydration later in this function will mint its own generation.
  _delegationHydrationGeneration += 1;
  let incomingTabId = Number.isSafeInteger(tabId) && tabId > 0 ? tabId : null;
  try {
    if (incomingTabId === null) {
      const query = Number.isSafeInteger(windowId)
        ? { active: true, windowId: windowId }
        : { active: true, currentWindow: true };
      const tabs = await chrome.tabs.query(query);
      if (syncGeneration !== _activeTabSurfaceSyncGeneration) return false;
      incomingTabId = tabs && tabs[0] && Number.isSafeInteger(tabs[0].id) && tabs[0].id > 0
        ? tabs[0].id
        : null;
    }

    const outgoingTabId = _activeTabIdSnapshot;
    if (incomingTabId === null) {
      if (syncGeneration !== _activeTabSurfaceSyncGeneration) return false;
      _chatLockedByOwnerChip = false;
      applyInputLockout(false);
      _activeTabIdSnapshot = null;
      conversationId = null;
      if (chatMessages) chatMessages.innerHTML = '';
      return true;
    }

    const tabChanged = outgoingTabId !== incomingTabId;
    if (tabChanged) {
      try { _persistTabStatusIntent(outgoingTabId); } catch (_e) { /* best-effort */ }
    }

    // This generation is the sole active-tab authority. Commit before any
    // later await so Skopeo and the tab-scoped UI agree on the selected tab.
    if (syncGeneration !== _activeTabSurfaceSyncGeneration) return false;
    _activeTabIdSnapshot = incomingTabId;
    if (tabChanged) {
      try {
        const activation = globalThis.FSBSkopeoSidepanelController
          && globalThis.FSBSkopeoSidepanelController.activateTab(incomingTabId);
        if (activation && typeof activation.catch === 'function') {
          activation.catch(function () {});
        }
      } catch (_e) {
        // Skopeo is optional; the winning tab remains authoritative.
      }
    }

    const ownerState = await refreshActiveTabOwnership(incomingTabId, syncGeneration);
    if (syncGeneration !== _activeTabSurfaceSyncGeneration) return false;
    if (!ownerState || ownerState.verified !== true || ownerState.tabId !== incomingTabId) return false;

    if (typeof _adoptTabIntoRunningDelegationConversation === 'function') {
      await _adoptTabIntoRunningDelegationConversation(incomingTabId);
      if (syncGeneration !== _activeTabSurfaceSyncGeneration) return false;
    }
    const conversationSynced = await swapToTabConversation(incomingTabId);
    if (syncGeneration !== _activeTabSurfaceSyncGeneration) return false;
    if (conversationSynced !== true) {
      console.warn('[sidepanel] active-tab conversation sync failed', incomingTabId);
      conversationId = null;
      if (chatMessages) chatMessages.innerHTML = '';
    }

    // Resolve the target tab's live automation status inside the same guarded
    // synchronization. A late response for a previous tab is discarded by
    // the generation check below, so it cannot restore a stale running state.
    try {
      if (chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
        const liveStatus = await chrome.runtime.sendMessage({
          action: 'getStatus',
          activeTabId: incomingTabId
        });
        if (syncGeneration !== _activeTabSurfaceSyncGeneration) return false;
        if (liveStatus && typeof liveStatus.activeSessions === 'number') {
          const liveEntry = _getTabRunningEntry(incomingTabId);
          liveEntry.isRunning = liveStatus.activeSessions > 0;
          liveEntry.sessionId = liveEntry.isRunning && typeof liveStatus.currentSessionId === 'string'
            ? liveStatus.currentSessionId
            : null;
          if (liveEntry.isRunning && !Number.isFinite(liveEntry.startedAt)) {
            liveEntry.startedAt = Number.isFinite(liveStatus.currentStartTime)
              ? liveStatus.currentStartTime
              : Date.now();
          }
          if (!liveEntry.isRunning) liveEntry.startedAt = null;
        }
      }
    } catch (error) {
      console.warn('[sidepanel] active-tab running-state sync failed', error && error.message ? error.message : error);
    }
    if (syncGeneration !== _activeTabSurfaceSyncGeneration) return false;

    try {
      var snap = _getTabRunningEntry(incomingTabId);
      if (snap.isRunning) setRunningState(incomingTabId, snap.sessionId || null);
      else setIdleState(incomingTabId);
    } catch (_e) { /* best-effort */ }
    try { _restoreTabStatusIntent(incomingTabId); } catch (_e) { /* best-effort */ }
    try { await _hydrateDelegationForSelectedConversation(); } catch (_e) { /* best-effort */ }
    if (syncGeneration !== _activeTabSurfaceSyncGeneration) return false;
    return syncGeneration === _activeTabSurfaceSyncGeneration;
  } catch (error) {
    console.warn('[sidepanel] active-tab sync failed', error && error.message ? error.message : error);
    return false;
  }
}

// Phase 243 plan 03 (UI-02): refresh on tab switch. The sidepanel is
// persistent, so the active tab can change while the surface is open --
// without this listener the status would show stale ownership data (Threat
// T-243-03-02). Best-effort registration; if chrome.tabs.onActivated is
// unavailable for any reason the status simply does not auto-refresh.
try {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onActivated
      && typeof chrome.tabs.onActivated.addListener === 'function') {
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      if (!activeInfo || !Number.isSafeInteger(activeInfo.tabId)) return;
      await syncActiveTabSurface(activeInfo.tabId, activeInfo.windowId);
    });
  }
} catch (_e) {
  // swallow: ownership auto-refresh is non-critical
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
// ownership status + chat surface re-resolve against the user's real active tab
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
        await syncActiveTabSurface(null, windowId);
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
  await _loadDelegationAnsweredIds();

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
  
  // Set UI mode preference
  await chrome.storage.local.set({ uiMode: 'sidepanel' });

  // Render the read-only ownership status on load. The
  // chrome.tabs.onActivated subscription registered above keeps the status in
  // sync as the user switches tabs in the persistent sidepanel.
  await syncActiveTabSurface();

  // History list event delegation for delete buttons
  const historyListEl = document.getElementById('historyList');
  if (historyListEl) {
    historyListEl.addEventListener('click', async (e) => {
      const replayBtn = e.target.closest('.history-replay-btn');
      if (replayBtn) {
        e.stopPropagation();
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

  // The unified active-tab synchronization above owns conversation and
  // delegation hydration. Add the boot greeting only when that synchronized
  // surface has no persisted messages.
  var hasHydratedChatMessage = chatMessages
    && typeof chatMessages.querySelector === 'function'
    && chatMessages.querySelector('.message');
  if (!hasHydratedChatMessage) {
    addMessage('Welcome to FSB. How can I help?', 'system');
  }

  // MCP replay requests survive side-panel closure in storage.session. Hydrate
  // them after the conversation surface exists so approval never depends on
  // the panel having been open when the tool was called.
  try {
    const pendingReplays = await sendReplayRuntimeMessage({ action: 'getPendingMcpReplayApprovals' });
    if (pendingReplays?.success) {
      (pendingReplays.approvals || []).forEach(renderMcpReplayApproval);
    }
  } catch (_error) { /* a later runtime broadcast can still surface approval */ }

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
// Compose the foreign-owner chat lock into the existing
// gating chain via OR -- hasContent governs the empty-input case, isRunning
// governs in-flight automation, _chatLockedByOwnerChip is the external-agent
// ownership gate. NO normal lifecycle transition leaves the input enabled
// while foreign ownership is active; refreshActiveTabOwnership is the sole
// writer of the flag.
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
  _renderDelegationPreparing('preflight');
  updateSendButtonState();

  // Phase 11 FINT-20 -- defense-in-depth runtime gate. The sendBtn
  // disabled attribute (set by applyInputLockout via refreshActiveTabOwnership) is
  // the primary defense; this gate guards against a stale UI state where
  // the button was cleared by a sibling refresh racing with tab
  // activation. Fail-open: storage errors do NOT block sends.
  if (await _isActiveTabForeignOwned()) {
    _clearDelegationPreflightIntent(intentId);
    _clearDelegationPreparing();
    updateSendButtonState();
    return;
  }
  if (!_delegationPreflightIntentIsCurrent(intentId)) {
    _clearDelegationPreflightIntent(intentId);
    _clearDelegationPreparing();
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
    _clearDelegationPreparing();
    updateSendButtonState();
    return;
  }

  if (_delegationValidPreflightResponse(preflight)
      && preflight.ok === true
      && preflight.kind === 'api') {
    _clearDelegationPreflightIntent(intentId);
    _clearDelegationPreparing();
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
    _clearDelegationPreparing();
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
    _clearDelegationPreparing();
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
    _setHeaderStatus('Working', 'running');
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
    _setHeaderStatus('Ready', '');
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
    _setHeaderStatus('Error', 'error');
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

    case 'replayDecisionRequired': {
      if (request.sessionId !== currentSessionId) return;
      renderReplayDecisionPrompt(request);
      break;
    }

    case 'mcpReplayApprovalRequested':
      renderMcpReplayApproval(request.approval);
      break;

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
          _renderAutomationRetryPrompt(request.task, async () => {
            chatInput.textContent = request.task;
            handleSendMessage();
          });
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
document.addEventListener('visibilitychange', async () => {
  if (!document.hidden) {
    await syncActiveTabSurface();
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
      var idleClosed = session.status === 'expired' ||
        (session.status === 'stopped' && session.outcomeDetails?.reason === 'idle_timeout');
      var statusLabel = idleClosed ? 'Idle-closed' : (session.status || 'unknown');
      var statusClass = idleClosed ? 'idle-closed' : (session.status || '');
      var hasReplayDetails = (session.actionCount > 0) || !!session.replayIntegrity;
      return '<div class="history-item" data-session-id="' + escapeHtml(session.id) + '">' +
        '<div class="history-item-info">' +
          '<div class="history-item-task">' + escapeHtml(session.task || 'Unknown task') + '</div>' +
          '<div class="history-item-meta">' +
            '<span>' + formatSessionDate(session.startTime) + '</span>' +
            '<span>' + (session.actionCount || 0) + ' actions</span>' +
            costDisplay +
            (session.mode === 'mcp-agent'
              ? '<span class="history-source-badge mcp">MCP · ' + escapeHtml(session.mcpClient || 'Agent') + '</span>'
              : '<span class="history-source-badge">Autopilot</span>') +
            '<span class="history-status ' + escapeHtml(statusClass) + '">' + escapeHtml(statusLabel) + '</span>' +
          '</div>' +
        '</div>' +
        (hasReplayDetails ?
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

function sendReplayRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

function renderReplayDecisionPrompt(request) {
  if (!request?.sessionId) return null;
  const existing = chatMessages.querySelector(
    '.replay-decision-card[data-replay-session-id="' + CSS.escape(request.sessionId) + '"]'
  );
  if (existing) return existing;
  updateStatusMessage('Replay paused before a potentially duplicated write.');
  const prompt = document.createElement('div');
  prompt.className = 'message system new replay-decision-card';
  prompt.dataset.replaySessionId = request.sessionId;
  const text = document.createElement('div');
  text.className = 'replay-decision-text';
  text.textContent = `Step ${request.stepNumber}: ${request.tool}. ${request.error}`;
  prompt.appendChild(text);
  const actions = document.createElement('div');
  actions.className = 'replay-decision-actions';
  ['retry', 'skip', 'stop'].forEach((decision) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'replay-decision-btn ' + decision;
    button.textContent = decision.charAt(0).toUpperCase() + decision.slice(1);
    button.addEventListener('click', async () => {
      Array.from(actions.querySelectorAll('button')).forEach((item) => { item.disabled = true; });
      try {
        const response = await sendReplayRuntimeMessage({
          action: 'replayStepDecision',
          sessionId: request.sessionId,
          decision
        });
        if (!response?.success) throw new Error(response?.error || 'Replay decision failed');
        prompt.remove();
        if (decision !== 'stop') {
          updateStatusMessage(decision === 'retry' ? 'Retrying replay step...' : 'Skipping replay step...');
        }
      } catch (error) {
        Array.from(actions.querySelectorAll('button')).forEach((item) => { item.disabled = false; });
        addMessage('Could not apply replay decision: ' + error.message, 'error');
      }
    });
    actions.appendChild(button);
  });
  prompt.appendChild(actions);
  chatMessages.appendChild(prompt);
  scrollToBottom();
  return prompt;
}

function replayRiskLabel(step) {
  if (step.replay?.availability === 'needs-input') return 'Blocked · redacted input';
  if (step.replay?.availability === 'unsupported') return 'Inspect only';
  if (step.replay?.availability === 'approval-per-step') return 'Per-step approval';
  if (step.replay?.availability === 'approval-once') return 'Confirmation required';
  return step.replay?.risk === 'navigation' ? 'Navigation' : 'Read only';
}

function renderReplayPreview(preview) {
  const card = document.createElement('div');
  card.className = 'message system new replay-preview-card';

  const heading = document.createElement('div');
  heading.className = 'replay-preview-heading';
  heading.textContent = 'Verified replay preview';
  card.appendChild(heading);

  const meta = document.createElement('div');
  meta.className = 'replay-preview-meta';
  const provenance = preview.provenance === 'legacy-import' ? 'Imported legacy' : 'Capture attested';
  const range = preview.truncated
    ? 'latest ' + preview.steps.length + ' of ' + preview.totalSourceSteps
    : preview.counts.total + ' recorded';
  meta.textContent = provenance + ' · ' + range + ' · ' +
    preview.counts.executable + ' executable · ' + preview.counts.blocked + ' inspect only';
  card.appendChild(meta);

  const origin = document.createElement('div');
  origin.className = 'replay-preview-origin';
  try { origin.textContent = 'Fresh tab: ' + new URL(preview.startUrl).origin; }
  catch (_error) { origin.textContent = 'Fresh recorded-site tab'; }
  card.appendChild(origin);

  const timeline = document.createElement('div');
  timeline.className = 'replay-preview-timeline';
  preview.steps.forEach((step, index) => {
    const row = document.createElement('div');
    row.className = 'replay-preview-step ' + (step.replay?.availability || 'unsupported');
    const title = document.createElement('span');
    title.className = 'replay-preview-step-title';
    title.textContent = (index + 1) + '. ' + (step.capability?.slug || step.tool || 'Unknown call');
    const risk = document.createElement('span');
    risk.className = 'replay-preview-step-risk';
    risk.textContent = replayRiskLabel(step);
    row.appendChild(title);
    row.appendChild(risk);
    if (step.replay?.reason) {
      const reason = document.createElement('div');
      reason.className = 'replay-preview-step-reason';
      reason.textContent = step.replay.reason;
      row.appendChild(reason);
    }
    timeline.appendChild(row);
  });
  card.appendChild(timeline);
  chatMessages.appendChild(card);
  scrollToBottom();
  return card;
}

function renderMcpReplayApproval(approval) {
  if (!approval?.requestId || !approval.preview) return null;
  const selector = '.mcp-replay-approval-card[data-request-id="' + CSS.escape(approval.requestId) + '"]';
  if (chatMessages.querySelector(selector)) return null;
  if (isHistoryViewActive) showChatView();

  const previewCard = renderReplayPreview(approval.preview);
  previewCard.dataset.mcpReplayRequestId = approval.requestId;

  const card = document.createElement('div');
  card.className = 'message system new mcp-replay-approval-card';
  card.dataset.requestId = approval.requestId;

  const copy = document.createElement('div');
  copy.className = 'replay-decision-text';
  const tabCount = Math.max(1, approval.preview.tabs?.length || 0);
  const highImpact = (approval.preview.steps || [])
    .filter((step) => step.replay?.availability === 'approval-per-step').length;
  copy.textContent = `An MCP client requested this replay in ${tabCount} fresh tab${tabCount === 1 ? '' : 's'}. ` +
    `One approval covers only the exact verified manifest${highImpact ? `, including ${highImpact} high-impact step${highImpact === 1 ? '' : 's'}` : ''}.`;
  card.appendChild(copy);

  const actions = document.createElement('div');
  actions.className = 'replay-decision-actions';
  const approve = document.createElement('button');
  approve.type = 'button';
  approve.className = 'replay-decision-btn retry';
  approve.textContent = 'Approve replay';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'replay-decision-btn stop';
  cancel.textContent = 'Cancel';
  actions.appendChild(approve);
  actions.appendChild(cancel);
  card.appendChild(actions);

  const setDisabled = (disabled) => {
    approve.disabled = disabled;
    cancel.disabled = disabled;
  };
  approve.addEventListener('click', async () => {
    if (isRunning) {
      addMessage('Cannot replay while another automation is running. Stop the current task first.', 'system');
      return;
    }
    setDisabled(true);
    try {
      addStatusMessage('Opening recorded replay tabs...');
      const response = await sendReplayRuntimeMessage({
        action: 'approveMcpReplay',
        requestId: approval.requestId,
        manifestHash: approval.manifestHash
      });
      if (!response?.success) throw new Error(response?.error || 'Failed to start replay');
      card.remove();
      currentSessionId = response.sessionId;
      setRunningState(response.tabId, response.sessionId);
      updateStatusMessage('Replaying...');
    } catch (error) {
      setDisabled(false);
      completeStatusMessage('Replay error', 'error');
      addMessage('Failed to start requested replay: ' + error.message, 'error');
    }
  });
  cancel.addEventListener('click', async () => {
    setDisabled(true);
    try {
      const response = await sendReplayRuntimeMessage({
        action: 'cancelMcpReplay',
        requestId: approval.requestId
      });
      if (!response?.success) throw new Error(response?.error || 'Replay cancellation failed');
      card.remove();
      previewCard.remove();
      addMessage('Replay request cancelled. No target tabs were opened.', 'system');
    } catch (error) {
      setDisabled(false);
      addMessage('Could not cancel replay request: ' + error.message, 'error');
    }
  });

  chatMessages.appendChild(card);
  scrollToBottom();
  return card;
}

async function startReplay(sessionId) {
  try {
    const preview = await sendReplayRuntimeMessage({
      action: 'prepareSessionReplay',
      sessionId
    });
    if (!preview?.success) throw new Error(preview?.error || 'Replay verification failed');

    if (preview.pendingDecision) {
      if (isHistoryViewActive) showChatView();
      currentSessionId = preview.pendingDecision.sessionId;
      setRunningState(preview.pendingDecision.tabId, preview.pendingDecision.sessionId);
      renderReplayDecisionPrompt(preview.pendingDecision);
      return;
    }
    if (isRunning) {
      addMessage('Cannot replay while another automation is running. Stop the current task first.', 'system');
      return;
    }

    if (isHistoryViewActive) showChatView();
    renderReplayPreview(preview);

    if (preview.truncated) {
      addMessage(
        `This recording is inspect-only because only the latest ${preview.steps.length} of ` +
          `${preview.totalSourceSteps} recorded calls are available. Earlier browser state cannot be reconstructed safely.`,
        'system'
      );
      return;
    }

    if (preview.counts.executable === 0) {
      addMessage('This recording is verified for inspection, but it has no executable steps.', 'system');
      return;
    }

    const approvedScopes = [];
    const onceSteps = preview.steps.filter((step) => step.replay?.availability === 'approval-once');
    const perStep = preview.steps.filter((step) => step.replay?.availability === 'approval-per-step');
    const tabCount = Math.max(1, preview.tabs?.length || 0);
    const approvals = [];
    if (onceSteps.length > 0) approvals.push(`${onceSteps.length} write step${onceSteps.length === 1 ? '' : 's'}`);
    if (perStep.length > 0) approvals.push(`${perStep.length} high-impact step${perStep.length === 1 ? '' : 's'}`);
    const summary = `Replay this verified timeline in ${tabCount} fresh tab${tabCount === 1 ? '' : 's'}?` +
      (approvals.length > 0
        ? ` This one approval covers the exact signed manifest: ${approvals.join(' and ')}.`
        : ' The timeline contains only read and navigation steps.');
    if (!confirm(summary)) {
      addMessage('Replay cancelled. The original recording was not changed.', 'system');
      return;
    }
    if (onceSteps.length > 0) approvedScopes.push('write');
    perStep.forEach((step) => approvedScopes.push('step:' + step.id));

    addStatusMessage('Opening a fresh replay tab...');
    const response = await sendReplayRuntimeMessage({
      action: 'replaySession',
      sessionId,
      manifestHash: preview.manifestHash,
      approvedScopes
    });

    if (response && response.success) {
      currentSessionId = response.sessionId;
      setRunningState(response.tabId, response.sessionId);
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
    const response = await chrome.runtime.sendMessage({
      action: 'deleteSessionHistory',
      sessionId: sessionId
    });
    if (!response?.success) throw new Error(response?.error || 'Failed to delete session history');
    loadHistoryList();
  } catch (error) {
    console.error('Failed to delete session:', error);
  }
}

async function loadSessionView(sessionId) {
  try {
    const detailResponse = await chrome.runtime.sendMessage({
      action: 'getSessionDetail',
      sessionId,
      afterSequence: -1,
      limit: 500
    });
    const session = detailResponse?.success ? detailResponse.session : null;

    if (!session) {
      addMessage('Session data not found.', 'error');
      return;
    }

    // Switch to chat view and clear existing messages
    showChatView();
    chatMessages.innerHTML = '';

    // Show the original task as a user message
    addMessage(session.task || 'Unknown task', 'user');

    // Prefer the persisted replay manifest. Legacy actionHistory remains the
    // compatibility source for sessions that have not been imported yet.
    var replaySteps = session.replay?.manifest?.steps || [];
    var replayEnvelope = null;
    if (session.storageBackend === 'journal-v2') {
      var replayResponse = await chrome.runtime.sendMessage({
        action: 'getSessionReplayData',
        sessionId
      });
      replayEnvelope = replayResponse?.replay || null;
      replaySteps = (replayEnvelope?.steps || []).map(function(step) {
        return {
          tool: step.action?.tool,
          arguments: step.action?.params || {},
          success: step.result?.success !== false,
          resultSummary: step.result?.recorded || null,
          replay: step.replay || null,
          capability: step.capability || null
        };
      });
      if (replaySteps.length === 0) {
        replaySteps = (detailResponse.events || []).filter(function(event) {
          return event?.kind === 'tool.call';
        }).map(function(event) {
          var request = event.metadata?.request;
          var result = event.metadata?.result;
          return {
            tool: event.metadata?.tool || 'unknown',
            arguments: request?.storage === 'inline' ? request.inline : { preview: request?.preview || null },
            success: event.metadata?.success !== false,
            resultSummary: result?.storage === 'inline' ? result.inline : { preview: result?.preview || null },
            replay: null,
            capability: null
          };
        });
      }
    }
    var actions = replaySteps.length > 0 ? replaySteps : (session.actionHistory || []);
    if (actions.length > 0) {
      var integrity = replayEnvelope?.metadata?.integrity || session.replay?.integrity || 'legacy';
      var provenance = (replayEnvelope?.metadata?.provenance || session.replay?.provenance) === 'legacy-import'
        ? 'Imported legacy'
        : (integrity === 'verified'
          ? 'Capture attested'
          : (integrity === 'failed' ? 'Capture verification failed' : 'Capture awaiting verification'));
      var totalSourceSteps = replayEnvelope?.metadata?.totalSourceSteps || actions.length;
      var rangeLabel = replayEnvelope?.metadata?.truncated
        ? 'latest ' + actions.length + ' of ' + totalSourceSteps + ' recorded call(s)'
        : actions.length + ' recorded call(s)';
      addMessage(provenance + ' · integrity ' + integrity + ' · ' + rangeLabel + ':', 'system');
      for (var i = 0; i < actions.length; i++) {
        var action = actions[i];
        var tool = action.capability?.slug || action.tool || 'unknown';
        var success = action.success !== false && action.result?.success !== false;
        var params = '';
        var actionParams = action.arguments || action.params;
        if (actionParams) {
          try {
            params = '(' + Object.entries(actionParams)
              .map(function(entry) { return entry[0] + ': "' + String(entry[1]).substring(0, 60) + '"'; })
              .join(', ') + ')';
          } catch (e) {
            params = '';
          }
        }
        var replayLabel = action.replay ? ' · ' + replayRiskLabel(action) : '';
        var failureDetail = !success && action.resultSummary
          ? (action.resultSummary.error || action.resultSummary.message ||
            action.resultSummary.errorCode || action.resultSummary.code || '')
          : '';
        var label = (success ? '[OK] ' : '[FAIL] ') + tool + params + replayLabel +
          (failureDetail ? ' · ' + String(failureDetail).substring(0, 180) : '');
        addMessage(label, 'action');
      }
    } else {
      addMessage('No actions were recorded in this session.', 'system');
    }

    // Show session status footer
    var status = session.status === 'expired' ||
      (session.status === 'stopped' && session.outcomeDetails?.reason === 'idle_timeout')
      ? 'Idle-closed'
      : (session.status || 'unknown');
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
    const response = await chrome.runtime.sendMessage({ action: 'clearSessionHistory' });
    if (!response?.success) throw new Error(response?.error || 'Failed to clear session history');
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
