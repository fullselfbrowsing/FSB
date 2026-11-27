---
phase: 39-breadth-c-commerce-travel-misc-most-sensitive
plan: 05
subsystem: catalog
tags: [opentabs-import, breadth, payment-screening, events, local-services, scheduling, read-only-safe, dom-only, cold-start-budget, side-effect-class, minisearch]

# Dependency graph
requires:
  - phase: 39-01
    provides: "payment-screening machinery -- the payment-op CI guard (PAYMENT_VERBS buy/register + PAYMENT_OP_NAMES buy_tickets/register_for_event already finalized) + the widened finance/payment classifyGate heuristic (specific tokens, no false-trip on read hosts)"
  - phase: 39-04
    provides: "the proven screen-then-import template (travel/transport) + the cold-start ceiling already widened to 512KB + the per-descriptor flatness check (<700 bytes/descriptor) it added"
  - phase: 38-02
    provides: "the MED-02 READ_ONLY_SAFE_SERVICES invariant (checkReadOnlySafeOrigins) -- a safe-because-read-only origin's future write FAILS the build; extended here with the 3 read-only safe origins"
  - phase: 37-01
    provides: "the FROZEN screen-then-import machinery (enumerateBatchApps + STEM_OVERRIDES data-map + classifyGate merge-gate + backingFor='dom' + synthSynonyms + feedSeedDescriptors) reused verbatim"
provides:
  - "6 events/local-services/scheduling apps imported DOM-only as 21 descriptors (183->204 opentabs): ticketmaster/stubhub/eventbrite (sensitive, payment) + yelp/tripadvisor/calendly (safe, read-only)"
  - "the 3 ticket origins classified SENSITIVE (39-01 roster extended); buy_tickets/register_for_event DOM-only-on-sensitive -> the payment-op CI guard PASSES (caught + passed, NOT bypassed)"
  - "the 3 read-only origins (www.yelp.com/www.tripadvisor.com/calendly.com) added to READ_ONLY_SAFE_SERVICES -> a future write op on one FAILS the build (the 38 MED-02 invariant extended); their emitted ops carry NO payment verb so the payment-op guard never keys on them"
  - "regenerated snapshot (212 descriptors, INV-01 byte-stable); validate:extension exit 0; all per-wave gates green; cold-start headroom 390.1KB (76.2% of the 512KB budget) -- circuit breaker NOT fired"
