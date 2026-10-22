---
phase: 40-depth-1-top-read-hand-ports
plan: 05
subsystem: capability-catalog-battery
tags: [depth-01, sign-off, acceptance-gate, inv-01, inv-02, wall-2, head-cap]
requires:
  - 40-02 (gitlab), 40-03 (slack), 40-04 (notion)
provides:
  - the DEPTH-01 green-battery sign-off (10 slugs upgraded dom->T1a; full npm test EXIT 0)
  - the carried-forward live-UAT debt handoff to Phase 41 / human_needed
affects:
  - Phase 41 (Depth 2 + guarded writes; inherits the live-UAT debt + the deferred linear CORS port)
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/40-depth-1-top-read-hand-ports/40-05-SUMMARY.md
  modified:
    - tests/lattice-provider-bridge-smoke.test.js
decisions:
  - "Phase acceptance is the full green battery + the security properties (MECHANISM), NOT live endpoint correctness (carried-forward human_needed)"
metrics:
  duration: ~18m
  completed: 2026-06-26
---

# Phase 40 Plan 05: Final Battery + Sign-Off Summary

The phase acceptance gate. Ran the FULL green battery proving the DEPTH-01 contract holds
end-to-end across BOTH the new-module (gitlab) and extend-module (slack/notion) paths, then
recorded the carried-forward live-UAT debt. This is the MECHANISM + security deliverable;
live endpoint correctness on authenticated tabs is the sole documented human_needed item --
the handlers ship fail-closed so security holds regardless.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | head-handler + upgrade + cap + router + parity battery green | 358dca62 | tests/lattice-provider-bridge-smoke.test.js |
| 2 | full npm test + validate:extension green; sign-off | (this doc) | 40-05-SUMMARY.md |

## The 10 READ slugs upgraded dom->T1a (byte-exact)

| # | Slug | Origin | Module | Path |
| - | ---- | ------ | ------ | ---- |
| 1 | gitlab.list_projects | https://gitlab.com | gitlab (NEW) | GET /api/v4/projects |
| 2 | gitlab.get_project | https://gitlab.com | gitlab (NEW) | GET /api/v4/projects/:id |
| 3 | gitlab.list_issues | https://gitlab.com | gitlab (NEW) | GET /api/v4/projects/:id/issues |
| 4 | gitlab.get_issue | https://gitlab.com | gitlab (NEW) | GET /api/v4/projects/:id/issues/:iid |
| 5 | gitlab.list_merge_requests | https://gitlab.com | gitlab (NEW) | GET /api/v4/projects/:id/merge_requests |
| 6 | slack.list_channels | https://app.slack.com | slack (EXTEND) | POST /api/conversations.list |
| 7 | slack.list_members | https://app.slack.com | slack (EXTEND) | POST /api/conversations.members |
| 8 | slack.get_channel_info | https://app.slack.com | slack (EXTEND) | POST /api/conversations.info |
| 9 | notion.search | https://www.notion.so | notion (EXTEND) | POST /api/v3 search RPC |
| 10 | notion.get_database | https://www.notion.so | notion (EXTEND) | POST /api/v3 getRecordValues RPC |

**10 READ heads, 4 head modules (github/slack/notion/gitlab).**

## The green battery (all EXIT 0)

| Gate | Result | Proves |
| ---- | ------ | ------ |
| node tests/head-handler-upgrade.test.js | 48/0 EXIT 0 | SC1: all 10 slugs resolve T1a byte-exact + negative control (wrong slug != upgrade) + BEFORE(T3)/AFTER(T1a) |
| node tests/capability-head-handlers.test.js | EXIT 0 | SC2: per-app tier/origin/no-api-subdomain/no-chrome/one-executeBoundSpec/token-in-body/logged-out-guard |
| node tests/head-handler-cap.test.js | 5/0 EXIT 0 | SC3: HEAD_HANDLER_MODULES = 4 (<=30), identity-locked github/slack/notion/gitlab |
| node tests/capability-router.test.js | 46/0 EXIT 0 | INV-02 parity + the origin-pin RECIPE_ORIGIN_MISMATCH-before-executeScript (Wall 2) |
| node tests/capability-autopilot-parity.test.js | 17/0 EXIT 0 | INV-01: both capability tools out of TOOL_REGISTRY + EXPECTED_NON_TRIGGER_REGISTRY_HASH unmoved; both front doors -> the SAME router.invoke |
| npm run validate:extension | EXIT 0 | Wall 1 (recipe-path-guard, 4 bundled-head handlers allowlisted) + classification-gate + crosscheck + no-duplicate-stem + no-orphan-descriptor; descriptors UNCHANGED (2306, 0 orphans) |
| npm test | EXIT 0 | the full CI suite (24 `failed: 0` summaries, zero FAIL lines) |

## Invariants + Walls (all intact)

- **INV-01** -- no new MCP tool; the frozen `EXPECTED_NON_TRIGGER_REGISTRY_HASH` is unmoved;
  invoke_capability + search_capabilities stay OUT of TOOL_REGISTRY. (autopilot-parity PASS.)
- **INV-02** -- both front doors (MCP dispatcher mcp:capabilities-invoke + autopilot
  tool-executor) call the SAME `globalThis.FsbCapabilityRouter.invoke`; the T1a heads
  register into the SAME catalog. No autopilot-only path. (router + autopilot-parity PASS.)
