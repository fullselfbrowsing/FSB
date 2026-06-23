'use strict';

/**
 * Phase 29 Plan 01 (v0.9.99 Native Capability Catalog) -- autopilot-parity unit
 * suite. WAVE 0: this file is authored BEFORE the autopilot capability branch
 * (Plan 05, extension/ai/tool-executor.js executeCapabilityToolForAutopilot) and
 * the dispatcher reroute (Plan 04) exist. The INV-01 / Anti-Pattern-1 guards
 * (registry absence + frozen non-trigger hash) run GREEN today; the
 * one-engine-two-front-doors assertions are RED until Plans 04/05 wire both doors
 * to globalThis.FsbCapabilityRouter.invoke. That split is the correct Wave 0 state.
 *
 * Proves (CAT-04 / INV-02 + the INV-01 floor):
 *
 *   (1) ONE engine, TWO front doors: a spy installed on
 *       globalThis.FsbCapabilityRouter.invoke is hit by BOTH front doors --
 *       the MCP dispatcher route (mcp:capabilities-invoke -> Plan 04 reroute) and
 *       the autopilot branch (executeCapabilityToolForAutopilot -> Plan 05) -- with
 *       the SAME (slug, args), and both return the same result-shape keys.
 *   (2) Result-shape identity: the autopilot wrapper returns a makeResult-shaped
 *       { success, hadEffect, error, navigationTriggered, result } whose `result`
 *       is the router response (mirrors the trigger branch makeResult contract).
 *   (3) Anti-Pattern 1 guard (INV-01): neither invoke_capability nor
 *       search_capabilities is in TOOL_REGISTRY (so getPublicTools() -- which maps
 *       ONLY the registry -- can never list them), and the frozen
 *       EXPECTED_NON_TRIGGER_REGISTRY_HASH is unmoved. Reuses the
 *       capability-mcp-surface.test.js registry-hash + out-of-registry pattern.
 *
 * Zero-framework FSB convention: module-level passed/failed counters,
 * check(cond,msg), process.exit(failed>0?1:0).
 *
 * Run: node tests/capability-autopilot-parity.test.js
 */

const crypto = require('crypto');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

// The INV-01 lock value -- reused verbatim from
// tests/capability-mcp-surface.test.js:58-59 / tool-definitions-parity.test.js:52.
// The two out-of-registry capability tools must NOT have moved this.
const EXPECTED_NON_TRIGGER_REGISTRY_HASH =
  '6354d78836bc8927f55af4562dec099f614ebbe034d018c163d7b8b2e5c6b60d';

// The four trigger tools sit IN TOOL_REGISTRY but are excluded from the frozen
// non-trigger baseline (mirrors capability-mcp-surface.test.js:63).
const TRIGGER_TOOL_NAMES = ['trigger', 'stop_trigger', 'get_trigger_status', 'list_triggers'];

// The two capability tools that MUST stay out of TOOL_REGISTRY (INV-01).
const CAPABILITY_TOOL_NAMES = ['invoke_capability', 'search_capabilities'];

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

// Recursive key-sort stringify + sha256 -- copied verbatim from
// capability-mcp-surface.test.js:81-96 so the hash is computed identically.
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce(function (out, key) {
      out[key] = stable(value[key]);
      return out;
    }, {});
  }
  return value;
}
function registryHash(tools) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(tools.map(stable)))
    .digest('hex');
}

