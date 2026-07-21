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
const delegationProvidersSource = fs.readFileSync(delegationProvidersPath, 'utf8');
const preflightSource = fs.readFileSync(preflightPath, 'utf8');

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

async function main() {
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
    compatibility: supportedCompatibility()
  };
  assert.deepEqual(clone(preflight.check(readyInput)), {
    ok: true,
    kind: 'agent',
    providerId: 'claude-code',
    providerLabel: 'Claude Code'
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
    agentProviderId: 'opencode'
  })), {
    ok: true,
    kind: 'agent',
    providerId: 'opencode',
    providerLabel: 'OpenCode'
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
    '', 'Claude-Code', 'CLAUDE-CODE', 'OpenCode', 'OPENCode', 'codex', 'anthropic', '__proto__', 'constructor'
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
    'agent_offline', 'agent_unpaired', 'unsupported_provider'
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
