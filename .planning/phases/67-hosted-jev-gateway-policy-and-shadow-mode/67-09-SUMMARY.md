---
phase: 67-hosted-jev-gateway-policy-and-shadow-mode
plan: 09
subsystem: api
tags: [jev, gateway, express, router, sqlite, ledger, spend-cap, semaphore, log-hygiene, jev-01, jev-02, jev-03, jev-04, jev-07]

# Dependency graph
requires:
  - phase: 67-01
    provides: "CONTRACT (BUDGETS.bodyLimitBytes, HTTP_STATUS_BY_REASON, KEYS), validateRequest, the shared request cases"
  - phase: 67-03
    provides: "INSTRUMENT_VERSION, INSTRUMENT_HASH, buildUpstreamBody, loadProfiles/selectProfile/applyCalibration (the never-catch throw contract)"
  - phase: 67-04
    provides: "loadJevConfig, callUpstream (never rejects, one fetchImpl call per attempt), the loopback fake upstream"
  - phase: 67-05
    provides: "recordDecision, recordAggregateOnly, todaySpendUsd, dayUtcKey, formatDecisionLog, LEDGER_OUTCOMES, AGGREGATE_ONLY_OUTCOMES, the jev_decisions/jev_daily tables"
  - phase: 67-06
    provides: "FsbJevState.validateGatewayResponse and buildRequest (producer/validator parity)"
provides:
  - "showcase/server/src/routes/jev.js: createJevRouter({db, config, fetchImpl, now, log, profiles, randomUUID, upstreamByteBudget}) (default export plus named export)"
  - "POST /api/jev/decide mounted in showcase/server/server.js, with loadJevConfig(process.env) read once after dotenv"
  - "isJevPath in showcase/server/src/middleware/global-json-parser.js; the global 1 MB parser skips /api/jev"
  - "tests/jev-gateway-router.test.js (343 checks, about 3.9 s; not yet registered, 67-13 registers it)"
  - "tests/jev-gateway-log-hygiene.test.js (32 checks, about 1 s; not yet registered, 67-13 registers it)"
affects: [67-10, 67-11, 67-12, 67-13, 68, 70, V2, V6]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Async Express 4 handler as one try/catch/finally whose catch takes exactly one of three branches keyed on upstreamAttempted and ledgerWritten, inside an inner try that swallows silently"
    - "respond() is the only writer to the response and sends nothing once res.headersSent is true; refuse() is the only pre-upstream responder and only bumps a (day, outcome) counter"
    - "writeLedger() sets ledgerWritten before recordDecision, so a fault after the row never adds a second row, counter or log line"
    - "In-memory spend accumulator seeded once per UTC day from todaySpendUsd; every upstream attempt passes the same capUsd to memory and to its own recordDecision"
    - "Router suites run in production middleware order with a trailing generic error handler that must never fire, a per-request client timeout and a suite watchdog"

key-files:
  created:
    - showcase/server/src/routes/jev.js
    - tests/jev-gateway-router.test.js
    - tests/jev-gateway-log-hygiene.test.js
  modified:
    - showcase/server/server.js
    - showcase/server/src/middleware/global-json-parser.js
    - showcase/server/src/jev/upstream.js

key-decisions:
  - "requestBytes in the ledger, the log's bytes field and the spend upper bound all use the instrument's upstream body bytes (buildUpstreamBody().bytes), the quantity that is charged; elementCount is the validated request's element count"
  - "Spend accrual = the provider or estimated cost when it is > 0, else bytes x inputUsdPerMtok / 1e6, so every upstream attempt moves the accumulator by a positive amount"
  - "The accrual and the aggregate counters use the UTC day of the request start; an accrual whose day the accumulator has already left is recorded on its own day's row only and never inflates the new day"
  - "The 404 catch-all answers a typed invalid_request body whose httpStatus is 404 and counts on (day, invalid_request)"
  - "The config gate serves only a config with status 'ok' plus a usable model, price, cap and concurrency; anything else is not_configured (or disabled when status is 'disabled')"
  - "An upstream reason outside LEDGER_OUTCOMES (reachable only if callUpstream answered not_configured, which the gate rules out) is answered and recorded as server_error"
  - "Spend seeding runs once per UTC day; a failing seed counts 0 for that day and logs one fixed '[jev] spend seed failed' line"

