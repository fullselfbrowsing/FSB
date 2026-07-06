# Phase 15: Fire-Condition Engine & Value Extraction - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md -- this log preserves the analysis.

**Date:** 2026-06-16
**Phase:** 15-fire-condition-engine-value-extraction
**Mode:** assumptions (--auto)
**Areas analyzed:** Module Decomposition, evaluate() Contract, Value Extraction & Locale Parsing, Condition Engine & Edge Semantics, Regex Safety (ReDoS), Concurrency Cap

## Assumptions Presented

### Module Decomposition
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Two new modules: `trigger-manager.js` (arm/evaluate/fire + AND/OR + cap inline) + `value-extractor.js` (locale parse + extract); cap inline, not a separate module | Confident | `research/ARCHITECTURE.md:48,78,99`; `STACK.md:52,101`; `SUMMARY.md:97`; `agent-registry.js:52-78,801-831` (cap inline precedent) |

### evaluate() Contract
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Pure DOM-free `evaluate(snapshot, reportedValue, now?)` returning typed `{outcome, matched_condition?, old_value, new_value, next_state}`; extraction called internally; lifecycle SEAM owns storage read/atomic write-back | Likely | `trigger-lifecycle.js` `evaluated_noop` SEAM + `noop_terminal` guard; `research/ARCHITECTURE.md:207,303,382`; `ROADMAP.md:50`; `PITFALLS.md:203` |

### Value Extraction & Locale Parsing
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Net-new extractor using `Intl.NumberFormat().formatToParts()` separator discovery, zero-dep, `%` raw, NaN -> `parse_error` | Confident | `STACK.md:101` ("NO existing currency helper"), `STACK.md:146-160`, `PITFALLS.md:192-209` |
| Explicit `locale`/`decimal_separator` override REQUIRED in schema now (bare-input ambiguity) | Likely -> **Confident** (external research) | `PITFALLS.md:201-202`; resolved by Topic-2 research (math: bare inputs provably unresolvable) |

### Condition Engine & Edge Semantics
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Edge-trigger (`was_satisfied:false->true`) + fire-once-default + persisted edge state in snapshot; atomic disarm/dedupe in Phase-14 SEAM write-back | Confident (requirement) / Likely (field name) | `ROADMAP.md:52`; `PITFALLS.md:213-229` (Pitfall 10/16); `trigger-lifecycle.js` re-read-every-tick |

### Regex Safety (ReDoS)
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Zero-dep guard: pattern+text length caps (hard guarantee) + static evil-shape heuristic (defense-in-depth) + compile-once-cache; `pattern_error` outcome | Unclear -> **Confident** (external research) | No in-repo precedent (only unguarded `new RegExp`); `FEATURES.md:33`, `PITFALLS.md:408`, `STACK.md:101`; resolved by Topic-1 research |

### Concurrency Cap (LIFE-04)
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Mirror `agent-registry.js`: `fsbTriggerCap` in `storage.local`, default 8, clamp 1-64, typed `TRIGGER_CAP_REACHED`, grandfather; active-count from `listArmedSnapshots()` (NOT in-heap Set) | Confident (cap shape) / Likely (active-count source) | `research/ARCHITECTURE.md:244`; `agent-registry.js:52-78,302-308,801-831`; `trigger-store.js:168-173` |

## Corrections Made

No corrections -- all assumptions confirmed (--auto, no Unclear items remaining after research).

## Auto-Resolved

`--auto` flag present. After external research, all assumptions resolved to Confident or Likely -- no Unclear items required default-selection. Proceeded directly to CONTEXT.md.

## External Research

Two codebase-insufficient topics were flagged by the analyzer and researched (general-purpose agent, WebSearch + authoritative docs):

- **Regex catastrophic-backtracking guard (zero-dep, synchronous-SW).** Finding: (a) NO sound synchronous time-box of `RegExp.prototype.test()` exists -- a sync regex blocks the single SW thread, so `setTimeout`/`AbortController` can't fire during the freeze; (b) V8's linear non-backtracking `l`-flag engine requires the `--enable-experimental-regexp-engine` startup flag with NO runtime JS API and is unreachable from an extension SW. Recommendation: input/pattern **length caps as the load-bearing CPU guarantee** + a static evil-shape heuristic (reject `(a+)+`, `(a|a)*`, adjacent quantifiers) as defense-in-depth + compile-once-cache; rejected/invalid pattern -> distinct `pattern_error`. Sources: v8.dev/blog/non-backtracking-regexp; OWASP ReDoS / Input Validation cheat sheets; eslint-plugin-regexp `no-super-linear-backtracking`; fastify/safe-regex (star-height unsound). **Confidence impact: Confident** on architecture (the two impossibility facts are settled); the exact heuristic set + N/M caps remain a tuning judgment.
- **Locale numeric-parse completeness via `formatToParts()`.** Finding: the separator-discovery recipe is sound and standard (verified vs MDN, full part-type list). Bare inputs (`1.234`, `1,5`) are **mathematically unresolvable from the string alone** -> an explicit `locale` (+ optional `decimal_separator`) override is REQUIRED for correctness and belongs in the schema now; `decimal_separator` wins over `locale`; default best-effort = page `lang`/`navigator.language`. Normalization order (parens-negative -> sign/% -> remove group via literal split/join -> swap decimal -> strip non-`[0-9.]` -> parseFloat) cleanly handles NBSP/U+202F, Indian grouping, letter/crypto currencies, `%`. Sources: MDN `Intl.NumberFormat`/`formatToParts`; v8.dev/features/intl-numberformat; W3C i18n; Unicode CLDR. **Confidence impact: Confident** on the recipe and the mandatory-override decision.
