'use strict';

/**
 * Lattice-backed session replay metadata and persistence helpers.
 *
 * The browser-specific live executor remains in background.js. This module
 * owns the stable FSB replay manifest, legacy import, host requests, and the
 * storage mutation that attaches a Lattice receipt to a persisted session.
 */
(function (globalScope) {
  var REPLAY_SCHEMA_VERSION = 'fsb-lattice-replay/v1';
  var REPLAY_MANIFEST_KIND = 'fsb-browser-replay-manifest';
  var REDACTED_VALUE = '[REDACTED]';
  var HOST_REQUEST_TIMEOUT_MS = 15000;
  var SENSITIVE_MANIFEST_KEY_PATTERN = /pass(word)?|secret|token|credential|api[-_ ]?key|authorization|cookie|session[-_ ]?id|private[-_ ]?key/i;
  var SENSITIVE_MANIFEST_TEXT_KEY_PATTERN = /^(text|value|typed|actualValue|expectedValue|finalTextContent|previousValue)$/i;
  var SENSITIVE_MANIFEST_TARGET_KEY_PATTERN = /selector|field|name|input|target|autocomplete|type|label|placeholder|element/i;
  var SENSITIVE_MANIFEST_TARGET_PATTERN = /pass(word)?|secret|token|credential|api[-_ ]?key|authorization|auth[-_ ]?code|one[-_ ]?time|otp|cvv|cvc|(?:^|[^a-z0-9])cc[-_ ]?(?:number|csc|cvc|cvv)(?:$|[^a-z0-9])|card[-_ ]?(number|no)|security[-_ ]?code|(?:^|[^a-z])pin(?:$|[^a-z])/i;
  var SENSITIVE_URL_PARAM_PATTERN = /^(?:code|auth|key|signature|sig|sign|hash|hmac|jwt|policy|session|sid|awsaccesskeyid|key-pair-id|googleaccessid|x-amz-|x-goog-)/i;

  var READ_TOOLS = new Set([
    'wait_for_element', 'waitForElement', 'wait_for_stable', 'waitForDOMStable',
    'read_page', 'mcp:read-page', 'readPage', 'get_text', 'getText',
    'get_attribute', 'getAttribute', 'get_dom_snapshot', 'mcp:get-dom',
    'get_page_snapshot', 'mcp:get-page-snapshot', 'list_tabs', 'mcp:get-tabs',
    'get_site_guide', 'mcp:get-site-guides', 'search_memory', 'mcp:search-memory',
    'read_sheet', 'readsheet', 'search_capabilities', 'mcp:capabilities-search',
    'get_trigger_status', 'mcp:get-trigger-status', 'list_triggers', 'mcp:list-triggers',
    'mcp:list-sessions', 'mcp:get-session', 'mcp:get-session-replay', 'mcp:get-logs', 'mcp:get-memory',
    'mcp:get-diagnostics'
  ]);
  var NAVIGATION_TOOLS = new Set([
    'navigate', 'search', 'siteSearch', 'go_back', 'goBack', 'go_forward',
    'goForward', 'refresh', 'open_tab', 'switch_tab', 'mcp:go-back'
  ]);
  var INSPECT_ONLY_TOOLS = new Set([
    'report_progress', 'complete_task', 'partial_task', 'fail_task',
    'start_visual_session', 'mcp:start-visual-session', 'end_visual_session',
    'mcp:end-visual-session', 'run_task', 'mcp:start-automation',
    'mcp:stop-automation', 'mcp:task-status', 'mcp:replay-session'
  ]);
  var PER_STEP_TOOLS = new Set([
    'execute_js', 'upload_file', 'drop_file', 'dropfile', 'trigger',
    'close_tab', 'stop_trigger', 'mcp:trigger', 'mcp:stop-trigger'
  ]);
  var LEGACY_WRITE_TOOLS = new Set([
    'click', 'rightClick', 'right_click', 'doubleClick', 'double_click',
    'type', 'type_text', 'clearInput', 'clear_input', 'pressEnter',
    'press_enter', 'keyPress', 'press_key', 'selectOption', 'select_option',
    'toggleCheckbox', 'toggle_checkbox', 'scroll', 'scroll_to_top',
    'scroll_to_bottom', 'hover', 'focus', 'moveMouse', 'move_mouse',
    'drag', 'drag_drop', 'drag_variable_speed', 'click_at',
    'click_and_hold', 'double_click_at', 'scroll_at', 'insert_text',
    'fill_form', 'fill_credential', 'fill_payment_method'
  ]);

  function cloneJson(value, fallback) {
    try {
      if (value === undefined) return fallback;
      return JSON.parse(JSON.stringify(value));
    } catch (_e) {
      return fallback;
    }
  }

  function safeOrigin(url) {
    if (typeof url !== 'string' || !url) return null;
    try {
      var parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
        ? parsed.origin
        : null;
    } catch (_e) {
      return null;
    }
  }

  function isReplayableUrl(url) {
    return safeOrigin(url) !== null;
  }

  function containsRedacted(value) {
    if (value === REDACTED_VALUE) return true;
    if (Array.isArray(value)) return value.some(containsRedacted);
    if (!value || typeof value !== 'object') return false;
    return Object.keys(value).some(function (key) {
      return containsRedacted(value[key]);
    });
  }

  function targetLooksSensitive(value, depth) {
    if (!value || typeof value !== 'object' || depth > 6) return false;
    if (Array.isArray(value)) return value.some(function (item) { return targetLooksSensitive(item, depth + 1); });
    return Object.keys(value).some(function (key) {
      var child = value[key];
      if (SENSITIVE_MANIFEST_KEY_PATTERN.test(key)) return true;
      if (SENSITIVE_MANIFEST_TARGET_KEY_PATTERN.test(key) && typeof child === 'string' &&
          SENSITIVE_MANIFEST_TARGET_PATTERN.test(child)) return true;
      return child && typeof child === 'object' && targetLooksSensitive(child, depth + 1);
    });
  }

  function sanitizeFallbackUrl(url) {
    if (typeof url !== 'string' || !url) return REDACTED_VALUE;
    try {
      var parsed = new URL(url);
      var changed = false;
      if (parsed.username || parsed.password) {
        parsed.username = '';
        parsed.password = '';
        changed = true;
      }
      var keys = [];
      parsed.searchParams.forEach(function (value, key) {
        if (SENSITIVE_MANIFEST_KEY_PATTERN.test(key) || SENSITIVE_URL_PARAM_PATTERN.test(key) ||
            /^(?:eyJ|gh[opsur]_|xox[bcpars]-|AKIA|ASIA|ya29\.|u!)/.test(value)) keys.push(key);
      });
      keys.forEach(function (key) {
        parsed.searchParams.delete(key);
        changed = true;
      });
      if (SENSITIVE_MANIFEST_KEY_PATTERN.test(parsed.hash) ||
          /(?:eyJ|gh[opsur]_|xox[bcpars]-|AKIA|ASIA|ya29\.|u!)/.test(parsed.hash)) {
        parsed.hash = '';
        changed = true;
      }
      return changed ? parsed.toString() : url;
    } catch (_error) {
      return REDACTED_VALUE;
    }
  }

  function sanitizeFallbackValue(value, result) {
    var clone = cloneJson(value, {});
    var sensitiveTarget = targetLooksSensitive(clone, 0) || targetLooksSensitive(result, 0);
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      Object.keys(node).forEach(function (key) {
        if (SENSITIVE_MANIFEST_KEY_PATTERN.test(key) ||
            (sensitiveTarget && SENSITIVE_MANIFEST_TEXT_KEY_PATTERN.test(key))) {
          node[key] = REDACTED_VALUE;
        } else if (/^(?:url|uri|href)$/i.test(key) && typeof node[key] === 'string') {
          node[key] = sanitizeFallbackUrl(node[key]);
        } else if (/^(?:error|message|summary|reason|blocker|nextStep|description|detail)$/i.test(key) &&
            typeof node[key] === 'string') {
          node[key] = sanitizeManifestText(node[key], 5000);
        } else {
          walk(node[key]);
        }
      });
    }
    walk(clone);
    return clone && typeof clone === 'object' && !Array.isArray(clone) ? clone : {};
  }

  function sanitizeManifestArguments(argumentsValue, result) {
    var recorder = globalScope.fsbMcpSessionRecorder;
    if (recorder && typeof recorder.cloneParamsForReplay === 'function') {
      return recorder.cloneParamsForReplay(argumentsValue || {}, result || {});
    }
    return sanitizeFallbackValue(argumentsValue || {}, result || {});
  }

  function sanitizeManifestResult(result, argumentsValue) {
    var recorder = globalScope.fsbMcpSessionRecorder;
    if (recorder && typeof recorder.cloneResultForReplay === 'function') {
      return recorder.cloneResultForReplay(result || {}, argumentsValue || {});
    }
    return sanitizeFallbackValue(result || {}, argumentsValue || {});
  }

  function sanitizeManifestText(value, maxLength) {
    if (typeof value !== 'string') return '';
    var recorder = globalScope.fsbMcpSessionRecorder;
    if (recorder && typeof recorder.sanitizeSummaryTextForPersistence === 'function') {
      return recorder.sanitizeSummaryTextForPersistence(value, maxLength || 2000);
    }
    return value.trim()
      .replace(/\b(password|passwd|secret|access[_ -]?token|refresh[_ -]?token|api[_ -]?key|authorization|credential|private[_ -]?key)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
        function (_match, label) { return label + ': ' + REDACTED_VALUE; })
      .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer ' + REDACTED_VALUE)
      .slice(0, maxLength || 2000);
  }

  function differsAtSourcePaths(source, sanitized) {
    if (source === sanitized) return false;
    if (source === null || sanitized === null || typeof source !== typeof sanitized) return true;
    if (Array.isArray(source)) {
      if (!Array.isArray(sanitized) || source.length !== sanitized.length) return true;
      return source.some(function (item, index) { return differsAtSourcePaths(item, sanitized[index]); });
    }
    if (source && typeof source === 'object') {
      if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) return true;
      return Object.keys(source).some(function (key) {
        return !Object.prototype.hasOwnProperty.call(sanitized, key) ||
          differsAtSourcePaths(source[key], sanitized[key]);
      });
    }
    return source !== sanitized;
  }

  function sanitizeManifestUrl(url) {
    if (typeof url !== 'string' || !url) return { url: null, redacted: false };
    var sanitized = sanitizeManifestArguments({ url: url }, {}).url;
    return {
      url: typeof sanitized === 'string' && sanitized !== REDACTED_VALUE ? sanitized : null,
      redacted: sanitized !== url
    };
  }

  function normalizedTool(entry) {
    return String((entry && entry.tool) || '');
  }

  function normalizedLogicalTab(context) {
    var value = context && typeof context.logicalTab === 'string'
      ? context.logicalTab.trim()
      : '';
    return /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : 'primary';
  }

  function capabilityMetadata(entry) {
    if (entry && entry.capability && typeof entry.capability === 'object' &&
        typeof entry.capability.slug === 'string' && entry.capability.slug) {
      return {
        slug: entry.capability.slug,
        sideEffectClass: typeof entry.capability.sideEffectClass === 'string' && entry.capability.sideEffectClass
          ? entry.capability.sideEffectClass
          : 'write',
        service: typeof entry.capability.service === 'string' ? entry.capability.service : null,
        tier: typeof entry.capability.tier === 'string' ? entry.capability.tier : null
      };
    }
    var context = entry && entry.replayContext && typeof entry.replayContext === 'object'
      ? entry.replayContext
      : {};
    var payload = entry && entry.requestPayload && typeof entry.requestPayload === 'object'
      ? entry.requestPayload
      : {};
    var slug = typeof context.slug === 'string' && context.slug
      ? context.slug
      : (typeof payload.slug === 'string' ? payload.slug : null);
    if (!slug) return null;
    return {
      slug: slug,
      sideEffectClass: typeof context.sideEffectClass === 'string' && context.sideEffectClass
        ? context.sideEffectClass
        : 'write',
      service: typeof context.service === 'string' ? context.service : null,
      tier: typeof context.tier === 'string' ? context.tier : null
    };
  }

  function classifyReplayEntry(entry) {
    var tool = normalizedTool(entry);
    var capability = capabilityMetadata(entry);
    var args = entry && entry.arguments && typeof entry.arguments === 'object'
      ? entry.arguments
      : {};

    if (entry && (entry.inputState === 'redacted' || entry.target?.redacted === true) || containsRedacted(args)) {
      return { risk: 'inspect-only', availability: 'needs-input', reason: 'Sensitive input was redacted' };
    }
    if (entry && entry.success === false) {
      return { risk: 'inspect-only', availability: 'unsupported', reason: 'Recorded call did not succeed' };
    }
    if (entry && entry.result && (
      entry.result.errorCode === 'mcp_route_unavailable' ||
      entry.result.code === 'mcp_route_unavailable'
    )) {
      return { risk: 'inspect-only', availability: 'unsupported', reason: 'Recorded route was unsupported' };
    }
    if (INSPECT_ONLY_TOOLS.has(tool)) {
      return { risk: 'inspect-only', availability: 'unsupported', reason: 'Lifecycle-only call' };
    }
    if (capability) {
      var sideEffectClass = capability.sideEffectClass.toLowerCase();
      if (sideEffectClass === 'read' || sideEffectClass === 'read-only' || sideEffectClass === 'readonly') {
        return { risk: 'read', availability: 'ready', reason: null };
      }
      if (sideEffectClass === 'destructive' || sideEffectClass === 'delete' || sideEffectClass === 'irreversible') {
        return { risk: 'destructive', availability: 'approval-per-step', reason: 'Destructive capability' };
      }
      return { risk: 'write', availability: 'approval-once', reason: 'Capability may change remote state' };
    }
    if (READ_TOOLS.has(tool)) {
      return { risk: 'read', availability: 'ready', reason: null };
    }
    if (NAVIGATION_TOOLS.has(tool)) {
      return { risk: 'navigation', availability: 'ready', reason: null };
    }
    if (PER_STEP_TOOLS.has(tool)) {
      return {
        risk: tool === 'execute_js' ? 'arbitrary-code' : 'destructive',
        availability: 'approval-per-step',
        reason: tool === 'execute_js' ? 'Recorded arbitrary JavaScript' : 'High-impact browser operation'
      };
    }
    if (!tool) {
      return { risk: 'inspect-only', availability: 'unsupported', reason: 'Missing tool name' };
    }
    var knownTool = LEGACY_WRITE_TOOLS.has(tool);
    try {
      knownTool = knownTool || (typeof globalScope.getToolByName === 'function' && !!globalScope.getToolByName(tool));
    } catch (_e) { /* an unavailable registry leaves the step inspect-only */ }
    return knownTool
      ? { risk: 'write', availability: 'approval-once', reason: 'Browser interaction may repeat a side effect' }
      : { risk: 'inspect-only', availability: 'unsupported', reason: 'No supported browser replay route' };
  }

  function invocationArguments(entry) {
    var payload = entry && entry.requestPayload && typeof entry.requestPayload === 'object'
      ? cloneJson(entry.requestPayload, {})
      : {};
    var tool = normalizedTool(entry);
    if (tool === 'mcp:capabilities-invoke' || tool === 'invoke_capability') {
      return {
        slug: typeof payload.slug === 'string' ? payload.slug : null,
        params: payload.params && typeof payload.params === 'object' ? payload.params : {},
        ...(typeof payload.origin === 'string' ? { origin: payload.origin } : {})
      };
    }
    if (payload.params && typeof payload.params === 'object') return payload.params;
    if (tool.indexOf('mcp:') === 0) {
      var messageArgs = cloneJson(payload, {});
      [
        'agentId', 'agent_id', 'ownershipToken', 'ownership_token',
        'connectionId', 'connection_id', 'visualSession', 'client'
      ].forEach(function (key) { delete messageArgs[key]; });
      return messageArgs;
    }
    return entry && entry.params && typeof entry.params === 'object'
      ? cloneJson(entry.params, {})
      : {};
  }

  function normalizeReplayEntry(entry, index) {
    var context = entry && entry.replayContext && typeof entry.replayContext === 'object'
      ? cloneJson(entry.replayContext, {})
      : {};
    var rawArguments = invocationArguments(entry);
    var rawResult = entry && (entry.response !== undefined ? entry.response : entry.result);
    var safeArguments = sanitizeManifestArguments(rawArguments, rawResult);
    var safeResult = sanitizeManifestResult(rawResult, rawArguments);
    var rawTargetUrl = typeof context.targetUrl === 'string' ? context.targetUrl : null;
    var safeTarget = sanitizeManifestUrl(rawTargetUrl);
    var inputRedacted = entry?.redactedInputs === true ||
      differsAtSourcePaths(cloneJson(rawArguments, {}), safeArguments) || containsRedacted(safeArguments);
    var normalized = {
      id: 'step-' + String(index + 1),
      index: index,
      timestamp: Number.isFinite(entry && entry.timestamp) ? entry.timestamp : null,
      tool: normalizedTool(entry),
      route: typeof context.routeFamily === 'string' && context.routeFamily
        ? context.routeFamily
        : (typeof (entry && entry.dispatcher_route) === 'string' ? entry.dispatcher_route : 'legacy'),
      arguments: safeArguments,
      result: safeResult,
      success: entry && entry.success !== undefined
        ? entry.success !== false
        : !(entry && entry.result && entry.result.success === false),
      target: {
        logicalTab: normalizedLogicalTab(context),
        url: safeTarget.url,
        origin: typeof context.targetOrigin === 'string'
          ? safeOrigin(context.targetOrigin)
          : safeOrigin(safeTarget.url),
        redacted: entry?.targetRedacted === true || safeTarget.redacted
      }
    };
    if (inputRedacted) normalized.inputState = 'redacted';
    var capability = capabilityMetadata(Object.assign({}, entry, {
      arguments: normalized.arguments,
      replayContext: context
    }));
    if (capability) normalized.capability = capability;
    normalized.replay = classifyReplayEntry(normalized);
    return normalized;
  }

  function replayCounts(steps) {
    var counts = {
      total: steps.length,
      executable: 0,
      approvalRequired: 0,
      blocked: 0
    };
    steps.forEach(function (step) {
      var availability = step && step.replay && step.replay.availability;
      if (availability === 'ready') counts.executable++;
      else if (availability === 'approval-once' || availability === 'approval-per-step') {
        counts.executable++;
        counts.approvalRequired++;
      } else {
        counts.blocked++;
      }
    });
    return counts;
  }

  function deriveStartUrl(session, steps) {
    var candidates = [];
    if (session && typeof session.startUrl === 'string') candidates.push(session.startUrl);
    for (var i = 0; i < steps.length; i++) {
      var step = steps[i];
      if (step && (step.tool === 'navigate' || step.tool === 'open_tab') &&
          step.arguments && typeof step.arguments.url === 'string') {
        candidates.push(step.arguments.url);
      }
      if (step && step.target && typeof step.target.url === 'string') candidates.push(step.target.url);
    }
    if (session && typeof session.lastUrl === 'string') candidates.push(session.lastUrl);
    return candidates.find(isReplayableUrl) || null;
  }

  function deriveReplayTabs(session, steps, fallbackStartUrl) {
    var order = [];
    (steps || []).forEach(function (step) {
      var logicalTab = step?.target?.logicalTab || 'primary';
      if (order.indexOf(logicalTab) === -1) order.push(logicalTab);
    });
    if (order.length === 0) order.push('primary');
    if (order.indexOf('primary') !== -1 && order[0] !== 'primary') {
      order.splice(order.indexOf('primary'), 1);
      order.unshift('primary');
    }
    return order.map(function (logicalTab, index) {
      var candidates = [];
      if (logicalTab === 'primary' && session && typeof session.startUrl === 'string') {
        candidates.push(session.startUrl);
      }
      (steps || []).forEach(function (step) {
        if ((step?.target?.logicalTab || 'primary') !== logicalTab) return;
        if ((step.tool === 'navigate' || step.tool === 'open_tab') &&
            step.arguments && typeof step.arguments.url === 'string') {
          candidates.push(step.arguments.url);
        }
        if (typeof step?.target?.url === 'string') candidates.push(step.target.url);
      });
      // A global fallback may have been derived from another logical tab. Only
      // use it for a single-tab legacy capture; cross-tab borrowing would map
      // the first owned replay tab to the wrong recorded page.
      if (logicalTab === 'primary' && order.length === 1 && typeof fallbackStartUrl === 'string') {
        candidates.push(fallbackStartUrl);
      }
      var rawStartUrl = candidates.find(isReplayableUrl) || null;
      var safeStart = sanitizeManifestUrl(rawStartUrl);
      var redacted = safeStart.redacted || (steps || []).some(function (step) {
        return (step?.target?.logicalTab || 'primary') === logicalTab &&
          step?.target?.url === safeStart.url && step?.target?.redacted === true;
      });
      return {
        id: logicalTab,
        order: index,
        startUrl: safeStart.url,
        startOrigin: safeOrigin(safeStart.url),
        startUrlState: redacted ? 'redacted' : (isReplayableUrl(safeStart.url) ? 'ready' : 'missing')
      };
    });
  }

  function createReplayRecord(session, entries, provenance) {
    var replayProvenance = provenance === 'legacy-import' ? 'legacy-import' : 'capture';
    var sourceEntries = Array.isArray(entries) ? entries.slice(-100) : [];
    var steps = sourceEntries.map(normalizeReplayEntry);
    var derivedStartUrl = deriveStartUrl(session || {}, steps);
    var safeStart = sanitizeManifestUrl(derivedStartUrl);
    var tabs = deriveReplayTabs(session || {}, steps, safeStart.url);
    var primaryTab = tabs.find(function (tab) { return tab.id === 'primary'; }) || tabs[0];
    // If a primary track exists, its missing/redacted URL must remain missing.
    // A later track may still be replayable, but background bootstrap selection
    // is responsible for opening that track under its own logical tab id.
    var startUrl = primaryTab ? primaryTab.startUrl : (tabs[0]?.startUrl || safeStart.url);
    var startUrlRedacted = session?.startUrlRedacted === true || primaryTab?.startUrlState === 'redacted' ||
      steps.some(function (step) { return step?.target?.url === startUrl && step?.target?.redacted === true; });
    var startUrlMissing = !isReplayableUrl(startUrl);
    steps.forEach(function (step) {
      var logicalTab = step?.target?.logicalTab || 'primary';
      var tab = tabs.find(function (candidate) { return candidate.id === logicalTab; });
      var tabRedacted = tab?.startUrlState === 'redacted';
      var tabMissing = !tab || tab.startUrlState === 'missing';
      if (tabRedacted || tabMissing) {
        var availability = step?.replay?.availability;
        if (availability === 'ready' || availability === 'approval-once' || availability === 'approval-per-step') {
          step.inputState = 'redacted';
          step.replay = {
            risk: 'inspect-only',
            availability: 'needs-input',
            reason: tabRedacted
              ? 'This tab\'s recorded starting URL contained sensitive input that was redacted'
              : 'This tab does not contain a safe HTTP(S) starting URL'
          };
        }
      }
    });
    var manifest = {
      kind: REPLAY_MANIFEST_KIND,
      version: 1,
      provenance: replayProvenance,
      sessionId: String((session && (session.sessionId || session.id)) || ''),
      task: typeof (session && session.task) === 'string'
        ? sanitizeManifestText(session.task, 2000)
        : 'MCP agent session',
      recordedAt: Number.isFinite(session && session.endTime) ? session.endTime : Date.now(),
      source: {
        mode: (session && session.mode) || 'mcp-agent',
        client: (session && (session.client || session.mcpClient)) || null
      },
      startUrl: startUrl,
      startOrigin: safeOrigin(startUrl),
      startUrlState: startUrlRedacted ? 'redacted' : (startUrlMissing ? 'missing' : 'ready'),
      tabs: tabs,
      outcome: {
        status: (session && session.status) || 'unknown',
        outcome: (session && session.outcome) || null,
        reason: session && session.outcomeDetails && typeof session.outcomeDetails.reason === 'string'
          ? sanitizeManifestText(session.outcomeDetails.reason, 1000)
          : null
      },
      steps: steps
    };
    return {
      version: REPLAY_SCHEMA_VERSION,
      integrity: 'pending',
      provenance: replayProvenance,
      manifest: manifest,
      manifestHash: null,
      receipt: null,
      receiptCid: null,
      signerKid: null,
      counts: replayCounts(steps),
      error: null
    };
  }

  function createLegacyReplayRecord(session) {
    var history = Array.isArray(session && session.actionHistory) ? session.actionHistory : [];
    var entries = history.map(function (action) {
      return {
        tool: action && action.tool,
        params: action && action.params,
        result: action && action.result,
        success: !(action && action.result && action.result.success === false),
        timestamp: action && action.timestamp,
        dispatcher_route: 'legacy'
      };
    });
    return createReplayRecord(session || {}, entries, 'legacy-import');
  }

  function withTimeout(promise, timeoutMs, message) {
    var timer;
    return Promise.race([
      promise,
      new Promise(function (_resolve, reject) {
        timer = setTimeout(function () { reject(new Error(message)); }, timeoutMs);
      })
    ]).finally(function () { clearTimeout(timer); });
  }

  async function requestHost(type, payload) {
    if (globalScope.ensureLatticeOffscreen) {
      await Promise.resolve(globalScope.ensureLatticeOffscreen());
    }
    if (!globalScope.chrome || !globalScope.chrome.runtime ||
        typeof globalScope.chrome.runtime.sendMessage !== 'function') {
      throw new Error('Lattice offscreen host unavailable');
    }
    var response = await withTimeout(
      Promise.resolve(globalScope.chrome.runtime.sendMessage({ type: type, payload: payload })),
      HOST_REQUEST_TIMEOUT_MS,
      'Lattice replay host timed out'
    );
    if (!response || response.ok !== true) {
      throw new Error(response && response.error && response.error.message
        ? response.error.message
        : 'Lattice replay host rejected the request');
    }
    return response;
  }

  async function mutateStoredSession(sessionId, mutator) {
    var run = async function () {
      var stored = await globalScope.chrome.storage.local.get(['fsbSessionLogs', 'fsbSessionIndex']);
      var logs = stored.fsbSessionLogs || {};
      var index = Array.isArray(stored.fsbSessionIndex) ? stored.fsbSessionIndex : [];
      var session = logs[sessionId];
      if (!session) return null;
      var nextReplay = await mutator(session.replay || null, session);
      if (!nextReplay) return session;
      session.replay = nextReplay;
      var counts = nextReplay.counts || replayCounts(nextReplay.manifest && nextReplay.manifest.steps || []);
      index = index.map(function (entry) {
        if (!entry || entry.id !== sessionId) return entry;
        return Object.assign({}, entry, {
          replayIntegrity: nextReplay.integrity,
          replayProvenance: nextReplay.provenance,
          replayableCount: counts.executable,
          replayBlockedCount: counts.blocked
        });
      });
      await globalScope.chrome.storage.local.set({ fsbSessionLogs: logs, fsbSessionIndex: index });
      return session;
    };
    var logger = globalScope.automationLogger;
    if (logger && typeof logger.withSessionMutationLock === 'function') {
      return logger.withSessionMutationLock(run);
    }
    return run();
  }

  async function sealReplayRecord(sessionId, replayRecord) {
    var response = await requestHost('lattice-replay-seal', {
      manifest: replayRecord.manifest,
      provenance: replayRecord.provenance
    });
    var sealed = Object.assign({}, replayRecord, {
      integrity: 'verified',
      manifest: response.manifest || replayRecord.manifest,
      manifestHash: response.manifestHash,
      receipt: response.receipt,
      receiptCid: response.receiptCid || null,
      signerKid: response.signerKid,
      counts: replayCounts((response.manifest || replayRecord.manifest).steps || []),
      error: null
    });
    if (sessionId) {
      await mutateStoredSession(sessionId, function () { return sealed; });
    }
    return sealed;
  }

  async function sealPersistedSession(sessionId) {
    var stored = await globalScope.chrome.storage.local.get(['fsbSessionLogs']);
    var session = (stored.fsbSessionLogs || {})[sessionId];
    if (!session) return null;
    var replayRecord = session.replay && session.replay.version === REPLAY_SCHEMA_VERSION
      ? session.replay
      : createLegacyReplayRecord(session);
    if (replayRecord.integrity === 'verified' && replayRecord.receipt && replayRecord.manifestHash) {
      return session;
    }
    try {
      await sealReplayRecord(sessionId, replayRecord);
    } catch (error) {
      await mutateStoredSession(sessionId, function () {
        return Object.assign({}, replayRecord, {
          integrity: 'failed',
          error: error && error.message ? error.message : String(error)
        });
      });
    }
    var refreshed = await globalScope.chrome.storage.local.get(['fsbSessionLogs']);
    return (refreshed.fsbSessionLogs || {})[sessionId] || null;
  }

  function validateReplayClassifications(steps) {
    (steps || []).forEach(function (step) {
      var expected = classifyReplayEntry(step);
      if (!step.replay || step.replay.risk !== expected.risk ||
          step.replay.availability !== expected.availability) {
        throw new Error('Replay step classification failed closed at ' + String(step.id || step.index || 'unknown'));
      }
    });
  }

  async function prepareReplay(sessionId) {
    var stored = await globalScope.chrome.storage.local.get(['fsbSessionLogs']);
    var session = (stored.fsbSessionLogs || {})[sessionId];
    if (!session) throw new Error('Session not found');
    var replayRecord = session.replay && session.replay.version === REPLAY_SCHEMA_VERSION
      ? session.replay
      : createLegacyReplayRecord(session);
    if (replayRecord.integrity !== 'verified' || !replayRecord.receipt || !replayRecord.manifestHash) {
      replayRecord = await sealReplayRecord(sessionId, replayRecord);
    }
    if (replayRecord.manifest?.provenance !== replayRecord.provenance) {
      throw new Error('Replay provenance does not match the signed manifest');
    }
    var materialized = await requestHost('lattice-replay-materialize', {
      manifest: replayRecord.manifest,
      manifestHash: replayRecord.manifestHash,
      receipt: replayRecord.receipt,
      signerKid: replayRecord.signerKid
    });
    validateReplayClassifications(replayRecord.manifest.steps);
    return {
      sessionId: sessionId,
      replay: replayRecord,
      verified: materialized.verified === true,
      offline: materialized.offline,
      receiptCid: replayRecord.receiptCid || materialized.receiptCid || null,
      startUrl: replayRecord.manifest.startUrl,
      tabs: Array.isArray(replayRecord.manifest.tabs) ? replayRecord.manifest.tabs : [],
      steps: replayRecord.manifest.steps,
      counts: replayRecord.counts
    };
  }

  async function authorizeReplayStep(step, approvedScopes) {
    var response = await requestHost('lattice-replay-authorize', {
      step: step,
      approvedScopes: Array.isArray(approvedScopes) ? approvedScopes : []
    });
    return response.verdict;
  }

  async function checkpointReplayStep(input) {
    return requestHost('lattice-replay-checkpoint', input || {});
  }

  async function persistReplayRun(sessionId, run) {
    return mutateStoredSession(sessionId, function (existing, session) {
      var replayRecord = existing && existing.version === REPLAY_SCHEMA_VERSION
        ? existing
        : createLegacyReplayRecord(session);
      return Object.assign({}, replayRecord, {
        lastRun: cloneJson(run, null)
      });
    });
  }

  async function resumePendingSeals() {
    if (!globalScope.chrome || !globalScope.chrome.storage || !globalScope.chrome.storage.local) return;
    var stored = await globalScope.chrome.storage.local.get(['fsbSessionLogs']);
    var sessions = stored.fsbSessionLogs || {};
    var ids = Object.keys(sessions).filter(function (id) {
      var replay = sessions[id] && sessions[id].replay;
      return replay && replay.version === REPLAY_SCHEMA_VERSION && replay.integrity === 'pending';
    });
    for (var i = 0; i < ids.length; i++) {
      await sealPersistedSession(ids[i]).catch(function () { /* retry next wake */ });
    }
  }

  var api = {
    REPLAY_SCHEMA_VERSION: REPLAY_SCHEMA_VERSION,
    REPLAY_MANIFEST_KIND: REPLAY_MANIFEST_KIND,
    createReplayRecord: createReplayRecord,
    createLegacyReplayRecord: createLegacyReplayRecord,
    classifyReplayEntry: classifyReplayEntry,
    validateReplayClassifications: validateReplayClassifications,
    replayCounts: replayCounts,
    isReplayableUrl: isReplayableUrl,
    prepareReplay: prepareReplay,
    authorizeReplayStep: authorizeReplayStep,
    checkpointReplayStep: checkpointReplayStep,
    persistReplayRun: persistReplayRun,
    sealReplayRecord: sealReplayRecord,
    sealPersistedSession: sealPersistedSession,
    resumePendingSeals: resumePendingSeals,
    _requestHost: requestHost
  };

  globalScope.FsbLatticeReplay = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
