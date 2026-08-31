const assert = require('assert');
const path = require('path');

const {
  createLegacyHtmlRedirectHandler,
  resolveLegacyHtmlRedirectTarget,
} = require(path.join(
  __dirname,
  '..',
  'showcase',
  'server',
  'src',
  'middleware',
  'legacy-html-redirects'
));

const REDIRECTS = {
  '/index.html': '/',
  '/about.html': '/about',
  '/dashboard.html': '/dashboard',
  '/privacy.html': '/privacy',
  '/support.html': '/support',
};

const EXPECTED_BY_LOCALE = {
  es: ['/es', '/es/about', '/es/dashboard', '/es/privacy', '/es/support'],
  de: ['/de', '/de/about', '/de/dashboard', '/de/privacy', '/de/support'],
  ja: ['/ja', '/ja/about', '/ja/dashboard', '/ja/privacy', '/ja/support'],
  'zh-CN': ['/zh-CN', '/zh-CN/about', '/zh-CN/dashboard', '/zh-CN/privacy', '/zh-CN/support'],
  'zh-TW': ['/zh-TW', '/zh-TW/about', '/zh-TW/dashboard', '/zh-TW/privacy', '/zh-TW/support'],
};

const targets = Object.values(REDIRECTS);
for (const [locale, expectedTargets] of Object.entries(EXPECTED_BY_LOCALE)) {
  assert.deepStrictEqual(
    targets.map((target) => resolveLegacyHtmlRedirectTarget(target, `fsb-locale=${locale}`)),
    expectedTargets,
    `${locale} cookie prefixes every legacy redirect with its canonical locale subpath`
  );
}

for (const cookie of [
  undefined,
  '',
  'fsb-locale=en',
  'fsb-locale=fr',
  'fsb-locale=//evil.example',
  'fsb-locale=%2F%2Fevil.example',
  'fsb-locale=zh-CN%0d%0aLocation://evil.example',
]) {
  assert.deepStrictEqual(
    targets.map((target) => resolveLegacyHtmlRedirectTarget(target, cookie)),
    targets,
    `missing, English, unsupported, or injected cookie stays on the fixed English target: ${cookie}`
  );
}

assert.throws(
  () => resolveLegacyHtmlRedirectTarget('//evil.example', 'fsb-locale=ja'),
  /internal absolute path/,
  'redirect configuration cannot introduce an external target'
);

const handler = createLegacyHtmlRedirectHandler(REDIRECTS);
function invokeHandler(request) {
  let redirectResult = null;
  let nextCalled = false;
  const headers = {};

  handler(request, {
    set(name, value) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    vary(name) {
      headers.vary = headers.vary ? `${headers.vary}, ${name}` : name;
      return this;
    },
    redirect(status, location) {
      redirectResult = { status, location };
      return this;
    },
  }, () => { nextCalled = true; });

  return { redirectResult, nextCalled, headers };
}

const localizedRedirect = invokeHandler({
  path: '/dashboard.html',
  headers: { cookie: 'session=abc; fsb-locale=zh-TW; theme=dark' },
});
assert.deepStrictEqual(
  localizedRedirect.redirectResult,
  { status: 302, location: '/zh-TW/dashboard' },
  'handler uses a temporary redirect while applying a validated locale cookie'
);
assert.strictEqual(
  localizedRedirect.headers['cache-control'],
  'private, no-store',
  'locale-dependent redirects cannot be cached by browsers or intermediaries'
);
assert.strictEqual(
  localizedRedirect.headers.vary,
  'Cookie',
  'locale-dependent redirects declare that the response varies by cookie'
);
assert.strictEqual(localizedRedirect.nextCalled, false, 'known legacy path does not fall through');

const defaultLocaleRedirect = invokeHandler({
  path: '/dashboard.html',
  headers: { cookie: 'fsb-locale=en' },
});
assert.deepStrictEqual(
  defaultLocaleRedirect.redirectResult,
  { status: 302, location: '/dashboard' },
  'the same legacy URL follows a changed locale cookie without a permanent redirect'
);

const unknownRedirect = invokeHandler({
  path: '/not-legacy.html',
  headers: { cookie: 'fsb-locale=de' },
});
assert.strictEqual(unknownRedirect.redirectResult, null, 'unknown path is not redirected');
assert.strictEqual(unknownRedirect.nextCalled, true, 'unknown path falls through');
assert.deepStrictEqual(unknownRedirect.headers, {}, 'unknown path does not set redirect cache headers');

console.log('server legacy HTML redirect tests passed');
