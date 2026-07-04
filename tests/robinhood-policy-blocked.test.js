#!/usr/bin/env node
'use strict';

/**
 * Robinhood T1 sensitive-origin surface test.
 *
 * Robinhood is a brokerage origin and remains sensitive, not denylisted. The
 * handler module exposes every catalog slug; mutating rows stay guarded.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const HANDLER_PATH = path.join(ROOT, 'catalog', 'handlers', 'robinhood.js');
const EXT_HANDLER_PATH = path.join(ROOT, 'extension', 'catalog', 'handlers', 'robinhood.js');
const CATALOG_PATH = path.join(ROOT, 'extension', 'utils', 'capability-catalog.js');
const SEARCH_PATH = path.join(ROOT, 'extension', 'utils', 'capability-search.js');
const INDEX_PATH = path.join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js');
const CONTRACT_PATH = path.join(ROOT, 'scripts', 'lib', 't1-port-contract.mjs');
const MINISEARCH_PATH = path.join(ROOT, 'extension', 'lib', 'minisearch.min.js');

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

function readRobinhoodDescriptors() {
  const dir = path.join(ROOT, 'catalog', 'descriptors');
  return fs.readdirSync(dir)
    .filter((name) => /^opentabs__robinhood__.*\.json$/.test(name))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
}

function freshRequire(filePath) {
  delete require.cache[require.resolve(filePath)];
  return require(filePath);
}

(async function run() {
  console.log('--- Robinhood sensitive T1 surface ---');

  const descriptors = readRobinhoodDescriptors();
  const handlers = require(HANDLER_PATH);

  check(descriptors.length === 23, 'Robinhood catalog contains 23 descriptors');
  check(descriptors.every((desc) => desc.backing === 'handler'),
    'Robinhood descriptors declare handler backing for the explicit T1 surface');
  check(Object.keys(handlers).length === descriptors.length, 'handler count matches descriptor count');
  check(fs.readFileSync(HANDLER_PATH, 'utf8') === fs.readFileSync(EXT_HANDLER_PATH, 'utf8'),
    'extension Robinhood handler matches catalog handler');

  const contract = await import(pathToFileURL(CONTRACT_PATH).href);
  const sourceFailures = contract.validateHandlerSource(fs.readFileSync(HANDLER_PATH, 'utf8'), {
    slug: 'robinhood',
    handlerFile: 'robinhood.js',
  }).failures;
  check(sourceFailures.length === 0,
    'Robinhood handler source passes T1 source safety scan' +
      (sourceFailures.length ? ': ' + sourceFailures.join(' | ') : ''));

  for (const desc of descriptors) {
    const handler = handlers[desc.slug];
    check(!!handler && typeof handler.handle === 'function', desc.slug + ' handler is exported');
    check(handler && handler.origin === 'https://robinhood.com', desc.slug + ' handler origin is pinned');
    check(handler && handler.sideEffectClass === desc.sideEffectClass,
      desc.slug + ' handler sideEffectClass matches descriptor');
  }

  let calls = 0;
  const ctx = {
    executeBoundSpec() {
      calls++;
      return Promise.resolve({ success: true });
    },
  };
  const writeResult = await handlers['robinhood.create_watchlist'].handle({ name: 'Test' }, ctx);
  const deleteResult = await handlers['robinhood.delete_watchlist'].handle({ list_id: 'list-1' }, ctx);
  check(calls === 0, 'Robinhood mutating handlers never execute a bound spec');
  check(writeResult && writeResult.code === 'RECIPE_DOM_FALLBACK_PENDING' &&
      writeResult.errorCode === writeResult.error,
    'create_watchlist returns dual-field typed fallback');
  check(deleteResult && deleteResult.code === 'RECIPE_DOM_FALLBACK_PENDING' &&
      deleteResult.errorCode === deleteResult.error,
    'delete_watchlist returns dual-field typed fallback');

  const denylist = require(path.join(ROOT, 'extension', 'utils', 'service-denylist.js'));
  if (typeof denylist.load === 'function') await denylist.load();
  const cls = denylist.classify('https://robinhood.com');
  check(cls && cls.sensitive === true && cls.denied === false,
    'Robinhood is governed as sensitive but not denied by service policy');

  delete global.FsbRecipeIndex;
  delete global.FsbCapabilityCatalog;
  global.FsbRecipeIndex = { descriptors, recipes: [] };
  const catalog = freshRequire(CATALOG_PATH);
  freshRequire(HANDLER_PATH);
  if (typeof catalog.seedHeadHandlers === 'function') catalog.seedHeadHandlers();
  for (const desc of descriptors) {
    const resolved = catalog.resolve(desc.slug, 'https://robinhood.com');
    check(resolved && resolved.tier === 'T1a' && resolved.handler &&
        typeof resolved.handler.handle === 'function',
      desc.slug + ' resolves to a T1a handler proof');
  }

  const { reportReadiness } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'report-t1-readiness.mjs')).href);
  const idx = require(INDEX_PATH);
  const report = reportReadiness(idx);
  const rows = report.rows.filter((row) => row.app === 'robinhood');
  check(rows.length === descriptors.length, 'readiness report includes every Robinhood row');
  check(rows.every((row) => row.backing === 'handler' && row.resolvedTier === 'T1a'),
    'readiness rows carry handler backing and T1a resolver tier');
  check(rows.every((row) => row.proof === 'handler'), 'readiness sees Robinhood handler proof');
  const guardedRows = rows.filter((row) =>
    row.slug === 'robinhood.create_watchlist' || row.slug === 'robinhood.delete_watchlist'
  );
  const readyRows = rows.filter((row) =>
    row.slug !== 'robinhood.create_watchlist' && row.slug !== 'robinhood.delete_watchlist'
  );
  check(rows.every((row) => row.originClass === 'sensitive'),
    'readiness keeps Robinhood governed as sensitive');
  check(guardedRows.length === 2 &&
      guardedRows.every((row) => row.readiness === 't1-guarded-fail-closed'),
    'Robinhood mutating readiness rows are guarded fail-closed');
  check(readyRows.length === 21 &&
      readyRows.every((row) => row.readiness === 't1-ready'),
    'Robinhood read readiness rows are T1-ready');

  delete global.FsbRecipeIndex;
  global.FsbRecipeIndex = { descriptors, recipes: [] };
  global.MiniSearch = require(MINISEARCH_PATH);
  const searchMod = freshRequire(SEARCH_PATH);
  const built = await searchMod.buildOrRestore();
  check(built === true, 'capability search builds over Robinhood descriptors');
  const positionHit = searchMod.search('list current stock positions in robinhood', null, 5)
    .find((hit) => hit.slug === 'robinhood.list_positions');
  check(positionHit && positionHit.backing === 'handler',
    'Robinhood search hit carries handler backing');
  check(positionHit && positionHit.readinessStatus === 't1-ready' &&
      positionHit.backingStatus === 't1-ready' &&
      positionHit.invocable === true,
    'Robinhood read search hit is marked T1-ready and invocable');
  const createHit = searchMod.search('create a watchlist in robinhood', null, 5)
    .find((hit) => hit.slug === 'robinhood.create_watchlist');
  check(createHit && createHit.readinessStatus === 't1-guarded-fail-closed' &&
      createHit.backingStatus === 't1-guarded-fail-closed' &&
      createHit.invocable === false,
    'Robinhood mutating search hit is guarded and non-invocable');

  console.log('\nrobinhood-sensitive-t1: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('robinhood-policy-blocked threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
