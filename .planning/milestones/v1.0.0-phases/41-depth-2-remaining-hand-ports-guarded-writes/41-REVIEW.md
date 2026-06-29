---
phase: 41-depth-2-remaining-hand-ports-guarded-writes
reviewed: 2026-06-26T00:00:00Z
depth: deep
files_reviewed: 12
files_reviewed_list:
  - catalog/handlers/gitlab.js
  - catalog/handlers/notion.js
  - catalog/handlers/slack.js
  - extension/catalog/handlers/gitlab.js
  - extension/catalog/handlers/notion.js
  - extension/catalog/handlers/slack.js
  - scripts/verify-origin-classification.mjs
  - package.json
  - tests/guarded-write-failclosed.test.js
  - tests/head-handler-upgrade.test.js
  - tests/sensitive-write-import-gate.test.js
  - tests/consent-mutation-gate.test.js
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: resolved
resolution:
  resolved_at: 2026-06-26
  WR-01: { status: fixed, commit: 7ec14289 }
  WR-02: { status: fixed, commit: 4cb084ca }
  IN-01: { status: fixed, commit: 9a618722 }
  IN-03: { status: fixed, commit: 31fdf1c8 }
  IN-04: { status: fixed, commit: d715c8b6 }
  IN-02: { status: noted_left, reason: "dead fail-closed path; a regex change alters future live-capture token-selection semantics that cannot be validated without the Task-4 live capture" }
---

# Phase 41: Code Review Report — Depth 2 (Remaining Hand-Ports + Guarded Writes, DEPTH-02)

**Reviewed:** 2026-06-26
**Depth:** deep (cross-file: handlers + CORS-gate + 4 gate tests + descriptors + vendored source)
**Files Reviewed:** 12
**Status:** issues_found (2 WARNING, 4 INFO — no CRITICAL/HIGH; the security keystones hold)

## Summary

This is the most security-sensitive phase of the milestone (7 guarded WRITE handlers + a
new build-time CORS / first-party-origin gate). I reviewed it adversarially against all 7
scrutiny keystones and ran every gate read-only.

**The security keystones are SOUND.** Concretely verified:

- **SC1 (fail-closed writes):** All 7 new write handlers
  (`gitlab.create_issue/create_merge_request/create_note`,
  `notion.create_page/update_page/create_database_item`, `slack.send_message`) return the
  dual-field `RECIPE_DOM_FALLBACK_PENDING` and contain **no** `executeBoundSpec` /
  `callSlackMethod` / `buildRpcSpec` call in their `handle()` bodies (grep-confirmed lines
  383-426 gitlab, 282-325 notion, 377-390 slack). The fail-closed harness asserts the
  `executeBoundSpec` recorder stays **empty** (assertion (e), the load-bearing one) AND has a
  genuine non-vacuous negative control (a synthetic mutation-firing handler that leaves the
  recorder non-empty → got 1 call). No mutation can fire for an `[ASSUMED]` endpoint.
- **SC3 (CORS-gate enforces):** `classifyOriginPattern` uses strict `URL.origin` host
  equality. I drove it through edge cases: `linear.app` vs `client-api.linear.app` → separate;
  `app.datadoghq.com` vs `api.datadoghq.com` → separate; `notion.so` vs `www.notion.so` →
  separate; `gitlab.com` vs `gitlab.com/api/v4` → same. **No false-pass, no false-fail** on the
  cases tested. The linear separate-origin negative control genuinely exercises the failure
  path at CLI/validate time. Wired into `validate:extension` (package.json:31).
- **SC2 (sensitive T1a write gating):** `sensitive-write-import-gate.test.js` routes a
  `tier:'T1a'` `slack.send_message` write through the LIVE committed roster → without the flag
  yields `RECIPE_CONSENT_MUTATING_REQUIRED` (gate before dispatch); `setOriginMutating` →
  allow; read → allow. INV-03 byte-equality (`code===errorCode===error`) asserted on all three
  fields. `https://*.slack.com` confirmed sensitive in the committed roster.
