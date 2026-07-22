(function(global) {
  'use strict';

  var API_PROVIDER_IDS = Object.freeze([
    'xai',
    'gemini',
    'openai',
    'anthropic',
    'openrouter',
    'lmstudio',
    'custom'
  ]);
  var AGENT_PROVIDER_IDS = Object.freeze([
    'claude-code',
    'opencode',
    'codex'
  ]);
  var delegationProviders = global.FsbDelegationProviders;
  if (!delegationProviders
      && typeof module !== 'undefined'
      && module.exports
      && typeof require === 'function') {
    delegationProviders = require('../utils/delegation-providers.js');
  }
  if (!delegationProviders
      || typeof delegationProviders.ids !== 'function'
      || typeof delegationProviders.get !== 'function'
      || typeof delegationProviders.isShippedId !== 'function') {
    throw new Error('canonical delegation providers are unavailable');
  }
  var SHIPPED_AGENT_PROVIDER_SET = createProviderSet(delegationProviders.ids());
  var COMPATIBILITY_UNSUPPORTED_REASONS = Object.freeze({
    binary_not_found: true,
    version_missing: true,
    version_malformed: true,
    below_minimum: true,
    wrong_major: true,
    adapter_unshipped: true,
    matrix_invalid: true
  });
  var COMPATIBILITY_SUPPORTED_MODEL = Object.freeze({
    label: 'Supported',
    icon: 'fa-circle-check',
    className: 'compatibility-badge--supported',
    detail: "This CLI is within FSB's fixture-tested compatibility range."
  });
  var COMPATIBILITY_DEGRADED_NEWER_MODEL = Object.freeze({
    label: 'Degraded',
    icon: 'fa-triangle-exclamation',
    className: 'compatibility-badge--degraded',
    detail: "This CLI is newer than FSB's fixture-tested range. You can keep it selected; existing start checks still apply."
  });
  var COMPATIBILITY_DEGRADED_STALE_MODEL = Object.freeze({
    label: 'Degraded',
    icon: 'fa-triangle-exclamation',
    className: 'compatibility-badge--degraded',
    detail: 'Compatibility evidence is stale. Refresh status to check again.'
  });
  var COMPATIBILITY_UNSUPPORTED_MODEL = Object.freeze({
    label: 'Unsupported',
    icon: 'fa-circle-xmark',
    className: 'compatibility-badge--unsupported',
    detail: 'FSB cannot verify compatibility for this CLI. Refresh status or review setup before starting a task.'
  });
  var AGENT_AUTH_NOT_REPORTED = 'Not reported';
  var CLAUDE_AUTH_HELP = 'Claude Code does not report an auth state that FSB can safely read.';
  var GENERIC_AGENT_AUTH_HELP = 'The CLI has not reported its account type.';
  var CODEX_AUTH_DISPLAY_MODELS = Object.freeze({
    chatgpt: Object.freeze({
      label: 'ChatGPT',
      help: 'Codex is signed in with ChatGPT.'
    }),
    api_key: Object.freeze({
      label: 'API key',
      help: 'Codex is signed in with an API key stored by Codex.'
    }),
    unauthenticated: Object.freeze({
      label: 'Not signed in',
      help: 'Sign in to Codex first.'
    }),
    unknown: Object.freeze({
      label: 'Status unavailable',
      help: 'Codex sign-in status is unavailable. Refresh status before starting a task.'
    })
  });
  var CODEX_BILLING_LABELS = Object.freeze({
    chatgpt: 'Included with your ChatGPT plan',
    api_key: 'Billed to the API key stored by Codex; dollar amount not reported.',
    unauthenticated: 'Sign in to Codex first.',
    unknown: 'Billing not reported'
  });

  var API_PROVIDER_SET = createProviderSet(API_PROVIDER_IDS);
  var AGENT_PROVIDER_SET = createProviderSet(AGENT_PROVIDER_IDS);

  var PROVIDER_DEFINITIONS = Object.freeze({
    xai: createProviderDefinition('xai', 'api', 'xAI'),
    gemini: createProviderDefinition('gemini', 'api', 'Google Gemini'),
    openai: createProviderDefinition('openai', 'api', 'OpenAI'),
    anthropic: createProviderDefinition('anthropic', 'api', 'Anthropic'),
    openrouter: createProviderDefinition('openrouter', 'api', 'OpenRouter'),
    lmstudio: createProviderDefinition('lmstudio', 'api', 'LM Studio'),
    custom: createProviderDefinition('custom', 'api', 'Custom'),
    'claude-code': createAgentProviderDefinition(
      'claude-code',
      'Claude Code',
      'Uses the account signed into Claude Code. FSB does not need your Anthropic credential. Usage and charges follow that account\'s Claude plan or API configuration.',
      'Review Claude plans and billing',
      'https://claude.com/pricing'
    ),
    opencode: createAgentProviderDefinition(
      'opencode',
      'OpenCode',
      'Uses the provider configured in OpenCode. FSB does not need that provider credential. Charges may come from OpenCode Zen or the configured provider.',
      'Review OpenCode providers and billing',
      'https://opencode.ai/docs/providers/',
      'Review OpenCode Zen',
      'https://opencode.ai/docs/zen/'
    ),
    codex: createAgentProviderDefinition(
      'codex',
      'Codex',
      'Uses the account signed into Codex. FSB does not need your OpenAI credential. Usage, credits, and charges follow that account\'s current OpenAI plan or API configuration.',
      'Review current Codex billing',
      'https://help.openai.com/en/articles/20001106-codex-rate-card-2'
    )
  });

  function createProviderSet(ids) {
    var set = Object.create(null);
    ids.forEach(function(id) {
      set[id] = true;
    });
    return Object.freeze(set);
  }

  function createProviderDefinition(id, providerKind, displayName) {
    return Object.freeze({
      id: id,
      providerKind: providerKind,
      displayName: displayName
    });
  }

  function createAgentProviderDefinition(
    id,
    displayName,
    billingCopy,
    billingLinkLabel,
    billingUrl,
    secondaryBillingLinkLabel,
    secondaryBillingUrl
  ) {
    var definition = {
      id: id,
      providerKind: 'agent',
      displayName: displayName,
      billingCopy: billingCopy,
      billingLinkLabel: billingLinkLabel,
      billingUrl: billingUrl
    };
    if (secondaryBillingUrl) {
      definition.secondaryBillingLinkLabel = secondaryBillingLinkLabel;
      definition.secondaryBillingUrl = secondaryBillingUrl;
    }
    return Object.freeze(definition);
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function getOwnValue(object, key) {
    if (object === null || (typeof object !== 'object' && typeof object !== 'function')) {
      return undefined;
    }
    try {
      var descriptor = Object.getOwnPropertyDescriptor(object, key);
      return descriptor && hasOwn(descriptor, 'value') ? descriptor.value : undefined;
    } catch (_error) {
      return undefined;
    }
  }

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isPlainDataRecord(value) {
    if (!isRecord(value)) return false;
    try {
      return Object.getPrototypeOf(value) === Object.prototype;
    } catch (_error) {
      return false;
    }
  }

  function isApiProvider(id) {
    return hasOwn(API_PROVIDER_SET, id);
  }

  function isAgentProvider(id) {
    return hasOwn(AGENT_PROVIDER_SET, id);
  }

  function normalizeSettings(settings) {
    var source = isRecord(settings) ? settings : {};
    var savedModelProvider = getOwnValue(source, 'modelProvider');
    var savedAgentProvider = getOwnValue(source, 'agentProviderId');
    var providerKind = getOwnValue(source, 'providerKind');
    var modelProvider = isApiProvider(savedModelProvider) ? savedModelProvider : 'xai';
    var agentProviderId = isAgentProvider(savedAgentProvider) ? savedAgentProvider : '';

    return {
      providerKind: providerKind === 'agent' && agentProviderId ? 'agent' : 'api',
      modelProvider: modelProvider,
      agentProviderId: agentProviderId
    };
  }

  function getClientRow(clients, providerId) {
    return isRecord(clients) ? getOwnValue(clients, providerId) : undefined;
  }

  function isCanonicalSupportedRow(row) {
    return isRecord(row) && getOwnValue(row, 'raw') !== true;
  }

  function hasRecordEvidence(row, evidenceKey) {
    return isCanonicalSupportedRow(row) && isRecord(getOwnValue(row, evidenceKey));
  }

  function getRecommendation(clients) {
    var index;
    var providerId;
    var row;

    for (index = 0; index < AGENT_PROVIDER_IDS.length; index++) {
      providerId = AGENT_PROVIDER_IDS[index];
      row = getClientRow(clients, providerId);
      if (hasRecordEvidence(row, 'live')) {
        return { providerKind: 'agent', providerId: providerId, reason: 'live' };
      }
    }

    for (index = 0; index < AGENT_PROVIDER_IDS.length; index++) {
      providerId = AGENT_PROVIDER_IDS[index];
      row = getClientRow(clients, providerId);
      var installed = isCanonicalSupportedRow(row) ? getOwnValue(row, 'installed') : undefined;
      if (isRecord(installed) && getOwnValue(installed, 'detected') === true) {
        return { providerKind: 'agent', providerId: providerId, reason: 'installed' };
      }
    }

    for (index = 0; index < AGENT_PROVIDER_IDS.length; index++) {
      providerId = AGENT_PROVIDER_IDS[index];
      row = getClientRow(clients, providerId);
      if (hasRecordEvidence(row, 'clicked')) {
        return { providerKind: 'agent', providerId: providerId, reason: 'clicked' };
      }
    }

    return { providerKind: 'api', providerId: 'xai', reason: 'fallback' };
  }

  function getAgentStatus(row) {
    var safeRow = isCanonicalSupportedRow(row) ? row : {};
    var live = isRecord(getOwnValue(safeRow, 'live'));
    var installedEvidence = getOwnValue(safeRow, 'installed');
    var installed = isRecord(installedEvidence)
      && getOwnValue(installedEvidence, 'detected') === true;
    var connected = isRecord(getOwnValue(safeRow, 'connected'));
    var clicked = isRecord(getOwnValue(safeRow, 'clicked'));
    var installedCheckedAt = isRecord(installedEvidence)
      ? getOwnValue(installedEvidence, 'checkedAt')
      : null;
    var checkedAt = typeof installedCheckedAt === 'number'
        && Number.isFinite(installedCheckedAt)
      ? installedCheckedAt
      : null;
    var primaryLabel = 'Not installed';

    if (live) {
      primaryLabel = 'Connected now';
    } else if (installed) {
      primaryLabel = 'Installed';
    } else if (connected) {
      primaryLabel = 'Seen before';
    } else if (clicked) {
      primaryLabel = 'Setup copied';
    }

    return {
      live: live,
      installed: installed,
      seenBefore: connected && !live,
      clicked: clicked,
      primaryLabel: primaryLabel,
      authLabel: AGENT_AUTH_NOT_REPORTED,
      checkedAt: checkedAt
    };
  }

  function createCompatibilityDisplayModel(model, checkedText) {
    return {
      label: model.label,
      icon: model.icon,
      className: model.className,
      detail: model.detail,
      checkedText: checkedText
    };
  }

  function formatCompatibilityCheckedText(checkedAt, formatAbsoluteDateTime) {
    if (!Number.isSafeInteger(checkedAt) || checkedAt < 0
        || typeof formatAbsoluteDateTime !== 'function') return null;
    try {
      var formatted = formatAbsoluteDateTime(checkedAt);
      if (typeof formatted !== 'string' || !formatted.trim()) return null;
      return 'Checked ' + formatted.trim();
    } catch (_error) {
      return null;
    }
  }

  function getCompatibilityDisplayModel(providerId, row, formatAbsoluteDateTime) {
    if (!isAgentProvider(providerId)) return null;
    var fallback = createCompatibilityDisplayModel(COMPATIBILITY_UNSUPPORTED_MODEL, null);
    if (!isPlainDataRecord(row)) return fallback;
    var compatibility = getOwnValue(row, 'compatibility');
    if (!isPlainDataRecord(compatibility)) return fallback;

    var status = getOwnValue(compatibility, 'status');
    var reason = getOwnValue(compatibility, 'reason');
    var checkedAt = getOwnValue(compatibility, 'checkedAt');
    var hasCheckedAt = Number.isSafeInteger(checkedAt) && checkedAt >= 0;
    var checkedText = formatCompatibilityCheckedText(checkedAt, formatAbsoluteDateTime);

    if (!hasOwn(SHIPPED_AGENT_PROVIDER_SET, providerId)) {
      return createCompatibilityDisplayModel(
        COMPATIBILITY_UNSUPPORTED_MODEL,
        hasCheckedAt ? checkedText : null
      );
    }
    if (reason === 'evidence_stale'
        && (status === 'supported' || status === 'degraded')
        && hasCheckedAt) {
      return createCompatibilityDisplayModel(COMPATIBILITY_DEGRADED_STALE_MODEL, checkedText);
    }
    if (status === 'supported' && reason === 'within_tested_range' && hasCheckedAt) {
      return createCompatibilityDisplayModel(COMPATIBILITY_SUPPORTED_MODEL, checkedText);
    }
    if (status === 'degraded' && reason === 'newer_than_tested_range' && hasCheckedAt) {
      return createCompatibilityDisplayModel(COMPATIBILITY_DEGRADED_NEWER_MODEL, checkedText);
    }
    if (status === 'unsupported'
        && typeof reason === 'string'
        && hasOwn(COMPATIBILITY_UNSUPPORTED_REASONS, reason)) {
      return createCompatibilityDisplayModel(
        COMPATIBILITY_UNSUPPORTED_MODEL,
        hasCheckedAt ? checkedText : null
      );
    }
    return fallback;
  }

  function getSafeAgentAuthState(providerId, row) {
    if (providerId !== 'codex'
        || !isPlainDataRecord(row)
        || getOwnValue(row, 'raw') === true) return 'unknown';
    var authState = getOwnValue(row, 'authState');
    return typeof authState === 'string'
        && hasOwn(CODEX_AUTH_DISPLAY_MODELS, authState)
      ? authState
      : 'unknown';
  }

  function copyDisplayModel(model) {
    return { label: model.label, help: model.help };
  }

  function getAgentAuthDisplay(providerId, row) {
    if (!isAgentProvider(providerId)) return null;
    if (providerId === 'codex') {
      return copyDisplayModel(CODEX_AUTH_DISPLAY_MODELS[getSafeAgentAuthState(providerId, row)]);
    }
    return {
      label: AGENT_AUTH_NOT_REPORTED,
      help: providerId === 'claude-code' ? CLAUDE_AUTH_HELP : GENERIC_AGENT_AUTH_HELP
    };
  }

  function getBillingLabel(providerId, row) {
    if (isAgentProvider(providerId)) {
      if (providerId === 'codex') {
        var authState = getSafeAgentAuthState(providerId, row);
        return {
          label: CODEX_BILLING_LABELS[authState],
          confirmed: authState === 'chatgpt' || authState === 'api_key'
        };
      }
      return { label: 'Billing not reported', confirmed: false };
    }
    var mode = typeof providerId === 'string'
      ? providerId
      : getOwnValue(providerId, 'mode');
    mode = typeof mode === 'string' ? mode.trim().toLowerCase() : '';

    if (mode === 'subscription') {
      return { label: 'Included in your subscription', confirmed: true };
    }
    if (mode === 'api' || mode === 'credits' || mode === 'zen' || mode === 'provider') {
      return { label: 'Billed by your CLI provider', confirmed: true };
    }
    return { label: 'Billing not reported', confirmed: false };
  }

  function getProviderDefinition(providerKind, providerId) {
    if (providerId === undefined) {
      providerId = providerKind;
      providerKind = null;
    }
    if (!isApiProvider(providerId) && !isAgentProvider(providerId)) return null;
    var definition = getOwnValue(PROVIDER_DEFINITIONS, providerId);
    if (!definition || (providerKind && definition.providerKind !== providerKind)) return null;
    return definition;
  }

  var api = Object.freeze({
    API_PROVIDER_IDS: API_PROVIDER_IDS,
    AGENT_PROVIDER_IDS: AGENT_PROVIDER_IDS,
    PROVIDER_DEFINITIONS: PROVIDER_DEFINITIONS,
    isApiProvider: isApiProvider,
    isAgentProvider: isAgentProvider,
    normalizeSettings: normalizeSettings,
    getRecommendation: getRecommendation,
    getAgentStatus: getAgentStatus,
    getCompatibilityDisplayModel: getCompatibilityDisplayModel,
    getAgentAuthDisplay: getAgentAuthDisplay,
    getBillingLabel: getBillingLabel,
    getProviderDefinition: getProviderDefinition
  });

  global.FSBProvidersPanel = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined'
  ? globalThis
  : (typeof self !== 'undefined' ? self : this));
