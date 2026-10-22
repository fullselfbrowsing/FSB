'use strict';

/**
 * Phase 71 Plan 09 (REL-02-b, CONTEXT D-23, SC4): the reviewed fsb-mcp-server
 * 0.12.0 release delta.
 *
 * The built runtime's tools/list is compared with the frozen 8a058bdf fixture,
 * and mcp/src/types.ts MCPMessageType with the 8a058bdf list embedded in
 * tests/fixtures/mcp-release-delta-0.12.0.json. The difference must equal the
 * reviewed manifest exactly:
 *   - added tools: exactly `addedTools` (the 66.1 `settings` tool);
 *   - removed tools: exactly `removedTools` (none);
 *   - added properties: exactly `addedOptionalProperties` (the 69 `expect`
 *     property on the 29 D-12 tools), never in any required list;
 *   - new required arguments on kept tools: exactly `newRequiredArguments`
 *     (none); every kept tool keeps its required list and every baseline
 *     property with its description-free shape;
 *   - added MCPMessageType values: exactly `addedMessageTypes`, with the
 *     8a058bdf list an in-order subsequence of the current list.
 * Any unreviewed addition fails and is printed with its tool name.
 *
 * It composes with the existing suites instead of re-checking them: the byte
 * goldens, the full shape freeze, the settings contract and the expect wire
 * stay with their own suites, and this suite asserts that each of them is
 * registered exactly once in package.json scripts.test (`companionSuites`).
 *
 * It never runs git and never spawns a process: the 8a058bdf MCPMessageType
 * list is data in the manifest, next to the command that captured it.
 * listCurrentTools() runs the 69-01 build-freshness guard, so a stale build
 * fails loudly.
 *
 * Run: npm --prefix mcp run build && node tests/mcp-release-compat.test.js
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const REPO_ROOT = path.resolve(__dirname, '..');
const HELPER_PATH = path.join(__dirname, 'helpers', 'mcp-in-process.mjs');
const MANIFEST_RELATIVE_PATH = 'tests/fixtures/mcp-release-delta-0.12.0.json';
const TYPES_RELATIVE_PATH = 'mcp/src/types.ts';

const MANIFEST_KEYS = Object.freeze([
  'schemaVersion',
  'note',
  'release',
  'baselineFixture',
  'baselineFixtureSha256',
  'addedTools',
  'removedTools',
  'addedOptionalProperties',
  'newRequiredArguments',
  'baselineMessageTypes',
  'baselineMessageTypesCommand',
  'addedMessageTypes',
  'companionSuites',
  'oldExtensionCoverage',
]);
const NOTE_MAX_CHARS = 200;

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

function sameList(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sortedCopy(list) {
  return [...list].sort();
}

function propertiesOf(tool) {
  return (tool && tool.inputSchema && tool.inputSchema.properties) || {};
}

function requiredOf(tool) {
  const required = tool && tool.inputSchema && tool.inputSchema.required;
  return Array.isArray(required) ? required : [];
}

function isStringList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

// The S13 capture rule (71-SYNC-RECHECK): line comments are stripped first,
// because one of them contains a `;`, then every quoted member of the
// MCPMessageType union is read in source order.
function extractMessageTypes(typesSource) {
  const match = typesSource.replace(/\/\/[^\n]*/g, '').match(/export type MCPMessageType\s*=([\s\S]*?);/);
  if (!match) return null;
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

function isInOrderSubsequence(subsequence, sequence) {
  let cursor = 0;
  for (const item of sequence) {
    if (cursor < subsequence.length && item === subsequence[cursor]) cursor++;
  }
  return cursor === subsequence.length;
}

