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
  // The pattern-length cap and the candidate-text-length cap are the HARD CPU
  // bound (a synchronous match blocks the single SW thread, so there is no sound
  // way to time-box it -- the length caps ARE the guarantee). The evil-shape
  // heuristic is defense-in-depth (static super-linear-backtracking detection is
  // provably incomplete -- that is accepted). A rejected or syntactically-invalid
  // pattern yields a distinct pattern_error -- never a silent pass, never a NaN
  // fire. Patterns are compiled once and cached by their raw string.

  var PATTERN_MAX_LEN = 1000;          // longest legitimately-expected pattern
  var TEXT_MAX_LEN_ELEMENT = 10000;    // element-text candidate cap
  var TEXT_MAX_LEN_PAGE = 100000;      // whole-page candidate cap (multi-element)
  var _regexCache = new Map();         // raw pattern string -> compiled RegExp

  // Static evil-shape heuristic. Each entry flags a known catastrophic-
  // backtracking silhouette: a nested quantifier such as (a+)+ / (a*)*, an
  // alternation under a quantifier such as (a|a)* / (a|b)+, and adjacent
  // unbounded quantifiers such as .*.* / .+.+.
  var EVIL_SHAPES = [
    /\([^)]*[+*]\)[+*]/,              // nested quantifier
    /\([^)]*\|[^)]*\)[+*]/,          // alternation under a quantifier
    /[.][*+][.][*+]/                 // adjacent unbounded quantifiers
  ];

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
    var bounded = (typeof text === 'string') ? text.slice(0, limit) : '';
    return { matched: g.re.test(bounded) };
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
    var raw = extractor ? extractor.extractValue(reportedValue, condition) : '';

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

  // ---- Export shape (mirror trigger-lifecycle.js dual-export) --------------
  //
  // Task 3 (the inline concurrency cap) extends this same exportsObj with
  // armTrigger / getCap / setCap and the cap constants.

  var exportsObj = {
    evaluate: evaluate,
    evaluateOne: evaluateOne,
    evaluateCompound: evaluateCompound,
    guardAndCompile: guardAndCompile,
    regexMatches: regexMatches,
    PATTERN_MAX_LEN: PATTERN_MAX_LEN,
    TEXT_MAX_LEN_ELEMENT: TEXT_MAX_LEN_ELEMENT,
    TEXT_MAX_LEN_PAGE: TEXT_MAX_LEN_PAGE
  };

  global.FsbTriggerManager = exportsObj;            // SW importScripts consumer

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;                    // Node test consumer
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
