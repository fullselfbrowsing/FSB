/**
 * Agent Loop Engine for FSB v0.9.50
 *
 * Core tool_use protocol loop that replaces startAutomationLoop.
 * Each iteration is a separate setTimeout callback (not a blocking while-loop)
 * to survive Chrome MV3's 5-minute service worker kill.
 *
 * Uses Phase 135/136 modules:
 *   - tool-definitions.js: TOOL_REGISTRY for tool definitions
 *   - tool-use-adapter.js: format/parse for provider-specific tool_use messages
 *   - tool-executor.js: executeTool for unified tool dispatch
 *   - universal-provider.js: UniversalProvider for API calls
 *
 * Exports: runAgentLoop, runAgentIteration, buildSystemPrompt, callProviderWithTools
 *
 * @module agent-loop
 */

'use strict';

// Chrome extension importScripts-compatible loading
if (typeof importScripts !== 'undefined') {
  // These are already loaded by background.js, but declare dependency explicitly
  // in case agent-loop.js is loaded standalone in tests or other contexts
  try {
    if (typeof TOOL_REGISTRY === 'undefined') importScripts('ai/tool-definitions.js');
    if (typeof formatToolsForProvider === 'undefined') importScripts('ai/tool-use-adapter.js');
    if (typeof executeTool === 'undefined') importScripts('ai/tool-executor.js');
    if (typeof UniversalProvider === 'undefined') importScripts('ai/universal-provider.js');
  } catch (_e) {
    // Already loaded -- ignore
  }
  // Phase 156-158 modules
  try {
    if (typeof CostTracker === 'undefined') importScripts('ai/cost-tracker.js');
    if (typeof TranscriptStore === 'undefined') importScripts('ai/transcript-store.js');
    if (typeof HookPipeline === 'undefined') importScripts('ai/hook-pipeline.js');
    if (typeof createTurnResult === 'undefined') importScripts('ai/turn-result.js');
    if (typeof ActionHistory === 'undefined') importScripts('ai/action-history.js');
    if (typeof SESSION_DEFAULTS === 'undefined') importScripts('ai/engine-config.js');
    if (typeof PermissionContext === 'undefined') importScripts('ai/permission-context.js');
    if (typeof createSafetyBreakerHook === 'undefined') importScripts('ai/hooks/safety-hooks.js');
    if (typeof createPermissionHook === 'undefined') importScripts('ai/hooks/permission-hook.js');
    if (typeof createToolProgressHook === 'undefined') importScripts('ai/hooks/progress-hook.js');
    if (typeof GoalProgressTracker === 'undefined') importScripts('ai/goal-progress-tracker.js');
  } catch (_e) {
    // Already loaded -- ignore
  }
}

// Node.js require for testing -- use var to avoid redeclaration with tool-executor.js in shared scope
var _al_toolDefs, _al_adapter, _al_executor, _al_provider;
if (typeof require !== 'undefined') {
  try {
    _al_toolDefs = require('./tool-definitions.js');
    _al_adapter = require('./tool-use-adapter.js');
    _al_executor = require('./tool-executor.js');
    _al_provider = require('./universal-provider.js');
  } catch (_e) {
    // Running in Chrome extension context -- globals already available
  }
}

// Phase 156-158 Node.js require for testing
var _al_costTracker, _al_transcriptStore, _al_hookPipeline, _al_turnResult, _al_actionHistory, _al_engineConfig, _al_permCtx, _al_safetyHooks, _al_permHook, _al_progressHook, _al_goalProgress;
if (typeof require !== 'undefined') {
  try {
    _al_costTracker = require('./cost-tracker.js');
    _al_transcriptStore = require('./transcript-store.js');
    _al_hookPipeline = require('./hook-pipeline.js');
    _al_turnResult = require('./turn-result.js');
    _al_actionHistory = require('./action-history.js');
    _al_engineConfig = require('./engine-config.js');
    _al_permCtx = require('./permission-context.js');
    _al_safetyHooks = require('./hooks/safety-hooks.js');
    _al_permHook = require('./hooks/permission-hook.js');
    _al_progressHook = require('./hooks/progress-hook.js');
    _al_goalProgress = require('./goal-progress-tracker.js');
  } catch (_e) {
    // Running in Chrome extension context
  }
}

// Phase 227-02: GoalProgressTracker references for both Chrome (globals) and Node.
var _al_GoalProgressTracker = (typeof GoalProgressTracker !== 'undefined')
  ? GoalProgressTracker
  : (_al_goalProgress?.GoalProgressTracker || null);
var _al_getGoalProgressOverrideThreshold = (typeof getGoalProgressOverrideThreshold !== 'undefined')
  ? getGoalProgressOverrideThreshold
  : (_al_goalProgress?.getOverrideThreshold || function () { return 8; });

// Resolve references for both Chrome (globals) and Node (require)
// Use var throughout to avoid const/let redeclaration errors in importScripts shared scope
var _al_TOOL_REGISTRY = (typeof TOOL_REGISTRY !== 'undefined') ? TOOL_REGISTRY : (_al_toolDefs?.TOOL_REGISTRY || []);
var _formatToolsForProvider = (typeof formatToolsForProvider !== 'undefined') ? formatToolsForProvider : (_al_adapter?.formatToolsForProvider || (() => []));
var _parseToolCalls = (typeof parseToolCalls !== 'undefined') ? parseToolCalls : (_al_adapter?.parseToolCalls || (() => []));
var _formatToolResult = (typeof formatToolResult !== 'undefined') ? formatToolResult : (_al_adapter?.formatToolResult || (() => ({})));
var _isToolCallResponse = (typeof isToolCallResponse !== 'undefined') ? isToolCallResponse : (_al_adapter?.isToolCallResponse || (() => false));
var _formatAssistantMessage = (typeof formatAssistantMessage !== 'undefined') ? formatAssistantMessage : (_al_adapter?.formatAssistantMessage || (() => ({})));
var _extractUsage = (typeof extractUsage !== 'undefined') ? extractUsage : (_al_adapter?.extractUsage || (() => ({ input: 0, output: 0 })));
var _executeTool = (typeof executeTool !== 'undefined') ? executeTool : (_al_executor?.executeTool || (async () => ({ success: false, error: 'executeTool not available' })));
var _UniversalProvider = (typeof UniversalProvider !== 'undefined') ? UniversalProvider : (_al_provider?.UniversalProvider || null);
var _PROVIDER_CONFIGS = (typeof PROVIDER_CONFIGS !== 'undefined') ? PROVIDER_CONFIGS : (_al_provider?.PROVIDER_CONFIGS || {});

// Phase 156-158 module references
var _al_estimateCost = (typeof estimateCost !== 'undefined') ? estimateCost : (_al_costTracker?.estimateCost || function() { return 0; });
var _al_CostTracker = (typeof CostTracker !== 'undefined') ? CostTracker : (_al_costTracker?.CostTracker || null);
var _al_TranscriptStore = (typeof TranscriptStore !== 'undefined') ? TranscriptStore : (_al_transcriptStore?.TranscriptStore || null);
var _al_estimateTokens = (typeof estimateTokens !== 'undefined') ? estimateTokens : (_al_transcriptStore?.estimateTokens || function() { return 0; });
var _al_HookPipeline = (typeof HookPipeline !== 'undefined') ? HookPipeline : (_al_hookPipeline?.HookPipeline || null);
var _al_LIFECYCLE_EVENTS = (typeof LIFECYCLE_EVENTS !== 'undefined') ? LIFECYCLE_EVENTS : (_al_hookPipeline?.LIFECYCLE_EVENTS || {});
var _al_createTurnResult = (typeof createTurnResult !== 'undefined') ? createTurnResult : (_al_turnResult?.createTurnResult || function() { return {}; });
var _al_STOP_REASONS = (typeof STOP_REASONS !== 'undefined') ? STOP_REASONS : (_al_turnResult?.STOP_REASONS || {});
var _al_ActionHistory = (typeof ActionHistory !== 'undefined') ? ActionHistory : (_al_actionHistory?.ActionHistory || null);
var _al_createActionEvent = (typeof createActionEvent !== 'undefined') ? createActionEvent : (_al_actionHistory?.createActionEvent || function(f) { return f || {}; });
var _al_SESSION_DEFAULTS = (typeof SESSION_DEFAULTS !== 'undefined') ? SESSION_DEFAULTS : (_al_engineConfig?.SESSION_DEFAULTS || {});
var _al_loadSessionConfig = (typeof loadSessionConfig !== 'undefined') ? loadSessionConfig : (_al_engineConfig?.loadSessionConfig || async function() { return {}; });
var _al_PermissionContext = (typeof PermissionContext !== 'undefined') ? PermissionContext : (_al_permCtx?.PermissionContext || null);
var _al_createSafetyBreakerHook = (typeof createSafetyBreakerHook !== 'undefined') ? createSafetyBreakerHook : (_al_safetyHooks?.createSafetyBreakerHook || null);
var _al_createStuckDetectionHook = (typeof createStuckDetectionHook !== 'undefined') ? createStuckDetectionHook : (_al_safetyHooks?.createStuckDetectionHook || null);
var _al_createPermissionHook = (typeof createPermissionHook !== 'undefined') ? createPermissionHook : (_al_permHook?.createPermissionHook || null);
var _al_createToolProgressHook = (typeof createToolProgressHook !== 'undefined') ? createToolProgressHook : (_al_progressHook?.createToolProgressHook || null);
var _al_createIterationProgressHook = (typeof createIterationProgressHook !== 'undefined') ? createIterationProgressHook : (_al_progressHook?.createIterationProgressHook || null);
var _al_createCompletionProgressHook = (typeof createCompletionProgressHook !== 'undefined') ? createCompletionProgressHook : (_al_progressHook?.createCompletionProgressHook || null);

// ---------------------------------------------------------------------------
// Phase 233: Meta-cognitive attempt tracking.
//
// Source-of-truth-independent loop detection: counts mutation tool attempts
// directly from the LLM's per-iteration toolCalls (not from session.actionHistory,
// which has known recording gaps). Threshold: warn at 4, force-stop at 6
// attempts on the same target within a 12-iteration sliding window.
// ---------------------------------------------------------------------------
var _META_INTERACT_TOOLS = {
  click: 1, click_at: 1, double_click: 1, double_click_at: 1,
  type_text: 1, press_enter: 1, press_key: 1, clear_input: 1,
  select_option: 1, check_box: 1, hover: 1, focus: 1,
  drag_drop: 1, drag: 1, click_and_hold: 1, drag_variable_speed: 1,
  execute_js: 1, fill_credential: 1
};
var _META_WARN_THRESHOLD = 4;
var _META_FORCE_STOP_THRESHOLD = 6;
var _META_WINDOW_ITERATIONS = 12;

