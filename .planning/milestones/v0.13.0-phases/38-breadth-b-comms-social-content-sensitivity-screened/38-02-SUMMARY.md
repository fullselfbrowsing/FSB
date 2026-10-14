---
phase: 38-breadth-b-comms-social-content-sensitivity-screened
plan: 02
subsystem: catalog
tags: [opentabs, descriptors, breadth, dom-only, chatgpt, claude, bluesky, mastodon, threads, stem-overrides, classify-gate, capability-search]

# Dependency graph
requires:
  - phase: 38-01
    provides: "service-denylist.json classifications (chatgpt.com/claude.ai/bsky.app/mastodon.social/www.threads.net all sensitive) -- the merge-time classifyGate passes ONLY because these origins are screened; the conservative DOM-only-default proof"
  - phase: 37-01
    provides: "the frozen Phase-37 import machinery (enumerateBatchApps + STEM_OVERRIDES + synthSynonyms + backingFor='dom' + classifyGate-before-emit + feedSeedDescriptors); the breadth-search-return contract; the no-dead-entry generalized opentabs__* loader"
provides:
  - "17 DOM-only comms/social descriptors (chatgpt/claude AI-chat + bsky/mastodon/threads microblog) emitted via the frozen machinery, all backing:'dom' (invocable=false, discovery-pending), all on screened-sensitive origins"
  - "the threads origin/stem resolution: threads vendors *://www.threads.net/* (the EXACT origin 38-01 screened) + a STEM_OVERRIDES {threads:'threads'} data entry canonicalizes the slug to opentabs__threads__* (the host-derived 'www' would be wrong)"
  - "the screen-then-import ordering proof extended to the comms/social batch (the gate did NOT abort because 38-01 ran first)"
