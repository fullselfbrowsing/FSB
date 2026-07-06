---
phase: 28-lean-mcp-surface-capability-search-eval-harness
verified: 2026-06-21T04:25:13Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Live MCP-client-driven search_capabilities -> invoke_capability against a real authenticated browser tab (end-to-end wire smoke)"
    expected: "From an MCP host on a tab at https://github.com: search_capabilities(\"show my github notifications\") ranks the github.notifications slug first with its params schema; invoke_capability(\"github.notifications\") returns a logged-in-shape structured result"
    why_human: "Requires a live Chrome extension + MCP host + a logged-in origin; FSB's established live-browser UAT posture (recorded as human_needed, not fabricated). The CI half (mocked executeBoundSpec, stubbed bridge, in-memory index) fully covers the logic and is all green. Consistent with the Phase 27 FETCH-05 live posture and 28-VALIDATION.md Manual-Only row. Record outcome in 28-HUMAN-UAT.md."
---

# Phase 28: Lean MCP Surface + Capability Search + Eval Harness Verification Report

**Phase Goal:** Expose the capability engine through a lean two-tool wire surface using progressive disclosure (search -> invoke) without bloating the MCP context, and stand up the search/index whose quality is the catalog's ceiling -- gated by an eval harness.
**Verified:** 2026-06-21T04:25:13Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Verdict

All four ROADMAP success criteria are observably TRUE in the codebase and all four authoritative gate commands are green when run in this verifier's own process (not trusted from SUMMARY claims). Every SURF-01..06 requirement is accounted for and satisfied. The sole outstanding item is the live MCP-client end-to-end browser smoke, which 28-VALIDATION.md explicitly designates Manual-Only (the same human-gated posture as Phase 27 FETCH-05) -- the automated half of that flow is fully covered and green. Per the status decision tree, a non-empty human-verification section forces `human_needed` even though all automated must-haves pass at 6/6.

The advisory code review (28-REVIEW.md) WR-01/WR-02/WR-03 were independently re-checked against the code; none undermines a success criterion (analysis below). They are correctly classified as follow-up nicety / Phase-29/30 boundary concerns, recorded here as advisory WARNINGs, not gaps.

## Goal Achievement

### Observable Truths

