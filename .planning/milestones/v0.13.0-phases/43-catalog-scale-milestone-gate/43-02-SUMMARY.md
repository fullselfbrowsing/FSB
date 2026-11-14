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
    - noun-class + verb-class synonym enrichment at the metadata source (general for the common create/get intents; HI-02 follow-up generalized the named brittle bsky/linear-bug cases. The eval 190-fixture 0 is a HARD regression pin, NOT proof of fully-general precision -- the breadth corpus-tier is a RECORDED open frontier)
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
  - "190-fixture eval wrong-invoke=0 ACHIEVED -- a HARD regression pin over that set (NOT, by itself, proof of fully-general out-of-eval precision). CORRECTED by 43-REVIEW HI-02: the original 'NOT fixture overfit' claim overclaimed -- the bsky alias + linear file/bug cluster were initially knife-edge to the eval phrasing and failed on trivial paraphrases; the HI-02 follow-up generalized them to real noun/verb classes and dropped the breadth corpus-tier misses 22->20, but the broader adversarial paraphrase frontier is a RECORDED baseline, not closed"
  - "A global 'file' create-alias REGRESSED (tipped create_post/create_task siblings, dropped recall) -> scoped to CREATE_NOUN_VERBS (issue/ticket/bug/report only)"
  - "A general 'groceries' products noun-alias REGRESSED a curated bestbuy probe (displaced the 'product catalog' description phrase) -> scoped to STEM_NOUN_SYNONYMS (instacart only)"
  - "Removing 'open a new' from create REGRESSED 'open a merge request/pull request' (which mean CREATE) -> kept; the get-favoring-noun guard drops 'open a new' ONLY for conversation/thread create ops"
metrics:
  duration: ~21 min
  completed: 2026-06-26
---

# Phase 43 Plan 02: SCALE-01 Precision Re-Tune Summary

THE HEADLINE (DEF-39.5-04-A). Drove the SURF-06 190-fixture eval wrong-invoke from the recorded
**0.079 (15/190 fixtures)** to **0.000** via noun/verb-class metadata-source synonym enrichment in
the importer, re-imported through the frozen machinery, and FLIPPED the eval's wrong-invoke from a
RECORDED baseline to a HARD assertion at the achieved bar (`wrongRate === 0`). recall@5
held/improved to **1.000** (HARD).

> HONEST SCOPE (43-REVIEW HI-02, corrected). The 190-fixture eval wrong-invoke=0 is a HARD
> REGRESSION PIN over that fixture set -- it is NOT, by itself, evidence of fully-general
> out-of-eval precision. Some enrichments are genuinely general (to-do/todo, restaurants,
> "open a conversation"->get, and -- after the HI-02 follow-up -- the bug->issue create-noun
> class and the bluesky app-alias + post-verb class all generalize to unseen paraphrases). But
> the BREADTH corpus-tier wrong-invoke (the broader adversarial cross-app/near-neighbor frontier
> over the full ~2,383-op corpus) is a RECORDED baseline, NOT closed: it remains the honest,
> still-open precision frontier (the 39.5-style boundary), carried forward as future work. The
> HI-02 follow-up IMPROVED it (absolute corpus misses 22->20 over the tagged collision set; the
> now-passing "report a bug in linear" / "publish a post to my bluesky feed" / instacart-groceries
> paraphrases were PROMOTED to the curated HARD tier so a re-weight that re-tips them FAILS CI),
> but the adversarial paraphrase frontier is NOT fully closed -- do NOT read the eval 0 as full
> general precision.

## Achieved Result

| Metric | Before | After | Bar |
|--------|--------|-------|-----|
| Full-corpus wrong-invoke | 0.079 (15/190) | **0.000 (0/190)** | HARD === 0 |
| recall@5 | 0.995 | **1.000** | HARD >= 0.9 |
| Breadth curated wrong-invoke | 0.000 | **0.000** (over 42 HARD; +3 HI-02 promotions) | HARD === 0 (held) |
| Breadth corpus-tier (RECORDED) | 0.537 (22/41) | **20 misses / 38** (HI-02: absolute misses 22->20; rate recomputed after 3 passes promoted to curated) | RECORDED baseline (improved, still the open frontier) |
| Serialized index | 1.371MB | 1.372MB | < 2MB |
| Bytes/descriptor (params-leak signal) | 621 | 621.7 | < 700 (flat) |
| Cold-start (loadJSON + first search) | 11.5ms | 11.8ms | < 100ms |

