# Phase 43: Catalog-Scale + Milestone Gate (SCALE-01/02) — Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Mode:** Orchestrator-gathered (the search/eval/self-heal substrate is shipped; the scale budget is already met; the precision re-tune + the self-heal hardening are the two substantive deliverables). The FINAL v1.0.0 phase — `npm test` EXIT 0 IS the milestone gate.

<domain>
## Phase Boundary

CLOSE the v1.0.0 milestone: prove full-corpus performance, drive full-corpus search PRECISION to the
hard bar (DEF-39.5-04-A), harden recipe-rot self-heal for the now-119-app surface, and gate on the
full test suite — the v0.9.99 Phase-32 milestone-gate posture. OWNS **SCALE-01** + **SCALE-02**.

**In scope:**
1. **SCALE-01 scale gate (mostly done — make authoritative):** `tests/full-corpus-scale.test.js` is the
   authoritative full-corpus CI gate (serialized index < ~2MB, `loadJSON`+first-search < ~100ms,
   < ~700 B/descriptor, > 2000 descriptors). ALREADY on budget (1.40MB / 11ms / 621 B over 2318
   descriptors). Confirm it's wired into `npm test`; tighten/document as the SCALE-01 milestone gate.
2. **SCALE-01 precision re-tune (the headline, DEF-39.5-04-A):** drive the full-corpus eval
   wrong-invoke from the recorded **0.079 (15/190 fixtures)** down toward **0** via intentSynonym
   enrichment + stem-guarding in the importer (`INTENT_VERB_SYNONYMS`/`synthSynonyms`), re-importing
   via the FROZEN machinery; then FLIP the full-corpus wrong-invoke from a RECORDED baseline to a HARD
   assertion at the achieved level (target 0). `recall@5 ≥ 0.9` stays HARD; the curated collision
   proofs stay HARD wrong-invoke=0.
3. **SCALE-02 self-heal hardening (net-new):** per-origin re-learn **coalescing / back-off** (no
   thundering-herd of CDP attaches when one vendor changes site-wide — one coalesced re-learn per
   origin), **recurrence-based systemic-vs-transient** classification (repeated rot on an op → systemic;
   one-off → transient), and **app-level degraded / needs-re-port** surfacing. Additive on the shipped
   `classifyRecipeBroken` + quarantine substrate; consent-gated; fail-safe.
4. **SCALE-02 milestone gate:** the typed fallback reason byte-equal across all **7 providers**
   (INV-03, `provider-parity.test.js`); per-app **MIT provenance/attribution complete**
   (`provenance-scaffold.test.js`); **full `npm test` EXIT 0** — THE MILESTONE GATE; INV-01..04 +
   Walls 1/2 guards all green.

**Out of scope:** new apps/handlers/writes (breadth+depth are closed); the carried-forward live UAT
(guarded-write bodies 41-HUMAN-UAT.md + discovery first-visit 42-HUMAN-UAT.md); Pattern-D cross-origin
execution (41-DEFERRAL.md) — all human_needed/future, NON-blocking. After this phase: the milestone
lifecycle (audit → complete → cleanup).
</domain>

<decisions>
## Implementation Decisions

### SCALE-01 precision re-tune (DEF-39.5-04-A — the headline)
- **The 15 wrong-invoke cases** (full-corpus eval at 0.079): MOST are resolvable via stronger
  intentSynonyms + the mandatory stem-guard — e.g. "file a new issue in linear" → `linear.create_issue`
  (not `create_attachment`); "post to bluesky"/"delete one of my bluesky posts" → `bsky.*` (not
  facebook/mastodon — the stem token must dominate); "write an email message" → `email.send` (not
  `outlook.send_message`); the todoist/confluence same-app `list_*`/`create_*` near-neighbors; the
  instacart/yelp cross-domain `search_*`/`find_*` ties. A few "open a conversation" create-vs-get
  cases are genuine INTENT ambiguities (covered by recall@5).
