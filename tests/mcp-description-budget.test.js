'use strict';

/**
 * Phase 69 Plan 01 (MCP-01-c, CONTEXT D-05 / D-06): MCP description budget.
 *
 * Measures the current mcp/build tools/list against the frozen 8a058bdf
 * baseline (tests/fixtures/mcp-tools-list-8a058bdf.json) and prints:
 *   - canonical bytes of {tools}, description chars, parameter-description
 *     chars and total chars, for the baseline and for the current list
 *     filtered to the 72 baseline names;
 *   - ceil(chars/4) and ceil(bytes/4), labelled "estimate" (the rule in
 *     extension/ai/transcript-store.js; exact per-model counts are V4);
 *   - the Phase 66.1 settings tool on its own line;
 *   - the five longest current descriptions;
 *   - whether PROJECT.md's "tool-list tokens cut by more than half" target is
 *     met on the whole-list estimate. That line is reported, never gated: the
 *     schema scaffolding is frozen by MCP-04.
 *
 * Gates: plan 69-01 landed every gate off (report-only), so the suite was
 * green on the unchanged build (RESEARCH Pitfall 4). Plan 69-02 turned the
 * per-tool cap on with the first description cuts; plan 69-04 turned
 * budgetFloors and fullCoverage on in a commit of its own, after the cuts
 * were complete. The baseline figures themselves are always checked.
 *
 * Plan 69-04 (D-06, D-08, SC1) adds:
 *   - the D-06 floors, gated: description + parameter-description chars cut
 *     by at least CHAR_REDUCTION_FLOOR and canonical bytes by at least
 *     BYTE_REDUCTION_FLOOR over the 72 baseline names. Until plan 69-06
 *     publishes `expect`, every D-12 tool without it is charged
 *     EXPECT_SCHEMA_BYTE_CAP bytes and MCP_EXPECT_DESCRIPTION.length chars
 *     (the expect reserve), so 69-06 cannot silently eat the savings;
 *   - full coverage over every live tool: module text published verbatim,
 *     module parameter text on every inline-registered tool, no forbidden
 *     substring, a search term in every first sentence;
 *   - per-tool shortening over the 72 fixture names: no description grows,
 *     no description + parameter text (expect excluded) grows, and every
 *     description over PER_TOOL_SHORTEN_THRESHOLD characters at 8a058bdf is
 *     strictly shorter. PER_TOOL_LENGTH_EXCEPTIONS is the only way out and is
 *     expected to stay empty;
 *   - the complete MUST_KEEP table (payment confirmation, secrets resolved
 *     inside the extension, real side effects, the replay phrase, ...).
 *
 * Plan 69-02 also checks the 37 registry action tools that registerManualTools
 * publishes (the "manual site"): every one publishes its text from
 * mcp/src/tools/descriptions.ts (plus the one-sentence change-report suffix
 * where the registry sets _emitChangeReport), with the common tab_id / client /
 * visual_reason / is_final text, no "Multi-agent:" boilerplate or source-file
 * pointer, a search term in the first sentence, and a subtotal of at most
 * MANUAL_SITE_CHAR_BUDGET characters. The module has no orphan keys, and the
 * MUST_KEEP table proves the safety guidance survived (D-10).
 *
 * Together with tests/mcp-tools-list-shape-freeze.test.js, this suite replaces
 * the Phase 66.1 description equality in
 * tests/mcp-settings-tool-contract.test.js (CONTEXT D-22).
 *
 * Never asserts a total tool count for the current list (D-02) and never
 * reads git history (D-04).
 *
 * Run: npm --prefix mcp run build && node tests/mcp-description-budget.test.js
 */

const path = require('path');
const { pathToFileURL } = require('url');

const GATES = Object.freeze({ perToolDescriptionCap: true, budgetFloors: true, fullCoverage: true });
const PER_TOOL_DESCRIPTION_CAP = 2048;
const CHAR_REDUCTION_FLOOR = 0.5;
const BYTE_REDUCTION_FLOOR = 0.2;
const EXPECT_SCHEMA_BYTE_CAP = 600;
const BASELINE_FIGURES = Object.freeze({ count: 72, descChars: 54024, paramChars: 34217, bytes: 121379 });

// SC1 "all descriptions shortened", per tool and not only in aggregate: a
// baseline description longer than this many characters must get strictly
// shorter; one at or under it counts as already short and must only not grow.
const PER_TOOL_SHORTEN_THRESHOLD = 200;
// Tool name -> one-line reason, the only exemption from the per-tool rules.
// Expected to stay empty; shorten text in mcp/src/tools/descriptions.ts first.
const PER_TOOL_LENGTH_EXCEPTIONS = Object.freeze({});

// Registry names that a hand-written mcp/src registration publishes with its
// own inline schema (observability.ts), so they follow the inline-tool rule:
// every parameter publishes module text, never a registry fallback.
const REGISTRY_NAMES_REGISTERED_INLINE = Object.freeze(['search_memory']);

