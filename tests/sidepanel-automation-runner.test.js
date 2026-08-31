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

// --- Single-clock contract -------------------------------------------------
// The letter fade is a CSS animation and the pixel fill is JS. Scheduling the
// fill on its own setTimeout ladder let the two drift apart and let any mid-run
// showAutomationRunner() call reset the JS phase while CSS kept its own, so the
// loader rendered blank or half-formed letters. The fill must instead READ the
// CSS animation's progress, which is what the assertions below pin.

console.log('\n--- Pixel reveal reads the CSS clock ---');

ok(!/setTimeout\(runCycle/.test(sidepanelJs), 'pixel reveal no longer runs on a second setTimeout clock');
ok(sidepanelJs.includes('automation.effect.getComputedTiming') || /getComputedTiming\(\)/.test(sidepanelJs), 'pixel state is derived from the CSS animation timing');
ok(sidepanelJs.includes('requestAnimationFrame(frame)') && sidepanelJs.includes('cancelAnimationFrame(automationPixelRafId)'), 'reveal repaints on rAF and cancels cleanly');
ok(/if \(automationPixelRafId !== null\) return;/.test(sidepanelJs), 'startAutomationPixelReveal is idempotent so repeated shows cannot desync it');
ok(sidepanelJs.includes("animation.animationName === AUTOMATION_PIXEL_LETTER_ANIMATION"), 'the reveal binds to the fsb-letter-cycle animation by name');
ok(sidepanelJs.includes("const AUTOMATION_PIXEL_LETTER_ANIMATION = 'fsb-letter-cycle';"), 'the bound animation name matches the stylesheet keyframes');

const litCountSource = extractFunction(sidepanelJs, 'automationPixelLitCount');
ok(Boolean(litCountSource), 'automationPixelLitCount can be extracted from sidepanel.js');

if (litCountSource) {
  const automationPixelLitCount = new Function(
    'AUTOMATION_PIXEL_VISIBLE_OFFSET_MS', 'AUTOMATION_PIXEL_STEP_MS', 'AUTOMATION_PIXEL_CYCLE_MS',
    litCountSource + '\nreturn automationPixelLitCount;'
  )(320, 28, 2700);

  const startProgress = 320 / 2700;
  const stepProgress = 28 / 2700;

  equal(automationPixelLitCount(null, 13), 0, 'null progress (still inside animation-delay) lights nothing');
  equal(automationPixelLitCount(0, 13), 0, 'a fresh iteration starts dark, which clears the previous cycle');
  equal(automationPixelLitCount(startProgress - stepProgress, 13), 0, 'progress before the reveal window lights nothing');
  equal(automationPixelLitCount(startProgress, 13), 1, 'the reveal window opens with exactly one lit pixel');
  equal(automationPixelLitCount(startProgress + (4 * stepProgress), 13), 5, 'pixels accumulate one step at a time');
  equal(automationPixelLitCount(1, 13), 13, 'a completed iteration lights every pixel');
  equal(automationPixelLitCount(1, 9), 9, 'the count is clamped to the letter it is painting');
}

const directionSource = extractFunction(sidepanelJs, 'automationPixelDirectionIndex');
ok(Boolean(directionSource), 'automationPixelDirectionIndex can be extracted from sidepanel.js');

if (directionSource) {
  const automationPixelDirectionIndex = new Function(
    'AUTOMATION_PIXEL_REVEAL_DIRECTIONS',
    directionSource + '\nreturn automationPixelDirectionIndex;'
  )(['bottom-up', 'left-right', 'top-bottom', 'right-left']);

  // The retired scheduler advanced a shared index by letters.length each cycle,
  // so cycle 0 was F/S/B = 0/1/2 and cycle 1 was 3/0/1. Deriving the index from
  // the CSS iteration counter must reproduce that sequence exactly.
  equal(automationPixelDirectionIndex(0, 0, 3), 0, 'cycle 0 letter F keeps the bottom-up sweep');
  equal(automationPixelDirectionIndex(0, 1, 3), 1, 'cycle 0 letter S keeps the left-right sweep');
  equal(automationPixelDirectionIndex(0, 2, 3), 2, 'cycle 0 letter B keeps the top-bottom sweep');
  equal(automationPixelDirectionIndex(1, 0, 3), 3, 'cycle 1 rotates F onto the right-left sweep');
  equal(automationPixelDirectionIndex(1, 1, 3), 0, 'cycle 1 wraps S back to bottom-up');
  equal(automationPixelDirectionIndex(2, 2, 3), 0, 'cycle 2 letter B wraps to bottom-up');
  equal(automationPixelDirectionIndex(null, 2, 3), 2, 'a letter still inside its delay falls back to its own slot');
}

// --- Reveal fits inside the letter's visible window ------------------------
// The regression this suite missed: letter B needed 408ms to fill a 432ms
// window, so 28ms of jank left it permanently half-drawn. Recompute the budget
// from the live constants and markup rather than pinning a number.

console.log('\n--- Reveal fits inside each letter visible window ---');

function readConstant(name) {
  const match = sidepanelJs.match(new RegExp('const ' + name + ' = (\\d+);'));
  return match ? Number(match[1]) : null;
}

const cycleMs = readConstant('AUTOMATION_PIXEL_CYCLE_MS');
const offsetMs = readConstant('AUTOMATION_PIXEL_VISIBLE_OFFSET_MS');
const stepMs = readConstant('AUTOMATION_PIXEL_STEP_MS');
ok(cycleMs === 2700 && typeof offsetMs === 'number' && typeof stepMs === 'number', 'reveal constants are readable from source');

// The budget assumes the keyframe holds each letter at full opacity across
// 12%..28% of its cycle; pin those stops so the assumption cannot drift.
const letterKeyframes = sidepanelCss.slice(sidepanelCss.indexOf('@keyframes fsb-letter-cycle'));
ok(/12%,\s*28%\s*\{/.test(letterKeyframes), 'letters hold full opacity from 12% to 28% of the cycle');
ok(/40%,\s*100%\s*\{/.test(letterKeyframes), 'letters are fully faded from 40% of the cycle');

const MIN_FULLY_LIT_MS = 80;
['f', 's', 'b'].forEach(function (letter) {
  const start = sidepanelHtml.indexOf('<div class="pixel-letter pixel-letter-' + letter + '">');
  const block = start === -1 ? '' : sidepanelHtml.slice(start, sidepanelHtml.indexOf('</div>', start));
  const litPixels = (block.match(/<span>/g) || []).length;
  const revealDoneMs = offsetMs + ((litPixels - 1) * stepMs);
  const visibleUntilMs = 0.28 * cycleMs;
  const slackMs = visibleUntilMs - revealDoneMs;
  ok(
    litPixels > 0 && slackMs >= MIN_FULLY_LIT_MS,
    'letter ' + letter.toUpperCase() + ' finishes lighting ' + Math.round(slackMs) +
      'ms before it starts fading (needs >= ' + MIN_FULLY_LIT_MS + 'ms of fully-lit display)'
  );
});

// Reduced motion switches the CSS letter cycle off, so nothing would drive the
// pixels; the static fallback keeps the loader from becoming an empty box.
console.log('\n--- Reduced motion ---');
const reducedMotionBlock = sidepanelCss.slice(sidepanelCss.indexOf('@media (prefers-reduced-motion: reduce)'));
ok(/\.pixel-letter \{\s*animation: none !important;/.test(reducedMotionBlock), 'reduced motion stops the letter cycle');
ok(/\.pixel-letter-f \{\s*opacity: 1;/.test(reducedMotionBlock), 'reduced motion pins one letter visible');
ok(sidepanelJs.includes('renderStaticAutomationPixelLetter()') && sidepanelJs.includes("matchMedia('(prefers-reduced-motion: reduce)')"), 'reduced motion renders a static lit letter instead of running the reveal');
ok(/automationPixelMotionQuery\.addEventListener\('change'/.test(sidepanelJs), 'toggling reduced motion mid-run swaps the loader onto the matching path');

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
