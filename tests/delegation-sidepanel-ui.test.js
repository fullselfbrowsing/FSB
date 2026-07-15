'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class TestNode {
  constructor(tagName, text) {
    this.tagName = tagName ? String(tagName).toUpperCase() : null;
    this.nodeType = this.tagName ? 1 : 3;
    this.parentNode = null;
    this.children = [];
    this.attributes = Object.create(null);
    this.className = '';
    this.id = '';
    this.open = false;
    this._text = text === undefined ? '' : String(text);
    this._listeners = Object.create(null);
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] === undefined ? null : this.attributes[name];
  }

  addEventListener(type, listener) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(listener);
  }

  dispatch(type) {
    (this._listeners[type] || []).forEach((listener) => listener.call(this, { type, target: this }));
  }

  get firstChild() {
    return this.children[0] || null;
  }

  set textContent(value) {
    this.children.length = 0;
    this._text = String(value);
  }

  get textContent() {
    return this._text + this.children.map((child) => child.textContent).join('');
  }
}

globalThis.document = {
  createElement(tag) {
    return new TestNode(tag);
  },
  createTextNode(text) {
    return new TestNode(null, text);
  }
};

const Feed = require('../extension/ui/delegation-feed.js');

const DELEGATION_ID = 'delegation_fixture';

function entry(sequence, kind, payload) {
  const base = {
    v: 1,
    delegationId: DELEGATION_ID,
    sequence,
    timestamp: 1000 + sequence,
    kind,
    state: kind === 'result' ? 'completed' : 'running',
    title: 'presentation string that must not be parsed',
    detail: null,
    init: null,
    tool: null,
    retry: null,
    metrics: null
  };
  const payloadKey = kind === 'tool-call' ? 'tool' : (kind === 'result' ? 'metrics' : kind);
  base[payloadKey] = payload;
  return base;
}

function metrics(overrides) {
  return Object.assign({
    inputTokens: 11,
    outputTokens: 7,
    totalTokens: 18,
    turns: 3,
    durationMs: 900,
    billingKind: 'subscription',
    usd: null,
    toolCalls: [{ name: 'mcp__fsb__read_page', count: 2 }]
  }, overrides || {});
}

function summary(overrides) {
  return Object.assign(metrics(), { state: 'completed' }, overrides || {});
}

function snapshot(overrides) {
  const entries = [
    entry(1, 'init', {
      client: { id: 'claude-code', label: 'Claude Code' },
      profileVersion: '2.1.177',
      model: 'claude-sonnet',
      sessionId: 'session_fixture',
      allowedTools: ['mcp__fsb']
    }),
    entry(2, 'tool-call', {
      callId: 'call_fixture',
      name: 'mcp__fsb__read_page',
      tabId: 42,
      argsSummary: 'current tab',
      status: 'succeeded',
      durationMs: 150
    }),
    entry(3, 'retry', {
      class: 'api_retry',
      attempt: 1,
      maxAttempts: 3,
      delayMs: 250
    }),
    entry(4, 'result', metrics())
  ];
  return Object.assign({
    v: 1,
    delegationId: DELEGATION_ID,
    provider: { id: 'claude-code', label: 'Claude Code' },
    state: 'completed',
    connection: 'connected',
    entries,
    summary: summary(),
    activeTab: null,
    hold: null,
    terminal: { code: 'completed', releasedTabCount: 0 },
    hydrated: true
  }, overrides || {});
}

function findAll(root, tagName) {
  const wanted = String(tagName).toUpperCase();
  const found = [];
  (function visit(node) {
    if (node.tagName === wanted) found.push(node);
    node.children.forEach(visit);
  })(root);
  return found;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function extractNamedFunction(source, name) {
  const anchor = 'function ' + name + '(';
  const anchorStart = source.indexOf(anchor);
  assert(anchorStart >= 0, name + ' source anchor exists');
  const start = source.slice(Math.max(0, anchorStart - 6), anchorStart) === 'async '
    ? anchorStart - 6
    : anchorStart;
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index++) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error('unbalanced function source for ' + name);
}

console.log('\n--- Phase 61 delegation feed contract ---');

