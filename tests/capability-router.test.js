'use strict';

/**
 * Phase 29 Plan 01 (v0.9.99 Native Capability Catalog) -- capability-router unit
 * suite. WAVE 0: this file is authored BEFORE extension/utils/capability-router.js
 * exists (Plan 02 creates it). A clean RED here is the CORRECT and EXPECTED Wave 0
 * state: requiring the not-yet-created module throws MODULE_NOT_FOUND, which this
 * harness detects and reports as a single deterministic non-crash failure. The
 * assertion structure below is the full CAT-01/02/03/05 contract the router must
 * satisfy once it lands; every check() runs GREEN in Plan 02/03 with zero edits
 * to this file (the interfaces are FINALIZED in 29-01-PLAN.md <interfaces>).
 *
 * Proves (RED now, GREEN in Plan 02/03):
 *
 *   - CAT-01 tier order: an in-memory FsbCapabilityCatalog injected via globalThis
 *     drives the T0 -> T1a -> T1b -> T2 -> T3 selection; the router branches on the
 *     entry.tier the catalog declares (a slug is EITHER T1a OR T1b -- no runtime
 *     tie-break, RESEARCH Open Q3).
 *   - CAT-01 origin bias: when the catalog resolve() is handed an owned-tab origin,
 *     the owned-origin entry is selected (mirrors the capability-search.js
 *     _stableSortByOwnedService owned-first semantics) -- origin biases ranking,
 *     never the tier of a known slug.
 *   - CAT-02 T1a dispatch: a tier:'T1a' slug routes to its handler.handle(args, ctx)
 *     and ctx.executeBoundSpec is called with a spec whose origin equals the
 *     handler's declared origin (stub ctx.executeBoundSpec and record the call).
 *   - CAT-02 T1a origin-pin: reusing the capability-fetch.test.js chrome-stub, a
 *     handler spec.origin != active-tab origin yields RECIPE_ORIGIN_MISMATCH with
 *     an EMPTY executeScript recorder (no side effect) -- the pin lives inside the
 *     real executeBoundSpec, the router is not a bypass.
 *   - CAT-03 T1b lifted path: a tier:'T1b' recipe routes through the lifted
 *     interpretRecipe -> executeBoundSpec body and returns the normalized shape
 *     stamped tier:'T1b'.
 *   - CAT-05 typed reasons: unknown slug -> RECIPE_NOT_FOUND; tier:'T2' ->
 *     RECIPE_LEARN_PENDING; tier:'T3' -> RECIPE_DOM_FALLBACK_PENDING; each matches
 *     /^RECIPE_.+$/ AND surfaces verbatim through mapFSBError (dynamic-import the
 *     built mcp/build/errors.js, the capability-mcp-surface.test.js pattern).
 *   - CAT-05 T3-no-exec: the T3 seam returns its reason and a spy proves neither
 *     executeTool nor chrome.scripting.executeScript was called.
 *
 * Zero-framework FSB convention (tests/capability-fetch.test.js +
 * tests/capability-mcp-surface.test.js): module-level passed/failed counters,
 * synchronous check(cond,msg), process.exit(failed>0?1:0). The chrome stub +
 * executeScript recorder come from tests/fixtures/run-task-harness installChromeMock.
 *
 * Run: node tests/capability-router.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');
const harness = require('./fixtures/run-task-harness');

const REPO_ROOT = path.join(__dirname, '..');
const ROUTER_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-router.js');
const CFWORKER_PATH = path.join(REPO_ROOT, 'extension', 'lib', 'cfworker-json-schema.min.js');
const JMESPATH_PATH = path.join(REPO_ROOT, 'extension', 'lib', 'jmespath.min.js');
const SCHEMA_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-recipe-schema.js');
const AUTH_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-auth-strategies.js');
const INTERP_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-interpreter.js');
const FETCH_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-fetch.js');
const STORE_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'mcp-task-store.js');
const ERRORS_BUILT = path.join(REPO_ROOT, 'mcp', 'build', 'errors.js');

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

// ---- Load the real interpreter + fetch primitives so the router's lifted T1b
//      body (interpretRecipe -> executeBoundSpec) and the real origin-pin can run
//      once Plan 02 lands. These are the same loaders capability-fetch.test.js uses.
//      In Wave 0 RED the router require() below fails first; these still load so the
//      harness is structurally valid the moment the module appears.
vm.runInThisContext(fs.readFileSync(CFWORKER_PATH, 'utf8'));
globalThis.jmespath = require(JMESPATH_PATH);
require(SCHEMA_PATH);
require(AUTH_PATH);
const FsbInterp = require(INTERP_PATH);
globalThis.FsbCapabilityInterpreter = FsbInterp;

function freshRequireStore() {
  try { delete require.cache[require.resolve(STORE_PATH)]; } catch (_e) { /* not loaded */ }
  return require(STORE_PATH);
}
function freshRequireFetch() {
  try { delete require.cache[require.resolve(FETCH_PATH)]; } catch (_e) { /* not loaded */ }
  return require(FETCH_PATH);
}

