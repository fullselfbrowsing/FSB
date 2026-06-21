---
phase: 28-lean-mcp-surface-capability-search-eval-harness
reviewed: 2026-06-20T00:00:00Z
depth: deep
files_reviewed: 19
files_reviewed_list:
  - extension/utils/capability-search.js
  - extension/ws/mcp-tool-dispatcher.js
  - extension/ws/mcp-bridge-client.js
  - extension/background.js
  - mcp/src/tools/capabilities.ts
  - mcp/src/runtime.ts
  - mcp/src/queue.ts
  - mcp/src/types.ts
  - scripts/package-extension.mjs
  - scripts/verify-recipe-path-guard.mjs
  - catalog/descriptors/github-notifications.json
  - catalog/recipes/github-notifications.json
  - catalog/descriptors/_fixtures/intent-cases.json
  - catalog/descriptors/_fixtures/seed-descriptors.json
  - catalog/descriptors/_fixtures/seed-recipes.json
  - tests/capability-search-eval.test.js
  - tests/capability-mcp-surface.test.js
  - tests/lattice-provider-bridge-smoke.test.js
  - package.json
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 28: Code Review Report

**Reviewed:** 2026-06-20
**Depth:** deep
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Phase 28 exposes the capability engine through a lean two-tool MCP surface
(`search_capabilities` -> `invoke_capability`) plus a persisted MiniSearch index
gated by an eval harness. I reviewed the new `capability-search.js`, the two new
dispatcher handlers, the MCP-server registrations, the build-time catalog
shipping, the recipe-path guard change, all descriptor/fixture data, and both new
tests at deep depth (cross-file trace through `interpretRecipe` and
`executeBoundSpec`).

The core engineering is sound and the hard invariants HOLD. I empirically
verified the load-bearing ones by running the gates:

- **INV-01 verified.** `tests/capability-mcp-surface.test.js` passes: 65 tools on
  the wire (63 + 2 new), `EXPECTED_NON_TRIGGER_REGISTRY_HASH` byte-unchanged, and
  neither new tool appears in `TOOL_REGISTRY`. The frozen `tool-definitions.js` /
  `tool-definitions.cjs` files were NOT edited in this diff.
- **Wall 1 verified.** `capability-search.js` is free of `eval` / `new Function` /
  `import(` (even in comments) and is on `RECIPE_PATH_ALLOWLIST`;
  `verify-recipe-path-guard.mjs` passes (8 recipe-path files clean, 5 on-disk
  capability modules all allowlisted).
- **MiniSearch round-trip verified.** `loadJSON(json, INDEX_OPTIONS)` uses the
  single shared `INDEX_OPTIONS` constant and reproduces identical top hits;
  `loadJSON` without the options arg throws (proven by the eval test). Corrupt or
  options-mismatched snapshots are caught and fall through to rebuild.
- **Origin-pin verified.** The invoke path's authorization control is the SW-side
  re-assertion `tabOrigin === spec.origin` inside `executeBoundSpec`
  (capability-fetch.js:291), where `spec.origin` derives from the server-trusted
  `recipe.origin` (never model input). A model-supplied `tab_id` cannot drive a
  credentialed fetch against a tab whose origin differs from the recipe.
- **No auth material leaks.** `executeBoundSpec` returns only the response body /
  JMESPath-extracted data (capability-fetch.js:377-384); cookies stay in the
  browser. `payload.origin` is consumed ONLY by the search ranking bias and never
  reaches the fetch/auth path.
- **Queue split verified.** `search_capabilities` is in `readOnlyTools` (bypass),
  `invoke_capability` is not (serialized) -- proven behaviorally.
- **No emojis** in any new/modified source.

No BLOCKER defects. The findings below are three WARNINGs (a security-relevant
gating/threading inconsistency on the invoke path, a misleading "un-spoofable"
security comment, and an eval-harness integrity gap) plus four quality INFO items.

## Warnings

### WR-01: invoke handler ignores the agentId/ownershipToken it is handed and never gates a model-chosen `tab_id`

**File:** `extension/ws/mcp-tool-dispatcher.js:2198-2221`
**Issue:**
`handleCapabilitiesInvokeMessageRoute` performs NO ownership/agent check. The
server-side caller (`mcp/src/tools/capabilities.ts:87` ->
`sendAgentScopedBridgeMessage`) injects `agentId` AND `ownershipToken` into the
invoke payload (agent-bridge.ts:56-62), but the dispatcher handler never reads
them and never calls `checkOwnershipGate`. Every other tab-touching MCP message
route DOES gate: the trigger route normalizes `tab_id`/`target_tab_id` into
`tabId` and calls `checkOwnershipGate` (line 1600), and `handleBackRoute` gates at
lines 1078 and 1115. The invoke handler is the one tab-touching, side-effecting
route that skips it.

