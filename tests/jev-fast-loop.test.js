#!/usr/bin/env node
'use strict';

/**
 * Phase 68 Plan 06 -- fast mode inside the real autopilot loop (D-01, D-08,
 * D-09, D-10, D-19, F1, F13, F21; AUTO-01..AUTO-05).
 *
 * tests/fixtures/agent-loop-fast-harness.js drives the real runAgentIteration
 * with a scripted provider, a recording content script and the real hook
 * pipeline. The suite proves:
 *
 *   - off golden: with the fast-path module not loaded and no session.fastMode,
 *     the golden scenario (click by selector, get_page_snapshot,
 *     complete_task) produces exactly tests/fixtures/jev-fast-loop-off-golden.json,
 *     which was captured from agent-loop.js before any fast-path seam existed;
 *   - off three-way: with the module loaded and no field, and with the module
 *     loaded and a session built from fsbFastModeSessionField(false) (still no
 *     field), the run is identical to that golden, and no fast-path dependency
 *     (menu, snapshot, switch, clock, decide) is touched;
 *   - slice hashes: buildSystemPrompt, getPublicTools, checkSafetyBreakers and
 *     detectStuck are byte-identical to P68_START (68-SYNC-RECHECK.md item h);
 *   - seam 1 guard shape: with the field absent the only new code before
 *     buildTurnMessages is a declaration, a falsy guard and one falsy test
 *     (no new await, no new return, no status read);
 *   - accepted step: with fast mode on, the background.js dependencies over the
 *     harness's chrome stub and a fake calibrated gateway, the first iteration
 *     is the LLM's (no menu), the second runs one code-built click (or
 *     check_box) through the permission hook and the content script with no
 *     provider request and no tool message, and the third hands back to the
 *     LLM with exactly one FAST MODE HAND-OFF message and no unpaired tool call;
 *   - TOOL_DISPATCH on a fast iteration: the unchanged emission reports
 *     previousStepName 'LLM_TURN' and no LLM_TURN is emitted for it;
 *   - permission denial: the real permission hook refuses the fast click, no
 *     content action is sent and the hand-off says nothing ran;
 *   - first-turn rule: the first iteration of a follow-up command requests no menu;
 *   - run_task (Phase 70, D-04/D-05): a session whose fastMode is the real
 *     fsbFastModeSessionField(true, 'mcp') output takes an accepted fast step
 *     exactly like an autopilot session; built from (false, 'mcp') or
 *     (undefined, 'mcp') it has no field and equals the golden; and under
 *     that field an uncertain fast click is dispatched once, a risky or
 *     text-field pick never acts and a permission denial still blocks, each
 *     run equal to the autopilot-field run (run_task safety parity);
 *   - containment: a throwing or rejecting beforeTurn, a throwing afterStep or
 *     observeTools never reaches the API-error path, and a stop during the
 *     decision ends the iteration with no provider call and no schedule.
 *
 * Plan 68-07 adds, through the same harness:
 *   - latches and budgets (Task 1): the uncalibrated latch (one menu, one
 *     decide, then the switch-off path), fallback classes (session, command,
 *     iteration and the escalation latch), the four per-command budgets, the
 *     completion and stuck gates, the D-17 no-progress latch, never re-roll
 *     (same state), the existing maxIterations and meta-attempt breakers with
 *     the per-page meta key, and no terminal tool in any fast call.
 *   - outcomes, pairing and containment (Task 2): an unknown outcome,
 *     bfCacheDetected, a stale target, a closed message channel and no answer
 *     each dispatch once and escalate once with a truthful hand-off; request
 *     bodies stay paired for xai, openai, anthropic, gemini, openrouter,
 *     lmstudio and custom; earlier hand-off snapshots collapse; a throwing
 *     beforeTurn or afterStep never reaches the API-error handler; a stop
 *     during an in-flight decision aborts it and dispatches nothing; turning
 *     the switch off mid-run latches fast mode off.
 *
 * Plan 70-03 adds the run evidence (D-14) through the harness option
 * registerRunEvidence, which registers the three handlers the way
 * background.js does: an LLM call that runs before complete_task in the same
 * turn is recorded (uncertain stays unresolved unless a page read follows,
 * and report_progress is not a page read); a fast step that showed no effect
 * is resolved only by a delivered hand-off snapshot; a permission-denied call
 * is never left in flight; and a switch-off session never gets the fields.
 *
 * Plan 70-05 adds "run_task outcome end to end" (SC2): a recorder in place
 * of fsbBroadcastAutomationLifecycle builds the fast_mode block inside the
 * terminal broadcast, as the bridge's settle does, and the block follows
 * what was executed and observed: an unobserved uncertain fast or LLM step
 * before complete_task is ambiguous, an observed or handed-off one is done,
 * manual_approval is needs_confirmation and an auth wall is blocked; the
 * jev summary reports the uncalibrated latch, the spent step budget and a
 * transient timeout without changing the outcome.
 *
 * Plan 68-08 adds recorded-llm capture through the same harness: on an armed
 * loopback fixture page with an uncalibrated gateway, one capture menu per
 * LLM-path iteration, labels from the LLM's own tool and the target the
 * content script observed (through the real background case), drops counted
 * by reason, and never a second decide; unarmed, no menu after the latch.
 * (Phase 70 replaced the 68-08 run_task golden case, which allowed one read
 * of the internal arm key, with the run_task cases above.)
 *
 * Only one harness is live at a time: createHarness installs its own chrome
 * and timer globals, and dispose() restores them.
 *
 * No network, no ports, no real waits. Node 20-safe.
 *
 * Run: node tests/jev-fast-loop.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const util = require('util');
const crypto = require('crypto');

process.exitCode = 1;

const ROOT = path.join(__dirname, '..');
const H = require('./fixtures/agent-loop-fast-harness.js');
const GOLDEN = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'jev-fast-loop-off-golden.json'), 'utf8'));
const agentLoopSource = fs.readFileSync(path.join(ROOT, 'extension', 'ai', 'agent-loop.js'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(ROOT, 'extension', 'background.js'), 'utf8');

/** The meta-attempt key of a fast call (WR-02): jev:<role>:<FNV-1a of "<pagePath>\n<role>\n<name>">. */
function metaKey(pagePath, role, name) {
  const text = pagePath + '\n' + role + '\n' + name;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return 'jev:' + role + ':' + hash.toString(16).padStart(8, '0');
}

// 68-SYNC-RECHECK.md item h, copied as literals (this suite never reads .planning).
const SLICE_HASHES = Object.freeze({
  buildSystemPrompt: 'f6d32b22c09f2461c51deae48470b87ae00024d7af9bce8908931b60cb94a7e0',
  getPublicTools: 'fa75f080ceb92723ccac1b2d95ec8ff191d20ac6ee9bc59e5a68c1f2baa49706',
  checkSafetyBreakers: '8a74f88a3894fad05372592f88965d60ad218d023dc3330f320e2fcc1858374a',
  detectStuck: '4f51f466bef4d3036830cc39ba27669086889259958f3ad14ec0ae4af0027aea'
});

let passed = 0;
let failed = 0;

function check(cond, name) {
  if (cond) {
    passed += 1;
    console.log('  PASS: ' + name);
  } else {
    failed += 1;
    console.error('  FAIL: ' + name);
  }
}

function section(title) {
  console.log('\n--- ' + title + ' ---');
}

/** item h slicing: through the brace that closes the body after the parameter list. */
function sliceFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) return null;
  let i = source.indexOf('(', start);
  for (let depth = 0; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')' && --depth === 0) break;
  }
  let j = source.indexOf('{', i);
  for (let depth = 0; j < source.length; j += 1) {
    if (source[j] === '{') depth += 1;
    else if (source[j] === '}' && --depth === 0) break;
  }
  return source.slice(start, j + 1);
}

/** fsbFastModeSessionField from background.js, evaluated alone. */
function loadSessionFieldHelper() {
  const ctx = vm.createContext({});
  vm.runInContext(sliceFunction(backgroundSource, 'fsbFastModeSessionField'), ctx);
  return ctx.fsbFastModeSessionField;
}

/** Index of the first differing event, for a readable failure. */
function firstDifference(actual, expected) {
  const a = actual.events || [];
  const e = expected.events || [];
  for (let i = 0; i < Math.max(a.length, e.length); i += 1) {
    if (!util.isDeepStrictEqual(a[i], e[i])) {
      return 'event ' + i + ': got ' + JSON.stringify(a[i]).slice(0, 400) + ' expected ' + JSON.stringify(e[i]).slice(0, 400);
    }
  }
  if (!util.isDeepStrictEqual(actual.final, expected.final)) return 'final state differs: ' + JSON.stringify(actual.final).slice(0, 600);
  return null;
}

function matchesGolden(record, label, quiet) {
  const expected = { events: GOLDEN.events, final: GOLDEN.final };
  const ok = util.isDeepStrictEqual(record.events, expected.events) && util.isDeepStrictEqual(record.final, expected.final);
  if (!ok && !quiet) console.error('    ' + label + ' differs from the golden at ' + firstDifference(record, expected));
  return ok;
}

/** A switch-off session never gets the Phase 70 run evidence fields (D-14). */
function noRunEvidence(session) {
  return !!session && !Object.prototype.hasOwnProperty.call(session, '_fastRunEvidence')
    && !Object.prototype.hasOwnProperty.call(session, '_fastRunStartPage');
}

/** Fast-path dependencies that record every call (none may happen on the off path). */
function recordingDeps() {
  const calls = [];
  return {
    calls,
    deps: {
      now() { calls.push('now'); return 0; },
      readSwitch() { calls.push('readSwitch'); return Promise.resolve(false); },
      requestMenu() { calls.push('requestMenu'); return Promise.resolve(null); },
      requestSnapshot() { calls.push('requestSnapshot'); return Promise.resolve(null); },
      getTabUrl() { calls.push('getTabUrl'); return Promise.resolve(null); }
    }
  };
}

async function offGoldenCases() {
  section('off golden: module not loaded, no session.fastMode (D-01)');
  check(Array.isArray(GOLDEN.events) && GOLDEN.events.length > 0 && GOLDEN.final && GOLDEN.final.status === 'completed',
    'the golden holds a completed three-iteration run');
  const { record, harness: runA } = await H.runGoldenScenario({ loadFastPath: false });
  check(matchesGolden(record, 'run A'), 'off golden: run A equals tests/fixtures/jev-fast-loop-off-golden.json event for event');
  check(noRunEvidence(runA.session), 'switch-off untouched: run A has no _fastRunEvidence or _fastRunStartPage key (Phase 70 D-14)');
  const providerEvents = record.events.filter((e) => e.type === 'provider');
  check(providerEvents.length === 3, 'run A makes three provider requests');
  check(record.events.filter((e) => e.type === 'schedule').length === 2, 'run A schedules two follow-on iterations');
  check(!('FsbFastPath' in globalThis), 'run A ran with no FsbFastPath global');

  // The comparison is not vacuous: one changed content answer, one extra
  // session message or one changed provider answer each break it.
  const changedSnapshot = await H.runGoldenScenario({
    loadFastPath: false,
    contentResponder: (message) => (message && message.action === 'getMarkdownSnapshot'
      ? { success: true, markdownSnapshot: '# Wizard (changed)', elementCount: 1 }
      : H.defaultContentResponder(message))
  });
  const extraMessage = await H.runGoldenScenario({
    loadFastPath: false,
    sessionPatch: { messages: [{ role: 'system', content: 'x' }, { role: 'user', content: 'FAST MODE HAND-OFF' }] }
  });
  const script = H.goldenProviderScript();
  script[0] = H.openAiToolResponse('resp_1', [{ id: 'call_1', name: 'click', args: { selector: '#other' } }]);
  const changedProvider = await H.runGoldenScenario({ loadFastPath: false, providerScript: script });
  check(!matchesGolden(changedSnapshot.record, 'changed snapshot', true)
    && !matchesGolden(extraMessage.record, 'extra message', true)
    && !matchesGolden(changedProvider.record, 'changed provider answer', true),
  'off golden: a changed content answer, an extra session message or a changed tool call each fail the comparison');
}

async function offThreeWayCases() {
  section('off three-way: module loaded, field absent (D-01)');
  const fieldFor = loadSessionFieldHelper();

  const b = recordingDeps();
  const runB = await H.runGoldenScenario({ loadFastPath: true, deps: b.deps, jevResponder: () => { b.calls.push('decide'); return new Promise(() => {}); } });
  check(runB.harness.fastPath && typeof runB.harness.fastPath.beforeTurn === 'function', 'run B loaded the real fast-path module');
  check(matchesGolden(runB.record, 'run B'), 'off three-way: run B (module loaded, no field) equals the golden');
  check(b.calls.length === 0, 'run B touched no fast-path dependency and made no decide call (' + b.calls.join(',') + ')');
  check(!runB.harness.contentMessages.some((m) => m.message && m.message.action === 'getJevMenu'), 'run B sent no getJevMenu message');
  check(!('_fastPath' in runB.harness.session) && !('jevMeasurement' in runB.harness.session), 'run B left no fast-path state on the session');
  check(noRunEvidence(runB.harness.session), 'switch-off untouched: run B has no _fastRunEvidence or _fastRunStartPage key (Phase 70 D-14)');

  const field = fieldFor(false, undefined);
  check(field === null, 'fsbFastModeSessionField(false, undefined) is null, so session C has no fastMode field');
  const c = recordingDeps();
  const runC = await H.runGoldenScenario({
    loadFastPath: true,
    deps: c.deps,
    jevResponder: () => { c.calls.push('decide'); return new Promise(() => {}); },
    sessionPatch: field ? { fastMode: field } : {}
  });
  check(!('fastMode' in runC.harness.session), 'session C carries no fastMode field');
  check(matchesGolden(runC.record, 'run C'), 'off three-way: run C (module loaded, switch false) equals the golden');
  check(c.calls.length === 0, 'run C touched no fast-path dependency and made no decide call (' + c.calls.join(',') + ')');
  check(!runC.harness.contentMessages.some((m) => m.message && m.message.action === 'getJevMenu'), 'run C sent no getJevMenu message');
  check(runC.harness.session.messages.length === GOLDEN.final.messages.length, 'run C added no session.messages entry');
  check(noRunEvidence(runC.harness.session), 'switch-off untouched: run C has no _fastRunEvidence or _fastRunStartPage key (Phase 70 D-14)');
  delete globalThis.FsbFastPath;
}

function sliceHashCases() {
  section('slice hashes: agent-loop.js functions Phase 68 must not touch (item h)');
  for (const name of Object.keys(SLICE_HASHES)) {
    const slice = sliceFunction(agentLoopSource, name);
    const hash = slice ? crypto.createHash('sha256').update(slice, 'utf8').digest('hex') : null;
    check(hash === SLICE_HASHES[name], 'slice hashes: ' + name + ' is byte-identical to P68_START (' + String(hash).slice(0, 12) + ')');
  }
}

// ---------------------------------------------------------------------------
// Fast mode on: fixtures
// ---------------------------------------------------------------------------

const gateway = require('./fixtures/jev-fake-gateway.js');
const FAST_FIELD = Object.freeze({ enabled: true, stored: true, source: null });
const WIZARD_URL = 'https://wizard.example/wizard/step-2';
const HANDOFF_PREFIX = 'FAST MODE HAND-OFF';

/** fsbCreateFastPathDeps from background.js, evaluated in this realm so chrome and the timers resolve to the harness's. */
function backgroundDepsFactory() {
  const code = '(function () {\n' + sliceFunction(backgroundSource, 'fsbFastPathWithDeadline') + '\n'
    + sliceFunction(backgroundSource, 'fsbFastPathCaptureWrite') + '\n'
    + sliceFunction(backgroundSource, 'fsbCreateFastPathDeps') + '\nreturn fsbCreateFastPathDeps;\n})()';
  return vm.runInThisContext(code, { filename: 'background.js#fsbCreateFastPathDeps' });
}
const createBackgroundDeps = backgroundDepsFactory();

/** One 68-02 menu entry: a fast-eligible button unless overridden. */
function entry(handle, over) {
  return Object.assign({
    handle,
    role: 'button',
    label: 'Button ' + handle,
    ops: ['click', 'hover'],
    inputType: null,
    autocomplete: null,
    purpose: { sensitive: false, danger: false, intent: null },
    hidden: false,
    risk: null,
    fastEligible: true,
    vaultFilled: false,
    state: { checked: null, expanded: null, selected: null, pressed: null },
    inViewport: true
  }, over || {});
}

/**
 * A content script for the wizard page. Its menu signature and generation
 * change after every fast action it receives, so the D-17 no-progress latch
 * never ends a run here; it answers one null per recent descriptor.
 */
function wizardContent(state) {
  return function respond(message) {
    if (message && message.action === 'getJevMenu') {
      const n = state.fastActions + 1;
      const options = message.options || {};
      const entries = [
        entry('j1', { label: 'Next' }),
        entry('j2', { role: 'checkbox', label: 'Agree', ops: ['check_box'], inputType: 'checkbox',
          state: { checked: false, expanded: null, selected: null, pressed: null } })
      ];
      return {
        success: true,
        generation: 'gen' + n + 'abcd-' + n,
        url: WIZARD_URL,
        title: 'Wizard',
        visibleText: 'Step 2 of 3',
        moreBelow: false,
        signature: 'sig-' + n,
        count: entries.length,
        truncated: false,
        entries,
        recentHandles: (Array.isArray(options.recent) ? options.recent : []).map(() => null)
      };
    }
    if (message && message.action === 'executeAction' && message.params && message.params.jevHandle) {
      state.fastActions += 1;
      return { success: true };
    }
    if (message && message.action === 'getMarkdownSnapshot') {
      return { success: true, markdownSnapshot: 'SNAP-HANDOFF e1 button "Next"', elementCount: 1 };
    }
    return H.defaultContentResponder(message);
  };
}

function idByLabel(request, label) {
  const element = request.elements.find((e) => e.label === label);
  return element ? element.id : gateway.CATCH_ALL;
}

/** A calibrated gateway answer: op on the element labelled label. */
function calibrated(op, label) {
  return (request) => ({ body: gateway.calibratedBody(request, {
    operation: { choice: op },
    target: { choice: idByLabel(request, label) }
  }) });
}

/** A calibrated answer that picks none_of_the_above for both choices. */
function catchAll(request) {
  return { body: gateway.calibratedBody(request, {
    operation: { choice: gateway.CATCH_ALL },
    target: { choice: gateway.CATCH_ALL }
  }) };
}

/** The events of step n (from its step marker to the next one). */
function stepEvents(events, n) {
  const start = events.findIndex((e) => e.type === 'step' && e.index === n);
  if (start < 0) return [];
  let end = events.findIndex((e, i) => i > start && e.type === 'step');
  if (end < 0) end = events.length;
  return events.slice(start + 1, end);
}

function ofType(events, type) {
  return events.filter((e) => e.type === type);
}

function contentActions(events, action) {
  return ofType(events, 'content').filter((e) => e.message && e.message.action === action);
}

function handoffMessages(messages) {
  return (messages || []).filter((m) => m && m.role === 'user' && typeof m.content === 'string' && m.content.indexOf(HANDOFF_PREFIX) === 0);
}

