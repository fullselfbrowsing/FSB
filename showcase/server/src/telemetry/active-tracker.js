/**
 * Phase 274 / AGG-02 + AGG-03 -- in-memory "active right now" tracker.
 *
 * Powers two FSBTelemetryHeadline fields that cannot be answered from SQLite
 * within a privacy-respecting <=10 min window:
 *
 *   - active_users_now  := countActiveUsers(10*60*1000, snapshotNow)
 *   - active_agents_now := getActiveAgentSum(10*60*1000, snapshotNow)
 *
 * Backed by a module-scoped
 * Map<install_uuid, {ts, agent_count, source_key, active_count_version}>.
 * Eviction is LAZY -- every
 * read and write drops entries older than EVICTION_MS (10 min). The source key
 * is the ingest route's daily HMAC IP hash: one source can contribute at most
 * 20 active installs and 64 active agents. There is NO timer / NO persistence:
 *   - "no timer" keeps the module hot-path-cheap;
 *   - "no persistence" is intentional per CONTEXT D-05 -- a server restart
 *     empties the Map and the next 5 minutes of /api/telemetry/events beats
 *     rebuild it. The trade-off is acceptable for an Easter-egg dashboard.
 *
 * PRIVACY INVARIANT: this module NEVER logs install_uuid values; only
 *   counts / sums leave the module surface. The consumer
 *   (`routes/public-stats.js`) emits only aggregate counts and a canonical
 *   agent-count bucket; UUID keys never enter the public response body.
 *
 * Test isolation: `_resetForTest()` clears the Map between tests so the
 * module-scoped state does not bleed across `tests/server-public-stats-*.test.js`.
 */

'use strict';

// 10-minute ceiling per CONTEXT D-06 + AGG-03. The wider window covers
// active_agents (10 min) so the shared eviction is correct for the smaller
// 5-min active_users window as well (older entries can never matter to either).
const EVICTION_MS = 10 * 60 * 1000;
const parsedEntryCap = Number(process.env.TELEMETRY_ACTIVE_TRACKER_MAX);
const MAX_ACTIVE_TRACKER_ENTRIES = Number.isSafeInteger(parsedEntryCap) && parsedEntryCap > 0
  ? parsedEntryCap
  : 100000;
const parsedSourceInstallCap = Number(process.env.TELEMETRY_IP_DAILY_UUID_MAX);
const MAX_ACTIVE_INSTALLS_PER_SOURCE = Number.isSafeInteger(parsedSourceInstallCap)
    && parsedSourceInstallCap > 0
  ? parsedSourceInstallCap
  : 20;
const MAX_ACTIVE_AGENTS_PER_SOURCE = 64;
const ACTIVE_COUNT_VERSION = 2;

// Map<install_uuid, { ts: number, agent_count: number, source_key: string,
//                     active_count_version: number }>
const seen = new Map();
// Map<daily_hmac_ip_hash, number>. Unattributed direct/test calls receive a
// UUID-scoped fallback key; production ingest always supplies the daily hash.
const sourceCounts = new Map();

function _sourceKey(installUuid, dailyIpHash) {
  return typeof dailyIpHash === 'string' && dailyIpHash.length > 0
    ? `hash:${dailyIpHash}`
    : `unattributed:${installUuid}`;
}

function _incrementSource(sourceKey) {
  sourceCounts.set(sourceKey, (sourceCounts.get(sourceKey) || 0) + 1);
}

function _deleteInstall(installUuid) {
  const entry = seen.get(installUuid);
  if (!entry) return false;
  seen.delete(installUuid);
  const nextCount = (sourceCounts.get(entry.source_key) || 1) - 1;
  if (nextCount <= 0) sourceCounts.delete(entry.source_key);
  else sourceCounts.set(entry.source_key, nextCount);
  return true;
}

/**
 * Drop every entry older than (now - EVICTION_MS). Called on every read.
 * @param {number} nowMs
 */