function _extractMetaTargetKey(call) {
  if (!call || !call.args) return null;
  var a = call.args;
  if (a.selector) return 'sel:' + String(a.selector).slice(0, 80);
  if (a.elementId) return 'id:' + String(a.elementId).slice(0, 40);
  if (a.element_id) return 'id:' + String(a.element_id).slice(0, 40);
  if (call.name === 'execute_js' && a.code) {
    var code = String(a.code);
    var m = code.match(/querySelector(?:All)?\s*\(\s*['"`]([^'"`]+)['"`]/);
    if (m) return 'sel:' + m[1].slice(0, 80);
    m = code.match(/getElementById\s*\(\s*['"`]([^'"`]+)['"`]/);
    if (m) return 'id:' + m[1].slice(0, 40);
    return 'js:' + code.replace(/\s+/g, ' ').slice(0, 60);
  }
  if (a.text) return 'text:' + String(a.text).slice(0, 60);
  if (a.url) return 'url:' + String(a.url).slice(0, 80);
  if (a.key) return 'key:' + String(a.key);
  return null;
}

function _trackMetaAttempt(session, call, iterNum) {
  if (!_META_INTERACT_TOOLS[call.name]) return null;
  var key = _extractMetaTargetKey(call);
  if (!key) return null;
  if (!session._metaAttempts) session._metaAttempts = {};
  if (!session._metaAttempts[key]) session._metaAttempts[key] = [];
  session._metaAttempts[key].push({ iteration: iterNum, tool: call.name, timestamp: Date.now() });
  // Window-prune: keep only attempts within the last N iterations.
  var pruned = session._metaAttempts[key].filter(function(a) {
    return iterNum - a.iteration <= _META_WINDOW_ITERATIONS;
  });
  session._metaAttempts[key] = pruned;
  if (pruned.length >= _META_FORCE_STOP_THRESHOLD) {
    return { forceStop: true, target: key, attempts: pruned };
  }
  if (pruned.length >= _META_WARN_THRESHOLD) {
    return { forceStop: false, target: key, attempts: pruned };
  }
  return null;
}
var _al_createErrorProgressHook = (typeof createErrorProgressHook !== 'undefined') ? createErrorProgressHook : (_al_progressHook?.createErrorProgressHook || null);


// ---------------------------------------------------------------------------
// Safety Breakers (SAFE-01, SAFE-02) -- kept for hook factory closure params
// ---------------------------------------------------------------------------

/**
 * Check cost and time safety limits before each iteration.
 * Called at the START of runAgentIteration, BEFORE the API call.
 * Kept in this file because safety-hooks.js receives it via closure factory.
 *
 * @param {Object} session - Session object with agentState and safetyConfig
 * @returns {{ shouldStop: boolean, reason: string|null }}
 */
function checkSafetyBreakers(session) {
  var state = session.agentState || {};

  // Iteration circuit breaker. session.maxIterations is set by every entry
  // point (background.js autopilot, MCP agent, dashboard-remote), typically
  // 15-25. Previously this value was only used for the overlay label
  // ("Step N/20") and never enforced, letting hallucination loops run for
  // 96+ iterations. Enforce it here so stuck/narration-only runs end deterministically.
  var iterLimit = session.maxIterations
    || (session.safetyConfig && session.safetyConfig.maxIterations)
    || _al_SESSION_DEFAULTS.maxIterations
    || 20;
  var iterCount = state.iterationCount || 0;
  if (iterCount >= iterLimit) {
    return {
      shouldStop: true,
      reason: 'Session iteration count (' + iterCount + ') reached limit (' + iterLimit + '). Stopping automation.'
    };
  }

  // Cost circuit breaker REMOVED in Phase 231 per operator request — iteration
  // limit (above) and time limit (below) are sufficient gates. CostTracker
  // continues to record totals for analytics; checkBudget() always returns
  // exceeded=false now and is intentionally not called here.

  // Time limit (SAFE-02, D-02)
  var timeLimit = (session.safetyConfig && session.safetyConfig.timeLimit) || _al_SESSION_DEFAULTS.timeLimit || 600000;
  var elapsed = Date.now() - (state.startTime || Date.now());
  if (elapsed >= timeLimit) {
    var minutes = Math.floor(elapsed / 60000);
    return {
      shouldStop: true,
      reason: 'Session duration (' + minutes + ' min) exceeded limit (' + Math.floor(timeLimit / 60000) + ' min). Stopping automation.'
    };
  }

  return { shouldStop: false, reason: null };
}


// ---------------------------------------------------------------------------
// Stuck Detection (SAFE-03, D-03, P8)
// ---------------------------------------------------------------------------

/**
 * Detect whether the AI is stuck (consecutive tool calls with no DOM change).
 * Called AFTER tool execution, BEFORE scheduling the next iteration.
 *
 * @param {Object} session - Session object with agentState and actionHistory
 * @param {Array<{callId: string, name: string, result: Object}>} toolResults - Results from this iteration
 * @returns {{ isStuck: boolean, hint: string|null }}
 */
function detectStuck(session, toolResults) {
  const state = session.agentState || {};
  var stuckThreshold = _al_SESSION_DEFAULTS.stuckThreshold || 3;
  var forceStopThreshold = _al_SESSION_DEFAULTS.stuckForceStopThreshold || 5;

  // Phase 227-01: strict CONSECUTIVE-same-fingerprint thresholds
  // Independent of the existing windowed isRepetitive heuristic below.
  // warn at 3 consecutive identical mutation tuples, force-stop at 5.
  var actionRepeatWarnThreshold = 3;
  var actionRepeatForceStopThreshold = 5;

  // Resolve STUCK_REASONS via the require shim used elsewhere in this file
  // (extension context attaches via window/globals; Node uses _al_turnResult).
  var STUCK_REASONS = (typeof _al_turnResult !== 'undefined' && _al_turnResult && _al_turnResult.STUCK_REASONS)
    ? _al_turnResult.STUCK_REASONS
    : (typeof globalThis !== 'undefined' && globalThis.STUCK_REASONS)
      ? globalThis.STUCK_REASONS
      : { ACTION_REPETITION: 'stuck_action_repetition', NO_GOAL_PROGRESS: 'stuck_no_goal_progress', DOM_HASH: 'stuck_dom_hash' };

  // --- Read-only tools that never change the page ---
  var READ_ONLY_TOOLS = {
    read_page: true, get_text: true, get_attribute: true, read_sheet: true,
    get_dom_snapshot: true, get_page_snapshot: true, get_site_guide: true,
    report_progress: true, get_logs: true, search_memory: true
  };

  // --- 1. hadEffect check (existing logic, unchanged) ---
  var anyEffect = toolResults.some(function(tr) {
    return tr.result && tr.result.hadEffect === true;
  });

  if (anyEffect) {
    state.consecutiveNoChangeCount = 0;
  } else {
    state.consecutiveNoChangeCount = (state.consecutiveNoChangeCount || 0) + 1;
  }

  // --- 2. Action repetition detection ---
  // Build a fingerprint for mutation tools in this iteration.
  // Fingerprint = sorted list of "toolName:target" for non-read-only tools.
  var mutationParts = [];
  for (var i = 0; i < toolResults.length; i++) {
    var tr = toolResults[i];
    if (READ_ONLY_TOOLS[tr.name]) continue;
    var target = '';
    if (tr.args) {
      target = tr.args.selector || tr.args.elementId || tr.args.element_id || '';
      if (!target && tr.args.code) {
        // For execute_js, use first 40 chars of code as fingerprint
        target = String(tr.args.code).substring(0, 40);
      }
    }
    mutationParts.push(tr.name + ':' + target);
  }
  var fingerprint = mutationParts.sort().join('|') || '_read_only_';

  if (!state.actionFingerprints) state.actionFingerprints = [];
  state.actionFingerprints.push(fingerprint);
  // Keep last 20 fingerprints
  if (state.actionFingerprints.length > 20) {
    state.actionFingerprints = state.actionFingerprints.slice(-20);
  }

  // Phase 227-01: strict consecutive-same-fingerprint counter.
  // Skips the read-only sentinel so pure-read iterations don't count
  // toward action-repetition force-stop. A single different fingerprint
  // RESETS the counter to 1 (e.g. A,A,A,B,A => counter at 1, not 4).
  if (fingerprint !== '_read_only_') {
    if (state.lastFingerprint === fingerprint) {
      state.consecutiveSameFingerprintCount = (state.consecutiveSameFingerprintCount || 0) + 1;
    } else {
      state.consecutiveSameFingerprintCount = 1;
    }
    state.lastFingerprint = fingerprint;
  }

  // Check repetition: count how many of the last 10 fingerprints match the current one
  var windowSize = Math.min(state.actionFingerprints.length, 10);
  var recent = state.actionFingerprints.slice(-windowSize);
  var matchCount = 0;
  for (var j = 0; j < recent.length; j++) {
    if (recent[j] === fingerprint) matchCount++;
  }
  // Repetitive if 60%+ of recent iterations have same fingerprint and window >= 5
  var isRepetitive = windowSize >= 5 && (matchCount / windowSize) >= 0.6;

  // Phase 227-01: strict consecutive-repetition signal (independent path).
  var consecCount = state.consecutiveSameFingerprintCount || 0;
  var isActionRepetition = consecCount >= actionRepeatWarnThreshold;

  // --- Phase 227-02: Goal-progress unique-state-vector tracker ---
  // Lazily initialise the tracker on the session. Record this iteration's
  // (url, focusedElementId, actionOutcomeKey) signals BEFORE evaluating
  // precedence. The actual goalStuck decision is consulted AFTER the
  // action-repetition path so the more specific signal always wins.
  var goalStuck = false;
  var goalWindowSize = 8;
  if (_al_GoalProgressTracker) {
    if (!session.goalProgressTracker) {
      session.goalProgressTracker = new _al_GoalProgressTracker();
    }
    // Source url: prefer session.lastKnownUrl, then last toolResult with a url field.
    var gpUrl = session.lastKnownUrl || null;
    if (!gpUrl) {
      for (var u = toolResults.length - 1; u >= 0; u--) {
        var trU = toolResults[u];
        var maybeUrl = (trU && trU.result && (trU.result.url || trU.result.currentUrl)) || (trU && trU.args && trU.args.url) || null;
        if (maybeUrl) { gpUrl = maybeUrl; break; }
      }
    }
    // Source focusedElementId + actionOutcomeKey: last MUTATION toolResult.
    var gpFocused = null;
    var gpOutcomeKey = null;
    for (var v = toolResults.length - 1; v >= 0; v--) {
      var trV = toolResults[v];
      if (!trV || READ_ONLY_TOOLS[trV.name]) continue;
      var fid = '';
      if (trV.args) {
        fid = trV.args.selector || trV.args.elementId || trV.args.element_id || '';
      }
      gpFocused = fid || null;
      var success = !!(trV.result && trV.result.success);
      var hadEffect = !!(trV.result && trV.result.hadEffect);
      gpOutcomeKey = trV.name + ':' + (success ? 'ok' : 'err') + ':' + (hadEffect ? 'fx' : 'nf');
      break;
    }
    var iterForTracker = state.iterationCount || session.iterationCount || (state.actionFingerprints ? state.actionFingerprints.length : 0);
    session.goalProgressTracker.record({
      iteration: iterForTracker,
      url: gpUrl,
      focusedElementId: gpFocused,
      actionOutcomeKey: gpOutcomeKey
    });
    var taskTypeForGoal = session.taskType || (session.agentState && session.agentState.taskType) || null;
    goalWindowSize = _al_getGoalProgressOverrideThreshold(taskTypeForGoal);
    goalStuck = !session.goalProgressTracker.hasProgressed(iterForTracker, goalWindowSize);
    // Reset goal-progress warning counter on actual progress.
    if (!goalStuck) {
      state.goalProgressWarningCount = 0;
    }
  }

  // --- 3. Determine stuck state ---
  var isStuckByNoChange = state.consecutiveNoChangeCount >= stuckThreshold;
  var isStuck = isStuckByNoChange || isRepetitive || isActionRepetition || goalStuck;

  if (!isStuck) {
    // Not stuck -- reset warning + consecutive counter
    if (state.stuckWarningCount > 0 && !isRepetitive) {
      state.stuckWarningCount = 0;
    }
    return { isStuck: false, shouldForceStop: false, reasonCode: null, hint: null };
  }

  // Phase 227-01: strict consecutive-repetition takes precedence over the
  // windowed/no-change paths so attribution is the most specific reason.
  if (isActionRepetition) {
    if (consecCount >= actionRepeatForceStopThreshold) {
      return {
        isStuck: true,
        shouldForceStop: true,
        reasonCode: STUCK_REASONS.ACTION_REPETITION,
        hint: 'AUTOMATION FORCE-STOPPED (stuck_action_repetition): repeated identical action ' +
          fingerprint + ' for ' + consecCount + ' consecutive iterations. ' +
          'The current approach cannot complete this task. Session terminated.'
      };
    }
    var severityAR = consecCount >= 4 ? 'CRITICAL' : 'WARNING';
    return {
      isStuck: true,
      shouldForceStop: false,
      reasonCode: STUCK_REASONS.ACTION_REPETITION,
      hint: severityAR + ' (stuck_action_repetition ' + consecCount + '/' + actionRepeatForceStopThreshold + '): ' +
        'repeated identical action ' + fingerprint + '. ' +
        'Try a different selector, tool, or strategy NOW. ' +
        '(1) Use execute_js with framework-specific event dispatching. ' +
        '(2) Try a different selector or elementId. ' +
        '(3) Use keyboard navigation (press_key Tab/Enter/ArrowDown). ' +
        '(4) Skip this sub-task or call fail_task if impossible.'
    };
  }

  // Phase 227-02: goal-progress check runs AFTER action-repetition (precedence
  // rule -- action-repetition is the more specific signal so it wins when both
  // fire). Window grace period (default 8 iterations, or 16 for form_fill) is
  // already baked into goalStuck, so we warn at the first hit and force-stop
  // at the second consecutive hit.
  if (goalStuck) {
    state.goalProgressWarningCount = (state.goalProgressWarningCount || 0) + 1;
    var goalForceStop = state.goalProgressWarningCount >= 2;
    return {
      isStuck: true,
      shouldForceStop: goalForceStop,
      reasonCode: STUCK_REASONS.NO_GOAL_PROGRESS,
      hint: (goalForceStop ? 'AUTOMATION FORCE-STOPPED' : 'WARNING') +
        ' (stuck_no_goal_progress): no new URLs/focused-elements/distinct-outcomes recorded in last ' +
        goalWindowSize + ' iterations. The current strategy is not advancing toward the goal. ' +
        'Try: (1) navigate to a different URL, (2) read the page to confirm what state you\'re in, ' +
        '(3) use a fundamentally different tool, or (4) call fail_task if blocked.'
    };
  }

  // --- 4. Escalating warnings + force stop ---
  state.stuckWarningCount = (state.stuckWarningCount || 0) + 1;

  // Build context about what the model has been doing
  var history = session.actionHistory || [];
  var recentEntries = history.slice(-5);
  var recentActions = recentEntries.map(function(entry) {
    var paramStr = entry.params?.selector || entry.params?.text || entry.params?.url || '';
    return paramStr ? (entry.tool + '(' + paramStr + ')') : entry.tool;
  });

  var reason = isRepetitive
    ? 'Repeating the same actions on the same elements'
    : 'No visible page changes from tool calls';

  // Force stop after threshold warnings
  if (state.stuckWarningCount >= forceStopThreshold) {
    return {
      isStuck: true,
      shouldForceStop: true,
      reasonCode: STUCK_REASONS.DOM_HASH,
      hint: 'AUTOMATION FORCE-STOPPED: ' + reason + ' for ' +
        state.stuckWarningCount + ' consecutive checks (' +
        (state.stuckWarningCount * stuckThreshold) + '+ iterations). ' +
        'Recent actions: [' + recentActions.join(', ') + ']. ' +
        'The current approach cannot complete this task. Session terminated.'
    };
  }

  // Escalating severity
  var severity = state.stuckWarningCount >= 3 ? 'CRITICAL' : 'WARNING';
  var hint = severity + ' (stuck check ' + state.stuckWarningCount + '/' + forceStopThreshold + '): ' +
    reason + '. Recent actions: [' + recentActions.join(', ') + ']. ' +
    'Your actions are NOT changing the page state. You MUST try a fundamentally different approach NOW: ' +
    '(1) Use execute_js with React/framework-specific event dispatching (e.g. el.dispatchEvent(new Event("input", {bubbles:true}))). ' +
    '(2) Navigate to a completely different URL or use a different website. ' +
    '(3) Use keyboard navigation (press_key Tab/Enter/ArrowDown) instead of click. ' +
    '(4) If this sub-task is impossible, skip it and move to the next step. ' +
    '(5) If the entire task is impossible with current tools, call fail_task with a clear explanation.';

  return { isStuck: true, shouldForceStop: false, reasonCode: STUCK_REASONS.DOM_HASH, hint: hint };
}


const TURN_WINDOW_MESSAGES = 12;
const TURN_WINDOW_SUMMARY_LINES = 8;
const TURN_WINDOW_SUMMARY_CHARS = 1800;

function truncatePromptWindowText(value, maxChars = TURN_WINDOW_SUMMARY_CHARS) {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : String(value);
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function isToolResultMessage(message) {
  return message?.role === 'tool' ||
    (Array.isArray(message?.content) && message.content.some(block => block.type === 'tool_result')) ||
    (Array.isArray(message?.parts) && message.parts.some(part => part.functionResponse));
}

function hasToolCallMessage(message) {
  return Array.isArray(message?.tool_calls) ||
    (Array.isArray(message?.content) && message.content.some(block => block.type === 'tool_use')) ||
    (Array.isArray(message?.parts) && message.parts.some(part => part.functionCall));
}

function getPromptWindowStart(messages) {
  let startIndex = Math.max(0, messages.length - TURN_WINDOW_MESSAGES);

  while (startIndex > 0 && isToolResultMessage(messages[startIndex])) {
    startIndex--;
  }

  if (startIndex > 0 && isToolResultMessage(messages[startIndex - 1])) {
    while (startIndex > 0 && isToolResultMessage(messages[startIndex - 1])) {
      startIndex--;
    }
    if (startIndex > 0 && hasToolCallMessage(messages[startIndex - 1])) {
      startIndex--;
    }
  }

  return startIndex;
}

function summarizePromptWindowMessage(message) {
  if (!message || typeof message !== 'object') {
    return '';
  }

  if (message.role === 'tool') {
    const toolName = message.name || 'unknown_tool';
    let status = 'completed';
    try {
      const parsed = typeof message.content === 'string' ? JSON.parse(message.content) : message.content;
      status = parsed?.success === false ? 'error' : 'success';
    } catch (_error) {
      status = typeof message.content === 'string' && message.content.includes('error') ? 'error' : 'success';
    }
    return `${toolName} returned ${status}`;
  }

  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    const toolNames = message.tool_calls
      .map(call => call.function?.name || null)
      .filter(Boolean);
    return `Assistant requested tools: ${toolNames.join(', ')}`;
  }

  if (Array.isArray(message.content)) {
    const toolNames = message.content
      .filter(block => block.type === 'tool_use')
      .map(block => block.name)
      .filter(Boolean);
    if (toolNames.length > 0) {
      return `Assistant requested tools: ${toolNames.join(', ')}`;
    }
    const textBlock = message.content.find(block => block.type === 'text' && typeof block.text === 'string');
    if (textBlock?.text) {
      return `${message.role || 'message'}: ${truncatePromptWindowText(textBlock.text, 120)}`;
    }
  }

  if (Array.isArray(message.parts)) {
    const functionNames = message.parts
      .map(part => part.functionCall?.name || part.functionResponse?.name || null)
      .filter(Boolean);
    if (functionNames.length > 0) {
      return `${message.role || 'message'}: ${functionNames.join(', ')}`;
    }
    const textPart = message.parts.find(part => typeof part.text === 'string');
    if (textPart?.text) {
      return `${message.role || 'message'}: ${truncatePromptWindowText(textPart.text, 120)}`;
    }
  }

  if (typeof message.content === 'string') {
    return `${message.role || 'message'}: ${truncatePromptWindowText(message.content, 120)}`;
  }

  return `${message.role || 'message'} update`;
}

function buildTurnMessages(session) {
  const messages = Array.isArray(session.messages) ? session.messages : [];
  const systemMessage = messages.find(message => message.role === 'system') || {
    role: 'system',
    content: buildSystemPrompt(session.task, 'unknown')
  };
  const nonSystemMessages = messages.filter(message => message.role !== 'system');
  const startIndex = getPromptWindowStart(nonSystemMessages);
  const olderMessages = nonSystemMessages.slice(0, startIndex);
  const recentMessages = nonSystemMessages.slice(startIndex).map(cloneAgentMessage).filter(Boolean);
  const summaryParts = [];
  const persistedSummary = session.resumeSummary || session.agentResumeState?.historySummary || null;

  if (persistedSummary) {
    summaryParts.push(persistedSummary);
  }

  const olderSummaryLines = olderMessages
    .slice(-TURN_WINDOW_SUMMARY_LINES)
    .map(summarizePromptWindowMessage)
    .filter(Boolean);

  if (olderSummaryLines.length > 0) {
    summaryParts.push(`Earlier turns omitted ${olderMessages.length} message(s).\n${olderSummaryLines.join('\n')}`);
  }

  const turnMessages = [cloneAgentMessage(systemMessage)];
  const historySummary = truncatePromptWindowText(summaryParts.filter(Boolean).join('\n'), TURN_WINDOW_SUMMARY_CHARS);

  if (historySummary) {
    turnMessages.push({
      role: 'user',
      content: `Earlier automation context:\n${historySummary}`
    });
  }

  turnMessages.push(...recentMessages);
  return turnMessages;
}


// ---------------------------------------------------------------------------
// getPublicTools -- strip internal routing metadata from tool definitions
// ---------------------------------------------------------------------------

/**
 * Get all tool definitions suitable for sending to the AI provider.
 * Strips internal routing metadata (_route, _readOnly, _contentVerb, _cdpVerb).
 *
 * @returns {Array<{name: string, description: string, inputSchema: Object}>}
 */
function getPublicTools() {
  return _al_TOOL_REGISTRY.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema
  }));
}


// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

/**
 * Build a minimal system prompt for the agent loop.
 * Per D-05/D-06/D-07: ~1-2KB, no site guides, no conversation history instructions.
 *
 * Verified Phase 183: includes task, pageUrl, CRITICAL RULES (narration-only, execute_js escape hatch)
 *
 * @param {string} task - The user's task description
 * @param {string} pageUrl - Current page URL
 * @returns {string} System prompt string
 */
function buildSystemPrompt(task, pageUrl) {
  return `You are a browser automation agent. Your job is to COMPLETE the user's task end-to-end, not just browse.

TASK: ${task}
CURRENT PAGE: ${pageUrl}

WORKFLOW -- follow these steps in order:
1. Navigate to the relevant page if not already there.
2. Use read_page to extract the actual text content of the page. This is how you read what's on screen.
3. Use get_page_snapshot ONLY when you need to find element selectors for clicking or typing.
4. Perform actions (click, type, scroll, select_option) to interact with the page.
5. If the task involves collecting data: use read_page to extract ALL data, scroll and read again for more.
6. If the task involves entering data into Google Sheets: open a new sheet (navigate to sheets.google.com/create), then use fill_sheet with CSV data.
7. Use report_progress to keep the user informed of what you are doing.
8. Call complete_task with a summary when the FULL task is done.
9. Call partial_task when useful work is already complete but the remaining step is blocked and the user can still benefit from a preserved handoff.
10. Auth/manual blockers that should usually end with partial_task after useful work is done include: login required, no saved credentials, user skipped login, credentials failed, manual approval, MFA, and external verification.
11. If the runtime offers one saved-credential or operator-prompt attempt, preserve the auth blocker details and let that single attempt happen first. Call partial_task only after that attempt is unavailable, skipped, exhausted, or fails.
12. For partial_task, preserve three things explicitly: what you completed, the exact blocker that stopped the last step, and the manual next step the user should take to finish or resume. Use reason values like blocked, auth_required, credentials_missing, user_skipped_login, credentials_failed, or manual_approval.
13. Call fail_task with a reason only when there is no useful completed work to preserve.

CRITICAL RULES:
- report_progress is NARRATION ONLY. It does NOT click, type, navigate, submit, or change the page in any way. To perform an action you MUST call the action tool itself (click, type_text, press_enter, select_option, navigate, etc.). If a turn contains only report_progress / read_page / get_page_snapshot / get_dom_snapshot, you have done NOTHING -- call a real action tool before narrating again.
- If click or type_text fails with "obscured", "zero dimensions", or similar, use execute_js to run the action directly via JavaScript (e.g., execute_js({code: "document.querySelector('selector').click()"})).
- Do NOT stop after just navigating and scrolling. That is only the first step.
- Do NOT end your turn with a text message. Always call complete_task, partial_task, or fail_task when done.
- Do NOT turn auth walls into generic failure text when useful work was already completed. Preserve the handoff with partial_task.
- Do NOT keep retrying auth. One bounded saved-credential or operator-prompt attempt is enough when available.
- Do NOT invent broad autonomous sign-in flows, credential recovery loops, or brute-force MFA/manual approval steps.
- Treat MFA, manual approval, email verification, and similar external gates as manual handoff blockers unless the runtime already resolved them.
- read_page gives you the actual text content (titles, descriptions, data to extract).
- get_page_snapshot gives you DOM element IDs and selectors (for click/type targets).
- For data collection: scroll through ALL results, reading each page of content.
- For Google Sheets entry: use fill_sheet tool with startCell and csvData parameters.
- When on Google Sheets, call fill_sheet directly. Do NOT interact with Tables sidebar or any overlays.
- Execute autonomously. Do not ask the user questions.`;
}

function cloneAgentMessage(message) {
  if (!message || typeof message !== 'object') {
    return message || null;
  }

  try {
    return JSON.parse(JSON.stringify(message));
  } catch (_error) {
    return message;
  }
}

function buildFollowUpBoundaryMessage(followUpContext) {
  const previousTask = followUpContext?.previousTask
    ? `PREVIOUS TASK: ${followUpContext.previousTask}\n`
    : '';

  return `[FOLLOW-UP COMMAND]
${previousTask}NEW TASK: ${followUpContext?.newTask || ''}
Continue from the existing automation context when it is still relevant. Re-check the live page before acting if the UI may have changed.`;
}

function isAuthWallPartialReason(reason) {
  var normalized = typeof reason === 'string' ? reason.trim().toLowerCase() : '';
  return normalized === 'auth_required'
    || normalized === 'credentials_missing'
    || normalized === 'user_skipped_login'
    || normalized === 'credentials_failed'
    || normalized === 'manual_approval';
}

function beginInlineContinuationPause(session, continuation) {
  session._continuationPause = {
    kind: continuation?.kind || 'continuation',
    reason: continuation?.reason || null,
    summary: continuation?.summary || null,
    blocker: continuation?.blocker || null,
    nextStep: continuation?.nextStep || null,
    startedAt: Date.now()
  };
  session.lastIterationTime = Date.now();
}

function clearInlineContinuationPause(session) {
  session._continuationPause = null;
}

function buildInlineContinuationBoundaryMessage(continuation) {
  if (continuation?.kind === 'auth_resolution') {
    var note = continuation.note ? `NOTE: ${continuation.note}\n` : '';
    return `[RESUME SAME SESSION]
AUTH RESOLUTION UPDATE: Sign-in appears successful and the current page may now be authenticated.
${note}Continue the SAME task from the current page. Re-read the page, verify the gated action is now available, and only then finish the task.`;
  }

  return '[RESUME SAME SESSION]\nContinue the same task from the current page.';
}

function resumeInlineContinuation(session, continuation) {
  clearInlineContinuationPause(session);
  session.messages.push({
    role: 'user',
    content: continuation?.boundaryMessage || buildInlineContinuationBoundaryMessage(continuation)
  });
  session.lastIterationTime = Date.now();
}

function hydrateAgentRunState(session, systemPrompt) {
  const resumeState = session.agentResumeState || {};
  const hadExistingMessages = Array.isArray(session.messages) && session.messages.length > 0;
  const restoredMessages = Array.isArray(resumeState.recentMessages)
    ? resumeState.recentMessages.map(cloneAgentMessage).filter(Boolean)
    : [];

  if (hadExistingMessages) {
    const nonSystemMessages = session.messages.filter((message, index) => !(index === 0 && message?.role === 'system'));
    session.messages = [{ role: 'system', content: systemPrompt }, ...nonSystemMessages];
  } else {
    session.messages = [{ role: 'system', content: systemPrompt }, ...restoredMessages];
  }

  if (!hadExistingMessages) {
    session.resumeSummary = session.resumeSummary || resumeState.historySummary || null;
  } else if (session.isRestored) {
    session.resumeSummary = session.resumeSummary || resumeState.historySummary || null;
  } else if (!session.resumeSummary) {
    session.resumeSummary = null;
  }

  if (session.followUpContext) {
    session.messages.push({
      role: 'user',
      content: buildFollowUpBoundaryMessage(session.followUpContext)
    });
    session.followUpContext = null;
  }

  const restoredAgentState = session.agentState || resumeState.agentState || {};
  session.agentState = {
    iterationCount: 0,
    completedIterations: restoredAgentState.completedIterations || 0,
    totalInputTokens: restoredAgentState.totalInputTokens || session.totalInputTokens || 0,
    totalOutputTokens: restoredAgentState.totalOutputTokens || session.totalOutputTokens || 0,
    totalCost: restoredAgentState.totalCost || session.totalCost || 0,
    startTime: Date.now(),
    lastDOMHash: null,
    consecutiveNoChangeCount: 0
  };

  session.totalInputTokens = session.agentState.totalInputTokens;
  session.totalOutputTokens = session.agentState.totalOutputTokens;
  session.totalCost = session.agentState.totalCost;
  session.isRestored = false;

  // ADOPT-04: Instantiate ActionHistory per session
  if (_al_ActionHistory) {
    session._actionHistory = new _al_ActionHistory();
    if (Array.isArray(session.actionHistory) && session.actionHistory.length > 0) {
      session._actionHistory.hydrate(session.actionHistory);
    }
  }

  if (!Array.isArray(session.tools) || session.tools.length === 0) {
    session.tools = getPublicTools();
  }

  return session;
}

function hydrateCostTracker(session) {
  if (!_al_CostTracker) return;

  var costLimit = (session.safetyConfig && session.safetyConfig.costLimit)
    || _al_SESSION_DEFAULTS.costLimit || 2.00;
  session._costTracker = new _al_CostTracker(costLimit);
  // Hydrate from warm state (accumulated cost from previous iterations/restores)
  session._costTracker.totalCost = session.totalCost || 0;
  session._costTracker.totalInputTokens = session.totalInputTokens || 0;
  session._costTracker.totalOutputTokens = session.totalOutputTokens || 0;
}


// ---------------------------------------------------------------------------
// Gemini message format converter
// ---------------------------------------------------------------------------

/**
 * Convert standard {role, content} messages to Gemini's {role, parts} format.
 * Handles text messages, tool_use blocks, and tool_result blocks.
 *
 * @param {Object} msg - Standard message {role, content}
 * @returns {Object} Gemini-formatted message
 */
function convertToGeminiFormat(msg) {
  // Tool result messages (role: 'user' with tool_result content or role: 'tool')
  if (msg.role === 'tool' || (Array.isArray(msg.content) && msg.content.some(b => b.type === 'tool_result'))) {
    // Already in Gemini format (from formatToolResult)
    if (msg.parts) return msg;

    // Convert from OpenAI tool format
    if (msg.role === 'tool') {
      return {
        role: 'user',
        parts: [{
          functionResponse: {
            name: msg.name || '',
            response: typeof msg.content === 'string' ? { result: msg.content } : msg.content
          }
        }]
      };
    }

    // Convert Anthropic tool_result format
    const resultParts = (msg.content || []).filter(b => b.type === 'tool_result').map(b => ({
      functionResponse: {
        name: b.name || '',
        response: typeof b.content === 'string' ? { result: b.content } : b.content
      }
    }));
    return { role: 'user', parts: resultParts.length > 0 ? resultParts : [{ text: JSON.stringify(msg.content) }] };
  }

  // Assistant/model messages with tool calls
  if (msg.role === 'assistant' || msg.role === 'model') {
    // Already in Gemini format
    if (msg.parts) return { role: 'model', parts: msg.parts };

    // Has tool_calls (OpenAI format)
    if (msg.tool_calls) {
      const parts = msg.tool_calls.map(tc => ({
        functionCall: {
          name: tc.function.name,
          args: typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : tc.function.arguments
        }
      }));
      if (msg.content) parts.unshift({ text: msg.content });
      return { role: 'model', parts };
    }

    // Has content array (Anthropic format)
    if (Array.isArray(msg.content)) {
      const parts = msg.content.map(block => {
        if (block.type === 'tool_use') {
          return { functionCall: { name: block.name, args: block.input || {} } };
        }
        return { text: block.text || JSON.stringify(block) };
      });
      return { role: 'model', parts };
    }

    return { role: 'model', parts: [{ text: msg.content || '' }] };
  }

  // User messages
  if (msg.role === 'user') {
    if (msg.parts) return msg;
    return { role: 'user', parts: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }] };
  }

  // System messages should be filtered out before calling this
  return { role: 'user', parts: [{ text: msg.content || '' }] };
}


