(function(global) {
  'use strict';

  /**
   * Phase 15 plan 01 -- value-extractor.js
   *
   * A PURE, DOM-free, zero-dependency value-extraction module. It does two
   * things and touches no browser API and no DOM:
   *   1. parseLocaleNumber(raw, opts) -- locale-aware numeric parsing using the
   *      Intl.NumberFormat(locale).formatToParts() separator-discovery recipe
   *      (D-03). A failed parse yields a distinct { error: 'parse_error' } and
   *      NEVER a numeric 0 / NaN (EXTRACT-04) -- this is the single chokepoint
   *      where the "a bad parse never fires" guarantee lives.
   *   2. extractValue(reportedValue, descriptor) -- selects the value source
   *      (text | number | attribute) from the payload the watch layer reported
   *      (EXTRACT-03 / D-05). It does NOT scrape the DOM; it only selects a
   *      field of an already-reported object.
   *
   * Module shell: the dual-export IIFE mirror of extension/utils/trigger-store.js
   * (open at :1-2, close at :185-200) so the Node unit test can re-require it.
   * Because this module is pure Intl/string math, it OMITS the lazy browser-API
   * resolver entirely -- there is no browser API to resolve.
   *
   * Consumer note (Plan 02 trigger-manager): the extractValue reportedValue
   * shape is { text: string, attributes?: { [name: string]: string } }. text is
   * used by extract 'text' and 'number'; attributes[name] is used by 'attribute'.
   *
   * LANDMINES (locked by the test matrix and the acceptance guards):
   *   - Group/decimal separators are removed with a LITERAL String.split(sep).
   *     join(...). A RegExp built from a separator is forbidden: a separator
   *     like '.' is a regex metacharacter -- the #1 footgun in this file.
   *   - A NaN parse returns { error: 'parse_error' }. NEVER zero. The result is
   *     never coalesced to a numeric fallback. (EXTRACT-04.)
   *   - '%' is kept RAW with an isPercent flag. Do NOT divide by 100 -- the
   *     comparison layer (Plan 02) decides what the percent means.
   *   - decimal_separator override WINS over the locale-discovered decimal (D-04).
   *   - The discovered separators are memoized per locale in a Map (the
   *     Intl.NumberFormat constructor is expensive and runs per mutation tick).
   *
   * NO EMOJIS, ASCII-only source. Where a comment names a separator code point
   * it uses the U+XXXX form rather than embedding the literal character. This
   * module is pure: it performs no browser-API access of any kind and reads no
   * DOM (so it deliberately omits the lazy browser-API resolver the stateful
   * sibling modules carry).
   */

  // ---- Separator discovery (memoized per locale) ---------------------------

  // locale -> { group, decimal }. The Intl.NumberFormat constructor is costly
  // and evaluate() runs it per mutation tick, so memoize the result.
  var _sepCache = new Map();

  /**
   * Discover the group + decimal separators a locale uses, by formatting a
   * known number (11000.1 exercises both a grouping boundary and a decimal).
   * Reads the part of type 'group' and the part of type 'decimal'. Falls back
   * to a safe { group: ',', decimal: '.' } on any throw (e.g. an unknown
   * locale tag). Result is cached.
   *
   * Verified separators (Node v25.9.0): de-DE group '.' / decimal ',';
   * fr-FR group U+202F (narrow no-break space); en-IN Indian multi-group with
   * group U+002C; en-US group ',' / decimal '.'.
   */
  function _discoverSeparators(locale) {
    if (_sepCache.has(locale)) {
      return _sepCache.get(locale);
    }
    var seps = { group: ',', decimal: '.' }; // safe default
    try {
      var parts = new Intl.NumberFormat(locale).formatToParts(11000.1);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.type === 'group') {
          seps.group = p.value;
        } else if (p.type === 'decimal') {
          seps.decimal = p.value;
        }
      }
    } catch (_e) {
      // keep the defaults
    }
    _sepCache.set(locale, seps);
    return seps;
  }

  // ---- Locale-aware numeric parse (D-03) -----------------------------------

  /**
   * parseLocaleNumber(raw, opts)
   *
   * opts: { locale?: string, decimal_separator?: string }
   *   - locale: the BCP-47 tag whose separators are discovered (default en-US).
   *   - decimal_separator: an explicit decimal separator that WINS over the
   *     locale-discovered decimal (D-04). Group separator still comes from the
   *     locale (the override resolves only the decimal ambiguity).
   *
   * Returns one of:
   *   - { value: <number>, isPercent: <boolean> }  on a successful parse.
   *   - { error: 'parse_error', isPercent: <boolean> }  on a failed parse.
   *     NEVER { value: 0 } on failure. NEVER a NaN leaks out.
   *
   * Normalize order (the verified recipe, 15-RESEARCH.md:457-483):
   *   (1) strip a parentheses-negative wrapper, record sign = -1.
   *   (2) detect '%' (record isPercent, keep the digits raw); detect a leading
   *       '-' as sign.
   *   (3) remove the GROUP separator via LITERAL split/join (never a
   *       separator-built RegExp).
   *   (4) swap the DECIMAL separator to '.' via literal split/join.
   *   (5) strip everything that is not [0-9.] (kills currency glyphs incl.
   *       letter currencies CHF/kr/zl, the CHF apostrophe group, crypto glyphs,
   *       '%', and stray letters -- one generic strip, no symbol list).
   *   (6) parseFloat; a non-finite result is a parse_error.
   */
  function parseLocaleNumber(raw, opts) {
    // Reject non-string / empty up front -> distinct parse_error (never 0).
    if (typeof raw !== 'string') {
      return { error: 'parse_error', isPercent: false };
    }
    var s = raw.trim();
    if (!s) {
      return { error: 'parse_error', isPercent: false };
    }

    var sign = 1;

    // (1) parentheses-negative: "($1,234.56)" -> sign -1, inner "$1,234.56".
    if (/^\(.*\)$/.test(s)) {
      sign = -1;
      s = s.slice(1, -1);
    }

    // (2) percent (kept RAW; never /100) + explicit leading-minus sign.
    var isPercent = s.indexOf('%') !== -1;
    if (/^-/.test(s)) {
      sign = -1;
    }

    // Resolve separators. decimal_separator override WINS over locale (D-04).
    var locale = (opts && opts.locale) ? opts.locale : 'en-US';
    var seps = _discoverSeparators(locale);
    var groupSep = seps.group;
    var decimalSep = (opts && opts.decimal_separator) ? opts.decimal_separator : seps.decimal;

    // WR-03: when the (override) decimal separator collides with the locale group
    // separator, the decimal override must WIN. Do not strip that character as a
    // group separator first -- that silently defeats the override (e.g. '1,5'
    // with locale en-US + decimal_separator ',' would yield 15 instead of 1.5).
    if (decimalSep && decimalSep === groupSep) {
      groupSep = '';
    }

    // (3) remove the group separator with a LITERAL split/join. A RegExp built
    //     from groupSep is forbidden: '.' (the de-DE group sep) is a regex
    //     metacharacter and would mis-strip.
    if (groupSep) {
      s = s.split(groupSep).join('');
    }

    // (4) swap the decimal separator to '.' (only when it is not already '.').
    if (decimalSep && decimalSep !== '.') {
      s = s.split(decimalSep).join('.');
    }

    // (5) strip everything non-[0-9.] -- currency/crypto glyphs, '%', letters,
    //     and any residual separator characters all fall to this generic strip.
    s = s.replace(/[^0-9.]/g, '');

    // (5b) WR-04: a residual with more than one '.' is malformed/ambiguous
    //      ("1.2.3" -> parseFloat would silently truncate to 1.2). Surface
    //      parse_error instead of letting an ambiguous value drive a comparison.
    if ((s.match(/\./g) || []).length > 1) {
      return { error: 'parse_error', isPercent: isPercent };
    }

    // (6) parseFloat; a non-finite result is a parse_error (NEVER zero, NEVER a
    //     falsy-coalesce to a numeric fallback). This is the EXTRACT-04
    //     chokepoint.
    var n = parseFloat(s);
    if (!Number.isFinite(n)) {
      return { error: 'parse_error', isPercent: isPercent };
    }
    return { value: sign * n, isPercent: isPercent };
  }

  // ---- Value source selection (EXTRACT-03 / D-05) --------------------------

  /**
   * extractValue(reportedValue, descriptor)
   *
   * reportedValue: { text?: string, attributes?: { [name]: string } } -- the
   *   payload the (Phase 16/17) watch layer reported. This function only SELECTS
   *   a source from it; it does not read the DOM.
   * descriptor: { extract?: 'text' | 'number' | 'attribute', attribute?: string }
   *
   * Returns the selected raw value, trimmed:
   *   - 'attribute' -> reportedValue.attributes[descriptor.attribute] trimmed,
   *     or '' when the attribute is absent / not a string (never a throw).
   *   - 'text' and 'number' -> reportedValue.text trimmed. (The numeric parse
   *     for 'number' happens later at the compare site via parseLocaleNumber,
   *     NOT here -- D-05.)
   *   - any unknown mode falls back to 'text'.
   */
  function extractValue(reportedValue, descriptor) {
    var mode = (descriptor && descriptor.extract) ? descriptor.extract : 'text';

    if (mode === 'attribute') {
      var name = descriptor ? (descriptor.attribute || descriptor.attrName || descriptor.attr_name) : undefined;
      var attrs = (reportedValue && reportedValue.attributes) ? reportedValue.attributes : {};
      var attrVal = (typeof name === 'string') ? attrs[name] : undefined;
      return (typeof attrVal === 'string') ? attrVal.trim() : '';
    }

    // 'text' and 'number' both start from the reported raw text (trimmed).
    var text = (reportedValue && typeof reportedValue.text === 'string') ? reportedValue.text.trim() : '';
    return text;
  }

  // ---- Export shape (mirror trigger-store.js:185-200) ----------------------

  var exportsObj = {
    parseLocaleNumber: parseLocaleNumber,
    extractValue: extractValue
  };

  global.FsbValueExtractor = exportsObj;            // SW importScripts consumer

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;                    // Node test consumer
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
