/**
 * Unit tests for ai/action-history.js
 *
 * Adapted from archive/remote-main tests/test-action-history.js — the
 * archive API used record()/replay()/last()/fromJSON() with a 200-event
 * cap and frozen events; local uses push()/getLastN()/getByIteration()
 * with no cap and mutable events. The tests below preserve the original
 * validation intent against local's actual API surface.
 *
 * Run: node tests/action-history.test.js
 */

'use strict';

const { ActionHistory, createActionEvent } = require('../extension/ai/action-history.js');

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
  assert(actual === expected, msg + ' (expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual) + ')');
}

// --- createActionEvent produces normalized shape --------------------------

console.log('\n--- createActionEvent produces normalized shape ---');
{
  const evt = createActionEvent({
    tool: 'click',
    params: { selector: '#btn' },
    result: { success: true, hadEffect: true },
    timestamp: 1000,
    iteration: 1,
    durationMs: 42
  });
  assertEqual(evt.tool, 'click', 'tool field preserved');
  assertEqual(evt.params.selector, '#btn', 'params preserved');
  assertEqual(evt.result.success, true, 'result.success preserved');
  assertEqual(evt.result.hadEffect, true, 'result.hadEffect preserved');
  assertEqual(evt.result.error, null, 'result.error defaults to null');
  assertEqual(evt.timestamp, 1000, 'timestamp preserved');
  assertEqual(evt.iteration, 1, 'iteration preserved');
  assertEqual(evt.durationMs, 42, 'durationMs preserved');
}

// --- createActionEvent uses sensible defaults -----------------------------

console.log('\n--- createActionEvent uses sensible defaults ---');
{
  const evt = createActionEvent({});
  assertEqual(evt.tool, 'unknown', 'default tool is "unknown"');
  assert(evt.params && typeof evt.params === 'object', 'default params is empty object');
  assertEqual(evt.result.success, false, 'default success is false');
  assertEqual(evt.result.hadEffect, false, 'default hadEffect is false');
  assertEqual(evt.result.error, null, 'default error is null');
  assertEqual(evt.iteration, 0, 'default iteration is 0');
  assertEqual(evt.durationMs, null, 'default durationMs is null (unmeasured, never 0)');
  assert(typeof evt.timestamp === 'number' && evt.timestamp > 0, 'timestamp auto-populated');
}

// --- createActionEvent keeps measured durations (Phase 66 D-05) -----------

console.log('\n--- createActionEvent keeps measured durations ---');
{
  assertEqual(createActionEvent({ durationMs: 125 }).durationMs, 125, 'measured durationMs 125 preserved');
  assertEqual(createActionEvent({ durationMs: 0 }).durationMs, 0, 'a measured 0 ms stays 0');
  assertEqual(createActionEvent({ durationMs: NaN }).durationMs, null, 'NaN durationMs -> null');
  assertEqual(createActionEvent({ durationMs: '125' }).durationMs, null, 'string durationMs -> null');
  assertEqual(createActionEvent({ durationMs: null }).durationMs, null, 'null durationMs stays null');
  assertEqual(createActionEvent().durationMs, null, 'no fields -> durationMs null');
}

// --- push() adds an event and length reflects it -------------------------

console.log('\n--- push() adds an event and length reflects it ---');
{
  const ah = new ActionHistory();
  assertEqual(ah.length, 0, 'new history is empty');
  ah.push({ tool: 'click', params: { selector: '#btn' }, result: { success: true, hadEffect: true }, iteration: 1 });
  assertEqual(ah.length, 1, 'length = 1 after push');
  assertEqual(ah.events[0].tool, 'click', 'pushed event is in events array');
  assertEqual(ah.events[0].result.success, true, 'pushed event has normalized result');
}

// --- push() returns the event ---------------------------------------------

console.log('\n--- push() returns the event ---');
{
  const ah = new ActionHistory();
  const returned = ah.push({ tool: 'type', params: {}, result: { success: true, hadEffect: true }, iteration: 1 });
  assertEqual(returned.tool, 'type', 'push returns event with correct tool');
  assert(typeof returned.timestamp === 'number', 'push returns event with timestamp');
}

// --- push() accepts pre-built event without re-normalizing ---------------

console.log('\n--- push() accepts pre-built event without re-normalizing ---');
{
  const ah = new ActionHistory();
  const preBuilt = createActionEvent({ tool: 'scroll', params: { y: 100 }, result: { success: true, hadEffect: true }, iteration: 2, timestamp: 12345 });
  ah.push(preBuilt);
  assertEqual(ah.events[0].timestamp, 12345, 'pre-built event timestamp preserved');
}

// --- getLastN() returns most recent N ------------------------------------

