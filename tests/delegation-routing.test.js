'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const enginePath = path.join(repoRoot, 'extension', 'ai', 'engine-config.js');
const configPath = path.join(repoRoot, 'extension', 'config', 'config.js');
const delegationProvidersPath = path.join(repoRoot, 'extension', 'utils', 'delegation-providers.js');
const preflightPath = path.join(repoRoot, 'extension', 'utils', 'delegation-preflight.js');
const sidepanelPath = path.join(repoRoot, 'extension', 'ui', 'sidepanel.js');
const backgroundPath = path.join(repoRoot, 'extension', 'background.js');
const delegationProvidersSource = fs.readFileSync(delegationProvidersPath, 'utf8');
const preflightSource = fs.readFileSync(preflightPath, 'utf8');
const sidepanelSource = fs.readFileSync(sidepanelPath, 'utf8');
const backgroundSource = fs.readFileSync(backgroundPath, 'utf8');
const SECTION_ARGUMENT_INDEX = process.argv.indexOf('--section');
const SELECTED_SECTION = SECTION_ARGUMENT_INDEX === -1
  ? null
  : process.argv[SECTION_ARGUMENT_INDEX + 1];

if (SECTION_ARGUMENT_INDEX !== -1 && !SELECTED_SECTION) {
  throw new Error('--section requires a value');
}
if (SELECTED_SECTION !== null
    && SELECTED_SECTION !== 'accepted-identity-preflight'
    && SELECTED_SECTION !== 'immediate-start-identity'
    && SELECTED_SECTION !== 'codex-auth-preflight') {
  throw new Error(`unknown section: ${SELECTED_SECTION}`);
}

