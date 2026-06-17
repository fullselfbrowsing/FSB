(() => {
  // node_modules/@full-self-browsing/phantom-stream/src/protocol/constants.js
  var RELAY_PER_MESSAGE_LIMIT_BYTES = 1048576;
  var SNAPSHOT_BUDGET_FRACTION = 0.8;
  var SNAPSHOT_BUDGET_BYTES = Math.floor(
    RELAY_PER_MESSAGE_LIMIT_BYTES * SNAPSHOT_BUDGET_FRACTION
  );
  var TRUNCATION_VIEWPORT_MULTIPLIER = 3;
  var SCROLL_THROTTLE_MS = 200;
  var OVERLAY_THROTTLE_MS = 500;
  var MUTATION_STALE_THRESHOLD_MS = 5e3;
  var WATCHDOG_TICK_MS = 500;
  var READY_PROBE_INTERVAL_MS = 200;
  var READY_PROBE_BUDGET_MS = 5e3;
  var INLINE_STYLE_MAX_BYTES = 5e5;

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
  function createStreamSessionId(nowMs, rand) {
    return "stream_" + nowMs.toString(36) + "_" + rand;
  }

  // node_modules/@full-self-browsing/phantom-stream/src/capture/index.js
  var URL_ATTRS = ["src", "href", "action", "poster", "data"];
  var STYLE_DEFAULTS = {
    "display": "block",
    "position": "static",
    "opacity": "1",
    "visibility": "visible",
    "overflow": "visible",
    "transform": "none",
    "box-shadow": "none",
    "z-index": "auto",
    "float": "none",
    "clear": "none",
    "cursor": "auto",
    "pointer-events": "auto",
    "text-decoration": "none solid rgb(0, 0, 0)",
    "text-align": "start",
    "vertical-align": "baseline",
    "font-style": "normal",
    "font-variant": "normal",
    "text-transform": "none",
    "white-space": "normal",
    "word-break": "normal",
    "overflow-wrap": "normal",
    "list-style-type": "disc",
    "border-collapse": "separate",
    "resize": "none"
  };
  var CURATED_PROPS = [
    // Layout & Box Model
    "display",
    "position",
    "top",
    "right",
    "bottom",
    "left",
    "float",
    "clear",
    "box-sizing",
    "width",
    "height",
    "min-width",
    "min-height",
    "max-width",
    "max-height",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    // Flexbox
    "flex-direction",
    "flex-wrap",
    "justify-content",
    "align-items",
    "align-self",
    "align-content",
    "flex-grow",
    "flex-shrink",
    "flex-basis",
    "order",
    "gap",
    // Grid
    "grid-template-columns",
    "grid-template-rows",
    "grid-column",
    "grid-row",
    "grid-auto-flow",
    "grid-gap",
    "column-gap",
    "row-gap",
    // Visual
    "background-color",
    "background-image",
    "background-position",
    "background-size",
    "background-repeat",
    "color",
    "opacity",
    "visibility",
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
    "border-top-style",
    "border-right-style",
    "border-bottom-style",
    "border-left-style",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "border-radius",
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-left-radius",
    "border-bottom-right-radius",
    "box-shadow",
    "outline",
    "outline-color",
    "outline-style",
    "outline-width",
    // Typography
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "font-variant",
    "line-height",
    "letter-spacing",
    "word-spacing",
    "text-align",
    "text-decoration",
    "text-transform",
    "text-indent",
    "text-overflow",
    "white-space",
    "word-break",
    "overflow-wrap",
    // Overflow & Clipping
    "overflow",
    "overflow-x",
    "overflow-y",
    "clip",
    "clip-path",
    // Transform & Transition
    "transform",
    "transform-origin",
    "transition",
    "animation",
    // Table
    "border-collapse",
    "border-spacing",
    "table-layout",
    // List
    "list-style-type",
    "list-style-position",
    // Misc
    "z-index",
    "cursor",
    "pointer-events",
    "user-select",
    "vertical-align",
    "resize",
    "object-fit",
    "object-position",
    "content",
    "direction",
    "unicode-bidi"
  ];
  var SHELL_PROPS = [
    "background-color",
    "background-image",
    "background-position",
    "background-size",
    "background-repeat",
    "color",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "font-variant",
    "line-height",
    "letter-spacing",
    "word-spacing",
    "text-align",
    "text-transform",
    "direction",
    "unicode-bidi",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "overflow",
    "overflow-x",
    "overflow-y",
    "box-sizing"
  ];
  function stripLowChars(value) {
    var out = "";
    for (var i = 0; i < value.length; i++) {
      if (value.charCodeAt(i) > 32) out += value.charAt(i);
    }
    return out;
  }
  function hasDangerousScheme(value) {
    if (!value || typeof value !== "string") return false;
    var compact = stripLowChars(value).toLowerCase();
    return compact.indexOf("javascript:") === 0 || compact.indexOf("vbscript:") === 0 || compact.indexOf("data:text/html") === 0;
  }
  function parseSrcsetCandidates(srcset) {
    var raw = String(srcset == null ? "" : srcset);
    var out = [];
    var i = 0;
    while (i < raw.length) {
      while (i < raw.length && /[\s,]/.test(raw.charAt(i))) i++;
      var urlStart = i;
      var isData = raw.slice(i, i + 5).toLowerCase() === "data:";
      while (i < raw.length && !/\s/.test(raw.charAt(i)) && (isData || raw.charAt(i) !== ",")) {
        i++;
      }
      var url = raw.slice(urlStart, i);
      while (i < raw.length && /\s/.test(raw.charAt(i))) i++;
      var descriptorStart = i;
      while (i < raw.length && raw.charAt(i) !== ",") i++;
      var descriptor = raw.slice(descriptorStart, i).trim();
      if (url) out.push({ url, descriptor });
      if (raw.charAt(i) === ",") i++;
    }
    return out;
  }
  function formatSrcsetCandidate(candidate) {
    return candidate.descriptor ? candidate.url + " " + candidate.descriptor : candidate.url;
  }
  function scrubSrcset(srcset) {
    if (!srcset) return srcset;
    try {
      var entries = parseSrcsetCandidates(srcset);
      var kept = [];
      var changed = false;
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].url && hasDangerousScheme(entries[i].url)) {
          changed = true;
          continue;
        }
        kept.push(formatSrcsetCandidate(entries[i]));
      }
      return changed ? kept.join(", ") : srcset;
    } catch (e) {
      return srcset;
    }
  }
  function scrubCssText(css) {
    if (!css || typeof css !== "string") return css;
    try {
      var out = css;
      out = out.replace(
        /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'][^)]*))?\s*\)/gi,
        function(match, dq, sq, bare) {
          var inner = dq !== void 0 ? dq : sq !== void 0 ? sq : bare || "";
          var compact = stripLowChars(inner);
          var schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.\-]*):/.exec(compact);
          if (!schemeMatch) return match;
          var scheme = schemeMatch[1].toLowerCase();
          if (scheme === "http" || scheme === "https") return match;
          if (scheme === "data" && /^data:image\//i.test(compact)) return match;
          return "url(about:blank)";
        }
      );
      out = out.replace(/expression\s*\(/gi, "");
      out = out.replace(/-moz-binding[^;}]*/gi, "");
      out = out.replace(/@import\b[^;]*(;|$)/gi, function(stmt) {
        return /^@import\s+(?:url\(\s*)?['"]?\s*https?:/i.test(stmt) ? stmt : "";
      });
      out = out.replace(/<\/style/gi, "<\\/style");
      var tagLike = /<\/?[a-zA-Z][^>]*(?:>|$)/g;
      for (; ; ) {
        var next = out.replace(tagLike, "");
        if (next === out) break;
        out = next;
      }
      return out;
    } catch (e) {
      return css;
    }
  }
  function defaultMaskText(text) {
    return String(text).replace(/[\S]/g, "*");
  }
  function createCapture(config) {
    var cfg = config || {};
    var transport = cfg.transport;
    if (!transport || typeof transport.send !== "function") {
      throw new Error("transport-send-required");
    }
    var logger = cfg.logger || {
      info: function() {
        console.info.apply(console, arguments);
      },
      warn: function() {
        console.warn.apply(console, arguments);
      },
      error: function() {
        console.error.apply(console, arguments);
      }
    };
    var overlayProvider = cfg.overlayProvider || null;
    var hostSkipElement = typeof cfg.skipElement === "function" ? cfg.skipElement : null;
    var skipElement = hostSkipElement || function() {
      return false;
    };
    var styleMode = cfg.styleMode === "cssom" ? "cssom" : "computed";
    var fetchStylesheet = typeof cfg.fetchStylesheet === "function" ? cfg.fetchStylesheet : null;
    var maskInputs = cfg.maskInputs === true;
    var maskTextFn = typeof cfg.maskTextFn === "function" ? cfg.maskTextFn : null;
    var maskInputFn = typeof cfg.maskInputFn === "function" ? cfg.maskInputFn : null;
    var blockSelector = compileMaskSelector(cfg.blockSelector);
    var maskTextSelector = compileMaskSelector(cfg.maskTextSelector);
    function skipElementWithAncestors(el) {
      if (!hostSkipElement) return false;
      var node = el;
      while (node) {
        try {
          if (hostSkipElement(node)) return true;
        } catch (err) {
          logger.error("[DOM Stream] skipElement predicate failed", err);
          return false;
        }
        node = node.parentElement;
      }
      return false;
    }
    function safeSkipElement(el) {
      try {
        return skipElement(el);
      } catch (err) {
        logger.error("[DOM Stream] skipElement predicate failed", err);
        return false;
      }
    }
    function safeSend(type, payload) {
      try {
        var result = transport.send(type, payload);
        if (result && typeof result.catch === "function") {
          result.catch(function(err) {
            logger.error("[DOM Stream] transport send failed", err);
          });
        }
      } catch (err) {
        logger.error("[DOM Stream] transport send failed", err);
      }
    }
    function safeFlush() {
      try {
        if (typeof transport.flush === "function") {
          var result = transport.flush();
          if (result && typeof result.catch === "function") {
            result.catch(function(err) {
              logger.error("[DOM Stream] transport flush failed", err);
            });
          }
        }
      } catch (err) {
        logger.error("[DOM Stream] transport flush failed", err);
      }
    }
    var streaming = false;
    var mutationObserver = null;
    var batchTimer = null;
    var pendingMutations = [];
    var nextNodeId = 1;
    var elementToNid = /* @__PURE__ */ new WeakMap();
    var nidToElement = /* @__PURE__ */ new Map();
    var scrollHandler = null;
    var lastScrollSend = 0;
    var dialogRelayActive = false;
    var lastOverlayBroadcast = 0;
    var streamSessionId = "";
    var currentSnapshotId = 0;
    var lastDrainTs = 0;
    var staleFlushCount = 0;
    var watchdogTimer = null;
    var observedShadowRoots = /* @__PURE__ */ new WeakSet();
    var observedFrameDocuments = /* @__PURE__ */ new Map();
    var frameDocumentToNid = /* @__PURE__ */ new WeakMap();
    var frameLoadListeners = /* @__PURE__ */ new Map();
    var valueCaptureActive = false;
    var valueListenerRoots = /* @__PURE__ */ new WeakSet();
    var valueListenerRecords = [];
    var nativeAttachShadow = null;
    var attachShadowProto = null;
    var pendingStyleSourceChanges = /* @__PURE__ */ new Map();
    var styleSourceRegistry = /* @__PURE__ */ new Map();
    var styleOwnerToSourceKey = typeof WeakMap === "function" ? /* @__PURE__ */ new WeakMap() : null;
    var styleScopeRoots = /* @__PURE__ */ new Map();
    var nativeCssStyleSheetMethods = null;
    var flushingMutations = false;
    var sanitizeCounters = {
      strippedHandlers: 0,
      // on* handler attributes removed
      blockedUrlSchemes: 0,
      // javascript:/vbscript:/data:text/html values neutralized
      blockedSubtrees: 0,
      // object/embed subtrees dropped + srcdoc attrs dropped
      cssScrubs: 0,
      // CSS values rewritten by scrubCssText
      maskedTextNodes: 0,
      // (plan 03-03) maskTextSelector-matched text masked
      maskedInputs: 0
      // (plan 03-03) masked input values
    };
    function beginStreamSession() {
      streamSessionId = createStreamSessionId(
        Date.now(),
        Math.random().toString(36).slice(2, 8)
      );
      currentSnapshotId = Date.now();
      sanitizeCounters.strippedHandlers = 0;
      sanitizeCounters.blockedUrlSchemes = 0;
      sanitizeCounters.blockedSubtrees = 0;
      sanitizeCounters.cssScrubs = 0;
      sanitizeCounters.maskedTextNodes = 0;
      sanitizeCounters.maskedInputs = 0;
      pendingStyleSourceChanges.clear();
      styleSourceRegistry.clear();
      styleScopeRoots.clear();
      styleOwnerToSourceKey = typeof WeakMap === "function" ? /* @__PURE__ */ new WeakMap() : null;
    }
    function getCurrentStreamMetadata() {
      return {
        streamSessionId: streamSessionId || "",
        snapshotId: currentSnapshotId || 0
      };
    }
    function attachStreamMetadata(payload) {
      return Object.assign({}, payload || {}, getCurrentStreamMetadata());
    }
    function ensureNodeId(element) {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;
      var existing = elementToNid.get(element);
      if (existing) return existing;
      var nid = String(nextNodeId++);
      elementToNid.set(element, nid);
      nidToElement.set(nid, element);
      return nid;
    }
    function reserveNodeId() {
      nextNodeId++;
    }
    function getTrackedNodeId(element) {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;
      var nid = elementToNid.get(element);
      if (!nid) return null;
      if (nidToElement.get(nid) !== element) return null;
      return nid;
    }
    function clearNodeMirror() {
      elementToNid = /* @__PURE__ */ new WeakMap();
      nidToElement.clear();
    }
    function forgetSubtreeIdentity(root) {
      if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
      var nodes = [root];
      if (root.querySelectorAll) {
        var descendants = root.querySelectorAll("*");
        for (var i = 0; i < descendants.length; i++) nodes.push(descendants[i]);
      }
      for (var n = 0; n < nodes.length; n++) {
        var nid = elementToNid.get(nodes[n]);
        if (nid) {
          elementToNid.delete(nodes[n]);
          if (nidToElement.get(nid) === nodes[n]) nidToElement.delete(nid);
        }
      }
    }
    function assignNodeId(original, clone, cloneToNid) {
      var nid = ensureNodeId(original);
      if (nid && clone && clone.nodeType === Node.ELEMENT_NODE && cloneToNid) {
        cloneToNid.set(clone, nid);
      }
      return nid;
    }
    function cloneElementsWithNodeIds(root, cloneToNid) {
      var out = [];
      if (!root || !cloneToNid) return out;
      var walker = root.ownerDocument.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT,
        null
      );
      var el;
      while (el = walker.nextNode()) {
        if (cloneToNid.has(el)) out.push(el);
      }
      return out;
    }
    function buildNodeIdSidecar(root, cloneToNid, includeRoot) {
      var nodeIds = [];
      if (!root || !cloneToNid) return nodeIds;
      if (includeRoot && root.nodeType === Node.ELEMENT_NODE && cloneToNid.has(root)) {
        nodeIds.push(cloneToNid.get(root));
      }
      var walker = root.ownerDocument.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT,
        null
      );
      var el;
      while (el = walker.nextNode()) {
        if (cloneToNid.has(el)) nodeIds.push(cloneToNid.get(el));
      }
      return nodeIds;
    }
    function mutationObserverOptions() {
      return {
        childList: true,
        attributes: true,
        characterData: true,
        subtree: true,
        attributeOldValue: true
      };
    }
    function isOpenShadowRoot(root) {
      return !!(root && root.nodeType === Node.DOCUMENT_FRAGMENT_NODE && root.host && root.mode === "open");
    }
    function elementsUnderRoot(root) {
      var elements = [];
      if (!root) return elements;
      if (root.nodeType === Node.ELEMENT_NODE) elements.push(root);
      if (root.querySelectorAll) {
        var descendants = root.querySelectorAll("*");
        for (var i = 0; i < descendants.length; i++) elements.push(descendants[i]);
      }
      return elements;
    }
    function getMutationShadowHost(target) {
      if (!target || typeof target.getRootNode !== "function") return null;
      var root = target.getRootNode();
      if (!isOpenShadowRoot(root)) return null;
      return root.host || null;
    }
    function shadowSlotAssignment(root) {
      if (!root || !root.querySelectorAll) return "none";
      var slots = root.querySelectorAll("slot");
      var hasDefault = false;
      var hasNamed = false;
      for (var i = 0; i < slots.length; i++) {
        if (slots[i].getAttribute("name")) hasNamed = true;
        else hasDefault = true;
      }
      if (hasNamed) return "named";
      if (hasDefault) return "default";
      return "none";
    }
    function prepareShadowClone(root, container, cloneToNid) {
      var liveDescendants = root && root.querySelectorAll ? root.querySelectorAll("*") : [];
      var cloneDescendants = container.querySelectorAll("*");
      var baseDoc = root && root.ownerDocument ? root.ownerDocument : document;
      for (var i = 0; i < liveDescendants.length; i++) {
        var live = liveDescendants[i];
        var clone = cloneDescendants[i];
        if (!clone) continue;
        if (wireDroppedWithAncestors(live) || skipElementWithAncestors(live)) {
          if (clone.parentNode) clone.parentNode.removeChild(clone);
          continue;
        }
        if (blockedWithAncestors(live.parentElement)) continue;
        var nid = ensureNodeId(live);
        if (nid) cloneToNid.set(clone, nid);
        for (var a = 0; a < URL_ATTRS.length; a++) {
          var val = clone.getAttribute(URL_ATTRS[a]);
          if (val) clone.setAttribute(URL_ATTRS[a], absolutifyUrl(val, baseDoc));
        }
        var srcset = clone.getAttribute("srcset");
        if (srcset) clone.setAttribute("srcset", absolutifySrcset(srcset, baseDoc));
        if (styleMode !== "cssom") captureComputedStyles(live, clone);
      }
    }
    function serializeOpenShadowRoot(host, hostNid) {
      if (!host || !host.shadowRoot || !hostNid) return null;
      var root = host.shadowRoot;
      if (!isOpenShadowRoot(root)) return null;
      var ownerDoc = host.ownerDocument || document;
      var container = ownerDoc.createElement("div");
      for (var child = root.firstChild; child; child = child.nextSibling) {
        container.appendChild(child.cloneNode(true));
      }
      var cloneToNid = /* @__PURE__ */ new Map();
      prepareShadowClone(root, container, cloneToNid);
      var subtreeResult = sanitizeForWire("subtree", {
        root: container,
        liveRoot: root,
        cloneToNid
      });
      if (subtreeResult && subtreeResult.drop) return null;
      var shadowPayload = {
        hostNid: String(hostNid),
        mode: "open",
        html: container.innerHTML || "",
        nodeIds: buildNodeIdSidecar(container, cloneToNid, false),
        slotAssignment: shadowSlotAssignment(root)
      };
      if (styleMode === "cssom") {
        var shadowCssom = collectCssomStyleSourcesForScope(
          ownerDoc,
          { kind: "shadow", hostNid: String(hostNid) },
          { root }
        );
        shadowPayload.styleSources = shadowCssom.sources;
        shadowPayload.styleStrategy = shadowCssom.strategy;
      }
      return shadowPayload;
    }
    function collectShadowRootPayloads(root, hostNodeIds, excludedHostNodeIds) {
      var payloads = [];
      var allowed = null;
      if (Array.isArray(hostNodeIds)) {
        allowed = /* @__PURE__ */ new Set();
        for (var h = 0; h < hostNodeIds.length; h++) allowed.add(String(hostNodeIds[h]));
      }
      var excluded = null;
      if (excludedHostNodeIds && typeof excludedHostNodeIds.has === "function") {
        excluded = excludedHostNodeIds;
      }
      function visit(treeRoot) {
        var elements = elementsUnderRoot(treeRoot);
        for (var i = 0; i < elements.length; i++) {
          var el = elements[i];
          if (!el || !el.shadowRoot || !isOpenShadowRoot(el.shadowRoot)) continue;
          var hostNid = getTrackedNodeId(el) || ensureNodeId(el);
          if (!hostNid) continue;
          if (allowed && !allowed.has(String(hostNid))) continue;
          if (excluded && excluded.has(String(hostNid))) continue;
          var payload = serializeOpenShadowRoot(el, hostNid);
          if (payload) payloads.push(payload);
          if (allowed && payload && Array.isArray(payload.nodeIds)) {
            for (var n = 0; n < payload.nodeIds.length; n++) {
              allowed.add(String(payload.nodeIds[n]));
            }
          }
          visit(el.shadowRoot);
        }
      }
      visit(root);
      return payloads;
    }
    function observeOpenShadowRoot(root) {
      if (!mutationObserver || !isOpenShadowRoot(root)) return;
      if (observedShadowRoots.has(root)) return;
      try {
        mutationObserver.observe(root, mutationObserverOptions());
        observedShadowRoots.add(root);
        addValueListenerRoot(root);
      } catch (err) {
        logger.error("[DOM Stream] shadow root observe failed", err);
        return;
      }
      observeOpenShadowRoots(root);
    }
    function observeOpenShadowRoots(root) {
      var elements = elementsUnderRoot(root);
      for (var i = 0; i < elements.length; i++) {
        if (elements[i].shadowRoot && isOpenShadowRoot(elements[i].shadowRoot)) {
          observeOpenShadowRoot(elements[i].shadowRoot);
        }
      }
    }
    function safeFrameSrc(src, baseDoc) {
      if (!src) return "";
      try {
        var baseHref = baseDoc && baseDoc.location ? baseDoc.location.href : location.href;
        return new URL(src, baseHref).href;
      } catch (err) {
        return "";
      }
    }
    function safeFrameOrigin(src, baseDoc) {
      if (!src) return "";
      try {
        var baseHref = baseDoc && baseDoc.location ? baseDoc.location.href : location.href;
        return new URL(src, baseHref).origin;
      } catch (err) {
        return "";
      }
    }
    function classifyFrame(iframe) {
      var doc = null;
      try {
        doc = iframe && iframe.contentDocument;
      } catch (err) {
        logger.warn("[DOM Stream] iframe contentDocument unavailable", {
          reason: "cross-origin-or-inaccessible"
        });
      }
      if (doc && doc.documentElement && doc.body) {
        return { kind: "same-origin", document: doc };
      }
      var src = iframe && iframe.getAttribute ? iframe.getAttribute("src") || "" : "";
      var baseDoc = iframe && iframe.ownerDocument ? iframe.ownerDocument : document;
      return {
        kind: "cross-origin",
        label: "Cross-origin iframe",
        src: safeFrameSrc(src, baseDoc),
        origin: safeFrameOrigin(src, baseDoc)
      };
    }
    function appendStyleDeclaration(clone, declaration) {
      if (!clone || !declaration) return;
      var existing = clone.getAttribute("style") || "";
      var suffix = declaration.charAt(declaration.length - 1) === ";" ? declaration : declaration + ";";
      clone.setAttribute("style", existing ? existing + ";" + suffix : suffix);
    }
    function prepareIframeWireShell(live, clone) {
      if (!clone || clone.nodeType !== Node.ELEMENT_NODE) return;
      clone.removeAttribute("src");
      clone.removeAttribute("srcdoc");
      captureComputedStyles(live, clone);
      appendStyleDeclaration(clone, "pointer-events:none");
      sanitizeForWire("element", { orig: live, clone });
    }
    function prepareIframeWireShellsForClone(liveRoot, wireRoot) {
      var liveElements = elementsUnderRoot(liveRoot);
      var cloneElements = elementsUnderRoot(wireRoot);
      for (var i = 0; i < liveElements.length && i < cloneElements.length; i++) {
        var live = liveElements[i];
        var clone = cloneElements[i];
        var tag = clone && clone.tagName ? String(clone.tagName).toLowerCase() : "";
        if (tag === "iframe") prepareIframeWireShell(live, clone);
      }
    }
    function collectStylesheetsFrom(doc) {
      var stylesheets = [];
      if (!doc || !doc.querySelectorAll) return stylesheets;
      var links = doc.querySelectorAll('head link[rel="stylesheet"]');
      for (var s = 0; s < links.length; s++) {
        var href = links[s].getAttribute("href");
        if (!href) continue;
        var sheetHref = absolutifyUrl(href, doc);
        if (hasDangerousScheme(sheetHref)) {
          sanitizeCounters.blockedUrlSchemes++;
        } else {
          stylesheets.push(sheetHref);
        }
      }
      return stylesheets;
    }
    function collectInlineStylesFrom(doc) {
      var inlineStyles = [];
      if (!doc || !doc.querySelectorAll) return inlineStyles;
      var styleTags = doc.querySelectorAll("head style");
      for (var st = 0; st < styleTags.length; st++) {
        var cssText = styleTags[st].textContent;
        if (cssText && cssText.length < INLINE_STYLE_MAX_BYTES) {
          inlineStyles.push(sanitizeForWire("css", { css: cssText }).css);
        }
      }
      return inlineStyles;
    }
    function cloneStyleScope(scope) {
      var s = scope || {};
      var out = { kind: s.kind || "document" };
      if (s.hostNid !== void 0 && s.hostNid !== null) out.hostNid = String(s.hostNid);
      if (s.frameNid !== void 0 && s.frameNid !== null) out.frameNid = String(s.frameNid);
      return out;
    }
    function styleScopeKey(scope) {
      var s = scope || {};
      if (s.kind === "shadow") return "shadow:" + String(s.hostNid || "");
      if (s.kind === "frame") return "frame:" + String(s.frameNid || "");
      return "document";
    }
    function makeStyleSourceId(scope, order, ownerKind, ownerNid) {
      var prefix = styleScopeKey(scope);
      var suffix = ownerNid !== void 0 && ownerNid !== null && String(ownerNid) !== "" ? ":" + String(ownerNid) : "";
      return prefix + ":" + String(order || 0) + ":" + String(ownerKind || "style") + suffix;
    }
    function cssRulesToText(ruleList) {
      var rules = [];
      if (!ruleList) return "";
      for (var i = 0; i < ruleList.length; i++) {
        if (ruleList[i] && ruleList[i].cssText) rules.push(String(ruleList[i].cssText));
      }
      return rules.join("\n");
    }
    function sanitizeCssTextForSource(cssText) {
      return sanitizeForWire("css", { css: String(cssText || "") }).css;
    }
    function buildStyleStrategy(mode, sources) {
      var list = Array.isArray(sources) ? sources : [];
      var fallbackCount = 0;
      var computedFallbackCount = 0;
      var approxCssBytes = 0;
      for (var i = 0; i < list.length; i++) {
        var source = list[i] || {};
        if (source.fallback) fallbackCount++;
        if (source.fallback && source.fallback.reason === "computed-fallback") {
          computedFallbackCount++;
        }
        approxCssBytes += source.approxBytes || wireByteLength(source.cssText || "");
      }
      return {
        mode: mode || "computed",
        sourceCount: list.length,
        fallbackCount,
        computedFallbackCount,
        approxCssBytes
      };
    }
    function safeStylesheetHref(href, doc) {
      if (!href) return "";
      var resolved = absolutifyUrl(String(href), doc);
      if (!resolved || hasDangerousScheme(resolved)) {
        if (resolved) sanitizeCounters.blockedUrlSchemes++;
        return "";
      }
      return resolved;
    }
    function ownerKindForStyleNode(node, adopted) {
      if (adopted) return "adopted";
      var tag = node && node.tagName ? String(node.tagName).toLowerCase() : "";
      if (tag === "link") return "link";
      if (tag === "style") return "style";
      return adopted ? "adopted" : "constructable";
    }
    function styleOwnerHref(ownerNode, sheet, doc) {
      var href = "";
      if (ownerNode && typeof ownerNode.getAttribute === "function") {
        href = ownerNode.getAttribute("href") || "";
      }
      if (!href && sheet && sheet.href) href = sheet.href;
      return safeStylesheetHref(href, doc);
    }
    function styleOwnerMedia(ownerNode, sheet) {
      if (ownerNode && typeof ownerNode.getAttribute === "function") {
        return String(ownerNode.getAttribute("media") || "");
      }
      try {
        if (sheet && sheet.media && sheet.media.mediaText) return String(sheet.media.mediaText || "");
      } catch (err) {
      }
      return "";
    }
    function styleOwnerDisabled(ownerNode, sheet) {
      if (ownerNode && typeof ownerNode.disabled === "boolean") return ownerNode.disabled;
      if (sheet && typeof sheet.disabled === "boolean") return sheet.disabled;
      return false;
    }
    function fallbackCssForScope(root) {
      var css = [];
      var elements = elementsUnderRoot(root && root.body ? root.body : root);
      for (var i = 0; i < elements.length; i++) {
        var styleText = collectComputedStyleText(elements[i], CURATED_PROPS);
        if (!styleText) continue;
        css.push("*{");
        css.push(styleText);
        css.push("}");
        break;
      }
      return css.join("");
    }
    function styleSheetEntriesForScope(doc, root) {
      var entries = [];
      var seen = typeof WeakSet === "function" ? /* @__PURE__ */ new WeakSet() : null;
      var queryRoot = root && root.querySelectorAll ? root : doc;
      var nodes = [];
      if (queryRoot && queryRoot.querySelectorAll) {
        nodes = queryRoot.querySelectorAll('link[rel="stylesheet"], style');
      }
      for (var n = 0; n < nodes.length; n++) {
        var node = nodes[n];
        var sheet = node.sheet || null;
        if (sheet && seen) seen.add(sheet);
        entries.push({ sheet, ownerNode: node, adopted: false });
      }
      var adopted = [];
      try {
        adopted = root && root.adoptedStyleSheets ? root.adoptedStyleSheets : [];
      } catch (err) {
        adopted = [];
      }
      for (var a = 0; a < adopted.length; a++) {
        var adoptedSheet = adopted[a];
        if (!adoptedSheet) continue;
        if (seen && seen.has(adoptedSheet)) continue;
        if (seen) seen.add(adoptedSheet);
        entries.push({ sheet: adoptedSheet, ownerNode: null, adopted: true });
      }
      return entries;
    }
    function sourceFromStyleSheetEntry(entry, scope, order, doc, root) {
      var e = entry || {};
      var ownerKind = ownerKindForStyleNode(e.ownerNode, e.adopted);
      var href = styleOwnerHref(e.ownerNode, e.sheet, doc);
      var cssText = "";
      var fallback = null;
      var sourceId = makeStyleSourceId(scope, order, ownerKind, "");
      var media = styleOwnerMedia(e.ownerNode, e.sheet);
      var disabled = styleOwnerDisabled(e.ownerNode, e.sheet);
      try {
        if (e.sheet && e.sheet.cssRules) {
          cssText = cssRulesToText(e.sheet.cssRules);
        } else if (e.ownerNode && String(e.ownerNode.tagName || "").toLowerCase() === "style") {
          cssText = String(e.ownerNode.textContent || "");
        }
      } catch (err) {
        fallback = { reason: "cssRules-blocked" };
      }
      if (cssText) {
        cssText = sanitizeCssTextForSource(cssText);
      } else if (fallback && href) {
        fallback = { reason: "href-relinked" };
      } else if (fallback && fetchStylesheet) {
        try {
          var fetched = fetchStylesheet({ href: href || "", scope: cloneStyleScope(scope), ownerKind });
          var fetchedCss = typeof fetched === "string" ? fetched : fetched && typeof fetched.css === "string" ? fetched.css : "";
          if (fetchedCss) {
            cssText = sanitizeCssTextForSource(fetchedCss);
            fallback = { reason: "adapter-fetch" };
          }
        } catch (err2) {
          logger.warn("[DOM Stream] cssom fetch failed", {
            reason: "adapter-fetch-failed",
            ownerKind
          });
        }
      }
      if (!cssText && !href) {
        cssText = sanitizeCssTextForSource(fallbackCssForScope(root));
        ownerKind = "fallback";
        fallback = { reason: "computed-fallback" };
        sourceId = makeStyleSourceId(scope, order, ownerKind, "");
      }
      return {
        sourceId,
        scope: cloneStyleScope(scope),
        ownerKind,
        order,
        href: href || null,
        media,
        disabled,
        cssText: cssText || "",
        fallback,
        approxBytes: wireByteLength(cssText || "")
      };
    }
    function registerStyleSource(source, entry, doc, root) {
      if (!source || !source.sourceId) return;
      var key = String(source.sourceId);
      styleSourceRegistry.set(key, {
        source,
        entry: entry || null,
        scope: cloneStyleScope(source.scope),
        doc: doc || document,
        root: root || doc || document
      });
      if (styleOwnerToSourceKey) {
        if (entry && entry.ownerNode) styleOwnerToSourceKey.set(entry.ownerNode, key);
        if (entry && entry.sheet) styleOwnerToSourceKey.set(entry.sheet, key);
      }
    }
    function collectCssomStyleSourcesForScope(doc, scope, options) {
      var opts = options || {};
      var root = opts.root || doc;
      var sources = [];
      if (styleMode !== "cssom" || !doc) {
        return { sources, strategy: buildStyleStrategy("computed", sources) };
      }
      var entries = styleSheetEntriesForScope(doc, root);
      for (var i = 0; i < entries.length; i++) {
        var source = sourceFromStyleSheetEntry(entries[i], scope, i, doc, root);
        sources.push(source);
        registerStyleSource(source, entries[i], doc, root);
      }
      if (!sources.length) {
        var fallback = {
          sourceId: makeStyleSourceId(scope, 0, "fallback", ""),
          scope: cloneStyleScope(scope),
          ownerKind: "fallback",
          order: 0,
          href: null,
          media: "",
          disabled: false,
          cssText: sanitizeCssTextForSource(fallbackCssForScope(root)),
          fallback: { reason: "computed-fallback" },
          approxBytes: 0
        };
        fallback.approxBytes = wireByteLength(fallback.cssText || "");
        sources.push(fallback);
        registerStyleSource(fallback, null, doc, root);
      }
      styleScopeRoots.set(styleScopeKey(scope), { doc, root, scope: cloneStyleScope(scope) });
      return { sources, strategy: buildStyleStrategy("cssom", sources) };
    }
    function scheduleMutationFlush() {
      if (batchTimer) cancelAnimationFrame(batchTimer);
      batchTimer = requestAnimationFrame(flushMutations);
    }
    function queueStyleSourceChange(action, source, scope, reason) {
      if (styleMode !== "cssom") return;
      var sourceId = source && source.sourceId ? String(source.sourceId) : "";
      if (!sourceId) return;
      var safeSource = null;
      if (action !== "remove") {
        safeSource = Object.assign({}, source, {
          sourceId,
          scope: cloneStyleScope(scope || source.scope),
          cssText: sanitizeCssTextForSource(source.cssText || "")
        });
        safeSource.approxBytes = wireByteLength(safeSource.cssText || "");
      }
      pendingStyleSourceChanges.set(sourceId, {
        op: DIFF_OP.STYLE_SOURCE,
        action: action === "remove" ? "remove" : action === "upsert" ? "upsert" : "replace",
        sourceId,
        scope: cloneStyleScope(scope || source && source.scope || {}),
        source: safeSource,
        reason: reason || "cssom-style-source-stale"
      });
      logger.warn("[DOM Stream] cssom style source queued", {
        action: action || "replace",
        sourceId,
        reason: reason || "cssom-style-source-stale"
      });
      if (!flushingMutations) scheduleMutationFlush();
    }
    function drainPendingStyleSourceDiffs() {
      var diffs = [];
      pendingStyleSourceChanges.forEach(function(entry) {
        var diff = {
          op: DIFF_OP.STYLE_SOURCE,
          action: entry.action,
          sourceId: entry.sourceId,
          scope: cloneStyleScope(entry.scope)
        };
        if (entry.action !== "remove" && entry.source) diff.source = entry.source;
        diffs.push(diff);
      });
      pendingStyleSourceChanges.clear();
      return diffs;
    }
    function queueStyleScopeReplacement(scope, root, reason) {
      if (styleMode !== "cssom") return;
      var scopeKey = styleScopeKey(scope);
      var info = styleScopeRoots.get(scopeKey) || {};
      var docForScope = info.doc || root && root.ownerDocument || document;
      var rootForScope = root || info.root || docForScope;
      var before = {};
      styleSourceRegistry.forEach(function(entry, key) {
        if (styleScopeKey(entry.scope) === scopeKey) before[key] = true;
      });
      var collected = collectCssomStyleSourcesForScope(docForScope, scope, { root: rootForScope });
      for (var i = 0; i < collected.sources.length; i++) {
        var source = collected.sources[i];
        delete before[source.sourceId];
        queueStyleSourceChange("replace", source, source.scope, reason || "cssom-style-source-stale");
      }
      Object.keys(before).forEach(function(sourceId) {
        var entry = styleSourceRegistry.get(sourceId);
        styleSourceRegistry.delete(sourceId);
        queueStyleSourceChange("remove", {
          sourceId,
          scope: entry ? entry.scope : cloneStyleScope(scope)
        }, entry ? entry.scope : scope, reason || "cssom-style-source-stale");
      });
    }
    function markStyleOwnerDirty(owner, reason) {
      if (styleMode !== "cssom") return;
      var key = owner && styleOwnerToSourceKey ? styleOwnerToSourceKey.get(owner) : "";
      var entry = key ? styleSourceRegistry.get(key) : null;
      if (!entry) {
        sendCssomFreshSnapshot("cssom-style-source-stale");
        return;
      }
      queueStyleScopeReplacement(entry.scope, entry.root, reason || "cssom-style-source-stale");
    }
    function patchCssStyleSheetMethods() {
      if (styleMode !== "cssom" || nativeCssStyleSheetMethods) return;
      var proto = window && window.CSSStyleSheet && window.CSSStyleSheet.prototype;
      if (!proto) return;
      nativeCssStyleSheetMethods = {};
      ["insertRule", "deleteRule", "replace", "replaceSync"].forEach(function(name) {
        if (typeof proto[name] !== "function") return;
        nativeCssStyleSheetMethods[name] = proto[name];
        try {
          proto[name] = function patchedCssStyleSheetMethod() {
            var result = nativeCssStyleSheetMethods[name].apply(this, arguments);
            var sheet = this;
            if (name === "replace" && result && typeof result.then === "function") {
              result.then(function() {
                markStyleOwnerDirty(sheet, "cssom-rule-mutated");
              }, function() {
                logger.warn("[DOM Stream] cssom hook unavailable", { reason: "cssom-hook-unavailable" });
                sendCssomFreshSnapshot("cssom-hook-unavailable");
              });
            } else {
              markStyleOwnerDirty(sheet, "cssom-rule-mutated");
            }
            return result;
          };
        } catch (err) {
          logger.warn("[DOM Stream] cssom hook unavailable", { reason: "cssom-hook-unavailable" });
          sendCssomFreshSnapshot("cssom-hook-unavailable");
        }
      });
    }
    function restoreCssStyleSheetMethods() {
      if (!nativeCssStyleSheetMethods) return;
      var proto = window && window.CSSStyleSheet && window.CSSStyleSheet.prototype;
      if (proto) {
        Object.keys(nativeCssStyleSheetMethods).forEach(function(name) {
          try {
            proto[name] = nativeCssStyleSheetMethods[name];
          } catch (err) {
          }
        });
      }
      nativeCssStyleSheetMethods = null;
    }
    function reconcileAdoptedStyleSheetsForScope(root, scope) {
      if (styleMode !== "cssom") return;
      try {
        if (root && root.adoptedStyleSheets) {
          queueStyleScopeReplacement(scope, root, "adoptedStyleSheets");
        }
      } catch (err) {
        logger.warn("[DOM Stream] cssom hook unavailable", { reason: "cssom-hook-unavailable" });
      }
    }
    function reconcileAllKnownStyleScopes() {
      if (styleMode !== "cssom") return;
      styleScopeRoots.forEach(function(info) {
        if (!info || !info.root || !info.scope) return;
        reconcileAdoptedStyleSheetsForScope(info.root, info.scope);
      });
    }
    function sendCssomFreshSnapshot(reason) {
      if (styleMode !== "cssom" || !streaming) return;
      logger.warn("[DOM Stream] cssom resnapshot", {
        reason: reason || "cssom-style-source-stale"
      });
      safeSend(STREAM.SNAPSHOT, serializeDOM());
    }
    function prepareFrameDocumentClone(frameDoc, bodyClone, cloneToNid) {
      var liveDescendants = frameDoc.body && frameDoc.body.querySelectorAll ? frameDoc.body.querySelectorAll("*") : [];
      var cloneDescendants = bodyClone.querySelectorAll("*");
      var toRemove = [];
      var blockedPairs = [];
      for (var i = 0; i < liveDescendants.length; i++) {
        var live = liveDescendants[i];
        var clone = cloneDescendants[i];
        if (!clone) continue;
        var tag = clone.tagName ? String(clone.tagName).toLowerCase() : "";
        if (wireDroppedWithAncestors(live.parentElement)) {
          reserveNodeId();
          toRemove.push(clone);
          continue;
        }
        var elemDecision = sanitizeForWire("element", { orig: live, clone });
        if (elemDecision && elemDecision.drop) {
          toRemove.push(clone);
          continue;
        }
        if (safeSkipElement(clone) || skipElementWithAncestors(clone)) {
          toRemove.push(clone);
          continue;
        }
        if (blockedWithAncestors(live.parentElement)) continue;
        if (blockMatches(live)) {
          assignNodeId(live, clone, cloneToNid);
          blockedPairs.push({ orig: live, clone });
          continue;
        }
        assignNodeId(live, clone, cloneToNid);
        if (tag === "iframe") {
          prepareIframeWireShell(live, clone);
          continue;
        }
        for (var a = 0; a < URL_ATTRS.length; a++) {
          var attrVal = clone.getAttribute(URL_ATTRS[a]);
          if (attrVal) clone.setAttribute(URL_ATTRS[a], absolutifyUrl(attrVal, frameDoc));
        }
        var srcsetVal = clone.getAttribute("srcset");
        if (srcsetVal) clone.setAttribute("srcset", absolutifySrcset(srcsetVal, frameDoc));
        if (styleMode !== "cssom") captureComputedStyles(live, clone);
        sanitizeForWire("element", { orig: live, clone });
      }
      for (var r = 0; r < toRemove.length; r++) {
        if (toRemove[r].parentNode) toRemove[r].parentNode.removeChild(toRemove[r]);
      }
      for (var b = 0; b < blockedPairs.length; b++) {
        replaceWithBlockPlaceholder(
          blockedPairs[b].orig,
          blockedPairs[b].clone,
          readBlockRect(blockedPairs[b].orig),
          cloneToNid
        );
      }
    }
    function serializeFrameDocument(iframe, frameNid, frameDoc) {
      if (!iframe || !frameNid || !frameDoc || !frameDoc.documentElement || !frameDoc.body) {
        return null;
      }
      var bodyClone = frameDoc.body.cloneNode(true);
      var cloneToNid = /* @__PURE__ */ new Map();
      var htmlNid = ensureNodeId(frameDoc.documentElement);
      var bodyNid = ensureNodeId(frameDoc.body);
      prepareFrameDocumentClone(frameDoc, bodyClone, cloneToNid);
      var subtreeResult = sanitizeForWire("subtree", {
        root: bodyClone,
        liveRoot: frameDoc.body,
        cloneToNid
      });
      if (subtreeResult && subtreeResult.drop) return null;
      var nodeIds = buildNodeIdSidecar(bodyClone, cloneToNid, false);
      var frameShadowRoots = collectShadowRootPayloads(frameDoc.body, nodeIds);
      var nestedFrames = collectFramePayloads(frameDoc.body, cloneToNid);
      var framePayload = {
        frameNid: String(frameNid),
        kind: "same-origin",
        html: bodyClone.innerHTML || "",
        nodeIds,
        shadowRoots: frameShadowRoots,
        htmlNid: htmlNid ? String(htmlNid) : "",
        bodyNid: bodyNid ? String(bodyNid) : "",
        frames: nestedFrames,
        stylesheets: collectStylesheetsFrom(frameDoc),
        inlineStyles: collectInlineStylesFrom(frameDoc),
        htmlAttrs: serializeShellAttributes(frameDoc.documentElement),
        bodyAttrs: serializeShellAttributes(frameDoc.body),
        htmlStyle: collectComputedStyleText(frameDoc.documentElement, SHELL_PROPS),
        bodyStyle: collectComputedStyleText(frameDoc.body, SHELL_PROPS),
        scrollX: frameDoc.defaultView ? frameDoc.defaultView.scrollX : 0,
        scrollY: frameDoc.defaultView ? frameDoc.defaultView.scrollY : 0,
        viewportWidth: frameDoc.defaultView ? frameDoc.defaultView.innerWidth : 0,
        viewportHeight: frameDoc.defaultView ? frameDoc.defaultView.innerHeight : 0,
        pageWidth: frameDoc.documentElement.scrollWidth,
        pageHeight: frameDoc.documentElement.scrollHeight,
        url: frameDoc.location ? String(frameDoc.location.href || "") : "",
        title: frameDoc.title || ""
      };
      if (styleMode === "cssom") {
        var frameCssom = collectCssomStyleSourcesForScope(
          frameDoc,
          { kind: "frame", frameNid: String(frameNid) },
          { root: frameDoc }
        );
        framePayload.styleSources = frameCssom.sources;
        framePayload.styleStrategy = frameCssom.strategy;
      }
      return framePayload;
    }
    function collectFramePayloads(root, cloneToNid, excludedFrameNodeIds) {
      var payloads = [];
      if (!root) return payloads;
      var allowed = null;
      if (cloneToNid && typeof cloneToNid.forEach === "function") {
        allowed = /* @__PURE__ */ new Set();
        cloneToNid.forEach(function(nid) {
          if (nid !== void 0 && nid !== null) allowed.add(String(nid));
        });
      }
      var elements = elementsUnderRoot(root);
      for (var i = 0; i < elements.length; i++) {
        var iframe = elements[i];
        var tag = iframe && iframe.tagName ? String(iframe.tagName).toLowerCase() : "";
        if (tag !== "iframe") continue;
        if (skipElementWithAncestors(iframe) || blockedWithAncestors(iframe) || wireDroppedWithAncestors(iframe)) {
          continue;
        }
        var frameNid = getTrackedNodeId(iframe) || ensureNodeId(iframe);
        if (!frameNid) continue;
        if (allowed && !allowed.has(String(frameNid))) continue;
        if (excludedFrameNodeIds && excludedFrameNodeIds.has(String(frameNid))) continue;
        var classification = classifyFrame(iframe);
        if (classification.kind === "same-origin") {
          var sameOriginPayload = serializeFrameDocument(
            iframe,
            frameNid,
            classification.document
          );
          if (sameOriginPayload) payloads.push(sameOriginPayload);
          continue;
        }
        payloads.push(Object.assign({ frameNid: String(frameNid) }, classification));
      }
      return payloads;
    }
    function registerFrameLoadListener(iframe, frameNid) {
      if (!iframe || !frameNid || typeof iframe.addEventListener !== "function") return;
      var key = String(frameNid);
      var existing = frameLoadListeners.get(key);
      if (existing && existing.iframe === iframe) return;
      if (existing && existing.iframe && typeof existing.iframe.removeEventListener === "function") {
        existing.iframe.removeEventListener("load", existing.handler);
      }
      var handler = function() {
        var classification = classifyFrame(iframe);
        if (classification.kind === "same-origin") {
          registerFrameDocument(iframe, key, classification.document, true);
        } else {
          observedFrameDocuments.delete(key);
        }
      };
      iframe.addEventListener("load", handler);
      frameLoadListeners.set(key, { iframe, handler });
    }
    function registerFrameDocument(iframe, frameNid, frameDoc, emitRefresh) {
      if (!mutationObserver || !iframe || !frameNid || !frameDoc || !frameDoc.body) return null;
      var key = String(frameNid);
      var record = {
        iframe,
        document: frameDoc,
        root: frameDoc,
        frameNid: key
      };
      observedFrameDocuments.set(key, record);
      frameDocumentToNid.set(frameDoc, key);
      addValueListenerRoot(frameDoc);
      registerFrameLoadListener(iframe, key);
      var framePayload = serializeFrameDocument(iframe, key, frameDoc);
      try {
        mutationObserver.observe(frameDoc, mutationObserverOptions());
      } catch (err) {
        logger.warn("[DOM Stream] frame document observe failed", {
          reason: "observe-failed"
        });
        return record;
      }
      observeOpenShadowRoots(frameDoc.body);
      observeSameOriginFrameDocuments(frameDoc.body);
      if (emitRefresh && framePayload) {
        sendMutationDiffs([{
          op: DIFF_OP.FRAME,
          frameNid: key,
          frame: framePayload
        }], { includeStaleFlushCount: false });
      }
      return record;
    }
    function observeSameOriginFrameDocuments(root) {
      var elements = elementsUnderRoot(root);
      for (var i = 0; i < elements.length; i++) {
        var iframe = elements[i];
        var tag = iframe && iframe.tagName ? String(iframe.tagName).toLowerCase() : "";
        if (tag !== "iframe") continue;
        if (skipElementWithAncestors(iframe) || blockedWithAncestors(iframe) || wireDroppedWithAncestors(iframe)) {
          continue;
        }
        var frameNid = getTrackedNodeId(iframe) || ensureNodeId(iframe);
        if (!frameNid) continue;
        var classification = classifyFrame(iframe);
        if (classification.kind === "same-origin") {
          registerFrameDocument(iframe, frameNid, classification.document, false);
        } else {
          registerFrameLoadListener(iframe, frameNid);
        }
      }
    }
    function getMutationFrameRecord(target) {
      if (!target) return null;
      var ownerDoc = target.nodeType === Node.DOCUMENT_NODE ? target : target.ownerDocument;
      if (!ownerDoc) return null;
      var frameNid = frameDocumentToNid.get(ownerDoc);
      if (!frameNid) return null;
      var record = observedFrameDocuments.get(String(frameNid));
      if (!record || record.document !== ownerDoc) return null;
      return record;
    }
    function isInactiveFrameDocumentMutation(target) {
      if (!target) return false;
      var ownerDoc = target.nodeType === Node.DOCUMENT_NODE ? target : target.ownerDocument;
      if (!ownerDoc) return false;
      var frameNid = frameDocumentToNid.get(ownerDoc);
      if (!frameNid) return false;
      var record = observedFrameDocuments.get(String(frameNid));
      return !record || record.document !== ownerDoc;
    }
    function scopeFrameDiff(diff, frameRecord) {
      if (diff && frameRecord && frameRecord.frameNid) {
        diff.frameNid = String(frameRecord.frameNid);
      }
      return diff;
    }
    function isValueControl(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
      var tag = el.tagName ? String(el.tagName).toLowerCase() : "";
      return tag === "input" || tag === "textarea" || tag === "select";
    }
    function selectedOptionValues(select) {
      var values = [];
      var options = select && select.options ? select.options : [];
      for (var i = 0; i < options.length; i++) {
        if (options[i].selected) values.push(String(options[i].value));
      }
      return values;
    }
    function sanitizeInputValue(value, owner) {
      return sanitizeForWire("input", {
        value: value == null ? "" : String(value),
        owner
      }).value;
    }
    function buildValueDiff(control) {
      if (!isValueControl(control)) return null;
      if (skipElementWithAncestors(control) || blockedWithAncestors(control) || wireDroppedWithAncestors(control)) {
        return null;
      }
      var shadowHost = getMutationShadowHost(control);
      if (shadowHost && (skipElementWithAncestors(shadowHost) || blockedWithAncestors(shadowHost) || wireDroppedWithAncestors(shadowHost))) {
        return null;
      }
      var nid = getTrackedNodeId(control);
      if (!nid) return null;
      var tag = control.tagName ? String(control.tagName).toLowerCase() : "";
      var diff = {
        op: DIFF_OP.VALUE,
        nid
      };
      if (tag === "select") {
        diff.value = sanitizeInputValue(control.value, control);
        var selected = selectedOptionValues(control);
        diff.selectedValues = [];
        for (var s = 0; s < selected.length; s++) {
          diff.selectedValues.push(sanitizeInputValue(selected[s], control));
        }
        return diff;
      }
      if (tag === "textarea") {
        diff.value = sanitizeInputValue(control.value, control);
        return diff;
      }
      var inputType = "";
      try {
        inputType = String(control.type || control.getAttribute("type") || "").toLowerCase();
      } catch (err) {
        inputType = String(control.getAttribute && control.getAttribute("type") || "").toLowerCase();
      }
      if (inputType === "checkbox" || inputType === "radio") {
        diff.checked = !!control.checked;
        diff.value = sanitizeInputValue(control.value, control);
        return diff;
      }
      diff.value = sanitizeInputValue(control.value, control);
      return diff;
    }
    function handleValueEvent(event) {
      if (!streaming || !event || !event.target) return;
      var diff = buildValueDiff(event.target);
      if (!diff) return;
      sendMutationDiffs(
        [scopeFrameDiff(diff, getMutationFrameRecord(event.target))],
        { includeStaleFlushCount: false }
      );
    }
    function addValueListenerRoot(root) {
      if (!valueCaptureActive || !root || typeof root.addEventListener !== "function") return;
      if (valueListenerRoots.has(root)) return;
      root.addEventListener("input", handleValueEvent, true);
      root.addEventListener("change", handleValueEvent, true);
      valueListenerRoots.add(root);
      valueListenerRecords.push(root);
    }
    function addValueListenerRootsUnder(root) {
      if (root && (root.nodeType === Node.DOCUMENT_NODE || isOpenShadowRoot(root))) {
        addValueListenerRoot(root);
      }
      var elements = elementsUnderRoot(root);
      for (var i = 0; i < elements.length; i++) {
        if (elements[i].shadowRoot && isOpenShadowRoot(elements[i].shadowRoot)) {
          addValueListenerRootsUnder(elements[i].shadowRoot);
        }
      }
    }
    function startValueCapture() {
      stopValueCapture();
      valueCaptureActive = true;
      addValueListenerRoot(document);
      addValueListenerRootsUnder(document.body);
      observedFrameDocuments.forEach(function(record) {
        if (!record || !record.document) return;
        addValueListenerRoot(record.document);
        addValueListenerRootsUnder(record.document.body);
      });
    }
    function stopValueCapture() {
      for (var i = 0; i < valueListenerRecords.length; i++) {
        var root = valueListenerRecords[i];
        try {
          if (root && typeof root.removeEventListener === "function") {
            root.removeEventListener("input", handleValueEvent, true);
            root.removeEventListener("change", handleValueEvent, true);
          }
        } catch (err) {
          logger.warn("[DOM Stream] value listener cleanup failed", {
            reason: "cleanup-failed"
          });
        }
      }
      valueListenerRecords = [];
      valueListenerRoots = /* @__PURE__ */ new WeakSet();
      valueCaptureActive = false;
    }
    function clearObservedFrameDocuments() {
      frameLoadListeners.forEach(function(record) {
        try {
          if (record && record.iframe && typeof record.iframe.removeEventListener === "function") {
            record.iframe.removeEventListener("load", record.handler);
          }
        } catch (err) {
          logger.warn("[DOM Stream] frame load listener cleanup failed", {
            reason: "cleanup-failed"
          });
        }
      });
      frameLoadListeners.clear();
      observedFrameDocuments.clear();
      frameDocumentToNid = /* @__PURE__ */ new WeakMap();
    }
    function wrapAttachShadow() {
      if (nativeAttachShadow) return;
      var proto = window && window.Element && window.Element.prototype;
      if (!proto || typeof proto.attachShadow !== "function") return;
      attachShadowProto = proto;
      nativeAttachShadow = proto.attachShadow;
      proto.attachShadow = function() {
        var root = nativeAttachShadow.apply(this, arguments);
        try {
          if (isOpenShadowRoot(root)) {
            observeOpenShadowRoot(root);
            if (streaming) {
              var hostNid = ensureNodeId(this);
              var payload = serializeOpenShadowRoot(this, hostNid);
              if (payload) {
                safeSend(STREAM.MUTATIONS, {
                  mutations: [Object.assign({ op: DIFF_OP.SHADOW_ROOT }, payload)],
                  streamSessionId: streamSessionId || "",
                  snapshotId: currentSnapshotId || 0,
                  staleFlushCount
                });
              }
            }
          }
        } catch (err) {
          logger.error("[DOM Stream] attachShadow wrapper failed", err);
        }
        return root;
      };
    }
    function restoreAttachShadow() {
      if (!nativeAttachShadow || !attachShadowProto) return;
      try {
        attachShadowProto.attachShadow = nativeAttachShadow;
      } catch (err) {
        logger.error("[DOM Stream] attachShadow restore failed", err);
      }
      nativeAttachShadow = null;
      attachShadowProto = null;
    }
    function injectDialogInterceptor() {
      if (window.__phantomStreamDisableDialogInterceptor) return;
      if (document.getElementById("fsb-dialog-interceptor")) return;
      var script = document.createElement("script");
      script.id = "fsb-dialog-interceptor";
      script.textContent = "(" + function() {
        var origAlert = window.alert;
        var origConfirm = window.confirm;
        var origPrompt = window.prompt;
        window.alert = function(message) {
          document.dispatchEvent(new CustomEvent("fsb-dialog", {
            detail: { type: "alert", message: String(message || "") }
          }));
          var result = origAlert.call(window, message);
          document.dispatchEvent(new CustomEvent("fsb-dialog-dismiss", {
            detail: { type: "alert" }
          }));
          return result;
        };
        window.confirm = function(message) {
          document.dispatchEvent(new CustomEvent("fsb-dialog", {
            detail: { type: "confirm", message: String(message || "") }
          }));
          var result = origConfirm.call(window, message);
          document.dispatchEvent(new CustomEvent("fsb-dialog-dismiss", {
            detail: { type: "confirm", result }
          }));
          return result;
        };
        window.prompt = function(message, defaultValue) {
          document.dispatchEvent(new CustomEvent("fsb-dialog", {
            detail: { type: "prompt", message: String(message || ""), defaultValue: defaultValue || "" }
          }));
          var result = origPrompt.call(window, message, defaultValue);
          document.dispatchEvent(new CustomEvent("fsb-dialog-dismiss", {
            detail: { type: "prompt", result }
          }));
          return result;
        };
      } + ")();";
      (document.head || document.documentElement).appendChild(script);
    }
    function setupDialogRelay() {
      if (dialogRelayActive) return;
      dialogRelayActive = true;
      document.addEventListener("fsb-dialog", function(e) {
        var detail = e.detail || {};
        safeSend(STREAM.DIALOG, {
          dialog: attachStreamMetadata({
            type: detail.type,
            message: detail.message,
            defaultValue: detail.defaultValue,
            state: "open"
          })
        });
      });
      document.addEventListener("fsb-dialog-dismiss", function(e) {
        var detail = e.detail || {};
        safeSend(STREAM.DIALOG, {
          dialog: attachStreamMetadata({
            type: detail.type,
            result: detail.result,
            state: "closed"
          })
        });
      });
    }
    function compileMaskSelector(raw) {
      if (raw === void 0 || raw === null) return null;
      if (typeof raw !== "string" || raw === "") {
        throw new Error("invalid-mask-selector");
      }
      try {
        document.querySelector(raw);
      } catch (err) {
        throw new Error("invalid-mask-selector");
      }
      return raw;
    }
    function maskTextMatches(el) {
      if (!maskTextSelector) return false;
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
      try {
        return !!(el.closest && el.closest(maskTextSelector));
      } catch (err) {
        logger.error("[DOM Stream] maskTextSelector match failed", err);
        return false;
      }
    }
    function blockMatches(el) {
      if (!blockSelector) return false;
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
      try {
        return !!(el.matches && el.matches(blockSelector));
      } catch (err) {
        logger.error("[DOM Stream] blockSelector match failed", err);
        return false;
      }
    }
    function blockedWithAncestors(el) {
      if (!blockSelector) return false;
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
      try {
        return !!(el.closest && el.closest(blockSelector));
      } catch (err) {
        logger.error("[DOM Stream] blockSelector match failed", err);
        return false;
      }
    }
    function isWireDroppedElement(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
      var tag = el.tagName ? String(el.tagName).toLowerCase() : "";
      return tag === "script" || tag === "noscript" || tag === "object" || tag === "embed";
    }
    function wireDroppedWithAncestors(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
      var node = el;
      while (node && node.nodeType === Node.ELEMENT_NODE) {
        if (isWireDroppedElement(node)) return true;
        node = node.parentElement;
      }
      return false;
    }
    function safeMaskText(text, el) {
      if (maskTextFn) {
        try {
          return String(maskTextFn(String(text), el));
        } catch (err) {
          logger.error("[DOM Stream] maskTextFn failed; default mask applied", err);
          return defaultMaskText(text);
        }
      }
      return defaultMaskText(text);
    }
    function safeMaskInput(text, el) {
      if (maskInputFn) {
        try {
          return String(maskInputFn(String(text), el));
        } catch (err) {
          logger.error("[DOM Stream] maskInputFn failed; default mask applied", err);
          return defaultMaskText(text);
        }
      }
      return defaultMaskText(text);
    }
    function shouldMaskInput(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
      var tag = el.tagName ? String(el.tagName).toLowerCase() : "";
      if (tag === "input") {
        var inputType = "";
        try {
          inputType = String(el.type || el.getAttribute("type") || "").toLowerCase();
        } catch (e) {
          inputType = String(el.getAttribute && el.getAttribute("type") || "").toLowerCase();
        }
        if (inputType === "password") return true;
        return maskInputs;
      }
      if (tag === "textarea" || tag === "select") return maskInputs;
      return false;
    }
    function isOptionUnderMaskedSelect(el) {
      if (!maskInputs || !el || el.nodeType !== Node.ELEMENT_NODE) return false;
      var tag = el.tagName ? String(el.tagName).toLowerCase() : "";
      if (tag !== "option") return false;
      try {
        return !!(el.closest && el.closest("select"));
      } catch (e) {
        return false;
      }
    }
    function maskOptionValue(optionClone, owner) {
      if (!optionClone || !optionClone.hasAttribute || !optionClone.hasAttribute("value")) return;
      if (optionClone._psOptionValueMasked) return;
      optionClone._psOptionValueMasked = true;
      var value = optionClone.getAttribute("value");
      var maskedValue = safeMaskInput(value == null ? "" : value, owner);
      if (maskedValue !== value) {
        optionClone.setAttribute("value", maskedValue);
        sanitizeCounters.maskedInputs++;
      }
    }
    function maskInputCloneValue(clone, owner) {
      if (isOptionUnderMaskedSelect(owner)) {
        maskOptionValue(clone, owner);
        return;
      }
      if (!shouldMaskInput(owner)) return;
      var tag = clone.tagName ? String(clone.tagName).toLowerCase() : "";
      if (tag === "textarea") {
        maskDirectChildText(clone, owner, safeMaskInput, "maskedInputs");
        return;
      }
      if (tag === "select") {
        var cloneOptions = clone.querySelectorAll ? clone.querySelectorAll("option") : [];
        var ownerOptions = owner && owner.querySelectorAll ? owner.querySelectorAll("option") : [];
        for (var o = 0; o < cloneOptions.length; o++) {
          maskOptionValue(cloneOptions[o], ownerOptions[o] || owner);
        }
        return;
      }
      if (clone.hasAttribute && clone.hasAttribute("value")) {
        var value = clone.getAttribute("value");
        var maskedValue = safeMaskInput(value == null ? "" : value, owner);
        if (maskedValue !== value) {
          clone.setAttribute("value", maskedValue);
          sanitizeCounters.maskedInputs++;
        }
      }
    }
    function maskDirectChildText(el, owner, maskFn, counterKey) {
      var child = el.firstChild;
      while (child) {
        if (child.nodeType === Node.TEXT_NODE && child.nodeValue) {
          var maskedValue = maskFn(child.nodeValue, owner);
          if (maskedValue !== child.nodeValue) {
            child.nodeValue = maskedValue;
            sanitizeCounters[counterKey]++;
          }
        }
        child = child.nextSibling;
      }
    }
    function readBlockRect(el) {
      try {
        var rect = el.getBoundingClientRect();
        return {
          width: rect && typeof rect.width === "number" ? rect.width : 0,
          height: rect && typeof rect.height === "number" ? rect.height : 0
        };
      } catch (e) {
        return { width: 0, height: 0 };
      }
    }
    function createBlockPlaceholder(doc, rect) {
      var placeholder = doc.createElement("div");
      placeholder.setAttribute("rr_width", String(rect.width || 0) + "px");
      placeholder.setAttribute("rr_height", String(rect.height || 0) + "px");
      return placeholder;
    }
    function replaceWithBlockPlaceholder(liveEl, cloneEl, rect, cloneToNid) {
      if (!cloneEl || !cloneEl.parentNode) return null;
      var nid = cloneToNid && cloneToNid.get(cloneEl);
      if (!nid) nid = getTrackedNodeId(liveEl) || "";
      var placeholder = createBlockPlaceholder(cloneEl.ownerDocument, rect);
      cloneEl.parentNode.replaceChild(placeholder, cloneEl);
      if (cloneToNid) {
        cloneToNid.delete(cloneEl);
        if (nid) cloneToNid.set(placeholder, nid);
      }
      sanitizeCounters.blockedSubtrees++;
      return placeholder;
    }
    function createTruncatedPlaceholder(doc) {
      var placeholder = doc.createElement("div");
      placeholder.setAttribute("data-phantomstream-truncated", "true");
      return placeholder;
    }
    function deleteCloneSubtreeMappings(cloneEl, cloneToNid) {
      if (!cloneEl || !cloneToNid) return;
      cloneToNid.delete(cloneEl);
      if (!cloneEl.querySelectorAll) return;
      var descendants = cloneEl.querySelectorAll("*");
      for (var i = 0; i < descendants.length; i++) {
        cloneToNid.delete(descendants[i]);
      }
    }
    function replaceWithTruncatedPlaceholder(cloneEl, cloneToNid) {
      if (!cloneEl || !cloneEl.parentNode) return null;
      var nid = cloneToNid && cloneToNid.get(cloneEl);
      if (!nid) return null;
      var placeholder = createTruncatedPlaceholder(cloneEl.ownerDocument);
      cloneEl.parentNode.replaceChild(placeholder, cloneEl);
      deleteCloneSubtreeMappings(cloneEl, cloneToNid);
      cloneToNid.set(placeholder, nid);
      return placeholder;
    }
    function utf8ByteLength(text) {
      var str = String(text || "");
      var bytes = 0;
      for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i);
        if (code < 128) {
          bytes += 1;
        } else if (code < 2048) {
          bytes += 2;
        } else if (code >= 55296 && code <= 56319 && i + 1 < str.length) {
          var next = str.charCodeAt(i + 1);
          if (next >= 56320 && next <= 57343) {
            bytes += 4;
            i++;
          } else {
            bytes += 3;
          }
        } else {
          bytes += 3;
        }
      }
      return bytes;
    }
    function wireByteLength(value) {
      try {
        var json = JSON.stringify(value);
        if (json === void 0) return 0;
        if (typeof TextEncoder !== "undefined") {
          return new TextEncoder().encode(json).byteLength;
        }
        if (typeof Buffer !== "undefined") {
          return Buffer.byteLength(json, "utf8");
        }
        return utf8ByteLength(json);
      } catch (err) {
        return Infinity;
      }
    }
    function sidecarWireLength(value) {
      return wireByteLength(value);
    }
    function findCloneElementByNid(root, cloneToNid, nid) {
      if (!root || !cloneToNid || nid === void 0 || nid === null) return null;
      var key = String(nid);
      var elements = elementsUnderRoot(root);
      for (var i = 0; i < elements.length; i++) {
        if (String(cloneToNid.get(elements[i]) || "") === key) return elements[i];
      }
      return null;
    }
    function markCloneNidTruncated(root, cloneToNid, nid, truncatedNodeIds) {
      var cloneEl = findCloneElementByNid(root, cloneToNid, nid);
      if (!cloneEl) return false;
      var placeholder = replaceWithTruncatedPlaceholder(cloneEl, cloneToNid);
      if (!placeholder) return false;
      var placeholderNid = cloneToNid.get(placeholder) || nid;
      if (placeholderNid && truncatedNodeIds && typeof truncatedNodeIds.add === "function") {
        truncatedNodeIds.add(String(placeholderNid));
      }
      return true;
    }
    function truncatedPayloadForNid(doc, nid) {
      var placeholder = createTruncatedPlaceholder(doc || document);
      return {
        html: placeholder.outerHTML || "",
        nodeIds: nid ? [String(nid)] : [],
        shadowRoots: [],
        frames: [],
        truncated: true,
        missingDescendants: 1
      };
    }
    function pruneSnapshotSidecarsForBudget(basePayload, shadowRoots, frames, clone, cloneToNid, truncatedNodeIds) {
      var base = Object.assign({}, basePayload || {});
      var keptShadowRoots = Array.isArray(shadowRoots) ? shadowRoots.slice() : [];
      var keptFrames = Array.isArray(frames) ? frames.slice() : [];
      var removed = 0;
      function currentWireLength() {
        return wireByteLength(Object.assign({}, base, {
          shadowRoots: keptShadowRoots,
          frames: keptFrames
        }));
      }
      while (currentWireLength() > SNAPSHOT_BUDGET_BYTES && (keptShadowRoots.length || keptFrames.length)) {
        var largestKind = "";
        var largestIndex = -1;
        var largestLength = -1;
        for (var s = 0; s < keptShadowRoots.length; s++) {
          var shadowLength = sidecarWireLength(keptShadowRoots[s]);
          if (shadowLength > largestLength) {
            largestLength = shadowLength;
            largestKind = "shadow";
            largestIndex = s;
          }
        }
        for (var f = 0; f < keptFrames.length; f++) {
          var frameLength = sidecarWireLength(keptFrames[f]);
          if (frameLength > largestLength) {
            largestLength = frameLength;
            largestKind = "frame";
            largestIndex = f;
          }
        }
        var ownerNid = "";
        if (largestKind === "shadow") {
          var removedShadow = keptShadowRoots.splice(largestIndex, 1)[0];
          ownerNid = removedShadow && removedShadow.hostNid;
        } else if (largestKind === "frame") {
          var removedFrame = keptFrames.splice(largestIndex, 1)[0];
          ownerNid = removedFrame && removedFrame.frameNid;
        } else {
          break;
        }
        markCloneNidTruncated(clone, cloneToNid, ownerNid, truncatedNodeIds);
        removed++;
        base.truncated = true;
        base.missingDescendants = (base.missingDescendants || 0) + 1;
        base.html = clone && clone.innerHTML ? clone.innerHTML : base.html;
        base.nodeIds = buildNodeIdSidecar(clone, cloneToNid, false);
      }
      return {
        html: base.html,
        nodeIds: base.nodeIds || [],
        shadowRoots: keptShadowRoots,
        frames: keptFrames,
        truncated: !!base.truncated,
        missingDescendants: base.missingDescendants || 0,
        removed
      };
    }
    function markSnapshotPayloadTruncated(payload) {
      payload.truncated = true;
      return payload;
    }
    function fitSnapshotPayloadForBudget(payload, clone, cloneToNid, truncatedNodeIds) {
      var next = Object.assign({}, payload || {}, {
        nodeIds: Array.isArray(payload && payload.nodeIds) ? payload.nodeIds.slice() : [],
        shadowRoots: Array.isArray(payload && payload.shadowRoots) ? payload.shadowRoots.slice() : [],
        frames: Array.isArray(payload && payload.frames) ? payload.frames.slice() : [],
        stylesheets: Array.isArray(payload && payload.stylesheets) ? payload.stylesheets.slice() : [],
        inlineStyles: Array.isArray(payload && payload.inlineStyles) ? payload.inlineStyles.slice() : [],
        htmlAttrs: Object.assign({}, payload && payload.htmlAttrs ? payload.htmlAttrs : {}),
        bodyAttrs: Object.assign({}, payload && payload.bodyAttrs ? payload.bodyAttrs : {})
      });
      while (wireByteLength(next) > SNAPSHOT_BUDGET_BYTES && next.inlineStyles.length) {
        next.inlineStyles.pop();
        markSnapshotPayloadTruncated(next);
      }
      while (wireByteLength(next) > SNAPSHOT_BUDGET_BYTES && next.stylesheets.length) {
        next.stylesheets.pop();
        markSnapshotPayloadTruncated(next);
      }
      if (wireByteLength(next) > SNAPSHOT_BUDGET_BYTES && next.htmlStyle) {
        next.htmlStyle = "";
        markSnapshotPayloadTruncated(next);
      }
      if (wireByteLength(next) > SNAPSHOT_BUDGET_BYTES && next.bodyStyle) {
        next.bodyStyle = "";
        markSnapshotPayloadTruncated(next);
      }
      if (wireByteLength(next) > SNAPSHOT_BUDGET_BYTES && Object.keys(next.htmlAttrs).length) {
        next.htmlAttrs = {};
        markSnapshotPayloadTruncated(next);
      }
      if (wireByteLength(next) > SNAPSHOT_BUDGET_BYTES && Object.keys(next.bodyAttrs).length) {
        next.bodyAttrs = {};
        markSnapshotPayloadTruncated(next);
      }
      if (wireByteLength(next) > SNAPSHOT_BUDGET_BYTES && next.title) {
        next.title = "";
        markSnapshotPayloadTruncated(next);
      }
      if (wireByteLength(next) > SNAPSHOT_BUDGET_BYTES && next.url) {
        next.url = "";
        markSnapshotPayloadTruncated(next);
      }
      if (wireByteLength(next) > SNAPSHOT_BUDGET_BYTES && clone && cloneToNid) {
        var cloneEls = cloneElementsWithNodeIds(clone, cloneToNid);
        for (var i = cloneEls.length - 1; i >= 0 && wireByteLength(next) > SNAPSHOT_BUDGET_BYTES; i--) {
          var nid = cloneToNid.get(cloneEls[i]);
          if (markCloneNidTruncated(clone, cloneToNid, nid, truncatedNodeIds)) {
            next.html = clone.innerHTML || "";
            next.nodeIds = buildNodeIdSidecar(clone, cloneToNid, false);
            next.shadowRoots = collectShadowRootPayloads(document.body, next.nodeIds, truncatedNodeIds);
            next.frames = collectFramePayloads(document.body, cloneToNid, truncatedNodeIds);
            next.missingDescendants = (next.missingDescendants || 0) + 1;
            markSnapshotPayloadTruncated(next);
          }
        }
      }
      if (wireByteLength(next) > RELAY_PER_MESSAGE_LIMIT_BYTES) {
        next.html = "";
        next.nodeIds = [];
        next.shadowRoots = [];
        next.frames = [];
        next.inlineStyles = [];
        next.stylesheets = [];
        next.htmlAttrs = {};
        next.bodyAttrs = {};
        next.htmlStyle = "";
        next.bodyStyle = "";
        next.title = "";
        next.url = "";
        next.missingDescendants = (next.missingDescendants || 0) + 1;
        markSnapshotPayloadTruncated(next);
      }
      return next;
    }
    function sanitizeCountersSnapshot() {
      return {
        strippedHandlers: sanitizeCounters.strippedHandlers,
        blockedUrlSchemes: sanitizeCounters.blockedUrlSchemes,
        blockedSubtrees: sanitizeCounters.blockedSubtrees,
        cssScrubs: sanitizeCounters.cssScrubs,
        maskedTextNodes: sanitizeCounters.maskedTextNodes,
        maskedInputs: sanitizeCounters.maskedInputs
      };
    }
    function warnIfSanitizeStrips(before) {
      var after = sanitizeCountersSnapshot();
      var moved = false;
      for (var key in after) {
        if (Object.prototype.hasOwnProperty.call(after, key) && after[key] !== before[key]) {
          moved = true;
          break;
        }
      }
      if (moved) {
        logger.warn("[DOM Stream] sanitization strips", after);
      }
    }
    function sanitizeForWire(kind, payload) {
      if (kind === "element") {
        var clone = payload.clone;
        if (!clone || clone.nodeType !== Node.ELEMENT_NODE) return {};
        var tag = clone.tagName ? String(clone.tagName).toLowerCase() : "";
        if (tag === "script" || tag === "noscript") {
          return { drop: true };
        }
        if (tag === "object" || tag === "embed") {
          sanitizeCounters.blockedSubtrees++;
          return { drop: true };
        }
        var attrNames = [];
        var attrList = clone.attributes;
        if (attrList) {
          for (var i = 0; i < attrList.length; i++) {
            if (attrList[i] && attrList[i].name) attrNames.push(attrList[i].name);
          }
        }
        for (var n = 0; n < attrNames.length; n++) {
          var rawName = attrNames[n];
          var lowName = String(rawName).toLowerCase();
          if (lowName.indexOf("on") === 0) {
            clone.removeAttribute(rawName);
            sanitizeCounters.strippedHandlers++;
            continue;
          }
          if (lowName === "srcdoc") {
            clone.removeAttribute(rawName);
            sanitizeCounters.blockedSubtrees++;
          }
        }
        for (var u = 0; u < URL_ATTRS.length; u++) {
          var urlVal = clone.getAttribute(URL_ATTRS[u]);
          if (urlVal && hasDangerousScheme(urlVal)) {
            clone.removeAttribute(URL_ATTRS[u]);
            sanitizeCounters.blockedUrlSchemes++;
          }
        }
        var formactionVal = clone.getAttribute("formaction");
        if (formactionVal && hasDangerousScheme(formactionVal)) {
          clone.removeAttribute("formaction");
          sanitizeCounters.blockedUrlSchemes++;
        }
        try {
          var xlinkVal = clone.getAttributeNS("http://www.w3.org/1999/xlink", "href");
          if (xlinkVal && hasDangerousScheme(xlinkVal)) {
            clone.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
            sanitizeCounters.blockedUrlSchemes++;
          }
        } catch (e) {
        }
        var srcsetVal = clone.getAttribute("srcset");
        if (srcsetVal) {
          var scrubbedSrcset = scrubSrcset(srcsetVal);
          if (scrubbedSrcset !== srcsetVal) {
            clone.setAttribute("srcset", scrubbedSrcset);
            sanitizeCounters.blockedUrlSchemes++;
          }
        }
        var styleVal = clone.getAttribute("style");
        if (styleVal) {
          var scrubbedStyle = scrubCssText(styleVal);
          if (scrubbedStyle !== styleVal) {
            clone.setAttribute("style", scrubbedStyle);
            sanitizeCounters.cssScrubs++;
          }
        }
        if (tag === "style") {
          var styleElText = clone.textContent;
          if (styleElText) {
            var scrubbedElText = scrubCssText(styleElText);
            if (scrubbedElText !== styleElText) {
              clone.textContent = scrubbedElText;
              sanitizeCounters.cssScrubs++;
            }
          }
        }
        if (!clone._psMasked) {
          clone._psMasked = true;
          if (payload.orig) {
            maskInputCloneValue(clone, payload.orig);
          }
          if (payload.orig && maskTextMatches(payload.orig)) {
            maskDirectChildText(clone, payload.orig, safeMaskText, "maskedTextNodes");
          }
        }
        return {};
      }
      if (kind === "subtree") {
        var root = payload.root;
        if (!root || root.nodeType !== Node.ELEMENT_NODE) return {};
        var rootResult = sanitizeForWire("element", { orig: payload.liveRoot, clone: root });
        if (rootResult && rootResult.drop) {
          return { drop: true };
        }
        var liveDescendants = payload.liveRoot && payload.liveRoot.querySelectorAll ? payload.liveRoot.querySelectorAll("*") : [];
        var descendants = root.querySelectorAll("*");
        for (var d = 0; d < descendants.length; d++) {
          var desc = descendants[d];
          var liveDesc = liveDescendants[d] || null;
          if (!root.contains(desc)) continue;
          if (liveDesc && wireDroppedWithAncestors(liveDesc.parentElement)) continue;
          if (liveDesc && blockedWithAncestors(liveDesc.parentElement)) continue;
          if (liveDesc && blockMatches(liveDesc)) {
            replaceWithBlockPlaceholder(liveDesc, desc, readBlockRect(liveDesc), payload.cloneToNid);
            continue;
          }
          var descResult = sanitizeForWire("element", { orig: liveDesc, clone: desc });
          if (descResult && descResult.drop && desc.parentNode) {
            desc.parentNode.removeChild(desc);
          }
        }
        return {};
      }
      if (kind === "attr") {
        var attrName = String(payload.name || "").toLowerCase();
        if (attrName.indexOf("on") === 0) {
          sanitizeCounters.strippedHandlers++;
          return { drop: true };
        }
        if (attrName === "srcdoc") {
          sanitizeCounters.blockedSubtrees++;
          return { drop: true };
        }
        if (attrName === "style") {
          var scrubbedAttrCss = scrubCssText(payload.value);
          if (scrubbedAttrCss !== payload.value) {
            sanitizeCounters.cssScrubs++;
          }
          return { value: scrubbedAttrCss };
        }
        if (attrName === "srcset" && payload.value) {
          var scrubbedAttrSrcset = scrubSrcset(payload.value);
          if (scrubbedAttrSrcset !== payload.value) {
            sanitizeCounters.blockedUrlSchemes++;
          }
          return { value: scrubbedAttrSrcset };
        }
        if ((URL_ATTRS.indexOf(attrName) !== -1 || attrName === "formaction" || attrName === "xlink:href") && payload.value && hasDangerousScheme(payload.value)) {
          sanitizeCounters.blockedUrlSchemes++;
          return { value: null };
        }
        if (attrName === "value" && (shouldMaskInput(payload.target) || isOptionUnderMaskedSelect(payload.target))) {
          var maskedAttrValue = safeMaskInput(payload.value == null ? "" : payload.value, payload.target);
          if (maskedAttrValue !== payload.value) {
            sanitizeCounters.maskedInputs++;
          }
          return { value: maskedAttrValue };
        }
        return { value: payload.value };
      }
      if (kind === "text") {
        if (shouldMaskInput(payload.owner)) {
          var maskedInputText = safeMaskInput(payload.text == null ? "" : payload.text, payload.owner);
          if (maskedInputText !== payload.text) {
            sanitizeCounters.maskedInputs++;
          }
          return { text: maskedInputText };
        }
        if (maskTextMatches(payload.owner)) {
          var maskedOpText = safeMaskText(payload.text, payload.owner);
          if (maskedOpText !== payload.text) {
            sanitizeCounters.maskedTextNodes++;
          }
          return { text: maskedOpText };
        }
        return { text: payload.text };
      }
      if (kind === "input") {
        var inputValue = payload.value == null ? "" : String(payload.value);
        if (shouldMaskInput(payload.owner)) {
          var maskedValue = safeMaskInput(inputValue, payload.owner);
          if (maskedValue !== inputValue) {
            sanitizeCounters.maskedInputs++;
          }
          return { value: maskedValue };
        }
        return { value: inputValue };
      }
      if (kind === "css") {
        var scrubbedCss = scrubCssText(payload.css);
        if (scrubbedCss !== payload.css) {
          sanitizeCounters.cssScrubs++;
        }
        return { css: scrubbedCss };
      }
      return {};
    }
    function absolutifyUrl(val, baseDoc) {
      if (!val || val.startsWith("data:") || val.startsWith("blob:") || val.startsWith("javascript:")) {
        return val;
      }
      try {
        var base = baseDoc && baseDoc.baseURI ? baseDoc.baseURI : document.baseURI;
        return new URL(val, base).href;
      } catch (e) {
        return val;
      }
    }
    function absolutifySrcset(srcset, baseDoc) {
      if (!srcset) return srcset;
      var candidates = parseSrcsetCandidates(srcset);
      if (!candidates.length) return srcset;
      return candidates.map(function(candidate) {
        return formatSrcsetCandidate({
          url: absolutifyUrl(candidate.url, baseDoc),
          descriptor: candidate.descriptor
        });
      }).join(", ");
    }
    function collectComputedStyleText(original, props) {
      try {
        var view = original && original.ownerDocument && original.ownerDocument.defaultView ? original.ownerDocument.defaultView : window;
        var computed = view.getComputedStyle(original);
        var styles = [];
        var styleProps = props || CURATED_PROPS;
        for (var i = 0; i < styleProps.length; i++) {
          var prop = styleProps[i];
          var val = computed.getPropertyValue(prop);
          if (!val || val === "") continue;
          if (STYLE_DEFAULTS[prop] === val) continue;
          if (val === "0px" || val === "normal" || val === "none" || val === "auto" || val === "0s" || val === "0px 0px") {
            if (!STYLE_DEFAULTS[prop]) continue;
          }
          styles.push(prop + ":" + val);
        }
        return styles.join(";");
      } catch (e) {
        return "";
      }
    }
    function captureComputedStyles(original, clone) {
      var styleText = collectComputedStyleText(original, CURATED_PROPS);
      if (styleText) {
        clone.setAttribute("style", styleText);
      }
    }
    function collectSubtreeComputedStyles(root) {
      var styles = /* @__PURE__ */ new WeakMap();
      if (!root || root.nodeType !== Node.ELEMENT_NODE) return styles;
      var liveElements = [root];
      if (root.querySelectorAll) {
        var descendants = root.querySelectorAll("*");
        for (var i = 0; i < descendants.length; i++) liveElements.push(descendants[i]);
      }
      for (var e = 0; e < liveElements.length; e++) {
        var styleText = collectComputedStyleText(liveElements[e], CURATED_PROPS);
        if (styleText) styles.set(liveElements[e], styleText);
      }
      return styles;
    }
    function serializeShellAttributes(el) {
      var attrs = {};
      if (!el || !el.attributes) return attrs;
      for (var i = 0; i < el.attributes.length; i++) {
        var attr = el.attributes[i];
        if (!attr || !attr.name) continue;
        var name = String(attr.name).toLowerCase();
        if (name === "style" || name.indexOf("on") === 0) continue;
        attrs[name] = String(attr.value || "");
      }
      return attrs;
    }
    function serializeDOM() {
      var sanBefore = sanitizeCountersSnapshot();
      var clone = document.body.cloneNode(true);
      var cloneToNid = /* @__PURE__ */ new Map();
      var origWalker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        null
      );
      var cloneWalker = document.createTreeWalker(
        clone,
        NodeFilter.SHOW_ELEMENT,
        null
      );
      var pairs = [];
      var origEl = origWalker.nextNode();
      var cloneEl = cloneWalker.nextNode();
      while (origEl && cloneEl) {
        pairs.push({ orig: origEl, clone: cloneEl });
        origEl = origWalker.nextNode();
        cloneEl = cloneWalker.nextNode();
      }
      var toRemove = [];
      var blockedPairs = [];
      for (var i = 0; i < pairs.length; i++) {
        var orig = pairs[i].orig;
        var cl = pairs[i].clone;
        var tag = cl.tagName ? cl.tagName.toLowerCase() : "";
        if (wireDroppedWithAncestors(orig.parentElement)) {
          reserveNodeId();
          continue;
        }
        var elemDecision = sanitizeForWire("element", { orig, clone: cl });
        if (elemDecision && elemDecision.drop) {
          toRemove.push(cl);
          continue;
        }
        if (safeSkipElement(cl)) {
          toRemove.push(cl);
          continue;
        }
        if (skipElementWithAncestors(cl)) {
          continue;
        }
        if (blockedWithAncestors(orig.parentElement)) {
          continue;
        }
        if (blockMatches(orig)) {
          assignNodeId(orig, cl, cloneToNid);
          blockedPairs.push({ orig, clone: cl });
          continue;
        }
        if (tag === "iframe") {
          assignNodeId(orig, cl, cloneToNid);
          prepareIframeWireShell(orig, cl);
          continue;
        }
        var nid = assignNodeId(orig, cl, cloneToNid);
        if (tag === "canvas") {
          try {
            var dataUrl = orig.toDataURL("image/png");
            var img = clone.ownerDocument.createElement("img");
            img.src = dataUrl;
            img.setAttribute("style", "width:" + (orig.width || 300) + "px;height:" + (orig.height || 150) + "px;");
            if (cl.parentNode) {
              cl.parentNode.replaceChild(img, cl);
              cloneToNid.delete(cl);
              if (nid) cloneToNid.set(img, nid);
            }
          } catch (e) {
          }
          continue;
        }
        for (var a = 0; a < URL_ATTRS.length; a++) {
          var attrVal = cl.getAttribute(URL_ATTRS[a]);
          if (attrVal) {
            cl.setAttribute(URL_ATTRS[a], absolutifyUrl(attrVal));
          }
        }
        try {
          var xlinkHref = cl.getAttributeNS("http://www.w3.org/1999/xlink", "href");
          if (xlinkHref) {
            cl.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", absolutifyUrl(xlinkHref));
          }
        } catch (e) {
        }
        var srcsetVal = cl.getAttribute("srcset");
        if (srcsetVal) {
          cl.setAttribute("srcset", absolutifySrcset(srcsetVal));
        }
        if (styleMode !== "cssom") captureComputedStyles(orig, cl);
        sanitizeForWire("element", { orig, clone: cl });
      }
      var blockedRects = [];
      for (var bp = 0; bp < blockedPairs.length; bp++) {
        blockedRects.push(readBlockRect(blockedPairs[bp].orig));
      }
      for (var r = 0; r < toRemove.length; r++) {
        if (toRemove[r].parentNode) {
          toRemove[r].parentNode.removeChild(toRemove[r]);
        }
      }
      for (var br = 0; br < blockedPairs.length; br++) {
        replaceWithBlockPlaceholder(blockedPairs[br].orig, blockedPairs[br].clone, blockedRects[br], cloneToNid);
      }
      var stylesheets = collectStylesheetsFrom(document);
      var inlineStyles = collectInlineStylesFrom(document);
      var documentCssom = styleMode === "cssom" ? collectCssomStyleSourcesForScope(document, { kind: "document" }, { root: document }) : null;
      var html = clone.innerHTML;
      var truncated = false;
      var missingDescendants = 0;
      var truncatedNodeIds = /* @__PURE__ */ new Set();
      var topByNid = /* @__PURE__ */ new Map();
      try {
        var walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_ELEMENT,
          {
            acceptNode: function(el) {
              return getTrackedNodeId(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
            }
          }
        );
        var liveEl;
        while (liveEl = walker.nextNode()) {
          var liveNid = getTrackedNodeId(liveEl);
          if (liveNid) {
            topByNid.set(liveNid, liveEl.getBoundingClientRect().top);
          }
        }
      } catch (e) {
      }
      if (wireByteLength(html) > SNAPSHOT_BUDGET_BYTES) {
        truncated = true;
        var viewportCutoff = window.innerHeight * TRUNCATION_VIEWPORT_MULTIPLIER;
        var cloneEls1 = cloneElementsWithNodeIds(clone, cloneToNid);
        for (var t = cloneEls1.length - 1; t >= 0; t--) {
          var nidVal1 = cloneToNid.get(cloneEls1[t]);
          var top1 = topByNid.get(nidVal1);
          if (typeof top1 === "number" && top1 > viewportCutoff) {
            var placeholder1 = replaceWithTruncatedPlaceholder(cloneEls1[t], cloneToNid);
            if (placeholder1) {
              var placeholderNid1 = cloneToNid.get(placeholder1);
              if (placeholderNid1) truncatedNodeIds.add(String(placeholderNid1));
              missingDescendants++;
            }
          }
        }
        html = clone.innerHTML;
        if (wireByteLength(html) > SNAPSHOT_BUDGET_BYTES) {
          var cloneEls2 = cloneElementsWithNodeIds(clone, cloneToNid);
          for (var u = cloneEls2.length - 1; u >= 0 && wireByteLength(clone.innerHTML) > SNAPSHOT_BUDGET_BYTES; u--) {
            var placeholder2 = replaceWithTruncatedPlaceholder(cloneEls2[u], cloneToNid);
            if (placeholder2) {
              var placeholderNid2 = cloneToNid.get(placeholder2);
              if (placeholderNid2) truncatedNodeIds.add(String(placeholderNid2));
              missingDescendants++;
            }
          }
          html = clone.innerHTML;
        }
      }
      html = clone.innerHTML;
      warnIfSanitizeStrips(sanBefore);
      var nodeIds = buildNodeIdSidecar(clone, cloneToNid, false);
      var shadowRoots = collectShadowRootPayloads(document.body, nodeIds, truncatedNodeIds);
      var frames = collectFramePayloads(document.body, cloneToNid, truncatedNodeIds);
      var budgetInput = {
        html,
        nodeIds,
        truncated,
        missingDescendants,
        stylesheets,
        inlineStyles,
        htmlAttrs: serializeShellAttributes(document.documentElement),
        bodyAttrs: serializeShellAttributes(document.body),
        htmlStyle: collectComputedStyleText(document.documentElement, SHELL_PROPS),
        bodyStyle: collectComputedStyleText(document.body, SHELL_PROPS),
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        pageWidth: document.documentElement.scrollWidth,
        pageHeight: document.documentElement.scrollHeight,
        url: location.href,
        title: document.title,
        streamSessionId: streamSessionId || "",
        snapshotId: currentSnapshotId || 0
      };
      if (documentCssom) {
        budgetInput.styleSources = documentCssom.sources;
        budgetInput.styleStrategy = documentCssom.strategy;
      }
      var budgetedSidecars = pruneSnapshotSidecarsForBudget(
        budgetInput,
        shadowRoots,
        frames,
        clone,
        cloneToNid,
        truncatedNodeIds
      );
      html = budgetedSidecars.html;
      nodeIds = budgetedSidecars.nodeIds;
      shadowRoots = budgetedSidecars.shadowRoots;
      frames = budgetedSidecars.frames;
      truncated = budgetedSidecars.truncated;
      missingDescendants = budgetedSidecars.missingDescendants;
      var snapshotPayload = {
        html,
        nodeIds,
        shadowRoots,
        frames,
        truncated,
        missingDescendants,
        stylesheets,
        inlineStyles,
        htmlAttrs: serializeShellAttributes(document.documentElement),
        bodyAttrs: serializeShellAttributes(document.body),
        htmlStyle: collectComputedStyleText(document.documentElement, SHELL_PROPS),
        bodyStyle: collectComputedStyleText(document.body, SHELL_PROPS),
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        pageWidth: document.documentElement.scrollWidth,
        pageHeight: document.documentElement.scrollHeight,
        url: location.href,
        title: document.title,
        streamSessionId: streamSessionId || "",
        snapshotId: currentSnapshotId || 0
      };
      if (documentCssom) {
        snapshotPayload.styleSources = documentCssom.sources;
        snapshotPayload.styleStrategy = documentCssom.strategy;
      }
      return fitSnapshotPayloadForBudget(snapshotPayload, clone, cloneToNid, truncatedNodeIds);
    }
    function processAddedNode(el) {
      if (el.nodeType !== Node.ELEMENT_NODE) return null;
      if (wireDroppedWithAncestors(el)) {
        reserveNodeId();
        if (isWireDroppedElement(el)) sanitizeCounters.blockedSubtrees++;
        return null;
      }
      var rootNid = ensureNodeId(el);
      if (blockMatches(el)) {
        var blockedRootPlaceholder = createBlockPlaceholder(
          document,
          readBlockRect(el)
        );
        sanitizeCounters.blockedSubtrees++;
        return {
          html: blockedRootPlaceholder.outerHTML || "",
          nodeIds: rootNid ? [rootNid] : []
        };
      }
      var computedStyles = styleMode === "cssom" ? /* @__PURE__ */ new WeakMap() : collectSubtreeComputedStyles(el);
      var rootTag = el.tagName ? String(el.tagName).toLowerCase() : "";
      var baseDoc = el.ownerDocument || document;
      for (var a = 0; a < URL_ATTRS.length; a++) {
        if (rootTag === "iframe" && URL_ATTRS[a] === "src") continue;
        var val = el.getAttribute(URL_ATTRS[a]);
        if (val) el.setAttribute(URL_ATTRS[a], absolutifyUrl(val, baseDoc));
      }
      var srcset = el.getAttribute("srcset");
      if (srcset) el.setAttribute("srcset", absolutifySrcset(srcset, baseDoc));
      var descendants = el.querySelectorAll("*");
      for (var d = 0; d < descendants.length; d++) {
        var desc = descendants[d];
        if (wireDroppedWithAncestors(desc)) {
          reserveNodeId();
          continue;
        }
        if (blockedWithAncestors(desc.parentElement)) continue;
        ensureNodeId(desc);
        if (blockMatches(desc)) continue;
        var descTag = desc.tagName ? String(desc.tagName).toLowerCase() : "";
        var descDoc = desc.ownerDocument || baseDoc;
        for (var b = 0; b < URL_ATTRS.length; b++) {
          if (descTag === "iframe" && URL_ATTRS[b] === "src") continue;
          var dv = desc.getAttribute(URL_ATTRS[b]);
          if (dv) desc.setAttribute(URL_ATTRS[b], absolutifyUrl(dv, descDoc));
        }
        var ds = desc.getAttribute("srcset");
        if (ds) desc.setAttribute("srcset", absolutifySrcset(ds, descDoc));
      }
      var wireClone = el.cloneNode(true);
      var cloneToNid = /* @__PURE__ */ new Map();
      if (rootNid) cloneToNid.set(wireClone, rootNid);
      var rootStyleText = computedStyles.get(el);
      if (rootStyleText) appendStyleDeclaration(wireClone, rootStyleText);
      var liveDescendants = el.querySelectorAll("*");
      var cloneDescendants = wireClone.querySelectorAll("*");
      for (var c = 0; c < liveDescendants.length; c++) {
        var liveNid = getTrackedNodeId(liveDescendants[c]);
        if (liveNid && cloneDescendants[c]) cloneToNid.set(cloneDescendants[c], liveNid);
        var descStyleText = computedStyles.get(liveDescendants[c]);
        if (descStyleText && cloneDescendants[c]) {
          appendStyleDeclaration(cloneDescendants[c], descStyleText);
        }
      }
      prepareIframeWireShellsForClone(el, wireClone);
      var subtreeResult = sanitizeForWire("subtree", {
        root: wireClone,
        liveRoot: el,
        cloneToNid
      });
      if (subtreeResult && subtreeResult.drop) return null;
      var nodeIds = buildNodeIdSidecar(wireClone, cloneToNid, true);
      var shadowRoots = collectShadowRootPayloads(el, nodeIds);
      var frames = collectFramePayloads(el, cloneToNid);
      var addedResult = {
        html: wireClone.outerHTML || "",
        nodeIds,
        shadowRoots,
        frames
      };
      if (styleMode === "cssom") {
        addedResult.styleSources = [];
        addedResult.styleStrategy = buildStyleStrategy("cssom", []);
      }
      return addedResult;
    }
    function contentFreeSubtreeStatus(status) {
      return {
        status,
        nodeIds: [],
        shadowRoots: [],
        frames: []
      };
    }
    function serializeRequestedSubtree(nid) {
      var key = String(nid || "");
      if (!key) return contentFreeSubtreeStatus("untracked");
      var el = nidToElement.get(key);
      if (!el || el.nodeType !== Node.ELEMENT_NODE) {
        return contentFreeSubtreeStatus("untracked");
      }
      if (el.isConnected === false) {
        return contentFreeSubtreeStatus("gone");
      }
      if (getTrackedNodeId(el) !== key) {
        return contentFreeSubtreeStatus("untracked");
      }
      if (skipElementWithAncestors(el)) {
        return contentFreeSubtreeStatus("skipped");
      }
      if (blockedWithAncestors(el)) {
        return contentFreeSubtreeStatus("blocked");
      }
      if (wireDroppedWithAncestors(el)) {
        return contentFreeSubtreeStatus("blocked");
      }
      var sanBefore = sanitizeCountersSnapshot();
      var payload = processAddedNode(el);
      warnIfSanitizeStrips(sanBefore);
      if (!payload) {
        return contentFreeSubtreeStatus("blocked");
      }
      return {
        status: "ok",
        html: payload.html || "",
        nodeIds: payload.nodeIds || [],
        shadowRoots: payload.shadowRoots || [],
        frames: payload.frames || []
      };
    }
    function isCurrentControlPayload(payload) {
      if (!payload) return false;
      if (!streamSessionId || !currentSnapshotId) return false;
      if (String(payload.streamSessionId || "") !== String(streamSessionId)) return false;
      if (String(payload.snapshotId || "") !== String(currentSnapshotId)) return false;
      return true;
    }
    function sendSubtreeResponse(request, result) {
      var response = Object.assign({
        requestId: request && request.requestId != null ? String(request.requestId) : "",
        nid: request && request.nid != null ? String(request.nid) : "",
        status: result.status || "untracked",
        streamSessionId: streamSessionId || "",
        snapshotId: currentSnapshotId || 0
      }, result);
      if (response.status === "ok" && wireByteLength(response) > RELAY_PER_MESSAGE_LIMIT_BYTES) {
        response = Object.assign({
          requestId: request && request.requestId != null ? String(request.requestId) : "",
          nid: request && request.nid != null ? String(request.nid) : "",
          streamSessionId: streamSessionId || "",
          snapshotId: currentSnapshotId || 0
        }, contentFreeSubtreeStatus("too-large"));
      }
      safeSend(STREAM.SUBTREE_RESPONSE, response);
    }
    function handleControl(type, payload) {
      if (type !== CONTROL.SUBTREE_REQUEST) return;
      var request = payload || {};
      if (!isCurrentControlPayload(request)) {
        sendSubtreeResponse(request, contentFreeSubtreeStatus("stale"));
        return;
      }
      sendSubtreeResponse(request, serializeRequestedSubtree(request.nid));
    }
    function processMutationBatch(mutations) {
      var diffs = [];
      var removedRoots = [];
      var shadowHosts = /* @__PURE__ */ new Map();
      var textOpNids = {};
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        var frameRecord = getMutationFrameRecord(m.target);
        if (!frameRecord && isInactiveFrameDocumentMutation(m.target)) continue;
        if (m.target && m.target.nodeType === Node.ELEMENT_NODE && (skipElementWithAncestors(m.target) || blockedWithAncestors(m.target) || wireDroppedWithAncestors(m.target))) {
          continue;
        }
        if (m.target && m.target.nodeType === Node.TEXT_NODE && m.target.parentElement && (skipElementWithAncestors(m.target.parentElement) || blockedWithAncestors(m.target.parentElement) || wireDroppedWithAncestors(m.target.parentElement))) {
          continue;
        }
        var shadowHost = getMutationShadowHost(m.target);
        if (shadowHost) {
          if (skipElementWithAncestors(shadowHost) || blockedWithAncestors(shadowHost) || wireDroppedWithAncestors(shadowHost)) {
            continue;
          }
          var shadowHostNid = getTrackedNodeId(shadowHost) || ensureNodeId(shadowHost);
          if (shadowHostNid) {
            shadowHosts.set(String(shadowHostNid), {
              host: shadowHost,
              frameRecord
            });
          }
          continue;
        }
        if (m.type === "childList") {
          if (styleMode === "cssom" && m.target && m.target.nodeType === Node.ELEMENT_NODE) {
            var childListTag = m.target.tagName ? String(m.target.tagName).toLowerCase() : "";
            if (childListTag === "style") markStyleOwnerDirty(m.target, "style-text-mutated");
          }
          var sawBareTextNode = false;
          for (var a = 0; a < m.addedNodes.length; a++) {
            var added = m.addedNodes[a];
            if (added.nodeType === Node.ELEMENT_NODE) {
              if (skipElementWithAncestors(added)) continue;
              if (wireDroppedWithAncestors(added.parentElement)) continue;
              if (blockedWithAncestors(added.parentElement)) continue;
              var parentNid = getTrackedNodeId(m.target);
              if (!parentNid) continue;
              var addedPayload = processAddedNode(added);
              if (!addedPayload || !addedPayload.html) continue;
              observeOpenShadowRoots(added);
              observeSameOriginFrameDocuments(added);
              var nextSib = added.nextElementSibling;
              var beforeNid = getTrackedNodeId(nextSib);
              var addDiff = scopeFrameDiff({
                op: "add",
                parentNid,
                html: addedPayload.html,
                beforeNid,
                nodeIds: addedPayload.nodeIds,
                shadowRoots: addedPayload.shadowRoots || [],
                frames: addedPayload.frames || []
              }, frameRecord);
              diffs.push(boundMutationDiffForBudget(addDiff));
            } else if (added.nodeType === Node.TEXT_NODE || added.nodeType === Node.CDATA_SECTION_NODE) {
              sawBareTextNode = true;
            }
          }
          for (var r = 0; r < m.removedNodes.length; r++) {
            var removed = m.removedNodes[r];
            if (removed.nodeType === Node.ELEMENT_NODE) {
              if (wireDroppedWithAncestors(removed)) continue;
              var nid = getTrackedNodeId(removed);
              if (!nid) continue;
              diffs.push(scopeFrameDiff({ op: "rm", nid }, frameRecord));
              removedRoots.push(removed);
            } else if (removed.nodeType === Node.TEXT_NODE || removed.nodeType === Node.CDATA_SECTION_NODE) {
              sawBareTextNode = true;
            }
          }
          if (sawBareTextNode && !m.target.firstElementChild) {
            var textTargetNid = getTrackedNodeId(m.target);
            if (textTargetNid && !textOpNids[textTargetNid]) {
              textOpNids[textTargetNid] = true;
              var e2TextResult = sanitizeForWire("text", {
                text: m.target.textContent,
                owner: m.target
              });
              diffs.push(scopeFrameDiff({
                op: "text",
                nid: textTargetNid,
                text: e2TextResult.text
              }, frameRecord));
            }
          }
        } else if (m.type === "attributes") {
          var attrName = String(m.attributeName || "");
          var attrNameLower = attrName.toLowerCase();
          var attrTargetTag = m.target && m.target.tagName ? String(m.target.tagName).toLowerCase() : "";
          if (styleMode === "cssom" && attrTargetTag === "link" && (attrNameLower === "href" || attrNameLower === "media" || attrNameLower === "disabled")) {
            markStyleOwnerDirty(m.target, "link-attr-mutated");
          }
          var targetNid = getTrackedNodeId(m.target);
          if (!targetNid) continue;
          if (attrTargetTag === "iframe" && attrNameLower === "src") {
            registerFrameLoadListener(m.target, targetNid);
            continue;
          }
          var attrVal = m.target.getAttribute(m.attributeName);
          if (URL_ATTRS.indexOf(m.attributeName) !== -1 && attrVal) {
            attrVal = absolutifyUrl(attrVal, m.target.ownerDocument);
          }
          if (m.attributeName === "srcset" && attrVal) {
            attrVal = absolutifySrcset(attrVal, m.target.ownerDocument);
          }
          var attrResult = sanitizeForWire("attr", {
            name: m.attributeName,
            value: attrVal,
            target: m.target
          });
          if (attrResult.drop) continue;
          diffs.push(scopeFrameDiff({
            op: "attr",
            nid: targetNid,
            attr: m.attributeName,
            val: attrResult.value
          }, frameRecord));
        } else if (m.type === "characterData") {
          var parentEl = m.target.parentElement;
          if (styleMode === "cssom" && parentEl && parentEl.tagName && String(parentEl.tagName).toLowerCase() === "style") {
            markStyleOwnerDirty(parentEl, "style-text-mutated");
          }
          var textNid = getTrackedNodeId(parentEl);
          if (!textNid) continue;
          var textResult = sanitizeForWire("text", {
            text: m.target.textContent,
            owner: parentEl
          });
          diffs.push(scopeFrameDiff({
            op: "text",
            nid: textNid,
            text: textResult.text
          }, frameRecord));
        }
      }
      shadowHosts.forEach(function(entry, hostNid) {
        var host = entry && entry.host ? entry.host : entry;
        var payload = serializeOpenShadowRoot(host, hostNid);
        if (!payload) return;
        diffs.push(scopeFrameDiff(
          Object.assign({ op: DIFF_OP.SHADOW_ROOT }, payload),
          entry && entry.frameRecord ? entry.frameRecord : null
        ));
      });
      for (var rr = 0; rr < removedRoots.length; rr++) {
        if (!removedRoots[rr].isConnected) {
          forgetSubtreeIdentity(removedRoots[rr]);
        }
      }
      return diffs;
    }
    function mutationPayloadForBudget(diffs, options) {
      var opts = options || {};
      var payload = {
        mutations: diffs || [],
        streamSessionId: streamSessionId || "",
        snapshotId: currentSnapshotId || 0
      };
      if (opts.includeStaleFlushCount !== false) {
        payload.staleFlushCount = staleFlushCount;
      }
      return payload;
    }
    function firstPayloadNodeId(nodeIds) {
      if (!Array.isArray(nodeIds)) return "";
      for (var i = 0; i < nodeIds.length; i++) {
        if (nodeIds[i] !== void 0 && nodeIds[i] !== null && String(nodeIds[i]) !== "") {
          return String(nodeIds[i]);
        }
      }
      return "";
    }
    function boundedAddPlaceholder(diff) {
      var rootNid = Array.isArray(diff.nodeIds) && diff.nodeIds.length ? diff.nodeIds[0] : "";
      if (!rootNid) return null;
      var bounded = Object.assign({
        op: DIFF_OP.ADD,
        parentNid: diff.parentNid || "",
        beforeNid: diff.beforeNid || ""
      }, truncatedPayloadForNid(document, rootNid));
      if (diff.frameNid) bounded.frameNid = diff.frameNid;
      return bounded;
    }
    function boundedFramePlaceholder(diff) {
      var frame = diff && diff.frame ? diff.frame : {};
      var frameNid = String(diff && diff.frameNid || frame.frameNid || "");
      if (!frameNid) return null;
      var rootNid = firstPayloadNodeId(frame.nodeIds) || String(frame.bodyNid || frame.htmlNid || "");
      if (!rootNid) return null;
      var placeholder = truncatedPayloadForNid(document, rootNid);
      var boundedFrame = {
        frameNid,
        kind: "same-origin",
        html: placeholder.html || "",
        nodeIds: placeholder.nodeIds || [],
        shadowRoots: [],
        htmlNid: frame.htmlNid ? String(frame.htmlNid) : "",
        bodyNid: frame.bodyNid ? String(frame.bodyNid) : "",
        frames: [],
        stylesheets: [],
        inlineStyles: [],
        htmlAttrs: {},
        bodyAttrs: {},
        htmlStyle: "",
        bodyStyle: "",
        scrollX: frame.scrollX || 0,
        scrollY: frame.scrollY || 0,
        viewportWidth: frame.viewportWidth || 0,
        viewportHeight: frame.viewportHeight || 0,
        pageWidth: frame.pageWidth || 0,
        pageHeight: frame.pageHeight || 0,
        url: "",
        title: "",
        truncated: true,
        missingDescendants: (frame.missingDescendants || 0) + 1
      };
      return { op: DIFF_OP.FRAME, frameNid, frame: boundedFrame };
    }
    function boundedShadowRootPlaceholder(diff) {
      var hostNid = String(diff && diff.hostNid || "");
      var rootNid = firstPayloadNodeId(diff && diff.nodeIds);
      if (!hostNid || !rootNid) return null;
      var placeholder = truncatedPayloadForNid(document, rootNid);
      var bounded = {
        op: DIFF_OP.SHADOW_ROOT,
        hostNid,
        mode: diff.mode || "open",
        html: placeholder.html || "",
        nodeIds: placeholder.nodeIds || [],
        slotAssignment: diff.slotAssignment || "none",
        truncated: true,
        missingDescendants: (diff.missingDescendants || 0) + 1
      };
      if (diff.frameNid) bounded.frameNid = diff.frameNid;
      return bounded;
    }
    function boundMutationDiffForBudget(diff, options) {
      if (!diff) return null;
      if (wireByteLength(mutationPayloadForBudget([diff], options)) <= RELAY_PER_MESSAGE_LIMIT_BYTES) return diff;
      var bounded = null;
      if (diff.op === DIFF_OP.ADD) bounded = boundedAddPlaceholder(diff);
      if (diff.op === DIFF_OP.FRAME) bounded = boundedFramePlaceholder(diff);
      if (diff.op === DIFF_OP.SHADOW_ROOT) bounded = boundedShadowRootPlaceholder(diff);
      if (!bounded) return null;
      return wireByteLength(mutationPayloadForBudget([bounded], options)) <= RELAY_PER_MESSAGE_LIMIT_BYTES ? bounded : null;
    }
    function sendMutationDiffs(diffs, options) {
      var chunk = [];
      for (var i = 0; i < diffs.length; i++) {
        var originalDiff = diffs[i];
        var diff = boundMutationDiffForBudget(originalDiff, options);
        if (!diff) {
          if (originalDiff) {
            logger.warn("[DOM Stream] mutation diff dropped over budget", {
              op: originalDiff && originalDiff.op ? originalDiff.op : ""
            });
          }
          continue;
        }
        var singlePayload = mutationPayloadForBudget([diff], options);
        if (wireByteLength(singlePayload) > RELAY_PER_MESSAGE_LIMIT_BYTES) {
          logger.warn("[DOM Stream] mutation diff dropped over budget", {
            op: diff && diff.op ? diff.op : ""
          });
          continue;
        }
        var nextChunk = chunk.concat([diff]);
        if (chunk.length && wireByteLength(mutationPayloadForBudget(nextChunk, options)) > RELAY_PER_MESSAGE_LIMIT_BYTES) {
          safeSend(STREAM.MUTATIONS, mutationPayloadForBudget(chunk, options));
          chunk = [diff];
        } else {
          chunk = nextChunk;
        }
      }
      if (chunk.length) {
        safeSend(STREAM.MUTATIONS, mutationPayloadForBudget(chunk, options));
      }
    }
    function flushMutations() {
      batchTimer = null;
      if (pendingMutations.length === 0 && pendingStyleSourceChanges.size === 0) return;
      var batch = pendingMutations;
      pendingMutations = [];
      var sanBefore = sanitizeCountersSnapshot();
      var diffs = [];
      flushingMutations = true;
      try {
        diffs = processMutationBatch(batch);
        reconcileAllKnownStyleScopes();
        diffs = diffs.concat(drainPendingStyleSourceDiffs());
      } finally {
        flushingMutations = false;
      }
      warnIfSanitizeStrips(sanBefore);
      if (diffs.length === 0) return;
      sendMutationDiffs(diffs);
      lastDrainTs = Date.now();
      staleFlushCount = 0;
    }
    function startMutationStream() {
      if (mutationObserver) {
        mutationObserver.disconnect();
      }
      pendingMutations = [];
      observedShadowRoots = /* @__PURE__ */ new WeakSet();
      clearObservedFrameDocuments();
      mutationObserver = new MutationObserver(function(mutations) {
        for (var i = 0; i < mutations.length; i++) {
          pendingMutations.push(mutations[i]);
        }
        scheduleMutationFlush();
      });
      mutationObserver.observe(document.body, mutationObserverOptions());
      if (styleMode === "cssom" && document.head) {
        try {
          mutationObserver.observe(document.head, mutationObserverOptions());
        } catch (err) {
          logger.warn("[DOM Stream] cssom hook unavailable", { reason: "cssom-hook-unavailable" });
        }
      }
      observeOpenShadowRoots(document.body);
      observeSameOriginFrameDocuments(document.body);
      wrapAttachShadow();
      patchCssStyleSheetMethods();
      lastDrainTs = Date.now();
      if (watchdogTimer) clearTimeout(watchdogTimer);
      var watchdogTick = function() {
        try {
          if (pendingMutations.length > 0 && Date.now() - lastDrainTs > MUTATION_STALE_THRESHOLD_MS) {
            staleFlushCount++;
            if (batchTimer) {
              cancelAnimationFrame(batchTimer);
              batchTimer = null;
            }
            flushMutations();
          }
        } catch (e) {
        }
        watchdogTimer = setTimeout(watchdogTick, WATCHDOG_TICK_MS);
      };
      watchdogTimer = setTimeout(watchdogTick, WATCHDOG_TICK_MS);
      logger.info("[DOM Stream] MutationObserver started");
    }
    function stopMutationStream() {
      stopValueCapture();
      if (batchTimer) {
        cancelAnimationFrame(batchTimer);
        batchTimer = null;
      }
      if (watchdogTimer) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
      }
      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
      }
      observedShadowRoots = /* @__PURE__ */ new WeakSet();
      restoreAttachShadow();
      restoreCssStyleSheetMethods();
      if (pendingMutations.length > 0) {
        var batch = pendingMutations;
        pendingMutations = [];
        var sanBefore = sanitizeCountersSnapshot();
        flushingMutations = true;
        var diffs = [];
        try {
          diffs = processMutationBatch(batch);
          reconcileAllKnownStyleScopes();
          diffs = diffs.concat(drainPendingStyleSourceDiffs());
        } finally {
          flushingMutations = false;
        }
        warnIfSanitizeStrips(sanBefore);
        if (diffs.length > 0) {
          sendMutationDiffs(diffs, { includeStaleFlushCount: false });
        }
      }
      clearObservedFrameDocuments();
      logger.info("[DOM Stream] MutationObserver stopped");
    }
    function startScrollTracker() {
      if (scrollHandler) {
        window.removeEventListener("scroll", scrollHandler);
      }
      lastScrollSend = 0;
      scrollHandler = function() {
        var now = Date.now();
        if (now - lastScrollSend < SCROLL_THROTTLE_MS) return;
        lastScrollSend = now;
        safeSend(STREAM.SCROLL, {
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          streamSessionId: streamSessionId || "",
          snapshotId: currentSnapshotId || 0
        });
      };
      window.addEventListener("scroll", scrollHandler, { passive: true });
      logger.info("[DOM Stream] Scroll tracker started");
    }
    function stopScrollTracker() {
      if (scrollHandler) {
        window.removeEventListener("scroll", scrollHandler);
        scrollHandler = null;
      }
      logger.info("[DOM Stream] Scroll tracker stopped");
    }
    function broadcastOverlayState(force) {
      var now = Date.now();
      if (!force && now - lastOverlayBroadcast < OVERLAY_THROTTLE_MS) return;
      lastOverlayBroadcast = now;
      var payload = {};
      try {
        if (overlayProvider) {
          var state = overlayProvider();
          if (state) {
            for (var key in state) {
              if (Object.prototype.hasOwnProperty.call(state, key)) {
                payload[key] = state[key];
              }
            }
          }
        }
      } catch (e) {
        payload = {};
      }
      payload.glow = payload.glow || null;
      payload.progress = payload.progress || null;
      payload.streamSessionId = streamSessionId || "";
      payload.snapshotId = currentSnapshotId || 0;
      safeSend(STREAM.OVERLAY, payload);
    }
    function start() {
      logger.info("[DOM Stream] Start requested");
      injectDialogInterceptor();
      setupDialogRelay();
      if (streaming) {
        stopMutationStream();
        stopScrollTracker();
      }
      beginStreamSession();
      clearNodeMirror();
      nextNodeId = 1;
      var snapshot = serializeDOM();
      safeSend(STREAM.SNAPSHOT, snapshot);
      startMutationStream();
      startValueCapture();
      startScrollTracker();
      streaming = true;
      broadcastOverlayState(true);
    }
    function stop() {
      logger.info("[DOM Stream] Stop requested");
      stopMutationStream();
      stopScrollTracker();
      streaming = false;
      clearNodeMirror();
      safeFlush();
    }
    function pause() {
      logger.info("[DOM Stream] Pause requested");
      stopMutationStream();
      stopScrollTracker();
    }
    function resume() {
      logger.info("[DOM Stream] Resume requested");
      startMutationStream();
      startValueCapture();
      startScrollTracker();
      streaming = true;
    }
    function getNodeId(element) {
      if (!streaming) return null;
      if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;
      if (element.isConnected === false && !getMutationFrameRecord(element)) return null;
      return getTrackedNodeId(element);
    }
    function getObservedFrameDocuments() {
      if (!streaming) return [];
      var roots = [];
      observedFrameDocuments.forEach(function(record) {
        if (!record || !record.document) return;
        roots.push({
          iframe: record.iframe,
          document: record.document,
          root: record.root || record.document,
          frameNid: record.frameNid
        });
      });
      return roots;
    }
    safeSend(STREAM.READY, {});
    logger.info("[DOM Stream] Module loaded");
    return {
      start,
      stop,
      pause,
      resume,
      handleControl,
      getNodeId,
      getObservedFrameDocuments
    };
  }

  // node_modules/@full-self-browsing/phantom-stream/src/protocol/remote-control.js
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

  // extension/content/phantom-stream-capture-entry.js
  globalThis.FSBPhantomStreamCapture = Object.freeze({
    createCapture,
    protocol: Object.freeze({
      CONTROL,
      DIFF_OP,
      READY_PROBE_BUDGET_MS,
      READY_PROBE_INTERVAL_MS,
      STREAM
    })
  });
})();