// ---------------------------------------------------------------------------
// callProviderWithTools
// ---------------------------------------------------------------------------

/**
 * Make an API call with tool definitions to the configured provider.
 * Builds a provider-specific request body and uses UniversalProvider.sendRequest.
 *
 * NOTE: This builds the request body manually (not via buildRequest) because
 * buildRequest is designed for text completions, not tool_use conversations.
 *
 * @param {Object} providerInstance - UniversalProvider instance
 * @param {string} model - Model name
 * @param {string} apiKey - API key (unused, kept for interface consistency)
 * @param {Array<Object>} messages - Conversation history
 * @param {Array<Object>} tools - Public tool definitions
 * @param {string} providerKey - Provider identifier ('xai','openai','anthropic','gemini','openrouter','custom')
 * @returns {Promise<Object>} Raw API response object
 */
async function callProviderWithTools(providerInstance, model, apiKey, messages, tools, providerKey) {
  const formattedTools = _formatToolsForProvider(tools, providerKey);

  let requestBody;

  switch (providerKey) {
    case 'anthropic': {
      // Anthropic: system prompt separate, messages without system, tools as top-level
      const systemMsg = messages.find(m => m.role === 'system');
      const conversationMsgs = messages.filter(m => m.role !== 'system');

      // CTX-04 / D-14: Enable prompt caching for system prompt and tool definitions
      const systemContent = systemMsg ? systemMsg.content : '';
      const cachedSystem = [{
        type: 'text',
        text: systemContent,
        cache_control: { type: 'ephemeral' }
      }];

      // Mark last tool definition for caching (Anthropic caches up to the marked block)
      const cachedTools = formattedTools.map((tool, i) => {
        if (i === formattedTools.length - 1) {
          return { ...tool, cache_control: { type: 'ephemeral' } };
        }
        return tool;
      });

      // Anthropic rejects empty `messages`. On the first agent-loop iteration the
      // task lives in the system prompt and conversationMsgs is []; seed a starter
      // user turn so the request is valid.
      const seededAnthropicMsgs = conversationMsgs.length > 0
        ? conversationMsgs
        : [{ role: 'user', content: 'Begin.' }];

      requestBody = {
        model,
        system: cachedSystem,
        messages: seededAnthropicMsgs,
        tools: cachedTools,
        max_tokens: 4096
      };
      break;
    }

    case 'gemini': {
      // Gemini: contents array (no system role), systemInstruction, tools
      const systemMsg = messages.find(m => m.role === 'system');
      const nonSystemMsgs = messages.filter(m => m.role !== 'system');
      // Gemini rejects empty `contents` with 400 "contents is not specified".
      // On the first agent-loop iteration the task lives in the system prompt
      // (mapped to systemInstruction) and nonSystemMsgs is []; seed a starter
      // user turn so the request is valid. Fixes issue #29.
      let geminiContents = nonSystemMsgs.map(convertToGeminiFormat);
      if (geminiContents.length === 0) {
        geminiContents = [{ role: 'user', parts: [{ text: 'Begin.' }] }];
      }
      requestBody = {
        contents: geminiContents,
        tools: formattedTools,
        systemInstruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
        generationConfig: {
          temperature: 0
        }
      };
      break;
    }

    default: {
      // OpenAI/xAI/OpenRouter/Custom: standard messages + tools format.
      // max_tokens: match Anthropic's 4096 budget so the model has room for
      // multi-tool responses (report_progress + click + type_text in one turn).
      // Without this, xAI defaulted to a tight internal limit (~87 tokens/iter)
      // causing the model to truncate after report_progress and never emit click.
      // NOTE: tool_choice intentionally omitted -- xAI returns 400 for it,
      // which crashes the iteration loop via unhandled throw in UniversalProvider.
      // The default behavior (auto) applies when tools are present.
      requestBody = {
        model,
        messages,
        tools: formattedTools,
        temperature: 0,
        max_tokens: 4096
      };
      break;
    }
  }

  // Phase 7 (FINT-09): Lattice provider bridge is the UNCONDITIONAL
  // provider call path. The Phase 6 feature flag has been removed; the
  // legacy fallback to the providerInstance HTTP-send method is deleted.
  // universal-provider.js stays on disk (Strategy B per Phase 7
  // CONTEXT.md) to keep providerInstance.getEndpoint() logging at
  // line ~1211 and the providerInstance.config / providerInstance.settings
  // metadata reads below working. Physical archive deferred to v0.11.0+.
  //
  // Phase 6 WR-03 -- baseUrl is ONLY honored by the offscreen handler's
  // computeUrl() for 'custom' and 'lmstudio'. For 'openai' (and the other
  // first-party providers xai/anthropic/gemini/openrouter) computeUrl
  // hardcodes the full URL and never reads config.baseUrl. Do not pass
  // a baseUrl for those providers to avoid an unused-arg / silent-contract-
  // mismatch footgun. If openai-proxy support is needed (Azure shim,
  // llm-proxy, etc.), it must be added to computeUrl in a follow-on phase.
  var _cfg = providerInstance.config || {};
  var _settings = providerInstance.settings || {};
  return executeViaBridge(providerKey, {
    apiKey: _settings[_cfg.keyField] || '',
    model: providerInstance.model,
    baseUrl: providerKey === 'custom' ? _settings.customEndpoint
           : providerKey === 'lmstudio' ? ((_settings.lmstudioBaseUrl || 'http://localhost:1234').replace(/\/+$/, '') + '/v1')
           : undefined,
  }, requestBody, { mode: 'autopilot' });
}


