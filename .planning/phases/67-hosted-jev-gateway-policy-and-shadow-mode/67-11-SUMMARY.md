---
phase: 67-hosted-jev-gateway-policy-and-shadow-mode
plan: 11
subsystem: extension
tags: [jev, extension, service-worker, importScripts, source-pins, boundary, static-scan, vm, inert-load, jev-01, jev-02, jev-03]

# Dependency graph
requires:
  - phase: 67-06
    provides: "extension/ai/jev-state.js (FsbJevState)"
  - phase: 67-07
    provides: "extension/ai/jev-policy.js (FsbJevPolicy)"
  - phase: 67-08
    provides: "extension/ai/jev-client.js (FsbJevClient, resolves FsbJevState at call time)"
provides:
  - "extension/background.js: three plain inert loads (ai/jev-state.js, ai/jev-client.js, ai/jev-policy.js) directly after ai/model-discovery.js"
  - "tests/lattice-provider-bridge-smoke.test.js: importScripts token pin 334 -> 337 and call-site pin 330 -> 333, both ledgers extended"
  - "tests/jev-extension-boundary.test.js (115 checks; not yet registered, 67-13 registers it)"
affects: [67-13, 68, 70, V5, V6]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Whole-bundle static scan over every regular file in extension/ (comments kept, NUL-bearing files read as latin1, >5 MB skipped and reported), violations printed as file:line -- pattern"
    - "Scanner self-test: every forbidden pattern is first shown to fire on a planted string, so a broken regex cannot pass as a clean tree"
    - "Inert-load proof on two axes: Object.keys(sandbox) and Object.getOwnPropertyNames(globalThis) inside the context, before and after evaluation"
    - "Read-trap context: getters on chrome, browser, fetch, storage, navigator, require, process and AbortController record any load-time read"

key-files:
  created:
    - tests/jev-extension-boundary.test.js
  modified:
    - extension/background.js
    - tests/lattice-provider-bridge-smoke.test.js
    - extension/ai/jev-policy.js

key-decisions:
  - "The three loads use the plain importScripts form in load order state, client, policy, with no new comment line, so no new comment carries the importScripts token"
  - "jev-policy.js's internal constant JEV_DENIAL_REASON is renamed CONFIRM_DENIAL_REASON (value 'jev_requires_confirmation' unchanged), because the plan's tree scan forbids any \\bJEV_[A-Z_]+\\b name in the public bundle; fixed in the module, the suite was not weakened"
  - "The boundary suite is stricter than the plan in three places that hold today: text files under extension/ui and extension/config may not contain the substring jev at all (catches a jevFastMode-style key), any scheme:// literal in jev-*.js counts (not only https), and background.js may mention jev only on its three load lines, directly after model-discovery"

patterns-established:
  - "Phase 68 (the first Jev UI and caller) must update tests/jev-extension-boundary.test.js deliberately: its ui/config, caller and background.js sections are written to turn red on the first setting, storage key or call site"

requirements-completed: [JEV-01, JEV-02, JEV-03]

# Metrics
duration: 7min
completed: 2026-10-17
---

# Phase 67 Plan 11: Inert Jev Loads in the Service Worker and the Extension Boundary Suite Summary

**The three Jev modules now load inert in the MV3 service worker through three plain `importScripts` lines directly after `ai/model-discovery.js`. Both lattice source pins moved by +3 in the same commit (token count 334 -> 337, call sites 330 -> 333). A new 115-check boundary suite proves the public bundle has no upstream path or `JEV_*` name, one fixed endpoint, no caller, no setting or UI, and that each module evaluates in a bare vm context adding exactly its one `Fsb*` global with no timer, log, throw or fetch.**

## Performance

- **Duration:** about 7 min
- **Started:** 2026-10-17T06:03:40Z
- **Completed:** 2026-10-17T06:10:00Z
- **Tasks:** 2 (Task 2 TDD; 3 code commits)
- **Files:** 1 created, 3 modified

## Accomplishments

