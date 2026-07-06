#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const HANDLER_PATH = path.join(ROOT, 'catalog', 'handlers', 'linkedin.js');
const EXT_HANDLER_PATH = path.join(ROOT, 'extension', 'catalog', 'handlers', 'linkedin.js');
const FETCH_PATH = path.join(ROOT, 'extension', 'utils', 'capability-fetch.js');
const CATALOG_PATH = path.join(ROOT, 'extension', 'utils', 'capability-catalog.js');
const INDEX_PATH = path.join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js');
const REPORT_PATH = path.join(ROOT, 'scripts', 'report-t1-readiness.mjs');
const EVIDENCE_PATH = path.join(ROOT, 'catalog', 'write-activation-evidence.json');
const DESCRIPTORS_DIR = path.join(ROOT, 'catalog', 'descriptors');

const ORIGIN = 'https://www.linkedin.com';
const READ_SLUGS = [
  'linkedin.get_current_user',
  'linkedin.get_user_profile',
  'linkedin.list_conversations',
  'linkedin.get_conversation_messages',
  'linkedin.get_mailbox_counts',
];
const GUARDED_SLUGS = ['linkedin.send_message'];
const ALL_SLUGS = READ_SLUGS.concat(GUARDED_SLUGS);

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

function freshRequire(filePath) {
  delete require.cache[require.resolve(filePath)];
  return require(filePath);
}

function descriptorFor(slug) {
  return JSON.parse(fs.readFileSync(path.join(
    DESCRIPTORS_DIR,
    'opentabs__' + slug.replace('.', '__') + '.json'
  ), 'utf8'));
}

function bySlug(rows, slug) {
  return rows.find((row) => row && row.slug === slug) || null;
}

function vectorImage(root, segment) {
  return {
    rootUrl: root,
    artifacts: [
      { width: 100, fileIdentifyingUrlPathSegment: 'small-' + segment },
      { width: 400, fileIdentifyingUrlPathSegment: 'large-' + segment },
    ],
  };
}

function meFixture() {
  return {
    plainId: 123,
    miniProfile: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      occupation: 'Computing pioneer',
      publicIdentifier: 'ada-lovelace',
      dashEntityUrn: 'urn:li:fsd_profile:ACoAda',
      picture: {
        'com.linkedin.common.VectorImage': vectorImage('https://media.licdn.com/', 'ada.jpg'),
      },
    },
    premiumSubscriber: true,
  };
}

function makeCtx(resolver) {
  const calls = [];
  return {
    calls,
    ctx: {
      tabId: 318,
      async executeBoundSpec(spec, tabId) {
        calls.push({ spec, tabId });
        const value = resolver(spec, calls.length);
        if (value && value.__raw) return value.__raw;
        return { success: true, status: 200, data: value };
      },
    },
  };
}

function assertLinkedinSpec(call, msg) {
  const spec = call && call.spec;
  check(!!spec
      && call.tabId === 318
      && spec.method === 'GET'
      && spec.origin === ORIGIN
      && spec.authStrategy === 'same-origin-cookie'
      && spec.csrfSource
      && spec.csrfSource.from === 'cookie'
      && spec.csrfSource.selector === 'JSESSIONID'
      && spec.csrfSource.header === 'csrf-token'
      && spec.csrfSource.stripQuotes === true,
    msg);
}