// The observed delta between the baseline and current tools/list, computed
// without reference to the manifest so every unreviewed change is reported.
function computeToolDelta(h, baselineTools, currentTools) {
  const baselineByName = new Map(baselineTools.map((tool) => [tool.name, tool]));
  const currentByName = new Map(currentTools.map((tool) => [tool.name, tool]));
  const delta = {
    addedTools: currentTools.map((tool) => tool.name).filter((name) => !baselineByName.has(name)),
    removedTools: baselineTools.map((tool) => tool.name).filter((name) => !currentByName.has(name)),
    addedProperties: new Map(),
    removedProperties: new Map(),
    changedProperties: new Map(),
    requiredChanged: [],
    newRequiredArguments: [],
    expectRequired: [],
  };
  for (const baselineTool of baselineTools) {
    const name = baselineTool.name;
    const currentTool = currentByName.get(name);
    if (!currentTool) continue;
    const baselineProperties = propertiesOf(baselineTool);
    const currentProperties = propertiesOf(currentTool);
    const added = Object.keys(currentProperties).filter((key) => !hasOwn(baselineProperties, key));
    const removed = Object.keys(baselineProperties).filter((key) => !hasOwn(currentProperties, key));
    if (added.length > 0) delta.addedProperties.set(name, sortedCopy(added));
    if (removed.length > 0) delta.removedProperties.set(name, sortedCopy(removed));

    const baselineShape = h.projectShape(baselineTool);
    const currentShape = h.projectShape(currentTool);
    const changed = Object.keys(baselineProperties)
      .filter((key) => hasOwn(currentProperties, key))
      .filter((key) => h.canonicalJson(baselineShape.inputSchema.properties[key])
        !== h.canonicalJson(currentShape.inputSchema.properties[key]));
    if (changed.length > 0) delta.changedProperties.set(name, sortedCopy(changed));

    const baselineRequired = requiredOf(baselineTool);
    const currentRequired = requiredOf(currentTool);
    if (!sameList(baselineRequired, currentRequired)) {
      delta.requiredChanged.push(name);
    }
    for (const argument of currentRequired) {
      if (!baselineRequired.includes(argument)) delta.newRequiredArguments.push(`${name}.${argument}`);
    }
  }
  for (const tool of currentTools) {
    if (requiredOf(tool).includes('expect')) delta.expectRequired.push(tool.name);
  }
  return delta;
}

// Per tool, the property names the manifest allows it to gain.
function reviewedAdditionsByTool(manifest) {
  const byTool = new Map();
  for (const [property, toolNames] of Object.entries(manifest.addedOptionalProperties || {})) {
    for (const toolName of toolNames) {
      if (!byTool.has(toolName)) byTool.set(toolName, []);
      byTool.get(toolName).push(property);
    }
  }
  for (const [toolName, properties] of byTool) byTool.set(toolName, sortedCopy(properties));
  return byTool;
}

