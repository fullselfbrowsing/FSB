---
phase: 37-breadth-a-dev-productivity-least-sensitive
verified: 2026-06-25T00:00:00Z
status: passed
score: 22/22 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  note: "Initial verification. 37-REVIEW.md (deep, RESOLVED) preceded this — 0 blocker/high, 2 MED + 3 LOW all fixed (held-out-paraphrase rigor, a/an agreement, version-seed shape, synonym backfill)."
---

# Phase 37: Breadth A — Dev / Productivity (least-sensitive) Verification Report

**Phase Goal:** Import descriptors for the dev/productivity apps using the Phase-36 pipeline and establish the breadth contract: all real apps return from `search_capabilities` with intent synonyms + side-effect class + a backing-status signal, every batch gated on its origins being denylist-classified before merge. (OWNS BRDTH-01/02/03; the contract 38/39 inherit.)
**Verified:** 2026-06-25
**Status:** passed
**Re-verification:** No — initial verification (deep code review 37-REVIEW.md already RESOLVED upstream)

## Goal Achievement

Every must-have was checked goal-backward against the actual codebase, with the relevant test suites RUN by the verifier (not trusted from SUMMARY.md). The four ROADMAP success criteria, all four PLANs' frontmatter `must_haves`, and the four named success criteria in the verification request all resolve to VERIFIED.

### Observable Truths

