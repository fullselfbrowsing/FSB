(() => {
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
  var CSP_META = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https: data:; style-src http: https: 'unsafe-inline'; font-src http: https: data:">`;
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
    return "<!DOCTYPE html><html" + htmlAttrs + "><head>" + CSP_META + '<meta charset="UTF-8"><meta name="viewport" content="width=' + (parseInt(p.viewportWidth, 10) || 1920) + '">' + stylesheetLinks + inlineStyleTags + cssomStyleTags + "<style>body { margin: 0; overflow: hidden; } *::selection { background: transparent; } ::-webkit-scrollbar { display: none; }</style></head><body" + bodyAttrs + ">" + (p.html || "") + "</body></html>";
  }
  function buildFramePlaceholderHtml(frame) {
    var f = frame || {};
    var label = escapeAttribute(f.label || "Cross-origin iframe");
    var origin = escapeAttribute(f.origin || "");
    var src = escapeAttribute(f.src || "");
    var meta = "";
    if (origin) meta += "<p>Origin: " + origin + "</p>";
    if (src) meta += "<p>Source: " + src + "</p>";
    return "<!DOCTYPE html><html><head>" + CSP_META + '<meta charset="UTF-8"><style>body{margin:0;font:13px system-ui,sans-serif;color:#30333a;background:#f6f7f9;}.ps-frame-placeholder{box-sizing:border-box;min-height:100vh;display:flex;flex-direction:column;gap:6px;justify-content:center;align-items:center;text-align:center;border:1px dashed #9aa3af;padding:16px;}.ps-frame-placeholder strong{font-size:14px;} .ps-frame-placeholder p{margin:0;color:#5f6673;word-break:break-word;}</style></head><body><div class="ps-frame-placeholder" role="note"><strong>' + label + "</strong>" + meta + "</div></body></html>";
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

  // node_modules/@full-self-browsing/phantom-stream/src/renderer/diff.js
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
              if (Array.isArray(m.selectedValues) && valueTarget.options) {
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
      resetOverlays
    };
  }

  // node_modules/@full-self-browsing/phantom-stream/src/renderer/index.js
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
    var container = cfg.container;
    if (!container || typeof container.appendChild !== "function") {
      throw new Error("viewer-container-required");
    }
    var transport = cfg.transport;
    if (!transport || typeof transport.send !== "function" || typeof transport.onMessage !== "function") {
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
    var doc = container.ownerDocument;
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
          if (lastSnapshotPayload) {
            resetIdentityIndex(scrubDoc, lastSnapshotPayload.nodeIds || []);
            installStyleSources(scrubDoc, lastSnapshotPayload.styleSources || [], { kind: "document" });
            installShadowRoots(scrubDoc, lastSnapshotPayload.shadowRoots || []);
            installFrames(scrubDoc, lastSnapshotPayload.frames || []);
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
      iframe.srcdoc = buildSnapshotHtml(p);
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
          removeStyleSource
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
      resolveNode
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
      disconnectDelayMs: cfg.disconnectDelayMs
    });
    var offState = typeof cfg.onState === "function" ? viewer.on("state", cfg.onState) : null;
    var offHealth = typeof cfg.onHealth === "function" ? viewer.on("health", cfg.onHealth) : null;
    function dispatch(type, payload) {
      hostTransport.dispatch(type, payload || {});
    }
    function dispatchMessage(message) {
      var msg = message || {};
      dispatch(msg.type, msg.payload || {});
    }
    function detach() {
      if (offState) offState();
      if (offHealth) offHealth();
      viewer.detach();
      hostTransport.clear();
    }
    function destroy() {
      if (offState) offState();
      if (offHealth) offHealth();
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
