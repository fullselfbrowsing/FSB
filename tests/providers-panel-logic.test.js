'use strict';

/**
 * Phase 58 Plan 01 -- pure provider settings and recommendation contracts.
 *
 * Run: node tests/providers-panel-logic.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const delegationProvidersPath = path.join(
  repoRoot,
  'extension',
  'utils',
  'delegation-providers.js'
);
const helperPath = path.join(repoRoot, 'extension', 'ui', 'providers-panel.js');
const optionsPath = path.join(repoRoot, 'extension', 'ui', 'options.js');
const controlPanelPath = path.join(repoRoot, 'extension', 'ui', 'control_panel.html');
const packagePath = path.join(repoRoot, 'package.json');
const delegationProvidersSource = fs.readFileSync(delegationProvidersPath, 'utf8');
const helperSource = fs.readFileSync(helperPath, 'utf8');
const optionsSource = fs.readFileSync(optionsPath, 'utf8');
const controlPanelSource = fs.readFileSync(controlPanelPath, 'utf8');
const packageSource = fs.readFileSync(packagePath, 'utf8');

delete globalThis.FsbDelegationProviders;
delete globalThis.FSBProvidersPanel;
delete require.cache[require.resolve(delegationProvidersPath)];
delete require.cache[require.resolve(helperPath)];
const delegationProviders = require(delegationProvidersPath);
const providers = require(helperPath);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`missing function signature: ${signature}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unbalanced function: ${signature}`);
}

function assertRecommendation(clients, expected, message) {
  const snapshot = clone(clients);
  const result = providers.getRecommendation(clients);
  assert.deepEqual(result, expected, message);
  assert.deepEqual(clone(clients), snapshot, `${message}: input is unchanged`);
  assert.deepEqual(Object.keys(result), ['providerKind', 'providerId', 'reason'],
    `${message}: result has the closed shape`);
  return result;
}

async function main() {
  assert.equal(fs.existsSync(helperPath), true, 'provider helper exists');
  assert.deepEqual(Object.keys(providers), [
    'API_PROVIDER_IDS',
    'AGENT_PROVIDER_IDS',
    'PROVIDER_DEFINITIONS',
    'isApiProvider',
    'isAgentProvider',
    'normalizeSettings',
    'getRecommendation',
    'getAgentStatus',
    'getCompatibilityDisplayModel',
    'getAgentAuthDisplay',
    'getBillingLabel',
    'getProviderDefinition'
  ], 'helper exports only the twelve declared interface members');
  assert.equal(globalThis.FSBProvidersPanel, providers,
    'CommonJS and classic-script consumers receive the same namespace');
  assert.equal(Object.isFrozen(providers), true, 'exported namespace is frozen');

  const classicContext = { Object, Array, Number };
  classicContext.globalThis = classicContext;
  vm.runInNewContext(delegationProvidersSource, classicContext, {
    filename: 'delegation-providers.js'
  });
  vm.runInNewContext(helperSource, classicContext, { filename: 'providers-panel.js' });
  assert.equal(Object.isFrozen(classicContext.FSBProvidersPanel), true,
    'classic-script execution assigns one frozen global namespace');
  assert.deepEqual(Array.from(classicContext.FSBProvidersPanel.API_PROVIDER_IDS), [
    'xai', 'gemini', 'openai', 'anthropic', 'openrouter', 'lmstudio', 'custom'
  ], 'classic-script export retains the API allowlist');

  assert.deepEqual(providers.API_PROVIDER_IDS, [
    'xai', 'gemini', 'openai', 'anthropic', 'openrouter', 'lmstudio', 'custom'
  ], 'API ids remain the existing seven BYOK values in order');
  assert.deepEqual(providers.AGENT_PROVIDER_IDS, [
    'claude-code', 'opencode', 'codex'
  ], 'agent ids retain the fixed recommendation tie order');
  assert.equal(Object.isFrozen(providers.API_PROVIDER_IDS), true, 'API ids are frozen');
  assert.equal(Object.isFrozen(providers.AGENT_PROVIDER_IDS), true, 'agent ids are frozen');

  const definitionIds = [...providers.API_PROVIDER_IDS, ...providers.AGENT_PROVIDER_IDS];
  assert.deepEqual(Object.keys(providers.PROVIDER_DEFINITIONS), definitionIds,
    'definitions contain exactly the ten closed provider ids in display order');
  assert.equal(Object.isFrozen(providers.PROVIDER_DEFINITIONS), true,
    'provider definition map is frozen');
  const expectedNames = {
    xai: 'xAI',
    gemini: 'Google Gemini',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    openrouter: 'OpenRouter',
    lmstudio: 'LM Studio',
    custom: 'Custom',
    'claude-code': 'Claude Code',
    opencode: 'OpenCode',
    codex: 'Codex'
  };
  for (const id of definitionIds) {
    const definition = providers.PROVIDER_DEFINITIONS[id];
    assert.equal(Object.isFrozen(definition), true, `${id} definition is frozen`);
    assert.equal(definition.id, id, `${id} definition retains its closed id`);
    assert.equal(definition.providerKind,
      providers.API_PROVIDER_IDS.includes(id) ? 'api' : 'agent',
      `${id} definition has the correct kind`);
    assert.equal(definition.displayName, expectedNames[id], `${id} has its display name`);
    assert.equal(providers.getProviderDefinition(id), definition,
      `${id} resolves through the one-argument lookup`);
    assert.equal(providers.getProviderDefinition(definition.providerKind, id), definition,
      `${id} resolves through the kind-qualified lookup`);
  }
  assert.equal(providers.getProviderDefinition('api', 'codex'), null,
    'kind-qualified lookup rejects cross-domain ids');
  assert.equal(providers.getProviderDefinition('__proto__'), null,
    'prototype-like definition ids fail closed');
  assert.equal(providers.getProviderDefinition('unknown'), null, 'unknown definitions fail closed');

  for (const id of providers.API_PROVIDER_IDS) {
    assert.equal(providers.isApiProvider(id), true, `${id} is an API provider`);
    assert.equal(providers.isAgentProvider(id), false, `${id} is not an agent provider`);
  }
  for (const id of providers.AGENT_PROVIDER_IDS) {
    assert.equal(providers.isAgentProvider(id), true, `${id} is an agent provider`);
    assert.equal(providers.isApiProvider(id), false, `${id} is not an API provider`);
  }
  for (const id of ['__proto__', 'constructor', 'prototype', 'cursor', 'gemini-cli', '', null]) {
    assert.equal(providers.isApiProvider(id), false, `${String(id)} is outside the API allowlist`);
    assert.equal(providers.isAgentProvider(id), false, `${String(id)} is outside the agent allowlist`);
  }

  assert.equal(providers.normalizeSettings.length, 1,
    'settings normalization accepts no recommendation-evidence argument');
  for (const modelProvider of providers.API_PROVIDER_IDS) {
    assert.deepEqual(providers.normalizeSettings({ modelProvider }), {
      providerKind: 'api',
      modelProvider,
      agentProviderId: ''
    }, `legacy ${modelProvider} settings migrate without evidence`);
  }
  assert.deepEqual(providers.normalizeSettings({ modelProvider: 'anthropic' }), {
    providerKind: 'api',
    modelProvider: 'anthropic',
    agentProviderId: ''
  }, 'legacy Anthropic selection is retained');
  for (const input of [undefined, null, [], 'anthropic', {}, { modelProvider: 'codex' }, {
    providerKind: 'invalid', modelProvider: '__proto__', agentProviderId: 'cursor'
  }]) {
    assert.deepEqual(providers.normalizeSettings(input), {
      providerKind: 'api',
      modelProvider: 'xai',
      agentProviderId: ''
    }, 'missing or invalid API values fail closed to API/xAI');
  }
  for (const agentProviderId of providers.AGENT_PROVIDER_IDS) {
    assert.deepEqual(providers.normalizeSettings({
      providerKind: 'agent',
      modelProvider: 'openrouter',
      agentProviderId
    }), {
      providerKind: 'agent',
      modelProvider: 'openrouter',
      agentProviderId
    }, `${agentProviderId} activates without entering modelProvider`);
  }
  assert.deepEqual(providers.normalizeSettings({
    providerKind: 'api',
    modelProvider: 'gemini',
    agentProviderId: 'codex'
  }), {
    providerKind: 'api',
    modelProvider: 'gemini',
    agentProviderId: 'codex'
  }, 'API kind preserves a valid latent agent selection');
  assert.deepEqual(providers.normalizeSettings({
    providerKind: 'invalid',
    modelProvider: 'openai',
    agentProviderId: 'opencode'
  }), {
    providerKind: 'api',
    modelProvider: 'openai',
    agentProviderId: 'opencode'
  }, 'invalid kind migrates to API while preserving a valid latent agent');
  assert.deepEqual(providers.normalizeSettings({
    providerKind: 'agent',
    modelProvider: 'anthropic',
    agentProviderId: 'cursor'
  }), {
    providerKind: 'api',
    modelProvider: 'anthropic',
    agentProviderId: ''
  }, 'invalid active agent fails closed without replacing the valid API selection');

  const frozenSettings = deepFreeze({
    providerKind: 'agent',
    modelProvider: 'custom',
    agentProviderId: 'claude-code',
    nested: { recommendation: 'codex' }
  });
  const normalized = providers.normalizeSettings(frozenSettings);
  assert.deepEqual(normalized, {
    providerKind: 'agent',
    modelProvider: 'custom',
    agentProviderId: 'claude-code'
  }, 'frozen settings normalize without mutation');
  normalized.modelProvider = 'xai';
  assert.equal(frozenSettings.modelProvider, 'custom', 'mutating a result cannot mutate settings');
  assert.notEqual(providers.normalizeSettings(frozenSettings), providers.normalizeSettings(frozenSettings),
    'normalization returns a fresh object every time');

  const liveRows = deepFreeze({
    codex: { live: { agentId: 'codex-live' }, installed: { detected: true }, clicked: {} },
    opencode: { live: { agentId: 'opencode-live' } },
    'claude-code': { live: { agentId: 'claude-live' } }
  });
  assertRecommendation(liveRows, {
    providerKind: 'agent', providerId: 'claude-code', reason: 'live'
  }, 'live tier wins with fixed Claude/OpenCode/Codex tie order');
  assertRecommendation(deepFreeze({
    codex: { live: { agentId: 'codex-live' } },
    'claude-code': { installed: { detected: true } },
    opencode: { clicked: {} }
  }), {
    providerKind: 'agent', providerId: 'codex', reason: 'live'
  }, 'a later-order live row outranks earlier-order lower-tier evidence');
  assertRecommendation(deepFreeze({
    codex: { installed: { detected: true } },
    opencode: { installed: { detected: true } },
    'claude-code': { installed: { detected: true } }
  }), {
    providerKind: 'agent', providerId: 'claude-code', reason: 'installed'
  }, 'installed tier uses the fixed tie order instead of insertion order');
  assertRecommendation(deepFreeze({
    'claude-code': { installed: { detected: false }, clicked: null },
    codex: { installed: { detected: true } },
    opencode: { clicked: {} }
  }), {
    providerKind: 'agent', providerId: 'codex', reason: 'installed'
  }, 'installed false is ineligible while a detected installation wins');
  assertRecommendation(deepFreeze({
    codex: { clicked: { count: 1 } },
    opencode: { clicked: { count: 9 } },
    'claude-code': { clicked: { count: 1 } }
  }), {
    providerKind: 'agent', providerId: 'claude-code', reason: 'clicked'
  }, 'clicked tier ignores counts, recency, and insertion order');
  assertRecommendation(deepFreeze({
    'claude-code': { connected: { lastSeenAt: 999 } },
    opencode: { connected: { lastSeenAt: 1000 } },
    codex: { connected: { lastSeenAt: 1001 } }
  }), {
    providerKind: 'api', providerId: 'xai', reason: 'fallback'
  }, 'historical connected evidence cannot win a recommendation');

  const hostileClients = JSON.parse(`{
    "raw:claude": { "live": {} },
    "cursor": { "installed": { "detected": true } },
    "__proto__": { "clicked": {} },
    "constructor": { "live": {} },
    "prototype": { "installed": { "detected": true } },
    "claude-code": { "live": null, "installed": { "detected": false }, "clicked": null },
    "opencode": [],
    "codex": "connected"
  }`);
  assertRecommendation(deepFreeze(hostileClients), {
    providerKind: 'api', providerId: 'xai', reason: 'fallback'
  }, 'unknown, raw, prototype-like, and malformed rows never become recommendations');
  for (const providerId of providers.AGENT_PROVIDER_IDS) {
    const rawCollision = {
      [providerId]: {
        id: providerId,
        raw: true,
        live: {},
        installed: { detected: true, checkedAt: 99 },
        connected: {},
        clicked: {}
      }
    };
    assertRecommendation(deepFreeze(rawCollision), {
      providerKind: 'api', providerId: 'xai', reason: 'fallback'
    }, `raw collision under ${providerId} cannot recommend a canonical provider`);
    assert.deepEqual(providers.getAgentStatus(rawCollision[providerId]), {
      live: false,
      installed: false,
      seenBefore: false,
      clicked: false,
      primaryLabel: 'Not installed',
      authLabel: 'Not reported',
      checkedAt: null
    }, `raw collision under ${providerId} has no canonical status`);
  }
  const inheritedClients = Object.create({ 'claude-code': { live: {} } });
  inheritedClients.codex = { clicked: {} };
  assertRecommendation(inheritedClients, {
    providerKind: 'agent', providerId: 'codex', reason: 'clicked'
  }, 'inherited allowlisted rows are ignored');
  const reorderedA = {
    codex: { clicked: {} },
    opencode: { clicked: {} }
  };
  const reorderedB = {
    opencode: { clicked: {} },
    codex: { clicked: {} }
  };
  assert.deepEqual(providers.getRecommendation(reorderedA), providers.getRecommendation(reorderedB),
    'reordering the client map cannot change a same-tier recommendation');
  for (const malformed of [undefined, null, [], 'clients', 0, true, {}, { codex: null }]) {
    assertRecommendation(malformed, {
      providerKind: 'api', providerId: 'xai', reason: 'fallback'
    }, 'every malformed or empty client value still returns one fallback');
  }
  const firstRecommendation = providers.getRecommendation({ codex: { live: {} } });
  const secondRecommendation = providers.getRecommendation({ codex: { live: {} } });
  assert.notEqual(firstRecommendation, secondRecommendation,
    'recommendation returns a fresh result object every time');
  firstRecommendation.providerId = 'xai';
  assert.equal(secondRecommendation.providerId, 'codex',
    'mutating one recommendation cannot affect the next result');

  const statusCases = [
    [{ live: {}, installed: { detected: true, checkedAt: 10 }, connected: {}, clicked: {} }, {
      live: true, installed: true, seenBefore: false, clicked: true,
      primaryLabel: 'Connected now', authLabel: 'Not reported', checkedAt: 10
    }, 'live status has primary precedence'],
    [{ installed: { detected: true, checkedAt: 20 }, connected: {}, clicked: {} }, {
      live: false, installed: true, seenBefore: true, clicked: true,
      primaryLabel: 'Installed', authLabel: 'Not reported', checkedAt: 20
    }, 'installed status has precedence over historical and clicked evidence'],
    [{ connected: { lastSeenAt: 30 } }, {
      live: false, installed: false, seenBefore: true, clicked: false,
      primaryLabel: 'Seen before', authLabel: 'Not reported', checkedAt: null
    }, 'historical evidence is seen before rather than connected now'],
    [{ clicked: { count: 1 } }, {
      live: false, installed: false, seenBefore: false, clicked: true,
      primaryLabel: 'Setup copied', authLabel: 'Not reported', checkedAt: null
    }, 'clicked-only evidence is setup copied'],
    [{ installed: { detected: false, checkedAt: 40 } }, {
      live: false, installed: false, seenBefore: false, clicked: false,
      primaryLabel: 'Not installed', authLabel: 'Not reported', checkedAt: 40
    }, 'installed false remains not installed while retaining its finite check time'],
    [{}, {
      live: false, installed: false, seenBefore: false, clicked: false,
      primaryLabel: 'Not installed', authLabel: 'Not reported', checkedAt: null
    }, 'missing evidence returns status-safe defaults']
  ];
  for (const [row, expected, message] of statusCases) {
    const frozenRow = deepFreeze(row);
    assert.deepEqual(providers.getAgentStatus(frozenRow), expected, message);
  }
  for (const row of [undefined, null, [], 'row', 42, true]) {
    assert.deepEqual(providers.getAgentStatus(row), {
      live: false,
      installed: false,
      seenBefore: false,
      clicked: false,
      primaryLabel: 'Not installed',
      authLabel: 'Not reported',
      checkedAt: null
    }, 'malformed rows return safe status defaults');
  }
  for (const checkedAt of [NaN, Infinity, -Infinity, '50', null, undefined]) {
    const status = providers.getAgentStatus({
      installed: { detected: true, checkedAt },
      clicked: { checkedAt: 101 },
      connected: { lastSeenAt: 102 },
      live: { connectedAt: 103 }
    });
    assert.equal(status.checkedAt, null, `${String(checkedAt)} is not a finite installed check time`);
  }
  assert.equal(providers.getAgentStatus({
    installed: { detected: true },
    clicked: { checkedAt: 201 },
    connected: { lastSeenAt: 202 },
    live: { connectedAt: 203 }
  }).checkedAt, null, 'unrelated evidence timestamps never substitute for installed checkedAt');

  const supportedCompatibility = {
    label: 'Supported',
    icon: 'fa-circle-check',
    className: 'compatibility-badge--supported',
    detail: "This CLI is within FSB's fixture-tested compatibility range.",
    checkedText: 'Checked absolute:1000'
  };
  const degradedNewerCompatibility = {
    label: 'Degraded',
    icon: 'fa-triangle-exclamation',
    className: 'compatibility-badge--degraded',
    detail: "This CLI is newer than FSB's fixture-tested range. You can keep it selected; existing start checks still apply.",
    checkedText: 'Checked absolute:1000'
  };
  const degradedStaleCompatibility = {
    label: 'Degraded',
    icon: 'fa-triangle-exclamation',
    className: 'compatibility-badge--degraded',
    detail: 'Compatibility evidence is stale. Refresh status to check again.',
    checkedText: 'Checked absolute:1000'
  };
  const unsupportedCompatibility = {
    label: 'Unsupported',
    icon: 'fa-circle-xmark',
    className: 'compatibility-badge--unsupported',
    detail: 'FSB cannot verify compatibility for this CLI. Refresh status or review setup before starting a task.',
    checkedText: 'Checked absolute:1000'
  };
  const formatCalls = [];
  const formatAbsolute = (checkedAt) => {
    formatCalls.push(checkedAt);
    return `absolute:${checkedAt}`;
  };
  const compatibilityRow = (status, reason, checkedAt = 1000, extra = {}) => ({
    id: 'claude-code',
    version: '999.999.999-canary',
    detectedVersion: '__must_not_be_read__',
    compatibility: { status, reason, checkedAt, version: '0.0.0-canary' },
    ...extra
  });

  assert.deepEqual(providers.getCompatibilityDisplayModel(
    'claude-code',
    compatibilityRow('supported', 'within_tested_range'),
    formatAbsolute
  ), supportedCompatibility, 'fresh validated supported evidence maps to the exact Supported model');
  assert.deepEqual(providers.getCompatibilityDisplayModel(
    'claude-code',
    compatibilityRow('degraded', 'newer_than_tested_range'),
    formatAbsolute
  ), degradedNewerCompatibility, 'newer-than-tested evidence maps to the exact Degraded model');
  assert.deepEqual(providers.getCompatibilityDisplayModel(
    'claude-code',
    compatibilityRow('degraded', 'evidence_stale'),
    formatAbsolute
  ), degradedStaleCompatibility, 'stale evidence maps to the exact Degraded stale model');
  assert.deepEqual(providers.getCompatibilityDisplayModel(
    'claude-code',
    compatibilityRow('supported', 'evidence_stale'),
    formatAbsolute
  ), degradedStaleCompatibility,
  'an inconsistent supported token cannot override the defensive stale downgrade');

  const unsupportedReasons = [
    'binary_not_found',
    'version_missing',
    'version_malformed',
    'below_minimum',
    'wrong_major',
    'adapter_unshipped',
    'matrix_invalid'
  ];
  for (const reason of unsupportedReasons) {
    assert.deepEqual(providers.getCompatibilityDisplayModel(
      'claude-code',
      compatibilityRow('unsupported', reason),
      formatAbsolute
    ), unsupportedCompatibility, `${reason} maps to the exact Unsupported model`);
  }

  for (const providerId of providers.API_PROVIDER_IDS) {
    assert.equal(providers.getCompatibilityDisplayModel(
      providerId,
      compatibilityRow('supported', 'within_tested_range'),
      formatAbsolute
    ), null, `${providerId} receives no compatibility model`);
  }
  for (const providerId of delegationProviders.ids()) {
    assert.deepEqual(providers.getCompatibilityDisplayModel(
      providerId,
      compatibilityRow('supported', 'within_tested_range'),
      formatAbsolute
    ), supportedCompatibility, `${providerId} maps fresh validated evidence to Supported`);
    assert.deepEqual(providers.getCompatibilityDisplayModel(
      providerId,
      compatibilityRow('degraded', 'newer_than_tested_range'),
      formatAbsolute
    ), degradedNewerCompatibility, `${providerId} maps newer evidence to Degraded`);
    assert.deepEqual(providers.getCompatibilityDisplayModel(
      providerId,
      compatibilityRow('degraded', 'evidence_stale'),
      formatAbsolute
    ), degradedStaleCompatibility, `${providerId} maps stale evidence to Degraded`);
    for (const reason of unsupportedReasons) {
      assert.deepEqual(providers.getCompatibilityDisplayModel(
        providerId,
        compatibilityRow('unsupported', reason),
        formatAbsolute
      ), unsupportedCompatibility, `${providerId}/${reason} maps to Unsupported`);
    }
  }
  for (const providerId of ['codex']) {
    assert.deepEqual(providers.getCompatibilityDisplayModel(
      providerId,
      compatibilityRow('supported', 'within_tested_range'),
      formatAbsolute
    ), unsupportedCompatibility, `${providerId} remains Unsupported while its adapter is unshipped`);
  }

  let rowAccessorCalls = 0;
  const accessorRow = {};
  Object.defineProperty(accessorRow, 'compatibility', {
    enumerable: true,
    get() {
      rowAccessorCalls += 1;
      return { status: 'supported', reason: 'within_tested_range', checkedAt: 1000 };
    }
  });
  let fieldAccessorCalls = 0;
  const accessorCompatibility = { reason: 'within_tested_range', checkedAt: 1000 };
  Object.defineProperty(accessorCompatibility, 'status', {
    enumerable: true,
    get() {
      fieldAccessorCalls += 1;
      return 'supported';
    }
  });
  const inheritedRow = Object.create({
    compatibility: { status: 'supported', reason: 'within_tested_range', checkedAt: 1000 }
  });
  const inheritedCompatibility = Object.assign(Object.create({
    status: 'supported', reason: 'within_tested_range', checkedAt: 1000
  }), {});
  const malformedRows = [
    undefined,
    null,
    [],
    'row',
    {},
    { compatibility: null },
    { compatibility: [] },
    { compatibility: { status: 'supported', reason: 'within_tested_range' } },
    { compatibility: { status: 'supported', reason: 'within_tested_range', checkedAt: '1000' } },
    { compatibility: { status: 'supported', reason: 'unknown', checkedAt: 1000 } },
    { compatibility: { status: 'degraded', reason: 'within_tested_range', checkedAt: 1000 } },
    { compatibility: { status: 'supported', reason: 'binary_not_found', checkedAt: 1000 } },
    { compatibility: inheritedCompatibility },
    inheritedRow,
    accessorRow,
    { compatibility: accessorCompatibility }
  ];
  const unsupportedWithoutTime = { ...unsupportedCompatibility, checkedText: null };
  for (const row of malformedRows) {
    assert.deepEqual(providers.getCompatibilityDisplayModel(
      'claude-code', row, formatAbsolute
    ), unsupportedWithoutTime, 'malformed, inherited, or accessor evidence fails closed');
  }
  assert.equal(rowAccessorCalls, 0, 'row compatibility accessors are never invoked');
  assert.equal(fieldAccessorCalls, 0, 'compatibility field accessors are never invoked');

  const arbitraryVersionsA = compatibilityRow('supported', 'within_tested_range');
  const arbitraryVersionsB = compatibilityRow('supported', 'within_tested_range');
  arbitraryVersionsB.version = 'not-semver-at-all';
  arbitraryVersionsB.detectedVersion = '../../../../bin/secret';
  arbitraryVersionsB.compatibility.version = '<script>version</script>';
  assert.deepEqual(
    providers.getCompatibilityDisplayModel('claude-code', arbitraryVersionsA, formatAbsolute),
    providers.getCompatibilityDisplayModel('claude-code', arbitraryVersionsB, formatAbsolute),
    'arbitrary version canaries cannot influence compatibility mapping'
  );
  const callerCopy = compatibilityRow('supported', 'within_tested_range', 1000, {
    label: 'Attacker label',
    icon: 'attacker-icon',
    className: 'attacker-class',
    detail: 'Attacker detail'
  });
  assert.deepEqual(providers.getCompatibilityDisplayModel(
    'claude-code', callerCopy, formatAbsolute
  ), supportedCompatibility, 'display strings and classes come only from local constants');
  assert.notEqual(
    providers.getCompatibilityDisplayModel('claude-code', callerCopy, formatAbsolute),
    providers.getCompatibilityDisplayModel('claude-code', callerCopy, formatAbsolute),
    'compatibility mapping returns a fresh display model each time'
  );
  assert.deepEqual(providers.getCompatibilityDisplayModel(
    'claude-code', compatibilityRow('unsupported', 'matrix_invalid', null), formatAbsolute
  ), unsupportedWithoutTime, 'unsupported evidence may omit a validated check timestamp');
  assert.deepEqual(providers.getCompatibilityDisplayModel(
    'claude-code', compatibilityRow('supported', 'within_tested_range', Number.NaN), formatAbsolute
  ), unsupportedWithoutTime, 'invalid supported timestamps fail closed without formatting');
  assert.deepEqual(providers.getCompatibilityDisplayModel(
    'claude-code', compatibilityRow('supported', 'within_tested_range'), () => { throw new Error('no locale'); }
  ), { ...supportedCompatibility, checkedText: null }, 'formatter failure omits checked help safely');
  assert.ok(formatCalls.every((value) => value === 1000),
    'the injected absolute formatter receives only a validated timestamp');

  assert.deepEqual(providers.getAgentAuthDisplay('claude-code'), {
    label: 'Not reported',
    help: 'Claude Code does not report an auth state that FSB can safely read.'
  }, 'Claude auth display remains exact and does not infer a state');
  assert.deepEqual(providers.getAgentAuthDisplay('opencode'), {
    label: 'Not reported',
    help: 'The CLI has not reported its account type.'
  }, 'OpenCode auth remains exact Not reported with the approved generic help');
  assert.equal(providers.getAgentAuthDisplay('xai'), null,
    'API providers receive no agent auth display model');
  assert.notEqual(providers.getAgentAuthDisplay('claude-code'),
    providers.getAgentAuthDisplay('claude-code'),
    'agent auth display mapping returns a fresh object');

  const compatibilityMapperSource = extractFunction(
    helperSource,
    'function getCompatibilityDisplayModel('
  );
  assert.doesNotMatch(compatibilityMapperSource,
    /\b(?:version|semver|minimum|maximum|testedThrough|range)\b/i,
    'UI compatibility mapping contains no version parser or compatibility range policy');
  assert.doesNotMatch(compatibilityMapperSource,
    /(?:split\s*\(\s*['"]\.['"]|localeCompare|parseInt|parseFloat)/,
    'UI compatibility mapping contains no version-comparison primitive');
  assert.doesNotMatch(compatibilityMapperSource,
    /providerId\s*[!=]==?\s*['"](?:claude-code|opencode)['"]/,
    'UI compatibility mapping has no provider-specific Claude/OpenCode state branch');
  assert.match(helperSource, /FsbDelegationProviders/,
    'UI compatibility membership comes from the canonical delegation provider helper');

  const providerProjectionSource = [
    extractFunction(optionsSource, 'function getOwnDataValue('),
    extractFunction(optionsSource, 'function isProviderDataRecord('),
    extractFunction(optionsSource, 'function copyProviderClientMap('),
    extractFunction(optionsSource, 'function copyProviderDataRecord('),
    extractFunction(optionsSource, 'function projectStaleProviderCompatibility('),
    extractFunction(optionsSource, 'function getProviderCompatibilityCheckedAt('),
    extractFunction(optionsSource, 'function hasDegradedProviderCompatibility('),
    extractFunction(optionsSource, 'function getCompatibilityRefreshFailureMessage(')
  ].join('\n');
  assert.match(providerProjectionSource, /getShippedDelegationProviderIds\(\)/,
    'expiry and degraded-summary logic iterate the exact shipped provider roster');
  assert.doesNotMatch(providerProjectionSource, /getOwnDataValue\(clients, 'claude-code'\)/,
    'expiry and degraded-summary logic contain no Claude-only client lookup');

  const projectionContext = {
    Object,
    Array,
    Number,
    getShippedDelegationProviderIds: () => delegationProviders.ids()
  };
  projectionContext.globalThis = projectionContext;
  vm.runInNewContext(
    `${providerProjectionSource}\n`
      + 'this.getCheckedAt = getProviderCompatibilityCheckedAt;\n'
      + 'this.projectStale = projectStaleProviderCompatibility;\n'
      + 'this.failureMessage = getCompatibilityRefreshFailureMessage;',
    projectionContext,
    { filename: 'options.js#provider-compatibility-roster' }
  );
  const dualCompatibility = {
    'claude-code': {
      compatibility: { status: 'supported', reason: 'within_tested_range', checkedAt: 2000 }
    },
    opencode: {
      compatibility: { status: 'degraded', reason: 'newer_than_tested_range', checkedAt: 1000 }
    }
  };
  assert.equal(projectionContext.getCheckedAt(dualCompatibility), 1000,
    'compatibility expiry uses the earliest exact shipped-provider timestamp');
  assert.equal(projectionContext.getCheckedAt({ opencode: dualCompatibility.opencode }), null,
    'compatibility expiry fails closed when one shipped provider row is absent');
  assert.equal(
    projectionContext.failureMessage(dualCompatibility),
    'Compatibility data could not be refreshed. Cached support is now Degraded.',
    'an OpenCode degraded row selects the exact cached-support failure copy'
  );
  const staleProjection = projectionContext.projectStale({
    'claude-code': {
      compatibility: { status: 'supported', reason: 'within_tested_range', checkedAt: 3000 }
    },
    opencode: {
      compatibility: { status: 'supported', reason: 'within_tested_range', checkedAt: 3000 }
    },
    codex: {
      compatibility: { status: 'supported', reason: 'within_tested_range', checkedAt: 3000 }
    },
    xai: {
      compatibility: { status: 'supported', reason: 'within_tested_range', checkedAt: 3000 }
    }
  });
  for (const providerId of delegationProviders.ids()) {
    assert.deepEqual(clone(staleProjection[providerId].compatibility), {
      status: 'degraded', reason: 'evidence_stale', checkedAt: 3000
    }, `${providerId} support downgrades through the shared shipped roster`);
  }
  assert.deepEqual(clone(staleProjection.codex.compatibility), {
    status: 'supported', reason: 'within_tested_range', checkedAt: 3000
  }, 'the unshipped Codex row is not granted a compatibility transition');
  assert.deepEqual(clone(staleProjection.xai.compatibility), {
    status: 'supported', reason: 'within_tested_range', checkedAt: 3000
  }, 'API rows are outside shipped-agent compatibility transitions');

  for (const authState of ['subscription', ' SUBSCRIPTION ', { mode: 'subscription' }]) {
    assert.deepEqual(providers.getBillingLabel(authState), {
      label: 'Included in your subscription',
      confirmed: true
    }, 'only explicit normalized subscription auth reports inclusion');
  }
  for (const mode of ['api', 'credits', 'zen', 'provider']) {
    assert.deepEqual(providers.getBillingLabel(mode), {
      label: 'Billed by your CLI provider',
      confirmed: true
    }, `${mode} auth reports provider billing`);
    assert.deepEqual(providers.getBillingLabel({ mode }), {
      label: 'Billed by your CLI provider',
      confirmed: true
    }, `${mode} object auth reports provider billing`);
  }
  for (const authState of [undefined, null, '', 'unknown', {}, [], {
    installed: { detected: true },
    clicked: {},
    connected: {},
    live: {}
  }]) {
    assert.deepEqual(providers.getBillingLabel(authState), {
      label: 'Billing not reported',
      confirmed: false
    }, 'unknown auth and provider evidence never imply billing');
  }
  assert.notEqual(providers.getBillingLabel('api'), providers.getBillingLabel('api'),
    'billing derivation returns a fresh result object');

  const claude = providers.PROVIDER_DEFINITIONS['claude-code'];
  const opencode = providers.PROVIDER_DEFINITIONS.opencode;
  const codex = providers.PROVIDER_DEFINITIONS.codex;
  assert.equal(claude.billingUrl, 'https://claude.com/pricing');
  assert.equal(opencode.billingUrl, 'https://opencode.ai/docs/providers/');
  assert.equal(opencode.secondaryBillingUrl, 'https://opencode.ai/docs/zen/');
  assert.equal(codex.billingUrl,
    'https://help.openai.com/en/articles/20001106-codex-rate-card-2');
  assert.equal(claude.billingCopy,
    "Uses the account signed into Claude Code. FSB does not need your Anthropic credential. Usage and charges follow that account's Claude plan or API configuration.");
  assert.equal(opencode.billingCopy,
    'Uses the provider configured in OpenCode. FSB does not need that provider credential. Charges may come from OpenCode Zen or the configured provider.');
  assert.equal(codex.billingCopy,
    "Uses the account signed into Codex. FSB does not need your OpenAI credential. Usage, credits, and charges follow that account's current OpenAI plan or API configuration.");
  const urls = providers.AGENT_PROVIDER_IDS.flatMap((id) => {
    const definition = providers.PROVIDER_DEFINITIONS[id];
    return [definition.billingUrl, definition.secondaryBillingUrl].filter(Boolean);
  });
  assert.deepEqual(urls, [
    'https://claude.com/pricing',
    'https://opencode.ai/docs/providers/',
    'https://opencode.ai/docs/zen/',
    'https://help.openai.com/en/articles/20001106-codex-rate-card-2'
  ], 'agent definitions expose exactly the four approved official HTTPS destinations');
  for (const url of urls) assert.match(url, /^https:\/\//, `${url} is HTTPS`);
  const billingContract = providers.AGENT_PROVIDER_IDS
    .map((id) => JSON.stringify(providers.PROVIDER_DEFINITIONS[id]))
    .join('\n');
  assert.doesNotMatch(billingContract, /\b(?:included|free|unlimited)\b/i,
    'agent definitions make no blanket subscription or zero-cost promise');
  assert.doesNotMatch(billingContract, /\$\s*\d|\d+(?:\.\d+)?\s*(?:usd|dollars?)/i,
    'agent definitions contain no fabricated dollar amount');

  assert.match(helperSource, /^\(function\(global\) \{\n  'use strict';/,
    'helper is a strict-mode classic-script IIFE');
  assert.match(helperSource, /global\.FSBProvidersPanel = api;/,
    'helper assigns the classic-script namespace');
  assert.match(helperSource, /module\.exports = api;/,
    'helper supports direct CommonJS assertions');
  for (const forbidden of [
    /chrome\./,
    /\bdocument\b/,
    /\bwindow\b/,
    /\bfetch\b/,
    /\beval\b/,
    /\bsetTimeout\b/,
    /\bsetInterval\b/
  ]) {
    assert.doesNotMatch(helperSource, forbidden,
      `pure helper source excludes ${String(forbidden)}`);
  }
  assert.doesNotMatch(helperSource, /\.\.\.\s*(?:clients|row|settings)/,
    'untrusted state is never spread');

  const trustControlSource = [
    extractFunction(optionsSource, 'function renderDelegationTrustControl()'),
    extractFunction(optionsSource, 'async function clearDelegationTrust()')
  ].join('\n');
  assert.match(trustControlSource, /getCanonicalDelegationProvider\(/,
    'trust reset resolves the selected provider through canonical metadata');
  assert.doesNotMatch(trustControlSource, /['"]claude-code['"]/,
    'trust reset has no Claude-only provider literal');
  assert.match(trustControlSource,
    /type: 'FSB_DELEGATION_CLEAR_TRUST',[\s\S]*providerId: provider\.id/,
    'Providers sends only the exact selected canonical provider id');
  assert.doesNotMatch(trustControlSource, /chrome\.storage|localStorage|markUnsavedChanges|saveSettings/,
    'restore confirmation never reads trust storage or joins Save Settings');
  assert.match(trustControlSource,
    /providerPanelState\.providerKind[\s\S]*providerPanelState\.agentProviderId/,
    'restore confirmation remains bound to the selected agent pair');

  function makeTrustControlHarness(sendMessage, providerId = 'claude-code') {
    const state = { providerKind: 'agent', agentProviderId: providerId };
    const elements = {
      delegationTrustSection: { hidden: true },
      delegationTrustCopy: { textContent: '' },
      delegationTrustClearBtn: { disabled: false },
      delegationTrustStatus: { textContent: '' }
    };
    const context = {
      providerPanelState: state,
      elements,
      chrome: { runtime: { sendMessage } },
      getCanonicalDelegationProvider(id) { return delegationProviders.get(id); },
      Promise,
      Error
    };
    context.globalThis = context;
    vm.runInNewContext(
      `let delegationTrustClearPending = false;\n${trustControlSource}\nthis.render = renderDelegationTrustControl;\nthis.clear = clearDelegationTrust;`,
      context,
      { filename: 'options.js#delegation-trust-control' }
    );
    return { state, elements, render: context.render, clear: context.clear };
  }

  {
    const sent = [];
    let resolveClear;
    const pending = new Promise((resolve) => { resolveClear = resolve; });
    const harness = makeTrustControlHarness((request) => {
      sent.push(clone(request));
      return pending;
    });
    harness.render();
    assert.equal(harness.elements.delegationTrustSection.hidden, false,
      'canonical Claude details show restore confirmation');
    assert.equal(harness.elements.delegationTrustCopy.textContent,
      'Require confirmation before Claude Code starts another delegated browser task.');
    assert.equal(harness.elements.delegationTrustClearBtn.textContent,
      'Restore confirmation for Claude Code');
    const first = harness.clear();
    const duplicate = harness.clear();
    assert.equal(sent.length, 1, 'pending clicks dedupe to one clear command');
    assert.equal(harness.elements.delegationTrustClearBtn.disabled, true,
      'restore confirmation disables while pending');
    assert.equal(harness.elements.delegationTrustStatus.textContent, 'Restoring confirmation…',
      'pending state is reported inline');
    resolveClear({ ok: true, providerId: 'claude-code', trusted: false });
    await Promise.all([first, duplicate]);
    assert.deepEqual(sent, [{ type: 'FSB_DELEGATION_CLEAR_TRUST', providerId: 'claude-code' }],
      'click sends no task, challenge, trust boolean, or provider-native state');
    assert.equal(harness.elements.delegationTrustStatus.textContent,
      'Confirmation restored for Claude Code', 'authoritative success uses exact copy');
    assert.equal(harness.elements.delegationTrustClearBtn.disabled, false,
      'control re-enables after authoritative success');

    harness.state.providerKind = 'api';
    harness.render();
    assert.equal(harness.elements.delegationTrustSection.hidden, true,
      'API details do not render the trust control');
    harness.state.providerKind = 'agent';
    harness.state.agentProviderId = 'codex';
    harness.render();
    assert.equal(harness.elements.delegationTrustSection.hidden, true,
      'future unsupported agent details do not render the Claude trust control');
  }

  {
    const sent = [];
    const harness = makeTrustControlHarness(async (request) => {
      sent.push(clone(request));
      return { ok: true, providerId: 'opencode', trusted: false };
    }, 'opencode');
    harness.render();
    assert.equal(harness.elements.delegationTrustSection.hidden, false,
      'canonical OpenCode details expose the same restore-confirmation control');
    assert.equal(harness.elements.delegationTrustCopy.textContent,
      'Require confirmation before OpenCode starts another delegated browser task.');
    assert.equal(harness.elements.delegationTrustClearBtn.textContent,
      'Restore confirmation for OpenCode');
    await harness.clear();
    assert.deepEqual(sent, [{
      type: 'FSB_DELEGATION_CLEAR_TRUST', providerId: 'opencode'
    }], 'OpenCode trust reset sends only its canonical provider id');
    assert.equal(harness.elements.delegationTrustStatus.textContent,
      'Confirmation restored for OpenCode');
  }

  {
    const harness = makeTrustControlHarness(async () => ({
      ok: false, code: 'trust_storage_failed'
    }));
    await harness.clear();
    assert.equal(harness.elements.delegationTrustStatus.textContent,
      'Could not restore confirmation. Try again.', 'failure remains inline and actionable');
    assert.equal(harness.elements.delegationTrustClearBtn.disabled, false,
      'failure retains an enabled restore control');
  }

  const providersScriptToken = '<script src="providers-panel.js"></script>';
  const optionsScriptToken = '<script src="options.js"></script>';
  assert.equal(controlPanelSource.split(providersScriptToken).length - 1, 1,
    'control panel loads providers-panel.js exactly once');
  assert.equal(controlPanelSource.split(optionsScriptToken).length - 1, 1,
    'control panel loads options.js exactly once');
  assert.ok(
    controlPanelSource.indexOf(providersScriptToken) < controlPanelSource.indexOf(optionsScriptToken),
    'provider helper loads before options.js'
  );
  assert.match(
    controlPanelSource,
    /<script src="providers-panel\.js"><\/script>\s*<script src="options\.js"><\/script>/,
    'provider helper is immediately before options.js'
  );
  const controlPanelMarkup = controlPanelSource.replace(/<!--[\s\S]*?-->/g, '');
  assert.equal((controlPanelMarkup.match(/<script(?![^>]*\bsrc=)[^>]*>/g) || []).length, 0,
    'control panel contains no inline script block');

  const modelProviderSelect = controlPanelSource.match(
    /<select id="modelProvider"[\s\S]*?<\/select>/
  );
  assert.ok(modelProviderSelect, 'current modelProvider select remains present');
  assert.deepEqual(
    Array.from(modelProviderSelect[0].matchAll(/<option value="([^"]+)"/g), (match) => match[1]),
    providers.API_PROVIDER_IDS,
    'current modelProvider select remains the same seven-value API surface'
  );
  for (const id of ['modelCombobox', 'modelSearch', 'modelListbox', 'modelName']) {
    assert.match(controlPanelSource, new RegExp(`id="${id}"`), `${id} markup remains present`);
  }

  const agentDetails = controlPanelSource.match(
    /<div id="agentProviderDetails"[\s\S]*?<\/div>\s*<\/div>\s*<\/section>/
  );
  assert.ok(agentDetails, 'agent provider details markup remains present');
  assert.match(agentDetails[0],
    /<input type="password" id="mcpBridgePairingCode"[^>]*autocomplete="off"[^>]*spellcheck="false">/,
    'bridge pairing uses a non-autofilled password input');
  assert.match(agentDetails[0],
    /Run fsb-mcp-server pair, then paste the code here\. The code stays in this browser session\./,
    'bridge pairing explains the exact session-only workflow');
  assert.ok(
    agentDetails[0].indexOf('id="agentSetupHeading"')
      < agentDetails[0].indexOf('id="mcpBridgePairingHeading"')
      && agentDetails[0].indexOf('id="mcpBridgePairingHeading"')
        < agentDetails[0].indexOf('id="agentUsageHeading"'),
    'bridge pairing sits between agent Setup and Usage'
  );
  const providerLabels = controlPanelSource.match(
    /<label\b[^>]*class="provider-row"[^>]*>[\s\S]*?<\/label>/g
  ) || [];
  assert.equal(providerLabels.length, 10, 'the provider roster keeps ten radio labels');
  providerLabels.forEach((label) => {
    assert.doesNotMatch(label, /mcpBridgePairing|Pair bridge|Remove pairing/,
      'pairing controls never nest inside provider radio labels');
  });

  const testCommands = JSON.parse(packageSource).scripts.test.split(' && ');
  const providerCommand = 'node tests/providers-panel-logic.test.js';
  const providerUiCommand = 'node tests/providers-panel-ui.test.js';
  const identityCommand = 'node tests/mcp-client-identity-integration.test.js';
  const turnResultCommand = 'node tests/turn-result.test.js';
  assert.equal(testCommands.filter((command) => command === providerCommand).length, 1,
    'root npm test includes the provider contract exactly once');
  assert.equal(testCommands.indexOf(providerCommand), testCommands.indexOf(identityCommand) + 1,
    'provider contract follows MCP client identity integration');
  assert.equal(testCommands.filter((command) => command === providerUiCommand).length, 1,
    'root npm test includes the provider UI contract exactly once');
  assert.equal(testCommands.indexOf(providerUiCommand), testCommands.indexOf(providerCommand) + 1,
    'provider UI contract immediately follows provider logic');
  assert.equal(testCommands.indexOf(turnResultCommand), testCommands.indexOf(providerUiCommand) + 1,
    'provider contracts precede the existing turn/provider test cluster');

  console.log('providers-panel-logic.test.js: PASS');
}

main().catch((error) => {
  console.error('providers-panel-logic.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
