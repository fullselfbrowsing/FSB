---
quick: 260630-hct
subsystem: showcase-server-telemetry
tags: [telemetry, privacy, geolocation, i18n, db-ip, k-anonymity]
requires: [showcase/server telemetry pipeline (Phases 273-275), Angular i18n locales]
provides:
  - "ip-geo.js deriveRegion(ip) -> {country, subdivision} | 'unknown' (self-hosted DB-IP, our binary search)"
  - "additive telemetry_events.region + telemetry_global_aggregates.popular_region_json columns"
  - "single inline geo-derive call site in the ingest route (req.ip referenced exactly twice)"
  - "k>=5 region rollup (REGION_K_FLOOR=5) in the housekeeper"
  - "popular_regions {label, uniq} on the /api/public-stats/global headline"
  - "/privacy region-derivation disclosure + 4 new @@PRIVACY_TELEMETRY_REGION_* i18n ids across 5 locales"
  - "no-ip-leak audit positively asserting the 2-inline-req.ip-refs invariant"
affects: [showcase/server, showcase/angular privacy page + locales]
key-files:
  created:
    - showcase/server/src/utils/ip-geo.js
    - showcase/server/scripts/refresh-dbip-dataset.mjs
    - showcase/server/data/dbip-city-lite.fixture.csv
    - showcase/server/data/README.md
    - tests/server-ip-geo.test.js
    - tests/server-region-aggregation.test.js
  modified:
    - .gitignore
    - showcase/server/src/db/schema.js
    - showcase/server/src/db/queries.js
    - showcase/server/src/routes/telemetry.js
    - showcase/server/src/telemetry/housekeeper.js
    - showcase/server/src/routes/public-stats.js
    - showcase/angular/src/app/pages/privacy/privacy-page.component.html
    - showcase/angular/src/locale/messages.xlf
    - showcase/angular/src/locale/messages.de.xlf
    - showcase/angular/src/locale/messages.es.xlf
    - showcase/angular/src/locale/messages.ja.xlf
    - showcase/angular/src/locale/messages.zh-CN.xlf
    - showcase/angular/src/locale/messages.zh-TW.xlf
    - tests/server-no-ip-leak.test.js
decisions:
  - "Split prepared statements (insertTelemetryEventWithRegion / upsertGlobalAggregateWithRegion) instead of mutating arity of the existing 11-arg insert / 7-arg upsert, so the existing housekeeper/optout callers + their tests stay green."
  - "Region label normalised to a compact string (US state -> USPS code, e.g. 'US-CA'; generic COUNTRY-slug otherwise) at the call site -- never the raw IP."
  - "REGION_K_FLOOR=5 is a dedicated constant, NOT the relaxed K_ANONYMITY_FLOOR=2 used for mcp_client."
  - "Source messages.xlf regenerated via `ng extract-i18n` to guarantee correct <x> placeholder shapes; locale targets authored to match the new placeholders."
metrics:
  duration: ~17m
  tasks: 5
  completed: 2026-06-30
---

# Quick Task 260630-hct: Anonymous state-level region telemetry Summary

Self-hosted DB-IP IP-to-City Lite + our own binary-search lookup derives a coarse country/US-state label from `req.ip` at ingest, rolled up daily behind a hard k>=5 anonymity floor and surfaced as `popular_regions` on the public stats headline -- without weakening the "plaintext IP is never stored or logged" invariant (`req.ip` now referenced exactly twice, both inline) and without building any per-install location profile.

## What shipped

1. **Geo module + dataset pipeline (Task 1)** -- `ip-geo.js` exports `deriveRegion(ip)` returning `{country, subdivision}` or `'unknown'`, via a lazily-loaded sorted range table + binary search over uint32 IPv4 forms. Mirrors `telemetry-hash.js` posture: `ip` is an argument, used then discarded, never stored/logged. Graceful degradation: absent/unreadable/empty dataset -> caches a `null` table, returns `'unknown'`, never throws. Plus `refresh-dbip-dataset.mjs` (transforms the upstream DB-IP CSV; carries the CC-BY-4.0 attribution header), a tiny committed `dbip-city-lite.fixture.csv`, `data/README.md`, and a `.gitignore` rule excluding the real ~100MB artifact but keeping `*.fixture.csv`.

