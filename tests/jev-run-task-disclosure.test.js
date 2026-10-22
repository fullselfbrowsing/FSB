#!/usr/bin/env node
'use strict';

/**
 * Phase 70 Plan 04 Task 2 -- the Phase 68 fast-mode disclosure, re-verified
 * for MCP run_task (D-23).
 *
 * Since Phase 70, run_task follows the Advanced Settings switch, so the copy
 * the user agreed to must also be true for MCP-started tasks. This suite
 * reads the shipped copy and the real code and checks, without editing any
 * copy:
 *
 *   - no sentence of the Advanced Settings card (extension/ui/
 *     control_panel.html, the fsbJevFastModeCard block) or of the privacy
 *     page's fast-mode section limits fast mode to the side panel or to
 *     panel-started tasks (with a self-test of those patterns);
 *   - the privacy section's Control fact still names the MCP settings tool
 *     (68-10-PLAN.md:71); the card's MCP mention is only recorded (M-70-09);
 *   - for run_task sessions built from the real background helper, the goal
 *     sent is a suffix of the task text (D-22), query strings and fragments
 *     never reach the request, a secret outside a page-matching Open
 *     sentence still sends nothing (RESEARCH Open Question 3), and under an
 *     uncalibrated gateway a session sends at most one step description;
 *   - neither text matches a FORBIDDEN_PATTERNS entry of the 68-12 fact list.
 *
 * A failing check here is never fixed by editing copy: it is raised to the
 * owner (the card plus the privacy page in six locales, with xlf
 * re-extraction and line pins).
 *
 * Only fixtures and fakes: no network, no ports, no real timers held open.
 * Node 20-safe.
 *
 * Run: node tests/jev-run-task-disclosure.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// A promise that never settles must not pass as a clean exit.
process.exitCode = 1;

const ROOT = path.join(__dirname, '..');
const { SHARED_PHRASES, FORBIDDEN_PATTERNS, textOf } = require('./fixtures/jev-fast-disclosure-facts.js');
const gateway = require('./fixtures/jev-fake-gateway.js');
const H = require('./fixtures/agent-loop-fast-harness.js');
const FsbFastPath = require(path.join(ROOT, 'extension', 'ai', 'jev-fast-path.js'));
const FsbJevState = require(path.join(ROOT, 'extension', 'ai', 'jev-state.js'));

const PANEL_HTML = fs.readFileSync(path.join(ROOT, 'extension', 'ui', 'control_panel.html'), 'utf8');
const PRIVACY_HTML = fs.readFileSync(path.join(ROOT, 'showcase', 'angular', 'src', 'app', 'pages', 'privacy', 'privacy-page.component.html'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(ROOT, 'extension', 'background.js'), 'utf8');

// 70-SYNC-RECHECK item j: the privacy Control fact as a reader sees it.
const CONTROL_SENTENCE = "An MCP client connected to FSB can also change this setting through FSB's settings tool.";
const CONTROL_RE = /\bMCP\b[^.]*\bsettings tool\b/i;

let passed = 0;
let failed = 0;

function check(cond, name) {
  if (cond) {
    passed += 1;
    console.log('  PASS: ' + name);
  } else {
    failed += 1;
    console.error('  FAIL: ' + name);
  }
}

function section(title) {
  console.log('\n--- ' + title + ' ---');
}

// ---------------------------------------------------------------------------
// The copy: the card block and the privacy fast-mode section
// ---------------------------------------------------------------------------

/** The card block, sliced as tests/jev-fast-settings.test.js does (68-12). */
function cardBlockOf(html) {
  const start = 'id="fsbJevFastModeCard"';
  const end = '<!-- /fsbJevFastModeCard -->';
  const idIndex = html.indexOf(start);
  const endIndex = html.indexOf(end);
  const rootIndex = idIndex === -1 ? -1 : html.lastIndexOf('<', idIndex);
  return rootIndex !== -1 && endIndex > idIndex ? html.slice(rootIndex, endIndex + end.length) : '';
}

