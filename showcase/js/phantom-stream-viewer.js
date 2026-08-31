(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/@full-self-browsing/phantom-stream/src/renderer/sanitize.js
  var DROP_TAGS = { script: true, noscript: true, object: true, embed: true };
  var URL_ATTRS = {
    href: true,
    src: true,
    action: true,
    formaction: true,
    poster: true,
    data: true,
    "xlink:href": true
  };
  function hasDangerousScheme(value) {
    var probe;
    try {
      probe = String(value == null ? "" : value).replace(/[\u0000-\u0020]+/g, "").toLowerCase();
    } catch (e) {
      return true;
    }
    return probe.indexOf("javascript:") === 0 || probe.indexOf("vbscript:") === 0 || probe.indexOf("data:text/html") === 0;
  }
  function parseSrcsetCandidates(srcset) {
    var raw = String(srcset == null ? "" : srcset);
    var out = [];
    var i = 0;
    while (i < raw.length) {
      while (i < raw.length && /[\s,]/.test(raw.charAt(i))) i++;
      var urlStart = i;
      var tokenSoFar = raw.slice(urlStart);
      var isData = tokenSoFar.slice(0, 5).toLowerCase() === "data:";
      var isAbsolute = /^[a-z][a-z0-9+.\-]*:\/\//i.test(tokenSoFar);
      while (i < raw.length && !/\s/.test(raw.charAt(i)) && (isData || isAbsolute || raw.charAt(i) !== ",")) {
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
  function neutralizeSrcset(value) {
    var raw = String(value == null ? "" : value);
    var kept = [];
    var blocked = 0;
    var candidates = parseSrcsetCandidates(raw);
    for (var i = 0; i < candidates.length; i++) {
      if (hasDangerousScheme(candidates[i].url)) {
        blocked += 1;
        continue;
      }
      kept.push(formatSrcsetCandidate(candidates[i]));
    }
    return { value: kept.join(", "), blocked };
  }
  function scrubCssText(css) {
    var input = String(css == null ? "" : css);
    try {
      var out = input;
      out = out.replace(
        /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'][^)]*))?\s*\)/gi,
        function(match, dq, sq, bare) {
          var inner = dq !== void 0 ? dq : sq !== void 0 ? sq : bare || "";
          var probe = String(inner || "").replace(/[\u0000-\u0020]+/g, "").toLowerCase();
          var scheme = /^([a-z][a-z0-9+.-]*):/.exec(probe);
          if (!scheme) return match;
          if (scheme[1] === "http" || scheme[1] === "https") return match;
          if (scheme[1] === "data" && probe.indexOf("data:image/") === 0) return match;
          return "url(about:blank)";
        }
      );
      out = out.replace(/expression\s*\(/gi, "blocked(");
      out = out.replace(/-moz-binding/gi, "blocked-binding");
      out = out.replace(/@import\b(\s*(?:url\(\s*)?['"]?\s*)([^'");\s]*)/gi, function(match, lead, target) {
        var probe = String(target || "").replace(/[\u0000-\u0020]+/g, "").toLowerCase();
        if (probe.indexOf("http:") === 0 || probe.indexOf("https:") === 0) return match;
        return "@import-blocked" + lead + "about:blank";
      });
      out = out.replace(/<\/style/gi, "<\\/style");
      return out;
    } catch (e) {
      return input;
    }
  }
  function sanitizeAttrValue(name, value) {
    var n;
    var v;
    try {
      n = String(name == null ? "" : name).toLowerCase();
      v = String(value == null ? "" : value);
    } catch (e) {
      return { drop: true, value: "" };
    }
    if (n.indexOf("on") === 0) return { drop: true, value: "" };
    if (n === "srcdoc") return { drop: true, value: "" };
    if (URL_ATTRS[n] === true) {
      if (hasDangerousScheme(v)) return { drop: false, value: null };
      return { drop: false, value: v };
    }
    if (n === "srcset") {
      var rebuilt = neutralizeSrcset(v);
      return { drop: false, value: rebuilt.blocked > 0 ? rebuilt.value : v };
    }
    if (n === "style") {
      return { drop: false, value: scrubCssText(v) };
    }
    return { drop: false, value: v };
  }
  function sanitizeFragment(root, counters, logger) {
    if (!root || !root.ownerDocument) return;
    var tallies = counters || {
      strippedHandlers: 0,
      blockedUrls: 0,
      droppedSubtrees: 0,
      cssScrubs: 0
    };
    var log = logger && typeof logger.warn === "function" ? logger : { warn: function() {
    } };
    var before = {
      strippedHandlers: tallies.strippedHandlers,
      blockedUrls: tallies.blockedUrls,
      droppedSubtrees: tallies.droppedSubtrees,
      cssScrubs: tallies.cssScrubs
    };
    var elements = [];
    try {
      if (root.nodeType === 1) elements.push(root);
      var walker = root.ownerDocument.createTreeWalker(root, 1, null);
      var node = walker.nextNode();
      while (node) {
        elements.push(node);
        node = walker.nextNode();
      }
    } catch (e) {
      log.warn("[Renderer] sanitization walk failed", {
        error: e && e.message ? e.message : String(e)
      });
      return;
    }
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      try {
        if (el !== root && !root.contains(el)) continue;
        var tag = el.tagName ? String(el.tagName).toLowerCase() : "";
        if (DROP_TAGS[tag] === true) {
          if (el.parentNode) el.parentNode.removeChild(el);
          tallies.droppedSubtrees += 1;
          continue;
        }
        if (tag === "style") {
          var styleText = el.textContent || "";
          var scrubbedStyleText = scrubCssText(styleText);
          if (scrubbedStyleText !== styleText) {
            el.textContent = scrubbedStyleText;
            tallies.cssScrubs += 1;
          }
        }
        var names = [];
        var attrs = el.attributes;
        for (var a = 0; a < attrs.length; a++) names.push(attrs[a].name);
        for (var x = 0; x < names.length; x++) {
          var name = names[x];
          var lower = String(name).toLowerCase();
          if (lower.indexOf("on") === 0) {
            el.removeAttribute(name);
            tallies.strippedHandlers += 1;
            continue;
          }
          if (lower === "srcdoc") {
            el.removeAttribute(name);
            tallies.strippedHandlers += 1;
            continue;
          }
          if (URL_ATTRS[lower] === true) {
            var attrNode = el.getAttributeNode(name);
            if (attrNode && hasDangerousScheme(attrNode.value)) {
              el.removeAttributeNode(attrNode);
              tallies.blockedUrls += 1;
            }
            continue;
          }
          if (lower === "srcset") {
            var rebuilt = neutralizeSrcset(el.getAttribute(name));
            if (rebuilt.blocked > 0) {
              el.setAttribute(name, rebuilt.value);
              tallies.blockedUrls += rebuilt.blocked;
            }
            continue;
          }
          if (lower === "style") {
            var styleVal = el.getAttribute(name);
            var scrubbed = scrubCssText(styleVal);
            if (scrubbed !== styleVal) {
              el.setAttribute(name, scrubbed);
              tallies.cssScrubs += 1;
            }
            continue;
          }
        }
      } catch (e) {
        log.warn("[Renderer] sanitization element scrub failed", {
          error: e && e.message ? e.message : String(e)
        });
      }
    }
    var strippedHandlers = tallies.strippedHandlers - before.strippedHandlers;
    var blockedUrls = tallies.blockedUrls - before.blockedUrls;
    var droppedSubtrees = tallies.droppedSubtrees - before.droppedSubtrees;
    var cssScrubs = tallies.cssScrubs - before.cssScrubs;
    if (strippedHandlers || blockedUrls || droppedSubtrees || cssScrubs) {
      log.warn("[Renderer] sanitization strips", {
        strippedHandlers,
        blockedUrls,
        droppedSubtrees,
        cssScrubs
      });
    }
  }

  // node_modules/@full-self-browsing/phantom-stream/src/renderer/snapshot.js
  function findTagEnd(html, from) {
    var quote = null;
    for (var i = from; i < html.length; i++) {
      var ch = html.charAt(i);
      if (quote !== null) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }
      if (ch === ">") return i;
    }
    return -1;
  }
  function findMatchingCloseTag(html, from, tagName) {
    var openRe = new RegExp("<" + tagName + "\\b", "gi");
    var closeRe = new RegExp("</" + tagName + "\\s*>", "gi");
    var depth = 0;
    var i = from;
    while (i < html.length) {
      openRe.lastIndex = i;
      closeRe.lastIndex = i;
      var openM = openRe.exec(html);
      var closeM = closeRe.exec(html);
      if (!closeM) return -1;
      if (openM && openM.index < closeM.index) {
        var openTagEnd = findTagEnd(html, openM.index + openM[0].length);
        if (openTagEnd === -1) return -1;
        var isSelfClosing = html.charAt(openTagEnd - 1) === "/";
        if (!isSelfClosing) depth++;
        i = openTagEnd + 1;
        continue;
      }
      if (depth === 0) {
        return closeM.index + closeM[0].length;
      }
      depth--;
      i = closeM.index + closeM[0].length;
    }
    return -1;
  }
  function attrsBlobIsUnreliable(attrs) {
    if (typeof attrs !== "string" || attrs.indexOf("`") === -1) return false;
    var backticks = 0;
    for (var i = 0; i < attrs.length; i++) {
      if (attrs.charAt(i) === "`") backticks++;
    }
    return backticks % 2 === 1;
  }
  var IMG_OPEN_RE = /<img\b/gi;
  var VIDEO_OPEN_RE = /<video\b/gi;
  var AUDIO_OPEN_RE = /<audio\b/gi;
  var SOURCE_OPEN_RE = /<source\b/gi;
  var PLACEHOLDER_MARKER = "<div data-ps-asset-unavailable=";
  function readTagAttr(attrs, name) {
    var re = new RegExp(name + `\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
    var m = re.exec(attrs);
    if (!m) return null;
    return m[1] != null ? m[1] : m[2] != null ? m[2] : m[3] != null ? m[3] : "";
  }
  function stripTagAttr(attrs, name) {
    return attrs.replace(
      new RegExp("\\s" + name + `\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'>]+)`, "gi"),
      ""
    );
  }
  function setTagAttr(attrs, name, value) {
    var cleaned = stripTagAttr(attrs, name);
    return cleaned + " " + name + '="' + escapeAttribute(value) + '"';
  }
  function assetUnavailablePlaceholderTag(attrs) {
    var w = readTagAttr(attrs, "rr_width") || readTagAttr(attrs, "width") || "";
    var h = readTagAttr(attrs, "rr_height") || readTagAttr(attrs, "height") || "";
    var out = PLACEHOLDER_MARKER + '"blocked-origin"';
    if (w) out += ' rr_width="' + escapeAttribute(w) + '"';
    if (h) out += ' rr_height="' + escapeAttribute(h) + '"';
    out += "></div>";
    return out;
  }
  function srcsetHasBlockedCandidate(srcset, gate) {
    if (!srcset) return false;
    try {
      var candidates = parseSrcsetCandidates(srcset);
      for (var i = 0; i < candidates.length; i++) {
        var url = candidates[i].url;
        if (!url) continue;
        var verdict = gate(url, "image");
        if (!verdict || !verdict.allow) return true;
      }
      return false;
    } catch (e) {
      return true;
    }
  }
  function gateOneImgTag(attrs, gate) {
    if (attrsBlobIsUnreliable(attrs)) {
      return assetUnavailablePlaceholderTag(attrs);
    }
    var pinned = readTagAttr(attrs, "data-ps-currentsrc");
    var src = readTagAttr(attrs, "src");
    var srcset = readTagAttr(attrs, "srcset");
    var nextAttrs = attrs;
    var effective = src;
    if (pinned) {
      effective = pinned;
      nextAttrs = setTagAttr(nextAttrs, "src", pinned);
      nextAttrs = stripTagAttr(nextAttrs, "srcset");
      nextAttrs = stripTagAttr(nextAttrs, "sizes");
      nextAttrs = stripTagAttr(nextAttrs, "data-ps-currentsrc");
      srcset = null;
    }
    if (effective) {
      var verdict = gate(effective, "image");
      if (!verdict || !verdict.allow) {
        return assetUnavailablePlaceholderTag(attrs);
      }
    }
    if (srcset && srcsetHasBlockedCandidate(srcset, gate)) {
      if (!effective) return assetUnavailablePlaceholderTag(attrs);
      nextAttrs = stripTagAttr(nextAttrs, "srcset");
    }
    return "<img" + nextAttrs + ">";
  }
  function gateOneMediaTag(tagName, attrs, gate) {
    if (attrsBlobIsUnreliable(attrs)) {
      return assetUnavailablePlaceholderTag(attrs);
    }
    var nextAttrs = attrs;
    var src = readTagAttr(attrs, "src");
    var srcAllowed = false;
    if (src) {
      var srcVerdict = gate(src, tagName === "source" ? "source" : "media");
      if (!srcVerdict || !srcVerdict.allow) {
        if (srcVerdict && srcVerdict.reason === "poster-mode-media") {
          nextAttrs = stripTagAttr(nextAttrs, "src");
        } else {
          return assetUnavailablePlaceholderTag(attrs);
        }
      } else {
        srcAllowed = true;
      }
    }
    if (tagName === "source") {
      var srcset = readTagAttr(attrs, "srcset");
      if (srcset && srcsetHasBlockedCandidate(srcset, gate)) {
        if (!srcAllowed) return assetUnavailablePlaceholderTag(attrs);
        nextAttrs = stripTagAttr(nextAttrs, "srcset");
      }
    }
    if (tagName === "video") {
      var poster = readTagAttr(attrs, "poster");
      if (poster) {
        var posterVerdict = gate(poster, "poster");
        if (!posterVerdict || !posterVerdict.allow) {
          return assetUnavailablePlaceholderTag(attrs);
        }
      }
    }
    return "<" + tagName + nextSelfClose(nextAttrs);
  }
  function nextSelfClose(attrs) {
    return attrs + ">";
  }
  function gateSnapshotAssets(html, gate) {
    if (typeof html !== "string" || !html) return html;
    if (typeof gate !== "function") return html;
    var out = "";
    var cursor = 0;
    while (cursor < html.length) {
      var next = nextAssetOpener(html, cursor);
      if (!next) {
        break;
      }
      var tagStart = next.index;
      var attrsStart = next.attrsStart;
      out += html.slice(cursor, tagStart);
      var tagEnd = findTagEnd(html, attrsStart);
      if (tagEnd === -1) {
        out += assetUnavailablePlaceholderTag(html.slice(attrsStart));
        cursor = html.length;
        break;
      }
      var attrs = html.slice(attrsStart, tagEnd);
      if (next.tag === "img") {
        out += gateOneImgTag(attrs, gate);
        cursor = tagEnd + 1;
      } else {
        var replacement = gateOneMediaTag(next.tag, attrs, gate);
        out += replacement;
        var wasNeutralized = replacement.indexOf(PLACEHOLDER_MARKER) === 0;
        var selfClosed = html.charAt(tagEnd - 1) === "/";
        var isContainer = next.tag === "video" || next.tag === "audio";
        if (wasNeutralized && isContainer && !selfClosed) {
          var closeEnd = findMatchingCloseTag(html, tagEnd + 1, next.tag);
          cursor = closeEnd === -1 ? tagEnd + 1 : closeEnd;
        } else {
          cursor = tagEnd + 1;
        }
      }
    }
    out += html.slice(cursor);
    return out;
  }
  function nextAssetOpener(html, from) {
    var best = null;
    var specs = [
      { re: IMG_OPEN_RE, tag: "img" },
      { re: VIDEO_OPEN_RE, tag: "video" },
      { re: AUDIO_OPEN_RE, tag: "audio" },
      { re: SOURCE_OPEN_RE, tag: "source" }
    ];
    for (var i = 0; i < specs.length; i++) {
      var re = specs[i].re;
      re.lastIndex = from;
      var m = re.exec(html);
      if (m && (best === null || m.index < best.index)) {
        best = { index: m.index, attrsStart: re.lastIndex, tag: specs[i].tag };
      }
    }
    return best;
  }
  var CSP_META = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https: data:; media-src http: https: data: blob:; style-src http: https: 'unsafe-inline'; font-src http: https: data:">`;
  function hasDangerousStylesheetUrl(value) {
    if (!value || typeof value !== "string") return false;
    var compact = value.replace(/[\u0000-\u0020]+/g, "").toLowerCase();
    return compact.indexOf("javascript:") === 0 || compact.indexOf("vbscript:") === 0 || compact.indexOf("data:text/html") === 0;
  }
  function escapeStyleSourceId(value) {
    return escapeAttribute(value);
  }
  function styleSourceTagsForDocument(styleSources) {
    var sources = Array.isArray(styleSources) ? styleSources.slice() : [];
    sources.sort(function(a, b) {
      return (a && typeof a.order === "number" ? a.order : 0) - (b && typeof b.order === "number" ? b.order : 0);
    });
    return sources.filter(function(source) {
      return source && source.scope && source.scope.kind === "document";
    }).map(function(source) {
      var sourceId = escapeStyleSourceId(source.sourceId || "");
      if (source.href && !hasDangerousStylesheetUrl(source.href)) {
        return '<link rel="stylesheet" data-ps-style-source-id="' + sourceId + '" href="' + String(source.href).replace(/"/g, "&quot;") + '">';
      }
      return '<style data-ps-style-source-id="' + sourceId + '">' + scrubCssText(source.cssText || "") + "</style>";
    }).join("\n");
  }
  function escapeAttribute(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function buildShellAttributeString(attrs, styleText) {
    var parts = [];
    if (attrs && typeof attrs === "object") {
      Object.keys(attrs).forEach(function(rawName) {
        var name = String(rawName || "").toLowerCase();
        if (!/^[a-z][a-z0-9_:.~-]*$/.test(name)) return;
        if (name === "style" || name.indexOf("on") === 0) return;
        var value = attrs[rawName];
        if (value === void 0 || value === null) return;
        parts.push(name + '="' + escapeAttribute(value) + '"');
      });
    }
    var style = scrubCssText(String(styleText || "")).trim();
    if (style) parts.push('style="' + escapeAttribute(style) + '"');
    return parts.length ? " " + parts.join(" ") : "";
  }
  function buildSnapshotHtml(payload) {
    var p = payload || {};
    var stylesheetLinks = (p.stylesheets || []).filter(function(url) {
      return !hasDangerousStylesheetUrl(url);
    }).map(function(url) {
      return '<link rel="stylesheet" href="' + url.replace(/"/g, "&quot;") + '">';
    }).join("\n");
    var inlineStyleTags = (p.inlineStyles || []).map(function(css) {
      return "<style>" + scrubCssText(css) + "</style>";
    }).join("\n");
    var cssomStyleTags = styleSourceTagsForDocument(p.styleSources || []);
    var htmlAttrs = buildShellAttributeString(p.htmlAttrs, p.htmlStyle);
    var bodyAttrs = buildShellAttributeString(p.bodyAttrs, p.bodyStyle);
    return "<!DOCTYPE html><html" + htmlAttrs + "><head>" + CSP_META + '<meta name="referrer" content="no-referrer"><meta charset="UTF-8"><meta name="viewport" content="width=' + (parseInt(p.viewportWidth, 10) || 1920) + '">' + stylesheetLinks + inlineStyleTags + cssomStyleTags + "<style>body { margin: 0; overflow: hidden; } *::selection { background: transparent; } ::-webkit-scrollbar { display: none; }</style></head><body" + bodyAttrs + ">" + (p.html || "") + "</body></html>";
  }
  function buildFramePlaceholderHtml(frame) {
    var f = frame || {};
    var label = escapeAttribute(f.label || "Cross-origin iframe");
    var origin = escapeAttribute(f.origin || "");
    var src = escapeAttribute(f.src || "");
    var meta = "";
    if (origin) meta += "<p>Origin: " + origin + "</p>";
    if (src) meta += "<p>Source: " + src + "</p>";
    return "<!DOCTYPE html><html><head>" + CSP_META + '<meta name="referrer" content="no-referrer"><meta charset="UTF-8"><style>body{margin:0;font:13px system-ui,sans-serif;color:#30333a;background:#f6f7f9;}.ps-frame-placeholder{box-sizing:border-box;min-height:100vh;display:flex;flex-direction:column;gap:6px;justify-content:center;align-items:center;text-align:center;border:1px dashed #9aa3af;padding:16px;}.ps-frame-placeholder strong{font-size:14px;} .ps-frame-placeholder p{margin:0;color:#5f6673;word-break:break-word;}</style></head><body><div class="ps-frame-placeholder" role="note"><strong>' + label + "</strong>" + meta + "</div></body></html>";
  }

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
    /** Media playback state. Payload: MediaSyncPayload */
    MEDIA: "ext:dom-media",
    /** Adaptive-manifest discovery hint (opt-in, adapter-originated). Payload: MediaHintPayload */
    MEDIA_HINT: "ext:dom-media-hint",
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
    /** { op:'value', nid, value?, checked?, selectedValues?, selectedIndexes? } — live form state change */
    VALUE: "value",
    /** ShadowRootPayload plus op:'shadow-root' — replace/open an observed shadow root */
    SHADOW_ROOT: "shadow-root",
    /** { op:'frame', frameNid, frame:FramePayload } — refresh an inert iframe mirror */
    FRAME: "frame",
    /** StyleSourceDiffOp — upsert/replace/remove one scoped CSSOM source */
    STYLE_SOURCE: "style-source"
  };
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
  var HLS_CONTENT_TYPES = {
    "application/vnd.apple.mpegurl": true,
    "application/x-mpegurl": true,
    "audio/mpegurl": true,
    "audio/x-mpegurl": true
  };
  var DASH_CONTENT_TYPE = "application/dash+xml";
  function manifestPathOf(url) {
    if (typeof url !== "string" || url === "") return "";
    try {
      return new URL(url).pathname.toLowerCase();
    } catch (e) {
      return String(url).split("#")[0].split("?")[0].toLowerCase();
    }
  }
  function classifyManifest(input) {
    if (!input) return null;
    const ct = (typeof input.contentType === "string" ? input.contentType : "").split(";")[0].trim().toLowerCase();
    if (ct) {
      if (HLS_CONTENT_TYPES[ct]) return "hls";
      if (ct === DASH_CONTENT_TYPE) return "dash";
    }
    const path = manifestPathOf(input.url);
    if (path) {
      if (/\.m3u8$/.test(path)) return "hls";
      if (/\.mpd$/.test(path)) return "dash";
    }
    return null;
  }

  // node_modules/@full-self-browsing/phantom-stream/src/renderer/diff.js
  function srcsetHasBlockedCandidate2(srcset, gateAssetUrl2) {
    if (!srcset) return false;
    try {
      var candidates = parseSrcsetCandidates(srcset);
      for (var i = 0; i < candidates.length; i++) {
        var url = candidates[i].url;
        if (!url) continue;
        var verdict = gateAssetUrl2(url, "image");
        if (!verdict || !verdict.allow) return true;
      }
      return false;
    } catch (e) {
      return true;
    }
  }
  function installShadowRootDirect(doc, host, payload, sanitizeCounters, logger, indexSubtree, removeSubtree) {
    var p = payload || {};
    if (!doc || !host) return false;
    if (p.mode && p.mode !== "open") return false;
    var shadowRoot = host.shadowRoot || null;
    if (!shadowRoot) {
      if (typeof host.attachShadow !== "function") {
        logger.warn("[Renderer] shadow root unsupported", { hostNid: p.hostNid || "" });
        return false;
      }
      shadowRoot = host.attachShadow({ mode: "open" });
    }
    removeSubtree(shadowRoot);
    while (shadowRoot.firstChild) shadowRoot.removeChild(shadowRoot.firstChild);
    var tpl = doc.createElement("template");
    tpl.innerHTML = p.html || "";
    sanitizeFragment(tpl.content, sanitizeCounters, logger);
    shadowRoot.appendChild(doc.importNode(tpl.content, true));
    indexSubtree(shadowRoot, p.nodeIds || []);
    return true;
  }
  function applyMutations(doc, mutations, counters, hooks) {
    var opts = hooks || {};
    var logger = opts.logger && typeof opts.logger.warn === "function" ? opts.logger : { warn: function() {
    } };
    var requestResync = typeof opts.requestResync === "function" ? opts.requestResync : function() {
    };
    var tallies = counters || { staleMisses: 0, applyFailures: 0 };
    var sanitizeCounters = opts.sanitizeCounters || {
      strippedHandlers: 0,
      blockedUrls: 0,
      droppedSubtrees: 0,
      cssScrubs: 0
    };
    if (!doc || !doc.body) return;
    if (!mutations) return;
    var identity = opts.identity || {};
    var resolve = typeof identity.resolve === "function" ? function(nid) {
      return identity.resolve(nid);
    } : function() {
      return null;
    };
    var indexSubtree = typeof identity.indexSubtree === "function" ? function(root, nodeIds) {
      identity.indexSubtree(root, nodeIds || []);
    } : function() {
    };
    var removeSubtree = typeof identity.removeSubtree === "function" ? function(root) {
      identity.removeSubtree(root);
    } : function() {
    };
    var installShadowRoot = typeof identity.installShadowRoot === "function" ? function(hostNid, payload) {
      identity.installShadowRoot(hostNid, payload);
    } : null;
    var installFrames = typeof identity.installFrames === "function" ? function(frames) {
      identity.installFrames(frames || []);
    } : null;
    var applyStyleSource = typeof identity.applyStyleSource === "function" ? function(action, sourceId, scope, source) {
      return identity.applyStyleSource(action, sourceId, scope, source);
    } : null;
    var removeStyleSource = typeof identity.removeStyleSource === "function" ? function(sourceId, scope) {
      return identity.removeStyleSource(sourceId, scope);
    } : null;
    var gateFragmentAssets = typeof identity.gateFragmentAssets === "function" ? function(node) {
      identity.gateFragmentAssets(node);
    } : function() {
    };
    var gateAssetUrl2 = typeof identity.gateAssetUrl === "function" ? function(url, kind) {
      return identity.gateAssetUrl(url, kind);
    } : null;
    function recordStaleMiss(op, nid) {
      tallies.staleMisses += 1;
      logger.warn("[Renderer] stale mutation: no element for nid", {
        op,
        nid: nid || "",
        staleMisses: tallies.staleMisses
      });
      if (tallies.staleMisses >= 3) {
        requestResync("stale-mutation-parent", { op, nid: nid || "" });
      }
    }
    function applyShadowRoot(payload) {
      var p = payload || {};
      var hostNid = p.hostNid;
      var host = resolve(hostNid);
      if (!host) {
        recordStaleMiss(DIFF_OP.SHADOW_ROOT, hostNid);
        return;
      }
      if (installShadowRoot) {
        installShadowRoot(hostNid, p);
        return;
      }
      installShadowRootDirect(doc, host, p, sanitizeCounters, logger, indexSubtree, removeSubtree);
    }
    function applyStyleSourceOp(m) {
      var sourceId = m && m.sourceId ? String(m.sourceId) : "";
      var scope = m && m.scope ? m.scope : null;
      var scopeKind = scope && scope.kind ? String(scope.kind) : "";
      if (!sourceId || !scopeKind) {
        requestResync("stale-style-scope", { sourceId, scopeKind });
        return;
      }
      var ok = false;
      if (m.action === "remove") {
        ok = removeStyleSource ? removeStyleSource(sourceId, scope) : false;
      } else if (m.action === "upsert" || m.action === "replace") {
        ok = applyStyleSource ? applyStyleSource(m.action, sourceId, scope, m.source || null) : false;
      }
      if (!ok) {
        tallies.staleMisses += 1;
        logger.warn("[Renderer] stale style source scope", {
          sourceId,
          scopeKind,
          staleMisses: tallies.staleMisses
        });
        requestResync("stale-style-scope", { sourceId, scopeKind });
      }
    }
    try {
      mutations.forEach(function(m) {
        try {
          switch (m.op) {
            case DIFF_OP.ADD: {
              var parent = resolve(m.parentNid);
              if (!parent) {
                recordStaleMiss(DIFF_OP.ADD, m.parentNid);
                break;
              }
              var tpl = doc.createElement("template");
              tpl.innerHTML = m.html;
              sanitizeFragment(tpl.content, sanitizeCounters, logger);
              gateFragmentAssets(tpl.content);
              var newNode = tpl.content.firstElementChild;
              if (!newNode) {
                logger.warn("[Renderer] add op dropped: html parsed to no element", {
                  parentNid: m.parentNid || ""
                });
                recordStaleMiss(DIFF_OP.ADD, m.parentNid);
                break;
              }
              var imported = doc.importNode(newNode, true);
              if (m.beforeNid) {
                var before = resolve(m.beforeNid);
                parent.insertBefore(imported, before);
              } else {
                parent.appendChild(imported);
              }
              indexSubtree(imported, m.nodeIds || []);
              if (Array.isArray(m.shadowRoots)) {
                for (var s = 0; s < m.shadowRoots.length; s++) {
                  applyShadowRoot(m.shadowRoots[s]);
                }
              }
              if (installFrames && Array.isArray(m.frames)) {
                installFrames(m.frames);
              }
              break;
            }
            case DIFF_OP.SHADOW_ROOT: {
              applyShadowRoot(m);
              break;
            }
            case DIFF_OP.FRAME: {
              if (installFrames && m.frame) {
                installFrames([m.frame]);
              }
              break;
            }
            case DIFF_OP.STYLE_SOURCE: {
              applyStyleSourceOp(m);
              break;
            }
            case DIFF_OP.REMOVE: {
              var el = resolve(m.nid);
              if (!el) {
                recordStaleMiss(DIFF_OP.REMOVE, m.nid);
                break;
              }
              removeSubtree(el);
              if (el.parentNode) el.parentNode.removeChild(el);
              break;
            }
            case DIFF_OP.ATTR: {
              var target = resolve(m.nid);
              if (!target) {
                recordStaleMiss(DIFF_OP.ATTR, m.nid);
                break;
              }
              var attrName = String(m.attr || "").toLowerCase();
              var targetTag = target.tagName ? String(target.tagName).toLowerCase() : "";
              if (targetTag === "iframe" && attrName === "src") {
                target.removeAttribute("src");
                logger.warn("[Renderer] iframe src attr op ignored", {
                  nid: m.nid || ""
                });
                break;
              }
              if (m.val === null) {
                target.removeAttribute(m.attr);
                break;
              }
              var scrubbed = sanitizeAttrValue(m.attr, m.val);
              if (scrubbed.drop) {
                sanitizeCounters.strippedHandlers += 1;
                logger.warn("[Renderer] attr op dropped by sanitizer", {
                  nid: m.nid || "",
                  attr: m.attr || ""
                });
                break;
              }
              if (scrubbed.value !== m.val) {
                if (String(m.attr).toLowerCase() === "style") {
                  sanitizeCounters.cssScrubs += 1;
                } else {
                  sanitizeCounters.blockedUrls += 1;
                }
                logger.warn("[Renderer] attr op value scrubbed by sanitizer", {
                  nid: m.nid || "",
                  attr: m.attr || ""
                });
              }
              if (scrubbed.value === null) {
                target.removeAttribute(m.attr);
                break;
              }
              if (gateAssetUrl2 && (attrName === "src" || attrName === "poster")) {
                var assetKind;
                if (attrName === "poster") {
                  assetKind = "poster";
                } else if (targetTag === "video" || targetTag === "audio") {
                  assetKind = "media";
                } else if (targetTag === "source") {
                  assetKind = "source";
                } else {
                  assetKind = "image";
                }
                var assetVerdict = gateAssetUrl2(scrubbed.value, assetKind);
                if (!assetVerdict || !assetVerdict.allow) {
                  sanitizeCounters.blockedUrls += 1;
                  logger.warn("[Renderer] attr op asset blocked by origin gate", {
                    nid: m.nid || "",
                    attr: m.attr || ""
                  });
                  target.removeAttribute(m.attr);
                  break;
                }
              }
              if (gateAssetUrl2 && attrName === "srcset") {
                if (srcsetHasBlockedCandidate2(scrubbed.value, gateAssetUrl2)) {
                  sanitizeCounters.blockedUrls += 1;
                  logger.warn("[Renderer] attr op srcset candidate blocked by origin gate", {
                    nid: m.nid || "",
                    attr: m.attr || ""
                  });
                  target.removeAttribute(m.attr);
                  break;
                }
              }
              target.setAttribute(m.attr, scrubbed.value);
              break;
            }
            case DIFF_OP.VALUE: {
              var valueTarget = resolve(m.nid);
              if (!valueTarget) {
                recordStaleMiss(DIFF_OP.VALUE, m.nid);
                break;
              }
              if (Object.prototype.hasOwnProperty.call(m, "value")) {
                valueTarget.value = String(m.value ?? "");
              }
              if (Object.prototype.hasOwnProperty.call(m, "checked")) {
                valueTarget.checked = !!m.checked;
              }
              if (Array.isArray(m.selectedIndexes) && valueTarget.options) {
                var selectedIndexes = /* @__PURE__ */ new Set();
                for (var si = 0; si < m.selectedIndexes.length; si++) {
                  selectedIndexes.add(Number(m.selectedIndexes[si]));
                }
                for (var ix = 0; ix < valueTarget.options.length; ix++) {
                  valueTarget.options[ix].selected = selectedIndexes.has(ix);
                }
              } else if (Array.isArray(m.selectedValues) && valueTarget.options) {
                var selectedValues = /* @__PURE__ */ new Set();
                for (var sv = 0; sv < m.selectedValues.length; sv++) {
                  selectedValues.add(String(m.selectedValues[sv]));
                }
                for (var opt = 0; opt < valueTarget.options.length; opt++) {
                  var option = valueTarget.options[opt];
                  option.selected = selectedValues.has(String(option.value));
                }
              }
              break;
            }
            case DIFF_OP.TEXT: {
              var textTarget = resolve(m.nid);
              if (!textTarget) {
                recordStaleMiss(DIFF_OP.TEXT, m.nid);
                break;
              }
              textTarget.textContent = m.text;
              break;
            }
          }
        } catch (e) {
          tallies.applyFailures += 1;
          logger.warn("[Renderer] mutation apply failed", {
            op: m && m.op ? m.op : "",
            nid: m && (m.nid || m.parentNid || m.beforeNid || "") ? m.nid || m.parentNid || m.beforeNid || "" : "",
            error: e && e.message ? e.message : String(e),
            applyFailures: tallies.applyFailures
          });
          if (tallies.applyFailures >= 2) {
            requestResync("dom-mutation-apply-failed", {
              op: m && m.op ? m.op : "",
              nid: m && (m.nid || m.parentNid || m.beforeNid || "") ? m.nid || m.parentNid || m.beforeNid || "" : ""
            });
          }
        }
      });
    } catch (e) {
      tallies.applyFailures += 1;
      logger.warn("[Renderer] mutation batch failed", {
        error: e && e.message ? e.message : String(e),
        applyFailures: tallies.applyFailures
      });
      requestResync("dom-mutation-batch-failed", {
        error: String(e && e.message ? e.message : e)
      });
    }
  }

  // node_modules/@full-self-browsing/phantom-stream/src/renderer/overlays.js
  var OVERLAY_CSS = [
    ".ps-overlay-glow {",
    "  position: absolute;",
    "  border: 2px solid #f59e0b;",
    "  border-radius: 4px;",
    "  box-shadow: 0 0 12px rgba(245, 158, 11, 0.6);",
    "  background: transparent;",
    "  pointer-events: none;",
    "  display: none; /* shown only while glow.state === 'active' */",
    "}",
    "@media (prefers-reduced-motion: no-preference) {",
    "  .ps-overlay-glow {",
    "    transition: top 100ms ease, left 100ms ease, width 100ms ease, height 100ms ease;",
    "  }",
    "}",
    ".ps-node-highlight {",
    "  position: absolute;",
    "  border: 2px solid #38bdf8;",
    "  border-radius: 4px;",
    "  box-shadow: 0 0 0 1px rgba(8, 47, 73, 0.55), 0 0 14px rgba(56, 189, 248, 0.45);",
    "  background: rgba(56, 189, 248, 0.12);",
    "  pointer-events: none;",
    "  display: none;",
    "}",
    "@media (prefers-reduced-motion: no-preference) {",
    "  .ps-node-highlight {",
    "    transition: top 80ms ease, left 80ms ease, width 80ms ease, height 80ms ease;",
    "  }",
    "}",
    ".ps-node-highlight-label {",
    "  position: absolute;",
    "  left: 0;",
    "  top: -24px;",
    "  max-width: 240px;",
    "  overflow: hidden;",
    "  text-overflow: ellipsis;",
    "  white-space: nowrap;",
    "  border-radius: 4px;",
    "  padding: 3px 7px;",
    "  background: rgba(8, 47, 73, 0.92);",
    "  color: #e0f2fe;",
    "  font: 600 12px/1.2 system-ui, sans-serif;",
    "}",
    ".ps-overlay-progress {",
    "  position: absolute;",
    "  bottom: 8px;",
    "  left: 8px;",
    "  background: rgba(0, 0, 0, 0.75);",
    "  backdrop-filter: blur(4px);",
    "  -webkit-backdrop-filter: blur(4px);",
    "  color: #e0e0e0;",
    "  font: 600 13px/1.2 system-ui, sans-serif;",
    "  padding: 4px 12px;",
    "  border-radius: 6px;",
    "  max-width: calc(100% - 16px);",
    "  white-space: nowrap;",
    "  overflow: hidden;",
    "  text-overflow: ellipsis;",
    "  pointer-events: none;",
    "  display: none;",
    "}",
    ".ps-overlay-dialog {",
    "  position: absolute; top: 0; left: 0; right: 0; bottom: 0;",
    "  background: rgba(0, 0, 0, 0.5);",
    "  display: flex; align-items: center; justify-content: center;",
    "  pointer-events: none;",
    "  /* display: flex when open, none when closed */",
    "}",
    ".ps-overlay-dialog-card {",
    "  background: #1e1e2e;",
    "  border: 1px solid #333;",
    "  border-radius: 12px;",
    "  padding: 24px;",
    "  max-width: 320px;",
    "  width: 80%;",
    "  text-align: center;",
    "  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);",
    "}",
    ".ps-overlay-dialog-icon {",
    "  font-size: 28px; /* SVG icons: width/height 28px */",
    "  color: #f59e0b;",
    "  margin-bottom: 12px;",
    "}",
    ".ps-overlay-dialog-type {",
    "  font-size: 13px; font-weight: 600;",
    "  text-transform: uppercase; letter-spacing: 1px;",
    "  color: #888;",
    "  margin-bottom: 8px;",
    "}",
    ".ps-overlay-dialog-message {",
    "  font-size: 14px; color: #e0e0e0; line-height: 1.5;",
    "  word-break: break-word; max-height: 200px; overflow-y: auto;",
    "}",
    // ---- Phase 13 (MEDIA-05): media affordance family (13-UI-SPEC States A/B/C).
    // Parity values reused verbatim from the glow/progress/dialog built-ins:
    // scrim rgba(0,0,0,0.5); pill rgba(0,0,0,0.75)+blur(4px)+radius 6px; accent
    // #f59e0b (reserved for the actionable control); text #e0e0e0; glow
    // 0 0 12px rgba(245,158,11,0.6); system-ui 13/600; play button >= 44x44.
    // State A: blocked-play scrim clipped to the element rect.
    ".ps-overlay-media-blocked {",
    "  position: absolute;",
    "  background: rgba(0, 0, 0, 0.5);",
    "  display: flex; align-items: center; justify-content: center;",
    "  pointer-events: none;",
    // the scrim is passive; only the button opts in
    "}",
    // State A: centered circular play button (the one actionable control).
    ".ps-overlay-media-button {",
    "  box-sizing: border-box;",
    "  min-width: 44px; min-height: 44px;",
    "  display: flex; align-items: center; justify-content: center;",
    "  border: 2px solid #f59e0b;",
    "  border-radius: 50%;",
    "  box-shadow: 0 0 12px rgba(245, 158, 11, 0.6);",
    "  background: transparent;",
    "  color: #f59e0b;",
    // currentColor for the inline-SVG play glyph
    "  cursor: pointer;",
    "  pointer-events: auto;",
    "}",
    "@media (prefers-reduced-motion: no-preference) {",
    "  .ps-overlay-media-button:hover, .ps-overlay-media-button:focus {",
    "    filter: brightness(1.1);",
    "  }",
    "}",
    // State B: unmute pill anchored bottom-left of the element rect.
    ".ps-overlay-media-unmute {",
    "  position: absolute;",
    "  display: inline-flex; align-items: center; gap: 4px;",
    "  background: rgba(0, 0, 0, 0.75);",
    "  backdrop-filter: blur(4px);",
    "  -webkit-backdrop-filter: blur(4px);",
    "  color: #e0e0e0;",
    "  font: 600 13px/1.2 system-ui, sans-serif;",
    "  padding: 4px 12px;",
    "  border-radius: 6px;",
    "  cursor: pointer;",
    "  pointer-events: auto;",
    "}",
    ".ps-overlay-media-unmute-icon {",
    "  display: inline-flex; color: #f59e0b;",
    // amber speaker glyph fill
    "}",
    "@media (prefers-reduced-motion: no-preference) {",
    "  .ps-overlay-media-unmute:hover, .ps-overlay-media-unmute:focus {",
    "    filter: brightness(1.1);",
    "  }",
    "}",
    // State C: passive poster-only caption (no accent, no pointer events).
    ".ps-overlay-media-poster {",
    "  position: absolute;",
    "  display: inline-flex; align-items: center;",
    "  background: rgba(0, 0, 0, 0.75);",
    "  backdrop-filter: blur(4px);",
    "  -webkit-backdrop-filter: blur(4px);",
    "  color: #e0e0e0;",
    "  font: 600 13px/1.2 system-ui, sans-serif;",
    "  padding: 4px 12px;",
    "  border-radius: 6px;",
    "  pointer-events: none;",
    "}",
    // Phase 14 (MADPT-03): the degrade-reason caption -- a passive clone of the
    // poster caption (same parity values), NO accent. Reason rides a data-
    // attribute (set via setAttribute), never the visible caption.
    ".ps-overlay-media-unavailable {",
    "  position: absolute;",
    "  display: inline-flex; align-items: center;",
    "  background: rgba(0, 0, 0, 0.75);",
    "  backdrop-filter: blur(4px);",
    "  -webkit-backdrop-filter: blur(4px);",
    "  color: #e0e0e0;",
    "  font: 600 13px/1.2 system-ui, sans-serif;",
    "  padding: 4px 12px;",
    "  border-radius: 6px;",
    "  pointer-events: none;",
    "}"
  ].join("\n");
  var ICON_SVG = {
    // alert: warning triangle
    alert: '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
    // confirm: question circle
    confirm: '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>',
    // prompt: keyboard
    prompt: '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/></svg>'
  };
  var MEDIA_GLYPH = {
    // play triangle (centered in the blocked-play button)
    play: '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    // muted speaker (line-sized for the unmute pill)
    mutedSpeaker: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>'
  };
  function mapRectToHost(rect, scale) {
    return {
      top: scale.offsetY + rect.y * scale.s,
      left: scale.offsetX + rect.x * scale.s,
      width: rect.w * scale.s,
      height: rect.h * scale.s
    };
  }
  function mapHostPointToViewport(point, scale) {
    var p = point || {};
    var sc = scale || {};
    var s = typeof sc.s === "number" && isFinite(sc.s) && sc.s > 0 ? sc.s : 1;
    var offsetX = typeof sc.offsetX === "number" && isFinite(sc.offsetX) ? sc.offsetX : 0;
    var offsetY = typeof sc.offsetY === "number" && isFinite(sc.offsetY) ? sc.offsetY : 0;
    var pageW = typeof sc.pageW === "number" && isFinite(sc.pageW) ? Math.max(0, sc.pageW) : 0;
    var pageH = typeof sc.pageH === "number" && isFinite(sc.pageH) ? Math.max(0, sc.pageH) : 0;
    if (pageW <= 0 || pageH <= 0 || typeof p.x !== "number" || !isFinite(p.x) || typeof p.y !== "number" || !isFinite(p.y)) {
      return { inside: false, x: null, y: null };
    }
    var rawX = (p.x - offsetX) / s;
    var rawY = (p.y - offsetY) / s;
    if (rawX < 0 || rawY < 0 || rawX >= pageW || rawY >= pageH) {
      return { inside: false, x: null, y: null };
    }
    var maxX = Math.max(0, Math.floor(pageW) - 1);
    var maxY = Math.max(0, Math.floor(pageH) - 1);
    return {
      inside: true,
      x: Math.max(0, Math.min(maxX, Math.round(rawX))),
      y: Math.max(0, Math.min(maxY, Math.round(rawY)))
    };
  }
  function createOverlays(opts) {
    var cfg = opts || {};
    var doc = cfg.document;
    if (!doc || typeof doc.createElement !== "function") {
      throw new Error("overlays-document-required");
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
    var layer = doc.createElement("div");
    layer.style.position = "absolute";
    layer.style.top = "0px";
    layer.style.left = "0px";
    layer.style.right = "0px";
    layer.style.bottom = "0px";
    layer.style.overflow = "hidden";
    layer.style.pointerEvents = "none";
    layer.style.zIndex = "2";
    var glowEl = doc.createElement("div");
    glowEl.className = "ps-overlay-glow";
    glowEl.style.zIndex = "10";
    glowEl.style.display = "none";
    glowEl.setAttribute("aria-hidden", "true");
    layer.appendChild(glowEl);
    var progressEl = doc.createElement("div");
    progressEl.className = "ps-overlay-progress";
    progressEl.style.zIndex = "20";
    progressEl.style.display = "none";
    progressEl.setAttribute("aria-hidden", "true");
    layer.appendChild(progressEl);
    var dialogEl = doc.createElement("div");
    dialogEl.className = "ps-overlay-dialog";
    dialogEl.style.zIndex = "30";
    dialogEl.style.display = "none";
    var dialogCardEl = doc.createElement("div");
    dialogCardEl.className = "ps-overlay-dialog-card";
    dialogCardEl.setAttribute("role", "status");
    dialogCardEl.setAttribute("aria-live", "polite");
    var dialogIconEl = doc.createElement("div");
    dialogIconEl.className = "ps-overlay-dialog-icon";
    dialogIconEl.innerHTML = ICON_SVG.alert;
    var dialogTypeEl = doc.createElement("div");
    dialogTypeEl.className = "ps-overlay-dialog-type";
    var dialogMessageEl = doc.createElement("div");
    dialogMessageEl.className = "ps-overlay-dialog-message";
    dialogCardEl.appendChild(dialogIconEl);
    dialogCardEl.appendChild(dialogTypeEl);
    dialogCardEl.appendChild(dialogMessageEl);
    dialogEl.appendChild(dialogCardEl);
    layer.appendChild(dialogEl);
    var registry = /* @__PURE__ */ new Map();
    function register(kind, renderFn) {
      registry.set(kind, renderFn);
    }
    function safeRenderOverlay(kind, renderFn, value, anchorRect) {
      try {
        renderFn(value, anchorRect, layer);
      } catch (err) {
        logger.error("[Renderer] overlay renderFn failed", kind, err);
      }
    }
    function resolveAnchorRect(value, ctx) {
      if (!value || typeof value !== "object" || !ctx) return null;
      if (value.nid !== void 0 && value.nid !== null && typeof ctx.resolveNidRect === "function") {
        return ctx.resolveNidRect(value.nid) || null;
      }
      if (typeof value.x === "number" && typeof value.y === "number" && typeof value.w === "number" && typeof value.h === "number" && ctx.scale) {
        return mapRectToHost(value, ctx.scale);
      }
      return null;
    }
    function renderGlow(value, anchorRect) {
      if (value && value.state === "active" && anchorRect) {
        glowEl.style.top = anchorRect.top + "px";
        glowEl.style.left = anchorRect.left + "px";
        glowEl.style.width = anchorRect.width + "px";
        glowEl.style.height = anchorRect.height + "px";
        glowEl.style.display = "block";
      } else {
        glowEl.style.display = "none";
      }
    }
    function renderProgress(value) {
      if (value) {
        var phaseText = value.phase || "Working";
        var progressText;
        if (value.mode === "determinate" && typeof value.percent === "number") {
          progressText = Math.round(value.percent) + "%";
        } else {
          progressText = value.label || phaseText || "Working";
        }
        progressEl.textContent = progressText + " - " + phaseText;
        progressEl.style.display = "block";
      } else {
        progressEl.style.display = "none";
      }
    }
    register("glow", renderGlow);
    register("progress", renderProgress);
    var mediaBlockedEl = null;
    var mediaBlockedBtn = null;
    var mediaBlockedActivate = null;
    var mediaUnmuteEl = null;
    var mediaUnmuteActivate = null;
    var mediaPosterEl = null;
    var mediaUnavailableEl = null;
    function safeActivate(fn) {
      if (typeof fn !== "function") return;
      try {
        fn();
      } catch (err) {
        logger.error("[Renderer] media affordance onActivate failed", err);
      }
    }
    function wireActivation(el, getHandler) {
      el.addEventListener("click", function() {
        safeActivate(getHandler());
      });
      el.addEventListener("keydown", function(ev) {
        if (ev && (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar")) {
          if (typeof ev.preventDefault === "function") ev.preventDefault();
          safeActivate(getHandler());
        }
      });
    }
    function anchorAffordance(el, anchorRect) {
      if (!anchorRect) return;
      el.style.top = anchorRect.top + "px";
      el.style.left = anchorRect.left + "px";
      el.style.width = anchorRect.width + "px";
      el.style.height = anchorRect.height + "px";
    }
    function renderMediaBlocked(value, anchorRect) {
      if (!value) {
        if (mediaBlockedEl) mediaBlockedEl.style.display = "none";
        mediaBlockedActivate = null;
        return;
      }
      if (!mediaBlockedEl) {
        mediaBlockedEl = doc.createElement("div");
        mediaBlockedEl.className = "ps-overlay-media-blocked";
        mediaBlockedEl.style.zIndex = "25";
        mediaBlockedBtn = doc.createElement("div");
        mediaBlockedBtn.className = "ps-overlay-media-button";
        mediaBlockedBtn.setAttribute("role", "button");
        mediaBlockedBtn.setAttribute("tabindex", "0");
        mediaBlockedBtn.setAttribute("aria-label", "Play mirrored media");
        mediaBlockedBtn.style.pointerEvents = "auto";
        mediaBlockedBtn.style.minWidth = "44px";
        mediaBlockedBtn.style.minHeight = "44px";
        mediaBlockedBtn.innerHTML = MEDIA_GLYPH.play;
        wireActivation(mediaBlockedBtn, function() {
          return mediaBlockedActivate;
        });
        mediaBlockedEl.appendChild(mediaBlockedBtn);
        layer.appendChild(mediaBlockedEl);
      }
      mediaBlockedActivate = typeof value.onActivate === "function" ? value.onActivate : null;
      anchorAffordance(mediaBlockedEl, anchorRect);
      mediaBlockedEl.style.display = "flex";
    }
    function renderMediaUnmute(value, anchorRect) {
      if (!value) {
        if (mediaUnmuteEl) mediaUnmuteEl.style.display = "none";
        mediaUnmuteActivate = null;
        return;
      }
      if (!mediaUnmuteEl) {
        mediaUnmuteEl = doc.createElement("div");
        mediaUnmuteEl.className = "ps-overlay-media-unmute";
        mediaUnmuteEl.style.zIndex = "25";
        mediaUnmuteEl.setAttribute("role", "button");
        mediaUnmuteEl.setAttribute("tabindex", "0");
        mediaUnmuteEl.setAttribute("aria-label", "Unmute mirrored media");
        mediaUnmuteEl.style.pointerEvents = "auto";
        var icon = doc.createElement("span");
        icon.className = "ps-overlay-media-unmute-icon";
        icon.innerHTML = MEDIA_GLYPH.mutedSpeaker;
        var label = doc.createElement("span");
        label.className = "ps-overlay-media-unmute-label";
        label.textContent = "Unmute";
        mediaUnmuteEl.appendChild(icon);
        mediaUnmuteEl.appendChild(label);
        wireActivation(mediaUnmuteEl, function() {
          return mediaUnmuteActivate;
        });
        layer.appendChild(mediaUnmuteEl);
      }
      mediaUnmuteActivate = typeof value.onActivate === "function" ? value.onActivate : null;
      if (anchorRect) {
        mediaUnmuteEl.style.left = anchorRect.left + 8 + "px";
        mediaUnmuteEl.style.top = anchorRect.top + anchorRect.height - 8 - 24 + "px";
      }
      mediaUnmuteEl.style.display = "inline-flex";
    }
    function renderMediaPoster(value, anchorRect) {
      if (!value) {
        if (mediaPosterEl) mediaPosterEl.style.display = "none";
        return;
      }
      if (!mediaPosterEl) {
        mediaPosterEl = doc.createElement("div");
        mediaPosterEl.className = "ps-overlay-media-poster";
        mediaPosterEl.style.zIndex = "24";
        mediaPosterEl.style.pointerEvents = "none";
        mediaPosterEl.textContent = "Media (poster only)";
        layer.appendChild(mediaPosterEl);
      }
      if (anchorRect) {
        mediaPosterEl.style.left = anchorRect.left + anchorRect.width / 2 + "px";
        mediaPosterEl.style.top = anchorRect.top + anchorRect.height / 2 + "px";
        mediaPosterEl.style.transform = "translate(-50%, -50%)";
      }
      mediaPosterEl.style.display = "inline-flex";
    }
    function renderMediaUnavailable(value, anchorRect) {
      if (!value) {
        if (mediaUnavailableEl) mediaUnavailableEl.style.display = "none";
        return;
      }
      if (!mediaUnavailableEl) {
        mediaUnavailableEl = doc.createElement("div");
        mediaUnavailableEl.className = "ps-overlay-media-unavailable";
        mediaUnavailableEl.style.zIndex = "24";
        mediaUnavailableEl.style.pointerEvents = "none";
        mediaUnavailableEl.textContent = "Media unavailable";
        layer.appendChild(mediaUnavailableEl);
      }
      if (value.reason !== void 0 && value.reason !== null) {
        mediaUnavailableEl.setAttribute("data-ps-reason", String(value.reason));
      } else {
        mediaUnavailableEl.removeAttribute("data-ps-reason");
      }
      if (anchorRect) {
        mediaUnavailableEl.style.left = anchorRect.left + anchorRect.width / 2 + "px";
        mediaUnavailableEl.style.top = anchorRect.top + anchorRect.height / 2 + "px";
        mediaUnavailableEl.style.transform = "translate(-50%, -50%)";
      }
      mediaUnavailableEl.style.display = "inline-flex";
    }
    register("media-blocked", renderMediaBlocked);
    register("media-unmute", renderMediaUnmute);
    register("media-poster", renderMediaPoster);
    register("media-unavailable", renderMediaUnavailable);
    function show(kind, payload, ctx) {
      var renderFn = registry.get(kind);
      if (!renderFn) {
        logger.warn("[Renderer] show() unknown overlay kind ignored", kind);
        return;
      }
      var anchorRect = ctx && ctx.anchorRect ? ctx.anchorRect : null;
      var value = payload === void 0 ? null : payload;
      safeRenderOverlay(kind, renderFn, value, anchorRect);
    }
    function handleOverlayMessage(payload, ctx) {
      if (!payload || typeof payload !== "object") return;
      var kinds = Object.keys(payload);
      for (var i = 0; i < kinds.length; i++) {
        var kind = kinds[i];
        if (kind === "streamSessionId" || kind === "snapshotId") continue;
        var renderFn = registry.get(kind);
        if (!renderFn) {
          logger.warn("[Renderer] unknown overlay kind ignored", kind);
          continue;
        }
        var value = payload[kind] === void 0 ? null : payload[kind];
        var anchorRect = value ? resolveAnchorRect(value, ctx) : null;
        safeRenderOverlay(kind, renderFn, value, anchorRect);
      }
    }
    function setDialogIcon(type) {
      dialogIconEl.innerHTML = ICON_SVG[type] || ICON_SVG.alert;
    }
    function handleDialogMessage(payload) {
      var dialog = payload && payload.dialog || payload;
      if (!dialog) return;
      if (dialog.state === "open") {
        var type = dialog.type || "alert";
        dialogTypeEl.textContent = type.charAt(0).toUpperCase() + type.slice(1);
        dialogMessageEl.textContent = dialog.message || "";
        setDialogIcon(type);
        dialogEl.style.display = "flex";
      } else if (dialog.state === "closed") {
        dialogEl.style.display = "none";
      }
    }
    function resetOverlays() {
      registry.forEach(function(renderFn, kind) {
        safeRenderOverlay(kind, renderFn, null, null);
      });
      dialogEl.style.display = "none";
    }
    return {
      layer,
      register,
      handleOverlayMessage,
      handleDialogMessage,
      show,
      resetOverlays
    };
  }

  // node_modules/@full-self-browsing/phantom-stream/src/renderer/asset-policy.js
  function isPrivateOrLocalHost(host) {
    if (!host || typeof host !== "string") return true;
    var normalized = host.toLowerCase();
    if (normalized.length > 1 && normalized.charAt(normalized.length - 1) === ".") {
      normalized = normalized.slice(0, -1);
    }
    if (normalized === "localhost") return true;
    var bare = normalized.charAt(0) === "[" && normalized.charAt(normalized.length - 1) === "]" ? normalized.slice(1, -1) : normalized;
    var zone = bare.indexOf("%");
    if (zone !== -1) bare = bare.slice(0, zone);
    var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);
    if (m) {
      var a = +m[1], b = +m[2];
      if (a === 0) return true;
      if (a === 127) return true;
      if (a === 10) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 169 && b === 254) return true;
      return false;
    }
    if (bare.indexOf(":") === -1) return false;
    if (bare === "::1") return true;
    if (bare === "::") return true;
    if (/^fe[89ab][0-9a-f]*:/.test(bare)) return true;
    if (/^f[cd][0-9a-f]*:/.test(bare)) return true;
    if (/^64:ff9b:/.test(bare)) return true;
    var mapped = /^(?:::ffff:|::)(?:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/.exec(bare);
    if (mapped) {
      var v4 = mapped[1];
      if (!v4 && mapped[2] && mapped[3]) {
        var hi = parseInt(mapped[2], 16), lo = parseInt(mapped[3], 16);
        v4 = (hi >> 8) + "." + (hi & 255) + "." + (lo >> 8) + "." + (lo & 255);
      }
      if (v4 && isPrivateOrLocalHost(v4)) return true;
    }
    return false;
  }
  function classifyAssetOrigin(url) {
    var u;
    try {
      u = new URL(String(url));
    } catch (e) {
      return { allowed: false, reason: "parse-error" };
    }
    if (u.protocol !== "https:") return { allowed: false, reason: "bad-scheme" };
    var host = (u.hostname || "").toLowerCase();
    if (isPrivateOrLocalHost(host)) return { allowed: false, reason: "private-host" };
    var isIpv6Literal = host.charAt(0) === "[" && host.charAt(host.length - 1) === "]";
    if (!isIpv6Literal && (host.indexOf(".") === -1 || host.endsWith(".local"))) {
      return { allowed: false, reason: "unqualified-host" };
    }
    return { allowed: true, reason: "ok" };
  }

  // node_modules/@full-self-browsing/phantom-stream/src/renderer/media-player.js
  async function tryLazyImportHls() {
    try {
      var mod = await import("hls.js");
      return mod && (mod.default || mod.Hls || mod) || null;
    } catch (e) {
      return null;
    }
  }
  function canUseMse(win) {
    return !!(win && (win.ManagedMediaSource || win.MediaSource));
  }
  function isNativeHls(videoEl, kind) {
    if (kind !== "hls") return false;
    var v = videoEl && typeof videoEl.canPlayType === "function" ? videoEl.canPlayType("application/vnd.apple.mpegurl") : "";
    return v === "probably" || v === "maybe";
  }
  function createMediaPlayer(deps) {
    var d = deps || {};
    var logger = d.logger || { info: function() {
    }, warn: function() {
    }, error: function() {
    } };
    var lazyImportHls = typeof d.tryLazyImportHls === "function" ? d.tryLazyImportHls : tryLazyImportHls;
    var registry = /* @__PURE__ */ new Map();
    function safeInvokeMediaHook(nid, reason) {
      if (typeof d.onMediaUnavailable !== "function") return;
      try {
        d.onMediaUnavailable(nid, reason);
      } catch (err) {
        logger.error("[Renderer] onMediaUnavailable callback failed", nid, reason, err);
      }
    }
    function destroy(nid) {
      var entry = registry.get(nid);
      if (entry) {
        if (entry.player && typeof entry.player.destroy === "function") {
          try {
            entry.player.destroy();
          } catch (e) {
          }
        }
        var el = entry.videoEl;
        if (el) {
          try {
            if (typeof el.removeAttribute === "function") el.removeAttribute("src");
          } catch (e) {
          }
          try {
            if (typeof el.load === "function") el.load();
          } catch (e) {
          }
        }
        registry.delete(nid);
      }
    }
    function destroyAll() {
      var nids = [];
      registry.forEach(function(_entry, nid) {
        nids.push(nid);
      });
      nids.forEach(destroy);
    }
    function degrade(nid, reason) {
      destroy(nid);
      if (typeof d.showOverlay === "function") {
        var anchorRect = typeof d.resolveNidRect === "function" ? d.resolveNidRect(nid) : null;
        try {
          d.showOverlay("media-unavailable", { nid, reason }, { anchorRect });
        } catch (e) {
          logger.error("[Renderer] media-unavailable overlay failed", nid, reason, e);
        }
      }
      if (typeof d.keepPoster === "function") {
        try {
          d.keepPoster(nid);
        } catch (e) {
        }
      }
      safeInvokeMediaHook(nid, reason);
      return void 0;
    }
    async function attachViaLazyHls(videoEl, manifestUrl, ctx) {
      var win = d.win || ctx.doc && ctx.doc.defaultView || null;
      if (!canUseMse(win)) return degrade(ctx.nid, "mse-opaque");
      var Hls = await lazyImportHls();
      if (!Hls || typeof Hls.isSupported !== "function" || !Hls.isSupported()) {
        return degrade(ctx.nid, "no-player");
      }
      try {
        var hls = new Hls({});
        var onEncrypted = function() {
          degrade(ctx.nid, "drm");
        };
        videoEl.addEventListener("encrypted", onEncrypted, { once: true });
        hls.on(Hls.Events.ERROR, function(_e, info) {
          if (!info || !info.fatal) return;
          degrade(ctx.nid, info.type === Hls.ErrorTypes.KEY_SYSTEM_ERROR ? "drm" : "mse-opaque");
        });
        hls.loadSource(manifestUrl);
        hls.attachMedia(videoEl);
        var player = { destroy: function() {
          try {
            if (typeof videoEl.removeEventListener === "function") {
              videoEl.removeEventListener("encrypted", onEncrypted);
            }
          } catch (e) {
          }
          try {
            hls.destroy();
          } catch (e) {
          }
        } };
        registry.set(ctx.nid, { nid: ctx.nid, kind: "hls", videoEl, player });
        return { kind: "hls", hls, player };
      } catch (e) {
        return degrade(ctx.nid, "mse-opaque");
      }
    }
    function attachViaFactory(videoEl, manifestUrl, ctx) {
      var player = d.playerFactory(ctx);
      registry.set(ctx.nid, { nid: ctx.nid, kind: ctx.kind, videoEl, player });
      if (player && typeof player.onError === "function") {
        player.onError(function(reason) {
          degrade(ctx.nid, reason || "mse-opaque");
        });
      }
      player.attach(videoEl, manifestUrl, ctx);
      return { kind: "factory", player };
    }
    function attach(videoEl, manifestUrl, ctx) {
      var c = ctx || {};
      var nid = c.nid !== void 0 ? c.nid : null;
      try {
        var gate = typeof d.gateAsset === "function" ? d.gateAsset(manifestUrl, "media") : { allow: true };
        if (!gate || !gate.allow) return degrade(nid, "no-manifest");
        var kind = classifyManifest({ url: manifestUrl, contentType: c.contentType });
        if (isNativeHls(videoEl, kind)) {
          videoEl.src = manifestUrl;
          registry.set(nid, { nid, kind: "native", videoEl });
          if (typeof d.ensurePlaying === "function") d.ensurePlaying(videoEl, nid);
          return { kind: "native" };
        }
        var playerCtx = {
          doc: d.doc,
          manifestUrl,
          kind,
          videoEl,
          logger,
          gateAsset: d.gateAsset,
          nid
        };
        if (typeof d.playerFactory === "function") {
          return attachViaFactory(videoEl, manifestUrl, playerCtx);
        }
        if (kind === "hls") {
          return attachViaLazyHls(videoEl, manifestUrl, playerCtx);
        }
        if (kind === "dash") return degrade(nid, "no-player");
        return degrade(nid, "no-manifest");
      } catch (e) {
        return degrade(nid, "mse-opaque");
      }
    }
    return {
      attach,
      degrade,
      destroy,
      destroyAll
    };
  }

  // node_modules/@full-self-browsing/phantom-stream/src/protocol/media-reconcile.js
  var DEFAULT_MEDIA_RECONCILE_CONFIG = {
    holdBandSec: 0.25,
    // |drift| <= this -> hold (no correction)
    hardSeekSec: 1,
    // |drift| >  this -> hard-seek to the clamped expected position
    maxNudgeFraction: 0.05,
    // (0.25, 1.0] band nudges playbackRate by at most +/- this
    liveRejoinSec: 1
    // live streams rejoin the edge only when drift exceeds this
  };
  function isFiniteNum(v) {
    return typeof v === "number" && isFinite(v);
  }
  function mergeConfig(config) {
    var d = DEFAULT_MEDIA_RECONCILE_CONFIG;
    var c = config || {};
    return {
      holdBandSec: isFiniteNum(c.holdBandSec) ? c.holdBandSec : d.holdBandSec,
      hardSeekSec: isFiniteNum(c.hardSeekSec) ? c.hardSeekSec : d.hardSeekSec,
      maxNudgeFraction: isFiniteNum(c.maxNudgeFraction) ? c.maxNudgeFraction : d.maxNudgeFraction,
      liveRejoinSec: isFiniteNum(c.liveRejoinSec) ? c.liveRejoinSec : d.liveRejoinSec
    };
  }
  function clampToDuration(t, duration) {
    var lo = isFiniteNum(t) ? t : 0;
    if (lo < 0) lo = 0;
    if (isFiniteNum(duration) && lo > duration) lo = duration;
    return lo;
  }
  function isLoopWrap(localTime, expected, duration, cfg) {
    if (!isFiniteNum(duration) || duration <= 0) return false;
    if (!isFiniteNum(localTime) || !isFiniteNum(expected)) return false;
    var window = Math.max(cfg.hardSeekSec, duration * 0.1);
    if (window >= duration / 2) return false;
    var localNearEnd = localTime >= duration - window;
    var localNearStart = localTime <= window;
    var expectedNearEnd = expected >= duration - window;
    var expectedNearStart = expected <= window;
    return localNearEnd && expectedNearStart || localNearStart && expectedNearEnd;
  }
  function reconcileMediaDrift(local, remote, now, config) {
    var cfg = mergeConfig(config);
    if (!remote || remote.currentTime == null || !isFiniteNum(remote.currentTime) || !isFiniteNum(remote.sentAt)) {
      return { action: "hold", reason: "incomplete-remote" };
    }
    if (remote.event === "seeked") {
      return { action: "seek", toTime: clampToDuration(remote.currentTime, remote.duration) };
    }
    if (remote.paused === true || remote.playbackRate === 0) {
      return local && local.paused ? { action: "hold", reason: "paused" } : { action: "pause" };
    }
    var localTime = local && isFiniteNum(local.currentTime) ? local.currentTime : null;
    if (localTime === null) {
      return { action: "hold", reason: "local-not-ready" };
    }
    var elapsedSec = Math.max(0, (now - remote.sentAt) / 1e3);
    if (!isFiniteNum(elapsedSec)) elapsedSec = 0;
    var rate = isFiniteNum(remote.playbackRate) && remote.playbackRate > 0 ? remote.playbackRate : 1;
    var expected = remote.currentTime + rate * elapsedSec;
    if (remote.live === true || !isFiniteNum(remote.duration)) {
      var liveDrift = Math.abs(expected - localTime);
      return liveDrift > cfg.liveRejoinSec ? { action: "rejoin-edge" } : { action: "hold", reason: "live-in-band" };
    }
    var duration = remote.duration;
    if (duration <= 0) {
      return { action: "hold", reason: "zero-duration" };
    }
    if (remote.loop === true && isLoopWrap(localTime, expected, duration, cfg)) {
      return { action: "seek", toTime: clampToDuration(expected, duration) };
    }
    var drift = expected - localTime;
    var adrift = Math.abs(drift);
    if (adrift <= cfg.holdBandSec) {
      return { action: "hold", reason: "in-band", revertRate: rate };
    }
    if (adrift <= cfg.hardSeekSec) {
      var sign = drift > 0 ? 1 : -1;
      var nudgeRate = rate * (1 + sign * cfg.maxNudgeFraction);
      return { action: "nudge", rate: nudgeRate, baseRate: rate };
    }
    return { action: "seek", toTime: clampToDuration(expected, duration) };
  }

  // node_modules/@full-self-browsing/phantom-stream/src/renderer/index.js
  var VALID_MEDIA_MODES = { off: true, poster: true, reference: true };
  function assetUrlHost(url) {
    try {
      return new URL(String(url)).hostname.toLowerCase();
    } catch (e) {
      return "";
    }
  }
  function srcsetHasBlockedCandidate3(srcset, gateAsset) {
    if (!srcset) return false;
    try {
      var candidates = parseSrcsetCandidates(srcset);
      for (var i = 0; i < candidates.length; i++) {
        var url = candidates[i].url;
        if (!url) continue;
        var verdict = gateAsset(url, "image");
        if (!verdict || !verdict.allow) return true;
      }
      return false;
    } catch (e) {
      return true;
    }
  }
  function gateAssetUrl(url, ctx) {
    var c = ctx || {};
    var mode = VALID_MEDIA_MODES[c.mediaMode] ? c.mediaMode : "reference";
    if (mode === "off") return { allow: false, reason: "media-off" };
    var host = assetUrlHost(url);
    var allowlist = Array.isArray(c.allowAssetOrigins) ? c.allowAssetOrigins : null;
    var widened = false;
    if (allowlist && host) {
      for (var i = 0; i < allowlist.length; i++) {
        if (String(allowlist[i]).toLowerCase() === host) {
          widened = true;
          break;
        }
      }
    }
    if (!widened) {
      var verdict = classifyAssetOrigin(url);
      if (!verdict.allowed) return { allow: false, reason: verdict.reason };
    }
    if (typeof c.assetOriginPolicy === "function") {
      var ok;
      try {
        ok = c.assetOriginPolicy(url, c);
      } catch (e) {
        return { allow: false, reason: "hook-threw" };
      }
      if (ok !== true) return { allow: false, reason: "hook-denied" };
    }
    if (mode === "poster" && (c.kind === "media" || c.kind === "source")) {
      return { allow: false, reason: "poster-mode-media" };
    }
    return { allow: true, reason: "ok" };
  }
  function computeScale(pageW, pageH, containerW, containerH) {
    var w = Math.max(1, pageW || 1920);
    var h = Math.max(1, pageH || 1080);
    var s = Math.min(containerW / w, containerH / h);
    if (!isFinite(s) || s <= 0) s = 1;
    return {
      s,
      offsetX: Math.max(0, (containerW - w * s) / 2),
      offsetY: Math.max(0, (containerH - h * s) / 2),
      pageW: w,
      pageH: h
    };
  }
  function createViewer(options) {
    var cfg = options || {};
    var hostDriven = !cfg.container && !!cfg.mount;
    var container = cfg.container || cfg.mount;
    if (!container || typeof container.appendChild !== "function") {
      throw new Error("viewer-container-required");
    }
    var transport = cfg.transport;
    if (transport) {
      if (typeof transport.send !== "function" || typeof transport.onMessage !== "function") {
        throw new Error("viewer-transport-required");
      }
    } else if (hostDriven) {
      transport = {
        send: function() {
        },
        onMessage: function() {
          return function() {
          };
        }
      };
    } else {
      throw new Error("viewer-transport-required");
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
    var disconnectDelayMs = typeof cfg.disconnectDelayMs === "number" ? Math.max(0, cfg.disconnectDelayMs) : 750;
    var mediaMode = cfg.mediaMode == null ? "reference" : String(cfg.mediaMode);
    if (!VALID_MEDIA_MODES[mediaMode]) {
      throw new Error("viewer-mediamode-invalid");
    }
    var assetOriginPolicy = typeof cfg.assetOriginPolicy === "function" ? cfg.assetOriginPolicy : null;
    var allowAssetOrigins = Array.isArray(cfg.allowAssetOrigins) ? cfg.allowAssetOrigins.slice() : null;
    var onMediaBlocked = typeof cfg.onMediaBlocked === "function" ? cfg.onMediaBlocked : null;
    var mediaReconcileConfig = cfg.mediaReconcileConfig && typeof cfg.mediaReconcileConfig === "object" ? cfg.mediaReconcileConfig : DEFAULT_MEDIA_RECONCILE_CONFIG;
    var playerFactory = typeof cfg.playerFactory === "function" ? cfg.playerFactory : null;
    var onMediaUnavailable = typeof cfg.onMediaUnavailable === "function" ? cfg.onMediaUnavailable : null;
    function gateAsset(url, kind) {
      return gateAssetUrl(url, {
        mediaMode,
        allowAssetOrigins,
        assetOriginPolicy,
        kind: kind || "image"
      });
    }
    function buildAssetPlaceholderEl(ownerDoc, el) {
      var ph = ownerDoc.createElement("div");
      ph.setAttribute("data-ps-asset-unavailable", "blocked-origin");
      var w = el.getAttribute && (el.getAttribute("rr_width") || el.getAttribute("width")) || "";
      var h = el.getAttribute && (el.getAttribute("rr_height") || el.getAttribute("height")) || "";
      if (w) ph.setAttribute("rr_width", w);
      if (h) ph.setAttribute("rr_height", h);
      return ph;
    }
    function gateFragmentAssets(rootNode) {
      if (!rootNode || typeof rootNode.querySelectorAll !== "function") return;
      var ownerDoc = rootNode.ownerDocument || (rootNode.nodeType === 9 ? rootNode : null);
      if (!ownerDoc) return;
      var imgs = rootNode.querySelectorAll("img");
      for (var i = 0; i < imgs.length; i++) {
        var el = imgs[i];
        try {
          var pinned = el.getAttribute("data-ps-currentsrc");
          var effective = el.getAttribute("src");
          if (pinned) {
            effective = pinned;
            el.setAttribute("src", pinned);
            el.removeAttribute("srcset");
            el.removeAttribute("sizes");
            el.removeAttribute("data-ps-currentsrc");
          }
          if (effective && !gateAsset(effective, "image").allow) {
            var ph = buildAssetPlaceholderEl(ownerDoc, el);
            if (el.parentNode) el.parentNode.replaceChild(ph, el);
            continue;
          }
          var srcset = el.getAttribute("srcset");
          if (srcset && srcsetHasBlockedCandidate3(srcset, gateAsset)) {
            if (!effective) {
              var phSrcset = buildAssetPlaceholderEl(ownerDoc, el);
              if (el.parentNode) el.parentNode.replaceChild(phSrcset, el);
            } else {
              el.removeAttribute("srcset");
            }
          }
        } catch (e) {
          logger.warn("[Renderer] asset gate pass failed for an element", {
            error: e && e.message ? e.message : String(e)
          });
        }
      }
      gateFragmentMedia(rootNode, ownerDoc);
    }
    function gateFragmentMedia(rootNode, ownerDoc) {
      var posterOnly = mediaMode === "poster";
      var media = rootNode.querySelectorAll("video, audio");
      for (var i = 0; i < media.length; i++) {
        var el = media[i];
        try {
          var src = el.getAttribute("src");
          if (src && (posterOnly || !gateAsset(src, "media").allow)) {
            el.removeAttribute("src");
          }
          var poster = el.getAttribute("poster");
          if (poster && !gateAsset(poster, "poster").allow) {
            el.removeAttribute("poster");
          }
          var childSources = el.querySelectorAll("source");
          for (var j = 0; j < childSources.length; j++) {
            var cs = childSources[j];
            var csSrc = cs.getAttribute("src");
            if (csSrc && (posterOnly || !gateAsset(csSrc, "media").allow)) {
              cs.removeAttribute("src");
            }
          }
        } catch (e) {
          logger.warn("[Renderer] media gate pass failed for an element", {
            error: e && e.message ? e.message : String(e)
          });
        }
      }
      var looseSources = rootNode.querySelectorAll("source");
      for (var k = 0; k < looseSources.length; k++) {
        var ls = looseSources[k];
        try {
          var lsSrc = ls.getAttribute("src");
          if (lsSrc && (posterOnly || !gateAsset(lsSrc, "media").allow)) {
            ls.removeAttribute("src");
          }
        } catch (e2) {
        }
      }
    }
    var doc = container.ownerDocument || cfg.document;
    var win = doc.defaultView;
    var root = doc.createElement("div");
    root.setAttribute("data-phantomstream-ui", "viewer");
    root.style.position = "relative";
    root.style.width = "100%";
    root.style.height = "100%";
    root.style.overflow = "hidden";
    var styleEl = doc.createElement("style");
    styleEl.textContent = OVERLAY_CSS;
    root.appendChild(styleEl);
    var iframe = doc.createElement("iframe");
    iframe.setAttribute("title", "PhantomStream live mirror");
    iframe.style.position = "absolute";
    iframe.style.zIndex = "1";
    iframe.style.transformOrigin = "top left";
    iframe.style.display = "none";
    iframe.setAttribute("sandbox", "allow-same-origin");
    var sandboxTokens = (iframe.getAttribute("sandbox") || "").trim().split(/\s+/);
    if (sandboxTokens.length !== 1 || sandboxTokens[0] !== "allow-same-origin") {
      throw new Error("viewer-sandbox-invalid");
    }
    iframe.addEventListener("load", function() {
      try {
        var scrubDoc = iframe.contentDocument;
        if (scrubDoc && scrubDoc.body) {
          sanitizeFragment(scrubDoc.body, sanitizeCounters, logger);
          gateFragmentAssets(scrubDoc.body);
          if (lastSnapshotPayload) {
            resetIdentityIndex(scrubDoc, lastSnapshotPayload.nodeIds || []);
            installStyleSources(scrubDoc, lastSnapshotPayload.styleSources || [], { kind: "document" });
            installShadowRoots(scrubDoc, lastSnapshotPayload.shadowRoots || []);
            installFrames(scrubDoc, lastSnapshotPayload.frames || []);
            applyMediaBaseline(lastSnapshotPayload.media);
          }
        }
      } catch (e) {
        logger.warn("[Renderer] post-parse scrub failed", e);
      }
    });
    iframe.addEventListener("load", function() {
      if (!lastSnapshotPayload) return;
      updateScale();
      try {
        iframe.contentWindow.scrollTo(
          lastSnapshotPayload.scrollX || 0,
          lastSnapshotPayload.scrollY || 0
        );
      } catch (e) {
      }
      viewerState = "streaming";
      iframe.style.display = "";
    });
    root.appendChild(iframe);
    var overlays = createOverlays({ document: doc, logger });
    root.appendChild(overlays.layer);
    var mediaPlayer = createMediaPlayer({
      doc,
      win,
      gateAsset,
      logger,
      playerFactory,
      onMediaUnavailable: function(nid, reason) {
        safeInvokeMediaHook(function(n) {
          if (onMediaUnavailable) onMediaUnavailable(n, reason);
        }, nid);
      },
      showOverlay: function(kind, payload, ctx) {
        return overlays.show(kind, payload, ctx);
      },
      resolveNidRect,
      ensurePlaying
    });
    var pendingHints = /* @__PURE__ */ new Map();
    var hintBoundNids = /* @__PURE__ */ new Set();
    container.appendChild(root);
    var viewerState = "waiting";
    var publicState = "connecting";
    var publicStateEvent = {
      state: publicState,
      reason: "viewer-created",
      ts: Date.now()
    };
    var stateListeners = /* @__PURE__ */ new Set();
    var healthListeners = /* @__PURE__ */ new Set();
    var disconnectTimer = null;
    var active = { streamSessionId: "", snapshotId: 0 };
    var lastScroll = { x: 0, y: 0 };
    var counters = { staleMisses: 0, applyFailures: 0 };
    var sanitizeCounters = {
      strippedHandlers: 0,
      blockedUrls: 0,
      droppedSubtrees: 0,
      cssScrubs: 0
    };
    var resyncPending = false;
    var receivedByType = {};
    var sentByType = {};
    var lastFrameAt = 0;
    var lastSnapshotAt = 0;
    var lastMutationAt = 0;
    var lastTransportStatus = {};
    var lastSnapshotPayload = null;
    var scaleState = computeScale(1920, 1080, container.clientWidth, container.clientHeight);
    var detached = false;
    var destroyed = false;
    var nidToNode = /* @__PURE__ */ new Map();
    var nodeToNid = /* @__PURE__ */ new WeakMap();
    var mediaFirstBind = /* @__PURE__ */ new Set();
    var frameLoadHandlers = /* @__PURE__ */ new WeakMap();
    var nodeHighlightEl = null;
    var pendingSubtreeRequests = /* @__PURE__ */ new Map();
    var nextSubtreeRequestId = 1;
    function incrementCounter(counter, type) {
      var key = typeof type === "string" && type ? type : "unknown";
      counter[key] = (counter[key] || 0) + 1;
    }
    function copyCounters(counter) {
      var out = {};
      for (var key in counter) {
        if (Object.prototype.hasOwnProperty.call(counter, key)) out[key] = counter[key];
      }
      return out;
    }
    function copyErrors(errors) {
      if (!Array.isArray(errors)) return [];
      return errors.map(function(entry) {
        var e = entry || {};
        return {
          code: typeof e.code === "string" ? e.code : "",
          reason: typeof e.reason === "string" ? e.reason : "",
          ts: typeof e.ts === "number" ? e.ts : 0
        };
      });
    }
    function sanitizeTransportStatus(status) {
      var s = status || {};
      return {
        state: typeof s.state === "string" ? s.state : typeof s.status === "string" ? s.status : "",
        reason: typeof s.reason === "string" ? s.reason : "",
        readyState: typeof s.readyState === "number" ? s.readyState : null,
        bufferedAmount: typeof s.bufferedAmount === "number" ? s.bufferedAmount : 0,
        drops: typeof s.drops === "number" ? s.drops : 0,
        errors: copyErrors(s.errors),
        lastCloseAt: typeof s.lastCloseAt === "number" ? s.lastCloseAt : 0,
        lastSendAt: typeof s.lastSendAt === "number" ? s.lastSendAt : 0,
        lastReceiveAt: typeof s.lastReceiveAt === "number" ? s.lastReceiveAt : 0,
        closeCode: typeof s.closeCode === "number" ? s.closeCode : null,
        closeReason: typeof s.closeReason === "string" ? s.closeReason : "",
        sentByType: copyCounters(s.sentByType || {}),
        receivedByType: copyCounters(s.receivedByType || {})
      };
    }
    function currentTransportHealth() {
      var live = {};
      if (transport && typeof transport.getHealth === "function") {
        try {
          live = sanitizeTransportStatus(transport.getHealth());
        } catch (err) {
          logger.error("[Renderer] transport health failed", err);
        }
      }
      return Object.assign(sanitizeTransportStatus(lastTransportStatus), live);
    }
    function cloneStateEvent(event) {
      return {
        state: event.state,
        reason: event.reason,
        ts: event.ts
      };
    }
    function healthSnapshot() {
      return {
        state: publicState,
        ts: Date.now(),
        lastFrameAt,
        lastSnapshotAt,
        lastMutationAt,
        receivedByType: copyCounters(receivedByType),
        sentByType: copyCounters(sentByType),
        staleMisses: counters.staleMisses,
        applyFailures: counters.applyFailures,
        resyncPending,
        sanitizer: copyCounters(sanitizeCounters),
        transport: currentTransportHealth()
      };
    }
    function notifyState() {
      var event = cloneStateEvent(publicStateEvent);
      stateListeners.forEach(function(handler) {
        try {
          handler(cloneStateEvent(event));
        } catch (err) {
          logger.error("[Renderer] event handler failed", "state", err);
        }
      });
    }
    function notifyHealth() {
      var event = healthSnapshot();
      healthListeners.forEach(function(handler) {
        try {
          handler(healthSnapshot());
        } catch (err) {
          logger.error("[Renderer] event handler failed", "health", err);
        }
      });
      return event;
    }
    function clearDisconnectTimer() {
      if (!disconnectTimer) return;
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
    function setPublicState(state, reason) {
      if (state !== "connecting" && state !== "live" && state !== "stale" && state !== "disconnected") {
        return;
      }
      if (state !== "stale") clearDisconnectTimer();
      if (publicState === state) return;
      publicState = state;
      publicStateEvent = {
        state,
        reason: reason || "",
        ts: Date.now()
      };
      notifyState();
      notifyHealth();
    }
    function scheduleDisconnected(reason) {
      clearDisconnectTimer();
      disconnectTimer = setTimeout(function() {
        disconnectTimer = null;
        if (detached || destroyed || publicState !== "stale") return;
        setPublicState("disconnected", reason || "transport-closed");
      }, disconnectDelayMs);
    }
    function on(eventName, handler) {
      if (eventName !== "state" && eventName !== "health" || typeof handler !== "function") {
        throw new Error("viewer-event-unsupported");
      }
      var listeners = eventName === "state" ? stateListeners : healthListeners;
      listeners.add(handler);
      try {
        handler(eventName === "state" ? cloneStateEvent(publicStateEvent) : healthSnapshot());
      } catch (err) {
        logger.error("[Renderer] event handler failed", eventName, err);
      }
      return function unsubscribeViewerEvent() {
        listeners.delete(handler);
      };
    }
    function safeSend(type, payload) {
      incrementCounter(sentByType, type);
      notifyHealth();
      try {
        var result = transport.send(type, payload);
        if (result && typeof result.catch === "function") {
          result.catch(function(err) {
            logger.error("[Renderer] transport send failed", err);
          });
        }
      } catch (err) {
        logger.error("[Renderer] transport send failed", err);
      }
    }
    function requestResync(reason, details) {
      if (resyncPending) return;
      resyncPending = true;
      setPublicState("stale", reason || "preview-resync");
      safeSend(CONTROL.START, {
        trigger: "preview-resync",
        reason: reason || "unknown"
      });
    }
    function clearSubtreeLatch(payload) {
      var p = payload || {};
      if (p.nid === void 0 || p.nid === null || p.requestId === void 0 || p.requestId === null) {
        return false;
      }
      var key = String(p.nid);
      var requestId = String(p.requestId);
      var pending = pendingSubtreeRequests.get(key);
      if (!pending || pending.requestId !== requestId) return false;
      pendingSubtreeRequests.delete(key);
      return true;
    }
    function requestSubtree(nid, options2) {
      if (nid === void 0 || nid === null) return null;
      var key = String(nid);
      if (!key) return null;
      var target = resolveIndexedNode(key);
      if (!target) return null;
      if (pendingSubtreeRequests.has(key)) return null;
      var opts = options2 || {};
      var reason = typeof opts === "string" ? opts : opts.reason || "truncated-region";
      var requestId = "subtree_" + Date.now().toString(36) + "_" + nextSubtreeRequestId++;
      pendingSubtreeRequests.set(key, { requestId });
      safeSend(CONTROL.SUBTREE_REQUEST, {
        requestId,
        nid: key,
        streamSessionId: active.streamSessionId || "",
        snapshotId: active.snapshotId || 0,
        reason: reason || "truncated-region"
      });
      return requestId;
    }
    function markLive(reason) {
      setPublicState("live", reason || "frame");
    }
    function handleTransportStatus(status) {
      if (detached) return;
      lastTransportStatus = sanitizeTransportStatus(status);
      var before = publicState;
      var s = status && (status.state || status.status);
      if (s === "closed") {
        setPublicState("stale", "transport-closed");
        scheduleDisconnected("transport-closed");
      } else if (s === "reconnecting" || s === "error") {
        setPublicState("stale", "transport-" + s);
      } else if (s === "open" || s === "connected") {
        if (viewerState === "streaming" || lastSnapshotPayload) {
          markLive("transport-open");
        } else {
          setPublicState("connecting", "transport-open");
        }
      } else if (s === "connecting") {
        if (publicState !== "live") setPublicState("connecting", "transport-connecting");
      }
      if (before === publicState) notifyHealth();
    }
    function handleStreamState(payload) {
      var p = payload || {};
      var state = p.state || p.status;
      if (state !== "connecting" && state !== "live" && state !== "stale" && state !== "disconnected") {
        return;
      }
      setPublicState(state, p.reason || "stream-state");
    }
    function updateScale() {
      var p = lastSnapshotPayload || {};
      scaleState = computeScale(
        p.viewportWidth || p.pageWidth || 1920,
        p.viewportHeight || 1080,
        container.clientWidth,
        container.clientHeight
      );
      iframe.style.width = scaleState.pageW + "px";
      iframe.style.height = scaleState.pageH + "px";
      iframe.style.left = scaleState.offsetX + "px";
      iframe.style.top = scaleState.offsetY + "px";
      iframe.style.transform = "scale(" + scaleState.s + ")";
    }
    function getViewportMapping() {
      return {
        scale: {
          s: scaleState.s,
          offsetX: scaleState.offsetX,
          offsetY: scaleState.offsetY,
          pageW: scaleState.pageW,
          pageH: scaleState.pageH
        },
        viewport: {
          width: scaleState.pageW,
          height: scaleState.pageH
        },
        container: {
          width: container.clientWidth || 0,
          height: container.clientHeight || 0
        }
      };
    }
    function clearIdentityIndex() {
      nidToNode.clear();
      nodeToNid = /* @__PURE__ */ new WeakMap();
    }
    function elementsInSubtree(root2) {
      var elements = [];
      if (!root2) return elements;
      if (root2.nodeType === 1) elements.push(root2);
      if (root2.querySelectorAll) {
        var descendants = root2.querySelectorAll("*");
        for (var i = 0; i < descendants.length; i++) elements.push(descendants[i]);
      }
      return elements;
    }
    function pairIdentityElements(elements, nodeIds, scope) {
      var ids = Array.isArray(nodeIds) ? nodeIds : [];
      if (elements.length !== ids.length) {
        logger.warn("[Renderer] identity sidecar mismatch", {
          scope: scope || "",
          elements: elements.length,
          nodeIds: ids.length
        });
      }
      for (var i = 0; i < elements.length && i < ids.length; i++) {
        if (ids[i] === void 0 || ids[i] === null) continue;
        var nid = String(ids[i]);
        nidToNode.set(nid, elements[i]);
        nodeToNid.set(elements[i], nid);
      }
    }
    function resetIdentityIndex(targetDoc, nodeIds) {
      clearIdentityIndex();
      if (!targetDoc || !targetDoc.body) return;
      pairIdentityElements(
        Array.prototype.slice.call(targetDoc.body.querySelectorAll("*")),
        nodeIds,
        "snapshot"
      );
    }
    function resolveIndexedNode(nid) {
      if (nid === void 0 || nid === null) return null;
      return nidToNode.get(String(nid)) || null;
    }
    function indexSubtree(root2, nodeIds) {
      pairIdentityElements(elementsInSubtree(root2), nodeIds, "add");
    }
    function removeIndexedSubtree(root2) {
      var elements = elementsInSubtree(root2);
      for (var i = 0; i < elements.length; i++) {
        var nid = nodeToNid.get(elements[i]);
        if (nid) nidToNode.delete(nid);
        nodeToNid.delete(elements[i]);
      }
    }
    function cssEscapeIdent(value) {
      var input = String(value || "");
      if (win && win.CSS && typeof win.CSS.escape === "function") {
        return win.CSS.escape(input);
      }
      return input.replace(/[^a-zA-Z0-9_-]/g, function(ch) {
        return "\\" + ch.charCodeAt(0).toString(16) + " ";
      });
    }
    function hasDangerousStylesheetUrl2(value) {
      if (!value || typeof value !== "string") return false;
      var compact = value.replace(/[\u0000-\u0020]+/g, "").toLowerCase();
      return compact.indexOf("javascript:") === 0 || compact.indexOf("vbscript:") === 0 || compact.indexOf("data:text/html") === 0;
    }
    function setScopedStyleText(styleEl2, cssText) {
      styleEl2.textContent = scrubCssText(String(cssText || ""));
    }
    function findStyleSourceElement(rootNode, sourceId) {
      if (!rootNode || !rootNode.querySelector) return null;
      try {
        return rootNode.querySelector('[data-ps-style-source-id="' + cssEscapeIdent(sourceId) + '"]');
      } catch (err) {
        var nodes = rootNode.querySelectorAll ? rootNode.querySelectorAll("[data-ps-style-source-id]") : [];
        for (var i = 0; i < nodes.length; i++) {
          if (nodes[i].getAttribute("data-ps-style-source-id") === String(sourceId || "")) return nodes[i];
        }
        return null;
      }
    }
    function installOneStyleSource(targetDoc, rootNode, source) {
      var s = source || {};
      if (!targetDoc || !rootNode || !s.sourceId) return false;
      var existing = findStyleSourceElement(rootNode, s.sourceId);
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      var el = null;
      if (s.href && !hasDangerousStylesheetUrl2(s.href)) {
        el = targetDoc.createElement("link");
        el.setAttribute("rel", "stylesheet");
        el.setAttribute("href", String(s.href || ""));
      } else {
        el = targetDoc.createElement("style");
        setScopedStyleText(el, s.cssText || "");
      }
      el.setAttribute("data-ps-style-source-id", String(s.sourceId));
      if (s.media) el.setAttribute("media", String(s.media));
      if (s.disabled) el.setAttribute("data-ps-style-disabled", "true");
      rootNode.appendChild(el);
      if (s.disabled) {
        try {
          el.disabled = true;
        } catch (err) {
        }
      }
      return true;
    }
    function installStyleSources(targetDoc, styleSources, scopeContext) {
      var sources = Array.isArray(styleSources) ? styleSources.slice() : [];
      if (!targetDoc) return false;
      var scope = scopeContext || { kind: "document" };
      var rootNode = null;
      if (scope.kind === "document") {
        rootNode = targetDoc.head || targetDoc.documentElement;
      } else if (scope.kind === "shadow") {
        var host = resolveIndexedNode(scope.hostNid);
        rootNode = host && host.shadowRoot ? host.shadowRoot : null;
      } else if (scope.kind === "frame") {
        rootNode = targetDoc.head || targetDoc.documentElement;
      }
      if (!rootNode) {
        logger.warn("[Renderer] style source scope missing", {
          scopeKind: scope.kind || "",
          reason: "stale-style-scope"
        });
        return false;
      }
      sources.sort(function(a, b) {
        return (a && typeof a.order === "number" ? a.order : 0) - (b && typeof b.order === "number" ? b.order : 0);
      });
      for (var i = 0; i < sources.length; i++) {
        var source = sources[i] || {};
        var sourceScope = source.scope || {};
        if (sourceScope.kind !== scope.kind) continue;
        if (scope.kind === "shadow" && String(sourceScope.hostNid || "") !== String(scope.hostNid || "")) continue;
        if (scope.kind === "frame" && String(sourceScope.frameNid || "") !== String(scope.frameNid || "")) continue;
        installOneStyleSource(targetDoc, rootNode, source);
      }
      return true;
    }
    function rootForStyleScope(targetDoc, scope) {
      var s = scope || {};
      if (!targetDoc) return null;
      if (s.kind === "document") return { doc: targetDoc, root: targetDoc.head || targetDoc.documentElement };
      if (s.kind === "shadow") {
        var host = resolveIndexedNode(s.hostNid);
        if (!host || !host.shadowRoot) return null;
        return { doc: targetDoc, root: host.shadowRoot };
      }
      if (s.kind === "frame") {
        var frameEl = resolveIndexedNode(s.frameNid);
        var frameDoc = null;
        try {
          frameDoc = frameEl && frameEl.contentDocument;
        } catch (err) {
          frameDoc = null;
        }
        if (!frameDoc || !frameDoc.head) return null;
        return { doc: frameDoc, root: frameDoc.head };
      }
      return null;
    }
    function applyStyleSource(action, sourceId, scope, source) {
      var targetDoc = iframe.contentDocument;
      var resolved = rootForStyleScope(targetDoc, scope);
      if (!resolved || !resolved.root) {
        logger.warn("[Renderer] style source scope missing", {
          sourceId: sourceId || "",
          scopeKind: scope && scope.kind ? scope.kind : "",
          reason: "stale-style-scope"
        });
        return false;
      }
      var existing = findStyleSourceElement(resolved.root, sourceId);
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      return installOneStyleSource(resolved.doc, resolved.root, source || {});
    }
    function removeStyleSource(sourceId, scope) {
      var targetDoc = iframe.contentDocument;
      var resolved = rootForStyleScope(targetDoc, scope);
      if (!resolved || !resolved.root) {
        logger.warn("[Renderer] style source scope missing", {
          sourceId: sourceId || "",
          scopeKind: scope && scope.kind ? scope.kind : "",
          reason: "stale-style-scope"
        });
        return false;
      }
      var existing = findStyleSourceElement(resolved.root, sourceId);
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      return true;
    }
    function installOneShadowRoot(targetDoc, payload) {
      var p = payload || {};
      if (!targetDoc || !p.hostNid) return false;
      if (p.mode && p.mode !== "open") return false;
      var host = resolveIndexedNode(p.hostNid);
      if (!host) {
        logger.warn("[Renderer] shadow root host missing", { hostNid: p.hostNid || "" });
        return false;
      }
      var shadowRoot = host.shadowRoot || null;
      if (!shadowRoot) {
        if (typeof host.attachShadow !== "function") {
          logger.warn("[Renderer] shadow root unsupported", { hostNid: p.hostNid || "" });
          return false;
        }
        try {
          shadowRoot = host.attachShadow({ mode: "open" });
        } catch (err) {
          logger.warn("[Renderer] shadow root attach failed", {
            hostNid: p.hostNid || "",
            error: err && err.message ? err.message : String(err)
          });
          return false;
        }
      }
      removeIndexedSubtree(shadowRoot);
      while (shadowRoot.firstChild) shadowRoot.removeChild(shadowRoot.firstChild);
      var tpl = targetDoc.createElement("template");
      tpl.innerHTML = p.html || "";
      sanitizeFragment(tpl.content, sanitizeCounters, logger);
      shadowRoot.appendChild(targetDoc.importNode(tpl.content, true));
      installStyleSources(targetDoc, p.styleSources || [], { kind: "shadow", hostNid: p.hostNid });
      pairIdentityElements(
        Array.prototype.slice.call(shadowRoot.querySelectorAll("*")),
        p.nodeIds || [],
        "shadow"
      );
      return true;
    }
    function installShadowRoots(targetDoc, shadowRoots) {
      if (!Array.isArray(shadowRoots)) return;
      for (var i = 0; i < shadowRoots.length; i++) {
        installOneShadowRoot(targetDoc, shadowRoots[i]);
      }
    }
    function setFrameLoadHandler(frameEl, handler) {
      if (!frameEl || typeof frameEl.addEventListener !== "function") return;
      var existing = frameLoadHandlers.get(frameEl);
      if (existing && typeof frameEl.removeEventListener === "function") {
        frameEl.removeEventListener("load", existing);
      }
      frameEl.addEventListener("load", handler);
      frameLoadHandlers.set(frameEl, handler);
    }
    function indexFrameDocument(frameEl, framePayload) {
      var p = framePayload || {};
      try {
        var frameDoc = frameEl && frameEl.contentDocument;
        if (!frameDoc || !frameDoc.documentElement || !frameDoc.body) return false;
        removeIndexedSubtree(frameDoc.documentElement);
        sanitizeFragment(frameDoc.body, sanitizeCounters, logger);
        if (p.htmlNid) {
          nidToNode.set(String(p.htmlNid), frameDoc.documentElement);
          nodeToNid.set(frameDoc.documentElement, String(p.htmlNid));
        }
        if (p.bodyNid) {
          nidToNode.set(String(p.bodyNid), frameDoc.body);
          nodeToNid.set(frameDoc.body, String(p.bodyNid));
        }
        installStyleSources(frameDoc, p.styleSources || [], { kind: "frame", frameNid: p.frameNid });
        pairIdentityElements(
          Array.prototype.slice.call(frameDoc.body.querySelectorAll("*")),
          p.nodeIds || [],
          "frame"
        );
        installShadowRoots(frameDoc, p.shadowRoots || []);
        installFrames(frameDoc, p.frames || []);
        return true;
      } catch (err) {
        logger.warn("[Renderer] frame document index failed", {
          frameNid: p.frameNid || ""
        });
        return false;
      }
    }
    function installOneFrame(targetDoc, framePayload) {
      var p = framePayload || {};
      if (!targetDoc || !p.frameNid) return false;
      var frameEl = resolveIndexedNode(p.frameNid);
      if (!frameEl) {
        logger.warn("[Renderer] frame host missing", { frameNid: p.frameNid || "" });
        return false;
      }
      if (!frameEl.tagName || String(frameEl.tagName).toLowerCase() !== "iframe") {
        logger.warn("[Renderer] frame host is not iframe", { frameNid: p.frameNid || "" });
        return false;
      }
      frameEl.removeAttribute("src");
      frameEl.setAttribute("sandbox", "allow-same-origin");
      if (p.kind === "same-origin") {
        setFrameLoadHandler(frameEl, function() {
          indexFrameDocument(frameEl, p);
        });
        frameEl.setAttribute("srcdoc", buildSnapshotHtml(p));
        indexFrameDocument(frameEl, p);
        return true;
      }
      if (p.kind === "cross-origin") {
        setFrameLoadHandler(frameEl, function() {
          try {
            var placeholderDoc = frameEl.contentDocument;
            if (placeholderDoc && placeholderDoc.body) {
              sanitizeFragment(placeholderDoc.body, sanitizeCounters, logger);
            }
          } catch (err) {
            logger.warn("[Renderer] frame placeholder sanitize failed", {
              frameNid: p.frameNid || ""
            });
          }
        });
        frameEl.setAttribute("srcdoc", buildFramePlaceholderHtml(p));
        return true;
      }
      logger.warn("[Renderer] frame kind unsupported", {
        frameNid: p.frameNid || "",
        kind: p.kind || ""
      });
      return false;
    }
    function installFrames(targetDoc, frames) {
      if (!Array.isArray(frames)) return;
      for (var i = 0; i < frames.length; i++) {
        installOneFrame(targetDoc, frames[i]);
      }
    }
    function hostRectForElement(el) {
      var rect = el.getBoundingClientRect();
      return mapRectToHost(
        { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
        scaleState
      );
    }
    function resolveNidRect(nid) {
      try {
        var el = resolveIndexedNode(nid);
        if (!el) return null;
        return hostRectForElement(el);
      } catch (err) {
        logger.warn("[Renderer] nid rect resolution failed", nid, err);
        return null;
      }
    }
    function resolveNode(nid) {
      if (nid === void 0 || nid === null) return null;
      var key = String(nid);
      try {
        var el = resolveIndexedNode(key);
        if (!el) return null;
        var rect = hostRectForElement(el);
        return {
          nid: key,
          exists: true,
          rect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          },
          streamSessionId: active.streamSessionId || "",
          snapshotId: active.snapshotId || 0
        };
      } catch (err) {
        logger.warn("[Renderer] node resolution failed", key, err);
        return null;
      }
    }
    function ensureNodeHighlight() {
      if (nodeHighlightEl && nodeHighlightEl.parentNode === overlays.layer) {
        return nodeHighlightEl;
      }
      nodeHighlightEl = doc.createElement("div");
      nodeHighlightEl.className = "ps-node-highlight";
      nodeHighlightEl.setAttribute("aria-hidden", "true");
      nodeHighlightEl.style.zIndex = "15";
      nodeHighlightEl.style.display = "none";
      overlays.layer.appendChild(nodeHighlightEl);
      return nodeHighlightEl;
    }
    function clearHighlight() {
      if (!nodeHighlightEl) return;
      nodeHighlightEl.hidden = true;
      nodeHighlightEl.style.display = "none";
      nodeHighlightEl.textContent = "";
    }
    function highlightNode(nid, options2) {
      var resolved = resolveNode(nid);
      if (!resolved) return false;
      var el = ensureNodeHighlight();
      var rect = resolved.rect;
      el.hidden = false;
      el.style.top = rect.top + "px";
      el.style.left = rect.left + "px";
      el.style.width = rect.width + "px";
      el.style.height = rect.height + "px";
      el.style.display = "block";
      el.textContent = "";
      var opts = options2 || {};
      if (opts.label !== void 0 && opts.label !== null && String(opts.label) !== "") {
        var label = doc.createElement("div");
        label.className = "ps-node-highlight-label";
        label.textContent = String(opts.label);
        el.appendChild(label);
      }
      return true;
    }
    function handleSnapshot(payload) {
      var p = payload || {};
      if (typeof p.html !== "string" && p.payload && typeof p.payload === "object") {
        p = p.payload;
      }
      if (typeof p.html !== "string") {
        logger.error("[Renderer] snapshot missing html");
        return;
      }
      active.streamSessionId = p.streamSessionId || "";
      active.snapshotId = p.snapshotId || 0;
      counters.staleMisses = 0;
      counters.applyFailures = 0;
      resyncPending = false;
      pendingSubtreeRequests.clear();
      lastSnapshotAt = Date.now();
      overlays.resetOverlays();
      clearHighlight();
      lastScroll.x = p.scrollX || 0;
      lastScroll.y = p.scrollY || 0;
      lastSnapshotPayload = p;
      clearIdentityIndex();
      mediaFirstBind.clear();
      mediaPlayer.destroyAll();
      pendingHints.clear();
      hintBoundNids.clear();
      var gatedPayload = Object.assign({}, p, {
        html: gateSnapshotAssets(p.html, gateAsset)
      });
      iframe.srcdoc = buildSnapshotHtml(gatedPayload);
      markLive("snapshot");
    }
    function handleMutations(payload) {
      if (viewerState !== "streaming") return;
      if (!isCurrentStream(payload, active)) return;
      lastMutationAt = Date.now();
      var cd = iframe.contentDocument;
      applyMutations(cd, payload.mutations, counters, {
        logger,
        requestResync,
        sanitizeCounters,
        identity: {
          resolve: resolveIndexedNode,
          indexSubtree,
          removeSubtree: removeIndexedSubtree,
          installShadowRoot: function(hostNid, payload2) {
            var opPayload = Object.assign({}, payload2 || {}, { hostNid });
            installOneShadowRoot(cd, opPayload);
          },
          installFrames: function(frames) {
            installFrames(cd, frames || []);
          },
          applyStyleSource,
          removeStyleSource,
          // Phase 12 (MSEC-01) pre-write asset gate hooks for the diff applier:
          // ADD template content is gated as an inert fragment; ATTR src/poster
          // is gated per-URL before setAttribute.
          gateFragmentAssets,
          gateAssetUrl: gateAsset
        }
      });
      if (!resyncPending) markLive("mutations");
      try {
        iframe.contentWindow.scrollTo(lastScroll.x, lastScroll.y);
      } catch (e) {
      }
    }
    function handleSubtreeResponse(payload) {
      var p = payload || {};
      if (!isCurrentStream(p, active)) {
        clearSubtreeLatch(p);
        return;
      }
      if (!clearSubtreeLatch(p)) return;
      if (p.status !== "ok") return;
      var target = resolveIndexedNode(p.nid);
      if (!target || !target.parentNode || typeof target.getAttribute !== "function") return;
      if (target.getAttribute("data-phantomstream-truncated") !== "true") return;
      var targetDoc = target.ownerDocument || iframe.contentDocument;
      if (!targetDoc || !targetDoc.createElement) return;
      var tpl = targetDoc.createElement("template");
      tpl.innerHTML = p.html || "";
      sanitizeFragment(tpl.content, sanitizeCounters, logger);
      gateFragmentAssets(tpl.content);
      var newNode = tpl.content.firstElementChild;
      if (!newNode) {
        logger.warn("[Renderer] subtree response dropped: html parsed to no element", {
          nid: p.nid || ""
        });
        return;
      }
      var imported = targetDoc.importNode(newNode, true);
      removeIndexedSubtree(target);
      target.parentNode.replaceChild(imported, target);
      indexSubtree(imported, p.nodeIds || []);
      installShadowRoots(targetDoc, p.shadowRoots || []);
      installFrames(targetDoc, p.frames || []);
      lastMutationAt = Date.now();
      markLive("subtree");
    }
    function handleScroll(payload) {
      if (!isCurrentStream(payload, active)) return;
      lastScroll.x = payload && payload.scrollX || 0;
      lastScroll.y = payload && payload.scrollY || 0;
      if (viewerState !== "streaming") return;
      markLive("scroll");
      try {
        iframe.contentWindow.scrollTo({
          left: lastScroll.x,
          top: lastScroll.y,
          behavior: "smooth"
        });
      } catch (e) {
      }
    }
    function handleOverlay(payload) {
      if (viewerState !== "streaming") return;
      if (!isCurrentStream(payload, active)) return;
      overlays.handleOverlayMessage(payload, {
        scale: scaleState,
        resolveNidRect
      });
      markLive("overlay");
    }
    function handleDialog(payload) {
      if (viewerState !== "streaming") return;
      if (!isCurrentStream(payload, active)) return;
      overlays.handleDialogMessage(payload);
      markLive("dialog");
    }
    function safeInvokeMediaHook(fn, nid) {
      if (typeof fn !== "function") return;
      try {
        fn(nid);
      } catch (err) {
        logger.error("[Renderer] onMediaBlocked hook failed", err);
      }
    }
    function showBlockedPlayAffordance(el, nid) {
      overlays.show("media-blocked", {
        nid,
        onActivate: function() {
          try {
            var p = el.play();
            if (p !== void 0 && typeof p.then === "function") {
              p.then(function() {
                overlays.show("media-blocked", null);
              }).catch(function() {
              });
            } else {
              overlays.show("media-blocked", null);
            }
          } catch (e) {
          }
        }
      }, { anchorRect: resolveNidRect(nid) });
    }
    function ensurePlaying(el, nid) {
      if (!el.paused) return;
      try {
        el.muted = true;
      } catch (e) {
      }
      var p;
      try {
        p = el.play();
      } catch (e) {
        return;
      }
      if (p !== void 0 && typeof p.catch === "function") {
        p.catch(function(err) {
          if (err && err.name === "NotAllowedError") {
            showBlockedPlayAffordance(el, nid);
            safeInvokeMediaHook(onMediaBlocked, nid);
          }
        });
      }
    }
    function applyMediaAction(el, action, nid) {
      if (!action || typeof action.action !== "string") return;
      if (el.seeking) {
        if (action.action === "pause") {
          try {
            el.pause();
          } catch (e) {
          }
        }
        return;
      }
      switch (action.action) {
        case "pause":
          try {
            el.pause();
          } catch (e) {
          }
          break;
        case "seek":
        case "rejoin-edge": {
          var target;
          if (action.action === "rejoin-edge") {
            target = el.seekable && el.seekable.length > 0 ? el.seekable.end(el.seekable.length - 1) : null;
          } else {
            target = action.toTime;
          }
          if (target != null && el.readyState >= 1) {
            try {
              el.currentTime = target;
            } catch (e) {
            }
          }
          ensurePlaying(el, nid);
          break;
        }
        case "nudge":
          try {
            el.playbackRate = action.rate;
          } catch (e) {
          }
          ensurePlaying(el, nid);
          break;
        case "hold":
          if (action.revertRate != null && el.playbackRate !== action.revertRate) {
            try {
              el.playbackRate = action.revertRate;
            } catch (e) {
            }
          }
          ensurePlaying(el, nid);
          break;
        default:
          break;
      }
    }
    function handleMedia(payload) {
      if (viewerState !== "streaming") return;
      if (!isCurrentStream(payload, active)) return;
      if (mediaMode !== "reference") {
        if (mediaMode === "poster") {
          var posterNid = payload && payload.nid;
          var posterEl = resolveIndexedNode(posterNid);
          var hasPoster = !!(posterEl && posterEl.getAttribute && posterEl.getAttribute("poster"));
          if (posterEl && !hasPoster) {
            overlays.show("media-poster", { nid: posterNid }, { anchorRect: resolveNidRect(posterNid) });
          } else {
            overlays.show("media-poster", null);
          }
        }
        markLive("media");
        return;
      }
      var nid = payload && payload.nid;
      var el = resolveIndexedNode(nid);
      if (!el || typeof el.play !== "function") return;
      maybeConsumePageHint(el, nid);
      var localState = {
        currentTime: el.currentTime,
        paused: !!el.paused,
        playbackRate: el.playbackRate,
        seeking: !!el.seeking,
        readyState: el.readyState
      };
      var action = reconcileMediaDrift(localState, payload, Date.now(), mediaReconcileConfig);
      applyMediaAction(el, action, nid);
      evaluateUnmuteTrigger(el, payload, nid);
      markLive("media");
    }
    function mediaElementHasNoSource(el) {
      try {
        if (el.getAttribute && el.getAttribute("src")) return false;
        if (el.currentSrc) return false;
        if (typeof el.querySelector === "function") {
          var sourced = el.querySelector("source[src]");
          if (sourced) return false;
        }
        return true;
      } catch (e) {
        return false;
      }
    }
    function maybeConsumePageHint(el, nid) {
      if (pendingHints.size === 0) return;
      var key = String(nid);
      if (hintBoundNids.has(key)) return;
      if (!mediaElementHasNoSource(el)) return;
      var chosen = null;
      pendingHints.forEach(function(hint) {
        if (!chosen || hint.storedAt >= chosen.storedAt) chosen = hint;
      });
      if (!chosen) return;
      pendingHints.delete(chosen.kind);
      hintBoundNids.add(key);
      bindAdaptiveHint(el, key, chosen.manifestUrl, chosen.kind, chosen.contentType);
    }
    function bindAdaptiveHint(el, nid, manifestUrl, kind, contentType) {
      try {
        mediaPlayer.attach(el, manifestUrl, { nid: String(nid), kind, contentType });
      } catch (e) {
        logger.warn("[Renderer] adaptive hint bind failed", { nid: String(nid) });
      }
    }
    function handleMediaHint(payload) {
      if (viewerState !== "streaming") return;
      if (!isCurrentStream(payload, active)) return;
      if ((!payload || !payload.streamSessionId) && !active.streamSessionId) return;
      if (mediaMode !== "reference") {
        markLive("media");
        return;
      }
      var p = payload || {};
      var manifestUrl = p.manifestUrl;
      if (!manifestUrl || typeof manifestUrl !== "string") {
        markLive("media");
        return;
      }
      var nid = p.nid != null ? p.nid : null;
      if (!gateAsset(manifestUrl, "media").allow) {
        mediaPlayer.degrade(nid != null ? String(nid) : null, "no-manifest");
        markLive("media");
        return;
      }
      var kind = p.kind === "hls" || p.kind === "dash" ? p.kind : null;
      var scope = p.scope === "element" ? "element" : p.scope === "page" ? "page" : nid != null ? "element" : "page";
      if (scope === "element" && nid != null) {
        var el = resolveIndexedNode(nid);
        if (el && typeof el.play === "function" && mediaElementHasNoSource(el)) {
          hintBoundNids.add(String(nid));
          bindAdaptiveHint(el, nid, manifestUrl, kind, p.contentType);
        } else {
          logger.warn("[Renderer] element-scope media hint dropped (unresolved or non-opaque nid)", {
            nid: String(nid),
            reason: el ? "not-opaque" : "unresolved"
          });
        }
        markLive("media");
        return;
      }
      pendingHints.set(kind || "hls", {
        manifestUrl,
        kind: kind || "hls",
        contentType: p.contentType,
        storedAt: Date.now()
      });
      markLive("media");
    }
    function evaluateUnmuteTrigger(el, payload, nid) {
      var sourceUnmuted = payload && payload.muted === false;
      if (el.muted === true && sourceUnmuted) {
        var vol = payload && typeof payload.volume === "number" ? payload.volume : null;
        overlays.show("media-unmute", {
          nid,
          onActivate: function() {
            try {
              el.muted = false;
            } catch (e) {
            }
            if (vol != null) {
              try {
                el.volume = vol;
              } catch (e2) {
              }
            }
            overlays.show("media-unmute", null);
          }
        }, { anchorRect: resolveNidRect(nid) });
      } else {
        overlays.show("media-unmute", null);
      }
    }
    function applyMediaBaseline(baseline) {
      if (mediaMode !== "reference") return;
      if (!Array.isArray(baseline) || baseline.length === 0) return;
      for (var i = 0; i < baseline.length; i++) {
        var entry = baseline[i];
        if (!entry || entry.nid == null) continue;
        var key = String(entry.nid);
        if (mediaFirstBind.has(key)) continue;
        var el = resolveIndexedNode(key);
        if (!el || typeof el.play !== "function") continue;
        mediaFirstBind.add(key);
        try {
          if (typeof entry.currentTime === "number" && el.readyState >= 1) {
            el.currentTime = entry.currentTime;
          }
          if (typeof entry.playbackRate === "number") el.playbackRate = entry.playbackRate;
          if (entry.paused === false) {
            ensurePlaying(el, key);
          }
        } catch (e) {
          logger.warn("[Renderer] media baseline apply failed", { nid: key });
        }
      }
    }
    function dispatch(type, payload) {
      if (detached) return;
      incrementCounter(receivedByType, type);
      lastFrameAt = Date.now();
      try {
        switch (type) {
          case STREAM.SNAPSHOT:
            handleSnapshot(payload);
            break;
          case STREAM.MUTATIONS:
            handleMutations(payload);
            break;
          case STREAM.SUBTREE_RESPONSE:
            handleSubtreeResponse(payload);
            break;
          case STREAM.SCROLL:
            handleScroll(payload);
            break;
          case STREAM.OVERLAY:
            handleOverlay(payload);
            break;
          case STREAM.DIALOG:
            handleDialog(payload);
            break;
          case STREAM.MEDIA:
            handleMedia(payload);
            break;
          case STREAM.MEDIA_HINT:
            handleMediaHint(payload);
            break;
          case STREAM.STATE:
            handleStreamState(payload);
            break;
          default:
            break;
        }
      } catch (err) {
        logger.error("[Renderer] message handler failed", type, err);
      }
      notifyHealth();
    }
    var unsubscribe = transport.onMessage(dispatch);
    var unsubscribeStatus = null;
    if (typeof transport.onStatus === "function") {
      unsubscribeStatus = transport.onStatus(handleTransportStatus);
    }
    function onWindowResize() {
      if (viewerState === "streaming") updateScale();
    }
    if (win && typeof win.addEventListener === "function") {
      win.addEventListener("resize", onWindowResize);
    }
    var resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(function() {
        if (viewerState === "streaming") updateScale();
      });
      resizeObserver.observe(container);
    }
    function detach() {
      if (detached) return;
      detached = true;
      try {
        if (typeof unsubscribe === "function") unsubscribe();
      } catch (err) {
        logger.error("[Renderer] transport unsubscribe failed", err);
      }
      try {
        if (typeof unsubscribeStatus === "function") unsubscribeStatus();
      } catch (err) {
        logger.error("[Renderer] transport status unsubscribe failed", err);
      }
      clearDisconnectTimer();
      if (win && typeof win.removeEventListener === "function") {
        win.removeEventListener("resize", onWindowResize);
      }
      if (resizeObserver) {
        try {
          resizeObserver.disconnect();
        } catch (err) {
        }
        resizeObserver = null;
      }
      if (root.parentNode) root.parentNode.removeChild(root);
    }
    function destroy() {
      detach();
      if (destroyed) return;
      destroyed = true;
      overlays.resetOverlays();
      clearHighlight();
      nodeHighlightEl = null;
      clearIdentityIndex();
      frameLoadHandlers = /* @__PURE__ */ new WeakMap();
      lastSnapshotPayload = null;
      active.streamSessionId = "";
      active.snapshotId = 0;
      counters.staleMisses = 0;
      counters.applyFailures = 0;
      sanitizeCounters.strippedHandlers = 0;
      sanitizeCounters.blockedUrls = 0;
      sanitizeCounters.droppedSubtrees = 0;
      sanitizeCounters.cssScrubs = 0;
      resyncPending = false;
      pendingSubtreeRequests.clear();
      receivedByType = {};
      sentByType = {};
      lastFrameAt = 0;
      lastSnapshotAt = 0;
      lastMutationAt = 0;
      lastTransportStatus = {};
      stateListeners.clear();
      healthListeners.clear();
      viewerState = "waiting";
    }
    function registerOverlay(kind, renderFn) {
      overlays.register(kind, renderFn);
    }
    return {
      detach,
      destroy,
      clearHighlight,
      getViewportMapping,
      highlightNode,
      on,
      registerOverlay,
      requestSubtree,
      resolveNode,
      // Host-driven snapshot entry point (Phase 12): viewers wired without a
      // wire transport (the asset-fetch-gate path) render a snapshot by calling
      // this directly. Identical to the dispatch() STREAM.SNAPSHOT target and
      // accepts either a bare payload or a { type, payload } envelope.
      handleSnapshot
    };
  }

  // node_modules/@full-self-browsing/phantom-stream/src/protocol/constants.js
  var RELAY_PER_MESSAGE_LIMIT_BYTES = 1048576;
  var SNAPSHOT_BUDGET_FRACTION = 0.8;
  var SNAPSHOT_BUDGET_BYTES = Math.floor(
    RELAY_PER_MESSAGE_LIMIT_BYTES * SNAPSHOT_BUDGET_FRACTION
  );

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

  // showcase/js/phantom-stream-viewer-entry.js
  function noop() {
  }
  function normalizeLogger(logger) {
    var base = logger || console;
    return {
      info: typeof base.info === "function" ? base.info.bind(base) : noop,
      warn: typeof base.warn === "function" ? base.warn.bind(base) : noop,
      error: typeof base.error === "function" ? base.error.bind(base) : noop
    };
  }
  function safeCall(fn, args, logger, label) {
    if (typeof fn !== "function") return void 0;
    try {
      return fn.apply(null, args || []);
    } catch (err) {
      logger.error("[FSB Viewer] callback failed", label || "", err);
      return void 0;
    }
  }
  function localizedText(copy, key, fallback) {
    return copy && typeof copy[key] === "string" ? copy[key] : fallback;
  }
  function installLocalizedProgressRenderer(viewer, copy, logger) {
    var helpers = globalThis.FSBDashboardRuntimeState || {};
    if (!viewer || typeof viewer.registerOverlay !== "function" || typeof helpers.formatProgressOverlay !== "function") {
      return;
    }
    viewer.registerOverlay("progress", function(value, _anchorRect, layer) {
      var element = layer && typeof layer.querySelector === "function" ? layer.querySelector(".ps-overlay-progress") : null;
      if (!element) return;
      if (!value) {
        element.style.display = "none";
        return;
      }
      try {
        element.textContent = helpers.formatProgressOverlay(value, copy || {});
        element.style.display = "block";
      } catch (error) {
        logger.warn("[FSB Viewer] could not format localized progress", error);
        var working = localizedText(copy, "phaseWorking", "Working");
        element.textContent = working + " - " + working;
        element.style.display = "block";
      }
    });
  }
  function payloadMayInstallFrames(type, payload) {
    if (type === STREAM.SNAPSHOT || type === STREAM.SUBTREE_RESPONSE) return true;
    if (type !== STREAM.MUTATIONS || !payload || !Array.isArray(payload.mutations)) return false;
    return payload.mutations.some(function(mutation) {
      if (!mutation || typeof mutation !== "object") return false;
      return mutation.op === "frame" || mutation.op === "shadow-root" || Array.isArray(mutation.frames) && mutation.frames.length > 0 || Array.isArray(mutation.shadowRoots) && mutation.shadowRoots.length > 0;
    });
  }
  function payloadMayRemoveFrames(type, payload) {
    if (type !== STREAM.MUTATIONS || !payload || !Array.isArray(payload.mutations)) return false;
    return payload.mutations.some(function(mutation) {
      return !!(mutation && typeof mutation === "object" && mutation.op === "rm");
    });
  }
  function installViewerLocalization(container, copy, logger) {
    if (!container) return { reconcile: noop, refresh: noop, stop: noop };
    var strings = copy || {};
    var frameLoadCleanup = /* @__PURE__ */ new WeakMap();
    var frameDocumentCleanup = /* @__PURE__ */ new WeakMap();
    var frameDocument = /* @__PURE__ */ new WeakMap();
    var frameRefByFrame = /* @__PURE__ */ new WeakMap();
    var frameRefs = /* @__PURE__ */ new Set();
    var frameFinalizer = typeof FinalizationRegistry === "function" ? new FinalizationRegistry(function(ref) {
      frameRefs.delete(ref);
    }) : null;
    var stopped = false;
    function text(key, fallback) {
      return localizedText(strings, key, fallback);
    }
    function elementsWithin(root, selector) {
      var start = root && root.nodeType === 3 ? root.parentElement : root;
      if (!start) return [];
      var elements = [];
      if (typeof start.matches === "function" && start.matches(selector)) elements.push(start);
      if (typeof start.querySelectorAll === "function") {
        var descendants = start.querySelectorAll(selector);
        for (var i = 0; i < descendants.length; i += 1) elements.push(descendants[i]);
      }
      return elements;
    }
    function replaceExact(root, selector, expected, replacement) {
      elementsWithin(root, selector).forEach(function(element) {
        if (element.textContent === expected && replacement !== expected) {
          element.textContent = replacement;
        }
      });
    }
    function addLoadListener(target, handler, capture) {
      target.addEventListener("load", handler, !!capture);
      return function removeLoadListener() {
        target.removeEventListener("load", handler, !!capture);
      };
    }
    function trackFrame(frame) {
      if (frameRefByFrame.has(frame) || typeof WeakRef !== "function") return;
      var ref = new WeakRef(frame);
      frameRefByFrame.set(frame, ref);
      frameRefs.add(ref);
      if (frameFinalizer) frameFinalizer.register(frame, ref, ref);
    }
    function untrackFrame(frame) {
      var ref = frameRefByFrame.get(frame);
      if (!ref) return;
      frameRefs.delete(ref);
      frameRefByFrame.delete(frame);
      if (frameFinalizer) frameFinalizer.unregister(ref);
    }
    function framesWithin(root) {
      var frames = [];
      var seenFrames = /* @__PURE__ */ new WeakSet();
      var seenRoots = /* @__PURE__ */ new WeakSet();
      function visit(currentRoot) {
        if (!currentRoot || seenRoots.has(currentRoot)) return;
        seenRoots.add(currentRoot);
        elementsWithin(currentRoot, "iframe").forEach(function(frame) {
          if (!seenFrames.has(frame)) {
            seenFrames.add(frame);
            frames.push(frame);
          }
        });
        var hosts = elementsWithin(currentRoot, "*");
        var start = currentRoot && currentRoot.nodeType === 3 ? currentRoot.parentElement : currentRoot;
        if (start && start.shadowRoot) hosts.push(start);
        hosts.forEach(function(host) {
          if (host && host.shadowRoot) visit(host.shadowRoot);
        });
      }
      visit(root);
      return frames;
    }
    function isRendererPlaceholderDocument(frame, doc) {
      var srcdoc = frame && typeof frame.getAttribute === "function" ? frame.getAttribute("srcdoc") || "" : "";
      if (srcdoc.indexOf('<meta name="viewport"') !== -1 || srcdoc.indexOf(
        '<meta charset="UTF-8"><style>body{margin:0;font:13px system-ui,sans-serif;color:#30333a;background:#f6f7f9;}.ps-frame-placeholder{'
      ) === -1) {
        return false;
      }
      var body = doc && doc.body;
      if (!body || !body.children || body.children.length !== 1) return false;
      var onlyChild = body.firstElementChild;
      return !!(onlyChild && typeof onlyChild.matches === "function" && onlyChild.matches('.ps-frame-placeholder[role="note"]'));
    }
    function localizeFrameDocument(frame, doc) {
      if (!doc) return;
      if (isRendererPlaceholderDocument(frame, doc)) {
        replaceExact(doc, ".ps-frame-placeholder strong", "Cross-origin iframe", text("viewerCrossOriginFrame", "Cross-origin iframe"));
        elementsWithin(doc, ".ps-frame-placeholder p").forEach(function(element) {
          var value = element.textContent || "";
          if (value.indexOf("Origin: ") === 0) {
            element.textContent = text("viewerOriginLabel", "Origin") + ": " + value.slice(8);
          } else if (value.indexOf("Source: ") === 0) {
            element.textContent = text("viewerSourceLabel", "Source") + ": " + value.slice(8);
          }
        });
      }
      wireFrames(doc, false);
    }
    function localizeCurrentFrame(frame) {
      if (stopped) return;
      try {
        var doc = frame.contentDocument;
        if (!doc) return;
        if (frameDocument.get(frame) === doc) {
          localizeFrameDocument(frame, doc);
          return;
        }
        var previousDocument = frameDocument.get(frame);
        if (previousDocument) unwireFrames(previousDocument);
        var previousCleanup = frameDocumentCleanup.get(frame);
        if (previousCleanup) previousCleanup();
        var onNestedFrameLoad = function(event) {
          var target = event && event.target;
          if (target && String(target.tagName || "").toLowerCase() === "iframe") {
            wireFrame(target);
          }
        };
        frameDocument.set(frame, doc);
        frameDocumentCleanup.set(frame, addLoadListener(doc, onNestedFrameLoad, true));
        localizeFrameDocument(frame, doc);
      } catch (error) {
        logger.warn("[FSB Viewer] could not localize nested frame", error);
      }
    }
    function wireFrame(frame) {
      if (!frameLoadCleanup.has(frame)) {
        var onFrameLoad = function() {
          localizeCurrentFrame(frame);
        };
        frameLoadCleanup.set(frame, addLoadListener(frame, onFrameLoad, false));
        trackFrame(frame);
      }
      localizeCurrentFrame(frame);
    }
    function wireFrames(root, includeHostTitle) {
      framesWithin(root).forEach(function(frame) {
        if (includeHostTitle && frame.getAttribute("title") === "PhantomStream live mirror") {
          var title = text("viewerLiveMirrorTitle", "PhantomStream live mirror");
          if (title !== frame.getAttribute("title")) frame.setAttribute("title", title);
        }
        wireFrame(frame);
      });
    }
    function localizeHostTree(root) {
      wireFrames(root, true);
      elementsWithin(root, '[aria-label="Play mirrored media"]').forEach(function(element) {
        var label = text("viewerPlayMedia", "Play mirrored media");
        if (label !== element.getAttribute("aria-label")) element.setAttribute("aria-label", label);
      });
      elementsWithin(root, '[aria-label="Unmute mirrored media"]').forEach(function(element) {
        var label = text("viewerUnmuteMedia", "Unmute mirrored media");
        if (label !== element.getAttribute("aria-label")) element.setAttribute("aria-label", label);
      });
      replaceExact(root, ".ps-overlay-media-unmute-label", "Unmute", text("viewerUnmute", "Unmute"));
      replaceExact(root, ".ps-overlay-media-poster", "Media (poster only)", text("viewerMediaPosterOnly", "Media (poster only)"));
      replaceExact(root, ".ps-overlay-media-unavailable", "Media unavailable", text("viewerMediaUnavailable", "Media unavailable"));
      elementsWithin(root, ".ps-overlay-dialog-type").forEach(function(element) {
        var replacement = "";
        switch (element.textContent || "") {
          case "Alert":
            replacement = text("dialogAlert", "Alert");
            break;
          case "Confirm":
            replacement = text("dialogConfirm", "Confirm");
            break;
          case "Prompt":
            replacement = text("dialogPrompt", "Prompt");
            break;
          default:
            break;
        }
        if (replacement && replacement !== element.textContent) element.textContent = replacement;
      });
    }
    function unwireFrame(frame) {
      var doc = frameDocument.get(frame);
      if (doc) unwireFrames(doc);
      var removeDocumentListener = frameDocumentCleanup.get(frame);
      if (removeDocumentListener) removeDocumentListener();
      frameDocumentCleanup.delete(frame);
      frameDocument.delete(frame);
      var removeFrameListener = frameLoadCleanup.get(frame);
      if (removeFrameListener) removeFrameListener();
      frameLoadCleanup.delete(frame);
      untrackFrame(frame);
    }
    function unwireFrames(root) {
      framesWithin(root).forEach(unwireFrame);
    }
    function collectLiveFrames(root, liveFrames) {
      framesWithin(root).forEach(function(frame) {
        if (liveFrames.has(frame)) return;
        liveFrames.add(frame);
        try {
          if (frame.contentDocument) collectLiveFrames(frame.contentDocument, liveFrames);
        } catch (_error) {
        }
      });
    }
    function frameConnectionToContainer(frame) {
      var current = frame;
      var seen = /* @__PURE__ */ new Set();
      var hasConnectionSignal = false;
      while (current && !seen.has(current)) {
        seen.add(current);
        if (current === container) return true;
        if (typeof container.contains === "function") {
          try {
            var contained = container.contains(current);
            hasConnectionSignal = true;
            if (contained) return true;
          } catch (_error) {
          }
        }
        if (typeof current.isConnected === "boolean") {
          hasConnectionSignal = true;
          if (!current.isConnected) return false;
        }
        var treeRoot = null;
        try {
          treeRoot = typeof current.getRootNode === "function" ? current.getRootNode() : null;
        } catch (_error) {
          treeRoot = null;
        }
        if (treeRoot && treeRoot.host) {
          current = treeRoot.host;
          continue;
        }
        var parentFrame = null;
        try {
          var ownerWindow = current.ownerDocument && current.ownerDocument.defaultView;
          parentFrame = ownerWindow && ownerWindow.frameElement;
        } catch (_error) {
          parentFrame = null;
        }
        if (!parentFrame) return hasConnectionSignal ? false : null;
        current = parentFrame;
      }
      return hasConnectionSignal ? false : null;
    }
    function reconcileTrackedFrames() {
      var fallbackLiveFrames = null;
      Array.from(frameRefs).forEach(function(ref) {
        var frame = ref.deref();
        if (!frame) {
          frameRefs.delete(ref);
          return;
        }
        var connected = frameConnectionToContainer(frame);
        if (connected === null) {
          if (!fallbackLiveFrames) {
            fallbackLiveFrames = /* @__PURE__ */ new Set();
            collectLiveFrames(container, fallbackLiveFrames);
          }
          connected = fallbackLiveFrames.has(frame);
        }
        if (!connected) {
          unwireFrame(frame);
        }
      });
    }
    var hostObserver = null;
    if (typeof MutationObserver === "function") {
      hostObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
          Array.prototype.forEach.call(mutation.removedNodes || [], unwireFrames);
          if (mutation.type === "attributes") localizeHostTree(mutation.target);
          Array.prototype.forEach.call(mutation.addedNodes || [], localizeHostTree);
        });
        reconcileTrackedFrames();
      });
      hostObserver.observe(container, {
        attributes: true,
        attributeFilter: ["aria-label", "title"],
        childList: true,
        subtree: true
      });
    }
    localizeHostTree(container);
    return {
      reconcile: function reconcileViewerFrames() {
        if (!stopped) reconcileTrackedFrames();
      },
      refresh: function refreshViewerLocalization() {
        if (!stopped) {
          localizeHostTree(container);
          reconcileTrackedFrames();
        }
      },
      stop: function stopViewerLocalization() {
        if (stopped) return;
        stopped = true;
        Array.from(frameRefs).forEach(function(ref) {
          var frame = ref.deref();
          if (frame) unwireFrame(frame);
        });
        unwireFrames(container);
        frameRefs.clear();
        if (hostObserver) hostObserver.disconnect();
      }
    };
  }
  function createHostTransport(options, logger) {
    var handlers = /* @__PURE__ */ new Set();
    var cfg = options || {};
    return {
      transport: {
        send: function(type, payload) {
          safeCall(cfg.onControl, [type, payload || {}], logger, "control");
          if (type === CONTROL.START) {
            safeCall(cfg.onResync, [payload || {}], logger, "resync");
          } else if (type === CONTROL.SUBTREE_REQUEST) {
            safeCall(cfg.onSubtreeRequest, [payload || {}], logger, "subtree-request");
          } else if (type) {
            safeCall(cfg.onUnsupportedControl, [type, payload || {}], logger, "unsupported-control");
          }
        },
        onMessage: function(handler) {
          if (typeof handler !== "function") return noop;
          handlers.add(handler);
          return function unsubscribeViewerMessage() {
            handlers.delete(handler);
          };
        },
        onStatus: typeof cfg.onStatus === "function" ? function(handler) {
          return cfg.onStatus(handler);
        } : void 0
      },
      dispatch: function(type, payload) {
        if (!type) return;
        handlers.forEach(function(handler) {
          try {
            handler(type, payload || {});
          } catch (err) {
            logger.error("[FSB Viewer] dispatch failed", type, err);
          }
        });
      },
      clear: function() {
        handlers.clear();
      }
    };
  }
  function createDashboardViewer(options) {
    var cfg = options || {};
    var logger = normalizeLogger(cfg.logger);
    var hostTransport = createHostTransport(cfg, logger);
    var viewer = createViewer({
      container: cfg.container,
      transport: hostTransport.transport,
      logger,
      disconnectDelayMs: cfg.disconnectDelayMs,
      // Phase 33 (MEDIA): live <video>/<audio> mirroring. createViewer defaults
      // mediaMode to 'reference' when undefined and validates it (throws on an
      // invalid value); the degrade callbacks + reconciler tolerances are
      // optional and pass straight through ('off' | 'poster' | 'reference').
      mediaMode: cfg.mediaMode,
      onMediaBlocked: cfg.onMediaBlocked,
      onMediaUnavailable: cfg.onMediaUnavailable,
      mediaReconcileConfig: cfg.mediaReconcileConfig
    });
    var localization = installViewerLocalization(cfg.container, cfg.copy, logger);
    installLocalizedProgressRenderer(viewer, cfg.copy, logger);
    var offState = typeof cfg.onState === "function" ? viewer.on("state", cfg.onState) : null;
    var offHealth = typeof cfg.onHealth === "function" ? viewer.on("health", cfg.onHealth) : null;
    function dispatch(type, payload) {
      var nextPayload = payload || {};
      hostTransport.dispatch(type, nextPayload);
      if (payloadMayInstallFrames(type, nextPayload)) {
        localization.refresh();
      } else if (payloadMayRemoveFrames(type, nextPayload)) {
        localization.reconcile();
      }
    }
    function dispatchMessage(message) {
      var msg = message || {};
      dispatch(msg.type, msg.payload || {});
    }
    function detach() {
      if (offState) offState();
      if (offHealth) offHealth();
      localization.stop();
      viewer.detach();
      hostTransport.clear();
    }
    function destroy() {
      if (offState) offState();
      if (offHealth) offHealth();
      localization.stop();
      viewer.destroy();
      hostTransport.clear();
    }
    function getViewportMapping() {
      return viewer.getViewportMapping();
    }
    function mapPointToViewport(point) {
      var mapping = getViewportMapping();
      return mapHostPointToViewport(point || {}, mapping.scale || {});
    }
    return Object.freeze({
      dispatch,
      dispatchMessage,
      detach,
      destroy,
      getViewportMapping,
      mapPointToViewport,
      resolveNode: viewer.resolveNode,
      highlightNode: viewer.highlightNode,
      clearHighlight: viewer.clearHighlight,
      requestSubtree: viewer.requestSubtree,
      registerOverlay: viewer.registerOverlay,
      on: viewer.on,
      viewer
    });
  }
  globalThis.FSBPhantomStreamViewer = Object.freeze({
    CONTROL,
    STREAM,
    computeScale,
    createDashboardViewer,
    createViewer,
    mapHostPointToViewport,
    mapRectToHost
  });
})();
