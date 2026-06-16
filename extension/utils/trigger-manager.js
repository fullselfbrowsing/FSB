(function(global) {
  'use strict';

  /**
   * Phase 15 plan 02 -- trigger-manager.js
   *
   * The pure, DOM-free fire-condition engine plus the inline concurrency cap.
   * Two distinct responsibilities live here, mirroring how agent-registry.js
   * keeps its cap inline:
   *
   *   1. evaluate(snapshot, reportedValue, now?) -- a STRUCTURALLY PURE function
   *      (D-02). It reads the persisted snapshot (condition, baseline, last_value,
   *      and the persisted edge flag was_satisfied) plus the raw value the watch
   *      layer reported, and returns a typed outcome:
   *        { outcome:'fired'|'no_fire'|'parse_error'|'pattern_error',
   *          matched_condition?, old_value, new_value, next_state }
   *      It performs NO storage access and reads no DOM. The Phase-14 seam
   *      (trigger-lifecycle.js) owns the storage re-read + atomic terminal
   *      write-back. evaluate() never sets status:'fired' -- the seam does that.
   *
   *   2. armTrigger(spec) / getCap() / setCap(value) -- the inline concurrency
   *      cap (LIFE-04 / D-09), a clone of agent-registry.js translated from its
   *      instance pattern to this module-singleton IIFE. The deliberate
   *      divergence: the active count comes from the persisted store
   *      (listArmedSnapshots) so the cap keeps enforcing across SW eviction --
   *      NOT an in-heap set that would reset on wake.
   *
   * Module shell: the dual-export IIFE + lazy resolver idiom of
   * trigger-lifecycle.js (open at :1-2, _getChrome/_getStore at :88-107). The
   * cap legitimately uses the persistent local storage area; that access is
   * confined to the cap functions and never reached from evaluate().
   *
   * Consumes Plan 01's value-extractor (FsbValueExtractor) for every numeric
   * path so the parse-error chokepoint (EXTRACT-04) lives in one place.
   *
   * NO EMOJIS, ASCII-only source. Separator/character code points, where named
   * in comments, use the U+XXXX form rather than the literal glyph.
   */

  // ---- Lazy resolvers (call-time, Node-mock seam) --------------------------
  //
  // Resolve chrome / the store / the extractor / the lifecycle at call time
  // (never at module-eval time) so Node tests can inject mocks AFTER require().
  // Mirrors trigger-lifecycle.js:88-107 for cross-module consistency.

  function _getChrome() {
    return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
  }

  function _getStore() {
    if (global && global.FsbTriggerStore && typeof global.FsbTriggerStore === 'object') {
      return global.FsbTriggerStore;
    }
    if (typeof globalThis !== 'undefined' && globalThis.FsbTriggerStore
        && typeof globalThis.FsbTriggerStore === 'object') {
      return globalThis.FsbTriggerStore;
    }
    return null;
  }

  function _getExtractor() {
    if (global && global.FsbValueExtractor && typeof global.FsbValueExtractor === 'object') {
      return global.FsbValueExtractor;
    }
    if (typeof globalThis !== 'undefined' && globalThis.FsbValueExtractor
        && typeof globalThis.FsbValueExtractor === 'object') {
      return globalThis.FsbValueExtractor;
    }
    return null;
  }

  function _getLifecycle() {
    if (global && global.FsbTriggerLifecycle && typeof global.FsbTriggerLifecycle === 'object') {
      return global.FsbTriggerLifecycle;
    }
    if (typeof globalThis !== 'undefined' && globalThis.FsbTriggerLifecycle
        && typeof globalThis.FsbTriggerLifecycle === 'object') {
      return globalThis.FsbTriggerLifecycle;
    }
    return null;
  }

  // ---- Regex ReDoS guard (D-08) --------------------------------------------
  //
  // The regex condition compiles a CALLER-SUPPLIED pattern and runs .test()
  // against UNTRUSTED page text on the single, synchronous SW thread -- a
  // catastrophic-backtracking pattern would freeze the whole extension, and a
  // synchronous .test() cannot be time-boxed. Defense, in layers:
  //   1. hasNestedQuantifier(): a paren-aware structural walk that REJECTS the
  //      exponential-backtracking class at compile time -- a quantifier (+ * {n,})
  //      applied to a group that itself contains a quantifier or an alternation
  //      (e.g. (a+)+, ((a+))+, (a{1,}){1,}, (a|a)*). This is the load-bearing
  //      guard: exponential blowup needs only ~30 chars, so NO input-length cap
  //      can bound it -- only rejecting the pattern shape can. The earlier
  //      paren-blind regex heuristic missed ((a+))+ and {n,} forms (CR-01).
  //   2. EVIL_SHAPES: a fast pre-filter for adjacent unbounded quantifiers
  //      (.*.*), a POLYNOMIAL shape that the length caps below DO bound.
  //   3. PATTERN_MAX_LEN + the candidate-text-length caps: bound polynomial
  //      backtracking work; they do NOT bound exponential blowup (layer 1 does).
  // A rejected or syntactically-invalid pattern yields a distinct pattern_error --
  // never a silent pass, never a NaN fire. Patterns are compiled once and cached.
  // RESIDUAL RISK: static detection cannot be PROVEN complete; a hard guarantee
  // for arbitrary caller regex would require an off-thread, killable match
  // (offscreen document + watchdog timer), tracked for a future phase.

  var PATTERN_MAX_LEN = 1000;          // longest legitimately-expected pattern
  var TEXT_MAX_LEN_ELEMENT = 10000;    // element-text candidate cap
  var TEXT_MAX_LEN_PAGE = 100000;      // whole-page candidate cap (multi-element)
  var _regexCache = new Map();         // raw pattern string -> compiled RegExp

  // Fast pre-filter for adjacent unbounded quantifiers (.*.* / .+.+) -- a
  // POLYNOMIAL silhouette bounded by the text caps. Nested quantifiers and
  // alternation-under-quantifier (the EXPONENTIAL class) are handled structurally
  // by hasNestedQuantifier() below, which is paren-aware and {n,}-aware.
  var EVIL_SHAPES = [
    /[.][*+][.][*+]/                 // adjacent unbounded quantifiers
  ];

  /**
   * Paren-aware structural detector for the exponential-backtracking class.
   * Walks the pattern tracking, per open group, whether the group body already
   * contains a quantifier (+ * {) or an alternation (|). When a group closes and
   * is immediately quantified while its body had a quantifier/alternation, the
   * pattern can backtrack exponentially -- reject it. A closed group that was
   * itself quantified or contained one propagates that fact to its PARENT group,
   * so ((a+))+ is caught even though the inner group is not directly quantified.
   * Character classes [...] are skipped (their | + { are literal). '?' is NOT a
   * trigger -- it is bounded (0 or 1) and does not drive catastrophic blowup.
   */
  function hasNestedQuantifier(pattern) {
    var groups = [];          // stack: per open '(' -> body had a quantifier/alternation
    var inClass = false;      // inside a [...] character class
    var i = 0;
    var n = pattern.length;
    while (i < n) {
      var ch = pattern[i];
      if (ch === '\\') { i += 2; continue; }            // skip escaped char
      if (inClass) { if (ch === ']') inClass = false; i++; continue; }
      if (ch === '[') { inClass = true; i++; continue; }
      if (ch === '(') { groups.push(false); i++; continue; }
      if (ch === '|') { if (groups.length) groups[groups.length - 1] = true; i++; continue; }
      if (ch === ')') {
        var innerHadQuant = groups.length ? groups.pop() : false;
        var next = pattern[i + 1];
        var quantified = (next === '+' || next === '*' || next === '{');
        if (quantified && innerHadQuant) return true;   // nested / alternation under quantifier
        // The closed group is a token in its parent. If it was quantified OR
        // contained a quantifier/alternation, the parent now "contains a quantifier".
        if (groups.length && (quantified || innerHadQuant)) groups[groups.length - 1] = true;
        i++;
        continue;
      }
      if (ch === '+' || ch === '*' || ch === '{') {
        if (groups.length) groups[groups.length - 1] = true;
        i++;
        continue;
      }
      i++;
    }
    return false;
  }

  /**
   * True if the pattern contains an unescaped end anchor ($) outside a character
   * class. Used to refuse matching an end-anchored pattern against TRUNCATED text,
   * where $ would bind the artificial cut boundary instead of the real end (WR-02).
   */
  function _hasUnescapedEndAnchor(pattern) {
    var inClass = false;
    for (var i = 0; i < pattern.length; i++) {
      var ch = pattern[i];
      if (ch === '\\') { i++; continue; }
      if (inClass) { if (ch === ']') inClass = false; continue; }
      if (ch === '[') { inClass = true; continue; }
      if (ch === '$') return true;
    }
    return false;
  }

  /**
   * Validate + compile a caller pattern. Returns { re } on success or
   * { error:'pattern_error', reason } on rejection. Compiles with DEFAULT FLAGS
   * ONLY -- the caller flag is intentionally not honored, so there is no
   * cross-call lastIndex state footgun (a /g or /y compile would carry
   * lastIndex between .test() calls and produce intermittent wrong matches).
   * The contains kind already covers case-insensitive substring needs.
   */
  function guardAndCompile(pattern) {
    if (typeof pattern !== 'string' || pattern.length === 0) {
      return { error: 'pattern_error', reason: 'empty_or_nonstring' };
    }
    if (pattern.length > PATTERN_MAX_LEN) {
      return { error: 'pattern_error', reason: 'pattern_too_long' };
    }
    for (var i = 0; i < EVIL_SHAPES.length; i++) {
      if (EVIL_SHAPES[i].test(pattern)) {
        return { error: 'pattern_error', reason: 'evil_shape' };
      }
    }
    if (hasNestedQuantifier(pattern)) {
      return { error: 'pattern_error', reason: 'nested_quantifier' };
    }
    if (_regexCache.has(pattern)) {
      return { re: _regexCache.get(pattern) };
    }
    var re;
    try {
      re = new RegExp(pattern);      // default flags only (no lastIndex footgun)
    } catch (_e) {
      return { error: 'pattern_error', reason: 'invalid_syntax' };
    }
    _regexCache.set(pattern, re);
    return { re: re };
  }

  /**
   * Guard + bounded match. The candidate text is sliced to maxLen BEFORE the
   * match runs -- the length bound is the hard CPU guarantee, independent of the
   * pattern shape. Returns { matched } or { error:'pattern_error' }.
   */
  function regexMatches(pattern, text, maxLen) {
    var g = guardAndCompile(pattern);
    if (g.error) return g;
    var limit = (typeof maxLen === 'number' && maxLen > 0) ? maxLen : TEXT_MAX_LEN_ELEMENT;
    var str = (typeof text === 'string') ? text : '';
    if (str.length > limit) {
      // WR-02: slicing would let a `$` end-anchor match the artificial cut
      // boundary (a false positive). Refuse an end-anchored pattern against
      // truncated text rather than fire on a fabricated end; unanchored patterns
      // are safe to bound.
      if (_hasUnescapedEndAnchor(pattern)) {
        return { error: 'pattern_error', reason: 'text_truncated_end_anchor' };
      }
      str = str.slice(0, limit);
    }
    return { matched: g.re.test(str) };
  }

  // ---- Single-condition dispatch (the six kinds, D-06) ---------------------
  //
  // Returns a per-condition result: { satisfied, old_value, new_value } OR
  // { error:'parse_error'|'pattern_error' }. Both sides of every numeric compare
  // are parsed to Number first (D-05) -- never a string-vs-number compare, which
  // JS coercion would resolve incorrectly. A failed numeric parse surfaces as
  // parse_error and never as zero (EXTRACT-04). Unknown kinds are treated as a
  // non-firing error so a malformed condition can never silently fire.

  function evaluateOne(condition, snapshot, reportedValue, opts) {
    var extractor = _getExtractor();
    // WR-01: a missing extractor (a tolerated importScripts failure) must fail
    // CLOSED for EVERY kind. Otherwise `changed` sees raw='' !== baseline and
    // fires spuriously. The numeric kinds already guarded this; do it once here.
    if (!extractor) return { error: 'parse_error' };
    var raw = extractor.extractValue(reportedValue, condition);

    switch (condition.kind) {
      case 'changed': {
        var base = (snapshot.baseline === undefined || snapshot.baseline === null)
          ? '' : String(snapshot.baseline).trim();
        return { satisfied: raw !== base, old_value: snapshot.baseline, new_value: raw };
      }

      case 'contains': {
        var caseSensitive = condition.case_sensitive === true;
        var hay = caseSensitive ? raw : raw.toLowerCase();
        var needle = caseSensitive ? String(condition.value) : String(condition.value).toLowerCase();
        return { satisfied: hay.indexOf(needle) !== -1, old_value: snapshot.last_value, new_value: raw };
      }

      case 'threshold': {
        if (!extractor) return { error: 'parse_error' };
        var cur = extractor.parseLocaleNumber(raw, opts);
        if (cur.error) return { error: 'parse_error' };
        var tgt = extractor.parseLocaleNumber(String(condition.target), opts);
        if (tgt.error) return { error: 'parse_error' };
        var ok = (condition.operator === '>=') ? cur.value >= tgt.value
               : (condition.operator === '<=') ? cur.value <= tgt.value
               : (condition.operator === '>')  ? cur.value >  tgt.value
               : (condition.operator === '<')  ? cur.value <  tgt.value
               :                                  false; // unknown operator -> never satisfied
        return { satisfied: ok, old_value: snapshot.last_value, new_value: cur.value };
      }

      case 'percent_change': {
        if (!extractor) return { error: 'parse_error' };
        var c = extractor.parseLocaleNumber(raw, opts);
        var b = extractor.parseLocaleNumber(String(snapshot.baseline), opts);
        // baseline 0 or NaN -> parse_error BEFORE the division (no divide-by-zero
        // fire, no NaN propagation). TRIG-06.
        if (c.error || b.error || b.value === 0) return { error: 'parse_error' };
        var pct = Math.abs((c.value - b.value) / b.value * 100);
        return { satisfied: pct >= Math.abs(condition.percent), old_value: b.value, new_value: c.value };
      }

      case 'equals': {
        if (condition.numeric) {
          if (!extractor) return { error: 'parse_error' };
          var cv = extractor.parseLocaleNumber(raw, opts);
          var tv = extractor.parseLocaleNumber(String(condition.value), opts);
          if (cv.error || tv.error) return { error: 'parse_error' };
          var tol = (typeof condition.tolerance === 'number') ? condition.tolerance : 0;
          return { satisfied: Math.abs(cv.value - tv.value) <= tol, old_value: snapshot.last_value, new_value: cv.value };
        }
        return { satisfied: raw === String(condition.value), old_value: snapshot.last_value, new_value: raw };
      }

      case 'regex': {
        var m = regexMatches(condition.pattern, raw, TEXT_MAX_LEN_ELEMENT);
        if (m.error) return { error: 'pattern_error' };
        return { satisfied: m.matched, old_value: snapshot.last_value, new_value: raw };
      }

      default:
        return { error: 'parse_error' };
    }
  }

  // ---- Compound fold (TRIG-07) ---------------------------------------------
  //
  // { combinator:'AND'|'OR', conditions:[...] } folds per-condition booleans on
  // one element. Pitfall 5: if ANY sub-condition returns an error, SHORT-CIRCUIT
  // the WHOLE compound to that error (never fold an error into false, which could
  // let an OR fire on partially-invalid data). Returns
  // { satisfied, matched_condition?, old_value, new_value } or { error }.

  function evaluateCompound(compound, snapshot, reportedValue, opts) {
    var conditions = Array.isArray(compound.conditions) ? compound.conditions : [];
    var isAnd = String(compound.combinator).toUpperCase() === 'AND';
    var anySatisfied = false;
    var allSatisfied = conditions.length > 0;
    var matched = null;
    var lastNew = null;
    var lastOld = null;

    for (var i = 0; i < conditions.length; i++) {
      var res = evaluateOne(conditions[i], snapshot, reportedValue, opts);
      if (res.error) {
        return { error: res.error }; // short-circuit the whole compound to the error
      }
      lastNew = res.new_value;
      lastOld = res.old_value;
      if (res.satisfied) {
        anySatisfied = true;
        if (!matched) matched = conditions[i];
      } else {
        allSatisfied = false;
      }
    }

    var satisfied = isAnd ? allSatisfied : anySatisfied;
    return {
      satisfied: satisfied,
      matched_condition: satisfied ? (matched || (conditions.length ? conditions[0] : undefined)) : undefined,
      old_value: lastOld,
      new_value: lastNew
    };
  }

  // ---- Public entry: evaluate() (D-02, PURE) -------------------------------
  //
  // Computes the per-tick satisfied boolean (single or compound condition), then
  // wraps it in edge-trigger semantics (D-07): fire ONLY on the
  // was_satisfied:false -> true transition, where was_satisfied is read from the
  // PERSISTED snapshot (never the SW heap, so an oscillation across SW eviction
  // does not re-fire). The hysteresis margin field (condition.hysteresis) is read
  // so the field is present for the re-arm path (Phase 19 owns the re-arm tool
  // surface); the Phase-15 fire-once default transitions the snapshot to terminal
  // status in the seam, so the margin only matters once re-arm is opted in.
  //
  // PURITY: this function performs no storage access and does not call the chrome
  // resolver. It returns a next_state PATCH the seam merges; it never sets
  // status:'fired' itself. (The cap functions below are the only storage callers.)

  function evaluate(snapshot, reportedValue, now) {
    var ts = (typeof now === 'number') ? now : Date.now();
    var safeSnap = (snapshot && typeof snapshot === 'object') ? snapshot : {};
    var condition = safeSnap.condition || {};
    var opts = {
      locale: condition.locale,
      decimal_separator: condition.decimal_separator
    };

    var result;
    if (condition && condition.combinator && Array.isArray(condition.conditions)) {
      result = evaluateCompound(condition, safeSnap, reportedValue, opts);
    } else {
      result = evaluateOne(condition, safeSnap, reportedValue, opts);
    }

    // Error short-circuit: surface the error outcome. next_state still records
    // last_value + last_evaluated_at, but leaves was_satisfied unchanged (the
    // edge flag does not advance on an error tick).
    if (result.error) {
      var rawOnError = '';
      var extractorE = _getExtractor();
      if (extractorE) rawOnError = extractorE.extractValue(reportedValue, condition);
      return {
        outcome: result.error,            // 'parse_error' | 'pattern_error'
        matched_condition: undefined,
        old_value: safeSnap.baseline,
        new_value: rawOnError,
        next_state: {
          last_value: rawOnError,
          was_satisfied: safeSnap.was_satisfied === true,
          last_evaluated_at: ts
        }
      };
    }

    var satisfiedNow = result.satisfied === true;
    var wasSatisfied = safeSnap.was_satisfied === true;
    var isEdge = (!wasSatisfied && satisfiedNow); // false -> true transition only

    // Hysteresis margin is read for parity with the re-arm recipe (Pattern 4).
    // For the fire-once default it does not change the edge decision; it is
    // surfaced so a future re-arm path can require the value to clear the
    // boundary by this margin before was_satisfied resets to false.
    var _hysteresis = (typeof condition.hysteresis === 'number') ? condition.hysteresis : 0;
    void _hysteresis;

    var newValue = (result.new_value === undefined) ? null : result.new_value;

    return {
      outcome: isEdge ? 'fired' : 'no_fire',
      matched_condition: (isEdge && result.matched_condition) ? result.matched_condition : (isEdge ? condition : undefined),
      old_value: result.old_value,
      new_value: newValue,
      next_state: {
        last_value: newValue,
        was_satisfied: satisfiedNow, // persist so a post-eviction oscillation does not re-fire
        last_evaluated_at: ts
      }
    };
  }

  // ---- Inline concurrency cap (LIFE-04 / D-09) -----------------------------
  //
  // A clone of agent-registry.js (constants, clamp, typed reject, getCap/setCap,
  // grandfather-on-lower), translated from its instance pattern to this module-
  // singleton IIFE. Two things matter for correctness:
  //
  //   (a) The cap value persists in the durable local storage area (key
  //       'fsbTriggerCap') so it survives a SW restart. This is the ONLY storage
  //       access in this module and it is confined to the cap functions -- it is
  //       never reached from evaluate(), which stays pure.
  //   (b) THE DELIBERATE DIVERGENCE (D-09): the active count is the number of
  //       persisted armed snapshots (listArmedSnapshots().length), NOT a heap
  //       set. agent-registry counts a heap set because its agents live only in
  //       memory; triggers are storage-first and survive SW eviction, so a heap
  //       counter would reset to zero on wake and silently stop enforcing the cap
  //       across the very eviction the milestone is built around. There is no
  //       in-heap registry of triggers in this module.

  var FSB_TRIGGER_CAP_STORAGE_KEY = 'fsbTriggerCap'; // durable local area, survives restart
  var FSB_TRIGGER_CAP_DEFAULT = 8;
  var FSB_TRIGGER_CAP_MIN = 1;
  var FSB_TRIGGER_CAP_MAX = 64;

  function _clampCap(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return FSB_TRIGGER_CAP_DEFAULT;
    var i = Math.floor(v);
    if (i < FSB_TRIGGER_CAP_MIN) return FSB_TRIGGER_CAP_MIN;
    if (i > FSB_TRIGGER_CAP_MAX) return FSB_TRIGGER_CAP_MAX;
    return i;
  }

  var _cachedCap = FSB_TRIGGER_CAP_DEFAULT; // module-scope (was this._cachedCap in the instance clone)

  /**
   * Read-path clamp = poisoned-cache defense-in-depth (mirror
   * agent-registry.js:787-789): even if the cache were corrupted by a malformed
   * change event, an out-of-range cap can never leak to callers.
   */
  function getCap() {
    return _clampCap(_cachedCap);
  }

  /**
   * Set the cap, clamping to [MIN, MAX]. Updates the in-memory cache, then writes
   * to the durable local area best-effort (a storage hiccup must never throw --
   * the cache is already updated). When the new cap is below the active count at
   * change time, emits one diagnostic (grandfather-on-lower; no eviction) if a
   * global rate-limited warn hook exists. Returns the clamped value.
   */
  function setCap(value) {
    var clamped = _clampCap(value);
    var previousCap = _clampCap(_cachedCap);
    _cachedCap = clamped;
    var c = _getChrome();
    if (c && c.storage && c.storage.local && typeof c.storage.local.set === 'function') {
      try {
        var payload = {};
        payload[FSB_TRIGGER_CAP_STORAGE_KEY] = clamped;
        var ret = c.storage.local.set(payload);
        if (ret && typeof ret.catch === 'function') {
          ret.catch(function() { /* best-effort */ });
        }
      } catch (_e) { /* best-effort */ }
    }
    // Diagnostic-only grandfather emission. activeAtChange is read best-effort
    // from the persisted store; if the read is unavailable we skip the emission
    // (a missing diagnostic never blocks setCap).
    if (typeof globalThis !== 'undefined' && typeof globalThis.rateLimitedWarn === 'function') {
      var store = _getStore();
      if (store && typeof store.listArmedSnapshots === 'function') {
        Promise.resolve(store.listArmedSnapshots()).then(function(armed) {
          var activeAtChange = Array.isArray(armed) ? armed.length : 0;
          if (clamped < activeAtChange) {
            try {
              globalThis.rateLimitedWarn(
                '[FSB][trigger]',
                'trigger-cap-lowered-grandfathered',
                'trigger cap lowered while triggers active (grandfathered)',
                { previousCap: previousCap, newCap: clamped, activeAtChange: activeAtChange }
              );
            } catch (_e2) { /* swallow */ }
          }
        }).catch(function() { /* swallow */ });
      }
    }
    return clamped;
  }

  /**
   * Best-effort hydrate of the cached cap from the durable local area. Intended
   * to be called at SW wake so the worker serves the operator-configured cap
   * (not the static default). Errors are swallowed; the default stands when
   * storage is unavailable.
   */
  async function loadCapFromStorage() {
    var c = _getChrome();
    if (!c || !c.storage || !c.storage.local || typeof c.storage.local.get !== 'function') return;
    try {
      var stored = await c.storage.local.get([FSB_TRIGGER_CAP_STORAGE_KEY]);
      var raw = stored && stored[FSB_TRIGGER_CAP_STORAGE_KEY];
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        _cachedCap = _clampCap(raw);
      }
    } catch (_e) { /* keep default */ }
  }

  // ---- Arm serialization mutex (the concurrent-arm TOCTOU fix) -------------
  //
  // Ported from agent-registry.js:181 (withRegistryLock). The MV3 service worker
  // is single-threaded; one module-scope promise chain serializes all arms. The
  // .then(fn, fn) shape runs the next handler whether the prior fulfilled or
  // rejected, so a single thrown handler does not poison the chain; the
  // .catch(...) on assignment ensures the chain itself never holds a rejected
  // promise. After SW eviction the chain is reborn as a resolved promise, which
  // is correct because no arms are in-flight on a freshly-spawned worker.
  //
  // Why this is mandatory: armTrigger reads the active count ASYNC from the
  // store, so a naive read-then-write races -- two concurrent arms could both
  // read active=7 under cap=8 and both proceed to 9. Running the
  // listArmedSnapshots() read + cap compare + delegated write inside one lock
  // turn makes the cap atomic. evaluate() is lock-free and pure; only arm (which
  // is not the hot path) is serialized.

  var _armChain = Promise.resolve();
  function _withArmLock(fn) {
    var run = _armChain.then(fn, fn);
    _armChain = run.catch(function() { /* swallow so the chain continues */ });
    return run;
  }

  /**
   * Arm a trigger, cap-gated. Runs ENTIRELY inside _withArmLock so the active-
   * count read + cap compare + delegated persist are one atomic turn. The active
   * count comes from the persisted store (D-09 divergence), so the cap keeps
   * enforcing across SW eviction. On success, builds the flat-scalar snapshot
   * (status:'armed', was_satisfied:false, baseline, deadline_at = now + TTL,
   * carrying condition/selector/target_tab_id/agent_id from the spec) and
   * delegates the storage write + alarm to the Phase-14 lifecycle seam.
   *
   * @param {object} spec { trigger_id, condition, baseline?, selector?,
   *                        target_tab_id?, agent_id?, now? }
   * @returns {Promise<object>} the lifecycle result merged with trigger_id, OR
   *          { error:'TRIGGER_CAP_REACHED', code, cap, active } when over cap.
   */
  function armTrigger(spec) {
    return _withArmLock(async function() {
      var safeSpec = (spec && typeof spec === 'object') ? spec : {};
      var store = _getStore();
      var armed = (store && typeof store.listArmedSnapshots === 'function')
        ? await store.listArmedSnapshots()
        : [];
      var active = Array.isArray(armed) ? armed.length : 0; // storage-of-truth, NOT a heap set
      var cap = getCap();
      if (active >= cap) {
        return { error: 'TRIGGER_CAP_REACHED', code: 'TRIGGER_CAP_REACHED', cap: cap, active: active };
      }

      var now = (typeof safeSpec.now === 'number') ? safeSpec.now : Date.now();
      var lifecycle = _getLifecycle();
      var ttl = (lifecycle && typeof lifecycle.FSB_TRIGGER_DEFAULT_TTL_MS === 'number')
        ? lifecycle.FSB_TRIGGER_DEFAULT_TTL_MS
        : 21600000; // 6h default if the lifecycle constant is unavailable

      var snapshot = {
        trigger_id: safeSpec.trigger_id,
        status: 'armed',
        condition: safeSpec.condition,
        baseline: (safeSpec.baseline === undefined) ? null : safeSpec.baseline,
        last_value: (safeSpec.baseline === undefined) ? null : safeSpec.baseline,
        was_satisfied: false,
        selector: safeSpec.selector,
        target_tab_id: safeSpec.target_tab_id,
        agent_id: safeSpec.agent_id,
        armed_at: now,
        deadline_at: now + ttl
      };

      if (!lifecycle || typeof lifecycle.armTrigger !== 'function') {
        return { error: 'LIFECYCLE_UNAVAILABLE', code: 'LIFECYCLE_UNAVAILABLE', trigger_id: snapshot.trigger_id };
      }
      var armedResult = await lifecycle.armTrigger(snapshot);
      var merged = (armedResult && typeof armedResult === 'object') ? armedResult : {};
      merged.trigger_id = snapshot.trigger_id;
      return merged;
    });
  }

  // ---- Export shape (mirror trigger-lifecycle.js dual-export) --------------

  var exportsObj = {
    evaluate: evaluate,
    evaluateOne: evaluateOne,
    evaluateCompound: evaluateCompound,
    guardAndCompile: guardAndCompile,
    regexMatches: regexMatches,
    PATTERN_MAX_LEN: PATTERN_MAX_LEN,
    TEXT_MAX_LEN_ELEMENT: TEXT_MAX_LEN_ELEMENT,
    TEXT_MAX_LEN_PAGE: TEXT_MAX_LEN_PAGE,
    armTrigger: armTrigger,
    getCap: getCap,
    setCap: setCap,
    loadCapFromStorage: loadCapFromStorage,
    FSB_TRIGGER_CAP_STORAGE_KEY: FSB_TRIGGER_CAP_STORAGE_KEY,
    FSB_TRIGGER_CAP_DEFAULT: FSB_TRIGGER_CAP_DEFAULT,
    FSB_TRIGGER_CAP_MIN: FSB_TRIGGER_CAP_MIN,
    FSB_TRIGGER_CAP_MAX: FSB_TRIGGER_CAP_MAX
  };

  global.FsbTriggerManager = exportsObj;            // SW importScripts consumer

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;                    // Node test consumer
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
