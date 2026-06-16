---
phase: 15
slug: fire-condition-engine-value-extraction
status: secured
threats_open: 0
asvs_level: 1
created: 2026-06-16
---

# Phase 15 — Fire-Condition Engine & Value Extraction: Security Audit

**Phase:** 15 — fire-condition-engine-value-extraction
**Audited:** 2026-06-16
**ASVS Level:** 1
**block_on:** high
**Status:** SECURED — 15/15 threats closed (14 mitigate, 1 accept; no transfer threats)
**Threats Open:** 0

This audit VERIFIES each declared mitigation against the *current* (post-fix) implementation, not against documentation or intent. The phase-execution code review (15-REVIEW.md) found a VERIFIED BLOCKER (CR-01) where the T-15-05/T-15-06 ReDoS mitigation as originally written was insufficient for the exponential-backtracking class; that fix (commit `12642007`, `hasNestedQuantifier()`) was independently re-verified here, including timing.

---

## Threat Verification

| Threat ID | Category | Disposition | Verdict | Evidence (file:line + independent check) |
|-----------|----------|-------------|---------|------------------------------------------|
| T-15-01 | Tampering | mitigate | CLOSED | `value-extractor.js:155-166` literal `split(groupSep).join('')` + `split(decimalSep).join('.')`; decimal override resolved at `:139-142`. Anti-pattern guards: `new RegExp`=0, `\|\| 0`=0, `_getChrome`=0. 24/24 locale-matrix assertions pass (de-DE vs en-US `1.234` pair included). |
| T-15-02 | Tampering / DoS | mitigate | CLOSED | `value-extractor.js:178-181` `!Number.isFinite(n)` -> `{ error:'parse_error' }`; never 0, never `\|\| 0`. abc/''/null cases green. |
| T-15-03 | DoS | accept | CLOSED | Documented accepted risk (see Accepted Risks Log below). `_sepCache` (`value-extractor.js:51`) keyed by a bounded locale set; review IN-01 confirms bounded in practice (cap 8 + SW eviction). |
| T-15-04 | Tampering | mitigate | CLOSED | `value-extractor.js:203-216` plain-object lookup `attrs[name]` on the reported payload; missing/non-string attr -> `''` (never a throw, never DOM access). |
| T-15-05 | DoS (ReDoS, evil pattern) | mitigate | CLOSED | `hasNestedQuantifier()` `trigger-manager.js:130-161` (paren-aware, `{n,}`-aware) wired into `guardAndCompile` `:200-202` -> `pattern_error` before compile. INDEPENDENT TIMING: `((a+))+$`, `(a{1,}){1,}`, `(a+)+`, `(a\|a)*`, `(a\|a)+` all return `pattern_error` in 0.001–0.067ms against a 41-char input (was >8s pre-fix). Legit `https?://`, `\d{3}-\d{4}`, `((ab)+)` still compile and match. Residual (static detection incompleteness) = accepted/documented, see log. |
| T-15-06 | DoS (ReDoS, long text) | mitigate | CLOSED | `regexMatches()` `trigger-manager.js:221-237` slices to `maxLen` (TEXT_MAX_LEN_ELEMENT=10000, `:107`) BEFORE `.test()`. Now correctly scoped to the POLYNOMIAL class only; the exponential class is closed by T-15-05's structural detector. |
| T-15-07 | Tampering | mitigate | CLOSED | `evaluateCompound()` `trigger-manager.js:335-339` short-circuits the WHOLE compound to `res.error` on ANY leg error (never folds an error into `false`). OR-with-error and AND-with-error cases green. |
| T-15-08 | DoS (cap TOCTOU) | mitigate | CLOSED | `_withArmLock()` `trigger-manager.js:559-564` serializes `listArmedSnapshots()` read + cap compare + delegated persist in one turn (`armTrigger` `:580-621`). Active count from storage `:584-587` (not a heap set). Typed `TRIGGER_CAP_REACHED` `:590`. 20-concurrent -> exactly 8 succeed; D-09 divergence test green (16/16). |
| T-15-09 | Tampering / DoS | mitigate | CLOSED | `percent_change` `trigger-manager.js:290` `if (c.error \|\| b.error \|\| b.value === 0) return { error:'parse_error' }` BEFORE the `:291` division. baseline 0 / NaN -> parse_error, never a divide-by-zero fire. |
| T-15-10 | Spoofing / Integrity | mitigate | CLOSED | `guardAndCompile()` `trigger-manager.js:208` `new RegExp(pattern)` — DEFAULT FLAGS ONLY; caller `/g`/`/y` not honored (no cross-call lastIndex). Compile-once `_regexCache` `:203-204,212`. |
| T-15-11 | Tampering / Integrity | mitigate | CLOSED | SEAM `trigger-lifecycle.js:350` sets `status:'fired'` ONLY when `outcome.outcome === 'fired'`; parse_error/pattern_error merge next_state and stay armed `:363-369`. End-to-end + scripted parse_error-never-fires cases green (87/87). |
| T-15-12 | Tampering / DoS | mitigate | CLOSED | Pure `evaluate()` (no write) + single atomic `writeSnapshot` `trigger-lifecycle.js:358` + `clearAlarm` `:359`; `noop_terminal` dedupe preserved `:298-300`. Duplicate-tick-after-fire -> noop_terminal, no double `_cleared`. |
| T-15-13 | DoS (boot order) | mitigate | CLOSED | `_getManager()` `trigger-lifecycle.js:119-127` returns the manager only when `evaluate` is a function; absent manager OR malformed outcome -> `evaluated_noop` `:323-328,343-345`. Load order in `background.js:47-50` is value-extractor < trigger-store < trigger-manager < trigger-lifecycle (verified), removing the transient window. |
| T-15-14 | EoP / Contract | mitigate | CLOSED | INV-04: `git diff HEAD~6 HEAD -- extension/ai/agent-loop.js` = UNTOUCHED. INV-01: no `extension/mcp/*` or `tool-definitions*` in the phase diff; `node scripts/validate-extension.mjs` exits 0 (manifest valid, 255 JS files parse clean). Phase diff touches only background.js + value-extractor.js + trigger-manager.js + trigger-lifecycle.js (+ tests). |
| T-15-SC | Tampering (supply chain) | mitigate | CLOSED | `git diff HEAD~6 HEAD -- package.json package-lock.json` (dep/lock) = no change. Zero packages installed; regex guard is native `RegExp` + caps (no `safe-regex` lib). |

