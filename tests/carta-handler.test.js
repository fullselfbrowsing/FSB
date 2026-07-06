#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CATALOG_HANDLER = path.join(ROOT, 'catalog', 'handlers', 'carta.js');
const EXTENSION_HANDLER = path.join(ROOT, 'extension', 'catalog', 'handlers', 'carta.js');
const handlers = require(CATALOG_HANDLER);

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

function makeCtx(responses, opts) {
  const calls = [];
  const ctx = {
    tabId: 42,
    url: opts && opts.url,
    async executeBoundSpec(spec, tabId) {
      calls.push({ spec, tabId });
      const parsed = new URL(spec.url);
      const pathWithQuery = parsed.pathname + parsed.search;
      const value = Object.prototype.hasOwnProperty.call(responses, pathWithQuery)
        ? responses[pathWithQuery]
        : responses[parsed.pathname];
      if (value && value.__raw) { return value.__raw; }
      return { success: true, status: 200, data: value };
    }
  };
  return { ctx, calls };
}

async function run() {
  console.log('--- Carta T1a handler contract ---');

  const slugs = Object.keys(handlers).sort();
  check(slugs.length === 20, 'exports all 20 Carta OpenTabs slugs');
  check(fs.readFileSync(CATALOG_HANDLER, 'utf8') === fs.readFileSync(EXTENSION_HANDLER, 'utf8'),
    'extension Carta handler mirrors catalog handler');

  const source = fs.readFileSync(CATALOG_HANDLER, 'utf8');
  check(!/\bfetch\s*\(/.test(source), 'handler does not issue direct fetch calls');
  check(!/\bchrome\.(tabs|scripting)\b/.test(source), 'handler does not use chrome tab/scripting APIs');

  for (const slug of slugs) {
    const entry = handlers[slug];
    check(entry && entry.tier === 'T1a', slug + ' is T1a');
    check(entry && entry.origin === 'https://app.carta.com', slug + ' pins app.carta.com origin');
    check(entry && entry.sideEffectClass === 'read', slug + ' is read-only');
    check(entry && entry.params && entry.params.additionalProperties === false,
      slug + ' has a closed params schema');
    check(entry && typeof entry.handle === 'function', slug + ' exposes handle()');
  }

  {
    const { ctx, calls } = makeCtx({
      '/api/fe-platform/account-switcher/': {
        accounts: [{ name: 'Main', id: 123, accountType: 'investor', isFavorite: true }]
      }
    });
    const result = await handlers['carta.list_accounts'].handle({}, ctx);
    check(result.success === true, 'list_accounts succeeds on account-switcher payload');
    check(result.data.accounts[0].account_type === 'investor', 'list_accounts maps accountType');
    check(result.data.accounts[0].is_favorite === true, 'list_accounts maps isFavorite');
    check(calls[0].tabId === 42, 'list_accounts uses the active tab id');
    check(calls[0].spec.origin === 'https://app.carta.com', 'list_accounts spec pins Carta origin');
    check(calls[0].spec.method === 'GET', 'list_accounts uses GET');
    check(calls[0].spec.authStrategy === 'same-origin-cookie', 'list_accounts uses same-origin cookies');
  }

  {
    const { ctx, calls } = makeCtx({
      '/api/investors/portfolio/fund/123/list/': {
        count: 1,
        results: {
          companies: [{
            name: 'Acme',
            corporation_id: 456,
            is_public: false,
            is_favourite: true,
            landing_url: '/investors/individual/123/portfolio/456/',
            has_logo: true
          }]
        }
      }
    }, { url: 'https://app.carta.com/investors/individual/123/portfolio/456/holdings' });
    const result = await handlers['carta.list_companies'].handle({}, ctx);
    check(result.success === true, 'list_companies succeeds with portfolio context');
    check(result.data.companies[0].corporation_id === 456, 'list_companies maps corporation id');
    check(new URL(calls[0].spec.url).pathname === '/api/investors/portfolio/fund/123/list/',
      'list_companies derives portfolio id from active Carta URL');
  }

  {
    const { ctx, calls } = makeCtx({
      '/api/fe-platform/pendo-config/?url=%2Finvestors%2Findividual%2F123%2Fportfolio%2F': {
        visitor: { id: 7, email: 'investor@example.com', name: 'Investor', user_type: 'individual' },
        account: { id: 123, name: 'Investor Account' }
      }
    }, { url: 'https://app.carta.com/investors/individual/123/portfolio/456/tasks' });
    const result = await handlers['carta.get_current_user'].handle({}, ctx);
    const requested = new URL(calls[0].spec.url);
    check(result.success === true, 'get_current_user succeeds on pendo config payload');
    check(result.data.user.portfolio_id === 123, 'get_current_user maps portfolio id');
    check(requested.searchParams.get('url') === '/investors/individual/123/portfolio/',
      'get_current_user sends the reviewed Carta page URL query');
  }

  {
    const { ctx, calls } = makeCtx({
      '/api/investors/holdings/portfolio/123/corporation/456/options/': {
        rows: [{ id: 9, label: 'ISO-1', quantity: 100, exercise_price: 1.25, can_exercise: 10 }]
      }
    }, { url: 'https://app.carta.com/investors/individual/123/portfolio/456/holdings' });
    const result = await handlers['carta.list_options'].handle({ corporation_id: 456 }, ctx);
    check(result.success === true, 'list_options succeeds for corporation-scoped holdings');
    check(result.data.options[0].exercise_price === 1.25, 'list_options maps exercise price');
    check(new URL(calls[0].spec.url).pathname === '/api/investors/holdings/portfolio/123/corporation/456/options/',
      'list_options builds the expected same-origin endpoint');
  }

  {
    const { ctx, calls } = makeCtx({});
    const result = await handlers['carta.list_companies'].handle({}, ctx);
    check(result.success === false && result.code === 'RECIPE_DOM_FALLBACK_PENDING',
      'portfolio-scoped reads fail closed without active Carta portfolio context');
    check(calls.length === 0, 'missing portfolio context does not call executeBoundSpec');
  }

  {
    const { ctx } = makeCtx({
      '/api/tasks/': { __raw: { success: true, status: 401, data: { tasks: [] } } }
    });
    const result = await handlers['carta.get_tasks'].handle({}, ctx);
    check(result.success === false && result.reason === 'carta-api-read-failed',
      'auth/status failure returns DOM fallback');
  }

  console.log(`\ncarta-handler: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  failed++;
  console.error('  FAIL: unhandled error:', err && err.stack || err);
  console.log(`\ncarta-handler: ${passed} passed, ${failed} failed`);
  process.exit(1);
});
