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
    this.disabled = false;
    this.focusCount = 0;
    this._text = text === undefined ? '' : String(text);
    this._listeners = Object.create(null);
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name)
    };
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

  removeAttribute(name) {
    delete this.attributes[name];
  }

  focus() {
    this.focusCount += 1;
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

function findByClass(root, className) {
  const found = [];
  (function visit(node) {
    const classes = String(node.className || '').split(/\s+/);
    if (classes.includes(className)) found.push(node);
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

  const allDetails = findAll(container, 'details');
  assert.equal(allDetails.length, 2,
    'each tool call and the aggregate breakdown use native disclosures');
  const toolDetails = findByClass(container, 'delegation-tool-call-details')[0];
  const toolDisclosure = findAll(toolDetails, 'summary')[0];
  assert.equal(toolDetails.open, false, 'tool call starts collapsed for scanability');
  assert.equal(toolDisclosure.textContent, 'mcp__fsb__read_page — succeeded',
    'collapsed tool disclosure names the call and canonical status');
  assert(toolDetails.textContent.includes('call_fixture')
      && toolDetails.textContent.includes('current tab')
      && toolDetails.textContent.includes('42')
      && toolDetails.textContent.includes('150 ms'),
    'expanded tool body retains call id, arguments, tab, and duration');

  const details = findByClass(container, 'delegation-tool-breakdown')[0];
  const disclosure = findAll(details, 'summary')[0];
  details.open = true;
  details.dispatch('toggle');
  assert.equal(disclosure.textContent, 'Hide tool-call breakdown');
  details.open = false;
  details.dispatch('toggle');
  assert.equal(disclosure.textContent, 'Show tool-call breakdown');

  findAll(container, 'i').forEach((icon) => {
    assert.equal(icon.getAttribute('aria-hidden'), 'true',
      'semantic icons are hidden from assistive technology beside explicit text');
  });

  const completedSummary = Feed.renderSummary(summary({ state: 'completed' }));
  const failedSummary = Feed.renderSummary(summary({ state: 'failed' }));
  const restartSummary = Feed.renderSummary(summary({ state: 'restart_lost' }));
  assert.equal(completedSummary.getAttribute('data-delegation-tone'), 'success');
  assert.equal(failedSummary.getAttribute('data-delegation-tone'), 'danger');
  assert.equal(restartSummary.getAttribute('data-delegation-tone'), 'danger');
  assert(completedSummary.className.includes('delegation-tone-success'));
  assert(failedSummary.className.includes('delegation-tone-danger'));
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
  const allNodes = findAll(container, 'article')
    .concat(findAll(container, 'summary'))
    .concat(findAll(container, 'dd'));
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
assert(cssSource.includes('[data-delegation-tone="success"]')
    && cssSource.includes('[data-delegation-tone="warning"]')
    && cssSource.includes('[data-delegation-tone="danger"]')
    && cssSource.includes('border-left: 4px solid var(--fsb-success)')
    && cssSource.includes('border-left: 4px solid var(--fsb-warning)')
    && cssSource.includes('border-left: 4px solid var(--fsb-danger)'),
  'closed state tones map to exact semantic color tokens');
assert(!/\.delegation-entry-tool-call\s*\{[^}]*var\(--fsb-primary\)/s.test(cssSource),
  'tool rows no longer spend the primary accent');
assert(cssSource.includes('color: var(--fsb-text-inverse);'),
  'primary delegation actions use the theme-aware inverse text token');
const delegationCss = cssSource.slice(cssSource.indexOf('.delegation-run {'));
assert(!/(?:gap|margin(?:-\w+)?|padding(?:-\w+)?)\s*:[^;]*(?:12px|18px)/.test(delegationCss),
  'Phase 61 layout spacing excludes off-scale 12px and 18px values');
assert(delegationCss.includes('var(--fsb-space-1)')
    && delegationCss.includes('var(--fsb-space-2)')
    && delegationCss.includes('var(--fsb-space-4)'),
  'Phase 61 layout reuses the approved shared spacing tokens');
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
  'Stopping agent…',
  'Agent offline',
  'FSB cannot reach the local agent service. Run the doctor command, then try this message again.',
  'Copy doctor command',
  'Open provider setup',
  'Agent connection lost',
  'FSB missed three replies from the local agent service. The run cannot continue safely.',
  'Agent run ended after daemon restart',
  'The previous agent process was stopped and was not reattached. Start a new task when the local service is ready.',
  'Start a new task',
  'Pair this browser before starting Claude Code',
  'FSB can reach the local agent service, but this browser has not been paired with it. Open provider setup, pair this browser, then try this message again.',
  'The selected provider does not support agents that control browser tabs. Choose a supported agent provider, then try this message again.',
  'Choose another provider',
  'Agent could not resume control',
  'FSB could not return this tab to Claude Code, so the run ended and the tab remains under your control. Start a new task when you are ready.',
  'Agent could not finish this task',
  'Claude Code stopped before the task was complete. Review the error details, then try the same message again.',
  'FSB could not save this agent run. A stop request was sent, and your message was kept. Try again.'
].forEach((copy) => assert(panelSource.includes(copy), 'exact delegated copy is pinned: ' + copy));
assert(panelSource.includes("+ ' cannot run browser tasks'"),
  'unsupported-provider heading retains the exact dynamic provider-label suffix');

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
    && panelSource.includes('await _hydrateDelegationForSelectedConversation();'),
  'registry and active-tab events refresh controller-owned eligibility without UI ownership reads');
const consentRenderSource = extractNamedFunction(panelSource, '_renderDelegationConsent');
assert(!/checkbox\.addEventListener|addEventListener\(['"]change/.test(consentRenderSource),
  'changing the trust checkbox alone performs no authority write');
assert(consentRenderSource.includes('heading.tabIndex = -1')
    && consentRenderSource.includes("options.focusHeading === true"),
  'consent focus lands programmatically on its heading');
assert(/e\.key === 'Escape'[\s\S]{0,120}_backToDelegationMessage\(\)/.test(panelSource),
  'Escape follows the same non-starting consent back path');

console.log('\n--- Phase 61 stop, recovery, and hydration contract ---');

assert(panelSource.includes("'fsbSidepanelDelegationConversations'")
    && panelSource.includes('DELEGATION_CONVERSATION_CAP = 50')
    && panelSource.includes('chrome.storage.session.get(DELEGATION_CONVERSATION_STORAGE_KEY)')
    && panelSource.includes('chrome.storage.session.set(payload)'),
  'conversation-to-delegation selection is bounded and session-scoped');
const hydrationSource = extractNamedFunction(panelSource, '_hydrateDelegationForSelectedConversation');
assert(hydrationSource.includes("type: 'FSB_DELEGATION_SNAPSHOT'")
    && hydrationSource.includes('delegationId: selectedDelegationId')
    && hydrationSource.indexOf('hydrated: true') < hydrationSource.lastIndexOf('_delegationUiState.subscribed = true'),
  'selected exact snapshot hydrates before the runtime subscription gate opens');
const startSource = extractNamedFunction(panelSource, '_beginDelegationStart');
assert(startSource.includes('bindingCommitted = await _writeDelegationConversationBinding(')
    && startSource.includes("type: 'FSB_DELEGATION_STOP'")
    && startSource.indexOf('if (!bindingCommitted)')
      < startSource.indexOf('_renderDelegationSnapshot(response.snapshot'),
  'conversation binding is part of start commit and exact Stop precedes any unbound run render');
assert(startSource.indexOf('_renderDelegationSnapshot(response.snapshot')
      < startSource.indexOf('await _refreshSelectedDelegationSnapshot()')
    && startSource.indexOf('await _refreshSelectedDelegationSnapshot()')
      < startSource.lastIndexOf('_delegationUiState.subscribed = true'),
  'accepted start catches up silently before opening its live subscription gate');
assert(panelSource.includes("mount.state.setAttribute('role', 'alert')")
    && panelSource.includes("mount.state.setAttribute('aria-live', 'off')"),
  'connectivity cards retain alert semantics while hydrated/unchanged alerts stay silent');
assert(panelSource.includes("announceSequence > previousLastSequence"),
  'only a strictly newer matching sequence reaches the polite announcer');
assert(panelSource.includes("return 'Agent stopped, ' + count + ' '")
    && panelSource.includes("count === 1 ? 'tab' : 'tabs'"),
  'stopped copy uses only the canonical release count with singular grammar');
assert(panelSource.includes("snapshot.state === 'stopping' ? 'Stopping agent…' : 'Stop agent'"),
  'stopping wording is selected only by the canonical stopping snapshot');
const doctorSource = extractNamedFunction(panelSource, '_copyDelegationDoctorCommand');
const setupSource = extractNamedFunction(panelSource, '_openDelegationProviderSetup');
assert(doctorSource.includes("var command = 'fsb-mcp-server doctor'")
    && doctorSource.includes('navigator.clipboard.writeText(command)')
    && setupSource.includes("openControlPanelSection('providers')"),
  'doctor recovery copies only the literal and opens only the local Providers section');
assert(!/sendMessage|nativeMessaging|exec\s*\(|restart/i.test(doctorSource + '\n' + setupSource),
  'doctor/setup actions cannot execute or restart a daemon, native host, or shell');

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
    const state = {
      snapshot: running,
      delegationId: DELEGATION_ID,
      conversationId: 'conv_fixture',
      pendingTake: false,
      errorCode: null
    };
    const context = {
      conversationId: 'conv_fixture',
      _delegationUiState: state,
      _delegationCanTakeControl: () => true,
      _delegationIsSelectedConversation: () => true,
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
    const state = {
      snapshot: held,
      delegationId: DELEGATION_ID,
      conversationId: 'conv_fixture',
      pendingResume: false,
      errorCode: null
    };
    const context = {
      conversationId: 'conv_fixture',
      _delegationUiState: state,
      _delegationCanResume: () => true,
      _delegationIsSelectedConversation: () => true,
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

  {
    const session = Object.create(null);
    let rejectBindingWrites = false;
    const context = {
      DELEGATION_CONVERSATION_CAP: 50,
      DELEGATION_CONVERSATION_STORAGE_KEY: 'fsbSidepanelDelegationConversations',
      DELEGATION_ID_PATTERN: /^[A-Za-z0-9_-]{8,128}$/,
      DELEGATION_CONVERSATION_ID_PATTERN: /^conv_[A-Za-z0-9_-]{1,250}$/,
      _delegationConversationEnvelope: { v: 1, byConversation: {}, lru: [] },
      _delegationBindingWriteChain: Promise.resolve(),
      chrome: {
        storage: {
          session: {
            async get(key) {
              return Object.hasOwn(session, key) ? { [key]: clone(session[key]) } : {};
            },
            async set(payload) {
              if (rejectBindingWrites) throw new Error('fixture binding storage rejection');
              Object.assign(session, clone(payload));
            }
          }
        }
      }
    };
    vm.createContext(context);
    [
      '_delegationHasExactKeys',
      '_delegationEmptyConversationEnvelope',
      '_delegationValidConversationId',
      '_delegationValidConversationEnvelope',
      '_delegationCloneConversationEnvelope',
      '_serializeDelegationBindingWrite',
      '_writeDelegationConversationBinding'
    ].forEach((name) => vm.runInContext(extractNamedFunction(panelSource, name), context));

    assert.equal(context._delegationValidConversationEnvelope({
      v: 1,
      byConversation: { conv_valid: DELEGATION_ID },
      lru: ['conv_valid']
    }), true, 'closed conversation binding envelope validates');
    assert.equal(context._delegationValidConversationEnvelope({
      v: 1,
      byConversation: { conv_valid: DELEGATION_ID },
      lru: ['conv_valid'],
      raw: true
    }), false, 'conversation binding rejects extra storage fields');

    for (let index = 0; index < 51; index += 1) {
      await context._writeDelegationConversationBinding(
        `conv_${index}`,
        `delegation_map_${index}`
      );
    }
    const envelope = session.fsbSidepanelDelegationConversations;
    assert.equal(envelope.lru.length, 50, 'conversation binding is capped at 50 rows');
    assert.equal(envelope.byConversation.conv_0, undefined, 'binding LRU evicts the oldest row');
    assert.equal(envelope.byConversation.conv_50, 'delegation_map_50', 'binding LRU retains newest row');

    rejectBindingWrites = true;
    assert.equal(
      await context._writeDelegationConversationBinding('conv_unbound', DELEGATION_ID),
      false,
      'session-storage rejection is a blocking binding failure',
    );
    assert.equal(envelope.byConversation.conv_unbound, undefined);

    const reloadContext = {
      DELEGATION_CONVERSATION_CAP: 50,
      DELEGATION_CONVERSATION_STORAGE_KEY: 'fsbSidepanelDelegationConversations',
      DELEGATION_ID_PATTERN: /^[A-Za-z0-9_-]{8,128}$/,
      DELEGATION_CONVERSATION_ID_PATTERN: /^conv_[A-Za-z0-9_-]{1,250}$/,
      _delegationConversationEnvelope: { v: 1, byConversation: {}, lru: [] },
      chrome: {
        storage: {
          session: {
            async get(key) {
              return Object.hasOwn(session, key) ? { [key]: clone(session[key]) } : {};
            }
          }
        }
      }
    };
    vm.createContext(reloadContext);
    [
      '_delegationHasExactKeys',
      '_delegationEmptyConversationEnvelope',
      '_delegationValidConversationId',
      '_delegationValidConversationEnvelope',
      '_delegationCloneConversationEnvelope',
      '_loadDelegationConversationEnvelope',
      '_delegationForConversation'
    ].forEach((name) => vm.runInContext(extractNamedFunction(panelSource, name), reloadContext));
    await reloadContext._loadDelegationConversationEnvelope();
    assert.equal(
      reloadContext._delegationForConversation('conv_unbound'),
      null,
      'reload discovers no hidden delegation after a rejected binding write',
    );
  }

  {
    const commands = [];
    const inlineErrors = [];
    const stateNode = new TestNode('div');
    let readyRenders = 0;
    let acceptedRenders = 0;
    let addedMessages = 0;
    let persistedMessages = 0;
    const state = {
      pendingStart: false,
      task: 'keep this exact delegated task',
      errorCode: null,
      challengeId: 'consumed-challenge',
      challengeExpiresAt: 12345,
      delegationId: null,
      snapshot: null,
      subscribed: false
    };
    const context = {
      _activeTabIdSnapshot: 42,
      conversationId: 'conv_selected',
      _delegationUiState: state,
      chatInput: { textContent: 'keep this exact delegated task' },
      async _sendDelegationCommand(message) {
        commands.push(clone(message));
        if (message.type === 'FSB_DELEGATION_START') {
          return { ok: true, snapshot: { delegationId: DELEGATION_ID } };
        }
        return { ok: true, snapshot: { delegationId: DELEGATION_ID, state: 'stopped' } };
      },
      _delegationValidLifecycleResponse: () => true,
      _delegationValidConversationId: (value) => /^conv_[A-Za-z0-9_-]+$/.test(value),
      _writeDelegationConversationBinding: async () => false,
      _renderDelegationReadyState() {
        readyRenders += 1;
        state.errorCode = null;
      },
      _ensureDelegationMount: () => ({ state: stateNode }),
      _renderDelegationInlineError(_container, text) { inlineErrors.push(text); },
      updateSendButtonState() {},
      _persistMessageToConversation() { persistedMessages += 1; },
      _resetDelegationSelection() { throw new Error('unbound run cannot become selected'); },
      addMessage() { addedMessages += 1; },
      _renderDelegationSnapshot() { acceptedRenders += 1; },
      async _refreshSelectedDelegationSnapshot() {
        throw new Error('unbound run cannot refresh');
      },
      _delegationIsSelectedConversation: () => true
    };
    vm.createContext(context);
    vm.runInContext(extractNamedFunction(panelSource, '_beginDelegationStart'), context);
    await context._beginDelegationStart(null);
    assert.deepEqual(commands, [
      {
        type: 'FSB_DELEGATION_START',
        challengeId: null,
        task: 'keep this exact delegated task'
      },
      { type: 'FSB_DELEGATION_STOP', delegationId: DELEGATION_ID }
    ]);
    assert.equal(state.task, 'keep this exact delegated task');
    assert.equal(context.chatInput.textContent, 'keep this exact delegated task');
    assert.equal(state.pendingStart, false);
    assert.equal(state.delegationId, null);
    assert.equal(state.snapshot, null);
    assert.equal(state.errorCode, 'delegation_binding_persistence_failed');
    assert.equal(state.challengeId, null);
    assert.equal(state.subscribed, true);
    assert.equal(readyRenders, 1);
    assert.equal(stateNode.getAttribute('role'), 'alert');
    assert.deepEqual(inlineErrors, [
      'FSB could not save this agent run. A stop request was sent, and your message was kept. Try again.'
    ]);
    assert.equal(addedMessages, 0, 'failed binding keeps the composer message out of chat history');
    assert.equal(persistedMessages, 0, 'failed binding does not persist a consumed user message');
    assert.equal(acceptedRenders, 0, 'failed binding never renders an untracked accepted run');
  }

  {
    let resolveSnapshot;
    const commands = [];
    const renders = [];
    const state = { subscribed: true };
    const hydratedSnapshot = {
      delegationId: DELEGATION_ID,
      provider: { id: 'claude-code', label: 'Claude Code' }
    };
    const context = {
      conversationId: 'conv_selected',
      _delegationHydrationGeneration: 0,
      _delegationUiState: state,
      _lastUserTaskByConversation: new Map([['conv_selected', 'retained delegated task']]),
      _delegationForConversation: () => DELEGATION_ID,
      _resetDelegationSelection(selectedConversationId) {
        state.conversationId = selectedConversationId;
        state.delegationId = null;
        state.subscribed = false;
      },
      _sendDelegationCommand(message) {
        commands.push(clone(message));
        return new Promise((resolve) => { resolveSnapshot = resolve; });
      },
      _delegationValidSnapshotResponse: () => true,
      _removeDelegationConversationBinding: async () => true,
      _renderDelegationReadyState() { throw new Error('ready state was not expected'); },
      _renderDelegationSnapshot(next, options) {
        renders.push({ next, options, subscribedWhileRendering: state.subscribed });
        return true;
      }
    };
    vm.createContext(context);
    vm.runInContext(extractNamedFunction(panelSource, '_hydrateDelegationForSelectedConversation'), context);
    const pending = context._hydrateDelegationForSelectedConversation();
    assert.deepEqual(commands, [{
      type: 'FSB_DELEGATION_SNAPSHOT',
      delegationId: DELEGATION_ID
    }]);
    assert.equal(state.subscribed, false, 'subscription gate closes before hydration request');
    resolveSnapshot({ ok: true, snapshot: hydratedSnapshot });
    assert.equal(await pending, true);
    assert.equal(renders.length, 1);
    assert.equal(renders[0].options.hydrated, true);
    assert.equal(renders[0].subscribedWhileRendering, false,
      'historical rows render before subscription opens');
    assert.equal(state.subscribed, true, 'subscription opens only after hydrated render');
    assert.equal(state.task, 'retained delegated task', 'hydration restores retry text from ordinary conversation history');
  }

  {
    const commands = [];
    let readyRenders = 0;
    const state = { subscribed: true };
    const context = {
      conversationId: null,
      _delegationHydrationGeneration: 0,
      _delegationUiState: state,
      _delegationForConversation: () => null,
      _resetDelegationSelection(selectedConversationId) {
        state.conversationId = selectedConversationId;
        state.delegationId = null;
        state.subscribed = false;
      },
      async _sendDelegationCommand(message) {
        commands.push(clone(message));
        return { ok: true, snapshot: null };
      },
      _delegationValidSnapshotResponse: () => true,
      _removeDelegationConversationBinding: async () => true,
      _renderDelegationReadyState() { readyRenders += 1; },
      _renderDelegationSnapshot() { throw new Error('cleared session cannot hydrate a run'); }
    };
    vm.createContext(context);
    vm.runInContext(extractNamedFunction(panelSource, '_hydrateDelegationForSelectedConversation'), context);
    assert.equal(await context._hydrateDelegationForSelectedConversation(), true);
    assert.deepEqual(commands, [{ type: 'FSB_DELEGATION_SNAPSHOT', delegationId: null }]);
    assert.equal(readyRenders, 1, 'cleared session renders the honest ready state');
    assert.equal(state.subscribed, true);
  }

  {
    const delivered = [];
    const state = {
      subscribed: true,
      delegationId: 'delegation_selected',
      conversationId: 'conv_selected',
      pendingTake: false,
      pendingResume: false
    };
    const context = {
      conversationId: 'conv_selected',
      _delegationUiState: state,
      _delegationHasExactKeys(value, keys) {
        return value && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
      },
      FsbDelegationFeed: { validateSnapshot: () => true },
      _delegationIsSelectedConversation: () => true,
      _renderDelegationSnapshot(next, options) {
        delivered.push({ next, options });
        return true;
      }
    };
    vm.createContext(context);
    vm.runInContext(extractNamedFunction(panelSource, '_handleDelegationRuntimeUpdate'), context);
    assert.equal(context._handleDelegationRuntimeUpdate({
      type: 'FSB_DELEGATION_UPDATED',
      snapshot: { delegationId: 'delegation_other', state: 'running' },
      announceSequence: 1
    }), false, 'interleaved updates for another delegation stay hidden');
    assert.equal(delivered.length, 0);
    assert.equal(context._handleDelegationRuntimeUpdate({
      type: 'FSB_DELEGATION_UPDATED',
      snapshot: { delegationId: 'delegation_selected', state: 'running' },
      announceSequence: 1
    }), true, 'matching selected delegation update renders');
    assert.equal(delivered.length, 1);
  }

  {
    const run = new TestNode('section');
    const stateNode = new TestNode('div');
    const feed = new TestNode('div');
    const announcer = new TestNode('div');
    announcer.textContent = 'silent';
    const uiState = {
      delegationId: DELEGATION_ID,
      snapshot: null,
      pendingTake: false,
      pendingResume: false,
      pendingStop: false,
      lastRenderedSequence: null,
      lastAlertKey: null,
      announced: Object.create(null)
    };
    const context = {
      _delegationUiState: uiState,
      _ensureDelegationMount: () => ({ run, state: stateNode, feed, announcer, control: null }),
      FsbDelegationFeed: {
        validateSnapshot: () => true,
        render(_feed, next, options) {
          return { ok: true, lastSequence: next.entries.length, hydrated: options.hydrated };
        }
      },
      _renderDelegationRunHeader() {},
      _renderDelegationControlBar() {},
      _setDelegationHeaderStatus() {},
      _setDelegationComposerLocked() {},
      _delegationStateLabel: () => 'status',
      _delegationSnapshotLocksComposer: () => true,
      _delegationAnnouncement: () => 'new persisted row'
    };
    vm.createContext(context);
    vm.runInContext(extractNamedFunction(panelSource, '_delegationSnapshotAlertKey'), context);
    vm.runInContext(extractNamedFunction(panelSource, '_renderDelegationSnapshot'), context);
    const rows = [1, 2, 3, 4].map((sequence) => ({ sequence }));
    const disconnected = {
      delegationId: DELEGATION_ID,
      provider: { label: 'Claude Code' },
      state: 'running',
      connection: 'disconnected',
      terminal: null,
      entries: rows
    };
    assert.equal(context._renderDelegationSnapshot(disconnected, {
      hydrated: true,
      announceSequence: null
    }), true);
    assert.equal(announcer.textContent, 'silent', 'hydrated history never reaches the live announcer');
    assert.equal(stateNode.getAttribute('role'), 'alert');
    assert.equal(stateNode.getAttribute('aria-live'), 'off',
      'hydrated alert retains semantics without replay');

    const connected = { ...disconnected, connection: 'connected', entries: rows.concat({ sequence: 5 }) };
    assert.equal(context._renderDelegationSnapshot(connected, {
      hydrated: false,
      announceSequence: 5
    }), true);
    assert.equal(announcer.textContent, 'new persisted row', 'strictly newer live row announces once');
    announcer.textContent = 'dedupe sentinel';
    context._renderDelegationSnapshot(connected, { hydrated: false, announceSequence: 5 });
    assert.equal(announcer.textContent, 'dedupe sentinel', 'duplicate sequence stays silent');

    const disconnectedLive = { ...disconnected, entries: connected.entries };
    context._renderDelegationSnapshot(disconnectedLive, { hydrated: false, announceSequence: null });
    assert.equal(stateNode.getAttribute('role'), 'alert');
    assert.equal(stateNode.getAttribute('aria-live'), null, 'new disconnect transition alerts once');
    context._renderDelegationSnapshot(disconnectedLive, { hydrated: false, announceSequence: null });
    assert.equal(stateNode.getAttribute('aria-live'), 'off', 'unchanged disconnect avoids an alert storm');
  }

  {
    let resolveStop;
    const commands = [];
    const renders = [];
    const running = { delegationId: DELEGATION_ID, state: 'running' };
    const stopped = {
      delegationId: DELEGATION_ID,
      state: 'stopped',
      terminal: { code: 'stopped', releasedTabCount: 1 }
    };
    const state = {
      snapshot: running,
      delegationId: DELEGATION_ID,
      conversationId: 'conv_fixture',
      pendingStop: false,
      errorCode: null
    };
    const context = {
      conversationId: 'conv_fixture',
      _delegationUiState: state,
      _delegationIsActiveSnapshot: () => true,
      _delegationIsSelectedConversation: () => true,
      _sendDelegationCommand(message) {
        commands.push(clone(message));
        return new Promise((resolve) => { resolveStop = resolve; });
      },
      _delegationValidLifecycleResponse: () => true,
      _renderDelegationSnapshot(next, options) { renders.push({ next, options }); }
    };
    vm.createContext(context);
    vm.runInContext(extractNamedFunction(panelSource, '_stopDelegation'), context);
    const button = new TestNode('button');
    const first = context._stopDelegation({ currentTarget: button });
    const duplicate = context._stopDelegation({ currentTarget: button });
    assert.deepEqual(commands, [{ type: 'FSB_DELEGATION_STOP', delegationId: DELEGATION_ID }]);
    assert.equal(state.pendingStop, true);
    assert.equal(button.disabled, true);
    assert.equal(button.focusCount, 1, 'Stop retains focus on its disabled control while pending');
    assert.equal(renders.length, 0, 'Stop renders no terminal result before authority replies');
    assert.equal(await duplicate, undefined, 'duplicate Stop click has no lifecycle effect');
    resolveStop({ ok: true, snapshot: stopped });
    await first;
    assert.equal(renders.length, 1);

    const headingContext = {};
    vm.createContext(headingContext);
    vm.runInContext(extractNamedFunction(panelSource, '_delegationStoppedHeading'), headingContext);
    assert.equal(headingContext._delegationStoppedHeading(stopped), 'Agent stopped, 1 tab released');
    assert.equal(headingContext._delegationStoppedHeading({
      terminal: { releasedTabCount: 2 }
    }), 'Agent stopped, 2 tabs released');
  }

  {
    const context = {
      document: globalThis.document,
      _delegationUiState: {
        errorCode: null,
        pendingStop: false
      },
      _copyDelegationDoctorCommand() {},
      _openDelegationProviderSetup() {},
      _prepareDelegationTask() {},
      _stopDelegation() {}
    };
    vm.createContext(context);
    [
      '_clearDelegationNode',
      '_delegationElement',
      '_delegationToneForSnapshot',
      '_delegationSemanticIcon',
      '_delegationSemanticHeading',
      '_applyDelegationSnapshotTone',
      '_delegationAction',
      '_renderDelegationInlineError',
      '_delegationStoppedHeading',
      '_delegationStateLabel',
      '_delegationIsActiveSnapshot',
      '_renderDelegationRunActions',
      '_appendDelegationActionRow',
      '_appendDelegationDoctorRecovery',
      '_appendDelegationTechnicalCode',
      '_renderDelegationRunHeader'
    ].forEach((name) => vm.runInContext(extractNamedFunction(panelSource, name), context));
    const base = {
      delegationId: DELEGATION_ID,
      provider: { id: 'claude-code', label: 'Claude Code' },
      state: 'running',
      connection: 'connected',
      terminal: null
    };
    const card = new TestNode('div');

    context._renderDelegationRunHeader(card, { ...base, connection: 'disconnected' });
    assert.equal(card.getAttribute('data-delegation-state'), 'running');
    assert.equal(card.getAttribute('data-delegation-tone'), 'danger');
    assert(card.className.includes('delegation-tone-danger'));
    assert.equal(findAll(card, 'i')[0].getAttribute('aria-hidden'), 'true');
    assert(card.textContent.includes('Agent connection lost'));
    assert(card.textContent.includes('FSB missed three replies from the local agent service. The run cannot continue safely.'));
    assert(card.textContent.includes('fsb-mcp-server doctor'));
    assert(card.textContent.includes('Copy doctor command'));
    assert(card.textContent.includes('Open provider setup'));
    assert(!card.textContent.includes('daemon restart'), 'ordinary disconnect never receives restart copy');

    context._renderDelegationRunHeader(card, {
      ...base,
      state: 'restart_lost',
      connection: 'disconnected',
      terminal: { code: 'daemon_restart_lost_run', releasedTabCount: 0 }
    });
    assert(card.textContent.includes('Agent run ended after daemon restart'));
    assert(card.textContent.includes('The previous agent process was stopped and was not reattached. Start a new task when the local service is ready.'));
    assert(card.textContent.includes('daemon_restart_lost_run'));
    assert(card.textContent.includes('Start a new task'));
    assert(!card.textContent.includes('missed three replies'),
      'explicit restart disposition takes precedence over disconnected transport state');
    assert.equal(card.getAttribute('data-delegation-tone'), 'danger');

    context._renderDelegationRunHeader(card, {
      ...base,
      state: 'stopped',
      terminal: { code: 'stopped', releasedTabCount: 2 }
    });
    assert(card.textContent.includes('Agent stopped, 2 tabs released'));
    assert(card.textContent.includes('Start a new task'));
    assert.equal(card.getAttribute('data-delegation-tone'), 'neutral');

    context._renderDelegationRunHeader(card, {
      ...base,
      state: 'completed',
      terminal: { code: 'completed', releasedTabCount: 0 }
    });
    assert.equal(card.getAttribute('data-delegation-tone'), 'success');

    context._renderDelegationRunHeader(card, {
      ...base,
      state: 'held',
      activeTab: { tabId: 42, owned: false, canTakeControl: false },
      hold: { expiresAt: 10000, tabIds: [42] }
    });
    assert.equal(card.getAttribute('data-delegation-tone'), 'warning');
  }

  {
    const copied = [];
    const opened = [];
    const announcer = new TestNode('div');
    const context = {
      navigator: { clipboard: { async writeText(value) { copied.push(value); } } },
      _ensureDelegationMount: () => ({ announcer }),
      openControlPanelSection(section) { opened.push(section); }
    };
    vm.createContext(context);
    vm.runInContext(extractNamedFunction(panelSource, '_copyDelegationDoctorCommand'), context);
    vm.runInContext(extractNamedFunction(panelSource, '_openDelegationProviderSetup'), context);
    await context._copyDelegationDoctorCommand();
    assert.deepEqual(copied, ['fsb-mcp-server doctor']);
    assert.equal(announcer.textContent, 'Doctor command copied');
    context._openDelegationProviderSetup();
    assert.deepEqual(opened, ['providers']);
  }

  {
    const context = {};
    vm.createContext(context);
    vm.runInContext(extractNamedFunction(panelSource, '_delegationSnapshotLocksComposer'), context);
    assert.equal(context._delegationSnapshotLocksComposer({ state: 'running', connection: 'disconnected' }), true,
      'disconnected nonterminal run keeps composer locked');
    assert.equal(context._delegationSnapshotLocksComposer({ state: 'stopped', connection: 'connected' }), false,
      'composer restores only after canonical terminal settlement');
  }

  console.log('delegation-sidepanel-ui: PASS');
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
