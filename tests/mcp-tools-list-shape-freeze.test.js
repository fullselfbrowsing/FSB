'use strict';

/**
 * Phase 69 Plan 01 (MCP-04-a, CONTEXT D-22): shape freeze of tools/list.
 *
 * A description-free projection (projectShape: names, property names and
 * types, required lists, defaults, enums, exclusiveMinimum,
 * additionalProperties, $schema, execution) of the current mcp/build
 * tools/list must equal the projection of the frozen 8a058bdf fixture.
 * Descriptions are free to change (they are governed by
 * tests/mcp-description-budget.test.js); everything else is frozen.
 *
 * Exactly two differences are tolerated:
 *   - an optional `expect` property on the 29 D-12 tools
 *     (EXPECT_TOOL_NAMES_VERBATIM), never in `required`, with one
 *     byte-identical, closed, flat schema of at most EXPECT_SCHEMA_BYTE_CAP
 *     canonical bytes and no sub-property descriptions;
 *   - the Phase 66.1 `settings` tool, identified by name (never by a total
 *     tool count, D-02).
 *
 * EXPECT_REQUIRED is true since plan 69-06 published `expect`: every one of
 * the 29 tools must carry it.
 *
 * Run: npm --prefix mcp run build && node tests/mcp-tools-list-shape-freeze.test.js
 */

const path = require('path');
const { pathToFileURL } = require('url');

const EXPECT_REQUIRED = true;
const EXPECT_SCHEMA_BYTE_CAP = 600;

const HELPER_PATH = path.join(__dirname, 'helpers', 'mcp-in-process.mjs');
const DRIFT_PREVIEW_CHARS = 400;
const FORBIDDEN_EXPECT_KEYWORDS = ['$ref', '$defs', 'anyOf', 'oneOf'];

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

function preview(text) {
  return text.length > DRIFT_PREVIEW_CHARS ? `${text.slice(0, DRIFT_PREVIEW_CHARS)}...` : text;
}

// Every key used anywhere inside a JSON value.
function collectKeys(value, out = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      out.add(key);
      collectKeys(child, out);
    }
  }
  return out;
}

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

