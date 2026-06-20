---
phase: 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s
plan: 03
subsystem: testing
tags: [human-uat, fetch-05, logged-in-shape, live-browser, uat-debt, human-gated, origin-pin, same-origin-cookie]

# Dependency graph
requires:
  - phase: 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s
    plan: 01
    provides: interpreter origin-pin (RECIPE_ORIGIN_MISMATCH) + RECOVERY_AMBIGUOUS registration that the live origin-pin / mid-mutation scenarios reference
  - phase: 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s
    plan: 02
    provides: capability-fetch.js (executeBoundSpec MAIN-world credentialed fetch + active-tab pin + resume-sidecar) and the hardcoded github.com GET /notifications recipe the human runs; tests/capability-fetch.test.js proves every FSB-owned mechanic through mocks (the CI half of FETCH-05)
provides:
  - 27-HUMAN-UAT.md (status human_needed) recording the irreducibly-live FETCH-05 logged-in-shape assertion in FSB's established HUMAN-UAT format (frontmatter, Setup, Required Scenarios table, Recording Results)
  - UAT-27-01 (logged-in shape, 200-not-302 / non-empty user-login meta), UAT-27-02 (logged-out contrast), UAT-27-03 (live origin-pin RECIPE_ORIGIN_MISMATCH) as human_needed scenarios
  - The Phase-27 evidence gap is honestly recorded as accepted live-browser UAT debt, joining the existing v0.10/v0.11/v0.12 FSB UAT ledger in STATE.md (Phase 25 PhantomStream precedent)
