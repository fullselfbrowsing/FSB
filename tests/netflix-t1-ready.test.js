#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js');
const DENYLIST_PATH = path.join(ROOT, 'extension', 'config', 'service-denylist.json');
const HANDLER_PATH = path.join(ROOT, 'catalog', 'handlers', 'netflix.js');
const EXT_HANDLER_PATH = path.join(ROOT, 'extension', 'catalog', 'handlers', 'netflix.js');
const RATE_DESCRIPTOR_PATH = path.join(ROOT, 'catalog', 'descriptors', 'opentabs__netflix__rate_title.json');

async function load(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href);
}

function bySlug(rows, slug) {
  return rows.find((row) => row && row.slug === slug) || null;
}

(async function run() {
  const catalog = require(CATALOG_PATH);
  const denylist = JSON.parse(fs.readFileSync(DENYLIST_PATH, 'utf8'));
  const rateDescriptor = JSON.parse(fs.readFileSync(RATE_DESCRIPTOR_PATH, 'utf8'));
  const readinessMod = await load('scripts/report-t1-readiness.mjs');
  const worklistMod = await load('scripts/report-t1-tail-worklist.mjs');
  const terminalMod = await load('scripts/report-t1-terminal-states.mjs');

  assert.ok(
    denylist.deniedOrigins.includes('https://*.netflix.com'),
    'Netflix stays on the hard denied-origin roster'
  );
  assert.equal(fs.existsSync(HANDLER_PATH), false, 'catalog Netflix handler is intentionally absent');
  assert.equal(fs.existsSync(EXT_HANDLER_PATH), false, 'extension Netflix handler is intentionally absent');
  assert.equal(rateDescriptor.sideEffectClass, 'write', 'netflix.rate_title is classified as a mutation');

  const readiness = readinessMod.reportReadiness(catalog);
  const netflixRows = readiness.rows.filter((row) => row && row.app === 'netflix');
  assert.equal(netflixRows.length, 18, 'all Netflix descriptors are represented');
  assert.equal(bySlug(netflixRows, 'netflix.add_to_my_list').sideEffectClass, 'write');
  assert.equal(bySlug(netflixRows, 'netflix.rate_title').sideEffectClass, 'write');
  assert.equal(bySlug(netflixRows, 'netflix.remove_from_my_list').sideEffectClass, 'destructive');
  assert.ok(netflixRows.every((row) =>
    row.readiness === 'blocked' &&
    row.originClass === 'denied' &&
    row.routeFeasibility === 'blocked' &&
    row.nextAction === 'keep blocked' &&
    row.proof === 'none' &&
    row.hasHandlerProof === false &&
    row.hasRecipeProof === false
  ), 'Netflix rows are blocked-policy terminal rows with no execution proof');

  const worklist = worklistMod.buildTailWorklist(readiness);
  const netflixTail = worklist.rows.filter((row) => row && row.app === 'netflix');
  assert.equal(netflixTail.length, 18, 'Netflix tail rows remain visible as blocked policy');
  assert.ok(netflixTail.every((row) =>
    row.workstream === 'blocked-policy' &&
    row.terminalTarget === 'blocked'
  ), 'Netflix tail rows are non-actionable blocked-policy workstream rows');

  const terminal = terminalMod.buildTerminalStateReport({ readiness, worklist });
  const ledger = terminalMod.buildWriteUatLedger({ readiness, worklist });
  const netflixApp = terminal.apps.find((app) => app && app.app === 'netflix');
  const terminalRows = terminal.rows.filter((row) => row && row.app === 'netflix');
  const ledgerRows = ledger.rows.filter((row) => row && row.app === 'netflix');

  assert.equal(netflixApp && netflixApp.appStatus, 'blocked');
  assert.ok(terminalRows.every((row) =>
    row.surfaceStatus === 'blocked' &&
    row.terminalState === 'blocked-policy' &&
    row.executionEnabled === false
  ), 'Netflix terminal-state rows are non-invocable');
  assert.deepEqual(
    ledgerRows.map((row) => row.slug).sort(),
    ['netflix.add_to_my_list', 'netflix.rate_title', 'netflix.remove_from_my_list']
  );
  assert.ok(ledgerRows.every((row) =>
    row.status === 'blocked-policy' &&
    row.activationAllowed === false
  ), 'Netflix write/destructive rows cannot activate');

  console.log('netflix-t1-ready.test: PASS');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