affects: [38-03, "phase 39 commerce/travel breadth", "phase 40-41 depth hand-ports", "phase 43 catalog-scale gate"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "STEM_OVERRIDES as the per-app slug-canonicalization extension point: a host whose first label is not the app name (www.threads.net->'www') gets a dir-name-keyed override -- the SAME designed mechanism cloudflare/datadog/jira/confluence use; a DATA-MAP extension, not a logic change (INV-01 holds)"
    - "screened-origin = gate-checked-origin: a sensitive app must vendor the EXACT urlPatterns host that 38-01 classified, so the emitted origin and the classifyGate origin are identical (the apex threads.net would emit UNscreened -> never used)"
    - "the conservative DOM-only default carries the whole comms/social category: backingFor()='dom' (frozen) -> every emitted descriptor is T3 / invocable=false, never a confident invocable hit, never learn-seeded"

key-files:
  created:
    - "vendor/opentabs-snapshot/plugins/chatgpt/** (3 ops: list_conversations/get_conversation + send_message)"
    - "vendor/opentabs-snapshot/plugins/claude/** (3 ops: list_conversations/get_conversation + send_message)"
    - "vendor/opentabs-snapshot/plugins/bluesky/** (4 ops: list_timeline/get_profile + create_post + delete_post; host/stem/slug bsky)"
    - "vendor/opentabs-snapshot/plugins/mastodon/** (4 ops: list_timeline/get_status + create_status + delete_status)"
    - "vendor/opentabs-snapshot/plugins/threads/** (3 ops: list_timeline/get_thread + create_thread; host www.threads.net, stem threads via override)"
    - "catalog/descriptors/opentabs__{chatgpt,claude,bsky,mastodon,threads}__*.json (17 emitted descriptors)"
  modified:
    - "scripts/import-opentabs-catalog.mjs (STEM_OVERRIDES: add threads:'threads' -- the ONLY machinery edit, a data-map entry)"
    - "vendor/opentabs-snapshot/PIN.md (Phase-38 batch B sub-batch 1 row)"
    - "extension/catalog/recipe-index.generated.js (snapshot regenerated 70->87 descriptors; INV-01 IIFE/djb2 byte-stable)"
    - "catalog/descriptors/_fixtures/{_provenance.json,seed-descriptors.json} (importer-fed)"
    - "catalog/descriptors/_fixtures/intent-cases.json (+20 read/write/destructive cases)"
    - "tests/breadth-search-return.test.js (widen corpusFiles regex + floor 87; +10 collision probes)"
    - "tests/capability-search-eval.test.js (CGEN-04 cold-start smoke budget 50KB->64KB)"

key-decisions:
  - "Applied the orchestrator's threads resolution: add threads:'threads' to STEM_OVERRIDES + vendor *://www.threads.net/* (NOT the plan-text's *://threads.net/* + no-override) -- the apex threads.net emits UNscreened (classify().sensitive=false) while www.threads.net is the EXACT origin 38-01 screened sensitive; the override canonicalizes the 'www'-derived stem to 'threads'"
  - "Widened the CGEN-04 cold-start smoke byte budget 50KB->64KB (plan-authorized): the seed grew 82->99 descriptors (51.8KB) at a FLAT ~536 bytes/descriptor (vs ~532 at 37-04) -- legitimate linear growth, NOT a layout regression (params remain schema-on-hit; storedFields are slug/service/description/sideEffectClass/backing only)"

patterns-established:
  - "STEM_OVERRIDES extension for screened-but-misnamed-host apps (threads): the per-app slug canonicalization that keeps a sensitive app's gate-checked origin == its emitted origin while giving the slug a clean brand stem"

requirements-completed: [BRDTH-01, BRDTH-03]

# Metrics
duration: 24min
completed: 2026-06-25
---

# Phase 38 Plan 02: AI-chat + Microblog Comms/Social Sub-batch (DOM-only, screened) Summary

**17 DOM-only comms/social descriptors (chatgpt/claude AI-chat + bsky/mastodon/threads microblog) imported via the frozen Phase-37 machinery on screened-sensitive origins; threads resolved by vendoring *://www.threads.net/* (the exact origin 38-01 screened) + a STEM_OVERRIDES data entry canonicalizing the 'www'-derived stem to opentabs__threads__*.**

## Performance

- **Duration:** ~24 min
- **Started:** 2026-06-25 (continuation after prior STOP on the threads origin/stem mismatch; orchestrator resolved)
- **Completed:** 2026-06-25
- **Tasks:** 2
- **Files modified/created:** 62 (5 vendored slices = ~39 files + 17 descriptors + importer/PIN + snapshot + provenance/seed/intent-cases + 2 tests)

## Accomplishments
- Vendored 5 hermetic metadata-only slices (Wall 1: no dist/, no executed handle()): chatgpt.com, claude.ai, bsky.app, mastodon.social, www.threads.net -- each with verbatim sdk-stub + inert transport stub + real z.object op inputs.
- Ran the FROZEN importer (only a STEM_OVERRIDES data entry added): enumerateBatchApps auto-discovered the 5 dirs and emitted 17 descriptors (70->87), every one backing:'dom'.
- **Security property proven:** the merge-time classifyGate PASSED (did NOT abort) BECAUSE 38-01 screened all 5 origins sensitive -- and every emitted descriptor's origin classifies sensitive (verified for chatgpt.com/claude.ai/bsky.app/mastodon.social AND www.threads.net). No unscreened sensitive origin shipped.
- **Threads resolution landed:** threads vendors *://www.threads.net/* (the exact screened origin) and the dir-name override {threads:'threads'} canonicalizes the slug to opentabs__threads__* (NOT opentabs__www__*; 0 www slugs in the snapshot) -- the same first-label-isn't-app-name canonicalization as cloudflare/datadog/jira/confluence.
- Regenerated the snapshot (INV-01 IIFE/djb2 byte-stable, only the DATA literal grew); validate:extension exits 0 (all four gates green over the grown corpus).
- Re-asserted the per-wave gates: crosscheck (87 descriptors, no under-statement -- send/create write, delete destructive), no-dead-entry (every new opentabs__ slug -> T3), eval (recall@5=1.000 wrong-invoke=0.000 over 147 fixtures), breadth-search-return (42/0 with +10 AI-chat/microblog collision probes), cold-start budget held.

## Task Commits

Each task was committed atomically:

1. **Task 1: Vendor the 5 metadata slices + threads STEM_OVERRIDE** - `926ec850` (feat)
2. **Task 2: Import the sub-batch DOM-only, regen snapshot, re-assert gates** - `dd96c346` (feat)

**Plan metadata:** (this commit) (docs: complete plan)

## Files Created/Modified
- `vendor/opentabs-snapshot/plugins/{chatgpt,claude,bluesky,mastodon,threads}/**` - 5 hermetic metadata slices (package.json + sdk-stub.ts + <app>-api.ts + index.ts + tools/*.ts)
- `scripts/import-opentabs-catalog.mjs` - add `threads:'threads'` to STEM_OVERRIDES (the only machinery edit; a data-map entry)
- `vendor/opentabs-snapshot/PIN.md` - Phase-38 batch B sub-batch 1 row
- `catalog/descriptors/opentabs__{chatgpt,claude,bsky,mastodon,threads}__*.json` - 17 emitted DOM-only descriptors
- `catalog/descriptors/_fixtures/{_provenance.json,seed-descriptors.json}` - importer-fed (seed 82->99)
- `catalog/descriptors/_fixtures/intent-cases.json` - +20 read/write/destructive cases for the new apps
- `extension/catalog/recipe-index.generated.js` - snapshot regenerated (70->87 descriptors; INV-01 stable)
- `tests/breadth-search-return.test.js` - widen corpusFiles regex + raise floor to 87; +10 collision probes
- `tests/capability-search-eval.test.js` - widen CGEN-04 cold-start smoke byte budget 50KB->64KB

## Decisions Made
- **Threads origin/stem (orchestrator-resolved, applied):** the PLAN.md text said to use `*://threads.net/*` and add NO STEM_OVERRIDES entry; the prior executor correctly STOPPED because that would emit `https://threads.net` (classify().sensitive=FALSE -- UNscreened), while `www.threads.net` (the host the plan also referenced for the apex deriving 'www') is what 38-01 actually classified sensitive. Per the orchestrator decision, threads vendors `*://www.threads.net/*` (so the gate-checked origin == the screened origin) and `STEM_OVERRIDES.threads='threads'` canonicalizes the 'www'-derived stem to the brand slug. Verified: `classify('https://www.threads.net').sensitive === true`; emitted threads descriptors' service = www.threads.net; 0 opentabs__www__* slugs. 38-01's classification was NOT changed.
- **Bluesky dir vs stem:** the vendored dir is `bluesky` but the host/stem/slug is `bsky` (host bsky.app -> stem bsky); the slug follows the HOST stem, so no override is needed (the importer derives the stem from package.json.opentabs.urlPatterns, not the dir name).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking, plan-authorized] Widened the CGEN-04 cold-start smoke byte budget 50KB -> 64KB**
- **Found during:** Task 2 (re-asserting the per-wave gates)
- **Issue:** The eval's CGEN-04 smoke assertion (`serialized index < 50KB`) tripped: the seed grew 82->99 descriptors as the comms/social sub-batch landed, pushing the serialized index 42.6KB -> 51.8KB.
- **Fix:** Confirmed this is LEGITIMATE linear growth at a FLAT per-descriptor footprint (~536 bytes/descriptor now vs ~532 at 37-04 -- an equal cost), NOT a layout regression: storedFields are {slug, service, description, sideEffectClass, backing} only, and the serialized index contains NO `additionalProperties` / `"required":[` (params remain schema-on-hit, never indexed/stored). Widened the byte gate to 64KB with a comment documenting the grown count + the flat footprint + that a params-leak regression would blow far past it (the full ~2,523-doc corpus at this flat rate is ~1.3MB, the Phase-43 scale gate's concern). The plan explicitly authorized this exact adjustment ("widen the assert budget with a comment noting the grown descriptor count -- do NOT change the data layout").
- **Files modified:** tests/capability-search-eval.test.js
- **Verification:** eval re-run -> recall@5=1.000, wrong-invoke=0.000 over 147 fixtures, smoke index 51.8KB < 64KB, 15/0.
- **Committed in:** `dd96c346` (Task 2 commit)

---

**Total deviations:** 1 (1 plan-authorized budget widen). The STEM_OVERRIDES threads entry + the *://www.threads.net/* host are NOT counted as deviations -- they are the orchestrator's explicit RESOLUTION of the threads origin/stem mismatch the prior run surfaced, applied as instructed.
**Impact on plan:** No scope creep. The budget widen is the documented, plan-sanctioned response to legitimate corpus growth; the data layout is unchanged. The threads resolution is a DATA-MAP extension (the per-app extension point 37-01 built), so INV-01 holds and the frozen-machinery spirit is preserved.

## Issues Encountered
- **Transient (unrelated) test flake:** in the full `npm test` chain, `tests/mcp-bridge-topology.test.js` failed once ("server-first topology: Relay handshake timed out" / "Promotion failed (port taken)") -- a WebSocket relay port-availability flake in the MCP-bridge subsystem, entirely unrelated to this plan's catalog/descriptor changes (grep confirms it references no opentabs/descriptor/capability-search/threads/bsky surface). It passes 18/0 when re-run in isolation. Out of scope per the executor scope boundary (pre-existing/unrelated -- not fixed). All phase-relevant tests pass.

## Known Stubs
None. All 17 emitted descriptors carry real z.object input schemas (non-empty `params.properties`) and real human descriptions; they are importer-fed into the searchable seed and resolve to a real T3 seam. backing:'dom' (DOM-only / discovery-pending) is the INTENDED, frozen conservative default for the comms/social category (depth hand-ports are Phases 40-41; discovery seeding is Phase 42) -- not a stub.

## User Setup Required
None - no external service configuration required (build-time data-only vendoring; zod/tsx already devDeps; no new packages).

## Next Phase Readiness
- 38-03 is UNBLOCKED: the messaging + content-read sub-batch (discord writes with the end-to-end sensitive-write proof on the real emitted discord descriptor, reddit content reads) can proceed. discord.com is already classified sensitive (Phase 35); reddit content-reads are SAFE.
- The screen-then-import ordering and the conservative DOM-only default are now proven for the AI-chat + microblog category; 38-03 inherits the same frozen flow.

## Self-Check: PASSED

All 13 sampled created files exist on disk (5 vendored slice index.ts + 7 representative descriptors incl threads/bsky/mastodon writes-destructives + the SUMMARY) and both task commits resolve in git (`926ec850`, `dd96c346`).

---
*Phase: 38-breadth-b-comms-social-content-sensitivity-screened*
*Completed: 2026-06-25*
