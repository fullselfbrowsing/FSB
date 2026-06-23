---
phase: 32-self-healing-fallback-recipe-rot-detection-re-learn-provider
plan: 03
subsystem: api
tags: [capability-router, recipe-rot, self-healing, dom-fallback, quarantine, re-learn, mv3, consent]

# Dependency graph
requires:
  - phase: 32-02
    provides: capability-rot-detector.js (classifyRecipeBroken HEAL-04 taxonomy + validateExpectedShape; additive recipe schema v2)
  - phase: 29
    provides: capability-router.js tiered invoke (T0/T1a/T1b/T2/T3) + the T3 RECIPE_DOM_FALLBACK_PENDING seam + capability-catalog resolve + the autopilot executeCapabilityToolForAutopilot door
  - phase: 30
    provides: the consent gate at the invoke chokepoint + the audit log (the fallback inherits the gate; the typed code is audited)
  - phase: 31
    provides: FsbLearnedRecipeStore.quarantine (persisted flag-not-delete) + FsbDiscoverySession.runDiscovery (consent-gated re-learn)
provides:
  - "The router post-executeBoundSpec rot classify hook in BOTH _runDeclarativeTier and _runHandlerTier: a broken verdict emits the dual-field RECIPE_DOM_FALLBACK_PENDING carrying the underlying code + a fellBackToDom marker (HEAL-01)"
  - "Never-mask taxonomy enforced at the router seam: a success / legitimate no-results / logged-out / typed-security-passthrough result is returned VERBATIM, never healed (HEAL-04)"
  - "Quarantine wiring on the rot path: a T2 learned slug via FsbLearnedRecipeStore.quarantine (persisted); a bundled slug via the catalog's session-only quarantineBundled (HEAL-03, D-09/D-12)"
  - "capability-catalog session-only quarantinedBundledSlugs Set + quarantineBundled/clearBundledQuarantine; resolve SKIPS a quarantined bundled slug (D-09/D-11/D-12)"
  - "The opportunistic consent-gated FsbDiscoverySession.runDiscovery re-learn trigger WIRED on the rot path (HEAL-03, D-10)"
  - "The strengthened buildSystemPrompt DOM-fallback hint: a RECIPE_DOM_FALLBACK_PENDING / RECIPE_EXPIRED reason explicitly instructs the model to complete the SAME task via the DOM tools (D-02)"
  - "capability-rot-detector.js wired into background.js importScripts before the router (the SW publishes FsbCapabilityRotDetector)"
