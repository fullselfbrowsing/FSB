---
phase: 31-network-capture-discovery-recipe-synthesis-learned-recipes
reviewed: 2026-06-22T00:00:00Z
depth: deep
files_reviewed: 16
files_reviewed_list:
  - extension/utils/network-capture.js
  - extension/utils/network-capture-redactor.js
  - extension/utils/recipe-synthesizer.js
  - extension/utils/learned-recipe-store.js
  - extension/utils/discovery-session.js
  - extension/utils/capability-signature.js
  - extension/utils/capability-interpreter.js
  - extension/utils/capability-catalog.js
  - extension/utils/capability-router.js
  - extension/utils/capability-search.js
  - extension/background.js
  - extension/ws/mcp-tool-dispatcher.js
  - extension/ws/mcp-bridge-client.js
  - scripts/verify-recipe-path-guard.mjs
  - package.json
  - tests/_helpers/cdp-event-driver.js
findings:
  blocker: 0
  high: 1
  medium: 3
  low: 2
  total: 6
status: resolved
resolved_at: 2026-06-22
resolution:
  high: 1
  medium: 3
  low: 2
  fixed: 6
  skipped: 0
  commits:
    HI-01: ff7c6f13
    ME-01: 4e83806b
    ME-02: 287c21ef
    ME-03: 13f12eb6
    LO-01: ef9bade3
    LO-02: f33a5bf8
  gate: GREEN (15 Phase-31 suites + recipe-path-guard + background.js --check)
---

# Phase 31: Code Review Report

**Reviewed:** 2026-06-22
**Depth:** deep (cross-file: capture -> redact -> synthesize -> replay -> promote -> store -> catalog -> router; provenance trust channel; CDP attach lifecycle)
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Phase 31 adds the consent-gated CDP Network capture -> redaction -> recipe-synthesis -> learned-store -> T2-routing growth layer. I reviewed THE security property (capture-time redaction structurally excluding bodies/header-values/query/PII), the HI-01 provenance trust channel, the hostile-synthesis defense stack, the consent gate, per-origin isolation, and INV preservation with FORCE rigor, including live repro harnesses for the redactor, synthesizer, learned store, and the search-index snapshot lifecycle.

**The core security properties HOLD and are well-constructed:**
- **Redaction is structural, not filtered.** `redactRequest` returns header NAMES only (proven: it never reads a header value), drops query + fragment, and carries NO body/postData field. `redactResponse` returns only `{status, mimeType}` -- no headers, no body. There is NO `Network.getResponseBody` / `getRequestPostData` anywhere in the capture stack. A captured cookie / Authorization / xoxc / token VALUE cannot reach the ObservedCall, the recipe, the store, or the summary.
- **HI-01 provenance is correct.** `'local'` was added to the exempt set checked ONLY against the loader-resolved `trustedProvenance` (`arguments.length>=2 ? trustedProvenance : envelope.provenance` is unchanged). A recipe whose payload self-declares `provenance:'local'` with no loader vouch still falls through to verify. Confirmed in both `capability-signature.js` and `capability-interpreter.js`.
- **Hostile synthesis is contained.** Same-origin filter + consent gate + `validateRecipe`-before-promote + promote-ONLY-after-replay (through the real `interpretRecipe -> executeBoundSpec`, which re-pins origin) all hold. The synthesizer rejects protocol-relative (`//evil`), traversal (`..`), and non-http origins, and NEVER emits `csrf.from:'response'` (proven case-insensitively). Per-origin store isolation is hard-scoped (`entry.recipe.origin === origin`) with the `executeBoundSpec` origin-pin as the runtime backstop.
- **Consent gate** runs before any attach; fail-closed when the consent store is absent (`REASON_REQUIRED`). Sensitive origins require `confirmedSensitive`. LRU + quarantine stay consistent across the async store and the sync mirror (proven).

**However, one HIGH-severity functional defect breaks LEARN-03/D-14:** learned recipes are silently dropped from the capability search index on every service-worker restart because the snapshot `catalogVersion` suffix makes `buildOrRestore` reject its own persisted snapshot. The Phase-31 test that claims to cover this never exercises the real restart path, so it stays green over a real bug. Three medium and two low issues follow.

