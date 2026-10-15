/**
 * Phase 66 — locale resolver, English fallback, and catalog gate.
 * Run: node tests/extension-ui-locale.test.js
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const vm = require('vm');

const locale = require('../extension/utils/ui-locale.js');
const root = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
}

function runGate(args) {
  return spawnSync(process.execPath, ['scripts/verify-extension-i18n.mjs', ...args], {
    cwd: root,
    encoding: 'utf8'
  });
}

const catalogs = {
  en: { locale_seed_greeting: 'FSB is ready', locale_seed_replay: 'Replay speed $SPEED$', locale_seed_brand: 'FSB' },
  de: { locale_seed_greeting: 'FSB ist bereit', locale_seed_replay: 'Wiedergabegeschwindigkeit $SPEED$', locale_seed_brand: 'FSB' },
  ja: { locale_seed_greeting: 'FSBの準備ができました', locale_seed_replay: '再生速度 $SPEED$' },
  es: { locale_seed_replay: 'Velocidad de repetición $SPEED$' },
  'zh-CN': { locale_seed_greeting: 'FSB 已就绪' }
};

for (const code of Object.keys(catalogs)) locale.setCatalog(code, catalogs[code]);

check(locale.resolveLocale('de') === 'de', 'exact German tag');
check(locale.resolveLocale('de-AT') === 'de', 'German region falls back to de');
check(locale.resolveLocale('es-MX') === 'es', 'es-MX falls back to es');
check(locale.resolveLocale('zh-Hans') === 'zh-CN', 'zh-Hans maps to zh-CN');
check(locale.resolveLocale('zh-SG') === 'zh-CN', 'zh-SG maps to zh-CN');
check(locale.resolveLocale('zh') === 'zh-CN', 'bare zh maps to zh-CN');
check(locale.resolveLocale('zh-Hant') === 'zh-TW', 'zh-Hant maps to zh-TW');
check(locale.resolveLocale('zh-HK') === 'zh-TW', 'zh-HK maps to zh-TW');
check(locale.resolveLocale('zh_TW') === 'zh-TW', 'underscore zh_TW maps to zh-TW');
check(locale.resolveLocale('ja-JP') === 'ja', 'ja-JP falls back to ja');
check(locale.resolveLocale('fr-FR') === 'en', 'unknown tag falls back to English');
check(locale.resolveLocale(null) === 'en', 'missing tag falls back to English');
check(locale.folderFor('zh-CN') === 'zh_CN', 'Simplified Chinese folder is zh_CN');
check(locale.folderFor('zh-TW') === 'zh_TW', 'Traditional Chinese folder is zh_TW');

locale.setOverride(null);
locale.setBrowserTag('de');
check(locale.t('locale_seed_greeting') === 'FSB ist bereit', 'browser German loads the German seed');
locale.setBrowserTag('fr');
check(locale.t('locale_seed_greeting') === 'FSB is ready', 'unknown browser language loads English');

locale.setBrowserTag('en');
locale.setOverride('ja');
check(locale.t('locale_seed_greeting') === 'FSBの準備ができました', 'stored ja overrides an English browser');
locale.setOverride(null);
check(locale.t('locale_seed_greeting') === 'FSB is ready', 'clearing the override returns to the browser language');

locale.setOverride('ja');
check(locale.t('locale_seed_brand') === 'FSB', 'missing Japanese key shows English, not a blank string');
check(locale.t('locale_seed_replay', { SPEED: '2x' }) === '再生速度 2x', 'placeholder substitution follows the override');
locale.setOverride('es');
check(locale.t('locale_seed_greeting') === 'FSB is ready', 'empty Spanish greeting catalog falls back to English');

locale.setCatalog('es', { shell_ready: 'Listo', shell_owned_by: 'En uso por $LABEL$' });
locale.setOverride('es');
check(locale.text('shell_owned_by', 'Owned by Ada', { label: 'Ada' }) === 'En uso por Ada', 'text() applies the active catalog and substitutions');
check(locale.text('missing_shell_key', 'Fallback text') === 'Fallback text', 'text() returns the English fallback when the key is missing');
const exactNode = { setAttribute() {}, removeAttribute() {}, get firstChild() { return null; }, childNodes: [], textContent: '' };
locale.markExact(exactNode, 'Ready');
check(exactNode.textContent === 'Listo', 'markExact translates a known chrome string');
locale.markExact(exactNode, 'User typed this');
check(exactNode.textContent === 'User typed this', 'markExact leaves unknown text unchanged');
locale.setOverride(null);

const source = fs.readFileSync(path.join(root, 'extension/utils/ui-locale.js'), 'utf8');
check(!source.includes('fsb-locale'), 'resolver does not mention the website cookie name');
check(!source.includes('document.cookie'), 'resolver does not read document.cookie');

const background = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');
const identity = background.indexOf("importScripts('utils/install-identity.js')");
const uiLocale = background.indexOf("importScripts('utils/ui-locale.js')");
const config = background.indexOf("importScripts('config/config.js')");
check(identity !== -1 && uiLocale > identity && uiLocale < config, 'ui-locale loads immediately after install-identity');

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
check(manifest.default_locale === 'en', 'manifest default_locale is en');
check(manifest.name === '__MSG_ext_name__', 'manifest name is a message token');
check(manifest.description === '__MSG_ext_description__', 'manifest description is a message token');

const englishCatalog = JSON.parse(fs.readFileSync(path.join(root, 'extension/_locales/en/messages.json'), 'utf8'));
for (const [english, key] of Object.entries(locale.exact)) {
  check(englishCatalog[key] && englishCatalog[key].message === english, 'exact chrome key ' + key + ' matches the English catalog');
}

check(
  sha256('mcp/src/types.ts') === '6b5f312a5e9a9f3390c973a7f93ef7552db1c110aeeb116084c1f522e776770a',
  'mcp/src/types.ts is byte-stable'
);
check(
  sha256('extension/ai/tool-definitions.js') === '4fd0beeb8baca5e4c8fb502afd1fc412feaa242c3832e92aabca20b47639ebdd',
  'extension/ai/tool-definitions.js is byte-stable'
);

const live = runGate([]);
check(live.status === 0, 'live seed catalog passes the gate');

const good = runGate(['--root', 'tests/fixtures/extension-i18n/good', '--locales', 'en:en,es:es']);
check(good.status === 0, 'good fixture passes');

for (const name of ['bad-missing', 'bad-empty', 'bad-placeholder', 'bad-undefined-placeholder', 'bad-copy', 'bad-literal']) {
  const result = runGate(['--root', `tests/fixtures/extension-i18n/${name}`, '--locales', 'en:en,es:es']);
  check(result.status === 1, `${name} fixture fails the gate`);
}

const autonyms = ['English', 'Español', 'Deutsch', '日本語', '한국어', '简体中文', '繁體中文'];
check(JSON.stringify(locale.PUBLIC_LOCALES.map((code) => locale.NATIVE_LABELS[code])) === JSON.stringify(autonyms), 'language control uses the seven native autonyms');
locale.setBrowserTag('en');
locale.saveOverride('de');
check(locale.current() === 'de', 'choosing German applies without a browser restart');
locale.saveOverride('');
check(locale.current() === 'en', 'clearing the choice follows the browser language');

require('../extension/utils/copy-exact.js');
const copyMismatches = Object.entries(locale.exact).filter(([english, key]) => {
  return String(key).startsWith('copy_') && (!englishCatalog[key] || englishCatalog[key].message !== english);
});
check(copyMismatches.length === 0, 'copy exact map matches the English catalog');
const panelExact = JSON.parse(fs.readFileSync(path.join(root, 'extension/utils/panel-exact.js'), 'utf8').match(/var extra = (\{.*\});/)[1]);
const panelMismatches = Object.entries(panelExact).filter(([english, key]) => !englishCatalog[key] || englishCatalog[key].message !== english);
check(panelMismatches.length === 0, 'panel exact map matches the English catalog');
check(typeof locale.line === 'function', 'line translates a catalog template');
locale.setCatalog('de', { copy_probe: 'Vertrauen für $NAME$' });
locale.setOverride('de');
locale.registerExact({ 'Trust $NAME$ probe': 'copy_probe' });
check(locale.line('Trust $NAME$ probe', { name: 'Grok' }) === 'Vertrauen für Grok', 'line applies the active locale');
locale.setOverride(null);

// statusUpdate compares the shown status against English transient labels,
// which addStatusMessage() may have translated.
locale.registerExact({ 'Probe starting...': 'probe_transient' });
locale.setCatalog('de', { probe_transient: 'Probe wird gestartet...' });
locale.setOverride('de');
check(locale.isLine('Probe starting...', 'Probe wird gestartet...'), 'isLine matches the active translation of an exact line');
check(locale.isLine('Probe starting...', 'Probe starting...'), 'isLine matches the English source');
check(!locale.isLine('Probe starting...', 'Clicked the Submit button'), 'isLine rejects other text');
check(!locale.isLine('Probe starting...', undefined), 'isLine rejects a missing value');
check(!locale.isLine('Not an exact line', 'Probe wird gestartet...'), 'isLine needs the English line in the exact map');
check(!locale.isLine('constructor', 'function Object() { [native code] }'), 'isLine ignores inherited object keys');
locale.setOverride(null);
check(locale.isLine('Probe starting...', 'Probe wird gestartet...'), 'isLine still matches text drawn before the language changed');
for (const file of ['extension/ui/sidepanel.js', 'extension/ui/popup.js']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  check(!source.includes('!skipTexts.includes(prevText)') && source.includes('fsbUiLocale.isLine(english, prevText)'),
    `${file} skips translated transient status lines`);
}

const copyGate = spawnSync(process.execPath, ['scripts/verify-extension-copy.mjs'], { cwd: root, encoding: 'utf8' });
check(copyGate.status === 0, 'in-scope chrome is cataloged');
const badSentence = spawnSync(process.execPath, ['scripts/verify-extension-copy.mjs', '--file', 'tests/fixtures/extension-i18n/bad-sentence/ui.js'], { cwd: root, encoding: 'utf8' });
check(badSentence.status === 1, 'uncataloged chrome fixture fails');
check(String(badSentence.stderr).includes('This sentence is not cataloged.'), 'fixture reports the package-owned sentence');
check(String(badSentence.stderr).includes('ui.js:3: uncataloged chrome: This template sentence is not cataloged.'),
  'fixture reports a sentence inside a template expression on its own line');
check(String(badSentence.stderr).includes('$NAME$ sentence is not cataloged here.'), 'fixture reports a sentence that opens with a placeholder');
check(!String(badSentence.stderr).includes('User typed a secret sentence here.'), 'log sentences stay off the coverage gate');
const badUnwired = spawnSync(process.execPath, ['scripts/verify-extension-copy.mjs', '--file', 'tests/fixtures/extension-i18n/bad-unwired/page.html'], { cwd: root, encoding: 'utf8' });
check(badUnwired.status === 1, 'cataloged but unwired HTML text fails');
check(String(badUnwired.stderr).includes('page.html:1: unwired chrome'), 'fixture reports the unwired button label');
check(!/page\.html:[23]:/.test(String(badUnwired.stderr)), 'keyed and translate="no" text stay off the coverage gate');
// Text in markup that JS builds is never translated in place, and a quote or
// `//` inside a regex literal must not shift the scan.
const badMarkup = spawnSync(process.execPath, ['scripts/verify-extension-copy.mjs', '--file', 'tests/fixtures/extension-i18n/bad-markup/ui.js'], { cwd: root, encoding: 'utf8' });
const markupErrors = String(badMarkup.stderr);
check(badMarkup.status === 1, 'unwired markup fixture fails');
check(markupErrors.includes('ui.js:1: unwired chrome in markup (route through the locale helper): Markup sentence is not wired.'),
  'fixture reports markup text in a quoted string');
check(markupErrors.includes('ui.js:2: unwired chrome in markup (route through the locale helper): Sign Up Now'),
  'fixture reports a short label in template markup');
check(markupErrors.includes('ui.js:3: unwired chrome in markup (route through the locale helper): Close this panel'),
  'fixture reports a labelled attribute in template markup');
check(markupErrors.includes('ui.js:5: uncataloged chrome: This sentence follows a regex literal.'),
  'quotes and a trailing \\/\\/ inside a regex literal do not shift the scan');
check(!/ui\.js:(?:[4679]|10):/.test(markupErrors), 'wired, keyed, translate="no", brand, and logged markup stay off the gate');

// The gate only proves copy goes through a helper. Each English literal handed
// to an exact-map helper must also resolve to a key on its page.
function pageExactMap(files) {
  const sandbox = { module: undefined };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox);
  return sandbox.fsbUiLocale.exact;
}
const literal = "'((?:[^'\\\\]|\\\\.)*)'";
for (const [file, maps, helpers] of [
  ['extension/ui/options.js', ['extension/utils/panel-exact.js', 'extension/utils/copy-exact.js'], 'fsbUiLine|fsbUiHtml|fsbUiMarkup'],
  ['extension/ui/sidepanel.js', ['extension/utils/copy-exact.js'], 'spLine']
]) {
  const exactMap = pageExactMap(['extension/utils/ui-locale.js', ...maps]);
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const direct = new RegExp(`\\b(?:${helpers})\\(\\s*${literal}`, 'g');
  const ternary = new RegExp(`\\b(?:${helpers})\\([^'()\\n]*\\?\\s*${literal}\\s*:\\s*${literal}`, 'g');
  const english = [];
  for (const match of source.matchAll(direct)) english.push(match[1]);
  for (const match of source.matchAll(ternary)) english.push(match[1], match[2]);
  const unresolved = english.map((text) => text.replace(/\\'/g, "'")).filter((text) => !Object.prototype.hasOwnProperty.call(exactMap, text));
  check(english.length > 0 && unresolved.length === 0, `${file} copy helpers resolve to catalog keys${unresolved.length ? ': ' + unresolved.join(' | ') : ''}`);
}

// MV3's default CSP blocks inline scripts on extension pages, so a boot call
// placed inline never runs.
const uiDir = path.join(root, 'extension/ui');
for (const file of fs.readdirSync(uiDir).filter((name) => name.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(uiDir, file), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/\bsrc\s*=/.test(match[1]) && match[2].trim());
  check(inline.length === 0, `${file} has no inline script`);
}

check(manifest.web_accessible_resources.some((entry) => entry.resources.includes('_locales/*/messages.json')),
  'content scripts can fetch the locale catalogs');

