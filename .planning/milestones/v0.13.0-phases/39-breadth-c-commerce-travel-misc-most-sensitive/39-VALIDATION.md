---
phase: 39
slug: breadth-c-commerce-travel-misc-most-sensitive
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for the most-sensitive commerce/travel/misc batch + the payment
> screening. Reuses the frozen Phase-37/38 machinery + adds the payment guard. Continues BRDTH-01/02/03.

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

> Continues BRDTH-01/02/03; the new axis is the PAYMENT screening (no money movement under Auto).

| Requirement | Correct Behavior | Test Type | Automated Command | Status |
|-------------|------------------|-----------|-------------------|--------|
| BRDTH-01 (cont.) | commerce/travel/misc descriptors imported + returned by search; completes all real apps; DENY-01 excluded | build + search | `node scripts/import-opentabs-catalog.mjs` + `node tests/breadth-search-return.test.js` | ⬜ pending |
| BRDTH-02 (payment screening) | every batch origin classified before merge (classifyGate fail-closed); payment origins sensitive-or-denied; the CI guard FAILS the build if a payment-bearing op is ever safe-and-API-invocable | gate | `node tests/breadth-batch-gate.test.js` + `node scripts/verify-catalog-crosscheck.mjs` (payment-op guard) + a payment-safe-invocable fixture rejected | ⬜ pending |
| BRDTH-03 (cont.) | commerce descriptors backing:'dom' → search invocable=false (DOM-only, not API-invocable); a payment op is never a confident invocable hit | unit + search | `node tests/backing-status-annotation.test.js` + `node tests/dom-only-default.test.js` | ⬜ pending |
| (payment write end-to-end) | a sensitive commerce WRITE (e.g. place_order/checkout) without the per-origin mutating flag → RECIPE_CONSENT_MUTATING_REQUIRED (posture B); proven on a REAL emitted payment descriptor | unit | `node tests/sensitive-write-import-gate.test.js` (extended to a payment op) | ⬜ pending |
| (coverage report) | the head/learn-on-visit/DOM-only/dead breakdown is reportable across the full ~117-app set | report | `node scripts/coverage-report.mjs` (or a test) | ⬜ pending |
| (scale/regression) | crosscheck + eval + no-dead-entry green at the near-full corpus; cold-start flagged if near budget | gate + eval | `node scripts/verify-catalog-crosscheck.mjs` + `node tests/capability-search-eval.test.js` + `node tests/no-dead-entry.test.js` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Payment-op CI guard (no payment op safe-and-API-invocable) + a payment-safe-invocable fixture (build fails)
- [ ] denylist roster extension for the commerce/travel/misc batch (denied/sensitive/safe per the payment axis)
- [ ] Payment-write end-to-end proof (extend sensitive-write-import-gate to a real emitted payment op)
- [ ] Full-corpus coverage report (head/learn/DOM/dead breakdown)

*Reuses the Phase-37/38 node harness + importer + gates.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none expected) | — | Payment screening = denylist + gate + backing + CI guard → automatable | — |

*All phase behaviors have automated verification (no live-browser UAT in Phase 39 — depth live-UAT is 40-41).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
