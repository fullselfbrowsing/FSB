/**
 * SQLite database schema setup
 */

const GITHUB_CACHE_PAYLOAD_VERSION = 1;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function normalizedIso(value) {
  const time = typeof value === 'string' && value.trim()
    ? Date.parse(value)
    : typeof value === 'number'
      ? value
      : NaN;
  if (!Number.isFinite(time)) return null;
  try {
    return new Date(time).toISOString();
  } catch {
    return null;
  }
}

function aggregateLegacyHistory(days) {
  const counts = new Map();
  for (const day of days) counts.set(day, (counts.get(day) || 0) + 1);
  let total = 0;
  return [...counts.keys()].sort().map((day_utc) => {
    total += counts.get(day_utc);
    return { day_utc, total };
  });
}

function scrubLegacyRepoSummary(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const id = nonNegativeInteger(payload.id);
  const stars = nonNegativeInteger(payload.stargazers_count);
  const forks = nonNegativeInteger(payload.forks_count);
  const openIssues = nonNegativeInteger(payload.open_issues_count);
  const subscribers = nonNegativeInteger(payload.subscribers_count);
  const pushedAt = normalizedIso(payload.pushed_at);
  if (
    id === null || stars === null || forks === null || openIssues === null ||
    subscribers === null || typeof payload.name !== 'string' ||
    typeof payload.default_branch !== 'string' || !pushedAt
  ) return null;
  return {
    id,
    name: payload.name,
    stargazers_count: stars,
    forks_count: forks,
    open_issues_count: openIssues,
    subscribers_count: subscribers,
    default_branch: payload.default_branch,
    pushed_at: pushedAt,
  };
}

function scrubLegacyStars(payload, fetchedAt) {
  if (!Array.isArray(payload)) return null;
  const asOf = normalizedIso(fetchedAt);
  if (!asOf) return null;
  const days = [];
  for (const event of payload) {
    const starredAt = event && typeof event === 'object' ? normalizedIso(event.starred_at) : null;
    if (starredAt) days.push(starredAt.slice(0, 10));
  }
  const history = aggregateLegacyHistory(days);
  return {
    schema_version: GITHUB_CACHE_PAYLOAD_VERSION,
    total: days.length,
    history,
    history_complete: false,
    source: 'repository-count',
    as_of: asOf,
  };
}

function scrubLegacyCommits(payload, fetchedAt) {
  if (!Array.isArray(payload)) return null;
  const asOf = normalizedIso(fetchedAt);
  if (!asOf) return null;
  const days = [];
  for (const event of payload) {
    const authoredAt = event && typeof event === 'object' && event.commit &&
      typeof event.commit === 'object' && event.commit.author &&
      typeof event.commit.author === 'object'
      ? normalizedIso(event.commit.author.date)
      : null;
    if (authoredAt) days.push(authoredAt.slice(0, 10));
  }
  const history = aggregateLegacyHistory(days);
  const cutoffIso = normalizedIso(Date.parse(asOf) - (29 * ONE_DAY_MS));
  if (!cutoffIso) return null;
  const cutoffDay = cutoffIso.slice(0, 10);
  let totalBeforeWindow = 0;
  let grandTotal = 0;
  for (const point of history) {
    grandTotal = point.total;
    if (point.day_utc < cutoffDay) totalBeforeWindow = point.total;
  }
  return {
    schema_version: GITHUB_CACHE_PAYLOAD_VERSION,
    total: days.length,
    last_30_days: Math.max(0, grandTotal - totalBeforeWindow),
    history,
    history_complete: false,
    as_of: asOf,
  };
}

function scrubLegacyGithubCache(db) {
  // Issues stats are retired. Purge every cached generation, including rows
  // already migrated to the current payload version, on every initialization.
  db.prepare('DELETE FROM github_cache WHERE endpoint_id = ?').run('issues');

  const rows = db.prepare(`
    SELECT endpoint_id, payload_json, fetched_at
    FROM github_cache
    WHERE payload_version < ?
  `).all(GITHUB_CACHE_PAYLOAD_VERSION);
  if (rows.length === 0) return;

  const update = db.prepare(`
    UPDATE github_cache
    SET payload_json = ?, etag = NULL, is_complete = 0, payload_version = ?,
        last_attempt_at = COALESCE(last_attempt_at, fetched_at),
        last_error_status = NULL, consecutive_failures = 0, next_retry_at = NULL
    WHERE endpoint_id = ?
  `);
  const remove = db.prepare('DELETE FROM github_cache WHERE endpoint_id = ?');
  const scrub = db.transaction(() => {
    for (const row of rows) {
      let parsed;
      try {
        parsed = JSON.parse(row.payload_json);
      } catch {
        remove.run(row.endpoint_id);
        continue;
      }

      let safePayload = null;
      if (row.endpoint_id === 'repo-summary') safePayload = scrubLegacyRepoSummary(parsed);
      else if (row.endpoint_id === 'stars') safePayload = scrubLegacyStars(parsed, row.fetched_at);
      else if (row.endpoint_id === 'commits') safePayload = scrubLegacyCommits(parsed, row.fetched_at);

      // Retired datasets have no trustworthy partial public contract. Delete
      // them rather than retaining raw GitHub identities.
      if (safePayload === null) remove.run(row.endpoint_id);
      else update.run(JSON.stringify(safePayload), GITHUB_CACHE_PAYLOAD_VERSION, row.endpoint_id);
    }
  });
  scrub();
}

