/**
 * Safari MCP transport -- a WebSocket-shaped object over native messaging.
 *
 * REQUIREMENT: the MCP bridge must keep working against the SAME server on the
 * SAME port, ws://localhost:7225. The host dials with the extension's Origin
 * (sent in the `open` frame) so the server classifies it as the extension.
 *
 * Safari Web Extensions are documented as unable to open ws://localhost from an
 * extension page: the request is refused by the extension CSP, and the
 * com.apple.security.network.client entitlement applies to Safari APP
 * Extensions, not Web Extensions. (That entitlement DOES govern native Swift
 * URLSession traffic from the app-extension process, which is exactly what this
 * transport relies on -- different subsystem.)
 *
 * So on Safari the container app holds the real socket to :7225 and this class
 * relays frames to it over chrome.runtime.connectNative. From the server's
 * point of view nothing changed: same URL, same framing, and the native
 * socket's lifetime is slaved 1:1 to this port's lifetime, so the existing
 * SW-eviction recovery on the server still sees a real disconnect.
 *
 * WHY THIS IS A DUCK TYPE, NOT A REFACTOR
 * mcp-bridge-client.js touches this._ws in six places: a readyState guard,
 * construction, four handler assignments, close(), and send(). Every one works
 * against any object exposing a numeric readyState, assignable on* handlers,
 * send(string) and close(). So the entire 1900-line lifecycle -- backoff,
 * jitter, dual-armed alarm, ping cadence, connection-id minting, staged agent
 * release, in-flight task reconciliation -- is reused verbatim.
 *
 * WHY connectNative AND NOT sendNativeMessage
 *   - Every MCP request is server-initiated; one-shot messaging has no push.
 *   - mcp:progress streams over a single logical request for up to 600s.
 *   - sendNativeMessage spawns and tears down the host per message, so :7225
 *     would be re-dialled per tool call. Each redial hits the server's
 *     "new extension connected, closing previous" path, which rejects every
 *     in-flight request with 'Extension disconnected' -- fabricating a phantom
 *     service-worker eviction on every single tool call.
 *   - port.onDisconnect is the only native-messaging primitive that maps onto
 *     WebSocket onclose, which the staged-release grace window depends on.
 */

'use strict';