{
  const canonical = snapshot();
  assert.equal(Feed.validateSnapshot(canonical), true, 'canonical snapshot validates');

  const extraSnapshot = clone(canonical);
  extraSnapshot.rawProviderEvent = '<script>secret()</script>';
  assert.equal(Feed.validateSnapshot(extraSnapshot), false, 'snapshot rejects extra keys');

  const extraNested = clone(canonical);
  extraNested.entries[1].tool.rawArgs = { secret: true };
  assert.equal(Feed.validateSnapshot(extraNested), false, 'typed payload rejects extra keys');

  const mixedPayload = clone(canonical);
  mixedPayload.entries[1].retry = { class: 'api_retry', attempt: 1, maxAttempts: 2, delayMs: 1 };
  assert.equal(Feed.validateSnapshot(mixedPayload), false, 'kind/payload exclusivity is closed');

  const unknownEnum = clone(canonical);
  unknownEnum.entries[1].tool.status = 'probably_done';
  assert.equal(Feed.validateSnapshot(unknownEnum), false, 'unknown tool status is rejected');

  const sequenceGap = clone(canonical);
  sequenceGap.entries[2].sequence = 9;
  assert.equal(Feed.validateSnapshot(sequenceGap), false, 'snapshot rejects reordered or gapped rows');

  const unknownTerminal = clone(canonical);
  unknownTerminal.terminal.code = 'provider_said_maybe';
  assert.equal(Feed.validateSnapshot(unknownTerminal), false, 'terminal classification is closed');
}

{
  const container = new TestNode('div');
  const rendered = Feed.render(container, snapshot(), { hydrated: true });
  assert.deepEqual(rendered, { ok: true, lastSequence: 4, hydrated: true });
  const articles = findAll(container, 'article');
  assert.equal(articles.length, 5, 'four entries plus one summary render as articles');
  assert.deepEqual(
    articles.slice(0, 4).map((node) => node.getAttribute('data-delegation-sequence')),
    ['1', '2', '3', '4'],
    'persisted entry order is unchanged'
  );
  const text = container.textContent;
  [
    'Claude Code', '2.1.177', 'claude-sonnet', 'session_fixture', 'mcp__fsb',
    'mcp__fsb__read_page', 'current tab', '42', 'succeeded', '150 ms',
    'api_retry', '250 ms', '11', '7', '18', '3', '900 ms',
    'Included in your subscription', 'Show tool-call breakdown'
  ].forEach((value) => assert(text.includes(value), 'renderer exposes typed field: ' + value));
  assert(!text.includes('presentation string that must not be parsed'),
    'typed cards do not parse or substitute presentation title data');

  const details = findAll(container, 'details')[0];
  const disclosure = findAll(details, 'summary')[0];
  details.open = true;
  details.dispatch('toggle');
  assert.equal(disclosure.textContent, 'Hide tool-call breakdown');
  details.open = false;
  details.dispatch('toggle');
  assert.equal(disclosure.textContent, 'Show tool-call breakdown');
}

{
  const hostile = snapshot();
  hostile.entries[0].init.model = '<img src=x onerror=globalThis.pwned=true>';
  hostile.entries[1].tool.name = 'javascript:alert(1)';
  hostile.entries[1].tool.argsSummary = '<svg onload=steal()>https://evil.invalid/?secret=1</svg>';
  hostile.entries[2].retry.class = 'transport_retry';
  const container = new TestNode('div');
  assert.equal(Feed.render(container, hostile, { hydrated: false }).ok, true);
  assert(container.textContent.includes('<img src=x onerror=globalThis.pwned=true>'));
  assert(container.textContent.includes('<svg onload=steal()>https://evil.invalid/?secret=1</svg>'));
  const allNodes = findAll(container, 'article').concat(findAll(container, 'dd'));
  allNodes.forEach((node) => {
    assert.equal(node.getAttribute('href'), null, 'event data never becomes href');
    assert.equal(node.getAttribute('src'), null, 'event data never becomes src');
    assert.equal(node.getAttribute('style'), null, 'event data never becomes inline style');
    assert.equal(node.getAttribute('onerror'), null, 'event data never becomes handler');
  });
  assert.equal(globalThis.pwned, undefined, 'hostile metadata remains inert text');
}

{
  const missing = snapshot();
  missing.entries[0].init = {
    client: null,
    profileVersion: null,
    model: null,
    sessionId: null,
    allowedTools: []
  };
  missing.entries[1].tool.callId = null;
  missing.entries[1].tool.tabId = null;
  missing.entries[1].tool.argsSummary = null;
  missing.entries[1].tool.durationMs = null;
  missing.summary = summary({
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    turns: null,
    durationMs: null,
    billingKind: 'unknown',
    usd: null,
    toolCalls: []
  });
  const container = new TestNode('div');
  assert.equal(Feed.render(container, missing, {}).ok, true);
  assert(container.textContent.includes('Not reported'), 'missing nullable fields are explicit');

  const api = Feed.renderSummary(summary({ billingKind: 'api', usd: 1.25 }));
  assert(api.textContent.includes('$1.2500 USD'), 'real API USD is shown only for API billing');
  assert(!api.textContent.includes('Included in your subscription'));
}

