---
phase: 41-depth-2-remaining-hand-ports-guarded-writes
verified: 2026-06-26
status: passed
score: 4/4 success-criteria verified (16/16 plan must-have truths verified)
re_verification:
  is_re_verification: false
human_verification:
  - test: "Live mutation-body capture for each of the 7 guarded [ASSUMED-ENDPOINT] writes (UAT-41-01..07) on a real authenticated tab"
    expected: "Each write's assumed internal endpoint method/path/body (incl CSRF/token placement) is confirmed or corrected against the app's own frontend request; a future flip then activates the handler"
    why_human: "Requires real credentials in a live authenticated browser tab (forbidden in CI, GOV-06). The writes ship FAIL-CLOSED and INERT until capture — non-blocking for CI. Carried-forward, user-gated debt; recorded in 41-HUMAN-UAT.md and as v2 UATX-01 in REQUIREMENTS.md."
---

# Phase 41: Depth 2 — Remaining Hand-Ports + Guarded Writes (DEPTH-02) Verification Report

**Phase Goal:** Complete the depth head with the remaining hand-ports INCLUDING WRITE ops, holding every write FAIL-CLOSED to `RECIPE_DOM_FALLBACK_PENDING` (the `github.issues.create` pattern) until a live-captured mutation body confirms it, re-enforcing the DENY-04 mutating opt-in on sensitive origins, and gating any separate-API-origin (Pattern-D) port behind a per-app CORS / first-party-origin verification gate so an unverified port can never silently ship. Owns DEPTH-02.

**Verified:** 2026-06-26
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Success Criteria (ROADMAP contract)

| #   | Success Criterion                                                                                      | Status     | Evidence (summary)                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| SC1 | Remaining heads ship; every WRITE fails closed to `RECIPE_DOM_FALLBACK_PENDING` until a live body; each `[ASSUMED-ENDPOINT]` carries a recorded `human_needed` live-UAT | ✓ VERIFIED | 7 write handlers read directly — all return ONLY dual-field `RECIPE_DOM_FALLBACK_PENDING`, none call `executeBoundSpec`. `guarded-write-failclosed` 36/0 (empty recorder + non-vacuous negative control). `head-handler-upgrade` 83/0 (all 7 slugs dom→T1a, `sideEffectClass:write`, byte-exact slug). 7 `human_needed` UAT rows recorded. |
| SC2 | A WRITE to a sensitive origin honors the DENY-04 mutating opt-in (posture B); reads stay open under Auto | ✓ VERIFIED | `sensitive-write-import-gate` 37/0 + `consent-mutation-gate` 34/0. `slack.send_message` (T1a write) on SENSITIVE `app.slack.com` through the LIVE committed roster → `RECIPE_CONSENT_MUTATING_REQUIRED` w/o flag; allow with `setOriginMutating`; read allows under Auto. Gate at `capability-router.js:720` runs BEFORE tier dispatch (`:745`). INV-03 `code===errorCode===error`. |
| SC3 | A per-app CORS / first-party-origin gate precedes any separate-API-origin port; same-origin may port; separate origins demoted to T3-DOM | ✓ VERIFIED | `verify-origin-classification.mjs` PASS (4 heads SAME-ORIGIN vs vendored API base; linear negative-control classifies SEPARATE). `verify-origin-classification.test.js` 27/0. WR-01 fix genuine (no silent fallback; refuses unresolvable base with `CORS_UNRESOLVABLE_ORIGIN`). Wired into `validate:extension`. linear/datadog/jira NOT shipped as heads. |
| SC4 | Head cap holds; INV-03 typed reasons byte-stable across providers; depth tests green; Wall-2 origin-pin unchanged | ✓ VERIFIED | `head-handler-cap` 5/0 (HEAD_HANDLER_MODULES=4 ≤30, NO new module). `git diff 12b820b0..HEAD -- capability-router.js capability-fetch.js` EMPTY (Pattern-D NOT built). INV-01 (`tool-definitions-parity` 260/0) + INV-02 (`capability-autopilot-parity` 17/0). INV-03 byte-equality covers the new write reason. |