- **Three inert loads (D-17).** `extension/background.js` lines 819-821 are `importScripts('ai/jev-state.js');`, `importScripts('ai/jev-client.js');` and `importScripts('ai/jev-policy.js');`, directly after line 818 `importScripts('ai/model-discovery.js');` and before the blank line and `// Memory layer modules`. No comment was added. This is the only `background.js` edit in Phase 67.
- **Source pins moved in the same commit (gotcha 1, T-67-14).**

  | Pin (`tests/lattice-provider-bridge-smoke.test.js`) | Old | New | Commit |
  | --- | --- | --- | --- |
  | `importScripts` token count (line 637) | 334 | 337 | `d1bfdbea` |
  | `importScripts(` call sites (line 685) | 330 | 333 | `d1bfdbea` |

  The token ledger now ends "Phase 67 adds three inert Jev decision modules (state, client, policy) -> 337." and the call-site ledger ends "Phase 67's three Jev modules are call sites 331..333." Both assertion messages name the three Jev modules. No other assertion changed. `git show --stat d1bfdbea` lists exactly `extension/background.js` and `tests/lattice-provider-bridge-smoke.test.js`.
- **`tests/jev-extension-boundary.test.js` (115 checks, 0 failed, 550 files scanned).**
  - *Scanner self-test (12 checks).* Each forbidden pattern fires on a planted string, and `openrouter.ai`, `jev_requires_confirmation` and `FsbJevState` are not tree violations.
  - *Tree scan (D-01, D-09, D-22, T-67-01).* All 550 regular files under `extension/`, comments included, 34 binaries read as latin1, none over 5 MB: no `systemone`, no `api.typesafe.ai` (both case-insensitive) and no `\bJEV_[A-Z_]+\b`. `openrouter.ai` appears in 8 files and is allowed.
  - *Module scan (D-09, T-67-02).* `extension/ai` holds exactly the three `jev-*.js` files. They contain no `chrome.storage`, `localStorage`, `serverUrl` (case-insensitive) or `importScripts`. The only `scheme://` literal in them is `https://full-selfbrowsing.com/api/jev/decide`, once, in `jev-client.js`.
  - *No caller (D-01).* No file outside `extension/ai/jev-*.js` contains `FsbJev*`. `background.js` mentions `jev` only on its three load lines, in order, directly after model-discovery.
  - *No setting, storage key or UI (D-01).* None of the 35 files under `extension/ui` and `extension/config` contains `jev`: the `\bjev\b` word for binaries, any substring for text.
  - *Inert alone (D-17, T-67-05b).* Each module in a context of only a recording `console`, `TextEncoder`, `URL` and timer spies (no `chrome`, `fetch`, `require`, `module`) evaluates without throwing, adds exactly its one global to both the sandbox keys and the inner `globalThis` own-property names, makes zero timer calls and logs nothing.
  - *Inert under read traps.* With getters on `chrome`, `browser`, `fetch`, `XMLHttpRequest`, `WebSocket`, `localStorage`, `sessionStorage`, `indexedDB`, `caches`, `navigator`, `importScripts`, `require`, `process` and `AbortController`, no module reads any of them at load. The `module.exports` guard's `typeof module` is the only read and is expected.
  - *Inert together.* Loaded in order into one shared context, the three modules add exactly `FsbJevClient`, `FsbJevPolicy` and `FsbJevState` (sandbox keys and inner global), remove nothing, make no timer call and log nothing. `FsbJevClient.ENDPOINT` is the fixed endpoint.
  - *decide() without fetch.* In the shared context and in a client-alone context (no `FsbJevState`), `createJevClient()`, `createJevClient({fetchImpl: spy})` and the default `FsbJevClient.decide` each answer six invalid requests (`undefined`, `null`, a string, `{}`, `[]`, an unknown `model` key) with the exact five-key `{ok:false, fallback:'invalid_request', servedModel:null, httpStatus:null, latencyMs}`. The fetch spy is never called, no timer is armed, nothing is logged, and the context still has no `fetch`, `chrome`, `require` or `module`.

## Task Commits

1. **Task 1: three inert loads and the paired lattice pin bump** - `d1bfdbea` (feat)
2. **Task 2: extension boundary suite** - TDD:
   - RED `cdde84ad` (test): the suite failed exactly one check, the two `JEV_DENIAL_REASON` hits in `extension/ai/jev-policy.js` (lines 83 and 405); the other 114 passed.
   - GREEN `35f0684c` (fix): rename the module constant; the suite passes 115/0.

## Sweeps (Task 1)

Every sweep ran the 25 verify-line commands one by one in the background (`/tmp/fsb-67-11/sweep.sh`, exit code per command, continuing past failures), never under `timeout`.

