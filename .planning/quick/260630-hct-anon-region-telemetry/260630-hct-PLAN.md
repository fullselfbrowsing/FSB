---
quick: 260630-hct
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - showcase/server/src/utils/ip-geo.js
  - showcase/server/scripts/refresh-dbip-dataset.mjs
  - showcase/server/data/dbip-city-lite.fixture.csv
  - showcase/server/data/README.md
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
  - tests/server-ip-geo.test.js
  - tests/server-region-aggregation.test.js
  - tests/server-no-ip-leak.test.js
  - .gitignore
requirements: [HCT-REGION-01]

must_haves:
  truths:
    - "Server derives a coarse country+US-state label from req.ip at ingest, using a self-hosted DB-IP IP-to-City Lite dataset and our own binary-search lookup (NOT MaxMind, no live geo API)."
    - "Plaintext req.ip is referenced exactly twice in telemetry.js (existing hashIp call + new geo-derive call), each as an inline argument; never assigned to an escaping variable, never logged, never stored. tests/server-no-ip-leak.test.js still passes and now positively asserts this count."
    - "Region is stored ONLY in the daily aggregate behind a k>=5 floor: states with fewer than 5 unique installs collapse to 'Other'. No durable (install_uuid -> state) profile survives the 7-day raw-event retention."
    - "Geo lookup returns 'unknown' (aggregating as 'Other'/'unknown') and the server boots + ingests normally when the production dataset file is absent. The ~100MB DB-IP file is NOT committed; only a refresh script + a tiny fixture ship."
    - "The public /api/public-stats/global headline exposes a popular_regions breakdown built from the k-floored daily aggregate, typed (no SELECT *, no UUID/ip_hash leak)."
    - "The Angular /privacy page discloses server-side region derivation: derived from IP, aggregate-only, k>=5 floored, never stored as plaintext; the existing 'without ever touching the pages you browse' / 'discards it' copy is clarified accordingly."
  artifacts:
    - path: "showcase/server/src/utils/ip-geo.js"
      provides: "deriveRegion(ip) -> {country, subdivision} | 'unknown'; lazy dataset load; binary-search range lookup; graceful 'unknown' when dataset absent"
      contains: "deriveRegion"
    - path: "showcase/server/scripts/refresh-dbip-dataset.mjs"
      provides: "Generation/refresh script for the DB-IP IP-to-City Lite artifact + DB-IP attribution header"
      contains: "db-ip.com"
    - path: "showcase/server/data/dbip-city-lite.fixture.csv"
      provides: "Tiny committed test fixture (a handful of IP ranges) for geo-lookup tests"
    - path: "showcase/server/src/db/schema.js"
      provides: "Additive region column on telemetry_events (DEFAULT 'unknown') + popular_region_json column on telemetry_global_aggregates (DEFAULT '[]')"
      contains: "popular_region_json"
    - path: "showcase/server/src/telemetry/housekeeper.js"
      provides: "Region rollup with k>=5 floor (mirrors popular_mcp_json treatment) written into popular_region_json"
      contains: "popular_region_json"
    - path: "showcase/server/src/routes/public-stats.js"
      provides: "popular_regions field on the headline JSON, parsed from popular_region_json"
      contains: "popular_regions"
    - path: "tests/server-region-aggregation.test.js"
      provides: "k>=5 floor + below-k collapse-to-Other + graceful-degradation aggregation tests"
    - path: "showcase/angular/src/app/pages/privacy/privacy-page.component.html"
      provides: "Region-derivation disclosure copy + new @@PRIVACY_TELEMETRY_REGION_* i18n markers"
      contains: "PRIVACY_TELEMETRY_REGION"
  key_links:
    - from: "showcase/server/src/routes/telemetry.js"
      to: "showcase/server/src/utils/ip-geo.js"
      via: "deriveRegion(req.ip) inline at the single existing req.ip touchpoint"
      pattern: "deriveRegion\\(\\s*ipKeyGenerator\\(req\\.ip\\)|deriveRegion\\(req\\.ip"
    - from: "showcase/server/src/telemetry/housekeeper.js"
      to: "telemetry_global_aggregates.popular_region_json"
      via: "k-floored region rollup upserted per day"
      pattern: "popular_region_json"
    - from: "showcase/server/src/routes/public-stats.js"
      to: "telemetry_global_aggregates.popular_region_json"
      via: "selectLatestGlobalAggregate -> popular_regions headline field"
      pattern: "popular_regions"