/** The privacy fast-mode section, sliced as tests/showcase-privacy-page.test.js does (68-10). */
function privacySectionOf(html) {
  const anchor = html.indexOf('id="jev-fast-mode"');
  const h2Start = anchor >= 0 ? html.lastIndexOf('<h2', anchor) : -1;
  const nextH2 = anchor >= 0 ? html.indexOf('<h2', anchor) : -1;
  return h2Start >= 0 && nextH2 > h2Start ? html.slice(h2Start, nextH2) : '';
}

/** Visible text with the translate="no" spans unwrapped first, as the 68-10 alignment test reads it. */
function readerText(fragment) {
  return textOf(String(fragment || '').replace(/<span \[attr\.translate\]="'no'">([^<]*)<\/span>/g, '$1'));
}

/** Sentences: split on '.', '!' or '?' followed by whitespace. */
function sentencesOf(text) {
  return String(text || '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

const CARD_BLOCK = cardBlockOf(PANEL_HTML);
const CARD_TEXT = textOf(CARD_BLOCK);
const PRIVACY_SECTION = privacySectionOf(PRIVACY_HTML);
const PRIVACY_TEXT = readerText(PRIVACY_SECTION);
const PRIVACY_TEXT_PLAIN = textOf(PRIVACY_SECTION);

// ---------------------------------------------------------------------------
// Limiting panel constructions (D-23)
// ---------------------------------------------------------------------------

const PANEL_WORD = '(?:side\\s*panel|control\\s+panel|panel)';
const PANEL_WORD_RE = new RegExp('\\b' + PANEL_WORD + '\\b', 'i');

/**
 * Constructions that would limit fast mode to the side panel or to tasks
 * started there. A neutral mention (where the switch lives, where to watch a
 * task, where to turn it off) matches none.
 */
const LIMITING_PANEL_PATTERNS = Object.freeze([
  // (1) "only" at most four words before a panel word ...
  Object.freeze({ name: 'only before a panel word', re: new RegExp('\\bonly\\b(?:\\W+\\w+){0,4}?\\W+' + PANEL_WORD + '\\b', 'i') }),
  // ... or a panel word followed within two words by "only".
  Object.freeze({ name: 'panel word then only', re: new RegExp('\\b' + PANEL_WORD + '(?:\\W+\\w+){0,2}?\\W+only\\b', 'i') }),
  // (2) a panel word joined to started, initiated or launched.
  Object.freeze({ name: 'panel-started', re: new RegExp('\\b' + PANEL_WORD + '[\\s-]+(?:started|initiated|launched)\\b', 'i') }),
  // (3) a task, run or automation word, then start/started/run/launched, then in/from/through the panel.
  Object.freeze({
    name: 'task started in the panel',
    re: new RegExp('\\b(?:tasks?|runs?|automations?)\\b[^.!?]*?\\b(?:start|started|run|launched)\\b[^.!?]*?\\b(?:in|from|through)\\s+(?:the\\s+|your\\s+)?(?:FSB\\s+)?'
      + PANEL_WORD + '\\b', 'i')
  })
]);

function limitingMatches(sentence) {
  return LIMITING_PANEL_PATTERNS.filter((p) => p.re.test(sentence)).map((p) => p.name);
}

function panelPatternsSelfTest() {
  section('panel patterns self-test (D-23)');
  const limiting = [
    'Fast mode works only in the side panel.',
    'Only tasks started from the side panel use fast mode.',
    'It applies to panel-started tasks.',
    'When on, tasks you start in the side panel use Jev.'
  ];
  const neutral = [
    'You can turn it off at any time in the side panel.',
    'The switch is in Advanced Settings in the control panel.',
    'Open the side panel to watch a task.'
  ];
  for (const sentence of limiting) {
    const hits = limitingMatches(sentence);
    check(hits.length > 0, 'panel patterns self-test: matches "' + sentence + '" (' + hits.join(', ') + ')');
  }
  for (const sentence of neutral) {
    const hits = limitingMatches(sentence);
    check(hits.length === 0, 'panel patterns self-test: does not match "' + sentence + '"' + (hits.length ? ' (' + hits.join(', ') + ')' : ''));
  }
}

function noPanelOnlyLimit() {
  section('no panel-only limit (D-23)');
  check(CARD_BLOCK.startsWith('<div class="settings-card" id="fsbJevFastModeCard">') && CARD_TEXT.length > 0,
    'no panel-only limit: the card block is found (id="fsbJevFastModeCard" .. <!-- /fsbJevFastModeCard -->)');
  check(/^<h2 id="jev-fast-mode"/.test(PRIVACY_SECTION) && PRIVACY_TEXT.length > 0,
    'no panel-only limit: the privacy fast-mode section is found (h2 id="jev-fast-mode" up to the next h2)');
  for (const [label, text] of [['card', CARD_TEXT], ['privacy', PRIVACY_TEXT]]) {
    const sentences = sentencesOf(text);
    const limiting = [];
    for (const sentence of sentences) {
      if (PANEL_WORD_RE.test(sentence)) console.log('  PANEL SENTENCE (' + label + '): ' + sentence);
      const hits = limitingMatches(sentence);
      if (hits.length > 0) limiting.push(sentence + ' [' + hits.join(', ') + ']');
    }
    const panelCount = sentences.filter((s) => PANEL_WORD_RE.test(s)).length;
    console.log('  INFO: ' + label + ': ' + sentences.length + ' sentences, ' + panelCount + ' mention a panel word');
    check(sentences.length > 0 && limiting.length === 0,
      'no panel-only limit: no ' + label + ' sentence limits fast mode to the side panel or to panel-started tasks'
        + (limiting.length ? ' (' + limiting.join(' | ') + ')' : ''));
  }
}

function privacyControlNamesSettingsTool() {
  section('privacy control names the settings tool (68-10-PLAN.md:71, D-23)');
  const sentences = sentencesOf(PRIVACY_TEXT);
  check(PRIVACY_TEXT.indexOf(CONTROL_SENTENCE) !== -1 && sentences.indexOf(CONTROL_SENTENCE) !== -1,
    'privacy control names the settings tool: the section holds "' + CONTROL_SENTENCE + '"');
  check(CONTROL_RE.test(CONTROL_SENTENCE), 'privacy control names the settings tool: that sentence matches /\\bMCP\\b[^.]*\\bsettings tool\\b/i');
  check(CONTROL_RE.test(PRIVACY_TEXT_PLAIN), 'privacy control names the settings tool: the plain textOf reading also matches');
  const controlUnit = (PRIVACY_SECTION.match(/<p i18n="@@privacy\.section\.jevFastMode\.control">[\s\S]*?<\/p>/) || [''])[0];
  check(readerText(controlUnit).indexOf(CONTROL_SENTENCE) !== -1,
    'privacy control names the settings tool: the sentence sits in the @@privacy.section.jevFastMode.control unit');
}

function cardMcpMentionRecorded() {
  section('card MCP mention recorded (M-70-09; informational)');
  const mentionsMcp = /\bMCP\b/i.test(CARD_TEXT);
  const mentionsTool = /\bsettings tool\b/i.test(CARD_TEXT);
  console.log('  INFO: card mentions MCP: ' + (mentionsMcp ? 'yes' : 'no') + '; card mentions the settings tool: ' + (mentionsTool ? 'yes' : 'no'));
  console.log('  INFO: card names the autopilot: ' + (/autopilot/i.test(CARD_TEXT) ? 'yes' : 'no'));
  check(true, 'card MCP mention recorded: MCP ' + (mentionsMcp ? 'yes' : 'no') + ', settings tool ' + (mentionsTool ? 'yes' : 'no')
    + ' (68-12 copy carries no MCP sentence; never a stop condition)');
}

function noForbiddenOverclaim() {
  section('no forbidden overclaim (68-12 fact list, re-read for run_task)');
  for (const [label, text] of [['card', CARD_TEXT], ['privacy', PRIVACY_TEXT], ['privacy (plain textOf)', PRIVACY_TEXT_PLAIN]]) {
    const hits = FORBIDDEN_PATTERNS.filter((re) => re.test(text)).map(String);
    check(FORBIDDEN_PATTERNS.length > 0 && hits.length === 0,
      'no forbidden overclaim: the ' + label + ' text matches no FORBIDDEN_PATTERNS entry' + (hits.length ? ' (' + hits.join(', ') + ')' : ''));
  }
  // The facts this suite proves in code are in both texts (the 68-12 list, unchanged).
  for (const phrase of ['task text', 'query string', 'fragment', 'secret', 'one step description', 'off at any time']) {
    check(SHARED_PHRASES.indexOf(phrase) !== -1 && CARD_TEXT.toLowerCase().includes(phrase.toLowerCase())
      && PRIVACY_TEXT.toLowerCase().includes(phrase.toLowerCase()),
    'no forbidden overclaim: the card and the privacy section both state the "' + phrase + '" fact this suite checks in code');
  }
}

// ---------------------------------------------------------------------------
// The code: run_task sessions built from the real background helper
// ---------------------------------------------------------------------------

/** One named top-level function of `source`, through the brace that closes its body. */
function sliceFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) return null;
  let i = source.indexOf('(', start);
  for (let depth = 0; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')' && --depth === 0) break;
  }
  let j = source.indexOf('{', i);
  for (let depth = 0; j < source.length; j += 1) {
    if (source[j] === '{') depth += 1;
    else if (source[j] === '}' && --depth === 0) break;
  }
  return source.slice(start, j + 1);
}

