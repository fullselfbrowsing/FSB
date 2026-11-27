---
phase: 67-hosted-jev-gateway-policy-and-shadow-mode
fixed_at: 2026-10-17T07:04:48Z
review_path: .planning/phases/67-hosted-jev-gateway-policy-and-shadow-mode/67-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 10
skipped: 3
status: partial
---

# Phase 67: Code Review Fix Report

**Fixed at:** 2026-10-17T07:04:48Z
**Source review:** .planning/phases/67-hosted-jev-gateway-policy-and-shadow-mode/67-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 13. The scope rule covered all Critical and Warning findings, plus Info findings that were trivial and safe. All 5 Info findings were evaluated.
- Fixed: 10. That is all 8 Critical and Warning findings, plus IN-01 and IN-03.
- Skipped: 3 Info findings (IN-02, IN-04, IN-05). Each would change a behaviour that a plan specified or that depends on V2 evidence.

I checked each finding against the code before fixing it. None was a false positive. Every fix that changes behaviour has a regression test. For CR-01's router check and for WR-01, WR-02 and WR-06, I also ran the new test against the pre-fix source and confirmed that it fails there.

I worked directly on branch `Jev`, as the milestone rules require. No worktree or branch was created. Each fix is one `fix(67): ...` commit with no attribution trailer.

## Fixed Issues

### CR-01: Upstream-controlled `model` string reaches the client response, ledger and log line unchecked (credential echo path)

**Files modified:** `showcase/server/src/jev/upstream.js`, `tests/jev-gateway-upstream.test.js`, `tests/jev-gateway-router.test.js`
**Commit:** d209dfc8
**Applied fix:**
- **The guard.** A new `safeServedModel(model, config.apiKey)` in `callUpstream` sets the served model to null in three cases: it contains the credential, it is a fragment of 8 or more characters of the credential (a long key echoed only up to the 128-character cap), or it matches any scrubber secret shape (`matchesSecret`).
- **Where it applies.** The guard runs on the HTTP-200 error-envelope path, on the `invalid_response` path and on the ok path. All server sinks get the served model from `callUpstream`: the response bodies, `jev_decisions.served_model`, the log line and the report.
- **Ok path.** An otherwise valid answer whose model is refused becomes `invalid_response`.
- **Tests.**
  - The upstream suite covers 6 echo cases: the whole key, a key fragment, the key inside a longer model, a secret-shaped non-key model, an error envelope, and an invalid answer.
  - A new router section checks that the credential never appears in a response body, a log line, a `jev_decisions` row or `jev_daily`.

### WR-01: Case-variant paths bypass the Jev parser exclusion, the 48 KB cap and the D-22 "never reach the generic handler" guarantee

**Files modified:** `showcase/server/src/middleware/global-json-parser.js`, `tests/jev-gateway-router.test.js`
**Commit:** 60e341bc
**Applied fix:**
- `isJevPath` and `isTelemetryPath` now lowercase the path before comparing it, to match Express's case-insensitive mounts.
- **Tests.** The router suite posts malformed JSON and a body over 48 KB to `/API/JEV/decide`, `/Api/Jev/decide` and `/api/JEV/DECIDE`. They now get a typed 400 and a typed 413 from the Jev router, and the generic handler is never hit. Before the fix they got 500 from the generic handler and 400 instead of 413.
- The telemetry body-cap and parser/rate-limit suites still pass.

### WR-02: Server-side page-text truncation can complete an injection phrase that the filter no longer sees

**Files modified:** `showcase/server/src/jev/instrument.js`, `tests/jev-instrument.test.js`
**Commit:** 61d4ba01
**Applied fix:**
- `assembleState` now re-cleans the cut prefix with `filterInjection(scrubText(...))` whenever text was cut. This mirrors `extension/ai/jev-state.js`.
- The byte budget measures the re-cleaned text. The `largestFitting` doc now notes that, because the re-clean can make the check non-monotone, the result still fits but may not be the largest prefix that does.
- **Tests:**
  - a cut ending in "you are now an";
  - every cut around that phrase;
  - a 23-digit run cut to a Luhn-valid 16-digit tail;
  - every byte budget across the phrase window.

  All four failed on the pre-fix code.

### WR-03: Producer/validator parity break on `calibration.profileId` length (server 128, client 64)

