/**
 * Phase 69 Plan 07, SC4 layer 2 (MCP-02; CONTEXT D-18, D-19, D-20, D-23):
 * the real same-call `expect` evaluator and page probe against a live DOM in
 * headless Chrome.
 *
 * evaluateExpectation and _fsbExpectProbeInPage come straight from
 * extension/utils/action-verification.js. Their browser deps are mapped onto
 * CDP, the way tests/browser-editing-actions.test.mjs maps
 * chrome.scripting.executeScript:
 *   - tabsGet reads location.href, document.title and document.readyState;
 *   - executeProbe evaluates `(${func})(${JSON.stringify(probeSpec)})` with
 *     Runtime.evaluate and reports the main frame's loaderId as documentId;
 *   - the refresh case's commit signal is Page.frameNavigated (main frame).
 * Time is real (no fake clock). Every delayed case arms the page's change with
 * window.__armDelayed(ms) immediately before it evaluates, so the delay is
 * timed from that trigger, never from page load or Chrome start-up.
 *
 * World: probes here run in the MAIN world over CDP. The extension injects
 * them into the ISOLATED world; ISOLATED-world behaviour on the real extension
 * is Validation Block V5 (the stubbed dispatcher test, plan 69-05, covers the
 * injection options).
 *
 * Skips, printing one reason, when FSB_SKIP_BROWSER_TESTS=1 is set, when no
 * Chrome binary is found, or when Chrome fails to launch (spawn error, early
 * exit, or no DevTools endpoint within the 30 s cold-start window). Any
 * failure after a successful launch fails the suite. Because it can skip, it
 * is never the only proof: tests/mcp-expect-caller.test.mjs (layer 1) never
 * skips. CI first runs this suite at V6, which must read the log for pass
 * lines or the printed skip reason.
 *
 * Run: node --test tests/expect-outcome-browser.test.mjs
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import test, { after } from 'node:test';

const require = createRequire(import.meta.url);
const av = require('../extension/utils/action-verification.js');

// Node 20 has no global WebSocket; reuse the mcp package's ws client there.
const WebSocketClient = globalThis.WebSocket ?? require('../mcp/node_modules/ws');

const FIXTURE = 'expect-outcome.html';
const FIXTURE_URL = new URL(`./fixtures/${FIXTURE}`, import.meta.url).href;
const LAUNCH_DEADLINE_MS = 30000; // cold Chrome start-up can exceed ten seconds on shared CI runners
const CDP_CALL_TIMEOUT_MS = 10000;
const DELAY_MS = 600;
const TAB_ID = 1;

const chromeBin = [process.env.FSB_CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find((value) => value && existsSync(value));

// ---------------------------------------------------------------------------
// CDP helpers (from tests/browser-editing-actions.test.mjs, plus a call
// timeout so a wedged page fails the case instead of hanging the run).
// ---------------------------------------------------------------------------

let nextRequestId = 1;

function cdp(ws, method, params = {}) {
  const requestId = nextRequestId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener('message', listener);
      reject(new Error(`CDP ${method} timed out after ${CDP_CALL_TIMEOUT_MS} ms`));
    }, CDP_CALL_TIMEOUT_MS);
    const listener = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== requestId) return;
      clearTimeout(timer);
      ws.removeEventListener('message', listener);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    ws.addEventListener('message', listener);
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
}

async function evaluate(ws, expression) {
  const result = await cdp(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}

function onCdpEvent(ws, method, handler) {
  const listener = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === method) handler(message.params);
  };
  ws.addEventListener('message', listener);
  return () => ws.removeEventListener('message', listener);
}

async function mainFrameLoaderId(ws) {
  const { frameTree } = await cdp(ws, 'Page.getFrameTree');
  return frameTree.frame.loaderId;
}

// ---------------------------------------------------------------------------
// Launch Chrome once. Launch problems become a skip reason; anything after a
// DevTools endpoint exists is a real failure.
// ---------------------------------------------------------------------------

function removeProfile(profile) {
  return (async () => {
    // Chrome's helper processes can outlive the browser briefly and still
    // write into the profile; a leftover temp profile must not fail the run.
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
        return;
      } catch (error) {
        if (attempt === 10) console.warn(`Left Chrome test profile ${profile}: ${error.code}`);
        else await sleep(500);
      }
    }
  })();
}

async function stopChrome(child, profile, launchState) {
  if (child) {
    const exited = launchState.error || child.exitCode !== null || child.signalCode !== null
      ? Promise.resolve()
      : new Promise((resolve) => child.once('exit', resolve));
    try { child.kill('SIGTERM'); } catch (_error) { /* already gone */ }
    await Promise.race([exited, sleep(5000)]);
  }
  await removeProfile(profile);
}

