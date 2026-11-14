'use strict';

/**
 * Phase 68 Plan 06 (D-01, D-08, D-19, D-21) -- a driver for the real
 * runAgentIteration in extension/ai/agent-loop.js.
 *
 * The loop runs unmodified. Everything it reaches outside its own file is a
 * recording stub:
 *
 *   - chrome.runtime.sendMessage answers 'lattice-provider-execute' envelopes
 *     (the provider bridge, extension/ai/lattice-provider-bridge.js) from a
 *     scripted list of raw provider responses and records each requestBody;
 *   - chrome.tabs.sendMessage records {tabId, message, options} and answers
 *     through contentResponder(message, options);
 *   - chrome.tabs.get / query, chrome.scripting.executeScript and
 *     chrome.storage.local / session get and set (writes are recorded);
 *   - the runAgentIteration options (persist, overlay status, dashboard
 *     progress, overlay end, cleanup) record what they were asked to do;
 *   - globalThis.fsbBroadcastAutomationLifecycle and globalThis.automationLogger.
 *
 * The hook pipeline is real: a HookPipeline with the real safety-breaker hook
 * (createSafetyBreakerHook(checkSafetyBreakers)) on BEFORE_ITERATION and the
 * real createPermissionHook over a real `new PermissionContext()` on
 * BEFORE_TOOL_EXECUTION, as background.js createSessionHooks registers them.
 * The progress hook is left out: it only emits overlay events and never
 * changes a result. PermissionContext.prototype.isAllowed is a stub that
 * always allows, so permissionDenies overrides isAllowed on that one instance;
 * createDenial stays real, so a denial carries the production text.
 *
 * Timers. globalThis.setTimeout is replaced while a harness is live:
 *   - a callback whose source contains 'runAgentIteration' (the loop's
 *     schedule lines) is never run; it is recorded as {type:'schedule'} and
 *     the next step() runs the next iteration directly;
 *   - a callback with a delay of HOLD_MIN_MS (1000) or more is held and never
 *     fires on its own (the provider bridge's request deadline is one: run on
 *     a microtask it would abort every scripted answer); heldTimers.fireAll()
 *     fires them;
 *   - any shorter callback (finalizeSession's sleep(900), a navigation wait)
 *     runs on the next macrotask unless it is cleared first.
 * A fake-gateway client never uses the global timers: it is built with
 * makeClient(jevResponder, {now: deps.now, timers}) over one harness-owned
 * held pair (harness.jevTimers, sync issue 5), so a decide deadline fires only
 * when a case calls harness.jevTimers.fireAll().
 *
 * Event log. harness.events is the ordered list of what the loop did:
 *   {type:'step', index}               one runAgentIteration began
 *   {type:'provider', provider, requestBody}
 *   {type:'provider-abort'}
 *   {type:'runtime', message}          any other runtime message
 *   {type:'content', tabId, message, options}
 *   {type:'status', tabId, payload}    sendSessionStatus (overlay)
 *   {type:'dashboard'}                 broadcastDashboardProgress
 *   {type:'persist', status}
 *   {type:'lifecycle', message}        fsbBroadcastAutomationLifecycle
 *   {type:'endOverlays', reason} / {type:'cleanup'}
 *   {type:'storage-get', area, keys} / {type:'storage-set', area, items}
 *   {type:'cdp', verb, params}         executeCDPToolDirect
 *   {type:'schedule', delayMs}         a schedule line ran (not executed)
 * harness.snapshot() adds the final session: status, outcome,
 * iterationCount, messages, actionHistory and toolCallLog.
 *
 * Normalisation (applied by normalise(); the golden holds normalised data):
 *   N1 a value under a key named timestamp, startTime, startedAt, durationMs,
 *      elapsedMs, capturedAt or lastActiveTime becomes '<time>';
 *   N2 the text of a role:'system' message (session.messages and request
 *      bodies) becomes 'sha256:<hex>:<length>' (buildSystemPrompt is also
 *      pinned by its slice hash);
 *   N3 a request body's tools array becomes {count, sha256} of its JSON;
 *   N4 undefined object members are dropped (JSON semantics) and every value
 *      is deep-copied, so later mutation of the session cannot change a
 *      recorded event.
 *
 * The fast-path module is loaded only when loadFastPath is true
 * (globalThis.FsbFastPath set from require); otherwise globalThis.FsbFastPath
 * and globalThis.fsbFastPathDeps are deleted before the run.
 *
 * No network, no ports, no real waits. Node 20-safe.
 */

