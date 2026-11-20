---
phase: 67-hosted-jev-gateway-policy-and-shadow-mode
plan: 08
subsystem: extension
tags: [jev, extension, client, fetch, abort, deadline, cool-down, never-rejects, fuzzing, jev-01, jev-02, jev-06, jev-07]

# Dependency graph
requires:
  - phase: 67-06
    provides: "FsbJevState: CONTRACT (FALLBACK_REASONS, GATEWAY_FALLBACK_REASONS, NON_TRANSIENT_REASONS, HTTP_STATUS_BY_REASON, KEYS, BUDGETS), validateRequest, validateGatewayResponse, utf8ByteLength, matchesSecret"
provides:
  - "extension/ai/jev-client.js: FsbJevClient with ENDPOINT, DEFAULT_TIMEOUT_MS, COOLDOWN_MS, MAX_SPEND_COOLDOWN_MS, createJevClient({endpoint, fetchImpl, now, getHashKey, setTimeoutImpl, clearTimeoutImpl}) -> {decide, resetCooldown}, and a default-instance decide"
  - "tests/jev-client.test.js (280 checks, including a 500-case seeded never-rejects fuzz; not yet registered, 67-13 registers it)"
affects: [67-11, 67-12, 67-13, 68, 70]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-composed abort: one internal AbortController, the caller's signal wired in with addEventListener('abort', ..., {once:true}), and a local `why` flag ('deadline' | 'caller') that decides between timeout and aborted, never the error name"
    - "Every wait (hash-key read, fetch, body read) races a one-shot abort gate, so even a fetch that ignores its signal is bounded by the deadline"
    - "Two exact-key result builders (okResult, fail) are the only way a result is made; fail() coerces an unknown reason to invalid_response"
    - "Cool-down as a closure-held {reason, since, until} window; nothing is persisted"
    - "Test harness defaults process.exitCode to 1 until main() completes, so a never-settling promise cannot pass as a clean exit"

key-files:
  created:
    - extension/ai/jev-client.js
    - tests/jev-client.test.js
  modified: []

key-decisions:
  - "Local checks run in a fixed order with no network, timer or listener: request validity (invalid_request, sensitive_goal), the 49,152-byte inbound cap (payload_too_large), a pre-aborted signal (aborted), then the cool-down. A local answer during a cool-down neither reports the cool-down reason nor clears it"
  - "A request whose JSON exceeds CONTRACT.BUDGETS.bodyLimitBytes is answered payload_too_large locally, because the gateway is certain to refuse it with 413 (Research Pitfall 5)"
  - "A failed body read after a status arrived counts as a missing body, so the status table applies: 200 gives invalid_response, 502 gives server_error"
  - "A status that is not an integer in 100..599 counts as no response (network_error, httpStatus null), so httpStatus is always null or a real HTTP status"
  - "Body first means body first: a fully validated ok body is returned even at a non-2xx status, and a validated fallback body wins over the status (429 + {fallback:'upstream_error'} gives upstream_error)"
  - "Response text over 65,536 characters is never parsed; it maps by status"
  - "getHashKey may return a key or a promise of one. A malformed key, a throw or a rejection leaves the header out and the decision still runs (D-07); a hanging read is bounded by the deadline"
  - "The cool-down starts when the non-transient fallback is observed, lasts 60 s (spend_cap_reached: until the next UTC midnight, at most 1 h), is not extended by cooled answers, and ends early if the clock moves backwards. Cooled results carry servedModel null and httpStatus null"

patterns-established:
  - "Mutation-checked client suite: 8 planted regressions (listener not removed, timer not cleared, caller abort mapped to timeout, no cool-down, 60 s spend cool-down, fetch not raced, deadline not clamped, status mapped before body) each turn the suite red"
  - "A vm context whose chrome/browser/localStorage/sessionStorage/indexedDB/caches globals are read traps proves a full load + cool-down + reset cycle reads none of them"

requirements-completed: [JEV-01, JEV-02, JEV-06, JEV-07]

# Metrics
duration: 15min
completed: 2026-10-17
---

# Phase 67 Plan 08: FsbJevClient Never-Rejecting Decision Client Summary

**FsbJevClient sends one bounded, credential-free POST to the fixed `https://full-selfbrowsing.com/api/jev/decide` endpoint. It always resolves to one of the two exact D-15 shapes and never rejects. A 500-case seeded fuzz proves this: fetch throws, rejects, hangs (with and without honouring its signal), returns garbage, unknown keys or approval-like keys, the body read fails, and the clock misbehaves. The client measures its own latency and composes the caller's abort with its own 2,500 ms deadline by hand. It cools down in memory on the six non-transient reasons and leaves no timer or listener behind.**

