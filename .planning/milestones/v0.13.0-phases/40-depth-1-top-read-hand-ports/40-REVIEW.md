---
phase: 40-depth-1-top-read-hand-ports
reviewed: 2026-06-26T00:00:00Z
depth: deep
files_reviewed: 11
files_reviewed_list:
  - catalog/handlers/gitlab.js
  - extension/catalog/handlers/gitlab.js
  - catalog/handlers/slack.js
  - catalog/handlers/notion.js
  - extension/utils/capability-catalog.js
  - extension/background.js
  - scripts/verify-recipe-path-guard.mjs
  - tests/head-handler-upgrade.test.js
  - tests/head-handler-cap.test.js
  - tests/capability-head-handlers.test.js
  - tests/lattice-provider-bridge-smoke.test.js
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: resolved
resolved_at: 2026-06-26
resolution:
  WR-01: { status: fixed, commit: 067fa05d }
  IN-01: { status: fixed, commit: a7665d8e }
  IN-02: { status: fixed, commit: 51d3fc54 }
  IN-03: { status: fixed, commit: 03a3d3e7 }   # cosmetic clarifying comment only
gates_after_fix: all_green   # full npm test EXIT 0; head-handler battery + capability-router + validate:extension all PASS
---

# Phase 40: Code Review Report

**Reviewed:** 2026-06-26
**Depth:** deep (cross-file: handler -> catalog.resolve -> router._runHandlerTier -> executeBoundSpec; vendored-source origin verification; full gate run)
**Files Reviewed:** 11
**Status:** issues_found (1 MEDIUM, 3 LOW; zero security-weakening defects)

## Summary

Phase 40 hand-ports 10 READ slugs to the T1a API fast path: a NEW `gitlab.js` module (5
GET reads) plus EXTENDs to `slack.js` (3 reads) and `notion.js` (2 reads). I reviewed the
security keystone (first-party same-origin only), the correctness keystone (exact-slug
dom->T1a upgrade), the 5 executor deviations, and ran every gate read-only.

**The implementation is sound. No CRITICAL or HIGH findings.** Every security claim the
phase rests on holds under scrutiny:

- **Same-origin keystone CONFIRMED.** gitlab.js targets `https://gitlab.com` with `/api/v4`
  as a PATH (`GITLAB_API_BASE = GITLAB_ORIGIN + '/api/v4'`), never a subdomain. The vendored
  ground truth (`vendor/opentabs-snapshot/plugins/gitlab/src/gitlab-api.ts:13`) confirms
  `getApiBase()` returns `https://gitlab.com/api/v4`. Every spec sets `origin: GITLAB_ORIGIN`
  and `authStrategy:'same-origin-cookie'`. Deviation 2 (removing `api.gitlab.com` from
  comments) was cosmetic: the only `api.gitlab`/`client-api`/`executeScript` tokens left in
  the file are in COMMENTS explaining why a separate api-host is FORBIDDEN. No
  `chrome.scripting`/`chrome.tabs`, exactly one `ctx.executeBoundSpec` call per slug (5).