**Score:** 4/4 success criteria verified.

### Observable Truths (plan must-haves, merged across 5 plans)

| #   | Truth                                                                                                       | Status     | Evidence                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| 1   | A guarded write returning `RECIPE_DOM_FALLBACK_PENDING` + never calling `executeBoundSpec` passes the harness; a mutation-firing handler FAILS it | ✓ VERIFIED | `guarded-write-failclosed` 36/0; assertion (e) recorder===0; non-vacuous negative control (recorder!==0) |
| 2   | `verify-origin-classification.mjs` classifies every head SAME-ORIGIN, FAILS on separate-origin, wired into `validate:extension` | ✓ VERIFIED | Gate PASS over 4 heads; `package.json validate:extension` chain includes the script; CLI `process.exit(1)` on failure |
| 3   | A synthetic separate-origin head (linear → client-api.linear.app) FAILS the CORS-gate (negative control)   | ✓ VERIFIED | CLI negative-control prints SEPARATE; `classifyOriginPattern` returns `separate:true / CORS_SEPARATE_ORIGIN` |
| 4   | The new T1a-write `RECIPE_DOM_FALLBACK_PENDING` reason is byte-equal `code===errorCode===error` (INV-03)   | ✓ VERIFIED | `consent-mutation-gate` Phase-41 block asserts all three fields byte-identical                        |
| 5   | `head-handler-upgrade.test.js` asserts the write slugs resolve dom→T1a with write class + byte-exact slug  | ✓ VERIFIED | 83/0 incl. 5 write-class assertions per slug                                                         |
| 6   | gitlab create_issue/create_merge_request/create_note register T1a on gitlab.com, resolve dom→T1a, fail closed, no mutation | ✓ VERIFIED | Read `gitlab.js:389-431`; descriptors write/dom; upgrade + failclosed tests green                    |
| 7   | notion create_page/update_page/create_database_item register T1a on www.notion.so, resolve dom→T1a, fail closed | ✓ VERIFIED | Read `notion.js:303-345`; descriptors write/dom; upgrade + failclosed tests green                    |
| 8   | slack.send_message registers T1a on app.slack.com, resolves dom→T1a, fails closed, distinct from executable chat.postMessage | ✓ VERIFIED | Read `slack.js:378-390`; distinct slug; upgrade test asserts both resolve correctly                  |
| 9   | A T1a write on sensitive app.slack.com via LIVE roster → MUTATING_REQUIRED w/o flag; allow with flag; read allows | ✓ VERIFIED | `sensitive-write-import-gate` Phase-41 SC2 block 7 assertions pass                                    |
| 10  | Each write carries closed params (additionalProperties:false) + `[ASSUMED-ENDPOINT]` marker               | ✓ VERIFIED | `*_PARAMS` referenced in each handler; `[ASSUMED-ENDPOINT]` markers in all 3 handler files            |
| 11  | 41-HUMAN-UAT.md records 7 `human_needed` mutation-body-capture rows (recorded, not fabricated)            | ✓ VERIFIED | UAT-41-01..07, all status `human_needed`                                                             |
| 12  | Full `npm test` exits 0 with all writes fail-closed, SC2 proven, CORS-gate green, INV-03 stable, head cap ≤30 | ✓ VERIFIED | `npm test` exit 0; 7394 PASS assertions; every suite reported 0 failed                                |
| 13  | `npm run validate:extension` exits 0 including the new CORS-gate                                            | ✓ VERIFIED | exit 0; `verify-origin-classification: PASS (... 0 silent cross-origin ports)`                        |
| 14  | The Wall-2 origin-pin (`RECIPE_ORIGIN_MISMATCH`) is UNCHANGED — Pattern-D NOT built                         | ✓ VERIFIED | `git diff 12b820b0..HEAD -- capability-router.js capability-fetch.js` EMPTY; pin present `capability-fetch.js:299-303` |
| 15  | The Pattern-D deferral (separate-origin apps demoted to T3-DOM via CORS-gate) is recorded                   | ✓ VERIFIED | `41-DEFERRAL.md` records the demote + the CORS-gate enforcement rationale                             |
| 16  | INV-01 (no new MCP tool / frozen registry) + INV-02 (router parity) hold                                    | ✓ VERIFIED | `tool-definitions-parity` 260/0; `capability-autopilot-parity` 17/0; `capability-mcp-surface` 19/0    |

