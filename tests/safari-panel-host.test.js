/**
 * In-page panel host: extension/content/panel-host.js.
 *
 * Safari has no side panel for extensions, so the platform adapter asks this
 * content script to show FSB's panel page inside the web page: an iframe in a
 * closed shadow root, pinned to the left edge in the top layer, with the
 * page's content moved out from under it. This locks:
 *   1. it only acts on its own three messages, and only for its own worker;
 *   2. it frames nothing but this extension's own URL;
 *   3. the host it builds, and that a second show does not build another;
 *   4. the room it reserves in the page, and that hiding gives it back exactly;
 *   5. it copes with a narrow window, a missing top layer, and re-injection;
 *   6. the rest of FSB treats the host as its own (page analysis, messaging),
 *      and the script is injected with the other content scripts.
 *
 * Run: node tests/safari-panel-host.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'extension', 'content', 'panel-host.js'), 'utf8');
const OWN = 'safari-web-extension://sfr/';
const PAGE = OWN + 'ui/sidepanel.html';

let passed = 0;
let failed = 0;
function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}
function passAssertEqual(actual, expected, msg) {
  passAssert(actual === expected, msg + ' (got ' + JSON.stringify(actual) + ')');
}

function fakeStyle() {
  const props = {};
  return {
    cssText: '',
    setProperty(name, value, priority) { props[name] = { value: String(value), priority: priority || '' }; },
    getPropertyValue(name) { return props[name] ? props[name].value : ''; },
    getPropertyPriority(name) { return props[name] ? props[name].priority : ''; },
    removeProperty(name) { delete props[name]; },
    _props: props
  };
}

function fakeElement(tag, doc) {
  const el = {
    tagName: String(tag).toUpperCase(),
    attrs: {},
    style: fakeStyle(),
    children: [],
    parent: null,
    shadow: null,
    popoverShown: 0,
    get isConnected() { return this.parent === doc.documentElement || this === doc.documentElement; },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
    removeAttribute(name) { delete this.attrs[name]; },
    appendChild(child) { child.parent = this; this.children.push(child); return child; },
    remove() {
      if (!this.parent) return;
      this.parent.children = this.parent.children.filter((c) => c !== this);
      this.parent = null;
    },
    attachShadow(init) {
      this.shadowMode = init.mode;
      this.shadow = fakeElement('#shadow', doc);
      return this.shadow;
    }
  };
  return el;
}

// One page: a document, a window, and the extension runtime a content script sees.
function page(options) {
  const opts = options || {};
  const doc = { createElement: (tag) => fakeElement(tag, doc) };
  doc.documentElement = fakeElement('html', doc);
  if (opts.margin) doc.documentElement.style.setProperty('margin-left', opts.margin, opts.marginPriority || '');
  if (opts.topLayer !== false) {
    const create = doc.createElement;
    doc.createElement = (tag) => {
      const el = create(tag);
      el.showPopover = function () {
        if (opts.topLayer === 'throws') throw new Error('not allowed');
        this.popoverShown++;
      };
      return el;
    };
  }
  const listeners = [];
  const win = { innerWidth: opts.innerWidth || 1600 };
  const chrome = {
    runtime: {
      id: 'sfr',
      getURL: (file) => OWN + file,
      onMessage: { addListener: (fn) => listeners.push(fn) }
    }
  };
  const load = () => new Function('window', 'document', 'chrome', 'module', SOURCE)(win, doc, chrome, undefined);
  load();
  const send = (message, sender) => {
    const replies = [];
    listeners.forEach((fn) => fn(message, sender || { id: 'sfr' }, (reply) => replies.push(reply)));
    return replies;
  };
  const hosts = () => doc.documentElement.children.filter((c) => c.attrs.id === 'fsb-panel-host' || c.id === 'fsb-panel-host');
  return { doc, win, listeners, load, send, hosts, html: doc.documentElement };
}

console.log('\n=== 1. it acts only on its own messages, from its own worker ===');
{
  const p = page();
  passAssertEqual(p.listeners.length, 1, 'one message listener');
  passAssertEqual(p.send({ action: 'sessionStatus' }).length, 0, 'another action gets no answer from it');
  passAssertEqual(p.send(null).length, 0, 'nor does a message with no action');
  passAssertEqual(p.send({ action: 'fsbPanelShow', url: PAGE }, { id: 'someone-else' }).length, 0,
    'a message from another extension is ignored');
  passAssertEqual(p.hosts().length, 0, 'and nothing is shown for it');
  const state = p.send({ action: 'fsbPanelState' });
  passAssert(state.length === 1 && state[0].success === true && state[0].shown === false, 'fsbPanelState answers: not shown');
}

console.log('\n=== 2. it frames nothing but this extension\'s own page ===');
for (const url of ['https://evil.example/ui/sidepanel.html', 'safari-web-extension://other/ui/sidepanel.html',
  'webkit-masked-url://hidden/ui/sidepanel.html', 'javascript:alert(1)', '', undefined]) {
  const p = page();
  const reply = p.send({ action: 'fsbPanelShow', url })[0];
  passAssert(reply && reply.shown === false && p.hosts().length === 0, 'refuses ' + JSON.stringify(url));
}

console.log('\n=== 3. the panel it shows ===');
{
  const p = page();
  const reply = p.send({ action: 'fsbPanelShow', url: PAGE, width: 420 })[0];
  passAssert(reply && reply.success === true && reply.shown === true, 'fsbPanelShow answers: shown');
  passAssertEqual(p.hosts().length, 1, 'one host on <html>');
  const host = p.hosts()[0];
  passAssertEqual(host.getAttribute('data-fsb-overlay'), 'panel-host', 'marked as an FSB overlay, so captures and page reads skip it');
  const css = host.style.cssText;
  passAssert(/all: initial !important/.test(css) && /position: fixed !important/.test(css), 'reset and fixed, against the page\'s own styles');
  passAssert(/top: 0 !important/.test(css) && /left: 0 !important/.test(css) && /bottom: 0 !important/.test(css),
    'pinned to the left edge, full height');
  passAssert(!/right: 0/.test(css), 'and not to the right');
  passAssert(/width: 420px !important/.test(css), 'at the width it was asked for');
  passAssertEqual(host.shadowMode, 'closed', 'its shadow root is closed to the page');
  const frame = host.shadow.children.find((c) => c.tagName === 'IFRAME');
  passAssert(!!frame && frame.src === PAGE, 'holding an iframe on the panel page');
  passAssertEqual(frame && frame.getAttribute('allow'), 'clipboard-write; microphone', 'that may copy and use the microphone');
  passAssert(host.getAttribute('popover') === 'manual' && host.popoverShown === 1, 'promoted to the top layer');

  p.send({ action: 'fsbPanelShow', url: PAGE, width: 420 });
  passAssertEqual(p.hosts().length, 1, 'a second show does not build a second panel');
  passAssertEqual(p.send({ action: 'fsbPanelState' })[0].shown, true, 'fsbPanelState answers: shown');
}

console.log('\n=== 4. the room it takes from the page, and gives back ===');
{
  const p = page();
  p.send({ action: 'fsbPanelShow', url: PAGE, width: 420 });
  passAssertEqual(p.html.style.getPropertyValue('margin-left'), '420px', 'page content is moved out from under the panel');
  passAssertEqual(p.html.style.getPropertyPriority('margin-left'), 'important', 'over the page\'s own rules');
  passAssertEqual(p.html.style.getPropertyValue('margin-right'), '', 'the right-hand side, where FSB\'s overlays sit, is left alone');
  passAssertEqual(p.html.style.getPropertyValue('--fsb-panel-inset'), '420px', 'and the working glow is told where the page now starts');
  const reply = p.send({ action: 'fsbPanelHide' })[0];
  passAssert(reply && reply.shown === false && p.hosts().length === 0, 'fsbPanelHide removes the panel');
  passAssertEqual(p.html.style.getPropertyValue('margin-left'), '', 'the margin is gone');
  passAssertEqual(Object.keys(p.html.style._props).length, 0, 'and nothing else is left on the page\'s <html>');
  passAssertEqual(p.send({ action: 'fsbPanelHide' })[0].shown, false, 'hiding twice is harmless');
}
{
  const p = page({ margin: '12px', marginPriority: 'important' });
  p.send({ action: 'fsbPanelShow', url: PAGE, width: 420 });
  p.send({ action: 'fsbPanelShow', url: PAGE, width: 420 });
  p.send({ action: 'fsbPanelHide' });
  passAssertEqual(p.html.style.getPropertyValue('margin-left') + ' ' + p.html.style.getPropertyPriority('margin-left'),
    '12px important', 'a page\'s own inline margin comes back exactly');
}

console.log('\n=== 5. narrow windows, no top layer, re-injection ===');
{
  const narrow = page({ innerWidth: 800 });
  narrow.send({ action: 'fsbPanelShow', url: PAGE, width: 420 });
  passAssert(/width: 320px !important/.test(narrow.hosts()[0].style.cssText), 'a narrow window leaves the page 480px and takes the rest');
  const tiny = page({ innerWidth: 600 });
  tiny.send({ action: 'fsbPanelShow', url: PAGE, width: 420 });
  passAssert(/width: 280px !important/.test(tiny.hosts()[0].style.cssText), 'but never less than 280px');
  const plain = page({ topLayer: false });
  passAssertEqual(plain.send({ action: 'fsbPanelShow', url: PAGE })[0].shown, true, 'a browser with no popover still shows it');
  passAssert(/width: 420px !important/.test(plain.hosts()[0].style.cssText), 'at the default width when none is given');
  const refused = page({ topLayer: 'throws' });
  passAssertEqual(refused.send({ action: 'fsbPanelShow', url: PAGE })[0].shown, true, 'a refused promotion still shows it');
  passAssertEqual(refused.hosts()[0].getAttribute('popover'), null, 'without a dangling popover attribute');
  const again = page();
  again.load();
  passAssertEqual(again.listeners.length, 1, 're-injecting the script does not add a second listener');
}

console.log('\n=== 6. the rest of FSB knows the host ===');
{
  const read = (file) => fs.readFileSync(path.join(ROOT, 'extension', file), 'utf8');
  const background = read('background.js');
  const list = background.slice(background.indexOf('const CONTENT_SCRIPT_FILES = ['), background.indexOf('];', background.indexOf('const CONTENT_SCRIPT_FILES = [')));
  passAssert(list.includes("'content/panel-host.js'"), 'it is injected with the other content scripts');
  passAssert(list.indexOf("'content/panel-host.js'") < list.indexOf("'content/messaging.js'"), 'before the scripts that announce readiness');
  passAssert(/FSB_HOST_IDS = new Set\(\[[^\]]*'fsb-panel-host'/.test(read('content/utils.js')), 'page analysis treats the host as FSB\'s own');
  passAssert(/request\.action\.indexOf\('fsbPanel'\) === 0\) return false;/.test(read('content/messaging.js')),
    'the main message handler leaves the panel\'s messages to this script instead of answering "Unknown action"');
  const feedback = read('content/visual-feedback.js');
  passAssert(/inset:0!important;left:var\(--fsb-panel-inset,0px\)!important;/.test(feedback)
    && /\.viewport-glow-root \{\s*position: fixed;\s*inset: 0;\s*left: var\(--fsb-panel-inset, 0px\);/.test(feedback),
    'the working glow frames the page beside the panel instead of running over it');
  passAssertEqual((feedback.match(/--fsb-panel-inset/g) || []).length, 3, 'and nothing else in the overlays moves for the panel');
  passAssert(!/fsb-panel-debug|TEMPORARY/.test(SOURCE), 'no development hook is left in the script');
}

console.log('\n---');
console.log('passed:', passed, 'failed:', failed);
if (failed > 0) process.exit(1);
