#!/usr/bin/env node
'use strict';

/**
 * OnlyFans T1 terminal readiness.
 *
 * Run: node tests/onlyfans-t1-ready.test.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..');
const DESCRIPTORS_DIR = path.join(REPO_ROOT, 'catalog', 'descriptors');
const HANDLER_PATH = path.join(REPO_ROOT, 'catalog', 'handlers', 'onlyfans.js');
const EXT_HANDLER_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'handlers', 'onlyfans.js');
const INDEX_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'recipe-index.generated.js');
const READINESS_PATH = path.join(REPO_ROOT, 'scripts', 'report-t1-readiness.mjs');
const WORKLIST_PATH = path.join(REPO_ROOT, 'scripts', 'report-t1-tail-worklist.mjs');
const DENYLIST_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'service-denylist.js');

const EXPECTED_SLUGS = [
  'onlyfans.bookmark_post',
  'onlyfans.get_chat_messages',
  'onlyfans.get_current_user',
  'onlyfans.get_feed',
  'onlyfans.get_list_users',
  'onlyfans.get_post',
  'onlyfans.get_recommendations',
  'onlyfans.get_user_posts',
  'onlyfans.get_user_profile',
  'onlyfans.like_post',
  'onlyfans.list_bookmarks',
  'onlyfans.list_chats',
  'onlyfans.list_expired_subscribers',
  'onlyfans.list_stories',
  'onlyfans.list_streams',
  'onlyfans.list_subscribers',
  'onlyfans.list_subscriptions',
  'onlyfans.list_user_lists',
  'onlyfans.list_users',
  'onlyfans.search_users',
  'onlyfans.send_chat_message',
];

const WRITE_SLUGS = [
  'onlyfans.bookmark_post',
  'onlyfans.like_post',
  'onlyfans.send_chat_message',
];

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    passed++;
    console.log('  PASS:', message);
  } else {
    failed++;
    console.error('  FAIL:', message);
  }
}

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
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

(async function run() {
  console.log('--- OnlyFans T1 terminal readiness ---');

  const Denylist = require(DENYLIST_PATH);
  await Denylist.load();
  const classified = Denylist.classify('https://www.onlyfans.com');
  check(classified && classified.denied === true && classified.sensitive === true,
    'OnlyFans origin classifies as denied by the service denylist');

  check(!fs.existsSync(HANDLER_PATH), 'catalog/handlers/onlyfans.js is absent');
  check(!fs.existsSync(EXT_HANDLER_PATH), 'extension/catalog/handlers/onlyfans.js is absent');

  const missing = EXPECTED_SLUGS.filter(function(slug) { return !fs.existsSync(descriptorPath(slug)); });
  check(missing.length === 0,
    'all 21 OnlyFans descriptor files exist' +
    (missing.length ? ': ' + missing.join(', ') : ''));

  const descriptors = EXPECTED_SLUGS.map(function(slug) { return readJson(descriptorPath(slug)); });
  const descriptorSlugs = descriptors.map(function(desc) { return desc.slug; });
  check(sameStringList(descriptorSlugs, EXPECTED_SLUGS), 'OnlyFans descriptor slug set is exact');
  check(descriptors.every(function(desc) {
    return desc.service === 'onlyfans.com' && desc.backing === 'dom';
  }), 'OnlyFans descriptors remain DOM-backed and service-scoped to onlyfans.com');
  check(sameStringList(descriptors
    .filter(function(desc) { return desc.sideEffectClass === 'write' || desc.sideEffectClass === 'destructive'; })
    .map(function(desc) { return desc.slug; }), WRITE_SLUGS),
    'OnlyFans write surface stays limited to bookmark, like, and send_chat_message');

  const readinessMod = await import(pathToFileURL(READINESS_PATH).href);
  const worklistMod = await import(pathToFileURL(WORKLIST_PATH).href);
  const catalog = require(INDEX_PATH);
  const readiness = readinessMod.reportReadiness(catalog);
  const worklist = worklistMod.buildTailWorklist(readiness);

  const rows = readiness.rows.filter(function(row) { return row && row.app === 'onlyfans'; });
  check(rows.length === EXPECTED_SLUGS.length &&
      sameStringList(rows.map(function(row) { return row.slug; }), EXPECTED_SLUGS),
    'readiness report accounts for all 21 OnlyFans rows');

  const readinessOffenders = rows.filter(function(row) {
    return row.readiness !== 'blocked' ||
      row.originClass !== 'denied' ||
      row.routeFeasibility !== 'blocked' ||
      row.nextAction !== 'keep blocked' ||
      row.proof !== 'none' ||
      row.hasHandlerProof !== false ||
      row.hasRecipeProof !== false;
  });
  check(readinessOffenders.length === 0,
    'OnlyFans readiness rows are blocked-policy and non-invocable' +
    (readinessOffenders.length ? ': ' + readinessOffenders.map(function(row) {
      return row.slug + ':' + row.readiness + '/' + row.originClass + '/' + row.proof;
    }).join(', ') : ''));

  const tailRows = worklist.rows.filter(function(row) { return row && row.app === 'onlyfans'; });
  const tailOffenders = tailRows.filter(function(row) {
    return row.workstream !== 'blocked-policy' ||
      row.terminalTarget !== 'blocked' ||
      row.requiredProof !== 'denylist/product/legal policy change before activation';
  });
  check(tailRows.length === EXPECTED_SLUGS.length && tailOffenders.length === 0,
    'OnlyFans tail worklist rows terminate as blocked-policy' +
    (tailOffenders.length ? ': ' + tailOffenders.map(function(row) {
      return row.slug + ':' + row.workstream + '/' + row.terminalTarget;
    }).join(', ') : ''));

  console.log('\nonlyfans-t1-ready: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('  FAIL: onlyfans-t1-ready threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
