---
phase: 59-current-user-alerts-release-hardening
plan: "04"
subsystem: release-evaluation
tags: [golden-corpus, adversarial, lifecycle, human-uat, release-gate]
completed: 2026-08-27
requirements-completed: [ALERT-01, ALERT-02, ALERT-03, ALERT-04, ALERT-05, VERIFY-01, VERIFY-02, VERIFY-03, VERIFY-04, VERIFY-05]
---

# Phase 59 Plan 04 — Golden Corpus and Adversarial Release Evaluation Summary

**Phase 59 now has one versioned release aggregate with explicit expected contract values, complete requirement/threat coverage, production alert/HUD execution, real local-Chrome lifecycle coverage, and a separate all-human-needed live evidence ledger.**

## Delivered

- Added a pinned 28-case release corpus: 12 gold scenarios, 10 security negatives, and 6 lifecycle/browser scenarios.
- Explicitly records source paths and roles, governing paths, effective and notice dates, exact minus-90 alert dates, delivery methods, notice addresses, consequences, owner-mapping states, alert states, Document 10 disposition, memo disposition, forbidden disclosures, and unsupported coverage.
- Covers active agreement, partial amendment, full replacement, unsigned draft, conflicting facts, unreadable scan, inaccessible source, current Document 10, complex memo present/missing, near notice deadline, and permission-negative abstention.
- Covers prompt injection, malicious filename, fake citation, cross-vendor exfiltration, replacement/deletion/revocation, duplicate alarms/notifications, delayed wake, stale click, repeated lifecycle, row reuse, reorder/SPA navigation, scroll/zoom/resize, owner-label identity attacks, and worker restart.
- Every `ALERT-*`, `VERIFY-*`, and `T59-*` identifier maps to at least one exact case. A canonical SHA-256 pins all expected outputs.
- The aggregate directly executes production deadline, alert schema/engine/store/runtime, HUD schema/projector/composer modules, then executes the production session and real local-Chrome browser contracts.
- Registered `test:skopeo-release-evals` once after graph, truth, HUD, and Ask in the normal suite. Existing aggregate-order tests now pin the dependency order.
- Added a 12-row human/live ledger for Docs, text PDF, blocked download, sharing, revocation, account switching, native notifications, legal/domain review, VoiceOver, 200% zoom, density, and host coexistence. All remain `human_needed`; all approval flags remain false.

## Commits

1. `72fe421b` — controlled RED release corpus and aggregate
2. `82f750c6` — pinned gold/adversarial expected-value matrix
3. `0e8fbbb5` — registered release gate and honest human/live ledger

## Verification

```text
npm run test:skopeo-truth-evals                PASS
npm run test:skopeo-hud-evals                  PASS (34/34)
npm run test:skopeo-ask-evals                  PASS (24/24)
npm run test:skopeo-release-evals              PASS (12 gold, 10 security, 6 lifecycle)
node tests/skopeo-session-lifecycle.test.js     PASS
node tests/skopeo-browser-contract.test.js      PASS (local Google Chrome)
node scripts/verify-skopeo-storage-boundary.mjs PASS (33 files)
git diff --check                               PASS
```

## Evidence Separation

- Deterministic gold: passed as pinned synthetic expected values, not legal approval.
- Structural security: passed through production modules and adversarial cases.
- Lifecycle/browser: passed provisionally in local Chrome, not an authorized live corpus.
- Domain fidelity, authorized Drive/Docs/PDF, native notification, and human accessibility: `human_needed`.
- `live_approved` remains `false`.

## Next

Plan 59-05 can run final real-Chrome/full-regression closure, security and integration audits, phase verification, and v1.2.0 milestone evidence without overstating the live/human boundary.