## Performance

- **Duration:** about 15 min
- **Started:** 2026-10-17T05:06:57Z
- **Completed:** 2026-10-17T05:21:00Z
- **Tasks:** 2 (TDD, 4 commits)
- **Files:** 2 created, none modified

## Accomplishments

- **`extension/ai/jev-client.js`.** One `initFsbJevClient` IIFE with no top-level `const`, `let` or `class`. It sets `root.FsbJevClient` and has a `module.exports` guard. Loading it makes no fetch, starts no timer and reads no browser API. In a bare `vm` context it adds exactly one global.
- **Transport (D-09, JEV-01, JEV-02).** The `init` keys are exactly `method:'POST'`, `credentials:'omit'`, `cache:'no-store'`, `redirect:'error'`, `headers`, `body` and `signal`:
  - `headers` is `{'Content-Type':'application/json'}`, plus `X-FSB-Hash-Key` only for a 64-character lowercase hex key;
  - `body` is `JSON.stringify(request)`;
  - `signal` is the client's own signal, never the caller's.

  There is no query string. fetch is looked up when `decide()` runs, never at load. Node 20.20.2 and 24.14.1 accept this `init` against a loopback server; that was checked before writing, because 67-12 runs this client under Node.
- **Local checks (D-16, D-19).** These need no network, no timer and no listener:
  - a request `validateRequest` rejects gives `invalid_request`;
  - a secret in the goal gives `sensitive_goal`;
  - a request over the 49,152-byte inbound cap gives `payload_too_large`;
  - a pre-aborted signal gives `aborted`;
  - an active cool-down gives the same fallback again;
  - a missing `FsbJevState` gives `invalid_request`.
- **Mapping (D-15, D-16, D-29).** `FsbJevState.validateGatewayResponse(body, request)` maps the body first. The status table is used only when the body is missing, not JSON, over 64 KiB, or not an exact shape. Bodies that fall to the status table include:
  - extra `authorize`, `skipConfirmation` or `approved` keys;
  - a decision set that differs from `request.kinds`;
  - `meetsThreshold: true` while uncalibrated;
  - the client-only `network_error` and `aborted` reasons.

  Error messages, response bodies and headers never reach a result, and the client never logs.
- **Deadline and abort.** The deadline is `min(timeoutMs, 2500)` for a positive finite `timeoutMs`, otherwise 2,500 ms. The `why` flag maps the deadline to `timeout` and a caller abort to `aborted`, and the first cause wins. Every wait races the abort gate:
  - a fetch that ignores its signal still returns `timeout` or `aborted`;
  - a body read that never ends returns `timeout` with the status already received;
  - a `getHashKey` that never resolves returns `timeout` without fetching.

  The caller's listener is removed and the timer is cleared in `finally` on every exit path.
- **Cool-down (D-16, Pitfall 11).** The five reasons `disabled`, `not_configured`, `auth_error`, `upstream_billing` and `unavailable_model` cool down for 60 s. `spend_cap_reached` cools down until the next UTC midnight, capped at 1 h. Transient reasons never cool down. The state is an in-closure `{reason, since, until}`, held per client instance and never stored. `resetCooldown()` clears it.

## Consumer API (Phases 68 and 70)

In the service worker the API is on `globalThis.FsbJevClient`. Under Node, use `require('extension/ai/jev-client.js')`, which resolves `jev-state.js` through `require`. Nothing in the extension calls it in Phase 67; 67-11 loads it inert after `jev-state.js`.

### Entry points

```js
FsbJevClient.ENDPOINT               // 'https://full-selfbrowsing.com/api/jev/decide' (fixed, D-09)
FsbJevClient.DEFAULT_TIMEOUT_MS     // 2500
FsbJevClient.COOLDOWN_MS            // 60000
FsbJevClient.MAX_SPEND_COOLDOWN_MS  // 3600000
FsbJevClient.decide(request, {signal, timeoutMs} = {})   // the default instance
FsbJevClient.createJevClient({endpoint, fetchImpl, now, getHashKey = null, setTimeoutImpl, clearTimeoutImpl} = {})
  // -> {decide, resetCooldown}; every option is for tests and tooling, the extension uses the defaults
```

