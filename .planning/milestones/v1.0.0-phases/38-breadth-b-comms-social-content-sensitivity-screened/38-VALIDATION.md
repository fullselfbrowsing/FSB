---
phase: 38
slug: breadth-b-comms-social-content-sensitivity-screened
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for the sensitivity-screened comms/social/content batch.
> Reuses the frozen Phase-37 machinery + adds the screening proofs. Continues BRDTH-01/02/03.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Standalone Node scripts (`PASS=/FAIL=`, `process.exit(1)`); importer under `tsx` |
| **Quick run command** | `node tests/<name>.test.js` |
| **Full suite command** | `npm test` (CI gate) |
| **Build/import** | `node scripts/import-opentabs-catalog.mjs` → `node scripts/package-extension.mjs` → `npm run validate:extension` |
| **Estimated runtime** | per-suite < ~3s; full `npm test` several minutes |

---

## Sampling Rate

- **After every task commit:** the relevant `node tests/<name>.test.js`
- **After every plan wave:** `npm run validate:extension` (classification gate + crosscheck + recipe-path guard) + the breadth/eval suites
- **Before `/gsd-verify-work`:** `npm test` exits 0
- **Max feedback latency:** ~5 s per suite

---

## Per-Task Verification Map

> Continues BRDTH-01/02/03; the new axis is the per-app sensitivity screening.

| Requirement | Correct Behavior | Test Type | Automated Command | Status |
|-------------|------------------|-----------|-------------------|--------|
| BRDTH-01 (cont.) | comms/social/content descriptors imported + returned by search with synonyms + side-effect class; DENY-01 denied set excluded | build + search | `node scripts/import-opentabs-catalog.mjs` + `node tests/breadth-search-return.test.js` | ⬜ pending |
| BRDTH-02 (screening) | every batch origin classified denied/sensitive/safe before merge; classifyGate ABORTS fail-closed on an unclassified social/messaging origin; ToS-hostile apps carry backing:'dom' (T3, never confident-invocable, never learn-seeded) | gate + unit | `node tests/breadth-batch-gate.test.js` + a screening test (unclassified social origin rejected; a ToS-hostile app → backing dom / invocable false) | ⬜ pending |
| BRDTH-03 (cont.) | backing-status annotation: a DOM-only/sensitive descriptor returns but is NOT a confident invocable hit | unit + search | `node tests/backing-status-annotation.test.js` | ⬜ pending |
| (write-sensitivity) | a sensitive social/messaging WRITE without the per-origin mutating flag → RECIPE_CONSENT_MUTATING_REQUIRED (posture B); a read passes under Auto | unit | `node tests/consent-mutation-gate.test.js` (+ a screened sensitive origin from this batch) | ⬜ pending |
| (scale/regression) | crosscheck + eval + no-dead-entry green on grown corpus; descriptor-only → T3/T2; cold-start within budget | gate + eval | `node scripts/verify-catalog-crosscheck.mjs` + `node tests/capability-search-eval.test.js` + `node tests/no-dead-entry.test.js` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Screening test: an unclassified social/messaging batch origin makes classifyGate abort; a ToS-hostile app emits backing:'dom' (DOM-only, not confident-invocable)
- [ ] denylist roster extension for the comms/social/content batch (denied/sensitive/safe per the ToS-axis)
- [ ] Reuse the frozen breadth/eval/no-dead-entry suites (extended to the new batch)

*Reuses the Phase-37 node harness + importer + gates.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none expected) | — | Screening = denylist classification + gate + backing → automatable | — |

*All phase behaviors have automated verification (no live-browser UAT in Phase 38 — that's depth, 40-41).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
