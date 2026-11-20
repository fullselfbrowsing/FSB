---
phase: 41-depth-2-remaining-hand-ports-guarded-writes
plan: 03
subsystem: api
tags: [notion, guarded-writes, fail-closed, dom-fallback, rpc, capability-catalog]

requires:
  - phase: 41-01
    provides: the fail-closed harness + extended upgrade harness that turn GREEN as these slugs land
  - phase: 40-depth-1-hand-ports
    provides: catalog/handlers/notion.js (the READ module + typedRecipeError + buildRpcSpec + NOTION_ORIGIN + the self-registration loop)
provides:
  - notion.create_page / update_page / create_database_item guarded WRITE heads (T1a, https://www.notion.so, fail-closed)
affects: [41-04, 41-05]

tech-stack:
  added: []
  patterns:
    - "Guarded write on an RPC module: the write entries do NOT call buildRpcSpec (the read path's RPC builder) -- they fail closed before any RPC, so no submitTransaction op/body is built"

key-files:
  created: []
  modified:
    - catalog/handlers/notion.js
    - extension/catalog/handlers/notion.js

key-decisions:
  - "notion.append_block is sideEffectClass:'read' in its descriptor -> EXCLUDED from the write set; notion.create_database_item (verified write) is used as the 3rd write to keep 3 genuine writes (per the plan's explicit substitution)"
  - "extension/catalog/handlers/notion.js kept byte-identical (the capability-head-handlers byte-match + the package-extension sync target)"

patterns-established: []

requirements-completed: []

duration: 3min
completed: 2026-06-26
---

# Phase 41 Plan 03: Notion Guarded Writes Summary

**3 fail-closed Notion write heads (create_page / update_page / create_database_item) on https://www.notion.so, each returning RECIPE_DOM_FALLBACK_PENDING with an empty executeBoundSpec recorder and upgrading its opentabs write descriptor dom->T1a; append_block correctly stays a READ.**

## Performance

- **Duration:** ~3 min
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- 3 guarded notion write heads appended to the existing READ module, each fail-closed (no buildRpcSpec, no executeBoundSpec), closed params (additionalProperties:false) mirrored exactly from the opentabs__notion__create_page/update_page/create_database_item.json descriptors, [ASSUMED-ENDPOINT] markers.
- Each slug upgrades its breadth write descriptor dom->T1a (slug-exact); descriptor.sideEffectClass === 'write'. Head cap unchanged (4 modules).
- append_block stays a READ (its descriptor is sideEffectClass:'read'); create_database_item is the genuine write substituted in (the plan's explicit decision).

## Task Commits

1. **Task 1: append the 3 guarded notion write heads** - `19bf3963` (feat) — handler edit + byte-identical extension mirror.

## Files Created/Modified
- `catalog/handlers/notion.js` - +3 fail-closed write entries + 3 closed params schemas + docblock note
- `extension/catalog/handlers/notion.js` - byte-identical mirror

## Decisions Made
- append_block excluded (read descriptor); create_database_item used as the 3rd write — per the plan's explicit substitution note.

## Deviations from Plan
None - plan executed exactly as written.

## Verification
- `node tests/guarded-write-failclosed.test.js` — the 3 notion write rows GREEN (15/15 assertions; recorder EMPTY each).
- `node tests/head-handler-upgrade.test.js` — notion.create_page/update_page/create_database_item resolve T1a + write class.
- `node tests/head-handler-cap.test.js` (4 modules) + `node tests/capability-head-handlers.test.js` + CORS-gate + path-guard — all GREEN.

## Next Phase Readiness
- 6 of the 7 guarded writes now land fail-closed (3 gitlab + 3 notion). slack.send_message + the SC2 proof + the UAT consolidation follow in 41-04.

---
*Phase: 41-depth-2-remaining-hand-ports-guarded-writes*
*Completed: 2026-06-26*