patterns-established:
  - "Mutation-checked router suite: parser errors forwarded to the generic handler, a throwing catch without the inner swallow, and a global parser that does not skip /api/jev each turn it red"
  - "Mutation-checked hygiene suite: a router that logs the request body turns it red"
  - "Static bans read comment-stripped source line by line with line numbers kept (comments blanked, not removed)"

requirements-completed: [JEV-01, JEV-02, JEV-03, JEV-04, JEV-07]

# Metrics
duration: about 20 min
completed: 2026-10-17
---

# Phase 67 Plan 09: Hosted Jev Gateway Router, server.js Wiring and Log Hygiene Summary

**`POST /api/jev/decide` is now a public, crash-safe gateway route on the showcase server. It refuses in a fixed order: the operator switch, a 48 KB parser, the exact-key validator, the byte budget, a reseedable daily spend ceiling and a no-queue semaphore. Then it makes exactly one upstream attempt and answers with typed decisions or typed 502/504 fallbacks. Every upstream attempt writes one body-free ledger row, one spend accrual and one log line; refused traffic writes only a bounded counter. An echoing upstream, console capture and ledger-cell scans prove nothing secret leaks.**

## Performance

- **Duration:** about 20 min
- **Started:** 2026-10-17T05:24:28Z
- **Completed:** 2026-10-17T05:44:00Z
- **Tasks:** 3 (5 commits)
- **Files:** 3 created, 3 modified

## Accomplishments

- **Router (`showcase/server/src/routes/jev.js`).**
  - `createJevRouter` builds `router.post('/decide', configGate, bodyParser, decide)`, a typed `router.all('*')` 404 and a router-local error middleware.
  - No auth middleware, no hash-key lookup and no client-address read. `X-FSB-Hash-Key` only sets `hash_key_present`.
  - The calibration profiles are read per request after the upstream attempt and never at factory time. `selectProfile` and `applyCalibration` have no local catch.
- **Wiring.**
  - `server.js` additions only:
    - two requires after the global-parser require;
    - `const jevConfig = loadJevConfig(process.env, { log: console })` right after `new Queries(db)`;
    - the `/api/jev` mount right after `/api/public-stats` (line 155 against 149), with `fetchImpl: (...args) => globalThis.fetch(...args)`.
  - The trust-proxy line, route sets, relay `maxPayload`, generic handler, housekeeper and shutdown handlers are untouched.
  - `global-json-parser.js` adds `isJevPath` and skips both namespaces. `isTelemetryPath` is still exported.
- **Router suite (343 checks, about 3.9 s).** It runs in production middleware order and covers:
  - the config gate, the open route and the 20-request same-key run;
  - every `INVALID_CASES` entry (86), the oversize, malformed, non-JSON and 404 cases;
  - the byte budget, busy and slot release, the spend ceiling (including the next UTC day, timeout accrual and cost-0 accrual);
  - 21 upstream fallback cases plus an OpenRouter ok answer, and the calibrated and `snapshot_changed` profiles;
  - crash resistance, the post-upstream fault with the restart reseed, branch (c) in both modes, and the write bound;
  - parity: every one of 243 response bodies passes `FsbJevState.validateGatewayResponse`.
- **Log-hygiene suite (32 checks, about 1 s).**
  - An echoing upstream covers every status, garbage, ok and hang paths.
  - It scans 16 responses, 13 captured log lines (2 console, 11 injected) and 281 ledger cells.
  - Invalid-kinds markers (short and 2,000 characters), malformed and oversize bodies holding a secret.
  - Static bans over 11 files, and two spawned `server.js` boots.

## Request pipeline (in order)

