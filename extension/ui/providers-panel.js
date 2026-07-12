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
      authLabel: 'Not reported',
      checkedAt: checkedAt
    };
  }

  function getBillingLabel(authState) {
    var mode = typeof authState === 'string'
      ? authState
      : getOwnValue(authState, 'mode');
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
