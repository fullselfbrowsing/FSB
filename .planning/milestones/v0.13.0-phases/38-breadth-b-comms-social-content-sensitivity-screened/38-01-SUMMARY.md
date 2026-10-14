---
phase: 38-breadth-b-comms-social-content-sensitivity-screened
plan: 01
subsystem: testing
tags: [denylist, classification-gate, posture-b, consent-gate, dom-only, sensitivity-screening, opentabs, comms-social]

# Dependency graph
requires:
  - phase: 35-denylist-expansion-and-import-time-classification-gate
    provides: "service-denylist.json + classify(); verify-classification-gate.mjs classifyGate (fail-closed merge gate); _evaluateConsent posture-B step-(3.5) sensitive-write re-gate (DENY-04)"
  - phase: 37-breadth-a-dev-productivity-least-sensitive
    provides: "the FROZEN breadth machinery -- import-opentabs-catalog.mjs backingFor()='dom' default + enumerateBatchApps + classifyGate merge-gate; capability-search.js backing/invocable/backingStatus annotation; breadth-batch-gate + backing-status-annotation test patterns"
provides:
  - "service-denylist.json EXTENDED: chatgpt.com, claude.ai, bsky.app, mastodon.social, www.threads.net classified sensitive (exact-host, conservative default; reads under Auto, writes posture-B re-gated) -- the comms/social/content batch is screened BEFORE plans 02/03 import"
  - "docs/LEGAL.md Categorization Axes EXTENDED: the per-app comms/social/content classification (AI-chat + microblog/fediverse sensitive; reddit-reads safe; DENY-01 denied; DOM-only conservative-backing default) named + defensible against the three axes"
  - "batch-unclassified-social-origin.fixture.json: a social/messaging origin (messenger.acme-social.example) that trips the social/messaging axis but is unclassified -> classifyGate aborts (the BRDTH-02 fail-closed proof for the social axis)"
  - "the THREE screening security properties proven in CI: fail-closed merge gate on an unclassified social origin (BRDTH-02); posture-B sensitive-write re-gate on discord.com via the LIVE committed roster (write-sensitivity); conservative DOM-only default via the frozen backing:'dom' (BRDTH-03), with NO importer machinery edit"
affects: [38-02, 38-03, 39-breadth-c-commerce-travel-misc]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conservative-default screening: an AI-chat / social-write origin that does NOT trip the classifyGate host-heuristic is classified SENSITIVE explicitly in service-denylist.json (fail-safe toward LESS reach), never left to the heuristic"
    - "Live-roster gate proof: a sensitive-write re-gate test loads the REAL committed denylist (require service-denylist.js + Denylist.load(), assign to globalThis.FsbServiceDenylist, assert classify().sensitive===true) BEFORE the gate calls -- proving the landed classification, not a fabricated stub verdict"
    - "DOM-only-by-default guarantee: the frozen backingFor() returns 'dom' for every data-batch app, so capability-search annotates an imported comms/social descriptor invocable=false / discovery-pending with ZERO machinery edit"

key-files:
  created:
    - "catalog/descriptors/_fixtures/batch-unclassified-social-origin.fixture.json -- the social-axis fail-closed gate fixture (excluded from the shipped catalog by readJsonDir non-recursion)"
    - "tests/dom-only-default.test.js -- the BRDTH-03 conservative DOM-only-default proof (backing:'dom' -> invocable=false / discovery-pending)"
  modified:
    - "extension/config/service-denylist.json -- +5 comms/social sensitive origins (exact-host) + _comment Phase-38 note"
    - "docs/LEGAL.md -- Categorization Axes (axis 3) extended with the comms/social/content classification"
    - "tests/breadth-batch-gate.test.js -- blocks (c) unclassified-social aborts + (d) screened chatgpt/claude/discord passes"
    - "tests/consent-mutation-gate.test.js -- discord.com posture-B re-gate block via the LIVE committed roster"
    - "tests/service-denylist.test.js -- the 5 new origins added to the sensitive-roster proof (kept in sync with the classification)"
    - "package.json -- registered tests/dom-only-default.test.js in the test chain"

key-decisions:
  - "AI-chat (chatgpt.com, claude.ai) + microblog/fediverse (bsky.app, mastodon.social, www.threads.net) classified SENSITIVE (not safe, not denied): the conservative default for the category. The classifyGate host-heuristic does NOT flag these hosts (verified: suspect=false for each), so they are classified EXPLICITLY -- the heuristic is a backstop, not the screening."
  - "Exact-host pattern form for all 5 new origins (no '*.' broadening), mirroring the Phase-35 exact-host discipline -- each pattern is no broader than the app's own origin (T-38-05 mitigated)."
  - "reddit content-reads left SAFE (unclassified): reddit.com does not trip the heuristic and reads run normally -- the correct outcome for the content-read tier. The DENY-01 set (netflix/spotify/twitch/steam/youtube-music/tinder/onlyfans) stays DENIED, unchanged."
  - "Discord posture-B proof uses the LIVE committed roster (not the stubbed classify() blocks): require service-denylist.js + Denylist.load() + assert classify('https://discord.com').sensitive===true before the gate calls, mirroring the breadth-batch-gate live-roster pattern -- so the proof exercises the real classification, not a tautology (the corrected Task 2c)."
  - "ZERO importer machinery edit: the frozen backingFor() already stamps backing:'dom' for every data-batch app, so DOM-only routing is the default. This plan is denylist + doc + tests only (CONTEXT discretion: prefer a metadata-driven marker over a machinery edit -> here no edit needed at all)."