2. **Additive schema + queries (Task 2)** -- `telemetry_events.region` (DEFAULT `'unknown'`) and `telemetry_global_aggregates.popular_region_json` (DEFAULT `'[]'`) added to both the inline CREATE bodies and via idempotent try/catch ALTER. New `insertTelemetryEventWithRegion` (12-arg), `selectPopularRegionForDayRange`, and `upsertGlobalAggregateWithRegion` (8-arg) -- the existing 11-arg insert / 7-arg upsert are left byte-compatible for their callers.

3. **Single ingest call site (Task 3)** -- `deriveRegion(ipKeyGenerator(req.ip))` added inline beside the existing `hashIp(ipKeyGenerator(req.ip), db)`; `regionLabel()` collapses the result to a compact string (`US-CA`); insert switched to the 12-arg statement. `req.ip` appears exactly twice in code, no escaping local. PRIVACY INVARIANT comment rewritten ONCE -> TWICE.

4. **k>=5 rollup + public headline (Task 4)** -- `REGION_K_FLOOR=5` + `applyKFloor()` in the housekeeper: below-5 regions (incl. `'unknown'` if it does not clear k) fold into a single `'Other'` bucket = sum, suppressed when that sum < 5; written via the 8-arg upsert. `buildHeadlineJson` emits `popular_regions` as `{label, uniq}` with the existing typed/no-SELECT-*/no-Set-Cookie/memo+ETag posture intact.

5. **/privacy disclosure + i18n + audit (Task 5)** -- reworded `@@PRIVACY_TELEMETRY_INTRO` + `@@PRIVACY_TELEMETRY_NOT_COLLECT_IP`, new Region subsection with `@@PRIVACY_TELEMETRY_REGION_HEADING/_DERIVED/_KFLOOR/_NOPROFILE` (DB-IP, not MaxMind/live API, k>=5 aggregate, no per-install profile, attribution link), translated across all 5 non-en locales. `server-no-ip-leak.test.js` strengthened to positively assert the 2-inline-`req.ip` invariant (still passes; existing bans + exit codes preserved).

## Commits

| Task | Commit | Description |
| ---- | ------ | ----------- |
| 1 | `e2a1b67a` | geo lookup module + DB-IP dataset pipeline + fixture |
| 2 | `c1e68524` | additive region schema + queries |
| 3 | `45f44a32` | inline geo-derive at the single req.ip ingest touchpoint |
| 4 | `29e26986` | k>=5 region rollup + popular_regions headline |
| 5 | `8edf3525` | /privacy region disclosure + i18n + no-ip-leak hardening |

## Verification results (all honest, run from repo root)

| Test | Result |
| ---- | ------ |
| `server-ip-geo.test.js` | PASS (24/0) |
| `server-region-aggregation.test.js` | PASS (23/0) |
| `server-telemetry-housekeeper.test.js` | PASS (24/0) |
| `server-telemetry-optout-forget.test.js` | PASS (15/0) |
| `server-telemetry-allowlist.test.js` | PASS (15/0) |
| `server-no-ip-leak.test.js` | PASS (exit 0; now positively asserts 2 inline req.ip refs) |
| `server-public-stats-headline.test.js` | PASS (33/0) |
| `server-public-stats-no-auth.test.js` | PASS (21/0) |
| `showcase-privacy-page.test.js` | PASS (60/0) |
| `showcase-build-smoke.test.js` | **PASS (109/0)** -- full Angular prod build with `i18nMissingTranslation: error` ran successfully; the environmental caveat did NOT apply |

Spot checks: `req.ip refs: 2` (privacy invariant) and `DBIP_DATASET_PATH=/nonexistent/none.csv ... deriveRegion('8.8.8.8') -> unknown` (graceful degradation). End-to-end: a POST from `8.8.8.8` (via the fixture) stores `region = 'US-CA'`.

### Build-smoke honesty note

The execution notes flagged that `showcase-build-smoke.test.js` runs a full Angular production build needing `showcase/angular/node_modules`, and to report honestly if environmentally blocked. **It was NOT blocked** -- `node_modules` was present, `ng extract-i18n` and the full prod build both completed, and the test passed 109/0 with exit 0. Every new `@@PRIVACY_TELEMETRY_REGION_*` id has a `<target state="translated">` in all 5 non-en locales (verified by inspection: source/locale trans-unit ID sets match exactly, 0 missing / 0 extra; 934 balanced trans-units per file) AND the real build confirms it.

## ACTION REQUIRED (user) -- stale Chrome Web Store evidence