- **Slug-exactness:** All 7 write slugs byte-match an `opentabs__<app>__<op>.json` descriptor
  with `sideEffectClass:'write'`, `backing:'dom'`. `notion.append_block` confirmed a READ and
  correctly EXCLUDED; `create_database_item` (a real write) correctly substituted. No dead
  duplicate (upgrade harness proves dom→T1a + write-class assertion).
- **No token logged + first-party origins:** No `console`/log line in any handler. All `xoxc`
  references are comments or in-spec body placement. Every write origin is first-party
  (`gitlab.com` / `www.notion.so` / `app.slack.com`), no api-subdomain.
- **Wall-2 + invariants UNCHANGED:** `capability-router.js`, `capability-fetch.js`,
  `catalog/handlers/github.js` have **zero diff** in the Phase-41 range. `HEAD_HANDLER_MODULES`
  stays 4 ≤ 30. Build copies (`extension/catalog/handlers/*`) are **byte-identical** to source.

**Gate results (all GREEN, read-only):**

| Gate | Result |
|------|--------|
| `node tests/guarded-write-failclosed.test.js` | PASS (36 passed, 0 failed; recorder-empty + negative control) |
| `node tests/head-handler-upgrade.test.js` | PASS (83 passed, 0 failed; write rows upgrade + write-class) |
| `node tests/sensitive-write-import-gate.test.js` | PASS (37 passed, 0 failed; SC2 T1a slack block) |
| `node tests/consent-mutation-gate.test.js` | PASS (34 passed, 0 failed; INV-03 write reason) |
| `node scripts/verify-origin-classification.mjs` | PASS (4 heads same-origin; linear neg-control separate) |
| `node tests/head-handler-cap.test.js` | PASS (5 passed, 0 failed; length 4 ≤ 30) |
| `npm run validate:extension` | PASS (all 7 sub-gates green incl. origin-classification) |

The two WARNINGs below are gate-robustness / test-coverage gaps, **not** holes that let a
mutation fire or a separate-origin port silently ship. The headline guarantees are intact.

## Warnings

### WR-01: The CORS-gate's same-origin assertion for Slack is partly vacuous — it validates against a hardcoded fallback, not the vendored dynamic base-URL

> **RESOLVED** (commit `7ec14289`): the silent null→fallback rubber-stamp is replaced
> with an EXPLICIT, ASSERTED same-registrable-domain check. `readDynamicWorkspaceBase()`
> proves the vendored `slack-api.ts` genuinely carries the dynamic `${workspaceUrl}/api/`
> + `*.slack.com` form; `classifyOriginPattern(opts.dynamicWorkspace)` then asserts the
> head origin (`app.slack.com`) and that dynamic base share the registrable domain
> `slack.com` (via a new `registrableDomain()` helper), returning `sameOrigin:true` with
> an explicit `SAME_REGISTRABLE_DOMAIN_DYNAMIC_WORKSPACE` reason. A future dynamic base
> OUTSIDE the head registrable family (incl. suffix-confusion `slack.com.evil.com`, whose
> registrable domain is `evil.com`) still FAILS `CORS_SEPARATE_ORIGIN`. `checkOriginClassification`
> now also fails closed (`CORS_UNRESOLVABLE_ORIGIN`) when a MAPPED vendored app yields
> neither a literal base nor the proven dynamic form, instead of masking the miss with the
> documented fallback. The CLI prints a DISTINCT `SAME-REGISTRABLE (dynamic workspace)`
> verdict (`api=https://workspace.slack.com`), so the asymmetry symptom is gone.
> gitlab/notion/github strict same-origin behavior is unchanged; the runtime
> `executeBoundSpec` origin-pin (`app.slack.com`) is untouched. Covered by
> `tests/verify-origin-classification.test.js` cases (b)+(c).

**File:** `scripts/verify-origin-classification.mjs:156-166` (`readApiBaseUrl`) + `:67-72` (`HEAD_APP_MAP`)

