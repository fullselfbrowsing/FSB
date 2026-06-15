---
phase: 06-fsb-engine-consumes-lattice-provider-abstraction
plan: 00
subsystem: testing
tags: [lattice, smoke, mv3, offscreen, chrome-runtime, scaffold, wave-0]

# Dependency graph
requires:
  - phase: 05-mv3-survivability-bundler
    provides: "lattice-survivability-smoke.test.js conventions (CJS, passAssert helpers, async IIFE, real await import('lattice'), chrome.* mocks, process.exit policy); package.json scripts.test chain trailing pattern"
  - phase: 04-fsb-side-provider-adapter-parity
    provides: "7 Lattice provider factory functions (createXaiProvider, createOpenAIProvider, createAnthropicProvider, createGeminiProvider, createOpenRouterProvider, createLmStudioProvider, createOpenAICompatibleProvider) reachable via `await import('lattice')` bare specifier"
provides:
  - "tests/lattice-provider-bridge-smoke.test.js -- per-task verification harness for Phase 6 downstream plans (06-01..06-05)"
  - "createChromeRuntimeMock + createChromeOffscreenMock + loadOffscreenHandlerSource helpers exported via module.exports for downstream require() reuse"
  - "6-Part placeholder structure with explicit downstream-Plan ownership markers (Part 2 -> Plan 06-01, Part 3 -> Plan 06-01+06-03, Part 4 -> Plan 06-01, Part 5 -> Plan 06-02+06-03+06-04, Part 6 -> Plan 06-05)"
  - "package.json scripts.test chain extended with the new smoke as the LAST entry; Phase 1-5 smokes BYTE-FROZEN"
affects: [06-01-message-bus-handler, 06-02-sw-startup-importscripts, 06-03-agent-loop-flag-gated-swap, 06-04-options-ui-rewrite, 06-05-inv-byte-freeze-verification, 06-06-phase-ceremony]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 placeholder smoke: PASS-when-empty placeholders so downstream plans can incrementally fill assertions without flipping the &&-chain red"
    - "chrome.runtime mock with Chrome 105+ rejection semantics (sendMessage rejects when no listener registered)"
    - "chrome.offscreen mock with createCount introspection (idempotency assertions for downstream Part 5 fills)"
    - "Helpers exported via module.exports at module bottom while IIFE always runs on direct invocation (simpler pattern -- downstream require() callers re-run their own `node tests/...` invocations)"

key-files:
  created:
    - "tests/lattice-provider-bridge-smoke.test.js (309 lines, 12 PASS / 0 FAIL, Wave 0 scaffold)"
  modified:
    - "package.json (one-line append: scripts.test chain gains the new smoke as the LAST entry)"

key-decisions:
  - "Placeholder strategy = inert PASSes (not 'not implemented' FAILs): each Part 2..6 carries one trivial `passAssert(true, '...')` so the file is GREEN by itself; downstream plans REPLACE the placeholder with real assertions and the chain stays green throughout Phase 6 execution"
  - "Helpers export pattern = always-run IIFE + bottom-of-file module.exports (simpler than `if (require.main === module)` guard); downstream plans that require() the helpers will trigger the IIFE on import but they independently re-run their own `node tests/...` invocations anyway"
  - "Per-Part ownership markers in code comments explicitly call out which downstream Plan owns each Part fill (Part 2 -> Plan 06-01, Part 3 -> Plan 06-01+06-03, etc.); this is the readable traceability link from harness to per-task verification map in 06-VALIDATION.md"

patterns-established:
  - "Pattern 1 (Wave 0 scaffold): create per-task verification harness BEFORE any plan that depends on it runs; placeholder PASSes keep the chain green; downstream plans incrementally fill"
  - "Pattern 2 (chrome.runtime mock for Phase 6): listeners[] array + sendMessage Promise that rejects when listeners empty (Chrome 105+ behavior) + sender.id == runtime.id (origin-check support) + sendResponse-once-only guard"
  - "Pattern 3 (chrome.offscreen mock for Phase 6): docOpen boolean + createCount counter + 'Only a single offscreen document may be created' guard (Chrome constraint replication)"

requirements-completed:
  - FINT-07
  - FINT-08

# Metrics
duration: 5min
completed: 2026-05-27
---

# Phase 6 Plan 06-00: Lattice provider-bridge Wave 0 smoke scaffold Summary

**Per-task verification harness `tests/lattice-provider-bridge-smoke.test.js` scaffolded with 6 Part placeholders, chrome.runtime + chrome.offscreen mock helpers exported for downstream reuse, and surface-presence assertions for all 7 Lattice provider factories; npm test chain extended as final entry.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-27T15:26:21Z
- **Completed:** 2026-05-27T15:31:19Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 surgically edited)

## Accomplishments

