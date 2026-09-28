---
phase: 40-depth-1-top-read-hand-ports
verified: 2026-06-26
status: passed
score: 3/3 success criteria verified (10/10 ported slugs + all plan must-haves)
overrides_applied: 0
re_verification:
  previous_status: none
  note: initial verification (no prior VERIFICATION.md)
human_verification:
  - test: "Live endpoint-correctness on a real authenticated tab (the exact first-party internal API path returns the expected READ shape, and the expectedShape/extract guard rejects a logged-out body)"
    expected: "For each ported app (gitlab.com /api/v4, app.slack.com /api/<method>, www.notion.so /api/v3): open an authenticated tab, invoke the read via search_capabilities->invoke_capability, confirm a real (non-logged-out) payload; confirm a logged-out tab yields RECIPE_DOM_FALLBACK_PENDING (no false success)"
    why_human: "Requires a logged-in browser session per app (no live auth in the autonomous run). CARRIED-FORWARD, fail-closed, user-gated debt (40-VALIDATION.md Manual-Only; 40-CONTEXT.md endpoint-derivation boundary). NON-BLOCKING: the handlers ship fail-closed (wrong origin -> RECIPE_ORIGIN_MISMATCH; wrong path/logged-out 200 -> HEAL -> RECIPE_DOM_FALLBACK_PENDING), so security holds regardless. The phase deliverable is the MECHANISM + the security properties, both fully automated + green. Inherited by Phase 41."
deferred:
  - truth: "linear READ heads ship as T1a (named as an example app in SC1)"
    addressed_in: "Phase 41"
    evidence: "Phase 41 SC3: 'A per-app CORS / first-party-origin verification gate precedes any separate-API-origin (Pattern-D) port: linear is documented-safe and may port'. linear's GraphQL is client-api.linear.app (separate-origin CORS, verified vendor/opentabs-snapshot/plugins/linear/src/linear-api.ts:18) -> Wall-2 origin-pin correctly rejects -> Phase-41 CORS-gate material. gitlab substituted as the same-origin NEW module (gitlab.com/api/v4 is a PATH, verified gitlab-api.ts:13). SC1's '~8-12' is satisfied by 10 verified heads."
  - truth: "WRITE hand-ports + DENY-04 mutating re-enforcement"
    addressed_in: "Phase 41"
    evidence: "Phase 41 goal: 'Complete the depth head with the remaining hand-ports including WRITE ops... re-enforcing the DENY-04 mutating opt-in'. Phase 40 is READ-only by scope (40-CONTEXT.md domain); the slack.chat.postMessage write slug is left untouched (still returns callSlackMethod verbatim, no read-guard)."
---

# Phase 40: Depth 1 — Top READ Hand-Ports (DEPTH-01) Verification Report

**Phase Goal:** Upgrade the hot subset already discoverable from the breadth corpus by hand-porting the highest-value READ ops as first-class T1a handlers EXACTLY like `github.js` — own first-party origin, `executeBoundSpec`-only, scraped tokens never logged — so the most-used reads run on the API fast path (T1a) instead of DOM fallback (T3). Owns DEPTH-01 (the hand-port contract + READ heads).
**Verified:** 2026-06-26
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Success Criteria (Observable Truths)

