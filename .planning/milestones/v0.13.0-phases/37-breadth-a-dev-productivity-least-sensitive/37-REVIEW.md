---
phase: 37-breadth-a-dev-productivity-least-sensitive
reviewed: 2026-06-25T00:00:00Z
depth: deep
files_reviewed: 8
files_reviewed_list:
  - scripts/import-opentabs-catalog.mjs
  - extension/utils/capability-search.js
  - scripts/lib/side-effect-class.mjs
  - scripts/verify-classification-gate.mjs
  - tests/breadth-search-return.test.js
  - tests/breadth-batch-gate.test.js
  - tests/backing-status-annotation.test.js
  - catalog/descriptors/_fixtures/batch-unclassified-origin.fixture.json
findings:
  blocker: 0
  high: 0
  medium: 2
  low: 3
  total: 5
status: resolved
resolution:
  resolved_at: 2026-06-25
  fixed: 5
  skipped: 0
  commits:
    - f3a0e20a  # LOW-01 fold storeFields/fields into _computeCatalogVersion
    - 87f5fd9c  # LOW-02 a/an article agreement + LOW-03 meaningful synonym backfill
    - b5185822  # MED-01 paraphrase collision probes + MED-02 held-out recall
  verification: >-
    breadth-search-return 32/0 (recall@5=1.000 held-out, wrong-invoke=0.000),
    backing-status-annotation 10/0, breadth-batch-gate 7/0,
    capability-search-eval 15/0, no-dead-entry 9/0, catalog-crosscheck 18/0,
    verify-recipe-path-guard PASS, validate:extension OK -- all exit 0.
    Corpus + snapshot regenerated via import-opentabs-catalog.mjs +
    package-extension.mjs; INV-01 (IIFE/djb2 shape) holds.
---

# Phase 37: Code Review Report (Breadth A -- Dev/Productivity MACHINERY)

**Reviewed:** 2026-06-25
**Depth:** deep (cross-file: importer -> shared derivation -> search annotation -> gate, plus corpus + vendored-slice spot-check)
**Files Reviewed:** 8 machinery/test files + spot-checked vendored slices (jira, confluence, airtable) and the emitted corpus (70 descriptors)
**Status:** RESOLVED (2026-06-25) -- all 5 findings fixed; no BLOCKER/HIGH were present. The 2 MEDIUM test-rigor + 3 LOW robustness items are addressed; full suite green; corpus + snapshot regenerated; INV-01 preserved. See per-finding **RESOLVED** notes below and the frontmatter `resolution` block.

## Summary

The Phase-37 machinery is correct and well-defended. The six scrutiny areas all hold up under adversarial probing:

1. **STEM_OVERRIDES cannot spoof provenance.** The override is keyed by the vendored DIR NAME (an immutable build input) and changes ONLY the slug stem/filename. The descriptor's `service`, `provenance.source`, and `provenance.sourcePath` preserve the real vendored host (jira and confluence both correctly carry `service: "atlassian.net"`; cloudflare keeps `dash.cloudflare.com`, datadog `app.datadoghq.com`). jira != confluence is guaranteed (distinct `jira.*` / `confluence.*` slug families verified on disk and under the shared-origin search boost). An app cannot adopt another's stem, and the override cannot falsify the origin the gate classifies on.

2. **The merge-time classifyGate batch gate genuinely fails closed.** `runImport()` builds the full `gateItemsList` from each op's real `service`, runs `classifyGate` BEFORE any `writeFileSync`, and `throw`s (aborting the build, exit 1) naming the offender -- it does NOT merely warn. Adversarially verified: an unclassified host with "payment"/"invoice" in slug/description aborts; a brand-only sensitive host aborts; benign dev apps pass with zero false-fails. No write occurs on a gate failure (extraction is pure; writes are strictly after the gate).

3. **Backing annotation is reliable.** A dom-backed (pending-only) descriptor is `invocable:false` / `backingStatus:'discovery-pending'` and a learn-backed one `invocable:false` / `'learn-pending'`; only recipe/handler are `invocable:true`. No opentabs descriptor slug collides with any bundled recipe id (0 collisions over 70 slugs), so a dom descriptor cannot be force-promoted to invocable via the `_slugToRecipe` short-circuit. no-dead-entry confirms dom -> T3 (DOM fallback, no fabricated recipe).

4. **Wall 1 holds.** The spot-checked vendored slices (jira/confluence/airtable) ship ONLY TypeScript metadata + inert transport stubs that `throw` if executed; no `dist/`, no `node_modules/`, no built JS anywhere under `vendor/opentabs-snapshot/plugins`. The recursive forbidden-field pre-scan (`script/expr/transform/code/fn/js`) catches a forbidden name at top level, nested object, array items, anyOf branch, and recursive `$defs` (probed directly). recipe-path-guard is green (20 recipe-path files clean).

