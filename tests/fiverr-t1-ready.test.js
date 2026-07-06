#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HANDLER_PATH = path.join(ROOT, 'catalog', 'handlers', 'fiverr.js');
const EXT_HANDLER_PATH = path.join(ROOT, 'extension', 'catalog', 'handlers', 'fiverr.js');
const DESCRIPTORS_DIR = path.join(ROOT, 'catalog', 'descriptors');
const handlers = require(HANDLER_PATH);

const ORIGIN = 'https://www.fiverr.com';
const READ_SLUGS = [
  'fiverr.draft_message',
  'fiverr.get_conversation',
  'fiverr.get_current_page_context',
  'fiverr.get_gig_details',
  'fiverr.get_seller_profile',
  'fiverr.list_conversations',
  'fiverr.search_gigs'
];
const ALL_SLUGS = READ_SLUGS.concat(['fiverr.send_message']);

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

function descriptor(slug) {
  return JSON.parse(fs.readFileSync(path.join(
    DESCRIPTORS_DIR,
    'opentabs__' + slug.replace('.', '__') + '.json'
  ), 'utf8'));
}

function perseus(data) {
  return '<html><head><title>Fixture</title></head><body><script id="perseus-initial-props" type="application/json">' +
    JSON.stringify(data) +
    '</script></body></html>';
}

function homeHtml() {
  return [
    '<html><head><title>Fiverr Fixture</title></head><body>',
    '<script>initialData.FiverrContext={"userId":42,"currency":"USD","countryCode":"US","locale":"en-US","isPro":true};</script>',
    '<script>initialData.UserActivationMessage={"username":"buyer_user"};</script>',
    '</body></html>'
  ].join('');
}

function makeCtx(responses) {
  const calls = [];
  return {
    calls,
    ctx: {
      tabId: 517,
      url: ORIGIN + '/fixture',
      title: 'Fixture Page',
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
      }
    }
  };
}

