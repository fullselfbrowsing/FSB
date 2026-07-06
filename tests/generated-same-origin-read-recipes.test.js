'use strict';

/**
 * Phase 51 -- generated same-origin read recipe controls.
 *
 * Run: node tests/generated-same-origin-read-recipes.test.js
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const GENERATOR_PATH = path.join(ROOT, 'scripts', 'generate-t1-same-origin-read-recipes.mjs');
const SCHEMA_PATH = path.join(ROOT, 'extension', 'utils', 'capability-recipe-schema.js');
const CFWORKER_PATH = path.join(ROOT, 'extension', 'lib', 'cfworker-json-schema.min.js');
const INDEX_PATH = path.join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

(async function run() {
  console.log('--- Phase 51: generated same-origin read recipes ---');
  vm.runInThisContext(fs.readFileSync(CFWORKER_PATH, 'utf8'));
  const Schema = require(SCHEMA_PATH);
  const gen = await import(pathToFileURL(GENERATOR_PATH).href);
  const built = gen.buildGeneratedRecipes();
  const recipes = built.recipes.map((item) => item.recipe);
  const slugs = recipes.map((recipe) => recipe.id).sort();

  check(recipes.length >= 4, 'generator finds the conservative same-origin read batch');
  check(!slugs.includes('bitbucket.get_user_profile'), 'batch excludes Bitbucket profile because it is already covered by a T1a handler');
  check(slugs.includes('netlify.get_current_user'), 'batch includes Netlify current-user profile');
  check(slugs.includes('circleci.list_collaborations'), 'batch includes CircleCI collaboration listing');
  check(!slugs.includes('redfin.get_current_user'), 'batch excludes Redfin current-user profile because it is already covered by a T1a handler');
  check(!slugs.includes('webflow.list_workspaces'), 'batch excludes Webflow workspace listing because it is already covered by a T1a handler');
  check(!slugs.includes('circleci.get_current_user'), 'batch excludes slugs already covered by a T1a handler');
  check(!slugs.includes('bestbuy.get_saved_cards'), 'batch excludes saved-card/payment-style reads');
  check(!slugs.includes('chatgpt.get_current_user'), 'batch excludes bearer-token helpers');
  check(!slugs.includes('calendly.get_current_user'), 'batch excludes CSRF-header helpers');
  check(!slugs.includes('asana.get_current_user'), 'batch excludes Pattern-D workstream apps');
  const bySlug = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  check(bySlug.get('bestbuy.get_current_user').origin === 'https://www.bestbuy.com',
    'Best Buy generated recipes pin to the vendored www runtime origin');

  const invalid = [];
  for (const recipe of recipes) {
    const result = Schema.validateRecipe(recipe);
    if (!result || result.success !== true) invalid.push(recipe.id + ':' + JSON.stringify(result));
    if (recipe.method !== 'GET') invalid.push(recipe.id + ':method');
    if (recipe.authStrategy !== 'same-origin-cookie') invalid.push(recipe.id + ':auth');
    if (!recipe.endpoint || recipe.endpoint.charAt(0) !== '/') invalid.push(recipe.id + ':endpoint');
    if (recipe.endpoint.indexOf('..') !== -1 || recipe.endpoint.indexOf('//') === 0) {
      invalid.push(recipe.id + ':unsafe-endpoint');
    }
    const required = recipe.params && Array.isArray(recipe.params.required) ? recipe.params.required : [];
    const props = recipe.params && recipe.params.properties ? Object.keys(recipe.params.properties) : [];
    if (required.length || props.length) invalid.push(recipe.id + ':params');
  }
  check(invalid.length === 0,
    'every generated recipe is a valid no-param same-origin GET recipe' +
    (invalid.length ? ' -- ' + invalid.join(', ') : ''));

  const index = require(INDEX_PATH);
  const indexed = new Set((index.recipes || []).map((recipe) => recipe && recipe.id));
  const missingFromIndex = slugs.filter((slug) => !indexed.has(slug));
  check(missingFromIndex.length === 0,
    'extension recipe index includes every generated recipe' +
    (missingFromIndex.length ? ' -- ' + missingFromIndex.join(', ') : ''));

  console.log('\ngenerated-same-origin-read-recipes: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: generated-same-origin-read-recipes threw:', err && err.message ? err.message : err);
  process.exit(1);
});