// ---- Require the router under test. A MODULE_NOT_FOUND is the CLEAN Wave 0 RED.
let ROUTER = null;
let routerLoadError = null;
try {
  ROUTER = require(ROUTER_PATH);
} catch (err) {
  routerLoadError = err;
}

if (!ROUTER || typeof ROUTER.invoke !== 'function') {
  // Wave 0 RED: the module does not exist yet (Plan 02). Report a single
  // deterministic failure and exit non-zero WITHOUT crashing -- the harness/require
  // structure itself is proven valid (every collaborator above loaded). The full
  // assertion body below goes GREEN once capability-router.js exports invoke().
  const why = routerLoadError && routerLoadError.code === 'MODULE_NOT_FOUND'
    ? 'capability-router.js not yet created (expected Wave 0 RED; Plan 02 lands it)'
    : ('capability-router.js did not export invoke() ('
        + (routerLoadError && routerLoadError.message ? routerLoadError.message : 'no export')
        + ')');
  check(false, 'CAT-01..05: ' + why);
  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
}

// ===========================================================================
// In-memory catalog stub: globalThis.FsbCapabilityCatalog.resolve(slug, origin).
// A slug is EITHER T1a OR T1b (explicit tier, no runtime tie-break). Origin
// biases ranking only -- the owned-origin entry is returned when two entries of
// the same slug-class exist. This is the contract Plan 02 implements.
// ===========================================================================
function installCatalog(entriesBySlug, originBiasFn) {
  globalThis.FsbCapabilityCatalog = {
    resolve(slug, origin) {
      const entry = entriesBySlug[slug];
      if (!entry) return null;
      if (Array.isArray(entry)) {
        // Multiple same-slug-class candidates -> origin bias picks one (owned first).
        const chosen = (typeof originBiasFn === 'function')
          ? originBiasFn(entry, origin)
          : entry[0];
        return chosen || null;
      }
      return entry;
    }
  };
}
function clearCatalog() {
  delete globalThis.FsbCapabilityCatalog;
}

// A small in-memory recipe mirroring catalog/recipes/github-notifications.json --
// the data shape a T1b catalog entry carries.
const GITHUB_RECIPE = {
  schemaVersion: 1,
  id: 'github.notifications',
  origin: 'https://github.com',
  endpoint: '/notifications',
  method: 'GET',
  authStrategy: 'same-origin-cookie',
  extract: '@'
};

