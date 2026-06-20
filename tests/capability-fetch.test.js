'use strict';

/**
 * Phase 27 plan 02 (v0.9.99 Native Capability Catalog) -- capability-fetch CI
 * suite. Proves FETCH-01..05 through mocks/stubs/fixtures (the CI half; the LIVE
 * logged-in-shape assertion -- real GitHub HttpOnly cookies attach -> logged-in
 * body -- is Plan 03's human-gated UAT, D-15, and is NOT in this suite):
 *
 *   - FETCH-01: the hardcoded github.com recipe drives interpretRecipe ->
 *     executeBoundSpec; the stubbed chrome.scripting.executeScript recorder
 *     captures a { world:'MAIN', func:capabilityFetchInPage, args:[spec] } call.
 *     Serialization-safety static guard (Pitfall 1): the captured func.toString()
 *     contains credentials/'include' and contains NONE of jmespath / getFSB /
 *     require / importScripts.
 *   - FETCH-02: capabilityFetchInPage runs directly in Node with a stubbed
 *     document.querySelector + global fetch recorder; a csrf-header-scrape spec
 *     threads the scraped token into headers[csrfSource.header]. Both the meta
 *     (.content) and the reserved input[name=authenticity_token] (.value,
 *     CAVEAT-2) read paths are exercised.
 *   - FETCH-03: a mock tab whose origin != spec.origin makes executeBoundSpec
 *     return code RECIPE_ORIGIN_MISMATCH and the executeScript recorder stays
 *     EMPTY (no side effect). The interpreter-side cross-origin + protocol-
 *     relative rejection is already covered in Plan 01's interpreter suite.
 *   - FETCH-04: using the in-memory chrome.storage.session, a BEFORE_API_REQUEST
 *     snapshot is observable via readSnapshot DURING the executeBoundSpec call
 *     (inspected from inside the stubbed executeScript) and is gone AFTER;
 *     classifyOnWake returns RECOVERY_AMBIGUOUS for a synthetic POST in-flight
 *     snapshot and a re-issuable verdict for a GET snapshot.
 *   - FETCH-05 (mock half): the end-to-end drive returns the success shape
 *     { success:true, status:200, data, ... } from the fixture; the on-disk
 *     github-notifications.json validates against the closed schema; the built
 *     mcp errors module surfaces RECOVERY_AMBIGUOUS verbatim (NOT action_rejected).
 *
 * Zero-framework: passed/failed counters + synchronous check(cond,msg) +
 * process.exit(failed>0?1:0), the convention used by
 * tests/capability-interpreter.test.js.
 *
 * Loader: the cfworker IIFE is test-loaded via vm.runInThisContext (it assigns a
 * script-scope global, so a bare require would not populate it). The jmespath
 * bundle ends with `})(typeof exports==='undefined' ? this.jmespath={} : exports)`
 * -- under require() it populates module.exports, so we set globalThis.jmespath =
 * require(bundle) to make FsbCapabilityInterpreter.getFSBJmespath() (which reads
 * the bare jmespath global) resolve the engine for the SW-side extract (D-07),
 * exactly as importScripts('lib/jmespath.min.js') does in the service worker. The
 * schema + auth-strategies + interpreter + capability-fetch modules are then
 * required so their Fsb* globals are set. This loader is test-only and is NOT on
 * the recipe-path allowlist.
 *
 * The errors.ts passthrough check dynamic-imports the BUILT mcp errors module
 * (npm --prefix mcp run build runs earlier in the scripts.test chain), mirroring
 * tests/capability-interpreter.test.js:332-347.
 *
 * Run: node tests/capability-fetch.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');
const harness = require('./fixtures/run-task-harness');

const REPO_ROOT = path.join(__dirname, '..');
const CFWORKER_PATH = path.join(REPO_ROOT, 'extension', 'lib', 'cfworker-json-schema.min.js');
const JMESPATH_PATH = path.join(REPO_ROOT, 'extension', 'lib', 'jmespath.min.js');
const SCHEMA_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-recipe-schema.js');
const AUTH_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-auth-strategies.js');
const INTERP_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-interpreter.js');
const FETCH_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-fetch.js');
const STORE_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'mcp-task-store.js');
const RECIPE_PATH = path.join(REPO_ROOT, 'catalog', 'recipes', 'github-notifications.json');

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

// ---- 1. Test-load the vendored globals + the modules under test. -----------
vm.runInThisContext(fs.readFileSync(CFWORKER_PATH, 'utf8'));
check(typeof globalThis.CfworkerJsonSchema === 'object' && globalThis.CfworkerJsonSchema !== null,
  'cfworker IIFE test-loaded: globalThis.CfworkerJsonSchema present');

// Make the bare jmespath global resolvable by getFSBJmespath() (SW parity).
globalThis.jmespath = require(JMESPATH_PATH);
check(globalThis.jmespath && typeof globalThis.jmespath.search === 'function',
  'jmespath engine test-loaded: globalThis.jmespath.search present (for the SW-side extract)');

require(SCHEMA_PATH);
require(AUTH_PATH);
const I = require(INTERP_PATH);
check(typeof I.interpretRecipe === 'function', 'interpreter exports interpretRecipe');
check(typeof I.getFSBJmespath === 'function' && I.getFSBJmespath() && typeof I.getFSBJmespath().search === 'function',
  'FsbCapabilityInterpreter.getFSBJmespath() resolves the engine (SW-side extract wiring)');

function freshRequireStore() {
  try { delete require.cache[require.resolve(STORE_PATH)]; } catch (_e) { /* not loaded */ }
  return require(STORE_PATH);
}
function freshRequireFetch() {
  try { delete require.cache[require.resolve(FETCH_PATH)]; } catch (_e) { /* not loaded */ }
  return require(FETCH_PATH);
}