5. **MED-03 wrong-invoke=0 is proven over the REAL emitted corpus** (70 descriptors, not seed fixtures): the genuine cross-app near-neighbor cluster (linear/jira/gitlab `create_issue`, datadog/posthog `list_dashboards`) is present and disambiguates by app token, wrong-invoke=0 over 20 probes. See MED-01/MED-02 below for the proof's soft spots (it remains a real proof for the load-bearing cases).

6. **No Phase-35/36 gate was weakened.** `scripts/lib/side-effect-class.mjs` is BYTE-IDENTICAL to its Phase-36 state (0 diff lines vs commit 3cf40e50). The `capability-search.js` change is purely additive (the `backing`/`backingStatus`/`invocable` annotation + the `backing` storeField); the IIFE shell, the djb2 `_computeCatalogVersion`, and the ORIGIN_BOOST/boostDocument logic are unchanged (INV-01 preserved). The side-effect cross-check gate re-derives every class over the persisted signals and passes (no under-stated destructive op; 42 read / 25 write / 3 destructive, all correct).

No blocker- or high-severity defects were found. The findings below are test-rigor and robustness concerns.

## Medium

### MED-01: 13 of 20 collision-set queries are verbatim copies of an indexed synonym, weakening the "genuine proof, not a tautology" claim

**File:** `tests/breadth-search-return.test.js:93-136`
**Issue:** The COLLISION_SET is described (lines 12-16) as the load-bearing proof that exercises real disambiguation. But 13 of the 20 queries are byte-identical (case-insensitively) to one of the target descriptor's own `intentSynonyms` -- e.g. `"create a task in asana"`, `"create a record in airtable"`, `"create a page in confluence"`, `"list dashboards in datadog"`, `"query metrics in datadog"`, `"resolve an issue in sentry"`, `"trigger a new deploy in netlify"`. For those, the test mostly confirms that an EXACT-MATCH query retrieves its own document over near-neighbors -- a substantially weaker statement than disambiguating a paraphrase, and one MiniSearch passes almost by construction (the full synonym including the app token is indexed verbatim). The genuinely paraphrase-tested cases (the `create_issue` cluster `linear`/`jira`/`gitlab` using "an issue" vs the indexed "a issue"; the merge/pull request pair; circleci; cloudflare) ARE the real proof and DO hold -- but the headline "20 collision probes, wrong-invoke=0" overstates the rigor because the majority are exact-match retrievals of distinct same-op nouns.
**Fix:** Make the verbatim queries genuine paraphrases so the proof exercises retrieval rather than exact match, e.g.:
```js
{ query: 'add a new task to my asana list', expected: 'asana.create_task' },
{ query: 'insert a row into airtable', expected: 'airtable.create_record' },
{ query: 'show me the dashboards on datadog', expected: 'datadog.list_dashboards' },
```
At minimum, add an assertion that NO collision query is a verbatim member of its target's `intentSynonyms`, so the proof cannot silently degrade into an exact-match check as synonyms evolve.

**RESOLVED (2026-06-25, commit b5185822):** All 20 collision queries are now HELD-OUT PARAPHRASES that are NOT verbatim members of any indexed synonym (e.g. `"log a bug in linear"`, `"create a new ticket in jira"`, `"insert a row into airtable"`, `"file a new issue on gitlab"`, `"kick off a new deployment on vercel"`). Added a guard assertion that 0 collision queries are verbatim synonyms (the `SYNS_BY_SLUG` membership check), so the proof cannot silently degrade to exact-match. The load-bearing `create_issue` cluster (linear/jira/gitlab) is retained. Verified against the regenerated corpus: wrong-invoke=0.000 (20/20 top1-correct), 0 verbatim. The jira/confluence STEM_OVERRIDES distinctness proof was likewise switched to held-out paraphrases.

### MED-02: the recall@5 metric is near-tautological -- it queries each op by its OWN first synonym, so recall=1.000 proves indexability, not retrieval quality