/** Every assistant tool call has a tool reply with its id, and every tool reply answers a call. */
function toolCallsPaired(messages) {
  const callIds = [];
  const replyIds = [];
  for (const m of messages || []) {
    if (m && m.role === 'assistant' && Array.isArray(m.tool_calls)) for (const c of m.tool_calls) callIds.push(c.id);
    if (m && m.role === 'tool') replyIds.push(m.tool_call_id);
  }
  return callIds.length === replyIds.length && callIds.every((id) => replyIds.includes(id));
}

/**
 * A fast-mode harness on the wizard page. opts: harness options plus
 * {answers: [responder per decide call], state}.
 */
function fastHarness(opts) {
  const o = opts || {};
  const state = o.state || { fastActions: 0 };
  const decideRequests = [];
  const answers = o.answers || [calibrated('click', 'Next'), catchAll];
  const h = H.createHarness(Object.assign({
    loadFastPath: true,
    storage: { fsbJevFastModeEnabled: true },
    sessionPatch: { fastMode: Object.assign({}, FAST_FIELD) },
    deps: createBackgroundDeps(),
    jevResponder: (request) => {
      decideRequests.push(request);
      const answer = answers[Math.min(decideRequests.length, answers.length) - 1];
      return answer(request);
    },
    contentResponder: wizardContent(state)
  }, o.harness || {}));
  return { h, state, decideRequests };
}

const LLM_CLICK = H.openAiToolResponse('resp_llm_1', [{ id: 'call_llm_1', name: 'click', args: { selector: '#start' } }]);
const LLM_SNAPSHOT = H.openAiToolResponse('resp_llm_1', [{ id: 'call_llm_1', name: 'get_page_snapshot', args: {} }]);
const LLM_DONE = H.openAiToolResponse('resp_llm_done', [{ id: 'call_llm_done', name: 'complete_task', args: { summary: 'Wizard finished' } }]);
const LLM_DONE_2 = H.openAiToolResponse('resp_llm_done_2', [{ id: 'call_llm_done_2', name: 'complete_task', args: { summary: 'Summary opened' } }]);

// ---------------------------------------------------------------------------
// Fast mode on: cases
// ---------------------------------------------------------------------------