- `request` is the `request` that `FsbJevState.buildRequest(input)` returns. Keep its `idMap` on the caller side to translate `target` choices back, and never send the `idMap`.
- `timeoutMs` can only shorten the 2,500 ms deadline. `0`, negative numbers, `NaN`, `Infinity` and non-numbers mean 2,500 ms.
- `signal` is optional. An object without `addEventListener`/`removeEventListener` is ignored, except that `aborted === true` still answers `aborted`.
- `getHashKey` (Phase 68 decides whether to pass one) may return a key or a promise of one. Anything other than a 64-character lowercase hex string means no header.

### Result typedefs (verbatim from the module)

```js
/**
 * @typedef {'disabled'|'not_configured'|'invalid_request'|'payload_too_large'|'sensitive_goal'|'busy'|
 *   'spend_cap_reached'|'timeout'|'rate_limited'|'upstream_overloaded'|'auth_error'|'upstream_billing'|
 *   'unavailable_model'|'upstream_rejected'|'upstream_error'|'invalid_response'|
 *   'network_error'|'aborted'|'server_error'} JevFallbackReason
 * @typedef {{choice:string, confidence:number, probabilities:Object<string,number>,
 *   threshold:number|null, meetsThreshold:boolean}} JevChoiceDecision
 * @typedef {{p:number, threshold:number|null, meetsThreshold:boolean}} JevNoulDecision
 * @typedef {{ok:true, decisionId:string, instrumentVersion:string, servedModel:string,
 *   calibration:{status:'calibrated'|'uncalibrated'|'snapshot_changed', profileId:string},
 *   decisions:{operation?:JevChoiceDecision, target?:JevChoiceDecision,
 *              completion?:JevNoulDecision, stuck?:JevNoulDecision, risk?:JevNoulDecision},
 *   usage:{inputTokens:number|null, source:'provider'|'unavailable'},
 *   cost:{usd:number|null, source:'provider'|'estimate'|'unavailable'}, latencyMs:number}} JevOk
 * @typedef {{ok:false, fallback:JevFallbackReason, servedModel:string|null,
 *   httpStatus:number|null, latencyMs:number}} JevFallback
 */
```

- **`JevOk`.** It has exactly the `KEYS.okResponse` keys in that order. `decisions` has exactly the requested kinds. `latencyMs` is measured by the client end to end; it is not the gateway's figure. Every ok result passes `FsbJevState.validateGatewayResponse(result, request)` again.
- **`JevFallback`.**
  - It has exactly the `KEYS.fallbackResponse` keys in that order.
  - `httpStatus` is the status the client received from the gateway. It is null when there was no response: a local check, a cool-down, a network error, or an abort before any headers arrived.
  - `servedModel` comes only from a validated gateway fallback body; otherwise it is null.
  - `latencyMs` is measured by the client.

### The 19 fallback reasons by origin (D-16)

| Origin | Reasons | How the client produces them |
| --- | --- | --- |
| Gateway policy | `disabled`, `not_configured`, `invalid_request`, `payload_too_large`, `sensitive_goal`, `busy`, `spend_cap_reached` | From a typed gateway body. `invalid_request`, `sensitive_goal` and `payload_too_large` are also answered locally, and the last two also come from the status table (4xx, 413). |
| Upstream-derived | `timeout`, `rate_limited`, `upstream_overloaded`, `auth_error`, `upstream_billing`, `unavailable_model`, `upstream_rejected`, `upstream_error`, `invalid_response` | From a typed gateway body. `timeout` also comes from the client's own deadline and from a bare 504. `rate_limited` also comes from a bare 429. `invalid_response` also comes from any body that fails validation at 2xx, 1xx or 3xx. |
| Client-only | `network_error`, `aborted`, `server_error` | `network_error`: fetch threw or rejected, fetch is missing, or a response with no valid status. `aborted`: the caller's signal, before or during the call. `server_error`: a bare 5xx other than 504. The gateway's router-local error handler may also send a typed `server_error` body (D-22), so the gateway may carry it; `network_error` and `aborted` are never accepted from a gateway body. |

### Non-transient reasons (cool-down, memory only)

| Reason | Cool-down |
| --- | --- |
| `disabled`, `not_configured`, `auth_error`, `upstream_billing`, `unavailable_model` | `COOLDOWN_MS` (60 s). `auth_error` stays short on purpose: an OpenRouter 403 may be a moderation block rather than a bad key (Pitfall 11). |
| `spend_cap_reached` | Until the next UTC midnight, when the gateway's daily ceiling resets, at most `MAX_SPEND_COOLDOWN_MS` (1 h). |

