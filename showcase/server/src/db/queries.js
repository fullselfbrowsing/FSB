/**
 * Parameterized database queries
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function utcDayStartMs(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function utcDayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

class Queries {
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }

  _prepareStatements() {
    // Hash keys
    this.insertHashKey = this.db.prepare(
      'INSERT INTO hash_keys (hash_key) VALUES (?)'
    );
    this.getHashKey = this.db.prepare(
      'SELECT * FROM hash_keys WHERE hash_key = ?'
    );
    this.updateLastSeen = this.db.prepare(
      "UPDATE hash_keys SET last_seen_at = datetime('now') WHERE hash_key = ?"
    );

    // Agents
    this.upsertAgent = this.db.prepare(`
      INSERT INTO agents (hash_key, agent_id, name, task, start_mode, target_url, schedule_type, schedule_config, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(hash_key, agent_id) DO UPDATE SET
        name = excluded.name,
        task = excluded.task,
        start_mode = excluded.start_mode,
        target_url = excluded.target_url,
        schedule_type = excluded.schedule_type,
        schedule_config = excluded.schedule_config,
        enabled = excluded.enabled,
        updated_at = datetime('now')
    `);

    this.getAgents = this.db.prepare(
      'SELECT * FROM agents WHERE hash_key = ? ORDER BY created_at DESC'
    );

    this.getAgent = this.db.prepare(
      'SELECT * FROM agents WHERE hash_key = ? AND agent_id = ?'
    );

    this.deleteAgent = this.db.prepare(
      'DELETE FROM agents WHERE hash_key = ? AND agent_id = ?'
    );

    // Agent runs
    this.insertRun = this.db.prepare(`
      INSERT INTO agent_runs (hash_key, agent_id, run_id, started_at, completed_at, status, result, error, iterations, tokens_used, cost_usd, duration_ms, execution_mode, cost_saved)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.getRuns = this.db.prepare(`
      SELECT * FROM agent_runs
      WHERE hash_key = ? AND agent_id = ?
      ORDER BY completed_at DESC
      LIMIT ? OFFSET ?
    `);

    this.getRunCount = this.db.prepare(
      'SELECT COUNT(*) as count FROM agent_runs WHERE hash_key = ? AND agent_id = ?'
    );

    this.getRecentRuns = this.db.prepare(`
      SELECT * FROM agent_runs
      WHERE hash_key = ?
      ORDER BY completed_at DESC
      LIMIT ?
    `);

    // Stats
    this.getStats = this.db.prepare(`
      SELECT
        COUNT(DISTINCT agent_id) as total_agents,
        COUNT(*) as total_runs,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_runs,
        SUM(tokens_used) as total_tokens,
        SUM(cost_usd) as total_cost,
        SUM(cost_saved) as total_cost_saved,
        SUM(duration_ms) as total_duration
      FROM agent_runs
      WHERE hash_key = ?
    `);

    this.getTodayStats = this.db.prepare(`
      SELECT
        COUNT(*) as runs_today,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_today
      FROM agent_runs
      WHERE hash_key = ? AND completed_at >= datetime('now', '-1 day')
    `);

    // Pairing tokens
    this.insertPairingToken = this.db.prepare(
      'INSERT INTO pairing_tokens (token, hash_key, expires_at) VALUES (?, ?, ?)'
    );
    this.selectPairingToken = this.db.prepare(
      'SELECT * FROM pairing_tokens WHERE token = ?'
    );
    this.markTokenUsed = this.db.prepare(
      'UPDATE pairing_tokens SET used = 1, session_token = ?, session_expires_at = ? WHERE token = ?'
    );
    this.invalidateTokensByHashKey = this.db.prepare(
      'UPDATE pairing_tokens SET used = 1 WHERE hash_key = ? AND used = 0'
    );
    this.selectSessionByToken = this.db.prepare(
      'SELECT * FROM pairing_tokens WHERE session_token = ? AND used = 1'
    );
    this.cleanExpiredTokens = this.db.prepare(
      "DELETE FROM pairing_tokens WHERE expires_at < datetime('now') AND used = 0"
    );
    this.deleteSessionByToken = this.db.prepare(
      'DELETE FROM pairing_tokens WHERE session_token = ?'
    );

    // Agent toggle
    this.updateAgentEnabled = this.db.prepare(
      "UPDATE agents SET enabled = ?, updated_at = datetime('now') WHERE hash_key = ? AND agent_id = ?"
    );

    // Per-agent stats
    this.getAgentPerStats = this.db.prepare(`
      SELECT
        COUNT(*) as total_runs,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_runs,
        SUM(CASE WHEN execution_mode = 'replay' THEN 1 ELSE 0 END) as replay_runs,
        SUM(CASE WHEN execution_mode = 'ai_fallback' THEN 1 ELSE 0 END) as ai_fallback_runs,
        SUM(tokens_used) as tokens_saved,
        SUM(cost_saved) as cost_saved
      FROM agent_runs
      WHERE hash_key = ? AND agent_id = ?
    `);

    // -----------------------------------------------------------------------
    // Phase 273 / INGEST-07/08/11/12 -- anonymous telemetry pipeline statements.
    // Additive; existing statements untouched. Uses INSERT OR IGNORE on event_id
    // PRIMARY KEY so BEAT-04 (client-side replay dedup) survives at the server.
    // -----------------------------------------------------------------------
    this.insertTelemetryEvent = this.db.prepare(
      'INSERT OR IGNORE INTO telemetry_events (event_id, install_uuid, ts_minute, mcp_client, model, tokens_in, tokens_out, active_agent_count, event_type, ip_hash, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    // Quick task 260630-hct -- region-bearing variant (12 placeholders, trailing
    // `region`). SEPARATE from the 11-arg insertTelemetryEvent above, whose arity
    // the housekeeper/optout tests + insertTelemetryEventRow depend on. The ingest
    // route (routes/telemetry.js) uses THIS statement; the daily rollup reads the
    // region column back out via selectPopularRegionForDayRange.
    this.insertTelemetryEventWithRegion = this.db.prepare(
      'INSERT OR IGNORE INTO telemetry_events (event_id, install_uuid, ts_minute, mcp_client, model, tokens_in, tokens_out, active_agent_count, event_type, ip_hash, received_at, region) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    this.insertTelemetryEventWithRegionV2 = this.db.prepare(
      'INSERT OR IGNORE INTO telemetry_events (event_id, install_uuid, ts_minute, mcp_client, model, tokens_in, tokens_out, active_agent_count, active_count_version, event_type, ip_hash, received_at, region) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    this.upsertRollupDaily = this.db.prepare(`
      INSERT INTO telemetry_rollups_daily (install_uuid, day_utc, tokens_in, tokens_out, max_active_agents, event_count)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(install_uuid, day_utc) DO UPDATE SET
        tokens_in = excluded.tokens_in,
        tokens_out = excluded.tokens_out,
        max_active_agents = excluded.max_active_agents,
        event_count = excluded.event_count
    `);
    this.upsertRollupDailyV2 = this.db.prepare(`
      INSERT INTO telemetry_rollups_daily (
        install_uuid, day_utc, tokens_in, tokens_out, max_active_agents,
        trusted_active_sample_count, event_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(install_uuid, day_utc) DO UPDATE SET
        tokens_in = excluded.tokens_in,
        tokens_out = excluded.tokens_out,
        max_active_agents = excluded.max_active_agents,
        trusted_active_sample_count = excluded.trusted_active_sample_count,
        event_count = excluded.event_count
    `);

    this.upsertGlobalAggregate = this.db.prepare(`
      INSERT INTO telemetry_global_aggregates (day_utc, unique_installs, tokens_in_sum, tokens_out_sum, agents_active_sum, popular_mcp_json, popular_agent_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(day_utc) DO UPDATE SET
        unique_installs = excluded.unique_installs,
        tokens_in_sum = excluded.tokens_in_sum,
        tokens_out_sum = excluded.tokens_out_sum,
        agents_active_sum = excluded.agents_active_sum,
        popular_mcp_json = excluded.popular_mcp_json,
        popular_agent_json = excluded.popular_agent_json
    `);
    // Quick task 260630-hct -- region-bearing upsert (8 placeholders, trailing
    // popular_region_json). SEPARATE from the 7-arg upsertGlobalAggregate above so
    // the existing housekeeper caller + housekeeper/headline tests keep working;
    // the housekeeper switches to THIS statement in the region-rollup task. Mirrors
    // the insertTelemetryEvent / insertTelemetryEventWithRegion split.
    this.upsertGlobalAggregateWithRegion = this.db.prepare(`
      INSERT INTO telemetry_global_aggregates (day_utc, unique_installs, tokens_in_sum, tokens_out_sum, agents_active_sum, popular_mcp_json, popular_agent_json, popular_region_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(day_utc) DO UPDATE SET
        unique_installs = excluded.unique_installs,
        tokens_in_sum = excluded.tokens_in_sum,
        tokens_out_sum = excluded.tokens_out_sum,
        agents_active_sum = excluded.agents_active_sum,
        popular_mcp_json = excluded.popular_mcp_json,
        popular_agent_json = excluded.popular_agent_json,
        popular_region_json = excluded.popular_region_json
    `);
    this.upsertGlobalAggregateWithFreshness = this.db.prepare(`
      INSERT INTO telemetry_global_aggregates (
        day_utc, unique_installs, tokens_in_sum, tokens_out_sum,
        agents_active_sum, popular_mcp_json, popular_agent_json,
        popular_region_json, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(day_utc) DO UPDATE SET
        unique_installs = excluded.unique_installs,
        tokens_in_sum = excluded.tokens_in_sum,
        tokens_out_sum = excluded.tokens_out_sum,
        agents_active_sum = excluded.agents_active_sum,
        popular_mcp_json = excluded.popular_mcp_json,
        popular_agent_json = excluded.popular_agent_json,
        popular_region_json = excluded.popular_region_json,
        updated_at = excluded.updated_at
    `);
    this.upsertGlobalAggregateV2 = this.db.prepare(`
      INSERT INTO telemetry_global_aggregates (
        day_utc, unique_installs, tokens_in_sum, tokens_out_sum,
        agents_active_sum, popular_mcp_json, popular_agent_json,
        popular_region_json, updated_at, active_count_version,
        trusted_active_installs
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(day_utc) DO UPDATE SET
        unique_installs = excluded.unique_installs,
        tokens_in_sum = excluded.tokens_in_sum,
        tokens_out_sum = excluded.tokens_out_sum,
        agents_active_sum = excluded.agents_active_sum,
        popular_mcp_json = excluded.popular_mcp_json,
        popular_agent_json = excluded.popular_agent_json,
        popular_region_json = excluded.popular_region_json,
        updated_at = excluded.updated_at,
        active_count_version = excluded.active_count_version,
        trusted_active_installs = excluded.trusted_active_installs
    `);

    this.deleteEventsByUuid = this.db.prepare('DELETE FROM telemetry_events WHERE install_uuid = ?');
    this.deleteRollupsByUuid = this.db.prepare('DELETE FROM telemetry_rollups_daily WHERE install_uuid = ?');
    this.deleteOldEvents = this.db.prepare('DELETE FROM telemetry_events WHERE received_at < ?');
    this.deleteOldRollups = this.db.prepare('DELETE FROM telemetry_rollups_daily WHERE day_utc < ?');

    // Day-range range scans use the (install_uuid, ts_minute) index when filtered by
    // install_uuid, otherwise fall back to a sequential scan -- the housekeeper's
    // selectUuidsForDayRange materialises the DISTINCT uuid list first to keep this hot.
    this.aggregateRollupForUuidDay = this.db.prepare(
      `SELECT
         install_uuid,
         SUM(tokens_in) AS tokens_in,
         SUM(tokens_out) AS tokens_out,
         COALESCE(MAX(CASE WHEN active_count_version >= 2 THEN active_agent_count END), 0) AS max_active_agents,
         SUM(CASE WHEN active_count_version >= 2 THEN 1 ELSE 0 END) AS trusted_active_sample_count,
         COUNT(*) AS event_count
       FROM telemetry_events
       WHERE ts_minute >= ? AND ts_minute < ? AND install_uuid = ?
       GROUP BY install_uuid`
    );
    this.selectUuidsForDayRange = this.db.prepare(
      'SELECT DISTINCT install_uuid FROM telemetry_events WHERE ts_minute >= ? AND ts_minute < ?'
    );
    this.selectGlobalForDayRange = this.db.prepare(`
      WITH bounds(start_ms, end_ms) AS (VALUES (?, ?)),
      per_install AS (
        SELECT
          e.install_uuid,
          SUM(e.tokens_in) AS tokens_in_sum,
          SUM(e.tokens_out) AS tokens_out_sum,
          COALESCE(MAX(CASE WHEN e.active_count_version >= 2 THEN e.active_agent_count END), 0) AS max_active_agents,
          MAX(CASE WHEN e.active_count_version >= 2 THEN 1 ELSE 0 END) AS has_trusted_active
        FROM telemetry_events AS e, bounds AS b
        WHERE e.ts_minute >= b.start_ms AND e.ts_minute < b.end_ms
        GROUP BY e.install_uuid
      ),
      latest_source AS (
        SELECT install_uuid, ip_hash
        FROM (
          SELECT
            e.install_uuid,
            e.ip_hash,
            ROW_NUMBER() OVER (
              PARTITION BY e.install_uuid
              ORDER BY e.received_at DESC, e.ts_minute DESC, e.event_id DESC
            ) AS source_rank
          FROM telemetry_events AS e, bounds AS b
          WHERE e.ts_minute >= b.start_ms AND e.ts_minute < b.end_ms
        )
        WHERE source_rank = 1
      ),
      attributed AS (
        SELECT p.*, s.ip_hash
        FROM per_install AS p
        JOIN latest_source AS s USING (install_uuid)
      ),
      source_active AS (
        SELECT ip_hash, MIN(64, SUM(max_active_agents)) AS capped_active_agents
        FROM attributed
        WHERE has_trusted_active = 1
        GROUP BY ip_hash
      )
      SELECT
        COUNT(*) AS unique_installs,
        SUM(tokens_in_sum) AS tokens_in_sum,
        SUM(tokens_out_sum) AS tokens_out_sum,
        COALESCE((SELECT SUM(capped_active_agents) FROM source_active), 0) AS agents_active_sum,
        SUM(has_trusted_active) AS trusted_active_installs
      FROM attributed
    `);
    this.selectPopularMcpForDayRange = this.db.prepare(`
      SELECT mcp_client, COUNT(DISTINCT install_uuid) AS uniq
      FROM telemetry_events
      WHERE ts_minute >= ? AND ts_minute < ?
        -- exclude presence heartbeats from popularity ranking (see RCA 260530-19i)
        AND NOT (tokens_in = 0 AND tokens_out = 0 AND mcp_client = 'unknown')
      GROUP BY mcp_client
      ORDER BY uniq DESC
    `);
    // Quick task 260630-hct -- region popularity for the daily rollup, mirroring
    // selectPopularMcpForDayRange exactly (GROUP BY region). uniq is
    // COUNT(DISTINCT install_uuid) per region; the housekeeper applies the k>=5 floor.
    this.selectPopularRegionForDayRange = this.db.prepare(
      'SELECT region, COUNT(DISTINCT install_uuid) AS uniq FROM telemetry_events WHERE ts_minute >= ? AND ts_minute < ? GROUP BY region ORDER BY uniq DESC'
    );
    // Choose one (latest) region membership per install per day. Counting an
    // install in every region it traversed can make the published breakdown
    // exceed the day's unique-install population and can fabricate k-sized
    // cohorts. UUIDs remain internal and never enter the aggregate JSON.
    this.selectRegionInstallMembershipsForDayRange = this.db.prepare(
      `SELECT region, install_uuid
       FROM (
         SELECT
           region,
           install_uuid,
           ROW_NUMBER() OVER (
             PARTITION BY install_uuid
             ORDER BY received_at DESC, ts_minute DESC, event_id DESC
           ) AS membership_rank
         FROM telemetry_events
         WHERE ts_minute >= ? AND ts_minute < ?
       )
       WHERE membership_rank = 1
       ORDER BY install_uuid ASC`
    );

    this.selectTodaySalt = this.db.prepare('SELECT salt_hex, minted_at FROM telemetry_daily_salt WHERE day_utc = ?');
    this.insertTodaySalt = this.db.prepare('INSERT INTO telemetry_daily_salt (day_utc, salt_hex, minted_at) VALUES (?, ?, ?)');
    this.deleteOldSalts = this.db.prepare('DELETE FROM telemetry_daily_salt WHERE day_utc < ?');

    // Phase 274 / AGG-01..09 -- public aggregates read paths (no writes).
    // Each is hand-built from typed fields per T-274-01; no SELECT *.
    // Distinct users scan the retained 365-day per-install rollups; lifetime
    // tokens and agent-days scan anonymous global day rows.
    this.aggregateTotalUsers = this.db.prepare(
      'SELECT COUNT(DISTINCT install_uuid) AS n FROM telemetry_rollups_daily WHERE day_utc >= ? AND day_utc <= ?'
    );
    this.aggregateAgentDaysLifetime = this.db.prepare(
      'SELECT COALESCE(SUM(agents_active_sum), 0) AS n FROM telemetry_global_aggregates WHERE active_count_version >= 2'
    );
    this.aggregateTokensLifetime = this.db.prepare(
      'SELECT COALESCE(SUM(tokens_in_sum + tokens_out_sum), 0) AS n FROM telemetry_global_aggregates'
    );
    this.aggregateTokens24h = this.db.prepare(
      'SELECT COALESCE(SUM(tokens_in + tokens_out), 0) AS n FROM telemetry_events WHERE received_at >= ? AND received_at <= ?'
    );
    this.selectLatestGlobalAggregate = this.db.prepare(
      'SELECT day_utc, updated_at, active_count_version, trusted_active_installs, unique_installs, popular_mcp_json, popular_agent_json, popular_region_json FROM telemetry_global_aggregates WHERE day_utc <= ? ORDER BY day_utc DESC LIMIT 1'
    );
    this.selectSeriesForWindow = this.db.prepare(
      'SELECT day_utc, unique_installs, tokens_in_sum, tokens_out_sum, agents_active_sum, active_count_version, trusted_active_installs FROM telemetry_global_aggregates WHERE day_utc >= ? AND day_utc <= ? ORDER BY day_utc ASC'
    );
    this.selectActiveHistoryStart = this.db.prepare(
      'SELECT MIN(day_utc) AS day_utc FROM telemetry_global_aggregates WHERE active_count_version >= 2 AND trusted_active_installs > 0 AND day_utc <= ?'
    );

    // Quick task 260516-7l5 -- GitHub stats cache.
    // One row per endpoint_id (7 total). Populated by src/telemetry/github-poller.js
    // every 5 minutes. Read by src/routes/public-stats.js (/github/:endpoint_id sub-route).
    this.upsertGithubCache = this.db.prepare(`
      INSERT INTO github_cache (
        endpoint_id, payload_json, etag, fetched_at, http_status,
        rate_limit_remaining, rate_limit_reset, is_complete, payload_version,
        last_attempt_at, last_error_status, consecutive_failures, next_retry_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)
      ON CONFLICT(endpoint_id) DO UPDATE SET
        payload_json = excluded.payload_json,
        etag = excluded.etag,
        fetched_at = excluded.fetched_at,
        http_status = excluded.http_status,
        rate_limit_remaining = excluded.rate_limit_remaining,
        rate_limit_reset = excluded.rate_limit_reset,
        is_complete = excluded.is_complete,
        payload_version = excluded.payload_version,
        last_attempt_at = excluded.last_attempt_at,
        last_error_status = NULL,
        consecutive_failures = 0,
        next_retry_at = excluded.next_retry_at
    `);
    // A 304 is only a successful refresh for an already-complete cache. Legacy
    // or failed partial rows never send an ETag, so this guard is defensive.
    this.touchGithubCacheOn304 = this.db.prepare(`
      UPDATE github_cache
      SET fetched_at = ?, http_status = ?, rate_limit_remaining = ?,
          rate_limit_reset = ?, last_attempt_at = ?, last_error_status = NULL,
          consecutive_failures = 0, next_retry_at = NULL
      WHERE endpoint_id = ? AND is_complete = 1
    `);
    this.recordGithubCacheFailure = this.db.prepare(`
      INSERT INTO github_cache (
        endpoint_id, payload_json, etag, fetched_at, http_status,
        rate_limit_remaining, rate_limit_reset, is_complete, payload_version,
        last_attempt_at, last_error_status, consecutive_failures, next_retry_at
      )
      VALUES (?, 'null', NULL, 0, ?, ?, ?, 0, 0, ?, ?, 1, ?)
      ON CONFLICT(endpoint_id) DO UPDATE SET
        http_status = excluded.http_status,
        rate_limit_remaining = excluded.rate_limit_remaining,
        rate_limit_reset = excluded.rate_limit_reset,
        last_attempt_at = excluded.last_attempt_at,
        last_error_status = excluded.last_error_status,
        consecutive_failures = github_cache.consecutive_failures + 1,
        next_retry_at = excluded.next_retry_at
    `);
    this.selectGithubCache = this.db.prepare(
      `SELECT endpoint_id, payload_json, etag, fetched_at, http_status,
              rate_limit_remaining, rate_limit_reset, is_complete,
              payload_version, last_attempt_at, last_error_status,
              consecutive_failures, next_retry_at
       FROM github_cache WHERE endpoint_id = ?`
    );
    this.selectGithubEtag = this.db.prepare(
      'SELECT etag FROM github_cache WHERE endpoint_id = ? AND is_complete = 1'
    );
  }

  // Hash key operations
  createHashKey(hashKey) {
    return this.insertHashKey.run(hashKey);
  }

  validateHashKey(hashKey) {
    const row = this.getHashKey.get(hashKey);
    if (row) {
      this.updateLastSeen.run(hashKey);
    }
    return row || null;
  }

  // Agent operations
  upsertAgentData(hashKey, data) {
    return this.upsertAgent.run(
      hashKey, data.agentId, data.name, data.task,
      data.startMode || 'pinned',
      data.targetUrl || '',
      data.scheduleType, data.scheduleConfig || '{}',
      data.enabled ? 1 : 0
    );
  }

  listAgents(hashKey) {
    return this.getAgents.all(hashKey);
  }

  getAgentData(hashKey, agentId) {
    return this.getAgent.get(hashKey, agentId);
  }

  removeAgent(hashKey, agentId) {
    return this.deleteAgent.run(hashKey, agentId);
  }

  toggleAgentEnabled(hashKey, agentId, enabled) {
    return this.updateAgentEnabled.run(enabled ? 1 : 0, hashKey, agentId);
  }

  getPerAgentStats(hashKey, agentId) {
    const row = this.getAgentPerStats.get(hashKey, agentId);
    return {
      totalRuns: row.total_runs || 0,
      successfulRuns: row.successful_runs || 0,
      replayRuns: row.replay_runs || 0,
      aiFallbackRuns: row.ai_fallback_runs || 0,
      tokensSaved: row.tokens_saved || 0,
      costSaved: Math.round((row.cost_saved || 0) * 10000) / 10000
    };
  }

  // Run operations
  recordRun(hashKey, agentId, run) {
    return this.insertRun.run(
      hashKey, agentId, run.runId,
      run.startedAt, run.completedAt,
      run.status, run.result, run.error,
      run.iterations || 0, run.tokensUsed || 0,
      run.costUsd || 0, run.durationMs || 0,
      run.executionMode || 'ai_initial',
      run.costSaved || 0
    );
  }

  listRuns(hashKey, agentId, limit = 20, offset = 0) {
    return this.getRuns.all(hashKey, agentId, limit, offset);
  }

  countRuns(hashKey, agentId) {
    return this.getRunCount.get(hashKey, agentId).count;
  }

  listRecentRuns(hashKey, limit = 50) {
    return this.getRecentRuns.all(hashKey, limit);
  }

  // Pairing token operations
  createPairingToken(token, hashKey, expiresAt) {
    return this.insertPairingToken.run(token, hashKey, expiresAt);
  }

  getPairingToken(token) {
    return this.selectPairingToken.get(token) || null;
  }

  consumePairingToken(token, sessionToken, sessionExpiresAt) {
    return this.markTokenUsed.run(sessionToken, sessionExpiresAt, token);
  }

  invalidatePairingTokens(hashKey) {
    return this.invalidateTokensByHashKey.run(hashKey);
  }

  getSessionByToken(sessionToken) {
    return this.selectSessionByToken.get(sessionToken) || null;
  }

  cleanExpiredPairingTokens() {
    return this.cleanExpiredTokens.run();
  }

  revokeSession(sessionToken) {
    return this.deleteSessionByToken.run(sessionToken);
  }

  // Stats
  getAgentStats(hashKey) {
    const allTime = this.getStats.get(hashKey);
    const today = this.getTodayStats.get(hashKey);
    const agents = this.getAgents.all(hashKey);

    return {
      totalAgents: agents.length,
      enabledAgents: agents.filter(a => a.enabled).length,
      totalRuns: allTime.total_runs || 0,
      successfulRuns: allTime.successful_runs || 0,
      runsToday: today.runs_today || 0,
      successfulToday: today.successful_today || 0,
      successRate: allTime.total_runs > 0
        ? Math.round((allTime.successful_runs / allTime.total_runs) * 100)
        : 0,
      totalTokens: allTime.total_tokens || 0,
      totalCost: Math.round((allTime.total_cost || 0) * 10000) / 10000,
      totalCostSaved: Math.round((allTime.total_cost_saved || 0) * 10000) / 10000,
      totalDuration: allTime.total_duration || 0
    };
  }

  // -----------------------------------------------------------------------
  // Phase 273 / INGEST-07/08/11/12 -- anonymous telemetry pipeline helpers.
  // Each method is a small wrapper around the prepared statement; business
  // logic lives in routes/telemetry.js, telemetry/housekeeper.js, and utils/.
  // -----------------------------------------------------------------------
  insertTelemetryEventRow(eventId, installUuid, tsMinute, mcpClient, model, tokensIn, tokensOut, activeAgentCount, eventType, ipHash, receivedAt) {
    return this.insertTelemetryEvent.run(
      eventId, installUuid, tsMinute, mcpClient, model || null,
      tokensIn, tokensOut, activeAgentCount, eventType, ipHash, receivedAt
    );
  }

  forgetInstallUuid(installUuid) {
    // Order: events first, then rollups. (No FK between them; either order is
    // fine, but events is the larger table and the obvious user-visible target.)
    const a = this.deleteEventsByUuid.run(installUuid);
    const b = this.deleteRollupsByUuid.run(installUuid);
    return { eventsDeleted: a.changes, rollupsDeleted: b.changes };
  }

  pruneOldTelemetryEvents(beforeMs) {
    return this.deleteOldEvents.run(beforeMs).changes;
  }

  listUuidsForDayRange(startMs, endMs) {
    return this.selectUuidsForDayRange.all(startMs, endMs).map((r) => r.install_uuid);
  }

  aggregateForUuidDay(startMs, endMs, installUuid) {
    return this.aggregateRollupForUuidDay.get(startMs, endMs, installUuid) || null;
  }

  upsertRollupDailyRow(installUuid, dayUtc, tokensIn, tokensOut, maxActiveAgents, eventCount) {
    return this.upsertRollupDaily.run(installUuid, dayUtc, tokensIn || 0, tokensOut || 0, maxActiveAgents || 0, eventCount || 0);
  }

  aggregateGlobalForDayRange(startMs, endMs) {
    return this.selectGlobalForDayRange.get(startMs, endMs) || null;
  }

  popularMcpForDayRange(startMs, endMs) {
    return this.selectPopularMcpForDayRange.all(startMs, endMs);
  }

  // Quick task 260630-hct -- region popularity wrapper (matches popularMcpForDayRange).
  popularRegionForDayRange(startMs, endMs) {
    return this.selectPopularRegionForDayRange.all(startMs, endMs);
  }

  regionInstallMembershipsForDayRange(startMs, endMs) {
    return this.selectRegionInstallMembershipsForDayRange.all(startMs, endMs);
  }

  upsertGlobalAggregateRow(dayUtc, uniqueInstalls, tokensInSum, tokensOutSum, agentsActiveSum, popularMcpJson, popularAgentJson, popularRegionJson) {
    // Quick task 260630-hct -- route through the 8-arg region-bearing statement so
    // the region breakdown round-trips; popularRegionJson defaults to '[]'.
    return this.upsertGlobalAggregateWithRegion.run(
      dayUtc, uniqueInstalls || 0, tokensInSum || 0, tokensOutSum || 0, agentsActiveSum || 0,
      popularMcpJson || '[]', popularAgentJson || '[]', popularRegionJson || '[]'
    );
  }

  // -----------------------------------------------------------------------
  // Phase 274 / AGG-01..09 -- public-stats helpers.
  // Each method returns plain JS numbers (better-sqlite3 INTEGER -> number
  // when <= 2^53; for our scale this is safe). Defensive defaults handle the
  // empty-database case so the public endpoint never returns null fields.
  // -----------------------------------------------------------------------
  getPublicHeadlineRows(nowMs = Date.now()) {
    const snapshotMs = (typeof nowMs === 'number' && Number.isFinite(nowMs)) ? nowMs : Date.now();
    const todayStartMs = utcDayStartMs(snapshotMs);
    const users365d = this.aggregateTotalUsers.get(
      utcDayKey(todayStartMs - 364 * ONE_DAY_MS),
      utcDayKey(todayStartMs)
    )?.n || 0;
    const agentDaysLifetime = this.aggregateAgentDaysLifetime.get()?.n || 0;
    const todayKey = utcDayKey(todayStartMs);
    const activeHistoryStart = this.selectActiveHistoryStart.get(todayKey)?.day_utc || null;
    return {
      users_365d:            users365d,
      // Deprecated compatibility alias; per-install identifiers are retained
      // for 365 days and cannot support a truthful lifetime distinct count.
      total_users:           users365d,
      // Pre-v2 active counts are known-corrupt and intentionally excluded.
      // A truthful lifetime active-agent metric is therefore unavailable.
      agent_days_lifetime:   null,
      total_agents_lifetime: null,
      agent_days_since_active_v2: agentDaysLifetime,
      active_history_since:  activeHistoryStart,
      tokens_total_lifetime: this.aggregateTokensLifetime.get()?.n || 0,
      tokens_24h:            this.aggregateTokens24h.get(snapshotMs - ONE_DAY_MS, snapshotMs)?.n || 0,
      latest_global:         this.selectLatestGlobalAggregate.get(todayKey) || {
        day_utc: null,
        updated_at: 0,
        active_count_version: 0,
        trusted_active_installs: 0,
        unique_installs: 0,
        popular_mcp_json: '[]',
        popular_agent_json: '[]',
        popular_region_json: '[]',
      },
    };
  }

  getPublicSeriesRows(nowMs = Date.now()) {
    const snapshotMs = (typeof nowMs === 'number' && Number.isFinite(nowMs)) ? nowMs : Date.now();
    const todayStartMs = utcDayStartMs(snapshotMs);
    const dayKey = (daysAgo) => utcDayKey(todayStartMs - daysAgo * ONE_DAY_MS);
    const todayKey = dayKey(0);
    const latest = this.selectLatestGlobalAggregate.get(todayKey) || { day_utc: null, updated_at: 0 };
    return {
      d30:  this.selectSeriesForWindow.all(dayKey(29), todayKey),
      d90:  this.selectSeriesForWindow.all(dayKey(89), todayKey),
      d365: this.selectSeriesForWindow.all(dayKey(364), todayKey),
      latest_global: latest,
      active_history_since: this.selectActiveHistoryStart.get(todayKey)?.day_utc || null,
    };
  }

  // -----------------------------------------------------------------------
  // GitHub stats cache helpers. Successful writes replace the payload and
  // reset failure state. Failure writes preserve payload_json, etag,
  // fetched_at, completeness, and payload version so readers retain the
  // last-known-good snapshot.
  // -----------------------------------------------------------------------
  upsertGithubCacheRow(
    endpointId,
    payloadJson,
    etag,
    fetchedAt,
    httpStatus,
    rlRemaining,
    rlReset,
    isComplete = true,
    payloadVersion = 1,
    lastAttemptAt = fetchedAt,
    nextRetryAt = null
  ) {
    this.upsertGithubCache.run(
      endpointId,
      payloadJson,
      etag,
      fetchedAt,
      httpStatus,
      rlRemaining == null ? null : Number(rlRemaining),
      rlReset == null ? null : Number(rlReset),
      isComplete ? 1 : 0,
      Number(payloadVersion) || 0,
      lastAttemptAt,
      nextRetryAt
    );
  }

  touchGithubCacheRow(endpointId, fetchedAt, httpStatus, rlRemaining, rlReset) {
    this.touchGithubCacheOn304.run(
      fetchedAt,
      httpStatus,
      rlRemaining == null ? null : Number(rlRemaining),
      rlReset == null ? null : Number(rlReset),
      fetchedAt,
      endpointId
    );
  }

  recordGithubCacheFailureRow(endpointId, attemptedAt, httpStatus, rlRemaining, rlReset, nextRetryAt) {
    const normalizedStatus = Number.isInteger(Number(httpStatus)) ? Number(httpStatus) : 0;
    this.recordGithubCacheFailure.run(
      endpointId,
      normalizedStatus,
      rlRemaining == null ? null : Number(rlRemaining),
      rlReset == null ? null : Number(rlReset),
      attemptedAt,
      normalizedStatus,
      nextRetryAt
    );
  }

  getGithubCachePayload(endpointId) {
    const row = this.selectGithubCache.get(endpointId);
    if (!row) return null;
    return {
      payload: row.payload_json,
      etag: row.etag,
      fetchedAt: row.fetched_at,
      status: row.http_status,
      rateLimitRemaining: row.rate_limit_remaining,
      rateLimitReset: row.rate_limit_reset,
      isComplete: row.is_complete === 1,
      payloadVersion: row.payload_version,
      lastAttemptAt: row.last_attempt_at,
      lastErrorStatus: row.last_error_status,
      consecutiveFailures: row.consecutive_failures,
      nextRetryAt: row.next_retry_at,
    };
  }

  getGithubEtag(endpointId) {
    const row = this.selectGithubEtag.get(endpointId);
    return row ? row.etag : null;
  }
}

module.exports = Queries;