console.log('\n--- getLastN() returns most recent N ---');
{
  const ah = new ActionHistory();
  for (let i = 1; i <= 5; i++) {
    ah.push({ tool: 't' + i, params: {}, result: { success: true, hadEffect: true }, iteration: i });
  }
  const lastTwo = ah.getLastN(2);
  assertEqual(lastTwo.length, 2, 'getLastN(2) returns 2 events');
  assertEqual(lastTwo[0].tool, 't4', 'first of last 2 is t4');
  assertEqual(lastTwo[1].tool, 't5', 'second of last 2 is t5');
}

// --- getLastN() returns all when N exceeds length ------------------------

console.log('\n--- getLastN() returns all when N exceeds length ---');
{
  const ah = new ActionHistory();
  ah.push({ tool: 'click', params: {}, result: { success: true, hadEffect: true }, iteration: 1 });
  const last10 = ah.getLastN(10);
  assertEqual(last10.length, 1, 'getLastN(10) returns all 1 event');
  assertEqual(last10[0].tool, 'click', 'returned event preserved');
}

// --- getLastN() returns a copy (not a reference) -------------------------

console.log('\n--- getLastN() returns a copy, not a reference ---');
{
  const ah = new ActionHistory();
  ah.push({ tool: 'click', params: {}, result: { success: true, hadEffect: true }, iteration: 1 });
  const slice = ah.getLastN(1);
  slice.push({ tool: 'fake' });
  assertEqual(ah.length, 1, 'mutating the returned slice does not affect internal events');
}

// --- getByIteration() filters correctly ----------------------------------

console.log('\n--- getByIteration() filters correctly ---');
{
  const ah = new ActionHistory();
  ah.push({ tool: 'click', params: {}, result: { success: true, hadEffect: true }, iteration: 1 });
  ah.push({ tool: 'type',  params: {}, result: { success: true, hadEffect: true }, iteration: 2 });
  ah.push({ tool: 'scroll',params: {}, result: { success: true, hadEffect: true }, iteration: 1 });
  ah.push({ tool: 'nav',   params: {}, result: { success: true, hadEffect: true }, iteration: 3 });
  const iter1 = ah.getByIteration(1);
  assertEqual(iter1.length, 2, 'two events at iteration 1');
  assertEqual(iter1[0].tool, 'click', 'first iter-1 event is click');
  assertEqual(iter1[1].tool, 'scroll', 'second iter-1 event is scroll');
}

// --- getToolCounts() returns correct counts ------------------------------

console.log('\n--- getToolCounts() returns correct counts ---');
{
  const ah = new ActionHistory();
  ah.push({ tool: 'click',  params: {}, result: { success: true, hadEffect: true }, iteration: 1 });
  ah.push({ tool: 'click',  params: {}, result: { success: true, hadEffect: true }, iteration: 2 });
  ah.push({ tool: 'type',   params: {}, result: { success: true, hadEffect: true }, iteration: 3 });
  ah.push({ tool: 'click',  params: {}, result: { success: true, hadEffect: true }, iteration: 4 });
  const counts = ah.getToolCounts();
  assertEqual(counts.click, 3, 'click count = 3');
  assertEqual(counts.type, 1, 'type count = 1');
  assert(!('scroll' in counts), 'absent tools not included');
}

// --- getFailures() filters events where success = false ------------------

console.log('\n--- getFailures() filters events where success = false ---');
{
  const ah = new ActionHistory();
  ah.push({ tool: 'click', params: {}, result: { success: true,  hadEffect: true  }, iteration: 1 });
  ah.push({ tool: 'type',  params: {}, result: { success: false, hadEffect: false, error: 'timeout' }, iteration: 2 });
  ah.push({ tool: 'nav',   params: {}, result: { success: false, hadEffect: false, error: '404' },     iteration: 3 });
  ah.push({ tool: 'scroll',params: {}, result: { success: true,  hadEffect: true  }, iteration: 4 });
  const failures = ah.getFailures();
  assertEqual(failures.length, 2, 'two failures');
  assertEqual(failures[0].tool, 'type', 'first failure is type');
  assertEqual(failures[0].result.error, 'timeout', 'failure error preserved');
  assertEqual(failures[1].tool, 'nav', 'second failure is nav');
}

// --- diff(fromIndex) returns events from index onward --------------------

console.log('\n--- diff(fromIndex) returns events from index onward ---');
{
  const ah = new ActionHistory();
  for (let i = 1; i <= 5; i++) {
    ah.push({ tool: 't' + i, params: {}, result: { success: true, hadEffect: true }, iteration: i });
  }
  const diffed = ah.diff(3);
  assertEqual(diffed.length, 2, 'diff(3) returns 2 events (indices 3 and 4)');
  assertEqual(diffed[0].tool, 't4', 'first diff event is t4');
  assertEqual(diffed[1].tool, 't5', 'second diff event is t5');
}

