'use strict';

/**
 * depth.scss draws a plane marked data-depth-ghost, before the depth engine starts,
 * the way the engine leaves the plane behind the current one at rest. The look is
 * written twice: as arithmetic in depth-engine.ts apply(), and as CSS. If the engine's
 * numbers change and the CSS does not, the plane visibly jumps when the engine takes
 * over. This holds the two together.
 *
 * Run: node tests/showcase-depth-ghost-parity.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'showcase', 'angular', 'src');
const engine = fs.readFileSync(path.join(root, 'app/layout/depth/depth-engine.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles/depth.scss'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function num(source, re, what) {
  const match = source.match(re);
  assert.ok(match, `${what} not found`);
  return Number(match[1]);
}

// The engine: a plane d planes behind the camera (d = 1 for the next one).
const perspective = num(engine, /const P = (\d+);/, 'engine perspective (const P)');
const depthPerPlane = num(engine, /z = -d \* (\d+);/, 'engine depth per plane (z = -d * N)');
const restOpacity = num(engine, /Math\.max\(0, ([\d.]+) - \(d - 1\) \* [\d.]+\)/, 'engine opacity one plane back');
const blurPerPlane = num(engine, /b = Math\.min\(d \* (\d+), \d+\);/, 'engine blur per plane');
const blurCap = num(engine, /b = Math\.min\(d \* \d+, (\d+)\);/, 'engine blur cap');

// The CSS: the block that draws the ghost plane before the engine is live.
const block = css.match(/@media screen and \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\[data-depth-ghost\][\s\S]*?\n\}\n/);
assert.ok(block, 'depth.scss has the pre-live data-depth-ghost block, limited to screens without reduced motion');
const ghost = block[0];
const scale = ghost.match(/transform: scale\(calc\((\d+) \/ (\d+)\)\);/);
assert.ok(scale, 'ghost plane is scaled by calc(perspective / (perspective + depth))');
const cssBlur = num(ghost, /filter: blur\((\d+)px\);/, 'ghost blur');
const cssOpacity = num(ghost, /opacity: (\.\d+|\d\.\d+);/, 'ghost opacity');

// A point `depth` behind the screen plane under a perspective P is drawn at P / (P + depth).
assert.strictEqual(Number(scale[1]), perspective, 'CSS scale numerator is the engine perspective');
assert.strictEqual(Number(scale[2]), perspective + depthPerPlane, 'CSS scale denominator is perspective + one plane of depth');
assert.strictEqual(cssBlur, Math.min(blurPerPlane, blurCap), 'CSS blur is the engine blur one plane back');
assert.strictEqual(cssOpacity, restOpacity, 'CSS opacity is the engine opacity one plane back');

// The engine hides the plane behind under reduced motion and hides fade-only items; so must the CSS.
assert.ok(/else if \(reduce\) o = clamp\(1 - Math\.abs\(d\) \* 1\.6, 0, 1\);/.test(engine),
  'engine still shows nothing one plane back under reduced motion (the CSS block is skipped there)');
assert.ok(/\[data-depth-ghost\] \[data-dfade\] \{\s*visibility: hidden;/.test(ghost),
  'fade-only items stay hidden on the ghost plane');
assert.ok(/\[data-depth-ghost\] \{[^}]*pointer-events: none;[^}]*visibility: visible;/.test(ghost),
  'ghost plane is visible but takes no input');

// Without JavaScript the engine never starts; the plane must read normally in the fallback column.
const noscript = (indexHtml.match(/<noscript>[\s\S]*?<\/noscript>/) || [''])[0];
assert.ok(/\.fsb-depth-layer\[data-depth-ghost\] \{[^}]*filter: none !important;[^}]*transform: none !important;/.test(noscript)
  && /\.fsb-depth-layer\[data-depth-ghost\] > \.fsb-depth-fit \{ opacity: 1 !important; \}/.test(noscript),
  'noscript fallback undoes the ghost look');

console.log(`showcase depth ghost parity: PASS (scale ${perspective}/${perspective + depthPerPlane}, blur ${cssBlur}px, opacity ${cssOpacity})`);
