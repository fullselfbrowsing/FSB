---
phase: 67-hosted-jev-gateway-policy-and-shadow-mode
plan: 05
subsystem: database
tags: [jev, gateway, ledger, sqlite, accounting, retention, housekeeper, report-cli, showcase-server]

# Dependency graph
requires:
  - phase: 67-01
    provides: "CONTRACT.KINDS, GATEWAY_FALLBACK_REASONS, CLIENT_ONLY_FALLBACK_REASONS, CALIBRATION_STATUSES, USAGE_SOURCES, COST_SOURCES (showcase/server/src/jev/contract.js)"
provides:
  - "jev_decisions and jev_daily tables plus idx_jev_decisions_created_at in initializeDatabase (showcase/server/src/db/schema.js)"
  - "recordDecision, recordAggregateOnly, todaySpendUsd, pruneJevLedger, dayUtcKey, formatDecisionLog, LEDGER_COLUMNS, LEDGER_OUTCOMES, AGGREGATE_ONLY_OUTCOMES (showcase/server/src/jev/ledger.js)"
  - "Read-only operator report CLI runCli / buildReport / buildRecent / openReadOnlyDb (showcase/server/src/jev/report.js)"
  - "Guarded Jev prune step in runHousekeeperTick (showcase/server/src/telemetry/housekeeper.js)"
  - "tests/jev-gateway-ledger.test.js (278 checks; not yet registered, 67-13 registers it)"
