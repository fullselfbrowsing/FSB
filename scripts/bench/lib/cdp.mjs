/**
 * Phase 66 benchmark CDP client for the dedicated bench Chrome profile
 * (D-17, Pattern 7, Pitfall 10, B2, W-B, I-1).
 *
 * Evidence is read after the timed window, independently of FSB and of the
 * agent: the final URL and [data-bench-marker] text of the run's own tab
 * (core), or the URL and page text (live). The runner then closes the run's
 * targets so tabs do not pile up over a campaign.
 *
 * The same client delivers the bridge pairing code into the unpacked bench
 * extension's session storage and reads its telemetry opt-out flag. The
 * installed native host only answers the Web Store origin, so this harness
 * path uses the extension's own storage contract instead of touching mcp/
 * (D-01) or the global native host.
 *
 * WebSocket comes from mcp/node_modules/ws through createRequire, resolved
 * lazily; Node 20 has no global WebSocket. Every Runtime.evaluate passes
 * returnByValue and awaitPromise, because the pairing write, the flag read
 * and the host-block check all evaluate to a Promise.
 *
 * The pairing code is a function argument only: it is never logged, never
 * written to disk and never part of an error. A rejected evaluation reports
 * the fixed message cdp_evaluate_exception, never the exception text or the
 * expression (which carries the code).
 */

import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..', '..');

const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const PAIRING_CODE_PATTERN = /^fsb-auth\.[A-Za-z0-9_-]{43}$/;
const STORAGE_KEY_PATTERN = /^[A-Za-z0-9_]{1,64}$/;
const RUN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const TARGET_ID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;
const MARKER_NAME_PATTERN = /^[a-z0-9-]{1,40}$/;
const LOOPBACK_WS_PATTERN = /^ws:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?\//;
const CONTROL_PANEL_PATH = 'ui/control_panel.html';
const MAX_HTTP_BYTES = 8 * 1024 * 1024;
const MAX_WS_PAYLOAD = 64 * 1024 * 1024;
const MAX_MARKER_CHARS = 10000;
export const LIVE_TEXT_MAX_CHARS = 200000;
const DEFAULT_HTTP_TIMEOUT_MS = 5000;
const DEFAULT_EVALUATE_TIMEOUT_MS = 15000;
const PAIRING_EVALUATE_TIMEOUT_MS = 30000;
const SAFE_EVALUATE_REASONS = new Set([
  'cdp_evaluate_exception', 'cdp_protocol_error', 'cdp_timeout', 'cdp_connect_failed',
  'cdp_socket_closed', 'cdp_target_invalid',
]);

const CORE_EVIDENCE_EXPRESSION = `(() => {
  const markers = {};
  for (const element of document.querySelectorAll('[data-bench-marker]')) {
    const name = element.getAttribute('data-bench-marker');
    if (typeof name === 'string' && name && !Object.prototype.hasOwnProperty.call(markers, name)) {
      markers[name] = element.textContent;
    }
  }
  return { href: location.href, markers };
})()`;

const LIVE_EVIDENCE_EXPRESSION = `(() => ({
  href: location.href,
  text: document.body ? String(document.body.innerText || '').slice(0, ${LIVE_TEXT_MAX_CHARS}) : '',
}))()`;

let webSocketClass = null;
function loadWebSocket() {
  if (!webSocketClass) {
    const mcpRequire = createRequire(path.join(REPO_ROOT, 'mcp', 'package.json'));
    webSocketClass = mcpRequire('ws');
  }
  return webSocketClass;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertPort(port) {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new TypeError('CDP port must be an integer in 1..65535');
}

function httpRequest(port, method, requestPath, { timeoutMs = DEFAULT_HTTP_TIMEOUT_MS } = {}) {
  assertPort(port);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value);
    };
    const request = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: requestPath,
      agent: false,
      headers: { connection: 'close' },
      timeout: timeoutMs,
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size <= MAX_HTTP_BYTES) chunks.push(chunk);
      });
      response.on('end', () => finish(null, { status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', () => finish(new Error('cdp_http_failed')));
    });
    request.on('timeout', () => request.destroy(new Error('cdp_http_timeout')));
    request.on('error', () => finish(new Error('cdp_http_failed')));
    request.end();
  });
}

