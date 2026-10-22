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
locale.setPreferredLanguages(['fr-FR', 'de-DE', 'en']);
check(locale.t('locale_seed_greeting') === 'FSB ist bereit', "Chrome's language list picks German over an English UI");
locale.setOverride('ja');
check(locale.t('locale_seed_greeting') === 'FSBの準備ができました', 'stored ja overrides the automatic language');
locale.setOverride(null);
check(locale.t('locale_seed_greeting') === 'FSB ist bereit', "clearing the override returns to the language from Chrome's list");
locale.setPreferredLanguages(null);
check(locale.t('locale_seed_greeting') === 'FSB is ready', 'without a language list the browser UI language decides');

// The automatic language: the first entry in Chrome's preferred-languages list
// that has a catalog (English counts), region subtags pick the variant, and the
// time zone only settles a bare "zh". No match falls back to the UI language.
for (const [input, expected, label] of [
  [{ accept: ['ja', 'en'] }, 'ja', 'the first listed language wins'],
  [{ accept: ['en-US', 'ja'], ui: 'ja' }, 'en', 'English first stays English'],
  [{ accept: ['fr', 'de'] }, 'de', 'an unsupported language is skipped'],
  [{ accept: ['fr'], ui: 'ko' }, 'ko', 'no supported entry falls back to the UI language'],
  [{ accept: ['fr'], ui: 'pt-BR' }, 'en', 'no supported entry or UI language falls back to English'],
  [{ accept: [], ui: 'de-AT' }, 'de', 'an empty list falls back to the UI language'],
  [{ accept: ['zh', 'zh-TW'] }, 'zh-TW', 'a bare zh takes its script from a later zh-TW'],
  [{ accept: ['zh', 'en', 'zh-HK'], timeZone: 'Asia/Shanghai' }, 'zh-TW', 'a later regional zh beats the time zone'],
  [{ accept: ['zh'], timeZone: 'Asia/Taipei' }, 'zh-TW', 'a bare zh in Taipei is Traditional'],
  [{ accept: ['zh'], timeZone: 'Asia/Hong_Kong' }, 'zh-TW', 'a bare zh in Hong Kong is Traditional'],
  [{ accept: ['zh'], timeZone: 'Asia/Shanghai' }, 'zh-CN', 'a bare zh in Shanghai is Simplified'],
  [{ accept: ['zh'] }, 'zh-CN', 'a bare zh with no time zone is Simplified'],
  [{ accept: ['zh-MO'] }, 'zh-TW', 'zh-MO is Traditional'],
  [{ accept: ['zh-Hans-HK'], timeZone: 'Asia/Hong_Kong' }, 'zh-CN', 'an explicit script beats the region and time zone'],
  [{ accept: ['es-MX'] }, 'es', 'es-MX resolves to es'],
  [{ accept: ['ko_KR'] }, 'ko', 'underscore tags resolve'],
  [{}, 'en', 'nothing known resolves to English']
]) {
  check(locale.resolveDefault(input) === expected, `resolveDefault: ${label}`);
}
check(locale.resolveDefault({ accept: ['constructor'], ui: 'toString' }) === 'en'
    && locale.resolveDefault({ accept: ['zh'], timeZone: 'constructor' }) === 'zh-CN',
  'resolveDefault ignores inherited object keys');
locale.setBrowserTag('en');
locale.setPreferredLanguages(['zh', 'en']);
locale.setTimeZone('Asia/Taipei');
check(locale.current() === 'zh-TW', 'the live time zone settles a bare zh as Traditional');
locale.setTimeZone('Asia/Shanghai');
check(locale.current() === 'zh-CN', 'the live time zone settles a bare zh as Simplified');
locale.setTimeZone(null);
locale.setPreferredLanguages(null);

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

// Nothing in the service worker translates, so it does not load the module.
// Content scripts do, right before the overlay that uses it.
const background = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');
const wsClient = fs.readFileSync(path.join(root, 'extension/ws/ws-client.js'), 'utf8');
check(!background.includes("importScripts('utils/ui-locale.js')"), 'the service worker does not load ui-locale.js');
const contentScriptOrder = /'utils\/ui-locale\.js',\s*'content\/visual-feedback\.js'/;
check(contentScriptOrder.test(background) && contentScriptOrder.test(wsClient),
  'both content-script lists inject ui-locale.js right before visual-feedback.js');

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
locale.setPreferredLanguages(['ja-JP', 'en']);
locale.saveOverride('de');
check(locale.current() === 'de', 'choosing German applies without a browser restart');
locale.saveOverride('');
check(locale.current() === 'ja', "clearing the choice returns to the language from Chrome's list");
locale.setPreferredLanguages(null);

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
check(locale.line('constructor') === 'constructor' && locale.line('constructor', { name: 'Ada' }) === 'constructor',
  'line ignores inherited object keys');
const protoNode = fakeNode({}, '');
locale.markExact(protoNode, 'toString');
check(protoNode.textContent === 'toString' && protoNode.getAttribute('data-i18n-live') === null,
  'markExact ignores inherited object keys');
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
  ['extension/ui/sidepanel.js', ['extension/utils/copy-exact.js'], 'spLine|fsbUiLocale\\.line']
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

