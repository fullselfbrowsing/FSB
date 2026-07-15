'use strict';

const { parseCookieHeader } = require('./accept-language');
const {
  SOURCE_LOCALE,
  LOCALE_SUBPATHS,
  isValidLocale,
} = require('../utils/locale-constants');

function isSafeInternalPath(value) {
  return typeof value === 'string'
    && value.startsWith('/')
    && !value.startsWith('//')
    && !value.includes('\\')
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function resolveLegacyHtmlRedirectTarget(baseTarget, rawCookieHeader, cookieName = 'fsb-locale') {
  if (!isSafeInternalPath(baseTarget)) {
    throw new TypeError('Legacy HTML redirects must target an internal absolute path');
  }

  const locale = parseCookieHeader(rawCookieHeader, cookieName);
  if (!isValidLocale(locale) || locale === SOURCE_LOCALE) {
    return baseTarget;
  }

  const localeSubpath = LOCALE_SUBPATHS[locale];
  if (typeof localeSubpath !== 'string' || !/^[A-Za-z0-9-]+$/.test(localeSubpath)) {
    return baseTarget;
  }

  return baseTarget === '/'
    ? `/${localeSubpath}`
    : `/${localeSubpath}${baseTarget}`;
}

function createLegacyHtmlRedirectHandler(redirects, options = {}) {
  const cookieName = options.cookieName || 'fsb-locale';
  const redirectEntries = Object.entries(redirects || {});

  for (const [requestPath, targetPath] of redirectEntries) {
    if (!isSafeInternalPath(requestPath) || !isSafeInternalPath(targetPath)) {
      throw new TypeError('Legacy HTML redirect paths must be internal absolute paths');
    }
  }

  const redirectMap = new Map(redirectEntries);
  return function legacyHtmlRedirect(req, res, next) {
    const baseTarget = redirectMap.get(req.path);
    if (!baseTarget) {
      return typeof next === 'function' ? next() : undefined;
    }

    const target = resolveLegacyHtmlRedirectTarget(
      baseTarget,
      req.headers && req.headers.cookie,
      cookieName
    );
    res.set('Cache-Control', 'private, no-store');
    res.vary('Cookie');
    return res.redirect(302, target);
  };
}

module.exports = {
  createLegacyHtmlRedirectHandler,
  resolveLegacyHtmlRedirectTarget,
};