// PROJECT.md: "tool-list tokens cut by more than half". Reported only.
const PROJECT_TOKEN_TARGET_REDUCTION = 0.5;
const LONGEST_DESCRIPTIONS_SHOWN = 5;

// Plan 69-02 budget split: the 37 manual-site tools get at most this many
// characters (descriptions, including every copy of the change-report
// sentence, plus all their parameter descriptions). Shorten text in
// mcp/src/tools/descriptions.ts when over; never raise this number.
// The `expect` parameter (plan 69-06) is left out, as in every other per-tool
// check here: its text is the one MCP_EXPECT_DESCRIPTION constant, governed by
// the D-13 description and schema caps and charged to the D-06 whole-list
// floors, which measure the real published expect bytes.
const MANUAL_SITE_CHAR_BUDGET = 26000;

// No published description (tool or parameter) may carry these: the
// multi-agent rule lives once in the common tab_id text, and the client text
// never points at a source file (D-09).
const FORBIDDEN_DESCRIPTION_SUBSTRINGS = ['Multi-agent:', 'mcp/src/', 'MCP_VISUAL_CLIENT_LABELS'];
const COMMON_PARAM_NAMES = ['tab_id', 'client', 'visual_reason', 'is_final'];

// The labels the common client text names; each must be on the allowlist.
const CLIENT_LABELS_NAMED = ['Claude', 'Codex', 'Cursor', 'ChatGPT', 'Gemini', 'VS Code', 'Copilot', 'Windsurf'];

// Search terms first (D-09): the first sentence of each manual-site
// description (text up to the first ". ") must contain a token of the tool
// name (split on "_", length >= 3, case-insensitive) or one of these synonyms.
const SEARCH_TERM_SYNONYMS = Object.freeze({
  execute_js: ['JavaScript'],
  navigate: ['URL'],
  refresh: ['reload'],
  go_back: ['history'],
  go_forward: ['history'],
});

// D-10 must-keep table: each row's patterns must all match (case-insensitive)
// the text named by `where`:
//   tool:<name>    the published description of that tool;
//   param:<t>.<p>  the published description of parameter p on tool t;
//   common:<p>     MCP_COMMON_PARAM_DESCRIPTIONS[p];
//   const:<NAME>   the exported string constant of mcp/build/tools/descriptions.js.
// Plan 69-04 appended the rows for the remaining tools (from 'use_payment_method').
const MUST_KEEP = [
  { id: 'close_tab refuses the active tab unless allow_active', where: 'tool:close_tab', patterns: [/allow_active/i, /active tab/i] },
  { id: 'select_option is native-only; custom dropdowns take two clicks', where: 'tool:select_option', patterns: [/native <select> only|native[- ]only|native selects? only/i, /two[- ]clicks?/i] },
  { id: 'execute_js says when to fall back to native tools', where: 'tool:execute_js', patterns: [/fall ?back to native/i] },
  { id: 'change-report sentence: inspect before retrying', where: 'const:MCP_CHANGE_REPORT_SENTENCE', patterns: [/inspect/i, /before retrying/i] },
  { id: 'expect description: inspect before retrying', where: 'const:MCP_EXPECT_DESCRIPTION', patterns: [/inspect/i, /before retrying/i] },
  { id: 'client lists common labels and says case is ignored', where: 'common:client', patterns: [/\bClaude\b/i, /\bCodex\b/i, /\bCursor\b/i, /\bcase\b[^.]*\bignored\b/i] },
  { id: 'tab_id carries the TAB_NOT_OWNED rule', where: 'common:tab_id', patterns: [/TAB_NOT_OWNED/] },
  { id: 'upload_file keeps the secret-path denylist and audit log', where: 'tool:upload_file', patterns: [/~\/\.ssh/i, /vault/i, /block/i, /audit/i] },
  { id: 'use_payment_method shows a confirmation prompt before any fill', where: 'tool:use_payment_method', patterns: [/confirmation prompt/i, /before any fill/i] },
  { id: 'use_payment_method resolves card data inside the extension', where: 'tool:use_payment_method', patterns: [/inside the extension/i, /never returned/i] },
  { id: 'fill_credential resolves the password inside the extension', where: 'tool:fill_credential', patterns: [/password/i, /inside the extension/i, /never returned/i] },
  { id: 'list_credentials never returns passwords', where: 'tool:list_credentials', patterns: [/passwords are never returned/i] },
  { id: 'list_payment_methods never returns card numbers or CVV', where: 'tool:list_payment_methods', patterns: [/card numbers/i, /CVV/, /never returned/i] },
  { id: 'invoke_capability performs real side effects', where: 'tool:invoke_capability', patterns: [/real side effects/i, /side-effect class/i] },
  { id: 'replay_session: FSB opens the pages itself', where: 'tool:replay_session', patterns: [/never ask the user to open target pages manually/, /approv/i] },
  { id: 'back keeps single-step semantics, its statuses and no focus steal', where: 'tool:back', patterns: [/single step/i, /\bok\b/, /no_history/, /cross_origin/, /bf_cache/, /fragment_only/, /does not steal focus/i, /inspect the page before retrying/i] },
  { id: 'run_task keeps its call contract', where: 'tool:run_task', patterns: [/autopilot/i, /manual tools/i, /completion summary/i, /get_task_status/, /stop_task/] },
  { id: 'complete_task never reports secrets', where: 'tool:complete_task', patterns: [/never include passwords/i] },
  { id: 'partial_task never reports secrets and names the handoff', where: 'tool:partial_task', patterns: [/never include passwords/i, /fail_task/, /next step/i] },
  { id: 'fail_task never reports secrets', where: 'tool:fail_task', patterns: [/never include passwords/i] },
];

