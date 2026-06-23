(function(global) {
  'use strict';

  /**
   * Phase 30 plan 03 (v0.9.99 -- GOV-08; D-14/D-15/D-16) -- service-denylist.js
   *
   * The SINGLE source of truth for "is this origin denied / sensitive" (D-14:
   * the heuristic + the denylist live together here, not in the UI). Two reads:
   *
   *   isDenied(origin)  -> { denied, reason? }
   *     Matches the loaded deniedOrigins. A denied service category is rendered
   *     NON-ENABLEABLE: the Plan-02 consent gate consults this FIRST (before any
   *     per-origin policy, D-15), so a denylisted origin is BLOCKED even if a
   *     stored policy says Auto.
   *
   *   classify(origin)  -> { sensitive, denied, reason? }
   *     The authoritative sensitive-origin signal the gate enforces (NOT a UI-only
   *     flag). denied:true IMPLIES sensitive:true (a denied origin is always
   *     sensitive); sensitive:true is ALSO returned for a SEEDED sensitiveOrigins
   *     match (banking / primary-email / *.gov) even when not denied. The Plan-02
   *     gate step-4 sensitive+Auto downgrade consumes classify(origin).sensitive.
   *
   *   load()  -> Promise<void>
   *     Reads the bundled extension/config/service-denylist.json (deniedOrigins +
   *     sensitiveOrigins) into memory at SW startup. Absent / unreadable -> empty
   *     sets (DEGRADE, never throw): a missing config must not poison the boot
   *     path, and an empty denylist fails OPEN for the denylist only AFTER that
   *     load completes. Callers that gate side effects must await load() before
   *     reading isDenied()/classify() so startup cannot observe an empty seed.
   *
   * Module shell: the dual-export IIFE mirror of capability-interpreter.js. It
   * reaches chrome only through a typeof-guarded lazy accessor (the agent-registry
   * idiom) so it loads cleanly under the Node test harness. The service worker
   * reads globalThis.FsbServiceDenylist after importScripts; Plan 01 wired the
   * load() call into background.js at SW startup.
   *
   * Wall-1: this module is on RECIPE_PATH_ALLOWLIST (Plan 01 pre-arm) because the
   * consent gate reads it immediately above the interpret path -- so it is kept
   * dynamic-code-FREE (no run-string-as-code / function-from-string / dynamic
   * module loader constructs, even in comments; the guard scans comments).
   *
   * Host-pattern form (LOCKED, must match service-denylist.json's seed): a
   * 'https://*.<domain>' leading-subdomain wildcard matches the apex AND any
   * subdomain of <domain> (host === domain OR host endsWith '.' + domain); a
   * 'https://*.gov' form matches any host ending in '.gov'. A pattern with NO '*'
   * matches that EXACT origin (scheme + host). Scheme must match in all forms.
   *
   * NO EMOJIS, ASCII-only source.
   */

  // ---- lazy chrome accessor (agent-registry.js:87-89 idiom) ----------------
  function _getChrome() {
    return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
  }

  // ---- in-memory loaded config (empty until load()/_setForTest) ------------
  // Shadowed in memory so isDenied/classify are synchronous (the gate calls them
  // inline). load() populates these; an absent config leaves them empty.
  var _deniedOrigins = [];
  var _sensitiveOrigins = [];
  var _deniedReason = '';
  var _loaded = false;
  var _loadPromise = null;

  // ---- origin -> { scheme, host } parse (no throw) -------------------------
  // Returns null on an unparseable origin so a caller can treat it as non-match
  // (a malformed origin is neither denied nor sensitive by THIS module; the
  // upstream gate still applies default-OFF consent).
  function _parseOrigin(origin) {
    if (typeof origin !== 'string' || origin.length === 0) { return null; }
    try {
      var u = new URL(origin);
      // Normalize to scheme + host (lowercased host; URL already lowercases it).
      return { scheme: u.protocol.replace(/:$/, ''), host: u.hostname };
    } catch (_e) {
      return null;
    }
  }

  // ---- parse a seed pattern -> { scheme, kind:'exact'|'suffix', host } ------
  // 'https://*.chase.com' -> { scheme:'https', kind:'suffix', host:'chase.com' }
  // 'https://mail.google.com' -> { scheme:'https', kind:'exact', host:'mail.google.com' }
  // Returns null on an unparseable pattern (skipped during matching).
  function _parsePattern(pattern) {
    if (typeof pattern !== 'string' || pattern.length === 0) { return null; }
    var schemeSep = pattern.indexOf('://');
    if (schemeSep === -1) { return null; }
    var scheme = pattern.slice(0, schemeSep).toLowerCase();
    var rest = pattern.slice(schemeSep + 3);
    if (!scheme || !rest) { return null; }
    // A leading '*.' marks a subdomain-suffix pattern; strip it to the bare domain.
    if (rest.indexOf('*.') === 0) {
      var domain = rest.slice(2).toLowerCase();
      if (!domain) { return null; }
      return { scheme: scheme, kind: 'suffix', host: domain };
    }
    // A bare '*' anywhere else is not a supported form -> treat as no match.
    if (rest.indexOf('*') !== -1) { return null; }
    return { scheme: scheme, kind: 'exact', host: rest.toLowerCase() };
  }

  // ---- does a parsed origin match a single seed pattern? -------------------
  function _matchesPattern(parsedOrigin, patternStr) {
    var pat = _parsePattern(patternStr);
    if (!pat || !parsedOrigin) { return false; }
    if (pat.scheme !== parsedOrigin.scheme) { return false; }
    var host = parsedOrigin.host;
    if (pat.kind === 'exact') {
      return host === pat.host;
    }
    // suffix: the apex itself OR any subdomain of it.
    return host === pat.host || (host.length > pat.host.length && host.slice(-(pat.host.length + 1)) === ('.' + pat.host));
  }

  function _matchesAny(parsedOrigin, patterns) {
    if (!parsedOrigin || !Array.isArray(patterns)) { return false; }
    for (var i = 0; i < patterns.length; i++) {
      if (_matchesPattern(parsedOrigin, patterns[i])) { return true; }
    }
    return false;
  }

  // ---- isDenied(origin) -> { denied, reason? } -----------------------------
  function isDenied(origin) {
    var parsed = _parseOrigin(origin);
    if (!parsed) { return { denied: false }; }
    if (_matchesAny(parsed, _deniedOrigins)) {
      return { denied: true, reason: _deniedReason || 'Automation prohibited for this service.' };
    }
    return { denied: false };
  }

  // ---- classify(origin) -> { sensitive, denied, reason? } ------------------
  // D-14: denied implies sensitive; sensitive ALSO true on a seeded sensitive
  // match even when not denied. This is the authoritative sensitive signal.
  function classify(origin) {
    var parsed = _parseOrigin(origin);
    if (!parsed) { return { sensitive: false, denied: false }; }
    var denied = _matchesAny(parsed, _deniedOrigins);
    if (denied) {
      return { sensitive: true, denied: true, reason: _deniedReason || 'Automation prohibited for this service.' };
    }
    var sensitive = _matchesAny(parsed, _sensitiveOrigins);
    if (sensitive) {
      return { sensitive: true, denied: false, reason: 'Sensitive service category -- extra confirmation required even under Auto.' };
    }
    return { sensitive: false, denied: false };
  }

  // ---- _applyConfig -- copy a parsed config object into the in-memory sets --
  function _applyConfig(config) {
    if (!config || typeof config !== 'object') {
      _deniedOrigins = [];
      _sensitiveOrigins = [];
      _deniedReason = '';
      return;
    }
    _deniedOrigins = Array.isArray(config.deniedOrigins) ? config.deniedOrigins.slice() : [];
    _sensitiveOrigins = Array.isArray(config.sensitiveOrigins) ? config.sensitiveOrigins.slice() : [];
    _deniedReason = (typeof config.deniedReason === 'string') ? config.deniedReason : '';
  }

  // ---- load() -> Promise<void> ---------------------------------------------
  // Reads extension/config/service-denylist.json. In the SW the bundled JSON is
  // fetched via chrome.runtime.getURL; under Node (tests) it is read with the
  // module loader. BOTH paths are guarded; an absent / unreadable / malformed
  // config DEGRADES to empty sets (never throws), so a missing config cannot
  // poison SW boot.
  // LO-03: a one-time diagnostic when BOTH config paths fail. An empty denylist
  // is a fail-OPEN for the denylist specifically (the per-origin default-OFF
  // backstop still holds, so it is not a gate bypass), but a SILENTLY vanished
  // config is worth a louder-than-swallowed signal so a missing/relocated
  // service-denylist.json is observable rather than invisibly empty. Best-effort
  // via the standard rateLimitedWarn ring helper; absent -> a single console.warn.
  var _loadDiagnosticEmitted = false;
  function _warnDenylistConfigMissing(detail) {
    if (_loadDiagnosticEmitted) { return; }
    _loadDiagnosticEmitted = true;
    var msg = 'service-denylist config could not be loaded (fetch + require both failed) -- denylist is EMPTY (nothing denied); per-origin default-OFF still applies';
    try {
      if (typeof globalThis !== 'undefined' && typeof globalThis.rateLimitedWarn === 'function') {
        globalThis.rateLimitedWarn('BG', 'denylist-config-missing', msg, { detail: String(detail || 'unknown') });
        return;
      }
    } catch (_e) { /* fall through to console */ }
    try { console.warn('[FSB BG] ' + msg); } catch (_e2) { /* console may be absent */ }
  }

  async function _loadFromSources() {
    var fetchErr = null;
    // Browser / SW path: fetch the bundled JSON via chrome.runtime.getURL.
    var chrome = _getChrome();
    if (chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function' && typeof fetch === 'function') {
      try {
        var url = chrome.runtime.getURL('config/service-denylist.json');
        var resp = await fetch(url);
        if (resp && resp.ok) {
          var data = await resp.json();
          _applyConfig(data);
          return;
        }
        fetchErr = 'fetch status ' + (resp ? resp.status : 'no-response');
      } catch (_e) {
        // fall through to the Node path / degrade-to-empty below
        fetchErr = (_e && _e.message) ? _e.message : 'fetch threw';
      }
    }
    // Node (test) path: load the bundled JSON via the module loader. Guarded so a
    // missing file degrades to empty sets rather than throwing on the boot path.
    try {
      if (typeof require === 'function') {
        // Resolve relative to this module: ../config/service-denylist.json.
        var cfg = require('../config/service-denylist.json');
        _applyConfig(cfg);
        return;
      }
    } catch (_e2) {
      // degrade to empty
      fetchErr = fetchErr || ((_e2 && _e2.message) ? _e2.message : 'require threw');
    }
    // BOTH paths failed (or neither was available) -> degrade to empty AND emit
    // the one-time observability diagnostic (LO-03).
    _warnDenylistConfigMissing(fetchErr);
    _applyConfig(null);
  }

  function load() {
    if (_loaded) { return Promise.resolve(); }
    if (_loadPromise) { return _loadPromise; }
    _loadPromise = _loadFromSources().catch(function(e) {
      _warnDenylistConfigMissing((e && e.message) ? e.message : String(e));
      _applyConfig(null);
    }).then(function() {
      _loaded = true;
    });
    return _loadPromise;
  }

  function isLoaded() {
    return _loaded;
  }

  // ---- _setForTest(config) -- inject a config for unit tests ----------------
  function _setForTest(config) {
    _loadPromise = null;
    _loaded = true;
    _applyConfig(config);
  }

  // ---- Export shape (dual-export IIFE; mirror capability-interpreter.js) ----
  var exportsObj = {
    isDenied: isDenied,
    classify: classify,
    load: load,
    isLoaded: isLoaded,
    _setForTest: _setForTest
  };

  global.FsbServiceDenylist = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;            // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