function seamShapeCases() {
  section('seam 1 guard shape: the off path gains no await, no return and no status read (D-01)');
  const startToken = 'var _fastStep = null;';
  const endToken = 'var turnMessages = buildTurnMessages(session);';
  const startAt = agentLoopSource.indexOf(startToken);
  const endAt = agentLoopSource.indexOf(endToken);
  check(startAt >= 0 && endAt > startAt && agentLoopSource.indexOf(startToken, startAt + 1) === -1,
    'seam 1 guard shape: one var _fastStep = null; declared before buildTurnMessages');
  const slice = startAt >= 0 && endAt > startAt ? agentLoopSource.slice(startAt, endAt) : '';
  const guardAt = slice.indexOf('if (session.fastMode &&');
  let block = '';
  if (guardAt >= 0) {
    const open = slice.indexOf('{', guardAt);
    let depth = 0;
    let close = -1;
    for (let i = open; i < slice.length; i += 1) {
      if (slice[i] === '{') depth += 1;
      else if (slice[i] === '}' && --depth === 0) { close = i; break; }
    }
    block = close > open ? slice.slice(guardAt, close + 1) : '';
  }
  const statusReturns = (block.match(/if \(session\.status !== 'running'\) return;/g) || []).length;
  check(block.length > 0 && block.indexOf('await globalThis.FsbFastPath.beforeTurn(session') !== -1 && statusReturns === 1,
    'seam 1 guard shape: the session.fastMode block awaits beforeTurn and holds exactly one status return');
  check(block.length > 0 && /\}\s*$/.test(block) && block.lastIndexOf("if (session.status !== 'running') return;") > block.indexOf('await globalThis.FsbFastPath.beforeTurn(session'),
    'seam 1 guard shape: the status return comes after the await, inside the guarded block');
  const rest = block.length > 0 ? slice.replace(block, '') : slice;
  check(slice.length > 0 && !/\breturn\b/.test(rest) && !/\bawait\b/.test(rest) && rest.indexOf('session.status') === -1,
    'seam 1 guard shape: outside that block the slice has no return, no await and no session.status');
  check(/if \(_fastStep && _fastStep\.toolCall\) \{/.test(rest), 'seam 1 guard shape: the fast branch is a falsy test of _fastStep when the field is absent');
  // WR-03: afterStep runs once on the normal path (with the tool results) and,
  // only when that never ran, once more from the iteration catch (no results).
  const afterStepCalls = [];
  const afterStepRe = /globalThis\.FsbFastPath\.afterStep\(session, _fastStep\.step, ([^)]*)\)/g;
  for (let m = afterStepRe.exec(agentLoopSource); m; m = afterStepRe.exec(agentLoopSource)) afterStepCalls.push({ index: m.index, results: m[1] });
  const iterationCatchAt = agentLoopSource.indexOf('  } catch (error) {\n    // Phase 68 fast path (WR-03)');
  check((agentLoopSource.match(/globalThis\.FsbFastPath\.beforeTurn\(session/g) || []).length === 1
    && (agentLoopSource.match(/globalThis\.FsbFastPath\.afterStep\(session/g) || []).length === 2
    && afterStepCalls.length === 2 && afterStepCalls[0].results === 'toolResults' && afterStepCalls[1].results === '[]'
    && iterationCatchAt > afterStepCalls[0].index && afterStepCalls[1].index > iterationCatchAt
    && afterStepCalls[1].index - iterationCatchAt < 800,
  'seam 1 guard shape: one beforeTurn call; afterStep once on the normal path and once at the top of the iteration catch');
  const catchHead = iterationCatchAt > 0 ? agentLoopSource.slice(iterationCatchAt, afterStepCalls.length === 2 ? afterStepCalls[1].index : iterationCatchAt) : '';
  check(/_fastStep && _fastStep\.toolCall && _fastStep\.afterDone !== true/.test(catchHead) && /_fastStep\.afterDone = true;/.test(catchHead)
    && (agentLoopSource.match(/_fastStep\.afterDone = true;/g) || []).length === 2,
  'seam 1 guard shape: the catch call runs only when the normal-path afterStep never ran, and both paths mark it done');
}

async function acceptedStepCases() {
  section('accepted step: one code-built click through the real tool loop (D-08, D-09, D-10, D-19)');
  const { h, decideRequests } = fastHarness({ harness: { providerScript: [LLM_CLICK, LLM_DONE, LLM_DONE_2] } });
  try {
    await h.step();
    const it1 = stepEvents(h.events, 1);
    check(contentActions(it1, 'getJevMenu').length === 0 && decideRequests.length === 0,
      'first-turn rule: iteration 1 requests no menu and makes no decide call');
    check(ofType(it1, 'provider').length === 1, 'iteration 1 is the LLM turn (one provider request)');
    const messagesAfter1 = h.session.messages.length;

    await h.step();
    const it2 = stepEvents(h.events, 2);
    check(ofType(it2, 'provider').length === 0, 'accepted step: iteration 2 makes no provider request');
    check(contentActions(it2, 'getJevMenu').length === 1 && decideRequests.length === 1,
      'accepted step: iteration 2 makes one menu request and one decide call');
    const menuMessage = contentActions(it2, 'getJevMenu')[0];
    check(menuMessage && menuMessage.options && menuMessage.options.frameId === 0, 'the menu request goes to frame 0');
    const actions = contentActions(it2, 'executeAction');
    check(actions.length === 1 && actions[0].message.tool === 'click', 'accepted step: one executeAction with tool "click"');
    const params = actions.length === 1 ? actions[0].message.params : {};
    check(params.jevHandle === 'j1' && params.jevGeneration === 'gen1abcd-1' && params.expectedRole === 'button' && params.expectedName === 'Next',
      'accepted step: params carry jevHandle, jevGeneration, expectedRole and expectedName');
    check(!('selector' in params) && !('text' in params) && !('value' in params),
      'accepted step: params carry no selector, text or value');
    const history = h.session.actionHistory;
    const last = history[history.length - 1];
    check(last && last.tool === 'click' && last.iteration === 2 && last.decisionSource === 'jev' && last.params && last.params.jevHandle === 'j1',
      'accepted step: the actionHistory event is tagged decisionSource "jev"');
    check(h.session.messages.length === messagesAfter1 && !h.session.messages.some((m) => m.role === 'tool' && /^jev_/.test(String(m.tool_call_id))),
      'accepted step: session.messages gains no tool message and no other entry for the fast step');
    check(ofType(it2, 'schedule').length === 1 && ofType(it2, 'schedule')[0].delayMs === 100, 'accepted step: iteration 2 schedules the next iteration normally');
    check(h.session.agentState.iterationCount === 2 && h.session.iterationCount === 2, 'the fast iteration counts toward the existing iteration count');
    check(h.session._metaAttempts && Object.keys(h.session._metaAttempts).indexOf(metaKey('/wizard/step-2', 'button', 'Next')) !== -1,
      'the meta-attempt counter saw the fast click under the hashed key of /wizard/step-2, button, Next');

    await h.step();
    const it3 = stepEvents(h.events, 3);
    const requests3 = ofType(it3, 'provider');
    check(decideRequests.length === 2 && contentActions(it3, 'getJevMenu').length === 1,
      'iteration 3 asks once more and the gateway answers none_of_the_above');
    check(contentActions(it3, 'executeAction').length === 0, 'iteration 3 takes no fast step');
    check(requests3.length === 1, 'iteration 3 runs the LLM');
    const body = requests3.length === 1 ? requests3[0].requestBody : { messages: [] };
    const handoffs = handoffMessages(body.messages);
    check(handoffs.length === 1, 'the LLM request holds exactly one user message starting with FAST MODE HAND-OFF');
    check(handoffs.length === 1 && handoffs[0].content.indexOf('SNAP-HANDOFF') !== -1 && /click button "Next" \(page text\)/.test(handoffs[0].content),
      'the hand-off names the click on "Next" and carries the fresh snapshot');
    check(contentActions(it3, 'getMarkdownSnapshot').length === 1, 'the hand-off fetched one snapshot');
    check(toolCallsPaired(body.messages), 'the LLM request has no unpaired tool call');
    check(h.session.status === 'completed', 'the LLM completes the task after the hand-off');

    // First-turn rule after a follow-up (D-09, F14): a new command and a
    // rebuilt agentState, as reactivateSession and hydrateAgentRunState do.
    h.session.status = 'running';
    h.session.commandCount = 2;
    h.session.task = 'Now open the summary';
    h.session.commands = (h.session.commands || []).concat(['Now open the summary']);
    h.session.agentState = {
      iterationCount: 0,
      completedIterations: 0,
      totalInputTokens: h.session.totalInputTokens || 0,
      totalOutputTokens: h.session.totalOutputTokens || 0,
      totalCost: h.session.totalCost || 0,
      startTime: Date.now(),
      lastDOMHash: null,
      consecutiveNoChangeCount: 0
    };
    const decidesBefore = decideRequests.length;
    await h.step();
    const it4 = stepEvents(h.events, 4);
    check(contentActions(it4, 'getJevMenu').length === 0 && decideRequests.length === decidesBefore && ofType(it4, 'provider').length === 1,
      'first-turn rule: the first iteration of a follow-up command requests no menu and runs the LLM');
  } finally {
    h.dispose();
  }

  section('accepted step: check_box reaches the content script as toggleCheckbox with checked:true');
  const box = fastHarness({ answers: [calibrated('check_box', 'Agree'), catchAll], harness: { providerScript: [LLM_CLICK, LLM_DONE] } });
  try {
    await box.h.step();
    await box.h.step();
    const it2 = stepEvents(box.h.events, 2);
    const actions = contentActions(it2, 'executeAction');
    check(ofType(it2, 'provider').length === 0 && actions.length === 1 && actions[0].message.tool === 'toggleCheckbox',
      'check_box: one executeAction with the content verb "toggleCheckbox" and no provider request');
    const params = actions.length === 1 ? actions[0].message.params : {};
    check(params.checked === true && params.jevHandle === 'j2' && params.expectedRole === 'checkbox' && params.expectedName === 'Agree',
      'check_box: params.checked is true and the handle is the Agree checkbox');
  } finally {
    box.h.dispose();
  }
}

async function toolDispatchCase() {
  section('TOOL_DISPATCH on a fast iteration keeps previousStepName LLM_TURN (D-08 choice)');
  const transitions = [];
  const { h } = fastHarness({ harness: { providerScript: [LLM_CLICK, LLM_DONE] } });
  globalThis.sendLatticeStepTransition = function (payload) { transitions.push(JSON.parse(JSON.stringify(payload))); };
  try {
    await h.step();
    await h.step();
    const it2 = transitions.filter((t) => t.stepIndex === 2);
    check(it2.length === 1 && it2[0].stepName === 'TOOL_DISPATCH' && it2[0].previousStepName === 'LLM_TURN',
      'fast TOOL_DISPATCH: iteration 2 emits exactly one TOOL_DISPATCH with previousStepName LLM_TURN');
    check(!it2.some((t) => t.stepName === 'LLM_TURN'), 'fast TOOL_DISPATCH: no LLM_TURN is emitted for the fast iteration');
    const it1 = transitions.filter((t) => t.stepIndex === 1);
    check(it1.length === 2 && it1[0].stepName === 'LLM_TURN' && it1[1].stepName === 'TOOL_DISPATCH', 'the LLM iteration still emits LLM_TURN then TOOL_DISPATCH');
  } finally {
    delete globalThis.sendLatticeStepTransition;
    h.dispose();
  }
  check(typeof globalThis.sendLatticeStepTransition === 'undefined', 'the transition recorder is removed after the case');
}

async function permissionDenialCase() {
  section('permission denial: the real permission hook refuses the fast click (D-19)');
  const results = [];
  const { h, decideRequests } = fastHarness({ harness: { providerScript: [LLM_SNAPSHOT, LLM_DONE], permissionDenies: ['click'] } });
  const real = h.fastPath;
  globalThis.FsbFastPath = Object.assign({}, real, {
    afterStep(session, step, toolResults) {
      results.push(JSON.parse(JSON.stringify(toolResults)));
      return real.afterStep(session, step, toolResults);
    }
  });
  try {
    await h.step();
    await h.step();
    const it2 = stepEvents(h.events, 2);
    check(decideRequests.length === 1 && ofType(it2, 'provider').length === 0, 'the fast click was accepted by the decision and no provider request ran');
    check(contentActions(it2, 'executeAction').length === 0, 'denial: no executeAction is sent for the denied fast call');
    const fastResult = results.length === 1 && results[0].length === 1 ? results[0][0].result : null;
    check(fastResult && JSON.stringify(fastResult) === JSON.stringify({
      success: false, hadEffect: false, error: 'Tool "click" is not permitted for this origin', navigationTriggered: false, result: null
    }), 'denial: the fast call result is the agent-loop denial shape with the production text');
    await h.step();
    const it3 = stepEvents(h.events, 3);
    const requests3 = ofType(it3, 'provider');
    const handoffs = requests3.length === 1 ? handoffMessages(requests3[0].requestBody.messages) : [];
    check(requests3.length === 1 && handoffs.length === 1, 'denial: the next iteration runs the LLM with one hand-off');
    check(handoffs.length === 1 && handoffs[0].content.indexOf('not permitted, so nothing ran') !== -1 && handoffs[0].content.indexOf('not run: not permitted') !== -1,
      'denial: the hand-off says the step was not permitted and nothing ran');
    check(contentActions(it3, 'getJevMenu').length === 0, 'denial: the LLM takes that turn without another fast attempt');
  } finally {
    h.dispose();
  }
}

/** A jevMeasurement copy with its wall-clock timings (attempt latencyMs, command jevMs) nulled. */
function wallClockFree(measurement) {
  const copy = JSON.parse(JSON.stringify(measurement || null));
  if (!copy) return copy;
  for (const attempt of copy.attempts || []) attempt.latencyMs = null;
  for (const command of copy.commands || []) command.jevMs = null;
  return copy;
}

async function runTaskCase() {
  section('run_task takes an accepted fast step: the real helper field for (true, "mcp") through the real tool loop (Phase 70 D-04, D-05)');
  const fieldFor = loadSessionFieldHelper();
  const field = fieldFor(true, 'mcp');
  check(JSON.stringify(field) === JSON.stringify({ enabled: true, stored: true, source: 'mcp', budgetProfile: 'run_task' }),
    'run_task takes an accepted fast step: the session field is the real helper output for (true, "mcp") (' + JSON.stringify(field) + ')');
  const runs = {};
  for (const [name, fastMode] of [['run_task', field], ['autopilot', Object.assign({}, FAST_FIELD)]]) {
    const { h, decideRequests } = fastHarness({ harness: { providerScript: [LLM_CLICK, LLM_DONE, LLM_DONE_2], sessionPatch: { fastMode } } });
    try {
      await h.step();
      await h.step();
      await h.step();
      runs[name] = { h, decideRequests, events: JSON.parse(JSON.stringify(h.events)), messages: JSON.parse(JSON.stringify(h.session.messages)),
        status: h.session.status,
        // actionHistory timestamp and durationMs are the loop's wall clock; everything else must match.
        actionHistory: JSON.parse(JSON.stringify(h.session.actionHistory || [])).map((event) => Object.assign(event, { timestamp: null, durationMs: null })),
        measurement: wallClockFree(h.session.jevMeasurement) };
    } finally {
      h.dispose();
    }
  }
  const r = runs.run_task;
  const it1 = stepEvents(r.events, 1);
  check(contentActions(it1, 'getJevMenu').length === 0 && ofType(it1, 'provider').length === 1,
    'run_task takes an accepted fast step: iteration 1 runs the LLM and requests no menu (first-turn rule)');
  const it2 = stepEvents(r.events, 2);
  const actions = contentActions(it2, 'executeAction');
  check(ofType(it2, 'provider').length === 0 && contentActions(it2, 'getJevMenu').length === 1 && actions.length === 1 && actions[0].message.tool === 'click',
    'run_task takes an accepted fast step: iteration 2 makes no provider request and sends one executeAction with tool "click"');
  const params = actions.length === 1 ? actions[0].message.params : {};
  check(params.jevHandle === 'j1' && params.jevGeneration === 'gen1abcd-1' && params.expectedRole === 'button' && params.expectedName === 'Next'
    && !('selector' in params) && !('text' in params) && !('value' in params),
  'run_task takes an accepted fast step: params carry jevHandle, jevGeneration, expectedRole and expectedName and no selector, text or value');
  const it3 = stepEvents(r.events, 3);
  const requests3 = ofType(it3, 'provider');
  const handoffs = requests3.length === 1 ? handoffMessages(requests3[0].requestBody.messages) : [];
  check(requests3.length === 1 && handoffs.length === 1 && contentActions(it3, 'executeAction').length === 0,
    'run_task takes an accepted fast step: iteration 3 runs the LLM with exactly one FAST MODE HAND-OFF user message');
  check(r.status === 'completed' && r.decideRequests.length === 2, 'run_task takes an accepted fast step: the LLM completes the task after the hand-off (two decide calls)');
  const a = runs.autopilot;
  check(util.isDeepStrictEqual(r.events, a.events) && util.isDeepStrictEqual(r.messages, a.messages) && util.isDeepStrictEqual(r.actionHistory, a.actionHistory)
    && util.isDeepStrictEqual(r.measurement, a.measurement) && util.isDeepStrictEqual(r.decideRequests, a.decideRequests),
  'run_task takes an accepted fast step: the run equals the autopilot-field run event for event (content, provider, schedules, messages, actionHistory, measurement and decide requests, wall-clock timings aside)');

  section('run_task switch off: the helper gives no field, so the run equals the golden (Phase 70 D-04, D-05)');
  for (const [label, stored, storage] of [['(false, "mcp")', false, { fsbJevFastModeEnabled: false }], ['(undefined, "mcp")', undefined, {}]]) {
    const off = fieldFor(stored, 'mcp');
    check(off === null, 'run_task switch off: fsbFastModeSessionField' + label + ' is null, so the session has no fastMode field');
    const rec = recordingDeps();
    const decides = [];
    const { record, harness } = await H.runGoldenScenario({
      loadFastPath: true,
      storage,
      deps: rec.deps,
      jevResponder: (request) => { decides.push(request); return catchAll(request); },
      sessionPatch: off ? { fastMode: off } : {}
    });
    check(!('fastMode' in harness.session), 'run_task switch off: ' + label + ' session carries no fastMode field');
    check(matchesGolden(record, 'run_task switch off ' + label), 'run_task switch off: ' + label + ' equals tests/fixtures/jev-fast-loop-off-golden.json');
    check(rec.calls.length === 0 && decides.length === 0 && !harness.contentMessages.some((m) => m.message && m.message.action === 'getJevMenu'),
      'run_task switch off: ' + label + ' touches no fast-path dependency, requests no menu and makes no decide call');
    check(!record.events.some((e) => e.type === 'storage-set') && !('_fastPath' in harness.session) && !('jevMeasurement' in harness.session),
      'run_task switch off: ' + label + ' writes nothing to storage and leaves no fast-path state');
    check(noRunEvidence(harness.session), 'switch-off untouched: the run_task switch-off run ' + label + ' has no _fastRunEvidence or _fastRunStartPage key (Phase 70 D-14)');
  }
  delete globalThis.FsbFastPath;
}

/** A harness whose FsbFastPath is a stub; returns {h}. */
function stubbedHarness(stub, script) {
  const h = H.createHarness({
    loadFastPath: true,
    sessionPatch: { fastMode: Object.assign({}, FAST_FIELD) },
    providerScript: script || [LLM_CLICK, LLM_DONE]
  });
  globalThis.FsbFastPath = stub;
  return h;
}

async function containmentCases() {
  section('containment: fast-path errors never reach the API-error path (F13); a stop ends the iteration (F21)');
  const noop = () => {};
  const variants = [
    ['throws', { beforeTurn() { throw new Error('beforeTurn threw'); }, afterStep: noop, observeTools: noop }],
    ['rejects', { beforeTurn() { return Promise.reject(new Error('beforeTurn rejected')); }, afterStep: noop, observeTools: noop }],
    ['observeTools throws', { beforeTurn() { return Promise.resolve({ decline: 'first_llm_turn' }); }, afterStep: noop, observeTools() { throw new Error('observe threw'); } }]
  ];
  for (const [label, stub] of variants) {
    const h = stubbedHarness(stub);
    try {
      await h.step();
      const it1 = stepEvents(h.events, 1);
      const schedules = ofType(it1, 'schedule');
      check(ofType(it1, 'provider').length === 1 && contentActions(it1, 'executeAction').length === 1
        && schedules.length === 1 && schedules[0].delayMs === 100 && h.session.status === 'running'
        && h.session.agentState.iterationCount === 1,
      'containment: a beforeTurn/observeTools that ' + label + ' leaves the iteration to the LLM with a normal 100 ms schedule');
    } finally {
      h.dispose();
    }
  }

  const afterThrows = stubbedHarness({
    beforeTurn() { return Promise.resolve({ toolCall: { id: 'jev_1_1', name: 'scroll', args: { direction: 'down' }, source: 'jev', pagePath: '/x' }, step: { callId: 'jev_1_1' } }); },
    afterStep() { throw new Error('afterStep threw'); },
    observeTools: noop
  });
  try {
    await afterThrows.step();
    const it1 = stepEvents(afterThrows.events, 1);
    const schedules = ofType(it1, 'schedule');
    check(ofType(it1, 'provider').length === 0 && schedules.length === 1 && schedules[0].delayMs === 100 && afterThrows.session.status === 'running',
      'containment: an afterStep that throws leaves the fast iteration to finish and schedule normally');
    check(!afterThrows.session.messages.some((m) => m.role === 'tool'), 'containment: the fast step still adds no tool message');
  } finally {
    afterThrows.dispose();
  }

  let stopSession = null;
  const stopped = stubbedHarness({
    beforeTurn(session) {
      stopSession = session;
      session.status = 'stopped';
      return Promise.resolve({ decline: 'stopped' });
    },
    afterStep: noop,
    observeTools: noop
  });
  try {
    await stopped.step();
    const it1 = stepEvents(stopped.events, 1);
    check(stopSession === stopped.session && ofType(it1, 'provider').length === 0 && ofType(it1, 'schedule').length === 0
      && ofType(it1, 'persist').length === 0 && contentActions(it1, 'executeAction').length === 0,
    'stop during the decision: the iteration ends with no provider call, no action, no persist and no schedule');
  } finally {
    stopped.dispose();
  }
}

// ---------------------------------------------------------------------------
// Plan 68-07 Task 1: latches, budgets, completion and stuck gates, and the
// existing breakers, all through the real runAgentIteration (D-12, D-16,
// D-17, D-18, F1; AUTO-03-d, AUTO-04-a..c, AUTO-05-b).
// ---------------------------------------------------------------------------

const TERMINAL_TOOLS = ['complete_task', 'partial_task', 'fail_task'];
// Every fast call a loop case executed (actionHistory decisionSource 'jev').
const executedFastTools = [];
// A bench goal holding a run token: the 67-01 high-entropy rule refuses it locally (F5).
const BENCH_GOAL = 'Open http://127.0.0.1:53211/r/Ab3dEf9hIj2kLm5nOp8qRs/fixtures/checklist/index.html. Tick Alpha.';

/** The fast-path module (already loaded by the harness; require is cached). */
function fastPathApi() {
  return require('../extension/ai/jev-fast-path.js');
}

function itemEntries(count) {
  const list = [];
  for (let i = 1; i <= count; i += 1) list.push(entry('j' + i, { label: 'Item ' + i }));
  return list;
}
const ITEM_ENTRIES = itemEntries(20);
const NEXT_ENTRIES = [entry('j1', { label: 'Next' }), entry('j2', { label: 'Back' })];

/** A calibrated answer: op on the control labelled label, plus extra picks (completion, stuck, ...). */
function calibratedPick(op, label, extra) {
  return (request) => ({ body: gateway.calibratedBody(request, Object.assign({
    operation: { choice: op },
    target: { choice: idByLabel(request, label) }
  }, extra || {})) });
}

/** The i-th decide (0-based) clicks "Item <i+1>", so every fast step hits a different control. */
function clickNthItem(request, info, index) {
  return calibratedPick('click', 'Item ' + (index + 1))(request);
}

/** A calibrated answer whose operation confidence is below its cut (operation_below_threshold). */
function belowThresholdOp(request) {
  return { body: gateway.calibratedBody(request, {
    operation: { choice: 'click', confidence: 0.5 },
    target: { choice: request.elements.length > 0 ? request.elements[0].id : gateway.CATCH_ALL }
  }) };
}

/** LLM turns that only read the page: get_page_snapshot, a fresh call id each turn. */
function llmSnapshotScript() {
  return (index) => H.openAiToolResponse('resp_snap_' + index, [{ id: 'call_snap_' + index, name: 'get_page_snapshot', args: {} }]);
}

/**
 * A fast-mode run on the real loop. opts: answers (scriptedGateway), content
 * (signatureMenuContent options; ITEM_ENTRIES by default), clock (a fake
 * clock for the deps and the client), fast (false: no session.fastMode, the
 * switch-off session), maxIterations (40), task, providerScript,
 * providerKey, sessionPatch, field (the session.fastMode value when fast is
 * not false; FAST_FIELD by default, Phase 70 passes the run_task field).
 */
function loopRun(opts) {
  const o = opts || {};
  const content = H.signatureMenuContent(Object.assign({ entries: ITEM_ENTRIES }, o.content || {}));
  const gw = H.scriptedGateway(o.answers || [catchAll]);
  const deps = createBackgroundDeps();
  if (o.clock) deps.now = o.clock.now;
  const rec = H.recordingJevClient(gw.responder, { now: deps.now });
  const sessionPatch = Object.assign({ maxIterations: o.maxIterations || 40 }, o.sessionPatch || {});
  if (o.fast !== false) sessionPatch.fastMode = Object.assign({}, o.field || FAST_FIELD);
  const harnessOptions = {
    loadFastPath: true,
    storage: { fsbJevFastModeEnabled: o.fast !== false },
    sessionPatch,
    deps,
    jevClient: rec.client,
    contentResponder: content.respond,
    providerScript: o.providerScript || llmSnapshotScript()
  };
  if (o.task) harnessOptions.task = o.task;
  if (o.providerKey) harnessOptions.providerKey = o.providerKey;
  const h = H.createHarness(harnessOptions);
  return { h, content, gw, rec, steps: [] };
}

/** Run n iterations, recording per iteration what the loop and the fast path did. */
async function runSteps(run, n) {
  for (let i = 0; i < n; i += 1) {
    const decidesBefore = run.rec.decides.length;
    const callsBefore = run.gw.requests.length;
    await run.h.step();
    const index = run.h.stepsRun;
    const ev = stepEvents(run.h.events, index);
    const actions = contentActions(ev, 'executeAction');
    const jf = run.h.session.agentState ? run.h.session.agentState.jevFast : null;
    run.steps.push({
      index,
      providerEvents: ofType(ev, 'provider'),
      provider: ofType(ev, 'provider').length,
      menus: contentActions(ev, 'getJevMenu').length,
      snapshots: contentActions(ev, 'getMarkdownSnapshot').length,
      decides: run.rec.decides.length - decidesBefore,
      gatewayCalls: run.gw.requests.length - callsBefore,
      fast: actions.filter((e) => e.message.params && e.message.params.jevHandle).length,
      actions: actions.length,
      schedules: ofType(ev, 'schedule').length,
      status: run.h.session.status,
      latched: jf ? jf.latched : null,
      consecutiveEscalations: jf ? jf.consecutiveEscalations : null,
      jevMs: jf ? jf.jevMs : null
    });
  }
  return run.steps;
}

function total(run, key) {
  return run.steps.reduce((sum, s) => sum + s[key], 0);
}

function iterationsWhere(run, key) {
  return run.steps.filter((s) => s[key] > 0).map((s) => s.index);
}

/** The hand-off messages in the (openai-format) LLM request of one recorded step. */
function handoffsIn(step) {
  const body = step && step.providerEvents.length === 1 ? step.providerEvents[0].requestBody : null;
  return body && Array.isArray(body.messages) ? handoffMessages(body.messages) : [];
}

function jevFastOf(run) {
  return (run.h.session.agentState && run.h.session.agentState.jevFast) || {};
}

function fastStateOf(run) {
  return run.h.session._fastPath || {};
}

/** A follow-up command on the same session, as reactivateSession and hydrateAgentRunState leave it. */
function startFollowUp(h, task) {
  h.session.status = 'running';
  h.session.commandCount = (h.session.commandCount || 1) + 1;
  h.session.task = task;
  h.session.commands = (h.session.commands || []).concat([task]);
  h.session.agentState = {
    iterationCount: 0,
    completedIterations: 0,
    totalInputTokens: h.session.totalInputTokens || 0,
    totalOutputTokens: h.session.totalOutputTokens || 0,
    totalCost: h.session.totalCost || 0,
    startTime: Date.now(),
    lastDOMHash: null,
    consecutiveNoChangeCount: 0
  };
}

/** Collect the run's executed fast calls, then restore the globals. */
function finish(run) {
  for (const event of run.h.session.actionHistory || []) {
    if (event && event.decisionSource === 'jev') executedFastTools.push(event.tool);
  }
  run.h.dispose();
}

/** Still running, and fast mode never applied a terminal outcome. */
function stillRunning(run) {
  return run.h.session.status === 'running' && run.h.session.outcome === undefined && run.h.session.outcomeDetails === undefined;
}

function sixTurnScript() {
  return [
    H.openAiToolResponse('resp_u1', [{ id: 'call_u1', name: 'click', args: { selector: '#a' } }]),
    H.openAiToolResponse('resp_u2', [{ id: 'call_u2', name: 'get_page_snapshot', args: {} }]),
    H.openAiToolResponse('resp_u3', [{ id: 'call_u3', name: 'click', args: { selector: '#b' } }]),
    H.openAiToolResponse('resp_u4', [{ id: 'call_u4', name: 'get_page_snapshot', args: {} }]),
    H.openAiToolResponse('resp_u5', [{ id: 'call_u5', name: 'click', args: { selector: '#c' } }]),
    H.openAiToolResponse('resp_u6', [{ id: 'call_u6', name: 'get_page_snapshot', args: {} }])
  ];
}

async function uncalibratedLatchCases() {
  section('latches and budgets: the uncalibrated latch through the loop (D-16, AUTO-03-d)');
  const off = loopRun({ fast: false, providerScript: sixTurnScript() });
  try {
    await runSteps(off, 6);
  } finally {
    finish(off);
  }
  check(off.steps.every((s) => s.provider === 1 && s.menus === 0 && s.decides === 0) && stillRunning(off),
    'uncalibrated latch: the switch-off reference run is six LLM turns with no menu and no decide');

  const bodies = [['uncalibrated', gateway.uncalibratedBody], ['snapshot_changed', gateway.snapshotChangedBody]];
  for (const [label, makeBody] of bodies) {
    const on = loopRun({ providerScript: sixTurnScript(), answers: [(request) => ({ body: makeBody(request) })] });
    try {
      await runSteps(on, 6);
      check(total(on, 'menus') === 1 && on.steps[1].menus === 1 && total(on, 'decides') === 1 && on.steps[1].decides === 1 && on.gw.requests.length === 1,
        'uncalibrated latch (' + label + '): exactly one getJevMenu and one decide in the whole session, both in iteration 2');
      check(on.steps.every((s) => s.provider === 1 && s.fast === 0),
        'uncalibrated latch (' + label + '): every iteration, iteration 2 included, runs the LLM and no fast step acts');
      check(on.steps.slice(2).every((s) => s.menus === 0 && s.decides === 0 && s.snapshots === (off.steps[s.index - 1].snapshots)),
        'uncalibrated latch (' + label + '): iterations 3-6 send no getJevMenu, make no decide and fetch no extra snapshot');
      check(handoffMessages(on.h.session.messages).length === 0
        && util.isDeepStrictEqual(on.h.finalState().messages, off.h.finalState().messages),
      'uncalibrated latch (' + label + '): fast mode added nothing to session.messages (it equals the switch-off run)');
      let sameBodies = true;
      for (let k = 2; k < 6; k += 1) {
        if (!util.isDeepStrictEqual(on.steps[k].providerEvents, off.steps[k].providerEvents)) sameBodies = false;
      }
      check(sameBodies, 'uncalibrated latch (' + label + '): the provider request bodies of iterations 3-6 equal the switch-off run');
      check(util.isDeepStrictEqual(on.steps[1].providerEvents, off.steps[1].providerEvents),
        'uncalibrated latch (' + label + '): iteration 2\'s LLM request (after the declined attempt) also equals the switch-off run');
      check(fastStateOf(on).off === true && fastStateOf(on).offReason === 'not_calibrated' && stillRunning(on),
        'uncalibrated latch (' + label + '): the session latch reads not_calibrated and the session keeps running');
    } finally {
      finish(on);
    }
  }
}

async function fallbackClassCases() {
  section('latches and budgets: fallback classes through the loop (D-16, AUTO-05-b)');
  const sessionClass = [
    ['disabled', () => ({ body: gateway.fallbackBody('disabled') }), 'disabled'],
    ['invalid_request (a 404 with no body)', () => ({ status: 404, text: '' }), 'invalid_request']
  ];
  for (const [label, answer, reason] of sessionClass) {
    const run = loopRun({ answers: [answer] });
    try {
      await runSteps(run, 4);
      check(run.gw.requests.length === 1 && total(run, 'decides') === 1 && run.steps[1].decides === 1 && run.steps[1].provider === 1,
        'fallback ' + label + ': one Jev call in iteration 2, and that iteration runs the LLM');
      check(run.steps.slice(2).every((s) => s.menus === 0 && s.decides === 0 && s.provider === 1),
        'fallback ' + label + ': later iterations send no menu request and make no decide');
      check(fastStateOf(run).off === true && fastStateOf(run).offReason === reason, 'fallback ' + label + ': the session latch names ' + reason);
      startFollowUp(run.h, 'Now open the summary');
      await runSteps(run, 3);
      check(run.steps.slice(4).every((s) => s.menus === 0 && s.decides === 0 && s.provider === 1) && run.gw.requests.length === 1,
        'fallback ' + label + ': a follow-up command in the same session still makes no menu request and no decide (session latch: one call in the session)');
      check(stillRunning(run), 'fallback ' + label + ': the session keeps running with no outcome from fast mode');
    } finally {
      finish(run);
    }
  }

  const sens = loopRun({ task: BENCH_GOAL });
  try {
    await runSteps(sens, 4);
    check(sens.steps[1].menus === 1 && total(sens, 'decides') === 0 && sens.gw.requests.length === 0 && sens.steps[1].provider === 1,
      'fallback sensitive_goal: a goal holding a run token is refused locally (one menu, zero decide calls) and the LLM runs');
    check(jevFastOf(sens).latched === 'sensitive_goal' && fastStateOf(sens).off === false,
      'fallback sensitive_goal: it latches the command, not the session');
    check(sens.steps.slice(2).every((s) => s.menus === 0 && s.decides === 0), 'fallback sensitive_goal: the rest of the command sends no menu request');
    startFollowUp(sens.h, 'Now open the summary page');
    await runSteps(sens, 2);
    check(sens.steps[4].menus === 0 && sens.steps[5].menus === 1 && sens.steps[5].decides === 1,
      'fallback sensitive_goal: the next command, with a clean goal, asks Jev again after its first LLM turn');
  } finally {
    finish(sens);
  }

  // WR-04: before any calibrated answer in the session, every fallback class
  // latches the session, so an uncalibrated or failing gateway is asked once
  // per session (the disclosure's "one step description").
  for (const reason of ['timeout', 'busy', 'rate_limited', 'upstream_error']) {
    const once = loopRun({ answers: [() => ({ body: gateway.fallbackBody(reason) })] });
    try {
      await runSteps(once, 4);
      startFollowUp(once.h, 'Now open the summary');
      await runSteps(once, 3);
      check(once.steps[1].decides === 1 && once.steps[1].provider === 1 && total(once, 'decides') === 1 && once.gw.requests.length <= 1
        && once.steps.slice(2).every((s) => s.menus === 0 && s.decides === 0 && s.provider === 1),
      'WR-04 one step description: a ' + reason + ' fallback before any calibrated answer leaves one decide in the session, follow-up included');
      check(fastStateOf(once).off === true && fastStateOf(once).offReason === reason && stillRunning(once),
        'WR-04: the ' + reason + ' fallback latched the session and the task keeps running on the LLM');
    } finally {
      finish(once);
    }
  }

  // After a calibrated answer (a catch-all on another page state), a
  // transient fallback costs that iteration only.
  const timeoutRun = loopRun({
    content: { signature: (state) => (state.menuRequests === 1 ? 'S-first' : 'S-fixed') },
    answers: [catchAll, () => ({ body: gateway.fallbackBody('timeout', 504) }), clickNthItem]
  });
  try {
    await runSteps(timeoutRun, 4);
    check(timeoutRun.steps[1].decides === 1 && timeoutRun.steps[1].fast === 0 && fastStateOf(timeoutRun).calibratedSeen === true,
      'fallback timeout: iteration 2 gets a calibrated catch-all answer');
    check(timeoutRun.steps[2].decides === 1 && timeoutRun.steps[2].provider === 1 && timeoutRun.steps[2].fast === 0,
      'fallback timeout: iteration 3 escalates that iteration only and runs the LLM');
    check(timeoutRun.steps[3].menus === 1 && timeoutRun.steps[3].decides === 1 && timeoutRun.steps[3].fast === 1 && timeoutRun.steps[3].provider === 0,
      'fallback timeout: after the next LLM turn fast mode asks again on the same page state and acts (a fallback is not an answer)');
    check(!jevFastOf(timeoutRun).latched && fastStateOf(timeoutRun).off === false && stillRunning(timeoutRun),
      'fallback timeout: no latch is left behind');
  } finally {
    finish(timeoutRun);
  }

  const busy = loopRun({ answers: [catchAll, () => ({ body: gateway.fallbackBody('busy') })] });
  try {
    await runSteps(busy, 6);
    check(busy.steps.slice(1, 4).every((s) => s.decides === 1 && s.provider === 1 && s.fast === 0),
      'escalation latch: iterations 2-4 each make one decide (a calibrated catch-all, then transient fallbacks) and run the LLM');
    check(busy.steps.slice(4).every((s) => s.menus === 0 && s.decides === 0 && s.provider === 1) && total(busy, 'decides') === 3,
      'escalation latch: three consecutive escalations latch the command; there is no fourth decide');
    check(jevFastOf(busy).latched === 'escalation_latch' && fastStateOf(busy).off === false && stillRunning(busy),
      'escalation latch: the command latch reads escalation_latch, the session is not latched and keeps running');
  } finally {
    finish(busy);
  }
}

async function budgetCases() {
  section('latches and budgets: the four per-command budgets switch to LLM-only and never end the task (D-12, AUTO-04-a)');
  const FAST = fastPathApi().constants;
  check(FAST.FAST_MAX_CONSECUTIVE === 3 && FAST.FAST_MAX_STEPS === 12 && FAST.FAST_MAX_CALLS === 16 && FAST.FAST_WALL_BUDGET_MS === 20000,
    'the budgets under test are FAST_MAX_CONSECUTIVE 3, FAST_MAX_STEPS 12, FAST_MAX_CALLS 16 and FAST_WALL_BUDGET_MS 20000');

  const cap = loopRun({ answers: [clickNthItem] });
  try {
    await runSteps(cap, 6);
    check(cap.steps.slice(1, 4).every((s) => s.fast === 1 && s.provider === 0),
      'consecutive cap: iterations 2-4 are three effective fast steps with no provider request');
    check(cap.steps[4].provider === 1 && cap.steps[4].menus === 0 && cap.steps[4].decides === 0 && cap.steps[4].fast === 0,
      'consecutive cap: FAST_MAX_CONSECUTIVE forces iteration 5 onto the LLM with no menu and no decide');
    const handoffs = handoffsIn(cap.steps[4]);
    check(handoffs.length === 1 && handoffs[0].content.indexOf('Fast mode took 3 steps') !== -1
      && handoffs[0].content.indexOf(fastPathApi().describeEscalation('consecutive_cap')) !== -1,
    'consecutive cap: that LLM request carries one hand-off listing the 3 steps and the consecutive-cap reason');
    check(cap.steps[5].fast === 1 && stillRunning(cap), 'consecutive cap: the command is not latched; iteration 6 takes a fast step again');
  } finally {
    finish(cap);
  }

  const stepBudget = loopRun({ answers: [clickNthItem] });
  try {
    await runSteps(stepBudget, 19);
    const fastIterations = iterationsWhere(stepBudget, 'fast');
    check(total(stepBudget, 'fast') === 12 && util.isDeepStrictEqual(fastIterations, [2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15, 16]),
      'step budget: twelve effective fast steps run, three at a time between LLM turns (' + fastIterations.join(',') + ')');
    check(stepBudget.steps.slice(16).every((s) => s.fast === 0 && s.provider === 1) && total(stepBudget, 'decides') === 12,
      'step budget: the twelfth fast step is the last one in the command; every later iteration runs the LLM');
    check(stepBudget.steps[17].menus === 0 && stepBudget.steps[17].decides === 0 && jevFastOf(stepBudget).latched === 'step_budget',
      'step budget: iteration 18 latches the command step_budget before any menu or decide');
    check(stillRunning(stepBudget), 'step budget: the session keeps running; fast mode applied no terminal outcome');
  } finally {
    finish(stepBudget);
  }

  const callBudget = loopRun({ answers: [(request, info, index) => (index % 2 === 0 ? clickNthItem(request, info, index) : belowThresholdOp(request))] });
  try {
    await runSteps(callBudget, 18);
    const decideIterations = iterationsWhere(callBudget, 'decides');
    check(total(callBudget, 'decides') === 16 && decideIterations[decideIterations.length - 1] === 17 && decideIterations.length === 16,
      'call budget: alternating an acted step and a below-threshold escalation, the sixteenth decide (iteration 17) is the last one in the command');
    check(total(callBudget, 'fast') === 8 && callBudget.steps.filter((s) => s.decides === 1 && s.fast === 0).every((s) => s.provider === 1),
      'call budget: eight steps acted and every escalated iteration ran the LLM');
    check(callBudget.steps[17].menus === 0 && callBudget.steps[17].decides === 0 && callBudget.steps[17].provider === 1
      && jevFastOf(callBudget).latched === 'call_budget',
    'call budget: iteration 18 latches the command call_budget and runs the LLM');
    check(stillRunning(callBudget), 'call budget: the session keeps running; fast mode applied no terminal outcome');
  } finally {
    finish(callBudget);
  }

  // Time budget: the fake clock moves 300 ms per menu and 2 400 ms per decide;
  // a decide whose deadline is shorter takes the deadline and times out
  // through the real client (its held timer fires), as a slow gateway would.
  const clock = H.makeFakeClock(0);
  const ref = {};
  const timeBudget = loopRun({
    clock,
    content: { onMenu: () => clock.advance(300) },
    answers: [(request, info, index) => {
      const deadline = ref.run.rec.timers.lastDelay();
      if (deadline < 2400) {
        clock.advance(deadline);
        ref.run.rec.timers.fireAll();
        return new Promise(() => {});
      }
      clock.advance(2400);
      return clickNthItem(request, info, index);
    }]
  });
  ref.run = timeBudget;
  try {
    await runSteps(timeBudget, 13);
    const decides = timeBudget.rec.decides;
    const limit = FAST.FAST_WALL_BUDGET_MS;
    check(decides.length === 8 && decides.every((d) => typeof d.timeoutMs === 'number' && d.timeoutMs <= Math.min(2500, limit - d.at)),
      'time budget: every decide receives timeoutMs <= min(2500, remaining) (' + decides.map((d) => d.timeoutMs + '@' + d.at).join(', ') + ')');
    check(util.isDeepStrictEqual(decides.map((d) => d.timeoutMs), [2500, 2500, 2500, 2500, 2500, 2500, 2500, 800]),
      'time budget: the eighth decide gets only the 800 ms left (19 200 ms used)');
    check(jevFastOf(timeBudget).latched === 'time_budget' && jevFastOf(timeBudget).jevMs === limit && clock.t === limit,
      'time budget: the command latches time_budget with exactly 20 000 ms used, never more');
    const latchAt = timeBudget.steps.findIndex((s) => s.latched === 'time_budget');
    check(latchAt >= 0 && timeBudget.steps.slice(latchAt).every((s) => s.menus === 0 && s.decides === 0 && s.provider === 1),
      'time budget: from the latch on, every iteration runs the LLM with no menu and no decide');
    check(timeBudget.steps[10].decides === 1 && timeBudget.steps[10].fast === 0 && timeBudget.steps[10].provider === 1,
      'time budget: the cut-short eighth decide escalates and that iteration runs the LLM');
    check(stillRunning(timeBudget), 'time budget: the session keeps running; fast mode applied no terminal outcome');
  } finally {
    finish(timeBudget);
  }
}

async function completionStuckCases() {
  section('latches and budgets: completion and stuck gates through the loop (D-17, AUTO-04-c)');
  const low = loopRun({ answers: [
    calibratedPick('click', 'Item 1', { completion: { p: 0.05, threshold: 0.2 } }),
    calibratedPick('click', 'Item 2', { completion: { p: 0.05, threshold: 0.2 } })
  ] });
  try {
    await runSteps(low, 3);
    check(low.steps[1].fast === 1 && low.steps[2].fast === 1 && low.steps[2].provider === 0,
      'completion: a calibrated completion p below the cut (0.05 <= 0.2) lets the fast step act, and the next one too');
  } finally {
    finish(low);
  }

  const high = loopRun({ answers: [
    calibratedPick('click', 'Item 1'),
    calibratedPick('click', 'Item 2', { completion: { p: 0.6, threshold: 0.2 } })
  ] });
  try {
    await runSteps(high, 3);
    check(high.steps[1].fast === 1 && high.steps[2].decides === 1 && high.steps[2].fast === 0 && high.steps[2].provider === 1,
      'completion: a calibrated completion p above the cut (not accepted) hands iteration 3 to the LLM with no fast step');
    const handoffs = handoffsIn(high.steps[2]);
    check(handoffs.length === 1 && handoffs[0].content.indexOf(fastPathApi().describeEscalation('completion_unconfirmed')) !== -1,
      'completion: the hand-off asks the LLM to check whether the goal is already met');
    check(stillRunning(high), 'completion: fast mode never ends the task itself');
  } finally {
    finish(high);
  }

  const notAFit = loopRun({ answers: [(request, info, index) => calibratedPick('click', 'Item ' + (index + 1), { completion: { threshold: null } })(request)] });
  try {
    await runSteps(notAFit, 5);
    check(notAFit.steps.slice(1, 4).every((s) => s.fast === 1 && s.provider === 0),
      'completion threshold_null: with operation and target accepted, the fast steps act');
    check(notAFit.steps[4].provider === 1 && notAFit.steps[4].menus === 0 && notAFit.steps[4].decides === 0,
      'completion threshold_null: the consecutive cap still forces iteration 5 onto the LLM');
  } finally {
    finish(notAFit);
  }

  const stuck = loopRun({ answers: [
    calibratedPick('click', 'Item 1'),
    calibratedPick('click', 'Item 2', { stuck: { p: 0.9, threshold: 0.8 } })
  ] });
  try {
    await runSteps(stuck, 3);
    check(stuck.steps[1].fast === 1 && stuck.steps[2].decides === 1 && stuck.steps[2].fast === 0 && stuck.steps[2].provider === 1,
      'stuck: a calibrated stuck p above its cut (0.9 >= 0.8) hands iteration 3 to the LLM with no fast step');
    const handoffs = handoffsIn(stuck.steps[2]);
    check(handoffs.length === 1 && handoffs[0].content.indexOf(fastPathApi().describeEscalation('jev_stuck')) !== -1,
      'stuck: the hand-off names the stuck signal');
    check(stillRunning(stuck), 'stuck: the session keeps running');
  } finally {
    finish(stuck);
  }
}

async function noProgressCases() {
  section('latches and budgets: the D-17 no-progress latch through the loop (sync issue 4)');
  const sameSignature = [
    ['an unconfirmed click', () => ({ success: true })],
    ['a click with verification.verified true', () => ({ success: true, verification: { verified: true, changes: ['content'], confidence: 'high' } })]
  ];
  for (const [label, action] of sameSignature) {
    const run = loopRun({ content: { entries: NEXT_ENTRIES, signature: 'S-same', action }, answers: [calibratedPick('click', 'Next'), catchAll] });
    try {
      await runSteps(run, 4);
      check(run.steps[1].fast === 1 && run.steps[1].provider === 0, 'no progress: iteration 2 takes ' + label + ' on "Next"');
      check(run.steps[2].menus === 1 && run.steps[2].decides === 0 && run.steps[2].provider === 1 && jevFastOf(run).latched === 'no_progress',
        'no progress: ' + label + ' followed by a menu with the same url and signature latches the command before the next decide');
      const handoffs = handoffsIn(run.steps[2]);
      check(handoffs.length === 1 && handoffs[0].content.indexOf(fastPathApi().describeEscalation('no_progress')) !== -1,
        'no progress: the next LLM request carries one hand-off with the no-progress hint (' + label + ')');
      check(run.steps[3].menus === 0 && run.steps[3].decides === 0 && total(run, 'decides') === 1 && stillRunning(run),
        'no progress: the command stays latched and the session keeps running (' + label + ')');
    } finally {
      finish(run);
    }
  }

  const moving = loopRun({ content: { entries: NEXT_ENTRIES, signature: 'action' }, answers: [calibratedPick('click', 'Next'), catchAll] });
  try {
    await runSteps(moving, 3);
    check(moving.steps[1].fast === 1 && moving.steps[2].decides === 1 && jevFastOf(moving).latched !== 'no_progress',
      'no progress: a verified click that changes the signature does not latch (the next iteration makes its decide)');
  } finally {
    finish(moving);
  }

  const twice = loopRun({
    content: { entries: NEXT_ENTRIES, signature: 'request', action: () => ({ success: true }) },
    answers: [calibratedPick('click', 'Next'), calibratedPick('click', 'Next'), catchAll]
  });
  try {
    await runSteps(twice, 4);
    check(twice.steps[1].fast === 1 && twice.steps[2].fast === 1, 'no progress: iterations 2 and 3 each click "Next" with no observed effect');
    check(twice.steps[3].menus === 1 && twice.steps[3].decides === 0 && twice.steps[3].provider === 1 && jevFastOf(twice).latched === 'no_progress',
      'no progress: two no-effect clicks on the same role and label latch even though a title counter changed the signature');
  } finally {
    finish(twice);
  }
}

async function sameStateCases() {
  section('latches and budgets: never re-roll; one decide per page state (D-18, AUTO-05-a)');
  const variants = [
    ['operation below_threshold', belowThresholdOp],
    ['target catch_all', (request) => ({ body: gateway.calibratedBody(request, { operation: { choice: 'click' }, target: { choice: gateway.CATCH_ALL } }) })],
    ['target threshold_null', (request) => ({ body: gateway.calibratedBody(request, { operation: { choice: 'click' }, target: { choice: idByLabel(request, 'Next'), threshold: null } }) })]
  ];
  for (const [label, first] of variants) {
    const signature = { value: 'S' };
    const run = loopRun({ content: { entries: NEXT_ENTRIES, signature: () => signature.value }, answers: [first, catchAll] });
    try {
      await runSteps(run, 2);
      const log2 = (run.h.session.toolCallLog || []).filter((e) => e.iteration === 2).map((e) => e.tool);
      check(run.steps[1].decides === 1 && run.steps[1].fast === 0 && run.steps[1].provider === 1 && util.isDeepStrictEqual(log2, ['get_page_snapshot']),
        'same state (' + label + '): iteration 2 escalates on menu (U, S) and the LLM\'s turn is only get_page_snapshot');
      await runSteps(run, 1);
      const jf = jevFastOf(run);
      check(run.steps[2].menus === 1 && total(run, 'decides') === 1 && run.steps[2].provider === 1 && run.steps[2].fast === 0,
        'same state (' + label + '): iteration 3 sees the same U and S, makes no second decide and runs the LLM');
      check(jf.consecutiveEscalations === 1 && !jf.latched, 'same state (' + label + '): the decline is not an escalation (consecutiveEscalations 1) and the command is not latched');
      signature.value = 'S2';
      await runSteps(run, 1);
      check(run.steps[3].decides === 1 && total(run, 'decides') === 2, 'same state (' + label + '): a changed signature in iteration 4 makes the second decide');
    } finally {
      finish(run);
    }
  }
}

async function breakerCases() {
  section('latches and budgets: the existing breakers count and stop fast steps (D-12, F1, AUTO-04-b)');
  // One harness at a time: createHarness installs its own chrome and timer globals.
  for (const limit of [4, 5]) {
    const offRun = loopRun({ fast: false, maxIterations: limit });
    try {
      await runSteps(offRun, limit);
    } finally {
      finish(offRun);
    }
    const fastRun = loopRun({ maxIterations: limit, answers: [clickNthItem] });
    try {
      await runSteps(fastRun, limit);
      const fastIterations = iterationsWhere(fastRun, 'fast');
      const expected = [];
      for (let i = 2; i < limit; i += 1) expected.push(i);
      const last = fastRun.steps[limit - 1];
      check(util.isDeepStrictEqual(fastIterations, expected) && last.provider === 0 && last.menus === 0 && last.decides === 0 && last.schedules === 0,
        'maxIterations: with maxIterations ' + limit + ' and fast steps in iterations ' + expected.join('-') + ', iteration ' + limit + ' stops before any menu or provider call');
      const fastDetails = fastRun.h.session.outcomeDetails || {};
      const offDetails = offRun.h.session.outcomeDetails || {};
      check(fastRun.h.session.status === 'stopped' && fastDetails.reason === 'iteration_limit_exceeded'
        && offRun.h.session.status === 'stopped' && offDetails.reason === fastDetails.reason
        && fastRun.h.session.iterationCount === limit && offRun.h.session.iterationCount === limit,
      'maxIterations: the existing safety breaker stops the run at the limit of ' + limit + ' with iteration_limit_exceeded, fast iterations counted, exactly as an LLM-only run');
    } finally {
      finish(fastRun);
    }
  }

  const llmMeta = loopRun({
    fast: false,
    providerScript: (index) => H.openAiToolResponse('resp_m' + index, [{ id: 'call_m' + index, name: 'click', args: { selector: '#next' } }])
  });
  try {
    await runSteps(llmMeta, 6);
  } finally {
    finish(llmMeta);
  }
  const meta = loopRun({ content: { entries: NEXT_ENTRIES }, answers: [calibratedPick('click', 'Next')] });
  try {
    await runSteps(meta, 8);
    const metaDetails = meta.h.session.outcomeDetails || {};
    const llmDetails = llmMeta.h.session.outcomeDetails || {};
    check(util.isDeepStrictEqual(iterationsWhere(meta, 'fast'), [2, 3, 4, 6, 7, 8]) && meta.steps[7].schedules === 0,
      'meta_cognitive_loop_break: six effective fast clicks on "Next" on one page path ran in iterations 2-4 and 6-8');
    const startKey = metaKey('/start', 'button', 'Next');
    check(meta.h.session.status === 'stopped' && metaDetails.reason === 'meta_cognitive_loop_break'
      && String(metaDetails.summary).indexOf('6 attempts on `' + startKey + '`') !== -1,
    'meta_cognitive_loop_break: the sixth fast click ends the run through the meta-attempt breaker under the hashed /start Next key');
    // WR-02: the page path and the label reach neither the summary nor the
    // role:'user' attempt-log message injected at the fourth attempt.
    const attemptLogs = (meta.h.session.messages || []).filter((m) => m && m.role === 'user' && typeof m.content === 'string'
      && m.content.indexOf('SYSTEM ATTEMPT-LOG') === 0);
    check(attemptLogs.length >= 1 && attemptLogs.every((m) => m.content.indexOf('`' + startKey + '`') !== -1
      && m.content.indexOf('/start') === -1 && m.content.indexOf('Next') === -1)
      && String(metaDetails.summary).indexOf('/start') === -1 && String(metaDetails.summary).indexOf('Next') === -1,
    'WR-02: the attempt-log message and the terminal summary name the hashed key, never the page path or the label');
    check(llmMeta.h.session.status === 'stopped' && llmDetails.reason === 'meta_cognitive_loop_break'
      && /6 attempts on `sel:#next`/.test(String(llmDetails.summary)) && llmMeta.h.session.iterationCount === 6,
    'meta_cognitive_loop_break: exactly as six LLM clicks on one selector do');
  } finally {
    finish(meta);
  }

  const pages = loopRun({
    content: { entries: NEXT_ENTRIES, url: (state) => 'https://wizard.example/wizard/step-' + (state.fastActions + 1) },
    answers: [calibratedPick('click', 'Next')]
  });
  try {
    await runSteps(pages, 10);
    const keys = Object.keys(pages.h.session._metaAttempts || {}).filter((k) => k.indexOf('jev:') === 0);
    const expectedKeys = [];
    for (let n = 1; n <= 7; n += 1) expectedKeys.push(metaKey('/wizard/step-' + n, 'button', 'Next'));
    check(total(pages, 'fast') === 7 && stillRunning(pages),
      'per-page meta key: seven effective "Next" clicks, one wizard page each, do not end the run');
    check(util.isDeepStrictEqual(keys.slice().sort(), expectedKeys.slice().sort())
      && keys.every((k) => pages.h.session._metaAttempts[k].length === 1),
    'per-page meta key: each click is one attempt under its own jev:<pagePath>:button:Next key');
  } finally {
    finish(pages);
  }
}

function terminalToolChecks() {
  section('latches and budgets: fast mode never applies a terminal outcome (D-17, AUTO-04-c)');
  check(executedFastTools.length > 0 && executedFastTools.every((name) => TERMINAL_TOOLS.indexOf(name) === -1),
    'no executed fast call is named complete_task, partial_task or fail_task (' + executedFastTools.length + ' fast calls across the loop cases)');
  const source = fs.readFileSync(path.join(ROOT, 'extension', 'ai', 'jev-fast-path.js'), 'utf8');
  const slice = sliceFunction(source, 'buildStaticCall');
  check(typeof slice === 'string' && slice.length > 0 && TERMINAL_TOOLS.every((name) => slice.indexOf(name) === -1),
    'jev-fast-path.js buildStaticCall names none of complete_task, partial_task or fail_task');
  // PD-70-03 (70-SYNC-RECHECK Drift substitution 9): Phase 70 reads how a
  // task ended inside one marked section of the module, which builds no tool
  // call; the names stay banned everywhere else.
  const start = source.indexOf('// --- run_task outcome (Phase 70) ---');
  const end = source.indexOf('// --- end run_task outcome ---');
  const marked = start >= 0 && end > start && source.indexOf('// --- run_task outcome (Phase 70) ---', start + 1) === -1
    && source.indexOf('// --- end run_task outcome ---', end + 1) === -1;
  const inside = marked ? source.slice(start, end) : '';
  const outside = marked ? source.slice(0, start) + source.slice(end) : source;
  check(marked, 'jev-fast-path.js holds the marked Phase 70 section exactly once');
  check(marked && TERMINAL_TOOLS.every((name) => outside.indexOf(name) === -1),
    'jev-fast-path.js names no terminal tool outside the marked Phase 70 section');
  check(marked && inside.indexOf('buildStaticCall(') === -1 && !/\btoolCall\b/.test(inside),
    'the marked Phase 70 section of jev-fast-path.js builds no tool call');
}

// ---------------------------------------------------------------------------
// Plan 68-07 Task 2: uncertain outcomes, provider pairing, hand-off collapse,
// exception containment, stop and switch-off (D-05, D-10, D-18, F11, F13,
// F21; AUTO-05-a, AUTO-05-c, AUTO-05-d; sync issue 2).
// ---------------------------------------------------------------------------

const MAY_HAVE_EXECUTED = 'may have executed; inspect the page before retrying';

async function uncertainOutcomeCases() {
  section('outcomes, pairing and containment: uncertain and stale fast steps dispatch once and escalate once (D-18, F11, sync issue 2)');
  const variants = [
    {
      name: 'unknown outcome / mayHaveExecuted',
      action: () => ({
        success: false,
        outcome: 'unknown',
        mayHaveExecuted: true,
        method: 'dom_coordinate',
        message: 'Click dispatched at coordinates; inspect the page before retrying because its effect is unknown'
      }),
      result: (r) => r.success === false && r.error === null,
      stale: false
    },
    {
      name: 'bfCacheDetected',
      action: () => { throw new Error('Could not establish connection. Receiving end does not exist.'); },
      result: (r) => r.success === true && r.error === null,
      stale: false
    },
    {
      name: 'stale target',
      action: () => ({ success: false, error: 'Fast-mode target is no longer current (generation_mismatch).', tool: 'click', refStale: true, reason: 'generation_mismatch' }),
      result: (r) => r.success === false && /no longer current/.test(String(r.error)),
      stale: true
    },
    {
      name: 'channel closed',
      action: () => { throw new Error('A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received'); },
      result: (r) => r.success === false && String(r.error).indexOf('Content tool click failed: A listener indicated') === 0,
      stale: false
    },
    {
      name: 'no answer',
      action: () => undefined,
      result: (r) => r.success === false && r.error === null,
      stale: false
    }
  ];
  for (const v of variants) {
    const label = 'uncertain outcome (' + v.name + ')';
    const run = loopRun({ content: { entries: NEXT_ENTRIES, action: v.action }, answers: [calibratedPick('click', 'Next'), catchAll] });
    try {
      await runSteps(run, 4);
      const allActions = contentActions(run.h.events, 'executeAction');
      check(allActions.length === 1 && run.steps[1].fast === 1 && run.content.state.fastActions === 1,
        label + ': the fast step produced exactly one executeAction in the whole run (iteration 2)');
      const fastEvent = (run.h.session.actionHistory || []).find((e) => e.iteration === 2 && e.decisionSource === 'jev');
      check(fastEvent && v.result(fastEvent.result), label + ': the loop recorded the tool-executor shape for this answer');
      const it3 = run.steps[2];
      check(it3.provider === 1 && it3.menus === 0 && it3.decides === 0 && it3.fast === 0,
        label + ': the next iteration runs the LLM with no further fast step before it');
      const handoffs = handoffsIn(it3);
      const text = handoffs.length === 1 ? handoffs[0].content : '';
      if (v.stale) {
        check(text.indexOf('not run: the target changed') !== -1 && text.indexOf(fastPathApi().describeEscalation('stale')) !== -1
          && text.indexOf('may have executed') === -1,
        label + ': one hand-off with the stale wording (nothing ran) and no may-have-executed claim');
      } else {
        check(text.indexOf(MAY_HAVE_EXECUTED) !== -1 && text.indexOf('click button "Next" (page text): may have executed') !== -1,
          label + ': one hand-off saying the step "' + MAY_HAVE_EXECUTED + '"');
      }
      const allHandoffs = handoffMessages(run.h.session.messages);
      check(allHandoffs.length === 1 && allHandoffs.every((m) => m.content.indexOf('not permitted') === -1),
        label + ': no hand-off says the step was not permitted');
      check(run.steps[3].fast === 0 && stillRunning(run), label + ': no second dispatch afterwards and the session keeps running');
    } finally {
      finish(run);
    }
  }
}

/** Crafted bodies in each format: the pairing check must reject an unpaired call, an orphan result and an interleaved message. */
function pairingSelfTest() {
  const handoff = HANDOFF_PREFIX + '\nFast mode took 1 step.';
  const shapes = {
    openai: {
      call: (id) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'click', arguments: '{}' } }] }),
      result: (id) => ({ role: 'tool', tool_call_id: id, name: 'click', content: '{}' }),
      user: (text) => ({ role: 'user', content: text }),
      wrap: (list) => ({ messages: [{ role: 'system', content: 's' }].concat(list) })
    },
    anthropic: {
      call: (id) => ({ role: 'assistant', content: [{ type: 'tool_use', id, name: 'click', input: {} }] }),
      result: (id) => ({ role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: '{}' }] }),
      user: (text) => ({ role: 'user', content: text }),
      wrap: (list) => ({ system: [{ type: 'text', text: 's' }], messages: list })
    },
    gemini: {
      call: (id) => ({ role: 'model', parts: [{ functionCall: { id, name: 'click', args: {} } }] }),
      result: (id) => ({ role: 'user', parts: [{ functionResponse: { id, name: 'click', response: {} } }] }),
      user: (text) => ({ role: 'user', parts: [{ text }] }),
      wrap: (list) => ({ contents: list })
    }
  };
  const keyFor = { openai: 'openai', anthropic: 'anthropic', gemini: 'gemini' };
  for (const format of Object.keys(shapes)) {
    const s = shapes[format];
    const good = H.toolPairing(keyFor[format], s.wrap([s.call('c1'), s.result('c1'), s.user(handoff)]));
    const unpaired = H.toolPairing(keyFor[format], s.wrap([s.call('c1'), s.user(handoff)]));
    const orphan = H.toolPairing(keyFor[format], s.wrap([s.user(handoff), s.result('jev_1_2')]));
    const interleaved = H.toolPairing(keyFor[format], s.wrap([s.call('c1'), s.user(handoff), s.result('c1')]));
    check(good.ok && good.userTexts.length === 1 && !unpaired.ok && unpaired.unpaired[0] === 'c1'
      && !orphan.ok && orphan.orphans[0] === 'jev_1_2' && !interleaved.ok,
    'pairing self-test (' + format + ' format): the check rejects an unpaired call, an orphan result and a message between a call and its result');
  }
}

