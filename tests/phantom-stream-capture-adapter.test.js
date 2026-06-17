'use strict';

/**
 * Phase 22 capture adapter migration.
 *
 * Static guard for the package-backed dom-stream adapter.
 *
 * Run: node tests/phantom-stream-capture-adapter.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const domStreamSource = fs.readFileSync(path.join(repoRoot, 'extension', 'content', 'dom-stream.js'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(repoRoot, 'extension', 'background.js'), 'utf8');

let passed = 0;
function ok(condition, message) {
  assert.equal(Boolean(condition), true, message);
  passed += 1;
  console.log('  PASS:', message);
}

console.log('\n--- PhantomStream capture adapter migration ---');

ok(domStreamSource.includes('window.FSBPhantomStreamCapture'),
  'dom-stream.js consumes bundled PhantomStream capture bridge');
ok(domStreamSource.includes('bridge.createCapture'),
  'dom-stream.js constructs capture through createCapture');
ok(domStreamSource.includes('maskInputs: true'),
  'adapter explicitly enables input masking');
ok(domStreamSource.includes('skipElement: isFsbOverlay'),
  'adapter wires FSB overlay exclusion through skipElement');
ok(domStreamSource.includes('overlayProvider: readOverlayState'),
  'adapter wires FSB overlay state through overlayProvider');

ok(!/function serializeDOM\s*\(/.test(domStreamSource),
  'legacy local serializeDOM implementation removed from dom-stream.js');
ok(!/function processMutationBatch\s*\(/.test(domStreamSource),
  'legacy local mutation diff processor removed from dom-stream.js');
ok(!/new MutationObserver\s*\(/.test(domStreamSource),
  'dom-stream.js no longer owns MutationObserver construction');
ok(!/var mutationObserver\s*=/.test(domStreamSource),
  'dom-stream.js no longer owns mutationObserver state');

ok(domStreamSource.includes("STREAM.SNAPSHOT"),
  'adapter maps PhantomStream snapshot messages');
ok(domStreamSource.includes("action: 'domStreamSnapshot'"),
  'adapter forwards snapshots to existing background action');
ok(domStreamSource.includes("action: 'domStreamMutations'"),
  'adapter forwards mutations to existing background action');
ok(domStreamSource.includes("action: 'domStreamScroll'"),
  'adapter forwards scroll to existing background action');
ok(domStreamSource.includes("action: 'domStreamOverlay'"),
  'adapter forwards overlays to existing background action');
ok(domStreamSource.includes("action: 'domStreamDialog'"),
  'adapter forwards dialogs to existing background action');
ok(domStreamSource.includes("action: 'domStreamReady'"),
  'adapter forwards ready ping to existing background action');

ok(!domStreamSource.includes('stampLegacyNodeIds'),
  'temporary legacy identity stamping bridge removed');
ok(!domStreamSource.includes('data-fsb-nid'),
  'adapter no longer stamps data-fsb-nid into mirrored HTML');
ok(!domStreamSource.includes('_stampLegacyNodeIdsForTest'),
  'adapter no longer exposes legacy nid stamping test hook');

ok(domStreamSource.includes('resumeWithFreshSnapshot'),
  'adapter preserves FSB resume-as-fresh-snapshot behavior');
ok(!/\.resume\(\)/.test(domStreamSource),
  'adapter does not call PhantomStream resume() for dashboard resume');

const bundleIndex = backgroundSource.indexOf("'content/phantom-stream-capture.js'");
const streamIndex = backgroundSource.indexOf("'content/dom-stream.js'");
ok(bundleIndex !== -1 && streamIndex !== -1 && bundleIndex < streamIndex,
  'background injects PhantomStream bundle before dom-stream adapter');

console.log('\n--- Adapter runtime simulation ---');

function createTemplateStub() {
  let source = '';
  let nodes = [];
  return {
    set innerHTML(value) {
      nodes = [];
      source = String(value || '').replace(/<([a-zA-Z][\w:-]*)([^>]*)>/g, (match, tag, attrs) => {
        const index = nodes.length;
        nodes.push({
          tag,
          attrs,
          setAttribute(name, val) {
            this.attrs += ' ' + name + '="' + String(val).replace(/"/g, '&quot;') + '"';
          },
        });
        return '%%FSB_NODE_' + index + '%%';
      });
    },
    get innerHTML() {
      return source.replace(/%%FSB_NODE_(\d+)%%/g, (match, rawIndex) => {
        const node = nodes[Number(rawIndex)];
        return node ? '<' + node.tag + node.attrs + '>' : match;
      });
    },
    get content() {
      return { nodes };
    },
  };
}

function runAdapterSimulation() {
  const sent = [];
  let listener = null;
  let createCaptureOptions = null;
  let stopCalls = 0;
  let pauseCalls = 0;
  let resumeCalls = 0;

  const STREAM = {
    SNAPSHOT: 'ext:dom-snapshot',
    MUTATIONS: 'ext:dom-mutations',
    SCROLL: 'ext:dom-scroll',
    OVERLAY: 'ext:dom-overlay',
    DIALOG: 'ext:dom-dialog',
    READY: 'ext:dom-ready',
  };

  const sandbox = {
    console,
    Date,
    Error,
    Object,
    String,
    Array,
    Promise,
    NodeFilter: { SHOW_ELEMENT: 1 },
    ShadowRoot: function ShadowRoot() {},
    document: {
      createElement(tag) {
        assert.equal(tag, 'template');
        return createTemplateStub();
      },
      createTreeWalker(content) {
        let index = -1;
        return {
          nextNode() {
            index += 1;
            return content.nodes[index] || null;
          },
        };
      },
    },
    chrome: {
      runtime: {
        onMessage: {
          addListener(fn) {
            listener = fn;
          },
        },
        sendMessage(message) {
          sent.push(message);
          return Promise.resolve({ ok: true });
        },
      },
    },
    window: {
      __FSB_SKIP_INIT__: false,
      FSB: {
        _modules: {},
        logger: { info() {}, warn() {}, error() {} },
        overlayState: {
          lifecycle: 'running',
          progress: { mode: 'determinate', percent: 42, label: 'Working', eta: 'soon' },
          phase: 'capture',
          display: { detail: 'Testing' },
          clientLabel: 'Codex',
          sessionToken: 'tok',
          version: 7,
          result: null,
        },
      },
      FSBPhantomStreamCapture: {
        protocol: { STREAM },
        createCapture(options) {
          createCaptureOptions = options;
          options.transport.send(STREAM.READY, {});
          return {
            start() {
              options.transport.send(STREAM.SNAPSHOT, {
                html: '<main><button>Go</button></main>',
                nodeIds: ['1', '2'],
                streamSessionId: 's1',
                snapshotId: 10,
                scrollX: 3,
                scrollY: 4,
              });
              options.transport.send(STREAM.MUTATIONS, {
                mutations: [
                  { op: 'add', parentNid: '1', html: '<p><strong>New</strong></p>', nodeIds: ['3', '4'] },
                ],
                streamSessionId: 's1',
                snapshotId: 10,
                staleFlushCount: 2,
              });
              options.transport.send(STREAM.SCROLL, {
                scrollX: 5,
                scrollY: 6,
                streamSessionId: 's1',
                snapshotId: 10,
              });
              options.transport.send(STREAM.DIALOG, {
                dialog: {
                  type: 'alert',
                  state: 'open',
                  message: 'Hi',
                  streamSessionId: 's1',
                  snapshotId: 10,
                },
              });
            },
            stop() { stopCalls += 1; },
            pause() { pauseCalls += 1; },
            resume() { resumeCalls += 1; },
          };
        },
      },
    },
  };

  vm.runInNewContext(domStreamSource, sandbox, { filename: 'dom-stream.js' });
  assert.equal(typeof listener, 'function', 'adapter registered runtime listener');
  assert.equal(createCaptureOptions.maskInputs, true, 'createCapture receives maskInputs=true');
  assert.equal(createCaptureOptions.skipElement({ hasAttribute: () => true }), true, 'skipElement excludes FSB overlays');

  let response = null;
  listener({ action: 'domStreamStart' }, {}, (value) => { response = value; });
  assert.equal(response && response.success, true, 'domStreamStart responds success');

  const snapshot = sent.find((message) => message.action === 'domStreamSnapshot');
  assert(snapshot, 'snapshot forwarded');
  assert.deepEqual(snapshot.snapshot.nodeIds, ['1', '2'], 'snapshot nodeIds sidecar preserved');
  assert(!snapshot.snapshot.html.includes('data-fsb-nid='), 'snapshot HTML is not legacy-stamped');

  const mutations = sent.find((message) => message.action === 'domStreamMutations');
  assert(mutations, 'mutations forwarded');
  assert.equal(mutations.staleFlushCount, 2, 'staleFlushCount forwarded at background action level');
  assert.deepEqual(mutations.mutations[0].nodeIds, ['3', '4'], 'add-op nodeIds sidecar preserved');
  assert(!mutations.mutations[0].html.includes('data-fsb-nid='), 'add-op HTML is not legacy-stamped');

  assert(sent.some((message) => message.action === 'domStreamReady'), 'ready ping forwarded');
  assert(sent.some((message) => message.action === 'domStreamScroll' && message.scrollY === 6), 'scroll forwarded');
  assert(sent.some((message) => message.action === 'domStreamDialog' && message.dialog.message === 'Hi'), 'dialog forwarded');

  listener({ action: 'domStreamPause' }, {}, () => {});
  assert.equal(pauseCalls, 1, 'pause forwards to capture.pause');
  listener({ action: 'domStreamResume' }, {}, () => {});
  assert.equal(stopCalls, 1, 'resume first stops capture for fresh snapshot');
  assert.equal(resumeCalls, 0, 'adapter does not call capture.resume');

  listener({ action: 'domStreamRequestOverlay' }, {}, () => {});
  const overlay = sent.filter((message) => message.action === 'domStreamOverlay').pop();
  assert(overlay && overlay.progress && overlay.progress.clientLabel === 'Codex', 'overlay request forwards FSB progress state');
}

runAdapterSimulation();
ok(true, 'adapter runtime simulation maps package capture to legacy FSB actions');

console.log('\nPhantomStream capture adapter migration: ' + passed + ' PASS / 0 FAIL');
