// Phase 267 / ROUTE-03 -- Tests for Accept-Language middleware.
// Zero deps: pure Node assert + in-process mock req/res. Mirrors style of other
// tests/*.test.js files in this repo.

const assert = require('assert');
const path = require('path');

const { pickBestLocale, createAcceptLanguageMiddleware, parseCookieHeader } = require(
  path.join(__dirname, '..', 'showcase', 'server', 'src', 'middleware', 'accept-language')
);

const SUPPORTED = ['es', 'de', 'ja', 'zh-CN', 'zh-TW'];
let passed = 0;
let failed = 0;

function check(label, expected, actual) {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  if (ok) {
    passed += 1;
    console.log(`  PASS: ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL: ${label}  expected=${JSON.stringify(expected)}  got=${JSON.stringify(actual)}`);
  }
}

console.log('--- pickBestLocale ---');
check('ja,en;q=0.8 -> ja', 'ja', pickBestLocale('ja,en;q=0.8', SUPPORTED));
check('zh-Hant-TW,en;q=0.8 -> zh-TW', 'zh-TW', pickBestLocale('zh-Hant-TW,en;q=0.8', SUPPORTED));
check('zh-Hans-CN -> zh-CN', 'zh-CN', pickBestLocale('zh-Hans-CN', SUPPORTED));
check('zh-Hant -> zh-TW', 'zh-TW', pickBestLocale('zh-Hant', SUPPORTED));
check('zh-Hans -> zh-CN', 'zh-CN', pickBestLocale('zh-Hans', SUPPORTED));
check('zh -> zh-CN', 'zh-CN', pickBestLocale('zh', SUPPORTED));
check('zh-HK -> zh-TW', 'zh-TW', pickBestLocale('zh-HK', SUPPORTED));
check('zh-MO -> zh-TW', 'zh-TW', pickBestLocale('zh-MO', SUPPORTED));
check('zh-SG -> zh-CN', 'zh-CN', pickBestLocale('zh-SG', SUPPORTED));
check('es-MX,en;q=0.9 -> es', 'es', pickBestLocale('es-MX,en;q=0.9', SUPPORTED));
check('de-AT;q=0.9,en;q=0.5 -> de', 'de', pickBestLocale('de-AT;q=0.9,en;q=0.5', SUPPORTED));
check('en-US,en;q=0.9 -> null (EN not in SUPPORTED list -> falls through; let middleware decide)', null, pickBestLocale('en-US,en;q=0.9', SUPPORTED));
check('ko,fr -> null', null, pickBestLocale('ko,fr', SUPPORTED));
check('empty string -> null', null, pickBestLocale('', SUPPORTED));
check('null -> null', null, pickBestLocale(null, SUPPORTED));
check('undefined -> null', null, pickBestLocale(undefined, SUPPORTED));
check(';;; -> null (malformed tolerated)', null, pickBestLocale(';;;', SUPPORTED));
check('en;q=abc -> null (malformed q tolerated)', null, pickBestLocale('en;q=abc', SUPPORTED));
check('q=0 entry skipped: ja;q=0,de;q=0.5 -> de', 'de', pickBestLocale('ja;q=0,de;q=0.5', SUPPORTED));
check('quality ordering: en;q=0.5,ja;q=0.9 -> ja', 'ja', pickBestLocale('en;q=0.5,ja;q=0.9', SUPPORTED));
check('1000-char gibberish does not crash', null, pickBestLocale('x'.repeat(1000), SUPPORTED));
check('case-insensitive: JA -> ja', 'ja', pickBestLocale('JA', SUPPORTED));
check('with whitespace:  ja , en ;q=0.5 -> ja', 'ja', pickBestLocale(' ja , en ;q=0.5', SUPPORTED));

console.log('--- parseCookieHeader ---');
check('basic: fsb-locale=de -> de', 'de', parseCookieHeader('fsb-locale=de', 'fsb-locale'));
check('multi: a=1; fsb-locale=ja; b=2 -> ja', 'ja', parseCookieHeader('a=1; fsb-locale=ja; b=2', 'fsb-locale'));
check('absent -> null', null, parseCookieHeader('a=1; b=2', 'fsb-locale'));
check('null -> null', null, parseCookieHeader(null, 'fsb-locale'));
check('empty -> null', null, parseCookieHeader('', 'fsb-locale'));
check('whitespace-tolerant: fsb-locale = ja -> ja', 'ja', parseCookieHeader(' fsb-locale = ja ', 'fsb-locale'));

console.log('--- middleware (mocked req/res) ---');
const mw = createAcceptLanguageMiddleware({ supported: SUPPORTED, defaultLocale: 'en', cookieName: 'fsb-locale' });