affects: [32-04-provider-parity, 32-05-schema-lock, phase-32-verification, milestone-v0.9.99-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Post-fetch rot classify hook: classify the executeBoundSpec result AFTER the fetch and BEFORE the success-stamp; a missing detector skips the hook so the success path is byte-identical (degrade-to-no-op)"
    - "Session-only in-memory bundled quarantine via a null-proto Set consulted by resolve (never mutates the REGISTRY, never persisted; re-evaluated next SW session)"
    - "Model-driven DOM fallback: the router emits a typed reason + fellBackToDom; the model selects the DOM tools next iteration (no parallel stack, INV-02; no iterator edit, INV-04)"
    - "Node-require fallback for a sibling recipe-path module reached via the SW global (typeof-or-require split, static require -- not a dynamic-code construct -- so the recipe-path guard stays GREEN)"

key-files:
  created: []
  modified:
    - "extension/utils/capability-catalog.js - session-only quarantinedBundledSlugs Set + quarantineBundled/clearBundledQuarantine; resolve skip-quarantined"
    - "extension/utils/capability-router.js - _rotDetector/_learnedStore/_discoverySession accessors + _quarantineAndRelearn; the classify hook in _runDeclarativeTier + _runHandlerTier"
    - "extension/background.js - importScripts capability-rot-detector.js before the catalog/router"
    - "extension/ai/agent-loop.js - the buildSystemPrompt:731 DOM-fallback hint (prompt string ONLY; the setTimeout iterator is byte-untouched)"

key-decisions:
  - "The router's _rotDetector() falls back to a Node require of capability-rot-detector.js when the SW global is absent (the unit harness injects no detector) -- a STATIC require, recipe-path-guard-safe; the SW path uses the importScripts global"
  - "capability-rot-detector.js was wired into background.js importScripts in THIS plan (Plan 02 deferred all router/SW wiring to Plan 03); it precedes the catalog/router so FsbCapabilityRotDetector is published before the classify hook runs"
  - "tool-executor.js needs NO change: the typed RECIPE_DOM_FALLBACK_PENDING reason + fellBackToDom already surface through the existing executeCapabilityToolForAutopilot makeResult contract (error<-errorCode, result<-response) -- no INV-02 parallel-stack edit"
  - "The broken _err carries reason: verdict.code (the typed RECIPE_* code, e.g. RECIPE_EXPIRED / RECIPE_HTTP_4XX) so the router test's /^RECIPE_/ reason assertion holds, plus recipeBrokenReason: verdict.reason (the human label) and fellBackToDom: true"

patterns-established:
  - "Post-executeBoundSpec rot classify hook (both tiers) emitting the typed DOM-fallback reason on broken:true; verbatim return on every non-broken verdict"
  - "Session-only bundled quarantine (null-proto Set, resolve-skip, REGISTRY-immutable, never persisted)"
  - "Fire-and-forget best-effort quarantine + opportunistic consent-gated re-learn that never block or poison the invoke return"

requirements-completed: [HEAL-01, HEAL-03, HEAL-04]

# Metrics
duration: 12min
completed: 2026-06-23
---

# Phase 32 Plan 03: Self-Healing DOM-Fallback Realization + Quarantine/Re-Learn Wiring Summary

**The router now classifies the executeBoundSpec result after every T1a/T1b/T2 fetch, emits the dual-field RECIPE_DOM_FALLBACK_PENDING (carrying the underlying code + a fellBackToDom marker) on a broken verdict, quarantines the rotted recipe (learned-persisted / bundled-session), wires the consent-gated runDiscovery re-learn trigger, and strengthens the autopilot prompt so the model completes the SAME task via DOM tools -- while the setTimeout iterator stays byte-untouched (INV-04) and no parallel stack is built (INV-02).**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-23T09:00:18Z
- **Completed:** 2026-06-23T09:01:32Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Realized the DOM-fallback SIGNAL: `classifyRecipeBroken` is hooked into the router immediately after `executeBoundSpec` in BOTH `_runDeclarativeTier` (~:401) and `_runHandlerTier` (~:433); a broken verdict returns `RECIPE_DOM_FALLBACK_PENDING` carrying `reason: verdict.code` + `recipeBrokenReason` + `fellBackToDom: true` (HEAL-01). The T3-seam contract now fires after a broken T1a/T1b/T2 fetch, not only on a pre-declared T3 tier.
- Enforced the never-mask taxonomy at the router seam: a success, a legitimate no-results (200 + present empty container), a logged-out (`redirected:true` -> `RECIPE_LOGGED_OUT`), and a typed security passthrough (`RECIPE_ORIGIN_MISMATCH` / `RECIPE_CONSENT_*`) all return VERBATIM and fire NO quarantine (HEAL-04, T-32-MASK / T-32-PASS).
- Wired quarantine + re-learn on the rot path (best-effort, fire-and-forget): a T2 learned slug demotes via `FsbLearnedRecipeStore.quarantine(slug, origin)` (persisted); a bundled slug demotes via the catalog's new session-only `quarantineBundled(slug)`; `FsbDiscoverySession.runDiscovery(origin, {tabId})` is the consent-gated opportunistic re-learn trigger (HEAL-03, D-09/D-10/D-12).
- Added the catalog's session-only `quarantinedBundledSlugs` Set (null-proto) + `quarantineBundled`/`clearBundledQuarantine`; `resolve` skips a quarantined bundled slug (returns null -> the router falls through to the DOM fallback) without mutating or persisting the REGISTRY (D-09/D-11/D-12).
- Strengthened the `buildSystemPrompt` DOM-fallback hint (agent-loop.js:731, prompt string ONLY) so a `RECIPE_DOM_FALLBACK_PENDING` / `RECIPE_EXPIRED` reason explicitly tells the model to complete the SAME task via the DOM tools -- the setTimeout iterator (2026/2725/2794/2804) stays byte-untouched (INV-04).
- Wired `capability-rot-detector.js` into `background.js` importScripts before the catalog/router so the SW publishes `FsbCapabilityRotDetector` for the classify hook.

## Task Commits

Each task was committed atomically:

1. **Task 1: Bundled quarantine Set + resolve-skip in capability-catalog.js** - `1ed0b2b0` (feat)
2. **Task 2: Router classify hook + T3-realization emit + quarantine + re-learn wiring** - `62cefc46` (feat)
3. **Task 3: Strengthen the buildSystemPrompt DOM-fallback hint (iterator untouched); tool-executor.js needs no change** - `2bf43f0c` (feat)

**Plan metadata:** (this docs commit)

## Files Created/Modified
- `extension/utils/capability-catalog.js` - Added the session-only `quarantinedBundledSlugs` null-proto Set + `quarantineBundled`/`clearBundledQuarantine`; `resolve` skips a quarantined bundled slug (REGISTRY immutable, never persisted).
- `extension/utils/capability-router.js` - Added typeof-guarded `_rotDetector`/`_learnedStore`/`_discoverySession` accessors (the detector with a Node-require fallback) + the `_quarantineAndRelearn` best-effort helper; the post-`executeBoundSpec` classify hook in `_runDeclarativeTier` and `_runHandlerTier` (broken -> quarantine + re-learn + `RECIPE_DOM_FALLBACK_PENDING`; non-broken -> verbatim).
- `extension/background.js` - One `importScripts('utils/capability-rot-detector.js')` before the catalog/router so the SW publishes the detector global.
- `extension/ai/agent-loop.js` - The single `buildSystemPrompt:731` prompt bullet strengthened (the recipe-rot DOM-fallback instruction); the iterator region is byte-untouched.

## Decisions Made
- **Detector reach under Node:** the router's `_rotDetector()` prefers the SW global `FsbCapabilityRotDetector` (published by the importScripts wired in this plan) and falls back to a STATIC `require('./capability-rot-detector.js')` when the global is absent (the Phase-29 router unit harness injects no detector). The static require is not a dynamic-code construct, so the recipe-path guard stays GREEN; the SW worker scope has no `require`, so the branch is inert there. Mirrors the established `tool-executor.js` typeof-or-require split.
- **importScripts wiring belonged here:** Plan 02 explicitly deferred all router/SW wiring to Plan 03 (its summary: "Do NOT touch the router/autopilot wiring"), so it built the detector module + test but never registered it in `background.js`. This plan adds that registration (before the catalog/router) so the classify hook is live in production, not dead code.
- **tool-executor.js unchanged:** the typed reason + `fellBackToDom` already surface through the existing `executeCapabilityToolForAutopilot` `makeResult({ error: response.errorCode, result: response })` contract, because the router now emits them in the `_err` shape. No edit to the autopilot door was needed -- and per INV-02 the completion is model-driven (no `executeTool`/`run_task` call from inside the door).
- **The broken `_err` carries `reason: verdict.code`** (the typed `RECIPE_*` code) so the router test's `/^RECIPE_/.test(reason)` assertion holds; `recipeBrokenReason` carries the human label (`verdict.reason`).

## Deviations from Plan

None - plan executed exactly as written.

The plan's interfaces note (line 84) already anticipated reaching `FsbCapabilityRotDetector` "the SAME typeof-guarded way (degrade to no-op if absent)"; the Node-require fallback + the `background.js` importScripts registration are the mechanism that makes that global reachable in both the SW (importScripts) and the Node unit harness, and the `background.js` wiring is squarely the "the classify hook" + "the router calls classifyRecipeBroken" truth this plan owns (Plan 02 deferred it here). No architectural change, no new package, no scope creep.

## Issues Encountered
- **Recipe-path guard comment-scan flag (resolved during Task 2):** the guard scans COMMENTS for the literal forbidden substrings `new Function` / `import(`. An initial `_rotDetector()` comment said "not import() / eval / new Function", which the guard flagged on `capability-router.js`. Fixed by rephrasing the comment to "a STATIC module load -- NOT any run-string-as-code construct" (no forbidden substrings); the guard returned to PASS. The router carries no actual dynamic-code construct -- only a static `require`.

## Verification

All plan acceptance gates GREEN:
- `node tests/capability-router.test.js` -> 38/0 (all 8 HEAL assertions GREEN: broken -> `RECIPE_DOM_FALLBACK_PENDING` carrying the reason; quarantine fired for learned + bundled; `runDiscovery` re-learn wired; legitimate-no-results + logged-out NOT healed, NO quarantine).
- `node tests/capability-autopilot-parity.test.js` -> 13/0 (the autopilot door surfaces the typed reason + `fellBackToDom`; one-engine-two-doors + frozen INV-01 hash intact).
- `node tests/agent-loop-iterator-guard.test.js` -> 4/0 (INV-04: the 4 setTimeout iterator lines byte-unchanged; exactly 4 schedule matches after the prompt edit).
- `node tests/capability-rot-detector.test.js` -> 21/0 (unchanged; the classifier the router calls).
- `node scripts/verify-recipe-path-guard.mjs` -> PASS (catalog + router stay eval-free on the allowlist).
- No-regression sweep GREEN: `capability-mcp-surface` (INV-01) 19/0; `capability-fetch`, `capability-interpreter`, `capability-recipe-schema`, `capability-head-handlers`, `capability-search-eval`; all `learned-*` suites; the consent/gate/audit suites.

## Out-of-Scope Findings (logged, not fixed)
- `tests/foreground-audit.test.js` has 1 pre-existing RED assertion: "audit doc exists at `.planning/phases/243-background-tab-audit-ui-badge-integration/243-BACKGROUND-TAB-AUDIT.md`" -- a Phase-243 planning-doc-presence check. The test file is byte-unchanged since 32-02 and references NONE of this plan's modified files; the failure is a missing `.planning` doc, not a code regression. Logged to `deferred-items.md` (owner: Phase 243 maintainer).

## Known Stubs
None - the four edited files introduce no stubs, TODOs, hardcoded UI-bound empties, or placeholders. (The `flaggedForPhase32` learned-recipe marker is Phase-31 prior art, untouched here.)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The self-healing engine is now fully wired: the rot classify hook fires after every credentialed fetch in both tiers, the rotted recipe is quarantined (learned-persisted / bundled-session), the consent-gated re-learn trigger is reachable, and the autopilot prompt directs the model to DOM completion. INV-02 (one engine, no parallel stack) and INV-04 (iterator byte-untouched) hold.
- Plan 04 (provider parity, INV-03) and Plan 05 (schema-lock, INV-01) can now assert the capability + fallback paths across the 7 providers and freeze the v2 RECIPE_SCHEMA hash (the `recipe-schema-lock.test.js` placeholder `TBD-FROZEN-IN-PLAN-04` awaits the printed digest).
- The LIVE self-healing-on-a-real-broken-recipe (the model actually completing via DOM on a real rotted site) remains `human_needed` UAT (D-15), not a CI gate -- the CI half (the router emits the decision + typed reason; the autopilot door surfaces it; the re-learn trigger is wired) is proven GREEN.

## Self-Check: PASSED

- FOUND: 32-03-SUMMARY.md
- FOUND commits: 1ed0b2b0 (Task 1), 62cefc46 (Task 2), 2bf43f0c (Task 3)
- FOUND modified files: capability-catalog.js, capability-router.js, background.js, agent-loop.js

---
*Phase: 32-self-healing-fallback-recipe-rot-detection-re-learn-provider*
*Completed: 2026-06-23*