affects: [28-lean-mcp-surface, 32-self-heal-uat, milestone-close-uat-reconciliation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Honest evidence gap: the one irreducibly-live property (real HttpOnly cookies attach in the page MAIN world -> logged-in body shape) is recorded as a human_needed UAT, never a fabricated pass; CI green does not depend on it"
    - "Human-gated live checkpoint surfaces exact run-and-observe steps WITHOUT auto-launching Chrome or any server (project never-auto-launch rule), with an explicit accept-as-debt resume path"

key-files:
  created:
    - .planning/phases/27-authenticated-fetch-primitive-main-world-origin-pin-resume-s/27-HUMAN-UAT.md
    - .planning/phases/27-authenticated-fetch-primitive-main-world-origin-pin-resume-s/27-03-SUMMARY.md
  modified: []

key-decisions:
  - "D-15 (accepted as recorded debt): the auto-mode checkpoint approval = ACCEPT the human_needed UAT as documented debt, NOT a fabricated pass; UAT-27-01..03 stay status human_needed until a human records dated, environment-stamped outcomes"
  - "FETCH-05 is split into two honest halves: the automated/CI half (the smoke test against the stubbed seam, proven green in Plan 02's tests/capability-fetch.test.js) is satisfied; the irreducibly-live half (real GitHub HttpOnly _gh_sess/logged_in cookies attach in the page MAIN world -> logged-in shape) remains human_needed debt"
  - "This plan introduces NO code, build, or package change -- it authors one markdown doc and gates a checkpoint (T-27-SC: zero installs, no build)"

patterns-established:
  - "Recorded-debt UAT closeout: a milestone-critical live-browser property that cannot exist in CI without shipping a real credential (forbidden by GOV-06/auth-stays-local) is logged as a human_needed UAT in the established format and added to the STATE.md debt ledger"

requirements-completed: [FETCH-05]

# Metrics
duration: 3min
completed: 2026-06-20
---

# Phase 27 Plan 03: Live FETCH-05 Logged-In-Shape Closeout Summary

**The one property the entire phase exists to de-risk -- that real GitHub HttpOnly cookies actually attach in the page MAIN world and yield a LOGGED-IN (not logged-out) body shape -- is now recorded as a human_needed UAT (27-HUMAN-UAT.md, UAT-27-01) in FSB's established format, surfaced to the operator as a human-gated live checkpoint that never auto-launches anything, and accepted in auto-mode as documented live-browser UAT debt joining the existing v0.10/v0.11/v0.12 ledger (Phase 25 PhantomStream precedent); the automated/CI half of FETCH-05 was proven green in Plan 02, so this plan ships an honest evidence gap, not a fabricated pass, with zero code/build/package change.**

## Performance

- **Duration:** ~3 min (this plan's execution; continuation from the Task 2 checkpoint)
- **Started:** 2026-06-20
- **Completed:** 2026-06-20
- **Tasks:** 2 (Task 1 auto; Task 2 human-verify checkpoint)
- **Files modified:** 1 created this plan (27-HUMAN-UAT.md), + this SUMMARY; no source/build/package files

## Accomplishments
- **Task 1 (auto, committed 9a722762):** authored `27-HUMAN-UAT.md` (frontmatter `status: human_needed`, created 2026-06-20) mirroring the Phase 25 PhantomStream HUMAN-UAT structure exactly -- intro paragraph stating the scenario was NOT executed autonomously and must not be treated as passed until a human records the result; a `## Setup` numbered list (load `extension/` unpacked, sign in to github.com, keep the active tab on `https://github.com`, have `catalog/recipes/github-notifications.json` on the Phase-27 entry path); a `## Required Scenarios` table (UAT-27-01 logged-in shape, UAT-27-02 logged-out contrast, UAT-27-03 live origin-pin); and a `## Recording Results` paragraph instructing dated/Chrome-version/commit-stamped outcomes plus A1/A2 re-verification at run time. ASCII-only, no emojis, no command that auto-launches an application.
- **UAT-27-01 (the FETCH-05 live assertion, D-14):** a human signed in to github.com with the active tab on `https://github.com` runs the hardcoded `github.com GET /notifications` recipe through the Phase-27 entry path and confirms HTTP 200 (NOT a 302 to `/login?return_to=...`) AND/OR a NON-EMPTY `<meta name="user-login">` -- the property that the first-party HttpOnly cookies attached in the page MAIN world and the body is the logged-in shape. UAT-27-02 (signed-out -> 302 / empty meta) confirms the result was genuinely cookie-attached; UAT-27-03 (non-github active tab -> `RECIPE_ORIGIN_MISMATCH`, no side effect) exercises the live origin-pin.
- **Task 2 (checkpoint:human-verify, gate=blocking):** the live-run-and-observe steps were surfaced to the operator with an explicit accept-as-debt path; the checkpoint never launched Chrome or any server (project never-auto-launch rule). In auto-mode the orchestrator AUTO-APPROVED with `user_response="approved"` = ACCEPT the human_needed UAT as recorded debt. Per the accept-as-debt semantics, UAT-27-01..03 stay `human_needed` (NOT rewritten to a pass) and the gap joins the STATE.md live-browser UAT ledger.
- **Honest FETCH-05 posture recorded:** the requirement's automated/CI half (the smoke test asserting the logged-in shape through the chosen execution context, stubbed seam) was proven green in Plan 02 (`tests/capability-fetch.test.js`, 26 PASS); the irreducibly-live half (real GitHub HttpOnly `_gh_sess`/`logged_in` cookies attach -> logged-in body shape) is recorded as human_needed debt. No fabricated pass was entered (T-27-12 mitigated).

## Task Commits

Each task was committed atomically:

1. **Task 1: Author 27-HUMAN-UAT.md (live logged-in-shape assertion, human_needed)** - `9a722762` (docs) -- committed by the prior executor before the checkpoint; verified present in this continuation.
2. **Task 2: Human-gated live FETCH-05 logged-in-shape verification (checkpoint)** - no commit (no code/live action; auto-approved as recorded debt -- the documentation outcome is captured in this SUMMARY + the STATE.md debt ledger).

**Plan metadata:** _(this SUMMARY + STATE.md/ROADMAP.md/REQUIREMENTS.md annotation in the final docs commit)_

_Note: This plan creates no source/build/package change. Task 1 is the only code-tree (docs-tree) commit; Task 2 is a human-gated checkpoint resolved as accepted debt._

## Files Created/Modified
- `.planning/phases/27-authenticated-fetch-primitive-main-world-origin-pin-resume-s/27-HUMAN-UAT.md` (NEW, committed 9a722762 in Task 1) - the human_needed live-browser UAT: UAT-27-01 (logged-in shape, 200-not-302 / non-empty user-login meta), UAT-27-02 (logged-out contrast), UAT-27-03 (live origin-pin RECIPE_ORIGIN_MISMATCH). ASCII-only; no auto-launch command.
- `.planning/phases/27-authenticated-fetch-primitive-main-world-origin-pin-resume-s/27-03-SUMMARY.md` (NEW, this file) - the plan summary.
- No `extension/`, `mcp/`, `catalog/`, `tests/`, `package.json`, or manifest/permission change in this plan (CAP-05 posture preserved).

## Decisions Made
- Followed the plan as specified (D-14 logged-in-shape assertion recorded; D-15 human-gated live UAT half). The single continuation judgment: the auto-mode `"approved"` resume signal means ACCEPT-AS-DEBT (the plan's explicit accept path), so the UAT statuses were LEFT at `human_needed` -- no observed result was fabricated. The Phase 25 PhantomStream HUMAN-UAT (`human_needed`; 12 live Chrome-extension scenarios, already on the STATE.md ledger) is the direct precedent this closeout mirrors.

## Deviations from Plan

None - plan executed exactly as written. No Rule 1-4 deviations; no architectural changes; no out-of-scope fixes. (Note: the working tree carries PRE-EXISTING unrelated modifications under `showcase/`, `extension/dist`, `extension/ws`, and several `tests/*.js` from before this plan; per the scope boundary these were NOT touched, staged, or committed by this plan -- only the two `.planning/` docs files for plan 27-03 were staged individually.)

## Authentication Gates
None - no auth gate occurred. The single property requiring a real authenticated browser session (real GitHub HttpOnly cookies attach -> logged-in body shape) is NOT a code property and NOT an auth gate for this autonomous run -- it is a Chrome+GitHub behavior recorded as the human_needed UAT-27-01 by design (D-15), with FSB holding no credential (auth stays local, GOV-06).

## Threat Surface
All threat-register items for this plan are honored: T-27-12 (Repudiation / unverified live claim) mitigated -- the doc is `status: human_needed` and forbids treating the scenario as passed until a human records dated, environment-stamped results; no fabricated pass entered the ledger. T-27-13 (Information Disclosure / self-access) accepted -- the UAT is a personal, supervised, read-only GET on the operator's own github.com session; FSB handles no credential. T-27-SC (Tampering / package installs) mitigated -- this plan installs NO packages and runs no build; it authors one markdown doc and gated a checkpoint. No NEW security surface beyond the plan's `<threat_model>` was introduced.

## Known Stubs
None - no stub patterns (hardcoded empty values flowing to UI, placeholder text, or unwired data sources) were introduced. The UAT-27-01..03 `human_needed` statuses are deliberate recorded debt (the honest evidence gap, per D-15), not a code stub: the FETCH-05 mechanics are fully implemented and CI-proven in Plan 02; only the irreducibly-live observation is outstanding, and it is documented with exact run-and-observe steps and a recording procedure.

## Issues Encountered
None - the prior executor's Task 1 commit (9a722762) and `27-HUMAN-UAT.md` were verified present and correct (status `human_needed`, UAT-27-01 carries the 200-not-302 / non-empty user-login meta expectation and names `catalog/recipes/github-notifications.json`); no rework was needed. The checkpoint was resolved per the auto-mode accept-as-debt path with no code or live action.

## User Setup Required
None - no external service configuration required. The live FETCH-05 UAT is operator-run when a human chooses to record it: load `extension/` unpacked, sign in to github.com, keep the active tab on `https://github.com`, run the `github.com GET /notifications` recipe via the Phase-27 entry path, and record the observed HTTP status + `<meta name="user-login">` content into `27-HUMAN-UAT.md` (replace `human_needed` with pass/fail/partial + date, Chrome version, extension commit). Re-verify the A1/A2 GitHub-behavior assumptions at run time (the user-login meta name, the signed-out 302 shape) since GitHub's web UI can change.

## Next Phase Readiness
- Phase 27 is execution-complete (all 3 plans done): Plan 01 (interpreter origin-pin + RECOVERY_AMBIGUOUS), Plan 02 (the capability-fetch MAIN-world spine + active-tab pin + resume-sidecar + the FETCH-01..05 CI suite), and this Plan 03 (the live FETCH-05 logged-in-shape closeout as recorded human_needed debt). Phase 28 (Lean MCP Surface + Capability Search) consumes `executeBoundSpec` from Plan 02.
- One carried item: the live FETCH-05 logged-in-shape assertion (UAT-27-01) remains `human_needed` debt on the STATE.md UAT ledger, alongside the existing v0.10/v0.11/v0.12 live-browser UAT items. CI green does not depend on it; it is reconciled at the milestone-close UAT pass (or whenever a human records a run). No blockers.

## Self-Check: PASSED

- Files verified present: `.planning/phases/27-authenticated-fetch-primitive-main-world-origin-pin-resume-s/27-HUMAN-UAT.md` (status human_needed, UAT-27-01 with 200-not-302 / non-empty user-login meta), `.planning/phases/27-authenticated-fetch-primitive-main-world-origin-pin-resume-s/27-03-SUMMARY.md`.
- Commit verified present: `9a722762` (Task 1, docs -- 27-HUMAN-UAT.md, 29 insertions, only that file changed).
- Posture verified honest: 27-HUMAN-UAT.md status remains `human_needed` (accept-as-debt, NOT rewritten to a pass); REQUIREMENTS.md FETCH-05 reflects automated/CI half satisfied with the live half annotated as human_needed debt; STATE.md Deferred Items records the Phase 27 / 27-HUMAN-UAT.md live FETCH-05 gap. No code/build/package change introduced by this plan.

---
*Phase: 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s*
*Completed: 2026-06-20*
