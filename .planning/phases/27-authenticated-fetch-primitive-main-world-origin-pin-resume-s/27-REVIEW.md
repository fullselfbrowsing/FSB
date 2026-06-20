---
phase: 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s
reviewed: 2026-06-20T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - extension/utils/capability-fetch.js
  - extension/utils/capability-interpreter.js
  - mcp/src/errors.ts
  - scripts/verify-recipe-path-guard.mjs
  - catalog/recipes/github-notifications.json
  - catalog/recipes/_fixtures/valid-github-notifications.json
  - extension/background.js
  - package.json
  - tests/capability-fetch.test.js
  - tests/capability-interpreter.test.js
  - tests/lattice-provider-bridge-smoke.test.js
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 27: Code Review Report

**Reviewed:** 2026-06-20
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 27 ships the credential-carrying MAIN-world fetch primitive (`capability-fetch.js`), the query-fold + origin-pin re-assertion in `capability-interpreter.js`, the additive `RECOVERY_AMBIGUOUS` error code, and the `existsSync` fix to the recipe-path CI guard. I reviewed the full threat surface enumerated in the brief and traced every security-sensitive path.

**The core security claims hold up under scrutiny:**

- **Serialization safety (D-03 / Wall-1):** `capabilityFetchInPage` references only Web APIs (`Object`, `document`, `fetch`, `JSON`) plus its `spec` parameter. Every other identifier is a `var`-declared inline local. No closure variable, no module global, no sibling helper, no `_getChrome`/`_getTaskStore`/jmespath reference. The `toString()` static guard in the test suite confirms this. **Genuinely self-contained.**
- **No auth-material leak:** The CSRF token flows only into `headers[src.header]` and is sent in the request — never returned, persisted, or logged. The return object (capability-fetch.js:208-215) carries only `{ ok, status, finalUrl, redirected, json, text }`. Both capability modules contain **zero** `console.*` calls. Cookies are never read by JS (only attached via `credentials:'include'`).
- **Origin-pin ordering:** In the interpreter, the query-fold (step 5b) runs **before** the origin-pin (step 5c), so the pin guards the true effective target; an `encodeURIComponent`-escaped injected query value cannot survive to re-target the origin (verified: value cannot contain raw `/ ? # : @ \`). In `executeBoundSpec`, the active-tab pin (step 1) returns `RECIPE_ORIGIN_MISMATCH` and fires NO `executeScript` before any side effect. The cross-origin and protocol-relative (`/\evil.com`, `/\\evil.com`) escapes are both rejected and test-covered.
- **Mutation-ambiguity (D-11):** `classifyOnWake` never returns a re-issuable verdict for POST/PUT/PATCH/DELETE; the fall-through default is the fail-safe `RECOVERY_AMBIGUOUS`. Confirmed by reading every branch and by the test matrix.
- **Wall-1 dynamic-code:** Zero `eval` / `new Function` / `import(` / `innerHTML` in either capability module (grep-confirmed, including comments/strings).
- **`errors.ts`:** The `RECOVERY_AMBIGUOUS` addition is strictly additive (4 lines into a `Set`); no existing tool error semantics changed. Build artifact matches.
- **`verify-recipe-path-guard.mjs`:** The `existsSync` skip applies ONLY to absent paths; a present file still flows to the `FORBIDDEN` regex loop (Check 1 intact), and Check 4 disk-drift is untouched.
- **Recipe JSON:** Both files are byte-identical pure data (no executable fields) and validate against the closed schema.

The 26-assertion CI suite passes. No BLOCKER-class defects were found. The findings below are robustness and defense-in-depth gaps, none of which has a live blast radius today because `executeBoundSpec`/`classifyOnWake` are **not yet wired to any caller** (the router is deferred to Phase 28/29) — they are exercised only by tests.

## Warnings

### WR-01: `capabilityFetchInPage` has no origin assertion of its own; the credential-carrying `credentials:'include'` fetch trusts an unvalidated `spec.url`

**File:** `extension/utils/capability-fetch.js:183` (and the export at `:433`)
**Issue:** The in-page primitive performs `fetch((spec && spec.url) || '', { credentials:'include', ... })` against whatever `spec.url` contains, with no check that the target resolves to `spec.origin` or to the page's own origin. The entire authentication-safety story rests on `executeBoundSpec` having pinned the active tab first. But `capabilityFetchInPage` is a **public export** (`global.FsbCapabilityFetch.capabilityFetchInPage` + `module.exports`) and is already invoked directly with a fully-qualified absolute URL in the test suite (capability-fetch.test.js:279, `url: 'https://github.com/_graphql'`). A future caller that injects the func directly (or that calls it with an absolute `spec.url`) would issue a credentialed request to an arbitrary URL. The browser's same-origin/CORS model limits cross-origin cookie attachment, so this is defense-in-depth rather than an open hole — but for a function whose sole purpose is carrying first-party HttpOnly cookies, the absence of any in-primitive origin guard is a meaningful gap. Today the blast radius is nil (only `executeBoundSpec` is intended to call it, and it is not wired anywhere yet), which is why this is a Warning, not a Blocker.
**Fix:** Add a cheap same-origin guard at the top of the async IIFE before the fetch, e.g.:
```javascript
// Defense-in-depth: refuse to issue a credentialed fetch off the page origin.
try {
  var target = new URL((spec && spec.url) || '', document.baseURI);
  if (spec && spec.origin && target.origin !== spec.origin) {
    return { error: 'origin-pin (in-page): ' + target.origin + ' !== ' + spec.origin };
  }
} catch (e) {
  return { error: 'origin-pin (in-page): unresolvable url' };
}
```
This costs nothing on the happy path (relative `spec.url` resolves to the page origin, which `executeBoundSpec` already verified equals `spec.origin`) and closes the direct-call path.

### WR-02: Resume-sidecar `taskId` uses millisecond `Date.now()` only; two same-origin fetches in the same millisecond collide and one deletes the other's in-flight snapshot

**File:** `extension/utils/capability-fetch.js:304`
**Issue:** `var taskId = 'cap_fetch_' + (spec && spec.origin ? spec.origin : 'unknown') + '_' + Date.now();`. The task-store is keyed by `taskId` (mcp-task-store.js writes `records[taskId] = snapshot`). Two concurrent `executeBoundSpec` calls for the **same origin** that begin within the same millisecond produce an identical `taskId`. The terminal `_deleteSnapshotBestEffort(store, taskId)` of the first to finish then deletes the still-in-flight snapshot of the second, corrupting the FETCH-04 mid-mutation reconciliation contract (a real in-flight POST would become invisible to `listInFlightSnapshots()` / `classifyOnWake`, defeating the never-blind-retry guarantee on SW eviction). The comment at line 303 asserts "Task id is unique in the in-flight window" — that assertion is false under same-millisecond concurrency. Blast radius is currently zero (no concurrent caller wired yet), hence Warning.
**Fix:** Add a non-time-based uniqueness component:
```javascript
var rand = (globalThis.crypto && globalThis.crypto.randomUUID)
  ? globalThis.crypto.randomUUID()
  : (Date.now() + '_' + Math.random().toString(36).slice(2));
var taskId = 'cap_fetch_' + (spec && spec.origin ? spec.origin : 'unknown') + '_' + rand;
```
(`crypto.randomUUID` is already the requestId idiom used by `extension/ai/lattice-provider-bridge.js`.)

### WR-03: Both origin-pins compare `URL.origin` (normalized/lowercased) against the verbatim recipe `origin` string; a mixed-case `recipe.origin` fails closed and silently rejects a valid same-origin recipe

**File:** `extension/utils/capability-interpreter.js:352` and `extension/utils/capability-fetch.js:291`
**Issue:** The recipe-schema `origin` pattern `^https?://[^/?#\s]+$` (capability-recipe-schema.js:95) does not constrain case, so `https://GitHub.com` is a schema-valid origin. The interpreter pin computes `new URL(effectiveUrl, recipe.origin).origin` — which the WHATWG URL parser **lowercases** to `https://github.com` — and compares it with `!==` against the raw `recipe.origin` (`https://GitHub.com`). They differ, so a perfectly valid same-origin recipe is rejected with `RECIPE_ORIGIN_MISMATCH`. The active-tab pin in `executeBoundSpec` has the symmetric problem: `tabOrigin` is the normalized `new URL(tab.url).origin` compared against the verbatim `spec.origin`. This is a fail-closed correctness bug (rejects valid input), not a security hole, so it is a Warning. It will not surface for the lowercase `github.com` recipe shipped this phase, but it is a latent trap for any future catalog author who capitalizes a host.
**Fix:** Normalize both sides before comparison, e.g. compute `var pinnedOrigin = new URL(recipe.origin).origin;` once and compare `resolvedTarget.origin !== pinnedOrigin`; in `executeBoundSpec`, compare `tabOrigin !== (spec && spec.origin ? new URL(spec.origin).origin : spec.origin)` (guarded) — or, more cheaply, have the schema lowercase/canonicalize `origin` at validation time so the verbatim string is already canonical.

## Info

### IN-01: `redirect:'manual'` makes the documented "302 -> /login" status/URL unobservable; only the `redirected` boolean survives

**File:** `extension/utils/capability-fetch.js:174-176, 187-189`
**Issue:** The comment states `redirect:'manual'` "keeps a 302 -> /login observable as the logged-out signal (D-14)". In fact, with `redirect:'manual'` a same-origin redirect yields an opaque-redirect response: `resp.status === 0`, `resp.url === ''`, and `resp.type === 'opaqueredirect'`. So the returned `status` is `0` (not `302`) and `finalUrl` is empty (not `/login`). The logged-out condition is still detectable via `redirected: true` (line 189 sets it from the `opaqueredirect` check), so the D-14 contract is functionally met — but the comment over-promises what a caller can see. A consumer that keys logged-out detection on `status === 302` or on `finalUrl` containing `/login` would be wrong.
**Fix:** Correct the comment to state that `redirect:'manual'` surfaces the logged-out signal via `redirected === true` (status will be `0`/opaqueredirect, not `302`), so downstream callers branch on `redirected`, not on `status`/`finalUrl`.

### IN-02: The `existsSync` skip now also silently swallows a typo'd test-only `EXTRA` allowlist path

**File:** `scripts/verify-recipe-path-guard.mjs:138`
**Issue:** `if (!existsSync(abs)) continue;` runs over the whole `SCAN_LIST`, which includes `EXTRA` paths from `FSB_RECIPE_GUARD_EXTRA_ALLOWLIST`. Previously, an absent `EXTRA` path caused `safeRead` to push an ENOENT failure and fail the build — surfacing a test that pointed the guard at a wrong temp path. Now an absent `EXTRA` path is skipped silently. The shipped `recipe-path-guard.test.js` plants a real file (present), so it is unaffected; this is only a minor erosion of the test-seam's own self-diagnostics. The skip's primary purpose (a registered-but-not-yet-created allowlist module like `capability-fetch.js`) is correctly served, and the on-disk drift Check 4 is fully preserved, so the security posture of the guard is intact.
**Fix (optional):** Scope the `existsSync` skip to repo-relative allowlist entries only, leaving absolute `EXTRA` temp paths to `safeRead`'s ENOENT failure: `if (!rel.startsWith('/') && !existsSync(abs)) continue;`.

### IN-03: `RECOVERY_AMBIGUOUS` falls into `buildLayeredDetail`'s default arm and reports the `Page navigation` layer label

**File:** `mcp/src/errors.ts:71` (consumed at `buildLayeredDetail` default, `:386-396`)
**Issue:** `RECOVERY_AMBIGUOUS` is registered in `CODE_ONLY_ERROR_KEYS` so it surfaces verbatim (the required contract — confirmed by the test). But it has no `case` in `buildLayeredDetail`, so it lands in the `default` arm, which emits `Detected: Page navigation` / `Why: Tool returned error code: RECOVERY_AMBIGUOUS`. The `Page navigation` layer is semantically unrelated to a mutation-ambiguity-after-eviction condition. The code is surfaced verbatim (contract met), but the human-facing "Detected" label is misleading for the host operator.
**Fix (optional, future):** When the resume sidecar is wired to a tool path (Phase 28/29), add a dedicated `case 'RECOVERY_AMBIGUOUS'` returning a recovery-flavored detail (e.g., `detected: 'Mid-mutation recovery'`, `nextAction: 'The request may or may not have reached the server; confirm state before retrying.'`). Not actionable this phase.

### IN-04: `spec.query` is carried in the bound spec but unused by the fetch path (query already folded into `spec.url`)

**File:** `extension/utils/capability-interpreter.js:312` (set), consumed nowhere in `capability-fetch.js`
**Issue:** After step 5b folds `built.query` into `spec.url`, the separate `spec.query` object remains on the spec but is never read by `capabilityFetchInPage` or `executeBoundSpec` (the URL already contains the query string). This is redundant data carriage, not a bug — the CAP-02 interpreter contract intentionally asserts `spec.query` is present, and a harmless escaped copy in the spec does not affect the request. Noted only for clarity so a future reader does not assume `spec.query` is a second, independently-applied query source (it is not).
**Fix:** None required. If desired, document on the spec shape that `query` is the pre-fold source map retained for inspection/parity and that the effective query lives in `url`.

---

_Reviewed: 2026-06-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
