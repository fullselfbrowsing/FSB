'use strict';

/**
 * The outcome-aware tool-count rule for README.md and mcp/README.md
 * (Phase 71 D-27 and its 2026-10-16 amendment).
 *
 * The documented count is checked against the built tools/list length, never
 * against a literal. A marker sentence in the "### Tool Count Contract"
 * section of mcp/README.md declares which of two states the docs are in:
 *
 * - includes: the count includes the tools the reviewed release delta adds
 *   (tests/fixtures/mcp-release-delta-<release>.json addedTools), so the
 *   expected count is the built length;
 * - excludes: the count leaves those tools out because that MCP release is not
 *   published yet, so the expected count is the built length minus addedTools.
 *   This state is refused once mcp/package.json reaches the release.
 *
 * The excludes state is the V6 fallback M-71-11b (MCP 0.12.0 withheld while
 * mcp/src still registers its tools): a docs-only edit that this unchanged
 * rule accepts.
 *
 * Pure: no I/O. The caller passes the file texts, the built tool names, the
 * parsed manifest and the canonical MCP version. Errors name rules and
 * numbers, never file text.
 */

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const ROOT_TABLE_HEADER = /^\|\s*Surface\s*\|\s*Count\s*\|\s*Examples\s*\|\s*$/u;
const ROOT_TABLE_MIN_ROWS = 9;
const CONTRACT_HEADING = '### Tool Count Contract';
const TOOLS_HEADING = /^## Tools \((\d+) Total\)$/gmu;
const COUNTED_HEADING = /^### (.+) \((\d+)\)$/u;
const CONTENTS_LINK = /\(#tools-(\d+)-total\)/gu;
const ANY_TOOLS_ANCHOR = /#tools-(\d+)-total\b/gu;
const COUNT_PHRASE = /\b(\d+) registered (?:MCP )?tools\b/gu;

function TOOL_COUNT_MARKERS(release) {
  return Object.freeze({
    includes: `The documented count includes the tools added in fsb-mcp-server ${release}.`,
    excludes: `The documented count excludes the tools added in fsb-mcp-server ${release}, which is not published yet.`,
  });
}

function parseSemver(value) {
  const match = typeof value === 'string' ? value.match(SEMVER) : null;
  return match ? match.slice(1, 4).map(Number) : null;
}

function semverBelow(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

function countOccurrences(text, needle) {
  let count = 0;
  let index = text.indexOf(needle);
  while (index !== -1) {
    count++;
    index = text.indexOf(needle, index + needle.length);
  }
  return count;
}

function splitLines(text) {
  return String(text).split(/\r?\n/u);
}

/** Lines of the section that starts at a line equal to `heading`, up to the next heading of level 1-3. */
function sectionLines(lines, heading) {
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return null;
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,3} /u.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body;
}

/** Rows of the root category table: [{count, text}] or null when the header is missing. */
function rootTableRows(lines) {
  const header = lines.findIndex((line) => ROOT_TABLE_HEADER.test(line));
  if (header === -1) return null;
  const rows = [];
  for (let i = header + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) break;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    const count = /^\d+$/u.test(cells[1] || '') ? Number(cells[1]) : NaN;
    rows.push({ count, text: line });
  }
  return rows;
}

/** Counted `### <Name> (<k>)` sections under the single `## Tools (<n> Total)` heading. */
function countedSections(lines) {
  const start = lines.findIndex((line) => /^## Tools \(\d+ Total\)$/u.test(line));
  if (start === -1) return null;
  const sections = [];
  let current = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{1,2} /u.test(line)) break;
    if (line.startsWith('### ')) {
      const match = line.match(COUNTED_HEADING);
      current = match ? { count: Number(match[2]), body: [] } : null;
      if (current) sections.push(current);
      continue;
    }
    if (current) current.body.push(line);
  }
  return sections;
}

function mentionsTool(text, name) {
  return text.includes(`\`${name}\``);
}

function requireInputs({ rootReadme, mcpReadme, builtToolNames, manifest, mcpVersion }) {
  if (typeof rootReadme !== 'string' || rootReadme.length === 0) {
    throw new TypeError('checkToolCountDocs: rootReadme must be a non-empty string');
  }
  if (typeof mcpReadme !== 'string' || mcpReadme.length === 0) {
    throw new TypeError('checkToolCountDocs: mcpReadme must be a non-empty string');
  }
  if (!Array.isArray(builtToolNames) || builtToolNames.length === 0
      || builtToolNames.some((name) => typeof name !== 'string' || name.length === 0)) {
    throw new TypeError('checkToolCountDocs: builtToolNames must be a non-empty array of names');
  }
  if (!manifest || typeof manifest !== 'object' || !parseSemver(manifest.release)
      || !Array.isArray(manifest.addedTools)
      || manifest.addedTools.some((name) => typeof name !== 'string' || name.length === 0)) {
    throw new TypeError('checkToolCountDocs: manifest needs a semver release and an addedTools name list');
  }
  if (typeof mcpVersion !== 'string' || mcpVersion.length === 0) {
    throw new TypeError('checkToolCountDocs: mcpVersion must be a non-empty string');
  }
}

/**
 * @returns {{ok: boolean, state: ('includes'|'excludes'|null), expected: (number|null), errors: string[]}}
 */
