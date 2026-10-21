/**
 * Background-agents retirement: control panel and chat UI checks.
 *
 *   - The Sync tab keeps its note about the retired agents, with both
 *     links (target=_blank rel=noopener noreferrer) and a footer naming
 *     v0.9.45rc1 and April 2026.
 *   - The commented-out agent UI (agent forms, /agent slash commands) and
 *     the old "Your previous agents" notice are gone; nothing in the UI
 *     reads bgAgents any more.
 *   - Server Sync and pairing wiring stays live.
 *
 * Plain Node + assert + fs. No browser, no chrome stubs.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RETIRED_ANNOTATION = 'DEPRECATED v0.9.45rc1';

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

// ---- Section 3: the commented-out agent UI is gone ----

{
  const files = {
    'extension/ui/options.js': read('extension/ui/options.js'),
    'extension/ui/sidepanel.js': read('extension/ui/sidepanel.js'),
    'extension/ui/popup.js': read('extension/ui/popup.js'),
    'extension/ui/options.css': read('extension/ui/options.css'),
  };
  for (const [rel, src] of Object.entries(files)) {
    if (countSubstring(src, RETIRED_ANNOTATION) === 0) pass('no retired-agent annotation left in ' + rel);
    else fail('retired-agent annotation still present in ' + rel);
  }
  for (const rel of ['extension/ui/sidepanel.js', 'extension/ui/popup.js']) {
    if (!/handleAgentCommand|startsWith\('\/agent'\)/.test(files[rel])) pass(rel + ' has no /agent slash-command code');
    else fail(rel + ' still carries /agent slash-command code');
  }
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

// ---- Section 5: the old agent-names notice is gone ----

{
  const html = read('extension/ui/control_panel.html');
  const opts = read('extension/ui/options.js');
  const leftovers = [];
  for (const id of ['fsbSunsetNotice', 'fsbSunsetNoticeNames', 'fsbSunsetNoticeDismiss']) {
    if (html.includes('id="' + id + '"')) leftovers.push('control_panel.html id="' + id + '"');
  }
  if (opts.includes('initializeBackgroundAgentsDeprecation')) leftovers.push('options.js initializeBackgroundAgentsDeprecation');
  if (opts.includes('bgAgents')) leftovers.push('options.js reads bgAgents');
  if (opts.includes('fsb_sunset_notice_dismissed')) leftovers.push('options.js writes fsb_sunset_notice_dismissed');
  if (leftovers.length === 0) pass('agent-names notice, its renderer and its storage reads are removed');
  else fail('agent-names notice leftovers', leftovers.join('; '));
}

// ---- Result ----

if (failures === 0) {
  console.log('');
  console.log('All background-agent UI retirement checks PASSED');
  process.exit(0);
} else {
  console.log('');
  console.log(failures + ' check(s) FAILED');
  process.exit(1);
}