| #   | Truth (mapped to ROADMAP success criterion) | Status     | Evidence |
| --- | ------------------------------------------- | ---------- | -------- |
| 1   | `search_capabilities` returns ranked, schema-on-hit results (<=5) for an intent query, biased by the owned tab's origin; `invoke_capability` executes a selected capability with validated params and returns a structured result (SC-1 / SURF-01, SURF-02) | VERIFIED | `capability-search.js:165-207` `search()` caps at `Math.max(1,Math.min(Number(topN)||5,5))`, each hit carries `{slug,service,sideEffectClass,description,score,params}` (schema-on-hit), origin bias via `boostDocument` (178) + `_stableSortByOwnedService` fallback (210). Dispatcher `handleCapabilitiesInvokeMessageRoute` (2198-2220) runs `getRecipeBySlug -> interpretRecipe (SW-side param validation) -> executeBoundSpec` returning the normalized `{success,status,finalUrl,redirected,data,text}` shape. `node tests/capability-search-eval.test.js` exit 0 asserts cap<=5, schema-on-hit, sideEffectClass present. |
| 2   | Both tools register OUTSIDE `TOOL_REGISTRY` via `server.tool()`, keeping the existing ~63 MCP tool schemas byte-identical (SC-2 / SURF-03, INV-01) | VERIFIED | `capabilities.ts:41,71` both via `server.tool()`; `git diff 8f707215..HEAD` shows `tool-definitions.{js,cjs}` and `errors.ts` UNTOUCHED + clean working tree. `node tests/tool-definitions-parity.test.js` exit 0 (256 passed, `EXPECTED_NON_TRIGGER_REGISTRY_HASH` unmoved). `node tests/capability-mcp-surface.test.js` exit 0: 65 tools on the wire (63+2), both names registered, neither in `TOOL_REGISTRY`. |
| 3   | A persisted minisearch index indexes intent synonyms + service + action verb + side-effect class and snapshots to `chrome.storage.local`; search is read-only/queue-bypass while invoke is serialized (SC-3 / SURF-04, SURF-05) | VERIFIED | `capability-search.js:48-52` `INDEX_OPTIONS.fields=['intentSynonyms','description','service','actionVerb']`; `buildIndex` (89-108) cross-derives `sideEffectClass` from method; `buildOrRestore` (111-149) snapshots to `chrome.storage.local` under `fsbCapabilityIndex` (54) with a `catalogVersion` stamp + `loadJSON(json,INDEX_OPTIONS)` restore. `queue.ts:41` has `search_capabilities` in `readOnlyTools`; `invoke_capability` absent (count 0). Surface test (c) proves the split structurally AND behaviorally (bypass-before-mutation). |
| 4   | An eval harness measures recall@k and wrong-invoke rate, and the milestone is gated on its thresholds (SC-4 / SURF-06) | VERIFIED | `capability-search-eval.test.js:85-118` measures `recall@5` and `wrong-invoke` over 36 near-neighbor fixtures, asserts `recall>=0.9` AND `wrongRate===0`, `process.exit(1)` on breach. Run in this verifier: `recall@5=1.000 wrong-invoke=0.000`, exit 0. Wired into `npm test` (chain index 7394, before surface 7439) and `npm run ci` runs `npm test`. (Eval-fidelity caveat WR-03 below -- advisory, does not break the criterion.) |
| 5   | Catalog ships in the packaged extension (build-time `FsbRecipeIndex` IIFE), loaded at SW startup, firing `buildOrRestore()` (SURF-04 ship + load) | VERIFIED | `package-extension.mjs:67-85` reads `catalog/recipes/*.json` + `catalog/descriptors/*.json` (`_fixtures/` excluded via non-recursive `readdirSync`), writes `extension/catalog/recipe-index.generated.js` setting `global.FsbRecipeIndex`. Run: exit 0, ships 1 recipe + 1 descriptor, `global.FsbRecipeIndex` present. `background.js:154-161` loads recipe-index.generated.js then capability-search.js (after minisearch:120, capability-fetch:143) then fires `buildOrRestore()` additively. |
| 6   | INV-01 surface proof: both tools on the wire while the registry hash stays unchanged (SURF-03 proof) + RECIPE_NOT_FOUND for unknown slug (SURF-02 error half) | VERIFIED | `capability-mcp-surface.test.js` (285 lines) exit 0: (a) built-runtime `server._registeredTools` enumeration = 65, (b) recomputed `registryHash === EXPECTED_NON_TRIGGER_REGISTRY_HASH`, (c) queue split, (d) `mapFSBError` surfaces `RECIPE_NOT_FOUND` verbatim (NOT collapsed to `action_rejected`). Dispatcher returns RECIPE_NOT_FOUND dual-field shape (2204) via the existing `/^RECIPE_.+$/` errors.ts passthrough (no errors.ts edit). |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `extension/utils/capability-search.js` | MiniSearch index + slug->recipe map + INDEX_OPTIONS + buildOrRestore/buildIndex/search/getRecipeBySlug/deriveSideEffect; `global.FsbCapabilitySearch`; eval-free; on allowlist | VERIFIED | 241 lines. Full export surface (233 exports INDEX_OPTIONS; 236 sets global; 238-239 module.exports guard). `deriveSideEffect` DELETE->destructive/POST->mutate/GET->read (76-81). No `eval(`/`new Function`/`import(` (grep clean). On `RECIPE_PATH_ALLOWLIST` (verify-recipe-path-guard.mjs:99). |
| `catalog/descriptors/github-notifications.json` | D-01 descriptor, slug==github.notifications, intentSynonyms, sideEffectClass read | VERIFIED | 14 lines. slug `github.notifications`, 5 intentSynonyms, actionVerb `list`, sideEffectClass `read`. |
| `catalog/descriptors/_fixtures/seed-descriptors.json` | >=8 near-neighbor descriptors (read/mutate/destructive) | VERIFIED | 170 lines, 12 seed descriptors; read+mutate+destructive all present; send/post/message near-neighbors. |
| `catalog/descriptors/_fixtures/seed-recipes.json` | one recipe per seed (id==slug) with params | VERIFIED | 206 lines; structural gate confirms 1:1 with descriptors, every recipe has `params.type==='object'`. |
| `catalog/descriptors/_fixtures/intent-cases.json` | >=30 intent->expectedSlug pairs | VERIFIED | 36 cases (intent-cases gate passed); every expectedSlug resolves to a known slug. |
| `tests/capability-search-eval.test.js` | recall@5 + wrong-invoke gate + round-trip + schema-on-hit/cap | VERIFIED | 164 lines, 11 assertions, exit 0. Reuses module `INDEX_OPTIONS`/`buildIndex`/`search` (single source of truth). |
| `tests/capability-mcp-surface.test.js` | INV-01 proof: two tools on wire + hash unchanged + queue split + RECIPE_NOT_FOUND | VERIFIED | 285 lines, 19 assertions, exit 0. References `EXPECTED_NON_TRIGGER_REGISTRY_HASH`. |
| `mcp/src/tools/capabilities.ts` | registerCapabilityTools: two out-of-registry server.tool() + read-only/queued split | VERIFIED | 98 lines. Both `server.tool()` calls, D-10 zod shapes, bridge messages, both wrapped in `queue.enqueue`, invoke uses `sendAgentScopedBridgeMessage`. SECURITY "not via TOOL_REGISTRY" doc-comment (19). |
| `mcp/src/queue.ts` | search_capabilities in readOnlyTools | VERIFIED | 95 lines. Line 41 in the Set; invoke_capability absent (count 0). |
| `mcp/src/runtime.ts` | registerCapabilityTools call | VERIFIED | 50 lines. import (14) + call (44) adjacent to registerVaultTools. |
| `extension/ws/mcp-tool-dispatcher.js` | two routes + two handlers + SW-side origin/tab resolution | VERIFIED | Routes (111-112), handlers (2172, 2198). `node --check` exit 0. RECIPE_NOT_FOUND (2204). |
| `extension/ws/mcp-bridge-client.js` | two switch cases + two delegates into dispatchMcpMessageRoute | VERIFIED | Cases (472-476), delegate methods (1676, 1687) both call dispatchMcpMessageRoute returning `response||{}`. `node --check` exit 0. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `runtime.ts` | `tools/capabilities.ts` | `registerCapabilityTools(server,bridge,queue,agentScope)` after registerVaultTools | WIRED | import (14) + call (44); surface test confirms 65 tools on the built wire. |
| `capabilities.ts` | `extension/ws/mcp-tool-dispatcher.js` | bridge messages `mcp:capabilities-search` (read-only) / `mcp:capabilities-invoke` (queued) | WIRED | Tool-layer sends both; dispatcher routes (111-112) match the exact wire names; `mcp/src/types.ts` MCPMessageType union extended so typed bridge calls compile. |
| `capabilities.ts` | `queue.ts` | `queue.enqueue('search_capabilities')` bypasses; `queue.enqueue('invoke_capability')` serializes | WIRED | Both bodies wrap in `queue.enqueue`; readOnlyTools membership decides; surface test (c) proves bypass-before-mutation behaviorally. |
| `mcp-tool-dispatcher.js` | `capability-search.js` | `FsbCapabilitySearch.search` (bias) + `getRecipeBySlug` (invoke lookup) | WIRED | search handler calls `.search` (2188); invoke calls `.getRecipeBySlug` (2202). 4 FsbCapabilitySearch refs. |
| `mcp-tool-dispatcher.js` | `capability-interpreter.js` + `capability-fetch.js` | `interpretRecipe` then `executeBoundSpec` (routerless invoke) | WIRED | interpretRecipe (2206), executeBoundSpec (2220). Origin-pin re-asserted in executeBoundSpec (capability-fetch.js:291). |
| `mcp-bridge-client.js` | `mcp-tool-dispatcher.js` | `dispatchMcpMessageRoute` for both new types | WIRED | Delegates (1676/1687) call dispatchMcpMessageRoute with matching types. |
| `tests/capability-search-eval.test.js` | `capability-search.js` | `require()` of INDEX_OPTIONS + buildIndex + search (no options drift) | WIRED | Test imports the runtime module's constants; recall/wrong-invoke share INDEX_OPTIONS (caveat WR-03: query-time ranking not shared -- advisory). |
| `tests/capability-search-eval.test.js` | `extension/lib/minisearch.min.js` | MiniSearch UMD; loadJSON(json, INDEX_OPTIONS) reuses options constant | WIRED | Round-trip assertion passes; loadJSON-without-options throws (proven). |
| `package-extension.mjs` | `extension/catalog/recipe-index.generated.js` | build-time generator emitting `global.FsbRecipeIndex={recipes,descriptors}` before zip | WIRED | Generated on run (1 recipe + 1 descriptor); FsbRecipeIndex global present; loaded in background.js:154. |
| `tests/capability-mcp-surface.test.js` | `mcp/build` runtime + `tool-definitions-parity.test.js` | built-runtime enumeration + EXPECTED_NON_TRIGGER_REGISTRY_HASH re-assert | WIRED | createRuntime() -> server._registeredTools = 65; recomputed hash == frozen hash. |
| `package.json` | both new tests | appended to test &&-chain after capability-fetch.test.js | WIRED | eval (idx 7394) before surface (idx 7439); ci runs npm test. |