- During a cool-down, `decide()` returns `{ok:false, fallback:<same reason>, servedModel:null, httpStatus:null, latencyMs}` without fetching.
- Local checks still answer first during a cool-down: `invalid_request`, `sensitive_goal`, `payload_too_large` and `aborted`.
- The window is per client instance and is never written to storage, so a worker restart forgets it.
- A cooled answer does not extend the window. A clock that moves backwards ends it.
- `resetCooldown()` clears it.

Every other reason is transient and never starts a cool-down.

### Status-only mapping

This table is used only when the body is missing, not JSON, longer than 65,536 characters, or not an exact D-15 shape.

| Received status | Fallback |
| --- | --- |
| 2xx | `invalid_response` |
| 413 | `payload_too_large` |
| 429 | `rate_limited` |
| other 4xx | `invalid_request` |
| 504 | `timeout` |
| other 5xx | `server_error` |
| anything else (1xx, 3xx) | `invalid_response` |
| not an integer in 100..599, or no response at all | `network_error` (httpStatus null) |

A body read that fails after the status arrived counts as a missing body, so the table applies.

### Guidance for Phases 68 and 70

**Every fallback means: fall back to the existing path (D-30).**
- Never retry to clear a threshold, never treat a fallback as a signal, and never let a fallback remove an existing confirmation.
- Phase 68 escalates to the normal LLM step. Phase 70 maps the reason to its `run_task` outcome.
- An ok result is still not permission to act. Pass it to `FsbJevPolicy.accept(result, kind)` and `mergeConfirmation`. With the shipped UNCALIBRATED profile nothing is accepted.

## Task Commits

1. **Task 1: decide() transport, local checks and body-first response mapping**
   - `7bd54a3e` (test, RED)
   - `3db3e84a` (feat, GREEN)
2. **Task 2: deadline and caller-abort composition, cool-down, never-rejects fuzzing and timer hygiene**
   - `ca270044` (test, RED)
   - `a8a2af10` (feat, GREEN)

No refactor commits were needed.

## Files Created/Modified

- `extension/ai/jev-client.js`: the FsbJevClient module, 436 lines including the JSDoc typedef block.
- `tests/jev-client.test.js`: 280 checks over the module API, static source rules, ok bodies, typed fallback bodies, unknown or approval-like bodies, the status-only table, transport options, local checks, transport failures, no logging, deadline and abort, listener and timer hygiene, cool-down, no persistence, the 500-case fuzz, and the Node timer table.

## Decisions Made

- **Local checks before the cool-down.** A caller bug (`invalid_request`) and a secret goal (`sensitive_goal`) are reported the same way whether or not the client is cooling. Those answers leave the cool-down in place.
- **A local 49,152-byte check.** A schema-valid request can exceed the gateway's parser cap (Research Pitfall 5: 254 CJK labels alone are about 76 KB). Sending it would upload page context that the gateway is certain to refuse with 413. The client answers `payload_too_large` itself, using the parity-tested `CONTRACT.BUDGETS.bodyLimitBytes`.
- **A failed body read after a status maps by status.** D-16 says to map by status when the body is missing, and a body that could not be read is missing. The plan's parenthetical "invalid_response" is what the 2xx row gives. A 502 whose body read fails still gives `server_error`, and a 429 still gives `rate_limited`.
- **A garbage status is no response.** A status of `0`, `600`, `'200'` or `200.5` gives `network_error` with `httpStatus: null`. This keeps `httpStatus` either null or a real status.
- **Body first, literally.** A fully validated ok body is returned whatever the status. The gateway always sends ok bodies with 200, and the body is checked against the request, so this costs nothing. It keeps the rule simple.
- **getHashKey may be async.** Phase 68 will probably read the hash key from extension storage, which is asynchronous. A promise is accepted, and the read is raced against the deadline. A failure never blocks the decision, because the key is attribution only (D-07).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Every wait is raced against the abort, not only fetch's own signal**
- **Found during:** Task 2
- **Issue:** The plan composes the caller's signal and the deadline into one AbortController that is passed to fetch. Three waits would still never resolve, and `decide()` would hang its caller:
  - a fetch implementation that ignores its signal;
  - a body read that never ends;
  - a `getHashKey` promise that never settles.
- **Fix:** `untilAborted(promise, gate)` races each wait against a one-shot gate that the same `abortWith(cause)` opens. The losing promise's rejection is always handled, so the fuzz saw no unhandled rejections.
- **Files modified:** `extension/ai/jev-client.js`
- **Commit:** `a8a2af10`

