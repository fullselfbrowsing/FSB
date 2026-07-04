/**
 * Telemetry Collector -- 5-minute aggregated anonymous beats from MCP rows.
 *
 * Phase 272 / v0.9.69 telemetry pipeline. Reads fsbUsageData rows produced by
 * Phase 271's MCPMetricsRecorder, aggregates by (mcp_client, model) within a
 * watermarked 5-minute window, and POSTs 9-field allowlisted events to the
 * server every 5 minutes via chrome.alarms. Survives MV3 service-worker
 * eviction because the queue + watermark + alarm all live in chrome.storage.
 *
 * Requirements satisfied: BEAT-01..10 (5-min beat, alarm-driven flush, queue
 * persistence, 200-cap FIFO, 24h stale drop, opt-out short-circuit,
 * install_announce, retry cap=5, active_agent_count, debug-only logging).
 *
 * Module surface (globalThis.fsbTelemetryCollector):
 *   - flush()                         -> Promise<void>
 *       Read fsbUsageData rows since watermark, aggregate by (client, model),
 *       enqueue events, POST queue, clear sent / re-enqueue failed. Honors
 *       opt-out live (re-reads on every call). NEVER throws.
 *   - enqueue(event)                  -> Promise<void>
 *       Append a partial event to fsbTelemetryQueue. Assembles the full 9-field
 *       payload internally if `event_type === 'install_announce'` (or any
 *       partial input) so background.js callers do NOT construct the shape.
 *       Mints event_id at enqueue time so retries share the ID (server INSERT
 *       OR IGNORE dedup). 200-cap FIFO drop-oldest on overflow.
 *   - getPendingCount()               -> Promise<number>
 *       Read-only helper that returns the current queue length.
 *   - TELEMETRY_ENDPOINT              = 'https://full-selfbrowsing.com/api/telemetry/events'
 *   - BEAT_ALARM_NAME                 = 'fsb-telemetry-beat'
 *
 * Hard constraints (CONTEXT D-decisions + threat register):
 *   - The aggregation MUST copy only mcp_client, model, tokens_in, tokens_out,
 *     ts from fsbUsageData rows. The 9-field payload allowlist (event_id,
 *     install_uuid, ts_minute, mcp_client, model, tokens_in, tokens_out,
 *     active_agent_count, event_type) is the ENTIRE shape. Static-grep gate
 *     at tests/telemetry-payload-allowlist.test.js + runtime test section 9
 *     both enforce. NEVER spread `...row` or `Object.assign` row fields.
 *   - Forbidden identifiers in source (outside comments): tool, cost_usd,
 *     pricing_confidence, token_source, prompt, href, innerHTML, outerHTML,
 *     clipboard, Cookie, Authorization, .value. The URL constant is a single
 *     allowed reference; the static-grep gate examines runtime tokens only.
 *   - Every chrome.storage.local op wrapped in try/catch; telemetry must NEVER
 *     crash the SW or interfere with MCP dispatch.
 *   - All console output gated behind console.debug (BEAT-10).
 *   - No `class`, no ES `import`/`export`, no top-level mutable queue --
 *     queue lives exclusively in chrome.storage.local. importScripts-compatible.
 *
 * @module utils/telemetry-collector
 */

'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Hardcoded endpoint per CONTEXT decision. Phase 273 will land the matching
// server route. Until then POSTs return 404 -- the retry cap (5 attempts) +
// 200-event FIFO handle the drop window.
var TELEMETRY_ENDPOINT = 'https://full-selfbrowsing.com/api/telemetry/events';

// Alarm name per HARD CONSTRAINT 2 + CONTEXT decision.
var BEAT_ALARM_NAME = 'fsb-telemetry-beat';

// chrome.storage.local key locks. camelCase per project convention.
var QUEUE_KEY = 'fsbTelemetryQueue';
var WATERMARK_KEY = 'fsbTelemetryLastBeatTs';
var ACTIVE_AGENTS_KEY = 'fsbActiveAgentsCount';
var USAGE_DATA_KEY = 'fsbUsageData';