Because `tab_id` is a model-supplied positive integer passed straight to
`executeBoundSpec` (line 2211, 2220), in a multi-agent deployment a confused or
adversarial model under agent A can drive an authenticated, potentially MUTATING
MAIN-world fetch in a tab owned by agent B -- as long as that tab's origin equals
the recipe's origin. The origin-pin (the intended Phase-28 control) bounds the
target to "any tab currently at `recipe.origin`", not "a tab this agent owns". The
phase scope deliberately ships invoke UNGATED (consent is Phase 30, the tiered
router is Phase 29), so this is a known scope boundary -- but threading
`agentId`/`ownershipToken` into the payload and then silently dropping them is a
latent trap: a future maintainer will reasonably assume ownership is enforced
here when it is not, and the active-tab fallback (lines 2212-2218) targets
whatever tab is active in the current window regardless of agent ownership.

**Fix:**
Either (a) explicitly document at the handler that invoke is intentionally
ungated in Phase 28 and that the injected `agentId`/`ownershipToken` are
deliberately unused until Phase 29/30 (so the dead threading is not mistaken for
enforcement), or (b) add the same `checkOwnershipGate` precheck the trigger/back
routes use once a concrete `tab_id` is resolved:
```js
// after tabId is resolved (explicit payload.tab_id or active tab):
const gateResult = checkOwnershipGate({
  tool: 'invoke_capability',
  params: {},
  payload: { ...payload, tabId }
});
if (gateResult) return gateResult;
return await FsbCapabilityFetch.executeBoundSpec(interpreted.spec, tabId);
```
Option (b) closes the cross-agent-tab vector while leaving the consent gate to
Phase 30. At minimum, option (a) must land so the ignored ownership material is
not read as a security guarantee.

### WR-02: "un-spoofable" / "resolved authoritatively SW-side" comment contradicts the code, which accepts a model-supplied origin override

**File:** `extension/ws/mcp-tool-dispatcher.js:2169-2178`
**Issue:**
The handler comment states the owned-tab origin is "resolved authoritatively
SW-side (un-spoofable, D-11)" and "The model NEVER supplies the authoritative
origin." The code immediately below does the opposite:
```js
let ownedOrigin = payload.origin || null;   // model-supplied value wins
if (!ownedOrigin) { /* SW-resolve active tab only as a fallback */ }
```
So the bias origin IS spoofable -- when the model sends `origin`, the SW-resolved
active-tab origin is never consulted. This does not break the security invariant
in practice (the bias origin only re-ranks search hits via `boostDocument` /
`_stableSortByOwnedService`; it has zero authorization weight, and the
independent invoke origin-pin is unaffected), so it is non-authoritative in the
security sense. The defect is the comment: it asserts an "un-spoofable" property
the code does not provide, which is exactly the kind of false guarantee a future
change could build an authorization decision on top of.

**Fix:**
Correct the comment to match reality, e.g.:
```
// The bias origin defaults to the SW-resolved active-tab origin. payload.origin
// is an OPTIONAL model-supplied OVERRIDE used ONLY to bias search ranking; it is
// non-authoritative and MUST NOT be used for any authorization decision. (The
// invoke origin-pin is enforced separately and independently in executeBoundSpec.)
```
If the design intent was genuinely that the active-tab origin be authoritative
for the bias, invert the precedence (SW-resolved first, `payload.origin` only when
no active tab) -- but given the bias is ranking-only, fixing the comment is the
correct minimal change.

### WR-03: the eval gate does not exercise the runtime `search()` ranking path it claims to validate

**File:** `tests/capability-search-eval.test.js:85-118`
**Issue:**
The recall@5 / wrong-invoke gate (SURF-06, the non-negotiable
"zero-wrong-invoke") is computed by calling `ms.search(f.intent, {...})` with an
options object constructed INLINE in the test (`combineWith:'OR'`, `prefix:true`,
`fuzzy:0.2`, `boost:{ intentSynonyms: 3 }`). The actual runtime ranking lives in
`capability-search.js` `search()` (lines 170-193), which uses a DIFFERENT options
shape (`boost:{ intentSynonyms: 3, description: 1 }`) PLUS the `boostDocument`
origin bias PLUS the `_stableSortByOwnedService` re-rank fallback. The test's
docstring claims "the harness uses the SAME options as the runtime module ... this
is what prevents a silent options-drift failure mode," but for the gate that
matters most (recall/wrong-invoke) it only shares `INDEX_OPTIONS` (the index
construction), not the query-time ranking. The runtime `search()` could regress
its ranking (e.g. a bad boost change that pushes a destructive near-neighbor to
top1) and this gate would still pass green, because the gate never calls
`search()`.

The module's `search()` IS exercised later (lines 143-159), but only for
shape assertions (hit count <= 5, `params`/`sideEffectClass` present) -- never for
the recall/wrong-invoke metric.