**Issue:** `readApiBaseUrl('slack')` returns **null** for the entire `slack-api.ts` file. The
extraction regex `/https:\/\/[a-z0-9.-]+(?:\/api...)?/i` requires a literal host character
immediately after `https://`, but the only `https://` literals in `slack-api.ts` are
`url.replace(/^http:\/\//i, 'https://')` (line 91, no host) and the **template-interpolated**
`` `https://${ts.model.team.domain}.slack.com` `` (line 138, `$` is not in `[a-z0-9.-]`). The
real Slack runtime base is `${auth.workspaceUrl}/api/${method}` (slack-api.ts:431) where
`workspaceUrl` is **dynamic** — it can be `https://app.slack.com` (new client) OR a
per-workspace subdomain `https://<workspace>.slack.com` (classic client, line 138).

Because extraction returns null, the gate falls back to `fallbackBaseUrl: 'https://app.slack.com'`
(`:203`), which trivially equals the handler's declared origin → a vacuous "SAME-ORIGIN" PASS.
The gate's verdict for Slack therefore reflects "handler origin == its own hardcoded fallback,"
NOT "handler origin == the app's real (dynamic) API base." The gate's CLI even prints
`api=https://app.slack.com` for Slack while printing the genuinely-extracted
`api=https://www.notion.so/api/v3/${endpoint}` for Notion and `api=https://gitlab.com/api/v4`
for GitLab — the asymmetry is the symptom.

**Why this is WARNING, not CRITICAL/HIGH:** The classifier itself is correct — I confirmed that
if it were fed the dynamic base it WOULD fail-closed (`app.slack.com` vs `myteam.slack.com` →
`separate`). And the runtime is safe regardless: the handler hardcodes `origin: SLACK_ORIGIN`
(`= 'https://app.slack.com'`) on every spec (lines 139, 254, 264, 288...), so it can never
silently target a per-workspace subdomain at runtime; the `executeBoundSpec` origin-pin enforces
`app.slack.com`; and `slack.send_message` is fail-closed. So no separate-origin port can silently
ship-and-fire via this path. But the gate does NOT actually *verify* Slack's same-origin claim —
it rubber-stamps a fallback. If a future Slack hand-port (or a vendored-source refresh) made the
real base genuinely separate-origin, this gate would still PASS on the fallback and not catch it.

**Fix:** Make the slack fallback an *explicit, asserted* exception rather than a silent
catch-all, and/or harden the extraction so a null result for a *mapped vendored app* is itself a
failure (forcing the fallback to be a deliberate, reviewed decision):
```js
// In readApiBaseUrl: tolerate the template-host form so the dynamic base is captured.
const re = /https:\/\/(?:\$\{[^}]+\}\.)?[a-z0-9.-]+(?:\/api[a-z0-9/_.${}-]*)?/i;
// ...and in checkOriginClassification, when a vendored app's api.ts exists but yields no
// base-URL, treat that as CORS_UNRESOLVABLE rather than silently falling back:
const vendored = readApiBaseUrl(mapping.app);
if (mapping.app && existsSync(join(VENDOR_PLUGINS, mapping.app, 'src', mapping.app + '-api.ts'))
    && !vendored) {
  // Slack's base is a dynamic ${workspaceUrl}; document app.slack.com as the pinned
  // first-party origin EXPLICITLY here (a reviewed same-registrable-domain decision),
  // instead of letting the generic fallback mask an extraction miss.
}
```
At minimum, add a comment in `HEAD_APP_MAP` next to the slack entry recording that its
`fallbackBaseUrl` is load-bearing (the vendored base is dynamic and intentionally not extracted),
so a later reader does not assume slack is being verified against its real base.

### WR-02: The CORS-gate exports `classifyOriginPattern` / `checkOriginClassification` "driven by a test" — but no such test exists; the failure path is exercised only by the CLI inline negative-control

