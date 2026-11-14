---
phase: 67-hosted-jev-gateway-policy-and-shadow-mode
verified: 2026-10-17T07:23:12Z
verified_at_commit: 9cd522c7
status: human_needed
score: 64/64 must-haves verified for the automated portion (5/5 roadmap success criteria, 59/59 plan truths); 0 failed
overrides_applied: 0
human_verification:
  - test: "V2 (M-67-02): choose the upstream route and pin; set JEV_API_KEY, JEV_UPSTREAM_URL, JEV_MODEL, JEV_DAILY_USD_CAP and the other JEV_* values with `fly secrets set` (never fly.toml [env]), with JEV_ENABLED off for the first deploy"
    expected: "`fly secrets list` shows the names only; route and pin recorded"
    why_human: "Needs the owner's upstream account and a live credential"
  - test: "V2 (M-67-03): deploy from the Jev branch with `flyctl deploy` (never a push to main), then POST https://full-selfbrowsing.com/api/jev/decide"
    expected: "503 with the typed {ok:false, fallback:'disabled', ...} body; the showcase site is unaffected"
    why_human: "Production deploy"
  - test: "V2 (M-67-04): flip JEV_ENABLED on and off with `fly secrets set`, timing each flip; run `node scripts/bench/shadow/gateway-smoke.mjs --gateway https://full-selfbrowsing.com/api/jev/decide` once per configured route"
    expected: "Time to effect recorded; the served model string, usage, usage.cost (OpenRouter) and latency match the fake-upstream fixtures"
    why_human: "Production operator action and real spend"
  - test: "V2 (M-67-05): one deliberately wrong key and one unknown model against the real upstream"
    expected: "auth_error and unavailable_model in the ledger (confirms the real 401/403 and model-error wording; research assumptions A1/A2)"
    why_human: "Real upstream behavior; fixtures model only the documented contract"
  - test: "V2 (M-67-06): read one real `[jev] decision` line in `fly logs`, then `fly ssh console -C \"node src/jev/report.js --recent 5\"` and `--days 1`"
    expected: "No body, URL, origin, goal, title, text, label, element id, hash key, IP or credential in the log line, the ledger row or the report"
    why_human: "Production data"
  - test: "V2 (M-67-07): if OpenRouter is chosen, prompt logging OFF and a per-key credit limit set; set the production JEV_DAILY_USD_CAP; keep JEV_UPSTREAM_TIMEOUT_MS at or below 2000 (review WR-05 bound)"
    expected: "Settings confirmed and cap value recorded"
    why_human: "Third-party account settings"
  - test: "V3 (M-67-08, M-67-09): gather enough labelled step records, run `run-shadow.mjs --gateway <deployed>` against exactly the V2 pin, select with the committed targets.json, commit the calibrated profile under showcase/server/src/jev/profiles/, record every not_a_fit kind, re-run jev-calibration-profile and jev-policy-tighten-only"
    expected: "A profile keyed by (pin, INSTRUMENT_HASH, snapshot) that validateProfile accepts; until then every decision stays uncalibrated"
    why_human: "Live calibration on the pinned model (JEV-05); the 25-record seed set is not_a_fit by construction"
  - test: "V4 (M-67-10): fast mode stays default-off and no Jev decision acts for users until the comparative gate passes"
    expected: "V4 gate result plus owner sign-off"
    why_human: "Release-gate decision"
  - test: "V5 owner decision (review WR-06): confirm the spend-seed policy. The fix retries a failed todaySpendUsd read on the next request and still serves the decision, rather than failing closed"
    expected: "Owner accepts retry, or asks for fail-closed (which would contradict the 67-09 must-have 'a ledger failure never fails a decision')"
    why_human: "Policy choice flagged by the code-review fixer as 'fixed: requires human verification'"
  - test: "V5 owner decision (review IN-02, skipped): buildRequest returns invalid_request for an unshrinkable request while the gateway returns payload_too_large"
    expected: "Keep the 67-06 contract, or change the client reason"
    why_human: "Changes a documented plan contract; nothing calls buildRequest yet"
  - test: "V2 owner decision (review IN-04, IN-05, skipped): refusals and 404 probes each bump a jev_daily counter, and the global cors({origin:true}) lets any web page call /api/jev"
    expected: "Decide after V2 monitoring whether to skip 404/disabled counts or bypass CORS for /api/jev (D-08 accepts global-cap abuse)"
    why_human: "Depends on production evidence"
  - test: "V6 (M-67-12): release. CI's Node 20 job runs the 14 registered commands fail-fast with 7225 free when the branch is pushed"
    expected: "Green CI; nothing from Phase 67 reaches origin/main before V6"
    why_human: "Release, publish and merge"