const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const AI = path.join(ROOT, 'extension', 'ai');

const REAL_SET_TIMEOUT = globalThis.setTimeout;
const REAL_CLEAR_TIMEOUT = globalThis.clearTimeout;
const REAL_CONSOLE = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };

// The bridge installs executeViaBridge on globalThis; agent-loop.js resolves
// it when callProviderWithTools runs. The bridge prints one boot line.
(function loadQuietly() {
  console.log = function () {};
  try {
    require(path.join(AI, 'lattice-provider-bridge.js'));
  } finally {
    console.log = REAL_CONSOLE.log;
  }
})();
const agentLoop = require(path.join(AI, 'agent-loop.js'));
const { HookPipeline, LIFECYCLE_EVENTS } = require(path.join(AI, 'hook-pipeline.js'));
const { PermissionContext } = require(path.join(AI, 'permission-context.js'));
const { createPermissionHook } = require(path.join(AI, 'hooks', 'permission-hook.js'));
const { createSafetyBreakerHook } = require(path.join(AI, 'hooks', 'safety-hooks.js'));
const { ActionHistory } = require(path.join(AI, 'action-history.js'));
const { CostTracker } = require(path.join(AI, 'cost-tracker.js'));

const FAST_PATH_FILE = path.join(AI, 'jev-fast-path.js');
const HOLD_MIN_MS = 1000;
const TIME_KEYS = new Set(['timestamp', 'startTime', 'startedAt', 'durationMs', 'elapsedMs', 'capturedAt', 'lastActiveTime']);

const DEFAULTS = Object.freeze({
  providerKey: 'openai',
  model: 'gpt-4.1-mini',
  task: 'Open the wizard and finish it',
  pageUrl: 'https://wizard.example/start',
  tabId: 41,
  sessionId: 'session_harness'
});

function sha256(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function digestText(text) {
  return 'sha256:' + sha256(text) + ':' + String(text).length;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** N1 and N4 over any JSON-able value. */
function normalise(value, key) {
  if (Array.isArray(value)) return value.map((v) => normalise(v, null));
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      if (value[k] === undefined || typeof value[k] === 'function') continue;
      out[k] = normalise(value[k], k);
    }
    return out;
  }
  if (TIME_KEYS.has(key) && (typeof value === 'number' || typeof value === 'string')) return '<time>';
  return value;
}

/** N2 for one message. */
function digestSystemMessage(message) {
  if (message && message.role === 'system' && typeof message.content === 'string') {
    return Object.assign({}, message, { content: digestText(message.content) });
  }
  return message;
}

/** N2 and N3 for a provider request body. */
function normaliseRequestBody(body) {
  const b = clone(body) || {};
  if (Array.isArray(b.tools)) b.tools = { count: b.tools.length, sha256: sha256(JSON.stringify(b.tools)) };
  if (Array.isArray(b.messages)) b.messages = b.messages.map(digestSystemMessage);
  if (Array.isArray(b.system)) b.system = b.system.map((block) => (block && typeof block.text === 'string'
    ? Object.assign({}, block, { text: digestText(block.text) }) : block));
  if (b.systemInstruction && Array.isArray(b.systemInstruction.parts)) {
    b.systemInstruction = { parts: b.systemInstruction.parts.map((p) => (p && typeof p.text === 'string' ? { text: digestText(p.text) } : p)) };
  }
  return normalise(b, null);
}

function realTick() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function settle(rounds) {
  for (let i = 0; i < (rounds || 8); i += 1) await realTick();
}

/** One raw provider response in openai format (tool calls or final text). */
function openAiToolResponse(id, calls, usage) {
  return {
    id,
    object: 'chat.completion',
    choices: [{
      index: 0,
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        content: null,
        tool_calls: calls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.args || {}) }
        }))
      }
    }],
    usage: usage || { prompt_tokens: 1000, completion_tokens: 40, total_tokens: 1040 }
  };
}

/** The default content answers: actions succeed, snapshots return fixed text. */
function defaultContentResponder(message) {
  if (!message || typeof message !== 'object') return { success: true };
  if (message.action === 'getMarkdownSnapshot') {
    return { success: true, markdownSnapshot: '# Wizard\n- e1 button "Next"\n- e2 checkbox "Agree"', refGeneration: 3, elementCount: 2 };
  }
  if (message.action === 'executeAction') return { success: true };
  if (message.action === 'getJevMenu') return { success: false, reason: 'menu_error' };
  return { success: true };
}