---

<objective>
Add anonymous, aggregate US-state / subdivision region tracking to the telemetry
server. The server already receives the real client IP via `req.ip` (Fly.io single
edge, `trust proxy = 1`). Derive a coarse `country` + `subdivision` label from that IP
at ingest using a self-hosted DB-IP IP-to-City Lite dataset and our own binary-search
lookup, aggregate it daily behind the existing k>=5 anonymity floor, and surface a
region breakdown in the public `/stats` aggregates. Update the Angular `/privacy` copy.

Purpose: publish where adoption is happening (state granularity) WITHOUT weakening the
"plaintext IP is never stored or logged" invariant and WITHOUT building a per-user
location profile.

Output: `ip-geo.js` module + dataset refresh script + committed fixture; additive
schema columns; one new geo-derive call site in the ingest route; k-floored region
rollup in the housekeeper; `popular_regions` on the public headline; updated `/privacy`
page + i18n; updated no-ip-leak audit; new geo + region-aggregation tests.

DEFERRED (out of scope; note in SUMMARY for follow-up): any rich `/stats` choropleth
map / visual region UI on the Angular stats page, and the optional `/stats` footer
DB-IP attribution credit if/when that UI lands. This plan ships the data + API +
privacy-copy layer only.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260630-hct-anon-region-telemetry/260630-hct-CONTEXT.md
@.planning/STATE.md

<!-- LOCKED constraints live in CONTEXT.md above. The interface facts below are
     extracted from the codebase so the executor needs NO exploration. -->

<interfaces>
<!-- Existing privacy invariant + the SINGLE req.ip touchpoint (telemetry.js ~line 146).
     The new geo derive is a SECOND inline reference to req.ip in this same handler. -->
From showcase/server/src/routes/telemetry.js (POST /events handler):
  - Sec-GPC:1 -> 204 silent drop BEFORE any IP touch.
  - `const clientHash = hashIp(ipKeyGenerator(req.ip), db);`   // the ONLY existing req.ip read
  - Inserts run inside a single db.transaction over `budgetAccepted` rows via
    `queries.insertTelemetryEvent.run(event_id, install_uuid, ts_minute, mcp_client,
     model||null, tokens_in, tokens_out, active_agent_count, event_type, clientHash, now)`
    -- exactly 11 positional args.

From showcase/server/src/utils/telemetry-hash.js:
  - `function hashIp(plaintextIp, db)` -- HMAC-SHA256, plaintext discarded immediately.
    The geo module must follow the SAME posture: accept ip as an arg, derive, discard.

From showcase/server/src/db/queries.js (statements that MUST stay byte-compatible):
  - `this.insertTelemetryEvent` = 11-placeholder INSERT OR IGNORE INTO telemetry_events.
    DO NOT change its arity -- callers in tests/server-telemetry-housekeeper.test.js,
    tests/server-telemetry-optout-forget.test.js, and queries.insertTelemetryEventRow()
    all pass exactly 11 args. Add a SEPARATE 12-arg statement for the region path.
  - `this.selectPopularMcpForDayRange` =
    `SELECT mcp_client, COUNT(DISTINCT install_uuid) AS uniq FROM telemetry_events
     WHERE ts_minute >= ? AND ts_minute < ? GROUP BY mcp_client ORDER BY uniq DESC`
    -- MIRROR this exactly for region (GROUP BY region).
  - `this.selectLatestGlobalAggregate` currently selects
    `popular_mcp_json, popular_agent_json` -- ADD `popular_region_json`.
  - `this.upsertGlobalAggregate` writes (day_utc, unique_installs, tokens_in_sum,
    tokens_out_sum, agents_active_sum, popular_mcp_json, popular_agent_json) --
    ADD popular_region_json as a trailing column (additive).