affects: [67-09, 67-10, 67-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ledger statements prepared per db in a WeakMap (telemetry-rate-limit.js precedent), never on Queries"
    - "One db.transaction for the ledger INSERT plus the jev_daily UPSERT; a failing UPSERT rolls the ledger row back"
    - "Outcome lists derived from CONTRACT.GATEWAY_FALLBACK_REASONS, so a future gateway reason defaults to aggregate-only (no ledger row)"
    - "TypeError messages are fixed 'jev ledger: invalid <field>' strings that never quote a value"
    - "CJS CLI with runCli(argv, deps) returning an exit code and a require.main guard; lines are collected before printing so a failure prints no partial report"

key-files:
  created:
    - showcase/server/src/jev/ledger.js
    - showcase/server/src/jev/report.js
    - tests/jev-gateway-ledger.test.js
  modified:
    - showcase/server/src/db/schema.js
    - showcase/server/src/telemetry/housekeeper.js

key-decisions:
  - "LEDGER_OUTCOMES = ok + the 9 upstream-stage reasons + server_error; AGGREGATE_ONLY_OUTCOMES = the 7 pre-upstream reasons + server_error; both are filtered from CONTRACT.GATEWAY_FALLBACK_REASONS in contract order, so a reason added later defaults to aggregate-only"
  - "recordDecision enforces null-never-0 as consistency: usage 'unavailable' requires inputTokens null and 'provider' a non-negative safe integer; cost 'unavailable' requires costUsd null and 'provider'/'estimate' a finite non-negative number"
  - "recordDecision also rejects a calibrationStatus outside CONTRACT.CALIBRATION_STATUSES, a servedModel outside the printable 1..128 shape upstream.js accepts, an upstreamStatus outside 100..599, a non-boolean hashKeyPresent and a decisionId with spaces or control characters, so no caller string can reach a column"
  - "jev_daily retention follows the plan text exactly: rows with day_utc before the UTC day 365 days back are deleted, so today plus the 365 prior days are kept (one day more than the telemetry rollups' window)"
  - "formatDecisionLog sanitizes every value (outside-contract values become null and kinds keep only contract members), so the log line stays body-free even for a row recordDecision rejected"
  - "The report prints days newest first and served models by count; ledger rows live 7 days, so the served-model summary never covers more than that"

patterns-established:
  - "Marker scan over every ledger and aggregate cell, with markers planted in unknown row keys"
  - "Rollback proof through a RAISE(ABORT) trigger on jev_daily; prune failure proof through a BEFORE DELETE trigger whose message is a marker that must never be logged"

requirements-completed: [JEV-04, JEV-07]

# Metrics
duration: 10min
completed: 2026-10-16
---

# Phase 67 Plan 05: Jev Ledger, Daily Aggregate, Retention and Operator Report Summary

**Body-free Jev accounting on the existing SQLite db: a per-upstream-attempt ledger and a bounded per-day aggregate written in one transaction (with the spend-cap accrual that reseeds the daily ceiling), 7/365-day retention in the hourly housekeeper behind its own fixed-string guard, and a read-only `node src/jev/report.js` CLI that finds a decision by the decisionId from its log line.**

## Performance

- **Duration:** about 10 min
- **Started:** 2026-10-17T04:13:59Z
- **Completed:** 2026-10-17T04:24:00Z
- **Tasks:** 2 (TDD, 4 commits)
- **Files:** 3 created, 2 modified

## Accomplishments

- **Schema.** `jev_decisions` and `jev_daily` are created in a new `db.exec` call after the telemetry tables and before the guarded `ALTER` blocks. The `schema.js` diff is additions only. No column can hold a goal, URL, origin, title, text, label, element id, hash key or IP. `hash_key_present` is the only hash column.
- **Ledger.** `recordDecision` validates first, then writes the ledger row and the `jev_daily` UPSERT (counts, known tokens, cost by source, `cap_accrued_usd`) in one transaction. `recordAggregateOnly` bumps one `(day, outcome)` counter and never writes a ledger row. 1,000 refusals leave 8 aggregate rows and no ledger rows. A `server_error` from either path lands on the same `(day, 'server_error')` row, and the post-upstream accrual is visible through `todaySpendUsd`.
- **Retention.** `runHousekeeperTick` prunes the Jev tables in a separate `try { pruneJevLedger(db, nowMs); } catch { console.error('[housekeeper] jev prune failed'); }` after the existing block. The existing block and its `tick failed:` message are byte-identical. The prune also runs when the telemetry steps fail.
- **Report.** `node src/jev/report.js` reads the db with `{readonly: true, fileMustExist: true}`. It prints per-day outcomes, usage, cost and cap accrual, plus served models with their calibration statuses. `--recent N` lists the newest rows keyed by decisionId. Any failure prints only `jev-report: failed`.

## Final DDL (showcase/server/src/db/schema.js)

```sql
-- jev_decisions: per-decision Jev accounting; body-free (no goal, URL, origin, title, text, label, element id, hash key or IP); 7-day retention.
CREATE TABLE IF NOT EXISTS jev_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  day_utc TEXT NOT NULL,
  outcome TEXT NOT NULL,
  served_model TEXT,
  instrument_version TEXT,
  calibration_status TEXT,
  kinds TEXT NOT NULL,
  element_count INTEGER NOT NULL,
  request_bytes INTEGER NOT NULL,
  input_tokens INTEGER,
  usage_source TEXT NOT NULL,
  cost_usd REAL,
  cost_source TEXT NOT NULL,
  upstream_latency_ms INTEGER,
  gateway_latency_ms INTEGER NOT NULL,
  upstream_status INTEGER,
  hash_key_present INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jev_decisions_created_at ON jev_decisions(created_at);

-- jev_daily: per UTC day and outcome; 365-day retention.
CREATE TABLE IF NOT EXISTS jev_daily (
  day_utc TEXT NOT NULL,
  outcome TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  input_tokens_known INTEGER NOT NULL DEFAULT 0,
  input_tokens_unavailable INTEGER NOT NULL DEFAULT 0,
  cost_provider_usd REAL NOT NULL DEFAULT 0,
  cost_estimate_usd REAL NOT NULL DEFAULT 0,
  cost_unavailable INTEGER NOT NULL DEFAULT 0,
  cap_accrued_usd REAL NOT NULL DEFAULT 0,
  UNIQUE(day_utc, outcome)
);
```

(The source also has further SQL comment lines on the write policy, null-never-0 and the spend-cap accumulator.)

## Report usage

```
usage: node src/jev/report.js [--days N (1..365)] [--recent N (1..200)] [--db PATH]
```

- No flags means `--days 7`.
- `--days N` prints:
  - one `jev-report days=N from=… to=… day_rows=… models=…` header;
  - one `day <YYYY-MM-DD> requests=… outcomes=ok:3,timeout:1 tokens_known=… tokens_unavailable=… cost_provider_usd=… cost_estimate_usd=… cost_unavailable=… cap_accrued_usd=…` line per day, newest first;
  - one `model <servedModel|null> n=… calibration=calibrated:2,snapshot_changed:1` line per served model.
- `--recent N` prints a `jev-report recent limit=N rows=…` header and one line per row: `decision <decisionId> created=<ISO> outcome=… served_model=… instrument_version=… calibration=… kinds=… elements=… bytes=… input_tokens=… usage_source=… cost_usd=… cost_source=… upstream_ms=… gateway_ms=… upstream_status=… hash_key_present=0|1`. Unknown values print as `null`, never 0.
- Giving both flags prints both sections.
- `--flag=value` also works. A repeated, unknown or out-of-range flag, or a positional argument, prints the usage line and exits 2. The usage line never echoes the argument.
- Database: `--db PATH`, else `DB_PATH` (`/data/fsb-data.db` in the image), else `showcase/server/fsb-data.db`. A failure exits 1 with only `jev-report: failed`.

On the Fly machine: `fly ssh console -C "node src/jev/report.js --recent 5"` and `fly ssh console -C "node src/jev/report.js --days 1"`.

## Ledger API notes for 67-09 (router)

- `recordDecision(db, row, {capUsd})` throws a `TypeError` with the fixed message `jev ledger: invalid <field>` and writes nothing when:
  - outcome is not in LEDGER_OUTCOMES;
  - kinds is not a non-empty array of unique CONTRACT.KINDS members;
  - elementCount or requestBytes is not a non-negative safe integer;
  - decisionId is not 1..64 printable, space-free ASCII characters;
  - createdAtMs is not a non-negative safe integer;
  - a source is outside CONTRACT, or a value disagrees with its source (`unavailable` requires null, the other sources require a number);
  - calibrationStatus is not null or a CALIBRATION_STATUSES member;
  - servedModel is not null or `^[\x21-\x7E]{1,128}$`;
  - instrumentVersion is not null or 1..64 printable characters;
  - upstreamStatus is not null or an integer in 100..599;
  - gatewayLatencyMs is missing or negative;
  - hashKeyPresent is not a boolean;
  - capUsd is not a finite number of at least 0.
- Latencies may be fractional and are rounded. Unknown row keys are ignored. `null` and `undefined` are both accepted as "absent" for nullable fields.
- The post-upstream `server_error` row the router builds (calibrationStatus null, usage and cost `unavailable` with null when the attempt had no ok result) satisfies these rules. The suite covers this case.
- `recordAggregateOnly(db, {dayUtc, outcome})` and `todaySpendUsd(db, dayUtc)` throw a `TypeError` for a day that does not match `^\d{4}-\d{2}-\d{2}$`.
- `formatDecisionLog(row)` never throws.

## Task Commits

1. **Task 1: Jev tables in initializeDatabase and the transactional body-free ledger**
   - `8e9dd400` (test, RED: 26 failing)
   - `c10d7a68` (feat, GREEN: 173 passed)
2. **Task 2: Retention in the housekeeper and the read-only operator report CLI**
   - `11379c05` (test, RED: 8 failing, including report.js MODULE_NOT_FOUND)
   - `9ff30770` (feat, GREEN: 278 passed)

No refactor commits were needed.

## Files Created/Modified

- `showcase/server/src/db/schema.js`: added the two tables and the index in a new `db.exec` call. No existing statement was changed.
- `showcase/server/src/jev/ledger.js`:
  - the ledger API, the frozen outcome lists, LEDGER_COLUMNS and the WeakMap statement cache;
  - it never logs.
- `showcase/server/src/jev/report.js`:
  - `runCli`, `buildReport`, `buildRecent`, `openReadOnlyDb`;
  - the `require.main` guard;
  - it never prints an error message or stack.
- `showcase/server/src/telemetry/housekeeper.js`:
  - the `pruneJevLedger` require;
  - a header comment line for step 6;
  - the separate guarded prune step.
  - `startHousekeeper`, intervals and exports are unchanged.
- `tests/jev-gateway-ledger.test.js`: a plain-script suite with these sections:
  - schema;
  - recordDecision;
  - rejections and rollback;
  - outcome lists;
  - aggregate-only;
  - spend;
  - dayUtcKey;
  - prune;
  - formatDecisionLog;
  - static checks;
  - housekeeper;
  - report (in-memory, temp-file and child-process cases).

## Verification

- `node tests/jev-gateway-ledger.test.js`: 278 passed, 0 failed.
- `node tests/server-telemetry-housekeeper.test.js` (40/0), `node tests/server-telemetry-body-cap.test.js` (3/0), `node tests/server-no-ip-leak.test.js` and `node tests/showcase-route-fallback.test.js` all exit 0.
- All 21 `tests/server-*` suites that initialize the schema or run the housekeeper exit 0.
- The existing jev suites (contract 329, config 345, upstream 468, instrument 149, calibration-profile 156) still pass.
- Acceptance greps:
  - each `CREATE TABLE IF NOT EXISTS jev_*` appears once;
  - `git diff 5c255950 -- showcase/server/src/db/schema.js | grep -E "^-[^-]"` is empty;
  - no `console.` or `err.message` in `ledger.js`;
  - no `err.message`, `error.message` or `.stack` in `report.js`;
  - `[housekeeper] tick failed:` and `[housekeeper] jev prune failed` each appear once.
- Node 20 (`/tmp/fsb-node20/.../node`): `--check` passes on all five files, and `ledger.js` and `report.js` load and run without better-sqlite3. The full suite needs better-sqlite3, which is built for Node 24 locally. It runs under Node 20 in the 67-13 scratch copy or in CI at V6.

## Decisions Made

See `key-decisions` in the frontmatter. In short:

- The outcome lists are derived from the contract.
- Null-never-0 is enforced as consistency between each value and its source.
- Calibration status, served model and HTTP status are validated, so no caller string can reach a column.
- The 365-day aggregate retention follows the plan's cutoff text exactly.
- The decision log line sanitizes its values.
- The report lists days newest first and served models by count.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Stricter ledger validation and a value-sanitizing log line**
- **Found during:** Task 1
- **Issue:** The plan lists the minimum TypeError cases. Without more checks, a caller string in calibrationStatus, servedModel or instrumentVersion could have been stored. A usage or cost value could also have disagreed with its source (for example 0 with `unavailable`). And a marker in a rejected row's kinds could have reached the log line, which 67-09's log-hygiene tests forbid.
- **Fix:** recordDecision now applies the extra checks listed under "Ledger API notes for 67-09". `formatDecisionLog` turns any value outside the contract into null and keeps only contract kinds. All checks are covered in the suite.
- **Files modified:** `showcase/server/src/jev/ledger.js`, `tests/jev-gateway-ledger.test.js`
- **Commit:** `c10d7a68`

**2. [Additive] Extra exports and CLI conveniences**
- `report.js` also exports `openReadOnlyDb`, which the read-only test uses.
- `runCli` accepts an optional `deps.now` clock, so in-memory tests can use a fixed day.
- `runCli` accepts `--flag=value`, and prints both sections when given both flags.
- `ledger.js` also exports `DECISION_RETENTION_MS` and `DAILY_RETENTION_DAYS`.
- No interface named in the plan changed.

**3. [Comment only] Housekeeper header**
- The housekeeper's header comment gains a step 6 line describing the Jev prune. No code outside the new guarded step changed.

## Known Stubs

None.

## Deferred to Validation Block

- Deferred: M-67-06 (Validation Block V2). Read one real decision's `[jev] decision` log line in `fly logs`. Find its ledger row over `fly ssh console` with `node src/jev/report.js --recent 5` by matching the decisionId, then read the daily aggregate with `node src/jev/report.js --days 1`. Confirm that no body, URL, origin, goal, title, text, label, element id, hash key, IP or credential is present.
- Node 20 run of `tests/jev-gateway-ledger.test.js` (needs a better-sqlite3 build for Node 20): 67-13 scratch copy, or CI at V6 (M-67-12).

## Next Phase Readiness

- 67-09 can import `recordDecision`, `recordAggregateOnly`, `todaySpendUsd`, `dayUtcKey`, `formatDecisionLog`, `LEDGER_OUTCOMES` and `AGGREGATE_ONLY_OUTCOMES` from `../jev/ledger` as specified.
- 67-13 registers `node tests/jev-gateway-ledger.test.js` in package.json and REFINEMENT_ROOT_TEST_COMMANDS. This plan did not touch package.json.

## Self-Check: PASSED

- FOUND: showcase/server/src/jev/ledger.js
- FOUND: showcase/server/src/jev/report.js
- FOUND: tests/jev-gateway-ledger.test.js
- FOUND: showcase/server/src/db/schema.js (jev tables)
- FOUND: showcase/server/src/telemetry/housekeeper.js (guarded prune step)
- FOUND commits: 8e9dd400, c10d7a68, 11379c05, 9ff30770