const githubRecipe = JSON.parse(fs.readFileSync(RECIPE_PATH, 'utf8'));

// ===========================================================================
// FETCH-05 (schema half): the on-disk hardcoded recipe validates.
// ===========================================================================
const recipeValidation = globalThis.FsbCapabilityRecipeSchema.validateRecipe(githubRecipe);
check(recipeValidation && recipeValidation.success === true,
  'FETCH-05: catalog/recipes/github-notifications.json validates against the closed schema (got '
  + JSON.stringify(recipeValidation && recipeValidation.code) + ')');

// The interpreter binds it to a same-origin-cookie spec.
const bound = I.interpretRecipe(githubRecipe, {});
check(bound && bound.success === true && bound.spec && bound.spec.origin === 'https://github.com'
  && bound.spec.url === '/notifications' && bound.spec.credentials === 'include',
  'FETCH-05: interpretRecipe binds the github recipe -> { origin, url:/notifications, credentials:include } (got '
  + JSON.stringify(bound && (bound.code || (bound.spec && bound.spec.url))) + ')');

// ===========================================================================
// FETCH-01 + FETCH-04 + FETCH-05 (drive half): interpretRecipe -> executeBoundSpec
// with a stubbed executeScript recorder, origin MATCH, and an in-memory store.
// ===========================================================================
(async function driveHappyPath() {
  const recorder = [];
  let snapshotDuring = null;
  const handle = harness.installChromeMock({ tabs: [{ id: 11, url: 'https://github.com/notifications' }] });
  const store = freshRequireStore(); // binds the lazy chrome ref to THIS mock's storage.session
  handle.chrome.scripting = {
    async executeScript(opts) {
      recorder.push(opts);
      // Inspect the BEFORE_API_REQUEST snapshot DURING the call (FETCH-04).
      const inFlight = await store.listInFlightSnapshots();
      snapshotDuring = inFlight.find(function (s) { return s.current_step === 'BEFORE_API_REQUEST'; }) || null;
      // Fixture InjectionResult: a logged-in-shape 200 with a small JSON body.
      return [{ result: {
        ok: true, status: 200, finalUrl: 'https://github.com/notifications',
        redirected: false, json: { items: [{ id: 1 }, { id: 2 }] }, text: null
      } }];
    }
  };

  const F = freshRequireFetch();
  const specForDrive = Object.assign({}, bound.spec, { extract: 'items[*].id' });
  const result = await F.executeBoundSpec(specForDrive, 11);

  // FETCH-01: the recorder captured a world:MAIN func injection with args:[spec].
  check(recorder.length === 1, 'FETCH-01: executeBoundSpec fired exactly one executeScript (got ' + recorder.length + ')');
  const call = recorder[0];
  check(call && call.world === 'MAIN' && call.target && call.target.tabId === 11
    && typeof call.func === 'function' && Array.isArray(call.args) && call.args.length === 1,
    'FETCH-01: captured { world:MAIN, target.tabId:11, func, args:[spec] }');
  check(call && call.args && call.args[0] && call.args[0].url === '/notifications'
    && call.args[0].origin === 'https://github.com',
    'FETCH-01: the injected spec carries url:/notifications + origin:https://github.com');

  // Serialization-safety static guard (Pitfall 1) on the CAPTURED func.
  const fnSrc = call && typeof call.func === 'function' ? call.func.toString() : '';
  check(fnSrc.indexOf('credentials') !== -1 && fnSrc.indexOf('include') !== -1,
    'FETCH-01: captured func.toString() contains credentials and include');
  const forbidden = ['jmespath', 'getFSB', 'require', 'importScripts', 'FsbMcpTaskStore', 'FsbCapabilityInterpreter'];
  let cleanFn = true;
  for (var i = 0; i < forbidden.length; i++) {
    if (fnSrc.indexOf(forbidden[i]) !== -1) {
      cleanFn = false;
      check(false, 'FETCH-01: captured func.toString() must NOT contain ' + forbidden[i]);
    }
  }
  check(cleanFn, 'FETCH-01: captured func.toString() contains NONE of jmespath/getFSB/require/importScripts/FsbMcpTaskStore/FsbCapabilityInterpreter (serialization-safe)');

  // FETCH-04: the BEFORE_API_REQUEST snapshot existed DURING the call and is gone after.
  check(snapshotDuring && snapshotDuring.current_step === 'BEFORE_API_REQUEST'
    && snapshotDuring.method === 'GET' && snapshotDuring.origin === 'https://github.com'
    && snapshotDuring.status === 'in_progress',
    'FETCH-04: a BEFORE_API_REQUEST in_progress snapshot (method+origin) is observable DURING executeBoundSpec');
  const afterFlight = await store.listInFlightSnapshots();
  check(afterFlight.length === 0,
    'FETCH-04: the snapshot is deleted AFTER the call (in-flight now ' + afterFlight.length + ')');

  // FETCH-05 (mock half): the success shape + SW-side extract applied.
  check(result && result.success === true && result.status === 200
    && result.finalUrl === 'https://github.com/notifications',
    'FETCH-05: executeBoundSpec returns { success:true, status:200, finalUrl } from the fixture');
  check(result && Array.isArray(result.data) && result.data.length === 2
    && result.data[0] === 1 && result.data[1] === 2,
    'FETCH-05/D-07: the read-only extract ran SW-side (items[*].id -> [1,2], got ' + JSON.stringify(result && result.data) + ')');

  handle.restore();
  await afterDrive();
})().catch(function (err) {
  console.error('FATAL (drive happy path):', err && err.message ? err.message : err);
  restoreFetchAndExit(2);
});

