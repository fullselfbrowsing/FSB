#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const handlerPath = path.join(ROOT, 'catalog', 'handlers', 'ubereats.js');
const extensionHandlerPath = path.join(ROOT, 'extension', 'catalog', 'handlers', 'ubereats.js');
const handlers = require(handlerPath);

const READ_SLUGS = [
  'ubereats.list_restaurants',
  'ubereats.get_menu',
  'ubereats.list_orders'
];

const GUARDED_SLUGS = [
  'ubereats.place_order',
  'ubereats.cancel_order'
];

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    passed++;
    console.log('PASS:', message);
  } else {
    failed++;
    console.error('FAIL:', message);
  }
}

function makeCtx(dataFactory) {
  const calls = [];
  return {
    calls,
    ctx: {
      tabId: 260,
      async executeBoundSpec(spec, tabId) {
        calls.push({ spec, tabId });
        return { success: true, status: 200, data: dataFactory(spec) };
      }
    }
  };
}

(async function main() {
  const src = fs.readFileSync(handlerPath, 'utf8');
  check(fs.existsSync(extensionHandlerPath), 'extension Uber Eats handler mirror exists');
  check(fs.existsSync(extensionHandlerPath) && fs.readFileSync(extensionHandlerPath, 'utf8') === src,
    'extension Uber Eats handler mirror matches catalog handler');
  check(!/chrome\.(scripting|tabs|cookies|webRequest)|\bfetch\s*\(|\bXMLHttpRequest\b|Authorization|Bearer|document\.cookie|localStorage|sessionStorage|window\.location/i.test(src),
    'Uber Eats handler has no direct browser credential, storage, navigation, or network primitive');
  check(READ_SLUGS.every((slug) => handlers[slug]
      && handlers[slug].tier === 'T1a'
      && handlers[slug].origin === 'https://www.ubereats.com'
      && handlers[slug].sideEffectClass === 'read'
      && typeof handlers[slug].handle === 'function'),
    'Uber Eats read slugs are T1a reads pinned to www.ubereats.com');
  check(handlers['ubereats.place_order']
      && handlers['ubereats.place_order'].sideEffectClass === 'write'
      && handlers['ubereats.cancel_order']
      && handlers['ubereats.cancel_order'].sideEffectClass === 'destructive',
    'Uber Eats mutation slugs are guarded T1a write/destructive handlers');

  const restaurants = makeCtx(() => ({
    restaurants: [{
      id: 'store-1',
      name: 'Fixture Kitchen',
      cuisine: 'Sandwiches',
      rating: 4.8,
      deliveryTime: '25-35 min',
      deliveryFee: '$2.99'
    }]
  }));
  const restaurantOut = await handlers['ubereats.list_restaurants'].handle({
    address: '123 Market St',
    query: 'sandwich',
    limit: 2
  }, restaurants.ctx);
  check(restaurants.calls.length === 1
      && restaurants.calls[0].tabId === 260
      && restaurants.calls[0].spec.method === 'GET'
      && restaurants.calls[0].spec.url === 'https://www.ubereats.com/eats/v1/restaurants?address=123%20Market%20St&query=sandwich&limit=2'
      && restaurants.calls[0].spec.origin === 'https://www.ubereats.com'
      && restaurants.calls[0].spec.authStrategy === 'same-origin-cookie'
      && restaurants.calls[0].spec.headers.Accept === 'application/json',
    'ubereats.list_restaurants builds one origin-pinned JSON GET spec');
  check(restaurantOut && restaurantOut.success === true
      && restaurantOut.data.restaurants[0].id === 'store-1'
      && restaurantOut.data.restaurants[0].name === 'Fixture Kitchen',
    'ubereats.list_restaurants maps restaurant rows');

  const menu = makeCtx(() => ({
    menu: [{
      itemId: 'item-1',
      name: 'Fixture Melt',
      priceAmount: 1299,
      subtitle: 'Cheese and tomato',
      categoryName: 'Sandwiches'
    }]
  }));
  const menuOut = await handlers['ubereats.get_menu'].handle({ restaurant_id: 'store-1' }, menu.ctx);
  check(menu.calls.length === 1
      && menu.calls[0].spec.url === 'https://www.ubereats.com/eats/v1/restaurants/store-1/menu'
      && menuOut.success === true
      && menuOut.data.menu[0].item_id === 'item-1'
      && menuOut.data.menu[0].category === 'Sandwiches',
    'ubereats.get_menu targets the restaurant menu endpoint and maps menu items');

  const orders = makeCtx(() => ({
    orders: [{
      orderId: 'order-1',
      status: 'completed',
      restaurantName: 'Fixture Kitchen',
      totalDisplay: '$18.40',
      totalAmount: 1840,
      itemCount: 2
    }]
  }));
  const orderOut = await handlers['ubereats.list_orders'].handle({ status: 'completed', limit: 1 }, orders.ctx);
  check(orders.calls.length === 1
      && orders.calls[0].spec.url === 'https://www.ubereats.com/eats/v1/orders?status=completed&limit=1'
      && orderOut.success === true
      && orderOut.data.orders[0].id === 'order-1'
      && orderOut.data.orders[0].restaurant_name === 'Fixture Kitchen',
    'ubereats.list_orders targets the orders endpoint and maps order rows');

  const badShape = makeCtx(() => ({ restaurants: [] }));
  const badOut = await handlers['ubereats.list_restaurants'].handle({ query: 'pizza' }, badShape.ctx);
  check(badOut && badOut.success === false
      && badOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && badOut.errorCode === badOut.code
      && badOut.error === badOut.code
      && badOut.fellBackToDom === true,
    'Uber Eats reads fail closed on unrecognized JSON shape');

  const guardedCalls = [];
  const guardedCtx = { async executeBoundSpec() { guardedCalls.push('executeBoundSpec'); } };
  const placeOrder = await handlers['ubereats.place_order'].handle({
    restaurant_id: 'store-1',
    items: [{ item_id: 'item-1', quantity: 1 }],
    delivery_address: '123 Market St'
  }, guardedCtx);
  const cancelOrder = await handlers['ubereats.cancel_order'].handle({ order_id: 'order-1' }, guardedCtx);
  check(GUARDED_SLUGS.every((slug) => handlers[slug].tier === 'T1a'
      && handlers[slug].origin === 'https://www.ubereats.com'
      && typeof handlers[slug].handle === 'function'),
    'Uber Eats guarded slugs are registered as T1a handlers');
  check(placeOrder && placeOrder.success === false
      && placeOrder.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && placeOrder.errorCode === placeOrder.code
      && placeOrder.error === placeOrder.code
      && placeOrder.fellBackToDom === true
      && cancelOrder && cancelOrder.success === false
      && cancelOrder.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && cancelOrder.errorCode === cancelOrder.code
      && cancelOrder.error === cancelOrder.code
      && cancelOrder.fellBackToDom === true,
    'Uber Eats guarded writes return typed fail-closed fallback results');
  check(guardedCalls.length === 0,
    'Uber Eats guarded writes never call executeBoundSpec without live mutation evidence');

  console.log('Uber Eats handler checks: ' + passed + ' passed, ' + failed + ' failed');
  if (failed) process.exit(1);
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
