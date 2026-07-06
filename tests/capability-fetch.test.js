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
 *     contains credentials/'include' + credentials/'omit' and contains NONE of
 *     jmespath / getFSB / require / importScripts.
 *   - FETCH-02: capabilityFetchInPage runs directly in Node with a stubbed
 *     document.querySelector + global fetch recorder; a csrf-header-scrape spec
 *     threads the scraped token into headers[csrfSource.header]. Both the meta
 *     (.content) and the reserved input[name=authenticity_token] (.value,
 *     CAVEAT-2) read paths are exercised; explicit authStrategy:'none' uses
 *     credentials:'omit' for anonymous public CORS reads.
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
  check(fnSrc.indexOf('credentials') !== -1 && fnSrc.indexOf('include') !== -1
    && fnSrc.indexOf('omit') !== -1,
    'FETCH-01: captured func.toString() contains credentials, include, and omit');
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
  // PAGE-READ: WhatsApp page-state reads share the same active-tab origin pin.
  // -------------------------------------------------------------------------
  await runPageReadWrapperCases(Fc);

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

// ---- PAGE-READ: active-tab pin + MAIN-world injection for page-state reads ---
async function runPageReadWrapperCases(F) {
  const pageReadRecorder = [];
  const handle = harness.installChromeMock({ tabs: [{ id: 44, url: 'https://web.whatsapp.com/' }] });
  handle.chrome.scripting = {
    async executeScript(opts) {
      pageReadRecorder.push(opts);
      return [{ result: { success: true, status: 200, data: { ok: true } } }];
    }
  };

  const req = {
    origin: 'https://web.whatsapp.com',
    namespace: 'whatsapp',
    action: 'list_chats',
    args: { limit: 1 }
  };
  const pageReadOut = await F.executeBoundPageRead(req, 44);
  check(pageReadOut && pageReadOut.success === true && pageReadOut.data && pageReadOut.data.ok === true,
    'PAGE-READ: executeBoundPageRead returns the page result shape for WhatsApp reads');
  check(pageReadRecorder.length === 1,
    'PAGE-READ: executeBoundPageRead fired exactly one executeScript on origin match (got '
    + pageReadRecorder.length + ')');
  const call = pageReadRecorder[0];
  check(call && call.world === 'MAIN' && call.target && call.target.tabId === 44
    && typeof call.func === 'function' && Array.isArray(call.args) && call.args.length === 1,
    'PAGE-READ: captured { world:MAIN, target.tabId:44, func, args:[request] }');
  check(call && call.args && call.args[0] && call.args[0].namespace === 'whatsapp'
    && call.args[0].action === 'list_chats' && call.args[0].origin === 'https://web.whatsapp.com',
    'PAGE-READ: injected request carries namespace/action/origin for WhatsApp');
  const pageFn = call && typeof call.func === 'function' ? call.func : null;
  const pageFnSrc = pageFn ? pageFn.toString() : '';
  check(pageFnSrc.indexOf('WAWebChatCollection') !== -1
    && pageFnSrc.indexOf('cockroachdb') !== -1
    && pageFnSrc.indexOf('clickhouse') !== -1
    && pageFnSrc.indexOf('TEMPORAL_AUTH0_CLIENT_ID') !== -1
    && pageFnSrc.indexOf('telegramRead') !== -1
    && pageFnSrc.indexOf('console.ManagementConsole') !== -1
    && pageFnSrc.indexOf('ganalytics') !== -1
    && pageFnSrc.indexOf('gapi.client') !== -1
    && pageFnSrc.indexOf('__opentabs_powerpoint_graph_token') !== -1
    && pageFnSrc.indexOf('__opentabs_word_graph_token') !== -1
    && pageFnSrc.indexOf('findOutlookGraphTokens') !== -1
    && pageFnSrc.indexOf('spotifyToken') !== -1
    && pageFnSrc.indexOf('api.spotify.com/v1') !== -1
    && pageFnSrc.indexOf('twitchAuth') !== -1
    && pageFnSrc.indexOf('gql.twitch.tv') !== -1,
    'PAGE-READ: captured func includes fixed WhatsApp, CockroachDB, ClickHouse, Temporal, Telegram, Google Analytics, PowerPoint, Microsoft Word, Outlook, Spotify, and Twitch page-state read branches');

  const priorSpotifyLocation = globalThis.location;
  const priorSpotifyFetch = globalThis.fetch;
  const spotifyFetchCalls = [];
  try {
    globalThis.location = { origin: 'https://open.spotify.com' };
    globalThis.fetch = async function (url, init) {
      spotifyFetchCalls.push({ url: url, init: init || {} });
      if (url === '/api/token') {
        return {
          ok: true,
          status: 200,
          async json() {
            return { accessToken: 'spotify-token-TEST-SYNTHETIC-12345' };
          }
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return { devices: [{ id: 'device-test', name: 'Browser' }] };
        }
      };
    };
    const spotifyOut = await pageFn({
      origin: 'https://open.spotify.com',
      namespace: 'spotify',
      action: 'get_available_devices',
      args: {}
    });
    check(spotifyOut && spotifyOut.success === true
      && spotifyOut.data && Array.isArray(spotifyOut.data.devices)
      && spotifyOut.data.devices[0].id === 'device-test',
      'PAGE-READ: Spotify get_available_devices returns API data from the page-bearer read branch');
    check(spotifyFetchCalls.length === 2
      && spotifyFetchCalls[0].url === '/api/token'
      && spotifyFetchCalls[0].init.credentials === 'same-origin'
      && spotifyFetchCalls[1].url === 'https://api.spotify.com/v1/me/player/devices'
      && spotifyFetchCalls[1].init.method === 'GET'
      && spotifyFetchCalls[1].init.credentials === 'omit'
      && spotifyFetchCalls[1].init.headers.Authorization === 'Bearer spotify-token-TEST-SYNTHETIC-12345',
      'PAGE-READ: Spotify API call uses the page bearer token inside the origin-pinned page function');
  } finally {
    if (priorSpotifyLocation === undefined) { delete globalThis.location; } else { globalThis.location = priorSpotifyLocation; }
    if (priorSpotifyFetch === undefined) { delete globalThis.fetch; } else { globalThis.fetch = priorSpotifyFetch; }
  }

  const priorTwitchLocation = globalThis.location;
  const priorTwitchFetch = globalThis.fetch;
  const priorTwitchDocument = globalThis.document;
  const twitchFetchCalls = [];
  try {
    globalThis.location = { origin: 'https://www.twitch.tv' };
    globalThis.document = {
      cookie: 'auth-token=twitch-token-TEST-SYNTHETIC-12345; twilight-user=%7B%22id%22%3A%22u1%22%2C%22login%22%3A%22tester%22%7D'
    };
    globalThis.fetch = async function (url, init) {
      twitchFetchCalls.push({ url: url, init: init || {} });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            data: {
              currentUser: {
                id: 'u1',
                login: 'tester',
                displayName: 'Tester',
                description: '',
                profileImageURL: '',
                createdAt: '',
                hasPrime: true,
                roles: { isPartner: false, isAffiliate: true },
                followers: { totalCount: 7 }
              }
            }
          };
        }
      };
    };
    const twitchOut = await pageFn({
      origin: 'https://www.twitch.tv',
      namespace: 'twitch',
      action: 'get_current_user',
      args: {}
    });
    check(twitchOut && twitchOut.success === true
      && twitchOut.data && twitchOut.data.user && twitchOut.data.user.login === 'tester'
      && twitchOut.data.user.followerCount === 7,
      'PAGE-READ: Twitch get_current_user maps GraphQL data from the page-bearer read branch');
    const twitchBody = twitchFetchCalls[0] ? JSON.parse(twitchFetchCalls[0].init.body) : {};
    check(twitchFetchCalls.length === 1
      && twitchFetchCalls[0].url === 'https://gql.twitch.tv/gql'
      && twitchFetchCalls[0].init.method === 'POST'
      && twitchFetchCalls[0].init.credentials === 'omit'
      && twitchFetchCalls[0].init.headers['Client-Id'] === 'kimne78kx3ncx6brgo4mv6wki5h1ko'
      && twitchFetchCalls[0].init.headers.Authorization === 'OAuth twitch-token-TEST-SYNTHETIC-12345'
      && twitchBody.query && twitchBody.query.indexOf('currentUser') !== -1,
      'PAGE-READ: Twitch GraphQL call uses the page OAuth token inside the origin-pinned page function');
  } finally {
    if (priorTwitchLocation === undefined) { delete globalThis.location; } else { globalThis.location = priorTwitchLocation; }
    if (priorTwitchFetch === undefined) { delete globalThis.fetch; } else { globalThis.fetch = priorTwitchFetch; }
    if (priorTwitchDocument === undefined) { delete globalThis.document; } else { globalThis.document = priorTwitchDocument; }
  }

  const priorLocation = globalThis.location;
  const priorInitData = globalThis.initData;
  const priorProto = globalThis.proto;
  const priorFetch = globalThis.fetch;
  const priorRootScope = globalThis.rootScope;
  const crdbFetchCalls = [];
  try {
    globalThis.location = { origin: 'https://web.telegram.org' };
    globalThis.rootScope = {
      managers: {
        appUsersManager: {
          async getSelf() {
            return {
              id: 42,
              first_name: 'Ada',
              last_name: 'Lovelace',
              username: 'ada',
              pFlags: { premium: true },
              status: { _: 'userStatusOnline' }
            };
          }
        },
        apiManager: {
          async invokeApi() {
            throw new Error('telegram get_current_user should not call invokeApi');
          }
        }
      }
    };
    const telegramOut = await pageFn({
      origin: 'https://web.telegram.org',
      namespace: 'telegram',
      action: 'get_current_user',
      args: {}
    });
    check(telegramOut && telegramOut.success === true
      && telegramOut.data && telegramOut.data.user && telegramOut.data.user.id === 42
      && telegramOut.data.user.username === 'ada'
      && telegramOut.data.user.status === 'online',
      'PAGE-READ: Telegram get_current_user maps rootScope manager data');

    globalThis.location = { origin: 'https://cockroachlabs.cloud' };
    globalThis.initData = 'synthetic-init-data';
    globalThis.proto = {
      console: {
        ListClustersResponse: {
          deserializeBinary: function () {
            return {
              toObject: function () {
                return { clustersList: [{ id: 'cluster-test', name: 'primary' }] };
              }
            };
          }
        }
      },
      common: {}
    };
    globalThis.fetch = async function (url, init) {
      crdbFetchCalls.push({ url, init });
      return {
        ok: true,
        status: 200,
        url: url,
        type: 'basic',
        redirected: false,
        async arrayBuffer() {
          return new Uint8Array([0, 0, 0, 0, 1, 7]).buffer;
        }
      };
    };
    const crdbOut = await pageFn({
      origin: 'https://cockroachlabs.cloud',
      namespace: 'cockroachdb',
      action: 'list_clusters',
      args: {}
    });
    check(crdbOut && crdbOut.success === true
      && crdbOut.data && Array.isArray(crdbOut.data.clusters)
      && crdbOut.data.clusters[0].id === 'cluster-test',
      'PAGE-READ: CockroachDB list_clusters decodes the page protobuf response');
    check(crdbFetchCalls.length === 1
      && crdbFetchCalls[0].url === 'https://cockroachlabs.cloud/console.ManagementConsole/ListClusters'
      && crdbFetchCalls[0].init.method === 'POST'
      && crdbFetchCalls[0].init.credentials === 'include'
      && crdbFetchCalls[0].init.body instanceof ArrayBuffer,
      'PAGE-READ: CockroachDB gRPC call stays first-party, credentialed, and framed');

    // On a network/offline/CORS failure the read must resolve to the same typed
    // fallback every sibling handler returns, NOT reject (crdbGrpc is the sole
    // fetch chokepoint for all CockroachDB reads).
    globalThis.fetch = async function () { throw new TypeError('Failed to fetch'); };
    let crdbFailOut = null;
    let crdbFailThrew = false;
    try {
      crdbFailOut = await pageFn({
        origin: 'https://cockroachlabs.cloud',
        namespace: 'cockroachdb',
        action: 'list_clusters',
        args: {}
      });
    } catch (_e) { crdbFailThrew = true; }
    check(!crdbFailThrew,
      'PAGE-READ: CockroachDB read does NOT reject on fetch failure');
    check(crdbFailOut && crdbFailOut.success === false
      && crdbFailOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && crdbFailOut.reason === 'cockroachdb-network-error',
      'PAGE-READ: CockroachDB fetch failure returns the typed cockroachdb-network-error fallback (got ' + JSON.stringify(crdbFailOut && crdbFailOut.reason) + ')');
  } finally {
    if (priorLocation === undefined) { delete globalThis.location; } else { globalThis.location = priorLocation; }
    if (priorInitData === undefined) { delete globalThis.initData; } else { globalThis.initData = priorInitData; }
    if (priorProto === undefined) { delete globalThis.proto; } else { globalThis.proto = priorProto; }
    if (priorFetch === undefined) { delete globalThis.fetch; } else { globalThis.fetch = priorFetch; }
    if (priorRootScope === undefined) { delete globalThis.rootScope; } else { globalThis.rootScope = priorRootScope; }
  }

  const priorClickhouseLocation = globalThis.location;
  const priorClickhouseLocalStorage = globalThis.localStorage;
  const priorClickhouseConsoleConfig = globalThis.consoleConfig;
  const priorClickhouseFetch = globalThis.fetch;
  const clickhouseFetchCalls = [];
  try {
    const authKey = '@@auth0spajs@@::IPpH4RND0qNXHVayepffgsGpbXQmFikr::control-plane-web::openid profile email';
    const storage = {};
    storage[authKey] = JSON.stringify({
      body: { access_token: 'clickhouse-token-TEST-SYNTHETIC' },
      expiresAt: Math.floor(Date.now() / 1000) + 3600
    });
    storage.currentOrganizationId = 'org-clickhouse-test';
    storage['__uc_cache__:organizations:user-test'] = JSON.stringify([
      { id: 'org-clickhouse-test', name: 'ClickHouse Org', users: {} }
    ]);
    storage['__uc_cache__:instances:user-test'] = JSON.stringify([
      { id: 'svc-clickhouse-test', organizationId: 'org-clickhouse-test', name: 'Primary', state: 'running' }
    ]);
    globalThis.location = { origin: 'https://console.clickhouse.cloud' };
    globalThis.consoleConfig = { controlPlane: { apiHost: 'https://control-plane-internal.clickhouse.cloud' } };
    globalThis.localStorage = {
      get length() { return Object.keys(storage).length; },
      key: function (idx) { return Object.keys(storage)[idx] || null; },
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; }
    };
    globalThis.fetch = async function (url, init) {
      clickhouseFetchCalls.push({ url, init });
      return {
        ok: true,
        status: 200,
        type: 'basic',
        async json() {
          return {
            batch: [{
              type: 'CPU_USAGE',
              timePeriod: 'LAST_HOUR',
              data: [[[1782864000000, 0.42]]]
            }]
          };
        }
      };
    };
    const clickhouseOut = await pageFn({
      origin: 'https://console.clickhouse.cloud',
      namespace: 'clickhouse',
      action: 'query_metrics',
      args: {
        service_id: 'svc-clickhouse-test',
        metric_type: 'CPU_USAGE'
      }
    });
    check(clickhouseOut && clickhouseOut.success === true
      && clickhouseOut.data && Array.isArray(clickhouseOut.data.data_points)
      && clickhouseOut.data.data_points[0].value === 0.42,
      'PAGE-READ: ClickHouse query_metrics maps control-plane metric points');
    check(clickhouseFetchCalls.length === 1
      && clickhouseFetchCalls[0].url === 'https://control-plane-internal.clickhouse.cloud/api/metrics/queryMetrics'
      && clickhouseFetchCalls[0].init.method === 'POST'
      && clickhouseFetchCalls[0].init.credentials === 'include'
      && clickhouseFetchCalls[0].init.headers.Authorization === 'Bearer clickhouse-token-TEST-SYNTHETIC'
      && JSON.parse(clickhouseFetchCalls[0].init.body).organizationId === 'org-clickhouse-test',
      'PAGE-READ: ClickHouse control-plane call uses the page Auth0 bearer inside the origin-pinned page function');
  } finally {
    if (priorClickhouseLocation === undefined) { delete globalThis.location; } else { globalThis.location = priorClickhouseLocation; }
    if (priorClickhouseLocalStorage === undefined) { delete globalThis.localStorage; } else { globalThis.localStorage = priorClickhouseLocalStorage; }
    if (priorClickhouseConsoleConfig === undefined) { delete globalThis.consoleConfig; } else { globalThis.consoleConfig = priorClickhouseConsoleConfig; }
    if (priorClickhouseFetch === undefined) { delete globalThis.fetch; } else { globalThis.fetch = priorClickhouseFetch; }
  }

  const priorTemporalLocation = globalThis.location;
  const priorTemporalLocalStorage = globalThis.localStorage;
  const priorTemporalFetch = globalThis.fetch;
  const temporalFetchCalls = [];
  try {
    const temporalKey = '@@auth0spajs@@::nTmmPY5xUpQnSr7gRZh7s33hNamtCeDg::scope::https://saas-api.tmprl.cloud';
    const storage = {};
    storage[temporalKey] = JSON.stringify({
      body: { access_token: 'temporal-token-TEST-SYNTHETIC' },
      expiresAt: Math.floor(Date.now() / 1000) + 3600
    });
    globalThis.location = {
      origin: 'https://cloud.temporal.io',
      href: 'https://cloud.temporal.io/namespaces/prod-us-west-2.abc123/workflows'
    };
    globalThis.localStorage = {
      get length() { return Object.keys(storage).length; },
      key: function (idx) { return Object.keys(storage)[idx] || null; },
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; }
    };
    globalThis.fetch = async function (url, init) {
      temporalFetchCalls.push({ url, init });
      return {
        ok: true,
        status: 200,
        type: 'basic',
        async json() {
          return {
            executions: [{
              execution: { workflowId: 'wf-test', runId: 'run-test' },
              type: { name: 'DemoWorkflow' },
              status: 'WORKFLOW_EXECUTION_STATUS_RUNNING',
              taskQueue: 'default',
              startTime: '2026-07-01T00:00:00Z',
              memo: { fields: { note: { data: 'aGVsbG8=' } } }
            }],
            nextPageToken: 'next-token'
          };
        }
      };
    };
    const temporalOut = await pageFn({
      origin: 'https://cloud.temporal.io',
      namespace: 'temporal',
      action: 'list_workflows',
      args: {
        query: 'ExecutionStatus="Running"',
        page_size: 25
      }
    });
    check(temporalOut && temporalOut.success === true
      && temporalOut.data && Array.isArray(temporalOut.data.workflows)
      && temporalOut.data.workflows[0].workflow_id === 'wf-test'
      && temporalOut.data.workflows[0].memo.note === 'hello'
      && temporalOut.data.next_page_token === 'next-token',
      'PAGE-READ: Temporal list_workflows maps workflow executions and memo fields');
    check(temporalFetchCalls.length === 1
      && temporalFetchCalls[0].url.indexOf('https://prod-us-west-2.abc123.web.tmprl.cloud/api/v1/namespaces/prod-us-west-2.abc123/workflows') === 0
      && temporalFetchCalls[0].url.indexOf('maximumPageSize=25') !== -1
      && temporalFetchCalls[0].init.method === 'GET'
      && temporalFetchCalls[0].init.credentials === 'include'
      && temporalFetchCalls[0].init.headers.Authorization === 'Bearer temporal-token-TEST-SYNTHETIC',
      'PAGE-READ: Temporal API read uses the page Auth0 bearer inside the origin-pinned page function');
  } finally {
    if (priorTemporalLocation === undefined) { delete globalThis.location; } else { globalThis.location = priorTemporalLocation; }
    if (priorTemporalLocalStorage === undefined) { delete globalThis.localStorage; } else { globalThis.localStorage = priorTemporalLocalStorage; }
    if (priorTemporalFetch === undefined) { delete globalThis.fetch; } else { globalThis.fetch = priorTemporalFetch; }
  }

  const priorGaLocation = globalThis.location;
  const priorGaPreload = globalThis.preload;
  const priorGaGapi = globalThis.gapi;
  const gaGapiCalls = [];
  try {
    globalThis.location = {
      origin: 'https://analytics.google.com',
      hash: '#/p123/reports',
      href: 'https://analytics.google.com/analytics/web/#/p123/reports'
    };
    globalThis.preload = {
      obfuscatedUserId: 'ga-user-test',
      accountTree: {
        accounts: [{ id: '100', name: 'GA Account' }]
      },
      globals: {
        gmsSuiteApiKey: 'api-key-test'
      }
    };
    globalThis.gapi = {
      client: {
        request: function (opts) {
          gaGapiCalls.push(opts);
          return {
            then: function (onOk) {
              onOk({
                status: 200,
                result: {
                  dimensionHeaders: [{ name: 'country' }],
                  metricHeaders: [{ name: 'activeUsers' }],
                  rows: [{
                    dimensionValues: [{ value: 'US' }],
                    metricValues: [{ value: '42' }]
                  }],
                  rowCount: 1,
                  metadata: {
                    currencyCode: 'USD',
                    timeZone: 'America/Chicago'
                  }
                }
              });
            }
          };
        }
      }
    };
    const gaOut = await pageFn({
      origin: 'https://analytics.google.com',
      namespace: 'ganalytics',
      action: 'run_report',
      args: {
        property_id: '123',
        dimensions: ['country'],
        metrics: ['activeUsers'],
        start_date: '7daysAgo',
        end_date: 'today',
        limit: 10,
        order_by: '[{"metric":{"metricName":"activeUsers"},"desc":true}]'
      }
    });
    const gaBody = gaGapiCalls.length ? JSON.parse(gaGapiCalls[0].body) : {};
    check(gaOut && gaOut.success === true
      && gaOut.data
      && gaOut.data.rows[0].dimensions[0] === 'US'
      && gaOut.data.rows[0].metrics[0] === '42'
      && gaOut.data.currency_code === 'USD'
      && gaOut.data.time_zone === 'America/Chicago',
      'PAGE-READ: Google Analytics run_report maps GA4 report rows and metadata');
    check(gaGapiCalls.length === 1
      && gaGapiCalls[0].path === 'https://analyticsdata.googleapis.com/v1beta/properties/123:runReport'
      && gaGapiCalls[0].method === 'POST'
      && gaGapiCalls[0].params.key === 'api-key-test'
      && gaGapiCalls[0].headers['Content-Type'] === 'application/json'
      && gaBody.metrics[0].name === 'activeUsers'
      && gaBody.dimensions[0].name === 'country'
      && gaBody.limit === '10'
      && gaBody.orderBys[0].metric.metricName === 'activeUsers',
      'PAGE-READ: Google Analytics run_report uses page gapi.client with key and bounded report body');

    const gaCurrent = await pageFn({
      origin: 'https://analytics.google.com',
      namespace: 'ganalytics',
      action: 'get_current_user',
      args: {}
    });
    check(gaCurrent && gaCurrent.success === true
      && gaCurrent.data.user_id === 'ga-user-test'
      && gaCurrent.data.account_count === 1
      && gaCurrent.data.accounts[0].id === '100',
      'PAGE-READ: Google Analytics get_current_user maps preload account data without a GAPI call');

    const gaActive = await pageFn({
      origin: 'https://analytics.google.com',
      namespace: 'ganalytics',
      action: 'get_active_property',
      args: {}
    });
    check(gaActive && gaActive.success === true
      && gaActive.data.property_id === '123',
      'PAGE-READ: Google Analytics get_active_property derives the active property from the page URL hash');
  } finally {
    if (priorGaLocation === undefined) { delete globalThis.location; } else { globalThis.location = priorGaLocation; }
    if (priorGaPreload === undefined) { delete globalThis.preload; } else { globalThis.preload = priorGaPreload; }
    if (priorGaGapi === undefined) { delete globalThis.gapi; } else { globalThis.gapi = priorGaGapi; }
  }

  const priorPowerpointLocation = globalThis.location;
  const priorOpenTabs = globalThis.__openTabs;
  const priorWopi = globalThis._wopiContextJson;
  try {
    globalThis.location = {
      origin: 'https://powerpoint.cloud.microsoft',
      href: 'https://powerpoint.cloud.microsoft/present?driveId=drive-url-test'
    };
    globalThis.__openTabs = {
      preScript: {
        powerpoint: {
          graph: {
            token: 'powerpoint-token-TEST-SYNTHETIC',
            exp: Math.floor(Date.now() / 1000) + 3600
          }
        }
      }
    };
    globalThis._wopiContextJson = { DriveItemId: 'item-wopi-test' };
    const pptOut = await pageFn({
      origin: 'https://powerpoint.cloud.microsoft',
      namespace: 'powerpoint',
      action: 'auth_context',
      args: {}
    });
    check(pptOut && pptOut.success === true
      && pptOut.data && pptOut.data.graph_token === 'powerpoint-token-TEST-SYNTHETIC'
      && pptOut.data.drive_id === 'drive-url-test'
      && pptOut.data.item_id === 'item-wopi-test',
      'PAGE-READ: PowerPoint auth_context returns Graph token, drive id, and item id through the bounded page-read branch');
  } finally {
    if (priorPowerpointLocation === undefined) { delete globalThis.location; } else { globalThis.location = priorPowerpointLocation; }
    if (priorOpenTabs === undefined) { delete globalThis.__openTabs; } else { globalThis.__openTabs = priorOpenTabs; }
    if (priorWopi === undefined) { delete globalThis._wopiContextJson; } else { globalThis._wopiContextJson = priorWopi; }
  }

  const priorWordLocation = globalThis.location;
  const priorWordOpenTabs = globalThis.__openTabs;
  try {
    globalThis.location = {
      origin: 'https://word.cloud.microsoft',
      href: 'https://word.cloud.microsoft/document?driveId=drive-word-test&docId=item-word-test'
    };
    globalThis.__openTabs = {
      preScript: {
        'microsoft-word': {
          graph: {
            token: 'word-token-TEST-SYNTHETIC',
            exp: Math.floor(Date.now() / 1000) + 3600
          }
        }
      }
    };
    const wordOut = await pageFn({
      origin: 'https://word.cloud.microsoft',
      namespace: 'microsoft-word',
      action: 'auth_context',
      args: {}
    });
    check(wordOut && wordOut.success === true
      && wordOut.data && wordOut.data.graph_token === 'word-token-TEST-SYNTHETIC'
      && wordOut.data.drive_id === 'drive-word-test'
      && wordOut.data.item_id === 'item-word-test',
      'PAGE-READ: Microsoft Word auth_context returns Graph token, drive id, and item id through the bounded page-read branch');
  } finally {
    if (priorWordLocation === undefined) { delete globalThis.location; } else { globalThis.location = priorWordLocation; }
    if (priorWordOpenTabs === undefined) { delete globalThis.__openTabs; } else { globalThis.__openTabs = priorWordOpenTabs; }
  }

  const priorOutlookLocation = globalThis.location;
  const priorOutlookLocalStorage = globalThis.localStorage;
  try {
    const clientId = '9199bf20-a13f-4107-85dc-02114787ef48';
    const tokenKey = 'msal.3.access-token.' + clientId + '.graph-test';
    const storage = {};
    storage['msal.3.token.keys.' + clientId] = JSON.stringify({ accessToken: [tokenKey] });
    storage[tokenKey] = JSON.stringify({
      secret: 'outlook-token-TEST-SYNTHETIC',
      target: 'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Calendars.Read',
      expiresOn: Math.floor(Date.now() / 1000) + 3600
    });
    globalThis.location = {
      origin: 'https://outlook.cloud.microsoft',
      href: 'https://outlook.cloud.microsoft/mail/'
    };
    globalThis.localStorage = {
      get length() { return Object.keys(storage).length; },
      key: function (idx) { return Object.keys(storage)[idx] || null; },
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; }
    };
    const outlookOut = await pageFn({
      origin: 'https://outlook.cloud.microsoft',
      namespace: 'outlook',
      action: 'auth_context',
      args: {}
    });
    check(outlookOut && outlookOut.success === true
      && outlookOut.data && Array.isArray(outlookOut.data.graph_tokens)
      && outlookOut.data.graph_tokens[0] === 'outlook-token-TEST-SYNTHETIC',
      'PAGE-READ: Outlook auth_context returns scoped Graph tokens through the bounded page-read branch');
  } finally {
    if (priorOutlookLocation === undefined) { delete globalThis.location; } else { globalThis.location = priorOutlookLocation; }
    if (priorOutlookLocalStorage === undefined) { delete globalThis.localStorage; } else { globalThis.localStorage = priorOutlookLocalStorage; }
  }

  const priorOneNoteLocation = globalThis.location;
  const priorOneNoteLocalStorage = globalThis.localStorage;
  try {
    const clientId = '2821b473-fe24-4c86-ba16-62834d6e80c3';
    const tokenKey = 'msal.access-token.' + clientId + '.graph.microsoft.com.notes';
    const storage = {};
    storage['msal.token.keys.' + clientId] = JSON.stringify({ accessToken: [tokenKey] });
    storage[tokenKey] = JSON.stringify({
      secret: 'onenote-token-TEST-SYNTHETIC',
      expiresOn: Math.floor(Date.now() / 1000) + 3600
    });
    globalThis.location = {
      origin: 'https://onenote.cloud.microsoft',
      href: 'https://onenote.cloud.microsoft/'
    };
    globalThis.localStorage = {
      get length() { return Object.keys(storage).length; },
      key: function (idx) { return Object.keys(storage)[idx] || null; },
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; }
    };
    const onenoteOut = await pageFn({
      origin: 'https://onenote.cloud.microsoft',
      namespace: 'onenote',
      action: 'auth_context',
      args: {}
    });
    check(onenoteOut && onenoteOut.success === true
      && onenoteOut.data && onenoteOut.data.graph_token === 'onenote-token-TEST-SYNTHETIC',
      'PAGE-READ: OneNote auth_context returns a Graph token through the bounded page-read branch');
  } finally {
    if (priorOneNoteLocation === undefined) { delete globalThis.location; } else { globalThis.location = priorOneNoteLocation; }
    if (priorOneNoteLocalStorage === undefined) { delete globalThis.localStorage; } else { globalThis.localStorage = priorOneNoteLocalStorage; }
  }
  handle.restore();

  const mismatchRecorder = [];
  const mismatchHandle = harness.installChromeMock({ tabs: [{ id: 45, url: 'https://evil.example/' }] });
  mismatchHandle.chrome.scripting = {
    async executeScript(opts) {
      mismatchRecorder.push(opts);
      return [{ result: { success: true } }];
    }
  };
  const mismatchOut = await F.executeBoundPageRead(req, 45);
  check(mismatchOut && mismatchOut.success === false
    && mismatchOut.code === 'RECIPE_ORIGIN_MISMATCH'
    && mismatchOut.errorCode === 'RECIPE_ORIGIN_MISMATCH',
    'PAGE-READ: origin mismatch returns dual-field RECIPE_ORIGIN_MISMATCH');
  check(mismatchRecorder.length === 0,
    'PAGE-READ: origin mismatch fires NO executeScript (got ' + mismatchRecorder.length + ')');
  mismatchHandle.restore();
}