> **ACTION REQUIRED (user):** `store-assets/chrome-web-store/privacy-practices-evidence.md`
> line 14 still reads "Location | DO NOT TICK | No geolocation is collected." This is now
> STALE -- the server derives a coarse, aggregate, k>=5-floored region from the request IP.
> Per CONTEXT this file was intentionally NOT edited; the user handles the Chrome Web Store
> "Location" data-use disclosure. Update that row (and the CWS Location toggle) before the
> next store submission.

(For reference, line 14 currently reads, verbatim: `| **Location** | DO NOT TICK | No geolocation is collected. The request IP is hashed with a daily-rotating salt on the server for rate limiting and immediately discarded; plaintext IPs are never stored. |` -- both the "No geolocation is collected" claim and the "only ... for rate limiting" framing are now inaccurate.)

## DEFERRED (out of scope; follow-up)

- **Rich `/stats` region UI** -- a choropleth map / visual region breakdown on the Angular `/stats` page was scoped out. This quick task ships only the data + API + privacy-copy layer; `popular_regions` is exposed on the public headline JSON but no `/stats` visual consumes it yet.
- **`/stats` footer DB-IP attribution credit** -- the optional CC-BY-4.0 "IP Geolocation by DB-IP" credit that would accompany a `/stats` region UI is deferred together with that UI. (Attribution IS already present at the refresh-script header and `data/README.md`, and within the `/privacy` Region subsection.)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Split prepared statements instead of mutating existing arity**
- **Found during:** Task 2 (its own verify gate requires the housekeeper test to pass).
- **Issue:** The plan's interface note said to extend `upsertGlobalAggregate` with a trailing `popular_region_json` placeholder, but the housekeeper's existing direct `upsertGlobalAggregate.run(...)` call passes only 7 args. better-sqlite3 requires exact arity, so widening that statement broke the housekeeper ("Too few parameter values were provided") before Task 4 could update the caller -- failing Task 2's verify.
- **Fix:** Left the 7-arg `upsertGlobalAggregate` untouched and added a SEPARATE 8-arg `upsertGlobalAggregateWithRegion` (mirroring the plan's own `insertTelemetryEvent` / `insertTelemetryEventWithRegion` split idiom). The housekeeper switches to the new statement in Task 4; the `upsertGlobalAggregateRow` wrapper routes through it with `popular_region_json` defaulting to `'[]'`. Net effect matches the plan's intent (additive region column on the daily aggregate) without breaking existing callers.
- **Files modified:** `showcase/server/src/db/queries.js`, `showcase/server/src/telemetry/housekeeper.js`
- **Commits:** `c1e68524`, `29e26986`

**2. [Rule 1 - Bug] Backtick in a SQL comment broke the schema template literal**
- **Found during:** Task 2.
- **Issue:** A SQL comment I added inside the `db.exec(\`...\`)` template literal in `schema.js` contained a literal backtick around the word `region`, which terminated the template string early ("missing ) after argument list").
- **Fix:** Removed the backticks from the SQL comment text.
- **Files modified:** `showcase/server/src/db/schema.js`
- **Commit:** `c1e68524`

### Branch-state note (not a code change)

`privacy-page.component.html` and the six `messages*.xlf` files were already modified (uncommitted WIP) on the `automation` branch before this task (PhantomStream/permissions/site-API privacy copy; regenerated locale targets). Because git commits whole-file state and the source `messages.xlf` was regenerated via `ng extract-i18n`, the Task 5 commit (`8edf3525`) necessarily includes that pre-existing file state alongside the `260630-hct` region additions. This is documented in the commit body. The unrelated pre-existing modifications to OTHER files (extension/, scripts/, other Angular pages, `tests/showcase-privacy-page.test.js`, `tests/t1-terminal-states.test.js`, etc.) were left unstaged.

## Privacy invariant (as built)

Plaintext `req.ip` is referenced **exactly twice** in `routes/telemetry.js`, both as inline arguments (`hashIp(ipKeyGenerator(req.ip), db)` and `deriveRegion(ipKeyGenerator(req.ip))`), after the Sec-GPC:1 204 short-circuit. Neither reference escapes to a local; the plaintext is discarded at end-of-function. Region is stored only on the short-lived raw event (dropped by the 7-day retention) and in the k>=5-floored daily aggregate -- no durable `(install_uuid -> region)` profile. `tests/server-no-ip-leak.test.js` now fails-closed on a third/un-inlined `req.ip` reference.
