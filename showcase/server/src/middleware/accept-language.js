// Phase 267 / ROUTE-03 -- Accept-Language auto-detection middleware.
// Phase 56 / WARNING-02 -- cookie-directed redirect for returning visitors.
//
// On bare `GET /`, parse the browser's Accept-Language header, pick the best
// matching supported locale, and 302-redirect to its subpath. A valid
// non-default `fsb-locale` cookie wins by redirecting to that locale's
// subpath; the default-locale cookie (`en`) falls through to the EN root
// (never `/en/`, which 404s). Bots (no header) and EN-preferring browsers
// also fall through. Loop-safe: only `/` is gated (`req.path !== '/'` → next).
//
// Zero new dependencies -- inline cookie parse + Node stdlib only.

const ZH_HANS_TARGETS = new Set(['zh-cn', 'zh-sg', 'zh', 'zh-hans']);
const ZH_HANT_TARGETS = new Set(['zh-tw', 'zh-mo', 'zh-hk', 'zh-hant']);

function aliasTag(rawTag, supportedLower) {
  const lower = rawTag.toLowerCase();
  if (lower.startsWith('zh-hans') || ZH_HANS_TARGETS.has(lower)) {
    return supportedLower.has('zh-cn') ? 'zh-CN' : null;
  }
  if (lower.startsWith('zh-hant') || ZH_HANT_TARGETS.has(lower)) {
    return supportedLower.has('zh-tw') ? 'zh-TW' : null;
  }
  // zh-XX (HK, MO, TW already handled; CN, SG already handled). Catch other zh-* as Hant if explicitly Taiwan-leaning region tags exist.
  // Exact-case match against supported (case-insensitive) wins next.
  for (const code of supportedLower) {
    if (code === lower) return supportedLower.get(code);
  }
  // Primary subtag fallback: `es-MX` -> `es`.
  const primary = lower.split('-')[0];
  if (supportedLower.has(primary)) return supportedLower.get(primary);
  return null;
}

function pickBestLocale(headerValue, supported) {
  if (!headerValue || typeof headerValue !== 'string') return null;
  // Cap length defensively (T-267-04).
  if (headerValue.length > 1024) headerValue = headerValue.slice(0, 1024);

  // Build a case-insensitive map: lowercase -> canonical supported code.
  const supportedLower = new Map();
  for (const code of supported) supportedLower.set(code.toLowerCase(), code);

  const entries = [];
  const parts = headerValue.split(',');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;
    const [tagRaw, ...params] = part.split(';');
    const tag = tagRaw.trim();
    if (!tag) continue;
    let q = 1.0;
    for (const p of params) {
      const m = /^\s*q\s*=\s*([0-9]*\.?[0-9]+)\s*$/i.exec(p);
      if (m) {
        const parsed = parseFloat(m[1]);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) q = parsed;
      }
    }
    if (q === 0) continue;
    entries.push({ tag, q, order: i });
  }

  entries.sort((a, b) => (b.q - a.q) || (a.order - b.order));

  for (const { tag } of entries) {
    const resolved = aliasTag(tag, supportedLower);
    if (resolved) return resolved;
  }
  return null;
}

function parseCookieHeader(rawCookieHeader, name) {
  if (!rawCookieHeader || typeof rawCookieHeader !== 'string') return null;
  const parts = rawCookieHeader.split(';');
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    const k = p.slice(0, eq).trim();
    if (k === name) {
      return p.slice(eq + 1).trim();
    }
  }
  return null;
}

function getQuerySuffix(req) {
  const rawUrl = (req && typeof req.originalUrl === 'string')
    ? req.originalUrl
    : (req && typeof req.url === 'string')
      ? req.url
      : '';
  const queryStart = rawUrl.indexOf('?');
  return queryStart >= 0 ? rawUrl.slice(queryStart) : '';
}

function createAcceptLanguageMiddleware(options) {
  const supported = options && Array.isArray(options.supported) ? options.supported : [];
  const defaultLocale = (options && options.defaultLocale) || 'en';
  const cookieName = (options && options.cookieName) || 'fsb-locale';
  const supportedSet = new Set(supported);

  return function acceptLanguageMiddleware(req, res, next) {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path !== '/') return next();

      const cookieVal = parseCookieHeader(req.headers && req.headers.cookie, cookieName);
      if (cookieVal) {
        // Default locale cookie: serve EN root (never redirect to /en/).
        if (cookieVal === defaultLocale) return next();
        // Valid non-default picker cookie: redirect to that locale's subpath.
        if (supportedSet.has(cookieVal)) {
          return res.redirect(302, '/' + cookieVal + '/' + getQuerySuffix(req));
        }
        // Unknown cookie value: ignore and fall through to Accept-Language.
      }

      const best = pickBestLocale(req.headers && req.headers['accept-language'], supported);
      if (!best || best === defaultLocale) return next();

      res.redirect(302, '/' + best + '/');
    } catch {
      // T-267-04: any error -> fall through to EN root.
      return next();
    }
  };
}

module.exports = { pickBestLocale, createAcceptLanguageMiddleware, parseCookieHeader };
