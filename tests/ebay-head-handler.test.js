#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HANDLER_PATH = path.join(ROOT, 'catalog', 'handlers', 'ebay.js');
const EXT_HANDLER_PATH = path.join(ROOT, 'extension', 'catalog', 'handlers', 'ebay.js');
const DESCRIPTORS_DIR = path.join(ROOT, 'catalog', 'descriptors');
const handlers = require(HANDLER_PATH);

const ORIGIN = 'https://www.ebay.com';
const READ_SLUGS = [
  'ebay.get_current_user',
  'ebay.get_deals',
  'ebay.get_item',
  'ebay.get_seller_profile',
  'ebay.get_watchlist',
  'ebay.search_items',
  'ebay.search_suggestions',
];
const ALL_SLUGS = READ_SLUGS.concat(['ebay.watch_item']);

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

function makeCtx(responses) {
  const calls = [];
  return {
    calls,
    ctx: {
      tabId: 617,
      async executeBoundSpec(spec, tabId) {
        calls.push({ spec, tabId });
        const parsed = new URL(spec.url);
        const key = parsed.pathname + parsed.search;
        const value = Object.prototype.hasOwnProperty.call(responses, key)
          ? responses[key]
          : responses[parsed.pathname];
        if (value && value.__raw) return value.__raw;
        if (typeof value === 'string') return { success: true, status: 200, text: value };
        return { success: true, status: 200, data: value };
      },
    },
  };
}

const homepageHtml = '<html><script>window.GHpre={"userId":"ebay-user","fn":"Ebay"};</script></html>';
const searchHtml = [
  '<html><body><h1>1,234 results</h1>',
  '<li class="s-card"><a href="/itm/236495878573?x=1"><span role="heading">Vintage Watch</span></a>',
  '<span class="s-card__price">$12.34</span><img src="https://i.ebayimg.com/watch.jpg">',
  'Used Free shipping 3 bids</li></body></html>',
].join('');
const itemHtml = [
  '<html><head><script type="application/ld+json">',
  JSON.stringify({
    '@type': 'Product',
    name: 'Vintage Watch',
    image: ['https://i.ebayimg.com/watch.jpg'],
    brand: { name: 'Fixture Brand' },
    offers: {
      price: '12.34',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/UsedCondition',
      url: 'https://www.ebay.com/itm/236495878573',
      shippingDetails: [{ shippingRate: { value: '0', currency: 'USD' } }],
    },
  }),
  '</script></head><body>',
  '<a href="/usr/watchseller">watchseller</a>',
  '<div data-testid="item-description">Clean fixture watch</div>',
  '<div data-testid="x-returns-minview">30 day returns</div>',
  '</body></html>',
].join('');
const sellerHtml = [
  '<html><body>',
  '<div class="str-seller-card__store-stats-content">99.8% positive feedback 48K items sold 11K followers</div>',
  '<div class="str-seller-card__store-name"><a>Fixture Store</a></div>',
  '</body></html>',
].join('');
const dealsHtml = [
  '<html><body><article class="deal-card">',
  '<a href="/itm/236495878573"><span role="heading">Daily Watch Deal</span></a>',
  '<span class="price">$9.99</span><s>$19.99</s><span class="discount">50% off</span>',
  '<img src="https://i.ebayimg.com/deal.jpg"></article></body></html>',
].join('');
const watchlistHtml = '<html><body><h1>Watchlist</h1><a href="/itm/236495878573?watch=1">Vintage Watch</a></body></html>';
const suggestions = {
  url: 'https://ir.ebaystatic.com/autocomplete.js',
  activeFactors: { kwd: 'wat' },
};