// ===========================================================================
// The async assertion body. Runs sequentially; each block installs its own
// catalog + chrome stub and tears them down.
// ===========================================================================
(async function run() {
  // -----------------------------------------------------------------------
  // CAT-05: unknown slug -> RECIPE_NOT_FOUND (no catalog entry at all).
  // -----------------------------------------------------------------------
  installCatalog({});
  const notFound = await ROUTER.invoke('no.such.capability', {}, { origin: 'https://github.com', tabId: 1 });
  check(notFound && notFound.success === false && notFound.code === 'RECIPE_NOT_FOUND'
    && notFound.errorCode === 'RECIPE_NOT_FOUND',
    'CAT-05: an unknown slug -> dual-field RECIPE_NOT_FOUND');
  check(notFound && /^RECIPE_.+$/.test(notFound.code),
    'CAT-05: RECIPE_NOT_FOUND matches /^RECIPE_.+$/ (surfaces verbatim through the passthrough)');
  clearCatalog();

  // -----------------------------------------------------------------------
  // CAT-05: tier:'T2' (learned stub) -> RECIPE_LEARN_PENDING (no-op, Phase 31).
  // -----------------------------------------------------------------------
  installCatalog({ 'some.learned.slug': { tier: 'T2' } });
  const learn = await ROUTER.invoke('some.learned.slug', {}, { origin: 'https://example.com', tabId: 2 });
  check(learn && learn.success === false && learn.code === 'RECIPE_LEARN_PENDING'
    && learn.errorCode === 'RECIPE_LEARN_PENDING',
    'CAT-05: a tier:T2 entry -> dual-field RECIPE_LEARN_PENDING (learned-recipe stub, Phase 31)');
  check(learn && /^RECIPE_.+$/.test(learn.code),
    'CAT-05: RECIPE_LEARN_PENDING matches /^RECIPE_.+$/');
  clearCatalog();

  // -----------------------------------------------------------------------
  // CAT-05: tier:'T3' (DOM fallback SEAM) -> RECIPE_DOM_FALLBACK_PENDING and a
  // spy proves neither executeTool NOR chrome.scripting.executeScript was called
  // (no DOM execution this phase -- the seam returns a reason only, Phase 32).
  // -----------------------------------------------------------------------
  const t3Recorder = [];
  const t3Handle = harness.installChromeMock({ tabs: [{ id: 3, url: 'https://example.com/x' }] });
  t3Handle.chrome.scripting = {
    executeScript: function () { t3Recorder.push(Array.prototype.slice.call(arguments)); return Promise.resolve([]); }
  };
  let executeToolCalled = false;
  globalThis.executeTool = function () { executeToolCalled = true; return Promise.resolve({ success: true }); };
  installCatalog({ 'some.dom.slug': { tier: 'T3' } });
  const dom = await ROUTER.invoke('some.dom.slug', {}, { origin: 'https://example.com', tabId: 3 });
  check(dom && dom.success === false && dom.code === 'RECIPE_DOM_FALLBACK_PENDING'
    && dom.errorCode === 'RECIPE_DOM_FALLBACK_PENDING',
    'CAT-05: a tier:T3 entry -> dual-field RECIPE_DOM_FALLBACK_PENDING (DOM-fallback seam, Phase 32)');
  check(dom && /^RECIPE_.+$/.test(dom.code),
    'CAT-05: RECIPE_DOM_FALLBACK_PENDING matches /^RECIPE_.+$/');
  check(t3Recorder.length === 0,
    'CAT-05: the T3 seam fired NO chrome.scripting.executeScript (recorder EMPTY -- no DOM execution)');
  check(executeToolCalled === false,
    'CAT-05: the T3 seam did NOT call executeTool() (no next-tier execution this phase)');
  clearCatalog();
  delete globalThis.executeTool;
  t3Handle.restore();

  // =======================================================================
  // PHASE 32 (HEAL-01/HEAL-03/HEAL-04) -- the self-healing fallback assertions.
  // RED until Plan 03 realizes the router classify-hook + quarantine + re-learn
  // wiring. These extend the CAT-05 T3 contract: the dual-field
  // RECIPE_DOM_FALLBACK_PENDING must ALSO fire AFTER a broken T1b/T2 executeBoundSpec
  // (not only on a pre-declared T3 tier). ASCII-only, NO emojis.
  // =======================================================================

  // -----------------------------------------------------------------------
  // HEAL-01 (D-01): a T1b recipe whose executeBoundSpec returns a BROKEN result
  // (an HTTP 404) routes through classifyRecipeBroken and the router returns the
  // dual-field RECIPE_DOM_FALLBACK_PENDING, carrying the underlying reason
  // (RECIPE_EXPIRED / RECIPE_HTTP_4XX) in an extra field. Today the router has no
  // post-fetch classify hook, so it passes the 404 through as success:true -> RED.
  // -----------------------------------------------------------------------
  globalThis.FsbCapabilityFetch = {
    async executeBoundSpec() {
      return { success: true, status: 404, finalUrl: 'https://github.com/notifications', redirected: false, data: null, text: 'not found' };
    }
  };
  installCatalog({ 'github.notifications': { tier: 'T1b', recipe: GITHUB_RECIPE } });
  const brokenFetch = await ROUTER.invoke('github.notifications', {}, { origin: 'https://github.com', tabId: 11 });
  check(brokenFetch && brokenFetch.success === false
    && brokenFetch.code === 'RECIPE_DOM_FALLBACK_PENDING'
    && brokenFetch.errorCode === 'RECIPE_DOM_FALLBACK_PENDING',
    'HEAL-01: a broken (404) T1b fetch routes to the dual-field RECIPE_DOM_FALLBACK_PENDING (the T3 contract fires after a broken fetch, not only a pre-declared T3 tier)');
  check(brokenFetch && /^RECIPE_.+$/.test(brokenFetch.code),
    'HEAL-01: the broken-fetch RECIPE_DOM_FALLBACK_PENDING matches /^RECIPE_.+$/ (surfaces verbatim)');
  check(brokenFetch && typeof brokenFetch.reason === 'string' && /^RECIPE_/.test(brokenFetch.reason),
    "HEAL-01: the fallback carries the underlying broken reason (e.g. RECIPE_EXPIRED / RECIPE_HTTP_4XX) in an extra 'reason' field");
  clearCatalog();
  delete globalThis.FsbCapabilityFetch;

  // -----------------------------------------------------------------------
  // HEAL-03 (D-09): on the rot path the router QUARANTINES the recipe. For a T2
  // learned slug it calls FsbLearnedRecipeStore.quarantine(slug, origin); for a
  // bundled slug it calls the catalog's quarantineBundled(slug). Spy both and assert
  // the quarantine call fired on the broken verdict. RED until Plan 03 wires it.
  // -----------------------------------------------------------------------
  const learnedQuarantineCalls = [];
  const priorLearnedStore = globalThis.FsbLearnedRecipeStore;
  globalThis.FsbLearnedRecipeStore = {
    quarantine: function (slug, origin) { learnedQuarantineCalls.push({ slug: slug, origin: origin }); return Promise.resolve(true); },
    getLearnedSync: function () { return null; }
  };
  globalThis.FsbCapabilityFetch = {
    async executeBoundSpec() {
      return { success: true, status: 500, finalUrl: 'https://github.com/notifications', redirected: false, data: null, text: 'server error' };
    }
  };
  // A T2 learned slug carrying a recipe -> a broken 500 fetch -> quarantine the learned entry.
  installCatalog({ 'learned.github.notifications': { tier: 'T2', recipe: GITHUB_RECIPE, origin: 'https://github.com' } });
  const rotLearned = await ROUTER.invoke('learned.github.notifications', {}, { origin: 'https://github.com', tabId: 11 });
  check(rotLearned && rotLearned.success === false && rotLearned.code === 'RECIPE_DOM_FALLBACK_PENDING',
    'HEAL-03: a broken T2 learned fetch routes to RECIPE_DOM_FALLBACK_PENDING');
  check(learnedQuarantineCalls.length >= 1
    && learnedQuarantineCalls[0].slug === 'learned.github.notifications',
    'HEAL-03: the rot path called FsbLearnedRecipeStore.quarantine(slug, origin) on the broken T2 verdict (the recipe is demoted, NOT deleted -- D-09)');
  clearCatalog();
  delete globalThis.FsbCapabilityFetch;
  if (priorLearnedStore === undefined) { delete globalThis.FsbLearnedRecipeStore; } else { globalThis.FsbLearnedRecipeStore = priorLearnedStore; }

  // Bundled rot: the catalog's quarantineBundled(slug) is called on a broken bundled
  // (T1b) verdict (the NEW session-only quarantinedBundledSlugs set -- D-09/D-12).
  const bundledQuarantineCalls = [];
  globalThis.FsbCapabilityFetch = {
    async executeBoundSpec() {
      return { success: true, status: 503, finalUrl: 'https://github.com/notifications', redirected: false, data: null, text: 'unavailable' };
    }
  };
  // installCatalog sets globalThis.FsbCapabilityCatalog; augment it with a spy
  // quarantineBundled the router calls on the bundled rot path.
  installCatalog({ 'github.notifications': { tier: 'T1b', recipe: GITHUB_RECIPE } });
  globalThis.FsbCapabilityCatalog.quarantineBundled = function (slug) { bundledQuarantineCalls.push(slug); };
  const rotBundled = await ROUTER.invoke('github.notifications', {}, { origin: 'https://github.com', tabId: 11 });
  check(rotBundled && rotBundled.success === false && rotBundled.code === 'RECIPE_DOM_FALLBACK_PENDING',
    'HEAL-03: a broken bundled (T1b) fetch routes to RECIPE_DOM_FALLBACK_PENDING');
  check(bundledQuarantineCalls.length >= 1 && bundledQuarantineCalls[0] === 'github.notifications',
    'HEAL-03: the rot path called catalog.quarantineBundled(slug) on the broken bundled verdict (session-only demotion -- D-09/D-12)');
  clearCatalog();
  delete globalThis.FsbCapabilityFetch;

  // -----------------------------------------------------------------------
  // HEAL-03 re-learn trigger WIRING (D-10): the post-fallback runDiscovery re-learn
  // trigger is reachable on the rot path. Spy FsbDiscoverySession.runDiscovery and
  // assert it is CALLABLE/wired when a recipe rots. NOTE: the exact trigger point is
  // Plan 03's (router or autopilot door); the CI assertion is "the trigger is
  // reachable/wired", NOT "a real fallback completed" (the live re-learn-after-real-
  // fallback is UAT per D-10/A5). RED until Plan 03 wires the trigger.
  // -----------------------------------------------------------------------
  const runDiscoveryCalls = [];
  const priorDiscovery = globalThis.FsbDiscoverySession;
  globalThis.FsbDiscoverySession = {
    runDiscovery: function (origin, opts) { runDiscoveryCalls.push({ origin: origin, opts: opts }); return Promise.resolve({ ok: true }); }
  };
  globalThis.FsbCapabilityFetch = {
    async executeBoundSpec() {
      return { success: true, status: 404, finalUrl: 'https://github.com/notifications', redirected: false, data: null, text: 'gone' };
    }
  };
  installCatalog({ 'github.notifications': { tier: 'T1b', recipe: GITHUB_RECIPE } });
  await ROUTER.invoke('github.notifications', {}, { origin: 'https://github.com', tabId: 11 });
  check(typeof globalThis.FsbDiscoverySession.runDiscovery === 'function' && runDiscoveryCalls.length >= 1,
    'HEAL-03: the post-fallback runDiscovery re-learn trigger is WIRED on the rot path (FsbDiscoverySession.runDiscovery is reachable -- the live re-learn is UAT, D-10)');
  clearCatalog();
  delete globalThis.FsbCapabilityFetch;
  if (priorDiscovery === undefined) { delete globalThis.FsbDiscoverySession; } else { globalThis.FsbDiscoverySession = priorDiscovery; }

  // -----------------------------------------------------------------------
  // HEAL-04 never-mask: a LEGITIMATE no-results (200 + valid shape + empty set) and a
  // LOGGED-OUT (redirected:true -> RECIPE_LOGGED_OUT) each return their REAL/typed
  // result and do NOT route to RECIPE_DOM_FALLBACK_PENDING and fire NO quarantine.
  // -----------------------------------------------------------------------
  const noMaskQuarantineCalls = [];
  const priorLearnedStore2 = globalThis.FsbLearnedRecipeStore;
  globalThis.FsbLearnedRecipeStore = {
    quarantine: function (slug, origin) { noMaskQuarantineCalls.push({ slug: slug, origin: origin }); return Promise.resolve(true); },
    getLearnedSync: function () { return null; }
  };

  // (i) A legitimate no-results: 200 + an empty array (a present container of the
  // expected kind). The router must return the REAL empty result, NOT fall back.
  globalThis.FsbCapabilityFetch = {
    async executeBoundSpec() {
      return { success: true, status: 200, finalUrl: 'https://github.com/notifications', redirected: false, data: [], text: null };
    }
  };
  installCatalog({ 'github.notifications': { tier: 'T1b', recipe: GITHUB_RECIPE } });
  const emptyOk = await ROUTER.invoke('github.notifications', {}, { origin: 'https://github.com', tabId: 11 });
  check(emptyOk && emptyOk.success === true && emptyOk.code !== 'RECIPE_DOM_FALLBACK_PENDING',
    'HEAL-04: a legitimate no-results (200 + empty set) returns the REAL empty result and does NOT route to RECIPE_DOM_FALLBACK_PENDING (never masked)');
  clearCatalog();
  delete globalThis.FsbCapabilityFetch;

  // (ii) A logged-out outcome: redirected:true -> surfaced as RECIPE_LOGGED_OUT, NOT
  // a DOM fallback (a 302->login is surfaced, not healed).
  globalThis.FsbCapabilityFetch = {
    async executeBoundSpec() {
      return { success: true, status: 200, finalUrl: 'https://github.com/login', redirected: true, data: null, text: null };
    }
  };
  installCatalog({ 'github.notifications': { tier: 'T1b', recipe: GITHUB_RECIPE } });
  const loggedOut = await ROUTER.invoke('github.notifications', {}, { origin: 'https://github.com', tabId: 11 });
  check(loggedOut && loggedOut.code !== 'RECIPE_DOM_FALLBACK_PENDING',
    'HEAL-04: a logged-out (redirected:true) outcome does NOT route to RECIPE_DOM_FALLBACK_PENDING (surfaced, not healed)');
  check(noMaskQuarantineCalls.length === 0,
    'HEAL-04: NEITHER the legitimate-no-results NOR the logged-out outcome fired a quarantine (only a real rot demotes a recipe)');
  clearCatalog();
  delete globalThis.FsbCapabilityFetch;
  if (priorLearnedStore2 === undefined) { delete globalThis.FsbLearnedRecipeStore; } else { globalThis.FsbLearnedRecipeStore = priorLearnedStore2; }

  // -----------------------------------------------------------------------
  // CAT-01 tier order + CAT-03 T1b lifted path: a tier:'T1b' recipe routes through
  // the lifted interpretRecipe -> executeBoundSpec body and returns the normalized
  // shape stamped tier:'T1b'. The chrome stub returns a canned logged-in 200.
  // -----------------------------------------------------------------------
  const t1bRecorder = [];
  const t1bHandle = harness.installChromeMock({ tabs: [{ id: 11, url: 'https://github.com/notifications' }] });
  freshRequireStore();
  t1bHandle.chrome.scripting = {
    async executeScript(opts) {
      t1bRecorder.push(opts);
      return [{ result: {
        ok: true, status: 200, finalUrl: 'https://github.com/notifications',
        redirected: false, json: { items: [{ id: 1 }, { id: 2 }] }, text: null
      } }];
    }
  };
  // The router reads FsbCapabilityFetch off the global; bind THIS mock's store.
  globalThis.FsbCapabilityFetch = freshRequireFetch();
  installCatalog({ 'github.notifications': { tier: 'T1b', recipe: GITHUB_RECIPE } });
  const t1b = await ROUTER.invoke('github.notifications', {}, { origin: 'https://github.com', tabId: 11 });
  check(t1b && t1b.success === true && t1b.status === 200,
    'CAT-03: a tier:T1b recipe routes through the lifted interpretRecipe -> executeBoundSpec and succeeds');
  check(t1b && t1b.tier === 'T1b',
    "CAT-03: the T1b result is stamped tier:'T1b' (got " + JSON.stringify(t1b && t1b.tier) + ')');
  check(t1bRecorder.length === 1 && t1bRecorder[0].world === 'MAIN',
    'CAT-03: the T1b path fired exactly one world:MAIN executeScript via executeBoundSpec');
  clearCatalog();
  delete globalThis.FsbCapabilityFetch;
  t1bHandle.restore();

  // -----------------------------------------------------------------------
  // LOW-01: a FALSY interpret result must fail closed as a typed RECIPE_NOT_FOUND,
  // never propagate as-is. The router's `if (!interpreted)` arm used to `return
  // interpreted` -- an undefined response that dispatchMcpMessageRoute would read as
  // a SPURIOUS empty success. Swap the interpreter for a stub that returns undefined
  // and assert the router emits a dual-field RECIPE_* error (not undefined). The
  // executeBoundSpec primitive must NEVER run (no side effect on a non-interpretable
  // recipe). Restore the real interpreter afterward.
  // -----------------------------------------------------------------------
  const realInterp = globalThis.FsbCapabilityInterpreter;
  let falsyInterpFetchCalled = false;
  globalThis.FsbCapabilityInterpreter = {
    interpretRecipe: function () { return undefined; }   // the falsy non-object case
  };
  globalThis.FsbCapabilityFetch = {
    async executeBoundSpec() { falsyInterpFetchCalled = true; return { success: true }; }
  };
  installCatalog({ 'github.notifications': { tier: 'T1b', recipe: GITHUB_RECIPE } });
  const falsyInterp = await ROUTER.invoke('github.notifications', {}, { origin: 'https://github.com', tabId: 11 });
  check(falsyInterp && typeof falsyInterp === 'object' && falsyInterp.success === false,
    'LOW-01: a falsy interpret result yields an explicit { success:false } object (not undefined/spurious success)');
  check(falsyInterp && /^RECIPE_.+$/.test(falsyInterp.code) && falsyInterp.code === falsyInterp.errorCode,
    'LOW-01: the falsy-interpret error is a dual-field RECIPE_* code (surfaces verbatim; got '
    + JSON.stringify(falsyInterp && falsyInterp.code) + ')');
  check(falsyInterpFetchCalled === false,
    'LOW-01: executeBoundSpec is NOT called when interpretRecipe returns falsy (no side effect)');
  clearCatalog();
  delete globalThis.FsbCapabilityFetch;
  globalThis.FsbCapabilityInterpreter = realInterp;

  // -----------------------------------------------------------------------
  // CAT-02 T1a dispatch: a tier:'T1a' slug routes to handler.handle(args, ctx) and
  // ctx.executeBoundSpec is called with a spec whose origin == the handler's
  // declared origin. We stub ctx.executeBoundSpec and record the spec it receives.
  // -----------------------------------------------------------------------
  const boundSpecCalls = [];
  const t1aHandler = {
    tier: 'T1a',
    origin: 'https://github.com',
    sideEffectClass: 'read',
    async handle(args, ctx) {
      const spec = {
        url: 'https://github.com/notifications', method: 'GET',
        headers: { Accept: 'application/json' }, body: null, query: {},
        authStrategy: 'same-origin-cookie', origin: 'https://github.com', extract: '@'
      };
      return await ctx.executeBoundSpec(spec, ctx.tabId);
    }
  };
  // Stub the fetch global so the handler's ctx.executeBoundSpec records the spec.
  globalThis.FsbCapabilityFetch = {
    async executeBoundSpec(spec, tabId) {
      boundSpecCalls.push({ spec, tabId });
      return { success: true, status: 200, finalUrl: spec.url, redirected: false, data: { ok: true }, text: null };
    }
  };
  installCatalog({ 'github.notifications.t1a': { tier: 'T1a', handler: t1aHandler } });
  const t1a = await ROUTER.invoke('github.notifications.t1a', { query: 'is:unread' }, { origin: 'https://github.com', tabId: 11 });
  check(t1a && t1a.success === true && t1a.tier === 'T1a',
    "CAT-02: a tier:T1a slug routes to its handler and the result is stamped tier:'T1a'");
  check(boundSpecCalls.length === 1,
    'CAT-02: the T1a handler called ctx.executeBoundSpec exactly once');
  check(boundSpecCalls.length === 1 && boundSpecCalls[0].spec
    && boundSpecCalls[0].spec.origin === t1aHandler.origin,
    "CAT-02: the spec passed to ctx.executeBoundSpec has origin == the handler's declared origin ("
    + JSON.stringify(boundSpecCalls[0] && boundSpecCalls[0].spec && boundSpecCalls[0].spec.origin) + ')');
  clearCatalog();
  delete globalThis.FsbCapabilityFetch;

  // -----------------------------------------------------------------------
  // T1a params gate: handler-backed capabilities with descriptor/handler
  // schemas reject malformed args before handler.handle or executeBoundSpec.
  // -----------------------------------------------------------------------
  let validatingHandlerCalled = false;
  let validatingFetchCalled = false;
  const validatingHandler = {
    tier: 'T1a',
    origin: 'https://app.slack.com',
    sideEffectClass: 'write',
    params: {
      type: 'object',
      properties: {
        channel: { type: 'string', minLength: 1 },
        text: { type: 'string', minLength: 1 }
      },
      required: ['channel', 'text'],
      additionalProperties: false
    },
    async handle(args, ctx) {
      validatingHandlerCalled = true;
      return await ctx.executeBoundSpec({
        url: 'https://app.slack.com/api/chat.postMessage',
        method: 'POST',
        origin: 'https://app.slack.com'
      }, ctx.tabId);
    }
  };
  globalThis.FsbCapabilityFetch = {
    async executeBoundSpec() { validatingFetchCalled = true; return { success: true }; }
  };
  installCatalog({ 'slack.chat.postMessage': { tier: 'T1a', handler: validatingHandler, params: validatingHandler.params } });
  const badParams = await ROUTER.invoke('slack.chat.postMessage', {}, { origin: 'https://app.slack.com', tabId: 44 });
  check(badParams && badParams.success === false && badParams.code === 'RECIPE_SCHEMA_INVALID',
    'T1a params gate: missing required handler args returns RECIPE_SCHEMA_INVALID');
  check(validatingHandlerCalled === false && validatingFetchCalled === false,
    'T1a params gate: invalid handler args do NOT call handler.handle or executeBoundSpec');
  const goodParams = await ROUTER.invoke('slack.chat.postMessage',
    { channel: 'C123', text: 'hello' },
    { origin: 'https://app.slack.com', tabId: 44 });
  check(goodParams && goodParams.success === true && goodParams.tier === 'T1a',
    'T1a params gate: valid handler args dispatch normally');
  clearCatalog();
  delete globalThis.FsbCapabilityFetch;

  // -----------------------------------------------------------------------
  // CAT-02 origin-pin on the T1a path: reuse the capability-fetch.test.js chrome
  // stub so the REAL executeBoundSpec runs. The active tab is on evil.example but
  // the handler's spec.origin is github.com -> RECIPE_ORIGIN_MISMATCH with an
  // EMPTY executeScript recorder (no side effect; the router is not a pin bypass).
  // -----------------------------------------------------------------------
  const pinRecorder = [];
  const pinHandle = harness.installChromeMock({ tabs: [{ id: 22, url: 'https://evil.example/x' }] });
  freshRequireStore();
  pinHandle.chrome.scripting = {
    executeScript: function () { pinRecorder.push(Array.prototype.slice.call(arguments)); return Promise.resolve([]); }
  };
  globalThis.FsbCapabilityFetch = freshRequireFetch();
  const pinHandler = {
    tier: 'T1a',
    origin: 'https://github.com',
    sideEffectClass: 'read',
    async handle(args, ctx) {
      // Spec origin is github.com but the active tab is evil.example -> the real
      // executeBoundSpec pin returns RECIPE_ORIGIN_MISMATCH before any side effect.
      const spec = { url: '/notifications', method: 'GET', origin: 'https://github.com' };
      return await ctx.executeBoundSpec(spec, ctx.tabId);
    }
  };
  installCatalog({ 'github.notifications.pin': { tier: 'T1a', handler: pinHandler } });
  const pin = await ROUTER.invoke('github.notifications.pin', {}, { origin: 'https://evil.example', tabId: 22 });
  check(pin && pin.success === false && pin.code === 'RECIPE_ORIGIN_MISMATCH'
    && pin.errorCode === 'RECIPE_ORIGIN_MISMATCH',
    'CAT-02: T1a origin-pin -- handler spec.origin != active-tab origin -> RECIPE_ORIGIN_MISMATCH');
  check(pinRecorder.length === 0,
    'CAT-02: the T1a origin mismatch fired NO executeScript (recorder EMPTY -- no side effect)');
  clearCatalog();
  delete globalThis.FsbCapabilityFetch;
  pinHandle.restore();

  // -----------------------------------------------------------------------
  // CAT-01 origin bias: two same-slug-class candidates; resolve() with the owned
  // tab origin selects the owned-origin entry (mirrors _stableSortByOwnedService
  // owned-first). Origin biases which candidate is chosen; the tier stays explicit.
  // -----------------------------------------------------------------------
  const biasBoundSpecCalls = [];
  globalThis.FsbCapabilityFetch = {
    async executeBoundSpec(spec, tabId) {
      biasBoundSpecCalls.push({ spec, tabId });
      return { success: true, status: 200, finalUrl: spec.url, redirected: false, data: { ok: true }, text: null };
    }
  };
  const ownedHandler = {
    tier: 'T1a', origin: 'https://github.com', sideEffectClass: 'read',
    async handle(args, ctx) {
      return await ctx.executeBoundSpec({ url: 'https://github.com/notifications', method: 'GET', origin: 'https://github.com' }, ctx.tabId);
    }
  };
  const genericHandler = {
    tier: 'T1a', origin: 'https://gitlab.com', sideEffectClass: 'read',
    async handle(args, ctx) {
      return await ctx.executeBoundSpec({ url: 'https://gitlab.com/notifications', method: 'GET', origin: 'https://gitlab.com' }, ctx.tabId);
    }
  };
  // Two candidates for the same slug; the bias fn returns the owned-origin one
  // first when the resolve origin matches its declared origin.
  installCatalog(
    { 'vcs.notifications': [{ tier: 'T1a', handler: genericHandler, origin: 'https://gitlab.com' },
                            { tier: 'T1a', handler: ownedHandler, origin: 'https://github.com' }] },
    function ownedFirst(candidates, origin) {
      const owned = candidates.filter(function (c) { return c.origin === origin; });
      const rest = candidates.filter(function (c) { return c.origin !== origin; });
      return owned.concat(rest)[0];
    }
  );
  const biased = await ROUTER.invoke('vcs.notifications', {}, { origin: 'https://github.com', tabId: 11 });
  check(biased && biased.success === true,
    'CAT-01: origin-biased resolution routes to a real tier and succeeds');
  check(biasBoundSpecCalls.length === 1 && biasBoundSpecCalls[0].spec
    && biasBoundSpecCalls[0].spec.origin === 'https://github.com',
    'CAT-01: origin bias selected the owned-tab-origin (github.com) handler over the generic (gitlab.com) one');
  clearCatalog();
  delete globalThis.FsbCapabilityFetch;

  // -----------------------------------------------------------------------
  // CAT-05: the typed reasons surface VERBATIM through the built mcp errors module
  // (the /^RECIPE_.+$/ passthrough) -- the same dynamic-import assertion
  // capability-mcp-surface.test.js uses. Proves the router's fall-through codes
  // reach an MCP client un-collapsed (NOT action_rejected).
  // -----------------------------------------------------------------------
  await checkTypedReasonsPassthrough();

  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (err) {
  console.error('FATAL (capability-router):', err && err.stack ? err.stack : err);
  console.log('  passed:', passed);
  console.log('  failed:', failed + 1);
  process.exit(1);
});

// ---- CAT-05: the three typed reasons surface verbatim via mapFSBError ---------
async function checkTypedReasonsPassthrough() {
  const errorsUrl = pathToFileURL(ERRORS_BUILT).href;
  const { mapFSBError } = await import(errorsUrl);
  const codes = ['RECIPE_NOT_FOUND', 'RECIPE_LEARN_PENDING', 'RECIPE_DOM_FALLBACK_PENDING'];
  for (const code of codes) {
    const mapped = mapFSBError({ success: false, code: code, errorCode: code, error: code, slug: 'x' });
    const text = (mapped && mapped.content && mapped.content[0] && mapped.content[0].text) || '';
    check(text.indexOf(code) !== -1,
      'CAT-05: mapFSBError surfaces ' + code + ' verbatim (built errors.ts /^RECIPE_.+$/ passthrough)');
    check(text.indexOf('action_rejected') === -1,
      'CAT-05: ' + code + ' is NOT collapsed to the generic action_rejected');
  }
}
