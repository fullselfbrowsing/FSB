---
phase: 38-breadth-b-comms-social-content-sensitivity-screened
plan: 03
subsystem: catalog
tags: [opentabs, descriptors, breadth, dom-only, discord, reddit, sensitive-write, posture-b, consent-gate, capability-search, classify-gate]

# Dependency graph
requires:
  - phase: 38-01
    provides: "service-denylist.json classification of discord.com sensitive (Phase 35 + reconfirmed) -- the merge-time classifyGate passes the discord origin AND the posture-B re-gate fires on the discord write; reddit content-reads stay SAFE (unclassified, reads under Auto)"
  - phase: 38-02
    provides: "the grown 87-descriptor comms/social corpus + the breadth-search-return corpusFiles regex/floor pattern + the CGEN-04 cold-start budget at 64KB this plan extends to 94 descriptors"
  - phase: 37-01
    provides: "the frozen import machinery (enumerateBatchApps + STEM_OVERRIDES + synthSynonyms + backingFor='dom' + classifyGate-before-emit + feedSeedDescriptors); the no-dead-entry generalized opentabs__* loader; the breadth-search-return contract"
  - phase: 35-03
    provides: "the posture-B (DENY-04) _evaluateConsent step-(3.5) re-gate: a sensitive-origin WRITE without the per-origin mutating flag -> RECIPE_CONSENT_MUTATING_REQUIRED (dual-field); the LIVE-roster consent test pattern"
provides:
  - "7 DOM-only messaging + content-read descriptors (discord list_channels/list_messages/send_message/delete_message + reddit list_subreddit_posts/get_post/search_posts) emitted via the frozen machinery, all backing:'dom' -- COMPLETING the comms/social/content category"
  - "the END-TO-END sensitive-write-import proof: tests/sensitive-write-import-gate.test.js loads the REAL emitted opentabs__discord__send_message.json FROM DISK and proves it is posture-B write-gated through the LIVE consent gate (read allows, write -> RECIPE_CONSENT_MUTATING_REQUIRED, flag elevates) -- the headline T-38-01 mitigation on a SHIPPED descriptor"
  - "the reddit apex-host resolution: reddit vendors *://reddit.com/* (NOT www.reddit.com) so the frozen split('.')[0] derives the stem 'reddit' (not 'www') -> opentabs__reddit__* with NO STEM_OVERRIDES entry; reddit.com classifies benign-safe so the classifyGate passes it; the existing reddit-inbox.json (slug reddit.inbox, backing recipe) is NOT clobbered"