/**
 * Create a harness. opts:
 *   providerKey, model, task, pageUrl, tabId, sessionId (DEFAULTS)
 *   loadFastPath   require extension/ai/jev-fast-path.js (else FsbFastPath is deleted)
 *   sessionPatch   own properties merged onto the session after it is built
 *   contentResponder(message, options) -> answer | Promise | throws (rejection)
 *   providerScript array of raw provider responses, or fn(index, requestBody) -> response
 *   deps           installed as globalThis.fsbFastPathDeps (with jevClient filled in)
 *   jevResponder   fake-gateway responder: deps.jevClient = makeClient(jevResponder, {now: deps.now, timers})
 *   jevClient      an explicit client (wins over jevResponder)
 *   permissionDenies tool names the PermissionContext instance refuses
 *   storage        initial chrome.storage.local contents
 *   registerRunEvidence {startUrl} or true (startUrl = pageUrl): after the
 *                  session is built, register FsbFastPath's run evidence
 *                  handlers (Phase 70, D-14) as background.js does: only on a
 *                  session that carries fastMode, with the module loaded,
 *                  after the permission hook, in the order before-tool,
 *                  after-tool, after-iteration. Absent: nothing changes.
 */
function createHarness(options) {
  const o = Object.assign({}, DEFAULTS, options || {});
  const events = [];
  const consoleLines = [];
  const providerRequests = [];
  const contentMessages = [];
  const storage = { local: Object.assign({}, o.storage || {}), session: {} };
  let scheduled = 0;
  let stepsRun = 0;
  let providerIndex = 0;

  // --- timers -----------------------------------------------------------------
  let nextTimerId = 1;
  const held = new Map();
  const cancelled = new Set();
  function harnessSetTimeout(fn, delay) {
    const args = Array.prototype.slice.call(arguments, 2);
    const id = nextTimerId;
    nextTimerId += 1;
    if (typeof fn === 'function' && String(fn).indexOf('runAgentIteration') !== -1) {
      scheduled += 1;
      events.push({ type: 'schedule', delayMs: delay });
      return id;
    }
    if (typeof delay === 'number' && delay >= HOLD_MIN_MS) {
      held.set(id, { fn, args, delay });
      return id;
    }
    setImmediate(() => {
      if (cancelled.has(id)) return;
      if (typeof fn === 'function') fn.apply(null, args);
    });
    return id;
  }
  function harnessClearTimeout(id) {
    cancelled.add(id);
    held.delete(id);
  }
  const heldTimers = {
    pending() { return held.size; },
    delays() { return Array.from(held.values()).map((t) => t.delay); },
    fireAll() {
      const list = Array.from(held.entries());
      held.clear();
      for (const [, t] of list) t.fn.apply(null, t.args);
      return list.length;
    }
  };

  // --- chrome -------------------------------------------------------------------
  const providerScript = o.providerScript || [];
  function nextProviderResponse(requestBody) {
    const index = providerIndex;
    providerIndex += 1;
    const raw = typeof providerScript === 'function' ? providerScript(index, requestBody) : providerScript[index];
    return raw === undefined ? undefined : clone(raw);
  }
  const contentResponder = typeof o.contentResponder === 'function' ? o.contentResponder : defaultContentResponder;

  function storageArea(area) {
    return {
      get(keys) {
        events.push({ type: 'storage-get', area, keys: clone(keys === undefined ? null : keys) });
        const src = storage[area];
        let out = {};
        if (keys === null || keys === undefined) out = Object.assign({}, src);
        else if (typeof keys === 'string') { if (keys in src) out[keys] = src[keys]; }
        else if (Array.isArray(keys)) { for (const k of keys) if (k in src) out[k] = src[k]; }
        else if (typeof keys === 'object') { for (const k of Object.keys(keys)) out[k] = k in src ? src[k] : keys[k]; }
        return Promise.resolve(clone(out));
      },
      set(items) {
        events.push({ type: 'storage-set', area, items: clone(items) });
        Object.assign(storage[area], clone(items));
        return Promise.resolve();
      },
      remove(keys) {
        events.push({ type: 'storage-remove', area, keys: clone(keys) });
        for (const k of [].concat(keys)) delete storage[area][k];
        return Promise.resolve();
      }
    };
  }

  const chromeStub = {
    runtime: {
      id: 'fsb-harness',
      lastError: undefined,
      sendMessage(message) {
        if (message && message.type === 'lattice-provider-execute') {
          const body = message.requestBody;
          providerRequests.push({ provider: message.provider, requestBody: clone(body) });
          events.push({ type: 'provider', provider: message.provider, requestBody: normaliseRequestBody(body) });
          const response = nextProviderResponse(body);
          if (response === undefined) {
            return Promise.resolve({ ok: false, error: { kind: 'adapter_error', message: 'harness provider script exhausted', status: 400 } });
          }
          return Promise.resolve({ ok: true, response: { rawResponse: response } });
        }
        if (message && message.type === 'lattice-provider-abort') {
          events.push({ type: 'provider-abort' });
          return Promise.resolve(undefined);
        }
        events.push({ type: 'runtime', message: normalise(clone(message), null) });
        return Promise.resolve(undefined);
      }
    },
    tabs: {
      sendMessage(tabId, message, sendOptions) {
        const record = { tabId, message: normalise(clone(message), null), options: sendOptions === undefined ? null : clone(sendOptions) };
        contentMessages.push(record);
        events.push(Object.assign({ type: 'content' }, record));
        try {
          return Promise.resolve(contentResponder(clone(message), clone(sendOptions))).then(clone);
        } catch (err) {
          return Promise.reject(err);
        }
      },
      get(tabId) {
        return Promise.resolve({ id: tabId, url: o.pageUrl, title: 'Wizard', active: true });
      },
      query() {
        return Promise.resolve([{ id: o.tabId, url: o.pageUrl, title: 'Wizard', active: true }]);
      }
    },
    scripting: {
      executeScript() { return Promise.resolve([]); }
    },
    storage: {
      local: storageArea('local'),
      session: storageArea('session')
    }
  };

  // --- globals --------------------------------------------------------------------
  const savedGlobals = {
    chrome: globalThis.chrome,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    fsbBroadcastAutomationLifecycle: globalThis.fsbBroadcastAutomationLifecycle,
    automationLogger: globalThis.automationLogger
  };
  globalThis.chrome = chromeStub;
  globalThis.setTimeout = harnessSetTimeout;
  globalThis.clearTimeout = harnessClearTimeout;
  globalThis.fsbBroadcastAutomationLifecycle = function (message) {
    events.push({ type: 'lifecycle', message: normalise(clone(message), null) });
    return Promise.resolve();
  };
  const noop = function () {};
  globalThis.automationLogger = {
    debug: noop, info: noop, warn: noop, error: noop, log: noop,
    logSessionEnd: noop, saveSession: noop, logFollowUpCommand: noop
  };

  let fastPath = null;
  if (o.loadFastPath) {
    fastPath = require(FAST_PATH_FILE);
    globalThis.FsbFastPath = fastPath;
  } else {
    delete globalThis.FsbFastPath;
  }

  let jevTimers = null;
  let jevClient = o.jevClient || null;
  if (!jevClient && typeof o.jevResponder === 'function') {
    const gateway = require(path.join(__dirname, 'jev-fake-gateway.js'));
    jevTimers = gateway.makeHeldTimers();
    jevClient = gateway.makeClient(o.jevResponder, { now: o.deps && o.deps.now, timers: jevTimers });
  }
  if (o.deps) {
    const deps = Object.assign({}, o.deps);
    if (jevClient) deps.jevClient = jevClient;
    globalThis.fsbFastPathDeps = deps;
  } else {
    delete globalThis.fsbFastPathDeps;
  }

  // --- hooks ----------------------------------------------------------------------
  const permissionContext = new PermissionContext();
  const denies = new Set((o.permissionDenies || []).map((n) => String(n)));
  if (denies.size > 0) {
    permissionContext.isAllowed = function (toolName) { return !denies.has(toolName); };
  }
  const pipeline = new HookPipeline();
  pipeline.register(LIFECYCLE_EVENTS.BEFORE_ITERATION, createSafetyBreakerHook(agentLoop.checkSafetyBreakers));
  pipeline.register(LIFECYCLE_EVENTS.BEFORE_TOOL_EXECUTION, createPermissionHook(permissionContext));

  // --- session --------------------------------------------------------------------
  const providerInstance = {
    config: { keyField: 'openaiApiKey' },
    settings: { openaiApiKey: 'sk-harness', apiKey: 'sk-harness', anthropicApiKey: 'sk-harness', geminiApiKey: 'sk-harness' },
    model: o.model,
    getEndpoint() { return 'harness://provider'; }
  };
  const session = {
    task: o.task,
    tabId: o.tabId,
    originalTabId: o.tabId,
    status: 'running',
    startTime: Date.now(),
    maxIterations: 20,
    actionHistory: [],
    stateHistory: [],
    failedAttempts: {},
    failedActionDetails: {},
    stuckCounter: 0,
    consecutiveNoProgressCount: 0,
    iterationCount: 0,
    urlHistory: [],
    lastUrl: null,
    allowedTabs: [o.tabId],
    animatedActionHighlights: true,
    conversationId: null,
    commandCount: 1,
    commands: [o.task],
    totalCost: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    agentState: {
      iterationCount: 0,
      completedIterations: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      startTime: Date.now(),
      lastDOMHash: null,
      consecutiveNoChangeCount: 0,
      actionFingerprints: [],
      stuckWarningCount: 0
    },
    safetyConfig: { costLimit: 2, timeLimit: 600000 },
    providerConfig: { providerKey: o.providerKey, model: o.model, apiKey: 'sk-harness', providerInstance },
    tools: agentLoop.getPublicTools(),
    messages: [{ role: 'system', content: agentLoop.buildSystemPrompt(o.task, o.pageUrl) }]
  };
  session._actionHistory = new ActionHistory();
  session._costTracker = new CostTracker(2);
  if (o.sessionPatch) Object.assign(session, o.sessionPatch);
  if (o.registerRunEvidence && session.fastMode && globalThis.FsbFastPath
      && typeof globalThis.FsbFastPath.createRunEvidenceHandlers === 'function') {
    const startUrl = o.registerRunEvidence === true ? o.pageUrl : o.registerRunEvidence.startUrl;
    const handlers = globalThis.FsbFastPath.createRunEvidenceHandlers(session, { startUrl });
    pipeline.register(LIFECYCLE_EVENTS.BEFORE_TOOL_EXECUTION, handlers.beforeTool);
    pipeline.register(LIFECYCLE_EVENTS.AFTER_TOOL_EXECUTION, handlers.afterTool);
    pipeline.register(LIFECYCLE_EVENTS.AFTER_ITERATION, handlers.afterIteration);
  }

  const activeSessions = new Map([[o.sessionId, session]]);
  const loopOptions = {
    activeSessions,
    persistSession(sid, sess) {
      events.push({ type: 'persist', status: sess.status });
      return Promise.resolve();
    },
    sendSessionStatus(tabId, payload) {
      events.push({ type: 'status', tabId, payload: normalise(clone(payload), null) });
      return Promise.resolve();
    },
    broadcastDashboardProgress() {
      events.push({ type: 'dashboard' });
    },
    endSessionOverlays(sess, reason) {
      events.push({ type: 'endOverlays', reason });
      return Promise.resolve();
    },
    cleanupSession() {
      events.push({ type: 'cleanup' });
      return Promise.resolve();
    },
    startKeepAlive() {},
    executeCDPToolDirect(request) {
      events.push({ type: 'cdp', verb: request && request.tool, params: normalise(clone(request && request.params), null) });
      return Promise.resolve({ success: true });
    },
    handleDataTool: null,
    resolveAuthWall: null,
    hooks: pipeline,
    emitter: null
  };

  function muteConsole() {
    const capture = (level) => function () {
      consoleLines.push(level + ' ' + Array.prototype.map.call(arguments, (a) => (typeof a === 'string' ? a : safeJson(a))).join(' '));
    };
    console.log = capture('log');
    console.warn = capture('warn');
    console.error = capture('error');
    console.info = capture('info');
    console.debug = capture('debug');
  }
  function restoreConsole() {
    Object.assign(console, REAL_CONSOLE);
  }

  /** Run one runAgentIteration and wait until it and its fire-and-forget work settle. */
  async function step() {
    stepsRun += 1;
    events.push({ type: 'step', index: stepsRun });
    muteConsole();
    try {
      await agentLoop.runAgentIteration(o.sessionId, loopOptions);
      await settle(8);
    } finally {
      restoreConsole();
    }
  }

  /** The normalised final session state. */
  function finalState() {
    return normalise({
      status: session.status,
      outcome: session.outcome === undefined ? null : session.outcome,
      iterationCount: session.iterationCount,
      messages: clone((session.messages || []).map(digestSystemMessage)),
      actionHistory: clone(session.actionHistory || []),
      toolCallLog: clone(session.toolCallLog || [])
    }, null);
  }

  /** {events, final}: the full normalised record of the run so far. */
  function snapshot() {
    return { events: clone(events), final: finalState() };
  }

  function dispose() {
    for (const key of Object.keys(savedGlobals)) {
      if (savedGlobals[key] === undefined) delete globalThis[key];
      else globalThis[key] = savedGlobals[key];
    }
    restoreConsole();
  }

  return {
    session,
    sessionId: o.sessionId,
    options: loopOptions,
    pipeline,
    permissionContext,
    events,
    providerRequests,
    contentMessages,
    storage,
    consoleLines,
    heldTimers,
    jevTimers,
    jevClient,
    fastPath,
    step,
    snapshot,
    finalState,
    dispose,
    get scheduled() { return scheduled; },
    get stepsRun() { return stepsRun; },
    get providerCalls() { return providerIndex; }
  };
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch (_e) {
    return String(value);
  }
}