**The achieved 190-fixture eval wrong-invoke is 0 (literal)** -- every one of the 15 original eval
misses + every IDF-shift regression on that fixture set closed via metadata enrichment. NOTE
(43-REVIEW HI-02): "no documented residual" refers to the 190-FIXTURE eval set only. The broader
breadth corpus-tier still records open ties (the honest adversarial frontier) -- see the HONEST
SCOPE note above; that number is NOT zero and is carried forward as future work, not claimed closed.

## The Data-Map Enrichment (DATA only -- importer CORE byte-untouched)

All eight additions are stem-guarded (push() still requires the app stem/alias token), so NONE
can leak cross-app. The importer CORE (emit pipeline, classifyGate, crosscheck, STEM_OVERRIDES,
inferSideEffect) is byte-untouched; only `synthSynonyms` + the new data-map consts changed.

| Addition | Category | Closes |
|----------|----------|--------|
| `NOUN_SYNONYMS` (task->to-do, issue->ticket/bug, business->restaurant/place) | B/E | todoist to-do, yelp restaurants |
| `STEM_NOUN_SYNONYMS` (instacart products->groceries) | B | instacart groceries (app-scoped, no bestbuy regression) |
| `CREATE_NOUN_VERBS` (file/log/report an issue/ticket/bug; publish/share/write a post/status/thread) | B | "file a new issue in linear" -> create_issue; HI-02: "log/report a bug" generalizes via the bug->issue noun-class woven across noun-aliases; "publish/share/write a post ... bluesky" -> bsky.create_post |
| `CREATE_FAVORING_NOUN_ALIASES` ('bug' suppressed on non-create issue ops) | C | HI-02: archive/update/search_issue stop out-claiming the "report a bug" create paraphrase (the create-side mirror of GET_FAVORING_NOUNS) |
| `GET_NOUN_VERBS` + `GET_FAVORING_NOUNS` ('open a conversation/thread'->get) | C | "open a chatgpt/claude conversation" -> get_conversation |
| `APP_ALIASES` (bsky->bluesky, +10 google/ms/yt aliases) + alias-tagged create-noun-verbs | A | "post to bluesky" -> bsky.create_post; HI-02: alias-tagged "publish a post in bluesky" generalizes the app-alias to unseen post-verb paraphrases |
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

None requiring escalation. The 190-fixture eval **wrong-invoke=0** HARD assertion is `=== 0` with NO
enumerated residual ON THAT SET. The one IDF-shift regression (bestbuy 'catalog') was fixed at the
metadata source per the deviation protocol (fix at the source + re-verify the WHOLE set).

CORRECTION (43-REVIEW HI-02, applied as a follow-up): the original framing of this plan overclaimed
that the eval 0 reflected fully-general precision ("NOT fixture overfitting" as an unqualified
claim). That overclaimed: at the time, the `bsky` app-alias and the linear `file`/`bug` create
cluster were knife-edge balanced to the literal eval phrasing and FAILED on trivial paraphrases
("publish a post to my bluesky feed", "log/report a bug in linear"), and the breadth corpus-tier was
unmoved at 0.537. The HI-02 follow-up GENERALIZED those two named cases to real noun/verb classes
(bug->issue + file/log/report->create; bluesky app-alias + publish/share/write post-verb), dropped
the breadth corpus-tier absolute misses 22->20, and PROMOTED the now-passing held-out paraphrases to
the curated HARD tier. The honest standing claim: the eval 190-fixture 0 is a HARD regression pin and
the common create/get intents generalize, but the broader adversarial cross-app paraphrase frontier
(the breadth corpus-tier baseline) is NOT fully closed -- recorded, carried-forward future work.

## Self-Check: PASSED

- scripts/import-opentabs-catalog.mjs: FOUND (8 data-map consts + synthSynonyms enrichment)
- catalog/descriptors/_fixtures/seed-descriptors.json: FOUND (re-emitted)
- extension/catalog/recipe-index.generated.js: FOUND (re-emitted, INV-01 byte-stable)
- tests/capability-search-eval.test.js: FOUND (HARD === 0 assertion)
- Commits: 8fce2a91 (enrich+re-import), ebc19315 (HARD flip) all present