function checkToolCountDocs(input = {}) {
  requireInputs(input);
  const { rootReadme, mcpReadme, builtToolNames, manifest, mcpVersion } = input;
  const errors = [];
  const markers = TOOL_COUNT_MARKERS(manifest.release);
  const mcpLines = splitLines(mcpReadme);
  const rootLines = splitLines(rootReadme);

  // 1. The declared state: exactly one marker sentence, on its own line, in the contract section.
  const contract = sectionLines(mcpLines, CONTRACT_HEADING);
  if (!contract) {
    errors.push('contract_section_missing');
    return { ok: false, state: null, expected: null, errors };
  }
  const contractText = contract.join('\n');
  const includesHits = countOccurrences(contractText, markers.includes);
  const excludesHits = countOccurrences(contractText, markers.excludes);
  if (includesHits + excludesHits === 0) {
    errors.push('marker_missing');
    return { ok: false, state: null, expected: null, errors };
  }
  if (includesHits + excludesHits > 1) {
    errors.push(`marker_ambiguous (includes ${includesHits}, excludes ${excludesHits})`);
    return { ok: false, state: null, expected: null, errors };
  }
  const state = includesHits === 1 ? 'includes' : 'excludes';
  const marker = markers[state];
  if (!contract.some((line) => line.trim() === marker)) errors.push('marker_not_own_line');
  for (const [name, sentence] of Object.entries(markers)) {
    const outside = countOccurrences(mcpReadme, sentence) - countOccurrences(contractText, sentence);
    if (outside > 0) errors.push(`marker_outside_contract (${name} ${outside})`);
  }

  // 2. The expected count.
  const added = manifest.addedTools;
  let expected = builtToolNames.length;
  if (state === 'excludes') {
    const missing = added.filter((name) => !builtToolNames.includes(name)).length;
    if (missing > 0) errors.push(`excluded_tool_not_built (${missing})`);
    expected = builtToolNames.length - added.length;
    const current = parseSemver(mcpVersion);
    const release = parseSemver(manifest.release);
    if (!current) errors.push('mcp_version_invalid');
    else if (!semverBelow(current, release)) errors.push('excludes_after_release');
  }

  // 3. Count sentences in both READMEs.
  if (!rootReadme.includes(`${expected} registered MCP tools`)) {
    errors.push(`root_count_sentence (expected ${expected})`);
  }
  for (const [label, text] of [['root', rootReadme], ['mcp', mcpReadme]]) {
    const stale = Array.from(text.matchAll(COUNT_PHRASE), (match) => Number(match[1]))
      .filter((count) => count !== expected);
    if (stale.length > 0) errors.push(`${label}_count_phrase_mismatch (expected ${expected}, found ${stale.join(', ')})`);
  }

  // 4. The MCP README heading and its contents-link anchor.
  const headingCounts = Array.from(mcpReadme.matchAll(TOOLS_HEADING), (match) => Number(match[1]));
  if (headingCounts.length !== 1 || headingCounts[0] !== expected) {
    errors.push(`mcp_tools_heading (expected ${expected}, found ${headingCounts.join(', ') || 'none'})`);
  }
  const linkCounts = Array.from(mcpReadme.matchAll(CONTENTS_LINK), (match) => Number(match[1]));
  if (!linkCounts.includes(expected) || linkCounts.some((count) => count !== expected)) {
    errors.push(`contents_link (expected ${expected}, found ${linkCounts.join(', ') || 'none'})`);
  }
  const rootAnchors = Array.from(rootReadme.matchAll(ANY_TOOLS_ANCHOR), (match) => Number(match[1]))
    .filter((count) => count !== expected);
  if (rootAnchors.length > 0) errors.push(`root_tools_anchor (expected ${expected}, found ${rootAnchors.join(', ')})`);

  // 5. The root category table.
  const rows = rootTableRows(rootLines);
  if (!rows) {
    errors.push('root_table_missing');
  } else {
    if (rows.length < ROOT_TABLE_MIN_ROWS) errors.push(`root_table_rows (at least ${ROOT_TABLE_MIN_ROWS}, found ${rows.length})`);
    if (rows.some((row) => Number.isNaN(row.count))) errors.push('root_table_count_not_integer');
    const sum = rows.reduce((total, row) => total + (Number.isNaN(row.count) ? 0 : row.count), 0);
    if (sum !== expected) errors.push(`root_table_sum (expected ${expected}, found ${sum})`);
  }

  // 6. The counted MCP README sections.
  const sections = countedSections(mcpLines);
  if (!sections || sections.length === 0) {
    errors.push('mcp_sections_missing');
  } else {
    const sum = sections.reduce((total, section) => total + section.count, 0);
    if (sum !== expected) errors.push(`mcp_sections_sum (expected ${expected}, found ${sum})`);
  }

  // 7. The added tools are counted exactly when the state says so.
  const countedRootText = rows ? rows.map((row) => row.text).join('\n') : '';
  const countedMcpText = sections ? sections.map((section) => section.body.join('\n')).join('\n') : '';
  if (state === 'excludes') {
    const counted = added.filter((name) => mentionsTool(countedRootText, name) || mentionsTool(countedMcpText, name));
    if (counted.length > 0) errors.push(`excluded_tool_counted (${counted.length})`);
  } else {
    const absent = added.filter((name) => !mentionsTool(countedMcpText, name));
    if (absent.length > 0) errors.push(`included_tool_not_listed (${absent.length})`);
  }

  return { ok: errors.length === 0, state, expected, errors };
}

module.exports = {
  TOOL_COUNT_MARKERS,
  checkToolCountDocs,
};