**Score:** 16/16 truths verified.

### Required Artifacts

| Artifact                                                    | Expected                                          | Status     | Details                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| `scripts/verify-origin-classification.mjs`                 | CORS / first-party-origin gate + negative control | ✓ VERIFIED | 443 lines; dual export; fail-closed paths (UNMAPPED/UNRESOLVABLE/SEPARATE); CLI exits non-zero on fail; wired into validate:extension |
| `tests/guarded-write-failclosed.test.js`                   | SC1 fail-closed harness (empty recorder)          | ✓ VERIFIED | 36/0; recorder-empty keystone + non-vacuous mutation-firing negative control |
| `tests/head-handler-upgrade.test.js`                       | dom→T1a upgrade incl write slugs                  | ✓ VERIFIED | 83/0; 7 write slugs with `sideEffectClass:write` + byte-exact slug + before/after fixture |
| `tests/verify-origin-classification.test.js`               | WR-02 unit-test of CORS-gate exports              | ✓ VERIFIED | 27/0; drives classifyOriginPattern/checkOriginClassification/parseHeadModules directly |
| `tests/sensitive-write-import-gate.test.js` (Phase-41 block)| SC2 sensitive-origin T1a write mutating opt-in    | ✓ VERIFIED | 37/0 total; loads REAL committed roster; slack SC2 block 7 assertions   |
| `tests/consent-mutation-gate.test.js` (Phase-41 block)     | INV-03 byte-equality for new write reason         | ✓ VERIFIED | 34/0; `code===errorCode===error` for `RECIPE_DOM_FALLBACK_PENDING`      |
| `catalog/handlers/gitlab.js`                               | 3 guarded gitlab writes (fail-closed)             | ✓ VERIFIED | `:389-431`; each returns dual-field DOM_FALLBACK only; extension/ copy IDENTICAL |
| `catalog/handlers/notion.js`                               | 3 guarded notion writes (fail-closed)             | ✓ VERIFIED | `:303-345`; each returns dual-field DOM_FALLBACK only; extension/ copy IDENTICAL |
| `catalog/handlers/slack.js`                                | slack.send_message guarded write (fail-closed)    | ✓ VERIFIED | `:378-390`; distinct slug, dual-field DOM_FALLBACK only; extension/ copy IDENTICAL |
| `catalog/descriptors/opentabs__*__*.json` (7 writes)       | write/dom descriptors the heads upgrade           | ✓ VERIFIED | All 7 exist; slug byte-exact; `sideEffectClass:write`, `backing:dom`     |
| `.planning/.../41-HUMAN-UAT.md`                            | 7 live-UAT human_needed rows                      | ✓ VERIFIED | UAT-41-01..07 all `human_needed`                                        |
| `.planning/.../41-DEFERRAL.md`                             | Pattern-D deferral + demote rationale             | ✓ VERIFIED | Records linear/datadog/jira/supabase demote-to-T3 via the CORS-gate     |

### Key Link Verification