- **Deviation 3 (recipe-path-guard allowlist add) is NOT a bypass.** The allowlist *subjects*
  a file to the Check-1 forbidden-pattern grep and the Check-5 fail-closed disk-drift check;
  it does not exempt it. gitlab.js gets the IDENTICAL treatment github/slack/notion already
  have. The guard PASSES with gitlab.js scanned ("4 bundled-head handlers all on the
  allowlist"), and gitlab.js contains no eval/new Function/import.
- **Deviation 4 (notion typedRecipeError + guardRpcShape) is correct.** The added guard
  rejects a logged-out/wrong-shape body (null/primitive `data`) -> dual-field
  `RECIPE_DOM_FALLBACK_PENDING`; it leaves the existing `notion.getSpaces`/`notion.loadPage`
  heads untouched (they do not call it) and reuses the same typed-error shape.
- **Slug-exactness CONFIRMED.** All 10 slugs byte-match an existing
  `catalog/descriptors/opentabs__<app>__<op>.json` `slug` (dot-form), all `backing:'dom'`
  `sideEffectClass:'read'`. The upgrade harness proves resolve() returns T1a (not T3) with a
  byte-exact descriptor.slug, plus a wrong-slug negative control and a BEFORE/AFTER flip.
- **No token logging.** No handler contains any `console.*` line at all. Slack's scraped xoxc
  flows only through `buildSlackBody` into the request BODY (asserted body-only, never a
  header).
- **READ-only CONFIRMED.** All 10 new slugs are `sideEffectClass:'read'`; gitlab is GET-only;
  the 3 slack reads use `conversations.list`/`.members`/`.info` (read RPCs). `verify-catalog-
  crosscheck` independently confirms no under-stated mutating op and no API-invocable payment
  op.
- **INV-01/INV-02 + cap.** No MCP-tool/registry-hash file touched (frozen hash unmoved). Both
  front doors route through `router.invoke` -> `_runHandlerTier`, which validates params with
  the closed schema BEFORE `handle()` and returns the handler's typed `RECIPE_ORIGIN_MISMATCH`
  verbatim (never healed). `HEAD_HANDLER_MODULES=4 <= CAP=30`.

The one substantive finding is a MEDIUM expectedShape-guard gap on the 3 Slack reads
(inherited from the pre-existing `slack.conversations.list`, not a Phase-40 regression, but
the new slugs share it). The rest are LOW test-coverage / minor-consistency notes.

### Gate results (all GREEN, run read-only)

| Gate | Result |
|------|--------|
| `node tests/head-handler-upgrade.test.js` | PASS (48 passed, 0 failed) |
| `node tests/capability-head-handlers.test.js` | PASS (116 passed, 0 failed) |
| `node tests/head-handler-cap.test.js` | PASS (5 passed, 0 failed; len=4 <= CAP=30; globals locked) |
| `node tests/capability-router.test.js` | PASS (46 passed, 0 failed) |
| `node scripts/verify-recipe-path-guard.mjs` | PASS (21 files clean; 4 handlers on allowlist & scanned) |
| `npm run validate:extension` | PASS (286 JS parsed; guard/classification/crosscheck/no-dup-stem/no-orphan all PASS) |

Source/build parity verified: `catalog/handlers/{gitlab,slack,notion}.js` are byte-identical
to their `extension/catalog/handlers/` copies (no inline tampering).

## Warnings

### WR-01: The 3 Slack reads have no expectedShape guard -> a logged-out/auth-failed Slack 200 body can masquerade as a successful T1a read

**Severity:** MEDIUM
**File:** `catalog/handlers/slack.js:230-275` (`slack.list_channels`, `slack.list_members`, `slack.get_channel_info`); contrast `catalog/handlers/gitlab.js:188-209` (`guardShape`) and `catalog/handlers/notion.js:111-125` (`guardRpcShape`)

**Issue:** The 3 new Slack reads return `callSlackMethod(...)` verbatim. `callSlackMethod`
fails closed only when the xoxc scrape returns no token (-> `RECIPE_DOM_FALLBACK_PENDING`).
But if a token IS scraped (even a stale/wrong one) and the same-origin POST returns an HTTP
200 carrying Slack's auth-failure envelope `{ "ok": false, "error": "not_authed" }` (or
`invalid_auth`), `executeBoundSpec` sets `success: true` (capability-fetch.js:385-388 keys
`success` off "the fetch completed and returned a body", NOT off the Slack `ok` field or a
4xx). `_runHandlerTier` then stamps `tier:'T1a'` and returns it as a successful read
(capability-router.js:687-690). The head-path rot classifier only inspects status/redirect/
fetch-failed rows, never a 200-with-`ok:false` body (capability-router.js:660-665, by
design). This is precisely the CONTEXT "200-with-logged-out-body" Top Risk, left open for the
Slack reads while gitlab and notion both close it.

