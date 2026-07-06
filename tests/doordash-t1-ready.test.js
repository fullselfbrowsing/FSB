#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const handlerPath = path.join(ROOT, 'catalog', 'handlers', 'doordash.js');
const extensionHandlerPath = path.join(ROOT, 'extension', 'catalog', 'handlers', 'doordash.js');
const descriptorsDir = path.join(ROOT, 'catalog', 'descriptors');
const handlers = require(handlerPath);

const READ_SLUGS = [
  'doordash.get_current_user',
  'doordash.list_addresses',
  'doordash.list_orders',
  'doordash.get_order',
  'doordash.list_payment_methods',
  'doordash.get_notifications'
];

const MUTATION_SLUGS = [
  'doordash.bookmark_store',
  'doordash.mark_notifications_read',
  'doordash.unbookmark_store',
  'doordash.update_default_address',
  'doordash.update_profile'
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

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function descriptorForSlug(slug) {
  return readJson(path.join(descriptorsDir, 'opentabs__' + slug.replace('.', '__') + '.json'));
}

function parseBody(spec) {
  return JSON.parse(String(spec && spec.body || '{}'));
}

function orderFixture(id) {
  return {
    id: id || 'order-test',
    orderUuid: 'uuid-' + (id || 'order-test'),
    deliveryUuid: 'delivery-test',
    createdAt: '2026-06-30T18:00:00Z',
    submittedAt: '2026-06-30T18:01:00Z',
    fulfilledAt: '2026-06-30T18:35:00Z',
    isGroup: false,
    isGift: false,
    isPickup: false,
    isRetail: false,
    fulfillmentType: 'delivery',
    isReorderable: true,
    creator: { id: 'consumer-test', firstName: 'Door', lastName: 'Dash' },
    deliveryAddress: { id: 'address-test', formattedAddress: '123 Market St' },
    store: { id: 'store-test', name: 'DoorDash Fixture Kitchen' },
    orders: [{ items: [{ id: 'item-test', name: 'Fixture Bowl', quantity: 2, originalItemPrice: 1394 }] }],
    paymentCard: { id: 'card-test', type: 'visa', last4: '4242' },
    grandTotal: { unitAmount: 2788, currency: 'USD', displayString: '$27.88' }
  };
}

function dataForSpec(spec) {
  const op = parseBody(spec).operationName;
  if (op === 'consumer') {
    return {
      data: {
        consumer: {
          id: 'consumer-test',
          userId: 'user-test',
          firstName: 'Door',
          lastName: 'Dash',
          email: 'doordash@example.invalid',
          phoneNumber: '+15025550100',
          timezone: 'America/New_York',
          defaultCountry: 'US',
          isGuest: false,
          defaultAddress: {
            id: 'address-test',
            street: '123 Market St',
            city: 'Louisville',
            state: 'KY',
            zipCode: '40202',
            printableAddress: '123 Market St, Louisville, KY 40202'
          }
        }
      }
    };
  }
  if (op === 'getAvailableAddresses') {
    return {
      data: {
        getAvailableAddresses: [{
          id: 'address-test',
          addressId: 'address-id-test',
          street: '123 Market St',
          city: 'Louisville',
          state: 'KY',
          zipCode: '40202',
          country: 'United States',
          lat: 38.2527,
          lng: -85.7585,
          timezone: 'America/New_York',
          shortname: 'Home',
          printableAddress: '123 Market St',
          driverInstructions: 'Leave at door'
        }]
      }
    };
  }
  if (op === 'getConsumerOrdersWithDetails') {
    return { data: { getConsumerOrdersWithDetails: [orderFixture('order-test')] } };
  }
  if (op === 'getPaymentMethodList') {
    return {
      data: {
        getPaymentMethodList: [{
          id: 'payment-test',
          isDefault: true,
          type: 'visa',
          last4: '4242',
          expYear: 2030,
          expMonth: 12,
          metadata: { isDashCard: false, isHsaFsaCard: false }
        }]
      }
    };
  }
  if (op === 'getHasNewNotifications') {
    return { data: { getHasNewNotifications: { hasNewNotifications: true, numUnreadNotifications: 3 } } };
  }
  return { data: {} };
}

function makeCtx(responseFactory) {
  const calls = [];
  return {
    calls,
    ctx: {
      origin: 'https://www.doordash.com',
      tabId: 101,
      async executeBoundSpec(spec, tabId) {
        calls.push({ spec, tabId });
        return { success: true, status: 200, data: responseFactory ? responseFactory(spec) : dataForSpec(spec) };
      }
    }
  };
}

async function main() {
  const src = fs.readFileSync(handlerPath, 'utf8');
  check(fs.existsSync(extensionHandlerPath), 'extension DoorDash handler mirror exists');
  check(fs.existsSync(extensionHandlerPath) && fs.readFileSync(extensionHandlerPath, 'utf8') === src,
    'extension DoorDash handler mirror matches catalog handler');
  check(READ_SLUGS.every((slug) => handlers[slug] && handlers[slug].tier === 'T1a'
    && handlers[slug].origin === 'https://www.doordash.com'
    && handlers[slug].sideEffectClass === 'read'
    && typeof handlers[slug].handle === 'function'),
    'DoorDash promoted slugs are T1a read handlers pinned to www.doordash.com');
  check(MUTATION_SLUGS.every((slug) => !handlers[slug]),
    'DoorDash mutation slugs remain outside the T1 handler');
  check(!/chrome\.(scripting|tabs|cookies|webRequest)|\bfetch\s*\(|\bXMLHttpRequest\b|Authorization|Bearer|document\.cookie|localStorage|sessionStorage/i.test(src),
    'DoorDash handler has no direct browser credential, storage, or network primitive');
  check(READ_SLUGS.every((slug) => descriptorForSlug(slug).backing === 'handler'),
    'DoorDash promoted descriptors are handler-backed');
  check(MUTATION_SLUGS.every((slug) => descriptorForSlug(slug).backing !== 'handler'),
    'DoorDash mutation descriptors are not handler-backed');

  const user = makeCtx();
  const userOut = await handlers['doordash.get_current_user'].handle({}, user.ctx);
  const userSpec = user.calls[0].spec;
  check(user.calls.length === 1
    && userSpec.method === 'POST'
    && userSpec.url === 'https://www.doordash.com/graphql/consumer'
    && userSpec.origin === 'https://www.doordash.com'
    && userSpec.authStrategy === 'same-origin-cookie'
    && userSpec.csrfSource.selector === 'csrf_token'
    && userSpec.csrfSource.header === 'x-csrftoken'
    && userSpec.headers['x-channel-id'] === 'marketplace'
    && userSpec.headers['x-experience-id'] === 'doordash'
    && parseBody(userSpec).operationName === 'consumer',
    'get_current_user builds one same-origin GraphQL spec with CSRF metadata');
  check(userOut.success === true
    && userOut.data.consumer.id === 'consumer-test'
    && userOut.data.consumer.email === 'doordash@example.invalid'
    && userOut.data.consumer.default_address.zip_code === '40202',
    'get_current_user maps consumer fields');

  const addresses = makeCtx();
  const addressesOut = await handlers['doordash.list_addresses'].handle({}, addresses.ctx);
  check(parseBody(addresses.calls[0].spec).operationName === 'getAvailableAddresses'
    && addressesOut.success === true
    && addressesOut.data.addresses[0].address_id === 'address-id-test'
    && addressesOut.data.addresses[0].driver_instructions === 'Leave at door',
    'list_addresses maps saved addresses');

  const orders = makeCtx();
  const ordersOut = await handlers['doordash.list_orders'].handle({ offset: 2, limit: 5, include_cancelled: false }, orders.ctx);
  const orderBody = parseBody(orders.calls[0].spec);
  check(orderBody.operationName === 'getConsumerOrdersWithDetails'
    && orderBody.variables.offset === 2
    && orderBody.variables.limit === 5
    && orderBody.variables.includeCancelled === false
    && ordersOut.success === true
    && ordersOut.data.orders[0].items[0].name === 'Fixture Bowl'
    && ordersOut.data.orders[0].grand_total_display === '$27.88',
    'list_orders builds bounded pagination variables and maps orders');

  const order = makeCtx();
  const orderOut = await handlers['doordash.get_order'].handle({ order_id: 'order-test' }, order.ctx);
  check(parseBody(order.calls[0].spec).variables.limit === 20
    && parseBody(order.calls[0].spec).variables.includeCancelled === true
    && orderOut.success === true
    && orderOut.data.order.store_name === 'DoorDash Fixture Kitchen',
    'get_order searches recent orders and maps the matching order');

  const payments = makeCtx();
  const paymentsOut = await handlers['doordash.list_payment_methods'].handle({}, payments.ctx);
  check(parseBody(payments.calls[0].spec).operationName === 'getPaymentMethodList'
    && paymentsOut.success === true
    && paymentsOut.data.payment_methods[0].id === 'payment-test'
    && paymentsOut.data.payment_methods[0].last4 === '4242',
    'list_payment_methods maps saved payment methods');

  const notifications = makeCtx();
  const notificationsOut = await handlers['doordash.get_notifications'].handle({}, notifications.ctx);
  check(parseBody(notifications.calls[0].spec).operationName === 'getHasNewNotifications'
    && notificationsOut.success === true
    && notificationsOut.data.status.has_new_notifications === true
    && notificationsOut.data.status.num_unread_notifications === 3,
    'get_notifications maps notification status');

  const badShape = makeCtx(() => ({ data: { consumer: null } }));
  const badShapeOut = await handlers['doordash.get_current_user'].handle({}, badShape.ctx);
  check(badShapeOut.success === false
    && badShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
    && badShapeOut.reason === 'doordash-graphql-shape-mismatch',
    'unexpected GraphQL shapes fail closed to DOM fallback');

  const noPrimitiveOut = await handlers['doordash.get_order'].handle({ order_id: 'order-test' }, {
    origin: 'https://www.doordash.com',
    tabId: 102
  });
  check(noPrimitiveOut.success === false
    && noPrimitiveOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
    && noPrimitiveOut.reason === 'doordash-execute-bound-spec-unavailable',
    'missing executeBoundSpec fails closed to DOM fallback');
}

main().then(() => {
  console.log('passed:', passed, 'failed:', failed);
  process.exit(failed ? 1 : 0);
}, (err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
