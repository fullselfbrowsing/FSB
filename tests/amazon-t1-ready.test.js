'use strict';

/**
 * Amazon T1 readiness and handler behavior.
 *
 * Run: node tests/amazon-t1-ready.test.js
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const REPO_ROOT = path.resolve(__dirname, '..');
const HANDLER_PATH = path.join(REPO_ROOT, 'catalog', 'handlers', 'amazon.js');
const EXT_HANDLER_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'handlers', 'amazon.js');
const REPORT_PATH = path.join(REPO_ROOT, 'scripts', 'report-t1-readiness.mjs');
const CONTRACT_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 't1-port-contract.mjs');
const CATALOG_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'recipe-index.generated.js');

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

function makeCtx(text) {
  const recorder = [];
  return {
    recorder,
    ctx: {
      tabId: 42,
      async executeBoundSpec(spec, tabId) {
        recorder.push({ spec, tabId });
        return { success: true, status: 200, text };
      },
    },
  };
}

function isDualFallback(result) {
  return !!result &&
    result.success === false &&
    result.code === 'RECIPE_DOM_FALLBACK_PENDING' &&
    result.errorCode === 'RECIPE_DOM_FALLBACK_PENDING' &&
    result.error === 'RECIPE_DOM_FALLBACK_PENDING' &&
    result.fellBackToDom === true;
}

function bySlug(rows, slug) {
  return rows.find(function(row) { return row && row.slug === slug; }) || null;
}

const searchHtml = [
  '<html><body>',
  '<div data-component-type="s-search-result" data-asin="B0TEST0001">',
  '<h2><a class="a-link-normal" href="/Example-Product/dp/B0TEST0001/ref=sr_1_1"><span>Example Product</span></a></h2>',
  '<span class="a-price"><span class="a-offscreen">$19.99</span></span>',
  '<span class="a-icon-alt">4.6 out of 5 stars</span>',
  '<a href="/Example-Product/product-reviews/B0TEST0001#customerReviews"><span>1,234</span></a>',
  '<img class="s-image" src="https://images.example/product.jpg">',
  '</div>',
  '</body></html>'
].join('');

const productHtml = [
  '<html><head>',
  '<script type="application/ld+json">',
  JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Example Product',
    image: 'https://images.example/product.jpg',
    description: 'A useful product fixture.',
    offers: {
      priceCurrency: 'USD',
      price: '19.99',
      availability: 'https://schema.org/InStock'
    },
    aggregateRating: { ratingValue: '4.8', reviewCount: '42' }
  }),
  '</script>',
  '</head><body><span id="productTitle">Example Product</span></body></html>'
].join('');

const ordersHtml = [
  '<html><body>',
  '<div class="order-card">',
  '<span>Order placed</span><span>June 20, 2026</span>',
  '<span>Total</span><span>$42.10</span>',
  '<a href="/gp/product/B0TEST0001">Example Product</a>',
  '<div>Delivered Monday, June 22</div>',
  '<span>111-2222222-3333333</span>',
  '</div>',
  '</body></html>'
].join('');

const trackingHtml = [
  '<html><body>',
  '<div>Order # 111-2222222-3333333</div>',
  '<h1>Arriving Friday, July 3</h1>',
  '<div>Carrier: Amazon Logistics</div>',
  '<div>Tracking ID TBA123456789</div>',
  '</body></html>'
].join('');

(async function run() {
  console.log('--- Amazon T1 readiness ---');

  check(fs.existsSync(HANDLER_PATH), 'catalog/handlers/amazon.js exists');
  check(fs.existsSync(EXT_HANDLER_PATH), 'extension/catalog/handlers/amazon.js exists');
  check(fs.readFileSync(HANDLER_PATH, 'utf8') === fs.readFileSync(EXT_HANDLER_PATH, 'utf8'),
    'extension Amazon handler matches catalog handler');

  const contract = await import(pathToFileURL(CONTRACT_PATH).href);
  const sourceFailures = contract.validateHandlerSource(fs.readFileSync(HANDLER_PATH, 'utf8'), {
    slug: 'amazon',
    handlerFile: 'amazon.js'
  }).failures;
  check(sourceFailures.length === 0,
    'Amazon handler source passes T1 source safety scan' +
    (sourceFailures.length ? ': ' + sourceFailures.join(' | ') : ''));

  const handlers = require(HANDLER_PATH);
  const expectedSlugs = [
    'amazon.search_products',
    'amazon.get_product',
    'amazon.list_orders',
    'amazon.track_order',
    'amazon.place_order',
    'amazon.cancel_order'
  ];
  for (const slug of expectedSlugs) {
    check(handlers[slug] && handlers[slug].tier === 'T1a' &&
        handlers[slug].origin === 'https://www.amazon.com' &&
        typeof handlers[slug].handle === 'function',
      slug + ' exposes a T1a same-origin handler');
  }

  const search = makeCtx(searchHtml);
  const searchResult = await handlers['amazon.search_products'].handle({
    query: 'example product',
    sort: 'price_low_to_high',
    limit: 1
  }, search.ctx);
  check(search.recorder.length === 1 &&
      search.recorder[0].spec.url === 'https://www.amazon.com/s?k=example%20product&s=price-asc-rank' &&
      search.recorder[0].spec.authStrategy === 'same-origin-cookie',
    'search_products issues one same-origin bound HTML request');
  check(searchResult.success === true &&
      searchResult.data.products[0].asin === 'B0TEST0001' &&
      searchResult.data.products[0].title === 'Example Product',
    'search_products parses Amazon search result cards');

  const product = makeCtx(productHtml);
  const productResult = await handlers['amazon.get_product'].handle({ product_id: 'B0TEST0001' }, product.ctx);
  check(product.recorder.length === 1 &&
      product.recorder[0].spec.url === 'https://www.amazon.com/dp/B0TEST0001',
    'get_product issues one same-origin product page request');
  check(productResult.success === true &&
      productResult.data.product.asin === 'B0TEST0001' &&
      productResult.data.product.title === 'Example Product' &&
      productResult.data.product.availability === 'InStock',
    'get_product parses product JSON-LD');

  const orders = makeCtx(ordersHtml);
  const ordersResult = await handlers['amazon.list_orders'].handle({ status: 'delivered', limit: 5 }, orders.ctx);
  check(orders.recorder.length === 1 &&
      orders.recorder[0].spec.url === 'https://www.amazon.com/gp/your-account/order-history',
    'list_orders issues one same-origin order-history request');
  check(ordersResult.success === true &&
      ordersResult.data.orders[0].order_id === '111-2222222-3333333' &&
      ordersResult.data.orders[0].status_bucket === 'delivered',
    'list_orders parses signed-in order cards and status filter');

  const tracking = makeCtx(trackingHtml);
  const trackingResult = await handlers['amazon.track_order'].handle({
    order_id: '111-2222222-3333333'
  }, tracking.ctx);
  check(tracking.recorder.length === 1 &&
      tracking.recorder[0].spec.url === 'https://www.amazon.com/gp/your-account/order-details?orderID=111-2222222-3333333',
    'track_order issues one same-origin order-detail request');
  check(trackingResult.success === true &&
      trackingResult.data.tracking.order_id === '111-2222222-3333333' &&
      trackingResult.data.tracking.tracking_number === 'TBA123456789',
    'track_order parses tracking summary');

  for (const slug of ['amazon.place_order', 'amazon.cancel_order']) {
    const guarded = makeCtx('<html></html>');
    const result = await handlers[slug].handle({}, guarded.ctx);
    check(isDualFallback(result) && guarded.recorder.length === 0,
      slug + ' fails closed without calling executeBoundSpec');
  }

  const reportMod = await import(pathToFileURL(REPORT_PATH).href);
  const report = reportMod.reportReadiness(require(CATALOG_PATH));
  const ready = [
    'amazon.search_products',
    'amazon.get_product',
    'amazon.list_orders',
    'amazon.track_order'
  ];
  for (const slug of ready) {
    const row = bySlug(report.rows, slug);
    check(row && row.readiness === 't1-ready' && row.resolvedTier === 'T1a' && row.hasHandlerProof === true,
      slug + ' is t1-ready with handler proof');
  }
  for (const slug of ['amazon.place_order', 'amazon.cancel_order']) {
    const row = bySlug(report.rows, slug);
    check(row && row.readiness === 't1-guarded-fail-closed' && row.resolvedTier === 'T1a',
      slug + ' is guarded fail-closed');
  }

  console.log('\namazon-t1-ready: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('  FAIL: amazon-t1-ready threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