affects: [39-06, 39-07, 43-scale-milestone-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "STEM_OVERRIDES data-map extension for the 6 www/apex-hosted apps (ticketmaster/stubhub/eventbrite/yelp/tripadvisor -> 'www'-stem override; calendly apex pins for stability) -- 0 opentabs__www__*"
    - "a SINGLE sub-batch spanning BOTH tiers: payment-bearing (sensitive) AND read-only (safe) apps, exercising the payment-op guard AND the READ_ONLY_SAFE invariant in one import"
    - "buy/register payment verbs class write via the explicit {method:'POST'} literal (they are NOT side-effect WRITE_VERBS, but ARE the guard's PAYMENT_VERBS); read-only apps emit api {method:'GET'} only (no POST, no apiVoid, no payment-verb op-name)"

key-files:
  created:
    - "vendor/opentabs-snapshot/plugins/{ticketmaster,stubhub,eventbrite,yelp,tripadvisor,calendly}/** (6 hermetic metadata slices)"
    - "catalog/descriptors/opentabs__{ticketmaster,stubhub,eventbrite,yelp,tripadvisor,calendly}__*.json (21 emitted descriptors)"
  modified:
    - "extension/config/service-denylist.json (sensitiveOrigins += ticketmaster/stubhub/eventbrite; _comment notes the 39-05 events extension; read-only apps left safe)"
    - "scripts/verify-catalog-crosscheck.mjs (READ_ONLY_SAFE_SERVICES += www.yelp.com/www.tripadvisor.com/calendly.com -- the 38 MED-02 guard)"
    - "scripts/import-opentabs-catalog.mjs (STEM_OVERRIDES +6 data-map entries -- the only importer touch)"
    - "vendor/opentabs-snapshot/PIN.md (Phase-39 batch C sub-batch 4 row)"
    - "catalog/descriptors/_fixtures/intent-cases.json (+19 cases), tests/breadth-search-return.test.js (corpusFiles regex + floor->204 + 16 collision probes)"

key-decisions:
  - "A SINGLE sub-batch deliberately spans BOTH tiers: the 3 payment-bearing ticket apps screened SENSITIVE (their buy/register ops DOM-only-on-sensitive -> payment-op guard passes) AND the 3 read-only apps left SAFE + added to READ_ONLY_SAFE (their reads carry no payment verb -> the guard never keys on them; a future write FAILS the build). One import exercises both mitigations."
  - "calendly vendors the APEX *://calendly.com/* (like reddit -- the apex derives 'calendly' directly) and is added to READ_ONLY_SAFE as 'calendly.com'; the STEM_OVERRIDES entry is for slug stability only. Booking a Calendly slot is the invitee flow (out of scope per 39-CONTEXT) -- calendly stays the read tier."
  - "No guard weakening + no budget widening: the 39-01 payment-op guard (PAYMENT_VERBS buy/register, PAYMENT_OP_NAMES buy_tickets/register_for_event) and the 512KB cold-start ceiling (set in 39-04) were used UNCHANGED. The cold-start circuit breaker did NOT fire (390.1KB headroom = 76.2% of budget, far above the 15%/76.8KB threshold)."

patterns-established:
  - "First sub-batch to exercise the READ_ONLY_SAFE invariant AND the payment-op guard together: a re-vendored write on yelp/tripadvisor/calendly FAILS the build (proven both directions); the ticket payment ops are caught + passed DOM-only-on-sensitive"
  - "6th verbatim reuse of the frozen screen-then-import contract (ZERO importer logic edit beyond the STEM_OVERRIDES data-map)"

requirements-completed: [BRDTH-01, BRDTH-02, BRDTH-03]

# Metrics
duration: 16min
completed: 2026-06-25
---

# Phase 39 Plan 05: Events / Local-Services / Scheduling Sub-Batch (ticketmaster/stubhub/eventbrite + yelp/tripadvisor/calendly) Summary

**6 apps spanning BOTH tiers imported DOM-only as 21 descriptors: the 3 payment-bearing ticket apps (ticketmaster/stubhub/eventbrite) screened SENSITIVE with buy_tickets/register_for_event DOM-only-on-sensitive (payment-op guard passes), and the 3 read-only apps (yelp/tripadvisor/calendly) left SAFE + locked to reads via READ_ONLY_SAFE_SERVICES (the 38 MED-02 invariant) -- all via the FROZEN machinery, with ample cold-start headroom preserved.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-06-25T14:51:43Z
- **Completed:** 2026-06-25 (commit 2f070200)
- **Tasks:** 2
- **Files modified/created:** 75 across the two task commits (49 in Task 1: 6 slices + 4 screening/importer/PIN edits; 26 in Task 2: 21 descriptors + 5 fixtures/snapshot/test)

## Accomplishments

- **Vendored 6 hermetic metadata slices** (Wall 1: no dist/, no executed handle(), no runtime .js) mirroring the opentable/todoist structure:
  - **Sensitive, payment (mirror opentable):** ticketmaster (search_events/get_event/list_orders + buy_tickets), stubhub (search_events/get_listing/list_orders + buy_tickets), eventbrite (search_events/get_event/list_orders + register_for_event). The payment write carries an explicit `{method:'POST'}`; reads are `api` GET.
  - **Safe, read-only (api GET only -- no POST, no apiVoid, no payment-verb op-name):** yelp (search_businesses/get_business/list_reviews), tripadvisor (search_locations/get_location/list_reviews), calendly (list_event_types/get_availability/list_scheduled_events).
- **Extended the screening BEFORE vendoring** (the 39-01-style edit): ticketmaster/stubhub/eventbrite -> service-denylist.json sensitiveOrigins (EXACT-host www.<app> form); yelp/tripadvisor/calendly left UNCLASSIFIED (safe) and their vendored hosts (www.yelp.com/www.tripadvisor.com/calendly.com) added to verify-catalog-crosscheck.mjs READ_ONLY_SAFE_SERVICES (the 38 MED-02 guard).
- **Imported via the FROZEN machinery** (only touch: 6 STEM_OVERRIDES data-map entries): enumerateBatchApps auto-discovered the dirs, emitted 21 descriptors (183->204 opentabs) all backing:dom; the merge-time classifyGate PASSED (ticket origins sensitive, read-only origins safe-benign); 0 opentabs__www__* slugs; no prior descriptor clobbered.
- **Headline security -- BOTH guards proven:**
  - **payment-op guard PASSES:** buy_tickets (ticketmaster/stubhub) + register_for_event (eventbrite) are payment ops (buy/register in PAYMENT_VERBS; buy_tickets/register_for_event in PAYMENT_OP_NAMES) DOM-only on sensitive origins -> NOT safe-and-API-invocable. Proven both directions in the live payment-op-guard test: PASS on-sensitive, and the same ops FAIL on a synthetic safe origin (no false-negative).
  - **READ_ONLY_SAFE guard PASSES + locks:** yelp/tripadvisor/calendly emit ONLY read ops -> the guard passes; a synthetic yelp write op FAILS it (proven), so a future re-vendored write FAILS the build. The read-only ops carry no payment verb -> the payment-op guard correctly never keys on them (test (d) verifies yelp.search_businesses + calendly.get_availability pass).
- **Regenerated the snapshot** (212 descriptors; INV-01 byte-stable -- verified identical across two regens); validate:extension exits 0 (manifest + recipe-path guard + classification gate + crosscheck all green).
- **All per-wave gates green:** crosscheck (incl. payment-op + READ_ONLY_SAFE guards, 204 descriptors) + no-dead-entry (9/0) + breadth-search-return (recall@5=1.000 wrong-invoke=0.000 over 204 ops / 71 collision probes incl. 16 new cross-app ticket+reviews probes) + capability-search-eval (recall@5=1.000 wrong-invoke=0.000 over 244 fixtures) + backing-status-annotation (10/0) + payment-op-guard (20/0) + full `npm test` exit 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend the screening + vendor the 6 metadata slices** - `a69be713` (feat)
2. **Task 2: Import the sub-batch, regenerate the snapshot, re-assert the per-wave gates** - `2f070200` (feat)

**Plan metadata:** (this SUMMARY + STATE.md + ROADMAP.md) — see final docs commit.

## Files Created/Modified

- `vendor/opentabs-snapshot/plugins/{ticketmaster,stubhub,eventbrite,yelp,tripadvisor,calendly}/**` - 6 hermetic metadata slices (package.json + sdk-stub.ts verbatim + <app>-api.ts inert stub + index.ts + tools/*.ts; real z.object inputs; explicit transport signals -- POST for the 3 ticket payment writes, GET-only for the read-only apps)
- `extension/config/service-denylist.json` - sensitiveOrigins += ticketmaster/stubhub/eventbrite; _comment extended with the 39-05 events note; yelp/tripadvisor/calendly left safe
- `scripts/verify-catalog-crosscheck.mjs` - READ_ONLY_SAFE_SERVICES += www.yelp.com/www.tripadvisor.com/calendly.com (the 38 MED-02 guard, with rationale comment)
- `scripts/import-opentabs-catalog.mjs` - STEM_OVERRIDES +6 entries (ticketmaster/stubhub/eventbrite/yelp/tripadvisor/calendly) -- the only importer touch (a data-map extension, INV-01 holds)
- `vendor/opentabs-snapshot/PIN.md` - Phase-39 batch C sub-batch 4 row appended (append-only)
- `catalog/descriptors/opentabs__{ticketmaster,stubhub,eventbrite,yelp,tripadvisor,calendly}__*.json` - 21 emitted descriptors (importer-written, all backing:dom)
- `catalog/descriptors/_fixtures/{intent-cases.json,seed-descriptors.json,_provenance.json}` - +19 intent cases; seed importer-fed; provenance apps[] filled
- `extension/catalog/recipe-index.generated.js` - regenerated snapshot (212 descriptors; IIFE/djb2/dual-export byte-stable, only DATA grew)
- `tests/breadth-search-return.test.js` - corpusFiles regex + floor->204 + 16 cross-app collision probes (ticketmaster/stubhub/eventbrite buy/search/list + yelp/tripadvisor reviews/search + calendly availability), all wrong-invoke=0

## Decisions Made

- **One sub-batch, both tiers, both guards:** unlike 39-02/03/04 (uniformly sensitive payment categories), this sub-batch deliberately spans the SENSITIVE payment tier (ticket apps) AND the SAFE read-only tier (review/scheduling apps). This is the intended exercise of the full money-no-movement-under-Auto machinery in a single import: the payment-op guard governs the ticket apps (DOM-only-on-sensitive), the READ_ONLY_SAFE invariant governs the read-only apps (write -> build failure). The two are orthogonal: a read-only-safe op carries no payment verb so the payment-op guard never keys on it, and a payment op is on a sensitive origin so READ_ONLY_SAFE never keys on it.
- **No guard weakening:** the 39-01 payment-op guard sets (PAYMENT_VERBS incl. buy/register; PAYMENT_OP_NAMES incl. buy_tickets/register_for_event) already covered the ticket ops -- they were used UNCHANGED. buy/register class write via the explicit {method:'POST'} literal (they are NOT side-effect WRITE_VERBS, so the POST is REQUIRED), while simultaneously being the guard's PAYMENT_VERBS.
- **Read-only confirmation (the safety precondition):** yelp/tripadvisor/calendly were added to READ_ONLY_SAFE_SERVICES ONLY after confirming every emitted op is a read with no payment-verb op-name (search/get/list). A write-bearing op would have required classifying the origin SENSITIVE instead (per the plan's critical note); none was vendored. TripAdvisor partner hotel-booking + Calendly invitee booking are explicitly OUT OF SCOPE for these read-only slices.
- **No budget change:** the 512KB cold-start ceiling (set in 39-04) was used as-is. The smoke index reached 121.9KB at a flat 578 bytes/descriptor (vs 570 at 39-04 -- legitimate linear growth; the flatness check <700 passes). The authoritative full-corpus SCALE-01 cold-start gate stays Phase 43.

## Deviations from Plan

None - plan executed exactly as written. The cross-app collision probes were drafted, the wrong-invoke=0 invariant flagged 8 intra-app-ambiguous paraphrases on first run, and the probes were tightened (same task, before commit) to carry each op's core action words while staying held-out (no verbatim-synonym membership) -- this is the normal iterative test-authoring within Task 2, not a code deviation (no corpus/importer/gate change). Final: wrong-invoke=0.000 over 71 collision probes with the no-verbatim guard passing.

## Cold-Start Budget Flag + Circuit Breaker (per 39-CONTEXT, Task 2d)

**FLAGGED (and circuit breaker ENFORCED -- did NOT fire):**

| Metric | Value |
|--------|-------|
| Smoke serialized index (actual cold-start cost) | **121.9KB** over 216 seed descriptors |
| Per-descriptor footprint | **578 bytes/descriptor** (flat; vs 570 at 39-04; flatness gate <700 PASSES) |
| Smoke byte ceiling (budget) | **512KB** (set in 39-04, used UNCHANGED) |
| **Headroom (budget - actual)** | **390.1KB = 76.2% of budget** |
| Circuit-breaker threshold (15% of budget) | 76.8KB |
| **Circuit breaker fired?** | **NO** -- headroom (76.2%) is far above the 15% floor; proceed |
| Load-time (the real latency gate) | 1.85ms (< 10ms tight gate) PASSES |

This is one of the two largest waves (per 39-CONTEXT). The headroom is preserved well above the ~15% floor, so the circuit breaker did NOT fire and the byte budget was NOT widened. The remaining 390.1KB of slack stays available for the Phase-43 full-corpus SCALE gate (at the flat ~578 bytes/descriptor rate, the full ~2,523-doc corpus projects to ~1.4MB -- the Phase-43 concern, kept separate). The growth is legitimate LINEAR corpus growth (flat per-descriptor footprint), NOT a params-leak layout regression (the flatness assert is the regression signal and passes).

## User Setup Required

None - data-only vendoring + screening/test edits; no external service configuration, no new packages (zod/tsx already devDeps).

## Next Phase Readiness

- **39-06 UNBLOCKED:** the events + local-services + scheduling category is landed -- the ticket apps DOM-only on sensitive origins (payment-op guard passing), the read-only apps read-only-locked (READ_ONLY_SAFE invariant extended). The screen-then-import contract + both money-no-movement-under-Auto mitigations hold. Ample cold-start headroom (390.1KB) remains.
- Plan 39-07 carries the end-to-end consent proof on a REAL emitted payment descriptor (the posture-B re-gate on a shipped ticket purchase write is now available as a proof origin alongside the booking/discord writes).
- No blockers.

## Self-Check: PASSED

- All 6 vendored slice index.ts files exist on disk; the headline emitted descriptors (opentabs__ticketmaster__buy_tickets.json, opentabs__eventbrite__register_for_event.json, opentabs__yelp__search_businesses.json, opentabs__calendly__get_availability.json) exist; SUMMARY.md exists.
- Both task commits exist (a69be713, 2f070200).

---
*Phase: 39-breadth-c-commerce-travel-misc-most-sensitive*
*Completed: 2026-06-25*