function _evict(nowMs) {
  const cutoff = nowMs - EVICTION_MS;
  // Iterating the Map and deleting in the same loop is safe per the
  // ECMAScript Map.prototype.forEach contract -- iteration order is insertion
  // order, and `delete` does not invalidate the iterator.
  for (const [uuid, entry] of seen) {
    if (entry.ts < cutoff) {
      _deleteInstall(uuid);
    }
  }
}

/**
 * Record the latest seen-at for an install_uuid plus its current agent count.
 * Upsert semantics: overwrites the previous entry, so the freshest beat wins.
 *
 * @param {string} install_uuid -- caller (telemetry route) guarantees UUIDv4 shape.
 * @param {number} active_agent_count -- non-negative integer. Defensive coerce to 0
 *                 when not an integer in [0, Number.MAX_SAFE_INTEGER].
 * @param {number} ts_ms -- wall-clock receive time (Date.now()), NOT ev.ts_minute.
 *                 Using receive time defends against clients with drifted clocks
 *                 pinning themselves as "active" indefinitely.
 * @param {string} daily_ip_hash -- daily-rotating HMAC digest from ingest.
 * @param {number} active_count_version -- 2 for reconciled registry counts;
 *                 legacy/unknown values are retained only as user liveness.
 */
function recordSeen(install_uuid, active_agent_count, ts_ms, daily_ip_hash, active_count_version) {
  if (typeof install_uuid !== 'string' || install_uuid.length === 0) return false;
  if (typeof ts_ms !== 'number' || !Number.isFinite(ts_ms)) return false;
  const agentCount =
    Number.isInteger(active_agent_count) && active_agent_count >= 0
      ? active_agent_count
      : 0;
  // Direct/internal callers predate the protocol field and are trusted by
  // default. The ingest route always passes 0 or 2 explicitly.
  const activeCountVersion = active_count_version === undefined
    ? ACTIVE_COUNT_VERSION
    : active_count_version === ACTIVE_COUNT_VERSION ? ACTIVE_COUNT_VERSION : 0;

  // Ingest is the hot path, so evict there as well as on reads. A write-only
  // workload must not retain a stale UUID for every request until somebody
  // happens to load the public stats page.
  _evict(ts_ms);

  // Existing installs can refresh while staying on the same source. Per-source
  // and global caps reject only net-new membership, bounding UUID rotation
  // without letting churn evict legitimate active installs.
  const existing = seen.get(install_uuid);
  const sourceKey = _sourceKey(install_uuid, daily_ip_hash);
  const movesSource = existing && existing.source_key !== sourceKey;
  if ((!existing || movesSource)
      && (sourceCounts.get(sourceKey) || 0) >= MAX_ACTIVE_INSTALLS_PER_SOURCE) {
    return false;
  }
  if (!existing && seen.size >= MAX_ACTIVE_TRACKER_ENTRIES) {
    return false;
  }
  if (!existing) {
    _incrementSource(sourceKey);
  } else if (movesSource) {
    _deleteInstall(install_uuid);
    _incrementSource(sourceKey);
  }
  seen.set(install_uuid, {
    ts: ts_ms,
    agent_count: activeCountVersion === ACTIVE_COUNT_VERSION ? agentCount : 0,
    source_key: sourceKey,
    active_count_version: activeCountVersion,
  });
  return true;
}

/** Remove a privacy-deleted install from the live in-memory cohort immediately. */
function forgetInstall(install_uuid) {
  if (typeof install_uuid !== 'string' || install_uuid.length === 0) return false;
  return _deleteInstall(install_uuid);
}

/**
 * Count distinct install_uuids seen within the last `windowMs`.
 * Lazy-evicts entries older than EVICTION_MS first.
 *
 * @param {number} windowMs
 * @returns {number}
 */
