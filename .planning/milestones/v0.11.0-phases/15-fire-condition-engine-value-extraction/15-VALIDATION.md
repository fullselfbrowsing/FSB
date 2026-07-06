---
phase: 15
slug: fire-condition-engine-value-extraction
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-16
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> This phase is explicitly "unit-testable in isolation" — the pure `evaluate()` + `value-extractor`
> take the element value as a reported INPUT, so every behavior has a deterministic, browser-free test.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `assert` (no framework — same as `tests/agent-cap.test.js`, `tests/trigger-store.test.js`, `tests/trigger-lifecycle.test.js`) |
| **Config file** | none — plain `node tests/<file>.test.js` |
| **Quick run command** | `node tests/value-extractor.test.js` / `node tests/trigger-manager.test.js` (per changed module) |
| **Full suite command** | `npm test` (new test files MUST be appended to the `test` chain in `package.json`) |
| **Estimated runtime** | ~1-3 seconds per file; full suite dominated by `npm --prefix mcp run build` |

---

## Sampling Rate

- **After every task commit:** Run the changed module's `node tests/<file>.test.js`
- **After every plan wave:** Run all Phase-15 test files (`value-extractor`, `trigger-manager`, SEAM glue)
- **Before `/gsd:verify-work`:** `npm test` must be green (new files wired into the chain)
- **Max feedback latency:** ~3 seconds (single-file run)

---

## Per-Task Verification Map

> Task IDs finalized during planning. Anchored to the recommended decomposition:
> P1 `value-extractor.js` → P2 `trigger-manager.js` (+ inline cap) → P3 SEAM wiring + `background.js` glue.

| Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| P1 | 1 | EXTRACT-01 | Locale numeric parse: `$1,234.56` / `1.234,56` DE / `1 234,56` FR-NBSP / parens-neg / `%` → correct Number | unit | `node tests/value-extractor.test.js` | ❌ W0 | ⬜ pending |
| P1 | 1 | EXTRACT-02 | Raw trimmed text returned for `changed`/`contains` (no numeric coercion) | unit | `node tests/value-extractor.test.js` | ❌ W0 | ⬜ pending |
| P1 | 1 | EXTRACT-03 | `extract: text\|number\|attribute` (+ attr name) reads the specified source (e.g. `data-price`, `aria-valuenow`) | unit | `node tests/value-extractor.test.js` | ❌ W0 | ⬜ pending |
| P1 | 1 | EXTRACT-04 | Failed parse → distinct `parse_error`; never `0`, never NaN-fires | unit | `node tests/value-extractor.test.js` | ❌ W0 | ⬜ pending |
| P2 | 2 | TRIG-02 | `changed` fires on any delta from arm-time baseline (raw text) | unit | `node tests/trigger-manager.test.js` | ❌ W0 | ⬜ pending |
| P2 | 2 | TRIG-03 | `threshold` `>=`/`<=`/`>`/`<` numeric, both sides parsed to Number | unit | `node tests/trigger-manager.test.js` | ❌ W0 | ⬜ pending |
| P2 | 2 | TRIG-04 | `equals`/`regex`: compiled once + cached; evil pattern → `pattern_error`; length caps enforced | unit | `node tests/trigger-manager.test.js` | ❌ W0 | ⬜ pending |
| P2 | 2 | TRIG-05 | `contains` case-insensitive substring (default) | unit | `node tests/trigger-manager.test.js` | ❌ W0 | ⬜ pending |
| P2 | 2 | TRIG-06 | `percent_change` fires on +/- N% from baseline | unit | `node tests/trigger-manager.test.js` | ❌ W0 | ⬜ pending |
| P2 | 2 | TRIG-07 | Compound conditions combine with explicit AND/OR on one element | unit | `node tests/trigger-manager.test.js` | ❌ W0 | ⬜ pending |
| P2 | 2 | TRIG-03/06 (edge) | Oscillating value at threshold → exactly ONE fire (edge-trigger + fire-once + hysteresis); single change → exactly one delivered fire | unit | `node tests/trigger-manager.test.js` | ❌ W0 | ⬜ pending |
| P2 | 2 | LIFE-04 | Cap clamps 1-64 (default 8); arming past cap → typed `TRIGGER_CAP_REACHED`; active-count from `listArmedSnapshots()` (survives eviction) | unit | `node tests/trigger-manager.test.js` (mirror `tests/agent-cap.test.js`) | ❌ W0 | ⬜ pending |
| P3 | 3 | TRIG-02..07 / EXTRACT-* (integration) | SEAM: `evaluate()` result drives atomic `fired` write-back; `noop_terminal` dedupe holds across re-read; no fire on `parse_error` | unit (Node-mock storage) | `node tests/trigger-lifecycle.test.js` (extended) | ✅ (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Sampling / Coverage Strategy (Nyquist)

- **Locale-parse matrix (EXTRACT-01):** sample at least one case per separator regime — US (`,` group / `.` decimal), DE (`.`/`,`), FR-NBSP (U+202F group), Indian multi-group (en-IN), parentheses-negative, trailing `%`, and an explicit `decimal_separator` override case. Plus the negative case: garbage → `parse_error`. Adequate = every regime + the override + the failure path each have ≥1 assertion.
- **Condition-kind matrix (TRIG-02..06):** each kind needs a fires-case AND a does-not-fire-case. `threshold` covers all four operators. `regex` covers a normal match, an evil-pattern rejection (`pattern_error`), and an over-length input (text cap).
- **Edge/dedupe (TRIG-03/06, EXTRACT-04):** the oscillation-at-threshold test (N flaps → 1 fire) and the parse_error-never-fires test are the load-bearing Nyquist samples for "exactly one fire" and "never on NaN".
- **Cap (LIFE-04):** mirror `tests/agent-cap.test.js` — N-concurrent-under-cap=8 → 8 arm successes + (N-8) typed `TRIGGER_CAP_REACHED`; clamping 0→1 / 100→64 / NaN→8 / 3.7→3.

---

## Wave 0 Requirements

- [ ] `tests/value-extractor.test.js` — new (locale matrix + extract override + parse_error)
- [ ] `tests/trigger-manager.test.js` — new (6 condition kinds + compound + edge/hysteresis + cap)
- [ ] Extend `tests/trigger-lifecycle.test.js` — SEAM integration (evaluate → atomic fired write-back, dedupe)
- [ ] Wire all new test files into the `test` script chain in `package.json`
- [ ] No framework install — Node built-in `assert` + the existing Node-mock chrome harness (`tests/fixtures/run-task-harness.js installChromeMock`, or inline `createChromeMock()` per `trigger-lifecycle.test.js`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| — | — | — | — |

*All phase behaviors have automated verification. Phase 15 is pure SW-side comparison/extraction logic with the element value injected as a test input — no live-Chrome/DOM step is required (MV3-survival UAT is Phase-14 / milestone-end scope, not Phase 15).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 3s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