---

## High

### HI-01: Learned recipes silently dropped from the search index on every SW restart (LEARN-03 / D-14 broken)

**File:** `extension/utils/capability-search.js:300-303` (write) and `:132,:140` (restore comparison)
**Severity:** High
**Status:** RESOLVED (commit ff7c6f13). addLearnedRecipe now stamps the BASE-catalog version (cat.descriptors only) + '+learnedN'; buildOrRestore compares the base PREFIX (split on '+learned') and re-attaches the persisted index, so learned slugs survive an SW restart while a base-catalog change still invalidates. _learnedAddSeq re-seeded from the stored suffix. Regression test now drives the REAL buildOrRestore() across a simulated restart (verified RED against the old exact-match).

`addLearnedRecipe` persists the snapshot with a version that appends a learned suffix:

```js
var bumped = _computeCatalogVersion(baseDescriptors, baseRecipes, cat.version)
  + '+learned' + _learnedAddSeq;          // e.g. "2:e3805f86+learned1"
payload[STORAGE_KEY] = { catalogVersion: bumped, index: _ms.toJSON() };
```

On the next service-worker boot, `buildOrRestore()` recomputes the version from the **base catalog only** (`_getCatalog()` is the build-time `FsbRecipeIndex`, which has NO learned descriptors) and restores ONLY on an exact match:

```js
var catalogVersion = _computeCatalogVersion(descriptors, cat.recipes || [], cat.version); // "1:3fe8b718"
...
if (snap && snap.catalogVersion === catalogVersion && snap.index) {   // "...+learned1" !== "1:3fe8b718"
  _ms = MS.loadJSON(...); return true;
}
// else: rebuild from base descriptors (drops learned), then OVERWRITE the snapshot with the base version
```

Because the stored version ALWAYS carries the `+learnedN` suffix, the equality check ALWAYS fails after a restart. `buildOrRestore` then rebuilds from the base catalog (dropping every learned slug from the index) and re-persists the base-only snapshot, permanently discarding the learned entries from search. The in-code comment ("the stored version DIFFERS from the prior snapshot so a stale restore can never drop the learned entry") is exactly inverted: the version differs from what restore recomputes, so the snapshot is unconditionally discarded.

Proven with a harness against the real `buildOrRestore`:

```
base version:                     1:3fe8b718
after-learned version:            2:e3805f86+learned1
learned findable BEFORE restart:  [ 'shop.cart' ]
snapshot version AFTER restart:   1:3fe8b718          <- snapshot overwritten back to base
learned findable AFTER restart:   []                  <- LEARN-03 lost
```

MV3 service workers idle-shut-down within ~30s of inactivity, so this fires constantly. The learned-recipe STORE is separately hydrated (`hydrateSyncCache`), so catalog `resolve()` -> `getLearnedSync` -> T2 routing still works if the agent already knows the exact slug; but **discovery of the learned capability via `search()` (the whole point of LEARN-03) is lost after the first idle shutdown.**

Test gap: `tests/learned-search-add.test.js:101-114` "simulates a restart" by calling `MiniSearch.loadJSON(newSnap.index, INDEX_OPTIONS)` directly on the persisted snapshot -- it never calls `buildOrRestore()`, so the version-mismatch rejection is never exercised. Line 98-99's assertion ("so an SW restart rebuilds WITH the learned entry, D-14") is asserted but not actually verified.

**Fix:** Make the restore tolerant of the learned suffix, OR re-seed learned descriptors into the recomputed base version, OR rebuild the learned entries into the index from `FsbLearnedRecipeStore` on restart. The lowest-risk fix is a prefix-tolerant restore: split the stored version on `'+learned'` and compare the base part, while still using the full stored index (which already contains the learned docs):

```js
// buildOrRestore restore branch:
var storedBase = String(snap && snap.catalogVersion || '').split('+learned')[0];
if (snap && storedBase === catalogVersion && snap.index) {
  _ms = MS.loadJSON(JSON.stringify(snap.index), INDEX_OPTIONS);
  // re-seed _learnedAddSeq from the suffix so the next add keeps the version monotonic
  return true;
}
```