- **Mechanism (the proven 37-04/39-02 precedent):** enrich the importer's `INTENT_VERB_SYNONYMS`
  (`scripts/import-opentabs-catalog.mjs:539-549`) + the `synthSynonyms` tiers (:559-670) at the
  METADATA SOURCE — add the missing verb alternates / intent phrases / a sharper stem-guard — then
  RE-IMPORT via the frozen machinery so the descriptors re-emit (NO importer-core/logic change beyond
  the synonym data-map; NO seed-descriptors hand-edit). Re-feed the seed. The owned-origin ranking bias
  (`capability-search.js:278-282 boostDocument`, ORIGIN_BOOST=4) is ALREADY shipped but is origin-
  agnostic in the eval — so the eval disambiguation must come from the QUERY's stem/synonym match.
- **The HARD assertion:** measure the achieved full-corpus wrong-invoke after the re-tune; flip the eval
  (`capability-search-eval.test.js:141-142`) from a RECORDED baseline to a HARD assertion at the
  achieved level — TARGET 0. If a small irreducible same-intent residual remains (the right op IS in
  top-5, recall@5 covers it), assert the achievable bar HARD + DOCUMENT the residual honestly (the
  39.5-style honest boundary) — do NOT overfit fixtures. **Watch the IDF-shift regression** (a fix can
  tip another collision as the corpus re-weights — the 37-04/39-02/39-04 precedent; verify the WHOLE
  eval + breadth set, not just the fixed case). The milestone gate (npm test EXIT 0) must hold with the
  asserted bar.
- **No index-shape change** (params stay schema-on-hit / out-of-band; the 621 B/descriptor flatness is
  the params-leak signal — KEEP TIGHT). INV-01 catalog IIFE/djb2 unchanged (only the DATA re-emits).

### SCALE-02 self-heal hardening (net-new, additive)
- **Per-origin re-learn coalescing / back-off:** a per-origin scheduler/debounce so N rot-detections on
  the same origin coalesce into ONE re-learn attempt (no thundering-herd of CDP attaches); exponential
  back-off on repeated failure. Keyed by origin; bounded; consent-gated (the re-learn still passes
  `_runGate`). A unit test simulates N rot events on one origin → asserts ONE coalesced re-learn + the
  back-off schedule.
- **Recurrence-based systemic-vs-transient:** track rot recurrence per (origin, slug) — a one-off
  4xx/5xx is TRANSIENT (retry); repeated rot across calls is SYSTEMIC (the site changed → quarantine +
  surface). Reuse the `capability-rot-detector.js classifyRecipeBroken` verdict; add the recurrence
  counter (bounded, in the learned-store envelope or a sibling ring).
- **App-level degraded / needs-re-port surfacing:** expose (via the catalog/search result or a status
  accessor) when an origin's learned-recipe set is stale/quarantined (degraded) so a user/agent sees
  "this app needs re-learning" instead of silent failure. Additive to the search hit / a status query.
- **Additive + fail-safe:** NO change to the consent gate, `executeBoundSpec`, tier dispatch, or the
  `classifyRecipeBroken` taxonomy. The scheduler is a new module/section; the recurrence + surfacing
  are additive fields. Wall 2 (origin-pin) + the per-origin cap/LRU/quarantine unchanged.

