---
phase: 32-self-healing-fallback-recipe-rot-detection-re-learn-provider
plan: 05
subsystem: planning
tags: [human-uat, live-browser-uat, self-healing, recipe-rot, deferred-debt, milestone-close, checkpoint]

# Dependency graph
requires:
  - phase: 32-02
    provides: the classifyRecipeBroken HEAL-04 taxonomy + HEAL-02 expectedShape rot detection (the CI-green detection half this UAT references)
  - phase: 32-03
    provides: the router RECIPE_DOM_FALLBACK_PENDING emit + quarantine + the wired consent-gated runDiscovery re-learn trigger + the autopilot makeResult surfacing (the CI-green wiring half this UAT references)
  - phase: 32-04
    provides: the 7-provider parity gate + the frozen v2 RECIPE_SCHEMA hash + the full npm test EXIT 0 milestone gate (HEAL-05/D-15 -- the milestone criterion that is the actual close, not this live UAT)
provides:
  - ".planning/phases/32-.../32-HUMAN-UAT.md: the human_needed live self-healing UAT record (UAT-32-01) -- a real rotted/broken recipe on a real authenticated origin detected as RECIPE_EXPIRED, the autopilot completing the SAME task via the DOM tools, the recipe quarantined, and a consent-gated re-learn offered/triggered -- with the exact manual steps + the CI-green/live-deferred/not-fabricated framing (HEAL-01/HEAL-03 live half)"
  - "The Phase-32 live self-healing checkpoint resolved as deferred human_needed live-browser UAT debt (auto-mode), joining the v0.9.99 ledger; the milestone close remains gated by HEAL-05 (Plan 04, green), NOT this live UAT"
affects: [phase-32-verification, milestone-v0.9.99-close, v0.9.99-live-uat-ledger]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "human_needed live-UAT record for the one irreducibly-live behavior of a phase: the CI/automated half is proven green and ONLY the live end-to-end half is deferred as recorded debt (NOT a fabricated pass), mirroring the Phase 27/28/29/30/31 posture (D-15)"
    - "Auto-mode checkpoint:human-verify (non-package, gate=blocking) resolved as recorded live-browser UAT debt: the checkpoint does not block the milestone close because the milestone criterion is the green HEAL-05 CI gate, and the live half is logged in *-HUMAN-UAT.md"

key-files:
  created:
    - .planning/phases/32-self-healing-fallback-recipe-rot-detection-re-learn-provider/32-HUMAN-UAT.md
    - .planning/phases/32-self-healing-fallback-recipe-rot-detection-re-learn-provider/32-05-SUMMARY.md
  modified: []

key-decisions:
  - "32-HUMAN-UAT.md was authored from the 32-VALIDATION.md Manual-Only Verifications row (the UAT-32-01 scenario + test instructions) and mirrors the established 27-HUMAN-UAT.md / 30-HUMAN-UAT.md shape: frontmatter status partial / result pending + a body human_needed status, a 'Why this is human_needed' section enumerating every CI suite that proves the FSB-owned half green, the exact setup + a single UAT-32-01 scenario row, and a recording-results section -- ASCII-only, no emojis (CLAUDE.md hard constraint)"
  - "The frontmatter uses status: partial / result: pending (the Phase-31 31-HUMAN-UAT.md convention) AND the body carries the human_needed status (the plan's <automated> grep + acceptance criteria require human_needed >= 1) -- both conventions are satisfied without conflict"
  - "Task 2 (the checkpoint:human-verify, gate=blocking, NOT gate=blocking-human and NOT a package-legitimacy check) is resolved per the auto-mode policy as deferred human_needed live-browser UAT debt: the live self-healing scenario is recorded in 32-HUMAN-UAT.md (result pending), the checkpoint is marked done as 'deferred to human_needed live UAT', and the milestone close is NOT blocked -- the milestone completion criterion is the green HEAL-05 CI gate (Plan 04, full npm test EXIT 0), per D-15. No live result was fabricated."

