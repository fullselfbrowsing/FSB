---
phase: 43-catalog-scale-milestone-gate
plan: 02
subsystem: search-precision-retune
tags: [SCALE-01, precision, DEF-39.5-04-A, importer-synonyms, hard-assertion]
requires:
  - scripts/import-opentabs-catalog.mjs (the synonym data-map + synthSynonyms)
  - catalog/descriptors/_fixtures/seed-descriptors.json (the eval-indexed seed, re-emitted)
  - tests/capability-search-eval.test.js (the wrong-invoke assertion flipped HARD)
provides:
  - full-corpus eval wrong-invoke driven from 0.079 to 0.000 (HARD assertion, no residual)
  - recall@5 = 1.000 (HARD >= 0.9)
  - the closed DEF-39.5-04-A precision frontier (the SCALE-01 headline deliverable)
affects:
  - Plan 43-04 (the milestone gate asserts this HARD bar holds)
tech-stack:
  added: []
  patterns:
    - noun-class + verb-class synonym enrichment at the metadata source (general, not fixture-overfit)
    - app-scoped noun aliases (STEM_NOUN_SYNONYMS) to avoid cross-app noun-alias regressions
    - over-claim guard (token-strip) + colloquial guard (verbAlt-class suppression) for curated-head collisions
key-files:
  created: []
  modified:
    - scripts/import-opentabs-catalog.mjs (8 new data-map consts + 2 helpers + synthSynonyms enrichment)
    - catalog/descriptors/_fixtures/seed-descriptors.json (re-emitted -- NOT hand-edited)
    - extension/catalog/recipe-index.generated.js (re-emitted committed catalog snapshot)
    - tests/capability-search-eval.test.js (wrong-invoke RECORDED -> HARD === 0)
decisions:
  - "Literal wrong-invoke=0 ACHIEVED with robust general enrichment -- NO documented residual needed (the 'open a conversation' create-vs-get ambiguity was resolved by GET_NOUN_VERBS/GET_FAVORING_NOUNS keyed on the conversation/thread noun, NOT a fixture overfit)"
  - "A global 'file' create-alias REGRESSED (tipped create_post/create_task siblings, dropped recall) -> scoped to CREATE_NOUN_VERBS (issue/ticket/bug/report only)"
  - "A general 'groceries' products noun-alias REGRESSED a curated bestbuy probe (displaced the 'product catalog' description phrase) -> scoped to STEM_NOUN_SYNONYMS (instacart only)"
  - "Removing 'open a new' from create REGRESSED 'open a merge request/pull request' (which mean CREATE) -> kept; the get-favoring-noun guard drops 'open a new' ONLY for conversation/thread create ops"
metrics:
  duration: ~21 min
  completed: 2026-06-26
---

# Phase 43 Plan 02: SCALE-01 Precision Re-Tune Summary

THE HEADLINE (DEF-39.5-04-A). Drove the full-corpus search wrong-invoke from the recorded
**0.079 (15/190 fixtures)** to **0.000** via robust, general, noun/verb-class metadata-source
synonym enrichment in the importer (NOT fixture overfitting), re-imported through the frozen
machinery, and FLIPPED the eval's full-corpus wrong-invoke from a RECORDED baseline to a HARD
assertion at the achieved bar (`wrongRate === 0`). recall@5 held/improved to **1.000** (HARD).

## Achieved Result

| Metric | Before | After | Bar |
|--------|--------|-------|-----|
| Full-corpus wrong-invoke | 0.079 (15/190) | **0.000 (0/190)** | HARD === 0 |
| recall@5 | 0.995 | **1.000** | HARD >= 0.9 |
| Breadth curated wrong-invoke | 0.000 | **0.000** | HARD === 0 (held) |
| Breadth corpus-tier (RECORDED) | 0.537 | 0.537 | recorded (unchanged, non-blocking) |
| Serialized index | 1.371MB | 1.372MB | < 2MB |
| Bytes/descriptor (params-leak signal) | 621 | 621.7 | < 700 (flat) |
| Cold-start (loadJSON + first search) | 11.5ms | 11.8ms | < 100ms |

**The achieved full-corpus wrong-invoke is 0 (literal) with NO documented residual** -- every one
of the 15 original misses + every IDF-shift regression closed via GENERAL metadata enrichment.

## The Data-Map Enrichment (DATA only -- importer CORE byte-untouched)

All eight additions are stem-guarded (push() still requires the app stem/alias token), so NONE
can leak cross-app. The importer CORE (emit pipeline, classifyGate, crosscheck, STEM_OVERRIDES,
inferSideEffect) is byte-untouched; only `synthSynonyms` + the new data-map consts changed.