// Queue + retry caps per CONTEXT specifics.
var MAX_QUEUE_LENGTH = 200;
var MAX_ATTEMPTS_PER_EVENT = 5;
var STALE_DROP_MS = 86400000; // 24h in ms (24*60*60*1000).

// Periodic ts_minute resolution (BEAT-05): one minute, in ms.
var ONE_MINUTE_MS = 60000;

// The exact 9-key payload allowlist. Order is alphabetical for the test's
// Object.keys().sort() comparison.
var ALLOWED_EVENT_KEYS = Object.freeze([
  'active_agent_count',
  'event_id',
  'event_type',
  'install_uuid',
  'mcp_client',
  'model',
  'tokens_in',
  'tokens_out',
  'ts_minute'
]);

// ---------------------------------------------------------------------------
// Test seams (Node CommonJS injection points)
// ---------------------------------------------------------------------------

// Production code path: pass through chrome.storage.local + global fetch +
// globalThis.fsbInstallIdentity directly. The Node test harness calls
// `_setStorageShim`, `_setFetchShim`, `_setIdentityShim` to inject in-memory
// fakes so tests can capture writes / requests without touching globalThis.
// Default to null until first use so the production path can lazy-bind to
// chrome / fetch at first call.
var _storageShim = null;
var _fetchShim = null;
var _identityShim = null;

function _setStorageShim(shim) { _storageShim = shim; }
function _setFetchShim(fn) { _fetchShim = fn; }
function _setIdentityShim(shim) { _identityShim = shim; }

function _resolveStorage() {
  if (_storageShim) return _storageShim;
  if (typeof chrome !== 'undefined' && chrome && chrome.storage && chrome.storage.local) {
    return chrome.storage.local;
  }
  return null;
}

function _resolveFetch() {
  if (typeof _fetchShim === 'function') return _fetchShim;
  if (typeof fetch === 'function') return fetch;
  if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') return globalThis.fetch;
  return null;
}

