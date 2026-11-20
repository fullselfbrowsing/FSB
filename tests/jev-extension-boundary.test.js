#!/usr/bin/env node
'use strict';

/**
 * Phase 67 Plan 11 -- the Jev extension boundary (D-01, D-09, D-17, D-22;
 * JEV-01, JEV-02).
 *
 * The extension bundle is public, so everything in it can be read by anyone.
 * This suite proves four things about it:
 *
 *   1. No upstream path or credential name. No file under extension/ (any
 *      extension, comments included, binaries read as latin1) contains
 *      `systemone`, `api.typesafe.ai` or a `JEV_*` env-var name. The string
 *      `openrouter.ai` is allowed: it is the existing chat provider.
 *   2. One fixed endpoint, no storage. extension/ai/jev-*.js contain no
 *      chrome.storage, localStorage, serverUrl or importScripts, and the only
 *      URL in them is https://full-selfbrowsing.com/api/jev/decide, exactly
 *      once, in jev-client.js. extension/ai holds exactly the enumerated
 *      modules: the three Phase 67 modules and, since Phase 68 plan 68-04,
 *      the fast-mode core jev-fast-path.js (global FsbFastPath), which meets
 *      every one of these bans as written.
 *   3. No caller, no setting, no UI. Nothing outside extension/ai/jev-*.js
 *      names FsbJevState, FsbJevClient or FsbJevPolicy (FsbFastPath does not
 *      carry the FsbJev prefix, so it needs no exemption anywhere);
 *      background.js names the four module files only in its four load lines
 *      (state, client, policy, fast path), adjacent and directly after
 *      ai/model-discovery.js, and otherwise mentions jev only inside the
 *      exact, word-bounded tokens of BACKGROUND_JEV_TOKENS:
 *      fsbJevFastModeEnabled and getJevMenu (Phase 68 plan 68-06), and
 *      fsbJevCaptureArmed, fsbJevCaptureRing and jevCaptureObservation
 *      (plan 68-08); any other jev text there, a comment included, still
 *      fails; nothing under extension/ui or
 *      extension/config mentions jev, except the one settings key
 *      fsbJevFastModeEnabled (Phase 68 D-06), allowed as an exact,
 *      word-bounded token in extension/config/config.js,
 *      extension/config/init-config.js and extension/ui/options.js, and the
 *      fast-mode settings card in extension/ui/control_panel.html (Phase 68
 *      plan 68-12): there, jev text is allowed only on the lines from the one
 *      holding id="fsbJevFastModeCard" through the one holding the closing
 *      comment <!-- /fsbJevFastModeCard -->. Each marker must appear exactly
 *      once, the end after the start, the range at most 40 lines; the range
 *      is computed from the file at run time. Any other jev text in those
 *      files (the token outside the card in control_panel.html included), or
 *      the token anywhere else under extension/ui or extension/config, still
 *      fails.
 *   4. Inert load. Each module, alone and all four together, evaluates in a
 *      bare vm context (no chrome, no fetch, no require, no module), makes no
 *      timer call, logs nothing, throws nothing and adds exactly its own
 *      Fsb* global. In that context a client is created and an invalid
 *      request is answered invalid_request without fetch.
 *
 * A violation is a defect in the module's owning plan (67-06, 67-07, 67-08
 * or 68-04). Fix the module; never weaken this suite.
 *
 * Run: node tests/jev-extension-boundary.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// A promise that never settles must not pass as a clean exit.
process.exitCode = 1;

const ROOT = path.join(__dirname, '..');
const EXT_DIR = path.join(ROOT, 'extension');
const AI_DIR = path.join(EXT_DIR, 'ai');
const MAX_SCAN_BYTES = 5 * 1024 * 1024;
const ENDPOINT = 'https://full-selfbrowsing.com/api/jev/decide';

// Load order matches extension/background.js: state, client, policy. Since
// plan 68-06 the background.js load-line check uses ALL_MODULES (these three
// plus the fast-path module, in that load order).
const MODULES = Object.freeze([
  Object.freeze({ file: 'jev-state.js', global: 'FsbJevState' }),
  Object.freeze({ file: 'jev-client.js', global: 'FsbJevClient' }),
  Object.freeze({ file: 'jev-policy.js', global: 'FsbJevPolicy' })
]);
// Phase 68 (68-04): the fast-mode core is a fourth enumerated module for the
// jev-*.js bans, the one-URL scan, the exact file set, the caller-scan
// exemption, the inert loads and the exact-globals check.
const FAST_PATH_MODULE = Object.freeze({ file: 'jev-fast-path.js', global: 'FsbFastPath' });
const ALL_MODULES = Object.freeze(MODULES.concat([FAST_PATH_MODULE]));
const JEV_GLOBALS = ALL_MODULES.map((m) => m.global);
const JEV_REL_PATHS = ALL_MODULES.map((m) => 'extension/ai/' + m.file);

// D-01, D-09, D-22: patterns forbidden anywhere in extension/.
const TREE_PATTERNS = Object.freeze([
  Object.freeze({ name: 'systemone (upstream path)', re: /systemone/gi }),
  Object.freeze({ name: 'api.typesafe.ai (upstream host)', re: /api\.typesafe\.ai/gi }),
  Object.freeze({ name: 'JEV_* credential env-var name', re: /\bJEV_[A-Z_]+\b/g })
]);

// D-01, D-09: patterns forbidden in extension/ai/jev-*.js.
const MODULE_PATTERNS = Object.freeze([
  Object.freeze({ name: 'chrome.storage', re: /chrome\.storage/g }),
  Object.freeze({ name: 'localStorage', re: /localStorage/g }),
  Object.freeze({ name: 'serverUrl (user-editable Sync server URL)', re: /serverUrl/gi }),
  Object.freeze({ name: 'importScripts', re: /importScripts/g })
]);

// D-01: no caller of the Jev globals outside the modules themselves.
const CALLER_PATTERN = Object.freeze({ name: 'FsbJev* global reference', re: /FsbJev[A-Za-z_$]*/g });

