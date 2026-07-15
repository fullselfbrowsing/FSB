'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

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

console.log('delegation-sidepanel-ui: PASS');