### Data-Flow Trace (Level 4)

The search index renders dynamic data; its data source was traced upstream.

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `capability-search.js` `search()` results | `_ms` (MiniSearch index) + `_slugToRecipe` | `buildOrRestore()` reads `_getCatalog()` = `global.FsbRecipeIndex` (build-time generated) OR `chrome.storage.local` snapshot; eval test plants the 12-descriptor seed on `global.FsbRecipeIndex` | YES | FLOWING -- packaged build populates FsbRecipeIndex (verified 1 recipe + 1 descriptor); test harness plants the seed and `search('send a message',null,5)` returns 5 real hits with params (eval test PASS "module search returns hits after buildOrRestore"). Degrades to empty catalog only when no catalog global AND no snapshot (designed D-16 dev-tree behavior). |
| dispatcher search results | `results` from `FsbCapabilitySearch.search` | live SW global populated at startup by buildOrRestore | YES (in extension) | FLOWING in the running extension; the CI surface test mocks the engine globals to assert wire/error behavior. Live data path is the human-UAT item. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Eval gate runs and prints recall/wrong-invoke metrics | `node tests/capability-search-eval.test.js` | `recall@5=1.000 wrong-invoke=0.000 over 36 fixtures`, 11 passed, exit 0 | PASS |
| Surface proof: 65 tools on wire, hash unchanged, queue split, RECIPE_NOT_FOUND | `node tests/capability-mcp-surface.test.js` | 19 passed, exit 0 (65 tools; hash unmoved; bypass-before-mutation; RECIPE_NOT_FOUND verbatim) | PASS |
| INV-01 registry hash lock | `node tests/tool-definitions-parity.test.js` | 256 passed, exit 0 (EXPECTED_NON_TRIGGER_REGISTRY_HASH unchanged) | PASS |
| Wall 1: capability-search.js on allowlist, eval-free | `node scripts/verify-recipe-path-guard.mjs` | PASS (8 recipe-path files clean, 5 on-disk capability modules all allowlisted) | PASS |
| MCP module compiles cleanly | `npm --prefix mcp run build` | exit 0 | PASS |
| Catalog ships non-empty | `node scripts/package-extension.mjs` + require generated | exit 0; 1 recipe + 1 descriptor; FsbRecipeIndex present | PASS |
| Full milestone gate end-to-end | `npm test` | exit 0 (entire &&-chain; every suite "0 failed"; tail = capability-mcp-surface 19/0) | PASS |
| SW transport files parse | `node --check` on dispatcher + bridge-client | both exit 0 | PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes are declared for this phase; verification is via the zero-framework `tests/*.test.js` gate suite (run above). N/A.

