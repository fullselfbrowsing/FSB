(() => {
  // node_modules/@full-self-browsing/phantom-stream/src/protocol/constants.js
  var RELAY_PER_MESSAGE_LIMIT_BYTES = 1048576;
  var SNAPSHOT_BUDGET_FRACTION = 0.8;
  var SNAPSHOT_BUDGET_BYTES = Math.floor(
    RELAY_PER_MESSAGE_LIMIT_BYTES * SNAPSHOT_BUDGET_FRACTION
  );

  // node_modules/@full-self-browsing/phantom-stream/src/protocol/messages.js
  var CONTROL = {
    START: "dash:dom-stream-start",
    STOP: "dash:dom-stream-stop",
    PAUSE: "dash:dom-stream-pause",
    RESUME: "dash:dom-stream-resume",
    /** Viewer request for a bounded fresh subtree payload. Payload: SubtreeRequestPayload */
    SUBTREE_REQUEST: "dash:ps-subtree-request"
  };
  var STREAM = {
    /** Full snapshot. Payload: see SnapshotPayload below. */
    SNAPSHOT: "ext:dom-snapshot",
    /** Batched diff ops. Payload: { mutations: DiffOp[], streamSessionId, snapshotId } */
    MUTATIONS: "ext:dom-mutations",
    /** Scroll position. Payload: { scrollX, scrollY, streamSessionId, snapshotId } */
    SCROLL: "ext:dom-scroll",
    /** Automation overlay state. Payload: { glow, progress, streamSessionId, snapshotId } */
    OVERLAY: "ext:dom-overlay",
    /** Native dialog mirroring. Payload: { dialog: DialogPayload } */
    DIALOG: "ext:dom-dialog",
    /** Capture module loaded in a tab. Payload: { tabId } */
    READY: "ext:dom-ready",
    /** Watchdog/viewer request for a fresh snapshot. Payload: { reason, ts } */
    REQUEST_SNAPSHOT: "ext:request-snapshot",
    /** Stream health state. */
    STATE: "ext:stream-state",
    /** Capture response to a bounded subtree request. Payload: SubtreeResponsePayload */
    SUBTREE_RESPONSE: "ext:ps-subtree-response"
  };
  var REMOTE_CONTROL = {
    REQUEST: "dash:ps-control-request",
    STOP: "dash:ps-control-stop",
    CLICK: "dash:ps-control-click",
    TEXT: "dash:ps-control-text",
    KEY: "dash:ps-control-key",
    SCROLL: "dash:ps-control-scroll",
    STATE: "ext:ps-control-state"
  };
  var REMOTE_CONTROL_STATE_VALUES = {
    LOCKED: "locked",
    REQUESTING: "requesting",
    ACTIVE: "active",
    DENIED: "denied",
    STOPPED: "stopped"
  };
  var DIFF_OP = {
    /** { op:'add', parentNid, html, beforeNid|null, nodeIds:string[] } — insert serialized subtree */
    ADD: "add",
    /** { op:'rm', nid } — remove subtree */
    REMOVE: "rm",
    /** { op:'attr', nid, attr, val } — attribute change */
    ATTR: "attr",
    /** { op:'text', nid, text } — character data change, addressed via parent nid */
    TEXT: "text",
    /** { op:'value', nid, value?, checked?, selectedValues? } — live form state change */
    VALUE: "value",
    /** ShadowRootPayload plus op:'shadow-root' — replace/open an observed shadow root */
    SHADOW_ROOT: "shadow-root",
    /** { op:'frame', frameNid, frame:FramePayload } — refresh an inert iframe mirror */
    FRAME: "frame",
    /** StyleSourceDiffOp — upsert/replace/remove one scoped CSSOM source */
    STYLE_SOURCE: "style-source"
  };
  var NID_ATTR = "data-fsb-nid";
  function createStreamSessionId(nowMs, rand) {
    return "stream_" + nowMs.toString(36) + "_" + rand;
  }
  function isCurrentStream(msg, active) {
    if (!msg) return false;
    if (msg.streamSessionId && active.streamSessionId && msg.streamSessionId !== active.streamSessionId) {
      return false;
    }
    if (msg.snapshotId && active.snapshotId && msg.snapshotId !== active.snapshotId) {
      return false;
    }
    return true;
  }

  // node_modules/@full-self-browsing/phantom-stream/src/protocol/envelope.js
  function encodeEnvelope(msg, lz, thresholdBytes) {
    var json = JSON.stringify(msg);
    var threshold = thresholdBytes || 0;
    if (!lz || typeof lz.compressToBase64 !== "function" || json.length <= threshold) {
      return json;
    }
    return JSON.stringify({ _lz: true, d: lz.compressToBase64(json) });
  }
  function decodeEnvelope(raw, lz) {
    var outer;
    try {
      outer = JSON.parse(raw);
    } catch (e) {
      return { ok: false, error: "json-parse-failed" };
    }
    if (!outer || outer._lz !== true || typeof outer.d !== "string") {
      return { ok: true, msg: outer };
    }
    if (!lz || typeof lz.decompressFromBase64 !== "function") {
      return { ok: false, error: "decompress-unavailable" };
    }
    var inner = lz.decompressFromBase64(outer.d);
    if (!inner) {
      return { ok: false, error: "decompress-failed" };
    }
    try {
      return { ok: true, msg: JSON.parse(inner) };
    } catch (e) {
      return { ok: false, error: "inner-json-parse-failed" };
    }
  }
  function isCompressedEnvelope(obj) {
    return !!obj && obj._lz === true && typeof obj.d === "string";
  }

  // node_modules/@full-self-browsing/phantom-stream/src/protocol/remote-control.js
  var REMOTE_TEXT_MAX_CHARS = 4096;
  var REMOTE_CONTROL_TYPES = [
    REMOTE_CONTROL.REQUEST,
    REMOTE_CONTROL.STOP,
    REMOTE_CONTROL.CLICK,
    REMOTE_CONTROL.TEXT,
    REMOTE_CONTROL.KEY,
    REMOTE_CONTROL.SCROLL,
    REMOTE_CONTROL.STATE
  ];
  var REMOTE_CONTROL_STATES = [
    REMOTE_CONTROL_STATE_VALUES.LOCKED,
    REMOTE_CONTROL_STATE_VALUES.REQUESTING,
    REMOTE_CONTROL_STATE_VALUES.ACTIVE,
    REMOTE_CONTROL_STATE_VALUES.DENIED,
    REMOTE_CONTROL_STATE_VALUES.STOPPED
  ];
  function isRemoteControlType(type) {
    return REMOTE_CONTROL_TYPES.includes(type);
  }
  function validateRemoteControlMessage(type, payload) {
    var p = asObject(payload);
    if (type === REMOTE_CONTROL.REQUEST) {
      return { ok: true, action: { type, kind: "request" } };
    }
    if (type === REMOTE_CONTROL.STOP) {
      return { ok: true, action: { type, kind: "stop" } };
    }
    if (type === REMOTE_CONTROL.CLICK) {
      return validateClick(type, p);
    }
    if (type === REMOTE_CONTROL.TEXT) {
      return validateText(type, p);
    }
    if (type === REMOTE_CONTROL.KEY) {
      return validateKey(type, p);
    }
    if (type === REMOTE_CONTROL.SCROLL) {
      return validateScroll(type, p);
    }
    return { ok: false, error: "remote-type-unsupported" };
  }
  function summarizeRemoteControlAction(type, payload) {
    var result = validateRemoteControlMessage(type, payload);
    if (!result.ok) {
      return {
        type: typeof type === "string" ? type : "",
        kind: "unsupported",
        error: result.error
      };
    }
    var action = result.action;
    if (action.kind === "request" || action.kind === "stop") {
      return { type: action.type, kind: action.kind };
    }
    if (action.kind === "click") {
      return {
        type: action.type,
        kind: action.kind,
        x: action.x,
        y: action.y,
        button: action.button,
        clickCount: action.clickCount
      };
    }
    if (action.kind === "text") {
      return {
        type: action.type,
        kind: action.kind,
        chars: action.text.length
      };
    }
    if (action.kind === "key") {
      return {
        type: action.type,
        kind: action.kind,
        key: action.key,
        event: action.event
      };
    }
    if (action.kind === "scroll") {
      return {
        type: action.type,
        kind: action.kind,
        x: action.x,
        y: action.y,
        deltaX: action.deltaX,
        deltaY: action.deltaY
      };
    }
    return { type: action.type, kind: action.kind };
  }
  function createRemoteControlStateEvent(state, reason, extra) {
    var event = {
      state: normalizeState(state),
      reason: normalizeReason(reason)
    };
    var counts = sanitizeCounts(extra && extra.counts);
    if (Object.keys(counts).length > 0) {
      event.counts = counts;
    }
    return event;
  }
  function validateClick(type, payload) {
    var point = readPoint(payload);
    if (!point.ok) return point;
    var button = payload.button == null ? "left" : payload.button;
    if (button !== "left" && button !== "middle" && button !== "right") {
      return { ok: false, error: "remote-button-invalid" };
    }
    var clickCount = payload.clickCount == null ? 1 : payload.clickCount;
    if (!isFinitePositiveNumber(clickCount)) {
      return { ok: false, error: "remote-coordinate-invalid" };
    }
    return {
      ok: true,
      action: {
        type,
        kind: "click",
        x: point.x,
        y: point.y,
        button,
        clickCount: Math.max(1, Math.floor(clickCount))
      }
    };
  }
  function validateText(type, payload) {
    if (typeof payload.text !== "string") {
      return { ok: false, error: "remote-type-unsupported" };
    }
    if (payload.text.length > REMOTE_TEXT_MAX_CHARS) {
      return { ok: false, error: "remote-text-too-long" };
    }
    return {
      ok: true,
      action: {
        type,
        kind: "text",
        text: payload.text
      }
    };
  }
  function validateKey(type, payload) {
    var event = normalizeKeyEvent(payload.event);
    if (event === null || typeof payload.key !== "string" || payload.key.length === 0) {
      return { ok: false, error: "remote-key-event-invalid" };
    }
    return {
      ok: true,
      action: {
        type,
        kind: "key",
        key: payload.key,
        event
      }
    };
  }
  function validateScroll(type, payload) {
    var point = readPoint(payload);
    if (!point.ok) return point;
    var deltaX = payload.deltaX == null ? 0 : payload.deltaX;
    var deltaY = payload.deltaY == null ? 0 : payload.deltaY;
    if (!isFiniteNumber(deltaX) || !isFiniteNumber(deltaY)) {
      return { ok: false, error: "remote-coordinate-invalid" };
    }
    return {
      ok: true,
      action: {
        type,
        kind: "scroll",
        x: point.x,
        y: point.y,
        deltaX,
        deltaY
      }
    };
  }
  function readPoint(payload) {
    if (!isFiniteNonNegativeNumber(payload.x) || !isFiniteNonNegativeNumber(payload.y)) {
      return { ok: false, error: "remote-coordinate-invalid" };
    }
    return { ok: true, x: payload.x, y: payload.y };
  }
  function normalizeKeyEvent(event) {
    if (event === "down" || event === "keyDown") return "down";
    if (event === "up" || event === "keyUp") return "up";
    return null;
  }
  function normalizeState(state) {
    if (REMOTE_CONTROL_STATES.includes(state)) return state;
    return REMOTE_CONTROL_STATE_VALUES.LOCKED;
  }
  function normalizeReason(reason) {
    if (typeof reason !== "string") return "";
    if (!/^[a-z0-9-]+$/.test(reason)) return "";
    return reason;
  }
  function sanitizeCounts(counts) {
    var result = {};
    if (!counts || Object(counts) !== counts) return result;
    for (const key of Object.keys(counts)) {
      var value = counts[key];
      if (/^[A-Za-z0-9_-]+$/.test(key) && isFiniteNonNegativeNumber(value)) {
        result[key] = value;
      }
    }
    return result;
  }
  function asObject(value) {
    if (value && Object(value) === value && !Array.isArray(value)) return value;
    return {};
  }
  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }
  function isFiniteNonNegativeNumber(value) {
    return isFiniteNumber(value) && value >= 0;
  }
  function isFinitePositiveNumber(value) {
    return isFiniteNumber(value) && value > 0;
  }

  // extension/ws/phantom-stream-protocol-entry.js
  globalThis.FSBPhantomStreamProtocol = Object.freeze({
    CONTROL,
    DIFF_OP,
    NID_ATTR,
    REMOTE_CONTROL,
    REMOTE_CONTROL_STATE: REMOTE_CONTROL_STATE_VALUES,
    STREAM,
    createRemoteControlStateEvent,
    createStreamSessionId,
    decodeEnvelope,
    encodeEnvelope,
    isCompressedEnvelope,
    isCurrentStream,
    isRemoteControlType,
    summarizeRemoteControlAction,
    validateRemoteControlMessage
  });
})();
