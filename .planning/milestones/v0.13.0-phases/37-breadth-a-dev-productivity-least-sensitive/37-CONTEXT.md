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
- **serviceStem/displayService override (added 37-01):** the frozen importer derives the slug
  stem from the urlPatterns host (`service.replace(/^app\./,'').split('.')[0]`), which is WRONG
  or colliding for four later-batch apps: jira AND confluence both host on `*.atlassian.net`
  (collision), `dash.cloudflare.com`→`dash`, `app.datadoghq.com`→`datadoghq`. 37-01 adds a
  one-time `STEM_OVERRIDES = { jira, confluence, cloudflare, datadog }` (keyed by vendored dir
  name) so jira/confluence emit DISTINCT canonical slugs and cloudflare/datadog get their brand
  stems. Every other dev/productivity app derives correctly and needs no override.
- **Backing-status signal:** every descriptor carries an enum whose CANONICAL FIELD value is one
  of `recipe` / `handler` / `learn` / `dom`. `learn` (NOT `learn-pending`) is the value
  `resolve()` (extension/utils/capability-catalog.js:351) routes to the T2 learn-pending seam and
  the value no-dead-entry.test.js keys on — kept as the field value so there is NO runtime
  resolve() change. `search_capabilities` ANNOTATES results by it — a pending-only descriptor
  (backing `learn`/`dom`, no bundled recipe/handler) RETURNS from search but is DISPLAYED as
  `discovery-pending` / `learn-pending` (the display LABEL), NOT surfaced as a confident
  invocable hit. Distinguishes day-one-invocable from discovery-pending apps. (Display label may
  differ from the field value; the field value is always the canonical `learn`/`dom`/`handler`/
  `recipe`.)
- **Intent synonyms + MED-03:** ≥3-4 intent synonyms per op, generated from op name / verb /
  description + a curated synonym map. FIX the carried-forward MED-03 synonym-collision/grammar
  weakness at breadth scale: cross-app `create_*` near-neighbors (asana/linear/todoist
  `create_task`) must disambiguate by app/origin, with asana/linear near-neighbor eval fixtures
  proving wrong-invoke=0 on the collision set (the GENUINE proof is breadth-search-return.test.js
  over the real emitted corpus; the eval intent-cases are a seed-fed secondary signal).
- **Eval seed-feeding (added 37-01):** the eval harness (capability-search-eval.test.js) indexes
  ONLY `_fixtures/seed-descriptors.json` but iterates `_fixtures/intent-cases.json`. 37-01 adds a
  seed-feeding step to the importer that mirrors each emitted descriptor's searchable shape into
  seed-descriptors.json, so every new-app intent case the later plans add HAS an indexed
  descriptor → the recall/wrong-invoke gate stays satisfiable across 02/03/04.
- **No-dead-entry generalization (added 37-01):** the no-dead-entry corpus loader (formerly
  hardcoded to `opentabs__todoist__`) is generalized to all `opentabs__*.json` so each batch's
  NEW descriptor-only slugs are genuinely checked for non-null T3/T2 resolution.
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
  the dev/productivity batch (todoist was the Phase-36 smoke slice), adds the STEM_OVERRIDES, the
  MED-03 synonym rewrite, the per-app backing policy, the merge-time batch gate, and the eval
  seed-feeding — all in 37-01.
- `scripts/lib/side-effect-class.mjs` — the SHARED side-effect derivation (verb-map + GraphQL/RPC
  carve-out + override floor + fail-safe-high), used by both importer and gate. camelCase-aware.
  delete_record/archive_project/merge_pull_request are already in SIDE_EFFECT_OVERRIDES;
  purge/void/cancel/archive are already DESTRUCTIVE_VERBS (no module change for this phase).
- `scripts/verify-catalog-crosscheck.mjs` — the cross-check gate (chained into validate:extension).
- `scripts/verify-classification-gate.mjs` — `classifyGate()` (the merge-time denylist gate).
- `extension/utils/capability-catalog.js resolve()` — the descriptor-only → T3/T2 fallback
  (line ~351: backing==='learn' → T2, else T3 — the canonical 'learn' field value).
- `extension/utils/capability-search.js` — `buildIndex` / `catalogVersion`; search annotation by
  backing-status lands here (37-01 adds backing to storeFields + the invocable/backingStatus hit).
- `scripts/package-extension.mjs readJsonDir` (NON-recursive — flat emit, INV-01 IIFE/djb2).
- `tests/capability-search-eval.test.js` — the eval harness (indexes seed-descriptors.json,
  iterates intent-cases.json); 37-01 wires the importer seed-feeding so the two stay aligned.
- `tests/no-dead-entry.test.js` — the seam-resolution invariant; 37-01 generalizes its loader to
  all opentabs__* and widens the line-74 backing assertion.
- `vendor/opentabs-snapshot/` — the pinned metadata source (SHA 4b170216); Phase 37 vendors the
  dev/productivity plugin metadata slices it imports.

## Integration Points
- New descriptors are DATA under `catalog/descriptors/` (flat, opentabs__<svc>__<op>.json, with
  the canonicalized stem for collision apps); the snapshot regenerates via package-extension.mjs;
  validate:extension must stay green each merge.
- Backing-status flows: descriptor field (canonical 'learn'/'dom'/'handler'/'recipe') → catalog →
  search annotation (display label may be 'discovery-pending'/'learn-pending') → resolve() tier.
</code_context>

<specifics>
## Specific Ideas
- The breadth contract is the deliverable, not just the apps: search-returns-with-synonyms +
  side-effect-class + backing-status, batch-gated on denylist. 38/39 must be able to reuse it
  verbatim with a different category.
- Do NOT auto-mint recipes from guessed auth (research anti-pattern) — descriptor-only apps are
  learn/dom, never a fabricated API call. Decouple discoverable from invocable.
- Keep the head capped (HEAD_HANDLER_MODULES CI assertion) — breadth adds DATA, not handlers.
</specifics>

<deferred>
## Deferred Ideas
- Comms/social/content batch → Phase 38; commerce/travel/misc → Phase 39.
- Real hand-ported handlers for the hot subset → Phases 40-41 (depth).
- Discovery seeding for the tail → Phase 42.
- Full-corpus scale/sharding + the milestone full-test gate → Phase 43.
</deferred>
