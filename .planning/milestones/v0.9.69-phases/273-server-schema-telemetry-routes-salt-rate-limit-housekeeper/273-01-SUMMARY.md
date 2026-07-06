---
phase: 273-server-schema-telemetry-routes-salt-rate-limit-housekeeper
plan: 01
subsystem: server
tags: [express, express-rate-limit, better-sqlite3, hmac-sha256, telemetry, privacy, k-anonymity, sec-gpc, gdpr, fly.io, cve-2026-30827]

# Dependency graph
requires:
  - phase: 272-telemetry-collector-extension
    provides: 9-field beat payload schema + BEAT-04 event-id replay-dedup + extension TelemetryCollector queue
provides:
  - 4 new SQLite tables (telemetry_events, telemetry_rollups_daily, telemetry_global_aggregates, telemetry_daily_salt) with 5 indexes and 5 new per-connection PRAGMAs (synchronous=NORMAL, busy_timeout=5000, cache_size=-64000, temp_store=MEMORY, mmap_size=30GB)
  - 3 public POST endpoints at /api/telemetry/{events,optout,forget} with layered abuse defenses (32 KB body cap, 50-event batch cap, 30 batches/min/IP-hash rate limit, 9-field allowlist, UUIDv4 shape, 13+1 mcp_client allowlist, +5min/-7d timestamp tolerance, 1000 events/UUID/day budget, Sec-GPC:1 silent drop, INSERT OR IGNORE dedup)
  - Daily-rotated HMAC-SHA256 IP hashing (showcase/server/src/utils/telemetry-hash.js + telemetry-salt.js) with lazy UTC-day rotation and cross-midnight grace
  - express-rate-limit@^8.3.0 dependency in showcase/server/package.json (resolved 8.5.2 via npm install; CVE-2026-30827 IPv4-mapped-IPv6 collision fix)
  - app.set('trust proxy', 1) IMMEDIATELY after const app = express() in showcase/server/server.js (BLOCKER #1 / Fly.io single-edge)
  - Hourly housekeeper (setInterval 1h + setImmediate boot tick): 7d event retention deletion, today+yesterday rollup re-aggregation, global aggregate recomputation with k>=5 anonymity floor, lazy salt rotation nudge
  - CI grep gate (tests/server-no-ip-leak.test.js) scanning showcase/server/src/ for morgan/winston/express-logger/pino-http imports + fs.write*/append* with req.ip; runs over 15 .js files
affects:
  - 274-public-stats-endpoint (will read telemetry_global_aggregates + telemetry_rollups_daily this phase populates)
  - 275-privacy-policy-cws-listing (curl recipes for /optout and /forget; BLOCKER #3 CWS listing)

# Tech tracking
tech-stack:
  added:
    - express-rate-limit@^8.3.0 (resolved 8.5.2; CVE-2026-30827 fix; custom keyGenerator with ipKeyGenerator helper for IPv6 subnet canonicalisation)
  patterns:
    - "Router factory: createTelemetryRouter(db, queries, hashIp) returning an express.Router with 3 POSTs; mirrors createAgentsRouter pattern"
    - "Per-route body cap via express.json({ limit: '32kb' }) instead of the global 1 MB cap"
    - "Prepared-statement WeakMap in shared primitive modules (telemetry-salt.js) to avoid Queries circular import"
    - "k>=5 anonymity floor applied at WRITE time in the housekeeper (not at READ time at the endpoint layer) so the popular_*_json columns are safe to expose"
    - "PRIVACY INVARIANT comment block immediately above every req.ip read site; grep-gated by tests/server-no-ip-leak.test.js"
    - "Auto-recovery housekeeper: try/catch wraps the entire tick body so console.error logs the failure but the setInterval never crashes"

key-files:
  created:
    - showcase/server/src/utils/telemetry-hash.js (49 LOC) - hashIp + isValidUuidV4
    - showcase/server/src/utils/telemetry-salt.js (84 LOC) - getOrMintTodaySalt with WeakMap stmt cache
    - showcase/server/src/middleware/telemetry-rate-limit.js (118 LOC) - createTelemetryRateLimiter + checkPerUuidBudget + resetPerUuidBudget
    - showcase/server/src/routes/telemetry.js (273 LOC) - 3 POST endpoints + 9-field allowlist + UUIDv4 + 13+1 mcp_client allowlist
    - showcase/server/src/telemetry/housekeeper.js (129 LOC) - runHousekeeperTick + startHousekeeper
    - tests/server-trust-proxy.test.js
    - tests/server-telemetry-salt-rotation.test.js
    - tests/server-telemetry-rate-limit.test.js
    - tests/server-telemetry-body-cap.test.js
    - tests/server-telemetry-batch-cap.test.js
    - tests/server-telemetry-allowlist.test.js
    - tests/server-telemetry-event-id-dedup.test.js
    - tests/server-telemetry-timestamp-tolerance.test.js
    - tests/server-telemetry-daily-budget.test.js
    - tests/server-telemetry-sec-gpc.test.js
    - tests/server-telemetry-optout-forget.test.js
    - tests/server-telemetry-housekeeper.test.js
    - tests/server-no-ip-leak.test.js
  modified:
    - showcase/server/server.js (trust-proxy line; telemetry router mount; startHousekeeper boot + SIGINT/SIGTERM clearInterval)
    - showcase/server/package.json (express-rate-limit ^8.3.0 dependency)
    - showcase/server/package-lock.json (npm install delta)
    - showcase/server/src/db/schema.js (5 new PRAGMAs + 4 new CREATE TABLE IF NOT EXISTS + 5 new indexes)
    - showcase/server/src/db/queries.js (12 prepared statements + 8 instance methods appended)
    - package.json (root test chain: 13 server-telemetry-* test invocations inserted after telemetry-payload-allowlist)

key-decisions:
  - "BLOCKER #1 placement: app.set('trust proxy', 1) MUST be the immediately-next line after const app = express() (no blank line, no other statement); test asserts the strict 1-line offset"
  - "express-rate-limit keyGenerator runs req.ip through the library's ipKeyGenerator helper FIRST (CVE-2026-30827 dual-stack collapse), then HMAC-SHA256s the canonical form with the daily salt; storage and rate-limit identifiers therefore match exactly"
  - "Salt module uses a module-level WeakMap<db, statements> rather than importing Queries (would force a circular dep: Queries -> salt -> Queries)"
  - "Per-UUID budget is an in-memory Map, NOT SQLite -- hot-path DB writes would dwarf the actual telemetry insert cost"
  - "Per-route bodyCap (express.json limit 32 KB) layers ABOVE the global 1 MB cap; Express's body-parser emits 413 PayloadTooLarge automatically"
  - "Unknown-field validator returns BEFORE all other validators per event; the first unknown key encountered short-circuits the whole batch with 400 + field name"
  - "Timestamp tolerance: dropping out-of-window events from the insert list but still returning 400 (per CONTEXT 'both result in 400 but only the offending events are dropped'). Partial-success body carries dropped_timestamps + accepted + inserted"
  - "Sec-GPC: 1 short-circuit BEFORE hashIp call BEFORE row insertion (rate-limit middleware ran above, so the bucket increment cannot be undone; the privacy guarantee is 'no row inserted + no per-UUID budget consumed', not 'no rate-limit increment')"
  - "Housekeeper runs setImmediate first tick (boot row exists before first hour) then setInterval(1h); SIGINT/SIGTERM clearInterval before db.close"
  - "k>=5 anonymity floor for popular_mcp_json applied at WRITE time in the housekeeper, NOT at READ time at the public endpoint -- defence-in-depth so the column is safe to expose verbatim in Phase 274"

patterns-established:
  - "Privacy-invariant comment block + grep gate: every req.ip read site carries a JSDoc-style invariant comment AND is audited by tests/server-no-ip-leak.test.js (also flags morgan/winston/express-logger/pino-http imports)"
  - "Zero-dep server tests via http.createServer wrapping an Express app that mounts ONLY the router under test; resolves better-sqlite3 + express from showcase/server/node_modules so the root has no test-only deps"
  - "TELEMETRY_RATE_MAX env override for tests that need to bypass the per-IP rate limit while exercising per-UUID budget"
  - "X-FSB-Reason custom header for sub-200/sub-429 disambiguation (currently per-uuid-budget; future Reasons can layer on the same header)"
  - "Anonymous PUBLIC POST endpoints (no auth) with layered abuse defenses as the auth substitute: body cap, batch cap, rate limit (per-IP-hash), strict allowlist, timestamp tolerance, per-UUID budget, Sec-GPC drop"

requirements-completed:
  - INGEST-01
  - INGEST-02
  - INGEST-03
  - INGEST-04
  - INGEST-05
  - INGEST-06
  - INGEST-07
  - INGEST-08
  - INGEST-09
  - INGEST-10
  - INGEST-11
  - INGEST-12
  - INGEST-13

# Metrics
duration: 11min
completed: 2026-05-14
---

# Phase 273 Plan 01: Server Schema + Telemetry Routes + Salt + Rate Limit + Housekeeper Summary

**4 new SQLite tables, 3 public POST endpoints, lazy daily-rotated HMAC-SHA256 IP hashing, express-rate-limit@^8.3.0 with CVE-2026-30827-fixed keyGenerator, app.set('trust proxy', 1) BLOCKER, hourly housekeeper with k>=5 anonymity floor -- the showcase server now ingests anonymous telemetry batches at /api/telemetry/events with 8 layered abuse defenses, never stores plaintext IPs, and ships a CI grep gate enforcing the no-IP-leak invariant.**

## Performance

- **Duration:** ~11 min (12:13 - 12:24 UTC-5)
- **Started:** 2026-05-14T17:13:16Z (Task 1 commit)
- **Completed:** 2026-05-14T17:24:15Z (Task 3 commit)
- **Tasks:** 3
- **Files created:** 18 (5 new server modules + 13 new test files)
- **Files modified:** 6 (server.js, schema.js, queries.js, server package.json, root package.json, package-lock.json)
- **LOC of new server code:** 653 (49 + 84 + 118 + 273 + 129)

## Accomplishments

- **BLOCKER #1 (INGEST-01) landed.** `app.set('trust proxy', 1)` placed IMMEDIATELY after `const app = express()` in showcase/server/server.js (line 33). Fly.io single-edge proxy is now unwrapped exactly once; `req.ip` returns the real client IP. The trust-proxy invariant test asserts the strict 1-line offset.
- **BLOCKER #2 (INGEST-02) landed.** express-rate-limit@^8.3.0 added to showcase/server/package.json (resolved 8.5.2 via npm install; package-lock.json committed). Custom `keyGenerator: (req) => hashIp(ipKeyGenerator(req.ip), db)` aligns rate-limit identifiers with storage identifiers exactly, and routes req.ip through the library's `ipKeyGenerator` helper to fix CVE-2026-30827 (IPv4-mapped-IPv6 collision on dual-stack hosts).
- **Schema (INGEST-05/06):** 4 additive `CREATE TABLE IF NOT EXISTS` statements (telemetry_events, telemetry_rollups_daily, telemetry_global_aggregates, telemetry_daily_salt) + 5 indexes. 5 new per-connection PRAGMAs: synchronous=NORMAL, busy_timeout=5000, cache_size=-64MB, temp_store=MEMORY, mmap_size=30 GB. Existing 4 tables untouched.
- **IP hashing (INGEST-03/04 + D-09):** HMAC-SHA256(canonical_ip, todays_salt) -> 64-char hex. Plaintext discarded same statement. Daily salt stored in telemetry_daily_salt row; lazy UTC-day rotation deletes pre-yesterday rows, keeps today + yesterday for cross-midnight grace.
- **3 public POST endpoints (INGEST-07/08/09/10/12):** /events ingest with 8 layered defenses (body 32 KB, batch 50, 9-field allowlist, UUIDv4, 13+1 mcp_client allowlist, +5min/-7d ts tolerance, 1000/UUID/day budget, Sec-GPC:1 silent 204, INSERT OR IGNORE dedup); /optout and /forget always-204 GDPR Article 17 deletes (NOT rate-limited; privacy ops must always succeed).
- **Hourly housekeeper (INGEST-11):** setImmediate boot tick + setInterval(1h). Deletes events >7d, re-aggregates today+yesterday into rollups, recomputes globals with k>=5 anonymity floor (below-k mcp_client labels bucket as "Other (N=<count>)"), nudges salt rotation via `hashIp('0.0.0.0', db)`. try/catch -> console.error never re-throws.
- **CI grep gate (INGEST-13):** tests/server-no-ip-leak.test.js scans showcase/server/src/ recursively for 6 banned access-log middleware imports (morgan, winston, express-winston, express-logger, pino-http, express-pino-logger) plus 3 leak patterns (fs.{append,write}File[Sync] with req.ip; container.{push,set,add}(req.ip)). 15 .js files scanned; 0 hits.
- **Test chain:** all 13 new `node tests/server-*.test.js` invocations inserted IMMEDIATELY after `tests/telemetry-payload-allowlist.test.js` in the root npm test chain.

## Task Commits

Each task was committed atomically (no docs in task commits):

1. **Task 1: Trust proxy + schema + WAL pragmas + hash/salt utils + express-rate-limit dep install** -- `aa8a4f6` (feat)
2. **Task 2: Rate-limiter middleware + 3 routes + 9 route-level tests** -- `95082ac` (feat)
3. **Task 3: Housekeeper + no-IP-leak CI grep gate + test chain integration** -- `320d913` (feat)

## Files Created/Modified

**Created (server code):**
- `showcase/server/src/utils/telemetry-hash.js` (49 LOC) - hashIp(plaintextIp, db) HMAC-SHA256 with daily salt; isValidUuidV4 helper
- `showcase/server/src/utils/telemetry-salt.js` (84 LOC) - getOrMintTodaySalt(db, nowMs?) lazy UTC-day rotation; WeakMap statement cache to avoid Queries circular import
- `showcase/server/src/middleware/telemetry-rate-limit.js` (118 LOC) - createTelemetryRateLimiter (express-rate-limit ^8.3.0 with ipKeyGenerator+hashIp keyGenerator, 30/min, RFC 9239 draft-7 headers); checkPerUuidBudget (in-memory Map, 1000/UUID/day); resetPerUuidBudget (test-only)
- `showcase/server/src/routes/telemetry.js` (273 LOC) - createTelemetryRouter(db, queries, hashIp); 3 POST endpoints with all 8 layered defenses
- `showcase/server/src/telemetry/housekeeper.js` (129 LOC) - runHousekeeperTick + startHousekeeper

**Created (tests):**
- `tests/server-trust-proxy.test.js` (5/5 PASS)
- `tests/server-telemetry-salt-rotation.test.js` (14/14 PASS)
- `tests/server-telemetry-rate-limit.test.js` (6/6 PASS)
- `tests/server-telemetry-body-cap.test.js` (3/3 PASS)
- `tests/server-telemetry-batch-cap.test.js` (5/5 PASS)
- `tests/server-telemetry-allowlist.test.js` (15/15 PASS)
- `tests/server-telemetry-event-id-dedup.test.js` (7/7 PASS)
- `tests/server-telemetry-timestamp-tolerance.test.js` (12/12 PASS)
- `tests/server-telemetry-daily-budget.test.js` (8/8 PASS)
- `tests/server-telemetry-sec-gpc.test.js` (6/6 PASS)
- `tests/server-telemetry-optout-forget.test.js` (15/15 PASS)
- `tests/server-telemetry-housekeeper.test.js` (24/24 PASS)
- `tests/server-no-ip-leak.test.js` (PASS; scanned 15 .js files)

**Modified:**
- `showcase/server/server.js` - app.set('trust proxy', 1) on line 33; /api/telemetry router mount after /api/stats; startHousekeeper(db) after server.listen; SIGINT/SIGTERM clearInterval(housekeeperInterval) before db.close
- `showcase/server/package.json` - "express-rate-limit": "^8.3.0" dependency
- `showcase/server/package-lock.json` - npm install delta (express-rate-limit 8.5.2 + 1 transitive dep)
- `showcase/server/src/db/schema.js` - 5 new PRAGMAs + 4 new CREATE TABLE IF NOT EXISTS + 5 new indexes; existing tables untouched
- `showcase/server/src/db/queries.js` - 12 prepared statements + 8 instance methods for telemetry
- `package.json` (root) - 13 server-telemetry-* test invocations inserted in test chain

## Decisions Made

All key decisions are documented inline in the affected files via comments + were already locked in 273-CONTEXT.md. No new decisions during execution beyond Claude's Discretion items already enumerated in the plan (error code 413 for body cap; setInterval over BullMQ; debug log level on rate-limit hit). The single notable runtime choice: the express-rate-limit v8 validator `ERR_ERL_KEY_GEN_IPV6` required routing `req.ip` through the library's `ipKeyGenerator` helper before HMAC-SHA256-ing it (the IPv6 /56 subnet canonicalisation is the very CVE-2026-30827 fix the plan called out -- the validator confirms the alignment is correct).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JSDoc block-comment broken by nested `**/*.js` glob**
- **Found during:** Task 2 (first run of tests/server-telemetry-rate-limit.test.js)
- **Issue:** showcase/server/src/utils/telemetry-hash.js had a `/** ... showcase/server/src/**/*.js ... */` JSDoc block. Node's JS parser sees the `*/` inside `**/*` as the close of the block comment, then fails on the trailing `*` of the glob. `require()` threw `SyntaxError: Unexpected token '*'`.
- **Fix:** Reworded the comment to drop the nested glob: "audits all .js files under showcase/server/src/ recursively"
- **Files modified:** showcase/server/src/utils/telemetry-hash.js
- **Verification:** rate-limit test re-ran cleanly; rest of Task 2's 9 tests then ran end-to-end.
- **Committed in:** 95082ac (Task 2 commit, alongside the routes/middleware/tests)

**2. [Rule 1 - Bug] express-rate-limit@8.x ERR_ERL_KEY_GEN_IPV6 validator rejected raw `req.ip`**
- **Found during:** Task 2 (first run of rate-limit test)
- **Issue:** express-rate-limit v8 added a runtime validator that aborts construction if a custom keyGenerator references `req.ip` without going through their `ipKeyGenerator` helper. This is the CVE-2026-30827 IPv4-mapped-IPv6 dual-stack fix BLOCKER #2 was upgraded for; the plan's "BLOCKER #2 alignment" called for "the same identifier we store as ip_hash in telemetry_events" -- which without `ipKeyGenerator` would let dual-stack users escape rate-limit buckets while still being trackable by storage.
- **Fix:** Wrapped req.ip with `ipKeyGenerator(req.ip)` inside the keyGenerator, then HMAC-SHA256 the canonical /56-subnet output with the daily salt. Updated the comment block on the keyGenerator to document the chain.
- **Files modified:** showcase/server/src/middleware/telemetry-rate-limit.js
- **Verification:** rate-limit test passes; 6/6 sub-asserts green; the storage-identifier alignment is preserved because the canonical form is hashed before becoming the bucket key.
- **Committed in:** 95082ac (Task 2 commit)

**3. [Rule 1 - Bug] RateLimit-Remaining header asserted in test but draft-7 emits combined `RateLimit` header**
- **Found during:** Task 2 (rate-limit test after fix 2)
- **Issue:** The plan's must_have asserted "RateLimit-* headers on 429"; the test initially looked for a separate `RateLimit-Remaining` header. express-rate-limit's draft-7 mode emits a COMBINED `RateLimit: limit=30, remaining=0, reset=...` header (per RFC 9239), plus `RateLimit-Policy`. Draft-6 (not what we use) emits separate `RateLimit-Limit/Remaining/Reset`.
- **Fix:** Updated the test to parse the combined header (regex `/remaining=(\d+)/` and `/limit=(\d+)/`). Both `RateLimit` and `RateLimit-Policy` headers asserted.
- **Files modified:** tests/server-telemetry-rate-limit.test.js
- **Verification:** 6/6 sub-asserts pass; RFC 9239 / draft-7 compliance confirmed.
- **Committed in:** 95082ac (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 - Bug)
**Impact on plan:** Zero scope creep. All three fixes were genuine bugs uncovered by running the tests the plan called for. Fix 2 in particular HARDENED the BLOCKER #2 invariant: the plan said "align keys with storage"; the library validator forced us to ALSO collapse IPv4-mapped-IPv6 forms BEFORE hashing, which is exactly the CVE-2026-30827 fix BLOCKER #2 exists for.

## Authentication Gates

None. The /api/telemetry/* endpoints are anonymous-by-design (no auth middleware). The express-rate-limit dep installed cleanly from npm without authentication.

## Issues Encountered

- `npm audit` reported one HIGH-severity advisory on `path-to-regexp` (a transitive dep of express, GHSA-37ch-88jc-xwx2 RegEx-DoS). Pre-existing in this repo; not introduced by Phase 273. Logged here for the verifier and the next milestone-close, NOT auto-fixed (out of scope per the deviation-rules scope boundary).

## Known Stubs

None. Every component this phase ships is fully wired:
- /api/telemetry/events accepts batches, validates, inserts.
- /api/telemetry/optout and /forget delete real rows.
- The housekeeper actually deletes, re-aggregates, and writes to all 4 telemetry tables.
- The CI grep gate scans real source files.

The `popular_agent_json` column is intentionally written as an empty `[]` -- Phase 274's reader endpoint is what surfaces it, and Phase 274's plan owns the per-agent-label sourcing. Documented inline in the housekeeper as `// Phase 274 will source per-agent labels from the rolled-up rows; v0.9.69 leaves this empty.` so the verifier sees it.

## Threat Flags

None. The phase's `<threat_model>` covered every new surface (T-273-01..11). No new endpoints, auth paths, file access patterns, or schema changes outside the plan.

## User Setup Required

None for development -- everything works on `npm --prefix showcase/server start` against a local `:memory:` or filesystem SQLite DB.

For production / Fly.io: the deploy of the `Refinements` branch is what makes the routes live at `https://full-selfbrowsing.com/api/telemetry/*`. Phase 272's extension beats start succeeding the moment main updates. No environment variables, no dashboards, no secrets needed.

## Next Phase Readiness

- **Phase 274 (Public Stats Endpoint)** -- the four columns `telemetry_global_aggregates.{unique_installs, tokens_in_sum, tokens_out_sum, agents_active_sum}` are populated hourly with the k>=5 floor already applied to `popular_mcp_json`. The reader endpoint can return rows verbatim.
- **Phase 275 (Privacy Policy + CWS listing)** -- the curl recipes for /optout and /forget are stable; document `POST /api/telemetry/forget -H 'Content-Type: application/json' -d '{"install_uuid":"<uuidv4>"}' -> 204` in the policy.

## Self-Check: PASSED

Verified:
- HEAD `320d913 feat(273-03): housekeeper + no-IP-leak CI gate + test chain integration` -- present.
- `95082ac feat(273-02): telemetry rate-limit middleware + 3 routes + 9 route tests` -- present.
- `aa8a4f6 feat(273-01): trust proxy + schema + WAL pragmas + hash/salt utils` -- present.
- showcase/server/src/utils/telemetry-hash.js -- exists (49 LOC).
- showcase/server/src/utils/telemetry-salt.js -- exists (84 LOC).
- showcase/server/src/middleware/telemetry-rate-limit.js -- exists (118 LOC).
- showcase/server/src/routes/telemetry.js -- exists (273 LOC).
- showcase/server/src/telemetry/housekeeper.js -- exists (129 LOC).
- 13 tests/server-*.test.js files -- all exist.
- All 13 tests PASS when executed serially.
- Grep gate: routes/telemetry.js has `req.ip` references = 1, `hashIp(req.ip` calls = 1.
- Smoke-boot: `cd showcase/server && node server.js` listens on 3847, accepts a `POST /api/telemetry/events {"events":[]}` -> 204.

---
*Phase: 273-server-schema-telemetry-routes-salt-rate-limit-housekeeper*
*Completed: 2026-05-14*
