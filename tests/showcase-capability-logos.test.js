'use strict';

/**
 * The home page's capability marquee (and its release-notes miniature) draws each
 * app logo from showcase/assets/capabilities/<slug>.svg. A slug added to
 * capability-apps.ts without its file would render a broken image.
 *
 * Run: node tests/showcase-capability-logos.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(repoRoot, 'showcase/angular/src/app/core/capabilities/capability-apps.ts'), 'utf8');
const logoDir = path.join(repoRoot, 'showcase/assets/capabilities');

assert.ok(/return `\/assets\/capabilities\/\$\{slug\}\.svg`;/.test(source),
  'capability logos are read from /assets/capabilities');
assert.ok(!/https?:\/\//.test(source.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '')),
  'capability-apps.ts names no remote host');

const slugs = [...source.matchAll(/capability\('[^']*',\s*'([^']+)'\)/g)].map((m) => m[1]);
assert.ok(slugs.length >= 20, `expected the catalog's logo slugs, found ${slugs.length}`);

for (const slug of new Set(slugs)) {
  const file = path.join(logoDir, `${slug}.svg`);
  assert.ok(fs.existsSync(file), `missing logo file for "${slug}": ${path.relative(repoRoot, file)}`);
  const svg = fs.readFileSync(file, 'utf8');
  assert.ok(svg.startsWith('<svg') && svg.includes('viewBox="0 0 24 24"'), `${slug}.svg is a 24x24 SVG mark`);
  // Every mark is saved in the one slate the marquee was designed with.
  assert.ok(svg.includes('fill="#94a3b8"'), `${slug}.svg is filled #94a3b8`);
}

const unused = fs.readdirSync(logoDir).filter((f) => f.endsWith('.svg') && !slugs.includes(f.slice(0, -4)));
assert.deepStrictEqual(unused, [], 'no logo file without a catalog entry');

console.log(`showcase capability logos: PASS (${new Set(slugs).size} logos)`);
