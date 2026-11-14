---
phase: 67-hosted-jev-gateway-policy-and-shadow-mode
reviewed: 2026-10-17T06:47:28Z
depth: standard
files_reviewed: 32
files_reviewed_list:
  - extension/ai/jev-client.js
  - extension/ai/jev-policy.js
  - extension/ai/jev-state.js
  - extension/background.js
  - package.json
  - scripts/bench/shadow/answers/fake-upstream.json
  - scripts/bench/shadow/gateway-smoke.mjs
  - scripts/bench/shadow/lib/recorded-answers.mjs
  - scripts/bench/shadow/lib/records.mjs
  - scripts/bench/shadow/lib/score.mjs
  - scripts/bench/shadow/lib/select.mjs
  - scripts/bench/shadow/run-shadow.mjs
  - scripts/bench/shadow/targets.json
  - showcase/server/.env.example
  - showcase/server/server.js
  - showcase/server/src/db/schema.js
  - showcase/server/src/jev/calibration.js
  - showcase/server/src/jev/canonical-json.js
  - showcase/server/src/jev/config.js
  - showcase/server/src/jev/contract.js
  - showcase/server/src/jev/instrument.js
  - showcase/server/src/jev/ledger.js
  - showcase/server/src/jev/profiles/uncalibrated.json
  - showcase/server/src/jev/report.js
  - showcase/server/src/jev/scrubber.js
  - showcase/server/src/jev/upstream.js
  - showcase/server/src/jev/validator.js
  - showcase/server/src/middleware/global-json-parser.js
  - showcase/server/src/routes/jev.js
  - showcase/server/src/telemetry/housekeeper.js
  - tests/delegation-phase-contract.test.js
  - tests/lattice-provider-bridge-smoke.test.js
findings:
  critical: 1
  warning: 7
  info: 5
  total: 13
status: issues_found
---

# Phase 67: Code Review Report

**Reviewed:** 2026-10-17T06:47:28Z
**Depth:** standard
**Files Reviewed:** 32
**Status:** issues_found

## Summary

Scope: the Phase 67 diff `478d91a8..HEAD`, excluding `.planning/` and `showcase/angular/public/`. That covers the hosted gateway (router, config, contract, validator, scrubber, instrument, upstream client, ledger, calibration, report), the three extension modules, the shadow harness and its selection/scoring libraries, and the edits to `server.js`, the global JSON parser, the schema, the housekeeper and the test registrations. The 26 seed records and the recorded-answer file were scanned for secrets and shape. The 17 new test files were checked for registration (each appears exactly once in `package.json` `test` and in `REFINEMENT_ROOT_TEST_COMMANDS`) and for reliability. They are not reviewed as product code.

Most of the gateway is defensive and well structured:
- one upstream attempt, raced against an AbortController deadline;
- `redirect: 'error'`;
- a non-enumerable credential;
- exact-key validators on both sides;
- one ledger row per attempt;
- a router-local error handler that never reads error text.

The tighten-only policy is sound: `max(existing, confirm)`, no Jev path to deny/stop, and hostile extra fields are ignored. Selection and calibration agree on threshold direction. Completion is written as `1 - t` and compared with `p <= t`.

Four findings were confirmed by running small scripts against the real modules:

- **CR-01:** the upstream `model` string flows unchecked into the client response, the ledger and the log line. An upstream that echoes the bearer token there leaks the credential.
- **WR-01:** case-variant paths (`/API/JEV/decide`) skip the Jev parser exclusion. A malformed body then reaches the generic `err.message` logger with its content quoted. This breaks the D-22 guarantee.
- **WR-02:** server-side page-text truncation can complete an injection phrase at the cut. The extension mirror re-cleans its prefix; the server does not.
- **WR-03:** the server accepts calibration `profileId`s up to 128 characters, but the client rejects anything over 64. A valid profile would turn every ok response into `invalid_response`.

## Critical Issues

### CR-01: Upstream-controlled `model` string reaches the client response, ledger and log line unchecked (credential echo path)

**File:** `showcase/server/src/jev/upstream.js:54-63, 431, 435` (sinks: `showcase/server/src/routes/jev.js:209, 342, 352, 372, 381`; `showcase/server/src/jev/ledger.js:140-142, 405`; `showcase/server/src/jev/report.js:207`)

**Issue:** `servedModelOf()` accepts any top-level `model` that is 1-128 printable ASCII characters. That value is used verbatim:
- in the ok body, the fallback body (including the HTTP-200 error-envelope path and the `invalid_response` path), the `jev_decisions.served_model` column, the `[jev] decision` log line and the operator report;
- with no check that it does not contain the configured credential or a secret-shaped token.

