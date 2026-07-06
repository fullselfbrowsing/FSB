---
phase: 43-catalog-scale-milestone-gate
reviewed: 2026-06-26T00:00:00Z
depth: deep
files_reviewed: 7
files_reviewed_list:
  - scripts/import-opentabs-catalog.mjs
  - extension/utils/relearn-scheduler.js
  - extension/utils/learned-recipe-store.js
  - extension/background.js
  - tests/capability-search-eval.test.js
  - tests/relearn-coalescing.test.js
  - tests/lattice-provider-bridge-smoke.test.js
findings:
  critical: 0
  high: 2
  medium: 2
  low: 2
  total: 6
status: resolved
resolved_at: 2026-06-26
resolution: all 6 findings fixed; full `npm test` EXIT 0 (the milestone gate green)
resolution_commits:
  HI-01: 4a5723f9
  HI-02-1: 608ad30a
  HI-02-2: 1ef07374
  MED-01: 1407c4c6
  MED-02: 608ad30a
  LO-01: c1f45897
  LO-02: e0bcf4fe
---

# Phase 43: Code Review Report (Catalog-Scale + Milestone Gate, SCALE-01/02 — the v1.0.0 close)

**Reviewed:** 2026-06-26
**Depth:** deep (cross-file: importer data-map -> emitted corpus -> eval; scheduler/store -> router wire-up; full gate run)
**Files Reviewed:** 7 source/test files (+ the re-emitted catalog/descriptor data)
**Status:** issues_found

## Summary

The milestone gate is **mechanically green**: `npm test` EXIT 0, `npm run validate:extension` EXIT 0,
INV-01 catalog IIFE/djb2 byte-stable, the 621.7 B/descriptor flatness held (< 700), provider-parity
`distinct === ["RECIPE_DOM_FALLBACK_PENDING"]` (length 1), provenance 127 apps MIT + SHA-pinned, the
byte-freeze counter 187->188 is the legitimate +1 `relearn-scheduler.js` importScripts, and the importer
CORE (classifyGate / inferSideEffect / extractDescriptors emit / crosscheck / STEM_OVERRIDES / seed-feed)
is byte-untouched (only the data-map block + `synthSynonyms` + the one-line call site changed). The
consent gate (`_runGate`), `executeBoundSpec`, tier dispatch, `classifyRecipeBroken` taxonomy, and the
per-origin cap/LRU/quarantine are all unchanged. Wall-1 holds (the scheduler is correctly OFF the
recipe-path allowlist by construction; `verify-recipe-path-guard` PASS).

**But two HIGH findings undercut the substance of the close**, and I am obligated to surface them on a
milestone phase where `wrong-invoke === 0` and "self-heal hardening" are the headline deliverables:

1. **The SCALE-02 self-heal subsystem is built but NOT WIRED into the runtime.** The scheduler,
   `recordRot`, and `getOriginHealth` are referenced ONLY by their own modules and their own tests —
   nothing on the live rot path (`capability-router.js _quarantineAndRelearn`) routes through them. The
   thundering-herd the scheduler exists to prevent STILL fires; recurrence never accumulates in
   production; degraded state is still a silent miss. The deliverable's stated value is not realized.

2. **`wrong-invoke === 0` is PARTIALLY OVERFIT to the exact 190 eval phrasings.** Some enrichments are
   genuinely general (to-do/todo, restaurants, "open a conversation"->get all generalize to unseen
   paraphrases). But others (the `bluesky` app-alias; the linear `file/bug` create cluster) are
   knife-edge balanced to the literal eval query and FAIL on trivial paraphrases — and the BREADTH
   corpus-tier wrong-invoke is still **0.537** (unchanged), confirming the enrichment did not move the
   broader precision frontier. The HARD `=== 0` assertion honestly reports the 190-fixture number, but
   that number is **not evidence of general precision** the way the summary frames it.