const optionsSource = fs.readFileSync(path.join(root, 'extension/ui/options.js'), 'utf8');
check(optionsSource.includes("hint.textContent = fsbUiLine('Automation prohibited for this origin. ')\n          + (classified.reason || '');"),
  'the blocked-origin hint keeps its denial reason');

const getMessageCalls = [];
globalThis.chrome = { i18n: { getMessage(key, subs) { getMessageCalls.push(subs); return 'Actions: '; } } };
locale.setBrowserTag('en');
locale.setOverride(null);
check(locale.text('probe_missing_key', 'Actions: 5', { count: 5 }) === 'Actions: 5', 'named substitutions keep their values when the catalog lacks the key');
check(getMessageCalls.length === 0, 'chrome.i18n.getMessage never receives named substitutions');
check(locale.t('probe_missing_key') === 'Actions: ' && getMessageCalls.length === 1, 'plain lookups still fall back to chrome.i18n');
delete globalThis.chrome;

// Every static data-i18n text and data-i18n-attr value must equal its English
// message, or apply() will treat it as page-owned and never translate it.
function norm(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_all, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_all, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/&rarr;/g, '→')
    .replace(/&times;/g, '×')
    .replace(/&amp;/g, '&');
}

function staticMismatches(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
  const misses = [];
  const open = [];
  const token = /<\/([A-Za-z0-9]+)\s*>|<([A-Za-z0-9]+)((?:\s+[^\s=>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let match;
  while ((match = token.exec(source))) {
    if (match[1]) {
      const name = match[1].toLowerCase();
      for (let n = open.length - 1; n >= 0; n -= 1) {
        if (open[n].name !== name) continue;
        const frame = open.splice(n)[0];
        if (frame.key && norm(frame.text) !== norm(englishCatalog[frame.key] && englishCatalog[frame.key].message)) {
          misses.push(`${frame.key}: "${norm(frame.text)}"`);
        }
        break;
      }
      continue;
    }
    if (match[2]) {
      const name = match[2].toLowerCase();
      // apply() skips keyed nodes with child markup, so they would never translate.
      for (const frame of open) {
        if (frame.key) misses.push(`${frame.key}: contains <${name}> markup`);
      }
      const attrs = {};
      for (const attr of (match[3] || '').matchAll(/([^\s=]+)\s*=\s*"([^"]*)"/g)) attrs[attr[1]] = decodeEntities(attr[2]);
      for (const part of (attrs['data-i18n-attr'] || '').split(',')) {
        const bits = part.split(':');
        if (bits.length !== 2) continue;
        const key = bits[1].trim();
        if (norm(attrs[bits[0].trim()]) !== norm(englishCatalog[key] && englishCatalog[key].message)) {
          misses.push(`${key}: ${bits[0].trim()}="${attrs[bits[0].trim()]}"`);
        }
      }
      if (match[4] === '/' || /^(img|input|br|hr|meta|link|source)$/.test(name)) continue;
      open.push({ name, key: attrs['data-i18n'] || null, text: '' });
      continue;
    }
    const value = decodeEntities(match[5]);
    for (const frame of open) frame.text += value;
  }
  return misses;
}

for (const file of [
  'extension/ui/control_panel.html',
  'extension/ui/sidepanel.html',
  'extension/ui/popup.html',
  'extension/ui/unlock.html',
  'extension/ui/microphone-permission.html',
  'extension/ui/onboarding.html'
]) {
  const misses = staticMismatches(file);
  check(misses.length === 0, `${file} static i18n text matches the English catalog${misses.length ? ' (' + misses.slice(0, 3).join('; ') + ')' : ''}`);
}

function fakeNode(attrs, textContent) {
  return {
    attrs: Object.assign({}, attrs),
    textContent,
    childNodes: [],
    get firstChild() { return null; },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    removeAttribute(name) { delete this.attrs[name]; }
  };
}

function fakeSelect() {
  const doc = {
    createElement() {
      return { attrs: {}, setAttribute(name, value) { this.attrs[name] = String(value); } };
    }
  };
  return {
    attrs: {},
    options: [],
    listeners: {},
    value: '',
    ownerDocument: doc,
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    appendChild(node) { this.options.push(node); },
    addEventListener(type, fn) { this.listeners[type] = fn; }
  };
}

function fakeDoc(nodes) {
  return {
    querySelectorAll(selector) {
      const name = selector.slice(1, -1);
      return nodes.filter((node) => node.getAttribute(name) != null);
    }
  };
}

async function asyncChecks() {
  const requested = [];
  await locale.loadCatalogs((url) => {
    requested.push(url);
    return Promise.resolve({ json: () => ({}) });
  }, ['ko', 'zh-TW']);
  check(JSON.stringify(requested) === JSON.stringify(['_locales/ko/messages.json', '_locales/zh_TW/messages.json']),
    'loadCatalogs fetches only the requested locales');
  const realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = () => { fetched += 1; return Promise.reject(new Error('unexpected fetch')); };
  await locale.ensureCatalog('ko');
  globalThis.fetch = realFetch;
  check(fetched === 0, 'ensureCatalog does not refetch a loaded catalog');

  locale.setCatalog('en', { probe_count: '0 of 8 active', probe_title: 'Agent CLI', probe_label: 'Consent mode for origin', shell_ready: 'Ready', shell_working: 'Working' });
  locale.setCatalog('de', { probe_count: '0 von 8 aktiv', probe_title: 'Agent-CLI', probe_label: 'Einwilligungsmodus für Ursprung', shell_ready: 'Bereit', shell_working: 'Arbeitet' });
  locale.setBrowserTag('en');
  locale.setOverride('de');

  const counter = fakeNode({ 'data-i18n': 'probe_count' }, '3 of 4 active');
  const heading = fakeNode({ 'data-i18n': 'probe_title' }, '\n      Agent CLI\n    ');
  const clonedRow = fakeNode({ 'data-i18n-attr': 'aria-label:probe_label', 'aria-label': 'Consent mode for example.com' }, '');
  const templateRow = fakeNode({ 'data-i18n-attr': 'aria-label:probe_label', 'aria-label': 'Consent mode for origin' }, '');
  locale.apply(fakeDoc([counter, heading, clonedRow, templateRow]));
  check(counter.textContent === '3 of 4 active', 'apply leaves static text that a page script replaced');
  check(heading.textContent === 'Agent-CLI', 'apply translates static text that still shows its catalog message');
  check(clonedRow.getAttribute('aria-label') === 'Consent mode for example.com', 'apply leaves attributes that a page script replaced');
  check(templateRow.getAttribute('aria-label') === 'Einwilligungsmodus für Ursprung', 'apply translates attributes that still show their catalog message');

  const withMarkup = fakeNode({ 'data-i18n': 'probe_title' }, 'Agent CLI');
  withMarkup.children = [{}];
  locale.apply(fakeDoc([withMarkup]));
  check(withMarkup.textContent === 'Agent CLI', 'apply leaves static nodes that hold child markup');

  const status = fakeNode({ 'data-i18n': 'shell_ready' }, 'Ready');
  locale.markExact(status, 'Working');
  check(status.textContent === 'Arbeitet' && status.getAttribute('data-i18n-shown') === 'Arbeitet', 'fill records the shown text');
  status.textContent = 'Owned by Ada';
  locale.apply(fakeDoc([status]));
  check(status.textContent === 'Owned by Ada', 'apply leaves a live node that a page script overwrote');
  check(status.getAttribute('data-i18n-live') === null, 'apply drops the live key of an overwritten node');

  const runner = fakeNode({}, '');
  locale.markExact(runner, 'Working');
  locale.setOverride(null);
  locale.apply(fakeDoc([runner]));
  check(runner.textContent === 'Working', 'apply re-translates a live node it still owns');
  locale.markExact(runner, 'Clicking the submit button');
  check(runner.getAttribute('data-i18n-live') === null && runner.getAttribute('data-i18n-shown') === null,
    'markExact with uncataloged text clears the previous live key');
  locale.apply(fakeDoc([runner]));
  check(runner.textContent === 'Clicking the submit button', 'apply does not bring back a cleared live string');

  const select = fakeSelect();
  locale.mountSelect(select);
  check(select.value === '', 'a new picker follows the browser');
  await locale.saveOverride('de');
  check(select.value === 'de', 'the picker follows a language change made elsewhere');
  await locale.saveOverride(null);
  check(select.value === '', 'the picker follows a return to the browser language');

  // Content scripts are re-injected into live tabs. The second run must keep
  // the booted instance and its override.
  locale.setOverride('de');
  new Function(source)();
  check(globalThis.fsbUiLocale === locale, 're-injection keeps the booted instance');
  check(locale.t('shell_working') === 'Arbeitet', 're-injection keeps the active override');
  locale.setOverride(null);

  // Content scripts draw overlay text before boot() finishes, through
  // chrome.i18n in the browser language. boot() must load that catalog too, or
  // the text is never recognised and replaced once the stored override applies.
  const jaOverlay = { probe_overlay: { message: 'FSB が自動化中' } };
  const enOverlay = { probe_overlay: { message: 'FSB Automating' } };
  locale.setCatalog('en', {});
  locale.setCatalog('ja', {});
  locale.setBrowserTag(null);
  const bootRequests = [];
  const fetchBeforeBoot = globalThis.fetch;
  globalThis.chrome = {
    i18n: { getUILanguage: () => 'ja', getMessage: (key) => (jaOverlay[key] ? jaOverlay[key].message : '') },
    storage: { local: { get: (_key, cb) => cb({ fsbUiLocale: 'en' }) }, onChanged: { addListener() {} } },
    runtime: { getURL: (file) => file }
  };
  globalThis.fetch = (url) => {
    bootRequests.push(url);
    return Promise.resolve({ json: () => (url.indexOf('/ja/') !== -1 ? jaOverlay : enOverlay) });
  };
  const drawnBeforeBoot = locale.text('probe_overlay', 'FSB Automating');
  try {
    await locale.boot();
  } finally {
    globalThis.fetch = fetchBeforeBoot;
    delete globalThis.chrome;
  }
  check(drawnBeforeBoot === 'FSB が自動化中', 'text drawn before boot follows the browser language');
  check(bootRequests.indexOf('_locales/ja/messages.json') !== -1 && bootRequests.indexOf('_locales/en/messages.json') !== -1,
    'content-script boot loads the browser catalog next to the override');
  check(locale.isMessage('probe_overlay', drawnBeforeBoot), 'boot recognises browser-language text drawn before it finished');
  check(locale.t('probe_overlay') === 'FSB Automating', 'the stored override applies after boot');
  locale.setOverride(null);
  locale.setBrowserTag(null);
}

asyncChecks().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}, (err) => {
  console.error(err);
  process.exit(1);
});