---

# Phase 67: Hosted Jev Gateway, Policy, and Shadow Mode Verification Report

**Phase Goal:** Provide version-pinned Jev through an FSB-owned server credential and a bounded, installation-associated HTTPS decision path; validate safe inputs, accounting, fallback, and calibration before live control.
**Verified:** 2026-10-17T07:23:12Z at `9cd522c7` (after the 10 review-fix commits)
**Status:** human_needed
**Re-verification:** No. This is the initial verification.

Every automated must-have holds in the code, not just in the SUMMARYs. All remaining items are live, production, spend or owner-decision items. By owner direction they are deferred to Validation Blocks V2 to V6, so they are not gaps.

## Goal Achievement

### Observable Truths (roadmap success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | The server holds the upstream credential in server-side secret storage, calls a pinned model and returns typed decisions. No extension bundle, message, response or storage record contains the credential, and users enter no Jev or OpenRouter key | VERIFIED (automated); live secret is V2 | `config.js` reads `JEV_API_KEY` only from env and makes it a non-enumerable, frozen property. A spawned real `server.js` sent exactly `{model:"jev-1.13.0", state, questions}` with `Authorization: Bearer <key>` to the loopback upstream. When the upstream echoed the key as `model`, the response was `invalid_response` with `servedModel:null` (CR-01 fix). Nothing in `extension/` matches `systemone`, `api.typesafe.ai` or `JEV_*`. The extension diff since `478d91a8` is only the 3 `jev-*.js` files plus 3 `importScripts` lines, with no change in `extension/ui` or `extension/config` and no `chrome.*` in the jev files. |
| SC2 | The HTTPS route is open to every install with no sign-in or quota. It validates a fixed bounded schema, limits body size and concurrent upstream work, records aggregate usage and FSB-borne cost, and has an operator-wide disable switch. The hash key is attribution only | VERIFIED (automated); production route is V2 | `routes/jev.js` has no auth middleware, no `validateHashKey` and no `req.ip`. A malformed `X-FSB-Hash-Key` still reached the upstream. On spawned `server.js`: no env gave 503 `disabled`; an alias model or a lookalike host gave 503 `not_configured`; 60 KB gave 413; an extra `instructions` key or an element `value` gave 400. With concurrency 1, a concurrent request got 503 `busy` while the upstream saw 1 call. With a 0.015 USD cap, the third call got 503 `spend_cap_reached`. `jev_daily` holds counts, tokens, cost by source and `cap_accrued_usd`. |
| SC3 | Extension and server validation exclude secrets and sensitive form values, treat page content as data, and never log raw bodies or credentials on success or error paths | VERIFIED | `buildRequest` dropped the password element, reduced the URL to origin + path (query and fragment gone), and turned `4111 1111 1111 1111` into `[REDACTED_CARD]` and the injection phrase into `[FILTERED]`. Upstream `instructions` never contained page text; text appears only in `state`. Markers for the credential, goal, page text, label, card, `hunter2`, query string and `SECRET-sk-` appeared in none of: the server console, `jev_decisions`, `jev_daily`, the report output or any gateway response. This held on 9 upstream modes, including a 401 echo of the auth header and body, plus malformed JSON on `/API/JEV/decide` (WR-01 fix). |
| SC4 | Timeout, rate-limit, invalid-response, unavailable-model and key errors produce typed fallbacks. The actual model, usage and FSB-borne cost are recorded where supplied, with no fabricated values | VERIFIED (automated); real error wording is V2 | Live run: hang gave `timeout`/504; 401 gave `auth_error`; 200-with-error 429 gave `rate_limited`; 404 "model retired" gave `unavailable_model`; garbage gave `invalid_response`; 529 gave `upstream_overloaded`; 402 gave `upstream_billing`. The ok row stored `input_tokens 1234/provider`, `cost 0.0000518/estimate` and served model `jev-1.13.0` verbatim. Fallback rows hold `null` with source `unavailable`, never 0. A provider `usage.cost` was reported as `provider`, and the dated `typesafe/jev-1.13-20260917` model was kept verbatim. |
| SC5 | Shadow runs on labelled tasks produce operation, target, completion, stuck and risk accuracy by confidence bucket. Live thresholds are selected from that evidence and tied to the pinned model. Tests prove Jev cannot remove confirmation or bypass existing safety breakers | VERIFIED (tooling and tighten-only); live calibration is V3 | There are 25 hand records over all 12 core fixtures: 4 risk positives, 3 completion positives, 21 not-done negatives, 2 stuck positives and 8 stuck negatives. `checkLockReferences` passes, and `scripts/bench/tasks/` is unchanged. The offline harness test drives the real `createJevRouter` and `FsbJevClient` (87 rows, report keyed by served model and `INSTRUMENT_HASH`, every kind `not_a_fit`, no candidate profile). `targets.json` is committed. The shipped profile is UNCALIBRATED. My own 200,000-case fuzz of `mergeConfirmation` with hostile `authorize`/`skipConfirmation`/`approved` fields found 0 drops below the existing level, 0 Jev-caused deny or stop, and 0 accepts without `calibrated`. The tighten-only suite uses the real `checkSafetyBreakers`/`detectStuck` exports and the real `HookPipeline` with `createPermissionHook`. |

