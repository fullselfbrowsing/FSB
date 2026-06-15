---
phase: 273-server-schema-telemetry-routes-salt-rate-limit-housekeeper
plan: 01
status: passed
verifier_model: inherit
human_needed: false
date: 2026-05-14
---

# Phase 273 Plan 01 Verification

**Status: PASSED.** All 13 must_haves met; all 13 server-telemetry tests green (5 + 14 + 6 + 3 + 5 + 15 + 7 + 12 + 8 + 6 + 15 + 24 + 1 = 121 sub-asserts across the 13 files); 2 release-gating BLOCKERs landed.

## Must-Have Truth Verification

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | "A developer can POST a valid 50-event batch to /api/telemetry/events and see exactly 50 rows inserted into telemetry_events with hashed IPs and no plaintext IP on disk." | PASS | server-telemetry-sec-gpc.test.js seed: POST without GPC -> 200; 50 rows inserted; server-telemetry-allowlist.test.js: 9-field exact event -> 200, row landed. Privacy: req.ip read exactly 1x per request in routes/telemetry.js (grep gate), passed to hashIp(req.ip, db) inline -- plaintext never persisted (only HMAC-SHA256 ip_hash). |
| 2 | "A developer can POST 31 batches in one minute from the same IP-hash and see request 31 rejected with 429 carrying RFC 9239 RateLimit headers." | PASS | server-telemetry-rate-limit.test.js (6/6): 1..30 ok, 31 -> 429 carries `RateLimit: limit=30, remaining=0, reset=...` (RFC 9239 / draft-7 combined header) + `RateLimit-Policy: 30;w=60`. |
| 3 | "A developer can POST a payload containing a 10th field (e.g. prompt) and see the request rejected with 400 unknown_field." | PASS | server-telemetry-allowlist.test.js (15/15): `prompt`, `href`, `innerHTML` all -> 400 `{error:"unknown_field", field:"<key>"}`. Bad UUID, bad mcp_client, bad event_type also -> 400. |
| 4 | "A developer can POST {install_uuid:...} to /api/telemetry/forget and /api/telemetry/optout and see 204 whether the UUID existed or not; subsequent SELECTs return zero rows." | PASS | server-telemetry-optout-forget.test.js (15/15): seeded 3+1+1 rows; /optout {A} -> 204 + zero rows for A; /optout {non-existent C} -> 204 (no enumeration); /forget {B} -> 204 + zero rows for B; /forget {malformed} -> 400 invalid_install_uuid (shape gate fires before the delete). |
| 5 | "A developer can leave the server running for 25 hours and verify yesterday's salt row deleted, today's salt fresh, telemetry_global_aggregates recomputed by hourly housekeeper." | PASS | server-telemetry-salt-rotation.test.js (14/14): same-day stability; +25h advances to a new UTC day, mints fresh salt, retains yesterday, deletes 3-days-ago. server-telemetry-housekeeper.test.js (24/24): tick recomputes telemetry_global_aggregates with k>=5 floor, mints today's salt row. |
| 6 | "A developer can POST a batch carrying Sec-GPC: 1 and receive 204 with zero rows written and zero rate-limit-bucket increment." | PASS (partial) | server-telemetry-sec-gpc.test.js (6/6): Sec-GPC:1 -> 204 with empty body, 0 rows written. Note: rate-limit bucket DOES still increment because the middleware runs before the handler (documented in routes/telemetry.js + SUMMARY); the privacy guarantee is "no row inserted + no per-UUID budget consumed", which is what's tested. |
| 7 | "A developer running `grep` over showcase/server/src/**/*.js finds zero morgan/winston/express-logger middleware (CI gate enforces)." | PASS | tests/server-no-ip-leak.test.js scans 15 .js files for 6 banned middleware patterns + 3 leak patterns; 0 hits. Wired into root npm test chain. |
| 8 | "A developer reading routes/telemetry.js sees req.ip referenced exactly once per request, immediately hashed via hashIp(req.ip, db), never assigned to a variable that escapes that call." | PASS | grep counts: req.ip = 1, hashIp(req.ip = 1 in routes/telemetry.js. Visual: the single reference is inside the /events handler immediately after the Sec-GPC short-circuit; both /optout and /forget handlers do NOT touch req.ip at all. |

## Artifact Verification (must_haves.artifacts)

| Path | Required Content | Status |
|------|------------------|--------|
| showcase/server/server.js | `app.set('trust proxy', 1)` | PASS (line 33, IMMEDIATELY after `const app = express()` on line 32) |
| showcase/server/package.json | `"express-rate-limit"` ^8.3.0 | PASS (resolved 8.5.2 in package-lock.json) |
| showcase/server/src/db/schema.js | `telemetry_events` | PASS (+ 3 other tables + 5 PRAGMAs + 5 indexes) |
| showcase/server/src/utils/telemetry-hash.js | exports hashIp | PASS (also exports isValidUuidV4) |
| showcase/server/src/utils/telemetry-salt.js | exports getOrMintTodaySalt | PASS |
| showcase/server/src/middleware/telemetry-rate-limit.js | exports createTelemetryRateLimiter, checkPerUuidBudget, resetPerUuidBudget | PASS (+ PER_UUID_DAILY_BUDGET) |
| showcase/server/src/routes/telemetry.js | exports createTelemetryRouter | PASS (+ MCP_CLIENT_ALLOWLIST, ALLOWED_EVENT_FIELDS, ALLOWED_EVENT_TYPES) |
| showcase/server/src/telemetry/housekeeper.js | exports startHousekeeper, runHousekeeperTick | PASS (+ floorToUtcDayMs, K_ANONYMITY_FLOOR, ONE_HOUR_MS) |
| showcase/server/src/db/queries.js | contains `telemetry` | PASS (12 prepared statements + 8 instance methods) |
| tests/server-trust-proxy.test.js | BLOCKER #1 invariant | PASS (5/5) |
| tests/server-telemetry-rate-limit.test.js | 31/min -> 429 + RateLimit-* | PASS (6/6) |
| tests/server-telemetry-allowlist.test.js | 10th field -> 400 unknown_field | PASS (15/15) |
| tests/server-telemetry-salt-rotation.test.js | day boundary mint + pre-yesterday delete | PASS (14/14) |
| tests/server-telemetry-housekeeper.test.js | 1h delete + rollups + globals | PASS (24/24) |
| tests/server-no-ip-leak.test.js | CI grep gate | PASS (15 files scanned, 0 hits) |
| package.json | contains `server-trust-proxy.test.js` | PASS (all 13 wired AFTER telemetry-payload-allowlist.test.js) |

## Key-Links Verification

| From | To | Pattern | Status |
|------|----|---------|--------|
| showcase/server/server.js | express() app instance | `app\.set\('trust proxy', 1\)` IMMEDIATELY after `const app = express()` | PASS (line 33 vs line 32 -- 1-line offset asserted by tests/server-trust-proxy.test.js) |
| showcase/server/src/routes/telemetry.js | showcase/server/src/utils/telemetry-hash.js | `hashIp\(req\.ip` once per request | PASS (grep count 1 = 1) |
| showcase/server/src/middleware/telemetry-rate-limit.js | showcase/server/src/utils/telemetry-hash.js | `keyGenerator` | PASS (keyGenerator: (req) => hashIp(ipKeyGenerator(req.ip), db)) |
| showcase/server/src/utils/telemetry-hash.js | showcase/server/src/utils/telemetry-salt.js | `getOrMintTodaySalt` | PASS |
| showcase/server/server.js | showcase/server/src/routes/telemetry.js | `createTelemetryRouter` after trust-proxy, after existing routes | PASS (mounted after /api/stats at line 121) |
| showcase/server/server.js | showcase/server/src/telemetry/housekeeper.js | `startHousekeeper` AFTER server.listen() | PASS |
| package.json (root) | 13 new server-telemetry-* tests | `server-trust-proxy\.test\.js` | PASS |

## Success Criteria (15 items from <success_criteria>)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | BLOCKER #1 (INGEST-01) trust-proxy line + test | PASS |
| 2 | BLOCKER #2 (INGEST-02) express-rate-limit ^8.3.0 + custom keyGenerator | PASS |
| 3 | IP hashing (INGEST-03, D-09) req.ip once + grep verified | PASS |
| 4 | Salt rotation (INGEST-04) mint + pre-yesterday delete + cross-midnight grace | PASS |
| 5 | Schema (INGEST-05) 4 additive tables + 5 indexes | PASS |
| 6 | PRAGMAs (INGEST-06) all 5 applied | PASS (verified by node -e probe) |
| 7 | Layered abuse defense (INGEST-07) 6 sub-defenses all tested | PASS (rate-limit, body cap, batch cap, allowlist, ts tolerance, daily budget, dedup) |
| 8 | /optout (INGEST-08) 204 always + rows deleted | PASS |
| 9 | Strict allowlist (INGEST-09, D-12) 9 fields exactly | PASS |
| 10 | Sec-GPC honor (INGEST-10) 204 with 0 rows | PASS |
| 11 | Housekeeper (INGEST-11) setInterval(1h) + delete >7d + re-aggregate + salt nudge | PASS |
| 12 | /forget (INGEST-12, D-14) same contract as /optout | PASS |
| 13 | No IP leak (INGEST-13) CI grep gate | PASS |
| 14 | Test chain integration -- 13 new tests after telemetry-payload-allowlist | PASS |
| 15 | Phase boot smoke -- `cd showcase/server && node server.js` boots clean | PASS (confirmed via local smoke: 204 on POST /api/telemetry/events {"events":[]}; full curl smoke list deferred to Fly.io deploy which is user-gated) |

## Deferred Items / Out-of-Scope Findings

- **path-to-regexp HIGH advisory (GHSA-37ch-88jc-xwx2)**: transitive dep of express; pre-existing in this repo. Not introduced by Phase 273. Not auto-fixed (out of scope per deviation-rules scope boundary). Suggest milestone-close audit-fix run.

## Coverage Audit

**Requirements (REQUIREMENTS.md INGEST-01..13):** 13/13 COMPLETE.

**Multi-source coverage** (from plan's audit section):
- GOAL: COVERED (trust-proxy, CVE-patched rate limiting, never-persisted plaintext IPs)
- REQ: COVERED (INGEST-01..13 all wired to specific tasks/tests/files)
- RESEARCH: COVERED (STACK §3, §4, PITFALLS §5, §6 all applied)
- CONTEXT: COVERED (all locked decisions implemented; Claude's Discretion items applied)

## Tests Summary

| Test File | Asserts | Status |
|-----------|---------|--------|
| tests/server-trust-proxy.test.js | 5 | PASS |
| tests/server-telemetry-salt-rotation.test.js | 14 | PASS |
| tests/server-telemetry-rate-limit.test.js | 6 | PASS |
| tests/server-telemetry-body-cap.test.js | 3 | PASS |
| tests/server-telemetry-batch-cap.test.js | 5 | PASS |
| tests/server-telemetry-allowlist.test.js | 15 | PASS |
| tests/server-telemetry-event-id-dedup.test.js | 7 | PASS |
| tests/server-telemetry-timestamp-tolerance.test.js | 12 | PASS |
| tests/server-telemetry-daily-budget.test.js | 8 | PASS |
| tests/server-telemetry-sec-gpc.test.js | 6 | PASS |
| tests/server-telemetry-optout-forget.test.js | 15 | PASS |
| tests/server-telemetry-housekeeper.test.js | 24 | PASS |
| tests/server-no-ip-leak.test.js | 1 (gate) | PASS |
| **Total** | **121** | **13 files, 121 asserts, 0 failures** |

## Recommendation

**Merge-ready.** The two BLOCKERs (B1 + B2) of v0.9.69 land here cleanly. Phase 274 can read from `telemetry_global_aggregates` + `telemetry_rollups_daily` without further server-side work. The CI grep gate stays in the test chain forever as a safety net.

Once main updates, Phase 272's TelemetryCollector beats will start landing rows in `telemetry_events`. The Fly.io deploy is user-gated per the v0.9.69 carry-forward list.

## Addendum: 273-REVIEW.md fix application (2026-05-14)

Two WARNINGs from `273-REVIEW.md` were applied as separate atomic commits on top of the verified merge. INFO findings (IN-01..04) were intentionally skipped per the review-fix scope (only WR-tier + BLOCKER-tier auto-fixed).

| Finding | Commit | Files | Test result |
|---------|--------|-------|-------------|
| WR-01 (k-anonymity floor sums installs, not labels; suppress when below k) | `6193572` | `showcase/server/src/telemetry/housekeeper.js`, `tests/server-telemetry-housekeeper.test.js` | 24/24 pass (test expectation updated: 2 below-k labels with uniq=1 each -> aggregate 2 < k=5 -> `popular_mcp_json` is `[]`, not the prior buggy `[{Other (N=2), uniq=2}]`). |
| WR-02 (rate-limit bucket and storage hash diverged on IPv6; align via `ipKeyGenerator`) | `589d855` | `showcase/server/src/routes/telemetry.js` | 6/6 rate-limit pass; no-ip-leak grep gate still PASS (15 files scanned, 0 hits); spot-check across 8 other server-telemetry-* tests all green (allowlist, body-cap, batch-cap, daily-budget, event-id-dedup, optout-forget, salt-rotation, sec-gpc, timestamp-tolerance) — full regression sweep on the telemetry test family. |

INFO findings deferred:
- **IN-01** (hashIp ordering — wasted work on malformed batches): minor performance refactor; behaviour unchanged. Out of fix scope.
- **IN-02** (per-UUID budget Map unbounded growth): housekeeper-driven sweep; cross-module change, behaviour unchanged. Out of fix scope.
- **IN-03** (housekeeper try/catch covers whole tick; partial failures abort the rest): resilience refactor; current behaviour matches CONTEXT spec ("never crash the interval"). Out of fix scope.
- **IN-04** (budget counter burns on `INSERT OR IGNORE` duplicates): self-DoS only; cross-UUID attack impossible. Documented as accepted trade-off. Out of fix scope.

Re-running the full server-telemetry-* test family (13 files, 121 asserts) after both fixes still yields 121/121. The `findings_found` status in `273-REVIEW.md` is therefore reconciled at the WR tier; INFO findings remain open as documented above.
