#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js');
const DENYLIST_PATH = path.join(ROOT, 'extension', 'config', 'service-denylist.json');
const DESCRIPTOR_DIR = path.join(ROOT, 'catalog', 'descriptors');
const HANDLER_PATH = path.join(ROOT, 'catalog', 'handlers', 'youtube.js');
const EXT_HANDLER_PATH = path.join(ROOT, 'extension', 'catalog', 'handlers', 'youtube.js');

async function load(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href);
}

function bySlug(rows, slug) {
  return rows.find((row) => row && row.slug === slug) || null;
}

function readYoutubeDescriptors() {
  return fs.readdirSync(DESCRIPTOR_DIR)
    .filter((name) => name.startsWith('opentabs__youtube__') && name.endsWith('.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(DESCRIPTOR_DIR, name), 'utf8')));
}

(async function run() {
  const catalog = require(CATALOG_PATH);
  const denylist = JSON.parse(fs.readFileSync(DENYLIST_PATH, 'utf8'));
  const descriptors = readYoutubeDescriptors();
  const readinessMod = await load('scripts/report-t1-readiness.mjs');
  const worklistMod = await load('scripts/report-t1-tail-worklist.mjs');
  const terminalMod = await load('scripts/report-t1-terminal-states.mjs');

  assert.ok(
    denylist.deniedOrigins.includes('https://youtube.com'),
    'YouTube apex stays on the hard denied-origin roster'
  );
  assert.ok(
    denylist.deniedOrigins.includes('https://www.youtube.com'),
    'YouTube www origin stays on the hard denied-origin roster'
  );
  assert.equal(
    denylist.deniedOrigins.includes('https://*.youtube.com'),
    false,
    'YouTube denial remains exact-host and does not cover unrelated subdomains'
  );
  assert.equal(fs.existsSync(HANDLER_PATH), false, 'catalog YouTube handler is intentionally absent');
  assert.equal(fs.existsSync(EXT_HANDLER_PATH), false, 'extension YouTube handler is intentionally absent');

  assert.equal(descriptors.length, 18, 'all YouTube descriptors are present');
  assert.equal(bySlug(descriptors, 'youtube.add_to_playlist').sideEffectClass, 'write');
  assert.equal(bySlug(descriptors, 'youtube.create_comment').sideEffectClass, 'write');
  assert.equal(bySlug(descriptors, 'youtube.create_playlist').sideEffectClass, 'write');
  assert.equal(bySlug(descriptors, 'youtube.delete_playlist').sideEffectClass, 'destructive');

  const readiness = readinessMod.reportReadiness(catalog);
  const youtubeRows = readiness.rows.filter((row) => row && row.app === 'youtube');
  assert.equal(youtubeRows.length, 18, 'all YouTube descriptors are represented in readiness');
  assert.ok(youtubeRows.every((row) =>
    row.readiness === 'blocked' &&
    row.originClass === 'denied' &&
    row.routeFeasibility === 'blocked' &&
    row.nextAction === 'keep blocked' &&
    row.proof === 'none' &&
    row.hasHandlerProof === false &&
    row.hasRecipeProof === false
  ), 'YouTube rows are blocked-policy terminal rows with no execution proof');

  const worklist = worklistMod.buildTailWorklist(readiness);
  const youtubeTail = worklist.rows.filter((row) => row && row.app === 'youtube');
  assert.equal(youtubeTail.length, 18, 'YouTube tail rows remain visible as blocked policy');
  assert.ok(youtubeTail.every((row) =>
    row.workstream === 'blocked-policy' &&
    row.terminalTarget === 'blocked'
  ), 'YouTube tail rows are non-actionable blocked-policy workstream rows');

  const terminal = terminalMod.buildTerminalStateReport({ readiness, worklist });
  const ledger = terminalMod.buildWriteUatLedger({ readiness, worklist });
  const youtubeApp = terminal.apps.find((app) => app && app.app === 'youtube');
  const terminalRows = terminal.rows.filter((row) => row && row.app === 'youtube');
  const ledgerRows = ledger.rows.filter((row) => row && row.app === 'youtube');

  assert.equal(youtubeApp && youtubeApp.appStatus, 'blocked');
  assert.ok(terminalRows.every((row) =>
    row.surfaceStatus === 'blocked' &&
    row.terminalState === 'blocked-policy' &&
    row.workstream === 'blocked-policy' &&
    row.executionEnabled === false
  ), 'YouTube terminal-state rows are non-invocable');
  assert.deepEqual(
    ledgerRows.map((row) => row.slug).sort(),
    [
      'youtube.add_to_playlist',
      'youtube.create_comment',
      'youtube.create_playlist',
      'youtube.delete_playlist',
    ]
  );
  assert.ok(ledgerRows.every((row) =>
    row.status === 'blocked-policy' &&
    row.activationAllowed === false
  ), 'YouTube write/destructive rows cannot activate');

  console.log('youtube-t1-ready.test: PASS');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
