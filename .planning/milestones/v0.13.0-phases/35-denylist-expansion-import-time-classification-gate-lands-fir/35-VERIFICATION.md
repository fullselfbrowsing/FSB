---
phase: 35-denylist-expansion-import-time-classification-gate-lands-fir
verified: 2026-06-24T00:00:00Z
status: passed
score: 22/22 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  note: "Initial verification (no prior 35-VERIFICATION.md)."
---

# Phase 35: Denylist Expansion + Import-Time Classification Gate Verification Report

**Phase Goal:** Make the service-denylist cover every categorically-prohibited and allowed-but-sensitive origin in the named roster, make that coverage un-bypassable via a fail-closed build-time + CI classification gate, and re-scope the v0.9.99-Phase-30 friction to sensitive origins only (DENY-04 posture B) -- BEFORE any descriptor import phase runs. The denylist is the ONE hard floor under the shipped opt-out Auto default.
**Verified:** 2026-06-24
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

All five ROADMAP success criteria are observably TRUE in the codebase, every must-have across the four plans is VERIFIED, and every behavioral/probe claim was reproduced by the verifier (not taken from SUMMARY). The four DENY requirements (DENY-01..04) are fully accounted for.

### Observable Truths (ROADMAP Success Criteria + merged PLAN must_haves)

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | SC1/DENY-01: deniedOrigins hard-blocks the categorically-prohibited roster; a test asserts each classifies `denied` | VERIFIED | service-denylist.json deniedOrigins has all 10 (robinhood, digital.fidelity.com, app.carta.com, *.netflix.com, open.spotify.com, *.twitch.tv, store.steampowered.com, music.youtube.com, *.tinder.com, *.onlyfans.com). `node tests/service-denylist.test.js` -> PASS=50 FAIL=0, incl. per-origin `classify().denied===true` for all 10 |
| 2  | SC2/DENY-02: sensitiveOrigins classifies the allowed-but-sensitive tier as sensitive (not denied) | VERIFIED | sensitiveOrigins has dashboard.stripe.com, *.coinbase.com, console.twilio.com, app.ynab.com, IG/FB/TikTok/X, + messaging set. Test asserts each `{sensitive:true, denied:false}` (13 origins, all PASS) |
| 3  | SC1 reconcile: IG/FB/TikTok/X are sensitive-not-denied; their WRITE-paths gated by posture B, reads under Auto | VERIFIED | Ran classify() live: all four return `sensitive:true, denied:false`. WRITES route through step-(3.5) -> RECIPE_CONSENT_MUTATING_REQUIRED (sensitive-class proven in consent-mutation-gate). Matches DENY-02/CONTEXT/LEGAL.md; SC1's "write-paths of ig/fb/tiktok/x" satisfied via the mutating-flag mechanism, not hard-deny |
| 4  | Exact-host forms match only their exact host, never a broad subdomain | VERIFIED | Test asserts `api.stripe.com`.sensitive===false and `www.youtube.com`.denied===false (dashboard.stripe.com / music.youtube.com did NOT over-broaden). `www.fidelity.com` not denied (only digital.fidelity.com is) |
| 5  | Existing FSB seed preserved (chase/bofa/wellsfargo/irs.gov/mail/outlook/*.gov) | VERIFIED | All seed entries present in JSON; chase-seed regression assertion PASS; loader (`service-denylist.js`) last changed in beta prerelease 46d2b6fc -- untouched by phase 35 (data-only) |
| 6  | SC3/DENY-03: a build-time gate refuses an unclassified sensitive/ToS origin -- fail-closed, non-zero exit naming the offender | VERIFIED | Copied the fixture to a top-level swept descriptor: `node scripts/verify-classification-gate.mjs` -> FAIL, EXIT 1, names `pay.unclassified-fixture.test` + matched "pay". Removed temp file after |
| 7  | DENY-03: a genuinely-benign unclassified origin defaults to safe (no false-fail) | VERIFIED | classification-gate test (c)/(f): airtable/asana/wikipedia/hackernews/reddit.inbox/github.notifications -> 0 failures. Gate CLI exits 0 over real 8 corpus + 23 roster |
| 8  | DENY-03: gate exports reusable `classifyGate(items)->{failures[]}` AND runs as CLI | VERIFIED | `export function classifyGate` + `export function sensitivityHeuristic` present; CLI guarded by `import.meta.url === pathToFileURL(process.argv[1]).href`. Test imports classifyGate via `await import()` |
| 9  | DENY-03: gate chained into validate:extension so it runs in CI | VERIFIED | `validate:extension` = `... && node scripts/verify-classification-gate.mjs`; `ci` runs `validate:extension`. `npm run validate:extension` -> EXIT 0 with gate PASS line in output |
| 10 | DENY-03: proof fixture under catalog/descriptors/_fixtures/ so non-recursive readJsonDir never inlines it | VERIFIED | Fixture at catalog/descriptors/_fixtures/unclassified-sensitive.fixture.json; gate CLI over real corpus excludes it (8 corpus origins, fixture not among them); readCorpusItems is non-recursive |
| 11 | SC4/DENY-04: a WRITE to a sensitive origin without the per-origin mutating flag returns RECIPE_CONSENT_MUTATING_REQUIRED | VERIFIED | step-(3.5) branch in `_evaluateConsent` (capability-router.js:476-496) fires on `mutating && !mutatingAllowed && classify(origin).sensitive===true`. `node tests/consent-mutation-gate.test.js` -> PASS=20: sensitive POST (no flag) -> not allow + the typed reason |
| 12 | DENY-04: reads to a sensitive origin pass under Auto (re-gate is write-only) | VERIFIED | Test: sensitive GET -> allow; the branch is guarded by `mutating` so reads never reach it |
| 13 | DENY-04: a WRITE to a sensitive origin WITH the per-origin mutating flag passes | VERIFIED | Test: after `setOriginMutating(origin,true)`, sensitive POST -> allow (`mutatingAllowed` short-circuits the guard) |
| 14 | DENY-04: a WRITE to a NON-sensitive origin passes under Auto (narrows, does not revert 68ceea90) | VERIFIED | Non-sensitive github.com regression canary: POST/PUT/PATCH/DELETE all -> allow (PASS); explicitly-Off still blocks. Branch falls through to final auto-allow for non-sensitive |
| 15 | DENY-04: typed reason byte-equal to pre-68ceea90 string + dual-field `_err` shape (INV-03) | VERIFIED | Current `_err('RECIPE_CONSENT_MUTATING_REQUIRED', {origin, slug})` is byte-identical to `git show 68ceea90^:...` (line 477). Test asserts code/errorCode/error all carry the string |
| 16 | DENY-04 hardening: re-gate fails CLOSED if classify() throws on a mutating sensitive call (MD-01) | VERIFIED | Branch sets `clsUnknown` on throw/non-object and re-gates; test "MD-01" block: throwing-classify POST -> RECIPE_CONSENT_MUTATING_REQUIRED, throwing-classify GET -> still allow. PASS |
| 17 | SC5: vendor/opentabs-snapshot/PIN.md pins SHA 4b17021637... + embeds verbatim MIT + copyright line | VERIFIED | PIN.md frontmatter `current_opentabs_sha: 4b17021637d2cac12b8d84d21c40e765aa7b85e9`; body embeds full MIT (permission grant + AS IS + liability) + `Copyright (c) 2026-present OpenTabs Contributors`. provenance-scaffold test PASS=16 |
| 18 | SC5: _provenance.json scaffold present recording {source, sha, license:MIT, apps:[]} for Phase 36 | VERIFIED | vendor-side + catalog-side both present; both pin SHA 4b17021637..., license MIT, apps:[] (intentional scaffold for Phase 36, documented in PIN.md + catalog `_note`). Test asserts both SHAs match |
| 19 | SC5: docs/LEGAL.md names the ToS-hostility axis (Categorization Axes) | VERIFIED | `### Categorization Axes` names all 3 axes (finance/gov denial, ToS-hostility denial, sensitivity); axis 2 names the full roster robinhood..onlyfans. MD-03 reconciled: Auto table row scopes "open under Auto" to non-sensitive + references DENY-04 |
| 20 | SC5: Wall 1 holds -- no OpenTabs runtime vendored, only metadata/provenance | VERIFIED | `find vendor/opentabs-snapshot -name '*.js' -o ...` -> 0 runtime files; directory holds only PIN.md + _provenance.json. Test asserts no `.js` |
| 21 | DENY-04 did not break the consent/denylist neighbors (narrowed, not reverted) | VERIFIED | Ran consent-gate (0), consent-chokepoint (0), consent-policy-store (0), capability-router (0), verify-recipe-path-guard (0) -- all EXIT 0 |
| 22 | catalog-side provenance scaffold isolated from the shipped index (no leak) | VERIFIED | extension/catalog/recipe-index.generated.js contains neither the SHA nor `_provenance` (ISOLATION-EXIT=0); validate-extension PASS |

**Score:** 22/22 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `extension/config/service-denylist.json` | Expanded denied + sensitive roster (exact-host forms), seed preserved | VERIFIED | All 10 denied + 13 core sensitive + messaging roster present; seed intact; v:1 + deniedReason unchanged |
| `tests/service-denylist.test.js` | Per-origin classify() roster assertions | VERIFIED | 269 lines, 31 check() calls; PASS=50 FAIL=0 |
| `scripts/verify-classification-gate.mjs` | Fail-closed gate; classifyGate() export + CLI (>=60 lines) | VERIFIED | 310 lines; classifyGate + sensitivityHeuristic exports + dual-export CLI; Node-builtins-only |
| `catalog/descriptors/_fixtures/unclassified-sensitive.fixture.json` | DENY-03 proof fixture (pay.unclassified-fixture.test) | VERIFIED | Present; trips finance axis via `pay`/`payment`/`wallet`; `.test` TLD; under _fixtures/ |
| `tests/classification-gate.test.js` | Gate behavior: reject/override/no-false-positive/classified-passes (>=40 lines) | VERIFIED | 150 lines, 17 check() calls; PASS=15 FAIL=0 |
| `extension/utils/capability-router.js` | Posture-B step-(3.5) branch scoped to classify().sensitive | VERIFIED | Branch at lines 476-496; emits dual-field RECIPE_CONSENT_MUTATING_REQUIRED; fail-closed on probe throw |
| `tests/consent-mutation-gate.test.js` | Sensitive posture-B cases + non-sensitive regression canary | VERIFIED | 254 lines, 19 check() calls; PASS=20 FAIL=0 |
| `vendor/opentabs-snapshot/PIN.md` | SHA + verbatim MIT, LATTICE-PIN discipline | VERIFIED | SHA + MIT + copyright + Wall-1 statement + per-phase log |
| `vendor/opentabs-snapshot/_provenance.json` | Scaffold {source,sha,license,apps:[]} | VERIFIED | Valid JSON; sha pinned; apps:[] |
| `catalog/descriptors/_fixtures/_provenance.json` | Catalog-side scaffold, SHA-matched, isolated | VERIFIED | sha matches vendor; `_role`/`_note` distinguish it (LO-02); excluded from shipped index |
| `docs/LEGAL.md` | Categorization Axes subsection | VERIFIED | 3 axes named + ToS-hostility roster; Consent Model reconciled (MD-03) |
| `tests/provenance-scaffold.test.js` | PIN/SHA-match/LEGAL-axes/Wall-1 assertions (>=30 lines) | VERIFIED | 110 lines, 18 check() calls; PASS=16 FAIL=0 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| tests/service-denylist.test.js | service-denylist.js classify() | require + load() + classify() | WIRED | 50 assertions exercise classify() over the full roster |
| service-denylist.js | service-denylist.json | load() reads bundled JSON (loader UNCHANGED) | WIRED | Loader untouched; data-only expansion live at boot via load() |
| verify-classification-gate.mjs | service-denylist.js classify() | createRequire + await load() + classify() | WIRED | CLI awaits Denylist.load() then classifies corpus + roster |
| package.json validate:extension | verify-classification-gate.mjs | `&& node scripts/verify-classification-gate.mjs` | WIRED | Confirmed in scripts; `ci` runs it; npm run validate:extension EXIT 0 |
| tests/classification-gate.test.js | verify-classification-gate.mjs classifyGate | `await import()` + assert failures[] | WIRED | Drives fixture rejection + override + benign + classified paths |
| capability-router.js _evaluateConsent | service-denylist.js classify() | classify(origin).sensitive at step (3.5) | WIRED | Branch reads classify().sensitive before the auto-allow |
| capability-router.js | _err dual-field helper | `_err('RECIPE_CONSENT_MUTATING_REQUIRED', {origin, slug})` | WIRED | Byte-exact; test asserts code+errorCode+error |
| tests/consent-mutation-gate.test.js | consent-policy-store.js setOriginMutating | Store.setOriginMutating(origin,true) flips sensitive write to allow | WIRED | Test exercises the flag-elevation path |
| catalog _provenance.json | vendor PIN.md | both pin same SHA 4b17021637... | WIRED | Test asserts the two SHAs match |
| tests/provenance-scaffold.test.js | docs/LEGAL.md | asserts Categorization Axes + 3 axis names | WIRED | 18 assertions incl. LEGAL axes + roster naming |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| classify() roster | denied/sensitive verdicts | service-denylist.json arrays via load() | Yes -- 50 live assertions over real roster | FLOWING |
| classifyGate CLI | corpus item origins | readCorpusItems() reads catalog/descriptors/*.json (8 real descriptors) + 23 roster | Yes -- real corpus swept, exit 0 | FLOWING |
| posture-B branch | cls.sensitive | live denylist.classify(origin) at call time | Yes -- live classify() drives the verdict | FLOWING |
| _provenance.json apps | apps[] | empty scaffold by design (Phase 36 populates) | N/A -- intentional documented scaffold, not a rendering surface | SCAFFOLD (expected) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| All 10 denied roster origins classify denied | `node tests/service-denylist.test.js` | PASS=50 FAIL=0, EXIT 0 | PASS |
| Posture-B sensitive write blocked, read + flagged-write allowed | `node tests/consent-mutation-gate.test.js` | PASS=20 FAIL=0, EXIT 0 | PASS |
| Gate rejects fixture / passes benign / classified | `node tests/classification-gate.test.js` | PASS=15 FAIL=0, EXIT 0 | PASS |
| Provenance pin + SHA-match + LEGAL axes + Wall 1 | `node tests/provenance-scaffold.test.js` | PASS=16 FAIL=0, EXIT 0 | PASS |
| IG/FB/TikTok/X classify sensitive-not-denied | live classify() probe | all 4 sensitive:true denied:false | PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| Classification gate CLI (roster, must exit 0) | `node scripts/verify-classification-gate.mjs` | PASS (8 corpus + 23 roster), EXIT 0 | PASS |
| Fail-closed proof (unclassified-in-corpus, must exit non-zero) | temp-copy fixture to top-level + `node scripts/verify-classification-gate.mjs` | FAIL naming pay.unclassified-fixture.test, EXIT 1 | PASS (fail-closed proven) |
| CI gate chain | `npm run validate:extension` | manifest OK + recipe-path PASS + classification-gate PASS, EXIT 0 | PASS |
| Recipe-path Wall-1 guard (router edit added no dynamic-code) | `node scripts/verify-recipe-path-guard.mjs` | PASS (20 files clean), EXIT 0 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| DENY-01 | 35-01, 35-04 | deniedOrigins hard-blocks categorically-prohibited apps | SATISFIED | Truths 1, 3, 17-19; service-denylist.test.js 50/50; LEGAL ToS-hostility roster |
| DENY-02 | 35-01 | sensitiveOrigins classifies allowed-but-sensitive tier | SATISFIED | Truths 2, 3; 13 sensitive-roster assertions PASS |
| DENY-03 | 35-02 | fail-closed import-time/CI classification gate | SATISFIED | Truths 6-10; gate CLI exit 0 on roster / exit 1 on unclassified-in-corpus; chained into validate:extension/ci |
| DENY-04 | 35-03 | posture-B sensitive-write mutating opt-in | SATISFIED | Truths 11-16, 21; consent-mutation-gate 20/20; byte-exact reason; neighbors green |

No orphaned requirements: REQUIREMENTS.md maps exactly DENY-01..04 to Phase 35, all claimed by plan frontmatter, all marked Complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | -- | No TBD/FIXME/XXX in any phase-35 source file | -- | `_provenance.json apps:[]` is an intentional, documented scaffold (PIN.md + catalog `_note` + SUMMARY "Known Stubs"), not an unwired stub; Phase 36 (CGEN-01) populates it |

### Human Verification Required

None. Per the phase brief, all Phase 35 controls are pure-data / gate / router and fully automatable; there is no live-browser UAT. The verifier reproduced every behavioral and probe claim directly (test suites, gate CLI exit codes, fail-closed fixture rejection, byte-exact reason recovery, Wall-1 file scan, isolation check). No claim required un-automatable human testing.

### Gaps Summary

No gaps. All four plans deliver their must_haves; all five ROADMAP success criteria are observably true in the codebase; all four DENY requirements are satisfied with reproduced evidence. The one wording nuance worth recording (not a gap): ROADMAP SC1 phrases the IG/FB/TikTok/X coverage as deniedOrigins "hard-blocks ... the write-paths of instagram/facebook/tiktok/x", while the shipped implementation classifies those four as sensitive (DENY-02) and gates their WRITES via posture-B (DENY-04 -> RECIPE_CONSENT_MUTATING_REQUIRED) rather than hard-denying them. This is the intentional, consistently-documented product posture (CONTEXT, all four plans, REQUIREMENTS.md DENY-02/04, docs/LEGAL.md Sensitivity axis): the write-paths ARE gated (a sensitive WRITE cannot run under Auto without the per-origin mutating flag), reads run under Auto. The verifier confirmed the gate fires for the sensitive class, so the security intent of SC1 (no ungated sensitive write under Auto) is achieved. The 6 code-review findings (0 blocker / 0 high / 3 medium / 3 low) are resolved in-tree (MD-01 fail-closed branch, MD-02 banking/funds vocabulary, MD-03 LEGAL reconciliation, LO-01/LO-02 comment+data hygiene) -- all five resolution commits verified to exist and their effects independently observed; LO-03 is working-as-designed.

---

_Verified: 2026-06-24_
_Verifier: Claude (gsd-verifier)_
