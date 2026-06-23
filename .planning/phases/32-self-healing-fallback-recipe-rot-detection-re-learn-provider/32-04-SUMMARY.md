---
phase: 32-self-healing-fallback-recipe-rot-detection-re-learn-provider
plan: 04
subsystem: testing
tags: [schema-lock, provider-parity, frozen-hash, milestone-gate, mv3, capability-recipe, self-healing]

# Dependency graph
requires:
  - phase: 32-01
    provides: the Wave-0 RED suites (recipe-schema-lock version+hash assertion with the TBD placeholder; provider-parity 7-PROVIDER_KEYS capability+fallback contract)
  - phase: 32-02
    provides: the additive recipe schema v2 (FSB_RECIPE_SCHEMA_VERSION===2 + optional capturedAt/expectedShape) -- the schema this plan freezes; the Plan-02 suite printed the v2 digest f35211f5...f622a37
  - phase: 32-03
    provides: the router post-executeBoundSpec rot classify hook emitting the typed RECIPE_DOM_FALLBACK_PENDING decision -- the provider-independent fallback reason the parity gate asserts
provides:
  - "tests/recipe-schema-lock.test.js: the FROZEN_RECIPE_SCHEMA_V2_HASH placeholder replaced with the real computed digest f35211f524639f4b9611edb973b1eaf94f24769fbaff205e3c658914fd622a37 (independently re-computed) -- the closed-vocab recipe contract is now locked (HEAL-05/INV-01, D-14)"
  - "tests/provider-parity.test.js GREEN unchanged: the capability surface formats identically across all 7 PROVIDER_KEYS AND the typed RECIPE_DOM_FALLBACK_PENDING fallback reason is byte-equal across all 7 (HEAL-05/INV-03, D-13) -- no edit needed, the Plan-03 router emit made it green"
  - "The full npm test chain GREEN -- the v0.9.99 milestone completion gate (HEAL-05, D-15): capability + fallback + 7-provider parity + schema-lock + every prior suite"
  - "tests/lattice-provider-bridge-smoke.test.js importScripts byte-freeze count re-baselined 175->185 / 171->181 to account for the Phase 30/31/32 SW-startup additions (per-phase decomposition documented inline)"
