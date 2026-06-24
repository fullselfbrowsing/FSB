# Phase 37: Breadth A — Dev / Productivity (least-sensitive) - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — 1 area (breadth contract), all recommended accepted

<domain>
## Phase Boundary

Import descriptors for the least-sensitive dev / PM / cloud / observability OpenTabs apps using
the Phase-36 pipeline, and — in doing so — ESTABLISH the breadth contract every later batch
(38, 39) reuses: all real apps return from `search_capabilities` with rich intent synonyms +
side-effect class + a backing-status signal, and every batch is gated on its origins being
denylist-classified (DENY-03) before merge. This phase OWNS BRDTH-01/02/03.

**In scope:** the dev/PM/cloud/observability category import batch; the backing-status signal +
search annotation; intent-synonym enrichment (incl. the MED-03 collision fix); the merge-time
denylist-coverage gate; eval/crosscheck/cold-start staying green on the grown corpus.

**Out of scope (later phases):** comms/social/content batch → Phase 38; commerce/travel/misc →
Phase 39; depth hand-ports (real T1a/T1b handlers) → Phases 40-41; discovery seeding → 42.
Phase 37 imports descriptors as DATA — it does NOT hand-port handlers (that's depth).
</domain>

<decisions>
## Implementation Decisions

### Breadth Contract (establishes the pattern 38/39 reuse)
- **Batch membership:** the full dev / PM / cloud / observability OpenTabs category — linear,
  jira, confluence, clickup, asana, airtable, vercel, netlify, circleci, cloudflare, datadog,
  sentry, posthog, gitlab, bitbucket, … — the importer ENUMERATES the category from the pinned
  OpenTabs snapshot, EXCLUDING the e2e-test / prescript-test fixtures and the DENY-01 denied
  set. (todoist is already in from the Phase-36 smoke; notion/slack/github are already head
  handlers — descriptors must not duplicate/clobber existing REGISTRY entries.)
- **Backing-status signal:** every descriptor carries an enum `recipe` / `handler` /
  `learn-pending` / `dom`. `search_capabilities` ANNOTATES results by it — a pending-only
  descriptor (learn-pending/dom, no bundled recipe/handler) RETURNS from search but is marked
  discovery-pending, NOT surfaced as a confident invocable hit. Distinguishes day-one-invocable
  from discovery-pending apps.
- **Intent synonyms + MED-03:** ≥3-4 intent synonyms per op, generated from op name / verb /
  description + a curated synonym map. FIX the carried-forward MED-03 synonym-collision/grammar
  weakness at breadth scale: cross-app `create_*` near-neighbors (asana/linear/todoist
  `create_task`) must disambiguate by app/origin, with asana/linear near-neighbor eval fixtures
  proving wrong-invoke=0 on the collision set.
- **Batch-gating (DENY-03):** reuse Phase 35's `classifyGate` + a MERGE-TIME denylist-coverage
  assertion — every origin in the batch must classify denied/sensitive/safe before merge; the
  importer ABORTS (build fails) if any batch origin is unclassified. This establishes the
  "import in category batches least-sensitive → most-sensitive, each gated before merge" rule
  that Phases 38-39 inherit.
- **Scale:** the `verify-catalog-crosscheck.mjs` gate + the SURF-06 eval harness stay green on
  the grown corpus; the descriptor-only → T3/T2 resolve() fallback is verified for this batch;
  the SW cold-start budget is re-asserted at the larger size (still within the SCALE-01 target;
  full-corpus scale is Phase 43).

### Claude's Discretion
- The exact final app list within the dev/PM/cloud/observability category (importer enumerates).
- The curated synonym-map contents + the disambiguation mechanism specifics.
- Whether to shard descriptor JSON by service for the eval/index (full sharding decision is P43).
</decisions>

<code_context>
## Existing Code Insights (Phase-36 pipeline — reuse, do not rebuild)
- `scripts/import-opentabs-catalog.mjs` — the tsx importer (z.toJSONSchema flat emit, classifyGate
  before emit, recursive forbidden-field pre-scan). Phase 37 EXTENDS its category enumeration to
  the dev/productivity batch (todoist was the Phase-36 smoke slice).
- `scripts/lib/side-effect-class.mjs` — the SHARED side-effect derivation (verb-map + GraphQL/RPC
  carve-out + override floor + fail-safe-high), used by both importer and gate. camelCase-aware.
- `scripts/verify-catalog-crosscheck.mjs` — the cross-check gate (chained into validate:extension).
- `scripts/verify-classification-gate.mjs` — `classifyGate()` (the merge-time denylist gate).
- `extension/utils/capability-catalog.js resolve()` — the descriptor-only → T3/T2 fallback.
- `extension/utils/capability-search.js` — `buildIndex` / `catalogVersion`; search annotation by
  backing-status lands here.
- `scripts/package-extension.mjs readJsonDir` (NON-recursive — flat emit, INV-01 IIFE/djb2).
- `tests/capability-search-eval.test.js` — the eval harness to extend with the breadth + collision fixtures.
- `vendor/opentabs-snapshot/` — the pinned metadata source (SHA 4b170216); Phase 37 vendors the
  dev/productivity plugin metadata slices it imports.

## Integration Points
- New descriptors are DATA under `catalog/descriptors/` (flat, opentabs__<svc>__<op>.json); the
  snapshot regenerates via package-extension.mjs; validate:extension must stay green each merge.
- Backing-status flows: descriptor field → catalog → search annotation → resolve() tier.
</code_context>

<specifics>
## Specific Ideas
- The breadth contract is the deliverable, not just the apps: search-returns-with-synonyms +
  side-effect-class + backing-status, batch-gated on denylist. 38/39 must be able to reuse it
  verbatim with a different category.
- Do NOT auto-mint recipes from guessed auth (research anti-pattern) — descriptor-only apps are
  learn-pending/dom, never a fabricated API call. Decouple discoverable from invocable.
- Keep the head capped (HEAD_HANDLER_MODULES CI assertion) — breadth adds DATA, not handlers.
</specifics>

<deferred>
## Deferred Ideas
- Comms/social/content batch → Phase 38; commerce/travel/misc → Phase 39.
- Real hand-ported handlers for the hot subset → Phases 40-41 (depth).
- Discovery seeding for the tail → Phase 42.
- Full-corpus scale/sharding + the milestone full-test gate → Phase 43.
</deferred>