// ===========================================================================
// The remaining synchronous-ish checks run after the async drive completes.
// ===========================================================================
async function afterDrive() {
  // -------------------------------------------------------------------------
  // FETCH-03: origin mismatch -> RECIPE_ORIGIN_MISMATCH + recorder EMPTY.
  // -------------------------------------------------------------------------
  const recorderMM = [];
  const handleMM = harness.installChromeMock({ tabs: [{ id: 22, url: 'https://evil.example/x' }] });
  freshRequireStore();
  handleMM.chrome.scripting = {
    executeScript: function () { recorderMM.push(Array.prototype.slice.call(arguments)); return Promise.resolve([]); }
  };
  const Fmm = freshRequireFetch();
  const mm = await Fmm.executeBoundSpec({ url: '/notifications', method: 'GET', origin: 'https://github.com' }, 22);
  check(mm && mm.success === false && mm.code === 'RECIPE_ORIGIN_MISMATCH' && mm.errorCode === 'RECIPE_ORIGIN_MISMATCH',
    'FETCH-03: active-tab origin mismatch -> dual-field RECIPE_ORIGIN_MISMATCH (got ' + (mm && mm.code) + ')');
  check(recorderMM.length === 0,
    'FETCH-03: the mismatch fired NO executeScript (recorder EMPTY -- no side effect, got ' + recorderMM.length + ')');
  handleMM.restore();

  // -------------------------------------------------------------------------
  // FETCH-04: classifyOnWake -- POST in-flight -> RECOVERY_AMBIGUOUS; GET -> re-issue.
  // -------------------------------------------------------------------------
  const Fc = freshRequireFetch();
  check(Fc.classifyOnWake({ current_step: 'BEFORE_API_REQUEST', method: 'POST' }) === 'RECOVERY_AMBIGUOUS',
    'FETCH-04: classifyOnWake(POST in-flight) -> RECOVERY_AMBIGUOUS (never blind-retried)');
  check(Fc.classifyOnWake({ current_step: 'BEFORE_API_REQUEST', method: 'DELETE' }) === 'RECOVERY_AMBIGUOUS',
    'FETCH-04: classifyOnWake(DELETE in-flight) -> RECOVERY_AMBIGUOUS');
  const getVerdict = Fc.classifyOnWake({ current_step: 'BEFORE_API_REQUEST', method: 'GET' });
  check(getVerdict !== 'RECOVERY_AMBIGUOUS' && typeof getVerdict === 'string' && getVerdict.length > 0,
    'FETCH-04: classifyOnWake(GET in-flight) -> a re-issuable verdict, NOT RECOVERY_AMBIGUOUS (got ' + getVerdict + ')');
  check(Fc.classifyOnWake({ current_step: 'AFTER_API_REQUEST', method: 'POST' }) === 'SAFE',
    'FETCH-04: classifyOnWake(terminal marker) -> SAFE even for a mutating method');

  // -------------------------------------------------------------------------
  // FETCH-02: capabilityFetchInPage scrapes CSRF in-page into the declared header.
  // Run the func DIRECTLY in Node with a stubbed document + global fetch recorder.
  // -------------------------------------------------------------------------
  await runCsrfInPageCases(Fc);

  // -------------------------------------------------------------------------
  // FETCH-05: the built mcp errors module surfaces RECOVERY_AMBIGUOUS verbatim.
  // -------------------------------------------------------------------------
  await checkErrorsPassthrough();

  restoreFetchAndExit(failed > 0 ? 1 : 0);
}