D-22's own threat model is an upstream that echoes the `Authorization` header. The echo tests in `tests/fixtures/jev-fake-upstream.js` put the echo only in `error.message` and in body fields, never in `model`.

I confirmed it with a stub `fetchImpl` that returns `{model: <bearer token>, answers: {...}}`. `callUpstream().servedModel === apiKey` held on both the ok path and the `{model, error:{code:502}}` path. `formatDecisionLog` then printed the key. This milestone treats a credential reaching logs, responses or storage as high severity.

**Fix:** Reject a served model that carries the credential or any secret shape before it is returned or stored. Do this in `callUpstream`, where `config.apiKey` is in scope:
```js
// upstream.js
const { matchesSecret } = require('./scrubber');

function safeServedModel(model, apiKey) {
  if (typeof model !== 'string' || !servedModelPattern().test(model)) return null;
  if (typeof apiKey === 'string' && apiKey.length > 0 && model.includes(apiKey)) return null;
  if (matchesSecret(model)) return null;
  return model;
}
// ...use safeServedModel(servedModelOf(parsed), config.apiKey) at 431, and in
// validateAnswers' caller at 435/440; a null served model on an otherwise valid
// 200 must become invalid_response (validateAnswers already requires non-null).
```
Add a fake-upstream echo case in which `model` is the `Authorization` value. Assert it never appears in the response body, the console capture or the ledger row.

## Warnings

### WR-01: Case-variant paths bypass the Jev parser exclusion, the 48 KB cap and the D-22 "never reach the generic handler" guarantee

**File:** `showcase/server/src/middleware/global-json-parser.js:9-11, 21` (with `showcase/server/server.js:155, 317-318`)

**Issue:**
- **Mismatch.** `isJevPath()` compares `req.path` case-sensitively. Express 4 mounts `app.use('/api/jev', ...)` and `router.post('/decide')` case-insensitively by default.
- **What follows.** For `POST /API/JEV/decide`, `/Api/Jev/decide` and similar paths, the global 1 MB parser consumes the body first. The Jev router's 48 KB parser then sees `req._body` and skips parsing, so the route-local cap is bypassed. A malformed body raises a body-parser error that skips the router (its handler has arity 3) and lands in `server.js:317`, which logs `err.message`.
- **Confirmed.** I ran this with the real middleware and the real router. The generic handler logged `Unexpected token 'S', "{"goal": SECRET-sk-"... is not valid JSON`.

The extension's fixed lowercase endpoint never takes this path, and `checkGatewayUrl` requires a lowercase suffix. The contract in the `server.js:151-154` comment and in D-22 is still false for the route. The same latent issue exists for `isTelemetryPath`.

**Fix:** Normalize case in the skip check, or make the mounts case-sensitive:
```js
function isJevPath(reqPath) {
  const p = String(reqPath).toLowerCase();
  return p === '/api/jev' || p.startsWith('/api/jev/');
}
// same treatment for isTelemetryPath
```
Add a router test that posts malformed JSON to `/API/JEV/decide` and asserts a typed 400 and no console output.

### WR-02: Server-side page-text truncation can complete an injection phrase that the filter no longer sees

**File:** `showcase/server/src/jev/instrument.js:156, 200, 324-325`

**Issue:**
- **What the server does.** `prepare()` runs `filterInjection(scrubText(text))` once on the whole text. The byte-budget shrink then takes a raw code-point prefix (`prepared.text.slice(0, textChars)`). A cut can complete a pattern at its edge. For example, `you\s+are\s+now\s+(a|an)\b` does not match "...you are now another..." but does match the prefix ending in "you are now an".
- **The mirror handles this.** The extension mirror does it correctly and says why: `extension/ai/jev-state.js:860-864`, "Re-clean the cut prefix: a cut can complete an injection phrase at its edge."
- **Confirmed.** With a 5,000-character filler and a budget chosen to cut after "an", `state.pageText` ended in `"you are now an"` and `filterInjection(pageText) !== pageText`.

The same edge effect applies to the card pattern: a long digit run truncated to a Luhn-valid 16-digit tail gains a `\b` at the end of the string.

**Fix:** Re-clean the truncated prefix when building state, as the client does:
```js
// assembleState
const cut = prepared.text.slice(0, textChars).join('');
state.pageText = textChars < prepared.text.length ? clean(cut) : cut;
```
Then re-check the byte budget. `largestFitting` already tolerates a non-monotone `fits`, because `good` is only ever set from a passing probe.

### WR-03: Producer/validator parity break on `calibration.profileId` length (server 128, client 64)

**File:** `extension/ai/jev-state.js:573` vs `showcase/server/src/jev/calibration.js:54, 102`

