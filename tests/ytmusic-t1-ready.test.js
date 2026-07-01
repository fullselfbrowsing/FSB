#!/usr/bin/env node
'use strict';

/**
 * YouTube Music T1 terminal readiness.
 *
 * YouTube Music is policy-denied, so its T1-ready state is blocked-policy:
 * searchable for catalog completeness, but never invocable.
 *
 * Run: node tests/ytmusic-t1-ready.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..');
const DESCRIPTORS_DIR = path.join(REPO_ROOT, 'catalog', 'descriptors');
const HANDLER_PATH = path.join(REPO_ROOT, 'catalog', 'handlers', 'ytmusic.js');
const EXT_HANDLER_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'handlers', 'ytmusic.js');
const INDEX_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'recipe-index.generated.js');
const READINESS_PATH = path.join(REPO_ROOT, 'scripts', 'report-t1-readiness.mjs');
const WORKLIST_PATH = path.join(REPO_ROOT, 'scripts', 'report-t1-tail-worklist.mjs');
const TERMINAL_PATH = path.join(REPO_ROOT, 'scripts', 'report-t1-terminal-states.mjs');
const DENYLIST_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'service-denylist.js');
const SEARCH_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-search.js');

const EXPECTED_SLUGS = [
  'ytmusic.add_to_playlist',
  'ytmusic.create_playlist',
  'ytmusic.delete_playlist',
  'ytmusic.get_album',
  'ytmusic.get_artist',
  'ytmusic.get_home',
  'ytmusic.get_library',
  'ytmusic.get_playlist',
  'ytmusic.get_search_suggestions',
  'ytmusic.get_song',
  'ytmusic.like_song',
  'ytmusic.list_playlists',
  'ytmusic.remove_from_playlist',
  'ytmusic.search',
  'ytmusic.unlike_song',
];

const WRITE_SLUGS = [
  'ytmusic.add_to_playlist',
  'ytmusic.create_playlist',
  'ytmusic.delete_playlist',
  'ytmusic.remove_from_playlist',
];

function descriptorPath(slug) {
  return path.join(DESCRIPTORS_DIR, 'opentabs__' + slug.replace(/\./g, '__') + '.json');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sorted(values) {
  return values.slice().sort();
}

function sameStringList(a, b) {
  assert.deepEqual(sorted(a), sorted(b));
}

async function loadModule(filePath) {
  return import(pathToFileURL(filePath).href);
}

(async function run() {
  const Denylist = require(DENYLIST_PATH);
  await Denylist.load();
  const classified = Denylist.classify('https://music.youtube.com');
  assert.equal(classified.denied, true, 'music.youtube.com stays hard-denied');

  assert.equal(fs.existsSync(HANDLER_PATH), false, 'catalog ytmusic handler is intentionally absent');
  assert.equal(fs.existsSync(EXT_HANDLER_PATH), false, 'extension ytmusic handler is intentionally absent');

  const missing = EXPECTED_SLUGS.filter((slug) => !fs.existsSync(descriptorPath(slug)));
  assert.deepEqual(missing, [], 'all 15 YouTube Music descriptor files exist');

  const descriptors = EXPECTED_SLUGS.map((slug) => readJson(descriptorPath(slug)));
  sameStringList(descriptors.map((desc) => desc.slug), EXPECTED_SLUGS);
  assert.ok(descriptors.every((desc) =>
    desc.service === 'music.youtube.com' &&
    desc.backing === 'dom'
  ), 'YouTube Music descriptors remain DOM-backed on music.youtube.com');
  sameStringList(
    descriptors
      .filter((desc) => desc.sideEffectClass === 'write' || desc.sideEffectClass === 'destructive')
      .map((desc) => desc.slug),
    WRITE_SLUGS
  );

  const catalog = require(INDEX_PATH);
  const readinessMod = await loadModule(READINESS_PATH);
  const worklistMod = await loadModule(WORKLIST_PATH);
  const terminalMod = await loadModule(TERMINAL_PATH);
  const readiness = readinessMod.reportReadiness(catalog);
  const worklist = worklistMod.buildTailWorklist(readiness);
  const terminal = terminalMod.buildTerminalStateReport({ readiness, worklist });
  const ledger = terminalMod.buildWriteUatLedger({ readiness, worklist });

  const readinessRows = readiness.rows.filter((row) =>
    row && row.app === 'ytmusic' && row.service === 'music.youtube.com'
  );
  sameStringList(readinessRows.map((row) => row.slug), EXPECTED_SLUGS);
  assert.ok(readinessRows.every((row) =>
    row.readiness === 'blocked' &&
    row.originClass === 'denied' &&
    row.routeFeasibility === 'blocked' &&
    row.nextAction === 'keep blocked' &&
    row.proof === 'none' &&
    row.hasHandlerProof === false &&
    row.hasRecipeProof === false
  ), 'YouTube Music readiness rows are blocked-policy and non-invocable');

  const tailRows = worklist.rows.filter((row) =>
    row && row.app === 'ytmusic' && row.service === 'music.youtube.com'
  );
  sameStringList(tailRows.map((row) => row.slug), EXPECTED_SLUGS);
  assert.ok(tailRows.every((row) =>
    row.workstream === 'blocked-policy' &&
    row.terminalTarget === 'blocked' &&
    row.requiredProof === 'denylist/product/legal policy change before activation'
  ), 'YouTube Music tail rows terminate as blocked-policy');

  const ytmusicApp = terminal.apps.find((app) => app && app.app === 'ytmusic');
  const terminalRows = terminal.rows.filter((row) =>
    row && row.app === 'ytmusic' && row.service === 'music.youtube.com'
  );
  const ledgerRows = ledger.rows.filter((row) =>
    row && row.app === 'ytmusic' && row.service === 'music.youtube.com'
  );
  assert.equal(ytmusicApp && ytmusicApp.appStatus, 'blocked');
  assert.ok(terminalRows.every((row) =>
    row.surfaceStatus === 'blocked' &&
    row.terminalState === 'blocked-policy' &&
    row.workstream === 'blocked-policy' &&
    row.executionEnabled === false
  ), 'YouTube Music terminal-state rows are non-invocable');
  sameStringList(ledgerRows.map((row) => row.slug), WRITE_SLUGS);
  assert.ok(ledgerRows.every((row) =>
    row.status === 'blocked-policy' &&
    row.activationAllowed === false
  ), 'YouTube Music write/destructive rows cannot activate');

  global.MiniSearch = require(path.join(REPO_ROOT, 'extension', 'lib', 'minisearch.min.js'));
  global.FsbRecipeIndex = catalog;
  const CapabilitySearch = require(SEARCH_PATH);
  assert.equal(await CapabilitySearch.buildOrRestore(), true, 'capability search index builds');
  const hits = CapabilitySearch.search('search youtube music for songs', null, 5);
  const hit = hits.find((item) => item && item.slug === 'ytmusic.search');
  assert.ok(hit, 'ytmusic.search remains discoverable through search');
  assert.equal(hit.invocable, false, 'ytmusic.search is not invocable');
  assert.equal(hit.backing, 'dom', 'ytmusic.search keeps canonical backing dom');
  assert.equal(hit.backingStatus, 'blocked', 'ytmusic.search displays blocked backing status');
  assert.equal(hit.readinessStatus, 'blocked', 'ytmusic.search displays blocked readiness');

  console.log('ytmusic-t1-ready.test: PASS');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
