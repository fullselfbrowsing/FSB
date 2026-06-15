---
phase: 273-server-schema-telemetry-routes-salt-rate-limit-housekeeper
reviewed: 2026-05-14T12:00:00Z
depth: deep
files_reviewed: 8
files_reviewed_list:
  - showcase/server/server.js
  - showcase/server/package.json
  - showcase/server/src/db/schema.js
  - showcase/server/src/db/queries.js
  - showcase/server/src/utils/telemetry-hash.js
  - showcase/server/src/utils/telemetry-salt.js
  - showcase/server/src/middleware/telemetry-rate-limit.js
  - showcase/server/src/routes/telemetry.js
  - showcase/server/src/telemetry/housekeeper.js
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
findings_count: 6
status: findings_found
---

# Phase 273: Code Review Report

**Reviewed:** 2026-05-14T12:00:00Z
**Depth:** deep (privacy + security focus per scope: 9 areas, 0 BLOCKERs found, 2 MAJORs)
**Files Reviewed:** 9 (showcase/server/{server.js, package.json, src/db/{schema,queries}.js, src/utils/{telemetry-hash,telemetry-salt}.js, src/middleware/telemetry-rate-limit.js, src/routes/telemetry.js, src/telemetry/housekeeper.js})
**Status:** findings_found (0 BLOCKER, 2 WARNING, 4 INFO)

## Summary

Phase 273 lands the anonymous telemetry ingest pipeline. The privacy invariant ("plaintext IP read once, immediately hashed, never persisted") is **upheld** at both touch points (routes/telemetry.js:128 and middleware/telemetry-rate-limit.js:54). The CI grep gate (tests/server-no-ip-leak.test.js) audits the whole src/ tree and confirms no `morgan`/`winston`/`pino` access logger and no `fs.append/writeFile` of `req.ip`. The request-logger in server.js:89-98 records only method/path/status/duration — no IP. **No plaintext IP leak vector found.**

