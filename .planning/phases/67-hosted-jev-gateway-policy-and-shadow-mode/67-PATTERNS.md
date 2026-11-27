# Phase 67: Hosted Jev Gateway, Policy, and Shadow Mode - Pattern Map

**Mapped:** 2026-10-15
**Files analyzed:** 51 (34 new source/data/test files, 17 modified or registration files, counting each optional file once)
**Analogs found:** 48 / 51 (3 have only a partial analog; see "No Analog Found")

All line numbers were read at HEAD `469907cb`. Two corrections to CONTEXT/RESEARCH line refs:
- The agent-engine `importScripts` block in `extension/background.js` runs **803-818**, not 803-816. `ai/tool-executor.js` is at 816, `ai/agent-loop.js` at 817 and `ai/model-discovery.js` at 818. The new loads go after **818**.
- `REFINEMENT_ROOT_TEST_COMMANDS` in `tests/delegation-phase-contract.test.js` opens at line 129. Its last entry, the Phase 66 bench `node --test …` command, is at line 160, and the array closes at 161.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `showcase/server/src/routes/jev.js` | route (router factory) | request-response | `showcase/server/src/routes/telemetry.js` | exact |
| `showcase/server/src/jev/contract.js` | config (frozen enums/caps) | transform | `showcase/server/src/routes/telemetry.js:53-83` (allowlist Sets + caps) + `scripts/bench/lib/identity.mjs:24` (`Object.freeze` code list) | role-match |
| `showcase/server/src/jev/scrubber.js` | utility | transform | `extension/utils/redactForLog.js:26-35` | role-match |
| `showcase/server/src/jev/validator.js` | utility (exact-key validator) | transform | `showcase/server/src/routes/telemetry.js:89-142` (`validateEvent`) + `scripts/bench/lib/tasks.mjs:303-368` (`validateTask`) | exact |
| `showcase/server/src/jev/config.js` | config (boot env) | batch (read once) | `showcase/server/src/middleware/telemetry-rate-limit.js:84-87` + `showcase/server/src/telemetry/github-poller.js:25,969-973` | role-match |
| `showcase/server/src/jev/instrument.js` | service (builds upstream body) | transform | `scripts/bench/lib/identity.mjs:53-77` (canonicalJson/sha256Hex only) | partial |
| `showcase/server/src/jev/upstream.js` | service (outbound HTTP client) | request-response | `showcase/server/src/telemetry/github-poller.js:351-389` (`buildHeaders`, `fetchOnePage`) | exact |
| `showcase/server/src/jev/calibration.js` | service | transform | `scripts/bench/lib/identity.mjs:22,125-127` (`SERVED_MODEL_PATTERN`, `servedModelMatches`) | role-match |
| `showcase/server/src/jev/profiles/uncalibrated.json` | config (data) | file-I/O | `scripts/bench/tasks/core.lock.json` (versioned committed JSON with `schemaVersion` + `note`) | partial |
| `showcase/server/src/jev/ledger.js` | model (SQLite writes) | CRUD | `showcase/server/src/db/schema.js:160-338` + `showcase/server/src/db/queries.js:260-284` + `routes/telemetry.js:305-331` (`db.transaction`) | exact |
| `showcase/server/src/jev/report.js` | utility (read-only CLI) | batch | `scripts/bench/report.mjs:567-595` (`runCli` + main guard) | role-match (ESM to CJS) |
| `showcase/server/server.js` (modify) | config (wiring) | request-response | itself, `:10`, `:101`, `:131-144`, `:299-307`, `:367-372` | exact |
| `showcase/server/src/middleware/global-json-parser.js` (modify) | middleware | request-response | itself (`:1-19`) | exact |
| `showcase/server/src/db/schema.js` (modify) | migration | CRUD | itself, `:160-338` (`CREATE TABLE IF NOT EXISTS`) + `:340-410` (guarded `ALTER`) | exact |
| `showcase/server/src/db/queries.js` (modify, optional) | model | CRUD | itself, `:16-20`, `:260-284` | exact |
| `showcase/server/src/telemetry/housekeeper.js` (modify) | service (retention tick) | batch | itself, `:134-265` | exact |
| `showcase/server/.env.example` (modify) | config | n/a | itself, `:5-7` (`GITHUB_TOKEN=` documented empty) | exact |
| `extension/ai/jev-state.js` | utility (sanitizer, state builder, mirrored contract) | transform | `extension/ai/screenshot-attachments.js:6-7,328-343` (IIFE + dual export) + `extension/utils/network-capture-redactor.js:202-222` + `extension/ai/ai-integration.js:3598-3609` | role-match |
| `extension/ai/jev-client.js` | service (HTTPS client) | request-response | `extension/ai/model-discovery.js:402-436,523-550` + `extension/utils/telemetry-collector.js:60,144-149` | exact |
| `extension/ai/jev-policy.js` | utility (pure tighten-only policy) | transform | `extension/ai/hooks/permission-hook.js:34-52` + `extension/ai/hooks/safety-hooks.js` (result shapes) + `extension/utils/capability-router.js:439-589` (consent decisions) | partial (shapes only) |
| `extension/background.js` (modify) | config (SW loader) | n/a | itself, `:803-818` | exact |
| `scripts/bench/shadow/lib/records.mjs` | model (record schema + loader) | file-I/O | `scripts/bench/lib/tasks.mjs:303-445` (`validateTask`, `loadTasks`, `corpusLock`) | exact |
| `scripts/bench/shadow/lib/score.mjs` | utility (statistics) | transform | `scripts/bench/lib/stats.mjs:52-79` (`wilson`, `summarize`) | role-match |
| `scripts/bench/shadow/lib/select.mjs` | utility (threshold selection) | transform | `scripts/bench/lib/stats.mjs:52-56` (`wilson`) | partial |
| `scripts/bench/shadow/lib/fake-upstream.mjs` | utility (loopback server) | request-response | `scripts/bench/fixture-server.mjs:207-420` (`startFixtureServer`) | exact |
| `scripts/bench/shadow/run-shadow.mjs` | utility (CLI) | batch | `scripts/bench/run-bench.mjs:195-238,1436-1452` (`parseArgs`, main guard) | exact |
| `scripts/bench/shadow/targets.json` | config (data) | file-I/O | `scripts/bench/tasks/core.lock.json` | role-match |
| `scripts/bench/shadow/records/*.json` | data | file-I/O | `scripts/bench/tasks/core/*.json` (one file per id) | role-match |
| `scripts/bench/shadow/answers/fake-upstream.json` | data (recorded answers) | file-I/O | `tests/fixtures/bench/xai-chat-completion.json` | role-match |
| `scripts/jev/gateway-smoke.mjs` (optional) | utility (CLI) | request-response | `scripts/bench/report.mjs:567-595` | role-match |
| `tests/fixtures/jev-fake-upstream.js` | test helper | request-response | `scripts/bench/fixture-server.mjs:375-405` + `tests/fixtures/model-discovery-responses.js` | role-match |
| `tests/fixtures/jev-scrubber-corpus.json` | test fixture | file-I/O | `tests/fixtures/bench/infra-classification-cases.json` | role-match |
| `tests/jev-gateway-router.test.js` | test | request-response | `tests/server-telemetry-body-cap.test.js` | exact |
| `tests/jev-gateway-upstream.test.js` | test | request-response | `tests/server-telemetry-body-cap.test.js` + `tests/server-github-poller.test.js:44-60` | exact |
| `tests/jev-gateway-log-hygiene.test.js` | test | request-response | `tests/server-telemetry-housekeeper.test.js:229-247` (console capture) + body-cap harness | exact |
| `tests/jev-gateway-ledger.test.js` | test | CRUD | `tests/server-telemetry-housekeeper.test.js` (`:memory:` DB + `runHousekeeperTick(db, queries, NOW)`) | exact |
| `tests/jev-gateway-config.test.js` | test | transform | `tests/stuck-action-repetition.test.js:17-38` (plain check/assert script) | role-match |
| `tests/jev-instrument.test.js` | test | transform | `tests/stuck-action-repetition.test.js` | role-match |
| `tests/jev-calibration-profile.test.js` | test | transform | `tests/stuck-action-repetition.test.js` | role-match |
| `tests/jev-state.test.js` | test | transform | `tests/stuck-action-repetition.test.js` | role-match |
| `tests/jev-client.test.js` | test | request-response | `tests/model-discovery-runtime.test.js:17-50` (fetch mock) | exact |
| `tests/jev-policy-tighten-only.test.js` | test | transform | `tests/stuck-action-repetition.test.js:17-48` (real `detectStuck` export) + `tests/hook-pipeline.test.js` | exact |
| `tests/jev-contract-parity.test.js` | test (parity) | transform | `tests/delegation-sidepanel-tab-follow.test.js:548-610` + `tests/mcp-pricing-data-parity.test.js` | exact |
| `tests/jev-extension-boundary.test.js` | test (static scan) | file-I/O | `tests/server-no-ip-leak.test.js:33-90` (`walkJsFiles`, `stripComments`) | exact |
| `tests/jev-shadow-records.test.mjs` | test | file-I/O | `tests/bench-corpus.test.mjs:1-45` | exact |
| `tests/jev-shadow-score.test.mjs` | test | transform | `tests/bench-stats.test.mjs:1-33` | exact |
| `tests/jev-shadow-select.test.mjs` | test | transform | `tests/bench-stats.test.mjs` | exact |
| `tests/jev-shadow-harness.test.mjs` | test | request-response | `tests/bench-corpus.test.mjs` (fixture server on port 0) | role-match |
| `tests/lattice-provider-bridge-smoke.test.js` (modify) | test (pin) | n/a | itself, `:600-636`, `:638-684` | exact |
| `tests/delegation-phase-contract.test.js` (modify) | test (registration) | n/a | itself, `:129-161`, `:2379-2383` | exact |
| `package.json` (modify) | config | n/a | `scripts.test` (304-command `&&` chain) | exact |

