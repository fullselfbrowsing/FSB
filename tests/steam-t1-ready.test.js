#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const HANDLER_PATH = path.join(REPO_ROOT, 'catalog', 'handlers', 'steam.js');
const EXT_HANDLER_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'handlers', 'steam.js');
const DESCRIPTORS_DIR = path.join(REPO_ROOT, 'catalog', 'descriptors');
const CATALOG_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-catalog.js');

const ORIGIN = 'https://store.steampowered.com';
const SERVICE = 'store.steampowered.com';

const EXPECTED_CLASSES = {
  'steam.add_to_wishlist': 'write',
  'steam.follow_app': 'write',
  'steam.generate_discovery_queue': 'read',
  'steam.get_app_details': 'read',
  'steam.get_app_reviews': 'read',
  'steam.get_app_user_details': 'read',
  'steam.get_current_user': 'read',
  'steam.get_featured': 'read',
  'steam.get_featured_categories': 'read',
  'steam.get_popular_tags': 'read',
  'steam.get_user_data': 'read',
  'steam.ignore_app': 'read',
  'steam.remove_from_wishlist': 'destructive',
  'steam.search_store': 'read',
  'steam.unignore_app': 'read'
};

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

function readSource(file) {
  return fs.readFileSync(file, 'utf8');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function descriptorForSlug(slug) {
  const dot = slug.indexOf('.');
  const file = 'opentabs__' + slug.slice(0, dot) + '__' + slug.slice(dot + 1) + '.json';
  return readJson(path.join(DESCRIPTORS_DIR, file));
}

async function main() {
  check(fs.existsSync(HANDLER_PATH), 'catalog/handlers/steam.js exists');
  check(fs.existsSync(EXT_HANDLER_PATH), 'extension/catalog/handlers/steam.js exists');
  if (!fs.existsSync(HANDLER_PATH) || !fs.existsSync(EXT_HANDLER_PATH)) return;

  const source = readSource(HANDLER_PATH);
  check(source === readSource(EXT_HANDLER_PATH), 'Steam handler copies are byte-identical');
  check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(source), 'Steam handler does not call extension privilege APIs');
  check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(source), 'Steam handler performs no direct network calls');
  check(!/Authorization|document\.cookie|localStorage\.getItem|sessionStorage\.getItem/.test(source), 'Steam handler does not scrape or set credential carriers directly');

  const handlers = require(HANDLER_PATH);
  const slugs = Object.keys(EXPECTED_CLASSES).sort();
  check(JSON.stringify(Object.keys(handlers).sort()) === JSON.stringify(slugs), 'Steam exposes exactly the reviewed descriptor slugs');

  for (const slug of slugs) {
    const descriptor = descriptorForSlug(slug);
    const handler = handlers[slug];
    check(!!handler, slug + ' has a handler');
    check(descriptor.slug === slug && descriptor.service === SERVICE, slug + ' matches the Steam descriptor service');
    check(descriptor.backing === 'dom', slug + ' upgrades an existing DOM-backed descriptor');
    check(descriptor.sideEffectClass === EXPECTED_CLASSES[slug], slug + ' expected sideEffectClass matches descriptor');
    check(handler && handler.tier === 'T1a', slug + ' is registered as T1a');
    check(handler && handler.origin === ORIGIN, slug + ' is pinned to store.steampowered.com');
    check(handler && handler.sideEffectClass === EXPECTED_CLASSES[slug], slug + ' preserves sideEffectClass');
    check(handler && handler.params && handler.params.type === 'object', slug + ' exposes a params schema');
  }

  const calls = [];
  const ctx = {
    tabId: 17,
    async executeBoundSpec(spec, tabId) {
      calls.push({ spec, tabId });
      if (spec.url.indexOf('/api/storesearch/') !== -1) {
        return { success: true, status: 200, data: { total: 1, items: [{ id: 620, name: 'Portal 2', type: 'game' }] } };
      }
      if (spec.url.indexOf('/api/appdetails') !== -1) {
        return { success: true, status: 200, data: { '620': { success: true, data: { steam_appid: 620, name: 'Portal 2', type: 'game', is_free: false, platforms: { windows: true, mac: true, linux: true } } } } };
      }
      if (spec.url.indexOf('/appreviews/620') !== -1) {
        return { success: true, status: 200, data: { query_summary: { total_reviews: 10, total_positive: 9, total_negative: 1, review_score_desc: 'Very Positive' }, reviews: [{ recommendationid: '1', voted_up: true, review: 'ok', author: { steamid: '76561197960265851' } }], cursor: '*' } };
      }
      return { success: true, status: 200, data: {} };
    },
    async executeBoundPageRead(request, tabId) {
      calls.push({ pageRead: request, tabId });
      return { success: true, status: 200, data: { account_id: 123, steam_id64: '76561197960265851' } };
    }
  };

  const search = await handlers['steam.search_store'].handle({ term: 'portal', count: 1 }, ctx);
  check(search && search.success === true && search.data.items[0].id === 620, 'steam.search_store maps Store search results');
  check(calls[0].spec.origin === ORIGIN && calls[0].spec.method === 'GET' && calls[0].spec.url.indexOf('term=portal') !== -1,
    'steam.search_store executes one bounded same-origin GET spec');

  const details = await handlers['steam.get_app_details'].handle({ appid: 620 }, ctx);
  check(details && details.success === true && details.data.app.name === 'Portal 2', 'steam.get_app_details maps the appdetails envelope');

  const reviews = await handlers['steam.get_app_reviews'].handle({ appid: 620 }, ctx);
  check(reviews && reviews.success === true && reviews.data.summary.total_reviews === 10 && reviews.data.reviews[0].voted_up === true,
    'steam.get_app_reviews maps review summary and rows');

  const currentUser = await handlers['steam.get_current_user'].handle({}, ctx);
  const lastCall = calls[calls.length - 1];
  check(currentUser && currentUser.success === true && lastCall.pageRead && lastCall.pageRead.origin === ORIGIN &&
      lastCall.pageRead.namespace === 'steam' && lastCall.pageRead.action === 'get_current_user',
    'steam.get_current_user uses the bounded page-read primitive');

  const guardedStart = calls.length;
  const add = await handlers['steam.add_to_wishlist'].handle({ appid: 620 }, ctx);
  const queue = await handlers['steam.generate_discovery_queue'].handle({ queue_type: 0 }, ctx);
  const remove = await handlers['steam.remove_from_wishlist'].handle({ appid: 620 }, ctx);
  check(add && add.success === false && add.code === 'RECIPE_DOM_FALLBACK_PENDING' &&
      add.reason === 'unverified-steam-add-to-wishlist-mutation',
    'steam.add_to_wishlist fails closed before live mutation-body proof');
  check(queue && queue.success === false && queue.reason === 'unverified-steam-generate-discovery-queue-mutation',
    'steam.generate_discovery_queue fails closed before live request-shape proof');
  check(remove && remove.success === false && remove.reason === 'unverified-steam-remove-from-wishlist-mutation',
    'steam.remove_from_wishlist fails closed before live mutation-body proof');
  check(calls.length === guardedStart, 'Steam guarded rows call no execution primitive');

  const catalog = require(CATALOG_PATH);
  globalThis.FsbCapabilityCatalog = catalog;
  delete require.cache[require.resolve(HANDLER_PATH)];
  require(HANDLER_PATH);
  if (typeof catalog.seedHeadHandlers === 'function') catalog.seedHeadHandlers();
  for (const slug of slugs) {
    const resolved = catalog.resolve(slug, ORIGIN);
    check(resolved && resolved.tier === 'T1a' && resolved.origin === ORIGIN && resolved.handler && typeof resolved.handler.handle === 'function',
      slug + ' resolves through the T1a catalog head');
  }
}

main().then(function () {
  console.log('\nsteam-t1-ready: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}).catch(function (err) {
  failed++;
  console.error(err && err.stack ? err.stack : String(err));
  console.log('\nsteam-t1-ready: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(1);
});