**2. [Rule 2 - Missing critical functionality] Local `payload_too_large` and a response-size bound**
- **Found during:** Task 1
- **Issue:** A schema-valid request can exceed the 49,152-byte inbound cap (Pitfall 5), and the response text was otherwise unbounded before `JSON.parse`.
- **Fix:**
  - A request whose JSON exceeds `bodyLimitBytes` gets `payload_too_large` with no network call.
  - Response text over 65,536 characters is not parsed and maps by status. A real gateway answer is under about 6 KB, even with 255 target options.
- **Files modified:** `extension/ai/jev-client.js`
- **Commit:** `3db3e84a`

**3. [Rule 1 - Bug, test only] A never-settling decide() made the suite exit 0 halfway through**
- **Found during:** Task 2 RED
- **Issue:** Against the Task 1 client, a hanging fetch drained the event loop. Node then exited with code 0, without printing results.
- **Fix:** The suite sets `process.exitCode = 1` at start and only sets it to 0 when `main()` completes. An `exit` hook prints `the suite did not finish`. The "fetch not raced" mutation now fails loudly through this path.
- **Files modified:** `tests/jev-client.test.js`
- **Commit:** `ca270044`

**4. [Rule 1 - Bug, test only] Two test-generator fixes**
- **Found during:** Task 1 GREEN and Task 2 GREEN
- **Issue:**
  - `runOnce` treated an explicit `request: undefined` as "use the default request".
  - The fuzz almost never produced a non-transient gateway body on the shared client, so the cool-down was never exercised; the non-vacuity check correctly failed.
- **Fix:**
  - `runOnce` now uses `hasOwnProperty`.
  - The shared-client stream gets its own share of well-formed gateway fallbacks, and occasionally calls `resetCooldown()` so an hour-long spend cool-down cannot pin it.
  - The final run covers every main outcome plus 45 cooled answers.
- **Files modified:** `tests/jev-client.test.js`
- **Commits:** `3db3e84a`, `a8a2af10`

**5. [Minor] A comment used the forbidden token `serverUrl`**
- The first draft's endpoint comment said "never Sync serverUrl", which the static check rejects. It now says "the Sync server URL". Fixed before the GREEN commit.

## Issues Encountered

None beyond the items above. With the full Task 2 implementation, the suite runs in about 1 s on both Node versions. The fuzz takes about 0.5 to 0.8 s of that.

## Verification

- **`node tests/jev-client.test.js`: 280 passed, 0 failed.**
  - It exits 0 on its own in about 1 s; there is no `process.exit()`, so a dangling timer would show up as a delay.
  - It passes on Node 24.14.1 and on the official Node 20.20.2 binary.
  - Fuzz tally for seed `0x6708`: invalid_request 144, network_error 95, aborted 48, timeout 40, sensitive_goal 32, invalid_response 23, upstream_billing 18, disabled 13, server_error 13, unavailable_model 13, auth_error 12, not_configured 12, ok 10, spend_cap_reached 10, rate_limited 6, payload_too_large 4, upstream_rejected 3, upstream_overloaded 2, busy 1, upstream_error 1. There were 45 cooled answers.
  - There were 0 rejections, 0 synchronous throws, 0 shape violations, 0 invalid requests reaching the network and 0 unhandled rejections.
- **`node --check extension/ai/jev-client.js`** passes.
- **Acceptance greps:**
  - The endpoint literal count is 1.
  - `systemone|api\.typesafe\.ai|chrome\.storage|serverUrl|keepalive|AbortSignal\.any|importScripts|JEV_` is empty.
  - `credentials: ?'omit'` count is 1.
  - `localStorage|chrome\.|indexedDB` is empty.
  - `^(const|let|class) ` is empty.
  - Across `extension/ai/jev-*.js`, `https://` appears exactly once, in `jev-client.js`, as 67-11 requires.
- **Mutation check.** Eight planted regressions each turned the suite red, and the module was restored byte-for-byte afterwards:
  - the listener is not removed;
  - the timer is not cleared;
  - a caller abort maps to `timeout`;
  - there is no cool-down;
  - the spend cool-down is 60 s;
  - fetch is not raced;
  - the deadline is not clamped;
  - the status is mapped before the body.