// ---- FETCH-02: in-page CSRF scrape (meta .content + input .value, CAVEAT-2) --
async function runCsrfInPageCases(F) {
  const priorFetch = globalThis.fetch;
  const priorDocument = globalThis.document;
  const priorLocalStorage = globalThis.localStorage;
  const priorDiscordWebpack = globalThis.webpackChunkdiscord_app;

  // Case A: from:'meta' -> read .content.
  let recordedHeadersMeta = null;
  let recordedCredentialsMeta = null;
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
    recordedCredentialsMeta = init && init.credentials;
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
  check(recordedCredentialsMeta === 'include',
    'FETCH-01: default same-origin-capable specs use credentials:include (got '
    + JSON.stringify(recordedCredentialsMeta) + ')');

  // Case B (CAVEAT-2, D-16): the reserved input[name=authenticity_token] -> read .value.
  let recordedHeadersInput = null;
  let recordedCredentialsInput = null;
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
    recordedCredentialsInput = init && init.credentials;
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
  check(recordedCredentialsInput === 'include',
    'FETCH-01: csrf-header-scrape specs continue to use credentials:include (got '
    + JSON.stringify(recordedCredentialsInput) + ')');

  // Case C: explicit anonymous public-CORS read -> omit credentials.
  let recordedCredentialsNone = null;
  globalThis.document = { cookie: '', querySelector: function () { return null; } };
  globalThis.fetch = function (url, init) {
    recordedCredentialsNone = init && init.credentials;
    return Promise.resolve({
      ok: true, status: 200, url: url, type: 'cors',
      text: function () { return Promise.resolve('{"ok":true}'); }
    });
  };
  const noneSpec = {
    url: 'https://api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=bsky.app',
    method: 'GET',
    origin: 'https://bsky.app',
    authStrategy: 'none'
  };
  await F.capabilityFetchInPage(noneSpec);
  check(recordedCredentialsNone === 'omit',
    'FETCH-01: authStrategy none uses credentials:omit for anonymous public CORS reads (got '
    + JSON.stringify(recordedCredentialsNone) + ')');

  // Case D: bearer-from-storage marker -> read JSON-string storage inside the page,
  // inject headers, and return only response data.
  let recordedBearerHeaders = null;
  let recordedBearerCredentials = null;
  globalThis.document = { cookie: '', querySelector: function () { return null; } };
  globalThis.localStorage = {
    getItem: function (key) {
      if (key === 'ALGRO_TOKEN') return JSON.stringify('SECRET_TOKEN_789');
      if (key === 'USER_ID') return JSON.stringify('user_123');
      return null;
    }
  };
  globalThis.fetch = function (url, init) {
    recordedBearerHeaders = init && init.headers ? init.headers : null;
    recordedBearerCredentials = init && init.credentials;
    return Promise.resolve({
      ok: true, status: 200, url: url, type: 'cors',
      text: function () { return Promise.resolve('{"data":{"ok":true},"status":{"code":200}}'); }
    });
  };
  const bearerSpec = {
    url: 'https://api.hack2hire.com/algro/v1/user/profile',
    method: 'GET',
    origin: 'https://www.hack2hire.com',
    authStrategy: 'none',
    credentials: 'omit',
    _authNeed: {
      kind: 'bearer',
      source: 'storage',
      storage: 'localStorage',
      tokenKey: 'ALGRO_TOKEN',
      parseJson: true,
      header: 'Authorization',
      prefix: 'Bearer ',
      extraHeaders: [
        { header: 'x-user-id', storageKey: 'USER_ID', parseJson: true }
      ]
    }
  };
  const bearerOut = await F.capabilityFetchInPage(bearerSpec);
  check(recordedBearerHeaders && recordedBearerHeaders.Authorization === 'Bearer SECRET_TOKEN_789'
    && recordedBearerHeaders['x-user-id'] === 'user_123',
    'FETCH-01: bearer-from-storage marker injects Authorization and x-user-id headers from JSON-string localStorage');
  check(recordedBearerCredentials === 'omit',
    'FETCH-01: storage-bearer public-CORS specs can use credentials:omit (got '
    + JSON.stringify(recordedBearerCredentials) + ')');
  check(bearerOut && bearerOut.json && bearerOut.json.data && bearerOut.json.data.ok === true
    && JSON.stringify(bearerOut).indexOf('SECRET_TOKEN_789') === -1,
    'FETCH-01: storage bearer path returns response data without echoing token material');

  // Case D2: bearer-from-storage can read a string field from a JSON object.
  let recordedNestedBearerHeaders = null;
  globalThis.localStorage = {
    getItem: function (key) {
      if (key === 'User') return JSON.stringify({ token: 'TODOIST_TOKEN_123' });
      return null;
    }
  };
  globalThis.fetch = function (url, init) {
    recordedNestedBearerHeaders = init && init.headers ? init.headers : null;
    return Promise.resolve({
      ok: true, status: 200, url: url, type: 'basic',
      text: function () { return Promise.resolve('{"results":[]}'); }
    });
  };
  const nestedBearerSpec = {
    url: 'https://app.todoist.com/api/v1/projects',
    method: 'GET',
    origin: 'https://app.todoist.com',
    authStrategy: 'same-origin-cookie',
    _authNeed: {
      kind: 'bearer',
      source: 'storage',
      storage: 'localStorage',
      tokenKey: 'User',
      tokenField: 'token',
      parseJson: true,
      header: 'Authorization',
      prefix: 'Bearer '
    }
  };
  const nestedBearerOut = await F.capabilityFetchInPage(nestedBearerSpec);
  check(recordedNestedBearerHeaders && recordedNestedBearerHeaders.Authorization === 'Bearer TODOIST_TOKEN_123',
    'FETCH-01: bearer-from-storage marker can read a token field from JSON-object localStorage');
  check(nestedBearerOut && nestedBearerOut.json && Array.isArray(nestedBearerOut.json.results)
    && JSON.stringify(nestedBearerOut).indexOf('TODOIST_TOKEN_123') === -1,
    'FETCH-01: JSON-object storage bearer path returns response data without echoing token material');

  // Case D3: storage-bearer extra headers can resolve JSON path templates and
  // optional missing headers are skipped without failing the request.
  let recordedTemplateBearerHeaders = null;
  globalThis.localStorage = {
    getItem: function (key) {
      if (key === 'ApplicationStore') {
        return JSON.stringify({
          currentUserAccountId: 'ua_123',
          currentUserId: 'user_456',
          userAccounts: {
            ua_123: {
              users: [
                { organization: { id: 'org_789' } }
              ]
            }
          }
        });
      }
      if (key === 'clientId') return 'linear-client-001';
      return null;
    }
  };
  globalThis.fetch = function (url, init) {
    recordedTemplateBearerHeaders = init && init.headers ? init.headers : null;
    return Promise.resolve({
      ok: true, status: 200, url: url, type: 'cors',
      text: function () { return Promise.resolve('{"data":{"viewer":{"id":"user_456"}}}'); }
    });
  };
  const templateBearerSpec = {
    url: 'https://client-api.linear.app/graphql',
    method: 'POST',
    origin: 'https://linear.app',
    body: { query: 'query GetViewer { viewer { id } }' },
    _authNeed: {
      kind: 'bearer',
      source: 'storage',
      storage: 'localStorage',
      tokenKey: 'ApplicationStore',
      tokenPath: 'currentUserAccountId',
      parseJson: true,
      header: 'useraccount',
      prefix: '',
      extraHeaders: [
        { header: 'user', storageKey: 'ApplicationStore', tokenPath: 'currentUserId', parseJson: true },
        {
          header: 'organization',
          storageKey: 'ApplicationStore',
          tokenPathTemplate: 'userAccounts.{currentUserAccountId}.users.0.organization.id',
          parseJson: true
        },
        { header: 'linear-client-id', storageKey: 'clientId', parseJson: false, optional: true },
        { header: 'x-missing-optional', storageKey: 'missing', parseJson: false, optional: true }
      ]
    }
  };
  const templateBearerOut = await F.capabilityFetchInPage(templateBearerSpec);
  check(recordedTemplateBearerHeaders && recordedTemplateBearerHeaders.useraccount === 'ua_123'
    && recordedTemplateBearerHeaders.user === 'user_456'
    && recordedTemplateBearerHeaders.organization === 'org_789'
    && recordedTemplateBearerHeaders['linear-client-id'] === 'linear-client-001'
    && recordedTemplateBearerHeaders['x-missing-optional'] === undefined,
    'FETCH-01: storage-bearer marker resolves JSON path templates and skips optional missing headers');
  check(templateBearerOut && templateBearerOut.json && templateBearerOut.json.data
    && templateBearerOut.json.data.viewer.id === 'user_456'
    && JSON.stringify(templateBearerOut).indexOf('linear-client-001') === -1,
    'FETCH-01: templated storage headers stay out of returned response data');

  // Case E: Discord auth-source token stays in-page and is used only as a request header.
  let recordedDiscordHeaders = null;
  globalThis.document = { cookie: '', querySelector: function () { return null; } };
  globalThis.webpackChunkdiscord_app = {
    push: function (entry) {
      var runtime = entry && entry[2];
      if (typeof runtime === 'function') {
        runtime({
          c: {
            a: { exports: { default: { getToken: function () { return { locale: 'en-US' }; } } } },
            b: { exports: { default: { getToken: function () { return 'discord-token-TEST-SYNTHETIC'; } } } }
          }
        });
      }
    }
  };
  globalThis.fetch = function (url, init) {
    recordedDiscordHeaders = init && init.headers ? init.headers : null;
    return Promise.resolve({
      ok: true, status: 200, url: url, type: 'basic',
      text: function () { return Promise.resolve('{"id":"user-test"}'); }
    });
  };
  const discordSpec = {
    url: 'https://discord.com/api/v9/users/@me',
    method: 'GET',
    origin: 'https://discord.com',
    authSource: { from: 'discord-webpack-token', header: 'Authorization' }
  };
  const discordOut = await F.capabilityFetchInPage(discordSpec);
  check(recordedDiscordHeaders && recordedDiscordHeaders.Authorization === 'discord-token-TEST-SYNTHETIC',
    'FETCH-02: discord-webpack-token authSource injects Authorization from the page module cache');
  check(discordOut && discordOut.json && discordOut.json.id === 'user-test'
    && JSON.stringify(discordOut).indexOf('discord-token-TEST-SYNTHETIC') === -1,
    'FETCH-02: Discord auth-source path returns response data without echoing token material');

  // Restore the page-realm globals.
  if (priorFetch === undefined) { delete globalThis.fetch; } else { globalThis.fetch = priorFetch; }
  if (priorDocument === undefined) { delete globalThis.document; } else { globalThis.document = priorDocument; }
  if (priorLocalStorage === undefined) { delete globalThis.localStorage; } else { globalThis.localStorage = priorLocalStorage; }
  if (priorDiscordWebpack === undefined) { delete globalThis.webpackChunkdiscord_app; } else { globalThis.webpackChunkdiscord_app = priorDiscordWebpack; }
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