console.log('\n--- Phase 61 side-panel source and accessibility tripwires ---');

const root = path.resolve(__dirname, '..');
const feedSource = fs.readFileSync(path.join(root, 'extension/ui/delegation-feed.js'), 'utf8');
const panelSource = fs.readFileSync(path.join(root, 'extension/ui/sidepanel.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'extension/ui/sidepanel.html'), 'utf8');
const cssSource = fs.readFileSync(path.join(root, 'extension/ui/sidepanel.css'), 'utf8');

assert(!/innerHTML|insertAdjacentHTML|\.href\s*=|\.src\s*=|setAttribute\(['"](?:href|src|style|on\w+)/.test(feedSource),
  'delegation renderer has no HTML, URL, inline-style, or handler sink');
assert(feedSource.includes('textContent') && feedSource.includes('createTextNode'),
  'delegation renderer uses only text DOM construction');
assert(panelSource.includes("message.type !== 'FSB_DELEGATION_UPDATED'"),
  'side panel accepts only the canonical runtime update type');
assert(panelSource.includes("_delegationHasExactKeys(message, ['announceSequence', 'snapshot', 'type'])"),
  'runtime message shape is exact');
assert(panelSource.includes('snapshot.delegationId !== _delegationUiState.delegationId'),
  'updates for every non-selected delegation id are ignored');
assert(panelSource.includes("var deliveryKey = snapshot.delegationId + ':' + announceSequence"),
  'UI duplicate suppression is exact delegation-id/sequence identity');
assert.equal((htmlSource.match(/id="delegationAnnouncer"/g) || []).length, 1,
  'one delegated live announcer exists');
assert(/id="delegationAnnouncer"[\s\S]*?role="status"[\s\S]*?aria-live="polite"[\s\S]*?aria-atomic="false"/.test(htmlSource),
  'delegation announcer uses one polite non-atomic status region');
assert(htmlSource.indexOf('delegation-feed.js') < htmlSource.indexOf('sidepanel.js'),
  'feed renderer loads before side-panel integration');
assert(cssSource.includes('@media (max-width: 350px)') && cssSource.includes('@media (min-width: 500px)'),
  'narrow and wide responsive contracts are source-pinned');
assert(cssSource.includes('[data-theme="dark"] .delegation-state-card')
    && cssSource.includes('var(--fsb-surface-elevated)'),
  'dark mode reuses shared theme variables');
assert(cssSource.includes('.delegation-action:focus-visible')
    && cssSource.includes('var(--fsb-focus-ring)'),
  'new actions have a visible token-backed focus ring');
assert(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none !important[\s\S]*?transition: none !important/.test(cssSource),
  'reduced-motion removes delegation animation and transition');

console.log('\n--- Phase 61 consent and human-control contract ---');

[
  'Let ' + 'Claude Code' + ' control this browser?',
  'Claude Code may drive FSB browser tools for this task.',
  'It cannot edit files, run shell commands, or fetch arbitrary URLs.',
  'Allow & start ' + 'Claude Code',
  'Back to message',
  'Trust ' + 'Claude Code' + ' for future runs',
  'This turns off confirmation for future ' + 'Claude Code' + ' runs on this browser. You can restore confirmation in Providers.',
  'Delegate a browser task',
  'Choose an agent provider, describe the outcome, and FSB will run it in a background tab.',
  'Take control',
  'You have control of this tab',
  'Resume with agent',
  'Stop agent',
  'Agent could not resume control',
  'FSB could not return this tab to Claude Code, so the run ended and the tab remains under your control. Start a new task when you are ready.',
  'Agent could not finish this task',
  'Claude Code stopped before the task was complete. Review the error details, then try the same message again.'
].forEach((copy) => assert(panelSource.includes(copy), 'exact delegated copy is pinned: ' + copy));

const delegationUiSource = panelSource.slice(
  panelSource.indexOf('var _delegationUiState = {'),
  panelSource.indexOf('let automationTimerInterval = null;')
);
assert(!/faster mode|\bfree\b|unlimited/i.test(delegationUiSource),
  'delegation UI makes no faster/free/unlimited marketing claim');
assert(panelSource.includes("type: 'FSB_DELEGATION_PREFLIGHT'")
    && panelSource.includes("type: 'FSB_DELEGATION_CONSENT'")
    && panelSource.includes("type: 'FSB_DELEGATION_SET_TRUST'")
    && panelSource.includes("type: 'FSB_DELEGATION_START'")
    && panelSource.includes("type: 'FSB_DELEGATION_TAKE_CONTROL'")
    && panelSource.includes("type: 'FSB_DELEGATION_RESUME'")
    && panelSource.includes("type: 'FSB_DELEGATION_STOP'")
    && panelSource.includes("type: 'FSB_DELEGATION_SNAPSHOT'"),
  'side panel routes every delegated action through the closed background commands');
assert(!/FSB_DELEGATION_START[\s\S]{0,180}(?:trusted|consentGranted|consent\s*:)/.test(panelSource),
  'START carries no caller trust or consent boolean');
assert(panelSource.includes("if ((_delegationUiState.pendingTake && message.snapshot.state === 'holding')")
    && panelSource.includes("(_delegationUiState.pendingResume && message.snapshot.state === 'resuming')"),
  'intermediate hold/resume snapshots retain the prior truthful focused control');
assert(panelSource.includes("if (changes.fsbAgentRegistry && typeof _refreshSelectedDelegationSnapshot === 'function')")
    && panelSource.includes('_refreshSelectedDelegationSnapshot();')
    && panelSource.includes('await _refreshSelectedDelegationSnapshot();'),
  'registry and active-tab events refresh controller-owned eligibility without UI ownership reads');
const consentRenderSource = extractNamedFunction(panelSource, '_renderDelegationConsent');
assert(!/checkbox\.addEventListener|addEventListener\(['"]change/.test(consentRenderSource),
  'changing the trust checkbox alone performs no authority write');
assert(consentRenderSource.includes('heading.tabIndex = -1')
    && consentRenderSource.includes("options.focusHeading === true"),
  'consent focus lands programmatically on its heading');
assert(/e\.key === 'Escape'[\s\S]{0,120}_backToDelegationMessage\(\)/.test(panelSource),
  'Escape follows the same non-starting consent back path');

(async function runInteractionContract() {
  {
    const context = { _activeTabIdSnapshot: 42 };
    vm.createContext(context);
    vm.runInContext(extractNamedFunction(panelSource, '_delegationCanTakeControl'), context);
    const exact = { state: 'running', activeTab: { tabId: 42, owned: true, canTakeControl: true } };
    assert.equal(context._delegationCanTakeControl(exact), true,
      'Take control appears for the exact canonical active owned tab');
    assert.equal(context._delegationCanTakeControl({ ...exact, activeTab: { ...exact.activeTab, owned: false } }), false,
      'Take control hides for an unowned tab');
    assert.equal(context._delegationCanTakeControl({ ...exact, activeTab: { ...exact.activeTab, tabId: 43 } }), false,
      'Take control hides for a different active tab');
    assert.equal(context._delegationCanTakeControl({ ...exact, state: 'holding' }), false,
      'Take control hides outside canonical running');
  }

  {
    let resolveCommand;
    const commands = [];
    const renders = [];
    const running = { delegationId: DELEGATION_ID, state: 'running' };
    const held = { delegationId: DELEGATION_ID, state: 'held' };
    const state = { snapshot: running, pendingTake: false, errorCode: null };
    const context = {
      _delegationUiState: state,
      _delegationCanTakeControl: () => true,
      _sendDelegationCommand(message) {
        commands.push(clone(message));
        return new Promise((resolve) => { resolveCommand = resolve; });
      },
      _delegationValidLifecycleResponse: () => true,
      FsbDelegationFeed: { validateSnapshot: () => true },
      _renderDelegationSnapshot(next, options) { renders.push({ next, options }); }
    };
    vm.createContext(context);
    vm.runInContext(extractNamedFunction(panelSource, '_takeDelegationControl'), context);
    const button = { disabled: false, focusCount: 0, focus() { this.focusCount += 1; } };
    const pending = context._takeDelegationControl({ currentTarget: button });
    assert.deepEqual(commands, [{ type: 'FSB_DELEGATION_TAKE_CONTROL', delegationId: DELEGATION_ID }]);
    assert.equal(state.pendingTake, true);
    assert.equal(button.disabled, true);
    assert.equal(button.focusCount, 1);
    assert.equal(renders.length, 0, 'Take control renders no held state before authority replies');
    resolveCommand({ ok: true, snapshot: held });
    await pending;
    assert.equal(state.pendingTake, false);
    assert.equal(renders.length, 1);
    assert.equal(renders[0].options.focusAction, 'resume',
      'confirmed hold moves focus to Resume with agent');
  }

  {
    let resolveCommand;
    const commands = [];
    const renders = [];
    const held = { delegationId: DELEGATION_ID, state: 'held' };
    const running = { delegationId: DELEGATION_ID, state: 'running' };
    const state = { snapshot: held, pendingResume: false, errorCode: null };
    const context = {
      _delegationUiState: state,
      _delegationCanResume: () => true,
      _sendDelegationCommand(message) {
        commands.push(clone(message));
        return new Promise((resolve) => { resolveCommand = resolve; });
      },
      _delegationValidLifecycleResponse: () => true,
      FsbDelegationFeed: { validateSnapshot: () => true },
      _renderDelegationSnapshot(next, options) { renders.push({ next, options }); }
    };
    vm.createContext(context);
    vm.runInContext(extractNamedFunction(panelSource, '_resumeDelegationControl'), context);
    const button = { disabled: false, focusCount: 0, focus() { this.focusCount += 1; } };
    const pending = context._resumeDelegationControl({ currentTarget: button });
    assert.deepEqual(commands, [{ type: 'FSB_DELEGATION_RESUME', delegationId: DELEGATION_ID }]);
    assert.equal(state.pendingResume, true);
    assert.equal(button.disabled, true);
    assert.equal(button.focusCount, 1);
    assert.equal(renders.length, 0, 'Resume renders no running state before authority replies');
    resolveCommand({ ok: true, snapshot: running });
    await pending;
    assert.equal(state.pendingResume, false);
    assert.equal(renders.length, 1);
    assert.equal(renders[0].options.focusAction, 'take',
      'confirmed ownership restoration returns focus to the contextual control');
  }

  {
    let resolveTrust;
    const commands = [];
    const starts = [];
    const state = {
      mode: 'consent', pendingTrust: false, pendingStart: false,
      errorCode: null, challengeId: 'dch_fixture'
    };
    const context = {
      _delegationUiState: state,
      _renderDelegationConsent() {},
      _sendDelegationCommand(message) {
        commands.push(clone(message));
        return new Promise((resolve) => { resolveTrust = resolve; });
      },
      _delegationValidTrustResponse: () => true,
      async _beginDelegationStart(challengeId) { starts.push(challengeId); }
    };
    vm.createContext(context);
    vm.runInContext(extractNamedFunction(panelSource, '_allowDelegationFromConsent'), context);
    const pending = context._allowDelegationFromConsent({ checked: true });
    assert.deepEqual(commands, [{
      type: 'FSB_DELEGATION_SET_TRUST',
      challengeId: 'dch_fixture',
      providerId: 'claude-code',
      trusted: true
    }]);
    assert.equal(starts.length, 0, 'checked trust does not start before trust authority succeeds');
    resolveTrust({ ok: true, providerId: 'claude-code', trusted: true });
    await pending;
    assert.deepEqual(starts, [null], 'trusted flow starts separately with a null caller challenge');

    state.mode = 'consent';
    state.challengeId = 'dch_second';
    commands.length = 0;
    starts.length = 0;
    await context._allowDelegationFromConsent({ checked: false });
    assert.deepEqual(commands, [], 'unchecked Allow writes no trust setting');
    assert.deepEqual(starts, ['dch_second'], 'unchecked Allow uses only its one-use challenge');
  }

  {
    let readyRenders = 0;
    let focuses = 0;
    const state = {
      pendingStart: false, pendingTrust: false, challengeId: 'dch',
      challengeExpiresAt: 123, errorCode: 'old', task: 'unchanged task'
    };
    const context = {
      _delegationUiState: state,
      _renderDelegationReadyState() { readyRenders += 1; },
      chatInput: { focus() { focuses += 1; } }
    };
    vm.createContext(context);
    vm.runInContext(extractNamedFunction(panelSource, '_backToDelegationMessage'), context);
    context._backToDelegationMessage();
    assert.equal(state.task, 'unchanged task', 'Back preserves the exact composer task');
    assert.equal(state.challengeId, null);
    assert.equal(readyRenders, 1);
    assert.equal(focuses, 1, 'Back restores composer focus');
  }

  console.log('delegation-sidepanel-ui: PASS');
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