**Files modified:** `showcase/server/src/jev/contract.js`, `showcase/server/src/jev/calibration.js`, `extension/ai/jev-state.js`, `tests/jev-gateway-contract.test.js`, `tests/jev-calibration-profile.test.js`, `tests/jev-contract-parity.test.js`
**Commit:** 9f8efd45
**Applied fix:**
- Added `CAPS.profileIdChars: 64` to both CONTRACT copies, so the existing deep-compare parity test now covers it.
- `validateProfile` now rejects any profileId longer than that cap. The client's `validOkResponse` uses `CAPS.profileIdChars` instead of a hard-coded 64.
- I chose 64 rather than widening the client. That keeps the extension's behaviour unchanged, and `run-shadow.mjs` ids are 27 characters.
- **Tests.** The calibration suite rejects 65 and accepts 64. A new parity section checks that a server-valid profile and a client-valid ok body agree for profileId lengths 1, 63, 64, 65, 100 and 128.

### WR-04: `decide()` sends text, labels, title and path off-machine without enforcing that they were sanitized

**Files modified:** `extension/ai/jev-client.js`, `tests/jev-client.test.js`
**Commit:** 6d808c11
**Applied fix:**
- After `validateRequest`, `decide()` now runs `isSanitizedRequest`. Text, title, labels and roles must each be unchanged by both `scrubText` and `filterInjection`. `toOriginPath(origin + path)` must also return exactly the request's origin and path, which rules out an unscrubbed segment, a percent-encoded secret, a dot segment or a backslash.
- A request that fails is answered locally as `invalid_request` and never reaches fetch.
- **Tests.** The client suite covers 8 hand-built cases that pass the schema check and are still refused with no fetch. It also checks that the same raw data passed through `buildRequest` is sent with no raw value on the wire.
- **Test sandbox change.** The vm-context cool-down test sandbox now includes `URL`. It is a standard worker global, and `toOriginPath` needs it at call time.
- **Property check.** I ran an ad-hoc check outside the suite: 3,000 randomized `buildRequest` outputs, including truncated long paths, injection text and secrets. All 3,000 passed the new check and were sent.

### WR-05: Server allows an upstream timeout up to 10 s while the client hard-caps its deadline at 2.5 s

**Files modified:** `showcase/server/src/jev/config.js`, `tests/jev-gateway-config.test.js`, `tests/jev-contract-parity.test.js`
**Commit:** f581394f
**Applied fix:**
- `LIMITS.upstreamTimeoutMsMax` drops from 10000 to 2000. `LIMITS` is now exported, and a comment ties the bound to the client deadline.
- The config bound tests now use 2000 (accepted) and 2001 (falls back).
- **Tests.** A new parity section asserts that `LIMITS.upstreamTimeoutMsMax + 500 <= FsbJevClient.DEFAULT_TIMEOUT_MS`, and that the default timeout sits within the bounds. It also checks that an operator value equal to the client deadline falls back to the default.
- I compared against `FsbJevClient.DEFAULT_TIMEOUT_MS` directly instead of adding a `CLIENT_DEADLINE_MS` to CONTRACT. That avoided a wire-contract change.
- The shadow harness's `JEV_UPSTREAM_TIMEOUT_MS: '2000'` is still valid.

### WR-06: The daily spend ceiling fails open for the rest of the UTC day when the boot-time reseed read fails

**Files modified:** `showcase/server/src/routes/jev.js`, `tests/jev-gateway-router.test.js`
**Commit:** 00c052b6
**Status:** fixed: requires human verification
**Applied fix:**
- **The approach I took.** I used the review's "retry" option rather than failing closed. The accumulator now carries a `seeded` flag. A failed `todaySpendUsd` read is not cached: the fixed `[jev] spend seed failed` line is still logged, the decision is still served, and the next request retries the seed. When a retry succeeds, the ledger amount is added to whatever was accrued in memory while the seed was unreadable. Adding rather than taking the max means an accrual whose ledger write also failed is never lost. The worst case is a double count, which only reaches the ceiling sooner.
- **Why not fail closed.** Plan 67-09 makes "a ledger failure never fails a decision" a must-have. The existing crash-section tests also assert that a db whose `prepare` throws, and a closed db, still serve 200.
- **Test.** A new router section uses a flaky db with a prior same-day accrual above the cap. The first request is served while the db is unreadable. After the db recovers, the next two requests get `spend_cap_reached` and never reach the upstream. On the pre-fix code, all three were served.
- **Needs your decision.** Please confirm that retry, rather than fail-closed, is the policy you want. If the ledger is down for good, the ceiling still only counts spend since the restart, so each restart can allow up to one more `dailyUsdCap`. That was already true before this fix.

### WR-07: `accept()` returns the same "accepted" shape for a completion veto as for a positive flag, with nothing marking that the polarity is inverted

