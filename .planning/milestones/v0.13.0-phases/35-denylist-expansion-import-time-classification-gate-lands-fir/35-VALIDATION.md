---
phase: 35
slug: denylist-expansion-import-time-classification-gate-lands-fir
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: the `## Validation Architecture` section of `35-RESEARCH.md` (each DENY-01..04 control → proof).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Standalone Node scripts (custom `PASS=/FAIL=` harness; `process.exit(1)` on fail) — NOT Jest |
| **Config file** | none |
| **Quick run command** | `node tests/<name>.test.js` (per-suite) |
| **Full suite command** | `npm test` (the milestone CI gate) |
| **Estimated runtime** | per-suite < ~2s; full `npm test` several minutes |

---

## Sampling Rate

- **After every task commit:** Run the relevant `node tests/<name>.test.js`
- **After every plan wave:** Run the affected suites + `node scripts/verify-classification-gate.mjs`
- **Before `/gsd-verify-work`:** `npm test` must exit 0
- **Max feedback latency:** ~5 s per suite

---

## Per-Task Verification Map

> Skeleton — the planner fills exact task IDs into each row's first columns; the Requirement→proof mapping below is locked from RESEARCH.md.

| Requirement | Secure Behavior | Test Type | Automated Command | Status |
|-------------|-----------------|-----------|-------------------|--------|
| DENY-01 | Every categorically-prohibited origin classifies `denied` | unit | `node tests/service-denylist.test.js` | ⬜ pending |
| DENY-02 | Every allowed-but-sensitive origin classifies `sensitive` (not denied) | unit | `node tests/service-denylist.test.js` | ⬜ pending |
| DENY-03 | Unclassified sensitive/ToS origin fails the build (fail-closed) | gate | `node scripts/verify-classification-gate.mjs` (+ fixture proof) | ⬜ pending |
| DENY-04 | WRITE to a sensitive origin without the per-origin mutating flag → `RECIPE_CONSENT_MUTATING_REQUIRED`; reads pass; non-sensitive writes pass | unit | `node tests/consent-mutation-gate.test.js` (+ router suite) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] New test suite for the expanded denied/sensitive roster (or extend `tests/service-denylist.test.js`)
- [ ] Fail-closed gate fixture (`_fixtures/unclassified-sensitive.fixture.json` per RESEARCH.md)
- [ ] Re-gate assertion for posture B (extend `tests/consent-mutation-gate.test.js`)

*Existing infrastructure (node harness) covers the framework; no install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none expected) | — | All Phase-35 controls are pure-data/gate/router → automatable | — |

*All phase behaviors have automated verification (no live-browser UAT in Phase 35).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
