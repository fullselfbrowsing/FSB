---
phase: 31-network-capture-discovery-recipe-synthesis-learned-recipes
plan: 06
subsystem: api
tags: [chrome-debugger, cdp, network-capture, discovery-session, promote-after-replay, learned-recipes, trusted-provenance, getLearnedSync, mcp-route]

# Dependency graph
requires:
  - phase: 31-02
    provides: "FsbNetworkCapture (consent-gated CDP capture session over the existing Input-domain debugger attach; startSession/endSession/_onCdpEvent; redacted ObservedCall[]) + network-capture-redactor.js"
  - phase: 31-03
    provides: "FsbRecipeSynthesizer.synthesize (closed-vocab recipe + descriptor, validateRecipe-gated) + FsbLearnedRecipeStore (per-origin versioned store with getLearned/promote/quarantine)"
  - phase: 31-04
    provides: "the 'local' trusted-provenance exemption in capability-signature + capability-interpreter (interpretRecipe short-circuits to the synchronous bind for trustedProvenance:'local')"
  - phase: 31-05
    provides: "capability-search.js addLearnedRecipe + capability-catalog.js resolve learned-first (_getLearned -> getLearnedSync) + capability-router.js case 'T2' learned dispatch; FLAGGED the missing production getLearnedSync mirror"
  - phase: 29
    provides: "capability-router.js _runDeclarativeTier replay shape (interpretRecipe -> executeBoundSpec); capability-fetch.js executeBoundSpec active-tab origin-pin"
  - phase: 28
    provides: "the MCP message-route table idiom (mcp:capabilities-search/invoke) + the SW-side origin/tabId resolution pattern this discover route mirrors"
provides:
  - "extension/utils/discovery-session.js -- FsbDiscoverySession.runDiscovery: the promote-after-replay orchestrator (capture -> synthesize -> replay through the REAL interpretRecipe->executeBoundSpec with the 'local' vouch -> promote + index ONLY on a clean replay; failures discarded, D-10)"
  - "extension/utils/learned-recipe-store.js getLearnedSync(slug, origin) + hydrateSyncCache(): the SYNCHRONOUS in-memory mirror that closes the 31-05 production gap -- LEARN-04 outranking now fires at runtime via catalog.resolve, not only in the test stub"
  - "extension/background.js additive importScripts for the discovery stack + the learned-store startup hydration + the FIRST chrome.debugger.onEvent consumer (FsbNetworkCapture._onCdpEvent); NO manifest change"
  - "an internal mcp:capabilities-discover route (OUT of TOOL_REGISTRY, INV-01) that mirrors the invoke front door and runs the consent-gated discovery session SW-side"
