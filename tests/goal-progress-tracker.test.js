/**
 * Unit tests for ai/goal-progress-tracker.js + integration with detectStuck()
 *
 * Phase 227-02: validates the windowed unique-state-vector tracker that
 * fires reasonCode=stuck_no_goal_progress when actions vary but no
 * semantic progress is made (e.g. open/close dropdown loop with varying
 * selectors that bypasses the action-repetition detector).
 *
 * Run: node tests/goal-progress-tracker.test.js
 */

'use strict';

const {
  GoalProgressTracker,
  getOverrideThreshold,
  TASK_TYPE_THRESHOLDS
} = require('../extension/ai/goal-progress-tracker.js');
const { detectStuck } = require('../extension/ai/agent-loop.js');
const { STUCK_REASONS } = require('../extension/ai/turn-result.js');

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

function assertEqual(actual, expected, msg) {
  assert(
    actual === expected,
    msg + ' (expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual) + ')'
  );
}

// ---------------------------------------------------------------------------
// Tracker behavior
// ---------------------------------------------------------------------------

console.log('\n--- Test 1: new GoalProgressTracker starts empty ---');
{
  const t = new GoalProgressTracker();
  assertEqual(t.urls.size, 0, 'urls set is empty');
  assertEqual(t.focusedElements.size, 0, 'focusedElements set is empty');
  assertEqual(t.actionOutcomes.size, 0, 'actionOutcomes set is empty');
  assertEqual(t.lastGrowthIteration, 0, 'lastGrowthIteration starts at 0');
}

console.log('\n--- Test 2: record() updates lastGrowthIteration on any new signal ---');
{
  const t = new GoalProgressTracker();
  t.record({ iteration: 1, url: 'https://a.test/' });
  assertEqual(t.lastGrowthIteration, 1, 'new url updates lastGrowthIteration');
  t.record({ iteration: 2, url: 'https://a.test/', focusedElementId: '#btn' });
  assertEqual(t.lastGrowthIteration, 2, 'new focused element updates lastGrowthIteration');
  t.record({ iteration: 3, url: 'https://a.test/', focusedElementId: '#btn', actionOutcomeKey: 'click:ok:fx' });
  assertEqual(t.lastGrowthIteration, 3, 'new outcome key updates lastGrowthIteration');
  // No new signal -> no growth
  t.record({ iteration: 4, url: 'https://a.test/', focusedElementId: '#btn', actionOutcomeKey: 'click:ok:fx' });
  assertEqual(t.lastGrowthIteration, 3, 'no new signal leaves lastGrowthIteration unchanged');
}

console.log('\n--- Test 3: hasProgressed returns true while currentIteration - lastGrowth < windowSize ---');
{
  const t = new GoalProgressTracker();
  t.record({ iteration: 1, url: 'https://a.test/' });
  assertEqual(t.hasProgressed(1, 8), true, 'hasProgressed(1,8) true at growth iteration');
  assertEqual(t.hasProgressed(8, 8), true, 'hasProgressed(8,8) still true at boundary (8-1<8)');
  assertEqual(t.hasProgressed(9, 8), false, 'hasProgressed(9,8) false once gap reaches windowSize');
}

console.log('\n--- Test 4: 8 iterations of identical (url, focused, outcome) -> hasProgressed false ---');
{
  const t = new GoalProgressTracker();
  for (let i = 1; i <= 8; i++) {
    t.record({ iteration: i, url: 'https://a.test/', focusedElementId: '#x', actionOutcomeKey: 'click:ok:fx' });
  }
  // First record (iteration 1) added all three signals; iterations 2-8 add nothing.
  assertEqual(t.lastGrowthIteration, 1, 'lastGrowthIteration stuck at first growth');
  assertEqual(t.hasProgressed(9, 8), false, 'after 8 stagnant iterations, hasProgressed(9,8) false');
}

console.log('\n--- Test 5: new URL after stagnation resets the no-progress window ---');
{
  const t = new GoalProgressTracker();
  for (let i = 1; i <= 7; i++) {
    t.record({ iteration: i, url: 'https://a.test/', focusedElementId: '#x', actionOutcomeKey: 'click:ok:fx' });
  }
  assertEqual(t.lastGrowthIteration, 1, 'stagnant after first record');
  t.record({ iteration: 8, url: 'https://b.test/', focusedElementId: '#x', actionOutcomeKey: 'click:ok:fx' });
  assertEqual(t.lastGrowthIteration, 8, 'new url at iteration 8 resets growth pointer');
  assertEqual(t.hasProgressed(8, 8), true, 'hasProgressed true again after url reset');
}