Then add a regression test that calls `addLearnedRecipe` -> resets the module -> `buildOrRestore()` -> asserts `search()` still returns the learned slug.

---

## Medium

### ME-01: `_onCdpEvent` double-registered (boot + per-session); boot registration is removed at the first `endSession`

**File:** `extension/background.js` (startup `onEvent.addListener(FsbNetworkCapture._onCdpEvent)`) and `extension/utils/network-capture.js:334` (`startSession`) / `:385` (`endSession` removeListener)
**Severity:** Medium
**Status:** RESOLVED (commit 4e83806b). Chose option (a): the boot registration is the single owner. startSession no longer adds the listener (removed the per-session addListener + the session.listener field); endSession no longer removes it (kept only the per-session onDetach removal). _onCdpEvent already no-ops when _session is null. Capture verified still working (network-capture + network-capture-consent suites green).

`_onCdpEvent` is added as an `onEvent` listener in two places using the SAME function reference: once permanently at service-worker boot (background.js) and again on every `startSession` (network-capture.js:334). Two consequences:

1. `endSession` (`:385`) calls `removeListener(session.listener)` where `session.listener === _onCdpEvent` -- this removes the **boot-registered** listener too (same reference). After the first discovery session ends, the boot-time registration is gone. The boot registration is therefore redundant and immediately undone -- misleading code implying a persistent capture listener that does not survive the first session.

2. In real Chrome, `addListener` of an identical reference is a no-op (reference dedup), so events fire once -- but the test driver's `addListener` does NOT dedup (`tests/_helpers/cdp-event-driver.js:80`: unconditional `listeners.push(fn)`). If the boot path were ever exercised in a non-deduping harness (or a future polyfill), `_onCdpEvent` would fire twice per event, double-decrementing `_session.remaining` (ending the session at half the configured count bound). The Map keyed by `requestId` makes the call-collection itself idempotent, so the leak is bounded, but the count-bound semantics would be wrong.

**Fix:** Pick ONE owner of the listener. Either (a) remove the per-session `addListener`/`removeListener` and rely solely on the boot-time registration (cleanest -- `_onCdpEvent` already no-ops when `!_session`), or (b) drop the boot-time registration in background.js and keep the per-session lifecycle. Do not register the same reference in both lifecycles.

### ME-02: Consent gate validates `payload.origin` but the debugger attaches to `payload.tab_id` with no cross-check

**File:** `extension/ws/mcp-tool-dispatcher.js` `handleCapabilitiesDiscoverMessageRoute` (the `if (tabId === null || !origin)` branch is skipped when BOTH are supplied)
**Severity:** Medium
**Status:** RESOLVED (commit 287c21ef). The session origin is now resolved from the ACTUAL resolved tab (chrome.tabs.get(tabId) -> new URL(url).origin, the un-spoofable D-11 pattern), not from payload.origin -- so the gated origin and the attach target are the same value. A supplied payload.origin must MATCH the tab's real origin or the route rejects (RECIPE_CONSENT_REQUIRED) before any attach. Verified via the real dispatchMcpMessageRoute path: origin=benign + tab_id=bank is rejected with no runDiscovery call; INV-01 frozen hash unmoved (capability-mcp-surface green).

When the caller supplies BOTH `payload.tab_id` and `payload.origin`, the handler uses them verbatim and never verifies that the tab's actual origin matches the supplied origin. Downstream, `FsbNetworkCapture.startSession` runs the consent gate against `origin` (the supplied value) and then attaches the debugger to `tabId` (the supplied tab). A caller can therefore pair `origin = https://benign.com` (consented, non-sensitive) with `tab_id = <a https://bank.com tab>`:

- Gate: consent for `benign.com` -> pass; classify `benign.com` -> not sensitive -> no extra confirm.
- Attach: `chrome.debugger.attach({tabId: <bank tab>})` succeeds; `Network.enable` runs on the bank tab; the "DevTools is debugging this tab" banner appears on **bank.com**.
- Capture: every bank.com request is dropped by the same-origin filter (`reqOrigin !== _session.origin` because `_session.origin === benign.com`), so NOTHING is captured or persisted.