// D-01: no Jev setting, storage key or UI.
const UI_WORD_PATTERN = Object.freeze({ name: 'jev (word)', re: /\bjev\b/gi });
const UI_TEXT_PATTERN = Object.freeze({ name: 'jev (any substring, text files)', re: /jev/gi });

// Phase 68 D-06: the exact settings keys a text file under extension/ui or
// extension/config may contain, and the only files that may contain them.
// Each token is removed only where it stands as a whole word, and only in
// those files, before UI_TEXT_PATTERN runs; any other jev text still fails.
// control_panel.html (plan 68-12) may hold the token too, but only inside the
// fast-mode card range below: the token is never stripped there, so the token
// outside the card is still reported.
const UI_CONFIG_JEV_TOKENS = Object.freeze(['fsbJevFastModeEnabled']);
const UI_CONFIG_TOKEN_FILES = Object.freeze([
  'extension/config/config.js',
  'extension/config/init-config.js',
  'extension/ui/options.js',
  'extension/ui/control_panel.html'
]);

// Phase 68 D-06 (plan 68-12): the one marker-bounded range of jev text under
// extension/ui and extension/config, the fast-mode settings card. The range
// runs from the line holding the start marker through the line holding the
// end marker; each marker must appear exactly once in the file, the end on a
// later line than the start, and the range may span at most
// UI_CARD_MAX_LINES lines.
const UI_CARD_FILE = 'extension/ui/control_panel.html';
const UI_CARD_START_MARKER = 'id="fsbJevFastModeCard"';
const UI_CARD_END_MARKER = '<!-- /fsbJevFastModeCard -->';
const UI_CARD_MAX_LINES = 40;

// Phase 68 D-06 (plans 68-06 and 68-08): besides its four load lines,
// background.js may mention jev only inside these exact tokens, each removed
// only where it stands as a whole word; any other jev text on any
// background.js line fails. 68-08 adds the internal capture arm and ring
// storage keys and the capture observation message name.
const BACKGROUND_JEV_TOKENS = Object.freeze([
  'fsbJevFastModeEnabled',
  'getJevMenu',
  'fsbJevCaptureArmed',
  'fsbJevCaptureRing',
  'jevCaptureObservation'
]);
const BACKGROUND_DISCOVERY_LINE = "importScripts('ai/model-discovery.js');";
const BACKGROUND_LOAD_LINES = Object.freeze(ALL_MODULES.map((m) => "importScripts('ai/" + m.file + "');"));

// Any scheme://... literal (https, http, ws, wss, chrome-extension, ...).
const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s'"`)<>\]]*/gi;

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    passed += 1;
    console.log('  PASS: ' + message);
  } else {
    failed += 1;
    console.error('  FAIL: ' + message);
  }
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