// ---------------------------------------------------------------------------
// runAgentLoop
// ---------------------------------------------------------------------------

// Phase 240 D-02 NOTE: agent-loop.js does NOT dispatch through
// extension/ws/mcp-tool-dispatcher.js -- it runs inline in the SW after
// handleStartAutomation has already created the session. The legacy:autopilot
// agentId synthesis + bindTab happen at handleStartAutomation's D-08 4th site
// (extension/background.js, just before the success sendResponse). Therefore
// no synthesis call is needed in agent-loop.js itself; the autopilot fallback
// is covered upstream. If a future plan moves autopilot dispatch through
// dispatchMcpToolRoute, the agentId on the session record (sessionData) is
// the authoritative source for threading agentId + ownershipToken into
// outgoing MCP tool envelopes.
//
// Phase 240 WR-03 CARVE-OUT (documented gap, deferred to Phase 244):
// Inline tool actions issued by the autopilot loop (click, type, navigate,
// etc.) execute via direct content-script messaging and CDP, NOT via
// dispatchMcpToolRoute. Consequently they bypass checkOwnershipGate. The
// "single chokepoint" claim in CONTEXT.md D-06 holds only for MCP-bridge-
// originated tools. This is mitigated at session start (handleStartAutomation
// binds the tab to legacy:autopilot or the caller-supplied agentId), but if
// an external client force-rebinds the tab mid-session (e.g., via an MCP
// open_tab from another agent), the autopilot loop will keep acting on a
// tab it no longer owns -- there is no per-iteration enforcement point.
// Phase 244 hardening should add a sync isOwnedBy check at iteration setup
// using sessionData.agentId + sessionData.ownershipToken, and abort with a
// typed tab_owned_by_other_agent error when the gate would have blocked.

/**
 * Entry point for the agent loop. Called from handleStartAutomation.
 * Initializes session state and kicks off the first iteration.
 *
 * @param {string} sessionId - Session identifier
 * @param {Object} options - Background.js callbacks and dependencies
 * @param {Map} options.activeSessions - Map of sessionId -> session object
 * @param {Function} options.persistSession - (sessionId, session) => Promise<void>
 * @param {Function} options.sendSessionStatus - (tabId, statusData) => Promise<void>
 * @param {Function} options.broadcastDashboardProgress - (session) => void
 * @param {Function} options.endSessionOverlays - (session, reason) => Promise<void>
 * @param {Function} options.startKeepAlive - () => void
 * @param {Function|null} options.executeCDPToolDirect - CDP handler callback
 * @param {Function|null} options.handleDataTool - Data tool handler callback
 */
async function runAgentLoop(sessionId, options) {
  const { activeSessions, persistSession: persist, sendSessionStatus: sendStatus, startKeepAlive, hooks } = options;

  const session = activeSessions.get(sessionId);
  if (!session) {
    console.error('[AgentLoop] Session not found:', sessionId);
    return;
  }

  try {
    // Get current tab URL
    let tabUrl = '';
    try {
      const tab = await chrome.tabs.get(session.tabId);
      tabUrl = tab?.url || '';
    } catch (_e) {
      tabUrl = 'unknown';
    }

    // Initialize safety thresholds via engine-config (SAFE-01, SAFE-02)
    try {
      var sessionConfig = await _al_loadSessionConfig(session.mode || 'autopilot');
      session.safetyConfig = {
        costLimit: sessionConfig.costLimit || _al_SESSION_DEFAULTS.costLimit || 2.00,
        timeLimit: sessionConfig.timeLimit || _al_SESSION_DEFAULTS.timeLimit || 600000
      };
    } catch (_e) {
      // Fallback to defaults if storage unavailable
      session.safetyConfig = {
        costLimit: _al_SESSION_DEFAULTS.costLimit || 2.00,
        timeLimit: _al_SESSION_DEFAULTS.timeLimit || 600000
      };
    }

    // Build the current-command system prompt and hydrate any persisted thread state.
    const systemPrompt = buildSystemPrompt(session.task, tabUrl);
    hydrateAgentRunState(session, systemPrompt);
    hydrateCostTracker(session);

    // Get provider configuration from chrome.storage.local (where options page saves them)
    let settings = {};
    try {
      const stored = await chrome.storage.local.get([
        'provider', 'modelProvider', 'modelName', 'model',
        'apiKey', 'openaiApiKey', 'anthropicApiKey', 'geminiApiKey', 'openrouterApiKey', 'customApiKey',
        'customEndpoint', 'lmstudioBaseUrl'
      ]);
      settings = stored || {};
    } catch (_e) {
      console.warn('[AgentLoop] Could not read provider settings from storage');
    }

    const persistedProviderConfig = session.providerConfig || session.agentResumeState?.providerConfig || {};

    // Resolve provider key
    const providerKey = persistedProviderConfig.providerKey || settings.modelProvider || settings.provider || 'xai';
    const modelName = persistedProviderConfig.model || settings.modelName || settings.model || (providerKey === 'lmstudio' ? '' : 'grok-4-1-fast');

    if (providerKey === 'lmstudio' && !modelName) {
      throw new Error('LM Studio model not configured. Select a discovered model in Settings.');
    }

    // Create or reuse the session provider instance
    let providerInstance = session.providerConfig?.providerInstance || null;
    if (!providerInstance ||
        session.providerConfig?.providerKey !== providerKey ||
        session.providerConfig?.model !== modelName) {
      providerInstance = new (_UniversalProvider)({
        modelProvider: providerKey,
        modelName: modelName,
        ...settings
      });
    }

    // Cache provider config in session for reuse across iterations
    const providerConfig = _PROVIDER_CONFIGS[providerKey] || {};
    session.providerConfig = {
      providerKey,
      model: modelName,
      apiKey: providerConfig.keyField ? (settings[providerConfig.keyField] || '') : '',
      providerInstance
    };

    // Ensure keep-alive is running
    if (typeof startKeepAlive === 'function') {
      startKeepAlive();
    }

    console.log('[AgentLoop] Starting agent loop', {
      sessionId,
      provider: providerKey,
      model: modelName,
      toolCount: session.tools.length,
      resumedMessages: Math.max(0, (session.messages?.length || 1) - 1),
      hasResumeSummary: !!session.resumeSummary,
      tabUrl: tabUrl.substring(0, 80),
      endpoint: providerInstance.getEndpoint()
    });

    // Kick off the first iteration
    runAgentIteration(sessionId, options);

  } catch (error) {
    console.error('[AgentLoop] Failed to initialize agent loop:', error);
    session.status = 'error';
    session.error = error.message;
    if (typeof options.endSessionOverlays === 'function') {
      await options.endSessionOverlays(session, 'error');
    }
    await persist(sessionId, session);
  }
}


// ---------------------------------------------------------------------------
// runAgentIteration
// ---------------------------------------------------------------------------

/**
 * Execute one iteration of the agent loop.
 * Makes an API call, processes tool calls or end_turn, and schedules next iteration.
 *
 * Uses setTimeout-chaining (not while-loop) for Chrome MV3 service worker compatibility.
 * Each iteration is a separate event that resets Chrome's execution timer.
 *
 * @param {string} sessionId - Session identifier
 * @param {Object} options - Background.js callbacks (same as runAgentLoop)
 */