console.log('\n--- Test 6: getOverrideThreshold per task type ---');
{
  assertEqual(getOverrideThreshold('form_fill'), 16, 'form_fill -> 16');
  assertEqual(getOverrideThreshold('form'), 16, 'form alias -> 16');
  assertEqual(getOverrideThreshold('data_entry'), 12, 'data_entry -> 12');
  assertEqual(getOverrideThreshold('search'), 8, 'unknown task type -> default 8');
  assertEqual(getOverrideThreshold(null), 8, 'null task type -> default 8');
  assertEqual(getOverrideThreshold(undefined), 8, 'undefined task type -> default 8');
}

console.log('\n--- Test 7: toJSON / fromJSON round-trip ---');
{
  const t = new GoalProgressTracker();
  t.record({ iteration: 1, url: 'https://a.test/' });
  t.record({ iteration: 2, url: 'https://b.test/', focusedElementId: '#x', actionOutcomeKey: 'click:ok:fx' });
  const json = t.toJSON();
  assert(Array.isArray(json.urls) && json.urls.length === 2, 'toJSON serialises urls as array');
  assert(Array.isArray(json.focusedElements) && json.focusedElements.length === 1, 'toJSON serialises focusedElements');
  assert(Array.isArray(json.actionOutcomes) && json.actionOutcomes.length === 1, 'toJSON serialises actionOutcomes');
  assertEqual(json.lastGrowthIteration, 2, 'toJSON preserves lastGrowthIteration');

  const t2 = GoalProgressTracker.fromJSON(json);
  assertEqual(t2.urls.size, 2, 'fromJSON rehydrates urls set');
  assertEqual(t2.focusedElements.size, 1, 'fromJSON rehydrates focusedElements set');
  assertEqual(t2.actionOutcomes.size, 1, 'fromJSON rehydrates actionOutcomes set');
  assertEqual(t2.lastGrowthIteration, 2, 'fromJSON preserves lastGrowthIteration');
  // round-trip is functionally equivalent
  assertEqual(t2.hasProgressed(3, 8), true, 'rehydrated tracker reports progress correctly');
}

// ---------------------------------------------------------------------------
// detectStuck integration (Task 2 behaviors)
// ---------------------------------------------------------------------------

function makeSession(extra) {
  var s = {
    agentState: {
      consecutiveNoChangeCount: 0,
      actionFingerprints: [],
      stuckWarningCount: 0,
      iterationCount: 0
    },
    actionHistory: [],
    iterationCount: 0
  };
  if (extra) {
    Object.keys(extra).forEach(function (k) { s[k] = extra[k]; });
  }
  return s;
}

// Build varying-selector mutation results that DO NOT trigger action-repetition
// (each iteration uses a different selector so the fingerprint changes) and DO
// NOT change url/outcome class -- the canonical PROMPT-10 dropdown loop pattern.
function varyingDropdownResultsAt(iter) {
  // alternating selectors so the (tool, target) fingerprint differs each iter
  var selector = (iter % 2 === 0) ? '#dropdown-open' : '#dropdown-close';
  return [{
    callId: 'c-' + iter,
    name: 'click',
    args: { selector: selector },
    result: { success: true, hadEffect: true }
  }];
}

console.log('\n--- Integration Test 1: varying-selector loop fires stuck_no_goal_progress ---');
{
  const session = makeSession();
  let outcome = null;
  for (let i = 1; i <= 12; i++) {
    session.agentState.iterationCount = i;
    session.iterationCount = i;
    session.lastKnownUrl = 'https://app.test/page';
    outcome = detectStuck(session, varyingDropdownResultsAt(i));
  }
  assertEqual(outcome.isStuck, true, 'varying-selector dropdown loop reported as stuck');
  assertEqual(
    outcome.reasonCode,
    STUCK_REASONS.NO_GOAL_PROGRESS,
    'reasonCode = NO_GOAL_PROGRESS (action-repetition did NOT fire because selectors varied)'
  );
  assert(
    typeof outcome.hint === 'string' && outcome.hint.indexOf('stuck_no_goal_progress') !== -1,
    'hint mentions stuck_no_goal_progress'
  );
}