| Sweep | When | Result |
| --- | --- | --- |
| BASELINE | before any edit, HEAD `4049de11` | 25/25 exit 0. No pre-existing failure. |
| Post-edit | after the Task 1 edits, before commit `d1bfdbea` | 25/25 exit 0 (`lattice-provider-bridge-smoke` 112 passed, 0 failed) |
| Final | after `35f0684c` (jev-policy.js rename) | 25/25 exit 0 |

None of the sweeps selects `tests/showcase-build-smoke.test.js`; `git status --short showcase/angular/public` was empty before every commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, owning plan 67-07] `JEV_DENIAL_REASON` tripped the bundle's `JEV_*` scan**
- **Found during:** Task 2 (RED run).
- **Issue:** `extension/ai/jev-policy.js` named its internal constant `JEV_DENIAL_REASON`. It is not a credential, but it matches the plan's `\bJEV_[A-Z_]+\b` rule (D-22: no Jev credential env-var name in the public bundle), and a name of that shape cannot be told apart from a leaked env-var name by a scan.
- **Fix:** Renamed it `CONFIRM_DENIAL_REASON` in the module, in its own commit, as the plan directs (fix the module, never weaken the test). The value `'jev_requires_confirmation'` and every behaviour are unchanged. Nothing else referenced the old name. `tests/jev-policy-tighten-only.test.js` (29,647 passed), `jev-client` (280), `jev-state` (232) and `jev-contract-parity` (379) still pass.
- **Files modified:** `extension/ai/jev-policy.js`
- **Commit:** `35f0684c`

**Total deviations:** 1 auto-fixed (Rule 1). **Impact:** a two-line rename in a 67-07 module. No scope change.

## TDD Gate Compliance

Task 2 has a RED `test(67-11)` commit (`cdde84ad`, failing for the expected reason) followed by its GREEN commit. The GREEN commit is typed `fix(67-11)` rather than `feat`, because the change that turned the suite green is a defect fix in an existing module, not new behaviour. No REFACTOR commit was needed.

## Issues Encountered

- BSD `sed` on macOS has no `\b`, so a first `sed -i` rename attempt changed nothing. The Edit tool did the rename instead, with no side effects.
- `graphify query` returned only stale `.context/` Chrome-profile nodes, so the targeted files were read directly.

## Verification

- `node tests/lattice-provider-bridge-smoke.test.js`: 112 passed, 0 failed.
- `node tests/jev-extension-boundary.test.js`: 115 passed, 0 failed, files scanned 550.
- Both suites also pass on the official Node 20.20.2 binary (CI's runtime): 115/0 and 112/0.
- `npm run validate:extension`: exit 0 (in all three sweeps).
- `grep -c "importScripts('ai/jev-" extension/background.js` prints 3; `importScripts('ai/jev-state.js')` is line 819, right after model-discovery on 818.
- The `node -e` count prints `337 333`, the values the updated test asserts.
- `grep -rlE "systemone|api\.typesafe\.ai" extension/` and `grep -rl "FsbJev" extension/ | grep -v "extension/ai/jev-"` print nothing.
- Compatibility (D-01): no extension code calls the Jev modules, so behaviour equals `8a058bdf`.

## Known Stubs

None. The modules are intentionally uncalled in Phase 67 (D-01, D-17); Phases 68 and 70 add the callers.

## Threat Flags

None. The plan adds no endpoint, auth path, storage or schema. It only loads modules that 67-06..08 already threat-modelled.

## Deferred to Validation Block

- **M-67-11 (V5):** no Phase 67 UI exists, so there is nothing to check. Recorded so V5's collector finds an explicit "none".
- **M-67-12 (V6):** the three modules ship in the 1.0.0 extension. Nothing is pushed or published before V6.

Deferred: M-67-11 (V5), M-67-12 (V6)

## User Setup Required

None.

## Next Phase Readiness

- 67-13 registers `node tests/jev-extension-boundary.test.js` in `package.json` "test" and `REFINEMENT_ROOT_TEST_COMMANDS` (not done here, as the plan directs).
- Phase 68 adds the first Jev caller, setting and UI. It must update the boundary suite's caller, `background.js` and ui/config sections on purpose; they are built to turn red on the first such change.
- Any further `importScripts` load moves the lattice pins from 337/333.

## Self-Check: PASSED

- Files: tests/jev-extension-boundary.test.js, extension/background.js, tests/lattice-provider-bridge-smoke.test.js, extension/ai/jev-policy.js and this SUMMARY exist.
- Commits: d1bfdbea, cdde84ad and 35f0684c exist on branch Jev; none carries an AI attribution line.
