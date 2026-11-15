'use strict';

const path = require('path');

// Angular names every bundle it emits after its content: main-EPPKJTE3.js,
// chunk-2OYSSQCF.js, styles-OKWJJ6P2.css. The hash also covers the translation
// files, so a file with one of these names never changes and can be kept forever.
const HASHED_BUNDLE = /^(?:main|polyfills|chunk|styles|scripts|worker)-[A-Z0-9]{8}\.(?:js|css)$/;
// Fonts and images referenced from stylesheets land in media/ with the same hash.
const HASHED_MEDIA = /-[A-Z0-9]{8}\.[a-z0-9]+$/;
const IMAGE_OR_FONT = /\.(?:png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf)$/;

const FOREVER = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache, must-revalidate';
const ONE_HOUR = 'public, max-age=3600';
const ONE_WEEK = 'public, max-age=604800, stale-while-revalidate=2592000';

/**
 * Decide the Cache-Control header for a file under the showcase build output.
 * Returns null where express.static's own default should stand.
 *
 * @param {{ staticRoot: string, localeSubpaths: string[] }} options
 * @returns {(filePath: string) => string | null}
 */
function createStaticCachePolicy(options) {
  const staticRoot = path.resolve(options.staticRoot);
  const locales = new Set(options.localeSubpaths || []);

  return function cacheControlFor(filePath) {
    const parts = path.relative(staticRoot, path.resolve(filePath)).split(path.sep);
    if (parts[0] === '..' || path.isAbsolute(parts[0])) return null;
    // Each locale is a copy of the whole build in its own directory.
    if (parts.length > 1 && locales.has(parts[0])) parts.shift();
    const name = parts[parts.length - 1];

    // Crawler files first, so a stray foo.html.txt never picks up another rule.
    if (name.endsWith('.txt') || name.endsWith('.xml')) return ONE_HOUR;
    if (name.endsWith('.html')) return REVALIDATE;
    if (parts.length === 1 && HASHED_BUNDLE.test(name)) return FOREVER;
    if (parts.length === 2 && parts[0] === 'media' && HASHED_MEDIA.test(name)) return FOREVER;
    // Scripts and styles under a fixed name (assets/*.js) must take effect at once.
    if (name.endsWith('.js') || name.endsWith('.css')) return REVALIDATE;
    if (IMAGE_OR_FONT.test(name)) return ONE_WEEK;
    return null;
  };
}

module.exports = { createStaticCachePolicy, FOREVER, REVALIDATE, ONE_HOUR, ONE_WEEK };
