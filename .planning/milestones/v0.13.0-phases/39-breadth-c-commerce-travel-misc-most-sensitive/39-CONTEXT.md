# Phase 39: Breadth C — Commerce / Travel / Misc (most-sensitive) - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — 1 area (payment-screening framework), all recommended accepted

<domain>
## Phase Boundary

Complete descriptor coverage of ALL real OpenTabs apps by importing the commerce / travel /
misc batch — the MOST-sensitive end of the ascending order — screening out or denying
payment-bearing flows so NO descriptor arms a money-moving operation under Auto. Continues
BRDTH-01/02/03 (no new REQ-ID). Reuses the FROZEN Phase-37/38 screen-then-import contract + the
end-to-end-on-a-shipped-descriptor consent-proof pattern; ADDS the payment dimension.

**In scope:** the commerce/travel/misc import batch (completing all real apps); per-app
payment/sensitivity classification (denylist extension); the payment-op CI guard (no payment op
is safe-and-API-invocable); the full-corpus coverage report (head/learn/DOM/dead breakdown
across ~117 apps); gates staying green at the near-full corpus.

**Out of scope (later phases):** depth hand-ports → 40-41; discovery seeding → 42; full-corpus
SCALE perf hardening + the milestone gate → 43. Phase 39 imports DATA descriptors (all DOM-only);
it does NOT hand-port handlers.
</domain>

<decisions>
## Implementation Decisions

### Payment-Screening Framework (the most-sensitive batch)
- **Batch membership:** the commerce/travel/misc OpenTabs category (booking, airbnb, bestbuy,
  costco, craigslist, dominos, chipotle, calendly, doordash, uber, lyft, … — completing all real
  apps) via the frozen importer's enumeration, EXCLUDING the DENY-01 denied set + e2e/prescript
  fixtures. Importer enumerates; the planner classifies each app.
- **Payment-op handling (THE headline — no money movement under Auto):**
  1. ALL breadth descriptors are `backing:'dom'` (DOM-only, T3) by the frozen default — so NO
     payment op is API-invocable via a recipe/handler (breadth never promotes to invocable).
  2. A CI GUARD asserts NO payment-bearing op (checkout/pay/place_order/charge/complete_booking/
     submit_payment) is ever classified `safe`-and-API-invocable — extend the crosscheck/gate so a
     payment op on a `safe` origin (or any future promotion to recipe/handler) FAILS the build.
  3. The most catastrophic money-movement apps → DENIED (excluded, like DENY-01).
- **Origin classification:** commerce/travel origins with payment/checkout flows → SENSITIVE
  (writes posture-B gated; reads run under Auto); pure money-movement apps → DENIED; non-payment
  commerce reads → safe. Extend the Phase-38 MED-01 classification-gate heuristic with
  payment/checkout/charge/cart/order tokens so the backstop independently flags payment origins
  (carried-forward from the 38 review).
- **Coverage report (success criterion 3):** after this batch, emit the discoverable-AND-invocable
  coverage breakdown — head (hand-ported) / learn-on-visit (T2-seeded) / DOM-only (T3) / dead —
  across the full ~117-app real set. A reportable artifact (script/test output).
- **Conservative default (user-accepted):** an unknown commerce/payment app → DOM-only + SENSITIVE
  (fail-safe toward NO money movement); only add an origin to READ_ONLY_SAFE if its emitted ops are
  genuinely read-only (the MED-02 guard from Phase 38 enforces this — extend READ_ONLY_SAFE only
  for verified read-only commerce origins).
- **Scale:** crosscheck + eval + no-dead-entry stay green at the now-near-full corpus; cold-start
  budget re-checked (the full-corpus SCALE-01 gate is Phase 43, but flag if this batch approaches
  the budget).

### Claude's Discretion
- The exact per-app classification (denied / sensitive / safe) + which apps are payment-bearing —
  the planner grounds it in the docs/LEGAL.md axes + per-app commerce model, defaulting unknown
  payment apps to sensitive-or-denied (never safe-writable).
- The coverage-report format (a node script/test that reports the breakdown).
- The payment-op token/detection list for the CI guard.
</decisions>

<code_context>
## Existing Code Insights (reuse the frozen Phase-37/38 machinery)
- `scripts/import-opentabs-catalog.mjs` — enumerateBatchApps + STEM_OVERRIDES + classifyGate
  merge-gate + backing policy ('dom' default) + synonyms + seed-feeding. FROZEN — vendor apps + run
  it. A STEM_OVERRIDES entry is the only likely machinery touch (per-app, like threads/cloudflare).
- `extension/config/service-denylist.json` + `service-denylist.js classify()` — Phase 39 EXTENDS
  the rosters for commerce/travel origins (38 left 14 denied / 27 sensitive after the comms batch).
- `scripts/verify-classification-gate.mjs classifyGate()` + the social/messaging axis (38 MED-01) —
  EXTEND the heuristic with payment/checkout/charge tokens (the 39 backstop).
- `scripts/verify-catalog-crosscheck.mjs` — the crosscheck + the Phase-38 READ_ONLY_SAFE guard
  (MED-02); ADD the payment-op safe-and-invocable guard here.
- `extension/utils/capability-router.js _evaluateConsent` — posture-B sensitive-write re-gate the
  payment-bearing writes flow through (gated).
- `tests/sensitive-write-import-gate.test.js` — the end-to-end consent-proof pattern (extend to a
  payment op).
- `docs/LEGAL.md` — the Categorization Axes (extend with the payment/money-movement axis).
- The frozen breadth/eval/no-dead-entry suites + the coverage-report mechanism (new).

## Integration Points
- New denylist classifications → classifyGate merge-gate → import allowed (screened).
- Payment op → backing:'dom' → resolve() T3 → NOT confident-invocable; the CI guard forbids
  safe-and-invocable; the origin sensitive/denied → posture-B gates the DOM-path write.
- The coverage report reads the full catalog + resolve() tiers → the head/learn/DOM/dead breakdown.
</code_context>

<specifics>
## Specific Ideas
- THE most security-relevant batch: a payment op writable under Auto = money moved without consent.
  Triple mitigation: (1) breadth descriptors are DOM-only (not API-invocable); (2) the CI guard
  forbids any payment op being safe-and-invocable; (3) payment origins are sensitive (posture-B
  gated) or denied. Prove end-to-end on a real emitted payment descriptor (the consent-proof pattern).
- The DENY-01 fully-denied set (brokerage robinhood/fidelity/carta etc.) stays excluded.
- Never auto-mint a recipe from guessed auth — commerce/payment apps are DOM-only, never a
  fabricated money-moving API call.
- Carry-forward from 38 review: revisit the MED-01 token list + the MED-02 READ_ONLY_SAFE allowlist
  for the payment apps — payment WRITE ops must be sensitive-or-denied, never safe-writable.
</specifics>

<deferred>
## Deferred Ideas
- Real hand-ported handlers (T1a/T1b) → Phases 40-41 (depth). Discovery seeding → 42. Full-corpus
  SCALE perf + the milestone gate → 43.
</deferred>