async function httpJson(port, method, requestPath, options) {
  const response = await httpRequest(port, method, requestPath, options);
  if (response.status !== 200) throw new Error('cdp_http_status');
  try {
    return JSON.parse(response.body);
  } catch {
    throw new Error('cdp_http_not_json');
  }
}

/** The port Chrome wrote to <profileDir>/DevToolsActivePort (first line). */
export async function readDevToolsPort(profileDir, timeoutMs = 10000) {
  const file = path.join(String(profileDir), 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const [line] = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
      if (/^[0-9]{1,5}$/.test(line)) {
        const port = Number(line);
        if (port > 0 && port <= 65535) return port;
      }
    } catch {
      // Chrome is still starting, or the profile has no remote debugging
    }
    if (Date.now() >= deadline) break;
    await sleep(50);
  }
  throw new Error('Timed out waiting for DevToolsActivePort in the bench Chrome profile');
}

/** { browser, protocolVersion } from /json/version; no debugger URL is copied. */
export async function browserVersion(port) {
  const body = await httpJson(port, 'GET', '/json/version');
  const pick = (value) => (typeof value === 'string' && !value.includes('://') ? value.slice(0, 120) : null);
  return {
    browser: isPlainObject(body) ? pick(body.Browser) : null,
    protocolVersion: isPlainObject(body) ? pick(body['Protocol-Version']) : null,
  };
}

/** Every debuggable target (/json/list). */
export async function listTargets(port) {
  const body = await httpJson(port, 'GET', '/json/list');
  return Array.isArray(body) ? body.filter(isPlainObject) : [];
}

/** Page targets only. */
export async function listPageTargets(port) {
  return (await listTargets(port)).filter((target) => target.type === 'page');
}

/**
 * Runtime.evaluate on one target over its own debugger socket, closed after
 * the call. Resolves the returned value; rejects with a fixed message that
 * never includes the expression or the exception text.
 */
export function evaluate(target, expression, { timeoutMs = DEFAULT_EVALUATE_TIMEOUT_MS } = {}) {
  const url = isPlainObject(target) ? target.webSocketDebuggerUrl : null;
  if (typeof url !== 'string' || !LOOPBACK_WS_PATTERN.test(url) || typeof expression !== 'string') {
    return Promise.reject(new Error('cdp_target_invalid'));
  }
  const WebSocket = loadWebSocket();
  return new Promise((resolve, reject) => {
    let settled = false;
    let socket = null;
    const timer = setTimeout(() => finish(new Error('cdp_timeout')), timeoutMs);
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (socket) {
        try { socket.terminate(); } catch { /* already closed */ }
      }
      if (error) reject(error);
      else resolve(value);
    }
    try {
      socket = new WebSocket(url, { perMessageDeflate: false, maxPayload: MAX_WS_PAYLOAD });
    } catch {
      finish(new Error('cdp_connect_failed'));
      return;
    }
    socket.on('open', () => {
      socket.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise: true },
      }), (error) => { if (error) finish(new Error('cdp_connect_failed')); });
    });
    socket.on('message', (data) => {
      let message;
      try {
        message = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!isPlainObject(message) || message.id !== 1) return;
      if (message.error) {
        finish(new Error('cdp_protocol_error'));
        return;
      }
      const result = isPlainObject(message.result) ? message.result : {};
      if (result.exceptionDetails) {
        finish(new Error('cdp_evaluate_exception'));
        return;
      }
      finish(null, isPlainObject(result.result) ? result.result.value : undefined);
    });
    socket.on('error', () => finish(new Error('cdp_connect_failed')));
    socket.on('close', () => finish(new Error('cdp_socket_closed')));
  });
}