function _resolveIdentity() {
  if (_identityShim) return _identityShim;
  if (typeof globalThis !== 'undefined' && globalThis.fsbInstallIdentity) {
    return globalThis.fsbInstallIdentity;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Concurrency lock (PITFALLS §4.1 pattern)
// ---------------------------------------------------------------------------
//
// Serialize concurrent flush() + enqueue() so two close-in-time alarm fires
// (or an enqueue racing with an in-flight flush) cannot interleave their
// chrome.storage read-modify-write cycles. Each call awaits the previous
// chain link; chaining `.then` -> .catch avoids unhandled rejections from
// breaking the chain.
var _flushLock = Promise.resolve();

function _withLock(fn) {
  var next = _flushLock.then(fn, fn);
  // Swallow any rejection so the chain stays alive for the next caller. The
  // body of fn already swallows; this is belt-and-suspenders.
  _flushLock = next.catch(function () { /* keep chain alive */ });
  return next;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _now() { return Date.now(); }

function _floorToMinute(tsMs) {
  return Math.floor(tsMs / ONE_MINUTE_MS) * ONE_MINUTE_MS;
}

function _mintEventId() {
  // Node 19+ and Chrome SW have native crypto.randomUUID.
  try {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
  } catch (_e) { /* fall through */ }
  // Last-resort fallback: time + random. The event_id is opaque to the
  // server; it only needs uniqueness within the install + dedup window.
  return 'fallback-' + _now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function _coerceActiveAgentCount(raw) {
  // BEAT-09 contract: default 0 if missing or non-numeric or negative.
  // Floor truncates any drift from a future contributor passing a float.
  if (typeof raw === 'number' && isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  return 0;
}

async function _readActiveAgentCount(storage) {
  // Best-effort read. A storage failure here yields 0 (the safe default per
  // BEAT-09); the collector never throws because of counter unavailability.
  if (!storage) return 0;
  try {
    var data = await storage.get([ACTIVE_AGENTS_KEY]);
    return _coerceActiveAgentCount(data && data[ACTIVE_AGENTS_KEY]);
  } catch (_e) {
    return 0;
  }
}

function _isValidEventShape(event) {
  // Defensive guard against tampered queue entries (T-272-03). An event MUST
  // be a plain object with a numeric ts_minute. Other field types are coerced
  // at flush time; the ts_minute check is the lifetime gate.
  if (!event || typeof event !== 'object') return false;
  if (typeof event.ts_minute !== 'number' || !isFinite(event.ts_minute)) return false;
  return true;
}

async function _readQueue(storage) {
  if (!storage) return [];
  try {
    var data = await storage.get([QUEUE_KEY]);
    var raw = data && data[QUEUE_KEY];
    if (!Array.isArray(raw)) return [];
    // Defensive copy + per-event shape validation.
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      if (_isValidEventShape(raw[i])) out.push(raw[i]);
    }
    return out;
  } catch (_e) {
    return [];
  }
}

async function _writeQueue(storage, queue) {
  if (!storage) return;
  try {
    var write = {};
    write[QUEUE_KEY] = queue;
    await storage.set(write);
  } catch (_e) {
    // Storage write failure -- swallow per defence in depth. The next flush
    // will re-attempt; in the meantime the in-memory queue is lost which is
    // acceptable telemetry quality cost (BEAT-10 + threat T-272-04).
  }
}

function _applyFifoCap(queue) {
  // Drop oldest events on overflow. Returns the trimmed queue (mutates a
  // shallow copy; callers pass arrays they own).
  if (queue.length <= MAX_QUEUE_LENGTH) return queue;
  var overflow = queue.length - MAX_QUEUE_LENGTH;
  try {
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      console.debug('[FSB Telemetry] queue cap exceeded; dropping ' + overflow + ' oldest event(s)');
    }
  } catch (_e) { /* ignore */ }
  return queue.slice(overflow);
}

function _applyStaleDrop(queue) {
  // Events older than 24h are dropped at flush boundary per CONTEXT.
  var nowMs = _now();
  var kept = [];
  for (var i = 0; i < queue.length; i++) {
    var ev = queue[i];
    if (typeof ev.ts_minute === 'number' && (nowMs - ev.ts_minute) <= STALE_DROP_MS) {
      kept.push(ev);
    }
  }
  return kept;
}

function _applyAttemptsCap(queue) {
  // Events whose retry counter has reached the cap are dropped at the next
  // flush boundary -- no infinite retries (BEAT-08).
  var kept = [];
  for (var i = 0; i < queue.length; i++) {
    var ev = queue[i];
    var attempts = (typeof ev.attempts === 'number' && ev.attempts >= 0) ? ev.attempts : 0;
    if (attempts < MAX_ATTEMPTS_PER_EVENT) {
      kept.push(ev);
    }
  }
  return kept;
}

// ---------------------------------------------------------------------------
// Event assembly (the 9-key allowlist gate, in code)
// ---------------------------------------------------------------------------
//
// Build the canonical 9-field event from a (client, model, tokens_in,
// tokens_out) tuple + ambient fields (install_uuid, active_agent_count).
// The literal object expression below is the in-code expression of the
// payload allowlist -- if a future contributor wants to add a field, they
// must update both this literal AND tests/telemetry-payload-allowlist.test.js.
// NEVER use `Object.assign`, spread, or any pattern that could copy
// fsbUsageData row fields silently.
function _buildEvent(input) {
  // Defensive coercion. Every field reaches its allowlisted value or a
  // typed default; no row reference escapes this site.
  var mcpClientLabel = (typeof input.mcp_client === 'string' && input.mcp_client.length > 0)
    ? input.mcp_client
    : 'unknown';
  var modelLabel = (typeof input.model === 'string' && input.model.length > 0)
    ? input.model
    : 'unknown';
  var tokensInSum = (typeof input.tokens_in === 'number' && isFinite(input.tokens_in) && input.tokens_in >= 0)
    ? Math.floor(input.tokens_in)
    : 0;
  var tokensOutSum = (typeof input.tokens_out === 'number' && isFinite(input.tokens_out) && input.tokens_out >= 0)
    ? Math.floor(input.tokens_out)
    : 0;
  var activeAgentCount = _coerceActiveAgentCount(input.active_agent_count);
  var installUuid = (typeof input.install_uuid === 'string' && input.install_uuid.length > 0)
    ? input.install_uuid
    : '';
  var eventType = (input.event_type === 'install_announce') ? 'install_announce' : 'periodic';

  // ALL NINE FIELDS, EXPLICITLY. No spread. No extras. No tool / cost_usd /
  // pricing_confidence / token_source / prompt / href / etc.
  return {
    event_id: _mintEventId(),
    install_uuid: installUuid,
    ts_minute: _floorToMinute(_now()),
    mcp_client: mcpClientLabel,
    model: modelLabel,
    tokens_in: tokensInSum,
    tokens_out: tokensOutSum,
    active_agent_count: activeAgentCount,
    event_type: eventType
  };
}

// ---------------------------------------------------------------------------
// Aggregation step
// ---------------------------------------------------------------------------
//
// Read fsbUsageData rows since the watermark, filter by source==='mcp', group
// by (client, model), sum tokens. The function ONLY reads row.source,
// row.client, row.model, row.tokens_in, row.tokens_out, row.ts -- never
// destructures row.tool, row.cost_usd, row.pricing_confidence, row.token_source
// (those would trip the static-grep gate; they have no business in the beat).
async function _aggregateMcpRowsSinceWatermark(storage) {
  if (!storage) return { groups: [] };
  try {
    var data = await storage.get([USAGE_DATA_KEY, WATERMARK_KEY]);
    var rows = (data && Array.isArray(data[USAGE_DATA_KEY])) ? data[USAGE_DATA_KEY] : [];
    var watermark = (data && typeof data[WATERMARK_KEY] === 'number') ? data[WATERMARK_KEY] : 0;

    // Group accumulator keyed by `${client}|${model || 'unknown'}`.
    var groups = Object.create(null);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || typeof row !== 'object') continue;
      if (row.source !== 'mcp') continue;
      if (typeof row.ts !== 'number' || !isFinite(row.ts)) continue;
      if (row.ts <= watermark) continue;

      // Defensive labels. Bare row.client / row.model only -- never row.tool.
      var mcpClientLabel = (typeof row.client === 'string' && row.client.length > 0) ? row.client : 'unknown';
      var modelLabel = (typeof row.model === 'string' && row.model.length > 0) ? row.model : 'unknown';
      var tIn = (typeof row.tokens_in === 'number' && isFinite(row.tokens_in) && row.tokens_in >= 0) ? row.tokens_in : 0;
      var tOut = (typeof row.tokens_out === 'number' && isFinite(row.tokens_out) && row.tokens_out >= 0) ? row.tokens_out : 0;

      var key = mcpClientLabel + '|' + modelLabel;
      if (!groups[key]) {
        groups[key] = {
          mcp_client: mcpClientLabel,
          model: modelLabel,
          tokens_in: 0,
          tokens_out: 0
        };
      }
      groups[key].tokens_in += tIn;
      groups[key].tokens_out += tOut;
    }

    // Materialize groups in insertion order (deterministic for tests).
    var out = [];
    for (var k in groups) {
      if (Object.prototype.hasOwnProperty.call(groups, k)) out.push(groups[k]);
    }
    return { groups: out };
  } catch (_e) {
    return { groups: [] };
  }
}

async function _advanceWatermark(storage, valueMs) {
  if (!storage) return;
  try {
    var write = {};
    write[WATERMARK_KEY] = valueMs;
    await storage.set(write);
  } catch (_e) { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// enqueue (public)
// ---------------------------------------------------------------------------
/**
 * Append an event to the persisted queue with FIFO cap enforcement.
 *
 * Two calling patterns:
 *  (a) Periodic-aggregation path (internal): _runFlush() builds a fully-formed
 *      9-field event via _buildEvent() and passes it in. enqueue() persists.
 *  (b) install_announce path (external from background.js onInstalled): caller
 *      passes only `{ event_type: 'install_announce' }`. enqueue() resolves
 *      install_uuid via fsbInstallIdentity + reads active_agent_count + fills
 *      in mcp_client='unknown', model='unknown', tokens_in=0, tokens_out=0,
 *      mints event_id, computes ts_minute.
 *
 * Mints event_id at enqueue time (NOT flush) so retries share the same ID for
 * server-side INSERT OR IGNORE dedup (BEAT path / threat T-272-05).
 *
 * @param {object} input - Partial event input.
 * @returns {Promise<void>}
 */
function enqueue(input) {
  return _withLock(async function () {
    try {
      var storage = _resolveStorage();
      if (!storage) return;

      // Resolve install_uuid + active_agent_count for the assembled payload.
      var identity = _resolveIdentity();
      var installUuid = null;
      try {
        if (identity && typeof identity.getOrCreateInstallUuid === 'function') {
          installUuid = await identity.getOrCreateInstallUuid();
        }
      } catch (_e) { /* identity unavailable -> empty install_uuid */ }

      var activeAgentCount = await _readActiveAgentCount(storage);

      // If caller supplied a fully-formed event (periodic path), preserve its
      // ambient fields. Otherwise default to install_announce / unknown.
      var partial = (input && typeof input === 'object') ? input : {};
      var event = _buildEvent({
        install_uuid: installUuid || '',
        mcp_client: partial.mcp_client,
        model: partial.model,
        tokens_in: partial.tokens_in,
        tokens_out: partial.tokens_out,
        active_agent_count: activeAgentCount,
        event_type: partial.event_type
      });

      var queue = await _readQueue(storage);
      queue.push(event);
      queue = _applyFifoCap(queue);
      await _writeQueue(storage, queue);
    } catch (outerErr) {
      try {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('[FSB Telemetry] enqueue failed:', outerErr && outerErr.message ? outerErr.message : outerErr);
        }
      } catch (_e) { /* ignore */ }
    }
  });
}

// ---------------------------------------------------------------------------
// flush (public)
// ---------------------------------------------------------------------------
/**
 * One full beat cycle: re-read opt-out live; if opted-out, clear queue + skip
 * POST. Otherwise: aggregate MCP rows since watermark, enqueue per-group
 * events, POST queue snapshot, clear sent / re-enqueue failed.
 *
 * Concurrency: serialized via _flushLock so two close-in-time alarm fires
 * cannot double-POST the same batch (BEAT-01 SW eviction race; test §10).
 *
 * NEVER throws (defence in depth; threat T-272-04).
 *
 * @returns {Promise<void>}
 */
function flush() {
  return _withLock(_runFlush);
}

async function _runFlush() {
  try {
    var storage = _resolveStorage();
    if (!storage) return;

    var identity = _resolveIdentity();

    // Live opt-out check (BEAT-07): read on every flush, never cached.
    try {
      if (identity && typeof identity.isTelemetryOptedOut === 'function') {
        var optedOut = await identity.isTelemetryOptedOut();
        if (optedOut === true) {
          try {
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug('[FSB Telemetry] opted out; clearing queue and skipping POST');
            }
          } catch (_e) { /* ignore */ }
          // Clear queue. Alarm continues firing harmlessly.
          await _writeQueue(storage, []);
          return;
        }
      }
    } catch (_e) {
      // Opt-out read failure -> treat as ON (proceed). The identity module
      // never throws in production (install-identity.js wraps internals).
    }

    // Resolve install UUID. Null -> hard no-op (storage unavailable /
    // incognito SW). Identity injection point handles this; absent identity
    // means we still attempt with empty install_uuid for the install_announce
    // dry-run, but production never reaches here without identity loaded.
    var installUuid = null;
    try {
      if (identity && typeof identity.getOrCreateInstallUuid === 'function') {
        installUuid = await identity.getOrCreateInstallUuid();
      }
    } catch (_e) { installUuid = null; }
    if (!installUuid) {
      try {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('[FSB Telemetry] no install_uuid; skipping flush');
        }
      } catch (_e) { /* ignore */ }
      return;
    }

    // Step 1: queue maintenance (stale drop + attempts cap) BEFORE aggregating
    // so events that aged out / hit the retry cap during the inter-beat window
    // are removed cleanly before any new aggregation grows the queue.
    var queue = await _readQueue(storage);
    queue = _applyStaleDrop(queue);
    queue = _applyAttemptsCap(queue);

    // Step 2: aggregate MCP rows since watermark + enqueue per-group events.
    var agg = await _aggregateMcpRowsSinceWatermark(storage);
    var activeAgentCount = await _readActiveAgentCount(storage);
    for (var i = 0; i < agg.groups.length; i++) {
      var g = agg.groups[i];
      var ev = _buildEvent({
        install_uuid: installUuid,
        mcp_client: g.mcp_client,
        model: g.model,
        tokens_in: g.tokens_in,
        tokens_out: g.tokens_out,
        active_agent_count: activeAgentCount,
        event_type: 'periodic'
      });
      queue.push(ev);
    }
    // Phase 260524-62w / PRESENCE-01 -- presence heartbeat for idle-but-alive
    // installs. When _aggregateMcpRowsSinceWatermark produced zero groups (no
    // MCP activity in the last 5-min window), the per-group loop above pushed
    // nothing. Without this block the resulting POST is empty and the server
    // never calls active-tracker.recordSeen() for this install, so the
    // install is invisible to /stats' active_users_now (5-min window) and
    // /stats' active_agents_now (10-min window). Enqueue exactly ONE zero-
    // valued 'periodic' event so the server-side recordSeen() loop in
    // showcase/server/src/routes/telemetry.js line 228..232 flips this
    // install into the active-now windows.
    //
    // Quick task 260524-8qv -- Codex PR #78 Finding 2 (P2). The additional
    // `queue.length === 0` clause below is REQUIRED. Without it the heartbeat
    // fires whenever aggregation produced no new groups -- but the queue can
    // already hold unsent retry events from a prior failed POST. At queue cap
    // (200) _applyFifoCap below would then drop the OLDEST real event to make
    // room for a redundant heartbeat (the retried event's POST would itself
    // trigger server-side recordSeen for this install_uuid, so the heartbeat
    // would be telemetry-loss for nothing). The queue length is read AFTER
    // _applyStaleDrop and _applyAttemptsCap (both invoked earlier in
    // _runFlush at lines ~522..523), so we count only events that will
    // actually survive to the wire (a doomed retry that exceeded the 5-
    // attempts cap is already gone).
    //
    // Hard constants (NOT a flexibility/future-config knob -- the server's
    // hard-coded allowlists dictate every value here):
    //   - event_type:'periodic'   -- ALLOWED_EVENT_TYPES in routes/telemetry.js line 53
    //   - mcp_client:'unknown'    -- MCP_CLIENT_ALLOWLIST in routes/telemetry.js line 47..51
    //   - model:null              -- routes/telemetry.js line 87..91 allows null/undefined
    //   - tokens_in/out:0         -- routes/telemetry.js line 92..97 requires Number.isInteger >=0
    //   - active_agent_count:     -- reuse the already-resolved variable from line above
    //                                so we do NOT issue an extra storage.get() round-trip.
    //
    // Idempotency: when agg.groups.length >= 1 we SKIP this block. The
    // aggregated events already carry this install_uuid through the server's
    // recordSeen() loop, so double-beating would only burn per-UUID daily
    // budget. The /stats active-now window stays correct in both cases.
    //
    // Position invariant: this block runs AFTER the BEAT-07 opt-out short-
    // circuit (line ~491) and AFTER the install_uuid resolution check (line
    // ~509 `if (!installUuid) return;`). Both early returns are upstream, so
    // opted-out installs and storage-unavailable installs never emit a
    // heartbeat -- privacy + crash invariants unchanged.
    if (agg.groups.length === 0 && queue.length === 0) {
      var beat = _buildEvent({
        install_uuid: installUuid,
        mcp_client: 'unknown',
        model: null,
        tokens_in: 0,
        tokens_out: 0,
        active_agent_count: activeAgentCount,
        event_type: 'periodic'
      });
      queue.push(beat);
    }
    queue = _applyFifoCap(queue);

    // Advance watermark to Date.now() (NOT max(ts) per CONTEXT decision --
    // handles clock-skew defensively). Done BEFORE writing queue so a queue-
    // write failure does not strand the watermark stale.
    var nowMs = _now();
    await _advanceWatermark(storage, nowMs);
    await _writeQueue(storage, queue);

    // If nothing to send, exit early. Watermark already advanced.
    if (queue.length === 0) return;

    // Step 3: POST. fetch with keepalive:true survives tab close mid-beat.
    var fetchFn = _resolveFetch();
    if (!fetchFn) {
      // No fetch implementation (test harness forgot to inject) -- treat as
      // network failure: increment attempts, re-enqueue. Production always
      // has fetch.
      var bumpedNoFetch = _bumpAttempts(queue);
      bumpedNoFetch = _applyAttemptsCap(bumpedNoFetch);
      bumpedNoFetch = _applyFifoCap(bumpedNoFetch);
      await _writeQueue(storage, bumpedNoFetch);
      return;
    }

    // Snapshot the queue for the POST body. The queue object reference is
    // re-read after the POST so concurrent enqueue() calls (which the lock
    // serializes against) cannot lose events.
    var snapshot = queue.slice();
    var snapshotIds = Object.create(null);
    for (var s = 0; s < snapshot.length; s++) snapshotIds[snapshot[s].event_id] = true;

    // Build the wire payload: an array of events containing EXACTLY the 9
    // ALLOWED_EVENT_KEYS, in the order the server's allowlist Set lists
    // them (showcase/server/src/routes/telemetry.js line 41-44). The
    // explicit field-by-field copy is intentional -- spread (`{...src}`)
    // or `Object.assign({}, src)` would silently leak in-memory queue
    // fields (notably `attempts`, set by _bumpAttempts on retry) and the
    // server's per-event allowlist check returns 400 unknown_field on the
    // first extra key, which causes retried events to burn through the
    // 5-attempt cap and be permanently dropped.
    //
    // Loop index `w` avoids shadowing the surrounding `i`, `s`, `r` in
    // _runFlush. The projection is read-only over `snapshot`: the
    // in-memory queue retains `attempts` (and any future internal
    // bookkeeping) so _bumpAttempts continues to function on POST failure.
    var wireEvents = [];
    for (var w = 0; w < snapshot.length; w++) {
      var src = snapshot[w];
      wireEvents.push({
        event_id:           src.event_id,
        install_uuid:       src.install_uuid,
        ts_minute:          src.ts_minute,
        mcp_client:         src.mcp_client,
        model:              src.model,
        tokens_in:          src.tokens_in,
        tokens_out:         src.tokens_out,
        active_agent_count: src.active_agent_count,
        event_type:         src.event_type
      });
    }

    var ok = false;
    var status = 0;
    try {
      var response = await fetchFn(TELEMETRY_ENDPOINT, {
        keepalive: true,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: wireEvents })
      });
      status = (response && typeof response.status === 'number') ? response.status : 0;
      ok = !!(response && response.ok);
    } catch (_netErr) {
      ok = false;
      status = 0;
    }

    // Re-read queue post-POST. The lock prevents concurrent flushes, but a
    // concurrent enqueue (install_announce timer firing during a periodic
    // POST) would have appended events while we awaited the response. We
    // remove only the events we POSTed.
    var residue = await _readQueue(storage);

    if (ok) {
      // Clear sent events. Residue keeps anything NOT in snapshotIds (i.e.,
      // events enqueued after the snapshot was taken).
      var kept = [];
      for (var r = 0; r < residue.length; r++) {
        if (!snapshotIds[residue[r].event_id]) kept.push(residue[r]);
      }
      kept = _applyFifoCap(kept);
      await _writeQueue(storage, kept);
    } else {
      // POST failed (network error / 5xx / 404 against pre-Phase-273 server).
      // Re-enqueue snapshot events with incremented attempts. Drop events at
      // the cap on the NEXT flush boundary (per CONTEXT decision -- not here,
      // since the boundary semantics match BEAT-08's "drop on next flush").
      var nextQueue = _bumpAttempts(residue, snapshotIds);
      nextQueue = _applyFifoCap(nextQueue);
      await _writeQueue(storage, nextQueue);
      try {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('[FSB Telemetry] POST failed (status=' + status + '); re-enqueued ' + snapshot.length + ' event(s)');
        }
      } catch (_e) { /* ignore */ }
    }
  } catch (outerErr) {
    try {
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('[FSB Telemetry] flush failed:', outerErr && outerErr.message ? outerErr.message : outerErr);
      }
    } catch (_e) { /* ignore */ }
  }
}