affects: ["phase 38 verification", "phase 39 commerce/travel breadth", "phase 40-41 depth hand-ports", "phase 43 catalog-scale gate"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "screening enforced end-to-end on a SHIPPED descriptor: the consent test loads the REAL emitted descriptor JSON from disk and drives ITS sideEffectClass into the live posture-B gate -- proving the gating holds on the descriptor that actually ships, not a hand-built stand-in (closes the loop the 38-01 hand-built proof opened)"
    - "apex-host vendoring for a safe content app whose www-subdomain would mis-derive: reddit vendors *://reddit.com/* so the frozen stem is 'reddit' (www.reddit.com would derive 'www') -- the data-only alternative to a STEM_OVERRIDES entry when the apex is itself benign-safe"
    - "fail-safe-toward-sensitive per side-effect: reddit is imported READ-ONLY (the safe tier) -- a reddit write op would have forced reclassifying reddit.com sensitive so its writes are posture-B gated; the slice carries no apiVoid because no op mutates"
    - "distinct-slug coexistence: opentabs__reddit__* (backing dom) lands ALONGSIDE the hand-authored reddit-inbox.json (slug reddit.inbox, backing recipe) -- different filename/slug -> no clobber (the importer's filename is opentabs__<stem>__<op>.json, never <app>.<op>)"

key-files:
  created:
    - "vendor/opentabs-snapshot/plugins/discord/** (4 ops: list_channels/list_messages reads + send_message WRITE + delete_message DESTRUCTIVE; host discord.com, stem discord)"
    - "vendor/opentabs-snapshot/plugins/reddit/** (3 read-only ops: list_subreddit_posts/get_post/search_posts; host reddit.com apex, stem reddit; NO apiVoid -- read-only slice)"
    - "catalog/descriptors/opentabs__discord__*.json (4) + catalog/descriptors/opentabs__reddit__*.json (3) -- 7 emitted descriptors, all backing:'dom'"
    - "tests/sensitive-write-import-gate.test.js (the END-TO-END sensitive-write-import proof on the REAL emitted opentabs__discord__send_message descriptor via the LIVE consent gate)"
  modified:
    - "vendor/opentabs-snapshot/PIN.md (Phase-38 batch B sub-batch 2 row -- completes comms/social/content)"
    - "extension/catalog/recipe-index.generated.js (snapshot regenerated 87->94 opentabs descriptors; INV-01 IIFE/djb2 byte-stable: 364 insertions / 0 deletions)"
    - "catalog/descriptors/_fixtures/{_provenance.json,seed-descriptors.json} (importer-fed, NOT hand-edited)"
    - "catalog/descriptors/_fixtures/intent-cases.json (+7 discord/reddit cases; retargeted 1 stale fixture -- see Deviations)"
    - "tests/breadth-search-return.test.js (widen corpusFiles regex to (discord|reddit) + floor 87->94; +4 collision probes: discord-vs-slack messaging + discord read/write split + reddit content reads)"
    - "package.json (register tests/sensitive-write-import-gate.test.js after tests/dom-only-default.test.js)"

key-decisions:
  - "reddit vendored at the APEX *://reddit.com/* (NOT the plan's-also-acceptable STEM_OVERRIDES route): the apex derives the stem 'reddit' through the FROZEN host-derivation with ZERO machinery edit -- genuinely data-only -- and reddit.com classifies benign-safe (verified classify('https://reddit.com')={sensitive:false,denied:false}), so the classifyGate passes a safe origin and reads run under Auto. www.reddit.com would derive 'www' (wrong); the apex avoids both the wrong stem AND a STEM_OVERRIDES edit."
  - "reddit imported READ-ONLY (the safe content tier per CONTEXT): the slice carries ONLY list_subreddit_posts/get_post/search_posts and NO write op (submit/comment/vote out of scope). The SECURITY INVARIANT holds -- since reddit emits zero write ops, reddit.com staying SAFE is correct (no social/messaging WRITE runs under Auto ungated). discord IS the write-bearing app and discord.com is sensitive -> its writes are posture-B gated."
  - "the END-TO-END proof loads the REAL emitted descriptor FROM DISK and reads its sideEffectClass from the loaded JSON (not a hardcoded literal): the entry.descriptor.sideEffectClass driven into the gate is the genuinely-emitted 'write' class, so the proof exercises the descriptor that actually ships -- the headline T-38-01 mitigation proven on a shipped artifact, not a hand-built call."

patterns-established:
  - "End-to-end-on-a-shipped-descriptor consent proof: load the REAL emitted descriptor JSON from disk + the COMMITTED denylist roster (await Denylist.load()) + the live FsbConsentGate, drive the descriptor's REAL sideEffectClass into the gate, and assert the posture-B write-gating (read allow / write RECIPE_CONSENT_MUTATING_REQUIRED dual-field / flag elevates) -- Phase 39 commerce/travel inherits this for its sensitive writes"

requirements-completed: [BRDTH-01, BRDTH-02, BRDTH-03]

# Metrics
duration: 20min
completed: 2026-06-25
---

# Phase 38 Plan 03: Discord + Reddit (messaging + content-reads) + End-to-End Sensitive-Write-Import Proof Summary

**Discord (4 ops, the sensitive messaging write) + reddit (3 read-only content ops, the safe tier) imported DOM-only via the frozen machinery — COMPLETING the comms/social/content category — and the headline sensitive-write screening proven END-TO-END on the REAL emitted opentabs__discord__send_message descriptor through the live posture-B consent gate (read allows, write → RECIPE_CONSENT_MUTATING_REQUIRED, flag elevates).**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-25T10:00:00Z (approx)
- **Completed:** 2026-06-25T10:21:00Z
- **Tasks:** 3
- **Files modified:** 30 (across 3 atomic commits)

## Accomplishments

- **Completed the comms/social/content category (BRDTH-01):** discord (messaging) + reddit (content reads) imported via the FROZEN importer with ZERO machinery edit — `enumerateBatchApps` auto-discovered both dirs and emitted 7 descriptors (87→94), all `backing:'dom'` (DOM-only, invocable=false, discovery-pending — never a confident invocable hit, never learn-seeded).
- **Proved the screen-then-import contract held (BRDTH-02):** the merge-time `classifyGate` PASSED only because the origins were screened — discord.com sensitive (38-01/Phase-35) + reddit.com benign-safe both governed; no unclassified origin shipped.
- **Proved the headline sensitive-write mitigation END-TO-END on a SHIPPED descriptor (T-38-01):** `tests/sensitive-write-import-gate.test.js` loads the REAL emitted `opentabs__discord__send_message.json` from disk and routes it through the LIVE consent gate over the COMMITTED roster — the read (`list_messages`) allows under Auto, the write (`send_message`) without the per-origin mutating flag returns `RECIPE_CONSENT_MUTATING_REQUIRED` (code/errorCode/error all byte-exact, INV-03), and `setOriginMutating(true)` elevates the write to allow. The descriptor's REAL `sideEffectClass` is read from the loaded JSON, so the proof exercises the genuinely-emitted class.
- **No regression:** `reddit-inbox.json` (slug `reddit.inbox`, backing `recipe`) is NOT clobbered (opentabs__reddit__* is a distinct filename/slug); the snapshot regenerated INV-01 byte-stable (364 insertions / 0 deletions — IIFE/djb2 untouched); crosscheck + no-dead-entry + the eval all green over the complete category; `validate:extension` exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Vendor the discord + reddit metadata slices** — `c96a14a6` (feat)
2. **Task 2: Import discord + reddit, regenerate the snapshot, re-assert the per-wave gates** — `afcf7645` (feat)
3. **Task 3: End-to-end sensitive-write-import proof on the REAL emitted discord descriptor + register in CI** — `dfddbc01` (feat)

## Files Created/Modified

- `vendor/opentabs-snapshot/plugins/discord/**` — discord metadata slice (package.json host `*://discord.com/*`, verbatim sdk-stub, inert discord-api `api`/`apiVoid` throwers, index + 4 tools: list_channels/list_messages reads, send_message `api {method:'POST'}` write, delete_message `apiVoid {method:'DELETE'}` destructive)
- `vendor/opentabs-snapshot/plugins/reddit/**` — reddit metadata slice (package.json host `*://reddit.com/*` apex, verbatim sdk-stub, inert reddit-api `api`-only thrower — NO apiVoid, index + 3 read tools: list_subreddit_posts/get_post/search_posts all `api {method:'GET'}`)
- `catalog/descriptors/opentabs__discord__*.json` (4) + `catalog/descriptors/opentabs__reddit__*.json` (3) — emitted descriptors, all `backing:'dom'`; send_message class write, delete_message destructive, reddit reads read
- `tests/sensitive-write-import-gate.test.js` — the END-TO-END proof (16 checks, all pass)
- `vendor/opentabs-snapshot/PIN.md` — Phase-38 batch B sub-batch 2 row
- `extension/catalog/recipe-index.generated.js` — snapshot regenerated (94 opentabs descriptors; INV-01 byte-stable)
- `catalog/descriptors/_fixtures/{_provenance.json,seed-descriptors.json}` — importer-fed (NOT hand-edited)
- `catalog/descriptors/_fixtures/intent-cases.json` — +7 discord/reddit cases; 1 stale fixture retargeted (see Deviations)
- `tests/breadth-search-return.test.js` — corpus regex/floor widened + 4 collision probes
- `package.json` — registered the new test in the `test` chain

## Decisions Made

- **reddit at the apex `*://reddit.com/*`:** derives the stem `reddit` through the frozen host-derivation (www.reddit.com would derive `www`) AND classifies benign-safe — genuinely data-only, NO STEM_OVERRIDES edit, the classifyGate passes the safe origin, reads run under Auto.
- **reddit imported read-only:** the safe content tier per CONTEXT — no write op (submit/comment/vote out of scope). The security invariant holds: reddit emits zero write ops, so reddit.com staying SAFE is correct (no ungated social/messaging WRITE under Auto). discord is the write-bearing app and discord.com is sensitive → writes posture-B gated.
- **The proof reads the descriptor's real `sideEffectClass` from the loaded JSON** (not a hardcoded literal) so it exercises the genuinely-emitted class on the descriptor that actually ships.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Retargeted a stale `discord.send-message` intent-case fixture to the real emitted `discord.send_message` slug**
- **Found during:** Task 2 (running the capability-search-eval gate after the import)
- **Issue:** A PRE-EXISTING Phase-28-era seed fixture in `intent-cases.json` — `{ "intent": "send a message on discord", "expectedSlug": "discord.send-message" }` (hyphenated `discord.send-message`, a hand-authored near-neighbor seed in `seed-descriptors.json` + `seed-recipes.json`) — broke the eval's NON-NEGOTIABLE wrong-invoke=0 gate (0.000 → 0.006, 1/154). My Task-2 import created a REAL `discord.send_message` (underscore) descriptor; the query "send a message on discord" now correctly tops the real shipped descriptor rather than the legacy hyphenated seed, so the stale fixture's expectation was contradicted by reality.
- **Fix:** Changed ONLY that one fixture's `expectedSlug` from `discord.send-message` to the real emitted `discord.send_message`. The legacy `discord.send-message` seed is LEFT intact as a deliberate near-neighbor (its other two fixtures — "post in the discord channel" / "ping everyone in my discord server" — are its own verbatim synonyms and still top it; the +1 new fixture "send a discord message" → discord.send_message also routes correctly). No seed file was edited or deleted (that would be Rule-4 architectural).
- **Files modified:** `catalog/descriptors/_fixtures/intent-cases.json`
- **Verification:** `node tests/capability-search-eval.test.js` → recall@5=1.000, wrong-invoke=0.000 over 154 fixtures.
- **Committed in:** `afcf7645` (Task 2 commit)

**2. [Rule 1 - Bug] Replaced a poorly-chosen reddit collision probe in my own new test additions**
- **Found during:** Task 2 (running breadth-search-return after adding the new collision probes)
- **Issue:** My first-draft reddit collision probe `"look something up across reddit posts"` topped `reddit.get_post` instead of `reddit.search_posts` (wrong-invoke), because "look up" is a get-style verb that collides with get_post's intent. This was a defect in a probe I was adding in this same task, not a corpus defect.
- **Fix:** Replaced the probe with `"search reddit posts for a keyword"` — the "search ... for a keyword" intent token unambiguously routes to search_posts (get_post's verbs are get/look-up/fetch/read), and it is NOT a verbatim synonym (held-out paraphrase, satisfying the test's MED-01 discipline).
- **Files modified:** `tests/breadth-search-return.test.js`
- **Verification:** `node tests/breadth-search-return.test.js` → recall@5=1.000, wrong-invoke=0.000 over 94 ops / 34 collision probes.
- **Committed in:** `afcf7645` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule-1 bugs). Both are small, scope-bounded corrections directly caused by this plan's import (a stale legacy fixture out-competed by the real descriptor; a self-introduced weak probe). No machinery edit, no seed hand-edit, no scope creep. The legacy `discord.send-message` near-neighbor seed was preserved (non-destructive).

