---
phase: 67-hosted-jev-gateway-policy-and-shadow-mode
plan: 04
subsystem: api
tags: [jev, gateway, config, upstream, openrouter, typesafe, fake-upstream, showcase-server]

# Dependency graph
requires:
  - phase: 67-01
    provides: "CONTRACT.GATEWAY_FALLBACK_REASONS, USAGE_SOURCES, COST_SOURCES and KEYS.usage/cost (showcase/server/src/jev/contract.js)"
provides:
  - "loadJevConfig(env, {log}) with ALLOWED_UPSTREAMS, DEFAULTS, positiveSafeIntegerEnv, positiveFiniteEnv (showcase/server/src/jev/config.js)"
  - "callUpstream, classifyStatus, isUnknownModelMessage, validateAnswers, computeUsageAndCost, readBounded, ERROR_SLICE_BYTES, MAX_OK_BODY_BYTES (showcase/server/src/jev/upstream.js)"
  - "Loopback fake upstream startFakeUpstream / synthesizeAnswers (tests/fixtures/jev-fake-upstream.js)"
  - "Documented JEV_* variables in showcase/server/.env.example (JEV_API_KEY empty, JEV_ENABLED=false)"
  - "tests/jev-gateway-config.test.js (345 checks) and tests/jev-gateway-upstream.test.js (468 checks); not yet registered, 67-13 registers them"