Salt rotation race is **clean** — the IMMEDIATE transaction with re-check inside `getOrMintTodaySalt` (telemetry-salt.js:66-78) collapses concurrent boot races onto a single row via PRIMARY KEY constraint. Worst case: one INSERT loses to SQLITE_CONSTRAINT (which `tx.immediate()` would surface as a throw, then the next caller's `selectToday.get()` would observe the winning row).

The 9-field allowlist, 32 KB body cap, 50-event batch cap, 30/min/IP-hash rate-limit, and 1000/UUID/day budget are all enforced. Sec-GPC: 1 short-circuits before the per-UUID budget consumption (as documented). Forget/optout endpoints DELETE from both `telemetry_events` and `telemetry_rollups_daily`; both return 204 regardless of UUID existence (no enumeration leak). `INSERT OR IGNORE` on PRIMARY KEY `event_id` never overwrites — chosen-event-id attacks would silently drop the attacker's payload, not poison legitimate data.

Two WARNINGs were found:

1. The k-anonymity floor in `housekeeper.js` uses **label count, not install count**, for the "Other (N=...)" bucket. This both mislabels the public stat AND can reveal a single below-k label (uniq=1) when there is exactly one below-k mcp_client.
2. The rate-limit `keyGenerator` and the stored `ip_hash` use **different canonicalizations of req.ip** for IPv6 callers (subnet/56 vs full address), contradicting the explicit "same identifier" claim in the middleware docstring (lines 45-51). Privacy/security goals are still met but the alignment claim is incorrect.

INFOs flag minor ordering and resilience concerns.

## Warnings

### WR-01: k-anonymity floor reports LABEL count, not INSTALL count; below-k singleton leak possible

**File:** `showcase/server/src/telemetry/housekeeper.js:78-82`

**Issue:**
```js
const above = popularMcpRaw.filter((r) => (r.uniq || 0) >= K_ANONYMITY_FLOOR);
const belowCount = popularMcpRaw.filter((r) => (r.uniq || 0) < K_ANONYMITY_FLOOR).length;
const popularMcp = belowCount > 0
  ? [...above, { mcp_client: `Other (N=${belowCount})`, uniq: belowCount }]
  : above;
```

Two problems with the "Other (N=...)" bucket:

1. **`uniq: belowCount` is the count of distinct mcp_client labels** below the threshold, NOT the sum of distinct installs that those labels represent. If 4 labels each have 3 installs (all below k=5), the output is `{ uniq: 4 }` when downstream consumers would expect `{ uniq: 12 }` (or sum of uniqs). The label name `"Other (N=4)"` reinforces the misreading because consumers will interpret `N` as installs.

2. **Single below-k label leak**: when `belowCount === 1` and that single label has `uniq === 1`, the output is `[{ mcp_client: 'Other (N=1)', uniq: 1 }]` — which reveals "today, exactly one install used a below-k mcp_client". For a k-anonymity floor of 5, ANY emitted row with `uniq < 5` is a privacy violation. The current code emits `uniq=1` (the label count) which satisfies a literal `uniq < 5` check but the underlying install is still singleton-identifiable: the attacker learns one user used an unusual client today. If `belowCount=1` AND that label has `uniq=1`, this single user's mcp_client choice is leaked (just under a generic "Other" name) — but more importantly, the COUNT of "1 unusual user today" is the leaked datum.

**Fix:** Sum the install counts (not labels) and suppress the bucket when total below-k installs is itself below k:
```js
const above = popularMcpRaw.filter((r) => (r.uniq || 0) >= K_ANONYMITY_FLOOR);
const belowInstalls = popularMcpRaw
  .filter((r) => (r.uniq || 0) < K_ANONYMITY_FLOOR)
  .reduce((sum, r) => sum + (r.uniq || 0), 0);
const popularMcp = belowInstalls >= K_ANONYMITY_FLOOR
  ? [...above, { mcp_client: 'Other', uniq: belowInstalls }]
  : above;  // suppress entirely when total below-k installs is itself < k
```

Note: tests/server-telemetry-housekeeper.test.js:130-139 asserts the BUGGY behavior (`Other (N=2)` with `uniq: 2` for 2 distinct labels of 1 install each). The test passes but encodes the defect. The test must be updated as part of the fix; the correct expected output for that scenario (2 labels × 1 install each = 2 below-k installs, which is < k=5) is to SUPPRESS the bucket entirely.

---

### WR-02: rate-limit bucket key and stored `ip_hash` are NOT the same value for IPv6 clients

**File:** `showcase/server/src/middleware/telemetry-rate-limit.js:45-54` and `showcase/server/src/routes/telemetry.js:128`

**Issue:** The middleware docstring claims:
> "the hashIp() output becomes the same identifier we store as ip_hash in telemetry_events, so an attacker cannot rotate the rate-limit identity without also rotating the storage identity."

But the two code paths produce DIFFERENT hashes for the same IPv6 request:

- **Rate-limit bucket** (`middleware/telemetry-rate-limit.js:54`):
  ```js
  keyGenerator: (req) => hashIp(ipKeyGenerator(req.ip), db)
  ```
  `ipKeyGenerator` collapses IPv6 to a /56 subnet (`node_modules/express-rate-limit/dist/index.cjs:33-43`), so the hashed input is e.g. `"2001:db8::/56"`.

- **Stored ip_hash** (`routes/telemetry.js:128`):
  ```js
  const clientHash = hashIp(req.ip, db);
  ```
  This hashes the **raw** `req.ip`, e.g. `"2001:db8::beef:1"`.

For an IPv6 client, these produce DIFFERENT 64-char hex digests. The claimed "same identifier" invariant is FALSE for IPv6. (For IPv4 the values are equal since `ipKeyGenerator` is a no-op on IPv4.)

**Security impact:** None — both are deterministic per-client, both preserve privacy (k-anonymity at /56 is even broader for the bucket; storage at full IPv6 preserves request-level granularity which is the intended retention). But the docstring is misleading, and a future maintainer relying on the "same identifier" invariant could write code that assumes the values match (e.g., correlate rate-limit logs to stored hashes).

**Fix:** Either (a) update the docstring/comment to accurately describe the alignment ("bucket = hashIp(ipKeyGenerator(req.ip)); storage = hashIp(req.ip); both deterministic per-client; rotating the IP rotates both"), OR (b) align the two paths by routing the storage hash through ipKeyGenerator as well, e.g.:
```js
// routes/telemetry.js:128
const clientHash = hashIp(ipKeyGenerator(req.ip), db);
```
Option (b) makes the docstring true and slightly increases anonymity (IPv6 clients in the same /56 subnet share a storage hash too).

## Info

### IN-01: `hashIp(req.ip, db)` runs BEFORE body-shape validation — wasted work on malformed batches

**File:** `showcase/server/src/routes/telemetry.js:128-132`

**Issue:** The handler order is:
```js
const clientHash = hashIp(req.ip, db);        // line 128 -- always runs
const body = req.body;
if (!body || !Array.isArray(body.events)) {    // line 131 -- could short-circuit
  return res.status(400).json({ error: 'invalid_payload' });
}
```

`hashIp` triggers `getOrMintTodaySalt(db)` (a `db.prepare(...).get(...)` SELECT) on every request, even when the request body is malformed (missing `events`, non-array, empty `{}`). The 30/min/IP-hash rate-limit caps the impact, but the ordering is suboptimal — `clientHash` is only needed when an actual INSERT runs (line 193).

**Fix:** Move the `hashIp` call AFTER body-shape validation, AFTER batch-cap check, AFTER the per-event validate loop, so it only fires when at least one row is about to be inserted:
```js
if (!body || !Array.isArray(body.events)) return res.status(400).json({ error: 'invalid_payload' });
if (body.events.length === 0) return res.status(204).end();
if (body.events.length > MAX_BATCH) return res.status(400).json(...);
for (...) { validateEvent(...); }
// only now compute clientHash
const clientHash = hashIp(req.ip, db);
```

### IN-02: per-UUID budget Map grows unbounded; no eviction beyond day-rollover

**File:** `showcase/server/src/middleware/telemetry-rate-limit.js:64`

**Issue:** `const budgets = new Map();` is module-level and entries are only deleted when overwritten for a new UTC day (line 94) — but a UUID that telemeters once and never returns leaves its entry in the Map forever. Over many days this Map accumulates millions of stale entries (one per ever-seen install_uuid).

**Fix:** Periodic sweep (e.g., from housekeeper.js — every hour, delete entries where `entry.day_utc !== today_utc`):
```js
// in housekeeper.js after step 4
const today = utcDayString(nowMs);
for (const [k, v] of budgets) if (v.day_utc !== today) budgets.delete(k);
```
Or migrate the budget to SQLite if persistence across server restarts is desired (currently a server restart resets the budget for all UUIDs — minor but worth noting).

### IN-03: housekeeper try/catch covers the WHOLE tick; partial failures abort the rest of the tick

**File:** `showcase/server/src/telemetry/housekeeper.js:47-105`

**Issue:** The single outer `try/catch` (line 47/102) catches any error in steps 1-4 and short-circuits the entire tick. This is what the CONTEXT spec requires ("never crash the interval") and the test `runHousekeeperTick does NOT throw` confirms this. But: a persistently-failing step 1 (e.g., DB locked, ALTER schema not run) means step 4 (salt nudge) is NEVER reached. The salt-table-bootstrap guarantee degrades silently if step 1 keeps failing.

**Fix (optional):** Wrap each step in its own try/catch so a failure in step 1 does not skip steps 2-4:
```js
try { queries.deleteOldEvents.run(...); } catch (e) { console.error('[housekeeper] step1', e.message); }
try { /* step 2 */ } catch (e) { console.error('[housekeeper] step2', e.message); }
// ...
try { hashIp('0.0.0.0', db); } catch (e) { console.error('[housekeeper] salt nudge', e.message); }
```
Trade-off: a corrupt DB might log 4 errors per hour instead of 1.

### IN-04: budget counter increments BEFORE the INSERT runs — duplicate `event_id` replays burn budget without inserting

**File:** `showcase/server/src/routes/telemetry.js:171-200`

**Issue:** Loop at line 172-179 calls `checkPerUuidBudget(ev.install_uuid)` for each in-window event, then the transaction at line 186-198 runs `INSERT OR IGNORE`. If the event_id already exists (replay-dedup, BEAT-04), `r.changes === 0` but the budget was already consumed. A client replaying its own old batches will exhaust its own daily budget without storing new rows. Cross-UUID attack is not possible (caller cannot spoof install_uuid past the UUIDv4 shape check + bucket isolation), so this is a self-DoS only.

**Fix (optional):** Move budget increment INSIDE the transaction, conditional on `r.changes === 1`:
```js
const tx = db.transaction((rows) => {
  let n = 0;
  for (const e of rows) {
    const b = checkPerUuidBudget(e.install_uuid);  // may revoke mid-batch
    if (!b.ok) { droppedBudget++; continue; }
    const r = queries.insertTelemetryEvent.run(...);
    if (r.changes === 1) n += 1;
    else /* IGNORE-ed duplicate */ { /* rollback budget? */ }
  }
  return n;
});
```
Caveats: rolling back the in-memory counter on IGNORE adds complexity; the current behavior is acceptable for a per-UUID 1000/day budget where replays are rare. Document the contract: "budget counts attempted writes, not committed writes."

---

_Reviewed: 2026-05-14T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer) — privacy/security focused, depth=deep_
_Scope: 9 source files modified in commits aa8a4f6, 95082ac, 320d913_
_Focus areas (per request): all 9 confirmed; no BLOCKERs found; 2 WARNINGs (k-anonymity install-vs-label, rate-limit/storage hash divergence); 4 INFOs (work ordering, map eviction, step isolation, replay-budget)_