| #   | Success Criterion | Status | Evidence |
| --- | ----------------- | ------ | -------- |
| SC1 | ~8-12 READ heads ship as T1a via the `github.js` contract; each UPGRADES its existing opentabs slug dom→T1a; new modules in `HEAD_HANDLER_MODULES` + `background.js importScripts` | ✓ VERIFIED | 10 slugs ported (gitlab x5, slack x3, notion x2), all `tier:'T1a'`/`sideEffectClass:'read'`. All 10 byte-match an existing `opentabs__<app>__<op>.json` slug (`backing:'dom'`, `read`). `head-handler-upgrade.test.js` (48/0) proves each `resolve(slug, origin)` returns T1a (was T3) with byte-exact `descriptor.slug` + BEFORE/AFTER flip + wrong-slug negative control (`gitlab.list_projectz`→null). `HEAD_HANDLER_MODULES`=4 (github/slack/notion/gitlab, capability-catalog.js:241-250). All 4 in `background.js importScripts` (:191-193, :196). |
| SC2 | `executeBoundSpec`-ONLY; first-party origin (no separate api.<app> subdomain); scraped tokens never logged; guards reject logged-out 200s | ✓ VERIFIED | Each handler `spec.origin` = own first-party origin (gitlab→`https://gitlab.com` with `/api/v4` as a PATH, slack→`app.slack.com`, notion→`www.notion.so`). NO `api.<app>` host string, NO `chrome.scripting`/`chrome.tabs` (only doc-comment mentions). Exactly one `ctx.executeBoundSpec` per slug (gitlab: 5 calls / 5 `handle` bodies). Origin-pin rejects mismatch → `RECIPE_ORIGIN_MISMATCH` before executeScript (`capability-fetch.test.js` FETCH-03: recorder EMPTY). ZERO `console.*`/log lines in all 3 handlers — no surface for a token to be logged; slack xoxc is body-only (`buildSlackBody`, "NO xoxc in any header"). All 3 guards (`guardShape`/`guardRpcShape`/`guardSlackShape`) reject a logged-out 200 → `RECIPE_DOM_FALLBACK_PENDING` (`capability-head-handlers.test.js` negative cases, 121/0). |
| SC3 | Both front doors hit the SAME `FsbCapabilityRouter.invoke` (INV-02); router-parity + head-handler tests green; head cap (~15-30) enforced; INV-01 frozen hash unmoved | ✓ VERIFIED | `capability-autopilot-parity.test.js` (17/0): CAT-04 "the router spy was hit by BOTH front doors (one engine, two front doors)" same slug + same args (INV-02). INV-01: `EXPECTED_NON_TRIGGER_REGISTRY_HASH unchanged` — capability tools out-of-registry, no new MCP tool. `capability-router.test.js` (46/0): T1a tier dispatch + origin-pin green. `head-handler-cap.test.js` (5/0): `HEAD_HANDLER_MODULES.length=4 <= CAP=30`, globals locked. |

**Score:** 3/3 success criteria verified · 10/10 ported slugs proven · all 5 plans' must-haves satisfied

### Deferred Items