/**
 * The D-01 golden scenario (openai format, three iterations): iteration 1
 * clicks by selector, iteration 2 calls get_page_snapshot, iteration 3 calls
 * complete_task. tests/fixtures/jev-fast-loop-off-golden.json holds run A of
 * this scenario captured from the unedited agent-loop.js.
 */
function goldenProviderScript() {
  return [
    openAiToolResponse('resp_1', [{ id: 'call_1', name: 'click', args: { selector: '#start' } }]),
    openAiToolResponse('resp_2', [{ id: 'call_2', name: 'get_page_snapshot', args: {} }]),
    openAiToolResponse('resp_3', [{ id: 'call_3', name: 'complete_task', args: { summary: 'Wizard finished' } }])
  ];
}

/** Run the golden scenario under the given harness options; returns {record, harness}. */
async function runGoldenScenario(extra) {
  const h = createHarness(Object.assign({ providerScript: goldenProviderScript() }, extra || {}));
  try {
    for (let i = 0; i < 3; i += 1) await h.step();
    return { record: h.snapshot(), harness: h };
  } finally {
    h.dispose();
  }
}

// ---------------------------------------------------------------------------
// Plan 68-07 helpers: a fake clock, scripted gateways and a content script
// whose menu signature the case controls. They only build inputs for
// createHarness; no existing case runs differently because of them.
// ---------------------------------------------------------------------------