---

## Pattern Assignments

### `showcase/server/src/routes/jev.js` (route, request-response)

**Analog:** `showcase/server/src/routes/telemetry.js`

**Imports and header pattern** (lines 25-29). Use `'use strict'` CJS, require siblings by relative path, and require nothing that touches the IP. The Jev route must NOT import `clientIp`, `ipKeyGenerator`, `hashIp` or `authMiddleware` (D-07, D-08).
```js
'use strict';

const express = require('express');
const { ipKeyGenerator } = require('express-rate-limit');
const { isValidUuidV4 } = require('../utils/telemetry-hash');
```
For Jev, use `require('express')`, `require('../utils/hash')` (`isValidHashKeyFormat` only) and `require('../jev/…')`.

**Factory with its own parser** (lines 149-154). D-03/D-04 change the signature to `createJevRouter({db, config, fetchImpl, now, log})`, so config is injected and never read from `process.env`.
```js
function createTelemetryRouter(db, queries, hashIp) {
  const router = express.Router();
  // INGEST-07(a): per-route 32 KB body cap. Express emits 413 PayloadTooLarge automatically.
  const bodyCap = express.json({ limit: '32kb' });
```
Jev: `express.json({ limit: '48kb' })` (D-12).

**Route registration with middleware before the handler** (line 162):
```js
  router.post('/events', limiter, bodyCap, (req, res) => {
```
Jev: `router.post('/decide', configGate, bodyCap, (req, res) => { … })`. The config gate runs before the parser, so a `disabled` gateway never parses a body. Telemetry runs its limiter before the parser at line 159 for the same reason. Add no limiter (D-08).

**Whole-request poisoning on one bad field** (lines 227-234):
```js
    // INGEST-09 / D-12: strict allowlist + shape validation per event.
    // ANY validation failure poisons the WHOLE batch (no per-event opt-in).
    for (let i = 0; i < body.events.length; i++) {
      const err = validateEvent(body.events[i]);
      if (err) {
        return res.status(400).json(err);
      }
    }
```
Jev difference: never echo `{error, field}`. Respond only with the typed fallback `{ok:false, fallback:'invalid_request', servedModel:null, httpStatus:null, …}` (the exact D-15 key set). Echoing a field name is fine for telemetry but adds a key outside the locked response schema.

**Local error handler** (lines 432-443). Copy the shape but **do not copy `return next(err)`**. D-22 requires the Jev handler to terminate every error itself, so `server.js:301` (`console.error('Server error:', err.message)`) never sees one.
```js
  router.use((err, _req, res, next) => {
    if (err && (err.status === 413 || err.type === 'entity.too.large')) {
      return res.status(413).json({ error: 'payload_too_large' });
    }
    if (err && (err.status === 400 || err.type === 'entity.parse.failed')) {
      return res.status(400).json({ error: 'invalid_json' });
    }
    return next(err);   // <-- Jev: replace with res.status(500).json(<server_error typed body>); never read err.message / err.body
  });
```

**Exports pattern** (lines 448-456). Default export plus named re-exports so tests can import constants:
```js
module.exports = createTelemetryRouter;
module.exports.createTelemetryRouter = createTelemetryRouter;
module.exports.MCP_CLIENT_ALLOWLIST = MCP_CLIENT_ALLOWLIST;
```

**Async safety (no analog; RESEARCH Pattern 2 is required).** The telemetry handler is synchronous. The Jev handler is `async` (it awaits upstream), and Express 4.22.1 does not catch rejections, so one bug would crash the showcase server. Wrap the whole pipeline: `try { … } catch { respond(500, 'server_error') } finally { if (acquired) sem.release(); clearTimeout(t); }`. Wrap the ledger write in its own inner `try/catch` so a failed accounting write never fails the decision.

**Semaphore (no analog; inline in the router; RESEARCH Pattern 4).** `tryAcquire()` returns false at once when full, so the request gets `busy` and nothing queues. Release exactly once through a local `acquired` flag.

---

### `showcase/server/src/jev/validator.js` (utility, exact-key validator)

**Analog A:** `showcase/server/src/routes/telemetry.js:89-142`. Return `null` on success and an error object on failure, with the unknown-key loop first:
```js
function validateEvent(ev) {
  if (!ev || typeof ev !== 'object' || Array.isArray(ev)) {
    return { error: 'invalid_event_shape' };
  }
  const keys = Object.keys(ev);
  for (const k of keys) {
    if (!ALLOWED_EVENT_FIELDS.has(k)) {
      return { error: 'unknown_field', field: k };
    }
  }
  …
  if (ev.model !== undefined && ev.model !== null) {
    if (typeof ev.model !== 'string' || ev.model.length > MAX_MODEL_LEN) {
      return { error: 'invalid_model' };
    }
  }
  for (const n of ['tokens_in', 'tokens_out']) {
    const v = ev[n];
    if (!Number.isInteger(v) || v < 0 || v > TOKEN_COUNT_CEILING) {
      return { error: `invalid_${n}` };
    }
  }
```
**Analog B (missing *and* unknown keys):** `scripts/bench/lib/tasks.mjs:303-322`, with the helpers `isPlainObject`/`hasOwn` at `:60-66`:
```js
  const expected = set === 'core' ? CORE_KEYS : set === 'live' ? LIVE_KEYS : null;
  const present = Object.keys(task).sort();
  if (expected) {
    for (const key of expected) if (!hasOwn(task, key)) errors.push(`missing key: ${key}`);
  }
  for (const key of present) {
    if (!(expected || ANY_SET_KEYS).includes(key)) errors.push(`unknown key: ${key}`);
  }
```
Apply this at every nesting level D-11 names: top level, `page`, each `elements[i]`, each `recentActions[i]`, and `proposedAction`. Reject the whole request on the first failure (D-11), and reject client `questions`/`instructions`/`criteria`/`model` (D-10) and any element `value` key (D-18). The validator returns only a reason (`invalid_request` | `sensitive_goal`), never the offending value.

