#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js');
const DENYLIST_PATH = path.join(ROOT, 'extension', 'config', 'service-denylist.json');
const DENYLIST_MODULE_PATH = path.join(ROOT, 'extension', 'utils', 'service-denylist.js');
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
  const Denylist = require(DENYLIST_MODULE_PATH);
  await Denylist.load();
  const apexClass = Denylist.classify('https://youtube.com');
  const wwwClass = Denylist.classify('https://www.youtube.com');
  const descriptors = readYoutubeDescriptors();
  const readinessMod = await load('scripts/report-t1-readiness.mjs');
  const worklistMod = await load('scripts/report-t1-tail-worklist.mjs');
  const terminalMod = await load('scripts/report-t1-terminal-states.mjs');

  assert.equal(
    denylist.deniedOrigins.includes('https://youtube.com'),
    false,
    'YouTube apex is not on the hard denied-origin roster'
  );
  assert.equal(
    denylist.deniedOrigins.includes('https://www.youtube.com'),
    false,
    'YouTube www origin is not on the hard denied-origin roster'
  );
  assert.ok(denylist.sensitiveOrigins.includes('https://youtube.com'), 'YouTube apex is governed as sensitive');
  assert.ok(denylist.sensitiveOrigins.includes('https://www.youtube.com'), 'YouTube www origin is governed as sensitive');
  assert.deepEqual(
    { sensitive: apexClass.sensitive, denied: apexClass.denied },
    { sensitive: true, denied: false },
    'YouTube apex classifies sensitive but not denied'
  );
  assert.deepEqual(
    { sensitive: wwwClass.sensitive, denied: wwwClass.denied },
    { sensitive: true, denied: false },
    'YouTube www classifies sensitive but not denied'
  );
  assert.equal(
    denylist.deniedOrigins.includes('https://*.youtube.com'),
    false,
    'YouTube is not hard-denied by a broad wildcard'
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
  assert.ok(youtubeRows.every((row) => {
    const isWrite = row.sideEffectClass === 'write' || row.sideEffectClass === 'destructive';
    return row.readiness === 'discovery-pending' &&
    row.originClass === 'sensitive' &&
    row.routeFeasibility === (isWrite ? 'dom-discovery-only' : 'same-origin-read-candidate') &&
    row.nextAction === (isWrite ? 'keep DOM/discovery' : 'same-origin read candidate') &&
    row.proof === 'none' &&
    row.hasHandlerProof === false &&
    row.hasRecipeProof === false;
  }), 'YouTube rows are sensitive discovery-pending rows with no execution proof');

  const worklist = worklistMod.buildTailWorklist(readiness);
  const youtubeTail = worklist.rows.filter((row) => row && row.app === 'youtube');
  const youtubeReadTail = youtubeTail.filter((row) => row.workstream === 'same-origin-read');
  const youtubeWriteTail = youtubeTail.filter((row) => row.workstream === 'write-destructive-uat');
  assert.equal(youtubeTail.length, 18, 'YouTube tail rows remain visible as actionable discovery work');
  assert.equal(youtubeReadTail.length, 10, 'YouTube read rows require same-origin proof');
  assert.equal(youtubeWriteTail.length, 8, 'YouTube write/destructive rows require live UAT');
  assert.ok(youtubeReadTail.every((row) => row.terminalTarget === 't1-ready'));
  assert.ok(youtubeWriteTail.every((row) => row.terminalTarget === 't1-ready-or-guarded-fail-closed'));

  const terminal = terminalMod.buildTerminalStateReport({ readiness, worklist });
  const ledger = terminalMod.buildWriteUatLedger({ readiness, worklist });
  const youtubeApp = terminal.apps.find((app) => app && app.app === 'youtube');
  const terminalRows = terminal.rows.filter((row) => row && row.app === 'youtube');
  const ledgerRows = ledger.rows.filter((row) => row && row.app === 'youtube');

  const youtubeWriteTerminal = terminalRows.filter((row) => row.workstream === 'write-destructive-uat');
  const youtubeReadTerminal = terminalRows.filter((row) => row.workstream === 'same-origin-read');
  assert.equal(youtubeApp && youtubeApp.appStatus, 'uat-needed');
  assert.equal(youtubeWriteTerminal.length, 8);
  assert.equal(youtubeReadTerminal.length, 10);
  assert.ok(youtubeWriteTerminal.every((row) =>
    row.surfaceStatus === 'uat-needed' &&
    row.terminalState === 'live-uat-required' &&
    row.executionEnabled === false
  ), 'YouTube write terminal-state rows require live UAT');
  assert.ok(youtubeReadTerminal.every((row) =>
    row.surfaceStatus === 'degraded-discovery-pending' &&
    row.terminalState === 'same-origin-proof-required' &&
    row.executionEnabled === false
  ), 'YouTube read terminal-state rows require same-origin proof');
  assert.deepEqual(
    ledgerRows.map((row) => row.slug).sort(),
    [
      'youtube.add_to_playlist',
      'youtube.create_comment',
      'youtube.create_playlist',
      'youtube.delete_playlist',
      'youtube.like_video',
      'youtube.subscribe',
      'youtube.unlike_video',
      'youtube.unsubscribe',
    ]
  );
  assert.ok(ledgerRows.every((row) =>
    row.status === 'not-activated-live-uat-required' &&
    row.activationAllowed === false
  ), 'YouTube write/destructive rows cannot activate without live UAT');

  console.log('youtube-t1-ready.test: PASS');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
