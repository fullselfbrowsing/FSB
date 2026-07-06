# Quick Task 260630-hct: Anonymous state-level region telemetry - Context

**Gathered:** 2026-06-30
**Status:** Ready for planning

<domain>
## Task Boundary

Add anonymous, **aggregate** region tracking (US state / subdivision granularity) to the
telemetry pipeline. The telemetry server already receives the real client IP via
`req.ip` (Fly.io single-edge proxy, `trust proxy = 1`). Derive a coarse
`country` + `subdivision` (state) label from that IP **at ingest time**, and expose a
region breakdown in the public `/stats` aggregates.

This is server-side only (the `showcase/server` Node app that serves
`full-selfbrowsing.com/api/telemetry/*`). The browser extension's 9-field telemetry
payload is NOT touched — the client never sends location; the server derives it.
</domain>

<decisions>
## Implementation Decisions (LOCKED — do not revisit)

### Granularity & data source
- **State / subdivision level** (not just country).
- Self-host a **lite City dataset**. Default pick: **DB-IP IP-to-City Lite**
  (license **CC-BY-4.0** — attribution only, no share-alike; more permissive than
  IP2Location LITE's CC-BY-SA). IP2Location LITE is an acceptable swap if needed.
- **NOT MaxMind.** No live third-party geo API (would leak every user's raw IP to a
  third party — worse than the current hashed-IP posture).
- Write **our own lookup logic** (sorted IP-range binary search). Only the *dataset*
  is third-party; the lookup code is ours.

### Privacy / anonymity model (HARD CONSTRAINT)
- Preserve the existing invariant: **plaintext IP is referenced exactly once**, only to
  derive geo + the existing HMAC hash, then discarded. NEVER logged, NEVER stored.
  `tests/server-no-ip-leak.test.js` must still pass (update it to permit the single new
  geo-derive call site, same pattern as the existing `hashIp(req.ip, db)` allowance).
- Store region **only in the daily AGGREGATE**, behind the existing **k>=5 anonymity
  floor** — states with fewer than 5 unique installs collapse to **"Other"**. Mirror the
  housekeeper's existing `popular_mcp_json` k-floor treatment.
- Do **NOT** create a persistent `(install_uuid -> state)` row / per-user location
  profile. No region column on `telemetry_events` keyed to a UUID that survives the
  daily rollup. (A short-lived region on the raw event is acceptable only if the
  housekeeper's daily aggregation rolls it up and the raw rows are dropped by the
  existing 7-day retention — but prefer aggregating region at ingest/rollup without a
  durable per-UUID geo link.)

### Graceful degradation (HARD CONSTRAINT)
- The geo lookup MUST return `"unknown"` (and aggregate as "Other"/"unknown") when the
  production dataset file is absent. The server must boot and ingest normally with no
  dataset present. The real ~100MB+ DB-IP file is NOT committed in this task — only a
  generation/refresh script + a tiny committed test fixture. Production data is dropped
  in later (or generated at Docker build).

### Privacy docs
- Update the **code** + the Angular **`/privacy` page** (and the `/stats` page copy that
  asserts "without ever touching the pages you browse" — clarify region is derived
  server-side from IP, never stored as plaintext, aggregate-only).
- Do **NOT** edit `store-assets/chrome-web-store/privacy-practices-evidence.md` — the
  user handles the Chrome Web Store "Location" disclosure themselves. **Flag** the
  now-stale "No geolocation is collected" line there in the SUMMARY so it is not
  forgotten (leave a clearly-marked note, do not silently leave a contradiction).

### Attribution
- DB-IP requires an attribution link ("IP Geolocation by DB-IP" -> https://db-ip.com).
  Place it where the dataset is documented (refresh script header + a server
  README/notice) and, if a region UI lands, in the `/stats` page footer/credits.
</decisions>

<specifics>
## Key Files

- `showcase/server/src/routes/telemetry.js` — single new geo-derive call site at the
  existing `req.ip` touchpoint (line ~146).
- `showcase/server/src/utils/telemetry-hash.js` — existing hashIp; geo derive is a
  sibling util (new `ip-geo.js`), do not entangle.
- `showcase/server/src/db/schema.js` — region columns on the aggregate tables
  (`telemetry_global_aggregates` and/or a `telemetry_region_daily` rollup); additive
  migration only, mirror existing `popular_mcp_json` style.
- `showcase/server/src/telemetry/housekeeper.js` — region rollup + k>=5 floor.
- `showcase/server/src/routes/public-stats.js` — expose region breakdown in the
  headline/series response (typed fields, no SELECT *, no UUID/ip_hash leak).
- `showcase/server/src/db/queries.js` — new queries for region rollup/read.
- Dockerfile / refresh script — generation pipeline for the dataset artifact.
- Tests: `tests/server-no-ip-leak.test.js` (permit new call site), new region
  aggregation + k-floor + geo-lookup-graceful-degradation tests, public-stats
  no-leak assertions.
- Angular `/privacy` + `/stats` page copy.

## Scope note
The orchestrator flagged this is phase-sized; running as a quick. Keep the core
deliverable = server-side derive + aggregate + public-stats + privacy-page copy + tests.
A rich `/stats` map/visual UI may be deferred to a follow-up and noted in the SUMMARY.
</specifics>

<canonical_refs>
## Canonical References

- Existing privacy invariant docstrings: `showcase/server/src/routes/telemetry.js`
  (PRIVACY INVARIANT block), `showcase/server/src/utils/telemetry-hash.js`.
- Existing k>=5 floor precedent: `showcase/server/src/telemetry/housekeeper.js`
  (`popular_mcp_json` / `popular_agent_json` below-k collapse to "Other (N=...)").
- `app.set('trust proxy', 1)` in `showcase/server/server.js` — why `req.ip` is the real
  client IP.
</canonical_refs>
</content>
</invoke>