async function run() {
  // -------------------------------------------------------------------------
  // (3) Anti-Pattern 1 guard (INV-01) -- runs GREEN today.
  // The two capability tools must NEVER be in TOOL_REGISTRY: getPublicTools()
  // (agent-loop.js:673-678) maps ONLY the registry, so registry-membership is the
  // sole gate on LLM visibility. Out-of-registry => not LLM-listed => the frozen
  // non-trigger hash is unmoved.
  // -------------------------------------------------------------------------
  console.log('\n--- (3) capability tools OUT of TOOL_REGISTRY + frozen hash unmoved (INV-01) ---');

  const td = require(path.join(REPO_ROOT, 'mcp', 'ai', 'tool-definitions.cjs'));
  const registryNames = td.TOOL_REGISTRY.map(function (t) { return t.name; });
  CAPABILITY_TOOL_NAMES.forEach(function (name) {
    check(
      registryNames.indexOf(name) === -1,
      name + ' is NOT in TOOL_REGISTRY (must stay out-of-registry so getPublicTools() never lists it)'
    );
  });

  const nonTriggerTools = td.TOOL_REGISTRY.filter(function (tool) {
    return TRIGGER_TOOL_NAMES.indexOf(tool.name) < 0;
  });
  const actualHash = registryHash(nonTriggerTools);
  check(
    actualHash === EXPECTED_NON_TRIGGER_REGISTRY_HASH,
    'EXPECTED_NON_TRIGGER_REGISTRY_HASH is unchanged -- the two capability tools are out-of-registry (INV-01)'
  );
  if (actualHash !== EXPECTED_NON_TRIGGER_REGISTRY_HASH) {
    console.error('  DIAG: expected ' + EXPECTED_NON_TRIGGER_REGISTRY_HASH);
    console.error('  DIAG: actual   ' + actualHash);
    console.error('  DIAG: a moved hash means a capability tool leaked into TOOL_REGISTRY');
  }

  // -------------------------------------------------------------------------
  // (1) + (2) ONE engine, TWO front doors. Install a spy on the router global and
  // drive BOTH doors. RED until Plan 04 (dispatcher reroute) + Plan 05 (autopilot
  // branch) land; the spy is hit zero/one times until then -- a deterministic RED.
  // -------------------------------------------------------------------------
  console.log('\n--- (1)(2) one engine, two front doors call globalThis.FsbCapabilityRouter.invoke (CAT-04) ---');

  const SLUG = 'github.notifications';
  const ARGS = { query: 'is:unread' };
  const spyCalls = [];

  const priorRouter = globalThis.FsbCapabilityRouter;
  const priorChrome = globalThis.chrome;
  const priorResolveAgentTabOrError = globalThis.resolveAgentTabOrError;

  // The shared engine: a spy that records every (slug, args) and returns a fixed
  // structured hit. BOTH front doors must reach THIS exact global (INV-02).
  globalThis.FsbCapabilityRouter = {
    invoke: async function (slug, args, ctx) {
      spyCalls.push({ slug: slug, args: args, ctx: ctx });
      return { success: true, status: 200, data: { ok: true }, tier: 'T1b' };
    }
  };

  // Minimal chrome stub so a front door that resolves the active-tab origin does
  // not throw (it falls back to null on absence; the spy ignores origin).
  globalThis.chrome = {
    tabs: {
      async query() { return [{ id: 11, url: 'https://github.com/notifications' }]; },
      async get(id) { return { id: id, url: 'https://github.com/notifications' }; }
    }
  };

  // ---- Front door 1: the MCP dispatcher route (mcp:capabilities-invoke). -----
  // Today this still runs the routerless Phase-28 path (Plan 04 reroutes it to the
  // router), so the spy is NOT hit yet -> RED until Plan 04.
  let mcpResult = null;
  let mcpHitSpyBefore = spyCalls.length;
  try {
    const dispatcher = require(path.join(REPO_ROOT, 'extension', 'ws', 'mcp-tool-dispatcher.js'));
    if (typeof dispatcher.dispatchMcpMessageRoute === 'function'
        && dispatcher.hasMcpMessageRoute('mcp:capabilities-invoke')) {
      // dispatchMcpMessageRoute takes a single { type, payload, ... } object
      // (mcp-tool-dispatcher.js:472); the Plan-04 reroute then calls
      // FsbCapabilityRouter.invoke(payload.slug, payload.params, ...).
      mcpResult = await dispatcher.dispatchMcpMessageRoute({
        type: 'mcp:capabilities-invoke',
        payload: { slug: SLUG, params: ARGS, tab_id: 11 }
      });
    }
  } catch (err) {
    console.error('  (front door 1 threw -- acceptable Wave 0 RED):', err && err.message ? err.message : err);
  }
  const mcpHitSpy = spyCalls.length > mcpHitSpyBefore;
  check(mcpHitSpy,
    'CAT-04 front door 1 (MCP dispatcher mcp:capabilities-invoke) calls globalThis.FsbCapabilityRouter.invoke (RED until Plan 04 reroute)');

  // Agent-scoped invoke must resolve through the ownership-aware registry helper
  // and derive origin from the resolved tab, not from caller-controlled tab/origin
  // fields.
  try {
    const dispatcher = require(path.join(REPO_ROOT, 'extension', 'ws', 'mcp-tool-dispatcher.js'));
    const resolverCalls = [];
    globalThis.resolveAgentTabOrError = async function (agentId, payload) {
      resolverCalls.push({ agentId: agentId, payload: payload });
      return { success: true, tabId: 11, agentId: agentId };
    };
    const scopedBefore = spyCalls.length;
    await dispatcher.dispatchMcpMessageRoute({
      type: 'mcp:capabilities-invoke',
      payload: { slug: SLUG, params: ARGS, agentId: 'agent-a', tab_id: 999, origin: 'https://github.com' }
    });
    const scopedCall = spyCalls[spyCalls.length - 1];
    check(resolverCalls.length === 1,
      'mcp:capabilities-invoke with agentId calls resolveAgentTabOrError');
    check(spyCalls.length > scopedBefore && scopedCall && scopedCall.ctx
      && scopedCall.ctx.tabId === 11 && scopedCall.ctx.origin === 'https://github.com',
      'mcp:capabilities-invoke uses the resolved tabId and tab-derived origin for router.invoke');

    const mismatchBefore = spyCalls.length;
    const mismatch = await dispatcher.dispatchMcpMessageRoute({
      type: 'mcp:capabilities-invoke',
      payload: { slug: SLUG, params: ARGS, agentId: 'agent-a', tab_id: 999, origin: 'https://evil.example' }
    });
    check(mismatch && mismatch.success === false && mismatch.errorCode === 'RECIPE_CONSENT_REQUIRED',
      'mcp:capabilities-invoke rejects supplied origin when it mismatches the resolved tab origin');
    check(spyCalls.length === mismatchBefore,
      'mcp:capabilities-invoke origin mismatch fails before FsbCapabilityRouter.invoke');
  } catch (err) {
    console.error('  (agent-scoped invoke regression block threw):', err && err.message ? err.message : err);
    check(false, 'agent-scoped invoke regression block completes');
  }

  // ---- Front door 2: the autopilot branch (executeCapabilityToolForAutopilot). -
  // Plan 05 adds the pre-executeTool capability branch + exports the function. Until
  // then the symbol is absent -> RED.
  let autopilotResult = null;
  let autopilotHitSpyBefore = spyCalls.length;
  try {
    const toolExecutor = require(path.join(REPO_ROOT, 'extension', 'ai', 'tool-executor.js'));
    const autopilotFn = toolExecutor.executeCapabilityToolForAutopilot
      || (typeof globalThis !== 'undefined' ? globalThis.executeCapabilityToolForAutopilot : null);
    if (typeof autopilotFn === 'function') {
      autopilotResult = await autopilotFn('invoke_capability', { slug: SLUG, params: ARGS }, 11);
    }
  } catch (err) {
    console.error('  (front door 2 threw -- acceptable Wave 0 RED):', err && err.message ? err.message : err);
  }
  const autopilotHitSpy = spyCalls.length > autopilotHitSpyBefore;
  check(autopilotHitSpy,
    'CAT-04 front door 2 (autopilot executeCapabilityToolForAutopilot) calls globalThis.FsbCapabilityRouter.invoke (RED until Plan 05 branch)');

  // ---- Both doors reached the SAME engine with the SAME (slug, args). ---------
  check(spyCalls.length >= 2,
    'CAT-04: the router spy was hit by BOTH front doors (one engine, two front doors)');
  if (spyCalls.length >= 2) {
    const a = spyCalls[0];
    const b = spyCalls[1];
    check(a.slug === SLUG && b.slug === SLUG,
      'CAT-04: both front doors invoked the router with the same slug (' + SLUG + ')');
    check(JSON.stringify(a.args) === JSON.stringify(ARGS)
      && JSON.stringify(b.args) === JSON.stringify(ARGS),
      'CAT-04: both front doors invoked the router with the same args');
  }

  // ---- (2) Result-shape identity: the autopilot wrapper is makeResult-shaped. --
  const MAKE_RESULT_KEYS = ['success', 'hadEffect', 'error', 'navigationTriggered', 'result'];
  const autopilotKeysOk = autopilotResult
    && MAKE_RESULT_KEYS.every(function (k) { return Object.prototype.hasOwnProperty.call(autopilotResult, k); });
  check(autopilotKeysOk,
    'CAT-04: the autopilot wrapper returns a makeResult-shaped { success, hadEffect, error, navigationTriggered, result } (RED until Plan 05)');
  check(autopilotResult && autopilotResult.result
    && autopilotResult.result.tier === 'T1b',
    'CAT-04: the autopilot wrapper `result` carries the router response verbatim (tier:T1b)');

  // Restore the spy globals before the Phase-32 block drives the REAL router.
  if (priorRouter === undefined) { delete globalThis.FsbCapabilityRouter; } else { globalThis.FsbCapabilityRouter = priorRouter; }
  if (priorChrome === undefined) { delete globalThis.chrome; } else { globalThis.chrome = priorChrome; }
  if (priorResolveAgentTabOrError === undefined) { delete globalThis.resolveAgentTabOrError; } else { globalThis.resolveAgentTabOrError = priorResolveAgentTabOrError; }

  // -------------------------------------------------------------------------
  // PHASE 32 (HEAL-01, D-02): the autopilot front door surfaces the typed reason /
  // fellBackToDom in makeResult. This drives the REAL capability-router.invoke (NOT
  // the spy above -- the spy would pre-bake the marker and make the assertion
  // self-fulfilling) with a synthetic BROKEN 404 fetch, then asserts
  // executeCapabilityToolForAutopilot surfaces the typed reason so the model sees it
  // next iteration: makeResult.result is the router response carrying the typed code,
  // and makeResult.error reflects response.error || response.errorCode.
  //
  // RED TODAY (the correct Wave 0 state): the real router has NO post-executeBoundSpec
  // classify hook yet (Plan 03), so a broken 404 passes through as { success:true,
  // status:404, tier:'T1b' } -> result.code is undefined and error is null -> the
  // typed-reason assertions RED. Turns GREEN once Plan 03 emits
  // RECIPE_DOM_FALLBACK_PENDING (+ fellBackToDom) on the broken verdict.
  // -------------------------------------------------------------------------
  console.log('\n--- PHASE 32: the autopilot door surfaces the typed reason / fellBackToDom on a broken fetch (HEAL-01, D-02) ---');

  const fs = require('fs');
  const vm = require('vm');
  const BROKEN_CODE = 'RECIPE_DOM_FALLBACK_PENDING';

  const priorRouter32 = globalThis.FsbCapabilityRouter;
  const priorChrome32 = globalThis.chrome;
  const priorCatalog32 = globalThis.FsbCapabilityCatalog;
  const priorFetch32 = globalThis.FsbCapabilityFetch;
  const priorInterp32 = globalThis.FsbCapabilityInterpreter;
  const priorJmespath32 = globalThis.jmespath;

  // Load the REAL router + collaborators (the capability-router.test.js preload).
  vm.runInThisContext(fs.readFileSync(path.join(REPO_ROOT, 'extension', 'lib', 'cfworker-json-schema.min.js'), 'utf8'));
  globalThis.jmespath = require(path.join(REPO_ROOT, 'extension', 'lib', 'jmespath.min.js'));
  require(path.join(REPO_ROOT, 'extension', 'utils', 'capability-recipe-schema.js'));
  require(path.join(REPO_ROOT, 'extension', 'utils', 'capability-auth-strategies.js'));
  globalThis.FsbCapabilityInterpreter = require(path.join(REPO_ROOT, 'extension', 'utils', 'capability-interpreter.js'));
  globalThis.FsbCapabilityRouter = require(path.join(REPO_ROOT, 'extension', 'utils', 'capability-router.js'));
  globalThis.chrome = {
    tabs: {
      async query() { return [{ id: 11, url: 'https://github.com/notifications' }]; },
      async get(id) { return { id: id, url: 'https://github.com/notifications' }; }
    }
  };
  globalThis.FsbCapabilityCatalog = {
    resolve(slug) {
      return slug === SLUG ? { tier: 'T1b', recipe: {
        schemaVersion: 1, id: SLUG, origin: 'https://github.com', endpoint: '/notifications',
        method: 'GET', authStrategy: 'same-origin-cookie', extract: '@'
      } } : null;
    }
  };
  globalThis.FsbCapabilityFetch = {
    async executeBoundSpec() {
      return { success: true, status: 404, finalUrl: 'https://github.com/notifications', redirected: false, data: null, text: 'not found' };
    }
  };

  let brokenAutopilot = null;
  try {
    const toolExecutor32 = require(path.join(REPO_ROOT, 'extension', 'ai', 'tool-executor.js'));
    const fn32 = toolExecutor32.executeCapabilityToolForAutopilot
      || (typeof globalThis !== 'undefined' ? globalThis.executeCapabilityToolForAutopilot : null);
    if (typeof fn32 === 'function') {
      brokenAutopilot = await fn32('invoke_capability', { slug: SLUG, params: ARGS }, 11);
    }
  } catch (err) {
    console.error('  (Phase-32 autopilot door threw -- acceptable Wave 0 RED):', err && err.message ? err.message : err);
  }

  check(brokenAutopilot && brokenAutopilot.result && brokenAutopilot.result.code === BROKEN_CODE,
    'HEAL-01: the autopilot makeResult.result carries the typed ' + BROKEN_CODE
      + ' reason verbatim from the real router (RED until Plan 03 emits it on a broken fetch)');
  check(brokenAutopilot && brokenAutopilot.error === BROKEN_CODE,
    'HEAL-01: makeResult.error reflects response.error || response.errorCode = ' + BROKEN_CODE
      + ' (the model sees the typed reason next iteration -- D-02)');
  check(brokenAutopilot && brokenAutopilot.result && brokenAutopilot.result.fellBackToDom === true,
    'HEAL-01: makeResult.result carries the fellBackToDom marker on the broken verdict (D-04 -- recorded in the audit log)');

  // Restore the Phase-32 globals.
  if (priorRouter32 === undefined) { delete globalThis.FsbCapabilityRouter; } else { globalThis.FsbCapabilityRouter = priorRouter32; }
  if (priorChrome32 === undefined) { delete globalThis.chrome; } else { globalThis.chrome = priorChrome32; }
  if (priorCatalog32 === undefined) { delete globalThis.FsbCapabilityCatalog; } else { globalThis.FsbCapabilityCatalog = priorCatalog32; }
  if (priorFetch32 === undefined) { delete globalThis.FsbCapabilityFetch; } else { globalThis.FsbCapabilityFetch = priorFetch32; }
  if (priorInterp32 === undefined) { delete globalThis.FsbCapabilityInterpreter; } else { globalThis.FsbCapabilityInterpreter = priorInterp32; }
  if (priorJmespath32 === undefined) { delete globalThis.jmespath; } else { globalThis.jmespath = priorJmespath32; }

  console.log('\ncapability-autopilot-parity: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(function (err) {
  failed++;
  console.error('  FAIL: test harness threw:', err && err.stack ? err.stack : err);
  console.log('\ncapability-autopilot-parity: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(1);
});