| From                                  | To                                                       | Via                                  | Status  | Details                                                  |
| ------------------------------------- | -------------------------------------------------------- | ------------------------------------ | ------- | -------------------------------------------------------- |
| `package.json validate:extension`     | `scripts/verify-origin-classification.mjs`               | npm script chain                     | ✓ WIRED | Present in chain; runs in `validate:extension` (exit 0)  |
| `verify-origin-classification.mjs`    | `vendor/opentabs-snapshot/plugins/<app>/src/<app>-api.ts`| base-URL text extraction (readFileSync)| ✓ WIRED | `readApiBaseUrl` / `readDynamicWorkspaceBase` read api.ts as TEXT |
| `catalog/handlers/gitlab.js`          | `opentabs__gitlab__create_issue.json` (+2)               | slug-exact dom→T1a upgrade           | ✓ WIRED | Upgrade test confirms byte-exact slug resolve T1a        |
| `catalog/handlers/notion.js`          | `opentabs__notion__create_page.json` (+2)                | slug-exact dom→T1a upgrade           | ✓ WIRED | Upgrade test confirms byte-exact slug resolve T1a        |
| `catalog/handlers/slack.js`           | `opentabs__slack__send_message.json`                     | slug-exact dom→T1a upgrade           | ✓ WIRED | Upgrade test confirms; distinct from chat.postMessage    |
| `tests/sensitive-write-import-gate.js`| `extension/utils/service-denylist.js` (committed roster) | classify(app.slack.com).sensitive    | ✓ WIRED | Loads REAL module; re-points live gate accessor          |
| consent gate (`router:720`)           | tier dispatch (`router:745`)                             | gate runs BEFORE `_runHandlerTier`   | ✓ WIRED | Ordering confirmed by read; comment + line order         |

### Data-Flow Trace (Level 4)

The shipped artifacts are guarded-write handlers and a build-time gate. By design the writes are INERT (no dynamic data flows to a mutation — that is the security property). The "data" verified is the fail-closed typed-error payload, which is traced directly: each `handle()` returns a literal `RECIPE_DOM_FALLBACK_PENDING` dual-field object, and the failclosed test confirms NO downstream `executeBoundSpec` data path is exercised. The CORS-gate's data source (vendored `<app>-api.ts` base-URLs) is read live via `readFileSync` and produces real classifications (SAME-ORIGIN for the 4 heads, SEPARATE for the linear control) — FLOWING, not static.

### Behavioral Spot-Checks

| Behavior                                            | Command                                            | Result                            | Status  |
| --------------------------------------------------- | -------------------------------------------------- | --------------------------------- | ------- |
| All 7 guarded writes fail closed, recorder empty    | `node tests/guarded-write-failclosed.test.js`      | 36 passed, 0 failed (exit 0)      | ✓ PASS  |
| 7 write slugs upgrade dom→T1a with write class       | `node tests/head-handler-upgrade.test.js`          | 83 passed, 0 failed (exit 0)      | ✓ PASS  |
| Head cap = 4 modules ≤ 30, no new module            | `node tests/head-handler-cap.test.js`              | 5 passed, 0 failed (exit 0)       | ✓ PASS  |
| SC2 sensitive-origin write mutating opt-in (live roster)| `node tests/sensitive-write-import-gate.test.js`| 37 passed, 0 failed (exit 0)      | ✓ PASS  |
| Consent mutation gate + INV-03 byte-equality        | `node tests/consent-mutation-gate.test.js`         | 34 passed, 0 failed (exit 0)      | ✓ PASS  |
| CORS gate classifies heads, fails on separate origin| `node scripts/verify-origin-classification.mjs`    | PASS (4 heads same-origin; 0 silent ports) | ✓ PASS  |
| CORS gate exports unit-tested                       | `node tests/verify-origin-classification.test.js`  | 27 passed, 0 failed (exit 0)      | ✓ PASS  |
| Full battery                                         | `npm test`                                         | exit 0; 7394 PASS; every suite 0 failed | ✓ PASS  |
| Extension validation incl CORS gate                 | `npm run validate:extension`                       | exit 0; CORS gate PASS            | ✓ PASS  |
| Opentabs corpus unchanged, orphan-free              | `node --import tsx tests/no-orphan-descriptor.test.js` | 10 passed, 0 failed; 2306==2306, 0 orphans | ✓ PASS  |

