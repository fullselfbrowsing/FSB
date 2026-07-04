/**
 * Phase 212-02 regression tests
 *
 * Verifies the deprecation notice, sunset notice, and slash-command commenting:
 *   - AGENTS-01: deprecation notice with both CTAs (target=_blank rel=noopener noreferrer)
 *                and a footer naming v0.9.45rc1 plus April 2026.
 *   - AGENTS-02 (UI portion): canonical annotations on every commented agent code path;
 *                Server Sync + pairing wiring at ui/options.js:4189-4205 stays LIVE
 *                because Phase 213 relocates it.
 *   - AGENTS-03: names list scaffolding present and rendering function defined;
 *                names rendered via textContent only (T-01 mitigation against XSS).
 *
 * Plain Node + assert + fs. No browser, no chrome stubs.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ANNOTATION = '// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md';

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function countSubstring(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
  return count;
}

function extractDeprecationFooterTexts(source) {
  const footers = [];
  const footerRegex = /<small[^>]*class="[^"]*(?:sync-deprecation-foot|fsb-deprecation-footer)[^"]*"[^>]*>([\s\S]*?)<\/small>/g;
  let match;
  while ((match = footerRegex.exec(source)) !== null) {
    footers.push(match[1].replace(/\s+/g, ' ').trim());
  }
  return footers;
}

/** Returns the substring of source between the line that opens `signature` and its matching closing brace. */
function extractFunctionBody(source, signature) {
  const startIdx = source.indexOf(signature);
  if (startIdx === -1) return null;
  const openIdx = source.indexOf('{', startIdx);
  if (openIdx === -1) return null;
  let depth = 1;
  let i = openIdx + 1;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  return source.slice(openIdx, i);
}

let failures = 0;
function pass(label) { console.log('PASS - ' + label); }
function fail(label, detail) {
  failures += 1;
  console.log('FAIL - ' + label);
  if (detail) console.log('       ' + detail);
}

// ---- Section 1: AGENTS-01 deprecation notice present in control_panel.html ----

{
  const src = read('extension/ui/control_panel.html');
  const tryOpenClaw = countSubstring(src, 'Try OpenClaw') === 1;
  const tryRoutines = countSubstring(src, 'Try Claude Routines') === 1;
  const noNoopener = (src.match(/rel="noopener noreferrer"/g) || []).length;
  const footerTexts = extractDeprecationFooterTexts(src);
  const footer = footerTexts.filter(text => (
    text.includes('Retired in v0.9.45rc1') &&
    text.includes('April 2026')
  )).length === 1;
  if (tryOpenClaw && tryRoutines && noNoopener >= 2 && footer) {
    pass('AGENTS-01 deprecation notice present (CTAs + semantic footer; rel=noopener noreferrer count=' + noNoopener + ')');
  } else {
    fail('AGENTS-01 deprecation notice incomplete', 'tryOpenClaw=' + tryOpenClaw + ' tryRoutines=' + tryRoutines + ' noopener=' + noNoopener + ' footer=' + footer + ' footerTexts=' + JSON.stringify(footerTexts));
  }
}

// ---- Section 2: NO emojis in modified UI files (CLAUDE.md rule) ----

const emojiTargets = [
  'extension/ui/control_panel.html',
  'extension/ui/options.css',
  'extension/ui/options.js',
  'extension/ui/sidepanel.js',
  'extension/ui/popup.js',
];
{
  // Match characters in supplementary planes (U+10000+) which encode as 4-byte UTF-8.
  // This is a strict superset of the emoji range and a reliable proxy for emoji presence.
  const emojiRegex = /[\u{10000}-\u{10FFFF}]/u;
  let violations = [];
  for (const f of emojiTargets) {
    const src = read(f);
    if (emojiRegex.test(src)) {
      const m = src.match(emojiRegex);
      violations.push(f + ' -- found 4-byte UTF-8 character: U+' + m[0].codePointAt(0).toString(16).toUpperCase());
    }
  }
  if (violations.length === 0) pass('No emojis in modified UI files (CLAUDE.md rule honored)');
  else fail('Emojis detected in modified UI files', violations.join('; '));
}

// ---- Section 3: AGENTS-02 (UI portion) annotation counts ----

{
  const opts = read('extension/ui/options.js');
  const sp = read('extension/ui/sidepanel.js');
  const pop = read('extension/ui/popup.js');
  const css = read('extension/ui/options.css');

  const optsCount = countSubstring(opts, ANNOTATION);
  const spCount = countSubstring(sp, ANNOTATION);
  const popCount = countSubstring(pop, ANNOTATION);
  // CSS uses block-comment syntax `/* ... */`, so match on the annotation text without the JS `//` prefix.
  const ANNOTATION_TEXT = 'DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md';
  const cssCount = countSubstring(css, ANNOTATION_TEXT);

  if (optsCount >= 11) pass('AGENTS-02 ui/options.js annotation count >= 11 (got ' + optsCount + ')');
  else fail('AGENTS-02 ui/options.js annotation count too low (got ' + optsCount + ', expected >= 11)');

  if (spCount >= 2) pass('AGENTS-02 ui/sidepanel.js annotation count >= 2 (got ' + spCount + ')');
  else fail('AGENTS-02 ui/sidepanel.js annotation count too low (got ' + spCount + ', expected >= 2)');

  if (popCount >= 2) pass('AGENTS-02 ui/popup.js annotation count >= 2 (got ' + popCount + ')');
  else fail('AGENTS-02 ui/popup.js annotation count too low (got ' + popCount + ', expected >= 2)');

  if (cssCount >= 1) pass('AGENTS-02 ui/options.css annotation count >= 1 (got ' + cssCount + ')');
  else fail('AGENTS-02 ui/options.css annotation missing (got ' + cssCount + ')');
}