**Files modified:** `extension/ai/jev-policy.js`, `tests/jev-policy-tighten-only.test.js`
**Commit:** 3a757f62
**Applied fix:**
- An accepted Noul verdict now carries `effect`: `veto_completion`, `flag_stuck` or `flag_risk`. They come from a frozen `NOUL_EFFECTS` table.
- The typedef and the `accept()` JSDoc now say that an accepted completion means "not done yet" and must never be read as "done".
- Choice verdicts and `mergeConfirmation` are unchanged.
- **Tests.**
  - The tighten-only suite's exact-shape and expected-verdict checks now include `effect`.
  - A new check runs a 101-point completion grid (21 accepted). Every accepted completion is a `veto_completion` with p at or below its threshold, and nothing in it reads as "done".
  - The `effect` key and its values match no `APPROVAL_KEY_DENYLIST` source.

### IN-01: Router JSDoc says profiles are "never [read] at factory time", but the default parameter reads them at factory time

**Files modified:** `showcase/server/src/routes/jev.js`
**Commit:** 0f2b919c
**Applied fix:** The comment now says profiles are loaded once at factory time (a new profile file needs a restart, which a Fly deploy does) and selected per request after the upstream attempt.

### IN-03: `ORIGIN_RE` rejects valid hostnames that contain `_`

**Files modified:** `showcase/server/src/jev/validator.js`, `extension/ai/jev-state.js`, `tests/fixtures/jev-request-cases.js`, `tests/jev-state.test.js`
**Commit:** 9cd522c7
**Applied fix:**
- Added `_` to the host class of both `ORIGIN_RE` copies, which are kept identical.
- Added a shared valid case, `https://my_app.internal.example`, which the server validator, the client validator, the parity suite and the router all exercise.
- Added a `buildRequest` URL case for the same host.

## Skipped Issues

### IN-02: An unshrinkable request is reported as `invalid_request` on the client but `payload_too_large` on the server

**File:** `extension/ai/jev-state.js:909`
**Reason:** Not a trivial fix, because a plan specified this behaviour. Plan 67-06 says `buildRequest` returns "invalid_request only if the irreducible part alone exceeds the budget", and `tests/jev-state.test.js` asserts it 3 times. Changing the reason would change the client's documented return contract, so the owner should decide. Nothing calls `buildRequest` yet (the shadow tooling does not use it), so there are no tallies to skew today.
**Original issue:** When text, elements and actions are all at their floor and the request is still over budget, `buildRequest` returns `invalid_request`, while the gateway returns `payload_too_large` in the same situation.

### IN-04: Every refused or stray request on the public route does a synchronous SQLite upsert, and 404 probes are counted as `invalid_request`

**File:** `showcase/server/src/routes/jev.js:225-234, 438-445`
**Reason:** Not trivial. It changes the D-24 / Pitfall 13 accounting. 67-05 and 67-09 specify that every refusal bumps its bounded (day, outcome) counter. The fix would need either a new outcome, which changes `AGGREGATE_ONLY_OUTCOMES` and the ledger contract, or dropping `disabled` and 404 counts, which changes what V2 reads. This is a V2 monitoring design call for the owner.
**Original issue:** With the gateway disabled, each POST, and every `GET /api/jev/<anything>` caught by the catch-all, runs a synchronous upsert. Scanner 404s also inflate `invalid_request`.

### IN-05: The global CORS reflects any origin for `/api/jev`, so any web page can spend the shared daily cap from visitors' browsers

**File:** `showcase/server/server.js:101-105`
**Reason:** The review itself says this is not a defect under D-08, and that the change is only worth making "if V2 monitoring shows abuse". It depends on Validation Block evidence (V2), so it is not a trivial fix to make now. WR-01's case-insensitive `isJevPath` is already in place if it is needed.
**Original issue:** `cors({ origin: true })` lets scripts on any site call the public gateway from many browsers and use up the global caps.

## Notes

- **Full test chain.** After the last fix, the full chain ran in tolerant mode (`node /tmp/fsb-tolerant-runner.mjs /tmp/fsb-67-reviewfix`, pretest plus test). All 348 commands exited 0, including `node tests/mcp-install-platforms.test.js`, which was environmental at baseline. The run rewrote `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}`, and I restored them with `git checkout --`. No test command was added, so `package.json` and `REFINEMENT_ROOT_TEST_COMMANDS` are unchanged.
- **Deferred to Validation Block.** None of these fixes needs a live check. WR-05's 2000 ms ceiling should be kept in mind when V2 sets `JEV_UPSTREAM_TIMEOUT_MS`.

---

_Fixed: 2026-10-17T07:04:48Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