**Issue:**
- **Server side.** `validateProfile` accepts `profileId` values of 1-128 printable characters, and `tests/jev-calibration-profile.test.js:358` only rejects 129. `applyCalibration` returns that id in every ok body.
- **Client side.** `validOkResponse` requires `isStringBetween(calibration.profileId, 1, 64)`.
- **Effect.** A hand-written or V3-edited calibrated profile with a 65-128 character id is valid on the server, but every ok response is rejected by the client. Jev silently falls back to `invalid_response` everywhere, with nothing in the server logs. I confirmed this with a 100-character id: `validateProfile(...).ok === true`, `validateGatewayResponse(...).ok === false`.

`run-shadow.mjs` generates 27-character ids, so the shipped path is safe today. This is exactly the hand-mirrored-bound failure that the parity tests exist to catch.

**Fix:** Pick one bound and enforce it on both sides. For example, change `TOKEN_RE` for `profileId` in `calibration.js` to `{1,64}`, or widen the client to 128. Then add `profileId` max length to the `CONTRACT` caps, so `tests/jev-contract-parity.test.js` deep-compares it.

### WR-04: `decide()` sends text, labels, title and path off-machine without enforcing that they were sanitized

**File:** `extension/ai/jev-client.js:314-322`; `extension/ai/jev-state.js:451-455`

**Issue:**
- **What happens.** `decide()` runs only `FsbJevState.validateRequest`, which checks shape plus `matchesSecret(goal)`. It never checks that `page.text`, `page.title`, `page.path` segments or element labels and roles are in scrubbed and filtered form.
- **Why it matters.** D-19 says a secret in the text or a label is replaced on the extension before anything is sent. The API surface Phases 68 and 70 consume is `decide(request)`, and it will transmit any shape-valid request. A call site that hand-builds a request, or forgets `buildRequest`, sends raw page secrets to FSB's server. The server re-scrubs before upstream, but the secret has already left the machine.
- **Precedent.** `records.mjs:105-121` already implements the right invariant (`isSanitized`) for the seed set.

**Fix:** Enforce the sanitized form at the boundary, at no network cost:
```js
function isSanitized(s) { return state.scrubText(s) === s && state.filterInjection(s) === s; }
function sameOriginPath(reduced, page) { return reduced !== null && reduced.origin === page.origin && reduced.path === page.path; }
// after validateRequest succeeds:
if (!isSanitized(request.page.text) || !isSanitized(request.page.title)
    || request.elements.some((e) => !isSanitized(e.label) || !isSanitized(e.role))
    || !sameOriginPath(state.toOriginPath(request.page.origin + request.page.path), request.page)) {
  return fail('invalid_request', null, null, elapsedSince(started));
}
```

### WR-05: Server allows an upstream timeout up to 10 s while the client hard-caps its deadline at 2.5 s

**File:** `showcase/server/src/jev/config.js:47`; `extension/ai/jev-client.js:74, 101-106`

**Issue:**
- `LIMITS.upstreamTimeoutMsMax` is 10000.
- `deadlineFor()` clamps every caller to `min(timeoutMs, 2500)` and cannot go higher.
- If V2 raises `JEV_UPSTREAM_TIMEOUT_MS` above about 2000 ms (gateway overhead plus Fly edge plus RTT), any upstream answer slower than the client deadline is paid for, accrued against the spend cap and written to the ledger as `ok`, but discarded by the client as `timeout`.
- Nothing ties the two bounds together, and the ledger would show healthy `ok` rows while every install falls back.

**Fix:** Cap the server bound below the client deadline minus a margin. For example, set `upstreamTimeoutMsMax: 2000` and put a shared `CLIENT_DEADLINE_MS` in `CONTRACT`. Then assert `upstreamTimeoutMsMax + margin <= CLIENT_DEADLINE_MS` in the parity test.

### WR-06: The daily spend ceiling fails open for the rest of the UTC day when the boot-time reseed read fails

**File:** `showcase/server/src/routes/jev.js:176-188`

**Issue:** `spendFor()` catches any `todaySpendUsd` error and caches `{dayUtc, usd: 0}` for that day. It never retries. After a restart, a single failed read (a locked or briefly unavailable DB, or a missing table during a migration) forgets everything already accrued that day. The fleet-wide circuit breaker then allows another full `dailyUsdCap` of upstream spend. A spend breaker should fail closed or retry, not reset to zero.

**Fix:** Do not cache a failed seed. Leave `spend.dayUtc` unchanged so the next request retries, and refuse with `spend_cap_reached` (or `server_error`) while the seed is unknown:
```js
function spendFor(dayUtc) {
  if (spend.dayUtc !== dayUtc) {
    let seeded;
    try { seeded = todaySpendUsd(db, dayUtc); } catch (_e) { safeLog('warn', LOG_SPEND_SEED_FAILED); return { dayUtc, usd: Infinity }; }
    spend = { dayUtc, usd: isFiniteNumber(seeded) && seeded > 0 ? seeded : 0 };
  }
  return spend;
}
```