affects: [67-09, 67-12, 67-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deep-frozen config with a non-enumerable, non-writable credential (Object.defineProperty before freeze)"
    - "Own-property env reads only; non-string values read as missing; a throwing Proxy reads as missing"
    - "One fetch attempt raced against a deadline promise, so a signal-ignoring fetchImpl or a stalled body still resolves at the deadline"
    - "Bounded body reads through the stream reader with cancel past the cap; every read error collapses to an empty slice"
    - "fallback() maps any reason outside CONTRACT.GATEWAY_FALLBACK_REASONS to server_error, so the module can only ever return locked reasons"

key-files:
  created:
    - showcase/server/src/jev/config.js
    - showcase/server/src/jev/upstream.js
    - tests/fixtures/jev-fake-upstream.js
    - tests/jev-gateway-config.test.js
    - tests/jev-gateway-upstream.test.js
  modified:
    - showcase/server/.env.example

key-decisions:
  - "D-04 Auto-Resolved: route and pin are configuration only (TypeSafe direct or OpenRouter by exact URL plus a route-fitting model); the owner picks the upstream account at V2 with no code change"
  - "The wire body is always {model: config.model, state, questions}: the configured pin is the only model ever sent and extra body keys never reach the upstream"
  - "A 200 whose body holds a non-null error is an upstream failure even if it also holds answers (conservative reading of D-14)"
  - "Served model must match ^[\\x21-\\x7E]{1,128}$ (printable, no whitespace or control characters), so it can be logged and stored verbatim without log injection"
  - "Unusable config gives not_configured and a malformed body or unserializable state gives server_error; neither reaches fetchImpl"

patterns-established:
  - "Plain env objects in every test; process.env is never read by src/jev/config.js (even in comments, for the acceptance grep)"
  - "Fake upstream options are merged by setMode; tests reset every option to undefined before each case"

requirements-completed: [JEV-02, JEV-04, JEV-07]

# Metrics
duration: 11min
completed: 2026-10-16
---

# Phase 67 Plan 04: Jev Gateway Config, Upstream Client and Fake Upstream Summary

**Boot-time Jev config that selects TypeSafe direct or OpenRouter purely from env (with a default-off switch and a credential that never serializes), a single-attempt upstream client that classifies every documented outcome into the locked D-16 reasons with strict answer validation and honest usage/cost, and a loopback fake upstream for every later gateway test.**

## Performance

- **Duration:** about 11 min
- **Started:** 2026-10-17T04:00:05Z
- **Completed:** 2026-10-17T04:11:00Z
- **Tasks:** 2 (TDD, 4 commits)
- **Files:** 5 created, 1 modified

## Accomplishments

- `showcase/server/src/jev/config.js`: `loadJevConfig(env, {log})` reads only the env object it is given and never throws (null, numbers, strings, arrays, throwing Proxies, symbols, BigInts and hostile `toString` values all give a frozen `disabled` or `not_configured` config). The credential is a non-enumerable, non-writable `apiKey`; `JSON.stringify`, `util.inspect`, `Object.keys` and object spread never show it.
- `showcase/server/src/jev/upstream.js`: `callUpstream` makes exactly one POST with only `Authorization`, `Content-Type` and `Accept`, an `AbortController` deadline and `redirect: 'error'`. It resolves (never rejects) to the exact ok or fallback shape from the interfaces block.
- `tests/fixtures/jev-fake-upstream.js`: a loopback server on `127.0.0.1:0` with modes ok-direct, ok-openrouter, error-200, status, hang, echo, garbage and answersFn, a request log, `setMode` and a `close()` that kills hanging sockets. `synthesizeAnswers` answers any instrument-shaped questions object validly.
- `showcase/server/.env.example`: a Jev block after `GITHUB_TOKEN`, with both routes documented, `JEV_ENABLED=false` and `JEV_API_KEY=` empty. `fly.toml` is unchanged and holds no `JEV_` variable.

## Env variables (D-04, D-05, D-06)

| Variable | Default | Accepted values | On a bad value |
| --- | --- | --- | --- |
| `JEV_ENABLED` | off | `true` or `1`, case-insensitive, trimmed | off (`disabled`) |
| `JEV_UPSTREAM_URL` | none (no default route) | exactly `https://api.typesafe.ai/v1/systemone` (route `typesafe`) or `https://openrouter.ai/api/v1/systemone` (route `openrouter`); or a loopback `http(s)://127.0.0.1|localhost|[::1]` URL without userinfo, query or fragment (route `loopback`, refused when `NODE_ENV=production`) | `not_configured` |
| `JEV_MODEL` | none | typesafe `^jev-\d+\.\d+\.\d+$`; openrouter `^typesafe/jev-\d+\.\d+(-\d{8})?$`; loopback either; at most 128 characters; aliases (`jev-latest`, `jev-preview`, `~…`) never match | `not_configured` |
| `JEV_API_KEY` (secret) | none | `^[\x21-\x7E]{8,512}$` | `not_configured` |
| `JEV_INPUT_USD_PER_MTOK` | 0.042 | finite, in (0, 10] | default |
| `JEV_MAX_CONCURRENCY` | 16 | safe integer in [1, 256] | default |
| `JEV_UPSTREAM_TIMEOUT_MS` | 1500 | safe integer in [100, 10000] | default |
| `JEV_DAILY_USD_CAP` | 2 | finite, in (0, 1000] | default |

Status is `disabled` whenever the switch is off, whatever the other values. Enabled with any problem gives `not_configured`, with route, URL and model set to null and `apiKey` null. Log lines (through the injected `log`, default `console`) are fixed strings: `[jev] config invalid: <names>` (warn) or `[jev] gateway enabled route=<route> model=<model>` (log), and nothing when disabled. A numeric fallback is never a problem.

## Final classification table (D-16, 67-RESEARCH Pattern 5)

| Upstream outcome | Reason | `upstreamStatus` |
| --- | --- | --- |
| 200 with valid answers | ok | 200 |
| 200 whose body holds a non-null `error` (with or without `answers`) | `classifyStatus(error.code, error.message)` when the code is an integer, else `upstream_error` | 200 |
| 200 unparseable, empty, an array, over `MAX_OK_BODY_BYTES` (1 MiB), or answers failing validation | `invalid_response` | 200 |
| 200 whose body is still streaming at the deadline | `timeout` | 200 |
| 400 or 404 whose 4 KB slice passes `isUnknownModelMessage` | `unavailable_model` | status |
| other 400 and 404, 413, 415, 422, any other 4xx (418, 499) | `upstream_rejected` | status |
| 401, 403 | `auth_error` | status |
| 402 | `upstream_billing` | status |
| 408 | `timeout` | status |
| 429 | `rate_limited` | status |
| 529 | `upstream_overloaded` | status |
| 500, 502, 503, other 5xx, 1xx/3xx, non-200 2xx (201, 204) | `upstream_error` | status |
| the gateway deadline before a response | `timeout` | null |
| network error, refused connection, fetchImpl throwing or rejecting, a response without an integer status | `upstream_error` | null |
| config not `ok` or missing the credential (guard; the router never calls with one) | `not_configured` | null |
| body or questions not a plain object, or a state that cannot be serialized (guard) | `server_error` | null |

`isUnknownModelMessage`: takes `error.message`, a string `error`, `message` or `detail` from a JSON slice when one is present, else the raw slice; true when it matches `/\bmodel\b/i` and `/unknown|not (a )?valid|not found|does not exist|retired|deprecated|unavailable|no endpoints/i`.

Answer validation (D-14, Pattern 6): top-level `model` matches `^[\x21-\x7E]{1,128}$` and `answers` is a plain object; extra top-level keys (OpenRouter `id`, `provider`) are ignored and never copied. For each asked key (own property, looked up by key): the type equals the asked type; a Choice's `choice` is offered, its probability keys equal the offered keys exactly, each value is finite in [0, 1], the sum is within 0.02 of 1, the choice is an argmax (ties pass) and `confidence` is finite in [0, 1]; a Noul's `noul` is finite in [0, 1]. Any other question type fails closed. Unasked answers and extra answer fields are dropped.

Usage and cost (D-23): usage is `provider` for a non-negative safe-integer `input_tokens`, else `{inputTokens:null, source:'unavailable'}`. Cost is `provider` for a finite `usage.cost >= 0`, else `estimate` = tokens × `inputUsdPerMtok` ÷ 1e6, else `{usd:null, source:'unavailable'}`. The extension cost tracker is never used.

## Task Commits

1. **Task 1: boot-time Jev config, route allowlist, operator switch, secret hygiene and `.env.example`**
   - `5f61f9b7` (test, RED)
   - `a8aa85f6` (feat, GREEN)
2. **Task 2: single-attempt upstream client, strict answer validation, D-16 classification and the loopback fake upstream**
   - `4d8fb412` (test, RED; includes the fake-upstream fixture)
   - `db00e21e` (feat, GREEN)

No refactor commits were needed.

## Files Created/Modified

- `showcase/server/src/jev/config.js`: `loadJevConfig`, `ALLOWED_UPSTREAMS`, `DEFAULTS`, `positiveSafeIntegerEnv(env, name, fallback, min, max)`, `positiveFiniteEnv(env, name, fallback, max)`.
- `showcase/server/src/jev/upstream.js`: `callUpstream`, `classifyStatus`, `isUnknownModelMessage`, `validateAnswers`, `computeUsageAndCost`, `readBounded`, `ERROR_SLICE_BYTES` (4096), `MAX_OK_BODY_BYTES` (1048576).
- `tests/fixtures/jev-fake-upstream.js`: `startFakeUpstream`, `synthesizeAnswers`, plus the constants `MODES`, `DIRECT_MODEL`, `OPENROUTER_MODEL`, `DIRECT_USAGE`, `OPENROUTER_USAGE`, `OPENROUTER_ID`, `OPENROUTER_PROVIDER`.
- `tests/jev-gateway-config.test.js`: exports, switch, routes and pins, loopback, numerics, secret hygiene, log lines, totality and static checks.
- `tests/jev-gateway-upstream.test.js`: classify, unknown-model, validation, usage/cost and readBounded units, then callUpstream against the fake upstream (ok paths and the wire request, usage on the wire, every status, the 200 error envelope, invalid answers, deadline, transport failures, totality, echo mode) and static checks.
- `showcase/server/.env.example`: the Jev block.

### Fake upstream reference (for 67-09 and 67-12)

`startFakeUpstream({mode, status, errorBody, errorCode, errorMessage, answersFn, model, usage, delayMs, top, noul, extra})` resolves to `{url, port, requests, setMode(partial), close()}`. `url` is `http://127.0.0.1:<port>/v1/systemone`; `requests` holds `{method, path, headers, body, rawBody}` per request. In the ok and answersFn modes `answersFn(parsedBody)` returns the `answers` object, `model: null` or `usage: null` omit that field, and `extra` merges extra top-level keys. `'status'` with `status: 200` and a string `errorBody` sends an arbitrary raw 200 body. `setMode` merges, so reset options you no longer want to `undefined`. A new `mode` restarts the echo cycle (400, 401, 500, then a 200 envelope).

## Decisions Made

- **D-04 (Auto-Resolved).** Route and pin are chosen by configuration alone. The owner has not chosen the upstream account; V2 sets `JEV_UPSTREAM_URL`, `JEV_MODEL` and `JEV_API_KEY` for either route without a code change.
- **The pin is what goes on the wire.** `callUpstream` sends `{model: config.model, state: body.state, questions: body.questions}`. A body carrying a different model, or extra keys, cannot change what the upstream sees (T-67-09).
- **Error envelopes win.** A 200 with a non-null `error` is a failure even when `answers` is also present. Falling back is always safe, because the fallback is today's FSB.
- **Deadline semantics.** The fetch and each body read are raced against the deadline, so `callUpstream` resolves on time even when a `fetchImpl` ignores the signal. On a 200, a deadline during the body read gives `timeout`. On a non-200, the known status is still classified.
- **Guards before the attempt.** An unusable config gives `not_configured`, and a malformed body or an unserializable state gives `server_error`. Neither calls `fetchImpl`. The router only calls with an ok config and an instrument-built body, so its rule (one ledger row per `fetchImpl` call, 67-09) is unaffected.
- **Hardening inside the planned rules.** These are listed as Rule 2 additions below:
  - a 128-character cap on the configured model;
  - loopback URLs with userinfo, query or fragment are refused;
  - env reads use own properties only;
  - the served model must be printable ASCII without whitespace.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Served-model charset and configured-model length cap**
- **Found during:** Task 2 (Task 1 for the config cap)
- **Issue:** The plan asks only for a non-empty served model of at most 128 characters. 67-09 records the served model verbatim in the ledger and in a log line, so a newline or control character would allow log injection.
- **Fix:** The served model must match `^[\x21-\x7E]{1,128}$`, or the result is `invalid_response` with `servedModel` null. The configured `JEV_MODEL` is capped at 128 characters.
- **Files modified:** `showcase/server/src/jev/upstream.js`, `showcase/server/src/jev/config.js`
- **Commits:** `db00e21e`, `a8aa85f6`

**2. [Rule 2 - Security] Stricter loopback and env reads**
- **Found during:** Task 1
- **Issue:**
  - A loopback URL could carry userinfo, a query or a fragment.
  - A polluted prototype could supply Jev variables to a plain env object.
- **Fix:**
  - A loopback URL with userinfo, a query or a fragment is refused.
  - Env values are read as own properties only, so inherited values are ignored.
  - Non-string values read as missing.
- **Files modified:** `showcase/server/src/jev/config.js`
- **Commit:** `a8aa85f6`

**3. [Rule 3 - Blocking] Comment wording vs. acceptance greps**
- **Found during:** Tasks 1 and 2
- **Issue:** The acceptance greps for `process\.env` (config.js) and `long-context` (upstream.js) also match comments.
- **Fix:** The comments were reworded so they no longer contain those tokens.
- **Commits:** `a8aa85f6`, `db00e21e`

No architectural change. No package was installed.

## Issues Encountered

None beyond the comment-wording greps above.

## Verification

- `node tests/jev-gateway-config.test.js`: 345 passed, 0 failed.
- `node tests/jev-gateway-upstream.test.js`: 468 passed, 0 failed, in about 1 s (the suite asserts under 15 s).
- Both suites pass on Node 24.14.1 and on the official Node 20.20.2 binary.
- `node tests/server-no-ip-leak.test.js` exits 0 and now scans `config.js` and `upstream.js`.
- Acceptance one-liners:
  - `grep -c "^JEV_API_KEY=$" showcase/server/.env.example` gives 1; `grep -c "JEV_" fly.toml` gives 0.
  - `grep -n "process\.env" showcase/server/src/jev/config.js` prints nothing.
  - The OpenRouter `node -e` one-liner exits 0.
  - The `long-context|danger-zone`, `console\.|err\.message|\.stack` and `estimateCost|CostTracker` greps on `upstream.js` print nothing.
  - The `listen\((7225|7226)` grep on the fixture prints nothing.
- No-retry is proven behaviourally. The fake upstream records exactly one request per call for every status in the table, including 429, 529, 500, 502 and 503.
- Echo mode: across eight calls cycling 400, 401, 500 and the 200 envelope, no result contains the credential, `Bearer`, or the goal, title, text or label markers. A direct probe first proves the fake really echoes them.
- Regression spot-checks, all green:
  - `jev-gateway-contract` (329);
  - `jev-instrument` (149);
  - `jev-calibration-profile` (156);
  - `delegation-phase-contract` (1224);
  - `showcase-route-fallback` (spawns `server.js`);
  - `server-github-poller` (37).
- No real TypeSafe or OpenRouter call happens in any test; everything runs against the loopback fake.
- No full-chain sweep was run. The plan adds new files and a comment-and-variable block in `.env.example`, which no test reads, and nothing requires the new modules yet. `package.json` is untouched (67-13 registers the suites).

## Known Limitations (for V2)

- The unknown-model heuristic needs the word "model". OpenRouter's "No endpoints found for typesafe/jev-1.12" wording, without that word, would classify as `upstream_rejected`, not `unavailable_model`. M-67-05 confirms the real wording on both routes.
- OpenRouter 403 can be a moderation or guardrail block, not only an auth failure (Pitfall 11). It still maps to `auth_error`, as D-16 locks. The upstream status is returned so 67-09 records it in the ledger and V2 can tell the cases apart.

## Deferred to Validation Block

Deferred: M-67-02, M-67-05, M-67-07 (Validation Block V2).
- M-67-02: choose the route and pin, set `JEV_*` with `fly secrets set`, and leave `JEV_ENABLED` off for the first deploy.
- M-67-05: one deliberately wrong key confirms that the real 401/403 gives `auth_error`. One unknown model confirms the `unavailable_model` wording, including the OpenRouter "No endpoints found" case above. Note any OpenRouter 403 moderation case.
- M-67-07: turn OpenRouter prompt logging off, set a per-key credit limit, and set the production `JEV_DAILY_USD_CAP`.

## User Setup Required

None now. The V2 items above are where the credential and route get set.

## Next Phase Readiness

- **67-09 (router)** can:
  - call `loadJevConfig(process.env, {log: console})` in `server.js`;
  - pass the config to `createJevRouter`;
  - call `callUpstream({config, body, fetchImpl, now})` after the semaphore.

  Each call invokes `fetchImpl` exactly once when the config is ok and the body is instrument-built. The fake upstream's echo mode and the `error` envelope cover its log-hygiene tests.
- **67-12 (shadow harness)** can use `startFakeUpstream({mode:'answersFn', answersFn, model:'typesafe/jev-1.13-20260917'})` behind a loopback config pinned to `typesafe/jev-1.13`.
- **67-13** must register `node tests/jev-gateway-config.test.js` and `node tests/jev-gateway-upstream.test.js` in `package.json` and in `REFINEMENT_ROOT_TEST_COMMANDS`.

---
*Phase: 67-hosted-jev-gateway-policy-and-shadow-mode*
*Completed: 2026-10-16*

## Self-Check: PASSED

All five created files and the modified `.env.example` exist. All four task commits (5f61f9b7, a8aa85f6, 4d8fb412, db00e21e) are in history, and none carries an attribution line.