async function runAgentIteration(sessionId, options) {
  var activeSessions = options.activeSessions;
  var persist = options.persistSession;
  var sendStatus = options.sendSessionStatus;
  var broadcastDashboardProgress = options.broadcastDashboardProgress;
  var endSessionOverlays = options.endSessionOverlays;
  var cleanupSession = options.cleanupSession;
  var executeCDPToolDirect = options.executeCDPToolDirect;
  var handleDataTool = options.handleDataTool;
  var resolveAuthWall = options.resolveAuthWall;
  var hooks = options.hooks;

  // Helper: save session to automation logger so MCP list_sessions/get_session_detail can find it
  function saveToLogger(sid, sess, status) {
    try {
      if (typeof automationLogger !== 'undefined' && automationLogger.saveSession) {
        var duration = Date.now() - (sess.startTime || Date.now());
        automationLogger.logSessionEnd(sid, status || sess.status || 'completed', (sess.actionHistory || []).length, duration);
        automationLogger.saveSession(sid, sess);
      }
    } catch (_e) { /* non-fatal */ }
  }

  function buildTerminalOutcomeText(terminal) {
    if (!terminal) {
      return 'Task completed.';
    }

    if (terminal.outcome === 'error') {
      return terminal.error || terminal.summary || 'Task failed';
    }

    if (terminal.outcome === 'stopped') {
      return terminal.summary || 'Stopped by user';
    }

    if (terminal.outcome === 'partial') {
      var partialParts = [];
      if (terminal.summary) partialParts.push(terminal.summary);
      if (terminal.blocker) partialParts.push('Blocker: ' + terminal.blocker);
      if (terminal.nextStep) partialParts.push('Next step: ' + terminal.nextStep);
      return partialParts.join('\n\n') || 'Task partially completed.';
    }

    return terminal.summary || 'Task completed.';
  }

  function createTerminalOutcome(outcome, data) {
    data = data || {};
    var normalizedOutcome = outcome === 'partial' || outcome === 'stopped' || outcome === 'error'
      ? outcome
      : 'success';
    var summary = data.summary === undefined || data.summary === null ? '' : String(data.summary).trim();
    var blocker = data.blocker === undefined || data.blocker === null ? '' : String(data.blocker).trim();
    var nextStep = data.nextStep === undefined || data.nextStep === null ? '' : String(data.nextStep).trim();
    var errorText = data.error === undefined || data.error === null ? '' : String(data.error).trim();
    var reason = data.reason || (
      normalizedOutcome === 'success' ? 'completed' :
      normalizedOutcome === 'partial' ? 'blocked' :
      normalizedOutcome
    );
    var terminal = {
      outcome: normalizedOutcome,
      reason: String(reason),
      summary: summary || null,
      blocker: blocker || null,
      nextStep: nextStep || null,
      error: normalizedOutcome === 'error' ? (errorText || summary || 'Task failed') : null
    };
    terminal.resultText = buildTerminalOutcomeText(terminal);
    terminal.partial = normalizedOutcome === 'partial';
    terminal.stopped = normalizedOutcome === 'stopped';
    return terminal;
  }

  function applyTerminalOutcome(sess, terminal) {
    var status = terminal.outcome === 'success'
      ? 'completed'
      : (terminal.outcome === 'partial' ? 'partial' : terminal.outcome);

    sess.status = status;
    sess.outcome = terminal.outcome === 'error' ? 'failure' : terminal.outcome;
    sess.outcomeDetails = {
      outcome: terminal.outcome,
      reason: terminal.reason || null,
      summary: terminal.summary || null,
      blocker: terminal.blocker || null,
      nextStep: terminal.nextStep || null,
      result: terminal.resultText || null,
      error: terminal.error || null
    };
    sess.result = terminal.summary || terminal.resultText || null;
    sess.completionMessage = terminal.outcome === 'error' ? null : (terminal.resultText || null);
    sess.error = terminal.outcome === 'error' ? (terminal.error || terminal.resultText || 'Task failed') : null;
  }

  /**
   * Phase 239 plan 01 -- notifySidepanel now feeds fsbAutomationLifecycleBus
   * (in-SW EventTarget) in addition to the cross-context sendMessage broadcast.
   * The lifecycle bus is what mcp-bridge-client.js:_handleStartAutomation
   * subscribes to in order to resolve a run_task call on actual completion.
   * Without this dispatch, the modern AI loop's 13 terminal exit sites never
   * resolve the originating MCP call until the 600s safety net fires.
   * Per CONTEXT.md D-08 + RESEARCH.md Cleanup-Path Audit Path 1/2/3/8.
   */
  function notifySidepanel(sid, sess, terminal) {
    terminal = terminal || createTerminalOutcome('success', {
      summary: sess.completionMessage || sess.result || 'Task completed.'
    });
    try {
      var message = {
        action: terminal && terminal.outcome === 'error' ? 'automationError' : 'automationComplete',
        sessionId: sid,
        conversationId: sess.conversationId || null,
        historySessionId: sess.historySessionId || sid,
        result: terminal.resultText || 'Task completed.',
        partial: terminal.partial || terminal.stopped,
        stopped: terminal.stopped,
        error: terminal.outcome === 'error' ? (terminal.error || terminal.resultText || 'Task failed') : null,
        reason: terminal.reason || null,
        outcome: terminal.outcome,
        blocker: terminal.blocker || null,
        nextStep: terminal.nextStep || null,
        outcomeDetails: sess.outcomeDetails || {
          outcome: terminal.outcome,
          reason: terminal.reason || null,
          summary: terminal.summary || null,
          blocker: terminal.blocker || null,
          nextStep: terminal.nextStep || null,
          result: terminal.resultText || null,
          error: terminal.error || null
        },
        task: sess.task
      };
      var helperHost = (typeof globalThis !== 'undefined') ? globalThis : null;
      if (helperHost && typeof helperHost.fsbBroadcastAutomationLifecycle === 'function') {
        // fsbBroadcastAutomationLifecycle handles BOTH cross-context sendMessage AND in-SW bus dispatch
        var result = fsbBroadcastAutomationLifecycle(message);
        if (result && typeof result.catch === 'function') {
          result.catch(function(err) { console.warn('[agent-loop] notifySidepanel delivery failed', { sessionId: sid, error: err && err.message }); });
        }
      } else {
        // No-op fallback: helper is exported on globalThis at SW boot
        // (background.js:2061) before agent-loop.js loads via importScripts,
        // so this branch is unreachable in production. Logged-only for forensics.
        // Per RESEARCH.md Pitfall 1.
        console.warn('[agent-loop] fsbBroadcastAutomationLifecycle helper missing on globalThis -- terminal exit not broadcast', { sessionId: sid });
      }
    } catch (_e) { /* non-fatal -- sidepanel may not be open */ }
  }

  function sleep(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }

  function describeToolCall(name, args) {
    var toolNameMap = {
      search: 'searchGoogle',
      go_back: 'goBack',
      go_forward: 'goForward',
      type_text: 'type',
      press_enter: 'pressEnter',
      press_key: 'keyPress',
      select_option: 'selectOption',
      check_box: 'toggleCheckbox',
      right_click: 'rightClick',
      double_click: 'doubleClick',
      clear_input: 'clearInput',
      wait_for_element: 'waitForElement',
      open_tab: 'openNewTab',
      switch_tab: 'switchToTab',
      fill_sheet: 'fillSheetData',
      read_sheet: 'readsheet',
      read_page: 'readPage',
      get_text: 'getText',
      get_attribute: 'getAttribute',
      set_attribute: 'setAttribute'
    };

    var mappedName = toolNameMap[name] || name;
    if (typeof getActionStatus === 'function') {
      return getActionStatus(mappedName, args);
    }
    return String(name || 'working').replace(/_/g, ' ');
  }

  // Helper: full session finalization (overlays + logger + sidepanel + cleanup)
  async function finalizeSession(sid, sess, terminal) {
    saveToLogger(sid, sess, sess.status);
    notifySidepanel(sid, sess, terminal);
    // Give the final overlay state a moment to render before cleanup clears it.
    await sleep(900);
    // cleanupSession removes from activeSessions, persistent storage, and sends overlay cleanup
    if (typeof cleanupSession === 'function') {
      try { await cleanupSession(sid); } catch (_e) { /* non-fatal */ }
    }
  }

  // Helper: map safety breaker reason string to structured D-01 reason constant
  function mapSafetyReasonToConstant(reasonString) {
    if (!reasonString) return 'safety';
    var r = String(reasonString).toLowerCase();
    if (r.indexOf('iteration') !== -1 && (r.indexOf('limit') !== -1 || r.indexOf('count') !== -1)) {
      return 'iteration_limit_exceeded';
    }
    if (r.indexOf('cost') !== -1 || r.indexOf('budget') !== -1 || r.indexOf('spending') !== -1) {
      return 'cost_limit_exceeded';
    }
    if (r.indexOf('duration') !== -1 || r.indexOf('time') !== -1) {
      return 'time_limit_exceeded';
    }
    return 'safety';
  }

  // a. Retrieve session
  var session = activeSessions.get(sessionId);

  // b. Guard: session must exist and be running
  if (!session) {
    console.warn('[agent-loop] runAgentIteration: session not found for sessionId=' + sessionId + '. Sending blind automationComplete.');
    try {
      // Phase 239 WR-01 -- route guard terminal events through the lifecycle
      // bus helper so the in-SW MCP bridge client (mcp-bridge-client.js) sees
      // them. Raw chrome.runtime.sendMessage does NOT loop back to listeners
      // in the same SW context, so the bridge client would only resolve via
      // the 600s safety net. The helper handles BOTH cross-context
      // sendMessage AND in-SW bus dispatch (background.js:2061).
      var helperHost = (typeof globalThis !== 'undefined') ? globalThis : null;
      var msg = {
        action: 'automationComplete',
        sessionId: sessionId,
        conversationId: null,
        historySessionId: sessionId,
        result: 'Session not found. Automation cannot continue.',
        partial: false,
        stopped: true,
        error: null,
        reason: 'session_not_found',
        outcome: 'stopped',
        blocker: null,
        nextStep: null,
        outcomeDetails: {
          outcome: 'stopped',
          reason: 'session_not_found',
          summary: 'Session not found. Automation cannot continue.',
          blocker: null,
          nextStep: null,
          result: 'Session not found. Automation cannot continue.',
          error: null
        },
        task: null
      };
      if (helperHost && typeof helperHost.fsbBroadcastAutomationLifecycle === 'function') {
        var p = fsbBroadcastAutomationLifecycle(msg);
        if (p && typeof p.catch === 'function') {
          p.catch(function(err) { console.warn('[agent-loop] guard broadcast delivery failed (session_not_found)', { sessionId: sessionId, error: err && err.message }); });
        }
      } else {
        console.warn('[agent-loop] fsbBroadcastAutomationLifecycle helper missing on globalThis -- guard terminal exit not broadcast (session_not_found)', { sessionId: sessionId });
      }
    } catch (_e) { /* non-fatal -- sidepanel may not be open */ }
    return;
  }
  if (session.status !== 'running') {
    console.warn('[agent-loop] runAgentIteration: session status is "' + session.status + '" (not running) for sessionId=' + sessionId + '. Sending blind automationComplete.');
    try {
      // Phase 239 WR-01 -- route guard terminal events through the lifecycle
      // bus helper so the in-SW MCP bridge client receives them. See
      // session_not_found branch above for rationale.
      var helperHost = (typeof globalThis !== 'undefined') ? globalThis : null;
      var msg = {
        action: 'automationComplete',
        sessionId: sessionId,
        conversationId: session.conversationId || null,
        historySessionId: session.historySessionId || sessionId,
        result: 'Session is not running (status: ' + session.status + '). Automation cannot continue.',
        partial: false,
        stopped: true,
        error: null,
        reason: 'session_not_running',
        outcome: 'stopped',
        blocker: null,
        nextStep: null,
        outcomeDetails: {
          outcome: 'stopped',
          reason: 'session_not_running',
          summary: 'Session is not running (status: ' + session.status + '). Automation cannot continue.',
          blocker: null,
          nextStep: null,
          result: 'Session is not running (status: ' + session.status + '). Automation cannot continue.',
          error: null
        },
        task: session.task || null
      };
      if (helperHost && typeof helperHost.fsbBroadcastAutomationLifecycle === 'function') {
        var p = fsbBroadcastAutomationLifecycle(msg);
        if (p && typeof p.catch === 'function') {
          p.catch(function(err) { console.warn('[agent-loop] guard broadcast delivery failed (session_not_running)', { sessionId: sessionId, error: err && err.message }); });
        }
      } else {
        console.warn('[agent-loop] fsbBroadcastAutomationLifecycle helper missing on globalThis -- guard terminal exit not broadcast (session_not_running)', { sessionId: sessionId });
      }
    } catch (_e) { /* non-fatal -- sidepanel may not be open */ }
    return;
  }

  // c. Increment iteration count
  session.agentState.iterationCount++;
  var iterNum = session.agentState.iterationCount;
  session.iterationCount = iterNum;

  function buildOverlayStepDetail(detailText, fallbackPhase) {
    var maxIter = session.maxIterations || 20;
    var prefix = 'Step ' + iterNum + '/' + maxIter;
    var detail = detailText ? String(detailText).trim() : '';

    if (!detail) {
      if (fallbackPhase === 'acting') {
        detail = 'Performing browser action';
      } else {
        detail = 'Planning next browser step';
      }
    }

    return prefix + ': ' + detail;
  }

  async function refreshCanonicalOverlay(phase, detailText, opts) {
    opts = opts || {};
    if (typeof sendStatus !== 'function' || typeof session.tabId !== 'number') {
      return;
    }

    var progress = (typeof calculateProgress === 'function')
      ? calculateProgress(session)
      : null;
    var payload = {
      sessionId: sessionId,
      phase: phase,
      taskName: session.task,
      taskSummary: session.taskSummary || null,
      iteration: iterNum,
      maxIterations: session.maxIterations || 20,
      statusText: buildOverlayStepDetail(detailText, phase),
      animatedHighlights: session.animatedActionHighlights
    };

    if (opts.indeterminate) {
      payload.progress = {
        mode: 'indeterminate',
        label: opts.progressLabel || null,
        eta: progress ? progress.estimatedTimeRemaining || null : null
      };
    } else if (progress) {
      payload.progressPercent = progress.progressPercent;
      payload.estimatedTimeRemaining = progress.estimatedTimeRemaining || null;
    }

    try {
      await sendStatus(session.tabId, payload);
    } catch (_statusErr) {
      // Overlay refresh should never break the iteration loop.
    }
  }

  // b2. Safety + beforeIteration hook (LOOP-03 -- safety runs via pipeline, not inline)
  if (hooks) {
    var beforeIterResult = await hooks.emit(_al_LIFECYCLE_EVENTS.BEFORE_ITERATION, {
      session: session, sessionId: sessionId,
      iteration: iterNum
    });
    if (beforeIterResult.stopped) {
      var safetyReason1 = mapSafetyReasonToConstant(beforeIterResult.stoppedBy);
      var safetyTerminal1 = createTerminalOutcome('stopped', {
        reason: safetyReason1,
        summary: 'Automation stopped: ' + (beforeIterResult.stoppedBy || 'Safety breaker triggered')
      });
      applyTerminalOutcome(session, safetyTerminal1);
      // Emit onCompletion hook for safety stop
      await hooks.emit(_al_LIFECYCLE_EVENTS.ON_COMPLETION, {
        session: session, sessionId: sessionId,
        reason: 'safety', message: beforeIterResult.stoppedBy || 'Safety breaker triggered',
        iteration: iterNum,
        totalCost: session.agentState.totalCost || 0
      });
      if (typeof endSessionOverlays === 'function') {
        await endSessionOverlays(session, 'safety');
      }
      await persist(sessionId, session);
      await finalizeSession(sessionId, session, safetyTerminal1);
      return;
    }
  } else {
    // Fallback: inline safety check when no hooks pipeline is available
    var safety = checkSafetyBreakers(session);
    if (safety.shouldStop) {
      var safetyReason2 = mapSafetyReasonToConstant(safety.reason);
      var safetyTerminal2 = createTerminalOutcome('stopped', {
        reason: safetyReason2,
        summary: 'Automation stopped: ' + (safety.reason || 'Safety breaker triggered')
      });
      applyTerminalOutcome(session, safetyTerminal2);
      if (typeof endSessionOverlays === 'function') {
        await endSessionOverlays(session, 'safety');
      }
      await persist(sessionId, session);
      await finalizeSession(sessionId, session, safetyTerminal2);
      return;
    }
  }

  // e. Broadcast dashboard progress
  if (typeof broadcastDashboardProgress === 'function') {
    broadcastDashboardProgress(session);
  }

  try {
    // f. Get provider settings from cached session config
    var providerKey = session.providerConfig.providerKey;
    var model = session.providerConfig.model;
    var providerInstance = session.providerConfig.providerInstance;

    // f2. Compact history via TranscriptStore if available (CTX-03)
    // Verified Phase 183 AICOM-04: TranscriptStore compresses at 80% of 128K budget, keeps 5 recent tool_results.
    // Compact runs BEFORE callProviderWithTools (line ~1308) so the token budget is respected on every API call.
    if (_al_TranscriptStore) {
      var _ts = new _al_TranscriptStore({
        tokenBudget: _al_SESSION_DEFAULTS.tokenBudget || 128000,
        compactThreshold: _al_SESSION_DEFAULTS.compactThreshold || 0.8,
        keepRecentCount: _al_SESSION_DEFAULTS.keepRecentCount || 5
      });
      _ts.hydrate(session.messages);
      _ts.compact();
      session.messages = _ts.replay();
    }
    var turnMessages = buildTurnMessages(session);

    await refreshCanonicalOverlay(
      'thinking',
      session.lastAiReasoning || 'Thinking through the next browser step',
      { indeterminate: true, progressLabel: 'Planning' }
    );

    // g. Make API call with tool definitions
    // DIAG: Log API call start/end to automationLogger so MCP get_logs can surface
    // agent loop lifecycle (console.log only goes to DevTools, invisible to MCP).
    var apiCallStartTime = Date.now();
    if (typeof automationLogger !== 'undefined') {
      automationLogger.debug('Agent iteration API call starting', {
        sessionId: sessionId, iteration: iterNum,
        provider: providerKey, model: model,
        messageCount: turnMessages.length, toolCount: session.tools.length
      });
    }
    var response;
    try {
      response = await callProviderWithTools(
        providerInstance, model, null, turnMessages, session.tools, providerKey
      );
      if (typeof automationLogger !== 'undefined') {
        automationLogger.debug('Agent iteration API call completed', {
          sessionId: sessionId, iteration: iterNum,
          durationMs: Date.now() - apiCallStartTime,
          hasToolCalls: _isToolCallResponse(response, providerKey)
        });
      }
    } catch (apiErr) {
      if (typeof automationLogger !== 'undefined') {
        automationLogger.error('Agent iteration API call failed', {
          sessionId: sessionId, iteration: iterNum,
          durationMs: Date.now() - apiCallStartTime,
          error: (apiErr.message || String(apiErr)).substring(0, 300),
          status: apiErr.status || null
        });
      }
      throw apiErr; // Re-throw for existing error handler
    }

    // h. Extract and accumulate usage
    var usage = _extractUsage(response, providerKey);
    var inputTokens = usage.input || 0;
    var outputTokens = usage.output || 0;
    // ADOPT-02: Record cost via CostTracker (or fall back to inline math)
    var iterationCost = 0;
    if (session._costTracker) {
      iterationCost = session._costTracker.record(model, inputTokens, outputTokens);
      // Sync back to session fields for backward compatibility
      session.agentState.totalInputTokens = session._costTracker.totalInputTokens;
      session.agentState.totalOutputTokens = session._costTracker.totalOutputTokens;
      session.agentState.totalCost = session._costTracker.totalCost;
      session.totalInputTokens = session._costTracker.totalInputTokens;
      session.totalOutputTokens = session._costTracker.totalOutputTokens;
      session.totalCost = session._costTracker.totalCost;
    } else {
      // Fallback: direct accumulation (CostTracker unavailable)
      iterationCost = _al_estimateCost(model, inputTokens, outputTokens);
      session.agentState.totalInputTokens += inputTokens;
      session.agentState.totalOutputTokens += outputTokens;
      session.agentState.totalCost += iterationCost;
      session.totalInputTokens = session.agentState.totalInputTokens;
      session.totalOutputTokens = session.agentState.totalOutputTokens;
      session.totalCost = session.agentState.totalCost;
    }
    session.iterationCount = iterNum;

    // h1b. Track usage in BackgroundAnalytics (control panel dashboard).
    //
    // IMPORTANT: This is the ONLY place that feeds the extension's control panel
    // metrics (Total Tokens, Total Cost, Requests, Success Rate). The CostTracker
    // above only accumulates per-session totals for the automation result -- it does
    // NOT write to BackgroundAnalytics. If this call is removed or bypassed, the
    // control panel dashboard will show all zeros.
    //
    // History: v0.9.32 re-enabled agent-loop.js as the main automation path,
    // bypassing ai-integration.js where trackUsage was previously called.
    // This left BackgroundAnalytics empty until this bridge was added.
    //
    // initializeAnalytics() is defined in background.js (loaded before agent-loop.js
    // via importScripts). It returns the singleton BackgroundAnalytics instance.
    if (typeof initializeAnalytics === 'function') {
      try {
        var bgAnalytics = initializeAnalytics();
        bgAnalytics.trackUsage(model, inputTokens, outputTokens, true, 'automation', providerKey);
      } catch (_trackErr) { /* non-critical -- dashboard display should not break automation */ }
    }

    // h2. Emit afterApiResponse hook
    if (hooks) {
      await hooks.emit(_al_LIFECYCLE_EVENTS.AFTER_API_RESPONSE, {
        session: session, sessionId: sessionId,
        iteration: iterNum,
        inputTokens: inputTokens,
        outputTokens: outputTokens,
        totalCost: session.agentState.totalCost,
        model: model
      });
    }

    // i. Check if AI is done (end_turn) or wants to call tools
    if (!_isToolCallResponse(response, providerKey)) {
      // AI is done -- extract final text
      var finalText = '';
      try {
        if (providerKey === 'anthropic') {
          var textBlocks = (response.content || []).filter(function(b) { return b.type === 'text'; });
          finalText = textBlocks.map(function(b) { return b.text; }).join('\n');
        } else if (providerKey === 'gemini') {
          var gemParts = response.candidates && response.candidates[0] && response.candidates[0].content
            ? response.candidates[0].content.parts || [] : [];
          finalText = gemParts.filter(function(p) { return p.text; }).map(function(p) { return p.text; }).join('\n');
        } else {
          finalText = (response.choices && response.choices[0] && response.choices[0].message)
            ? response.choices[0].message.content || '' : '';
        }
      } catch (_e) {
        finalText = 'Task completed.';
      }

      console.log('[AgentLoop] AI signaled end_turn', {
        sessionId: sessionId, iteration: iterNum, finalTextLength: finalText.length,
        finalText: finalText.substring(0, 500)
      });

      // End session
      var terminalOutcome = createTerminalOutcome('success', {
        summary: finalText,
        reason: 'end_turn'
      });
      applyTerminalOutcome(session, terminalOutcome);

      // ADOPT-03: Construct structured turn result for end_turn
      session.lastTurnResult = _al_createTurnResult({
        sessionId: sessionId,
        iteration: iterNum,
        inputTokens: inputTokens,
        outputTokens: outputTokens,
        cost: iterationCost,
        matchedTools: [],
        toolResults: [],
        permissionDenials: [],
        stopReason: _al_STOP_REASONS.END_TURN || 'end_turn',
        completionMessage: (terminalOutcome.resultText || '').substring(0, 500),
        errorMessage: null,
        timestamp: Date.now(),
        durationMs: Date.now() - (session.agentState.startTime || Date.now())
      });

      // Emit onCompletion hook
      if (hooks) {
        await hooks.emit(_al_LIFECYCLE_EVENTS.ON_COMPLETION, {
          session: session, sessionId: sessionId,
          iteration: iterNum, message: (terminalOutcome.resultText || '').substring(0, 200),
          totalCost: session.agentState.totalCost || 0,
          reason: 'end_turn'
        });
      }

      await persist(sessionId, session);
      await finalizeSession(sessionId, session, terminalOutcome);

      // Broadcast completion
      if (typeof broadcastDashboardProgress === 'function') {
        broadcastDashboardProgress(session);
      }

      // Do NOT schedule next iteration -- AI decided to stop
      return;
    }

    // j. Push assistant message to history (BEFORE tool results, per Pitfall 5)
    var assistantMsg = _formatAssistantMessage(response, providerKey);
    session.messages.push(assistantMsg);

    // Phase 8 FINT-11 -- emit step.transition at LLM_TURN boundary.
    // Fire-and-forget per D-03; tracer call goes INSIDE iteration body BEFORE any
    // deferred-iterator schedule per INV-04 + D-07 (08-RESEARCH Section 6 Pitfall 1).
    // Payload follows Phase 5 D-16 wire shape exactly; runId equals sessionId per
    // 08-RESEARCH Section 4 + Pitfall 3 (no new session._lattice* fields).
    if (typeof sendLatticeStepTransition === 'function') {
      try {
        sendLatticeStepTransition({
          runId: sessionId,
          sessionId: sessionId,
          stepName: 'LLM_TURN',
          stepIndex: iterNum,
          timestamp: new Date().toISOString()
        });
      } catch (_e) { /* swallow - producer is fire-and-forget */ }
    }

    // k. Parse tool calls
    var toolCalls = _parseToolCalls(response, providerKey);

    if (toolCalls.length === 0) {
      // No tool calls parsed but isToolCallResponse was true -- defensive fallback
      console.warn('[AgentLoop] isToolCallResponse=true but no tool calls parsed', { sessionId: sessionId, iteration: iterNum });
      session.messages.push({ role: 'user', content: 'No tool calls were detected. Please either call a tool or provide your final answer.' });
      await persist(sessionId, session);
      session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 100);
      return;
    }

    // DIAG: Log parsed tool calls so MCP get_logs shows what the model chose
    if (typeof automationLogger !== 'undefined') {
      automationLogger.info('Agent iteration tool calls', {
        sessionId: sessionId, iteration: iterNum,
        toolCount: toolCalls.length,
        tools: toolCalls.map(function(c) {
          var p = c.args || {};
          var summary = p.selector || p.url || p.code || p.message || p.text || p.key || '';
          return c.name + (summary ? '(' + String(summary).substring(0, 80) + ')' : '');
        })
      });
    }

    // Phase 233 Fix A: defensive iteration intent log. session.actionHistory
    // has known recording gaps (mutation tools sometimes don't reach the push
    // at line ~2110 due to early-returns or other code paths). toolCallLog
    // captures the LLM's intent for every iteration unconditionally — this
    // is the source of truth for debugging "why did the agent loop here?".
    // Window-cap at 200 entries to bound memory.
    if (!session.toolCallLog) session.toolCallLog = [];
    for (var _tlci = 0; _tlci < toolCalls.length; _tlci++) {
      var _tlc = toolCalls[_tlci];
      var _tlp = _tlc.args || {};
      session.toolCallLog.push({
        iteration: iterNum,
        timestamp: Date.now(),
        tool: _tlc.name,
        target: _tlp.selector || _tlp.elementId || _tlp.element_id || _tlp.text || _tlp.url || _tlp.key || null,
        codeSnippet: _tlc.name === 'execute_js' && _tlp.code ? String(_tlp.code).slice(0, 120) : null
      });
    }
    if (session.toolCallLog.length > 200) {
      session.toolCallLog = session.toolCallLog.slice(-200);
    }

    // l. Execute each tool call SEQUENTIALLY (browser actions must be serial)
    var toolResults = [];
    var lastNonProgressToolCall = null;
    for (var ci = 0; ci < toolCalls.length; ci++) {
      var call = toolCalls[ci];
      var result;

      if (call.name !== 'report_progress' && call.name !== 'complete_task' && call.name !== 'partial_task' && call.name !== 'fail_task') {
        lastNonProgressToolCall = call;
      }

      // l2. Emit beforeToolExecution hook (permission check)
      if (hooks) {
        var permResult = await hooks.emit(_al_LIFECYCLE_EVENTS.BEFORE_TOOL_EXECUTION, {
          toolName: call.name,
          origin: '',
          session: session, sessionId: sessionId,
          iteration: iterNum
        });
        // If permission denied, skip tool execution and return denial as result
        var denialResult = (permResult.results || []).find(function(r) { return r && r.denied; });
        if (denialResult && denialResult.denial) {
          result = {
            success: false, hadEffect: false,
            error: denialResult.denial.reason || 'Tool not permitted',
            navigationTriggered: false, result: null
          };
          toolResults.push({ callId: call.id, name: call.name, result: result });
          // ADOPT-04: Use ActionHistory instance or fallback to raw array
          if (session._actionHistory) {
            session._actionHistory.push({
              tool: call.name, params: call.args,
              result: { success: false, hadEffect: false, error: result.error },
              timestamp: Date.now(), iteration: iterNum
            });
            session.actionHistory = session._actionHistory.events; // backward compat sync
          } else {
            if (!session.actionHistory) session.actionHistory = [];
            session.actionHistory.push(_al_createActionEvent({
              tool: call.name, params: call.args,
              result: { success: false, hadEffect: false, error: result.error },
              timestamp: Date.now(), iteration: iterNum
            }));
          }
          continue; // Skip to next tool
        }
      }

      // Phase 8 FINT-11 -- emit step.transition at TOOL_DISPATCH boundary.
      // One event per tool call per D-01. Placed AFTER the permission/hook check
      // so denied tools also emit a step.transition (observable in metadata via
      // Phase 10 metrics consumer; Phase 8 keeps wire payload byte-frozen to
      // Phase 5 D-16 shape). previousStepName threads back to the LLM_TURN that
      // produced this tool call (linked-list per CheckpointHookContext semantics).
      if (typeof sendLatticeStepTransition === 'function') {
        try {
          sendLatticeStepTransition({
            runId: sessionId,
            sessionId: sessionId,
            stepName: 'TOOL_DISPATCH',
            stepIndex: iterNum,
            previousStepName: 'LLM_TURN',
            timestamp: new Date().toISOString()
          });
        } catch (_e) { /* swallow - producer is fire-and-forget */ }
      }

      // --- Local tool interception (Phase 138 on-demand context) ---
      if (call.name === 'get_page_snapshot') {
        // CTX-01: Fetch markdown snapshot from content script
        try {
          var mdResponse = await chrome.tabs.sendMessage(session.tabId, {
            action: 'getMarkdownSnapshot',
            options: { charBudget: 12000, maxElements: 80 }
          }, { frameId: 0 });
          if (mdResponse && mdResponse.success && mdResponse.markdownSnapshot) {
            result = { success: true, hadEffect: false, error: null, navigationTriggered: false,
              result: { snapshot: mdResponse.markdownSnapshot, elementCount: mdResponse.elementCount || 0 } };
          } else {
            result = { success: false, hadEffect: false, error: (mdResponse && mdResponse.error) || 'Snapshot unavailable', navigationTriggered: false, result: null };
          }
        } catch (err) {
          result = { success: false, hadEffect: false, error: 'get_page_snapshot failed: ' + err.message, navigationTriggered: false, result: null };
        }
      } else if (call.name === 'search_memory') {
        // Phase 225-02 (TOOLS-04): autopilot can consult FSB memory mid-task
        // via the same memoryManager.search the MCP search_memory tool hits.
        // Soft per-session call cap (default 5) prevents the LLM from spamming
        // the memory subsystem and inflating cost/latency; on overage we
        // return a graceful budget-exhausted response instead of erroring.
        var smArgs = call.args || {};
        var smQuery = (typeof smArgs.query === 'string') ? smArgs.query : '';
        var smTopN = Math.max(1, Math.min(25, parseInt(smArgs.topN, 10) || 5));
        if (!smQuery) {
          result = { success: false, hadEffect: false, error: 'search_memory requires a non-empty query', navigationTriggered: false, result: null };
        } else {
          var smState = session.agentState || (session.agentState = {});
          smState.searchMemoryCalls = (smState.searchMemoryCalls || 0) + 1;
          var smCap = (typeof smState.searchMemoryBudget === 'number') ? smState.searchMemoryBudget : 5;
          if (smState.searchMemoryCalls > smCap) {
            result = { success: true, hadEffect: false, error: null, navigationTriggered: false,
              result: { query: smQuery, results: [], budgetExhausted: true,
                note: 'search_memory per-session budget (' + smCap + ') exhausted -- rely on prompt-injected memory hints or proceed without further memory lookups.' } };
          } else {
            try {
              var smManager = (typeof memoryManager !== 'undefined') ? memoryManager
                : (typeof globalThis !== 'undefined' && globalThis.memoryManager) ? globalThis.memoryManager
                : null;
              if (!smManager || typeof smManager.search !== 'function') {
                result = { success: false, hadEffect: false, error: 'Memory search unavailable', navigationTriggered: false, result: null };
              } else {
                var smFilters = {};
                if (smArgs.domain) smFilters.domain = smArgs.domain;
                if (smArgs.type) smFilters.type = smArgs.type;
                var smResults = await smManager.search(smQuery, smFilters, { topN: smTopN });
                var smList = (Array.isArray(smResults) ? smResults : []).slice(0, smTopN).map(function(m) {
                  return {
                    id: (m && m.id) || null,
                    type: (m && m.type) || null,
                    text: String((m && m.text) || '').slice(0, 500),
                    metadata: (m && m.metadata) || {}
                  };
                });
                result = { success: true, hadEffect: false, error: null, navigationTriggered: false,
                  result: { query: smQuery, results: smList, count: smList.length, callsUsed: smState.searchMemoryCalls, callsRemaining: Math.max(0, smCap - smState.searchMemoryCalls) } };
              }
            } catch (smErr) {
              result = { success: false, hadEffect: false, error: 'search_memory failed: ' + (smErr.message || String(smErr)), navigationTriggered: false, result: null };
            }
          }
        }
      } else if (call.name === 'get_site_guide') {
        // CTX-02: Load site guide for domain
        var domain = (call.args && call.args.domain) || '';
        try {
          var guide = (typeof getGuideForTask === 'function')
            ? getGuideForTask('', 'https://' + domain)
            : null;
          if (guide) {
            result = { success: true, hadEffect: false, error: null, navigationTriggered: false,
              result: { domain: domain, site: guide.site || guide.name || domain, guidance: JSON.stringify(guide.selectors || guide) } };
          } else {
            result = { success: true, hadEffect: false, error: null, navigationTriggered: false,
              result: { domain: domain, guidance: 'No site guide available for ' + domain + '. Use get_page_snapshot and get_dom_snapshot to discover elements.' } };
          }
        } catch (err) {
          result = { success: true, hadEffect: false, error: null, navigationTriggered: false,
            result: { domain: domain, guidance: 'No site guide available for ' + domain + '.' } };
        }
      } else if (call.name === 'complete_task') {
        // Task lifecycle: complete
        var summary = (call.args && call.args.summary) || 'Task completed';
        console.log('[AgentLoop] Task completed:', summary);
        var successOutcome = createTerminalOutcome('success', {
          summary: summary,
          reason: 'complete_task'
        });
        applyTerminalOutcome(session, successOutcome);
        session.lastTurnResult = _al_createTurnResult({
          sessionId: sessionId,
          iteration: iterNum,
          inputTokens: inputTokens,
          outputTokens: outputTokens,
          cost: iterationCost,
          matchedTools: ['complete_task'],
          toolResults: [{ name: 'complete_task', success: true, hadEffect: false }],
          permissionDenials: [],
          stopReason: _al_STOP_REASONS.END_TURN || 'end_turn',
          completionMessage: (successOutcome.resultText || '').substring(0, 500),
          errorMessage: null,
          timestamp: Date.now(),
          durationMs: Date.now() - (session.agentState.startTime || Date.now())
        });
        // Emit onCompletion hook
        if (hooks) {
          await hooks.emit(_al_LIFECYCLE_EVENTS.ON_COMPLETION, {
            session: session, sessionId: sessionId,
            iteration: iterNum, message: successOutcome.resultText,
            totalCost: session.agentState.totalCost || 0,
            reason: 'complete_task'
          });
        }
        await persist(sessionId, session);
        await finalizeSession(sessionId, session, successOutcome);
        return; // End the loop -- task is done
      } else if (call.name === 'partial_task') {
        // Task lifecycle: useful work completed, final step blocked
        var partialSummary = (call.args && call.args.summary) || 'Task partially completed';
        var blocker = (call.args && call.args.blocker) || 'An external blocker prevented the final step';
        var nextStep = (call.args && call.args.next_step) || null;
        var partialReason = (call.args && call.args.reason) || 'blocked';
        result = null;

        if (isAuthWallPartialReason(partialReason) && typeof resolveAuthWall === 'function') {
          beginInlineContinuationPause(session, {
            kind: 'auth_resolution',
            reason: partialReason,
            summary: partialSummary,
            blocker: blocker,
            nextStep: nextStep
          });
          await persist(sessionId, session);

          var authResolution = null;
          try {
            authResolution = await resolveAuthWall({
              sessionId: sessionId,
              session: session,
              reason: partialReason,
              summary: partialSummary,
              blocker: blocker,
              nextStep: nextStep
            });
          } catch (authResolutionError) {
            console.warn('[AgentLoop] Inline auth resolution failed, preserving manual handoff', {
              sessionId: sessionId,
              iteration: iterNum,
              error: authResolutionError?.message || String(authResolutionError)
            });
          }

          if (authResolution && authResolution.resume) {
            resumeInlineContinuation(session, {
              kind: 'auth_resolution',
              note: authResolution.resumeMessage || authResolution.toolResultMessage || null,
              boundaryMessage: authResolution.boundaryMessage || null
            });
            result = {
              success: true,
              hadEffect: true,
              error: null,
              navigationTriggered: false,
              result: {
                resumed: true,
                authResolved: true,
                source: authResolution.source || 'runtime_auth_resolution',
                message: authResolution.toolResultMessage
                  || 'Authentication succeeded. Continue the same task from the authenticated page.'
              }
            };
          } else {
            clearInlineContinuationPause(session);
            partialSummary = authResolution?.partialOutcome?.summary || partialSummary;
            blocker = authResolution?.partialOutcome?.blocker || blocker;
            nextStep = authResolution?.partialOutcome?.nextStep || nextStep;
            partialReason = authResolution?.partialOutcome?.reason || partialReason;
          }
        }

        if (result) {
          // Auth resolution succeeded inline. Continue the same session with a normal tool result.
        } else {
        var partialOutcome = createTerminalOutcome('partial', {
          summary: partialSummary,
          blocker: blocker,
          nextStep: nextStep,
          reason: partialReason
        });
        console.log('[AgentLoop] Task partially completed:', partialOutcome);
        applyTerminalOutcome(session, partialOutcome);
        session.lastTurnResult = _al_createTurnResult({
          sessionId: sessionId,
          iteration: iterNum,
          inputTokens: inputTokens,
          outputTokens: outputTokens,
          cost: iterationCost,
          matchedTools: ['partial_task'],
          toolResults: [{ name: 'partial_task', success: true, hadEffect: false }],
          permissionDenials: [],
          stopReason: _al_STOP_REASONS.PARTIAL || 'partial',
          completionMessage: (partialOutcome.resultText || '').substring(0, 500),
          errorMessage: null,
          timestamp: Date.now(),
          durationMs: Date.now() - (session.agentState.startTime || Date.now())
        });
        if (hooks) {
          await hooks.emit(_al_LIFECYCLE_EVENTS.ON_COMPLETION, {
            session: session, sessionId: sessionId,
            iteration: iterNum, message: partialOutcome.resultText,
            totalCost: session.agentState.totalCost || 0,
            reason: partialReason
          });
        }
        await persist(sessionId, session);
        await finalizeSession(sessionId, session, partialOutcome);
        return; // End the loop -- task ended with a non-error partial outcome
        }
      } else if (call.name === 'fail_task') {
        // Task lifecycle: failure
        var reason = (call.args && call.args.reason) || 'Task failed';
        console.log('[AgentLoop] Task failed:', reason);
        var errorOutcome = createTerminalOutcome('error', {
          error: reason,
          reason: 'fail_task'
        });
        applyTerminalOutcome(session, errorOutcome);
        session.lastTurnResult = _al_createTurnResult({
          sessionId: sessionId,
          iteration: iterNum,
          inputTokens: inputTokens,
          outputTokens: outputTokens,
          cost: iterationCost,
          matchedTools: ['fail_task'],
          toolResults: [{ name: 'fail_task', success: false, hadEffect: false }],
          permissionDenials: [],
          stopReason: _al_STOP_REASONS.ERROR || 'error',
          completionMessage: null,
          errorMessage: (errorOutcome.error || '').substring(0, 500),
          timestamp: Date.now(),
          durationMs: Date.now() - (session.agentState.startTime || Date.now())
        });
        // Emit onError hook
        if (hooks) {
          await hooks.emit(_al_LIFECYCLE_EVENTS.ON_ERROR, {
            session: session, sessionId: sessionId,
            iteration: iterNum, error: errorOutcome.error,
            totalCost: session.agentState.totalCost || 0
          });
        }
        await persist(sessionId, session);
        await finalizeSession(sessionId, session, errorOutcome);
        return; // End the loop -- task failed
      } else if (call.name === 'report_progress') {
        // PROG-02: Update progress overlay with AI reasoning and cost
        var msg = (call.args && call.args.message) || '';
        session.lastAiReasoning = msg;
        await refreshCanonicalOverlay(
          'thinking',
          msg || 'Thinking through the next browser step',
          { indeterminate: true, progressLabel: 'Planning' }
        );
        result = { success: true, hadEffect: false, error: null, navigationTriggered: false, result: { displayed: true } };
      } else {
        // Standard tool: dispatch through unified executor
        result = await _executeTool(call.name, call.args, session.tabId, {
          cdpHandler: executeCDPToolDirect
            ? function(verb, params, tabId) { return executeCDPToolDirect({ tool: verb, params: params }, tabId); }
            : null,
          dataHandler: handleDataTool
        });
      }

      // Tab-switching tools: update session.tabId so subsequent tools target the new tab
      if ((call.name === 'open_tab' || call.name === 'switch_tab') && result.success && result.result && result.result.tabId) {
        var newTabId = result.result.tabId;
        console.log('[AgentLoop] Tab changed', { from: session.tabId, to: newTabId, tool: call.name });
        session.tabId = newTabId;

        // Ensure content script is injected on the new tab
        try {
          await chrome.scripting.executeScript({
            target: { tabId: newTabId },
            files: ['content/messaging.js']
          });
        } catch (_e) {
          // Content script may already be injected or tab may be restricted
        }
      }

      toolResults.push({ callId: call.id, name: call.name, result: result });

      // ADOPT-04: Use ActionHistory instance or fallback to raw array
      if (session._actionHistory) {
        session._actionHistory.push({
          tool: call.name, params: call.args,
          result: { success: result.success, hadEffect: result.hadEffect, error: result.error || null },
          timestamp: Date.now(), iteration: iterNum
        });
        session.actionHistory = session._actionHistory.events; // backward compat sync
      } else {
        if (!session.actionHistory) session.actionHistory = [];
        session.actionHistory.push(_al_createActionEvent({
          tool: call.name, params: call.args,
          result: { success: result.success, hadEffect: result.hadEffect, error: result.error || null },
          timestamp: Date.now(), iteration: iterNum
        }));
      }

      // Emit afterToolExecution hook
      if (hooks) {
        await hooks.emit(_al_LIFECYCLE_EVENTS.AFTER_TOOL_EXECUTION, {
          toolName: call.name, toolResult: result,
          session: session, sessionId: sessionId,
          iteration: iterNum
        });
      }
    }

    // m2. Update session progress fields for dashboard broadcast (PROG-03)
    session.currentTool = toolResults.length > 0 ? toolResults[toolResults.length - 1].name : null;
    if (!session.lastAiReasoning) session.lastAiReasoning = null; // Reset if not set by report_progress

    // m. Format tool results into messages and push to history
    // Verified Phase 183 AICOM-05: Continuation includes tool results (with DOM from snapshots), stuck recovery hints.
    // Tool results carry JSON.stringify(tr.result) via formatToolResult; stuck hints injected at step n below.
    for (var ti = 0; ti < toolResults.length; ti++) {
      var tr = toolResults[ti];
      var resultMsg = _formatToolResult(
        tr.callId,
        JSON.stringify(tr.result),
        providerKey,
        { name: tr.name }
      );
      session.messages.push(resultMsg);
    }

    // m3. Phase 233: meta-cognitive attempt-counter. Operates directly on
    // toolCalls (the LLM's intent for this iteration) instead of actionHistory,
    // so it works even when the actionHistory recording pipeline silently
    // drops mutation tools (the bug that made Phase 226/227/232 stuck-detection
    // ineffective). Counts repeated attempts on the same target within a
    // 12-iteration sliding window. Warn at 4 attempts (inject explicit
    // SYSTEM ATTEMPT-LOG message), force-stop at 6.
    var _metaLastMutation = null;
    for (var _mci = toolCalls.length - 1; _mci >= 0; _mci--) {
      if (_META_INTERACT_TOOLS[toolCalls[_mci].name]) { _metaLastMutation = toolCalls[_mci]; break; }
    }
    if (_metaLastMutation) {
      var _metaSignal = _trackMetaAttempt(session, _metaLastMutation, iterNum);
      if (_metaSignal) {
        var _iterList = _metaSignal.attempts.map(function(a) { return a.iteration; }).join(', ');
        var _toolList = _metaSignal.attempts.map(function(a) { return a.tool; }).join(', ');
        var _attemptCount = _metaSignal.attempts.length;
        if (_metaSignal.forceStop) {
          var _metaTerminal = createTerminalOutcome('stopped', {
            reason: 'meta_cognitive_loop_break',
            summary: 'Automation stopped: meta-cognitive loop detected — ' + _attemptCount +
                     ' attempts on `' + _metaSignal.target + '` across iterations ' + _iterList +
                     ' with no observable progress.'
          });
          applyTerminalOutcome(session, _metaTerminal);
          if (typeof automationLogger !== 'undefined' && automationLogger.log) {
            automationLogger.log('warn', 'Meta-cognitive loop break', {
              sessionId: sessionId, iteration: iterNum, target: _metaSignal.target,
              attempts: _attemptCount, iterations: _iterList, tools: _toolList
            });
          }
          if (typeof endSessionOverlays === 'function') {
            await endSessionOverlays(session, 'safety');
          }
          await persist(sessionId, session);
          await finalizeSession(sessionId, session, _metaTerminal);
          return;
        }
        var _metaMsg = 'SYSTEM ATTEMPT-LOG: You have attempted to interact with `' + _metaSignal.target +
          '` ' + _attemptCount + ' times across iterations ' + _iterList + ' using tools [' + _toolList + ']. ' +
          'Each attempt may have reported success, but the same target keeps being retried — strongly suggesting ' +
          'the action is silently failing OR the success indicator is invisible to your snapshot tools. ' +
          'Choose ONE of: ' +
          '(1) Report task complete based ONLY on what you can directly observe in the page (do NOT assume the click worked). ' +
          '(2) Call fail_task with a specific blocker (e.g. "button intercepted by overlay", "anti-automation no-op", "variant selection required"). ' +
          '(3) Take a fundamentally different approach (different selector path, different starting URL, different sub-task). ' +
          'Do NOT attempt the same target a ' + (_attemptCount + 1) + 'th time.';
        session.messages.push({ role: 'user', content: _metaMsg });
        if (typeof automationLogger !== 'undefined' && automationLogger.log) {
          automationLogger.log('warn', 'Meta-cognitive attempt-log injected', {
            sessionId: sessionId, iteration: iterNum, target: _metaSignal.target,
            attempts: _attemptCount, iterations: _iterList, tools: _toolList
          });
        }
      }
    }

    // n. Emit afterIteration hook (stuck detection + safety breakers run as hook handlers)
    if (hooks) {
      var afterIterResult = await hooks.emit(_al_LIFECYCLE_EVENTS.AFTER_ITERATION, {
        session: session, sessionId: sessionId,
        iteration: iterNum, toolResults: toolResults,
        totalCost: session.agentState.totalCost,
        inputTokens: inputTokens, outputTokens: outputTokens
      });
      // Check if stuck detection hook returned a hint
      var stuckResult = (afterIterResult.results || []).find(function(r) { return r && r.isStuck; });
      if (stuckResult && stuckResult.hint) {
        session.messages.push({ role: 'user', content: stuckResult.hint });
        if (typeof automationLogger !== 'undefined' && automationLogger.log) {
          automationLogger.log('warn', 'Stuck detection triggered', {
            sessionId: sessionId, iteration: iterNum,
            warningCount: session.agentState?.stuckWarningCount,
            forceStop: Boolean(stuckResult.shouldStop),
            hint: stuckResult.hint.substring(0, 200)
          });
        }
      }
      // Check if safety breaker hook stopped the iteration
      if (afterIterResult.stopped) {
        // Phase 227-01: prefer stuck-detection reasonCode when source is stuckDetection
        // so outcomeDetails.reason carries the specific stuck signal.
        var stoppingResult = (afterIterResult.results || []).find(function(r) { return r && r.shouldStop; });
        var safetyReason3;
        if (stoppingResult && stoppingResult.source === 'stuckDetection' && stoppingResult.reasonCode) {
          safetyReason3 = stoppingResult.reasonCode;
        } else {
          safetyReason3 = mapSafetyReasonToConstant(afterIterResult.stoppedBy);
        }
        var safetyTerminal3 = createTerminalOutcome('stopped', {
          reason: safetyReason3,
          summary: 'Automation stopped: ' + (afterIterResult.stoppedBy || 'Safety breaker triggered')
        });
        applyTerminalOutcome(session, safetyTerminal3);
        if (typeof endSessionOverlays === 'function') {
          await endSessionOverlays(session, 'safety');
        }
        await persist(sessionId, session);
        await finalizeSession(sessionId, session, safetyTerminal3);
        return;
      }
    } else {
      // Fallback: inline stuck detection when no hooks pipeline is available
      var stuckCheck = detectStuck(session, toolResults);
      if (stuckCheck.isStuck && stuckCheck.hint) {
        session.messages.push({ role: 'user', content: stuckCheck.hint });
        if (typeof automationLogger !== 'undefined' && automationLogger.log) {
          automationLogger.log('warn', 'Stuck detection triggered (fallback)', {
            sessionId: sessionId, iteration: iterNum,
            warningCount: session.agentState?.stuckWarningCount,
            forceStop: stuckCheck.shouldForceStop,
            hint: stuckCheck.hint.substring(0, 200)
          });
        }
      }
      // Force-stop when stuck detection escalates past threshold.
      // Phase 227-01: attribute reason from detectStuck.reasonCode so
      // outcomeDetails.reason reflects the specific stuck signal
      // (stuck_action_repetition or stuck_dom_hash). Falls back to
      // stuck_dom_hash for backward compatibility.
      if (stuckCheck.shouldForceStop) {
        var stuckReason = stuckCheck.reasonCode || 'stuck_dom_hash';
        var stuckTerminal = createTerminalOutcome('stopped', {
          reason: stuckReason,
          summary: 'Automation stopped: stuck detection escalated past threshold (' + stuckReason + '). ' + (stuckCheck.hint ? stuckCheck.hint.substring(0, 200) : '')
        });
        applyTerminalOutcome(session, stuckTerminal);
        if (typeof endSessionOverlays === 'function') {
          await endSessionOverlays(session, 'stuck');
        }
        await persist(sessionId, session);
        await finalizeSession(sessionId, session, stuckTerminal);
        return;
      }
    }

    // o2. Broadcast updated progress to dashboard (includes cost from session.totalCost)
    var postIterationPhase = lastNonProgressToolCall ? 'acting' : 'thinking';
    var postIterationDetail = lastNonProgressToolCall
      ? describeToolCall(lastNonProgressToolCall.name, lastNonProgressToolCall.args)
      : session.lastAiReasoning;
    await refreshCanonicalOverlay(postIterationPhase, postIterationDetail);

    if (typeof broadcastDashboardProgress === 'function') {
      broadcastDashboardProgress(session);
    }

    // o. Persist session state after every iteration (per SAFE-04, D-09)
    await persist(sessionId, session);

    // ADOPT-03: Construct structured turn result for tool_calls iteration
    session.lastTurnResult = _al_createTurnResult({
      sessionId: sessionId,
      iteration: iterNum,
      inputTokens: inputTokens,
      outputTokens: outputTokens,
      cost: iterationCost,
      matchedTools: toolResults.map(function(tr) { return tr.name; }),
      toolResults: toolResults.map(function(tr) {
        return { name: tr.name, success: tr.result.success, hadEffect: tr.result.hadEffect };
      }),
      permissionDenials: [],
      stopReason: _al_STOP_REASONS.TOOL_CALLS || 'tool_calls',
      completionMessage: null,
      errorMessage: null,
      timestamp: Date.now(),
      durationMs: Date.now() - (session.agentState.startTime || Date.now())
    });

    // p. Schedule next iteration via setTimeout (per D-08, P4)
    // 100ms delay: fast enough for responsive automation,
    // long enough to yield the event loop and reset Chrome's execution timer
    session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 100);

  } catch (error) {
    // Error handling for API call failures
    var errMsg = error.message || String(error);
    var errStatus = error.status;

    console.error('[AgentLoop] Iteration error', {
      sessionId: sessionId, iteration: iterNum, error: errMsg, status: errStatus,
      responseText: error.responseText || 'no response body'
    });

    // Emit onError hook for all error types
    if (hooks) {
      await hooks.emit(_al_LIFECYCLE_EVENTS.ON_ERROR, {
        session: session, sessionId: sessionId,
        iteration: iterNum, error: errMsg,
        errorStatus: errStatus,
        totalCost: (session.agentState && session.agentState.totalCost) || 0
      });
    }

    // ADOPT-03: Construct error turn result (used by all error exit paths)
    session.lastTurnResult = _al_createTurnResult({
      sessionId: sessionId,
      iteration: iterNum,
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      matchedTools: [],
      toolResults: [],
      permissionDenials: [],
      stopReason: _al_STOP_REASONS.ERROR || 'error',
      completionMessage: null,
      errorMessage: errMsg,
      timestamp: Date.now(),
      durationMs: Date.now() - ((session.agentState && session.agentState.startTime) || Date.now())
    });

    // Auth errors (401/403): terminal
    if (errStatus === 401 || errStatus === 403) {
      var authErrorOutcome = createTerminalOutcome('error', {
        error: 'API key invalid or expired. Please check your API key in settings.',
        reason: 'error'
      });
      applyTerminalOutcome(session, authErrorOutcome);
      await persist(sessionId, session);
      await finalizeSession(sessionId, session, authErrorOutcome);
      return;
    }

    // Bad request (400): terminal -- tool format or schema issue, don't retry
    if (errStatus === 400) {
      var errorDetail = (error.responseText || errMsg).substring(0, 300);
      var badRequestOutcome = createTerminalOutcome('error', {
        error: 'API rejected request (400): ' + errorDetail,
        reason: 'error'
      });
      applyTerminalOutcome(session, badRequestOutcome);
      console.error('[AgentLoop] 400 Bad Request -- check tool definitions or request format:', errorDetail);
      await persist(sessionId, session);
      await finalizeSession(sessionId, session, badRequestOutcome);
      return;
    }

    // Rate limit (429): wait 5s and retry once
    // (UniversalProvider handles retries internally, so this is a last-resort catch)
    if (errStatus === 429 || error.isRateLimited) {
      console.warn('[AgentLoop] Rate limited, waiting 5s before retry', { sessionId: sessionId });
      session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 5000);
      return;
    }

    // Network error / timeout: retry once after 2s
    if (!session._lastRetryIteration || session._lastRetryIteration < iterNum) {
      session._lastRetryIteration = iterNum;
      // Decrement iteration count since this will be retried
      session.agentState.iterationCount--;
      console.warn('[AgentLoop] Network error, retrying in 2s', { sessionId: sessionId, error: errMsg });
      session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 2000);
      return;
    }

    // Second failure on same iteration: terminal error
    var apiErrorOutcome = createTerminalOutcome('error', {
      error: 'API call failed: ' + errMsg,
      reason: 'error'
    });
    applyTerminalOutcome(session, apiErrorOutcome);
    await persist(sessionId, session);
    await finalizeSession(sessionId, session, apiErrorOutcome);
  }
}


// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

// CommonJS for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runAgentLoop: runAgentLoop, runAgentIteration: runAgentIteration, buildSystemPrompt: buildSystemPrompt, callProviderWithTools: callProviderWithTools, getPublicTools: getPublicTools, checkSafetyBreakers: checkSafetyBreakers, detectStuck: detectStuck };
}