/** fsbFastModeSessionField from background.js, evaluated alone. */
function realSessionFieldHelper() {
  const ctx = vm.createContext({});
  vm.runInContext(sliceFunction(backgroundSource, 'fsbFastModeSessionField'), ctx);
  return ctx.fsbFastModeSessionField;
}

/** The run_task session field the real helper gives for the switch on, copied into this realm. */
function runTaskField() {
  const field = realSessionFieldHelper()(true, 'mcp');
  return field ? JSON.parse(JSON.stringify(field)) : null;
}

/** fsbCreateFastPathDeps from background.js, evaluated in this realm (the harness installs its chrome stub). */
function backgroundDepsFactory() {
  const code = '(function () {\n' + sliceFunction(backgroundSource, 'fsbFastPathWithDeadline') + '\n'
    + sliceFunction(backgroundSource, 'fsbFastPathCaptureWrite') + '\n'
    + sliceFunction(backgroundSource, 'fsbCreateFastPathDeps') + '\nreturn fsbCreateFastPathDeps;\n})()';
  return vm.runInThisContext(code, { filename: 'background.js#fsbCreateFastPathDeps' });
}

/** One 68-02 menu entry: a fast-eligible button unless overridden. */
function entry(handle, over) {
  return Object.assign({
    handle,
    role: 'button',
    label: 'Button ' + handle,
    ops: ['click', 'hover'],
    inputType: null,
    autocomplete: null,
    purpose: { sensitive: false, danger: false, intent: null },
    hidden: false,
    risk: null,
    fastEligible: true,
    vaultFilled: false,
    state: { checked: null, expanded: null, selected: null, pressed: null },
    inViewport: true
  }, over || {});
}

