---
phase: 39
slug: breadth-c-commerce-travel-misc-most-sensitive
status: passed
verified: 2026-06-25
note: full ~117-app coverage criterion (SC1/SC3) explicitly CONTINUED in the inserted Phase 39.5 (Full OpenTabs Source Import)
---

# Phase 39 — Verification

**Status:** passed (machinery + representative-import deliverables met and green; full-catalog coverage owned by Phase 39.5)
**Score:** machinery 4/4 deliverables verified; coverage criterion continued in 39.5

## Goal-backward assessment

Phase 39 delivered the **payment-screening machinery + a representative commerce/travel/misc import + the coverage report that honestly surfaced the coverage gap**. All 7 plans executed; all gates green (`npm test` exit 0).

| Success criterion | Status | Evidence |
|-------------------|--------|----------|
| SC1 — commerce/travel/misc imported, returned by search, **completing all real apps** | **PARTIAL → continued in 39.5** | The NAMED commerce/travel/misc batch imported (30 apps this phase; 53 total across 37-39) DOM-only on screened origins. Coverage report (39-07) HONESTLY reports realAppCount=56 vs the ~117 target. The hand-authored slices are a representative subset; the FULL ~117-real-plugin import is the inserted **Phase 39.5** (de-risked GO in FULL-PARITY-SPIKE.md). |
| SC2 — denylist-coverage assertion; payment ops fail-closed (T3 DOM)/denied; **no payment op API-invocable under Auto** | **PASSED** | classifyGate fail-closed merge-gate; the `checkPaymentOpsNotSafeInvocable` CI guard covers all 12 payment op-names (dual-path verb+op-name); proven both directions (fails on safe-invocable, passes DOM-only-on-sensitive). END-TO-END proof on the REAL emitted `opentabs__doordash__place_order` (write w/o flag → RECIPE_CONSENT_MUTATING_REQUIRED; read passes; flag elevates). |
| SC3 — coverage breakdown reportable across the full real set; crosscheck + eval green | **PASSED (report) → full set in 39.5** | `scripts/coverage-report.mjs` emits head/learn/dom/dead (8/0/228/0); crosscheck + no-dead-entry + eval (recall@5=1.000, wrong-invoke=0 / 266 fixtures) green. The "~117-app real set" coverage is completed by 39.5. |

## Coverage gap → Phase 39.5

The milestone's literal "OpenTabs Parity" (~119-app / ~2,523-op) goal is **not** met by the hand-authored representative corpus (~56 apps / ~228 descriptors). The user elected FULL parity; the inserted **Phase 39.5 (Full OpenTabs Source Import)** fetches the real pinned-SHA source and imports all 117 real plugins (~2,374 ops) via the proven pipeline, augmenting (preserving) the 13 hand-authored-only apps. SC1/SC3's full-coverage clause is owned + closed there.

## Security (the headline) — PASSED

No money-moving op runs under Auto: breadth descriptors are DOM-only (not API-invocable), the payment-op CI guard forbids any payment op being safe-and-invocable, and payment origins are sensitive (posture-B gated) or denied. Verified end-to-end on a shipped payment descriptor.

## Human verification

None — descriptor-data + screening + gates are fully automatable (no live-browser UAT in Phase 39).