---

### `showcase/server/src/jev/contract.js` (config, frozen constants)

**Analog:** `showcase/server/src/routes/telemetry.js:53-83` (allowlists as `Set`, caps as named `const`s with a rationale comment) plus `scripts/bench/lib/identity.mjs:24` (closed code list as `Object.freeze([...])`):
```js
const ALLOWED_EVENT_FIELDS = new Set([
  'event_id', 'install_uuid', 'ts_minute', 'mcp_client', 'model',
  …
]);
const MAX_BATCH = 50;
const MAX_MODEL_LEN = 128;
```
```js
export const PREFLIGHT_REFUSAL_CODES = Object.freeze([
  'config_unavailable',
  'measurement_marker_missing',
```
Jev: the D-16 fallback enum, the kinds, the operation vocabulary, the field caps, `BYTE_BUDGET`, `BODY_LIMIT`, the request/response key sets, `NOUL_DIRECTION` and `none_of_the_above`. Make every value a plain frozen array or object (not a `Set`) so the parity test can `deepStrictEqual` it against the extension copy.

---

### `showcase/server/src/jev/scrubber.js` (utility, transform)

**Analog:** `extension/utils/redactForLog.js:26-35`. Mirror its `fsb-auth.` regex byte-for-byte (D-19):
```js
  var FSB_BRIDGE_SECRET_PATTERN = /fsb-auth\.[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g;
  var FSB_BRIDGE_SECRET_REPLACEMENT = '[REDACTED_FSB_BRIDGE_SECRET]';

  function redactBridgeSecretsInString(value) {
    if (typeof value !== 'string') return value;
    return value.replace(FSB_BRIDGE_SECRET_PATTERN, FSB_BRIDGE_SECRET_REPLACEMENT);
  }
```
Copy the `typeof !== 'string'` passthrough and the `String.prototype.replace` style; `.replace` with a `/g` literal does not carry `lastIndex` between calls (RESEARCH Pitfall 10). Do not use shared `/g` regexes with `.test()`; for `matchesSecret()` use fresh non-global regexes. The pattern order (PEM, JWT, Bearer, key prefixes, `fsb-auth.`, Luhn, high-entropy last) and the typed placeholders must be identical in `extension/ai/jev-state.js`.

---

### `showcase/server/src/jev/config.js` (config, read once at boot)

**Analog A (numeric env):** `showcase/server/src/middleware/telemetry-rate-limit.js:84-87`:
```js
function positiveSafeIntegerEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
```
Jev difference: take an `env` object argument, `loadJevConfig(env)`, never `process.env` directly (D-04: tests pass a plain object). Add a sibling `positiveFiniteEnv` for USD values.

**Analog B (secret from env + one warning line):** `showcase/server/src/telemetry/github-poller.js:25` and `:969-973`:
```js
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || null;
…
function startGithubPoller(db) {
  if (!GITHUB_TOKEN && !tokenWarningLogged) {
    console.warn('[github-poller] GITHUB_TOKEN not set; running unauthenticated with GitHub rate limits');
    tokenWarningLogged = true;
  }
```
Jev: one fixed-string config-error line that names the failing variable only, never its value. Return a frozen `{status:'ok'|'disabled'|'not_configured', …}` and never throw (D-05; `tests/showcase-route-fallback.test.js:99-106` spawns `server.js` with `...process.env` and no Jev variables). Also check the credential charset (`/^[\x21-\x7E]{8,512}$/`) so undici can never echo it (RESEARCH Pitfall 2).

---

### `showcase/server/src/jev/upstream.js` (service, outbound request-response)

**Analog:** `showcase/server/src/telemetry/github-poller.js:351-389`.

**Bearer header** (lines 351-359):
```js
function buildHeaders(accept) {
  const headers = {
    Accept: accept || 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'fsb-showcase-server',
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  return headers;
}
```
**One attempt, AbortController deadline, error body drained without being read, timer cleared in `finally`** (lines 361-389):
```js
async function fetchOnePage(url, accept, ifNoneMatch, fetchImpl) {
  const headers = buildHeaders(accept);
  …
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetchImpl(url, { headers, signal: controller.signal });
    …
    if (!res.ok) {
      try { await res.text(); } catch { /* socket cleanup only */ }
      return { status: res.status, body: undefined, … };
    }
    let body;
    try {
      body = await res.json();
    } catch {
      return { status: 502, body: undefined, … };
    }
    return { status: 200, body, … };
  } finally {
    clearTimeout(timeout);
  }
}
```
**`fetchImpl` injection with a lazy global default** (line 958):
```js
    if (!fetchImpl) fetchImpl = globalThis.fetch;
```
Jev differences:
- Read at most a bounded slice (about 4 KB) of an error body, only to detect `error` on a 200 and to run the unknown-model heuristic. Then drop it.
- Classify into the D-16 reasons (RESEARCH Pattern 5).
- Do not copy the poller's logging at `:946`/`:963` (`err.message`).
- Use `res.text()` plus a guarded `JSON.parse`, so a V8 parse message that quotes the body is caught and discarded, never logged.

---

### `showcase/server/src/jev/ledger.js` + `showcase/server/src/db/schema.js` + (optional) `queries.js` (model, CRUD)

**Analog: table creation inside `initializeDatabase`** (`schema.js:160`, `:178`, and the telemetry tables at `:240-338`). Additive tables with a leading SQL comment that states the retention and privacy invariant:
```js
    -- telemetry_rollups_daily: per-UUID per-day aggregates; 365-day retention; powers Phase 274.
    CREATE TABLE IF NOT EXISTS telemetry_rollups_daily (
      install_uuid TEXT NOT NULL,
      day_utc TEXT NOT NULL,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      …
      UNIQUE(install_uuid, day_utc)
    );

    CREATE INDEX IF NOT EXISTS idx_rollups_day ON telemetry_rollups_daily(day_utc);
```
Jev: `jev_decisions` (per-decision ledger, indexed on the timestamp for the 7-day prune) and `jev_daily` (keyed `day_utc`, or `(day_utc, reason)`). Store **no** goal, URL, origin, title, text, label, element id, hash key or IP (D-24). Nullable `cost_usd`/`input_tokens` carry a source column, null never 0 (D-23). If columns are ever added later, use the guarded-`ALTER` pattern at `schema.js:340-341`:
```js
  try {
    db.exec(`ALTER TABLE agent_runs ADD COLUMN execution_mode TEXT DEFAULT 'ai_initial'`);
  } catch { /* column already exists */ }
```