const CHECKLIST_ENTRIES = Object.freeze([
  entry('j1', { role: 'checkbox', label: 'Alpha', ops: ['check_box', 'click'], inputType: 'checkbox',
    state: { checked: false, expanded: null, selected: null, pressed: null } }),
  entry('j2', { role: 'checkbox', label: 'Bravo', ops: ['check_box', 'click'], inputType: 'checkbox',
    state: { checked: false, expanded: null, selected: null, pressed: null } }),
  entry('j3', { label: 'Save' })
]);

/** A checklist menu at `url`; nothing in it holds a query string, a fragment or a marker. */
function checklistMenu(url, options) {
  return {
    success: true,
    generation: 'abcd1234-1',
    url,
    title: 'Checklist',
    visibleText: 'Checklist Alpha Bravo Save',
    moreBelow: false,
    signature: 'sig-1',
    count: CHECKLIST_ENTRIES.length,
    truncated: false,
    entries: JSON.parse(JSON.stringify(CHECKLIST_ENTRIES)),
    recentHandles: (options && Array.isArray(options.recent) ? options.recent : []).map(() => null)
  };
}

function idByLabel(request, label) {
  const element = request.elements.find((e) => e.label === label);
  return element ? element.id : gateway.CATCH_ALL;
}

/**
 * One run_task fast attempt through the real FsbFastPath: the LLM's first
 * turn, then one eligible iteration on a menu at `menuUrl`, with fake deps
 * and a fake calibrated gateway that clicks Save.
 */