// ---- FETCH-02: in-page CSRF scrape (meta .content + input .value, CAVEAT-2) --
async function runCsrfInPageCases(F) {
  const priorFetch = globalThis.fetch;
  const priorDocument = globalThis.document;

  // Case A: from:'meta' -> read .content.
  let recordedHeadersMeta = null;
  globalThis.document = {
    cookie: '',
    querySelector: function (sel) {
      if (sel === 'meta[name=csrf-token]') {
        return { tagName: 'META', getAttribute: function (a) { return a === 'content' ? 'META_TOKEN_123' : null; }, content: 'META_TOKEN_123' };
      }
      return null;
    }
  };
  globalThis.fetch = function (url, init) {
    recordedHeadersMeta = init && init.headers ? init.headers : null;
    return Promise.resolve({
      ok: true, status: 200, url: url, type: 'basic',
      text: function () { return Promise.resolve('{"ok":true}'); }
    });
  };
  const metaSpec = {
    url: 'https://github.com/_graphql', method: 'GET', origin: 'https://github.com',
    csrfSource: { from: 'meta', selector: 'meta[name=csrf-token]', header: 'X-CSRF-Token' }
  };
  await F.capabilityFetchInPage(metaSpec);
  check(recordedHeadersMeta && recordedHeadersMeta['X-CSRF-Token'] === 'META_TOKEN_123',
    'FETCH-02: from:meta scrape threads .content into headers[X-CSRF-Token] (got '
    + JSON.stringify(recordedHeadersMeta && recordedHeadersMeta['X-CSRF-Token']) + ')');

  // Case B (CAVEAT-2, D-16): the reserved input[name=authenticity_token] -> read .value.
  let recordedHeadersInput = null;
  globalThis.document = {
    cookie: '',
    querySelector: function (sel) {
      if (sel === 'input[name=authenticity_token]') {
        // An input whose token lives in .value; .content is intentionally absent.
        return { tagName: 'INPUT', value: 'INPUT_TOKEN_456', getAttribute: function (a) { return a === 'value' ? 'INPUT_TOKEN_456' : null; } };
      }
      return null;
    }
  };
  globalThis.fetch = function (url, init) {
    recordedHeadersInput = init && init.headers ? init.headers : null;
    return Promise.resolve({
      ok: true, status: 200, url: url, type: 'basic',
      text: function () { return Promise.resolve('{"ok":true}'); }
    });
  };
  const inputSpec = {
    url: 'https://github.com/_graphql', method: 'POST', origin: 'https://github.com',
    body: { q: 'x' },
    csrfSource: { from: 'meta', selector: 'input[name=authenticity_token]', header: 'X-CSRF-Token' }
  };
  await F.capabilityFetchInPage(inputSpec);
  check(recordedHeadersInput && recordedHeadersInput['X-CSRF-Token'] === 'INPUT_TOKEN_456',
    'FETCH-02/CAVEAT-2: an input[name=authenticity_token] match reads .value (not .content) into the header (got '
    + JSON.stringify(recordedHeadersInput && recordedHeadersInput['X-CSRF-Token']) + ')');

  // Restore the page-realm globals.
  if (priorFetch === undefined) { delete globalThis.fetch; } else { globalThis.fetch = priorFetch; }
  if (priorDocument === undefined) { delete globalThis.document; } else { globalThis.document = priorDocument; }
}