### SCALE-02 milestone gate
- **INV-03:** the typed fallback reason byte-equal across all 7 providers (xai/openai/anthropic/gemini/
  openrouter/lmstudio/custom) — `tests/provider-parity.test.js` (`distinct.length===1`). VERIFY green
  (it has been green through Phases 40-42's npm-test-EXIT-0); the new typed reasons (if any) flow
  through the central `_err` so byte-equality holds by construction.
- **MIT provenance:** per-app attribution complete (`_provenance.json`, 127 apps all MIT + SHA-pinned;
  `vendor/opentabs-snapshot/PIN.md`; README Acknowledgements) — VERIFY via `provenance-scaffold.test.js`
  (it's complete per the map; confirm no gap + Wall-1 no-runtime-js).
- **THE MILESTONE GATE:** full `npm test` EXIT 0; `npm run validate:extension` EXIT 0; INV-01..04 +
  Walls 1/2 all green; the SCALE-01 scale + precision asserts HARD-green; the SCALE-02 self-heal tests
  green.

### Claude's Discretion
- The exact synonym enrichment (verb families/alternates/stem-guard sharpening) to resolve the 15 cases.
- The achieved wrong-invoke HARD bar (target 0; document any irreducible residual).
- The self-heal scheduler design (debounce window, back-off curve, recurrence threshold, where the
  recurrence counter + degraded state live) — keep additive + bounded + consent-gated.
</decisions>

<code_context>
## Existing Code Insights
- **Search + ranking:** `extension/utils/capability-search.js` — `buildIndex` (:140), `INDEX_OPTIONS`
  (:48-54), `search()` (:266; boost {intentSynonyms:3,description:1}, prefix/fuzzy 0.2, `boostDocument`
  owned-origin bias :278-282, ORIGIN_BOOST :57). NO index-shape change.
- **Synonym source:** `scripts/import-opentabs-catalog.mjs` — `INTENT_VERB_SYNONYMS` (:539-549, 9 verb
  families), `synthSynonyms` (:559-670, 4 tiers, mandatory stem-guard :565, article agreement :593).
  Re-import path: enrich → `node scripts/import-opentabs-catalog.mjs` → re-feed seed (the 37-04/39-02
  metadata-source precedent; NO core/logic edit, NO seed hand-edit).
- **Eval:** `tests/capability-search-eval.test.js` (recall@5 HARD ≥0.9 :118; wrong-invoke RECORDED
  :141-142 — FLIP to HARD here). `tests/breadth-search-return.test.js` (curated HARD wrong-invoke=0
  :687; corpus RECORDED :615-649). `tests/full-corpus-scale.test.js` (the SCALE-01 budget gate:
  <2MB/<100ms/<700B/>2000).
- **Self-heal substrate:** `extension/utils/capability-rot-detector.js` (`classifyRecipeBroken` HEAL-01/
  04, stateless per-call), `extension/utils/learned-recipe-store.js` (PER_ORIGIN_CAP=24 :62, LRU
  :348-423, quarantine), `extension/utils/network-capture.js` (consent-gated capture, `_runGate`),
  `extension/utils/capability-router.js` (the post-execute classify hook). The per-origin scheduler +
  recurrence + surfacing are NET-NEW (additive).
- **INV-03 + provenance:** `tests/provider-parity.test.js` (7 providers :39, byte-equal :200);
  `extension/ai/universal-provider.js` (PROVIDER_CONFIGS :7-52); `tests/provenance-scaffold.test.js`;
  `catalog/descriptors/_fixtures/_provenance.json` (127 apps, MIT); `vendor/opentabs-snapshot/PIN.md`.

## Integration Points
- enrich synonyms → re-import → re-emit descriptors → eval wrong-invoke↓ → HARD assert; the self-heal
  scheduler hooks the post-execute classify verdict → coalesced consent-gated re-learn → degraded
  surfacing; the milestone gate = full npm test EXIT 0 over the whole catalog + all guards.
</code_context>

<specifics>
## Specific Ideas
- THE headline is the precision re-tune: drive full-corpus wrong-invoke 0.079→0 via robust METADATA
  enrichment (NOT fixture overfitting), watching the IDF-shift regression, and flip the recorded
  baseline to a HARD assertion — the honest close of DEF-39.5-04-A.
- THE net-new is the self-heal: per-origin coalescing/back-off prevents a 119-app thundering-herd;
  recurrence distinguishes a one-off blip from a site-wide change; degraded surfacing makes a stale app
  visible instead of silently failing.
- THE close is the gate: full npm test EXIT 0 over breadth + depth + discovery + scale, INV-01..04 +
  Walls 1/2 green, MIT provenance complete — the v1.0.0 milestone is met.
</specifics>

<deferred>
## Deferred Ideas
- Carried-forward human_needed live UAT (guarded-write bodies, discovery first-visit captures) +
  Pattern-D cross-origin execution → post-milestone / v2 (recorded, NON-blocking, fail-closed).
- Any irreducible same-intent search ambiguity (the right op in top-5) → documented residual + a future
  disambiguation affordance.
</deferred>
