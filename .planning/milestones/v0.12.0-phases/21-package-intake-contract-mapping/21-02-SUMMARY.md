---
phase: 21-package-intake-contract-mapping
plan: "02"
subsystem: package-surface
tags: [phantomstream, exports, esm, mv3, smoke-test]

requires:
  - phase: 21-package-intake-contract-mapping
    plans: ["01"]
    provides: exact npm package pin and provenance
provides:
  - installed package export smoke test
  - verified import path and symbol map
  - ESM import-time feasibility evidence for extension/capture/renderer/transport surfaces
affects: [phase-21, phantomstream, package-surface]

tech-stack:
  added: []
  patterns: [installed-package-export-smoke, surface-map-before-migration]

key-files:
  created:
    - tests/phantom-stream-exports.test.js
    - .planning/phases/21-package-intake-contract-mapping/21-PACKAGE-SURFACE.md
  modified: []

key-decisions:
  - "Later phases may plan against only the PhantomStream import paths verified in `tests/phantom-stream-exports.test.js` and `21-PACKAGE-SURFACE.md`."
  - "The package root is verified, but production migration should prefer subpath imports to keep capture, renderer, relay, transport, and adapter ownership clear."
  - "No package-surface blocker remains for Phases 22-24; behavioral parity remains a later-phase responsibility."

patterns-established:
  - "Use a Node dynamic-import smoke to prove package exports and import-time feasibility before production code imports a new browser-facing package."

requirements-completed: ["PKG-02", "PKG-03"]

duration: 4 min
completed: 2026-06-17
---

# Phase 21 Plan 02: Package Export Surface Summary

**PhantomStream's installed package exports are verified in code and mapped to the migration phases that may consume them.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-17T17:31:50Z
- **Completed:** 2026-06-17T17:35:12Z
- **Tasks:** 3
- **Files modified:** 2 task files plus this summary

## Accomplishments

- Added `tests/phantom-stream-exports.test.js`, which dynamically imports every expected package subpath from the installed npm package.
- Verified root, protocol, capture, renderer, relay, WebSocket transport, extension adapter, Playwright adapter, and bookmarklet adapter exports.
- Confirmed package `type: module` and import-time feasibility for extension, capture, renderer, and transport surfaces without CommonJS/Chrome/browser globals at module evaluation time.
- Created `21-PACKAGE-SURFACE.md` mapping verified import paths to Phases 22, 23, and 24.
- Recorded a no-blocker package-surface status for later migration planning.

## Task Commits

1. **Task 1: Build executable export smoke** - `c0726c6d` (`test`)
2. **Task 2: Check ESM and MV3-consumable constraints** - `c0726c6d` (`test`)
3. **Task 3: Record package surface map** - `b845c4b3` (`docs`)

## Files Created/Modified

- `tests/phantom-stream-exports.test.js` - installed export/import smoke with 121 assertions.
- `.planning/phases/21-package-intake-contract-mapping/21-PACKAGE-SURFACE.md` - verified import path, symbol, caveat, and migration-phase map.

## Decisions Made

- Phases 22-24 may plan against the verified subpaths only.
- If a later phase needs an unlisted subpath or symbol, it must extend the export smoke and surface map first.
- Import-time feasibility does not replace behavior parity, extension runtime tests, or browser UAT.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

None.

## User Setup Required

None.

## Gate Evidence

Executed successfully:

```bash
node tests/phantom-stream-exports.test.js
node --check tests/phantom-stream-exports.test.js
grep -n "@full-self-browsing/phantom-stream/capture\\|@full-self-browsing/phantom-stream/renderer\\|@full-self-browsing/phantom-stream/relay" .planning/phases/21-package-intake-contract-mapping/21-PACKAGE-SURFACE.md
node tests/phantom-stream-public-package.test.js && node tests/phantom-stream-exports.test.js
git diff --check
```

`node tests/phantom-stream-exports.test.js` passed 121 assertions.

## Next Phase Readiness

Ready for `21-03-PLAN.md`: create the FSB-to-PhantomStream stream contract map and close Phase 21.

## Self-Check: PASSED

- Every expected import path is covered by an executable smoke test.
- The package surface map references capture, renderer, relay, transport, protocol, and adapters.
- No production stream migration was attempted in Plan 21-02.

---
*Phase: 21-package-intake-contract-mapping*
*Completed: 2026-06-17*
