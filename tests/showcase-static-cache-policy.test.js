'use strict';

const assert = require('assert');
const path = require('path');
const {
  createStaticCachePolicy,
  FOREVER,
  REVALIDATE,
  ONE_HOUR,
  ONE_WEEK,
} = require('../showcase/server/src/middleware/static-cache-policy');

const root = path.resolve('/srv/showcase/browser');
const policy = createStaticCachePolicy({ staticRoot: root, localeSubpaths: ['es', 'de', 'zh-CN'] });
const at = (...parts) => policy(path.join(root, ...parts));

// Content-hashed bundles, in the root build and in a locale's copy of it.
for (const name of ['main-EPPKJTE3.js', 'chunk-2OYSSQCF.js', 'polyfills-JG3DU74D.js', 'styles-OKWJJ6P2.css']) {
  assert.strictEqual(at(name), FOREVER, name);
  assert.strictEqual(at('es', name), FOREVER, 'es/' + name);
  assert.strictEqual(at('zh-CN', name), FOREVER, 'zh-CN/' + name);
}
assert.strictEqual(at('media', 'fa-solid-900-ABCD1234.woff2'), FOREVER);
assert.strictEqual(at('de', 'media', 'Phosphor-ABCD1234.woff2'), FOREVER);

// Anything that only looks hashed, or sits where a build never puts bundles, is not kept.
assert.strictEqual(at('chunk-2oyssqcf.js'), REVALIDATE, 'lower-case hash');
assert.strictEqual(at('chunk-2OYSSQC.js'), REVALIDATE, 'short hash');
assert.strictEqual(at('assets', 'chunk-2OYSSQCF.js'), REVALIDATE, 'bundle name under assets/');
assert.strictEqual(at('fr', 'main-EPPKJTE3.js'), REVALIDATE, 'directory that is not a locale');
assert.strictEqual(at('assets', 'knowledge-graph.js'), REVALIDATE);
assert.strictEqual(at('assets', 'media', 'x-ABCD1234.woff2'), ONE_WEEK, 'media/ outside the build root');

// Pages and the client shell are checked on every visit.
assert.strictEqual(at('index.html'), REVALIDATE);
assert.strictEqual(at('about', 'index.html'), REVALIDATE);
assert.strictEqual(at('es', 'index.csr.html'), REVALIDATE);

// Crawler files keep their hour, and win over every other rule.
assert.strictEqual(at('robots.txt'), ONE_HOUR);
assert.strictEqual(at('sitemap.xml'), ONE_HOUR);
assert.strictEqual(at('llms-full.txt'), ONE_HOUR);
assert.strictEqual(at('foo.html.txt'), ONE_HOUR);

// Images and fonts under a fixed name.
assert.strictEqual(at('assets', 'icon48.png'), ONE_WEEK);
assert.strictEqual(at('assets', 'providers', 'xai.png'), ONE_WEEK);
assert.strictEqual(at('favicon.ico'), ONE_WEEK);

// Everything else, and anything outside the build, is left to the server default.
assert.strictEqual(at('assets', 'data.json'), null);
assert.strictEqual(policy(path.resolve('/etc/passwd')), null);

console.log('showcase static cache policy: PASS');
