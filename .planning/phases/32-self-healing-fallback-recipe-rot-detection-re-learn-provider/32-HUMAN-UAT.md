---
phase: 32-self-healing-fallback-recipe-rot-detection-re-learn-provider
plan: 05
status: partial
result: pending
created: 2026-06-23
---

# Phase 32 Plan 05 Human UAT: Live Self-Healing on a Real Broken Recipe (Detect -> DOM-Complete -> Quarantine -> Re-Learn)

This is the irreducibly-live half of the Phase-32 self-healing loop (32-05, Task 2). It was NOT executed in the autonomous, no-live-browser run and must not be treated as passed until a human records the observed result. It is recorded here as `human_needed` / `result: pending` live-UAT, matching the Phase 27/28/29/30/31 posture (the live half is documented debt, not a fabricated pass; it does NOT block the headless CI gate, which is already green). The headless CI/automated half is GREEN (Plans 02-04). ONLY the irreducibly-live end-to-end completion is `human_needed`. This is recorded debt, NOT a fabricated pass (D-15).

## Why this is human_needed (not CI-provable)

Live self-healing needs a real Chrome extension load, a real authenticated first-party origin that has a capability recipe, and a recipe that is genuinely broken (rotted, forced 4xx, empty, or shape-mismatched) on that live site. None of these can run in the headless CI gate, and a real credential is forbidden in CI (GOV-06). The CI suite proves every FSB-owned property of this loop headlessly:

- `tests/capability-rot-detector.test.js` proves the HEAL-04 failure taxonomy: `classifyRecipeBroken` distinguishes a broken recipe (4xx/5xx, empty-when-`extract`-expects-data, `expectedShape`-mismatch, `RECIPE_EXPIRED`) from a legitimate no-results (200 + valid shape + empty set, returned VERBATIM, never masked) from a logged-out outcome (302 -> login, surfaced as-is, never healed). It also proves HEAL-02: a stamped recipe whose response fails its conservative `expectedShape` assertion yields `RECIPE_EXPIRED`, while a fresh conforming response passes; the typed `RECIPE_*` security passthrough runs BEFORE the generic fetch-failed branch, and an absent/throwing shape engine degrades to shape-passes (conservative, D-06).
- `tests/capability-router.test.js` proves the HEAL-01/HEAL-03 router wiring: the post-`executeBoundSpec` rot classify hook fires in both `_runDeclarativeTier` and `_runHandlerTier`; a broken verdict quarantines the recipe (learned via `store.quarantine`, persisted; bundled via `catalog.quarantineBundled`, session-only) so a quarantined slug is skipped by `resolve` on the next visit; it fires the fire-and-forget consent-gated `runDiscovery` re-learn trigger; and it returns `RECIPE_DOM_FALLBACK_PENDING` carrying `reason: verdict.code` + `fellBackToDom: true`. Every non-broken verdict returns verbatim (HEAL-04 -- a real empty or logged-out outcome is never masked).
- `tests/capability-autopilot-parity.test.js` proves the autopilot door surfaces the typed `RECIPE_DOM_FALLBACK_PENDING` reason + `fellBackToDom` through the existing `executeCapabilityToolForAutopilot` `makeResult` contract -- one engine, two front doors, NO parallel autopilot stack (INV-02).
- `tests/agent-loop-iterator-guard.test.js` proves the `agent-loop.js` `setTimeout`-chained iterator stays byte-untouched (INV-04); the DOM fallback is a tool-SELECTION decision in the existing dispatch, not an iterator change.
- `tests/provider-parity.test.js` proves the capability + fallback decision is byte-equal across all 7 `PROVIDER_KEYS` (xai / openai / anthropic / gemini / lmstudio / openrouter / custom) -- HEAL-05 / INV-03; the router sits below the provider layer and never branches on provider.
- `tests/recipe-schema-lock.test.js` proves the frozen v2 `RECIPE_SCHEMA` hash (`f35211f5...f622a37`, independently re-computed) and the re-asserted frozen tool registry hash are unmoved -- HEAL-05 / INV-01; the closed recipe vocabulary is locked.
- `tests/capability-recipe-schema.test.js` proves the additive v2 schema: persisted `schemaVersion: 1` learned recipes still validate (`enum:[1,2]`, not a bumped const), an out-of-enum version is `RECIPE_SCHEMA_INVALID`, and the optional `capturedAt` + `expectedShape` are accepted with `additionalProperties:false` preserved.
- `tests/learned-recipe-store.test.js` proves the per-origin versioned store + LRU + quarantine-flag-not-delete (a quarantined learned recipe is demoted from routing via `getLearnedSync == null`).
- `scripts/verify-recipe-path-guard.mjs` proves `capability-rot-detector.js` is on the recipe-path allowlist and eval-free (no `eval` / `new Function` / `import(`).
- The full `npm test` chain EXIT 0 is the v0.9.99 milestone completion gate (HEAL-05, D-15): capability + fallback + 7-provider parity + schema-lock + every prior suite green (Plan 04).