- Wave 0 per-task verification harness lands at `tests/lattice-provider-bridge-smoke.test.js` (309 lines, 12 PASS / 0 FAIL).
- 7 Lattice provider factory functions verified reachable via real `await import('lattice')` in Part 1 (Wave 0 substantive deliverable, not a placeholder).
- 5 Part placeholders (Parts 2..6) wired as inert PASSes so the &&-chain stays green; explicit per-Part code comments call out which downstream Plan owns each fill.
- `createChromeRuntimeMock`, `createChromeOffscreenMock`, `loadOffscreenHandlerSource`, `passAssert`, `passAssertEqual` exported via `module.exports` for downstream Plans 06-01..06-05 to `require()`.
- `package.json` scripts.test chain extended with `&& node tests/lattice-provider-bridge-smoke.test.js` as the LAST entry; Phase 1-5 smoke order BYTE-FROZEN (lattice-smoke -> lattice-tripwire-smoke -> lattice-checkpoint-smoke -> lattice-providers-smoke -> lattice-survivability-smoke -> lattice-provider-bridge-smoke).
- `npm test` exits 0 across the full chain; Wave 0 is downstream-unblocking.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Wave 0 smoke scaffold with all 6 Part placeholders + chrome.* mocks** -- `347be227` (test)
2. **Task 2: Append the new smoke to package.json scripts.test chain as the LAST entry** -- `72899f54` (chore)

## Files Created/Modified

- `tests/lattice-provider-bridge-smoke.test.js` (CREATED, 309 lines) -- Wave 0 scaffold: JSDoc with coverage map (Part -> downstream Plan -> REQ) + `'use strict'` + passAssert/passAssertEqual counters + `createChromeRuntimeMock(initialHandler)` helper (Chrome 105+ listener-empty rejection semantics + sender.id == runtime.id) + `createChromeOffscreenMock()` helper (docOpen flag + createCount counter for idempotency assertions) + `loadOffscreenHandlerSource()` placeholder (returns null in Wave 0; Plan 06-01 fills) + top-level async IIFE that loads Lattice via `await import('lattice')` + 6 Part sections (Part 1 = 7 real surface-presence PASSes; Parts 2..6 = inert placeholder PASSes with per-Part downstream-Plan ownership markers) + `module.exports = { createChromeRuntimeMock, createChromeOffscreenMock, loadOffscreenHandlerSource, passAssert, passAssertEqual }` for downstream require().
- `package.json` (MODIFIED, 1 line) -- `scripts.test` chain gains `&& node tests/lattice-provider-bridge-smoke.test.js` as the FINAL entry, appended after `&& node tests/lattice-survivability-smoke.test.js`. Phase 1-5 smoke order BYTE-FROZEN. No other fields touched.

## Per-Part Placeholder Map (Downstream Traceability)

| Part | Title                                | Wave 0 status                              | Fill plan                          | REQ          |
|------|--------------------------------------|--------------------------------------------|------------------------------------|--------------|
| 1    | Surface presence                     | 7 real PASSes (Lattice factory functions)  | Plan 06-01 + Plan 06-03 add more   | FINT-07a     |
| 2    | Per-provider message-bus round-trip  | 1 inert placeholder PASS                   | Plan 06-01 (7 per-provider fetches) | FINT-07b    |
| 3    | Error envelope shape                 | 1 inert placeholder PASS                   | Plan 06-01 + Plan 06-03 (adapter_error / host_unreachable / invalid_provider) | FINT-07b |
| 4    | AbortController propagation          | 1 inert placeholder PASS                   | Plan 06-01 (2 abort PASSes)        | FINT-07b     |
| 5    | Flag / trim / options-grep           | 1 inert placeholder PASS                   | Plan 06-02 + Plan 06-03 + Plan 06-04 (importScripts insert + flag-on/off + saveSettings trim + checkApiConnection field-read) | FINT-08a..d |
| 6    | INV byte-freeze                      | 1 inert placeholder PASS                   | Plan 06-05 (INV-04 setTimeout count + INV-01/02 tool-definitions-parity + INV-05 _archive absence + INV-06 Lattice byte-freeze) | INV-04 |

Total Wave 0: 7 + 1 + 1 + 1 + 1 + 1 = 12 PASS / 0 FAIL.

## Helpers Exported (for downstream Plans 06-01..06-05)

```js
const {
  createChromeRuntimeMock,    // (initialHandler) => chrome.runtime-shaped mock with sendMessage/onMessage; Chrome 105+ rejection when listeners empty
  createChromeOffscreenMock,  // () => chrome.offscreen-shaped mock with hasDocument/createDocument/closeDocument + _createCount() introspection
  loadOffscreenHandlerSource, // () => Promise<Function|null>; placeholder; Plan 06-01 fills (returns the lattice-host.js onMessage listener for direct dispatch)
  passAssert,                 // (cond, msg) => increments passed/failed + logs PASS:/FAIL:
  passAssertEqual             // (actual, expected, msg) => passAssert wrapper with JSON-formatted expected/got
} = require('./tests/lattice-provider-bridge-smoke.test.js');
```

## Phase 1-5 Smoke Chain BYTE-FROZEN Confirmation

Order in `package.json` scripts.test (verified via grep + visual inspection):

