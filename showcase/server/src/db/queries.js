/**
 * Parameterized database queries
 */

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

    this.upsertRollupDaily = this.db.prepare(`
      INSERT INTO telemetry_rollups_daily (install_uuid, day_utc, tokens_in, tokens_out, max_active_agents, event_count)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(install_uuid, day_utc) DO UPDATE SET
        tokens_in = excluded.tokens_in,
        tokens_out = excluded.tokens_out,
        max_active_agents = excluded.max_active_agents,
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

    this.deleteEventsByUuid = this.db.prepare('DELETE FROM telemetry_events WHERE install_uuid = ?');
    this.deleteRollupsByUuid = this.db.prepare('DELETE FROM telemetry_rollups_daily WHERE install_uuid = ?');
    this.deleteOldEvents = this.db.prepare('DELETE FROM telemetry_events WHERE received_at < ?');

    // Day-range range scans use the (install_uuid, ts_minute) index when filtered by
    // install_uuid, otherwise fall back to a sequential scan -- the housekeeper's
    // selectUuidsForDayRange materialises the DISTINCT uuid list first to keep this hot.
    this.aggregateRollupForUuidDay = this.db.prepare(
      'SELECT install_uuid, SUM(tokens_in) AS tokens_in, SUM(tokens_out) AS tokens_out, MAX(active_agent_count) AS max_active_agents, COUNT(*) AS event_count FROM telemetry_events WHERE ts_minute >= ? AND ts_minute < ? AND install_uuid = ? GROUP BY install_uuid'
    );
    this.selectUuidsForDayRange = this.db.prepare(
      'SELECT DISTINCT install_uuid FROM telemetry_events WHERE ts_minute >= ? AND ts_minute < ?'
    );
    this.selectGlobalForDayRange = this.db.prepare(
      'SELECT COUNT(DISTINCT install_uuid) AS unique_installs, SUM(tokens_in) AS tokens_in_sum, SUM(tokens_out) AS tokens_out_sum, SUM(active_agent_count) AS agents_active_sum FROM telemetry_events WHERE ts_minute >= ? AND ts_minute < ?'
    );
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

    this.selectTodaySalt = this.db.prepare('SELECT salt_hex, minted_at FROM telemetry_daily_salt WHERE day_utc = ?');
    this.insertTodaySalt = this.db.prepare('INSERT INTO telemetry_daily_salt (day_utc, salt_hex, minted_at) VALUES (?, ?, ?)');
    this.deleteOldSalts = this.db.prepare('DELETE FROM telemetry_daily_salt WHERE day_utc < ?');

    // Phase 274 / AGG-01..09 -- public aggregates read paths (no writes).
    // Each is hand-built from typed fields per T-274-01; no SELECT *. The lifetime
    // statements (total_users / lifetime tokens) scan tables the housekeeper rolls
    // up nightly; reads are O(rows-per-day) for ~365 days, well under SQLite's
    // millisecond ceiling.
    this.aggregateTotalUsers = this.db.prepare(
      'SELECT COUNT(DISTINCT install_uuid) AS n FROM telemetry_rollups_daily'
    );
    this.aggregateTotalAgentsLifetime = this.db.prepare(
      'SELECT COALESCE(SUM(max_active_agents), 0) AS n FROM telemetry_rollups_daily'
    );
    this.aggregateTokensLifetime = this.db.prepare(
      'SELECT COALESCE(SUM(tokens_in_sum + tokens_out_sum), 0) AS n FROM telemetry_global_aggregates'
    );
    this.aggregateTokens24h = this.db.prepare(
      "SELECT COALESCE(SUM(tokens_in_sum + tokens_out_sum), 0) AS n FROM telemetry_global_aggregates WHERE day_utc >= date('now', '-1 day')"
    );
    this.selectLatestGlobalAggregate = this.db.prepare(
      'SELECT popular_mcp_json, popular_agent_json, popular_region_json FROM telemetry_global_aggregates ORDER BY day_utc DESC LIMIT 1'
    );
    this.selectSeriesForWindow = this.db.prepare(
      "SELECT day_utc, unique_installs, tokens_in_sum, tokens_out_sum, agents_active_sum FROM telemetry_global_aggregates WHERE day_utc >= date('now', ?) ORDER BY day_utc ASC"
    );

    // Quick task 260516-7l5 -- GitHub stats cache.
    // One row per endpoint_id (7 total). Populated by src/telemetry/github-poller.js
    // every 5 minutes. Read by src/routes/public-stats.js (/github/:endpoint_id sub-route).
    this.upsertGithubCache = this.db.prepare(`
      INSERT INTO github_cache (endpoint_id, payload_json, etag, fetched_at, http_status, rate_limit_remaining, rate_limit_reset)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint_id) DO UPDATE SET
        payload_json = excluded.payload_json,
        etag = excluded.etag,
        fetched_at = excluded.fetched_at,
        http_status = excluded.http_status,
        rate_limit_remaining = excluded.rate_limit_remaining,
        rate_limit_reset = excluded.rate_limit_reset
    `);
    // 304 path: bump fetched_at + http_status but keep payload_json and etag unchanged.
    this.touchGithubCacheOn304 = this.db.prepare(`
      UPDATE github_cache
      SET fetched_at = ?, http_status = ?, rate_limit_remaining = ?, rate_limit_reset = ?
      WHERE endpoint_id = ?
    `);
    this.selectGithubCache = this.db.prepare(
      'SELECT endpoint_id, payload_json, etag, fetched_at, http_status FROM github_cache WHERE endpoint_id = ?'
    );
    this.selectGithubEtag = this.db.prepare(
      'SELECT etag FROM github_cache WHERE endpoint_id = ?'
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
  getPublicHeadlineRows() {
    return {
      total_users:           this.aggregateTotalUsers.get()?.n || 0,
      total_agents_lifetime: this.aggregateTotalAgentsLifetime.get()?.n || 0,
      tokens_total_lifetime: this.aggregateTokensLifetime.get()?.n || 0,
      tokens_24h:            this.aggregateTokens24h.get()?.n || 0,
      latest_global:         this.selectLatestGlobalAggregate.get() || { popular_mcp_json: '[]', popular_agent_json: '[]', popular_region_json: '[]' },
    };
  }

  getPublicSeriesRows() {
    return {
      d30:  this.selectSeriesForWindow.all('-30 days'),
      d90:  this.selectSeriesForWindow.all('-90 days'),
      d365: this.selectSeriesForWindow.all('-365 days'),
    };
  }

  // -----------------------------------------------------------------------
  // Quick task 260516-7l5 -- GitHub stats cache helpers.
  // The poller (src/telemetry/github-poller.js) calls upsertGithubCacheRow
  // on 200 and touchGithubCacheRow on 304. The route handler
  // (src/routes/public-stats.js /github/:endpoint_id) calls
  // getGithubCachePayload to serve the cached JSON STRING verbatim (no
  // JSON.parse + JSON.stringify round-trip on the hot path).
  // -----------------------------------------------------------------------
  upsertGithubCacheRow(endpointId, payloadJson, etag, fetchedAt, httpStatus, rlRemaining, rlReset) {
    this.upsertGithubCache.run(
      endpointId,
      payloadJson,
      etag,
      fetchedAt,
      httpStatus,
      rlRemaining == null ? null : Number(rlRemaining),
      rlReset == null ? null : Number(rlReset)
    );
  }

  touchGithubCacheRow(endpointId, fetchedAt, httpStatus, rlRemaining, rlReset) {
    this.touchGithubCacheOn304.run(
      fetchedAt,
      httpStatus,
      rlRemaining == null ? null : Number(rlRemaining),
      rlReset == null ? null : Number(rlReset),
      endpointId
    );
  }

  getGithubCachePayload(endpointId) {
    const row = this.selectGithubCache.get(endpointId);
    if (!row) return null;
    return { payload: row.payload_json, etag: row.etag, fetchedAt: row.fetched_at, status: row.http_status };
  }

  getGithubEtag(endpointId) {
    const row = this.selectGithubEtag.get(endpointId);
    return row ? row.etag : null;
  }
}

module.exports = Queries;