(async () => {
  const h = await import(pathToFileURL(HELPER_PATH).href);
  const manifestText = fs.readFileSync(path.join(REPO_ROOT, MANIFEST_RELATIVE_PATH), 'utf8');
  const manifest = JSON.parse(manifestText);
  const fixture = h.readBaselineFixture();
  const baselineTools = fixture.tools;
  const currentTools = h.sortByName(await h.listCurrentTools());

  console.log('\n--- the reviewed delta manifest ---');
  const keys = Object.keys(manifest);
  check(sameList(sortedCopy(keys), sortedCopy(MANIFEST_KEYS)),
    `the manifest has exactly the reviewed keys (got ${keys.join(', ')})`);
  check(manifest.schemaVersion === 1, 'schemaVersion is 1');
  check(manifest.release === '0.12.0', 'release is 0.12.0');
  check(typeof manifest.note === 'string' && manifest.note.length > 0 && manifest.note.length < NOTE_MAX_CHARS
    && !manifest.note.includes('://'), `note is a URL-free string under ${NOTE_MAX_CHARS} characters`);
  check(manifest.baselineFixture === h.FIXTURE_RELATIVE_PATH,
    `baselineFixture names ${h.FIXTURE_RELATIVE_PATH}`);
  check(typeof manifest.baselineFixtureSha256 === 'string' && /^[0-9a-f]{64}$/.test(manifest.baselineFixtureSha256),
    'baselineFixtureSha256 is a sha256 hex digest');
  check(manifest.baselineFixtureSha256 === fixture.meta.sha256,
    `baselineFixtureSha256 equals the fixture's meta.sha256 (${fixture.meta.sha256})`);
  const fixtureToolsSha = h.sha256Hex(h.canonicalJson(baselineTools));
  check(manifest.baselineFixtureSha256 === fixtureToolsSha,
    `baselineFixtureSha256 equals sha256(canonicalJson(fixture.tools)) (${fixtureToolsSha})`);
  check(fixture.meta.sourceCommit === h.PIN_COMMIT, `the fixture was captured at ${h.PIN_COMMIT.slice(0, 8)}`);
  for (const listKey of ['addedTools', 'removedTools', 'newRequiredArguments', 'baselineMessageTypes',
    'addedMessageTypes', 'companionSuites', 'oldExtensionCoverage']) {
    check(isStringList(manifest[listKey]), `${listKey} is a list of strings`);
  }
  check(sameList(manifest.addedTools, [h.SETTINGS_TOOL_NAME]), 'addedTools is exactly [settings]');
  check(sameList(manifest.removedTools, []), 'removedTools is empty');
  check(sameList(manifest.newRequiredArguments, []), 'newRequiredArguments is empty');
  const addedOptional = manifest.addedOptionalProperties;
  check(Boolean(addedOptional) && typeof addedOptional === 'object' && !Array.isArray(addedOptional)
    && sameList(Object.keys(addedOptional), ['expect']),
  'addedOptionalProperties holds exactly one property, expect');
  check(Boolean(addedOptional) && sameList(addedOptional.expect, [...h.EXPECT_TOOL_NAMES_VERBATIM]),
    'addedOptionalProperties.expect equals the 29 EXPECT_TOOL_NAMES_VERBATIM names in D-12 order');

  console.log('\n--- tool names ---');
  const delta = computeToolDelta(h, baselineTools, currentTools);
  const unreviewedAdded = delta.addedTools.filter((name) => !manifest.addedTools.includes(name));
  const missingAdded = manifest.addedTools.filter((name) => !delta.addedTools.includes(name));
  check(sameList(sortedCopy(delta.addedTools), sortedCopy(manifest.addedTools)),
    'current tool names minus baseline names equal addedTools'
      + (unreviewedAdded.length ? `; unreviewed tool: ${unreviewedAdded.join(', ')}` : '')
      + (missingAdded.length ? `; reviewed but absent: ${missingAdded.join(', ')}` : ''));
  check(sameList(sortedCopy(delta.removedTools), sortedCopy(manifest.removedTools)),
    'baseline tool names minus current names equal removedTools'
      + (delta.removedTools.length ? `; removed: ${delta.removedTools.join(', ')}` : ''));
  const currentNames = currentTools.map((tool) => tool.name);
  check(new Set(currentNames).size === currentNames.length, 'current tool names are unique');

  console.log('\n--- properties and required arguments per kept tool ---');
  const reviewed = reviewedAdditionsByTool(manifest);
  let toolsMatching = 0;
  let toolsCompared = 0;
  for (const baselineTool of baselineTools) {
    const name = baselineTool.name;
    if (!currentNames.includes(name)) continue;
    toolsCompared++;
    const actual = delta.addedProperties.get(name) || [];
    const expected = reviewed.get(name) || [];
    let ok = true;
    if (!sameList(actual, expected)) {
      ok = false;
      const unreviewedProps = actual.filter((key) => !expected.includes(key));
      const missingProps = expected.filter((key) => !actual.includes(key));
      check(false, `${name}: added properties [${actual.join(', ')}] differ from the reviewed [${expected.join(', ')}]`
        + (unreviewedProps.length ? `; unreviewed property: ${unreviewedProps.join(', ')}` : '')
        + (missingProps.length ? `; reviewed but absent: ${missingProps.join(', ')}` : ''));
    }
    if (delta.removedProperties.has(name)) {
      ok = false;
      check(false, `${name}: baseline properties removed: ${delta.removedProperties.get(name).join(', ')}`);
    }
    if (delta.changedProperties.has(name)) {
      ok = false;
      check(false, `${name}: description-free property shape changed: ${delta.changedProperties.get(name).join(', ')}`);
    }
    if (delta.requiredChanged.includes(name)) {
      ok = false;
      check(false, `${name}: required [${requiredOf(currentTools.find((tool) => tool.name === name)).join(', ')}]`
        + ` differs from the baseline [${requiredOf(baselineTool).join(', ')}]`);
    }
    if (ok) toolsMatching++;
  }
  check(toolsMatching === toolsCompared,
    `${toolsMatching} of ${toolsCompared} kept tools differ from 8a058bdf only by the reviewed optional properties`);
  const reviewedToolsMissing = [...reviewed.keys()].filter((name) => !currentNames.includes(name)
    || !baselineTools.some((tool) => tool.name === name));
  check(reviewedToolsMissing.length === 0,
    `every tool named in addedOptionalProperties is a kept baseline tool${reviewedToolsMissing.length ? ` (not: ${reviewedToolsMissing.join(', ')})` : ''}`);
  const unreviewedRequired = delta.newRequiredArguments.filter((entry) => !manifest.newRequiredArguments.includes(entry));
  check(sameList(sortedCopy(delta.newRequiredArguments), sortedCopy(manifest.newRequiredArguments)),
    `new required arguments on kept tools equal newRequiredArguments${unreviewedRequired.length ? `; unreviewed: ${unreviewedRequired.join(', ')}` : ''}`);
  check(delta.expectRequired.length === 0,
    `\`expect\` is in no required list${delta.expectRequired.length ? ` (required on: ${delta.expectRequired.join(', ')})` : ''}`);
  const addedPropertyRequired = [];
  for (const tool of currentTools) {
    for (const property of reviewed.get(tool.name) || []) {
      if (requiredOf(tool).includes(property)) addedPropertyRequired.push(`${tool.name}.${property}`);
    }
  }
  check(addedPropertyRequired.length === 0,
    `every reviewed added property stays optional${addedPropertyRequired.length ? ` (required: ${addedPropertyRequired.join(', ')})` : ''}`);

  console.log('\n--- MCPMessageType ---');
  const currentTypes = extractMessageTypes(fs.readFileSync(path.join(REPO_ROOT, TYPES_RELATIVE_PATH), 'utf8'));
  check(Array.isArray(currentTypes) && currentTypes.length > 0, `${TYPES_RELATIVE_PATH} declares MCPMessageType`);
  const baselineTypes = manifest.baselineMessageTypes || [];
  check(baselineTypes.length > 0 && new Set(baselineTypes).size === baselineTypes.length,
    `baselineMessageTypes holds ${baselineTypes.length} unique values`);
  check(typeof manifest.baselineMessageTypesCommand === 'string'
    && manifest.baselineMessageTypesCommand === `git show ${h.PIN_COMMIT}:${TYPES_RELATIVE_PATH}`,
  'baselineMessageTypesCommand names the full 8a058bdf sha and mcp/src/types.ts');
  if (Array.isArray(currentTypes)) {
    const addedTypes = currentTypes.filter((type) => !baselineTypes.includes(type));
    const removedTypes = baselineTypes.filter((type) => !currentTypes.includes(type));
    const unreviewedTypes = addedTypes.filter((type) => !(manifest.addedMessageTypes || []).includes(type));
    check(sameList(addedTypes, manifest.addedMessageTypes),
      `current MCPMessageType minus baselineMessageTypes equals addedMessageTypes in order (got ${JSON.stringify(addedTypes)})`
        + (unreviewedTypes.length ? `; unreviewed message type: ${unreviewedTypes.join(', ')}` : ''));
    check(removedTypes.length === 0,
      `no 8a058bdf message type is removed${removedTypes.length ? ` (removed: ${removedTypes.join(', ')})` : ''}`);
    check(isInOrderSubsequence(baselineTypes, currentTypes),
      'baselineMessageTypes is an in-order subsequence of the current MCPMessageType list');
    check(new Set(currentTypes).size === currentTypes.length, 'current MCPMessageType values are unique');
  }

  console.log('\n--- companion suites (composed, not re-checked) ---');
  const packageJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const rootCommands = String(packageJson.scripts && packageJson.scripts.test).split(' && ');
  const companions = manifest.companionSuites || [];
  check(companions.length === 4 && new Set(companions).size === 4, 'companionSuites names four distinct commands');
  for (const command of companions) {
    const count = rootCommands.filter((candidate) => candidate === command).length;
    check(count === 1, `${command} appears exactly once in package.json scripts.test (found ${count})`);
    const suitePath = command.replace(/^node\s+/, '');
    check(/^tests\/[A-Za-z0-9._-]+\.test\.js$/.test(suitePath) && fs.existsSync(path.join(REPO_ROOT, suitePath)),
      `${suitePath} exists`);
  }

  console.log('\n--- older-extension coverage (named, owned by its suites) ---');
  const coverage = manifest.oldExtensionCoverage || [];
  check(coverage.length === 2, 'oldExtensionCoverage names two cases');
  const coverageMarkers = [
    { code: 'SETTING_UNSUPPORTED', phase: '66.1-03' },
    { code: 'extension_unsupported', phase: '69-06' },
  ];
  for (const marker of coverageMarkers) {
    const entry = coverage.find((text) => text.includes(marker.phase) && text.includes(marker.code));
    check(Boolean(entry), `oldExtensionCoverage names the ${marker.phase} ${marker.code} case`);
    if (!entry) continue;
    const suiteMatch = entry.match(/tests\/[A-Za-z0-9._-]+\.test\.js/);
    const suitePath = suiteMatch ? suiteMatch[0] : null;
    check(Boolean(suitePath) && companions.includes(`node ${suitePath}`),
      `${marker.phase}: the named suite ${suitePath} is a registered companion suite`);
    check(Boolean(suitePath) && fs.existsSync(path.join(REPO_ROOT, suitePath))
      && fs.readFileSync(path.join(REPO_ROOT, suitePath), 'utf8').includes(marker.code),
    `${marker.phase}: ${suitePath} exercises ${marker.code}`);
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: mcp-release-compat threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