From showcase/server/src/telemetry/housekeeper.js:
  - `K_ANONYMITY_FLOOR = 2` (lowered from 5 for dev visibility). The region floor is
    HARD-required at k>=5 by CONTEXT. Use a dedicated `REGION_K_FLOOR = 5` constant for
    region (do NOT reuse the relaxed mcp floor of 2). below-k regions collapse to a
    single 'Other' bucket whose count is the SUM of below-k install counts; suppress the
    bucket entirely when that sum is itself < 5 (mirror the existing popularMcp logic at
    lines ~100-106).
  - The tick recomputes globals for dayOffset [0,1] and calls
    `queries.upsertGlobalAggregate.run(dayKey, unique_installs, tokens_in_sum,
     tokens_out_sum, agents_active_sum, JSON.stringify(popularMcp),
     JSON.stringify(popularAgent))`. Add JSON.stringify(popularRegion) as the trailing arg.

From showcase/server/src/routes/public-stats.js (buildHeadlineJson):
  - Reads `queries.getPublicHeadlineRows()` -> `latest_global.popular_mcp_json`.
  - `safeParseArray(json)` always returns an array. Reuse it for popular_region_json.
  - Headline rows are renamed to public {label, uniq} shape. Region rows are
    {region, uniq} in storage -> map to {label, uniq}.

From showcase/server/server.js:
  - `app.set('trust proxy', 1)` -- why req.ip is the real client IP. NEVER remove.
  - Router wired: `app.use('/api/telemetry', createTelemetryRouter(db, queries, hashIp))`.
    The geo module is required directly inside telemetry.js (a sibling util), NOT passed
    through the factory -- keeps the factory signature stable.

Test-harness pattern (better-sqlite3 in-memory; reuse verbatim):
  const SERVER_NM = path.join(__dirname, '..', 'showcase', 'server', 'node_modules');
  const Database = require(require.resolve('better-sqlite3', { paths: [SERVER_NM] }));
  const { initializeDatabase } = require('.../showcase/server/src/db/schema');
  const Queries = require('.../showcase/server/src/db/queries');
  const db = new Database(':memory:'); initializeDatabase(db); const queries = new Queries(db);

i18n constraint (HARD -- build fails otherwise):
  showcase/angular builds with `i18nMissingTranslation: error`. EVERY new @@PRIVACY_*
  i18n id added to privacy-page.component.html MUST also get a <target state="translated">
  block in messages.xlf AND all 5 non-en locales (de, es, ja, zh-CN, zh-TW), or
  `npm run build` (and tests/showcase-build-smoke.test.js) fails. tests/showcase-privacy-page.test.js
  is a source-level presence check on named markers.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Geo lookup module + DB-IP dataset pipeline + fixture</name>
  <files>showcase/server/src/utils/ip-geo.js, showcase/server/scripts/refresh-dbip-dataset.mjs, showcase/server/data/dbip-city-lite.fixture.csv, showcase/server/data/README.md, tests/server-ip-geo.test.js, .gitignore</files>
  <action>
Create `showcase/server/src/utils/ip-geo.js` (CommonJS, `'use strict'`) exporting
`deriveRegion(ip)` returning `{ country, subdivision }` or the literal string
`'unknown'`. Posture MUST mirror telemetry-hash.js: `ip` is a function argument, used
only to compute the lookup, never assigned to a module-level/long-lived variable, never
logged, never written to disk. Implementation: lazily load the dataset ONCE on first
call from a path resolved via `process.env.DBIP_DATASET_PATH` || a default under
`showcase/server/data/` (production artifact path); parse it into a sorted array of
`{ startIpInt, endIpInt, country, subdivision }` ranges; look up via binary search on
the integer form of `ip`. Support IPv4 dotted-quad -> uint32; for IPv6 or unparseable
input return `'unknown'` (coarse IPv4-only is acceptable for this task). GRACEFUL
DEGRADATION (HARD per CONTEXT): if the dataset file is ABSENT or unreadable or empty,
set an internal "no data" flag, log nothing sensitive, and return `'unknown'` for every
call -- the module must never throw and the server must boot without a dataset. Cache
the parsed table; cache a `null` table when absent so repeated calls do not re-stat.