### Requirements Coverage

Requirement IDs collected from all four PLAN frontmatters: SURF-01, SURF-02, SURF-03, SURF-04, SURF-05, SURF-06 (INV-01 is an invariant re-verified, not a phase-owned new requirement). Cross-referenced against REQUIREMENTS.md (lines 28-33, 123-128). Every SURF ID for Phase 28 is accounted for and satisfied. No orphaned requirements (REQUIREMENTS.md maps exactly SURF-01..06 to Phase 28).

| Requirement | Source Plan(s) | Description | Status | Evidence |
| ----------- | -------------- | ----------- | ------ | -------- |
| SURF-01 | 28-01, 28-02, 28-03 | search_capabilities returns ranked schema-on-hit results (<=5), origin-biased | SATISFIED | search() cap+schema-on-hit+bias (Truth 1); eval test cap/schema assertions; dispatcher SW-side origin resolution. |
| SURF-02 | 28-02, 28-03, 28-04 | invoke_capability executes a selected capability with validated params, structured result | SATISFIED | Routerless invoke path (Truth 1, 6); params validated in interpretRecipe; RECIPE_NOT_FOUND proven verbatim. |
| SURF-03 | 28-02, 28-04 | Both tools out-of-registry, ~63 schemas byte-identical (INV-01) | SATISFIED | server.tool() out-of-registry; parity hash unchanged; 65 tools on wire (Truth 2, 6). |
| SURF-04 | 28-01 | Persisted minisearch index over synonyms+service+verb+side-effect, snapshot to chrome.storage.local | SATISFIED | INDEX_OPTIONS fields + buildOrRestore snapshot/restore + catalog ships (Truth 3, 5). |
| SURF-05 | 28-02, 28-04 | search read-only/queue-bypass; invoke serialized | SATISFIED | readOnlyTools membership split; behavioral bypass-before-mutation proof (Truth 3). |
| SURF-06 | 28-01 | Eval harness measures recall@k + wrong-invoke; milestone gated on thresholds | SATISFIED | recall@5>=0.9 AND wrong-invoke===0 asserted, gated in npm test/ci; run = 1.000/0.000 (Truth 4). |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (all phase files) | -- | TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER | none | NONE found in any phase-modified file. |
| `capability-search.js` | 91, 166 | `return null` / `return []` | INFO | Intentional typeof-guard degrade paths (MiniSearch/index absent under Node harness or partial dev tree) -- the designed dual-export IIFE graceful-degradation, not stubs. Overwritten by buildOrRestore in the running extension. |
| `catalog/recipes/github-notifications.json` | 5 | endpoint `/notifications` (HTML page, not JSON API) | INFO (REVIEW IN-04) | The one shipped capability fetches HTML; pure catalog DATA quality (Wall 1 unaffected); eval gate runs on _fixtures seed, not this entry. Does not affect engine correctness or any SURF criterion. Follow-up: point at a JSON endpoint. |