// ---- FETCH-05: built errors.ts passthrough (RECOVERY_AMBIGUOUS verbatim) -----
async function checkErrorsPassthrough() {
  const errorsModuleUrl = pathToFileURL(path.join(REPO_ROOT, 'mcp', 'build', 'errors.js')).href;
  const { mapFSBError } = await import(errorsModuleUrl);
  const out = mapFSBError({ success: false, code: 'RECOVERY_AMBIGUOUS' });
  const text = out && out.content && out.content[0] ? out.content[0].text : '';
  check(text.indexOf('RECOVERY_AMBIGUOUS') !== -1,
    'FETCH-05: mapFSBError surfaces RECOVERY_AMBIGUOUS verbatim (built errors.ts passthrough)');
  check(text.indexOf('action_rejected') === -1,
    'FETCH-05: mapFSBError does NOT collapse RECOVERY_AMBIGUOUS to action_rejected');
  // The dual-field shape: errorCode carries the code too.
  const out2 = mapFSBError({ success: false, errorCode: 'RECIPE_ORIGIN_MISMATCH' });
  const text2 = out2 && out2.content && out2.content[0] ? out2.content[0].text : '';
  check(text2.indexOf('RECIPE_ORIGIN_MISMATCH') !== -1,
    'FETCH-05: mapFSBError surfaces RECIPE_ORIGIN_MISMATCH verbatim from errorCode (existing RECIPE_* arm)');
}

function restoreFetchAndExit(code) {
  if (globalThis.jmespath !== undefined) { delete globalThis.jmespath; }
  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exit(code);
}
