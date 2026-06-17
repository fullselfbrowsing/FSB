'use strict';

/**
 * Phase 25 Plan 02 -- PhantomStream differential parity guard.
 *
 * Exercises package-owned protocol, renderer diff/snapshot, relay
 * classification, and adapter-boundary behavior with deterministic fixtures.
 * This is Node-only evidence; browser visual fidelity remains 25-04 UAT.
 *
 * Run: node tests/phantom-stream-differential-parity.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const domStreamSource = fs.readFileSync(path.join(repoRoot, 'extension', 'content', 'dom-stream.js'), 'utf8');
const staticDashboardSource = fs.readFileSync(path.join(repoRoot, 'showcase', 'js', 'dashboard.js'), 'utf8');
const angularDashboardSource = fs.readFileSync(
  path.join(repoRoot, 'showcase', 'angular', 'src', 'app', 'pages', 'dashboard', 'dashboard-page.component.ts'),
  'utf8'
);

let passed = 0;
function ok(condition, message) {
  assert.equal(Boolean(condition), true, message);
  passed += 1;
  console.log('  PASS:', message);
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.ownerDocument = ownerDocument;
    this.nodeType = 1;
    this.children = [];
    this.parentNode = null;
    this.attributes = [];
    this.textContent = '';
    this.value = '';
    this.checked = false;
    this.options = null;
  }

  appendChild(child) {
    if (!child) return child;
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertBefore(child, before) {
    if (!child) return child;
    child.parentNode = this;
    const index = before ? this.children.indexOf(before) : -1;
    if (index >= 0) this.children.splice(index, 0, child);
    else this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  setAttribute(name, value) {
    const existing = this.getAttributeNode(name);
    if (existing) existing.value = String(value);
    else this.attributes.push({ name: String(name), value: String(value) });
  }

  getAttribute(name) {
    const attr = this.getAttributeNode(name);
    return attr ? attr.value : null;
  }

  getAttributeNode(name) {
    const lower = String(name).toLowerCase();
    return this.attributes.find((attr) => String(attr.name).toLowerCase() === lower) || null;
  }

  removeAttribute(name) {
    const lower = String(name).toLowerCase();
    this.attributes = this.attributes.filter((attr) => String(attr.name).toLowerCase() !== lower);
  }

  removeAttributeNode(attrNode) {
    this.attributes = this.attributes.filter((attr) => attr !== attrNode);
  }

  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains && child.contains(node));
  }
}

class FakeFragment {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.nodeType = 11;
    this.children = [];
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  contains(node) {
    return this.children.some((child) => child === node || (child.contains && child.contains(node)));
  }

  get firstElementChild() {
    return this.children[0] || null;
  }
}

class FakeTemplate {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.content = new FakeFragment(ownerDocument);
  }

  set innerHTML(value) {
    this.content = new FakeFragment(this.ownerDocument);
    const html = String(value || '');
    const match = html.match(/^<([a-zA-Z][\w:-]*)([^>]*)>([\s\S]*)<\/\1>$/);
    if (!match) return;
    const node = new FakeElement(match[1], this.ownerDocument);
    const attrs = match[2] || '';
    attrs.replace(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)="([^"]*)"/g, (all, name, attrValue) => {
      node.setAttribute(name, attrValue);
      return all;
    });
    node.textContent = match[3].replace(/<[^>]+>/g, '');
    this.content.appendChild(node);
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body', this);
  }

  createElement(tagName) {
    if (String(tagName).toLowerCase() === 'template') return new FakeTemplate(this);
    return new FakeElement(tagName, this);
  }

  importNode(node, deep) {
    const clone = new FakeElement(node.tagName || 'div', this);
    clone.textContent = node.textContent || '';
    node.attributes.forEach((attr) => clone.setAttribute(attr.name, attr.value));
    if (deep) node.children.forEach((child) => clone.appendChild(this.importNode(child, true)));
    return clone;
  }

  createTreeWalker(root) {
    const nodes = [];
    function visit(node) {
      if (!node || !node.children) return;
      node.children.forEach((child) => {
        nodes.push(child);
        visit(child);
      });
    }
    visit(root);
    let index = -1;
    return {
      nextNode() {
        index += 1;
        return nodes[index] || null;
      },
    };
  }
}

function makeFakeMirror() {
  const doc = new FakeDocument();
  const nodes = new Map();

  const root = new FakeElement('main', doc);
  const text = new FakeElement('p', doc);
  const input = new FakeElement('input', doc);
  const select = new FakeElement('select', doc);
  const removable = new FakeElement('aside', doc);

  root.appendChild(text);
  root.appendChild(input);
  root.appendChild(select);
  root.appendChild(removable);
  doc.body.appendChild(root);

  text.textContent = 'old';
  text.setAttribute('href', 'https://example.com');
  select.options = [
    { value: 'a', selected: false },
    { value: 'b', selected: false },
  ];

  nodes.set('root', root);
  nodes.set('text', text);
  nodes.set('input', input);
  nodes.set('select', select);
  nodes.set('remove', removable);

  return { doc, nodes };
}

(async () => {
  const protocol = await import('@full-self-browsing/phantom-stream/protocol');
  const renderer = await import('@full-self-browsing/phantom-stream/renderer');
  const relay = await import('@full-self-browsing/phantom-stream/relay');

  console.log('\n--- source boundary audit ---');
  ok(domStreamSource.includes('window.FSBPhantomStreamCapture'),
    'capture adapter consumes PhantomStream capture bridge');
  ok(!/function serializeDOM\s*\(/.test(domStreamSource),
    'capture adapter has no local serializeDOM engine');
  ok(!/new MutationObserver\s*\(/.test(domStreamSource),
    'capture adapter has no local MutationObserver engine');
  ok(!domStreamSource.includes('stampLegacyNodeIds') && !domStreamSource.includes('data-fsb-nid'),
    'capture adapter has no legacy nid stamping bridge');
  ok(staticDashboardSource.includes('bridge.createDashboardViewer') && angularDashboardSource.includes('bridge.createDashboardViewer'),
    'both dashboards use the shared PhantomStream viewer wrapper');
  ok(!staticDashboardSource.includes('previewIframe.srcdoc') && !angularDashboardSource.includes('previewIframe.srcdoc'),
    'dashboards no longer own snapshot srcdoc assembly');

  console.log('\n--- snapshot and sanitizer parity ---');
  const snapshotHtml = renderer.buildSnapshotHtml({
    viewportWidth: '1280',
    htmlAttrs: { lang: 'en', onclick: 'bad()' },
    bodyAttrs: { id: 'mirror', onload: 'bad()' },
    bodyStyle: 'background:url(javascript:bad); color: red;',
    stylesheets: ['https://safe.example/style.css', 'javascript:alert(1)'],
    inlineStyles: ['.a{background:url(javascript:bad)} .b{width:expression(alert(1))}'],
    html: '<main><input type="password" value="***"></main>',
  });
  ok(snapshotHtml.includes('Content-Security-Policy'),
    'snapshot builder injects CSP meta');
  ok(snapshotHtml.includes('https://safe.example/style.css'),
    'snapshot builder keeps safe stylesheet URLs');
  ok(!snapshotHtml.includes('javascript:alert(1)'),
    'snapshot builder filters dangerous stylesheet URLs');
  ok(!snapshotHtml.includes('onclick=') && !snapshotHtml.includes('onload='),
    'snapshot builder drops shell event-handler attributes');
  ok(snapshotHtml.includes('url(about:blank)') && snapshotHtml.includes('blocked('),
    'snapshot builder scrubs dangerous CSS content');

  console.log('\n--- renderer mutation parity ---');
  const mirror = makeFakeMirror();
  const counters = { staleMisses: 0, applyFailures: 0 };
  const sanitizeCounters = { strippedHandlers: 0, blockedUrls: 0, droppedSubtrees: 0, cssScrubs: 0 };
  const resyncs = [];
  const indexed = [];
  const removed = [];
  renderer.applyMutations(mirror.doc, [
    { op: protocol.DIFF_OP.ADD, parentNid: 'root', html: '<span data-role="new">new</span>', nodeIds: ['new'] },
    { op: protocol.DIFF_OP.ATTR, nid: 'text', attr: 'href', val: 'javascript:alert(1)' },
    { op: protocol.DIFF_OP.ATTR, nid: 'text', attr: 'style', val: 'background:url(javascript:bad)' },
    { op: protocol.DIFF_OP.ATTR, nid: 'text', attr: 'onclick', val: 'bad()' },
    { op: protocol.DIFF_OP.TEXT, nid: 'text', text: '<b>literal</b>' },
    { op: protocol.DIFF_OP.VALUE, nid: 'input', value: 'typed', checked: true },
    { op: protocol.DIFF_OP.VALUE, nid: 'select', selectedValues: ['b'] },
    { op: protocol.DIFF_OP.REMOVE, nid: 'remove' },
    { op: protocol.DIFF_OP.ATTR, nid: 'missing-1', attr: 'title', val: 'x' },
    { op: protocol.DIFF_OP.TEXT, nid: 'missing-2', text: 'x' },
    { op: protocol.DIFF_OP.REMOVE, nid: 'missing-3' },
  ], counters, {
    logger: { warn() {} },
    requestResync(reason, detail) { resyncs.push({ reason, detail }); },
    sanitizeCounters,
    identity: {
      resolve(nid) { return mirror.nodes.get(String(nid)) || null; },
      indexSubtree(root, nodeIds) { indexed.push({ root, nodeIds }); },
      removeSubtree(root) { removed.push(root); },
    },
  });

  const root = mirror.nodes.get('root');
  const text = mirror.nodes.get('text');
  const input = mirror.nodes.get('input');
  const select = mirror.nodes.get('select');
  ok(root.children.some((child) => child.tagName === 'SPAN' && child.textContent === 'new'),
    'ADD mutation inserts parsed package renderer node');
  ok(indexed.some((entry) => entry.nodeIds[0] === 'new'),
    'ADD mutation indexes PhantomStream nodeIds sidecar');
  ok(text.getAttribute('href') === null,
    'ATTR mutation neutralizes dangerous href');
  ok(String(text.getAttribute('style')).includes('about:blank'),
    'ATTR mutation scrubs dangerous style URLs');
  ok(text.getAttribute('onclick') === null,
    'ATTR mutation drops event handlers');
  ok(text.textContent === '<b>literal</b>',
    'TEXT mutation stays literal text, not HTML');
  ok(input.value === 'typed' && input.checked === true,
    'VALUE mutation updates input value and checked state');
  ok(select.options[1].selected === true && select.options[0].selected === false,
    'VALUE mutation updates select options');
  ok(!root.children.includes(mirror.nodes.get('remove')) && removed.includes(mirror.nodes.get('remove')),
    'REMOVE mutation removes node and calls identity cleanup');
  ok(counters.staleMisses === 3 && resyncs.some((entry) => entry.reason === 'stale-mutation-parent'),
    'stale mutation misses trigger package resync threshold');
  ok(sanitizeCounters.strippedHandlers >= 1 && sanitizeCounters.blockedUrls >= 1 && sanitizeCounters.cssScrubs >= 1,
    'renderer sanitizer counters move for handler/url/css mutations');

  console.log('\n--- protocol and relay parity ---');
  ok(protocol.isCurrentStream({ streamSessionId: 's1', snapshotId: 2 }, { streamSessionId: 's1', snapshotId: 2 }) === true,
    'protocol accepts current stream identity');
  ok(protocol.isCurrentStream({ streamSessionId: 'stale', snapshotId: 2 }, { streamSessionId: 's1', snapshotId: 2 }) === false,
    'protocol rejects stale stream session identity');
  ok(protocol.isCurrentStream({ streamSessionId: 's1', snapshotId: 1 }, { streamSessionId: 's1', snapshotId: 2 }) === false,
    'protocol rejects stale snapshot identity');

  const fakeLz = {
    compressToBase64(input) { return Buffer.from(input, 'utf8').toString('base64'); },
    decompressFromBase64(input) { return Buffer.from(input, 'base64').toString('utf8'); },
  };
  const largeFrame = {
    type: protocol.STREAM.MUTATIONS,
    payload: { streamSessionId: 's1', snapshotId: 2, mutations: [{ op: protocol.DIFF_OP.TEXT, nid: 'text', text: 'x'.repeat(2048) }] },
    ts: 1,
  };
  const encoded = protocol.encodeEnvelope(largeFrame, fakeLz, 0);
  const decoded = protocol.decodeEnvelope(encoded, fakeLz);
  ok(decoded.ok === true && decoded.msg.type === protocol.STREAM.MUTATIONS,
    'protocol encode/decode round-trips compressed mutation frames');
  ok(protocol.isCompressedEnvelope(JSON.parse(encoded)),
    'compressed mutation frame is self-identifying');

  const plainClass = relay.classifyRelayFrame(JSON.stringify({ type: protocol.STREAM.SNAPSHOT, payload: {} }));
  const compressedClass = relay.classifyRelayFrame(encoded);
  ok(plainClass.type === protocol.STREAM.SNAPSHOT,
    'relay classifies plain snapshot frame by type');
  ok(compressedClass.compressed === true && compressedClass.type === 'compressed-envelope',
    'relay classifies compressed envelope without decompressing payload');
  const relayCap = relay.checkRelayFrameLimit('').capBytes;
  ok(relay.checkRelayFrameLimit('x'.repeat(relayCap + 1)).ok === false,
    'relay rejects frames over package cap');

  console.log('\nPhantomStream differential parity: ' + passed + ' PASS / 0 FAIL');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