// --- hydrate() replaces events from array --------------------------------

console.log('\n--- hydrate() replaces events from array ---');
{
  const ah = new ActionHistory();
  ah.push({ tool: 'old', params: {}, result: { success: true, hadEffect: true }, iteration: 0 });
  ah.hydrate([
    { tool: 'click', params: { x: 1 }, result: { success: true, hadEffect: true }, iteration: 1 },
    { tool: 'type',  params: {},       result: { success: false, hadEffect: false, error: 'err' }, iteration: 2 }
  ]);
  assertEqual(ah.length, 2, 'hydrate replaces all existing events');
  assertEqual(ah.events[0].tool, 'click', 'hydrated first event');
  assertEqual(ah.events[1].tool, 'type', 'hydrated second event');
}

// --- hydrate() tolerates non-array input ---------------------------------

console.log('\n--- hydrate() tolerates non-array input ---');
{
  const ah = new ActionHistory();
  ah.push({ tool: 'click', params: {}, result: { success: true, hadEffect: true }, iteration: 1 });
  ah.hydrate(null);
  assertEqual(ah.length, 0, 'hydrate(null) empties the history');
  ah.hydrate(undefined);
  assertEqual(ah.length, 0, 'hydrate(undefined) keeps the history empty');
}

// --- toJSON() preserves structure ----------------------------------------

console.log('\n--- toJSON() preserves structure ---');
{
  const ah = new ActionHistory();
  ah.push({ tool: 'click', params: { selector: '#btn' }, result: { success: true, hadEffect: true }, iteration: 1, timestamp: 1000, durationMs: 50 });
  const json = ah.toJSON();
  assertEqual(json.length, 1, 'toJSON returns array');
  assertEqual(json[0].tool, 'click', 'toJSON tool');
  assertEqual(json[0].params.selector, '#btn', 'toJSON params preserved');
  assertEqual(json[0].result.success, true, 'toJSON result.success');
  assertEqual(json[0].timestamp, 1000, 'toJSON timestamp');
  assertEqual(json[0].durationMs, 50, 'toJSON durationMs');
}

// --- toJSON() truncates long string params -------------------------------

console.log('\n--- toJSON() truncates long string params ---');
{
  const ah = new ActionHistory();
  const longStr = 'a'.repeat(600);
  ah.push({ tool: 'type', params: { text: longStr }, result: { success: true, hadEffect: true }, iteration: 1 });
  const json = ah.toJSON();
  const outText = json[0].params.text;
  assert(outText.length < 600, 'long param text is truncated (got ' + outText.length + ' chars)');
  assert(outText.length === 500, 'truncated to 497 body + 3 dots = 500 chars');
  assert(outText.endsWith('...'), 'truncated string ends with "..."');
}

// --- toJSON() does not truncate non-string params ------------------------

console.log('\n--- toJSON() does not truncate non-string params ---');
{
  const ah = new ActionHistory();
  ah.push({
    tool: 'scroll',
    params: { x: 100, y: 200, arr: [1, 2, 3] },
    result: { success: true, hadEffect: true },
    iteration: 1
  });
  const json = ah.toJSON();
  assertEqual(json[0].params.x, 100, 'number param preserved');
  assertEqual(json[0].params.y, 200, 'number param preserved');
  assert(Array.isArray(json[0].params.arr), 'array param preserved');
}

// --- clear() empties history and returns old events ---------------------

console.log('\n--- clear() empties history ---');
{
  const ah = new ActionHistory();
  ah.push({ tool: 'click', params: {}, result: { success: true, hadEffect: true }, iteration: 1 });
  ah.push({ tool: 'type',  params: {}, result: { success: true, hadEffect: true }, iteration: 2 });
  const old = ah.clear();
  assertEqual(ah.length, 0, 'length is 0 after clear');
  assertEqual(old.length, 2, 'clear returns old events array');
  assertEqual(old[0].tool, 'click', 'old events preserved by clear');
}

// --- no cap on event count (local has no MAX) ----------------------------

console.log('\n--- local ActionHistory has no cap (architectural choice) ---');
{
  const ah = new ActionHistory();
  for (let i = 0; i < 300; i++) {
    ah.push({ tool: 't' + i, params: {}, result: { success: true, hadEffect: true }, iteration: i });
  }
  assertEqual(ah.length, 300, 'no cap — all 300 events retained');
  assertEqual(ah.events[0].tool, 't0', 'oldest event not dropped');
  assertEqual(ah.events[299].tool, 't299', 'newest event present');
}

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