**Overfitting verdict: MIXED — general in part, overfit in part. The literal 0 is real but brittle.**
**Self-heal verdict: ADDITIVE and correct-in-isolation, but DEAD (unwired) at runtime.**
**Milestone-gate integrity: the gate is honestly green; INV/Wall/parity/provenance all real. No gaming
of the assertions themselves. The concern is that two green sub-gates measure less than they appear to.**

---

## Gate Results (all run read-only)

| Gate | Result |
|------|--------|
| `node tests/capability-search-eval.test.js` | PASS — recall@5=1.000, wrong-invoke=0.000 (HARD `=== 0`), 16 passed |
| `node tests/breadth-search-return.test.js` | PASS — curated HARD wrong-invoke=0; **corpus-tier 0.537 RECORDED (unchanged)**, 52 passed |
| `node tests/full-corpus-scale.test.js` | PASS — 1.372MB / 11.6ms / 621.7 B/desc / 2314 descriptors, 8 passed |
| `node tests/relearn-coalescing.test.js` | PASS — 16 passed (but see MED-01: the N->1 assertion is vacuous) |
| `node tests/rot-recurrence-classify.test.js` | PASS — 19 passed (non-vacuous: sabotage reds it) |
| `node tests/app-degraded-surfacing.test.js` | PASS — 14 passed (non-vacuous: sabotage reds it) |
| `node tests/provider-parity.test.js` | PASS — distinct length 1, 31 passed |
| `node tests/provenance-scaffold.test.js` | PASS — 127 apps MIT + SHA-pinned, 20 passed |
| `node scripts/verify-recipe-path-guard.mjs` | PASS — scheduler correctly OFF the allowlist (Wall-1) |
| `npm run validate:extension` | PASS — EXIT 0 |
| `npm test` (THE MILESTONE GATE) | **PASS — EXIT 0** |

---

## High

### HI-01: SCALE-02 self-heal (scheduler + recurrence + degraded) is built but never wired into the live rot path — the deliverable's stated outcomes are not realized at runtime

> **RESOLVED (commit 4a5723f9).** Wired the scheduler into the live rot path: `capability-router.js _quarantineAndRelearn` now routes the consent-gated re-learn THROUGH `FsbRelearnScheduler.scheduleRelearn` (per-origin coalescing + exponential back-off) instead of a direct fire-and-forget, and calls `FsbLearnedRecipeStore.recordRot(origin, slug)` on every broken verdict so the recurrence counter accumulates in production (systemic-vs-transient + the `getOriginHealth` degraded surfacing are no longer inert). ADDITIVE: consent gate / `executeBoundSpec` / tier dispatch / `classifyRecipeBroken` / cap-LRU-quarantine all unchanged; the scheduler only INVOKES the supplied consent-gated `runDiscovery`; degrades to the legacy fire-and-forget when the scheduler module is absent. `relearn-scheduler.js` stays off the recipe-path allowlist (Wall-1; `verify-recipe-path-guard` PASS). New `tests/relearn-router-wiring.test.js` proves the LIVE broken-verdict path coalesces N→1 (sabotage to direct fire-and-forget reds it: N runDiscovery calls), records recurrence to systemic, and surfaces degraded — registered in `npm test`. The HEAL-03 router assertion was updated to flush the coalescing window. The 3 existing self-heal tests stay green.

**File:** `extension/utils/relearn-scheduler.js` (whole module); `extension/utils/learned-recipe-store.js:478-633` (recordRot/dispositionFor/getOriginHealth); `extension/utils/capability-router.js:194-216` (the UNCHANGED rot path)

**Issue:** The entire SCALE-02 subsystem is additive in the most literal sense — it adds modules and
passing tests, but **none of it is connected to the code path it is supposed to harden.** Cross-file
grep confirms:

- `scheduleRelearn` / `FsbRelearnScheduler` is referenced ONLY by `relearn-scheduler.js` and
  `tests/relearn-coalescing.test.js`. The live rot path `capability-router.js _quarantineAndRelearn`
  (called at :600 and :677 on every broken verdict) STILL calls `discovery.runDiscovery(origin, {tabId})`
  fire-and-forget **directly** (line 211-213) — it does NOT route through the scheduler. So at 119-app
  scale, one vendor changing site-wide rots N recipes on one origin and fires **N concurrent CDP
  attaches** — the exact thundering-herd the scheduler was written to prevent. `capability-router.js`
  is byte-unchanged this phase.