### Requirements Coverage

| Requirement | Source Plan(s)      | Description                                  | Status      | Evidence                                                              |
| ----------- | ------------------- | -------------------------------------------- | ----------- | -------------------------------------------------------------------- |
| DEPTH-02    | 41-01..05 (all)     | Depth-2 remaining hand-ports + guarded writes + CORS gate | ✓ SATISFIED | All 4 SCs verified; full battery green; the fail-closed + CORS + Wall-2-intact keystones hold |

No orphaned requirements: REQUIREMENTS.md maps Phase 41 to DEPTH-02 only, which every plan claims.

### Anti-Patterns Found

| File                                    | Line  | Pattern                          | Severity | Impact                                                                 |
| --------------------------------------- | ----- | -------------------------------- | -------- | --------------------------------------------------------------------- |
| catalog/handlers/{gitlab,notion,slack}.js | various | `[ASSUMED-ENDPOINT]` markers   | ℹ️ Info  | Intentional + by design — marks the live-capture debt; each carries a recorded `human_needed` UAT row. The writes ship FAIL-CLOSED so the marker is honest, not unfinished code. Not a debt-marker gate violation (no TBD/FIXME/XXX). |
| 41-REVIEW.md (IN-02)                     | —     | `noted_left` (regex untouched)   | ℹ️ Info  | A dead fail-closed-path regex; deliberately not changed because a change alters future live-capture token-selection semantics unverifiable without the live capture. Documented decision, not a gap. |
| tests/no-orphan-descriptor.test.js      | —     | Requires `--import tsx` to run    | ℹ️ Info  | Running WITHOUT tsx produces false orphan flags (TS extraction breaks). The `npm test` chain runs it canonically (`node --import tsx`) → 10/0. Test-ergonomics note only; the authoritative gate is green. |

No `TBD`/`FIXME`/`XXX` debt markers in any phase-modified file. No stub handlers (writes are deliberately inert fail-closed, the github.issues.create pattern — verified by direct read, not assumed). No orphaned artifacts.

### Human Verification Required

**Live mutation-body capture (UAT-41-01 .. UAT-41-07) — carried-forward, NON-blocking debt.**

- **Test:** On a real authenticated tab for each service (gitlab.com, www.notion.so, app.slack.com), use DevTools Network to capture the REAL request the app's own frontend issues for each WRITE op, and compare to the handler's `[ASSUMED-ENDPOINT]` expectation. Record the observed method/path/body and token/CSRF LOCATION (redacted to shape — never the literal token), plus date/Chrome version/commit.
- **Expected:** Each assumed internal endpoint is confirmed or corrected; a future flip then activates the handler.
- **Why human:** Requires real credentials in a live authenticated browser tab — forbidden in CI (GOV-06). The 7 writes ship FAIL-CLOSED and INERT (each `handle()` returns `RECIPE_DOM_FALLBACK_PENDING`, fires NO mutation) until captured. This does NOT block the phase or CI — it is pre-recorded, user-gated debt in `41-HUMAN-UAT.md` and `REQUIREMENTS.md` (v2 UATX-01), consistent with the Phase 29/40 posture.

This human item does NOT downgrade the phase verdict: the success criteria explicitly require only that each `[ASSUMED-ENDPOINT]` *carries a recorded `human_needed` live-UAT* (SC1) — which is verified — not that the capture itself is performed in this phase.

## Security Section

The four security keystones the phase promised all hold, verified against the codebase (not the SUMMARY):