/** Every regular file under dir, recursively; node_modules and symlinks are skipped. */
function walkFiles(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/**
 * Read a file for scanning. Text is read as UTF-8; a file holding a NUL byte
 * is treated as binary and read as latin1, so ASCII patterns still match
 * byte-for-byte. Files over 5 MB are skipped and reported.
 */
function readForScan(file) {
  const size = fs.statSync(file).size;
  if (size > MAX_SCAN_BYTES) return { skipped: true, size };
  const buf = fs.readFileSync(file);
  const binary = buf.indexOf(0) !== -1;
  return { skipped: false, binary, text: buf.toString(binary ? 'latin1' : 'utf8') };
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

/** Every match of pattern in text as {line, match}. */
function findAll(text, pattern) {
  const re = new RegExp(pattern.re.source, pattern.re.flags.includes('g') ? pattern.re.flags : pattern.re.flags + 'g');
  const hits = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    hits.push({ line: lineOf(text, m.index), match: m[0] });
    if (m[0].length === 0) re.lastIndex += 1;
  }
  return hits;
}

function report(violations, label) {
  if (violations.length === 0) return;
  console.error('  ' + label + ' violations:');
  for (const v of violations) console.error('    - ' + v.file + ':' + v.line + ' -- ' + v.pattern + ' (' + JSON.stringify(v.match) + ')');
}

/** text with every whole-word UI_CONFIG_JEV_TOKENS occurrence removed (line breaks kept). */
function stripAllowedTokens(text) {
  let out = text;
  for (const token of UI_CONFIG_JEV_TOKENS) out = out.replace(new RegExp('\\b' + token + '\\b', 'g'), '');
  return out;
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

/**
 * The fast-mode card's line range in control_panel.html text, computed from
 * the markers: {start, end} (1-based, inclusive) or {error} when a marker is
 * missing or repeated, the end does not follow the start, or the range is
 * wider than UI_CARD_MAX_LINES.
 */
function cardRange(text) {
  const starts = countOccurrences(text, UI_CARD_START_MARKER);
  const ends = countOccurrences(text, UI_CARD_END_MARKER);
  if (starts !== 1 || ends !== 1) {
    return { error: 'fast-mode card markers: ' + starts + ' start and ' + ends + ' end (exactly one of each is required)' };
  }
  const start = lineOf(text, text.indexOf(UI_CARD_START_MARKER));
  const end = lineOf(text, text.indexOf(UI_CARD_END_MARKER));
  if (end <= start) return { error: 'fast-mode card end marker (line ' + end + ') does not follow its start (line ' + start + ')' };
  if (end - start + 1 > UI_CARD_MAX_LINES) {
    return { error: 'fast-mode card range spans ' + (end - start + 1) + ' lines (at most ' + UI_CARD_MAX_LINES + ')' };
  }
  return { start, end };
}

/**
 * The UI_TEXT_PATTERN hits in one text file under extension/ui or
 * extension/config (relPath is repo-relative). In control_panel.html only the
 * lines of the fast-mode card are exempt, and only while its markers are
 * valid (an invalid range is itself reported, with every hit); nothing is
 * stripped there. Elsewhere the allowed tokens are removed first only in
 * UI_CONFIG_TOKEN_FILES, so the scan stays as strict everywhere else and for
 * every other jev text.
 */
function uiTextHits(text, relPath) {
  if (relPath === UI_CARD_FILE) {
    const range = cardRange(text);
    const hits = findAll(text, UI_TEXT_PATTERN);
    if (range.error) return hits.concat([{ line: 0, match: range.error, pattern: 'fast-mode card range' }]);
    return hits.filter((hit) => hit.line < range.start || hit.line > range.end);
  }
  const scanned = UI_CONFIG_TOKEN_FILES.includes(relPath) ? stripAllowedTokens(text) : text;
  return findAll(scanned, UI_TEXT_PATTERN);
}

/** line with every whole-word BACKGROUND_JEV_TOKENS occurrence removed. */
function stripBackgroundTokens(line) {
  let out = line;
  for (const token of BACKGROUND_JEV_TOKENS) out = out.replace(new RegExp('\\b' + token + '\\b', 'g'), '');
  return out;
}

/** background.js lines whose jev text survives the token strip, as {index, text}. */
function backgroundJevLines(lines) {
  const out = [];
  lines.forEach((line, i) => { if (/jev/i.test(stripBackgroundTokens(line))) out.push({ index: i, text: line }); });
  return out;
}

/**
 * True when the only surviving jev lines are the four load lines, in load
 * order, directly after the model-discovery load with no line between.
 */
function backgroundJevClean(lines) {
  const jevLines = backgroundJevLines(lines);
  const discovery = lines.indexOf(BACKGROUND_DISCOVERY_LINE);
  return JSON.stringify(jevLines.map((l) => l.text)) === JSON.stringify(BACKGROUND_LOAD_LINES)
    && discovery >= 0
    && jevLines.every((l, k) => l.index === discovery + 1 + k);
}

// ---------------------------------------------------------------------------
// Static scans
// ---------------------------------------------------------------------------

function scannerSelfTest() {
  console.log('\n--- scanner self-test (the patterns can fire) ---');
  const planted = [
    ['const upstream = "https://api.typesafe.ai/v1/systemone/decide";', ['systemone (upstream path)', 'api.typesafe.ai (upstream host)']],
    ['process.env.JEV_API_KEY', ['JEV_* credential env-var name']],
    ['JEV_UPSTREAM_URL=x', ['JEV_* credential env-var name']],
    ['SYSTEMONE', ['systemone (upstream path)']]
  ];
  for (const [text, expected] of planted) {
    const fired = TREE_PATTERNS.filter((p) => findAll(text, p).length > 0).map((p) => p.name);
    check(JSON.stringify(fired) === JSON.stringify(expected), 'planted ' + JSON.stringify(text) + ' fires exactly ' + expected.join(', '));
  }
  const allowed = ['https://openrouter.ai/api/v1/chat/completions', 'jev_requires_confirmation', 'FsbJevState'];
  for (const text of allowed) {
    check(TREE_PATTERNS.every((p) => findAll(text, p).length === 0), JSON.stringify(text) + ' is not a tree-scan violation');
  }
  check(findAll('chrome.storage.local.get', MODULE_PATTERNS[0]).length === 1
    && findAll('cfg.serverURL', MODULE_PATTERNS[2]).length === 1
    && findAll('self.importScripts(x)', MODULE_PATTERNS[3]).length === 1,
  'module patterns fire on chrome.storage, serverURL and importScripts');
  check(findAll('FsbJevClient.decide(r)', CALLER_PATTERN).length === 1, 'caller pattern fires on FsbJevClient.decide');
  check(findAll('<label>Jev fast mode</label>', UI_WORD_PATTERN).length === 1
    && findAll('jevFastMode: false', UI_WORD_PATTERN).length === 0
    && findAll('jevFastMode: false', UI_TEXT_PATTERN).length === 1,
  'UI patterns fire on a Jev label and (text files) a jev* storage key');
  const urls = 'a "https://x.example/p?q" b ws://h:1/ c chrome-extension://id/x.html'.match(URL_PATTERN) || [];
  check(urls.length === 3, 'URL pattern finds https, ws and chrome-extension literals');

  // Phase 68 D-06: the ui/config token allowlist removes only the exact,
  // word-bounded key, and only in the three allowed files.
  const OPTIONS_REL = 'extension/ui/options.js';
  const CONFIG_REL = 'extension/config/config.js';
  const INIT_REL = 'extension/config/init-config.js';
  const PANEL_REL = 'extension/ui/control_panel.html';
  const stillReported = [
    [OPTIONS_REL, '  // Jev fast mode\n'],
    [OPTIONS_REL, '  fsbJevOther: true,\n'],
    [OPTIONS_REL, 'const jevFastMode = false;\n'],
    [OPTIONS_REL, '  fsbJevFastModeEnabledX: false,\n'],
    [OPTIONS_REL, '  xfsbJevFastModeEnabled: false,\n'],
    [OPTIONS_REL, '  fsbJevFastModeEnabled_2: false,\n'],
    [CONFIG_REL, "    { key: 'fsbJevFastModeEnabledX', type: 'boolean', cls: 'writable', default: false }\n"],
    [CONFIG_REL, "    { key: 'fsbjevfastmodeenabled', type: 'boolean', cls: 'writable', default: false }\n"],
    [INIT_REL, '  // JEV fast mode\n'],
    [PANEL_REL, '<label>Jev fast mode</label>\n'],
    [PANEL_REL, '<input type="checkbox" id="fsbJevFastModeEnabled">\n'],
    ['extension/ui/sidepanel.js', "const key = 'fsbJevFastModeEnabled';\n"]
  ];
  for (const [relPath, text] of stillReported) {
    check(uiTextHits(text, relPath).length > 0, 'ui/config scan still reports ' + JSON.stringify(text.trim()) + ' in ' + relPath);
  }
  const allowedOnly = [
    [OPTIONS_REL, "  fsbJevFastModeEnabled: false,\n  elements.fsbJevFastModeEnabled = document.getElementById('fsbJevFastModeEnabled');\n"
      + '    fsbJevFastModeEnabled: elements.fsbJevFastModeEnabled?.checked ?? false,\n'],
    [CONFIG_REL, "    { key: 'fsbJevFastModeEnabled', type: 'boolean', cls: 'writable', default: false }\n"
      + '      fsbJevFastModeEnabled: false, // Phase 68: autopilot fast mode, off by default\n'],
    [INIT_REL, '  fsbJevFastModeEnabled: false,\n']
  ];
  for (const [relPath, text] of allowedOnly) {
    check(uiTextHits(text, relPath).length === 0, relPath + ' text whose only jev text is the exact token fsbJevFastModeEnabled is not reported');
  }
  const mixed = uiTextHits('  fsbJevFastModeEnabled: false,\n  // Jev decides\n', OPTIONS_REL);
  check(mixed.length === 1 && mixed[0].line === 2 && mixed[0].match === 'Jev',
    'other jev text in an allowed file is still reported, on its own line, next to the allowed token');

  // Phase 68 D-06 (plan 68-12): in control_panel.html jev text is allowed
  // only on the fast-mode card's lines; options.js, config.js and the rest of
  // control_panel.html stay exactly as strict.
  const cardLines = (body) => '            <div class="settings-card" id="fsbJevFastModeCard">\n'
    + body + '            </div>\n            <!-- /fsbJevFastModeCard -->\n';
  const CARD_BODY = '              <h3>Jev fast mode (experimental)</h3>\n'
    + '              <input type="checkbox" id="fsbJevFastModeEnabled">\n'
    + '              <span class="toggle-label">Use Jev for simple steps</span>\n';
  const PANEL_BEFORE = '            <div class="settings-card">\n              <h3>Action Change Reports</h3>\n            </div>\n\n';
  const PANEL_AFTER = '\n            <div class="settings-card full-width" id="mcpSessionReplaySettings">\n            </div>\n';
  const panelWithCard = PANEL_BEFORE + cardLines(CARD_BODY) + PANEL_AFTER;
  check(uiTextHits(panelWithCard, PANEL_REL).length === 0,
    'control_panel.html jev text on the card lines (start marker through the closing comment) is not reported');
  const probeRange = cardRange(panelWithCard);
  check(probeRange.start === 5 && probeRange.end === 10,
    'the card range is computed from the markers at run time (lines ' + probeRange.start + '..' + probeRange.end + ')');
  const panelReported = [
    ['a Jev word before the card', PANEL_BEFORE + '            <p>Jev decides</p>\n' + cardLines(CARD_BODY) + PANEL_AFTER, false],
    ['a jevX identifier after the card', PANEL_BEFORE + cardLines(CARD_BODY) + '            <script>var jevX = 1;</script>\n' + PANEL_AFTER, false],
    ['the settings token outside the card', PANEL_BEFORE + cardLines(CARD_BODY) + '            <input type="checkbox" id="fsbJevFastModeEnabled">\n' + PANEL_AFTER, false],
    ['a jev comment on the line just before the start marker', PANEL_BEFORE + '            <!-- jev card -->\n' + cardLines(CARD_BODY) + PANEL_AFTER, false],
    ['jev text on the line just after the closing comment', PANEL_BEFORE + cardLines(CARD_BODY) + '            <p>Jev</p>\n' + PANEL_AFTER, false],
    ['a second start marker', PANEL_BEFORE + cardLines(CARD_BODY) + '            <div id="fsbJevFastModeCard"></div>\n' + PANEL_AFTER, true],
    ['a second closing comment', PANEL_BEFORE + cardLines(CARD_BODY) + '            <!-- /fsbJevFastModeCard -->\n' + PANEL_AFTER, true],
    ['a card with no closing comment', PANEL_BEFORE + '            <div class="settings-card" id="fsbJevFastModeCard">\n' + CARD_BODY + '            </div>\n' + PANEL_AFTER, true],
    ['a card with no start marker', PANEL_BEFORE + '            <div class="settings-card">\n' + CARD_BODY + '            </div>\n            <!-- /fsbJevFastModeCard -->\n' + PANEL_AFTER, true],
    ['a closing comment above the start marker', PANEL_BEFORE + '            <!-- /fsbJevFastModeCard -->\n            <div class="settings-card" id="fsbJevFastModeCard">\n' + CARD_BODY + '            </div>\n' + PANEL_AFTER, true],
    ['a card range wider than ' + UI_CARD_MAX_LINES + ' lines', PANEL_BEFORE + cardLines(CARD_BODY + '              <p>filler</p>\n'.repeat(UI_CARD_MAX_LINES)) + PANEL_AFTER, true],
    ['a panel with no card at all (the markers are required)', PANEL_BEFORE + PANEL_AFTER, true]
  ];
  for (const [label, text, rangeError] of panelReported) {
    const hits = uiTextHits(text, PANEL_REL);
    check(hits.length > 0 && hits.some((h) => h.pattern === 'fast-mode card range') === rangeError,
      'control_panel.html scan still reports ' + label + (rangeError ? ' (as a card-range error)' : ''));
  }
  const strictElsewhere = [
    [OPTIONS_REL, '  // Jev\n'],
    [OPTIONS_REL, '  const jevX = 1;\n'],
    [CONFIG_REL, '  // Jev\n'],
    [CONFIG_REL, '  jevX: true,\n'],
    [OPTIONS_REL, cardLines(CARD_BODY)],
    [CONFIG_REL, cardLines(CARD_BODY)],
    [INIT_REL, cardLines(CARD_BODY)],
    ['extension/ui/sidepanel.html', cardLines(CARD_BODY)],
    ['extension/ui/options.css', '/* ' + cardLines(CARD_BODY) + ' */\n']
  ];
  for (const [relPath, text] of strictElsewhere) {
    check(uiTextHits(text, relPath).length > 0,
      'outside control_panel.html the card markers exempt nothing: ' + JSON.stringify(text.trim().split('\n')[0]) + ' is still reported in ' + relPath);
  }

  // Phase 68 (68-04): the fast-path module joins the module list; nothing else moves.
  check(ALL_MODULES.length === 4 && ALL_MODULES[3] === FAST_PATH_MODULE && MODULES.length === 3
    && JSON.stringify(ALL_MODULES.slice(0, 3)) === JSON.stringify(MODULES),
  'ALL_MODULES is the three Phase 67 modules plus jev-fast-path.js, and MODULES keeps the three Phase 67 modules');
  check(findAll('root.FsbFastPath = api; FsbFastPath.toBuilderInput(menu)', CALLER_PATTERN).length === 0
    && findAll('var policy = root.FsbJevPolicy;', CALLER_PATTERN).length === 1,
  'the caller pattern ignores FsbFastPath and still fires on an FsbJev* name');
  const plantedModuleLines = ['chrome.storage.local.get(k)', 'localStorage.getItem(k)', 'cfg.SERVERURL', 'self.importScripts(x)'];
  check(MODULE_PATTERNS.every((p, i) => findAll(plantedModuleLines[i], p).length === 1)
    && findAll("var example = 'https://example.test/x'; // see ws://h:1/", { re: URL_PATTERN }).length === 2,
  'every module ban and the URL scan fire on planted lines, as they do for jev-fast-path.js');

  // Phase 68 D-06 (plan 68-06): the background.js check expects four load
  // lines and allows only the exact, word-bounded tokens elsewhere.
  check(JSON.stringify(BACKGROUND_LOAD_LINES) === JSON.stringify([
    "importScripts('ai/jev-state.js');",
    "importScripts('ai/jev-client.js');",
    "importScripts('ai/jev-policy.js');",
    "importScripts('ai/jev-fast-path.js');"
  ]), 'the background.js check expects the four load lines state, client, policy, fast path');
  const bgBase = ["importScripts('ai/agent-loop.js');", BACKGROUND_DISCOVERY_LINE].concat(BACKGROUND_LOAD_LINES, ['', 'function x() {}']);
  check(backgroundJevClean(bgBase), 'a background.js with exactly the four adjacent load lines passes');
  check(JSON.stringify(BACKGROUND_JEV_TOKENS) === JSON.stringify(['fsbJevFastModeEnabled', 'getJevMenu', 'fsbJevCaptureArmed', 'fsbJevCaptureRing', 'jevCaptureObservation']),
    'the background.js token allowlist is exactly fsbJevFastModeEnabled, getJevMenu, fsbJevCaptureArmed, fsbJevCaptureRing and jevCaptureObservation');
  const bgAllowed = [
    "    const stored = await chrome.storage.local.get(['fsbJevFastModeEnabled']);",
    "    requestMenu: (tabId, options, deadlineMs) => send(tabId, { action: 'getJevMenu', options }, deadlineMs),",
    "    const field = fsbFastModeSessionField(storedSettings.fsbJevFastModeEnabled, source);",
    "      { maxIterations: 100, fsbJevFastModeEnabled: false, other: 'getJevMenu' }",
    "        read = chrome.storage.local.get(['fsbJevCaptureArmed']);",
    "    await fsbFastPathWithDeadline(chrome.storage.local.set({ fsbJevCaptureRing: ring }), 3000);",
    "    case 'jevCaptureObservation': {"
  ];
  for (const line of bgAllowed) {
    check(backgroundJevClean(bgBase.concat([line])), 'background.js line passes: ' + JSON.stringify(line.trim()));
  }
  const bgReported = [
    '// Jev fast mode',
    '  fsbJevOther: true,',
    "  sendMessage(tabId, { action: 'getJevMenuX' });",
    "  sendMessage(tabId, { action: 'xgetJevMenu' });",
    "  const k = 'fsbJevFastModeEnabledX';",
    "  chrome.storage.local.get(['fsbJevFastModeEnabled']); // jev switch",
    '  const jevFast = true;',
    "importScripts('ai/jev-extra.js');",
    "  const k = 'fsbJevCaptureOther';",
    "  chrome.storage.local.get(['fsbJevCaptureArmedX']);",
    "  case 'xjevCaptureObservation': {",
    '  // jev capture',
    "  const ring = await chrome.storage.local.get(['fsbJevCaptureRing']); // jev capture ring",
    '  const captureJev = null;'
  ];
  for (const line of bgReported) {
    check(!backgroundJevClean(bgBase.concat([line])), 'background.js line is still reported: ' + JSON.stringify(line.trim()));
  }
  const fifthLoad = ["importScripts('ai/agent-loop.js');", BACKGROUND_DISCOVERY_LINE].concat(BACKGROUND_LOAD_LINES, ["importScripts('ai/jev-extra.js');"]);
  check(!backgroundJevClean(fifthLoad), 'a fifth adjacent jev load line is still reported');
  const threeLoads = ["importScripts('ai/agent-loop.js');", BACKGROUND_DISCOVERY_LINE].concat(BACKGROUND_LOAD_LINES.slice(0, 3));
  check(!backgroundJevClean(threeLoads), 'a background.js missing the fast-path load line is reported');
  const gap = ["importScripts('ai/agent-loop.js');", BACKGROUND_DISCOVERY_LINE, ''].concat(BACKGROUND_LOAD_LINES);
  check(!backgroundJevClean(gap), 'a line between ai/model-discovery.js and the loads is reported');
  const reordered = [BACKGROUND_DISCOVERY_LINE].concat([BACKGROUND_LOAD_LINES[0], BACKGROUND_LOAD_LINES[1], BACKGROUND_LOAD_LINES[3], BACKGROUND_LOAD_LINES[2]]);
  check(!backgroundJevClean(reordered), 'the four loads out of order are reported');
}

function treeScan(files) {
  console.log('\n--- extension/ tree scan: no upstream path, no JEV_* credential name (D-01, D-09, D-22) ---');
  const violations = [];
  const skipped = [];
  let binaries = 0;
  let openrouterFiles = 0;
  for (const file of files) {
    const read = readForScan(file);
    if (read.skipped) { skipped.push(rel(file) + ' (' + read.size + ' bytes)'); continue; }
    if (read.binary) binaries += 1;
    if (read.text.indexOf('openrouter.ai') !== -1) openrouterFiles += 1;
    for (const pattern of TREE_PATTERNS) {
      for (const hit of findAll(read.text, pattern)) {
        violations.push({ file: rel(file), line: hit.line, pattern: pattern.name, match: hit.match });
      }
    }
  }
  console.log('  files scanned: ' + files.length + ' (' + binaries + ' binary, read as latin1; ' + skipped.length + ' over 5 MB skipped)');
  if (skipped.length) console.log('  skipped: ' + skipped.join(', '));
  console.log('  openrouter.ai appears in ' + openrouterFiles + ' file(s); it is allowed (existing chat provider)');
  check(files.length > 100, 'scanned more than 100 files under extension/ (' + files.length + ')');
  const relFiles = files.map(rel);
  check(relFiles.includes('extension/background.js') && JEV_REL_PATHS.every((p) => relFiles.includes(p)),
    'the walk covers extension/background.js and all four jev modules');
  report(violations, 'tree');
  check(violations.length === 0, 'no systemone, api.typesafe.ai or JEV_* name anywhere under extension/ (' + violations.length + ' violation(s))');
}

function moduleScan() {
  console.log('\n--- extension/ai/jev-*.js: no storage, no serverUrl, one fixed endpoint (D-01, D-09) ---');
  const present = fs.readdirSync(AI_DIR).filter((name) => /^jev-.*\.js$/.test(name)).sort();
  check(JSON.stringify(present) === JSON.stringify(ALL_MODULES.map((m) => m.file).slice().sort()),
    'extension/ai holds exactly jev-client.js, jev-fast-path.js, jev-policy.js and jev-state.js (' + present.join(', ') + ')');

  const violations = [];
  const urls = [];
  for (const mod of ALL_MODULES) {
    const file = path.join(AI_DIR, mod.file);
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of MODULE_PATTERNS) {
      for (const hit of findAll(text, pattern)) {
        violations.push({ file: rel(file), line: hit.line, pattern: pattern.name, match: hit.match });
      }
    }
    for (const hit of findAll(text, { re: URL_PATTERN })) urls.push({ file: mod.file, line: hit.line, url: hit.match });
  }
  report(violations, 'module');
  check(violations.length === 0, 'jev-*.js contain no chrome.storage, localStorage, serverUrl or importScripts (' + violations.length + ' violation(s))');
  for (const u of urls) console.log('  url: ' + u.file + ':' + u.line + ' ' + u.url);
  check(urls.length === 1, 'jev-*.js contain exactly one URL literal (' + urls.length + ')');
  check(urls.length === 1 && urls[0].file === 'jev-client.js' && urls[0].url === ENDPOINT,
    'that URL is ' + ENDPOINT + ', in jev-client.js');
}

function callerScan(files) {
  console.log('\n--- no caller: FsbJev* names live only in extension/ai/jev-*.js (D-01, D-17) ---');
  const violations = [];
  for (const file of files) {
    const relPath = rel(file);
    if (JEV_REL_PATHS.includes(relPath)) continue;
    const read = readForScan(file);
    if (read.skipped) continue;
    for (const hit of findAll(read.text, CALLER_PATTERN)) {
      violations.push({ file: relPath, line: hit.line, pattern: CALLER_PATTERN.name, match: hit.match });
    }
  }
  report(violations, 'caller');
  check(violations.length === 0, 'no file outside extension/ai/jev-*.js names FsbJevState, FsbJevClient or FsbJevPolicy (' + violations.length + ' violation(s))');

  // background.js names the four file names only in its four load lines;
  // every other jev mention must sit inside an exact BACKGROUND_JEV_TOKENS
  // token (Phase 68 D-06, plan 68-06).
  const bgLines = fs.readFileSync(path.join(EXT_DIR, 'background.js'), 'utf8').split('\n');
  const jevLines = backgroundJevLines(bgLines);
  for (const l of jevLines) {
    if (BACKGROUND_LOAD_LINES.indexOf(l.text) === -1) console.error('    - extension/background.js:' + (l.index + 1) + ' -- ' + JSON.stringify(l.text.trim()));
  }
  check(JSON.stringify(jevLines.map((l) => l.text)) === JSON.stringify(BACKGROUND_LOAD_LINES),
    'background.js mentions jev only in the four load lines (state, client, policy, fast path) and inside the exact tokens ' + BACKGROUND_JEV_TOKENS.join(', '));
  const discovery = bgLines.indexOf(BACKGROUND_DISCOVERY_LINE);
  check(discovery >= 0 && jevLines.length === 4 && jevLines.every((l, k) => l.index === discovery + 1 + k),
    'the four loads sit directly after ai/model-discovery.js with no line between them');
  check(backgroundJevClean(bgLines), 'background.js passes the combined load-line and token check');
}

function uiConfigScan() {
  console.log('\n--- no Jev setting, storage key or UI in extension/ui or extension/config (D-01) ---');
  const files = walkFiles(path.join(EXT_DIR, 'ui'), []).concat(walkFiles(path.join(EXT_DIR, 'config'), []));
  const violations = [];
  const tokenFiles = [];
  let textFiles = 0;
  for (const file of files) {
    const read = readForScan(file);
    if (read.skipped) continue;
    const relPath = rel(file);
    // Text files: any jev substring (catches a jevFastMode-style key too),
    // after the Phase 68 D-06 token allowlist in its three files only and,
    // in control_panel.html, outside the fast-mode card's lines only.
    // Binaries: the word only, so random compressed bytes cannot trip it.
    const pattern = read.binary ? UI_WORD_PATTERN : UI_TEXT_PATTERN;
    if (!read.binary) textFiles += 1;
    const hits = read.binary ? findAll(read.text, pattern) : uiTextHits(read.text, relPath);
    for (const hit of hits) {
      violations.push({ file: relPath, line: hit.line, pattern: hit.pattern || pattern.name, match: hit.match });
    }
    if (UI_CONFIG_JEV_TOKENS.some((token) => read.text.indexOf(token) !== -1)) tokenFiles.push(relPath);
  }
  console.log('  ui/config files scanned: ' + files.length + ' (' + textFiles + ' text)');
  check(files.length > 0, 'extension/ui and extension/config hold files to scan');
  const panelPath = path.join(ROOT, UI_CARD_FILE);
  const panelRange = fs.existsSync(panelPath) ? cardRange(fs.readFileSync(panelPath, 'utf8')) : { error: UI_CARD_FILE + ' is missing' };
  check(!panelRange.error, UI_CARD_FILE + ' holds exactly one fast-mode card range, at most ' + UI_CARD_MAX_LINES + ' lines ('
    + (panelRange.error || 'lines ' + panelRange.start + '..' + panelRange.end) + ')');
  report(violations, 'ui/config');
  check(violations.length === 0, 'nothing under extension/ui or extension/config mentions jev apart from the allowed settings key and the fast-mode card (' + violations.length + ' violation(s))');
  console.log('  files holding an allowed token: ' + (tokenFiles.join(', ') || 'none'));
  check(tokenFiles.every((relPath) => UI_CONFIG_TOKEN_FILES.includes(relPath)),
    'the files under extension/ui and extension/config that hold fsbJevFastModeEnabled are a subset of config.js, init-config.js, options.js and control_panel.html');
}

// ---------------------------------------------------------------------------
// vm inert-load proofs
// ---------------------------------------------------------------------------

/**
 * A bare context: console (recording), TextEncoder, URL and timer spies.
 * No chrome, no fetch, no require, no module, no AbortController.
 */
function bareContext() {
  const timerCalls = [];
  const logCalls = [];
  const spy = (name, sink) => function spyFn() { sink.push(name); return 0; };
  const recordingConsole = {};
  for (const level of ['log', 'info', 'warn', 'error', 'debug', 'trace']) recordingConsole[level] = spy('console.' + level, logCalls);
  const sandbox = {
    console: recordingConsole,
    TextEncoder: TextEncoder,
    URL: URL,
    setTimeout: spy('setTimeout', timerCalls),
    setInterval: spy('setInterval', timerCalls),
    clearTimeout: spy('clearTimeout', timerCalls),
    clearInterval: spy('clearInterval', timerCalls)
  };
  const context = vm.createContext(sandbox);
  return { context, timerCalls, logCalls };
}

/**
 * The same, plus read traps on every browser, network and storage global.
 * Any read at load is recorded (the trap value itself is undefined).
 */
function trappedContext() {
  const base = bareContext();
  const reads = [];
  for (const name of ['chrome', 'browser', 'fetch', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'sessionStorage',
    'indexedDB', 'caches', 'navigator', 'importScripts', 'require', 'module', 'process', 'AbortController']) {
    Object.defineProperty(base.context, name, { configurable: true, enumerable: true, get() { reads.push(name); return undefined; } });
  }
  return Object.assign(base, { reads });
}

function innerGlobalNames(context) {
  return vm.runInContext('Object.getOwnPropertyNames(globalThis)', context).slice().sort();
}

function load(context, mod) {
  const source = fs.readFileSync(path.join(AI_DIR, mod.file), 'utf8');
  try {
    vm.runInContext(source, context, { filename: 'extension/ai/' + mod.file });
    return null;
  } catch (error) {
    return error;
  }
}

function added(before, after) {
  return after.filter((name) => !before.includes(name)).sort();
}

function removed(before, after) {
  return before.filter((name) => !after.includes(name)).sort();
}

function inertAlone() {
  console.log('\n--- each module alone in a bare vm context: one global, no timer, no log, no throw (D-17) ---');
  for (const mod of ALL_MODULES) {
    const { context, timerCalls, logCalls } = bareContext();
    const keysBefore = Object.keys(context);
    const innerBefore = innerGlobalNames(context);
    const error = load(context, mod);
    check(error === null, mod.file + ' evaluates without throwing' + (error ? ' (' + error.message + ')' : ''));
    check(JSON.stringify(added(keysBefore, Object.keys(context))) === JSON.stringify([mod.global])
      && removed(keysBefore, Object.keys(context)).length === 0,
    mod.file + ' adds exactly ' + mod.global + ' to the context keys (added: ' + added(keysBefore, Object.keys(context)).join(', ') + ')');
    check(JSON.stringify(added(innerBefore, innerGlobalNames(context))) === JSON.stringify([mod.global]),
      mod.file + ' adds exactly ' + mod.global + ' to the inner global object');
    check(timerCalls.length === 0, mod.file + ' makes zero timer calls at load (' + timerCalls.join(', ') + ')');
    check(logCalls.length === 0, mod.file + ' logs nothing at load (' + logCalls.join(', ') + ')');
    const exported = context[mod.global];
    check(exported !== null && typeof exported === 'object', mod.global + ' is an object');
  }
}

function inertTrapped() {
  console.log('\n--- each module alone with read traps on browser, network and storage globals (D-17) ---');
  for (const mod of ALL_MODULES) {
    const { context, timerCalls, reads } = trappedContext();
    const keysBefore = Object.keys(context);
    const error = load(context, mod);
    check(error === null, mod.file + ' evaluates without throwing under read traps' + (error ? ' (' + error.message + ')' : ''));
    check(JSON.stringify(added(keysBefore, Object.keys(context))) === JSON.stringify([mod.global]),
      mod.file + ' still adds exactly ' + mod.global);
    const loadReads = reads.filter((name) => name !== 'module');
    check(loadReads.length === 0, mod.file + ' reads no chrome, fetch, storage, navigator or require global at load (' + loadReads.join(', ') + ')');
    check(timerCalls.length === 0, mod.file + ' makes zero timer calls at load under read traps');
  }
}

function sharedContext() {
  const ctx = bareContext();
  const keysBefore = Object.keys(ctx.context);
  const innerBefore = innerGlobalNames(ctx.context);
  const errors = ALL_MODULES.map((mod) => load(ctx.context, mod));
  return Object.assign(ctx, { keysBefore, innerBefore, errors });
}

function inertTogether() {
  console.log('\n--- all four in load order in one shared context: exactly the four Fsb* globals (D-17) ---');
  const { context, timerCalls, logCalls, keysBefore, innerBefore, errors } = sharedContext();
  check(errors.every((e) => e === null), 'state, client, policy and the fast path evaluate in order without throwing'
    + (errors.some(Boolean) ? ' (' + errors.filter(Boolean).map((e) => e.message).join('; ') + ')' : ''));
  const keysAdded = added(keysBefore, Object.keys(context));
  check(JSON.stringify(keysAdded) === JSON.stringify(JEV_GLOBALS.slice().sort()),
    'the shared context gains exactly FsbFastPath, FsbJevClient, FsbJevPolicy and FsbJevState (added: ' + keysAdded.join(', ') + ')');
  check(removed(keysBefore, Object.keys(context)).length === 0, 'no context key is removed or replaced away');
  const innerAdded = added(innerBefore, innerGlobalNames(context));
  check(JSON.stringify(innerAdded) === JSON.stringify(JEV_GLOBALS.slice().sort()),
    'the inner global object gains exactly the four Fsb* names and nothing else (added: ' + innerAdded.join(', ') + ')');
  check(timerCalls.length === 0, 'loading all four makes zero timer calls');
  check(logCalls.length === 0, 'loading all four logs nothing');
  for (const name of ['TextEncoder', 'URL', 'setTimeout', 'setInterval', 'console']) {
    check(vm.runInContext('typeof ' + name, context) !== 'undefined', 'the shared context still has its own ' + name);
  }
  check(context.FsbJevClient.ENDPOINT === ENDPOINT, 'FsbJevClient.ENDPOINT is the fixed ' + ENDPOINT);
}

function isInvalidRequestFallback(result) {
  return result !== null && typeof result === 'object'
    && JSON.stringify(Object.keys(result).sort()) === JSON.stringify(['fallback', 'httpStatus', 'latencyMs', 'ok', 'servedModel'])
    && result.ok === false
    && result.fallback === 'invalid_request'
    && result.servedModel === null
    && result.httpStatus === null;
}

async function decideWithoutFetch() {
  console.log('\n--- in the vm context: a client is created and an invalid request never reaches fetch (D-17) ---');
  const INVALID_REQUESTS = [
    ['undefined', undefined],
    ['null', null],
    ['a string', 'decide'],
    ['an empty object', {}],
    ['an array', []],
    ['a request with an unknown key', { v: 1, kinds: ['operation'], goal: 'x', model: 'override' }]
  ];

  const scenarios = [
    { label: 'shared context (state loaded)', build: () => sharedContext() },
    {
      label: 'client alone (no FsbJevState)',
      build: () => {
        const ctx = bareContext();
        const error = load(ctx.context, MODULES[1]);
        return Object.assign(ctx, { errors: [error] });
      }
    }
  ];

  for (const scenario of scenarios) {
    const { context, timerCalls, logCalls, errors } = scenario.build();
    check(errors.every((e) => e === null), scenario.label + ': modules load');
    const fetchCalls = [];
    const fetchSpy = function fetchSpy() { fetchCalls.push(Array.from(arguments)); return Promise.reject(new Error('unexpected fetch')); };

    let created = null;
    let injected = null;
    let createError = null;
    try {
      created = context.FsbJevClient.createJevClient();
      injected = context.FsbJevClient.createJevClient({ fetchImpl: fetchSpy });
    } catch (error) {
      createError = error;
    }
    check(createError === null && created && typeof created.decide === 'function' && typeof created.resetCooldown === 'function'
      && injected && typeof injected.decide === 'function',
    scenario.label + ': createJevClient() returns {decide, resetCooldown} without throwing');
    check(fetchCalls.length === 0 && timerCalls.length === 0, scenario.label + ': creating clients calls no fetch and no timer');

    const deciders = [
      ['createJevClient()', created && created.decide],
      ['createJevClient({fetchImpl: spy})', injected && injected.decide],
      ['the default FsbJevClient.decide', context.FsbJevClient.decide]
    ];
    for (const [deciderLabel, decide] of deciders) {
      for (const [requestLabel, request] of INVALID_REQUESTS) {
        let result = null;
        let rejected = null;
        try {
          result = await decide(request);
        } catch (error) {
          rejected = error;
        }
        check(rejected === null && isInvalidRequestFallback(result),
          scenario.label + ': ' + deciderLabel + ' answers ' + requestLabel + ' with {ok:false, fallback:\'invalid_request\'} (got '
          + (rejected ? 'rejection ' + rejected.message : JSON.stringify(result)) + ')');
      }
    }
    check(fetchCalls.length === 0, scenario.label + ': fetch was never called (' + fetchCalls.length + ')');
    check(timerCalls.length === 0, scenario.label + ': no timer was armed for a local answer (' + timerCalls.join(', ') + ')');
    check(logCalls.length === 0, scenario.label + ': nothing was logged (' + logCalls.join(', ') + ')');
    check(vm.runInContext("typeof fetch === 'undefined' && typeof chrome === 'undefined' && typeof require === 'undefined' && typeof module === 'undefined'", context),
      scenario.label + ': the context still has no fetch, chrome, require or module');
  }
}

async function main() {
  console.log('Phase 67 Plan 11 -- Jev extension boundary (D-01, D-09, D-17, D-22)');
  scannerSelfTest();
  const files = walkFiles(EXT_DIR, []);
  treeScan(files);
  moduleScan();
  callerScan(files);
  uiConfigScan();
  inertAlone();
  inertTrapped();
  inertTogether();
  await decideWithoutFetch();

  console.log('\n--- Summary ---');
  console.log('files scanned: ' + files.length);
  console.log('passed: ' + passed);
  console.log('failed: ' + failed);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error('FAIL: unexpected error: ' + (error && error.stack ? error.stack : error));
  process.exitCode = 1;
});