1. `node tests/lattice-smoke.test.js` (Phase 1)
2. `node tests/lattice-tripwire-smoke.test.js` (Phase 2)
3. `node tests/lattice-checkpoint-smoke.test.js` (Phase 3)
4. `node tests/lattice-providers-smoke.test.js` (Phase 4)
5. `node tests/lattice-survivability-smoke.test.js` (Phase 5)
6. `node tests/lattice-provider-bridge-smoke.test.js` (Phase 6 -- NEW, LAST)

Phase 1-5 entries are byte-identical to their pre-Plan-06-00 state; the only diff to `package.json` is the trailing 50-char append.

## INV-04 Setup Preserved

- `grep -c "setTimeout" extension/ai/agent-loop.js` returns **8** (Phase 5 baseline; UNCHANGED).
- ZERO `extension/*` files modified (Wave 0 = test-scaffolding only, per CONTEXT.md scope-locks).
- No `extension/_archive/` created (INV-05 unchanged; Phase 7 will archive `universal-provider.js`, not Phase 6).
- Lattice repo at `./lattice/` not touched (INV-06 unchanged).

## Decisions Made

- **Placeholder strategy = inert PASSes, not 'not implemented' FAILs.** Each Part 2..6 carries one trivial `passAssert(true, '...')` so the file passes by itself. Downstream plans REPLACE the placeholder when filling. Rationale: per RESEARCH Section 15 + VALIDATION Wave 0 Requirements, the per-task harness must stay green throughout Phase 6 execution; FAIL-when-empty would block Plan 06-01..06-05 atomic commits behind harness flips.
- **Helpers export pattern = always-run IIFE + bottom-of-file `module.exports`.** Per plan action #9: simpler than wrapping in `if (require.main === module)`. Downstream plans that require() the helpers WILL trigger the IIFE on import (cosmetic console output during their test runs), but they independently re-run their own `node tests/lattice-provider-bridge-smoke.test.js` invocations anyway so the IIFE side-effect is harmless.
- **Per-Part ownership markers in code comments.** Each Part header carries a `// Plan 06-XX will populate:` block explicitly mapping the Part to the downstream Plan that owns the fill. This is the readable traceability link from the harness back to the per-task verification map in `06-VALIDATION.md`, and it scales: when an executor of Plan 06-01 opens this file, the Part 2/3/4 markers tell them exactly what to write.

## Deviations from Plan

None - plan executed exactly as written.

Both tasks completed on the first attempt:
- Task 1's smoke file ran clean on the first invocation (12 PASS / 0 FAIL); acceptance criteria all met after one minor JSDoc tightening (replaced incidental mentions of forbidden tokens like `vitest`, `jest`, `import.meta` in comment text with neutral phrasing, per the "File DOES NOT contain" literal-text acceptance criteria).
- Task 2's surgical append to `package.json` scripts.test landed exactly as the plan dictated; full `npm test` chain exits 0.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Wave 0 is pure test scaffolding; no runtime extension code touched; no MV3 reload needed.

## Next Phase Readiness

**Wave 0 -> Wave 1 handoff signal:** downstream **Plan 06-01 may now begin.** The per-task verification harness is in place; Plan 06-01 will:

1. Build `extension/offscreen/lattice-host.js` provider-execute handler + abort registry.
2. Build `extension/ai/lattice-provider-bridge.js` SW-side shim with `executeViaBridge()`.
3. Fill Part 2 (7 per-provider round-trip PASSes), Part 3 (3 error envelope PASSes), Part 4 (2 abort propagation PASSes) of `tests/lattice-provider-bridge-smoke.test.js` by writing real assertions into the placeholder locations.

**Subsequent plans (also unblocked):**
- Plan 06-02 (SW startup + importScripts wiring) -- fills Part 5(a).
- Plan 06-03 (agent-loop flag-gated swap) -- fills Part 3 invalid_provider + Part 5(b).
- Plan 06-04 (options.js rewrite + saveSettings trim) -- fills Part 5(c)+(d).
- Plan 06-05 (INV byte-freeze verification) -- fills Part 6.
- Plan 06-06 (Phase ceremony: LATTICE-PIN bump + REQUIREMENTS.md FINT-07/08 flip + audit).

No blockers. No concerns. The harness is downstream-unblocking and the &&-chain is green.

## Self-Check: PASSED

- File exists: `tests/lattice-provider-bridge-smoke.test.js` (FOUND, 309 lines).
- File exists: `package.json` modified with new smoke entry (FOUND, grep returns 1).
- Commit `347be227` exists in `git log` (FOUND, Task 1 commit).
- Commit `72899f54` exists in `git log` (FOUND, Task 2 commit).
- `node tests/lattice-provider-bridge-smoke.test.js` exits 0 (12 PASS / 0 FAIL).
- `npm test` exits 0 (full chain green; new smoke runs as final entry).
- INV-04 setTimeout count in `extension/ai/agent-loop.js` returns 8 (UNCHANGED; no extension/* files modified).

---
*Phase: 06-fsb-engine-consumes-lattice-provider-abstraction*
*Completed: 2026-05-27*
