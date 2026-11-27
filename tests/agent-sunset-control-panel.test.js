/**
 * Background-agents retirement: control panel and chat UI checks.
 *
 *   - The control panel keeps its note about the retired agents (now in
 *     the Help section), with both links (target=_blank rel=noopener
 *     noreferrer) and a footer naming v0.9.45rc1 and April 2026.
 *   - The commented-out agent UI (agent forms, /agent slash commands) and
 *     the old "Your previous agents" notice are gone; nothing in the UI
 *     reads bgAgents any more.
 *   - The Server Sync and pairing controls left with the Live Dashboard;
 *     none of their buttons is wired any more.
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

// ---- Section 4: the Server Sync and pairing controls are gone ----

{
  const js = read('extension/ui/options.js');
  const html = read('extension/ui/control_panel.html');
  // btnTestConnection is left out: the id is generic enough for a future feature to reuse.
  const retiredIds = ['btnPairDashboard', 'btnGenerateHashKey', 'btnCopyHashKey', 'btnCancelPairing'];

  let leftovers = [];
  for (const id of retiredIds) {
    if (js.includes("getElementById('" + id + "')")) leftovers.push('options.js looks up ' + id);
    if (html.includes('id="' + id + '"')) leftovers.push('control_panel.html renders ' + id);
  }

  if (leftovers.length === 0) pass('Server Sync and pairing controls are removed from the control panel');
  else fail('Server Sync and pairing controls still present', leftovers.join('; '));
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