This is NOT a credential/cross-origin leak (the call stays same-origin on app.slack.com and
the user's own session), and the same gap already exists on the pre-Phase-40
`slack.conversations.list`, so it is not a regression. But it weakens the phase's stated
expectedShape guarantee for 3 of the 10 ported reads: a logged-out or auth-failed Slack
response is reported as success on the fast path instead of falling back to DOM.

**Fix:** Add a Slack-shaped guard mirroring `guardShape`/`guardRpcShape` and apply it to the
3 reads (and ideally `slack.conversations.list`):
```javascript
// reject Slack's { ok:false } auth-failure / error envelope (a logged-out or
// wrong-token 200) -> dual-field RECIPE_DOM_FALLBACK_PENDING so DOM serves.
function guardSlackShape(result, slug) {
  if (!result || result.success !== true) { return result; }
  var d = result.data;
  if (d && typeof d === 'object' && d.ok === false) {
    return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
      slug: slug, reason: 'slack-logged-out-or-rot', fellBackToDom: true
    });
  }
  return result;
}
// then in each read: return guardSlackShape(await callSlackMethod(...), 'slack.list_channels');
```

**RESOLVED (commit `067fa05d`):** Added `guardSlackShape(result, slug)` to
`catalog/handlers/slack.js` mirroring gitlab `guardShape` / notion `guardRpcShape`:
when `result.success === true` but `result.data.ok === false` (Slack's documented
auth-failure envelope -- `not_authed` / `invalid_auth`), it returns the dual-field
`{ success:false, code/errorCode/error:'RECIPE_DOM_FALLBACK_PENDING', reason:
'slack-logged-out-or-rot', fellBackToDom:true }` so the breadth DOM path serves
instead of the 200-with-logged-out-body masquerading as a T1a success. A pin/fetch
failure (`success !== true`) is passed through unchanged (never masked). Applied to
all 3 new reads (`slack.list_channels`, `slack.list_members`, `slack.get_channel_info`)
AND to the pre-existing `slack.conversations.list` for consistency. The write slug
`slack.chat.postMessage` is unchanged (still returns `callSlackMethod` verbatim --
the guard is applied only at the READ return sites). xoxc stays body-only and is never
inspected or logged; no slug/origin/behavior changed. `extension/catalog/handlers/
slack.js` rebuilt byte-identical via `package-extension.mjs`.

## Info

### IN-01: No negative-path (logged-out / wrong-shape) test for the 10 Phase-40 reads

**Severity:** LOW
**File:** `tests/capability-head-handlers.test.js:373-495`

**Issue:** The Phase-40 per-app sections assert only the POSITIVE path: the recording stub
returns a logged-in body (array / `{id,iid}` / `{ok:true}`) and every test asserts
`success === true`. The gitlab `guardShape` and notion `guardRpcShape` are therefore never
exercised in their FAIL direction. The github.create and slack missing-token fallbacks DO
have negative assertions (`:196-204`, `:279-287`), but the Phase-40 shape guards have no
test feeding a logged-out HTML/null/`{ok:false}` body and asserting the dual-field
`RECIPE_DOM_FALLBACK_PENDING`. The guards exist and are wired, but a future edit that breaks
the wrong-shape branch (e.g. inverting `wantArray`, dropping the `ok` check after WR-01) would
not red any gate.

**Fix:** Add one negative case per guard: invoke `gitlab.list_projects` with a stub returning
`data: { ok:false }` (not an array) and assert `success===false` + code
`RECIPE_DOM_FALLBACK_PENDING` + `fellBackToDom===true`; likewise feed `notion.search` a
`data: null` body. (After WR-01, add the symmetric Slack case.)

**RESOLVED (commit `a7665d8e`):** Extended `makeCtx` in
`tests/capability-head-handlers.test.js` with an `opts.readData` override that drives
the actual read/RPC response body (the probe is untouched, so the Slack handler still
proceeds to the guarded POST; `readData:null` is honored via a `hasOwnProperty` presence
check). Added per-app NEGATIVE cases asserting the dual-field `RECIPE_DOM_FALLBACK_PENDING`
(NOT success):
- `gitlab.list_projects` fed `{ ok:false }` (non-array) -> rejected.
- `gitlab.get_project` fed `{ id:7, message:'404 Project Not Found' }` (an id-bearing
  GitLab error envelope) -> rejected (this is the IN-02 coverage).
- `slack.list_channels`: probe succeeds, POST returns `{ ok:false, error:'not_authed' }`;
  asserts the POST STILL issues (the guard runs on its result) AND the handler returns
  `RECIPE_DOM_FALLBACK_PENDING` (the WR-01 guard).
- `notion.search` fed `null` RPC body -> rejected.
Proven non-vacuous by a mutation test: neutering the `guardSlackShape` condition reds the
Slack negative case (EXIT 1), and `git checkout --` restored the committed guard. Suite
went 116 -> 121 passed, 0 failed.

### IN-02: gitlab get_* shape guard accepts any object carrying `id` OR `iid`, including an error envelope that happens to contain those keys

**Severity:** LOW
**File:** `catalog/handlers/gitlab.js:196-200` (`guardShape`, `wantArray=false` branch)

**Issue:** For `get_project`/`get_issue`, the guard accepts `data` as valid when it is a
non-array object with an own `id` OR `iid` property. GitLab's logged-out/redirect bodies
(sign-in HTML, `{ message: "401 Unauthorized" }`) lack both keys, so the guard correctly
rejects the realistic logged-out cases. The residual gap is narrow: a 200 error body that
coincidentally carries an `id`/`iid` field would pass. This is acceptable given the live-UAT
debt the phase already documents, but the heuristic is looser than the comment's "id-bearing
OBJECT" intent implies (it does not, e.g., also require the absence of a top-level GitLab
error marker).

**Fix:** Optional hardening — also reject when `data` carries a GitLab error shape, e.g.
`if (data && (typeof data.message === 'string' || typeof data.error === 'string')) return fallback;`
before the positive `id`/`iid` accept. Low priority; the realistic logged-out bodies are
already rejected.