console.log('\n--- Integration Test 2: action-repetition wins precedence over no-goal-progress ---');
{
  // Same selector every iteration -> action-repetition force-stops at iteration 5.
  const session = makeSession();
  let outcome = null;
  for (let i = 1; i <= 6; i++) {
    session.agentState.iterationCount = i;
    session.iterationCount = i;
    session.lastKnownUrl = 'https://app.test/page';
    outcome = detectStuck(session, [{
      callId: 'c-' + i,
      name: 'click',
      args: { selector: '#dropdown' },
      result: { success: true, hadEffect: true }
    }]);
  }
  // After 6 iterations of identical fingerprint, action-repetition wins.
  assertEqual(
    outcome.reasonCode,
    STUCK_REASONS.ACTION_REPETITION,
    'reasonCode = ACTION_REPETITION (more specific signal wins)'
  );
}

console.log('\n--- Integration Test 3: new URL between iterations resets no-progress counter ---');
{
  const session = makeSession();
  // 7 iterations of stagnation
  for (let i = 1; i <= 7; i++) {
    session.agentState.iterationCount = i;
    session.iterationCount = i;
    session.lastKnownUrl = 'https://app.test/page';
    detectStuck(session, varyingDropdownResultsAt(i));
  }
  // Iteration 8: new URL -> growth -> not stuck by no-progress
  session.agentState.iterationCount = 8;
  session.iterationCount = 8;
  session.lastKnownUrl = 'https://app.test/different';
  const outcome = detectStuck(session, varyingDropdownResultsAt(8));
  assert(
    outcome.reasonCode !== STUCK_REASONS.NO_GOAL_PROGRESS,
    'new URL prevents NO_GOAL_PROGRESS fire'
  );
}

console.log('\n--- Integration Test 4: form_fill task-type override raises threshold to 16 ---');
{
  const session = makeSession({ taskType: 'form_fill' });
  let outcome = null;
  // At iteration 12 a default-windowed (8) tracker would already fire,
  // but form_fill override (16) should keep us OK.
  for (let i = 1; i <= 12; i++) {
    session.agentState.iterationCount = i;
    session.iterationCount = i;
    session.lastKnownUrl = 'https://app.test/form';
    outcome = detectStuck(session, varyingDropdownResultsAt(i));
  }
  assert(
    outcome.reasonCode !== STUCK_REASONS.NO_GOAL_PROGRESS,
    'form_fill override prevents NO_GOAL_PROGRESS fire at iteration 12'
  );
}

console.log('\n--- Integration Test 5: PASS-style varied-progress task does not false-positive ---');
{
  const session = makeSession();
  // Each iteration: new URL + new selector -> tracker keeps growing
  let outcome = null;
  for (let i = 1; i <= 12; i++) {
    session.agentState.iterationCount = i;
    session.iterationCount = i;
    session.lastKnownUrl = 'https://app.test/page-' + i;
    outcome = detectStuck(session, [{
      callId: 'c-' + i,
      name: 'click',
      args: { selector: '#unique-' + i },
      result: { success: true, hadEffect: true }
    }]);
  }
  assert(
    outcome.reasonCode !== STUCK_REASONS.NO_GOAL_PROGRESS,
    'normal varied task never trips stuck_no_goal_progress'
  );
}

console.log('\n--- Test 8: the service worker sees the threshold helper ---');
{
  // A worker realm: `self` is the global, and there is no `window` or `module`.
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const trackerSource = fs.readFileSync(path.join(__dirname, '../extension/ai/goal-progress-tracker.js'), 'utf8');
  const agentLoopSource = fs.readFileSync(path.join(__dirname, '../extension/ai/agent-loop.js'), 'utf8');
  const worker = vm.createContext({});
  vm.runInContext('var self = this;', worker);
  vm.runInContext(trackerSource, worker);
  assertEqual(typeof worker.getGoalProgressOverrideThreshold, 'function', 'getGoalProgressOverrideThreshold is a worker global');
  assertEqual(typeof worker.GoalProgressTracker, 'function', 'GoalProgressTracker is a worker global');
  // The lookup agent-loop.js does at load time, run in that realm.
  const at = agentLoopSource.indexOf('var _al_getGoalProgressOverrideThreshold');
  assert(at >= 0, 'found the threshold lookup in agent-loop.js');
  const end = agentLoopSource.indexOf('});', at);
  assert(end > at, 'found the end of the threshold lookup');
  vm.runInContext('var _al_goalProgress;\n' + agentLoopSource.slice(at, end + 3), worker);
  assertEqual(worker._al_getGoalProgressOverrideThreshold('form'), 16, 'agent-loop.js resolves the form window to 16 in the worker');

  // A page realm keeps the window attachment and gains nothing on self.
  const page = vm.createContext({});
  vm.runInContext('var window = this; var self = { marker: true };', page);
  vm.runInContext(trackerSource, page);
  assertEqual(typeof page.getGoalProgressOverrideThreshold, 'function', 'page realm still attaches to window');
  assertEqual(page.self.getGoalProgressOverrideThreshold, undefined, 'page realm does not also attach to self');
}