const HELPER_PATH = path.join(__dirname, 'helpers', 'mcp-in-process.mjs');
const MCP_BUILD_TOOLS = path.join(__dirname, '..', 'mcp', 'build', 'tools');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

// Helper module (tests/helpers/mcp-in-process.mjs), loaded in main().
let h = null;

function reduction(before, after) {
  return before === 0 ? 0 : (before - after) / before;
}

function formatPercent(fraction) {
  return `${(fraction * 100).toFixed(1)}%`;
}

function formatChange(before, after) {
  const change = before === 0 ? 0 : (after - before) / before;
  return `${change > 0 ? '+' : ''}${formatPercent(change)}`;
}

// Figures for one tools/list (or a filtered part of it). Bytes are always
// canonicalBytes({ tools: list }), the same code path for both sides.
function measure(list) {
  const descChars = h.descChars(list);
  const paramChars = h.paramChars(list);
  const totalChars = descChars + paramChars;
  const bytes = h.canonicalBytes({ tools: list });
  return {
    count: list.length,
    descChars,
    paramChars,
    totalChars,
    bytes,
    charTokenEstimate: h.estimateTokens(totalChars),
    byteTokenEstimate: h.estimateTokens(bytes),
  };
}

function settingsLine(settingsTool) {
  if (!settingsTool) return 'settings (Phase 66.1): absent from the current build';
  const own = measure([settingsTool]);
  return `settings (Phase 66.1, reported on its own line, not in the 72): description ${own.descChars} chars; `
    + `parameter-description ${own.paramChars} chars; canonical bytes ${own.bytes}; `
    + `estimate ${own.charTokenEstimate} tokens (chars/4)`;
}

function printReport(baseline, current, settingsTool, allCurrentTools) {
  const rows = [
    ['tools (baseline names)', 'count'],
    ['description chars', 'descChars'],
    ['parameter-description chars', 'paramChars'],
    ['total chars', 'totalChars'],
    ['estimate: tokens, ceil(chars/4)', 'charTokenEstimate'],
    ['canonical bytes of {tools}', 'bytes'],
    ['estimate: tokens, ceil(bytes/4)', 'byteTokenEstimate'],
  ];
  console.log('\n--- budget report (token figures are estimates, not tokenizer counts) ---');
  console.log(`  ${'measure'.padEnd(34)}${'baseline 8a058bdf'.padStart(18)}${'current'.padStart(12)}${'change'.padStart(10)}`);
  for (const [label, key] of rows) {
    console.log(`  ${label.padEnd(34)}${String(baseline[key]).padStart(18)}${String(current[key]).padStart(12)}`
      + `${formatChange(baseline[key], current[key]).padStart(10)}`);
  }
  console.log(`  ${settingsLine(settingsTool)}`);

  const longest = [...allCurrentTools]
    .map((tool) => ({ name: tool.name, chars: typeof tool.description === 'string' ? tool.description.length : 0 }))
    .sort((a, b) => b.chars - a.chars || (a.name < b.name ? -1 : 1))
    .slice(0, LONGEST_DESCRIPTIONS_SHOWN);
  console.log(`  ${LONGEST_DESCRIPTIONS_SHOWN} longest current descriptions:`);
  for (const entry of longest) console.log(`    ${entry.name.padEnd(28)}${String(entry.chars).padStart(6)} chars`);

  const tokenCut = reduction(baseline.byteTokenEstimate, current.byteTokenEstimate);
  const met = tokenCut > PROJECT_TOKEN_TARGET_REDUCTION;
  console.log(`  PROJECT.md target (>50% tool-list token estimate cut): ${met ? 'MET' : 'NOT MET'} (${formatPercent(tokenCut)})`);
}

// One gate line. An off gate only reports; an on gate is a check.
function gate(name, enabled, cond, detail) {
  if (!enabled) {
    console.log(`  gate off (report-only): ${name} -- ${detail}`);
    return;
  }
  check(cond, `${name}: ${detail}`);
}

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

function listNames(names) {
  return names.length ? ` (${names.join(', ')})` : '';
}

function propertiesOf(tool) {
  return (tool && tool.inputSchema && tool.inputSchema.properties) || {};
}

// Description + top-level parameter-description characters of one tool,
// leaving out the `expect` property (plan 69-06 adds it; the floors account
// for it through the expect reserve instead).
function ownCharsWithoutExpect(tool) {
  let total = typeof tool.description === 'string' ? tool.description.length : 0;
  for (const [param, property] of Object.entries(propertiesOf(tool))) {
    if (param === 'expect') continue;
    if (property && typeof property.description === 'string') total += property.description.length;
  }
  return total;
}

