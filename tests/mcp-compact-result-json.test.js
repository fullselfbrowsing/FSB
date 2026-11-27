'use strict';

/**
 * Successful MCP tool results are serialized as compact JSON (no
 * indentation); error texts are unchanged. The test also prints how many
 * characters the compact form saves on three representative results: a click
 * with a change report, two execute_js results and a get_page_snapshot result.
 *
 * Run: node tests/mcp-compact-result-json.test.js   (after npm --prefix mcp run build)
 */

const path = require('path');
const { pathToFileURL } = require('url');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const ROOT = path.join(__dirname, '..');

function elementState(overrides) {
  return {
    exists: true,
    tagName: 'BUTTON',
    className: 'btn btn-primary',
    value: '',
    textContent: null,
    checked: null,
    selectedIndex: null,
    innerText: 'Add to cart',
    ariaExpanded: null,
    ariaSelected: null,
    ariaChecked: null,
    ariaPressed: null,
    ariaHidden: null,
    dataState: null,
    open: null,
    disabled: false,
    controlState: null,
    ...(overrides || {})
  };
}

function pageState(overrides) {
  return {
    timestamp: 1763200000000,
    url: 'https://shop.example.com/products/42',
    bodyTextLength: 18234,
    elementCount: 1893,
    activeElement: 'BUTTON',
    element: elementState(),
    relatedElements: [
      { selector: '#cart-count', visible: true, text: '1' },
      { selector: '.toast', visible: false, text: '' }
    ],
    ...(overrides || {})
  };
}

// The shape the content click handler returns on its main path, after the
// bridge and the change-report wrap have added their fields.
const CLICK_RESULT = {
  success: true,
  clicked: '#add-to-cart',
  hadEffect: true,
  scrolled: false,
  verification: {
    localChanges: [{ type: 'text_changed', detail: 'Target element text content updated' }],
    confidence: 'high',
    whatChanged: 'Content changed',
    preState: pageState(),
    postState: pageState({ timestamp: 1763200000310, bodyTextLength: 18301, elementCount: 1901, element: elementState({ innerText: 'Added' }) }),
    verified: true,
    changes: { urlChanged: false, contentChanged: true, elementCountChanged: true, classChanged: false, ariaExpandedChanged: false },
    reason: 'Content changed'
  },
  elementInfo: { tag: 'BUTTON', text: 'Add to cart', wasScrolledIntoView: false },
  tool: 'click',
  executionTime: 412,
  change_report: {
    url: { before: 'https://shop.example.com/products/42', after: 'https://shop.example.com/products/42', changed: false },
    title_changed: false,
    dialogs_opened: [],
    nodes_added: [
      { tag: 'div', text: 'Added to your cart', selector: 'div.toast' },
      { tag: 'span', text: '1', selector: '#cart-count' }
    ],
    nodes_removed: [{ tag: 'span', text: '0', selector: '#cart-count' }],
    attrs_changed: [{ selector: 'button.btn', attr: 'class', before: 'btn btn-primary', after: 'btn btn-primary is-added' }],
    inputs_changed: {},
    focus_shift: null,
    mutation_count: 9,
    settle_ms: 340,
    truncated: false
  }
};

const EXECUTE_JS_RESULT = {
  success: true,
  result: JSON.stringify([
    { title: 'Wireless Mouse', price: '$24.99', rating: 4.5 },
    { title: 'Mechanical Keyboard', price: '$89.00', rating: 4.7 },
    { title: 'USB-C Hub', price: '$39.50', rating: 4.2 }
  ]),
  tool: 'execute_js'
};

// execute_js after the page reacted: the wrap attached a change report.
const EXECUTE_JS_CHANGED_RESULT = {
  success: true,
  result: 'clicked',
  tool: 'execute_js',
  change_report: {
    url: { before: 'https://shop.example.com/products/42', after: 'https://shop.example.com/products/42', changed: false },
    title_changed: false,
    dialogs_opened: [],
    nodes_added: [{ tag: 'li', text: 'Wireless Mouse', selector: 'li.cart-item' }],
    nodes_removed: [],
    attrs_changed: [{ selector: '#cart', attr: 'aria-expanded', before: 'false', after: 'true' }],
    inputs_changed: {},
    focus_shift: null,
    mutation_count: 4,
    settle_ms: 362,
    truncated: false
  }
};