- **Sibling and neighbouring suites all pass:**
  - `jev-state` 232;
  - `jev-contract-parity` 379;
  - `jev-policy-tighten-only` 29,647;
  - `jev-gateway-contract` 329;
  - `lattice-provider-bridge-smoke` (0 failed);
  - `agent-provider-forbidden-flags`;
  - `version-sync`;
  - `mcp-bridge-topology` 399;
  - `screenshot-uat`;
  - `delegation-phase-contract` 1224;
  - `mcp-settings-route` 409, which walks `extension/`.
- **No test makes a live network call.** `fetchImpl` is injected, or `globalThis.fetch` is swapped for a fake and restored.
- **No full tolerant-chain sweep was run.** The plan only adds two files, nothing in the `npm test` chain loads them, and `package.json` is untouched (67-13 registers the suite). This follows 67-06's precedent. `git status` is clean, and `showcase/angular/public` has no churn.
- **Commits.** All four commits carry no attribution line. STATE.md, ROADMAP.md and REQUIREMENTS.md were left to the orchestrator.

## Known Stubs

None. Nothing in the extension calls FsbJevClient yet, which is intentional (D-17). 67-11 loads it inert, and Phases 68 and 70 call it.

## Threat Model Coverage

| Threat | Disposition | Where it is enforced and tested |
| --- | --- | --- |
| T-67-01 Information disclosure (endpoint) | mitigate | Fixed `ENDPOINT` constant, appearing once. `credentials:'omit'`, `cache:'no-store'`, `redirect:'error'`, no query string. Static greps rule out a storage read, a settings read, a Sync server URL and a key. |
| T-67-07 Information disclosure (secret goal) | mitigate | `validateRequest` runs before anything else. A secret goal gives `sensitive_goal` with no fetch, timer or listener, and the result never echoes the goal. |
| T-67-08 Elevation of privilege (response) | mitigate | Exact-key `validateGatewayResponse`. `authorize`, `skipConfirmation`, `approved`, `override` and unknown keys at any level fall to the status table and never pass through. The two result builders copy only contract keys. |
| T-67-04 Denial of service | mitigate | A 2,500 ms deadline cap that can only be shortened, every wait raced, an in-memory cool-down on non-transient reasons, and a `decide()` that never rejects. |
| T-67-10 Spoofing (open route) | accept | `getHashKey` defaults to null; the header is optional attribution, and a bad key never blocks a decision. |

No new security-relevant surface beyond the plan's threat model was introduced.

## User Setup Required

None.

## Next Phase Readiness

- **67-11.** Load order is state, then client, then policy. The module adds exactly one global, makes no fetch and starts no timer at load. `createJevClient()` makes no call. In a `vm` context with `FsbJevState` loaded, `decide()` of an invalid request resolves to `invalid_request` without touching fetch. Without `FsbJevState`, it also resolves to `invalid_request`.
- **67-12.** Use `createRequire` to call `createJevClient({endpoint: gatewayUrl, fetchImpl?})`. Under Node, `jev-client.js` resolves `jev-state.js` through `require`. Node's built-in fetch accepts the client's `init` on Node 20 and 24. A client instance that receives `disabled`, `not_configured`, `auth_error`, `upstream_billing` or `unavailable_model` cools down for 60 s. A harness that expects to reach the gateway again sooner should call `resetCooldown()` or use a fresh client.
- **67-13.** It must register `node tests/jev-client.test.js` in the `package.json` `test` chain and in `REFINEMENT_ROOT_TEST_COMMANDS`, in the same commit.
- **Phases 68 and 70.** See "Consumer API" above.

---
*Phase: 67-hosted-jev-gateway-policy-and-shadow-mode*
*Completed: 2026-10-17*

## Self-Check: PASSED

- Both created files exist: `extension/ai/jev-client.js` and `tests/jev-client.test.js`.
- All four task commits (`7bd54a3e`, `3db3e84a`, `ca270044`, `a8a2af10`) are in history, and none carries an attribution line.
- There are no TODO, FIXME or placeholder markers in the module.
- STATE.md, ROADMAP.md and REQUIREMENTS.md are untouched.

## Deferred to Validation Block

Nothing in this plan needs a human, a live account, production or spend.
- **M-67-04 (V2).** The first real round trip through the deployed gateway, using the V2 smoke script, which uses this client.
- **M-67-05 (V2).** The real 401/403 → `auth_error` and unknown-model → `unavailable_model` mappings. This includes noting whether an OpenRouter 403 is a moderation block (Pitfall 11), which is why `auth_error` cools down for only 60 s.
- **M-67-12 (V6).** FsbJevClient ships with the 1.0.0 extension release.

Deferred: M-67-04, M-67-05 (V2), M-67-12 (V6)