(async function run() {
  console.log('--- Fiverr T1 readiness proof ---');

  const src = fs.readFileSync(HANDLER_PATH, 'utf8');
  check(fs.existsSync(EXT_HANDLER_PATH), 'extension Fiverr handler mirror exists');
  check(fs.existsSync(EXT_HANDLER_PATH) && fs.readFileSync(EXT_HANDLER_PATH, 'utf8') === src,
    'extension Fiverr handler mirror matches catalog handler');
  check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)/.test(src),
    'Fiverr handler has no direct network or privileged browser API calls');
  check(!/document\.cookie|localStorage|sessionStorage|Authorization|Bearer|window\.location|document\.querySelector/i.test(src),
    'Fiverr handler reads no cookies, storage, credential headers, navigation globals, or DOM selectors');

  check(Object.keys(handlers).sort().join(',') === ALL_SLUGS.slice().sort().join(','),
    'Fiverr handler exports all descriptor slugs');
  for (const slug of ALL_SLUGS) {
    const entry = handlers[slug];
    const desc = descriptor(slug);
    check(entry && entry.tier === 'T1a', slug + ' is T1a');
    check(entry && entry.origin === ORIGIN, slug + ' pins www.fiverr.com origin');
    check(entry && entry.params && entry.params.additionalProperties === false,
      slug + ' has a closed params schema');
    check(desc.backing === 'handler', slug + ' descriptor is handler-backed');
    check(entry && entry.sideEffectClass === desc.sideEffectClass,
      slug + ' sideEffectClass matches descriptor');
  }

  const searchHtml = perseus({
    currency: { name: 'USD' },
    listings: [{
      gigs: [{
        gigId: 101,
        title: 'Design a clean logo',
        gig_url: '/seller/design-a-clean-logo',
        seller_name: 'seller',
        seller_display_name: 'Seller Studio',
        seller_level: 'level_two',
        seller_country: 'United States',
        is_pro: true,
        buying_review_rating: 4.9,
        buying_review_rating_count: 88,
        price_i: 5000,
        num_of_packages: 3,
        assets: [{ cloud_img_main_gig: 'https://img.fiverrcdn.com/logo.jpg' }]
      }]
    }],
    rawListingData: { num_found: 12, has_more: true }
  });
  const search = makeCtx({ '/search/gigs?query=logo%20design&page=2': searchHtml });
  const searchOut = await handlers['fiverr.search_gigs'].handle({ query: 'logo design', page: 2 }, search.ctx);
  check(search.calls.length === 1
      && search.calls[0].tabId === 517
      && search.calls[0].spec.url === ORIGIN + '/search/gigs?query=logo%20design&page=2'
      && search.calls[0].spec.method === 'GET'
      && search.calls[0].spec.origin === ORIGIN
      && search.calls[0].spec.authStrategy === 'same-origin-cookie'
      && search.calls[0].spec.headers.Accept === 'text/html',
    'fiverr.search_gigs builds one origin-pinned HTML GET spec');
  check(searchOut && searchOut.success === true
      && searchOut.data.gigs[0].gig_id === 101
      && searchOut.data.gigs[0].seller_name === 'seller'
      && searchOut.data.total_found === 12
      && searchOut.data.has_more === true,
    'fiverr.search_gigs maps gig summaries');

  const gigHtml = perseus({
    general: {
      gigId: 202,
      gigTitle: 'Build a fixture site',
      gigStatus: 'approved',
      categoryName: 'Programming',
      subCategoryName: 'Websites',
      isPro: false
    },
    overview: { gig: { rating: 4.8, ratingsCount: 19, ordersInQueue: 2 } },
    description: { content: '<p>Fixture gig</p>' },
    sellerCard: { oneLiner: 'Fast builder', countryCode: 'US', memberSince: '2020', responseTime: '1 hour' },
    packages: { packageList: [{ id: 1, title: 'Basic', description: 'One page', price: 10000, duration: 48, revisions: { value: 2 }, extraFast: { included: true }, features: [{ label: 'Responsive' }] }] },
    reviews: { reviews: [{ id: 'r1', username: 'buyer', reviewer_country: 'US', value: 5, comment: 'Great', created_at: '2026-07-01' }] },
    seller: { user: { name: 'seller' } }
  });
  const gig = makeCtx({ '/seller/build-a-fixture-site': gigHtml });
  const gigOut = await handlers['fiverr.get_gig_details'].handle({ gig_url: ORIGIN + '/seller/build-a-fixture-site?x=1' }, gig.ctx);
  check(gig.calls.length === 1
      && gig.calls[0].spec.url === ORIGIN + '/seller/build-a-fixture-site',
    'fiverr.get_gig_details normalizes full Fiverr URLs to same-origin paths');
  check(gigOut && gigOut.success === true
      && gigOut.data.gig.gig_id === 202
      && gigOut.data.gig.packages[0].features[0] === 'Responsive'
      && gigOut.data.gig.reviews[0].reviewer === 'buyer',
    'fiverr.get_gig_details maps gig details');

  const sellerHtml = perseus({
    seller: {
      user: {
        name: 'seller',
        joinedAt: '2019',
        profile: { displayName: 'Seller Studio' },
        address: { countryName: 'United States' }
      },
      isPro: true,
      isVerified: true,
      sellerLevel: 'LEVEL_TWO',
      oneLinerTitle: 'Design specialist',
      description: '<b>Bio</b>',
      rating: { score: 4.9, count: 99 },
      approvedGigsCount: 4
    }
  });
  const seller = makeCtx({ '/seller': sellerHtml });
  const sellerOut = await handlers['fiverr.get_seller_profile'].handle({ username: '@seller' }, seller.ctx);
  check(seller.calls.length === 1
      && seller.calls[0].spec.url === ORIGIN + '/seller',
    'fiverr.get_seller_profile targets the seller page');
  check(sellerOut && sellerOut.success === true
      && sellerOut.data.seller.username === 'seller'
      && sellerOut.data.seller.rating === 4.9
      && sellerOut.data.seller.description === 'Bio',
    'fiverr.get_seller_profile maps seller profile fields');

  const inbox = makeCtx({
    '/inbox/contacts': [{
      username: 'seller',
      displayName: 'Seller Studio',
      userId: 7,
      conversationId: 'c1',
      unreadCount: 2,
      excerpt: 'Latest',
      recentMessageDate: 1782864000000,
      online: true,
      archived: false,
      starred: true
    }],
    '/inbox/contacts/seller': {
      username: 'seller',
      displayName: 'Seller Studio',
      conversationId: 'c1',
      unreadCount: 1,
      lastPage: true,
      messages: [{ id: 'm1', sender: 'seller', recipient: 'buyer_user', body: '<p>Hello</p>', createdAt: 1782864000000, type: 'text', attachments: [{}] }]
    }
  });
  const listOut = await handlers['fiverr.list_conversations'].handle({}, inbox.ctx);
  const conversationOut = await handlers['fiverr.get_conversation'].handle({ username: 'seller' }, inbox.ctx);
  check(inbox.calls[0].spec.url === ORIGIN + '/inbox/contacts'
      && inbox.calls[0].spec.headers['X-Requested-With'] === 'XMLHttpRequest'
      && inbox.calls[1].spec.url === ORIGIN + '/inbox/contacts/seller',
    'Fiverr inbox reads use same-origin JSON endpoints');
  check(listOut && listOut.success === true
      && listOut.data.conversations[0].conversation_id === 'c1'
      && conversationOut && conversationOut.success === true
      && conversationOut.data.conversation.messages[0].body === 'Hello'
      && conversationOut.data.conversation.messages[0].attachment_count === 1,
    'Fiverr inbox reads map conversation summaries and messages');

  const page = makeCtx({ '/': homeHtml() });
  const contextOut = await handlers['fiverr.get_current_page_context'].handle({}, page.ctx);
  const draftOut = await handlers['fiverr.draft_message'].handle({
    recipient_username: '/seller',
    body: '  Hello there  '
  }, page.ctx);
  check(page.calls.length === 2
      && page.calls.every((call) => call.spec.url === ORIGIN + '/'),
    'Fiverr context and draft reads use the first-party home page context');
  check(contextOut && contextOut.success === true
      && contextOut.data.username === 'buyer_user'
      && contextOut.data.user_id === 42
      && contextOut.data.current_url === ORIGIN + '/fixture',
    'fiverr.get_current_page_context maps account and tab context');
  check(draftOut && draftOut.success === true
      && draftOut.data.from === 'buyer_user'
      && draftOut.data.recipient_username === 'seller'
      && draftOut.data.char_count === 11
      && draftOut.data.ready_to_send === true,
    'fiverr.draft_message validates and previews without sending');

  const invalid = makeCtx({});
  const invalidOut = await handlers['fiverr.search_gigs'].handle({ query: '   ' }, invalid.ctx);
  check(invalid.calls.length === 0
      && invalidOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && invalidOut.reason === 'fiverr-invalid-query',
    'fiverr.search_gigs fails closed before execution on invalid query');

  const guardedCalls = [];
  const guardedCtx = { async executeBoundSpec() { guardedCalls.push('executeBoundSpec'); } };
  const sendOut = await handlers['fiverr.send_message'].handle({ recipient_username: 'seller', body: 'Hello' }, guardedCtx);
  check(sendOut && sendOut.success === false
      && sendOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && sendOut.errorCode === sendOut.code
      && sendOut.error === sendOut.code
      && sendOut.fellBackToDom === true
      && sendOut.reason === 'unverified-fiverr-send-message-mutation',
    'fiverr.send_message returns a typed guarded fail-closed result');
  check(guardedCalls.length === 0,
    'fiverr.send_message never calls executeBoundSpec without live mutation evidence');

  console.log(`Fiverr handler checks: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