// Resolves { child, profile, port, launchState } or { failure } (a string).
async function launchChrome(bin) {
  const profile = mkdtempSync(join(tmpdir(), 'fsb-expect-outcome-'));
  const launchState = { error: null, stderr: '' };
  let child = null;
  try {
    child = spawn(bin, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, FIXTURE_URL,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (error) {
    await removeProfile(profile);
    return { failure: `spawn error: ${error.message}` };
  }
  child.once('error', (error) => { launchState.error = error; });
  child.stderr.on('data', (chunk) => { launchState.stderr = (launchState.stderr + chunk).slice(-4096); });

  const deadline = Date.now() + LAUNCH_DEADLINE_MS;
  let failure = null;
  let port = null;
  while (Date.now() < deadline) {
    if (launchState.error) { failure = `spawn error: ${launchState.error.message}`; break; }
    if (child.exitCode !== null || child.signalCode !== null) {
      failure = `Chrome exited before opening its debugging port (${child.exitCode ?? child.signalCode})`;
      break;
    }
    const portFile = join(profile, 'DevToolsActivePort');
    if (existsSync(portFile)) {
      const candidate = Number(readFileSync(portFile, 'utf8').split('\n')[0]);
      if (Number.isInteger(candidate) && candidate > 0) { port = candidate; break; }
    }
    await sleep(100);
  }
  if (!port && !failure) failure = `no DevTools endpoint within ${LAUNCH_DEADLINE_MS / 1000} s`;
  if (failure) {
    await stopChrome(child, profile, launchState);
    const detail = launchState.stderr.trim().split('\n').pop() || '';
    return { failure: detail ? `${failure}; stderr: ${detail.slice(0, 200)}` : failure };
  }
  return { child, profile, port, launchState };
}

let skip = false;
let browser = null;
let ws = null;
let setupError = null;

if (process.env.FSB_SKIP_BROWSER_TESTS === '1') {
  skip = 'FSB_SKIP_BROWSER_TESTS=1 is set';
} else if (!chromeBin) {
  skip = 'no Chrome binary found (set FSB_CHROME_BIN)';
} else {
  const launched = await launchChrome(chromeBin);
  if (launched.failure) skip = `Chrome failed to launch (${chromeBin}): ${launched.failure}`;
  else browser = launched;
}

if (skip) {
  console.log(`expect-outcome-browser: skipping every case: ${skip}`);
} else {
  // Launched: from here on every problem is a real failure.
  try {
    let target = null;
    for (let i = 0; i < 100 && !target; i++) {
      const pages = await (await fetch(`http://127.0.0.1:${browser.port}/json`)).json();
      target = pages.find((page) => page.type === 'page' && page.url.includes(FIXTURE)) || null;
      if (!target) await sleep(100);
    }
    assert.ok(target, 'the fixture tab opened');
    ws = new WebSocketClient(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    await cdp(ws, 'Page.enable');
    let loaded = false;
    for (let i = 0; i < 100 && !loaded; i++) {
      loaded = await evaluate(ws, `location.href === ${JSON.stringify(FIXTURE_URL)} && document.readyState === 'complete' && typeof window.__armDelayed === 'function'`);
      if (!loaded) await sleep(100);
    }
    assert.ok(loaded, 'the fixture document and its script loaded');
  } catch (error) {
    setupError = error;
  }
}

after(async () => {
  try { ws?.close(); } catch (_error) { /* already closed */ }
  if (browser) await stopChrome(browser.child, browser.profile, browser.launchState);
});

// ---------------------------------------------------------------------------
// evaluateExpectation deps over CDP
// ---------------------------------------------------------------------------

let lastKnownTab = { url: FIXTURE_URL, title: '' };
const probeDocumentIds = [];

const deps = {
  // chrome.tabs.get never fails for a live tab; mid-navigation it reports a
  // loading tab with the last known URL, so do the same when the page's
  // context is between documents.
  tabsGet: async (tabId) => {
    try {
      const info = await evaluate(ws, '({ url: location.href, title: document.title, readyState: document.readyState })');
      lastKnownTab = { url: info.url, title: info.title };
      return { id: tabId, url: info.url, title: info.title, status: info.readyState === 'complete' ? 'complete' : 'loading' };
    } catch (_error) {
      return { id: tabId, url: lastKnownTab.url, title: lastKnownTab.title, status: 'loading' };
    }
  },
  executeProbe: async (_tabId, func, args) => {
    try {
      const before = await mainFrameLoaderId(ws);
      const result = await evaluate(ws, `(${func})(${args.map((arg) => JSON.stringify(arg)).join(', ')})`);
      const documentId = await mainFrameLoaderId(ws);
      // A probe that straddled a navigation cannot say which document it read.
      if (documentId !== before) return { ok: false, reason: 'document changed during the probe' };
      probeDocumentIds.push(documentId);
      return { ok: true, result, documentId };
    } catch (error) {
      return { ok: false, reason: String((error && error.message) || error) };
    }
  },
  now: () => Date.now(),
  sleep: (ms) => sleep(ms),
};

function ready() {
  if (setupError) throw setupError;
}

// Normalize synchronously, then evaluate: no await between a preceding
// __armDelayed trigger and the evaluation's start.
function run(rawSpec, extra = {}) {
  const normalized = av.normalizeExpectSpec(rawSpec);
  assert.equal(normalized.ok, true, `the spec is valid: ${JSON.stringify(rawSpec)}`);
  return av.evaluateExpectation({ tabId: TAB_ID, spec: normalized.spec, deps, ...extra });
}

function dump(result) {
  return JSON.stringify(result);
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

test('text_visible: a delayed change is met within the 2,000 ms default', { skip }, async () => {
  ready();
  await evaluate(ws, `window.__armDelayed(${DELAY_MS})`);
  const result = await run({ text_visible: 'Saved' });
  assert.equal(result.status, 'verified', dump(result));
  assert.deepEqual(result.checks, [{ kind: 'text_visible', expected: 'Saved', observed: 'present', status: 'met' }]);
  assert.ok(result.waited_ms >= 500 && result.waited_ms < 2000,
    `waited ${result.waited_ms} ms: met after the ${DELAY_MS} ms change, inside the default`);
  assert.equal(result.timeout_ms, av.EXPECT_DEFAULT_TIMEOUT_MS);
});

test('text_gone: the two-probe rule exits only after the removal', { skip }, async () => {
  ready();
  await evaluate(ws, `window.__armDelayed(${DELAY_MS})`);
  const result = await run({ text_gone: 'Loading' });
  assert.equal(result.status, 'verified', dump(result));
  assert.deepEqual(result.checks, [{ kind: 'text_gone', expected: 'Loading', observed: 'absent', status: 'met' }]);
  assert.ok(result.waited_ms >= 500, `waited ${result.waited_ms} ms: not judged before the spinner left`);
});

test('text_visible: text that never appears is unmet at the deadline', { skip }, async () => {
  ready();
  const result = await run({ text_visible: 'Nope', timeout_ms: 300 });
  assert.equal(result.status, 'unmet', dump(result));
  assert.deepEqual(result.checks, [{ kind: 'text_visible', expected: 'Nope', observed: 'absent', status: 'unmet' }]);
  assert.equal(result.timeout_ms, 300);
  assert.ok(result.waited_ms >= 300, `waited ${result.waited_ms} ms`);
});

test('selector state: visible and gone', { skip }, async () => {
  ready();
  const visible = await run({ selector: '#status', state: 'visible' });
  assert.equal(visible.status, 'verified', dump(visible));
  assert.deepEqual(visible.checks, [{ kind: 'state', expected: 'visible', observed: 'visible', status: 'met' }]);
  const gone = await run({ selector: '#missing', state: 'gone' });
  assert.equal(gone.status, 'verified', dump(gone));
  assert.deepEqual(gone.checks, [{ kind: 'state', expected: 'gone', observed: 'absent', status: 'met' }]);
});

test('selector state: native checkbox, aria-pressed and data-state', { skip }, async () => {
  ready();
  const unchecked = await run({ selector: '#agree', state: 'unchecked' });
  assert.equal(unchecked.status, 'verified', dump(unchecked));
  assert.deepEqual(unchecked.checks, [{ kind: 'state', expected: 'unchecked', observed: 'unchecked', status: 'met' }]);
  const pressed = await run({ selector: '#bold', state: 'checked' });
  assert.equal(pressed.status, 'verified', dump(pressed));
  assert.deepEqual(pressed.checks, [{ kind: 'state', expected: 'checked', observed: 'checked', status: 'met' }]);
  const dataState = await run({ selector: '#panel', state: 'checked' });
  assert.equal(dataState.status, 'verified', dump(dataState));
  assert.deepEqual(dataState.checks, [{ kind: 'state', expected: 'checked', observed: 'checked', status: 'met' }]);
});

test('value: a plain field echoes the match, a password field is redacted (D-19)', { skip }, async () => {
  ready();
  const email = await run({ selector: '#email', value: 'a@b.c' });
  assert.equal(email.status, 'verified', dump(email));
  assert.deepEqual(email.checks, [{ kind: 'value', expected: 'a@b.c', observed: 'a@b.c', status: 'met' }]);
  const password = await run({ selector: '#pw', value: 'hunter2' });
  assert.equal(password.status, 'verified', dump(password));
  assert.deepEqual(password.checks, [{ kind: 'value', expected: av.EXPECT_REDACTED, observed: av.EXPECT_REDACTED, status: 'met' }]);
  assert.ok(!dump(password).includes('hunter2'), 'the password never appears in expect_result');
});

test('value: an unmet plain-field value is observed as [redacted], never the page value (D-19)', { skip }, async () => {
  ready();
  const result = await run({ selector: '#email', value: 'wrong', timeout_ms: 0 });
  assert.equal(result.status, 'unmet', dump(result));
  assert.deepEqual(result.checks, [{ kind: 'value', expected: 'wrong', observed: av.EXPECT_REDACTED, status: 'unmet' }]);
  assert.ok(!dump(result).includes('a@b.c'), 'the field value read from the page never appears');
});

test('dialog_open: an open <dialog> is seen', { skip }, async () => {
  ready();
  const result = await run({ dialog_open: true });
  assert.equal(result.status, 'verified', dump(result));
  assert.deepEqual(result.checks, [{ kind: 'dialog_open', expected: true, observed: true, status: 'met' }]);
});

test('an FSB ref selector without window.FSB is uncertain (ref_unavailable)', { skip }, async () => {
  ready();
  const result = await run({ selector: 'e12' });
  assert.equal(result.status, 'uncertain', dump(result));
  assert.equal(result.reason, 'ref_unavailable');
  assert.deepEqual(result.checks, [{ kind: 'state', expected: 'visible', observed: null, status: 'uncertain' }]);
});

// Last on purpose: it replaces the document (every case above re-arms or reads
// static state, so order does not change their verdicts).
test('refresh: judged only after the commit, on the new document', { skip }, async () => {
  ready();
  const preReloadLoaderId = await mainFrameLoaderId(ws);
  let committed = false;
  let committedDocumentId = null;
  const unsubscribe = onCdpEvent(ws, 'Page.frameNavigated', ({ frame }) => {
    if (frame && !frame.parentId) {
      committed = true;
      committedDocumentId = frame.loaderId;
    }
  });
  try {
    const before = await run({ text_visible: 'Reloaded', timeout_ms: 0 });
    assert.equal(before.status, 'unmet', `the first load never shows the marker: ${dump(before)}`);
    probeDocumentIds.length = 0;
    await cdp(ws, 'Page.reload');
    const result = await run({ text_visible: 'Reloaded' }, {
      commit: {
        required: true,
        isCommitted: () => committed,
        documentId: () => committedDocumentId,
      },
    });
    assert.equal(result.status, 'verified', dump(result));
    assert.equal(committed, true, 'Page.frameNavigated fired for the main frame');
    assert.ok(probeDocumentIds.length > 0, 'the probe ran');
    const reported = probeDocumentIds[probeDocumentIds.length - 1];
    assert.notEqual(reported, preReloadLoaderId, 'the verdict came from a probe of the new document');
    assert.equal(reported, committedDocumentId, 'the probed document is the committed one');
  } finally {
    unsubscribe();
  }
});