function _bumpAttempts(queue, restrictToIds) {
  // For each event whose event_id is in `restrictToIds` (or all events when
  // restrictToIds is omitted), increment `attempts`. The queue reference is
  // mutated in-place AND returned for chaining clarity.
  for (var i = 0; i < queue.length; i++) {
    var ev = queue[i];
    if (restrictToIds && !restrictToIds[ev.event_id]) continue;
    var curr = (typeof ev.attempts === 'number' && ev.attempts >= 0) ? ev.attempts : 0;
    ev.attempts = curr + 1;
  }
  return queue;
}

// ---------------------------------------------------------------------------
// getPendingCount (public)
// ---------------------------------------------------------------------------
/**
 * Read-only helper that returns the current persisted queue length.
 *
 * Used by tests + future Control Panel "View what we send" surface (v0.9.70).
 *
 * @returns {Promise<number>}
 */
async function getPendingCount() {
  try {
    var storage = _resolveStorage();
    if (!storage) return 0;
    var queue = await _readQueue(storage);
    return queue.length;
  } catch (_e) {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

// Service-worker / importScripts surface. Pattern mirrors install-identity.js +
// mcp-metrics-recorder.js.
globalThis.fsbTelemetryCollector = {
  flush: flush,
  enqueue: enqueue,
  getPendingCount: getPendingCount,
  TELEMETRY_ENDPOINT: TELEMETRY_ENDPOINT,
  BEAT_ALARM_NAME: BEAT_ALARM_NAME
};

// Node CommonJS surface for the test harness at tests/telemetry-collector.test.js.
// Adds the three injection points + the constants + internal helpers used by
// section 9 (allowlist runtime assertion).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    flush: flush,
    enqueue: enqueue,
    getPendingCount: getPendingCount,
    TELEMETRY_ENDPOINT: TELEMETRY_ENDPOINT,
    BEAT_ALARM_NAME: BEAT_ALARM_NAME,
    QUEUE_KEY: QUEUE_KEY,
    WATERMARK_KEY: WATERMARK_KEY,
    ACTIVE_AGENTS_KEY: ACTIVE_AGENTS_KEY,
    USAGE_DATA_KEY: USAGE_DATA_KEY,
    MAX_QUEUE_LENGTH: MAX_QUEUE_LENGTH,
    MAX_ATTEMPTS_PER_EVENT: MAX_ATTEMPTS_PER_EVENT,
    STALE_DROP_MS: STALE_DROP_MS,
    ALLOWED_EVENT_KEYS: ALLOWED_EVENT_KEYS,
    _setStorageShim: _setStorageShim,
    _setFetchShim: _setFetchShim,
    _setIdentityShim: _setIdentityShim,
    _buildEvent: _buildEvent
  };
}