// ---- Section 4: D-15 -- Server Sync + pairing wiring at ui/options.js:4189-4205 stays LIVE ----

{
  const src = read('extension/ui/options.js');
  const lines = src.split('\n');
  const liveIds = ['btnPairDashboard', 'btnGenerateHashKey', 'btnCopyHashKey', 'btnTestConnection', 'btnCancelPairing'];

  let violations = [];
  for (const id of liveIds) {
    const liveHits = lines.filter(line =>
      line.indexOf("getElementById('" + id + "')") !== -1 &&
      !/^\s*\/\//.test(line)
    );
    if (liveHits.length === 0) {
      violations.push(id + ' -- no LIVE getElementById call found (Phase 213 relocation requires this preserved)');
    }
  }

  if (violations.length === 0) pass('D-15 Server Sync + pairing wiring preserved LIVE for Phase 213 relocation');
  else fail('D-15 Server Sync + pairing wiring broken', violations.join('; '));
}

// ---- Section 5: AGENTS-03 names list scaffolding + rendering function present ----

{
  const html = read('extension/ui/control_panel.html');
  const opts = read('extension/ui/options.js');
  const ids = ['fsbSunsetNotice', 'fsbSunsetNoticeNames', 'fsbSunsetNoticeDismiss'];
  let missing = [];
  for (const id of ids) {
    if (html.indexOf('id="' + id + '"') === -1) missing.push('control_panel.html missing id="' + id + '"');
  }
  const fnDef = /function initializeBackgroundAgentsDeprecation\s*\(/.test(opts);
  const fnCall = /initializeBackgroundAgentsDeprecation\s*\(\)\s*;/.test(opts);
  if (missing.length === 0 && fnDef && fnCall) {
    pass('AGENTS-03 names list scaffolding + rendering function present and called');
  } else {
    fail('AGENTS-03 scaffolding incomplete', 'missing=' + JSON.stringify(missing) + ' fnDef=' + fnDef + ' fnCall=' + fnCall);
  }
}

// ---- Section 6: T-01 -- XSS mitigation: function uses textContent, NOT innerHTML, for agent names ----

{
  const opts = read('extension/ui/options.js');
  const body = extractFunctionBody(opts, 'function initializeBackgroundAgentsDeprecation');
  if (!body) {
    fail('T-01 could not extract initializeBackgroundAgentsDeprecation body');
  } else {
    const usesTextContent = body.indexOf('.textContent =') !== -1;
    const usesInnerHTML = body.indexOf('.innerHTML =') !== -1 || body.indexOf('.innerHTML=') !== -1;
    if (usesTextContent && !usesInnerHTML) {
      pass('T-01 agent names rendered via textContent; no innerHTML assignment in initializeBackgroundAgentsDeprecation');
    } else {
      fail('T-01 XSS mitigation broken', 'usesTextContent=' + usesTextContent + ' usesInnerHTML=' + usesInnerHTML);
    }
  }
}

// ---- Section 7: Gap 1 / WR-01 -- bgAgents storage-shape coercion handles BOTH legacy object-map and defensive array shapes ----

{
  const opts = read('extension/ui/options.js');
  const body = extractFunctionBody(opts, 'function initializeBackgroundAgentsDeprecation');
  if (!body) {
    fail('Gap1 could not extract initializeBackgroundAgentsDeprecation body for storage-shape check');
  } else {
    // Canonical legacy shape (the only writer that ever ran wrote { agentId: agent } map):
    // the renderer MUST handle it via Object.values.
    const handlesObjectMap = body.indexOf('Object.values(') !== -1;
    // Defensive: the renderer MUST also handle a plain array shape.
    const handlesArray = body.indexOf('Array.isArray(') !== -1;
    // Regression guard: the buggy single-branch Array.isArray(stored.bgAgents) literal MUST be gone.
    const hasBuggyOldBranch = body.indexOf('Array.isArray(stored.bgAgents)') !== -1;

    if (handlesObjectMap && handlesArray && !hasBuggyOldBranch) {
      pass('Gap1 / WR-01 storage-shape coercion handles object-map (Object.values) AND array (Array.isArray) shapes; old single-branch literal removed');
    } else {
      fail(
        'Gap1 / WR-01 storage-shape coercion incomplete',
        'handlesObjectMap=' + handlesObjectMap + ' handlesArray=' + handlesArray + ' hasBuggyOldBranch=' + hasBuggyOldBranch
      );
    }
  }
}

// ---- Result ----

if (failures === 0) {
  console.log('');
  console.log('All Phase 212-02 regression checks PASSED');
  process.exit(0);
} else {
  console.log('');
  console.log(failures + ' check(s) FAILED');
  process.exit(1);
}