function snapshotText() {
  const lines = ['# Products', '', 'Search results for "mouse"', ''];
  for (let i = 0; i < 40; i++) {
    lines.push(`- [e${100 + i}] link "Product ${i} - Wireless Mouse ${i}" /products/${i}`);
    lines.push(`  - text "$${(20 + i).toFixed(2)}" rating ${(3 + (i % 20) / 10).toFixed(1)}`);
  }
  lines.push('- [e200] button "Next page"');
  return lines.join('\n');
}

const SNAPSHOT_RESULT = {
  success: true,
  tool: 'get_page_snapshot',
  snapshot: snapshotText(),
  elementCount: 82,
  url: 'https://shop.example.com/search?q=mouse',
  tabId: 1234
};

(async () => {
  const helper = await import(pathToFileURL(path.join(ROOT, 'tests', 'helpers', 'mcp-in-process.mjs')).href);
  helper.assertBuildFresh();
  const { mapFSBError } = await import(pathToFileURL(path.join(ROOT, 'mcp', 'build', 'errors.js')).href);

  console.log('--- success results are compact ---');
  for (const [label, result] of [['click', CLICK_RESULT], ['execute_js', EXECUTE_JS_RESULT], ['execute_js with change_report', EXECUTE_JS_CHANGED_RESULT], ['get_page_snapshot', SNAPSHOT_RESULT]]) {
    const mapped = mapFSBError(JSON.parse(JSON.stringify(result)));
    const text = mapped.content[0].text;
    check(mapped.isError === undefined && mapped.content.length === 1 && mapped.content[0].type === 'text',
      `${label}: one text item, no isError`);
    check(text === JSON.stringify(result), `${label}: text is JSON.stringify(result) with no indentation`);
    check(!/\n\s/.test(text), `${label}: no newline-plus-indent anywhere in the text`);
    check(JSON.stringify(JSON.parse(text)) === JSON.stringify(result), `${label}: the text parses back to the same result`);
  }

  console.log('\n--- error texts are unchanged ---');
  const failure = mapFSBError({ success: false, error: 'element not found' });
  check(failure.isError === true
    && failure.content[0].text === 'Detected: Element lookup\nWhy: element not found\nNext action: Take a fresh get_page_snapshot and retry with a selector or ref from it, or use a different selector.',
  'a plain failure keeps its Detected / Why / Next action text');
  const unknown = mapFSBError({ success: false, outcome: 'unknown', mayHaveExecuted: true, error: 'Port closed after dispatch' });
  check(unknown.isError === true
    && unknown.content[0].text === 'Detected: Action outcome unknown\nWhy: Port closed after dispatch\nNext action: Inspect the current page with read_page or get_dom_snapshot before deciding whether to retry.\n\n{"outcome":"unknown","mayHaveExecuted":true}',
  'an unknown outcome keeps its text and trailer');

  console.log('\n--- characters saved per result (pretty -> compact) ---');
  let prettyTotal = 0;
  let compactTotal = 0;
  for (const [label, result] of [['click with change_report', CLICK_RESULT], ['execute_js', EXECUTE_JS_RESULT], ['execute_js with change_report', EXECUTE_JS_CHANGED_RESULT], ['get_page_snapshot', SNAPSHOT_RESULT]]) {
    const pretty = JSON.stringify(result, null, 2).length;
    const compact = mapFSBError(JSON.parse(JSON.stringify(result))).content[0].text.length;
    prettyTotal += pretty;
    compactTotal += compact;
    console.log(`  ${label}: ${pretty} -> ${compact} chars (-${pretty - compact}, -${(((pretty - compact) / pretty) * 100).toFixed(1)}%)`);
    check(compact < pretty, `${label}: compact text is shorter`);
  }
  console.log(`  total: ${prettyTotal} -> ${compactTotal} chars (-${(((prettyTotal - compactTotal) / prettyTotal) * 100).toFixed(1)}%)`);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: mcp-compact-result-json threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