function mockReqRes(method, urlPath, headers, requestUrl) {
  let nextCalled = false;
  let redirectArgs = null;
  const req = { method, path: urlPath, headers: headers || {} };
  if (requestUrl) {
    if (requestUrl.originalUrl) req.originalUrl = requestUrl.originalUrl;
    if (requestUrl.url) req.url = requestUrl.url;
  }
  const res = {
    redirect(status, location) { redirectArgs = { status, location }; },
  };
  const next = () => { nextCalled = true; };
  mw(req, res, next);
  return { nextCalled, redirectArgs };
}

check(
  'GET / + Accept-Language: ja -> 302 /ja/',
  { nextCalled: false, redirectArgs: { status: 302, location: '/ja/' } },
  mockReqRes('GET', '/', { 'accept-language': 'ja,en;q=0.8' })
);

check(
  'GET / + Accept-Language ja + Cookie fsb-locale=de -> 302 /de/ (cookie wins via redirect)',
  { nextCalled: false, redirectArgs: { status: 302, location: '/de/' } },
  mockReqRes('GET', '/', { 'accept-language': 'ja,en;q=0.8', 'cookie': 'fsb-locale=de' })
);

check(
  'GET / + Cookie fsb-locale=en -> next() (cookie wins, even for default)',
  { nextCalled: true, redirectArgs: null },
  mockReqRes('GET', '/', { 'accept-language': 'ja', 'cookie': 'fsb-locale=en' })
);

check(
  'GET / + Cookie fsb-locale=es (no Accept-Language) -> 302 /es/ (ROUTE-01)',
  { nextCalled: false, redirectArgs: { status: 302, location: '/es/' } },
  mockReqRes('GET', '/', { 'cookie': 'fsb-locale=es' })
);

check(
  'GET /?utm_source=ad&ref=abc + Cookie fsb-locale=de -> 302 /de/?utm_source=ad&ref=abc',
  { nextCalled: false, redirectArgs: { status: 302, location: '/de/?utm_source=ad&ref=abc' } },
  mockReqRes('GET', '/', { 'cookie': 'fsb-locale=de' }, { originalUrl: '/?utm_source=ad&ref=abc' })
);

check(
  'GET /?utm_source=ad + Cookie fsb-locale=ja -> 302 /ja/?utm_source=ad (url fallback)',
  { nextCalled: false, redirectArgs: { status: 302, location: '/ja/?utm_source=ad' } },
  mockReqRes('GET', '/', { 'cookie': 'fsb-locale=ja' }, { url: '/?utm_source=ad' })
);

check(
  'GET / + no Accept-Language -> next() (bot-safe)',
  { nextCalled: true, redirectArgs: null },
  mockReqRes('GET', '/', {})
);

check(
  'GET /about + Accept-Language ja -> next() (only / is gated)',
  { nextCalled: true, redirectArgs: null },
  mockReqRes('GET', '/about', { 'accept-language': 'ja' })
);

check(
  'POST / + Accept-Language ja -> next() (GET/HEAD only)',
  { nextCalled: true, redirectArgs: null },
  mockReqRes('POST', '/', { 'accept-language': 'ja' })
);

check(
  'HEAD / + Accept-Language ja -> 302 /ja/ (HEAD treated like GET)',
  { nextCalled: false, redirectArgs: { status: 302, location: '/ja/' } },
  mockReqRes('HEAD', '/', { 'accept-language': 'ja' })
);

check(
  'GET / + Accept-Language en-US -> next() (best match is default)',
  { nextCalled: true, redirectArgs: null },
  mockReqRes('GET', '/', { 'accept-language': 'en-US,en;q=0.9' })
);

check(
  'GET / + Accept-Language ko,fr -> next() (unsupported)',
  { nextCalled: true, redirectArgs: null },
  mockReqRes('GET', '/', { 'accept-language': 'ko,fr' })
);

check(
  'GET / + malformed Accept-Language -> next() (no crash)',
  { nextCalled: true, redirectArgs: null },
  mockReqRes('GET', '/', { 'accept-language': ';;;' })
);

check(
  'GET / + Accept-Language zh-Hant-TW -> 302 /zh-TW/',
  { nextCalled: false, redirectArgs: { status: 302, location: '/zh-TW/' } },
  mockReqRes('GET', '/', { 'accept-language': 'zh-Hant-TW,en;q=0.8' })
);

check(
  'GET / + Accept-Language es-MX -> 302 /es/',
  { nextCalled: false, redirectArgs: { status: 302, location: '/es/' } },
  mockReqRes('GET', '/', { 'accept-language': 'es-MX,en;q=0.9' })
);

check(
  'GET /es -> next() (deep link untouched)',
  { nextCalled: true, redirectArgs: null },
  mockReqRes('GET', '/es', { 'accept-language': 'ja' })
);

console.log(`\n=== Accept-Language results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