**Score:** 5/5 roadmap criteria plus 59/59 plan frontmatter truths (plans 01-13) verified for the automated portion.

### Plan must-have truths (59)

| Plan | Truths | Status | Key evidence |
|------|--------|--------|--------------|
| 67-01 | 4 | VERIFIED | `contract.js`: 19 reasons, 5 kinds, 8 ops, caps (plus `profileIdChars` from WR-03), key sets, status map, Noul directions, approval deny-list. `validator.js` is exact-key at every level and gives `sensitive_goal` only after the shape passes. Contract suite: 331/0. |
| 67-02 | 4 | VERIFIED | `score.mjs` and `select.mjs` import `wilson`. Bonferroni z, minN 30, tie band 0.05, precision and recall modes. `targets.json` is committed. Score and select suites are green. |
| 67-03 | 5 | VERIFIED | The instrument hash pin `fsb-jev-instrument-1 → 5f62ba09…` equals the computed `INSTRUMENT_HASH`. Every Choice has `none_of_the_above`. Text shrinks before elements, which shrink before actions. The cut prefix is re-cleaned (WR-02). `calibration.js` has no try/catch outside `loadProfiles`. Upstream body was 3,493 bytes in the live run. |
| 67-04 | 5 | VERIFIED | Only the two exact upstream URLs plus loopback (refused under `NODE_ENV=production`). The alias model was refused, and the log said `[jev] config invalid: JEV_MODEL` with no value. One POST with `redirect:'error'` and no retry. `classifyStatus` covers 400 through 529. |
| 67-05 | 5 | VERIFIED | Tables `jev_decisions` and `jev_daily` are body-free. Housekeeper prune is its own guarded step and the telemetry tick is unchanged. `report.js --days 1` and `--recent 20` printed body-free output from the live-run db. |
| 67-06 | 5 | VERIFIED | `FsbJevState.CONTRACT` deep-equals the server copy, and the parity suite passes 391/0. `validateGatewayResponse` is exact-key and checks `meetsThreshold` against calibration. `buildRequest` drops sensitive elements and uses a 20,000-byte budget. |
| 67-07 | 5 | VERIFIED | `accept` reads only ok, `calibration.status` and the kind's decision. Lattice is 0..3, and the merge is `max(existing, confirm)`. `toBeforeToolResult` never stops. The suite passes 29,650/0, and my fuzz above agrees. |
| 67-08 | 5 | VERIFIED | `ENDPOINT` is the fixed constant, with `credentials:'omit'` and no query string. The client returned local `sensitive_goal` with 0 upstream calls. The cool-down is 60 s, or until UTC midnight for `spend_cap_reached` (at most 1 h), and lives in the closure only. WR-04 refuses unsanitized hand-built requests. |
| 67-09 | 6 | VERIFIED | The pipeline order matches the 8 steps in the code. The live run wrote 10 ledger rows for 10 upstream attempts and only aggregate counters for refusals. Every response carried `Cache-Control: no-store`. `server.js` boots with no env, an invalid env and a valid env. |
| 67-10 | 3 | VERIFIED | There are 25 records with an exact-key validator and dual-validator agreement. The lock references match `core.lock.json`, which is unmodified. |
| 67-11 | 4 | VERIFIED | The 3 `importScripts` lines come right after `ai/model-discovery.js`. The lattice smoke passes. No `FsbJev*` reference exists outside `extension/ai/jev-*.js`. The boundary suite passes 115/0. |
| 67-12 | 5 | VERIFIED | The harness uses `createJevClient({endpoint: gateway})`. The refusal tests (instrument version, mixed models) and the profile round trip pass. `gateway-smoke.mjs` exits with a usage error when no gateway is given. |
| 67-13 | 3 | VERIFIED | 14 jev commands, each exactly once in `scripts.test` and in `REFINEMENT_ROOT_TEST_COMMANDS`. 0 `PRE_PHASE6x` lines changed, and `delegation-phase-contract` passes 1238/0. The compatibility diff since `478d91a8` is empty for `mcp/`, `agent-loop.js`, `ai-integration.js`, `scripts/bench/tasks/` and the server package files. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `showcase/server/src/routes/jev.js` | Router factory | VERIFIED | 487 lines. Mounted in `server.js` at `/api/jev`. |
| `showcase/server/src/jev/{contract,scrubber,validator,instrument,calibration,canonical-json,config,upstream,ledger,report}.js` | Gateway helpers | VERIFIED | All substantive and all reached from the router or the CLI. |
| `showcase/server/src/jev/profiles/uncalibrated.json` | UNCALIBRATED default | VERIFIED | All thresholds null, status `uncalibrated`. Applied on every live ok response. |
| `showcase/server/src/db/schema.js`, `src/telemetry/housekeeper.js`, `src/middleware/global-json-parser.js`, `server.js`, `.env.example` | Wiring | VERIFIED | Additive diffs only. `JEV_API_KEY=` is empty in `.env.example`. |
| `extension/ai/jev-state.js`, `jev-client.js`, `jev-policy.js` | Client library | VERIFIED, intentionally inert | Loaded by `background.js`. Nothing in the extension calls them in Phase 67, by design (D-01, D-17); Phases 68 and 70 are the consumers. |
| `scripts/bench/shadow/**` | Harness, scoring, selection, records, answers, smoke | VERIFIED | Exercised by the 88 node:test cases. |
| 17 `tests/jev-*` files plus fixtures | Suites | VERIFIED | All registered and all green. |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `server.js` | `routes/jev.js` | `app.use('/api/jev', createJevRouter({db, config: jevConfig, ...}))` | WIRED (live spawn) |
| global parser | Jev route | case-insensitive `isJevPath` skip | WIRED (`/API/JEV/decide` gets a typed 400 from the router) |
| `routes/jev.js` | `upstream.js`, `ledger.js`, `calibration.js`, `instrument.js`, `validator.js` | direct calls | WIRED (live run: 10 ledger rows, calibration applied) |
| `upstream.js` | `config.js` | `config.apiKey`, timeout, price | WIRED |
| `housekeeper.js` | `ledger.js` | `pruneJevLedger(db, nowMs)` in its own try | WIRED |
| `jev-client.js` | `jev-state.js` | lazy `FsbJevState` (global or require) | WIRED |
| `background.js` | `jev-*.js` | 3 `importScripts` | WIRED (inert by design) |
| `run-shadow.mjs` | `jev-client.js`, `select.mjs`, `instrument.js` | `createRequire` | WIRED |
| parity test | server and extension contracts | `deepStrictEqual` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| ok response `decisions` | upstream answers | `callUpstream` → `validateAnswers` → `applyCalibration` | Yes (live loopback run) | FLOWING |
| `usage`/`cost` | `usage.input_tokens`, `usage.cost` | `computeUsageAndCost` | Yes; null when absent | FLOWING |
| `jev_daily.cap_accrued_usd` | spend accrual | `recordDecision(..., {capUsd})` | Yes; the spend cap tripped in the live run | FLOWING |
| `report.js` output | ledger rows | read-only SQLite | Yes | FLOWING |