const CLAUDE_ACCEPTED_IDENTITY = Object.freeze({
  providerId: 'claude-code',
  label: 'Claude Code',
  profileVersion: '2.1.177',
  authState: 'unknown',
  billingKind: 'subscription'
});
const OPENCODE_ACCEPTED_IDENTITY = Object.freeze({
  providerId: 'opencode',
  label: 'OpenCode',
  profileVersion: '1.14.25',
  authState: 'unknown',
  billingKind: 'unknown'
});
const CODEX_CHATGPT_ACCEPTED_IDENTITY = Object.freeze({
  providerId: 'codex',
  label: 'Codex',
  profileVersion: '0.142.5',
  authState: 'chatgpt',
  billingKind: 'subscription'
});
const CODEX_API_KEY_ACCEPTED_IDENTITY = Object.freeze({
  providerId: 'codex',
  label: 'Codex',
  profileVersion: '0.142.5',
  authState: 'api_key',
  billingKind: 'api'
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function bridgeState(overrides = {}) {
  return {
    status: 'connected',
    connected: true,
    pairingStatus: 'paired',
    delegationConnection: { state: 'connected' },
    ...overrides
  };
}

function supportedCompatibility(checkedAt = 100) {
  return { status: 'supported', reason: 'within_tested_range', checkedAt };
}

function degradedCompatibility(checkedAt = 100) {
  return { status: 'degraded', reason: 'newer_than_tested_range', checkedAt };
}

function loadPreflightContract() {
  const context = { Object };
  context.globalThis = context;
  vm.runInNewContext(`${delegationProvidersSource}\n${preflightSource}`, context, {
    filename: 'delegation-preflight.js'
  });
  return {
    canonical: context.FsbDelegationProviders,
    preflight: context.FsbDelegationPreflight
  };
}

function runCodexAuthPreflightContract() {
  const { canonical, preflight } = loadPreflightContract();
  assert.deepEqual(clone(canonical.ids()), ['claude-code', 'opencode', 'codex'],
    'Codex is the exact third canonical agent provider');
  for (const [identity, billingKind] of [
    [CODEX_CHATGPT_ACCEPTED_IDENTITY, 'subscription'],
    [CODEX_API_KEY_ACCEPTED_IDENTITY, 'api']
  ]) {
    assert.equal(canonical.resolveAgentBillingKind('codex', identity.authState), billingKind);
    for (const compatibility of [supportedCompatibility(), degradedCompatibility()]) {
      assert.deepEqual(clone(preflight.check({
        providerKind: 'agent',
        agentProviderId: 'codex',
        modelProvider: 'xai',
        bridgeState: bridgeState(),
        compatibility,
        acceptedIdentity: clone(identity)
      })), {
        ok: true,
        kind: 'agent',
        providerId: 'codex',
        providerLabel: 'Codex',
        acceptedIdentity: identity
      }, `${identity.authState} Codex authority is runnable for fresh compatibility`);
    }
  }

  for (const authState of ['unauthenticated', 'unknown']) {
    assert.equal(canonical.createAcceptedAgentIdentity('codex', authState), null,
      `${authState} cannot mint Codex authority`);
    assert.deepEqual(clone(preflight.check({
      providerKind: 'agent',
      agentProviderId: 'codex',
      modelProvider: 'xai',
      bridgeState: bridgeState(),
      compatibility: supportedCompatibility(),
      acceptedIdentity: null
    })), {
      ok: false,
      code: 'provider_status_refresh',
      providerId: 'codex',
      providerLabel: 'Codex'
    });
  }

  for (const acceptedIdentity of [
    { ...CODEX_CHATGPT_ACCEPTED_IDENTITY, billingKind: 'api' },
    { ...CODEX_API_KEY_ACCEPTED_IDENTITY, billingKind: 'subscription' },
    { ...CODEX_CHATGPT_ACCEPTED_IDENTITY, providerId: 'claude-code' },
    { ...CODEX_CHATGPT_ACCEPTED_IDENTITY, authState: 'unknown', billingKind: 'unknown' }
  ]) {
    assert.equal(preflight.check({
      providerKind: 'agent',
      agentProviderId: 'codex',
      modelProvider: 'xai',
      bridgeState: bridgeState(),
      compatibility: supportedCompatibility(),
      acceptedIdentity
    }).code, 'provider_status_refresh', 'invalid Codex identity pairs fail closed');
  }
  assert.equal(preflight.check({
    providerKind: 'agent',
    agentProviderId: 'codex',
    modelProvider: 'xai',
    bridgeState: bridgeState(),
    compatibility: { status: 'degraded', reason: 'evidence_stale', checkedAt: 100 },
    acceptedIdentity: clone(CODEX_CHATGPT_ACCEPTED_IDENTITY)
  }).code, 'unsupported_provider', 'stale Codex evidence cannot start');
  runImmediateStartIdentityContract();
}

function sentDelegationRequestSource(messageType) {
  const marker = `type: '${messageType}'`;
  const markerIndex = sidepanelSource.indexOf(marker);
  assert.notEqual(markerIndex, -1, `${messageType} request exists`);
  const startIndex = sidepanelSource.lastIndexOf('_sendDelegationCommand({', markerIndex);
  const endIndex = sidepanelSource.indexOf('});', markerIndex);
  assert.notEqual(startIndex, -1, `${messageType} request has a send boundary`);
  assert.notEqual(endIndex, -1, `${messageType} request has a closing boundary`);
  return sidepanelSource.slice(startIndex, endIndex + 3);
}

function runImmediateStartIdentityContract() {
  const startOffset = backgroundSource.indexOf(
    'async function fsbDelegationStartCommand(request) {'
  );
  const endOffset = backgroundSource.indexOf(
    'function fsbDelegationMapLifecycleFailure',
    startOffset
  );
  assert.notEqual(startOffset, -1, 'background start command exists');
  assert(endOffset > startOffset, 'background start command has a closed source boundary');
  const delegatedStart = backgroundSource.slice(startOffset, endOffset);
  assert.match(
    delegatedStart,
    /fsbDelegationHasExactKeys\(request, \['challengeId', 'task', 'type'\]\)/,
    'side-panel start input remains exact and provider-free'
  );
  assert.doesNotMatch(
    delegatedStart,
    /request\.(?:acceptedIdentity|providerId|adapterId|providerLabel|profileVersion|authState|billingKind|compatibility)/,
    'side-panel request fields never become provider or identity authority'
  );
  assert.match(
    delegatedStart,
    /acceptedIdentity: currentAuthority\.result\.acceptedIdentity/,
    'one-time challenge consumption receives the second preflight identity'
  );
  assert.match(
    delegatedStart,
    /\{ acceptedIdentity: consumedIdentity, task: request\.task \}/,
    'authenticated daemon start carries only consumed identity and task'
  );
  assert.doesNotMatch(
    delegatedStart,
    /\{\s*adapterId:/,
    'authenticated daemon start has no standalone provider selector'
  );

  const consumeOffset = delegatedStart.indexOf('consumeChallenge({');
  const consumedComparisonOffset = delegatedStart.indexOf(
    'fsbDelegationSameAcceptedIdentity(\n        consumedIdentity,'
  );
  const transportOffset = delegatedStart.indexOf("sendExtRequest(\n      'delegate.start'");
  const echoComparisonOffset = delegatedStart.indexOf(
    'fsbDelegationSameAcceptedIdentity(echoedIdentity, consumedIdentity)'
  );
  const controllerBootOffset = delegatedStart.indexOf(
    'controller = (await bootstrapDelegationController()).controller'
  );
  const controllerStartOffset = delegatedStart.indexOf('await controller.start({');
  assert(
    consumeOffset >= 0
      && consumeOffset < consumedComparisonOffset
      && consumedComparisonOffset < transportOffset,
    'consumed identity equality gates daemon transport'
  );
  assert(
    transportOffset < echoComparisonOffset
      && echoComparisonOffset < controllerBootOffset
      && controllerBootOffset < controllerStartOffset,
    'daemon echo equality gates controller creation and persistence'
  );
  assert.match(
    delegatedStart,
    /\['acceptedIdentity', 'delegationId'\]/,
    'started payload accepts exactly identity plus daemon delegation id'
  );
  assert.match(
    delegatedStart,
    /acceptedIdentity: echoedIdentity/,
    'controller persists only the exact daemon-confirmed identity'
  );

  const forbiddenRequestAuthority = /acceptedIdentity|providerId|providerLabel|profileVersion|authState|billingKind|compatibility|billingOverride/;
  for (const messageType of [
    'FSB_DELEGATION_PREFLIGHT',
    'FSB_DELEGATION_CONSENT',
    'FSB_DELEGATION_START'
  ]) {
    assert.doesNotMatch(
      sentDelegationRequestSource(messageType),
      forbiddenRequestAuthority,
      `${messageType} side-panel request remains intent-only`
    );
  }
}

async function main() {
  if (SELECTED_SECTION === 'codex-auth-preflight') {
    runCodexAuthPreflightContract();
    console.log('delegation-routing.test.js: PASS');
    return;
  }
  if (SELECTED_SECTION === 'immediate-start-identity') {
    runImmediateStartIdentityContract();
    console.log('delegation-routing.test.js: PASS');
    return;
  }
  const engine = require(enginePath);
  const legacyModes = {
    autopilot: {
      name: 'autopilot',
      description: 'User-initiated automation from popup or sidepanel',
      safetyLimits: { maxIterations: 500, costLimit: 2, timeLimit: 600000 },
      uiFeedbackChannel: 'popup-sidepanel',
      animatedHighlights: true
    },
    'mcp-manual': {
      name: 'mcp-manual',
      description: 'Single tool execution via MCP server (Claude Code / IDE)',
      safetyLimits: { maxIterations: 1, costLimit: 0.5, timeLimit: 60000 },
      uiFeedbackChannel: 'mcp-response',
      animatedHighlights: false
    },
    'mcp-agent': {
      name: 'mcp-agent',
      description: 'Multi-step automation triggered by MCP run_automation tool',
      safetyLimits: { maxIterations: 500, costLimit: 2, timeLimit: 600000 },
      uiFeedbackChannel: 'mcp-progress',
      animatedHighlights: true
    },
    'dashboard-remote': {
      name: 'dashboard-remote',
      description: 'Remote automation triggered from dashboard UI',
      safetyLimits: { maxIterations: 500, costLimit: 2, timeLimit: 600000 },
      uiFeedbackChannel: 'dashboard-ws',
      animatedHighlights: true
    }
  };

  assert.deepEqual(Object.keys(engine.EXECUTION_MODES), [
    'autopilot', 'mcp-manual', 'mcp-agent', 'dashboard-remote', 'delegated'
  ], 'delegated is exactly the fifth named execution mode');
  for (const [name, expected] of Object.entries(legacyModes)) {
    assert.deepEqual(engine.EXECUTION_MODES[name], expected, `${name} remains contract-compatible`);
  }
  assert.deepEqual(engine.EXECUTION_MODES.delegated, {
    name: 'delegated',
    description: 'Local agent provider driving FSB browser tools',
    safetyLimits: { wallClockMs: 2700000, eventSilenceMs: 120000 },
    uiFeedbackChannel: 'popup-sidepanel',
    animatedHighlights: true
  });
  assert.equal(
    Object.prototype.hasOwnProperty.call(engine.EXECUTION_MODES.delegated.safetyLimits, 'maxIterations'),
    false,
    'delegated safety is watchdog-bounded rather than iteration-bounded'
  );
  assert.equal(engine.getMode('delegated'), engine.EXECUTION_MODES.delegated);

  let stored = {};
  const writes = [];
  globalThis.chrome = {
    storage: {
      local: {
        async get() { return clone(stored); },
        async set(update) { writes.push(clone(update)); }
      },
      onChanged: { addListener() {} }
    }
  };
  delete require.cache[require.resolve(configPath)];
  const { Config } = require(configPath);
  const defaults = new Config().defaults;
  assert.equal(defaults.providerKind, 'api');
  assert.equal(defaults.agentProviderId, '');
  assert.equal(Object.prototype.hasOwnProperty.call(defaults, 'delegationTrusted'), false,
    'general config has no delegation trust authority');

  stored = {
    providerKind: 'api',
    agentProviderId: '',
    modelProvider: 'anthropic',
    modelName: 'claude-sonnet-4-6'
  };
  let loaded = await new Config().loadFromStorage();
  assert.equal(loaded.providerKind, 'api');
  assert.equal(loaded.agentProviderId, '', 'canonical legacy empty string is not rewritten');
  assert.equal(writes.length, 0, 'loading canonical provider settings performs no write-back');

  stored = {
    providerKind: 'api',
    agentProviderId: 'claude-code',
    modelProvider: 'openrouter',
    modelName: 'openai/gpt-4o'
  };
  loaded = await new Config().loadFromStorage();
  assert.equal(loaded.agentProviderId, 'claude-code', 'a latent agent choice survives API-kind loading');
  assert.equal(writes.length, 0, 'latent provider compatibility performs no write-back');

  const classicContext = { Object };
  classicContext.globalThis = classicContext;
  vm.runInNewContext(`${delegationProvidersSource}\n${preflightSource}`, classicContext, {
    filename: 'delegation-preflight.js'
  });
  const preflight = classicContext.FsbDelegationPreflight;
  assert.ok(preflight);
  assert.equal(Object.isFrozen(preflight), true);
  assert.deepEqual(Object.keys(preflight), ['check']);

  const acceptedIdentityInput = clone(CLAUDE_ACCEPTED_IDENTITY);
  const acceptedIdentityResult = preflight.check({
    providerKind: 'agent',
    agentProviderId: 'claude-code',
    modelProvider: 'anthropic',
    bridgeState: bridgeState(),
    compatibility: supportedCompatibility(),
    acceptedIdentity: acceptedIdentityInput
  });
  assert.deepEqual(clone(acceptedIdentityResult), {
    ok: true,
    kind: 'agent',
    providerId: 'claude-code',
    providerLabel: 'Claude Code',
    acceptedIdentity: CLAUDE_ACCEPTED_IDENTITY
  }, 'preflight returns the complete validator-approved identity');
  assert.equal(Object.isFrozen(acceptedIdentityResult.acceptedIdentity), true,
    'accepted identity is immutable before the first asynchronous boundary');
  assert.notEqual(acceptedIdentityResult.acceptedIdentity, acceptedIdentityInput,
    'preflight never adopts a caller-owned identity record');
  acceptedIdentityInput.profileVersion = 'changed-after-check';
  assert.equal(acceptedIdentityResult.acceptedIdentity.profileVersion, '2.1.177',
    'caller mutation cannot relabel an accepted preflight');

  const nullPrototypeIdentity = Object.assign(Object.create(null), CLAUDE_ACCEPTED_IDENTITY);
  assert.deepEqual(clone(preflight.check({
    providerKind: 'agent',
    agentProviderId: 'claude-code',
    modelProvider: 'anthropic',
    bridgeState: bridgeState(),
    compatibility: supportedCompatibility(),
    acceptedIdentity: nullPrototypeIdentity
  }).acceptedIdentity), CLAUDE_ACCEPTED_IDENTITY,
  'a complete null-prototype transport record is reconstructed safely');

  let accessorReads = 0;
  const accessorIdentity = clone(CLAUDE_ACCEPTED_IDENTITY);
  Object.defineProperty(accessorIdentity, 'authState', {
    enumerable: true,
    get() {
      accessorReads += 1;
      return 'unknown';
    }
  });
  const inheritedIdentity = Object.assign(
    Object.create({ inherited: true }),
    CLAUDE_ACCEPTED_IDENTITY
  );
  const symbolIdentity = clone(CLAUDE_ACCEPTED_IDENTITY);
  symbolIdentity[Symbol('identity-extra')] = true;
  for (const acceptedIdentity of [
    undefined,
    null,
    {},
    { ...CLAUDE_ACCEPTED_IDENTITY, extra: true },
    Object.fromEntries(Object.entries(CLAUDE_ACCEPTED_IDENTITY)
      .filter(([key]) => key !== 'profileVersion')),
    { ...CLAUDE_ACCEPTED_IDENTITY, providerId: 'opencode' },
    { ...CLAUDE_ACCEPTED_IDENTITY, label: 'Claude' },
    { ...CLAUDE_ACCEPTED_IDENTITY, profileVersion: '' },
    { ...CLAUDE_ACCEPTED_IDENTITY, authState: 'unauthenticated', billingKind: 'unknown' },
    { ...CLAUDE_ACCEPTED_IDENTITY, authState: 'chatgpt' },
    { ...CLAUDE_ACCEPTED_IDENTITY, billingKind: 'api' },
    accessorIdentity,
    inheritedIdentity,
    symbolIdentity
  ]) {
    assert.deepEqual(clone(preflight.check({
      providerKind: 'agent',
      agentProviderId: 'claude-code',
      modelProvider: 'anthropic',
      bridgeState: bridgeState(),
      compatibility: supportedCompatibility(),
      acceptedIdentity
    })), {
      ok: false,
      code: 'provider_status_refresh',
      providerId: 'claude-code',
      providerLabel: 'Claude Code'
    }, 'missing, partial, stale, hostile, or non-runnable identity fails closed');
  }
  assert.equal(accessorReads, 0, 'preflight validation never invokes identity accessors');

  const forbiddenRequestAuthority = /acceptedIdentity|providerId|providerLabel|profileVersion|authState|billingKind|compatibility|billingOverride/;
  for (const messageType of [
    'FSB_DELEGATION_PREFLIGHT',
    'FSB_DELEGATION_CONSENT',
    'FSB_DELEGATION_START'
  ]) {
    assert.doesNotMatch(
      sentDelegationRequestSource(messageType),
      forbiddenRequestAuthority,
      `${messageType} side-panel request carries intent only`
    );
  }

  const futureConsentUiContract = Object.freeze({
    allowed: '{CLI} may drive FSB browser tools for this task.',
    forbidden: 'It cannot edit files, run shell commands, or fetch arbitrary URLs.',
    trust: 'Trust {CLI} for future runs',
    trustExplanation: 'This turns off confirmation for future {CLI} runs on this browser. You can restore confirmation in Providers.'
  });
  assert.deepEqual(futureConsentUiContract, {
    allowed: '{CLI} may drive FSB browser tools for this task.',
    forbidden: 'It cannot edit files, run shell commands, or fetch arbitrary URLs.',
    trust: 'Trust {CLI} for future runs',
    trustExplanation: 'This turns off confirmation for future {CLI} runs on this browser. You can restore confirmation in Providers.'
  }, 'future UI fixture pins the approved safety scope and confirmation restore promise');
  assert.doesNotMatch(JSON.stringify(futureConsentUiContract), /\b(?:faster|free|unlimited)\b/i);

  const apiProviders = ['xai', 'gemini', 'openai', 'anthropic', 'openrouter', 'lmstudio', 'custom'];
  for (const modelProvider of apiProviders) {
    for (const agentProviderId of ['', 'claude-code', 'codex']) {
      const input = {
        providerKind: 'api',
        agentProviderId,
        modelProvider,
        bridgeState: bridgeState()
      };
      const before = clone(input);
      assert.deepEqual(clone(preflight.check(input)), {
        ok: true,
        kind: 'api',
        providerId: modelProvider,
        agentProviderId: ''
      }, `${modelProvider} stays on the API namespace with an inactive agent selection`);
      assert.deepEqual(input, before, 'preflight never mutates provider settings');
    }
  }

  const readyInput = {
    providerKind: 'agent',
    agentProviderId: 'claude-code',
    modelProvider: 'anthropic',
    bridgeState: bridgeState(),
    compatibility: supportedCompatibility(),
    acceptedIdentity: clone(CLAUDE_ACCEPTED_IDENTITY)
  };
  assert.deepEqual(clone(preflight.check(readyInput)), {
    ok: true,
    kind: 'agent',
    providerId: 'claude-code',
    providerLabel: 'Claude Code',
    acceptedIdentity: CLAUDE_ACCEPTED_IDENTITY
  });
  assert.deepEqual(clone(preflight.check({
    ...readyInput,
    bridgeState: bridgeState({ connected: false, status: 'disconnected' })
  })), {
    ok: false,
    code: 'agent_offline',
    providerId: 'claude-code',
    providerLabel: 'Claude Code'
  });
  assert.deepEqual(clone(preflight.check({
    ...readyInput,
    bridgeState: bridgeState({ delegationConnection: { state: 'disconnected' } })
  })), {
    ok: false,
    code: 'agent_offline',
    providerId: 'claude-code',
    providerLabel: 'Claude Code'
  });
  assert.deepEqual(clone(preflight.check({
    ...readyInput,
    bridgeState: bridgeState({ pairingStatus: 'configured' })
  })), {
    ok: false,
    code: 'agent_unpaired',
    providerId: 'claude-code',
    providerLabel: 'Claude Code'
  });

  assert.deepEqual(clone(preflight.check({
    ...readyInput,
    agentProviderId: 'opencode',
    acceptedIdentity: clone(OPENCODE_ACCEPTED_IDENTITY)
  })), {
    ok: true,
    kind: 'agent',
    providerId: 'opencode',
    providerLabel: 'OpenCode',
    acceptedIdentity: OPENCODE_ACCEPTED_IDENTITY
  }, 'OpenCode enters delegated mode only with canonical compatibility evidence');

  for (const compatibility of [
    undefined,
    { status: 'degraded', reason: 'evidence_stale', checkedAt: 100 },
    { status: 'unsupported', reason: 'wrong_major', checkedAt: 100 },
    { status: 'supported', reason: 'within_tested_range', checkedAt: 100, extra: true },
    Object.assign(Object.create({ status: 'supported' }), {
      reason: 'within_tested_range', checkedAt: 100
    })
  ]) {
    const result = clone(preflight.check({ ...readyInput, compatibility }));
    assert.equal(result.ok, false, 'missing, stale, unsupported, or malformed evidence fails closed');
    assert.equal(result.code, 'unsupported_provider');
  }

  for (const agentProviderId of [
    '', 'Claude-Code', 'CLAUDE-CODE', 'OpenCode', 'OPENCode', 'anthropic', '__proto__', 'constructor'
  ]) {
    const result = clone(preflight.check({
      providerKind: 'agent',
      agentProviderId,
      modelProvider: 'xai',
      bridgeState: bridgeState(),
      compatibility: supportedCompatibility()
    }));
    assert.equal(result.ok, false, `${agentProviderId || 'empty'} cannot enter delegated mode`);
    assert.equal(result.code, 'unsupported_provider');
  }
  for (const input of [
    {},
    { providerKind: 'delegated', agentProviderId: 'claude-code', modelProvider: 'xai', compatibility: supportedCompatibility() },
    { providerKind: 'api', agentProviderId: '', modelProvider: 'claude-code' },
    { providerKind: 'agent', agentProviderId: 'xai', modelProvider: 'xai', compatibility: supportedCompatibility() },
    Object.create({
      providerKind: 'agent', agentProviderId: 'claude-code', modelProvider: 'xai',
      compatibility: supportedCompatibility()
    })
  ]) {
    const result = clone(preflight.check(input));
    assert.equal(result.ok, false, 'namespace confusion and inherited authority fail closed');
    assert.equal(result.code, 'unsupported_provider');
  }

  const dispositionCodes = new Set();
  for (const state of [
    bridgeState(),
    bridgeState({ connected: false, status: 'disconnected' }),
    bridgeState({ pairingStatus: 'configured' })
  ]) {
    const result = clone(preflight.check({ ...readyInput, bridgeState: state }));
    if (!result.ok) dispositionCodes.add(result.code);
  }
  dispositionCodes.add(clone(preflight.check({
    providerKind: 'agent', agentProviderId: 'codex', modelProvider: 'xai',
    bridgeState: bridgeState(), compatibility: supportedCompatibility()
  })).code);
  assert.deepEqual([...dispositionCodes].sort(), [
    'agent_offline', 'agent_unpaired', 'provider_status_refresh'
  ]);

  for (const forbidden of [
    /\bchrome\b/,
    /\bstorage\b/,
    /\bruntime\b/,
    /\btabs\b/,
    /\bdocument\b/,
    /\bwindow\b/,
    /sendMessage/,
    /sendExtRequest/,
    /query\s*\(/,
    /\bchat\b/,
    /\bcomposer\b/,
    /\bsession\b/
  ]) {
    assert.doesNotMatch(preflightSource, forbidden,
      `pure preflight excludes ${String(forbidden)}`);
  }
  assert.doesNotMatch(preflightSource, /consentGranted|trusted\s*===\s*true/,
    'preflight accepts no caller consent or trust boolean');

  delete globalThis.chrome;
  console.log('delegation-routing.test.js: PASS');
}

main().catch((error) => {
  delete globalThis.chrome;
  console.error('delegation-routing.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
