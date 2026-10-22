/**
 * Regression checks for CostTracker initialization ordering.
 * Run: node tests/cost-tracker-ordering.test.js
 */

const fs = require('fs');
const path = require('path');
const { EXECUTION_MODES } = require('../extension/ai/engine-config.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

const agentLoopPath = path.join(__dirname, '..', 'extension', 'ai', 'agent-loop.js');
const agentLoopSource = fs.readFileSync(agentLoopPath, 'utf8');

console.log('\n--- execution mode cost-limit tests ---');

const autopilotCostLimit = EXECUTION_MODES.autopilot?.safetyLimits?.costLimit;
const manualCostLimit = EXECUTION_MODES['mcp-manual']?.safetyLimits?.costLimit;

assert(typeof autopilotCostLimit === 'number', 'autopilot mode exposes a numeric cost limit');
assert(typeof manualCostLimit === 'number', 'mcp-manual mode exposes a numeric cost limit');
assert(manualCostLimit < autopilotCostLimit, 'mcp-manual cost limit remains tighter than autopilot');

console.log('\n--- agent-loop ordering tests ---');

const loadConfigIndex = agentLoopSource.indexOf("var sessionConfig = await _al_loadSessionConfig(session.mode || 'autopilot');");
const hydrateStateIndex = agentLoopSource.indexOf('hydrateAgentRunState(session, systemPrompt);');
const hydrateTrackerIndex = agentLoopSource.indexOf('hydrateCostTracker(session);');
const hydrateTrackerHelperIndex = agentLoopSource.indexOf('function hydrateCostTracker(session) {');
const newTrackerIndex = agentLoopSource.indexOf('session._costTracker = new _al_CostTracker(costLimit);');

assert(loadConfigIndex !== -1, 'agent-loop still resolves final session config through loadSessionConfig');
assert(hydrateStateIndex !== -1, 'agent-loop still hydrates session state before running');
assert(hydrateTrackerIndex !== -1, 'agent-loop now has an explicit CostTracker hydration step');
assert(hydrateTrackerHelperIndex !== -1, 'agent-loop defines a dedicated CostTracker hydration helper');
assert(newTrackerIndex !== -1, 'agent-loop still constructs _al_CostTracker');
assert(loadConfigIndex < hydrateStateIndex, 'loadSessionConfig happens before hydrateAgentRunState');
assert(loadConfigIndex < hydrateTrackerIndex, 'loadSessionConfig happens before hydrateCostTracker');
assert(hydrateStateIndex < hydrateTrackerIndex, 'CostTracker hydration happens after session state hydration');
assert(hydrateTrackerHelperIndex < newTrackerIndex, 'hydrateCostTracker owns the tracker construction path');

console.log('\n--- agent-loop hydration and breaker tests ---');

assert(agentLoopSource.includes('session._costTracker.totalCost = session.totalCost || 0;'), 'CostTracker hydration preserves totalCost');
assert(agentLoopSource.includes('session._costTracker.totalInputTokens = session.totalInputTokens || 0;'), 'CostTracker hydration preserves totalInputTokens');
assert(agentLoopSource.includes('session._costTracker.totalOutputTokens = session.totalOutputTokens || 0;'), 'CostTracker hydration preserves totalOutputTokens');
// Phase 231: cost circuit breaker REMOVED from checkSafetyBreakers — only iteration + time limits gate sessions now.
assert(!agentLoopSource.includes('var budget = session._costTracker.checkBudget();'), 'Phase 231: checkSafetyBreakers no longer calls CostTracker.checkBudget (cost limit removed)');
assert(agentLoopSource.includes('Cost circuit breaker REMOVED in Phase 231'), 'Phase 231: removal is documented in agent-loop.js');

console.log('\n--- Phase 66 measurement wiring ---');

function countOccurrences(haystack, needle) {
  let count = 0;
  let from = 0;
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) return count;
    count++;
    from = idx + needle.length;
  }
}

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  if (start === -1) return null;
  const end = source.indexOf(endNeedle, start);
  if (end === -1) return null;
  return source.slice(start, end);
}

const usageExtractIndex = agentLoopSource.indexOf('var usage = _extractUsage(response, providerKey);');
const endTurnCheckIndex = agentLoopSource.indexOf('// i. Check if AI is done');
const appendTimingIndex = agentLoopSource.indexOf('_al_appendIterationTiming(session');
assert(countOccurrences(agentLoopSource, '_al_appendIterationTiming(session') === 1,
  'Phase 66: _al_appendIterationTiming(session occurs exactly once');
assert(usageExtractIndex !== -1 && endTurnCheckIndex !== -1,
  'Phase 66: usage-extraction and end_turn anchors are present');