async function pairingCases() {
  section('outcomes, pairing and containment: provider request bodies stay paired across fast steps (D-10, AUTO-05-c)');
  pairingSelfTest();
  const providerKeys = ['xai', 'openai', 'anthropic', 'gemini', 'openrouter', 'lmstudio', 'custom'];
  for (const providerKey of providerKeys) {
    const script = [
      H.providerToolResponse(providerKey, 'resp_p1', [{ id: 'call_p1', name: 'click', args: { selector: '#start' } }]),
      H.providerToolResponse(providerKey, 'resp_p2', [{ id: 'call_p2', name: 'get_page_snapshot', args: {} }]),
      H.providerToolResponse(providerKey, 'resp_p3', [{ id: 'call_p3', name: 'complete_task', args: { summary: 'Wizard finished' } }])
    ];
    const run = loopRun({ providerKey, providerScript: script, answers: [clickNthItem, clickNthItem, catchAll] });
    try {
      await runSteps(run, 5);
      check(run.steps[1].fast === 1 && run.steps[2].fast === 1 && run.steps[3].decides === 1 && run.steps[3].provider === 1,
        'pairing (' + providerKey + '): LLM turn, two fast steps, an escalation and an LLM turn ran in that order');
      const bodies = run.h.providerRequests.map((r) => r.requestBody);
      const reports = bodies.map((body) => H.toolPairing(providerKey, body));
      check(bodies.length === 3 && reports.every((r) => r.ok),
        'pairing (' + providerKey + '): every assistant tool call has its result right after it and no result lacks its call ('
        + reports.map((r) => r.calls.length + '/' + r.results.length).join(' ') + ')');
      check(reports.every((r) => r.calls.concat(r.results).every((id) => !/^jev_/.test(String(id)))),
        'pairing (' + providerKey + '): no fast-step call id appears as a tool call or a tool result');
      const later = reports.slice(1);
      check(later.every((r) => r.userTexts.filter((t) => t.indexOf(HANDOFF_PREFIX) === 0).length === 1),
        'pairing (' + providerKey + '): the hand-off is one plain user-role entry in each later request');
      check(run.h.session.status === 'completed', 'pairing (' + providerKey + '): the LLM ends the task');
    } finally {
      finish(run);
    }
  }
}

