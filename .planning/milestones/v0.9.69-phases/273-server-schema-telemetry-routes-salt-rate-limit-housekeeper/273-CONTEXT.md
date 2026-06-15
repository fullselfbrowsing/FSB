# Phase 273: Server Schema + Telemetry Routes + Salt Rotator + Rate Limiter + Housekeeper - Context

**Gathered:** 2026-05-14
**Status:** Planned (273-01-PLAN.md, 3 tasks, wave 1)
**Milestone:** v0.9.69 Anonymous Telemetry Pipeline + Showcase Dashboard Streaming Fix
**Requirements:** INGEST-01..13
**Blockers:** B1 (trust proxy), B2 (express-rate-limit CVE)

<domain>
## Phase Boundary

The showcase server accepts anonymous telemetry batches with three release-gating safeguards: trusted-proxy IP handling, CVE-patched rate limiting, and never-persisted plaintext IPs. The biggest single phase in v0.9.69. The 3 BLOCKERs (2 in this phase + 1 in Phase 275) gate the CWS release.

**In scope:**
- BLOCKER #1: `app.set('trust proxy', 1)` in `showcase/server/server.js` BEFORE any route mount (Fly.io single-edge depth).
- BLOCKER #2: `express-rate-limit@^8.3.0` in `showcase/server/package.json` (CVE-2026-30827 fix for IPv4-mapped-IPv6 collision on dual-stack hosts).
- New SQLite schema additions (4 tables):
  - `telemetry_events` — raw events; 7-day retention; columns: event_id (UNIQUE), install_uuid, ts_minute, mcp_client, model, tokens_in, tokens_out, active_agent_count, event_type, ip_hash, received_at.
  - `telemetry_rollups_daily` — per-UUID per-day aggregates; 365-day retention.
  - `telemetry_global_aggregates` — one row per day; lifetime retention; powers `/stats`.
  - `telemetry_daily_salt` — daily-rotated HMAC-SHA256 salt; today + yesterday only; older salts deleted on each rotation.
- SQLite pragmas on every connection: `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000`, `cache_size=-64000`, `temp_store=MEMORY`, `mmap_size=30000000000`.
- New `showcase/server/src/utils/telemetry-hash.js`: HMAC-SHA256(IP + daily_salt) -> hex string. Reads salt from DB; never persists plaintext IP.
- New `showcase/server/src/utils/telemetry-salt.js`: lazy UTC-daily rotation. On every hash call, check today's salt exists (read from telemetry_daily_salt); if not, mint `crypto.randomBytes(32)`, INSERT, delete salts older than yesterday.
- New `showcase/server/src/middleware/telemetry-rate-limit.js`: express-rate-limit instance with custom `keyGenerator` returning `hashIp(req.ip, db)` AND a separate per-UUID daily budget check (1000 events/day/UUID).
- New `showcase/server/src/routes/telemetry.js`: 3 unauthenticated POST endpoints behind the rate limiter:
  - `POST /api/telemetry/events` — ingest batch. Body: `{events: [...]}`. Cap 50 events / batch. Cap 32KB body. Strict allowlist (9 fields exactly). INSERT OR IGNORE on UNIQUE event_id. Timestamp tolerance: drop `ts > now+5min` OR `ts < now-7d`. Daily budget: 1000 events/UUID. Sec-GPC=1 header -> 204 silent drop.
  - `POST /api/telemetry/optout` — body `{install_uuid}`. Delete from telemetry_events + telemetry_rollups_daily. 204 always (no enumeration).
  - `POST /api/telemetry/forget` — same contract as /optout (GDPR Article 17). 204 always.
