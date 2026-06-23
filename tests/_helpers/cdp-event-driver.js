'use strict';

/**
 * Phase 31 plan 01 (v0.9.99 -- DISC-02) -- shared chrome.debugger event-driver
 * stub + the in-memory chrome.storage.local stub the capture suites consume.
 *
 * The four net-new SW modules (network-capture / network-capture-redactor /
 * recipe-synthesizer / learned-recipe-store) do NOT exist yet (Waves 2-3 create
 * them); the suites that require() them FAIL LOUD today (RED). This helper is the
 * test-only fixture they share -- it is NOT shipped to the browser and is NOT on
 * the recipe-path allowlist.
 *
 * Exports:
 *   installChromeStorageStub()  -- Map-backed in-memory chrome.storage.local,
 *                                  lifted VERBATIM from
 *                                  tests/consent-policy-store.test.js:44-72
 *                                  (both callback and promise forms). Returns the
 *                                  backing Map so a test can inspect persisted keys.
 *   makeCdpDriver()             -- models chrome.debugger.onEvent: a canned
 *                                  onEvent(source,method,params) feeder. fire()
 *                                  invokes every registered listener with the exact
 *                                  (source,method,params) CDP event signature so
 *                                  network-capture._onCdpEvent is testable in Node
 *                                  WITHOUT a live browser (DISC-02). It also models
 *                                  chrome.debugger.sendCommand as a recorder so a
 *                                  test can assert ZERO Network.getResponseBody
 *                                  calls (D-08).
 *   cannedRequestEvent({...})   -- a Network.requestWillBeSent param factory
 *                                  ({ requestId, type, request:{url,method,headers} }).
 *   cannedResponseEvent({...})  -- a Network.responseReceived param factory
 *                                  ({ requestId, type, response:{status,mimeType,headers} }).
 *
 * NO EMOJIS, ASCII-only source.
 */

// ---- In-memory chrome.storage.local stub (consent-policy-store.test.js:44-72) ----
// Lifted VERBATIM (same Map-backed get/set/remove, both callback + promise forms)
// so every Phase-31 store suite shares ONE storage idiom. Returns the backing Map.
function installChromeStorageStub() {
  const store = new Map();
  globalThis.chrome = {
    storage: {
      local: {
        get(keys, cb) {
          const out = {};
          const list = Array.isArray(keys) ? keys : (keys == null ? Array.from(store.keys()) : [keys]);
          for (const k of list) { if (store.has(k)) out[k] = store.get(k); }
          if (typeof cb === 'function') { cb(out); return; }
          return Promise.resolve(out);
        },
        set(obj, cb) {
          for (const k of Object.keys(obj)) { store.set(k, obj[k]); }
          if (typeof cb === 'function') { cb(); return; }
          return Promise.resolve();
        },
        remove(key, cb) {
          const list = Array.isArray(key) ? key : [key];
          for (const k of list) { store.delete(k); }
          if (typeof cb === 'function') { cb(); return; }
          return Promise.resolve();
        }
      }
    },
    runtime: { lastError: null }
  };
  return store;
}

// ---- The chrome.debugger event-driver stub (the NEW fixture) ----------------
//
// Models chrome.debugger.onEvent.addListener(fn) + a fire(source,method,params)
// that invokes EVERY registered listener with the documented CDP event signature
// (source carries the debuggee { tabId }, method is e.g.
// 'Network.requestWillBeSent', params is the event params). Also models
// chrome.debugger.sendCommand as a recorder so a test can prove the capture NEVER
// calls Network.getResponseBody (D-08): every sendCommand({tabId}, method, cmdParams)
// is pushed to `sendCommandCalls`.
function makeCdpDriver() {
  const driver = {
    listeners: [],
    sendCommandCalls: [],
    // chrome.debugger.onEvent.addListener
    addListener(fn) {
      if (typeof fn === 'function') { driver.listeners.push(fn); }
    },
    removeListener(fn) {
      const i = driver.listeners.indexOf(fn);
      if (i !== -1) { driver.listeners.splice(i, 1); }
    },
    // Feed a canned CDP event to every registered listener (the core of the stub).
    fire(source, method, params) {
      for (let i = 0; i < driver.listeners.length; i++) {
        driver.listeners[i](source, method, params);
      }
    },
    // chrome.debugger.sendCommand recorder (callback + promise forms). Records the
    // (method, cmdParams) so a test can assert NO Network.getResponseBody call.
    sendCommand(target, method, cmdParams, cb) {
      driver.sendCommandCalls.push({ target: target, method: method, params: cmdParams || null });
      if (typeof cb === 'function') { cb({}); return; }
      return Promise.resolve({});
    },
    // count helper: how many times `method` was sent (e.g. 'Network.getResponseBody').
    sendCommandCount(method) {
      let n = 0;
      for (let i = 0; i < driver.sendCommandCalls.length; i++) {
        if (driver.sendCommandCalls[i].method === method) { n++; }
      }
      return n;
    },
    reset() {
      driver.listeners.length = 0;
      driver.sendCommandCalls.length = 0;
    }
  };
  return driver;
}

// ---- Canned event-param factories (the exact CDP shapes, RESEARCH Pattern 1) --
//
// Network.requestWillBeSent params: { requestId, type (ResourceType), request:{ url, method, headers } }.
function cannedRequestEvent(opts) {
  opts = opts || {};
  return {
    requestId: opts.requestId || 'req-1',
    type: opts.type || 'XHR',                         // ResourceType enum (D-04)
    request: {
      url: opts.url || 'https://example.com/api/items/42',
      method: opts.method || 'GET',
      headers: opts.headers || {}
    }
  };
}

// Network.responseReceived params: { requestId, type, response:{ status, statusText, mimeType, headers } }.
// status/mimeType are read DIRECTLY off responseReceived -- the capture NEVER calls
// Network.getResponseBody (D-08), so no body is present in this shape.
function cannedResponseEvent(opts) {
  opts = opts || {};
  return {
    requestId: opts.requestId || 'req-1',
    type: opts.type || 'XHR',
    response: {
      status: typeof opts.status === 'number' ? opts.status : 200,
      statusText: opts.statusText || 'OK',
      mimeType: opts.mimeType || 'application/json',
      headers: opts.headers || {}
    }
  };
}

module.exports = {
  installChromeStorageStub: installChromeStorageStub,
  makeCdpDriver: makeCdpDriver,
  cannedRequestEvent: cannedRequestEvent,
  cannedResponseEvent: cannedResponseEvent
};
