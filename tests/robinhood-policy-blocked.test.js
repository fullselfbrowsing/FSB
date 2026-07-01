#!/usr/bin/env node
'use strict';

/**
 * Robinhood T1 surface policy test.
 *
 * Robinhood is a brokerage origin and remains denylisted. The handler module
 * exposes every catalog slug but must stay inert behind that policy.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

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

(async function run() {
  console.log('--- Robinhood policy-blocked T1 surface ---');

  const descriptors = readRobinhoodDescriptors();
  const handlers = require(path.join(ROOT, 'catalog', 'handlers', 'robinhood.js'));

  check(descriptors.length === 23, 'Robinhood catalog contains 23 descriptors');
  check(Object.keys(handlers).length === descriptors.length, 'handler count matches descriptor count');

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
  check(cls && cls.denied === true, 'Robinhood remains denied by service policy');

  const { reportReadiness } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'report-t1-readiness.mjs')).href);
  const idx = require(path.join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js'));
  const report = reportReadiness(idx);
  const rows = report.rows.filter((row) => row.app === 'robinhood');
  check(rows.length === descriptors.length, 'readiness report includes every Robinhood row');
  check(rows.every((row) => row.proof === 'handler'), 'readiness sees Robinhood handler proof');
  check(rows.every((row) => row.originClass === 'denied' && row.readiness === 'blocked'),
    'readiness keeps Robinhood blocked by denylist despite handler proof');

  console.log('\nrobinhood-policy-blocked: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('robinhood-policy-blocked threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
