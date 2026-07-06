#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const handlerPath = path.join(ROOT, 'catalog', 'handlers', 'uber.js');
const extensionHandlerPath = path.join(ROOT, 'extension', 'catalog', 'handlers', 'uber.js');
const readinessPath = path.join(ROOT, 'scripts', 'report-t1-readiness.mjs');
const portContractPath = path.join(ROOT, 'scripts', 'verify-t1-port-contract.mjs');
const catalogPath = path.join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js');
const searchPath = path.join(ROOT, 'extension', 'utils', 'capability-search.js');
const handlers = require(handlerPath);

const READ_SLUGS = [
  'uber.get_current_user',
  'uber.search_locations',
  'uber.get_travel_status',
  'uber.get_membership',
  'uber.get_past_activities',
  'uber.get_enabled_products',
  'uber.get_upcoming_activities',
  'uber.get_product_suggestions'
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

function envelope(data) {
  return { status: 'success', data };
}

function makeCtx(dataFactory) {
  const calls = [];
  return {
    calls,
    ctx: {
      tabId: 701,
      async executeBoundSpec(spec, tabId) {
        calls.push({ spec, tabId });
        return { success: true, status: 200, data: envelope(dataFactory(spec)) };
      }
    }
  };
}

function parseBody(spec) {
  return JSON.parse(String(spec && spec.body || '{}'));
}

function rowBySlug(rows, slug) {
  return rows.find((row) => row && row.slug === slug) || null;
}

(async function main() {
  const src = fs.readFileSync(handlerPath, 'utf8');
  check(fs.existsSync(extensionHandlerPath), 'extension Uber handler mirror exists');
  check(fs.existsSync(extensionHandlerPath) && fs.readFileSync(extensionHandlerPath, 'utf8') === src,
    'extension Uber handler mirror matches catalog handler');
  check(!/chrome\.(scripting|tabs|cookies|webRequest)|\bfetch\s*\(|\bXMLHttpRequest\b|Authorization|Bearer|document\.cookie|localStorage|sessionStorage|window\.location/i.test(src),
    'Uber handler has no direct browser credential, storage, navigation, or network primitive');
  check(READ_SLUGS.every((slug) => handlers[slug]
      && handlers[slug].tier === 'T1a'
      && handlers[slug].origin === 'https://www.uber.com'
      && handlers[slug].sideEffectClass === 'read'
      && typeof handlers[slug].handle === 'function'),
    'Uber read slugs are T1a reads pinned to www.uber.com');
  check(!Object.keys(handlers).some((slug) => slug.indexOf('ubereats.') === 0),
    'Uber rideshare handler does not expose Uber Eats slugs');

  const user = makeCtx(() => ({
    user: { firstName: 'Ada', lastName: 'Rider', pictureUrl: 'https://img.example/ada.png' }
  }));
  const userOut = await handlers['uber.get_current_user'].handle({}, user.ctx);
  check(user.calls.length === 1
      && user.calls[0].tabId === 701
      && user.calls[0].spec.url === 'https://www.uber.com/api/getCurrentUser?localeCode=en'
      && user.calls[0].spec.method === 'POST'
      && user.calls[0].spec.origin === 'https://www.uber.com'
      && user.calls[0].spec.authStrategy === 'same-origin-cookie'
      && user.calls[0].spec.headers['x-csrf-token'] === 'x'
      && user.calls[0].spec.body === '{}',
    'uber.get_current_user builds one origin-pinned same-origin POST read spec');
  check(userOut && userOut.success === true
      && userOut.data.user.first_name === 'Ada'
      && userOut.data.user.picture_url === 'https://img.example/ada.png',
    'uber.get_current_user maps user profile');

  const locations = makeCtx(() => ([{
    id: 'place-1',
    addressLine1: 'SFO Terminal 2',
    addressLine2: 'San Francisco, CA',
    provider: 'uber',
    type: 'LOCATION',
    tag: 'AIRPORT',
    categories: ['airport']
  }]));
  const locationsOut = await handlers['uber.search_locations'].handle({
    query: 'SFO',
    latitude: 37.7749,
    longitude: -122.4194,
    type: 'DROPOFF'
  }, locations.ctx);
  check(locations.calls.length === 1
      && locations.calls[0].spec.url === 'https://www.uber.com/api/pudoLocationSearch?localeCode=en'
      && parseBody(locations.calls[0].spec).query === 'SFO'
      && parseBody(locations.calls[0].spec).type === 'DROPOFF'
      && locationsOut.success === true
      && locationsOut.data.locations[0].id === 'place-1',
    'uber.search_locations posts a bounded same-origin location-search read and maps locations');

  const travel = makeCtx(() => ({ isUserTraveling: true }));
  const travelOut = await handlers['uber.get_travel_status'].handle({ latitude: 1.5, longitude: 2.5 }, travel.ctx);
  check(parseBody(travel.calls[0].spec).location.latitude === 1.5
      && travelOut.success === true
      && travelOut.data.is_traveling === true,
    'uber.get_travel_status posts location body and maps active ride status');

  const membership = makeCtx(() => ({
    response: {
      savings_average_monthly_savings: { amountE5: '3000000', currencyCode: 'USD' },
      offering_monthly_offering_price: { amountE5: '999000', currencyCode: 'USD' },
      savings_nonmember_potential_savings: { amountE5: '1250000', currencyCode: 'USD' }
    }
  }));
  const membershipOut = await handlers['uber.get_membership'].handle({}, membership.ctx);
  check(membershipOut.success === true
      && membershipOut.data.membership.average_monthly_savings === '$30.00 USD'
      && membershipOut.data.membership.monthly_price === '$9.99 USD',
    'uber.get_membership maps Uber One amountE5 values');

  const activities = makeCtx(() => ({
    pastActivities: [{
      title: 'Trip to Downtown',
      subTitle: 'Jun 30',
      tertiaryTitle: '$17.46',
      orderType: 'ORDER_TYPE_MOBILITY',
      detailsUrl: '/trips/1',
      ctaUrl: '/rebook/1'
    }, {
      title: 'Food delivery',
      orderType: 'ORDER_TYPE_DELIVERY'
    }]
  }));
  const activitiesOut = await handlers['uber.get_past_activities'].handle({}, activities.ctx);
  check(parseBody(activities.calls[0].spec).showOnlyTrip === true
      && activitiesOut.success === true
      && activitiesOut.data.activities.length === 1
      && activitiesOut.data.activities[0].title === 'Trip to Downtown',
    'uber.get_past_activities requests trip-only history and filters non-ride activity');

  const products = makeCtx(() => ({
    enabledProducts: {
      RIDE: { defaultTitle: 'Ride' },
      CONNECT: { defaultTitle: 'Courier' }
    }
  }));
  const productsOut = await handlers['uber.get_enabled_products'].handle({}, products.ctx);
  check(productsOut.success === true
      && productsOut.data.products.length === 2
      && productsOut.data.products[0].product_key === 'RIDE',
    'uber.get_enabled_products maps enabled product keys');

  const upcoming = makeCtx(() => ({ upcomingTrip: { uuid: 'trip-1', state: 'scheduled' } }));
  const upcomingOut = await handlers['uber.get_upcoming_activities'].handle({}, upcoming.ctx);
  check(upcomingOut.success === true
      && upcomingOut.data.has_upcoming_trip === true
      && upcomingOut.data.upcoming_trip.uuid === 'trip-1',
    'uber.get_upcoming_activities maps upcoming trip state');

  const suggestions = makeCtx(() => ({
    suggestions: [{
      primaryText: 'Reserve',
      secondaryText: 'Schedule a ride',
      type: 'RESERVE',
      url: '/reserve',
      imageUrl: 'https://img.example/reserve.png'
    }]
  }));
  const suggestionsOut = await handlers['uber.get_product_suggestions'].handle({ type: 'CUSTOM' }, suggestions.ctx);
  check(parseBody(suggestions.calls[0].spec).type === 'CUSTOM'
      && suggestionsOut.success === true
      && suggestionsOut.data.suggestions[0].name === 'Reserve',
    'uber.get_product_suggestions maps product suggestions');

  const badShape = makeCtx(() => ({ nope: true }));
  const badOut = await handlers['uber.get_current_user'].handle({}, badShape.ctx);
  check(badOut && badOut.success === false
      && badOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && badOut.errorCode === badOut.code
      && badOut.error === badOut.code
      && badOut.fellBackToDom === true,
    'Uber reads fail closed on unrecognized JSON shape');

  const unavailableOut = await handlers['uber.get_enabled_products'].handle({}, {});
  check(unavailableOut && unavailableOut.success === false
      && unavailableOut.code === 'RECIPE_DOM_FALLBACK_PENDING',
    'Uber reads fail closed when executeBoundSpec is unavailable');

  const searchSrc = fs.readFileSync(searchPath, 'utf8');
  check(READ_SLUGS.every((slug) => searchSrc.indexOf("'" + slug + "': true") !== -1),
    'capability search labels all Uber read slugs t1-ready');

  const catalog = require(catalogPath);
  const readinessMod = await import(pathToFileURL(readinessPath).href);
  const report = readinessMod.reportReadiness(catalog);
  const rows = READ_SLUGS.map((slug) => rowBySlug(report.rows, slug));
  check(rows.every((row) => row
      && row.readiness === 't1-ready'
      && row.resolvedTier === 'T1a'
      && row.proof === 'handler'
      && row.originClass === 'sensitive'
      && row.routeFeasibility === 'same-site-subdomain-proven'),
    'readiness report marks Uber reads as sensitive same-site T1 handler rows');

  const portMod = await import(pathToFileURL(portContractPath).href);
  const portResult = await portMod.validateCurrentT1PortGate(catalog, { report, rows });
  check(portResult.failures.length === 0,
    'targeted Uber T1 port-contract validation passes' +
    (portResult.failures.length ? ': ' + portResult.failures.join(' | ') : ''));

  console.log('Uber handler checks: ' + passed + ' passed, ' + failed + ' failed');
  if (failed) process.exit(1);
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