(function (globalScope) {
  const NATIVE_APP_ID = 'com.fullselfbrowsing.fsb';
  const NATIVE_PROTOCOL_VERSION = 1;

  // Dial + a possible macOS Local Network prompt on first run.
  const NATIVE_OPEN_TIMEOUT_MS = 8000;
  // Safari caps a single native message near 1MB. Deliberately conservative;
  // the host re-advertises its real ceiling in the `opened` frame.
  const NATIVE_MAX_FRAME_BYTES = 512 * 1024;
  // Chunking removes the cap but not the cost: pushing 20MB through XPC would
  // exhaust the service worker before it finished. Refuse earlier, with a
  // structured error the model can act on.
  const NATIVE_SOFT_PAYLOAD_LIMIT = 4 * 1024 * 1024;
  const NATIVE_MAX_REASSEMBLY_BYTES = 32 * 1024 * 1024;
  const NATIVE_REASSEMBLY_TIMEOUT_MS = 30000;
  // Long-poll hold time. Inside any plausible NSExtension request watchdog.
  const NATIVE_POLL_TIMEOUT_MS = 5000;

  const OPEN = 1;
  const CONNECTING = 0;
  const CLOSING = 2;
  const CLOSED = 3;

  function byteLength(str) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(str).length;
    return unescape(encodeURIComponent(str)).length;
  }

  // UTF-8 -> base64 BEFORE slicing. Base64 is pure ASCII, so a chunk boundary
  // can never split a multi-byte sequence or a surrogate pair -- that entire
  // class of corruption is designed out rather than guarded against.
  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(bin);
  }

  function base64ToUtf8(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // The host dials :7225 with this as its Origin header. The server only lets
  // a socket that carries an extension Origin act as the extension; one with
  // no Origin must identify itself as an MCP relay or be closed. getURL, not
  // location.origin: the latter is "null" for non-special schemes.
  function extensionOrigin(runtime) {
    try {
      const base = typeof runtime.getURL === 'function' ? runtime.getURL('') : '';
      const match = /^(safari-web-extension|chrome-extension):\/\/([^/?#@]+)\/?$/.exec(base || '');
      return match ? match[1] + '://' + match[2] : null;
    } catch (_e) {
      return null;
    }
  }

  function randomId() {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch (_e) { /* fall through */ }
    return 'nid-' + Math.floor(Date.now()).toString(16) + '-' + (globalScope.__fsbNidSeq = (globalScope.__fsbNidSeq || 0) + 1);
  }

  class FsbNativeBridgeSocket {
    constructor(opts) {
      opts = opts || {};
      this.url = opts.url;
      this._appId = opts.appId || NATIVE_APP_ID;
      this._openTimeoutMs = opts.openTimeoutMs || NATIVE_OPEN_TIMEOUT_MS;
      this._maxFrameBytes = opts.maxFrameBytes || NATIVE_MAX_FRAME_BYTES;

      this._readyState = CONNECTING;
      this._port = null;
      this._openTimer = null;
      this._seqOut = 0;
      this._seqInExpected = 1;
      this._reassembly = new Map();
      this._pollOutstanding = false;
      this._clientId = randomId();

      this.onopen = null;
      this.onmessage = null;
      this.onclose = null;
      this.onerror = null;

      this._openPort();
    }

    get readyState() { return this._readyState; }

    // An own property that the browser's WebSocket does not have. The bridge
    // client checks `this._ws.softPayloadLimit` before sending a result, which
    // is undefined on Chrome -- so the size guard needs no platform branch.
    get softPayloadLimit() { return NATIVE_SOFT_PAYLOAD_LIMIT; }

    // -----------------------------------------------------------------------
    // Open: TWO stages.
    //
    // connectNative returns a "connected" port instantly, which says nothing
    // about whether the app reached :7225. The bridge lifecycle keys onopen to
    // "the MCP server is reachable" -- it mints the connection id, cancels the
    // prior staged agent release and reconciles in-flight tasks there. So we
    // only emit onopen after the host confirms the dial with {t:'opened'}.
    // -----------------------------------------------------------------------
    _openPort() {
      const runtime = (globalScope.chrome && globalScope.chrome.runtime) ||
                      (globalScope.browser && globalScope.browser.runtime);
      if (!runtime || typeof runtime.connectNative !== 'function') {
        this._fail('native_messaging_unavailable', 1006);
        return;
      }
      try {
        this._port = runtime.connectNative(this._appId);
      } catch (err) {
        this._fail('connect_native_threw:' + (err && err.message ? err.message : 'unknown'), 1006);
        return;
      }
      if (!this._port) {
        this._fail('native_host_unavailable', 1006);
        return;
      }

      this._port.onMessage.addListener((msg) => this._onPortMessage(msg));
      this._port.onDisconnect.addListener(() => this._onPortDisconnect());

      this._openTimer = setTimeout(() => {
        this._openTimer = null;
        if (this._readyState === CONNECTING) this._fail('native_open_timeout', 1006);
      }, this._openTimeoutMs);

      const open = {
        v: NATIVE_PROTOCOL_VERSION,
        t: 'open',
        url: this.url,
        clientId: this._clientId,
        linger: true
      };
      const origin = extensionOrigin(runtime);
      if (origin) open.origin = origin;
      this._post(open);
    }

    _post(obj) {
      if (!this._port) return;
      try {
        this._port.postMessage(obj);
      } catch (err) {
        this._fail('post_failed:' + (err && err.message ? err.message : 'unknown'), 1006);
      }
    }

    _emitOpen() {
      if (this._readyState !== CONNECTING) return;
      if (this._openTimer) { clearTimeout(this._openTimer); this._openTimer = null; }
      this._readyState = OPEN;
      try { if (this.onopen) this.onopen({ type: 'open' }); } catch (_e) { /* consumer threw */ }
      this._pump();
    }

    _emitMessage(raw) {
      try { if (this.onmessage) this.onmessage({ data: raw }); } catch (_e) { /* consumer threw */ }
    }

    /**
     * The single door to CLOSED. Idempotent, and always emits onerror followed
     * by onclose -- the pair the bridge client's onclose handler depends on for
     * staged agent release and reconnect scheduling. queueMicrotask (not
     * setTimeout) keeps both in the same task so service-worker suspension
     * cannot split them.
     */
    _fail(reason, code) {
      if (this._readyState === CLOSED) return;
      this._readyState = CLOSING;
      this._teardown();
      try { if (this.onerror) this.onerror(new Error(reason)); } catch (_e) { /* consumer threw */ }
      queueMicrotask(() => {
        this._readyState = CLOSED;
        try {
          if (this.onclose) this.onclose({ code: code || 1006, reason: reason, wasClean: false });
        } catch (_e) { /* consumer threw */ }
      });
    }

    _teardown() {
      if (this._openTimer) { clearTimeout(this._openTimer); this._openTimer = null; }
      this._reassembly.clear();
      this._pollOutstanding = false;
      if (this._port) {
        const port = this._port;
        this._port = null;
        try { port.disconnect(); } catch (_e) { /* already gone */ }
      }
    }

    _onPortDisconnect() {
      this._port = null;
      this._fail('native_port_disconnected', 1006);
    }

    // -----------------------------------------------------------------------
    // Long poll.
    //
    // Whether Safari supports UNSOLICITED host->extension push over a
    // connectNative port is the least certain thing in this design, so the
    // design does not depend on it: exactly one {t:'poll'} is kept outstanding
    // and the host completes it when it has frames or the hold expires.
    //
    // It also doubles as the strongest available keepalive -- guaranteed
    // extension-API traffic every <=5s resets the idle timer far more reliably
    // than raw socket I/O does.
    // -----------------------------------------------------------------------
    _pump() {
      if (this._readyState !== OPEN || this._pollOutstanding) return;
      this._pollOutstanding = true;
      this._post({
        v: NATIVE_PROTOCOL_VERSION,
        t: 'poll',
        seq: (this._seqOut += 1),
        waitMs: NATIVE_POLL_TIMEOUT_MS
      });
    }

    _onPortMessage(msg) {
      if (!msg || typeof msg !== 'object') return;

      switch (msg.t) {
        case 'opened':
          if (typeof msg.maxFrameBytes === 'number' && msg.maxFrameBytes > 0) {
            this._maxFrameBytes = Math.min(this._maxFrameBytes, msg.maxFrameBytes);
          }
          this._emitOpen();
          return;

        case 'batch': {
          this._pollOutstanding = false;
          const frames = Array.isArray(msg.frames) ? msg.frames : [];
          for (const f of frames) this._ingestFrame(f);
          this._pump();
          return;
        }

        case 'chunk':
          this._pollOutstanding = false;
          this._ingestChunk(msg);
          this._pump();
          return;

        case 'pollempty':
          this._pollOutstanding = false;
          this._pump();
          return;

        case 'closed':
          this._fail(msg.reason || 'remote_closed', msg.code || 1006);
          return;

        case 'error':
          this._fail('host_error:' + (msg.phase || '?') + ':' + (msg.message || ''), 1006);
          return;

        default:
          return;
      }
    }

    _ingestFrame(raw) {
      if (typeof raw !== 'string') return;
      this._emitMessage(raw);
    }

    _ingestChunk(msg) {
      const cid = msg.cid;
      if (!cid || typeof msg.i !== 'number' || typeof msg.n !== 'number') return;

      let buf = this._reassembly.get(cid);
      if (!buf) {
        buf = { parts: new Array(msg.n).fill(null), received: 0, bytes: 0, timer: null };
        // Never let a truncated multipart message sit forever: a stalled
        // reassembly would hang the corresponding sendAndWait until the
        // server's 30s timeout, and that timeout string is NOT one of the
        // bridge-disconnect messages, so the sw_evicted recovery would never
        // arm. Fail loudly instead.
        buf.timer = setTimeout(() => {
          this._reassembly.delete(cid);
          this._fail('reassembly_timeout', 1006);
        }, NATIVE_REASSEMBLY_TIMEOUT_MS);
        this._reassembly.set(cid, buf);
      }

      if (buf.parts[msg.i] === null) {
        buf.parts[msg.i] = msg.data || '';
        buf.received += 1;
        buf.bytes += (msg.data || '').length;
      }

      if (buf.bytes > NATIVE_MAX_REASSEMBLY_BYTES) {
        clearTimeout(buf.timer);
        this._reassembly.delete(cid);
        this._fail('reassembly_overflow', 1009);
        return;
      }

      if (buf.received === msg.n) {
        clearTimeout(buf.timer);
        this._reassembly.delete(cid);
        const joined = buf.parts.join('');
        let decoded;
        try {
          decoded = msg.enc === 'b64' ? base64ToUtf8(joined) : joined;
        } catch (err) {
          this._fail('reassembly_decode_failed', 1007);
          return;
        }
        this._emitMessage(decoded);
      }
    }

    // -----------------------------------------------------------------------
    // send
    // -----------------------------------------------------------------------
    send(data) {
      if (this._readyState !== OPEN) return;
      const str = typeof data === 'string' ? data : String(data);

      if (byteLength(str) <= this._maxFrameBytes) {
        // The raw JSON string, byte-for-byte what would have gone over the
        // WebSocket -- never a re-parsed object. Keeps envelope fidelity.
        this._post({ v: NATIVE_PROTOCOL_VERSION, t: 'frame', seq: (this._seqOut += 1), data: str });
        return;
      }

      const b64 = utf8ToBase64(str);
      const cid = randomId();
      const n = Math.ceil(b64.length / this._maxFrameBytes);
      for (let i = 0; i < n; i += 1) {
        this._post({
          v: NATIVE_PROTOCOL_VERSION,
          t: 'chunk',
          seq: (this._seqOut += 1),
          cid: cid,
          i: i,
          n: n,
          enc: 'b64',
          data: b64.slice(i * this._maxFrameBytes, (i + 1) * this._maxFrameBytes)
        });
      }
    }

    close(code, reason) {
      if (this._readyState === CLOSED || this._readyState === CLOSING) return;
      this._readyState = CLOSING;
      this._post({
        v: NATIVE_PROTOCOL_VERSION,
        t: 'close',
        seq: (this._seqOut += 1),
        code: code || 1000,
        reason: reason || 'intentional'
      });
      this._teardown();
      queueMicrotask(() => {
        this._readyState = CLOSED;
        try {
          if (this.onclose) this.onclose({ code: code || 1000, reason: reason || 'intentional', wasClean: true });
        } catch (_e) { /* consumer threw */ }
      });
    }
  }

  FsbNativeBridgeSocket.NATIVE_APP_ID = NATIVE_APP_ID;
  FsbNativeBridgeSocket.NATIVE_SOFT_PAYLOAD_LIMIT = NATIVE_SOFT_PAYLOAD_LIMIT;
  FsbNativeBridgeSocket.NATIVE_MAX_FRAME_BYTES = NATIVE_MAX_FRAME_BYTES;
  FsbNativeBridgeSocket.NATIVE_POLL_TIMEOUT_MS = NATIVE_POLL_TIMEOUT_MS;

  globalScope.FsbNativeBridgeSocket = FsbNativeBridgeSocket;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FsbNativeBridgeSocket: FsbNativeBridgeSocket, utf8ToBase64: utf8ToBase64, base64ToUtf8: base64ToUtf8 };
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
