'use strict';

const assert = require('assert');
const crypto = require('crypto');
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
const DelegationProviders = require('../extension/utils/delegation-providers.js');

const DELEGATION_ID = 'delegation_fixture';
const CLAUDE_ACCEPTED_IDENTITY = DelegationProviders.createAcceptedAgentIdentity(
  'claude-code',
  'unknown'
);

function entry(sequence, kind, payload) {
  const base = {
    v: 1,
    delegationId: DELEGATION_ID,
    sequence,
    timestamp: 1000 + sequence,
    kind,
    state: 'running',
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
    acceptedIdentity: clone(CLAUDE_ACCEPTED_IDENTITY),
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

function domShape(node) {
  return {
    tagName: node.tagName,
    className: node.className,
    attributes: Object.keys(node.attributes || {}).sort().map((name) => [
      name, node.attributes[name]
    ]),
    children: node.children.map(domShape)
  };
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

function canonicalProviderSnapshot(providerId, providerLabel, billingKind, authState) {
  const value = snapshot();
  const acceptedIdentity = DelegationProviders.createAcceptedAgentIdentity(
    providerId,
    authState || 'unknown'
  );
  assert(acceptedIdentity, providerId + ' has a canonical accepted identity');
  assert.equal(acceptedIdentity.billingKind, billingKind);
  value.acceptedIdentity = clone(acceptedIdentity);
  value.provider = { id: providerId, label: providerLabel };
  value.entries[0].init.client = { id: providerId, label: providerLabel };
  value.entries[0].init.profileVersion = acceptedIdentity.profileVersion;
  value.entries[0].init.model = null;
  value.entries[0].init.sessionId = null;
  value.entries[0].init.allowedTools = [];
  value.entries[3].metrics.billingKind = billingKind;
  value.entries[3].metrics.usd = null;
  value.summary.billingKind = billingKind;
  value.summary.usd = null;
  return value;
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

  const openCode = canonicalProviderSnapshot('opencode', 'OpenCode', 'unknown');
  assert.equal(Feed.validateSnapshot(openCode), true,
    'canonical OpenCode snapshot validates through the shared provider identity model');
  for (const invalidIdentity of [
    { id: 'opencode', label: 'Claude Code' },
    { id: 'claude-code', label: 'OpenCode' },
    { id: 'codex', label: 'Codex' },
    { id: 'OpenCode', label: 'OpenCode' }
  ]) {
    const invalid = clone(openCode);
    invalid.provider = invalidIdentity;
    assert.equal(Feed.validateSnapshot(invalid), false,
      'snapshot rejects provider identity ' + JSON.stringify(invalidIdentity));
  }
  const crossedIdentity = clone(openCode);
  crossedIdentity.entries[0].init.client = { id: 'claude-code', label: 'Claude Code' };
  assert.equal(Feed.validateSnapshot(crossedIdentity), false,
    'snapshot and init provider identities cannot cross');
  for (const [field, value] of [
    ['providerId', 'claude-code'],
    ['label', 'Claude Code'],
    ['profileVersion', 'different-real-profile'],
    ['authState', 'chatgpt'],
    ['billingKind', 'subscription']
  ]) {
    const drifted = clone(openCode);
    drifted.acceptedIdentity[field] = value;
    assert.equal(Feed.validateSnapshot(drifted), false,
      'snapshot rejects accepted identity drift in ' + field);
  }
  const identityExtra = clone(openCode);
  identityExtra.acceptedIdentity.extra = true;
  assert.equal(Feed.validateSnapshot(identityExtra), false,
    'snapshot rejects extra accepted identity fields');

  let providerAccessorReads = 0;
  const accessorIdentity = { id: 'opencode' };
  Object.defineProperty(accessorIdentity, 'label', {
    enumerable: true,
    get() {
      providerAccessorReads += 1;
      return 'OpenCode';
    }
  });
  const accessorSnapshot = clone(openCode);
  accessorSnapshot.provider = accessorIdentity;
  assert.equal(Feed.validateSnapshot(accessorSnapshot), false,
    'provider identity accessors fail closed at the feed boundary');
  assert.equal(providerAccessorReads, 0, 'feed never invokes provider identity accessors');

  let acceptedAccessorReads = 0;
  const acceptedAccessor = clone(openCode.acceptedIdentity);
  Object.defineProperty(acceptedAccessor, 'billingKind', {
    enumerable: true,
    get() {
      acceptedAccessorReads += 1;
      return 'unknown';
    }
  });
  const acceptedAccessorSnapshot = clone(openCode);
  acceptedAccessorSnapshot.acceptedIdentity = acceptedAccessor;
  assert.equal(Feed.validateSnapshot(acceptedAccessorSnapshot), false,
    'accepted identity accessors fail closed at the feed boundary');
  assert.equal(acceptedAccessorReads, 0, 'feed never invokes accepted identity accessors');

  const nativeCanary = 'native://secret:port/path/model/auth/version/task';
  const nativeSnapshot = clone(openCode);
  nativeSnapshot.rawProvider = { topology: nativeCanary };
  const nativeContainer = new TestNode('div');
  assert.equal(Feed.render(nativeContainer, nativeSnapshot, { hydrated: false }).ok, false);
  assert(!nativeContainer.textContent.includes(nativeCanary),
    'rejected native provider metadata never reaches feed text');
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
  assert.deepEqual(
    articles.map((node) => node.getAttribute('data-delegation-tone')),
    ['info', 'neutral', 'warning', 'success', 'success'],
    'init, tool, retry, result, and summary consume only their declared semantic tones'
  );
  const text = container.textContent;
  [
    'Claude Code', 'claude-sonnet', 'session_fixture', 'mcp__fsb',
    'mcp__fsb__read_page', 'current tab', '42', 'succeeded', '150 ms',
    'api_retry', '250 ms', '11', '7', '18', '3', '900 ms',
    'Included in your subscription', 'Show tool-call breakdown'
  ].forEach((value) => assert(text.includes(value), 'renderer exposes typed field: ' + value));
  assert(!text.includes('Profile') && !text.includes('2.1.177'),
    'real internal profile data creates no visible term or value');
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
  const stoppedSummary = Feed.renderSummary(summary({ state: 'stopped' }));
  const restartSummary = Feed.renderSummary(summary({ state: 'restart_lost' }));
  assert.equal(completedSummary.getAttribute('data-delegation-tone'), 'success');
  assert.equal(failedSummary.getAttribute('data-delegation-tone'), 'danger');
  assert.equal(stoppedSummary.getAttribute('data-delegation-tone'), 'neutral');
  assert.equal(restartSummary.getAttribute('data-delegation-tone'), 'danger');
  assert(completedSummary.className.includes('delegation-tone-success'));
  assert(failedSummary.className.includes('delegation-tone-danger'));

  const stateToneMatrix = {
    running: 'info',
    held: 'warning',
    resuming: 'warning',
    completed: 'success',
    failed: 'danger',
    stopped: 'neutral',
    restart_lost: 'danger'
  };
  Object.entries(stateToneMatrix).forEach(([state, tone], index) => {
    const stateCard = Feed.renderEntry(entry(10 + index, 'state', state));
    assert.equal(stateCard.getAttribute('data-delegation-state'), state);
    assert.equal(stateCard.getAttribute('data-delegation-tone'), tone,
      `persisted ${state} state row uses its canonical ${tone} tone`);
    assert.equal(findAll(stateCard, 'i')[0].getAttribute('aria-hidden'), 'true');
  });

  const failedTool = clone(snapshot().entries[1]);
  failedTool.tool.status = 'failed';
  const failedToolCard = Feed.renderEntry(failedTool);
  assert.equal(failedToolCard.getAttribute('data-delegation-tone'), 'danger',
    'canonical failed tool status receives an explicit danger marker');
}

{
  const claudeContainer = new TestNode('div');
  const openCodeContainer = new TestNode('div');
  const codexChatgptContainer = new TestNode('div');
  const codexApiContainer = new TestNode('div');
  const claude = canonicalProviderSnapshot('claude-code', 'Claude Code', 'subscription');
  const openCode = canonicalProviderSnapshot('opencode', 'OpenCode', 'unknown');
  const codexChatgpt = canonicalProviderSnapshot(
    'codex', 'Codex', 'subscription', 'chatgpt'
  );
  const codexApi = canonicalProviderSnapshot('codex', 'Codex', 'api', 'api_key');
  assert.equal(openCode.entries[3].state, 'running',
    'the stored OpenCode result remains a nonterminal candidate');
  assert.equal(Feed.render(claudeContainer, claude, { hydrated: false }).ok, true);
  assert.equal(Feed.render(openCodeContainer, openCode, { hydrated: false }).ok, true);
  assert.equal(Feed.render(codexChatgptContainer, codexChatgpt, { hydrated: false }).ok, true);
  assert.equal(Feed.render(codexApiContainer, codexApi, { hydrated: false }).ok, true);
  assert.deepEqual(domShape(openCodeContainer), domShape(claudeContainer),
    'Claude and OpenCode normalized inputs produce identical feed DOM structure');
  assert.deepEqual(domShape(codexChatgptContainer), domShape(claudeContainer),
    'Codex ChatGPT normalized input uses the shared feed DOM structure');
  assert.deepEqual(domShape(codexApiContainer), domShape(claudeContainer),
    'Codex API-key normalized input uses the shared feed DOM structure');
  assert(openCodeContainer.textContent.includes('OpenCode'));
  assert(openCodeContainer.textContent.includes('Outcomecompleted'),
    'authoritative completed terminal truth controls the result presentation');
  assert(openCodeContainer.textContent.includes('BillingBilling not reported'),
    'OpenCode run summary uses the exact unknown-billing phrase');
  assert(!/Included in your subscription|\$\d|\bfree\b|\bunlimited\b/i.test(
    openCodeContainer.textContent
  ), 'unknown billing cannot imply a plan, price, or allowance');
  assert(codexChatgptContainer.textContent.includes(
    'BillingIncluded with your ChatGPT plan'
  ), 'accepted ChatGPT identity drives the exact completed billing caption');
  assert(codexApiContainer.textContent.includes(
    'BillingBilled to the API key stored by Codex; dollar amount not reported.'
  ), 'accepted API-key identity drives the exact completed billing caption');
  for (const [container, value] of [
    [codexChatgptContainer, codexChatgpt],
    [codexApiContainer, codexApi]
  ]) {
    assert.equal(value.acceptedIdentity.profileVersion, '0.142.5');
    assert.equal(value.entries[0].init.profileVersion, '0.142.5');
    assert.equal(value.summary.usd, null);
    assert(!container.textContent.includes('Profile')
        && !container.textContent.includes('0.142.5')
        && !/\$\s*\d/.test(container.textContent),
      'Codex keeps profile and dollar values absent from the shared presentation');
  }

  const hydratedContainer = new TestNode('div');
  const hydrated = clone(openCode);
  hydrated.hydrated = true;
  assert.equal(Feed.render(hydratedContainer, hydrated, { hydrated: true }).ok, true);
  assert.deepEqual(domShape(hydratedContainer), domShape(openCodeContainer),
    'cold, verified-attach, and hydrated normalized success share one feed DOM');
}

{
  function candidateSnapshot(state, terminalCode) {
    const value = canonicalProviderSnapshot('opencode', 'OpenCode', 'unknown');
    value.state = state;
    value.entries[3].state = 'running';
    value.summary.state = state === 'running' ? 'running' : 'failed';
    value.terminal = terminalCode === null
      ? null
      : { code: terminalCode, releasedTabCount: 0 };
    value.hydrated = false;
    return value;
  }

  for (const scenario of [
    { name: 'candidate before clean exit', value: candidateSnapshot('running', null) },
    { name: 'protocol drift after candidate', value: candidateSnapshot('failed', 'agent_protocol_drift') },
    { name: 'nonzero or signal failure after candidate', value: candidateSnapshot('failed', 'agent_failed') },
    { name: 'missing or duplicate terminal failure', value: candidateSnapshot('failed', 'unknown_failure') }
  ]) {
    const container = new TestNode('div');
    const rendered = Feed.render(container, scenario.value, { hydrated: false });
    assert.deepEqual(rendered, { ok: true, lastSequence: 4, hydrated: false },
      scenario.name + ' retains sequence accounting without presenting success');
    assert.equal(findByClass(container, 'delegation-entry-result').length, 0,
      scenario.name + ' renders zero result cards');
    assert.equal(findByClass(container, 'delegation-summary').length, 0,
      scenario.name + ' renders zero run summaries');
    assert(!container.textContent.includes('Result')
        && !container.textContent.includes('Run summary'),
      scenario.name + ' exposes no transient success copy');
  }
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
  const missing = canonicalProviderSnapshot('opencode', 'OpenCode', 'unknown');
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
  assert.equal(missing.entries[0].init.profileVersion, '1.14.25',
    'nullable presentation fixture retains its real internal provider profile');
  assert(!container.textContent.includes('Profile') && !container.textContent.includes('1.14.25'));

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

const delegationProviderScript = '  <script src="../utils/delegation-providers.js"></script>\n';
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
assert.equal((htmlSource.match(/src="\.\.\/utils\/delegation-providers\.js"/g) || []).length, 1,
  'side panel loads the canonical delegation provider helper exactly once');
assert(htmlSource.indexOf('../utils/delegation-providers.js') < htmlSource.indexOf('delegation-feed.js')
    && htmlSource.indexOf('delegation-feed.js') < htmlSource.indexOf('sidepanel.js'),
  'canonical provider identity loads before both side-panel consumers');
assert.equal(sha256(htmlSource.replace(delegationProviderScript, '')),
  '6185330e1d4d978f049684e469f8e8cd842f55086d338685358f9b4e5a7f19ba',
  'the nonvisual helper dependency is the only side-panel HTML delta');
assert.equal(sha256(cssSource),
  '88cdcf60a6a8e5087a3f910e158d5ebb8c81c513c674d19c064a04625b2c16bb',
  'OpenCode adds no delegated side-panel CSS');

{
  const context = { FsbDelegationProviders: DelegationProviders };
  vm.createContext(context);
  [
    '_delegationHasExactKeys',
    '_delegationOwnDataValue',
    '_delegationCanonicalProvider',
    '_delegationValidPreflightResponse',
    '_delegationValidConsentResponse',
    '_delegationValidTrustResponse'
  ].forEach((name) => vm.runInContext(extractNamedFunction(panelSource, name), context));

  for (const provider of DelegationProviders.list()) {
    assert.equal(context._delegationValidPreflightResponse({
      ok: true, kind: 'agent', providerId: provider.id, providerLabel: provider.label
    }), true, provider.label + ' preflight identity is accepted');
    assert.equal(context._delegationValidConsentResponse({
      ok: true,
      providerId: provider.id,
      providerLabel: provider.label,
      trusted: false,
      challengeId: 'dch_provider_identity',
      expiresAt: 12345
    }), true, provider.label + ' consent identity is accepted');
    assert.equal(context._delegationValidTrustResponse({
      ok: true, providerId: provider.id, trusted: true
    }, provider.id), true, provider.label + ' trust identity is accepted');
  }
  assert.equal(context._delegationValidPreflightResponse({
    ok: true, kind: 'agent', providerId: 'opencode', providerLabel: 'Claude Code'
  }), false, 'mismatched preflight identity fails closed');
  assert.equal(context._delegationValidConsentResponse({
    ok: true,
    providerId: 'opencode',
    providerLabel: 'Claude Code',
    trusted: false,
    challengeId: 'dch_mismatch',
    expiresAt: 12345
  }), false, 'mismatched consent identity fails closed');
  assert.equal(context._delegationValidTrustResponse({
    ok: true, providerId: 'claude-code', trusted: true
  }, 'opencode'), false, 'trust response cannot switch the consent provider');

  let accessorReads = 0;
  const accessorResponse = { ok: true, kind: 'agent', providerId: 'opencode' };
  Object.defineProperty(accessorResponse, 'providerLabel', {
    enumerable: true,
    get() {
      accessorReads += 1;
      return 'OpenCode';
    }
  });
  assert.equal(context._delegationValidPreflightResponse(accessorResponse), false,
    'provider identity accessors fail closed');
  assert.equal(accessorReads, 0, 'provider identity accessors are never invoked');
}

assert(!/innerHTML|insertAdjacentHTML|\.href\s*=|\.src\s*=|setAttribute\(['"](?:href|src|style|on\w+)/.test(feedSource),
  'delegation renderer has no HTML, URL, inline-style, or handler sink');
assert(feedSource.includes('textContent') && feedSource.includes('createTextNode'),
  'delegation renderer uses only text DOM construction');
assert(!/opencode/i.test(feedSource),
  'feed presentation contains no OpenCode-specific renderer or billing branch');
assert(!/providerId\s*={2,3}\s*['"]codex['"]|delegation-(?:entry|summary)-codex/i.test(feedSource),
  'feed presentation contains no Codex-specific branch, class, or renderer');
assert(feedSource.includes("'Billing not reported'"),
  'feed source pins the exact unknown-billing phrase');
assert(!/_definition\(initList,\s*['"]Profile['"]/.test(feedSource),
  'shared init presentation removes both the Profile term and value row');
assert(panelSource.includes("message.type !== 'FSB_DELEGATION_UPDATED'"),
  'side panel accepts only the canonical runtime update type');
assert(!/opencode/i.test(panelSource),
  'side-panel presentation contains no OpenCode-specific renderer or state branch');
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
const delegationCssStart = cssSource.indexOf('.delegation-run {');
const delegationCssEnd = cssSource.indexOf(
  '/* Phase 11 FINT-20 -- visually-hidden screen-reader-only utility.',
  delegationCssStart
);
const delegationCss = cssSource.slice(delegationCssStart, delegationCssEnd);
const spacingDeclarations = Array.from(delegationCss.matchAll(
  /^\s*(gap|margin(?:-[a-z-]+)?|padding(?:-[a-z-]+)?)\s*:\s*([^;]+);/gm
));
assert(spacingDeclarations.length >= 20, 'Phase 61 spacing gate covers the complete layout block');
spacingDeclarations.forEach((match) => {
  const values = match[2].trim().split(/\s+/);
  assert(values.length >= 1 && values.length <= 4 && values.every((value) => (
    value === '0' || /^var\(--fsb-space-(?:1|2|4|6|8|12)\)$/.test(value)
  )), `Phase 61 ${match[1]} rejects off-scale spacing: ${match[2]}`);
});
assert(delegationCss.includes('var(--fsb-space-1)')
    && delegationCss.includes('var(--fsb-space-2)')
    && delegationCss.includes('var(--fsb-space-4)'),
  'Phase 61 layout reuses the approved shared spacing tokens');
assert(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none !important[\s\S]*?transition: none !important/.test(cssSource),
  'reduced-motion removes delegation animation and transition');
const reducedMotionCss = cssSource.slice(cssSource.indexOf('@media (prefers-reduced-motion: reduce)'));
assert(reducedMotionCss.includes('.chat-messages')
    && reducedMotionCss.includes('scroll-behavior: auto !important'),
  'reduced-motion disables smooth chat scrolling on the actual scroll container');
assert(reducedMotionCss.includes('.status-dot.running')
    && reducedMotionCss.includes('.stop-btn[data-delegation-action="stop"]'),
  'reduced-motion disables the delegated status pulse and fixed Stop motion');

console.log('\n--- Phase 61 consent and human-control contract ---');

[
  'It cannot edit files, run shell commands, or fetch arbitrary URLs.',
  'Back to message',
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
  'FSB can reach the local agent service, but this browser has not been paired with it. Open provider setup, pair this browser, then try this message again.',
  'The selected provider does not support agents that control browser tabs. Choose a supported agent provider, then try this message again.',
  'Choose another provider',
  'Agent could not resume control',
  'Agent could not finish this task',
  'FSB accepted this run but could not save it, and Stop is not confirmed.',
  'Your original message is still here. Retry Stop to finish cleanup.',
  'Finish the pending agent cleanup in its original tab and conversation before starting another task. Your message was kept.',
  'FSB could not save this agent run. Stop was confirmed for that exact run, and your message was kept. Try again.'
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

{
  function renderConsent(provider) {
    const run = new TestNode('section');
    const stateCard = new TestNode('div');
    const feed = new TestNode('div');
    const control = new TestNode('div');
    const context = {
      document: globalThis.document,
      FsbDelegationProviders: DelegationProviders,
      FsbDelegationProviders: DelegationProviders,
      _delegationUiState: {
        mode: 'ready',
        providerId: provider.id,
        providerLabel: provider.label,
        pendingStart: false,
        pendingTrust: false,
        errorCode: null
      },
      _delegationRunStopControls: [],
      _clearDelegationElapsedTimer() {},
      _ensureDelegationMount: () => ({ run, state: stateCard, feed, control }),
      _clearDelegationNode(node) { while (node.firstChild) node.removeChild(node.firstChild); },
      _restoreLegacyStopControl() {},
      _delegationElement(tag, className, textValue) {
        const node = new TestNode(tag);
        node.className = className || '';
        if (textValue !== undefined) node.textContent = textValue;
        return node;
      },
      _delegationAction(label, className, handler) {
        const button = new TestNode('button');
        button.className = 'delegation-action' + (className ? ' ' + className : '');
        button.textContent = label;
        button.addEventListener('click', handler);
        return button;
      },
      _renderDelegationInlineError() {},
      _allowDelegationFromConsent() {},
      _backToDelegationMessage() {},
      _setDelegationHeaderStatus() {},
      _setDelegationComposerLocked() {}
    };
    vm.createContext(context);
    [
      '_delegationOwnDataValue',
      '_delegationCanonicalProvider'
    ].forEach((name) => vm.runInContext(extractNamedFunction(panelSource, name), context));
    vm.runInContext(consentRenderSource, context);
    context._renderDelegationConsent({ focusHeading: true });
    return { stateCard, control };
  }

  const claudeConsent = renderConsent(DelegationProviders.get('claude-code'));
  const openCodeConsent = renderConsent(DelegationProviders.get('opencode'));
  assert.equal(findAll(openCodeConsent.stateCard, 'h2')[0].textContent,
    'Let OpenCode control this browser?');
  assert(openCodeConsent.stateCard.textContent.includes(
    'OpenCode may drive FSB browser tools for this task.'));
  assert(openCodeConsent.stateCard.textContent.includes('Trust OpenCode for future runs'));
  assert(openCodeConsent.stateCard.textContent.includes(
    'This turns off confirmation for future OpenCode runs on this browser. You can restore confirmation in Providers.'));
  assert.deepEqual(findAll(openCodeConsent.stateCard, 'button').map((button) => button.textContent),
    ['Allow & start OpenCode', 'Back to message']);
  assert.equal(findAll(openCodeConsent.stateCard, 'h2')[0].focusCount, 1,
    'OpenCode consent retains the existing focused heading');
  assert.deepEqual(
    findAll(openCodeConsent.stateCard, 'button').map((button) => button.className),
    findAll(claudeConsent.stateCard, 'button').map((button) => button.className),
    'Claude and OpenCode consent reuse identical actions and classes'
  );
  assert.equal(openCodeConsent.control.classList.contains('hidden'), true,
    'consent retains the existing hidden control bar');
}

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
      < startSource.indexOf('await _refreshSelectedDelegationSnapshot({ hydrated: true, announceLifecycle: true })')
    && startSource.indexOf('await _refreshSelectedDelegationSnapshot({ hydrated: true, announceLifecycle: true })')
      < startSource.lastIndexOf('_delegationUiState.subscribed = true'),
  'accepted start catches up persisted rows silently while retaining live lifecycle feedback');
assert(panelSource.includes("mount.state.setAttribute('role', 'alert')")
    && panelSource.includes("mount.state.setAttribute('aria-live', 'off')"),
  'connectivity cards retain alert semantics while hydrated/unchanged alerts stay silent');
const preflightFailureSource = extractNamedFunction(panelSource, '_renderDelegationPreflightFailure');
assert(preflightFailureSource.includes('_delegationSemanticHeading(')
    && preflightFailureSource.includes("heading.setAttribute('data-delegation-tone', 'danger')"),
  'offline preflight alert pairs its danger treatment with an explicit semantic heading icon');
assert(panelSource.includes("announceSequence > previousLastSequence"),
  'only a strictly newer matching sequence reaches the polite announcer');
assert(panelSource.includes('announcedTransitions: Object.create(null)')
    && panelSource.includes("snapshot.delegationId + ':lifecycle:' + suffix")
    && panelSource.includes('announcementParts.join(\'. \')'),
  'lifecycle/control one-shots use a separate dedupe map and the one existing announcer');
assert(panelSource.includes("return 'Agent stopped, ' + count + ' '")
    && panelSource.includes("count === 1 ? 'tab' : 'tabs'"),
  'stopped copy uses only the canonical release count with singular grammar');
assert(panelSource.includes('var stopping = _delegationStopControlPending(snapshot)')
    && panelSource.includes("snapshot.state === 'stopping'")
    && panelSource.includes('_delegationUiState.bindingCleanupPending !== true')
    && panelSource.includes("stopping ? 'Stopping agent…' : 'Stop agent'"),
  'pending Stop wording stays canonical while failed unbound cleanup becomes retryable');
assert(panelSource.includes("stopBtn.addEventListener('click', _handleFixedStop)")
    && panelSource.includes('_delegationUsesFixedStop(_delegationUiState.snapshot)')
    && panelSource.includes('return _stopDelegation(event);')
    && panelSource.includes('return stopAutomation();'),
  'fixed Stop multiplexes to delegated authority only for the selected active snapshot');
const doctorSource = extractNamedFunction(panelSource, '_copyDelegationDoctorCommand');
const setupSource = extractNamedFunction(panelSource, '_openDelegationProviderSetup');
assert(doctorSource.includes("var command = 'fsb-mcp-server doctor'")
    && doctorSource.includes('navigator.clipboard.writeText(command)')
    && setupSource.includes("openControlPanelSection('providers')"),
  'doctor recovery copies only the literal and opens only the local Providers section');
assert(!/sendMessage|nativeMessaging|exec\s*\(|restart/i.test(doctorSource + '\n' + setupSource),
  'doctor/setup actions cannot execute or restart a daemon, native host, or shell');

console.log('\n--- Phase 63 native wake checking contract ---');

[
  'Checking local agent service',
  'FSB is trying to make the local agent service available. Your message has not been sent.',
  'Checking local agent service. Your message has not been sent.',
  'Checking agent service'
].forEach((copy) => assert(panelSource.includes(copy),
  'native wake checking pins approved fixed copy: ' + copy));
assert(panelSource.includes("message.type !== 'FSB_NATIVE_WAKE_CHECKING'")
    && panelSource.includes("_delegationHasExactKeys(message, ['attemptId', 'intentId', 'type'])"),
  'checking runtime input is exact and closed');
assert(panelSource.includes('intentId: intentId')
    && panelSource.includes('pendingRawText')
    && panelSource.includes('pendingEditRevision')
    && panelSource.includes('_delegationComposerEditRevision += 1'),
  'Send snapshots exact composer bytes plus a monotonic edit revision and carries a safe intent id');
const nativeWakeRenderSource = extractNamedFunction(
  panelSource, '_renderDelegationNativeWakeChecking'
);
const nativeWakeRuntimeSource = extractNamedFunction(
  panelSource, '_handleDelegationNativeWakeChecking'
);
assert(!/connectNative|sendNativeMessage|nativeMessaging|child_process|\bexec\s*\(|\bspawn\s*\(|process\.platform/i.test(
  nativeWakeRenderSource + '\n' + nativeWakeRuntimeSource
), 'side-panel checking has no native, process, shell, or platform authority');
assert(!/message\.(?:reason|detail|path|platform|manifest|registry|binary|secret|task)\b/.test(
  nativeWakeRuntimeSource
), 'checking parses only attempt and intent identity, never native detail');
assert(!/_delegationAction|createElement\(['"]button|success|toast/i.test(nativeWakeRenderSource),
  'checking creates no action, optimistic success, or toast surface');
assert(!htmlSource.includes('nativeWake') && !htmlSource.includes('native-wake'),
  'checking adds no static card or live region to sidepanel.html');

assert(/\.delegation-state-card\[data-delegation-state="native-wake-checking"\][^{]*\{[^}]*border-left-color:\s*var\(--fsb-info\)/s.test(cssSource),
  'checking card spends only the existing info token');
assert(/\.delegation-native-wake-spinner\s*\{[^}]*color:\s*var\(--fsb-info\)[^}]*animation:\s*delegation-native-wake-spin/s.test(cssSource),
  'checking spinner uses the info token and one named motion cue');
assert(/@media \(max-width: 350px\)[\s\S]*?\.delegation-native-wake-heading[\s\S]*?overflow-wrap:\s*anywhere[\s\S]*?\.delegation-native-wake-body/s.test(cssSource),
  'checking heading and body wrap at the approved narrow breakpoint');
assert(/@media \(forced-colors: active\)[\s\S]*?native-wake-checking[\s\S]*?CanvasText[\s\S]*?delegation-native-wake-spinner/s.test(cssSource),
  'forced-colors retains a card and spinner cue');
assert(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.delegation-native-wake-spinner[\s\S]*?animation:\s*none !important[\s\S]*?transition:\s*none !important[\s\S]*?transform:\s*none !important/s.test(cssSource),
  'reduced-motion removes all spinner motion');

(async function runInteractionContract() {
  {
    const previousChrome = globalThis.chrome;
    const sessionData = Object.create(null);
    globalThis.chrome = {
      storage: {
        session: {
          async get(keys) {
            if (keys == null) return clone(sessionData);
            const out = {};
            for (const key of Array.isArray(keys) ? keys : [keys]) {
              if (Object.hasOwn(sessionData, key)) out[key] = clone(sessionData[key]);
            }
            return out;
          },
          async set(update) { Object.assign(sessionData, clone(update)); },
          async remove(keys) {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete sessionData[key];
          }
        }
      }
    };
    try {
      const storePath = require.resolve('../extension/utils/delegation-event-store.js');
      const controllerPath = require.resolve('../extension/utils/delegation-controller.js');
      const matrix = [
        ['claude-code', 'unknown', '2.1.177'],
        ['opencode', 'unknown', '1.14.25'],
        ['codex', 'chatgpt', '0.142.5']
      ];
      let canonicalShape = null;
      for (let index = 0; index < matrix.length; index += 1) {
        for (const key of Object.keys(sessionData)) delete sessionData[key];
        delete require.cache[storePath];
        delete require.cache[controllerPath];
        const store = require(storePath);
        const Controller = require(controllerPath);
        const [providerId, authState, profileVersion] = matrix[index];
        const identity = DelegationProviders.createAcceptedAgentIdentity(providerId, authState);
        const deps = {
          eventStore: store,
          clock: {
            now: () => 1720000000000 + index,
            setTimeout: () => ({ unref() {} }),
            clearTimeout() {}
          },
          registry: {
            hydrate() {},
            listDelegationMappings() { return []; },
            getDelegationReleaseReceipt() { return null; }
          }
        };
        let controller = Controller.create(deps);
        await controller.hydrate();
        const delegationId = 'delegation_real_feed_6507_' + index;
        const started = await controller.start({ delegationId, acceptedIdentity: identity });
        assert.equal(started.snapshot.acceptedIdentity.profileVersion, profileVersion);
        assert.equal(started.snapshot.entries[0].init.profileVersion, profileVersion);
        assert.equal(Feed.validateSnapshot(started.snapshot), true);
        const liveContainer = new TestNode('div');
        assert.equal(Feed.render(liveContainer, started.snapshot, { hydrated: false }).ok, true);
        assert(!liveContainer.textContent.includes('Profile')
            && !liveContainer.textContent.includes(profileVersion),
          providerId + ' controller snapshot keeps its real profile internal');
        if (canonicalShape === null) canonicalShape = domShape(liveContainer);
        else assert.deepEqual(domShape(liveContainer), canonicalShape,
          providerId + ' controller snapshot uses the provider-neutral DOM shape');

        delete require.cache[storePath];
        delete require.cache[controllerPath];
        const hydratedStore = require(storePath);
        const HydratedController = require(controllerPath);
        controller = HydratedController.create({ ...deps, eventStore: hydratedStore });
        const restored = await controller.hydrate();
        assert.equal(restored.length, 1);
        assert.equal(restored[0].acceptedIdentity.profileVersion, profileVersion);
        const hydratedContainer = new TestNode('div');
        const hydratedRender = Feed.render(hydratedContainer, restored[0], { hydrated: true });
        assert.equal(hydratedRender.ok, true);
        assert.equal(hydratedRender.hydrated, true);
        assert.deepEqual(domShape(hydratedContainer), domShape(liveContainer),
          providerId + ' hydration silently recreates the same feed DOM');
      }
    } finally {
      if (previousChrome === undefined) delete globalThis.chrome;
      else globalThis.chrome = previousChrome;
    }
  }

  {
    const intentId = 'intent_native_wake_0001';
    const rawText = '  Preserve\nthese bytes\u00a0 ';
    const run = new TestNode('section');
    const stateCard = new TestNode('div');
    const feed = new TestNode('div');
    const control = new TestNode('div');
    const announcer = new TestNode('div');
    const chatInput = new TestNode('div');
    run.appendChild(stateCard);
    run.appendChild(feed);
    run.classList.add('hidden');
    feed.appendChild(new TestNode('article', 'stale feed row'));
    control.appendChild(new TestNode('button', 'stale action'));
    chatInput.textContent = rawText;
    const headers = [];
    let restoredStops = 0;
    const context = {
      document: globalThis.document,
      DELEGATION_NATIVE_WAKE_ID_PATTERN: /^[A-Za-z0-9_-]{16,64}$/,
      _delegationComposerEditRevision: 12,
      _delegationRunStopControls: [new TestNode('button')],
      _delegationUiState: {
        mode: 'ready',
        pendingPreflight: true,
        pendingIntentId: intentId,
        pendingAttemptId: null,
        pendingTask: 'Preserve\nthese bytes',
        pendingRawText: rawText,
        pendingEditRevision: 12,
        checkingIntentId: null,
        announcedTransitions: Object.create(null)
      },
      chatInput,
      _ensureDelegationMount: () => ({ run, state: stateCard, feed, control, announcer }),
      _clearDelegationElapsedTimer() {},
      _restoreLegacyStopControl() { restoredStops += 1; },
      _setDelegationHeaderStatus(label, tone) { headers.push({ label, tone }); }
    };
    vm.createContext(context);
    [
      '_delegationHasExactKeys',
      '_clearDelegationNode',
      '_delegationElement',
      '_delegationOneShotTransition',
      '_announceDelegationLifecycleKey',
      '_delegationIntentIsCurrent',
      '_delegationPreflightIntentIsCurrent',
      '_renderDelegationNativeWakeChecking',
      '_handleDelegationNativeWakeChecking'
    ].forEach((name) => vm.runInContext(extractNamedFunction(panelSource, name), context));

    assert.equal(context._handleDelegationNativeWakeChecking({
      type: 'FSB_NATIVE_WAKE_CHECKING',
      attemptId: 'attempt_native_wake_9999',
      intentId: 'intent_native_wake_wrong'
    }), false, 'wrong-intent event renders nothing');
    assert.equal(context._handleDelegationNativeWakeChecking({
      type: 'FSB_NATIVE_WAKE_CHECKING',
      attemptId: 'attempt_native_wake_9999',
      intentId,
      extra: true
    }), false, 'extra checking fields are rejected');
    assert.equal(stateCard.textContent, '');
    assert.equal(announcer.textContent, '');

    const checkingEvent = {
      type: 'FSB_NATIVE_WAKE_CHECKING',
      attemptId: 'attempt_native_wake_0001',
      intentId
    };
    assert.equal(context._handleDelegationNativeWakeChecking(checkingEvent), true);
    assert.equal(run.classList.contains('hidden'), false);
    assert.equal(run.getAttribute('aria-busy'), 'true');
    assert.equal(stateCard.getAttribute('data-delegation-state'), 'native-wake-checking');
    assert.equal(stateCard.getAttribute('data-delegation-tone'), 'info');
    assert(stateCard.className.includes('delegation-tone-info'));
    assert.equal(findAll(run, 'h2').length, 1, 'checking reuses the one state-card h2');
    assert.equal(findByClass(run, 'delegation-native-wake-spinner').length, 1,
      'checking renders one decorative spinner');
    assert.equal(findByClass(run, 'delegation-native-wake-spinner')[0].getAttribute('aria-hidden'), 'true');
    assert.equal(stateCard.textContent,
      'Checking local agent service'
        + 'FSB is trying to make the local agent service available. Your message has not been sent.');
    assert.equal(findAll(stateCard, 'button').length, 0, 'checking adds no action row');
    assert.equal(stateCard.getAttribute('role'), null, 'checking is not an alert');
    assert.equal(stateCard.getAttribute('aria-live'), null, 'the card is not a second live region');
    assert.equal(findAll(feed, 'article').length, 0, 'checking empties the existing feed');
    assert.equal(control.children.length, 0, 'checking empties the existing control bar');
    assert.equal(control.classList.contains('hidden'), true);
    assert.equal(chatInput.textContent, rawText, 'checking preserves exact composer bytes');
    assert.equal(chatInput.focusCount, 0, 'checking never moves composer focus');
    assert.deepEqual(headers, [{ label: 'Checking agent service', tone: '' }]);
    assert.equal(restoredStops, 1);
    assert.equal(announcer.textContent,
      'Checking local agent service. Your message has not been sent.');
    assert.equal(Object.keys(context._delegationUiState.announcedTransitions).length, 1,
      'one existing polite announcer delivery is keyed to the intent');
    assert.equal(context._handleDelegationNativeWakeChecking(checkingEvent), false,
      'duplicate attempt delivery is inert');
    assert.equal(Object.keys(context._delegationUiState.announcedTransitions).length, 1);

    context._delegationUiState.pendingPreflight = false;
    context._delegationUiState.pendingIntentId = null;
    assert.equal(context._handleDelegationNativeWakeChecking({
      ...checkingEvent,
      attemptId: 'attempt_native_wake_late'
    }), false, 'post-settlement event is inert');
    assert.equal(context._handleDelegationNativeWakeChecking({
      type: 'FSB_NATIVE_WAKE_CHECKING',
      attemptId: 'attempt_native_wake_boot',
      intentId: 'intent_native_wake_boot'
    }), false, 'boot/restored panel without a pending Send renders nothing');
  }

  {
    const rawText = '\u00a0  first line\nsecond line  ';
    const intentIds = ['intent_native_wake_1001', 'intent_native_wake_1002'];
    const chatInput = new TestNode('div');
    const sendBtn = new TestNode('button');
    chatInput.textContent = rawText;
    const preflightCommands = [];
    const preflightResolvers = [];
    let consentCalls = 0;
    let startCalls = 0;
    let legacyCalls = 0;
    let failureCalls = 0;
    let readyRenders = 0;
    let saveCalls = 0;
    const state = {
      mode: 'ready',
      task: null,
      challengeId: null,
      challengeExpiresAt: null,
      errorCode: null,
      composerLocked: false,
      pendingPreflight: false,
      pendingIntentId: null,
      pendingAttemptId: null,
      pendingTask: null,
      pendingRawText: null,
      pendingEditRevision: null,
      checkingIntentId: null,
      pendingStart: false
    };
    const context = {
      DELEGATION_NATIVE_WAKE_ID_PATTERN: /^[A-Za-z0-9_-]{16,64}$/,
      FsbDelegationProviders: DelegationProviders,
      _delegationComposerEditRevision: 4,
      _delegationUiState: state,
      chatInput,
      sendBtn,
      isRunning: false,
      _chatLockedByOwnerChip: false,
      _createDelegationIntentId: () => intentIds.shift(),
      async _isActiveTabForeignOwned() { return false; },
      _sendDelegationCommand(message) {
        if (message.type === 'FSB_DELEGATION_PREFLIGHT') {
          preflightCommands.push(clone(message));
          return new Promise((resolve) => preflightResolvers.push(resolve));
        }
        if (message.type === 'FSB_DELEGATION_CONSENT') consentCalls += 1;
        return Promise.resolve({ ok: false });
      },
      _handleLegacySendMessage() { legacyCalls += 1; },
      _renderDelegationPreflightFailure() { failureCalls += 1; },
      _delegationValidConsentResponse: () => false,
      _beginDelegationStart() { startCalls += 1; },
      _renderDelegationConsent() {},
      _renderDelegationReadyState() {
        readyRenders += 1;
        state.mode = 'ready';
      },
      updateSendButtonState() {
        sendBtn.disabled = state.pendingPreflight || chatInput.textContent.trim().length === 0;
      },
      debouncedSaveTask() { saveCalls += 1; }
    };
    vm.createContext(context);
    [
      '_delegationHasExactKeys',
      '_delegationOwnDataValue',
      '_delegationCanonicalProvider',
      '_delegationValidPreflightResponse',
      '_beginDelegationPreflightIntent',
      '_delegationIntentIsCurrent',
      '_delegationPreflightIntentIsCurrent',
      '_delegationContinuationIntentIsCurrent',
      '_clearDelegationPreflightIntent',
      '_continueDelegationPreflightIntent',
      '_handleDelegationComposerInput',
      'handleSendMessage'
    ].forEach((name) => vm.runInContext(extractNamedFunction(panelSource, name), context));

    const editedAttempt = context.handleSendMessage();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(preflightCommands, [{
      type: 'FSB_DELEGATION_PREFLIGHT',
      task: 'first line\nsecond line',
      intentId: 'intent_native_wake_1001'
    }], 'preflight adds only a safe intent id to the existing trimmed task contract: '
      + JSON.stringify(preflightCommands));
    assert.equal(state.pendingRawText, rawText, 'pending intent snapshots raw bytes verbatim');
    assert.equal(state.pendingTask, 'first line\nsecond line');
    assert.equal(state.pendingEditRevision, 4);
    assert.equal(sendBtn.disabled, true, 'pending Send suppresses duplicate Send without locking the composer');

    state.mode = 'native-wake-checking';
    state.checkingIntentId = 'intent_native_wake_1001';
    chatInput.textContent = rawText + 'edited';
    context._handleDelegationComposerInput();
    chatInput.textContent = rawText;
    context._handleDelegationComposerInput();
    assert.equal(context._delegationComposerEditRevision, 6,
      'every input event advances the monotonic edit revision');
    assert.equal(state.pendingPreflight, false, 'first edit clears the pending intent immediately');
    assert.equal(state.pendingIntentId, null);
    assert.equal(state.mode, 'ready', 'first edit clears the checking presentation');
    assert.equal(sendBtn.disabled, false, 'restored bytes still require and allow a fresh explicit Send');
    preflightResolvers[0]({
      ok: true,
      kind: 'agent',
      providerId: 'claude-code',
      providerLabel: 'Claude Code'
    });
    await editedAttempt;
    assert.equal(consentCalls, 0, 'edited captured task never reaches consent');
    assert.equal(startCalls, 0, 'edited captured task never starts');
    assert.equal(legacyCalls, 0);
    assert.equal(failureCalls, 0);
    assert.equal(state.challengeId, null);
    assert.equal(state.challengeExpiresAt, null);
    assert.equal(chatInput.textContent, rawText, 'edit-then-revert cannot revive captured bytes');
    assert.equal(readyRenders, 1);
    assert.equal(saveCalls, 2, 'the pre-existing composer persistence path still sees both real edits');

    const rawMismatchAttempt = context.handleSendMessage();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(preflightCommands.length, 2, 'only a fresh Send creates another intent');
    chatInput.textContent = rawText + '\n';
    preflightResolvers[1]({
      ok: true,
      kind: 'agent',
      providerId: 'claude-code',
      providerLabel: 'Claude Code'
    });
    await rawMismatchAttempt;
    assert.equal(consentCalls, 0, 'byte mismatch fences continuation even without a delivered input event');
    assert.equal(startCalls, 0);
    assert.equal(state.pendingPreflight, false);
  }

  {
    const run = new TestNode('section');
    const stateCard = new TestNode('div');
    const feed = new TestNode('div');
    const control = new TestNode('div');
    run.appendChild(stateCard);
    run.appendChild(feed);
    const headers = [];
    const composerLocks = [];
    const context = {
      document: globalThis.document,
      FsbDelegationProviders: DelegationProviders,
      _delegationUiState: { mode: 'ready', errorCode: null },
      _delegationRunStopControls: [],
      _ensureDelegationMount: () => ({ run, state: stateCard, feed, control }),
      _clearDelegationElapsedTimer() {},
      _restoreLegacyStopControl() {},
      _copyDelegationDoctorCommand() {},
      _openDelegationProviderSetup() {},
      _backToDelegationMessage() {},
      _setDelegationHeaderStatus(label, tone) { headers.push({ label, tone }); },
      _setDelegationComposerLocked(value) { composerLocks.push(value); }
    };
    vm.createContext(context);
    [
      '_clearDelegationNode',
      '_delegationElement',
      '_delegationSemanticIcon',
      '_delegationSemanticHeading',
      '_delegationAction',
      '_delegationOwnDataValue',
      '_delegationCanonicalProvider',
      '_renderDelegationPreflightFailure'
    ].forEach((name) => vm.runInContext(extractNamedFunction(panelSource, name), context));

    context._renderDelegationPreflightFailure({
      ok: false,
      code: 'agent_offline',
      providerId: 'claude-code',
      providerLabel: 'Claude Code'
    });
    assert.equal(run.getAttribute('aria-busy'), 'false');
    assert.equal(stateCard.getAttribute('role'), 'alert');
    assert.equal(findAll(stateCard, 'h2')[0].focusCount, 1,
      'offline convergence preserves the existing focused alert heading');
    assert.equal(findAll(stateCard, 'h2')[0].textContent, 'Agent offline');
    assert(stateCard.textContent.includes(
      'FSB cannot reach the local agent service. Run the doctor command, then try this message again.'
    ));
    assert.deepEqual(findAll(stateCard, 'button').map((button) => button.textContent), [
      'Copy doctor command', 'Open provider setup'
    ]);
    assert.equal(findAll(stateCard, 'code')[0].textContent, 'fsb-mcp-server doctor');
    assert.deepEqual(headers[0], { label: 'Agent offline', tone: 'error' });
    assert.equal(composerLocks[0], false);

    context._renderDelegationPreflightFailure({
      ok: false,
      code: 'agent_unpaired',
      providerId: 'claude-code',
      providerLabel: 'Claude Code'
    });
    assert.equal(stateCard.getAttribute('role'), null,
      'unpaired convergence retains its non-alert existing pairing state');
    assert.equal(findAll(stateCard, 'h2')[0].focusCount, 1,
      'unpaired convergence preserves the existing focused heading');
    assert.equal(findAll(stateCard, 'h2')[0].textContent,
      'Pair this browser before starting Claude Code');
    assert(stateCard.textContent.includes(
      'FSB can reach the local agent service, but this browser has not been paired with it. Open provider setup, pair this browser, then try this message again.'
    ));
    assert.deepEqual(findAll(stateCard, 'button').map((button) => button.textContent), [
      'Open provider setup'
    ]);
    assert.equal(findAll(stateCard, 'code').length, 0);
    assert.deepEqual(headers[1], { label: 'Ready', tone: '' });
    assert.equal(composerLocks[1], false);

    context._renderDelegationPreflightFailure({
      ok: false,
      code: 'start_rejected',
      providerId: 'opencode',
      providerLabel: 'OpenCode'
    });
    assert.equal(findAll(stateCard, 'h2')[0].textContent, 'OpenCode cannot start this task');
    assert(stateCard.textContent.includes(
      'OpenCode sign-in changed before this run. Refresh provider status and review the billing method before trying again.'
    ));
    assert.deepEqual(findAll(stateCard, 'button').map((button) => button.textContent), [
      'Open provider setup', 'Back to message'
    ]);
    assert.equal(stateCard.getAttribute('role'), null,
      'not-ready OpenCode reuses the existing non-alert preflight state');
    assert.deepEqual(headers[2], { label: 'Ready', tone: '' });
    assert.equal(composerLocks[2], false);
  }

  {
    async function runSettlementScenario(preflight, consent) {
      const commands = [];
      const failures = [];
      const consentRenders = [];
      const starts = [];
      let legacyCalls = 0;
      let readyRenders = 0;
      let announcementCalls = 0;
      const chatInput = new TestNode('div');
      const sendBtn = new TestNode('button');
      chatInput.textContent = '  Keep this task unsent  ';
      const state = {
        mode: 'ready',
        task: null,
        providerId: null,
        providerLabel: null,
        challengeId: null,
        challengeExpiresAt: null,
        errorCode: null,
        composerLocked: false,
        pendingPreflight: false,
        pendingContinuation: false,
        pendingIntentId: null,
        pendingAttemptId: null,
        pendingTask: null,
        pendingRawText: null,
        pendingEditRevision: null,
        checkingIntentId: null,
        pendingStart: false
      };
      const context = {
        DELEGATION_NATIVE_WAKE_ID_PATTERN: /^[A-Za-z0-9_-]{16,64}$/,
        FsbDelegationProviders: DelegationProviders,
        _delegationComposerEditRevision: 0,
        _delegationUiState: state,
        chatInput,
        sendBtn,
        isRunning: false,
        _chatLockedByOwnerChip: false,
        _createDelegationIntentId: () => 'intent_native_wake_table',
        async _isActiveTabForeignOwned() { return false; },
        async _sendDelegationCommand(message) {
          commands.push(clone(message));
          return message.type === 'FSB_DELEGATION_PREFLIGHT' ? preflight : consent;
        },
        async _handleLegacySendMessage() { legacyCalls += 1; },
        _renderDelegationPreflightFailure(result) { failures.push(clone(result)); },
        _renderDelegationConsent(options) { consentRenders.push(clone(options)); },
        async _beginDelegationStart(challengeId) { starts.push(challengeId); },
        _renderDelegationReadyState() {
          readyRenders += 1;
          state.mode = 'ready';
        },
        _announceDelegationLifecycleKey() { announcementCalls += 1; },
        updateSendButtonState() {}
      };
      vm.createContext(context);
      [
        '_delegationHasExactKeys',
        '_delegationOwnDataValue',
        '_delegationCanonicalProvider',
        '_delegationValidPreflightResponse',
        '_delegationValidConsentResponse',
        '_beginDelegationPreflightIntent',
        '_delegationIntentIsCurrent',
        '_delegationPreflightIntentIsCurrent',
        '_delegationContinuationIntentIsCurrent',
        '_clearDelegationPreflightIntent',
        '_continueDelegationPreflightIntent',
        'handleSendMessage'
      ].forEach((name) => vm.runInContext(extractNamedFunction(panelSource, name), context));
      await context.handleSendMessage();
      return {
        commands,
        failures,
        consentRenders,
        starts,
        legacyCalls,
        readyRenders,
        announcementCalls,
        state,
        chatInput
      };
    }

    const ready = {
      ok: true,
      kind: 'agent',
      providerId: 'claude-code',
      providerLabel: 'Claude Code'
    };
    const trusted = await runSettlementScenario(ready, {
      ok: true,
      providerId: 'claude-code',
      providerLabel: 'Claude Code',
      trusted: true,
      challengeId: null,
      expiresAt: null
    });
    assert.deepEqual(trusted.starts, [null],
      'unchanged ready/trusted convergence enters the existing start path once');
    assert.deepEqual(trusted.consentRenders, []);
    assert.deepEqual(trusted.failures, []);
    assert.equal(trusted.legacyCalls, 0);
    assert.equal(trusted.announcementCalls, 0, 'native success adds no announcement');
    assert.equal(trusted.readyRenders, 0, 'native success adds no success or ready card');
    assert.equal(trusted.chatInput.focusCount, 0, 'native success adds no focus stop');
    assert.deepEqual(trusted.commands, [{
      type: 'FSB_DELEGATION_PREFLIGHT',
      task: 'Keep this task unsent',
      intentId: 'intent_native_wake_table'
    }, {
      type: 'FSB_DELEGATION_CONSENT',
      task: 'Keep this task unsent'
    }]);

    const needsConsent = await runSettlementScenario(ready, {
      ok: true,
      providerId: 'claude-code',
      providerLabel: 'Claude Code',
      trusted: false,
      challengeId: 'challenge_native_wake',
      expiresAt: 12345
    });
    assert.deepEqual(needsConsent.starts, []);
    assert.deepEqual(needsConsent.consentRenders, [{ focusHeading: true }],
      'unchanged ready/untrusted convergence enters the existing consent presentation');
    assert.equal(needsConsent.state.challengeId, 'challenge_native_wake');
    assert.equal(needsConsent.state.challengeExpiresAt, 12345);
    assert.equal(needsConsent.announcementCalls, 0);

    const openCodeReady = {
      ok: true,
      kind: 'agent',
      providerId: 'opencode',
      providerLabel: 'OpenCode'
    };
    const openCodeConsent = await runSettlementScenario(openCodeReady, {
      ok: true,
      providerId: 'opencode',
      providerLabel: 'OpenCode',
      trusted: false,
      challengeId: 'challenge_opencode_wake',
      expiresAt: 12345
    });
    assert.deepEqual(openCodeConsent.starts, []);
    assert.deepEqual(openCodeConsent.consentRenders, [{ focusHeading: true }]);
    assert.equal(openCodeConsent.state.providerId, 'opencode');
    assert.equal(openCodeConsent.state.providerLabel, 'OpenCode');
    assert.equal(openCodeConsent.state.challengeId, 'challenge_opencode_wake');
    assert.deepEqual(openCodeConsent.commands, [{
      type: 'FSB_DELEGATION_PREFLIGHT',
      task: 'Keep this task unsent',
      intentId: 'intent_native_wake_table'
    }, {
      type: 'FSB_DELEGATION_CONSENT',
      task: 'Keep this task unsent'
    }], 'OpenCode reuses one provider-free preflight/consent path');

    const mismatchedConsent = await runSettlementScenario(openCodeReady, {
      ok: true,
      providerId: 'claude-code',
      providerLabel: 'Claude Code',
      trusted: false,
      challengeId: 'challenge_identity_switch',
      expiresAt: 12345
    });
    assert.deepEqual(mismatchedConsent.starts, [], 'mismatched consent cannot start');
    assert.equal(mismatchedConsent.consentRenders.length, 0,
      'mismatched consent cannot create a prompt');
    assert.equal(mismatchedConsent.failures.length, 1,
      'mismatched consent converges through one existing failure surface');

    const failureCases = [
      {
        name: 'wake/offline/readiness timeout',
        response: {
          ok: false,
          code: 'agent_offline',
          providerId: 'claude-code',
          providerLabel: 'Claude Code'
        },
        expected: {
          ok: false,
          code: 'agent_offline',
          providerId: 'claude-code',
          providerLabel: 'Claude Code'
        }
      },
      {
        name: 'runtime unavailable',
        response: {
          ok: false,
          code: 'runtime_unavailable',
          providerId: '',
          providerLabel: 'Selected provider'
        },
        expected: {
          ok: false,
          code: 'runtime_unavailable',
          providerId: '',
          providerLabel: 'Selected provider'
        }
      },
      {
        name: 'reachable unpaired',
        response: {
          ok: false,
          code: 'agent_unpaired',
          providerId: 'claude-code',
          providerLabel: 'Claude Code'
        },
        expected: {
          ok: false,
          code: 'agent_unpaired',
          providerId: 'claude-code',
          providerLabel: 'Claude Code'
        }
      },
      {
        name: 'malformed rerun result',
        response: { ok: true, nativeReason: 'must not render' },
        expected: {
          ok: false,
          code: 'agent_offline',
          providerId: '',
          providerLabel: 'Selected provider'
        }
      }
    ];
    for (const scenario of failureCases) {
      const result = await runSettlementScenario(scenario.response, null);
      assert.deepEqual(result.failures, [scenario.expected],
        scenario.name + ' converges through the existing preflight failure renderer');
      assert.deepEqual(result.starts, [], scenario.name + ' cannot start');
      assert.deepEqual(result.consentRenders, [], scenario.name + ' cannot create consent');
      assert.equal(result.announcementCalls, 0, scenario.name + ' adds no native announcement');
      assert.equal(result.state.pendingPreflight, false);
      assert.equal(result.state.pendingIntentId, null);
    }
  }

  {
    let resolveConsent;
    let startCalls = 0;
    let consentRenders = 0;
    const chatInput = new TestNode('div');
    chatInput.textContent = 'Do not start edited bytes';
    const state = {
      mode: 'ready',
      composerLocked: false,
      pendingPreflight: false,
      pendingContinuation: false,
      pendingIntentId: null,
      pendingAttemptId: null,
      pendingTask: null,
      pendingRawText: null,
      pendingEditRevision: null,
      checkingIntentId: null,
      pendingStart: false
    };
    const context = {
      DELEGATION_NATIVE_WAKE_ID_PATTERN: /^[A-Za-z0-9_-]{16,64}$/,
      FsbDelegationProviders: DelegationProviders,
      _delegationComposerEditRevision: 0,
      _delegationUiState: state,
      chatInput,
      isRunning: false,
      _createDelegationIntentId: () => 'intent_native_wake_consent',
      async _isActiveTabForeignOwned() { return false; },
      _sendDelegationCommand(message) {
        if (message.type === 'FSB_DELEGATION_PREFLIGHT') {
          return Promise.resolve({
            ok: true,
            kind: 'agent',
            providerId: 'claude-code',
            providerLabel: 'Claude Code'
          });
        }
        return new Promise((resolve) => { resolveConsent = resolve; });
      },
      _handleLegacySendMessage() {},
      _renderDelegationPreflightFailure() {},
      _renderDelegationConsent() { consentRenders += 1; },
      _beginDelegationStart() { startCalls += 1; },
      _renderDelegationReadyState() { state.mode = 'ready'; },
      updateSendButtonState() {},
      debouncedSaveTask() {}
    };
    vm.createContext(context);
    [
      '_delegationHasExactKeys',
      '_delegationOwnDataValue',
      '_delegationCanonicalProvider',
      '_delegationValidPreflightResponse',
      '_delegationValidConsentResponse',
      '_beginDelegationPreflightIntent',
      '_delegationIntentIsCurrent',
      '_delegationPreflightIntentIsCurrent',
      '_delegationContinuationIntentIsCurrent',
      '_clearDelegationPreflightIntent',
      '_continueDelegationPreflightIntent',
      '_handleDelegationComposerInput',
      'handleSendMessage'
    ].forEach((name) => vm.runInContext(extractNamedFunction(panelSource, name), context));
    const pending = context.handleSendMessage();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(state.pendingContinuation, true, 'ready preflight remains fenced through consent lookup');
    chatInput.textContent = 'Do not start edited bytes!';
    context._handleDelegationComposerInput();
    resolveConsent({
      ok: true,
      providerId: 'claude-code',
      providerLabel: 'Claude Code',
      trusted: true,
      challengeId: null,
      expiresAt: null
    });
    await pending;
    assert.equal(startCalls, 0, 'edit during trusted consent lookup cannot start');
    assert.equal(consentRenders, 0, 'edit during consent lookup cannot render stale consent');
    assert.equal(state.pendingIntentId, null);
  }

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
      errorCode: null, challengeId: 'dch_fixture',
      providerId: 'opencode', providerLabel: 'OpenCode'
    };
    const context = {
      FsbDelegationProviders: DelegationProviders,
      _delegationUiState: state,
      _renderDelegationConsent() {},
      _sendDelegationCommand(message) {
        commands.push(clone(message));
        return new Promise((resolve) => { resolveTrust = resolve; });
      },
      async _beginDelegationStart(challengeId) { starts.push(challengeId); }
    };
    vm.createContext(context);
    [
      '_delegationHasExactKeys',
      '_delegationOwnDataValue',
      '_delegationCanonicalProvider',
      '_delegationValidTrustResponse'
    ].forEach((name) => vm.runInContext(extractNamedFunction(panelSource, name), context));
    vm.runInContext(extractNamedFunction(panelSource, '_allowDelegationFromConsent'), context);
    const pending = context._allowDelegationFromConsent({ checked: true });
    assert.deepEqual(commands, [{
      type: 'FSB_DELEGATION_SET_TRUST',
      challengeId: 'dch_fixture',
      providerId: 'opencode',
      trusted: true
    }]);
    assert.equal(starts.length, 0, 'checked trust does not start before trust authority succeeds');
    resolveTrust({ ok: true, providerId: 'opencode', trusted: true });
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
    const task = 'keep this exact delegated task';
    const accepted = snapshot({
      state: 'running',
      summary: summary({ state: 'running' }),
      terminal: null,
      hydrated: false
    });
    const stopping = snapshot({
      state: 'stopping',
      summary: summary({ state: 'running' }),
      terminal: null,
      hydrated: false
    });
    const stopped = snapshot({
      state: 'stopped',
      summary: summary({ state: 'stopped' }),
      terminal: { code: 'stopped', releasedTabCount: 1 },
      hydrated: false
    });
    const treeUnsettled = snapshot({
      state: 'failed',
      summary: summary({ state: 'failed' }),
      terminal: { code: 'tree_unsettled', releasedTabCount: 0 },
      hydrated: false
    });
    const mismatchedStopped = clone(stopped);
    mismatchedStopped.delegationId = 'delegation_other';
    mismatchedStopped.entries.forEach((row) => { row.delegationId = 'delegation_other'; });

    function makeBindingFailureHarness(stopOutcomes) {
      const commands = [];
      const inlineErrors = [];
      const preflightFailures = [];
      const rendered = [];
      const stateNode = new TestNode('div');
      const counts = { ready: 0, added: 0, persisted: 0 };
      const outcomes = stopOutcomes.slice();
      const state = {
        conversationId: 'conv_selected',
        pendingStart: false,
        pendingStop: false,
        task,
        providerId: 'claude-code',
        providerLabel: 'Claude Code',
        errorCode: null,
        challengeId: 'consumed-challenge',
        challengeExpiresAt: 12345,
        delegationId: null,
        snapshot: null,
        bindingCleanupPending: false,
        bindingCleanupOriginKey: null,
        subscribed: false
      };
      const context = {
        FsbDelegationFeed: Feed,
        DELEGATION_UNBOUND_CLEANUP_CAP: 8,
        _delegationUnboundCleanupByOrigin: new Map(),
        _activeTabIdSnapshot: 42,
        conversationId: 'conv_selected',
        _delegationUiState: state,
        chatInput: { textContent: task },
        async _sendDelegationCommand(message) {
          commands.push(clone(message));
          if (message.type === 'FSB_DELEGATION_START') {
            return { ok: true, snapshot: clone(accepted) };
          }
          const outcome = outcomes.shift();
          if (outcome instanceof Error) throw outcome;
          const resolved = outcome && typeof outcome.then === 'function'
            ? await outcome
            : outcome;
          return clone(resolved);
        },
        _delegationValidConversationId: (value) => /^conv_[A-Za-z0-9_-]+$/.test(value),
        async ensureTabConversationForTab() {
          context.conversationId = 'conv_generated';
          return 'conv_generated';
        },
        async ensureTabConversationForActiveTab() {
          context.conversationId = 'conv_generated';
          return 'conv_generated';
        },
        _writeDelegationConversationBinding: async () => false,
        _renderDelegationReadyState() {
          counts.ready += 1;
          state.errorCode = null;
        },
        _ensureDelegationMount: () => ({ state: stateNode }),
        _renderDelegationInlineError(_container, text) { inlineErrors.push(text); },
        _renderDelegationPreflightFailure(result) { preflightFailures.push(clone(result)); },
        updateSendButtonState() {},
        _persistMessageToConversation() { counts.persisted += 1; },
        _resetDelegationSelection() { throw new Error('unbound run cannot become selected'); },
        addMessage() { counts.added += 1; },
        _renderDelegationSnapshot(next) { rendered.push(clone(next)); },
        async _refreshSelectedDelegationSnapshot() {
          throw new Error('unbound run cannot refresh');
        },
        _delegationIsSelectedConversation: () => state.conversationId === context.conversationId,
        _syncDelegationStopControls() {},
        _announceDelegationLifecycleKey() {}
      };
      vm.createContext(context);
      [
        '_delegationHasExactKeys',
        '_delegationValidLifecycleResponse',
        '_delegationStopProvesTerminal',
        '_delegationExactStopSnapshot',
        '_delegationUnboundCleanupKey',
        '_delegationRememberUnboundCleanup',
        '_delegationUpdateUnboundCleanup',
        '_delegationForgetUnboundCleanup',
        '_delegationUnboundCleanupForSelection',
        '_delegationOriginIsSelected',
        '_delegationReserveUnboundCleanup',
        '_delegationMoveCleanupReservation',
        '_delegationReleaseCleanupReservation',
        '_delegationIsActiveSnapshot',
        '_delegationStopIsActionable',
        '_renderDelegationBindingFailureReady',
        '_retainUnboundDelegationCleanup',
        '_beginDelegationStart',
        '_stopDelegation'
      ].forEach((name) => vm.runInContext(extractNamedFunction(panelSource, name), context));
      return {
        commands, context, counts, inlineErrors, outcomes, preflightFailures, rendered, state, stateNode
      };
    }

    const successful = makeBindingFailureHarness([{ ok: true, snapshot: stopped }]);
    await successful.context._beginDelegationStart(null);
    assert.deepEqual(successful.commands, [
      { type: 'FSB_DELEGATION_START', challengeId: null, task },
      { type: 'FSB_DELEGATION_STOP', delegationId: DELEGATION_ID }
    ]);
    assert.equal(successful.state.delegationId, null);
    assert.equal(successful.state.snapshot, null);
    assert.equal(successful.state.bindingCleanupPending, false);
    assert.equal(successful.context._delegationUnboundCleanupByOrigin.size, 0,
      'exact terminal compensation prunes the origin-scoped cleanup record');
    assert.equal(successful.state.errorCode, 'delegation_binding_persistence_failed');
    assert.equal(successful.stateNode.getAttribute('role'), 'alert');
    assert.deepEqual(successful.inlineErrors, [
      'FSB could not save this agent run. Stop was confirmed for that exact run, and your message was kept. Try again.'
    ]);
    assert.equal(successful.counts.ready, 1);
    assert.equal(successful.rendered.length, 0,
      'exact terminal compensation never presents an unbound accepted run');

    const unsettledCases = [
      {
        name: 'structured cleanup failure',
        response: { ok: false, code: 'stop_failed', snapshot: stopping },
        expectedSnapshot: stopping
      },
      {
        name: 'tree-unsettled terminal',
        response: { ok: true, snapshot: treeUnsettled },
        expectedSnapshot: treeUnsettled
      },
      {
        name: 'invalid response',
        response: { ok: true, snapshot: stopped, extra: true },
        expectedSnapshot: accepted
      },
      {
        name: 'mismatched response',
        response: { ok: true, snapshot: mismatchedStopped },
        expectedSnapshot: accepted
      },
      {
        name: 'throwing Stop transport',
        response: new Error('fixture Stop transport rejection'),
        expectedSnapshot: accepted
      }
    ];
    for (const item of unsettledCases) {
      const harness = makeBindingFailureHarness([item.response]);
      await harness.context._beginDelegationStart(null);
      assert.equal(harness.state.delegationId, DELEGATION_ID,
        `${item.name} retains the accepted exact id`);
      assert.deepEqual(harness.state.snapshot, item.expectedSnapshot,
        `${item.name} retains the best exact authoritative snapshot`);
      assert.equal(harness.state.bindingCleanupPending, true,
        `${item.name} remains explicitly actionable`);
      assert.equal(harness.context._delegationStopIsActionable(harness.state.snapshot), true,
        `${item.name} retains a retryable delegated Stop`);
      assert.equal(harness.context._delegationUnboundCleanupByOrigin.size, 1,
        `${item.name} retains one memory-only origin record`);
      assert.equal(harness.state.errorCode, 'delegation_binding_cleanup_unsettled');
      assert.equal(harness.state.task, task);
      assert.equal(harness.context.chatInput.textContent, task);
      assert.equal(harness.state.pendingStart, false);
      assert.equal(harness.state.challengeId, null);
      assert.equal(harness.counts.ready, 0,
        `${item.name} cannot render a false ready state`);
      assert.equal(harness.rendered.length, 1,
        `${item.name} renders the retained authority`);
      assert.deepEqual(harness.commands[1], {
        type: 'FSB_DELEGATION_STOP', delegationId: DELEGATION_ID
      });
      assert.equal(harness.counts.added, 0,
        `${item.name} keeps the task out of chat history`);
      assert.equal(harness.counts.persisted, 0,
        `${item.name} does not invent persisted accepted history`);
    }

    const retry = makeBindingFailureHarness([
      { ok: false, code: 'stop_failed', snapshot: stopping },
      { ok: true, snapshot: stopped }
    ]);
    await retry.context._beginDelegationStart(null);
    await retry.context._stopDelegation({ currentTarget: new TestNode('button') });
    assert.deepEqual(retry.commands, [
      { type: 'FSB_DELEGATION_START', challengeId: null, task },
      { type: 'FSB_DELEGATION_STOP', delegationId: DELEGATION_ID },
      { type: 'FSB_DELEGATION_STOP', delegationId: DELEGATION_ID }
    ], 'retry reuses only the exact accepted delegation id');
    assert.equal(retry.state.delegationId, null);
    assert.equal(retry.state.snapshot, null);
    assert.equal(retry.state.bindingCleanupPending, false);
    assert.equal(retry.context._delegationUnboundCleanupByOrigin.size, 0,
      'retry terminal proof prunes only its exact origin record');
    assert.equal(retry.state.pendingStop, false);
    assert.equal(retry.state.errorCode, 'delegation_binding_persistence_failed');
    assert.equal(retry.context.chatInput.textContent, task,
      'successful retry restores the exact unconsumed composer task');
    assert.equal(retry.counts.ready, 1);
    assert.equal(retry.counts.added, 0);
    assert.equal(retry.counts.persisted, 0,
      'cleanup success creates no hidden accepted history');

    let resolveRacingStop;
    const racingStop = new Promise((resolve) => { resolveRacingStop = resolve; });
    const raced = makeBindingFailureHarness([racingStop]);
    const racedStart = raced.context._beginDelegationStart(null);
    for (let turn = 0; turn < 10 && raced.commands.length < 2; turn += 1) {
      await Promise.resolve();
    }
    assert.equal(raced.commands.length, 2,
      'compensating Stop is pending before the origin selection changes');
    raced.context._activeTabIdSnapshot = 99;
    raced.context.conversationId = 'conv_other';
    Object.assign(raced.state, {
      conversationId: 'conv_other',
      delegationId: null,
      snapshot: null,
      task: 'other conversation draft',
      errorCode: null,
      pendingStart: false,
      pendingStop: false,
      bindingCleanupPending: false,
      bindingCleanupOriginKey: null,
      subscribed: true
    });
    raced.context.chatInput.textContent = 'other conversation draft';
    resolveRacingStop({ ok: false, code: 'stop_failed', snapshot: stopping });
    await racedStart;
    assert.equal(raced.state.conversationId, 'conv_other');
    assert.equal(raced.state.delegationId, null);
    assert.equal(raced.state.task, 'other conversation draft');
    assert.equal(raced.context.chatInput.textContent, 'other conversation draft',
      'late cleanup failure never hijacks the newly selected composer');
    assert.equal(raced.rendered.length, 0,
      'late cleanup failure does not render into the new selection');
    const racedRecord = raced.context._delegationUnboundCleanupByOrigin.get(
      '42:conv_selected'
    );
    assert(racedRecord, 'origin-scoped memory retains the switched-away run');
    assert.equal(racedRecord.delegationId, DELEGATION_ID);
    assert.equal(racedRecord.pendingStop, false);

    raced.context._activeTabIdSnapshot = 42;
    raced.context.conversationId = 'conv_selected';
    raced.context._delegationHydrationGeneration = 0;
    raced.context._delegationForConversation = () => null;
    raced.context._lastUserTaskByConversation = new Map();
    raced.context._resetDelegationSelection = (selectedConversationId) => {
      Object.assign(raced.state, {
        conversationId: selectedConversationId,
        delegationId: null,
        snapshot: null,
        task: null,
        errorCode: null,
        pendingStart: false,
        pendingStop: false,
        bindingCleanupPending: false,
        bindingCleanupOriginKey: null,
        subscribed: false
      });
    };
    vm.runInContext(
      extractNamedFunction(panelSource, '_hydrateDelegationForSelectedConversation'),
      raced.context
    );
    assert.equal(await raced.context._hydrateDelegationForSelectedConversation(), true);
    assert.equal(raced.state.delegationId, DELEGATION_ID,
      'returning to the origin selection resurfaces the exact accepted id');
    assert.equal(raced.state.bindingCleanupPending, true);
    assert.equal(raced.state.bindingCleanupOriginKey, '42:conv_selected');
    assert.equal(raced.state.task, task);
    assert.equal(raced.context.chatInput.textContent, task);
    assert.equal(raced.commands.length, 2,
      'memory-only cleanup hydration invents no persisted snapshot command');
    raced.outcomes.push({ ok: true, snapshot: stopped });
    await raced.context._stopDelegation({ currentTarget: new TestNode('button') });
    assert.deepEqual(raced.commands[2], {
      type: 'FSB_DELEGATION_STOP', delegationId: DELEGATION_ID
    });
    assert.equal(raced.context._delegationUnboundCleanupByOrigin.size, 0);
    assert.equal(raced.state.delegationId, null);
    assert.equal(raced.context.chatInput.textContent, task);

    const freshTab = makeBindingFailureHarness([
      { ok: false, code: 'stop_failed', snapshot: stopping }
    ]);
    freshTab.context.conversationId = null;
    freshTab.state.conversationId = null;
    await freshTab.context._beginDelegationStart(null);
    assert.equal(freshTab.context.conversationId, 'conv_generated');
    assert.equal(freshTab.state.conversationId, 'conv_generated');
    assert.equal(freshTab.state.bindingCleanupOriginKey, '42:conv_generated');
    assert(freshTab.context._delegationUnboundCleanupByOrigin.has('42:conv_generated'),
      'fresh-tab reservation moves to the conversation identity hydration will select');
    assert(!freshTab.context._delegationUnboundCleanupByOrigin.has('42:<no-conversation>'));
    assert.equal(freshTab.context._delegationStopIsActionable(freshTab.state.snapshot), true);

    const reservations = makeBindingFailureHarness([]);
    const reservedKeys = [];
    for (let index = 0; index < 8; index += 1) {
      reservedKeys.push(reservations.context._delegationReserveUnboundCleanup(
        100 + index,
        `conv_reserved_${index}`
      ));
    }
    assert(reservedKeys.every(Boolean),
      'each origin claims its cleanup slot synchronously before async start work');
    assert.equal(reservations.context._delegationReserveUnboundCleanup(
      200,
      'conv_reserved_overflow'
    ), null, 'the ninth concurrent origin cannot overrun cleanup capacity');
    assert.equal(reservations.context._delegationUnboundCleanupByOrigin.size, 8);
    assert(Array.from(reservations.context._delegationUnboundCleanupByOrigin.values())
      .every((record) => record.reserved === true && record.delegationId === null),
      'capacity contains only live pre-acceptance reservations and evicts none');
    reservedKeys.forEach((key) => {
      assert.equal(reservations.context._delegationReleaseCleanupReservation(key), true);
    });
    assert.equal(reservations.context._delegationUnboundCleanupByOrigin.size, 0);

    const rejectedStart = makeBindingFailureHarness([]);
    rejectedStart.state.challengeId = 'stale-auth-challenge';
    rejectedStart.state.challengeExpiresAt = 99999;
    rejectedStart.context._sendDelegationCommand = async (message) => {
      rejectedStart.commands.push(clone(message));
      return { ok: false, code: 'start_rejected', snapshot: null };
    };
    await rejectedStart.context._beginDelegationStart(null);
    assert.equal(rejectedStart.context._delegationUnboundCleanupByOrigin.size, 0,
      'rejected start releases its synchronous cleanup reservation');
    assert.deepEqual(rejectedStart.preflightFailures, [{
      ok: false,
      code: 'start_rejected',
      providerId: 'claude-code',
      providerLabel: 'Claude Code'
    }], 'not-ready start rejection reuses one existing provider-labelled failure surface');
    assert.equal(rejectedStart.state.challengeId, null,
      'immediate accepted-identity rejection clears the stale consent challenge');
    assert.equal(rejectedStart.state.challengeExpiresAt, null,
      'immediate accepted-identity rejection clears stale consent expiry');

    const committedBinding = makeBindingFailureHarness([]);
    committedBinding.context._writeDelegationConversationBinding = async () => {
      committedBinding.context._activeTabIdSnapshot = 99;
      committedBinding.context.conversationId = 'conv_other';
      return true;
    };
    await committedBinding.context._beginDelegationStart(null);
    assert.equal(committedBinding.context._delegationUnboundCleanupByOrigin.size, 0,
      'successful session binding releases its no-longer-needed cleanup reservation');
    assert.equal(committedBinding.counts.persisted, 1,
      'selection-switch behavior remains unchanged after a committed binding');

    const capacity = makeBindingFailureHarness([]);
    capacity.context.DELEGATION_UNBOUND_CLEANUP_CAP = 2;
    const pendingOne = clone(accepted);
    pendingOne.delegationId = 'delegation_pending_one';
    pendingOne.entries.forEach((row) => { row.delegationId = pendingOne.delegationId; });
    const pendingTwo = clone(accepted);
    pendingTwo.delegationId = 'delegation_pending_two';
    pendingTwo.entries.forEach((row) => { row.delegationId = pendingTwo.delegationId; });
    assert(capacity.context._delegationRememberUnboundCleanup(
      7, 'conv_pending_one', pendingOne, 'pending one', false
    ));
    assert(capacity.context._delegationRememberUnboundCleanup(
      8, 'conv_pending_two', pendingTwo, 'pending two', false
    ));
    await capacity.context._beginDelegationStart(null);
    assert.deepEqual(capacity.commands, [],
      'full cleanup capacity rejects before accepting another agent run');
    assert.deepEqual(
      Array.from(capacity.context._delegationUnboundCleanupByOrigin.values())
        .map((record) => record.delegationId),
      ['delegation_pending_one', 'delegation_pending_two'],
      'capacity guard never evicts an unsettled exact id'
    );
    assert.equal(capacity.context._delegationUnboundCleanupByOrigin.size, 2);
    assert.equal(capacity.state.task, task);
    assert.equal(capacity.context.chatInput.textContent, task);
    assert.equal(capacity.state.errorCode, 'delegation_cleanup_capacity_reached');
    assert.equal(capacity.stateNode.getAttribute('role'), 'alert');
    assert.equal(capacity.counts.added, 0);
    assert.equal(capacity.counts.persisted, 0);
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
      _activeTabIdSnapshot: 42,
      conversationId: 'conv_selected',
      _delegationHydrationGeneration: 0,
      _delegationUiState: state,
      _lastUserTaskByConversation: new Map([['conv_selected', 'retained delegated task']]),
      _delegationForConversation: () => DELEGATION_ID,
      _delegationUnboundCleanupForSelection: () => null,
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
      _activeTabIdSnapshot: 42,
      conversationId: null,
      _delegationHydrationGeneration: 0,
      _delegationUiState: state,
      _delegationForConversation: () => null,
      _delegationUnboundCleanupForSelection: () => null,
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
      _delegationAnnouncement: () => 'new persisted row',
      _delegationLifecycleAnnouncement: () => ''
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
    const run = new TestNode('section');
    const stateNode = new TestNode('div');
    const feed = new TestNode('div');
    const announcer = new TestNode('div');
    announcer.textContent = 'hydration sentinel';
    const uiState = {
      delegationId: DELEGATION_ID,
      snapshot: null,
      pendingTake: false,
      pendingResume: false,
      pendingStop: false,
      lastRenderedSequence: null,
      lastAlertKey: null,
      announced: Object.create(null),
      announcedTransitions: Object.create(null)
    };
    const context = {
      _activeTabIdSnapshot: 42,
      _delegationUiState: uiState,
      _ensureDelegationMount: () => ({ run, state: stateNode, feed, announcer, control: null }),
      FsbDelegationFeed: {
        validateSnapshot: () => true,
        render(_feed, next, options) {
          return {
            ok: true,
            lastSequence: next.entries.length ? next.entries.length : null,
            hydrated: options.hydrated
          };
        }
      },
      _renderDelegationRunHeader() {},
      _renderDelegationControlBar() {},
      _setDelegationHeaderStatus() {},
      _setDelegationComposerLocked() {},
      _delegationStateLabel: () => 'status',
      _delegationSnapshotLocksComposer: () => true,
      _delegationAnnouncement: () => 'persisted row'
    };
    vm.createContext(context);
    [
      '_delegationCanTakeControl',
      '_delegationOneShotTransition',
      '_delegationLifecycleAnnouncement',
      '_delegationSnapshotAlertKey',
      '_renderDelegationSnapshot'
    ].forEach((name) => vm.runInContext(extractNamedFunction(panelSource, name), context));
    const base = {
      delegationId: DELEGATION_ID,
      provider: { id: 'claude-code', label: 'Claude Code' },
      connection: 'connected',
      terminal: null,
      entries: [],
      activeTab: null,
      hold: null
    };
    const starting = { ...base, state: 'starting' };
    context._renderDelegationSnapshot(starting, { hydrated: false, announceSequence: null });
    assert.equal(announcer.textContent, 'Starting agent');
    announcer.textContent = 'starting dedupe sentinel';
    context._renderDelegationSnapshot(starting, { hydrated: false, announceSequence: null });
    assert.equal(announcer.textContent, 'starting dedupe sentinel',
      'live Starting announces once');

    uiState.snapshot = null;
    uiState.lastRenderedSequence = null;
    uiState.announced = Object.create(null);
    uiState.announcedTransitions = Object.create(null);
    announcer.textContent = 'hydration sentinel';
    context._renderDelegationSnapshot(starting, { hydrated: true, announceSequence: null });
    assert.equal(announcer.textContent, 'hydration sentinel',
      'initial hydration establishes the lifecycle baseline silently');
    announcer.textContent = 'unchanged sentinel';
    context._renderDelegationSnapshot(starting, { hydrated: false, announceSequence: null });
    assert.equal(announcer.textContent, 'unchanged sentinel',
      'an unchanged post-hydration snapshot never reannounces Starting');

    const running = {
      ...base,
      state: 'running',
      activeTab: { tabId: 42, owned: true, canTakeControl: true }
    };
    context._renderDelegationSnapshot(running, { hydrated: false, announceSequence: null });
    assert.equal(announcer.textContent, 'Take control available');
    announcer.textContent = 'control dedupe sentinel';
    context._renderDelegationSnapshot(running, { hydrated: false, announceSequence: null });
    assert.equal(announcer.textContent, 'control dedupe sentinel',
      'unchanged control eligibility announces only once');

    const held = {
      ...base,
      state: 'held',
      activeTab: { tabId: 42, owned: false, canTakeControl: false },
      hold: { expiresAt: 10000, tabIds: [42] }
    };
    context._renderDelegationSnapshot(held, { hydrated: false, announceSequence: null });
    assert.equal(announcer.textContent,
      'You have control of this tab. Resume with agent available');
    context._renderDelegationSnapshot({ ...base, state: 'stopping' }, {
      hydrated: false,
      announceSequence: null
    });
    assert.equal(announcer.textContent, 'Stopping agent');
    assert.notEqual(uiState.announced, uiState.announcedTransitions,
      'persisted sequence and lifecycle/control identities remain separate');
  }

  {
    let now = 61000;
    let nextIntervalId = 1;
    const intervals = new Map();
    const cleared = [];
    const elapsedNode = new TestNode('dd');
    const active = {
      delegationId: DELEGATION_ID,
      state: 'running',
      connection: 'connected',
      entries: [
        { timestamp: 1000 },
        { timestamp: 2500 }
      ]
    };
    const state = { snapshot: active };
    const context = {
      Date: { now: () => now },
      _delegationElapsedInterval: null,
      _delegationUiState: state,
      setInterval(fn, delay) {
        const id = nextIntervalId++;
        intervals.set(id, { fn, delay });
        return id;
      },
      clearInterval(id) {
        cleared.push(id);
        intervals.delete(id);
      }
    };
    vm.createContext(context);
    [
      '_delegationIsActiveSnapshot',
      '_clearDelegationElapsedTimer',
      '_delegationPersistedStartAt',
      '_formatDelegationElapsed',
      '_updateDelegationElapsed',
      '_syncDelegationElapsedTimer'
    ].forEach((name) => vm.runInContext(extractNamedFunction(panelSource, name), context));
    assert.equal(context._delegationPersistedStartAt(active), 1000,
      'elapsed presentation uses only the earliest persisted ledger timestamp');
    context._syncDelegationElapsedTimer(active, elapsedNode);
    assert.equal(elapsedNode.textContent, '1m 00s');
    assert.equal(intervals.size, 1);
    assert.equal(Array.from(intervals.values())[0].delay, 1000);
    now = 126000;
    Array.from(intervals.values())[0].fn();
    assert.equal(elapsedNode.textContent, '2m 05s',
      'fake presentation clock advances elapsed text without mutating lifecycle state');
    const terminal = { ...active, state: 'completed' };
    state.snapshot = terminal;
    context._syncDelegationElapsedTimer(terminal, elapsedNode);
    assert.equal(intervals.size, 0, 'terminal render safely clears the elapsed interval');
    assert.equal(cleared.length, 1);
    assert.equal(context._formatDelegationElapsed(null, now), 'Not reported');

    const elapsedSource = [
      extractNamedFunction(panelSource, '_delegationPersistedStartAt'),
      extractNamedFunction(panelSource, '_formatDelegationElapsed'),
      extractNamedFunction(panelSource, '_updateDelegationElapsed'),
      extractNamedFunction(panelSource, '_syncDelegationElapsedTimer')
    ].join('\n');
    assert(elapsedSource.includes('snapshot.entries') && elapsedSource.includes('Date.now()'));
    assert(!/chrome\.|storage|sendMessage|FSB_DELEGATION/.test(elapsedSource),
      'elapsed presentation has no persistence, command, or lifecycle-authority side effect');
  }

  {
    const fixedStop = new TestNode('button');
    fixedStop.classList.add('hidden');
    const chatInput = new TestNode('div');
    const sendButton = new TestNode('button');
    const micButton = new TestNode('button');
    const runStop = new TestNode('button');
    const run = new TestNode('section');
    const state = {
      snapshot: { delegationId: DELEGATION_ID, state: 'running' },
      pendingStop: false
    };
    let delegatedCalls = 0;
    let legacyCalls = 0;
    const inputControls = {
      chatInput,
      sendBtn: sendButton,
      stopBtn: fixedStop,
      micBtn: micButton
    };
    const context = {
      document: { getElementById: (id) => inputControls[id] || null },
      stopBtn: fixedStop,
      isRunning: false,
      _chatLockedByOwnerChip: false,
      _delegationRunStopControls: [runStop],
      _delegationUiState: state,
      _delegationIsSelectedConversation: () => true,
      _ensureDelegationMount: () => ({ run }),
      updateSendButtonState() {},
      _stopDelegation() { delegatedCalls += 1; return 'delegated'; },
      stopAutomation() { legacyCalls += 1; return 'legacy'; }
    };
    vm.createContext(context);
    [
      '_delegationIsActiveSnapshot',
      '_delegationStopIsActionable',
      '_delegationStopControlPending',
      '_delegationUsesFixedStop',
      '_restoreLegacyStopControl',
      '_syncDelegationStopControls',
      '_handleFixedStop',
      'applyInputLockout'
    ].forEach((name) => vm.runInContext(extractNamedFunction(panelSource, name), context));

    assert.equal(context._syncDelegationStopControls(state.snapshot), true);
    assert.equal(fixedStop.classList.contains('hidden'), false,
      'fixed input-cluster Stop is visible for selected delegated activity');
    assert.equal(fixedStop.getAttribute('title'), 'Stop agent');
    assert.equal(fixedStop.getAttribute('aria-label'), 'Stop agent');
    assert.equal(fixedStop.getAttribute('data-delegation-action'), 'stop');
    assert.equal(runStop.textContent, 'Stop agent');
    assert.equal(context._handleFixedStop({ currentTarget: fixedStop }), 'delegated');
    assert.equal(delegatedCalls, 1);
    assert.equal(legacyCalls, 0);

    context._chatLockedByOwnerChip = true;
    context.applyInputLockout(true);
    assert.equal(chatInput.getAttribute('contenteditable'), 'false');
    assert.equal(sendButton.disabled, true);
    assert.equal(micButton.disabled, true);
    assert.equal(fixedStop.disabled, false,
      'owner lock keeps only the selected delegated fixed Stop operable');
    assert.equal(fixedStop.getAttribute('aria-disabled'), null);
    assert.equal(fixedStop.getAttribute('aria-describedby'), null);
    assert.equal(fixedStop.classList.contains('fsb-foreign-owned-disabled'), false,
      'delegated Stop retains pointer and keyboard interaction under owner lock');
    context._syncDelegationStopControls(state.snapshot);
    context.applyInputLockout(true);
    assert.equal(fixedStop.disabled, false,
      'either owner-lock/Stop-sync call order preserves the delegated kill switch');
    assert.equal(sendButton.disabled, true, 'composer actions remain foreign-owner locked');

    state.pendingStop = true;
    context._syncDelegationStopControls(state.snapshot);
    assert.equal(fixedStop.disabled, true);
    assert.equal(runStop.disabled, true);
    assert.equal(fixedStop.getAttribute('aria-label'), 'Stopping agent…');
    assert.equal(runStop.textContent, 'Stopping agent…');
    assert.equal(run.getAttribute('aria-busy'), 'true',
      'both Stop locations share one delegated pending/busy state');

    state.pendingStop = false;
    state.snapshot = { delegationId: DELEGATION_ID, state: 'completed' };
    context._syncDelegationStopControls(state.snapshot);
    assert.equal(fixedStop.classList.contains('hidden'), true,
      'terminal delegated state restores the inactive legacy Stop surface');
    assert.equal(fixedStop.getAttribute('title'), 'Stop Automation');
    assert.equal(fixedStop.getAttribute('aria-label'), null);
    assert.equal(fixedStop.getAttribute('data-delegation-action'), null);
    assert.equal(fixedStop.disabled, true, 'terminal/API legacy Stop returns to owner lockout');
    assert.equal(fixedStop.getAttribute('aria-disabled'), 'true');
    assert.equal(fixedStop.classList.contains('fsb-foreign-owned-disabled'), true);
    assert.equal(context._handleFixedStop({ currentTarget: fixedStop }), 'legacy');
    assert.equal(legacyCalls, 1, 'API/terminal state retains the legacy stop handler');
  }

  {
    let resolveStop;
    const commands = [];
    const renders = [];
    const stopSyncs = [];
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
      _delegationStopIsActionable: () => true,
      _delegationIsSelectedConversation: () => true,
      _sendDelegationCommand(message) {
        commands.push(clone(message));
        return new Promise((resolve) => { resolveStop = resolve; });
      },
      _delegationValidLifecycleResponse: () => true,
      _syncDelegationStopControls(next) {
        stopSyncs.push({ next, pending: state.pendingStop });
      },
      _announceDelegationLifecycleKey() {},
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
    assert.equal(stopSyncs.length, 1);
    assert.equal(stopSyncs[0].pending, true,
      'deferred Stop response immediately synchronizes both redundant controls');
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
      stopBtn: new TestNode('button'),
      isRunning: false,
      _chatLockedByOwnerChip: false,
      _delegationRunStopControls: [],
      _delegationElapsedInterval: null,
      clearInterval() {},
      _delegationUiState: {
        errorCode: null,
        pendingStop: false
      },
      _delegationIsSelectedConversation: () => true,
      _ensureDelegationMount: () => ({ run: new TestNode('section') }),
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
      '_delegationStopIsActionable',
      '_delegationStopControlPending',
      '_clearDelegationElapsedTimer',
      '_delegationPersistedStartAt',
      '_formatDelegationElapsed',
      '_updateDelegationElapsed',
      '_syncDelegationElapsedTimer',
      '_delegationUsesFixedStop',
      '_restoreLegacyStopControl',
      '_syncDelegationStopControls',
      '_renderDelegationRunActions',
      '_appendDelegationActionRow',
      '_appendDelegationDoctorRecovery',
      '_appendDelegationTechnicalCode',
      '_appendDelegationRunDefinition',
      '_appendDelegationRunMetadata',
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

    context._renderDelegationRunHeader(card, {
      ...base,
      provider: { id: 'opencode', label: 'OpenCode' }
    });
    assert(card.textContent.includes('OpenCode running'));
    assert(card.textContent.includes('OpenCode is working in the background'));

    context._renderDelegationRunHeader(card, {
      ...base,
      provider: { id: 'opencode', label: 'OpenCode' },
      state: 'failed',
      terminal: { code: 'agent_failed', releasedTabCount: 0 }
    });
    assert(card.textContent.includes('Agent could not finish this task'));
    assert(card.textContent.includes(
      'OpenCode stopped before the task was complete. Review the error details, then try the same message again.'
    ));
    assert.deepEqual(findAll(card, 'button').map((button) => button.textContent), [
      'Try message again'
    ], 'OpenCode failure has one explicit new-intent retry and no automatic replay control');

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
    assert(card.textContent.includes('ProviderClaude Code')
      && card.textContent.includes('StateAgent connection lost')
      && card.textContent.includes('ElapsedNot reported'),
      'active run metadata exposes canonical provider, state, and elapsed fallback');
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

    context._delegationUiState.bindingCleanupPending = true;
    context._delegationUiState.delegationId = DELEGATION_ID;
    context._delegationUiState.errorCode = 'delegation_binding_cleanup_unsettled';
    card.setAttribute('role', 'alert');
    context._renderDelegationRunHeader(card, {
      ...base,
      state: 'failed',
      terminal: { code: 'tree_unsettled', releasedTabCount: 0 }
    });
    assert(card.textContent.includes('Agent cleanup needs attention'));
    assert(card.textContent.includes('FSB accepted this run but could not save it, and Stop is not confirmed.'));
    assert(card.textContent.includes('Your original message is still here. Retry Stop to finish cleanup.'));
    assert(card.textContent.includes('Stop agent'),
      'tree-unsettled binding cleanup retains a delegated Stop control');
    assert.equal(findByClass(card, 'delegation-action-danger')[0].disabled, false,
      'canonical stopping/failed snapshots cannot disable the unbound cleanup retry');
    assert.equal(card.getAttribute('data-delegation-tone'), 'danger',
      'cleanup-required presentation overrides a stale active snapshot tone');
    assert(findAll(card, 'i')[0].className.includes('fa-circle-exclamation'),
      'cleanup-required heading uses the danger semantic icon');
    assert.equal(findByClass(card, 'delegation-inline-error')[0].getAttribute('role'), null,
      'parent lifecycle alert owns assertive semantics without a nested re-announcing alert');
    assert(!/stopped/i.test(card.textContent),
      'unsettled cleanup copy never claims the exact run stopped');
    context._delegationUiState.bindingCleanupPending = false;
    context._delegationUiState.errorCode = null;
    card.removeAttribute('role');

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
    const context = { _delegationUiState: { bindingCleanupPending: false } };
    vm.createContext(context);
    vm.runInContext(extractNamedFunction(panelSource, '_delegationSnapshotLocksComposer'), context);
    assert.equal(context._delegationSnapshotLocksComposer({ state: 'running', connection: 'disconnected' }), true,
      'disconnected nonterminal run keeps composer locked');
    assert.equal(context._delegationSnapshotLocksComposer({ state: 'stopped', connection: 'connected' }), false,
      'composer restores only after canonical terminal settlement');
    context._delegationUiState.bindingCleanupPending = true;
    assert.equal(context._delegationSnapshotLocksComposer({ state: 'failed', connection: 'connected' }), true,
      'unsettled unbound cleanup keeps the original composer task locked and intact');
  }

  console.log('delegation-sidepanel-ui: PASS');
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