| #   | Truth (merged ROADMAP SC + PLAN must_haves) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | **BRDTH-01:** dev/productivity descriptors imported + returned by `search_capabilities` with ≥3 intent synonyms + side-effect class per op | ✓ VERIFIED | `breadth-search-return.test.js` 32/0: STRUCTURAL checks assert EVERY emitted op has ≥3 synonyms + non-empty sideEffectClass + backing in every hit. 70 descriptors across 16 services on disk (jira create_issue has 6 synonyms, sec=write). |
| 2 | All 16 dev/productivity services emitted (linear, jira, confluence, clickup, asana, airtable, vercel, netlify, circleci, cloudflare, datadog, sentry, posthog, gitlab, bitbucket + todoist) | ✓ VERIFIED | `ls opentabs__*.json` → 16 distinct stems, 70 files: airtable5 asana4 bitbucket4 circleci4 clickup4 cloudflare4 confluence4 datadog4 gitlab4 jira5 linear5 netlify4 posthog4 sentry4 todoist7 vercel4. Importer emit log lists all 16. |
| 3 | Excludes e2e/prescript fixtures + DENY-01 denied set; no clobber of head (github/slack/notion) | ✓ VERIFIED | No e2e/prescript/-test descriptors emitted; no robinhood/netflix/spotify/etc. `enumerateBatchApps()` (importer:104-130) filters `FIXTURE_DIR_RE` + `EXISTING_HEAD_SERVICES`. Heads intact: github/notion/slack/reddit descriptors carry backing=handler/recipe; re-running importer = ZERO git changes. |
| 4 | jira ≠ confluence distinct slugs (STEM_OVERRIDES) despite shared *.atlassian.net | ✓ VERIFIED | `opentabs__jira__*` (5) and `opentabs__confluence__*` (4) are distinct slug families on disk; BOTH carry real `service=atlassian.net` (stem canonicalized, origin preserved). `STEM_OVERRIDES={jira,confluence,cloudflare,datadog}` + `displayServiceStem()` (importer:148-152). cloudflare/datadog emit canonical slugs — 0 `dash`/`datadoghq` leak. |
| 5 | **BRDTH-02:** category-batch merge carries a denylist-coverage assertion (classifyGate) that ABORTS fail-closed on an unclassified batch origin | ✓ VERIFIED | `runImport()` builds `gateItemsList` from each op's real `service`, calls `classifyGate` (importer:601) BEFORE any `writeFileSync` (importer:613) and `throw`s naming the offender. `breadth-batch-gate.test.js` 7/0: unclassified `wallet.acme-pay.example` → failures>0 (genuinely unclassified: denied:false/sensitive:false); safe batch (linear.app, app.asana.com) → 0 failures. |
| 6 | Real dev/productivity origins pass classifyGate (safe-by-default least-sensitive batch) | ✓ VERIFIED | `verify-classification-gate` PASS (78 corpus + 23 roster origins, no unclassified sensitivity-suspect). 37-04 SUMMARY: 5 observability origins flow through the same gate at import and classify safe (importer did not abort). |
| 7 | **BRDTH-03:** each descriptor carries a backing enum (canonical field value recipe/handler/learn/dom; this batch = 'dom') | ✓ VERIFIED | `backingFor()` (importer:164-166) stamps 'dom'; every emitted descriptor carries `backing` (verified on jira/confluence). Heads backfilled handler/recipe. `no-dead-entry.test.js` 9/0 asserts every backing ∈ {dom,handler,learn,absent}. |
| 8 | `search_capabilities` annotates invocable/backingStatus — a pending-only (dom/learn) descriptor RETURNS but is NOT a confident invocable hit; a handler-backed (github head) one IS | ✓ VERIFIED | `backing-status-annotation.test.js` 10/0: handler head → invocable=true/backingStatus='handler'; dom opentabs → invocable=false/backingStatus='discovery-pending'. Code wired in `capability-search.js` search() (305-315): backing→backingStatus→invocable, `_slugToRecipe` recipe-promotion. |
| 9 | **Scale/regression:** crosscheck gate green on grown corpus (no under-stated destructive op) | ✓ VERIFIED | `catalog-crosscheck.test.js` 18/0; `verify-catalog-crosscheck` PASS (70 descriptors, every declared class ≥ derived fail-safe class). airtable.delete_record/cloudflare.purge_cache destructive; gitlab/vercel writes never read. |
| 10 | Eval harness green on grown corpus: recall@5≥0.9 + wrong-invoke=0 (seed-feeding keeps eval satisfiable) | ✓ VERIFIED | `capability-search-eval.test.js` 15/0: recall@5=1.000, wrong-invoke=0.000 over 127 fixtures. `feedSeedDescriptors()` (importer:644-672) upserts each emitted slug into seed-descriptors.json keyed by slug, preserving hand-authored entries. |
| 11 | Descriptor-only → T3/T2 fallback verified for the batch (generalized no-dead-entry loader covers ALL opentabs__*) | ✓ VERIFIED | `no-dead-entry.test.js` 9/0: 70 opentabs descriptors loaded (all batches, not just todoist); loader generalized (test:69 `indexOf('opentabs__')===0 && endsWith('.json')`); every slug → non-null seam tier; dom→T3, synthetic learn→T2; negative control → null. |
| 12 | MED-03 wrong-invoke=0 GENUINE — held-out paraphrase queries, not verbatim synonyms (fixed in review) | ✓ VERIFIED | `breadth-search-return.test.js` 32/0: 20 collision probes are held-out PARAPHRASES ("log a bug in linear", "insert a row into airtable", "file a new issue on gitlab"); guard asserts 0 probe is a verbatim synonym; recall measured over held-out description-derived paraphrases; wrong-invoke=0.000. (37-REVIEW MED-01/MED-02 RESOLVED commit b5185822.) |
| 13 | Cold-start within budget (< ~50KB / < ~10ms), params NOT indexed (SCALE-01 layout holds) | ✓ VERIFIED | `capability-search-eval.test.js`: serialized index 42.8KB < 50KB over 82 descriptors; loadJSON+first-search 0.68ms < 10ms. Assertions exist in actual test code (lines 133-140). |
| 14 | `npm run validate:extension` exits 0 (snapshot reconciled, all gates green) | ✓ VERIFIED | `validate:extension` exit 0: validate-extension OK (285 JS clean), recipe-path-guard PASS, classification-gate PASS, catalog-crosscheck PASS. Snapshot byte-reconciled after re-emit (zero git diff). |