**RESOLVED (commit `51d3fc54`):** Added `looksLikeGitlabError(data)` to
`catalog/handlers/gitlab.js` — true when `data` is an object carrying a string `message`
(e.g. `{ message:"401 Unauthorized" }` / `{ message:"404 Project Not Found" }`) or a
string `error` (e.g. `{ error:"invalid_token" }`), the two documented GitLab error
markers. The `get_*` branch (`wantArray=false`) now requires `!looksLikeGitlabError(data)`
BEFORE the `id`/`iid` accept, so a 200 error envelope that coincidentally carries an
`id`/`iid` field is rejected to `RECIPE_DOM_FALLBACK_PENDING`. Conservative: keyed only on
the two error markers, so a legitimate project/issue resource body (neither a top-level
`message` nor `error` string) is never excluded; the positive `{id,iid}` path still passes.
Covered by the IN-01 `gitlab.get_project` negative case. `extension/catalog/handlers/
gitlab.js` rebuilt byte-identical.

### IN-03: Descriptor `service` host differs from the handler-registered `service`/origin for slack and notion (cosmetic, non-functional)

**Severity:** LOW
**File:** `catalog/descriptors/opentabs__slack__*.json` (`"service":"slack.com"`) vs `catalog/handlers/slack.js:305` / `capability-catalog.js:243` (`service:'app.slack.com'`, origin `https://app.slack.com`); same for notion (`"service":"notion.so"` vs `www.notion.so`)

**Issue:** The breadth descriptor records `service:"slack.com"` / `"notion.so"`, while the
T1a registration records `app.slack.com` / `www.notion.so`. resolve() upgrades on the SLUG
(byte-exact, verified), not the service string, so this does not affect the dom->T1a upgrade
or the origin-pin (the pin uses the spec's `origin`, which is correct). It is purely a
metadata inconsistency between the two records for the same slug. Worth a note only so a
future reader does not mistake the registered origin (`app.slack.com`) for a mismatch against
the descriptor's `service` (`slack.com`) — they are intentionally different fields, and the
load-bearing one (the spec origin) is right.

**Fix:** None required for correctness. If desired for hygiene, align the descriptor `service`
host with the first-party origin host the head registers, or add a one-line comment in the
handler noting the descriptor uses the bare registrable domain while the head pins the app
subdomain.

**RESOLVED (commit `03a3d3e7`):** Took the comment-only option (the reviewer confirmed the
service-vs-origin distinction is correct -- resolve() upgrades on the byte-exact slug and
the pin uses the spec origin, so this is cosmetic, not a mismatch). Added a one-line
clarifying comment at the registration site in both `catalog/handlers/slack.js` and
`catalog/handlers/notion.js` noting the head registers `descriptor.service` as the app
subdomain (`app.slack.com` / `www.notion.so`, the pinned origin) while the breadth
opentabs descriptor records the bare registrable domain (`slack.com` / `notion.so`), and
that these are intentionally different fields. NO slug/service value/origin/behavior change
-- the descriptor `service` strings are left byte-exact as the reviewer directed.
`extension/` copies rebuilt byte-identical.

---

_Reviewed: 2026-06-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_

---

## Fix Pass (2026-06-26)

All 4 findings resolved by the gsd-code-fixer (4 atomic commits on `automation`):

| Finding | Severity | Status | Commit |
|---------|----------|--------|--------|
| WR-01 | MEDIUM | fixed | `067fa05d` |
| IN-01 | LOW | fixed | `a7665d8e` |
| IN-02 | LOW | fixed | `51d3fc54` |
| IN-03 | LOW | fixed (cosmetic comment) | `03a3d3e7` |

Phase-40 invariants held: first-party origin only (no api-subdomain), executeBoundSpec-only,
READ-only (the slack write slug untouched), byte-exact slugs preserved (no rename), no
scraped token on a log line, router tier-dispatch / executeBoundSpec / HEAL core untouched,
`HEAD_HANDLER_MODULES` count + cap unchanged. After fixes the extension was rebuilt
(`package-extension.mjs`) so every `extension/catalog/handlers/*` copy is byte-identical.

**Gate battery after fixes -- all GREEN:**

| Gate | Result |
|------|--------|
| `node tests/head-handler-upgrade.test.js` | PASS (48 passed, 0 failed) |
| `node tests/capability-head-handlers.test.js` | PASS (121 passed, 0 failed; +5 new negative cases) |
| `node tests/head-handler-cap.test.js` | PASS (5 passed, 0 failed) |
| `node tests/capability-router.test.js` | PASS (46 passed, 0 failed) |
| `node scripts/verify-recipe-path-guard.mjs` | PASS (4 bundled-head handlers on allowlist & scanned) |
| `npm run validate:extension` | PASS (286 JS parsed; guard/classification/crosscheck/no-dup-stem/no-orphan all PASS) |
| **`npm test`** | **EXIT 0** (full suite, 136 suite summaries, 0 failures) |

The out-of-scope `showcase/` date-stamp churn (`llms-full.txt`, `sitemap.xml`) was left
unstaged as directed.

_Fixed: 2026-06-26_
_Fixer: Claude (gsd-code-fixer)_