- `recordRot` / `recordOk` / `dispositionFor` are referenced ONLY by `learned-recipe-store.js` and the
  recurrence test. Nothing calls `recordRot` on a broken verdict, so the recurrence counter **never
  increments in production** — systemic-vs-transient classification is inert.
- `getOriginHealth` is referenced ONLY by the store and the degraded test. No search hit, status
  accessor, or UI surface reads it, so "this app needs re-learning" is **never surfaced** — degraded
  state remains a silent miss, the precise failure the deliverable promised to eliminate.

The 43-03 SUMMARY documents this as a deliberate scope cut ("No router-side adoption ... the router-side
route-through is a confirmed-by-milestone-gate follow-up, not in this plan's scope. Nothing router-side
was wired"). That is honest disclosure, but it means the SCALE-02 CONTEXT promises — "one coalesced
re-learn per origin (no thundering-herd)" and "degraded surfacing makes a stale app visible instead of
silently failing" — are **NOT delivered by this milestone**. The gate is green only because the tests
exercise the isolated modules, not the integration. For the FINAL v1.0.0 phase this is a material gap
between the claimed close and the shipped behavior, not a cosmetic nit — hence HIGH, not MEDIUM.

**Fix:** Either (a) wire it before declaring SCALE-02 met — route `_quarantineAndRelearn`'s re-learn
through `FsbRelearnScheduler.scheduleRelearn(origin, boundRunDiscovery, opts)`, call
`store.recordRot(origin, slug)` on the broken verdict (and `recordOk` on success), and have a search
hit / status accessor read `getOriginHealth`; add ONE integration test that proves the router actually
debounces (N broken verdicts on one origin -> 1 `runDiscovery`); or (b) if the wiring is genuinely
deferred, do not characterize SCALE-02 as "complete / met" in the milestone sign-off — record it
explicitly as "modules landed + unit-proven; runtime adoption is carried-forward debt" alongside the
two existing carried-forward UAT items, so the milestone's self-heal claim matches reality.

---

### HI-02: `wrong-invoke === 0` is partially overfit — several fixes are knife-edge tuned to the literal eval phrasing and do not generalize; the breadth corpus-tier (0.537) is unmoved

> **RESOLVED (commits 608ad30a substance + 1ef07374 honesty).** Part 1 (generalize): importer DATA-MAP only, RE-IMPORTED via the frozen machinery (`node --import tsx scripts/import-opentabs-catalog.mjs`; CORE byte-untouched, no seed hand-edit). The two named brittle cases are now real noun/verb CLASSES: (a) bug→issue noun-class + file/log/report→create verb-class — `CREATE_NOUN_VERBS` gains log/report and is emitted across the op-noun AND its colloquial noun-aliases, with a new `CREATE_FAVORING_NOUN_ALIASES` guard (the create-side mirror of `GET_FAVORING_NOUNS`) suppressing 'bug' on non-create issue ops so they stop out-claiming the create paraphrase at the metadata source; (b) bluesky app-alias + post-verb class — `CREATE_NOUN_VERBS` gains publish/share/write on the post/status/thread microblog nouns, emitted stem- AND alias-tagged. RE-VERIFIED over the WHOLE eval + breadth set (IDF-shift watch): eval wrong-invoke stays **0 (HARD)**, recall@5=1.000, curated breadth HARD=0, and the breadth corpus-tier absolute misses **IMPROVED 22→20** (no new collisions; a dual-alias-verb attempt that tipped a calendar collision was caught + reverted). Part 2 (honesty): corrected the overclaim in `43-02-SUMMARY.md`, the STATE.md decision line, and the eval test comment + assertion message — the 190-fixture eval=0 is a HARD REGRESSION PIN (the common create/get intents generalize), but the breadth corpus-tier is a RECORDED baseline of the broader adversarial frontier (future work), NOT claimed closed.

**File:** `scripts/import-opentabs-catalog.mjs:560-748` (the data-map: `APP_ALIASES`, `CREATE_NOUN_VERBS`, `NOUN_SYNONYMS`, the `OVER_CLAIM_GUARD` cluster); `tests/capability-search-eval.test.js:144` (the HARD assertion + its "NOT fixture overfit" claim)

**Issue:** I built the index and probed each enriched op with the eval fixture AND with unseen
paraphrases of the same intent/noun/app. The enrichment splits cleanly into general vs. overfit:

GENERAL (these read as a real noun/verb class and generalize to unseen queries — legitimate):
- `NOUN_SYNONYMS.task: ['to-do',...]` — "add a todo to todoist", "create a to-do in todoist" both -> `todoist.create_task` (unseen). Good.
- `NOUN_SYNONYMS.business(es): ['restaurant(s)','place(s)']` — "look for restaurants on yelp", "search restaurants on yelp" both -> `yelp.search_businesses` (unseen). Good.
- `GET_NOUN_VERBS.conversation/thread: ['open']` + the symmetric `dropOpenNew` guard — "view a chatgpt conversation", "open my chatgpt conversation" both -> `chatgpt.get_conversation` (unseen). This is a genuine create-vs-get-by-noun rule. Good.

OVERFIT (these win ONLY the exact eval string and collapse on trivial paraphrases):
- `APP_ALIASES.bsky: 'bluesky'` closes the eval's `"post to bluesky"` -> `bsky.create_post`, but
  `"publish a post to my bluesky feed"` (a breadth-corpus query), `"share something on bluesky"`, and
  `"write a bluesky post"` ALL mis-route to `twitter.post-tweet` / `bsky.send_message`. The alias only
  tips the one canonical phrasing; it does not robustly bind the app.
- The linear `file`/`bug` create cluster (`CREATE_NOUN_VERBS.issue/bug` + `OVER_CLAIM_GUARD['linear.create_attachment']`)
  closes the eval's `"file a new issue in linear"` -> `linear.create_issue`, but `"log a bug in linear"`
  (a breadth-corpus query), `"report a bug in linear"`, and even `"file a bug in linear"` ALL mis-route
  to `linear.archive_issue` — despite `bug` being explicitly in `CREATE_NOUN_VERBS`. The fix is balanced
  to the literal "file a new issue" token order, not to the bug/issue create class.

Corroborating signal: the BREADTH corpus-tier wrong-invoke is **still 0.537** (RECORDED, unchanged from
before the re-tune) and includes the exact bluesky/linear paraphrases above as live misses. So the
enrichment moved the 190-fixture eval to 0 **without moving the broader precision frontier**. That is the
fingerprint of tuning-to-the-eval, not general precision improvement. The eval's inline comment and the
43-02 SUMMARY assert "NOT fixture overfitting" as an unqualified claim — that overclaims. The HARD
`=== 0` assertion is fine as a *regression pin on the 190 fixtures*, but it should not be read (or
documented) as evidence that real out-of-eval queries no longer collide; several still do.

**Fix:** Two acceptable resolutions. (1) Honesty fix (cheapest, milestone-appropriate): keep the HARD
`=== 0` pin but correct the claim — in the eval comment and the SUMMARY, state that 0 is achieved over
the 190-fixture set and that the broader corpus-tier (0.537) is the honest, still-open precision frontier
(the 39.5-style boundary), so the number is not misrepresented as general. (2) Substance fix: broaden the
brittle entries to a real class (bind the app alias on the verb-family the way the stem is bound, not just
the canonical phrase; key the linear create fix on the issue/bug noun-class so "log/report/file a bug"
all reach `create_issue`) and re-verify the corpus-tier actually drops — only then is the "general, not
overfit" claim earned.

---

## Medium

### MED-01: The coalescing "N rot events -> ONE re-learn" test assertion is vacuous — it passes even with the coalescing guard removed

> **RESOLVED (commit 1407c4c6).** Made section (A) NON-VACUOUS: it now CAPTURES every callback `scheduleRelearn` arms via `setTimer` and asserts EXACTLY ONE coalescing-window timer is armed for 5 rot events on one origin (the 2nd..5th coalesce), then invokes all captured callbacks and asserts the fn still ran once. Sabotaging the coalescing guard (`if (rec.pending) return`) now reds the test (5 timers armed instead of 1 — verified), mirroring the non-vacuous discipline of the back-off/recurrence/degraded tests. `relearn-coalescing` now 17 passed.

**File:** `tests/relearn-coalescing.test.js:135-144`

**Issue:** Section (A) feeds 5 `scheduleRelearn` calls for one origin, then asserts `aCalls === 1`. But
the test injects a **no-op `setTimer` (`() => 0`)** and drives a single `flush(originA)`. With a no-op
timer, the scheduler never fires `_runOrigin` on its own; the one `flush()` runs `_runOrigin` exactly
once regardless of whether the 5 schedule calls coalesced. I verified this by sabotage: commenting out
the entire `if (rec.pending) { ... return; }` coalescing guard in `relearn-scheduler.js` (confirmed
`changed: true`) leaves the test at **16 passed, 0 failed** — `aCalls` is still 1. The assertion proves
"flush runs the fn once" and (via the distinct-origin sub-check) "origins are keyed separately," but it
does NOT prove the headline property "N concurrent timer fires collapse to 1." (The back-off section (B)
and the recurrence/degraded tests ARE non-vacuous — sabotaging `_backoffFor` and the systemic threshold
both red their tests — so this is isolated to the coalescing-count claim.)

Combined with HI-01 (the scheduler is unwired), the actual coalescing behavior is doubly unproven:
not exercised end-to-end AND its unit assertion does not test the timer-fire path it claims to.

**Fix:** Drive the timer path deterministically: capture the callback passed to `setTimer`
(`let fired=[]; const setTimer=(cb)=>{fired.push(cb); return fired.length;}`), invoke ALL captured
callbacks after the 5 schedule calls, and assert the fn STILL ran once. With the coalescing guard
removed, that version would fire N callbacks and `aCalls` would exceed 1 — a true regression pin.

### MED-02: The brittle eval fixes are guarded only by the 190-fixture pin — a future IDF re-weight can silently re-tip them with no broader safety net

> **RESOLVED (commit 608ad30a).** Promoted a small curated subset of the now-passing held-out paraphrases into the breadth HARD curated tier (curated count 39→42): `"report a bug in linear"` → `linear.create_issue`, `"publish a post to my bluesky feed"` → `bsky.create_post`, and `"go to checkout for my instacart groceries"` → `instacart.navigate_to_checkout`. Each is a HELD-OUT paraphrase (NOT a verbatim synonym — the MED-01 verbatim guard passes at 0), so a future IDF re-weight that re-tips any of them now FAILS CI instead of silently regressing the RECORDED corpus number. (The linear probe uses "report a bug" rather than the verbatim-indexed "log a bug" specifically to keep it a genuine-retrieval pin.)

**File:** `scripts/import-opentabs-catalog.mjs:643-712` (`OVER_CLAIM_GUARD`); `tests/breadth-search-return.test.js` (corpus-tier is RECORDED, not HARD)

**Issue:** The `OVER_CLAIM_GUARD` works by string-matching and DROPPING a competitor op's synthesized
phrase when it contains a cross-domain token (e.g. drop `outlook.send_message`'s `'email'` phrase so the
curated `email.send` head wins). This is a fragile, ranking-balance-dependent lever: it tips a specific
collision by *suppressing* a competitor rather than *strengthening* the target. The only HARD guard on
these is the 190-fixture `=== 0` pin plus the curated breadth subset. The corpus-tier breadth set (the
broadest collision proof, 41 ties) stays RECORDED at 0.537 — so a future enrichment that re-weights IDF
can re-tip any of these guarded collisions and the corpus-tier number would simply move, non-blocking,
unnoticed. The 43-02 SUMMARY itself documents that this exact class of regression (the bestbuy 'catalog'
displacement) already occurred once during this phase and had to be caught by hand. There is no automated
HARD tripwire over the broad set to catch the next one.

**Fix:** Promote a small, curated subset of the now-passing eval paraphrases (the bluesky/linear/instacart
cross-app cases specifically) into the breadth HARD curated tier so a future re-weight that re-tips them
FAILS CI, rather than silently regressing the RECORDED corpus number. This converts the brittle fixes
into pinned invariants instead of unguarded balances.

---

## Low

### LO-01: Dead/unreachable branch in `getOriginHealth` — `if (allQuarantined || !anyLive)` is always true at that point

> **RESOLVED (commit c1f45897).** Replaced lines 626-631 with the unconditional `return { degraded: true, status: 'needs-re-port', origin: origin };` (reached only when no live-healthy recipe exists) and dropped the dead `if`/trailing `return healthy` AND the now-unused `allQuarantined` tracker. Observable behavior identical (app-degraded-surfacing + learned-recipe-store + the live-path wiring test all stay green).

**File:** `extension/utils/learned-recipe-store.js:626-631`

**Issue:** The function returns `healthy` immediately when `anyLive` is true (line 624). Execution only
reaches line 627 (`if (allQuarantined || !anyLive)`) when `anyLive` is already false — so `!anyLive` is
always true, the condition is unconditionally true, and both the `allQuarantined` sub-check and the
trailing `return healthy;` (line 630) are dead/unreachable. The observable behavior is correct (an
all-quarantined or all-systemic origin returns `degraded:true`), so this is not a bug — just a redundant
guard that misleads a reader into thinking there is a fall-through case that cannot occur.

**Fix:** Replace lines 626-631 with the unconditional `return { degraded: true, status: 'needs-re-port', origin: origin };`
(reached only when no live-healthy recipe exists), and drop the dead `if`/trailing `return healthy`.

### LO-02: `isOverClaim` comment claims whole-word matching for `'status'` but the word-boundary regex is correct only by accident of the guarded tokens chosen

> **RESOLVED (commit e0bcf4fe).** Exported `isOverClaim` + `OVER_CLAIM_GUARD` (additive, no CORE logic change) and added whole-word unit assertions to `tests/import-extraction.test.js`: the guarded `'status'` token drops `"tweet a status update"` (true) but NOT `"view all issue statuses"` (false — substring, not whole-word). Sabotaging the `\b<tok>\b` regex to `.includes(tok)` reds the substring assertion (verified), so the boundary semantics are now a guarded contract, not just a comment. Also corrected the slightly-misleading comment to state the contract precisely.

**File:** `scripts/import-opentabs-catalog.mjs:730-742`

**Issue:** The comment says "A guarded phrase carries a cross-claiming token as a WHOLE WORD (so 'status'
does not trip on 'statuses' incorrectly is acceptable)". The implementation uses `\b<tok>\b`, which means
`'status'` DOES match inside `'status update'` (intended) but does NOT match `'statuses'` (also fine) — so
the behavior matches the intent. However, the guarded-token list is hand-curated per-slug and the
whole-word property is load-bearing for correctness (a substring guard on `'page'` would wrongly drop
`'pages'`/`'paged'` phrasings). This is fine today but is an un-tested invariant: there is no assertion
that the guard is whole-word, so a future maintainer who "simplifies" to `.includes(tok)` would silently
over-drop phrases and shift rankings with no test failure (the corpus-tier is RECORDED).

**Fix:** Add a tiny unit assertion on `isOverClaim` (exported or tested via a re-import) pinning that
`isOverClaim('sentry.update_issue', 'view all issue statuses')` is false for the `'status'` token (i.e.
whole-word, not substring), so the boundary semantics are a guarded contract, not a comment.

---

_Reviewed: 2026-06-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
