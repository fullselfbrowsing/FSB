---
phase: 37
slug: breadth-a-dev-productivity-least-sensitive
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-24
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for the breadth-A batch + the breadth contract. Reuses the
> Phase-36 pipeline; BRDTH-01/02/03 → proofs below.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Standalone Node scripts (`PASS=/FAIL=`, `process.exit(1)`); importer under `tsx` |
| **Config file** | none |
| **Quick run command** | `node tests/<name>.test.js` |
| **Full suite command** | `npm test` (CI gate) |
| **Build/import** | `node scripts/import-opentabs-catalog.mjs` → `node scripts/package-extension.mjs` → `npm run validate:extension` |
| **Estimated runtime** | per-suite < ~3s; full `npm test` several minutes |

---

## Sampling Rate

- **After every task commit:** the relevant `node tests/<name>.test.js`
- **After every plan wave:** `npm run validate:extension` (classification gate + crosscheck + recipe-path guard) + the eval harness
- **Before `/gsd-verify-work`:** `npm test` exits 0
- **Max feedback latency:** ~5 s per suite

---

## Per-Task Verification Map

> BRDTH→proof locked from CONTEXT; planner fills task IDs.

| Requirement | Correct Behavior | Test Type | Automated Command | Status |
|-------------|------------------|-----------|-------------------|--------|
| BRDTH-01 | dev/productivity descriptors imported + returned by `search_capabilities` with ≥3-4 intent synonyms + side-effect class per op; excludes e2e/prescript fixtures + DENY-01 denied set; no clobber of existing head/recipe entries | build + search | `node scripts/import-opentabs-catalog.mjs` + `node tests/breadth-search-return.test.js` | ⬜ pending |
| BRDTH-02 | category-batch merge carries a denylist-coverage assertion (classifyGate) — build ABORTS if any batch origin is unclassified; establishes the per-batch gate 38/39 inherit | gate | `node tests/breadth-batch-gate.test.js` (+ a deliberately-unclassified batch-origin fixture rejected) | ⬜ pending |
| BRDTH-03 | each descriptor carries a backing-status enum (recipe/handler/learn-pending/dom); `search_capabilities` annotates — a pending-only descriptor returns but is NOT a confident invocable hit | unit + search | `node tests/backing-status-annotation.test.js` | ⬜ pending |
| (scale/regression) | crosscheck gate + eval harness green on the grown corpus; descriptor-only → T3/T2 verified for the batch; MED-03 collision wrong-invoke=0 on asana/linear/todoist `create_*`; cold-start within budget | gate + eval | `node scripts/verify-catalog-crosscheck.mjs` + `node tests/capability-search-eval.test.js` (collision fixtures) + `node tests/no-dead-entry.test.js` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Breadth search-return test (synonyms + side-effect class per imported op)
- [ ] Batch-gate test + an unclassified-batch-origin fixture (proves merge aborts)
- [ ] Backing-status annotation test (pending-only ≠ confident invocable)
- [ ] MED-03 collision eval fixtures (asana/linear/todoist `create_*` near-neighbors → wrong-invoke=0)

*Reuses the Phase-36 node harness + importer + gates; no new framework.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none expected) | — | Breadth = descriptor data + search + gates → automatable | — |

*All phase behaviors have automated verification (no live-browser UAT in Phase 37 — that's depth, Phases 40-41).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