### Advisory Review Findings (28-REVIEW.md) -- Re-checked Against Success Criteria

| ID | Finding | Re-verified at code level | Undermines a success criterion? | Disposition |
| -- | ------- | ------------------------- | ------------------------------- | ----------- |
| WR-01 | invoke handler ignores injected agentId/ownershipToken and does not gate a model-supplied tab_id | Confirmed: `handleCapabilitiesInvokeMessageRoute` (2198-2220) reads neither; cross-agent tab vector bounded only by the origin-pin | NO | WARNING (advisory). Phase 28 invoke is intentionally UNGATED -- consent (Off/Ask/Auto) is Phase 30, tiered router is Phase 29 (explicit phase boundary, task brief + SUMMARY-03 + handler comment 2197). The two-point origin-pin holds (executeBoundSpec re-asserts tabOrigin===spec.origin, capability-fetch.js:291). SC-1 "executes with validated params + structured result" is met. Recommend documenting the deliberately-unused ownership material so a future maintainer does not read it as enforcement. |
| WR-02 | "un-spoofable / resolved authoritatively SW-side" comment contradicts code that accepts a model `payload.origin` override first | Confirmed: dispatcher 2169-2178 comment vs `let ownedOrigin = payload.origin || null` (2178) | NO | WARNING (advisory). The bias origin has ZERO authorization weight (ranking-only: boostDocument 178 + _stableSortByOwnedService 210); the invoke origin-pin is independent. The tool schema (capabilities.ts:46) correctly documents origin as "Non-authoritative". SC-1 "biased by the owned tab's origin" holds when no override supplied. Defect is the misleading COMMENT, not behavior. Recommend correcting the comment. |
| WR-03 | eval gate computes recall/wrong-invoke via an inline options object, not the runtime `search()` ranking path | Confirmed: `capability-search-eval.test.js:85-118` uses `ms.search(...,{boost:{intentSynonyms:3}})` inline; runtime `search()` uses `boost:{intentSynonyms:3,description:1}` + boostDocument + fallback; module search() exercised only for shape (143-159) | NO | WARNING (advisory). SC-4 ("an eval harness measures recall@k and wrong-invoke and the milestone is gated on its thresholds") is met: the harness measures both, asserts >=0.9 AND ===0, and gates npm test/ci; it shares INDEX_OPTIONS + the near-neighbor seed. The gap is eval FIDELITY -- a future regression in the runtime query-time ranking could slip past this specific gate. A robustness follow-up, not a criterion failure. Recommend driving the SURF-06 numbers through the module `search()` after buildOrRestore (no chrome -> in-memory build). |
| IN-01..IN-04 | doc/impl drift on sideEffectClass cross-check; substring vs host-equality origin match; catalogVersion ignores INDEX_OPTIONS; HTML endpoint | Spot-checked (IN-02 indexOf at 178/215; IN-04 recipe endpoint) | NO | INFO. None affects a SURF criterion; runtime behavior is the safe one in each case (method-derived class wins; loadJSON throw self-heals on options change; bias is ranking-only). Follow-up nits. |

