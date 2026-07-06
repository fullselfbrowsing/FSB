'use strict';

/**
 * Smoke coverage for the side panel automation runner.
 *
 * Verifies the elapsed timer's millisecond formatting and the compact pixel
 * loader CSS contract without needing a browser runtime.
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function ok(condition, message) {
  if (condition) {
    passed++;
    console.log('  PASS:', message);
  } else {
    failed++;
    console.error('  FAIL:', message);
  }
}

function equal(actual, expected, message) {
  ok(actual === expected, message + ' (expected "' + expected + '", got "' + actual + '")');
}

function extractFunction(source, functionName) {
  const anchor = 'function ' + functionName + '(';
  const start = source.indexOf(anchor);
  if (start === -1) return null;
  const braceStart = source.indexOf('{', start);
  if (braceStart === -1) return null;

  let depth = 1;
  let index = braceStart + 1;
  while (index < source.length && depth > 0) {
    const char = source[index];
    if (char === '{') depth++;
    else if (char === '}') depth--;
    index++;
  }

  return depth === 0 ? source.slice(start, index) : null;
}

function extractCssRule(source, selector) {
  const start = source.indexOf(selector + ' {');
  if (start === -1) return null;
  const braceStart = source.indexOf('{', start);
  if (braceStart === -1) return null;

  let depth = 1;
  let index = braceStart + 1;
  while (index < source.length && depth > 0) {
    const char = source[index];
    if (char === '{') depth++;
    else if (char === '}') depth--;
    index++;
  }

  return depth === 0 ? source.slice(start, index) : null;
}

const repoRoot = path.resolve(__dirname, '..');
const sidepanelHtml = fs.readFileSync(path.join(repoRoot, 'extension/ui/sidepanel.html'), 'utf8');
const sidepanelJs = fs.readFileSync(path.join(repoRoot, 'extension/ui/sidepanel.js'), 'utf8');
const sidepanelCss = fs.readFileSync(path.join(repoRoot, 'extension/ui/sidepanel.css'), 'utf8');

console.log('\n--- Side panel automation runner smoke ---');

const formatterSource = extractFunction(sidepanelJs, 'formatAutomationElapsed');
ok(Boolean(formatterSource), 'formatAutomationElapsed can be extracted from sidepanel.js');

if (formatterSource) {
  let now = 10000000;
  const FakeDate = { now: function () { return now; } };
  const formatAutomationElapsed = new Function('Date', formatterSource + '\nreturn formatAutomationElapsed;')(FakeDate);

  equal(formatAutomationElapsed(null), '0.000s', 'invalid start time resets to millisecond zero');
  equal(formatAutomationElapsed(now - 12345), '12.345s', 'sub-minute elapsed time includes milliseconds and seconds suffix');
  equal(formatAutomationElapsed(now - 62345), '1:02.345', 'minute elapsed time uses M:SS.mmm format');
  equal(formatAutomationElapsed(now - 3723456), '1:02:03.456', 'hour elapsed time uses H:MM:SS.mmm format');
  equal(formatAutomationElapsed(now + 25), '0.000s', 'future start time clamps to zero');
}

ok(sidepanelJs.includes('setInterval(updateAutomationTimer, 100)'), 'automation timer refreshes every 100ms');
ok(sidepanelJs.includes("automationTimer.textContent = '0.000s'"), 'hidden runner timer resets to 0.000s');
ok(sidepanelJs.includes("const AUTOMATION_PIXEL_REVEAL_DIRECTIONS = ['bottom-up', 'left-right', 'top-bottom', 'right-left'];"), 'pixel reveal direction cycle is defined');
ok(sidepanelJs.includes('const AUTOMATION_PIXEL_LETTER_SLOT_MS = 900;') && sidepanelJs.includes('const AUTOMATION_PIXEL_CYCLE_MS = 2700;'), 'pixel reveal timing preserves the F/S/B cadence');
ok(sidepanelJs.includes('startAutomationPixelReveal();'), 'pixel reveal starts when the runner is shown');
ok(sidepanelJs.includes('stopAutomationPixelReveal();'), 'pixel reveal stops when the runner is hidden');

ok(!sidepanelCss.includes('@keyframes fsb-pixel-sweep'), 'pixel sweep keyframes are removed');
ok(sidepanelCss.includes('@keyframes fsb-letter-cycle'), 'original one-letter cycle animation is preserved');

const pixelLoaderRule = extractCssRule(sidepanelCss, '.pixel-loader') || '';
const pixelLetterRule = extractCssRule(sidepanelCss, '.pixel-letter') || '';
const pixelLetterSRule = extractCssRule(sidepanelCss, '.pixel-letter-s') || '';
const pixelLetterBRule = extractCssRule(sidepanelCss, '.pixel-letter-b') || '';
const activePixelRule = extractCssRule(sidepanelCss, '.pixel-letter span') || '';
const litPixelRule = extractCssRule(sidepanelCss, '.pixel-letter span.pixel-lit') || '';
const bLetterStart = sidepanelHtml.indexOf('<div class="pixel-letter pixel-letter-b">');
const bLetterBlock = bLetterStart === -1 ? '' : sidepanelHtml.slice(bLetterStart, sidepanelHtml.indexOf('</div>', bLetterStart));
const bPixelMask = Array.from(bLetterBlock.matchAll(/<(span|i)>/g)).map(function (match) { return match[1]; }).join(' ');
ok(/position:\s*relative;/.test(pixelLoaderRule), 'pixel loader keeps the original stacked letter container');
ok(/width:\s*8\.5px;/.test(pixelLoaderRule) && /height:\s*11\.5px;/.test(pixelLoaderRule) && /flex:\s*0 0 8\.5px;/.test(pixelLoaderRule), 'pixel loader dimensions are reduced by another 50 percent');
ok(/position:\s*absolute;/.test(pixelLetterRule) && /animation:\s*fsb-letter-cycle 2\.7s infinite ease-in-out;/.test(pixelLetterRule), 'letters are overlaid and cycle one at a time');
ok(/grid-template-columns:\s*repeat\(3,\s*2px\);/.test(pixelLetterRule) && /grid-auto-rows:\s*2px;/.test(pixelLetterRule) && /gap:\s*0\.75px;/.test(pixelLetterRule), 'pixel cells and gaps are reduced by another 50 percent');
ok(/animation-delay:\s*0\.9s;/.test(pixelLetterSRule) && /animation-delay:\s*1\.8s;/.test(pixelLetterBRule), 'original letter timing offsets are preserved');
ok(bPixelMask === 'span span span span i span span span span span i span span span span', 'B pixel mask uses a boxy 8-style shape');
ok(!/display:\s*flex;/.test(pixelLoaderRule), 'pixel loader does not lay out all three letters side by side');
ok(/opacity:\s*0;/.test(activePixelRule) && /background:\s*var\(--primary-color\);/.test(activePixelRule), 'active pixels keep original color styling but start hidden');
ok(/opacity:\s*1;/.test(litPixelRule), 'pixel-lit class reveals active pixels');
ok(/\.pixel-letter i\s*\{\s*opacity:\s*0;\s*\}/.test(sidepanelCss), 'empty cells return to the original hidden styling');
ok(!sidepanelCss.includes('animation-delay: calc(var(--letter-delay) + var(--pixel-delay));'), 'per-pixel staggered sweep is removed');

console.log('\n' + passed + ' PASS / ' + failed + ' FAIL');
process.exit(failed === 0 ? 0 : 1);
