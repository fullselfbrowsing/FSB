/**
 * drag_drop resolves CSS selectors as well as element refs.
 *
 * The tool takes an element ref ("e5") or a CSS selector ("#card-1"), and
 * mcp/src/tools/schema-bridge.ts passes either through as sourceRef/targetRef.
 * content/actions.js dragdrop only ever looked them up through
 * FSB.getElementByRef (which does not exist) and [data-fsb-ref] (which nothing
 * sets), so a CSS selector was always "Source element not found" -- on Chrome
 * and Safari alike. A selector with quotes in it also made the [data-fsb-ref]
 * lookup itself throw.
 *
 * Runs the shipped dragdrop function in a VM and stops at the first early
 * return, so resolution is what is under test, not the drag simulation.
 *
 * Run: node tests/drag-drop-selector-resolution.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;
function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const SRC = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content', 'actions.js'), 'utf8');
const start = SRC.indexOf('  dragdrop: async (params) => {');
const end = SRC.indexOf('\n  }\n};', start);
passAssert(start >= 0 && end > start, 'dragdrop found in content/actions.js');
const DRAGDROP = SRC.slice(start, end + '\n  }'.length);

function dragdropWith({ refs = {}, selectors = {}, throwOnAttributeQuery = false } = {}) {
  const calls = { resolveRef: [], querySelectorWithShadow: [] };
  const sandbox = {
    FSB: {
      resolveRef(ref) { calls.resolveRef.push(ref); return refs[ref] || null; },
      querySelectorWithShadow(sel) { calls.querySelectorWithShadow.push(sel); return selectors[sel] || null; }
    },
    document: {
      querySelector(sel) {
        // A real document throws on a malformed selector, which is what an
        // attribute selector wrapped around input[name="q"] becomes.
        if (throwOnAttributeQuery && /data-fsb-ref/.test(sel)) throw new SyntaxError('not a valid selector');
        return null;
      }
    },
    logger: { log() {} },
    setTimeout
  };
  const dragdrop = vm.runInNewContext(`({\n${DRAGDROP}\n}).dragdrop`, sandbox);
  return { dragdrop, calls };
}

const el = (name) => ({ name, parentElement: null });

(async function run() {
  console.log('\n=== CSS selectors resolve ===');
  {
    const { dragdrop, calls } = dragdropWith({ selectors: { '#drag-source': el('source') } });
    const res = await dragdrop({ sourceRef: '#drag-source', targetRef: '#nowhere' });
    passAssert(/^Target element not found: #nowhere$/.test(res.error), 'a CSS selector source is found (fails on the missing target instead)');
    passAssert(calls.querySelectorWithShadow.includes('#drag-source'), 'through FSB.querySelectorWithShadow, like every other tool');
  }

  console.log('\n=== element refs resolve ===');
  {
    const { dragdrop, calls } = dragdropWith({ refs: { e5: el('ref-source') } });
    const res = await dragdrop({ sourceRef: 'e5', targetRef: 'e99' });
    passAssert(/^Target element not found: e99$/.test(res.error), 'a ref source is found');
    passAssert(calls.resolveRef.includes('e5'), 'through FSB.resolveRef');
  }

  console.log('\n=== a selector with quotes does not throw ===');
  {
    const { dragdrop } = dragdropWith({ selectors: { 'input[name="q"]': el('quoted') }, throwOnAttributeQuery: true });
    let res = null;
    let threw = null;
    try { res = await dragdrop({ sourceRef: 'input[name="q"]', targetRef: '#nowhere' }); } catch (err) { threw = err; }
    passAssert(threw === null, 'the malformed [data-fsb-ref] lookup is contained');
    passAssert(res && /^Target element not found/.test(res.error), 'and the selector still resolves');
  }

  console.log('\n=== nothing matches -> the same typed error ===');
  {
    const { dragdrop } = dragdropWith();
    const res = await dragdrop({ sourceRef: '#missing', targetRef: '#nowhere' });
    passAssert(res.success === false && res.error === 'Source element not found: #missing', 'source not found');
    const none = await dragdrop({ sourceRef: '', targetRef: '#nowhere' });
    passAssert(/required/.test(none.error), 'an empty ref is still rejected up front');
  }

  console.log('\n---');
  console.log('passed:', passed, 'failed:', failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('TEST HARNESS ERROR:', err);
  process.exit(1);
});