**Fix:**
Compute the recall@5 / wrong-invoke metric through the runtime `search()` so the
gate guards the real ranking. With no `chrome` present, `buildOrRestore()` builds
in-memory from the planted `FsbRecipeIndex`, so the module `search(intent, null,
5)` is callable:
```js
await CapabilitySearch.buildOrRestore();
for (const f of FIXTURES) {
  const hits = search(f.intent, null, 5);     // runtime ranking path
  const slugs = hits.map(h => h.slug);
  if (slugs.includes(f.expectedSlug)) hit++;
  if (hits[0] && hits[0].slug !== f.expectedSlug) wrongInvoke++;
}
```
Keep the inline `ms.search` round-trip block for the toJSON/loadJSON proof, but
drive the SURF-06 numbers through `search()`.

## Info

### IN-01: D-02 "cross-check against the derived value" is documented but not implemented -- the descriptor value is silently overridden

**File:** `extension/utils/capability-search.js:84-106`
**Issue:**
The header (lines 25-26, 87-88) and inline comment (line 103) state the
authored `sideEffectClass` is "cross-checked against the recipe-derived value at
index-build time." There is no cross-check: `buildIndex` computes `derived` and
unconditionally takes `derived || d.sideEffectClass || 'read'` (line 104). When a
paired recipe exists, the descriptor's authored value is silently discarded with
no comparison, warning, or assertion. The runtime behavior is the SAFE one (the
method-derived class wins, so a mis-authored descriptor cannot under-state a
DELETE as `read`), so this is documentation overstating the implementation, not a
correctness bug. (The seed fixtures happen to be consistent, so even a real
cross-check would be silent here.)
**Fix:** Either implement an actual integrity check (e.g.
`if (derived && d.sideEffectClass && derived !== d.sideEffectClass) console.warn(...)`)
or soften the comments to "the recipe-derived class OVERRIDES the authored
descriptor value when a paired recipe exists" so the doc matches the code.

### IN-02: origin bias uses substring containment, not host equality

**File:** `extension/utils/capability-search.js:178, 215`
**Issue:**
The owned-origin boost matches via
`stored.service.indexOf(ownedService) !== -1` (and the same in
`_stableSortByOwnedService`). This is substring containment, so an owned host
`github.com` boosts a document whose `service` is `evil-github.com` or
`github.com.attacker.net`. Because the bias is purely a ranking signal with no
authorization weight (see WR-02), this is a ranking-quality nit, not a security
issue -- but it can mis-bias results toward a look-alike service string.
**Fix:** Compare host equality (or suffix-with-dot-boundary) instead of raw
`indexOf`, e.g. `stored.service === ownedService || stored.service.endsWith('.' + ownedService)`.

### IN-03: catalogVersion stamp ignores INDEX_OPTIONS, so an options change with an unchanged catalog relies on loadJSON's throw-and-rebuild to self-heal

**File:** `extension/utils/capability-search.js:152-162`
**Issue:**
`_computeCatalogVersion` hashes sorted descriptor slugs + recipe count +
declared version, but NOT `INDEX_OPTIONS`. If a future change edits
`INDEX_OPTIONS` (adds a searchable field, etc.) without any catalog content
change, the version still matches and `buildOrRestore` attempts to restore a
snapshot serialized under the OLD options. MiniSearch's `loadJSON` validates the
embedded options against the passed options and throws on mismatch; that throw is
caught (line 136) and falls through to rebuild, so it self-heals -- but via an
exception path rather than a clean version bump.
**Fix:** Fold a stable fingerprint of `INDEX_OPTIONS` (e.g. its JSON string) into
the `seed` so an options change invalidates the snapshot deterministically:
`var seed = parts.join('|') + '#' + recipes.length + '#' + (declaredVersion||'') + '#' + JSON.stringify(INDEX_OPTIONS);`

### IN-04: the only SHIPPED capability fetches an HTML page, not an API endpoint (descriptor/recipe data quality)

**File:** `catalog/recipes/github-notifications.json:5`
**Issue:**
The single production catalog entry (`github.notifications`) maps to
`endpoint: "/notifications"`, which is the GitHub web notifications HTML page, not
a JSON API. `executeBoundSpec` will fetch HTML and the `extract: "@"` JMESPath
identity returns the raw body, so `invoke_capability` for the only shipped
capability yields an HTML blob rather than structured notification data. This is
catalog DATA quality (pure data, never code -- Wall 1 unaffected) and does not
affect the engine's correctness; the eval gate runs entirely on the `_fixtures`
seed, not this entry. Flagging so the one user-facing capability is not silently
low-value.
**Fix:** Point the recipe at a JSON endpoint
(e.g. `https://api.github.com/notifications` with the appropriate origin/auth) or
add an `extract` that pulls structured fields, so the shipped capability returns
usable data.

---

_Reviewed: 2026-06-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
