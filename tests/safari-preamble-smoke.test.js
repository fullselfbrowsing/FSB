/**
 * Executes the ACTUAL generated Safari preamble from build/safari/background.js.
 *
 * Everything else tests the adapter in isolation. This is the only test that
 * proves the thing that really ships works: the build output's preamble, run as
 * the service worker would run it, installing every shim before background.js's
 * body executes.
 *
 * That ordering is load-bearing -- background.js registers
 * chrome.debugger.onEvent and chrome.debugger.onDetach listeners at TOP LEVEL.
 * If the shim were not installed first those would throw TypeError during
 * service-worker evaluation and the extension would fail to boot at all.
 *
 * Requires `npm run build:safari` to have run.
 *
 * Run: node tests/safari-preamble-smoke.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BG = path.join(__dirname, '..', 'build', 'safari', 'background.js');

let passed = 0;
let failed = 0;
function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

if (!fs.existsSync(BG)) {
  console.error('  SKIP: build/safari/background.js missing -- run `npm run build:safari` first');
  process.exit(1);
}

const bg = fs.readFileSync(BG, 'utf8');
const MARKER = '// --------------------------- END SAFARI PREAMBLE ---------------------------';
const end = bg.indexOf(MARKER);
if (end < 0) {
  console.error('  FAIL: preamble end marker not found in the generated background.js');
  process.exit(1);
}
const preamble = bg.slice(0, end + MARKER.length);

function makeScope() {
  const scope = {
    console: { log() {}, warn() {}, error() {} },
    chrome: {
      runtime: {
        id: 'x',
        getURL: (p) => 'safari-web-extension://x/' + p,
        onMessage: { addListener() {}, removeListener() {} },
        sendMessage() {}
      },
      tabs: { onActivated: { addListener() {} }, onRemoved: { addListener() {} }, get() {}, query() {} },
      windows: { onRemoved: { addListener() {} } },
      storage: { session: { set() {} }, local: { get() {}, set() {} } }
    }
  };
  scope.globalThis = scope;
  scope.self = scope;
  return scope;
}

(async function run() {
  const scope = makeScope();
  let threw = null;
  try {
    new Function(
      'globalThis', 'self', 'module', 'chrome', 'console', 'setTimeout', 'clearTimeout',
      'TextEncoder', 'TextDecoder', 'btoa', 'atob', 'crypto', 'queueMicrotask', preamble
    )(scope, scope, undefined, scope.chrome, scope.console, setTimeout, clearTimeout,
      TextEncoder, TextDecoder, btoa, atob, crypto, queueMicrotask);
  } catch (e) { threw = e; }

  console.log('\n=== 1. the generated preamble evaluates cleanly ===');
  passAssert(threw === null, 'no throw during evaluation' + (threw ? ': ' + threw.message : ''));
  if (threw) { console.log('passed:', passed, 'failed:', failed); process.exit(1); }

  console.log('\n=== 2. platform is forced, not sniffed ===');
  passAssert(scope.FsbPlatform && scope.FsbPlatform.id === 'safari', 'FsbPlatform.id === safari');
  passAssert(scope.FsbPlatform.caps.cdp === false, 'caps.cdp false');
  passAssert(scope.FsbPlatform.caps.trustedInput === false, 'caps.trustedInput false');
  passAssert(scope.FsbPlatform.caps.nativeMessaging === true, 'caps.nativeMessaging true');

  console.log('\n=== 3. top-level debugger listeners cannot throw ===');
  passAssert(!!scope.chrome.debugger, 'chrome.debugger installed');
  let evOk = true;
  try {
    scope.chrome.debugger.onEvent.addListener(() => {});
    scope.chrome.debugger.onDetach.addListener(() => {});
  } catch (_e) { evOk = false; }
  passAssert(evOk, 'onEvent/onDetach addListener callable (background.js:398 and :15597)');

  console.log('\n=== 4. shim semantics ===');
  let detachOk = false;
  try { await scope.chrome.debugger.detach({ tabId: 1 }); detachOk = true; } catch (_e) { /* */ }
  passAssert(detachOk, 'debugger.detach() RESOLVES');
  let code = null;
  try { await scope.chrome.debugger.attach({ tabId: 1 }, '1.3'); } catch (e) { code = e.code; }
  passAssert(code === 'capability_unavailable', 'debugger.attach() rejects capability_unavailable');
  passAssert(await scope.chrome.offscreen.hasDocument() === true,
    'offscreen.hasDocument() resolves true -> ensureLatticeOffscreen early-exits');
  passAssert(typeof scope.chrome.sidePanel.open === 'function', 'sidePanel polyfill present');
  passAssert(typeof scope.chrome.system.memory.getInfo === 'function', 'system.memory shim present');

  console.log('\n=== 5. the MCP native transport is available to the bridge client ===');
  passAssert(typeof scope.FsbNativeBridgeSocket === 'function',
    'FsbNativeBridgeSocket defined by the preamble');
  passAssert(scope.FsbNativeFileReader && typeof scope.FsbNativeFileReader.readFile === 'function',
    'FsbNativeFileReader defined by the preamble (upload_file depends on it)');
  passAssert(scope.chrome.runtime.__fsbLoopbackInstalled === true,
    'lattice loopback installed (the in-SW Lattice host depends on it)');

  console.log('\n---');
  console.log('passed:', passed, 'failed:', failed);
  if (failed > 0) process.exit(1);
})().catch((e) => { console.error('TEST HARNESS ERROR:', e); process.exit(1); });
