// Background service worker for FSB v0.9.90

// Import configuration and AI integration modules
// Phase 269 / v0.9.69: install-identity.js MUST load FIRST so that any
// downstream module (analytics.js, telemetry collectors, MCP recorder)
// can call globalThis.fsbInstallIdentity.* synchronously at boot.
importScripts('utils/install-identity.js');
importScripts('config/config.js');
importScripts('config/init-config.js');
importScripts('config/secure-config.js');
importScripts('ai/cli-parser.js');
importScripts('ai/lattice-provider-bridge.js');
importScripts('ai/lattice-step-emitter.js');
// Phase 9 FINT-13 -- activate FSB SurvivabilityAdapter (closes audit gap G2).
// Mirrors Phase 6 flag-flip-in-background.js precedent (FSB_LATTICE_PROVIDER_BRIDGE_ENABLED
// pre-Phase-7). Code-only activation; options-page exposure deferred per 09-CONTEXT.md
// deferred ideas. Set BEFORE chrome.runtime.onInstalled at line 13142+ so the flag is
// observable from the first runAgentLoop invocation.
globalThis.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED = true;
importScripts('ai/ai-integration.js');
importScripts('ai/tool-definitions.js');
importScripts('utils/mcp-visual-session.js');
importScripts('utils/mcp-visual-session-lifecycle.js');
try { importScripts('utils/agent-registry.js'); } catch (e) { console.error('[FSB] Failed to load agent-registry.js:', e.message); }
// Phase 246 plan 01: agent-scoped tab resolver. Pure helper; consumes
// globalThis.fsbAgentRegistryInstance via getAgentTabs(agentId). Loaded
// AFTER the registry and BEFORE the dispatcher / bridge-client so those
// callers see globalThis.resolveAgentTabOrError at module-eval time.
try { importScripts('utils/agent-tab-resolver.js'); } catch (e) { console.error('[FSB] Failed to load agent-tab-resolver.js:', e.message); }
// Phase 243 plan 02 (BG-04): user-initiated nav emission helper. Pure
// module; no chrome.* dependency. The webNavigation.onCommitted listener
// at this file's line ~2464 calls FsbAgentNavEmission._maybeEmitUserNavigation.
try { importScripts('utils/agent-nav-emission.js'); } catch (e) { console.error('[FSB] Failed to load agent-nav-emission.js:', e.message); }
try { importScripts('utils/mcp-task-store.js'); } catch (e) { console.error('[FSB] Failed to load mcp-task-store.js:', e.message); }
// Phase 14 Plan 03 (v0.11.0): trigger survivability modules. trigger-store.js
// is the chrome.storage.session envelope store; trigger-lifecycle.js is the
// chrome.alarms lifecycle that calls FsbTriggerStore at load/runtime, so the
// store MUST be imported BEFORE the lifecycle (D-07 glue point 0). Wrapped in
// try/catch (mirroring mcp-task-store.js) so a load failure logs and the
// typeof FsbTriggerLifecycle guards at every call site make the glue inert.
// Phase 15 Plan 03 (v0.11.0): the fire-condition engine joins the load chain.
// LOAD ORDER (load-bearing): the value-extractor module (pure, no deps) loads
// BEFORE the trigger store so FsbValueExtractor is on the global; the trigger
// manager loads AFTER the store (its cap resolves FsbTriggerStore) and BEFORE
// the lifecycle (whose Phase-15 SEAM calls FsbTriggerManager.evaluate). Concrete
// order below: value-extractor -> trigger-store -> trigger-manager -> lifecycle.
try { importScripts('utils/value-extractor.js'); } catch (e) { console.error('[FSB] Failed to load value-extractor.js:', e.message); }
try { importScripts('utils/trigger-store.js'); } catch (e) { console.error('[FSB] Failed to load trigger-store.js:', e.message); }
try { importScripts('utils/trigger-manager.js'); } catch (e) { console.error('[FSB] Failed to load trigger-manager.js:', e.message); }
try { importScripts('utils/trigger-lifecycle.js'); } catch (e) { console.error('[FSB] Failed to load trigger-lifecycle.js:', e.message); }
// Phase 245 (v0.9.60): action-verification.js exports buildChangeReport /
// applyChangeReportSizeCap which the dispatcher calls from SW context after
// harvesting mutations from the page. capturePageState / startMutationHarvest
// remain DOM-bound but are not invoked here -- SW reaches them via
// chrome.scripting.executeScript injection inside wrapWithChangeReport.
try { importScripts('utils/action-verification.js'); } catch (e) { console.error('[FSB] Failed to load action-verification.js:', e.message); }
try { importScripts('ws/mcp-tool-dispatcher.js'); } catch (e) { console.error('[FSB] Failed to load mcp-tool-dispatcher.js:', e.message); }
// Phase 270 / v0.9.69 -- price resolver. Must load BEFORE mcp-metrics-recorder
// so the recorder's try/catch can call globalThis.fsbMcpPricing.estimateMcpCost.
// (Phase 270 produced the module but did not wire the importScripts; Phase 271
// reconciliation #3 repairs the gap with this single line.)
try { importScripts('utils/mcp-pricing.js'); } catch (e) { console.error('[FSB] Failed to load mcp-pricing.js:', e.message); }
// Phase 271 / v0.9.69 -- MCP analytics chokepoint. Loaded AFTER pricing
// (it calls fsbMcpPricing) and AFTER mcp-tool-dispatcher.js (dispatcher hooks
// call globalThis.fsbMcpMetricsRecorder).
try { importScripts('utils/mcp-metrics-recorder.js'); } catch (e) { console.error('[FSB] Failed to load mcp-metrics-recorder.js:', e.message); }
// Phase 272 / v0.9.69 -- TelemetryCollector. Loaded AFTER mcp-metrics-recorder
// (collector reads the rows the recorder writes to fsbUsageData). The alarm
// handler in chrome.alarms.onAlarm + the install_announce setTimeout in
// chrome.runtime.onInstalled are wired below.
try { importScripts('utils/telemetry-collector.js'); } catch (e) { console.error('[FSB] Failed to load telemetry-collector.js:', e.message); }
importScripts('utils/automation-logger.js');
importScripts('utils/analytics.js');
importScripts('utils/keyboard-emulator.js');
importScripts('utils/site-explorer.js');
importScripts('utils/crawler-manager.js');

// Overlay state builder for sendSessionStatus -> content script overlay
importScripts('utils/overlay-state.js');

// MCP bridge client for local MCP server connection
try { importScripts('ws/mcp-bridge-client.js'); } catch (e) { console.error('[FSB] Failed to load mcp-bridge-client.js:', e.message); }

function armMcpBridge(reason) {
  try {
    if (typeof mcpBridgeClient === 'undefined' || !mcpBridgeClient) return;
    mcpBridgeClient.recordWake?.(reason);
    mcpBridgeClient.connect();
  } catch (error) {
    console.error('[FSB] MCP bridge arm failed', error.message || String(error));
  }
}

armMcpBridge('service-worker-evaluated');

// Dashboard relay WebSocket client (auto-connects to full-selfbrowsing.com)
try { importScripts('lib/lz-string.min.js'); } catch (e) { console.error('[FSB] Failed to load lz-string.min.js:', e.message); }
// Phase 211-03 diagnostic logging: load the ring buffer BEFORE redactForLog so
// that rateLimitedWarn sees globalThis.fsbDiagnostics on first call. Both load
// BEFORE ws-client.js so the WebSocket layer can use the helpers.
try { importScripts('utils/diagnostics-ring-buffer.js'); } catch (e) { console.error('[FSB] Failed to load diagnostics-ring-buffer.js:', e.message); }
try { importScripts('utils/redactForLog.js'); } catch (e) { console.error('[FSB] Failed to load redactForLog.js:', e.message); }
try { importScripts('ws/ws-client.js'); } catch (e) { console.error('[FSB] Failed to load ws-client.js:', e.message); }

// Site-specific AI guidance modules
importScripts('site-guides/index.js');

// Category shared guidance
importScripts('site-guides/ecommerce/_shared.js');
importScripts('site-guides/social/_shared.js');
importScripts('site-guides/finance/_shared.js');
importScripts('site-guides/travel/_shared.js');
importScripts('site-guides/email/_shared.js');
importScripts('site-guides/coding/_shared.js');
importScripts('site-guides/career/_shared.js');
importScripts('site-guides/gaming/_shared.js');
importScripts('site-guides/productivity/_shared.js');

// Per-site guides: E-Commerce
importScripts('site-guides/ecommerce/amazon.js');
importScripts('site-guides/ecommerce/ebay.js');
importScripts('site-guides/ecommerce/walmart.js');
importScripts('site-guides/ecommerce/target.js');
importScripts('site-guides/ecommerce/bestbuy.js');

// Per-site guides: Social Media
importScripts('site-guides/social/linkedin.js');
importScripts('site-guides/social/twitter.js');
importScripts('site-guides/social/facebook.js');
importScripts('site-guides/social/reddit.js');
importScripts('site-guides/social/instagram.js');
importScripts('site-guides/social/youtube.js');

// Per-site guides: Finance
importScripts('site-guides/finance/yahoo-finance.js');
importScripts('site-guides/finance/google-finance.js');
importScripts('site-guides/finance/tradingview.js');
importScripts('site-guides/finance/robinhood.js');
importScripts('site-guides/finance/coinbase.js');
importScripts('site-guides/finance/finviz.js');

// Per-site guides: Travel
importScripts('site-guides/travel/booking.js');
importScripts('site-guides/travel/expedia.js');
importScripts('site-guides/travel/airbnb.js');
importScripts('site-guides/travel/kayak.js');
importScripts('site-guides/travel/southwest.js');
importScripts('site-guides/travel/united.js');
importScripts('site-guides/travel/google-travel.js');

// Per-site guides: Email
importScripts('site-guides/email/gmail.js');
importScripts('site-guides/email/outlook.js');
importScripts('site-guides/email/yahoo-mail.js');

// Per-site guides: Coding
importScripts('site-guides/coding/leetcode.js');
importScripts('site-guides/coding/hackerrank.js');
importScripts('site-guides/coding/github.js');
importScripts('site-guides/coding/codeforces.js');
importScripts('site-guides/coding/geeksforgeeks.js');
importScripts('site-guides/coding/stackoverflow.js');

// Per-site guides: Career -- ATS base guides (load first)
importScripts('site-guides/career/workday.js');
importScripts('site-guides/career/greenhouse.js');
importScripts('site-guides/career/lever.js');
importScripts('site-guides/career/icims.js');
importScripts('site-guides/career/taleo.js');
// Third-party job boards
importScripts('site-guides/career/indeed.js');
importScripts('site-guides/career/glassdoor.js');
importScripts('site-guides/career/builtin.js');
// Per-company career guides (generated from research logs)
importScripts('site-guides/career/amazon.js');
importScripts('site-guides/career/amex.js');
importScripts('site-guides/career/apple.js');
importScripts('site-guides/career/att.js');
importScripts('site-guides/career/bankofamerica.js');
importScripts('site-guides/career/boeing.js');
importScripts('site-guides/career/capitalone.js');
importScripts('site-guides/career/citi.js');
importScripts('site-guides/career/costco.js');
importScripts('site-guides/career/cvshealth.js');
importScripts('site-guides/career/deloitte.js');
importScripts('site-guides/career/goldmansachs.js');
importScripts('site-guides/career/google-careers.js');
importScripts('site-guides/career/homedepot.js');
importScripts('site-guides/career/ibm.js');
importScripts('site-guides/career/jnj.js');
importScripts('site-guides/career/jpmorganchase.js');
importScripts('site-guides/career/lockheedmartin.js');
importScripts('site-guides/career/lowes.js');
importScripts('site-guides/career/mastercard.js');
importScripts('site-guides/career/mckesson.js');
importScripts('site-guides/career/meta.js');
importScripts('site-guides/career/microsoft.js');
importScripts('site-guides/career/morganstanley.js');
importScripts('site-guides/career/mrcooper.js');
importScripts('site-guides/career/nvidia.js');
importScripts('site-guides/career/openai.js');
importScripts('site-guides/career/oracle.js');
importScripts('site-guides/career/pfizer.js');
importScripts('site-guides/career/target.js');
importScripts('site-guides/career/tesla.js');
importScripts('site-guides/career/ti.js');
importScripts('site-guides/career/unitedhealthgroup.js');
importScripts('site-guides/career/verizon.js');
importScripts('site-guides/career/visa.js');
importScripts('site-guides/career/walmart.js');
// Generic ATS fallback (MUST be last -- matches broad /careers/ and /jobs/ patterns)
importScripts('site-guides/career/generic.js');

// Per-site guides: Gaming
importScripts('site-guides/gaming/steam.js');
importScripts('site-guides/gaming/epic-games.js');
importScripts('site-guides/gaming/gog.js');
importScripts('site-guides/gaming/humble-bundle.js');

// Per-site guides: Productivity
importScripts('site-guides/productivity/google-sheets.js');
importScripts('site-guides/productivity/google-docs.js');

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// Background agent modules (commented out; modules retired in v0.9.45rc1)
// importScripts('agents/agent-manager.js');
// importScripts('agents/agent-scheduler.js');
// importScripts('agents/agent-executor.js');
// importScripts('agents/server-sync.js');

// Agent loop engine modules (Phase 181: re-enable modular agent loop per D-01, D-02)
importScripts('ai/engine-config.js');
importScripts('ai/cost-tracker.js');
importScripts('ai/transcript-store.js');
importScripts('ai/hook-pipeline.js');
importScripts('ai/turn-result.js');
importScripts('ai/action-history.js');
importScripts('ai/session-schema.js');
importScripts('ai/permission-context.js');
importScripts('ai/hooks/safety-hooks.js');
importScripts('ai/hooks/permission-hook.js');
importScripts('ai/hooks/progress-hook.js');
importScripts('ai/tool-use-adapter.js');
importScripts('ai/tool-executor.js');
importScripts('ai/agent-loop.js');

// Memory layer modules
importScripts('lib/memory/memory-schemas.js');
importScripts('lib/memory/memory-storage.js');
importScripts('lib/memory/memory-retriever.js');
importScripts('lib/memory/memory-extractor.js');
importScripts('lib/memory/memory-manager.js');
importScripts('lib/memory/memory-consolidator.js');
importScripts('lib/memory/cross-site-patterns.js');

// Site map intelligence modules (Tier 1 converter + Tier 2 refiner)
importScripts('lib/memory/sitemap-converter.js');
importScripts('lib/memory/sitemap-refiner.js');

// Site map intelligence - bundled map cache
const bundledSiteMapCache = new Map();

// Content script module files in dependency order.
// Used by all file-based chrome.scripting.executeScript injection points.
// Order matters: init.js sets up the window.FSB namespace, utils.js provides
// shared helpers, then domain modules, then messaging/lifecycle which depend on all above.
const CONTENT_SCRIPT_FILES = [
  // Phase 211-03 diagnostic logging helpers MUST load FIRST so that any
  // downstream content-script .catch handlers can call rateLimitedWarn /
  // redactForLog / logDebugToRing without ReferenceError.
  'utils/diagnostics-ring-buffer.js',
  'utils/redactForLog.js',
  'utils/automation-logger.js',
  'content/init.js',
  'content/utils.js',
  'content/dom-state.js',
  'content/selectors.js',
  'content/badge-combine.js',
  'content/visual-feedback.js',
  'content/trigger-observe.js',
  'content/accessibility.js',
  'content/actions.js',
  'content/dom-analysis.js',
  'content/messaging.js',
  'content/lifecycle.js'
];

const FSB_TRIGGER_OBSERVE_WATCHDOG_PREFIX = 'fsbTriggerObserveWatchdog:';
const FSB_TRIGGER_OBSERVE_WATCHDOG_PERIOD_MINUTES = 1;
const FSB_TRIGGER_OBSERVE_STALE_MS = FSB_TRIGGER_OBSERVE_WATCHDOG_PERIOD_MINUTES * 60 * 1000 * 2;
const FSB_TRIGGER_REPORTED_TEXT_MAX = 10000;

async function loadBundledSiteMap(domain) {
  if (bundledSiteMapCache.has(domain)) {
    return bundledSiteMapCache.get(domain);
  }

  const lookupDomain = domain.replace(/^www\./, '');

  for (const d of [lookupDomain, domain]) {
    try {
      const url = chrome.runtime.getURL(`site-maps/${d}.json`);
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        bundledSiteMapCache.set(domain, data);
        return data;
      }
    } catch (e) {
      // File not found, continue
    }
  }

  bundledSiteMapCache.set(domain, null);
  return null;
}

/**
 * Check whether a site map exists for a given domain (bundled or memory).
 * Returns { exists: boolean, source: 'bundled' | 'memory' | null }
 */
async function hasSiteMapForDomain(domain) {
  // Check pre-bundled maps
  const bundled = await loadBundledSiteMap(domain);
  if (bundled) return { exists: true, source: 'bundled' };

  // Check memory system
  if (typeof memoryManager !== 'undefined') {
    try {
      const allMemories = await memoryManager.getAll();
      const match = allMemories.find(m =>
        m.typeData?.category === 'site_map' &&
        m.metadata?.domain === domain
      );
      if (match) return { exists: true, source: 'memory' };
    } catch (e) {
      // Memory lookup failed, treat as not found
    }
  }

  return { exists: false, source: null };
}

// Crawler Manager - orchestrates multiple concurrent SiteExplorer instances
const crawlerManager = new CrawlerManager();

// Debug mode flag (controlled by options page toggle)
let fsbDebugMode = false;

/**
 * Extract and store long-term memories from a completed session.
 * Non-blocking, fire-and-forget. Safe to call for both successful and failed sessions.
 * @param {string} sessionId
 * @param {Object} session
 */
async function extractAndStoreMemories(sessionId, session) {
  try {
    // Synchronously snapshot AI instance data before any await.
    // cleanupSession may delete the AI instance after the first await,
    // so we must capture hardFacts, sessionMemory, and compactedSummary now.
    const ai = sessionAIInstances.get(sessionId);
    if (ai) {
      session._enrichedData = {
        hardFacts: ai.hardFacts ? {
          taskGoal: ai.hardFacts.taskGoal || '',
          criticalActions: [...(ai.hardFacts.criticalActions || [])],
          workingSelectors: { ...(ai.hardFacts.workingSelectors || {}) }
        } : null,
        sessionMemory: ai.sessionMemory ? {
          taskGoal: ai.sessionMemory.taskGoal || '',
          stepsCompleted: [...(ai.sessionMemory.stepsCompleted || [])],
          failedApproaches: [...(ai.sessionMemory.failedApproaches || [])]
        } : null,
        compactedSummary: ai.compactedSummary || null
      };
    }

    // Extract domain from session URL or action history
    let domain = null;
    if (session.actionHistory) {
      for (const action of session.actionHistory) {
        if (action.params?.url) {
          try { domain = new URL(action.params.url).hostname; } catch {}
          if (domain) break;
        }
      }
    }

    // Fallback: use session.lastUrl when no navigate URL found in actionHistory
    if (!domain && session.lastUrl) {
      try { domain = new URL(session.lastUrl).hostname; } catch {}
    }

    const memories = await memoryManager.add(session, { domain });
    if (memories.length > 0) {
      debugLog('Extracted memories from session', {
        sessionId,
        count: memories.length,
        types: memories.map(m => m.type)
      });
    }
  } catch (error) {
    // Non-critical: log and move on
    console.warn('[FSB] Memory extraction failed for session', sessionId, error.message);
  }
}

/**
 * Debug logging helper - only logs when debug mode is enabled
 * @param {string} message - Debug message
 * @param {*} data - Optional data to log
 */
function debugLog(message, data) {
  if (fsbDebugMode) {
    if (data !== undefined) {
      console.log('[FSB DEBUG]', message, data);
    } else {
      console.log('[FSB DEBUG]', message);
    }
  }
}

/**
 * Simplify a status message for user display.
 * Truncates to a short, clean one-liner.
 * @param {string} msg - Raw status message
 * @param {number} maxLen - Maximum character length (default 60)
 * @returns {string} Simplified message
 */
function simplifyStatus(msg, maxLen = 60) {
  if (!msg || typeof msg !== 'string') return 'Working...';
  // Strip leading/trailing whitespace
  let clean = msg.trim();
  // If already short, return as-is
  if (clean.length <= maxLen) return clean;
  // Truncate at last word boundary within limit
  const truncated = clean.substring(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 20 ? truncated.substring(0, lastSpace) : truncated) + '...';
}

/**
 * Generate a human-readable status string from an action's tool and params.
 * Replaces AI-generated currentStep/description fields to save tokens.
 * @param {string} tool - The action tool name
 * @param {Object} params - The action parameters
 * @returns {string} Short status string for UI display
 */
function getActionStatus(tool, params) {
  const label = (p) => shorten(p?.text || p?.ariaLabel || p?.placeholder || p?.selector, 25);
  switch (tool) {
    case 'click': {
      const t = label(params);
      return t ? `Clicking "${t}"` : 'Clicking element';
    }
    case 'type': {
      const val = shorten(params?.text, 25);
      const field = params?.placeholder ? ` into ${shorten(params.placeholder, 20)}` : '';
      return val ? `Typing "${val}"${field}` : 'Entering text';
    }
    case 'pressEnter':     return 'Submitting';
    case 'navigate': {
      const url = params?.url;
      if (url) {
        try { return `Opening ${shorten(new URL(url).hostname + new URL(url).pathname, 25)}`; }
        catch { return `Opening ${shorten(url, 25)}`; }
      }
      return 'Opening page';
    }
    case 'searchGoogle':   return `Looking up "${shorten(params?.query)}"`;
    case 'scroll':         return 'Scrolling';
    case 'getText':        return 'Reading content';
    case 'getAttribute':   return 'Inspecting page';
    case 'selectOption': {
      const opt = shorten(params?.optionText || params?.value, 25);
      return opt ? `Selecting "${opt}"` : 'Selecting option';
    }
    case 'toggleCheckbox': {
      const cb = shorten(params?.label || params?.ariaLabel || params?.text, 25);
      return cb ? `Toggling "${cb}"` : 'Toggling checkbox';
    }
    case 'hover': {
      const h = label(params);
      return h ? `Hovering over "${h}"` : 'Hovering';
    }
    case 'focus': {
      const f = shorten(params?.placeholder || params?.ariaLabel || params?.selector, 25);
      return f ? `Focusing "${f}"` : 'Focusing field';
    }
    case 'clearInput': {
      const c = shorten(params?.placeholder || params?.ariaLabel || params?.selector, 25);
      return c ? `Clearing "${c}"` : 'Clearing field';
    }
    case 'waitForElement': {
      const w = shorten(params?.selector, 25);
      return w ? `Waiting for ${w}` : 'Waiting for element';
    }
    case 'doubleClick': {
      const d = label(params);
      return d ? `Double-clicking "${d}"` : 'Double-clicking';
    }
    case 'rightClick': {
      const r = label(params);
      return r ? `Right-clicking "${r}"` : 'Right-clicking';
    }
    case 'goBack':         return 'Going back';
    case 'goForward':      return 'Going forward';
    case 'refresh':        return 'Refreshing';
    case 'moveMouse':      return 'Moving cursor';
    case 'keyPress':       return `Pressing ${params?.key || 'key'}`;
    case 'selectText':     return 'Selecting text';
    case 'setAttribute':   return 'Updating page';
    case 'solveCaptcha':   return 'Solving captcha';
    case 'openNewTab':     return 'Opening new tab';
    case 'switchToTab':    return 'Switching tab';
    case 'closeTab':       return 'Closing tab';
    case 'listTabs':       return 'Checking tabs';
    default:               return 'Working';
  }
}

/**
 * Shorten a text string for display (used for search queries)
 * @param {string} text - Text to shorten
 * @param {number} max - Maximum length
 * @returns {string} Shortened text
 */
function shorten(text, max = 30) {
  if (!text || typeof text !== 'string') return '';
  return text.length > max ? text.substring(0, max) + '...' : text;
}

/**
 * Send phase:'ended' to ALL tabs that may have an active session overlay.
 * This covers the current tab AND the previous tab (if a tab switch occurred
 * and previousTabId is still set). Clears previousTabId after cleanup.
 *
 * Use this instead of calling sendSessionStatus(session.tabId, { phase: 'ended', ... })
 * directly, to avoid leaving stale overlays on tabs the session previously occupied.
 *
 * @param {Object} session - The session object from activeSessions
 * @param {string} reason - The reason string (e.g. 'complete', 'stopped', 'error', 'timeout', ...)
 */
async function endSessionOverlays(session, reason) {
  const tabId = session.tabId || session.originalTabId;
  await sendSessionStatus(tabId, { phase: 'ended', reason });

  if (session.previousTabId && session.previousTabId !== tabId) {
    await sendSessionStatus(session.previousTabId, { phase: 'ended', reason: 'tab_switch' });
    session.previousTabId = null;
  }
}

/**
 * Send session status to content script for visual feedback (viewport glow + progress overlay).
 * Targets the main frame only (frameId: 0) to avoid iframe interference.
 * Retries once with content-script re-injection on failure.
 * @param {number} tabId - Target tab ID
 * @param {Object} statusData - Status fields: phase, taskName, iteration, maxIterations, reason, animatedHighlights
 */
async function sendSessionStatus(tabId, statusData) {
  // Build proper overlayState object that content script expects (messaging.js:1110)
  // Content script reads request.overlayState, not flat fields
  const session = null; // session context is optional for buildOverlayState
  const overlayState = (typeof FSBOverlayStateUtils !== 'undefined' && FSBOverlayStateUtils.buildOverlayState)
    ? FSBOverlayStateUtils.buildOverlayState(statusData, session)
    : statusData; // fallback: send raw data if overlay-state.js failed to load
  const payload = { action: 'sessionStatus', overlayState };
  try {
    await chrome.tabs.sendMessage(tabId, payload, { frameId: 0 });
  } catch (firstErr) {
    // First attempt failed -- try re-injecting the content script and retry once
    try {
      await ensureContentScriptInjected(tabId, 1);
      await chrome.tabs.sendMessage(tabId, payload, { frameId: 0 });
    } catch (retryErr) {
      automationLogger.debug('sendSessionStatus delivery failed', {
        tabId, phase: statusData.phase, error: retryErr.message
      });
    }
  }
}

function getMcpVisualSessionManager() {
  if (!mcpVisualSessionManager) {
    throw new Error('MCP visual session manager unavailable');
  }
  return mcpVisualSessionManager;
}

function getMcpVisualSessionFinalClearDelayMs() {
  const delay = Number(MCP_VISUAL_SESSION_FINAL_CLEAR_DELAY_MS);
  return Number.isFinite(delay) && delay > 0 ? delay : 3200;
}

function clearPendingMcpVisualSessionFinalization(sessionToken) {
  const token = String(sessionToken || '').trim();
  if (!token) return false;
  const pending = mcpVisualSessionFinalizationTimers.get(token);
  if (!pending) return false;
  clearTimeout(pending.timerId);
  mcpVisualSessionFinalizationTimers.delete(token);
  return true;
}

function isMcpVisualSessionFinalizing(sessionToken) {
  const token = String(sessionToken || '').trim();
  return !!token && mcpVisualSessionFinalizationTimers.has(token);
}

function buildMcpVisualSessionNotFoundError(sessionToken) {
  return {
    success: false,
    errorCode: 'visual_session_not_found',
    error: 'The visual-session token does not match an active client-owned visual session',
    sessionToken: sessionToken || null,
  };
}

function isContentSurfaceReadyForTab(tabId) {
  if (!Number.isFinite(tabId) || tabId <= 0) return false;
  const portInfo = contentScriptPorts.get(tabId);
  if (portInfo && Date.now() - portInfo.lastHeartbeat < 10000) {
    return true;
  }
  const readyStatus = contentScriptReadyStatus.get(tabId);
  return !!(readyStatus && readyStatus.ready);
}

async function readPersistedMcpVisualSessions() {
  try {
    const stored = await chrome.storage.session.get([MCP_VISUAL_SESSION_STORAGE_KEY]);
    const records = stored?.[MCP_VISUAL_SESSION_STORAGE_KEY];
    return records && typeof records === 'object' ? records : {};
  } catch (error) {
    automationLogger.warn('Failed to read persisted MCP visual sessions', {
      error: error?.message || String(error),
    });
    return {};
  }
}

async function writePersistedMcpVisualSessions(records) {
  try {
    const nextRecords = records && typeof records === 'object' ? records : {};
    if (Object.keys(nextRecords).length === 0) {
      await chrome.storage.session.remove(MCP_VISUAL_SESSION_STORAGE_KEY);
      return;
    }
    await chrome.storage.session.set({
      [MCP_VISUAL_SESSION_STORAGE_KEY]: nextRecords,
    });
  } catch (error) {
    automationLogger.warn('Failed to write persisted MCP visual sessions', {
      error: error?.message || String(error),
    });
  }
}

async function persistMcpVisualSessionRecord(session) {
  const record = serializeMcpVisualSessionRecord(session);
  if (!record?.sessionToken) return null;
  const records = await readPersistedMcpVisualSessions();
  records[record.sessionToken] = record;
  await writePersistedMcpVisualSessions(records);
  return record;
}

async function removePersistedMcpVisualSessionRecord(sessionToken) {
  const token = String(sessionToken || '').trim();
  if (!token) return false;
  const records = await readPersistedMcpVisualSessions();
  if (!Object.prototype.hasOwnProperty.call(records, token)) {
    return false;
  }
  delete records[token];
  await writePersistedMcpVisualSessions(records);
  return true;
}

async function clearMcpVisualSession(sessionToken, options = {}) {
  const manager = getMcpVisualSessionManager();
  if (!options.skipTimerCancel) {
    clearPendingMcpVisualSessionFinalization(sessionToken);
  }

  const clearedSession = manager.endSession(sessionToken, {
    reason: options.reason,
    lastUpdateAt: options.lastUpdateAt,
  });
  if (!clearedSession) {
    await removePersistedMcpVisualSessionRecord(sessionToken);
    return null;
  }

  await removePersistedMcpVisualSessionRecord(clearedSession.sessionToken);

  if (!options.skipStatusBroadcast) {
    await sendSessionStatus(
      clearedSession.tabId,
      buildMcpVisualSessionClearStatus(clearedSession, {
        reason: options.reason,
      }),
    );
  }

  return clearedSession;
}

function scheduleMcpVisualSessionClear(sessionToken, options = {}) {
  const token = String(sessionToken || '').trim();
  if (!token) return 0;

  clearPendingMcpVisualSessionFinalization(token);

  const requestedDelayMs = Number(options.delayMs);
  const delayMs = Number.isFinite(requestedDelayMs) && requestedDelayMs >= 0
    ? requestedDelayMs
    : getMcpVisualSessionFinalClearDelayMs();
  const timerId = setTimeout(async () => {
    mcpVisualSessionFinalizationTimers.delete(token);
    try {
      await clearMcpVisualSession(token, {
        reason: options.reason,
        skipTimerCancel: true,
      });
    } catch (error) {
      automationLogger.debug('MCP visual-session clear failed', {
        sessionToken: token,
        error: error?.message || String(error),
      });
    }
  }, delayMs);

  mcpVisualSessionFinalizationTimers.set(token, {
    timerId,
    reason: options.reason || 'ended',
    scheduledAt: Date.now(),
    clearAt: Date.now() + delayMs,
  });

  return delayMs;
}

async function replayMcpVisualSessionForTab(tabId, options = {}) {
  if (!Number.isFinite(tabId) || tabId <= 0) return null;

  const manager = getMcpVisualSessionManager();
  const sessionToken = manager.getTokenForTab(tabId);
  if (!sessionToken) return null;

  const session = manager.getSession(sessionToken);
  if (!session) {
    await removePersistedMcpVisualSessionRecord(sessionToken);
    return null;
  }

  const replayPlan = planMcpVisualSessionReplay(session, {
    now: Number.isFinite(options.now) ? options.now : Date.now(),
  });
  if (replayPlan.action === 'clear') {
    await clearMcpVisualSession(sessionToken, {
      reason: replayPlan.reason,
      lastUpdateAt: Number.isFinite(options.now) ? options.now : Date.now(),
    });
    return {
      cleared: true,
      reason: replayPlan.reason,
      sessionToken,
    };
  }

  if (replayPlan.mode === 'final' && !isMcpVisualSessionFinalizing(sessionToken)) {
    scheduleMcpVisualSessionClear(sessionToken, {
      reason: session.finalClearReason || session.reason || 'complete',
      delayMs: replayPlan.clearAfterMs,
    });
  }

  await sendSessionStatus(tabId, replayPlan.status);
  return {
    replayed: true,
    mode: replayPlan.mode,
    sessionToken,
    version: replayPlan.session?.version || session.version,
  };
}

async function restorePersistedMcpVisualSessions() {
  if (!mcpVisualSessionManager) return;

  const manager = getMcpVisualSessionManager();
  const now = Date.now();
  const storedRecords = await readPersistedMcpVisualSessions();
  const nextRecords = {};
  const entries = Object.values(storedRecords).sort((left, right) => {
    const leftTime = Number(left?.lastUpdateAt) || 0;
    const rightTime = Number(right?.lastUpdateAt) || 0;
    return leftTime - rightTime;
  });

  for (const rawRecord of entries) {
    const replayPlan = planMcpVisualSessionReplay(rawRecord, { now });
    const rawToken = String(rawRecord?.sessionToken || '').trim();

    if (replayPlan.action !== 'replay' || !replayPlan.session?.sessionToken) {
      await clearMcpVisualSession(rawToken || replayPlan.session?.sessionToken, {
        reason: replayPlan.reason || 'timeout',
        lastUpdateAt: now,
        skipStatusBroadcast: true,
      });
      continue;
    }

    const restored = manager.restoreSession(replayPlan.session);
    if (!restored?.session) continue;

    if (restored.replacedSession?.sessionToken) {
      clearPendingMcpVisualSessionFinalization(restored.replacedSession.sessionToken);
      delete nextRecords[restored.replacedSession.sessionToken];
    }

    nextRecords[restored.session.sessionToken] = serializeMcpVisualSessionRecord(restored.session);

    if (replayPlan.mode === 'final') {
      scheduleMcpVisualSessionClear(restored.session.sessionToken, {
        reason: restored.session.finalClearReason || restored.session.reason || 'complete',
        delayMs: replayPlan.clearAfterMs,
      });
    }

    if (isContentSurfaceReadyForTab(restored.session.tabId)) {
      await replayMcpVisualSessionForTab(restored.session.tabId, { now });
    }
  }

  await writePersistedMcpVisualSessions(nextRecords);
  automationLogger.debug('MCP visual sessions restored', {
    count: Object.keys(nextRecords).length,
  });
}

// Phase 237 -- Agent Registry boot.
// Hydrates registry from chrome.storage.session and reconciles against live tabs.
// Idempotent: subsequent calls within the same SW lifetime are no-ops.
// Failure mode: log via rateLimitedWarn and continue; never poison SW startup.
async function bootstrapAgentRegistry() {
  if (!globalThis.FsbAgentRegistry || !globalThis.FsbAgentRegistry.AgentRegistry) return;
  if (!globalThis.fsbAgentRegistryInstance) {
    globalThis.fsbAgentRegistryInstance = new globalThis.FsbAgentRegistry.AgentRegistry();
  }
  try {
    await globalThis.fsbAgentRegistryInstance.hydrate();
  } catch (err) {
    if (typeof globalThis.rateLimitedWarn === 'function') {
      globalThis.rateLimitedWarn(
        'AGT',
        'hydrate-failed',
        'agent registry hydrate failed',
        typeof globalThis.redactForLog === 'function' ? globalThis.redactForLog(err) : { kind: 'error' }
      );
    }
  }
}

function findActiveAutomationSessionForTab(tabId) {
  if (!Number.isFinite(tabId)) return null;
  for (const session of activeSessions.values()) {
    if (!session || session.isBackgroundAgent) continue;
    if (session.tabId === tabId || session.originalTabId === tabId || session.previousTabId === tabId) {
      return session;
    }
  }
  return null;
}

// QT-uof-6 (A-FIX) -- Chrome 141+ sidePanel.close auto-collapse with
// per-window has-any-working-tab gate. See .planning/debug/cluster1-routing.md
// Cluster 2 leftover items + memory file project_chrome_sidepanel_no_close.md
// (amended in this same commit with an EXCEPTION block for the Chrome 141+
// close() API).
//
// Pre-Chrome-141: silently skip (feature-detect via typeof). The original
// memory prohibition on setOptions({tabId, enabled:false}) STILL stands --
// this listener uses chrome.sidePanel.close({windowId}), which is a
// SEPARATE API added in Chrome 141+ that operates per-window and DOES
// close the panel reliably even when the manifest declares
// side_panel.default_path.
//
// Per-window gate: if ANY tab in the activated tab's window has an active
// automation session (e.g., user switches from working Tab A to non-working
// Tab B in the SAME window), DO NOT close -- Tab A's panel must stay
// visible. Only close when NO tab in the window has an active session.
chrome.tabs.onActivated.addListener(async function (activeInfo) {
  try {
    if (typeof chrome.sidePanel === 'undefined') return;
    if (typeof chrome.sidePanel.close !== 'function') return; // pre-Chrome-141

    var activatedTabId = activeInfo && activeInfo.tabId;
    var activatedWindowId = activeInfo && activeInfo.windowId;
    if (typeof activatedTabId !== 'number' || typeof activatedWindowId !== 'number') return;

    // Per-window has-any-working-tab gate.
    var tabsInWindow = await chrome.tabs.query({ windowId: activatedWindowId });
    var anyWorking = false;
    for (var i = 0; i < tabsInWindow.length; i++) {
      var t = tabsInWindow[i];
      if (t && typeof t.id === 'number' && findActiveAutomationSessionForTab(t.id)) {
        anyWorking = true;
        break;
      }
    }
    if (anyWorking) return; // keep panel visible -- some tab in this window still working

    // No working tab in this window -- close the panel.
    try {
      await chrome.sidePanel.close({ windowId: activatedWindowId });
    } catch (closeErr) {
      console.warn('[FSB] chrome.sidePanel.close failed (non-fatal)', closeErr && closeErr.message);
    }
  } catch (outerErr) {
    console.warn('[FSB] chrome.tabs.onActivated A-FIX handler error', outerErr && outerErr.message);
  }
});

async function updateMcpVisualSessionProgress(sessionToken, message) {
  const manager = getMcpVisualSessionManager();
  if (isMcpVisualSessionFinalizing(sessionToken)) {
    return null;
  }

  const now = Date.now();
  const updatedSession = manager.updateSession(sessionToken, {
    detail: message,
    lastUpdateAt: now,
    phase: 'acting',
    lifecycle: 'running',
    statusText: message,
    taskSummary: '',
    result: '',
    reason: '',
    display: null,
    progress: null,
    animatedHighlights: true,
    finalClearAt: null,
    finalClearReason: '',
  });
  if (!updatedSession) {
    return null;
  }

  await persistMcpVisualSessionRecord(updatedSession);
  await sendSessionStatus(updatedSession.tabId, buildMcpVisualSessionStatus(updatedSession));

  return updatedSession;
}

async function finalizeMcpVisualSession(sessionToken, options = {}) {
  const manager = getMcpVisualSessionManager();
  if (isMcpVisualSessionFinalizing(sessionToken)) {
    return null;
  }

  const currentSession = manager.getSession(sessionToken);
  if (!currentSession) {
    return null;
  }

  const result = options.result === 'partial'
    ? 'partial'
    : (options.result === 'error' ? 'error' : 'success');
  const summary = String(options.summary || '').trim();
  const blocker = String(options.blocker || '').trim();
  const nextStep = String(options.nextStep || '').trim();
  const reason = String(options.reason || '').trim();
  const now = Date.now();

  let statusText = summary || currentSession.detail || currentSession.task;
  let taskSummary = summary || currentSession.task;
  let phase = result === 'error' ? 'error' : 'complete';
  let display = null;
  let progress = null;

  if (result === 'success') {
    statusText = summary || 'Task completed';
    display = {
      title: taskSummary,
      subtitle: currentSession.task && currentSession.task !== taskSummary ? currentSession.task : 'Completed',
      detail: 'Task completed',
    };
  } else if (result === 'partial') {
    statusText = blocker || summary || 'Task partially completed';
    display = {
      title: taskSummary,
      subtitle: blocker || 'External blocker',
      detail: nextStep || reason || 'Manual follow-up required',
    };
    progress = { mode: 'indeterminate', label: 'Partial' };
  } else {
    statusText = reason || 'Task ended with an error';
    taskSummary = currentSession.task;
    display = {
      title: currentSession.task,
      subtitle: 'Task failed',
      detail: reason || 'Task ended with an error',
    };
    progress = { mode: 'indeterminate', label: 'Error' };
  }

  const clearReason = result === 'success'
    ? 'complete'
    : (result === 'partial' ? (reason || 'partial') : (reason || 'error'));
  const finalClearAt = now + getMcpVisualSessionFinalClearDelayMs();

  const finalizedSession = manager.updateSession(sessionToken, {
    detail: statusText,
    lastUpdateAt: now,
    phase,
    lifecycle: 'final',
    result,
    statusText,
    taskSummary,
    reason: reason || '',
    display: display || null,
    progress: progress || null,
    animatedHighlights: false,
    finalClearAt,
    finalClearReason: clearReason,
  });
  if (!finalizedSession) {
    return null;
  }

  await persistMcpVisualSessionRecord(finalizedSession);
  await sendSessionStatus(finalizedSession.tabId, buildMcpVisualSessionStatus(finalizedSession));
  const clearsAfterMs = scheduleMcpVisualSessionClear(finalizedSession.sessionToken, {
    reason: clearReason,
    delayMs: Math.max(0, finalClearAt - now),
  });

  return {
    session: finalizedSession,
    clearsAfterMs,
  };
}

async function handleMcpVisualSessionTaskStatus(request, sender, sendResponse) {
  try {
    const tool = String(request?.tool || '').trim();
    const sessionToken = String(request?.sessionToken || request?.session_token || '').trim();
    if (!sessionToken) {
      sendResponse({
        success: false,
        errorCode: 'mcp_route_invalid_params',
        error: `${tool || 'visual-session task status'} requires sessionToken`,
      });
      return true;
    }

    if (tool === 'report_progress') {
      const message = String(request?.message || '').trim();
      if (!message) {
        sendResponse({
          success: false,
          errorCode: 'mcp_route_invalid_params',
          error: 'report_progress requires message',
        });
        return true;
      }

      const updatedSession = await updateMcpVisualSessionProgress(sessionToken, message);
      if (!updatedSession) {
        sendResponse(buildMcpVisualSessionNotFoundError(sessionToken));
        return true;
      }

      sendResponse({
        success: true,
        tool: 'report_progress',
        hadEffect: true,
        message,
        sessionToken: updatedSession.sessionToken,
        version: updatedSession.version,
        clientLabel: updatedSession.clientLabel,
        tabId: updatedSession.tabId,
      });
      return true;
    }

    if (tool === 'complete_task') {
      const summary = String(request?.summary || '').trim();
      if (!summary) {
        sendResponse({
          success: false,
          errorCode: 'mcp_route_invalid_params',
          error: 'complete_task requires summary',
        });
        return true;
      }

      const finalized = await finalizeMcpVisualSession(sessionToken, {
        result: 'success',
        summary,
      });
      if (!finalized?.session) {
        sendResponse(buildMcpVisualSessionNotFoundError(sessionToken));
        return true;
      }

      sendResponse({
        success: true,
        tool: 'complete_task',
        status: 'completed',
        hadEffect: true,
        summary,
        sessionToken: finalized.session.sessionToken,
        version: finalized.session.version,
        clientLabel: finalized.session.clientLabel,
        tabId: finalized.session.tabId,
        clearsAfterMs: finalized.clearsAfterMs,
      });
      return true;
    }

    if (tool === 'partial_task') {
      const summary = String(request?.summary || '').trim();
      const blocker = String(request?.blocker || '').trim();
      const nextStep = String(request?.nextStep || request?.next_step || '').trim();
      const reason = String(request?.reason || '').trim();
      if (!summary || !blocker) {
        sendResponse({
          success: false,
          errorCode: 'mcp_route_invalid_params',
          error: 'partial_task requires summary and blocker',
        });
        return true;
      }

      const finalized = await finalizeMcpVisualSession(sessionToken, {
        result: 'partial',
        summary,
        blocker,
        nextStep,
        reason,
      });
      if (!finalized?.session) {
        sendResponse(buildMcpVisualSessionNotFoundError(sessionToken));
        return true;
      }

      sendResponse({
        success: true,
        tool: 'partial_task',
        status: 'partial',
        hadEffect: true,
        summary,
        blocker,
        ...(nextStep ? { nextStep } : {}),
        ...(reason ? { reason } : {}),
        sessionToken: finalized.session.sessionToken,
        version: finalized.session.version,
        clientLabel: finalized.session.clientLabel,
        tabId: finalized.session.tabId,
        clearsAfterMs: finalized.clearsAfterMs,
      });
      return true;
    }

    if (tool === 'fail_task') {
      const reason = String(request?.reason || '').trim();
      if (!reason) {
        sendResponse({
          success: false,
          errorCode: 'mcp_route_invalid_params',
          error: 'fail_task requires reason',
        });
        return true;
      }

      const finalized = await finalizeMcpVisualSession(sessionToken, {
        result: 'error',
        reason,
      });
      if (!finalized?.session) {
        sendResponse(buildMcpVisualSessionNotFoundError(sessionToken));
        return true;
      }

      sendResponse({
        success: false,
        tool: 'fail_task',
        status: 'failed',
        hadEffect: true,
        error: reason,
        reason,
        sessionToken: finalized.session.sessionToken,
        version: finalized.session.version,
        clientLabel: finalized.session.clientLabel,
        tabId: finalized.session.tabId,
        clearsAfterMs: finalized.clearsAfterMs,
      });
      return true;
    }

    sendResponse({
      success: false,
      errorCode: 'mcp_route_invalid_params',
      error: `Unsupported visual-session task status tool: ${tool || 'unknown'}`,
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message || String(error),
    });
  }
  return true;
}

async function handleStartMcpVisualSession(request, sender, sendResponse) {
  try {
    const manager = getMcpVisualSessionManager();
    const tabId = Number.isFinite(request?.tabId)
      ? Number(request.tabId)
      : (Number.isFinite(sender?.tab?.id) ? Number(sender.tab.id) : null);

    if (!Number.isFinite(tabId) || tabId <= 0) {
      sendResponse({
        success: false,
        errorCode: 'no_active_tab',
        error: 'No active tab available for visual session',
      });
      return true;
    }

    const clientLabel = normalizeMcpVisualClientLabel(request?.clientLabel);
    if (!clientLabel) {
      sendResponse({
        success: false,
        errorCode: 'invalid_client_label',
        error: 'Unapproved MCP client label',
        clientLabel: request?.clientLabel || null,
        allowedClients: getAllowedMcpVisualClientLabels(),
      });
      return true;
    }

    const task = String(request?.task || '').trim();
    if (!task) {
      sendResponse({
        success: false,
        errorCode: 'mcp_route_invalid_params',
        error: 'start_visual_session requires task',
      });
      return true;
    }

    let tab = null;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch (_) {
      tab = null;
    }

    const tabUrl = tab?.url || '';
    if (isRestrictedURL(tabUrl)) {
      sendResponse({
        success: false,
        errorCode: 'restricted_active_tab',
        error: 'Active tab is restricted',
        currentUrl: tabUrl,
        pageType: typeof getPageTypeDescriptionForMcp === 'function'
          ? getPageTypeDescriptionForMcp(tabUrl)
          : 'Restricted page',
        tool: 'start_visual_session',
        validRecoveryTools: ['navigate', 'open_tab', 'switch_tab', 'list_tabs'],
      });
      return true;
    }

    if (findActiveAutomationSessionForTab(tabId)) {
      sendResponse({
        success: false,
        errorCode: 'visual_surface_busy',
        error: 'FSB automation already owns the active visual surface on this tab',
        tabId,
      });
      return true;
    }

    const started = manager.startSession({
      clientLabel,
      tabId,
      task,
      detail: request?.detail,
      // Phase 240 D-09: thread agentId so the cross-agent reject /
      // same-agent resume branch in McpVisualSessionManager.startSession
      // fires on production dispatch (not just direct unit-test calls).
      agentId: typeof request?.agentId === 'string' && request.agentId ? request.agentId : null,
    });
    if (!started?.session) {
      sendResponse({
        success: false,
        errorCode: started?.errorCode || 'action_rejected',
        error: 'Failed to start MCP visual session',
        clientLabel,
      });
      return true;
    }

    if (started.replacedSession?.sessionToken) {
      clearPendingMcpVisualSessionFinalization(started.replacedSession.sessionToken);
      await removePersistedMcpVisualSessionRecord(started.replacedSession.sessionToken);
    }

    const startedSession = manager.updateSession(started.session.sessionToken, {
      lastUpdateAt: Date.now(),
      phase: 'planning',
      lifecycle: 'running',
      statusText: request?.detail || 'Ready to begin',
      taskSummary: '',
      result: '',
      reason: '',
      display: null,
      progress: null,
      animatedHighlights: true,
      finalClearAt: null,
      finalClearReason: '',
    }) || started.session;

    await persistMcpVisualSessionRecord(startedSession);
    await sendSessionStatus(tabId, buildMcpVisualSessionStatus(startedSession));

    sendResponse({
      success: true,
      sessionToken: startedSession.sessionToken,
      clientLabel: startedSession.clientLabel,
      tabId: startedSession.tabId,
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message || String(error),
    });
  }
  return true;
}

async function handleEndMcpVisualSession(request, sender, sendResponse) {
  try {
    const sessionToken = String(request?.sessionToken || request?.session_token || '').trim();
    if (!sessionToken) {
      sendResponse({
        success: false,
        errorCode: 'mcp_route_invalid_params',
        error: 'end_visual_session requires sessionToken',
      });
      return true;
    }

    clearPendingMcpVisualSessionFinalization(sessionToken);

    const clearedSession = await clearMcpVisualSession(sessionToken, {
      reason: request?.reason,
    });

    if (!clearedSession) {
      sendResponse({
        success: true,
        sessionToken,
        cleared: false,
        ignored: true,
      });
      return true;
    }

    sendResponse({
      success: true,
      sessionToken: clearedSession.sessionToken,
      cleared: true,
      tabId: clearedSession.tabId,
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message || String(error),
    });
  }
  return true;
}

if (typeof globalThis !== 'undefined') {
  globalThis.handleStartMcpVisualSession = handleStartMcpVisualSession;
  globalThis.handleEndMcpVisualSession = handleEndMcpVisualSession;
  globalThis.handleMcpVisualSessionTaskStatus = handleMcpVisualSessionTaskStatus;
}

/**
 * Load debug mode setting from storage
 */
async function loadDebugMode() {
  try {
    const stored = await chrome.storage.local.get(['debugMode']);
    fsbDebugMode = stored.debugMode === true;
    debugLog('Debug mode ' + (fsbDebugMode ? 'enabled' : 'disabled'));
  } catch (e) {
    fsbDebugMode = false;
  }
}

/**
 * Wrapper for chrome.storage.local.get() with timeout to prevent indefinite hanging
 * @param {Array|Object|string} keys - Storage keys to retrieve
 * @param {number} timeout - Timeout in milliseconds (default 3000)
 * @param {Object} defaults - Default values if storage read fails or times out
 * @returns {Promise<Object>} Storage data or defaults
 */
async function getStorageWithTimeout(keys, timeout = 3000, defaults = {}) {
  try {
    const storagePromise = chrome.storage.local.get(keys);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Storage read timeout')), timeout)
    );

    const result = await Promise.race([storagePromise, timeoutPromise]);
    return result;
  } catch (error) {
    automationLogger.warn('Storage read failed or timed out, using defaults', {
      error: error.message,
      keys
    });
    return defaults;
  }
}

// PART 3: Helper function to format duration for session elapsed timer
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSecs = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${remainingSecs}s`;
  }
  return `${seconds}s`;
}

/**
 * Calculate progress percentage and estimated time remaining for a session.
 * @param {Object} session - Active automation session
 * @returns {{ progressPercent: number, estimatedTimeRemaining: string|null }}
 */
function calculateProgress(session) {
  const maxIter = session.maxIterations || 100;
  const current = session.iterationCount || 0;
  const progressPercent = Math.min(99, Math.round((current / maxIter) * 100));

  let estimatedTimeRemaining = null;
  if (current > 0 && session.startTime) {
    const elapsed = Date.now() - session.startTime;
    const avgPerIteration = elapsed / current;
    const remaining = (maxIter - current) * avgPerIteration;
    if (remaining > 0) {
      estimatedTimeRemaining = formatETA(remaining);
    }
  }
  return { progressPercent, estimatedTimeRemaining };
}

/**
 * Format milliseconds into a human-readable ETA string.
 * @param {number} ms - Remaining time in milliseconds
 * @returns {string}
 */
function formatETA(ms) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `~${seconds}s remaining`;
  const minutes = Math.round(seconds / 60);
  return `~${minutes}m remaining`;
}

/**
 * Broadcast task progress to connected dashboard clients via WebSocket.
 * Called per iteration and after terminal outcomes for dashboard-originated tasks.
 * Only sends ext:task-progress for running sessions -- terminal state forwarding
 * (ext:task-complete) is handled separately in Plan 02.
 *
 * @param {Object} session - Active automation session object
 */
function broadcastDashboardProgress(session) {
  // Guard: WebSocket must exist and be connected
  if (typeof fsbWebSocket === 'undefined' || !fsbWebSocket || !fsbWebSocket.connected) {
    return;
  }
  // Guard: Only broadcast for dashboard-originated tasks
  if (!session._isDashboardTask) {
    return;
  }
  var progress = calculateProgress(session);
  var isTerminal = session.status === 'completed' || session.status === 'failed' ||
    session.status === 'stopped' || session.status === 'no_progress' ||
    session.status === 'max_iterations' || session.status === 'timeout' ||
    session.status === 'error';
  // Do NOT send ext:task-complete here -- that is handled by Plan 02
  // via automationComplete interception. This function ONLY sends
  // ext:task-progress for running sessions.
  if (isTerminal) {
    return;
  }
  fsbWebSocket.send('ext:task-progress', {
    progress: progress.progressPercent,
    phase: session.lastTurnResult ? 'acting' : 'thinking',
    eta: progress.estimatedTimeRemaining || null,
    elapsed: Date.now() - (session.startTime || Date.now()),
    action: session._lastActionSummary || session.lastAiReasoning || 'Working...',
    iteration: session.iterationCount || 0,
    maxIterations: session.maxIterations || 100,
    taskRunId: session._dashboardTaskRunId || '',
    task: session.task || '',
    taskSource: 'live',
    updatedAt: Date.now()
  });
}

/**
 * Returns a recovery snapshot of the current or recently-completed dashboard task.
 * Called by ws-client.js _sendStateSnapshot (line 327) and _handleStopTask (line 768)
 * via typeof guard. Priority: running task first, then recently completed (60s TTL).
 *
 * @returns {Object|null} Recovery snapshot or null if no dashboard task state available
 */
function _getDashboardTaskRecoverySnapshot() {
  // 1. Check for a running dashboard task first
  if (typeof activeSessions !== 'undefined') {
    var running = null;
    activeSessions.forEach(function(s) {
      if (s._isDashboardTask && s.status === 'running') running = s;
    });
    if (running) {
      var progress = calculateProgress(running);
      return {
        taskRunId: running._dashboardTaskRunId || '',
        taskStatus: 'running',
        task: running.task || '',
        progress: progress.progressPercent,
        phase: running.lastTurnResult ? 'acting' : 'thinking',
        eta: progress.estimatedTimeRemaining || null,
        elapsed: Date.now() - (running.startTime || Date.now()),
        action: running._lastActionSummary || 'Working...',
        lastAction: running._lastActionSummary || '',
        summary: '',
        error: '',
        stopped: false,
        tabId: typeof running.tabId === 'number' ? running.tabId : null,
        taskSource: 'snapshot',
        updatedAt: Date.now()
      };
    }
  }

  // 2. Check for a recently completed dashboard task (retained for 60 seconds)
  if (_lastDashboardTaskResult && _lastDashboardTaskResultTime) {
    var age = Date.now() - _lastDashboardTaskResultTime;
    if (age < 60000) {
      // Return the stored completion payload with taskSource overridden to 'snapshot'
      return Object.assign({}, _lastDashboardTaskResult, {
        taskSource: 'snapshot',
        updatedAt: _lastDashboardTaskResultTime
      });
    } else {
      // Expired -- clear it
      _lastDashboardTaskResult = null;
      _lastDashboardTaskResultTime = 0;
    }
  }

  return null;
}

/**
 * Summarize a task description into a short label using the AI provider.
 * Non-blocking -- returns null on failure. Skips tasks already short enough.
 * @param {string} taskText - Original task description
 * @param {Object} settings - Extension settings (for provider config)
 * @returns {Promise<string|null>}
 */
async function summarizeTask(taskText, settings) {
  try {
    if (!taskText || taskText.length <= 40) return taskText;

    const provider = new UniversalProvider(settings);
    const requestBody = await provider.buildRequest({
      systemPrompt: 'Summarize this browser automation task in under 10 words. Return only the summary, nothing else.',
      userPrompt: taskText
    }, {});

    // Limit tokens for this tiny call
    if (requestBody.max_tokens) requestBody.max_tokens = 50;
    if (requestBody.generationConfig?.maxOutputTokens) requestBody.generationConfig.maxOutputTokens = 50;

    const response = await provider.sendRequest(requestBody, { timeout: 8000 });

    // Extract raw text content directly (parseResponse expects JSON, but we want plain text)
    let summary = null;
    const providerName = settings.modelProvider || 'xai';
    if (providerName === 'gemini') {
      summary = response?.candidates?.[0]?.content?.parts?.[0]?.text;
    } else if (providerName === 'anthropic') {
      summary = response?.content?.[0]?.text;
    } else {
      // xAI / OpenAI compatible
      summary = response?.choices?.[0]?.message?.content;
    }

    summary = summary?.trim();
    if (summary && summary.length > 0 && summary.length <= 60) return summary;
    return summary ? summary.substring(0, 40) : null;
  } catch (e) {
    automationLogger.debug('Task summarization failed (non-blocking)', { error: e.message });
    return null;
  }
}

/**
 * PageLoadWatcher - Event-driven page load detection
 * Replaces hardcoded delays with smart waiting that proceeds immediately when ready
 */
class PageLoadWatcher {
  constructor() {
    this.pendingLoads = new Map(); // tabId -> {resolve, timeout, startTime}
  }

  /**
   * Wait for a tab to be fully loaded and ready for interaction
   * @param {number} tabId - Tab to watch
   * @param {Object} options - Configuration options
   * @returns {Promise<{success: boolean, waitTime: number, method: string}>}
   */
  async waitForPageReady(tabId, options = {}) {
    const {
      maxWait = 10000,         // Maximum wait time in ms
      requireDOMStable = true, // Also wait for DOM to stabilize
      stableTime = 300,        // How long DOM must be stable (ms)
    } = options;

    const startTime = Date.now();

    try {
      // Step 1: Wait for tab status='complete'
      await this.waitForTabComplete(tabId, maxWait);

      const afterTabComplete = Date.now() - startTime;
      automationLogger.logTiming(null, 'WAIT', 'tab_complete', afterTabComplete, { tabId });

      // Step 2: Verify content script is responsive
      const remainingForPing = Math.max(2000, maxWait - (Date.now() - startTime));
      const healthOk = await this.pingContentScript(tabId, remainingForPing);
      if (!healthOk) {
        automationLogger.logComm(null, 'health', 'healthCheck', false, { tabId, reason: 'not_responsive' });
        return { success: false, waitTime: Date.now() - startTime, method: 'health-failed' };
      }

      // Step 3: Optionally wait for DOM stability
      if (requireDOMStable) {
        const remainingTime = maxWait - (Date.now() - startTime);
        if (remainingTime > stableTime) {
          const stableResult = await this.waitForDOMStable(tabId, remainingTime, stableTime);
          automationLogger.logTiming(null, 'WAIT', 'dom_stable', stableResult?.waitTime || remainingTime, { tabId, ...stableResult });
        }
      }

      const waitTime = Date.now() - startTime;
      automationLogger.logTiming(null, 'WAIT', 'page_ready', waitTime, { tabId, method: 'event-driven' });

      return { success: true, waitTime, method: 'event-driven' };
    } catch (error) {
      const waitTime = Date.now() - startTime;
      automationLogger.logComm(null, 'health', 'page_ready', false, { tabId, error: error.message, waitTime });
      return {
        success: false,
        waitTime,
        method: 'error',
        error: error.message
      };
    }
  }

  /**
   * Wait for chrome.tabs.onUpdated status='complete'
   * @param {number} tabId - Tab to watch
   * @param {number} timeout - Max wait time in ms
   * @returns {Promise<void>}
   */
  waitForTabComplete(tabId, timeout) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Tab load timeout'));
      }, timeout);

      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          clearTimeout(timeoutId);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };

      // Check if already complete
      chrome.tabs.get(tabId).then(tab => {
        if (tab.status === 'complete') {
          clearTimeout(timeoutId);
          resolve();
        } else {
          chrome.tabs.onUpdated.addListener(listener);
        }
      }).catch(err => {
        clearTimeout(timeoutId);
        reject(err);
      });
    });
  }

  /**
   * Ping content script to verify it's responsive
   * @param {number} tabId - Tab to ping
   * @param {number} timeout - Max wait time in ms
   * @returns {Promise<boolean>}
   */
  async pingContentScript(tabId, timeout = 2000) {
    try {
      const response = await Promise.race([
        chrome.tabs.sendMessage(tabId, { action: 'healthCheck' }, { frameId: 0 }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Ping timeout')), timeout)
        )
      ]);
      return response?.success === true;
    } catch {
      return false;
    }
  }

  /**
   * Wait for DOM to stabilize via content script
   * @param {number} tabId - Tab to check
   * @param {number} timeout - Max wait time in ms
   * @param {number} stableTime - How long DOM must be stable
   * @returns {Promise<Object>}
   */
  async waitForDOMStable(tabId, timeout, stableTime) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        action: 'executeAction',
        tool: 'waitForDOMStable',
        params: { timeout, stableTime }
      }, { frameId: 0 });
      return response || { success: false };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Quick check if page appears ready (non-blocking)
   * @param {number} tabId - Tab to check
   * @returns {Promise<Object>}
   */
  async checkPageReady(tabId) {
    try {
      const response = await Promise.race([
        chrome.tabs.sendMessage(tabId, { action: 'checkPageReady' }, { frameId: 0 }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Check timeout')), 1000)
        )
      ]);
      return response || { success: false, isReady: false };
    } catch {
      return { success: false, isReady: false };
    }
  }
}

// Global PageLoadWatcher instance
const pageLoadWatcher = new PageLoadWatcher();

/**
 * Calculate smart delay after an action based on what happened
 * @param {Object} actionResult - Result from the action
 * @param {Object} context - Current automation context
 * @returns {Promise} Resolves when ready to continue
 */
async function smartWaitAfterAction(actionResult, context) {
  const { tool, params } = context.lastAction || {};
  const tabId = context.tabId;

  // Navigation actions - wait for page load
  if (['navigate', 'goBack', 'goForward'].includes(tool)) {
    automationLogger.logNavigation(null, tool, null, null, { waiting: true, tabId });
    return pageLoadWatcher.waitForPageReady(tabId, {
      maxWait: 5000,
      requireDOMStable: true,
      stableTime: 300
    });
  }

  // Click that triggered navigation
  if (tool === 'click' && (actionResult?.navigationTriggered || context.urlChanged)) {
    automationLogger.logNavigation(null, 'click', context.lastUrl, null, { navigationTriggered: true, tabId });
    return pageLoadWatcher.waitForPageReady(tabId, {
      maxWait: 5000,
      requireDOMStable: true,
      stableTime: 300
    });
  }

  // Type/input actions - minimal wait, just ensure input registered
  if (['type', 'clearInput', 'keyPress'].includes(tool)) {
    // No delay needed - immediate continuation is fine
    return Promise.resolve({ success: true, waitTime: 0, method: 'no-wait' });
  }

  // pressEnter might trigger form submission/navigation
  if (tool === 'pressEnter') {
    // Brief check for URL change
    await new Promise(resolve => setTimeout(resolve, 100));
    if (context.urlChanged) {
      return pageLoadWatcher.waitForPageReady(tabId, {
        maxWait: 5000,
        requireDOMStable: true
      });
    }
    // Otherwise just wait for DOM stability
    return pageLoadWatcher.waitForDOMStable(tabId, 2000, 200);
  }

  // Click that didn't navigate - might trigger AJAX
  if (tool === 'click' && !context.urlChanged) {
    automationLogger.logActionExecution(null, 'click', 'wait_dom', { tabId, reason: 'ajax_possible' });
    return pageLoadWatcher.waitForDOMStable(tabId, 2000, 200);
  }

  // Scroll actions - short wait for lazy loading
  if (tool === 'scroll') {
    return pageLoadWatcher.waitForDOMStable(tabId, 1500, 200);
  }

  // Default: no delay needed
  return Promise.resolve({ success: true, waitTime: 0, method: 'default' });
}

// EASY WIN #10: Service worker keep-alive mechanism
// Prevents service worker from shutting down during active automation sessions
let keepAliveInterval = null;

function startKeepAlive() {
  if (keepAliveInterval) return; // Already running

  automationLogger.logServiceWorker('keepalive_start', { interval: 20000 });
  keepAliveInterval = setInterval(() => {
    // No-op operation to keep service worker alive
    chrome.runtime.getPlatformInfo(() => {
      // Just accessing the API keeps the worker active
    });
  }, 20000); // Ping every 20 seconds (MV3 workers shut down after 30s of inactivity)
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    automationLogger.logServiceWorker('keepalive_stop', {});
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// EASY WIN #10: Helper to clean up session and stop keep-alive if no active sessions
// Enhanced with race condition protection
async function cleanupSession(sessionId) {
  const session = activeSessions.get(sessionId);

  // If session exists, mark it as terminating and wait for loop to yield
  if (session) {
    session.isTerminating = true;

    // PERF: Signal the stop via AbortController (replaces 500ms polling)
    if (session._stopAbortController) {
      session._stopAbortController.abort();
      session._stopAbortController = null;
    }

    // If there's an active loop iteration, wait for it to yield
    if (session.loopPromise) {
      automationLogger.debug('Waiting for active loop to yield', { sessionId });
      try {
        // Wait up to 5 seconds for the loop to yield
        await Promise.race([
          session.loopPromise,
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);
      } catch (e) {
        automationLogger.debug('Loop yield wait completed', { sessionId, message: e?.message || 'timeout' });
      }
    }

    // Clear any pending timeouts
    if (session.pendingTimeout) {
      clearTimeout(session.pendingTimeout);
      session.pendingTimeout = null;
    }

    // Clean up orphaned login handler if session had one
    if (session._loginHandler) {
      chrome.runtime.onMessage.removeListener(session._loginHandler.handler);
      clearTimeout(session._loginHandler.timeout);
      session._loginHandler = null;
    }

    // Defense-in-depth: always send overlay cleanup to content script.
    // Some code paths call cleanupSession without endSessionOverlays;
    // sending 'ended' again is harmless if overlays were already destroyed.
    try {
      await endSessionOverlays(session, 'cleanup');
    } catch (e) {
      automationLogger.debug('endSessionOverlays during cleanup failed (non-blocking)', { sessionId, error: e?.message });
    }
  }

  // PERF: Flush any pending debounced log writes before session cleanup
  if (automationLogger && typeof automationLogger.flush === 'function') {
    automationLogger.flush();
  }

  activeSessions.delete(sessionId);
  // Also remove from persistent storage
  removePersistedSession(sessionId);

  // Clean up conversation session entries that reference this session
  for (const [convId, entry] of conversationSessions) {
    if (entry.sessionId === sessionId) {
      conversationSessions.delete(convId);
    }
  }
  persistConversationSessions();

  // Clean up AI instance and its conversation history
  if (sessionAIInstances.has(sessionId)) {
    const ai = sessionAIInstances.get(sessionId);
    if (ai && typeof ai.clearConversationHistory === 'function') {
      ai.clearConversationHistory();
    }
    sessionAIInstances.delete(sessionId);
    automationLogger.debug('Cleaned up AI instance for session', { sessionId });
  }

  // Stop keep-alive if no actively-running sessions remain
  const hasActiveSession = [...activeSessions.values()].some(s =>
    s.status === 'running' || s.status === 'replaying'
  );
  if (!hasActiveSession) {
    automationLogger.logServiceWorker('session_count', { count: activeSessions.size, action: 'stopping_keepalive', reason: 'no_running_sessions' });
    stopKeepAlive();
  } else {
    automationLogger.logServiceWorker('session_count', { count: activeSessions.size, action: 'keeping_alive' });
  }
}

// Helper to check if session is terminating (used in automation loop)
function isSessionTerminating(sessionId) {
  const session = activeSessions.get(sessionId);
  return !session || session.isTerminating || session.status !== 'running';
}

/**
 * Create a HookPipeline for a new automation session.
 * Wires safety breaker hooks, permission hooks, and progress hooks
 * into the agent loop lifecycle events.
 *
 * @param {string} sessionId - Session identifier
 * @returns {HookPipeline} Configured hook pipeline
 */
function createSessionHooks(sessionId) {
  const pipeline = new HookPipeline();

  // Safety breaker hook: checks cost, time, and iteration limits before each iteration
  // checkSafetyBreakers is defined in agent-loop.js, loaded via importScripts
  if (typeof createSafetyBreakerHook === 'function') {
    const safetyHook = createSafetyBreakerHook(checkSafetyBreakers);
    pipeline.register(LIFECYCLE_EVENTS.BEFORE_ITERATION, safetyHook);
  }

  // Progress hook: sends iteration progress to content script overlay
  if (typeof createToolProgressHook === 'function') {
    const progressHook = createToolProgressHook(function(tabId, statusData) {
      sendSessionStatus(tabId, statusData);
    });
    pipeline.register(LIFECYCLE_EVENTS.AFTER_TOOL_EXECUTION, progressHook);
  }

  // Permission hook: pre-checks tool permissions before execution
  if (typeof createPermissionHook === 'function' && typeof PermissionContext === 'function') {
    try {
      const permCtx = new PermissionContext();
      const permHook = createPermissionHook(permCtx);
      pipeline.register(LIFECYCLE_EVENTS.BEFORE_TOOL_EXECUTION, permHook);
    } catch (_e) {
      // PermissionContext may not be fully configured -- skip gracefully
      automationLogger.debug('Permission hook skipped', { sessionId, reason: _e.message });
    }
  }

  return pipeline;
}

/**
 * Reactivate an idle session for a follow-up command.
 * Resets per-command counters while preserving cumulative state (actionHistory, AI history).
 * @param {Object} session - The session object from activeSessions
 * @param {string} newTask - The new follow-up task/command
 */
function reactivateSession(session, newTask) {
  // Reset per-command fields
  session.status = 'running';
  session.task = newTask;
  session.iterationCount = 0;
  session.stuckCounter = 0;
  session.consecutiveNoProgressCount = 0;
  session.lastDOMHash = null;
  session.lastDOMSignals = null;
  session.actionSequences = [];
  session.sequenceRepeatCount = {};
  session.startTime = Date.now();
  session.isTerminating = false;

  // Track command count and command history
  session.commandCount = (session.commandCount || 1) + 1;
  session.commands = session.commands || [];
  session.commands.push(newTask);

  // Clear idle timeout if one was scheduled
  if (session.idleTimeout) {
    clearTimeout(session.idleTimeout);
    session.idleTimeout = null;
  }

  // Preserved (not touched): actionHistory, stateHistory, tabId, allowedTabs,
  // domSettings, conversationId, animatedActionHighlights, and the AI instance
  // in sessionAIInstances retains its full conversation history.
}

/**
 * Transition a session to idle status instead of fully cleaning it up.
 * The session remains in activeSessions with status 'idle' so it can be reactivated
 * by a follow-up command. A deferred cleanup timer will fully clean up after IDLE_SESSION_TIMEOUT.
 * @param {string} sessionId - The session ID to idle
 */
function idleSession(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  session.status = 'idle';

  // Schedule deferred cleanup -- if no follow-up comes within the timeout, clean up fully
  session.idleTimeout = setTimeout(() => {
    if (session.status === 'idle') {
      automationLogger.debug('Idle session timeout, cleaning up', { sessionId });
      cleanupSession(sessionId);
      if (session.conversationId) {
        conversationSessions.delete(session.conversationId);
        persistConversationSessions();
      }
    }
  }, IDLE_SESSION_TIMEOUT);

  // Persist the idle status so it survives service worker restarts
  persistSession(sessionId, session);
  persistConversationSessions();

  automationLogger.info('Session transitioned to idle', {
    sessionId,
    conversationId: session.conversationId || null,
    commandCount: session.commandCount || 1,
    actionHistoryLength: session.actionHistory?.length || 0
  });

  // Keep-alive stays running while idle sessions exist (activeSessions.size > 0)
  // The existing stopKeepAlive() check in cleanupSession handles stopping when size === 0
}

/**
 * Persist conversationSessions Map to chrome.storage.session for service worker restart survival.
 */
async function persistConversationSessions() {
  try {
    await chrome.storage.session.set({
      fsbConversationSessions: Object.fromEntries(conversationSessions)
    });
    automationLogger.debug('Conversation sessions persisted', { count: conversationSessions.size });
  } catch (error) {
    automationLogger.warn('Failed to persist conversation sessions', { error: error.message });
  }
}

/**
 * Restore conversationSessions Map from chrome.storage.session after service worker restart.
 * Validates that referenced sessions still exist in activeSessions.
 */
async function restoreConversationSessions() {
  try {
    const stored = await chrome.storage.session.get('fsbConversationSessions');
    const data = stored?.fsbConversationSessions;
    if (data && typeof data === 'object') {
      for (const [convId, entry] of Object.entries(data)) {
        // Only restore if the referenced session still exists
        if (entry?.sessionId && activeSessions.has(entry.sessionId)) {
          conversationSessions.set(convId, entry);
        }
      }
      automationLogger.debug('Conversation sessions restored', { count: conversationSessions.size });
    }
  } catch (error) {
    automationLogger.warn('Failed to restore conversation sessions', { error: error.message });
  }
}

// Store for active automation sessions
let activeSessions = new Map();

// Phase 225-01: In-process lifecycle bus.
//
// chrome.runtime.sendMessage() does NOT loop back to chrome.runtime.onMessage
// listeners registered in the SAME service-worker context. The MCP bridge
// client (ws/mcp-bridge-client.js) lives in this same SW, so it never hears
// the automationComplete / automationError broadcasts that drive every other
// UI surface. Result: mcp__fsb__run_task hangs until its 300s timeout even
// though the underlying autopilot finishes in 40-186s.
//
// fsbAutomationLifecycleBus is a same-context EventTarget that mirrors the
// terminal automationComplete / automationError broadcasts so in-SW listeners
// (only the MCP bridge client today) can observe completion. Cross-context
// surfaces (popup, sidepanel, dashboard) keep using chrome.runtime.sendMessage
// unchanged -- this is purely additive for in-SW observation.
if (typeof globalThis !== 'undefined' && !globalThis.fsbAutomationLifecycleBus) {
  globalThis.fsbAutomationLifecycleBus = new EventTarget();
}

/**
 * Broadcast an automation lifecycle message to BOTH chrome.runtime.sendMessage
 * (for popup/sidepanel/dashboard) AND the in-process bus (for MCP bridge).
 * Only used for terminal events: automationComplete, automationError.
 *
 * @param {Object} message - Must include { action, sessionId, ... }.
 *   action should be 'automationComplete' or 'automationError'.
 * @returns {Promise<void>}
 */
function fsbBroadcastAutomationLifecycle(message) {
  // 1. Cross-context broadcast (existing behavior, unchanged shape).
  const sendPromise = chrome.runtime.sendMessage(message);
  const promise = (sendPromise && typeof sendPromise.catch === 'function')
    ? sendPromise.catch((err) => {
        // Swallow "no receivers" errors -- consistent with existing call sites.
        if (typeof rateLimitedWarn === 'function') {
          rateLimitedWarn('BG', 'lifecycle-broadcast', 'lifecycle sendMessage delivery failed', { action: message?.action, error: err && err.message });
        }
      })
    : Promise.resolve();

  // 2. In-process dispatch for SW-context listeners (MCP bridge client).
  try {
    const bus = globalThis.fsbAutomationLifecycleBus;
    if (bus && typeof bus.dispatchEvent === 'function' && message && message.action) {
      bus.dispatchEvent(new CustomEvent(message.action, { detail: message }));
    }
  } catch (busErr) {
    // Bus dispatch failure must never break the cross-context broadcast.
    console.warn('[FSB] fsbAutomationLifecycleBus dispatch failed', busErr && busErr.message);
  }

  return promise;
}

if (typeof globalThis !== 'undefined') {
  globalThis.fsbBroadcastAutomationLifecycle = fsbBroadcastAutomationLifecycle;
}

/**
 * QT-wnz Codex-3 -- background-side authoritative terminal persist.
 *
 * Writes an assistant terminal message into chrome.storage.local key
 * 'fsbConversationMessages' (the same envelope sidepanel reads via
 * FSBSidepanelMessageLog) so the durable record exists BEFORE the
 * broadcast goes out. Sidepanel's automationComplete handler still
 * persists as an idempotent backup (C4 adds dedupe to make this safe).
 *
 * Idempotency: scans the per-conv log for any existing message with
 * sessionId === sessionId AND terminal === true. If found, no-op.
 *
 * Best-effort: chrome.storage failures swallowed silently. The broadcast
 * still goes out via the caller (finalizeSession -> notifySidepanel).
 *
 * @param {string} convId
 * @param {string} sessionId
 * @param {string} content
 * @returns {Promise<void>}
 */
async function fsbPersistTerminalMessageToConversation(convId, sessionId, content) {
  if (typeof convId !== 'string' || convId.length === 0) return;
  if (typeof sessionId !== 'string' || sessionId.length === 0) return;
  if (typeof content !== 'string' || content.length === 0) return;
  try {
    var STORAGE_KEY = 'fsbConversationMessages';
    var bag = await chrome.storage.local.get(STORAGE_KEY);
    var envelope = bag[STORAGE_KEY];
    if (!envelope || envelope.v !== 1 || !envelope.byConv || !Array.isArray(envelope.lru)) {
      envelope = { v: 1, byConv: {}, lru: [] };
    }
    var log = envelope.byConv[convId];
    var now = Date.now();
    if (!log || !Array.isArray(log.messages)) {
      log = { v: 1, messages: [], lastWriteAt: now, createdAt: now };
      envelope.byConv[convId] = log;
    }
    // Idempotency: skip if terminal for this sessionId already present.
    for (var i = 0; i < log.messages.length; i++) {
      var m = log.messages[i];
      if (m && m.sessionId === sessionId && m.terminal === true) {
        return;
      }
    }
    log.messages.push({
      role: 'assistant',
      content: content,
      timestamp: now,
      kind: 'text',
      sessionId: sessionId,
      terminal: true
    });
    log.lastWriteAt = now;
    // LRU touch (head).
    var idx = envelope.lru.indexOf(convId);
    if (idx !== -1) envelope.lru.splice(idx, 1);
    envelope.lru.unshift(convId);
    // Cap = 50 (matches sidepanel-message-log.js DEFAULT_CAP).
    while (envelope.lru.length > 50) {
      var tailKey = envelope.lru.pop();
      if (tailKey) delete envelope.byConv[tailKey];
    }
    var payload = {};
    payload[STORAGE_KEY] = envelope;
    await chrome.storage.local.set(payload);
  } catch (_e) {
    // Best-effort: do not block broadcast on storage failure.
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.fsbPersistTerminalMessageToConversation = fsbPersistTerminalMessageToConversation;
}

const mcpVisualSessionManager = (typeof MCPVisualSessionUtils !== 'undefined' && typeof MCPVisualSessionUtils.McpVisualSessionManager === 'function')
  ? new MCPVisualSessionUtils.McpVisualSessionManager()
  : null;
// Destructure visual-session helpers so existing call sites work without namespace prefix
const {
  normalizeMcpVisualClientLabel = () => null,
  getAllowedMcpVisualClientLabels = () => [],
  serializeMcpVisualSessionRecord = (s) => s,
  restoreMcpVisualSessionRecord = (r) => r,
  planMcpVisualSessionReplay = () => ({ action: 'clear' }),
  buildMcpVisualSessionStatus = () => ({}),
  buildMcpVisualSessionClearStatus = () => ({}),
} = (typeof MCPVisualSessionUtils !== 'undefined') ? MCPVisualSessionUtils : {};
const mcpVisualSessionFinalizationTimers = new Map();
const MCP_VISUAL_SESSION_STORAGE_KEY = 'fsbMcpVisualSessions';

// Last dashboard task completion result (retained for recovery snapshot)
var _lastDashboardTaskResult = null;
var _lastDashboardTaskResultTime = 0;

// Phase 211-02 STREAM-02: SW-side cache of the last-known staleFlushCount
// from the active streaming content script. Read by ws/ws-client.js
// _emitStreamState at the ext:stream-state send call (line ~912).
// Module-scope (not per-tab) is acceptable: only one streaming tab at a time.
var _lastDomStreamStaleFlushCount = 0;

// ============================================================================
// Phase 213 - Sync tab runtime cache (SYNC-02)
// Mirrors ext:remote-control-state for replay-on-attach via the
// 'getRemoteControlState' runtime action. Updated by the
// 'remoteControlStateChanged' push handler below. SW-lifetime only;
// null on cold start. Per CONTEXT D-18, disconnected is the safe default.
// Renamed from _lastRemoteControlState to _bgRemoteControlStateCache to
// avoid colliding with the same-named identifier in ws/ws-client.js:124.
// In Chrome service workers, importScripts loads files into the SAME global
// scope -- two top-level declarations of the same name throw
// "Identifier '_lastRemoteControlState' has already been declared" and break
// background.js startup. ws-client.js's cache (Phase 209 snapshot recovery)
// remains untouched at its original name.
let _bgRemoteControlStateCache = null;

// Store for AI integration instances per session (for multi-turn conversations)
// This allows conversation history to persist across iterations within a session
let sessionAIInstances = new Map();

// Session continuity: maps conversationId to { sessionId, lastActiveTime }
// Enables follow-up commands in the same conversation to reuse the existing session and AI instance
let conversationSessions = new Map();
const IDLE_SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutes before idle sessions are cleaned up
const MAX_CONVERSATION_SESSIONS = 5; // FIFO cap using enforceMapLimit

// PERF: Max Map sizes to prevent unbounded growth
const MAX_CONTENT_SCRIPT_ENTRIES = 200;

/**
 * Enforce size limit on a Map by evicting oldest entries.
 * @param {Map} map - The map to trim
 * @param {number} maxSize - Maximum allowed entries
 */
function enforceMapLimit(map, maxSize) {
  if (map.size <= maxSize) return;
  const excess = map.size - maxSize;
  const iter = map.keys();
  for (let i = 0; i < excess; i++) {
    const key = iter.next().value;
    map.delete(key);
  }
}

// SPEED-02: Track pending DOM prefetch for parallel analysis
// When AI is processing, we speculatively start the next DOM fetch
let pendingDOMPrefetch = null;

/**
 * SPEED-02: Prefetch DOM for parallel analysis
 * Initiates DOM analysis while AI is processing, to reduce sequential waiting.
 * Returns a Promise that can be awaited later (or discarded if not needed).
 *
 * @param {number} tabId - Tab ID to fetch DOM from
 * @param {Object} options - DOM fetch options
 * @returns {Promise<Object|null>} Promise resolving to DOM response, or null on failure
 */
async function prefetchDOM(tabId, options = {}) {
  try {
    const domOptions = {
      useIncrementalDiff: true,
      prefetch: true, // Hint to content script this is speculative
      ...options
    };

    automationLogger.debug('Starting DOM prefetch', { tabId, options: domOptions });

    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'getDOM',
      options: domOptions
    }, { frameId: 0 });

    if (response && response.success) {
      automationLogger.debug('DOM prefetch complete', {
        tabId,
        elementCount: response.structuredDOM?.elements?.length || 0
      });
      return response;
    }

    // Invalid response
    automationLogger.debug('DOM prefetch returned invalid response', { tabId });
    return null;
  } catch (error) {
    // Prefetch failure should not block - return null silently
    automationLogger.debug('DOM prefetch failed (non-blocking)', {
      tabId,
      error: error.message
    });
    return null;
  }
}

// Session persistence helpers - survive service worker restarts
// Persists essential session data to chrome.storage.session
async function persistSession(sessionId, session) {
  try {
    // Only persist essential fields needed for stop button and session continuity to work
    const persistableSession = {
      sessionId: sessionId,
      task: session.task,
      tabId: session.tabId,
      status: session.status,
      startTime: session.startTime,
      conversationId: session.conversationId || null,
      commandCount: session.commandCount || 1,
      // Don't persist: loopPromise, pendingTimeout, DOM hashes, etc. (non-serializable or transient)
    };

    // Persist multi-site orchestration state for service worker restart recovery
    if (session.multiSite) {
      persistableSession.multiSite = {
        originalTask: session.multiSite.originalTask,
        companyList: session.multiSite.companyList,
        currentIndex: session.multiSite.currentIndex,
        deferredCompanies: session.multiSite.deferredCompanies,
        failures: session.multiSite.failures,
        searchQuery: session.multiSite.searchQuery,
        startedAt: session.multiSite.startedAt
      };
    }

    const key = `session_${sessionId}`;
    await chrome.storage.session.set({ [key]: persistableSession });
    automationLogger.debug('Session persisted to storage', { sessionId });
  } catch (error) {
    automationLogger.warn('Failed to persist session', { sessionId, error: error.message });
  }
}

// Remove persisted session from storage
async function removePersistedSession(sessionId) {
  try {
    const key = `session_${sessionId}`;
    await chrome.storage.session.remove(key);
    automationLogger.debug('Session removed from storage', { sessionId });
  } catch (error) {
    automationLogger.warn('Failed to remove persisted session', { sessionId, error: error.message });
  }
}

// Restore sessions from storage on service worker startup
// Note: Restored sessions can only be stopped, not resumed (loop state is lost)
async function restoreSessionsFromStorage() {
  try {
    const allStorage = await chrome.storage.session.get(null);
    const sessionKeys = Object.keys(allStorage).filter(k => k.startsWith('session_'));

    for (const key of sessionKeys) {
      const persistedSession = allStorage[key];
      if (persistedSession && persistedSession.sessionId) {
        // Check if session is still supposed to be running or idle (idle sessions can be reactivated)
        if (persistedSession.status === 'running' || persistedSession.status === 'idle') {
          // Restore to activeSessions map so stop button works (and idle sessions can be reactivated)
          // Mark as 'recoverable' so we know it was restored (can't resume automation loop)
          activeSessions.set(persistedSession.sessionId, {
            ...persistedSession,
            isRestored: true,  // Flag to indicate this was restored, automation loop is not running
            // Keep original status -- 'running' for stop button, 'idle' for reactivation
          });
          automationLogger.info('Restored session from storage', {
            sessionId: persistedSession.sessionId,
            status: persistedSession.status,
            task: persistedSession.task?.substring(0, 50)
          });

          // LIFE-03 (D-04): If session was running, it cannot resume -- notify sidepanel
          if (persistedSession.status === 'running') {
            const restoredSession = activeSessions.get(persistedSession.sessionId);
            try {
              fsbBroadcastAutomationLifecycle({
                action: 'automationComplete',
                sessionId: persistedSession.sessionId,
                // QT-uof-2 (BROADCAST-tabId-THREAD) -- thread tabId per .planning/debug/cluster1-routing.md
                tabId: (persistedSession && typeof persistedSession.tabId === 'number') ? persistedSession.tabId : null,
                conversationId: persistedSession.conversationId || null,
                historySessionId: persistedSession.historySessionId || persistedSession.sessionId,
                result: 'Session interrupted by service worker restart. Automation cannot resume.',
                partial: false,
                stopped: true,
                error: null,
                reason: 'service_worker_restart',
                outcome: 'stopped',
                blocker: null,
                nextStep: null,
                outcomeDetails: {
                  outcome: 'stopped',
                  reason: 'service_worker_restart',
                  summary: 'Session interrupted by service worker restart. Automation cannot resume.',
                  blocker: null,
                  nextStep: null,
                  result: 'Session interrupted by service worker restart. Automation cannot resume.',
                  error: null
                },
                task: persistedSession.task || null
              }).catch((err) => {
                console.warn('[FSB] SW-wake automationComplete delivery failed', {
                  sessionId: persistedSession.sessionId,
                  error: err && err.message
                });
              });
            } catch (_e) { /* non-fatal -- sidepanel may not be open yet */ }

            // LIFE-03 (D-05): Mark session as stopped since it cannot resume
            if (restoredSession) {
              restoredSession.status = 'stopped';
              // Persist the stopped status so next SW wake does not re-notify
              persistSession(persistedSession.sessionId, restoredSession);
            }
          }
        } else {
          // Clean up non-running/non-idle sessions from storage
          await removePersistedSession(persistedSession.sessionId);
        }
      }
    }

    // Restore conversation session mappings after sessions are restored
    await restoreConversationSessions();
    // Phase 237 -- hydrate the agent registry adjacent to the visual-session
    // restore site so registry ownership is reconciled before any message
    // handler can read getOwner(tabId). The bootstrap function swallows its
    // own errors, but we still chain a defensive .catch in case construction
    // throws so SW boot is never poisoned.
    await bootstrapAgentRegistry().catch(() => {});
    await restorePersistedMcpVisualSessions();

    // Phase 256 Plan 03 -- restore implicit visual-session lifecycles after
    // MV3 SW eviction. Reads per-tab entries from chrome.storage.session
    // under mcpVisualSession:<tabId> and either fires immediate-clear for
    // elapsed deadlines or re-arms chrome.alarms with the original when.
    // Requirements satisfied: TIMEOUT-04 (SW-eviction replay).
    if (typeof MCPVisualSessionLifecycleUtils !== 'undefined'
        && typeof MCPVisualSessionLifecycleUtils.restoreVisualSessionLifecyclesFromStorage === 'function') {
      MCPVisualSessionLifecycleUtils.restoreVisualSessionLifecyclesFromStorage()
        .catch((err) => {
          console.warn('[FSB MCP] restoreVisualSessionLifecyclesFromStorage failed (non-blocking):', err && err.message);
        });
    }

    // Phase 14 Plan 03 (v0.11.0) -- restore survivable trigger registry after
    // MV3 SW eviction / cold boot. Reads the single fsbTriggerRegistry envelope
    // from chrome.storage.session, re-arms non-elapsed armed snapshots with
    // their original deadline_at, drops terminal/expired entries, and sweeps
    // orphan fsbTrigger:* alarms (D-07.2 / D-08). Non-blocking .catch so a
    // reconcile failure never aborts SW bootstrap.
    // Requirements satisfied: SURV-03 (cold-boot reconcile + orphan sweep).
    if (typeof FsbTriggerLifecycle !== 'undefined'
        && typeof FsbTriggerLifecycle.restoreTriggersFromStorage === 'function') {
      FsbTriggerLifecycle.restoreTriggersFromStorage()
        .catch((err) => {
          console.warn('[FSB TRG] restoreTriggersFromStorage failed (non-blocking):', err && err.message);
        });
    }

    automationLogger.logServiceWorker('sessions_restored', { count: activeSessions.size, conversationSessions: conversationSessions.size });
  } catch (error) {
    automationLogger.warn('Failed to restore sessions from storage', { error: error.message });
  }
}

// Immediately restore sessions when service worker wakes up
// This handles both service worker restarts and browser startups
restoreSessionsFromStorage().catch(err => {
  console.warn('FSB: Failed to restore sessions on wake:', err);
});

// Eagerly rehydrate vault session key on service worker startup (Phase 191 - VAULT-03)
// chrome.storage.session survives SW restarts but the in-memory SecureConfig fields reset to null.
// Calling these methods loads persisted keys back into memory so vault operations work
// without requiring re-unlock after Chrome kills the idle service worker.
(async () => {
  try {
    const sessionKey = await secureConfig._loadCredentialSessionKey();
    await secureConfig._loadPaymentAccessState();
    if (sessionKey) {
      console.log('[FSB] Vault session key rehydrated from chrome.storage.session');
    }
  } catch (err) {
    console.warn('[FSB] Failed to rehydrate vault session on wake:', err.message || err);
  }
})();

// Periodic cleanup of stale sessions (every 5 minutes)
setInterval(async () => {
  const now = Date.now();
  const STALE_THRESHOLD = 30 * 60 * 1000; // 30 minutes
  for (const [sessionId, session] of activeSessions) {
    // LIFE-01: Never delete a session that is actively running
    if (session.status === 'running') {
      continue;
    }
    // Remove idle sessions older than 30 minutes
    if (session.status === 'idle' && now - (session.startTime || 0) > STALE_THRESHOLD) {
      automationLogger.info('Removing stale idle session', { sessionId, ageMs: now - (session.startTime || 0) });
      activeSessions.delete(sessionId);
      sessionAIInstances.delete(sessionId);
      removePersistedSession(sessionId);
      continue;
    }
    // Remove sessions whose tab no longer exists
    if (session.tabId) {
      try {
        await chrome.tabs.get(session.tabId);
      } catch {
        if (session.status === 'running') {
          automationLogger.warn('Stale cleanup: tab gone but session still running, skipping', { sessionId, tabId: session.tabId });
          continue;
        }
        automationLogger.info('Removing session for closed tab', { sessionId, tabId: session.tabId });
        activeSessions.delete(sessionId);
        sessionAIInstances.delete(sessionId);
        removePersistedSession(sessionId);
      }
    }
  }
  // Stop keep-alive if no running sessions remain
  const hasActiveSession = [...activeSessions.values()].some(s =>
    s.status === 'running' || s.status === 'replaying'
  );
  if (!hasActiveSession) stopKeepAlive();
}, 5 * 60 * 1000);

// Track content script ready status per tab
let contentScriptReadyStatus = new Map();

// Global analytics instance
let globalAnalytics = null;

// Content script communication health tracking
let contentScriptHealth = new Map();

// Track active content script ports per tab for persistent connections
const contentScriptPorts = new Map();

// Listen for persistent port connections from content scripts
chrome.runtime.onConnect.addListener((port) => {
  armMcpBridge('runtime.onConnect');
  debugLog('[FSB Background] onConnect received, port name:', port.name);
  if (port.name === 'content-script') {
    const tabId = port.sender?.tab?.id;
    const frameId = port.sender?.frameId;
    debugLog('[FSB Background] Content script port connection', { tabId, frameId });
    if (!tabId || frameId !== 0) {
      debugLog('[FSB Background] Ignoring non-main-frame port');
      return; // Main frame only
    }

    contentScriptPorts.set(tabId, {
      port,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now()
    });
    enforceMapLimit(contentScriptPorts, MAX_CONTENT_SCRIPT_ENTRIES);
    debugLog('[FSB Background] Port stored for tab:', tabId);

    automationLogger.logComm(null, 'receive', 'port_connected', true, { tabId });

    port.onMessage.addListener((msg) => {
      if (msg.type === 'ready') {
        // Update heartbeat timestamp when ready message is received
        const portInfo = contentScriptPorts.get(tabId);
        if (portInfo) portInfo.lastHeartbeat = Date.now();

        contentScriptReadyStatus.set(tabId, {
          ready: true,
          timestamp: msg.timestamp,
          url: msg.url,
          method: 'port'
        });
        automationLogger.logComm(null, 'receive', 'port_ready', true, { tabId, url: msg.url });
        replayMcpVisualSessionForTab(tabId, { now: Date.now(), source: 'port_ready' }).catch((error) => {
          automationLogger.debug('MCP visual-session replay on port ready failed', {
            tabId,
            error: error?.message || String(error),
          });
        });
      } else if (msg.type === 'heartbeat-ack') {
        const portInfo = contentScriptPorts.get(tabId);
        if (portInfo) portInfo.lastHeartbeat = Date.now();
      } else if (msg.type === 'spaNavigation') {
        // Handle SPA navigation notification via port
        const status = contentScriptReadyStatus.get(tabId);
        if (status) {
          status.url = msg.url;
          status.lastSpaNav = Date.now();
        }
        automationLogger.logComm(null, 'receive', 'spa_nav_port', true, { tabId, url: msg.url, method: msg.method });
      }
    });

    port.onDisconnect.addListener(() => {
      contentScriptPorts.delete(tabId);
      contentScriptReadyStatus.delete(tabId);
      contentScriptHealth.delete(tabId);
      automationLogger.logComm(null, 'receive', 'port_disconnected', true, { tabId });
    });
  }
});

// Clear content script state on navigation to prevent stale state issues
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return; // Main frame only

  armMcpBridge('webNavigation.onCommitted');

  const tabId = details.tabId;

  // Clear all state for this tab
  contentScriptReadyStatus.delete(tabId);
  contentScriptHealth.delete(tabId);

  // Disconnect existing port if any
  const portInfo = contentScriptPorts.get(tabId);
  if (portInfo) {
    try { portInfo.port.disconnect(); } catch (e) {}
    contentScriptPorts.delete(tabId);
  }

  // Phase 243 plan 02 (BG-04 / D-03): emit a LOG-04
  // 'agent-tab-user-navigation' diagnostic when the user (typed,
  // auto_bookmark, reload, link) navigates an agent-owned tab. The
  // helper applies frameId / transitionType / legacy:* / 500ms-stamp
  // suppression filters internally and is a no-op when any precondition
  // fails. EMISSION-only: no session.status mutation, no pause/resume
  // primitive (CONTEXT specifics line 67-68).
  try {
    if (typeof FsbAgentNavEmission !== 'undefined'
        && FsbAgentNavEmission
        && typeof FsbAgentNavEmission._maybeEmitUserNavigation === 'function') {
      FsbAgentNavEmission._maybeEmitUserNavigation(
        details,
        globalThis.fsbAgentRegistryInstance,
        Date.now()
      );
    }
  } catch (_e) { /* swallow -- diagnostic is best-effort */ }

  automationLogger.logComm(null, 'nav', 'state_cleared', true, {
    tabId,
    transitionType: details.transitionType,
    url: details.url
  });

  fsbTriggerRearmLiveObserversForTab(tabId, 'webNavigation.onCommitted')
    .catch((err) => {
      console.warn('[FSB TRG] live-observe webNavigation re-arm failed (non-blocking):', err && err.message);
    });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo || changeInfo.status !== 'complete') return;
  fsbTriggerRearmLiveObserversForTab(tabId, 'tabs.onUpdated.complete')
    .catch((err) => {
      console.warn('[FSB TRG] live-observe tabs.onUpdated re-arm failed (non-blocking):', err && err.message);
    });
});

// PERF: Clean up all state when a tab is closed to prevent memory leaks
chrome.tabs.onRemoved.addListener((tabId) => {
  contentScriptPorts.delete(tabId);
  contentScriptReadyStatus.delete(tabId);
  contentScriptHealth.delete(tabId);

  // Clean up any active sessions for this tab
  for (const [sessionId, session] of activeSessions) {
    if (session.tabId === tabId) {
      // LIFE-02 (D-02): Notify sidepanel BEFORE removing the session
      try {
        fsbBroadcastAutomationLifecycle({
          action: 'automationComplete',
          sessionId: sessionId,
          // QT-uof-2 (BROADCAST-tabId-THREAD) -- thread tabId; the for-loop key is sessionId
          // but the value is `session` with .tabId. Falls back to the loop variable tabId
          // (the tab being torn down) for parity with the onTabRemoved closure scope.
          tabId: (session && typeof session.tabId === 'number') ? session.tabId : (typeof tabId === 'number' ? tabId : null),
          conversationId: session.conversationId || null,
          historySessionId: session.historySessionId || sessionId,
          result: 'Tab was closed during automation.',
          partial: false,
          stopped: true,
          error: null,
          reason: 'tab_closed',
          outcome: 'stopped',
          blocker: null,
          nextStep: null,
          outcomeDetails: {
            outcome: 'stopped',
            reason: 'tab_closed',
            summary: 'Tab was closed during automation.',
            blocker: null,
            nextStep: null,
            result: 'Tab was closed during automation.',
            error: null
          },
          task: session.task || null
        }).catch((err) => {
          console.warn('[FSB] Tab-close automationComplete delivery failed', { sessionId, error: err && err.message });
        });
      } catch (_e) { /* non-fatal */ }

      // LIFE-02 (D-03): Clean up visual overlays on other tabs
      try {
        endSessionOverlays(session, 'tab_closed');
      } catch (_e) { /* tab already gone, overlay cleanup is best-effort */ }

      session.status = 'stopped';
      activeSessions.delete(sessionId);
      removePersistedSession(sessionId);
      if (sessionAIInstances.has(sessionId)) {
        sessionAIInstances.delete(sessionId);
      }
    }
  }
});

// Phase 237 -- registry tab-release hook.
// Standalone listener (NOT a modification of the two existing onRemoved listeners
// for session/port cleanup above and the keyboard-emulator detach further below).
// releaseTab is idempotent per registry contract (plan-01 task 1 test 7), so
// duplicate fires from listener reordering or future consolidation are no-ops.
chrome.tabs.onRemoved.addListener((tabId) => {
  try {
    if (globalThis.fsbAgentRegistryInstance &&
        typeof globalThis.fsbAgentRegistryInstance.releaseTab === 'function') {
      // Fire-and-forget: releaseTab is internally promise-chain-locked.
      // Matches the non-blocking pattern of the existing v0.9.36 cleanup listeners.
      globalThis.fsbAgentRegistryInstance.releaseTab(tabId);
    }
  } catch (err) {
    // Defensive: never let registry errors stop the existing onRemoved cleanup chain.
  }
});

// Phase 241 D-01 / POOL-03 -- forced-pool routing for new tabs.
// Standalone listener (does NOT modify the existing onCreated handlers nor the
// onRemoved chain above). When Chrome opens a new tab whose openerTabId points
// to an agent-owned tab, the new tab is automatically pooled under that same
// agent via bindTab(forced:true). New tabs without an openerTabId (Ctrl+T,
// address-bar) are intentionally left unowned -- they are not the spawn of an
// agent action, so no agent should claim them.
//
// D-02: forced-pool routing reuses an existing agent record; it does NOT call
// registerAgent and therefore does NOT consume cap budget.
chrome.tabs.onCreated.addListener((tab) => {
  try {
    if (!tab || typeof tab.id !== 'number') return;
    if (typeof tab.openerTabId !== 'number') return; // Pitfall 2: Ctrl+T / address-bar tabs unowned.
    var reg = globalThis.fsbAgentRegistryInstance;
    if (!reg || typeof reg.findAgentByTabId !== 'function') return;
    var ownerAgentId = reg.findAgentByTabId(tab.openerTabId);
    if (!ownerAgentId) return;
    if (typeof reg.bindTab === 'function') {
      // Fire-and-forget: bindTab is internally promise-chain-locked.
      reg.bindTab(ownerAgentId, tab.id, { forced: true });
    }
  } catch (_err) {
    // Defensive: never let registry errors stop other onCreated listeners.
  }
});

// Send periodic heartbeats to keep port connections validated
// PERF: Store interval ID so it can be cleared on suspension
const _heartbeatIntervalId = setInterval(() => {
  for (const [tabId, portInfo] of contentScriptPorts.entries()) {
    try {
      portInfo.port.postMessage({ type: 'heartbeat', timestamp: Date.now() });
    } catch (e) {
      // Port disconnected, cleanup will handle via onDisconnect
    }
  }
}, 3000);

// PERF: Clean up on service worker suspension
chrome.runtime.onSuspend.addListener(() => {
  clearInterval(_heartbeatIntervalId);
  contentScriptPorts.clear();
  contentScriptReadyStatus.clear();
  contentScriptHealth.clear();
});

// Performance monitoring
const performanceMetrics = {
  sessionStats: new Map(),
  globalStats: {
    totalSessions: 0,
    successfulSessions: 0,
    totalActions: 0,
    successfulActions: 0,
    averageIterationsPerSession: 0,
    averageTimePerSession: 0,
    communicationFailures: 0,
    alternativeActionsUsed: 0
  }
};

// Failure classification system
const FAILURE_TYPES = {
  COMMUNICATION: 'communication',
  DOM: 'dom',
  SELECTOR: 'selector',
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  PERMISSION: 'permission',
  BF_CACHE: 'bfcache'  // Back/forward cache issue
};

const RETRY_STRATEGIES = {
  [FAILURE_TYPES.COMMUNICATION]: 'reconnect_retry',
  [FAILURE_TYPES.DOM]: 'wait_retry',
  [FAILURE_TYPES.SELECTOR]: 'alternative_selector',
  [FAILURE_TYPES.NETWORK]: 'exponential_backoff',
  [FAILURE_TYPES.TIMEOUT]: 'increase_timeout',
  [FAILURE_TYPES.PERMISSION]: 'skip_action',
  [FAILURE_TYPES.BF_CACHE]: 'wake_and_retry'
};

// EASY WIN #9: Specialized recovery handlers for each error type
const RECOVERY_HANDLERS = {
  async [FAILURE_TYPES.COMMUNICATION](tabId, error) {
    automationLogger.logRecovery(null, 'comm_failure', 're-inject', 'attempt', { tabId });
    await ensureContentScriptInjected(tabId);
    // Use smart page ready check instead of hardcoded 500ms
    const ready = await pageLoadWatcher.pingContentScript(tabId, 2000);
    if (!ready) {
      automationLogger.logRecovery(null, 'comm_failure', 're-inject', 'failed', { tabId, reason: 'not_responsive' });
    }
    return { recovered: true, method: 'script_reinjection' };
  },

  async [FAILURE_TYPES.DOM](tabId, error) {
    automationLogger.logRecovery(null, 'dom_failure', 'dom_wait', 'attempt', { tabId });
    try {
      await sendMessageWithRetry(tabId, {
        action: 'executeAction',
        tool: 'waitForDOMStable',
        params: { timeout: 3000, stableTime: 500 }
      });
      return { recovered: true, method: 'dom_wait' };
    } catch (e) {
      return { recovered: false, method: 'dom_wait_failed' };
    }
  },

  async [FAILURE_TYPES.SELECTOR](tabId, error, action) {
    automationLogger.logRecovery(null, 'selector_fail', 'alternative', 'pending', { tabId });
    // This is handled by tryAlternativeAction, but we track it
    return { recovered: false, method: 'needs_alternative_selector' };
  },

  async [FAILURE_TYPES.NETWORK](tabId, error) {
    automationLogger.logRecovery(null, 'network_failure', 'dom_wait', 'attempt', { tabId });
    // Use DOM stability check which also monitors network activity
    const stabilityResult = await pageLoadWatcher.waitForDOMStable(tabId, 3000, 500);
    automationLogger.logRecovery(null, 'network_failure', 'dom_wait', stabilityResult?.success ? 'success' : 'failed', { tabId, ...stabilityResult });
    return { recovered: true, method: 'network_wait', details: stabilityResult };
  },

  async [FAILURE_TYPES.TIMEOUT](tabId, error) {
    automationLogger.logRecovery(null, 'timeout', 'page_ready', 'attempt', { tabId });
    // Use smart page ready detection instead of hardcoded 1000ms
    const readyResult = await pageLoadWatcher.waitForPageReady(tabId, {
      maxWait: 3000,
      requireDOMStable: true,
      stableTime: 300
    });
    automationLogger.logRecovery(null, 'timeout', 'page_ready', readyResult?.success ? 'success' : 'failed', { tabId, ...readyResult });
    return { recovered: true, method: 'timeout_extended', details: readyResult };
  },

  async [FAILURE_TYPES.BF_CACHE](tabId, error) {
    automationLogger.logRecovery(null, 'bfcache', 'wake_page', 'attempt', { tabId });
    try {
      await chrome.tabs.update(tabId, { active: true });
      // Use smart page ready detection instead of hardcoded 500ms
      const loadResult = await pageLoadWatcher.waitForPageReady(tabId, {
        maxWait: 2000,
        requireDOMStable: false // Just need tab complete + health check
      });
      automationLogger.logRecovery(null, 'bfcache', 'wake_page', loadResult.success ? 'success' : 'retry', { tabId, waitTime: loadResult.waitTime });
      if (!loadResult.success) {
        // Fallback: re-inject content script
        await ensureContentScriptInjected(tabId);
      }
      return { recovered: true, method: 'page_wakeup', details: loadResult };
    } catch (e) {
      automationLogger.logRecovery(null, 'bfcache', 'wake_page', 'failed', { tabId, error: e.message });
      return { recovered: false, method: 'wakeup_failed', error: e.message };
    }
  }
};

// Helper function to check if URL is restricted for content script access
function isRestrictedURL(url) {
  if (!url) return true;
  
  const restrictedProtocols = [
    'chrome://',
    'chrome-extension://',
    'moz-extension://',
    'edge://',
    'about:',
    'file://'
  ];
  
  const restrictedPages = [
    'chrome://extensions/',
    'chrome://settings/',
    'chrome://newtab/',
    'chrome://history/',
    'chrome://bookmarks/',
    'chrome://downloads/',
    'chrome://flags/',
    'chrome://version/',
    'chrome://webstore/',
    'edge://extensions/',
    'edge://settings/',
    'about:blank',
    'about:newtab'
  ];
  
  // Check exact matches first
  if (restrictedPages.some(page => url.startsWith(page))) {
    return true;
  }
  
  // Check protocol restrictions
  return restrictedProtocols.some(protocol => url.startsWith(protocol));
}

// Get user-friendly page type description
function getPageTypeDescription(url) {
  if (url.startsWith('chrome://')) return 'Chrome internal page';
  if (url.startsWith('chrome-extension://')) return 'Chrome extension page';
  if (url.startsWith('edge://')) return 'Edge internal page';
  if (url.startsWith('about:')) return 'Browser internal page';
  if (url.startsWith('file://')) return 'Local file';
  return 'Restricted page';
}

// Content script health monitoring with enhanced timeout and retry
async function checkContentScriptHealth(tabId, timeout = 4000) {
  try {
    // Quick check: use port if available and recently active (10s window)
    let portInfo = contentScriptPorts.get(tabId);
    if (portInfo && Date.now() - portInfo.lastHeartbeat < 10000) {
      contentScriptHealth.set(tabId, {
        lastCheck: Date.now(),
        healthy: true,
        failures: 0,
        method: 'port'
      });
      return true;
    }

    // If port not found but we know content script should be there,
    // wait briefly for port reconnection (service worker may have just woken)
    if (!portInfo) {
      automationLogger.debug('Port not found, waiting for potential reconnection', { tabId });
      await new Promise(r => setTimeout(r, 1000)); // Wait 1 second
      portInfo = contentScriptPorts.get(tabId);
      if (portInfo && Date.now() - portInfo.lastHeartbeat < 10000) {
        automationLogger.logComm(null, 'health', 'port_reconnected', true, { tabId });
        contentScriptHealth.set(tabId, {
          lastCheck: Date.now(),
          healthy: true,
          failures: 0,
          method: 'port_reconnect'
        });
        return true;
      }
    }

    // Adaptive timeout for known heavy sites (Google, YouTube)
    let adjustedTimeout = timeout;
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url?.includes('google.com') || tab.url?.includes('youtube.com')) {
        adjustedTimeout = Math.min(timeout * 2.5, 10000);
        automationLogger.debug('Using extended timeout for heavy site', { tabId, url: tab.url, timeout: adjustedTimeout });
      }
    } catch (e) {
      // Tab might not exist, continue with default timeout
    }

    // Message-based check with internal retry
    for (let msgAttempt = 1; msgAttempt <= 2; msgAttempt++) {
      try {
        debugLog('[FSB Background] Sending healthCheck to tab:', { tabId, attempt: msgAttempt });
        // CRITICAL: Use frameId: 0 to target ONLY the main frame
        const healthCheckPromise = chrome.tabs.sendMessage(tabId, {
          action: 'healthCheck'
        }, { frameId: 0 });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), adjustedTimeout)
        );

        const response = await Promise.race([healthCheckPromise, timeoutPromise]);
        debugLog('[FSB Background] healthCheck response', response);

        if (response && response.success) {
          debugLog('[FSB Background] healthCheck successful for tab:', tabId);
          contentScriptHealth.set(tabId, {
            lastCheck: Date.now(),
            healthy: true,
            failures: 0,
            method: 'message'
          });
          return true;
        }
      } catch (e) {
        debugLog('[FSB Background] healthCheck failed', { tabId, error: e.message });
        if (msgAttempt < 2) {
          automationLogger.debug('Message health check failed, retrying', { tabId, attempt: msgAttempt, error: e.message });
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    // All attempts failed
    const health = contentScriptHealth.get(tabId) || { failures: 0 };
    health.lastCheck = Date.now();
    health.healthy = false;
    health.failures++;
    health.lastError = 'All health check attempts failed';
    contentScriptHealth.set(tabId, health);
    return false;
  } catch (error) {
    const health = contentScriptHealth.get(tabId) || { failures: 0 };
    health.lastCheck = Date.now();
    health.healthy = false;
    health.failures++;
    health.lastError = error.message;
    contentScriptHealth.set(tabId, health);
    return false;
  }
}

// Wait for content script to be ready before starting automation
// This prevents the race condition where automation starts before port is established
async function waitForContentScriptReady(tabId, timeout = 5000) {
  const startTime = Date.now();
  const pollInterval = 200;

  while (Date.now() - startTime < timeout) {
    // Check if port is established and has recent heartbeat
    const portInfo = contentScriptPorts.get(tabId);
    if (portInfo && Date.now() - portInfo.lastHeartbeat < 10000) {
      automationLogger.debug('Content script ready via port', { tabId });
      return true;
    }

    // Check if ready status is set
    const readyStatus = contentScriptReadyStatus.get(tabId);
    if (readyStatus && readyStatus.ready) {
      automationLogger.debug('Content script ready via status', { tabId });
      return true;
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  // Timeout reached - try to ensure content script is injected
  automationLogger.debug('Content script ready timeout, ensuring injection', { tabId });
  await ensureContentScriptInjected(tabId);

  // Give it one more check after injection
  const portInfo = contentScriptPorts.get(tabId);
  if (portInfo && Date.now() - portInfo.lastHeartbeat < 10000) {
    automationLogger.debug('Content script ready after injection', { tabId });
    return true;
  }

  const readyStatus = contentScriptReadyStatus.get(tabId);
  if (readyStatus && readyStatus.ready) {
    automationLogger.debug('Content script ready via status after injection', { tabId });
    return true;
  }

  automationLogger.debug('Content script readiness uncertain, proceeding anyway', { tabId });
  return false;
}

function getContentScriptDiagnosticsForTab(tabId, activeTabUrl = '') {
  const portInfo = tabId ? contentScriptPorts.get(tabId) : null;
  const readyStatus = tabId ? contentScriptReadyStatus.get(tabId) : null;
  const lastHeartbeatAt = portInfo?.lastHeartbeat || readyStatus?.timestamp || null;
  const lastHeartbeatAgeMs = lastHeartbeatAt ? Math.max(0, Date.now() - lastHeartbeatAt) : null;
  const readinessSource = portInfo
    ? 'port'
    : (readyStatus?.method || (readyStatus?.ready ? 'ready-status' : null));

  return {
    ready: Boolean(readyStatus?.ready || (portInfo && lastHeartbeatAgeMs !== null && lastHeartbeatAgeMs <= 10000)),
    portConnected: Boolean(portInfo),
    lastHeartbeatAgeMs,
    lastReadyAt: readyStatus?.timestamp || null,
    lastReadyUrl: readyStatus?.url || activeTabUrl || null,
    readinessSource
  };
}

async function collectMcpDiagnosticsSnapshot() {
  let activeTab = {
    id: null,
    url: '',
    title: '',
    windowId: null,
    restricted: true,
    pageType: 'No active tab'
  };

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      const currentUrl = tab.url || '';
      activeTab = {
        id: Number.isFinite(tab.id) ? tab.id : null,
        url: currentUrl,
        title: tab.title || '',
        windowId: Number.isFinite(tab.windowId) ? tab.windowId : null,
        restricted: isRestrictedURL(currentUrl),
        pageType: currentUrl ? (isRestrictedURL(currentUrl) ? getPageTypeDescription(currentUrl) : 'Web page') : 'No active tab'
      };
    }
  } catch (_error) {}

  let bridgeClient = null;
  try {
    if (chrome.storage?.session?.get) {
      const stored = await chrome.storage.session.get(['mcpBridgeState']);
      bridgeClient = stored?.mcpBridgeState || null;
    }
  } catch (_error) {}

  return {
    success: true,
    activeTab,
    contentScript: getContentScriptDiagnosticsForTab(activeTab.id, activeTab.url),
    bridgeClient
  };
}

// Enhanced content script injection with retry logic and page load checks
async function ensureContentScriptInjected(tabId, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Wait for page to be fully loaded before health check
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'loading') {
        automationLogger.logComm(null, 'health', 'tab_loading', true, { tabId, status: 'waiting' });
        await new Promise(resolve => {
          const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          // Timeout after 5 seconds
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }, 5000);
        });
      }

      // Check port connection first - most reliable indicator
      const portInfo = contentScriptPorts.get(tabId);
      if (portInfo && Date.now() - portInfo.lastHeartbeat < 10000) {
        automationLogger.logComm(null, 'health', 'port_healthy', true, { tabId, source: 'port' });
        return true;
      }

      // Then check if we already received a ready signal
      const readyStatus = contentScriptReadyStatus.get(tabId);
      if (readyStatus && readyStatus.ready) {
        automationLogger.logComm(null, 'health', 'ready_signal', true, { tabId, source: 'cached' });
        // Still do a health check to be sure
        const isHealthy = await checkContentScriptHealth(tabId);
        if (isHealthy) {
          return true;
        }
        // Ready signal received but health check failed
        // Don't delete ready status if port method was used - port disconnect handles cleanup
        if (readyStatus.method !== 'port') {
          contentScriptReadyStatus.delete(tabId);
        }
      }

      // Check if content script is already healthy (might be from previous injection)
      const isHealthy = await checkContentScriptHealth(tabId);
      if (isHealthy) {
        automationLogger.logComm(null, 'health', 'healthCheck', true, { tabId, source: 'existing' });
        contentScriptReadyStatus.set(tabId, { ready: true, timestamp: Date.now() });
        return true;
      }

      // Check if script might already be injected but not responsive
      // Prevent double injection by checking port existence
      const existingPorts = chrome.runtime.getContexts?.({
        contextTypes: ['TAB'],
        tabIds: [tabId]
      });
      if (existingPorts && (await existingPorts).length > 0) {
        automationLogger.logComm(null, 'health', 'context_check', true, { tabId, contextExists: true });
        // Use smart ping instead of hardcoded 500ms delay
        const recheckHealthy = await pageLoadWatcher.pingContentScript(tabId, 1000);
        if (recheckHealthy) {
          automationLogger.logComm(null, 'health', 'ping', true, { tabId });
          return true;
        }
      }

      // Check if content script was recently healthy - likely just needs time to reconnect
      const recentHealth = contentScriptHealth.get(tabId);
      if (recentHealth && Date.now() - recentHealth.lastCheck < 30000 && recentHealth.healthy) {
        automationLogger.debug('Content script was recently healthy, skipping re-injection', { tabId });
        // Just wait a bit more for reconnection instead of re-injecting
        await new Promise(r => setTimeout(r, 1500));
        const recheckHealthy = await checkContentScriptHealth(tabId);
        if (recheckHealthy) {
          automationLogger.logComm(null, 'health', 'reconnected_after_wait', true, { tabId });
          return true;
        }
      }

      // Inject content script modules - target only main frame to avoid iframe issues
      // Files are loaded in dependency order from CONTENT_SCRIPT_FILES constant:
      // automation-logger first, then init.js (namespace), then domain modules,
      // then messaging/lifecycle last (they depend on all above).
      automationLogger.logComm(null, 'send', 'inject', true, { tabId, attempt });

      // Clear re-injection guards so content scripts re-initialize with fresh extension context.
      // After extension reload, old content scripts have invalidated chrome.runtime contexts.
      // This lets the new injection create scripts with valid chrome.runtime.id.
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        world: 'ISOLATED',
        injectImmediately: true,
        func: () => {
          globalThis.__FSB_AUTOMATION_LOGGER_LOADED__ = false;
          if (window.FSB) window.FSB = undefined;
          window.__FSB_SKIP_INIT__ = false;
        }
      });

      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [0] },  // frameIds: [0] = main frame only
        files: CONTENT_SCRIPT_FILES,
        world: 'ISOLATED',  // Explicitly specify isolated world
        injectImmediately: true  // Don't wait for document_idle
      });

      // Wait for ready signal or timeout
      automationLogger.logComm(null, 'receive', 'ready_signal', true, { tabId, status: 'waiting' });
      const readySignalReceived = await new Promise((resolve) => {
        const startTime = Date.now();
        const maxWaitTime = 1000 * attempt; // Progressive: 1s, 2s, 3s

        const checkInterval = setInterval(() => {
          const readyStatus = contentScriptReadyStatus.get(tabId);
          if (readyStatus && readyStatus.ready) {
            clearInterval(checkInterval);
            automationLogger.logComm(null, 'receive', 'ready_signal', true, { tabId, waitTime: Date.now() - startTime });
            resolve(true);
          } else if (Date.now() - startTime > maxWaitTime) {
            clearInterval(checkInterval);
            automationLogger.logComm(null, 'receive', 'ready_signal', false, { tabId, timeout: maxWaitTime });
            resolve(false);
          }
        }, 100); // Check every 100ms
      });

      // If ready signal received, do one health check to confirm
      if (readySignalReceived) {
        const healthAfterReady = await checkContentScriptHealth(tabId);
        if (healthAfterReady) {
          automationLogger.logComm(null, 'health', 'healthCheck', true, { tabId, attempt, source: 'after_ready' });
          return true;
        }
      }

      // Fallback: Check health multiple times even without ready signal
      automationLogger.logComm(null, 'health', 'fallback_check', true, { tabId, reason: 'no_ready_signal' });
      for (let healthAttempt = 1; healthAttempt <= 3; healthAttempt++) {
        const healthAfterInjection = await checkContentScriptHealth(tabId);
        if (healthAfterInjection) {
          automationLogger.logComm(null, 'health', 'healthCheck', true, { tabId, attempt, healthAttempt });
          contentScriptReadyStatus.set(tabId, { ready: true, timestamp: Date.now() });
          return true;
        }
        // Use progressive ping timeout instead of hardcoded 500ms delay
        if (healthAttempt < 3) {
          const pingOk = await pageLoadWatcher.pingContentScript(tabId, 500 * healthAttempt);
          if (pingOk) {
            automationLogger.logComm(null, 'health', 'ping', true, { tabId, healthAttempt });
            contentScriptReadyStatus.set(tabId, { ready: true, timestamp: Date.now() });
            return true;
          }
        }
      }

    } catch (error) {
      automationLogger.logComm(null, 'send', 'inject', false, { tabId, attempt, error: error.message });
      if (attempt === maxRetries) {
        throw new Error(`Failed to inject content script after ${maxRetries} attempts: ${error.message}`);
      }
      // Exponential backoff between retries: 1000ms, 2000ms, 4000ms
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }
  }
  return false;
}

function fsbTriggerObserveWatchdogName(triggerId) {
  return FSB_TRIGGER_OBSERVE_WATCHDOG_PREFIX + triggerId;
}

function fsbTriggerSnapshotId(snap) {
  return snap && typeof snap.trigger_id === 'string' && snap.trigger_id ? snap.trigger_id : null;
}

function fsbTriggerIsLiveObserveSnapshot(snap) {
  if (!snap || snap.status !== 'armed') return false;
  return snap.watch === 'live-observe' || snap.watch === 'live_observe' || snap.mode === 'live-observe';
}

function fsbTriggerIsRefreshPollSnapshot(snap) {
  if (!snap || snap.status !== 'armed') return false;
  return snap.watch === 'refresh-poll' || snap.watch === 'refresh_poll' || snap.mode === 'refresh-poll';
}

const fsbTriggerRefreshPollTabLocks = new Map();
const fsbTriggerRefreshPollPendingTabRescans = new Map();

function fsbTriggerValidateRefreshPollOwnership(snap) {
  const tabId = Number(snap && snap.target_tab_id);
  const rawAgentId = snap && snap.agent_id;
  const agentId = (typeof rawAgentId === 'string') ? rawAgentId.trim() : '';
  const base = {
    requestedTabId: Number.isFinite(tabId) ? tabId : snap && snap.target_tab_id,
    requestingAgentId: agentId || rawAgentId || null
  };

  if (!Number.isFinite(tabId)) {
    return Object.assign({ ok: false, code: 'INVALID_TAB_ID' }, base);
  }
  if (!agentId) {
    return Object.assign({ ok: false, code: 'AGENT_NOT_REGISTERED' }, base, {
      requestedTabId: tabId,
      requestingAgentId: agentId || null
    });
  }

  const registry = globalThis && globalThis.fsbAgentRegistryInstance;
  if (!registry) {
    return Object.assign({ ok: false, code: 'AGENT_REGISTRY_UNAVAILABLE' }, base, {
      requestedTabId: tabId,
      requestingAgentId: agentId
    });
  }

  if (typeof registry.hasAgent === 'function' && registry.hasAgent(agentId) === false) {
    return {
      ok: false,
      code: 'AGENT_NOT_REGISTERED',
      requestedTabId: tabId,
      requestingAgentId: agentId
    };
  }

  const owner = (typeof registry.getOwner === 'function') ? registry.getOwner(tabId) : null;
  if (owner && owner !== agentId) {
    return {
      ok: false,
      code: 'TAB_NOT_OWNED',
      ownerAgentId: owner,
      requestedTabId: tabId,
      requestingAgentId: agentId
    };
  }

  const snapshotOwnershipToken = snap && typeof snap.ownership_token === 'string'
    ? snap.ownership_token
    : (snap && typeof snap.ownershipToken === 'string' ? snap.ownershipToken : undefined);
  const tabMetadata = (typeof registry.getTabMetadata === 'function') ? registry.getTabMetadata(tabId) : null;
  const registryOwnershipToken = tabMetadata && typeof tabMetadata.ownershipToken === 'string'
    ? tabMetadata.ownershipToken
    : null;
  if (registryOwnershipToken && !snapshotOwnershipToken) {
    return {
      ok: false,
      code: 'TAB_NOT_OWNED',
      ownerAgentId: owner || null,
      requestedTabId: tabId,
      requestingAgentId: agentId
    };
  }

  if (typeof registry.isOwnedBy === 'function' && registry.isOwnedBy(tabId, agentId, snapshotOwnershipToken) === false) {
    return {
      ok: false,
      code: 'TAB_NOT_OWNED',
      ownerAgentId: owner || null,
      requestedTabId: tabId,
      requestingAgentId: agentId
    };
  }

  return { ok: true, tabId, agentId, registry };
}

function fsbTriggerExtractKind(snap) {
  const condition = snap && snap.condition && typeof snap.condition === 'object' ? snap.condition : {};
  return snap.extract || condition.extract || 'text';
}

function fsbTriggerAttrName(snap) {
  const condition = snap && snap.condition && typeof snap.condition === 'object' ? snap.condition : {};
  return snap.attrName || snap.attribute || condition.attrName || condition.attribute || null;
}

function fsbTriggerObserveMessage(snap) {
  return {
    action: 'triggerObserveStart',
    trigger_id: fsbTriggerSnapshotId(snap),
    selector: snap.selector,
    extract: fsbTriggerExtractKind(snap),
    attrName: fsbTriggerAttrName(snap)
  };
}

async function fsbTriggerArmObserveWatchdog(triggerId) {
  if (!triggerId || !chrome.alarms || typeof chrome.alarms.create !== 'function') return;
  try {
    const created = chrome.alarms.create(fsbTriggerObserveWatchdogName(triggerId), {
      periodInMinutes: FSB_TRIGGER_OBSERVE_WATCHDOG_PERIOD_MINUTES
    });
    if (created && typeof created.catch === 'function') {
      created.catch(function() { /* best-effort */ });
    }
  } catch (_e) { /* best-effort */ }
}

async function fsbTriggerClearObserveWatchdog(triggerId) {
  if (!triggerId || !chrome.alarms || typeof chrome.alarms.clear !== 'function') return;
  try {
    const cleared = chrome.alarms.clear(fsbTriggerObserveWatchdogName(triggerId));
    if (cleared && typeof cleared.catch === 'function') {
      cleared.catch(function() { /* best-effort */ });
    }
  } catch (_e) { /* best-effort */ }
}

async function fsbTriggerSendTabMessage(tabId, payload) {
  if (!Number.isFinite(Number(tabId)) || !chrome.tabs || typeof chrome.tabs.sendMessage !== 'function') {
    return { ok: false, reason: 'tabs_unavailable' };
  }
  try {
    await chrome.tabs.sendMessage(Number(tabId), payload);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'send_failed', error: err && err.message ? err.message : String(err) };
  }
}

async function fsbTriggerStartObserveForSnapshot(snap, reason) {
  const triggerId = fsbTriggerSnapshotId(snap);
  const tabId = Number(snap && snap.target_tab_id);
  if (!triggerId || !Number.isFinite(tabId) || !snap.selector) {
    return { ok: false, reason: 'invalid_snapshot' };
  }
  await ensureContentScriptInjected(tabId);
  const observeResult = await fsbTriggerSendTabMessage(tabId, fsbTriggerObserveMessage(snap));
  const pulseResult = await fsbTriggerSendTabMessage(tabId, {
    action: 'triggerPulseStart',
    selector: snap.selector,
    reason: reason || 'trigger-watch'
  });
  await fsbTriggerArmObserveWatchdog(triggerId);
  return { ok: observeResult.ok !== false, observe: observeResult, pulse: pulseResult };
}

async function fsbTriggerStopObserveForSnapshot(snap) {
  const triggerId = fsbTriggerSnapshotId(snap);
  const tabId = Number(snap && snap.target_tab_id);
  if (!triggerId || !Number.isFinite(tabId)) return;
  await fsbTriggerSendTabMessage(tabId, { action: 'triggerObserveStop', trigger_id: triggerId });
  await fsbTriggerSendTabMessage(tabId, { action: 'triggerPulseStop', trigger_id: triggerId });
}

function fsbTriggerCopyReportedAttributes(attributes) {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return null;
  const out = {};
  Object.keys(attributes).slice(0, 50).forEach((name) => {
    const value = attributes[name];
    if (typeof name === 'string' && typeof value === 'string') {
      out[name] = value.slice(0, FSB_TRIGGER_REPORTED_TEXT_MAX);
    }
  });
  return Object.keys(out).length ? out : null;
}

async function fsbTriggerWaitForRefreshPollReady(tabId) {
  if (typeof pageLoadWatcher !== 'undefined'
      && pageLoadWatcher
      && typeof pageLoadWatcher.waitForPageReady === 'function') {
    try {
      const ready = await pageLoadWatcher.waitForPageReady(tabId, {
        maxWait: 30000,
        requireDOMStable: false
      });
      if (ready && ready.success !== false) return ready;
    } catch (_err) { /* fall through to explicit tab completion polling */ }
  }

  if (!chrome.tabs || typeof chrome.tabs.get !== 'function') {
    return { success: false, method: 'tabs-unavailable' };
  }

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab || tab.status === 'complete') {
        return { success: true, method: 'tabs.get' };
      }
    } catch (err) {
      return { success: false, method: 'tabs.get-error', error: err && err.message ? err.message : String(err) };
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return { success: false, method: 'tabs.get-timeout' };
}

async function fsbTriggerSendRefreshPollRead(tabId, snap) {
  if (!Number.isFinite(Number(tabId)) || !chrome.tabs || typeof chrome.tabs.sendMessage !== 'function') {
    return { ok: false, success: false, reason: 'tabs_unavailable' };
  }
  const numericTabId = Number(tabId);
  await ensureContentScriptInjected(tabId);
  return chrome.tabs.sendMessage(numericTabId, {
    action: 'triggerRead',
    selector: snap.selector,
    extract: fsbTriggerExtractKind(snap),
    attrName: fsbTriggerAttrName(snap)
  }, { frameId: 0 });
}


async function fsbTriggerGetRefreshPollTabState(tabId) {
  if (!chrome.tabs || typeof chrome.tabs.get !== 'function') {
    return { blocked: false, url: '' };
  }
  try {
    const tab = await chrome.tabs.get(tabId);
    const url = tab && (typeof tab.url === 'string' ? tab.url : (typeof tab.pendingUrl === 'string' ? tab.pendingUrl : ''));
    if (!url || isRestrictedURL(url)) {
      return { blocked: true, blocked_reason: 'restricted_url', url: url || '' };
    }
    return { blocked: false, url };
  } catch (err) {
    return {
      blocked: true,
      blocked_reason: 'restricted_url',
      url: '',
      error: err && err.message ? err.message : String(err)
    };
  }
}

function fsbTriggerBuildBlockedAttention(snap, blockedReason, url, extra) {
  return Object.assign({
    selector: snap && snap.selector,
    code: 'TRIGGER_PAGE_BLOCKED',
    blocked_reason: blockedReason || 'challenge',
    url: typeof url === 'string' ? url : ''
  }, extra || {});
}

async function fsbTriggerMarkRefreshPollAttention(triggerId, snap, reason, extra) {
  if (!triggerId || typeof triggerId !== 'string') {
    return { ok: false, reason: 'invalid_trigger_id' };
  }
  if (typeof FsbTriggerStore === 'undefined' || !FsbTriggerStore || typeof FsbTriggerStore.writeSnapshot !== 'function') {
    return { ok: false, reason: 'store_unavailable' };
  }
  const now = Date.now();
  if (reason === 'blocked') {
    snap.status = 'blocked';
  } else {
    snap.status = 'needs_attention';
  }
  snap.attention_reason = reason;
  snap.attention_at = now;
  snap.last_attention = Object.assign({ reason, at: now }, extra || {});
  await FsbTriggerStore.writeSnapshot(triggerId, snap);
  return { ok: true, action: snap.status, reason };
}

function fsbTriggerCollectDueRefreshPollSnapshots(records, tabId, nowMs, requiredTriggerId) {
  if (!records || typeof records !== 'object') return [];
  const out = [];
  const numericTabId = Number(tabId);
  const keys = Object.keys(records);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    let snapshot = records[key];
    if (!fsbTriggerIsRefreshPollSnapshot(snapshot)) continue;
    if (Number(snapshot.target_tab_id) !== numericTabId) continue;
    const triggerId = fsbTriggerSnapshotId(snapshot) || key;
    if (triggerId === requiredTriggerId || Number(snapshot.next_poll_at || 0) <= nowMs) {
      if (!fsbTriggerSnapshotId(snapshot) && typeof key === 'string' && key) {
        snapshot = Object.assign({ trigger_id: key }, snapshot);
      }
      out.push(snapshot);
    }
  }
  return out;
}

function fsbTriggerAddRefreshPollCandidate(candidates, seen, snap, fallbackTriggerId, tabId) {
  if (!fsbTriggerIsRefreshPollSnapshot(snap)) return;
  if (Number(snap.target_tab_id) !== Number(tabId)) return;
  const triggerId = fsbTriggerSnapshotId(snap) || fallbackTriggerId;
  if (!triggerId || seen[triggerId]) return;
  seen[triggerId] = true;
  candidates.push({ triggerId, snap });
}

async function fsbTriggerReadRefreshPollRecords() {
  if (typeof FsbTriggerStore === 'undefined' || !FsbTriggerStore) return {};
  if (typeof FsbTriggerStore.hydrate === 'function') {
    const envelope = await FsbTriggerStore.hydrate();
    return envelope && envelope.records && typeof envelope.records === 'object'
      ? envelope.records
      : {};
  }
  return {};
}

async function fsbTriggerWithRefreshPollTabLock(tabId, task) {
  const key = String(Number(tabId));
  const existing = fsbTriggerRefreshPollTabLocks.get(key);
  if (existing) {
    fsbTriggerRefreshPollPendingTabRescans.set(key, true);
    return existing;
  }
  const promise = Promise.resolve()
    .then(async () => {
      const result = await task();
      while (fsbTriggerRefreshPollPendingTabRescans.get(key)) {
        fsbTriggerRefreshPollPendingTabRescans.delete(key);
        await fsbTriggerRunRefreshPollTabBatchUnlocked(Number(tabId), null, null);
      }
      return result;
    })
    .finally(() => {
      if (fsbTriggerRefreshPollTabLocks.get(key) === promise) {
        fsbTriggerRefreshPollTabLocks.delete(key);
      }
      fsbTriggerRefreshPollPendingTabRescans.delete(key);
    });
  fsbTriggerRefreshPollTabLocks.set(key, promise);
  return promise;
}

async function fsbTriggerEvaluateRefreshPollAfterReload(triggerId, snap, tabId, preReloadTab, postReloadTab) {
  if (!fsbTriggerIsRefreshPollSnapshot(snap)) {
    return { ok: true, ignored: true };
  }
  if (!snap.selector) {
    return fsbTriggerMarkRefreshPollAttention(triggerId, snap, 'invalid_selector');
  }
  if (postReloadTab && postReloadTab.blocked) {
    return fsbTriggerMarkRefreshPollAttention(triggerId, snap, 'blocked',
      fsbTriggerBuildBlockedAttention(snap, 'restricted_url', postReloadTab.url, { error: postReloadTab.error }));
  }

  let readResult;
  try {
    readResult = await fsbTriggerSendRefreshPollRead(tabId, snap);
  } catch (err) {
    return fsbTriggerMarkRefreshPollAttention(triggerId, snap, 'read_failed', {
      selector: snap.selector,
      error: err && err.message ? err.message : String(err)
    });
  }

  if (readResult && readResult.code === 'TRIGGER_PAGE_BLOCKED') {
    return fsbTriggerMarkRefreshPollAttention(triggerId, snap, 'blocked',
      fsbTriggerBuildBlockedAttention(snap, readResult.blocked_reason, readResult.url));
  }
  if (readResult && (readResult.code === 'ELEMENT_NOT_FOUND' || readResult.reason === 'element_not_found')) {
    return fsbTriggerMarkRefreshPollAttention(triggerId, snap, 'element_not_found', { selector: snap.selector, code: 'ELEMENT_NOT_FOUND' });
  }
  if (!readResult || readResult.success === false || readResult.ok === false || !readResult.value || typeof readResult.value !== 'object') {
    return fsbTriggerMarkRefreshPollAttention(triggerId, snap, 'read_failed', {
      selector: snap.selector,
      code: readResult && readResult.code,
      error: readResult && (readResult.error || readResult.reason)
    });
  }

  const value = readResult.value;
  const now = Date.now();
  snap.reported_value = (typeof value.text === 'string')
    ? value.text.slice(0, FSB_TRIGGER_REPORTED_TEXT_MAX)
    : snap.last_value;
  const attrs = fsbTriggerCopyReportedAttributes(value.attributes);
  if (attrs) snap.reported_attributes = attrs;
  const reportedUrl = fsbTriggerFirstString(
    readResult && readResult.url,
    readResult && readResult.current_url,
    postReloadTab && postReloadTab.url,
    preReloadTab && preReloadTab.url,
    snap.reported_url,
    snap.url
  );
  if (reportedUrl) snap.reported_url = reportedUrl;
  snap.last_reported_at = now;
  await FsbTriggerStore.writeSnapshot(triggerId, snap);

  let seamResult = { ok: false, reason: 'lifecycle_unavailable' };
  if (typeof FsbTriggerLifecycle !== 'undefined'
      && FsbTriggerLifecycle
      && typeof FsbTriggerLifecycle.handleTriggerAlarm === 'function'
      && FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX) {
    seamResult = await FsbTriggerLifecycle.handleTriggerAlarm({
      name: FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX + triggerId
    });
  }

  if (seamResult && seamResult.action !== 'fired'
      && typeof FsbTriggerLifecycle !== 'undefined'
      && FsbTriggerLifecycle
      && typeof FsbTriggerLifecycle.scheduleNextRefreshPollAlarm === 'function') {
    const latestSnap = await FsbTriggerStore.readSnapshot(triggerId);
    if (fsbTriggerIsRefreshPollSnapshot(latestSnap) && latestSnap.status === 'armed') {
      await fsbTriggerSendTabMessage(tabId, {
        action: 'triggerPulseStart',
        selector: latestSnap.selector,
        reason: 'refresh-poll'
      });
      await FsbTriggerLifecycle.scheduleNextRefreshPollAlarm(latestSnap, Date.now());
      await FsbTriggerStore.writeSnapshot(triggerId, latestSnap);
    }
  }

  return { ok: true, action: 'evaluated', result: seamResult };
}

async function fsbTriggerRunRefreshPollTabBatch(requiredTriggerId, requiredSnap) {
  const tabId = Number(requiredSnap && requiredSnap.target_tab_id);
  if (!Number.isFinite(tabId)) {
    return fsbTriggerRunRefreshPollTick(requiredTriggerId, requiredSnap);
  }
  return fsbTriggerWithRefreshPollTabLock(tabId, () => (
    fsbTriggerRunRefreshPollTabBatchUnlocked(tabId, requiredTriggerId, requiredSnap)
  ));
}

async function fsbTriggerRunRefreshPollTabBatchUnlocked(tabId, requiredTriggerId, requiredSnap) {
  if (typeof FsbTriggerStore === 'undefined'
      || !FsbTriggerStore
      || typeof FsbTriggerStore.writeSnapshot !== 'function'
      || typeof FsbTriggerStore.readSnapshot !== 'function') {
    return { ok: false, reason: 'store_unavailable' };
  }

  const records = await fsbTriggerReadRefreshPollRecords();
  const dueSnapshots = fsbTriggerCollectDueRefreshPollSnapshots(records, tabId, Date.now(), requiredTriggerId);
  const seen = {};
  const candidates = [];
  for (let i = 0; i < dueSnapshots.length; i++) {
    fsbTriggerAddRefreshPollCandidate(candidates, seen, dueSnapshots[i], null, tabId);
  }
  fsbTriggerAddRefreshPollCandidate(candidates, seen, requiredSnap, requiredTriggerId, tabId);

  const results = {};
  const eligible = [];
  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i];
    if (!item.snap.selector) {
      results[item.triggerId] = await fsbTriggerMarkRefreshPollAttention(item.triggerId, item.snap, 'invalid_selector');
      continue;
    }
    const ownership = fsbTriggerValidateRefreshPollOwnership(item.snap);
    if (!ownership || ownership.ok !== true) {
      results[item.triggerId] = await fsbTriggerMarkRefreshPollAttention(
        item.triggerId,
        item.snap,
        'ownership_failed',
        ownership || { code: 'OWNERSHIP_VALIDATION_FAILED' }
      );
      continue;
    }
    eligible.push({ triggerId: item.triggerId, snap: item.snap, ownership });
  }

  if (!eligible.length) {
    return { ok: true, action: 'refresh_poll_batch_empty', tab_id: tabId, results };
  }

  if (!chrome.tabs || typeof chrome.tabs.reload !== 'function') {
    for (let i = 0; i < eligible.length; i++) {
      const item = eligible[i];
      results[item.triggerId] = await fsbTriggerMarkRefreshPollAttention(item.triggerId, item.snap, 'read_failed', {
        selector: item.snap.selector,
        code: 'TABS_UNAVAILABLE',
        requestedTabId: tabId,
        requestingAgentId: item.ownership.agentId
      });
    }
    return { ok: true, action: 'refresh_poll_batch_attention', tab_id: tabId, results };
  }

  const preReloadTab = await fsbTriggerGetRefreshPollTabState(tabId);
  if (preReloadTab && preReloadTab.blocked) {
    for (let i = 0; i < eligible.length; i++) {
      const item = eligible[i];
      results[item.triggerId] = await fsbTriggerMarkRefreshPollAttention(item.triggerId, item.snap, 'blocked',
        fsbTriggerBuildBlockedAttention(item.snap, 'restricted_url', preReloadTab.url, { error: preReloadTab.error }));
    }
    return { ok: true, action: 'refresh_poll_batch_blocked', tab_id: tabId, results };
  }

  const registry = eligible[0] && eligible[0].ownership && eligible[0].ownership.registry;
  if (registry && typeof registry.stampAgentNavigation === 'function') {
    try {
      registry.stampAgentNavigation(tabId);
    } catch (_err) { /* best-effort navigation stamp */ }
  }

  let postReloadTab = null;
  try {
    await chrome.tabs.reload(tabId);
    await fsbTriggerWaitForRefreshPollReady(tabId);
    postReloadTab = await fsbTriggerGetRefreshPollTabState(tabId);
  } catch (err) {
    for (let i = 0; i < eligible.length; i++) {
      const item = eligible[i];
      results[item.triggerId] = await fsbTriggerMarkRefreshPollAttention(item.triggerId, item.snap, 'read_failed', {
        selector: item.snap.selector,
        error: err && err.message ? err.message : String(err)
      });
    }
    return { ok: true, action: 'refresh_poll_batch_attention', tab_id: tabId, results };
  }

  if (postReloadTab && postReloadTab.blocked) {
    for (let i = 0; i < eligible.length; i++) {
      const item = eligible[i];
      results[item.triggerId] = await fsbTriggerMarkRefreshPollAttention(item.triggerId, item.snap, 'blocked',
        fsbTriggerBuildBlockedAttention(item.snap, 'restricted_url', postReloadTab.url, { error: postReloadTab.error }));
    }
    return { ok: true, action: 'refresh_poll_batch_blocked', tab_id: tabId, results };
  }

  for (let i = 0; i < eligible.length; i++) {
    const item = eligible[i];
    try {
      const latestSnap = await FsbTriggerStore.readSnapshot(item.triggerId);
      if (!fsbTriggerIsRefreshPollSnapshot(latestSnap) || Number(latestSnap.target_tab_id) !== Number(tabId)) {
        results[item.triggerId] = { ok: true, ignored: true };
        continue;
      }
      results[item.triggerId] = await fsbTriggerEvaluateRefreshPollAfterReload(
        item.triggerId,
        latestSnap,
        tabId,
        preReloadTab,
        postReloadTab
      );
    } catch (err) {
      results[item.triggerId] = await fsbTriggerMarkRefreshPollAttention(item.triggerId, item.snap, 'read_failed', {
        selector: item.snap.selector,
        error: err && err.message ? err.message : String(err)
      });
    }
  }

  return {
    ok: true,
    action: 'refresh_poll_batch',
    tab_id: tabId,
    batch_size: eligible.length,
    results
  };
}

async function fsbTriggerRunRefreshPollTick(triggerId, snap) {
  if (!triggerId || typeof triggerId !== 'string') {
    return { ok: false, reason: 'invalid_trigger_id' };
  }
  if (!fsbTriggerIsRefreshPollSnapshot(snap)) {
    return { ok: true, ignored: true };
  }
  if (!snap.selector) {
    return fsbTriggerMarkRefreshPollAttention(triggerId, snap, 'invalid_selector');
  }
  if (typeof FsbTriggerStore === 'undefined'
      || !FsbTriggerStore
      || typeof FsbTriggerStore.writeSnapshot !== 'function'
      || typeof FsbTriggerStore.readSnapshot !== 'function') {
    return { ok: false, reason: 'store_unavailable' };
  }

  const ownership = fsbTriggerValidateRefreshPollOwnership(snap);
  if (!ownership || ownership.ok !== true) {
    return fsbTriggerMarkRefreshPollAttention(
      triggerId,
      snap,
      'ownership_failed',
      ownership || { code: 'OWNERSHIP_VALIDATION_FAILED' }
    );
  }
  const tabId = ownership.tabId;
  const registry = ownership.registry;

  if (!chrome.tabs || typeof chrome.tabs.reload !== 'function') {
    return fsbTriggerMarkRefreshPollAttention(triggerId, snap, 'read_failed', {
      selector: snap.selector,
      code: 'TABS_UNAVAILABLE',
      requestedTabId: tabId,
      requestingAgentId: ownership.agentId
    });
  }

  const preReloadTab = await fsbTriggerGetRefreshPollTabState(tabId);
  if (preReloadTab && preReloadTab.blocked) {
    return fsbTriggerMarkRefreshPollAttention(triggerId, snap, 'blocked',
      fsbTriggerBuildBlockedAttention(snap, 'restricted_url', preReloadTab.url, { error: preReloadTab.error }));
  }

  if (registry && typeof registry.stampAgentNavigation === 'function') {
    try {
      registry.stampAgentNavigation(tabId);
    } catch (_err) { /* best-effort navigation stamp */ }
  }

  let readResult;
  let postReloadTab = null;
  try {
    await chrome.tabs.reload(tabId);
    await fsbTriggerWaitForRefreshPollReady(tabId);

    postReloadTab = await fsbTriggerGetRefreshPollTabState(tabId);
    if (postReloadTab && postReloadTab.blocked) {
      return fsbTriggerMarkRefreshPollAttention(triggerId, snap, 'blocked',
        fsbTriggerBuildBlockedAttention(snap, 'restricted_url', postReloadTab.url, { error: postReloadTab.error }));
    }

    readResult = await fsbTriggerSendRefreshPollRead(tabId, snap);
  } catch (err) {
    return fsbTriggerMarkRefreshPollAttention(triggerId, snap, 'read_failed', {
      selector: snap.selector,
      error: err && err.message ? err.message : String(err)
    });
  }

  if (readResult && readResult.code === 'TRIGGER_PAGE_BLOCKED') {
    return fsbTriggerMarkRefreshPollAttention(triggerId, snap, 'blocked',
      fsbTriggerBuildBlockedAttention(snap, readResult.blocked_reason, readResult.url));
  }
  if (readResult && (readResult.code === 'ELEMENT_NOT_FOUND' || readResult.reason === 'element_not_found')) {
    return fsbTriggerMarkRefreshPollAttention(triggerId, snap, 'element_not_found', { selector: snap.selector, code: 'ELEMENT_NOT_FOUND' });
  }
  if (!readResult || readResult.success === false || readResult.ok === false || !readResult.value || typeof readResult.value !== 'object') {
    return fsbTriggerMarkRefreshPollAttention(triggerId, snap, 'read_failed', {
      selector: snap.selector,
      code: readResult && readResult.code,
      error: readResult && (readResult.error || readResult.reason)
    });
  }

  const value = readResult.value;
  const now = Date.now();
  snap.reported_value = (typeof value.text === 'string')
    ? value.text.slice(0, FSB_TRIGGER_REPORTED_TEXT_MAX)
    : snap.last_value;
  const attrs = fsbTriggerCopyReportedAttributes(value.attributes);
  if (attrs) snap.reported_attributes = attrs;
  const reportedUrl = fsbTriggerFirstString(
    readResult && readResult.url,
    readResult && readResult.current_url,
    postReloadTab && postReloadTab.url,
    preReloadTab && preReloadTab.url,
    snap.reported_url,
    snap.url
  );
  if (reportedUrl) snap.reported_url = reportedUrl;
  snap.last_reported_at = now;
  await FsbTriggerStore.writeSnapshot(triggerId, snap);

  let seamResult = { ok: false, reason: 'lifecycle_unavailable' };
  if (typeof FsbTriggerLifecycle !== 'undefined'
      && FsbTriggerLifecycle
      && typeof FsbTriggerLifecycle.handleTriggerAlarm === 'function'
      && FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX) {
    seamResult = await FsbTriggerLifecycle.handleTriggerAlarm({
      name: FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX + triggerId
    });
  }

  if (seamResult && seamResult.action !== 'fired'
      && typeof FsbTriggerLifecycle !== 'undefined'
      && FsbTriggerLifecycle
      && typeof FsbTriggerLifecycle.scheduleNextRefreshPollAlarm === 'function') {
    const latestSnap = await FsbTriggerStore.readSnapshot(triggerId);
    if (fsbTriggerIsRefreshPollSnapshot(latestSnap) && latestSnap.status === 'armed') {
      await fsbTriggerSendTabMessage(tabId, {
        action: 'triggerPulseStart',
        selector: latestSnap.selector,
        reason: 'refresh-poll'
      });
      await FsbTriggerLifecycle.scheduleNextRefreshPollAlarm(latestSnap, Date.now());
      await FsbTriggerStore.writeSnapshot(triggerId, latestSnap);
    }
  }

  return { ok: true, action: 'evaluated', result: seamResult };
}

async function fsbTriggerHandleRefreshPollAlarm(alarm) {
  if (typeof FsbTriggerLifecycle === 'undefined'
      || !FsbTriggerLifecycle
      || !FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX
      || !alarm
      || typeof alarm.name !== 'string'
      || !alarm.name.startsWith(FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX)) {
    return { handled: false };
  }

  const triggerId = alarm.name.slice(FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX.length);
  if (!triggerId) {
    return { handled: false, reason: 'malformed_alarm_name' };
  }

  if (typeof FsbTriggerStore === 'undefined' || !FsbTriggerStore || typeof FsbTriggerStore.readSnapshot !== 'function') {
    return { handled: false, reason: 'store_unavailable' };
  }

  try {
    const snap = await FsbTriggerStore.readSnapshot(triggerId);
    if (!fsbTriggerIsRefreshPollSnapshot(snap)) {
      return { handled: false };
    }
    const result = await fsbTriggerRunRefreshPollTabBatch(triggerId, snap);
    return Object.assign({ handled: true }, result || {});
  } catch (err) {
    try {
      if (typeof FsbTriggerStore !== 'undefined'
          && FsbTriggerStore
          && typeof FsbTriggerStore.readSnapshot === 'function'
          && typeof FsbTriggerStore.writeSnapshot === 'function') {
        const latestSnap = await FsbTriggerStore.readSnapshot(triggerId);
        if (fsbTriggerIsRefreshPollSnapshot(latestSnap)) {
          await fsbTriggerMarkRefreshPollAttention(triggerId, latestSnap, 'refresh_poll_failed', {
            error: err && err.message ? err.message : String(err)
          });
        }
      }
    } catch (_markErr) { /* preserve the original failure result */ }
    return {
      handled: true,
      ok: false,
      reason: 'refresh_poll_failed',
      error: err && err.message ? err.message : String(err)
    };
  }
}

async function fsbTriggerHandleValueReport(request, sender) {
  const triggerId = request && typeof request.trigger_id === 'string' ? request.trigger_id : null;
  if (!triggerId) return { ok: false, reason: 'invalid_trigger_id' };
  if (typeof FsbTriggerStore === 'undefined' || !FsbTriggerStore || typeof FsbTriggerStore.readSnapshot !== 'function') {
    return { ok: false, reason: 'store_unavailable' };
  }

  const snap = await FsbTriggerStore.readSnapshot(triggerId);
  if (!snap || snap.status !== 'armed') {
    return { ok: true, ignored: true };
  }

  const senderTabId = sender && sender.tab ? Number(sender.tab.id) : null;
  if (Number.isFinite(Number(snap.target_tab_id))
      && (!Number.isFinite(senderTabId) || Number(snap.target_tab_id) !== senderTabId)) {
    return { ok: true, ignored: true, reason: 'foreign_tab' };
  }

  const value = request.value && typeof request.value === 'object' ? request.value : {};
  const now = Date.now();
  snap.reported_value = (typeof value.text === 'string')
    ? value.text.slice(0, FSB_TRIGGER_REPORTED_TEXT_MAX)
    : snap.last_value;
  const attrs = fsbTriggerCopyReportedAttributes(value.attributes);
  if (attrs) snap.reported_attributes = attrs;
  const reportedUrl = fsbTriggerFirstString(
    request && request.url,
    request && request.current_url,
    request && request.href,
    sender && sender.tab && sender.tab.url,
    snap.reported_url,
    snap.url
  );
  if (reportedUrl) snap.reported_url = reportedUrl;
  snap.last_reported_at = now;
  await FsbTriggerStore.writeSnapshot(triggerId, snap);

  let seamResult = { ok: false, reason: 'lifecycle_unavailable' };
  if (typeof FsbTriggerLifecycle !== 'undefined'
      && FsbTriggerLifecycle
      && typeof FsbTriggerLifecycle.handleTriggerAlarm === 'function'
      && FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX) {
    seamResult = await FsbTriggerLifecycle.handleTriggerAlarm({
      name: FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX + triggerId
    });
  }

  await fsbTriggerArmObserveWatchdog(triggerId);

  if (seamResult && seamResult.action === 'fired') {
    await fsbTriggerClearObserveWatchdog(triggerId);
    await fsbTriggerStopObserveForSnapshot(Object.assign({}, snap, {
      target_tab_id: Number.isFinite(senderTabId) ? senderTabId : snap.target_tab_id
    }));
  }

  return { ok: true, result: seamResult };
}

async function fsbTriggerRearmLiveObserversForTab(tabId, reason) {
  if (typeof FsbTriggerStore === 'undefined'
      || !FsbTriggerStore
      || typeof FsbTriggerStore.listArmedSnapshots !== 'function') {
    return { ok: false, reason: 'store_unavailable' };
  }
  const armed = await FsbTriggerStore.listArmedSnapshots();
  const owned = (Array.isArray(armed) ? armed : []).filter((snap) => {
    return fsbTriggerIsLiveObserveSnapshot(snap) && Number(snap.target_tab_id) === Number(tabId);
  });
  for (const snap of owned) {
    try {
      await fsbTriggerStartObserveForSnapshot(snap, reason || 'rearm');
    } catch (err) {
      console.warn('[FSB TRG] live-observe re-arm failed (non-blocking):', err && err.message);
    }
  }
  return { ok: true, rearmed: owned.length };
}

async function fsbTriggerHandleObserveWatchdog(alarm) {
  const triggerId = alarm && typeof alarm.name === 'string'
    ? alarm.name.slice(FSB_TRIGGER_OBSERVE_WATCHDOG_PREFIX.length)
    : '';
  if (!triggerId
      || typeof FsbTriggerStore === 'undefined'
      || !FsbTriggerStore
      || typeof FsbTriggerStore.readSnapshot !== 'function') {
    return { ok: false, reason: 'invalid_watchdog' };
  }
  const snap = await FsbTriggerStore.readSnapshot(triggerId);
  if (!fsbTriggerIsLiveObserveSnapshot(snap)) {
    await fsbTriggerClearObserveWatchdog(triggerId);
    return { ok: true, ignored: true };
  }
  const now = Date.now();
  const lastSeen = Number(snap.last_reported_at || snap.last_evaluated_at || snap.armed_at || 0);
  if (Number.isFinite(lastSeen) && lastSeen > 0 && now - lastSeen <= FSB_TRIGGER_OBSERVE_STALE_MS) {
    return { ok: true, stale: false };
  }
  return fsbTriggerStartObserveForSnapshot(snap, 'watchdog');
}

function fsbTriggerFirstString() {
  for (let i = 0; i < arguments.length; i++) {
    const value = arguments[i];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function fsbTriggerFirstFiniteTabId() {
  for (let i = 0; i < arguments.length; i++) {
    const value = Number(arguments[i]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function fsbTriggerReadSnapshotAgentId(snap) {
  return fsbTriggerFirstString(
    snap && snap.agent_id,
    snap && snap.agentId
  );
}

function fsbTriggerReadSnapshotOwnershipToken(snap) {
  return fsbTriggerFirstString(
    snap && snap.ownership_token,
    snap && snap.ownershipToken
  );
}

function fsbTriggerReadRegistryOwner(registry, tabId) {
  if (!registry || !Number.isFinite(Number(tabId))) return null;
  try {
    if (typeof registry.findAgentByTabId === 'function') {
      const found = registry.findAgentByTabId(Number(tabId));
      if (typeof found === 'string' && found) return found;
      if (found && typeof found === 'object') {
        const fromFound = fsbTriggerFirstString(found.agentId, found.agent_id);
        if (fromFound) return fromFound;
      }
    }
  } catch (_err) { /* fall through to getOwner */ }
  try {
    if (typeof registry.getOwner === 'function') {
      return fsbTriggerFirstString(registry.getOwner(Number(tabId)));
    }
  } catch (_err) { /* best-effort owner read */ }
  return null;
}

function fsbTriggerReadRegistryOwnershipToken(registry, tabId) {
  if (!registry || !Number.isFinite(Number(tabId)) || typeof registry.getTabMetadata !== 'function') return null;
  try {
    const meta = registry.getTabMetadata(Number(tabId));
    return fsbTriggerFirstString(meta && meta.ownershipToken, meta && meta.ownership_token);
  } catch (_err) {
    return null;
  }
}

function fsbTriggerAccessDeniedContext(base, extra) {
  return Object.assign({
    source: base && base.source,
    tabId: base && base.tabId,
    agentId: base && base.agentId,
    ownershipToken: base && base.ownershipToken,
    accessDenied: true,
    errorCode: 'TRIGGER_ACCESS_DENIED'
  }, extra || {});
}

async function fsbTriggerOwnerContext(payload, sender) {
  const input = (payload && typeof payload === 'object') ? payload : {};
  const source = fsbTriggerFirstString(input.source) || 'unknown';
  const tabId = fsbTriggerFirstFiniteTabId(
    input.tabId,
    input.tab_id,
    input.target_tab_id,
    sender && sender.tab && sender.tab.id
  );

  if (source === 'autopilot') {
    const base = { source, tabId, agentId: null, ownershipToken: null };
    if (!Number.isFinite(Number(tabId))) return base;

    const registry = globalThis && globalThis.fsbAgentRegistryInstance;
    if (!registry) return Object.assign(base, { registry: null });

    let ownerAgentId = fsbTriggerReadRegistryOwner(registry, tabId);
    if (ownerAgentId && ownerAgentId !== 'legacy:autopilot') {
      return fsbTriggerAccessDeniedContext(Object.assign(base, { agentId: 'legacy:autopilot' }), {
        ownerAgentId,
        requestedTabId: tabId,
        requestingAgentId: 'legacy:autopilot'
      });
    }

    let ownershipToken = fsbTriggerReadRegistryOwnershipToken(registry, tabId);
    if (!ownerAgentId
        && typeof registry.getOrRegisterLegacyAgent === 'function'
        && typeof registry.bindTab === 'function') {
      try {
        const legacy = await registry.getOrRegisterLegacyAgent('autopilot');
        const legacyAgentId = fsbTriggerFirstString(legacy && legacy.agentId, legacy && legacy.agent_id);
        if (legacyAgentId) {
          const bindResult = await registry.bindTab(legacyAgentId, Number(tabId));
          if (bindResult === false) {
            ownerAgentId = fsbTriggerReadRegistryOwner(registry, tabId);
            if (ownerAgentId && ownerAgentId !== legacyAgentId) {
              return fsbTriggerAccessDeniedContext(Object.assign(base, { agentId: legacyAgentId }), {
                ownerAgentId,
                requestedTabId: tabId,
                requestingAgentId: legacyAgentId
              });
            }
          } else {
            ownerAgentId = fsbTriggerFirstString(bindResult && bindResult.agentId, legacyAgentId);
            ownershipToken = fsbTriggerFirstString(bindResult && bindResult.ownershipToken, ownershipToken);
          }
        }
      } catch (_err) { /* best-effort legacy bind */ }
    }

    if (!ownerAgentId) ownerAgentId = fsbTriggerReadRegistryOwner(registry, tabId) || 'legacy:autopilot';
    ownershipToken = fsbTriggerFirstString(ownershipToken, fsbTriggerReadRegistryOwnershipToken(registry, tabId));
    return { source, tabId: Number(tabId), agentId: ownerAgentId, ownershipToken, registry };
  }

  return {
    source,
    tabId,
    agentId: fsbTriggerFirstString(input.agentId, input.agent_id),
    ownershipToken: fsbTriggerFirstString(input.ownershipToken, input.ownership_token)
  };
}

function fsbTriggerSnapshotVisibleToContext(snap, context) {
  if (!snap || typeof snap !== 'object') return false;
  if (context && context.accessDenied) return false;

  const snapshotAgentId = fsbTriggerReadSnapshotAgentId(snap);
  const contextAgentId = fsbTriggerFirstString(context && context.agentId, context && context.agent_id);
  if (!snapshotAgentId || !contextAgentId) return true;
  if (snapshotAgentId !== contextAgentId) return false;

  const snapshotToken = fsbTriggerReadSnapshotOwnershipToken(snap);
  const contextToken = fsbTriggerFirstString(context && context.ownershipToken, context && context.ownership_token);
  if (snapshotToken && !contextToken) return false;
  if (snapshotToken && contextToken && snapshotToken !== contextToken) return false;
  return true;
}

function fsbTriggerProjectFiniteDuration(from, to) {
  const start = Number(from);
  const end = Number(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.floor(end - start));
}

function fsbTriggerProjectRemaining(deadlineAt, now) {
  const deadline = Number(deadlineAt);
  const baseNow = Number(now);
  if (!Number.isFinite(deadline) || !Number.isFinite(baseNow)) return null;
  return Math.max(0, Math.floor(deadline - baseNow));
}

function fsbTriggerProjectCurrentValue(snap) {
  if (!snap || typeof snap !== 'object') return null;
  if (snap.reported_value !== undefined && snap.reported_value !== null) return snap.reported_value;
  if (snap.last_value !== undefined && snap.last_value !== null) return snap.last_value;
  return snap.baseline !== undefined ? snap.baseline : null;
}

function fsbTriggerProjectLastEvent(snap) {
  if (!snap || typeof snap !== 'object') return null;
  return snap.last_event || snap.last_fire_event || null;
}

function fsbTriggerProjectFireCount(snap) {
  const count = Number(snap && snap.fire_count);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function fsbTriggerIsTerminalStatus(status) {
  return status === 'fired' || status === 'timed_out' || status === 'stopped';
}

function fsbTriggerProjectTriggerStatus(snap, now) {
  const baseNow = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  return {
    trigger_id: snap && snap.trigger_id,
    status: snap && snap.status,
    outcome: snap && (snap.outcome || snap.status || null),
    watch: snap && (snap.watch || snap.mode || null),
    condition: snap && snap.condition,
    target_tab_id: snap && snap.target_tab_id,
    agent_id: fsbTriggerReadSnapshotAgentId(snap),
    initial_value: snap && snap.baseline !== undefined ? snap.baseline : null,
    current_value: fsbTriggerProjectCurrentValue(snap),
    last_event: fsbTriggerProjectLastEvent(snap),
    fire_count: fsbTriggerProjectFireCount(snap),
    last_fired_at: snap && snap.last_fired_at,
    timed_out_at: snap && snap.timed_out_at,
    terminal_reason: snap && snap.terminal_reason,
    detached: snap && snap.detached === true,
    detached_at: snap && snap.detached_at,
    armed_at: snap && snap.armed_at,
    deadline_at: snap && snap.deadline_at,
    elapsed_ms: fsbTriggerProjectFiniteDuration(snap && snap.armed_at, baseNow),
    remaining_ms: fsbTriggerProjectRemaining(snap && snap.deadline_at, baseNow),
    last_evaluated_at: snap && snap.last_evaluated_at,
    last_reported_at: snap && snap.last_reported_at,
    attention_reason: snap && snap.attention_reason,
    last_attention: snap && snap.last_attention
  };
}

function fsbTriggerProjectTriggerSummary(snap, now, options) {
  const baseNow = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const includeEvent = (options && options.include_events === true)
    || fsbTriggerIsTerminalStatus(snap && snap.status);
  return {
    trigger_id: snap && snap.trigger_id,
    status: snap && snap.status,
    outcome: snap && (snap.outcome || snap.status || null),
    watch: snap && (snap.watch || snap.mode || null),
    agent_id: fsbTriggerReadSnapshotAgentId(snap),
    target_tab_id: snap && snap.target_tab_id,
    age_ms: fsbTriggerProjectFiniteDuration(snap && snap.armed_at, baseNow),
    remaining_ms: fsbTriggerProjectRemaining(snap && snap.deadline_at, baseNow),
    last_event: includeEvent ? fsbTriggerProjectLastEvent(snap) : null,
    fire_count: fsbTriggerProjectFireCount(snap),
    last_fired_at: snap && snap.last_fired_at,
    timed_out_at: snap && snap.timed_out_at,
    terminal_reason: snap && snap.terminal_reason,
    detached: snap && snap.detached === true,
    last_evaluated_at: snap && snap.last_evaluated_at,
    last_reported_at: snap && snap.last_reported_at,
    attention_reason: snap && snap.attention_reason
  };
}

function fsbTriggerNormalizeListStatuses(params) {
  const input = params && (params.statuses || params.status);
  if (Array.isArray(input)) {
    const filtered = input.map((value) => fsbTriggerFirstString(value)).filter(Boolean);
    if (filtered.length) return new Set(filtered);
  }
  const one = fsbTriggerFirstString(input);
  if (one) return new Set([one]);
  const defaults = new Set(['armed', 'needs_attention', 'blocked']);
  if (params && params.include_terminal === true) {
    defaults.add('fired');
    defaults.add('timed_out');
    defaults.add('stopped');
  }
  return defaults;
}

function fsbTriggerMergeParamsAndContext(params, context) {
  return Object.assign({}, params || {}, context || {});
}

async function fsbTriggerHandleToolStatus(params, context) {
  const triggerId = fsbTriggerFirstString(params && params.trigger_id);
  if (!triggerId) {
    return { success: false, errorCode: 'INVALID_TRIGGER_ID' };
  }

  let ownerContext = await fsbTriggerOwnerContext(
    fsbTriggerMergeParamsAndContext(params, context),
    context && context.sender
  );
  if (ownerContext && ownerContext.accessDenied) {
    return { success: false, errorCode: 'TRIGGER_ACCESS_DENIED', trigger_id: triggerId };
  }

  if (typeof FsbTriggerStore === 'undefined'
      || !FsbTriggerStore
      || typeof FsbTriggerStore.readSnapshot !== 'function') {
    return { success: false, errorCode: 'TRIGGER_STORE_UNAVAILABLE', trigger_id: triggerId };
  }

  const snap = await FsbTriggerStore.readSnapshot(triggerId);
  if (!snap) {
    return { success: false, errorCode: 'TRIGGER_NOT_FOUND', trigger_id: triggerId };
  }

  if (ownerContext
      && ownerContext.source === 'autopilot'
      && !Number.isFinite(Number(ownerContext.tabId))
      && Number.isFinite(Number(snap.target_tab_id))) {
    ownerContext = await fsbTriggerOwnerContext(
      fsbTriggerMergeParamsAndContext(Object.assign({}, params || {}, { target_tab_id: snap.target_tab_id }), context),
      context && context.sender
    );
  }

  if (!fsbTriggerSnapshotVisibleToContext(snap, ownerContext)) {
    return { success: false, errorCode: 'TRIGGER_ACCESS_DENIED', trigger_id: triggerId };
  }

  return { success: true, status: fsbTriggerProjectTriggerStatus(snap, Date.now()) };
}

async function fsbTriggerHandleToolList(params, context) {
  let ownerContext = await fsbTriggerOwnerContext(
    fsbTriggerMergeParamsAndContext(params, context),
    context && context.sender
  );
  if (ownerContext && ownerContext.accessDenied) {
    return { success: false, errorCode: 'TRIGGER_ACCESS_DENIED', triggers: [] };
  }

  if (typeof FsbTriggerStore === 'undefined'
      || !FsbTriggerStore
      || typeof FsbTriggerStore.hydrate !== 'function') {
    return { success: false, errorCode: 'TRIGGER_STORE_UNAVAILABLE', triggers: [] };
  }

  const wanted = fsbTriggerNormalizeListStatuses(params);
  const summaryOptions = { include_events: params && params.include_events === true };
  const envelope = await FsbTriggerStore.hydrate();
  const records = (envelope && envelope.records && typeof envelope.records === 'object') ? envelope.records : {};
  const now = Date.now();
  const triggers = [];
  const keys = Object.keys(records);
  for (let i = 0; i < keys.length; i++) {
    const snap = records[keys[i]];
    if (!snap || !wanted.has(snap.status)) continue;

    let perSnapshotContext = ownerContext;
    if (ownerContext
        && ownerContext.source === 'autopilot'
        && !Number.isFinite(Number(ownerContext.tabId))
        && Number.isFinite(Number(snap.target_tab_id))) {
      perSnapshotContext = await fsbTriggerOwnerContext(
        fsbTriggerMergeParamsAndContext(Object.assign({}, params || {}, { target_tab_id: snap.target_tab_id }), context),
        context && context.sender
      );
      if (perSnapshotContext && perSnapshotContext.accessDenied) continue;
    }

    if (fsbTriggerSnapshotVisibleToContext(snap, perSnapshotContext)) {
      triggers.push(fsbTriggerProjectTriggerSummary(snap, now, summaryOptions));
    }
  }
  return { success: true, triggers };
}

function fsbTriggerCleanupOk(result) {
  return result && result.ok === false ? false : true;
}

function fsbTriggerCleanupError(err) {
  return err && err.message ? err.message : String(err);
}

async function fsbTriggerHandleToolStop(params, context) {
  const triggerId = fsbTriggerFirstString(params && params.trigger_id);
  if (!triggerId) {
    return { success: false, errorCode: 'INVALID_TRIGGER_ID' };
  }

  if (typeof FsbTriggerStore === 'undefined'
      || !FsbTriggerStore
      || typeof FsbTriggerStore.readSnapshot !== 'function') {
    return { success: false, errorCode: 'TRIGGER_STORE_UNAVAILABLE', trigger_id: triggerId };
  }

  const snap = await FsbTriggerStore.readSnapshot(triggerId);
  if (!snap) {
    return { success: true, stopped: false, idempotent: true, trigger_id: triggerId, status: 'not_found' };
  }

  let ownerContext = await fsbTriggerOwnerContext(
    fsbTriggerMergeParamsAndContext(Object.assign({}, params || {}, { target_tab_id: snap.target_tab_id }), context),
    context && context.sender
  );
  if ((ownerContext && ownerContext.accessDenied) || !fsbTriggerSnapshotVisibleToContext(snap, ownerContext)) {
    return { success: false, errorCode: 'TRIGGER_ACCESS_DENIED', trigger_id: triggerId };
  }

  const cleanup = {
    observe: { ok: true, skipped: true },
    watchdog: { ok: false, skipped: true },
    lifecycle: { ok: false, skipped: true }
  };

  const terminal = snap.status === 'fired' || snap.status === 'stopped';
  if (!terminal) {
    try {
      const observeResult = await fsbTriggerStopObserveForSnapshot(snap);
      cleanup.observe = { ok: fsbTriggerCleanupOk(observeResult), result: observeResult };
    } catch (err) {
      cleanup.observe = { ok: false, error: fsbTriggerCleanupError(err) };
    }
  }

  try {
    const watchdogResult = await fsbTriggerClearObserveWatchdog(triggerId);
    cleanup.watchdog = { ok: fsbTriggerCleanupOk(watchdogResult), result: watchdogResult };
  } catch (err) {
    cleanup.watchdog = { ok: false, error: fsbTriggerCleanupError(err) };
  }

  try {
    if (typeof FsbTriggerLifecycle !== 'undefined'
        && FsbTriggerLifecycle
        && typeof FsbTriggerLifecycle.clearTrigger === 'function') {
      const lifecycleResult = await FsbTriggerLifecycle.clearTrigger(triggerId);
      cleanup.lifecycle = { ok: fsbTriggerCleanupOk(lifecycleResult), result: lifecycleResult };
    } else {
      cleanup.lifecycle = { ok: false, reason: 'lifecycle_unavailable' };
    }
  } catch (err) {
    cleanup.lifecycle = { ok: false, error: fsbTriggerCleanupError(err) };
  }

  if (terminal) {
    return {
      success: true,
      stopped: false,
      idempotent: true,
      trigger_id: triggerId,
      status: snap.status,
      cleanup
    };
  }

  return { success: true, stopped: true, trigger_id: triggerId, cleanup };
}

async function fsbTriggerMarkTimedOutForMcp(triggerId, context) {
  const safeTriggerId = fsbTriggerFirstString(triggerId);
  if (!safeTriggerId) {
    return { success: false, errorCode: 'INVALID_TRIGGER_ID' };
  }

  if (typeof FsbTriggerStore === 'undefined'
      || !FsbTriggerStore
      || typeof FsbTriggerStore.readSnapshot !== 'function') {
    return { success: false, errorCode: 'TRIGGER_STORE_UNAVAILABLE', trigger_id: safeTriggerId };
  }

  const snap = await FsbTriggerStore.readSnapshot(safeTriggerId);
  if (!snap) {
    return {
      success: true,
      outcome: 'timed_out',
      trigger_id: safeTriggerId,
      status: { trigger_id: safeTriggerId, status: 'timed_out', outcome: 'timed_out' },
      cleanup: { missing: true }
    };
  }

  const ownerContext = await fsbTriggerOwnerContext(
    fsbTriggerMergeParamsAndContext(Object.assign({}, context || {}, { trigger_id: safeTriggerId, target_tab_id: snap.target_tab_id }), context),
    context && context.sender
  );
  if ((ownerContext && ownerContext.accessDenied) || !fsbTriggerSnapshotVisibleToContext(snap, ownerContext)) {
    return { success: false, errorCode: 'TRIGGER_ACCESS_DENIED', trigger_id: safeTriggerId };
  }

  const cleanup = {
    observe: { ok: true, skipped: true },
    watchdog: { ok: false, skipped: true },
    lifecycle: { ok: false, skipped: true }
  };
  const terminal = snap.status === 'fired' || snap.status === 'stopped' || snap.status === 'timed_out';

  if (!terminal) {
    try {
      const observeResult = await fsbTriggerStopObserveForSnapshot(snap);
      cleanup.observe = { ok: fsbTriggerCleanupOk(observeResult), result: observeResult };
    } catch (err) {
      cleanup.observe = { ok: false, error: fsbTriggerCleanupError(err) };
    }
  }

  try {
    const watchdogResult = await fsbTriggerClearObserveWatchdog(safeTriggerId);
    cleanup.watchdog = { ok: fsbTriggerCleanupOk(watchdogResult), result: watchdogResult };
  } catch (err) {
    cleanup.watchdog = { ok: false, error: fsbTriggerCleanupError(err) };
  }

  let lifecycleResult = null;
  try {
    if (typeof FsbTriggerLifecycle !== 'undefined'
        && FsbTriggerLifecycle
        && typeof FsbTriggerLifecycle.markTriggerTimedOut === 'function') {
      lifecycleResult = await FsbTriggerLifecycle.markTriggerTimedOut(safeTriggerId, {
        timed_out_at: Date.now(),
        last_event: null
      });
      cleanup.lifecycle = { ok: fsbTriggerCleanupOk(lifecycleResult), result: lifecycleResult };
    } else {
      cleanup.lifecycle = { ok: false, reason: 'lifecycle_unavailable' };
    }
  } catch (err) {
    cleanup.lifecycle = { ok: false, error: fsbTriggerCleanupError(err) };
  }

  const latestSnap = (lifecycleResult && lifecycleResult.snapshot)
    || (await FsbTriggerStore.readSnapshot(safeTriggerId))
    || snap;
  return {
    success: true,
    outcome: latestSnap && latestSnap.status === 'fired' ? 'fired' : 'timed_out',
    trigger_id: safeTriggerId,
    status: fsbTriggerProjectTriggerStatus(latestSnap, Date.now()),
    cleanup
  };
}

function fsbTriggerValidateToolCondition(condition, nested) {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
    return { ok: false, errorCode: 'TRIGGER_CONDITION_INVALID', reason: 'condition_required' };
  }

  const combinator = fsbTriggerFirstString(condition.combinator);
  if (combinator) {
    const upper = combinator.toUpperCase();
    if (nested || (upper !== 'AND' && upper !== 'OR') || !Array.isArray(condition.conditions) || condition.conditions.length === 0) {
      return { ok: false, errorCode: 'TRIGGER_CONDITION_INVALID', reason: 'compound_invalid' };
    }
    for (let i = 0; i < condition.conditions.length; i++) {
      const child = fsbTriggerValidateToolCondition(condition.conditions[i], true);
      if (!child.ok) return child;
    }
    return { ok: true };
  }

  const rawKind = fsbTriggerFirstString(condition.kind);
  const kind = rawKind === 'delta_percent' ? 'percent_change' : rawKind;
  if (['changed', 'threshold', 'equals', 'regex', 'contains', 'percent_change'].indexOf(kind) === -1) {
    return { ok: false, errorCode: 'TRIGGER_CONDITION_INVALID', reason: 'kind_invalid' };
  }

  if (kind === 'threshold') {
    const operator = fsbTriggerFirstString(condition.operator);
    if (['>=', '<=', '>', '<'].indexOf(operator) === -1 || condition.target === undefined || condition.target === null) {
      return { ok: false, errorCode: 'TRIGGER_CONDITION_INVALID', reason: 'threshold_invalid' };
    }
  }
  if (kind === 'regex' && typeof condition.pattern !== 'string') {
    return { ok: false, errorCode: 'TRIGGER_CONDITION_INVALID', reason: 'regex_invalid' };
  }
  if ((kind === 'contains' || kind === 'equals') && condition.value === undefined) {
    return { ok: false, errorCode: 'TRIGGER_CONDITION_INVALID', reason: kind + '_invalid' };
  }
  if (kind === 'percent_change' && !Number.isFinite(Number(condition.percent))) {
    return { ok: false, errorCode: 'TRIGGER_CONDITION_INVALID', reason: 'percent_change_invalid' };
  }

  return { ok: true };
}

function fsbTriggerNormalizeToolCondition(condition) {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
    return condition;
  }
  const normalized = Object.assign({}, condition);
  const rawKind = fsbTriggerFirstString(normalized.kind);
  if (rawKind === 'delta_percent') {
    normalized.kind = 'percent_change';
  }
  if (Array.isArray(normalized.conditions)) {
    normalized.conditions = normalized.conditions.map(fsbTriggerNormalizeToolCondition);
  }
  return normalized;
}

function fsbTriggerNormalizeToolWatch(value) {
  const raw = fsbTriggerFirstString(value) || 'live-observe';
  if (raw === 'refresh_poll') return 'refresh-poll';
  if (raw === 'live_observe') return 'live-observe';
  if (raw === 'refresh-poll' || raw === 'live-observe') return raw;
  return null;
}

function fsbTriggerToolAttrName(params) {
  return fsbTriggerFirstString(
    params && params.attrName,
    params && params.attr_name,
    params && params.attribute
  );
}

function fsbTriggerToolExtract(params, condition) {
  return fsbTriggerFirstString(
    params && params.extract,
    condition && condition.extract
  ) || 'text';
}

function fsbTriggerCopyIntervalAliases(params, spec) {
  ['poll_interval_ms', 'pollIntervalMs', 'interval_ms', 'intervalMs'].forEach((key) => {
    if (params && Object.prototype.hasOwnProperty.call(params, key)) {
      spec[key] = params[key];
    }
  });
}

function fsbTriggerReadResultValue(readResult) {
  if (!readResult || readResult.success === false || readResult.ok === false) return null;
  if (readResult.value && typeof readResult.value === 'object') return readResult.value;
  return null;
}

const FSB_TRIGGER_TAB_WATCH_CONFLICT_ACTIVE_STATUSES = {
  armed: true,
  needs_attention: true,
  blocked: true
};

async function fsbTriggerFindTabWatchConflict(targetTabId, requestedWatch, ownerContext) {
  const normalizedRequestedWatch = fsbTriggerNormalizeToolWatch(requestedWatch);
  const normalizedTabId = Number(targetTabId);
  if (!Number.isFinite(normalizedTabId) || !normalizedRequestedWatch) return null;
  if (typeof FsbTriggerStore === 'undefined'
      || !FsbTriggerStore
      || typeof FsbTriggerStore.hydrate !== 'function') {
    return null;
  }

  let envelope = null;
  try {
    envelope = await FsbTriggerStore.hydrate();
  } catch (_err) {
    return null;
  }
  const records = envelope && envelope.records && typeof envelope.records === 'object'
    ? envelope.records
    : {};
  const keys = Object.keys(records);
  for (let i = 0; i < keys.length; i++) {
    const snap = records[keys[i]];
    if (!snap || typeof snap !== 'object') continue;
    if (!FSB_TRIGGER_TAB_WATCH_CONFLICT_ACTIVE_STATUSES[snap.status]) continue;
    if (Number(snap.target_tab_id) !== normalizedTabId) continue;
    if (!fsbTriggerSnapshotVisibleToContext(snap, ownerContext)) continue;

    const existingWatch = fsbTriggerNormalizeToolWatch(snap.watch || snap.mode);
    if (!existingWatch || existingWatch === normalizedRequestedWatch) continue;
    return snap;
  }
  return null;
}

async function fsbTriggerHandleToolArm(params, context) {
  const safeParams = (params && typeof params === 'object') ? params : {};
  const sender = context && context.sender;
  const tabId = fsbTriggerFirstFiniteTabId(
    safeParams.tab_id,
    safeParams.target_tab_id,
    safeParams.tabId,
    context && context.tab_id,
    context && context.target_tab_id,
    context && context.tabId,
    sender && sender.tab && sender.tab.id
  );

  const ownerContext = await fsbTriggerOwnerContext(
    fsbTriggerMergeParamsAndContext(Object.assign({}, safeParams, { target_tab_id: tabId }), context),
    sender
  );
  if (ownerContext && ownerContext.accessDenied) {
    return { success: false, errorCode: 'TRIGGER_ACCESS_DENIED' };
  }

  const selector = fsbTriggerFirstString(safeParams.selector);
  if (!selector) {
    return { success: false, errorCode: 'TRIGGER_SELECTOR_INVALID' };
  }
  if (!Number.isFinite(Number(tabId))) {
    return { success: false, errorCode: 'INVALID_TAB_ID' };
  }

  let condition = fsbTriggerNormalizeToolCondition(safeParams.condition);
  const conditionValidation = fsbTriggerValidateToolCondition(condition);
  if (!conditionValidation.ok) {
    return Object.assign({ success: false }, conditionValidation);
  }

  const watch = fsbTriggerNormalizeToolWatch(safeParams.watch || safeParams.mode);
  if (!watch) {
    return { success: false, errorCode: 'TRIGGER_WATCH_INVALID' };
  }

  const watchConflict = await fsbTriggerFindTabWatchConflict(Number(tabId), watch, ownerContext);
  if (watchConflict) {
    return {
      success: false,
      error: 'TRIGGER_TAB_WATCH_CONFLICT',
      code: 'TRIGGER_TAB_WATCH_CONFLICT',
      errorCode: 'TRIGGER_TAB_WATCH_CONFLICT',
      target_tab_id: Number(tabId),
      existing_trigger_id: watchConflict.trigger_id || watchConflict.id || null,
      existing_watch: watchConflict.watch || watchConflict.mode || null,
      requested_watch: watch
    };
  }

  const extract = fsbTriggerToolExtract(safeParams, condition);
  const attrName = fsbTriggerToolAttrName(safeParams) || fsbTriggerAttrName({ condition });
  if (extract === 'attribute' && attrName && condition && typeof condition === 'object'
      && !fsbTriggerFirstString(condition.attribute, condition.attrName, condition.attr_name)) {
    condition = Object.assign({}, condition, { attribute: attrName });
  }
  const readShape = { selector, condition, extract, attrName };
  const readResult = await fsbTriggerSendRefreshPollRead(Number(tabId), readShape);
  if (readResult && readResult.code === 'TRIGGER_PAGE_BLOCKED') {
    return Object.assign({ success: false, errorCode: 'TRIGGER_PAGE_BLOCKED' }, readResult);
  }
  if (readResult && (readResult.code === 'ELEMENT_NOT_FOUND' || readResult.reason === 'element_not_found')) {
    return Object.assign({ success: false, errorCode: 'ELEMENT_NOT_FOUND' }, readResult);
  }
  const value = fsbTriggerReadResultValue(readResult);
  if (!value || typeof value.text !== 'string') {
    return {
      success: false,
      errorCode: 'TRIGGER_READ_FAILED',
      reason: readResult && (readResult.reason || readResult.error || readResult.code)
    };
  }

  const triggerId = fsbTriggerFirstString(safeParams.trigger_id)
    || (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : ('trigger_' + Date.now().toString(36)));
  const spec = {
    trigger_id: triggerId,
    condition,
    selector,
    baseline: value.text,
    reported_value: value.text,
    target_tab_id: Number(tabId),
    agent_id: ownerContext && ownerContext.agentId,
    ownership_token: ownerContext && ownerContext.ownershipToken,
    watch,
    extract,
    attrName
  };
  const attrs = fsbTriggerCopyReportedAttributes(value.attributes);
  if (attrs) spec.reported_attributes = attrs;
  fsbTriggerCopyIntervalAliases(safeParams, spec);

  const triggerManager = (typeof FsbTriggerManager !== 'undefined') ? FsbTriggerManager : null;
  if (!triggerManager || typeof triggerManager.armTrigger !== 'function') {
    return { success: false, errorCode: 'TRIGGER_MANAGER_UNAVAILABLE', trigger_id: triggerId };
  }

  const armResult = await FsbTriggerManager.armTrigger(spec);
  if (!armResult || armResult.ok === false || armResult.error || armResult.code) {
    return Object.assign({
      success: false,
      errorCode: (armResult && (armResult.code || armResult.error)) || 'TRIGGER_ARM_FAILED',
      trigger_id: triggerId
    }, armResult || {});
  }

  let snapshot = null;
  if (typeof FsbTriggerStore !== 'undefined'
      && FsbTriggerStore
      && typeof FsbTriggerStore.readSnapshot === 'function') {
    snapshot = await FsbTriggerStore.readSnapshot(triggerId);
  }
  if (!snapshot) snapshot = Object.assign({ status: 'armed', armed_at: Date.now() }, spec);

  if (fsbTriggerIsLiveObserveSnapshot(snapshot)) {
    await fsbTriggerStartObserveForSnapshot(snapshot, 'trigger-arm');
  } else if (fsbTriggerIsRefreshPollSnapshot(snapshot)) {
    await fsbTriggerSendTabMessage(Number(tabId), {
      action: 'triggerPulseStart',
      selector: snapshot.selector,
      reason: 'trigger-arm'
    });
  }

  return {
    success: true,
    trigger_id: triggerId,
    status: fsbTriggerProjectTriggerStatus(snapshot, Date.now())
  };
}

async function fsbTriggerDispatchToolRequest(toolName, params, context) {
  switch (toolName) {
    case 'trigger':
      return fsbTriggerHandleToolArm(params, context);
    case 'stop_trigger':
      return fsbTriggerHandleToolStop(params, context);
    case 'get_trigger_status':
      return fsbTriggerHandleToolStatus(params, context);
    case 'list_triggers':
      return fsbTriggerHandleToolList(params, context);
    default:
      return { success: false, errorCode: 'TRIGGER_TOOL_UNKNOWN', tool: toolName };
  }
}

globalThis.fsbTriggerMarkTimedOutForMcp = fsbTriggerMarkTimedOutForMcp;
globalThis.fsbTriggerToolHandlersForTest = { fsbTriggerOwnerContext: fsbTriggerOwnerContext, fsbTriggerSnapshotVisibleToContext: fsbTriggerSnapshotVisibleToContext, fsbTriggerProjectTriggerStatus: fsbTriggerProjectTriggerStatus, fsbTriggerProjectTriggerSummary: fsbTriggerProjectTriggerSummary, fsbTriggerValidateToolCondition: fsbTriggerValidateToolCondition, fsbTriggerHandleToolStatus: fsbTriggerHandleToolStatus, fsbTriggerHandleToolList: fsbTriggerHandleToolList, fsbTriggerHandleToolStop: fsbTriggerHandleToolStop, fsbTriggerMarkTimedOutForMcp: fsbTriggerMarkTimedOutForMcp, fsbTriggerHandleToolArm: fsbTriggerHandleToolArm, fsbTriggerDispatchToolRequest: fsbTriggerDispatchToolRequest };

async function fsbTriggerArmLiveObserveForTest(spec) {
  const safeSpec = spec && typeof spec === 'object' ? spec : {};
  if (typeof FsbTriggerLifecycle === 'undefined'
      || !FsbTriggerLifecycle
      || typeof FsbTriggerLifecycle.armTrigger !== 'function') {
    return { ok: false, reason: 'lifecycle_unavailable' };
  }
  const now = typeof safeSpec.now === 'number' ? safeSpec.now : Date.now();
  const triggerId = safeSpec.trigger_id || ('test-live-observe-' + now);
  const ttl = typeof FsbTriggerLifecycle.FSB_TRIGGER_DEFAULT_TTL_MS === 'number'
    ? FsbTriggerLifecycle.FSB_TRIGGER_DEFAULT_TTL_MS
    : 21600000;
  const snapshot = {
    trigger_id: triggerId,
    status: 'armed',
    watch: 'live-observe',
    condition: safeSpec.condition || { kind: 'changed' },
    baseline: safeSpec.baseline == null ? null : safeSpec.baseline,
    last_value: safeSpec.baseline == null ? null : safeSpec.baseline,
    was_satisfied: false,
    selector: safeSpec.selector,
    extract: safeSpec.extract || (safeSpec.condition && safeSpec.condition.extract) || 'text',
    attrName: safeSpec.attrName || (safeSpec.condition && safeSpec.condition.attribute) || null,
    target_tab_id: safeSpec.target_tab_id,
    agent_id: safeSpec.agent_id || 'test-trigger-agent',
    armed_at: now,
    deadline_at: now + ttl,
    alarm_name: FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX + triggerId
  };
  const armed = await FsbTriggerLifecycle.armTrigger(snapshot);
  if (armed && armed.ok !== false) {
    await fsbTriggerStartObserveForSnapshot(snapshot, 'test-arm');
  }
  return Object.assign({ snapshot }, armed || {});
}

globalThis.fsbTriggerArmLiveObserveForTest = fsbTriggerArmLiveObserveForTest;
globalThis.fsbTriggerHandleRefreshPollForTest = fsbTriggerHandleRefreshPollAlarm;

// Classify failure type based on error message and context
function classifyFailure(error, action, context = {}) {
  const errorMessage = (error.message || error || '').toLowerCase();
  
  // Communication failures
  // Check for back/forward cache issue first
  if (errorMessage.includes('back/forward cache') || 
      errorMessage.includes('page keeping the extension port is moved')) {
    return FAILURE_TYPES.BF_CACHE;
  }
  
  if (errorMessage.includes('could not establish connection') ||
      errorMessage.includes('receiving end does not exist') ||
      errorMessage.includes('message port closed') ||
      errorMessage.includes('no tab with id') ||
      errorMessage.includes('cannot access') ||
      errorMessage.includes('communication failure')) {
    return FAILURE_TYPES.COMMUNICATION;
  }
  
  // DOM/Selector failures
  if (errorMessage.includes('element not found') ||
      errorMessage.includes('selector') ||
      errorMessage.includes('not visible') ||
      errorMessage.includes('not interactable')) {
    return FAILURE_TYPES.SELECTOR;
  }
  
  // Timeout failures
  if (errorMessage.includes('timeout') ||
      errorMessage.includes('timed out')) {
    return FAILURE_TYPES.TIMEOUT;
  }
  
  // Network failures
  if (errorMessage.includes('network') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('fetch')) {
    return FAILURE_TYPES.NETWORK;
  }
  
  // Permission failures
  if (errorMessage.includes('permission') ||
      errorMessage.includes('restricted') ||
      errorMessage.includes('chrome://') ||
      errorMessage.includes('cannot execute')) {
    return FAILURE_TYPES.PERMISSION;
  }
  
  // Default to communication for unknown errors
  return FAILURE_TYPES.COMMUNICATION;
}

// Slim down action results before storing in session history.
// Keeps only the fields that ai-integration and stuck detection actually read.
function slimActionResult(result) {
  if (!result) return result;
  const slim = { success: result.success };
  if (result.error) slim.error = result.error;
  if (result.hadEffect !== undefined) slim.hadEffect = result.hadEffect;
  if (result.navigationTriggered) slim.navigationTriggered = true;
  if (result.validationPassed !== undefined) slim.validationPassed = result.validationPassed;
  if (result.validationPassed === false && result.actualValue !== undefined) slim.actualValue = result.actualValue;
  if (result.warning) slim.warning = result.warning;
  if (!result.success && result.suggestion) slim.suggestion = result.suggestion;
  if (result.typed) slim.typed = result.typed;
  if (result.clicked) slim.clicked = result.clicked;
  if (result.navigatingTo) slim.navigatingTo = result.navigatingTo;
  if (result.selected) slim.selected = result.selected;
  if (result.checked !== undefined) slim.checked = result.checked;
  if (result.failureType) slim.failureType = result.failureType;
  if (result.retryable !== undefined) slim.retryable = result.retryable;
  // MEM-02: Preserve fields for rich action descriptions downstream
  if (result.tool) slim.tool = result.tool;
  if (result.elementInfo?.text) slim.elementText = result.elementInfo.text.substring(0, 50);
  if (result.selectorUsed) slim.selectorUsed = result.selectorUsed;
  // CMP-04: Preserve value field for getText/getAttribute -- needed by progress tracking
  // and hard-stop extracted-text display (lines that reference result.value)
  if (result.value !== undefined) slim.value = typeof result.value === 'string' ? result.value.substring(0, 200) : result.value;
  return slim;
}

// ==========================================
// SESSION REPLAY ENGINE
// ==========================================

/**
 * Get appropriate inter-action delay for replay based on tool type.
 * Navigation actions get longer delays; typing/key actions are faster.
 * @param {string} tool - The action tool name
 * @returns {number} Delay in milliseconds
 */
function getReplayDelay(tool) {
  if (['navigate', 'searchGoogle', 'goBack', 'goForward'].includes(tool)) return 1500;
  if (['click', 'doubleClick', 'rightClick'].includes(tool)) return 500;
  if (['type', 'keyPress', 'pressEnter'].includes(tool)) return 300;
  return 200;
}

/**
 * Load a stored session's actionHistory and filter to replayable actions.
 * @param {string} sessionId - The session ID to load from fsbSessionLogs
 * @returns {Object|null} { session, replayableActions, originalTask, originalUrl } or null
 */
async function loadReplayableSession(sessionId) {
  try {
    const stored = await chrome.storage.local.get(['fsbSessionLogs']);
    const sessionStorage = stored.fsbSessionLogs || {};
    const session = sessionStorage[sessionId];

    if (!session || !session.actionHistory || session.actionHistory.length === 0) {
      return null;
    }

    const replayableTools = new Set([
      'click', 'rightClick', 'doubleClick', 'type', 'clearInput', 'pressEnter',
      'keyPress', 'selectOption', 'toggleCheckbox', 'navigate', 'searchGoogle',
      'scroll', 'goBack', 'goForward', 'refresh', 'hover', 'focus', 'moveMouse',
      'waitForElement'
    ]);

    const replayableActions = session.actionHistory
      .filter(a => a.result?.success === true && replayableTools.has(a.tool));

    if (replayableActions.length === 0) {
      return null;
    }

    // Extract the original URL from the first navigation-like action or session logs
    let originalUrl = null;
    for (const action of session.actionHistory) {
      if (action.params?.url) {
        originalUrl = action.params.url;
        break;
      }
    }
    if (!originalUrl && session.logs && session.logs.length > 0) {
      originalUrl = session.logs[0]?.data?.url || null;
    }

    return {
      session,
      replayableActions,
      originalTask: session.task,
      originalUrl
    };
  } catch (error) {
    automationLogger.error('Failed to load replayable session', { sessionId, error: error.message });
    return null;
  }
}

/**
 * Execute a replay sequence step-by-step through the existing sendMessageWithRetry path.
 * Sends statusUpdate messages to UI during each step with progress percentage.
 * Critical step failures (navigate, searchGoogle) abort replay; non-critical failures are skipped.
 * @param {string} replaySessionId - The replay session ID in activeSessions
 */
async function executeReplaySequence(replaySessionId) {
  const session = activeSessions.get(replaySessionId);
  if (!session || session.status !== 'replaying') return;

  const criticalTools = new Set(['navigate', 'searchGoogle']);

  for (let i = session.currentStep; i < session.replaySteps.length; i++) {
    // Check for termination (user stopped the replay)
    const currentSession = activeSessions.get(replaySessionId);
    if (!currentSession || currentSession.isTerminating || currentSession.status !== 'replaying') {
      return;
    }

    session.currentStep = i;
    const step = session.replaySteps[i];

    // Prepend clearInput before type actions to prevent text accumulation
    if (step.tool === 'type' && step.params?.selector) {
      try {
        await sendMessageWithRetry(session.tabId, {
          action: 'executeAction',
          tool: 'clearInput',
          params: { selector: step.params.selector }
        });
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (e) {
        automationLogger.debug('clearInput before type failed (non-critical)', {
          sessionId: replaySessionId, step: i, error: e?.message || String(e)
        });
      }
    }

    // Send progress update to UI
    const progressPercent = Math.round(((i + 1) / session.totalSteps) * 100);
    try {
      chrome.runtime.sendMessage({
        action: 'statusUpdate',
        sessionId: replaySessionId,
        message: getActionStatus(step.tool, step.params),
        iteration: i + 1,
        maxIterations: session.totalSteps,
        progressPercent,
        replayStep: i + 1,
        isReplay: true
      });
    } catch (e) {
      // Non-blocking: UI may not be listening
    }

    // Execute the action via the existing content script path
    let actionResult = null;
    try {
      actionResult = await sendMessageWithRetry(session.tabId, {
        action: 'executeAction',
        tool: step.tool,
        params: step.params,
        visualContext: {
          taskName: session.task,
          stepNumber: i + 1,
          totalSteps: session.totalSteps,
          iterationCount: 1,
          isReplay: true
        }
      });
    } catch (e) {
      actionResult = { success: false, error: e?.message || String(e) };
    }

    // Record result in session actionHistory
    session.actionHistory.push({
      timestamp: Date.now(),
      tool: step.tool,
      params: step.params,
      result: slimActionResult(actionResult),
      replayStep: i + 1
    });

    // Handle failures
    if (!actionResult?.success) {
      if (criticalTools.has(step.tool)) {
        session.status = 'replay_failed';
        automationLogger.warn('Replay aborted: critical action failed', {
          sessionId: replaySessionId, step: i + 1, tool: step.tool, error: actionResult?.error
        });
        break;
      } else {
        automationLogger.warn('Replay step failed (non-critical, skipping)', {
          sessionId: replaySessionId, step: i + 1, tool: step.tool, error: actionResult?.error
        });
        // Continue to next step
      }
    }

    // Inter-action delay (skip if last step)
    if (i < session.replaySteps.length - 1) {
      await new Promise(resolve => setTimeout(resolve, getReplayDelay(step.tool)));
    }
  }

  // Tally results
  const successCount = session.actionHistory.filter(a => a.result?.success).length;
  const failedCount = session.actionHistory.filter(a => !a.result?.success).length;

  if (session.status === 'replaying') {
    session.status = 'replay_completed';

    // Send completion message to UI
    try {
      fsbBroadcastAutomationLifecycle({
        action: 'automationComplete',
        sessionId: replaySessionId,
        // QT-uof-2 (BROADCAST-tabId-THREAD)
        tabId: (session && typeof session.tabId === 'number') ? session.tabId : null,
        result: `Replay complete: ${successCount}/${session.totalSteps} steps executed successfully.${failedCount > 0 ? ` ${failedCount} steps skipped.` : ''}`
      });
    } catch (e) { /* UI may not be listening */ }
  } else if (session.status === 'replay_failed') {
    // Send error message to UI
    try {
      fsbBroadcastAutomationLifecycle({
        action: 'automationError',
        sessionId: replaySessionId,
        error: `Replay failed at step ${session.currentStep + 1}/${session.totalSteps}. ${successCount} steps succeeded before failure.`
      });
    } catch (e) { /* UI may not be listening */ }
  }

  // Send session-ended status to content script (covers previousTabId if set)
  await endSessionOverlays(session, session.status === 'replay_completed' ? 'completed' : 'error');

  // Log session end and cleanup
  const duration = Date.now() - session.startTime;
  automationLogger.logSessionEnd(replaySessionId, session.status, session.actionHistory.length, duration);
  automationLogger.saveSession(replaySessionId, session);
  cleanupSession(replaySessionId);
}

/**
 * Handle a replaySession message: load session data, create replay session, and kick off execution.
 * @param {Object} request - { sessionId: string }
 * @param {Object} sender - Chrome message sender
 * @param {Function} sendResponse - Response callback
 */
async function handleReplaySession(request, sender, sendResponse) {
  try {
    const { sessionId } = request;

    // Check if automation is already running
    for (const [id, sess] of activeSessions) {
      if (sess.status !== 'idle') {
        sendResponse({ success: false, error: 'Another automation is already running' });
        return;
      }
    }

    // Get current active tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) {
      sendResponse({ success: false, error: 'No active tab found' });
      return;
    }

    // Load replayable session data
    const replayData = await loadReplayableSession(sessionId);
    if (!replayData || replayData.replayableActions.length === 0) {
      sendResponse({ success: false, error: 'No replayable actions found in this session' });
      return;
    }

    // Create replay session ID
    const replaySessionId = `replay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Create replay session in activeSessions (no AI instance, no conversation session)
    activeSessions.set(replaySessionId, {
      task: `Replay: ${replayData.originalTask}`,
      tabId: activeTab.id,
      status: 'replaying',
      startTime: Date.now(),
      actionHistory: [],
      isReplay: true,
      originalSessionId: sessionId,
      replaySteps: replayData.replayableActions,
      currentStep: 0,
      totalSteps: replayData.replayableActions.length
    });

    // Start keep-alive to prevent service worker from sleeping
    startKeepAlive();

    // Log session start
    automationLogger.logSessionStart(replaySessionId, `Replay: ${replayData.originalTask}`, activeTab.id);

    // Respond immediately with session info
    sendResponse({
      success: true,
      sessionId: replaySessionId,
      totalSteps: replayData.replayableActions.length
    });

    // Kick off replay execution asynchronously (do NOT await)
    executeReplaySequence(replaySessionId);
  } catch (error) {
    automationLogger.error('Failed to start replay session', { error: error.message });
    sendResponse({ success: false, error: error.message });
  }
}

// Enhanced message sending with automatic retry and fallback
async function sendMessageWithRetry(tabId, message, maxRetries = 3) {
  // Capture URL before sending - used to detect if action triggered navigation
  let previousUrl = null;
  try {
    const tabInfo = await chrome.tabs.get(tabId);
    previousUrl = tabInfo?.url;
    message._previousUrl = previousUrl; // Store for BFCache recovery check
  } catch (e) {
    // Tab might not exist, continue anyway
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Check content script health before every attempt (not just the first)
      const isHealthy = await checkContentScriptHealth(tabId);
      if (!isHealthy) {
        automationLogger.logComm(null, 'health', 'pre_message', false, { tabId, attempt, action: 're-inject' });
        await ensureContentScriptInjected(tabId);
      }

      // CRITICAL: Use frameId: 0 to target ONLY the main frame
      // This prevents responding from iframes (like Google's RotateCookiesPage iframe)
      const response = await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
      
      // Success - reset health tracking
      contentScriptHealth.set(tabId, {
        lastCheck: Date.now(),
        healthy: true,
        failures: 0
      });
      
      return response;
      
    } catch (error) {
      const failureType = classifyFailure(error, message);
      automationLogger.logComm(null, 'send', message.action || 'unknown', false, { tabId, attempt, failureType, error: error.message });
      
      // Update health tracking
      const health = contentScriptHealth.get(tabId) || { failures: 0 };
      health.failures++;
      health.healthy = false;
      health.lastCheck = Date.now();
      contentScriptHealth.set(tabId, health);
      
      if (attempt === maxRetries) {
        throw {
          originalError: error,
          failureType,
          attempts: maxRetries,
          message: `Failed after ${maxRetries} attempts: ${error.message}`
        };
      }
      
      // Apply failure-specific retry strategy
      if (failureType === FAILURE_TYPES.BF_CACHE) {
        automationLogger.logRecovery(null, 'bfcache', 'detect', 'attempt', { tabId });

        // CRITICAL: BFCache often means navigation happened (click triggered page change)
        // Check if URL changed - if so, the action likely succeeded!
        try {
          const tabInfo = await chrome.tabs.get(tabId);
          const currentUrl = tabInfo?.url;
          const previousUrl = message._previousUrl; // Stored before sending

          if (previousUrl && currentUrl && currentUrl !== previousUrl) {
            automationLogger.logNavigation(null, 'bfcache_nav', previousUrl, currentUrl, { success: true, note: 'navigation_triggered' });
            return {
              success: true,
              navigationTriggered: true,
              previousUrl: previousUrl,
              newUrl: currentUrl,
              note: 'Action triggered page navigation (BFCache indicates page change)'
            };
          }
        } catch (urlCheckError) {
          automationLogger.debug('Could not check URL change', { tabId, error: urlCheckError.message });
        }

        // Try to wake up the page by focusing the tab
        try {
          await chrome.tabs.update(tabId, { active: true });
          // Use smart page ready detection instead of hardcoded delays
          const wakeResult = await pageLoadWatcher.waitForPageReady(tabId, {
            maxWait: 2000,
            requireDOMStable: false
          });
          automationLogger.logRecovery(null, 'bfcache', 'wake_tab', wakeResult.success ? 'success' : 'failed', { tabId, waitTime: wakeResult.waitTime, method: wakeResult.method });
        } catch (e) {
          automationLogger.logRecovery(null, 'bfcache', 'wake_tab', 'failed', { tabId, error: e.message });
        }
        // Re-inject content script after waking the page
        await ensureContentScriptInjected(tabId);
        // Verify content script is responsive
        const pingOk = await pageLoadWatcher.pingContentScript(tabId, 1000);
        if (!pingOk) {
          automationLogger.logRecovery(null, 'bfcache', 'verify_ping', 'failed', { tabId });
        }
      } else if (failureType === FAILURE_TYPES.COMMUNICATION) {
        automationLogger.logRecovery(null, 'comm_failure', 're-inject', 'attempt', { tabId });
        await ensureContentScriptInjected(tabId);
      }

      // EASY WIN #4: Exponential backoff with jitter (improves retry success by 20-30%)
      // Wait progressively longer with random jitter to prevent thundering herd
      const baseDelay = 1000; // 1 second base
      const exponentialDelay = baseDelay * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      const jitter = Math.random() * 1000; // 0-1000ms random jitter
      const totalDelay = exponentialDelay + jitter;

      automationLogger.logTiming(null, 'WAIT', 'retry_backoff', Math.round(totalDelay), { tabId, attempt: attempt + 1 });
      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }
  }
}

// Alternative action strategies for failed operations
async function tryAlternativeAction(sessionId, originalAction, originalError) {
  const session = activeSessions.get(sessionId);
  if (!session) return null;
  
  const { tool, params } = originalAction;
  const alternatives = [];
  
  // Type action alternatives
  if (tool === 'type') {
    alternatives.push(
      // Try clicking first, then typing
      { tool: 'click', params: { selector: params.selector }, description: `Click element before typing` },
      // Try focus + clear + type
      { tool: 'focus', params: { selector: params.selector }, description: `Focus element before typing` },
      { tool: 'clearInput', params: { selector: params.selector }, description: `Clear input before typing` },
      { tool: 'type', params: { ...params, slow: true }, description: `Type slowly with delays` },
      // Try keyboard events instead
      { tool: 'keyPress', params: { selector: params.selector, key: params.text }, description: `Use keyboard events instead of typing` }
    );
  }
  
  // Click action alternatives
  if (tool === 'click') {
    alternatives.push(
      // Try different click methods
      { tool: 'doubleClick', params, description: `Try double-click instead` },
      { tool: 'rightClick', params, description: `Try right-click to trigger context` },
      // Try hovering first
      { tool: 'hover', params, description: `Hover before clicking` },
      { tool: 'click', params: { ...params, forceClick: true }, description: `Force click ignoring visibility` }
    );
  }
  
  // Selector alternatives for any action with selector
  if (params.selector && originalError.failureType === FAILURE_TYPES.SELECTOR) {
    const baseSelector = params.selector;
    const selectorAlternatives = generateAlternativeSelectors(baseSelector);
    
    for (const altSelector of selectorAlternatives) {
      alternatives.push({
        tool,
        params: { ...params, selector: altSelector },
        description: `Try alternative selector: ${altSelector.substring(0, 30)}...`
      });
    }
  }
  
  // Execute alternatives one by one
  for (const alternative of alternatives.slice(0, 3)) { // Limit to 3 alternatives
    try {
      automationLogger.logActionExecution(sessionId, alternative.tool, 'fallback', { description: alternative.description });
      
      const result = await sendMessageWithRetry(session.tabId, {
        action: 'executeAction',
        tool: alternative.tool,
        params: alternative.params
      });
      
      if (result && result.success) {
        automationLogger.logActionExecution(sessionId, alternative.tool, 'complete', { success: true, alternative: alternative.description });
        return {
          success: true,
          result: result.result,
          alternativeUsed: alternative.description,
          originalError: originalError.error
        };
      }
    } catch (error) {
      automationLogger.logActionExecution(sessionId, alternative.tool, 'complete', { success: false, alternative: alternative.description, error: error.message });
      continue;
    }
  }
  
  return null; // No alternatives worked
}

// Generate alternative selectors for failed selector queries
function generateAlternativeSelectors(originalSelector) {
  const alternatives = [];
  
  // If it's an ID selector, try class-based alternatives
  if (originalSelector.startsWith('#')) {
    const id = originalSelector.substring(1);
    alternatives.push(
      `[id="${id}"]`,
      `*[id*="${id}"]`,
      `[id^="${id}"]`,
      `[id$="${id}"]`
    );
  }
  
  // If it's a class selector, try attribute alternatives
  if (originalSelector.startsWith('.')) {
    const className = originalSelector.substring(1);
    alternatives.push(
      `[class*="${className}"]`,
      `[class^="${className}"]`, 
      `[class$="${className}"]`
    );
  }
  
  // Try data attribute alternatives
  alternatives.push(
    `[data-testid*="${originalSelector.replace(/[#.]/g, '')}"]`,
    `[aria-label*="${originalSelector.replace(/[#.]/g, '')}"]`,
    `[name*="${originalSelector.replace(/[#.]/g, '')}"]`,
    `[title*="${originalSelector.replace(/[#.]/g, '')}"]`
  );
  
  // Try partial matches
  if (originalSelector.includes('[') && originalSelector.includes('=')) {
    const attrMatch = originalSelector.match(/\[([^=]+)="([^"]+)"\]/);
    if (attrMatch) {
      const [, attr, value] = attrMatch;
      alternatives.push(
        `[${attr}*="${value}"]`,
        `[${attr}^="${value}"]`,
        `[${attr}$="${value}"]`,
        `[${attr}~="${value}"]`
      );
    }
  }
  
  return alternatives.slice(0, 5); // Limit alternatives
}

// Enhanced stuck detection with pattern recognition
function analyzeStuckPatterns(session) {
  const recentActions = session.actionHistory.slice(-10); // Look at last 10 actions
  const patterns = {
    repetitiveActions: false,
    cyclingBetweenStates: false,
    failingOnSameElement: false,
    noProgressMade: false,
    severity: 'low'
  };
  
  if (recentActions.length < 3) return patterns;
  
  // Check for repetitive actions (same action/params repeated)
  const actionGroups = {};
  recentActions.forEach(action => {
    const key = `${action.tool}_${JSON.stringify(action.params)}`;
    actionGroups[key] = (actionGroups[key] || 0) + 1;
  });
  
  const maxRepeats = Math.max(...Object.values(actionGroups));
  if (maxRepeats >= 3) {
    patterns.repetitiveActions = true;
    patterns.severity = 'high';
  }
  
  // Check for cycling between different states
  const domHashes = session.stateHistory.slice(-5).map(state => state.domHash);
  const uniqueHashes = new Set(domHashes);
  if (uniqueHashes.size <= 2 && domHashes.length >= 4) {
    patterns.cyclingBetweenStates = true;
    patterns.severity = Math.max(patterns.severity, 'medium');
  }
  
  // Check for failing on same elements
  const failedSelectors = recentActions
    .filter(action => !action.result?.success && action.params?.selector)
    .map(action => action.params.selector);
  
  if (failedSelectors.length >= 3) {
    const selectorCounts = {};
    failedSelectors.forEach(selector => {
      selectorCounts[selector] = (selectorCounts[selector] || 0) + 1;
    });
    
    if (Math.max(...Object.values(selectorCounts)) >= 2) {
      patterns.failingOnSameElement = true;
      patterns.severity = 'high';
    }
  }
  
  // Check for overall lack of progress
  const recentSuccesses = recentActions.filter(action => action.result?.success).length;
  if (recentSuccesses / recentActions.length < 0.3) { // Less than 30% success rate
    patterns.noProgressMade = true;
    patterns.severity = 'high';
  }
  
  return patterns;
}

/**
 * Check if click actions are targeting nearby elements (same area of the page)
 * Used to detect when automation is repeatedly clicking in the same area without progress
 * @param {Array} clickActions - Array of recent click actions with results
 * @returns {boolean} True if clicks are targeting nearby positions
 */
function areClicksNearby(clickActions) {
  if (clickActions.length < 2) return false;

  // Extract position data from click results
  const positions = clickActions
    .filter(a => a.result?.verification?.preState || a.result?.elementInfo)
    .map(a => {
      // Try to get position from element rect if available
      const elementRect = a.result?.elementRect;
      if (elementRect) {
        return { x: elementRect.x + elementRect.width / 2, y: elementRect.y + elementRect.height / 2 };
      }

      // Fallback: compare by selector similarity
      return { selector: a.params?.selector };
    });

  // If we have position data, check for proximity
  const positionsWithCoords = positions.filter(p => p.x !== undefined);
  if (positionsWithCoords.length >= 2) {
    // Check if all positions are within 100px of each other
    const avgX = positionsWithCoords.reduce((sum, p) => sum + p.x, 0) / positionsWithCoords.length;
    const avgY = positionsWithCoords.reduce((sum, p) => sum + p.y, 0) / positionsWithCoords.length;

    const allNearby = positionsWithCoords.every(p => {
      const distance = Math.sqrt(Math.pow(p.x - avgX, 2) + Math.pow(p.y - avgY, 2));
      return distance < 100;
    });

    if (allNearby) return true;
  }

  // Fallback: check selector similarity
  const selectors = positions.filter(p => p.selector).map(p => p.selector);
  if (selectors.length >= 2) {
    // Check if selectors target similar elements (same class or ID patterns)
    const uniqueSelectors = [...new Set(selectors)];
    if (uniqueSelectors.length === 1) {
      return true; // All clicks on same selector
    }

    // Check for similar selector patterns (e.g., all targeting .btn classes)
    const selectorPatterns = selectors.map(s => s.split(/[#.\[\]]/)[0]);
    const uniquePatterns = [...new Set(selectorPatterns)];
    if (uniquePatterns.length <= 2) {
      return true; // Similar selector patterns
    }
  }

  return false;
}

// Generate recovery strategies based on stuck patterns
function generateRecoveryStrategies(patterns, session) {
  const strategies = [];
  
  if (patterns.repetitiveActions) {
    strategies.push({
      type: 'break_repetition',
      description: 'Switch to alternative approach to break repetitive loop',
      priority: 'high'
    });
  }
  
  if (patterns.cyclingBetweenStates) {
    strategies.push({
      type: 'reset_state',
      description: 'Navigate to different page or refresh to reset state',
      priority: 'medium'
    });
  }
  
  if (patterns.failingOnSameElement) {
    strategies.push({
      type: 'alternative_selectors',
      description: 'Use completely different element selection strategy',
      priority: 'high'
    });
  }
  
  if (patterns.noProgressMade) {
    strategies.push({
      type: 'change_approach',
      description: 'Fundamentally change approach (e.g., use Google search instead of direct interaction)',
      priority: 'high'
    });

    // If we navigated or clicked before getting stuck, suggest goBack to return to previous page
    if (session.actionHistory?.some(a => a.tool === 'navigate' || a.tool === 'click' || a.tool === 'clickSearchResult')) {
      strategies.push({
        type: 'go_back',
        description: 'Use goBack to return to previous page (e.g., search results) and try a different link or approach',
        priority: 'high'
      });
    }
  }

  return strategies.sort((a, b) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });
}

// Performance monitoring functions
function initializeSessionMetrics(sessionId) {
  performanceMetrics.sessionStats.set(sessionId, {
    startTime: Date.now(),
    endTime: null,
    totalActions: 0,
    successfulActions: 0,
    failedActions: 0,
    communicationFailures: 0,
    alternativeActionsUsed: 0,
    iterations: 0,
    stuckEvents: 0,
    domStabilityWaits: 0,
    averageActionTime: 0,
    actionTimes: []
  });
  
  performanceMetrics.globalStats.totalSessions++;
}

function trackActionPerformance(sessionId, action, result, startTime, alternativeUsed = false) {
  const sessionStats = performanceMetrics.sessionStats.get(sessionId);
  if (!sessionStats) return;
  
  const actionTime = Date.now() - startTime;
  sessionStats.actionTimes.push(actionTime);
  sessionStats.totalActions++;
  performanceMetrics.globalStats.totalActions++;
  
  if (result.success) {
    sessionStats.successfulActions++;
    performanceMetrics.globalStats.successfulActions++;
  } else {
    sessionStats.failedActions++;
    if (result.failureType === FAILURE_TYPES.COMMUNICATION) {
      sessionStats.communicationFailures++;
      performanceMetrics.globalStats.communicationFailures++;
    }
  }
  
  if (alternativeUsed) {
    sessionStats.alternativeActionsUsed++;
    performanceMetrics.globalStats.alternativeActionsUsed++;
  }
  
  // Update average action time
  sessionStats.averageActionTime = sessionStats.actionTimes.reduce((a, b) => a + b, 0) / sessionStats.actionTimes.length;
}

function finalizeSessionMetrics(sessionId, successful = false) {
  const sessionStats = performanceMetrics.sessionStats.get(sessionId);
  if (!sessionStats) return;
  
  sessionStats.endTime = Date.now();
  const sessionDuration = sessionStats.endTime - sessionStats.startTime;
  
  if (successful) {
    performanceMetrics.globalStats.successfulSessions++;
  }
  
  // Update global averages
  const allSessions = Array.from(performanceMetrics.sessionStats.values());
  const completedSessions = allSessions.filter(s => s.endTime !== null);
  
  if (completedSessions.length > 0) {
    const totalIterations = completedSessions.reduce((sum, s) => sum + s.iterations, 0);
    const totalDuration = completedSessions.reduce((sum, s) => sum + (s.endTime - s.startTime), 0);
    
    performanceMetrics.globalStats.averageIterationsPerSession = totalIterations / completedSessions.length;
    performanceMetrics.globalStats.averageTimePerSession = totalDuration / completedSessions.length;
  }
  
  automationLogger.logTiming(sessionId, 'SESSION', 'complete', sessionDuration, {
    iterations: sessionStats.iterations,
    actions: sessionStats.totalActions,
    successRate: sessionStats.totalActions > 0 ? (sessionStats.successfulActions / sessionStats.totalActions * 100).toFixed(1) + '%' : '0%',
    avgActionTime: sessionStats.averageActionTime.toFixed(0) + 'ms',
    communicationFailures: sessionStats.communicationFailures,
    alternativeActionsUsed: sessionStats.alternativeActionsUsed
  });
}

function accumulateSessionCost(sessionId, model, inputTokens, outputTokens) {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  const analytics = initializeAnalytics();
  const cost = analytics.calculateCost(model, inputTokens, outputTokens);
  session.totalCost = (session.totalCost || 0) + cost;
  session.totalInputTokens = (session.totalInputTokens || 0) + (inputTokens || 0);
  session.totalOutputTokens = (session.totalOutputTokens || 0) + (outputTokens || 0);
}

function getPerformanceReport() {
  const global = performanceMetrics.globalStats;
  const actionSuccessRate = global.totalActions > 0 ? (global.successfulActions / global.totalActions * 100) : 0;
  const sessionSuccessRate = global.totalSessions > 0 ? (global.successfulSessions / global.totalSessions * 100) : 0;
  
  return {
    summary: {
      totalSessions: global.totalSessions,
      sessionSuccessRate: sessionSuccessRate.toFixed(1) + '%',
      totalActions: global.totalActions,
      actionSuccessRate: actionSuccessRate.toFixed(1) + '%',
      averageIterationsPerSession: global.averageIterationsPerSession.toFixed(1),
      averageTimePerSession: (global.averageTimePerSession / 1000).toFixed(1) + 's'
    },
    issues: {
      communicationFailures: global.communicationFailures,
      alternativeActionsNeeded: global.alternativeActionsUsed,
      communicationFailureRate: global.totalActions > 0 ? (global.communicationFailures / global.totalActions * 100).toFixed(1) + '%' : '0%'
    },
    recommendations: generatePerformanceRecommendations()
  };
}

function generatePerformanceRecommendations() {
  const global = performanceMetrics.globalStats;
  const recommendations = [];
  
  if (global.totalActions > 0) {
    const commFailureRate = global.communicationFailures / global.totalActions;
    if (commFailureRate > 0.3) {
      recommendations.push('High communication failure rate detected. Consider improving content script stability.');
    }
    
    const altActionRate = global.alternativeActionsUsed / global.totalActions;
    if (altActionRate > 0.2) {
      recommendations.push('High alternative action usage. Consider improving initial selector accuracy.');
    }
    
    if (global.averageIterationsPerSession > 20) {
      recommendations.push('High iteration count per session. Consider improving stuck detection and recovery.');
    }
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Performance looks good! No issues detected.');
  }
  
  return recommendations;
}

// Domain keyword map: ordered array of [url, keywords] pairs.
// More specific keywords come first to avoid false matches (e.g., "google docs" before "google").
const DOMAIN_KEYWORD_MAP = [
  // Productivity - specific Google products first
  ['https://docs.google.com', ['google docs', 'gdocs']],
  ['https://sheets.google.com', ['google sheets', 'gsheets', 'spreadsheet']],
  ['https://drive.google.com', ['google drive', 'gdrive']],
  ['https://maps.google.com', ['google maps']],
  ['https://news.google.com', ['google news']],
  // Email
  ['https://gmail.com', ['gmail', 'email', 'mail', 'inbox']],
  ['https://outlook.live.com', ['outlook', 'hotmail']],
  // Social media
  ['https://youtube.com', ['youtube']],
  ['https://twitter.com', ['twitter', 'tweet', 'x.com']],
  ['https://facebook.com', ['facebook']],
  ['https://instagram.com', ['instagram']],
  ['https://linkedin.com', ['linkedin']],
  ['https://reddit.com', ['reddit', 'subreddit']],
  ['https://tiktok.com', ['tiktok']],
  // Shopping
  ['https://amazon.com', ['amazon']],
  ['https://ebay.com', ['ebay']],
  ['https://etsy.com', ['etsy']],
  // Entertainment
  ['https://netflix.com', ['netflix']],
  ['https://spotify.com', ['spotify']],
  ['https://twitch.tv', ['twitch']],
  // Development
  ['https://github.com', ['github', 'repository', 'repo']],
  ['https://stackoverflow.com', ['stackoverflow', 'stack overflow']],
  // Communication
  ['https://discord.com', ['discord']],
  ['https://slack.com', ['slack']],
  ['https://web.whatsapp.com', ['whatsapp']],
  // Productivity - other
  ['https://notion.so', ['notion']],
  ['https://dropbox.com', ['dropbox']],
  // Information
  ['https://wikipedia.org', ['wikipedia', 'wiki']],
  ['https://weather.com', ['weather', 'forecast']],
  // Generic Google last (catches "google something" not matched above)
  ['https://google.com', ['google']],
];

// Extract the first logical segment of a multi-step task.
// "Do X on Amazon, then email it" -> "Do X on Amazon"
function getFirstTaskSegment(task) {
  const separators = [' and then ', ', then ', ' then ', ' after that ', ' afterwards ', '. Then ', '. After that '];
  const lowerTask = task.toLowerCase();
  let earliestSplit = task.length;

  for (const sep of separators) {
    const pos = lowerTask.indexOf(sep.toLowerCase());
    if (pos !== -1 && pos < earliestSplit) {
      earliestSplit = pos;
    }
  }

  return earliestSplit < task.length ? task.substring(0, earliestSplit).trim() : task;
}

// Smart navigation: match task keywords to known domains.
// Picks the keyword whose first occurrence is earliest in the task text.
function analyzeTaskAndGetTargetUrl(task) {
  const taskLower = task.toLowerCase();
  let bestUrl = null;
  let bestPosition = Infinity;

  for (const [url, keywords] of DOMAIN_KEYWORD_MAP) {
    for (const kw of keywords) {
      const pos = taskLower.indexOf(kw);
      if (pos !== -1 && pos < bestPosition) {
        bestPosition = pos;
        bestUrl = url;
      }
    }
  }

  return bestUrl || 'https://google.com';
}

// ==========================================
// TAB DISCOVERY & SMART TAB MANAGEMENT
// ==========================================

/**
 * Score how well a tab URL matches the target URL.
 * exact URL = 100, same path = 75, homepage = 50, domain only = 25
 */
function calculateTabScore(tabUrl, targetUrl) {
  try {
    const tab = new URL(tabUrl);
    const target = new URL(targetUrl);
    const tabHost = tab.hostname.replace(/^www\./, '');
    const targetHost = target.hostname.replace(/^www\./, '');
    if (tabHost !== targetHost) return 0;
    if (tab.href === target.href) return 100;
    if (tab.pathname === target.pathname) return 75;
    if (tab.pathname === '/' && !tab.search) return 50;
    return 25;
  } catch {
    return 0;
  }
}

/**
 * Find open tabs matching the target URL's domain, scored and sorted.
 */
async function findMatchingTabs(targetUrl) {
  try {
    const allTabs = await chrome.tabs.query({ currentWindow: true });
    const scored = allTabs
      .map(tab => ({ tab, score: calculateTabScore(tab.url || '', targetUrl) }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.tab.lastAccessed || 0) - (a.tab.lastAccessed || 0);
      });
    return scored.map(entry => entry.tab);
  } catch (error) {
    automationLogger.debug('findMatchingTabs error', { error: error.message });
    return [];
  }
}

/**
 * Determine if a tab has real user content worth preserving.
 */
function isUserContentTab(tab) {
  if (!tab || !tab.url) return false;
  if (isRestrictedURL(tab.url)) return false;
  try {
    const url = new URL(tab.url);
    // Blank / new-tab-like pages
    if (url.pathname === '/' && !url.search && !url.hash) {
      const genericTitles = ['new tab', 'untitled', 'start page', 'home', 'homepage'];
      if (!tab.title || genericTitles.includes(tab.title.toLowerCase().trim())) {
        return false;
      }
      // A domain homepage with a real title (e.g. "Reddit - Dive into anything") is still user content
    }
  } catch {
    return false;
  }
  return true;
}

/**
 * Decide what tab action to take: navigate, switch, or create.
 * Returns { action: 'navigate'|'switch'|'create', tabId?, url?, reason }
 */
async function decideTabAction(currentTabId, currentTabUrl, targetUrl, task) {
  try {
    const targetHost = new URL(targetUrl).hostname.replace(/^www\./, '');
    const currentHost = currentTabUrl ? new URL(currentTabUrl).hostname.replace(/^www\./, '') : '';

    // Already on the target domain - just navigate in place
    if (currentHost === targetHost) {
      return { action: 'navigate', tabId: currentTabId, url: targetUrl, reason: 'Already on target domain' };
    }

    const matchingTabs = await findMatchingTabs(targetUrl);
    const currentTab = await chrome.tabs.get(currentTabId).catch(() => null);
    const currentIsRestricted = !currentTabUrl || isRestrictedURL(currentTabUrl);
    const currentHasContent = currentTab ? isUserContentTab(currentTab) : false;

    if (currentIsRestricted) {
      // Safe to overwrite restricted pages, but prefer existing matching tab
      if (matchingTabs.length > 0) {
        return { action: 'switch', tabId: matchingTabs[0].id, url: targetUrl, reason: 'Found matching tab, current is restricted' };
      }
      return { action: 'navigate', tabId: currentTabId, url: targetUrl, reason: 'Navigating restricted page to target' };
    }

    if (currentHasContent) {
      // Preserve user content - switch to existing tab or open new one
      if (matchingTabs.length > 0) {
        return { action: 'switch', tabId: matchingTabs[0].id, url: targetUrl, reason: 'Switching to matching tab, preserving user content' };
      }
      return { action: 'create', url: targetUrl, reason: 'Creating new tab to preserve user content' };
    }

    // Generic page without meaningful content - navigate in place
    if (matchingTabs.length > 0) {
      return { action: 'switch', tabId: matchingTabs[0].id, url: targetUrl, reason: 'Found matching tab' };
    }
    return { action: 'navigate', tabId: currentTabId, url: targetUrl, reason: 'Navigating generic page to target' };
  } catch (error) {
    automationLogger.debug('decideTabAction error, falling back to navigate', { error: error.message });
    return { action: 'navigate', tabId: currentTabId, url: targetUrl, reason: 'Fallback after error' };
  }
}

/**
 * Add a tab ID to the session's allowed tabs whitelist.
 */
function addAllowedTab(sessionId, tabId, reason) {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  if (!session.allowedTabs.includes(tabId)) {
    session.allowedTabs.push(tabId);
    session.tabHistory.push({ tabId, reason, timestamp: Date.now() });
    automationLogger.debug('Added allowed tab', { sessionId, tabId, reason, allowedTabs: session.allowedTabs });
  }
}

// Check if we should attempt smart navigation
function shouldUseSmartNavigation(url, task) {
  if (!isRestrictedURL(url)) {
    return false; // Not on a restricted page
  }
  
  // Only use smart navigation for chrome://newtab and about:blank
  // Don't navigate away from settings, extensions, etc.
  const navigablePages = [
    'chrome://newtab/',
    'about:blank',
    'chrome://newtab',
    'about:newtab'
  ];
  
  return navigablePages.some(page => url.startsWith(page));
}

// Service Worker compatible analytics class
class BackgroundAnalytics {
  constructor() {
    this.usageData = [];
    this.currentModel = 'grok-3-fast';
    this.initialized = false;
    this.initPromise = this.initialize();
  }
  
  async initialize() {
    try {
      automationLogger.logInit('analytics', 'loading', {});
      await this.loadStoredData();
      this.initialized = true;
      automationLogger.logInit('analytics', 'ready', {});
    } catch (error) {
      automationLogger.logInit('analytics', 'failed', { error: error.message });
    }
  }
  
  async loadStoredData() {
    try {
      const result = await chrome.storage.local.get(['fsbUsageData', 'fsbCurrentModel']);
      if (result.fsbUsageData) {
        // Phase 271 (v0.9.69) reconciliation #1 + decision 7: mirror the
        // back-fill walk from extension/utils/analytics.js so the inline
        // BackgroundAnalytics class does not clobber MCP rows or strip
        // back-fillable AI-provider rows. The walk:
        //   1. AI-provider-shaped rows lacking source -> source='ai-provider'
        //   2. Already-sourced rows pass through normalizeUsageSource (which
        //      whitelists 'mcp' and 'ai-provider' as of Phase 271).
        //   3. After the walk, if ANY row was back-filled, persist once via
        //      saveData() so reload paths don't re-run the heuristic.
        let backfilledAny = false;
        this.usageData = result.fsbUsageData.map((entry) => {
          const next = { ...entry };
          const hasSourceString = typeof next.source === 'string' && next.source.length > 0;
          if (
            !hasSourceString &&
            typeof next.model === 'string' &&
            typeof next.inputTokens === 'number'
          ) {
            next.source = 'ai-provider';
            backfilledAny = true;
          } else {
            next.source = typeof normalizeUsageSource === 'function'
              ? normalizeUsageSource(next.source)
              : (next.source || 'automation');
          }
          return next;
        });
        automationLogger.debug('Loaded analytics data', { entries: this.usageData.length });
        if (backfilledAny) {
          // Single persist pass after the migration.
          await this.saveData();
        }
      }
      if (result.fsbCurrentModel) {
        this.currentModel = result.fsbCurrentModel;
      }
    } catch (error) {
      automationLogger.error('Failed to load analytics data', { error: error.message });
    }
  }
  
  async saveData() {
    try {
      automationLogger.debug('Saving analytics data', { entries: this.usageData.length, model: this.currentModel });

      await chrome.storage.local.set({
        fsbUsageData: this.usageData,
        fsbCurrentModel: this.currentModel
      });

      automationLogger.debug('Analytics data saved', { entries: this.usageData.length });

      // Verify save by reading back
      const verify = await chrome.storage.local.get(['fsbUsageData']);
      automationLogger.debug('Analytics save verified', { savedEntries: verify.fsbUsageData?.length });
    } catch (error) {
      automationLogger.error('Failed to save analytics data', { error: error.message });
      throw error; // Re-throw to be caught by caller
    }
  }
  
  calculateCost(model, inputTokens, outputTokens) {
    const pricing = {
      // New Grok 4.1 series (2026)
      'grok-4-1': { input: 3.00, output: 15.00 },
      'grok-4-1-fast': { input: 0.20, output: 0.50 },
      'grok-4-1-fast-non-reasoning': { input: 0.20, output: 0.50 },
      'grok-4': { input: 3.00, output: 15.00 },
      'grok-code-fast-1': { input: 0.20, output: 1.50 },
      'grok-3': { input: 3.00, output: 15.00 },
      'grok-3-mini': { input: 0.30, output: 0.50 },
      'grok-2-vision': { input: 2.00, output: 10.00 },
      // Legacy model IDs for backward compatibility
      'grok-3-fast': { input: 0.20, output: 0.50 },
      'grok-3-mini-beta': { input: 0.30, output: 0.50 },
      'grok-3-mini-fast-beta': { input: 0.20, output: 0.50 },
      'grok-4-fast': { input: 3.00, output: 15.00 },
      // Other providers
      'gpt-4o': { input: 2.50, output: 10.00 },
      'gpt-4o-mini': { input: 0.15, output: 0.60 }
    };

    const modelPricing = pricing[model] || pricing['grok-4-1-fast'];
    const inputCost = (inputTokens / 1000000) * modelPricing.input;
    const outputCost = (outputTokens / 1000000) * modelPricing.output;
    return inputCost + outputCost;
  }
  
  async trackUsage(model, inputTokens, outputTokens, success = true, source = 'automation', provider = '') {
    try {
      // Ensure initialization is complete
      if (!this.initialized) {
        await this.initPromise;
      }

      const entry = {
        timestamp: Date.now(),
        model: model,
        inputTokens: inputTokens || 0,
        outputTokens: outputTokens || 0,
        success: success,
        source: typeof normalizeUsageSource === 'function'
          ? normalizeUsageSource(source)
          : (source || 'automation'),
        cost: this.calculateCost(model, inputTokens, outputTokens, provider)
      };

      this.usageData.push(entry);
      this.currentModel = model;

      automationLogger.logAPI(null, 'analytics', 'track', { model, inputTokens, outputTokens, success, source, cost: entry.cost });

      // Clean old data (keep only last 30 days)
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      this.usageData = this.usageData.filter(entry => entry.timestamp > thirtyDaysAgo);

      await this.saveData();

    } catch (error) {
      automationLogger.error('Failed to track usage', { error: error.message });
      throw error; // Re-throw to be caught by caller
    }
  }
}

// Initialize analytics
function initializeAnalytics() {
  if (!globalAnalytics) {
    globalAnalytics = new BackgroundAnalytics();
    automationLogger.logInit('background_analytics', 'ready', {});
  }
  return globalAnalytics;
}

/**
 * Validates if a result is meaningful based on task context
 * @param {string} result - The result to validate
 * @param {string} task - The original task
 * @returns {boolean} True if result is valid and meaningful
 */
function isValidResult(result, task) {
  // Handle null/undefined
  if (!result || result === null || result === undefined) {
    return false;
  }
  
  // Convert to string for analysis
  const resultStr = String(result).trim();
  
  // Empty results or placeholder text are invalid
  if (resultStr === '' || resultStr === 'null' || resultStr === 'undefined') {
    return false;
  }
  
  // Reject generic placeholder messages
  const genericMessages = [
    'task completed',
    'task completed successfully', 
    'completed successfully',
    'done',
    'finished',
    'success',
    'completed',
    'found it',
    'found the information',
    'extracted the data'
  ];
  
  const resultLower = resultStr.toLowerCase();
  if (genericMessages.some(msg => resultLower === msg || resultLower === msg + '.')) {
    return false;
  }
  
  // Accept any result that is reasonably detailed (shows AI provided context)
  // This is much more permissive than the old validation
  if (resultStr.length >= 15) {
    // Check if it contains meaningful content words (not just filler)
    const meaningfulWords = resultStr.match(/\b\w{3,}\b/g) || [];
    return meaningfulWords.length >= 3; // At least 3 meaningful words
  }
  
  // For shorter results, be more flexible - accept if it has specific data patterns
  // Numbers, currency, percentages, URLs, etc.
  const hasSpecificData = /(\d+\.?\d*|\$|%|https?:\/\/|@|#|\w+\.\w+)/.test(resultStr);
  if (hasSpecificData && resultStr.length >= 5) {
    return true;
  }
  
  // Accept if it looks like extracted data (has quotes, colons, specific formats)
  const hasDataFormat = /(["'].*["']|:\s*\w+|\w+:\s*\w+|\d+\s*(USD|EUR|BTC|°F|°C|%))/.test(resultStr);
  if (hasDataFormat) {
    return true;
  }
  
  // Default: accept anything with reasonable length and multiple words
  const wordCount = (resultStr.match(/\b\w+\b/g) || []).length;
  return wordCount >= 2 && resultStr.length >= 8;
}

/**
 * Creates a unique signature for an action based on tool and key parameters
 * @param {Object} action - The action object
 * @returns {string} A unique signature for the action
 */
function createActionSignature(action) {
  // Create a signature that uniquely identifies this action
  const tool = action.tool || '';
  const params = action.params || {};
  
  // For most actions, the selector is the key differentiator
  if (params.selector) {
    return `${tool}:${params.selector}`;
  }
  
  // For navigation actions, use the URL
  if (params.url) {
    return `${tool}:${params.url}`;
  }
  
  // For type actions, include the text (truncated)
  if (tool === 'type' && params.text) {
    const textPreview = params.text.substring(0, 20);
    return `${tool}:${params.selector || 'unknown'}:${textPreview}`;
  }
  
  // For other actions, create a simple hash of params
  const paramsStr = JSON.stringify(params);
  return `${tool}:${simpleHash(paramsStr)}`;
}

/**
 * Simple hash function for creating signatures
 * @param {string} str - String to hash
 * @returns {number} Hash value
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * CMP-03: Classify a task string into one of the supported task types.
 * Simplified port of ai-integration.js detectTaskType() for background.js use
 * (no site guide dependency). Used by completion validators and progress tracking.
 * @param {string} taskString - The user's task description
 * @returns {string} One of: 'multitab', 'gaming', 'email', 'messaging', 'form', 'shopping', 'career', 'search', 'extraction', 'navigation', 'general'
 */
function classifyTask(taskString) {
  if (!taskString) return 'general';
  const t = taskString.toLowerCase();

  // Multitab / cross-site workflows -- MUST check before messaging/search/extraction
  // to avoid partial keyword matches (e.g. "post" matching messaging, "check" matching extraction)
  const outputDestinations = ['google doc', 'google sheet', 'google drive', 'google slide', 'notion', 'spreadsheet', 'my doc', 'my sheet'];
  const gatherActions = ['find', 'search', 'research', 'get', 'look up', 'check', 'go to', 'visit', 'summarize', 'compile'];
  const hasOutputDest = outputDestinations.some(kw => t.includes(kw));
  const hasGatherAction = gatherActions.some(kw => t.includes(kw));
  if (hasOutputDest && hasGatherAction) return 'multitab';
  // Sequential cross-site tasks (e.g. "go to X then Y")
  const sequentialSeparators = [' and then ', ', then ', ' then ', ' after that ', ' afterwards '];
  const hasSequentialSep = sequentialSeparators.some(sep => t.includes(sep));
  if (hasSequentialSep) {
    const domainKeywords = [
      'gmail', 'email', 'mail', 'outlook', 'amazon', 'ebay', 'etsy',
      'youtube', 'twitter', 'facebook', 'instagram', 'linkedin', 'reddit',
      'github', 'stackoverflow', 'google docs', 'google sheets', 'google drive',
      'netflix', 'spotify', 'twitch', 'discord', 'slack', 'whatsapp',
      'notion', 'dropbox', 'wikipedia'
    ];
    const matched = domainKeywords.filter(kw => t.includes(kw));
    if (matched.length >= 2) return 'multitab';
  }
  // Explicit tab keywords
  if (/new tab|open tab|switch tab|multiple tab|other tab|different tab|compare|both sites|cross-reference/.test(t)) return 'multitab';
  // Gaming
  if (/play|game|start game|asteroids|snake|pong|tetris/.test(t) && !/play.*video|play.*music|play.*song|playlist/.test(t)) return 'gaming';
  // Email -- check before messaging to avoid 'send' matching messaging
  if (/email|mail|gmail|outlook|compose|inbox|draft/.test(t)) return 'email';
  // Messaging -- 'send', 'reply', 'post', 'comment' etc. (after email ruled out)
  if (/message|send|text|chat|reply|comment|dm\b|post/.test(t)) return 'messaging';
  // Form
  if (/fill|form|submit|register|sign.?up|apply/.test(t)) return 'form';
  // Shopping
  if (/buy|purchase|order|add.?to.?cart|checkout|shop/.test(t)) return 'shopping';
  // Career -- check before search since "find jobs" would otherwise match search
  if (/career|job|jobs|position|opening|hiring|employment/.test(t)) return 'career';
  // Search
  if (/search|find|look.?for|what.?is|how.?to/.test(t)) return 'search';
  // Extraction
  if (/get|extract|price|read|check|scrape/.test(t)) return 'extraction';
  // Navigation
  if (/go.?to|navigate|open|visit/.test(t)) return 'navigation';
  // Fallback
  return 'general';
}

// CMP-03: Irrevocable verb pattern -- matches verbs whose side effects cannot be undone
const IRREVOCABLE_VERB_PATTERN = /send|submit|purchase|order|delete|publish|post/i;

/**
 * CMP-03: Record a critical (irrevocable) action in the session registry.
 * Called after action execution when the action is a click on an element whose
 * text or selector matches the irrevocable verb pattern.
 * @param {Object} session - The automation session
 * @param {Object} action - The action object { tool, params }
 * @param {Object} result - The slim action result
 */
function recordCriticalAction(session, action, result) {
  // Initialize registry if absent
  if (!session.criticalActionRegistry) {
    session.criticalActionRegistry = {
      actions: [],    // { tool, selector, elementText, iteration, verified, timestamp }
      cooldowns: {}   // { signature: { blockedUntilIteration, reason } }
    };
  }
  const registry = session.criticalActionRegistry;

  const elementText = result?.elementText || result?.clicked || '';
  const selector = action.params?.selector || '';

  // Push to actions array (cap at 20, drop oldest per Pitfall 6)
  registry.actions.push({
    tool: action.tool,
    selector: selector.substring(0, 80),
    elementText: elementText.substring(0, 50),
    iteration: session.iterationCount,
    verified: false,
    timestamp: Date.now()
  });
  if (registry.actions.length > 20) {
    registry.actions.shift();
  }

  // Set 3-iteration cooldown on the action signature
  const signature = createActionSignature(action);
  registry.cooldowns[signature] = {
    blockedUntilIteration: session.iterationCount + 3,
    reason: `Irrevocable action "${elementText.substring(0, 30)}" needs cooldown`
  };

  automationLogger.info('Critical action recorded', {
    sessionId: session.id,
    tool: action.tool,
    elementText: elementText.substring(0, 30),
    cooldownUntil: session.iterationCount + 3
  });
}

/**
 * CMP-03: Check if an action is currently on cooldown (blocked from re-execution).
 * @param {Object} session - The automation session
 * @param {Object} action - The action to check
 * @returns {boolean} True if the action is blocked (still cooling down)
 */
function isCooledDown(session, action) {
  if (!session.criticalActionRegistry?.cooldowns) return false;
  const signature = createActionSignature(action);
  const cooldown = session.criticalActionRegistry.cooldowns[signature];
  if (!cooldown) return false;
  return session.iterationCount < cooldown.blockedUntilIteration;
}

/**
 * CMP-03: Get a compact summary of critical actions for prompt injection.
 * @param {Object} session - The automation session
 * @returns {Array} Array of { description, verified, cooldownRemaining }
 */
function getCriticalActionSummary(session) {
  if (!session.criticalActionRegistry?.actions?.length) return [];
  const summary = [];
  let charCount = 0;
  // Iterate most recent first, stop at 300 chars
  const actions = session.criticalActionRegistry.actions.slice().reverse();
  for (const entry of actions) {
    const cooldownEntry = session.criticalActionRegistry.cooldowns[
      `${entry.tool}:${entry.selector}`
    ];
    const cooldownRemaining = cooldownEntry
      ? Math.max(0, cooldownEntry.blockedUntilIteration - session.iterationCount)
      : 0;
    const desc = `${entry.tool} "${entry.elementText}" @iter${entry.iteration}`;
    if (charCount + desc.length > 300) break;
    summary.push({
      description: desc,
      verified: entry.verified,
      cooldownRemaining
    });
    charCount += desc.length;
  }
  return summary;
}

// ============================================================================
// CMP-01 + CMP-02: Multi-signal completion validation
// Replaces ad-hoc completion checks with structured task-type validators
// and weighted multi-signal scoring.
// ============================================================================

/**
 * CMP-02: Detect URL patterns that indicate task completion.
 * @param {string} url - The current page URL
 * @param {Object} session - The automation session
 * @returns {string|null} Matched pattern description, or null
 */
function detectUrlCompletionPattern(url, session) {
  if (!url) return null;
  // Check for success URL patterns
  const successPattern = /\/(?:confirm|success|thank|receipt|done|complete|order-placed|submitted)/i;
  const match = url.match(successPattern);
  if (match) return 'success-url: ' + match[0];
  // For navigation tasks: URL differs from start
  if (session.startUrl && url !== session.startUrl) {
    const startHost = new URL(session.startUrl).hostname;
    const currentHost = new URL(url).hostname;
    if (startHost !== currentHost) return 'navigated-away: ' + currentHost;
  }
  return null;
}

/**
 * CMP-01: Check if action history shows task-appropriate completion.
 * @param {Object} session - The automation session
 * @param {string} taskType - Classified task type
 * @returns {boolean}
 */
function checkActionChainComplete(session, taskType) {
  const history = session.actionHistory || [];
  if (history.length === 0) return false;
  const recent = history.slice(-15);
  switch (taskType) {
    case 'messaging':
    case 'email': {
      // Has a successful click on a send/submit-like element
      return recent.some(a =>
        a.tool === 'click' && a.result?.success &&
        /send|submit|post|reply/i.test(a.result?.elementText || a.result?.clicked || a.params?.selector || '')
      );
    }
    case 'form':
    case 'shopping': {
      // Type actions followed by a submit click
      const hasType = recent.some(a => a.tool === 'type' && a.result?.success);
      const hasSubmit = recent.some(a =>
        a.tool === 'click' && a.result?.success &&
        /submit|confirm|place.?order|checkout|register|sign.?up|apply|continue/i.test(
          a.result?.elementText || a.result?.clicked || a.params?.selector || ''
        )
      );
      return hasType && hasSubmit;
    }
    case 'navigation': {
      return session.startUrl && session.lastUrl !== session.startUrl;
    }
    case 'search': {
      const hasSearch = recent.some(a =>
        (a.tool === 'type' || a.tool === 'searchGoogle') && a.result?.success
      );
      const hasNavOrResult = recent.some(a =>
        (a.tool === 'clickSearchResult' || a.tool === 'click' || a.tool === 'getText') && a.result?.success
      );
      return hasSearch && hasNavOrResult;
    }
    case 'extraction': {
      return recent.some(a =>
        a.tool === 'getText' && a.result?.success && a.result?.value && a.result.value.trim().length > 0
      );
    }
    case 'multitab': {
      // Cross-site workflows: navigated to 2+ distinct domains AND performed data actions (getText/type)
      const urlEntries = (session.urlHistory || []).map(e => e.url || e);
      if (session.lastUrl) urlEntries.push(session.lastUrl);
      const uniqueHosts = new Set();
      for (const u of urlEntries) {
        try { uniqueHosts.add(new URL(u).hostname); } catch (_) { /* skip invalid */ }
      }
      const hasDataAction = recent.some(a =>
        (a.tool === 'getText' || a.tool === 'type') && a.result?.success
      );
      return uniqueHosts.size >= 2 && hasDataAction;
    }
    default:
      return false;
  }
}

/**
 * CMP-02: Summarize the last 5 actions as compact evidence string.
 * @param {Object} session - The automation session
 * @returns {string}
 */
function summarizeRecentActions(session) {
  const recent = (session.actionHistory || []).slice(-5);
  return recent.map(a => {
    const status = a.result?.success ? 'ok' : 'fail';
    const target = (a.result?.elementText || a.params?.selector || '').substring(0, 25);
    return `${a.tool}(${target}):${status}`;
  }).join(', ');
}

/**
 * CMP-02: Collect completion signals from all sources.
 * @param {Object} session - The automation session
 * @param {Object} aiResponse - The AI response with taskComplete and result
 * @param {Object} context - The iteration context (includes completionSignals from DOM)
 * @returns {Object} Signal bundle for scoring
 */
function gatherCompletionSignals(session, aiResponse, context) {
  const taskType = classifyTask(session.task);
  return {
    // URL signal (0.3 weight)
    urlMatch: detectUrlCompletionPattern(context.currentUrl, session),
    // DOM signal (0.25 weight) -- from content script completionSignals (Plan 02)
    domSuccess: context.completionSignals?.successMessages?.length > 0
      ? context.completionSignals.successMessages[0].text : null,
    confirmationPage: context.completionSignals?.confirmationPage || false,
    formReset: context.completionSignals?.formReset || false,
    toast: context.completionSignals?.toastNotification?.text || null,
    // AI self-report (0.2 weight, boosted when actions empty)
    aiComplete: aiResponse.taskComplete === true,
    aiResult: aiResponse.result || '',
    aiActionsEmpty: aiResponse.taskComplete === true && (!aiResponse.actions || aiResponse.actions.length === 0),
    // Action chain (0.15 weight)
    actionChainComplete: checkActionChainComplete(session, taskType),
    actionChainEvidence: summarizeRecentActions(session),
    criticalActionsVerified: (session.criticalActionRegistry?.actions || [])
      .filter(a => a.verified).length,
    // Page stability (0.1 weight) -- use changeSignals if available
    pageStable: !context.changeSignals?.changed || false
  };
}

/**
 * CMP-02: Compute weighted completion score from gathered signals.
 * @param {Object} signals - Signal bundle from gatherCompletionSignals
 * @param {string} taskType - Classified task type
 * @returns {{ score: number, evidence: string[], threshold: number }}
 */
function computeCompletionScore(signals, taskType) {
  const weights = {
    urlSignal: 0.3,
    domSignal: 0.25,
    aiReport: 0.2,
    actionChain: 0.15,
    pageStability: 0.1
  };
  let score = 0;
  const evidence = [];

  // URL signal
  if (signals.urlMatch) {
    score += weights.urlSignal;
    evidence.push('URL: ' + signals.urlMatch);
  }
  // DOM signal (any of: success message, confirmation page, toast, form reset with action chain)
  if (signals.domSuccess || signals.confirmationPage || signals.toast) {
    score += weights.domSignal;
    evidence.push('DOM: ' + (signals.domSuccess || signals.toast || 'confirmation page'));
  } else if (signals.formReset && signals.actionChainComplete) {
    // Form reset alone is weak (Pitfall: empty forms on load); combine with action chain
    score += weights.domSignal * 0.5;
    evidence.push('DOM: form reset + action chain');
  }
  // AI self-report
  if (signals.aiComplete && signals.aiResult.length >= 10) {
    score += weights.aiReport;
    evidence.push('AI: task complete');
    // Boost: AI says complete AND submitted zero actions -- strongest completion indicator.
    // The AI has nothing left to do. This warrants extra weight (+0.15).
    if (signals.aiActionsEmpty) {
      score += 0.15;
      evidence.push('AI: no remaining actions');
    }
  }
  // Action chain
  if (signals.actionChainComplete) {
    score += weights.actionChain;
    evidence.push('Actions: chain complete');
  }
  // Page stability
  if (signals.pageStable) {
    score += weights.pageStability;
    evidence.push('Page: stable');
  }

  return { score, evidence, threshold: 0.5 };
}

// --- Task-type-specific validators (CMP-01) ---
// Each returns { approved: boolean, score: number, evidence: string[], taskType: string }

function messagingValidator(session, aiResponse, context, signals, scoreResult) {
  let { score, evidence } = scoreResult;
  // Bonus: compose window closed or send button was clicked and verified
  const sendClicked = (session.criticalActionRegistry?.actions || []).some(a =>
    /send|submit|post|reply/i.test(a.elementText) && a.verified
  );
  if (sendClicked) {
    score = Math.min(1, score + 0.1);
    evidence.push('Messaging: send action verified');
  }
  return { approved: score >= 0.5, score, evidence, taskType: 'messaging' };
}

function formValidator(session, aiResponse, context, signals, scoreResult) {
  let { score, evidence } = scoreResult;
  // Bonus: URL changed after form submission
  if (signals.urlMatch && signals.actionChainComplete) {
    score = Math.min(1, score + 0.1);
    evidence.push('Form: URL changed + submit chain');
  }
  return { approved: score >= 0.5, score, evidence, taskType: 'form' };
}

function navigationValidator(session, aiResponse, context, signals, scoreResult) {
  let { score, evidence } = scoreResult;
  // URL change to expected target is a strong signal for navigation
  if (signals.urlMatch) {
    score = Math.min(1, score + 0.1);
    evidence.push('Navigation: URL matches target');
  }
  return { approved: score >= 0.5, score, evidence, taskType: 'navigation' };
}

function searchValidator(session, aiResponse, context, signals, scoreResult) {
  let { score, evidence } = scoreResult;
  // Search tasks have a low bar -- search + results page loaded
  if (signals.actionChainComplete) {
    score = Math.min(1, score + 0.05);
    evidence.push('Search: results obtained');
  }
  return { approved: score >= 0.5, score, evidence, taskType: 'search' };
}

function careerValidator(session, aiResponse, context, signals, scoreResult) {
  let { score, evidence } = scoreResult;
  const currentUrl = context.currentUrl || '';
  const resultText = (aiResponse.result || '');
  const resultLower = resultText.toLowerCase();

  // Bonus: AI is on a career site URL (not Google, not Sheets)
  const careerUrlPatterns = [
    /careers?\./i,
    /jobs?\./i,
    /\/careers/i,
    /\/jobs/i,
    /workday\.com/i,
    /greenhouse\.io/i,
    /lever\.co/i,
    /icims\.com/i,
    /taleo/i,
    /indeed\.com/i,
    /glassdoor\.com/i,
    /builtin\.com/i
  ];
  const isOnCareerSite = careerUrlPatterns.some(p => p.test(currentUrl));
  if (isOnCareerSite) {
    score = Math.min(1, score + 0.1);
    evidence.push('Career: on career site URL');
  }

  // Bonus: getText actions indicate job data extraction
  const actionHistory = session.actionHistory || [];
  const getTextCount = actionHistory.filter(a => a.tool === 'getText').length;
  const getAttrCount = actionHistory.filter(a => a.tool === 'getAttribute').length;
  if (getTextCount >= 2) {
    score = Math.min(1, score + 0.1);
    evidence.push('Career: getText extraction actions (' + getTextCount + ')');
  }
  if (getAttrCount >= 1) {
    score = Math.min(1, score + 0.05);
    evidence.push('Career: getAttribute actions for links (' + getAttrCount + ')');
  }

  // Bonus: AI result contains structured job data
  const hasJobsFound = /jobs?\s*found|found\s*\d+\s*jobs?/i.test(resultText);
  const hasApplyLink = /https?:\/\//i.test(resultText);
  const hasJobTitle = resultText.split('\n').filter(line =>
    /engineer|manager|analyst|developer|designer|intern|director|specialist|associate|coordinator/i.test(line)
  ).length >= 1;
  const hasErrorReport = /NO RESULTS|AUTH REQUIRED|PAGE ERROR|NO GUIDE|no.*results|requires.*login|auth.*wall/i.test(resultText);

  if (hasJobsFound || (hasJobTitle && hasApplyLink)) {
    score = Math.min(1, score + 0.15);
    evidence.push('Career: structured job data in result');
  }
  if (hasErrorReport) {
    // Error reports are valid completions (SEARCH-05)
    score = Math.min(1, score + 0.15);
    evidence.push('Career: explicit error report (valid completion)');
  }

  // Bonus: navigation + search + extraction pattern (click + type + getText)
  const clickCount = actionHistory.filter(a => a.tool === 'click').length;
  const typeCount = actionHistory.filter(a => a.tool === 'type').length;
  if (clickCount >= 2 && typeCount >= 1 && getTextCount >= 2) {
    score = Math.min(1, score + 0.1);
    evidence.push('Career: navigate+search+extract action pattern');
  }

  return { approved: score >= 0.5, score, evidence, taskType: 'career' };
}

function extractionValidator(session, aiResponse, context, signals, scoreResult) {
  let { score, evidence } = scoreResult;
  // Very permissive -- getText returned content
  if (signals.actionChainComplete && signals.aiResult.length >= 10) {
    score = Math.min(1, score + 0.1);
    evidence.push('Extraction: data extracted');
  }
  return { approved: score >= 0.5, score, evidence, taskType: 'extraction' };
}

function multitabValidator(session, aiResponse, context, signals, scoreResult) {
  let { score, evidence } = scoreResult;
  // Cross-site workflows often lack URL/DOM success signals (e.g. typing in Google Docs).
  // Bonus: visited 2+ distinct hosts AND performed data actions (getText + type)
  const urlEntries = (session.urlHistory || []).map(e => e.url || e);
  if (session.lastUrl) urlEntries.push(session.lastUrl);
  const uniqueHosts = new Set();
  for (const u of urlEntries) {
    try { uniqueHosts.add(new URL(u).hostname); } catch (_) { /* skip */ }
  }
  const history = session.actionHistory || [];
  const hasGetText = history.some(a => a.tool === 'getText' && a.result?.success);
  const hasType = history.some(a => a.tool === 'type' && a.result?.success);
  if (uniqueHosts.size >= 2 && (hasGetText || hasType)) {
    score = Math.min(1, score + 0.15);
    evidence.push('Multitab: cross-site data workflow (' + uniqueHosts.size + ' hosts)');
  }
  if (hasGetText && hasType) {
    score = Math.min(1, score + 0.1);
    evidence.push('Multitab: extract+write pattern');
  }
  return { approved: score >= 0.5, score, evidence, taskType: 'multitab' };
}

function generalValidator(session, aiResponse, context, signals, scoreResult) {
  // Score-only decision, no bonuses
  return { approved: scoreResult.score >= 0.5, score: scoreResult.score, evidence: scoreResult.evidence, taskType: 'general' };
}

/**
 * CMP-01: Main completion validation dispatcher.
 * Replaces the ad-hoc isMessagingTask / critical-failures block.
 * @param {Object} session - The automation session
 * @param {Object} aiResponse - The AI response
 * @param {Object} context - The iteration context
 * @returns {{ approved: boolean, score: number, evidence: string[], taskType: string }}
 */
function validateCompletion(session, aiResponse, context) {
  // Require non-empty result from AI (keep existing check: length >= 10)
  if (!aiResponse.result || aiResponse.result.trim().length < 10) {
    return { approved: false, score: 0, evidence: ['AI result too short or missing'], taskType: 'unknown' };
  }

  const taskType = classifyTask(session.task);
  const signals = gatherCompletionSignals(session, aiResponse, context);
  const scoreResult = computeCompletionScore(signals, taskType);

  // Dispatch to task-type-specific validator
  const validators = {
    messaging: messagingValidator,
    email: messagingValidator,
    form: formValidator,
    shopping: formValidator,
    navigation: navigationValidator,
    search: searchValidator,
    career: careerValidator,
    extraction: extractionValidator,
    multitab: multitabValidator,
    gaming: generalValidator,
    general: generalValidator
  };
  const validator = validators[taskType] || generalValidator;
  const result = validator(session, aiResponse, context, signals, scoreResult);

  automationLogger.debug('Completion signals gathered', {
    sessionId: session.id,
    taskType,
    signals: {
      urlMatch: signals.urlMatch,
      domSuccess: !!signals.domSuccess,
      confirmationPage: signals.confirmationPage,
      toast: !!signals.toast,
      formReset: signals.formReset,
      aiComplete: signals.aiComplete,
      actionChainComplete: signals.actionChainComplete,
      pageStable: signals.pageStable
    },
    score: result.score,
    approved: result.approved
  });

  return result;
}

/**
 * Detects if specific actions have failed repeatedly
 * @param {Object} session - The automation session
 * @returns {Array} Array of actions that need alternative strategies
 */
function detectRepeatedActionFailures(session) {
  const repeatedFailures = [];
  
  // Check each failed action
  for (const [signature, details] of Object.entries(session.failedActionDetails)) {
    // If an action has failed 2 or more times, it needs an alternative strategy
    if (details.count >= 2) {
      repeatedFailures.push({
        signature,
        tool: details.tool,
        params: details.params,
        failureCount: details.count,
        lastError: details.errors[details.errors.length - 1]?.error || 'Unknown error',
        allErrors: details.errors.map(e => e.error),
        timeSinceFirstFailure: Date.now() - details.firstFailure
      });
    }
  }
  
  return repeatedFailures;
}

/**
 * Detects if the same valid result has been extracted multiple times
 * @param {Object} session - The automation session
 * @returns {string|null} The repeated result if found, null otherwise
 */
function detectRepeatedSuccess(session) {
  // Look at recent getText actions
  const recentTextActions = session.actionHistory
    .filter(action => action.tool === 'getText' && action.result?.success && action.result?.value)
    .slice(-10); // Last 10 successful getText actions
  
  if (recentTextActions.length < 3) {
    return null; // Not enough data
  }
  
  // Count occurrences of each result
  const resultCounts = {};
  recentTextActions.forEach(action => {
    const value = String(action.result.value).trim();
    if (value && value !== 'null' && value !== 'undefined') {
      resultCounts[value] = (resultCounts[value] || 0) + 1;
    }
  });
  
  // Find results that appear at least 3 times
  for (const [result, count] of Object.entries(resultCounts)) {
    if (count >= 3 && isValidResult(result, session.task)) {
      automationLogger.debug('Found repeated valid result', { result: result.substring(0, 100), count });
      return result;
    }
  }
  
  // Also check for similar results (e.g., same number with different formatting)
  const numericResults = recentTextActions
    .map(action => {
      const value = String(action.result.value).trim();
      const numMatch = value.match(/(\d+\.?\d*)/);
      return numMatch ? parseFloat(numMatch[1]) : null;
    })
    .filter(num => num !== null);

  if (numericResults.length >= 3) {
    // Check if the same number appears multiple times
    const numCounts = {};
    numericResults.forEach(num => {
      numCounts[num] = (numCounts[num] || 0) + 1;
    });

    for (const [num, count] of Object.entries(numCounts)) {
      if (count >= 3) {
        automationLogger.debug('Found repeated numeric result', { num, count });
        return String(num);
      }
    }
  }

  return null;
}

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Security: Only accept messages from our own extension contexts
  if (sender.id !== chrome.runtime.id) {
    console.warn('[FSB] Rejected message from unknown sender:', sender.id);
    sendResponse({ success: false, error: 'Unauthorized sender' });
    return;
  }

  armMcpBridge('runtime.onMessage');

  automationLogger.logComm(null, 'receive', request.action || 'unknown', true, { tabId: sender.tab?.id });

  switch (request.action) {
    case 'ensureLegacyAgent': {
      // Phase 240 D-02: legacy surfaces (popup, sidepanel, autopilot)
      // synthesize a constant agentId via Plan 01's getOrRegisterLegacyAgent
      // carve-out. Each surface calls this once at boot; the registry mints
      // the agent if missing or returns the existing record. The runtime
      // action accepts only 3 hardcoded surfaces -- the registry's ALLOWED
      // map enforces the carve-out boundary (T-240-04 mitigation).
      const surface = (request && typeof request.surface === 'string') ? request.surface : null;
      if (!globalThis.fsbAgentRegistryInstance) {
        sendResponse({ success: false, error: 'agent_registry_not_initialized' });
        return true;
      }
      globalThis.fsbAgentRegistryInstance.getOrRegisterLegacyAgent(surface)
        .then((result) => {
          if (result && result.error) {
            sendResponse({ success: false, error: result.error, surface: result.surface || surface });
            return;
          }
          sendResponse({
            success: true,
            agentId: result.agentId,
            ownershipToken: (result && result.ownershipToken) || null
          });
        })
        .catch((err) => {
          sendResponse({ success: false, error: (err && err.message) || String(err) });
        });
      return true; // async response
    }

    case 'startAutomation':
      handleStartAutomation(request, sender, sendResponse);
      return true; // Will respond asynchronously

    case 'stopAutomation':
      handleStopAutomation(request, sender, sendResponse);
      return true; // Will respond asynchronously
      
    case 'getPerformanceReport':
      const report = getPerformanceReport();
      sendResponse({ success: true, report });
      break;
      
    case 'callAI':
      handleAICall(request, sender, sendResponse);
      return true; // Will respond asynchronously
      
    case 'getStatus': {
      // QT-wnz Codex-2 -- tab-scoped status lookup.
      // Pre-wnz: returned sessionIds[0] globally; a fresh sidepanel document
      // on Tab B would adopt sess_A if sess_A was activeSessions.keys()[0],
      // poisoning Tab B's currentSessionId. See CODEX-RESPONSE.md L10042.
      var _allSessionIds = Array.from(activeSessions.keys());
      var _scopedSessionIds = _allSessionIds;
      var _scopedFirst = null;
      if (typeof request.activeTabId === 'number') {
        _scopedSessionIds = _allSessionIds.filter(function (sid) {
          var s = activeSessions.get(sid);
          return s && s.tabId === request.activeTabId;
        });
        _scopedFirst = _scopedSessionIds.length > 0 ? activeSessions.get(_scopedSessionIds[0]) : null;
      } else {
        // Backward-compat: legacy callers (popup.js) may omit activeTabId.
        // Preserve global sessionIds[0] behavior + warn so we can find them.
        console.warn('[FSB] getStatus called without activeTabId -- legacy global-scope fallback. See .planning/quick/260608-wnz-codex-strategy-b-5-item-architectural-fi/');
        _scopedFirst = _allSessionIds.length > 0 ? activeSessions.get(_allSessionIds[0]) : null;
      }
      sendResponse({
        status: 'ready',
        activeSessions: _scopedSessionIds.length,
        sessionIds: _scopedSessionIds,
        currentSessionId: _scopedSessionIds[0] || null,
        currentTask: _scopedFirst?.task || null,
        currentStartTime: _scopedFirst?.startTime || null,
        currentIterationCount: _scopedFirst?.iterationCount || 0,
        currentMaxIterations: _scopedFirst?.maxIterations || 100,
        currentActionCount: _scopedFirst?.actionHistory?.length || 0
      });
      break;
    }

    case 'checkSessionAlive': {
      const sessionId = request.sessionId;
      const session = activeSessions.get(sessionId);
      const alive = !!(session && session.status === 'running');
      sendResponse({ alive: alive, status: session?.status || null });
      break;
    }

    case 'getRemoteControlState': {
      // Phase 213 D-16: replay-on-attach for Sync tab pill.
      // Returns the last cached ext:remote-control-state payload or a
      // disconnected-shaped default if no broadcast has happened yet this
      // SW lifetime. Sync tab JS uses this to populate the pill before the
      // first push arrives.
      const state = (_bgRemoteControlStateCache && typeof _bgRemoteControlStateCache === 'object')
        ? _bgRemoteControlStateCache
        : { enabled: false, attached: false, tabId: null, reason: 'unknown', ownership: 'none' };
      sendResponse({ success: true, state: state });
      break;
    }

    case 'remoteControlStateChanged': {
      // Phase 213 D-17 cache update path. ws/ws-client.js
      // _broadcastRemoteControlState fires this push after every WS emit.
      // background.js listens to its own broadcast so the cache survives
      // when the Sync tab is closed.
      if (request.state && typeof request.state === 'object') {
        _bgRemoteControlStateCache = request.state;
      }
      sendResponse({ success: true });
      break;
    }

    case 'testAPI':
      handleTestAPI(request, sender, sendResponse);
      return true; // Will respond asynchronously
      
    case 'TRACK_USAGE':
      return handleTrackUsage(request, sender, sendResponse);
      
    // Multi-tab management actions
    case 'openNewTab':
      handleOpenNewTab(request, sender, sendResponse);
      return true; // Will respond asynchronously
      
    case 'switchToTab':
      handleSwitchToTab(request, sender, sendResponse);
      return true; // Will respond asynchronously
      
    case 'closeTab':
      handleCloseTab(request, sender, sendResponse);
      return true; // Will respond asynchronously
      
    case 'listTabs':
      handleListTabs(request, sender, sendResponse);
      return true; // Will respond asynchronously
      
    case 'getCurrentTab':
      handleGetCurrentTab(request, sender, sendResponse);
      return true; // Will respond asynchronously
      
    case 'waitForTabLoad':
      handleWaitForTabLoad(request, sender, sendResponse);
      return true; // Will respond asynchronously
      
    case 'keyboardDebuggerAction':
      handleKeyboardDebuggerAction(request, sender, sendResponse);
      return true; // Will respond asynchronously

    case 'cdpInsertText':
      handleCDPInsertText(request, sender, sendResponse);
      return true; // Will respond asynchronously

    case 'monacoEditorInsert':
      handleMonacoEditorInsert(request, sender, sendResponse);
      return true; // Will respond asynchronously

    case 'contentScriptReady':
      // Content script signals it's ready and message listener is registered
      debugLog('[FSB Background] contentScriptReady received', { tab: sender.tab?.id, frame: sender.frameId });
      const tabId = sender.tab?.id;
      const frameId = sender.frameId;
      if (tabId) {
        // Only track main frame (frameId: 0) readiness for health checks
        // Iframe signals are logged but don't mark the tab as ready
        if (frameId === 0) {
          contentScriptReadyStatus.set(tabId, {
            ready: true,
            timestamp: Date.now(),
            url: request.url || sender.url,
            frameId: frameId
          });
          // Only clear badge if the dashboard relay is not connected;
          // otherwise the green indicator would vanish on every page navigation
          if (typeof fsbWebSocket === 'undefined' || !fsbWebSocket.connected) {
            chrome.action.setBadgeText({ text: '' });
          }
          debugLog('[FSB Background] Tab marked as ready:', tabId);
          automationLogger.logInit('content_script', 'ready', { tabId, frameId, readyState: request.readyState, retry: request.retry || false });
          replayMcpVisualSessionForTab(tabId, { now: Date.now(), source: 'contentScriptReady' }).catch((error) => {
            automationLogger.debug('MCP visual-session replay on contentScriptReady failed', {
              tabId,
              error: error?.message || String(error),
            });
          });
        } else {
          debugLog('[FSB Background] Iframe ready ignored, frame:', frameId);
          automationLogger.debug('Iframe content script ready (ignored)', { tabId, frameId });
        }
      }
      sendResponse({ success: true });
      break;

    case 'contentScriptConfirmation':
      // Content script sends confirmation ping to verify bidirectional communication
      const confirmTabId = sender.tab?.id;
      const confirmFrameId = sender.frameId;
      if (confirmTabId) {
        // Only track main frame confirmations
        if (confirmFrameId === 0) {
          const existingStatus = contentScriptReadyStatus.get(confirmTabId);
          if (existingStatus) {
            existingStatus.confirmed = true;
            existingStatus.confirmTimestamp = Date.now();
            contentScriptReadyStatus.set(confirmTabId, existingStatus);
          }
          automationLogger.logComm(null, 'receive', 'confirmation', true, { tabId: confirmTabId, frameId: confirmFrameId });
        }
        // Silently ignore iframe confirmations
      }
      sendResponse({ success: true });
      break;

    case 'solveCaptcha':
      handleSolveCaptcha(request, sender, sendResponse);
      return true; // Will respond asynchronously

    case 'spaNavigation':
      // Content script detected SPA navigation (Google, etc.)
      const spaTabId = sender.tab?.id;
      if (spaTabId) {
        const status = contentScriptReadyStatus.get(spaTabId);
        if (status) {
          status.url = request.url;
          status.lastSpaNav = Date.now();
        }
        automationLogger.logComm(null, 'receive', 'spa_navigation', true, {
          tabId: spaTabId,
          url: request.url,
          method: request.method
        });
      }
      sendResponse({ success: true });
      break;

    case 'contentScriptError':
      // Content script encountered an error during initialization
      automationLogger.logInit('content_script', 'failed', {
        tabId: sender.tab?.id,
        url: request.url,
        error: request.error,
        stack: request.stack,
        filename: request.filename,
        lineno: request.lineno,
        colno: request.colno
      });
      chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
      chrome.action.setBadgeText({ text: '!' });
      sendResponse({ success: true });
      break;

    case 'getSessionReplayData':
      // Get structured replay data for session visualization
      (async () => {
        try {
          const replay = await automationLogger.getReplayData(request.sessionId);
          sendResponse({ replay });
        } catch (error) {
          sendResponse({ replay: null, error: error.message });
        }
      })();
      return true; // Will respond asynchronously

    case 'exportSessionHumanReadable':
      // Export session as human-readable text report
      (async () => {
        try {
          const text = await automationLogger.exportHumanReadable(request.sessionId);
          sendResponse({ text });
        } catch (error) {
          sendResponse({ text: null, error: error.message });
        }
      })();
      return true; // Will respond asynchronously

    case 'getDOMSnapshots':
      // Get full DOM snapshots for a session
      (async () => {
        try {
          const snapshots = await automationLogger.getDOMSnapshots(request.sessionId);
          sendResponse({ snapshots });
        } catch (error) {
          sendResponse({ snapshots: [], error: error.message });
        }
      })();
      return true; // Will respond asynchronously

    case 'exportDOMSnapshots':
      // Export DOM snapshots in scrape-compatible format
      (async () => {
        try {
          const snapshots = await automationLogger.getDOMSnapshots(request.sessionId);
          const exported = automationLogger.exportDOMSnapshots(request.sessionId, snapshots);
          sendResponse({ exported });
        } catch (error) {
          sendResponse({ exported: null, error: error.message });
        }
      })();
      return true; // Will respond asynchronously

    // Credential management actions (Passwords Beta)
    case 'getCredential':
      (async () => {
        try {
          const cred = await secureConfig.getCredential(request.domain);
          sendResponse({ success: true, credential: cred });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'getFullCredential':
      (async () => {
        try {
          const cred = await secureConfig.getFullCredential(request.domain);
          sendResponse({ success: true, credential: cred });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'saveCredential':
      (async () => {
        try {
          const result = await secureConfig.saveCredential(request.domain, request.data);
          sendResponse(result);
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'getAllCredentials':
      (async () => {
        try {
          const credentials = await secureConfig.getAllCredentials();
          sendResponse({ success: true, credentials });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'deleteCredential':
      (async () => {
        try {
          const result = await secureConfig.deleteCredential(request.domain);
          sendResponse(result);
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'updateCredential':
      (async () => {
        try {
          const result = await secureConfig.updateCredential(request.domain, request.updates);
          sendResponse(result);
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    // Vault lifecycle actions (Phase 191)
    case 'createCredentialVault':
      (async () => {
        try {
          const result = await secureConfig.createCredentialVault(request.passphrase);
          sendResponse(result);
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'unlockCredentialVault':
      (async () => {
        try {
          const result = await secureConfig.unlockCredentialVault(request.passphrase);
          sendResponse(result);
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'lockCredentialVault':
      (async () => {
        try {
          const result = await secureConfig.lockCredentialVault();
          sendResponse(result);
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'getCredentialVaultStatus':
      (async () => {
        try {
          const result = await secureConfig.getCredentialVaultStatus();
          sendResponse(result);
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    // Payment method CRUD actions (Phase 192)
    case 'savePaymentMethod':
      (async () => {
        try {
          const result = await secureConfig.savePaymentMethod(request.data);
          sendResponse(result);
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'getAllPaymentMethods':
      (async () => {
        try {
          const methods = await secureConfig.getAllPaymentMethods();
          sendResponse({ success: true, paymentMethods: methods });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'getFullPaymentMethod':
      (async () => {
        try {
          const method = await secureConfig.getFullPaymentMethod(request.id);
          sendResponse({ success: true, paymentMethod: method });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'updatePaymentMethod':
      (async () => {
        try {
          const result = await secureConfig.updatePaymentMethod(request.id, request.updates);
          sendResponse(result);
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'deletePaymentMethod':
      (async () => {
        try {
          const result = await secureConfig.deletePaymentMethod(request.id);
          sendResponse(result);
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    // Payment access gate actions (Phase 192)
    case 'unlockPaymentMethods':
      (async () => {
        try {
          const result = await secureConfig.unlockPaymentMethods(request.passphrase);
          sendResponse(result);
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'lockPaymentMethods':
      (async () => {
        try {
          const result = await secureConfig.lockPaymentMethods();
          sendResponse(result);
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'getPaymentVaultStatus':
      (async () => {
        try {
          const result = await secureConfig.getPaymentVaultStatus();
          sendResponse(result);
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    // SM-22: Site map retrieval for AI context injection
    case 'getSiteMap':
      (async () => {
        try {
          const domain = request.domain;
          if (!domain) {
            sendResponse({ success: false, error: 'No domain provided' });
            return;
          }

          // Priority 1: Pre-bundled map
          const bundled = await loadBundledSiteMap(domain);
          if (bundled) {
            sendResponse({ success: true, siteMap: bundled, source: 'bundled' });
            return;
          }

          // Priority 2: Memory-stored map (refined preferred)
          if (typeof memoryManager !== 'undefined') {
            try {
              const allMemories = await memoryManager.getAll();
              const siteMapMemories = allMemories.filter(m =>
                m.typeData?.category === 'site_map' &&
                m.metadata?.domain === domain
              );
              if (siteMapMemories.length > 0) {
                const refined = siteMapMemories.find(m => m.typeData?.sitePattern?.refined);
                const best = refined || siteMapMemories[0];
                sendResponse({
                  success: true,
                  siteMap: best.typeData.sitePattern,
                  source: refined ? 'memory_refined' : 'memory_basic'
                });
                return;
              }
            } catch (e) {
              debugLog('getSiteMap memory lookup failed:', e.message);
            }
          }

          sendResponse({ success: false });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    // SM-17: Check if a site map exists for a domain
    case 'checkSiteMap':
      (async () => {
        try {
          const result = await hasSiteMapForDomain(request.domain);
          sendResponse(result);
        } catch (error) {
          sendResponse({ exists: false, source: null, error: error.message });
        }
      })();
      return true;

    // Site Explorer message handlers
    case 'startExplorer':
      (async () => {
        try {
          const result = await crawlerManager.start(request.url, {
            maxDepth: request.maxDepth || 3,
            maxPages: request.maxPages || 25,
            callerTabId: sender.tab?.id || null,
            autoSaveToMemory: request.autoSaveToMemory || false
          });
          sendResponse(result);
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'stopExplorer':
      (async () => {
        try {
          const result = await crawlerManager.stop(request.crawlerId || null);
          sendResponse(result);
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'getExplorerStatus':
      sendResponse(crawlerManager.getStatus(request.crawlerId || null));
      break;

    case 'getResearchList':
      (async () => {
        try {
          const stored = await chrome.storage.local.get(['fsbResearchIndex']);
          sendResponse({ success: true, list: stored.fsbResearchIndex || [] });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'getResearchData':
      (async () => {
        try {
          const stored = await chrome.storage.local.get(['fsbResearchData']);
          const data = (stored.fsbResearchData || {})[request.researchId];
          if (data) {
            sendResponse({ success: true, data });
          } else {
            sendResponse({ success: false, error: 'Research not found' });
          }
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'deleteResearch':
      (async () => {
        try {
          const stored = await chrome.storage.local.get(['fsbResearchData', 'fsbResearchIndex']);
          const researchData = stored.fsbResearchData || {};
          const researchIndex = stored.fsbResearchIndex || [];
          delete researchData[request.researchId];
          const updatedIndex = researchIndex.filter(r => r.id !== request.researchId);
          await chrome.storage.local.set({
            fsbResearchData: researchData,
            fsbResearchIndex: updatedIndex
          });
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
//     // --- Background Agent Management ---
//     case 'createAgent':
//       (async () => {
//         try {
//           const agent = await agentManager.createAgent(request.params);
//           if (agent.enabled) {
//             await agentScheduler.scheduleAgent(agent);
//           }
//           sendResponse({ success: true, agent });
//         } catch (error) {
//           sendResponse({ success: false, error: error.message });
//         }
//       })();
//       return true;
//
//     case 'updateAgent':
//       (async () => {
//         try {
//           const agent = await agentManager.updateAgent(request.agentId, request.updates);
//           // Reschedule if schedule or enabled state changed
//           if (agent.enabled) {
//             await agentScheduler.scheduleAgent(agent);
//           } else {
//             await agentScheduler.clearAlarm(agent.agentId);
//           }
//           sendResponse({ success: true, agent });
//         } catch (error) {
//           sendResponse({ success: false, error: error.message });
//         }
//       })();
//       return true;
//
//     case 'deleteAgent':
//       (async () => {
//         try {
//           await agentScheduler.clearAlarm(request.agentId);
//           await agentExecutor.forceStop(request.agentId);
//           const deleted = await agentManager.deleteAgent(request.agentId);
//           sendResponse({ success: deleted });
//         } catch (error) {
//           sendResponse({ success: false, error: error.message });
//         }
//       })();
//       return true;
//
//     case 'listAgents':
//       (async () => {
//         try {
//           const agents = await agentManager.listAgents();
//           sendResponse({ success: true, agents });
//         } catch (error) {
//           sendResponse({ success: false, error: error.message });
//         }
//       })();
//       return true;
//
//     case 'toggleAgent':
//       (async () => {
//         try {
//           const agent = await agentManager.toggleAgent(request.agentId);
//           if (agent.enabled) {
//             await agentScheduler.scheduleAgent(agent);
//           } else {
//             await agentScheduler.clearAlarm(agent.agentId);
//           }
//           sendResponse({ success: true, agent });
//         } catch (error) {
//           sendResponse({ success: false, error: error.message });
//         }
//       })();
//       return true;
//
//     case 'runAgentNow':
//       (async () => {
//         try {
//           const agent = await agentManager.getAgent(request.agentId);
//           if (!agent) {
//             sendResponse({ success: false, error: 'Agent not found' });
//             return;
//           }
//           // Execute immediately in background
//           sendResponse({ success: true, message: 'Agent execution started' });
//           const result = await agentExecutor.execute(agent);
//           await agentManager.recordRun(agent.agentId, result);
//           chrome.runtime.sendMessage({
//             action: 'agentRunComplete',
//             agentId: agent.agentId,
//             result: { success: result.success, duration: result.duration, error: result.error }
//           }).catch((err) => {
//             console.warn('[FSB] agentRunComplete sendMessage delivery failed', { agentId: agent.agentId, error: err && err.message });
//           });
//         } catch (error) {
//           sendResponse({ success: false, error: error.message });
//         }
//       })();
//       return true;
//
//     case 'getAgentStats':
//       (async () => {
//         try {
//           const stats = await agentManager.getStats();
//           sendResponse({ success: true, stats });
//         } catch (error) {
//           sendResponse({ success: false, error: error.message });
//         }
//       })();
//       return true;
//
//     case 'getAgentRunHistory':
//       (async () => {
//         try {
//           const history = await agentManager.getRunHistory(request.agentId, request.limit || 10);
//           sendResponse({ success: true, history });
//         } catch (error) {
//           sendResponse({ success: false, error: error.message });
//         }
//       })();
//       return true;
//
//     case 'clearAgentScript':
//       (async () => {
//         try {
//           await agentManager.clearRecordedScript(request.agentId);
//           sendResponse({ success: true });
//         } catch (error) {
//           sendResponse({ success: false, error: error.message });
//         }
//       })();
//       return true;
//
//     case 'getAgentReplayInfo':
//       (async () => {
//         try {
//           const agent = await agentManager.getAgent(request.agentId);
//           if (!agent) {
//             sendResponse({ success: false, error: 'Agent not found' });
//             return;
//           }
//           sendResponse({
//             success: true,
//             replayEnabled: agent.replayEnabled !== false,
//             hasScript: !!(agent.recordedScript && agent.recordedScript.steps && agent.recordedScript.steps.length > 0),
//             scriptSteps: agent.recordedScript?.totalSteps || 0,
//             recordedAt: agent.recordedScript?.recordedAt || null,
//             replayStats: agent.replayStats || { totalReplays: 0, totalAISaves: 0, estimatedCostSaved: 0 }
//           });
//         } catch (error) {
//           sendResponse({ success: false, error: error.message });
//         }
//       })();
//       return true;
//
//     case 'toggleAgentReplay':
//       (async () => {
//         try {
//           const agent = await agentManager.getAgent(request.agentId);
//           if (!agent) {
//             sendResponse({ success: false, error: 'Agent not found' });
//             return;
//           }
//           const newValue = !(agent.replayEnabled !== false);
//           await agentManager.updateAgent(request.agentId, { replayEnabled: newValue });
//           sendResponse({ success: true, replayEnabled: newValue });
//         } catch (error) {
//           sendResponse({ success: false, error: error.message });
//         }
//       })();
//       return true;

    case 'replaySession':
      handleReplaySession(request, sender, sendResponse);
      return true; // Will respond asynchronously

    case 'cdpMouseClick':
      handleCDPMouseClick(request, sender, sendResponse);
      return true; // Will respond asynchronously

    case 'cdpMouseClickAndHold':
      handleCDPMouseClickAndHold(request, sender, sendResponse);
      return true; // Will respond asynchronously

    case 'cdpMouseDrag':
      handleCDPMouseDrag(request, sender, sendResponse);
      return true; // Will respond asynchronously

    case 'cdpMouseDragVariableSpeed':
      handleCDPMouseDragVariableSpeed(request, sender, sendResponse);
      return true; // Will respond asynchronously

    case 'cdpMouseWheel':
      handleCDPMouseWheel(request, sender, sendResponse);
      return true; // Will respond asynchronously

    case 'automationComplete': {
      // Forward task completion to dashboard via WebSocket (per D-03, D-04)
      if (typeof fsbWebSocket !== 'undefined' && fsbWebSocket && fsbWebSocket.connected) {
        var completedSessionId = request.sessionId;
        var completedSession = activeSessions.get(completedSessionId);
        if (completedSession && completedSession._isDashboardTask) {
          var outcomeStr = request.outcome || 'success';
          var taskStatus = outcomeStr === 'error' ? 'failed' : outcomeStr;
          var completionSuccess = outcomeStr === 'success';
          var actionCount = Array.isArray(completedSession.actionHistory) ? completedSession.actionHistory.length : 0;
          var elapsedMs = Date.now() - (completedSession.startTime || Date.now());

          (async function() {
            var tabInfo = null;
            try {
              if (typeof completedSession.tabId === 'number') {
                tabInfo = await chrome.tabs.get(completedSession.tabId);
              }
            } catch (_e) { /* tab may be closed */ }

            var taskCompletePayload = {
              success: completionSuccess,
              summary: request.result || '',
              elapsed: elapsedMs,
              taskRunId: completedSession._dashboardTaskRunId || '',
              task: completedSession.task || request.task || '',
              taskStatus: taskStatus,
              progress: completionSuccess ? 100 : (calculateProgress(completedSession).progressPercent || 0),
              phase: 'complete',
              action: '',
              lastAction: completedSession._lastActionSummary || '',
              actionCount: actionCount,
              totalCost: completedSession.totalCost || (completedSession.agentState ? completedSession.agentState.totalCost : 0) || 0,
              finalUrl: tabInfo ? tabInfo.url : (completedSession.lastUrl || ''),
              pageTitle: tabInfo ? tabInfo.title : '',
              taskSource: 'live',
              updatedAt: Date.now(),
              stopped: !!request.stopped,
              error: request.error || null,
              blocker: request.blocker || null,
              nextStep: request.nextStep || null
            };
            fsbWebSocket.send('ext:task-complete', taskCompletePayload);

            _lastDashboardTaskResult = taskCompletePayload;
            _lastDashboardTaskResultTime = Date.now();
          })();
        }
      }
      break;
    }

    // ==========================================
    // DOM Stream forwarding (content -> dashboard via WebSocket)
    // ==========================================

    case 'triggerValueChanged':
    case 'triggerValueReport':
      (async () => {
        try {
          const result = await fsbTriggerHandleValueReport(request, sender);
          sendResponse(result);
        } catch (error) {
          sendResponse({ ok: false, error: error && error.message ? error.message : String(error) });
        }
      })();
      return true;

    case 'domStreamSnapshot':
      if (typeof fsbWebSocket !== 'undefined' && fsbWebSocket && fsbWebSocket.connected) {
        fsbWebSocket.send('ext:dom-snapshot', request.snapshot || {});
      }
      sendResponse({ success: true });
      break;

    case 'domStreamMutations':
      // Phase 211-02 STREAM-02: cache the last-known staleFlushCount from
      // the content script so ws/ws-client.js _emitStreamState can include
      // it in the ext:stream-state payload. Additive only -- the
      // ext:dom-mutations payload shape MUST NOT change (D-14).
      if (typeof request.staleFlushCount === 'number') {
        _lastDomStreamStaleFlushCount = request.staleFlushCount;
      }
      // Phase 211-02 STREAM-01: ensure the dom-stream watchdog alarm is armed
      // whenever streaming activity is observed. chrome.alarms.create is
      // idempotent (recreating the same name replaces the schedule), so it is
      // safe to call on every dispatch. Pattern mirrors ws/mcp-bridge-client.js:218.
      try {
        var alarmsApi = (typeof chrome !== 'undefined') ? chrome.alarms : null;
        if (alarmsApi && typeof alarmsApi.create === 'function') {
          var armResult = alarmsApi.create('fsb-domstream-watchdog', { periodInMinutes: 1 });
          if (armResult && typeof armResult.catch === 'function') {
            armResult.catch(function() { /* best-effort; in-memory watchdog still runs in content script */ });
          }
        }
      } catch (e) { /* best-effort */ }
      if (typeof fsbWebSocket !== 'undefined' && fsbWebSocket && fsbWebSocket.connected) {
        fsbWebSocket.send('ext:dom-mutations', {
          mutations: request.mutations || [],
          streamSessionId: request.streamSessionId || '',
          snapshotId: request.snapshotId || 0
        });
      }
      sendResponse({ success: true });
      break;

    case 'domStreamScroll':
      if (typeof fsbWebSocket !== 'undefined' && fsbWebSocket && fsbWebSocket.connected) {
        fsbWebSocket.send('ext:dom-scroll', {
          scrollX: request.scrollX || 0,
          scrollY: request.scrollY || 0,
          streamSessionId: request.streamSessionId || '',
          snapshotId: request.snapshotId || 0
        });
      }
      sendResponse({ success: true });
      break;

    case 'domStreamOverlay':
      if (typeof fsbWebSocket !== 'undefined' && fsbWebSocket && fsbWebSocket.connected) {
        fsbWebSocket.send('ext:dom-overlay', {
          glow: request.glow || null,
          progress: request.progress || null,
          streamSessionId: request.streamSessionId || '',
          snapshotId: request.snapshotId || 0
        });
      }
      sendResponse({ success: true });
      break;

    case 'domStreamDialog':
      if (typeof fsbWebSocket !== 'undefined' && fsbWebSocket && fsbWebSocket.connected) {
        fsbWebSocket.send('ext:dom-dialog', {
          dialog: request.dialog || {}
        });
      }
      sendResponse({ success: true });
      break;

    case 'domStreamReady':
      if (typeof fsbWebSocket !== 'undefined' && fsbWebSocket && fsbWebSocket.connected) {
        fsbWebSocket.send('ext:dom-ready', { tabId: sender.tab ? sender.tab.id : null });
      }
      // Phase 276 STREAM-DEFENSIVE-04 (hypothesis #4 pending-intent re-arm):
      // when the content-script's dom-stream module finishes loading and pings
      // ready, re-arm any dash:dom-stream-start payload that was parked in
      // ws-client.js _pendingStreamStart because pingDomStream had not yet
      // responded within the 5s probe budget. The function is a no-op if no
      // intent is parked. Defensive only -- the readiness ping should normally
      // succeed on the first poll, but this covers the edge case where a slow
      // CWS-flagged page extends past 5s before the dom-stream module loads.
      try {
        if (typeof _onDomStreamReady === 'function') {
          _onDomStreamReady(sender.tab ? sender.tab.id : null);
        }
      } catch (e) {
        console.warn('[FSB DOM] _onDomStreamReady re-arm failed (non-blocking):', e && e.message);
      }
      sendResponse({ success: true });
      break;

    case 'lattice-test-connection': {
      // UAT-08 prep: SW-bounce for options.js Test Connection.
      // executeViaBridge is SW-only (lattice-provider-bridge.js global);
      // control_panel.html does not script-load that file.
      if (typeof executeViaBridge !== 'function') {
        sendResponse({ ok: false, error: 'executeViaBridge unavailable in SW global' });
        return true;
      }
      (async function () {
        try {
          await executeViaBridge(request.provider, request.config, { __testConnection: true }, { mode: 'test-connection' });
          sendResponse({ ok: true });
        } catch (err) {
          sendResponse({ ok: false, error: (err && err.message) ? err.message : 'Unknown bridge error' });
        }
      })();
      return true;
    }

    default:
      sendResponse({ error: 'Unknown action' });
  }
});

/**
 * Handles the start of a new automation session
 * @param {Object} request - The automation start request
 * @param {string} request.task - The task description in natural language
 * @param {number} request.tabId - The ID of the tab to automate
 * @param {Object} sender - The message sender information
 * @param {Function} sendResponse - Function to send response back to sender
 * @returns {Promise<void>}
 */

// ==========================================
// 2Captcha CAPTCHA Solver Relay
// ==========================================

/**
 * Known 2Captcha error codes mapped to user-friendly messages
 */
const TWOCAPTCHA_ERRORS = {
  'ERROR_WRONG_USER_KEY': 'Invalid 2Captcha API key. Check your key in FSB settings.',
  'ERROR_KEY_DOES_NOT_EXIST': 'Invalid 2Captcha API key. Check your key in FSB settings.',
  'ERROR_ZERO_BALANCE': '2Captcha account has no balance. Please add funds at 2captcha.com.',
  'ERROR_NO_SLOT_AVAILABLE': '2Captcha is busy. Please try again in a moment.',
  'ERROR_CAPTCHA_UNSOLVABLE': 'CAPTCHA could not be solved. It may be too distorted.',
  'ERROR_WRONG_CAPTCHA_ID': 'Internal error: invalid CAPTCHA task ID.',
  'ERROR_BAD_DUPLICATES': 'CAPTCHA solve failed due to inconsistent results.',
  'ERROR_PAGEURL': 'Invalid page URL provided for CAPTCHA solving.',
  'ERROR_PROXY': 'Proxy error during CAPTCHA solving.'
};

/**
 * Handle CAPTCHA solving via 2Captcha API
 * Content scripts cannot make cross-origin requests, so this relays through the background
 */
async function handleSolveCaptcha(request, sender, sendResponse) {
  const { captchaType, sitekey, pageUrl, apiKey } = request;

  try {
    // Validate inputs
    if (!apiKey) {
      sendResponse({ success: false, error: 'No 2Captcha API key configured. Add it in FSB settings.' });
      return;
    }
    if (!sitekey) {
      sendResponse({ success: false, error: 'Could not extract sitekey from the page.' });
      return;
    }
    if (!pageUrl) {
      sendResponse({ success: false, error: 'Page URL is required for CAPTCHA solving.' });
      return;
    }

    // Determine method based on CAPTCHA type
    let method;
    switch (captchaType) {
      case 'recaptcha':
        method = 'userrecaptcha';
        break;
      case 'hcaptcha':
        method = 'hcaptcha';
        break;
      case 'turnstile':
        method = 'turnstile';
        break;
      default:
        sendResponse({ success: false, error: `Unsupported CAPTCHA type: ${captchaType}` });
        return;
    }

    console.log(`[FSB] Submitting ${captchaType} CAPTCHA to 2Captcha...`);

    // Step 1: Submit CAPTCHA to 2Captcha (POST to keep API key out of URL/logs)
    const submitParams = new URLSearchParams({
      key: apiKey,
      method: method,
      googlekey: sitekey,
      pageurl: pageUrl,
      json: '1'
    });

    const submitResponse = await fetch('https://2captcha.com/in.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: submitParams.toString()
    });
    const submitData = await submitResponse.json();

    if (submitData.status !== 1) {
      const errorMsg = TWOCAPTCHA_ERRORS[submitData.request] || `2Captcha error: ${submitData.request}`;
      console.error('[FSB] 2Captcha submit failed:', submitData.request);
      sendResponse({ success: false, error: errorMsg });
      return;
    }

    const taskId = submitData.request;
    console.log(`[FSB] 2Captcha task submitted: ${taskId}. Polling for result...`);

    // Step 2: Poll for result (every 5s, max 30 attempts = 150s)
    const maxAttempts = 30;
    const pollInterval = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      const resultParams = new URLSearchParams({
        key: apiKey,
        action: 'get',
        id: taskId,
        json: '1'
      });

      const resultResponse = await fetch('https://2captcha.com/res.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: resultParams.toString()
      });
      const resultData = await resultResponse.json();

      if (resultData.status === 1) {
        console.log(`[FSB] CAPTCHA solved successfully after ${(attempt + 1) * 5}s`);
        sendResponse({ success: true, token: resultData.request });
        return;
      }

      if (resultData.request !== 'CAPCHA_NOT_READY') {
        const errorMsg = TWOCAPTCHA_ERRORS[resultData.request] || `2Captcha error: ${resultData.request}`;
        console.error('[FSB] 2Captcha solve failed:', resultData.request);
        sendResponse({ success: false, error: errorMsg });
        return;
      }

      // CAPCHA_NOT_READY - continue polling
      debugLog(`2Captcha polling attempt ${attempt + 1}/${maxAttempts}...`);
    }

    // Timeout
    sendResponse({ success: false, error: 'CAPTCHA solve timed out after 150 seconds. The CAPTCHA may be too complex.' });

  } catch (error) {
    console.error('[FSB] CAPTCHA solve error:', error);
    sendResponse({ success: false, error: `CAPTCHA solve failed: ${error.message}` });
  }
}

async function handleStartAutomation(request, sender, sendResponse) {
  const { task, tabId, conversationId, source } = request;

  try {
    // Get the target tab ID (may be updated by smart tab management below)
    let targetTabId = tabId || sender.tab?.id;

    // QT-wnz Codex-1 -- the sidepanel reopen rekeys the document, which
    // loses the post-send callback that records currentSessionId in this
    // tab's _tabRunningMap. When the start request originated from inside
    // an already-open sidepanel context (sender.url ends in
    // 'ui/sidepanel.html'), skip the reopen. sender.tab may be undefined
    // for sidepanel senders; sender.url is the durable discriminator per
    // Chrome MV3 docs. Non-sidepanel callers (popup.js etc.) still hit
    // the setOptions + open path below to bind the panel for first-open.
    var _senderIsSidepanel = sender && typeof sender.url === 'string' && sender.url.endsWith('ui/sidepanel.html');

    // Phase 12 FINT-24 (Plan 12-04) -- per-tab sidepanel auto-open binding.
    // The setOptions + open awaits MUST be the FIRST awaits in this handler
    // so the user-gesture context (originating from the sendBtn click in
    // sidepanel.js -> chrome.runtime.sendMessage round-trip) is preserved
    // through to the panel-open call per Chrome MV3 user-gesture contract
    // (12-RESEARCH Section 7.1 + Pitfall 2 -- gesture decays through long
    // await chains; calling these two awaits BEFORE any other await
    // prevents the decay). Best-effort try/catch per CONTEXT D-13:
    // sidePanel API failure does NOT abort automation. Graceful
    // degradation on Chrome <114 (the API is undefined; rare).
    if (targetTabId && typeof chrome.sidePanel !== 'undefined' && !_senderIsSidepanel) {
      try {
        await chrome.sidePanel.setOptions({
          tabId: targetTabId,
          enabled: true,
          path: 'ui/sidepanel.html'
        });
        await chrome.sidePanel.open({ tabId: targetTabId });
      } catch (sidePanelErr) {
        console.warn('[FSB] Phase 12 FINT-24 sidePanel auto-open failed', {
          tabId: targetTabId,
          error: sidePanelErr && sidePanelErr.message
        });
      }
    }

    // Check for existing conversation session for follow-up reuse
    if (conversationId && conversationSessions.has(conversationId)) {
      const convEntry = conversationSessions.get(conversationId);
      const existingSession = activeSessions.get(convEntry.sessionId);
      if (existingSession && existingSession.status === 'idle') {
        // Reactivate the existing session
        reactivateSession(existingSession, task);
        const sessionId = convEntry.sessionId;
        convEntry.lastActiveTime = Date.now();

        // Inject follow-up context into AI
        const ai = sessionAIInstances.get(sessionId);
        if (ai && typeof ai.injectFollowUpContext === 'function') {
          ai.injectFollowUpContext(task);
        }

        // Log the follow-up command for session tracking
        automationLogger.logFollowUpCommand(sessionId, task, existingSession.commandCount);

        automationLogger.info('Reactivating conversation session', {
          sessionId, conversationId, commandCount: existingSession.commandCount
        });

        // Persist updated session
        persistSession(sessionId, existingSession);

        sendResponse({
          success: true,
          sessionId,
          message: 'Continuing conversation session',
          continued: true
        });

        startKeepAlive();

        // Reset DOM state for fresh analysis
        try {
          await chrome.tabs.sendMessage(existingSession.tabId, { action: 'resetDOMState', sessionId });
        } catch (e) {
          automationLogger.debug('Could not reset DOM state for follow-up', { sessionId, error: e.message });
        }

        const reactivationHooks = createSessionHooks(sessionId);
        runAgentLoop(sessionId, {
          activeSessions,
          persistSession,
          sendSessionStatus,
          broadcastDashboardProgress: typeof broadcastDashboardProgress === 'function' ? broadcastDashboardProgress : function() {},
          endSessionOverlays,
          cleanupSession,
          startKeepAlive,
          executeCDPToolDirect: executeCDPToolDirect,
          handleDataTool: null,
          resolveAuthWall: typeof resolveAuthWall === 'function' ? resolveAuthWall : null,
          hooks: reactivationHooks,
          emitter: null
        });
        return;
      }
    }

    // Get tab information to check URL
    let tabInfo;
    try {
      tabInfo = await chrome.tabs.get(targetTabId);
    } catch (error) {
      throw new Error(`Cannot access tab ${targetTabId}. Tab may have been closed or is not accessible.`);
    }

    // Track smart navigation for user feedback
    let navigationMessage = '';
    let navigationPerformed = false;
    const originalUrl = tabInfo.url;

    // ==========================================
    // SMART TAB MANAGEMENT
    // ==========================================
    // For restricted URLs (newtab, about:blank): must navigate somewhere
    // For non-restricted URLs: check if current tab is relevant, preserve user content
    if (isRestrictedURL(tabInfo.url)) {
      if (shouldUseSmartNavigation(tabInfo.url, task)) {
        const targetUrl = analyzeTaskAndGetTargetUrl(getFirstTaskSegment(task));
        const decision = await decideTabAction(targetTabId, tabInfo.url, targetUrl, task);
        automationLogger.logNavigation(null, 'smart', tabInfo.url, targetUrl, { task: task.substring(0, 100), decision: decision.action, reason: decision.reason });

        if (decision.action === 'switch') {
          // Switch to an already-open matching tab
          try {
            await chrome.tabs.update(decision.tabId, { active: true });
            targetTabId = decision.tabId;
            navigationMessage = `Switched to existing ${new URL(targetUrl).hostname} tab.`;
          } catch (switchErr) {
            // Tab may have been closed between discovery and switch - fall back to navigate
            automationLogger.debug('Tab switch failed, falling back to navigate', { error: switchErr.message });
            // Phase 243 plan 02 (BG-04): stamp lastAgentNavigationAt BEFORE
            // the chrome.tabs.update so the webNavigation.onCommitted
            // listener suppresses its agent-tab-user-navigation emission for
            // the resulting auto_bookmark / link transition (Pitfall 2 / 500ms).
            try { globalThis.fsbAgentRegistryInstance && globalThis.fsbAgentRegistryInstance.stampAgentNavigation(targetTabId); } catch (_e) {}
            await chrome.tabs.update(targetTabId, { url: targetUrl });
            navigationMessage = `Navigated from ${getPageTypeDescription(originalUrl)} to ${new URL(targetUrl).hostname}.`;
          }
        } else {
          // Navigate current (restricted) tab to target
          // Phase 243 plan 02 (BG-04): stamp before programmatic navigation
          // so the webNavigation listener suppresses the agent-driven commit.
          try { globalThis.fsbAgentRegistryInstance && globalThis.fsbAgentRegistryInstance.stampAgentNavigation(targetTabId); } catch (_e) {}
          await chrome.tabs.update(targetTabId, { url: targetUrl });
          navigationMessage = `Navigated from ${getPageTypeDescription(originalUrl)} to ${new URL(targetUrl).hostname}.`;
        }

        // Wait for tab to finish loading
        await new Promise((resolve) => {
          const navListener = (updatedTabId, changeInfo) => {
            if (updatedTabId === targetTabId && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(navListener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(navListener);
          setTimeout(() => { chrome.tabs.onUpdated.removeListener(navListener); resolve(); }, 10000);
        });

        // Refresh tabInfo after action
        try {
          tabInfo = await chrome.tabs.get(targetTabId);
        } catch (error) {
          throw new Error(`Tab became inaccessible after smart navigation to ${targetUrl}`);
        }
        navigationPerformed = true;
      } else {
        // Non-navigable restricted pages (settings, extensions, etc.)
        const chromeError = new Error(`Chrome security restrictions prevent extensions from accessing this type of page (${tabInfo.url}). Please navigate to a regular website to use automation.`);
        chromeError.isChromePage = true;
        throw chromeError;
      }
    } else {
      // Non-restricted URL: let the AI agent decide tab management.
      // The AI receives MULTI-TAB CONTEXT with all open tabs and has
      // listTabs/switchToTab/navigate tools to handle tab switching itself.
      // This avoids the hardcoded DOMAIN_KEYWORD_MAP which can't cover all sites.
      automationLogger.debug('Non-restricted URL, deferring tab decision to AI agent', {
        currentUrl: tabInfo.url,
        task: task.substring(0, 100)
      });
    }

    // Read settings from storage before creating session
    const storedSettings = await getStorageWithTimeout(
      ['maxIterations', 'animatedActionHighlights', 'domOptimization', 'maxDOMElements', 'prioritizeViewport'],
      3000,
      { maxIterations: 100, animatedActionHighlights: true, domOptimization: true, maxDOMElements: 2000, prioritizeViewport: true }
    );
    const userMaxIterations = parseInt(storedSettings.maxIterations) || 100;

    // Pre-populate allowedTabs with all non-restricted tabs in the current window
    // so the AI can switch to any tab the user already has open
    const allWindowTabs = await chrome.tabs.query({ currentWindow: true });
    const initialAllowedTabs = allWindowTabs
      .filter(t => t.id && !isRestrictedURL(t.url))
      .map(t => t.id);
    if (!initialAllowedTabs.includes(targetTabId)) {
      initialAllowedTabs.push(targetTabId);
    }

    // Create new session with enhanced tracking
    const sessionId = `session_${Date.now()}`;
    const sessionData = {
      task,
      tabId: targetTabId,
      originalTabId: targetTabId,  // Store original tab - automation is restricted to this tab
      status: 'running',
      startTime: Date.now(),
      maxIterations: userMaxIterations, // User-configured iteration limit
      actionHistory: [],        // Track all actions executed
      stateHistory: [],         // Track DOM state changes
      failedAttempts: {},       // Track failed actions by type
      failedActionDetails: {},  // Track detailed failures by action signature
      lastDOMHash: null,        // Hash of last DOM state to detect changes (backward compat)
      lastDOMSignals: null,     // Multi-channel DOM signals for fine-grained change detection
      stuckCounter: 0,          // Counter for detecting stuck state
      consecutiveNoProgressCount: 0, // Counter for iterations with no meaningful progress (doesn't reset on URL change)
      iterationCount: 0,        // Total iterations
      urlHistory: [],           // Track URL changes
      lastUrl: null,            // Last known URL
      actionSequences: [],      // Track sequences of actions to detect patterns
      sequenceRepeatCount: {},  // Count how many times each sequence repeats
      allowedTabs: initialAllowedTabs, // All non-restricted tabs in the current window
      tabHistory: [],             // Track tab switches for debugging
      navigationMessage,        // Store navigation message for UI
      animatedActionHighlights: storedSettings.animatedActionHighlights ?? true,
      // Session continuity fields
      conversationId: conversationId || null,
      commandCount: 1,
      commands: [task],
      // PERF: Cache DOM settings at session start to avoid repeated storage reads
      domSettings: {
        domOptimization: storedSettings.domOptimization !== false,
        maxDOMElements: storedSettings.maxDOMElements || 2000,
        prioritizeViewport: storedSettings.prioritizeViewport !== false
      },
      // Cost tracking fields
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0
    };

    activeSessions.set(sessionId, sessionData);

    // Tag dashboard-originated sessions for progress broadcasting and correlation
    if (source === 'dashboard') {
      sessionData._isDashboardTask = true;
      sessionData._dashboardTaskRunId = 'run_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    }

    // Multi-site orchestration: detect multi-company career task
    if (typeof extractCompaniesFromTask === 'function') {
      const companies = extractCompaniesFromTask(sessionData.task);
      if (companies && companies.length >= 2) {
        // Initialize multi-site orchestration state
        sessionData.multiSite = {
          originalTask: sessionData.task,
          companyList: companies,
          currentIndex: 0,
          deferredCompanies: [],  // Auth-walled companies to retry last
          failures: [],           // {company, reason, error} for final summary
          searchQuery: extractSearchQuery(sessionData.task),
          startedAt: Date.now()
        };

        // Check accumulator relevance and clear if different search
        await initMultiSiteAccumulator(sessionData);

        // Rewrite task to single-company for first iteration
        sessionData.task = buildSingleCompanyTask(sessionData.multiSite.originalTask, companies[0]);
        sessionData.taskSummary = `Job search: 1/${companies.length} companies`;
        // Cap iterations per company for multi-site sessions
        sessionData.maxIterations = Math.min(sessionData.maxIterations || 100, 15);

        automationLogger.info('Multi-site orchestration initialized', {
          sessionId,
          companies: companies,
          searchQuery: sessionData.multiSite.searchQuery,
          firstCompany: companies[0],
          rewrittenTask: sessionData.task
        });
      }
    }

    // Persist session to storage so stop button works after service worker restart
    persistSession(sessionId, sessionData);

    // Register in conversation sessions for follow-up reuse
    if (conversationId) {
      conversationSessions.set(conversationId, { sessionId, lastActiveTime: Date.now() });
      enforceMapLimit(conversationSessions, MAX_CONVERSATION_SESSIONS);
      persistConversationSessions();
    }

    automationLogger.logSessionStart(sessionId, task, sessionData.tabId);
    initializeSessionMetrics(sessionId);
    automationLogger.info('Created new session', { sessionId, tabId: sessionData.tabId, activeSessions: activeSessions.size, conversationId: conversationId || null });

    // Content script injection is now handled by the automation loop
    // to prevent double injection and race conditions

    // Phase 240 D-08 (4th site): bindTab before success return.
    // Source-agnostic per Open Q3: fires on EVERY handleStartAutomation
    // success, whether from popup (legacy:popup), sidepanel (legacy:sidepanel),
    // MCP dispatch (real agent_<uuid>), or autopilot fallback
    // (legacy:autopilot). agentId is sourced from request.agentId; fallback
    // to legacy:autopilot when caller did not thread one (covers run_task
    // pre-Phase-238 callers and the agent-loop fallback).
    let resolvedAgentId = (request && typeof request.agentId === 'string') ? request.agentId : null;
    if (!resolvedAgentId && globalThis.fsbAgentRegistryInstance &&
        typeof globalThis.fsbAgentRegistryInstance.getOrRegisterLegacyAgent === 'function') {
      try {
        const fallback = await globalThis.fsbAgentRegistryInstance.getOrRegisterLegacyAgent('autopilot');
        if (fallback && !fallback.error) {
          resolvedAgentId = fallback.agentId || null;
        }
      } catch (_fallbackErr) {
        // Fallback failure is non-fatal: dispatch gate (Plan 02) will reject
        // tool calls, but the session itself starts so the popup/sidepanel
        // user is not blocked.
      }
    }
    let bindResult = null;
    if (resolvedAgentId && globalThis.fsbAgentRegistryInstance &&
        typeof globalThis.fsbAgentRegistryInstance.bindTab === 'function' &&
        Number.isFinite(targetTabId)) {
      try {
        bindResult = await globalThis.fsbAgentRegistryInstance.bindTab(resolvedAgentId, targetTabId);
      } catch (_bindErr) {
        // Best-effort: bind failure does not block the success response so
        // legacy single-agent flows remain functional during the v0.9.60
        // multi-agent transition.
      }
    }

    sendResponse({
      success: true,
      sessionId,
      message: navigationMessage || 'Automation started',
      navigationPerformed: navigationPerformed,
      agentId: resolvedAgentId || undefined,
      ownershipToken: (bindResult && bindResult.ownershipToken) || undefined
    });

    // EASY WIN #10: Start keep-alive when automation begins
    startKeepAlive();

    // Wait for content script to be ready before starting automation
    // This prevents race conditions where automation starts before port connection is established
    automationLogger.debug('Waiting for content script readiness', { sessionId, tabId: targetTabId });

    // Send status update to UI so user knows we're connecting
    chrome.runtime.sendMessage({
      action: 'statusUpdate',
      sessionId: sessionId,
      message: 'Connecting to page...'
    }).catch((err) => {
      console.warn('[FSB] statusUpdate sendMessage delivery failed', { sessionId, error: err && err.message });
    });

    const isReady = await waitForContentScriptReady(targetTabId, 5000);
    automationLogger.debug('Content script readiness check complete', { sessionId, tabId: targetTabId, isReady });

    // CRITICAL FIX: Check isReady and fail fast if content script is not available
    // Previously, isReady was captured but never checked, causing a 90-second death spiral
    // where the automation loop would start and waste time on health checks that inevitably fail
    if (!isReady) {
      // Force-inject content scripts before giving up
      automationLogger.debug('Content script not ready, force-injecting', { sessionId, tabId: targetTabId });
      try {
        await ensureContentScriptInjected(targetTabId, 3);
      } catch (injectErr) {
        automationLogger.warn('Force-injection failed', { sessionId, error: injectErr.message });
      }

      // Do one final health check after forced injection
      const finalHealthCheck = await checkContentScriptHealth(targetTabId);
      if (!finalHealthCheck) {
        automationLogger.warn('Content script not ready after waiting and force-injection, aborting session', {
          sessionId,
          tabId: targetTabId
        });

        // Clean up the session
        const session = activeSessions.get(sessionId);
        if (session) {
          session.status = 'failed';
          const duration = Date.now() - session.startTime;
          automationLogger.logSessionEnd(sessionId, 'failed', 0, duration);
          automationLogger.saveSession(sessionId, session);
      extractAndStoreMemories(sessionId, session).catch(() => {});
          cleanupSession(sessionId);
        }

        // Send actionable error to UI
        fsbBroadcastAutomationLifecycle({
          action: 'automationError',
          sessionId: sessionId,
          error: 'Could not connect to the page. Please refresh the page and try again. If the problem persists, reload the extension from chrome://extensions.',
          task
        }).catch((err) => {
          console.warn('[FSB] automationError sendMessage delivery failed', { sessionId, error: err && err.message });
        });

        return; // Exit early - do not start the automation loop
      }
    }

    // Send status update to UI
    chrome.runtime.sendMessage({
      action: 'statusUpdate',
      sessionId: sessionId,
      message: 'Connected. Analyzing page...'
    }).catch((err) => {
      console.warn('[FSB] statusUpdate sendMessage delivery failed', { sessionId, error: err && err.message });
    });

    // Send session status to content script for visual feedback
    sendSessionStatus(targetTabId, {
      phase: 'analyzing',
      taskName: sessionData.task, // Use potentially rewritten task (multi-site: single-company)
      iteration: 0,
      maxIterations: sessionData.maxIterations || userMaxIterations,
      animatedHighlights: sessionData.animatedActionHighlights,
      progressPercent: 0,
      estimatedTimeRemaining: null,
      taskSummary: sessionData.taskSummary || null
    });

    // Non-blocking task summarization (runs in parallel, does not delay start)
    config.getAll().then(settings => {
      summarizeTask(task, settings).then(summary => {
        const s = activeSessions.get(sessionId);
        if (s && summary) {
          s.taskSummary = summary;
        }
      });
    }).catch((err) => {
      if (typeof rateLimitedWarn === 'function') {
        rateLimitedWarn('BG', 'task-summarization', 'task summarization config fetch failed', (typeof redactForLog === 'function') ? redactForLog(err) : {});
      }
    });

    // Reset DOM state in content script to prevent stale state comparison between sessions
    try {
      await chrome.tabs.sendMessage(targetTabId, { action: 'resetDOMState', sessionId });
      automationLogger.logDOMOperation(sessionId, 'reset', {}, { tabId: targetTabId });
    } catch (e) {
      automationLogger.debug('Could not reset DOM state', { sessionId, error: e.message });
    }

    // Start the modular agent loop (Phase 181, D-01/D-02)
    const sessionHooks = createSessionHooks(sessionId);
    runAgentLoop(sessionId, {
      activeSessions,
      persistSession,
      sendSessionStatus,
      broadcastDashboardProgress: typeof broadcastDashboardProgress === 'function' ? broadcastDashboardProgress : function() {},
      endSessionOverlays,
      cleanupSession,
      startKeepAlive,
      executeCDPToolDirect: executeCDPToolDirect,
      handleDataTool: null,
      resolveAuthWall: typeof resolveAuthWall === 'function' ? resolveAuthWall : null,
      hooks: sessionHooks,
      emitter: null
    });

  } catch (error) {
    automationLogger.error('Error starting automation', { error: error.message, isChromePage: error.isChromePage || false });
    sendResponse({
      success: false,
      error: error.message,
      isChromePage: error.isChromePage || false
    });
  }
}


/**
 * Execute an automation task programmatically (used by background agents).
 * Creates a session, runs the automation loop, and returns a Promise with the result.
 * @param {number} tabId - Target tab ID (must already exist and be loaded)
 * @param {string} task - Task description for the AI
 * @param {Object} [options] - Execution options
 * @param {number} [options.maxIterations=15] - Max automation iterations
 * @param {boolean} [options.isBackgroundAgent=false] - If true, skip UI status messages
 * @param {string} [options.agentId] - Agent ID for tracking
 * @returns {Promise<Object>} { success, sessionId, result, error, duration, tokensUsed, costUsd, iterations }
 */
async function executeAutomationTask(tabId, task, options = {}) {
  const { maxIterations = 15, isBackgroundAgent = false, agentId = null } = options;

  return new Promise(async (resolve) => {
    try {
      const sessionId = `session_${Date.now()}`;
      const sessionData = {
        task,
        tabId: tabId,
        originalTabId: tabId,
        status: 'running',
        startTime: Date.now(),
        maxIterations: maxIterations,
        actionHistory: [],
        stateHistory: [],
        failedAttempts: {},
        failedActionDetails: {},
        lastDOMHash: null,
        stuckCounter: 0,
        consecutiveNoProgressCount: 0,
        iterationCount: 0,
        urlHistory: [],
        lastUrl: null,
        actionSequences: [],
        sequenceRepeatCount: {},
        isBackgroundAgent: isBackgroundAgent,
        agentId: agentId,
        animatedActionHighlights: false, // No highlights for background agents
        _completionCallback: resolve, // Store callback for when automation finishes
        // PERF: Cache DOM settings (use defaults for background agents)
        domSettings: {
          domOptimization: true,
          maxDOMElements: 2000,
          prioritizeViewport: true
        },
        // Cost tracking fields
        totalCost: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0
      };

      activeSessions.set(sessionId, sessionData);
      persistSession(sessionId, sessionData);

      automationLogger.logSessionStart(sessionId, task, tabId);
      initializeSessionMetrics(sessionId);

      startKeepAlive();

      // Reset DOM state
      try {
        await chrome.tabs.sendMessage(tabId, { action: 'resetDOMState', sessionId });
      } catch (e) {
        // Content script may not be ready yet, proceed anyway
      }

      // Intercept completion messages for this session
      const originalCleanup = cleanupSession;

      // Patch: listen for automationComplete for this session to capture result
      const completionListener = (message) => {
        if (message.action === 'automationComplete' && message.sessionId === sessionId) {
          chrome.runtime.onMessage.removeListener(completionListener);
          const session = activeSessions.get(sessionId) || sessionData;
          const duration = Date.now() - sessionData.startTime;
          const metrics = performanceMetrics.sessionStats.get(sessionId);
          resolve({
            success: !message.partial && !message.error,
            sessionId,
            result: message.result || null,
            error: message.error || (message.partial ? 'Task completed partially: ' + (message.reason || 'unknown') : null),
            duration,
            tokensUsed: metrics?.totalActions || 0,
            costUsd: 0,
            iterations: session.iterationCount || 0,
            actionHistory: session.actionHistory || []
          });
        }

        if (message.action === 'automationError' && message.sessionId === sessionId) {
          chrome.runtime.onMessage.removeListener(completionListener);
          const duration = Date.now() - sessionData.startTime;
          resolve({
            success: false,
            sessionId,
            result: null,
            error: message.error || 'Automation error',
            duration,
            tokensUsed: 0,
            costUsd: 0,
            iterations: sessionData.iterationCount || 0
          });
        }
      };
      chrome.runtime.onMessage.addListener(completionListener);

      // Safety timeout - resolve after maxIterations * 30s max
      const safetyTimeout = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(completionListener);
        const duration = Date.now() - sessionData.startTime;
        resolve({
          success: false,
          sessionId,
          result: null,
          error: 'Execution safety timeout reached',
          duration,
          tokensUsed: 0,
          costUsd: 0,
          iterations: sessionData.iterationCount || 0
        });
      }, Math.min(maxIterations * 30000, 4 * 60 * 1000));

      // Store timeout for cleanup
      sessionData._safetyTimeout = safetyTimeout;

      // Start the modular agent loop (Phase 181, D-01/D-02)
      const agentTaskHooks = createSessionHooks(sessionId);
      runAgentLoop(sessionId, {
        activeSessions,
        persistSession,
        sendSessionStatus,
        broadcastDashboardProgress: typeof broadcastDashboardProgress === 'function' ? broadcastDashboardProgress : function() {},
        endSessionOverlays,
        cleanupSession,
        startKeepAlive,
        executeCDPToolDirect: executeCDPToolDirect,
        handleDataTool: null,
        resolveAuthWall: typeof resolveAuthWall === 'function' ? resolveAuthWall : null,
        hooks: agentTaskHooks,
        emitter: null
      });

    } catch (error) {
      resolve({
        success: false,
        sessionId: null,
        result: null,
        error: error.message,
        duration: 0,
        tokensUsed: 0,
        costUsd: 0,
        iterations: 0
      });
    }
  });
}


// Handle automation stop
async function handleStopAutomation(request, sender, sendResponse) {
  const { sessionId } = request;

  automationLogger.info('Stop automation request received', { sessionId, activeSessions: Array.from(activeSessions.keys()) });

  // Check in-memory first
  let session = activeSessions.get(sessionId);

  // Fallback: Check storage if not in memory (service worker may have restarted)
  if (!session) {
    automationLogger.info('Session not in memory, checking storage...', { sessionId });
    try {
      const key = `session_${sessionId}`;
      const stored = await chrome.storage.session.get(key);
      if (stored[key] && stored[key].sessionId === sessionId) {
        // Restore to activeSessions so cleanup works properly
        session = {
          ...stored[key],
          isRestored: true,
          actionHistory: stored[key].actionHistory || []
        };
        activeSessions.set(sessionId, session);
        automationLogger.info('Session restored from storage for stop', { sessionId });
      }
    } catch (error) {
      automationLogger.warn('Failed to check storage for session', { sessionId, error: error.message });
    }
  }

  if (session) {
    automationLogger.debug('Found session to stop', { sessionId, status: session.status });

    session.status = 'stopped';

    // Log and save session before cleanup
    const duration = Date.now() - session.startTime;
    automationLogger.logSessionEnd(sessionId, 'stopped', session.actionHistory.length, duration);
    automationLogger.saveSession(sessionId, session);
      extractAndStoreMemories(sessionId, session).catch(() => {});

    // Tell content script to clean up visual overlays (covers previousTabId if set)
    await endSessionOverlays(session, 'stopped');

    finalizeSessionMetrics(sessionId, false); // Stopped, not completed
    await cleanupSession(sessionId); // Await to ensure full cleanup before responding

    automationLogger.info('Session stopped and removed', { sessionId });

    // Phase 239 plan 01 -- emit lifecycle event so any in-flight run_task MCP
    // call resolves immediately on user stop (CONTEXT.md D-08 cleanup path 5;
    // RESEARCH.md Open Question 4: dispatch BEFORE sendResponse so the bridge
    // client subscription receives the bus event before stop_task's response
    // travels back to the MCP server).
    try {
      fsbBroadcastAutomationLifecycle({
        action: 'automationComplete',
        sessionId: sessionId,
        // QT-uof-2 (BROADCAST-tabId-THREAD)
        tabId: (session && typeof session.tabId === 'number') ? session.tabId : null,
        outcome: 'stopped',
        reason: 'user_stopped',
        stopped: true,
        timestamp: Date.now()
      });
    } catch (busErr) {
      console.warn('[FSB] handleStopAutomation lifecycle dispatch failed', busErr && busErr.message);
      // never block sendResponse on bus failure
    }

    sendResponse({
      success: true,
      message: 'Automation stopped'
    });
  } else {
    automationLogger.warn('Session not found in memory or storage', { sessionId });

    // QT-uof-4 (C-FIX) -- tier-3 lookup: if the sessionId appears in
    // fsbSessionLogs, this session completed cleanly and was cleaned up
    // (likely between UI state and stop-click). Distinguish so the
    // sidepanel renders a friendly "Already completed" toast instead of
    // the misleading "Session not found" error. See
    // .planning/debug/cluster1-routing.md (Symptom C is a consequence of
    // D, but C-FIX is a cosmetic polish for the narrow race window).
    try {
      const stored = await chrome.storage.local.get(['fsbSessionLogs']);
      const sessionLogs = stored.fsbSessionLogs || {};
      if (sessionLogs[sessionId]) {
        automationLogger.info('Stop on already-completed session (race with natural completion)', { sessionId });
        sendResponse({
          success: false,
          alreadyEnded: true,
          error: 'Already completed'
        });
        return;
      }
    } catch (logsErr) {
      automationLogger.warn('fsbSessionLogs tier-3 lookup failed', { sessionId, error: logsErr.message });
      // fall through to default 'Session not found' response
    }

    sendResponse({
      success: false,
      error: 'Session not found'
    });
  }
}

// Handle API test
async function handleTestAPI(request, sender, sendResponse) {
  try {
    // Get settings for API test
    const settings = await config.getAll();
    
    // Check appropriate API key based on provider
    const provider = settings.modelProvider || 'xai';
    const providerApiKeyMap = {
      xai: { key: 'apiKey', name: 'xAI' },
      gemini: { key: 'geminiApiKey', name: 'Gemini' },
      openai: { key: 'openaiApiKey', name: 'OpenAI' },
      anthropic: { key: 'anthropicApiKey', name: 'Anthropic' }
    };
    const testProviderConfig = providerApiKeyMap[provider];
    if (testProviderConfig && !settings[testProviderConfig.key]) {
      sendResponse({
        success: false,
        error: `${testProviderConfig.name} API key not configured. Please set it in extension settings.`
      });
      return;
    }
    
    // Create AI integration instance and test connection
    const ai = new AIIntegration(settings);
    const testResult = await ai.testConnection();
    
    sendResponse({ 
      success: !testResult.connectionFailed && testResult.ok, 
      result: testResult 
    });
    
  } catch (error) {
    automationLogger.error('API test error', { error: error.message });
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Handle AI API calls
async function handleAICall(request, sender, sendResponse) {
  const { prompt, structuredDOM, apiKey } = request;
  
  try {
    // This is where we'll integrate with xAI Grok or OpenAI
    // For now, we'll simulate an AI response
    const aiResponse = await callAIAPI(prompt, structuredDOM, apiKey);
    
    sendResponse({ 
      success: true, 
      response: aiResponse 
    });
  } catch (error) {
    automationLogger.error('AI API error', { error: error.message });
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * EASY WIN #5: Smart delay calculation with context awareness
 * Calculates delays based on action types, recent failures, DOM changes, and network activity
 * @param {Object} currentAction - The current action being executed
 * @param {string} currentAction.tool - The tool/action type
 * @param {Object} currentAction.params - Action parameters
 * @param {Object} nextAction - The next action to be executed
 * @param {string} nextAction.tool - The next tool/action type
 * @param {Object} context - Execution context (failures, DOM changes, etc.)
 * @returns {number} Delay in milliseconds
 */
function calculateActionDelay(currentAction, nextAction, context = {}) {
  // Define action categories
  const fastActions = ['type', 'clearInput', 'selectText', 'focus', 'blur', 'pressEnter', 'keyPress'];
  const mediumActions = ['hover', 'moveMouse', 'getAttribute', 'getText'];
  const slowActions = ['click', 'rightClick', 'doubleClick', 'selectOption', 'toggleCheckbox'];
  const verySlowActions = ['navigate', 'refresh', 'goBack', 'goForward', 'solveCaptcha', 'waitForElement'];
  
  // Base delays in milliseconds
  const delays = {
    fastToFast: 300,      // Fast typing sequences
    fastToMedium: 500,    // Type then hover
    fastToSlow: 800,      // Type then click
    fastToVerySlow: 1500, // Type then navigate
    
    mediumToFast: 400,    // Hover then type
    mediumToMedium: 600,  // Hover then move
    mediumToSlow: 800,    // Hover then click
    mediumToVerySlow: 1500,
    
    slowToFast: 1000,     // Click then type (need DOM to settle)
    slowToMedium: 800,    // Click then hover
    slowToSlow: 1200,     // Click then click
    slowToVerySlow: 2000, // Click then navigate
    
    verySlowToAny: 3000   // Navigation actions need time
  };
  
  // Categorize actions
  function getActionCategory(action) {
    if (!action) return 'unknown';
    
    if (fastActions.includes(action.tool)) return 'fast';
    if (mediumActions.includes(action.tool)) return 'medium';
    if (slowActions.includes(action.tool)) return 'slow';
    if (verySlowActions.includes(action.tool)) return 'verySlow';
    return 'medium'; // Default
  }
  
  const currentCategory = getActionCategory(currentAction);
  const nextCategory = getActionCategory(nextAction);
  
  // Special cases for related actions
  if (currentAction.tool === 'type' && nextAction && nextAction.tool === 'type') {
    // Fast consecutive typing - check if they're in the same form
    const currentSelector = currentAction.params?.selector || '';
    const nextSelector = nextAction.params?.selector || '';
    
    // If typing in different fields of same form, use shorter delay
    if (currentSelector.includes('input') && nextSelector.includes('input')) {
      return 200; // Very fast for form filling
    }
    if (currentSelector.includes('textarea') && nextSelector.includes('textarea')) {
      return 300; // Fast for text areas
    }
  }
  
  // Click followed by type (common pattern like clicking input then typing)
  if (currentAction.tool === 'click' && nextAction && nextAction.tool === 'type') {
    return 600; // Moderate delay for click-to-type
  }
  
  // Type with pressEnter followed by anything needs more time
  if (currentAction.tool === 'type' && currentAction.params?.pressEnter) {
    return 1000; // Enter key usually triggers actions
  }
  
  // Use category-based delays
  const delayKey = `${currentCategory}To${nextCategory.charAt(0).toUpperCase() + nextCategory.slice(1)}`;

  let baseDelay;
  if (currentCategory === 'verySlow') {
    baseDelay = delays.verySlowToAny;
  } else {
    baseDelay = delays[delayKey] || delays.mediumToMedium;
  }

  // EASY WIN #5: Adjust delay based on execution context
  let adjustedDelay = baseDelay;

  // Increase delay if recent failures detected
  if (context.recentFailures && context.recentFailures > 2) {
    adjustedDelay *= 2; // Double delay when struggling
    automationLogger.logTiming(null, 'ACTION', 'delay_increase', adjustedDelay, { reason: 'recent_failures', failures: context.recentFailures });
  }

  // Increase delay if DOM is changing rapidly
  if (context.domChangeVelocity && context.domChangeVelocity > 10) {
    adjustedDelay *= 1.5; // 50% more time for unstable DOM
    automationLogger.logTiming(null, 'ACTION', 'delay_increase', adjustedDelay, { reason: 'rapid_dom_changes', velocity: context.domChangeVelocity });
  }

  // Increase delay if network activity detected
  if (context.networkActive) {
    adjustedDelay *= 1.5;
    automationLogger.logTiming(null, 'ACTION', 'delay_increase', adjustedDelay, { reason: 'network_active' });
  }

  // Decrease delay if consecutive successes (things going smoothly)
  if (context.consecutiveSuccesses && context.consecutiveSuccesses > 5) {
    adjustedDelay *= 0.7; // 30% faster when on a roll
  }

  // Clamp delay between 100ms minimum and 3000ms maximum
  adjustedDelay = Math.min(Math.max(adjustedDelay, 100), 3000);

  return Math.round(adjustedDelay);
}

/**
 * SPEED-01: Outcome-based delay strategies
 * Maps detected outcome types to appropriate wait strategies
 */
const OUTCOME_DELAYS = {
  navigation: { waitFor: 'pageLoad', maxWait: 5000 },
  network: { waitFor: 'networkQuiet', maxWait: 2000, quietTime: 200 },
  majorDOMChange: { waitFor: 'domStable', maxWait: 1000, stableTime: 300 },
  minorDOMChange: { waitFor: 'domStable', maxWait: 500, stableTime: 100 },
  elementStateChange: { waitFor: 'minimal', delayMs: 50 },
  noChange: { waitFor: 'none', delayMs: 0 }
};

/**
 * SPEED-01: Applies outcome-based delay instead of category-based delay
 * Waits appropriately based on what actually happened after an action
 * @param {number} tabId - Tab ID for communication with content script
 * @param {string} outcomeType - Type from detectActionOutcome (navigation, network, etc.)
 * @param {Object} options - Override options
 * @returns {Promise<Object>} Wait result { waited: true, strategy, waitTime }
 */
async function outcomeBasedDelay(tabId, outcomeType, options = {}) {
  const startTime = Date.now();
  const strategy = OUTCOME_DELAYS[outcomeType] || OUTCOME_DELAYS.noChange;

  try {
    switch (strategy.waitFor) {
      case 'pageLoad':
        // Use pageLoadWatcher for navigation outcomes
        const loadResult = await pageLoadWatcher.waitForPageReady(tabId, {
          maxWait: options.maxWait || strategy.maxWait,
          requireDOMStable: true,
          stableTime: 300
        });
        automationLogger.logTiming(null, 'WAIT', 'outcome_pageLoad', Date.now() - startTime, {
          outcomeType,
          success: loadResult.success
        });
        return {
          waited: true,
          strategy: outcomeType,
          waitTime: Date.now() - startTime,
          method: 'pageLoad',
          result: loadResult
        };

      case 'networkQuiet':
        // Wait for network to quiet down
        try {
          const networkResult = await sendMessageWithRetry(tabId, {
            action: 'executeAction',
            tool: 'waitForPageStability',
            params: {
              maxWait: options.maxWait || strategy.maxWait,
              stableTime: 100,
              networkQuietTime: options.quietTime || strategy.quietTime
            }
          });
          automationLogger.logTiming(null, 'WAIT', 'outcome_networkQuiet', Date.now() - startTime, {
            outcomeType,
            stable: networkResult?.result?.stable
          });
          return {
            waited: true,
            strategy: outcomeType,
            waitTime: Date.now() - startTime,
            method: 'networkQuiet',
            result: networkResult
          };
        } catch (err) {
          // Fallback to minimal delay if network wait fails
          await new Promise(r => setTimeout(r, 200));
          return {
            waited: true,
            strategy: outcomeType,
            waitTime: Date.now() - startTime,
            method: 'networkQuiet-fallback',
            error: err.message
          };
        }

      case 'domStable':
        // Wait for DOM to stabilize
        try {
          const domResult = await sendMessageWithRetry(tabId, {
            action: 'executeAction',
            tool: 'waitForDOMStable',
            params: {
              timeout: options.maxWait || strategy.maxWait,
              stableTime: options.stableTime || strategy.stableTime
            }
          });
          automationLogger.logTiming(null, 'WAIT', 'outcome_domStable', Date.now() - startTime, {
            outcomeType,
            stable: domResult?.result?.stable
          });
          return {
            waited: true,
            strategy: outcomeType,
            waitTime: Date.now() - startTime,
            method: 'domStable',
            result: domResult
          };
        } catch (err) {
          // Fallback to minimal delay if DOM wait fails
          await new Promise(r => setTimeout(r, 100));
          return {
            waited: true,
            strategy: outcomeType,
            waitTime: Date.now() - startTime,
            method: 'domStable-fallback',
            error: err.message
          };
        }

      case 'minimal':
        // Very short fixed delay for state changes
        await new Promise(r => setTimeout(r, strategy.delayMs));
        automationLogger.logTiming(null, 'WAIT', 'outcome_minimal', strategy.delayMs, { outcomeType });
        return {
          waited: true,
          strategy: outcomeType,
          waitTime: strategy.delayMs,
          method: 'minimal'
        };

      case 'none':
      default:
        // No delay needed
        automationLogger.logTiming(null, 'WAIT', 'outcome_none', 0, { outcomeType });
        return {
          waited: false,
          strategy: outcomeType,
          waitTime: 0,
          method: 'none'
        };
    }
  } catch (error) {
    automationLogger.warn('Outcome-based delay error, using fallback', {
      outcomeType,
      error: error.message
    });
    // Fallback: use a safe minimal delay
    await new Promise(r => setTimeout(r, 100));
    return {
      waited: true,
      strategy: outcomeType,
      waitTime: Date.now() - startTime,
      method: 'error-fallback',
      error: error.message
    };
  }
}

/**
 * SPEED-03: Deterministic action patterns that can be batched without AI roundtrips
 * These patterns represent predictable sequences where we know the outcome
 */
const DETERMINISTIC_PATTERNS = [
  {
    name: 'formFill',
    description: 'Multiple type actions to different form fields',
    detect: (actions) => {
      // All actions must be type operations
      if (!actions.every(a => a.tool === 'type')) return false;
      // Must target different selectors (filling different fields)
      const selectors = actions.map(a => a.params?.selector).filter(Boolean);
      return selectors.length === actions.length &&
             new Set(selectors).size === selectors.length;
    },
    optimize: true,
    minDelay: 50  // Minimal delay between batched typing actions
  },
  {
    name: 'clickType',
    description: 'Click input then type (focus + input pattern)',
    detect: (actions) => {
      // Click followed by type (clicking input then typing)
      return actions.length === 2 &&
             actions[0].tool === 'click' &&
             actions[1].tool === 'type';
    },
    optimize: true,
    minDelay: 100  // Small delay between click and type
  },
  {
    name: 'multiClick',
    description: 'Multiple clicks to different elements (checkbox selections)',
    detect: (actions) => {
      // All actions must be clicks
      if (!actions.every(a => a.tool === 'click')) return false;
      // Must target different selectors
      const selectors = actions.map(a => a.params?.selector).filter(Boolean);
      // Limit to 3 to avoid unexpected side effects
      return selectors.length === actions.length &&
             new Set(selectors).size === selectors.length &&
             actions.length <= 3;
    },
    optimize: true,
    minDelay: 100  // Between click actions
  }
];

/**
 * SPEED-03: Detect if an action sequence matches a deterministic pattern
 * @param {Array} actions - Array of actions to analyze
 * @returns {Object|null} Matching pattern or null
 */
function detectDeterministicPattern(actions) {
  if (!actions || actions.length < 1) return null;

  for (const pattern of DETERMINISTIC_PATTERNS) {
    if (pattern.detect(actions)) {
      automationLogger.debug('Deterministic pattern detected', {
        pattern: pattern.name,
        actionCount: actions.length,
        tools: actions.map(a => a.tool)
      });
      return pattern;
    }
  }

  return null;
}

/**
 * SPEED-03: Execute a batch of actions matching a deterministic pattern
 * Skips AI roundtrips between actions, using minimal inter-action delays
 *
 * @param {Array} actions - Actions to execute
 * @param {Object} session - Current automation session
 * @param {number} tabId - Tab ID for action execution
 * @returns {Promise<Object|null>} Batch result or null if pattern not matched
 */
async function executeDeterministicBatch(actions, session, tabId) {
  const pattern = detectDeterministicPattern(actions);

  // If no pattern matched, return null (caller should execute normally)
  if (!pattern || !pattern.optimize) {
    return null;
  }

  const batchStartTime = Date.now();
  const results = [];

  automationLogger.info('Executing deterministic batch', {
    sessionId: session?.sessionId,
    pattern: pattern.name,
    actionCount: actions.length
  });

  try {
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const actionStartTime = Date.now();

      // Execute the action
      const actionResult = await sendMessageWithRetry(tabId, {
        action: 'executeAction',
        tool: action.tool,
        params: action.params,
        visualContext: {
          taskName: session?.task?.substring(0, 50) || 'Automation',
          stepNumber: i + 1,
          totalSteps: actions.length,
          iterationCount: session?.iterationCount || 1,
          isBatchedAction: true,
          batchPattern: pattern.name,
          animatedHighlights: session?.animatedActionHighlights ?? true
        }
      });

      results.push({
        action,
        result: actionResult,
        duration: Date.now() - actionStartTime
      });

      // Track in session action history (slim result to reduce memory and prompt token usage)
      if (session) {
        session.actionHistory.push({
          timestamp: Date.now(),
          tool: action.tool,
          params: action.params,
          result: slimActionResult(actionResult),
          iteration: session.iterationCount,
          batched: true,
          batchPattern: pattern.name
        });
      }

      // Log action execution
      automationLogger.logTiming(
        session?.sessionId,
        'ACTION',
        `${action.tool}_batched`,
        Date.now() - actionStartTime,
        { success: actionResult?.success, batch: pattern.name }
      );

      // If action failed, break the batch (don't continue with remaining actions)
      if (!actionResult?.success) {
        automationLogger.warn('Batch action failed, breaking batch', {
          sessionId: session?.sessionId,
          pattern: pattern.name,
          actionIndex: i,
          tool: action.tool,
          error: actionResult?.error
        });
        break;
      }

      // Apply minimal delay between actions (except for last action)
      if (i < actions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, pattern.minDelay));
      }
    }

    const batchDuration = Date.now() - batchStartTime;
    const successCount = results.filter(r => r.result?.success).length;

    automationLogger.info('Deterministic batch complete', {
      sessionId: session?.sessionId,
      pattern: pattern.name,
      successCount,
      totalCount: actions.length,
      batchDuration,
      savedTime: `~${(actions.length - 1) * 1000}ms AI roundtrips avoided`
    });

    return {
      batched: true,
      pattern: pattern.name,
      results,
      count: actions.length,
      successCount,
      duration: batchDuration
    };
  } catch (error) {
    automationLogger.error('Deterministic batch execution error', {
      sessionId: session?.sessionId,
      pattern: pattern.name,
      error: error.message
    });

    // Return partial results if any completed
    return {
      batched: true,
      pattern: pattern.name,
      results,
      count: actions.length,
      successCount: results.filter(r => r.result?.success).length,
      duration: Date.now() - batchStartTime,
      error: error.message
    };
  }
}

// Helper function to create smart sequence signatures that group similar actions
function createSmartSequenceSignature(actions) {
  return actions.map(action => {
    // Normalize action signatures to group similar actions
    if (action.tool === 'type') {
      // Group typing actions by selector type, not exact text
      const selector = action.params?.selector || '';
      let selectorType = 'unknown';
      
      if (selector.includes('input')) selectorType = 'input';
      else if (selector.includes('textarea')) selectorType = 'textarea';
      else if (selector.includes('search')) selectorType = 'search';
      else if (selector.includes('email')) selectorType = 'email';
      else if (selector.includes('password')) selectorType = 'password';
      
      return `type:${selectorType}`;
    }
    
    if (action.tool === 'click') {
      // Group clicks by element type
      const selector = action.params?.selector || '';
      let elementType = 'unknown';
      
      if (selector.includes('button') || selector.includes('btn')) elementType = 'button';
      else if (selector.includes('link') || selector.includes('a[')) elementType = 'link';
      else if (selector.includes('submit')) elementType = 'submit';
      else if (selector.includes('form')) elementType = 'form';
      
      return `click:${elementType}`;
    }
    
    // For other actions, use a simplified signature
    return action.tool;
  }).join('->');
}

// Helper function to check if repetition is harmful
function checkHarmfulRepetition(actions, repeatCount, session) {
  // Don't flag as harmful if repeat count is low
  if (repeatCount <= 2) return false;
  
  // Check if the actions are making progress
  const hasProgressIndicators = actions.some(action => {
    // Actions that typically indicate progress
    return ['navigate', 'searchGoogle', 'refresh', 'solveCaptcha'].includes(action.tool) ||
           (action.tool === 'type' && action.params?.pressEnter) || // Form submissions
           (action.tool === 'click' && action.params?.selector?.includes('submit'));
  });
  
  // If actions include progress indicators, be less aggressive about flagging
  if (hasProgressIndicators && repeatCount <= 4) return false;
  
  // Check recent success rate
  const recentActions = session.actionHistory.slice(-10);
  const recentFailures = recentActions.filter(a => !a.result?.success).length;
  const failureRate = recentActions.length > 0 ? recentFailures / recentActions.length : 0;
  
  // If most actions are succeeding, don't flag as harmful even with repetition
  if (failureRate < 0.3 && repeatCount <= 5) return false;
  
  // Check if we're stuck on the same URL without making progress
  const urlHistory = session.urlHistory.slice(-3);
  const sameUrlCount = urlHistory.filter(entry => entry.url === session.lastUrl).length;
  
  // If we're repeating the same actions on the same URL multiple times, it's likely harmful
  if (sameUrlCount >= 2 && repeatCount >= 3) return true;
  
  // Default threshold - flag as harmful if repeated more than 4 times
  return repeatCount > 4;
}

// ==========================================
// Login Detection Helpers (Passwords Beta)
// ==========================================

// Wait for the user to respond to a login prompt (submit or skip)
function waitForLoginResponse(sessionId) {
  return new Promise((resolve) => {
    // Set a timeout to auto-skip after 2 minutes
    const timeout = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(handler);
      resolve({ action: 'loginSkipped', sessionId, reason: 'timeout' });
    }, 120000);

    const handler = (request, sender, sendResponse) => {
      if (request.sessionId === sessionId &&
          (request.action === 'loginFormSubmitted' || request.action === 'loginSkipped')) {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(handler);
        resolve(request);
        sendResponse({ received: true });
      }
    };
    chrome.runtime.onMessage.addListener(handler);

    // Store reference for cleanup on session termination
    const session = activeSessions.get(sessionId);
    if (session) {
      session._loginHandler = { handler, timeout };
    }
  });
}

// Extract login field selectors from DOM analysis
function extractLoginFields(domData) {
  const elements = domData?.elements || [];
  let usernameSelector = null;
  let passwordSelector = null;
  let submitSelector = null;
  let usernameType = 'text';
  let passwordFormId = null;

  // Find password field and record its form context
  for (const el of elements) {
    if (el.type === 'input' && el.attributes?.type === 'password') {
      passwordSelector = el.selectors?.[0] || (el.id ? `#${el.id}` : null) || 'input[type="password"]';
      passwordFormId = el.formId || null;
      break;
    }
  }

  // Helper: check if an element looks like a search input (not a login field)
  function isSearchInput(el) {
    const role = el.attributes?.role || '';
    const placeholder = (el.attributes?.placeholder || '').toLowerCase();
    const ariaLabel = (el.attributes?.['aria-label'] || '').toLowerCase();
    return role === 'combobox' || role === 'search' ||
           placeholder.includes('search') || ariaLabel.includes('search');
  }

  // Find username/email field: input[type=text|email] near password, or with matching name/id
  const usernamePatterns = /user|email|login|account|name|ident/i;
  for (const el of elements) {
    if (el.type !== 'input') continue;
    const inputType = el.attributes?.type || 'text';
    if (!['text', 'email', 'tel'].includes(inputType)) continue;

    const nameOrId = (el.id || '') + (el.attributes?.name || '') + (el.attributes?.placeholder || '');
    if (usernamePatterns.test(nameOrId) || inputType === 'email') {
      usernameSelector = el.selectors?.[0] || (el.id ? `#${el.id}` : null);
      usernameType = inputType === 'email' ? 'email' : 'text';
      break;
    }
  }

  // If no username found by pattern but we know the password's form, search within that form
  if (!usernameSelector && passwordFormId) {
    for (const el of elements) {
      if (el.type !== 'input') continue;
      if (el.formId !== passwordFormId) continue;
      const inputType = el.attributes?.type || 'text';
      if (!['text', 'email', 'tel'].includes(inputType)) continue;
      if (isSearchInput(el)) continue;

      usernameSelector = el.selectors?.[0] || (el.id ? `#${el.id}` : null);
      usernameType = inputType === 'email' ? 'email' : 'text';
      automationLogger.debug('Username found via form-scoped search', { formId: passwordFormId, selector: usernameSelector });
      break;
    }
  }

  // Last fallback: first text/email input that isn't password and isn't a search input
  if (!usernameSelector) {
    for (const el of elements) {
      if (el.type !== 'input') continue;
      const inputType = el.attributes?.type || 'text';
      if (!['text', 'email', 'tel'].includes(inputType)) continue;
      if (isSearchInput(el)) continue;

      usernameSelector = el.selectors?.[0] || (el.id ? `#${el.id}` : null);
      break;
    }
  }

  // Find submit button
  const submitPatterns = /log.?in|sign.?in|submit|continue|next/i;
  for (const el of elements) {
    if (el.type !== 'button' && !(el.type === 'input' && el.attributes?.type === 'submit')) continue;
    const text = (el.text || '') + (el.attributes?.value || '') + (el.attributes?.['aria-label'] || '');
    if (submitPatterns.test(text)) {
      submitSelector = el.selectors?.[0] || (el.id ? `#${el.id}` : null);
      break;
    }
  }

  // Fallback: any button[type=submit] or input[type=submit]
  if (!submitSelector) {
    for (const el of elements) {
      if (el.attributes?.type === 'submit') {
        submitSelector = el.selectors?.[0] || (el.id ? `#${el.id}` : null);
        break;
      }
    }
  }

  return { usernameSelector, passwordSelector, submitSelector, usernameType };
}

// Fill credentials on page using saved credentials (looks up from storage)
async function fillCredentialsOnPage(tabId, domain, domData) {
  const cred = await secureConfig.getCredential(domain);
  if (!cred) return { success: false, error: 'No credentials found' };

  const fields = extractLoginFields(domData);

  return await fillCredentialsOnPageDirect(tabId, {
    usernameSelector: fields.usernameSelector,
    passwordSelector: fields.passwordSelector,
    submitSelector: fields.submitSelector,
    username: cred.username,
    password: cred.password
  });
}

// Fill credentials on page directly via chrome.scripting.executeScript
// This avoids sending credentials over message passing where they could be intercepted
// Uses React-compatible native setter to work with frameworks that intercept value changes
async function fillCredentialsOnPageDirect(tabId, { usernameSelector, passwordSelector, submitSelector, username, password }) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (uSel, pSel, sSel, u, p) => {
        // React-compatible value setter: uses the native HTMLInputElement prototype setter
        // which triggers React's synthetic event system, unlike direct .value assignment
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype, 'value'
        ).set;

        function setInputValue(el, value) {
          if (!el) return false;
          el.focus();
          // Use native setter to bypass React's interception
          nativeInputValueSetter.call(el, value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));

          // Verify the value stuck
          if (el.value === value) return true;

          // Fallback: select all + insertText (works with most frameworks)
          el.focus();
          el.select();
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, value);

          return el.value === value;
        }

        const uEl = uSel ? document.querySelector(uSel) : null;
        const pEl = pSel ? document.querySelector(pSel) : null;

        const uFilled = setInputValue(uEl, u);
        const pFilled = setInputValue(pEl, p);

        // Verify both fields after filling
        const uVerified = uEl ? uEl.value === u : false;
        const pVerified = pEl ? pEl.value === p : false;

        // Delay submit click to let framework state updates settle
        if (sSel) {
          setTimeout(() => {
            const sEl = document.querySelector(sSel);
            if (sEl) sEl.click();
          }, 300);
        }

        return {
          success: uVerified && pVerified,
          filledUsername: uFilled,
          filledPassword: pFilled,
          usernameVerified: uVerified,
          passwordVerified: pVerified
        };
      },
      args: [usernameSelector, passwordSelector, submitSelector, username, password],
      world: 'MAIN'
    });
    const result = results[0]?.result || { success: false, error: 'No result from script injection' };
    automationLogger.debug('fillCredentialsOnPageDirect result', result);
    return result;
  } catch (error) {
    console.error('[FSB] fillCredentialsOnPageDirect error:', error.message || 'Unknown error');
    return { success: false, error: 'Credential fill failed' };
  }
}

// Fast DJB2-style string hash for signal channel generation
function quickHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return hash;
}

// Multi-signal DOM change detection
// Returns 4 independent signal channels + raw data for downstream descriptor generation
// Each channel detects a different class of change the old single-hash missed
function createDOMSignals(domState) {
  const elements = domState.elements || [];

  // --- Structural signal: element type distribution ---
  const typeCounts = {};
  for (const el of elements) {
    const t = el.type;
    if (t) typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  const topTypes = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => `${type}:${count}`)
    .join(',');
  const structural = quickHash(topTypes);

  // --- Content signal: text/value from interactive elements ---
  const interactiveRoles = new Set(['alert', 'status', 'dialog', 'alertdialog']);
  const contentElements = elements
    .filter(el => el.isInput || el.isButton || (el.attributes?.role && interactiveRoles.has(el.attributes.role)))
    .sort((a, b) => (a.elementId || '').localeCompare(b.elementId || ''))
    .slice(0, 15);
  const contentParts = [];
  for (const el of contentElements) {
    if (el.isInput) {
      const label = el.attributes?.name || el.id || '';
      const val = (el.value || el.text || '').substring(0, 20);
      // Skip purely numeric values (timestamps, counters)
      if (val && !/^\d+$/.test(val)) {
        contentParts.push(`${label}:${val}`);
      }
    } else {
      const txt = (el.text || '').substring(0, 30);
      if (txt && !/^\d+$/.test(txt)) {
        contentParts.push(txt);
      }
    }
  }
  const content = quickHash(contentParts.join('|'));

  // --- Interaction signal: disabled/checked/readonly state ---
  // Explicitly EXCLUDES focused state (focus changes every iteration from AI actions)
  const interactionElements = elements
    .filter(el => el.isInput || el.isButton)
    .slice(0, 20);
  const interactionParts = [];
  for (const el of interactionElements) {
    const label = el.id || el.type || '';
    const flags = [];
    if (el.interactionState?.disabled) flags.push('D');
    if (el.interactionState?.checked) flags.push('C');
    if (el.interactionState?.readonly) flags.push('R');
    if (flags.length > 0) {
      interactionParts.push(`${label}:${flags.join('')}`);
    }
  }
  const interaction = quickHash(interactionParts.join('|'));

  // --- Page state signal: URL, title, element count, modals, alerts ---
  let urlPath = '';
  try {
    urlPath = new URL(domState.url || '').pathname;
  } catch { urlPath = domState.url || ''; }
  const hasModal = elements.some(el => {
    const r = el.attributes?.role;
    return r === 'dialog' || r === 'alertdialog';
  });
  const hasAlert = elements.some(el => {
    const r = el.attributes?.role;
    return r === 'alert' || r === 'status';
  });
  const pageStateFlags = {
    urlPath,
    title: domState.title || '',
    elementCount: elements.length,
    hasModal,
    hasAlert,
    captchaPresent: domState.captchaPresent || false
  };
  const pageState = quickHash(JSON.stringify(pageStateFlags));

  return {
    structural,
    content,
    interaction,
    pageState,
    _raw: { topTypes, elementCount: elements.length, pageStateFlags }
  };
}

// Compare two signal objects channel by channel
// Returns { changed: boolean, channels: string[], summary: string }
function compareSignals(current, previous) {
  if (!previous) {
    return { changed: true, channels: ['initial'], summary: 'First DOM snapshot' };
  }
  const changedChannels = [];
  if (current.structural !== previous.structural) changedChannels.push('structural');
  if (current.content !== previous.content) changedChannels.push('content');
  if (current.interaction !== previous.interaction) changedChannels.push('interaction');
  if (current.pageState !== previous.pageState) changedChannels.push('pageState');
  return {
    changed: changedChannels.length > 0,
    channels: changedChannels,
    summary: changedChannels.length > 0
      ? `Changed: ${changedChannels.join(', ')}`
      : 'No changes detected'
  };
}

// Parse topTypes string into a Map for diffing (e.g., "button:12,input:8" -> Map{button=>12, input=>8})
function parseTopTypes(topTypesStr) {
  const map = new Map();
  if (!topTypesStr) return map;
  for (const entry of topTypesStr.split(',')) {
    const [type, count] = entry.split(':');
    if (type && count) map.set(type.trim(), parseInt(count, 10));
  }
  return map;
}

// COMPAT: Backward-compatible wrapper -- returns a single hash string
// Used by automationLogger.logIteration() and stateHistory.domHash
function createDOMHash(domState) {
  const signals = createDOMSignals(domState);
  return '' + signals.structural + signals.content + signals.interaction + signals.pageState;
}

/**
 * Handle multi-tab actions directly in background script
 * @param {Object} action - The action to execute
 * @param {number} currentTabId - The current tab ID for context
 * @returns {Promise<Object>} Action result
 */
async function handleMultiTabAction(action, currentTabId) {
  const { tool, params } = action;

  const SENSITIVE_TOOLS_MT = new Set(['fillCredentialFields', 'fillPaymentFields']);
  automationLogger.logActionExecution(null, tool, 'start', { params: SENSITIVE_TOOLS_MT.has(tool) ? '***' : params, currentTabId });

  return new Promise((resolve) => {
    const mockSender = { tab: { id: currentTabId } };
    const mockRequest = { ...params, action: tool };

    switch (tool) {
      case 'openNewTab':
        handleOpenNewTab(mockRequest, mockSender, resolve);
        break;

      case 'switchToTab':
        (async () => {
          // Allow switching to tabs in the session's allowedTabs whitelist
          const switchRequest = { ...mockRequest };
          if (switchRequest.tabId && typeof switchRequest.tabId === 'string') {
            switchRequest.tabId = parseInt(switchRequest.tabId, 10);
          }

          // Find the session for this tab
          const session = Array.from(activeSessions.values()).find(s => s.tabId === currentTabId);
          const isAllowed = session && (
            switchRequest.tabId === session.originalTabId ||
            (session.allowedTabs || []).includes(switchRequest.tabId)
          );

          if (session && !isAllowed) {
            automationLogger.warn('Tab switch blocked', { allowedTabs: session.allowedTabs, requestedTabId: switchRequest.tabId });
            resolve({
              success: false,
              error: `Security restriction: Tab ${switchRequest.tabId} is not in the session's allowed tabs. Allowed: [${(session.allowedTabs || []).join(', ')}].`,
              blocked: true
            });
            return;
          }

          // Clean up overlays on the old tab BEFORE switching (while it is still the active foreground tab)
          if (session && session.tabId && session.tabId !== switchRequest.tabId) {
            await sendSessionStatus(session.tabId, { phase: 'ended', reason: 'tab_switch' });
          }

          // Perform the actual tab switch
          try {
            await chrome.tabs.update(switchRequest.tabId, { active: true });
          } catch (switchErr) {
            automationLogger.warn('Tab switch failed', { tabId: switchRequest.tabId, error: switchErr.message });
            resolve({
              success: false,
              error: `Failed to switch to tab ${switchRequest.tabId}: ${switchErr.message}`
            });
            return;
          }

          if (session) {
            session.previousTabId = session.tabId;
            session.tabId = switchRequest.tabId;
          }

          // Wait for the target tab to finish loading before checking content script
          try {
            const targetTab = await chrome.tabs.get(switchRequest.tabId);
            if (targetTab.status === 'loading') {
              await new Promise((resolveLoad) => {
                const onUpdated = (tabId, changeInfo) => {
                  if (tabId === switchRequest.tabId && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(onUpdated);
                    resolveLoad();
                  }
                };
                chrome.tabs.onUpdated.addListener(onUpdated);
                // Safety timeout to avoid hanging indefinitely
                setTimeout(() => {
                  chrome.tabs.onUpdated.removeListener(onUpdated);
                  resolveLoad();
                }, 5000);
              });
            }
          } catch (tabErr) {
            automationLogger.debug('Could not check target tab status', { tabId: switchRequest.tabId, error: tabErr.message });
          }

          const contentScriptReady = await waitForContentScriptReady(switchRequest.tabId, 5000).catch(() => false);
          automationLogger.debug('Tab switch allowed and executed', { tabId: switchRequest.tabId, contentScriptReady });

          // Immediately show overlay on the new tab so it appears right after the switch,
          // rather than waiting for the next automation iteration (800ms+ later).
          if (contentScriptReady && session) {
            await sendSessionStatus(switchRequest.tabId, {
              phase: 'acting',
              taskName: session.task,
              iteration: session.iterationCount,
              maxIterations: session.maxIterations || 100,
              statusText: 'Switched tab -- preparing next step...',
              animatedHighlights: session.animatedActionHighlights,
              taskSummary: session.taskSummary || null
            });
          }

          resolve({
            success: true,
            message: contentScriptReady
              ? `Switched to tab ${switchRequest.tabId}`
              : `Switched to tab ${switchRequest.tabId} (content script not yet ready -- DOM will be fetched on next iteration)`,
            tabId: switchRequest.tabId,
            contentScriptReady
          });
        })();
        break;

      case 'closeTab':
        // Fix: Convert string tabId to integer
        const closeRequest = { ...mockRequest };
        if (closeRequest.tabId && typeof closeRequest.tabId === 'string') {
          closeRequest.tabId = parseInt(closeRequest.tabId, 10);
        }
        handleCloseTab(closeRequest, mockSender, resolve);
        break;

      case 'listTabs':
        handleListTabs(mockRequest, mockSender, resolve);
        break;

      case 'waitForTabLoad':
        // Fix: Convert string tabId to integer, default to current tab if not specified
        const waitRequest = { ...mockRequest };
        if (waitRequest.tabId) {
          if (typeof waitRequest.tabId === 'string') {
            waitRequest.tabId = parseInt(waitRequest.tabId, 10);
          }
        } else {
          waitRequest.tabId = currentTabId;
        }
        handleWaitForTabLoad(waitRequest, mockSender, resolve);
        break;

      case 'getCurrentTab':
        handleGetCurrentTab(mockRequest, mockSender, resolve);
        break;

      default:
        automationLogger.error('Unknown multi-tab action', { tool });
        resolve({
          success: false,
          error: `Unknown multi-tab action: ${tool}`
        });
    }
  });
}

/**
 * Normalize a job apply URL for deduplication comparison.
 * Removes common tracking parameters and trailing slashes.
 * @param {string} url - The raw apply URL
 * @returns {string} Normalized URL string
 */
function normalizeApplyUrl(url) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'source', 'ref', 'src', 'returnUrl', 'from'
    ];
    for (const param of trackingParams) {
      parsed.searchParams.delete(param);
    }
    // Remove trailing slashes from pathname
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString();
  } catch (e) {
    // URL parsing failed -- return raw string
    return url;
  }
}

/**
 * Deduplicate jobs by normalized apply link.
 * Per locked decision: duplicate = same apply link (URL match), silently drop duplicates.
 * Jobs without apply links or with "not available" apply links are NEVER duplicates.
 * First occurrence wins for jobs with valid apply links.
 * @param {Array} jobs - Array of job objects
 * @returns {Array} Deduplicated array of job objects
 */
function deduplicateJobs(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) return jobs || [];

  const seen = new Map();
  const result = [];

  for (const job of jobs) {
    const link = job.applyLink;

    // Jobs without apply links or with "not available" are never duplicates
    if (!link || link.toLowerCase().includes('not available')) {
      result.push(job);
      continue;
    }

    const normalized = normalizeApplyUrl(link);
    if (!seen.has(normalized)) {
      seen.set(normalized, true);
      result.push(job);
    }
    // Else: silently drop duplicate
  }

  return result;
}

/**
 * Check whether an existing job accumulator is relevant to a new task.
 * Per locked decision: if old data has same role keywords, keep it; if different role, clear.
 * Compares role keywords between the new task and the existing accumulator's searchQuery.
 * @param {Object|null} existingAccumulator - The existing fsbJobAccumulator from storage
 * @param {string} newTaskString - The new task description
 * @returns {string} 'keep' if old data is relevant, 'clear' if it should be discarded
 */
function checkAccumulatorRelevance(existingAccumulator, newTaskString) {
  if (!existingAccumulator || !existingAccumulator.searchQuery) return 'clear';
  if (!newTaskString) return 'clear';

  // Common verbs to exclude from keyword extraction
  const excludeWords = [
    'find', 'search', 'look', 'get', 'show', 'list', 'browse', 'check', 'view',
    'at', 'for', 'in', 'on', 'and', 'or', 'the', 'a', 'an', 'to', 'with'
  ];

  // Extract role keywords: words before "at" in the task string, excluding common verbs
  function extractRoleKeywords(taskStr) {
    // Get the portion before "at [companies]"
    const beforeAt = taskStr.replace(/\bat\s+.+$/i, '').trim().toLowerCase();
    return beforeAt
      .split(/\s+/)
      .filter(w => w.length > 1 && !excludeWords.includes(w));
  }

  const newKeywords = extractRoleKeywords(newTaskString);
  const oldKeywords = extractRoleKeywords(existingAccumulator.searchQuery);

  if (newKeywords.length === 0 || oldKeywords.length === 0) return 'clear';

  // Calculate overlap percentage based on new keywords
  const oldSet = new Set(oldKeywords);
  const overlapCount = newKeywords.filter(kw => oldSet.has(kw)).length;
  const overlapRatio = overlapCount / newKeywords.length;

  return overlapRatio >= 0.5 ? 'keep' : 'clear';
}

// ============================================================================
// Multi-Site Orchestrator
// Sequences company searches, handles failures/auth walls, dedup, final report
// ============================================================================

/**
 * Extract role/search keywords from a task string.
 * Takes words before "at" in the string, filters out common verbs.
 * Example: "find DevOps engineer jobs at Microsoft, Amazon" -> "devops engineer jobs"
 * @param {string} taskStr - The user's task description
 * @returns {string} Lowercase space-joined role keywords
 */
function extractSearchQuery(taskStr) {
  if (!taskStr) return '';
  const beforeAt = taskStr.replace(/\bat\s+.+$/i, '').trim().toLowerCase();
  const excludeVerbs = [
    'find', 'search', 'look', 'get', 'show', 'list', 'browse', 'check', 'view',
    'at', 'for', 'in', 'on', 'and', 'or', 'the', 'a', 'an', 'to', 'with'
  ];
  return beforeAt
    .split(/\s+/)
    .filter(w => w.length > 1 && !excludeVerbs.includes(w))
    .join(' ');
}

/**
 * Rewrite a multi-company task to target a single company.
 * Replaces the "at [company list]" portion with "at [companyName]".
 * Example: "find DevOps jobs at Microsoft, Amazon, and Google" + "Amazon"
 *       -> "find DevOps jobs at Amazon"
 * @param {string} originalTask - The original multi-company task
 * @param {string} companyName - The single company to target
 * @returns {string} Rewritten single-company task
 */
function buildSingleCompanyTask(originalTask, companyName) {
  // Replace "at [company list]" at end of string with "at [companyName]"
  const rewritten = originalTask.replace(/\bat\s+.+$/i, `at ${companyName}`);
  // If regex didn't match (unusual), just append
  if (rewritten === originalTask) {
    return `${originalTask} at ${companyName}`;
  }
  return rewritten;
}

/**
 * Initialize or validate the multi-site job accumulator in chrome.storage.local.
 * Checks relevance of existing data -- clears if different search, keeps if same.
 * @param {Object} session - The session object with multiSite state
 */
async function initMultiSiteAccumulator(session) {
  try {
    const stored = await chrome.storage.local.get('fsbJobAccumulator');
    const existing = stored.fsbJobAccumulator || null;
    const relevance = checkAccumulatorRelevance(existing, session.multiSite.originalTask);

    if (relevance === 'clear' || !existing) {
      // Fresh accumulator for new search
      const freshAccumulator = {
        sessionId: session.sessionId || null,
        searchQuery: session.multiSite.searchQuery,
        startedAt: Date.now(),
        companies: {},
        totalJobs: 0,
        completedAt: null
      };
      await chrome.storage.local.set({ fsbJobAccumulator: freshAccumulator });
      automationLogger.info('Multi-site accumulator initialized (fresh)', {
        searchQuery: session.multiSite.searchQuery,
        reason: existing ? 'different_search' : 'no_existing'
      });
    } else {
      // Keep existing data, update session reference
      existing.sessionId = session.sessionId || existing.sessionId;
      existing.startedAt = Date.now();
      await chrome.storage.local.set({ fsbJobAccumulator: existing });
      automationLogger.info('Multi-site accumulator retained (relevant data)', {
        searchQuery: session.multiSite.searchQuery,
        existingCompanies: Object.keys(existing.companies).length,
        existingJobs: existing.totalJobs
      });
    }
  } catch (error) {
    automationLogger.warn('Failed to initialize multi-site accumulator', { error: error.message });
  }
}

/**
 * Handle multi-site completion interception when a single-company search finishes.
 * Advances to next company, defers auth-walled companies, or finalizes search.
 * @param {string} sessionId - The session ID
 * @param {Object} session - The session object with multiSite state
 * @param {Object} aiResponse - The AI response that triggered taskComplete
 * @returns {Promise<boolean>} true if handled (more companies to go), false if all done
 */
async function handleMultiSiteCompletion(sessionId, session, aiResponse) {
  const ms = session.multiSite;
  const currentCompany = ms.companyList[ms.currentIndex];
  const resultText = (aiResponse.result || '').toString();

  automationLogger.info('Multi-site completion for company', {
    sessionId,
    company: currentCompany,
    index: ms.currentIndex,
    total: ms.companyList.length,
    resultPreview: resultText.substring(0, 150)
  });

  // Check for auth wall
  if (/AUTH\s*REQUIRED/i.test(resultText)) {
    ms.deferredCompanies.push({ name: currentCompany, reason: resultText.substring(0, 200) });
    // Update accumulator with auth status
    try {
      const stored = await chrome.storage.local.get('fsbJobAccumulator');
      const acc = stored.fsbJobAccumulator;
      if (acc) {
        acc.companies[currentCompany] = {
          status: 'auth_required',
          jobs: [],
          error: 'Authentication required'
        };
        await chrome.storage.local.set({ fsbJobAccumulator: acc });
      }
    } catch (e) {
      automationLogger.warn('Failed to update accumulator for auth deferral', { error: e.message });
    }
    automationLogger.info('Company deferred due to auth wall', { sessionId, company: currentCompany });
  }
  // Check for page error / failure
  else if (/PAGE\s*ERROR|SITE\s*UNAVAILABLE|Could not access/i.test(resultText)) {
    ms.failures.push({ company: currentCompany, reason: 'site_error', error: resultText.substring(0, 200) });
    automationLogger.warn('Company search failed', { sessionId, company: currentCompany, reason: 'site_error' });
  }

  // Validate storeJobData was called (fallback parsing)
  const storeJobCalled = session.actionHistory.some(a => a.tool === 'storeJobData' && a.result?.success);
  if (!storeJobCalled && !/AUTH\s*REQUIRED/i.test(resultText) && !/PAGE\s*ERROR/i.test(resultText)) {
    // Check if result text contains job data that wasn't stored
    const jobsFoundMatch = resultText.match(/JOBS?\s*FOUND:?\s*(\d+)/i);
    if (jobsFoundMatch || /\|\s*Title\s*\|/i.test(resultText) || /^\d+\.\s+\*\*/m.test(resultText)) {
      automationLogger.warn('AI did not call storeJobData -- attempting fallback parse', {
        sessionId,
        company: currentCompany
      });
      // Attempt to parse structured job data from result text
      try {
        const fallbackJobs = parseJobsFromResultText(resultText, currentCompany);
        if (fallbackJobs.length > 0) {
          await handleBackgroundAction({
            tool: 'storeJobData',
            params: { company: currentCompany, jobs: fallbackJobs }
          }, session);
          automationLogger.info('Fallback storeJobData succeeded', {
            sessionId,
            company: currentCompany,
            jobCount: fallbackJobs.length
          });
        }
      } catch (parseErr) {
        automationLogger.warn('Fallback job parsing failed', { error: parseErr.message });
      }
    }
  }

  // Advance to next company
  ms.currentIndex++;

  // Check if more primary companies remain
  if (ms.currentIndex < ms.companyList.length) {
    const nextCompany = ms.companyList[ms.currentIndex];
    return await launchNextCompanySearch(sessionId, session, nextCompany);
  }

  // No more primary companies -- check deferred (auth-walled) companies
  if (ms.deferredCompanies.length > 0) {
    automationLogger.info('Processing deferred auth-walled companies', {
      sessionId,
      count: ms.deferredCompanies.length,
      companies: ms.deferredCompanies.map(d => d.name)
    });

    // For each deferred company, check if user might have logged in
    // (heuristic: any tab on the company's domain that is NOT a login page)
    for (const deferred of ms.deferredCompanies) {
      const loginDetected = await checkUserLoginStatus(deferred.name);
      if (loginDetected) {
        // User may have logged in -- retry this company
        automationLogger.info('Login detected for deferred company, retrying', {
          sessionId,
          company: deferred.name
        });
        // Add to end of company list and reset index to process it
        ms.companyList.push(deferred.name);
        return await launchNextCompanySearch(sessionId, session, deferred.name);
      } else {
        // User did not authenticate -- mark as failure
        ms.failures.push({
          company: deferred.name,
          reason: 'auth_required',
          error: 'Authentication required but user did not log in'
        });
        // Update accumulator
        try {
          const stored = await chrome.storage.local.get('fsbJobAccumulator');
          const acc = stored.fsbJobAccumulator;
          if (acc && acc.companies[deferred.name]) {
            acc.companies[deferred.name].error = 'User did not authenticate';
            await chrome.storage.local.set({ fsbJobAccumulator: acc });
          }
        } catch (e) {
          automationLogger.warn('Failed to update accumulator for deferred failure', { error: e.message });
        }
      }
    }
  }

  // All companies processed -- finalize
  await finalizeMultiSiteSearch(sessionId, session);

  // Check if the original task implies Sheets output (Phase 12)
  if (detectSheetsIntent(session.multiSite.originalTask)
      && session.multiSiteResult
      && !session.multiSiteResult.startsWith('Could not')
      && !session.multiSiteResult.startsWith('No jobs')) {
    // Launch Sheets data entry session instead of completing
    await startSheetsDataEntry(sessionId, session);
    return true; // Handled -- automation loop will restart for Sheets entry
  } else {
    return false; // Let normal completion flow run with finalized data
  }
}

/**
 * Launch the next company search by resetting session state and restarting the loop.
 * @param {string} sessionId - The session ID
 * @param {Object} session - The session object
 * @param {string} companyName - The next company to search
 * @returns {Promise<boolean>} Always returns true (handled)
 */
async function launchNextCompanySearch(sessionId, session, companyName) {
  const ms = session.multiSite;
  const totalCompanies = ms.companyList.length;

  // Reset session state for next company
  session.task = buildSingleCompanyTask(ms.originalTask, companyName);
  session.iterationCount = 0;
  session.stuckCounter = 0;
  session.consecutiveNoProgressCount = 0;
  session.actionHistory = [];
  session.stateHistory = [];
  session.lastDOMHash = null;
  session.lastDOMSignals = null;
  session.domHashes = [];
  session.actionSequences = [];
  session.sequenceRepeatCount = {};
  session.failedAttempts = {};
  session.failedActionDetails = {};
  session.urlHistory = [];
  session.lastUrl = null;
  session.status = 'running';

  // Cap iterations per company to prevent one company consuming all iterations
  session.maxIterations = Math.min(session.maxIterations || 100, 15);

  session.taskSummary = `Job search: ${ms.currentIndex + 1}/${totalCompanies} companies`;

  automationLogger.info('Launching next company search', {
    sessionId,
    company: companyName,
    index: ms.currentIndex,
    total: totalCompanies,
    taskSummary: session.taskSummary
  });

  // Clear AI conversation history so the new company starts fresh (Gap 1 fix)
  const ai = sessionAIInstances.get(sessionId);
  if (ai && typeof ai.clearConversationHistory === 'function') {
    ai.clearConversationHistory();
    automationLogger.info('Cleared AI conversation for company transition', {
      sessionId,
      newCompany: companyName
    });
  }

  // Reset session timer so the 5-minute timeout restarts for this company (Gap 3 fix)
  session.startTime = Date.now();

  // Send ProgressOverlay update
  sendSessionStatus(session.tabId, {
    phase: 'analyzing',
    taskName: `Searching ${companyName}`,
    iteration: 0,
    maxIterations: session.maxIterations || 15,
    animatedHighlights: session.animatedActionHighlights,
    taskSummary: session.taskSummary
  });

  // Persist updated session state
  persistSession(sessionId, session);

  // Small delay for page transition before restarting loop
  setTimeout(() => startAutomationLoop(sessionId), 500);
  return true;
}

/**
 * Check if user has logged into a company's domain by examining open tabs.
 * Heuristic: look for tabs on the company's domain that are NOT login/auth pages.
 * @param {string} companyName - The company name to check
 * @returns {Promise<boolean>} true if login appears detected
 */
async function checkUserLoginStatus(companyName) {
  try {
    const tabs = await chrome.tabs.query({});
    const companyLower = companyName.toLowerCase().replace(/\s+/g, '');
    const loginPatterns = ['/login', '/signin', '/auth', '/sso', '/sign-in', '/sign_in', '/account/begin'];

    for (const tab of tabs) {
      if (!tab.url) continue;
      const urlLower = tab.url.toLowerCase();
      // Check if tab is on this company's domain
      const isCompanyDomain = urlLower.includes(companyLower) ||
        urlLower.includes(companyLower.replace(/\s+/g, '-'));
      if (isCompanyDomain) {
        // Check if it's NOT a login page
        const isLoginPage = loginPatterns.some(p => urlLower.includes(p));
        if (!isLoginPage) {
          return true; // Found a non-login page on company domain
        }
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Parse job data from AI result text as a fallback when storeJobData was not called.
 * Handles common formats: numbered lists with bold titles, markdown tables.
 * @param {string} resultText - The AI's result text
 * @param {string} company - The company name for annotation
 * @returns {Array} Array of job objects
 */
function parseJobsFromResultText(resultText, company) {
  const jobs = [];

  // Try to parse numbered list format: "1. **Title** - Location"
  const numberedPattern = /^\d+\.\s+\*\*(.+?)\*\*\s*[-:]\s*(.+)/gm;
  let match;
  while ((match = numberedPattern.exec(resultText)) !== null) {
    const title = match[1].trim();
    const rest = match[2].trim();
    // Try to extract location from the rest
    const locationMatch = rest.match(/^([^|]+?)(?:\s*\|\s*|\s*[-:]\s*Apply|\s*$)/);
    jobs.push({
      title,
      location: locationMatch ? locationMatch[1].trim() : '',
      applyLink: 'not available',
      datePosted: '',
      description: rest.substring(0, 200)
    });
  }

  // Try markdown table format if no numbered results
  if (jobs.length === 0) {
    const rows = resultText.split('\n').filter(line => line.includes('|') && !line.includes('---'));
    // Skip header row
    const dataRows = rows.slice(1);
    for (const row of dataRows) {
      const cells = row.split('|').map(c => c.trim()).filter(c => c.length > 0);
      if (cells.length >= 2) {
        jobs.push({
          title: cells[0] || '',
          location: cells[1] || '',
          applyLink: cells.find(c => c.startsWith('http')) || 'not available',
          datePosted: '',
          description: cells.slice(2).join(' ').substring(0, 200)
        });
      }
    }
  }

  return jobs;
}

/**
 * Finalize the multi-site search: run dedup, build final summary, update accumulator.
 * Called after all companies (including deferred) have been processed.
 * @param {string} sessionId - The session ID
 * @param {Object} session - The session object with multiSite state
 */
async function finalizeMultiSiteSearch(sessionId, session) {
  const ms = session.multiSite;

  automationLogger.info('Finalizing multi-site search', {
    sessionId,
    totalCompanies: ms.companyList.length,
    failures: ms.failures.length,
    deferred: ms.deferredCompanies.length
  });

  try {
    // Read accumulator
    const stored = await chrome.storage.local.get('fsbJobAccumulator');
    const accumulator = stored.fsbJobAccumulator || { companies: {}, totalJobs: 0 };

    // Flatten all jobs across all companies
    const allJobs = Object.values(accumulator.companies)
      .filter(entry => entry.status === 'completed' && Array.isArray(entry.jobs))
      .flatMap(entry => entry.jobs);

    // Run dedup
    const dedupedJobs = deduplicateJobs(allJobs);
    const removedDuplicates = allJobs.length - dedupedJobs.length;

    // Update accumulator
    accumulator.dedupedJobCount = dedupedJobs.length;
    accumulator.duplicatesRemoved = removedDuplicates;
    accumulator.completedAt = Date.now();
    accumulator.totalJobs = dedupedJobs.length;
    await chrome.storage.local.set({ fsbJobAccumulator: accumulator });

    automationLogger.info('Multi-site dedup complete', {
      sessionId,
      totalBeforeDedup: allJobs.length,
      totalAfterDedup: dedupedJobs.length,
      duplicatesRemoved: removedDuplicates
    });

    // Build final result summary
    let finalResult = '';

    if (dedupedJobs.length === 0) {
      // No jobs found -- distinguish between all-failures vs no-results
      const allFailed = ms.failures.length === ms.companyList.length;
      if (allFailed) {
        finalResult = `Could not search any of the requested companies. `;
      } else {
        finalResult = `No jobs matching your search were found across the companies searched. `;
      }
    } else {
      // Build concise summary per locked decision (not full data table unless user asked for listing)
      const companiesWithJobs = Object.entries(accumulator.companies)
        .filter(([, entry]) => entry.status === 'completed' && entry.jobs?.length > 0)
        .map(([name, entry]) => `${name} (${entry.jobs.length})`);

      finalResult = `Found ${dedupedJobs.length} job${dedupedJobs.length !== 1 ? 's' : ''} across ${companiesWithJobs.length} compan${companiesWithJobs.length !== 1 ? 'ies' : 'y'}: ${companiesWithJobs.join(', ')}. `;

      if (removedDuplicates > 0) {
        finalResult += `${removedDuplicates} duplicate${removedDuplicates !== 1 ? 's' : ''} removed. `;
      }
    }

    // Append failure summary per locked decision
    if (ms.failures.length > 0) {
      const failureLines = ms.failures.map(f => {
        if (f.reason === 'auth_required') {
          return `${f.company}: authentication required`;
        }
        return `${f.company}: ${f.reason === 'site_error' ? 'site unavailable' : f.reason}`;
      });
      finalResult += `Failures: ${failureLines.join('; ')}.`;
    }

    // Store final result on session for the completion handler
    session.multiSiteResult = finalResult.trim();
    session.task = ms.originalTask; // Restore original task for final reporting
    session.taskSummary = `Job search: ${ms.companyList.length}/${ms.companyList.length} companies (complete)`;

    // Persist final state
    persistSession(sessionId, session);
  } catch (error) {
    automationLogger.error('Failed to finalize multi-site search', {
      sessionId,
      error: error.message
    });
    session.multiSiteResult = 'Multi-site search completed but summary generation failed. Check stored job data.';
  }
}

// ============================================================================
// Phase 12: Google Sheets Data Entry Orchestrator
// ============================================================================

/**
 * Read accumulated job data from chrome.storage.local fsbJobAccumulator.
 * Flattens all jobs from completed companies into a single array.
 * @returns {Promise<{jobs: Array, totalJobs: number, searchQuery: string, companies: string[]}>}
 */
async function getAccumulatedJobData() {
  const stored = await chrome.storage.local.get('fsbJobAccumulator');
  const accumulator = stored.fsbJobAccumulator;

  if (!accumulator || !accumulator.companies) {
    return { jobs: [], totalJobs: 0, searchQuery: '', companies: [] };
  }

  const allJobs = Object.values(accumulator.companies)
    .filter(entry => entry.status === 'completed' && Array.isArray(entry.jobs))
    .flatMap(entry => entry.jobs);

  return {
    jobs: allJobs,
    totalJobs: allJobs.length,
    searchQuery: accumulator.searchQuery || '',
    companies: Object.keys(accumulator.companies)
  };
}

/**
 * Convert job data array into a compact table string for AI prompt injection.
 * Each row is formatted with pipe-delimited fields for readability.
 * @param {Array} jobs - Array of job objects
 * @param {string[]} columns - The columns to include in the output
 * @returns {{formattedData: string, rowCount: number}}
 */
function formatJobDataForPrompt(jobs, columns) {
  const columnToField = {
    'Title': 'title',
    'Company': 'company',
    'Location': 'location',
    'Date': 'datePosted',
    'Description': 'description',
    'Apply Link': 'applyLink'
  };

  const formattedRows = jobs.map((job, i) => {
    const parts = columns.map(col => {
      const field = columnToField[col];
      let value = job[field] || 'N/A';
      // Cap description at 200 chars
      if (col === 'Description' && value.length > 200) {
        value = value.substring(0, 200).trim() + '...';
      }
      return `${col}: "${value}"`;
    });
    return `Row ${i + 2}: ${parts.join(' | ')}`;
  });

  return {
    formattedData: formattedRows.join('\n'),
    rowCount: jobs.length
  };
}

/**
 * Check if the user's original task implies writing to a Google Sheet.
 * Uses simple keyword matching -- not complex NLP.
 * @param {string} task - The user's original task string
 * @returns {boolean}
 */
function detectSheetsIntent(task) {
  if (!task) return false;
  const taskLower = task.toLowerCase();
  const sheetsKeywords = [
    'spreadsheet', 'sheet', 'sheets', 'google sheet', 'google sheets',
    'write to sheet', 'put in sheet', 'add to sheet', 'create a sheet',
    'fill sheet', 'populate sheet', 'make a spreadsheet'
  ];
  return sheetsKeywords.some(kw => taskLower.includes(kw));
}

/**
 * Find an existing Google Sheets tab that is open in the browser.
 * Matches tabs with docs.google.com/spreadsheets/d/ URL pattern (actual sheets, not home page).
 * @returns {Promise<{tabId: number, url: string}|null>}
 */
async function findExistingSheetsTab() {
  try {
    const tabs = await chrome.tabs.query({});
    const sheetsTab = tabs.find(tab =>
      tab.url && /docs\.google\.com\/spreadsheets\/d\//.test(tab.url)
    );
    if (sheetsTab) {
      return { tabId: sheetsTab.id, url: sheetsTab.url };
    }
    return null;
  } catch (error) {
    automationLogger.warn('Failed to query tabs for Sheets detection', { error: error.message });
    return null;
  }
}

/**
 * Parse user's task for custom column selection.
 * If the task mentions specific columns (e.g., "only title and company"),
 * returns a filtered subset. Otherwise returns all 6 defaults.
 * @param {string} task - The user's original task string
 * @returns {string[]} Array of column names to include
 */
function parseCustomColumns(task) {
  const defaults = ['Title', 'Company', 'Location', 'Date', 'Description', 'Apply Link'];
  if (!task) return defaults;
  const taskLower = task.toLowerCase();

  // Look for explicit column restriction patterns
  const restrictionPatterns = [
    /(?:only|just)\s+(?:the\s+)?(?:columns?\s+)?(.+?)(?:\s+(?:in|into|to|on)\s+|$)/i,
    /columns?:\s*(.+?)(?:\s+(?:in|into|to|on)\s+|$)/i,
    /(?:with|include)\s+only\s+(.+?)(?:\s+(?:in|into|to|on)\s+|$)/i
  ];

  const columnAliases = {
    'Title': ['title', 'role', 'position', 'job title', 'job name'],
    'Company': ['company', 'firm', 'employer', 'organization', 'org'],
    'Location': ['location', 'city', 'place', 'where'],
    'Date': ['date', 'posted', 'when', 'date posted'],
    'Description': ['description', 'desc', 'details', 'summary', 'info'],
    'Apply Link': ['link', 'url', 'apply', 'apply link', 'application link']
  };

  for (const pattern of restrictionPatterns) {
    const match = taskLower.match(pattern);
    if (match) {
      const mentionedText = match[1];
      const selected = [];
      for (const [colName, aliases] of Object.entries(columnAliases)) {
        if (aliases.some(alias => mentionedText.includes(alias))) {
          selected.push(colName);
        }
      }
      if (selected.length > 0) return selected;
    }
  }

  return defaults;
}

/**
 * Build a descriptive sheet title from session context.
 * Generates names like "Job Search - SWE Internships - Feb 2026".
 * @param {Object} session - The session object
 * @returns {string} Formatted sheet title
 */
function buildSheetTitle(session) {
  const query = session.sheetsData?.searchQuery || '';
  const date = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  if (query) {
    return `Job Search - ${query} - ${date}`;
  }
  return `Job Search Results - ${date}`;
}

/**
 * Core Sheets data entry orchestrator.
 * Reads accumulated job data, determines sheet target, builds session state,
 * rewrites the task for Sheets entry, and restarts the automation loop.
 * @param {string} sessionId - The session ID
 * @param {Object} session - The session object
 */
async function startSheetsDataEntry(sessionId, session) {
  automationLogger.info('Starting Sheets data entry orchestration', { sessionId });

  // 1. Get accumulated job data
  const jobData = await getAccumulatedJobData();
  if (jobData.jobs.length === 0) {
    automationLogger.warn('No accumulated job data found for Sheets entry', { sessionId });
    return;
  }
  automationLogger.info('Retrieved accumulated job data for Sheets entry', {
    sessionId,
    totalJobs: jobData.totalJobs,
    companies: jobData.companies.length
  });

  // 2. Parse custom columns from the original task
  const originalTask = session.multiSite?.originalTask || session.task;
  const customColumns = parseCustomColumns(originalTask);
  automationLogger.info('Column selection for Sheets entry', {
    sessionId,
    columns: customColumns,
    isCustom: customColumns.length < 6
  });

  // 3. Format job data for prompt injection
  const { formattedData, rowCount } = formatJobDataForPrompt(jobData.jobs, customColumns);

  // 4. Determine sheet target
  let sheetTarget;

  // Check if user's original task mentions a specific Sheets URL
  const sheetsUrlMatch = originalTask.match(/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9_-]+/);
  if (sheetsUrlMatch) {
    sheetTarget = { type: 'url', url: 'https://' + sheetsUrlMatch[0], tabId: null };
    automationLogger.info('Sheets target: user-provided URL', { sessionId, url: sheetTarget.url });
  } else {
    // Check for existing Sheets tab
    const existingTab = await findExistingSheetsTab();
    if (existingTab) {
      sheetTarget = { type: 'existing', url: existingTab.url, tabId: existingTab.tabId };
      automationLogger.info('Sheets target: existing tab', { sessionId, tabId: existingTab.tabId });
    } else {
      sheetTarget = { type: 'new', url: 'https://docs.google.com/spreadsheets/create', tabId: null };
      automationLogger.info('Sheets target: new sheet', { sessionId });
    }
  }

  // 5. Build session.sheetsData
  session.sheetsData = {
    jobDataPrompt: formattedData,
    totalRows: rowCount,
    columns: customColumns,
    sheetTarget: sheetTarget,
    searchQuery: jobData.searchQuery,
    rowsWritten: 0,
    startedAt: Date.now()
  };

  // 5b. Generate sheet title from context
  session.sheetsData.sheetTitle = buildSheetTitle(session);

  // 6. Rewrite session task for Sheets-specific entry
  session.task = `Write ${rowCount} job listings to Google Sheets. Navigate to the sheet, write headers (${customColumns.join(', ')}) in row 1, then write all data rows. Use Name Box + Tab/Enter pattern. Verify each row after writing.`;

  // 7. Reset session iteration state (same pattern as launchNextCompanySearch)
  session.iterationCount = 0;
  session.stuckCounter = 0;
  session.consecutiveNoProgressCount = 0;
  session.actionHistory = [];
  session.stateHistory = [];
  session.lastDOMHash = null;
  session.lastDOMSignals = null;
  session.domHashes = [];
  session.actionSequences = [];
  session.sequenceRepeatCount = {};
  session.failedAttempts = {};
  session.failedActionDetails = {};
  session.urlHistory = [];
  session.lastUrl = null;
  session.status = 'running';

  // 8. Clear AI conversation history so Sheets entry starts fresh (Gap 2 fix)
  const ai = sessionAIInstances.get(sessionId);
  if (ai && typeof ai.clearConversationHistory === 'function') {
    ai.clearConversationHistory();
    automationLogger.info('Cleared AI conversation for Sheets entry transition', { sessionId });
  }

  // 9. Reset session timer for Sheets entry phase (Gap 3 fix)
  session.startTime = Date.now();

  // 10. Set iteration cap proportional to job count (enough for writing + verification)
  session.maxIterations = Math.max(jobData.jobs.length * 3, 30);

  // 11. Update task summary for progress overlay
  session.taskSummary = `Sheets data entry: 0/${rowCount} rows`;

  // 12. Send initial progress overlay update
  sendSessionStatus(session.tabId, {
    phase: 'sheets-entry',
    step: 'Starting Google Sheets data entry',
    status: `Writing 0/${rowCount} rows...`,
    taskName: session.task,
    iteration: 0,
    maxIterations: session.maxIterations,
    taskSummary: session.taskSummary
  });

  // 13. Persist session state
  persistSession(sessionId, session);

  // 12. Start automation loop with transition delay
  setTimeout(() => startAutomationLoop(sessionId), 500);

  automationLogger.info('Sheets data entry session launched', {
    sessionId,
    totalRows: rowCount,
    columns: customColumns,
    sheetTarget: sheetTarget.type,
    maxIterations: session.maxIterations
  });
}

/**
 * Sheets formatting orchestrator (Phase 13).
 * Launches a formatting pass after data entry completes.
 * Follows the same session-chaining pattern as startSheetsDataEntry.
 * @param {string} sessionId
 * @param {Object} session
 */
async function startSheetsFormatting(sessionId, session) {
  automationLogger.info('Starting Sheets formatting pass', { sessionId });

  const sd = session.sheetsData;

  // Edge case: no data was written -- skip formatting entirely
  if (!sd || sd.totalRows === 0) {
    automationLogger.info('No data rows to format -- skipping formatting', { sessionId });
    sd.formattingComplete = true;
    sd.formattingPhase = true;
    return; // Will fall through to normal completion on next check
  }

  const lastCol = String.fromCharCode(64 + sd.columns.length); // A=65, columns.length gives letter
  const dataRange = `A1:${lastCol}${sd.totalRows + 1}`;

  // Mark formatting phase active
  sd.formattingPhase = true;
  sd.formattingStep = 'starting';
  sd.dataRange = dataRange;
  sd.lastCol = lastCol;

  // Rewrite session task for formatting
  session.task = `Format the Google Sheet with professional styling. The sheet has ${sd.totalRows} data rows plus 1 header row (row 1), columns A through ${lastCol}. Data range: ${dataRange}. Apply: bold header row, center-aligned headers, dark background with white text, bottom border, freeze row 1, alternating row colors (white/light gray), blue text for Apply Link column, and auto-size all columns.`;

  // Reset iteration state (same pattern as startSheetsDataEntry)
  session.iterationCount = 0;
  session.stuckCounter = 0;
  session.consecutiveNoProgressCount = 0;
  session.actionHistory = [];
  session.stateHistory = [];
  session.lastDOMHash = null;
  session.lastDOMSignals = null;
  session.domHashes = [];
  session.actionSequences = [];
  session.sequenceRepeatCount = {};
  session.failedAttempts = {};
  session.failedActionDetails = {};
  session.urlHistory = [];
  session.lastUrl = null;
  session.status = 'running';

  // Clear AI conversation history so formatting starts fresh
  const ai = sessionAIInstances.get(sessionId);
  if (ai && typeof ai.clearConversationHistory === 'function') {
    ai.clearConversationHistory();
    automationLogger.info('Cleared AI conversation for formatting transition', { sessionId });
  }

  // Reset session timer for formatting phase (Gap 3 fix)
  session.startTime = Date.now();

  // Formatting needs fewer iterations than data entry (keyboard shortcuts are fast)
  session.maxIterations = 25;

  // Update task summary for progress overlay
  session.taskSummary = 'Formatting sheet...';

  // Send progress overlay update
  sendSessionStatus(session.tabId, {
    phase: 'sheets-formatting',
    step: 'Applying professional formatting',
    status: 'Formatting sheet...',
    taskName: session.task,
    iteration: 0,
    maxIterations: session.maxIterations,
    taskSummary: session.taskSummary
  });

  // Persist and launch
  persistSession(sessionId, session);
  setTimeout(() => startAutomationLoop(sessionId), 500);

  automationLogger.info('Sheets formatting session launched', {
    sessionId,
    dataRange,
    columns: sd.columns,
    maxIterations: session.maxIterations
  });
}

/**
 * Handle background-only data actions (storeJobData, getStoredJobs).
 * These are NOT multi-tab actions but are handled in the background script
 * because they interact with chrome.storage.local directly.
 * @param {Object} action - The action to execute with .tool and .params
 * @param {Object} session - The active session object
 * @returns {Promise<Object>} Action result
 */
async function handleBackgroundAction(action, session) {
  const { tool, params } = action;

  switch (tool) {
    case 'storeJobData': {
      const company = params?.company;
      const jobs = params?.jobs;
      if (!company || !Array.isArray(jobs)) {
        return { success: false, error: 'storeJobData requires company (string) and jobs (array) params' };
      }

      // Read existing accumulator
      const stored = await chrome.storage.local.get('fsbJobAccumulator');
      let accumulator = stored.fsbJobAccumulator || null;

      // Create new accumulator if none exists
      if (!accumulator) {
        accumulator = {
          sessionId: session?.sessionId || null,
          searchQuery: session?.task || '',
          companies: {},
          totalJobs: 0,
          startedAt: Date.now()
        };
      }

      // Annotate each job with metadata
      const annotatedJobs = jobs.map(job => ({
        ...job,
        company: company,
        extractedAt: Date.now()
      }));

      // Add/update company entry
      accumulator.companies[company] = {
        status: 'completed',
        jobs: annotatedJobs,
        error: null
      };

      // Recalculate total jobs across all companies
      accumulator.totalJobs = Object.values(accumulator.companies)
        .reduce((sum, entry) => sum + (entry.jobs ? entry.jobs.length : 0), 0);

      // Write back to storage
      await chrome.storage.local.set({ fsbJobAccumulator: accumulator });

      return {
        success: true,
        message: `Stored ${annotatedJobs.length} jobs for ${company}`,
        totalAccumulated: accumulator.totalJobs
      };
    }

    case 'getStoredJobs': {
      const stored = await chrome.storage.local.get('fsbJobAccumulator');
      const accumulator = stored.fsbJobAccumulator;

      if (!accumulator || !accumulator.companies) {
        return { success: true, jobs: [], totalJobs: 0, companies: [], searchQuery: '' };
      }

      // Flatten all jobs across all companies
      const allJobs = Object.values(accumulator.companies)
        .flatMap(entry => entry.jobs || []);

      return {
        success: true,
        jobs: allJobs,
        totalJobs: allJobs.length,
        companies: Object.keys(accumulator.companies),
        searchQuery: accumulator.searchQuery || ''
      };
    }

    default:
      return { success: false, error: `Unknown background action: ${tool}` };
  }
}

/**
 * LEGACY: Pre-v0.9.24 monolithic automation loop.
 * Replaced by runAgentLoop from ai/agent-loop.js (Phase 181, D-01/D-02).
 * Kept as unreachable fallback per D-03. No code paths call this function.
 * @deprecated Use runAgentLoop via handleStartAutomation instead.
 * @param {string} sessionId - The unique session identifier
 * @returns {Promise<void>}
 */
async function startAutomationLoop(sessionId) {
  const session = activeSessions.get(sessionId);

  // RACE CONDITION FIX: Check if session is terminating before starting iteration
  if (isSessionTerminating(sessionId)) {
    automationLogger.debug('Session is terminating, exiting loop', { sessionId });
    return;
  }

  // Track the current loop iteration as a promise for cleanup coordination
  let loopResolve;
  session.loopPromise = new Promise(resolve => { loopResolve = resolve; });

  session.iterationCount++;

  // Update content script with iteration progress
  sendSessionStatus(session.tabId, {
    phase: 'analyzing',
    taskName: session.task,
    iteration: session.iterationCount,
    maxIterations: session.maxIterations || 100,
    animatedHighlights: session.animatedActionHighlights,
    statusText: null,  // Don't carry over previous action text; let content script show "Analyzing page..."
    ...calculateProgress(session),
    taskSummary: session.taskSummary || null
  });

  // Broadcast progress to dashboard for dashboard-originated tasks
  broadcastDashboardProgress(session);

  // Fallback: clean up overlays on previous tab if a tab switch occurred
  if (session.previousTabId && session.previousTabId !== session.tabId) {
    sendSessionStatus(session.previousTabId, { phase: 'ended', reason: 'tab_switch' });
    session.previousTabId = null;
  }

  // === SAFETY NET: Absolute iteration cap and session time limit ===
  const ABSOLUTE_MAX_ITERATIONS = session.maxIterations || 100;
  const MAX_SESSION_DURATION = 5 * 60 * 1000; // 5 minutes
  const sessionAge = Date.now() - (session.startTime || Date.now());

  if (session.iterationCount > ABSOLUTE_MAX_ITERATIONS) {
    automationLogger.warn('Absolute iteration cap reached', {
      sessionId,
      iterationCount: session.iterationCount,
      maxIterations: ABSOLUTE_MAX_ITERATIONS
    });
    session.status = 'max_iterations';

    const duration = Date.now() - session.startTime;
    const finalResult = 'Reached the maximum number of iterations (' + ABSOLUTE_MAX_ITERATIONS + '). ' +
      'The task may be too complex for a single session. Try breaking it into smaller steps.';

    automationLogger.logSessionEnd(sessionId, 'max_iterations', session.actionHistory.length, duration);
    automationLogger.saveSession(sessionId, session);
      extractAndStoreMemories(sessionId, session).catch(() => {});

    endSessionOverlays(session, 'max_iterations');
    finalizeSessionMetrics(sessionId, false);
    idleSession(sessionId); // Idle instead of cleanup -- allow follow-up continuation

    fsbBroadcastAutomationLifecycle({
      action: 'automationComplete',
      sessionId,
      // QT-uof-2 (BROADCAST-tabId-THREAD)
      tabId: (session && typeof session.tabId === 'number') ? session.tabId : null,
      result: finalResult,
      partial: true,
      reason: 'max_iterations',
      task: session.task
    }).catch((err) => {
      console.warn('[FSB] automationComplete sendMessage delivery failed', { sessionId, reason: 'max_iterations', error: err && err.message });
    });

    loopResolve?.();
    return;
  }

  if (sessionAge > MAX_SESSION_DURATION) {
    automationLogger.warn('Session time limit exceeded', {
      sessionId,
      sessionAge,
      maxDuration: MAX_SESSION_DURATION,
      iterationCount: session.iterationCount
    });
    session.status = 'timeout';

    const finalResult = 'Session timed out after ' + Math.round(sessionAge / 1000) + ' seconds. ' +
      'Try breaking the task into smaller steps.';

    automationLogger.logSessionEnd(sessionId, 'timeout', session.actionHistory.length, sessionAge);
    automationLogger.saveSession(sessionId, session);
      extractAndStoreMemories(sessionId, session).catch(() => {});

    endSessionOverlays(session, 'timeout');
    finalizeSessionMetrics(sessionId, false);
    idleSession(sessionId); // Idle instead of cleanup -- allow follow-up continuation

    fsbBroadcastAutomationLifecycle({
      action: 'automationComplete',
      sessionId,
      // QT-uof-2 (BROADCAST-tabId-THREAD)
      tabId: (session && typeof session.tabId === 'number') ? session.tabId : null,
      result: finalResult,
      partial: true,
      reason: 'timeout',
      task: session.task
    }).catch((err) => {
      console.warn('[FSB] automationComplete sendMessage delivery failed', { sessionId, reason: 'timeout', error: err && err.message });
    });

    loopResolve?.();
    return;
  }

  // FSB TIMING: Track iteration start time
  const iterationStart = Date.now();

  // PART 3: Add cumulative session elapsed time
  const sessionElapsed = Date.now() - (session.startTime || Date.now());
  automationLogger.logTiming(sessionId, 'LOOP', 'iteration_start', 0, {
    iteration: session.iterationCount,
    sessionElapsedMs: sessionElapsed,
    sessionElapsedFormatted: formatDuration(sessionElapsed)
  });

  // Track iteration in performance metrics
  const sessionStats = performanceMetrics.sessionStats.get(sessionId);
  if (sessionStats) {
    sessionStats.iterations = session.iterationCount;
  }

  // Log iteration with session elapsed context
  automationLogger.debug('Iteration start', {
    sessionId,
    iteration: session.iterationCount,
    sessionElapsedMs: sessionElapsed,
    sessionElapsedFormatted: formatDuration(sessionElapsed),
    stuckCounter: session.stuckCounter
  });
  automationLogger.logIteration(sessionId, session.iterationCount, session.lastDOMHash, session.stuckCounter);

  // Debug mode: Log iteration start
  debugLog('Iteration start', {
    sessionId,
    iterationCount: session.iterationCount,
    stuckCounter: session.stuckCounter
  });

  try {
    // SECURITY: Only inject content script into authorized tabs (original tab or allowedTabs whitelist)
    if (session.tabId !== session.originalTabId && !(session.allowedTabs || []).includes(session.tabId)) {
      throw new Error(`Security violation: Attempted to inject content script into unauthorized tab ${session.tabId}. Session allowed tabs: [${session.originalTabId}, ${(session.allowedTabs || []).join(', ')}].`);
    }

    // Content script is now injected via manifest.json content_scripts
    // Verify it's responding with enhanced retry logic
    try {
      let healthOk = false;
      const maxHealthRetries = 5;
      const healthRetryDelay = 500;

      // PART 4: Track health check recovery timing
      const recoveryStart = Date.now();
      let wasReinjected = false;
      let healthCheckAttempts = 0;

      for (let attempt = 1; attempt <= maxHealthRetries; attempt++) {
        healthCheckAttempts = attempt;

        // Early exit: check if tab still exists before retrying
        try {
          await chrome.tabs.get(session.tabId);
        } catch {
          automationLogger.warn('Tab no longer exists, aborting health check', { sessionId, tabId: session.tabId });
          healthOk = false;
          break;
        }

        // FIX: Log the health check attempt WITHOUT claiming success yet
        // Previously logged success:true before the check ran, making comm logs misleading
        automationLogger.logComm(sessionId, 'health', 'healthCheck_attempt', true, { tabId: session.tabId, attempt, maxRetries: maxHealthRetries });
        healthOk = await checkContentScriptHealth(session.tabId);

        // Log the ACTUAL result of the health check
        automationLogger.logComm(sessionId, 'health', 'healthCheck', healthOk, { tabId: session.tabId, attempt, status: healthOk ? 'healthy' : 'failed' });

        if (healthOk) {
          break;
        }

        if (attempt < maxHealthRetries) {
          // Try re-injecting content script on later attempts
          if (attempt >= 3) {
            automationLogger.logRecovery(sessionId, 'health_fail', 're-inject', 'attempt', { tabId: session.tabId, attempt });
            try {
              await ensureContentScriptInjected(session.tabId);
              wasReinjected = true;
            } catch (e) {
              automationLogger.logRecovery(sessionId, 'health_fail', 're-inject', 'failed', { tabId: session.tabId, error: e.message });
            }
          }
          await new Promise(resolve => setTimeout(resolve, healthRetryDelay * attempt));
        }
      }

      if (!healthOk) {
        throw new Error('Content script not responding to health check after multiple attempts');
      }

      // PART 4: Log recovery duration if it took significant time
      const recoveryDuration = Date.now() - recoveryStart;
      if (recoveryDuration > 2000) {
        automationLogger.info('Health check recovery completed', {
          sessionId,
          recoveryDurationMs: recoveryDuration,
          recoveryDurationFormatted: formatDuration(recoveryDuration),
          attempts: healthCheckAttempts,
          method: wasReinjected ? 'content_script_reinjection' : 'retry'
        });
      }

      automationLogger.logComm(sessionId, 'health', 'verified', true, { tabId: session.tabId, recoveryDurationMs: recoveryDuration });
    } catch (healthError) {
      automationLogger.logComm(sessionId, 'health', 'healthCheck', false, { tabId: session.tabId, error: healthError.message });

      // Get tab URL for error message
      let tabUrl = 'unknown';
      try {
        const tab = await chrome.tabs.get(session.tabId);
        tabUrl = tab.url;
      } catch (e) {}

      // Send error to UI
      fsbBroadcastAutomationLifecycle({
        action: 'automationError',
        sessionId: sessionId,
        error: `Failed to communicate with the page (${tabUrl}). The content script may not have loaded yet. Try refreshing the page. Error: ${healthError.message}`,
        task: session.task
      }).catch((err) => {
        console.warn('[FSB] automationError sendMessage delivery failed', { sessionId, error: err && err.message });
      });

      // Stop the session
      session.status = 'failed';
      const duration = Date.now() - session.startTime;
      automationLogger.logSessionEnd(sessionId, 'failed', session.actionHistory.length, duration);
      automationLogger.saveSession(sessionId, session);
      extractAndStoreMemories(sessionId, session).catch(() => {});
      endSessionOverlays(session, 'error');
      cleanupSession(sessionId);
      return;
    }

    // Get current DOM state with enhanced error handling
    // SPEED-02: Check for pending prefetch first
    let domResponse;
    let usedPrefetch = false;
    try {
      // PERF: Use session-cached DOM settings instead of reading from storage each iteration
      const settings = session.domSettings || { domOptimization: true, maxDOMElements: 2000, prioritizeViewport: true };
      const domOptimizationEnabled = settings.domOptimization !== false;

      // FSB TIMING: Track DOM fetch time
      const domFetchStart = Date.now();

      // SPEED-02: Try to use pending prefetch if available
      if (pendingDOMPrefetch) {
        automationLogger.debug('Using pending DOM prefetch', { sessionId, iteration: session.iterationCount });
        try {
          domResponse = await pendingDOMPrefetch;
          usedPrefetch = true;
          if (domResponse && domResponse.success) {
            // Safety net: verify prefetch URL matches current tab URL
            // Catches stale prefetches from before navigation (e.g., click that redirects)
            try {
              const currentTab = await chrome.tabs.get(session.tabId);
              const prefetchUrl = domResponse.structuredDOM?.url || domResponse.structuredDOM?.htmlContext?.pageStructure?.url || '';
              const tabUrl = currentTab?.url || '';
              if (prefetchUrl && tabUrl) {
                const prefetchOrigin = new URL(prefetchUrl).origin;
                const tabOrigin = new URL(tabUrl).origin;
                if (prefetchOrigin !== tabOrigin) {
                  automationLogger.debug('Prefetch URL mismatch, fetching fresh DOM', {
                    sessionId, prefetchUrl, tabUrl
                  });
                  domResponse = null; // Discard stale prefetch
                  usedPrefetch = false;
                }
              }
            } catch (urlCheckErr) {
              // URL check failed - still use the prefetch rather than failing
              automationLogger.debug('Prefetch URL verification failed, using prefetch anyway', {
                sessionId, error: urlCheckErr.message
              });
            }

            if (domResponse) {
              automationLogger.logTiming(sessionId, 'DOM', 'prefetch_consumed', Date.now() - domFetchStart, {
                tabId: session.tabId,
                source: 'prefetch'
              });
            }
          } else {
            // Prefetch returned invalid response, fetch normally
            automationLogger.debug('Prefetch response invalid, fetching normally', { sessionId });
            domResponse = null;
          }
        } catch (prefetchErr) {
          // Prefetch failed, will fetch normally
          automationLogger.debug('Prefetch await failed, fetching normally', {
            sessionId,
            error: prefetchErr.message
          });
          domResponse = null;
        }
        pendingDOMPrefetch = null; // Clear regardless of success
      }

      // If no prefetch or prefetch failed, fetch normally
      if (!domResponse) {
        automationLogger.logDOMOperation(sessionId, 'request', {
          iteration: session.iterationCount,
          useIncrementalDiff: domOptimizationEnabled,
          maxElements: settings.maxDOMElements || 2000,
          prioritizeViewport: settings.prioritizeViewport !== false
        });

        const getDOMPayload = {
          action: 'getDOM',
          options: {
            useIncrementalDiff: domOptimizationEnabled,
            maxElements: settings.maxDOMElements || 2000,
            prioritizeViewport: settings.prioritizeViewport !== false,
            includeCompactSnapshot: true
          }
        };

        // Log outgoing message for comprehensive session logging
        automationLogger.logContentMessage(sessionId, 'send', 'getDOM', getDOMPayload, null);

        domResponse = await sendMessageWithRetry(session.tabId, getDOMPayload);
        automationLogger.logTiming(sessionId, 'DOM', 'fetch', Date.now() - domFetchStart, {
          tabId: session.tabId,
          source: 'direct'
        });
      }

      // Log received DOM response
      automationLogger.logContentMessage(sessionId, 'receive', 'getDOM', null, {
        success: domResponse?.success,
        elementCount: domResponse?.structuredDOM?.elements?.length || 0
      });
    } catch (messageError) {
      // Check if this is a restricted URL error
      let tabInfo;
      try {
        tabInfo = await chrome.tabs.get(session.tabId);
      } catch (tabError) {
        throw new Error('Tab has been closed or is no longer accessible.');
      }
      
      if (isRestrictedURL(tabInfo.url)) {
        const pageType = getPageTypeDescription(tabInfo.url);
        throw new Error(`Cannot access ${pageType} (${tabInfo.url}). The page navigated to a restricted URL that extensions cannot automate. Please navigate to a regular website to continue automation.`);
      }
      
      // Other message sending errors
      throw new Error(`Failed to communicate with the page (${tabInfo.url}). This may happen if the page is still loading, has security restrictions, or the content script failed to load. Error: ${messageError.message}`);
    }
    
    // Check if DOM response is valid
    if (!domResponse || !domResponse.success || !domResponse.structuredDOM) {
      throw new Error('Failed to get DOM state from content script. Response: ' + JSON.stringify(domResponse));
    }

    // PERF: Event-driven SPA element detection (replaces 6-iteration polling loop)
    // Uses MutationObserver in content script to detect elements as soon as they render
    const initialElementCount = domResponse.structuredDOM.elements?.length || 0;
    const initialTotalElements = domResponse.structuredDOM._totalElements || initialElementCount;
    const urlRecentlyChanged = session.lastUrl && session.lastUrl !== domResponse.structuredDOM.url;

    if (initialTotalElements === 0 && (urlRecentlyChanged || session.iterationCount <= 2)) {
      automationLogger.debug('Zero elements detected after navigation, waiting for SPA render', {
        sessionId,
        url: domResponse.structuredDOM.url,
        iteration: session.iterationCount
      });

      if (isSessionTerminating(sessionId)) {
        loopResolve?.();
        return;
      }

      try {
        const waitResult = await sendMessageWithRetry(session.tabId, {
          action: 'waitForInteractiveElements',
          timeout: 3000
        });

        if (waitResult?.found) {
          automationLogger.debug('SPA elements appeared via MutationObserver', {
            sessionId,
            elementCount: waitResult.elementCount,
            waitTime: waitResult.waitTime
          });

          // Fetch fresh DOM now that elements exist
          domResponse = await sendMessageWithRetry(session.tabId, {
            action: 'getDOM',
            options: {
              useIncrementalDiff: false,
              maxElements: settings.maxDOMElements || 2000,
              prioritizeViewport: settings.prioritizeViewport !== false,
              includeCompactSnapshot: true
            }
          });
        } else {
          automationLogger.debug('SPA wait timed out, proceeding with empty DOM', {
            sessionId,
            waitTime: waitResult?.waitTime
          });
        }
      } catch (e) {
        automationLogger.debug('SPA MutationObserver wait failed, proceeding', { sessionId, error: e.message });
      }
    }

    // Log DOM response details
    const domData = domResponse.structuredDOM;
    automationLogger.logDOMOperation(sessionId, 'received', {
      isDelta: domData._isDelta || false,
      type: domData.type || 'full',
      payloadSize: JSON.stringify(domData).length,
      optimization: domData.optimization || {}
    });

    // Log DOM state for comprehensive session logging
    automationLogger.logDOMState(sessionId, domData, session.iterationCount);

    // Debug mode: Log DOM received
    debugLog('DOM received', {
      elementCount: domData?.elements?.length,
      url: domData?.url
    });

    // Create hash of current DOM state
    const currentDOMHash = createDOMHash(domResponse.structuredDOM);
    const currentDOMSignals = createDOMSignals(domResponse.structuredDOM);
    const currentUrl = domResponse.structuredDOM.url;
    
    // Track URL changes
    let urlChanged = false;
    const previousUrl = session.lastUrl || null; // Capture before overwriting
    if (session.lastUrl) {
      urlChanged = currentUrl !== session.lastUrl;
      if (urlChanged) {
        session.urlHistory.push({
          url: currentUrl,
          timestamp: Date.now(),
          iteration: session.iterationCount
        });
        automationLogger.logNavigation(sessionId, 'change', session.lastUrl, currentUrl, { iteration: session.iterationCount });
      }
    }
    session.lastUrl = currentUrl;
    
    // Multi-signal change detection: compare current signals against previous
    const changeResult = compareSignals(currentDOMSignals, session.lastDOMSignals);

    // Build structured change descriptor with human-readable summary
    const changeSignals = {
      changed: changeResult.changed,
      channels: changeResult.channels,
      summary: []
    };

    if (changeResult.channels.length === 1 && changeResult.channels[0] === 'initial') {
      changeSignals.summary = ['First DOM snapshot -- no comparison available'];
    } else {
      // Structural channel: diff topTypes to report WHICH element types appeared/disappeared
      if (changeResult.channels.includes('structural')) {
        const prevTopTypes = parseTopTypes(session.lastDOMSignals?._raw?.topTypes);
        const currTopTypes = parseTopTypes(currentDOMSignals._raw.topTypes);
        let structuralItems = [];

        // Types in current but not previous
        for (const [type, count] of currTopTypes) {
          if (!prevTopTypes.has(type)) {
            structuralItems.push(`${type} elements appeared`);
          }
        }
        // Types in previous but not current
        for (const [type, count] of prevTopTypes) {
          if (!currTopTypes.has(type)) {
            structuralItems.push(`${type} elements removed`);
          }
        }
        // Types with count changes
        for (const [type, count] of currTopTypes) {
          if (prevTopTypes.has(type) && prevTopTypes.get(type) !== count) {
            const countDelta = count - prevTopTypes.get(type);
            structuralItems.push(`${Math.abs(countDelta)} ${type} elements ${countDelta > 0 ? 'added' : 'removed'}`);
          }
        }
        // Edge case: hashes differ but topTypes maps are identical
        if (structuralItems.length === 0) {
          structuralItems.push('element structure changed');
        }

        // Append overall element count delta to last structural item
        const prevCount = session.lastDOMSignals?._raw?.elementCount || 0;
        const currCount = currentDOMSignals._raw.elementCount;
        if (prevCount !== currCount) {
          const countDelta = currCount - prevCount;
          structuralItems[structuralItems.length - 1] += ` (${Math.abs(countDelta)} elements net ${countDelta > 0 ? 'added' : 'removed'})`;
        }

        changeSignals.summary.push(...structuralItems);
      }

      // Content channel
      if (changeResult.channels.includes('content')) {
        changeSignals.summary.push('page content changed (text or input values)');
      }

      // Interaction channel
      if (changeResult.channels.includes('interaction')) {
        changeSignals.summary.push('element states changed (disabled, checked, or readonly)');
      }

      // Page state channel: report specific changes
      if (changeResult.channels.includes('pageState')) {
        const prevFlags = session.lastDOMSignals?._raw?.pageStateFlags;
        const currFlags = currentDOMSignals._raw.pageStateFlags;
        if (prevFlags) {
          if (!prevFlags.hasModal && currFlags.hasModal) changeSignals.summary.push('modal/dialog opened');
          if (prevFlags.hasModal && !currFlags.hasModal) changeSignals.summary.push('modal/dialog closed');
          if (!prevFlags.hasAlert && currFlags.hasAlert) changeSignals.summary.push('alert/status message appeared');
          if (prevFlags.hasAlert && !currFlags.hasAlert) changeSignals.summary.push('alert/status message removed');
          if (prevFlags.title !== currFlags.title) changeSignals.summary.push(`title changed to "${currFlags.title.substring(0, 60)}"`);
        }
      }
    }

    // Derive domChanged from changeResult for backward compatibility and reuse
    let domChanged = changeResult.changed;

    // Multi-signal stuck detection
    if (!changeResult.changed && !urlChanged) {
      // No signal changes detected -- apply stuck detection logic

      // Safety net: typing-sequence special-case (catches edge cases where content
      // sampling misses the change, e.g., typing into fields not in the sampled set)
      const recentActions = session.actionHistory.slice(-3);
      const isTypingSequence = recentActions.length > 0 &&
        recentActions.every(action => ['type', 'clearInput', 'selectText', 'focus', 'blur', 'pressEnter', 'keyPress'].includes(action.tool));

      if (isTypingSequence) {
        const lastAction = recentActions[recentActions.length - 1];
        const sameTypeRepeats = recentActions.filter(action =>
          action.tool === lastAction?.tool &&
          JSON.stringify(action.params) === JSON.stringify(lastAction?.params)
        ).length;

        const recentTypeActions = session.actionHistory.slice(-5).filter(a => a.tool === 'type');
        const allTypingFailed = recentTypeActions.length >= 3 &&
                                recentTypeActions.every(a => !a.result?.success);

        const recentClicks = session.actionHistory.slice(-5).filter(a => a.tool === 'click');
        const clicksNearSameArea = recentClicks.length >= 3 && areClicksNearby(recentClicks);

        if (sameTypeRepeats >= 2) {
          session.stuckCounter++;
          automationLogger.debug('Stuck: Repetitive typing detected', { sessionId, stuckCounter: session.stuckCounter });
        } else if (allTypingFailed) {
          session.stuckCounter++;
          automationLogger.debug('Stuck: All recent type actions failed', { sessionId, stuckCounter: session.stuckCounter });
        } else if (clicksNearSameArea) {
          session.stuckCounter++;
          automationLogger.debug('Stuck: Clicking same area repeatedly', { sessionId, stuckCounter: session.stuckCounter });
        } else {
          automationLogger.debug('Typing sequence in progress - not counting as stuck', { sessionId });
        }
      } else {
        session.stuckCounter++;
        automationLogger.debug('Stuck: DOM and URL unchanged', { sessionId, stuckCounter: session.stuckCounter });
      }

      if (session.stuckCounter > 0) {
        automationLogger.logStuckDetection(sessionId, session.stuckCounter, session.actionHistory);
      }
    } else if (changeResult.changed) {
      // Channel-aware stuck counter management
      const substantiveChannels = changeResult.channels.filter(ch => ch !== 'interaction');
      if (substantiveChannels.length > 0) {
        // Structural, content, or pageState changed -- definite progress
        session.stuckCounter = 0;
        automationLogger.debug('Stuck counter reset: substantive DOM change', { sessionId, channels: changeResult.channels });
      } else {
        // Only interaction changed (focus moved, element state toggled) -- reduce penalty
        session.stuckCounter = Math.max(0, session.stuckCounter - 1);
        automationLogger.debug('Stuck counter reduced: interaction-only change', { sessionId, stuckCounter: session.stuckCounter });
      }
    } else {
      // URL changed -- reset stuck counter
      session.stuckCounter = 0;
    }

    session.lastDOMHash = currentDOMHash;
    session.lastDOMSignals = currentDOMSignals;

    // Log iteration details
    automationLogger.logIteration(sessionId, session.iterationCount, currentDOMHash, session.stuckCounter);
    
    // Store state history
    session.stateHistory.push({
      timestamp: Date.now(),
      url: domResponse.structuredDOM.url,
      domHash: currentDOMHash,
      elementCount: domResponse.structuredDOM.elements?.length || 0
    });
    
    // Enhanced stuck detection with pattern recognition
    const stuckPatterns = analyzeStuckPatterns(session);
    const isStuck = session.stuckCounter >= 3 || stuckPatterns.severity === 'high';
    
    // Generate recovery strategies if stuck
    let recoveryStrategies = [];
    if (isStuck) {
      recoveryStrategies = generateRecoveryStrategies(stuckPatterns, session);
      automationLogger.logRecovery(sessionId, 'stuck_detected', 'analyze', 'attempt', { patterns: stuckPatterns, strategies: recoveryStrategies.length });
    }
    
    // Get settings for AI call using config
    const settings = await config.getAll();

    // ==========================================
    // LOGIN DETECTION HOOK (Passwords Beta)
    // ==========================================
    const enableLogin = settings.enableLogin === true;
    const domElements = domResponse.structuredDOM?.elements || [];
    const domForms = domResponse.structuredDOM?.htmlContext?.pageStructure?.forms || [];
    const hasPasswordField = domElements.some(el =>
      el.type === 'input' && (
        el.inputType === 'password' ||
        el.attributes?.type === 'password' ||
        (el.id && el.id.includes('password')) ||
        el.selectors?.some(s => typeof s === 'string' && s.includes('type="password"'))
      )
    ) || domForms.some(f => f.fields?.some(field => field.type === 'password'));

    if (enableLogin && hasPasswordField && !session._loginHandledForUrl?.includes(currentUrl)) {
      const loginDomain = secureConfig.normalizeDomain(currentUrl);
      automationLogger.debug('Login page detected', { sessionId, domain: loginDomain, url: currentUrl });

      // Track that we've handled login for this URL to avoid repeated prompts
      if (!session._loginHandledForUrl) session._loginHandledForUrl = [];

      // Check for saved credentials
      const savedCred = await secureConfig.getCredential(loginDomain);

      if (savedCred) {
        // SILENT AUTO-FILL: use saved credentials
        automationLogger.info('Auto-filling saved credentials', { sessionId, domain: loginDomain });

        sendSessionStatus(session.tabId, {
          phase: 'acting',
          taskName: session.task,
          iteration: session.iterationCount,
          maxIterations: session.maxIterations || 100,
          statusText: 'Signing in...',
          animatedHighlights: session.animatedActionHighlights
        });

        const signinProgress = calculateProgress(session);
        chrome.runtime.sendMessage({
          action: 'statusUpdate',
          sessionId,
          message: 'Signing in...',
          iteration: session.iterationCount,
          maxIterations: session.maxIterations || 100,
          progressPercent: signinProgress.progressPercent,
          estimatedTimeRemaining: signinProgress.estimatedTimeRemaining
        }).catch((err) => {
          console.warn('[FSB] statusUpdate sendMessage delivery failed', { sessionId, error: err && err.message });
        });

        const loginFields = extractLoginFields(domResponse.structuredDOM);
        const fillResult = await fillCredentialsOnPage(session.tabId, loginDomain, domResponse.structuredDOM);

        automationLogger.debug('Auto-fill result', { sessionId, success: fillResult?.success, filledUsername: fillResult?.filledUsername, filledPassword: fillResult?.filledPassword ? '***' : false, usernameVerified: fillResult?.usernameVerified, passwordVerified: fillResult?.passwordVerified });

        if (fillResult?.success) {
          session._loginHandledForUrl.push(currentUrl);

          // Wait for page to settle after login submission
          await new Promise(r => setTimeout(r, 2000));

          // Check if login actually succeeded (URL changed = redirect after login)
          try {
            const tab = await chrome.tabs.get(session.tabId);
            const newUrl = tab?.url || '';
            if (newUrl === currentUrl) {
              // Still on login page - login may have failed, allow re-detection
              const idx = session._loginHandledForUrl.indexOf(currentUrl);
              if (idx !== -1) session._loginHandledForUrl.splice(idx, 1);
              automationLogger.debug('Still on login page after fill - re-enabling detection', { sessionId });
            }
          } catch (e) { /* tab may be gone */ }

          // Auto-fill succeeded -- restart loop to verify login worked
          loopResolve?.();
          if (!isSessionTerminating(sessionId) && activeSessions.has(sessionId)) {
            setTimeout(() => startAutomationLoop(sessionId), 500);
          }
          return;
        }
        // Auto-fill failed -- fall through to AI call so it can handle the login form
        automationLogger.info('Auto-fill failed, deferring to AI for login handling', { sessionId, domain: loginDomain });
        session._loginHandledForUrl.push(currentUrl); // Prevent re-triggering hook next iteration
      } else {
        // NO SAVED CREDS: interrupt sidepanel for credentials
        const loginFields = extractLoginFields(domResponse.structuredDOM);
        automationLogger.info('No saved credentials, requesting from user', { sessionId, domain: loginDomain });

        chrome.runtime.sendMessage({
          action: 'loginDetected',
          sessionId,
          domain: loginDomain,
          fields: loginFields
        }).catch((err) => {
          console.warn('[FSB] loginDetected sendMessage delivery failed', { sessionId, error: err && err.message });
        });

        // PAUSE: wait for user response
        const userResponse = await waitForLoginResponse(sessionId);

        if (userResponse.action === 'loginFormSubmitted') {
          // Save credentials if requested
          if (userResponse.save) {
            await secureConfig.saveCredential(loginDomain, {
              username: userResponse.credentials.username,
              password: userResponse.credentials.password
            });
          }

          // Fill the form on page
          const directFillResult = await fillCredentialsOnPageDirect(session.tabId, {
            usernameSelector: loginFields.usernameSelector,
            passwordSelector: loginFields.passwordSelector,
            submitSelector: loginFields.submitSelector,
            username: userResponse.credentials.username,
            password: userResponse.credentials.password
          });

          if (directFillResult?.success) {
            session._loginHandledForUrl.push(currentUrl);

            // Wait for page to settle
            await new Promise(r => setTimeout(r, 2000));

            // Check if login actually succeeded (URL changed = redirect after login)
            try {
              const tab = await chrome.tabs.get(session.tabId);
              const newUrl = tab?.url || '';
              if (newUrl === currentUrl) {
                const idx = session._loginHandledForUrl.indexOf(currentUrl);
                if (idx !== -1) session._loginHandledForUrl.splice(idx, 1);
                automationLogger.debug('Still on login page after direct fill - re-enabling detection', { sessionId });
              }
            } catch (e) { /* tab may be gone */ }

            // Direct fill succeeded -- restart loop
            loopResolve?.();
            if (!isSessionTerminating(sessionId) && activeSessions.has(sessionId)) {
              setTimeout(() => startAutomationLoop(sessionId), 500);
            }
            return;
          }
          // Direct fill failed -- fall through to AI
          automationLogger.info('Direct credential fill failed, deferring to AI', { sessionId, domain: loginDomain });
          session._loginHandledForUrl.push(currentUrl);
        } else {
          // User skipped - mark as handled so we don't prompt again
          session._loginHandledForUrl.push(currentUrl);
          // Continue automation, AI will handle as it can
        }
      }
    }
    // ==========================================
    // END LOGIN DETECTION HOOK
    // ==========================================

    // Detect repeated action failures
    const repeatedFailures = detectRepeatedActionFailures(session);
    const forceAlternativeStrategy = repeatedFailures.length > 0;
    
    // Gather multi-tab context with allowed-tab awareness
    let tabInfo = null;
    try {
      const allTabs = await chrome.tabs.query({ currentWindow: true });
      const sessionTabs = Array.from(activeSessions.values()).map(s => s.tabId);
      const allowedTabs = session.allowedTabs || [];

      tabInfo = {
        currentTabId: session.tabId,
        allTabs: allTabs.map(tab => {
          const isAllowed = allowedTabs.includes(tab.id);
          let domain;
          if (tab.url) {
            try { domain = new URL(tab.url).hostname; } catch { /* skip */ }
          }
          return {
            id: tab.id,
            url: tab.url,
            title: tab.title,
            active: tab.active,
            status: tab.status,
            isAllowedTab: isAllowed,
            ...(domain ? { domain } : {}),
          };
        }),
        sessionTabs: sessionTabs,
        allowedTabs: allowedTabs
      };
    } catch (error) {
      automationLogger.debug('Failed to gather tab context', { sessionId, error: error.message });
    }
    
    // Calculate progress metrics for AI context
    const maxIterations = session.maxIterations || 100;
    const actionsSucceeded = session.actionHistory?.filter(a => a.result?.success).length || 0;
    const actionsFailed = session.actionHistory?.filter(a => !a.result?.success).length || 0;
    const uniquePagesVisited = new Set(session.urlHistory?.map(u => u.url) || []).size;

    // Estimate task completion based on various signals
    const estimateTaskCompletion = () => {
      // If we're on a success page, likely near completion
      if (domResponse.structuredDOM.pageContext?.pageState?.hasSuccess) return 0.9;

      // If stuck, progress is questionable
      if (isStuck) return Math.min(0.5, session.iterationCount / maxIterations);

      // If we've done significant actions without failure, good progress
      const successRate = actionsSucceeded / Math.max(1, actionsSucceeded + actionsFailed);
      const iterationProgress = session.iterationCount / maxIterations;

      // Weighted estimate
      return Math.min(0.95, (successRate * 0.4) + (iterationProgress * 0.6));
    };

    // Progress tracking context for AI
    const progressContext = {
      iterationsUsed: session.iterationCount,
      maxIterations: maxIterations,
      progressPercent: Math.round((session.iterationCount / maxIterations) * 100),
      actionsSucceeded: actionsSucceeded,
      actionsFailed: actionsFailed,
      successRate: actionsSucceeded / Math.max(1, actionsSucceeded + actionsFailed),
      uniquePagesVisited: uniquePagesVisited,
      stuckDuration: session.stuckCounter,
      estimatedCompletion: estimateTaskCompletion(),
      // Time tracking
      elapsedTime: Date.now() - (session.startTime || Date.now()),
      // Momentum indicator
      momentum: actionsFailed === 0 ? 'good' : (actionsFailed <= 2 ? 'moderate' : 'struggling')
    };

    // Prepare context with action history and task plan
    const context = {
      sessionId: sessionId, // Include sessionId for comprehensive logging
      actionHistory: session.actionHistory.slice(-10), // Last 10 actions
      lastActionResult: session.actionHistory.length > 0
        ? session.actionHistory[session.actionHistory.length - 1]
        : null,
      isStuck,
      stuckCounter: session.stuckCounter,
      domChanged,             // Boolean backward compat (derived from changeResult.changed)
      changeSignals,          // Structured: { changed, channels, summary }
      urlChanged,
      failedAttempts: session.failedAttempts,
      failedActionDetails: repeatedFailures, // Specific actions that keep failing
      forceAlternativeStrategy, // Flag to force AI to try different approach
      iterationCount: session.iterationCount,
      urlHistory: session.urlHistory.slice(-5), // Last 5 URL changes
      currentUrl: currentUrl,
      previousUrl: previousUrl, // FIX: Track previous URL for domain transition detection in prompt tier selection
      // NEW: Progress tracking for AI awareness
      progress: progressContext,
      // Add sequence repetition info
      repeatedSequences: Object.entries(session.sequenceRepeatCount)
        .filter(([_, count]) => count > 2)
        .map(([signature, count]) => ({ signature, count })),
      lastSequences: session.actionSequences.slice(-3), // Last 3 action sequences
      // Add multi-tab context
      tabInfo: tabInfo,
      // Recovery strategies when stuck (generated by generateRecoveryStrategies)
      recoveryStrategies: recoveryStrategies.length > 0 ? recoveryStrategies : undefined
    };

    // DIF-02: Wire completion signals from DOM response into context
    context.completionSignals = domResponse.structuredDOM.completionSignals || null;
    const pageIntent = domResponse.structuredDOM.pageContext?.pageIntent;
    if (pageIntent === 'success-confirmation') {
      const completionSignals = domResponse.structuredDOM.completionSignals;
      if (completionSignals && (completionSignals.successMessages?.length > 0 || completionSignals.confirmationPage)) {
        context.completionCandidate = {
          pageIntent,
          signals: completionSignals,
          suggestion: 'Page shows success state -- verify task completion and set taskComplete: true if your task objective was met'
        };
      }
    }

    // CMP-03: Critical action warnings for AI prompt
    const criticalSummary = getCriticalActionSummary(session);
    if (criticalSummary.length > 0) {
      context.criticalActionWarnings = criticalSummary;
    }

    // Inject multi-site context for career prompt augmentation
    if (session.multiSite) {
      context.multiSite = {
        currentCompany: session.multiSite.companyList[session.multiSite.currentIndex],
        currentIndex: session.multiSite.currentIndex,
        totalCompanies: session.multiSite.companyList.length,
        completedCompanies: session.multiSite.companyList.slice(0, session.multiSite.currentIndex)
      };
    }

    // Inject Sheets data entry context for prompt augmentation (Phase 12)
    if (session.sheetsData) {
      context.sheetsData = session.sheetsData;
    }

    // Check for intermediate/redirect pages that should be allowed to resolve
    // Note: With frameId: 0 targeting, we now get DOM from main frame only,
    // so this only triggers when the main page itself is an intermediate page
    const intermediatePagePatterns = [
      /accounts\.google\.com\/RotateCookiesPage/i,
      /accounts\.google\.com\/ServiceLogin/i,
      /consent\.google\.com/i,
      /accounts\.google\.com\/signin\/oauth/i,
      /login\.microsoftonline\.com\/common\/oauth2/i,
      /www\.google\.com\/url\?/i  // Google redirect URLs
    ];

    const isIntermediatePage = intermediatePagePatterns.some(pattern => pattern.test(currentUrl));

    if (isIntermediatePage) {
      automationLogger.logNavigation(sessionId, 'intermediate', currentUrl, null, { waiting: true });

      // Wait for page to be ready using event-driven detection instead of hardcoded 1500ms
      const loadResult = await pageLoadWatcher.waitForPageReady(session.tabId, {
        maxWait: 3000,
        requireDOMStable: true,
        stableTime: 300
      });
      automationLogger.logTiming(sessionId, 'WAIT', 'intermediate_page', loadResult.waitTime, { method: loadResult.method });

      // Check if URL changed after waiting
      let newTabInfo;
      try {
        newTabInfo = await chrome.tabs.get(session.tabId);
      } catch (e) {
        // Tab closed, let normal error handling deal with it
      }

      if (newTabInfo && newTabInfo.url !== currentUrl) {
        automationLogger.logNavigation(sessionId, 'redirect', currentUrl, newTabInfo.url, {});

        // Reset state for the new page
        session.lastUrl = newTabInfo.url;
        session.lastDOMHash = null;
        session.lastDOMSignals = null;
        session.stuckCounter = 0;

        // Continue to next iteration with the new page
        session.pendingTimeout = setTimeout(() => {
          session.pendingTimeout = null;
          startAutomationLoop(sessionId);
        }, 300);
        return;
      }

      // If still on intermediate page after waiting, add context for AI
      context.isIntermediatePage = true;
      context.intermediatePageNote = 'This appears to be an intermediate/authentication page. Wait for it to redirect or look for a continue/proceed button.';
      automationLogger.debug('Still on intermediate page, continuing with AI', { sessionId, url: currentUrl });
    }

    // Call AI to get next actions with context
    // SPEED-02: Start AI call and DOM prefetch in parallel
    // The prefetch will be ready for the NEXT iteration while we process this one

    // Debug mode: Log AI call start
    debugLog('Sending to AI', {
      model: settings.modelName,
      provider: settings.modelProvider,
      isStuck: context.isStuck
    });

    // Signal thinking phase to content script
    sendSessionStatus(session.tabId, {
      phase: 'thinking',
      taskName: session.task,
      iteration: session.iterationCount,
      maxIterations: session.maxIterations || 100,
      animatedHighlights: session.animatedActionHighlights,
      statusText: null,  // Don't carry over previous action text; let content script show "Planning next step..."
      ...calculateProgress(session),
      taskSummary: session.taskSummary || null
    });

    const aiPromise = callAIAPI(
      session.task,
      domResponse.structuredDOM,
      settings,
      context
    );

    // Start prefetching DOM for next iteration while AI processes
    // Key: prefetch starts AFTER AI call begins, so DOM reflects current state changes
    pendingDOMPrefetch = prefetchDOM(session.tabId, {
      maxElements: settings.maxDOMElements || 2000,
      prioritizeViewport: settings.prioritizeViewport !== false,
      includeCompactSnapshot: true
    });

    // FIX 1A: Race AI response against a stop signal so stop button works during API calls
    // PERF: Use event-based AbortController pattern instead of 500ms polling
    const stopController = new AbortController();
    session._stopAbortController = stopController;

    const stopSignal = new Promise((resolve) => {
      stopController.signal.addEventListener('abort', () => {
        resolve({ stopped: true });
      }, { once: true });
      // Fallback: check once in case already terminating
      if (isSessionTerminating(sessionId)) {
        resolve({ stopped: true });
      }
    });

    const raceResult = await Promise.race([aiPromise, stopSignal]);

    // Clean up the abort controller
    session._stopAbortController = null;

    // If stopped, bail out immediately
    if (raceResult?.stopped) {
      automationLogger.debug('Session stopped during AI call', { sessionId });
      loopResolve?.();
      return;
    }

    const aiResponse = raceResult;

    // Log AI response
    // automationLogger.logAIResponse(sessionId, aiResponse.reasoning, aiResponse.actions, aiResponse.taskComplete);
    automationLogger.logAIResponse(sessionId, '', aiResponse.actions, aiResponse.taskComplete); // Reasoning disabled for performance

    // Debug mode: Log AI response received
    debugLog('AI response received', {
      hasActions: !!aiResponse?.actions?.length,
      actionCount: aiResponse?.actions?.length || 0,
      taskComplete: aiResponse?.taskComplete
    });

    // CRITICAL FIX: Handle failedDueToError flag - stop automation and report failure properly
    if (aiResponse.failedDueToError) {
      session.status = 'failed';
      const duration = Date.now() - session.startTime;

      automationLogger.logSessionEnd(sessionId, 'failed', session.actionHistory.length, duration);
      automationLogger.error('Task failed due to API error', { sessionId, result: aiResponse.result });

      // Save session logs for history
      automationLogger.saveSession(sessionId, session);
      extractAndStoreMemories(sessionId, session).catch(() => {});

      endSessionOverlays(session, 'error');
      finalizeSessionMetrics(sessionId, false); // Failed
      cleanupSession(sessionId);

      // Notify UI of failure (simple message for user)
      fsbBroadcastAutomationLifecycle({
        action: 'automationError',
        sessionId,
        error: 'AI service error - please try again',
        message: 'Stopped due to an error',
        task: session.task
      }).catch((err) => {
        console.warn('[FSB] automationError sendMessage delivery failed', { sessionId, error: err && err.message });
      });

      return; // Stop automation loop
    }

    // Execute actions and track results
    if (aiResponse.actions && aiResponse.actions.length > 0) {
      // Sheets data entry progress overlay update (Phase 12)
      // When a Sheets entry session is active, show row-writing progress instead of generic acting phase
      if (session.sheetsData) {
        // Approximate rows written based on iteration count (rough estimate: ~2 iterations per row)
        session.sheetsData.rowsWritten = Math.min(
          Math.floor(session.iterationCount / 2),
          session.sheetsData.totalRows
        );
        session.taskSummary = `Sheets data entry: ${session.sheetsData.rowsWritten}/${session.sheetsData.totalRows} rows`;
        sendSessionStatus(session.tabId, {
          phase: 'sheets-entry',
          step: `Writing row ${session.sheetsData.rowsWritten} of ${session.sheetsData.totalRows}`,
          status: `Written ${session.sheetsData.rowsWritten}/${session.sheetsData.totalRows} rows...`,
          taskName: session.task,
          iteration: session.iterationCount,
          maxIterations: session.maxIterations,
          taskSummary: session.taskSummary
        });

        // Persist session every 5 iterations during Sheets entry to survive service worker restarts
        if (session.iterationCount % 5 === 0) {
          persistSession(sessionId, session);
        }
      }

      // Signal acting phase to content script
      sendSessionStatus(session.tabId, {
        phase: 'acting',
        taskName: session.task,
        iteration: session.iterationCount,
        maxIterations: session.maxIterations || 100,
        actionCount: aiResponse.actions.length,
        animatedHighlights: session.animatedActionHighlights,
        statusText: getActionStatus(aiResponse.actions[0].tool, aiResponse.actions[0].params),
        ...calculateProgress(session),
        taskSummary: session.taskSummary || null
      });
      // Create a smart signature for this action sequence
      const sequenceSignature = createSmartSequenceSignature(aiResponse.actions);
      
      // Track sequence repetition with context awareness
      const sequenceKey = `${sequenceSignature}:${domResponse.structuredDOM.url}`;
      if (!session.sequenceRepeatCount[sequenceKey]) {
        session.sequenceRepeatCount[sequenceKey] = 0;
      }
      session.sequenceRepeatCount[sequenceKey]++;
      
      // Check if this sequence has been repeated too many times
      const sequenceRepeats = session.sequenceRepeatCount[sequenceKey];
      const isHarmfulRepetition = checkHarmfulRepetition(aiResponse.actions, sequenceRepeats, session);
      
      if (isHarmfulRepetition) {
        automationLogger.warn('Harmful action sequence repetition', { sessionId, repeats: sequenceRepeats, signature: sequenceSignature });
        session.stuckCounter = Math.max(session.stuckCounter, 2); // Increase stuck counter but not too aggressively
      }
      
      // Add to sequence history
      session.actionSequences.push({
        signature: sequenceSignature,
        actions: aiResponse.actions,
        iteration: session.iterationCount,
        repeatCount: sequenceRepeats
      });

      // SPEED-03: Try deterministic batch execution for recognized patterns
      // This skips AI roundtrips between actions for predictable sequences
      let batchExecuted = false;
      if (aiResponse.actions.length > 1) {
        const batchResult = await executeDeterministicBatch(aiResponse.actions, session, session.tabId);
        if (batchResult) {
          batchExecuted = true;
          automationLogger.info('Deterministic batch completed', {
            sessionId,
            pattern: batchResult.pattern,
            successCount: batchResult.successCount,
            totalCount: batchResult.count,
            duration: batchResult.duration
          });

          // Clear stale prefetch since batch may have changed DOM significantly
          // Start fresh prefetch for next iteration
          if (batchResult.successCount > 0) {
            pendingDOMPrefetch = null;
            pendingDOMPrefetch = prefetchDOM(session.tabId, {
              maxElements: settings.maxDOMElements || 2000,
              prioritizeViewport: settings.prioritizeViewport !== false,
              includeCompactSnapshot: true
            });
          }
        }
      }

      // Skip individual action loop if batch was executed
      if (!batchExecuted) {
      for (let i = 0; i < aiResponse.actions.length; i++) {
        const action = aiResponse.actions[i];
        const nextAction = aiResponse.actions[i + 1];

        // Check if session was stopped between actions
        if (isSessionTerminating(sessionId)) {
          automationLogger.debug('Session terminated during action execution', { sessionId, actionIndex: i, totalActions: aiResponse.actions.length });
          loopResolve?.();
          return;
        }

        // CMP-03: Skip actions that are on cooldown (irrevocable action re-execution guard)
        if (isCooledDown(session, action)) {
          const cooldown = session.criticalActionRegistry.cooldowns[createActionSignature(action)];
          automationLogger.warn('Skipping cooled-down irrevocable action', {
            sessionId,
            tool: action.tool,
            selector: action.params?.selector,
            blockedUntilIteration: cooldown?.blockedUntilIteration,
            currentIteration: session.iterationCount
          });
          continue;
        }

        // Redact sensitive tool params to prevent credential/payment data in logs
        const SENSITIVE_TOOLS = new Set(['fillCredentialFields', 'fillPaymentFields']);
        const safeParams = SENSITIVE_TOOLS.has(action.tool) ? '***' : action.params;
        automationLogger.logActionExecution(sessionId, action.tool, 'start', { index: i + 1, total: aiResponse.actions.length, params: safeParams });
        const actionStartTime = Date.now();

        // Debug mode: Log action execution
        debugLog('Executing action', {
          tool: action.tool,
          index: i + 1,
          total: aiResponse.actions.length
        });

        // Send action-specific status update to UI with progress data
        const actionProgress = calculateProgress(session);
        chrome.runtime.sendMessage({
          action: 'statusUpdate',
          sessionId,
          message: getActionStatus(action.tool, action.params),
          iteration: session.iterationCount,
          maxIterations: session.maxIterations || 100,
          progressPercent: actionProgress.progressPercent,
          estimatedTimeRemaining: actionProgress.estimatedTimeRemaining
        }).catch(() => {
          // Ignore errors if no listeners
        });

        // Store last action status on session so it persists across navigations
        session.lastActionStatusText = getActionStatus(action.tool, action.params);

        // Multi-tab actions are handled directly by background script
        const multiTabActions = ['openNewTab', 'switchToTab', 'closeTab', 'listTabs', 'waitForTabLoad', 'getCurrentTab'];
        // Background-handled data tools (storage operations, not DOM actions)
        const backgroundDataTools = ['storeJobData', 'getStoredJobs'];
        // Combined list for background dispatch check
        const backgroundHandledTools = [...multiTabActions, ...backgroundDataTools];

        // Send per-action status to content script viewport overlay
        // Skip for multi-tab actions -- they change session.tabId mid-flight,
        // and sending 'acting' to the old tab right before switchToTab would
        // re-create overlays that we are about to clean up.
        // Data tools DO get overlay status updates (they don't change tabs).
        if (!multiTabActions.includes(action.tool)) {
          sendSessionStatus(session.tabId, {
            phase: 'acting',
            taskName: session.task,
            iteration: session.iterationCount,
            maxIterations: session.maxIterations || 100,
            statusText: getActionStatus(action.tool, action.params),
            animatedHighlights: session.animatedActionHighlights,
            ...calculateProgress(session),
            taskSummary: session.taskSummary || null
          });
        }

        let actionResult;

        if (multiTabActions.includes(action.tool)) {
          // Handle multi-tab actions directly in background script
          automationLogger.logActionExecution(sessionId, action.tool, 'routing', { handler: 'background' });
          try {
            actionResult = await handleMultiTabAction(action, session.tabId);
            automationLogger.logActionExecution(sessionId, action.tool, 'complete', { success: actionResult?.success });
          } catch (error) {
            automationLogger.logActionExecution(sessionId, action.tool, 'complete', { success: false, error: error.message });
            actionResult = {
              success: false,
              error: `Multi-tab action failed: ${error.message}`,
              tool: action.tool
            };
          }
        } else if (backgroundDataTools.includes(action.tool)) {
          // Handle data storage actions in background script (chrome.storage.local)
          automationLogger.logActionExecution(sessionId, action.tool, 'routing', { handler: 'background-data' });
          try {
            actionResult = await handleBackgroundAction(action, session);
            automationLogger.logActionExecution(sessionId, action.tool, 'complete', { success: actionResult?.success });
          } catch (error) {
            automationLogger.logActionExecution(sessionId, action.tool, 'complete', { success: false, error: error.message });
            actionResult = {
              success: false,
              error: `Background data action failed: ${error.message}`,
              tool: action.tool
            };
          }
        } else {
          // Send regular DOM actions to content script
          try {
            const actionPayload = {
              action: 'executeAction',
              tool: action.tool,
              params: action.params,
              visualContext: {
                taskName: session.task?.substring(0, 50) || 'Automation',
                stepNumber: i + 1,
                totalSteps: aiResponse.actions.length,
                iterationCount: session.iterationCount,
                animatedHighlights: session.animatedActionHighlights ?? true
              }
            };

            // Log outgoing action message for comprehensive session logging (includes visualContext)
            automationLogger.logContentMessage(sessionId, 'send', 'executeAction', actionPayload, null);

            actionResult = await sendMessageWithRetry(session.tabId, actionPayload);

            // Log action result received
            automationLogger.logContentMessage(sessionId, 'receive', 'executeAction', { tool: action.tool }, actionResult);
          } catch (messageError) {
            // Check if this is a restricted URL error during action execution
            let tabInfo;
            try {
              tabInfo = await chrome.tabs.get(session.tabId);
              if (isRestrictedURL(tabInfo.url)) {
                const pageType = getPageTypeDescription(tabInfo.url);
                throw new Error(`Cannot execute action on ${pageType} (${tabInfo.url}). The page navigated to a restricted URL during automation.`);
              }
            } catch (tabError) {
              throw new Error('Tab was closed or became inaccessible during action execution.');
            }
            
            // For other errors, provide a failure result with classification
            const failureType = classifyFailure(messageError, action);
            actionResult = {
              success: false,
              error: `Failed to execute ${action.tool}: ${messageError.message || messageError}`,
              tool: action.tool,
              failureType,
              retryable: failureType !== FAILURE_TYPES.PERMISSION
            };
          }
        }
        
        // FSB TIMING: Log action execution time
        automationLogger.logTiming(sessionId, 'ACTION', action.tool, Date.now() - actionStartTime, { success: actionResult?.success });

        // Track action in history (slim result to reduce memory and prompt token usage)
        const actionRecord = {
          timestamp: Date.now(),
          tool: action.tool,
          params: action.params,
          result: slimActionResult(actionResult),
          iteration: session.iterationCount
        };
        session.actionHistory.push(actionRecord);

        // CMP-03: Record critical (irrevocable) actions for cooldown enforcement
        if (action.tool === 'click' && actionResult?.success) {
          const clickedText = actionResult?.elementInfo?.text || actionResult?.clicked || '';
          const selectorStr = action.params?.selector || '';
          if (IRREVOCABLE_VERB_PATTERN.test(clickedText) || IRREVOCABLE_VERB_PATTERN.test(selectorStr)) {
            recordCriticalAction(session, action, slimActionResult(actionResult));
          }
        }

        // Log action result
        automationLogger.logAction(sessionId, action, actionResult);

        // Fix: Invalidate stale DOM prefetch after navigation-triggering actions
        // Navigate returns instantly (window.location.href = url) but the page hasn't loaded yet.
        // Without this, the next iteration consumes a prefetch captured from the OLD page.
        const navigationTools = ['navigate', 'searchGoogle', 'goBack', 'goForward', 'switchToTab'];
        if (navigationTools.includes(action.tool) || actionResult?.navigationTriggered) {
          pendingDOMPrefetch = null;
          automationLogger.debug('Invalidated stale DOM prefetch after navigation action', {
            sessionId, tool: action.tool
          });

          // Wait for the new page to actually load before continuing
          if (actionResult?.success) {
            try {
              await pageLoadWatcher.waitForPageReady(session.tabId, { maxWait: 5000 });
              automationLogger.debug('Page load confirmed after navigation', {
                sessionId, tool: action.tool
              });
            } catch (e) {
              automationLogger.debug('Page load wait failed after navigation', {
                sessionId, tool: action.tool, error: e.message
              });
            }
          }
        }

        // Ensure actionResult has proper structure
        if (!actionResult) {
          actionResult = {
            success: false,
            error: 'Action returned no result - possible content script communication failure',
            tool: action.tool,
            failureType: FAILURE_TYPES.COMMUNICATION,
            retryable: true
          };
        }
        
        // Track failures and verification issues
        if (!actionResult.success) {
          // Track by tool type (existing)
          if (!session.failedAttempts[action.tool]) {
            session.failedAttempts[action.tool] = 0;
          }
          session.failedAttempts[action.tool]++;
          
          // Track detailed failures by action signature
          const actionSignature = createActionSignature(action);
          if (!session.failedActionDetails[actionSignature]) {
            session.failedActionDetails[actionSignature] = {
              tool: action.tool,
              params: action.params,
              count: 0,
              errors: [],
              firstFailure: Date.now(),
              lastFailure: null
            };
          }
          
          session.failedActionDetails[actionSignature].count++;
          session.failedActionDetails[actionSignature].lastFailure = Date.now();
          const errorMessage = actionResult.error || 'Unknown error - no error details provided';
          session.failedActionDetails[actionSignature].errors.push({
            error: errorMessage,
            timestamp: Date.now(),
            iteration: session.iterationCount
          });
          
          // Keep only last 3 errors to avoid memory bloat
          if (session.failedActionDetails[actionSignature].errors.length > 3) {
            session.failedActionDetails[actionSignature].errors.shift();
          }
          
          automationLogger.logActionExecution(sessionId, action.tool, 'complete', { success: false, error: errorMessage, failureCount: session.failedActionDetails[actionSignature].count });
          
          // Try alternative actions for critical failures
          if (actionResult.retryable && actionResult.failureType !== FAILURE_TYPES.PERMISSION) {
            automationLogger.logRecovery(sessionId, 'action_fail', 'alternative', 'attempt', { tool: action.tool });
            const alternativeResult = await tryAlternativeAction(sessionId, action, actionResult);

            if (alternativeResult && alternativeResult.success) {
              automationLogger.logRecovery(sessionId, 'action_fail', 'alternative', 'success', { tool: action.tool, alternative: alternativeResult.alternativeUsed });
              actionResult = alternativeResult;
              
              // Log the successful alternative
              automationLogger.logAction(sessionId, {
                ...action,
                description: `${getActionStatus(action.tool, action.params)} (Alternative: ${alternativeResult.alternativeUsed})`
              }, alternativeResult);
              
              // Track alternative action usage
              trackActionPerformance(sessionId, action, actionResult, actionStartTime, true);
            } else {
              // Track failed action
              trackActionPerformance(sessionId, action, actionResult, actionStartTime, false);
            }
          } else {
            // Track failed action
            trackActionPerformance(sessionId, action, actionResult, actionStartTime, false);
          }
        } else {
          // Track successful action
          trackActionPerformance(sessionId, action, actionResult, actionStartTime, false);
          
          // Check for verification warnings
          if (actionResult.success && (actionResult.warning || actionResult.hadEffect === false || actionResult.validationPassed === false)) {
            automationLogger.logValidation(sessionId, 'action_effect', false, {
              tool: action.tool,
              selector: action.params?.selector,
              warning: actionResult.warning,
              hadEffect: actionResult.hadEffect,
              validationPassed: actionResult.validationPassed
            });
            
            // Track actions that succeeded but had no effect
            if (!session.noEffectActions) {
              session.noEffectActions = [];
            }
            
            session.noEffectActions.push({
              tool: action.tool,
              params: action.params,
              warning: actionResult.warning || 'Action completed but verification failed',
              iteration: session.iterationCount,
              timestamp: Date.now()
            });
            
            // If too many no-effect actions, increase stuck counter
            const recentNoEffectCount = session.noEffectActions.filter(a => 
              Date.now() - a.timestamp < 30000 // Last 30 seconds
            ).length;
            
            if (recentNoEffectCount >= 3) {
              session.stuckCounter++;
              automationLogger.debug('Multiple no-effect actions detected', { sessionId, stuckCounter: session.stuckCounter, noEffectCount: recentNoEffectCount });
            }
          }
        }
        
        // SPEED-01: Outcome-based delay calculation
        // Only add delay if not the last action in this batch
        if (i < aiResponse.actions.length - 1) {
          const nextAction = aiResponse.actions[i + 1];

          // Try to detect action outcome for smart waiting
          let outcomeType = 'noChange'; // Default to no change

          try {
            // Check if actionResult already has verification with pre/post state
            if (actionResult?.verification?.preState && actionResult?.verification?.postState) {
              // Use verification data already captured by the action handler
              const outcome = await sendMessageWithRetry(session.tabId, {
                action: 'detectActionOutcome',
                preState: actionResult.verification.preState,
                postState: actionResult.verification.postState,
                actionResult: actionResult
              });

              if (outcome?.type) {
                outcomeType = outcome.type;
                automationLogger.debug('Outcome detected from verification', {
                  sessionId,
                  tool: action.tool,
                  outcomeType,
                  confidence: outcome.confidence
                });
              }
            } else {
              // For actions without built-in verification, capture current state and compare
              // Get current page state as a proxy for post-action state
              const postState = await sendMessageWithRetry(session.tabId, {
                action: 'capturePageState'
              });

              // Infer outcome based on action type and result
              if (actionResult?.success) {
                if (['navigate', 'searchGoogle', 'goBack', 'goForward'].includes(action.tool)) {
                  outcomeType = 'navigation';
                } else if (['click', 'type', 'pressEnter', 'submit'].includes(action.tool)) {
                  // Check if there was a URL change or DOM change indication
                  if (postState?.urlChanged || actionResult?.urlChanged) {
                    outcomeType = 'navigation';
                  } else if (actionResult?.hadEffect) {
                    outcomeType = 'minorDOMChange';
                  } else {
                    // Check for loading indicators
                    const loadingCheck = await sendMessageWithRetry(session.tabId, {
                      action: 'executeAction',
                      tool: 'detectLoadingState',
                      params: {}
                    });
                    if (loadingCheck?.success && loadingCheck?.result?.loading) {
                      outcomeType = 'network';
                    }
                  }
                } else if (['getText', 'getAttribute', 'hover', 'moveMouse', 'focus'].includes(action.tool)) {
                  // Read-only actions - no change expected
                  outcomeType = 'noChange';
                }
              }

              automationLogger.debug('Outcome inferred from action type', {
                sessionId,
                tool: action.tool,
                outcomeType,
                hadEffect: actionResult?.hadEffect
              });
            }
          } catch (outcomeError) {
            // If outcome detection fails, fall back to category-based delay
            automationLogger.debug('Outcome detection failed, using fallback', {
              sessionId,
              error: outcomeError.message
            });

            // Fallback: use calculateActionDelay for unknown situations
            const fallbackDelay = Math.min(calculateActionDelay(action, nextAction), 500);
            automationLogger.logTiming(sessionId, 'WAIT', 'outcome_fallback', fallbackDelay, { tool: action.tool });
            await new Promise(resolve => setTimeout(resolve, fallbackDelay));
            continue; // Skip outcome-based delay
          }

          // Apply outcome-based delay
          const delayResult = await outcomeBasedDelay(session.tabId, outcomeType);
          automationLogger.debug('Applied outcome-based delay', {
            sessionId,
            outcomeType,
            waitTime: delayResult.waitTime,
            method: delayResult.method
          });
        }
      }
      } // End of if (!batchExecuted)

      // Invalidate stale DOM prefetch if actions had visible effects
      // The prefetch was started BEFORE actions executed (line ~4127), so it's stale
      if (!batchExecuted) {
        const currentIterationActions = session.actionHistory.filter(a => a.iteration === session.iterationCount);
        const anyHadEffect = currentIterationActions.some(a =>
          a.result?.hadEffect || a.result?.navigationTriggered ||
          a.result?.verification?.urlChanged || a.result?.verification?.contentChanged
        );
        if (anyHadEffect) {
          pendingDOMPrefetch = null;
          automationLogger.debug('Invalidated stale DOM prefetch - actions had visible effects', {
            sessionId,
            effectfulActions: currentIterationActions.filter(a => a.result?.hadEffect).map(a => a.tool)
          });
        }
      }
    }

    // === PROGRESS TRACKING: Determine if this iteration made meaningful progress ===
    // This counter does NOT reset on URL changes like stuckCounter does
    const iterationActions = session.actionHistory.filter(a => a.iteration === session.iterationCount);
    const iterationStats = {
      actionsSucceeded: iterationActions.filter(a => a.result?.success).length,
      actionsFailed: iterationActions.filter(a => !a.result?.success).length,
      domChanged: domChanged,
      urlChanged: currentUrl !== session.lastUrl,
      // getText/getAttribute are read-only operations - tracked for logging but NOT counted as progress
      newDataExtracted: iterationActions.some(a =>
        a.tool === 'getText' && a.result?.success && a.result?.value && a.result.value.trim().length > 0
      ),
      hadEffect: iterationActions.some(a => a.result?.hadEffect === true),
      hadNavigation: iterationActions.some(a =>
        ['navigate', 'goBack', 'goForward'].includes(a.tool) && a.result?.success
      )
    };

    // CMP-04: Enhanced progress tracking using changeSignals channels (Phase 3)
    // Only count changes that are structural, content, or pageState -- not interaction-only
    const madeProgress = (
      iterationStats.urlChanged ||
      iterationStats.hadNavigation ||
      iterationStats.hadEffect ||
      // Use changeSignals channels to distinguish meaningful changes from noise
      (changeSignals.changed && changeSignals.channels.some(
        ch => ['structural', 'content', 'pageState'].includes(ch)
      ) && iterationStats.actionsSucceeded > 0) ||
      // For extraction tasks, successful getText with content counts as progress
      (classifyTask(session.task) === 'extraction' &&
       iterationStats.newDataExtracted)
    );

    if (madeProgress) {
      session.consecutiveNoProgressCount = 0;
      automationLogger.debug('Progress made this iteration', {
        sessionId,
        consecutiveNoProgressCount: session.consecutiveNoProgressCount,
        stats: iterationStats,
        progressSignal: iterationStats.urlChanged ? 'url_changed' :
                        iterationStats.hadNavigation ? 'navigation' :
                        iterationStats.hadEffect ? 'had_effect' :
                        iterationStats.newDataExtracted ? 'extraction_progress' :
                        'dom_change_substantive'
      });
    } else if (iterationStats.actionsFailed > 0 || !iterationStats.domChanged) {
      session.consecutiveNoProgressCount++;
      automationLogger.debug('No meaningful progress this iteration', {
        sessionId,
        consecutiveNoProgressCount: session.consecutiveNoProgressCount,
        stats: iterationStats
      });
    }

    // === HARD STOP: No progress for 6 consecutive iterations ===
    if (session.consecutiveNoProgressCount >= 6) {
      automationLogger.warn('No progress detected for 6 consecutive iterations', {
        sessionId,
        consecutiveNoProgressCount: session.consecutiveNoProgressCount,
        iterationCount: session.iterationCount,
        lastIterationStats: iterationStats
      });

      // Multi-site orchestration: treat no_progress as a company failure and advance
      if (session.multiSite) {
        const currentCompany = session.multiSite.companyList[session.multiSite.currentIndex];
        automationLogger.info('Multi-site: no_progress for company, advancing', {
          sessionId,
          company: currentCompany
        });
        session.multiSite.failures.push({
          company: currentCompany,
          reason: 'no_progress',
          error: 'Page not responding after 6 consecutive iterations'
        });
        const fakeAiResponse = { result: `PAGE ERROR: ${currentCompany} - no progress`, taskComplete: true };
        const handled = await handleMultiSiteCompletion(sessionId, session, fakeAiResponse);
        if (handled) {
          loopResolve?.();
          return;
        }
        // All companies done -- fall through to finalized completion
        if (session.multiSiteResult) {
          session.status = 'completed';
          const duration = Date.now() - session.startTime;
          automationLogger.logSessionEnd(sessionId, 'completed', session.actionHistory.length, duration);
          automationLogger.saveSession(sessionId, session);
          extractAndStoreMemories(sessionId, session).catch(() => {});
          endSessionOverlays(session, 'complete');
          finalizeSessionMetrics(sessionId, true);
          idleSession(sessionId);
          fsbBroadcastAutomationLifecycle({
            action: 'automationComplete',
            sessionId,
            // QT-uof-2 (BROADCAST-tabId-THREAD)
            tabId: (session && typeof session.tabId === 'number') ? session.tabId : null,
            result: session.multiSiteResult
          });
          return;
        }
      }

      session.status = 'no_progress';

      // Provide a concise summary for the user
      let finalResult = 'Could not complete the task - the page was not responding as expected. ';

      // Include any extracted text if available
      const recentTextActions = session.actionHistory
        .filter(action => action.tool === 'getText' && action.result?.success && action.result?.value)
        .slice(-3);

      if (recentTextActions.length > 0) {
        const extractedTexts = recentTextActions.map(action => action.result.value).filter(text => text && text.trim());
        if (extractedTexts.length > 0) {
          finalResult += `Found: ${extractedTexts[0].substring(0, 150)}`;
          if (extractedTexts[0].length > 150) finalResult += '...';
          finalResult += ' ';
        }
      }

      finalResult += 'Try refreshing the page or rephrasing your request.';

      automationLogger.logSessionEnd(sessionId, 'no_progress', session.actionHistory.length, Date.now() - session.startTime);
      automationLogger.saveSession(sessionId, session);
      extractAndStoreMemories(sessionId, session).catch(() => {});

      endSessionOverlays(session, 'no_progress');
      finalizeSessionMetrics(sessionId, false);
      idleSession(sessionId); // Idle instead of cleanup -- allow follow-up continuation

      fsbBroadcastAutomationLifecycle({
        action: 'automationComplete',
        sessionId,
        // QT-uof-2 (BROADCAST-tabId-THREAD)
        tabId: (session && typeof session.tabId === 'number') ? session.tabId : null,
        result: finalResult,
        partial: true,
        reason: 'no_progress',
        task: session.task
      });

      return;
    }

    // Smart stuck detection with early exit for repeated success
    // Check for repeated success earlier (at 4 iterations) to avoid unnecessary loops
    if (session.stuckCounter >= 4) {
      const repeatedResult = detectRepeatedSuccess(session);
      if (repeatedResult) {
        automationLogger.info('Found repeated valid result', { sessionId, stuckCounter: session.stuckCounter, result: repeatedResult.substring(0, 100) });

        // Multi-site orchestration: intercept repeated-success completion too
        if (session.multiSite) {
          const fakeAiResponse = { result: repeatedResult, taskComplete: true };
          const handled = await handleMultiSiteCompletion(sessionId, session, fakeAiResponse);
          if (handled) {
            loopResolve?.();
            return;
          }
          if (session.multiSiteResult) {
            // Override with multi-site finalized result
            // Fall through to normal completion with the multi-site result
          }
        }

        // Complete the task with the repeated result
        session.status = 'completed';
        const duration = Date.now() - session.startTime;
        automationLogger.logSessionEnd(sessionId, 'completed', session.actionHistory.length, duration);

        // Save session logs for history
        automationLogger.saveSession(sessionId, session);
        extractAndStoreMemories(sessionId, session).catch(() => {});

        // Send success message via runtime message
        fsbBroadcastAutomationLifecycle({
          action: 'automationComplete',
          sessionId,
          // QT-uof-2 (BROADCAST-tabId-THREAD)
          tabId: (session && typeof session.tabId === 'number') ? session.tabId : null,
          result: session.multiSiteResult || repeatedResult,
          navigatedTo: currentUrl
        });

        // Transition to idle for follow-up continuation
        endSessionOverlays(session, 'complete');
        finalizeSessionMetrics(sessionId, true); // Successfully completed
        idleSession(sessionId); // Idle instead of cleanup -- allow follow-up continuation
        return;
      }
    }

    // Check if we're stuck in a loop after more iterations
    if (session.stuckCounter >= 8) {

      automationLogger.error('Automation appears stuck', { sessionId, stuckCounter: session.stuckCounter });

      // Multi-site orchestration: treat stuck as a company failure and advance
      if (session.multiSite) {
        const currentCompany = session.multiSite.companyList[session.multiSite.currentIndex];
        automationLogger.info('Multi-site: stuck for company, advancing', {
          sessionId,
          company: currentCompany
        });
        session.multiSite.failures.push({
          company: currentCompany,
          reason: 'stuck',
          error: 'Automation got stuck after 8 stuck iterations'
        });
        const fakeAiResponse = { result: `PAGE ERROR: ${currentCompany} - stuck`, taskComplete: true };
        const handled = await handleMultiSiteCompletion(sessionId, session, fakeAiResponse);
        if (handled) {
          loopResolve?.();
          return;
        }
        // All companies done -- fall through to finalized completion
        if (session.multiSiteResult) {
          session.status = 'completed';
          const duration = Date.now() - session.startTime;
          automationLogger.logSessionEnd(sessionId, 'completed', session.actionHistory.length, duration);
          automationLogger.saveSession(sessionId, session);
          extractAndStoreMemories(sessionId, session).catch(() => {});
          endSessionOverlays(session, 'complete');
          finalizeSessionMetrics(sessionId, true);
          idleSession(sessionId);
          fsbBroadcastAutomationLifecycle({
            action: 'automationComplete',
            sessionId,
            // QT-uof-2 (BROADCAST-tabId-THREAD)
            tabId: (session && typeof session.tabId === 'number') ? session.tabId : null,
            result: session.multiSiteResult
          });
          return;
        }
      }

      session.status = 'stuck';

      // Provide a concise summary for the user
      let finalResult = 'Got stuck trying to complete your task. ';

      // Include any extracted text if available
      const recentTextActions = session.actionHistory
        .filter(action => action.tool === 'getText' && action.result?.success && action.result?.value)
        .slice(-3);

      if (recentTextActions.length > 0) {
        const extractedTexts = recentTextActions.map(action => action.result.value).filter(text => text && text.trim());
        if (extractedTexts.length > 0) {
          finalResult += `Found: ${extractedTexts[0].substring(0, 150)}`;
          if (extractedTexts[0].length > 150) finalResult += '...';
          finalResult += ' ';
        }
      }

      finalResult += 'Try rephrasing your request or breaking it into smaller steps.';

      automationLogger.logSessionEnd(sessionId, 'stuck', session.actionHistory.length, Date.now() - session.startTime);

      // Save session logs for history
      automationLogger.saveSession(sessionId, session);
      extractAndStoreMemories(sessionId, session).catch(() => {});

      endSessionOverlays(session, 'stuck');
      finalizeSessionMetrics(sessionId, false); // Failed due to stuck loop
      idleSession(sessionId); // Idle instead of cleanup -- allow follow-up continuation

      // Send completion with partial results instead of error
      fsbBroadcastAutomationLifecycle({
        action: 'automationComplete',
        sessionId,
        // QT-uof-2 (BROADCAST-tabId-THREAD)
        tabId: (session && typeof session.tabId === 'number') ? session.tabId : null,
        result: finalResult,
        partial: true,
        task: session.task
      });

      return;
    }
    
    // COMPLETION VALIDATION: Multi-signal verification (CMP-01 + CMP-02)
    if (aiResponse.taskComplete) {
      const validation = validateCompletion(session, aiResponse, context);
      automationLogger.info('Completion validation result', {
        sessionId,
        approved: validation.approved,
        score: validation.score,
        taskType: validation.taskType,
        evidence: validation.evidence
      });
      if (!validation.approved) {
        aiResponse.taskComplete = false;
        automationLogger.warn('Completion blocked by multi-signal validation', {
          sessionId,
          score: validation.score,
          evidence: validation.evidence
        });
      }
    }
    
    // Check if task is complete (after verification enforcement)
    if (aiResponse.taskComplete) {
      // VERIFY-04: Global stability gate - enforce page stability before confirming completion
      // AI operates on DOM snapshots and cannot see pending network requests or in-flight mutations
      automationLogger.info('Task completion claimed by AI, verifying page stability', { sessionId });

      try {
        const stabilityCheck = await sendMessageWithRetry(session.tabId, {
          action: 'waitForPageStability',
          options: {
            maxWait: 3000,     // Allow more time for final action effects
            stableTime: 500,   // DOM stable for 500ms
            networkQuietTime: 300  // No network for 300ms
          }
        });

        const stabilityDuration = stabilityCheck?.waitTime || 0;
        automationLogger.logTiming(sessionId, 'WAIT', 'completion_stability', stabilityDuration, {
          stable: stabilityCheck?.stable,
          timedOut: stabilityCheck?.timedOut,
          pendingRequests: stabilityCheck?.pendingRequests,
          domChanges: stabilityCheck?.domChangeCount
        });

        if (!stabilityCheck?.stable) {
          automationLogger.warn('Task completion: page not fully stable, proceeding anyway', {
            sessionId,
            timedOut: stabilityCheck?.timedOut,
            pendingRequests: stabilityCheck?.pendingRequests,
            domStableFor: stabilityCheck?.domStableFor,
            networkQuietFor: stabilityCheck?.networkQuietFor
          });
        } else {
          automationLogger.info('Task completion: page stability verified', { sessionId });
        }
      } catch (stabilityError) {
        // Stability check failure should NOT block completion
        // Content script may be disconnected if final action navigated away
        automationLogger.warn('Stability check failed before completion, proceeding anyway', {
          sessionId,
          error: stabilityError.message
        });
      }

      // Multi-site orchestration: intercept completion to advance to next company
      if (session.multiSite) {
        const handled = await handleMultiSiteCompletion(sessionId, session, aiResponse);
        if (handled) {
          // Multi-site handler took over -- do NOT proceed with normal completion
          loopResolve?.();
          return;
        }
        // If handled === false, all companies done -- fall through to normal completion
        // Use the finalized multi-site result if available
        if (session.multiSiteResult) {
          aiResponse.result = session.multiSiteResult;
        }
      }

      // Sheets data entry completion handler (Phase 12) + formatting trigger (Phase 13)
      if (session.sheetsData) {
        if (!session.sheetsData.formattingComplete) {
          // Data entry just finished OR formatting just finished -- check which
          if (!session.sheetsData.formattingPhase) {
            // Data entry completed -- launch formatting pass
            automationLogger.info('Sheets data entry completed, launching formatting pass', {
              sessionId,
              totalRows: session.sheetsData.totalRows,
              rowsWritten: session.sheetsData.rowsWritten,
              duration: Date.now() - session.sheetsData.startedAt
            });
            await startSheetsFormatting(sessionId, session);
            loopResolve?.();
            return; // Don't mark complete yet -- formatting will run
          }
          // formattingPhase is true and formattingComplete is false -- formatting just finished
          // Set formattingComplete so the state machine is clean
          session.sheetsData.formattingComplete = true;
          automationLogger.info('Sheets formatting pass completed', { sessionId });
        }
        // formattingComplete is true -- both data entry and formatting done
        automationLogger.info('Sheets data entry and formatting completed', {
          sessionId,
          totalRows: session.sheetsData.totalRows,
          duration: Date.now() - session.sheetsData.startedAt
        });
        if (aiResponse.result) {
          aiResponse.result = `Wrote ${session.sheetsData.totalRows} job listings to Google Sheets with professional formatting. ${aiResponse.result}`;
        }
      }

      // NOW mark complete (existing logic below this point stays unchanged)
      session.status = 'completed';
      const duration = Date.now() - session.startTime;

      automationLogger.logSessionEnd(sessionId, 'completed', session.actionHistory.length, duration);
      automationLogger.info('Task completed successfully', { sessionId, totalActions: session.actionHistory.length, duration });

      // Debug mode: Log task completion
      debugLog('Task complete', {
        sessionId,
        totalActions: session.actionHistory.length,
        durationMs: duration
      });

      // Save session logs for history
      automationLogger.saveSession(sessionId, session);
      extractAndStoreMemories(sessionId, session).catch(() => {});

      endSessionOverlays(session, 'complete');
      finalizeSessionMetrics(sessionId, true); // Successfully completed
      idleSession(sessionId); // Idle instead of cleanup -- allow follow-up continuation

      // Notify popup
      fsbBroadcastAutomationLifecycle({
        action: 'automationComplete',
        sessionId,
        // QT-uof-2 (BROADCAST-tabId-THREAD)
        tabId: (session && typeof session.tabId === 'number') ? session.tabId : null,
        result: aiResponse.result
      });
    } else {
      // Dynamic delay based on stuck counter - optimized for speed
      // FSB TIMING: Log iteration end
      automationLogger.logTiming(sessionId, 'LOOP', 'iteration_end', Date.now() - iterationStart, { iteration: session.iterationCount });

      // Post-iteration progress broadcast to dashboard (after actions executed)
      broadcastDashboardProgress(session);

      const delay = session.stuckCounter > 0 ?
        Math.min(1000 * Math.pow(1.5, session.stuckCounter), 10000) : // Exponential backoff up to 10s
        800; // Reduced from 2000ms for faster automation

      automationLogger.debug('Continuing loop', { sessionId, delay, stuckCounter: session.stuckCounter });

      // RACE CONDITION FIX: Check termination before scheduling next iteration
      if (isSessionTerminating(sessionId)) {
        automationLogger.debug('Session terminated during iteration', { sessionId });
        loopResolve?.(); // Signal that loop has yielded
        return;
      }

      // Store timeout reference for cleanup
      session.pendingTimeout = setTimeout(() => {
        session.pendingTimeout = null;
        startAutomationLoop(sessionId);
      }, delay);
    }

  } catch (error) {
    automationLogger.error('Automation loop error', { sessionId, error: error.message });

    // Check if session still exists before updating
    const currentSession = activeSessions.get(sessionId);
    if (currentSession && !currentSession.isTerminating) {
      currentSession.status = 'error';
      currentSession.error = error.message;

      // Save session logs so failures are recorded
      const duration = Date.now() - currentSession.startTime;
      automationLogger.logSessionEnd(sessionId, 'error', currentSession.actionHistory?.length || 0, duration);
      automationLogger.saveSession(sessionId, currentSession);
      extractAndStoreMemories(sessionId, currentSession).catch(() => {});

      // Clean up visual overlays on error (was previously missing, leaving orphaned overlays)
      endSessionOverlays(currentSession, 'error');
      cleanupSession(sessionId);
    }

    // Notify UI about error (keep message simple for user)
    const userError = error.message && error.message.length > 100
      ? 'Something went wrong. Please try again.'
      : (error.message || 'Something went wrong. Please try again.');
    fsbBroadcastAutomationLifecycle({
      action: 'automationError',
      sessionId,
      error: userError,
      task: currentSession?.task
    });
  } finally {
    // Signal that this loop iteration has completed
    loopResolve?.();

    // Defensive: If session was terminated (stopped/failed) and the loop is exiting,
    // notify the UI in case the stop handler's sendResponse didn't reach it
    const finalSession = activeSessions.get(sessionId);
    if (!finalSession || finalSession.status === 'stopped' || finalSession.status === 'failed') {
      fsbBroadcastAutomationLifecycle({
        action: 'automationError',
        sessionId,
        error: 'Automation ended.',
        task: finalSession?.task
      }).catch((err) => {
        console.warn('[FSB] automationError sendMessage delivery failed', { sessionId, error: err && err.message });
      });
    }
  }
}

/**
 * Calls the xAI Grok-3-mini API to generate automation actions
 * @param {string} task - The task description in natural language
 * @param {Object} structuredDOM - The structured DOM representation
 * @param {Object} settings - Extension settings including API key
 * @param {Object|null} context - Optional context for stuck detection and history
 * @returns {Promise<Object>} AI response with actions and completion status
 */
async function callAIAPI(task, structuredDOM, settings, context = null) {
  try {
    // Get settings if not provided
    if (!settings) {
      settings = await config.getAll();
    }

    // Check if appropriate API key is configured for the selected provider
    const provider = settings.modelProvider || 'xai';
    const providerApiKeyMap = {
      xai: { key: 'apiKey', name: 'xAI' },
      gemini: { key: 'geminiApiKey', name: 'Gemini' },
      openai: { key: 'openaiApiKey', name: 'OpenAI' },
      anthropic: { key: 'anthropicApiKey', name: 'Anthropic' }
    };
    const providerConfig = providerApiKeyMap[provider];
    if (providerConfig && !settings[providerConfig.key]) {
      throw new Error(`${providerConfig.name} API key not configured. Please set it in extension settings.`);
    }

    // Get or create AI integration instance for this session
    // Reusing instances enables multi-turn conversation history
    const sessionId = context?.sessionId;
    let ai;

    if (sessionId && sessionAIInstances.has(sessionId)) {
      // Reuse existing instance for multi-turn conversation
      ai = sessionAIInstances.get(sessionId);
      automationLogger.debug('Reusing AI instance for multi-turn', { sessionId });
    } else {
      // Create new AI integration instance
      ai = new AIIntegration(settings);

      // Store for future iterations if we have a session ID
      if (sessionId) {
        sessionAIInstances.set(sessionId, ai);
        automationLogger.debug('Created new AI instance for session', { sessionId });
      }
    }

    automationLogger.logAPI(context?.sessionId, settings.modelProvider || 'xai', 'call', {
      task: task.substring(0, 100),
      domType: structuredDOM._isDelta ? 'delta' : 'full',
      iteration: context?.iterationCount || 0,
      multiTurn: sessionId && sessionAIInstances.has(sessionId)
    });

    // FSB TIMING: Track AI API call time
    const aiCallStart = Date.now();
    // Get automation actions with context (multi-turn if available)
    // FIX 1B: Pass shouldAbort callback so retry loop can check if session was stopped
    const result = await ai.getAutomationActions(task, structuredDOM, context, {
      shouldAbort: () => isSessionTerminating(context?.sessionId)
    });
    automationLogger.logTiming(context?.sessionId, 'LLM', 'api_call', Date.now() - aiCallStart, { model: settings.modelName || 'default' });

    return result;
    
  } catch (error) {
    automationLogger.error('AI API error', { sessionId: context?.sessionId, error: error.message });

    // CRITICAL FIX: Do NOT mark taskComplete: true on errors - this falsely reports success
    // Return error response that stops automation but indicates failure
    return {
      actions: [],
      taskComplete: false,  // FIX: Do not mark as complete when there's an error
      failedDueToError: true,  // NEW: Explicit error flag for UI to display
      reasoning: '',
      result: `Task failed due to API error: ${error.message}. The automation will stop. Please check your API settings and try again.`,
      error: true
    };
  }
}

// Handle usage tracking from all contexts
function handleTrackUsage(request, sender, sendResponse) {
  automationLogger.debug('Usage tracking request received', {});

  // Initialize analytics if not already done
  const analytics = initializeAnalytics();

  const { model, inputTokens, outputTokens, success, source, tokenSource, timestamp, provider } = request.data;

  automationLogger.logAPI(null, 'analytics', 'track_request', {
    model,
    inputTokens,
    outputTokens,
    success,
    tokenSource,
    context: sender.tab ? 'content' : 'extension'
  });

  // Track the usage and handle response
  analytics.trackUsage(model, inputTokens, outputTokens, success, source || 'automation', provider || '')
    .then(() => {
      // Broadcast update to all extension contexts
      broadcastAnalyticsUpdate();

      automationLogger.debug('Usage tracking completed', {});
      sendResponse({ success: true, message: 'Usage tracked successfully' });
    })
    .catch((error) => {
      automationLogger.error('Failed to handle usage tracking', { error: error.message });
      sendResponse({ success: false, error: error.message });
    });
  
  // Return true to indicate async response
  return true;
}

// Broadcast analytics updates to all extension contexts
function broadcastAnalyticsUpdate() {
  // Send to all extension contexts (popup, sidepanel, options)
  chrome.runtime.sendMessage({
    type: 'ANALYTICS_UPDATE'
  }).catch(() => {
    // Ignore errors if no listeners
  });
}

// Multi-tab management handler functions

/**
 * Handle opening a new tab
 * @param {Object} request - The request object containing url and active flag
 * @param {Object} sender - The message sender
 * @param {Function} sendResponse - Function to send response
 */
async function handleOpenNewTab(request, sender, sendResponse) {
  try {
    const { url, active } = request;
    automationLogger.debug('Opening new tab', { url, active });
    
    const tab = await chrome.tabs.create({
      url: url || 'about:blank',
      active: active !== false // Default to true
    });
    
    // If we need to inject content script into the new tab
    if (url && url !== 'about:blank') {
      // Wait a moment for the tab to load
      setTimeout(async () => {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: CONTENT_SCRIPT_FILES
          });
        } catch (error) {
          automationLogger.debug('Content script injection skipped for new tab', { tabId: tab.id, error: error.message });
        }
      }, 1000);
    }

    // Add newly opened tab to the session's allowed tabs
    const senderTabId = sender.tab?.id;
    if (senderTabId) {
      for (const [sid, sess] of activeSessions.entries()) {
        if (sess.tabId === senderTabId || (sess.allowedTabs || []).includes(senderTabId)) {
          addAllowedTab(sid, tab.id, 'openNewTab');
          break;
        }
      }
    }

    sendResponse({
      success: true,
      tabId: tab.id,
      url: tab.url,
      active: tab.active
    });

  } catch (error) {
    automationLogger.error('Error opening new tab', { error: error.message });
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * Handle switching to an existing tab
 * @param {Object} request - The request object containing tabId
 * @param {Object} sender - The message sender
 * @param {Function} sendResponse - Function to send response
 */
async function handleSwitchToTab(request, sender, sendResponse) {
  try {
    const { tabId } = request;
    automationLogger.debug('Switching to tab', { tabId });
    
    // Get current active tab first
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Switch to the target tab
    await chrome.tabs.update(tabId, { active: true });
    
    // Also bring the window to front
    const tab = await chrome.tabs.get(tabId);
    await chrome.windows.update(tab.windowId, { focused: true });
    
    sendResponse({
      success: true,
      tabId: tabId,
      previousTab: currentTab ? currentTab.id : null
    });
    
  } catch (error) {
    automationLogger.error('Error switching to tab', { error: error.message });
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * Handle closing a tab
 * @param {Object} request - The request object containing tabId
 * @param {Object} sender - The message sender
 * @param {Function} sendResponse - Function to send response
 */
async function handleCloseTab(request, sender, sendResponse) {
  try {
    const { tabId } = request;
    automationLogger.debug('Closing tab', { tabId });

    // Remove any active sessions for this tab
    for (const [sessionId, session] of activeSessions) {
      if (session.tabId === tabId) {
        automationLogger.info('Stopping session for closing tab', { sessionId, tabId });
        session.status = 'stopped';
        finalizeSessionMetrics(sessionId, false); // Tab closed
        cleanupSession(sessionId); // EASY WIN #10: Use cleanup helper
      }
    }

    await chrome.tabs.remove(tabId);

    sendResponse({
      success: true,
      tabId: tabId,
      closed: true
    });

  } catch (error) {
    automationLogger.error('Error closing tab', { error: error.message });
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * Handle CDP-based text insertion for stubborn editors (Slack, Notion, Google Docs, etc.)
 * Uses Chrome DevTools Protocol for guaranteed keystroke delivery
 * @param {Object} request - The request object containing text to insert
 * @param {Object} sender - The message sender
 * @param {Function} sendResponse - Function to send response
 */
async function handleCDPInsertText(request, sender, sendResponse) {
  const tabId = sender.tab?.id;
  const { text, clearFirst } = request;

  if (!tabId) {
    sendResponse({ success: false, error: 'No tab ID available' });
    return;
  }

  if (!text) {
    sendResponse({ success: false, error: 'No text provided' });
    return;
  }

  let debuggerAttached = false;

  try {
    automationLogger.logActionExecution(null, 'cdpInsertText', 'start', { tabId, textLength: text.length });

    // If KeyboardEmulator has the debugger attached to this tab, detach it first
    if (keyboardEmulator && keyboardEmulator.isAttachedTo(tabId)) {
      automationLogger.debug('cdpInsertText: detaching KeyboardEmulator debugger before attaching', { tabId });
      await keyboardEmulator.detachDebugger(tabId);
    }

    // Try to attach debugger; if "already attached" error, force-detach and retry
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
    } catch (attachErr) {
      if (attachErr.message && attachErr.message.includes('Another debugger is already attached')) {
        automationLogger.debug('cdpInsertText: stale debugger detected, force-detaching and retrying', { tabId });
        try {
          await chrome.debugger.detach({ tabId });
        } catch (forceDetachErr) {
          // Ignore -- may fail if the "other debugger" is not ours
        }
        await chrome.debugger.attach({ tabId }, '1.3');
      } else {
        throw attachErr;
      }
    }
    debuggerAttached = true;

    // If clearFirst is requested, select all and delete
    if (clearFirst) {
      // Detect platform: modifier 4 = Meta (Cmd) on macOS, modifier 2 = Ctrl on others
      const isMac = navigator.userAgent?.includes('Macintosh') || navigator.platform?.includes('Mac');
      const selectAllModifier = isMac ? 4 : 2;

      // Select all text in focused element
      await chrome.debugger.sendCommand(
        { tabId },
        'Input.dispatchKeyEvent',
        {
          type: 'keyDown',
          modifiers: selectAllModifier,
          key: 'a',
          code: 'KeyA'
        }
      );
      await chrome.debugger.sendCommand(
        { tabId },
        'Input.dispatchKeyEvent',
        {
          type: 'keyUp',
          modifiers: selectAllModifier,
          key: 'a',
          code: 'KeyA'
        }
      );

      // Delay for selection -- Monaco needs ~200ms to process Ctrl+A and update its internal model
      await new Promise(r => setTimeout(r, 200));

      // Delete selected text
      await chrome.debugger.sendCommand(
        { tabId },
        'Input.dispatchKeyEvent',
        {
          type: 'keyDown',
          key: 'Backspace',
          code: 'Backspace'
        }
      );
      await chrome.debugger.sendCommand(
        { tabId },
        'Input.dispatchKeyEvent',
        {
          type: 'keyUp',
          key: 'Backspace',
          code: 'Backspace'
        }
      );

      // Delay for deletion -- Monaco needs time to clear its buffer before accepting new input
      await new Promise(r => setTimeout(r, 200));
    }

    // Use Input.insertText for reliable text insertion
    await chrome.debugger.sendCommand(
      { tabId },
      'Input.insertText',
      { text }
    );

    // Detach debugger
    await chrome.debugger.detach({ tabId });
    debuggerAttached = false;

    automationLogger.logActionExecution(null, 'cdpInsertText', 'complete', { success: true, tabId, textLength: text.length });
    sendResponse({
      success: true,
      text: text,
      method: 'cdp',
      length: text.length
    });

  } catch (error) {
    automationLogger.logActionExecution(null, 'cdpInsertText', 'complete', { success: false, tabId, error: error.message });

    // Try to detach debugger if it was attached
    if (debuggerAttached) {
      try {
        await chrome.debugger.detach({ tabId });
      } catch (detachError) {
        automationLogger.debug('Debugger already detached', { tabId });
      }
    }

    sendResponse({
      success: false,
      error: error.message,
      method: 'cdp'
    });
  }
}

/**
 * Handle CDP-based mouse click at viewport coordinates.
 * Uses Chrome DevTools Protocol Input.dispatchMouseEvent for precise click delivery.
 * @param {Object} request - { x, y, shiftKey, ctrlKey, altKey }
 * @param {Object} sender - The message sender
 * @param {Function} sendResponse - Function to send response
 */
async function handleCDPMouseClick(request, sender, sendResponse) {
  const tabId = sender.tab?.id;
  const { x, y, shiftKey, ctrlKey, altKey } = request;

  if (!tabId) {
    sendResponse({ success: false, error: 'No tab ID available' });
    return;
  }

  // T-181-01: Validate coordinates are finite numbers
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    sendResponse({ success: false, error: 'x and y must be finite numbers' });
    return;
  }

  let debuggerAttached = false;

  try {
    automationLogger.logActionExecution(null, 'cdpMouseClick', 'start', { tabId, x, y });

    // If KeyboardEmulator has the debugger attached to this tab, detach it first
    if (keyboardEmulator && keyboardEmulator.isAttachedTo(tabId)) {
      automationLogger.debug('cdpMouseClick: detaching KeyboardEmulator debugger before attaching', { tabId });
      await keyboardEmulator.detachDebugger(tabId);
    }

    // Try to attach debugger; if "already attached" error, force-detach and retry
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
    } catch (attachErr) {
      if (attachErr.message && attachErr.message.includes('Another debugger is already attached')) {
        automationLogger.debug('cdpMouseClick: stale debugger detected, force-detaching and retrying', { tabId });
        try { await chrome.debugger.detach({ tabId }); } catch (_e) { /* ignore */ }
        await chrome.debugger.attach({ tabId }, '1.3');
      } else {
        throw attachErr;
      }
    }
    debuggerAttached = true;

    const modifiers = (altKey ? 1 : 0) | (ctrlKey ? 2 : 0) | (shiftKey ? 8 : 0);

    // Mouse pressed
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mousePressed', x, y, button: 'left', clickCount: 1, modifiers
    });

    // Mouse released
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased', x, y, button: 'left', clickCount: 1, modifiers
    });

    await chrome.debugger.detach({ tabId });
    debuggerAttached = false;

    automationLogger.logActionExecution(null, 'cdpMouseClick', 'complete', { success: true, tabId, x, y });
    sendResponse({ success: true, x, y });

  } catch (error) {
    automationLogger.logActionExecution(null, 'cdpMouseClick', 'complete', { success: false, tabId, error: error.message });
    if (debuggerAttached) {
      try { await chrome.debugger.detach({ tabId }); } catch (_e) { /* ignore */ }
    }
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle CDP-based mouse click and hold at viewport coordinates.
 * Presses mouse button, waits for holdMs, then releases.
 * @param {Object} request - { x, y, holdMs }
 * @param {Object} sender - The message sender
 * @param {Function} sendResponse - Function to send response
 */
async function handleCDPMouseClickAndHold(request, sender, sendResponse) {
  const tabId = sender.tab?.id;
  const { x, y } = request;
  const holdMs = request.holdMs || 5000;

  if (!tabId) {
    sendResponse({ success: false, error: 'No tab ID available' });
    return;
  }

  // T-181-01: Validate coordinates are finite numbers
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    sendResponse({ success: false, error: 'x and y must be finite numbers' });
    return;
  }

  let debuggerAttached = false;

  try {
    automationLogger.logActionExecution(null, 'cdpMouseClickAndHold', 'start', { tabId, x, y, holdMs });

    if (keyboardEmulator && keyboardEmulator.isAttachedTo(tabId)) {
      automationLogger.debug('cdpMouseClickAndHold: detaching KeyboardEmulator debugger before attaching', { tabId });
      await keyboardEmulator.detachDebugger(tabId);
    }

    try {
      await chrome.debugger.attach({ tabId }, '1.3');
    } catch (attachErr) {
      if (attachErr.message && attachErr.message.includes('Another debugger is already attached')) {
        automationLogger.debug('cdpMouseClickAndHold: stale debugger detected, force-detaching and retrying', { tabId });
        try { await chrome.debugger.detach({ tabId }); } catch (_e) { /* ignore */ }
        await chrome.debugger.attach({ tabId }, '1.3');
      } else {
        throw attachErr;
      }
    }
    debuggerAttached = true;

    // Mouse pressed
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mousePressed', x, y, button: 'left', clickCount: 1
    });

    // Hold for specified duration
    await new Promise(r => setTimeout(r, holdMs));

    // Mouse released
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased', x, y, button: 'left', clickCount: 1
    });

    await chrome.debugger.detach({ tabId });
    debuggerAttached = false;

    automationLogger.logActionExecution(null, 'cdpMouseClickAndHold', 'complete', { success: true, tabId, x, y, holdMs });
    sendResponse({ success: true, x, y, holdMs });

  } catch (error) {
    automationLogger.logActionExecution(null, 'cdpMouseClickAndHold', 'complete', { success: false, tabId, error: error.message });
    if (debuggerAttached) {
      try { await chrome.debugger.detach({ tabId }); } catch (_e) { /* ignore */ }
    }
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle CDP-based mouse drag from start to end coordinates.
 * Presses at start, moves in steps with linear interpolation, releases at end.
 * @param {Object} request - { startX, startY, endX, endY, steps, stepDelayMs, shiftKey, ctrlKey, altKey }
 * @param {Object} sender - The message sender
 * @param {Function} sendResponse - Function to send response
 */
async function handleCDPMouseDrag(request, sender, sendResponse) {
  const tabId = sender.tab?.id;
  const { startX, startY, endX, endY, shiftKey, ctrlKey, altKey } = request;
  const steps = request.steps || 10;
  const stepDelayMs = request.stepDelayMs || 20;

  if (!tabId) {
    sendResponse({ success: false, error: 'No tab ID available' });
    return;
  }

  // T-181-01: Validate coordinates are finite numbers
  if (!Number.isFinite(startX) || !Number.isFinite(startY) ||
      !Number.isFinite(endX) || !Number.isFinite(endY)) {
    sendResponse({ success: false, error: 'All coordinates must be finite numbers' });
    return;
  }

  let debuggerAttached = false;

  try {
    automationLogger.logActionExecution(null, 'cdpMouseDrag', 'start', { tabId, startX, startY, endX, endY, steps });

    if (keyboardEmulator && keyboardEmulator.isAttachedTo(tabId)) {
      automationLogger.debug('cdpMouseDrag: detaching KeyboardEmulator debugger before attaching', { tabId });
      await keyboardEmulator.detachDebugger(tabId);
    }

    try {
      await chrome.debugger.attach({ tabId }, '1.3');
    } catch (attachErr) {
      if (attachErr.message && attachErr.message.includes('Another debugger is already attached')) {
        automationLogger.debug('cdpMouseDrag: stale debugger detected, force-detaching and retrying', { tabId });
        try { await chrome.debugger.detach({ tabId }); } catch (_e) { /* ignore */ }
        await chrome.debugger.attach({ tabId }, '1.3');
      } else {
        throw attachErr;
      }
    }
    debuggerAttached = true;

    const modifiers = (altKey ? 1 : 0) | (ctrlKey ? 2 : 0) | (shiftKey ? 8 : 0);

    // Mouse pressed at start position
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mousePressed', x: startX, y: startY, button: 'left', clickCount: 1, modifiers
    });

    // Move in steps with linear interpolation
    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      const currentX = startX + (endX - startX) * progress;
      const currentY = startY + (endY - startY) * progress;
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: currentX, y: currentY, button: 'left', modifiers
      });
      if (i < steps) {
        await new Promise(r => setTimeout(r, stepDelayMs));
      }
    }

    // Mouse released at end position
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: endX, y: endY, button: 'left', clickCount: 1, modifiers
    });

    await chrome.debugger.detach({ tabId });
    debuggerAttached = false;

    automationLogger.logActionExecution(null, 'cdpMouseDrag', 'complete', { success: true, tabId, startX, startY, endX, endY, steps });
    sendResponse({ success: true, startX, startY, endX, endY, steps });

  } catch (error) {
    automationLogger.logActionExecution(null, 'cdpMouseDrag', 'complete', { success: false, tabId, error: error.message });
    if (debuggerAttached) {
      try { await chrome.debugger.detach({ tabId }); } catch (_e) { /* ignore */ }
    }
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle CDP-based mouse drag with variable speed between steps.
 * Same as drag but delay per step is randomized between minDelayMs and maxDelayMs.
 * @param {Object} request - { startX, startY, endX, endY, steps, minDelayMs, maxDelayMs }
 * @param {Object} sender - The message sender
 * @param {Function} sendResponse - Function to send response
 */
async function handleCDPMouseDragVariableSpeed(request, sender, sendResponse) {
  const tabId = sender.tab?.id;
  const { startX, startY, endX, endY } = request;
  const steps = request.steps || 20;
  const minDelayMs = request.minDelayMs || 5;
  const maxDelayMs = request.maxDelayMs || 40;

  if (!tabId) {
    sendResponse({ success: false, error: 'No tab ID available' });
    return;
  }

  // T-181-01: Validate coordinates are finite numbers
  if (!Number.isFinite(startX) || !Number.isFinite(startY) ||
      !Number.isFinite(endX) || !Number.isFinite(endY)) {
    sendResponse({ success: false, error: 'All coordinates must be finite numbers' });
    return;
  }

  let debuggerAttached = false;

  try {
    automationLogger.logActionExecution(null, 'cdpMouseDragVariableSpeed', 'start', { tabId, startX, startY, endX, endY, steps });

    if (keyboardEmulator && keyboardEmulator.isAttachedTo(tabId)) {
      automationLogger.debug('cdpMouseDragVariableSpeed: detaching KeyboardEmulator debugger before attaching', { tabId });
      await keyboardEmulator.detachDebugger(tabId);
    }

    try {
      await chrome.debugger.attach({ tabId }, '1.3');
    } catch (attachErr) {
      if (attachErr.message && attachErr.message.includes('Another debugger is already attached')) {
        automationLogger.debug('cdpMouseDragVariableSpeed: stale debugger detected, force-detaching and retrying', { tabId });
        try { await chrome.debugger.detach({ tabId }); } catch (_e) { /* ignore */ }
        await chrome.debugger.attach({ tabId }, '1.3');
      } else {
        throw attachErr;
      }
    }
    debuggerAttached = true;

    // Mouse pressed at start position
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mousePressed', x: startX, y: startY, button: 'left', clickCount: 1
    });

    // Move in steps with variable-speed delays
    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      const currentX = startX + (endX - startX) * progress;
      const currentY = startY + (endY - startY) * progress;
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: currentX, y: currentY, button: 'left'
      });
      if (i < steps) {
        const delay = Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
        await new Promise(r => setTimeout(r, delay));
      }
    }

    // Mouse released at end position
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: endX, y: endY, button: 'left', clickCount: 1
    });

    await chrome.debugger.detach({ tabId });
    debuggerAttached = false;

    automationLogger.logActionExecution(null, 'cdpMouseDragVariableSpeed', 'complete', { success: true, tabId, startX, startY, endX, endY, steps });
    sendResponse({ success: true, startX, startY, endX, endY, steps });

  } catch (error) {
    automationLogger.logActionExecution(null, 'cdpMouseDragVariableSpeed', 'complete', { success: false, tabId, error: error.message });
    if (debuggerAttached) {
      try { await chrome.debugger.detach({ tabId }); } catch (_e) { /* ignore */ }
    }
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle CDP-based mouse wheel event at viewport coordinates.
 * Dispatches a mouseWheel event with specified delta values.
 * @param {Object} request - { x, y, deltaX, deltaY }
 * @param {Object} sender - The message sender
 * @param {Function} sendResponse - Function to send response
 */
async function handleCDPMouseWheel(request, sender, sendResponse) {
  const tabId = sender.tab?.id;
  const { x, y } = request;
  const deltaX = request.deltaX || 0;
  const deltaY = (typeof request.deltaY === 'number') ? request.deltaY : -120;

  if (!tabId) {
    sendResponse({ success: false, error: 'No tab ID available' });
    return;
  }

  // T-181-01: Validate coordinates are finite numbers
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    sendResponse({ success: false, error: 'x and y must be finite numbers' });
    return;
  }

  let debuggerAttached = false;

  try {
    automationLogger.logActionExecution(null, 'cdpMouseWheel', 'start', { tabId, x, y, deltaX, deltaY });

    if (keyboardEmulator && keyboardEmulator.isAttachedTo(tabId)) {
      automationLogger.debug('cdpMouseWheel: detaching KeyboardEmulator debugger before attaching', { tabId });
      await keyboardEmulator.detachDebugger(tabId);
    }

    try {
      await chrome.debugger.attach({ tabId }, '1.3');
    } catch (attachErr) {
      if (attachErr.message && attachErr.message.includes('Another debugger is already attached')) {
        automationLogger.debug('cdpMouseWheel: stale debugger detected, force-detaching and retrying', { tabId });
        try { await chrome.debugger.detach({ tabId }); } catch (_e) { /* ignore */ }
        await chrome.debugger.attach({ tabId }, '1.3');
      } else {
        throw attachErr;
      }
    }
    debuggerAttached = true;

    // Dispatch mouseWheel event
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mouseWheel', x, y, deltaX, deltaY
    });

    await chrome.debugger.detach({ tabId });
    debuggerAttached = false;

    automationLogger.logActionExecution(null, 'cdpMouseWheel', 'complete', { success: true, tabId, x, y, deltaX, deltaY });
    sendResponse({ success: true, x, y, deltaX, deltaY });

  } catch (error) {
    automationLogger.logActionExecution(null, 'cdpMouseWheel', 'complete', { success: false, tabId, error: error.message });
    if (debuggerAttached) {
      try { await chrome.debugger.detach({ tabId }); } catch (_e) { /* ignore */ }
    }
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Direct CDP tool dispatcher for tool-executor.js CDP routing.
 *
 * Called from agent-loop.js via the cdpHandler wrapper:
 *   executeCDPToolDirect({ tool: cdpVerb, params: params }, tabId)
 *
 * Routes each _cdpVerb from tool-definitions.js to the corresponding
 * chrome.debugger CDP commands. Returns a Promise with structured result.
 *
 * Unlike the handleCDP* message-handler functions (which use sendResponse
 * callbacks), this function uses async/await with direct return values.
 *
 * @param {Object} request - { tool: string (cdpVerb), params: Object }
 * @param {number} tabId - Chrome tab ID to execute against
 * @returns {Promise<Object>} { success, method, error?, ... }
 */
async function executeCDPToolDirect(request, tabId) {
  const { tool: verb, params } = request;

  if (!tabId) {
    return { success: false, error: 'No tab ID available' };
  }

  // Helper: attach debugger with force-detach retry on conflict
  async function attachDebugger() {
    // If KeyboardEmulator has the debugger attached to this tab, detach it first
    if (keyboardEmulator && keyboardEmulator.isAttachedTo(tabId)) {
      automationLogger.debug('executeCDPToolDirect: detaching KeyboardEmulator debugger before attaching', { tabId, verb });
      await keyboardEmulator.detachDebugger(tabId);
    }
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
    } catch (attachErr) {
      if (attachErr.message && attachErr.message.includes('Another debugger is already attached')) {
        automationLogger.debug('executeCDPToolDirect: stale debugger detected, force-detaching and retrying', { tabId, verb });
        try { await chrome.debugger.detach({ tabId }); } catch (_e) { /* ignore */ }
        await chrome.debugger.attach({ tabId }, '1.3');
      } else {
        throw attachErr;
      }
    }
  }

  switch (verb) {

    // -----------------------------------------------------------------
    // cdpClickAt: mousePressed + mouseReleased at (x, y) with modifiers
    // -----------------------------------------------------------------
    case 'cdpClickAt': {
      const { x, y, shiftKey, ctrlKey, altKey } = params || {};
      // T-182-01: Validate coordinates are finite numbers
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { success: false, error: 'cdpClickAt: x and y must be finite numbers' };
      }
      let debuggerAttached = false;
      try {
        automationLogger.logActionExecution(null, 'cdpClickAt', 'start', { tabId, x, y });
        await attachDebugger();
        debuggerAttached = true;

        const modifiers = (altKey ? 1 : 0) | (ctrlKey ? 2 : 0) | (shiftKey ? 8 : 0);

        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x, y, button: 'left', clickCount: 1, modifiers
        });
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased', x, y, button: 'left', clickCount: 1, modifiers
        });

        await chrome.debugger.detach({ tabId });
        debuggerAttached = false;

        automationLogger.logActionExecution(null, 'cdpClickAt', 'complete', { success: true, tabId, x, y });
        return { success: true, method: 'cdp_direct', x, y };
      } catch (error) {
        automationLogger.logActionExecution(null, 'cdpClickAt', 'complete', { success: false, tabId, error: error.message });
        return { success: false, error: error.message };
      } finally {
        if (debuggerAttached) {
          try { await chrome.debugger.detach({ tabId }); } catch (_e) { /* ignore */ }
        }
      }
    }

    // -----------------------------------------------------------------
    // cdpClickAndHold: mousePressed, wait holdMs, mouseReleased
    // -----------------------------------------------------------------
    case 'cdpClickAndHold': {
      const { x, y } = params || {};
      const holdMs = (params && params.holdMs) || 5000;
      // T-182-01: Validate coordinates
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { success: false, error: 'cdpClickAndHold: x and y must be finite numbers' };
      }
      let debuggerAttached = false;
      try {
        automationLogger.logActionExecution(null, 'cdpClickAndHold', 'start', { tabId, x, y, holdMs });
        await attachDebugger();
        debuggerAttached = true;

        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x, y, button: 'left', clickCount: 1
        });
        await new Promise(r => setTimeout(r, holdMs));
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased', x, y, button: 'left', clickCount: 1
        });

        await chrome.debugger.detach({ tabId });
        debuggerAttached = false;

        automationLogger.logActionExecution(null, 'cdpClickAndHold', 'complete', { success: true, tabId, x, y, holdMs });
        return { success: true, method: 'cdp_direct', x, y, holdMs };
      } catch (error) {
        automationLogger.logActionExecution(null, 'cdpClickAndHold', 'complete', { success: false, tabId, error: error.message });
        return { success: false, error: error.message };
      } finally {
        if (debuggerAttached) {
          try { await chrome.debugger.detach({ tabId }); } catch (_e) { /* ignore */ }
        }
      }
    }

    // -----------------------------------------------------------------
    // cdpDrag: mousePressed at start, mouseMoved steps, mouseReleased at end
    // -----------------------------------------------------------------
    case 'cdpDrag': {
      const { startX, startY, endX, endY, shiftKey, ctrlKey, altKey } = params || {};
      const steps = (params && params.steps) || 10;
      const stepDelayMs = (params && params.stepDelayMs) || 20;
      // T-182-01: Validate coordinates
      if (!Number.isFinite(startX) || !Number.isFinite(startY) ||
          !Number.isFinite(endX) || !Number.isFinite(endY)) {
        return { success: false, error: 'cdpDrag: all coordinates must be finite numbers' };
      }
      let debuggerAttached = false;
      try {
        automationLogger.logActionExecution(null, 'cdpDrag', 'start', { tabId, startX, startY, endX, endY, steps });
        await attachDebugger();
        debuggerAttached = true;

        const modifiers = (altKey ? 1 : 0) | (ctrlKey ? 2 : 0) | (shiftKey ? 8 : 0);

        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x: startX, y: startY, button: 'left', clickCount: 1, modifiers
        });
        for (let i = 1; i <= steps; i++) {
          const progress = i / steps;
          const currentX = startX + (endX - startX) * progress;
          const currentY = startY + (endY - startY) * progress;
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
            type: 'mouseMoved', x: currentX, y: currentY, button: 'left', modifiers
          });
          if (i < steps) {
            await new Promise(r => setTimeout(r, stepDelayMs));
          }
        }
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased', x: endX, y: endY, button: 'left', clickCount: 1, modifiers
        });

        await chrome.debugger.detach({ tabId });
        debuggerAttached = false;

        automationLogger.logActionExecution(null, 'cdpDrag', 'complete', { success: true, tabId, startX, startY, endX, endY, steps });
        return { success: true, method: 'cdp_direct', startX, startY, endX, endY, steps };
      } catch (error) {
        automationLogger.logActionExecution(null, 'cdpDrag', 'complete', { success: false, tabId, error: error.message });
        return { success: false, error: error.message };
      } finally {
        if (debuggerAttached) {
          try { await chrome.debugger.detach({ tabId }); } catch (_e) { /* ignore */ }
        }
      }
    }

    // -----------------------------------------------------------------
    // cdpDragVariableSpeed: same as cdpDrag but randomized step delays
    // -----------------------------------------------------------------
    case 'cdpDragVariableSpeed': {
      const { startX, startY, endX, endY } = params || {};
      const steps = (params && params.steps) || 20;
      const minDelayMs = (params && params.minDelayMs) || 5;
      const maxDelayMs = (params && params.maxDelayMs) || 40;
      // T-182-01: Validate coordinates
      if (!Number.isFinite(startX) || !Number.isFinite(startY) ||
          !Number.isFinite(endX) || !Number.isFinite(endY)) {
        return { success: false, error: 'cdpDragVariableSpeed: all coordinates must be finite numbers' };
      }
      let debuggerAttached = false;
      try {
        automationLogger.logActionExecution(null, 'cdpDragVariableSpeed', 'start', { tabId, startX, startY, endX, endY, steps });
        await attachDebugger();
        debuggerAttached = true;

        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x: startX, y: startY, button: 'left', clickCount: 1
        });
        for (let i = 1; i <= steps; i++) {
          const progress = i / steps;
          const currentX = startX + (endX - startX) * progress;
          const currentY = startY + (endY - startY) * progress;
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
            type: 'mouseMoved', x: currentX, y: currentY, button: 'left'
          });
          if (i < steps) {
            const delay = Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
            await new Promise(r => setTimeout(r, delay));
          }
        }
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased', x: endX, y: endY, button: 'left', clickCount: 1
        });

        await chrome.debugger.detach({ tabId });
        debuggerAttached = false;

        automationLogger.logActionExecution(null, 'cdpDragVariableSpeed', 'complete', { success: true, tabId, startX, startY, endX, endY, steps });
        return { success: true, method: 'cdp_direct', startX, startY, endX, endY, steps };
      } catch (error) {
        automationLogger.logActionExecution(null, 'cdpDragVariableSpeed', 'complete', { success: false, tabId, error: error.message });
        return { success: false, error: error.message };
      } finally {
        if (debuggerAttached) {
          try { await chrome.debugger.detach({ tabId }); } catch (_e) { /* ignore */ }
        }
      }
    }

    // -----------------------------------------------------------------
    // cdpScrollAt: mouseWheel event at (x, y) with deltaX/deltaY
    // -----------------------------------------------------------------
    case 'cdpScrollAt': {
      const { x, y } = params || {};
      const deltaX = (params && params.deltaX) || 0;
      const deltaY = (params && typeof params.deltaY === 'number') ? params.deltaY : -120;
      // T-182-01: Validate coordinates
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { success: false, error: 'cdpScrollAt: x and y must be finite numbers' };
      }
      let debuggerAttached = false;
      try {
        automationLogger.logActionExecution(null, 'cdpScrollAt', 'start', { tabId, x, y, deltaX, deltaY });
        await attachDebugger();
        debuggerAttached = true;

        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mouseWheel', x, y, deltaX, deltaY
        });

        await chrome.debugger.detach({ tabId });
        debuggerAttached = false;

        automationLogger.logActionExecution(null, 'cdpScrollAt', 'complete', { success: true, tabId, x, y, deltaX, deltaY });
        return { success: true, method: 'cdp_direct', x, y, deltaX, deltaY };
      } catch (error) {
        automationLogger.logActionExecution(null, 'cdpScrollAt', 'complete', { success: false, tabId, error: error.message });
        return { success: false, error: error.message };
      } finally {
        if (debuggerAttached) {
          try { await chrome.debugger.detach({ tabId }); } catch (_e) { /* ignore */ }
        }
      }
    }

    // -----------------------------------------------------------------
    // cdpInsertText: Input.insertText with optional clearFirst
    // -----------------------------------------------------------------
    case 'cdpInsertText': {
      const { text, clearFirst } = params || {};
      if (!text) {
        return { success: false, error: 'cdpInsertText: no text provided' };
      }
      let debuggerAttached = false;
      try {
        automationLogger.logActionExecution(null, 'cdpInsertText', 'start', { tabId, textLength: text.length });
        await attachDebugger();
        debuggerAttached = true;

        if (clearFirst) {
          const isMac = (typeof navigator !== 'undefined' && navigator.userAgent?.includes('Macintosh')) ||
                        (typeof navigator !== 'undefined' && navigator.platform?.includes('Mac'));
          const selectAllModifier = isMac ? 4 : 2;

          // Select all
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
            type: 'keyDown', modifiers: selectAllModifier, key: 'a', code: 'KeyA'
          });
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
            type: 'keyUp', modifiers: selectAllModifier, key: 'a', code: 'KeyA'
          });
          await new Promise(r => setTimeout(r, 200));

          // Delete selected
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
            type: 'keyDown', key: 'Backspace', code: 'Backspace'
          });
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
            type: 'keyUp', key: 'Backspace', code: 'Backspace'
          });
          await new Promise(r => setTimeout(r, 200));
        }

        await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', { text });

        await chrome.debugger.detach({ tabId });
        debuggerAttached = false;

        automationLogger.logActionExecution(null, 'cdpInsertText', 'complete', { success: true, tabId, textLength: text.length });
        return { success: true, method: 'cdp_direct', text, length: text.length };
      } catch (error) {
        automationLogger.logActionExecution(null, 'cdpInsertText', 'complete', { success: false, tabId, error: error.message });
        return { success: false, error: error.message };
      } finally {
        if (debuggerAttached) {
          try { await chrome.debugger.detach({ tabId }); } catch (_e) { /* ignore */ }
        }
      }
    }

    // -----------------------------------------------------------------
    // cdpDoubleClickAt: two rapid clicks with clickCount=2 on second
    // -----------------------------------------------------------------
    case 'cdpDoubleClickAt': {
      const { x, y } = params || {};
      // T-182-01: Validate coordinates
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { success: false, error: 'cdpDoubleClickAt: x and y must be finite numbers' };
      }
      let debuggerAttached = false;
      try {
        automationLogger.logActionExecution(null, 'cdpDoubleClickAt', 'start', { tabId, x, y });
        await attachDebugger();
        debuggerAttached = true;

        // First click
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x, y, button: 'left', clickCount: 1
        });
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased', x, y, button: 'left', clickCount: 1
        });

        // Second click with clickCount=2
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x, y, button: 'left', clickCount: 2
        });
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased', x, y, button: 'left', clickCount: 2
        });

        await chrome.debugger.detach({ tabId });
        debuggerAttached = false;

        automationLogger.logActionExecution(null, 'cdpDoubleClickAt', 'complete', { success: true, tabId, x, y });
        return { success: true, method: 'cdp_direct', x, y };
      } catch (error) {
        automationLogger.logActionExecution(null, 'cdpDoubleClickAt', 'complete', { success: false, tabId, error: error.message });
        return { success: false, error: error.message };
      } finally {
        if (debuggerAttached) {
          try { await chrome.debugger.detach({ tabId }); } catch (_e) { /* ignore */ }
        }
      }
    }

    // -----------------------------------------------------------------
    // Unknown verb
    // -----------------------------------------------------------------
    default:
      return { success: false, error: `Unknown CDP verb: ${verb}` };
  }
}

/**
 * Handle Monaco/CodeMirror editor insert via MAIN world script injection.
 * Bypasses auto-indent by using the editor's native API (executeEdits) directly.
 * @param {Object} request - The request object containing text to insert
 * @param {Object} sender - The message sender
 * @param {Function} sendResponse - Function to send response
 */
async function handleMonacoEditorInsert(request, sender, sendResponse) {
  const tabId = sender.tab?.id;
  const { text } = request;

  if (!tabId || !text) {
    sendResponse({ success: false, error: !tabId ? 'No tab ID' : 'No text provided' });
    return;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [text],
      func: (codeText) => {
        // Attempt 1: Monaco editor API
        if (typeof monaco !== 'undefined' && monaco.editor) {
          const editors = typeof monaco.editor.getEditors === 'function'
            ? monaco.editor.getEditors() : [];
          // Prefer the focused editor, fall back to first
          const editor = editors.find(e => e.hasTextFocus?.()) || editors[0];
          if (editor) {
            const model = editor.getModel();
            if (model) {
              const fullRange = model.getFullModelRange();
              editor.executeEdits('fsb-automation', [{
                range: fullRange,
                text: codeText
              }]);
              // Move cursor to end
              const lastLine = model.getLineCount();
              const lastCol = model.getLineMaxColumn(lastLine);
              editor.setPosition({ lineNumber: lastLine, column: lastCol });
              return { success: true, method: 'monaco_executeEdits' };
            }
          }
          // Fallback: try models directly
          const models = typeof monaco.editor.getModels === 'function'
            ? monaco.editor.getModels() : [];
          if (models.length > 0) {
            const model = models[0];
            const fullRange = model.getFullModelRange();
            model.pushEditOperations([], [{
              range: fullRange,
              text: codeText
            }], () => null);
            return { success: true, method: 'monaco_pushEditOperations' };
          }
        }

        // Attempt 2: CodeMirror 6 API
        const cmElement = document.querySelector('.cm-editor');
        if (cmElement?.cmView?.view) {
          const view = cmElement.cmView.view;
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: codeText }
          });
          return { success: true, method: 'codemirror6_dispatch' };
        }

        return { success: false, error: 'No editor API found on page' };
      }
    });

    const result = results?.[0]?.result;
    if (result?.success) {
      sendResponse(result);
    } else {
      sendResponse({ success: false, error: result?.error || 'Editor API injection returned no result' });
    }
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle listing all tabs
 * @param {Object} request - The request object containing currentWindowOnly flag
 * @param {Object} sender - The message sender
 * @param {Function} sendResponse - Function to send response
 */
async function handleListTabs(request, sender, sendResponse) {
  try {
    const { currentWindowOnly } = request;
    automationLogger.debug('Listing tabs', { currentWindowOnly });
    
    let queryOptions = {};
    if (currentWindowOnly !== false) {
      queryOptions.currentWindow = true;
    }
    
    const tabs = await chrome.tabs.query(queryOptions);
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // PRIVACY: Only return tab titles for context, not URLs or sensitive data
    // Find the requesting session to identify the session tab
    const requestingSession = Array.from(activeSessions.values()).find(session => 
      session.tabId === (sender.tab?.id || currentTab?.id)
    );
    
    const allowedTabs = requestingSession ? (requestingSession.allowedTabs || []) : [];

    const formattedTabs = tabs.map(tab => {
      const isAllowed = allowedTabs.includes(tab.id);
      let domain;
      if (tab.url) {
        try { domain = new URL(tab.url).hostname; } catch { /* skip */ }
      }
      return {
        id: tab.id,
        title: tab.title || 'Untitled Tab',
        isSessionTab: requestingSession && tab.id === requestingSession.originalTabId,
        isAllowedTab: isAllowed,
        isActive: tab.active,
        ...(domain ? { domain } : {}),
      };
    });

    sendResponse({
      success: true,
      tabs: formattedTabs,
      sessionTabId: requestingSession ? requestingSession.originalTabId : null,
      allowedTabs: allowedTabs,
      currentTab: currentTab ? currentTab.id : null,
      totalTabs: formattedTabs.length,
      message: 'Tabs listed. Session and allowed tabs can be controlled via switchToTab.'
    });
    
  } catch (error) {
    automationLogger.error('Error listing tabs', { error: error.message });
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * Handle getting current tab information
 * @param {Object} request - The request object
 * @param {Object} sender - The message sender
 * @param {Function} sendResponse - Function to send response
 */
async function handleGetCurrentTab(request, sender, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab) {
      sendResponse({
        success: true,
        tab: {
          id: tab.id,
          url: tab.url,
          title: tab.title,
          active: tab.active,
          windowId: tab.windowId,
          index: tab.index,
          status: tab.status,
          hasSession: Array.from(activeSessions.values()).some(session => session.tabId === tab.id)
        }
      });
    } else {
      sendResponse({
        success: false,
        error: 'No active tab found'
      });
    }
    
  } catch (error) {
    automationLogger.error('Error getting current tab', { error: error.message });
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * Handle waiting for a tab to load
 * @param {Object} request - The request object containing tabId and timeout
 * @param {Object} sender - The message sender
 * @param {Function} sendResponse - Function to send response
 */
async function handleWaitForTabLoad(request, sender, sendResponse) {
  try {
    const { tabId, timeout = 30000 } = request;
    automationLogger.logTiming(null, 'WAIT', 'tab_load_start', 0, { tabId, timeout });
    
    const startTime = Date.now();
    
    // Check if tab is already loaded
    let tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') {
      sendResponse({
        success: true,
        tabId: tabId,
        loaded: true,
        url: tab.url,
        loadTime: 0
      });
      return;
    }
    
    // Set up listener for tab updates
    const loadPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(updateListener);
        reject(new Error('Tab load timeout'));
      }, timeout);
      
      const updateListener = (updatedTabId, changeInfo, updatedTab) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          clearTimeout(timeoutId);
          chrome.tabs.onUpdated.removeListener(updateListener);
          resolve({
            url: updatedTab.url,
            loadTime: Date.now() - startTime
          });
        }
      };
      
      chrome.tabs.onUpdated.addListener(updateListener);
    });
    
    const result = await loadPromise;
    
    sendResponse({
      success: true,
      tabId: tabId,
      loaded: true,
      url: result.url,
      loadTime: result.loadTime
    });
    
  } catch (error) {
    automationLogger.error('Error waiting for tab load', { error: error.message });
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Global keyboard emulator instance
let keyboardEmulator = null;

/**
 * Initialize keyboard emulator if not already initialized
 */
function initializeKeyboardEmulator() {
  if (!keyboardEmulator) {
    keyboardEmulator = new KeyboardEmulator();
  }
  return keyboardEmulator;
}

/**
 * Handle keyboard emulator actions from content scripts
 * @param {Object} request - The keyboard action request
 * @param {Object} sender - The message sender
 * @param {Function} sendResponse - Response callback
 */
async function handleKeyboardDebuggerAction(request, sender, sendResponse) {
  const emulator = initializeKeyboardEmulator();
  let tabId;

  try {
    const { method, key, keys, text, specialKey, modifiers = {}, delay = 50 } = request;
    tabId = sender.tab.id;

    automationLogger.logActionExecution(null, `keyboard_${method}`, 'start', { tabId, key, specialKey });

    let result;

    switch (method) {
      case 'pressKey':
        if (!key) {
          throw new Error('Key parameter is required for pressKey');
        }
        result = await emulator.pressKey(tabId, key, modifiers);
        break;

      case 'pressKeySequence':
        if (!keys || !Array.isArray(keys)) {
          throw new Error('Keys array is required for pressKeySequence');
        }
        result = await emulator.pressKeySequence(tabId, keys, modifiers, delay);
        break;

      case 'typeText':
        if (!text || typeof text !== 'string') {
          throw new Error('Text parameter is required for typeText');
        }
        result = await emulator.typeText(tabId, text, delay);
        break;

      case 'sendSpecialKey':
        if (!specialKey || typeof specialKey !== 'string') {
          throw new Error('SpecialKey parameter is required for sendSpecialKey');
        }
        result = await emulator.sendSpecialKey(tabId, specialKey);
        break;

      default:
        throw new Error(`Unknown keyboard emulator method: ${method}`);
    }

    // Detach debugger after each operation to avoid blocking other CDP callers
    await emulator.detachDebugger(tabId);

    automationLogger.logActionExecution(null, `keyboard_${method}`, 'complete', { tabId, success: result.success });

    sendResponse({
      success: result.success,
      result: result,
      method: method,
      tabId: tabId
    });

  } catch (error) {
    // Ensure debugger is detached even on error
    if (tabId) {
      try {
        await emulator.detachDebugger(tabId);
      } catch (detachErr) {
        // Ignore detach errors during cleanup
      }
    }
    automationLogger.logActionExecution(null, `keyboard_${request.method}`, 'complete', { success: false, error: error.message });
    sendResponse({
      success: false,
      error: error.message || 'Keyboard emulator action failed',
      method: request.method
    });
  }
}

/**
 * Clean up keyboard emulator resources when tab is closed
 */
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  if (keyboardEmulator && keyboardEmulator.isAttachedTo(tabId)) {
    try {
      await keyboardEmulator.detachDebugger(tabId);
      automationLogger.debug('Cleaned up keyboard emulator for closed tab', { tabId });
    } catch (error) {
      automationLogger.debug('Failed to clean up keyboard emulator', { tabId, error: error.message });
    }
  }
});

// Phase 256 Plan 03 -- visual-session lifecycle cleanup on tab close.
// Deletes any mcpVisualSession:<tabId> storage entry and clears the
// matching mcpVisualDeath:<tabId> alarm to prevent stale state from
// accumulating in chrome.storage.session. Mirrors the existing tab-close
// cleanup pattern (lines 2526, 2584, 12826 -- multiple independent
// listeners per concern, all firing on the same tab-removed event).
chrome.tabs.onRemoved.addListener((tabId) => {
  if (typeof MCPVisualSessionLifecycleUtils === 'undefined') return;
  if (typeof MCPVisualSessionLifecycleUtils.handleVisualSessionLifecycleTabRemoved !== 'function') return;
  Promise.resolve(MCPVisualSessionLifecycleUtils.handleVisualSessionLifecycleTabRemoved(tabId))
    .catch((err) => {
      console.warn('[FSB MCP] handleVisualSessionLifecycleTabRemoved failed (non-blocking):', err && err.message);
    });
});

// Phase 14 Plan 03 (v0.11.0) -- trigger tab-close reap. Independent per-concern
// onRemoved listener (FSB already registers multiple) that scans the trigger
// registry for snapshots bound to the closed tab (target_tab_id) and reaps
// their entry + alarm. Guarded + non-blocking (Promise.resolve(...).catch) so a
// reap failure never disrupts sibling onRemoved concerns (D-07.3 / D-10c).
// Requirements satisfied: LIFE-05 (tab-close reap).
chrome.tabs.onRemoved.addListener((tabId) => {
  if (typeof FsbTriggerLifecycle === 'undefined') return;
  if (typeof FsbTriggerLifecycle.handleTriggerTabRemoved !== 'function') return;
  Promise.resolve(FsbTriggerLifecycle.handleTriggerTabRemoved(tabId))
    .catch((err) => {
      console.warn('[FSB TRG] handleTriggerTabRemoved failed (non-blocking):', err && err.message);
    });
});

/**
 * Clean up keyboard emulator when extension is suspended/unloaded
 */
chrome.runtime.onSuspend.addListener(async () => {
  if (keyboardEmulator) {
    automationLogger.logServiceWorker('suspend', { component: 'keyboard_emulator' });
    try {
      // Get all tabs and detach debugger from each
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        try {
          await keyboardEmulator.detachDebugger(tab.id);
        } catch (error) {
          // Ignore individual cleanup errors during shutdown
        }
      }
    } catch (error) {
      automationLogger.debug('Error during keyboard emulator cleanup', { error: error.message });
    }
  }
});

// Handle action (icon) clicks - open global side panel
chrome.action.onClicked.addListener(async (tab) => {
  armMcpBridge('action.onClicked');
  automationLogger.logInit('sidepanel', 'opening', { windowId: tab.windowId });

  // QT-93i-01 (redo: force-open with welcome state WITHOUT consuming the
  // user-gesture token). The prior attempt (779bbae2 reverted in b7cb5283)
  // awaited chrome.sidePanel.setOptions BEFORE chrome.sidePanel.open, which
  // consumed the gesture and forced open() to reject -> popup-fallback.
  //
  // Fix: create BOTH Promises synchronously (inside the gesture window),
  // then await later. open() is gesture-critical; setOptions() is not, so
  // we await open() first and surface its failure into the popup fallback,
  // then await setOptions() and log only. Per CONTEXT D-02: never block
  // manual open. Defensive typeof guards for Chrome <114 graceful path.
  var setOptionsPromise = null;
  var openPromise = null;

  try {
    if (tab && typeof tab.id === 'number'
        && typeof chrome.sidePanel !== 'undefined'
        && typeof chrome.sidePanel.setOptions === 'function') {
      setOptionsPromise = chrome.sidePanel.setOptions({
        tabId: tab.id,
        enabled: true,
        path: 'ui/sidepanel.html'
      });
    }
  } catch (setErrSync) {
    console.warn('[FSB] QT-93i-01 force-open setOptions threw sync', {
      tabId: tab && tab.id,
      error: setErrSync && setErrSync.message
    });
  }

  try {
    if (typeof chrome.sidePanel !== 'undefined'
        && typeof chrome.sidePanel.open === 'function') {
      openPromise = chrome.sidePanel.open({ windowId: tab.windowId });
    }
  } catch (openErrSync) {
    console.warn('[FSB] QT-93i-01 sidePanel.open threw sync', {
      windowId: tab && tab.windowId,
      error: openErrSync && openErrSync.message
    });
  }

  // Await OPEN first -- gesture-critical. Fail mode is the existing popup
  // fallback. Note: open() was already CREATED synchronously above, so
  // the gesture window is closed by Chrome's open() call site BEFORE any
  // await touches it.
  try {
    if (openPromise) {
      await openPromise;
      automationLogger.logInit('sidepanel', 'ready', { windowId: tab.windowId });
    } else {
      throw new Error('chrome.sidePanel.open unavailable');
    }
  } catch (error) {
    automationLogger.logInit('sidepanel', 'failed', {
      error: error && error.message,
      fallback: 'popup'
    });
    // Fallback to popup window if side panel fails
    chrome.windows.create({
      url: chrome.runtime.getURL('ui/popup.html'),
      type: 'popup',
      width: 400,
      height: 600
    });
  }

  // Await setOptions LAST -- non-gesture-critical, log only.
  try {
    if (setOptionsPromise) await setOptionsPromise;
  } catch (setErr) {
    console.warn('[FSB] QT-93i-01 force-open setOptions failed', {
      tabId: tab && tab.id,
      error: setErr && setErr.message
    });
  }
});

// --- chrome.alarms.onAlarm Listener (MCP reconnect + dom-stream watchdog; agent branch DEPRECATED) ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
  // Phase 256 Plan 03 -- visual-session sliding-window death-timer alarm.
  // Alarm names of the form 'mcpVisualDeath:<tabId>' route to the lifecycle
  // helper which deletes the storage entry and sends the v0.9.36 clear
  // payload to the tab's content script. Survives MV3 SW eviction because
  // chrome.alarms persists across SW lifetime.
  // Requirements satisfied: TIMEOUT-03 (auto-clear) + TIMEOUT-04 (SW-eviction restore).
  if (typeof MCPVisualSessionLifecycleUtils !== 'undefined'
      && alarm
      && typeof alarm.name === 'string'
      && alarm.name.startsWith(MCPVisualSessionLifecycleUtils.MCP_VISUAL_LIFECYCLE_ALARM_PREFIX)) {
    try {
      await MCPVisualSessionLifecycleUtils.handleVisualSessionLifecycleAlarm(alarm);
    } catch (err) {
      console.warn('[FSB MCP] handleVisualSessionLifecycleAlarm failed (non-blocking):', err && err.message);
    }
    return;
  }

  // Phase 14 Plan 03 (v0.11.0) -- trigger alarm tick. Alarm names of the form
  // 'fsbTrigger:<triggerId>' route to the lifecycle helper which re-reads the
  // snapshot from chrome.storage.session (storage-is-truth) and decides against
  // persisted state. Additive branch with an early return so the fan-out stops
  // at the matched concern (mirrors the visual branch above); never throws out
  // of the listener (try/catch + non-blocking warn).
  // Requirements satisfied: SURV-01 (alarm-wake routing to handleTriggerAlarm).
  if (typeof FsbTriggerLifecycle !== 'undefined'
      && alarm
      && typeof alarm.name === 'string'
      && alarm.name.startsWith(FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX)) {
    try {
      const refreshPoll = await fsbTriggerHandleRefreshPollAlarm(alarm);
      if (refreshPoll && refreshPoll.handled) return;
      await FsbTriggerLifecycle.handleTriggerAlarm(alarm);
    } catch (err) {
      console.warn('[FSB TRG] handleTriggerAlarm failed (non-blocking):', err && err.message);
    }
    return;
  }

  if (alarm
      && typeof alarm.name === 'string'
      && alarm.name.startsWith(FSB_TRIGGER_OBSERVE_WATCHDOG_PREFIX)) {
    try {
      await fsbTriggerHandleObserveWatchdog(alarm);
    } catch (err) {
      console.warn('[FSB TRG] live-observe watchdog failed (non-blocking):', err && err.message);
    }
    return;
  }

  // Phase 272 / BEAT-01..02: telemetry beat alarm. The 5-minute alarm
  // survives MV3 SW eviction because it lives in chrome.alarms (not SW
  // memory). When it fires, schedule the collector flush with 0-30s
  // jitter to desynchronize installs (avoids synchronized spikes against
  // https://full-selfbrowsing.com/api/telemetry/events). Defensive
  // try/catch wraps the flush -- a telemetry crash must NEVER kill the
  // alarm dispatcher (threat T-272-04).
  if (alarm && alarm.name === 'fsb-telemetry-beat') {
    setTimeout(function () {
      try {
        if (globalThis.fsbTelemetryCollector && typeof globalThis.fsbTelemetryCollector.flush === 'function') {
          globalThis.fsbTelemetryCollector.flush();
        }
      } catch (_e) { /* swallow per defence in depth */ }
    }, Math.floor(Math.random() * 30000));
    return;
  }

  const isMcpReconnectAlarm =
    typeof MCP_RECONNECT_ALARM !== 'undefined' &&
    alarm.name === MCP_RECONNECT_ALARM;

  if (isMcpReconnectAlarm) {
    armMcpBridge('alarm:' + MCP_RECONNECT_ALARM);
    return;
  }

  // Phase 211-02 STREAM-01: dom-stream watchdog (safety net).
  // Survives SW idle eviction (chrome.alarms.create at periodInMinutes: 1).
  // The content-script self-watchdog is the trip wire; this alarm exists
  // so a wedged content script does not strand the stream silently.
  // Phase 212 owns the agent branch below; this branch slots BEFORE it.
  if (alarm.name === 'fsb-domstream-watchdog') {
    console.log('[FSB DOM] watchdog alarm fired (SW safety net)');
    // Phase 276 STREAM-DEFENSIVE-05 (watchdog auto-resnapshot): if streaming
    // is supposed to be active but the alarm is firing (i.e. the SW just woke
    // and nothing has flushed mutations recently), request a fresh snapshot
    // from the dashboard via the ext:request-snapshot signal. The dashboard
    // routes this through its requestPreviewResync path which re-issues
    // dash:dom-stream-start. Best-effort -- no-op if the WS is offline or
    // _streamingActive is false/undefined.
    try {
      var streamingActive = (typeof _streamingActive !== 'undefined') && !!_streamingActive;
      if (streamingActive
          && typeof fsbWebSocket !== 'undefined'
          && fsbWebSocket
          && fsbWebSocket.connected
          && typeof fsbWebSocket.send === 'function') {
        fsbWebSocket.send('ext:request-snapshot', {
          reason: 'sw-watchdog-tick',
          ts: Date.now()
        });
      }
    } catch (e) {
      console.warn('[FSB DOM] watchdog auto-resnapshot failed (non-blocking):', e && e.message);
    }
    return;
  }

  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
//   const agentId = agentScheduler.getAgentIdFromAlarm(alarm.name);
//   if (!agentId) return; // Not an FSB agent alarm
//
//   console.log('[FSB] Agent alarm fired:', alarm.name);
//
//   try {
//     const agent = await agentManager.getAgent(agentId);
//     if (!agent) {
//       console.warn('[FSB] Agent not found for alarm, clearing:', agentId);
//       await agentScheduler.clearAlarm(agentId);
//       return;
//     }
//
//     if (!agent.enabled) {
//       console.log('[FSB] Agent disabled, skipping:', agentId);
//       return;
//     }
//
//     // Guard against double-runs
//     if (!agentScheduler.isValidAlarmFire(agent)) {
//       console.log('[FSB] Agent alarm fired too soon, skipping:', agentId);
//       return;
//     }
//
//     // Execute the agent
//     const result = await agentExecutor.execute(agent);
//
//     // Record the run
//     const updatedAgent = await agentManager.recordRun(agentId, result);
//
//     // Reschedule daily agents for their next occurrence
//     if (agent.schedule.type === 'daily') {
//       await agentScheduler.rescheduleDaily(updatedAgent);
//     }
//
//     // Disable once-type agents after execution
//     if (agent.schedule.type === 'once') {
//       await agentManager.updateAgent(agentId, { enabled: false });
//       await agentScheduler.clearAlarm(agentId);
//     }
//
//     // Notify any open UI about the run completion
//     chrome.runtime.sendMessage({
//       action: 'agentRunComplete',
//       agentId: agentId,
//       result: {
//         success: result.success,
//         duration: result.duration,
//         error: result.error
//       }
//     }).catch((err) => {
//       console.warn('[FSB] agentRunComplete sendMessage delivery failed', { agentId, error: err && err.message });
//     });
//
//     // Sync to server if enabled
//     if (updatedAgent.syncEnabled && typeof serverSync !== 'undefined') {
//       serverSync.syncRun(updatedAgent, result).catch(err => {
//         console.warn('[FSB] Server sync failed:', err.message);
//       });
//     }
//
//   } catch (error) {
//     console.error('[FSB] Agent alarm handler error:', error.message);
//   }
});

// Phase 6 Plan 06-02 (FINT-07): SW-side startup wiring for the offscreen
// Lattice host (extension/offscreen/lattice-host.js Phase 5 + 06-01).
// Closes audit gap G3 from v0.10.0-MILESTONE-AUDIT.md: SW never opened the
// offscreen document; D-22 deferred that to Phase 6.
// CONTEXT.md post-research amendment: the WORKERS reason value per Chrome
// docs (offscreen page hosts fetch + JS execution -- worker semantics).
// Idempotent on both onInstalled + onStartup -- mirrors the Phase 269
// telemetry-alarm pattern at line 13136.
async function ensureLatticeOffscreen() {
  try {
    if (typeof chrome === 'undefined' || !chrome.offscreen || typeof chrome.offscreen.hasDocument !== 'function') {
      console.warn('[FSB Lattice] chrome.offscreen unavailable; bridge will be inert');
      return;
    }
    const has = await chrome.offscreen.hasDocument();
    if (has) return;
    await chrome.offscreen.createDocument({
      url: 'offscreen/lattice-host.html',
      reasons: ['WORKERS'],
      justification: 'Hosts the Lattice provider bus; calls fetch() to external AI APIs on behalf of the service worker.'
    });
    console.log('[FSB Lattice] offscreen lattice-host opened');
  } catch (err) {
    console.error('[FSB Lattice] offscreen createDocument failed:', err && err.message ? err.message : err);
  }
}
globalThis.ensureLatticeOffscreen = ensureLatticeOffscreen;

// Set up side panel behavior
chrome.runtime.onInstalled.addListener(async () => {
  automationLogger.logInit('extension', 'installed', { version: chrome.runtime.getManifest().version });

  // Initialize analytics
  initializeAnalytics();

  // Phase 6 Plan 06-02 (FINT-07): open offscreen Lattice host idempotently.
  // Fire-and-forget; the helper's try/catch handles all errors.
  ensureLatticeOffscreen();

  // Phase 269 / IDENT-01, IDENT-02: lazy-mint or reuse the install UUID.
  // Idempotent across both onInstalled and onStartup. Module guarantees no
  // throw on storage error -- defensive try/catch logs only if a regression
  // breaks that guarantee.
  try {
    const seededUuid = await globalThis.fsbInstallIdentity.getOrCreateInstallUuid();
    if (seededUuid) {
      console.log('[FSB Telemetry] Install UUID seeded');
    }
  } catch (e) {
    console.error('[FSB Telemetry] Install UUID seed failed:', e && e.message);
  }

  // Phase 272 / BEAT-02: register the 5-minute telemetry beat alarm.
  // Idempotent -- chrome.alarms.create with the same name replaces, so this
  // is safe to call from BOTH onInstalled and onStartup. The alarm lives in
  // the Chrome alarms registry, not SW memory, so it survives MV3 eviction.
  try {
    chrome.alarms.create('fsb-telemetry-beat', { periodInMinutes: 5 });
  } catch (e) {
    console.error('[FSB Telemetry] alarm create failed:', e && e.message);
  }

  // Phase 272 / BEAT-06: install_announce. 30s setTimeout (NOT a chrome.alarm
  // -- the minimum alarm period is 30s but the 30s grace before announce is
  // a one-shot per install, not a recurring beat). Enqueue + flush invokes
  // the collector once. The collector's enqueue() resolves the partial input
  // ({event_type:'install_announce'}) into the full 9-field payload, so we
  // do NOT construct the shape here (keeps the static-grep gate meaningful).
  setTimeout(async function () {
    try {
      if (globalThis.fsbTelemetryCollector
          && typeof globalThis.fsbTelemetryCollector.enqueue === 'function'
          && typeof globalThis.fsbTelemetryCollector.flush === 'function') {
        await globalThis.fsbTelemetryCollector.enqueue({ event_type: 'install_announce' });
        await globalThis.fsbTelemetryCollector.flush();
      }
    } catch (_e) { /* swallow per defence in depth */ }
  }, 30000);

  // Load debug mode setting
  await loadDebugMode();

  // Set default UI mode if not set
  const { uiMode } = await chrome.storage.local.get(['uiMode']);
  if (!uiMode) {
    await chrome.storage.local.set({ uiMode: 'sidepanel' });
    automationLogger.debug('Default UI mode set to sidepanel', {});
  }

  // Configure side panel to open automatically on action click
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    automationLogger.debug('Side panel behavior configured', { autoOpen: true });
  } catch (error) {
    automationLogger.debug('Side panel API not available', { chromeVersion: 'below 114' });
  }

  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // Reschedule all background agents (retired in v0.9.45rc1)
  // agentScheduler.rescheduleAllAgents();

  // Connect to local MCP bridge (auto-reconnects if server not running yet)
  armMcpBridge('runtime.onInstalled');

  // Connect to dashboard relay (auto-reconnects with backoff)
  fsbWebSocket.connect();
});

// Initialize analytics and restore sessions on startup
chrome.runtime.onStartup.addListener(async () => {
  automationLogger.logServiceWorker('startup', {});
  initializeAnalytics();
  // Phase 6 Plan 06-02 (FINT-07): re-open offscreen Lattice host idempotently on SW wake.
  ensureLatticeOffscreen();
  // Phase 269 / IDENT-01, IDENT-02: idempotent get-or-create on every SW wake.
  // Returns the existing UUID after first install -- no re-mint.
  try {
    const seededUuid = await globalThis.fsbInstallIdentity.getOrCreateInstallUuid();
    if (seededUuid) {
      console.log('[FSB Telemetry] Install UUID seeded');
    }
  } catch (e) {
    console.error('[FSB Telemetry] Install UUID seed failed:', e && e.message);
  }
  // Phase 272 / BEAT-02: idempotent alarm registration on every SW wake.
  // chrome.alarms.create with the same name replaces -- safe to call again.
  // This is the SW-eviction recovery path: if Chrome evicted the SW and the
  // alarm registry somehow lost the entry, onStartup re-arms it.
  try {
    chrome.alarms.create('fsb-telemetry-beat', { periodInMinutes: 5 });
  } catch (e) {
    console.error('[FSB Telemetry] alarm create failed:', e && e.message);
  }
  // Load debug mode setting
  await loadDebugMode();
  // Restore sessions from storage so stop button works after service worker restart
  await restoreSessionsFromStorage();
  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // Reschedule all background agents (retired in v0.9.45rc1)
  // agentScheduler.rescheduleAllAgents();

  // Connect to local MCP bridge (auto-reconnects if server not running yet)
  armMcpBridge('runtime.onStartup');

  // Connect to dashboard relay (auto-reconnects with backoff)
  fsbWebSocket.connect();
});

// Listen for debug mode changes so toggling takes effect immediately
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.debugMode) {
    fsbDebugMode = changes.debugMode.newValue === true;
    console.log('[FSB] Debug mode ' + (fsbDebugMode ? 'enabled' : 'disabled'));
  }

  // React to dashboard sync toggle -- connect/disconnect relay WebSocket immediately
  if (namespace === 'local' && changes.serverSyncEnabled) {
    if (changes.serverSyncEnabled.newValue) {
      fsbWebSocket.connect();
    } else {
      fsbWebSocket.disconnect();
    }
  }

  // PERF: Update cached DOM settings in active sessions when changed
  if (namespace === 'local') {
    const domKeys = ['domOptimization', 'maxDOMElements', 'prioritizeViewport'];
    const hasDomChange = domKeys.some(key => key in changes);
    if (hasDomChange) {
      for (const [, session] of activeSessions) {
        if (session.domSettings) {
          if ('domOptimization' in changes) session.domSettings.domOptimization = changes.domOptimization.newValue;
          if ('maxDOMElements' in changes) session.domSettings.maxDOMElements = changes.maxDOMElements.newValue;
          if ('prioritizeViewport' in changes) session.domSettings.prioritizeViewport = changes.prioritizeViewport.newValue;
        }
      }
    }
  }
});

// =====================================================================
// Phase 211-03 LOG-04: exportDiagnostics handler (back-end only).
// Phase 213's Sync tab will wire a button to call this. Phase 211 ships
// the contract; no UI in this milestone (D-08).
//
// Request:  { action: 'exportDiagnostics', clear?: boolean }
// Response: { ok: true, entries: [...], clearedAt: <ts>|null }
//        |  { ok: false, error: '<reason>' }
// =====================================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.action === 'exportDiagnostics') {
    const wantsClear = !!(request && request.clear === true);
    if (typeof globalThis !== 'undefined'
        && globalThis.fsbDiagnostics
        && typeof globalThis.fsbDiagnostics.get === 'function') {
      globalThis.fsbDiagnostics.get({ clear: wantsClear }).then((result) => {
        sendResponse({
          ok: true,
          entries: (result && result.entries) ? result.entries : [],
          clearedAt: (result && result.clearedAt) ? result.clearedAt : null
        });
      }).catch((err) => {
        sendResponse({
          ok: false,
          error: (err && err.message) ? err.message : 'unknown'
        });
      });
      return true; // keep sendResponse open for async resolution
    }
    sendResponse({ ok: false, error: 'fsbDiagnostics not loaded' });
    return false;
  }
  return false; // other listeners handle other actions
});
