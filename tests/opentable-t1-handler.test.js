#!/usr/bin/env node
'use strict';

/**
 * OpenTable T1 head proof.
 *
 * Run: node tests/opentable-t1-handler.test.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const HANDLER_PATH = path.join(REPO_ROOT, 'catalog', 'handlers', 'opentable.js');
const EXT_HANDLER_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'handlers', 'opentable.js');

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

function makeCtx(options) {
  const calls = [];
  const opts = options || {};
  return {
    calls,
    ctx: {
      origin: 'https://www.opentable.com',
      tabId: 77,
      async executeBoundSpec(spec, tabId) {
        calls.push({ spec, tabId });
        if (Object.prototype.hasOwnProperty.call(opts, 'data')) {
          return { success: true, status: 200, data: opts.data };
        }
        const url = spec && spec.url ? spec.url : '';
        if (url.indexOf('/v1/restaurants/search') !== -1) {
          return {
            success: true,
            status: 200,
            data: {
              restaurants: [{
                id: 'rest-1',
                name: 'River House',
                neighborhood: 'Louisville',
                cuisine: 'Seafood',
                rating: 4.7,
                slots: ['18:00', '18:30']
              }]
            }
          };
        }
        if (url.indexOf('/v1/restaurants/rest-1') !== -1) {
          return {
            success: true,
            status: 200,
            data: {
              restaurant: {
                id: 'rest-1',
                name: 'River House',
                slots: [{ time: '19:00' }]
              }
            }
          };
        }
        if (url.indexOf('/v1/reservations') !== -1) {
          return {
            success: true,
            status: 200,
            data: {
              reservations: [{
                id: 'res-1',
                status: 'upcoming',
                restaurant_id: 'rest-1',
                restaurant_name: 'River House',
                date: '2026-07-10',
                time: '19:00',
                party_size: 2
              }]
            }
          };
        }
        return { success: true, status: 200, data: {} };
      }
    }
  };
}

(async function run() {
  console.log('--- OpenTable T1 handler proof ---');

  check(fs.existsSync(HANDLER_PATH), 'catalog/handlers/opentable.js exists');
  check(fs.existsSync(EXT_HANDLER_PATH), 'extension/catalog/handlers/opentable.js exists');
  if (!fs.existsSync(HANDLER_PATH)) {
    console.log('\nopentable-t1-handler: ' + passed + ' passed, ' + failed + ' failed');
    process.exit(1);
  }

  const src = fs.readFileSync(HANDLER_PATH, 'utf8');
  const extSrc = fs.existsSync(EXT_HANDLER_PATH) ? fs.readFileSync(EXT_HANDLER_PATH, 'utf8') : '';
  const ot = require(HANDLER_PATH);

  check(extSrc === src, 'extension OpenTable handler matches catalog handler byte-for-byte');

  const readSlugs = [
    'opentable.search_restaurants',
    'opentable.get_restaurant',
    'opentable.list_reservations'
  ];
  const guardedSlugs = [
    'opentable.reserve_table',
    'opentable.cancel_reservation'
  ];

  check(readSlugs.every(function(slug) {
    return ot[slug] && ot[slug].tier === 'T1a'
      && ot[slug].sideEffectClass === 'read'
      && ot[slug].origin === 'https://www.opentable.com'
      && ot[slug].params
      && typeof ot[slug].handle === 'function';
  }), 'OpenTable read slugs are T1a entries pinned to www.opentable.com');

  check(guardedSlugs.every(function(slug) {
    return ot[slug] && ot[slug].tier === 'T1a'
      && (ot[slug].sideEffectClass === 'write' || ot[slug].sideEffectClass === 'destructive')
      && ot[slug].origin === 'https://www.opentable.com'
      && ot[slug].params
      && typeof ot[slug].handle === 'function';
  }), 'OpenTable reservation mutations are registered as guarded T1a entries');

  check(!/chrome\.(scripting|tabs)|\bfetch\s*\(|\bXMLHttpRequest\s*\(/.test(src),
    'opentable.js contains no Chrome tab/scripting API or direct network primitive');
  check(!/Authorization|Bearer|getAuth|getCookie|document\.cookie|localStorage|sessionStorage/i.test(src),
    'opentable.js contains no credential scraping or injected auth header path');
  check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|session)\b/i.test(src),
    'opentable.js does not console-log secret-bearing identifiers');

  const search = makeCtx();
  const searchOut = await ot['opentable.search_restaurants'].handle({
    location: 'Louisville',
    date: '2026-07-10',
    time: '19:00',
    party_size: 2
  }, search.ctx);
  check(search.calls.length === 1
    && search.calls[0].spec.method === 'GET'
    && search.calls[0].spec.url === 'https://www.opentable.com/v1/restaurants/search?location=Louisville&date=2026-07-10&time=19%3A00&party_size=2'
    && search.calls[0].spec.origin === 'https://www.opentable.com'
    && search.calls[0].spec.authStrategy === 'same-origin-cookie',
    'opentable.search_restaurants builds one origin-pinned JSON GET spec');
  check(searchOut && searchOut.success === true
    && searchOut.data.restaurants.length === 1
    && searchOut.data.restaurants[0].id === 'rest-1'
    && searchOut.data.restaurants[0].slots[0] === '18:00',
    'opentable.search_restaurants maps restaurant availability');

  const detail = makeCtx();
  const detailOut = await ot['opentable.get_restaurant'].handle({
    restaurant_id: 'rest-1',
    date: '2026-07-10',
    party_size: 2
  }, detail.ctx);
  check(detail.calls.length === 1
    && detail.calls[0].spec.url === 'https://www.opentable.com/v1/restaurants/rest-1?date=2026-07-10&party_size=2',
    'opentable.get_restaurant targets the restaurant detail endpoint');
  check(detailOut && detailOut.success === true
    && detailOut.data.restaurant.name === 'River House'
    && detailOut.data.restaurant.slots[0] === '19:00',
    'opentable.get_restaurant maps restaurant detail availability');

  const reservations = makeCtx();
  const reservationsOut = await ot['opentable.list_reservations'].handle({
    status: 'upcoming',
    limit: 5
  }, reservations.ctx);
  check(reservations.calls.length === 1
    && reservations.calls[0].spec.url === 'https://www.opentable.com/v1/reservations?status=upcoming&limit=5',
    'opentable.list_reservations targets the reservations endpoint with filters');
  check(reservationsOut && reservationsOut.success === true
    && reservationsOut.data.reservations.length === 1
    && reservationsOut.data.reservations[0].id === 'res-1'
    && reservationsOut.data.reservations[0].party_size === 2,
    'opentable.list_reservations maps reservations');

  const badShape = makeCtx({ data: { ok: true } });
  const badShapeOut = await ot['opentable.search_restaurants'].handle({ location: 'Louisville' }, badShape.ctx);
  check(badShapeOut && badShapeOut.success === false
    && badShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
    && badShapeOut.reason === 'opentable-restaurants-missing',
    'opentable.search_restaurants rejects an unexpected JSON shape');

  const reserve = makeCtx();
  const reserveOut = await ot['opentable.reserve_table'].handle({
    restaurant_id: 'rest-1',
    date: '2026-07-10',
    time: '19:00',
    party_size: 2
  }, reserve.ctx);
  const cancel = makeCtx();
  const cancelOut = await ot['opentable.cancel_reservation'].handle({
    reservation_id: 'res-1'
  }, cancel.ctx);
  check(reserve.calls.length === 0 && cancel.calls.length === 0
    && reserveOut && reserveOut.success === false
    && reserveOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
    && reserveOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
    && reserveOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
    && reserveOut.fellBackToDom === true
    && cancelOut && cancelOut.success === false
    && cancelOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
    && cancelOut.fellBackToDom === true,
    'OpenTable reservation mutations are guarded fail-closed and call no executor');

  console.log('\nopentable-t1-handler: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('  FAIL: opentable-t1-handler threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