async function collapseCase() {
  section('outcomes, pairing and containment: only the newest hand-off keeps its snapshot (D-10)');
  const api = fastPathApi();
  const SUMMARY_PREFIX = api.constants.SUMMARY_PREFIX;
  const SNAPSHOT_HEADER = api.constants.SNAPSHOT_HEADER;
  const SNAPSHOT_COLLAPSED = api.constants.SNAPSHOT_COLLAPSED;
  const run = loopRun({ answers: [clickNthItem, catchAll, clickNthItem, catchAll] });
  try {
    await runSteps(run, 5);
    const handoffs = (run.h.session.messages || []).filter((m) => m && m.role === 'user' && typeof m.content === 'string' && m.content.indexOf(SUMMARY_PREFIX) === 0);
    check(handoffs.length === 2 && run.steps[2].provider === 1 && run.steps[4].provider === 1,
      'collapse: two hand-offs in one session (iterations 3 and 5)');
    const first = handoffs.length === 2 ? handoffs[0].content : '';
    const last = handoffs.length === 2 ? handoffs[1].content : '';
    check(first.endsWith(SNAPSHOT_HEADER + '\n' + SNAPSHOT_COLLAPSED) && !/\nSNAP-\d+/.test(first),
      'collapse: the earlier hand-off ends with SNAPSHOT_COLLAPSED and keeps no snapshot text');
    // WR-01: the snapshot is fenced as page data between two marker lines.
    check(/\n<<<PAGE_SNAPSHOT [^\n]*\nSNAP-\d+\nPAGE_SNAPSHOT>>>$/.test(last) && last.indexOf(SNAPSHOT_HEADER + '\n<<<PAGE_SNAPSHOT ') !== -1
      && last.indexOf(SNAPSHOT_COLLAPSED) === -1,
    'collapse: only the latest hand-off carries SNAPSHOT_HEADER followed by the fenced snapshot text');
    const inRequest = handoffsIn(run.steps[4]);
    check(inRequest.length === 2 && inRequest[0].content === first && inRequest[1].content === last,
      'collapse: the iteration-5 LLM request sees the collapsed earlier hand-off and the full latest one');
  } finally {
    finish(run);
  }
}

async function exceptionCases() {
  section('outcomes, pairing and containment: a throwing fast path never reaches the iteration\'s API-error handler (F13, AUTO-05-d)');
  const variants = [
    ['beforeTurn throws', 'beforeTurn', function beforeTurnThrows() { throw new Error('fast path beforeTurn failed'); }],
    ['afterStep throws', 'afterStep', function afterStepThrows() { throw new Error('fast path afterStep failed'); }]
  ];
  for (const [label, method, replacement] of variants) {
    const run = loopRun({ answers: [clickNthItem] });
    const real = run.h.fastPath;
    globalThis.FsbFastPath = Object.assign({}, real, { [method]: replacement });
    const stopReasons = [];
    try {
      for (let i = 0; i < 5; i += 1) {
        await runSteps(run, 1);
        stopReasons.push(run.h.session.lastTurnResult ? run.h.session.lastTurnResult.stopReason : null);
      }
      if (method === 'beforeTurn') {
        check(run.steps.every((s) => s.provider === 1 && s.fast === 0 && s.schedules === 1),
          'exception (' + label + '): every iteration runs the LLM and schedules the next one normally');
      } else {
        check(util.isDeepStrictEqual(iterationsWhere(run, 'fast'), [2, 3, 4]) && run.steps.slice(1, 4).every((s) => s.provider === 0 && s.schedules === 1),
          'exception (' + label + '): each fast step completes and the iteration schedules the next one normally');
      }
      check(!run.h.consoleLines.some((line) => line.indexOf('Iteration error') !== -1),
        'exception (' + label + '): the iteration catch never logs "Iteration error"');
      check(stopReasons.every((r) => typeof r === 'string' && r !== 'error'),
        'exception (' + label + '): lastTurnResult.stopReason is never "error" (' + stopReasons.join(',') + ')');
      check(stillRunning(run) && run.h.session.agentState.iterationCount === 5, 'exception (' + label + '): the session is not ended');
    } finally {
      finish(run);
    }
  }
}

async function lostStepCase() {
  section('outcomes, pairing and containment: an exception after the fast dispatch keeps the step and never repeats it (WR-03)');
  const run = loopRun({ answers: [clickNthItem] });
  try {
    await runSteps(run, 1);
    // Iteration 2: the fast click dispatches, then the loop throws before
    // afterStep (an action-history push that fails), so the iteration catch
    // runs and reschedules the same iteration.
    const history = run.h.session._actionHistory;
    const realPush = history.push;
    let thrown = 0;
    history.push = function throwingPush() {
      thrown += 1;
      throw new Error('action history push failed');
    };
    await runSteps(run, 1);
    history.push = realPush;
    const state = fastStateOf(run);
    check(thrown === 1 && run.steps[1].fast === 1 && run.steps[1].provider === 0,
      'lost step: iteration 2 dispatched one fast click, then threw before afterStep');
    check(run.h.consoleLines.some((line) => line.indexOf('Iteration error') !== -1) && run.h.session.agentState.iterationCount === 1,
      'lost step: the iteration catch handled it and gave the iteration back for a retry');
    check(state.off === true && state.offReason === 'exception' && state.uncertain === true
      && Array.isArray(state.pendingSteps) && state.pendingSteps.length === 1 && state.pendingSteps[0].effect === 'uncertain',
    'lost step: the catch recorded the step as uncertain and latched fast mode off for the session');
    // The retried iteration: no second fast dispatch, and the LLM is told the step may have executed.
    await runSteps(run, 1);
    const retry = run.steps[2];
    const handoffs = handoffsIn(retry);
    check(retry.fast === 0 && retry.menus === 0 && retry.decides === 0 && retry.provider === 1,
      'lost step: the retry asks Jev nothing, dispatches nothing and runs the LLM');
    check(handoffs.length === 1 && handoffs[0].content.indexOf('may have executed') !== -1 && /click button "Item 1" \(page text\)/.test(handoffs[0].content),
      'lost step: the LLM gets one truthful hand-off naming the click as possibly executed');
    check(total(run, 'fast') === 1, 'lost step: exactly one fast dispatch in the whole run');
  } finally {
    finish(run);
  }
}