/**
 * A fake clock for the fast-path deps and the Jev client: now() returns the
 * current reading and advance(ms) moves it. Nothing else moves it, so a case
 * that advances it only inside the menu and decide stubs reads the command's
 * Jev time straight off the clock.
 */
function makeFakeClock(start) {
  let t = typeof start === 'number' ? start : 0;
  return {
    now() { return t; },
    advance(ms) {
      if (typeof ms === 'number' && ms > 0) t += ms;
      return t;
    },
    get t() { return t; }
  };
}

/**
 * A scripted fake-gateway responder: the i-th decide gets answers[i] (the last
 * answer repeats). An answer is a responder value ({body}, {status, text}, an
 * Error, a promise) or fn(request, info, index) returning one. requests holds
 * every request the gateway saw, in order.
 */
function scriptedGateway(answers) {
  const list = Array.isArray(answers) ? answers.slice() : [answers];
  const requests = [];
  function responder(request, info) {
    requests.push(request);
    const index = requests.length - 1;
    const answer = list[Math.min(index, list.length - 1)];
    return typeof answer === 'function' ? answer(request, info, index) : answer;
  }
  return { responder, requests };
}

/**
 * A real FsbJevClient over a fake gateway with held timers (sync issue 5),
 * wrapped so each decide call records {timeoutMs, signal, at} (at: the clock
 * reading when the fast path called decide). Pass client as createHarness's
 * jevClient. opts: {now, timers}.
 * @returns {{client:Object, timers:Object, calls:Array, decides:Array}}
 */