assert(appendTimingIndex > usageExtractIndex && appendTimingIndex < endTurnCheckIndex,
  'Phase 66: the iteration row is appended after usage extraction and before the end_turn check (every path records it, terminal tools included)');

[
  '_al_readProviderUsage',
  '_al_estimateCostDetailed',
  '_al_buildIterationTimingRow',
  '_al_appendIterationTiming',
  '_al_addIterationToolTime'
].forEach((resolverName) => {
  const helperName = resolverName.slice('_al_'.length);
  const resolverLine = 'var ' + resolverName + ' = (typeof ' + helperName + " !== 'undefined') ? " + helperName +
    ' : (_al_costTracker?.' + helperName + ' || null);';
  assert(countOccurrences(agentLoopSource, resolverLine) === 1,
    'Phase 66: ' + resolverName + ' resolves the global or require() helper with a null fallback');
});

const modelStartIndex = agentLoopSource.indexOf('var apiCallStartTime = Date.now();');
const retryMarkIndex = agentLoopSource.indexOf('_timingModelRetried = true;');
const retryThrowIndex = agentLoopSource.indexOf('if (!imageFallbackCode) throw imageRequestError;');
const textOnlyRetryIndex = agentLoopSource.indexOf('var textOnlyRetryMessages = buildTurnMessages(session);');
const modelEndIndex = agentLoopSource.indexOf('_timingModelMs = Date.now() - apiCallStartTime;');
const markDeliveredIndex = agentLoopSource.indexOf('_al_ScreenshotAttachments.markDelivered(sessionId, session.messages);');
assert(countOccurrences(agentLoopSource, '_timingModelRetried = true;') === 1 && retryMarkIndex > retryThrowIndex && retryMarkIndex < textOnlyRetryIndex,
  'Phase 66: the one text-only image retry marks modelRetried');
assert(countOccurrences(agentLoopSource, '_timingModelMs = Date.now() - apiCallStartTime;') === 1 &&
  modelEndIndex > modelStartIndex && modelEndIndex > textOnlyRetryIndex && modelEndIndex < markDeliveredIndex,
  'Phase 66: model time is taken once the provider call (and any retry) resolved, before markDelivered');

const toolStartDecl = 'var _timingToolStartedAt = Date.now();';
const stepMarker = "session._currentStepName = 'BEFORE_TOOL_EXECUTION';";
const deniedIndex = agentLoopSource.indexOf('if (denialResult && denialResult.denial) {');
assert(countOccurrences(agentLoopSource, toolStartDecl) === 1, 'Phase 66: tool timing starts exactly once');
assert(agentLoopSource.indexOf(toolStartDecl) > deniedIndex && agentLoopSource.indexOf(toolStartDecl) < agentLoopSource.indexOf(stepMarker),
  'Phase 66: tool timing starts after the permission hook and before the BEFORE_TOOL_EXECUTION step marker');

assert(countOccurrences(agentLoopSource, 'durationMs: _timingToolMs') === 2,
  'Phase 66: both success-push literals carry durationMs: _timingToolMs');
const malformedSlice = sliceBetween(agentLoopSource, 'if (call.argsParseError) {', 'continue; // Skip to next tool');
const deniedSlice = sliceBetween(agentLoopSource, 'if (denialResult && denialResult.denial) {', 'continue; // Skip to next tool');
assert(malformedSlice !== null && !malformedSlice.includes('durationMs'), 'Phase 66: malformed-argument calls carry no durationMs');
assert(deniedSlice !== null && !deniedSlice.includes('durationMs'), 'Phase 66: permission-denied calls carry no durationMs');

const successPushSlice = sliceBetween(agentLoopSource, "client: 'FSB Autopilot',\n            tool: call.name,", '// Emit afterToolExecution hook');
assert(successPushSlice !== null && countOccurrences(successPushSlice, 'durationMs: _timingToolMs') === 2,
  'Phase 66: the durationMs literals sit in the success push after the autopilot metrics block');
assert(successPushSlice !== null && countOccurrences(successPushSlice, '_al_addIterationToolTime(session, _timingRow, _timingToolMs)') === 1 &&
  successPushSlice.indexOf('_al_addIterationToolTime(session, _timingRow, _timingToolMs)') > successPushSlice.lastIndexOf('durationMs: _timingToolMs'),
  'Phase 66: tool time is folded into the iteration row after the success push, before afterToolExecution');
assert(countOccurrences(agentLoopSource, '/* measurement is diagnostic-only */') === 2,
  'Phase 66: both measurement blocks are wrapped in try/catch');

assert(agentLoopSource.includes('var inputTokens = usage.input || 0;'), 'Phase 66 D-02: legacy usage accounting is unchanged');
assert(agentLoopSource.includes('iterationCost = session._costTracker.record(model, inputTokens, outputTokens);'),
  'Phase 66 D-02: legacy CostTracker recording is unchanged');

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