async function metricsRowCase() {
  section('usage metrics: a fast step\'s dispatch row is labelled Jev, not the session model (WR-06, D-23)');
  const rows = [];
  const saved = globalThis.fsbMcpMetricsRecorder;
  const run = loopRun({ answers: [clickNthItem, catchAll] });
  globalThis.fsbMcpMetricsRecorder = { recordDispatch(input) { rows.push(JSON.parse(JSON.stringify(input))); return Promise.resolve(); } };
  try {
    await runSteps(run, 2);
    const providerKey = run.h.session.providerConfig.providerKey;
    const model = run.h.session.providerConfig.model;
    const llmRows = rows.filter((row) => row.tool === 'get_page_snapshot');
    const fastRows = rows.filter((row) => row.tool === 'click');
    check(run.steps[1].fast === 1 && fastRows.length === 1 && llmRows.length >= 1,
      'usage metrics: one dispatch row for the fast click and one for the LLM turn\'s tool');
    check(fastRows.length === 1 && fastRows[0].client === 'FSB Autopilot' && fastRows[0].dispatcher_route === 'autopilot'
      && util.isDeepStrictEqual(fastRows[0].drivingModel, { provider: 'jev', model_id: null, decisionSource: 'jev' }),
    'usage metrics: the fast click row carries drivingModel {provider:"jev", model_id:null, decisionSource:"jev"}');
    check(llmRows.length >= 1 && llmRows.every((row) => row.drivingModel && row.drivingModel.provider === providerKey
      && row.drivingModel.model_id === model && !('decisionSource' in row.drivingModel)),
    'usage metrics: the LLM tool row still names the session provider and model (' + providerKey + ', ' + model + ')');
  } finally {
    if (saved === undefined) delete globalThis.fsbMcpMetricsRecorder;
    else globalThis.fsbMcpMetricsRecorder = saved;
    finish(run);
  }
}

async function replayRecordCase() {
  section('replay record: a fast step is recorded with the selector its resolver chose (WR-05)');
  const replay = require(path.join(ROOT, 'extension', 'utils', 'lattice-replay.js'));
  const run = loopRun({
    answers: [clickNthItem, catchAll],
    content: { action: () => ({ success: true, jevSelector: '#item-1', verification: { verified: true, changes: ['content'], confidence: 'high' } }) }
  });
  try {
    await runSteps(run, 2);
    const history = run.h.session.actionHistory;
    const fastEvent = history.find((e) => e && e.iteration === 2 && e.tool === 'click');
    check(run.steps[1].fast === 1 && fastEvent && fastEvent.decisionSource === 'jev'
      && util.isDeepStrictEqual(fastEvent.params, { selector: '#item-1', visual_reason: 'Fast mode: simple step' }),
    'replay record: the loop\'s actionHistory event for the fast click holds {selector, visual_reason} and no handle');
    const record = replay.createLegacyReplayRecord({ sessionId: 's-replay', startUrl: 'https://wizard.example/wizard/step-2', actionHistory: history });
    const step = record.manifest.steps.find((s) => s.tool === 'click' && s.arguments && s.arguments.selector === '#item-1');
    check(step && step.replay.availability !== 'unsupported' && !('jevHandle' in step.arguments),
      'replay record: the replay manifest step targets #item-1 and is not unsupported (' + JSON.stringify(step && step.replay) + ')');
    check(Object.keys(run.h.session._metaAttempts || {}).some((k) => /^jev:button:[0-9a-f]{8}$/.test(k)),
      'replay record: the meta-attempt key still comes from the unchanged call args');
  } finally {
    finish(run);
  }
}

async function stopCase() {
  section('outcomes, pairing and containment: a stop during an in-flight decision (F21)');
  const run = loopRun({ answers: [() => new Promise(() => {})] });
  try {
    await runSteps(run, 1);
    const pending = run.h.step();
    let rounds = 0;
    while (run.gw.requests.length === 0 && rounds < 500) {
      await new Promise((resolve) => setImmediate(resolve));
      rounds += 1;
    }
    // No check() here: the harness mutes the console while a step is in flight.
    const wasPending = run.gw.requests.length === 1 && run.rec.calls.length === 1 && run.rec.calls[0].init.signal.aborted === false;
    run.h.session.status = 'stopped';
    globalThis.FsbFastPath.abortInFlight(run.h.session);
    // Bounded wait: an iteration that never returns must fail by name, not
    // end the process silently.
    let settled = false;
    pending.then(() => { settled = true; }, () => { settled = true; });
    for (let i = 0; i < 2000 && !settled; i += 1) await new Promise((resolve) => setImmediate(resolve));
    if (!settled) run.h.dispose();
    const ev = stepEvents(run.h.events, 2);
    check(settled, 'stop: the in-flight iteration returns once the stop aborts the decision');
    check(wasPending, 'stop: a decide was pending at the gateway when the stop arrived');
    check(ofType(ev, 'provider').length === 0 && contentActions(ev, 'executeAction').length === 0 && ofType(ev, 'schedule').length === 0,
      'stop: runAgentIteration returns with no provider request, no executeAction and no next-iteration schedule');
    check(run.rec.calls[0].init.signal.aborted === true && run.rec.decides[0].signal && run.rec.decides[0].signal.aborted === true,
      'stop: the fetch signal is aborted');
    check(handoffMessages(run.h.session.messages).length === 0 && run.h.session.status === 'stopped',
      'stop: nothing was added to session.messages');
  } finally {
    finish(run);
  }
}

async function switchOffCase() {
  section('outcomes, pairing and containment: turning the switch off mid-run (D-05)');
  const run = loopRun({ answers: [clickNthItem] });
  try {
    await runSteps(run, 2);
    check(run.steps[1].fast === 1, 'switch-off: iteration 2 takes one fast step while the switch is on');
    run.h.storage.local.fsbJevFastModeEnabled = false;
    await runSteps(run, 3);
    const reads = ofType(stepEvents(run.h.events, 3), 'storage-get').length;
    check(reads === 1 && run.steps[2].menus === 0 && run.steps[2].decides === 0 && run.steps[2].provider === 1,
      'switch-off: iteration 3 re-reads the switch, sends no menu request, makes no decide and runs the LLM');
    check(fastStateOf(run).off === true && fastStateOf(run).offReason === 'switch_off', 'switch-off: the session latches fast mode off (switch_off)');
    check(run.steps.slice(3).every((s) => s.menus === 0 && s.decides === 0 && s.provider === 1)
      && ofType(stepEvents(run.h.events, 4), 'storage-get').length === 0 && ofType(stepEvents(run.h.events, 5), 'storage-get').length === 0,
    'switch-off: later iterations make no getJevMenu, no decide and no further switch read');
    const handoffs = handoffsIn(run.steps[2]);
    check(handoffs.length === 1 && handoffs[0].content.indexOf(fastPathApi().describeEscalation('switch_off')) !== -1,
      'switch-off: the fast step taken before the switch went off still reaches the LLM in one hand-off');
    check(stillRunning(run), 'switch-off: the session keeps running');
  } finally {
    finish(run);
  }
}

// ---------------------------------------------------------------------------
// Phase 70 (70-02 Task 3): run_task safety parity through the real loop
// (SC3, D-06). Every case runs a session whose fastMode is the real
// fsbFastModeSessionField(true, 'mcp') output, and the same script with the
// autopilot field; the two runs must match.
// ---------------------------------------------------------------------------

// A fixed clock for the deps and the client, so the budget counters match across runs.
const PARITY_CLOCK = Object.freeze({ now: () => 1789639200000 });
// Next, a commit-word control and a text field: the last two are never fast-acted.
const RISK_ENTRIES = [
  entry('j1', { label: 'Next' }),
  entry('j2', { label: 'Pay now', risk: 'commit_word', fastEligible: false }),
  entry('j3', { role: 'textbox', label: 'Name', ops: ['click'], inputType: 'text', fastEligible: false })
];

/**
 * loopRun under `field`, run for n steps; returns a JSON trace and the
 * recorded facts the checks read. The fast call's toolResult is read where
 * the module reads it: afterStep is wrapped, as in the permission denial
 * case, and the loop's own (abridged) actionHistory result is kept as well.
 */
async function parityLoopRun(field, opts, n) {
  const run = loopRun(Object.assign({ field, clock: PARITY_CLOCK }, opts));
  const stepResults = [];
  const real = run.h.fastPath;
  globalThis.FsbFastPath = Object.assign({}, real, {
    afterStep(session, step, toolResults) {
      const own = (toolResults || []).find((t) => t && step && t.callId === step.callId);
      stepResults.push(JSON.parse(JSON.stringify(own ? own.result : null)));
      return real.afterStep(session, step, toolResults);
    }
  });
  try {
    await runSteps(run, n);
    const fastEvent = (run.h.session.actionHistory || []).find((e) => e.decisionSource === 'jev') || null;
    return {
      steps: JSON.parse(JSON.stringify(run.steps)),
      fastExecuteActions: contentActions(run.h.events, 'executeAction').filter((e) => e.message.params && e.message.params.jevHandle).length,
      executeActions: contentActions(run.h.events, 'executeAction').length,
      stepResults,
      fastResult: fastEvent ? JSON.parse(JSON.stringify(fastEvent.result)) : null,
      handoffs: handoffMessages(run.h.session.messages).map((m) => m.content),
      attempts: JSON.parse(JSON.stringify((run.h.session.jevMeasurement && run.h.session.jevMeasurement.attempts) || [])),
      running: stillRunning(run),
      latched: jevFastOf(run).latched,
      off: fastStateOf(run).off === true
    };
  } finally {
    finish(run);
  }
}

async function runTaskSafetyParityCases() {
  section('run_task safety parity: one dispatch, risk exclusion and permission denial under the real run_task field (Phase 70 SC3, D-06)');
  const runTaskField = Object.assign({}, loadSessionFieldHelper()(true, 'mcp'));
  check(JSON.stringify(runTaskField) === JSON.stringify({ enabled: true, stored: true, source: 'mcp', budgetProfile: 'run_task' }),
    'run_task safety parity: the session field is the real helper output for (true, "mcp")');

  // An uncertain fast click is dispatched once and escalated once (D-18).
  // The content answers are raw content-script answers: executeContentTool
  // wraps the first as result, and turns the thrown "Receiving end does not
  // exist" into {success:true, result:{bfCacheDetected:true, currentUrl}}.
  const uncertain = [
    ['unknown outcome / mayHaveExecuted', () => ({ success: false, outcome: 'unknown', mayHaveExecuted: true }),
      (r) => r && r.success === false && r.result && r.result.outcome === 'unknown' && r.result.mayHaveExecuted === true,
      (r) => r && r.success === false && r.error === null],
    ['bfCacheDetected', () => { throw new Error('Receiving end does not exist'); },
      (r) => r && r.success === true && r.result && r.result.bfCacheDetected === true,
      (r) => r && r.success === true && r.error === null]
  ];
  for (const [name, action, shape, recorded] of uncertain) {
    const opts = { content: { entries: NEXT_ENTRIES, action }, answers: [calibratedPick('click', 'Next'), catchAll] };
    const t = await parityLoopRun(runTaskField, opts, 4);
    const a = await parityLoopRun(FAST_FIELD, opts, 4);
    check(t.fastExecuteActions === 1 && t.executeActions === 1 && t.steps[1].fast === 1,
      'run_task no second dispatch (' + name + '): the accepted fast click produced exactly one executeAction in the whole run');
    check(t.stepResults.length === 1 && shape(t.stepResults[0]) && recorded(t.fastResult)
      && t.attempts.length >= 1 && t.attempts[0].stepOutcome === 'uncertain',
    'run_task no second dispatch (' + name + '): afterStep read the executor\'s result and classified the step uncertain (' + JSON.stringify(t.stepResults[0]) + ')');
    const it3 = t.steps[2];
    const text = t.handoffs.length === 1 ? t.handoffs[0] : '';
    check(it3.provider === 1 && it3.menus === 0 && it3.decides === 0 && it3.fast === 0 && handoffsIn(it3).length === 1
      && text.indexOf(MAY_HAVE_EXECUTED) !== -1 && text.indexOf('not permitted') === -1,
    'run_task no second dispatch (' + name + '): the next iteration runs the LLM with one hand-off saying the step "' + MAY_HAVE_EXECUTED + '"');
    check(t.steps[3].fast === 0 && t.running, 'run_task no second dispatch (' + name + '): no second dispatch afterwards and the session keeps running');
    check(JSON.stringify(t) === JSON.stringify(a), 'run_task no second dispatch (' + name + '): the run equals the autopilot-field run step for step');
  }

  // A calibrated pick of a control fast mode never acts on (D-19).
  for (const [name, label, reason] of [['a commit-word control', 'Pay now', 'risk_excluded'], ['a text field', 'Name', 'not_fast_eligible']]) {
    const opts = { content: { entries: RISK_ENTRIES }, answers: [calibratedPick('click', label)] };
    const t = await parityLoopRun(runTaskField, opts, 3);
    const a = await parityLoopRun(FAST_FIELD, opts, 3);
    const it2 = t.steps[1];
    check(t.executeActions === 0 && t.steps.every((s) => s.fast === 0) && it2.decides === 1 && it2.provider === 1
      && t.attempts.length >= 1 && t.attempts[0].escalationReason === reason && t.running,
    'run_task risk excluded (' + name + '): the calibrated pick escalates ' + reason + ', no executeAction is sent and the LLM takes the iteration');
    check(JSON.stringify(t) === JSON.stringify(a), 'run_task risk excluded (' + name + '): the run equals the autopilot-field run step for step');
  }

  // A permission denial still blocks the fast call (D-19).
  const denied = {};
  for (const [key, fastMode] of [['run_task', runTaskField], ['autopilot', Object.assign({}, FAST_FIELD)]]) {
    const { h, decideRequests } = fastHarness({ harness: { providerScript: [LLM_SNAPSHOT, LLM_DONE], permissionDenies: ['click'], sessionPatch: { fastMode } } });
    try {
      await h.step();
      await h.step();
      await h.step();
      denied[key] = { events: JSON.parse(JSON.stringify(h.events)), decides: decideRequests.length, messages: JSON.parse(JSON.stringify(h.session.messages)) };
    } finally {
      h.dispose();
    }
  }
  const d = denied.run_task;
  const it2 = stepEvents(d.events, 2);
  const it3 = stepEvents(d.events, 3);
  const requests3 = ofType(it3, 'provider');
  const deniedHandoffs = requests3.length === 1 ? handoffMessages(requests3[0].requestBody.messages) : [];
  check(d.decides === 1 && ofType(it2, 'provider').length === 0 && contentActions(d.events, 'executeAction').length === 0,
    'run_task permission denial: the accepted fast click is refused by the real permission hook and no executeAction is sent');
  check(requests3.length === 1 && deniedHandoffs.length === 1 && deniedHandoffs[0].content.indexOf('not permitted, so nothing ran') !== -1
    && deniedHandoffs[0].content.indexOf('not run: not permitted') !== -1 && contentActions(it3, 'getJevMenu').length === 0,
  'run_task permission denial: the next LLM request carries one hand-off saying the step was not permitted, with no other fast attempt first');
  check(util.isDeepStrictEqual(denied.run_task, denied.autopilot), 'run_task permission denial: the run equals the autopilot-field run event for event');
}

// ---------------------------------------------------------------------------
// Plan 68-08 Task 1: recorded-llm capture through the real loop (D-22)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Plan 70-03 Task 2: the run evidence through the real loop (D-14, F1-F3,
// F14; T-70-01, T-70-07). Every LLM click below is answered by the content
// script itself, so executeContentTool wraps the answer as result: <answer>
// exactly as in production (the fixture-shape rule of 68-07).
// ---------------------------------------------------------------------------

// The content script's answer to a click whose effect it could not confirm.
const UNKNOWN_CLICK_ANSWER = Object.freeze({ success: false, outcome: 'unknown', mayHaveExecuted: true });
const MAYBE_SELECTOR = '#maybe';
const EVIDENCE_START_URL = 'https://wizard.example/start?step=1#top';

function textResponse(id, text) {
  return {
    id,
    object: 'chat.completion',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: text } }],
    usage: { prompt_tokens: 1000, completion_tokens: 40, total_tokens: 1040 }
  };
}

/**
 * A run_task fast-mode run on the real loop with the evidence handlers
 * registered through the harness option. opts: providerScript, answers
 * (scripted gateway; catch-all by default, so no fast step acts), fastAction
 * (the content answer to a fast click), snapshotAnswer (the content answer to
 * getMarkdownSnapshot, when given), permissionDenies, registerRunEvidence
 * (default {startUrl: EVIDENCE_START_URL}).
 */
function evidenceLoop(opts) {
  const o = opts || {};
  const content = H.signatureMenuContent({ entries: NEXT_ENTRIES, action: o.fastAction });
  const respond = (message, options) => {
    if (message && message.action === 'executeAction' && message.params && message.params.selector === MAYBE_SELECTOR) {
      return Object.assign({}, UNKNOWN_CLICK_ANSWER);
    }
    if (typeof o.readResponder === 'function') {
      const answered = o.readResponder(message);
      if (answered !== undefined) return answered;
    }
    if (message && message.action === 'getMarkdownSnapshot' && Object.prototype.hasOwnProperty.call(o, 'snapshotAnswer')) {
      return o.snapshotAnswer;
    }
    return content.respond(message, options);
  };
  const gw = H.scriptedGateway(o.answers || [catchAll]);
  const deps = createBackgroundDeps();
  const rec = H.recordingJevClient(gw.responder, { now: deps.now });
  const h = H.createHarness({
    loadFastPath: true,
    storage: { fsbJevFastModeEnabled: true },
    sessionPatch: { maxIterations: 40, fastMode: loadSessionFieldHelper()(true, 'mcp') },
    deps,
    jevClient: rec.client,
    contentResponder: respond,
    providerScript: o.providerScript,
    permissionDenies: o.permissionDenies || [],
    registerRunEvidence: Object.prototype.hasOwnProperty.call(o, 'registerRunEvidence') ? o.registerRunEvidence : { startUrl: EVIDENCE_START_URL }
  });
  return { h, content, gw, rec, steps: [] };
}

function llmTurn(id, calls) {
  return H.openAiToolResponse(id, calls.map((c, i) => ({ id: id + '_' + i, name: c.name, args: c.args || {} })));
}

const MAYBE_CLICK = Object.freeze({ name: 'click', args: { selector: MAYBE_SELECTOR } });
const DONE_CALL = Object.freeze({ name: 'complete_task', args: { summary: 'Done' } });

/** The executor result the loop recorded for the LLM's click on #maybe (actionHistory keeps an abridged copy). */
function maybeClickRecorded(run) {
  return (run.h.session.actionHistory || []).some((e) => e && e.tool === 'click' && e.params && e.params.selector === MAYBE_SELECTOR);
}

