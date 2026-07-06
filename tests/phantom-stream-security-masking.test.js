'use strict';

/**
 * Phase 22 Plan 04 -- PhantomStream capture security and masking guard.
 *
 * Verifies FSB enables the package sanitizer intentionally and that the
 * bundled PhantomStream capture runtime still owns the sensitive-content
 * masking and dangerous-content stripping paths required by the dashboard
 * stream contract.
 *
 * Run: node tests/phantom-stream-security-masking.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const domStreamSource = fs.readFileSync(path.join(repoRoot, 'extension', 'content', 'dom-stream.js'), 'utf8');
const bundleSource = fs.readFileSync(path.join(repoRoot, 'extension', 'content', 'phantom-stream-capture.js'), 'utf8');

let passed = 0;
function ok(condition, message) {
  assert.equal(Boolean(condition), true, message);
  passed += 1;
  console.log('  PASS:', message);
}

function sourceHas(source, snippet, message) {
  ok(source.includes(snippet), message);
}

function sourceMatches(source, pattern, message) {
  ok(pattern.test(source), message);
}

console.log('\n--- FSB adapter security configuration ---');

sourceHas(domStreamSource, 'maskInputs: true',
  'dom-stream adapter explicitly enables PhantomStream input masking');
sourceHas(domStreamSource, 'skipElement: isFsbOverlay',
  'dom-stream adapter passes FSB overlay exclusion into PhantomStream capture');
sourceHas(domStreamSource, 'overlayProvider: readOverlayState',
  'dom-stream adapter keeps overlay state out of captured DOM');

function runAdapterConfigSimulation() {
  let listener = null;
  let createCaptureOptions = null;
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
        return { set innerHTML(value) {}, get innerHTML() { return ''; }, content: { nodes: [] } };
      },
      createTreeWalker() {
        return { nextNode() { return null; } };
      },
    },
    chrome: {
      runtime: {
        onMessage: {
          addListener(fn) { listener = fn; },
        },
        sendMessage() {
          return Promise.resolve({ ok: true });
        },
      },
    },
    window: {
      __FSB_SKIP_INIT__: false,
      FSB: { _modules: {}, logger: { info() {}, warn() {}, error() {} } },
      FSBPhantomStreamCapture: {
        protocol: { STREAM },
        createCapture(options) {
          createCaptureOptions = options;
          return {
            start() {},
            stop() {},
            pause() {},
            resume() {},
          };
        },
      },
    },
  };

  vm.runInNewContext(domStreamSource, sandbox, { filename: 'dom-stream.js' });
  assert.equal(typeof listener, 'function', 'adapter registered runtime listener');
  assert.equal(createCaptureOptions.maskInputs, true, 'maskInputs=true reaches createCapture');
  assert.equal(typeof createCaptureOptions.skipElement, 'function', 'skipElement callback reaches createCapture');

  const directOverlay = {
    hasAttribute(name) { return name === 'data-fsb-overlay'; },
    closest() { return null; },
  };
  const descendantOverlay = {
    hasAttribute() { return false; },
    closest(selector) { return selector === '[data-fsb-overlay]' ? { tagName: 'div' } : null; },
  };
  const shadowRoot = new sandbox.ShadowRoot();
  shadowRoot.host = { className: 'fsb-action-glow' };
  const shadowOverlay = {
    hasAttribute() { return false; },
    closest() { return null; },
    getRootNode() { return shadowRoot; },
  };
  const normalElement = {
    hasAttribute() { return false; },
    closest() { return null; },
    getRootNode() { return null; },
  };

  assert.equal(createCaptureOptions.skipElement(directOverlay), true, 'direct FSB overlay skipped');
  assert.equal(createCaptureOptions.skipElement(descendantOverlay), true, 'descendant of FSB overlay skipped');
  assert.equal(createCaptureOptions.skipElement(shadowOverlay), true, 'FSB shadow overlay skipped');
  assert.equal(createCaptureOptions.skipElement(normalElement), false, 'normal element not skipped');
}

runAdapterConfigSimulation();
ok(true, 'adapter runtime passes masking and overlay exclusion config');

console.log('\n--- PhantomStream masking paths ---');

sourceMatches(bundleSource, /\bfunction defaultMaskText\(text\)[\s\S]*?replace\(\s*\/\[\\S\]\/g,\s*"\*"\s*\)/,
  'bundle default mask replaces every non-whitespace character');
sourceHas(bundleSource, 'var maskInputs = cfg.maskInputs === true',
  'bundle reads explicit maskInputs config');
sourceHas(bundleSource, 'var maskTextFn = typeof cfg.maskTextFn === "function" ? cfg.maskTextFn : null',
  'bundle supports custom text mask hook');
sourceHas(bundleSource, 'var maskInputFn = typeof cfg.maskInputFn === "function" ? cfg.maskInputFn : null',
  'bundle supports custom input mask hook');
sourceHas(bundleSource, 'logger.error("[DOM Stream] maskTextFn failed; default mask applied", err)',
  'bundle fails closed when custom text mask throws');
sourceHas(bundleSource, 'logger.error("[DOM Stream] maskInputFn failed; default mask applied", err)',
  'bundle fails closed when custom input mask throws');
sourceHas(bundleSource, 'if (inputType === "password") return true',
  'bundle always masks password inputs');
sourceHas(bundleSource, 'if (tag === "textarea" || tag === "select") return maskInputs',
  'bundle extends maskInputs to textarea and select values');
sourceHas(bundleSource, 'maskInputCloneValue(clone, payload.orig)',
  'snapshot element sanitizer masks cloned form values');
sourceHas(bundleSource, 'sanitizeCounters.maskedInputs++',
  'bundle counts masked input sanitization');
sourceHas(bundleSource, 'sanitizeCounters.maskedTextNodes++',
  'bundle counts masked text sanitization');
sourceHas(bundleSource, 'safeMaskInput(payload.text == null ? "" : payload.text, payload.owner)',
  'text mutation sanitizer masks text under masked form controls');
sourceHas(bundleSource, 'safeMaskInput(inputValue, payload.owner)',
  'input-value sanitizer masks value payloads');

console.log('\n--- PhantomStream dangerous-content stripping ---');

sourceMatches(bundleSource, /\bfunction sanitizeForWire\(kind, payload\)/,
  'bundle keeps a named sanitizeForWire chokepoint');
sourceMatches(bundleSource, /\bfunction hasDangerousScheme\(value\)[\s\S]*?javascript:[\s\S]*?vbscript:[\s\S]*?data:text\/html/,
  'bundle treats javascript, vbscript, and data:text/html as dangerous URL schemes');
sourceHas(bundleSource, 'var URL_ATTRS = ["src", "href", "action", "poster", "data"]',
  'bundle sanitizes URL-carrying attributes');
sourceHas(bundleSource, 'if (tag === "script" || tag === "noscript")',
  'bundle drops script and noscript elements');
sourceHas(bundleSource, 'if (tag === "object" || tag === "embed")',
  'bundle drops object and embed subtrees');
sourceHas(bundleSource, 'if (lowName.indexOf("on") === 0)',
  'element sanitizer detects event-handler attributes');
sourceHas(bundleSource, 'clone.removeAttribute(rawName)',
  'element sanitizer removes dangerous attributes from clones');
sourceHas(bundleSource, 'if (lowName === "srcdoc")',
  'element sanitizer detects srcdoc attributes');
sourceHas(bundleSource, 'if (urlVal && hasDangerousScheme(urlVal))',
  'element sanitizer detects dangerous URL attributes');
sourceHas(bundleSource, 'clone.removeAttribute(URL_ATTRS[u])',
  'element sanitizer removes dangerous URL attributes');
sourceHas(bundleSource, 'if (formactionVal && hasDangerousScheme(formactionVal))',
  'element sanitizer handles formaction');
sourceHas(bundleSource, 'if (xlinkVal && hasDangerousScheme(xlinkVal))',
  'element sanitizer handles xlink href');
sourceHas(bundleSource, 'var scrubbedSrcset = scrubSrcset(srcsetVal)',
  'element sanitizer scrubs srcset candidates');
sourceMatches(bundleSource, /\bfunction scrubCssText\(css\)[\s\S]*?url\(about:blank\)[\s\S]*?expression\\s\*\\\(/,
  'bundle scrubs unsafe CSS url() and expression() content');
sourceHas(bundleSource, 'if (styleVal) {',
  'element sanitizer checks inline style attributes');
sourceHas(bundleSource, 'if (tag === "style")',
  'element sanitizer checks style element text');

console.log('\n--- PhantomStream mutation and subtree sanitizer coverage ---');

sourceHas(bundleSource, 'var rootResult = sanitizeForWire("element", { orig: payload.liveRoot, clone: root })',
  'subtree sanitizer reuses element sanitizer for root');
sourceHas(bundleSource, 'var descResult = sanitizeForWire("element", { orig: liveDesc, clone: desc })',
  'subtree sanitizer reuses element sanitizer for descendants');
sourceHas(bundleSource, 'var subtreeResult = sanitizeForWire("subtree", {',
  'added-node serialization passes through subtree sanitizer');
sourceHas(bundleSource, 'var attrResult = sanitizeForWire("attr", {',
  'attribute mutations pass through attr sanitizer');
sourceHas(bundleSource, 'if (attrName.indexOf("on") === 0)',
  'attr sanitizer drops event-handler mutations');
sourceHas(bundleSource, 'if (attrName === "srcdoc")',
  'attr sanitizer drops srcdoc mutations');
sourceHas(bundleSource, 'return { value: null }',
  'attr sanitizer nulls dangerous URL mutation values');
sourceHas(bundleSource, 'var textResult = sanitizeForWire("text", {',
  'text mutations pass through text sanitizer');
sourceHas(bundleSource, 'return { text: maskedInputText }',
  'text sanitizer returns masked form-control text');
sourceHas(bundleSource, 'return { value: maskedValue }',
  'input sanitizer returns masked form-control values');
sourceHas(bundleSource, 'warnIfSanitizeStrips(sanBefore)',
  'snapshot/mutation paths warn when sanitizer counters move');

console.log('\nPhantomStream capture security/masking guard: ' + passed + ' PASS / 0 FAIL');