Create `showcase/server/scripts/refresh-dbip-dataset.mjs` (ESM, matches scripts/*.mjs
idiom): a generation/refresh script that downloads/extracts the DB-IP IP-to-City Lite
CSV (CC-BY-4.0) into the production dataset path, transforming it into the compact
range format `ip-geo.js` reads. The script header MUST carry the required DB-IP
attribution: a comment block reading "IP Geolocation by DB-IP (https://db-ip.com),
CC-BY-4.0". Do NOT commit the real ~100MB dataset. If network fetch is impractical in
the executor environment, the script may instead document the manual download URL +
the transform step and still emit the attribution + format spec -- but it MUST be
runnable enough to regenerate the artifact from a downloaded source CSV.

Create `showcase/server/data/dbip-city-lite.fixture.csv`: a TINY committed fixture
(roughly 5-10 rows) in the same range format the module parses, covering a few known
IPv4 ranges mapped to e.g. US/California, US/New York, US/Texas, and one non-US row,
so the geo + aggregation tests are deterministic and offline.

Create `showcase/server/data/README.md`: document the dataset path, the
`DBIP_DATASET_PATH` env var, the refresh-script usage, the graceful-degradation
behavior (server boots + returns 'unknown' with no dataset), and the DB-IP attribution
("IP Geolocation by DB-IP", https://db-ip.com, CC-BY-4.0).

Update `.gitignore`: add the production dataset artifact path (e.g.
`showcase/server/data/dbip-city-lite.*` EXCEPT the committed `*.fixture.csv`) so the
real ~100MB file is never committed but the fixture is.

Create `tests/server-ip-geo.test.js` (node, no framework; PASS/FAIL counter + non-zero
exit on fail): (a) with `DBIP_DATASET_PATH` pointed at the fixture, an IP inside a
known range returns the correct `{country, subdivision}`; an IP outside all ranges
returns `'unknown'`. (b) with `DBIP_DATASET_PATH` pointed at a non-existent path,
`deriveRegion` returns `'unknown'` and does NOT throw (graceful degradation). (c) a
malformed / IPv6 / empty input returns `'unknown'`.
  </action>
  <verify>
    <automated>cd /Users/lakshman/conductor/workspaces/fsb/louisville && node tests/server-ip-geo.test.js && node -e "process.env.DBIP_DATASET_PATH='/nonexistent/none.csv'; const {deriveRegion}=require('./showcase/server/src/utils/ip-geo.js'); if(deriveRegion('8.8.8.8')!=='unknown'){console.error('FAIL: expected unknown with no dataset');process.exit(1)} console.log('PASS: graceful degradation')"</automated>
  </verify>
  <done>ip-geo.js exports deriveRegion; fixture-backed lookup returns correct state and 'unknown' for misses; absent-dataset path returns 'unknown' without throwing; refresh script carries DB-IP attribution; .gitignore excludes the real artifact but keeps the fixture; tests/server-ip-geo.test.js passes.</done>
</task>

<task type="auto">
  <name>Task 2: Additive schema + queries for region (events column + daily-aggregate region JSON)</name>
  <files>showcase/server/src/db/schema.js, showcase/server/src/db/queries.js</files>
  <action>
In `showcase/server/src/db/schema.js`, additively add region storage, mirroring the
existing telemetry style (CREATE TABLE IF NOT EXISTS bodies are already present; add new
columns via the try/catch ALTER migration block at the bottom so existing databases
upgrade in place):
  - `telemetry_events`: add a short-lived `region TEXT NOT NULL DEFAULT 'unknown'`
    column. Add `ALTER TABLE telemetry_events ADD COLUMN region TEXT NOT NULL DEFAULT
    'unknown'` inside a try/catch (column-already-exists swallow), AND add the column to
    the inline CREATE TABLE body so fresh databases get it too. This region is rolled up
    daily by the housekeeper and dropped by the existing 7-day retention -- it is NOT a
    durable per-UUID location profile (CONTEXT-compliant).
  - `telemetry_global_aggregates`: add `popular_region_json TEXT NOT NULL DEFAULT '[]'`,
    both in the inline CREATE TABLE body and via a try/catch ALTER. This is the
    k>=5-floored daily region breakdown, exactly mirroring `popular_mcp_json`.

In `showcase/server/src/db/queries.js`, additively (do NOT modify existing statements'
arity):
  - Add a NEW prepared statement `insertTelemetryEventWithRegion` = the same INSERT OR
    IGNORE INTO telemetry_events but with the trailing `region` column (12 placeholders).
    Leave the existing 11-arg `insertTelemetryEvent` UNTOUCHED (its callers in
    housekeeper/optout tests and insertTelemetryEventRow depend on 11 args).
  - Add `selectPopularRegionForDayRange` mirroring `selectPopularMcpForDayRange` but
    `SELECT region, COUNT(DISTINCT install_uuid) AS uniq ... GROUP BY region ORDER BY
    uniq DESC`.
  - Update `upsertGlobalAggregate` to write a trailing `popular_region_json` column
    (the INSERT column list + VALUES placeholder + the ON CONFLICT DO UPDATE SET line),
    and update `selectLatestGlobalAggregate` to also SELECT `popular_region_json`.
    Update the `upsertGlobalAggregateRow` wrapper + `getPublicHeadlineRows`'s
    `latest_global` default object to include `popular_region_json: '[]'`.
  - Add wrapper methods as needed (`popularRegionForDayRange(startMs, endMs)`) matching
    the existing wrapper style.
Keep better-sqlite3 prepared-statement + typed-field idioms; no SELECT *.
  </action>
  <verify>
    <automated>cd /Users/lakshman/conductor/workspaces/fsb/louisville && node -e "const path=require('path');const SN=path.join('showcase','server','node_modules');const Database=require(require.resolve('better-sqlite3',{paths:[SN]}));const {initializeDatabase}=require('./showcase/server/src/db/schema');const Queries=require('./showcase/server/src/db/queries');const db=new Database(':memory:');initializeDatabase(db);const q=new Queries(db);const cols=db.prepare('PRAGMA table_info(telemetry_events)').all().map(c=>c.name);const gcols=db.prepare('PRAGMA table_info(telemetry_global_aggregates)').all().map(c=>c.name);if(!cols.includes('region')){console.error('FAIL: events.region missing');process.exit(1)}if(!gcols.includes('popular_region_json')){console.error('FAIL: popular_region_json missing');process.exit(1)}if(typeof q.insertTelemetryEventWithRegion==='undefined'||typeof q.selectPopularRegionForDayRange==='undefined'){console.error('FAIL: new statements missing');process.exit(1)}console.log('PASS: schema+queries additive region OK')" && node tests/server-telemetry-housekeeper.test.js && node tests/server-telemetry-optout-forget.test.js</automated>
  </verify>
  <done>telemetry_events has region (DEFAULT 'unknown'); telemetry_global_aggregates has popular_region_json (DEFAULT '[]'); both fresh-CREATE and ALTER-migration paths add them; new insertTelemetryEventWithRegion (12-arg) + selectPopularRegionForDayRange exist; existing 11-arg insertTelemetryEvent is unchanged and its dependent tests still pass.</done>
</task>

<task type="auto">
  <name>Task 3: Single geo-derive call site in the ingest route</name>
  <files>showcase/server/src/routes/telemetry.js</files>
  <action>
In `showcase/server/src/routes/telemetry.js`, at the top, add
`const { deriveRegion } = require('../utils/ip-geo');`.

At the SINGLE existing `req.ip` touchpoint inside `POST /events` (currently
`const clientHash = hashIp(ipKeyGenerator(req.ip), db);`, ~line 146, AFTER the
Sec-GPC:1 204 short-circuit so opted-out requests never touch geo): add ONE additional
inline reference deriving the region, e.g.
`const region = deriveRegion(ipKeyGenerator(req.ip));` immediately adjacent. `req.ip`
must remain INLINE in both expressions -- do NOT introduce a `const ip = req.ip` local
that escapes (that would violate the privacy invariant the no-ip-leak audit guards).
`region` here is `{country, subdivision}` or `'unknown'`; normalize it to a compact
string label for storage (e.g. `US-CA` for {US, California}, or the literal `'unknown'`)
via a tiny local helper -- a state-granularity string, never the raw IP.

Switch the insert inside the `db.transaction` to the new
`queries.insertTelemetryEventWithRegion.run(...)` passing the existing 11 args PLUS the
trailing `regionLabel` (12th). Leave all batching / budget / timestamp / Sec-GPC /
response logic unchanged.

Update the PRIVACY INVARIANT comment block in this file: it currently states req.ip is
"referenced EXACTLY ONCE". Change it to state req.ip is referenced EXACTLY TWICE -- once
for the rate-limit/HMAC hash (`hashIp`) and once for the coarse geo derive
(`deriveRegion`) -- both inline, both discarding plaintext immediately, neither logged
nor stored; only the derived k>=5-floored aggregate region is retained. Cross-reference
tests/server-no-ip-leak.test.js.
  </action>
  <verify>
    <automated>cd /Users/lakshman/conductor/workspaces/fsb/louisville && node -e "const s=require('fs').readFileSync('showcase/server/src/routes/telemetry.js','utf8');const stripped=s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/[^\n]*/g,'\$1');const n=(stripped.match(/req\.ip/g)||[]).length;if(n!==2){console.error('FAIL: expected exactly 2 req.ip refs in code, got '+n);process.exit(1)}if(!/deriveRegion\(/.test(stripped)){console.error('FAIL: deriveRegion call missing');process.exit(1)}if(!/insertTelemetryEventWithRegion/.test(stripped)){console.error('FAIL: region insert not wired');process.exit(1)}if(/const\s+ip\s*=\s*req\.ip/.test(stripped)){console.error('FAIL: escaping req.ip local introduced');process.exit(1)}console.log('PASS: single-derive geo wiring OK')" && node tests/server-no-ip-leak.test.js && node tests/server-telemetry-allowlist.test.js</automated>
  </verify>
  <done>telemetry.js derives region inline at the one req.ip touchpoint (exactly 2 inline req.ip references, no escaping local), inserts via the 12-arg statement, and its PRIVACY INVARIANT comment reflects the two inline plaintext touches; no-ip-leak + allowlist tests pass.</done>
</task>

<task type="auto">
  <name>Task 4: Housekeeper k>=5 region rollup + public-stats popular_regions</name>
  <files>showcase/server/src/telemetry/housekeeper.js, showcase/server/src/routes/public-stats.js, tests/server-region-aggregation.test.js</files>
  <action>
In `showcase/server/src/telemetry/housekeeper.js`: add a `REGION_K_FLOOR = 5` constant
(HARD per CONTEXT -- do NOT reuse the relaxed `K_ANONYMITY_FLOOR = 2` used for mcp). In
the per-day loop (dayOffset [0,1]), after computing popularMcp/popularAgent, fetch
`queries.selectPopularRegionForDayRange.all(dayStart, dayEnd)` (rows `{region, uniq}`)
and apply the SAME k-floor algorithm already used for popularMcp, but with
REGION_K_FLOOR: regions with `uniq >= 5` pass through unchanged; regions with `uniq < 5`
sum into a single `{ region: 'Other', uniq: <sum-of-below-k> }` bucket; SUPPRESS that
bucket entirely when the below-k sum is itself `< 5`. Treat the `'unknown'` label like
any other region for the floor (it can surface as 'unknown' if it clears k, else folds
into 'Other'). Pass `JSON.stringify(popularRegion)` as the trailing arg to the (now
extended) `queries.upsertGlobalAggregate.run(...)`. Export `REGION_K_FLOOR`.

In `showcase/server/src/routes/public-stats.js` `buildHeadlineJson`: read
`rows.latest_global.popular_region_json`, parse with the existing `safeParseArray`, and
emit a `popular_regions` array of `{label, uniq}` (rows are stored as `{region, uniq}`
-> map `region` to `label`, mirroring the popular_mcp_clients mapping). Add
`popular_regions` to the returned headline object. Keep the typed-fields / no-SELECT-* /
no-Set-Cookie / memo+ETag posture untouched.

Create `tests/server-region-aggregation.test.js` (reuse the in-memory better-sqlite3
harness pattern from server-telemetry-housekeeper.test.js): seed
`insertTelemetryEventWithRegion` rows for a fixed day with controlled distinct-install
counts per region, run `runHousekeeperTick(db, queries, NOW)`, then read
`telemetry_global_aggregates.popular_region_json` and assert: (a) a region with >=5
distinct installs surfaces with its real uniq; (b) regions with <5 collapse into a
single 'Other' bucket equal to the SUM of their installs; (c) when the total below-k
sum is itself <5 the 'Other' bucket is suppressed (absent); (d) events whose region is
'unknown' are handled by the same floor. Also assert the public headline path:
build the headline JSON via the exported `buildHeadlineJson(queries)` and confirm it
contains a `popular_regions` array shaped `{label, uniq}` with NO raw region below the
floor leaking and no ip_hash/UUID fields present.
  </action>
  <verify>
    <automated>cd /Users/lakshman/conductor/workspaces/fsb/louisville && node tests/server-region-aggregation.test.js && node tests/server-telemetry-housekeeper.test.js && node tests/server-public-stats-headline.test.js && node tests/server-public-stats-no-auth.test.js</automated>
  </verify>
  <done>Housekeeper writes a k>=5-floored popular_region_json (below-k -> single 'Other' sum, suppressed when sum<5); public-stats headline exposes popular_regions as {label, uniq} with no sub-floor/UUID/ip_hash leak; new aggregation test plus existing housekeeper + headline + no-auth tests pass.</done>
</task>

<task type="auto">
  <name>Task 5: /privacy page region disclosure + i18n + no-ip-leak audit hardening</name>
  <files>showcase/angular/src/app/pages/privacy/privacy-page.component.html, showcase/angular/src/locale/messages.xlf, showcase/angular/src/locale/messages.de.xlf, showcase/angular/src/locale/messages.es.xlf, showcase/angular/src/locale/messages.ja.xlf, showcase/angular/src/locale/messages.zh-CN.xlf, showcase/angular/src/locale/messages.zh-TW.xlf, tests/server-no-ip-leak.test.js</files>
  <action>
In `showcase/angular/src/app/pages/privacy/privacy-page.component.html`, update the
Anonymous Usage Telemetry section to disclose server-side region derivation:
  - Clarify the existing intro line (`@@PRIVACY_TELEMETRY_INTRO`, "...without ever
    touching the pages you browse") so it remains accurate: region is derived
    server-side from the request IP at ingest, aggregate-only, never from page content.
  - Clarify the existing "What we do NOT collect" IP bullet (`@@PRIVACY_TELEMETRY_NOT_COLLECT_IP`)
    to note the request IP is ALSO used, transiently and inline, to derive a coarse
    country/US-state label before being discarded -- plaintext IP is still never stored
    or logged.
  - Add a NEW short subsection (or bullets) under the telemetry section explaining the
    region metric: derived from a self-hosted DB-IP IP-to-City Lite dataset (NOT a live
    third-party geo API), stored ONLY in the daily aggregate behind a k>=5 anonymity
    floor (states with fewer than 5 installs collapse to "Other"), with NO per-install
    location profile. Use NEW stable i18n ids prefixed `@@PRIVACY_TELEMETRY_REGION_*`
    (e.g. `_HEADING`, `_DERIVED`, `_KFLOOR`, `_NOPROFILE`). Optionally include the DB-IP
    attribution ("IP Geolocation by DB-IP", https://db-ip.com) here.

i18n (HARD -- `i18nMissingTranslation: error` will fail the build otherwise): for EVERY
new `@@PRIVACY_TELEMETRY_REGION_*` id and any reworded existing id, add a matching
`<trans-unit>` to `messages.xlf` AND a `<target state="translated">` block in all five
non-en locales (de, es, ja, zh-CN, zh-TW). Follow the exact trans-unit/target shape of
the surrounding `PRIVACY_TELEMETRY_*` units already in those files. Provide real (or at
minimum non-empty, plausibly translated) target text in each locale so the build passes.

In `tests/server-no-ip-leak.test.js`: the gate currently bans logging libs + fs writes
+ container pushes referencing req.ip, but does NOT yet positively account for the geo
call site. Strengthen it (do NOT weaken): add a positive assertion block that reads
`showcase/server/src/routes/telemetry.js`, strips comments, and asserts req.ip is
referenced EXACTLY TWICE and that both references are inline arguments to `hashIp(` /
`deriveRegion(` (i.e. permit the new geo-derive call site exactly as it already permits
hashIp(req.ip, db), and fail if a third/un-inlined req.ip reference appears). Keep all
existing banned-pattern checks intact; preserve the final PASS line + exit codes.

Do NOT edit `store-assets/chrome-web-store/privacy-practices-evidence.md`. Its line 14
("Location | DO NOT TICK | No geolocation is collected...") is now stale; this is FLAGGED
for the user in the SUMMARY (see output), not changed here.
  </action>
  <verify>
    <automated>cd /Users/lakshman/conductor/workspaces/fsb/louisville && node tests/server-no-ip-leak.test.js && node tests/showcase-privacy-page.test.js && node tests/showcase-build-smoke.test.js</automated>
  </verify>
  <done>/privacy page discloses server-side region derivation (DB-IP, aggregate-only, k>=5, no per-install profile) with new @@PRIVACY_TELEMETRY_REGION_* ids translated across all 5 locales; reworded INTRO + IP bullets stay accurate; no-ip-leak test now positively asserts exactly-two inline req.ip references and still passes; privacy-page + build-smoke tests pass; evidence.md left unchanged (flagged in SUMMARY).</done>
</task>

</tasks>

<verification>
Run the full set of touched + adjacent server/privacy tests:

```
cd /Users/lakshman/conductor/workspaces/fsb/louisville
node tests/server-ip-geo.test.js
node tests/server-region-aggregation.test.js
node tests/server-telemetry-housekeeper.test.js
node tests/server-telemetry-optout-forget.test.js
node tests/server-telemetry-allowlist.test.js
node tests/server-no-ip-leak.test.js
node tests/server-public-stats-headline.test.js
node tests/server-public-stats-no-auth.test.js
node tests/showcase-privacy-page.test.js
node tests/showcase-build-smoke.test.js
```

Privacy-invariant spot check (must print exactly 2):

```
node -e "const s=require('fs').readFileSync('showcase/server/src/routes/telemetry.js','utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/[^\n]*/g,'\$1');console.log('req.ip refs:',(s.match(/req\.ip/g)||[]).length)"
```

Graceful-degradation spot check (server boots, geo returns unknown with no dataset):

```
DBIP_DATASET_PATH=/nonexistent/none.csv node -e "const {deriveRegion}=require('./showcase/server/src/utils/ip-geo.js');console.log(deriveRegion('8.8.8.8'))"  # -> unknown
```
</verification>

<success_criteria>
- Region derived from req.ip at ingest via self-hosted DB-IP IP-to-City Lite + our own
  binary-search lookup (NOT MaxMind, no live geo API).
- Plaintext req.ip referenced exactly twice in telemetry.js (hashIp + deriveRegion),
  both inline, never logged/stored; tests/server-no-ip-leak.test.js passes and now
  positively asserts this.
- Region stored only in the daily aggregate behind a k>=5 floor (sub-5 states -> 'Other',
  bucket suppressed when below-k sum < 5); no durable (install_uuid -> state) profile.
- Server boots + ingests normally with NO dataset present; deriveRegion returns 'unknown';
  the ~100MB DB-IP file is not committed (refresh script + tiny fixture only).
- /api/public-stats/global headline exposes popular_regions (typed, no UUID/ip_hash leak).
- /privacy page discloses server-side region derivation, k>=5 floor, aggregate-only,
  no plaintext storage; new i18n ids translated across all 5 locales; build passes.
- store-assets/chrome-web-store/privacy-practices-evidence.md left unchanged; its stale
  "No geolocation is collected" line flagged in the SUMMARY.
- DB-IP attribution present at the refresh script + data/README.md.
- DEFERRED, noted in SUMMARY: rich /stats region map/visual UI + optional /stats footer
  DB-IP credit.
</success_criteria>

<output>
Create `.planning/quick/260630-hct-anon-region-telemetry/260630-hct-SUMMARY.md` when done.

The SUMMARY MUST include a clearly-marked FLAG section, e.g.:

> **ACTION REQUIRED (user):** `store-assets/chrome-web-store/privacy-practices-evidence.md`
> line 14 still reads "Location | DO NOT TICK | No geolocation is collected." This is now
> STALE -- the server derives a coarse, aggregate, k>=5-floored region from the request IP.
> Per CONTEXT this file was intentionally NOT edited; the user handles the Chrome Web Store
> "Location" data-use disclosure. Update that row (and the CWS Location toggle) before the
> next store submission.

And a DEFERRED section noting the rich /stats region map/visual UI (and the optional
/stats footer DB-IP attribution credit that would accompany it) were scoped out of this
quick task for a follow-up.
</output>