### Behavioral Spot-Checks (run by the verifier, not taken from SUMMARYs)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 14 registered Jev commands (Node 24) | `node tests/jev-*.test.js` ×13 + `node --test tests/jev-shadow-*.test.mjs` | all exit 0 (88 node:test cases) | PASS |
| Non-SQLite Jev suites on Node 20 | `/tmp/fsb-node20/.../bin/node` for 10 suites plus 3 shadow `.mjs` files | all exit 0 (65 node:test cases) | PASS |
| Pins and adjacent suites | delegation-phase-contract, lattice-provider-bridge-smoke, server-trust-proxy, server-telemetry-body-cap, server-no-ip-leak, showcase-route-fallback, server-telemetry-housekeeper | all exit 0 | PASS |
| Real `server.js` end to end with an echoing fake upstream and the real extension client | `/tmp/jev-verify-67/e2e.js` | 9 typed outcomes, 0 marker leaks in console, ledger, aggregate, report or responses | PASS |
| Default off, alias, lookalike, busy, spend cap on real `server.js` | `/tmp/jev-verify-67/limits.js` | `disabled`, `not_configured` ×2, `busy` with 1 upstream call, `spend_cap_reached` on the third call | PASS |
| Tighten-only property | `/tmp/jev-verify-67/policy.js` (200,000 random cases) | 0 violations | PASS |
| Working tree after all runs | `git status --short` | only the two untracked review files | PASS |