The ONE class of property the CI suite CANNOT prove is the live end-to-end self-healing loop: that on a REAL authenticated origin a recipe that has genuinely rotted (or is forced to 4xx / empty / shape-mismatch) is detected as a broken verdict (`RECIPE_EXPIRED` / a broken code) by the live fetch, the autopilot does NOT hard-fail but falls back to the existing DOM tools and STILL completes the SAME task, the broken recipe is quarantined / demoted from routing, and a consent-gated re-learn (`runDiscovery`) is offered / triggered for that origin -- while a legitimate no-results and a logged-out (302 -> login) are NOT healed away.

## Setup

1. Build + load `extension/` as an unpacked Chrome extension (per the project FSB browser-automation policy, drive these via the FSB MCP browser tools).
2. Sign in to a target authenticated origin that has a capability recipe (e.g. a bundled-head origin such as `https://github.com`, or a Phase-31 learned-recipe origin), so first-party HttpOnly cookies are present.
3. Make that origin's recipe broken: use a recipe whose endpoint has genuinely rotted, OR force the bound request to a 4xx / empty / shape-mismatched response (e.g. point the recipe at a changed/removed internal endpoint, or have the site return an unexpected shape) so `classifyRecipeBroken` returns `RECIPE_EXPIRED` / a broken verdict -- NOT a legitimate empty result and NOT a logged-out 302.
4. Invoke that capability for the SAME task you want completed (via `invoke_capability` / the autopilot capability path).
5. NEVER record or paste a real token / cookie / credential value into this file -- record only the observed shape / outcome, redacted.

## Required Scenarios

| ID | Procedure | Expected Outcome | Status |
|----|-----------|------------------|--------|
| UAT-32-01 | On the signed-in origin with a broken/rotted recipe (per Setup): (a) Invoke the capability and confirm the broken recipe is DETECTED as a broken verdict (`RECIPE_EXPIRED` / a broken code), NOT silently returned as a wrong/empty result. (b) Confirm the autopilot does NOT hard-fail: it falls back to the existing DOM tools (`run_task` / `click` / `type_text` / `read_page` / `get_site_guide`) and STILL completes the SAME task (the task outcome is achieved via DOM, not an error). (c) Confirm the broken recipe is quarantined / demoted from routing -- on the next `resolve` for that origin the quarantined slug is SKIPPED (learned: `getLearnedSync == null`; bundled: in the session `quarantinedBundledSlugs` set). (d) Confirm a consent-gated re-learn (`runDiscovery`) is OFFERED / TRIGGERED for that origin -- NOT a silent auto-capture (it respects the user-initiated / consent-gated posture). (e) Confirm a legitimate no-results (a genuinely empty result on a healthy recipe) is NOT healed away -- the real empty outcome is surfaced. (f) Confirm a logged-out (302 -> login) is NOT healed away -- the real logged-out outcome is surfaced, not masked by a DOM fallback. | The broken recipe is detected (`RECIPE_EXPIRED` / broken verdict); the autopilot completes the SAME task via the DOM tools (not a hard error); the broken recipe is quarantined / demoted (skipped on the next resolve); a consent-gated re-learn is offered / triggered (never silent auto-capture); a legitimate no-results and a logged-out outcome are surfaced as-is and NOT healed away (HEAL-04 -- fallback never masks a real outcome). | human_needed |

## Recording Results

When executed, replace the `human_needed` status (and the frontmatter `status: partial` / `result: pending`) with `pass`, `fail`, or `partial` / a recorded result, and add the date, Chrome version, extension commit, and a short observed-outcome note (whether the broken recipe was detected as `RECIPE_EXPIRED` / a broken verdict, whether the autopilot completed the SAME task via DOM rather than hard-failing, whether the recipe was quarantined / demoted on the next resolve, whether a consent-gated re-learn was offered / triggered rather than silently auto-captured, and that a legitimate no-results and a logged-out outcome were surfaced as-is and NOT healed away -- redacted to shape, never a literal token / cookie / credential). Before recording, re-verify the loop at run time, since a live site's endpoints / shapes can change. Do NOT mark the 32-05 live self-healing smoke complete until UAT-32-01 has a recorded outcome (or a documented deferral).

This live UAT joins the v0.9.99 live-browser UAT ledger alongside UAT-27-01 (Phase 27 logged-in shape) and the Phase 29 / 30 / 31 live items (29-HUMAN-UAT.md, 30-HUMAN-UAT.md UAT-30-01, 31-HUMAN-UAT.md UAT-31-01). The headless CI gate -- the Phase-32 taxonomy + router fallback emit + autopilot surfacing + quarantine + the wired consent-gated re-learn trigger + the 7-provider parity gate + the schema-lock gate + the full `npm test` milestone gate (HEAL-05, D-15) -- does NOT depend on this step.