patterns-established:
  - "Per-batch sensitivity screening lands as plan 01 BEFORE the import plans (02/03), so the merge-time classifyGate has zero unclassified origins to abort on -- the per-app screening enforced as a build precondition."
  - "A fail-closed gate proof pairs a deliberately-unclassified fixture (the build-aborts case) with a screened real-batch assertion (the build-passes case), distinct per sensitivity axis (finance fixture in Phase 37, social fixture here)."

requirements-completed: [BRDTH-02, BRDTH-03]

# Metrics
duration: 8min
completed: 2026-06-25
---

# Phase 38 Plan 01: Comms / Social / Content Sensitivity Screening Summary

**Classified the Phase-38 comms/social/content batch origins (chatgpt/claude/bluesky/mastodon/threads sensitive via exact-host; reddit safe; DENY-01 denied) in service-denylist.json + extended the docs/LEGAL.md axes, and proved the three screening security properties -- fail-closed merge gate on an unclassified social origin, the posture-B sensitive-write re-gate on discord.com via the LIVE committed roster, and the conservative DOM-only default via the frozen backing:'dom' -- all in CI, with NO importer machinery edit.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-25T09:22:28Z
- **Completed:** 2026-06-25T09:30:13Z
- **Tasks:** 2
- **Files modified:** 8 (6 modified, 2 created)

## Accomplishments
- **The screening (BRDTH-02):** chatgpt.com, claude.ai, bsky.app, mastodon.social, www.threads.net added to `sensitiveOrigins` (exact-host, conservative default; reads under Auto, writes mutating-gated by posture B). discord.com already sensitive (Phase 35); the DENY-01 denied set unchanged; reddit content-reads stay safe. The merge-time classifyGate now has zero unclassified comms/social origins to abort on -> plans 02/03 can import.
- **The doc:** `docs/LEGAL.md` Categorization Axes (axis 3) extended to name the AI-chat + microblog/fediverse sensitive classification, the reddit-reads-safe + DENY-01-denied distinction, and the DOM-only conservative-backing default -- defensible against the three axes (finance/gov denial vs ToS-hostility denial vs sensitivity).
- **Fail-closed proof (BRDTH-02):** a new `batch-unclassified-social-origin.fixture.json` (messenger.acme-social.example) trips the social/messaging axis but is unclassified -> `classifyGate` returns failures>0 naming the origin + the social/messaging axis (the build aborts); the screened chatgpt/claude/discord batch passes (failures===0).
- **Sensitive-write re-gate proof (write-sensitivity):** a discord.com block in consent-mutation-gate using the LIVE committed roster -- a READ allows under Auto; a WRITE without the per-origin mutating flag -> `RECIPE_CONSENT_MUTATING_REQUIRED` (dual-field code/errorCode/error byte-exact, INV-03); `setOriginMutating('https://discord.com', true)` elevates the write to allow.
- **Conservative DOM-only-default proof (BRDTH-03):** a new `dom-only-default.test.js` -- a backing:'dom' comms/social descriptor returns from search invocable=false / backingStatus='discovery-pending' (never a confident invocable hit, never learn-seeded), guaranteed by the frozen `backingFor()` default with NO machinery edit.
- **Regression clean:** service-denylist + classification-gate + backing-status-annotation tests green; `npm run validate:extension` exits 0 (78 corpus + 23 roster origins all classified or benign).

## Task Commits

Each task was committed atomically:

1. **Task 1: Classify the comms/social/content batch origins + extend the LEGAL Categorization Axes** - `5233bf7f` (feat)
2. **Task 2: Fail-closed gate proof + sensitive-write re-gate proof + DOM-only-default proof** - `3576c122` (feat)

**Plan metadata:** see the final docs commit (this SUMMARY + STATE.md + ROADMAP.md + REQUIREMENTS.md).

## Files Created/Modified
- `extension/config/service-denylist.json` - +5 comms/social exact-host sensitive origins; `_comment` records the Phase-38 screening.
- `docs/LEGAL.md` - Categorization Axes (axis 3) extended with the comms/social/content classification + the DOM-only conservative default.
- `catalog/descriptors/_fixtures/batch-unclassified-social-origin.fixture.json` (new) - the social-axis unclassified gate fixture.
- `tests/breadth-batch-gate.test.js` - blocks (c) unclassified-social aborts + (d) screened comms/social batch passes.
- `tests/consent-mutation-gate.test.js` - discord.com posture-B re-gate block via the LIVE committed roster.
- `tests/dom-only-default.test.js` (new) - the BRDTH-03 conservative DOM-only-default proof.
- `tests/service-denylist.test.js` - the 5 new origins added to the sensitive-roster proof.
- `package.json` - registered `tests/dom-only-default.test.js` in the test chain.