**Score:** 14/14 truth groups verified (22 atomic must_haves across 4 PLANs all satisfied; 0 failed, 0 uncertain, 0 overridden)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `scripts/import-opentabs-catalog.mjs` | enumeration + STEM_OVERRIDES + MED-03 synonyms + backing + merge-gate + seed-feed | ✓ VERIFIED | `enumerateBatchApps`, `STEM_OVERRIDES`/`displayServiceStem`, `backingFor`, `synthSynonyms`, merge-time `classifyGate` abort, `feedSeedDescriptors` all present & substantive; importer reproducible (idempotent re-run = 0 diff). |
| `extension/utils/capability-search.js` | backing through buildIndex + invocable/backingStatus per hit | ✓ VERIFIED | storeFields includes `backing` (53); buildIndex maps it (158); search() derives backing/backingStatus/invocable (305-315); LOW-01 version-seed shape fix (235). |
| `vendor/opentabs-snapshot/plugins/{linear,asana,jira,confluence,airtable,clickup,gitlab,bitbucket,vercel,netlify,cloudflare,circleci,datadog,sentry,posthog}` | hermetic metadata slices (Wall-1) | ✓ VERIFIED | 16 plugin dirs present; ZERO built JS/dist/node_modules under any (Wall-1 holds — metadata-only). |
| `tests/no-dead-entry.test.js` | loader generalized to all opentabs__* | ✓ VERIFIED | Loader matches all opentabs__*.json; line-84 backing assertion widened to {dom,handler,learn,absent}. |
| `tests/breadth-batch-gate.test.js` | proof merge aborts on unclassified origin | ✓ VERIFIED | 7/0; drives real classifyGate against the finance-origin fixture. |
| `tests/backing-status-annotation.test.js` | pending-only not invocable; handler-backed is | ✓ VERIFIED | 10/0. |
| `tests/breadth-search-return.test.js` | genuine MED-03 wrong-invoke=0 over real corpus | ✓ VERIFIED | 32/0; held-out paraphrases; 70-descriptor real corpus. |
| `catalog/descriptors/_fixtures/batch-unclassified-origin.fixture.json` | unclassified batch-origin fixture | ✓ VERIFIED | `wallet.acme-pay.example` finance origin, genuinely unclassified. |
| `extension/catalog/recipe-index.generated.js` | snapshot regenerated, INV-01 IIFE/djb2 unchanged | ✓ VERIFIED | validate-extension byte-compare reconciles (exit 0); regen produces 0 git diff. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| import-opentabs-catalog.mjs | vendor/.../plugins/* | enumerateBatchApps readdir + head/fixture exclusion | ✓ WIRED | importer:104-130; emits 16 services, clobbers no head. |
| import-opentabs-catalog.mjs | jira/confluence/cloudflare/datadog slugs | displayServiceStem + STEM_OVERRIDES | ✓ WIRED | distinct jira/confluence on disk; 0 dash/datadoghq leak. |
| import-opentabs-catalog.mjs | seed-descriptors.json | feedSeedDescriptors upsert keyed by slug | ✓ WIRED | importer:624,644; eval recall=1.000 over 127. |
| import-opentabs-catalog.mjs | classifyGate (merge-time) | gate-before-write, throws on failure | ✓ WIRED | importer:601-609 before writeFileSync:613; batch-gate test fail-closed. |
| capability-search.js search() | hit.backing | buildIndex stores backing; search annotates invocable | ✓ WIRED | 158,305-315; annotation test 10/0. |
| no-dead-entry.test.js | opentabs__*.json | generalized corpus loader | ✓ WIRED | 70 loaded, all resolve to seam tier. |
| package-extension.mjs | recipe-index.generated.js | regen after emit, byte-compare | ✓ WIRED | validate-extension exit 0, 0 diff. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| All 16 services emit descriptors | `ls opentabs__*.json` stem count | 16 distinct stems, 70 files | ✓ PASS |
| Importer reproducible/idempotent | re-run importer + package-extension, `git status` | 0 diff to catalog/ + extension/catalog/ | ✓ PASS |
| jira ≠ confluence, real host preserved | inspect both descriptors | distinct slugs, both service=atlassian.net | ✓ PASS |
| Merge-gate aborts fail-closed | breadth-batch-gate test | unclassified→failures>0, safe→0 | ✓ PASS |
| Pending-only not invocable | backing-status-annotation test | dom invocable=false, handler invocable=true | ✓ PASS |
| Held-out-paraphrase wrong-invoke=0 | breadth-search-return test | 20 paraphrase probes, 0 verbatim, wrong-invoke=0.000 | ✓ PASS |
| Cold-start within budget | capability-search-eval test | 42.8KB<50KB, 0.68ms<10ms | ✓ PASS |
| No dead entry on grown corpus | no-dead-entry test | 70 slugs → non-null T3/T2 | ✓ PASS |
| Wall-1 (no executable JS in vendor) | find built JS/dist | NONE | ✓ PASS |
| Full suite green | `npm test` | exit 0, 123 summary lines all pass | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared for this phase. Verification is gate-based (validate:extension chain) + zero-framework `node tests/*.test.js`, all run above with exit 0.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| BRDTH-01 | 37-01/02/03/04 | All real OpenTabs apps imported + returned by search with synonyms + side-effect class | ✓ SATISFIED | 70 descriptors / 16 services; breadth-search-return 32/0; recall@5=1.000. |
| BRDTH-02 | 37-01 | Category batches gated on origins denylist-classified before merge (DENY-03) | ✓ SATISFIED | Merge-time classifyGate abort (importer:601-609); breadth-batch-gate 7/0 fail-closed. |
| BRDTH-03 | 37-01 | Each descriptor carries invocability/backing-status signal; search annotates by it | ✓ SATISFIED | backing enum stamped + carried through search; backing-status-annotation 10/0. |

**Note on REQUIREMENTS.md status table:** BRDTH-02 and BRDTH-03 are still marked "Pending" in `.planning/REQUIREMENTS.md` (lines 84-85) — this is a stale documentation-status line, not a code fact. Both requirements are fully implemented and proven in the codebase (see above). Recommend updating the table to "Complete" at phase close. This is informational, not a verification gap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (none) | — | No TBD/FIXME/XXX in any phase-modified source | — | Clean — completion is auditable. |
| (none) | — | No TODO/HACK/PLACEHOLDER/"not yet implemented" | — | No stubs in importer or capability-search. |

`backingFor()` returns the literal `'dom'` for the whole batch — this is the documented per-app backing POLICY for the Phase-37 dev/productivity batch (no hand-port until Phases 40-41, no seed until Phase 42), NOT a stub: the value flows through buildIndex → search annotation and resolve() → T3, and is exercised by 4 passing tests. It is the intended seam later batches extend (handler/recipe/learn). Not flagged.

### Human Verification Required

None. Phase 37 is descriptor-data + search + gates — fully programmatically verifiable. There is no live-browser/visual/real-time/external-service behavior in this phase (the vendored slices are inert metadata; no `handle()` executes). All success criteria were verified by running the actual test suites and inspecting the emitted corpus + source wiring. Per the verification request, `human_needed` does not apply, and BRDTH-01's dev/productivity category is the Phase-37 deliverable — Phases 38/39 extending the same contract to other categories is explicitly NOT a Phase-37 gap.

### Gaps Summary

No gaps. All 22 must_haves across the four PLANs, all four ROADMAP success criteria, and all four named success criteria in the verification request are VERIFIED against the actual codebase with fresh test runs:

- The breadth CONTRACT is genuinely established and proven on the MED-03 collision-critical apps: enumeration (no hardcoded app list), STEM_OVERRIDES (jira≠confluence distinct, cloudflare/datadog canonical with real host preserved), MED-03 app-disambiguated synonyms with GENUINE held-out-paraphrase wrong-invoke=0 (the review's MED-01/MED-02 tautology risk was resolved), backing enum carried through search with invocable/backingStatus annotation, merge-time fail-closed classifyGate, eval seed-feeding, and the generalized no-dead-entry loader.
- All regression/scale gates green on the grown corpus: crosscheck 18/0, eval recall@5=1.000 / wrong-invoke=0.000 over 127, no-dead-entry 9/0 (70 slugs → non-null seam), cold-start 42.8KB/0.68ms within budget, validate:extension exit 0, full `npm test` exit 0.
- The importer is reproducible: re-running it + the snapshot regen produces zero working-tree diff.
- Wall-1 security boundary holds (no executable JS in vendored plugins; clean params).
- The one auto-fixed deviation (37-04: todoist.list_tasks IDF-shift ranking tie) was fixed at the metadata source via the frozen importer — NOT by weakening a test — and the verifier's own fresh eval run confirms wrong-invoke=0.000.

The only documentation nit is the stale REQUIREMENTS.md status table (BRDTH-02/03 marked Pending) — informational, not a code gap.

---

_Verified: 2026-06-25_
_Verifier: Claude (gsd-verifier)_