(async () => {
  const h = await import(pathToFileURL(HELPER_PATH).href);
  const fixture = h.readBaselineFixture();
  const baselineTools = fixture.tools;
  const current = h.sortByName(await h.listCurrentTools());
  const expectNames = new Set(h.EXPECT_TOOL_NAMES_VERBATIM);

  console.log('\n--- the D-12 expect list ---');
  check(h.EXPECT_TOOL_NAMES_VERBATIM.length === 29 && expectNames.size === 29,
    'EXPECT_TOOL_NAMES_VERBATIM holds 29 unique names');
  const baselineNames = new Set(baselineTools.map((tool) => tool.name));
  const unknownExpectNames = h.EXPECT_TOOL_NAMES_VERBATIM.filter((name) => !baselineNames.has(name));
  check(unknownExpectNames.length === 0,
    `every expect tool exists in the 8a058bdf baseline${unknownExpectNames.length ? ` (unknown: ${unknownExpectNames.join(', ')})` : ''}`);
  const baselineWithExpect = baselineTools.filter((tool) => hasOwn(tool.inputSchema && tool.inputSchema.properties, 'expect'));
  check(baselineWithExpect.length === 0, 'no baseline tool already has an `expect` property');

  console.log('\n--- names (settings excluded by name, no total count asserted) ---');
  const settingsTool = current.find((tool) => tool.name === h.SETTINGS_TOOL_NAME);
  if (settingsTool) console.log('  settings present (Phase 66.1), excluded by name');
  else console.log('  settings absent from the current build');
  const currentNames = current.map((tool) => tool.name).filter((name) => name !== h.SETTINGS_TOOL_NAME);
  const missing = [...baselineNames].filter((name) => !currentNames.includes(name));
  const extra = currentNames.filter((name) => !baselineNames.has(name));
  check(missing.length === 0 && extra.length === 0,
    'current tool names minus settings equal the 8a058bdf baseline names'
      + (missing.length ? `; missing: ${missing.join(', ')}` : '')
      + (extra.length ? `; unexpected: ${extra.join(', ')}` : ''));
  check(new Set(currentNames).size === currentNames.length, 'current tool names are unique');

  console.log('\n--- description-free projection per baseline tool ---');
  const currentByName = new Map(current.map((tool) => [tool.name, tool]));
  const publishedExpect = [];
  let matched = 0;
  for (const baselineTool of baselineTools) {
    const name = baselineTool.name;
    const tool = currentByName.get(name);
    if (!tool) continue; // reported by the name check above
    const projection = h.projectShape(tool);
    const properties = tool.inputSchema && tool.inputSchema.properties;
    const required = (tool.inputSchema && Array.isArray(tool.inputSchema.required)) ? tool.inputSchema.required : [];

    if (hasOwn(properties, 'expect')) {
      if (expectNames.has(name)) {
        publishedExpect.push({ name, schema: properties.expect });
        delete projection.inputSchema.properties.expect;
      } else {
        check(false, `${name}: \`expect\` is published on a tool outside the 29 D-12 tools`);
      }
    } else if (EXPECT_REQUIRED && expectNames.has(name)) {
      check(false, `${name}: \`expect\` is missing (EXPECT_REQUIRED)`);
    }
    if (required.includes('expect')) check(false, `${name}: \`expect\` must never be in required`);

    const actualShape = h.canonicalJson(projection);
    const expectedShape = h.canonicalJson(h.projectShape(baselineTool));
    if (actualShape === expectedShape) {
      matched++;
    } else {
      check(false, `${name}: shape drifted from 8a058bdf (types, required, defaults, enums or other non-description keys)`);
      console.error(`    baseline: ${preview(expectedShape)}`);
      console.error(`    current:  ${preview(actualShape)}`);
    }
  }
  check(matched === baselineTools.length - missing.length,
    `${matched} of ${baselineTools.length} baseline tools keep their 8a058bdf shape (descriptions excluded)`);

  console.log('\n--- the optional `expect` schema ---');
  if (publishedExpect.length === 0) {
    console.log(`  no tool publishes \`expect\` yet (EXPECT_REQUIRED=${EXPECT_REQUIRED})`);
  } else {
    console.log(`  \`expect\` published on ${publishedExpect.length} of 29 tools`);
  }
  if (EXPECT_REQUIRED) {
    check(publishedExpect.length === 29, `every D-12 tool publishes \`expect\` (got ${publishedExpect.length})`);
  }
  if (publishedExpect.length > 0) {
    const reference = h.canonicalJson(publishedExpect[0].schema);
    const differing = publishedExpect.filter((entry) => h.canonicalJson(entry.schema) !== reference).map((entry) => entry.name);
    check(differing.length === 0,
      `every published \`expect\` schema is byte-identical${differing.length ? ` (differs: ${differing.join(', ')})` : ''}`);
    for (const { name, schema } of publishedExpect) {
      const bytes = h.canonicalBytes(schema);
      const keys = collectKeys(schema);
      const subProperties = (schema && schema.properties) || {};
      const describedSubProperties = Object.entries(subProperties)
        .filter(([, sub]) => collectKeys(sub).has('description'))
        .map(([key]) => key);
      check(bytes <= EXPECT_SCHEMA_BYTE_CAP, `${name}: \`expect\` is ${bytes} canonical bytes (cap ${EXPECT_SCHEMA_BYTE_CAP})`);
      check(schema && schema.type === 'object' && schema.additionalProperties === false,
        `${name}: \`expect\` is type object with additionalProperties false`);
      const forbidden = FORBIDDEN_EXPECT_KEYWORDS.filter((keyword) => keys.has(keyword));
      check(forbidden.length === 0, `${name}: \`expect\` has no $ref/$defs/anyOf/oneOf${forbidden.length ? ` (found ${forbidden.join(', ')})` : ''}`);
      check(describedSubProperties.length === 0,
        `${name}: \`expect\` sub-properties carry no descriptions${describedSubProperties.length ? ` (${describedSubProperties.join(', ')})` : ''}`);
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: mcp-tools-list-shape-freeze threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
