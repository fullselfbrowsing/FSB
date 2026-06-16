'use strict';

/**
 * Phase 15 plan 02 -- trigger-manager.js PURE evaluate() engine.
 *
 * Validates the genuinely-new comparison logic of the milestone:
 *   - All SIX condition kinds (changed / threshold / contains / percent_change /
 *     equals / regex), each with a fires case, a no-fire case, the edge
 *     exactly-one-fire case, and (where numeric) a parse_error case.
 *   - Compound { combinator:'AND'|'OR', conditions:[...] } folds per-condition
 *     booleans on one element; ANY sub-condition error short-circuits the WHOLE
 *     compound to that error (never a partial fire) -- Pitfall 5.
 *   - Edge-trigger semantics: was_satisfied false->true + fire-once. Re-evaluating
 *     the SAME satisfying value with was_satisfied:true yields no_fire (exactly
 *     one fire across an oscillation / SW eviction).
 *   - Regex ReDoS guard: valid pattern matches; (a+)+ / (a|a)* / .*.* / >1000-char
 *     / invalid-syntax all -> pattern_error; compile-once cache identity; over-cap
 *     candidate text truncated before .test() so the call returns without hanging.
 *   - PURITY: a source-level assertion that the brace-matched body of evaluate()
 *     contains NEITHER `chrome.storage` NOR `_getChrome(` (proves evaluate() does
 *     zero storage I/O even after Task 3 adds the storage.local cap to the same
 *     file), and that the manager file never touches chrome.storage.session.
 *
 * These cases inject a fake snapshot + reportedValue directly and call
 * evaluate(snapshot, reportedValue, fixedNow) -- NO chrome is needed here (the
 * cap path lives in tests/trigger-cap.test.js).
 *
 * Run: node tests/trigger-manager.test.js
 * Framework: Node built-in assert + a local check() counter (NO Jest/Mocha).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const MANAGER_PATH = require.resolve('../extension/utils/trigger-manager.js');
const EXTRACTOR_PATH = require.resolve('../extension/utils/value-extractor.js');

function freshRequireManager() {
  // The manager resolves the extractor lazily off the global; require the
  // extractor first so FsbValueExtractor is installed before evaluate() runs.
  delete require.cache[EXTRACTOR_PATH];
  require(EXTRACTOR_PATH);
  delete require.cache[MANAGER_PATH];
  return require(MANAGER_PATH);
}

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('  FAIL: ' + msg);
  }
}

const NOW = 1700000000000; // fixed injected clock for determinism

// Helper: a single-condition snapshot factory. wasSatisfied defaults to false.
function snap(condition, baseline, lastValue, wasSatisfied) {
  return {
    condition: condition,
    baseline: baseline,
    last_value: lastValue,
    was_satisfied: wasSatisfied === true
  };
}
function reported(text, attributes) {
  var rv = { text: text };
  if (attributes) rv.attributes = attributes;
  return rv;
}

(function main() {
  const M = freshRequireManager();
  const evaluate = M.evaluate;
  assert.strictEqual(typeof evaluate, 'function', 'evaluate must be exported as a function');

  // ====================================================================
  // KIND 1: changed
  // ====================================================================
  console.log('--- KIND: changed ---');
  {
    // (a) fires: text differs from baseline
    var r = evaluate(snap({ kind: 'changed' }, '100', '100', false), reported('105'), NOW);
    check(r.outcome === 'fired', 'changed: differing value fires');
    check(r.next_state && r.next_state.was_satisfied === true, 'changed: next_state.was_satisfied true on fire');
    // (b) no_fire: equal to baseline
    var r2 = evaluate(snap({ kind: 'changed' }, '100', '100', false), reported('100'), NOW);
    check(r2.outcome === 'no_fire', 'changed: equal value does not fire');
    // (c) edge exactly-one-fire: fire once, then re-evaluate same value with was_satisfied:true
    var e1 = evaluate(snap({ kind: 'changed' }, '100', '100', false), reported('105'), NOW);
    check(e1.outcome === 'fired' && e1.next_state.was_satisfied === true, 'changed: first edge fires');
    var e2 = evaluate(snap({ kind: 'changed' }, '100', '105', true), reported('105'), NOW);
    check(e2.outcome === 'no_fire', 'changed: re-evaluate same satisfying value -> no_fire (exactly-one-fire)');
  }

  // ====================================================================
  // KIND 2: threshold (all four operators)
  // ====================================================================
  console.log('--- KIND: threshold ---');
  {
    // >= fires
    var ge = evaluate(snap({ kind: 'threshold', operator: '>=', target: '1000' }, '1000', '1000', false), reported('1050'), NOW);
    check(ge.outcome === 'fired', 'threshold >=: 1050 >= 1000 fires');
    // <= no_fire on the same value
    var le = evaluate(snap({ kind: 'threshold', operator: '<=', target: '1000' }, '1000', '1000', false), reported('1050'), NOW);
    check(le.outcome === 'no_fire', 'threshold <=: 1050 <= 1000 does not fire');
    // > strict
    var gt = evaluate(snap({ kind: 'threshold', operator: '>', target: '1000' }, '1000', '1000', false), reported('1001'), NOW);
    check(gt.outcome === 'fired', 'threshold >: 1001 > 1000 fires');
    var gtEq = evaluate(snap({ kind: 'threshold', operator: '>', target: '1000' }, '1000', '1000', false), reported('1000'), NOW);
    check(gtEq.outcome === 'no_fire', 'threshold >: 1000 > 1000 does not fire (strict)');
    // < strict
    var lt = evaluate(snap({ kind: 'threshold', operator: '<', target: '1000' }, '1000', '1000', false), reported('999'), NOW);
    check(lt.outcome === 'fired', 'threshold <: 999 < 1000 fires');
    // No string-vs-number coercion: '1,050' must PARSE to 1050 then compare, not JS-coerce.
    var coerce = evaluate(snap({ kind: 'threshold', operator: '>=', target: '1000' }, '1000', '1000', false), reported('1,050'), NOW);
    check(coerce.outcome === 'fired', 'threshold: "1,050" parses to 1050 then >= 1000 fires (no string coercion)');
    // edge exactly-one-fire
    var t1 = evaluate(snap({ kind: 'threshold', operator: '>=', target: '1000' }, '1000', '999', false), reported('1050'), NOW);
    check(t1.outcome === 'fired', 'threshold: first edge fires');
    var t2 = evaluate(snap({ kind: 'threshold', operator: '>=', target: '1000' }, '1000', '1050', true), reported('1050'), NOW);
    check(t2.outcome === 'no_fire', 'threshold: re-evaluate same satisfying value -> no_fire');
    // parse_error: non-numeric reported value
    var pe = evaluate(snap({ kind: 'threshold', operator: '>=', target: '1000' }, '1000', '1000', false), reported('not-a-number'), NOW);
    check(pe.outcome === 'parse_error', 'threshold: non-numeric value -> parse_error');
    var pe2 = evaluate(snap({ kind: 'threshold', operator: '>=', target: 'xyz' }, '1000', '1000', false), reported('1050'), NOW);
    check(pe2.outcome === 'parse_error', 'threshold: non-numeric target -> parse_error');
  }

  // ====================================================================
  // KIND 3: contains (case-insensitive default)
  // ====================================================================
  console.log('--- KIND: contains ---');
  {
    // (a) fires case-insensitive by default
    var ci = evaluate(snap({ kind: 'contains', value: 'in stock' }, '', '', false), reported('In Stock'), NOW);
    check(ci.outcome === 'fired', 'contains: "In Stock" contains "in stock" (case-insensitive default) fires');
    // (b) no_fire when substring absent
    var nf = evaluate(snap({ kind: 'contains', value: 'sold out' }, '', '', false), reported('In Stock'), NOW);
    check(nf.outcome === 'no_fire', 'contains: missing substring does not fire');
    // case_sensitive:true flips it to no_fire
    var cs = evaluate(snap({ kind: 'contains', value: 'in stock', case_sensitive: true }, '', '', false), reported('In Stock'), NOW);
    check(cs.outcome === 'no_fire', 'contains: case_sensitive:true makes "in stock" not match "In Stock"');
    // edge exactly-one-fire
    var c1 = evaluate(snap({ kind: 'contains', value: 'in stock' }, '', '', false), reported('In Stock'), NOW);
    check(c1.outcome === 'fired', 'contains: first edge fires');
    var c2 = evaluate(snap({ kind: 'contains', value: 'in stock' }, '', 'In Stock', true), reported('In Stock'), NOW);
    check(c2.outcome === 'no_fire', 'contains: re-evaluate same satisfying value -> no_fire');
  }

  // ====================================================================
  // KIND 4: percent_change
  // ====================================================================
  console.log('--- KIND: percent_change ---');
  {
    // (a) fires: 100 -> 110 is 10% change, threshold 5%
    var up = evaluate(snap({ kind: 'percent_change', percent: 5 }, '100', '100', false), reported('110'), NOW);
    check(up.outcome === 'fired', 'percent_change: 100->110 (10%) >= 5% fires');
    // (b) no_fire: 100 -> 102 is 2% change, threshold 5%
    var small = evaluate(snap({ kind: 'percent_change', percent: 5 }, '100', '100', false), reported('102'), NOW);
    check(small.outcome === 'no_fire', 'percent_change: 100->102 (2%) < 5% does not fire');
    // baseline 0 -> parse_error (no divide-by-zero fire)
    var dz = evaluate(snap({ kind: 'percent_change', percent: 5 }, '0', '0', false), reported('110'), NOW);
    check(dz.outcome === 'parse_error', 'percent_change: baseline 0 -> parse_error (no divide-by-zero)');
    // baseline NaN -> parse_error
    var bn = evaluate(snap({ kind: 'percent_change', percent: 5 }, 'abc', 'abc', false), reported('110'), NOW);
    check(bn.outcome === 'parse_error', 'percent_change: baseline NaN -> parse_error');
    // current parse_error
    var cn = evaluate(snap({ kind: 'percent_change', percent: 5 }, '100', '100', false), reported('xyz'), NOW);
    check(cn.outcome === 'parse_error', 'percent_change: non-numeric current -> parse_error');
    // edge exactly-one-fire
    var p1 = evaluate(snap({ kind: 'percent_change', percent: 5 }, '100', '100', false), reported('110'), NOW);
    check(p1.outcome === 'fired', 'percent_change: first edge fires');
    var p2 = evaluate(snap({ kind: 'percent_change', percent: 5 }, '100', '110', true), reported('110'), NOW);
    check(p2.outcome === 'no_fire', 'percent_change: re-evaluate same satisfying value -> no_fire');
  }

  // ====================================================================
  // KIND 5: equals (numeric with tolerance + text exact)
  // ====================================================================
  console.log('--- KIND: equals ---');
  {
    // numeric equals with tolerance fires
    var ne = evaluate(snap({ kind: 'equals', numeric: true, value: '100', tolerance: 0.5 }, '0', '0', false), reported('100.3'), NOW);
    check(ne.outcome === 'fired', 'equals(numeric): 100.3 within tolerance 0.5 of 100 fires');
    // numeric equals outside tolerance no_fire
    var ne2 = evaluate(snap({ kind: 'equals', numeric: true, value: '100', tolerance: 0.5 }, '0', '0', false), reported('101'), NOW);
    check(ne2.outcome === 'no_fire', 'equals(numeric): 101 outside tolerance 0.5 of 100 does not fire');
    // text equals exact fires
    var te = evaluate(snap({ kind: 'equals', value: 'Available' }, '', '', false), reported('Available'), NOW);
    check(te.outcome === 'fired', 'equals(text): exact "Available" fires');
    // text equals mismatch no_fire
    var te2 = evaluate(snap({ kind: 'equals', value: 'Available' }, '', '', false), reported('available'), NOW);
    check(te2.outcome === 'no_fire', 'equals(text): exact match is case-sensitive, "available" does not equal "Available"');
    // numeric equals parse_error
    var ee = evaluate(snap({ kind: 'equals', numeric: true, value: '100' }, '0', '0', false), reported('not-a-number'), NOW);
    check(ee.outcome === 'parse_error', 'equals(numeric): non-numeric value -> parse_error');
    // edge exactly-one-fire (text)
    var q1 = evaluate(snap({ kind: 'equals', value: 'Available' }, '', '', false), reported('Available'), NOW);
    check(q1.outcome === 'fired', 'equals: first edge fires');
    var q2 = evaluate(snap({ kind: 'equals', value: 'Available' }, '', 'Available', true), reported('Available'), NOW);
    check(q2.outcome === 'no_fire', 'equals: re-evaluate same satisfying value -> no_fire');
  }

  // ====================================================================
  // KIND 6: regex (the ReDoS guard surface)
  // ====================================================================
  console.log('--- KIND: regex ---');
  {
    // (a) valid pattern matches -> fired
    var rx = evaluate(snap({ kind: 'regex', pattern: '^Price: [0-9]+$' }, '', '', false), reported('Price: 42'), NOW);
    check(rx.outcome === 'fired', 'regex: valid pattern matches -> fired');
    // (b) valid pattern no match -> no_fire
    var rxn = evaluate(snap({ kind: 'regex', pattern: '^Price: [0-9]+$' }, '', '', false), reported('Out of stock'), NOW);
    check(rxn.outcome === 'no_fire', 'regex: valid pattern no match -> no_fire');
    // evil shapes -> pattern_error
    var ev1 = evaluate(snap({ kind: 'regex', pattern: '(a+)+' }, '', '', false), reported('aaaaaaaaaa'), NOW);
    check(ev1.outcome === 'pattern_error', 'regex: (a+)+ nested quantifier -> pattern_error');
    var ev2 = evaluate(snap({ kind: 'regex', pattern: '(a|a)*' }, '', '', false), reported('aaaaaaaaaa'), NOW);
    check(ev2.outcome === 'pattern_error', 'regex: (a|a)* alternation-under-quantifier -> pattern_error');
    var ev3 = evaluate(snap({ kind: 'regex', pattern: '.*.*' }, '', '', false), reported('aaaaaaaaaa'), NOW);
    check(ev3.outcome === 'pattern_error', 'regex: .*.* adjacent unbounded -> pattern_error');
    // >1000-char pattern -> pattern_error
    var longPattern = 'a'.repeat(1001);
    var ev4 = evaluate(snap({ kind: 'regex', pattern: longPattern }, '', '', false), reported('aaa'), NOW);
    check(ev4.outcome === 'pattern_error', 'regex: >1000-char pattern -> pattern_error');
    // invalid syntax '(' -> pattern_error
    var ev5 = evaluate(snap({ kind: 'regex', pattern: '(' }, '', '', false), reported('aaa'), NOW);
    check(ev5.outcome === 'pattern_error', 'regex: invalid syntax "(" -> pattern_error');
    // edge exactly-one-fire
    var rg1 = evaluate(snap({ kind: 'regex', pattern: 'stock' }, '', '', false), reported('in stock now'), NOW);
    check(rg1.outcome === 'fired', 'regex: first edge fires');
    var rg2 = evaluate(snap({ kind: 'regex', pattern: 'stock' }, '', 'in stock now', true), reported('in stock now'), NOW);
    check(rg2.outcome === 'no_fire', 'regex: re-evaluate same satisfying value -> no_fire');
  }

  // ====================================================================
  // Regex internals: compile-once cache + over-cap text truncation
  // ====================================================================
  console.log('--- regex internals: compile-once + text cap ---');
  {
    // compile-once cache identity: compiling the SAME pattern twice returns the
    // cached RegExp. The manager exposes guardAndCompile for this assertion.
    if (typeof M.guardAndCompile === 'function') {
      var g1 = M.guardAndCompile('^xyz[0-9]+$');
      var g2 = M.guardAndCompile('^xyz[0-9]+$');
      check(g1 && g1.re && g2 && g2.re && g1.re === g2.re, 'regex: compiling the same pattern twice returns the cached RegExp (identity)');
    } else {
      check(false, 'manager must export guardAndCompile for the compile-once identity assertion');
    }
    // over-cap candidate text is truncated before .test() and returns without hanging.
    // A benign pattern against a huge text: the bounded slice means it completes fast.
    var hugeText = 'b'.repeat(50000) + 'NEEDLE';
    var start = Date.now();
    var capped = evaluate(snap({ kind: 'regex', pattern: 'NEEDLE' }, '', '', false), reported(hugeText), NOW);
    var elapsed = Date.now() - start;
    // The needle sits past the 10000-char element cap, so a TRUNCATED candidate
    // does not contain it -> no_fire. The point is it returns (no hang) and the
    // truncation is observable (no match because the needle was sliced off).
    check(capped.outcome === 'no_fire', 'regex: over-cap text is truncated before .test() (needle past cap -> no_fire, proves truncation)');
    check(elapsed < 2000, 'regex: over-cap text evaluation returns promptly (no hang)');
  }

  // ====================================================================
  // COMPOUND: AND / OR fold + error short-circuit (Pitfall 5)
  // ====================================================================
  console.log('--- COMPOUND: AND / OR + error short-circuit ---');
  {
    // AND both-true -> fired
    var andCond = {
      combinator: 'AND',
      conditions: [
        { kind: 'threshold', operator: '>=', target: '100' },
        { kind: 'contains', value: 'stock' }
      ]
    };
    var andFire = evaluate(snap(andCond, '0', '0', false), reported('150 in stock'), NOW);
    check(andFire.outcome === 'fired', 'compound AND: both sub-conditions true -> fired');
    // AND one-false -> no_fire (threshold fails)
    var andNo = evaluate(snap(andCond, '0', '0', false), reported('50 in stock'), NOW);
    check(andNo.outcome === 'no_fire', 'compound AND: one sub-condition false -> no_fire');
    // OR one-true -> fired
    var orCond = {
      combinator: 'OR',
      conditions: [
        { kind: 'threshold', operator: '>=', target: '100' },
        { kind: 'contains', value: 'stock' }
      ]
    };
    var orFire = evaluate(snap(orCond, '0', '0', false), reported('50 in stock'), NOW);
    check(orFire.outcome === 'fired', 'compound OR: one sub-condition true -> fired');
    var orNo = evaluate(snap(orCond, '0', '0', false), reported('50 sold out'), NOW);
    check(orNo.outcome === 'no_fire', 'compound OR: neither sub-condition true -> no_fire');
    // ERROR short-circuit: one leg parse_error -> whole compound parse_error (NOT a partial fire)
    var errCondOr = {
      combinator: 'OR',
      conditions: [
        { kind: 'contains', value: 'stock' },              // would be TRUE alone
        { kind: 'threshold', operator: '>=', target: 'xyz' } // parse_error (bad target)
      ]
    };
    var errOut = evaluate(snap(errCondOr, '0', '0', false), reported('in stock'), NOW);
    check(errOut.outcome === 'parse_error', 'compound OR: a leg parse_error short-circuits the WHOLE compound to parse_error (no partial fire)');
    // ERROR short-circuit: one leg pattern_error -> whole compound pattern_error
    var errCondAnd = {
      combinator: 'AND',
      conditions: [
        { kind: 'contains', value: 'stock' },
        { kind: 'regex', pattern: '(a+)+' }                 // pattern_error (evil shape)
      ]
    };
    var errOut2 = evaluate(snap(errCondAnd, '0', '0', false), reported('in stock'), NOW);
    check(errOut2.outcome === 'pattern_error', 'compound AND: a leg pattern_error short-circuits the WHOLE compound to pattern_error');
    // compound edge exactly-one-fire
    var ce1 = evaluate(snap(orCond, '0', '0', false), reported('150 sold out'), NOW);
    check(ce1.outcome === 'fired', 'compound: first edge fires');
    var ce2 = evaluate(snap(orCond, '0', '150 sold out', true), reported('150 sold out'), NOW);
    check(ce2.outcome === 'no_fire', 'compound: re-evaluate same satisfying value -> no_fire');
  }

  // ====================================================================
  // PURITY: evaluate() does zero storage I/O (source-level proof)
  // ====================================================================
  console.log('--- PURITY: evaluate() body has no chrome.storage / _getChrome( ---');
  {
    var src = fs.readFileSync(MANAGER_PATH, 'utf8');

    // Locate `function evaluate(` and brace-match its body (NOT a file-level grep,
    // so the storage.local cap added in Task 3 elsewhere in the file does not
    // false-trigger this assertion).
    var sig = 'function evaluate(';
    var sigIdx = src.indexOf(sig);
    check(sigIdx !== -1, 'source contains a `function evaluate(` declaration');
    if (sigIdx !== -1) {
      var openIdx = src.indexOf('{', sigIdx);
      check(openIdx !== -1, 'evaluate() has an opening brace');
      var depth = 0;
      var endIdx = -1;
      for (var i = openIdx; i < src.length; i++) {
        var ch = src[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) { endIdx = i; break; }
        }
      }
      check(endIdx !== -1, 'evaluate() body braces balance');
      var body = src.slice(openIdx, endIdx + 1);
      check(body.indexOf('chrome.storage') === -1, 'evaluate() body contains NO chrome.storage access (pure)');
      check(body.indexOf('_getChrome(') === -1, 'evaluate() body does NOT call _getChrome( (pure)');
    }

    // Belt-and-suspenders file guard: the cap (Task 3) uses storage.local only.
    check(src.indexOf('chrome.storage.session') === -1, 'manager file never touches chrome.storage.session');
  }

  // ====================================================================
  console.log('');
  console.log('trigger-manager.test: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('PASS trigger-manager');
  }
})();