async function runEvidenceLoopCases() {
  const fp = fastPathApi();
  section('run evidence through the real loop: the same-turn gap before complete_task is closed (Phase 70 D-14, F1, F2)');
  // Review CR-01: a page read that never reached the page. The content
  // script is gone ("Receiving end does not exist"), so the executor reports
  // read_page as a success with bfCacheDetected; get_dom_snapshot reports
  // success whatever the content script answered.
  const unreachableRead = (message) => {
    if (message && message.action === 'executeAction' && message.tool === 'readPage') {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    }
    return undefined;
  };
  const erroredDom = (message) => (message && message.action === 'mcp:get-dom' ? { success: false, error: 'DOM unavailable' } : undefined);
  for (const [name, calls, expected, readResponder] of [
    ['same-turn uncertain then complete', [MAYBE_CLICK, DONE_CALL], true],
    ['same-turn report_progress', [MAYBE_CLICK, { name: 'report_progress', args: { message: 'Clicked it' } }, DONE_CALL], true],
    ['same-turn observed', [MAYBE_CLICK, { name: 'get_page_snapshot', args: {} }, DONE_CALL], false],
    ['same-turn read_page that never reached the page', [MAYBE_CLICK, { name: 'read_page', args: {} }, DONE_CALL], true, unreachableRead],
    ['same-turn errored get_dom_snapshot', [MAYBE_CLICK, { name: 'get_dom_snapshot', args: {} }, DONE_CALL], true, erroredDom]
  ]) {
    const run = evidenceLoop({ providerScript: [llmTurn('resp_ev', calls)], readResponder });
    const captured = [];
    const pipelineCount = (event) => (run.h.pipeline._hooks[event] || []).length;
    try {
      const realAfter = run.h.pipeline._hooks.afterToolExecution ? run.h.pipeline._hooks.afterToolExecution.slice() : [];
      run.h.pipeline.register('afterToolExecution', (ctx) => { captured.push({ toolName: ctx.toolName, toolResult: JSON.parse(JSON.stringify(ctx.toolResult)) }); });
      await runSteps(run, 1);
      const ev = run.h.session._fastRunEvidence;
      check(realAfter.length === 1 && pipelineCount('beforeToolExecution') === 2 && pipelineCount('afterIteration') === 1,
        name + ': the harness registered the evidence handlers after the permission hook (one after-tool, one after-iteration)');
      const click = captured.find((c) => c.toolName === 'click');
      check(click && click.toolResult.success === false && JSON.stringify(click.toolResult.result) === JSON.stringify(UNKNOWN_CLICK_ANSWER)
        && fp.classifyStepEvidence('click', click.toolResult).outcome === 'uncertain',
      name + ': the LLM click reached the hook as the executor shape {success:false, result:{outcome:unknown, mayHaveExecuted:true}}');
      check(run.h.session.status === 'completed' && maybeClickRecorded(run) && !captured.some((c) => c.toolName === 'complete_task'),
        name + ': complete_task ended the run in the same turn and emitted no after-tool event of its own');
      check(ev && ev.pending === null && ev.lastUncertainSeq > 0 && fp.runEvidenceUnresolved(ev) === expected,
        name + ': runEvidenceUnresolved is ' + expected + ' after the run (' + JSON.stringify(ev) + ')');
      if (readResponder) {
        const read = captured.find((c) => c.toolName === calls[1].name);
        check(read && read.toolResult.success === true && ev.lastObservationSeq === 0,
          name + ': the read reached the hook as a success (' + JSON.stringify(read && read.toolResult) + ') and is not an observation');
        const verdict = fp.classifyRunTaskOutcome({ source: 'complete', kind: 'complete',
          message: { outcome: 'success', reason: 'complete_task' }, evidence: ev });
        check(verdict.outcome === 'ambiguous' && verdict.reason === 'uncertain_action' && verdict.uncertain_unobserved === true,
          name + ': the success terminal classifies ambiguous/uncertain_action, never done (' + JSON.stringify(verdict) + ')');
      }
    } finally {
      finish(run);
    }
  }

  section('run evidence through the real loop: a fast step is resolved only by a delivered hand-off (Phase 70 D-14, F14)');
  for (const [name, snapshot, expected] of [
    ['fast step handed off (snapshot delivered)', { success: true, markdownSnapshot: 'SNAP', elementCount: 1 }, false],
    ['fast step handed off (snapshot unavailable)', null, true]
  ]) {
    const run = evidenceLoop({
      providerScript: [LLM_CLICK, LLM_DONE],
      answers: [calibratedPick('click', 'Next'), catchAll],
      fastAction: () => ({ success: true }),
      snapshotAnswer: snapshot
    });
    try {
      await runSteps(run, 3);
      const ev = run.h.session._fastRunEvidence;
      const fastEvent = (run.h.session.actionHistory || []).find((e) => e.iteration === 2 && e.decisionSource === 'jev');
      check(run.steps[1].fast === 1 && run.steps[1].provider === 0 && fastEvent && fastEvent.tool === 'click',
        name + ': iteration 2 took one fast click through the real tool loop');
      check(ev && ev.fastIteration === 2 && ev.fastUnobservedSeq === 4,
        name + ': the act marker named iteration 2 and the unconfirmed fast click set fastUnobservedSeq');
      const handoffs = handoffsIn(run.steps[2]);
      check(handoffs.length === 1 && (snapshot ? handoffs[0].content.indexOf('SNAP') !== -1 : handoffs[0].content.indexOf('Snapshot unavailable') !== -1),
        name + ': iteration 3 handed the step to the LLM ' + (snapshot ? 'with the snapshot' : 'without a snapshot'));
      check(run.h.session.status === 'completed' && fp.runEvidenceUnresolved(ev) === expected,
        name + ': the LLM completed and runEvidenceUnresolved is ' + expected + ' (' + JSON.stringify(ev) + ')');
    } finally {
      finish(run);
    }
  }

  section('run evidence through the real loop: a permission-denied call is never left in flight (Phase 70 D-14, F3)');
  {
    const run = evidenceLoop({
      providerScript: [llmTurn('resp_deny', [{ name: 'click', args: { selector: '#start' } }]), textResponse('resp_end', 'All done.')],
      permissionDenies: ['click']
    });
    try {
      await runSteps(run, 2);
      const ev = run.h.session._fastRunEvidence;
      check(contentActions(run.h.events, 'executeAction').length === 0, 'denied call not pending: the denied click never reached the content script');
      check(run.h.session.status === 'completed' && run.h.session.outcomeDetails && run.h.session.outcomeDetails.reason === 'end_turn',
        'denied call not pending: the next turn ended with end_turn');
      check(ev && ev.pending === null && ev.seq === 1 && fp.runEvidenceUnresolved(ev) === false,
        'denied call not pending: [denied click] then end_turn leaves pending null (' + JSON.stringify(ev) + ')');
    } finally {
      finish(run);
    }
  }
  {
    const run = evidenceLoop({
      providerScript: [llmTurn('resp_deny_done', [{ name: 'click', args: { selector: '#start' } }, DONE_CALL])],
      permissionDenies: ['click']
    });
    try {
      await runSteps(run, 1);
      const ev = run.h.session._fastRunEvidence;
      check(run.h.session.status === 'completed' && ev && ev.pending === null && fp.runEvidenceUnresolved(ev) === false,
        'denied call not pending: [denied click, complete_task] in one turn leaves pending null (' + JSON.stringify(ev) + ')');
    } finally {
      finish(run);
    }
  }

  section('run evidence: the harness option is opt-in and follows the fast-mode field (Phase 70 D-14, T-70-07)');
  {
    const run = evidenceLoop({ providerScript: [llmTurn('resp_none', [MAYBE_CLICK, DONE_CALL])], registerRunEvidence: undefined });
    try {
      await runSteps(run, 1);
      check(noRunEvidence(run.h.session) && (run.h.pipeline._hooks.afterIteration || []).length === 0,
        'switch-off untouched: without the option nothing is registered and the session gets no evidence field');
    } finally {
      finish(run);
    }
    const { record, harness } = await H.runGoldenScenario({ loadFastPath: true, registerRunEvidence: true });
    check(matchesGolden(record, 'golden with the option and no field') && noRunEvidence(harness.session),
      'switch-off untouched: the option on a session without fastMode registers nothing and the run equals the golden');
  }
  {
    // The real background.js helper on a switch-off golden session.
    const code = '(function () {\n' + sliceFunction(backgroundSource, 'fsbRegisterFastRunEvidence') + '\nreturn fsbRegisterFastRunEvidence;\n})()';
    let realRegister = null;
    try { realRegister = vm.runInThisContext(code, { filename: 'background.js#fsbRegisterFastRunEvidence' }); } catch (_e) { realRegister = null; }
    const rec = recordingDeps();
    const h = H.createHarness({ providerScript: H.goldenProviderScript(), loadFastPath: true, deps: rec.deps });
    let registered = null;
    try {
      const { LIFECYCLE_EVENTS } = require('../extension/ai/hook-pipeline.js');
      globalThis.LIFECYCLE_EVENTS = LIFECYCLE_EVENTS;
      registered = typeof realRegister === 'function' ? realRegister(h.pipeline, h.session, H.DEFAULTS.pageUrl) : 'missing';
      for (let i = 0; i < 3; i += 1) await h.step();
      check(registered === false && matchesGolden(h.snapshot(), 'golden after the real helper') && noRunEvidence(h.session) && rec.calls.length === 0,
        'switch-off untouched: background.js fsbRegisterFastRunEvidence on a session without fastMode returns false, and the run equals the golden');
    } finally {
      delete globalThis.LIFECYCLE_EVENTS;
      h.dispose();
    }
  }
  delete globalThis.FsbFastPath;
}

// ---------------------------------------------------------------------------
// Phase 70 (70-05 Task 2): run_task outcome end to end (SC2, D-12..D-16).
// Each case runs a switched-on run_task session (the real helper's
// (true, 'mcp') field, the evidence handlers registered as background.js
// does) and replaces fsbBroadcastAutomationLifecycle with a recorder that
// mirrors the bridge's settle (plan 70-06): settle runs synchronously inside
// the terminal broadcast, so on the first automationComplete or
// automationError the recorder builds the fast_mode block right there, from
// the live session; later terminal messages are recorded but never
// re-classified (settle's single-resolve guard). Every case asserts on that
// broadcast-time block. The content answers are raw content-script answers
// (the 68-07 fixture shape), which executeContentTool wraps as result.
// ---------------------------------------------------------------------------

const P70_TASK = 'Finish the wizard (P70-MARKER-TASK)';
const P70_LABEL = 'P70-MARKER-LABEL';
const P70_RESULT = 'P70-MARKER-RESULT';
const MARKED_NEXT = P70_LABEL + ' Next';
const MARKED_ENTRIES = [entry('j1', { label: MARKED_NEXT }), entry('j2', { label: P70_LABEL + ' Back' })];

function markedItems(count) {
  const list = [];
  for (let i = 1; i <= count; i += 1) list.push(entry('j' + i, { label: P70_LABEL + ' Item ' + i }));
  return list;
}

/**
 * The bridge settle, mirrored: replaces the harness's lifecycle stub (which
 * it still calls, so harness.events keeps every lifecycle message) and
 * returns {terminals, blocksComputed, settled: {message, block}, restore}.
 */
function settleRecorder(h) {
  const harnessBroadcast = globalThis.fsbBroadcastAutomationLifecycle;
  const rec = { terminals: [], blocksComputed: 0, settled: null };
  globalThis.fsbBroadcastAutomationLifecycle = function (message) {
    const action = message && message.action;
    if (action === 'automationComplete' || action === 'automationError') {
      rec.terminals.push(JSON.parse(JSON.stringify(message)));
      if (rec.settled === null) {
        rec.blocksComputed += 1;
        const block = fastPathApi().buildFastModeBlock(h.session, {
          source: 'lifecycleBus',
          kind: action === 'automationError' ? 'error' : 'complete',
          message
        });
        rec.settled = { message: JSON.parse(JSON.stringify(message)), block };
      }
    }
    harnessBroadcast(message);
    return Promise.resolve();
  };
  rec.restore = () => { globalThis.fsbBroadcastAutomationLifecycle = harnessBroadcast; };
  return rec;
}

/**
 * A switched-on run_task run on the real loop for the outcome cases: task
 * P70_TASK, menu labels holding P70_LABEL, the evidence handlers registered.
 * opts: providerScript, answers (scripted gateway; catch-all by default),
 * entries (MARKED_ENTRIES), fastAction (the content answer to a fast
 * executeAction), snapshotAnswer (the content answer to getMarkdownSnapshot,
 * when given), permissionDenies. An LLM click on #maybe is answered with
 * UNKNOWN_CLICK_ANSWER.
 */
function outcomeLoop(opts) {
  const o = opts || {};
  const content = H.signatureMenuContent({ entries: o.entries || MARKED_ENTRIES, action: o.fastAction });
  const respond = (message, options) => {
    if (message && message.action === 'executeAction' && message.params && message.params.selector === MAYBE_SELECTOR) {
      return Object.assign({}, UNKNOWN_CLICK_ANSWER);
    }
    if (message && message.action === 'getMarkdownSnapshot' && Object.prototype.hasOwnProperty.call(o, 'snapshotAnswer')) {
      return o.snapshotAnswer;
    }
    return content.respond(message, options);
  };
  const gw = H.scriptedGateway(o.answers || [catchAll]);
  const deps = createBackgroundDeps();
  const rec = H.recordingJevClient(gw.responder, { now: deps.now });
  const h = H.createHarness({
    loadFastPath: true,
    task: P70_TASK,
    storage: { fsbJevFastModeEnabled: true },
    sessionPatch: { maxIterations: 40, fastMode: loadSessionFieldHelper()(true, 'mcp') },
    deps,
    jevClient: rec.client,
    contentResponder: respond,
    providerScript: o.providerScript,
    permissionDenies: o.permissionDenies || [],
    registerRunEvidence: { startUrl: EVIDENCE_START_URL }
  });
  return { h, content, gw, rec, steps: [], recorder: settleRecorder(h) };
}

/** Step until the session leaves 'running' (at most maxSteps iterations). */
async function runUntilSettled(run, maxSteps) {
  for (let i = 0; i < maxSteps && run.h.session.status === 'running'; i += 1) await runSteps(run, 1);
}

function finishOutcome(run) {
  run.recorder.restore();
  finish(run);
}

/** The broadcast-time block: exactly one, the expected fields, the frozen key list, no marker string. */
function expectBlock(run, name, want) {
  const r = run.recorder;
  check(r.blocksComputed === 1 && r.settled !== null,
    name + ': the recorder computed exactly one block, inside the terminal broadcast (' + r.blocksComputed + ')');
  const b = r.settled ? r.settled.block : null;
  for (const key of Object.keys(want)) {
    check(b !== null && util.isDeepStrictEqual(b[key], want[key]),
      name + ': ' + key + ' is ' + JSON.stringify(want[key]) + ' (got ' + JSON.stringify(b ? b[key] : undefined) + ')');
  }
  check(b !== null && util.isDeepStrictEqual(Object.keys(b), fastPathApi().FAST_MODE_BLOCK_KEYS) && b.budget_profile === 'run_task',
    name + ': the block keys are FAST_MODE_BLOCK_KEYS and budget_profile is run_task');
  const inputs = JSON.stringify(r.settled ? r.settled.message : null) + JSON.stringify(run.h.session.messages || []);
  check(inputs.indexOf('P70-MARKER-TASK') !== -1 && b !== null && !/p70-marker/i.test(JSON.stringify(b)),
    name + ': the block holds no marker string, though the task and the terminal message hold one');
  return b;
}

/** The fast-mode state of the session holds a menu label marker (so the marker scan is meaningful). */
function labelMarkerInState(run) {
  const s = run.h.session;
  return JSON.stringify([s.messages, s._fastPath && s._fastPath.recent, s.agentState && s.agentState.jevFast]).indexOf(P70_LABEL) !== -1;
}

function snapshotTurn(id) {
  return H.openAiToolResponse('resp_' + id, [{ id: 'call_' + id, name: 'get_page_snapshot', args: {} }]);
}

function doneTurn(id) {
  return H.openAiToolResponse('resp_' + id, [{ id: 'call_' + id, name: 'complete_task', args: { summary: 'Wizard finished' } }]);
}

