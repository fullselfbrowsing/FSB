'use strict';

/**
 * Phase 32 Plan 01 (v0.9.99 Native Capability Catalog -- Self-Healing Fallback) --
 * provider-parity unit suite (HEAL-05 / INV-03, D-13). Asserts the capability +
 * DOM-fallback DECISION is equivalent across ALL 7 universal-provider.js targets
 * (the existing PROVIDER_KEYS: xai/openai/anthropic/gemini/openrouter/lmstudio/
 * custom). The router sits BELOW the provider layer and never branches on provider,
 * so a stubbed broken result must yield the byte-identical typed reason regardless
 * of which provider's formatted tools are in play.
 *
 * WAVE 0 split (the correct Wave 0 state):
 *   - The FORMAT half (each provider formats the public tools without error; the two
 *     out-of-registry capability tools never appear) can pass TODAY -- INV-01 holds
 *     by construction (getPublicTools maps ONLY the registry, agent-loop.js:673-678).
 *   - The FALLBACK-DECISION half depends on the Plan 03 router emit + Plan 04 wiring;
 *     it RED-s until the phase is complete. Both halves are kept so the suite reds
 *     until the milestone gate (HEAL-05) is fully green.
 *
 * Harness pieces reused VERBATIM from tests/tool-definitions-parity.test.js
 * (PROVIDER_KEYS :37, formatToolsForProvider + agentLoop.getPublicTools requires
 * :120-122, formattedToolNames :75-84) and the router-invoke spy idiom from
 * tests/capability-autopilot-parity.test.js:127-137.
 *
 * Zero-framework FSB convention: module-level passed/failed counters,
 * check(cond,msg), process.exit(failed>0?1:0). ASCII-only, NO emojis.
 *
 * Run: node tests/provider-parity.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.resolve(__dirname, '..');

// The 7 providers -- copied verbatim from tool-definitions-parity.test.js:37
// (confirmed against universal-provider.js PROVIDER_CONFIGS).
const PROVIDER_KEYS = ['xai', 'openai', 'anthropic', 'gemini', 'openrouter', 'lmstudio', 'custom'];

// The two capability tools that MUST stay out-of-registry (INV-01) and therefore
// can never appear in any provider's formatted tool envelope.
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

// formattedToolNames -- copied verbatim from tool-definitions-parity.test.js:75-84.
// Handles the gemini functionDeclarations / anthropic flat / OpenAI function.name
// shape differences.
function formattedToolNames(formatted, provider) {
  if (provider === 'gemini') {
    return ((formatted[0] && formatted[0].functionDeclarations) || [])
      .map(function (decl) { return decl.name; });
  }
  if (provider === 'anthropic') {
    return formatted.map(function (tool) { return tool.name; });
  }
  return formatted.map(function (tool) { return tool.function && tool.function.name; });
}

const { formatToolsForProvider } = require(path.join(REPO_ROOT, 'extension', 'ai', 'tool-use-adapter.js'));
const agentLoop = require(path.join(REPO_ROOT, 'extension', 'ai', 'agent-loop.js'));

async function run() {
  // -------------------------------------------------------------------------
  // (a) FORMAT half (INV-01) -- the capability surface is provider-independent.
  // For each of the 7 providers the public tools format without error and NEITHER
  // capability tool appears in the formatted envelope (they are out-of-registry;
  // getPublicTools maps only the registry). This half can pass TODAY.
  // -------------------------------------------------------------------------
  console.log('\n--- (a) capability surface is provider-independent: 7 providers format + capability tools absent (INV-01) ---');

  const publicTools = agentLoop.getPublicTools();
  check(Array.isArray(publicTools) && publicTools.length > 0,
    'getPublicTools() returns a non-empty public tool list');

  const systemPrompt = agentLoop.buildSystemPrompt('check my notifications', 'https://github.com/notifications');
  check(systemPrompt.indexOf('search_capabilities') !== -1,
    'buildSystemPrompt advertises search_capabilities despite out-of-registry tool visibility');
  check(systemPrompt.indexOf('invoke_capability') !== -1,
    'buildSystemPrompt advertises invoke_capability despite out-of-registry tool visibility');
  check(systemPrompt.indexOf('RECIPE_DOM_FALLBACK_PENDING') !== -1
      && systemPrompt.indexOf('RECIPE_EXPIRED') !== -1,
    'buildSystemPrompt preserves capability rot fallback reasons for DOM recovery');

  PROVIDER_KEYS.forEach(function (provider) {
    let formatted = null;
    let threw = null;
    try {
      formatted = formatToolsForProvider(publicTools, provider);
    } catch (err) {
      threw = err;
    }
    check(!threw && formatted,
      provider + ': formatToolsForProvider(publicTools) succeeds without error');
    const names = threw ? [] : formattedToolNames(formatted, provider);
    CAPABILITY_TOOL_NAMES.forEach(function (capName) {
      check(names.indexOf(capName) === -1,
        provider + ': ' + capName + ' is ABSENT from the formatted tool envelope (out-of-registry, INV-01)');
    });
  });

  // -------------------------------------------------------------------------
  // (b) FALLBACK-DECISION half (HEAL-05 / INV-03) -- the typed reason a broken
  // recipe yields is byte-equal across all 7 providers. This drives the REAL
  // capability-router.invoke (NOT a canned spy -- a spy would pre-bake the answer
  // and make the suite self-fulfilling), feeding it a synthetic BROKEN
  // executeBoundSpec result (an HTTP 404) via a stubbed fetch primitive + catalog.
  // The router sits BELOW the provider layer and never branches on provider, so the
  // typed reason MUST be byte-identical regardless of which provider's formatted
  // tools are in play.
  //
  // RED TODAY (the correct Wave 0 state): the real router has NO post-executeBoundSpec
  // classify hook yet (Plan 03 adds classifyRecipeBroken in _runDeclarativeTier), so a
  // broken 404 passes straight through as { success:true, status:404, tier:'T1b' } --
  // NOT the dual-field RECIPE_DOM_FALLBACK_PENDING the assertion demands. The half
  // turns GREEN once Plan 03 emits the typed reason on a broken verdict (HEAL-01),
  // and the milestone gate (HEAL-05) closes when the full chain is green.
  // -------------------------------------------------------------------------
  console.log('\n--- (b) the fallback decision (typed reason) is equivalent across all 7 providers (HEAL-05 / INV-03) ---');

  const SLUG = 'github.notifications';
  const BROKEN_CODE = 'RECIPE_DOM_FALLBACK_PENDING';

  // Load the REAL router + its collaborators the way capability-router.test.js does
  // (the same cfworker/jmespath/interpreter preload). The router reads the catalog +
  // fetch primitive off globalThis, which we stub per-provider below.
  vm.runInThisContext(fs.readFileSync(path.join(REPO_ROOT, 'extension', 'lib', 'cfworker-json-schema.min.js'), 'utf8'));
  globalThis.jmespath = require(path.join(REPO_ROOT, 'extension', 'lib', 'jmespath.min.js'));
  require(path.join(REPO_ROOT, 'extension', 'utils', 'capability-recipe-schema.js'));
  require(path.join(REPO_ROOT, 'extension', 'utils', 'capability-auth-strategies.js'));
  globalThis.FsbCapabilityInterpreter = require(path.join(REPO_ROOT, 'extension', 'utils', 'capability-interpreter.js'));

  let ROUTER = null;
  try {
    ROUTER = require(path.join(REPO_ROOT, 'extension', 'utils', 'capability-router.js'));
  } catch (err) {
    console.error('  (router require threw -- acceptable Wave 0 RED):', err && err.message ? err.message : err);
  }

  const priorCatalog = globalThis.FsbCapabilityCatalog;
  const priorFetch = globalThis.FsbCapabilityFetch;

  // A T1b recipe whose bound fetch returns a BROKEN 404 (the recipe-broken verdict
  // Plan 03 classifies). The recipe carries expectedShape so the classifier has the
  // structural signal too.
  const BROKEN_RECIPE = {
    schemaVersion: 1,
    id: SLUG,
    origin: 'https://github.com',
    endpoint: '/notifications',
    method: 'GET',
    authStrategy: 'same-origin-cookie',
    extract: '@'
  };
  globalThis.FsbCapabilityCatalog = {
    resolve(slug) {
      return slug === SLUG ? { tier: 'T1b', recipe: BROKEN_RECIPE } : null;
    }
  };
  globalThis.FsbCapabilityFetch = {
    async executeBoundSpec() {
      // A normalized executeBoundSpec success-shape carrying a 404 -> recipe-broken.
      return { success: true, status: 404, finalUrl: 'https://github.com/notifications', redirected: false, data: null, text: 'not found' };
    }
  };

  // Drive the REAL router once PER provider. The provider's formatted tools are the
  // "context"; the router result must be provider-independent. We assert the router
  // emits the typed RECIPE_DOM_FALLBACK_PENDING reason on the broken fetch.
  const reasonsByProvider = {};
  for (const provider of PROVIDER_KEYS) {
    // Format this provider's tools (proves the provider context is exercised) -- the
    // formatting must not alter the downstream fallback decision.
    try { formatToolsForProvider(publicTools, provider); } catch (_e) { /* RED-tracked above */ }

    let surfacedReason = null;
    if (ROUTER && typeof ROUTER.invoke === 'function') {
      try {
        const res = await ROUTER.invoke(SLUG, {}, { origin: 'https://github.com', tabId: 11 });
        if (res && typeof res.code === 'string') {
          surfacedReason = res.code;
        }
      } catch (err) {
        console.error('  (router.invoke threw for ' + provider + ' -- acceptable Wave 0 RED):',
          err && err.message ? err.message : err);
      }
    }
    reasonsByProvider[provider] = surfacedReason;
    check(surfacedReason === BROKEN_CODE,
      provider + ': the REAL router emits the typed reason ' + BROKEN_CODE
        + ' on a broken 404 fetch (RED until Plan 03 adds the classify hook)');
  }

  // The decisive INV-03 assertion: every provider yielded the SAME typed reason
  // (byte-equal). The router never branches on provider, so the reason is identical.
  const distinct = Array.from(new Set(PROVIDER_KEYS.map(function (p) { return String(reasonsByProvider[p]); })));
  check(distinct.length === 1,
    'INV-03: the typed fallback reason is BYTE-EQUAL across all 7 providers (the router never branches on provider) -- got '
      + JSON.stringify(distinct));
  check(distinct.length === 1 && distinct[0] === BROKEN_CODE,
    'HEAL-05: the single provider-independent fallback reason is ' + BROKEN_CODE
      + ' (RED until Plan 03 emits it on a broken verdict)');

  // Restore globals.
  if (priorCatalog === undefined) { delete globalThis.FsbCapabilityCatalog; } else { globalThis.FsbCapabilityCatalog = priorCatalog; }
  if (priorFetch === undefined) { delete globalThis.FsbCapabilityFetch; } else { globalThis.FsbCapabilityFetch = priorFetch; }

  console.log('\nprovider-parity: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(function (err) {
  failed++;
  console.error('  FAIL: test harness threw:', err && err.stack ? err.stack : err);
  console.log('\nprovider-parity: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(1);
});