function sanitizeMarkers(value) {
  const markers = {};
  if (!isPlainObject(value)) return markers;
  for (const [name, text] of Object.entries(value)) {
    if (MARKER_NAME_PATTERN.test(name) && typeof text === 'string') markers[name] = text.slice(0, MAX_MARKER_CHARS);
  }
  return markers;
}

/**
 * Evidence for a core run: over the page targets whose URL contains
 * /r/<token>/, the final URL and the [data-bench-marker] name-to-text map of
 * the target with the most markers (a tie goes to the later target).
 * Returns { finalUrl, markers, targetIds }.
 */
export async function collectCoreEvidence(port, token) {
  if (typeof token !== 'string' || !RUN_TOKEN_PATTERN.test(token)) throw new TypeError('invalid run token');
  const needle = `/r/${token}/`;
  const targets = (await listPageTargets(port)).filter((target) => typeof target.url === 'string' && target.url.includes(needle));
  let best = null;
  for (const target of targets) {
    let value;
    try {
      value = await evaluate(target, CORE_EVIDENCE_EXPRESSION);
    } catch {
      continue;
    }
    if (!isPlainObject(value)) continue;
    const markers = sanitizeMarkers(value.markers);
    const count = Object.keys(markers).length;
    if (!best || count >= best.count) {
      best = { count, finalUrl: typeof value.href === 'string' ? value.href : null, markers };
    }
  }
  return {
    finalUrl: best ? best.finalUrl : null,
    markers: best ? best.markers : {},
    targetIds: targets.map((target) => target.id).filter((id) => typeof id === 'string'),
  };
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Evidence for a live run: over the page targets on the start URL's host,
 * the final URL and the first 200000 characters of document.body.innerText
 * (memory only) of the target with the most text (a tie goes to the later
 * target). Returns { finalUrl, text, targetIds }.
 */
export async function collectLiveEvidence(port, task) {
  const host = isPlainObject(task) ? hostOf(task.startUrl) : null;
  if (!host) throw new TypeError('live evidence needs a task with a startUrl');
  const targets = (await listPageTargets(port)).filter((target) => hostOf(target.url) === host);
  let best = null;
  for (const target of targets) {
    let value;
    try {
      value = await evaluate(target, LIVE_EVIDENCE_EXPRESSION);
    } catch {
      continue;
    }
    if (!isPlainObject(value)) continue;
    const text = typeof value.text === 'string' ? value.text.slice(0, LIVE_TEXT_MAX_CHARS) : '';
    if (!best || text.length >= best.text.length) {
      best = { finalUrl: typeof value.href === 'string' ? value.href : null, text };
    }
  }
  return {
    finalUrl: best ? best.finalUrl : null,
    text: best ? best.text : null,
    targetIds: targets.map((target) => target.id).filter((id) => typeof id === 'string'),
  };
}

/** GET /json/close/<id> for each id, best effort. Returns { closed }. */
export async function closeTargets(port, ids) {
  let closed = 0;
  for (const id of Array.isArray(ids) ? ids : []) {
    if (typeof id !== 'string' || !TARGET_ID_PATTERN.test(id)) continue;
    try {
      const response = await httpRequest(port, 'GET', `/json/close/${id}`);
      if (response.status === 200) closed += 1;
    } catch {
      // the target may already be gone
    }
  }
  return { closed };
}

/**
 * Finds the extension's service_worker target. A sleeping worker is woken by
 * opening the extension's control panel through PUT /json/new, then the list
 * is polled until wakeTimeoutMs. Returns { target, wakeTargetId }.
 */
export async function findExtensionWorker(port, extensionId, { wakeTimeoutMs = 10000, pollMs = 250 } = {}) {
  if (!EXTENSION_ID_PATTERN.test(String(extensionId))) throw new TypeError('invalid extension id');
  const prefix = `chrome-extension://${extensionId}/`;
  const find = async () => (await listTargets(port)).find((target) => target.type === 'service_worker'
    && typeof target.url === 'string' && target.url.startsWith(prefix)) || null;
  let target = await find();
  if (target) return { target, wakeTargetId: null };
  let wakeTargetId = null;
  try {
    const opened = await httpJson(port, 'PUT', `/json/new?${prefix}${CONTROL_PANEL_PATH}`);
    if (isPlainObject(opened) && typeof opened.id === 'string') wakeTargetId = opened.id;
  } catch {
    // keep polling; the worker may still start
  }
  const deadline = Date.now() + wakeTimeoutMs;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    try {
      target = await find();
    } catch {
      target = null;
    }
    if (target) return { target, wakeTargetId };
  }
  return { target: null, wakeTargetId };
}