affects: [phase-32 (heals quarantined / flaggedForPhase32 learned recipes; the discovery loop is the source of learned recipes it heals)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promote-after-replay orchestration: synthesize -> interpretRecipe({trustedProvenance:'local'}) -> executeBoundSpec; promote + addLearnedRecipe ONLY when BOTH success:true (a falsy/non-success interpret OR execute discards the candidate before any store write)"
    - "Synchronous in-memory mirror for a synchronous read path: a null-proto recipes[origin][slug] cache kept in lock-step with the async store's promote/quarantine + an LRU-eviction-aware drop + a SW-startup hydrate, so a synchronous resolve() can surface a recipe the async storage-truth read cannot"
    - "Out-of-registry control-surface route: a user-initiated trigger registers via the MCP message-route table ONLY (mirroring capabilities-invoke's SW-side origin/tabId resolution) and never enters TOOL_REGISTRY/getPublicTools, so the frozen INV-01 tool-definitions hash is unmoved"
    - "Method-dispatched onEvent listener registered ahead of any session: FsbNetworkCapture._onCdpEvent is a no-op without an active session, so it adds cleanly as the first chrome.debugger.onEvent consumer and never disrupts Input emulation"

key-files:
  created:
    - "extension/utils/discovery-session.js -- the FsbDiscoverySession.runDiscovery promote-after-replay orchestrator (dual-export IIFE, dynamic-code-free)"
  modified:
    - "extension/utils/learned-recipe-store.js -- added getLearnedSync + hydrateSyncCache + the in-memory mirror lock-stepped with promote/quarantine/LRU/_reset (closes the 31-05 gap)"
    - "extension/background.js -- additive importScripts for the discovery stack + hydrateSyncCache at startup + the Network-domain onEvent listener registration"
    - "extension/ws/mcp-tool-dispatcher.js -- the mcp:capabilities-discover route + handleCapabilitiesDiscoverMessageRoute (SW-side origin/tabId resolution; out of TOOL_REGISTRY)"
    - "extension/ws/mcp-bridge-client.js -- the pure pass-through _handleCapabilitiesDiscover delegate + the switch case"

key-decisions:
  - "discovery-session.js calls the leaf modules DIRECTLY (synthesize -> interpret -> execute -> promote + addLearnedRecipe) rather than reusing FsbRecipeSynthesizer.promoteAfterReplay, because the orchestrator's contract (D-01/D-15) requires feeding the search index (addLearnedRecipe) in addition to the store promote -- promoteAfterReplay only does the store promote. The replay GATE is byte-identical (interpret('local') -> execute, fail-closed) so the promote-after-replay invariant (D-10) holds either way."
  - "The 31-05 getLearnedSync gap was closed in THIS plan (Rule 2 -- missing critical functionality elevated to a phase invariant by the orchestrator). Without the sync mirror, capability-catalog.resolve()'s _getLearned returns null in production, so LEARN-04 outranking only fired in the test stub. The mirror is origin-scoped + quarantine-aware (returns null for quarantined) + LRU-eviction-aware + hydrated at SW startup -- matching the async getLearned semantics exactly."
  - "background.js registers FsbNetworkCapture._onCdpEvent at the importScripts seam (ahead of any session) rather than inside a per-session attach. _onCdpEvent guards `if (!_session) return`, so a session-less listener is a no-op; this is the first onEvent consumer (the existing debugger usage is all sendCommand/attach/detach), so it adds cleanly and Input emulation is method-dispatch-isolated."
  - "The discover route session bounds (maxMs/maxCount) are passed as undefined when the caller omits them, so FsbNetworkCapture applies its own DEFAULT_MAX_MS/DEFAULT_MAX_COUNT (the single source of truth for the bounds) rather than re-declaring defaults at the dispatcher."

patterns-established:
  - "Pattern 1: Promote-after-replay orchestration as the ONLY write path to the learned store -- a candidate is stored + indexed strictly after a clean real-credentialed replay (D-10); five independent gates (consent + same-origin + validateRecipe + promote-after-replay + the executeBoundSpec origin-pin) stand between a hostile synthesized recipe and the store"
  - "Pattern 2: A synchronous in-memory mirror lock-stepped with an async versioned store, hydrated at SW startup, to bridge a synchronous read (catalog resolve) onto an async storage truth"
  - "Pattern 3: A user-initiated trigger as an out-of-registry MCP message-route that mirrors an existing front door's authoritative SW-side origin/tabId resolution -- a control surface, not a tool schema (INV-01 preserved)"

requirements-completed: [DISC-01, DISC-02, LEARN-01]

# Metrics
duration: 9min
completed: 2026-06-23
---

# Phase 31 Plan 06: Discovery-Session Integration + Promote-After-Replay + getLearnedSync Gap Closure Summary

**A discovery-session orchestrator runs the promote-after-replay loop (capture -> synthesize -> replay through the REAL interpretRecipe->executeBoundSpec with the 'local' vouch -> promote + index ONLY on a clean replay), background.js additively wires the discovery stack + the first chrome.debugger.onEvent consumer with NO manifest change, an out-of-registry mcp:capabilities-discover route mirrors the invoke front door, and the 31-05 getLearnedSync production gap is closed so LEARN-04 outranking finally fires at runtime.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-23T02:29:15Z
- **Completed:** 2026-06-23
- **Tasks:** 2 autonomous + 1 deferred checkpoint (3 total)
- **Files modified:** 5 (1 created, 4 modified) + 1 docs (31-HUMAN-UAT.md)

## Accomplishments
- **DISC-01 / LEARN-01 / D-10 (the integration wave):** `extension/utils/discovery-session.js` `runDiscovery(origin, opts)` starts the consent-gated `FsbNetworkCapture` session (the gate runs INSIDE startSession before any debugger attach -- a denied/off/sensitive-unconfirmed origin returns a `RECIPE_CONSENT_*` reason and nothing is captured), then for each redacted ObservedCall synthesizes a candidate and REPLAYS it through the real `interpretRecipe(recipe, {}, {trustedProvenance:'local'}) -> executeBoundSpec(spec, tabId)` path -- promoting to the per-origin store AND feeding the search index ONLY on a clean replay (both `success:true`), discarding every failed interpret or execute. Returns a slugs/counts-only summary `{ok, promoted, discarded, flaggedForPhase32}` (no body/args/secrets).
- **Closed the 31-05 production gap:** `extension/utils/learned-recipe-store.js` now exports `getLearnedSync(slug, origin)` backed by a null-proto in-memory mirror, plus `hydrateSyncCache()` for SW-startup hydration. The mirror is kept in lock-step with `promote`/`quarantine`/LRU-eviction/`_reset`, is hard origin-scoped + quarantine-aware (returns null for quarantined), and is rebuilt from `chrome.storage.local` at startup. An inline harness confirms `capability-catalog.resolve` now returns `tier:'T2'` via the REAL store at runtime -- LEARN-04 outranking fires in production, not only in the test stub.
- **DISC-02 / D-02 (background wiring, NO manifest change):** `extension/background.js` additively `importScripts` the discovery stack (network-capture-redactor -> network-capture -> recipe-synthesizer -> learned-recipe-store -> discovery-session) in dependency order, hydrates the learned-store sync mirror at startup, and registers `FsbNetworkCapture._onCdpEvent` on `chrome.debugger.onEvent` ONCE (the first onEvent consumer; method-dispatched so Input emulation is unaffected). `git diff --quiet manifest.json` holds.
- **INV-01 (out-of-registry trigger):** the internal `mcp:capabilities-discover` route + `handleCapabilitiesDiscoverMessageRoute` mirror the invoke front door's authoritative SW-side origin/tabId resolution (payload overrides are non-authoritative) and run `FsbDiscoverySession.runDiscovery`; the route registers via the message-route table ONLY -- it never enters `TOOL_REGISTRY`/`getPublicTools`, so the frozen tool-definitions parity hash is unmoved. A pure pass-through bridge delegate completes the wire.
- **Full gate GREEN:** all nine Phase-31 suites + the INV-01/02/04 proofs (tool-definitions-parity, capability-mcp-surface, capability-autopilot-parity, agent-loop-iterator-guard) + the Phase-30 consent/signature suites + the capability regression suites pass; `verify-recipe-path-guard.mjs` PASSES; `node --check extension/background.js` PASSES.

## Task Commits

Each task was committed atomically:

1. **Task 1: discovery-session.js promote-after-replay orchestrator** - `3dc8714e` (feat)
2. **(Deviation, Rule 2) Close the 31-05 gap: getLearnedSync in-memory mirror on the learned store** - `2b277ce9` (feat)
3. **Task 2: background.js wiring + out-of-registry discover route + bridge delegate** - `88d79e63` (feat)
4. **Task 3 (checkpoint): live capture->synthesize->promote->outrank UAT** - deferred to `.planning/phases/31-network-capture-discovery-recipe-synthesis-learned-recipes/31-HUMAN-UAT.md` (human_needed; result pending). No code is produced by this task.

**Plan metadata:** see the final `docs(31-06)` commit.

## Files Created/Modified
- `extension/utils/discovery-session.js` (CREATED) - `FsbDiscoverySession.runDiscovery`: the promote-after-replay orchestrator (typeof-guarded leaf accessors; clean-vs-failed replay gate; slugs/counts-only summary; dual-export IIFE; dynamic-code-free; ASCII-only).
- `extension/utils/learned-recipe-store.js` (MODIFIED) - added `getLearnedSync` + `hydrateSyncCache` + the in-memory sync mirror writers (`_mirrorSet`/`_mirrorQuarantine`/`_mirrorDelete`/`_mirrorRebuildFrom`); `_evictOldestIfOverCap` returns the evicted slug; `promote`/`quarantine`/`_reset` keep the mirror in lock-step.
- `extension/background.js` (MODIFIED) - additive importScripts for the discovery stack; `FsbLearnedRecipeStore.hydrateSyncCache()` at startup; the `chrome.debugger.onEvent.addListener(FsbNetworkCapture._onCdpEvent)` registration. No manifest edit.
- `extension/ws/mcp-tool-dispatcher.js` (MODIFIED) - the `mcp:capabilities-discover` route table entry + `handleCapabilitiesDiscoverMessageRoute` (SW-side origin/tabId resolution; confirmed_sensitive + bounds threading; out of TOOL_REGISTRY).
- `extension/ws/mcp-bridge-client.js` (MODIFIED) - the `mcp:capabilities-discover` switch case + the pure pass-through `_handleCapabilitiesDiscover` delegate.
- `.planning/phases/31-.../31-HUMAN-UAT.md` (CREATED) - the deferred live-UAT ledger (UAT-31-01, status human_needed / result pending), matching the Phase 27/28/29/30 posture.

## Decisions Made
- **Orchestrator calls the leaf modules directly (not promoteAfterReplay):** the orchestrator must feed the search index via `addLearnedRecipe` in addition to the store `promote` -- `FsbRecipeSynthesizer.promoteAfterReplay` only does the store promote. The replay gate (interpret('local') -> execute, fail-closed) is byte-identical, so D-10 holds; the orchestrator simply adds the index-feed step on a clean replay.
- **getLearnedSync mirror semantics mirror getLearned exactly:** hard origin scope (`recipe.origin === origin`), quarantine-aware (null for quarantined), LRU-eviction-aware (an evicted slug is dropped from the mirror), and hydrated at SW startup -- so the synchronous catalog read and the async storage truth never diverge.
- **onEvent listener registered at the importScripts seam:** `_onCdpEvent` is a no-op without an active session, so registering it ahead of any session is safe; it is the first onEvent consumer, so it adds cleanly and Input emulation stays method-dispatch-isolated.
- **Session bounds default in the capture module, not the dispatcher:** the discover route passes `undefined` bounds when the caller omits them, so `FsbNetworkCapture`'s `DEFAULT_MAX_MS`/`DEFAULT_MAX_COUNT` remain the single source of truth.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Closed the 31-05 getLearnedSync production gap (added the synchronous in-memory mirror to the learned store)**
- **Found during:** Pre-execution read of 31-05-SUMMARY.md (the flagged Known Stub) + the orchestrator's `<phase_31_invariants>` mandate.
- **Issue:** `capability-catalog.js` `_getLearned` reads `FsbLearnedRecipeStore.getLearnedSync` inside the SYNCHRONOUS `resolve()`, but the store exposed only the async `getLearned` -- so in production `_getLearned` returned null (the typeof guard short-circuited), `resolve` fell through to the REGISTRY, and a learned recipe was NEVER surfaced synchronously. LEARN-04 outranking fired only in `learned-t2-outranking.test.js`'s stub, not at runtime. This is a correctness requirement (the whole learned-recipe payoff -- a discovered recipe outranking the generic on the next visit -- is dead without it), and the orchestrator elevated it to a phase invariant.
- **Fix:** Added a null-proto in-memory mirror (`recipes[origin][slug] = {recipe, descriptor, quarantined}`) to `learned-recipe-store.js`, kept in lock-step with `promote` (set + drop the LRU-evicted slug), `quarantine` (flip the flag), and `_reset` (clear); exposed `getLearnedSync(slug, origin)` (same hard origin-scope + quarantine semantics as `getLearned`) and `hydrateSyncCache()` (SW-startup rebuild from chrome.storage.local). Wired `hydrateSyncCache()` into background.js startup.
- **Files modified:** extension/utils/learned-recipe-store.js (+ the background.js startup hydration call).
- **Verification:** `learned-recipe-store.test.js` (21/0) + `learned-t2-outranking.test.js` (10/0) stay GREEN; a dedicated inline harness proves getLearnedSync surfaces a promoted recipe synchronously, is origin-scoped, returns null for quarantined, drops the LRU-evicted slug, and hydrates from storage; a second harness proves `capability-catalog.resolve` now returns `tier:'T2'` via the REAL store at runtime; `verify-recipe-path-guard.mjs` PASSES (the store is on the allowlist and stays eval-free).
- **Committed in:** `2b277ce9` (separate from the Task 1/Task 2 commits).

---

**Total deviations:** 1 auto-fixed (1 missing critical).
**Impact on plan:** The gap closure is the load-bearing complement to the 31-05 catalog/router wiring -- without it the Phase-31 learned-recipe payoff is inert in production. It is scoped to a single store-module addition + one startup call, fully tested, and explicitly mandated by the orchestrator's phase invariants. No scope creep; no architectural change.

## Issues Encountered
- **The Wave-0 `learned-promote-after-replay.test.js` was already GREEN before Task 1:** the suite tests `FsbRecipeSynthesizer.promoteAfterReplay` + `FsbLearnedRecipeStore.getLearned` (both shipped in 31-03), not `discovery-session.js` directly. The plan's Task-1 acceptance command (`node tests/learned-promote-after-replay.test.js`) therefore confirms the replay GATE the orchestrator reuses, while the orchestrator's own `runDiscovery` contract (synthesize -> replay -> promote + index, with the 'local' vouch threaded) was verified via dedicated inline harnesses (clean-replay-promotes, failed-interpret-discards, consent-denial-short-circuits) since the plan ships no dedicated discovery-session test file. All behaviors match the `<behavior>`/`<acceptance_criteria>` blocks.
- **The bridge-client switch has a `default: throw` for unknown types:** the discover route required an explicit `case 'mcp:capabilities-discover'` in `mcp-bridge-client.js` (not just the dispatcher route-table entry) plus the pass-through delegate, mirroring the existing capabilities-search/invoke cases. Added accordingly.

## Known Stubs

None. The 31-05 Known Stub (`getLearnedSync` not implemented in the production store) is CLOSED by this plan -- `capability-catalog.resolve` now surfaces a learned recipe synchronously at runtime, verified end-to-end against the real store.

## Threat Flags

None. The discovery path introduces no security surface outside the plan's `<threat_model>`: the `mcp:capabilities-discover` route is internal-only and out of TOOL_REGISTRY (INV-01); no manifest/permission change (DISC-02); the runDiscovery summary carries slugs/counts only (no body/args/secrets); the five-gate promote-after-replay pipeline (consent + same-origin + validateRecipe + clean-replay + executeBoundSpec origin-pin) stands between a hostile synthesized recipe and the store.

## User Setup Required

None - no external service configuration required. The live discovery-on-a-real-site confirmation is recorded as deferred human_needed UAT (see `31-HUMAN-UAT.md`, UAT-31-01), matching the Phase 27/28/29/30 posture; it does NOT block the headless CI gate.

## Next Phase Readiness
- The full Phase-31 discovery loop is wired end-to-end in production: a user-initiated `mcp:capabilities-discover` trigger -> the consent-gated capture session -> synthesize -> promote-after-replay -> store + index, with the learned recipe now outranking the generic at the catalog (the 31-05 gap is closed).
- Phase 32 (self-healing / recipe-rot detection / re-learn) consumes this loop: the discovery session is the SOURCE of the learned recipes it heals, and the `flaggedForPhase32` markers + the `quarantine` demotion (D-16) it inherits are already surfaced through this orchestrator's summary and the store.
- All Phase-28/29/30 invariants are preserved: INV-01 (the frozen tool-definitions hash; the discover route is out of TOOL_REGISTRY), INV-02 (one engine), INV-04 (the agent-loop iterator byte-untouched), the consent gate, the origin-pin, and the signature gate -- confirmed by the unregressed proof suites.

## Self-Check: PASSED

- FOUND: `extension/utils/discovery-session.js`
- FOUND: `extension/utils/learned-recipe-store.js`
- FOUND: `extension/background.js`
- FOUND: `extension/ws/mcp-tool-dispatcher.js`
- FOUND: `extension/ws/mcp-bridge-client.js`
- FOUND: `.planning/phases/31-.../31-HUMAN-UAT.md`
- FOUND: `.planning/phases/31-.../31-06-SUMMARY.md`
- FOUND: commit `3dc8714e` (Task 1: discovery-session.js)
- FOUND: commit `2b277ce9` (Deviation Rule 2: getLearnedSync gap closure)
- FOUND: commit `88d79e63` (Task 2: background/dispatcher/bridge wiring)

---
*Phase: 31-network-capture-discovery-recipe-synthesis-learned-recipes*
*Completed: 2026-06-23*