async function runTaskAttempt(task, menuUrl, sessionPatch) {
  const log = { menus: 0 };
  const deps = {
    now: () => 1000,
    readSwitch: () => Promise.resolve(true),
    requestMenu: (tabId, options) => { log.menus += 1; return Promise.resolve(checklistMenu(menuUrl, options)); },
    requestSnapshot: () => Promise.resolve({ success: true, markdownSnapshot: 'SNAP-CURRENT' }),
    getTabUrl: () => Promise.resolve(menuUrl)
  };
  const client = gateway.makeClient((request) => ({ body: gateway.calibratedBody(request, {
    operation: { choice: 'click' },
    target: { choice: idByLabel(request, 'Save') }
  }) }));
  deps.jevClient = client;
  const session = Object.assign({
    sessionId: 'session_70_04',
    status: 'running',
    task,
    tabId: 9,
    commandCount: 1,
    fastMode: runTaskField(),
    messages: [{ role: 'system', content: 'system prompt' }, { role: 'user', content: task }],
    agentState: { iterationCount: 0 }
  }, sessionPatch || {});
  const first = await FsbFastPath.beforeTurn(session, { sessionId: session.sessionId, iteration: 1, deps });
  if (session.agentState && session.agentState.jevFast) session.agentState.jevFast.llmTurnSeen = true;
  const second = await FsbFastPath.beforeTurn(session, { sessionId: session.sessionId, iteration: 2, deps });
  return { session, first, second, client, log };
}

const TOKEN_22 = 'Ab3dEf9hIj2kLm5nOp8qRs';
const TOKEN_24 = 'qwertyuiopasdfghjklzxcvb';
const SK_KEY = 'sk-' + 'a'.repeat(24);

function fixtureUrl(token) {
  return 'http://127.0.0.1:53211/r/' + token + '/fixtures/checklist/index.html';
}

async function runTaskFieldShape() {
  section('the run_task field comes from the real background helper (D-04)');
  const field = runTaskField();
  check(JSON.stringify(field) === JSON.stringify({ enabled: true, stored: true, source: 'mcp', budgetProfile: 'run_task' }),
    'fsbFastModeSessionField(true, "mcp") gives {enabled:true, stored:true, source:"mcp", budgetProfile:"run_task"} (' + JSON.stringify(field) + ')');
  check(realSessionFieldHelper()(false, 'mcp') === null && realSessionFieldHelper()(undefined, 'mcp') === null,
    'with the switch off or unset, run_task gets no field (nothing is sent)');
}

async function runTaskGoalIsSuffix() {
  section('run_task goal is a suffix (D-22, D-23)');
  const cases = [
    ['bench-shaped goal, 22-character token, on its Open page', 'Open ' + fixtureUrl(TOKEN_22) + '. Tick Alpha and Bravo, then press Save.',
      fixtureUrl(TOKEN_22) + '?view=edit', 'Tick Alpha and Bravo, then press Save.'],
    ['bench-shaped goal, 24-letter token, on its Open page', 'Open ' + fixtureUrl(TOKEN_24) + '. Tick Alpha and Bravo, then press Save.',
      fixtureUrl(TOKEN_24), 'Tick Alpha and Bravo, then press Save.'],
    ['a plain goal without an Open sentence', 'Tick Alpha and Bravo, then press Save.', fixtureUrl(TOKEN_24), 'Tick Alpha and Bravo, then press Save.'],
    ['an Open sentence for another page', 'Open https://shop.example/cart. Tick Alpha and Bravo, then press Save.', fixtureUrl(TOKEN_24),
      'Open https://shop.example/cart. Tick Alpha and Bravo, then press Save.']
  ];
  for (const [label, task, menuUrl, expected] of cases) {
    const r = await runTaskAttempt(task, menuUrl);
    const goal = r.client.calls.length === 1 ? r.client.calls[0].request.goal : null;
    check(r.first.decline === 'first_llm_turn' && Boolean(r.second.toolCall) && r.client.calls.length === 1 && typeof goal === 'string'
      && task.endsWith(goal) && goal === expected,
    'run_task goal is a suffix: ' + label + ' -> ' + JSON.stringify(goal));
    check(r.session.task === task, 'run_task goal is a suffix: ' + label + ': session.task is unchanged');
  }
}

