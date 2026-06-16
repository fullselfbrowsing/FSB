'use strict';

/**
 * Phase 15 plan 01 -- value-extractor.js validation (locale matrix + extract
 * override + parse_error).
 *
 * Validates extension/utils/value-extractor.js, the pure DOM-free numeric-parse
 * + value-source-selection module (D-01/D-03/D-04/D-05). The module is PURE
 * (no chrome, no DOM), so this test needs NO chrome mock -- a plain require()
 * plus a require.cache bust suffices (the fresh-require pattern from
 * tests/trigger-store.test.js:41-46, simplified because there is no lazy
 * _getChrome() to re-bind).
 *
 * Every row of the locale matrix below corresponds 1:1 to the authoritative
 * input/expected table in 15-RESEARCH.md:646-661 (every row is mandatory for
 * EXTRACT-01). NBSP-bearing and non-ASCII inputs are built from their numeric
 * code points via String.fromCodePoint, so the test source stays strictly
 * ASCII (LC_ALL=C grep -P over 0x80-0xFF finds nothing). The escape forms the
 * code points denote, for reference: regular no-break space is the
 * escape, narrow no-break space is the  escape, bitcoin sign is the
 *  escape -- but we build them numerically below so the source has no
 * literal multibyte byte.
 *
 * Wave 0 (RED): every case fails because extension/utils/value-extractor.js
 * does not yet exist (require throws). Wave 1 (GREEN): all cases pass once the
 * module lands.
 *
 * Run: node tests/value-extractor.test.js
 */

const assert = require('assert');

const EXTRACTOR_PATH = require.resolve('../extension/utils/value-extractor.js');

// Code points built numerically (ASCII-only source). Escape-form references in
// the comments:  (regular NBSP),  (narrow NBSP),  (bitcoin).
const NBSP = String.fromCodePoint(0x00A0);        //  regular no-break space
const NARROW_NBSP = String.fromCodePoint(0x202F); //  narrow no-break space
const BITCOIN = String.fromCodePoint(0x20BF);     //  bitcoin sign (non-ISO-4217)

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function freshRequire() {
  // Drop the module cache so a re-run sees the latest module source. The module
  // is pure, so there is no mock to rebind -- this keeps the harness shape
  // consistent with the other trigger tests.
  try { delete require.cache[EXTRACTOR_PATH]; } catch (_e) { /* not yet exists */ }
  return require(EXTRACTOR_PATH);
}

// numEq: parseFloat round-trips are exact for these inputs, but compare with a
// tiny epsilon to be robust against any float representation noise.
function numEq(actual, expected) {
  return typeof actual === 'number' && Math.abs(actual - expected) < 1e-9;
}