| Step | Check | Refusal |
| --- | --- | --- |
| 1 | `configGate`: operator switch and a servable config, before any body parsing | 503 `disabled` / `not_configured` |
| 2 | `express.json({limit: 49152, strict: true})`, then the router-local error middleware | 413 `payload_too_large` (`entity.too.large` or status 413); 400 `invalid_request` (`entity.parse.failed`, `encoding.unsupported`, `charset.unsupported`, `request.aborted`, `request.size.invalid`, `stream.encoding.set`); anything else 500 `server_error` |
| 3 | `validateRequest(req.body)` (a non-JSON content type leaves `{}`) | 400 `invalid_request` / `sensitive_goal` |
| 4 | `buildUpstreamBody(request, {model, byteBudget})` | 413 `payload_too_large` |
| 5 | Spend ceiling: the accumulator for the request's UTC day >= `dailyUsdCap` | 503 `spend_cap_reached` |
| 6 | `acquired = semaphore.tryAcquire()` (no queue) | 503 `busy` |
| 7 | `decisionId = randomUUID()`; `capUsd` = byte upper bound; `upstreamAttempted = true`; one `callUpstream` | 502 upstream-derived / 504 `timeout` |
| 8 | `selectProfile` + `applyCalibration`, exact D-15 ok body, `writeLedger`, `respond(200)` | 500 `server_error` on a fault (branch b or c) |

The slot is released exactly once in `finally`.

## Status table actually served

Every response carries `Cache-Control: no-store` and an exact D-15 body. In a fallback body, `httpStatus` equals the response status.

| HTTP | Body |
| --- | --- |
| 200 | `{ok:true, decisionId, instrumentVersion, servedModel, calibration:{status, profileId}, decisions, usage, cost, latencyMs}` |
| 400 | `invalid_request`, `sensitive_goal` |
| 404 | `invalid_request` (any other method or path under `/api/jev`; `httpStatus: 404`) |
| 413 | `payload_too_large` (parser cap or byte budget) |
| 500 | `server_error` (handler fault, before or after the attempt; unexpected middleware error) |
| 502 | `rate_limited`, `upstream_overloaded`, `auth_error`, `upstream_billing`, `unavailable_model`, `upstream_rejected`, `upstream_error`, `invalid_response` |
| 503 | `disabled`, `not_configured`, `busy`, `spend_cap_reached` |
| 504 | `timeout` (gateway deadline or upstream 408) |

## Ledger policy

- **Where decisionId is drawn.** It is the first statement after the semaphore is acquired, before `callUpstream`. It is returned to the client only inside an ok body.
- **Which requests get a row.** Exactly the requests that reached the upstream attempt (`upstreamAttempted` set immediately before `await callUpstream`). Each gets exactly one `recordDecision(db, row, {capUsd})` through `writeLedger`:
  - `ok`;
  - every upstream-stage fallback: `timeout`, `rate_limited`, `upstream_overloaded`, `auth_error`, `upstream_billing`, `unavailable_model`, `upstream_rejected`, `upstream_error`, `invalid_response`;
  - `server_error` for a fault after `callUpstream`: outer-catch branch (b). That row carries:
    - the upstream result's servedModel, upstreamStatus and upstreamLatencyMs;
    - the ok result's usage and cost (otherwise null and `unavailable`);
    - calibrationStatus null, `INSTRUMENT_VERSION`, and the validated kinds, elementCount and requestBytes;
    - the attempt's refined capUsd.
- **Rows match calls.** `jev_decisions` rows equal `fetchImpl` invocations in every working-db section of the suite. That includes a synchronously throwing `fetchImpl`, which records `upstream_error` while the fake upstream receives nothing.
- **Which requests get only a counter.** These call only `recordAggregateOnly(db, {dayUtc, outcome})`:
  - disabled, not_configured;
  - body-parser rejections and the 404 catch-all;
  - invalid_request, sensitive_goal, budget payload_too_large;
  - spend_cap_reached, busy;
  - a `server_error` raised before the attempt (branch a, for example a throwing `randomUUID`) or by the error middleware.

  The write-bound test sends 60 refusals plus disabled, not_configured, malformed, oversize and two 404s. They add no row and no log line, and they raise only their own (day, outcome) counters.