async function run() {
  console.log('--- eBay T1a handler contract ---');

  check(Object.keys(handlers).sort().join(',') === ALL_SLUGS.slice().sort().join(','),
    'exports all eight eBay descriptor slugs');
  check(fs.readFileSync(HANDLER_PATH, 'utf8') === fs.readFileSync(EXT_HANDLER_PATH, 'utf8'),
    'extension eBay handler mirrors catalog handler');

  const source = fs.readFileSync(HANDLER_PATH, 'utf8');
  check(!/\bfetch\s*\(/.test(source), 'handler does not issue direct fetch calls');
  check(!/\bchrome\.(tabs|scripting|cookies|webRequest)\b/.test(source),
    'handler does not use direct chrome APIs');
  check(!/new\s+XMLHttpRequest|XMLHttpRequest\s*\(/.test(source),
    'handler does not construct XHR requests');
  check(!/\beval\s*\(/.test(source), 'handler does not use eval');

  for (const slug of ALL_SLUGS) {
    const descriptor = JSON.parse(fs.readFileSync(path.join(
      DESCRIPTORS_DIR,
      'opentabs__' + slug.replace('.', '__') + '.json'
    ), 'utf8'));
    const entry = handlers[slug];
    check(entry && entry.tier === 'T1a', slug + ' is T1a');
    check(entry && entry.origin === ORIGIN, slug + ' pins eBay origin');
    check(entry && entry.params && entry.params.additionalProperties === false,
      slug + ' has a closed params schema');
    check(entry && typeof entry.handle === 'function', slug + ' exposes handle()');
    check(descriptor.backing === 'handler', slug + ' descriptor is handler-backed');
    check(entry && entry.sideEffectClass === descriptor.sideEffectClass,
      slug + ' sideEffectClass matches descriptor');
  }
  check(READ_SLUGS.every((slug) => handlers[slug].sideEffectClass === 'read'),
    'eBay read handlers are read-only');
  check(handlers['ebay.watch_item'].sideEffectClass === 'write',
    'ebay.watch_item is classified as a guarded write');

  {
    const { ctx, calls } = makeCtx({ '/': homepageHtml });
    const result = await handlers['ebay.get_current_user'].handle({}, ctx);
    check(result.success === true && result.data.user.user_id === 'ebay-user',
      'get_current_user parses GHpre user data');
    check(calls[0].spec.url === ORIGIN + '/', 'get_current_user reads the eBay home page');
    check(calls[0].spec.authStrategy === 'same-origin-cookie',
      'get_current_user uses same-origin cookies');
  }

  {
    const { ctx, calls } = makeCtx({ '/deals': dealsHtml });
    const result = await handlers['ebay.get_deals'].handle({}, ctx);
    check(result.success === true && result.data.deals[0].title === 'Daily Watch Deal',
      'get_deals parses deal cards');
    check(result.data.deals[0].original_price === '$19.99',
      'get_deals parses original price');
    check(calls[0].spec.url === ORIGIN + '/deals', 'get_deals reads /deals');
  }

  {
    const { ctx, calls } = makeCtx({ '/itm/236495878573': itemHtml });
    const result = await handlers['ebay.get_item'].handle({ item_id: '236495878573' }, ctx);
    check(result.success === true && result.data.item.title === 'Vintage Watch',
      'get_item parses product JSON-LD title');
    check(result.data.item.shipping === 'Free', 'get_item maps free shipping');
    check(result.data.item.brand === 'Fixture Brand', 'get_item maps brand');
    check(calls[0].spec.url === ORIGIN + '/itm/236495878573', 'get_item reads item URL');
  }

  {
    const { ctx, calls } = makeCtx({ '/usr/watchseller': sellerHtml });
    const result = await handlers['ebay.get_seller_profile'].handle({ seller_id: 'watchseller' }, ctx);
    check(result.success === true && result.data.positive_feedback_pct === '99.8%',
      'get_seller_profile parses seller feedback');
    check(result.data.items_sold === '48K', 'get_seller_profile parses sold count');
    check(calls[0].spec.url === ORIGIN + '/usr/watchseller',
      'get_seller_profile reads seller URL');
  }

  {
    const { ctx, calls } = makeCtx({ '/mye/myebay/Watchlist': watchlistHtml });
    const result = await handlers['ebay.get_watchlist'].handle({}, ctx);
    check(result.success === true && result.data.items[0].item_id === '236495878573',
      'get_watchlist extracts watched item IDs');
    check(calls[0].spec.url === ORIGIN + '/mye/myebay/Watchlist',
      'get_watchlist reads My eBay watchlist');
  }

  {
    const queryPath = '/sch/i.html?_nkw=vintage%20watch&_sacat=0&_sop=15&_pgn=2&_udlo=10&_udhi=50&LH_ItemCondition=3000';
    const { ctx, calls } = makeCtx({ [queryPath]: searchHtml });
    const result = await handlers['ebay.search_items'].handle({
      query: 'vintage watch',
      sort: 'price_asc',
      page: 2,
      min_price: 10,
      max_price: 50,
      condition: 'used',
    }, ctx);
    check(result.success === true && result.data.total_results === 1234,
      'search_items parses total result count');
    check(result.data.items[0].item_id === '236495878573',
      'search_items parses listing item ID');
    check(calls[0].spec.url === ORIGIN + queryPath,
      'search_items builds the expected search URL');
  }

  {
    const { ctx, calls } = makeCtx({ '/sch/ajax/autocomplete?kwd=wat': suggestions });
    const result = await handlers['ebay.search_suggestions'].handle({ query: 'wat' }, ctx);
    check(result.success === true && result.data.url === suggestions.url,
      'search_suggestions parses autocomplete payload');
    check(result.data.active_factors.kwd === 'wat',
      'search_suggestions maps activeFactors');
    check(calls[0].spec.headers.Accept === 'application/json',
      'search_suggestions requests JSON');
  }

  {
    const { ctx, calls } = makeCtx({});
    const result = await handlers['ebay.watch_item'].handle({ item_id: '236495878573' }, ctx);
    check(result.success === false && result.code === 'RECIPE_DOM_FALLBACK_PENDING',
      'watch_item returns typed DOM fallback');
    check(result.reason === 'ebay-watch-item-mutation-unverified',
      'watch_item explains live UAT requirement');
    check(calls.length === 0, 'watch_item does not call execution primitives');
  }

  console.log('\nebay-head-handler: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  failed++;
  console.error('  FAIL: unhandled error:', err && err.stack ? err.stack : err);
  console.log('\nebay-head-handler: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(1);
});