patterns-established:
  - "Milestone-closing live-UAT deferral: the LAST plan of a milestone authors the human_needed record for the one irreducibly-live behavior and resolves the gated checkpoint as recorded debt, with the milestone gated by the green CI criterion -- the live confirmation is non-blocking deferred UAT"

requirements-completed: [HEAL-01, HEAL-03]

# Metrics
duration: 4min
completed: 2026-06-23
---

# Phase 32 Plan 05: Live Self-Healing Human-UAT Checkpoint Summary

**Authored the human_needed live-UAT record (UAT-32-01) for the one irreducibly-live Phase-32 behavior -- self-healing on a REAL broken/rotted recipe against a REAL authenticated origin, the autopilot completing the SAME task via the DOM tools, the recipe quarantined, and a consent-gated re-learn offered/triggered -- and resolved the gated checkpoint as deferred human_needed live-browser UAT debt (auto-mode). The headless CI/automated half is GREEN (Plans 02-04); ONLY the live end-to-end completion is human_needed, recorded as debt joining the v0.9.99 ledger, NOT a fabricated pass (D-15). The v0.9.99 milestone remains gated and closed by the green HEAL-05 CI criterion (Plan 04, full npm test EXIT 0), not by this live UAT.**

## Performance

- **Duration:** ~4 min
- **Completed:** 2026-06-23
- **Tasks:** 2 (Task 1 auto: authored the UAT doc; Task 2 checkpoint: resolved as deferred human_needed live UAT)
- **Files created:** 2 (1 planning UAT doc + this summary); **0 production / test / config files** -- this plan introduces no code, no test, no build, and no package change.

## Accomplishments