**File:** `tests/breadth-search-return.test.js:152-182, 215`
**Issue:** The per-op recall loop sets `probe = d.intentSynonyms[0]` and asserts the op's own slug returns in the top 5, then asserts `recall@5 >= 0.9`. Because `feedSeedDescriptors`/the descriptor itself indexes that exact synonym (which always contains the app stem AND the literal op noun), the op is essentially guaranteed to return for its own first synonym -- recall=1.000 is structural, not a measurement of how well real user phrasings retrieve the op. This is presented as a breadth-recall gate but cannot fail short of a MiniSearch indexing bug. Combined with MED-01, the test's two headline metrics (recall@5 and wrong-invoke) are both softened: the load-bearing signal narrows to the ~7 genuinely-paraphrased collision probes.
**Fix:** Drive recall from held-out paraphrases (or the op's 2nd/3rd synonym, or summary-derived phrasings that are NOT the indexed first synonym) so a recall miss is observable, e.g. probe with `d.intentSynonyms[d.intentSynonyms.length - 1]` or a separate `intent-cases`-style fixture of user phrasings distinct from the indexed synonyms. Keep the verbatim-first-synonym check only as a cheap "every op is indexed" smoke assertion, separately labeled.

**RESOLVED (2026-06-25, commit b5185822) -- took the stronger option (genuine retrieval, not relabel):** recall@5 is now measured over HELD-OUT description-derived paraphrases (`heldOutParaphrase()`: the description's first clause, app-tagged with the service stem) -- a phrasing indexed only weakly in the `description` field (boost 1), NEVER in the boosted `intentSynonyms` (boost 3), so a recall miss is observable. A guard asserts no held-out probe is a verbatim synonym (with an account-scoped fallback tail for the ~3 ops whose description clause coincides with a synonym -> 0 verbatim). recall@5 >= 0.9 is asserted over the paraphrased set and measures **1.000** over all 70 ops. The verbatim-first-synonym check is RETAINED but explicitly RELABELED as a separate `STRUCTURAL:` index-integrity smoke ("every op is INDEXED"), no longer implying a retrieval measurement. The METRICS line and header docstring were updated to say "held-out paraphrases".

## Low

### LOW-01: `storeFields` is not part of `_computeCatalogVersion`, so a same-slug snapshot serialized before `backing` was added restores with `backing === undefined`

**File:** `extension/utils/capability-search.js:48-54, 197-206, 223-233`
**Issue:** Phase 37 added `'backing'` to `INDEX_OPTIONS.storeFields`, but `_computeCatalogVersion` hashes only descriptor slugs + recipe count + declared version -- NOT the storeFields shape. `MiniSearch.loadJSON` does NOT validate `storeFields` (verified: loading an old snapshot under the new options succeeds without throwing), so a snapshot whose slug set matches the current catalog but that was serialized WITHOUT `backing` restores cleanly and its hits carry `h.backing === undefined`. In `search()`, `normalizeBacking(undefined) -> 'dom' -> invocable:false`. A handler/recipe-backed head slug (not in `_slugToRecipe`, e.g. a `backing:'handler'` head descriptor) would then be mis-annotated `invocable:false` / `discovery-pending` until a base-catalog change bumps the version. This does NOT materialize across the Phase-37 boundary (adding 70 descriptors changes the count prefix `2:` -> `4:`, invalidating any stale snapshot -> rebuild), so it is latent, not a live Phase-37 defect -- but it is a correctness landmine for any future storeFields-only edit.
**Fix:** Fold the index shape into the version stamp so a storeFields change invalidates old snapshots:
```js
var seed = parts.join('|') + '#' + (recipes ? recipes.length : 0) + '#' + (declaredVersion || '')
         + '#' + INDEX_OPTIONS.storeFields.join(',') + '#' + INDEX_OPTIONS.fields.join(',');
```

**RESOLVED (2026-06-25, commit f3a0e20a):** Applied the suggested fix verbatim -- `_computeCatalogVersion` now folds `INDEX_OPTIONS.storeFields` AND `INDEX_OPTIONS.fields` into the djb2 seed, so any storeFields-/fields-only edit shifts the version and a stale snapshot (serialized before `backing` was added) is rejected and rebuilt. Confirmed a storeFields-only change (adding `backing`) now produces a different version hash. **INV-01 verified:** the diff is ONLY the seed string (plus a comment); the djb2 loop and the dual-export IIFE wrapper are byte-stable. `validate:extension` green.

### LOW-02: synthesized synonyms emit ungrammatical "create a issue" / "add a issue" (article disagreement before a vowel-initial noun)

**File:** `scripts/import-opentabs-catalog.mjs:404-417` (the `<alt> a <singular>` branch); visible in every emitted vowel-initial-noun descriptor, e.g. `catalog/descriptors/opentabs__jira__create_issue.json:5-6` ("create a issue in jira", "add a issue in jira")
**Issue:** The article form hard-codes "a" regardless of whether the singular noun begins with a vowel sound, producing "create a issue", "add a issue", "create a invoice", etc. This is purely a recall/quality wart (the index still matches "create AN issue" via prefix/fuzzy, which is why the collision test passes), but the shipped synonyms are grammatically wrong and are the user-facing phrasings surfaced in search. The MED-03 rewrite (lines 322-343) explicitly set out to eliminate grammatically-broken phrases ("list a tasks"); the a/an case slipped through.
**Fix:** Choose the article by leading vowel:
```js
const article = (w) => /^[aeiou]/i.test(String(w || '').trim()) ? 'an' : 'a';
// ...
push(`${alt} ${article(singular)} ${singular} in ${stem}`);
```

**RESOLVED (2026-06-25, commit 87f5fd9c):** Applied the suggested `article()` helper in `synthSynonyms`' bare-verb branch. After re-import, every vowel-initial-noun phrase agrees: `"create a issue"` -> `"create an issue"`, `"get a insight"` -> `"get an insight"`, across gitlab/jira/linear/posthog/sentry (15 descriptors regenerated). The determiner-ending alternates ("make a new", "fetch a single", "view one specific") correctly stay article-free. Descriptors + seed + snapshot regenerated via `import-opentabs-catalog.mjs` + `package-extension.mjs` (no hand-edits); 0 ungrammatical `"<verb> a <vowel-noun>"` phrases remain in the corpus or snapshot.

### LOW-03: the `out.length < 3` synonym backfill can emit a low-quality stem-only filler phrase for a no-noun, unmapped-verb op

**File:** `scripts/import-opentabs-catalog.mjs:426-432`
**Issue:** When an op has no noun and a verb not in `INTENT_VERB_SYNONYMS` (so only one or two real phrases were synthesized), the `while (out.length < 3)` loop pushes `"${verb} ${stem} ${i}"`-style fillers (e.g. "trigger circleci 1") purely to satisfy the >=3 floor. These carry the stem (so they pass the guard and the >=3 contract) but are intent-sparse noise that dilutes the index. No CURRENT emitted op hits this path (all 70 reach >=3 via real phrases), so it is latent -- but it means the >=3 guarantee can be met with non-intent filler for a future op shape, quietly degrading the breadth contract's spirit (rich intent synonyms) while still passing every test.
**Fix:** Prefer pulling additional real alternates (description-derived phrasings, the summary, or remaining `INTENT_VERB_SYNONYMS` entries) before the numeric filler, and assert in `breadth-search-return.test.js` that no synonym is a bare `verb + stem + digit` filler (e.g. reject `/\b\d+$/` trailing tokens).

**RESOLVED (2026-06-25, commit 87f5fd9c) -- applied (it was cheap):** The backfill now pulls REAL alternates IN PRIORITY ORDER before any numeric filler -- (a) a description-first-clause phrase, then (b) an app-framed intent phrase (`"<verb> ... in the <stem> app"`, `"use <stem> to <verb> ..."`) -- and the numeric filler is now a digit-free, defensive-only last resort (reachable only for an op with no description AND no verb, a shape no emitted op has). NOTE: the finding said "no CURRENT op hits this path", but re-import revealed the `search_*`/`query_*` ops (verb not in `INTENT_VERB_SYNONYMS`) DID carry sparse `"<verb> <noun> <stem>"` thirds (`"search pages confluence"`, `"query metrics datadog"`); these are now replaced by description-derived intent phrasings (`"search for confluence pages using a cql ... query string in confluence"`). Regenerated via the importer + packager; suite green. (The reviewer's optional `/\b\d+$/`-filler assertion was not added as a standalone check; the MED-01/MED-02 held-out-paraphrase guards already exercise genuine retrieval over the regenerated synonyms, and no shipped synonym now carries a trailing digit.)

## Spot-check confirmations (no defect)

- **Vendored slices metadata-only:** `vendor/opentabs-snapshot/plugins/{jira,confluence,airtable}` contain only `package.json` + `src/**/*.ts` (index, sdk-stub, *-api stub, tools). `sdk-stub.ts` is an identity `defineTool` + abstract base; `*-api.ts` helpers `throw` if executed. No `*.js`/`*.mjs`/`*.cjs`, no `dist`/`build`/`node_modules` under any plugin dir. handle() bodies are present in source but never executed by the importer's `await import()` (metadata-only read).
- **Emitted descriptors well-formed:** sampled `opentabs__jira__create_issue.json`, `opentabs__confluence__create_page.json`, `opentabs__airtable__create_record.json` -- correct `sideEffectClass` (write, via api/POST + verb), `backing:'dom'`, closed `params` (`additionalProperties:false`), >=3 (6) synonyms each carrying the stem, honest `provenance.signals`. All 70 emitted descriptors carry >=3 synonyms and every synonym carries its stem token (MED-03 invariant verified over the whole corpus).
- **Gates green on disk:** recipe-path-guard PASS; verify-classification-gate PASS (78 corpus + 23 roster origins); verify-catalog-crosscheck PASS (70 descriptors, no under-stated class); the three BRDTH proof tests PASS (30/7/10); import-extraction, import-forbidden-prescan, import-classify-gate-call, catalog-crosscheck, catalog-inline-shape, no-dead-entry, classification-gate, service-denylist, capability-router, head-handler-cap all PASS.
- **side-effect-class.mjs unchanged:** byte-identical to Phase-36 commit 3cf40e50 (NOT weakened).

---

_Reviewed: 2026-06-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
