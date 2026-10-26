/**
 * Tests for the DOM pointer/wheel fallbacks in extension/content/actions.js.
 *
 * These are the Safari replacements for the seven _route:'cdp' tools. They are
 * extracted verbatim from actions.js source and executed against a minimal DOM
 * stub that records every dispatched event, so the assertions are about the
 * ACTUAL shipped code, not a reimplementation.
 *
 * The two behaviours most worth pinning, because both are easy to get subtly
 * wrong and neither fails loudly in a browser:
 *   - pointerDrag must fire the HTML5 drag family ONLY for draggable sources;
 *     HTML5 DnD does not observe pointer events at all.
 *   - wheelScrollAt must actually scrollBy() when unhandled, while respecting
 *     preventDefault() from map/canvas listeners that consume the wheel tick.
 *
 * Run: node tests/actions-pointer-fallbacks.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content', 'actions.js'), 'utf8');

let passed = 0;
let failed = 0;
function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}
function passAssertEqual(a, b, msg) { passAssert(a === b, msg + ' (got ' + JSON.stringify(a) + ')'); }

// --- extract the shipped block verbatim -------------------------------------
const START = '  const FSB_UNTRUSTED_NOTE';
const END = '  // =========================================================================\n  // VAULT FILL';
const i0 = SRC.indexOf(START);
const i1 = SRC.indexOf(END, i0);
if (i0 < 0 || i1 < 0) {
  console.error('FAIL: could not locate the DOM fallback block in actions.js');
  process.exit(1);
}
const BLOCK = SRC.slice(i0, i1);

// --- DOM stub ---------------------------------------------------------------
function makeEl(tag, opts = {}) {
  const el = {
    tagName: tag.toUpperCase(),
    id: opts.id || '',
    draggable: opts.draggable === true,
    value: opts.value !== undefined ? opts.value : '',
    shadowRoot: opts.shadowRoot || null,
    parentElement: opts.parentElement || null,
    scrollTop: 0, scrollLeft: 0,
    scrollHeight: opts.scrollHeight || 0, clientHeight: opts.clientHeight || 0,
    scrollWidth: opts.scrollWidth || 0, clientWidth: opts.clientWidth || 0,
    events: [],
    clicked: 0,
    focused: 0,
    scrollCalls: 0,
    getAttribute: (n) => (n === 'draggable' ? (opts.draggable === true ? 'true' : null) : null),
    dispatchEvent(e) {
      el.events.push(e.type);
      if (opts.preventWheelDefault && e.type === 'wheel' && typeof e.preventDefault === 'function') {
        e.preventDefault();
      }
      return e.defaultPrevented !== true;
    },
    click() { el.clicked += 1; },
    focus() { el.focused += 1; },
    scrollBy(o) {
      el.scrollCalls += 1;
      el.scrollTop += (o.top || 0);
      el.scrollLeft += (o.left || 0);
    }
  };
  return el;
}

function buildEnv({ hit, scroller, active, execOk = true, pageScroller, tabbables = [] }) {
  const calls = { exec: [], stability: [] };
  class Ev {
    constructor(type, init) {
      this.type = type;
      this.defaultPrevented = false;
      Object.assign(this, init || {});
    }
    preventDefault() {
      if (this.cancelable === true) this.defaultPrevented = true;
    }
  }
  const win = {
    innerWidth: 1000, innerHeight: 800, screenX: 0, screenY: 0,
    PointerEvent: Ev, MouseEvent: Ev, WheelEvent: Ev, DragEvent: Ev, KeyboardEvent: Ev,
    getComputedStyle: (n) => ({
      overflowY: n === scroller ? 'auto' : 'visible',
      overflowX: n === scroller ? 'auto' : 'visible'
    })
  };
  const body = makeEl('body');
  const html = makeEl('html');
  const doc = {
    body, documentElement: html,
    scrollingElement: pageScroller || scroller || html,
    activeElement: active || null,
    elementFromPoint: () => hit,
    querySelector: () => hit,
    querySelectorAll: () => tabbables,
    execCommand: (cmd, ui, val) => { calls.exec.push([cmd, val]); return execOk; }
  };
  const sandbox = {
    tools: {},
    window: win, document: doc,
    MouseEvent: Ev, PointerEvent: Ev, WheelEvent: Ev, DragEvent: Ev, Event: Ev,
    DataTransfer: function DataTransfer() { this.items = []; },
    FSB: { elementCache: new Map() },
    waitForStability: async (kind) => { calls.stability.push(kind); },
    setTimeout: (fn) => fn(),
    Math, Object, Promise, JSON, String, Number, Array
  };
  const fn = new Function(
    'tools', 'window', 'document', 'MouseEvent', 'PointerEvent', 'WheelEvent',
    'DragEvent', 'Event', 'DataTransfer', 'FSB', 'waitForStability',
    BLOCK + '\nreturn tools;'
  );
  const tools = fn(
    sandbox.tools, sandbox.window, sandbox.document, Ev, Ev, Ev, Ev, Ev,
    sandbox.DataTransfer, sandbox.FSB, sandbox.waitForStability
  );
  return { tools, calls, doc };
}

// Element with the focus-related surface the click and key paths read, whose
// focus()/blur() move document.activeElement the way a browser does.
function focusableEl(env, tag, opts = {}) {
  const el = makeEl(tag, opts);
  const attrs = opts.attrs || {};
  Object.assign(el, {
    type: opts.type || '',
    disabled: opts.disabled === true,
    readOnly: opts.readOnly === true,
    isContentEditable: opts.contentEditable === true,
    tabIndex: opts.tabIndex !== undefined ? opts.tabIndex : 0,
    form: opts.form || null,
    blurred: 0,
    hasAttribute: (n) => Object.prototype.hasOwnProperty.call(attrs, n),
    getClientRects: () => [1],
    focus() { el.focused += 1; env.doc.activeElement = el; },
    blur() { el.blurred += 1; if (env.doc.activeElement === el) env.doc.activeElement = env.doc.body; }
  });
  return el;
}

const DEGRADED_NOTE = /chrome\.debugger unavailable/;

(async function run() {
  console.log('\n=== 1. pointerClickAt ===');
  {
    const el = makeEl('button', { id: 'go' });
    const { tools } = buildEnv({ hit: el });
    const r = await tools.pointerClickAt({ x: 10, y: 20 });
    passAssert(r.success === true, 'succeeds');
    passAssertEqual(r.trusted, false, 'trusted:false');
    passAssertEqual(r.degraded, true, 'degraded:true');
    passAssert(DEGRADED_NOTE.test(r.cdpError), 'cdpError explains the platform gap');
    passAssertEqual(el.events.join(','),
      'pointerover,pointerenter,pointermove,pointerdown,mousedown,pointerup,mouseup,click',
      'full pointer+mouse sequence');
    passAssertEqual(el.events.filter((e) => e === 'click').length, 1, 'exactly one click event');
    passAssertEqual(el.clicked, 0,
      'native .click() NOT invoked -- a second click would double-fire listeners and undo toggles');
    passAssertEqual(r.target, '<button#go>', 'target described');
  }
  {
    const el = makeEl('a');
    const { tools } = buildEnv({ hit: el });
    await tools.pointerClickAt({ x: 10, y: 20, ctrlKey: true });
    passAssertEqual(el.clicked, 0, 'modifier-click does NOT call native .click()');
  }
  {
    const { tools } = buildEnv({ hit: null });
    const r = await tools.pointerClickAt({ x: 5, y: 5 });
    passAssert(r.success === false && /No element at/.test(r.error), 'no element -> explicit failure');
    const bad = await tools.pointerClickAt({ x: -1, y: 5 });
    passAssert(bad.success === false && /outside viewport/.test(bad.error), 'out-of-viewport rejected');
    const nan = await tools.pointerClickAt({});
    passAssert(nan.success === false && /coordinates required/.test(nan.error), 'missing coords rejected');
  }

  console.log('\n=== 2. pointerDoubleClickAt ===');
  {
    const el = makeEl('div');
    const { tools } = buildEnv({ hit: el });
    const r = await tools.pointerDoubleClickAt({ x: 1, y: 1 });
    passAssert(r.success === true && r.degraded === true, 'succeeds, degraded');
    passAssertEqual(el.events.filter((e) => e === 'click').length, 2, 'two click events');
    passAssertEqual(el.events.filter((e) => e === 'dblclick').length, 1, 'one dblclick');
    passAssert(el.events.indexOf('dblclick') === el.events.length - 1, 'dblclick fires last');
  }

  console.log('\n=== 3. pointerClickAndHoldAt ===');
  {
    const el = makeEl('div');
    const { tools } = buildEnv({ hit: el });
    const r = await tools.pointerClickAndHoldAt({ x: 1, y: 1, holdMs: 10 });
    passAssert(r.success === true, 'succeeds');
    passAssertEqual(r.holdMs, 10, 'holdMs echoed');
    const down = el.events.indexOf('pointerdown');
    const up = el.events.indexOf('pointerup');
    passAssert(down !== -1 && up !== -1 && down < up, 'pointerdown precedes pointerup');
  }

  console.log('\n=== 4. pointerDrag -- HTML5 branch ONLY when draggable ===');
  {
    const el = makeEl('div', { draggable: true });
    const { tools } = buildEnv({ hit: el });
    const r = await tools.pointerDrag({ startX: 0, startY: 0, endX: 100, endY: 100, steps: 3 });
    passAssert(r.success === true, 'succeeds');
    passAssertEqual(r.html5Drag, true, 'reports html5Drag:true');
    for (const t of ['dragstart', 'drag', 'dragover', 'drop', 'dragend']) {
      passAssert(el.events.includes(t), `fires ${t}`);
    }
    passAssert(el.events.indexOf('dragstart') < el.events.indexOf('drop'), 'dragstart precedes drop');
    passAssert(el.events.lastIndexOf('dragend') > el.events.indexOf('drop'), 'dragend follows drop');
  }
  {
    const el = makeEl('div', { draggable: false });
    const { tools } = buildEnv({ hit: el });
    const r = await tools.pointerDrag({ startX: 0, startY: 0, endX: 50, endY: 50, steps: 3 });
    passAssertEqual(r.html5Drag, false, 'non-draggable reports html5Drag:false');
    for (const t of ['dragstart', 'drag', 'drop', 'dragend']) {
      passAssert(!el.events.includes(t), `does NOT fire ${t} for a non-draggable source`);
    }
    passAssert(el.events.includes('pointermove'), 'still fires pointermove');
  }
  {
    const el = makeEl('div');
    const { tools } = buildEnv({ hit: el });
    const r = await tools.pointerDrag({ startX: 0, startY: 0, endX: 10 });
    passAssert(r.success === false && /endY required/.test(r.error), 'missing endY rejected');
  }

  console.log('\n=== 5. pointerDragVariableSpeed ===');
  {
    const el = makeEl('div');
    const { tools } = buildEnv({ hit: el });
    const r = await tools.pointerDragVariableSpeed({ startX: 0, startY: 0, endX: 40, endY: 40 });
    passAssert(r.success === true, 'succeeds');
    passAssertEqual(r.method, 'domPointerEventsVariableSpeed', 'distinct method label');
    passAssertEqual(r.steps, 30, 'defaults to 30 steps');
  }

  console.log('\n=== 6. wheelScrollAt actually scrolls ===');
  {
    const scroller = makeEl('div', { scrollHeight: 5000, clientHeight: 500 });
    const el = makeEl('span', { parentElement: scroller });
    const { tools } = buildEnv({ hit: el, scroller });
    const r = await tools.wheelScrollAt({ x: 5, y: 5, deltaY: 240 });
    passAssert(r.success === true && r.degraded === true, 'succeeds, degraded');
    passAssert(el.events.includes('wheel'), 'dispatches a wheel event for listener parity');
    passAssertEqual(scroller.scrollTop, 240,
      'performs a REAL scrollBy (an untrusted WheelEvent alone scrolls nothing)');
    passAssertEqual(r.scrolled.top, 240, 'reports the observed delta');
  }
  {
    const scroller = makeEl('div', { scrollHeight: 5000, clientHeight: 500 });
    const el = makeEl('canvas', { parentElement: scroller, preventWheelDefault: true });
    const { tools, calls } = buildEnv({ hit: el, scroller });
    const r = await tools.wheelScrollAt({ x: 5, y: 5, deltaY: 240 });
    passAssert(r.success === true && r.degraded === true, 'canceled wheel remains an honest degraded success');
    passAssert(el.events.includes('wheel'), 'dispatches the wheel event to the consuming map/canvas listener');
    passAssertEqual(scroller.scrollCalls, 0, 'preventDefault suppresses the programmatic scroll fallback');
    passAssertEqual(scroller.scrollTop, 0, 'a consumed map zoom does not also scroll its ancestor');
    passAssertEqual(r.scrolled.top, 0, 'reports zero observed scroll for a consumed wheel tick');
    passAssert(calls.stability.includes('scroll'), 'still waits for the listener-driven effect to settle');
  }

  console.log('\n=== 6b. wheelScrollAt walks the composed tree ===');
  // _fsbHitTest lands inside open shadow roots, where parentElement is null at
  // the shadow root. A walk that stops there scrolls the document instead, so
  // each case gives the document its own scroller to catch exactly that.
  {
    const host = makeEl('x-panel', { id: 'host', scrollHeight: 5000, clientHeight: 500 });
    const inner = makeEl('span');
    inner.parentNode = { nodeType: 11, host };
    const page = makeEl('html');
    const { tools } = buildEnv({ hit: inner, scroller: host, pageScroller: page });
    const r = await tools.wheelScrollAt({ x: 5, y: 5, deltaY: 240 });
    passAssertEqual(host.scrollTop, 240, 'shadow content scrolls its scrolling host');
    passAssertEqual(page.scrollCalls, 0, 'not the document');
    passAssertEqual(r.scroller, '<x-panel#host>', 'reports the host as the scroller');
  }
  {
    const outer = makeEl('div', { id: 'feed', scrollHeight: 5000, clientHeight: 500 });
    const host = makeEl('x-card', { parentElement: outer });
    const inner = makeEl('span');
    inner.parentNode = { nodeType: 11, host };
    const page = makeEl('html');
    const { tools } = buildEnv({ hit: inner, scroller: outer, pageScroller: page });
    await tools.wheelScrollAt({ x: 5, y: 5, deltaY: 240 });
    passAssertEqual(outer.scrollTop, 240, 'continues past the host to a light-DOM scroller above it');
    passAssertEqual(page.scrollCalls, 0, 'and does not fall through to the document');
  }
  {
    // Slotted content is laid out inside the component's own scroll box, which
    // its light-DOM parentElement (the host) skips straight over.
    const shadowScroller = makeEl('div', { id: 'list', scrollHeight: 5000, clientHeight: 500 });
    const slot = makeEl('slot', { parentElement: shadowScroller });
    const host = makeEl('x-list');
    const item = makeEl('li', { parentElement: host });
    item.assignedSlot = slot;
    const { tools } = buildEnv({ hit: item, scroller: shadowScroller, pageScroller: makeEl('html') });
    await tools.wheelScrollAt({ x: 5, y: 5, deltaY: 240 });
    passAssertEqual(shadowScroller.scrollTop, 240, 'slotted content scrolls the scroll box inside the component');
    passAssertEqual(host.scrollCalls, 0, 'not the host it is slotted into');
  }

  console.log('\n=== 7. domInsertTextAt ===');
  {
    const el = makeEl('input', { value: 'old' });
    const { tools, calls } = buildEnv({ hit: el, active: el });
    const r = await tools.domInsertTextAt({ text: 'hello', selector: '#x' });
    passAssert(r.success === true && r.degraded === true, 'succeeds, degraded');
    passAssertEqual(r.textLength, 5, 'reports text length');
    // insert_text's schema never sends clearFirst, and cdpInsertText treats it
    // as opt-in. Defaulting it ON here would make Safari wipe the very field
    // the model meant to insert into, while Chrome inserts at the cursor.
    passAssertEqual(el.value, 'old', 'does NOT clear by default -- parity with cdpInsertText');
    passAssert(!calls.exec.some((c) => c[0] === 'selectAll' || c[0] === 'delete'),
      'no selectAll/delete without an explicit clearFirst');
    passAssert(calls.exec.some((c) => c[0] === 'insertText' && c[1] === 'hello'),
      'uses execCommand insertText (what rich editors actually observe)');
    passAssert(el.events.includes('input') && el.events.includes('change'), 'fires input + change');
  }
  {
    const el = makeEl('input', { value: 'old' });
    const { tools } = buildEnv({ hit: el, active: el });
    const r = await tools.domInsertTextAt({ text: 'hello', selector: '#x', clearFirst: true });
    passAssert(r.success === true && r.clearFirst === true, 'explicit clearFirst is honoured');
    passAssertEqual(el.value, '', 'explicit clearFirst empties the field');
  }
  {
    const el = makeEl('div');
    const { tools } = buildEnv({ hit: el, active: el, execOk: false });
    const r = await tools.domInsertTextAt({ text: 'x', selector: '#y' });
    passAssert(r.success === false && /rejected/.test(r.error),
      'non-form element with execCommand rejected -> honest failure, not a false success');
  }
  {
    const { tools } = buildEnv({ hit: null, active: null });
    const r = await tools.domInsertTextAt({ text: 'x' });
    passAssert(r.success === false && /No focused element/.test(r.error), 'no target -> failure');
  }

  console.log('\n=== 7b. pointerClickAt moves focus the way a real mousedown does ===');
  {
    // Untrusted mousedown has no default action, so without this a remote
    // click into a field leaves focus where it was and typing goes nowhere.
    const env = {};
    const input = focusableEl(env, 'input', { type: 'text' });
    const realFocus = input.focus;
    input.focus = function () { input.events.push('FOCUS'); realFocus.call(input); };
    Object.assign(env, buildEnv({ hit: input }));
    await env.tools.pointerClickAt({ x: 10, y: 10 });
    passAssert(env.doc.activeElement === input, 'clicking an input focuses it');
    passAssertEqual(input.events.join(','),
      'pointerover,pointerenter,pointermove,pointerdown,mousedown,FOCUS,pointerup,mouseup,click',
      'focus moves between mousedown and mouseup, and the event sequence is unchanged');
  }
  {
    const env = {};
    const host = focusableEl(env, 'div', { contentEditable: true });
    const child = focusableEl(env, 'span', { contentEditable: true, parentElement: host });
    Object.assign(env, buildEnv({ hit: child }));
    await env.tools.pointerClickAt({ x: 10, y: 10 });
    passAssert(env.doc.activeElement === host && child.focused === 0,
      'a click inside a contenteditable focuses its editing host');
  }
  {
    const env = {};
    const field = focusableEl(env, 'input', { type: 'text' });
    const plain = makeEl('div');
    Object.assign(env, buildEnv({ hit: plain, active: field }));
    await env.tools.pointerClickAt({ x: 10, y: 10 });
    passAssertEqual(field.blurred, 1, 'a click on nothing focusable blurs the focused field');
  }
  {
    // Custom dropdowns cancel mousedown precisely so the input keeps focus.
    const env = {};
    const field = focusableEl(env, 'input', { type: 'text' });
    const option = focusableEl(env, 'li', { attrs: { tabindex: '-1' } });
    const realDispatch = option.dispatchEvent;
    option.dispatchEvent = function (e) {
      if (e.type === 'mousedown') e.preventDefault();
      return realDispatch.call(option, e);
    };
    Object.assign(env, buildEnv({ hit: option, active: field }));
    await env.tools.pointerClickAt({ x: 10, y: 10 });
    passAssert(env.doc.activeElement === field && field.blurred === 0 && option.focused === 0,
      'a page that cancels mousedown keeps focus where it was');
  }
  {
    const env = {};
    const wrapper = focusableEl(env, 'div', { attrs: { tabindex: '0' } });
    const button = focusableEl(env, 'button', { disabled: true, parentElement: wrapper });
    Object.assign(env, buildEnv({ hit: button }));
    await env.tools.pointerClickAt({ x: 10, y: 10 });
    passAssert(button.focused === 0 && env.doc.activeElement === wrapper,
      'a disabled control is skipped for its focusable ancestor');
  }

  console.log('\n=== 7c. domKeyPress ===');
  {
    const env = {};
    const input = focusableEl(env, 'input', { type: 'text' });
    Object.assign(env, buildEnv({ hit: input, active: input }));
    const r = await env.tools.domKeyPress({ key: 'Backspace', code: 'Backspace' });
    passAssert(r.success === true && r.trusted === false && r.degraded === true, 'succeeds, untrusted, degraded');
    passAssertEqual(r.method, 'domKeyEvents', 'method reported');
    passAssertEqual(input.events.join(','), 'keydown,keyup', 'keydown then keyup on the focused element');
    passAssertEqual(JSON.stringify(env.calls.exec), '[["delete",null]]', 'Backspace deletes when the page leaves it alone');
    passAssertEqual(r.defaultAction, 'delete', 'reports the default action it performed');
    passAssertEqual(env.calls.stability[0], 'type_keystroke', 'waits with the keystroke stability profile');
  }
  {
    const env = {};
    const input = focusableEl(env, 'input', { type: 'text' });
    const realDispatch = input.dispatchEvent;
    input.dispatchEvent = function (e) {
      if (e.type === 'keydown') e.preventDefault();
      return realDispatch.call(input, e);
    };
    Object.assign(env, buildEnv({ hit: input, active: input }));
    const r = await env.tools.domKeyPress({ key: 'Backspace' });
    passAssert(env.calls.exec.length === 0 && r.defaultAction === null,
      'a page that handles the keydown itself gets no second, emulated delete');
  }
  {
    const env = {};
    const input = focusableEl(env, 'input', { type: 'text' });
    Object.assign(env, buildEnv({ hit: input, active: input }));
    const r = await env.tools.domKeyPress({ key: 'Delete' });
    passAssertEqual(JSON.stringify(env.calls.exec), '[["forwardDelete",null]]', 'Delete deletes forward');
    passAssertEqual(r.defaultAction, 'forwardDelete', 'reported');
  }
  {
    const env = {};
    const input = focusableEl(env, 'input', { type: 'text', readOnly: true });
    Object.assign(env, buildEnv({ hit: input, active: input }));
    const r = await env.tools.domKeyPress({ key: 'Backspace' });
    passAssert(env.calls.exec.length === 0 && r.defaultAction === null, 'a read-only field is not edited');
  }
  {
    const env = {};
    const input = focusableEl(env, 'input', { type: 'text' });
    Object.assign(env, buildEnv({ hit: input, active: input }));
    const r = await env.tools.domKeyPress({ key: 'Backspace', ctrlKey: true });
    passAssert(env.calls.exec.length === 0 && r.defaultAction === null,
      'a modified key is left to the page (no guessing at shortcuts)');
  }
  {
    const env = {};
    let submitted = 0;
    const form = { requestSubmit: () => { submitted += 1; } };
    const input = focusableEl(env, 'input', { type: 'search', form });
    Object.assign(env, buildEnv({ hit: input, active: input }));
    const r = await env.tools.domKeyPress({ key: 'Enter' });
    passAssertEqual(submitted, 1, 'Enter in a form field submits through requestSubmit()');
    passAssertEqual(r.defaultAction, 'submit', 'reported');
  }
  {
    const env = {};
    const area = focusableEl(env, 'textarea');
    Object.assign(env, buildEnv({ hit: area, active: area }));
    const r = await env.tools.domKeyPress({ key: 'Enter' });
    passAssertEqual(JSON.stringify(env.calls.exec), '[["insertText","\\n"]]', 'Enter in a textarea inserts a newline');
    passAssertEqual(r.defaultAction, 'newline', 'reported');
  }
  {
    const env = {};
    const first = focusableEl(env, 'input', { type: 'text' });
    const second = focusableEl(env, 'button');
    Object.assign(env, buildEnv({ hit: first, active: first, tabbables: [first, second] }));
    const r = await env.tools.domKeyPress({ key: 'Tab' });
    passAssert(env.doc.activeElement === second, 'Tab focuses the next tabbable element');
    passAssertEqual(r.defaultAction, 'focus-next', 'reported');
    passAssert(first.events.includes('keydown') && !first.events.includes('keyup') && second.events.includes('keyup'),
      'the keyup lands on the newly focused element, as with a real press');
    const back = await env.tools.domKeyPress({ key: 'Tab', shiftKey: true });
    passAssert(env.doc.activeElement === first && back.defaultAction === 'focus-previous', 'Shift+Tab goes back');
  }
  {
    const env = {};
    const input = focusableEl(env, 'input', { type: 'text' });
    Object.assign(env, buildEnv({ hit: input, active: input }));
    const r = await env.tools.domKeyPress({ key: 'ArrowLeft' });
    passAssert(r.success === true && r.defaultAction === null && env.calls.exec.length === 0,
      'arrow keys reach page listeners but are not emulated');
    const missing = await env.tools.domKeyPress({});
    passAssert(missing.success === false && /key required/.test(missing.error), 'a missing key is rejected');
  }

  console.log('\n=== 8. every fallback reports untrusted ===');
  for (const name of ['pointerClickAt', 'pointerDoubleClickAt', 'pointerClickAndHoldAt',
                      'pointerDrag', 'pointerDragVariableSpeed', 'wheelScrollAt', 'domInsertTextAt',
                      'domKeyPress']) {
    passAssert(BLOCK.includes('tools.' + name) || BLOCK.includes(name), `${name} present in shipped block`);
  }
  passAssert(!/trusted:\s*true/.test(BLOCK), 'no fallback ever claims trusted:true');

  console.log('\n---');
  console.log('passed:', passed, 'failed:', failed);
  if (failed > 0) process.exit(1);
})().catch((e) => { console.error('TEST HARNESS ERROR:', e); process.exit(1); });