### WR-07: `accept()` returns the same "accepted" shape for a completion veto as for a positive flag, with nothing marking that the polarity is inverted

**File:** `extension/ai/jev-policy.js:40-42, 113-152, 171`

**Issue:**
- **Polarity.** For `completion`, `meetsThreshold` means `p <= threshold`, i.e. "Jev is confident the task is NOT done" (`CONTRACT.NOUL_DIRECTION.completion = 'veto_when_low'`). For `stuck` and `risk`, it means `p >= threshold`.
- **Shape.** `accept()` returns `{accepted:true, kind, p}` in both cases. Its JSDoc describes acceptance as "whether the decision for `kind` may act".
- **Risk.** A Phase 68/70 consumer that reads an accepted `completion` as "Jev confirms done" ends tasks early. That is the one loosening direction JEV-06 forbids, and nothing in the returned value or the docs prevents it. The direction is documented only in `calibration.js` and `select.mjs`.

**Fix:** Make the effect explicit in the verdict, and document it:
```js
var EFFECT = { completion: 'veto_completion', stuck: 'flag_stuck', risk: 'flag_risk' };
return { accepted: true, kind: kind, p: p, effect: EFFECT[kind] };
```
Then add a tighten-only table row asserting that an accepted completion never maps to "done". `effect` does not match `APPROVAL_KEY_DENYLIST`.

## Info

### IN-01: Router JSDoc says profiles are "never [read] at factory time", but the default parameter reads them at factory time

**File:** `showcase/server/src/routes/jev.js:128-129, 140`
**Issue:** `profiles = loadProfiles()` is a default parameter, so it runs when `createJevRouter` is called. Only `selectProfile` runs per request. A profile file added after boot therefore needs a restart, which is fine on Fly, where a deploy restarts. The comment still says the opposite.
**Fix:** Reword the comment to say "loaded once at factory time; selected per request after the upstream attempt".

### IN-02: An unshrinkable request is reported as `invalid_request` on the client but `payload_too_large` on the server

**File:** `extension/ai/jev-state.js:909-910`
**Issue:** When text, elements and actions are all at their floor and the request still exceeds the budget, `buildRequest` returns `invalid_request`. The gateway returns `payload_too_large` in the same situation, so shadow and telemetry tallies attribute size failures to schema errors.
**Fix:** Return `{ ok: false, reason: 'payload_too_large' }` there.

### IN-03: `ORIGIN_RE` rejects valid hostnames that contain `_`

**File:** `showcase/server/src/jev/validator.js:32`; `extension/ai/jev-state.js:319`
**Issue:** WHATWG URL accepts `_` in hosts (for example `https://my_app.internal.example`). `toOriginPath` emits such an origin unchanged, `validateRequest` then rejects it, and every page on that host silently gets `invalid_request`.
**Fix:** Add `_` to the host class in both copies, keeping them in step under the parity test, or document the exclusion.

### IN-04: Every refused or stray request on the public route does a synchronous SQLite upsert, and 404 probes are counted as `invalid_request`

**File:** `showcase/server/src/routes/jev.js:225-234, 438-445`
**Issue:** With the gateway disabled (the production default), each `POST /api/jev/decide` still runs `recordAggregateOnly`. So does every `GET /api/jev/<anything>`, which `router.all('*')` answers. These calls are bounded to one row per (day, outcome), but they are unauthenticated, synchronous writes on the showcase's only DB. Scanner noise on arbitrary paths also inflates the `invalid_request` count that V2 reads as a client-schema signal.
**Fix:** Skip the aggregate bump for the 404 catch-all, or give it its own outcome. Consider not counting `disabled` at all.

### IN-05: The global CORS reflects any origin for `/api/jev`, so any web page can spend the shared daily cap from visitors' browsers

**File:** `showcase/server/server.js:101-105`
**Issue:** D-08 accepts that one abuser can exhaust the global caps, so this is not a defect. Still, `origin: true` lets drive-by scripts on any site do it from many browsers, with no server of their own. The extension's own calls are not subject to CORS, because it has `<all_urls>` host permission.
**Fix:** If V2 monitoring shows abuse, skip the global `cors()` for `/api/jev` (wrap it the way `createGlobalJsonParser` skips paths, using a case-insensitive `isJevPath`). Then no `Access-Control-Allow-Origin` is sent for web origins. A later per-route `cors({ origin: false })` would not help, because the global middleware has already set the headers. This is a cheap reduction that changes nothing for the extension.

---

_Reviewed: 2026-10-17T06:47:28Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
