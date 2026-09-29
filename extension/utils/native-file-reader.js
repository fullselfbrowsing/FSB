/**
 * Safari upload_file support -- read a local file through the container app.
 *
 * Chrome populates an <input type="file"> with CDP DOM.setFileInputFiles, which
 * hands the browser process an absolute path and lets IT do the disk read. That
 * command does not exist in Safari, and page JavaScript is forbidden from
 * reading the filesystem, so the bytes have to come from native code.
 *
 * TWO INDEPENDENT CONSTRAINTS APPLY, and this module is only the second one:
 *
 *   1. extension/background.js executeUploadFile() runs the sensitive-path
 *      denylist + audit chokepoint FIRST, in the service worker, before any
 *      native message is sent. That is unchanged from Chrome.
 *   2. The container app will only serve files inside a folder the user
 *      explicitly granted (security-scoped bookmark, see GrantedRoots.swift).
 *      App Sandbox forbids reading arbitrary absolute paths -- this is true for
 *      the direct-download build too, not just the App Store one, because the
 *      extension target is sandboxed either way.
 *
 * A path must satisfy BOTH to be read.
 *
 * Safari caps a single native message near 1 MB, so a read is a handshake plus
 * N chunk fetches. sendNativeMessage (one-shot) is the right primitive here:
 * each step is a discrete request/response with no server-initiated push, which
 * is the opposite of the MCP bridge's needs (see ws/mcp-native-transport.js for
 * why THAT one uses connectNative instead).
 */

'use strict';

(function (globalScope) {
  const NATIVE_APP_ID = 'com.fullselfbrowsing.fsb';
  // Mirrors FileReadService.maxFileBytes. Enforced on both sides: the app so a
  // huge file is never read into memory, here so a misreporting host cannot
  // make the service worker reassemble something unbounded.
  const MAX_FILE_BYTES = 32 * 1024 * 1024;
  const MAX_CHUNKS = 512;

  /** Human-readable text for each typed reason the native host can return. */
  const REASON_TEXT = {
    no_granted_folders:
      'no folders have been granted to FSB yet. Open the FSB app and use "Grant Folder Access" to choose a folder to upload from.',
    outside_granted_folders:
      'the file is outside every folder granted to FSB. Open the FSB app to grant the folder that contains it.',
    path_not_absolute: 'the path is not absolute.',
    not_a_file: 'the path is not a readable file.',
    file_too_large: 'the file exceeds the upload size limit.',
    read_failed: 'the file could not be read.',
    unknown_token: 'the read handle expired; retry the upload.',
    chunk_out_of_range: 'the native host returned an unexpected chunk index.',
    native_unavailable:
      'the FSB companion app is not reachable. Make sure the FSB app has been launched at least once.'
  };

  function describeReason(reason, detail) {
    const base = REASON_TEXT[reason] || ('the native host reported "' + reason + '".');
    return detail ? base + ' (' + detail + ')' : base;
  }

  function sendNative(message) {
    const runtime = (globalScope.chrome && globalScope.chrome.runtime)
      || (globalScope.browser && globalScope.browser.runtime)
      || null;
    if (!runtime || typeof runtime.sendNativeMessage !== 'function') {
      return Promise.reject(Object.assign(new Error('native messaging unavailable'), { reason: 'native_unavailable' }));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        const lastErr = runtime.lastError;
        if (lastErr) {
          reject(Object.assign(new Error(lastErr.message || String(lastErr)), { reason: 'native_unavailable' }));
          return;
        }
        resolve(value);
      };
      let out;
      try {
        out = runtime.sendNativeMessage(NATIVE_APP_ID, message, done);
      } catch (err) {
        settled = true;
        reject(Object.assign(err, { reason: 'native_unavailable' }));
        return;
      }
      if (out && typeof out.then === 'function') {
        out.then((v) => { if (!settled) { settled = true; resolve(v); } },
                 (e) => { if (!settled) { settled = true; reject(Object.assign(e, { reason: 'native_unavailable' })); } });
      }
    });
  }

  /**
   * Read a file for upload.
   *
   * @param {string} path absolute path, already cleared by the denylist gate
   * @returns {Promise<{ok:boolean, name?:string, mime?:string, size?:number,
   *                    dataB64?:string, reason?:string, message?:string}>}
   *          Never throws: every failure is a typed {ok:false, reason, message}
   *          so executeUploadFile can audit it like any other refusal.
   */
  async function readFile(path) {
    let opened;
    try {
      opened = await sendNative({ v: 1, t: 'readFile', path: path });
    } catch (err) {
      const reason = err && err.reason ? err.reason : 'native_unavailable';
      return { ok: false, reason: reason, message: describeReason(reason) };
    }

    if (!opened || opened.ok !== true || !opened.token) {
      const reason = (opened && opened.reason) || 'read_failed';
      return { ok: false, reason: reason, message: describeReason(reason, opened && opened.detail) };
    }

    const size = Number(opened.size) || 0;
    const chunks = Number(opened.chunks) || 0;
    if (size > MAX_FILE_BYTES || chunks > MAX_CHUNKS || chunks < 1) {
      // Do not trust the host's own bounds; release the handle and refuse.
      try { await sendNative({ v: 1, t: 'readRelease', token: opened.token }); } catch (_e) { /* best effort */ }
      return {
        ok: false,
        reason: 'file_too_large',
        message: describeReason('file_too_large', size + ' bytes / ' + chunks + ' chunks')
      };
    }

    const parts = [];
    for (let i = 0; i < chunks; i += 1) {
      let chunk;
      try {
        chunk = await sendNative({ v: 1, t: 'readChunk', token: opened.token, i: i });
      } catch (err) {
        const reason = err && err.reason ? err.reason : 'read_failed';
        return { ok: false, reason: reason, message: describeReason(reason) };
      }
      if (!chunk || chunk.ok !== true || typeof chunk.data !== 'string') {
        const reason = (chunk && chunk.reason) || 'read_failed';
        return { ok: false, reason: reason, message: describeReason(reason, chunk && chunk.detail) };
      }
      parts.push(chunk.data);
      if (chunk.last === true) break;
    }

    return {
      ok: true,
      name: String(opened.name || ''),
      mime: String(opened.mime || 'application/octet-stream'),
      size: size,
      // Base64 stays base64 all the way to the content script: it survives
      // structured-clone to the page context without any binary marshalling.
      dataB64: parts.join('')
    };
  }

  /** Granted roots, for diagnostics and for actionable error text. */
  async function grantStatus() {
    try {
      const res = await sendNative({ v: 1, t: 'grantStatus' });
      return { ok: res && res.ok === true, roots: (res && res.roots) || [] };
    } catch (_e) {
      return { ok: false, roots: [] };
    }
  }

  const api = { readFile: readFile, grantStatus: grantStatus, describeReason: describeReason,
                MAX_FILE_BYTES: MAX_FILE_BYTES, NATIVE_APP_ID: NATIVE_APP_ID };

  globalScope.FsbNativeFileReader = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