- **Branch (c).** A fault after the row was written (for example `res.json` throwing before or after sending) adds no row, no counter and no log line. It sends at most one 500, and only while the headers are not out yet.
- **Spend.** The same capUsd moves the in-memory accumulator and `jev_daily.cap_accrued_usd` on every attempt.
  - After a post-upstream fault, `todaySpendUsd` is 0.00002.
  - A fresh router on the same db and UTC day answers its first request `spend_cap_reached` without an upstream call.
- **Ledger failures.** A ledger failure never fails a decision: a throwing or closed db still answers 200. It logs only the fixed line `[jev] ledger write failed`.

## Log-line format

There is one line per ledger row, written through the injected `log.log` after `recordDecision` is attempted (also when it failed):

```
[jev] decision {"decisionId":"<uuid>","outcome":"ok","kinds":["completion","operation","risk","stuck","target"],"elements":2,"bytes":<n>,"servedModel":"jev-1.13.0","calibration":"uncalibrated","inputTokens":392,"usageSource":"provider","costUsd":0.000016464,"costSource":"estimate","upstreamMs":<n>,"gatewayMs":<n>,"upstreamStatus":200,"hashKeyPresent":false}
```

- The key order is fixed by 67-05 `formatDecisionLog`, and `decisionId` comes first, so `node src/jev/report.js --recent N` finds the row.
- The only other lines are the fixed warnings `[jev] ledger write failed` and `[jev] spend seed failed`.
- Boot logs one of `[jev] config invalid: <VAR,...>` and `[jev] gateway enabled route=<route> model=<model>` (67-04).

## Task Commits

1. **Task 1: router factory and integration suite**
   - `c4026848` (test, RED: router module missing)
   - `e30e3de0` (feat, GREEN: 342 passed)
2. **Task 2: server.js and global-parser wiring**
   - `eee11709` (feat; suite moved to production order, 343 passed)
3. **Task 3: log-hygiene proofs**
   - `027fb579` (test, RED: 31 passed, 1 failed on the static `error.message` ban in `upstream.js`)
   - `841d0c06` (refactor, GREEN: 32 passed)

## Sweeps

- **Before any Task 2 edit (BASELINE).** All eight verify-line commands exited 0, so there were no pre-existing failures:
  - `jev-gateway-router`
  - `server-trust-proxy`
  - `showcase-build-smoke`
  - `server-ws-phantomstream-relay-compat`
  - `showcase-route-fallback` (its real-server check ran)
  - `server-telemetry-body-cap`
  - `server-telemetry-parser-rate-limit`
  - `server-no-ip-leak`
