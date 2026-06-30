/**
 * SQLite database schema setup
 */

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
      event_type TEXT NOT NULL,
      ip_hash TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      region TEXT NOT NULL DEFAULT 'unknown'
    );

    CREATE INDEX IF NOT EXISTS idx_telemetry_events_uuid_ts ON telemetry_events(install_uuid, ts_minute);
    CREATE INDEX IF NOT EXISTS idx_telemetry_events_iphash_recv ON telemetry_events(ip_hash, received_at);

    -- telemetry_rollups_daily: per-UUID per-day aggregates; 365-day retention; powers Phase 274.
    CREATE TABLE IF NOT EXISTS telemetry_rollups_daily (
      install_uuid TEXT NOT NULL,
      day_utc TEXT NOT NULL,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      max_active_agents INTEGER NOT NULL DEFAULT 0,
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
      popular_region_json TEXT NOT NULL DEFAULT '[]'
    );

    -- telemetry_daily_salt: daily-rotated HMAC-SHA256 salt for ip_hash. Lazy UTC-daily rotation in
    -- src/utils/telemetry-salt.js retains today + yesterday only; older salts deleted on each rotation.
    -- Yesterday's salt is retained for ~25h so late-arriving batches near midnight still hash correctly.
    CREATE TABLE IF NOT EXISTS telemetry_daily_salt (
      day_utc TEXT PRIMARY KEY,
      salt_hex TEXT NOT NULL,
      minted_at INTEGER NOT NULL
    );

    -- Quick task 260516-7l5 -- server-side GitHub stats cache (one row per endpoint_id from the
    -- 7-key allowlist in src/telemetry/github-poller.js). Populated by the 5-min poller; read by
    -- the /api/public-stats/github/:endpoint_id route. payload_json holds raw GitHub JSON verbatim
    -- (object for repo-summary; concatenated array for paginated endpoints). etag is GitHub's
    -- ETag for If-None-Match round-trips on the next tick. fetched_at + http_status are for
    -- diagnostics + the first-boot 503 detection (NULL row == cache cold).
    CREATE TABLE IF NOT EXISTS github_cache (
      endpoint_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      etag TEXT,
      fetched_at INTEGER NOT NULL,
      http_status INTEGER NOT NULL,
      rate_limit_remaining INTEGER,
      rate_limit_reset INTEGER
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
    db.exec(`ALTER TABLE telemetry_global_aggregates ADD COLUMN popular_region_json TEXT NOT NULL DEFAULT '[]'`);
  } catch { /* column already exists */ }

  console.log('[FSB Server] Database schema initialized');
}

module.exports = { initializeDatabase };
