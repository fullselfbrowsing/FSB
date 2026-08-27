---
phase: 57-folder-reading-hud
plan: "04"
subsystem: ui-runtime
tags: [skopeo, hud, drive, docs, composer, lifecycle, citations, least-privilege]

requires:
  - phase: 57-01
    provides: Closed bounded HUD schema and deterministic folder/reading projector
  - phase: 57-03
    provides: Background-only projection and one-shot citation authority
  - phase: 54-permission-scoped-drive-corpus-boundary
    provides: Verified Drive/Docs entity lifecycle and the existing corpus region
provides:
  - Frozen deterministic folder, reading, and contract-closed content models
  - Exact verified-context routing with synchronous withdrawal and stale-result rejection
  - Distinct per-citation opaque action dispatch with pending and replay suppression
  - Classic content-world loading of the shared content-safe HUD schema
affects: [57-05-hud-shell, phase-58-cited-ask, folder-reading-ui]

tech-stack:
  added: []
  patterns:
    - Closed schema projection to deeply frozen content view model
    - Withdraw-before-await lifecycle with full post-await authority comparison
    - Content-minted opaque public identity token bound by the background controller

key-files:
  created:
    - .planning/phases/57-folder-reading-hud/57-04-SUMMARY.md
  modified:
    - extension/background.js
    - extension/content/skopeo-adaptive-composer.js
    - extension/content/skopeo-runtime.js
    - tests/skopeo-adaptive-composer.test.js
    - tests/skopeo-hud-runtime.test.js
    - tests/skopeo-corpus-runtime.test.js
    - tests/skopeo-browser-contract.test.js
    - tests/skopeo-catalog-runtime.test.js
    - tests/skopeo-sidepanel-command.test.js

key-decisions:
  - "Load the existing content-safe HUD schema before the classic composer and fail closed when it is absent; do not duplicate its parser in content code."
  - "Mint a contract-local opaque semantic entity token and bind it across projection and citation messages without exposing the Drive or Docs entity ID."
  - "Track pending and consumed citation state per action so an in-flight citation does not disable unrelated current-model citations."

patterns-established:
  - "Contract admission: only an exact current deep-pack folder/file/document tuple can request, compose, or render a Phase 57 projection."
  - "Contract replacement: revoke model, tokens, pending actions, and action epoch synchronously before every replacement or teardown."

requirements-completed: [VIEW-01, VIEW-03, VIEW-04, VIEW-05]

duration: 44min
completed: 2026-08-12
---

# Phase 57 Plan 04: Folder and Reading Content Runtime Summary

**Closed folder/reading models now flow from current background projections into one stale-safe content lifecycle with opaque, independently revocable citation actions.**

## Performance

- **Duration:** 44 min
- **Started:** 2026-08-12T18:51:19Z
- **Completed:** 2026-08-12T19:35:04Z
- **Tasks:** 3
- **Files modified:** 9 implementation/test files

## Accomplishments

- Added deterministic, deeply frozen `skopeo-contract-view/1` models for folder, reading, and admitted `contract-closed` projections, including exact copy, bounded ordering, local eight-row paging, typed dates, neutral later-phase slots, and distinct citation actions.
- Routed only exact verified supported Drive/Docs contexts through `skopeo:hud-projection`, withdrew stale state before every replacement, rejected late async completions, and kept unsupported, uncertain, or unsafe contexts on the inherited fail-quiet path.
- Added per-action pending and consumed state for `skopeo:hud-citation-open`, preserving independent citation controls while blocking duplicate effects and rechecking the full current tuple after every await.
- Loaded the existing shared HUD schema in the dynamic content stack before the composer and proved the classic-script path both consumes it and fails closed without it.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin content composition, lifecycle, and action boundaries in failing tests** - `d7f92428` (test)
2. **Task 2: Build the closed Folder and Reading contract view model** - `cdcc43b0` (feat)
3. **Task 3: Route current verified contexts through the existing runtime lifecycle** - `9aefcd4a` (feat)

## Files Created/Modified

- `extension/content/skopeo-adaptive-composer.js` - Validates the shared closed projection and composes exact folder, reading, blocker, paging, provenance, and action models.
- `extension/content/skopeo-runtime.js` - Owns three-row admission, projection currentness, synchronous withdrawal, opaque entity tokens, and per-citation dispatch state.
- `extension/background.js` - Injects the existing content-safe HUD schema immediately before the classic content composer.
- `tests/skopeo-adaptive-composer.test.js` - Covers exact models, copy, caps, ordering, uncertainty, forbidden controls, classic schema wiring, and controlled RED behavior.
- `tests/skopeo-hud-runtime.test.js` - Covers every admission row, stale races, withdraw-before-render, review-required reading, distinct actions, replay, drift, teardown, and raw-identity exclusion.
- `tests/skopeo-corpus-runtime.test.js` - Preserves the Phase 54 privilege boundary while recognizing the exact closed Phase 57 citation seams.
- `tests/skopeo-browser-contract.test.js` - Loads and verifies the HUD schema in the real classic-script production order.
- `tests/skopeo-catalog-runtime.test.js` - Pins the complete dynamic content bundle with the schema dependency.
- `tests/skopeo-sidepanel-command.test.js` - Pins command-driven injection of the updated ordered bundle.