1. **No write fires a mutation (fail-closed).** All 7 guarded write `handle()` bodies were read directly (`gitlab.js:389-431`, `notion.js:303-345`, `slack.js:378-390`): each returns ONLY the dual-field `RECIPE_DOM_FALLBACK_PENDING` and never calls `executeBoundSpec` / `callSlackMethod` / `buildRpcSpec`. The `guarded-write-failclosed` harness drives the REAL handlers through a recording `executeBoundSpec` ctx and asserts the recorder stays EMPTY (36/0), with a non-vacuous negative control proving a mutation-firing handler WOULD red the gate. The shipped `extension/catalog/` copies are byte-identical to source.

2. **The mutating opt-in holds on sensitive origins (DENY-04 posture B).** The consent gate's `evaluate()` runs at `capability-router.js:720`, BEFORE tier dispatch (`:745`), so a T1a write is gated identically to a DOM write. Proven end-to-end through the LIVE committed roster: `slack.send_message` on the SENSITIVE `app.slack.com` (`https://*.slack.com`) → `RECIPE_CONSENT_MUTATING_REQUIRED` without the flag, allow with `setOriginMutating`, and a read allows under Auto (`sensitive-write-import-gate` 37/0, `consent-mutation-gate` 34/0). The `_err` helper guarantees `code===errorCode===error` (INV-03).

3. **The CORS-gate fails-closed on separate origins.** `verify-origin-classification.mjs` iterates every head, reads the vendored API base-URL, and asserts SAME-ORIGIN; a separate-origin head reds the build (`CORS_SEPARATE_ORIGIN`), an unmapped head reds it (`CORS_UNMAPPED_HEAD`), and an unresolvable vendored base reds it (`CORS_UNRESOLVABLE_ORIGIN`) — the WR-01 fix replaced a silent fallback rubber-stamp with a genuine same-registrable-domain assertion that REQUIRES the vendored dynamic-workspace form to be present. The linear negative-control classifies SEPARATE. Wired into `validate:extension` (exit 0). linear/datadog/jira are NOT shipped as heads (only github/slack/notion/gitlab). An unverified separate-origin port can never silently ship.

4. **Wall-2 origin-pin intact (Pattern-D NOT built).** `git diff 12b820b0..HEAD -- extension/utils/capability-router.js extension/utils/capability-fetch.js` is EMPTY. The runtime `RECIPE_ORIGIN_MISMATCH` two-point pin remains at `capability-fetch.js:299-303`. The CORS-gate is a SHIPPING gate, not an executor — it enables no cross-origin call. Pattern-D cross-origin execution is deliberately deferred (`41-DEFERRAL.md`), SC3-compliant ("MAY port … or be demoted to T2/T3").

Money-no-movement floor preserved: no payment/commerce write hand-ports were added (`catalog-crosscheck` 26/0 confirms no payment-bearing op is safe-and-API-invocable; amazon/etc. stay DOM-only on sensitive origins).

### Gaps Summary

No gaps. All 4 ROADMAP success criteria and all 16 plan must-have truths are VERIFIED against the codebase. The full battery passes: `npm test` exit 0 (7394 PASS assertions, every suite 0 failed), `npm run validate:extension` exit 0, the CORS-gate green and non-vacuous, the 7 guarded writes fail-closed with an empty `executeBoundSpec` recorder, SC2 proven through the live roster, head cap = 4 modules (≤30, no new module), Wall-2 origin-pin diff empty, and the opentabs corpus unchanged at 2306 descriptors with 0 orphans. All 5 code-review fixes (WR-01, WR-02, IN-01, IN-03, IN-04) are committed and genuinely present in code; IN-02 is a documented `noted_left` decision.

The only outstanding item is the carried-forward, user-gated live mutation-body capture (7 `human_needed` UATs) — explicitly recorded, non-blocking for CI (the writes ship fail-closed/inert), and required by the phase only to be *recorded*, which it is.

---

_Verified: 2026-06-26_
_Verifier: Claude (gsd-verifier)_