### Probe Execution

Step 7c: not applicable. No PLAN or SUMMARY declares a `probe-*.sh`, and this is not a migration phase.

### Requirements Coverage

| Requirement | Source plans | Status | Evidence |
|-------------|--------------|--------|----------|
| JEV-01 | 08, 09, 11, 13 | SATISFIED (code); production availability is V2 | Open route, no auth, no quota, fixed endpoint, no user key or setting |
| JEV-02 | 04, 08, 09, 11, 12, 13 | SATISFIED (code); `fly secrets` is V2 | Env-only, non-enumerable credential; extension scans clean; the client sends no auth header |
| JEV-03 | 01, 03, 06, 09, 11, 13 | SATISFIED | Element drops, origin + path only, both scrubbers, injection filter, page text only in `state`, no leak markers |
| JEV-04 | 04, 05, 09, 13 | SATISFIED (local); production read is V2 | Ledger, daily aggregate, `[jev] decision` log line and `report.js` all carry model, tokens, cost and reason, body-free |
| JEV-05 | 02, 03, 07, 10, 12, 13 | Tooling SATISFIED; calibration NEEDS HUMAN (V3) | Shadow harness, scoring, selection, records and the UNCALIBRATED default keep every decision below threshold |
| JEV-06 | 01, 06, 07, 08, 13 | SATISFIED | Tighten-only lattice, real-export invariance, HookPipeline ordering, no approval-like wire key, fuzz clean |
| JEV-07 | 01, 03, 04, 05, 06, 08, 09, 13 | SATISFIED (code); production switch flip is V2 | Schema, 48 KB cap, semaphore, aggregate, switch, typed fallbacks |

