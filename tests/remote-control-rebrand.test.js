/**
 * Sync consolidation rebrand checks (post-Phase 223).
 *
 * Phase 223 originally renamed "Agents" -> "Remote Control (Beta)". The
 * follow-up consolidation removes the standalone "Remote Control" tab and
 * folds the Beta badge + deprecation notice + sunset notice INTO the existing
 * Sync section. This test asserts the consolidated state.
 *
 * Static-analysis only. Plain Node + fs reads + string .includes() / RegExp
 * checks. Mirrors the canonical pattern from tests/sync-tab-runtime.test.js.
 *
 * Run: node tests/remote-control-rebrand.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const CP = read(path.join('extension', 'ui', 'control_panel.html'));
const ABOUT = read(path.join('showcase', 'angular', 'src', 'app', 'pages', 'about', 'about-page.component.html'));
const SUPPORT = read(path.join('showcase', 'angular', 'src', 'app', 'pages', 'support', 'support-page.component.html'));
const CSS = read(path.join('extension', 'ui', 'options.css'));

console.log('\n--- Sync nav: Beta badge on Sync (consolidation) ---');

assert(
  CP.includes('<span>Sync <span class="feature-badge beta">Beta</span></span>'),
  '[SYNC-01] control_panel.html Sync nav-item carries the Beta badge inline'
);
assert(
  !/<span>Remote Control <span class="feature-badge beta">Beta<\/span><\/span>/.test(CP),
  '[SYNC-01] control_panel.html no longer contains the standalone "Remote Control <Beta>" nav label'
);
assert(
  !/<span>Agents <span class="feature-badge beta">Beta<\/span><\/span>/.test(CP),
  '[SYNC-01] control_panel.html no longer contains the legacy "Agents <Beta>" nav label'
);

console.log('\n--- Beta badge reuse (no new variant) ---');

assert(
  /\.feature-badge\.beta\s*\{/.test(CSS),
  '[SYNC-02] options.css continues to define .feature-badge.beta (reused, not duplicated)'
);
const newVariantMatches = CSS.match(/\.feature-badge\.[a-z-]+\s*\{/g) || [];
assert(
  newVariantMatches.length <= 4,
  '[SYNC-02] no proliferation of new .feature-badge.* variants (cap at existing count)'
);

console.log('\n--- Remote Control tab removed; background-agents id gone ---');

assert(
  !/data-section="background-agents"/.test(CP),
  '[SYNC-03] no nav item references data-section="background-agents"'
);
assert(
  !/<section[^>]*id="background-agents"/.test(CP),
  '[SYNC-03] no <section id="background-agents"> remains'
);
assert(
  !/<h2>Remote Control<\/h2>/.test(CP),
  '[SYNC-03] no standalone "<h2>Remote Control</h2>" section header remains'
);

console.log('\n--- Deprecation notice lives inside Sync section ---');

const syncSectionMatch = CP.match(/<section[^>]*id="sync"[\s\S]*?<\/section>/);
assert(!!syncSectionMatch, '[SYNC-04] <section id="sync"> ... </section> exists');

const syncBody = syncSectionMatch ? syncSectionMatch[0] : '';
assert(
  /Background agents have left the building/.test(syncBody),
  '[SYNC-04] deprecation headline "Background agents have left the building" lives inside #sync'
);
assert(
  /href="https:\/\/github\.com\/openclaw\/openclaw"[^>]*rel="noopener noreferrer"/.test(syncBody),
  '[SYNC-04] OpenClaw CTA (rel="noopener noreferrer") lives inside #sync'
);
assert(
  /href="https:\/\/www\.anthropic\.com\/claude\/routines"[^>]*rel="noopener noreferrer"/.test(syncBody),
  '[SYNC-04] Claude Routines CTA (rel="noopener noreferrer") lives inside #sync'
);
assert(
  /Retired in v0\.9\.45rc1/.test(syncBody) && /April 2026/.test(syncBody),
  '[SYNC-04] deprecation footer names v0.9.45rc1 plus April 2026 inside #sync'
);
assert(
  /id="fsbSunsetNotice"/.test(syncBody) &&
  /id="fsbSunsetNoticeNames"/.test(syncBody) &&
  /id="fsbSunsetNoticeDismiss"/.test(syncBody),
  '[SYNC-04] sunset-notice scaffolding (fsbSunsetNotice / Names / Dismiss) lives inside #sync'
);

console.log('\n--- Showcase mirror reflects Sync consolidation ---');

const syncArchBoxRe = /<h4[^>]*>Sync<\/h4>\s*<p[^>]*>Live extension control surface, paired via QR<\/p>/;
const hasLegacyArchSection = /arch-section|arch-diagram|about\.arch\./.test(ABOUT);

assert(
  syncArchBoxRe.test(ABOUT) || !hasLegacyArchSection,
  '[SYNC-05] about-page architecture either names Sync as the paired extension control surface or removes the legacy architecture section'
);
assert(
  !/<i class="fa-solid fa-server"><\/i> Remote Control/.test(ABOUT),
  '[SYNC-05] about-page no longer references the old Remote Control sidebar label'
);
assert(
  !/Extension Control Surface|control-preview|rec-sidebar|rec-badge-beta/.test(ABOUT),
  '[SYNC-05] about-page does not reintroduce the removed decorative control-surface preview'
);
assert(
  !/<h4[^>]*>Remote Control<\/h4>/.test(ABOUT),
  '[SYNC-05] about-page arch-box no longer reads "Remote Control"'
);
assert(
  /<h4[^>]*>Sync<\/h4>/.test(ABOUT) || !hasLegacyArchSection,
  '[SYNC-05] about-page arch-box renamed to "Sync" or legacy architecture section removed'
);
// SYNC-05 originally required a "What is Sync?" FAQ entry to enforce the
// Remote Control -> Sync rebrand. The FAQ has since been pruned to keep the
// support page focused on MCP / OpenClaw onboarding (the rebrand itself is
// still enforced on the about-page arch-box and the absence assertions
// below). Keep the negative guards so the old labels cannot reappear.
assert(
  !/<h3>What is Remote Control\?<\/h3>/.test(SUPPORT),
  '[SYNC-05] support-page FAQ no longer asks "What is Remote Control?"'
);
assert(
  !/<h3>What are Background Agents\?<\/h3>/.test(SUPPORT),
  '[SYNC-05] support-page FAQ no longer asks "What are Background Agents?"'
);

console.log('\n--- Emoji guard (CLAUDE.md global rule) ---');

const emojiRe = /[\u{10000}-\u{10FFFF}]/u;
[['control_panel.html', CP], ['about-page', ABOUT], ['support-page', SUPPORT]].forEach(function (pair) {
  assert(!emojiRe.test(pair[1]), '[SYNC-EMOJI] ' + pair[0] + ' contains no emoji (CLAUDE.md global rule)');
});

console.log('\n=== Sync consolidation results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