console.log('\n--- Integration Test 6: the task is classified when no task type is set ---');
{
  // In the worker AIIntegration is a global; here it is lent for this block.
  globalThis.AIIntegration = require('../extension/ai/ai-integration.js');
  try {
    const runLoop = (task, iterations) => {
      const session = makeSession({ task: task });
      let firedAt = null;
      for (let i = 1; i <= iterations; i++) {
        session.agentState.iterationCount = i;
        session.iterationCount = i;
        session.lastKnownUrl = 'https://app.test/form';
        const outcome = detectStuck(session, varyingDropdownResultsAt(i));
        if (firedAt === null && outcome.reasonCode === STUCK_REASONS.NO_GOAL_PROGRESS) firedAt = i;
      }
      return { session: session, firedAt: firedAt };
    };

    const form = runLoop('Fill out the contact form with my details', 12);
    assertEqual(form.session._goalTaskType && form.session._goalTaskType.type, 'form', 'a form task is classified as form');
    assertEqual(form.firedAt, null, 'a form task gets the 16-step window: no NO_GOAL_PROGRESS by iteration 12');

    const search = runLoop('Search for wireless headphones', 12);
    assertEqual(search.session._goalTaskType && search.session._goalTaskType.type, 'search', 'a search task is classified as search');
    assert(search.firedAt !== null && search.firedAt <= 10, 'a search task keeps the 8-step window (fired at ' + search.firedAt + ')');

    const explicit = makeSession({ task: 'Search for wireless headphones', taskType: 'form_fill' });
    explicit.agentState.iterationCount = 1;
    explicit.iterationCount = 1;
    detectStuck(explicit, varyingDropdownResultsAt(1));
    assertEqual(explicit._goalTaskType, undefined, 'an assigned session.taskType is used as is, without classifying');

    // A follow-up command replaces session.task; it is classified afresh.
    const followUp = makeSession({ task: 'Search for wireless headphones' });
    followUp.agentState.iterationCount = 1;
    followUp.iterationCount = 1;
    detectStuck(followUp, varyingDropdownResultsAt(1));
    followUp.task = 'Now fill out the contact form';
    followUp.agentState.iterationCount = 2;
    followUp.iterationCount = 2;
    detectStuck(followUp, varyingDropdownResultsAt(2));
    assertEqual(followUp._goalTaskType && followUp._goalTaskType.type, 'form', 'a follow-up task is classified afresh');
  } finally {
    delete globalThis.AIIntegration;
  }

  // Without the classifier (or with one that throws) the default window stays.
  const plain = makeSession({ task: 'Fill out the contact form with my details' });
  plain.agentState.iterationCount = 1;
  plain.iterationCount = 1;
  detectStuck(plain, varyingDropdownResultsAt(1));
  assertEqual(plain._goalTaskType && plain._goalTaskType.type, null, 'no classifier: no task type, default window');

  globalThis.AIIntegration = { prototype: { detectTaskType: function () { throw new Error('boom'); } } };
  try {
    const broken = makeSession({ task: 'Fill out the contact form with my details' });
    broken.agentState.iterationCount = 1;
    broken.iterationCount = 1;
    const outcome = detectStuck(broken, varyingDropdownResultsAt(1));
    assertEqual(broken._goalTaskType && broken._goalTaskType.type, null, 'a throwing classifier leaves the default window');
    assertEqual(outcome.isStuck, false, 'and detectStuck still answers');
  } finally {
    delete globalThis.AIIntegration;
  }
}

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