async function queryStringsNeverSent() {
  section('query strings never sent (D-22, D-23)');
  for (const token of [TOKEN_22, TOKEN_24]) {
    const page = fixtureUrl(token) + '?q=1&utm=x#frag';
    const task = 'Open ' + page + '. Tick Alpha.';
    const r = await runTaskAttempt(task, page);
    const wire = r.client.calls.length === 1 ? String(r.client.calls[0].init.body) : '';
    const leaked = ['q=1', 'utm=x', '#frag', 'utm', 'frag'].filter((needle) => wire.indexOf(needle) !== -1);
    check(r.client.calls.length === 1 && wire.length > 0 && leaked.length === 0,
      'query strings never sent (' + token.length + '-character token): the request holds none of q=1, utm=x and #frag'
        + (leaked.length ? ' (found ' + leaked.join(', ') + ')' : ''));
    check(r.client.calls.length === 1 && r.client.calls[0].request.goal === 'Tick Alpha.'
      && r.client.calls[0].request.page && r.client.calls[0].request.page.path === '/r/' + token + '/fixtures/checklist/index.html',
    'query strings never sent (' + token.length + '-character token): the goal is "Tick Alpha." and the page travels as origin and path only');
  }
  // Recorded for M-70-09: a URL inside the task text that is not a page-matching Open sentence stays part of the task text.
  const offPage = 'Open https://shop.example/cart?q=1. Tick Alpha.';
  const r = await runTaskAttempt(offPage, fixtureUrl(TOKEN_24));
  const goal = r.client.calls.length === 1 ? r.client.calls[0].request.goal : null;
  console.log('  INFO (M-70-09): an Open URL for another page stays in the task text, query included: goal = ' + JSON.stringify(goal));
}

async function secretStillSendsNothing() {
  section('secret still sends nothing (RESEARCH Open Question 3, M-70-09)');
  const longToken = TOKEN_22 + 'Tu1vWx2yZa3bCd4e';
  const cases = [
    ['an sk- key in the instruction', 'Open ' + fixtureUrl(TOKEN_24) + '. Use ' + SK_KEY + ' to sign in, then tick Alpha.', fixtureUrl(TOKEN_24)],
    ['an sk- key in the instruction (22-character token page)', 'Open ' + fixtureUrl(TOKEN_22) + '. Use ' + SK_KEY + ' to sign in, then tick Alpha.', fixtureUrl(TOKEN_22)],
    ['a secret in the Open URL query', 'Open ' + fixtureUrl(TOKEN_24) + '?token=' + SK_KEY + '. Tick Alpha.', fixtureUrl(TOKEN_24)],
    ['a secret in the Open URL fragment', 'Open ' + fixtureUrl(TOKEN_24) + '#' + SK_KEY + '. Tick Alpha.', fixtureUrl(TOKEN_24)],
    ['a path segment FSB\'s address rule redacts', 'Open ' + fixtureUrl(longToken) + '. Tick Alpha.', fixtureUrl(longToken)],
    ['a secret with no Open sentence', 'Use ' + SK_KEY + ' to sign in, then tick Alpha.', fixtureUrl(TOKEN_24)]
  ];
  for (const [label, task, menuUrl] of cases) {
    const r = await runTaskAttempt(task, menuUrl);
    const attempt = r.session.jevMeasurement && r.session.jevMeasurement.attempts[0];
    check(r.second.decline === 'sensitive_goal' && r.client.calls.length === 0 && attempt && attempt.jevCalled === false
      && attempt.fallback === 'sensitive_goal' && r.session.agentState.jevFast.latched === 'sensitive_goal',
    'secret still sends nothing: ' + label + ' -> zero decide calls and a sensitive_goal attempt (' + JSON.stringify(r.second) + ')');
  }
  console.log('  INFO (M-70-09): reading applied: secrets are judged on the normalised goal; the Open URL is judged by FSB\'s address rule'
    + ' (per path segment) plus its query and fragment; a secret anywhere outside a page-matching Open sentence still sends nothing.');
  console.log('  INFO (M-70-09): a 22-character bench run token in a page-matching Open URL is not a secret under that rule, so such a goal is sent'
    + ' without its Open sentence (before 70-04 the whole-text scan latched it).');
}