async function testStaticShape(handlers) {
  check(fs.existsSync(HANDLER_PATH), 'catalog LinkedIn handler exists');
  check(fs.existsSync(EXT_HANDLER_PATH), 'extension LinkedIn handler exists');

  const src = fs.readFileSync(HANDLER_PATH, 'utf8');
  const extSrc = fs.existsSync(EXT_HANDLER_PATH) ? fs.readFileSync(EXT_HANDLER_PATH, 'utf8') : '';
  check(src === extSrc, 'extension LinkedIn handler mirror matches catalog handler');
  check(Object.keys(handlers).sort().join(',') === ALL_SLUGS.slice().sort().join(','),
    'LinkedIn handler exports all six descriptor slugs');
  check(!/\bfetch\s*\(/.test(src), 'handler does not issue direct network calls');
  check(!/\bchrome\.(tabs|scripting|cookies|webRequest)\b/.test(src),
    'handler does not call privileged chrome APIs');
  check(!/\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(src),
    'handler does not construct XHR requests');
  check(!/\beval\s*\(/.test(src), 'handler does not use dynamic eval');

  const fetchSrc = fs.readFileSync(FETCH_PATH, 'utf8');
  check(/stripQuotes\s*===\s*true/.test(fetchSrc) && /replace\(/.test(fetchSrc),
    'capability fetcher supports quote-stripping cookie CSRF tokens');

  for (const slug of ALL_SLUGS) {
    const entry = handlers[slug];
    const desc = descriptorFor(slug);
    check(entry && entry.tier === 'T1a', slug + ' is T1a');
    check(entry && entry.origin === ORIGIN, slug + ' pins www.linkedin.com origin');
    check(entry && entry.params && entry.params.additionalProperties === false,
      slug + ' has a closed params schema');
    check(desc.backing === 'handler', slug + ' descriptor is handler-backed');
    check(entry && entry.sideEffectClass === desc.sideEffectClass,
      slug + ' sideEffectClass matches descriptor');
  }
}

async function testFetcherStripQuotes() {
  const fetchMod = freshRequire(FETCH_PATH);
  const priorDocument = global.document;
  const priorFetch = global.fetch;
  let captured = null;

  try {
    global.document = {
      cookie: 'JSESSIONID=%22ajax%3A123%22; li_at=redacted',
      querySelector() { return null; },
    };
    global.fetch = async function fetchStub(url, init) {
      captured = { url, init };
      return {
        ok: true,
        status: 200,
        url,
        type: 'basic',
        async text() { return '{"ok":true}'; },
      };
    };

    const out = await fetchMod.capabilityFetchInPage({
      url: ORIGIN + '/voyager/api/me',
      method: 'GET',
      headers: { Accept: 'application/json' },
      authStrategy: 'same-origin-cookie',
      csrfSource: {
        from: 'cookie',
        selector: 'JSESSIONID',
        header: 'csrf-token',
        stripQuotes: true,
      },
    });

    check(out && out.ok === true
        && captured
        && captured.init
        && captured.init.headers
        && captured.init.headers['csrf-token'] === 'ajax:123',
      'capabilityFetchInPage strips LinkedIn JSESSIONID quotes before setting csrf-token');
  } finally {
    if (priorDocument === undefined) delete global.document;
    else global.document = priorDocument;
    if (priorFetch === undefined) delete global.fetch;
    else global.fetch = priorFetch;
  }
}

async function testReads(handlers) {
  {
    const { ctx, calls } = makeCtx(() => meFixture());
    const out = await handlers['linkedin.get_current_user'].handle({}, ctx);
    assertLinkedinSpec(calls[0], 'get_current_user builds a same-origin Voyager spec');
    check(calls.length === 1
        && calls[0].spec.url === ORIGIN + '/voyager/api/me'
        && calls[0].spec.headers.Accept === 'application/json',
      'get_current_user targets /voyager/api/me');
    check(out && out.success === true
        && out.data.user.plain_id === 123
        && out.data.user.first_name === 'Ada'
        && out.data.user.profile_urn === 'urn:li:fsd_profile:ACoAda'
        && out.data.user.profile_picture_url === 'https://media.licdn.com/large-ada.jpg'
        && out.data.user.is_premium === true,
      'get_current_user maps LinkedIn miniProfile data');
  }

  {
    const profile = {
      elements: [{
        firstName: 'Grace',
        lastName: 'Hopper',
        headline: 'Computer scientist',
        publicIdentifier: 'grace-hopper',
        entityUrn: 'urn:li:fsd_profile:ACoGrace',
        profilePicture: { displayImageReference: { vectorImage: vectorImage('https://media.licdn.com/', 'grace.jpg') } },
        geoLocation: { geo: {
          defaultLocalizedNameWithoutCountryName: 'Arlington',
          country: { defaultLocalizedName: 'United States' },
        } },
        premium: true,
        influencer: true,
        creator: true,
      }],
    };
    const { ctx, calls } = makeCtx(() => profile);
    const out = await handlers['linkedin.get_user_profile'].handle({ public_identifier: 'grace-hopper' }, ctx);
    const parsed = new URL(calls[0].spec.url);
    assertLinkedinSpec(calls[0], 'get_user_profile builds a same-origin Voyager spec');
    check(parsed.pathname === '/voyager/api/identity/dash/profiles'
        && parsed.searchParams.get('q') === 'memberIdentity'
        && parsed.searchParams.get('memberIdentity') === 'grace-hopper'
        && parsed.searchParams.get('decorationId') === 'com.linkedin.voyager.dash.deco.identity.profile.WebTopCardCore-18',
      'get_user_profile targets the decorated Dash profile endpoint');
    check(out && out.success === true
        && out.data.profile.first_name === 'Grace'
        && out.data.profile.location === 'Arlington'
        && out.data.profile.country === 'United States'
        && out.data.profile.profile_picture_url === 'https://media.licdn.com/large-grace.jpg',
      'get_user_profile maps profile card data');
  }

  {
    const conversations = {
      data: {
        messengerConversationsBySyncToken: {
          elements: [{
            entityUrn: 'urn:li:msg_conversation:(urn:li:fsd_profile:ACoAda,1)',
            conversationTitle: { text: '' },
            lastMessage: { body: { text: 'Latest note' }, deliveredAt: 1782864000000 },
            read: false,
            notificationStatus: 'NOTIFIED',
            conversationParticipants: [{
              hostIdentityUrn: 'urn:li:fsd_profile:ACoGrace',
              participantType: {
                member: {
                  firstName: { text: 'Grace' },
                  lastName: { text: 'Hopper' },
                  profilePicture: vectorImage('https://media.licdn.com/', 'grace.jpg'),
                },
              },
            }],
          }],
        },
      },
    };
    const { ctx, calls } = makeCtx((_spec, index) => index === 1 ? meFixture() : conversations);
    const out = await handlers['linkedin.list_conversations'].handle({}, ctx);
    const graph = new URL(calls[1].spec.url);
    assertLinkedinSpec(calls[0], 'list_conversations first loads current profile urn');
    assertLinkedinSpec(calls[1], 'list_conversations builds a same-origin messaging GraphQL spec');
    check(calls.length === 2
        && graph.pathname === '/voyager/api/voyagerMessagingGraphQL/graphql'
        && graph.searchParams.get('queryId') === 'messengerConversations.0d5e6781bbee71c3e51c8843c6519f48'
        && graph.searchParams.get('variables') === '(mailboxUrn:urn%3Ali%3Afsd_profile%3AACoAda)'
        && calls[1].spec.headers.Accept === 'application/graphql',
      'list_conversations targets the persisted conversations query');
    check(out && out.success === true
        && out.data.conversations[0].title === 'Grace Hopper'
        && out.data.conversations[0].last_message_text === 'Latest note'
        && out.data.conversations[0].is_read === false
        && out.data.conversations[0].participants[0].profile_urn === 'urn:li:fsd_profile:ACoGrace',
      'list_conversations maps conversation summary data');
  }

  {
    const messages = {
      data: {
        messengerMessagesBySyncToken: {
          elements: [{
            entityUrn: 'urn:li:msg_message:1',
            body: { text: 'Hello from Ada' },
            sender: {
              hostIdentityUrn: 'urn:li:fsd_profile:ACoAda',
              participantType: { member: {
                firstName: { text: 'Ada' },
                lastName: { text: 'Lovelace' },
              } },
            },
            deliveredAt: 1782864000123,
            subject: { text: 'Intro' },
          }],
        },
      },
    };
    const conversationUrn = 'urn:li:msg_conversation:(urn:li:fsd_profile:ACoAda,2-test)';
    const { ctx, calls } = makeCtx(() => messages);
    const out = await handlers['linkedin.get_conversation_messages'].handle({ conversation_urn: conversationUrn }, ctx);
    const graph = new URL(calls[0].spec.url);
    assertLinkedinSpec(calls[0], 'get_conversation_messages builds a same-origin messaging GraphQL spec');
    check(graph.pathname === '/voyager/api/voyagerMessagingGraphQL/graphql'
        && graph.searchParams.get('queryId') === 'messengerMessages.5846eeb71c981f11e0134cb6626cc314'
        && graph.searchParams.get('variables') === '(conversationUrn:urn%3Ali%3Amsg_conversation%3A%28urn%3Ali%3Afsd_profile%3AACoAda%2C2-test%29)',
      'get_conversation_messages URL-encodes conversation URN variables');
    check(out && out.success === true
        && out.data.messages[0].message_urn === 'urn:li:msg_message:1'
        && out.data.messages[0].sender_name === 'Ada Lovelace'
        && out.data.messages[0].sender_profile_urn === 'urn:li:fsd_profile:ACoAda'
        && out.data.messages[0].subject === 'Intro',
      'get_conversation_messages maps message data');
  }

  {
    const counts = {
      data: {
        messengerMailboxCountsByMailbox: {
          elements: [
            { category: 'INBOX', unreadConversationCount: 3 },
            { category: 'MESSAGE_REQUESTS', unreadConversationCount: 1 },
          ],
        },
      },
    };
    const { ctx, calls } = makeCtx((_spec, index) => index === 1 ? meFixture() : counts);
    const out = await handlers['linkedin.get_mailbox_counts'].handle({}, ctx);
    const graph = new URL(calls[1].spec.url);
    assertLinkedinSpec(calls[1], 'get_mailbox_counts builds a same-origin messaging GraphQL spec');
    check(calls.length === 2
        && graph.searchParams.get('queryId') === 'messengerMailboxCounts.fc528a5a81a76dff212a4a3d2d48e84b'
        && graph.searchParams.get('variables') === '(mailboxUrn:urn%3Ali%3Afsd_profile%3AACoAda)',
      'get_mailbox_counts targets the persisted mailbox counts query');
    check(out && out.success === true
        && out.data.counts[0].category === 'INBOX'
        && out.data.counts[0].unread_count === 3
        && out.data.counts[1].category === 'MESSAGE_REQUESTS',
      'get_mailbox_counts maps count rows');
  }
}

async function testFailClosedPaths(handlers) {
  const noPrimitive = await handlers['linkedin.get_current_user'].handle({}, {});
  check(noPrimitive && noPrimitive.success === false
      && noPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && noPrimitive.errorCode === noPrimitive.code
      && noPrimitive.error === noPrimitive.code
      && noPrimitive.reason === 'linkedin-execute-bound-spec-unavailable'
      && noPrimitive.fellBackToDom === true,
    'LinkedIn reads fail closed when executeBoundSpec is unavailable');

  const calls = [];
  const guarded = await handlers['linkedin.send_message'].handle({
    conversation_urn: 'urn:li:msg_conversation:(urn:li:fsd_profile:ACoAda,1)',
    text: 'Hello',
  }, {
    async executeBoundSpec() { calls.push('spec'); },
    async executeBoundPageRead() { calls.push('page'); },
  });
  check(calls.length === 0
      && guarded && guarded.success === false
      && guarded.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && guarded.errorCode === guarded.code
      && guarded.error === guarded.code
      && guarded.reason === 'unverified-linkedin-send-message-mutation'
      && guarded.fellBackToDom === true,
    'linkedin.send_message is guarded fail-closed and calls no executor');
}

async function testReadiness() {
  delete global.FsbRecipeIndex;
  delete global.FsbCapabilityCatalog;
  delete global.FsbHandlerLinkedin;

  const catalog = freshRequire(INDEX_PATH);
  global.FsbRecipeIndex = catalog;
  const Catalog = freshRequire(CATALOG_PATH);
  freshRequire(EXT_HANDLER_PATH);
  if (typeof Catalog.seedHeadHandlers === 'function') Catalog.seedHeadHandlers();

  const readResolved = Catalog.resolve('linkedin.get_current_user', ORIGIN);
  const guardedResolved = Catalog.resolve('linkedin.send_message', ORIGIN);
  check(readResolved && readResolved.tier === 'T1a'
      && readResolved.handler && typeof readResolved.handler.handle === 'function',
    'resolver upgrades linkedin.get_current_user to T1a handler');
  check(guardedResolved && guardedResolved.tier === 'T1a'
      && guardedResolved.descriptor
      && guardedResolved.descriptor.sideEffectClass === 'write',
    'resolver upgrades linkedin.send_message while preserving write classification');

  const reportMod = await import(pathToFileURL(REPORT_PATH).href);
  const report = reportMod.reportReadiness(catalog);
  for (const slug of READ_SLUGS) {
    const row = bySlug(report.rows, slug);
    check(row && row.readiness === 't1-ready'
        && row.resolvedTier === 'T1a'
        && row.proof === 'handler',
      slug + ' reports t1-ready with handler proof');
  }
  for (const slug of GUARDED_SLUGS) {
    const row = bySlug(report.rows, slug);
    check(row && row.readiness === 't1-guarded-fail-closed'
        && row.resolvedTier === 'T1a'
        && row.proof === 'handler',
      slug + ' reports guarded fail-closed with handler proof');
  }

  const evidence = JSON.parse(fs.readFileSync(EVIDENCE_PATH, 'utf8'));
  const guardedSet = new Set((evidence.guardedWrites || []).map((row) => row.slug));
  check(guardedSet.has('linkedin.send_message'),
    'write activation evidence includes linkedin.send_message');
}

(async function run() {
  console.log('--- LinkedIn T1 readiness proof ---');

  const handlers = freshRequire(HANDLER_PATH);
  await testStaticShape(handlers);
  await testFetcherStripQuotes();
  await testReads(handlers);
  await testFailClosedPaths(handlers);
  await testReadiness();

  console.log('\nlinkedin-t1-ready: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: linkedin test threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
