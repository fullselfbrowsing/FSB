(function(root) {
  'use strict';

  var POST_SETTLE_GRACE_MS = 1000;
  var nextTokenId = 1;
  var recordsByToken = new Map();
  var tokensByOpener = new Map();

  function isValidAgentId(value) {
    return typeof value === 'string' && value.length > 0;
  }

  function isValidTabId(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function clock(value) {
    return Number.isFinite(value) ? value : Date.now();
  }

  function removeRecord(record) {
    if (!record) return;
    recordsByToken.delete(record.token);
    var tokens = tokensByOpener.get(record.openerTabId);
    if (!tokens) return;
    tokens.delete(record.token);
    if (tokens.size === 0) tokensByOpener.delete(record.openerTabId);
  }

  function purgeExpired(now) {
    var current = clock(now);
    recordsByToken.forEach(function(record) {
      if (record.active !== true && record.expiresAt <= current) removeRecord(record);
    });
  }

  function begin(input, now) {
    purgeExpired(now);
    if (!input || typeof input !== 'object'
        || !isValidAgentId(input.agentId)
        || !isValidTabId(input.openerTabId)) return null;
    var startedAt = clock(now);
    var token = 'spawn_' + String(nextTokenId++);
    var record = {
      token: token,
      agentId: input.agentId,
      openerTabId: input.openerTabId,
      startedAt: startedAt,
      active: true,
      expiresAt: Number.POSITIVE_INFINITY
    };
    recordsByToken.set(token, record);
    var tokens = tokensByOpener.get(input.openerTabId);
    if (!tokens) {
      tokens = new Set();
      tokensByOpener.set(input.openerTabId, tokens);
    }
    tokens.add(token);
    return token;
  }

  function end(token, now) {
    var record = recordsByToken.get(token);
    if (!record) return false;
    record.active = false;
    record.expiresAt = clock(now) + POST_SETTLE_GRACE_MS;
    return true;
  }

  function match(openerTabId, now) {
    purgeExpired(now);
    if (!isValidTabId(openerTabId)) return null;
    var tokens = tokensByOpener.get(openerTabId);
    if (!tokens || tokens.size === 0) return null;
    var selected = null;
    tokens.forEach(function(token) {
      var record = recordsByToken.get(token);
      if (!record) return;
      if (!selected || record.startedAt >= selected.startedAt) selected = record;
    });
    return selected ? {
      agentId: selected.agentId,
      openerTabId: selected.openerTabId,
      token: selected.token
    } : null;
  }

  async function run(input, execute) {
    if (typeof execute !== 'function') throw new TypeError('execute must be a function');
    var token = begin(input);
    try {
      return await execute();
    } finally {
      if (token) end(token);
    }
  }

  function clear() {
    recordsByToken.clear();
    tokensByOpener.clear();
    nextTokenId = 1;
  }

  var api = {
    POST_SETTLE_GRACE_MS: POST_SETTLE_GRACE_MS,
    begin: begin,
    end: end,
    match: match,
    run: run,
    purgeExpired: purgeExpired,
    clear: clear
  };

  root.FsbAgentTabSpawnProvenance = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