async function closeWakeTab(port, wakeTargetId) {
  if (wakeTargetId) await closeTargets(port, [wakeTargetId]);
}

/**
 * Reads one chrome.storage.local key from the bench extension's service
 * worker (W-B): true only when the stored value is strictly true, false when
 * it is false or absent, null when the worker cannot be reached or the
 * evaluation fails (the preflight reports that as unverifiable).
 */
export async function readExtensionStorageFlag(port, extensionId, key, options = {}) {
  if (!EXTENSION_ID_PATTERN.test(String(extensionId)) || typeof key !== 'string' || !STORAGE_KEY_PATTERN.test(key)) {
    return null;
  }
  let worker = null;
  try {
    worker = await findExtensionWorker(port, extensionId, options);
    if (!worker.target) return null;
    const name = JSON.stringify(key);
    const result = await evaluate(worker.target, `chrome.storage.local.get([${name}]).then((data) => data[${name}] === true)`, {
      timeoutMs: options.evaluateTimeoutMs || DEFAULT_EVALUATE_TIMEOUT_MS,
    });
    return result === true;
  } catch {
    return null;
  } finally {
    if (worker) await closeWakeTab(port, worker.wakeTargetId);
  }
}

// The pairing record has exactly the two keys the bridge client validates
// (_isValidPairingRecord); mcpBridgeClient is the service worker's
// top-level const, so it is evaluated by name.
function pairingExpression(code) {
  return `(async () => {
  await chrome.storage.session.set({ fsbMcpBridgePairing: { pairingCode: ${JSON.stringify(code)}, storedAt: Date.now() } });
  const outcome = await mcpBridgeClient.reloadPairingAndReconnect();
  return { stored: true, pairingStatus: outcome && typeof outcome.pairingStatus === 'string' ? outcome.pairingStatus : null };
})()`;
}

/**
 * Delivers the bridge pairing code to the bench extension over CDP and asks
 * its bridge client to reconnect. Returns { ok, reason } (plus the fixed
 * pairingStatus word on success). Nothing here logs or persists the code.
 */
export async function pairExtensionViaCdp(port, extensionId, pairingCode, options = {}) {
  if (!EXTENSION_ID_PATTERN.test(String(extensionId))) return { ok: false, reason: 'extension_id_invalid' };
  if (typeof pairingCode !== 'string' || !PAIRING_CODE_PATTERN.test(pairingCode)) {
    return { ok: false, reason: 'pairing_code_invalid' };
  }
  let worker = null;
  try {
    try {
      worker = await findExtensionWorker(port, extensionId, options);
    } catch {
      return { ok: false, reason: 'cdp_unreachable' };
    }
    if (!worker.target) return { ok: false, reason: 'service_worker_unreachable' };
    let value;
    try {
      value = await evaluate(worker.target, pairingExpression(pairingCode), {
        timeoutMs: options.evaluateTimeoutMs || PAIRING_EVALUATE_TIMEOUT_MS,
      });
    } catch (error) {
      const reason = error && SAFE_EVALUATE_REASONS.has(error.message) ? error.message : 'cdp_evaluate_failed';
      return { ok: false, reason };
    }
    if (!isPlainObject(value) || value.stored !== true) return { ok: false, reason: 'pairing_not_stored' };
    const status = typeof value.pairingStatus === 'string' && /^[a-z]{1,20}$/.test(value.pairingStatus) ? value.pairingStatus : null;
    return { ok: true, reason: null, pairingStatus: status };
  } finally {
    if (worker) await closeWakeTab(port, worker.wakeTargetId);
  }
}