## Issues Encountered

None beyond the two Rule-1 deviations above. The frozen importer, classifyGate, snapshot regen, and posture-B gate all behaved exactly as designed; reddit's apex-host stem derivation and discord's write/destructive classification were verified before the import commit.

## Security Verification (the headline)

- **T-38-01 (Elevation of Privilege — the headline):** the REAL shipped `opentabs__discord__send_message` descriptor (service discord.com, sideEffectClass write, backing dom) is posture-B write-gated through the LIVE consent gate — proven on the descriptor that actually ships (Task 3), not just the 38-01 hand-built call. ✓
- **T-38-07 (under-statement):** `verify-catalog-crosscheck.mjs` PASS (94 descriptors, no under-statement) — discord.send_message write, discord.delete_message destructive, reddit reads read; the emitted sideEffectClass drives the consent re-gate. ✓
- **T-38-08 (clobber):** `reddit-inbox.json` (backing recipe) is untouched post-import (distinct slug/filename). ✓
- **T-38-03/T-38-04 (DOM-only + Wall-1):** every emitted descriptor is backing:'dom' (DOM-only); the recursive forbidden-field pre-scan + recipe-path-guard stay green via validate:extension; no DENY-01 app vendored. ✓
- **Security invariant (no social/messaging WRITE under Auto ungated):** discord writes are posture-B gated (discord.com sensitive); reddit emits ZERO write ops so reddit.com staying SAFE is correct. ✓

## Next Phase Readiness

- **Phase 38 is COMPLETE (all 3 plans done):** 38-01 (screening) + 38-02 (AI-chat/microblog) + 38-03 (messaging/content + the end-to-end proof) → the comms/social/content category is fully screened-and-imported. Ready for phase verification.
- **Phase 39 (commerce/travel/misc, most-sensitive) inherits** the same screen-then-import contract AND the end-to-end-on-a-shipped-descriptor consent-proof pattern for its sensitive writes.
- No blockers.

## Self-Check: PASSED

- Created files verified on disk: discord/reddit slices, opentabs__discord__send_message.json, opentabs__reddit__list_subreddit_posts.json, tests/sensitive-write-import-gate.test.js, this SUMMARY.
- Task commits verified in git log: c96a14a6, afcf7645, dfddbc01.
- Full-corpus gate sweep green: validate:extension (exit 0) + breadth-search-return + no-dead-entry + catalog-crosscheck + capability-search-eval + backing-status-annotation + consent-mutation-gate + sensitive-write-import-gate + breadth-batch-gate + dom-only-default + service-denylist + provenance-scaffold + classification-gate.

---
*Phase: 38-breadth-b-comms-social-content-sensitivity-screened*
*Completed: 2026-06-25*
