#!/usr/bin/env node
'use strict';

/**
 * Fidelity T1 sensitive-origin handler proof.
 *
 * Run: node tests/fidelity-t1-ready.test.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..');
const HANDLER_PATH = path.join(REPO_ROOT, 'catalog', 'handlers', 'fidelity.js');
const EXT_HANDLER_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'handlers', 'fidelity.js');
const DESCRIPTORS_DIR = path.join(REPO_ROOT, 'catalog', 'descriptors');
const CATALOG_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-catalog.js');
const INDEX_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'recipe-index.generated.js');
const REPORT_PATH = path.join(REPO_ROOT, 'scripts', 'report-t1-readiness.mjs');
const CONTRACT_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 't1-port-contract.mjs');

const ORIGIN = 'https://digital.fidelity.com';
const FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';

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

function freshRequire(filePath) {
  delete require.cache[require.resolve(filePath)];
  return require(filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = canonical(value[key]);
      return out;
    }, {});
  }
  return value;
}

function descriptorPath(slug) {
  return path.join(DESCRIPTORS_DIR, 'opentabs__' + slug.replace('.', '__') + '.json');
}

function fidelitySlugs() {
  return fs.readdirSync(DESCRIPTORS_DIR)
    .filter((name) => name.startsWith('opentabs__fidelity__') && name.endsWith('.json'))
    .map((name) => readJson(path.join(DESCRIPTORS_DIR, name)).slug)
    .sort();
}

function isDualFallback(result) {
  return !!result &&
    result.success === false &&
    result.code === FALLBACK_CODE &&
    result.errorCode === FALLBACK_CODE &&
    result.error === FALLBACK_CODE &&
    result.fellBackToDom === true;
}

function makeCtx() {
  const calls = [];
  return {
    calls,
    ctx: {
      tabId: 901,
      async executeBoundSpec(spec, tabId) { calls.push({ kind: 'spec', spec, tabId }); },
      async executeBoundPageRead(request, tabId) { calls.push({ kind: 'page', request, tabId }); },
    },
  };
}

function bySlug(rows, slug) {
  return rows.find((row) => row && row.slug === slug) || null;
}

async function testHandler(slugs) {
  check(fs.existsSync(HANDLER_PATH), 'catalog/handlers/fidelity.js exists');
  check(fs.existsSync(EXT_HANDLER_PATH), 'extension/catalog/handlers/fidelity.js exists');
  check(fs.readFileSync(HANDLER_PATH, 'utf8') === fs.readFileSync(EXT_HANDLER_PATH, 'utf8'),
    'extension Fidelity handler mirrors catalog handler');

  const contract = await import(pathToFileURL(CONTRACT_PATH).href);
  const sourceFailures = contract.validateHandlerSource(fs.readFileSync(HANDLER_PATH, 'utf8'), {
    slug: 'fidelity',
    handlerFile: 'fidelity.js',
  }).failures;
  check(sourceFailures.length === 0,
    'Fidelity handler source passes T1 source safety scan' +
    (sourceFailures.length ? ': ' + sourceFailures.join(' | ') : ''));

  const handlers = freshRequire(HANDLER_PATH);
  const exported = Object.keys(handlers).sort();
  check(exported.join(',') === slugs.join(','),
    'Fidelity handler exports all descriptor slugs and no extras');

  for (const slug of slugs) {
    const descriptor = readJson(descriptorPath(slug));
    const entry = handlers[slug];
    check(entry && entry.tier === 'T1a', slug + ' is registered as T1a');
    check(entry && entry.origin === ORIGIN, slug + ' pins the exact Fidelity origin');
    check(entry && entry.sideEffectClass === descriptor.sideEffectClass,
      slug + ' sideEffectClass matches descriptor');
    check(JSON.stringify(canonical(entry && entry.params)) === JSON.stringify(canonical(descriptor.params)),
      slug + ' params schema matches descriptor');
    check(entry && typeof entry.handle === 'function', slug + ' exposes handle()');

    const { calls, ctx } = makeCtx();
    const result = await entry.handle({ symbols: ['AAPL'], account_number: 'Z123' }, ctx);
    check(isDualFallback(result) &&
        result.slug === slug &&
        result.reason === 'fidelity-policy-blocked' &&
        calls.length === 0,
      slug + ' fails closed without calling execution primitives');
  }
}

function testResolver(slugs) {
  delete global.FsbRecipeIndex;
  delete global.FsbCapabilityCatalog;
  delete global.FsbHandlerFidelity;
  global.FsbRecipeIndex = freshRequire(INDEX_PATH);
  const Catalog = freshRequire(CATALOG_PATH);
  freshRequire(EXT_HANDLER_PATH);
  if (typeof Catalog.seedHeadHandlers === 'function') Catalog.seedHeadHandlers();

  for (const slug of slugs) {
    const resolved = Catalog.resolve(slug, ORIGIN);
    check(resolved && resolved.tier === 'T1a' &&
        resolved.origin === ORIGIN &&
        resolved.handler && typeof resolved.handler.handle === 'function',
      slug + ' resolves through the T1a Fidelity head handler');
  }
}

async function testReadiness(slugs) {
  const reportMod = await import(pathToFileURL(REPORT_PATH).href);
  const report = reportMod.reportReadiness(freshRequire(INDEX_PATH));
  const rows = report.rows.filter((row) => row && row.app === 'fidelity');
  check(rows.length === slugs.length, 'readiness report includes every Fidelity descriptor');

  for (const slug of slugs) {
    const row = bySlug(rows, slug);
    check(row &&
        row.resolvedTier === 'T1a' &&
        row.readiness === 't1-ready' &&
        row.originClass === 'sensitive' &&
        row.authPattern === 'bound-handler' &&
        row.routeFeasibility === 'same-origin-proven' &&
        row.nextAction === 'already executable' &&
        row.proof === 'handler' &&
        row.hasHandlerProof === true &&
        row.hasRecipeProof === false,
      slug + ' is T1a handler-proven on a sensitive non-denied origin');
  }
}

(async function run() {
  console.log('--- Fidelity T1 sensitive readiness ---');
  const slugs = fidelitySlugs();
  check(slugs.length === 13, 'Fidelity descriptor count is 13');
  await testHandler(slugs);
  testResolver(slugs);
  await testReadiness(slugs);
  console.log('\nfidelity-t1-ready: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: fidelity-t1-ready threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
