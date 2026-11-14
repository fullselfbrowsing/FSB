---
phase: 69-mcp-descriptions-and-same-call-checks
plan: 08
subsystem: testing
tags: [phase-gate, footprint-audit, tool-count, node20, validation, mcp-01, mcp-02, mcp-04]

# Dependency graph
requires:
  - phase: 69-mcp-descriptions-and-same-call-checks
    provides: "69-01..69-07: the fixture and generator, short descriptions with the budget gate on, the expect evaluator and D-25 redaction, dispatcher wiring, the MCP expect wire, parity, and the SC4 layer 1 and 2 proofs"
provides:
  - "REQUIREMENTS MCP-01, ROADMAP Phase 69 SC1 and PROJECT.md give the tool count as 72 at 8a058bdf, 73 with the Phase 66.1 settings tool (D-02)"
  - "69-VALIDATION.md signed off for automation: all 28 per-task rows green, status complete, wave_0_complete and nyquist_compliant true, and every Manual-Only row tagged V1/V4/V5/V6"
  - "Phase gate evidence: footprint audit, full chain, MCP smoke, screenshot suites, fixture --check and Node 20 runs, all exit 0"
affects: [69-verify, 70, 71]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase-gate audit: diff --name-only against the sweep-baseline head, matched to an allow-list, plus git diff --quiet on the frozen registry, background.js, manifest, content, prompts, resources and the bench lock"

key-files:
  created:
    - .planning/phases/69-mcp-descriptions-and-same-call-checks/69-08-SUMMARY.md
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/PROJECT.md
    - .planning/phases/69-mcp-descriptions-and-same-call-checks/69-VALIDATION.md

key-decisions:
  - "Task 1 was already committed as e9eb124a by an earlier session. It was verified against every acceptance criterion and not redone."
  - "The full gate ran as the strict `npm run validate:extension && npm test` chain, not the tolerant runner. Port 7226 was free this time (only the native-host stdio runtime held 7225), so mcp-install-platforms passed and the chain exited 0 with no EADDRINUSE."

patterns-established:
  - "Phase 70/71 gates can reuse this audit: START = 69-SWEEP-BASELINE.json head, allow-list diff, frozen-file diff --quiet, force-tracked build status after a rebuild"

requirements-completed: [MCP-01, MCP-02, MCP-04]

# Metrics
duration: 12min
completed: 2026-10-16
---

# Phase 69 Plan 08: Tool-count wording fix and the Phase 69 gate Summary

**The planning docs now give the tool count as 72 at `8a058bdf`, 73 with the settings tool. The Phase 69 automated gate passed. Every code change since `$P69_START` (`f978e989`) is inside the allowed footprint. The registry, `background.js`, the manifest, the content scripts, prompts, resources and the bench lock are byte-identical. The strict full chain exited 0 with all 334 commands, and so did the smoke and screenshot suites, the fixture `--check` and all 10 new suites under Node 20.20.2. Nothing was pushed.**

## Performance

- **Duration:** about 12 min, including a 4 min 53 s background run of the full chain
- **Started:** 2026-10-17T02:11Z
- **Completed:** 2026-10-17T02:25Z
- **Tasks:** 2 (Task 1 was already committed; it was verified here)
- **Files modified:** 4 planning files

## Accomplishments

- **Tool count wording (D-02).** REQUIREMENTS MCP-01 and ROADMAP SC1 now say "the 72 tools at `8a058bdf`, 73 with the Phase 66.1 settings tool". PROJECT.md says "72 at `8a058bdf`, 73 with the settings tool", and its surface line reads "72 tools at `8a058bdf` with 54,024 characters of descriptions … 34,217 characters of parameter descriptions". None of the user-facing counts moved: `mcp/README.md`, `skills/`, `tests/mcp-version-parity.test.js` and `mcp/src/prompts/index.ts` are unchanged (202/0).
- **Footprint audit (T-69-09).** The audit came back clean. Details follow.
- **Full gate.** All checks exited 0 (table below).
- **69-VALIDATION.md signed off for automation.** The changes:
  - All 28 per-task rows read ✅ green.
  - The frontmatter has `status: complete`, `wave_0_complete: true` and `nyquist_compliant: true`.
  - The Wave 0 and sign-off checklists are ticked (17 items), and a short evidence block backs the Wave 0 items.
  - The approval line reads "automated gate passed (human items deferred to the Validation Block)".
- **No push (T-69-SC).** `origin/Jev` and `origin/main` do not contain the phase start (`f978e989`) or HEAD. `Jev` was 80 commits ahead of `origin/Jev` (0 behind) before this plan's commits, and every phase commit exists only locally.

## Footprint audit (START = `f978e989`, the head of `69-SWEEP-BASELINE.json`)

`git diff --name-only f978e989 -- mcp/src extension scripts` lists 21 paths. Every one is in the allowed footprint:

| Area | Changed paths |
|------|---------------|
| `mcp/src` (14) | `errors.ts`, `tools/agents.ts`, `tools/autopilot.ts`, `tools/capabilities.ts`, `tools/descriptions.ts`, `tools/manual.ts`, `tools/observability.ts`, `tools/read-only.ts`, `tools/schema-bridge.ts`, `tools/screenshots.ts`, `tools/settings.ts`, `tools/triggers.ts`, `tools/vault.ts`, `tools/visual-session.ts` |
| `extension` (5) | `utils/action-verification.js`, `utils/mcp-lattice-journal.js`, `utils/mcp-session-recorder.js`, `ws/mcp-bridge-client.js`, `ws/mcp-tool-dispatcher.js` |
| `scripts` (2) | `mcp/lib/tools-list.mjs`, `mcp/tools-list-baseline.mjs` |

Outside these, only `package.json`, `tests/` (13 suites and edits, plus `tests/fixtures/expect-outcome.html`, `tests/fixtures/mcp-tools-list-8a058bdf.json` and `tests/helpers/mcp-in-process.mjs`) and `.planning/` changed.

Byte-identity and build checks:
- `git diff --quiet f978e989 -- extension/ai/tool-definitions.js extension/background.js extension/manifest.json extension/content mcp/src/prompts mcp/src/resources scripts/bench/tasks/core.lock.json` exited 0.
- `git diff --quiet 8a058bdf -- extension/ai/tool-definitions.js mcp/ai/tool-definitions.cjs` exited 0, so the registry is still identical to the pin.
- After `npm --prefix mcp run build` (exit 0), `git status --short` printed nothing for the six force-tracked `mcp/build` files, for `mcp/build` as a whole and for `mcp/ai`.
- `node tests/lattice-provider-bridge-smoke.test.js` passed 112/0, and the `importScripts` pins are unchanged at 334 and 330.

## Gate command exits (Node v24.14.1, HEAD `73a273ab` + VALIDATION edit)

| Command | Exit | Result |
|---------|------|--------|
| `npm run validate:extension && npm test` (background, 02:15:22Z to 02:20:15Z) | 0 | Every command ran (15 `validate:extension` steps, 16 pretest, 318 test), with 0 `EADDRINUSE`. The last command, `node --test tests/expect-outcome-browser.test.mjs`, ran 10 passed, 0 skipped. |
| `npm run test:mcp-smoke:tools` | 0 | 307 passed, 0 failed |
| `npm run test:screenshot` | 0 | 30/0 and 8/0 |
| `node scripts/mcp/tools-list-baseline.mjs --check` | 0 | Matches the rebuilt `8a058bdf` byte for byte: 72 tools, 54,024 / 34,217 / 121,379, sha256 `b0e67bb7…8274b8` |
| Plan 69-08 Task 2 `<verify>` (build, the 10 new suites, `lattice-provider-bridge-smoke`, `delegation-phase-contract`, frozen-file diff) | 0 | 15 s |
| `node tests/mcp-client-identity-integration.test.js` (ALL-a) | 0 | — |
| `node tests/mcp-version-parity.test.js` (69-08-01) | 0 | 202 passed, 0 failed |

Crawler files: the chain rewrote `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}`. They were restored with `git checkout --`, and `git status --short showcase/angular/public` then printed nothing. They were never committed.

## Node 20 results (`npx --offline -y node@20`, v20.20.2)

| Suite | Exit | Result |
|-------|------|--------|
| `tests/mcp-tools-list-baseline.test.js` | 0 | 16/0 |
| `tests/mcp-tools-list-shape-freeze.test.js` | 0 | 124/0 |
| `tests/mcp-description-budget.test.js` | 0 | 55/0 |
| `tests/expect-evaluator.test.js` | 0 | 59/0 |
| `tests/change-report-redaction.test.js` | 0 | 15/0 |
| `tests/expect-dispatcher.test.js` | 0 | 142/0 |
| `tests/mcp-expect-wire.test.js` | 0 | 193/0 |
| `tests/expect-parity.test.js` | 0 | 82/0 |
| `--test tests/mcp-expect-caller.test.mjs` | 0 | 12 tests, 12 passed, 0 skipped |
| `--test tests/expect-outcome-browser.test.mjs` | 0 | 10 tests, 10 passed, 0 skipped (headless Chrome ran) |

## Task Commits

1. **Task 1: Doc-only tool-count wording fix:** `e9eb124a` (docs). An earlier session committed this before `73a273ab`. This run re-verified it: the `<verify>` command exits 0, `grep -c` on both files prints 1, and `git diff --quiet` on the forbidden paths exits 0.
2. **Task 2: Phase gate and VALIDATION sign-off:** `42a20bb0` (docs)

**Plan metadata:** the docs commit that adds this SUMMARY.

## Files Created/Modified

- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/PROJECT.md`: the tool-count wording (in `e9eb124a`).
- `.planning/phases/69-mcp-descriptions-and-same-call-checks/69-VALIDATION.md`: per-task statuses, frontmatter, checklists, gate evidence and approval.
- `.planning/phases/69-mcp-descriptions-and-same-call-checks/69-08-SUMMARY.md`: this file.
- **Untouched:** no product source, test or build file changed in this plan.

## Decisions Made

- The strict chain replaced the tolerant runner because port 7226 was free this time. The process on 7225 is pid 53880, `~/.fsb/native-host/runtime/package/build/index.js stdio`, which was left alone. With 7226 free, `mcp-install-platforms` passes, so the chain could be run exactly as the plan wrote it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The `nyquist_compliant: true` literal appeared twice in 69-VALIDATION.md**
- **Found during:** Task 2, while checking the acceptance criteria.
- **Issue:** `grep -c "nyquist_compliant: true"` printed 2, not the required 1. The sign-off checklist item "`nyquist_compliant: true` set in frontmatter" repeated the literal, and it already did so before this plan.
- **Fix:** I reworded the item to "`nyquist_compliant` is set to `true` in the frontmatter". The meaning is the same, and the frontmatter is now the only match.
- **Files modified:** `69-VALIDATION.md`
- **Commit:** `42a20bb0`

### Additions beyond "set Status" (documentation only)

- In the per-task table's File Exists column, `❌ W0` now reads `✅ W0` (and `✅ extend` reads `✅ extended`). The files exist now, and the old red mark would have looked like a failure next to a green status. The legend explains the marker.
- A gate-evidence note under the table, and a Wave 0 evidence block under the Wave 0 checklist, cite the commands and commits behind each ticked item.

### Not redone

- Task 1 was already committed (`e9eb124a`), so it was verified, not repeated.

## Issues Encountered

None. The environmental `mcp-install-platforms` failure from the earlier plans did not occur, because 7226 was free.

## Deferred to Validation Block

- **V1:** the baseline digest cross-check. The V1 live bench identity at `8a058bdf` must record `toolsList.sha256 = 8321cc72…8c4a05`, the digest MCP-01-a asserts for the fixture.
- **V4:**
  - exact `count_tokens` for the baseline and new `tools/list` on the pinned host models
  - the caller effect of the shorter descriptions (errors, turns, wall time) in the MCP arm
  - calibration of the `expect` constants (2,000 ms default, 5,000 ms cap, poll interval, 750 ms probe race, `back` headroom, string cap, two-probe negatives)
  - the turn reduction from `expect` on the comparative corpus
- **V5:**
  - a human read-through of all 73 descriptions for clarity and safety wording
  - real-site verdicts (SPA, cross-origin, slow pages, BF-cache `go_back`, `pendingUrl`/`loading`, shadow DOM, iframes, `alert()`, background tabs)
  - ISOLATED-world probes and FSB ref resolution on the real unpacked extension (Profile 2 or 5)
  - live SC4 in Claude Code: one `tools/call` returning `verified`, with no follow-up read
  - live version skew against the Web Store build (`badgafnf…`)
  - The password and hidden-token echo through `change_report.inputs_changed` and the `value` entries of `attrs_changed` is no longer deferred. Plan 69-03 Task 3 fixed it (D-25).
- **V6:**
  - the MCP minor-version publish and the Phase 71 release compatibility check
  - publishing the extension before the MCP package
  - docs for `expect` and the tool counts (`mcp/README.md`, `skills/fsb/`, showcase; 66.1 D-22)
  - the new suites on CI's Node 20, and layer 2 actually running (not skipping) on `ubuntu-latest`; read the CI log for the 10 pass lines
  - merge to `main` (pushing triggers `deploy.yml`, `chrome-extension.yml` and `npm-publish.yml`)

V2 and V3 gain nothing from this phase, because Phase 69 makes no Jev calls.

## Known Stubs

None.

## Next Phase Readiness

- Phase 69 is ready for `/gsd:verify-work`. The orchestrator still owns the STATE.md, ROADMAP.md and REQUIREMENTS.md tracking writes, including the MCP-01, MCP-02 and MCP-04 checkboxes.
- The user-facing tool counts (README, skills, showcase, the prompt's "FSB Tool Reference (49 tools)" table and the pinned counts in `tests/mcp-version-parity.test.js`) intentionally stay as they are until Phase 71 (V6).

## Self-Check: PASSED

- Files: `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/PROJECT.md`, `69-VALIDATION.md` and this SUMMARY exist.
- Commits `e9eb124a` and `42a20bb0` exist on `Jev`, and neither has an attribution line.
- `grep -c "nyquist_compliant: true" 69-VALIDATION.md` prints 1, and all 11 Manual-Only rows carry a V-id (V1 ×1, V4 ×4, V5 ×5, V6 ×1).
- `git status --short showcase/angular/public` and `git status --short` on the six force-tracked `mcp/build` files and `mcp/ai` print nothing.