function recordingJevClient(responder, opts) {
  const gateway = require(path.join(__dirname, 'jev-fake-gateway.js'));
  const o = opts || {};
  const timers = o.timers || gateway.makeHeldTimers();
  const inner = gateway.makeClient(responder, { now: o.now, timers });
  const decides = [];
  const client = {
    decide(request, callOpts) {
      const c = callOpts || {};
      decides.push({ timeoutMs: c.timeoutMs, signal: c.signal || null, at: typeof o.now === 'function' ? o.now() : null });
      return inner.decide(request, callOpts);
    },
    resetCooldown: inner.resetCooldown
  };
  return { client, timers, calls: inner.calls, decides };
}

function pick(value, state, fallback) {
  if (typeof value === 'function') return value(state);
  return value === undefined ? fallback : value;
}

/**
 * A content script for fast-mode loop cases whose menu the case controls.
 * opts:
 *   entries    array or fn(state): the 68-02 menu entries
 *   url        string or fn(state) (default DEFAULTS.pageUrl)
 *   signature  'request' (default: changes on every getJevMenu request, with
 *              the request counter in the title), 'action' (changes after
 *              every fast action), a fixed string, or fn(state)
 *   moreBelow  boolean
 *   onMenu(state)               runs on every getJevMenu request (a clock tick)
 *   action(message, state)      the answer to a fast executeAction (one with
 *              params.jevHandle); it may throw (a rejected sendMessage) or
 *              return undefined (no answer). Default: a verified click.
 *   snapshot   fn(state) or string: the getMarkdownSnapshot text (default
 *              'SNAP-<n>' with n the snapshot request count)
 * state: {menuRequests, fastActions, snapshots}.
 * @returns {{respond:Function, state:Object}}
 */