| Addition | Category | Closes |
|----------|----------|--------|
| `NOUN_SYNONYMS` (task->to-do, issue->ticket/bug, business->restaurant/place) | B/E | todoist to-do, yelp restaurants |
| `STEM_NOUN_SYNONYMS` (instacart products->groceries) | B | instacart groceries (app-scoped, no bestbuy regression) |
| `CREATE_NOUN_VERBS` ('file an issue/ticket/bug/report') | B | "file a new issue in linear" -> create_issue |
| `GET_NOUN_VERBS` + `GET_FAVORING_NOUNS` ('open a conversation/thread'->get) | C | "open a chatgpt/claude conversation" -> get_conversation |
| `APP_ALIASES` (bsky->bluesky, +10 google/ms/yt aliases) | A | "post to bluesky" -> bsky.create_post |
| `OVER_CLAIM_GUARD` (outlook 'email', sentry 'status', linear.create_attachment 'issue'/'file', confluence.create_inline_comment 'page') | C/D | email.send / twitter.post-tweet / linear.create_issue / confluence.create_page win |
| `COLLOQUIAL_GUARD` (temporal/gcal/circleci list ops: suppress 'view my'/'show me my') | D | "view my schedule" / "list the meetings on my calendar" -> calendar.list-events |

## The IDF-Shift Regression Watch (the 37-04/39-02/39-04 precedent)

Per the locked decision, the WHOLE eval + the WHOLE breadth collision set were re-verified after
each re-import. **One IDF-shift regression was caught and fixed at the metadata source:**

- **Caught:** the general `products: [...,'groceries','items']` noun-alias DISPLACED bestbuy.search_products'
  discriminating description phrase "search the best buy product **catalog** by keyword" (by satisfying
  the >=3-synonym floor, suppressing the description backfill), so the curated breadth probe "find me a
  product in the bestbuy catalog" tipped from bestbuy.search_products to bestbuy.add_to_cart
  (breadth curated wrong-invoke 0.000 -> 0.026, a HARD-gate FAIL).
- **Fixed at source:** moved the domain-specific 'groceries' alias from the general `products` map to
  `STEM_NOUN_SYNONYMS.instacart` (where it is correct -- bestbuy is electronics, not groceries), so
  bestbuy.search_products re-emits the 'catalog' phrase and the probe re-tops search_products.
  Re-verified: breadth curated wrong-invoke back to **0.000**, corpus-tier baseline unchanged at 0.537.

Two other candidate enrichments were tested and REVERTED because they regressed (documented as
decisions): a global 'file' create-alias (tipped create_post/create_task, dropped recall) and
removing 'open a new' from create (broke "open a merge request/pull request" which mean CREATE).

## Verification (all green over the re-emit)

- `node tests/capability-search-eval.test.js`: recall@5=1.000, wrong-invoke=0.000 HARD, exit 0
- `node tests/breadth-search-return.test.js`: curated HARD wrong-invoke=0.000, exit 0 (no IDF regression)
- `node tests/full-corpus-scale.test.js`: 1.372MB / 11.8ms / 621.7B / 2314 descriptors, exit 0
- `node tests/no-duplicate-stem.test.js` + `no-dead-entry` + `catalog-crosscheck` + `catalog-inline-shape`
  + `payment-op-guard` + `no-orphan-descriptor`: all exit 0
- `npm run validate:extension`: exit 0 (recipe-path-guard / classification-gate / crosscheck /
  no-duplicate-stem / origin-classification / no-orphan all green)
- INV-01: recipe-index.generated.js first line (IIFE) + tail (djb2/dual-export) byte-IDENTICAL to HEAD
  (only the DATA between changed); descriptor shape unchanged (params schema-on-hit)
- importer CORE: `git diff` shows ONLY the synonym data-map additions + synthSynonyms; classifyGate /
  inferSideEffect / extractDescriptors / runImport / feedSeedDescriptors / crosscheck / STEM_OVERRIDES
  / displayServiceStem all byte-untouched; seed RE-EMITTED (not hand-edited)

## Deviations from Plan

None requiring escalation. The locked decision (take the honest achievable bar if literal 0 is not
reachable without overfit) did NOT trigger -- literal **wrong-invoke=0** was achieved with robust
general enrichment, so the HARD assertion is `=== 0` with NO enumerated residual. The one IDF-shift
regression (bestbuy 'catalog') was fixed at the metadata source per the deviation protocol (fix at the
source + re-verify the WHOLE set), not left as a regression.

## Self-Check: PASSED

- scripts/import-opentabs-catalog.mjs: FOUND (8 data-map consts + synthSynonyms enrichment)
- catalog/descriptors/_fixtures/seed-descriptors.json: FOUND (re-emitted)
- extension/catalog/recipe-index.generated.js: FOUND (re-emitted, INV-01 byte-stable)
- tests/capability-search-eval.test.js: FOUND (HARD === 0 assertion)
- Commits: 8fce2a91 (enrich+re-import), ebc19315 (HARD flip) all present