(function main() {
  let X;
  try {
    X = freshRequire();
  } catch (err) {
    // RED state: module absent. Surface a single explicit failure and exit
    // non-zero so the TDD RED gate is unambiguous.
    console.error('  FAIL: require value-extractor.js --', err && err.message ? err.message : err);
    console.log('\n--- Phase 15 plan 01 value-extractor summary ---');
    console.log('  passed:', 0);
    console.log('  failed:', 1);
    process.exit(1);
    return;
  }

  const parseLocaleNumber = X.parseLocaleNumber;
  const extractValue = X.extractValue;

  // ---- Export surface ------------------------------------------------------
  check(typeof parseLocaleNumber === 'function', 'exports parseLocaleNumber');
  check(typeof extractValue === 'function', 'exports extractValue');

  // ---- Locale-parse matrix (EXTRACT-01) ------------------------------------
  // Each row mirrors 15-RESEARCH.md:646-661. NBSP / crypto glyphs come from the
  // NBSP / NARROW_NBSP / BITCOIN constants above (numeric), never literals.

  // 1. $1,234.56 en-US -> 1234.56, isPercent=false
  (function () {
    const r = parseLocaleNumber('$1,234.56', { locale: 'en-US' });
    check(numEq(r.value, 1234.56) && r.isPercent === false,
      'en-US $1,234.56 -> 1234.56 (isPercent false)');
  })();

  // 2. 1.234,56 de-DE -> 1234.56
  (function () {
    const r = parseLocaleNumber('1.234,56', { locale: 'de-DE' });
    check(numEq(r.value, 1234.56), 'de-DE 1.234,56 -> 1234.56');
  })();

  // 3. 1 +  + 234,56 fr-FR -> 1234.56 (regular NBSP group)
  (function () {
    const input = '1' + NBSP + '234,56';
    const r = parseLocaleNumber(input, { locale: 'fr-FR' });
    check(numEq(r.value, 1234.56), 'fr-FR 1[\\u00A0]234,56 -> 1234.56 (regular NBSP)');
  })();

  // 4. 1 +  + 234,56 fr-FR -> 1234.56 (narrow NBSP group)
  (function () {
    const input = '1' + NARROW_NBSP + '234,56';
    const r = parseLocaleNumber(input, { locale: 'fr-FR' });
    check(numEq(r.value, 1234.56), 'fr-FR 1[\\u202F]234,56 -> 1234.56 (narrow NBSP)');
  })();

  // 5. 12,34,567.89 en-IN -> 1234567.89 (Indian multi-group)
  (function () {
    const r = parseLocaleNumber('12,34,567.89', { locale: 'en-IN' });
    check(numEq(r.value, 1234567.89), 'en-IN 12,34,567.89 -> 1234567.89 (multi-group)');
  })();

  // 6. ($1,234.56) en-US -> -1234.56 (accounting parentheses negative)
  (function () {
    const r = parseLocaleNumber('($1,234.56)', { locale: 'en-US' });
    check(numEq(r.value, -1234.56), 'en-US ($1,234.56) -> -1234.56 (parens negative)');
  })();

  // 7. -1.234,56 de-DE -> -1234.56
  (function () {
    const r = parseLocaleNumber('-1.234,56', { locale: 'de-DE' });
    check(numEq(r.value, -1234.56), 'de-DE -1.234,56 -> -1234.56');
  })();

  // 8. 12,5 +  + % de-DE -> 12.5, isPercent=true (NOT 0.125)
  (function () {
    const input = '12,5' + NBSP + '%';
    const r = parseLocaleNumber(input, { locale: 'de-DE' });
    check(numEq(r.value, 12.5) && r.isPercent === true,
      'de-DE 12,5[\\u00A0]% -> 12.5 isPercent=true (NOT 0.125)');
  })();

  // 9. 45% en-US -> 45, isPercent=true
  (function () {
    const r = parseLocaleNumber('45%', { locale: 'en-US' });
    check(numEq(r.value, 45) && r.isPercent === true,
      'en-US 45% -> 45 isPercent=true');
  })();

  // 10. CHF 1'234.50 de-CH -> 1234.50 (apostrophe group stripped by generic strip)
  (function () {
    const r = parseLocaleNumber("CHF 1'234.50", { locale: 'de-CH' });
    check(numEq(r.value, 1234.5), "de-CH CHF 1'234.50 -> 1234.50 (apostrophe stripped)");
  })();

  // ---- The THREE override cases that prove D-04 (locale/decimal_separator) --

  // 11. 1.234 de-DE -> 1234 ('.' is the GROUP separator in de-DE)
  (function () {
    const r = parseLocaleNumber('1.234', { locale: 'de-DE' });
    check(numEq(r.value, 1234), "de-DE 1.234 -> 1234 ('.' is GROUP sep)");
  })();

  // 12. SAME string 1.234 en-US -> 1.234 ('.' is the DECIMAL separator in en-US)
  (function () {
    const r = parseLocaleNumber('1.234', { locale: 'en-US' });
    check(numEq(r.value, 1.234), "en-US 1.234 -> 1.234 ('.' is DECIMAL sep; D-04 necessity)");
  })();

  // 13. 1.234 with explicit decimal_separator:'.' -> 1.234 (override WINS over locale)
  (function () {
    const r = parseLocaleNumber('1.234', { decimal_separator: '.' });
    check(numEq(r.value, 1.234), "decimal_separator:'.' override -> 1.234 (override wins; D-04)");
  })();

  // 14.  + 0.5 en-US -> 0.5 (bitcoin-sign crypto glyph generic-stripped)
  (function () {
    const input = BITCOIN + '0.5';
    const r = parseLocaleNumber(input, { locale: 'en-US' });
    check(numEq(r.value, 0.5), 'en-US [\\u20BF]0.5 -> 0.5 (crypto glyph stripped)');
  })();

  // ---- parse_error cases (EXTRACT-04): NEVER value 0, NEVER NaN leaking out --

  // 15. 'abc' -> parse_error
  (function () {
    const r = parseLocaleNumber('abc');
    check(r && r.error === 'parse_error' && r.value === undefined,
      "'abc' -> parse_error (no value 0, never a fire)");
  })();

  // 16. '' -> parse_error
  (function () {
    const r = parseLocaleNumber('');
    check(r && r.error === 'parse_error' && r.value === undefined,
      "'' -> parse_error (no value 0)");
  })();

  // 17. null -> parse_error
  (function () {
    const r = parseLocaleNumber(null);
    check(r && r.error === 'parse_error' && r.value === undefined,
      'null -> parse_error (no value 0)');
  })();

  // ---- extract source-selection (EXTRACT-03 / D-05) ------------------------

  // 18. extract:'text' returns the trimmed reported text
  (function () {
    const r = extractValue({ text: '  $42  ' }, { extract: 'text' });
    check(r === '$42', "extract:'text' -> '$42' (trimmed)");
  })();

  // 19. extract:'attribute' reads the named attribute
  (function () {
    const r = extractValue(
      { attributes: { 'data-price': '19.99' } },
      { extract: 'attribute', attribute: 'data-price' }
    );
    check(r === '19.99', "extract:'attribute' data-price -> '19.99'");
  })();

  // 20. extract:'number' returns the raw trimmed text (numeric parse happens at
  //     the compare site, not here -- D-05)
  (function () {
    const r = extractValue({ text: '50' }, { extract: 'number' });
    check(r === '50', "extract:'number' -> '50' (raw text; parse at compare site)");
  })();

  // 21. REGRESSION (Phase 15 code review WR-03): a decimal_separator override that
  //     COLLIDES with the locale group separator must WIN -- the group strip must
  //     not eat the override character first. '1,5' en-US + decimal_separator ','
  //     parses to 1.5, not 15.
  (function () {
    const r = parseLocaleNumber('1,5', { locale: 'en-US', decimal_separator: ',' });
    check(r && r.value === 1.5, "WR-03 '1,5' en-US decimal_separator ',' -> 1.5 (override wins over group strip)");
  })();

  // 22. REGRESSION (Phase 15 code review WR-04): a malformed multi-decimal value
  //     must be parse_error, not a silent parseFloat truncation ('1.2.3' -> 1.2).
  (function () {
    const r = parseLocaleNumber('1.2.3', { locale: 'en-US' });
    check(r && r.error === 'parse_error', "WR-04 '1.2.3' -> parse_error (no silent truncation to 1.2)");
  })();

  console.log('\n--- Phase 15 plan 01 value-extractor summary ---');
  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
})();
