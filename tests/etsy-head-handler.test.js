#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const HANDLER_PATH = path.join(REPO_ROOT, 'catalog', 'handlers', 'etsy.js');
const EXT_HANDLER_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'handlers', 'etsy.js');

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

function makeCtx(resolver) {
  const calls = [];
  return {
    calls,
    ctx: {
      origin: 'https://www.etsy.com',
      tabId: 260,
      async executeBoundSpec(spec, tabId) {
        calls.push({ spec, tabId });
        return resolver(spec, tabId);
      }
    }
  };
}

(async function main() {
  console.log('--- Etsy T1 head-handler proof ---');

  check(fs.existsSync(HANDLER_PATH), 'catalog/handlers/etsy.js exists');
  check(fs.existsSync(EXT_HANDLER_PATH), 'extension/catalog/handlers/etsy.js exists');
  const etsy = require(HANDLER_PATH);
  const src = readSource(HANDLER_PATH);

  check(fs.existsSync(EXT_HANDLER_PATH) && readSource(EXT_HANDLER_PATH) === src,
    'extension Etsy handler matches catalog handler byte-for-byte');
  check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)/.test(src),
    'etsy.js performs no direct network or privileged browser API calls');
  check(!/document\.cookie|localStorage|sessionStorage|Authorization|Bearer|window\.location|document\.querySelector/i.test(src),
    'etsy.js reads no cookies, storage, credential headers, DOM selectors, or navigation globals');

  const readSlugs = ['etsy.search_listings', 'etsy.get_listing', 'etsy.list_orders'];
  const writeSlugs = ['etsy.add_to_cart', 'etsy.checkout'];
  check(readSlugs.every((slug) => etsy[slug]
      && etsy[slug].tier === 'T1a'
      && etsy[slug].origin === 'https://www.etsy.com'
      && etsy[slug].sideEffectClass === 'read'
      && typeof etsy[slug].handle === 'function'),
    'Etsy read slugs are registered as T1a reads pinned to www.etsy.com');
  check(writeSlugs.every((slug) => etsy[slug]
      && etsy[slug].tier === 'T1a'
      && etsy[slug].origin === 'https://www.etsy.com'
      && etsy[slug].sideEffectClass === 'write'
      && typeof etsy[slug].handle === 'function'),
    'Etsy cart and checkout slugs are registered as guarded T1a writes');

  const search = makeCtx(function (spec) {
    return {
      success: true,
      status: 200,
      data: {
        listings: [{
          listing_id: '123',
          title: 'Handmade Wall Art',
          price: { formatted: '$24.00' },
          currency_code: 'USD',
          shop: { name: 'Fixture Studio' },
          url: '/listing/123/handmade-wall-art',
          images: [{ url: 'https://i.etsystatic.com/fixture.jpg' }],
          tags: ['print']
        }],
        total_results: 1
      }
    };
  });
  const searchOut = await etsy['etsy.search_listings'].handle({
    query: 'wall art',
    category: 'home',
    sort: 'newest',
    limit: 5
  }, search.ctx);
  check(search.calls.length === 1
      && search.calls[0].tabId === 260
      && search.calls[0].spec.url === 'https://www.etsy.com/v1/listings/search?query=wall%20art&category=home&sort=newest&limit=5'
      && search.calls[0].spec.method === 'GET'
      && search.calls[0].spec.origin === 'https://www.etsy.com'
      && search.calls[0].spec.authStrategy === 'same-origin-cookie'
      && search.calls[0].spec.headers.Accept === 'application/json',
    'etsy.search_listings builds one origin-pinned same-origin-cookie JSON GET spec');
  check(searchOut && searchOut.success === true
      && searchOut.data.listings[0].listing_id === '123'
      && searchOut.data.listings[0].shop_name === 'Fixture Studio'
      && searchOut.data.listings[0].url === 'https://www.etsy.com/listing/123/handmade-wall-art',
    'etsy.search_listings maps listing summaries from the JSON response');

  const listing = makeCtx(function () {
    return {
      success: true,
      status: 200,
      data: {
        listing: {
          id: '456',
          title: 'Vintage Mug',
          price: '15.00',
          currency: 'USD',
          shop_name: 'Vintage Fixture'
        }
      }
    };
  });
  const listingOut = await etsy['etsy.get_listing'].handle({ listing_id: '456' }, listing.ctx);
  check(listing.calls.length === 1
      && listing.calls[0].spec.url === 'https://www.etsy.com/v1/listings/456',
    'etsy.get_listing targets the first-party listing endpoint');
  check(listingOut && listingOut.success === true
      && listingOut.data.listing.id === '456'
      && listingOut.data.listing.title === 'Vintage Mug',
    'etsy.get_listing maps listing detail fields');

  const orders = makeCtx(function () {
    return {
      success: true,
      status: 200,
      data: {
        orders: [{
          receipt_id: 'receipt-1',
          status: 'paid',
          total: { amount: 4200, currency: 'USD' },
          creation_tsz: '2026-06-30T12:00:00Z',
          shop_name: 'Fixture Studio',
          items: [{ listing_id: '123' }]
        }]
      }
    };
  });
  const ordersOut = await etsy['etsy.list_orders'].handle({ status: 'paid', limit: 2 }, orders.ctx);
  check(orders.calls.length === 1
      && orders.calls[0].spec.url === 'https://www.etsy.com/v1/orders?status=paid&limit=2',
    'etsy.list_orders targets the first-party orders endpoint with bounded query params');
  check(ordersOut && ordersOut.success === true
      && ordersOut.data.orders[0].order_id === 'receipt-1'
      && ordersOut.data.orders[0].item_count === 1,
    'etsy.list_orders maps order rows');

  const invalid = makeCtx(function () {
    throw new Error('invalid input should not execute');
  });
  const invalidOut = await etsy['etsy.search_listings'].handle({ query: '   ' }, invalid.ctx);
  check(invalid.calls.length === 0
      && invalidOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && invalidOut.reason === 'etsy-invalid-query',
    'etsy.search_listings fails closed before execution on invalid query');

  const guardedCalls = [];
  const guardedCtx = { async executeBoundSpec() { guardedCalls.push('executeBoundSpec'); } };
  const addToCart = await etsy['etsy.add_to_cart'].handle({ listing_id: '123', quantity: 1 }, guardedCtx);
  const checkout = await etsy['etsy.checkout'].handle({ shipping_address: '123 Main St' }, guardedCtx);
  check(addToCart && addToCart.success === false
      && addToCart.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && addToCart.errorCode === addToCart.code
      && addToCart.error === addToCart.code
      && addToCart.fellBackToDom === true
      && addToCart.reason === 'unverified-etsy-add-to-cart-mutation',
    'etsy.add_to_cart returns a typed guarded fail-closed result');
  check(checkout && checkout.success === false
      && checkout.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && checkout.errorCode === checkout.code
      && checkout.error === checkout.code
      && checkout.fellBackToDom === true
      && checkout.reason === 'unverified-etsy-checkout-payment-mutation',
    'etsy.checkout returns a typed guarded fail-closed result');
  check(guardedCalls.length === 0,
    'Etsy guarded writes never call executeBoundSpec without live mutation evidence');

  console.log(`Etsy handler checks: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