function subtotalLine(label, tools) {
  const desc = h.descChars(tools);
  const params = h.paramChars(tools);
  return `${label} (${tools.length} tools): description ${desc} + parameter-description ${params} = ${desc + params} chars; `
    + `canonical bytes ${h.canonicalBytes({ tools })}`;
}

// Text up to the first ". " (the whole text when there is none).
function firstSentence(text) {
  const end = String(text).indexOf('. ');
  return end === -1 ? String(text) : String(text).slice(0, end);
}

function searchTerms(name) {
  const tokens = name.split('_').filter((token) => token.length >= 3);
  return [...tokens, ...(SEARCH_TERM_SYNONYMS[name] || [])];
}

// Matching rule of mcp/src/tools/visual-session.ts: case, spaces, _ and -
// are ignored.
function foldClientLabel(label) {
  return String(label).trim().toLowerCase().replace(/[\s_-]+/g, '');
}

// The text a MUST_KEEP row points at, or null when it does not exist.
function mustKeepText(where, liveByName, d) {
  const colon = where.indexOf(':');
  const kind = where.slice(0, colon);
  const name = where.slice(colon + 1);
  if (kind === 'tool') {
    const tool = liveByName.get(name);
    return tool && typeof tool.description === 'string' ? tool.description : null;
  }
  if (kind === 'param') {
    const [toolName, param] = name.split('.');
    const property = propertiesOf(liveByName.get(toolName))[param];
    return property && typeof property.description === 'string' ? property.description : null;
  }
  if (kind === 'common') {
    return hasOwn(d.MCP_COMMON_PARAM_DESCRIPTIONS, name) ? d.MCP_COMMON_PARAM_DESCRIPTIONS[name] : null;
  }
  if (kind === 'const') {
    return typeof d[name] === 'string' ? d[name] : null;
  }
  return null;
}

async function importBuildTool(file) {
  return import(pathToFileURL(path.join(MCP_BUILD_TOOLS, file)).href);
}