function countActiveUsers(windowMs, nowMs = Date.now()) {
  const now = nowMs;
  if (typeof now !== 'number' || !Number.isFinite(now)) return 0;
  if (typeof windowMs !== 'number' || !Number.isFinite(windowMs) || windowMs <= 0) return 0;
  _evict(now);
  const cutoff = now - windowMs;
  let n = 0;
  const perSource = new Map();
  for (const entry of seen.values()) {
    if (entry.ts < cutoff || entry.ts > now) continue;
    const sourceCount = perSource.get(entry.source_key) || 0;
    if (sourceCount >= MAX_ACTIVE_INSTALLS_PER_SOURCE) continue;
    perSource.set(entry.source_key, sourceCount + 1);
    n += 1;
  }
  return n;
}

/**
 * Sum of latest agent_count values across install_uuids seen within
 * the last `windowMs`. Same eviction as countActiveUsers.
 *
 * @param {number} windowMs
 * @returns {number}
 */
function getActiveAgentSum(windowMs, nowMs = Date.now()) {
  const now = nowMs;
  if (typeof now !== 'number' || !Number.isFinite(now)) return 0;
  if (typeof windowMs !== 'number' || !Number.isFinite(windowMs) || windowMs <= 0) return 0;
  _evict(now);
  const cutoff = now - windowMs;
  const perSource = new Map();
  for (const entry of seen.values()) {
    if (entry.ts < cutoff || entry.ts > now) continue;
    if (entry.active_count_version !== ACTIVE_COUNT_VERSION) continue;
    let source = perSource.get(entry.source_key);
    if (!source) {
      source = { installs: 0, agents: 0 };
      perSource.set(entry.source_key, source);
    }
    if (source.installs >= MAX_ACTIVE_INSTALLS_PER_SOURCE) continue;
    source.installs += 1;
    source.agents = Math.min(MAX_ACTIVE_AGENTS_PER_SOURCE, source.agents + entry.agent_count);
  }
  let total = 0;
  for (const source of perSource.values()) total += source.agents;
  return total;
}

/** Count active installs whose current agent population came from v2. */
function countActiveAgentReporters(windowMs, nowMs = Date.now()) {
  const now = nowMs;
  if (typeof now !== 'number' || !Number.isFinite(now)) return 0;
  if (typeof windowMs !== 'number' || !Number.isFinite(windowMs) || windowMs <= 0) return 0;
  _evict(now);
  const cutoff = now - windowMs;
  let n = 0;
  const perSource = new Map();
  for (const entry of seen.values()) {
    if (entry.ts < cutoff || entry.ts > now) continue;
    if (entry.active_count_version !== ACTIVE_COUNT_VERSION) continue;
    const sourceCount = perSource.get(entry.source_key) || 0;
    if (sourceCount >= MAX_ACTIVE_INSTALLS_PER_SOURCE) continue;
    perSource.set(entry.source_key, sourceCount + 1);
    n += 1;
  }
  return n;
}

/**
 * Map a raw active-agent integer to one of the seven canonical k-anonymity
 * bucket labels per AGG-03 (matches Phase 273 housekeeper bucket scheme).
 *
 * @param {number} n
 * @returns {'0'|'1'|'2-4'|'5-8'|'9-16'|'17-32'|'33+'}
 */
function bucketAgents(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '0';
  if (n === 1) return '1';
  if (n <= 4) return '2-4';
  if (n <= 8) return '5-8';
  if (n <= 16) return '9-16';
  if (n <= 32) return '17-32';
  return '33+';
}

/** Test-only helper. Clears the Map. */
function _resetForTest() {
  seen.clear();
  sourceCounts.clear();
}

function _sizeForTest() {
  return seen.size;
}

module.exports = {
  recordSeen,
  forgetInstall,
  countActiveUsers,
  getActiveAgentSum,
  countActiveAgentReporters,
  bucketAgents,
  _resetForTest,
  _sizeForTest,
  EVICTION_MS,
  MAX_ACTIVE_TRACKER_ENTRIES,
  MAX_ACTIVE_INSTALLS_PER_SOURCE,
  MAX_ACTIVE_AGENTS_PER_SOURCE,
  ACTIVE_COUNT_VERSION,
};