## Decisions Made
- **Conservative-default classification over heuristic reliance:** the AI-chat + microblog hosts do NOT trip the classifyGate host-heuristic (verified suspect=false), so they are classified explicitly as sensitive rather than hoping the heuristic catches them -- fail-safe toward less reach. Rationale: a mis-classification that read as "safe" would make a social/messaging app writable-under-Auto (the headline T-38-01 threat).
- **Exact-host form** for all 5 new origins, no `*.` broadening (Phase-35 discipline; T-38-05).
- **reddit safe, DENY-01 denied** -- unchanged from the routing framework; reddit content-reads run normally, the ToS-hostile media/social set is never imported.
- **Live-roster discord proof (corrected Task 2c):** loads the real committed denylist and asserts classify(discord).sensitive===true before the gate calls, so the proof exercises the classification this plan landed (not a stubbed verdict). The stripe.com/github.com canaries + the MD-01 throwing-classify block stay unchanged.
- **No importer machinery edit:** DOM-only routing is already the frozen default; this plan is denylist + doc + tests only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Kept the sensitive-roster proof in sync with the new classification**
- **Found during:** Task 2 (the proofs)
- **Issue:** `tests/service-denylist.test.js` asserts a hardcoded `sensitiveRoster` list of every sensitive origin; landing 5 new sensitive origins in Task 1 without adding them to that proof would leave the roster test silently NOT proving the new classifications (a correctness gap -- the test would pass while no longer covering the origins this plan exists to classify). `service-denylist.test.js` is not in either task's `<files>` list.
- **Fix:** Added the 5 new exact-host origins (chatgpt.com, claude.ai, bsky.app, mastodon.social, www.threads.net) to the `sensitiveRoster` array with a Phase-38 comment, so each is asserted `{ sensitive:true, denied:false }`.
- **Files modified:** tests/service-denylist.test.js
- **Verification:** `node tests/service-denylist.test.js` -> PASS=55 FAIL=0 (was 50/0; +5 new assertions). The existing exact-host negative controls (api.stripe.com, www.youtube.com) and the github.com benign control still pass.
- **Committed in:** 3576c122 (Task 2 commit)

**2. [Rule 1 - Bug] Corrected the dom-only-default sideEffectClass assertion to the normalized write-family value**
- **Found during:** Task 2 (dom-only-default test)
- **Issue:** the test first asserted the search hit's `sideEffectClass === 'write'`, but `capability-search.js normalizeSideEffectClass('write')` canonicalizes 'write' to 'mutate' -- so the assertion red-failed (5/1) even though the substantive invocable=false guarantee held.
- **Fix:** assert on the canonical write-family value `'mutate'` (with a comment explaining the normalization), preserving the intent (a WRITE-family comms/social op stays non-invocable).
- **Files modified:** tests/dom-only-default.test.js (pre-commit; the committed test is green)
- **Verification:** `node tests/dom-only-default.test.js` -> 6 passed, 0 failed.
- **Committed in:** 3576c122 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 missing-critical test-sync, 1 self-introduced assertion bug fixed before commit)
**Impact on plan:** Both necessary for a correct, complete proof. No scope creep -- no production code changed beyond the planned denylist JSON; the importer machinery stayed frozen as the plan requires.

## Issues Encountered
None beyond the deviations above. The frozen consent-gate (`_evaluateConsent` reads the live `FsbServiceDenylist` at call time) and the frozen search annotation (`isInvocableBacking` true IFF handler/recipe) behaved exactly as the interfaces documented, so the live-roster discord proof and the DOM-only proof worked against the real code without any machinery change.

## User Setup Required
None - no external service configuration required. Phase 38 adds NO new packages (denylist JSON + doc + test edits only); the package-legitimacy gate is N/A this plan (threat T-38-SC accepted).

## Next Phase Readiness
- **38-02 / 38-03 unblocked:** every comms/social/content batch origin is now classified, so the merge-time classifyGate the import plans run has zero unclassified social/messaging origins to abort on. The AI-chat + microblog/fediverse sub-batch (chatgpt/claude/bluesky/mastodon/threads) can be imported DOM-only via the frozen importer.
- **The three security properties are CI-enforced:** fail-closed merge gate (BRDTH-02), posture-B sensitive-write re-gate on a real screened origin (write-sensitivity), conservative DOM-only default (BRDTH-03) -- so an imported comms/social app cannot become writable-under-Auto by landing unscreened, nor surface as a confident invocable hit.
- **No blockers or concerns.** No importer machinery was touched (frozen as required); `validate:extension` + the full breadth/consent/denylist suite are green.

## Self-Check: PASSED

---
*Phase: 38-breadth-b-comms-social-content-sensitivity-screened*
*Completed: 2026-06-25*