- **Wall 1** -- the heads are reviewed CODE, not descriptors; NO forbidden descriptor field;
  verify-recipe-path-guard green (gitlab.js eval-scanned + allowlisted); the opentabs
  descriptors are UNCHANGED (still backing:'dom' -- the heads upgrade via REGISTRY-first,
  no descriptor edit, no orphan, no dup-stem).
- **Wall 2** -- the origin-pin is the single chokepoint: spec.origin != active-tab origin ->
  RECIPE_ORIGIN_MISMATCH BEFORE any executeScript (fail-closed, no side effect). Every head
  targets its app's OWN first-party origin; NO separate api-host subdomain string; NO
  chrome.scripting/chrome.tabs in any handler. executeBoundSpec called exactly once per read.
- **Head cap** -- HEAD_HANDLER_MODULES = 4 <= 30 (CAP unchanged).

## Security battery results

| Property | Result |
| -------- | ------ |
| Origin-pin (Wall 2) | PASS -- RECIPE_ORIGIN_MISMATCH before executeScript; every head first-party-origin |
| No scraped token on a log line | PASS -- slack xoxc only in the bound-spec body; no console names a token/cookie/csrf var (gitlab/slack) |
| No api-subdomain | PASS -- source scan: no separate api-host literal in gitlab/slack/notion |
| Head cap <=30 | PASS -- 4 modules, identity-locked |
| Logged-out guard (no 200-with-logged-out-body) | PASS -- gitlab array/id-object guard, notion non-null-object guard, slack missing-token -> RECIPE_DOM_FALLBACK_PENDING |

## App-selection correction (linear -> gitlab) -- for the milestone log

CONTEXT/ROADMAP named **linear** the flagship single-origin PRIMARY. The vendored ground
truth contradicted it: `vendor/opentabs-snapshot/plugins/linear/src/linear-api.ts:18`
hardcodes `https://client-api.linear.app/graphql` -- a SEPARATE subdomain from `linear.app`
reachable only via cross-origin CORS, which the Wall-2 origin-pin
(`spec.origin !== tabOrigin` -> RECIPE_ORIGIN_MISMATCH) correctly rejects. Linear is a
Pattern-D port -- the exact CORS-gate class **Phase 41 OWNS**. Honoring the locked
first-party-origin-ONLY constraint over the illustrative app name (app selection is Claude's
discretion), **linear was DEFERRED to Phase 41** and **gitlab substituted as the NEW module**
(`https://gitlab.com/api/v4` is a PATH on the gitlab.com origin, NOT an api-host subdomain --
verified genuinely same-origin in `gitlab/src/gitlab-api.ts:13`). slack + notion extends
stayed PRIMARY (vendored source confirms genuinely same-origin). Final set = 10 READ heads,
4 head modules.

## Carried-forward human_needed live-UAT debt (verbatim, 40-VALIDATION.md Manual-Only)

> **Live endpoint-correctness** (the exact first-party internal API path returns the expected
> READ shape on a real authenticated tab). **Why manual:** Requires a logged-in browser
> session per app (no live auth in the autonomous run); the handlers ship **fail-closed**
> (wrong origin -> `RECIPE_ORIGIN_MISMATCH`; wrong path / logged-out 200 -> HEAL ->
> `RECIPE_DOM_FALLBACK_PENDING`) so security holds regardless -- only live correctness is
> unproven. **Test instructions:** For each ported app: open an authenticated tab on the
> first-party origin, invoke the read via `search_capabilities`->`invoke_capability`, confirm
> a real (non-logged-out) payload + that the `expectedShape`/extract guard rejects a
> logged-out body. **Carried-forward user-gated debt** (consistent with prior phases).

Specifically [ASSUMED] (training/inference-derived, to be confirmed on a live authenticated
tab): the gitlab same-origin `/api/v4` read paths; the slack `/api/conversations.*` method
paths + the exact xoxc page location/body field; the notion `/api/v3` op names (`search`,
`getRecordValues`) + body shapes. All ship fail-closed via their per-handler logged-out
shape guard.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Bumped the background.js importScripts byte-freeze count for gitlab.js**
- **Found during:** Task 1 (the full battery surfaced it via npm test)
- **Issue:** `tests/lattice-provider-bridge-smoke.test.js` (Part 6 INV byte-freeze) asserts a
  hardcoded `importScripts count = 186` / `call sites = 182`. 40-02's
  `importScripts('catalog/handlers/gitlab.js')` line made the real counts 187/183, RED'ing
  the assertion -- the ONLY real failure in the full npm test (the PayloadTooLargeError +
  WebSocket-unavailable lines are expected negative-path stderr with PASS assertions around
  them).
- **Fix:** Bumped both counts +1 with a Phase-40 annotation. Directly caused by this phase's
  background.js change (in-scope). The full npm test then EXIT 0.
- **Files modified:** tests/lattice-provider-bridge-smoke.test.js
- **Commit:** 358dca62

## Self-Check: PASSED

- File: .planning/phases/40-depth-1-top-read-hand-ports/40-05-SUMMARY.md -- created.
- Commit: 358dca62 -- FOUND.
- npm test EXIT 0 (verified); validate:extension EXIT 0 (verified); the
  upgrade/head-handlers/cap/router/autopilot-parity battery all EXIT 0 (verified).
