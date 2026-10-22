#!/usr/bin/env node
'use strict';

/**
 * Phase 70 Plan 01 (D-24, T-70-09) -- upstream tripwire for the bounded MCP
 * fast task.
 *
 * Phase 70 lets run_task use the Phase 68 fast loop. It consumes interfaces
 * that Phases 67, 68 and 69 built: the session-field helper in background.js,
 * the FsbFastPath module (budgets, evidence classification, measurement), the
 * FsbJevState scrubber and request builder, the session HookPipeline and the
 * agent loop's hook contexts, the 68 test fixtures, the 69 in-process MCP
 * caller helper and the MCP success passthrough. 70-SYNC-RECHECK.md recorded
 * their real names and shapes at P70_START. This suite asserts those names and
 * the behaviour Phase 70 relies on, so a later upstream change fails here,
 * loudly and by name, instead of silently breaking the run_task fast path.
 *
 * A failure means upstream drift: update 70-SYNC-RECHECK.md and the Phase 70
 * plans. Never weaken the upstream test to make this one pass.
 *
 * Deliberately not pinned here, because Phase 70 itself changes them:
 * fsbFastModeSessionField(true, 'mcp').enabled (plan 70-02; owned by
 * tests/jev-fast-start-path.test.js) and the bridge settle text (plan 70-06;
 * owned by tests/run-task-fast-mode-wire.test.js).
 *
 * No network, no ports, no timers. Node 20-safe.
 *
 * Run: node tests/jev-run-task-upstream-contract.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');

// 70-SYNC-RECHECK.md item r, copied as a literal (this suite never reads .planning).
const CREATE_SESSION_HOOKS_SHA256 = '10ce1a544f31072f71121b8ee872a4ff6cdd8b07adb1c7a14171b50e4e940780';

let passed = 0;
let failed = 0;

function check(cond, name) {
  if (cond) {
    passed += 1;
    console.log('  PASS: ' + name);
  } else {
    failed += 1;
    console.error('  FAIL: upstream drift: ' + name
      + ' -- update 70-SYNC-RECHECK.md and the Phase 70 plans; never weaken the upstream test');
  }
}

function section(title) {
  console.log('\n--- ' + title + ' ---');
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function hasOwn(obj, key) {
  return obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
}

function readRepo(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function existsRepo(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

// Copied from tests/ownership-leakage-regression.test.js:19-33 (brace matcher).
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

/**
 * 68-SYNC-RECHECK.md item h slicing (used for the createSessionHooks hash):
 * from `function <name>(` through the brace that closes the body, the body
 * brace being the first `{` after the parameter list's matching `)`.
 */