function signatureMenuContent(opts) {
  const o = opts || {};
  const state = { menuRequests: 0, fastActions: 0, snapshots: 0 };
  function signatureFor() {
    const mode = o.signature === undefined ? 'request' : o.signature;
    if (mode === 'request') return 'sig-r' + state.menuRequests;
    if (mode === 'action') return 'sig-a' + state.fastActions;
    return pick(mode, state, 'sig');
  }
  function respond(message) {
    if (message && message.action === 'getJevMenu') {
      state.menuRequests += 1;
      if (typeof o.onMenu === 'function') o.onMenu(state);
      const options = message.options || {};
      const entries = pick(o.entries, state, []);
      return {
        success: true,
        generation: 'g' + state.menuRequests + 'abcd-' + state.fastActions,
        url: pick(o.url, state, DEFAULTS.pageUrl),
        title: 'Wizard (' + state.menuRequests + ')',
        visibleText: 'Wizard page',
        moreBelow: o.moreBelow === true,
        signature: signatureFor(),
        count: entries.length,
        truncated: false,
        entries,
        recentHandles: (Array.isArray(options.recent) ? options.recent : []).map(() => null)
      };
    }
    if (message && message.action === 'executeAction' && message.params && message.params.jevHandle) {
      state.fastActions += 1;
      if (typeof o.action === 'function') return o.action(message, state);
      return { success: true, verification: { verified: true, changes: ['content'], confidence: 'high' } };
    }
    if (message && message.action === 'getMarkdownSnapshot') {
      state.snapshots += 1;
      const text = pick(o.snapshot, state, 'SNAP-' + state.snapshots);
      return { success: true, markdownSnapshot: text, elementCount: 1 };
    }
    return defaultContentResponder(message);
  }
  return { respond, state };
}

// ---------------------------------------------------------------------------
// Provider formats (extension/ai/tool-use-adapter.js): raw responses with tool
// calls, and a pairing check over the request bodies the loop builds.
// ---------------------------------------------------------------------------

/** The wire format of a provider key: 'anthropic', 'gemini', or 'openai' (xai, openai, openrouter, lmstudio, custom). */
function providerFormat(providerKey) {
  if (providerKey === 'anthropic') return 'anthropic';
  if (providerKey === 'gemini') return 'gemini';
  return 'openai';
}

