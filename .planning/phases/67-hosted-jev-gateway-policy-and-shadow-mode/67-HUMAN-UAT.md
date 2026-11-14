---
status: deferred
phase: 67-hosted-jev-gateway-policy-and-shadow-mode
source: [67-VERIFICATION.md]
started: 2026-10-17T07:25:26Z
updated: 2026-10-17T07:25:26Z
deferred_to: milestone-end Validation Block (V2, V3, V4, V5, V6)
verified_head: 9cd522c7
baseline_pin: 8a058bdf
---

## Current Test

[deferred: every item runs in the v1.0.0 milestone-end Validation Block; see .planning/STATE.md -> Decisions]

These items come from the `human_verification` list in `67-VERIFICATION.md` (status `human_needed`, 64/64 must-haves verified for the automated portion: 5/5 roadmap success criteria and 59/59 plan truths, 0 failed). Automated evidence does not count as a result here. That evidence covers the 14 registered Jev commands on Node 24, the non-SQLite suites on Node 20.20.2, the verifier's spawned `server.js` runs against an echoing fake upstream (9 typed outcomes, 0 marker leaks), the default-off/alias/lookalike/busy/spend-cap limits run and the 200,000-case tighten-only fuzz. Only a human run in the Validation Block may change a `result` field.

## Tests

### 1. [V2] M-67-02: upstream route, pin and server-side secrets
validation_block: V2
expected: Choose the upstream route and the model pin. Set `JEV_API_KEY`, `JEV_UPSTREAM_URL`, `JEV_MODEL`, `JEV_DAILY_USD_CAP` and the other `JEV_*` values with `fly secrets set` (never `fly.toml` `[env]`), with `JEV_ENABLED` off for the first deploy. `fly secrets list` shows the names only, and the chosen route and pin are recorded.
result: [pending]

### 2. [V2] M-67-03: branch deploy answers the typed disabled fallback
validation_block: V2
expected: Deploy from the `Jev` branch with `flyctl deploy` (never a push to `main`). `POST https://full-selfbrowsing.com/api/jev/decide` returns 503 with the typed `{ok:false, fallback:'disabled', ...}` body, and the showcase site is unaffected.
result: [pending]

### 3. [V2] M-67-04: operator switch flip and live gateway smoke
validation_block: V2
expected: Flip `JEV_ENABLED` on and off with `fly secrets set` and record the time to effect of each flip. Run `node scripts/bench/shadow/gateway-smoke.mjs --gateway https://full-selfbrowsing.com/api/jev/decide` once per configured route. The served model string, `usage`, `usage.cost` (OpenRouter) and latency match the shape of the fake-upstream fixtures. This step incurs real spend.
result: [pending]

### 4. [V2] M-67-05: real upstream error mapping
validation_block: V2
expected: Send one request with a deliberately wrong key and one with an unknown model against the real upstream. The ledger records `auth_error` and `unavailable_model`. This confirms the real 401/403 and model-error wording behind research assumptions A1/A2; the fixtures model only the documented contract.
result: [pending]

### 5. [V2] M-67-06: body-free production log, ledger and report
validation_block: V2
expected: Read one real `[jev] decision` line in `fly logs`, then run `fly ssh console -C "node src/jev/report.js --recent 5"` and `--days 1`. None of the body, URL, origin, goal, title, text, label, element id, hash key, IP or credential appears in the log line, the ledger row or the report.
result: [pending]

### 6. [V2] M-67-07: third-party account settings, daily cap and timeout bound
validation_block: V2
expected: If OpenRouter is chosen, prompt logging is OFF and a per-key credit limit is set. The production `JEV_DAILY_USD_CAP` is set and its value recorded. `JEV_UPSTREAM_TIMEOUT_MS` stays at or below 2000 (the review WR-05 bound, below the client deadline).
result: [pending]

### 7. [V3] M-67-08, M-67-09: live shadow calibration on the V2 pin (JEV-05)
validation_block: V3
expected: Gather enough labelled step records (the 25-record seed set is `not_a_fit` by construction). Run `run-shadow.mjs --gateway <deployed>` against exactly the V2 pin and select thresholds with the committed `scripts/bench/shadow/targets.json`. Commit the calibrated profile under `showcase/server/src/jev/profiles/`, keyed by (pin, `INSTRUMENT_HASH`, snapshot), so that `validateProfile` accepts it. Record every `not_a_fit` kind, then re-run `jev-calibration-profile` and `jev-policy-tighten-only`. Until this runs, every decision stays uncalibrated and below threshold.
result: [pending]

### 8. [V4] M-67-10: fast mode stays default-off until the comparative gate passes
validation_block: V4
expected: No Jev decision acts for users, and fast mode stays default-off, until the V4 comparative gate passes. Record the V4 gate result and the owner's sign-off.
result: [pending]

### 9. [V5] Owner decision: review WR-06, the spend-seed policy
validation_block: V5
expected: The fix (commit `00c052b6`, `showcase/server/src/routes/jev.js`) retries a failed `todaySpendUsd` read on the next request and still serves the decision instead of failing closed. A successful retry adds the ledger amount to the in-memory accrual, so the worst case is a double count that reaches the ceiling sooner. Either accept the retry, or ask for fail-closed. Fail-closed would contradict the 67-09 must-have "a ledger failure never fails a decision".
result: [pending]

### 10. [V5] Owner decision: review IN-02 (skipped), the reason for an unshrinkable request
validation_block: V5
expected: `buildRequest` (`extension/ai/jev-state.js:909`) returns `invalid_request` when text, elements and actions are all at their floor and the request is still over budget, while the gateway returns `payload_too_large` in the same case. Either keep the documented 67-06 contract (asserted 3 times in `tests/jev-state.test.js`), or change the client reason. Nothing calls `buildRequest` yet.
result: [pending]

### 11. [V2] Owner decision: review IN-04 and IN-05 (skipped), refusal accounting and CORS on /api/jev
validation_block: V2
expected: After V2 monitoring, decide two things. First, IN-04: every refusal and every catch-all 404 probe does a synchronous `jev_daily` upsert (`showcase/server/src/routes/jev.js:225-234, 438-445`), and scanner 404s inflate `invalid_request`. Choose whether to skip the 404 and `disabled` counts, which would change the 67-05/67-09 accounting contract. Second, IN-05: the global `cors({origin:true})` (`showcase/server/server.js:101-105`) lets any web page call `/api/jev` and spend the shared daily cap. Choose whether to bypass CORS for the route. D-08 accepts global-cap abuse, so change this only if V2 shows abuse.
result: [pending]

### 12. [V6] M-67-12: release
validation_block: V6
expected: When the branch is pushed, CI's Node 20 job runs the 14 registered Jev commands fail-fast with port 7225 free, and CI is green. Nothing from Phase 67 reaches `origin/main` before V6, and merging waits for V4's gate and the owner's approval.
result: [pending]

## Summary

total: 12
passed: 0
issues: 0
pending: 12
skipped: 0
blocked: 0

## Gaps

[none yet; verification found no failed truths. Non-blocking follow-up for Phase 68: once a calibrated profile exists, `FsbJevPolicy.accept()` can return an accepted `operation` or `target` Choice. JEV-06 ("cannot authorize an action on its own") then depends on Phase 68 sending every Jev-chosen action through the existing consent, permission and breaker gates; `accept()` is necessary, never sufficient. The Phase 68 verifier should check that call site.]