Every ID in REQUIREMENTS.md mapped to Phase 67 (JEV-01..07) is claimed by at least one plan. None is orphaned.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (77 files changed since `478d91a8`) | - | TBD/FIXME/XXX | none | The only hits are pre-existing regex literals in `tests/delegation-phase-contract.test.js` that check for TBD, and a `\udXXX` comment in `tests/jev-state.test.js`. Neither is a debt marker. |
| `showcase/server/src/routes/jev.js` | 238-246, 451-458 | Every refusal and 404 probe does a synchronous `jev_daily` upsert (review IN-04, skipped) | Info | Bounded to one row per (day, outcome); owner and V2 call |
| `showcase/server/server.js` | 101-105 | Global `cors({origin:true})` also covers `/api/jev` (review IN-05, skipped) | Info | Accepted under D-08; revisit on V2 evidence |
| `extension/ai/jev-state.js` | ~909 | Unshrinkable request gives `invalid_request` where the gateway gives `payload_too_large` (review IN-02, skipped) | Info | No caller yet; owner decision |

No stub, placeholder, empty handler or hard-coded empty data flows to any output.

### Human Verification Required

All items are deferred by owner direction to the Validation Block. None blocks Phase 68 planning.

1. **V2 M-67-02: route, pin and secrets.** Set the `JEV_*` values with `fly secrets set`, with `JEV_ENABLED` off at first.
2. **V2 M-67-03: branch deploy.** Use `flyctl deploy`. The production route should answer the typed `disabled` 503.
3. **V2 M-67-04: switch flip and live smoke.** Time each flip. Run `gateway-smoke.mjs` once per route and compare the model, usage and `usage.cost` shape with the fixtures.
4. **V2 M-67-05: real error mapping.** A wrong key should give `auth_error`; an unknown model should give `unavailable_model`.
5. **V2 M-67-06: body-free production log and ledger.** Check `fly logs` and `report.js --recent 5` / `--days 1` over `fly ssh`.
6. **V2 M-67-07: account settings.** If OpenRouter is chosen, turn prompt logging off and set a credit limit. Set the production daily cap, and keep `JEV_UPSTREAM_TIMEOUT_MS` at or below 2000 (the review's WR-05 bound).
7. **V3 M-67-08/09: live shadow calibration.** Run on the V2 pin, commit the calibrated profile, and record each `not_a_fit` kind.
8. **V4 M-67-10.** Fast mode stays off until the comparative gate passes.
9. **V5 owner decision on review WR-06.** The fix retries a failed spend seed instead of failing closed.
10. **V5 owner decision on review IN-02.** Choose the client reason for an unshrinkable request.
11. **V2 owner decision on review IN-04/IN-05.** Decide on aggregate counting of refusals and 404s, and on CORS for `/api/jev`.
12. **V6 M-67-12: release.** CI's Node 20 job runs the fail-fast chain with 7225 free when the branch is pushed. Nothing reaches `main` before V6.

### Gaps Summary

None. Every claim checked against the code held. The gateway is wired into the real `server.js`. It refuses or answers with exact typed shapes, sends the pinned model and nothing client-supplied upstream, and records body-free accounting. It never leaks the credential, goal, page text or labels into responses, logs, the ledger or the report, including when the upstream echoes the credential. The extension modules are loaded inert and called nowhere, as Phase 67 intends; the API that Phases 68 and 70 will consume exists and is tested. Tighten-only safety is proven against the real breaker, stuck-detection and permission-hook code. What remains is live, production, spend or owner-decision work, which owner direction defers to V2-V6.

Note for Phase 68: `FsbJevPolicy.accept()` can return an accepted `operation` or `target` Choice once a calibrated profile exists. JEV-06 ("cannot authorize an action on its own") then depends on Phase 68 sending every Jev-chosen action through the existing consent, permission and breaker gates. `accept()` is documented as necessary, never sufficient. The Phase 68 verifier should check that call site.

---

_Verified: 2026-10-17T07:23:12Z_
_Verifier: Claude (gsd-verifier)_