> **RESOLVED** (commit `4cb084ca`): added `tests/verify-origin-classification.test.js`
> (mirrors the `no-duplicate-stem.test.js` real-export pattern, 27 assertions, all green)
> that drives the REAL exports directly — `parseHeadModules`, `classifyOriginPattern`,
> `checkOriginClassification` (the last is now also exported as `parseHeadModules`,
> fulfilling the documented dual-export contract). Coverage: (a) `parseHeadModules` on the
> live catalog returns exactly the 4 known globals + origins, plus a nested-brace entry
> parses whole (IN-01) and a `}` inside a quoted string does not split an entry; (b)
> `sameOrigin:true` for `gitlab.com/api/v4`, `www.notion.so/api/v3`, and the slack
> dynamic-workspace accommodation, including the REAL end-to-end
> `checkOriginClassification()` over the live catalog + vendored `slack-api.ts`; (c)
> `CORS_SEPARATE_ORIGIN` for `linear→client-api.linear.app` AND the
> `app.datadoghq.com`/`api.datadoghq.com` per-org wildcard, plus the dynamic-cross-registrable
> fail; (d) the `CORS_UNMAPPED_HEAD` and `CORS_UNRESOLVABLE_ORIGIN` branches. Registered in
> `npm test` (package.json) next to the other Phase 41 gate tests.

**File:** `scripts/verify-origin-classification.mjs:35-38` (docstring claims a test driver) + `tests/` (no consumer)

**Issue:** The file documents a dual export contract: *"export { classifyOriginPattern,
checkOriginClassification } -- driven by a test"* (line 36). No test in `tests/` imports either
function (grep: zero references to `classifyOriginPattern`, `checkOriginClassification`, or
`origin-classification` anywhere under `tests/`). The only exercise of the gate's *failure* path
is the inline `linearCtl` negative-control inside `runCli()` (`:233-240`), which runs at
`validate:extension` time. So:
- The exported functions are dead-to-tests (the documented "driven by a test" half of the dual
  export is unfulfilled).
- The failure path has no *unit* coverage independent of the CLI. The CLI negative-control is
  genuine and non-vacuous (it does fire the separate classification and `process.exit(1)` if it
  regresses), so this is a coverage/robustness gap, not a correctness hole — the gate does
  enforce. But the parsing path (`parseHeadModules`), the unmapped-head fail-closed branch
  (`:190-199`), and the `CORS_UNRESOLVABLE_ORIGIN` branch (`:101-111`) are never asserted.

**Why WARNING:** The headline enforcement (a separate-origin head reds the build) IS exercised
by the CLI negative-control and proven green. The gap is that the per-branch logic and the
exported API surface lack the focused test the file itself promises — so a future refactor of
`parseHeadModules` (e.g., the `/\{[^}]*\}/g` entry regex, which would silently break on any
nested-brace head entry) could go uncaught until the whole `validate:extension` happened to
notice a mis-parse.

**Fix:** Add `tests/origin-classification-gate.test.js` (mirroring the
`verify-no-duplicate-stem` test pattern referenced in the docstring) that imports the exports
and asserts: (a) a synthetic separate-origin head → `failures.length === 1` with a
`CORS_SEPARATE_ORIGIN` reason; (b) an unmapped head global → `CORS_UNMAPPED_HEAD` failure;
(c) `classifyOriginPattern(x, 'not-a-url')` → `CORS_UNRESOLVABLE_ORIGIN`; (d) `parseHeadModules`
on the real catalog source returns exactly the 4 known globals. This makes the failure path
test-covered independent of the CLI and fulfills the documented dual-export contract.

## Info

### IN-01: `parseHeadModules` entry regex `/\{[^}]*\}/g` cannot tolerate a nested-brace head entry