Items not delivered here but explicitly owned by a later milestone phase (Step 9b).

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | linear READ heads (an EXAMPLE app named in SC1's "…") | Phase 41 | Phase 41 SC3 owns the per-app CORS / Pattern-D gate; linear's GraphQL is `client-api.linear.app` (separate-origin CORS, `linear-api.ts:18`) which the Wall-2 origin-pin correctly rejects. gitlab substituted as the same-origin NEW module — `gitlab.com/api/v4` is a PATH (`gitlab-api.ts:13`). 10 verified heads satisfy "~8-12". |
| 2 | WRITE hand-ports + DENY-04 mutating re-enforcement | Phase 41 | Phase 41 goal: remaining hand-ports incl. WRITE ops + DENY-04 opt-in. Phase 40 is READ-only by scope; `slack.chat.postMessage` write slug left untouched (no read-guard). |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `catalog/handlers/gitlab.js` | NEW module, 5 GET READ T1a heads, same-origin `gitlab.com/api/v4` | ✓ VERIFIED | 322 lines. 5 read slugs (`list_projects`/`get_project`/`list_issues`/`get_issue`/`list_merge_requests`), all T1a/read, `origin: GITLAB_ORIGIN`, GET-only, `guardShape` + `looksLikeGitlabError` (IN-02). Byte-identical to extension copy. |
| `catalog/handlers/slack.js` | EXTEND: +3 READ T1a heads via `callSlackMethod` | ✓ VERIFIED | 351 lines. `slack.list_channels`/`list_members`/`get_channel_info` added; `guardSlackShape` (WR-01) applied to all 3 + `conversations.list`; xoxc body-only. Write slug unguarded (correct). Byte-identical to extension copy. |
| `catalog/handlers/notion.js` | EXTEND: +2 READ T1a heads via `buildRpcSpec` | ✓ VERIFIED | 228 lines. `notion.search`/`get_database` added; `guardRpcShape` applied to both; same-origin `/api/v3` POST. Byte-identical to extension copy. |
| `extension/utils/capability-catalog.js` | `HEAD_HANDLER_MODULES` gains `FsbHandlerGitlab` (4th, ≤30) | ✓ VERIFIED | Array has exactly 4 entries (:241-250); 4th = `FsbHandlerGitlab` (gitlab.com). |
| `extension/background.js` | `importScripts('catalog/handlers/gitlab.js')` after notion | ✓ VERIFIED | :196 (github :191, slack :192, notion :193, gitlab :196). |
| `tests/head-handler-upgrade.test.js` | dom→T1a upgrade-assertion harness (slug-exact keystone) | ✓ VERIFIED | 48/0 PASS; per-slug T1a+byte-exact+handler, wrong-slug negative control, BEFORE/AFTER legs. |
| `tests/head-handler-cap.test.js` | head-cap ≤30 + expected globals = 4 | ✓ VERIFIED | 5/0 PASS; `length=4 CAP=30`, globals github/slack/notion/gitlab. |
| `tests/capability-head-handlers.test.js` | per-app tier/origin/no-api-subdomain/no-chrome/one-executeBoundSpec + negative cases | ✓ VERIFIED | 121/0 PASS (+5 IN-01 negative cases). |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `gitlab.js`/`slack.js`/`notion.js` | `FsbCapabilityCatalog.registerHandler` | self-registration of exact opentabs slugs at load | ✓ WIRED | Each module registers its slugs (gitlab :307, slack :336, notion :213); `seedHeadHandlers` defense-in-depth via `HEAD_HANDLER_MODULES`. |
| handler-registered slugs | `capability-catalog.js resolve()` | REGISTRY-first dom→T1a upgrade | ✓ WIRED | `head-handler-upgrade.test.js` proves `resolve(slug, origin)`→T1a with descriptor attached for all 10. |
| `background.js` | `catalog/handlers/gitlab.js` | importScripts after notion.js | ✓ WIRED | :196. |
| both front doors (MCP + autopilot) | `FsbCapabilityRouter.invoke` | one engine, two front doors (INV-02) | ✓ WIRED | `capability-autopilot-parity` CAT-04: router spy hit by both, same slug + args. |
| `slack.js` reads | `callSlackMethod` | xoxc-probe + body-placement (token never header/log) | ✓ WIRED | All 3 reads call `callSlackMethod`; xoxc only in `buildSlackBody`. |
| `notion.js` reads | `buildRpcSpec` | same-origin /api/v3 RPC | ✓ WIRED | Both reads call `buildRpcSpec`. |

### Data-Flow Trace (Level 4)

The handlers render no UI; the "data" is the API result the head returns to the router. Traced the fail-closed return path: each `handle()` → exactly one `ctx.executeBoundSpec` (the origin-pinned same-origin-cookie fetch) → a shape guard. A logged-out 200 does NOT flow through as success: `guardShape` (array for list_*, id-bearing non-error object for get_*), `guardRpcShape` (non-null object/array), `guardSlackShape` (`data.ok !== false`) each convert a wrong/logged-out body to dual-field `RECIPE_DOM_FALLBACK_PENDING`. A pin/fetch failure (`success !== true`) is passed through verbatim (never masked). Real-data correctness on a live tab is the carried-forward human item below.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Modules export the expected slug-keyed T1a read handlers | `node -e "require gitlab/slack/notion; assert tier/origin/sideEffectClass"` | gitlab: 5 reads, all T1a, all gitlab.com; slack 3 new reads T1a/read; notion 2 new reads T1a/read; slack.chat.postMessage = write (untouched) | ✓ PASS |
| Correctness keystone: dom→T1a byte-exact upgrade + negative control | `node tests/head-handler-upgrade.test.js` | 48 passed, 0 failed | ✓ PASS |
| Per-handler source-scan + negative (logged-out) cases | `node tests/capability-head-handlers.test.js` | 121 passed, 0 failed | ✓ PASS |
| Head cap + module count + globals | `node tests/head-handler-cap.test.js` | 5 passed, 0 failed (length=4, CAP=30) | ✓ PASS |
| Tier dispatch + INV-02 parity + origin-pin | `node tests/capability-router.test.js` | 46 passed, 0 failed | ✓ PASS |
| INV-01 frozen registry hash + both-front-door parity | `node tests/capability-autopilot-parity.test.js` | 17 passed, 0 failed | ✓ PASS |
| Wall-2 origin-pin: mismatch → RECIPE_ORIGIN_MISMATCH before executeScript | `node tests/capability-fetch.test.js` | 26 passed, 0 failed (recorder EMPTY on mismatch) | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| recipe-path forbidden-pattern + disk-drift guard (gitlab.js subjected, not exempted) | `node scripts/verify-recipe-path-guard.mjs` | PASS — 21 files clean; 4 bundled-head handlers all on allowlist & scanned | PASS |
| Extension validation battery (manifest + parse + classification + crosscheck + no-dup-stem + no-orphan) | `npm run validate:extension` | PASS — 286 JS parsed; 2306 descriptors crosschecked; 2306==2306 importer (0 orphans) | PASS |
| Full CI suite | `npm test` | **EXIT 0** — 111 suite summaries "N passed, 0 failed"; zero `failed=[1-9]`; zero `FAIL:` lines | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| DEPTH-01 | 40-01..05 | Depth shortlist READS hand-ported as T1a via `github.js` contract: own first-party origin, executeBoundSpec-only, scraped tokens never logged | ✓ SATISFIED | 10 READ heads shipped (the contract demonstrated across the NEW-module path (gitlab) + the EXTEND-module path (slack/notion)); all SCs verified above. DEPTH-02 (guarded writes + CORS gate) is Phase 41 per REQUIREMENTS.md mapping. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None | — | No TBD/FIXME/XXX in any Phase-40 modified file. No `console.*`/log line in any handler. No `chrome.*` call (only a doc comment). No `api.<app>` host string. No `return null`/empty-stub render path. The `[ASSUMED-ENDPOINT]` notes are documented, fail-closed, carried-forward live-UAT debt (not stubs — the mechanism + guards are real and tested). |

### Code-Review Fix Verification (40-REVIEW.md, 4 findings — all claimed resolved)

| Finding | Severity | Claimed Fix | Codebase Verification | Status |
| ------- | -------- | ----------- | --------------------- | ------ |
| WR-01 | MEDIUM | `guardSlackShape` rejects Slack `{ok:false}` logged-out 200 → DOM fallback | `slack.js:182-195` present; applied to all 3 new reads (:271,:288,:303) + `conversations.list` (:245); write slug unguarded. Negative test green ("slack.list_channels rejects an {ok:false} logged-out 200"). | ✓ GENUINELY FIXED |
| IN-01 | LOW | Negative (logged-out) cases for all 3 guards, proven non-vacuous via mutation test | `capability-head-handlers.test.js` 121/0 with 5 negative PASS lines (gitlab non-array, gitlab id-bearing error envelope, slack {ok:false}, notion null). | ✓ GENUINELY FIXED |
| IN-02 | LOW | `looksLikeGitlabError` tightens gitlab get_* guard to reject id-bearing error envelopes | `gitlab.js:189-192` present; `guardShape` get_* branch requires `!looksLikeGitlabError(data)` (:211). Negative test green ("gitlab.get_project rejects an id-bearing GitLab error envelope"). | ✓ GENUINELY FIXED |
| IN-03 | LOW | Cosmetic clarifying comment (descriptor `service` vs registered origin) | `slack.js:326-331` + `notion.js:203-208` comment present; no slug/origin/behavior change. | ✓ GENUINELY FIXED |

### Security Section (the headline)

The phase rests on three security properties — all hold under codebase scrutiny:

1. **First-party origin ONLY (Wall 2 — no cross-origin credential replay).** Every spec pins the app's OWN first-party origin: gitlab → `https://gitlab.com` (with `/api/v4` as a PATH, NOT an `api.gitlab.com` subdomain — verified against the vendored ground truth `gitlab-api.ts:13` which returns `https://gitlab.com/api/v4`), slack → `https://app.slack.com`, notion → `https://www.notion.so`. No `api.<app>` host string and no `chrome.scripting`/`chrome.tabs` appears in any handler (only doc comments naming the forbidden patterns). A separate-origin slip is fail-closed: `executeBoundSpec` rejects `spec.origin !== activeTabOrigin` with `RECIPE_ORIGIN_MISMATCH` BEFORE any executeScript (`capability-fetch.test.js` FETCH-03: recorder EMPTY — no side effect). linear (`client-api.linear.app`, separate-origin CORS, `linear-api.ts:18`) was correctly deferred to Phase 41's CORS-gate rather than forced cross-origin.

2. **No scraped token ever logged.** ZERO `console.*`/`logger`/`.log(` lines exist in any of the 3 handlers — there is no surface for a token to be written to a log line. Slack's scraped `xoxc` flows only through `buildSlackBody` into the request BODY (form field), never a header (the only `header` references near `xoxc` are comments asserting "NO xoxc in any header"); the `xoxd` token rides the HttpOnly cookie automatically. notion's `token_v2` rides the cookie (no scrape).

3. **No money-mover — these are READS.** All 10 new slugs are `sideEffectClass:'read'`; gitlab is GET-only; the 3 slack reads use `conversations.list`/`.members`/`.info` (read RPCs); notion uses `search`/`getRecordValues` (read RPCs). The slack `chat.postMessage` WRITE slug is untouched (still returns `callSlackMethod` verbatim, no read-guard) and is deferred to Phase 41. `verify-catalog-crosscheck` independently confirms no under-stated mutating op and no payment-bearing op that is safe-and-API-invocable.

4. **The "200-with-logged-out-body" Top Risk is closed for all 10 reads.** Each read applies a shape guard (`guardShape`/`guardRpcShape`/`guardSlackShape`) that converts a logged-out/wrong-shape 200 into a dual-field `RECIPE_DOM_FALLBACK_PENDING` so the breadth DOM path serves instead of a false success. A pin/fetch failure is passed through verbatim (never masked). Proven non-vacuous by the IN-01 mutation test.

5. **Breadth corpus UNCHANGED.** 2306 opentabs descriptors, 0 orphans (`verify-no-orphan-descriptor`: `2306 committed == 2306 importer would emit`). The hand-ports UPGRADE the resolve tier (dom→T1a) on the byte-exact slug; they do not touch the descriptors. INV-01 frozen registry hash unmoved; no new MCP tool.

### Human Verification Required (carried-forward, NON-BLOCKING)

**Live endpoint-correctness UAT** — the sole `human_needed` item, explicitly NOT a phase-failing condition (the phase deliverable is the MECHANISM + the security properties, both fully automated and green).

#### 1. Live first-party internal-API endpoint correctness

**Test:** For each ported app, open an authenticated tab on its first-party origin (gitlab.com, app.slack.com, www.notion.so) and invoke each read via `search_capabilities` → `invoke_capability`. Confirm a real (non-logged-out) payload returns. Then repeat on a logged-out tab.
**Expected:** Authenticated → a real READ payload on the T1a fast path. Logged-out → `RECIPE_DOM_FALLBACK_PENDING` (the `expectedShape`/extract guard rejects the logged-out body; no false success).
**Why human:** Requires a logged-in browser session per app (no live auth in the autonomous run). The exact same-origin internal `/api/v4` · `/api/<method>` · `/api/v3` paths/shapes are `[ASSUMED]` (derived from the vendored public-API source re-targeted to the first-party origin + session cookie). Carried-forward user-gated debt consistent with the prior phases' posture; inherited by Phase 41. The handlers ship fail-closed so security holds regardless of live correctness.

### Gaps Summary

No gaps. All 3 success criteria are VERIFIED with codebase + green-gate evidence; all 5 plans' must-have truths, artifacts, and key links pass at every level (exists, substantive, wired, fail-closed data path). The correctness keystone (dom→T1a byte-exact upgrade across all 10 slugs, with a wrong-slug negative control and a BEFORE/AFTER flip) and the security keystone (first-party origin only + no token logged + origin-pin fail-closed before executeScript) both hold. All 4 code-review findings (WR-01 MED + 3 LOW) are genuinely present in the code and exercised green. The substitution (gitlab for the deferred linear) is sound: gitlab is genuinely same-origin (`gitlab.com/api/v4` is a PATH, vendored-verified), and linear is correctly Phase-41 CORS-gate material. The breadth corpus is unchanged (2306 descriptors, 0 orphans). The only outstanding item is the carried-forward, fail-closed, live-endpoint-correctness UAT — explicitly non-blocking per the phase boundary.

**Full gate battery (run read-only, real output):**

| Gate | Result | Exit |
|------|--------|------|
| `node tests/head-handler-upgrade.test.js` | 48 passed, 0 failed | 0 |
| `node tests/capability-head-handlers.test.js` | 121 passed, 0 failed (+5 IN-01 negative) | 0 |
| `node tests/head-handler-cap.test.js` | 5 passed, 0 failed (length=4 ≤ CAP=30) | 0 |
| `node tests/capability-router.test.js` | 46 passed, 0 failed | 0 |
| `node tests/capability-autopilot-parity.test.js` | 17 passed, 0 failed (INV-01 hash + INV-02 parity) | 0 |
| `node tests/capability-fetch.test.js` | 26 passed, 0 failed (origin-pin before executeScript) | 0 |
| `node scripts/verify-recipe-path-guard.mjs` | PASS (4 bundled-head handlers on allowlist & scanned) | 0 |
| `npm run validate:extension` | PASS (286 JS; 2306 descriptors; 0 orphans) | 0 |
| **`npm test`** | **EXIT 0** (111 suite summaries, 0 failures) | **0** |

Source/build parity: `catalog/handlers/{gitlab,slack,notion,github}.js` byte-identical to their `extension/catalog/handlers/` copies.

---

_Verified: 2026-06-26_
_Verifier: Claude (gsd-verifier)_