## Decisions Made

- Reused `FsbSkopeoHudSchema.parseProjection` as the only projection parser in both background and content. The content composer returns `null` if that dependency is missing.
- Kept semantic entity identity opaque in the public HUD exchange by minting a contract-local `se1_*` token from already-public lifecycle counters rather than concatenating the raw Drive/Docs entity ID.
- Retained one callback for the shell but authorized it against the current frozen model's complete action-ID set, with independent pending and consumed sets per citation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Wired the shared HUD schema into the classic content stack**
- **Found during:** Task 3 integration verification
- **Issue:** Node tests resolved the schema through `require`, but the production dynamic injection list did not load `skopeo-hud-schema.js`; classic content composition would therefore always fail closed.
- **Fix:** Added the existing content-safe schema immediately before the composer and updated only exact bundle/order pins plus the real-browser fixture.
- **Files modified:** `extension/background.js`, `tests/skopeo-adaptive-composer.test.js`, `tests/skopeo-browser-contract.test.js`, `tests/skopeo-catalog-runtime.test.js`, `tests/skopeo-sidepanel-command.test.js`
- **Verification:** Classic VM composition, catalog completeness, command injection, storage boundary, and real Chrome browser contracts pass.
- **Committed in:** `9aefcd4a`

**2. [Rule 1 - Security Bug] Removed raw Drive/Docs identity from the public semantic token**
- **Found during:** Task 3 static security review
- **Issue:** The initial runtime derived `semanticEntityToken` as `kind:rawId`, which would echo a raw provider identity through the public projection and model.
- **Fix:** Minted and lifecycle-bound a local opaque token, reused it for citation dispatch, cleared it on every withdrawal, and added value-level no-raw-ID assertions.
- **Files modified:** `extension/content/skopeo-runtime.js`, `tests/skopeo-hud-runtime.test.js`
- **Verification:** HUD runtime, corpus runtime, and storage-boundary suites pass with explicit raw-ID exclusion assertions.
- **Committed in:** `9aefcd4a`

**3. [Rule 1 - Test Compatibility] Replaced a stale blanket Phase 54 future-feature ban**
- **Found during:** Task 3 corpus regression verification
- **Issue:** The Phase 54 test broadly banned all future `citation-open` text, so the now-authorized closed Phase 57 action and message failed despite preserving the original no-Drive/no-storage boundary.
- **Fix:** Kept exact bans on raw contract projection, alert delivery, URL/source/storage authority, and pinned exactly one closed composer action kind plus one HUD citation message family.
- **Files modified:** `tests/skopeo-corpus-runtime.test.js`
- **Verification:** `node tests/skopeo-corpus-runtime.test.js` and the storage-boundary verifier pass.
- **Committed in:** `9aefcd4a`

---

**Total deviations:** 3 auto-fixed (1 missing critical integration, 1 security bug, 1 stale compatibility assertion)
**Impact on plan:** All changes enforce the planned production path and least-privilege boundary; no duplicate parser, new dependency, manifest permission, or privileged content API was introduced.

## Issues Encountered

- A copied content-side schema fallback was briefly explored but failed the classic integration gate and would have duplicated validation logic. It was fully removed before commit in favor of the existing shared schema module.
- The worktree does not provide `rg`; equivalent narrow searches used `grep`/`find` without changing repository tooling.

## Verification

- Controlled Task 1 RED emitted each exact marker once before implementation; both flags now exit nonzero with zero RED markers because their interfaces are present.
- `node --check extension/background.js` - PASS
- `node --check extension/content/skopeo-adaptive-composer.js` - PASS
- `node --check extension/content/skopeo-runtime.js` - PASS
- `node tests/skopeo-hud-runtime.test.js` - PASS
- `node tests/skopeo-adaptive-composer.test.js` - PASS
- `node tests/skopeo-session-lifecycle.test.js` - PASS
- `node tests/skopeo-corpus-runtime.test.js` - PASS
- `node tests/skopeo-catalog-runtime.test.js` - PASS
- `node tests/skopeo-sidepanel-command.test.js` - PASS
- `node scripts/verify-skopeo-storage-boundary.mjs` - PASS (33 injected/dependency files)
- `node tests/skopeo-browser-contract.test.js` - PASS in local Google Chrome with all production-order, lifecycle, geometry, and zero-residue observations.
- `git diff --check` - PASS

## Known Stubs

None. `Not evaluated`, `Not available`, and the neutral memo/policy/notification slots are intentional closed Phase 57 states owned by later phases, not placeholder data.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 57-05 can implement `shell.renderContractView(model, onAction)` against the exact frozen model and action callback contract.
- The runtime already feature-detects that method, so the pre-57-05 build retains the existing corpus behavior without a detached DOM fallback.
- No blockers remain; live authorized Drive/Docs and accessibility evidence stays correctly owned by Plan 57-05's human UAT ledger.

## Self-Check: PASSED

- All nine implementation/test files and this summary exist.
- Task commits `d7f92428`, `cdcc43b0`, and `9aefcd4a` are present in history.
- Summary requirement metadata exactly lists VIEW-01, VIEW-03, VIEW-04, and VIEW-05; all four are already marked complete in `REQUIREMENTS.md`.

---
*Phase: 57-folder-reading-hud*
*Completed: 2026-08-12*