- New `showcase/server/src/telemetry/housekeeper.js`: setInterval(1h) running: delete telemetry_events older than 7d; re-aggregate today + yesterday into telemetry_rollups_daily; recompute telemetry_global_aggregates; nudge salt rotation.
- Access-log audit: confirm `showcase/server/` has NO morgan/winston/express-logger middleware that captures `req.ip` on /api/telemetry/* routes. Currently absent — Phase 273 adds a CI grep gate to prevent regression.
- Tests covering: rate-limit 429, body cap 400, batch cap 400, unknown_field 400, event_id dedup via UNIQUE, timestamp tolerance, daily UUID budget, Sec-GPC drop, /optout + /forget 204 semantics, salt rotation across day boundary, housekeeper run.

**Explicitly NOT in scope:**
- Public read endpoints (Phase 274 — /api/public-stats/global).
- Angular service consumption (Phase 274).
- Privacy policy text (Phase 275).
- CWS listing (Phase 275 — BLOCKER #3).

</domain>

<decisions>
## Implementation Decisions

### BLOCKER #1 — trust proxy depth (per user Q1)
- `app.set('trust proxy', 1)` placed in `showcase/server/server.js` IMMEDIATELY after `const app = express()`, BEFORE any `app.use()` / route mount.
- Single-hop trust matches Fly.io's single-edge proxy topology.
- Test: `tests/server-trust-proxy.test.js` asserts `app.get('trust proxy')` returns 1 after server.js eval.

### BLOCKER #2 — express-rate-limit CVE fix (per STACK research)
- Add to `showcase/server/package.json` dependencies: `"express-rate-limit": "^8.3.0"`.
- Custom `keyGenerator: (req) => hashIp(req.ip, db)` so rate buckets align with the same HMAC-SHA256 identifier used for storage. This means: a malicious actor cannot rotate their identifier-as-seen-by-rate-limiter without also rotating their identifier-as-seen-by-storage.
- 30 batches/min/IP-hash window. RFC 9239 RateLimit headers enabled.
- Document in `package.json` comment (NEVER below 8.3.0 — CVE-2026-30827).

### Salt storage — SQLite row (per user Q2)
- `telemetry_daily_salt` table: `(day_utc DATE PRIMARY KEY, salt_hex TEXT NOT NULL, minted_at INTEGER NOT NULL)`.
- Lazy UTC-daily rotation: on every call to `hashIp()`, the salt module:
  1. Computes today's UTC date string `YYYY-MM-DD`.
  2. SELECTs the row.
  3. If missing: BEGIN TX; INSERT today (salt = `crypto.randomBytes(32).toString('hex')`, minted_at = Date.now()); DELETE WHERE day_utc < yesterday; COMMIT.
  4. Returns the salt hex.
- Cross-midnight grace: yesterday's salt is RETAINED for ~25 hours so late-arriving batches with `ts_minute` near midnight still hash correctly.
- No file permissions to manage; no separate file to back up; transactional with the rest of the telemetry schema.

### Log audit — CI grep gate (per user Q3)
- Phase 273 audit confirms `showcase/server/` currently has NO `morgan`, `winston`, `express-logger`, or similar middleware that captures `req.ip`.
- Phase 273 adds `tests/server-no-ip-leak.test.js`: grep over `showcase/server/src/**/*.js` for any access-log middleware that doesn't include a redact filter; fail build if found.
- The CI gate explicitly DOES allow `console.log` for debugging — only access-log middleware patterns flagged.

### Forget endpoint — 204 always (per user Q4)
- `POST /api/telemetry/forget` body `{install_uuid}`. Validate UUID v4 shape; otherwise 400.
- DELETE FROM telemetry_events WHERE install_uuid = ?;
- DELETE FROM telemetry_rollups_daily WHERE install_uuid = ?;
- 204 No Content, always (whether rows existed or not).
- Documented in privacy policy curl recipe (Phase 275 lands the doc).

### Schema discipline
- ALL new tables CREATE'd in `showcase/server/src/db/schema.js` via additive migrations (IF NOT EXISTS); never alter existing tables.
- Each table has a CREATE INDEX for the query pattern actually used:
  - telemetry_events: `(install_uuid, ts_minute)`, `(ip_hash, received_at)`, UNIQUE on event_id.
  - telemetry_rollups_daily: `(install_uuid, day_utc)` UNIQUE; `(day_utc)`.
  - telemetry_global_aggregates: `(day_utc)` UNIQUE.
  - telemetry_daily_salt: PRIMARY KEY already gives the index.

### Strict payload allowlist
- The 9 fields permitted per event: `event_id, install_uuid, ts_minute, mcp_client, model, tokens_in, tokens_out, active_agent_count, event_type`.
- Validator (hand-rolled, no Zod dependency — `mcp/` already uses Zod but `showcase/server/` doesn't and we should NOT add another dep) rejects ANY extra field with HTTP 400 `unknown_field` and the field name in the response.
- UUIDv4 shape check on event_id and install_uuid; mcp_client must be in v0.9.36 allowlist (12 labels) or be the literal string `"unknown"`; event_type must be one of `'periodic' | 'install_announce'`; tokens_* must be non-negative integers; active_agent_count must be a non-negative integer.

### Timestamp tolerance
- Drop event if `ts_minute > now + 5min` (clock skew tolerance).
- Drop event if `ts_minute < now - 7d` (replay attack window).
- Both result in 400 but ONLY the offending events are dropped — the rest of the batch is processed.

### Rate-limit + per-UUID budget
- Per-IP-hash: 30 batches/min via express-rate-limit (RFC 9239 headers).
- Per-UUID: 1000 events/day, tracked in-memory `Map<install_uuid, {count, day_utc}>` reset on day rollover (NOT in SQLite — avoid hot-path DB writes for rate-limit checks).
- On budget exceed: HTTP 429 with custom header `X-FSB-Reason: per-uuid-budget`.

### Housekeeper schedule
- `setInterval(handler, 60 * 60 * 1000)` on server.js boot (1-hour cadence).
- handler:
  1. DELETE FROM telemetry_events WHERE received_at < now - 7d.
  2. Re-aggregate today + yesterday from telemetry_events into telemetry_rollups_daily (per install_uuid, per day_utc): max(active_agent_count), sum(tokens_in), sum(tokens_out), count(*).
  3. Recompute telemetry_global_aggregates row for today + yesterday: COUNT(DISTINCT install_uuid), SUM(tokens_in), SUM(tokens_out), SUM(max-active-agent), most_popular_mcp (with k>=5 anonymity floor), most_popular_agent.
  4. Trigger salt rotation by calling `hashIp` once (lazy rotation handles the rest).
- Errors logged but never crash the interval.

### Sec-GPC honoring
- `req.get('Sec-GPC') === '1'` -> respond 204 immediately, drop entire batch. No insertion, no rate-limit increment.

### Tests
- `tests/server-trust-proxy.test.js` (BLOCKER #1 invariant).
- `tests/server-telemetry-rate-limit.test.js` — 31 batches/min/IP-hash -> 429.
- `tests/server-telemetry-body-cap.test.js` — body > 32KB -> 413.
- `tests/server-telemetry-batch-cap.test.js` — events.length > 50 -> 400.
- `tests/server-telemetry-allowlist.test.js` — 10th field -> 400 unknown_field.
- `tests/server-telemetry-event-id-dedup.test.js` — same event_id twice -> only one row.
- `tests/server-telemetry-timestamp-tolerance.test.js` — +5min / -7d boundaries.
- `tests/server-telemetry-daily-budget.test.js` — 1001 events/UUID/day -> last rejected.
- `tests/server-telemetry-sec-gpc.test.js` — Sec-GPC:1 -> 204 drop.
- `tests/server-telemetry-optout-forget.test.js` — 204 always; rows actually deleted.
- `tests/server-telemetry-salt-rotation.test.js` — day boundary mints fresh salt, deletes pre-yesterday.
- `tests/server-telemetry-housekeeper.test.js` — 1h run deletes old, re-aggregates, recomputes globals.
- `tests/server-no-ip-leak.test.js` — CI grep gate over showcase/server/src/**/*.js.

### Claude's Discretion
- Exact error codes for body-cap (413 vs 400) — recommend 413 (Payload Too Large).
- Whether housekeeper uses Node's `setInterval` or BullMQ-style queue — recommend setInterval (simpler, no new dep).
- Exact log lines on rate-limit hit / budget exceed (debug level).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `showcase/server/package.json` — `better-sqlite3@^11.0.0` already a dep; pragmas apply per connection.
- `showcase/server/server.js` (292 lines) — Express app + WSS at /ws + existing routes at /api/auth /api/agents /api/pair /api/stats; auth middleware mounted; CORS on.
- `showcase/server/src/db/schema.js` (89 lines) — existing tables schema; pattern to mirror (additive migrations via CREATE TABLE IF NOT EXISTS).
- `showcase/server/src/db/queries.js` (268 lines) — prepared statements pattern to mirror.
- `showcase/server/src/utils/hash.js` (if exists) — verify before naming a new file.
- `showcase/server/src/routes/agents.js` (165 lines) — existing route pattern to mirror.

### Established Patterns
- Express CJS modules everywhere.
- Routes mounted via `app.use('/api/*', authMiddleware?, createXxxRouter(queries, ...))`.
- Database singleton initialized at boot in `server.js`.
- All new code is CJS (require/module.exports), NOT ES modules.

### Integration Points
- `showcase/server/server.js`:
  - Line ~5: add `app.set('trust proxy', 1)` immediately after `const app = express()` (BLOCKER #1).
  - Line ~10: `const rateLimit = require('express-rate-limit')`.
  - Line ~106 (after existing routes): mount `app.use('/api/telemetry', createTelemetryRouter(db, queries))`.
  - Line ~270 (after server.listen): `startHousekeeper(db);`.
- `showcase/server/src/db/schema.js`: append 4 new CREATE TABLE statements.
- `showcase/server/src/db/queries.js`: append prepared statements for the new telemetry routes.
- `showcase/server/package.json`: add `"express-rate-limit": "^8.3.0"` (BLOCKER #2).
- `showcase/server/src/utils/`: new files `telemetry-hash.js`, `telemetry-salt.js`.
- `showcase/server/src/middleware/`: new file `telemetry-rate-limit.js`.
- `showcase/server/src/routes/`: new file `telemetry.js` (router with 3 endpoints).
- `showcase/server/src/telemetry/`: new directory; new file `housekeeper.js`.

</code_context>

<specifics>
## Specific Ideas

- The `mcp_client` validator allowlist must mirror the v0.9.36 allowlist (Claude, Codex, ChatGPT, Perplexity, Windsurf, Cursor, Antigravity, OpenCode, OpenClaw, OpenClaw 🦀, Grok, Gemini, Hermes) plus the literal `"unknown"`. Phase 270's JSON data file already enumerates these labels — reference it OR hardcode here (Phase 273 prefers hardcoded to avoid coupling).
- The `model` field is a free-form string (resolver returns assumed model names like `claude-opus-4-7` that aren't necessarily in any fixed list — keep flexible).
- `npm install` in `showcase/server/` is required for express-rate-limit; the install commits the package-lock.json diff.

</specifics>

<deferred>
## Deferred Ideas

- Public read endpoints (Phase 274).
- Rate-limit by ASN or country (deferred; the per-IP-hash + per-UUID combo is sufficient for v0.9.69).
- Database connection pooling (better-sqlite3 is synchronous — one connection is fine for the load profile).
- Backup / migration scripts (deferred; additive schema means current data is unaffected).
- Cron-style salt rotation (deferred; lazy rotation in the hash function is sufficient).

</deferred>
