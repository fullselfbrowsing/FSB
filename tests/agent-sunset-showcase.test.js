/**
 * Phase 212-03 regression tests
 *
 * Verifies the showcase mirror of the agents sunset:
 *   - AGENTS-04: vanilla + Angular dashboards show the sunset card and removed agent UI stays removed.
 *   - D-19: _lz decompression and remote-control state consumers are BYTE-FOR-BYTE
 *           preserved on a LIVE (non-commented) line in both showcase/js/dashboard.js
 *           and showcase/angular/.../dashboard-page.component.ts.
 *
 * Plain Node + assert + fs.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

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

/** Returns true iff `needle` appears at least once on a LIVE line (not prefixed by leading `//`). */
function containsLive(source, needle) {
  const lines = source.split('\n');
  for (const line of lines) {
    if (line.indexOf(needle) !== -1 && !/^\s*\/\//.test(line)) {
      return true;
    }
  }
  return false;
}

let failures = 0;
function pass(label) { console.log('PASS - ' + label); }
function fail(label, detail) {
  failures += 1;
  console.log('FAIL - ' + label);
  if (detail) console.log('       ' + detail);
}

// ---- Section 1: AGENTS-04 vanilla dashboard sunset card + preserve transport surfaces ----

{
  const src = read('showcase/dashboard.html');
  const sunset = countSubstring(src, 'Background agents have moved') === 1;
  const noContainer = src.indexOf('id="dash-agent-container"') === -1;
  const noNewBtn = src.indexOf('id="dash-new-agent-btn"') === -1;
  const noStatAgents = src.indexOf('id="stat-agents"') === -1;
  const hasPreview = src.indexOf('id="dash-preview"') !== -1;
  const hasPaired = src.indexOf('id="dash-paired-badge"') !== -1;
  const hasSseStatus = src.indexOf('id="dash-sse-status"') !== -1;
  if (sunset && noContainer && noNewBtn && noStatAgents && hasPreview && hasPaired && hasSseStatus) {
    pass('AGENTS-04 showcase/dashboard.html: sunset card present, agent UI removed, preview + paired + sse PRESERVED');
  } else {
    fail('AGENTS-04 showcase/dashboard.html invariants broken', 'sunset=' + sunset + ' noContainer=' + noContainer + ' noNewBtn=' + noNewBtn + ' noStatAgents=' + noStatAgents + ' hasPreview=' + hasPreview + ' hasPaired=' + hasPaired + ' hasSseStatus=' + hasSseStatus);
  }
}

// ---- Section 2: AGENTS-04 Angular dashboard sunset card ----

{
  const src = read('showcase/angular/src/app/pages/dashboard/dashboard-page.component.html');
  const sunset = countSubstring(src, 'Background agents have moved') === 1;
  const noContainer = src.indexOf('id="dash-agent-container"') === -1;
  if (sunset && noContainer) {
    pass('AGENTS-04 Angular dashboard sunset card present, agent UI removed');
  } else {
    fail('AGENTS-04 Angular dashboard invariants broken', 'sunset=' + sunset + ' noContainer=' + noContainer);
  }
}

// ---- Section 3: D-19 _lz decompression byte-for-byte preserved on a LIVE line ----

{
  const lzNeedle = "if (envelope._lz && envelope.d && typeof LZString !== 'undefined') {";
  const vanilla = read('showcase/js/dashboard.js');
  const angular = read('showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts');
  const vanillaLive = containsLive(vanilla, lzNeedle);
  const angularLive = containsLive(angular, lzNeedle);
  if (vanillaLive && angularLive) {
    pass('D-19 _lz decompression LIVE byte-for-byte in both showcase/js/dashboard.js and dashboard-page.component.ts');
  } else {
    fail('D-19 _lz decompression compromised', 'vanillaLive=' + vanillaLive + ' angularLive=' + angularLive);
  }
}

// ---- Section 4: D-19 remote-control state consumers preserved on a LIVE line ----

{
  const vanillaNeedle = "if (msg.type === 'ext:remote-control-state' || msg.type === 'ext:ps-control-state') {";
  const angularNeedle = "if (msg.type === 'ext:remote-control-state' || msg.type === 'ext:ps-control-state') { this.renderRemoteControlState(msg.payload || {}); return; }";
  const vanilla = read('showcase/js/dashboard.js');
  const angular = read('showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts');
  const vanillaLive = containsLive(vanilla, vanillaNeedle);
  const angularLive = containsLive(angular, angularNeedle);
  if (vanillaLive && angularLive) {
    pass('D-19 remote-control state consumers LIVE byte-for-byte in both showcase/js/dashboard.js and dashboard-page.component.ts');
  } else {
    fail('D-19 remote-control state consumers compromised', 'vanillaLive=' + vanillaLive + ' angularLive=' + angularLive);
  }
}

// ---- Section 5: AGENTS-04 no emojis in dashboard sunset files ----

const showcaseFiles = [
  'showcase/dashboard.html',
  'showcase/angular/src/app/pages/dashboard/dashboard-page.component.html',
];
{
  const emojiRegex = /[\u{10000}-\u{10FFFF}]/u;
  let violations = [];
  for (const f of showcaseFiles) {
    const src = read(f);
    if (emojiRegex.test(src)) {
      const m = src.match(emojiRegex);
      violations.push(f + ' -- found 4-byte UTF-8 character: U+' + m[0].codePointAt(0).toString(16).toUpperCase());
    }
  }
  if (violations.length === 0) pass('AGENTS-04 no emojis in dashboard sunset HTML/template files');
  else fail('AGENTS-04 emojis detected', violations.join('; '));
}

// ---- Result ----

if (failures === 0) {
  console.log('');
  console.log('All Phase 212-03 regression checks PASSED');
  process.exit(0);
} else {
  console.log('');
  console.log(failures + ' check(s) FAILED');
  process.exit(1);
}