function initializeDatabase(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // Phase 273 / INGEST-06 -- per-connection performance + safety PRAGMAs.
  // synchronous=NORMAL is corruption-safe in WAL mode (per better-sqlite3 + PITFALLS.md section 6).
  // busy_timeout=5000 waits 5s on lock before erroring (rate-limit + housekeeper contention).
  // cache_size=-64000 = 64 MB page cache.
  // mmap_size=30 GB maps the DB file into the process address space (read-fast).
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('cache_size = -64000');
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 30000000000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS hash_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash_key TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT,
      metadata TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash_key TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      name TEXT NOT NULL,
      task TEXT NOT NULL,
      start_mode TEXT NOT NULL DEFAULT 'pinned',
      target_url TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_config TEXT DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (hash_key) REFERENCES hash_keys(hash_key) ON DELETE CASCADE,
      UNIQUE(hash_key, agent_id)
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash_key TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'unknown',
      result TEXT,
      error TEXT,
      iterations INTEGER DEFAULT 0,
      tokens_used INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      execution_mode TEXT DEFAULT 'ai_initial',
      cost_saved REAL DEFAULT 0,
      FOREIGN KEY (hash_key) REFERENCES hash_keys(hash_key) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_agents_hash_key ON agents(hash_key);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_hash_key ON agent_runs(hash_key);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_id ON agent_runs(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_completed_at ON agent_runs(completed_at);

    CREATE TABLE IF NOT EXISTS pairing_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      hash_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      session_token TEXT,
      session_expires_at TEXT,
      FOREIGN KEY (hash_key) REFERENCES hash_keys(hash_key) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pairing_tokens_token ON pairing_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_pairing_tokens_hash_key ON pairing_tokens(hash_key);

    -- Phase 273 / INGEST-05 -- anonymous telemetry ingest. Additive only; existing tables untouched.
    -- telemetry_events: raw event log; 7-day retention enforced by housekeeper. event_id is PRIMARY KEY
    --   so INSERT OR IGNORE satisfies BEAT-04 (client-side replay-dedup). ip_hash stores ONLY the
    --   HMAC-SHA256(plaintext_ip, todays_salt); plaintext IP never persisted.
    -- Quick task 260630-hct -- short-lived region column (coarse country/US-state
    -- label, e.g. US-CA, DEFAULT 'unknown'). Derived from req.ip at ingest, rolled
    -- up daily by the housekeeper behind a k>=5 floor, and dropped by the existing
    -- 7-day retention. It is NOT a durable per-UUID location profile.
    CREATE TABLE IF NOT EXISTS telemetry_events (
      event_id TEXT PRIMARY KEY,
      install_uuid TEXT NOT NULL,
      ts_minute INTEGER NOT NULL,
      mcp_client TEXT NOT NULL,
      model TEXT,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      active_agent_count INTEGER NOT NULL DEFAULT 0,
      active_count_version INTEGER NOT NULL DEFAULT 0,
      event_type TEXT NOT NULL,
      ip_hash TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      region TEXT NOT NULL DEFAULT 'unknown'
    );

    CREATE INDEX IF NOT EXISTS idx_telemetry_events_uuid_ts ON telemetry_events(install_uuid, ts_minute);
    CREATE INDEX IF NOT EXISTS idx_telemetry_events_iphash_recv ON telemetry_events(ip_hash, received_at);
    CREATE INDEX IF NOT EXISTS idx_telemetry_events_ts ON telemetry_events(ts_minute);
    CREATE INDEX IF NOT EXISTS idx_telemetry_events_received_at ON telemetry_events(received_at);

    -- telemetry_rollups_daily: per-UUID per-day aggregates; 365-day retention; powers Phase 274.
    CREATE TABLE IF NOT EXISTS telemetry_rollups_daily (
      install_uuid TEXT NOT NULL,
      day_utc TEXT NOT NULL,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      max_active_agents INTEGER NOT NULL DEFAULT 0,
      trusted_active_sample_count INTEGER NOT NULL DEFAULT 0,
      event_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(install_uuid, day_utc)
    );

    CREATE INDEX IF NOT EXISTS idx_rollups_day ON telemetry_rollups_daily(day_utc);

    -- telemetry_global_aggregates: one row per day; lifetime retention; powers /api/public-stats/global
    -- (Phase 274). popular_mcp_json and popular_agent_json apply a k>=5 anonymity floor at WRITE time
    -- in the housekeeper (per D-07); below-k labels bucket as "Other (N=<count>)".
    -- popular_region_json (quick task 260630-hct) is the k>=5-floored daily region
    -- breakdown, exactly mirroring popular_mcp_json. The floor is applied at WRITE
    -- time in the housekeeper (REGION_K_FLOOR=5); below-k regions collapse to a
    -- single 'Other' bucket (suppressed when that sum is itself < 5).
    CREATE TABLE IF NOT EXISTS telemetry_global_aggregates (
      day_utc TEXT PRIMARY KEY,
      unique_installs INTEGER NOT NULL DEFAULT 0,
      tokens_in_sum INTEGER NOT NULL DEFAULT 0,
      tokens_out_sum INTEGER NOT NULL DEFAULT 0,
      agents_active_sum INTEGER NOT NULL DEFAULT 0,
      popular_mcp_json TEXT NOT NULL DEFAULT '[]',
      popular_agent_json TEXT NOT NULL DEFAULT '[]',
      popular_region_json TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL DEFAULT 0,
      active_count_version INTEGER NOT NULL DEFAULT 0,
      trusted_active_installs INTEGER NOT NULL DEFAULT 0
    );

    -- telemetry_daily_salt: daily-rotated HMAC-SHA256 salt for ip_hash. Lazy UTC-daily rotation in
    -- src/utils/telemetry-salt.js retains today + yesterday only; older salts deleted on each rotation.
    -- Yesterday's salt is retained for ~25h so late-arriving batches near midnight still hash correctly.
    CREATE TABLE IF NOT EXISTS telemetry_daily_salt (
      day_utc TEXT PRIMARY KEY,
      salt_hex TEXT NOT NULL,
      minted_at INTEGER NOT NULL
    );

    -- Server-side GitHub stats cache (one row per endpoint_id from the current
    -- allowlist in src/telemetry/github-poller.js). payload_json contains only
    -- the public, field-allowlisted representation used by /stats. A completed
    -- page walk is committed atomically; failures update attempt metadata while
    -- preserving the last-known-good payload and fetched_at timestamp.
    CREATE TABLE IF NOT EXISTS github_cache (
      endpoint_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      etag TEXT,
      fetched_at INTEGER NOT NULL,
      http_status INTEGER NOT NULL,
      rate_limit_remaining INTEGER,
      rate_limit_reset INTEGER,
      is_complete INTEGER NOT NULL DEFAULT 0,
      payload_version INTEGER NOT NULL DEFAULT 0,
      last_attempt_at INTEGER,
      last_error_status INTEGER,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      next_retry_at INTEGER
    );
  `);

  // Migration: add replay columns to existing databases
  try {
    db.exec(`ALTER TABLE agent_runs ADD COLUMN execution_mode TEXT DEFAULT 'ai_initial'`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE agent_runs ADD COLUMN cost_saved REAL DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE agents ADD COLUMN start_mode TEXT NOT NULL DEFAULT 'pinned'`);
  } catch { /* column already exists */ }
  // Quick task 260630-hct -- additive region columns so existing databases upgrade
  // in place (fresh databases get them from the inline CREATE TABLE bodies above).
  try {
    db.exec(`ALTER TABLE telemetry_events ADD COLUMN region TEXT NOT NULL DEFAULT 'unknown'`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE telemetry_events ADD COLUMN active_count_version INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE telemetry_rollups_daily ADD COLUMN trusted_active_sample_count INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE telemetry_global_aggregates ADD COLUMN popular_region_json TEXT NOT NULL DEFAULT '[]'`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE telemetry_global_aggregates ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE telemetry_global_aggregates ADD COLUMN active_count_version INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE telemetry_global_aggregates ADD COLUMN trusted_active_installs INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }

  // Existing GitHub cache rows predate traversal-completeness metadata. They
  // intentionally migrate as incomplete so the poller performs a full walk
  // before trusting their page-1 ETag as a whole-cache freshness sentinel.
  try {
    db.exec(`ALTER TABLE github_cache ADD COLUMN is_complete INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE github_cache ADD COLUMN payload_version INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE github_cache ADD COLUMN last_attempt_at INTEGER`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE github_cache ADD COLUMN last_error_status INTEGER`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE github_cache ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE github_cache ADD COLUMN next_retry_at INTEGER`);
  } catch { /* column already exists */ }

  // Pre-migration cache rows stored raw GitHub list responses. Scrub them in
  // the same initialization turn so usernames, profile data, commit metadata,
  // and issue bodies never remain at rest after upgrade. Stars and commits are
  // retained only as aggregate, explicitly incomplete v1 snapshots; repository
  // summaries are allowlisted; retired datasets are deleted. Issue rows are
  // deleted regardless of payload version. ETags are cleared and every
  // retained row stays incomplete, forcing a full repoll.
  scrubLegacyGithubCache(db);

  console.log('[FSB Server] Database schema initialized');
}

module.exports = { initializeDatabase };