- **Authored `32-HUMAN-UAT.md` (UAT-32-01, HEAL-01/HEAL-03 live half).** A single human_needed live-UAT record for the irreducibly-live self-healing scenario: on a real authenticated origin a recipe that has genuinely rotted (or is forced to 4xx / empty / shape-mismatch) is detected as a broken verdict (`RECIPE_EXPIRED` / a broken code), the autopilot does NOT hard-fail but falls back to the existing DOM tools (`run_task` / `click` / `type_text` / `read_page` / `get_site_guide`) and STILL completes the SAME task, the broken recipe is quarantined / demoted from routing (skipped on the next `resolve`), and a consent-gated re-learn (`runDiscovery`) is offered / triggered -- while a legitimate no-results and a logged-out (302 -> login) outcome are NOT healed away (HEAL-04 -- fallback never masks a real outcome). The doc carries the exact manual steps (build + load the unpacked extension; sign in; break the origin's recipe; invoke the capability; confirm detection, DOM completion, quarantine, the consent-gated re-learn, and the no-mask of no-results / logged-out).
- **Stated the CI-green / live-deferred / not-fabricated framing explicitly (D-15).** The doc enumerates every CI suite that proves the FSB-owned half headlessly green -- `capability-rot-detector` (the HEAL-04 taxonomy + HEAL-02 `expectedShape` rot), `capability-router` (the `RECIPE_DOM_FALLBACK_PENDING` emit + quarantine + the wired `runDiscovery` re-learn trigger), `capability-autopilot-parity` (the autopilot `makeResult` surfacing), `agent-loop-iterator-guard` (INV-04 untouched), `provider-parity` (INV-03 across all 7 `PROVIDER_KEYS`), `recipe-schema-lock` (the frozen v2 hash, INV-01), `capability-recipe-schema` (the additive v2 schema), `learned-recipe-store` (quarantine-flag-not-delete), `verify-recipe-path-guard.mjs` (eval-free allowlist), and the full `npm test` EXIT 0 milestone gate (HEAL-05, Plan 04) -- and states that ONLY the irreducibly-live end-to-end completion is human_needed, recorded debt, NOT a fabricated pass, and cannot run in CI without a real credential (GOV-06).
- **Resolved the gated checkpoint (Task 2) as deferred human_needed live UAT (auto-mode).** Per the autonomous-run checkpoint policy, the `checkpoint:human-verify` (gate=blocking; NOT a package-legitimacy check, NOT gate=blocking-human) is resolved as recorded live-browser UAT debt joining the v0.9.99 ledger alongside UAT-27-01 and the Phase 29 / 30 / 31 live items. The checkpoint does NOT block the milestone close: the milestone completion criterion is the green HEAL-05 CI gate (the full `npm test` EXIT 0, Plan 04), per D-15. No live result was fabricated -- the scenario is recorded with `result: pending`.
- **Honored the CLAUDE.md no-emoji hard constraint** -- the authored doc is ASCII-only.

## Task Commits

Each task was committed atomically (main working tree, branch `automation-worktree`, hooks ON, no `--no-verify`):

1. **Task 1: Author 32-HUMAN-UAT.md (UAT-32-01, human_needed live self-healing)** - `8531074a` (docs)
2. **Task 2: Live self-healing UAT checkpoint** - resolved as deferred human_needed live UAT (recorded in 32-HUMAN-UAT.md, `result: pending`); no separate commit (no code/state change beyond the Task-1 doc -- the checkpoint resolution is the doc + this summary).

**Plan metadata:** see the final docs commit (this SUMMARY + STATE.md + ROADMAP.md + REQUIREMENTS.md).

## Files Created/Modified

- `.planning/phases/32-self-healing-fallback-recipe-rot-detection-re-learn-provider/32-HUMAN-UAT.md` (created, 48 lines) - the UAT-32-01 human_needed live self-healing record: frontmatter `status: partial` / `result: pending`, a body `human_needed` status, the "Why this is human_needed (not CI-provable)" enumeration of the green CI half, the setup, the single UAT-32-01 scenario row, and the recording-results section. ASCII-only.
- `.planning/phases/32-self-healing-fallback-recipe-rot-detection-re-learn-provider/32-05-SUMMARY.md` (created) - this summary.

## Decisions Made

- **Mirrored the established human_needed UAT shape (27/30/31).** The doc was authored from the `32-VALIDATION.md` Manual-Only Verifications row and follows the `27-HUMAN-UAT.md` / `30-HUMAN-UAT.md` / `31-HUMAN-UAT.md` precedent exactly: the "Why this is human_needed" section lists every CI suite proving the FSB-owned half green, the live property is named precisely, and a single scenario row + a recording-results section close it out.
- **Frontmatter `status: partial` / `result: pending` + body `human_needed`.** The frontmatter uses the Phase-31 convention (`status: partial`, `result: pending`) the orchestrator specified, and the body carries the `human_needed` status the plan's `<automated>` grep + acceptance criteria require (`human_needed >= 1`). Both are satisfied without conflict.
- **The checkpoint is recorded debt, not a fabricated pass.** Task 2 (gate=blocking, non-package) is resolved per the auto-mode policy as deferred human_needed live-browser UAT debt; the milestone close is gated by the green HEAL-05 CI criterion (Plan 04), not by this live UAT. No live outcome was invented (`result: pending`).

## Deviations from Plan

None - the plan executed exactly as written. Task 1 authored the UAT doc per the action spec (the scenario, the manual steps, the pass/fail criteria, the CI-green/live-deferred/not-fabricated statement, the v0.9.99-ledger note, ASCII-only); Task 2 (the gated checkpoint) was resolved per the autonomous-run checkpoint policy as deferred human_needed live UAT. No code, no test, no build, no package change; no auto-fix (Rules 1-3) and no architectural decision (Rule 4) arose.

## Authentication Gates

None - no auth gates encountered (planning-doc-only plan; no external service, no package install). The live UAT itself (deferred) requires a real authenticated origin, but that is the human_needed live half, intentionally not run in this autonomous session.

## User Setup Required

None - `user_setup: []` in the plan; zero external packages installed (T-32-SC: accept -- no npm/pip/cargo install). The live UAT, when a human runs it, requires loading the unpacked extension + signing in to a target origin with a broken recipe (documented in 32-HUMAN-UAT.md Setup).

## Verification

Plan verification block:

- `test -f 32-HUMAN-UAT.md && grep -q "human_needed" && grep -q "UAT-32-01"` -> PASS (the plan's `<automated>` verify).
- `grep -c "human_needed" 32-HUMAN-UAT.md` -> 4 (>= 1; acceptance criterion met).
- The doc names UAT-32-01 and states the CI/automated half is green (the taxonomy + router emit + autopilot surfacing + quarantine + the re-learn trigger) and only the live half is deferred -- "NOT a fabricated pass" present, "headless CI/automated half is GREEN" present (acceptance criterion met).
- Emoji scan -> none (CLAUDE.md hard constraint; acceptance criterion met).
- `min_lines >= 30` -> 48 lines (artifact contract met).

Posture: the checkpoint is gated (autonomous: false); in auto-mode the live UAT is recorded debt and does NOT block the HEAL-05 milestone close (the full `npm test` EXIT 0, Plan 04, is the v0.9.99 completion criterion, per D-15).

## Known Stubs

None - the authored file is a planning markdown and introduces no stubs, TODOs, hardcoded UI-bound empties, or placeholders. The `result: pending` marker is the intentional, documented deferred-UAT state (the live confirmation), not a code stub.

## Threat Flags

None - the authored doc introduces no network endpoints, auth paths, file-access patterns, or trust-boundary schema changes. It realizes the T-32-FAB mitigation from the plan's threat register: the doc explicitly states the CI half is green and only the live half is human_needed -- recorded debt, NOT a fabricated pass (D-15) -- so the milestone close does not claim a live pass it did not run. T-32-LIVE (the live session uses a real authenticated session under the user's supervision; no CI credential, GOV-06) is accepted and reflected in the Setup's "NEVER record a real token/cookie/credential" instruction.

## Next Phase Readiness

- **Phase 32 is execution-complete (all 5 plans done):** Plan 01 (Wave-0 RED suites), Plan 02 (the `classifyRecipeBroken` HEAL-04 taxonomy + HEAL-02 `expectedShape` rot + the additive v2 schema), Plan 03 (the router `RECIPE_DOM_FALLBACK_PENDING` emit + quarantine + the wired consent-gated re-learn + the autopilot surfacing, INV-02/INV-04 held), Plan 04 (the 7-provider parity gate + the frozen v2 schema hash + the full `npm test` EXIT 0 milestone gate, HEAL-05/D-15), and Plan 05 (this human_needed live-UAT closeout).
- **The v0.9.99 milestone completion criterion (HEAL-05) is met** -- capability + fallback + 7-provider parity + schema-lock + the full `npm test` green (Plan 04). The LIVE self-healing end-to-end (UAT-32-01) is `human_needed` recorded debt joining the v0.9.99 live-browser UAT ledger (alongside UAT-27-01 and the Phase 29 / 30 / 31 live items), NOT a CI gate.
- Next: run Phase 32 verification, then the v0.9.99 milestone close/audit. The carried-forward live-browser UAT and release/publish actions remain user-gated debt.

## Self-Check: PASSED

- FOUND: .planning/phases/32-self-healing-fallback-recipe-rot-detection-re-learn-provider/32-HUMAN-UAT.md (created; human_needed x4 + UAT-32-01 present; 48 lines; no emojis)
- FOUND: .planning/phases/32-self-healing-fallback-recipe-rot-detection-re-learn-provider/32-05-SUMMARY.md
- FOUND commit: 8531074a (Task 1, docs)

---
*Phase: 32-self-healing-fallback-recipe-rot-detection-re-learn-provider*
*Completed: 2026-06-23*
