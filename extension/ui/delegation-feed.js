(function(global) {
  'use strict';

  var delegationProviders = global.FsbDelegationProviders;
  if (!delegationProviders
      && typeof module !== 'undefined'
      && module.exports
      && typeof require === 'function') {
    delegationProviders = require('../utils/delegation-providers.js');
  }

  var SNAPSHOT_VERSION = 1;
  var ENTRY_VERSION = 1;
  var NOT_REPORTED = 'Not reported';
  var BILLING_NOT_REPORTED = 'Billing not reported';
  var SERVER_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
  var VALID_STATES = Object.freeze({
    idle: true,
    preflighting: true,
    awaiting_consent: true,
    starting: true,
    running: true,
    holding: true,
    held: true,
    resuming: true,
    stopping: true,
    completed: true,
    failed: true,
    stopped: true,
    restart_lost: true
  });
  var VALID_CONNECTIONS = Object.freeze({
    connected: true,
    disconnected: true,
    offline: true,
    unpaired: true,
    unsupported: true
  });
  var VALID_KINDS = Object.freeze({
    init: true,
    'tool-call': true,
    retry: true,
    result: true,
    state: true
  });
  var VALID_TOOL_STATUSES = Object.freeze({
    running: true,
    succeeded: true,
    failed: true,
    unknown: true
  });
  var VALID_RETRY_CLASSES = Object.freeze({
    api_retry: true,
    transport_retry: true,
    tool_retry: true,
    unknown: true
  });
  var VALID_BILLING_KINDS = Object.freeze({
    subscription: true,
    api: true,
    unknown: true
  });
  var VALID_TERMINAL_CODES = Object.freeze({
    completed: true,
    stopped: true,
    cancelled: true,
    start_rejected: true,
    wall_clock_timeout: true,
    event_silence_timeout: true,
    delegation_persistence_failed: true,
    delegation_quota_exceeded: true,
    delegation_ledger_corrupt: true,
    route_lost: true,
    agent_offline: true,
    agent_unpaired: true,
    unsupported_provider: true,
    hold_expired: true,
    resume_ownership_lost: true,
    daemon_restart_lost_run: true,
    agent_protocol_drift: true,
    tree_unsettled: true,
    agent_failed: true,
    unknown_failure: true
  });

  function _isRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function _hasExactKeys(value, keys) {
    if (!_isRecord(value)) return false;
    var actual;
    try { actual = Object.keys(value).sort(); }
    catch (_error) { return false; }
    var expected = keys.slice().sort();
    if (actual.length !== expected.length) return false;
    for (var index = 0; index < expected.length; index++) {
      if (actual[index] !== expected[index]) return false;
    }
    return true;
  }

  function _ownDataValue(value, key) {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      return undefined;
    }
    try {
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
        ? descriptor.value
        : undefined;
    } catch (_error) {
      return undefined;
    }
  }

  function _canonicalIdentity(value) {
    if (!_hasExactKeys(value, ['id', 'label'])) return null;
    try {
      if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    } catch (_error) {
      return null;
    }
    var providerId = _ownDataValue(value, 'id');
    var providerLabel = _ownDataValue(value, 'label');
    var get = _ownDataValue(delegationProviders, 'get');
    if (typeof providerId !== 'string'
        || typeof providerLabel !== 'string'
        || typeof get !== 'function') return null;
    var metadata = null;
    try { metadata = get.call(delegationProviders, providerId); }
    catch (_error) { return null; }
    var canonicalId = _ownDataValue(metadata, 'id');
    var canonicalLabel = _ownDataValue(metadata, 'label');
    var billingKind = _ownDataValue(metadata, 'billingKind');
    if (canonicalId !== providerId
        || canonicalLabel !== providerLabel
        || (billingKind !== 'subscription' && billingKind !== 'unknown')) return null;
    return { id: canonicalId, label: canonicalLabel, billingKind: billingKind };
  }

  function _isNullableString(value, max) {
    return value === null || (typeof value === 'string' && Array.from(value).length <= max);
  }

  function _isNullableInteger(value) {
    return value === null || (Number.isSafeInteger(value) && value >= 0);
  }

  function _isNullableNumber(value) {
    return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
  }

  function _validClient(value) {
    return value === null || _canonicalIdentity(value) !== null;
  }

  function _validInit(value) {
    if (!_hasExactKeys(value, ['allowedTools', 'client', 'model', 'profileVersion', 'sessionId'])
        || !_validClient(value.client)
        || !_isNullableString(value.model, 128)
        || !_isNullableString(value.profileVersion, 128)
        || !_isNullableString(value.sessionId, 128)
        || !Array.isArray(value.allowedTools)
        || value.allowedTools.length > 16) return false;
    var seen = Object.create(null);
    for (var index = 0; index < value.allowedTools.length; index++) {
      var tool = value.allowedTools[index];
      if (typeof tool !== 'string' || !tool || Array.from(tool).length > 96 || seen[tool]) return false;
      seen[tool] = true;
    }
    return true;
  }

  function _validTool(value) {
    return _hasExactKeys(value, ['argsSummary', 'callId', 'durationMs', 'name', 'status', 'tabId'])
      && _isNullableString(value.callId, 128)
      && typeof value.name === 'string'
      && value.name.length > 0
      && Array.from(value.name).length <= 128
      && _isNullableString(value.argsSummary, 256)
      && VALID_TOOL_STATUSES[value.status] === true
      && _isNullableInteger(value.tabId)
      && _isNullableInteger(value.durationMs);
  }

  function _validRetry(value) {
    return _hasExactKeys(value, ['attempt', 'class', 'delayMs', 'maxAttempts'])
      && VALID_RETRY_CLASSES[value.class] === true
      && _isNullableInteger(value.attempt)
      && _isNullableInteger(value.maxAttempts)
      && _isNullableInteger(value.delayMs);
  }

  function _validToolCalls(value) {
    if (!Array.isArray(value) || value.length > 128) return false;
    var seen = Object.create(null);
    for (var index = 0; index < value.length; index++) {
      var row = value[index];
      if (!_hasExactKeys(row, ['count', 'name'])
          || typeof row.name !== 'string'
          || !row.name
          || Array.from(row.name).length > 128
          || !Number.isSafeInteger(row.count)
          || row.count < 0
          || seen[row.name]) return false;
      seen[row.name] = true;
    }
    return true;
  }

  function _validMetrics(value) {
    return _hasExactKeys(value, [
      'billingKind', 'durationMs', 'inputTokens', 'outputTokens', 'toolCalls',
      'totalTokens', 'turns', 'usd'
    ])
      && VALID_BILLING_KINDS[value.billingKind] === true
      && _isNullableInteger(value.inputTokens)
      && _isNullableInteger(value.outputTokens)
      && _isNullableInteger(value.totalTokens)
      && _isNullableInteger(value.turns)
      && _isNullableInteger(value.durationMs)
      && _isNullableNumber(value.usd)
      && (value.billingKind === 'api' || value.usd === null)
      && _validToolCalls(value.toolCalls);
  }

  function validateEntry(entry, delegationId, sequence) {
    if (!_hasExactKeys(entry, [
      'delegationId', 'detail', 'init', 'kind', 'metrics', 'retry', 'sequence',
      'state', 'timestamp', 'title', 'tool', 'v'
    ])
        || entry.v !== ENTRY_VERSION
        || typeof entry.delegationId !== 'string'
        || !SERVER_ID_PATTERN.test(entry.delegationId)
        || (delegationId !== undefined && entry.delegationId !== delegationId)
        || !Number.isSafeInteger(entry.sequence)
        || entry.sequence < 1
        || (sequence !== undefined && entry.sequence !== sequence)
        || !Number.isSafeInteger(entry.timestamp)
        || entry.timestamp < 0
        || VALID_KINDS[entry.kind] !== true
        || VALID_STATES[entry.state] !== true
        || typeof entry.title !== 'string'
        || Array.from(entry.title).length > 256
        || !_isNullableString(entry.detail, 256)) return false;

    var initExpected = entry.kind === 'init';
    var toolExpected = entry.kind === 'tool-call';
    var retryExpected = entry.kind === 'retry';
    var metricsExpected = entry.kind === 'result';
    if ((entry.init !== null) !== initExpected
        || (entry.tool !== null) !== toolExpected
        || (entry.retry !== null) !== retryExpected
        || (entry.metrics !== null) !== metricsExpected) return false;
    if (initExpected && !_validInit(entry.init)) return false;
    if (toolExpected && !_validTool(entry.tool)) return false;
    if (retryExpected && !_validRetry(entry.retry)) return false;
    if (metricsExpected && !_validMetrics(entry.metrics)) return false;
    return true;
  }

  function _validSummary(value) {
    return value === null || (_hasExactKeys(value, [
      'billingKind', 'durationMs', 'inputTokens', 'outputTokens', 'state',
      'toolCalls', 'totalTokens', 'turns', 'usd'
    ])
      && _validMetrics({
        inputTokens: value.inputTokens,
        outputTokens: value.outputTokens,
        totalTokens: value.totalTokens,
        turns: value.turns,
        durationMs: value.durationMs,
        billingKind: value.billingKind,
        usd: value.usd,
        toolCalls: value.toolCalls
      })
      && (value.state === 'running'
        || value.state === 'completed'
        || value.state === 'failed'
        || value.state === 'stopped'
        || value.state === 'restart_lost'));
  }

  function _validActiveTab(value) {
    return value === null || (_hasExactKeys(value, ['canTakeControl', 'owned', 'tabId'])
      && Number.isSafeInteger(value.tabId)
      && value.tabId >= 0
      && typeof value.owned === 'boolean'
      && typeof value.canTakeControl === 'boolean');
  }

  function _validHold(value) {
    if (value === null) return true;
    if (!_hasExactKeys(value, ['expiresAt', 'tabIds'])
        || !Number.isSafeInteger(value.expiresAt)
        || value.expiresAt < 0
        || !Array.isArray(value.tabIds)
        || value.tabIds.length === 0) return false;
    var seen = Object.create(null);
    for (var index = 0; index < value.tabIds.length; index++) {
      var tabId = value.tabIds[index];
      if (!Number.isSafeInteger(tabId) || tabId < 0 || seen[tabId]) return false;
      seen[tabId] = true;
    }
    return true;
  }

  function _validTerminal(value) {
    return value === null || (_hasExactKeys(value, ['code', 'releasedTabCount'])
      && VALID_TERMINAL_CODES[value.code] === true
      && Number.isSafeInteger(value.releasedTabCount)
      && value.releasedTabCount >= 0);
  }

  function validateSnapshot(snapshot) {
    if (!_hasExactKeys(snapshot, [
      'activeTab', 'connection', 'delegationId', 'entries', 'hold', 'hydrated',
      'provider', 'state', 'summary', 'terminal', 'v'
    ])
        || snapshot.v !== SNAPSHOT_VERSION
        || typeof snapshot.delegationId !== 'string'
        || !SERVER_ID_PATTERN.test(snapshot.delegationId)
        || VALID_STATES[snapshot.state] !== true
        || VALID_CONNECTIONS[snapshot.connection] !== true
        || typeof snapshot.hydrated !== 'boolean'
        || !_validClient(snapshot.provider)
        || !Array.isArray(snapshot.entries)
        || snapshot.entries.length > 2000
        || !_validSummary(snapshot.summary)
        || !_validActiveTab(snapshot.activeTab)
        || !_validHold(snapshot.hold)
        || !_validTerminal(snapshot.terminal)) return false;
    for (var index = 0; index < snapshot.entries.length; index++) {
      var entry = snapshot.entries[index];
      if (!validateEntry(entry, snapshot.delegationId, index + 1)) return false;
      if (snapshot.provider !== null
          && entry.init
          && entry.init.client !== null
          && (_ownDataValue(snapshot.provider, 'id') !== _ownDataValue(entry.init.client, 'id')
            || _ownDataValue(snapshot.provider, 'label') !== _ownDataValue(entry.init.client, 'label'))) {
        return false;
      }
    }
    return true;
  }

  function _document() {
    if (!global.document || typeof global.document.createElement !== 'function') {
      throw new Error('delegation feed requires a document');
    }
    return global.document;
  }

  function _element(tag, className, textValue) {
    var node = _document().createElement(tag);
    if (className) node.className = className;
    if (textValue !== undefined && textValue !== null) node.textContent = String(textValue);
    return node;
  }

  function _appendText(parent, value) {
    parent.appendChild(_document().createTextNode(String(value)));
  }

  function _value(value) {
    return value === null || value === undefined ? NOT_REPORTED : String(value);
  }

  function _duration(value) {
    return value === null ? NOT_REPORTED : String(value) + ' ms';
  }

  function _definition(list, label, value, valueClass) {
    var term = _element('dt', 'delegation-definition-label', label);
    var detail = _element('dd', 'delegation-definition-value' + (valueClass ? ' ' + valueClass : ''));
    _appendText(detail, _value(value));
    list.appendChild(term);
    list.appendChild(detail);
  }

  function _toneForState(state) {
    if (state === 'completed') return 'success';
    if (state === 'failed' || state === 'restart_lost') return 'danger';
    if (state === 'held' || state === 'resuming') return 'warning';
    if (state === 'stopped') return 'neutral';
    return 'info';
  }

  function _toneForEntry(entry) {
    if (entry.kind === 'retry') return 'warning';
    if (entry.kind === 'result') return _toneForState(entry.state);
    if (entry.kind === 'tool-call' && entry.tool.status === 'failed') return 'danger';
    if (entry.kind === 'state') return _toneForState(entry.state);
    if (entry.kind === 'init') return 'info';
    return 'neutral';
  }

  function _semanticIcon(tone) {
    var iconClass = tone === 'success' ? 'fa-circle-check'
      : (tone === 'warning' ? 'fa-triangle-exclamation'
        : (tone === 'danger' ? 'fa-circle-exclamation' : 'fa-circle-info'));
    var icon = _element('i', 'fa ' + iconClass + ' delegation-semantic-icon');
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }

  function _applyTone(node, state, tone) {
    node.className += ' delegation-tone-' + tone;
    node.setAttribute('data-delegation-state', state);
    node.setAttribute('data-delegation-tone', tone);
  }

  function _entryHeading(article, text, tone) {
    var heading = _element('h3', 'delegation-entry-heading delegation-semantic-heading');
    heading.appendChild(_semanticIcon(tone));
    heading.appendChild(_element('span', 'delegation-heading-copy', text));
    article.appendChild(heading);
  }

  function renderEntry(entry, options) {
    if (!validateEntry(entry)) return null;
    options = options || {};
    if (entry.kind === 'result' && options.authoritativeCompleted !== true) return null;
    var article = _element('article', 'delegation-entry delegation-entry-' + entry.kind);
    var presentationState = entry.kind === 'result' ? 'completed' : entry.state;
    var tone = entry.kind === 'result' ? _toneForState(presentationState) : _toneForEntry(entry);
    article.setAttribute('data-delegation-sequence', String(entry.sequence));
    article.setAttribute('data-delegation-kind', entry.kind);
    _applyTone(article, presentationState, tone);

    if (entry.kind === 'init') {
      _entryHeading(article, 'Agent initialized', tone);
      var initList = _element('dl', 'delegation-definition-list');
      _definition(initList, 'Client', entry.init.client ? entry.init.client.label : null);
      _definition(initList, 'Profile', entry.init.profileVersion);
      _definition(initList, 'Model', entry.init.model);
      _definition(initList, 'Session', entry.init.sessionId, 'delegation-machine-value');
      _definition(initList, 'Allowed tools', entry.init.allowedTools.length
        ? entry.init.allowedTools.join(', ')
        : null);
      article.appendChild(initList);
    } else if (entry.kind === 'tool-call') {
      _entryHeading(article, 'Tool call', tone);
      var toolDetails = _element('details', 'delegation-tool-call-details');
      var toolSummary = _element('summary', 'delegation-tool-call-summary');
      toolSummary.appendChild(_semanticIcon(tone));
      toolSummary.appendChild(_element(
        'span',
        'delegation-tool-call-summary-copy',
        entry.tool.name + ' — ' + entry.tool.status
      ));
      toolDetails.appendChild(toolSummary);
      var toolList = _element('dl', 'delegation-definition-list');
      _definition(toolList, 'Name', entry.tool.name);
      _definition(toolList, 'Call id', entry.tool.callId, 'delegation-machine-value');
      _definition(toolList, 'Arguments', entry.tool.argsSummary);
      _definition(toolList, 'Reported tab', entry.tool.tabId);
      _definition(toolList, 'Status', entry.tool.status);
      _definition(toolList, 'Duration', _duration(entry.tool.durationMs));
      toolDetails.appendChild(toolList);
      article.appendChild(toolDetails);
    } else if (entry.kind === 'retry') {
      _entryHeading(article, 'Retrying', tone);
      var retryList = _element('dl', 'delegation-definition-list');
      _definition(retryList, 'Class', entry.retry.class);
      _definition(retryList, 'Attempt', entry.retry.attempt);
      _definition(retryList, 'Maximum attempts', entry.retry.maxAttempts);
      _definition(retryList, 'Delay', _duration(entry.retry.delayMs));
      article.appendChild(retryList);
    } else if (entry.kind === 'result') {
      _entryHeading(article, 'Result', tone);
      var resultList = _element('dl', 'delegation-definition-list delegation-result-grid');
      _definition(resultList, 'Outcome', presentationState);
      _definition(resultList, 'Input tokens', entry.metrics.inputTokens);
      _definition(resultList, 'Output tokens', entry.metrics.outputTokens);
      _definition(resultList, 'Total tokens', entry.metrics.totalTokens);
      _definition(resultList, 'Turns', entry.metrics.turns);
      _definition(resultList, 'Duration', _duration(entry.metrics.durationMs));
      article.appendChild(resultList);
    } else {
      _entryHeading(article, entry.title || 'Agent activity', tone);
      if (entry.detail !== null) article.appendChild(_element('p', 'delegation-entry-detail', entry.detail));
      article.appendChild(_element('p', 'delegation-entry-state', 'State: ' + entry.state));
    }
    return article;
  }

  function _billingText(summary) {
    if (summary.billingKind === 'subscription') return 'Included in your subscription';
    if (summary.billingKind === 'api' && summary.usd !== null) {
      return '$' + Number(summary.usd).toFixed(4) + ' USD';
    }
    return BILLING_NOT_REPORTED;
  }

  function renderSummary(summary) {
    if (!_validSummary(summary) || summary === null) return null;
    var tone = _toneForState(summary.state);
    var article = _element('article', 'delegation-summary');
    _applyTone(article, summary.state, tone);
    _entryHeading(article, 'Run summary', tone);
    var list = _element('dl', 'delegation-summary-metrics delegation-result-grid');
    _definition(list, 'Input tokens', summary.inputTokens);
    _definition(list, 'Output tokens', summary.outputTokens);
    _definition(list, 'Total tokens', summary.totalTokens);
    _definition(list, 'Turns', summary.turns);
    _definition(list, 'Duration', _duration(summary.durationMs));
    _definition(list, 'State', summary.state);
    _definition(list, 'Billing', _billingText(summary));
    article.appendChild(list);

    var details = _element('details', 'delegation-tool-breakdown');
    var disclosure = _element('summary', 'delegation-tool-breakdown-toggle', 'Show tool-call breakdown');
    details.appendChild(disclosure);
    var rows = _element('dl', 'delegation-tool-breakdown-list');
    if (summary.toolCalls.length === 0) {
      _definition(rows, 'Tools', null);
    } else {
      summary.toolCalls.forEach(function(row) {
        _definition(rows, row.name, row.count);
      });
    }
    details.appendChild(rows);
    details.addEventListener('toggle', function() {
      disclosure.textContent = details.open
        ? 'Hide tool-call breakdown'
        : 'Show tool-call breakdown';
    });
    article.appendChild(details);
    return article;
  }

  function _clear(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
  }

  function _hasAuthoritativeCompletedTerminal(snapshot) {
    if (snapshot.state !== 'completed'
        || !snapshot.terminal
        || snapshot.terminal.code !== 'completed'
        || !snapshot.summary
        || snapshot.summary.state !== 'completed') return false;
    for (var index = 0; index < snapshot.entries.length; index++) {
      if (snapshot.entries[index].kind === 'result') return true;
    }
    return false;
  }

  function render(container, snapshot, options) {
    options = options || {};
    if (!container || typeof container.appendChild !== 'function' || !validateSnapshot(snapshot)) {
      return { ok: false, lastSequence: null, hydrated: options.hydrated === true };
    }
    _clear(container);
    var authoritativeCompleted = _hasAuthoritativeCompletedTerminal(snapshot);
    for (var index = 0; index < snapshot.entries.length; index++) {
      if (snapshot.entries[index].kind === 'result' && !authoritativeCompleted) continue;
      var row = renderEntry(snapshot.entries[index], {
        authoritativeCompleted: authoritativeCompleted
      });
      if (!row) return { ok: false, lastSequence: null, hydrated: options.hydrated === true };
      container.appendChild(row);
    }
    if (snapshot.summary && authoritativeCompleted) {
      var summary = renderSummary(snapshot.summary);
      if (!summary) return { ok: false, lastSequence: null, hydrated: options.hydrated === true };
      container.appendChild(summary);
    }
    return {
      ok: true,
      lastSequence: snapshot.entries.length
        ? snapshot.entries[snapshot.entries.length - 1].sequence
        : null,
      hydrated: options.hydrated === true
    };
  }

  var api = Object.freeze({
    NOT_REPORTED: NOT_REPORTED,
    validateEntry: validateEntry,
    validateSnapshot: validateSnapshot,
    render: render,
    renderEntry: renderEntry,
    renderSummary: renderSummary
  });

  global.FsbDelegationFeed = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