/** One raw provider response holding tool calls [{id, name, args}] in that provider's format. */
function providerToolResponse(providerKey, id, calls) {
  const format = providerFormat(providerKey);
  if (format === 'anthropic') {
    return {
      id,
      type: 'message',
      role: 'assistant',
      model: 'harness-model',
      content: calls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.args || {} })),
      stop_reason: 'tool_use',
      usage: { input_tokens: 1000, output_tokens: 40 }
    };
  }
  if (format === 'gemini') {
    return {
      responseId: id,
      candidates: [{
        index: 0,
        finishReason: 'STOP',
        content: { role: 'model', parts: calls.map((c) => ({ functionCall: { id: c.id, name: c.name, args: c.args || {} } })) }
      }],
      usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 40, totalTokenCount: 1040 }
    };
  }
  return openAiToolResponse(id, calls);
}

function toolCallIdsOf(format, message) {
  if (!message || typeof message !== 'object') return [];
  if (format === 'openai') {
    return message.role === 'assistant' && Array.isArray(message.tool_calls) ? message.tool_calls.map((c) => c && c.id) : [];
  }
  if (format === 'anthropic') {
    return message.role === 'assistant' && Array.isArray(message.content)
      ? message.content.filter((b) => b && b.type === 'tool_use').map((b) => b.id) : [];
  }
  if (message.role !== 'model' || !Array.isArray(message.parts)) return [];
  // parseToolCalls names an id-less Gemini call gemini-call-<index>.
  return message.parts.filter((p) => p && p.functionCall).map((p, i) => p.functionCall.id || ('gemini-call-' + i));
}

function toolResultIdsOf(format, message) {
  if (!message || typeof message !== 'object') return [];
  if (format === 'openai') return message.role === 'tool' ? [message.tool_call_id] : [];
  if (format === 'anthropic') {
    return message.role === 'user' && Array.isArray(message.content)
      ? message.content.filter((b) => b && b.type === 'tool_result').map((b) => b.tool_use_id) : [];
  }
  return message.role === 'user' && Array.isArray(message.parts)
    ? message.parts.filter((p) => p && p.functionResponse).map((p) => p.functionResponse.id) : [];
}

function userTextOf(format, message) {
  if (!message || message.role !== 'user') return null;
  if (format !== 'gemini') return typeof message.content === 'string' ? message.content : null;
  if (!Array.isArray(message.parts) || message.parts.some((p) => p && p.functionResponse)) return null;
  const texts = message.parts.filter((p) => p && typeof p.text === 'string').map((p) => p.text);
  return texts.length > 0 ? texts.join('\n') : null;
}

/**
 * Tool-call pairing in one provider request body. Every assistant (Gemini:
 * model) tool call must be answered by a tool result in the messages that
 * immediately follow it, before any other message; every tool result must
 * answer a call of that window. userTexts are the plain-text user entries
 * (where a fast-mode hand-off has to sit).
 * @returns {{ok:boolean, calls:string[], results:string[], unpaired:string[], orphans:string[], userTexts:string[]}}
 */
function toolPairing(providerKey, body) {
  const format = providerFormat(providerKey);
  const b = body || {};
  const list = format === 'gemini' ? (b.contents || []) : (b.messages || []);
  const calls = [];
  const results = [];
  const unpaired = [];
  const orphans = [];
  const userTexts = [];
  let open = null;
  function closeWindow() {
    if (open) for (const id of open) unpaired.push(id);
    open = null;
  }
  for (const message of list) {
    const callIds = toolCallIdsOf(format, message);
    if (callIds.length > 0) {
      closeWindow();
      calls.push(...callIds);
      open = new Set(callIds);
      continue;
    }
    const resultIds = toolResultIdsOf(format, message);
    if (resultIds.length > 0) {
      for (const id of resultIds) {
        results.push(id);
        if (open && open.has(id)) open.delete(id);
        else orphans.push(id);
      }
      if (open && open.size === 0) open = null;
      continue;
    }
    closeWindow();
    const text = userTextOf(format, message);
    if (text !== null) userTexts.push(text);
  }
  closeWindow();
  return { ok: unpaired.length === 0 && orphans.length === 0, calls, results, unpaired, orphans, userTexts };
}

module.exports = {
  createHarness,
  goldenProviderScript,
  runGoldenScenario,
  openAiToolResponse,
  defaultContentResponder,
  normalise,
  normaliseRequestBody,
  digestText,
  sha256,
  makeFakeClock,
  scriptedGateway,
  recordingJevClient,
  signatureMenuContent,
  providerFormat,
  providerToolResponse,
  toolPairing,
  DEFAULTS,
  HOLD_MIN_MS,
  REAL_SET_TIMEOUT,
  REAL_CLEAR_TIMEOUT
};