> **RESOLVED** (commit `9a618722`): replaced the `/\{[^}]*\}/g` entry split with a
> depth-tracking, string-aware brace-balanced scan that keeps each top-level `{ ... }`
> entry whole regardless of nesting (and ignores a `}` inside a quoted string value). A
> future nested-brace entry (`{ global:'...', meta:{region:'us'}, origin:'...' }`) now
> parses with its `origin` intact instead of being truncated to `origin:null` (a confusing
> false build red). The real flat 4-head manifest parses identically. Tested directly in
> `tests/verify-origin-classification.test.js` case (a-IN01).

**File:** `scripts/verify-origin-classification.mjs:136`

**Issue:** Entries are split with `/\{[^}]*\}/g`, which matches a `{...}` containing no inner
`}`. Today every `HEAD_HANDLER_MODULES` entry is a flat one-liner
(`{ global: '...', service: '...', origin: '...' }`), so this is correct. But if a future entry
gained a nested object (e.g. `{ global: '...', meta: { region: 'us' }, origin: '...' }`), the
regex would match `{ global: '...', meta: { region: 'us' }` and STOP at the inner `}`, dropping
`origin` from the chunk → the head would be parsed with `origin: null` → classified separate via
`CORS_UNRESOLVABLE_ORIGIN` → a **false build failure** (fail-closed, so safe, but a confusing
red). This is latent, not active.

**Fix:** Either add a guard comment pinning the "flat object literals only" assumption (it
already exists at `:128-129` — good), or parse with a brace-balanced scan if entries ever
nest. No action needed while entries stay flat; flagging for the future-refactor reader.

### IN-02: Slack `readXoxcToken` regex `/(xoxc-[A-Za-z0-9-]+)/i` is dead on the fail-closed write path but worth noting for the future flip

> **NOTED / LEFT** (no commit): left unchanged by deliberate decision. This path is DEAD on
> the fail-closed milestone (`slack.send_message` fails closed before any probe, so
> `readXoxcToken` is never reached). The bare `/(xoxc-...)/` pattern is already the LAST
> entry in the `patterns` array — the structured object carriers (`d.xoxc`, `d.api_token`)
> and the keyed-JSON patterns (`"xoxc":"..."`, `"api_token":"..."`) are all tried first, so
> it is already effectively gated behind "no structured carrier found." Any regex tightening
> here would change the FUTURE live-capture token-selection semantics, which cannot be
> validated without the Task-4 live capture (which does not yet exist) — making a speculative
> change the kind of blind edit that risks the future flip. Per the reviewer's own conclusion
> ("No change required for the fail-closed milestone"), deferred to the live-capture
> activation, when `d.xoxc`/`d.api_token` become the verified carriers and the bare fallback
> can be dropped against a real fixture.

**File:** `catalog/handlers/slack.js:147-168`

**Issue:** `readXoxcToken` extracts a token via regex over `probeResult.text`. On the
Phase-41 `slack.send_message` write this code is **never reached** (the handler fails closed
before any probe — confirmed), so there is no live-token exposure today. For the future
live-capture flip: the third pattern `/(xoxc-[A-Za-z0-9-]+)/i` matches a raw token substring
anywhere in the page text, which is broad — a logged-out boot page that happens to echo a stale
or example `xoxc-...` string in HTML could yield a wrong token. The shape guard
(`guardSlackShape`) would then reject the `{ok:false}` response, so it still fails closed, but
the token-selection heuristic is loose. Pre-existing (Phase 29), not introduced here.

**Fix (future, when the write is activated):** Prefer the structured carriers
(`d.xoxc` / `d.api_token`) and the keyed JSON patterns over the bare-substring fallback; drop
the bare `/(xoxc-...)/` pattern or gate it behind "no structured carrier found." No change
required for the fail-closed milestone.

### IN-03: `looksLikeGitlabError` (IN-02 hardening) keys on `message`/`error` strings — a legitimate GitLab body with a top-level `message` field would be misclassified as logged-out