**Analog: UPSERT counters** (`queries.js:260-280`):
```js
    this.upsertGlobalAggregateV2 = this.db.prepare(`
      INSERT INTO telemetry_global_aggregates (
        day_utc, unique_installs, tokens_in_sum, …
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(day_utc) DO UPDATE SET
        unique_installs = excluded.unique_installs,
        …
```
Jev: increment instead of replace (`SET requests = requests + 1, …`).

**Analog: prune statements** (`queries.js:283-284`):
```js
    this.deleteOldEvents = this.db.prepare('DELETE FROM telemetry_events WHERE received_at < ?');
    this.deleteOldRollups = this.db.prepare('DELETE FROM telemetry_rollups_daily WHERE day_utc < ?');
```

**Analog: one transaction per write** (`routes/telemetry.js:310-330`):
```js
      const tx = db.transaction((rows) => {
        let n = 0;
        for (const e of rows) {
          const r = queries.insertTelemetryEventWithRegionV3.run(…);
          n += r.changes;
        }
        return n;
      });
      inserted = tx(budgetAccepted);
```
Jev: `recordDecision()` writes the ledger row and the daily UPSERT in one `db.transaction`.

**Placement recommendation.** Prepare the Jev statements inside `ledger.js` (cached per `db`, as `telemetry-rate-limit.js` does with its `WeakMap` statement cache) rather than on `Queries`. Reason: `tests/server-telemetry-housekeeper.test.js:231-233` passes a `brokenQueries` object with only `deleteOldEvents`. A Jev prune that reads `queries.<jevStatement>` would throw a TypeError in that test. The test would still pass, but the coupling is needless.

---

### `showcase/server/src/telemetry/housekeeper.js` (modify; batch)

**Analog:** itself, `runHousekeeperTick` (lines 134-139, 261-264):
```js
function runHousekeeperTick(db, queries, nowMs = Date.now()) {
  try {
    if (!queries) queries = new Queries(db);

    // Step 1: 7-day raw-event retention.
    queries.deleteOldEvents.run(nowMs - SEVEN_DAYS_MS);
    …
  } catch (err) {
    // Per CONTEXT "Errors logged but never crash the interval".
    console.error('[housekeeper] tick failed:', err && err.message ? err.message : err);
  }
}
```
**Tripwire:** `tests/server-telemetry-housekeeper.test.js:245-247` asserts the captured stderr contains both `[housekeeper] tick failed` and `synthetic SQL error`, so the existing catch and its message must stay byte-identical. Add Jev pruning as a **separate guarded step after the existing try/catch**, e.g. `try { pruneJevLedger(db, nowMs); } catch { console.error('[housekeeper] jev prune failed'); }`, with a fixed string and no `err.message` (D-22). Reuse `SEVEN_DAYS_MS` (`:45`), `ROLLUP_RETENTION_DAYS` (`:46`) and `dayUtcKey`/`floorToUtcDayMs` (`:117-124`) for the 7-day and 365-day cut-offs.

---

### `showcase/server/server.js` (modify; wiring)

**Analog:** itself.
- Load the config once, after dotenv (line 10):
  ```js
  require('dotenv').config({ path: path.join(__dirname, '.env') });
  ```
  Add `const { loadJevConfig } = require('./src/jev/config');` to the require block (`:12-24`) and call `loadJevConfig(process.env)` after `queries` is built (`:33`).
- Mount beside telemetry and public-stats (lines 131-144). Copy the comment-block style:
  ```js
  // Phase 273 / INGEST-01..13 -- anonymous telemetry ingest (PUBLIC, no auth).
  // Mount order: AFTER trust-proxy line (top of file), AFTER existing routes
  // … BEFORE static-file middleware so the static handler doesn't shadow /api/telemetry/*.
  const createTelemetryRouter = require('./src/routes/telemetry');
  const { hashIp } = require('./src/utils/telemetry-hash');
  app.use('/api/telemetry', createTelemetryRouter(db, queries, hashIp));
  ```
  Jev: `app.use('/api/jev', createJevRouter({ db, config: jevConfig, fetchImpl: globalThis.fetch, now: Date.now, log: console }));`, placed after line 144 and before the static block at line 151.
- Leave the generic error handler (`:299-307`) untouched. It logs `err.message`, which is why the Jev router must terminate every error itself.
- Housekeeper start (`:371-372`) and shutdown (`:380-397`) need no change if pruning lives inside `runHousekeeperTick`.

**Pins to re-run after editing:**
- `tests/server-trust-proxy.test.js:24-27`: regexes require `app.set('trust proxy', 1)` (line 37) to stay before the first `app.use(` and the first `app.use('/api/…')` mount.
- `tests/showcase-build-smoke.test.js:410-424`: parses the `marketingRoutes` and `clientShellRoutes` sets at `server.js:221-243`. Do not touch them.
- `tests/server-ws-phantomstream-relay-compat.test.js:22,99`: substring `maxPayload: RELAY_PER_MESSAGE_LIMIT_BYTES + 1024`.
- `tests/showcase-route-fallback.test.js:99-106`: spawns `server.js` with no Jev env, so boot must survive.

---

### `showcase/server/src/middleware/global-json-parser.js` (modify; middleware)

**Analog:** the whole file (lines 1-19):
```js
function isTelemetryPath(reqPath) {
  return reqPath === '/api/telemetry' || reqPath.startsWith('/api/telemetry/');
}
…
function createGlobalJsonParser() {
  const parser = express.json({ limit: '1mb' });
  return (req, res, next) => isTelemetryPath(req.path) ? next() : parser(req, res, next);
}

module.exports = { createGlobalJsonParser, isTelemetryPath };
```
Add an `isJevPath` sibling (or an `isRouteLocalParserPath` helper) and skip both. Keep the `isTelemetryPath` export, which is imported via the module by `tests/server-telemetry-body-cap.test.js:25` and `tests/server-telemetry-parser-rate-limit.test.js:20`.

---

### `showcase/server/.env.example` (modify)

**Analog:** lines 5-7. Document the secret as an empty value with a scope comment:
```
# Server-only fine-grained GitHub token used by the public Stats cache poller.
# Restrict it to fullselfbrowsing/FSB with Metadata read and Contents read.
GITHUB_TOKEN=
```
Jev: the `JEV_*` block with `JEV_API_KEY=` empty. Never add a Jev variable to `fly.toml [env]` (`fly.toml:7-20`). The Dockerfile copies only `server.js` and `src/` (`Dockerfile:30-31`), on `node:20-alpine` (`:18`) with `NODE_ENV=production` (`:41`).

---

### `showcase/server/src/jev/report.js` (read-only CLI; must live under `src/`)

**Analog:** `scripts/bench/report.mjs:567-595` (`runCli` returns an exit code; one stdout summary line; errors go to stderr without a stack):
```js
  } catch (error) {
    process.stderr.write(`bench-report: ${error && error.message ? error.message : String(error)}\n`);
    return 1;
  }
  …
if (invokedPath === import.meta.url) {
  process.exitCode = runCli(process.argv.slice(2));
}
```
There is no CJS CLI in `showcase/server/` today; nothing uses `require.main === module`. Use `if (require.main === module) process.exitCode = runCli(process.argv.slice(2));`. Jev difference: print only ledger aggregates and, for `--recent N`, the allowlisted body-free ledger columns keyed by `decisionId` (67-05). Never print `error.message` from a SQLite error that might quote a row.

---

### `extension/ai/jev-state.js` (utility, transform; `FsbJevState`)

**Analog A, the IIFE plus dual export:** `extension/ai/screenshot-attachments.js:6-7` and `:328-343`:
```js
(function initScreenshotAttachments(root) {
  'use strict';
  …
  const api = {
    canCapture,
    …
    constants: { MAX_SCREENSHOTS_PER_TURN, MAX_ATTACHMENT_BYTES_PER_TURN }
  };
  root.FsbScreenshotAttachments = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
```
No top-level `const`/`let`/`class` sits outside the IIFE (D-17: shared worker scope).

**Analog B, URL to origin plus path (D-20):** `extension/utils/network-capture-redactor.js:202-214`:
```js
  function _shapeUrl(url) {
    if (typeof url === 'string' && url.length > 0) {
      try {
        var u = new URL(url);
        return { path: _shapePath(u.pathname), origin: u.origin };
      } catch (_e) {
        return { path: '/', origin: null };
      }
    }
```

**Analog C, the injection phrase list to mirror (D-21; do not edit the source):** `extension/ai/ai-integration.js:3598-3609`:
```js
    const INJECTION_PATTERNS = [
      /ignore\s+(all\s+)?previous\s+instructions/gi,
      /you\s+are\s+now\s+(a|an)\b/gi,
      /system\s*prompt/gi,
      /\<\/?(?:system|instruction|prompt|override|admin|root|command|directive)\s*\>/gi,
      /IMPORTANT\s*:\s*(?:ignore|forget|disregard|override|bypass)/gi,
      /(?:disregard|forget)\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions|rules|context)/gi,
      /you\s+must\s+(?:now|instead)\s+(?:act|behave|respond)\s+as/gi,
      /\[\s*(?:SYSTEM|INST|ADMIN|ROOT)\s*\]/gi,
      /BEGIN\s+(?:NEW\s+)?(?:SYSTEM|INSTRUCTIONS?|PROMPT)/gi,
      /END\s+(?:OF\s+)?(?:SYSTEM|INSTRUCTIONS?|PROMPT)/gi,
    ];
```
Do not copy its 500-character truncation (`:3617-3619`); Jev uses its own per-field caps.

**Analog D, the sensitive-element flags the typed input carries (D-18):** `extension/content/dom-analysis.js:368-394`. The `purpose.sensitive` objects are produced content-side:
```js
      if (type === 'password' || /password|pwd|pass/.test(name + id)) {
        return { role: 'credential-input', intent: 'password', sensitive: true, priority: 'high' };
      }
      …
      if (autocomplete.includes('cc-number') || …) {
        return { role: 'payment-input', intent: 'cc-number', sensitive: true, priority: 'high' };
      }
```
`jev-state.js` consumes typed flags (`inputType`, `autocomplete`, `purpose.sensitive`, a vault-filled id set). It never reads the DOM.

---

### `extension/ai/jev-client.js` (service, request-response; `FsbJevClient`)

**Analog A, never-throw fetch with an AbortController timeout:** `extension/ai/model-discovery.js:402-436`:
```js
    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    let timer = null;
    if (controller) {
      timer = setTimeout(() => {
        try { controller.abort(); } catch (_) { /* noop */ }
      }, timeoutMs);
    }

    let response;
    try {
      response = await globalThis.fetch(url, {
        method: 'GET',
        headers,
        signal: controller ? controller.signal : undefined
      });
    } catch (err) {
      if (timer) clearTimeout(timer);
      if (err && (err.name === 'AbortError' || /abort/i.test(String(err.message || '')))) {
        return { ok: false, reason: 'timeout', … };
      }
      return { ok: false, reason: 'network-failed', message: 'Network error: ' + (err && err.message …), provider };
    } finally {
      if (timer) clearTimeout(timer);
    }
```
Jev differences (D-15, RESEARCH Pattern 8):
- Compose the caller's `signal` by hand and keep a `why` flag, so a deadline maps to `timeout` and a caller abort to `aborted`. Do not infer this from `err.name`.
- Never include `err.message` in a result. The two D-15 shapes are exact-key and have no message field.
- Wrap the whole body in `try/catch/finally`.
- Send `method:'POST'`, `credentials:'omit'` and a JSON body; never put data in the query string.

**Analog B, the dual export through an IIFE `global` parameter:** `extension/ai/model-discovery.js:22` and `:523-550`:
```js
(function defineModelDiscovery(global) {
  'use strict';
  …
  const api = { discoverModels, … };
  if (global) {
    …
    global.FSBModelDiscovery = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
```
Export only `FsbJevClient`; do not attach individual functions to the global (no shared-scope collisions).

**Analog C, the fixed endpoint constant (D-09):** `extension/utils/telemetry-collector.js:57-60`:
```js
// Hardcoded endpoint per CONTEXT decision. …
var TELEMETRY_ENDPOINT = 'https://full-selfbrowsing.com/api/telemetry/events';
```
Jev: `'https://full-selfbrowsing.com/api/jev/decide'`, inside the IIFE, overridable only through the factory option `endpoint` (tests). Never read Sync `serverUrl`. Do not copy `keepalive: true` from `:818`.

**Analog D, the lazy fetch resolver:** `extension/utils/telemetry-collector.js:144-149`:
```js
function _resolveFetch() {
  if (typeof _fetchShim === 'function') return _fetchShim;
  if (typeof fetch === 'function') return fetch;
  if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') return globalThis.fetch;
  return null;
}
```
Jev: `opts.fetchImpl || globalThis.fetch`, resolved at call time. A missing fetch returns `network_error` and never throws.

**Lazy resolution of `FsbJevState`:** follow `extension/ai/agent-loop.js:102-104`, but resolve inside the call rather than at load time (no top-level `var`):
```js
var _al_ScreenshotAttachments = (typeof globalThis !== 'undefined' && globalThis.FsbScreenshotAttachments)
  ? globalThis.FsbScreenshotAttachments
  : (_al_screenshotAttachments || null);
```

---

### `extension/ai/jev-policy.js` (pure utility; `FsbJevPolicy`)

**Analogs (output shapes of the real gates it normalizes; JEV-06 tables import these):**
- Permission hook result (`extension/ai/hooks/permission-hook.js:41-51`):
  ```js
      var allowed = permissionContext.isAllowed(context.toolName, context.origin || '');
      if (!allowed) {
        var denial = permissionContext.createDenial(context.toolName);
        return { shouldStop: false, denied: true, denial: denial };
      }
      return { shouldStop: false, denied: false };
  ```
  `toBeforeToolResult()` must emit exactly this family of shapes and **never** `shouldStop:true` (RESEARCH Pattern 10).
- Safety and stuck hook results (`extension/ai/hooks/safety-hooks.js`, `createSafetyBreakerHook`/`createStuckDetectionHook`):
  ```js
        if (result && result.shouldStop) {
          return { shouldStop: true, reason: result.reason, source: 'safetyBreaker' };
        }
  …
        if (result.shouldForceStop) {
          return { shouldStop: true, isStuck: true, hint: result.hint, reason: result.hint, reasonCode: result.reasonCode || null, source: 'stuckDetection' };
        }
        return { shouldStop: false, isStuck: true, hint: result.hint, reasonCode: result.reasonCode || null, source: 'stuckDetection' };
  ```
- `HookPipeline.emit` stops at the first `shouldStop:true` (`extension/ai/hook-pipeline.js:146-151`):
  ```js
      if (result && typeof result === 'object' && result.shouldStop === true) {
        stopped = true;
        stoppedBy = result.reason || null;
        break;
      }
  ```
  The `BEFORE_TOOL_EXECUTION` consumer at `extension/ai/agent-loop.js:2291-2299` checks only `results.find(r => r && r.denied)`.
- Consent decisions in `extension/utils/capability-router.js` `_evaluateConsent` (`:439`): `'off'` `:453,490,500,516`; `'blocked'` `:468`; `'allow'` `:487,589`; `'ask'` `:526`; `'mutating_required'` `:570`.
- Payment-fill confirmation in `extension/ai/tool-executor.js`: `{approved:false, reason:'timeout'}` `:539`; `'user_declined'` `:551,580`; `'sidepanel_unavailable'` `:569`.
- `checkSafetyBreakers(session)` `extension/ai/agent-loop.js:257` returns `{shouldStop:true, reason}`; `detectStuck(session, toolResults)` `:309`; both are exported at `:3183`.

The module shell copies the `screenshot-attachments.js` IIFE pattern above. The strictness lattice itself has no analog; see RESEARCH Pattern 9.

---

### `extension/background.js` (modify; SW loader)

**Analog:** the agent-engine block, lines 802-818:
```js
// Agent loop engine modules (Phase 181: re-enable modular agent loop per D-01, D-02)
importScripts('ai/engine-config.js');
…
importScripts('ai/agent-loop.js');
importScripts('ai/model-discovery.js');

// Memory layer modules
```
Insert `importScripts('ai/jev-state.js');`, `importScripts('ai/jev-client.js');` and `importScripts('ai/jev-policy.js');` directly after line 818, with no new comment line containing the word `importScripts` (comments count toward the token pin). Use the plain form; the `try { importScripts(…) } catch` form at `:110` is for optional modules.

**Paired pin update, same commit:** `tests/lattice-provider-bridge-smoke.test.js`
- `:636` `passAssertEqual(importScriptsCount, 334, …)` becomes 337. Extend the ledger comment ending at `:634-635` (`The retained debugger session manager adds one shared load -> 334.`) with a sentence for the three Jev loads.
- `:684` `passAssertEqual(importScriptsCallSites, 330, …)` becomes 333. Extend the ledger ending at `:682` (`The debugger session manager is call site 330.`).
- Update both assertion message strings as well; they currently name the debugger session manager.

`scripts/validate-extension.mjs:122` already includes `ai` in `EXT_DIRS`, so `node --check` covers the new files with no edit.

---

### `scripts/bench/shadow/lib/records.mjs` (model, file-I/O)

**Analog:** `scripts/bench/lib/tasks.mjs`.
- Header comment plus imports (`:1-24`). Node ESM, `node:` built-ins, sibling lib import:
  ```js
  import fs from 'node:fs';
  import path from 'node:path';
  import { fileURLToPath } from 'node:url';

  import { canonicalJson, sha256Hex } from './identity.mjs';
  const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
  ```
  Shadow: `import { canonicalJson, sha256Hex } from '../../lib/identity.mjs';` and `import { loadTasks, corpusLock, BENCH_TASKS_ROOT } from '../../lib/tasks.mjs';`.
- `validateTask` returns `{ ok, errors }` and collects every error (`:303-368`), with exact keys via `hasOwn`/`unknownKeyErrors` (`:64-66`, `:162-165`).
- `loadTasks` reads a directory, validates each file, checks that the file name equals `<id>.json`, throws one aggregated Error, and returns the records sorted and deep-frozen (`:383-424`; `deepFreeze` at `:370-376`).
- Lock references: `corpusLock(tasks)` (`:441-445`) yields `[{id, version, fixtureSha256}]` to compare against `scripts/bench/tasks/core.lock.json` `.tasks`. Read the lock; never write it (Phase 66 D-15).
- Also validate each record's `request` with the **server** validator through `createRequire(import.meta.url)('../../../../showcase/server/src/jev/validator.js')`.

---

### `scripts/bench/shadow/lib/score.mjs` and `select.mjs` (utility, statistics)

**Analog:** `scripts/bench/lib/stats.mjs`.
- `wilson` (`:52-56`). Pass the Bonferroni z as the third argument:
  ```js
  export function wilson(successes, n, z = 1.959963984540054) {
    if (!n) return [NaN, NaN]; const p = successes / n; const d = 1 + z * z / n;
    const c = p + z * z / (2 * n); const m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
    return [(c - m) / d, (c + m) / d];
  }
  ```
- "Null, never 0" for empty data (`summarize`, `:59-75`):
  ```js
  export function summarize(xs) {
    const n = xs.length;
    if (!n) return { n: 0, total: null, median: null, p90: null, min: null, max: null };
  ```
- Seeded determinism for synthetic proof data: `mulberry32` (`:20-24`).
- File header style: a module doc comment stating "Pure and seeded … nothing here reads the clock, the environment or the filesystem" (`:1-15`).

Selection logic itself (grid, tie band, recall/precision modes, `not_a_fit`) has no analog; use the RESEARCH "Selection on the signal axis" sketch and Pattern 11.

---

### `scripts/bench/shadow/lib/fake-upstream.mjs` and `tests/fixtures/jev-fake-upstream.js` (loopback server)

**Analog:** `scripts/bench/fixture-server.mjs:375-405`. Error-safe handler, port-0 listen with a promise, and idempotent close that kills hanging sockets:
```js
  const server = http.createServer((request, response) => {
    response.on('error', () => {});
    handleRequest(request, response).catch(() => {
      if (!response.headersSent) send(response, 500, { body: 'internal error' });
      else response.destroy();
    });
  });
  …
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port: config.port, host: HOST }, () => {
      server.off('error', reject);
      resolve();
    });
  });
  port = server.address().port;
  …
  function close() {
    if (!closing) {
      closing = new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      });
    }
    return closing;
  }
```
`closeAllConnections` matters for the "hang" mode used by the `busy` and `timeout` tests; without it `server.close` waits forever. Host `127.0.0.1`, port 0, never 7225/7226.

**Canned-response module style:** `tests/fixtures/model-discovery-responses.js:1-14`, `:end`. A doc comment stating "hand-written from documented response shapes … NO real network calls", then `module.exports = { RESPONSE_FIXTURES, ERROR_FIXTURES }`. Make the CJS helper usable from ESM tests via `createRequire`.

---

### `scripts/bench/shadow/run-shadow.mjs` and `scripts/jev/gateway-smoke.mjs` (CLI)

**Analog:** `scripts/bench/run-bench.mjs`.
- `parseArgs(argv)` (`:195-231`): a raw flag map with `BOOLEAN_FLAGS`/`VALUE_FLAGS` sets, `--flag=value` and `--flag value` forms, a repeated-flag error, and an unknown-flag error whose echo is stripped and truncated:
  ```js
      const shown = arg.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 60);
  ```
- `resolveOptions(raw)` validates everything before any side effect (`:240-248`).
- Main guard (`:1436-1452`):
  ```js
  const invokedPath = (() => {
    try {
      return process.argv[1] ? pathToFileURL(fs.realpathSync(process.argv[1])).href : null;
    } catch {
      return null;
    }
  })();
  if (invokedPath === import.meta.url) {
    main(process.argv.slice(2)).then((code) => {
      process.exitCode = code;
      setTimeout(() => process.exit(code), 5000).unref();
    }, (error) => { … });
  }
  ```
- Output goes under the gitignored `scripts/bench/.local/` (`.gitignore:83`; `BENCH_LOCAL_ROOT` at `run-bench.mjs:95`). Use `scripts/bench/.local/shadow/<run>.jsonl`.
- Export `main(argv, overrides)` so the harness test can run it in-process with an injected gateway URL.

---

### Data files: `targets.json`, `records/*.json`, `answers/fake-upstream.json`, `src/jev/profiles/uncalibrated.json`

**Analog:** `scripts/bench/tasks/core.lock.json` (top-level `schemaVersion`, a human `note` explaining the freeze rule, then data):
```json
{
  "schemaVersion": 1,
  "note": "Core benchmark set frozen through Phase 71 (D-15). Changing any core task or fixture requires a version bump and a deliberately regenerated lock.",
  "tasks": [
    { "id": "core-click-accordion-drilldown", "version": 1, "fixtureSha256": "63db…" },
```
Name records one file per record id, as `scripts/bench/tasks/core/<id>.json` does (`loadTasks` enforces `file name must be <id>.json`). The 12 core ids are listed at `tests/bench-corpus.test.mjs:28-41`.

---

### Server tests: `tests/jev-gateway-{router,upstream,log-hygiene,ledger,config}.test.js`

**Analog:** `tests/server-telemetry-body-cap.test.js` (whole file, 105 lines).

**Harness: the server's own node_modules, in-memory DB, production middleware order, port 0** (lines 17-48):
```js
const SERVER_NM = path.join(__dirname, '..', 'showcase', 'server', 'node_modules');
const Database = require(require.resolve('better-sqlite3', { paths: [SERVER_NM] }));
const express = require(require.resolve('express', { paths: [SERVER_NM] }));

const { initializeDatabase } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'schema'));
…
const { createGlobalJsonParser } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'middleware', 'global-json-parser'));
…
const db = new Database(':memory:');
initializeDatabase(db);
const app = express();
app.set('trust proxy', 1);
app.use(createGlobalJsonParser());
app.use('/api/telemetry', createTelemetryRouter(db, queries, hashIp));
app.use((err, _req, res, _next) => { … });
const server = http.createServer(app).listen(0);
const port = server.address().port;
```
Jev: the trailing generic handler sets `genericHandlerHit = true`, and the test asserts it stays false (D-22).

**Check helper plus raw `http.request` poster** (lines 51-78):
```js
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}
function postBody(rawBytes) {
  return new Promise((resolve, reject) => {
    const req = http.request({ method: 'POST', host: '127.0.0.1', port, path: '/api/telemetry/events',
      headers: { 'Content-Type': 'application/json', 'Content-Length': rawBytes.length } }, (res) => { … });
```
**Exit protocol** (lines 99-104): close the server and DB, print `=== … results: N passed, M failed ===`, `process.exit(failed > 0 ? 1 : 0)`.

**Console capture for log hygiene:** `tests/server-telemetry-housekeeper.test.js:233-241`:
```js
const originalErr = console.error;
let errCaptured = '';
console.error = (...args) => { errCaptured += args.join(' ') + '\n'; };
…
console.error = originalErr;
```
Capture `log`, `warn` and `error` (or inject `log` through the factory) and assert that no captured text contains the credential, the goal or the page text.

**Fake fetch for unit-level upstream tests:** `tests/server-github-poller.test.js:44-60` (`response(canned)` with a `headers.get(name)` shim) for cases that need no socket.

---

### Extension unit tests: `tests/jev-{state,client,policy-tighten-only,instrument,calibration-profile}.test.js`

**Analog for direct `require` of a classic SW module plus the plain-script harness:** `tests/stuck-action-repetition.test.js:17-48`:
```js
'use strict';

const { detectStuck } = require('../extension/ai/agent-loop.js');
const { STUCK_REASONS } = require('../extension/ai/turn-result.js');

let passed = 0;
let failed = 0;
function assert(cond, msg) { … }
function assertEqual(actual, expected, msg) { … }

function makeSession() {
  return {
    agentState: { consecutiveNoChangeCount: 0, actionFingerprints: [], stuckWarningCount: 0 },
    actionHistory: []
  };
}
```
`jev-policy-tighten-only.test.js` reuses `makeSession()` to build two fresh, identical sessions per arm (one with hostile Jev fields) and compares the full `detectStuck`/`checkSafetyBreakers` result sequences (RESEARCH Pitfall 7). It requires `HookPipeline`/`LIFECYCLE_EVENTS` from `extension/ai/hook-pipeline.js` (exports at `:199-201`) and `createPermissionHook` from `extension/ai/hooks/permission-hook.js` for the both-orders denial test.

**Analog for the client fetch mock:** `tests/model-discovery-runtime.test.js:41-51`:
```js
const realFetch = globalThis.fetch;
function setFetch(fn) { globalThis.fetch = fn; }
function restoreFetch() { globalThis.fetch = realFetch; }
function jsonResponse(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  });
}
```
Jev: inject through `createJevClient({ fetchImpl, endpoint, now })` rather than patching the global (D-09).

---

### `tests/jev-contract-parity.test.js` (parity)

**Analog A, behavioural producer/validator parity:** `tests/delegation-sidepanel-tab-follow.test.js:548-610`. Require both sides, exercise the shared bound at, below and above the cap:
```js
  console.log('\n--- producer/validator parity: init tool cap ---');
  {
    const Store = require('../extension/utils/delegation-event-store.js');
    const Feed = require('../extension/ui/delegation-feed.js');
    const cap = Store.MAX_ALLOWED_TOOLS;
    …
    check(Feed.validateSnapshot(parity(cap)) === true, 'an init at the ledger cap validates in the feed');
    check(Feed.validateSnapshot(parity(cap + 1)) === false, 'the feed still rejects an init above the ledger cap');
```
**Analog B, a copy-drift gate with a fix hint:** `tests/mcp-pricing-data-parity.test.js:18-46` (reads both copies and prints the first mismatches).

Jev: `require('../showcase/server/src/jev/contract.js')` and `require('../extension/ai/jev-state.js')`, then `assert.deepStrictEqual` every enum and key set. Run both scrubbers over `tests/fixtures/jev-scrubber-corpus.json`, and include a mirror check of the 10 `INJECTION_PATTERNS` sources against `ai-integration.js` (read the source text; do not require `ai-integration.js`).

---

### `tests/jev-extension-boundary.test.js` (static scan)

**Analog:** `tests/server-no-ip-leak.test.js:33-90`:
```js
function stripComments(s) {
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  return s;
}

function walkJsFiles(dir, out) {
  if (out === undefined) out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkJsFiles(full, out);
    else if (e.isFile() && full.endsWith('.js')) out.push(full);
  }
  return out;
}
```
Fail with `file:line -- pattern` and `process.exit(1)` (`:144-151`). Jev scans:
- `extension/` (do NOT strip comments for credential names) for `systemone`, `api.typesafe.ai` and `JEV_` env names. `openrouter.ai` is allowed.
- `extension/ai/jev-*.js` for `chrome.storage`.
- `showcase/server/src/jev/**` and `routes/jev.js` for `err.message`/`err.stack`/`req.ip`/`clientIp(`/`validateHashKey`/`authMiddleware`.
- Callers of `FsbJevClient`/`FsbJevPolicy` outside the modules, so that nothing calls them yet (D-17).

Then evaluate each `jev-*.js` in a `vm` context with no `chrome` and no `fetch` (inert load).

**Tripwire:** `tests/server-no-ip-leak.test.js` walks every `.js` under `showcase/server/src/`, so all new `src/jev/*.js` files are scanned by the existing gate. Never `require('morgan'|'winston'|…)` and never place `req.ip` in an `fs.write*` call.

---

### ESM shadow tests: `tests/jev-shadow-{records,score,select,harness}.test.mjs`

**Analog:** `tests/bench-stats.test.mjs:1-33` and `tests/bench-corpus.test.mjs:1-45`:
```js
// Phase 66 benchmark statistics (D-16): known answers, a known 0.7x effect, …
import assert from 'node:assert/strict';
import test from 'node:test';

import { … wilson } from '../scripts/bench/lib/stats.mjs';

function syntheticTasks({ seed, factor, noise, taskCount = 12, runs = 10 }) {
  const rnd = mulberry32(seed);
  …
}

test('median returns the middle value, …', () => { … });
```
`bench-corpus.test.mjs:25-41` shows the lock path and the 12 core ids:
```js
const LOCK_FILE = path.join(BENCH_TASKS_ROOT, 'core.lock.json');
const CORE_IDS = [ 'core-click-accordion-drilldown', …, 'core-mixed-wizard-submit' ];
```
Never `git show 8a058bdf` in a test, because CI clones at depth 1 (RESEARCH anti-patterns).

---

### Registration: `package.json` + `tests/delegation-phase-contract.test.js` (one final plan)

**Analog:** `tests/delegation-phase-contract.test.js:129-161` and the check at `:2379-2383`:
```js
const REFINEMENT_ROOT_TEST_COMMANDS = Object.freeze([
  'node tests/mcp-bridge-events.test.js',
  …
  'node --test tests/bench-export-history.test.mjs tests/bench-stats.test.mjs … tests/bench-drivers.test.mjs',
]);
…
const rootCommands = packageJson.scripts.test.split(' && ');
for (const command of REFINEMENT_ROOT_TEST_COMMANDS) {
  check(rootCommands.filter((candidate) => candidate === command).length === 1,
    `${command} appears exactly once in the refinements root chain`);
}
```
Append each new command after line 160, and append the identical string to the end of `scripts.test` (304 commands today; the last is the same bench `node --test` command). Do not edit the existing bench command string or any `PRE_PHASE6x` hash. Phases 66.1 and 69 also append here, so append at the end and keep every command unique.

---

## Shared Patterns

### Body-free error handling (D-22), applied to every server file under `src/jev/` and `routes/jev.js`
**Source to copy:** the `routes/telemetry.js:432-443` handler shape. **Sources NOT to copy:**
- `github-poller.js:946,963`, `housekeeper.js:263` and `server.js:301` all log `err.message`.
- `model-discovery.js:431,466,478` embed `err.message` in a result.

Rules:
- Use fixed-string logs only, e.g. `console.warn('[jev] upstream failed', reason)`.
- Never read `err.body` or `err.message`.
- Responses are the typed D-15/D-16 bodies only.

### Typed fallback body and HTTP status (D-16), applied to `routes/jev.js`, `jev-client.js` and the parity test
One frozen status map in `contract.js`, mirrored in `jev-state.js`: 200 ok; 400 `invalid_request`/`sensitive_goal`; 413 `payload_too_large`; 503 `disabled`/`not_configured`/`busy`/`spend_cap_reached`; 502 upstream-derived; 504 `timeout`. The client maps the body first and the status only when the body is missing or malformed.

### Null, never 0, with a source label (D-23), applied to `upstream.js`, `ledger.js`, `jev-client.js` and `score.mjs`
**Source:** `extension/ai/cost-tracker.js:228-230` and `:413-428`:
```js
function _ctNonNegativeOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
…
  if (providerCostUsd !== null) {
    costUsd = providerCostUsd;
    costSource = 'provider';
  } else if (estimateUsd !== null) {
    costUsd = estimateUsd;
    costSource = 'estimate';
  }
```
The server port must be CJS and must not call `CostTracker.estimateCost()`.

### Canonical JSON plus SHA-256 identity (D-10, D-27), applied to `instrument.js` (CJS port), `select.mjs`/`run-shadow.mjs` (import), and the parity test
**Source:** `scripts/bench/lib/identity.mjs:53-77`. Sorted keys at every depth, `undefined`/function values dropped, array order kept, TypeError on a cycle:
```js
export function canonicalJson(value) {
  const seen = new Set();
  const normalize = (node) => {
    if (node === null || typeof node !== 'object') return node;
    if (seen.has(node)) throw new TypeError('Circular value cannot be canonicalized');
    …
      for (const key of Object.keys(node).sort()) {
        const child = node[key];
        if (child !== undefined && typeof child !== 'function') out[key] = normalize(child);
      }
  …
  return JSON.stringify(normalize(value === undefined ? null : value));
}
export function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}
```
The server cannot import ESM from `scripts/` (Docker copies only `src/`), so port it to CJS under `src/jev/`, and have a parity test assert that both produce the same `INSTRUMENT_HASH`.

### Served-model family check (D-25), applied to `calibration.js`
**Source:** `scripts/bench/lib/identity.mjs:22` and `:125-127`:
```js
export const SERVED_MODEL_PATTERN = /^grok-4\.3/;
…
export function servedModelMatches(model) {
  return typeof model === 'string' && SERVED_MODEL_PATTERN.test(model);
}
```
Jev builds the prefix from the configured pin. Escape regex metacharacters, or use `startsWith`, and require that the next character is end of string or `-`.

### Classic SW module shell (D-17), applied to all three `extension/ai/jev-*.js`
**Source:** `extension/ai/screenshot-attachments.js:6-7,328-343` (shown above). An IIFE takes `root`, `'use strict'`, no top-level bindings, `root.FsbJev* = api`, a `module.exports` guard, and the argument `typeof globalThis !== 'undefined' ? globalThis : self`.

### Injected dependencies for testability, applied to router, upstream, client and harness
**Sources:** `github-poller.js:950,958` (`fetchImpl` parameter, default `globalThis.fetch`), `housekeeper.js:134` (`nowMs = Date.now()`), `telemetry-collector.js:144-149` (lazy fetch). Jev factories take `{fetchImpl, now, log, endpoint}`; tests never mutate `process.env` or globals.

---

## No Analog Found

| File | Role | Data Flow | Reason / what to use instead |
|---|---|---|---|
| `showcase/server/src/jev/instrument.js` (question builder, byte-budget shrink) | service | transform | No code builds a structured-model instrument. Use the RESEARCH "Instrument skeleton" (goal-first state order, `none_of_the_above` on every Choice, criteria keys are element ids such as `e12`, `Buffer.byteLength(JSON.stringify({model, state, questions}), 'utf8') <= ~28000`). Only `canonicalJson`/`sha256Hex` have an analog. |
| `extension/ai/jev-policy.js` strictness lattice (`mergeConfirmation`, `accept`) | utility | transform | Nothing merges gate outputs today. The analogs above cover only the input and output *shapes*. Use RESEARCH Pattern 9 (levels proceed=0, confirm=1, deny=2, stop=3; Jev contributes only `none` or `confirm`) and Pattern 10 (`toBeforeToolResult` never sets `shouldStop:true`). |
| `scripts/bench/shadow/lib/select.mjs` threshold selection | utility | transform | Only `wilson` exists. Use the RESEARCH "Selection on the signal axis" sketch, a small `zOneSided` (Acklam or bisection, tested against 1.644854, 1.959964 and 2.575829), and the Pitfall 6 sample-size table, which predicts that every seed-set question comes out `not_a_fit`. |

## Metadata

**Analog search scope:** `showcase/server/{server.js,src/**,.env.example}`, `Dockerfile`, `fly.toml`, `extension/{background.js,ai/**,utils/**,content/dom-analysis.js}`, `scripts/bench/{lib,tasks,*.mjs}`, `scripts/validate-extension.mjs`, `tests/**` (server-*, bench-*, delegation-*, lattice-*, stuck-*, hook-*, model-discovery-*, *-parity)
**Files scanned:** about 45 read or grepped
**Pattern extraction date:** 2026-10-15