**Disposition tally:** mitigate ×13 (T-15-01,02,04,05,06,07,08,09,10,11,12,13,14) + T-15-SC mitigate = 14 mitigate verified by grep+independent check; T-15-03 accept = 1; plus 1 documented residual (CR-01 off-thread killable match) carried as accepted risk. All 14 register `mitigate` rows + the 1 `accept` row = CLOSED. (The register has no `transfer`-disposition threats.)

---

## Independent Re-Verification of CR-01 (the prior BLOCKER)

The 15-REVIEW.md BLOCKER claimed the original guard was paren-blind and the length cap did not bound exponential backtracking (a 34-char input hung `.test()` >8s). Re-verified against current code:

- `EVIL_SHAPES` (`trigger-manager.js:115-117`) is now narrowed to ONLY the adjacent-unbounded (polynomial) shape `/[.][*+][.][*+]/`; the exponential class is handled by `hasNestedQuantifier()`.
- `hasNestedQuantifier()` correctly propagates inner-group quantifier/alternation state to the PARENT group (`:149`), so `((a+))+` is caught even though the inner group is not directly quantified.
- Measured (this audit): every exploit in the review (`((a+))+$`, `(a{1,}){1,}`, `(a+)+`, `(a|a)*`) returns `pattern_error` in <0.07ms. The hang is closed.

**Residual risk (accepted, documented, tracked):** static syntactic detection cannot be proven complete for arbitrary caller regex. A hard guarantee would require an off-thread killable match (offscreen + watchdog). This is acknowledged in-code (`trigger-manager.js:102-104`) and tracked for a future phase. Practical exponential class is closed; accepted at ASVS L1 per `block_on: high` (this is not an open high-severity gap).

---

## Accepted Risks Log

| Risk ID | Description | Rationale | Scope |
|---------|-------------|-----------|-------|
| T-15-03 | `_sepCache` (and `_regexCache`) grow unbounded over a long-lived SW. | Keyspace is bounded in practice: locale tags are a small set; regex keys are bounded by distinct trigger configs (cap 8) and pattern length is capped at 1000; both reset on SW eviction. No correctness impact. An LRU is unnecessary at this scale. (Matches review IN-01.) | v1; revisit only if a size cap becomes warranted. |
| CR-01-residual | Static ReDoS detection is provably incomplete; a novel catastrophic shape could in principle bypass `hasNestedQuantifier()`. | The practical exponential class (nested quantifier / alternation-under-quantifier / `{n,}` forms) is rejected at compile time in microseconds; the polynomial class is bounded by the text-length caps. A complete guarantee requires an off-thread killable match (offscreen + watchdog), acknowledged in-code and deferred. | Future phase (off-thread match). Not an open BLOCKER at ASVS L1. |
| IN-02 (review) | `loadCapFromStorage()` is exported but not yet called at SW bootstrap, so after a restart `getCap()` serves the static default 8 until `setCap` runs. | Consistent with stated scope: Phase 15 ships the engine; the re-arm/tool surface (and the bootstrap hydration call) is Phase 19. Not a Phase-15 threat-register item; recorded for traceability. | Phase 19 (tool surface). |

---

## Unregistered Flags

None. No `## Threat Flags` section is present in 15-01/15-02/15-03-SUMMARY.md. The 15-02-SUMMARY `## Threat Surface` section explicitly states no new security-relevant surface was introduced beyond the plan `<threat_model>`. No new attack surface appeared during implementation that lacks a threat mapping.

---

## Test Evidence

All Phase-15 suites pass (re-run during this audit):

- `node tests/value-extractor.test.js` — exit 0 (24/24)
- `node tests/trigger-manager.test.js` — exit 0 (81/81; includes CR-01 evil + legit, WR-01, WR-02 regression)
- `node tests/trigger-cap.test.js` — exit 0 (16/16; includes the D-09 storage-first divergence test)
- `node tests/trigger-lifecycle.test.js` — exit 0 (87/87; Phase-14 A-N + Phase-15 O/P/Q/R SEAM cases)
- `node scripts/validate-extension.mjs` — exit 0 (INV-01)

**Total: 208 assertions green.** Implementation files were not modified by this audit (read-only).

---

*Auditor: gsd-security-auditor — verifies declared mitigations exist in code; does not scan for new threats.*
*Phase: 15-fire-condition-engine-value-extraction*