> **RESOLVED** (commit `31fdf1c8`): comment-only softening. The over-claim "a legitimate
> resource body is never excluded" is scoped to the 5 currently-ported project/issue/MR read
> shapes (for which it holds), and the comment now documents that this is a value-shape
> assumption, NOT universal — a future `get_commit`-style read whose legitimate 200 body has a
> top-level string `message` WOULD fall back to DOM (a false-negative read, the safe
> direction), with the future-refactor guidance (require the ABSENCE of id/iid AND the error
> marker) recorded inline. No logic change; rebuilt so the gitlab build copy stays
> byte-identical.

**File:** `catalog/handlers/gitlab.js:247-250`, used by `guardShape` (`:259-281`)

**Issue:** `looksLikeGitlabError` returns true if the body has a top-level string `message`
or string `error`. This guards `get_*` reads (the `wantArray:false` branch). GitLab's REST
resource bodies for projects/issues/MRs do not carry a top-level string `message`, so the
heuristic is conservative *for those endpoints*. But it is a value-shape assumption: any future
`get_*` endpoint whose legitimate 200 body includes a top-level `message` string (e.g. a commit
object has a `message`) would be classified as a logged-out/error envelope and fall back to DOM
— a false-negative read, not a security issue (it fails *toward* DOM fallback, the safe
direction). Reads only; the writes are fail-closed and never reach this guard. Acceptable given
the conservative intent, but the comment "a legitimate resource body is never excluded" (`:246`)
is slightly too strong — it holds for the 5 *currently-ported* read shapes, not universally.

**Fix:** None required (fail-toward-DOM is the safe direction). If a `get_commit`-style read is
ever added, scope `looksLikeGitlabError` to require the *absence* of the resource's id/iid AND
the presence of the error marker, rather than OR-ing them, to avoid excluding a `message`-bearing
resource.

### IN-04: Notion `guardRpcShape` accepts any non-null object/array as a valid read — weaker than the gitlab/slack shape guards

> **RESOLVED** (commit `d715c8b6`): added `looksLikeNotionError` (parity with gitlab.js
> `looksLikeGitlabError`) — a top-level string `name` (the shape `notion-api.ts` parses on a
> non-ok response: `{ name?, message?, debugMessage? }`) OR a string `errorId` (Notion's
> documented internal-API error marker) marks the logged-out/error envelope. `guardRpcShape`
> now rejects it → `RECIPE_DOM_FALLBACK_PENDING` (the safe fail-toward-DOM direction), so a
> logged-out 200 that happens to be a non-null object no longer masquerades as success.
> Conservative and keyed ONLY on the error markers, so a legitimate read body — a `getSpaces`
> user-id-keyed map (verified: no `name`/`errorId`), a `search` results object, a `recordMap`
> record fetch — carries neither and is never excluded. Reads only; the notion writes stay
> fail-closed and never reach this guard. Rebuilt so the build copy is byte-identical; all
> notion-loading gates (`capability-head-handlers`, `head-handler-upgrade`,
> `guarded-write-failclosed`) stay green.

**File:** `catalog/handlers/notion.js:167-181`

**Issue:** `guardRpcShape` only rejects null/primitive `data` (`ok = !!data && typeof data ===
'object'`). Unlike gitlab (`guardShape` checks id/iid presence + error-envelope rejection) and
slack (`guardSlackShape` checks `ok === false`), the notion guard would accept a logged-out
`/api/v3` body that happens to be a non-null object (e.g. an error object `{errorId, name,
message}` or an empty `{}`). Reads only; the notion **writes are fail-closed** and never reach
this guard, so no mutation risk. This is a pre-existing breadth-quality gap on the notion READ
heads (Phase 40), surfaced here only because the file was touched. A logged-out notion read
could masquerade as success more easily than the gitlab/slack equivalents.

**Fix (read-quality, non-blocking):** Tighten `guardRpcShape` to reject Notion's documented
error-envelope shape (a top-level `name`/`errorId` string with no `recordMap`/`results`), giving
notion parity with the gitlab error-envelope rejection. Out of scope for the guarded-write
keystone; flagging for read-path hardening.

---

_Reviewed: 2026-06-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