async function runTaskOutcomeCases() {
  const fp = fastPathApi();
  section('run_task outcome end to end: the typed outcome follows observed evidence, never the LLM\'s claim or a Jev answer alone (Phase 70 SC2, D-12..D-16)');

  // A Jev-chosen click whose effect is unknown, then the LLM's complete_task.
  for (const [name, snapshot, want] of [
    ['e2e fast uncertain unobserved', null, { outcome: 'ambiguous', reason: 'uncertain_action', uncertain_unobserved: true, human_gate: null }],
    ['e2e fast handed off', { success: true, markdownSnapshot: 'SNAP-HANDOFF', elementCount: 1 },
      { outcome: 'done', reason: 'complete_task', uncertain_unobserved: false, human_gate: null }]
  ]) {
    const run = outcomeLoop({
      providerScript: [LLM_CLICK, LLM_DONE],
      answers: [calibratedPick('click', MARKED_NEXT), catchAll],
      fastAction: () => Object.assign({}, UNKNOWN_CLICK_ANSWER),
      snapshotAnswer: snapshot
    });
    try {
      await runSteps(run, 3);
      const fastEvent = (run.h.session.actionHistory || []).find((e) => e.iteration === 2 && e.decisionSource === 'jev');
      check(run.steps[1].fast === 1 && run.steps[1].provider === 0 && fastEvent && fastEvent.tool === 'click',
        name + ': iteration 2 took one fast click, answered {success:false, outcome:unknown, mayHaveExecuted:true} by the content script');
      const handoffs = handoffsIn(run.steps[2]);
      check(handoffs.length === 1 && (snapshot ? handoffs[0].content.indexOf('SNAP-HANDOFF') !== -1 : handoffs[0].content.indexOf('Snapshot unavailable') !== -1),
        name + ': iteration 3 handed the step to the LLM ' + (snapshot ? 'with the snapshot' : 'with no snapshot'));
      const settled = run.recorder.settled;
      check(run.h.session.status === 'completed' && settled && settled.message.outcome === 'success' && settled.message.reason === 'complete_task',
        name + ': the LLM claimed success with complete_task in iteration 3');
      check(labelMarkerInState(run), name + ': the menu label marker reached the session state');
      const b = expectBlock(run, name, want);
      check(b && b.jev && b.jev.fast_steps === 1 && b.jev.attempts === run.rec.decides.length && b.jev.calls === run.rec.decides.length
        && b.jev.calibration === 'calibrated' && b.jev.escalations.uncertain === 1,
      name + ': jev reports the one fast step, its decide and the uncertain escalation (' + JSON.stringify(b && b.jev) + ')');
      if (!snapshot) {
        // The evidence changes only after the loop has exited: the recorded
        // block keeps the broadcast-time answer.
        const ev = run.h.session._fastRunEvidence;
        ev.lastObservationSeq = Math.max(ev.seq, ev.lastUncertainSeq, ev.fastUnobservedSeq) + 100;
        const later = fp.buildFastModeBlock(run.h.session, { source: 'lifecycleBus', kind: 'complete', message: settled.message });
        check(later.outcome === 'done' && later.reason === 'complete_task',
          'e2e block computed at broadcast: with the evidence changed after the loop exited, a recomputed block would read done/complete_task');
        check(b.outcome === 'ambiguous' && b.reason === 'uncertain_action' && b.uncertain_unobserved === true && run.recorder.blocksComputed === 1,
          'e2e block computed at broadcast: the recorded block still reads ambiguous/uncertain_action, so the cases read the broadcast-time block');
      }
    } finally {
      finishOutcome(run);
    }
  }

  // One LLM turn: an uncertain LLM click, then (maybe) other calls, then complete_task.
  for (const [name, calls, want] of [
    ['e2e llm same turn', [MAYBE_CLICK, DONE_CALL],
      { outcome: 'ambiguous', reason: 'uncertain_action', uncertain_unobserved: true, human_gate: null }],
    ['e2e report_progress', [MAYBE_CLICK, { name: 'report_progress', args: { message: 'Clicked it' } }, DONE_CALL],
      { outcome: 'ambiguous', reason: 'uncertain_action', uncertain_unobserved: true, human_gate: null }],
    ['e2e read after', [MAYBE_CLICK, { name: 'get_page_snapshot', args: {} }, DONE_CALL],
      { outcome: 'done', reason: 'complete_task', uncertain_unobserved: false, human_gate: null }]
  ]) {
    const run = outcomeLoop({ providerScript: [llmTurn('resp_oc', calls)] });
    try {
      await runSteps(run, 1);
      check(run.h.session.status === 'completed' && maybeClickRecorded(run) && run.steps[0].fast === 0 && run.rec.decides.length === 0,
        name + ': one LLM turn ran the #maybe click and complete_task; fast mode took no step and asked Jev nothing');
      expectBlock(run, name, want);
    } finally {
      finishOutcome(run);
    }
  }

  // partial_task: an existing human gate, and an auth wall.
  for (const [name, reason, want] of [
    ['e2e manual approval', 'manual_approval',
      { outcome: 'needs_confirmation', reason: 'manual_approval', uncertain_unobserved: false, human_gate: 'manual_approval' }],
    ['e2e auth wall', 'auth_required', { outcome: 'blocked', reason: 'auth_required', uncertain_unobserved: false, human_gate: null }]
  ]) {
    const run = outcomeLoop({ providerScript: [llmTurn('resp_partial', [{ name: 'partial_task', args: {
      summary: P70_RESULT + ' drafted the reply', blocker: P70_RESULT + ' needs a person', next_step: P70_RESULT + ' approve it', reason
    } }])] });
    try {
      await runSteps(run, 1);
      const m = run.recorder.settled ? run.recorder.settled.message : {};
      check(run.h.session.status === 'partial' && m.action === 'automationComplete' && m.outcome === 'partial' && m.reason === reason
        && JSON.stringify(m).indexOf(P70_RESULT) !== -1,
      name + ': partial_task ended the run as a partial terminal (' + reason + ') whose message carries the LLM\'s text');
      expectBlock(run, name, want);
    } finally {
      finishOutcome(run);
    }
  }

  // A permission-denied click, then end_turn on the next turn.
  {
    const run = outcomeLoop({
      providerScript: [llmTurn('resp_deny', [{ name: 'click', args: { selector: '#start' } }]), textResponse('resp_end', 'All done.')],
      permissionDenies: ['click']
    });
    try {
      await runSteps(run, 2);
      const m = run.recorder.settled ? run.recorder.settled.message : {};
      check(contentActions(run.h.events, 'executeAction').length === 0 && run.h.session.status === 'completed' && m.reason === 'end_turn',
        'e2e denied then end_turn: the denied click never ran and the next turn ended with end_turn');
      expectBlock(run, 'e2e denied then end_turn', { outcome: 'done', reason: 'end_turn', uncertain_unobserved: false, human_gate: null });
    } finally {
      finishOutcome(run);
    }
  }

  // An uncalibrated gateway: one attempt, then the session latch; the outcome comes from task state.
  {
    const run = outcomeLoop({ providerScript: [LLM_CLICK, LLM_DONE], answers: [(request) => ({ body: gateway.uncalibratedBody(request) })] });
    try {
      await runUntilSettled(run, 4);
      const state = fastStateOf(run);
      check(run.rec.decides.length === 1 && state.off === true && state.offReason === 'not_calibrated' && total(run, 'fast') === 0,
        'e2e uncalibrated tally: one decide, no fast step, and 68 latched the session ' + state.offReason);
      const b = expectBlock(run, 'e2e uncalibrated tally', { outcome: 'done', reason: 'complete_task', uncertain_unobserved: false, human_gate: null });
      check(b && b.jev && b.jev.attempts === 1 && b.jev.calls === 1 && b.jev.fast_steps === 0 && b.jev.calibration === 'uncalibrated'
        && b.jev.latched === state.offReason && b.jev.exhausted === null,
      'e2e uncalibrated tally: jev reports attempts 1, calls 1, fast_steps 0, calibration uncalibrated and latched ' + state.offReason
        + ' (' + JSON.stringify(b && b.jev) + ')');
    } finally {
      finishOutcome(run);
    }
  }

  // Twelve accepted fast steps spend the run_task step budget; the LLM still ends the task.
  {
    const ref = {};
    const run = outcomeLoop({
      entries: markedItems(20),
      answers: [(request, info, index) => calibratedPick('click', P70_LABEL + ' Item ' + (index + 1))(request)],
      providerScript: (index) => (ref.run && jevFastOf(ref.run).latched === 'step_budget' ? doneTurn('budget_done') : snapshotTurn('budget_' + index))
    });
    ref.run = run;
    try {
      await runUntilSettled(run, 25);
      const latched = jevFastOf(run).latched;
      check(total(run, 'fast') === 12 && latched === 'step_budget' && run.h.session.status === 'completed',
        'e2e step budget tally: twelve fast steps ran, 68 latched the command ' + latched + ' and the task completed');
      const last = run.steps[run.steps.length - 1];
      const fastTools = (run.h.session.actionHistory || []).filter((e) => e && e.decisionSource === 'jev').map((e) => e.tool);
      check(run.recorder.settled && run.recorder.settled.message.reason === 'complete_task' && last.provider === 1 && last.fast === 0
        && fastTools.length === 12 && fastTools.every((t) => TERMINAL_TOOLS.indexOf(t) === -1),
      'e2e step budget tally: the LLM\'s complete_task ended the task; no fast step named a terminal tool');
      check(labelMarkerInState(run), 'e2e step budget tally: the menu label marker reached the session state');
      const b = expectBlock(run, 'e2e step budget tally', { outcome: 'done', reason: 'complete_task', uncertain_unobserved: false, human_gate: null });
      check(b && b.jev && b.jev.fast_steps === 12 && b.jev.exhausted === latched && b.jev.latched === null,
        'e2e step budget tally: jev reports fast_steps 12 and exhausted ' + latched + ' (' + JSON.stringify(b && b.jev) + ')');
    } finally {
      finishOutcome(run);
    }
  }

  // A transient timeout between calibrated answers: reported, never the outcome.
  {
    const script = () => [snapshotTurn('tr_1'), snapshotTurn('tr_2'), doneTurn('tr_done')];
    const answersWith = (second) => [calibratedPick('click', MARKED_NEXT), second, calibratedPick('click', MARKED_NEXT), catchAll];
    const blocks = {};
    for (const [label, second] of [['timeout', () => ({ body: gateway.fallbackBody('timeout', 504) })], ['reference', catchAll]]) {
      const run = outcomeLoop({ providerScript: script(), answers: answersWith(second) });
      try {
        await runUntilSettled(run, 8);
        blocks[label] = { b: run.recorder.settled ? run.recorder.settled.block : null, run: { decides: run.rec.decides.length, fast: total(run, 'fast'),
          status: run.h.session.status, off: fastStateOf(run).off, latched: jevFastOf(run).latched } };
        if (label === 'timeout') {
          check(run.rec.decides.length === 4 && total(run, 'fast') === 2 && run.steps[2].decides === 1 && run.steps[2].provider === 1
            && run.steps[3].fast === 1 && fastStateOf(run).off === false && !jevFastOf(run).latched,
          'e2e transient tally: the timeout (decide 2) cost its iteration only, and the calibrated answer after it acted (' + JSON.stringify(blocks[label].run) + ')');
          const b = expectBlock(run, 'e2e transient tally', { outcome: 'done', reason: 'complete_task', uncertain_unobserved: false, human_gate: null });
          check(b && b.jev && b.jev.escalations.timeout === 1 && b.jev.latched === null && b.jev.fast_steps === 2,
            'e2e transient tally: jev.escalations.timeout is 1 (' + JSON.stringify(b && b.jev) + ')');
        }
      } finally {
        finishOutcome(run);
      }
    }
    const t = blocks.timeout.b;
    const r = blocks.reference.b;
    check(t && r && util.isDeepStrictEqual(blocks.timeout.run, Object.assign({}, blocks.reference.run))
      && ['outcome', 'reason', 'uncertain_unobserved', 'human_gate'].every((k) => t[k] === r[k]) && !(r.jev && r.jev.escalations.timeout),
    'e2e transient tally: the outcome equals the reference run whose second answer is a calibrated catch-all instead of the timeout');
  }
  {
    // WR-04 (70-SYNC-RECHECK Drift substitution 5): a timeout before any
    // calibrated answer latches the session; still only reported.
    const run = outcomeLoop({ providerScript: [LLM_CLICK, LLM_DONE], answers: [() => ({ body: gateway.fallbackBody('timeout') }), calibratedPick('click', MARKED_NEXT)] });
    try {
      await runUntilSettled(run, 4);
      const state = fastStateOf(run);
      check(run.rec.decides.length === 1 && state.off === true && state.offReason === 'timeout',
        'e2e transient tally (WR-04): a timeout before any calibrated answer latches the session timeout, so the calibrated answer is never asked for');
      const b = expectBlock(run, 'e2e transient tally (WR-04)', { outcome: 'done', reason: 'complete_task', uncertain_unobserved: false, human_gate: null });
      check(b && b.jev && b.jev.escalations.timeout === 1 && b.jev.latched === 'timeout',
        'e2e transient tally (WR-04): jev.escalations.timeout is 1 and latched is timeout (' + JSON.stringify(b && b.jev) + ')');
    } finally {
      finishOutcome(run);
    }
  }
  delete globalThis.FsbFastPath;
}

const CAPTURE_PAGE ='http://127.0.0.1:53211/r/Ab3dEf9hIj2kLm5nOp8qRs/fixtures/checklist/index.html';
const CAPTURE_CASE_LABEL = "case 'jevCaptureObservation': {";

/** background.js's case 'jevCaptureObservation', compiled in this realm over `activeSessions`. */
function captureCaseRunner(activeSessions) {
  const start = backgroundSource.indexOf(CAPTURE_CASE_LABEL);
  if (start < 0) throw new Error('case jevCaptureObservation not found in background.js');
  let j = start + CAPTURE_CASE_LABEL.length - 1;
  for (let depth = 0; j < backgroundSource.length; j += 1) {
    if (backgroundSource[j] === '{') depth += 1;
    else if (backgroundSource[j] === '}' && --depth === 0) break;
  }
  const body = backgroundSource.slice(start, j + 1);
  const factory = vm.runInThisContext('(function (activeSessions) {\nreturn function runCaptureCase(request, sender, sendResponse) {\nswitch (request.action) {\n'
    + body + '\n}\n};\n})', { filename: 'background.js#jevCaptureObservation' });
  return factory(activeSessions);
}

/**
 * The checklist fixture page: an Alpha box (j1) and Save (j2). A getJevMenu
 * with capture:true arms one observation, which the next executeAction
 * reports through the real background case, as the 68-03 content script
 * does: '#alpha' and '#save' resolve to their handles, '#other' resolves
 * outside the menu, and a text click resolves nothing.
 */
function captureContent(state) {
  return function respond(message) {
    if (message && message.action === 'getJevMenu') {
      state.menus += 1;
      const n = state.menus;
      const options = message.options || {};
      const generation = 'cafe' + n + 'abc-' + n;
      state.armed = options.capture === true ? generation : null;
      return {
        success: true,
        generation,
        url: CAPTURE_PAGE,
        title: 'Checklist',
        visibleText: 'Checklist Alpha Save',
        moreBelow: false,
        signature: 'capsig-' + n,
        count: 2,
        truncated: false,
        entries: [
          entry('j1', { role: 'checkbox', label: 'Alpha', ops: ['check_box', 'click'], inputType: 'checkbox',
            state: { checked: false, expanded: null, selected: null, pressed: null } }),
          entry('j2', { label: 'Save' })
        ],
        recentHandles: (Array.isArray(options.recent) ? options.recent : []).map(() => null)
      };
    }
    if (message && message.action === 'executeAction') {
      if (state.armed !== null) {
        const generation = state.armed;
        state.armed = null;
        const selector = message.params && typeof message.params.selector === 'string' ? message.params.selector : '';
        const handle = selector === '#alpha' ? 'j1' : (selector === '#save' ? 'j2' : null);
        state.observations.push({ tool: message.tool, handle });
        state.runCase({ action: 'jevCaptureObservation', generation, handle, resolved: handle !== null || selector === '#other', tool: message.tool },
          { tab: { id: state.tabId }, frameId: 0 }, () => {});
      }
      return { success: true };
    }
    return H.defaultContentResponder(message);
  };
}

/** A fast-mode run on the checklist fixture page with an uncalibrated gateway; armed sets the internal capture arm. */
function captureLoop(armed) {
  const state = { menus: 0, armed: null, observations: [], tabId: null, runCase: null };
  const decides = [];
  const storage = { fsbJevFastModeEnabled: true };
  if (armed) storage.fsbJevCaptureArmed = true;
  const turn = (n, name, args) => H.openAiToolResponse('resp_cap_' + n, [{ id: 'call_cap_' + n, name, args }]);
  const h = H.createHarness({
    loadFastPath: true,
    pageUrl: CAPTURE_PAGE,
    storage,
    sessionPatch: { fastMode: Object.assign({}, FAST_FIELD) },
    deps: createBackgroundDeps(),
    jevResponder: (request) => { decides.push(request); return { body: gateway.uncalibratedBody(request) }; },
    contentResponder: captureContent(state),
    providerScript: [
      turn(1, 'check_box', { selector: '#alpha' }),
      turn(2, 'click', { selector: '#save' }),
      turn(3, 'get_page_snapshot', {}),
      turn(4, 'click', { text: 'Save' }),
      turn(5, 'click', { selector: '#other' }),
      turn(6, 'get_page_snapshot', {})
    ]
  });
  state.tabId = h.session.tabId;
  state.runCase = captureCaseRunner(new Map([[h.sessionId, h.session]]));
  return { h, state, decides };
}

async function captureLoopCases() {
  section('capture through the loop: armed fixture page, uncalibrated gateway (D-22, T-68-11, T-68-17)');
  {
    const run = captureLoop(true);
    const menusPerStep = [];
    for (let i = 1; i <= 6; i += 1) {
      await run.h.step();
      menusPerStep.push(contentActions(stepEvents(run.h.events, i), 'getJevMenu'));
    }
    for (let i = 0; i < 40; i += 1) await new Promise((resolve) => setImmediate(resolve));
    const ring = run.h.storage.local.fsbJevCaptureRing;
    const NONE = gateway.CATCH_ALL;
    check(run.decides.length === 1, 'capture loop: Jev is asked once (iteration 2), and never again after the uncalibrated latch');
    check(menusPerStep.every((list) => list.length === 1 && list[0].message.options.capture === true && list[0].options && list[0].options.frameId === 0),
      'capture loop: exactly one getJevMenu per LLM-path iteration, each with capture:true to frame 0');
    check(run.state.observations.length === 4 && JSON.stringify(run.state.observations.map((o) => o.tool)) === JSON.stringify(['toggleCheckbox', 'click', 'click', 'click']),
      'capture loop: each LLM action on an armed menu is observed once (iterations 1, 2, 4 and 5; the snapshot turns send none)');
    check(ring && ring.v === 1 && Array.isArray(ring.records) && ring.records.length === 4,
      'capture loop: one ring record per labelled LLM-path iteration (iterations 1, 2, 3 and 5; ' + (ring && ring.records ? ring.records.length : 'no ring') + ')');
    const labels = ring && Array.isArray(ring.records) ? ring.records.map((r) => [r.iteration, r.label]) : [];
    check(JSON.stringify(labels) === JSON.stringify([
      [1, { op: 'check_box', target: 'j1' }],
      [2, { op: 'click', target: 'j2' }],
      [3, { op: NONE, target: NONE }],
      [5, { op: 'click', target: NONE }]
    ]), 'capture loop: labels follow the LLM\'s own tool and target (' + JSON.stringify(labels) + ')');
    check(ring && JSON.stringify(ring.drops) === JSON.stringify({ target_unknown: 1 }), 'capture loop: the text-based click is dropped as target_unknown, never labelled');
    const armReads = run.h.events.filter((e) => e.type === 'storage-get' && util.isDeepStrictEqual(e.keys, ['fsbJevCaptureArmed']));
    check(armReads.length === 1, 'capture loop: the arm is read once for the command');
    const pending = run.h.session._fastPath && run.h.session._fastPath.capturePending;
    check(pending && pending.record && pending.record.iteration === 6, 'capture loop: the last LLM turn waits for the next iteration to be labelled');
    const written = JSON.stringify(ring || {});
    check(written.indexOf(run.h.session.task) === -1 && written.indexOf('?') === -1, 'capture loop: no task text and no query string in the ring');
    check(run.h.session.status === 'running' && !run.h.session.messages.some((m) => typeof m.content === 'string' && m.content.indexOf(HANDOFF_PREFIX) === 0),
      'capture loop: capture adds no session message and never ends the session');
    run.h.dispose();
  }

  section('capture through the loop: unarmed, nothing is captured');
  {
    const run = captureLoop(false);
    const menusPerStep = [];
    for (let i = 1; i <= 6; i += 1) {
      await run.h.step();
      menusPerStep.push(contentActions(stepEvents(run.h.events, i), 'getJevMenu'));
    }
    for (let i = 0; i < 40; i += 1) await new Promise((resolve) => setImmediate(resolve));
    check(run.decides.length === 1, 'capture loop (unarmed): one decide, in iteration 2');
    check(menusPerStep[0].length === 0 && menusPerStep[1].length === 1 && menusPerStep[1][0].message.options.capture === false,
      'capture loop (unarmed): the only menu is the fast attempt\'s, with capture:false');
    check(menusPerStep.slice(2).every((list) => list.length === 0), 'capture loop (unarmed): no getJevMenu after the uncalibrated latch');
    check(!('fsbJevCaptureRing' in run.h.storage.local) && !run.h.events.some((e) => e.type === 'storage-set'),
      'capture loop (unarmed): no ring and no storage write');
    check(run.state.observations.length === 0, 'capture loop (unarmed): no observation is ever sent');
    const armReads = run.h.events.filter((e) => e.type === 'storage-get' && util.isDeepStrictEqual(e.keys, ['fsbJevCaptureArmed']));
    check(armReads.length === 1, 'capture loop (unarmed): the arm is read once for the command');
    run.h.dispose();
  }
}

async function main() {
  await offGoldenCases();
  await offThreeWayCases();
  sliceHashCases();
  seamShapeCases();
  await acceptedStepCases();
  await toolDispatchCase();
  await permissionDenialCase();
  await runTaskCase();
  await containmentCases();
  // Plan 68-07 Task 1: latches and budgets.
  await uncalibratedLatchCases();
  await fallbackClassCases();
  await budgetCases();
  await completionStuckCases();
  await noProgressCases();
  await sameStateCases();
  await breakerCases();
  // Plan 68-07 Task 2: outcomes, pairing and containment.
  await uncertainOutcomeCases();
  await pairingCases();
  await collapseCase();
  await exceptionCases();
  await lostStepCase();
  await replayRecordCase();
  await metricsRowCase();
  await stopCase();
  await switchOffCase();
  // Phase 70 (70-02 Task 3): run_task safety parity.
  await runTaskSafetyParityCases();
  // Phase 70 (70-03 Task 2): the run evidence through the real loop.
  await runEvidenceLoopCases();
  // Phase 70 (70-05 Task 2): the typed run_task outcome through the real loop.
  await runTaskOutcomeCases();
  // Plan 68-08 Task 1: recorded-llm capture through the real loop.
  await captureLoopCases();
  terminalToolChecks();
  // The Task 2 golden cases again, after every fast-mode run in this process.
  section('off golden again after the fast-mode runs (no state leaks between harnesses)');
  const again = await H.runGoldenScenario({ loadFastPath: false });
  check(matchesGolden(again.record, 'run A again'), 'off golden: run A still equals the golden after the fast-mode cases');

  console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