(async () => {
  h = await import(pathToFileURL(HELPER_PATH).href);
  const fixture = h.readBaselineFixture();
  const baselineTools = fixture.tools;
  const baselineNames = baselineTools.map((tool) => tool.name);
  const allCurrentTools = h.sortByName(await h.listCurrentTools());
  const currentBaselineTools = h.filterToNames(allCurrentTools, baselineNames);
  const settingsTool = allCurrentTools.find((tool) => tool.name === h.SETTINGS_TOOL_NAME) || null;
  // Loaded after listCurrentTools(), whose staleness guard covers these files.
  const schemaBridge = await importBuildTool('schema-bridge.js');
  const d = await importBuildTool('descriptions.js');
  const visualSession = await importBuildTool('visual-session.js');
  const liveByName = new Map(allCurrentTools.map((tool) => [tool.name, tool]));
  // The manual site: registry tools registered by registerManualTools.
  const manualSite = schemaBridge.TOOL_REGISTRY.filter((tool) => !tool._readOnly && tool.name !== 'trigger');
  const manualPublished = manualSite.map((tool) => liveByName.get(tool.name)).filter(Boolean);

  console.log('\n--- baseline figures (frozen fixture) ---');
  const baseline = measure(baselineTools);
  for (const key of ['count', 'descChars', 'paramChars', 'bytes']) {
    check(baseline[key] === BASELINE_FIGURES[key],
      `baseline ${key} is ${baseline[key]} (pinned ${BASELINE_FIGURES[key]})`);
  }

  const current = measure(currentBaselineTools);
  console.log(`\n  current build: ${currentBaselineTools.length} of ${baselineNames.length} baseline names present; `
    + `${allCurrentTools.length - currentBaselineTools.length} other live tool(s) reported separately`);
  printReport(baseline, current, settingsTool, allCurrentTools);
  const manualDescChars = h.descChars(manualPublished);
  const manualExpectTools = manualPublished.filter((tool) => hasOwn(propertiesOf(tool), 'expect'));
  const manualExpectChars = manualExpectTools.reduce((sum, tool) => {
    const property = propertiesOf(tool).expect;
    return sum + (property && typeof property.description === 'string' ? property.description.length : 0);
  }, 0);
  const manualParamChars = h.paramChars(manualPublished) - manualExpectChars;
  const manualTotal = manualDescChars + manualParamChars;
  console.log(`  manual site (registerManualTools, ${manualPublished.length} of ${manualSite.length} tools published): `
    + `description ${manualDescChars} + parameter-description ${manualParamChars} (expect excluded) = ${manualTotal} chars `
    + `(budget ${MANUAL_SITE_CHAR_BUDGET}); estimate ${h.estimateTokens(manualTotal)} tokens (chars/4)`);
  console.log(`  manual site expect: ${manualExpectTools.length} tools x MCP_EXPECT_DESCRIPTION = +${manualExpectChars} chars `
    + '(outside MANUAL_SITE_CHAR_BUDGET; counted in the D-06 floors below)');
  const manualNames = new Set(manualSite.map((tool) => tool.name));
  console.log('  per-group subtotals over the 72 baseline names:');
  console.log(`    ${subtotalLine('manual site', currentBaselineTools.filter((tool) => manualNames.has(tool.name)))}`);
  console.log(`    ${subtotalLine('rest', currentBaselineTools.filter((tool) => !manualNames.has(tool.name)))}`);

  const withExpect = allCurrentTools.filter((tool) => (
    tool.inputSchema && tool.inputSchema.properties
    && Object.prototype.hasOwnProperty.call(tool.inputSchema.properties, 'expect')
  ));
  if (withExpect.length === 0) {
    console.log('  expect: not published yet');
  } else {
    const largest = Math.max(...withExpect.map((tool) => h.canonicalBytes(tool.inputSchema.properties.expect)));
    console.log(`  expect: published on ${withExpect.length} tools; largest schema ${largest} canonical bytes `
      + `(cap ${EXPECT_SCHEMA_BYTE_CAP}, enforced by tests/mcp-tools-list-shape-freeze.test.js)`);
  }

  // --- gates ---
  console.log('\n--- gates (CONTEXT D-06) ---');
  const overCap = allCurrentTools.filter((tool) => (
    typeof tool.description === 'string' && tool.description.length > PER_TOOL_DESCRIPTION_CAP
  ));
  gate('perToolDescriptionCap', GATES.perToolDescriptionCap, overCap.length === 0,
    `${overCap.length} of ${allCurrentTools.length} live tools exceed ${PER_TOOL_DESCRIPTION_CAP} description chars`
      + (overCap.length ? ` (${overCap.map((tool) => `${tool.name} ${tool.description.length}`).join(', ')})` : ''));
  // Expect reserve (D-06 with D-12/D-13): until plan 69-06 publishes
  // `expect`, every D-12 tool without it is charged the schema byte cap and
  // the expect description, so the floors already hold with expect on.
  const expectNames = h.EXPECT_TOOL_NAMES_VERBATIM;
  const expectNamesOffBaseline = expectNames.filter((name) => !baselineNames.includes(name));
  check(expectNamesOffBaseline.length === 0,
    `all ${expectNames.length} D-12 expect tools are baseline names${listNames(expectNamesOffBaseline)}`);
  const reserveNames = expectNames.filter((name) => !hasOwn(propertiesOf(liveByName.get(name)), 'expect'));
  const reserveChars = reserveNames.length * d.MCP_EXPECT_DESCRIPTION.length;
  const reserveBytes = reserveNames.length * EXPECT_SCHEMA_BYTE_CAP;
  const gatedChars = current.totalChars + reserveChars;
  const gatedBytes = current.bytes + reserveBytes;
  console.log(`  expect reserve applied to ${reserveNames.length} of ${expectNames.length} tools: `
    + `+${reserveChars} chars (${reserveNames.length} x ${d.MCP_EXPECT_DESCRIPTION.length}), `
    + `+${reserveBytes} bytes (${reserveNames.length} x ${EXPECT_SCHEMA_BYTE_CAP})`);
  const charCut = reduction(baseline.totalChars, gatedChars);
  gate('budgetFloors (chars)', GATES.budgetFloors, charCut >= CHAR_REDUCTION_FLOOR,
    `description + parameter-description chars over the 72 baseline names, expect reserve included, `
      + `${baseline.totalChars} -> ${gatedChars}: cut by ${formatPercent(charCut)} (floor ${formatPercent(CHAR_REDUCTION_FLOOR)}; `
      + `${formatPercent(reduction(baseline.totalChars, current.totalChars))} without the reserve)`);
  const byteCut = reduction(baseline.bytes, gatedBytes);
  gate('budgetFloors (bytes)', GATES.budgetFloors, byteCut >= BYTE_REDUCTION_FLOOR,
    `canonical tools/list bytes over the 72 baseline names, expect reserve included, `
      + `${baseline.bytes} -> ${gatedBytes}: cut by ${formatPercent(byteCut)} (floor ${formatPercent(BYTE_REDUCTION_FLOOR)}; `
      + `${formatPercent(reduction(baseline.bytes, current.bytes))} without the reserve)`);
  const reservedTokenCut = reduction(baseline.byteTokenEstimate, h.estimateTokens(gatedBytes));
  console.log(`  PROJECT.md target with the expect reserve: ${reservedTokenCut > PROJECT_TOKEN_TARGET_REDUCTION ? 'MET' : 'NOT MET'} `
    + `(${formatPercent(reservedTokenCut)}; reported, not gated)`);

  // --- coverage (D-08) ---
  // Gated since plan 69-04: every live tool publishes its text from the MCP
  // description module, every parameter of an inline-registered tool
  // publishes module text, and the module has no orphan keys.
  console.log('\n--- coverage (D-08) ---');
  const baselineByName = new Map(baselineTools.map((tool) => [tool.name, tool]));
  const unchanged = currentBaselineTools.filter((tool) => tool.description === baselineByName.get(tool.name).description);
  gate('fullCoverage (no 8a058bdf text)', GATES.fullCoverage, unchanged.length === 0,
    `${unchanged.length} of ${currentBaselineTools.length} baseline tools still publish their 8a058bdf description`
      + listNames(unchanged.map((tool) => tool.name)));
  const registryByName = new Map(schemaBridge.TOOL_REGISTRY.map((tool) => [tool.name, tool]));
  const isInline = (name) => !registryByName.has(name) || REGISTRY_NAMES_REGISTERED_INLINE.includes(name);
  const inlineTools = allCurrentTools.filter((tool) => isInline(tool.name));
  const liveNoEntry = allCurrentTools.filter((tool) => !d.hasMcpToolDescription(tool.name)).map((tool) => tool.name);
  gate('fullCoverage (module entries)', GATES.fullCoverage, liveNoEntry.length === 0,
    `${allCurrentTools.length - liveNoEntry.length} of ${allCurrentTools.length} live tools have a MCP_TOOL_DESCRIPTIONS entry`
      + listNames(liveNoEntry));
  const liveWrongDescription = allCurrentTools.filter((tool) => {
    if (!d.hasMcpToolDescription(tool.name)) return false;
    const registryTool = registryByName.get(tool.name);
    const suffix = manualSite.some((entry) => entry.name === tool.name) && registryTool && registryTool._emitChangeReport === true
      ? ` ${d.MCP_CHANGE_REPORT_SENTENCE}` : '';
    return tool.description !== d.MCP_TOOL_DESCRIPTIONS[tool.name] + suffix;
  }).map((tool) => tool.name);
  gate('fullCoverage (published text)', GATES.fullCoverage, liveWrongDescription.length === 0,
    'every live tool publishes exactly its module text (plus " " + MCP_CHANGE_REPORT_SENTENCE on manual-site _emitChangeReport tools)'
      + listNames(liveWrongDescription));
  const liveWrongParams = [];
  for (const tool of allCurrentTools) {
    const registryTool = isInline(tool.name) ? null : registryByName.get(tool.name);
    const registryProperties = (registryTool && registryTool.inputSchema && registryTool.inputSchema.properties) || {};
    for (const [param, property] of Object.entries(propertiesOf(tool))) {
      if (param === 'expect') continue; // plan 69-06 owns expect (MCP_EXPECT_DESCRIPTION)
      const got = (property && property.description) || '';
      const fallback = registryTool ? ((registryProperties[param] && registryProperties[param].description) || '') : undefined;
      const want = d.mcpParamDescription(tool.name, param, fallback);
      if (got === '' || got !== want) liveWrongParams.push(`${tool.name}.${param}`);
    }
  }
  gate('fullCoverage (parameter text)', GATES.fullCoverage, liveWrongParams.length === 0,
    'every published parameter description is its module text (per-tool, else common), else on registry tools the registry text'
      + listNames(liveWrongParams));
  const inlineNoModuleParam = [];
  for (const tool of inlineTools) {
    for (const param of Object.keys(propertiesOf(tool))) {
      if (param === 'expect') continue;
      if (d.mcpParamDescription(tool.name, param) === '') inlineNoModuleParam.push(`${tool.name}.${param}`);
    }
  }
  gate('fullCoverage (inline parameters)', GATES.fullCoverage, inlineNoModuleParam.length === 0,
    `every parameter of the ${inlineTools.length} inline-registered tools has module text (per-tool or common)`
      + listNames(inlineNoModuleParam));

  // Manual site (plan 69-02): always on.
  check(manualSite.length > 0 && manualPublished.length === manualSite.length,
    `every manual-site registry tool is published (${manualPublished.length} of ${manualSite.length})`);
  const noModuleText = manualSite.filter((tool) => !d.hasMcpToolDescription(tool.name)).map((tool) => tool.name);
  check(noModuleText.length === 0,
    `every manual-site tool has a MCP_TOOL_DESCRIPTIONS entry${listNames(noModuleText)}`);
  const wrongDescription = [];
  const longTextKept = [];
  const wrongParams = [];
  const wrongCommonParams = [];
  for (const registryTool of manualSite) {
    const tool = liveByName.get(registryTool.name);
    if (!tool) continue;
    const expected = d.MCP_TOOL_DESCRIPTIONS[registryTool.name]
      + (registryTool._emitChangeReport === true ? ` ${d.MCP_CHANGE_REPORT_SENTENCE}` : '');
    if (tool.description !== expected) wrongDescription.push(registryTool.name);
    const fixtureTool = baselineByName.get(registryTool.name);
    if (tool.description === registryTool.description || (fixtureTool && tool.description === fixtureTool.description)) {
      longTextKept.push(registryTool.name);
    }
    const published = propertiesOf(tool);
    for (const [param, registryProperty] of Object.entries(registryTool.inputSchema.properties || {})) {
      const want = d.mcpParamDescription(registryTool.name, param, registryProperty.description || '');
      const got = (published[param] && published[param].description) || '';
      if (got !== want) wrongParams.push(`${registryTool.name}.${param}`);
      if (COMMON_PARAM_NAMES.includes(param)) {
        const ownTable = hasOwn(d.MCP_PARAM_DESCRIPTIONS, registryTool.name) ? d.MCP_PARAM_DESCRIPTIONS[registryTool.name] : {};
        const commonWant = hasOwn(ownTable, param) ? ownTable[param] : d.MCP_COMMON_PARAM_DESCRIPTIONS[param];
        if (got !== commonWant) wrongCommonParams.push(`${registryTool.name}.${param}`);
      }
    }
  }
  check(wrongDescription.length === 0,
    'each manual-site description equals its module text, plus " " + MCP_CHANGE_REPORT_SENTENCE when _emitChangeReport'
      + listNames(wrongDescription));
  check(longTextKept.length === 0, `no manual-site tool publishes its long registry text${listNames(longTextKept)}`);
  check(wrongParams.length === 0,
    `each manual-site parameter publishes its module text (per-tool, else common, else registry)${listNames(wrongParams)}`);
  check(wrongCommonParams.length === 0,
    `manual-site tab_id / client / visual_reason / is_final equal the common text unless overridden${listNames(wrongCommonParams)}`);

  const forbiddenIn = (tools) => {
    const hits = [];
    for (const tool of tools) {
      const texts = [['', tool.description], ...Object.entries(propertiesOf(tool)).map(([param, property]) => [`.${param}`, property && property.description])];
      for (const [suffix, text] of texts) {
        if (typeof text !== 'string') continue;
        for (const needle of FORBIDDEN_DESCRIPTION_SUBSTRINGS) {
          if (text.includes(needle)) hits.push(`${tool.name}${suffix}: ${needle}`);
        }
      }
    }
    return hits;
  };
  const manualForbidden = forbiddenIn(manualPublished);
  check(manualForbidden.length === 0,
    `no manual-site description contains ${FORBIDDEN_DESCRIPTION_SUBSTRINGS.map((needle) => `"${needle}"`).join(', ')}`
      + listNames(manualForbidden));
  const moduleText = JSON.stringify([d.MCP_COMMON_PARAM_DESCRIPTIONS, d.MCP_TOOL_DESCRIPTIONS, d.MCP_PARAM_DESCRIPTIONS,
    d.MCP_CHANGE_REPORT_SENTENCE, d.MCP_EXPECT_DESCRIPTION]);
  const moduleForbidden = FORBIDDEN_DESCRIPTION_SUBSTRINGS.filter((needle) => moduleText.includes(needle));
  check(moduleForbidden.length === 0, `no description-module text contains a forbidden substring${listNames(moduleForbidden)}`);
  const liveForbidden = forbiddenIn(allCurrentTools);
  check(liveForbidden.length === 0,
    `no live tool or parameter description contains a forbidden substring (${allCurrentTools.length} tools)${listNames(liveForbidden)}`);

  const missingTerms = allCurrentTools.filter((tool) => {
    const sentence = firstSentence(tool.description).toLowerCase();
    return !searchTerms(tool.name).some((term) => sentence.includes(term.toLowerCase()));
  }).map((tool) => tool.name);
  check(missingTerms.length === 0,
    `each live tool's first sentence carries a tool-name token or SEARCH_TERM_SYNONYMS term (${allCurrentTools.length} tools)`
      + listNames(missingTerms));

  const clientText = d.MCP_COMMON_PARAM_DESCRIPTIONS.client || '';
  const allowedFolded = new Set(visualSession.getAllowedMcpVisualClientLabels().map(foldClientLabel));
  const unnamed = CLIENT_LABELS_NAMED.filter((label) => !clientText.includes(label));
  check(unnamed.length === 0, `the common client text names ${CLIENT_LABELS_NAMED.join(', ')}${listNames(unnamed)}`);
  const notAllowed = CLIENT_LABELS_NAMED.filter((label) => !allowedFolded.has(foldClientLabel(label)));
  check(notAllowed.length === 0,
    `every label named in the client text is on getAllowedMcpVisualClientLabels() (case, spaces, _ and - folded)${listNames(notAllowed)}`);
  const foldVariants = ['claude', 'CODEX', 'vs-code', 'VS_CODE', ' vscode '];
  const variantsRejected = foldVariants.filter((variant) => !visualSession.isAllowedMcpVisualClientLabel(variant));
  check(variantsRejected.length === 0,
    `the server accepts case, space, _ and - variants, as the client text says${listNames(variantsRejected)}`);

  const orphanTools = Object.keys(d.MCP_TOOL_DESCRIPTIONS).filter((name) => !liveByName.has(name));
  check(orphanTools.length === 0, `every MCP_TOOL_DESCRIPTIONS key is a live tool${listNames(orphanTools)}`);
  const orphanParams = [];
  for (const [toolName, table] of Object.entries(d.MCP_PARAM_DESCRIPTIONS)) {
    if (!liveByName.has(toolName)) { orphanParams.push(toolName); continue; }
    const published = propertiesOf(liveByName.get(toolName));
    for (const param of Object.keys(table)) {
      if (!hasOwn(published, param)) orphanParams.push(`${toolName}.${param}`);
    }
  }
  check(orphanParams.length === 0,
    `every MCP_PARAM_DESCRIPTIONS key is a live tool and every param key is in its published inputSchema${listNames(orphanParams)}`);

  check(manualTotal <= MANUAL_SITE_CHAR_BUDGET,
    `manual-site subtotal ${manualTotal} chars is within MANUAL_SITE_CHAR_BUDGET ${MANUAL_SITE_CHAR_BUDGET}`);

  // --- per-tool shortening (SC1, plan 69-04) ---
  // Over the 72 fixture names, baseline = the fixture tool, current = the live
  // tool; published descriptions on both sides, so the old change-report
  // suffix and the new sentence are both counted.
  console.log('\n--- per-tool shortening (SC1) ---');
  const exceptionNames = Object.keys(PER_TOOL_LENGTH_EXCEPTIONS);
  const badExceptions = exceptionNames.filter((name) => (
    !baselineByName.has(name) || typeof PER_TOOL_LENGTH_EXCEPTIONS[name] !== 'string' || !PER_TOOL_LENGTH_EXCEPTIONS[name].trim()
  ));
  check(badExceptions.length === 0,
    `every PER_TOOL_LENGTH_EXCEPTIONS entry names a baseline tool and gives a reason${listNames(badExceptions)}`);
  const alreadyShort = [];
  const grewDescription = [];
  const grewTotal = [];
  const notShorter = [];
  for (const baselineTool of baselineTools) {
    const tool = liveByName.get(baselineTool.name);
    if (!tool) continue; // the shape freeze reports missing tools
    const before = baselineTool.description.length;
    const after = typeof tool.description === 'string' ? tool.description.length : 0;
    const beforeTotal = ownCharsWithoutExpect(baselineTool);
    const afterTotal = ownCharsWithoutExpect(tool);
    if (hasOwn(PER_TOOL_LENGTH_EXCEPTIONS, baselineTool.name)) {
      console.log(`  exception: ${baselineTool.name} description ${before} -> ${after}, total ${beforeTotal} -> ${afterTotal} `
        + `(${PER_TOOL_LENGTH_EXCEPTIONS[baselineTool.name]})`);
      continue;
    }
    if (before <= PER_TOOL_SHORTEN_THRESHOLD) alreadyShort.push(baselineTool.name);
    if (after > before) grewDescription.push(`${baselineTool.name} ${before}->${after}`);
    if (afterTotal > beforeTotal) grewTotal.push(`${baselineTool.name} ${beforeTotal}->${afterTotal}`);
    if (before > PER_TOOL_SHORTEN_THRESHOLD && after >= before) notShorter.push(`${baselineTool.name} ${before}->${after}`);
  }
  console.log(`  per-tool check over ${baselineTools.length} names; PER_TOOL_LENGTH_EXCEPTIONS entries: ${exceptionNames.length}`);
  console.log(`  already short (baseline description <= ${PER_TOOL_SHORTEN_THRESHOLD} chars; rules (a) and (b) only): `
    + `${alreadyShort.length}${listNames(alreadyShort)}`);
  check(grewDescription.length === 0,
    `(a) no baseline tool's description is longer than at 8a058bdf${listNames(grewDescription)}`);
  check(grewTotal.length === 0,
    `(b) no baseline tool's description + parameter-description chars (expect excluded) exceed 8a058bdf${listNames(grewTotal)}`);
  check(notShorter.length === 0,
    `(c) every baseline description over ${PER_TOOL_SHORTEN_THRESHOLD} chars is strictly shorter `
      + `(${baselineTools.length - alreadyShort.length - exceptionNames.length} tools)${listNames(notShorter)}`);

  // --- must-keep (D-10) ---
  // Each guidance row must survive, by key phrase, in its named tool or
  // parameter description (MUST_KEEP; completed by plan 69-04).
  console.log('\n--- must-keep (D-10) ---');
  for (const row of MUST_KEEP) {
    const text = mustKeepText(row.where, liveByName, d);
    const misses = text === null ? ['(text not found)'] : row.patterns.filter((pattern) => !pattern.test(text)).map(String);
    check(misses.length === 0, `must-keep [${row.where}] ${row.id}${listNames(misses)}`);
  }
  check(!/then retry\./i.test(d.MCP_CHANGE_REPORT_SENTENCE),
    'the change-report sentence never says "then retry."');
  check(d.MCP_EXPECT_DESCRIPTION.length <= 160,
    `MCP_EXPECT_DESCRIPTION is at most 160 characters (got ${d.MCP_EXPECT_DESCRIPTION.length})`);
  // 69-REVIEW WR-06: the mcp:go-back route never attaches change_report, so
  // back must not promise one.
  const backText = mustKeepText('tool:back', liveByName, d);
  check(typeof backText === 'string' && !/change_report/.test(backText),
    'back does not promise change_report (the mcp:go-back route never returns one)');

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: mcp-description-budget threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