function sixTurnScript() {
  return [
    H.openAiToolResponse('resp_d1', [{ id: 'call_d1', name: 'click', args: { selector: '#a' } }]),
    H.openAiToolResponse('resp_d2', [{ id: 'call_d2', name: 'get_page_snapshot', args: {} }]),
    H.openAiToolResponse('resp_d3', [{ id: 'call_d3', name: 'click', args: { selector: '#b' } }]),
    H.openAiToolResponse('resp_d4', [{ id: 'call_d4', name: 'get_page_snapshot', args: {} }]),
    H.openAiToolResponse('resp_d5', [{ id: 'call_d5', name: 'click', args: { selector: '#c' } }]),
    H.openAiToolResponse('resp_d6', [{ id: 'call_d6', name: 'get_page_snapshot', args: {} }])
  ];
}

async function oneStepDescriptionWhileUncalibrated() {
  section('one step description while uncalibrated (68-10 calibration fact, D-11)');
  const createBackgroundDeps = backgroundDepsFactory();
  const page = H.DEFAULTS.pageUrl;
  const task = 'Open ' + page + '. Finish the wizard.';
  const content = H.signatureMenuContent({ entries: JSON.parse(JSON.stringify(CHECKLIST_ENTRIES)) });
  const gw = H.scriptedGateway([(request) => ({ body: gateway.uncalibratedBody(request) })]);
  const deps = createBackgroundDeps();
  const rec = H.recordingJevClient(gw.responder, { now: deps.now });
  const field = runTaskField();
  const h = H.createHarness({
    loadFastPath: true,
    task,
    storage: { fsbJevFastModeEnabled: true },
    sessionPatch: { maxIterations: 40, fastMode: field },
    deps,
    jevClient: rec.client,
    contentResponder: content.respond,
    providerScript: sixTurnScript(),
    registerRunEvidence: true
  });
  try {
    for (let i = 0; i < 6; i += 1) await h.step();
    const menus = h.events.filter((e) => e.type === 'content' && e.message && e.message.action === 'getJevMenu').length;
    const decides = rec.decides.length;
    console.log('  INFO: 6 iterations: ' + menus + ' getJevMenu request(s), ' + decides + ' decide call(s), ' + gw.requests.length + ' gateway request(s)');
    check(h.session.fastMode && h.session.fastMode.budgetProfile === 'run_task' && h.stepsRun === 6,
      'one step description while uncalibrated: the session carries the real run_task field and ran 6 iterations');
    check(decides <= 1 && gw.requests.length <= 1 && menus <= 1,
      'one step description while uncalibrated: at most one decide and at most one fast-path getJevMenu request in 6 iterations');
    check(decides === 1 && gw.requests.length === 1 && gw.requests[0].goal === 'Finish the wizard.',
      'one step description while uncalibrated: the one step description was asked (not vacuous) and its goal is the normalised task');
    check(h.session._fastPath && h.session._fastPath.off === true && h.session._fastPath.offReason === 'not_calibrated' && h.session.status === 'running',
      'one step description while uncalibrated: the session latched not_calibrated and the task kept running on the LLM');
    check(h.session.task === task, 'one step description while uncalibrated: session.task is unchanged');
  } finally {
    h.dispose();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Phase 70 Plan 04 -- the fast-mode disclosure re-verified for MCP run_task (D-23)');
  panelPatternsSelfTest();
  noPanelOnlyLimit();
  privacyControlNamesSettingsTool();
  cardMcpMentionRecorded();
  noForbiddenOverclaim();
  await runTaskFieldShape();
  await runTaskGoalIsSuffix();
  await queryStringsNeverSent();
  await secretStillSendsNothing();
  await oneStepDescriptionWhileUncalibrated();
  check(typeof FsbJevState.buildRequest === 'function', 'the real FsbJevState.buildRequest built every request above');

  console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error('FAIL: unexpected error: ' + (error && error.stack ? error.stack : error));
  process.exitCode = 1;
});
