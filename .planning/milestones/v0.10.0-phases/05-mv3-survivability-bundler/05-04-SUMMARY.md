---
phase: 05-mv3-survivability-bundler
plan: 04
subsystem: offscreen-lattice-host
tags: [lattice, offscreen, mv3, esbuild, receipt-minting, retrospective-backfill]
requirements_completed:
  - FINT-04
dependency_graph:
  requires:
    - "Plan 05-01 esbuild bundler infrastructure"
    - "Plan 05-03 Lattice public-surface re-export"
  provides:
    - "Hybrid offscreen Lattice host source at extension/offscreen/lattice-host.html + lattice-host.js"
    - "Bundled ESM output at extension/dist/offscreen/lattice-host.js with zero runtime from \"lattice\" bare imports"
    - "chrome.runtime lattice-step-transition listener that replies with lattice-receipt-minted or lattice-receipt-mint-failed envelopes"
    - "Manifest web_accessible_resources entry for offscreen/lattice-host.html"
  affects:
    - "Phase 06 provider bridge offscreen execution"
    - "Phase 08 step.transition receipt mint bus"
tech_stack:
  added: []
  patterns:
    - "Hybrid MV3 offscreen page as the ESM host while background.js remains classic importScripts"
    - "Build-time Lattice bundling through esbuild rather than service-worker native ESM"
    - "Best-effort receipt mint reply bus via chrome.runtime.sendMessage"
key_files:
  created:
    - "extension/offscreen/lattice-host.html"
    - "extension/offscreen/lattice-host.js"
    - ".planning/phases/05-mv3-survivability-bundler/05-04-SUMMARY.md"
  modified:
    - "esbuild.config.js"
    - "extension/manifest.json"
    - "extension/dist/offscreen/lattice-host.js"
key_decisions:
  - "Preserved the classic background.js service worker and hosted Lattice in an offscreen ESM page."
  - "Kept SW-side production message sending deferred; this plan shipped the offscreen receiver and bundled Lattice surface."
  - "Preserved later UAT fix 65b00d75: lattice-host.html loads ../dist/offscreen/lattice-host.js instead of the original source file."
patterns-established:
  - "Offscreen document loads bundled extension/dist/offscreen/lattice-host.js for Chrome runtime compatibility."
  - "lattice-step-transition messages are validated and converted into best-effort Lattice checkpoint receipt events."
metrics:
  duration: retrospective-backfill
  completed: 2026-06-15
  implementation_commits: 1
---

# Phase 5 Plan 05-04 Summary: Hybrid Offscreen Lattice Host

Hybrid offscreen Lattice host shipped as the first in-extension Lattice consumption surface while keeping the MV3 service worker classic/importScripts-based.

## Performance

- **Duration:** retrospective backfill; implementation already existed
- **Started:** 2026-06-15T00:00:00Z
- **Completed:** 2026-06-15T00:00:00Z
- **Tasks:** 3 verified
- **Files modified:** 5 current artifacts verified

## Accomplishments

- Added `extension/offscreen/lattice-host.html` and `extension/offscreen/lattice-host.js`.
- Wired esbuild to bundle the host into `extension/dist/offscreen/lattice-host.js`.
- Added `offscreen/lattice-host.html` to `extension/manifest.json` web-accessible resources.
- Implemented the offscreen listener for `lattice-step-transition` envelopes and receipt-mint replies.
- Preserved `background.js`, `agent-loop.js`, and `tool-definitions.js` byte-freeze boundaries.

## Task Commits

Implementation was already present in history:

1. **Task 1-3: Hybrid offscreen Lattice host** - `8ab0c6df` (`feat(05-04)`)
2. **Later UAT fix: load bundled dist file from HTML** - `65b00d75` (`fix(offscreen)`)

**Plan metadata:** this summary is a retrospective backfill created because no `05-04-SUMMARY.md` existed on disk.

## Files Created/Modified

- `extension/offscreen/lattice-host.html` - 37 lines; offscreen page that now loads `../dist/offscreen/lattice-host.js`.
- `extension/offscreen/lattice-host.js` - 545 lines current source; Phase 05 host plus later provider bridge additions.
- `extension/dist/offscreen/lattice-host.js` - 250218 bytes current bundle; no unresolved `from "lattice"` import.
- `extension/manifest.json` - includes `offscreen/lattice-host.html` in the six-resource WAR array.
- `esbuild.config.js` - builds three entries including `offscreen-lattice-host`.

## Verification Results

| Check | Result |
|-------|--------|
| `npm run build` | PASS, 3 entries built, `[esbuild] done` |
| Source `from "lattice"` imports | 2 current source import blocks (Phase 05 + later provider factories) |
| Dist `from "lattice"` imports | 0 |
| Dist `createCheckpointHook` occurrences | 2 |
| Dist `lattice-step-transition` occurrences | 2 |
| Dist size | 250218 bytes |
| Manifest parse + WAR check | PASS, 6 resources including `offscreen/lattice-host.html` |
| INV-04 `setTimeout` count | PASS, 8 |
| Byte-frozen files diff (`background.js`, `agent-loop.js`, `tool-definitions.js`, `manifest.json`) | PASS, empty diff for protected files at current HEAD |
| MCP tool parity | PASS, 142 passed / 0 failed |
| Phase 1 smoke | PASS, 30 passed / 0 failed under public Lattice v1.3.0 |
| Phase 2 smoke | PASS, 39 passed / 0 failed |
| Phase 3 smoke | PASS, 72 passed / 0 failed |
| Phase 4 smoke | PASS, 47 passed / 0 failed |

## Decisions Made

- Used the offscreen document as the ESM boundary instead of migrating the MV3 service worker to modules.
- Kept SW-side emission deferred until later phases; Plan 05-04 only established the host and handler.
- Preserved the later dist-load correction from `65b00d75`; reverting to `src="lattice-host.js"` would reintroduce the original UAT issue.

## Deviations from Plan

### Retrospective Backfill

The implementation commits existed, but the summary artifact was missing. This summary records current verified state rather than rewriting already-shipped code.

### Later Evolution Preserved

The original plan expected `src="lattice-host.js"` in the HTML. Current correct runtime state uses `src="../dist/offscreen/lattice-host.js"` from `65b00d75`, and the source file includes later Phase 06 provider bridge imports. These are intentional follow-on changes and were not rolled back.

**Total deviations:** 2 documentation/backfill deviations.  
**Impact:** no source changes were required; the Phase 05 deliverable is present and later phases build on it.

## Issues Encountered

- `npm test` currently fails before the Lattice section during `npm --prefix mcp run build` with TypeScript parse errors at `mcp/src/tools/pricing.ts:39` for the JSON import-attribute syntax. This is outside Plan 05-04 scope and was not modified.

## User Setup Required

None.

## Next Phase Readiness

Plan 05-05 can consume the survivability adapter contract, and later phases can use the offscreen host as the Lattice runtime bridge. Current branch state already includes those follow-on integrations.

## Self-Check: PASSED

- FOUND: `extension/offscreen/lattice-host.html`
- FOUND: `extension/offscreen/lattice-host.js`
- FOUND: `extension/dist/offscreen/lattice-host.js`
- FOUND: `extension/manifest.json` WAR entry
- FOUND: implementation commit `8ab0c6df`
- VERIFIED: build and focused Lattice/MCP parity checks pass

---
*Phase: 05-mv3-survivability-bundler*
*Completed: 2026-06-15*