function sliceFunctionForHash(source, name) {
  const plain = 'function ' + name + '(';
  const start = source.indexOf(plain);
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

/** The text from `anchor` through the first `});` after it, or '' when the anchor is absent. */
function emitContext(source, anchor) {
  const at = source.indexOf(anchor);
  if (at < 0) return '';
  const end = source.indexOf('});', at);
  return end < 0 ? '' : source.slice(at, end + 3);
}

function countOf(text, needle) {
  let n = 0;
  let at = text.indexOf(needle);
  while (at !== -1) {
    n += 1;
    at = text.indexOf(needle, at + needle.length);
  }
  return n;
}

async function main() {
  // -------------------------------------------------------------------------
  section('background.js: fsbFastModeSessionField and createSessionHooks (70-SYNC-RECHECK items a, r)');
  // -------------------------------------------------------------------------
  const bgSource = readRepo('extension/background.js');
  let helperSource = null;
  try { helperSource = extractNamedFunction(bgSource, 'fsbFastModeSessionField'); } catch (_e) { helperSource = null; }
  check(typeof helperSource === 'string' && helperSource.indexOf('function fsbFastModeSessionField(storedValue, source) {') === 0,
    'fsbFastModeSessionField(storedValue, source) is a top-level function in background.js');
  check(countOf(bgSource, 'function fsbFastModeSessionField(') === 1, 'fsbFastModeSessionField is declared exactly once');
  let field = null;
  if (helperSource) {
    try {
      const ctx = vm.createContext({});
      vm.runInContext(helperSource, ctx, { filename: 'background.js#fsbFastModeSessionField' });
      field = ctx.fsbFastModeSessionField;
    } catch (_e) {
      field = null;
    }
  }
  check(typeof field === 'function', 'fsbFastModeSessionField evaluates alone in a vm');
  if (typeof field === 'function') {
    check(sameJson(field(true, undefined), { enabled: true, stored: true, source: null }),
      'fsbFastModeSessionField(true, undefined) deep-equals {enabled:true, stored:true, source:null}');
    const dashboard = field(true, 'dashboard');
    check(dashboard !== null && dashboard.enabled === true && !hasOwn(dashboard, 'budgetProfile'),
      "fsbFastModeSessionField(true, 'dashboard') is enabled and has no budgetProfile key");
    check(field(false, 'mcp') === null, "fsbFastModeSessionField(false, 'mcp') is null");
    check(field(undefined, 'mcp') === null, "fsbFastModeSessionField(undefined, 'mcp') is null");
    check(field('true', 'mcp') === null, "fsbFastModeSessionField('true', 'mcp') is null");
    const mcp = field(true, 'mcp');
    check(mcp !== null && typeof mcp === 'object' && mcp.stored === true && mcp.source === 'mcp',
      "fsbFastModeSessionField(true, 'mcp') returns an object with stored true and source 'mcp' (its enabled value is owned by tests/jev-fast-start-path.test.js)");
  }

  const hooksSlice = sliceFunctionForHash(bgSource, 'createSessionHooks');
  const hooksHash = crypto.createHash('sha256').update(hooksSlice || '', 'utf8').digest('hex');
  check(hooksHash === CREATE_SESSION_HOOKS_SHA256,
    'createSessionHooks is byte-identical to P70_START (sha256 ' + hooksHash.slice(0, 12) + ')');
  let matcherSlice = null;
  try { matcherSlice = extractNamedFunction(bgSource, 'createSessionHooks'); } catch (_e) { matcherSlice = null; }
  check(matcherSlice !== null && matcherSlice === hooksSlice,
    'the brace matcher and the item h slicing cut the same createSessionHooks text');
  check(countOf(hooksSlice || '', 'LIFECYCLE_EVENTS.AFTER_ITERATION') === 0,
    'createSessionHooks registers no AFTER_ITERATION handler');

  // -------------------------------------------------------------------------
  section('FsbFastPath (70-SYNC-RECHECK items b, c, d, f)');
  // -------------------------------------------------------------------------
  let FsbFastPath = null;
  try { FsbFastPath = require('../extension/ai/jev-fast-path.js'); } catch (_e) { FsbFastPath = null; }
  check(FsbFastPath !== null && typeof FsbFastPath === 'object', "require('../extension/ai/jev-fast-path.js') gives an object");
  const fp = FsbFastPath || {};
  for (const name of ['beforeTurn', 'afterStep', 'observeTools', 'flushHandoff', 'latchOff', 'abortInFlight',
    'classifyStepEvidence', 'classifyFallback', 'describeEscalation', 'ensureMeasurement', 'appendAttempt',
    'addCommandTotals', 'attemptFromResult']) {
    check(typeof fp[name] === 'function', 'FsbFastPath.' + name + ' is a function');
  }
  const constants = fp.constants || {};
  for (const [key, value] of [['FAST_MAX_STEPS', 12], ['FAST_MAX_CALLS', 16], ['FAST_WALL_BUDGET_MS', 20000],
    ['FAST_MAX_CONSECUTIVE', 3], ['FAST_ESCALATION_LATCH', 3], ['SUMMARY_PREFIX', 'FAST MODE HAND-OFF']]) {
    check(constants[key] === value, 'FsbFastPath.constants.' + key + ' is ' + JSON.stringify(value));
  }
  check(Object.isFrozen(constants), 'FsbFastPath.constants is frozen');

  if (typeof fp.classifyStepEvidence === 'function') {
    const outcomeOf = (result) => {
      try { return fp.classifyStepEvidence('click', result).outcome; } catch (_e) { return 'threw'; }
    };
    check(outcomeOf({ success: false, result: { outcome: 'unknown' } }) === 'uncertain',
      "classifyStepEvidence: {success:false, result:{outcome:'unknown'}} is uncertain");
    check(outcomeOf({ success: false, result: { mayHaveExecuted: true } }) === 'uncertain',
      'classifyStepEvidence: {success:false, result:{mayHaveExecuted:true}} is uncertain');
    check(outcomeOf({ success: true, result: { bfCacheDetected: true } }) === 'uncertain',
      'classifyStepEvidence: {success:true, result:{bfCacheDetected:true}} is uncertain');
    check(outcomeOf({ success: true, result: { verification: { verified: true } } }) === 'progress',
      'classifyStepEvidence: {success:true, result:{verification:{verified:true}}} is progress');
    check(outcomeOf({ success: true, result: {} }) === 'unconfirmed',
      'classifyStepEvidence: {success:true, result:{}} is unconfirmed');
  }
  if (typeof fp.ensureMeasurement === 'function') {
    let block = null;
    try { block = fp.ensureMeasurement({}); } catch (_e) { block = null; }
    check(sameJson(block, { v: 1, attempts: [], commands: [] }), 'ensureMeasurement({}) returns {v:1, attempts:[], commands:[]}');
  }

  // -------------------------------------------------------------------------
  section('FsbJevState (70-SYNC-RECHECK item l)');
  // -------------------------------------------------------------------------
  let FsbJevState = null;
  try { FsbJevState = require('../extension/ai/jev-state.js'); } catch (_e) { FsbJevState = null; }
  const state = FsbJevState || {};
  for (const name of ['buildRequest', 'scrubText', 'matchesSecret', 'toOriginPath']) {
    check(typeof state[name] === 'function', 'FsbJevState.' + name + ' is a function');
  }
  const contract = state.CONTRACT || {};
  check(Array.isArray(contract.FALLBACK_REASONS) && contract.FALLBACK_REASONS.length === 19,
    'FsbJevState.CONTRACT.FALLBACK_REASONS has 19 reasons');
  if (typeof state.matchesSecret === 'function') {
    check(state.matchesSecret('sk-' + 'a'.repeat(24)) === true, "matchesSecret('sk-' + 24 letters) is true");
  }

  // -------------------------------------------------------------------------
  section('HookPipeline and the permission hook (70-SYNC-RECHECK item p)');
  // -------------------------------------------------------------------------
  let pipelineModule = null;
  try { pipelineModule = require('../extension/ai/hook-pipeline.js'); } catch (_e) { pipelineModule = null; }
  const HookPipeline = pipelineModule && pipelineModule.HookPipeline;
  const EVENTS = (pipelineModule && pipelineModule.LIFECYCLE_EVENTS) || {};
  check(typeof HookPipeline === 'function' && typeof HookPipeline.prototype.register === 'function',
    'HookPipeline.prototype.register is a function');
  for (const key of ['BEFORE_TOOL_EXECUTION', 'AFTER_TOOL_EXECUTION', 'AFTER_ITERATION']) {
    check(typeof EVENTS[key] === 'string' && EVENTS[key].length > 0, 'LIFECYCLE_EVENTS has ' + key);
  }
  if (typeof HookPipeline === 'function' && typeof EVENTS.BEFORE_TOOL_EXECUTION === 'string') {
    let permissionHook = null;
    let PermissionContext = null;
    try {
      permissionHook = require('../extension/ai/hooks/permission-hook.js').createPermissionHook;
      PermissionContext = require('../extension/ai/permission-context.js').PermissionContext;
    } catch (_e) {
      permissionHook = null;
    }
    check(typeof permissionHook === 'function' && typeof PermissionContext === 'function',
      'createPermissionHook and PermissionContext load under Node');
    if (typeof permissionHook === 'function' && typeof PermissionContext === 'function') {
      const context = new PermissionContext();
      check(context.isAllowed('click', '') === true, 'PermissionContext.prototype.isAllowed allows every tool (permission denials cannot happen in production)');
      context.isAllowed = () => false;
      const pipeline = new HookPipeline();
      const seen = [];
      pipeline.register(EVENTS.BEFORE_TOOL_EXECUTION, permissionHook(context));
      pipeline.register(EVENTS.BEFORE_TOOL_EXECUTION, (ctx) => { seen.push(ctx.toolName); return undefined; });
      const out = await pipeline.emit(EVENTS.BEFORE_TOOL_EXECUTION, { toolName: 'click', origin: '' });
      const denial = (out.results || []).find((r) => r && r.denied);
      check(!!denial && denial.shouldStop === false && denial.denied === true && !!denial.denial,
        'the permission hook returns {shouldStop:false, denied:true, denial} for a denied call');
      check(out.stopped === false && sameJson(seen, ['click']),
        'a later BEFORE_TOOL_EXECUTION handler still runs after a denial (only shouldStop === true halts emit)');
    }
  }

  // -------------------------------------------------------------------------
  section('agent-loop.js hook contexts, the D-14 capture contract (70-SYNC-RECHECK item p)');
  // -------------------------------------------------------------------------
  const loopSource = readRepo('extension/ai/agent-loop.js');
  const beforeAnchor = 'hooks.emit(_al_LIFECYCLE_EVENTS.BEFORE_TOOL_EXECUTION, {';
  const afterAnchor = 'hooks.emit(_al_LIFECYCLE_EVENTS.AFTER_TOOL_EXECUTION, {';
  const iterationAnchor = 'hooks.emit(_al_LIFECYCLE_EVENTS.AFTER_ITERATION, {';
  check(countOf(loopSource, beforeAnchor) === 1, 'agent-loop.js emits BEFORE_TOOL_EXECUTION exactly once (one per parsed call)');
  check(countOf(loopSource, afterAnchor) === 1, 'agent-loop.js emits AFTER_TOOL_EXECUTION exactly once (one per executed call)');
  check(countOf(loopSource, iterationAnchor) === 1, 'agent-loop.js emits AFTER_ITERATION exactly once');
  const beforeContext = emitContext(loopSource, beforeAnchor);
  check(beforeContext.indexOf('toolName: call.name') !== -1, 'the BEFORE_TOOL_EXECUTION context carries toolName: call.name');
  check(beforeContext.indexOf('iteration: iterNum') !== -1, 'the BEFORE_TOOL_EXECUTION context carries iteration: iterNum');
  const afterContext = emitContext(loopSource, afterAnchor);
  check(afterContext.indexOf('toolResult: result') !== -1, 'the AFTER_TOOL_EXECUTION context carries toolResult: result');
  check(afterContext.indexOf('toolName: call.name') !== -1, 'the AFTER_TOOL_EXECUTION context carries toolName: call.name');
  check(loopSource.indexOf('return r && r.denied;') !== -1, 'the denial lookup (r && r.denied) still follows the BEFORE emit');
  check(loopSource.indexOf("reason: 'meta_cognitive_loop_break'") !== -1,
    'the meta-cognitive force stop (meta_cognitive_loop_break) still exists (item p residual)');

  // -------------------------------------------------------------------------
  section('68 fixtures, the 68-08 exporter and the 69 caller helper (70-SYNC-RECHECK items g, h, j, k, m)');
  // -------------------------------------------------------------------------
  for (const rel of ['tests/fixtures/agent-loop-fast-harness.js', 'tests/fixtures/jev-fake-gateway.js',
    'tests/fixtures/jev-fast-disclosure-facts.js', 'scripts/bench/shadow/export-capture.mjs',
    'tests/helpers/mcp-in-process.mjs', 'tests/mcp-tools-list-shape-freeze.test.js', 'tests/mcp-expect-caller.test.mjs']) {
    check(existsRepo(rel), rel + ' exists');
  }
  let harness = null;
  try { harness = require('./fixtures/agent-loop-fast-harness.js'); } catch (_e) { harness = null; }
  check(harness !== null && typeof harness.createHarness === 'function' && typeof harness.runGoldenScenario === 'function',
    'the 68 loop harness exports createHarness and runGoldenScenario');
  let gateway = null;
  try { gateway = require('./fixtures/jev-fake-gateway.js'); } catch (_e) { gateway = null; }
  for (const name of ['calibratedBody', 'uncalibratedBody', 'snapshotChangedBody', 'fallbackBody', 'makeClient']) {
    check(gateway !== null && typeof gateway[name] === 'function', 'the fake gateway exports ' + name);
  }
  let facts = null;
  try { facts = require('./fixtures/jev-fast-disclosure-facts.js'); } catch (_e) { facts = null; }
  for (const name of ['SHARED_PHRASES', 'CARD_ONLY_PHRASES', 'PAGE_ONLY_PHRASES', 'FORBIDDEN_PATTERNS', 'ENFORCEMENT']) {
    check(facts !== null && Array.isArray(facts[name]), 'the disclosure fact fixture exports ' + name);
  }
  check(facts !== null && typeof facts.textOf === 'function', 'the disclosure fact fixture exports textOf(html)');

  let exporter = null;
  try { exporter = await import(pathToFileURL(path.join(ROOT, 'scripts', 'bench', 'shadow', 'export-capture.mjs')).href); } catch (_e) { exporter = null; }
  check(exporter !== null && typeof exporter.deriveRecords === 'function', 'scripts/bench/shadow/export-capture.mjs exports deriveRecords');

  let helper = null;
  try { helper = await import(pathToFileURL(path.join(ROOT, 'tests', 'helpers', 'mcp-in-process.mjs')).href); } catch (_e) { helper = null; }
  for (const name of ['createInProcessClient', 'makeStubBridge', 'makeMockAgentScope', 'assertBuildFresh']) {
    check(helper !== null && typeof helper[name] === 'function', 'tests/helpers/mcp-in-process.mjs exports ' + name);
  }

  // -------------------------------------------------------------------------
  section('MCP success passthrough (70-SYNC-RECHECK item m)');
  // -------------------------------------------------------------------------
  const errorsSource = readRepo('mcp/src/errors.ts');
  const branchAt = errorsSource.indexOf('if (fsbResult && fsbResult.success) {');
  const branchEnd = branchAt >= 0 ? errorsSource.indexOf('}', branchAt + 'if (fsbResult && fsbResult.success) {'.length) : -1;
  const branch = branchAt >= 0 && branchEnd > branchAt ? errorsSource.slice(branchAt, branchEnd) : '';
  check(branch.indexOf('JSON.stringify(fsbResult, null, 2)') !== -1,
    'mapFSBError stringifies a success result whole (JSON.stringify(fsbResult, null, 2)) inside the fsbResult && fsbResult.success branch');

  console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('FAIL: upstream drift: unexpected error -- update 70-SYNC-RECHECK.md and the Phase 70 plans; never weaken the upstream test: '
    + (error && error.stack ? error.stack : error));
  process.exit(1);
});