// Status, toast, and delegation copy that reaches markExact() or a template
// through a variable. Each literal must still be in its file and resolve on
// that page.
const sidePanelMap = pageExactMap(['extension/utils/ui-locale.js', 'extension/utils/copy-exact.js']);
const controlPanelMap = pageExactMap(['extension/utils/ui-locale.js', 'extension/utils/panel-exact.js', 'extension/utils/copy-exact.js']);
for (const [file, exactMap, texts] of [
  ['extension/ui/sidepanel.js', sidePanelMap, [
    'Stop Automation', 'Stopping Automation…', 'Task complete', 'Automation stopped', 'Replay error',
    'Completed', 'Run ended', 'Starting automation', 'Stopping automation',
    'Automation paused', 'Resuming automation', 'Pausing automation', 'Automation resumed',
    'Technical details', 'Step $NUMBER$ complete', 'Replaying...', 'Working...', 'Retrying...', 'Error: $ERROR$',
    'Choose another provider', 'Selected provider', 'The agent',
    'Let $NAME$ control this browser?', '$NAME$ may drive FSB browser tools for this task.',
    '$NAME$ cannot run browser tasks', '$NAME$ cannot start this task',
    '$NAME$ sign-in status could not be verified. Use Test Connection in API Configuration, then try again.',
    '$NAME$ could not pass FSB\'s final delegated-browser start checks. Test Connection may still succeed because it does not start a delegated run. Retry the message or review provider setup.',
    '$NAME$ could not start a delegated browser run because $REASON$ ($CODE$). Test Connection may still succeed because it does not start a delegated run. Retry the message or review provider setup.',
    '$NAME$ could not pause for human control.',
    '$NAME$ reported an error before completing this task. Raw provider output was not retained. Try the same message again.',
    '$NAME$ stopped before the task was complete. Try the same message again.',
    'the provider became unavailable', 'the agent process could not be started', 'the agent process could not be verified',
    'the agent spoke an unexpected protocol', 'the connection to the local agent service was lost',
    'the local agent service shut down', 'an earlier agent process did not shut down',
    'an earlier agent run was not cleaned up', 'the start was cancelled'
  ]],
  ['extension/ui/popup.js', sidePanelMap, ['Error occurred', 'Task completed', 'Task partially completed']],
  ['extension/ui/options.js', controlPanelMap, [
    'Model Required', 'Models Required', 'API Key Required', 'Connection Failed', 'Connection Error', 'Test failed',
    'Provide an API key before saving this provider', 'Load an available model from this provider before saving',
    'Changes discarded', 'Logs cleared', 'Session deleted', 'Vault unlocked', 'Incorrect PIN', 'Credential saved',
    'Credential updated', 'Credential deleted', 'Access granted', 'Request denied', 'Memory deleted', 'Memories exported'
  ]]
]) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const missing = texts.filter((text) => !source.includes("'" + text.replace(/'/g, "\\'") + "'"));
  const unresolved = texts.filter((text) => !Object.prototype.hasOwnProperty.call(exactMap, text));
  check(missing.length === 0 && unresolved.length === 0,
    `${file} status and delegation copy resolves on its page${missing.length ? '; not in source: ' + missing.join(' | ') : ''}${unresolved.length ? '; unresolved: ' + unresolved.join(' | ') : ''}`);
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

// The language picker lives only in the control panel's Advanced settings, as
// a themed select right after the Theme card.
{
  const panelHtml = fs.readFileSync(path.join(root, 'extension/ui/control_panel.html'), 'utf8');
  const sideHtml = fs.readFileSync(path.join(root, 'extension/ui/sidepanel.html'), 'utf8');
  const sideJs = fs.readFileSync(path.join(root, 'extension/ui/sidepanel.js'), 'utf8');
  const advancedStart = panelHtml.indexOf('<section class="content-section" id="advanced">');
  const advancedEnd = panelHtml.indexOf('</section>', advancedStart);
  const picker = panelHtml.match(/<select\b[^>]*\bid="fsbUiLocaleSelect"[^>]*>/);
  check(advancedStart !== -1 && picker && picker.index > advancedStart && picker.index < advancedEnd
      && /\bclass="form-select"/.test(picker[0]) && /\btranslate="no"/.test(picker[0])
      && (panelHtml.match(/fsbUiLocaleSelect/g) || []).length === 1,
    'the control panel has one language picker, a form-select inside Advanced settings');
  check(picker && panelHtml.indexOf('id="themeModeToggle"') < picker.index
      && panelHtml.indexOf('data-i18n="lang_auto_hint"') > advancedStart
      && panelHtml.indexOf('data-i18n="lang_auto_hint"') < picker.index,
    'the Language card follows the Theme card and explains the automatic choice');
  check(!panelHtml.includes('fsb-locale-control'), 'the control panel header has no language picker');
  check(!sideHtml.includes('fsbUiLocaleSelect') && !sideJs.includes('mountSelect'), 'the side panel has no language picker');
}

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
// chrome.i18n.getMessage answers in the UI language, so it must stay quiet
// while Chrome's list picks a different one.
locale.setPreferredLanguages(['ja']);
check(locale.t('probe_missing_key') === 'probe_missing_key' && getMessageCalls.length === 1,
  'no chrome.i18n fallback while the automatic language differs from the UI language');
locale.setPreferredLanguages(['en-GB', 'ja']);
check(locale.t('probe_missing_key') === 'Actions: ' && getMessageCalls.length === 2,
  'the chrome.i18n fallback returns when the automatic language is the UI language');
locale.setPreferredLanguages(null);
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

// A separate resolver instance with the shipped catalogs, so these checks do
// not disturb the seeded instance above.
const shippedCatalogs = {};
for (const code of locale.PUBLIC_LOCALES) {
  const file = path.join(root, 'extension/_locales', locale.folderFor(code), 'messages.json');
  shippedCatalogs[code] = locale.parseMessages(JSON.parse(fs.readFileSync(file, 'utf8')));
}
function freshLocale(globals) {
  const sandbox = Object.assign({ module: undefined }, globals || {});
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const file of ['extension/utils/ui-locale.js', 'extension/utils/copy-exact.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox);
  }
  for (const code of Object.keys(shippedCatalogs)) sandbox.fsbUiLocale.setCatalog(code, shippedCatalogs[code]);
  return sandbox;
}

function extractNamedFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  if (start === -1) throw new Error('missing function ' + name);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index++) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error('unbalanced function ' + name);
}

function extractRuntimeListener(source) {
  const anchor = 'chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {';
  const start = source.lastIndexOf(anchor, source.indexOf('switch (request.action)'));
  assert(start !== -1, 'runtime switch listener exists');
  return extractNamedFunction(source.slice(start).replace(anchor,
    'function dispatchRuntimeMessage(request, sender, sendResponse) {'), 'dispatchRuntimeMessage');
}

function messageNode() {
  return Object.assign(fakeNode({}, ''), {
    children: [],
    style: {},
    classList: { add() {}, remove() {} },
    appendChild(node) { this.children.push(node); },
    addEventListener() {},
    remove() {}
  });
}

function sidepanelMessageContext(api) {
  const source = fs.readFileSync(path.join(root, 'extension/ui/sidepanel.js'), 'utf8');
  const log = require('../extension/ui/sidepanel-message-log.js');
  const storage = {};
  const metrics = { writes: 0 };
  const chatMessages = messageNode();
  Object.defineProperty(chatMessages, 'innerHTML', {
    set() { this.children.length = 0; }
  });
  const context = {
    fsbUiLocale: api,
    FSBSidepanelMessageLog: log,
    document: { createElement: messageNode },
    chatMessages,
    chrome: { storage: { local: {
      async get() { return JSON.parse(JSON.stringify(storage)); },
      async set(payload) { Object.assign(storage, JSON.parse(JSON.stringify(payload))); metrics.writes++; }
    } } },
    conversationId: 'visible-conversation',
    activeConversationId: null,
    currentSessionId: 'visible-session',
    currentStatusMessage: null,
    currentActionGroup: null,
    isRunning: true,
    _activeTabIdSnapshot: 7,
    _lastUserTaskByConversation: new Map(),
    _messageLogPendingBuffer: new Map(),
    _messageLogDebouncer: { schedule() {} },
    _delegatedRunPresentation: {},
    _delegationUiState: {},
    scrollToBottom() {}, setErrorState() {}, setIdleState() {},
    setTimeout() {}
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const name of ['spLine', 'addMessage', 'addCompletionMessage', 'completeStatusMessage',
    '_persistMessage', '_persistMessageToConversation', '_flushMessageLog',
    'renderPersistedMessage', 'hydrateChatFromConversationId', '_delegatedRunErrorMessage', '_delegatedRunApplyTerminal']) {
    const prefix = ['_flushMessageLog', 'hydrateChatFromConversationId'].includes(name) ? 'async ' : '';
    vm.runInContext(prefix + extractNamedFunction(source, name), context);
  }
  vm.runInContext(extractRuntimeListener(source), context);
  return { context, log, storage, metrics };
}

// Optional sources round-trip independently of caller-owned objects, while
// legacy rows and damaged metadata retain their readable content.
{
  const log = require('../extension/ui/sidepanel-message-log.js');
  const envelope = log.emptyEnvelope();
  const uiMessage = { english: 'Error: $ERROR$', subs: {
    error: { english: '$NAME$ ran past the time limit for this task.', subs: { name: 'Grok Build' } }
  } };
  log.appendMessage(envelope, 'round-trip', {
    role: 'assistant', kind: 'text', content: 'readable error', timestamp: 1,
    sessionId: 'session', terminal: true, uiMessage
  });
  const expected = JSON.stringify(uiMessage);
  uiMessage.subs.error.subs.name = 'changed';
  const row = log.getMessages(envelope, 'round-trip')[0];
  check(JSON.stringify(row.uiMessage) === expected && row.sessionId === 'session' && row.terminal === true,
    'message-log storage retains nested sources and terminal fields without sharing substitutions');
  row.uiMessage.subs.error.subs.name = 'changed on read';
  check(JSON.stringify(log.getMessages(envelope, 'round-trip')[0].uiMessage) === expected,
    'message-log reads return independent translation sources');

  const cyclic = { english: 'Error: $ERROR$', subs: {} };
  cyclic.subs.error = cyclic;
  for (const invalid of [null, 'text', [], {}, { english: 7 }, { english: '' },
    { english: 'Ready', subs: [] }, { english: 'Ready', subs: { count: Infinity } },
    { english: 'Ready', subs: { reason: {} } }, cyclic]) {
    const accepted = log.appendMessage(envelope, 'invalid', {
      role: 'assistant', kind: 'text', content: 'keep this', timestamp: 2, uiMessage: invalid
    });
    const saved = log.getMessages(envelope, 'invalid').at(-1);
    check(accepted && saved.content === 'keep this' && !Object.hasOwn(saved, 'uiMessage'),
      'invalid optional source leaves its message intact');
  }
  for (const [role, kind] of [['user', 'text'], ['assistant', 'tool']]) {
    log.appendMessage(envelope, 'plain-content', {
      role, kind, content: 'Ready', timestamp: 3, uiMessage: { english: 'Ready' }
    });
  }
  check(log.getMessages(envelope, 'plain-content').every((row) => !Object.hasOwn(row, 'uiMessage')),
    'user and tool rows cannot acquire translation sources');
  envelope.byConv['round-trip'].messages[0].uiMessage = { english: 'Ready', subs: [] };
  check(log.getMessages(envelope, 'round-trip')[0].content === 'readable error'
      && !Object.hasOwn(log.getMessages(envelope, 'round-trip')[0], 'uiMessage'),
    'damaged stored sources fall back without discarding the row');
}

// Failure bubbles retain the source template, while persistence receives the
// rendered text exactly once through the existing completion path.
{
  const error = 'Network $& <failure> at shop.example\nprovider detail';
  for (const [surface, payload, activeStatus] of [
    ['popup', false, true], ['sidepanel', false, true],
    ['sidepanel', true, true], ['sidepanel', true, false]
  ]) {
    const source = fs.readFileSync(path.join(root, `extension/ui/${surface}.js`), 'utf8');
    for (const code of [...locale.PUBLIC_LOCALES.filter((code) => code !== 'en'), null]) {
      const shipped = freshLocale().fsbUiLocale;
      if (code) shipped.setOverride(code);
      const persisted = [];
      const brief = messageNode();
      const anchor = Object.assign(messageNode(), {
        querySelector: (selector) => selector === '.status-text' ? brief : null
      });
      const context = {
        fsbUiLocale: code ? shipped : undefined,
        document: { createElement: messageNode },
        chatMessages: messageNode(),
        currentStatusMessage: activeStatus ? anchor : null,
        currentActionGroup: null,
        currentSessionId: 'session-locale',
        isRunning: true,
        _activeTabIdSnapshot: 7,
        _tabRunningMap: new Map(),
        _resolveTabIdForSession: () => 7,
        setErrorState() {}, setIdleState() {}, scrollToBottom() {}, addMessage() {},
        persistSidepanelThreadState() {}, removeLoginPrompt() {},
        isHistoryViewActive: false,
        historySessionId: null,
        lastRenderedTerminalSessionId: null,
        _persistMessage: (...args) => persisted.push(args),
        setTimeout: (fn) => fn()
      };
      context.globalThis = context;
      vm.createContext(context);
      for (const name of [surface === 'popup' ? 'uiLine' : 'spLine', 'completeStatusMessage', 'addCompletionMessage']) {
        vm.runInContext(extractNamedFunction(source, name), context);
      }
      if (payload) {
        for (const name of ['normalizeAutomationOutcome', 'renderAutomationCompletionPayload']) {
          vm.runInContext(extractNamedFunction(source, name), context);
        }
        context.renderAutomationCompletionPayload({ sessionId: 'session-locale', outcome: 'failure', error });
      } else {
        vm.runInContext(extractRuntimeListener(source), context);
        context.dispatchRuntimeMessage({ action: 'automationError', sessionId: 'session-locale', tabId: 7, error });
      }
      const label = `${surface} ${payload ? 'completion payload' : 'runtime error'} ${activeStatus ? 'with' : 'without'} status (${code || 'no locale helper'})`;
      const bubble = context.chatMessages.children[0];
      const expected = code
        ? shippedCatalogs[code].copy_5044c249a6.replace('$ERROR$', () => error)
        : 'Error: ' + error;
      check(bubble && bubble.textContent === expected, `${label} renders the error prefix and preserves its details`);
      check(persisted.length === (surface === 'sidepanel' ? 1 : 0)
          && (!persisted.length || JSON.stringify(persisted[0].slice(0, 3)) === JSON.stringify(['assistant', expected, 'text'])),
        `${label} persists rendered text once without placeholders`);
      if (surface === 'sidepanel' && code) {
        check(JSON.stringify(persisted[0][3]) === JSON.stringify({ english: 'Error: $ERROR$', subs: { error } }),
          `${label} persists the translation source alongside readable text`);
      }
      if (code) {
        check(bubble.getAttribute('data-i18n-en') === 'Error: $ERROR$'
            && JSON.parse(bubble.getAttribute('data-i18n-subs') || '{}').error === error,
          `${label} retains the English template and raw error`);
        const next = code === 'ja' ? 'de' : 'ja';
        shipped.setOverride(next);
        shipped.apply(fakeDoc([bubble, brief]));
        check(bubble.textContent === shippedCatalogs[next].copy_5044c249a6.replace('$ERROR$', () => error)
            && persisted.length === (surface === 'sidepanel' ? 1 : 0),
          `${label} follows a language change without another persistence write`);
        if (surface === 'popup') {
          check(brief.textContent === shippedCatalogs[next].copy_5143a201f5,
            'the popup keeps its translated brief error status');
        }
      }
    }
  }
}

// Popup progress keeps counts and the catalog key between progress events.
{
  const source = fs.readFileSync(path.join(root, 'extension/ui/popup.js'), 'utf8');
  const shipped = freshLocale().fsbUiLocale;
  const status = messageNode();
  const progressLabel = messageNode();
  const fill = messageNode();
  let hidden = true;
  const parts = {
    '.status-text': status,
    '.progress-label': progressLabel,
    '.progress-fill': fill,
    '.progress-container': { classList: { remove: () => { hidden = false; } } }
  };
  const context = {
    fsbUiLocale: shipped,
    currentStatusMessage: { querySelector: (selector) => parts[selector] }
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const name of ['uiLine', 'updateStatusMessage']) vm.runInContext(extractNamedFunction(source, name), context);
  for (const code of shipped.PUBLIC_LOCALES.filter((code) => code !== 'en')) {
    for (const progress of [{ iteration: 0, maxIterations: 8 }, { iteration: 3, maxIterations: 8, progressPercent: 37 }, { iteration: 4 }]) {
      shipped.setOverride(code);
      context.updateStatusMessage('Clicked Submit', progress);
      const expected = (language) => shippedCatalogs[language].entry_step
        .replace('$CURRENT$', progress.iteration).replace('$TOTAL$', progress.maxIterations || 100);
      const width = (progress.progressPercent || 0) + '%';
      check(progressLabel.textContent === expected(code) && fill.style.width === width && !hidden,
        `${code} popup progress translates step ${progress.iteration} and preserves its bar`);
      const next = code === 'ja' ? 'de' : 'ja';
      shipped.setOverride(next);
      shipped.apply(fakeDoc([status, progressLabel]));
      check(progressLabel.textContent === expected(next) && fill.style.width === width && status.textContent === 'Clicked Submit',
        'popup progress follows a language change without another progress event');
    }
  }
  context.fsbUiLocale = undefined;
  context.updateStatusMessage('Working', { iteration: 2 });
  check(progressLabel.textContent === 'Step 2 of 100', 'popup progress interpolates its English fallback without the locale helper');
}

// Missing provider labels use catalog copy, retained in English for switches.
{
  const source = fs.readFileSync(path.join(root, 'extension/ui/sidepanel.js'), 'utf8');
  const shipped = freshLocale().fsbUiLocale;
  const context = {
    fsbUiLocale: shipped,
    document: { createElement: messageNode },
    _delegationUiState: {},
    _clearDelegationNode: (node) => { node.children.length = 0; },
    _delegationToneForSnapshot: () => 'danger',
    _applyDelegationSnapshotTone() {},
    _delegationStateLabel: () => 'Agent could not finish this task',
    _appendDelegationTechnicalCode() {},
    _delegationAction: () => messageNode(),
    _syncDelegationStopControls() {}
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const name of ['_delegationElement', '_renderDelegationRunHeader']) vm.runInContext(extractNamedFunction(source, name), context);
  context._delegationSemanticHeading = (tag, cls, text, _tone, subs) => context._delegationElement(tag, cls, text, subs);
  for (const code of shipped.PUBLIC_LOCALES.filter((code) => code !== 'en')) {
    for (const provider of [undefined, null, {}, { label: '' }, { label: 'Grok Build' }]) {
      shipped.setOverride(code);
      const container = messageNode();
      const snapshot = { delegationId: 'locale-run', state: 'failed', connection: 'connected', terminal: { code: 'provider_error' } };
      if (provider !== undefined) snapshot.provider = provider;
      context._renderDelegationRunHeader(container, snapshot);
      const body = container.children.find((node) => node.className === 'delegation-state-body');
      const expected = (language) => shippedCatalogs[language].copy_d3a5554e33
        .replace('$NAME$', provider && provider.label || shippedCatalogs[language].copy_750a4ad2a8);
      check(body.textContent === expected(code), `${code} delegated failure translates a missing provider and preserves a supplied name`);
      const next = code === 'ja' ? 'de' : 'ja';
      shipped.setOverride(next);
      shipped.apply(fakeDoc([body]));
      check(body.textContent === expected(next), 'delegated failure provider copy follows a language change');
    }
  }
}

// Keyed popup messages translate catalog reasons as well as the sentence.
{
  const shipped = freshLocale().fsbUiLocale;
  const popupSource = fs.readFileSync(path.join(root, 'extension/ui/popup.js'), 'utf8');
  const messages = [];
  let response;
  const context = {
    fsbUiLocale: shipped,
    chrome: { runtime: { sendMessage: (_message, callback) => callback(response) } },
    console: { log() {}, error() {} },
    currentSessionId: 'session-1',
    isRunning: true,
    stopRequested: false,
    addMessage: (text, type) => messages.push({ text, type })
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const name of ['uiLine', 'stopAutomation']) {
    vm.runInContext(extractNamedFunction(popupSource, name), context);
  }
  for (const code of shipped.PUBLIC_LOCALES.filter((code) => code !== 'en')) {
    shipped.setOverride(code);
    for (const error of ['Already completed', 'Session not found', 'Unknown error']) {
      const subs = Object.freeze({ error });
      const reason = shippedCatalogs[code][shipped.exact[error]];
      const expected = shippedCatalogs[code].shell_error_stop.replace('$ERROR$', () => reason);
      check(shipped.text('shell_error_stop', 'Error stopping automation: $ERROR$', subs) === expected,
        `${code} text() translates the catalog reason ${error}`);
      check(shipped.text('missing_stop_key', 'Error stopping automation: $ERROR$', subs)
          === 'Error stopping automation: ' + reason && subs.error === error,
        `${code} text() translates substitutions in an English fallback without changing the input`);
      response = { success: false, error };
      context.stopAutomation();
      check(messages.at(-1).text === expected && messages.at(-1).type === 'error' && !context.stopRequested,
        `${code} a failed popup Stop translates ${error} and releases the stop request`);
    }
    response = undefined;
    context.stopAutomation();
    check(messages.at(-1).text === shippedCatalogs[code].shell_error_stop
        .replace('$ERROR$', shippedCatalogs[code][shipped.exact['Unknown error']]),
      `${code} a missing popup Stop response translates Unknown error`);
    check(shipped.text('missing_raw_key', '$NAME$ on $DOMAIN$ ($COUNT$)',
      { name: 'Grok Build', domain: 'shop.example', count: 3 }) === 'Grok Build on shop.example (3)',
    `${code} text() keeps provider names, domains, and numbers unchanged`);
    check(shipped.t('shell_error_stop', { error: 'Already completed' })
        === shippedCatalogs[code].shell_error_stop.replace('$ERROR$', 'Already completed')
        && shipped.text('missing_positional_key', '$1', ['Already completed']) === 'Already completed',
      `${code} low-level and positional substitutions remain raw`);
  }
}

// Provider names survive every catalog, and no template token is left behind.
{
  const shipped = freshLocale().fsbUiLocale;
  const subs = { name: 'Grok Build', reason: 'x', code: 'activation_failed', error: 'Grok Build stopped', number: 3 };
  const templates = Object.keys(shipped.exact).filter((english) => english.includes('$NAME$'));
  const leaks = [];
  for (const code of shipped.PUBLIC_LOCALES) {
    shipped.setOverride(code);
    for (const english of templates) {
      const shown = shipped.line(english, subs);
      if (!shown.includes('Grok Build') || shown.includes('$')) leaks.push(`${code}: ${shown}`);
    }
    const reason = shipped.line('the agent process could not be verified');
    const start = shipped.line('$NAME$ could not start a delegated browser run because $REASON$ ($CODE$). Test Connection may still succeed because it does not start a delegated run. Retry the message or review provider setup.',
      { name: 'Grok Build', reason, code: 'activation_failed' });
    if (!start.includes(reason) || !start.includes('activation_failed')) leaks.push(`${code}: ${start}`);
    if (code !== 'en' && reason === 'the agent process could not be verified') leaks.push(`${code}: untranslated reason`);
  }
  check(templates.length >= 20 && leaks.length === 0,
    `$NAME$ templates keep the provider name and fill every token in all locales${leaks.length ? ': ' + leaks.slice(0, 3).join(' | ') : ''}`);
  for (const code of ['ja', 'ko']) {
    shipped.setOverride(code);
    check(shipped.t('copy_ca4a99be2b').includes('Grok Build'), `${code} Grok Build cleanup copy keeps the provider name`);
  }
}

// The overlay translates the English labels the service worker sends, keeps
// the active-phase ellipsis, and leaves AI and task text alone.
{
  const overlaySource = fs.readFileSync(path.join(root, 'extension/content/visual-feedback.js'), 'utf8');
  const slice = overlaySource.slice(overlaySource.indexOf('function ov('), overlaySource.indexOf('var chromeRoots'));
  const shipped = freshLocale().fsbUiLocale;
  shipped.setOverride('ja');
  const overlay = { fsbUiLocale: shipped };
  overlay.globalThis = overlay;
  vm.createContext(overlay);
  vm.runInContext(slice, overlay);
  const ja = shippedCatalogs.ja;
  check(overlay.overlayLabel('Acting…') === ja.entry_phase_acting + '…', 'overlay pill translates the phase and keeps the ellipsis');
  check(overlay.overlayLabel('Task completed') === ja.copy_71fea45d26, 'overlay detail translates the default completion line');
  check(overlay.overlayLabel('Done') === ja.entry_done_pill && overlay.overlayLabel('Planning…') === ja.entry_planning + '…',
    'overlay reuses the existing Done and Planning keys');
  for (const raw of ['Clicked the Submit button', '3/10 companies', '', '…', 'constructor']) {
    check(overlay.overlayLabel(raw) === raw, `overlay leaves ${JSON.stringify(raw)} as sent`);
  }

  // A language change redraws the pill, detail and log lines the last progress
  // write left, not only the initial Planning / Initializing... text.
  for (const name of ['ownedText', 'refreshOwnedChrome']) vm.runInContext(extractNamedFunction(overlaySource, name), overlay);
  const pill = { textContent: '' };
  const detail = { textContent: '' };
  const logLine = { textContent: '' };
  const eta = { textContent: '' };
  const overlayRoot = {
    querySelector: (selector) => ({ '.fsb-step-number': pill, '.fsb-step-text': detail, '.fsb-eta': eta })[selector] || null,
    querySelectorAll: (selector) => (selector === '.fsb-log-line' ? [logLine] : [])
  };
  overlay.writeLabel(pill, 'Acting…');
  overlay.writeLabel(detail, 'Watching DOM for change');
  overlay.writeLabel(logLine, 'Reviewing page state');
  overlay.writeActions(eta, 4);
  check(eta.textContent === ja.entry_actions.replace('$COUNT$', '4'), 'the overlay action counter renders in the active language');
  const de = shippedCatalogs.de;
  shipped.setOverride('de');
  overlay.refreshOwnedChrome(overlayRoot);
  check(pill.textContent === de.entry_phase_acting + '…'
      && detail.textContent === de.entry_detail_watching
      && logLine.textContent === de.entry_detail_reviewing
      && eta.textContent === de.entry_actions.replace('$COUNT$', '4'),
    'a language change redraws the overlay pill, detail, log lines and action counter');
  detail.textContent = 'Clicked the Submit button';
  eta.textContent = '';
  shipped.setOverride('ja');
  overlay.refreshOwnedChrome(overlayRoot);
  check(eta.textContent === '', 'a language change leaves a cleared action counter empty');
  check(pill.textContent === ja.entry_phase_acting + '…' && detail.textContent === 'Clicked the Submit button',
    'a language change leaves overlay text that was replaced since its label was written');

  // The trigger badge, the crawl overlay lines and the replay speed labels are
  // written from a template and its subs, so a switch redraws them too.
  const watchingEl = fakeNode({}, '');
  const firedEl = fakeNode({}, '');
  const crawlDomain = fakeNode({}, '');
  const crawlPages = fakeNode({}, '');
  const speedButton = fakeNode({}, '2×');
  const keyedRoot = {
    querySelector: (selector) => ({
      '.badge-watching': watchingEl, '.badge-fired': firedEl,
      '.fsb-crawl-domain': crawlDomain, '.fsb-crawl-pages': crawlPages, '.fsb-replay-speed': speedButton
    })[selector] || null,
    querySelectorAll: () => []
  };
  overlay.writeKeyed(watchingEl, 'entry_watching', '$COUNT$ watching', { count: 2 });
  overlay.writeKeyed(firedEl, 'entry_fired', '$COUNT$ fired', { count: 1 });
  overlay.writeKeyed(crawlDomain, 'entry_crawling', 'Crawling $DOMAIN$', { domain: 'shop.example' });
  overlay.writeKeyed(crawlPages, 'entry_pages', '$COLLECTED$ / $MAX$ pages', { collected: 3, max: 10 });
  overlay.writeKeyed(speedButton, 'entry_replay_speed', 'Replay speed $SPEED$. Activate to change to $NEXT$', { speed: '2×', next: '4×' }, 'aria-label');
  overlay.writeKeyed(speedButton, 'entry_replay_speed_title', 'Replay speed: $SPEED$ (click to change)', { speed: '2×' }, 'title');
  const keyedIn = (cat) => ({
    watching: cat.entry_watching.replace('$COUNT$', '2'),
    fired: cat.entry_fired.replace('$COUNT$', '1'),
    domain: cat.entry_crawling.replace('$DOMAIN$', 'shop.example'),
    pages: cat.entry_pages.replace('$COLLECTED$', '3').replace('$MAX$', '10'),
    speed: cat.entry_replay_speed.replace('$SPEED$', '2×').replace('$NEXT$', '4×'),
    speedTitle: cat.entry_replay_speed_title.replace('$SPEED$', '2×')
  });
  const keyedNow = () => ({
    watching: watchingEl.textContent, fired: firedEl.textContent, domain: crawlDomain.textContent, pages: crawlPages.textContent,
    speed: speedButton.getAttribute('aria-label'), speedTitle: speedButton.getAttribute('title')
  });
  check(JSON.stringify(keyedNow()) === JSON.stringify(keyedIn(ja)), 'badge, crawl and replay speed labels render in the active language');
  shipped.setOverride('de');
  overlay.refreshOwnedChrome(keyedRoot);
  check(JSON.stringify(keyedNow()) === JSON.stringify(keyedIn(de)) && speedButton.textContent === '2×',
    'a language change redraws the trigger badge, the crawl overlay lines and the replay speed labels');
  crawlDomain.textContent = '--';
  speedButton.setAttribute('title', 'set elsewhere');
  shipped.setOverride('ja');
  overlay.refreshOwnedChrome(keyedRoot);
  check(crawlDomain.textContent === '--' && speedButton.getAttribute('title') === 'set elsewhere'
      && speedButton.getAttribute('aria-label') === keyedIn(ja).speed && watchingEl.textContent === keyedIn(ja).watching,
    'a language change leaves keyed text and attributes that were replaced since');
  check(overlaySource.includes("writeKeyed(this.watchingEl, 'entry_watching', '$COUNT$ watching', { count: watching })")
      && overlaySource.includes("writeKeyed(this.firedEl, 'entry_fired', '$COUNT$ fired', { count: fired })")
      && /this\.firedSepEl = [^\n]+\n\s*watchChrome\(this\.root\);/.test(overlaySource)
      && overlaySource.includes("writeKeyed(this.container.querySelector('.fsb-crawl-domain'), 'entry_crawling', 'Crawling $DOMAIN$'")
      && overlaySource.includes("writeKeyed(this.container.querySelector('.fsb-crawl-pages'), 'entry_pages', '$COLLECTED$ / $MAX$ pages'")
      && overlaySource.includes("writeKeyed(button, 'entry_replay_speed', ")
      && overlaySource.includes("writeKeyed(button, 'entry_replay_speed_title', "),
    'the trigger badge, crawl overlay and replay speed write through writeKeyed(), and the badge is a watched root');

  const englishCatalogMessages = JSON.parse(fs.readFileSync(path.join(root, 'extension/_locales/en/messages.json'), 'utf8'));
  const labelMisses = Object.entries(overlay.OVERLAY_LABELS)
    .filter(([english, key]) => !englishCatalogMessages[key] || englishCatalogMessages[key].message !== english);
  check(labelMisses.length === 0, `overlay label keys match the English catalog${labelMisses.length ? ': ' + labelMisses.map(([e]) => e).join(' | ') : ''}`);
  const ovMisses = [];
  for (const match of overlaySource.matchAll(/\bov\('([a-z0-9_]+)',\s*'((?:[^'\\]|\\.)*)'\s*[,)]/g)) {
    const entry = englishCatalogMessages[match[1]];
    if (!entry || entry.message !== match[2].replace(/\\'/g, "'")) ovMisses.push(match[1]);
  }
  check(ovMisses.length === 0, `overlay ov() fallbacks match the English catalog${ovMisses.length ? ': ' + ovMisses.join(', ') : ''}`);
  const keyedMisses = [];
  let keyedCalls = 0;
  for (const match of overlaySource.matchAll(/\bwriteKeyed\([^,]+,\s*'([a-z0-9_]+)',\s*'((?:[^'\\]|\\.)*)'\s*[,)]/g)) {
    keyedCalls += 1;
    const entry = englishCatalogMessages[match[1]];
    if (!entry || entry.message !== match[2].replace(/\\'/g, "'")) keyedMisses.push(match[1]);
  }
  check(keyedCalls >= 7 && keyedMisses.length === 0,
    `overlay writeKeyed() fallbacks match the English catalog${keyedMisses.length ? ': ' + keyedMisses.join(', ') : ''}`);

  // Drift guard: every label and default detail overlay-state.js builds is mapped.
  const overlayState = require('../extension/utils/overlay-state.js');
  const built = new Set();
  const phases = ['analyzing', 'planning', 'thinking', 'acting', 'executing', 'recovering', 'writing', 'switching_tab',
    'tab_switch', 'calling', 'trigger-watch', 'watching', 'complete', 'error'];
  const results = [undefined, 'success', 'partial', 'error', 'stopped'];
  for (const phase of phases) {
    for (const result of results) {
      for (const extra of [{}, { lifecycle: 'final' }, { progressPercent: 40 }]) {
        const state = overlayState.buildOverlayState(Object.assign({ phase, result }, extra), null);
        built.add(state.display.detail);
        if (state.progress) built.add(state.progress.label.replace(/…$/, ''));
      }
    }
  }
  for (const session of [{ multiSite: {} }, { sheetsData: null }, { sheetsData: { formattingPhase: true } }, { sheetsData: { formattingComplete: true } }]) {
    const state = overlayState.buildOverlayState({ phase: 'writing' }, session);
    built.add(state.progress.label.replace(/…$/, ''));
  }
  // Fallbacks outside overlay-state.js: the generic detail, the MCP visual
  // session start line and its waiting pill.
  const visualSession = fs.readFileSync(path.join(root, 'extension/utils/mcp-visual-session.js'), 'utf8');
  check(background.includes("|| 'Ready to begin'") && visualSession.includes("label: 'Waiting'"),
    'MCP visual session fallbacks are still the mapped English labels');
  for (const label of ['Working', 'Ready to begin', 'Waiting']) built.add(label);
  const agentLoop = fs.readFileSync(path.join(root, 'extension/ai/agent-loop.js'), 'utf8');
  const markerBlock = agentLoop.match(/_al_STEP_MARKER_LABELS = \{([\s\S]*?)\};/);
  for (const match of (markerBlock ? markerBlock[1] : '').matchAll(/:\s*'([^']+)'/g)) built.add(match[1]);
  for (const match of agentLoop.matchAll(/detail = '([^']+)';/g)) built.add(match[1]);
  const unmapped = [...built].filter((label) => !Object.prototype.hasOwnProperty.call(overlay.OVERLAY_LABELS, label));
  check(markerBlock && built.size > 25 && unmapped.length === 0,
    `overlay maps every English label the service worker builds${unmapped.length ? ': ' + unmapped.join(' | ') : ''}`);
}

// The fixed Stop button keeps a translated tooltip when the delegated run
// hands it back, and its pending label follows the locale.
{
  const panelSource = fs.readFileSync(path.join(root, 'extension/ui/sidepanel.js'), 'utf8');
  const shipped = freshLocale().fsbUiLocale;
  shipped.setOverride('de');
  const stopBtn = fakeNode({ 'data-i18n-attr': 'title:shell_stop', title: 'Stop Automation' }, '');
  const classes = new Set(['hidden']);
  stopBtn.classList = {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name),
    contains: (name) => classes.has(name)
  };
  let pending = false;
  const context = {
    fsbUiLocale: shipped,
    stopBtn,
    isRunning: false,
    _chatLockedByOwnerChip: false,
    _delegationUsesFixedStop: () => true,
    _delegationStopControlPending: () => pending,
    _ensureDelegationMount: () => ({})
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const name of ['_restoreLegacyStopControl', '_syncDelegationStopControls']) {
    vm.runInContext(extractNamedFunction(panelSource, name), context);
  }
  context._restoreLegacyStopControl();
  check(stopBtn.getAttribute('title') === shippedCatalogs.de.shell_stop, 'restored Stop tooltip uses the active locale');
  pending = true;
  context._syncDelegationStopControls({});
  check(stopBtn.getAttribute('title') === shippedCatalogs.de.copy_26de247a57
      && stopBtn.getAttribute('aria-label') === shippedCatalogs.de.copy_26de247a57,
    'pending delegated Stop title and label use the active locale');
  context._restoreLegacyStopControl();
  shipped.setOverride('ja');
  shipped.apply(fakeDoc([stopBtn]));
  check(stopBtn.getAttribute('title') === shippedCatalogs.ja.shell_stop && shippedCatalogs.ja.shell_stop === '自動化を停止',
    'a language switch re-translates the restored Stop tooltip');

  // apply() cannot reach the delegated accessible name or the pending label,
  // so a language change re-runs the sync for the button's current state.
  vm.runInContext(extractNamedFunction(panelSource, '_relabelDelegationStop'), context);
  context._delegationUiState = { snapshot: {} };
  shipped.setOverride('de');
  pending = true;
  context._syncDelegationStopControls({});
  shipped.setOverride('ja');
  context._relabelDelegationStop();
  check(stopBtn.getAttribute('title') === shippedCatalogs.ja.copy_26de247a57
      && stopBtn.getAttribute('aria-label') === shippedCatalogs.ja.copy_26de247a57,
    'a language change relabels the pending delegated Stop title and accessible name');
  pending = false;
  context._syncDelegationStopControls({});
  shipped.setOverride('ko');
  context._relabelDelegationStop();
  check(stopBtn.getAttribute('title') === shippedCatalogs.ko.shell_stop
      && stopBtn.getAttribute('aria-label') === shippedCatalogs.ko.shell_stop,
    'a language change relabels the delegated Stop accessible name, not only its tooltip');
  context._restoreLegacyStopControl();
  const legacyTitle = stopBtn.getAttribute('title');
  shipped.setOverride('de');
  context._relabelDelegationStop();
  check(stopBtn.getAttribute('aria-label') == null && stopBtn.getAttribute('title') === legacyTitle,
    'the relabel leaves the legacy Stop button to apply()');
  check(panelSource.includes("fsbUiLocale.onChange(_relabelDelegationStop)"),
    'the side panel relabels the Stop button on a language change');
}

// Side panel status lines: plain lines are keyed, templates are filled, and
// AI text is shown as sent.
{
  const panelSource = fs.readFileSync(path.join(root, 'extension/ui/sidepanel.js'), 'utf8');
  const shipped = freshLocale().fsbUiLocale;
  shipped.setOverride('de');
  const statusNode = fakeNode({}, '');
  const runner = [];
  const context = {
    fsbUiLocale: shipped,
    currentStatusMessage: { querySelector: (selector) => (selector === '.status-text' ? statusNode : null) },
    setAutomationRunnerText: (text, subs) => runner.push(shipped.line(text, subs))
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const name of ['spLine', 'updateStatusMessage']) vm.runInContext(extractNamedFunction(panelSource, name), context);
  context.updateStatusMessage('Replaying...');
  check(statusNode.textContent === shippedCatalogs.de.copy_1f78c9a474, 'status line translates a keyed plain line');
  context.updateStatusMessage('Step $NUMBER$ complete', null, { number: 3 });
  check(statusNode.textContent === shippedCatalogs.de.copy_d6786d701f.replace('$NUMBER$', '3') && runner[1] === statusNode.textContent,
    'status line fills a template in the active locale');
  shipped.setOverride('ja');
  shipped.apply(fakeDoc([statusNode]));
  check(statusNode.textContent === shippedCatalogs.ja.copy_d6786d701f.replace('$NUMBER$', '3'),
    'a sitting "Step N complete" status follows a language change');
  context.updateStatusMessage('Clicked the Submit button');
  check(statusNode.textContent === 'Clicked the Submit button', 'status line leaves AI text as sent');
}

// Terminal delegation headings retain their keys when the language changes.
{
  const panelSource = fs.readFileSync(path.join(root, 'extension/ui/sidepanel.js'), 'utf8');
  const context = freshLocale({ document: { createElement: () => fakeNode({}, '') } });
  const shipped = context.fsbUiLocale;
  for (const name of ['_delegationElement', '_delegationIsActiveSnapshot', '_delegationStateLabel']) {
    vm.runInContext(extractNamedFunction(panelSource, name), context);
  }
  shipped.setOverride('en');
  const headings = ['completed', 'restart_lost'].map((state) => context._delegationElement(
    'span', 'delegation-heading-copy',
    context._delegationStateLabel({ state, connection: 'connected', terminal: null })
  ));
  for (const code of shipped.PUBLIC_LOCALES) {
    shipped.setOverride(code);
    shipped.apply(fakeDoc(headings));
    check(headings[0].textContent === shippedCatalogs[code].shell_completed
        && headings[1].textContent === shippedCatalogs[code].shell_run_ended
        && (code === 'en' || (headings[0].textContent !== 'Completed' && headings[1].textContent !== 'Run ended'))
        && headings[0].getAttribute('data-i18n-live') === 'shell_completed'
        && headings[1].getAttribute('data-i18n-live') === 'shell_run_ended',
      `completed and generic restart-lost headings follow a language change to ${code}`);
  }
}

// Both snapshot and live-update announcements translate lifecycle copy before
// combining it with provider output, without changing one-shot identities.
{
  const panelSource = fs.readFileSync(path.join(root, 'extension/ui/sidepanel.js'), 'utf8');
  const transitions = [
    ['starting', 'shell_starting_plain'],
    ['holding', 'shell_pausing'],
    ['held', 'shell_paused'],
    ['resuming', 'shell_resuming'],
    ['running', 'shell_resumed'],
    ['stopping', 'shell_stopping_plain']
  ];
  for (const renderPath of ['snapshot', 'runtime']) {
    for (const code of locale.PUBLIC_LOCALES) {
      const mount = {
        run: Object.assign(fakeNode({}, ''), { classList: { remove() {} } }),
        state: fakeNode({}, ''),
        feed: fakeNode({}, ''),
        announcer: fakeNode({}, '')
      };
      const uiState = {
        delegationId: 'locale-run', snapshot: null, lastRenderedSequence: null,
        announced: Object.create(null), announcedTransitions: Object.create(null)
      };
      const context = freshLocale({
        _delegationUiState: uiState,
        _ensureDelegationMount: () => mount,
        FsbDelegationFeed: {
          validateSnapshot: () => true,
          render: (_feed, snapshot) => ({ ok: true, lastSequence: snapshot.entries.length })
        },
        _renderDelegationRunHeader() {},
        _delegationSnapshotAlertKey: () => null,
        _delegationHeaderPresentation: () => ({ label: 'Working', tone: 'running' }),
        _setDelegationHeaderStatus() {},
        _delegationSnapshotLocksComposer: () => true,
        _setDelegationComposerLocked() {},
        _delegationAnnouncement: (entry) => entry.text
      });
      context.fsbUiLocale.setOverride(code);
      for (const name of ['_delegationOneShotTransition', '_delegationLifecycleAnnouncement',
        '_renderDelegationSnapshot', '_renderDelegationRuntimeMetadata']) {
        vm.runInContext(extractNamedFunction(panelSource, name), context);
      }
      let previous = null;
      function render(snapshot, hydrated = false) {
        if (renderPath === 'snapshot') {
          context._renderDelegationSnapshot(snapshot, { hydrated, announceSequence: snapshot.entries.length || null });
        } else {
          context._renderDelegationRuntimeMetadata(mount, snapshot, previous,
            previous ? previous.entries.length : 0,
            { announceSequence: snapshot.entries.length || null, entry: snapshot.entries.at(-1) });
        }
        previous = snapshot;
      }
      for (const [state, key] of transitions) {
        const entry = { sequence: (previous ? previous.entries.length : 0) + 1, text: 'Provider output: Completed' };
        const snapshot = { delegationId: 'locale-run', state, entries: [...(previous ? previous.entries : []), entry] };
        render(snapshot);
        check(mount.announcer.textContent === shippedCatalogs[code][key] + '. ' + entry.text,
          `${renderPath} ${state} announces the ${code} lifecycle phrase with provider output preserved`);
        mount.announcer.textContent = 'dedupe sentinel';
        render(snapshot);
        check(mount.announcer.textContent === 'dedupe sentinel',
          `${renderPath} ${state} in ${code} is announced only once`);
      }
      if (renderPath === 'snapshot') {
        uiState.announcedTransitions = Object.create(null);
        for (const [state] of transitions) {
          const snapshot = { delegationId: 'locale-run', state, entries: previous.entries };
          mount.announcer.textContent = 'hydration sentinel';
          render(snapshot, true);
          render(snapshot);
          check(mount.announcer.textContent === 'hydration sentinel',
            `hydrated ${state} in ${code} stays silent on later unchanged snapshots`);
        }
      }
    }
  }
}

// Delegation cards pass a template and its subs, never a filled line(), so a
// language change re-renders the sentence and any substitution that is
// catalog copy itself. A passing Grok Build test writes its translated line.
{
  const panelSource = fs.readFileSync(path.join(root, 'extension/ui/sidepanel.js'), 'utf8');
  const shipped = freshLocale().fsbUiLocale;
  shipped.setOverride('de');
  const context = { fsbUiLocale: shipped, document: { createElement: () => fakeNode({}, '') } };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(extractNamedFunction(panelSource, '_delegationElement'), context);
  const reason = 'the agent process could not be verified';
  const startTemplate = '$NAME$ could not start a delegated browser run because $REASON$ ($CODE$). Test Connection may still succeed because it does not start a delegated run. Retry the message or review provider setup.';
  const heading = context._delegationElement('h2', '', '$NAME$ cannot run browser tasks', { name: 'Selected provider' });
  const body = context._delegationElement('p', '', startTemplate, { name: 'Grok Build', reason, code: 'activation_failed' });
  const expectHeading = () => shipped.line('$NAME$ cannot run browser tasks', { name: shipped.line('Selected provider') });
  const expectBody = () => shipped.line(startTemplate, { name: 'Grok Build', reason: shipped.line(reason), code: 'activation_failed' });
  check(heading.textContent === expectHeading() && body.textContent === expectBody(),
    'a delegation template is filled with its catalog substitutions translated');
  shipped.setOverride('ja');
  shipped.apply(fakeDoc([heading, body]));
  check(heading.textContent === expectHeading() && heading.textContent.includes(shippedCatalogs.ja.copy_5fdcceef8a),
    'a language change re-renders a templated heading and its provider fallback');
  check(body.textContent === expectBody() && body.textContent.includes('Grok Build') && !body.textContent.includes(reason),
    'a language change re-renders the start-rejected body and its reason');

  const filled = ['_renderDelegationConsent', '_renderDelegationPreflightFailure', '_renderDelegationRunHeader']
    .filter((name) => extractNamedFunction(panelSource, name).includes('fsbUiLocale.line('));
  check(filled.length === 0, `delegation cards hand templates to markExact()${filled.length ? '; filled line() in: ' + filled.join(', ') : ''}`);

  const optionsSource = fs.readFileSync(path.join(root, 'extension/ui/options.js'), 'utf8');
  check(optionsSource.includes("fsbUiSet(elements.grokBuildCompatibility, 'Installed and compatible: Grok Build 1.0.4.")
      && optionsSource.includes("fsbUiSet(elements.grokBuildCompatibility, 'Compatibility check failed: $ERROR$', { error: result.error })")
      && optionsSource.includes("fsbUiSet(elements.grokBuildCompatibility, 'Compatibility check failed: installation, version, isolation, ACP, or cached OAuth could not be verified.')"),
    'every Grok Build test result is written through markExact()');
}

// A substitution that is catalog copy follows the language, raw values do
// not, and the side panel and control panel lines that used to be filled or
// concatenated keep their key across a switch.
{
  const shipped = freshLocale().fsbUiLocale;
  const de = shippedCatalogs.de;
  const ja = shippedCatalogs.ja;
  shipped.setOverride('de');
  check(shipped.line('Reconnaissance complete! Site map saved for $DOMAIN$.', { domain: 'this site' })
      === de.copy_ca79bcd4d7.replace('$DOMAIN$', de.copy_fb625242db),
    'line() translates a substitution that is catalog copy');
  check(shipped.line('Reconnaissance failed to start: $ERROR$', { error: 'Unknown error' })
      === de.copy_7654da628e.replace('$ERROR$', de.panel_27c2ccd962),
    'the side panel map resolves the Unknown error fallback');
  check(shipped.line('Starting reconnaissance on $DOMAIN$...', { domain: 'shop.example' }).includes('shop.example')
      && shipped.line('$NAME$ cannot run browser tasks', { name: 'Grok Build' }).includes('Grok Build'),
    'line() leaves domains and provider names as sent');

  const panelSource = fs.readFileSync(path.join(root, 'extension/ui/sidepanel.js'), 'utf8');
  const nodes = {
    paymentFillConfirmOverlay: { classList: { add() {}, remove() {} } },
    pfcBrand: fakeNode({}, ''),
    pfcLast4: fakeNode({}, ''),
    pfcDomain: fakeNode({}, ''),
    pfcAllow: { addEventListener() {}, removeEventListener() {} },
    pfcDeny: { addEventListener() {}, removeEventListener() {} }
  };
  const context = {
    fsbUiLocale: shipped,
    document: { createElement: () => fakeNode({}, ''), getElementById: (id) => nodes[id] || null }
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const name of ['spLine', '_delegationElement', '_delegationStoppedHeadingParts', 'showPaymentFillConfirmation']) {
    vm.runInContext(extractNamedFunction(panelSource, name), context);
  }
  const stopped = context._delegationStoppedHeadingParts({ terminal: { releasedTabCount: 2 } });
  const stoppedHeading = context._delegationElement('span', '', stopped.template, stopped.subs);
  const startFailure = context._delegationElement('p', '', '$NAME$ could not start this task. Keep the message and try again.', { name: 'Grok Build' });
  check(stoppedHeading.textContent === de.copy_4b8cbffa31.replace('$COUNT$', '2')
      && startFailure.textContent === de.copy_2b4b8c0560.replace('$NAME$', 'Grok Build'),
    'the stopped-run heading and the start-failure line render as templates');
  context.showPaymentFillConfirmation({ cardBrand: 'visa', last4: '4242', merchantDomain: 'shop.example' });
  check(nodes.pfcBrand.textContent === 'Visa' && nodes.pfcDomain.textContent === de.copy_9fabe26076.replace('$DOMAIN$', 'shop.example'),
    'the payment confirmation keeps the brand and domain and translates the words around them');
  const brand = nodes.pfcBrand;
  const domain = nodes.pfcDomain;
  nodes.pfcBrand = fakeNode({}, '');
  nodes.pfcDomain = fakeNode({}, '');
  context.showPaymentFillConfirmation({ last4: '4242' });
  check(nodes.pfcBrand.textContent === de.panel_be3702e3f1 && nodes.pfcDomain.textContent === de.copy_c36ee348ff,
    'the payment confirmation translates the Card and this-page fallbacks in the side panel');

  const optionsSource = fs.readFileSync(path.join(root, 'extension/ui/options.js'), 'utf8');
  const title = fakeNode({}, '');
  const detail = fakeNode({}, '');
  const optionsContext = {
    fsbUiLocale: shipped,
    elements: {
      apiStatusCard: {
        style: {},
        className: '',
        querySelector: (selector) => ({ '.status-title': title, '.status-detail': detail })[selector] || null
      }
    }
  };
  optionsContext.globalThis = optionsContext;
  vm.createContext(optionsContext);
  for (const name of ['fsbUiLine', 'fsbUiSet', 'updateApiStatusCard']) vm.runInContext(extractNamedFunction(optionsSource, name), optionsContext);
  optionsContext.updateApiStatusCard('disconnected', 'No API Key', 'Configure your $NAME$ API key to get started', { name: 'OpenAI' });
  const badge = fakeNode({ 'data-i18n': 'panel_fd05c3a95a' }, 'Requires the reviewed Grok Build 1.0.4 profile.');
  optionsContext.fsbUiSet(badge, 'Compatibility check failed: installation, version, isolation, ACP, or cached OAuth could not be verified.');
  check(detail.textContent === de.copy_ec6c5d7132.replace('$NAME$', 'OpenAI') && badge.textContent === de.copy_62c33d7a6c,
    'the API-key detail and the Grok Build fallback render in the active language');

  shipped.setOverride('ja');
  shipped.apply(fakeDoc([stoppedHeading, startFailure, brand, domain, nodes.pfcBrand, nodes.pfcDomain, title, detail, badge]));
  check(stoppedHeading.textContent === ja.copy_4b8cbffa31.replace('$COUNT$', '2')
      && startFailure.textContent === ja.copy_2b4b8c0560.replace('$NAME$', 'Grok Build'),
    'a language change re-renders the stopped-run heading and the start-failure line');
  check(brand.textContent === 'Visa' && domain.textContent === ja.copy_9fabe26076.replace('$DOMAIN$', 'shop.example')
      && nodes.pfcBrand.textContent === ja.panel_be3702e3f1 && nodes.pfcDomain.textContent === ja.copy_c36ee348ff,
    'a language change re-renders the payment confirmation');
  check(title.textContent === ja.copy_6bec306893 && detail.textContent === ja.copy_ec6c5d7132.replace('$NAME$', 'OpenAI'),
    'a language change re-renders the API-key title and detail');
  check(badge.textContent === ja.copy_62c33d7a6c,
    'a language change re-renders a Grok Build result instead of the idle hint');

  check(panelSource.includes("addMessage('Reconnaissance failed to start: $ERROR$', 'system', undefined, { error: error.message || 'Unknown error' })")
      && !panelSource.includes("'Reconnaissance failed: '"),
    'an explorer exception uses the failed-to-start template');
  check(!panelSource.includes("+ ' could not start this task."),
    'the start-failure line is not concatenated');
}

// The side panel action count and the control panel crawl card keep their
// keys across a switch, and a fallback word inside a sentence is the
// cataloged one rather than a lowercase English literal.
{
  const sandbox = freshLocale();
  vm.runInContext(fs.readFileSync(path.join(root, 'extension/utils/panel-exact.js'), 'utf8'), sandbox);
  const shipped = sandbox.fsbUiLocale;
  const de = shippedCatalogs.de;
  const ja = shippedCatalogs.ja;
  shipped.setOverride('de');

  const panelSource = fs.readFileSync(path.join(root, 'extension/ui/sidepanel.js'), 'utf8');
  const panelContext = { fsbUiLocale: shipped };
  panelContext.globalThis = panelContext;
  vm.createContext(panelContext);
  for (const name of ['spLine', 'actionCountTemplate', 'actionCountLabel', 'setActionCount']) {
    vm.runInContext(extractNamedFunction(panelSource, name), panelContext);
  }
  const oneAction = fakeNode({}, '');
  const threeActions = fakeNode({}, '');
  panelContext.setActionCount(oneAction, 1);
  panelContext.setActionCount(threeActions, 3);
  check(oneAction.textContent === de.copy_9a19a25438.replace('$COUNT$', '1')
      && threeActions.textContent === de.copy_5bb3cc9bbc.replace('$COUNT$', '3'),
    'the side panel action count renders in the active language');
  check(extractNamedFunction(panelSource, 'addActionMessage').includes("setActionCount(group.querySelector('.action-summary-count'), list.children.length)"),
    'each action writes the count through setActionCount()');

  const optionsSource = fs.readFileSync(path.join(root, 'extension/ui/options.js'), 'utf8');
  const toasts = [];
  const cards = [];
  function fakeCrawlerCard() {
    const parts = {
      '.crawler-stop-btn': { addEventListener() {} },
      '.crawler-stop-label': fakeNode({}, ''),
      '.crawler-progress-text': fakeNode({}, ''),
      '.crawler-progress-count': fakeNode({}, ''),
      '.crawler-progress-fill': { style: {} },
      '.crawler-current-url': fakeNode({}, '')
    };
    return { dataset: {}, innerHTML: '', parts, querySelector: (selector) => parts[selector] || null, remove() {} };
  }
  const optionsContext = {
    fsbUiLocale: shipped,
    activeCrawlerUIs: new Map(),
    elements: { explorerCrawlers: { appendChild: (card) => cards.push(card) } },
    document: { createElement: fakeCrawlerCard },
    escapeHtml: (value) => String(value),
    updateStopAllVisibility() {},
    addLog() {},
    loadResearchList() {},
    showToast: (message, type) => toasts.push({ message, type })
  };
  optionsContext.globalThis = optionsContext;
  vm.createContext(optionsContext);
  for (const name of ['fsbUiLine', 'fsbUiSet', 'createCrawlerCard', 'updateExplorerProgress']) {
    vm.runInContext(extractNamedFunction(optionsSource, name), optionsContext);
  }
  const fresh = optionsContext.createCrawlerCard('c0', 'shop.example', 10);
  check(fresh.parts['.crawler-stop-label'].textContent === de.panel_cae7d57bc0
      && fresh.parts['.crawler-progress-text'].textContent === de.panel_ada26b6a54
      && fresh.parts['.crawler-progress-count'].textContent === de.panel_7eae8fd81d.replace('$COLLECTED$', '0').replace('$MAX$', '10'),
    'a new crawl card renders Stop, the starting line and the count in the active language');
  optionsContext.updateExplorerProgress({ crawlerId: 'c1', status: 'crawling', domain: 'shop.example', pagesCollected: 3, maxPages: 10 });
  const card = cards[0].parts;
  check(card['.crawler-progress-text'].textContent === de.panel_a854c3e6d9.replace('$DOMAIN$', 'shop.example')
      && card['.crawler-progress-count'].textContent === de.panel_7eae8fd81d.replace('$COLLECTED$', '3').replace('$MAX$', '10'),
    'crawl progress renders in the active language');
  optionsContext.updateExplorerProgress({ crawlerId: 'c2', status: 'error' });
  check(toasts.length === 1 && toasts[0].message === de.copy_aee9e10eae.replace('$DOMAIN$', de.copy_b764cdc0ea)
      && !toasts[0].message.includes('unknown'),
    'a crawl failure with no domain uses the translated Unknown');

  shipped.setOverride('ja');
  shipped.apply(fakeDoc([card['.crawler-stop-label'], card['.crawler-progress-text'], card['.crawler-progress-count'], oneAction, threeActions]));
  check(card['.crawler-stop-label'].textContent === ja.panel_cae7d57bc0
      && card['.crawler-progress-text'].textContent === ja.panel_a854c3e6d9.replace('$DOMAIN$', 'shop.example')
      && card['.crawler-progress-count'].textContent === ja.panel_7eae8fd81d.replace('$COLLECTED$', '3').replace('$MAX$', '10'),
    'a language change re-renders the crawl card before the next status event');
  check(oneAction.textContent === ja.copy_9a19a25438.replace('$COUNT$', '1')
      && threeActions.textContent === ja.copy_5bb3cc9bbc.replace('$COUNT$', '3'),
    'a language change re-renders the side panel action count before the next action');

  const popupSource = fs.readFileSync(path.join(root, 'extension/ui/popup.js'), 'utf8');
  const lowercaseFallbacks = [optionsSource, popupSource]
    .flatMap((source) => source.match(/(?:fsbUiLine|uiLine)\([^\n]*\|\| 'unknown'[^\n]*/g) || []);
  check(lowercaseFallbacks.length === 0,
    `no translated sentence falls back to a lowercase English 'unknown'${lowercaseFallbacks.length ? ': ' + lowercaseFallbacks.join(' | ') : ''}`);
}

// The popup's collapsed action count keeps its key, and the owner header and
// locked composer tooltip are redrawn from the stored owner name on a switch.
{
  const shipped = freshLocale().fsbUiLocale;
  const de = shippedCatalogs.de;
  const ja = shippedCatalogs.ja;
  shipped.setOverride('de');
  const popupSource = fs.readFileSync(path.join(root, 'extension/ui/popup.js'), 'utf8');

  const countEl = fakeNode({}, '');
  const collapsed = [];
  const list = { children: collapsed, appendChild: (node) => collapsed.push(node) };
  const group = { querySelector: (selector) => ({ '.action-summary-list': list, '.action-summary-count': countEl })[selector] || null };
  const actionContext = {
    fsbUiLocale: shipped,
    chatMessages: { querySelector: (selector) => (selector === '.action-summary-group' ? group : null) },
    document: { createElement: () => ({ className: '', textContent: '' }) },
    MAX_VISIBLE_ACTIONS: 2,
    actionMessageQueue: []
  };
  actionContext.globalThis = actionContext;
  vm.createContext(actionContext);
  vm.runInContext(extractNamedFunction(popupSource, 'collapseOldActions'), actionContext);
  const queueActions = (n) => {
    for (let i = 0; i < n; i++) actionContext.actionMessageQueue.push({ textContent: 'Step ' + i, parentNode: {}, remove() {} });
  };
  queueActions(3);
  actionContext.collapseOldActions();
  check(countEl.textContent === de.copy_9a19a25438.replace('$COUNT$', '1'), 'the popup action count renders the singular in the active language');
  queueActions(2);
  actionContext.collapseOldActions();
  check(countEl.textContent === de.copy_5bb3cc9bbc.replace('$COUNT$', '3'), 'the popup action count renders the plural in the active language');
  shipped.setOverride('ja');
  shipped.apply(fakeDoc([countEl]));
  check(countEl.textContent === ja.copy_5bb3cc9bbc.replace('$COUNT$', '3'),
    'a language change re-renders the popup action count before the next action');

  shipped.setOverride('de');
  const statusText = fakeNode({}, '');
  const ownerContext = {
    fsbUiLocale: shipped,
    statusText,
    statusDot: { classList: { add() {}, remove() {} } },
    chatInput: { title: '' },
    _headerBaseStatusLabel: 'Ready',
    _headerBaseStatusTone: '',
    _headerOwnerLabel: null,
    _chatLockedByOwnerChip: false
  };
  ownerContext.globalThis = ownerContext;
  vm.createContext(ownerContext);
  vm.runInContext(fs.readFileSync(path.join(root, 'extension/ui/owner-chip.js'), 'utf8'), ownerContext);
  for (const name of ['_renderHeaderStatus', '_setHeaderOwner', '_ownerLockTitle', '_refreshOwnerCopy']) {
    vm.runInContext(extractNamedFunction(popupSource, name), ownerContext);
  }
  ownerContext._refreshOwnerCopy();
  check(statusText.textContent === '' && ownerContext.chatInput.title === '',
    'with no owner the refresh leaves the header and composer to apply()');
  ownerContext._setHeaderOwner('Claude');
  ownerContext._chatLockedByOwnerChip = true;
  ownerContext.chatInput.title = ownerContext._ownerLockTitle('Claude');
  check(statusText.textContent === de.shell_owned_by.replace('$LABEL$', 'Claude')
      && ownerContext.chatInput.title === de.shell_owned_title.replace('$LABEL$', 'Claude'),
    'the popup owner header and tooltip render in the active language');
  shipped.setOverride('ja');
  ownerContext._refreshOwnerCopy();
  check(statusText.textContent === ja.shell_owned_by.replace('$LABEL$', 'Claude')
      && ownerContext.chatInput.title === ja.shell_owned_title.replace('$LABEL$', 'Claude'),
    'a language change redraws the popup owner header and locked composer tooltip');
  shipped.setOverride('de');
  ownerContext._setHeaderOwner('Autopilot');
  check(statusText.textContent === de.shell_owned_by.replace('$LABEL$', 'Autopilot'),
    'the owner name stays as sent even when it is also catalog copy');
  for (const code of ['de', 'ja']) {
    shipped.setOverride(code);
    for (const label of ['Autopilot', 'Ready', 'Agent $& $` $\' $$']) {
      ownerContext._setHeaderOwner(label);
      ownerContext._refreshOwnerCopy();
      check(statusText.textContent === shippedCatalogs[code].shell_owned_by.replace('$LABEL$', () => label)
          && ownerContext.chatInput.title === shippedCatalogs[code].shell_owned_title.replace('$LABEL$', () => label),
        `${code} owner header and tooltip preserve the raw label ${label}`);
    }
  }
  check(popupSource.includes('fsbUiLocale.onChange(_refreshOwnerCopy)')
      && extractNamedFunction(popupSource, 'refreshOwnerChip').includes('chatInput.title = _ownerLockTitle(label);'),
    'the popup redraws owner copy on a language change, and one helper builds the tooltip');
}

// The dashboard chart draws its legend, axis titles and tooltip on a canvas,
// so analytics.js translates them itself. The service worker loads the same
// file without the locale helper and keeps English.
{
  const analyticsSource = fs.readFileSync(path.join(root, 'extension/utils/analytics.js'), 'utf8');
  function chartSandbox(withLocale) {
    const sandbox = {
      module: undefined,
      console: { log() {}, warn() {}, error() {} },
      Chart: function (_ctx, config) {
        this.data = config.data;
        this.options = config.options;
        this.updates = 0;
        this.update = () => { this.updates += 1; };
      },
      document: { getElementById: (id) => (id === 'usageChart' ? {} : null), documentElement: { getAttribute: () => 'dark' } }
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    if (withLocale) {
      for (const file of ['extension/utils/ui-locale.js', 'extension/utils/panel-exact.js']) {
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox);
      }
      for (const code of Object.keys(shippedCatalogs)) sandbox.fsbUiLocale.setCatalog(code, shippedCatalogs[code]);
    }
    vm.runInContext(analyticsSource, sandbox);
    // Skip the constructor: it reads chrome.storage and starts a timer.
    const analytics = vm.runInContext('Object.assign(Object.create(FSBAnalytics.prototype), { usageData: [], chart: null })', sandbox);
    return { sandbox, analytics };
  }
  function chartText(analytics, sandbox) {
    const chart = analytics.chart;
    const formatted = vm.runInContext('(1234).toLocaleString()', sandbox);
    return {
      legend: chart.data.datasets.map((d) => d.label),
      x: chart.options.scales.x.title.text,
      y: chart.options.scales.y.title.text,
      tooltip: chart.options.plugins.tooltip.callbacks.label({ dataset: chart.data.datasets[0], parsed: { y: 1234 } }),
      formatted
    };
  }

  const english = chartSandbox(false);
  english.analytics.initializeChart();
  const en = chartText(english.analytics, english.sandbox);
  check(JSON.stringify(en.legend) === JSON.stringify(['Input Tokens', 'Output Tokens']) && en.x === 'Time' && en.y === 'Tokens'
      && en.tooltip === `Input Tokens: ${en.formatted} tokens`,
    'without the locale helper (service worker) the chart stays in English');
  english.analytics.updateChartLocale();
  check(english.analytics.chart.data.datasets[0].label === 'Input Tokens', 'updateChartLocale is safe without the locale helper');

  const localized = chartSandbox(true);
  localized.sandbox.fsbUiLocale.setOverride('ja');
  localized.analytics.initializeChart();
  const ja = chartText(localized.analytics, localized.sandbox);
  const jaCat = shippedCatalogs.ja;
  check(JSON.stringify(ja.legend) === JSON.stringify([jaCat.panel_c54a41f6d6, jaCat.panel_a0a1074faa])
      && ja.x === jaCat.panel_33b93476cf && ja.y === jaCat.panel_a039dfb962,
    'chart legend and axis titles follow a ja override');
  check(ja.tooltip === `${jaCat.panel_c54a41f6d6}: ${jaCat.panel_88cc87e3a4.replace('$COUNT$', ja.formatted)}`,
    'chart tooltip fills the translated token count');
  const weekdays = localized.analytics.getChartData('7d').labels;
  check(weekdays.length === 8 && weekdays.every((label) => ['日', '月', '火', '水', '木', '金', '土'].includes(label)),
    'weekly chart ticks use the UI language');

  localized.sandbox.fsbUiLocale.setOverride('de');
  localized.analytics.chartTimeRange = '30d';
  const updatesBefore = localized.analytics.chart.updates;
  localized.analytics.updateChartLocale();
  const de = chartText(localized.analytics, localized.sandbox);
  const deCat = shippedCatalogs.de;
  check(de.legend[0] === deCat.panel_c54a41f6d6 && de.x === deCat.panel_33b93476cf && de.y === deCat.panel_a039dfb962
      && localized.analytics.chart.data.labels.length === 31 && localized.analytics.chart.updates === updatesBefore + 1,
    'updateChartLocale re-labels the chart in place for the range on screen');

  const optionsSourceForChart = fs.readFileSync(path.join(root, 'extension/ui/options.js'), 'utf8');
  check(optionsSourceForChart.includes('fsbUiLocale.onChange(() => analytics.updateChartLocale())'),
    'the control panel re-labels the chart on a language change');
}

async function asyncChecks() {
  for (const code of locale.PUBLIC_LOCALES.filter((code) => code !== 'en')) {
    const api = freshLocale().fsbUiLocale;
    api.setOverride(code);
    const { context, log, storage, metrics } = sidepanelMessageContext(api);
    context.dispatchRuntimeMessage({ action: 'sessionStateEvent', eventType: 'iteration_complete',
      sessionId: 'background-session', conversationId: 'background-conversation', iteration: 7 });
    await context._flushMessageLog('background-conversation');
    const rows = log.getMessages(storage[log.STORAGE_KEY], 'background-conversation');
    check(rows.length === 1 && rows[0].content === shippedCatalogs[code].copy_d6786d701f.replace('$NUMBER$', '7')
        && rows[0].uiMessage.subs.number === 7
        && log.getMessages(storage[log.STORAGE_KEY], 'visible-conversation').length === 0,
      `${code} background progress saves translated fallback and its source in the originating conversation`);
    const next = code === 'ja' ? 'de' : 'ja';
    api.setOverride(next);
    await context.hydrateChatFromConversationId('background-conversation');
    const bubble = context.chatMessages.children[0];
    check(bubble.textContent === shippedCatalogs[next].copy_d6786d701f.replace('$NUMBER$', '7')
        && bubble.className === 'message action', `${code} progress replays in the current language`);
    api.setOverride('en');
    api.apply(fakeDoc([bubble]));
    check(bubble.textContent === 'Step 7 complete' && metrics.writes === 1,
      'replayed progress follows another language change without a history write');
  }

  for (const code of locale.PUBLIC_LOCALES.filter((code) => code !== 'en')) {
    const api = freshLocale().fsbUiLocale;
    api.setOverride(code);
    const { context, log, storage, metrics } = sidepanelMessageContext(api);
    const english = 'No active automation to stop.';
    const template = 'Starting reconnaissance on $DOMAIN$...';
    const domain = 'shop.$&<example>';
    context.addMessage(english, 'system');
    context.currentStatusMessage = messageNode();
    context.completeStatusMessage(template, 'system', { domain });
    context.addMessage(english, 'user');
    context.addCompletionMessage(english, 'ai');
    context.addMessage(english, 'action');
    await context._flushMessageLog('visible-conversation');
    const envelope = storage[log.STORAGE_KEY];
    const rows = log.getMessages(envelope, 'visible-conversation');
    check(rows[0].content === shippedCatalogs[code].shell_no_automation
        && rows[0].uiMessage.english === english && rows[1].uiMessage.subs.domain === domain
        && rows.slice(2).every((row) => row.content === english && !row.uiMessage),
      `${code} system messages retain source while identical user, model and tool text stays plain`);
    for (const [content, kind] of [[english, 'text'], ['Step 12 complete', 'progress'], ['Step 12 complete extra', 'progress']]) {
      log.appendMessage(envelope, 'visible-conversation', { role: 'assistant', content, kind, timestamp: Date.now() + 100 });
    }
    log.appendMessage(envelope, 'visible-conversation', { role: 'assistant', content: 'stored fallback',
      kind: 'text', timestamp: Date.now() + 100, uiMessage: { english: 'Unrecognized catalog source' } });
    const next = code === 'ja' ? 'de' : 'ja';
    api.setOverride(next);
    await context.hydrateChatFromConversationId('visible-conversation');
    const bubbles = context.chatMessages.children;
    check(bubbles.length === 9 && bubbles[0].textContent === shippedCatalogs[next].shell_no_automation
        && bubbles[1].textContent === api.line(template, { domain })
        && bubbles.slice(2, 6).every((bubble) => bubble.textContent === english)
        && bubbles[6].textContent === shippedCatalogs[next].copy_d6786d701f.replace('$NUMBER$', '12')
        && bubbles[7].textContent === 'Step 12 complete extra' && bubbles[8].textContent === 'stored fallback',
      `${code} replay translates sourced UI and exact legacy steps while preserving legacy assistant text`);
    api.setOverride('en');
    api.apply(fakeDoc(bubbles));
    check(bubbles[0].textContent === english && bubbles[1].textContent === template.replace('$DOMAIN$', () => domain)
        && bubbles[6].textContent === 'Step 12 complete' && metrics.writes === 1,
      'replayed system messages and legacy progress follow another language change without rewriting history');
  }

  const failureCases = [
    ['provider_error', '$NAME$ reported an error before completing this task. Raw provider output was not retained.'],
    ['daemon_restart_lost_run', 'The previous agent process was stopped and was not reattached. Start a new task when the local service is ready.'],
    ['resume_ownership_lost', 'FSB could not return this tab to $NAME$, so the run ended and the tab remains under your control.'],
    ['hold_expired', 'FSB could not return this tab to $NAME$, so the run ended and the tab remains under your control.'],
    ['wall_clock_timeout', '$NAME$ ran past the time limit for this task.'],
    ['event_silence_timeout', '$NAME$ stopped sending updates, so FSB ended the run.'],
    ['agent_unpaired', 'FSB’s local helper is not installed. Run: npx -y fsb-mcp-server@latest install --native-host'],
    ['native_host_missing', 'FSB’s local helper is not installed. Run: npx -y fsb-mcp-server@latest install --native-host'],
    ['agent_offline', '$NAME$ is not reachable. Start the local FSB service, then try this message again.'],
    ['unsupported_provider', '$NAME$ cannot run browser tasks. Choose a supported agent provider in Settings.'],
    ['unexpected_code', '$NAME$ stopped before the task was complete.']
  ];
  for (const code of [...locale.PUBLIC_LOCALES, null]) {
    for (const provider of [undefined, { label: '' }, { label: 'Grok Build $& <provider>' }]) {
      const api = freshLocale().fsbUiLocale;
      api.setOverride(code || 'en');
      const { context, log, storage, metrics } = sidepanelMessageContext(code ? api : undefined);
      const expected = (language, english) => {
        const cat = shippedCatalogs[language];
        const name = provider && provider.label || cat[api.exact['The agent']];
        const reason = cat[api.exact[english]].replace('$NAME$', () => name);
        return cat.copy_5044c249a6.replace('$ERROR$', () => reason);
      };
      const next = code === 'ja' ? 'de' : 'ja';
      for (const [terminalCode, english] of failureCases) {
        api.setOverride(code || 'en');
        context.currentStatusMessage = messageNode();
        const snapshot = { delegationId: terminalCode, terminal: { code: terminalCode }, provider };
        check(context._delegatedRunApplyTerminal(snapshot)
            && !context._delegatedRunApplyTerminal(snapshot), 'delegated terminal delivery remains idempotent');
        const bubble = context.chatMessages.children.at(-1);
        check(bubble.textContent === expected(code || 'en', english),
          `${code || 'no helper'} ${terminalCode} renders the complete failure and provider fallback`);
        if (code) {
          api.setOverride(next);
          api.apply(fakeDoc([bubble]));
          const subs = JSON.parse(bubble.getAttribute('data-i18n-subs'));
          check(bubble.textContent === expected(next, english) && subs.error.english === english
              && (!subs.error.subs || subs.error.subs.name === (provider && provider.label || 'The agent')),
            `${terminalCode} keeps the nested source and retranslates the whole bubble`);
        }
      }
      await context._flushMessageLog('visible-conversation');
      const rows = log.getMessages(storage[log.STORAGE_KEY], 'visible-conversation');
      check(rows.length === failureCases.length && rows.every((row, index) => row.content === expected(code || 'en', failureCases[index][1])
          && (code ? row.uiMessage.subs.error.english === failureCases[index][1] : !row.uiMessage)),
        'delegated failures persist readable fallbacks and untranslated nested sources exactly once');
      api.setOverride(next);
      await context.hydrateChatFromConversationId('visible-conversation');
      check(context.chatMessages.children.every((bubble, index) => bubble.textContent === expected(code ? next : 'en', failureCases[index][1]))
          && metrics.writes === 1, 'delegated failures replay in the current language without another write');
    }
  }

  // The background, generic, and stop errors used to be keyed through text().
  // As exact sources they still translate, follow a switch, and replay.
  const keyedErrors = [
    ['Error communicating with background script: $ERROR$', 'shell_error_background'],
    ['I encountered an error: $ERROR$', 'shell_error_encountered'],
    ['Something went wrong: $ERROR$', 'shell_error_generic'],
    ['Error stopping automation: $ERROR$', 'shell_error_stop']
  ];
  for (const code of locale.PUBLIC_LOCALES.filter((code) => code !== 'en')) {
    const api = freshLocale().fsbUiLocale;
    api.setOverride(code);
    const { context, log, storage, metrics } = sidepanelMessageContext(api);
    const cases = keyedErrors.flatMap(([english, key]) => ['socket closed $& <raw>', 'Unknown error']
      .map((reason) => ({ english, key, reason })));
    const expected = (language, { key, reason }) => {
      const cat = shippedCatalogs[language];
      const shown = api.exact[reason] ? cat[api.exact[reason]] : reason;
      return cat[key].replace('$ERROR$', () => shown);
    };
    for (const item of cases) context.addMessage(item.english, 'error', undefined, { error: item.reason });
    const live = context.chatMessages.children.slice();
    check(live.length === cases.length && live.every((bubble, index) => bubble.textContent === expected(code, cases[index])),
      `${code} background, generic, and stop errors translate with raw and catalog reasons`);
    const next = code === 'ja' ? 'de' : 'ja';
    api.setOverride(next);
    api.apply(fakeDoc(live));
    check(live.every((bubble, index) => bubble.textContent === expected(next, cases[index])),
      `${code} background, generic, and stop errors follow a language change`);
    await context._flushMessageLog('visible-conversation');
    const rows = log.getMessages(storage[log.STORAGE_KEY], 'visible-conversation');
    check(rows.length === cases.length && rows.every((row, index) => row.kind === 'error'
        && row.content === expected(code, cases[index])
        && row.uiMessage.english === cases[index].english && row.uiMessage.subs.error === cases[index].reason),
      `${code} background, generic, and stop errors persist a readable fallback and their English source`);
    await context.hydrateChatFromConversationId('visible-conversation');
    const replayed = context.chatMessages.children;
    check(replayed.length === cases.length && metrics.writes === 1
        && replayed.every((bubble, index) => bubble.className === 'message error' && bubble.textContent === expected(next, cases[index])),
      `${code} background, generic, and stop errors replay in the current language without another write`);
  }

  // A rejected delegated start uses the same live provider fallback as a
  // failure snapshot, without retaining an earlier language's translation.
  {
    const source = fs.readFileSync(path.join(root, 'extension/ui/sidepanel.js'), 'utf8');
    const shipped = freshLocale().fsbUiLocale;
    const container = messageNode();
    const context = {
      fsbUiLocale: shipped,
      document: { createElement: messageNode },
      _activeTabIdSnapshot: 7,
      conversationId: 'locale-conversation',
      _delegationValidConversationId: () => true,
      _delegationReserveUnboundCleanup: () => 'cleanup-key',
      _delegationReleaseCleanupReservation() {},
      _renderDelegationPreparing() {}, updateSendButtonState() {}, _renderDelegationReadyState() {},
      _sendDelegationCommand: async () => ({ ok: false, code: 'activation_failed' }),
      _delegationValidLifecycleResponse: () => true,
      _ensureDelegationMount: () => ({ state: container })
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(extractNamedFunction(source, '_delegationElement'), context);
    vm.runInContext('async ' + extractNamedFunction(source, '_beginDelegationStart'), context);
    context._renderDelegationInlineError = (mount, text, subs) => mount.appendChild(context._delegationElement('p', '', text, subs));
    for (const code of shipped.PUBLIC_LOCALES.filter((code) => code !== 'en')) {
      for (const providerLabel of [undefined, 'Grok Build']) {
        shipped.setOverride(code);
        container.children.length = 0;
        context._delegationUiState = { pendingStart: false, task: 'Original task', providerLabel };
        await context._beginDelegationStart('challenge-locale');
        const body = container.children[0];
        const expected = (language) => shippedCatalogs[language].copy_2b4b8c0560
          .replace('$NAME$', providerLabel || shippedCatalogs[language].copy_750a4ad2a8);
        check(body.textContent === expected(code), `${code} rejected start translates its provider fallback and preserves real labels`);
        const next = code === 'ja' ? 'de' : 'ja';
        shipped.setOverride(next);
        shipped.apply(fakeDoc([body]));
        check(body.textContent === expected(next), 'rejected-start provider copy follows a language change');
      }
    }
  }

  // Run the popup's actual boot callback with catalogs held until ownership
  // has rendered, then cover the opposite startup order as well.
  const popupSource = fs.readFileSync(path.join(root, 'extension/ui/popup.js'), 'utf8');
  const bootStart = popupSource.lastIndexOf("if (globalThis.fsbUiLocale && typeof fsbUiLocale.boot === 'function')");
  assert(bootStart !== -1, 'popup locale boot block exists');
  for (const ownerBeforeBoot of [true, false]) {
    let releaseCatalogs;
    let catalogRequested;
    const catalogsReady = new Promise((resolve) => { releaseCatalogs = resolve; });
    const catalogsStarted = new Promise((resolve) => { catalogRequested = resolve; });
    const statusText = fakeNode({}, '');
    const document = Object.assign(fakeDoc([statusText]), { documentElement: fakeNode({}, '') });
    const sandbox = freshLocale({
      location: { protocol: 'chrome-extension:' },
      document,
      chrome: {
        i18n: { getUILanguage: () => 'en', getMessage: () => '' },
        storage: { local: { get: (_key, callback) => callback({ fsbUiLocale: 'de' }) }, onChanged: { addListener() {} } },
        runtime: { getURL: (file) => file }
      },
      fetch: (url) => {
        catalogRequested();
        return catalogsReady.then(() => ({ json: () => JSON.parse(fs.readFileSync(path.join(root, 'extension', url), 'utf8')) }));
      },
      statusText,
      statusDot: { classList: { add() {}, remove() {} } },
      chatInput: { title: '' },
      _headerBaseStatusLabel: 'Ready',
      _headerBaseStatusTone: '',
      _headerOwnerLabel: null,
      _chatLockedByOwnerChip: false
    });
    const shipped = sandbox.fsbUiLocale;
    for (const code of shipped.PUBLIC_LOCALES) shipped.setCatalog(code, {});
    vm.runInContext(fs.readFileSync(path.join(root, 'extension/ui/owner-chip.js'), 'utf8'), sandbox);
    for (const name of ['_renderHeaderStatus', '_setHeaderOwner', '_ownerLockTitle', '_refreshOwnerCopy']) {
      vm.runInContext(extractNamedFunction(popupSource, name), sandbox);
    }
    const showOwner = () => {
      sandbox._setHeaderOwner('Claude');
      sandbox._chatLockedByOwnerChip = true;
      sandbox.chatInput.title = sandbox._ownerLockTitle('Claude');
    };
    let bootPromise;
    const originalBoot = shipped.boot;
    shipped.boot = () => { bootPromise = originalBoot(); return bootPromise; };
    vm.runInContext(popupSource.slice(bootStart), sandbox);
    if (ownerBeforeBoot) showOwner();
    await catalogsStarted;
    if (ownerBeforeBoot) {
      check(statusText.textContent === 'Owned by Claude' && sandbox.chatInput.title === 'Disabled while tab is owned by Claude',
        'an owner rendered before catalogs load initially uses English');
    }
    releaseCatalogs();
    await bootPromise;
    if (!ownerBeforeBoot) {
      check(statusText.textContent === shippedCatalogs.de.shell_ready && sandbox.chatInput.title === '',
        'locale boot without an owner translates the normal header and leaves the tooltip alone');
      showOwner();
    }
    check(statusText.textContent === shippedCatalogs.de.shell_owned_by.replace('$LABEL$', 'Claude')
        && sandbox.chatInput.title === shippedCatalogs.de.shell_owned_title.replace('$LABEL$', 'Claude'),
      `owner header and tooltip use the saved language when ownership arrives ${ownerBeforeBoot ? 'before' : 'after'} locale boot`);
    await shipped.saveOverride('ja');
    check(statusText.textContent === shippedCatalogs.ja.shell_owned_by.replace('$LABEL$', 'Claude')
        && sandbox.chatInput.title === shippedCatalogs.ja.shell_owned_title.replace('$LABEL$', 'Claude'),
      'the popup boot subscription refreshes owner copy on a later language change');
  }

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
  check(select.value === '', 'a new picker starts on Automatic');
  await locale.saveOverride('de');
  check(select.value === 'de', 'the picker follows a language change made elsewhere');
  await locale.saveOverride(null);
  check(select.value === '', 'the picker follows a return to the automatic language');

  {
    const shipped = freshLocale().fsbUiLocale;
    const picker = fakeSelect();
    shipped.mountSelect(picker);
    const automatic = picker.options[0];
    check(picker.options.length === 8 && automatic.value === ''
        && automatic.attrs['data-i18n'] === 'lang_follow_browser' && automatic.textContent === 'Automatic',
      'the picker lists Automatic, keyed for translation, before the seven languages');
    check(JSON.stringify(picker.options.slice(1).map((o) => o.textContent)) === JSON.stringify(autonyms),
      'the picker lists each language by its own name');
    check(shippedCatalogs.ja.lang_follow_browser === '自動' && shippedCatalogs.de.lang_follow_browser === 'Automatisch',
      'Automatic is translated in the catalogs');
  }

  let refreshed = 0;
  locale.onChange(function () { refreshed += 1; });
  locale.refresh();
  check(refreshed === 1, 'refresh runs onChange callbacks so pages can sync after boot');

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
  locale.setPreferredLanguages(null);

  // boot() reads Chrome's preferred-languages list before it loads catalogs.
  // getAcceptLanguages() returns a promise in MV3 and takes a callback in
  // older builds; navigator.languages stands in when the API is missing.
  function bootSandbox(i18n, extra) {
    const requests = [];
    const sandbox = freshLocale(Object.assign({
      chrome: {
        i18n: Object.assign({ getUILanguage: () => 'ja', getMessage: () => '' }, i18n),
        storage: { local: { get: (_key, cb) => cb({}) }, onChanged: { addListener() {} } },
        runtime: { getURL: (file) => file }
      },
      fetch: (url) => { requests.push(url); return Promise.resolve({ json: () => ({}) }); }
    }, extra || {}));
    return { api: sandbox.fsbUiLocale, requests };
  }
  const promiseBoot = bootSandbox({ getAcceptLanguages: () => Promise.resolve(['ko-KR', 'en-US']) });
  await promiseBoot.api.boot();
  check(promiseBoot.api.current() === 'ko', 'boot takes the language from getAcceptLanguages() (promise form)');
  check(['_locales/ko/messages.json', '_locales/ja/messages.json', '_locales/en/messages.json']
    .every((file) => promiseBoot.requests.indexOf(file) !== -1) && promiseBoot.requests.length === 3,
  'content-script boot loads the automatic, UI-language, and English catalogs');
  const callbackBoot = bootSandbox({ getAcceptLanguages: (cb) => { cb(['fr', 'de-CH']); } });
  await callbackBoot.api.boot();
  check(callbackBoot.api.current() === 'de', 'boot takes the language from getAcceptLanguages() (callback form)');
  const navigatorBoot = bootSandbox({}, { navigator: { languages: ['es-MX', 'en'] } });
  await navigatorBoot.api.boot();
  check(navigatorBoot.api.current() === 'es', 'boot falls back to navigator.languages when getAcceptLanguages() is missing');
  const emptyBoot = bootSandbox({ getAcceptLanguages: () => Promise.resolve([]) }, { navigator: { languages: ['zh-TW'] } });
  await emptyBoot.api.boot();
  check(emptyBoot.api.current() === 'zh-TW', 'an empty getAcceptLanguages() list falls back to navigator.languages');
  const failingBoot = bootSandbox({ getAcceptLanguages: () => Promise.reject(new Error('no list')) });
  await failingBoot.api.boot();
  check(failingBoot.api.current() === 'ja', 'with no language list at all the UI language decides');

  // Extension pages carry the active language on <html lang>; host pages that
  // run the content scripts are never touched.
  const extensionPage = freshLocale({
    location: { protocol: 'chrome-extension:' },
    document: { documentElement: fakeNode({}, ''), querySelectorAll: () => [] }
  });
  const pageLang = () => extensionPage.document.documentElement.getAttribute('lang');
  extensionPage.fsbUiLocale.setOverride('ja');
  extensionPage.fsbUiLocale.refresh();
  check(pageLang() === 'ja', 'a language change sets <html lang> on extension pages');
  extensionPage.fsbUiLocale.setOverride('zh-TW');
  extensionPage.fsbUiLocale.refresh();
  check(pageLang() === 'zh-TW', '<html lang> uses the public locale code');

  const bootedPage = freshLocale({
    location: { protocol: 'chrome-extension:' },
    document: { documentElement: fakeNode({ lang: 'en' }, ''), querySelectorAll: () => [] },
    chrome: {
      i18n: { getUILanguage: () => 'en-US', getMessage: () => '' },
      storage: { local: { get: (_key, cb) => cb({ fsbUiLocale: 'ko' }) }, onChanged: { addListener() {} } },
      runtime: { getURL: (file) => file }
    },
    fetch: () => Promise.resolve({ json: () => ({}) })
  });
  await bootedPage.fsbUiLocale.boot();
  check(bootedPage.document.documentElement.getAttribute('lang') === 'ko', 'boot() sets <html lang> from the stored language');

  const automaticPage = freshLocale({
    location: { protocol: 'chrome-extension:' },
    document: { documentElement: fakeNode({ lang: 'en' }, ''), querySelectorAll: () => [] },
    chrome: {
      i18n: { getUILanguage: () => 'en-US', getMessage: () => '', getAcceptLanguages: () => Promise.resolve(['zh-TW', 'en']) },
      storage: { local: { get: (_key, cb) => cb({}) }, onChanged: { addListener() {} } },
      runtime: { getURL: (file) => file }
    },
    fetch: () => Promise.resolve({ json: () => ({}) })
  });
  await automaticPage.fsbUiLocale.boot();
  check(automaticPage.document.documentElement.getAttribute('lang') === 'zh-TW',
    "with nothing saved, an extension page opens in the first supported language from Chrome's list");

  const hostPage = freshLocale({
    location: { protocol: 'https:' },
    document: { documentElement: fakeNode({ lang: 'fr' }, ''), querySelectorAll: () => [] }
  });
  hostPage.fsbUiLocale.setOverride('ja');
  hostPage.fsbUiLocale.refresh();
  check(hostPage.document.documentElement.getAttribute('lang') === 'fr', 'content scripts leave the host page <html lang> alone');
}

asyncChecks().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}, (err) => {
  console.error(err);
  process.exit(1);
});