### Human Verification Required

#### 1. Live MCP-client end-to-end wire smoke (search -> invoke)

**Test:** From a live MCP host with the Chrome extension connected, on a tab at `https://github.com`: call `search_capabilities("show my github notifications")`, then `invoke_capability("github.notifications")`.
**Expected:** `search_capabilities` ranks the `github.notifications` slug first and returns its `params` JSON-Schema; `invoke_capability` returns a logged-in-shape structured result (`{success,status,finalUrl,redirected,data,text}`) from the authenticated session.
**Why human:** Requires a live Chrome extension + MCP host + a logged-in origin -- FSB's established live-browser UAT posture (recorded as `human_needed`, not fabricated). The CI half (mocked `executeBoundSpec`, stubbed bridge, in-memory index) fully covers the logic and is green here. This is the single Manual-Only row in 28-VALIDATION.md, consistent with the Phase 27 FETCH-05 live posture. Record the outcome in `28-HUMAN-UAT.md`.

### Gaps Summary

No gaps. All six observable truths VERIFIED, all twelve artifacts pass all levels (exist, substantive, wired, data-flowing), all eleven key links WIRED, no debt markers, and all eight authoritative gate commands + the full `npm test` chain exit 0 when run in this verifier's own process. Every SURF-01..06 requirement is satisfied and accounted for against REQUIREMENTS.md. INV-01 holds (tool-definitions byte-untouched, parity hash unmoved, 65 tools on the wire). The three advisory review WARNINGs were independently re-checked and none undermines a success criterion -- they are Phase-29/30 boundary concerns (WR-01), a misleading comment (WR-02), and an eval-fidelity follow-up (WR-03), recorded as advisory items for future cleanup.

The phase goal is achieved in the codebase. Status is `human_needed` (not `passed`) solely because the live MCP-client end-to-end browser smoke remains a human-gated UAT per 28-VALIDATION.md Manual-Only -- the automated SURF-01..06 gates are all green without a browser, exactly as the task brief anticipated.

---

_Verified: 2026-06-21T04:25:13Z_
_Verifier: Claude (gsd-verifier)_