So there is no data-capture leak (the same-origin filter is the saving control), but the **attach side effect and its banner land on an origin whose consent was never evaluated**. The "non-authoritative override" framing is weaker than the comment claims: the consent decision and the attach target can refer to different origins.

**Fix:** After resolving `tabId`, read the tab's real origin (`new URL((await chrome.tabs.get(tabId)).url).origin`) and use THAT as the authoritative session origin (ignore/over-ride `payload.origin`), or reject when a supplied `payload.origin` does not equal the resolved tab origin. This makes the gated origin and the attach target the same value.

### ME-03: Auth-carrier denylist misses several real auth-bearing header NAMES

**File:** `extension/utils/network-capture-redactor.js:52`
**Severity:** Medium
**Status:** RESOLVED (commit 13f12eb6). Broadened the anchored pattern to add proxy-authorization, authentication, x-csrf*/x-xsrf* (bare + hyphenated), x-auth*, and x-access-token. The value-exclusion property is unchanged (name hygiene only). Verified the 5 new carriers are stripped while benign names (content-type, accept, x-requested-with, referer) survive and the redaction suite stays green (33 pass).

```js
var AUTH_CARRIER_DENYLIST = /^(authorization|cookie|set-cookie|x-csrf-.*|x-xsrf-.*|x-api-key|.*bearer.*)$/i;
```

The redactor's PRIMARY control (never read a header VALUE) holds, so no secret value leaks. The denylist is the SECONDARY control that removes even the NAME of an auth carrier. It has gaps -- proven against common carriers:

```
LEAKS  proxy-authorization      (auth carrier, not matched)
LEAKS  authentication           (auth carrier, not matched)
LEAKS  x-auth-token             (auth carrier, not matched)
LEAKS  x-access-token           (auth carrier, not matched)
LEAKS  x-csrf                   (exact name, no trailing '-': x-csrf-.* requires the hyphen)
LEAKS  x-xsrf                   (same)
```

