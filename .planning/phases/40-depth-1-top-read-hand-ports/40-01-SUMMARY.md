---
phase: 40-depth-1-top-read-hand-ports
plan: 01
subsystem: capability-catalog-tests
tags: [depth-01, test-infra, upgrade-harness, head-cap, tdd-red]
requires:
  - capability-catalog.js resolve() REGISTRY-first + CGEN-03 descriptor-only fallback
  - the 10 opentabs__<app>__<op>.json backing:dom READ descriptors
provides:
  - tests/head-handler-upgrade.test.js (the dom->T1a slug-exact upgrade-assertion harness)
  - head-handler-cap 4-module expectation (gitlab) with CAP=30 unchanged
  - capability-head-handlers gitlab/slack/notion per-app scaffolds (Wave-1 turns GREEN)
  - npm test runs the upgrade harness
affects:
  - 40-02 (gitlab), 40-03 (slack), 40-04 (notion) -- each edits ONLY its own handler source
  - 40-05 (requires the upgrade harness EXIT 0)
tech-stack:
  added: []
  patterns:
    - zero-framework FSB test convention (passed/failed + check + process.exit)
    - fresh-require catalog to reset REGISTRY for the BEFORE/AFTER upgrade leg
key-files:
  created:
    - tests/head-handler-upgrade.test.js
  modified:
    - tests/head-handler-cap.test.js
    - tests/capability-head-handlers.test.js
    - package.json
decisions:
  - "BEFORE/AFTER leg uses notion.search (a known dom descriptor) toggled by handler presence to prove the upgrade end-to-end"
  - "makeCtx extended so a gitlab /api/v4 GET returns a logged-in array/id-object body, exercising the real logged-out shape guard (slack/github GET-probe behavior preserved)"
  - "Wave-1 behavioral .handle() calls guarded by slug presence -> clean cross-plan RED, never a FATAL crash that aborts the suite"
metrics:
  duration: ~12m
  completed: 2026-06-26
---

# Phase 40 Plan 01: Wave 0 Test Infra (dom->T1a upgrade harness) Summary

Built the phase CORRECTNESS KEYSTONE first: a `tests/head-handler-upgrade.test.js`
harness that proves each of the 10 ported READ slugs UPGRADES its existing opentabs
breadth descriptor `dom`->`T1a` (slug byte-exact via REGISTRY-first resolve), with a
wrong-slug negative control and a BEFORE(T3)/AFTER(T1a) leg; updated the head-cap test to
the 4th module (gitlab) keeping CAP=30; and scaffolded the per-app sections in the
head-handler unit suite so each Wave-1 plan touches ONLY its own handler source.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | dom->T1a upgrade-assertion harness | 857def96 | tests/head-handler-upgrade.test.js |
| 2 | head-handler-cap 4 modules, CAP 30 | 10aee588 | tests/head-handler-cap.test.js |
| 3 | per-app scaffolds + npm-test wiring | 8724eef8 | tests/capability-head-handlers.test.js, package.json |

## The correctness keystone, enforced

The harness asserts, for the 10 slugs (gitlab x5, slack x3, notion x2):
- `resolve(slug, originForThatApp)` returns tier `T1a` (NOT `T3`)
- `descriptor.slug` equals the ported slug BYTE-EXACT
- the entry exposes a handler with an async `handle`
- the resolved origin is the app's first-party origin (Wall 2)

Plus:
- **NEGATIVE CONTROL**: `gitlab.list_projectz` (a deliberate typo) does NOT resolve T1a --
  a mis-registered slug is a dead duplicate, never an upgrade. PASS in Wave 0.
- **BEFORE/AFTER**: seeding `FsbRecipeIndex.descriptors` with the real `notion.search`
  `backing:'dom'` descriptor and toggling handler presence proves `T3` (handler absent) ->
  `T1a` (handler required). BEFORE leg PASS in Wave 0; AFTER leg flips GREEN in 40-04.

## Wave-0 RED status (expected, by design)

- `head-handler-upgrade.test.js`: EXIT 1 (6 pass / 27 fail). The negative control + the
  BEFORE leg PASS; the 10 slug rows + the AFTER leg RED because gitlab.js does not exist
  and the slack/notion slugs are not registered until Waves 40-02/03/04. Runs WITHOUT
  crashing (the gitlab rows emit a deterministic FAIL via existsSync guard). 40-05 requires
  EXIT 0.
- `head-handler-cap.test.js`: EXIT 1 (expects 4 modules; HEAD_HANDLER_MODULES is still 3
  until 40-02 adds FsbHandlerGitlab). Closes GREEN in 40-02 / the final battery.
- `capability-head-handlers.test.js`: EXIT 1 (80 pass / 14 fail). The 14 fails are the
  scaffolded Wave-1 assertions; ALL existing github/slack/notion assertions still pass (no
  weakening), and NO FATAL crash (behavioral calls slug-guarded). Closes GREEN as 40-02/03/04
  land.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Guarded the scaffolded Wave-1 behavioral `.handle()` calls by slug presence**
- **Found during:** Task 3
- **Issue:** Invoking `sl40['slack.list_channels'].handle(...)` while the slug is undefined
  (pre-40-03) threw a `TypeError: Cannot read properties of undefined (reading 'handle')` ->
  a FATAL that aborted the whole suite, so the notion scaffold never ran and the cross-plan
  RED was not clean.
- **Fix:** Wrapped each Wave-1 behavioral block in an `if (slug && typeof slug.handle ===
  'function')` guard with a single deterministic FAIL in the `else` -- mirrors the gitlab
  `existsSync` guard. The suite now REDs cleanly without crashing.
- **Files modified:** tests/capability-head-handlers.test.js
- **Commit:** 8724eef8

**2. [Rule 2 - Critical] makeCtx returns a real logged-in body for gitlab /api/v4 GET reads**
- **Found during:** Task 3
- **Issue:** The shared `makeCtx` stub treats EVERY GET as a token probe (`data: null`).
  GitLab list reads are real REST GETs whose logged-out shape guard (40-02) checks for an
  array; a `null` body would falsely fail the `list_projects` success assertion.
- **Fix:** Refined the stub so a GET to `/api/v4` is a real read (array for list_*, id-object
  for a trailing-id path) while the slack/github GET-probe behavior (token scrape) is
  preserved byte-for-byte. This exercises the REAL logged-out guard rather than bypassing it.
- **Files modified:** tests/capability-head-handlers.test.js
- **Commit:** 8724eef8

## Self-Check: PASSED

- Files: tests/head-handler-upgrade.test.js, tests/head-handler-cap.test.js,
  tests/capability-head-handlers.test.js, package.json -- all FOUND.
- Commits: 857def96, 10aee588, 8724eef8 -- all FOUND.

No production source touched (test infra only): Wall 1/2 + INV-01/02 untouched.
