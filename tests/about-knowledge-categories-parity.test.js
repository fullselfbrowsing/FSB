'use strict';

/**
 * The About page draws its "Knowledge by category" legend from a constant in the
 * component so the legend is part of the prerendered page. The memory graph beside
 * it reads the same categories from showcase/js/fsb-knowledge-data.js at runtime.
 * The two lists must stay identical, or the legend changes after the script loads.
 *
 * Run: node tests/about-knowledge-categories-parity.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const data = fs.readFileSync(path.join(repoRoot, 'showcase/js/fsb-knowledge-data.js'), 'utf8');
const component = fs.readFileSync(
  path.join(repoRoot, 'showcase/angular/src/app/pages/about/about-page.component.ts'), 'utf8');

const dataMatch = data.match(/window\.__FSB_CATEGORIES\s*=\s*(\[[\s\S]*?\]);/);
assert.ok(dataMatch, 'fsb-knowledge-data.js defines window.__FSB_CATEGORIES');
const fromData = JSON.parse(dataMatch[1]);

const block = component.match(/const KNOWLEDGE_CATEGORIES: readonly KnowledgeCategory\[\] = \[\n([\s\S]*?)\n\];/);
assert.ok(block, 'about-page.component.ts defines KNOWLEDGE_CATEGORIES');
const fromComponent = block[1].split('\n').map((line) => {
  const m = line.match(/^\s*\{ name: '([^']+)', color: '([^']+)', colorDark: '([^']+)', count: (\d+) \},$/);
  assert.ok(m, `unexpected KNOWLEDGE_CATEGORIES row: ${line}`);
  return { name: m[1], color: m[2], colorDark: m[3], count: Number(m[4]) };
});

assert.deepStrictEqual(fromComponent, fromData,
  'KNOWLEDGE_CATEGORIES matches window.__FSB_CATEGORIES (regenerate the constant from the data file)');
assert.ok(/categories: KnowledgeCategory\[\] = localizedCategories\(KNOWLEDGE_CATEGORIES\);/.test(component),
  'the legend starts from the constant, so it is prerendered');

console.log(`about knowledge categories parity: PASS (${fromData.length} categories)`);