- **After the Task 2 edits.** The whole verify line exited 0.
- **At the end, the full chain in tolerant mode** (`node /tmp/fsb-tolerant-runner.mjs /tmp/fsb-67-09-full`). All 334 commands exited 0, `mcp-install-platforms` included, in 4.2 min.
- **Crawler files.** After every sweep, `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}` were restored, and `git status --short showcase/angular/public` was empty before each commit.
- **Other suites.** `node tests/jev-gateway-upstream.test.js` (468) is still green after the `upstream.js` rename.
- **Node 20.** Neither new suite can run locally on the official Node 20 binary, because the `better-sqlite3` ABI is built for Node 24 (known local-only, gotcha 5). The router uses only Node 20 globals (`crypto.randomUUID`, `fetch`, `AbortController`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Renamed the upstream envelope local in `showcase/server/src/jev/upstream.js`**
- **Found during:** Task 3 (RED run).
- **Issue:** The plan's static ban forbids `error.message` in every `src/jev/` file. `upstream.js` (67-04) read `error.message` twice (lines 72 and 427), where `error` was the parsed upstream JSON envelope's `error` field. That value is not an Error object, and it is only used to classify an unknown model and is never logged or returned. It is not a leak, but the ban as written flagged it.
- **Fix:** A pure rename of that local to `envelope` at both sites, plus a one-line comment. Behavior is unchanged: 468/468 upstream checks still pass. This file is outside the plan's `files_modified`.
- **Files modified:** `showcase/server/src/jev/upstream.js`
- **Commit:** `841d0c06`

**2. [Rule 2 - Missing critical functionality] Client timeout and suite watchdog in both suites**
- **Found during:** Task 1 mutation checks.
- **Issue:** A planted fault, a catch block that throws, left a response unanswered and hung the router suite with no failure.
- **Fix:** Each request now has a 5 s client timeout (8 s in the hygiene suite), so a missing answer fails its checks. Each suite also has an unref'd watchdog (60 s and 90 s). The same mutant now fails 6 checks, including `unhandledRejection` at 1.
- **Files modified:** `tests/jev-gateway-router.test.js`, `tests/jev-gateway-log-hygiene.test.js`
- **Commit:** `e30e3de0` (router suite), `027fb579` (hygiene suite)

**3. [Rule 2 - Correctness] `request.size.invalid` maps to 400 `invalid_request`**
- **Found during:** Task 1.
- **Issue:** raw-body raises `request.size.invalid` when the body length disagrees with Content-Length. That is a client error, but the plan's list would have answered it 500.
- **Fix:** It is added to the parser-error types that map to 400. Every other unknown error type is still 500 `server_error`.
- **Files modified:** `showcase/server/src/routes/jev.js`
- **Commit:** `e30e3de0`

### Notes

- **A branch-(b) path no injected fault can reach.** Branch (b)'s own accrual covers only a fault between `callUpstream` returning and the normal-path accrual, or a `callUpstream` rejection. `callUpstream` never rejects, and the normal path accrues right after it returns, so no injected fault reaches that path. The tested post-upstream fault (throwing `profiles`) hits branch (b) with the accrual already made. The code keeps the guard as the plan specifies.

## TDD Gate Compliance

- **Task 1:** `test(67-09)` `c4026848` comes before `feat(67-09)` `e30e3de0`.
- **Task 3:** `test(67-09)` `027fb579` comes before `refactor(67-09)` `841d0c06`. The GREEN step was a pure rename, so its commit is typed `refactor`.
- **Task 2** is `type="auto"` without TDD.

## Known Stubs

None. The route serves real decisions whenever a valid config enables it. With no Jev env it answers `disabled`, which is the intended default (D-06).

## Threat Flags

None beyond the plan's threat model. The new public route (T-67-10, accepted by design) and its mitigations (T-67-01, -03, -04, -05, -11) are what this plan built and tested.

## Deferred to Validation Block

Deferred: M-67-03, M-67-04, M-67-06 (V2), M-67-12 (V6).

- **M-67-03 (V2):**
  - deploy from the branch with `flyctl deploy` (never a push to `main`);
  - with `JEV_ENABLED` still off, confirm that `POST https://full-selfbrowsing.com/api/jev/decide` answers 503 with the typed `disabled` body and that the showcase is unaffected.
- **M-67-04 (V2):**
  - flip `JEV_ENABLED` with `fly secrets set` and time each flip;
  - run one benign smoke request per configured route and confirm the served model, `usage`, `usage.cost` shape and latency against the fixtures.
- **M-67-06 (V2):**
  - read one real `[jev] decision` line in `fly logs`;
  - find its row with `node src/jev/report.js --recent 5` over `fly ssh console`;
  - confirm there is no body, URL, origin, goal, title, text, label, element id, hash key, IP or credential.
- **M-67-12 (V6):** the gateway ships with the milestone release in the showcase server image. Nothing is pushed before V6.

## Next Phase Readiness

- **67-12 (shadow harness)** can mount `createJevRouter({db, config, fetchImpl, now, log, profiles})` in-process in front of the fake upstream, exactly as both suites do, and read `instrumentVersion` from ok bodies.
- **67-13** must register both new suites in the root `package.json` `test` chain and in `REFINEMENT_ROOT_TEST_COMMANDS`:
  - `node tests/jev-gateway-router.test.js`
  - `node tests/jev-gateway-log-hygiene.test.js`
- **Phases 68 and 70** get typed bodies their `FsbJevClient` accepts. The parity check covers all 243 bodies in the router suite.

---
*Phase: 67-hosted-jev-gateway-policy-and-shadow-mode*
*Completed: 2026-10-17*

## Self-Check: PASSED

All three created files and the SUMMARY exist; all five task commits (c4026848, e30e3de0, eee11709, 027fb579, 841d0c06) are in history, and none carries an attribution line.