These survive into `headerNames` as NAMES only (e.g. `"x-auth-token"`), never values, so the GOV-06 "auth stays local" VALUE guarantee is intact. The leak is header-name disclosure (a weak fingerprint of the site's auth scheme in the recipe/descriptor). Given D-07's stated intent ("remove the headers entirely where appropriate ... so even an unrecognized auth header leaks nothing"), the denylist should be tightened.

**Fix:** Broaden the pattern to cover the bare csrf/xsrf families and the common auth carriers:

```js
var AUTH_CARRIER_DENYLIST =
  /^(authorization|proxy-authorization|authentication|cookie|set-cookie|x-csrf.*|x-xsrf.*|.*-?csrf-?.*|x-api-key|x-auth.*|x-access-token|.*bearer.*)$/i;
```

(Tune to taste, but at minimum add `proxy-authorization`, `authentication`, bare `x-csrf`/`x-xsrf`, and `x-auth*`.) Note this is name-hygiene; the value-exclusion property is already sound.

---

## Low

### LO-01: LRU-evicted learned slug lingers in the search index (store/index divergence)

**File:** `extension/utils/learned-recipe-store.js:409,421` (eviction) vs `extension/utils/capability-search.js` (no eviction hook)
**Severity:** Low
**Status:** RESOLVED (commit ef9bade3). Added removeLearnedRecipe(slug) on capability-search.js (the inverse of addLearnedRecipe: discard from the ONE _ms, drop the slug->recipe map entry, re-persist the bumped snapshot). learned-recipe-store.promote now calls it on the evicted slug via a typeof-guarded _search() accessor (best-effort fire-and-forget). Verified the integrated promote->eviction path drops the LRU slug from both getLearnedSync and the search index, and the removal survives an SW restart.

`learned-recipe-store.promote` LRU-evicts the oldest slug from the persisted envelope AND the sync mirror, but the discovery loop fed the slug into the capability search index via a SEPARATE `search.addLearnedRecipe` call, and there is no corresponding `removeLearnedRecipe` to drop an evicted slug from the index. After eviction, `search()` can still return the evicted slug; invoking it resolves `_getLearned -> null` (store evicted it) -> `resolve()` falls through to REGISTRY -> `RECIPE_NOT_FOUND`. Not exploitable (no execution, origin scope unaffected) but produces a dead search hit.

**Fix:** Either expose `removeLearnedRecipe(slug)` on `capability-search.js` and call it from `promote` when `_evictOldestIfOverCap` returns an evicted slug, or accept the staleness and document it (the next index rebuild after the HI-01 fix would clear it).

### LO-02: No explicit null-origin rejection at the capture gate (relies on layered downstream guards)

**File:** `extension/utils/network-capture.js:236-263` (`_runGate`)
**Severity:** Low
**Status:** RESOLVED (commit f33a5bf8). Added an explicit guard at the top of _runGate: a non-string or non-http(s) origin returns RECIPE_CONSENT_REQUIRED before any consent read or attach, making the fail-closed posture explicit rather than emergent (closes the GLOBAL defaultMode:'auto' + null-origin gap). Verified with a permissive AUTO global that all bad-origin variants are rejected and valid https origins still pass.

When `origin` is `null` (the dispatcher's active-tab lookup failed), the gate leans on `getConsentForOrigin(envelope, null)` returning the envelope `defaultMode`. With the shipped default (`DEFAULT_MODE='off'`) this fails closed correctly. But if a user sets a GLOBAL `defaultMode:'auto'`, a null origin passes the consent check and `classify(null).sensitive === false`, so the gate proceeds to attach with `origin === null` (and possibly `tabId === null`). Capture is still safe (attach to a null tab fails -> `RECIPE_CAPTURE_ATTACH_FAILED`; and the same-origin filter `reqOrigin !== null` drops every request), so nothing is captured -- but the gate proceeds further than it should on un-resolvable input.

**Fix:** Add an explicit guard at the top of `_runGate` (or `startSession`): if `typeof origin !== 'string' || !/^https?:\/\//.test(origin)`, return `{ ok:false, reason: REASON_REQUIRED }` before any consent read or attach. Cheap, makes the fail-closed posture explicit rather than emergent.

---

## Resolution (autonomous --fix run)

All 6 findings fixed and committed atomically. 0 skipped.

| Finding | Severity | Commit | Summary |
|---------|----------|--------|---------|
| HI-01 | High | ff7c6f13 | Base-prefix-tolerant snapshot restore -- learned slugs survive an SW restart in the search index (real buildOrRestore() now exercised by the regression). |
| ME-01 | Medium | 4e83806b | _onCdpEvent registered ONCE (boot owner); endSession no longer tears it down. |
| ME-02 | Medium | 287c21ef | Discovery gate resolves the origin from the actual target tab (un-spoofable); a mismatched payload.origin is rejected before attach. |
| ME-03 | Medium | 13f12eb6 | Auth-carrier denylist broadened (proxy-authorization, authentication, bare x-csrf/x-xsrf, x-auth*, x-access-token). |
| LO-01 | Low | ef9bade3 | removeLearnedRecipe() drops an LRU-evicted slug from the search index (store/index parity). |
| LO-02 | Low | f33a5bf8 | Explicit null/non-http origin rejection at the capture gate (fail closed). |

**Verified-sound properties preserved:** structural redaction (no body/header-value/query survives), HI-01 loader-vouched 'local' provenance, hostile-synthesis containment (same-origin + validate + promote-after-replay), per-origin isolation. **Invariants intact:** INV-01 frozen registry hash + mcp:capabilities-discover out of TOOL_REGISTRY (capability-mcp-surface GREEN), INV-02 one engine, INV-04 iterator untouched, origin-pin, recipe-path modules eval-free + allowlisted, NO manifest change.

**Phase-31 gate: GREEN** -- all 15 targeted suites (network-capture, network-capture-consent, network-capture-redaction, recipe-synthesizer, learned-promote-after-replay, learned-recipe-store, learned-search-add, learned-t2-outranking, learned-local-provenance-exempt, capability-router, capability-search-eval, capability-mcp-surface, tool-definitions-parity, capability-autopilot-parity, agent-loop-iterator-guard) + scripts/verify-recipe-path-guard.mjs + `node --check extension/background.js`.

_Resolved: 2026-06-22 (gsd-code-fixer, autonomous --fix)_

---

_Reviewed: 2026-06-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