affects: [milestone-v0.9.99-gate, phase-32-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Compute-once-and-paste frozen-hash lock: the v2 RECIPE_SCHEMA digest is computed from the LIVE schema via stable()+sha256 once at first green, independently re-computed, and pasted verbatim -- any later drift to the closed vocab reds the build (mirrors tool-definitions-parity)"
    - "Stale byte-freeze count re-baseline at the milestone-close phase: a hardcoded importScripts count gate that lags N phases is refreshed with a per-phase delta decomposition so it keeps its protective value (mirrors the Phase 27/28/29 re-baselines)"

key-files:
  created:
    - .planning/phases/32-self-healing-fallback-recipe-rot-detection-re-learn-provider/32-04-SUMMARY.md
  modified:
    - tests/recipe-schema-lock.test.js
    - tests/lattice-provider-bridge-smoke.test.js

key-decisions:
  - "The frozen v2 digest was INDEPENDENTLY re-computed (a standalone node one-liner applying the same stable()+sha256 over the live RECIPE_SCHEMA) before pasting -- it matched the digest the Plan-02 schema-lock suite printed (f35211f5...f622a37) exactly, so the freeze is verified, not blindly trusted"
  - "tests/provider-parity.test.js required NO edit: the Plan-03 router RECIPE_DOM_FALLBACK_PENDING emit already made all 31 assertions green (the capability surface is provider-independent by construction via getPublicTools, and the router never branches on provider). The over-tight-expectation correction the plan permitted was unnecessary -- the core INV-03 invariant held as authored."
  - "The lattice-provider-bridge-smoke importScripts count failure was diagnosed as a STALE BASELINE (last refreshed Phase 29, commit dd3976c0), NOT a Phase-32 regression: the +10 delta decomposes as Phase 30 +4 (consent/audit/signature/denylist) + Phase 31 +5 (network-capture/synthesizer/learned-store/discovery) + Phase 32 +1 (capability-rot-detector.js, Plan 32-03). Re-baselined at this milestone-close plan because Phase 32 legitimately contributes +1 and a 3-phase-stale count gate protects nothing while blocking the milestone."

patterns-established:
  - "Independent re-computation of a frozen hash before pasting (cross-check against the RED suite's printed diagnostic) so the lock is provably correct"
  - "Milestone-close re-baseline of a stale byte-freeze count with full per-phase delta attribution in the assertion message + comment"

requirements-completed: [HEAL-05]

# Metrics
duration: 6min
completed: 2026-06-23
---

# Phase 32 Plan 04: HEAL-05 Parity Gates + v0.9.99 Milestone Gate Summary

**Froze the v2 RECIPE_SCHEMA hash (independently re-computed digest f35211f5...f622a37) in the schema-lock gate, confirmed the 7-provider capability+fallback parity gate is green unchanged (the Plan-03 router emit already satisfied INV-03), and closed the v0.9.99 milestone: the full `npm test` chain exits 0 (capability + fallback + 7-provider parity + schema-lock + every prior suite), and the targeted Phase-32-owned milestone gate is 13/13 GREEN.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-23T09:07:06Z
- **Completed:** 2026-06-23T09:13:07Z
- **Tasks:** 2
- **Files modified:** 2 (0 created production, 2 test files)

## Accomplishments

- **Froze the v2 RECIPE_SCHEMA hash (HEAL-05/INV-01, D-14).** Replaced the `TBD-FROZEN-IN-PLAN-04` placeholder in `tests/recipe-schema-lock.test.js` with the real digest `f35211f524639f4b9611edb973b1eaf94f24769fbaff205e3c658914fd622a37`. The digest was INDEPENDENTLY re-computed via a standalone node one-liner applying the same `stable()` + `sha256` over the live `RECIPE_SCHEMA` (not blindly pasted from the Plan-02 summary) and matched the suite's printed diagnostic exactly. The closed-vocab recipe contract (the agreement between bundled recipes, Phase-31 learned recipes, and the interpreter) is now locked; any drift to the schema's fields / required list / enum members / `additionalProperties:false` posture reds the build. The test still re-asserts `FSB_RECIPE_SCHEMA_VERSION === 2` and the frozen non-trigger tool registry hash `ad6efb8cc3275d964488b67222129b1c0278c5c3b69c64888d926beb89a3926b` is unmoved (INV-01 -- no tool-definitions edit this phase). 3/3 GREEN.
- **Confirmed the 7-provider parity gate green (HEAL-05/INV-03, D-13) -- no edit required.** `tests/provider-parity.test.js` is 31/0: the capability surface formats identically across all 7 PROVIDER_KEYS (xai/openai/anthropic/gemini/openrouter/lmstudio/custom) with the two capability tools (`invoke_capability`/`search_capabilities`) absent from every formatted envelope, AND the typed `RECIPE_DOM_FALLBACK_PENDING` fallback reason from a broken 404 fetch is byte-equal across all 7 providers (the real router driven once per provider; the router sits below the provider layer and never branches on provider). The Plan-03 router emit already satisfied this; the over-tight-expectation correction the plan permitted was unnecessary.
- **Closed the v0.9.99 milestone gate (HEAL-05, D-15).** The full `npm test` chain exits 0 -- capability + fallback + 7-provider parity + schema-lock + every prior suite (the entire `scripts.test` &&-chain through the final `capability-rot-detector.test.js`).
- **Re-baselined a stale byte-freeze count** in `tests/lattice-provider-bridge-smoke.test.js` (the only failure the first full run hit -- diagnosed as a Phase-29-era stale baseline, not a Phase-32 regression; see Deviations).

## Task Commits

Each task was committed atomically (main working tree, branch `automation-worktree`, hooks ON, no `--no-verify`):

1. **Task 1: Freeze the v2 RECIPE_SCHEMA hash; schema-lock gate green** - `34691424` (test)
2. **Task 2: Re-baseline the importScripts byte-freeze; full npm test milestone gate green** - `8af3cae9` (test)

**Plan metadata:** see the final docs commit.

## Files Created/Modified

- `tests/recipe-schema-lock.test.js` (modified) - `FROZEN_RECIPE_SCHEMA_V2_HASH` placeholder `TBD-FROZEN-IN-PLAN-04` replaced with the real 64-char digest `f35211f5...f622a37`; the surrounding ASCII comments updated to document the lock semantics (computed once from the live v2 schema; drift reds the gate; to evolve the schema bump the version and re-freeze deliberately); the stale "RED today" assertion labels corrected to reflect the now-green state. Still re-asserts version===2 + the frozen tool hash ad6efb8c... (INV-01).
- `tests/lattice-provider-bridge-smoke.test.js` (modified) - Part-5 SW-startup importScripts byte-freeze re-baselined 175->185 (mentions) and 171->181 (call sites), with the Phase 30 (+4) / Phase 31 (+5) / Phase 32 (+1) per-phase delta decomposition documented in both the comment block and the assertion message.

## Decisions Made

- **Independent re-computation before pasting the frozen digest.** Rather than trust the Plan-02 summary's printed digest, the v2 hash was recomputed from scratch (a node one-liner over the live `extension/utils/capability-recipe-schema.js` `RECIPE_SCHEMA` with the identical `stable()`+`sha256`). It matched `f35211f5...f622a37` exactly -- the freeze is verified, not assumed. This is the load-bearing T-32-LOCK mitigation: the lock is only meaningful if the frozen value is computed from the real artifact.
- **provider-parity.test.js needed no change.** INV-03 held as authored: the capability surface is provider-independent (getPublicTools maps only the registry; the two capability tools are out-of-registry) and the router never branches on provider, so the typed fallback reason is byte-identical across all 7. The plan permitted correcting an over-tight expectation only if one existed; none did. The core invariant was NOT loosened (T-32-PARITY honored).
- **The lattice-provider-bridge-smoke count failure is a stale baseline, not a Phase-32 regression.** Diagnosed precisely (see Deviations) and re-baselined with full attribution, mirroring the Phase 27/28/29 re-baseline precedent the plan's Task 2 cites.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Re-baselined the stale background.js importScripts byte-freeze count in lattice-provider-bridge-smoke.test.js**

- **Found during:** Task 2 (the full `npm test` milestone gate -- the chain stopped at this suite's Part-5 SW-startup assertion).
- **Issue:** `tests/lattice-provider-bridge-smoke.test.js` asserted `importScripts count = 175` / `call sites = 171`, but the live `background.js` has `185` / `181` (delta +10). The hardcoded baseline was last refreshed at Phase 29 (commit `dd3976c0`, `test(29-05) +5`) and was never updated for Phase 30, 31, or 32.
- **Diagnosis (genuine vs pre-existing):** The +10 decomposes EXACTLY by git provenance -- Phase 30 (commit `83614f0d`): +4 (consent-policy-store, audit-log, capability-signature, service-denylist); Phase 31 (commit `88d79e63`): +5 (network-capture-redactor, network-capture, recipe-synthesizer, learned-recipe-store, discovery-session); Phase 32 (commit `62cefc46`, Plan 32-03): +1 (capability-rot-detector.js). 175+4+5+1 = 185; 171+4+5+1 = 181. So Phase 32 legitimately contributes +1 (the rot classifier the router calls, wired in Plan 32-03); the other +9 is from Phases 30/31 leaving the count stale. This is NOT a Phase-32 regression -- no Phase-32 plan touched the count incorrectly; the gate simply lagged 3 phases.
- **Fix:** Bumped both literals (175->185, 171->181) following the EXACT established re-baseline convention (the file already documents per-phase deltas for Phases 5/6/8/14/15/24/26/27/28/29), appending Phase 30/31/32 attribution to both the comment block and the assertion message. No production code touched.
- **Files modified:** `tests/lattice-provider-bridge-smoke.test.js`
- **Commit:** `8af3cae9`

## Milestone Gate Result (HEAL-05 / D-15)

**Targeted Phase-32-owned milestone gate -- ALL GREEN (13/13):**

| Gate | Result |
|------|--------|
| `node tests/capability-rot-detector.test.js` | GREEN |
| `node tests/provider-parity.test.js` | GREEN (31/0; INV-03) |
| `node tests/recipe-schema-lock.test.js` | GREEN (3/0; INV-01, D-14) |
| `node tests/capability-router.test.js` | GREEN |
| `node tests/capability-autopilot-parity.test.js` | GREEN |
| `node tests/agent-loop-iterator-guard.test.js` | GREEN (INV-04) |
| `node tests/capability-recipe-schema.test.js` | GREEN |
| `npm --prefix mcp run build` | GREEN |
| `node tests/capability-mcp-surface.test.js` | GREEN |
| `node tests/tool-definitions-parity.test.js` | GREEN (INV-01) |
| `node tests/learned-recipe-store.test.js` | GREEN |
| `node tests/learned-t2-outranking.test.js` | GREEN |
| `node scripts/verify-recipe-path-guard.mjs` | GREEN |

**Full `npm test` chain: EXIT 0 (GREEN).** After the Task-2 re-baseline, the entire `scripts.test` &&-chain runs end-to-end with zero FAIL lines through the final suite (`capability-rot-detector.test.js`, 21/0). The v0.9.99 milestone completion criterion is met.

**Pre-existing-unrelated items (NOT a Phase-32 regression, NOT fixed -- out of scope):**

- **`tests/foreground-audit.test.js` -- 1 pre-existing RED (Phase-243 doc gap).** Asserts a planning doc exists at `.planning/phases/243-background-tab-audit-ui-badge-integration/243-BACKGROUND-TAB-AUDIT.md` (absent on this branch). This suite is NOT in the `npm test` &&-chain, so it did not block the milestone gate. Logged in `deferred-items.md` (from Plan 03; owner: Phase 243 maintainer). Byte-unchanged since 32-02; references no Phase-32 file.
- **Pre-existing working-tree drift** in `showcase/`, `ws/ws-client.js`, `extension/dist/offscreen/lattice-host.js`, and `tests/{dashboard-*,metrics-wireup,phantom-stream-remote-control-parity,agent-sunset-showcase,dashboard-runtime-state}.test.js` (modified before this session, present in the initial `git status`). None of these are in this plan's scope; none red a suite in the `npm test` chain (the chain exits 0). Left untouched per the scope boundary.

## Known Stubs

None - the two edited files are test-only and introduce no stubs, TODOs, hardcoded UI-bound empties, or placeholders. The one placeholder this plan was tasked to REMOVE (the `TBD-FROZEN-IN-PLAN-04` cross-plan tripwire) is now replaced with the real frozen digest.

## Authentication Gates

None - no auth gates encountered (test-only plan; no external service, no package install).

## User Setup Required

None - `user_setup: []` in the plan; zero external packages installed (T-32-SC: accept -- no npm/pip/cargo install).

## Verification

Plan verification block (all exit 0):

- `node tests/recipe-schema-lock.test.js` -> 3/0 GREEN (v2 hash frozen + version 2 + frozen tool hash ad6efb8c... unmoved).
- `node tests/provider-parity.test.js` -> 31/0 GREEN (7-provider capability+fallback parity; INV-03).
- `npm test` -> EXIT 0 GREEN (the full chain -- the v0.9.99 milestone gate; HEAL-05/D-15).
- The targeted milestone gate -> 13/13 GREEN (table above).

Posture: both edited files are ASCII-only (no emojis -- CLAUDE.md hard constraint). No production code touched; INV-01 (frozen tool hash + tool byte-identity), INV-03 (provider parity), and INV-04 (agent-loop iterator guard) all hold within the full run.

## Threat Flags

None - the two edited test files introduce no new network endpoints, auth paths, file-access patterns, or trust-boundary schema changes. The frozen-hash gate and the provider-parity assertion are the T-32-LOCK / T-32-PARITY mitigations from the plan's threat register, both correctly realized (the hash computed from the real artifact; the parity invariant asserted, never loosened).

## Next Phase Readiness

- **HEAL-05 is complete.** The 7-provider parity gate (INV-03), the schema-lock gate (the frozen v2 RECIPE_SCHEMA hash + the re-asserted frozen tool hash, INV-01), and the full-`npm test` milestone gate (D-15) are all green. The v0.9.99 milestone completion criterion (capability + fallback + 7-provider parity + schema-lock) is met.
- The LIVE self-healing-on-a-real-broken-recipe (the model actually completing a task via DOM tools on a real rotted site, then re-learning) remains `human_needed` UAT per D-15 -- that is Plan 32-05's posture, NOT a CI gate. The CI half (the router emits the typed decision; the autopilot door surfaces it; the schema/tool contracts are locked; parity holds across all 7 providers) is proven GREEN here.
- No blockers introduced. The closed recipe schema vocabulary is now hash-locked; the next schema evolution must bump the version and re-freeze the digest deliberately.

## Self-Check: PASSED

- FOUND: tests/recipe-schema-lock.test.js (modified; the frozen digest f35211f5...f622a37 present, no TBD remains)
- FOUND: tests/lattice-provider-bridge-smoke.test.js (modified; re-baselined 185/181)
- FOUND: .planning/phases/32-self-healing-fallback-recipe-rot-detection-re-learn-provider/32-04-SUMMARY.md
- FOUND commit: 34691424 (Task 1, test)
- FOUND commit: 8af3cae9 (Task 2, test)

---
*Phase: 32-self-healing-fallback-recipe-rot-detection-re-learn-provider*
*Completed: 2026-06-23*
