const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { initializeDatabase } = require('./src/db/schema');
const Queries = require('./src/db/queries');
const { attachLegacyRelaySink, createRetiredDashboardRouter } = require('./src/ws/legacy-relay-sink');
const { createAcceptLanguageMiddleware } = require('./src/middleware/accept-language');
const { createLegacyHtmlRedirectHandler } = require('./src/middleware/legacy-html-redirects');
const {
  createShowcaseRouteFallback,
  splitLocaleFromPath,
  withoutTrailingSlash,
} = require('./src/middleware/showcase-route-fallback');
const { createStaticCachePolicy } = require('./src/middleware/static-cache-policy');
const { createGlobalJsonParser } = require('./src/middleware/global-json-parser');
const { loadJevConfig } = require('./src/jev/config');
const createJevRouter = require('./src/routes/jev');
const { LOCALES, SOURCE_LOCALE, LOCALE_SUBPATHS } = require('./src/utils/locale-constants');

// Configuration
const PORT = parseInt(process.env.PORT) || 3847;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'fsb-data.db');

// Initialize database
const db = new Database(DB_PATH);
initializeDatabase(db);
const queries = new Queries(db);
// Phase 67 / D-04 -- Jev gateway config, read once after dotenv. Never throws;
// an invalid config logs one fixed line naming variables only (D-05).
const jevConfig = loadJevConfig(process.env, { log: console });

// Express app
const app = express();
app.set('trust proxy', 1);  // BLOCKER #1 / INGEST-01 -- Fly.io single-edge proxy; req.ip = real client IP. NEVER remove. See .planning/research/STACK.md section 3 + tests/server-trust-proxy.test.js.

// Drop the default x-powered-by: Express header (information disclosure).
app.disable('x-powered-by');

// Security headers (Lighthouse Best Practices: HSTS, COOP, XFO, CSP, etc.).
// CSP keeps 'unsafe-inline' for scripts/styles because the showcase ships
// inline JSON-LD scripts (per page), an inline theme-bootstrap script in
// index.html, and Angular's component-scoped <style> emissions. Nonces are
// not viable without per-request server rendering. The icon fonts (Font
// Awesome, Phosphor) and the capability logos are served from this origin, so
// scripts, styles, fonts and images need no CDN allowance.
// NOTE: script-src-attr is intentionally NOT set to 'none' here. Angular 20
// emits the lazy-CSS pattern `<link rel="stylesheet" media="print"
// onload="this.media='all'">` for the global styles bundle; setting
// script-src-attr to 'none' blocks that onload handler, leaving the bundle
// stuck at media="print" so everything outside the inlined critical CSS never
// applies to screen rendering. Without an explicit
// script-src-attr, it falls back to script-src which permits 'unsafe-inline'.
// connect-src is restricted to 'self'; same-origin endpoint
// /api/public-stats/github/:endpoint_id serves cached GitHub stats so the
// browser never reaches api.github.com directly. Server-side polling lives in
// showcase/server/src/telemetry/github-poller.js (quick task 260516-7l5).
const SHOWCASE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // The FSB wordmark's F and S are data: fonts (angular/src/styles/fsb-wordmark.css). Dropping
  // data: turns the logo into the system font with no error anywhere, so
  // tests/fsb-wordmark-parity.test.js checks it. Third-party font hosts stay refused; that is
  // why the site never loads Poppins from Google Fonts.
  "font-src 'self' data:",
  // i.ytimg.com is the /about YouTube thumbnails.
  "img-src 'self' data: blob: https://i.ytimg.com",
  "media-src 'self' blob:",
  // raw.githubusercontent.com serves the Natural Earth land GeoJSON the stats
  // globe fetches once per session (globe-visualization.service); without it the
  // globe silently falls back to rough continents.
  "connect-src 'self' https://raw.githubusercontent.com",
  // YouTube embeds on the /about page require frame-src; without this it falls
  // back to default-src 'self' and the demo videos render as a blocked iframe.
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  // Portfolio preview embeds this site. DENY is not sent: X-Frame-Options DENY
  // would still block these parents even when frame-ancestors allows them.
  "frame-ancestors 'self' https://parzival.live https://parzival-live.fly.dev http://localhost:3000 http://127.0.0.1:3000",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join('; ');
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  res.setHeader('Content-Security-Policy', SHOWCASE_CSP);
  next();
});

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(createGlobalJsonParser());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (!req.path.startsWith('/assets')) {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// The Live Dashboard's hash-key and pairing endpoints, retired after v0.9.95.
// Old installs still call them, so they answer 410 Gone with a JSON body,
// except that register hands out a throwaway key so a keyless old install can
// open a quiet relay socket instead of retrying (see src/ws/legacy-relay-sink.js).
app.use('/api/auth', createRetiredDashboardRouter({ issueThrowawayKeys: true }));
app.use('/api/pair', createRetiredDashboardRouter());

// Phase 273 / INGEST-01..13 -- anonymous telemetry ingest (PUBLIC, no auth).
// Mount order: AFTER trust-proxy line (top of file), AFTER existing routes
// (no path overlap with /api/auth /api/pair),
// BEFORE static-file middleware so the static handler doesn't shadow /api/telemetry/*.
const createTelemetryRouter = require('./src/routes/telemetry');
const { hashIp } = require('./src/utils/telemetry-hash');
app.use('/api/telemetry', createTelemetryRouter(db, queries, hashIp));

// Phase 274 / AGG-01..09 + STATS-04 -- anonymous public aggregates (PUBLIC, no auth).
// Mounted AFTER auth routes and the auth-gated /api/stats handler so the path
// /api/public-stats does NOT shadow /api/stats. Distinct namespaces by design.
// Memo + ETag handling lives inside the router; this mount is the only wiring.
const createPublicStatsRouter = require('./src/routes/public-stats');
app.use('/api/public-stats', createPublicStatsRouter(db, queries));

// Phase 67 / JEV-01..07 -- hosted Jev decision gateway (PUBLIC, no auth).
// Route-local 48 KB parser and error handler; never reaches the generic error
// handler; disabled unless JEV_ENABLED and a valid config. The global JSON
// parser skips /api/jev so the route-local cap sees the original stream.
app.use('/api/jev', createJevRouter({
  db,
  config: jevConfig,
  fetchImpl: (...args) => globalThis.fetch(...args),
  now: Date.now,
  log: console,
}));

// Serve showcase static files with cache headers
// In Docker: Angular dist is copied to /app/public
// Local dev: serve Angular dist output directly from showcase/dist/.
// The legacy vanilla showcase has been archived under showcase/legacy/ and is
// no longer served. If neither path exists, run `npm --prefix showcase/angular run build`.
const publicPath = path.join(__dirname, 'public');
const angularDistPath = path.join(__dirname, '..', 'dist', 'showcase-angular', 'browser');
const fs = require('fs');
const staticPath = fs.existsSync(publicPath)
  ? publicPath
  : fs.existsSync(angularDistPath)
    ? angularDistPath
    : null;
if (!staticPath) {
  console.warn('[server] No showcase build found at', publicPath, 'or', angularDistPath, '- run `npm --prefix showcase/angular run build` first.');
}

const NON_SOURCE_LOCALE_SUBPATHS = LOCALES
  .filter(function(loc) { return loc !== SOURCE_LOCALE; })
  .map(function(loc) { return LOCALE_SUBPATHS[loc]; })
  .filter(Boolean);

// The retired Live Dashboard: /dashboard, /dashboard/ and /dashboard.html go
// to the home page, and /<locale>/dashboard to that locale's home. The target
// depends only on the path, so the redirect is permanent; the bare / still
// applies the locale cookie and Accept-Language. Paths that merely start with
// "dashboard" (/dashboards, /dashboard-x) are not matched.
const RETIRED_DASHBOARD_ROUTES = new Set(['/dashboard', '/dashboard.html']);
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const { localeSubPath, routeWithinLocale } = splitLocaleFromPath(req.path, NON_SOURCE_LOCALE_SUBPATHS);
  if (!RETIRED_DASHBOARD_ROUTES.has(withoutTrailingSlash(routeWithinLocale))) return next();
  res.redirect(301, localeSubPath ? `/${localeSubPath}` : '/');
});

// Legacy .html redirects (per D-05)
const htmlRedirects = {
  '/index.html': '/',
  '/about.html': '/about',
  '/privacy.html': '/privacy',
  '/support.html': '/support',
};
app.get(
  Object.keys(htmlRedirects),
  createLegacyHtmlRedirectHandler(htmlRedirects, { cookieName: 'fsb-locale' })
);

// Phase 267 / ROUTE-03: Accept-Language auto-detection on bare `/`.
// Cookie-respecting (fsb-locale wins), bot-safe (no header => no redirect),
// 302 (caches must not pin the decision). Must run BEFORE express.static so
// a redirect short-circuits the prerendered index.html send for `/`.
app.use(createAcceptLanguageMiddleware({
  supported: LOCALES.filter(l => l !== SOURCE_LOCALE),
  defaultLocale: 'en',
  cookieName: 'fsb-locale',
}));

if (staticPath) {
  const staticCacheControlFor = createStaticCachePolicy({
    staticRoot: staticPath,
    localeSubpaths: LOCALES.filter(l => l !== SOURCE_LOCALE).map(l => LOCALE_SUBPATHS[l]).filter(Boolean),
  });
  app.use(express.static(staticPath, {
    maxAge: 0,
    etag: true,
    // Phase 216 SRV-01 / D-09: disable trailing-slash directory redirect so /about
    // does NOT 301 to /about/ before our custom middleware can serve about/index.html.
    // The custom middleware below handles marketing routes explicitly via path.join.
    redirect: false,
    // Content-hashed bundles are kept forever, pages and fixed-name scripts are
    // checked on every load, crawler files for an hour: see static-cache-policy.js.
    setHeaders: function(res, filePath) {
      const cacheControl = staticCacheControlFor(filePath);
      if (cacheControl) res.setHeader('Cache-Control', cacheControl);
    }
  }));
}

// Phase 216 SRV-01 / SRV-02 / D-09 / D-10 + locale-aware extension (2026-05-21):
// Prefer per-route prerendered HTML for marketing routes; whitelist exact-match
// client-shell routes (/stats, /legal) for Angular's dedicated
// index.csr.html shell; fall through to a 404 otherwise. Client routes must not
// receive the prerendered root index.html because it contains the Home DOM and
// metadata. The fallback middleware also canonicalizes trailing slashes and
// attaches X-Robots-Tag to private/noindex client routes.
//
// Locale extension: requests like /es/agents must serve public/es/agents/index.html.
// express.static({ redirect: false }) intentionally suppresses directory
// redirects. Locale splitting lets one whitelist handle every locale uniformly.
const marketingRoutes = new Set([
  '/',
  '/about',
  '/agents',
  '/privacy',
  '/release-notes',
  '/support',
  '/lattice',
  '/concierge',
  '/phantom-stream',
  '/prometheus',
  '/sitemaps'
]);
const clientShellRoutes = new Set([
  '/stats',
  '/legal'
]);
const noIndexClientRoutes = new Set([
  '/stats',
  '/legal'
]);

app.use(createShowcaseRouteFallback({
  staticPath,
  localeSubpaths: NON_SOURCE_LOCALE_SUBPATHS,
  marketingRoutes,
  clientShellRoutes,
  noIndexClientRoutes,
}));

// Localized 404. Without this, unmatched paths reach Express's finalhandler,
// which emits an unstyled English "Cannot GET /x" to every reader regardless of
// locale. The copy lives here rather than in the XLIFF catalog because this
// response is served without the Angular app -- keep it to one short sentence.
const NOT_FOUND_COPY = {
  'en': { title: 'Page not found', home: 'Go to the home page' },
  'es': { title: 'Página no encontrada', home: 'Ir a la página de inicio' },
  'de': { title: 'Seite nicht gefunden', home: 'Zur Startseite' },
  'ru': { title: 'Страница не найдена', home: 'На главную' },
  'ja': { title: 'ページが見つかりません', home: 'ホームページへ移動' },
  'ko': { title: '페이지를 찾을 수 없습니다', home: '홈페이지로 이동' },
  'zh-CN': { title: '未找到页面', home: '前往首页' },
  'zh-TW': { title: '找不到頁面', home: '前往首頁' },
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

app.use((req, res) => {
  const segment = String(req.path || '/').split('/')[1] || '';
  const locale = LOCALES.find((code) => LOCALE_SUBPATHS[code] === segment) || SOURCE_LOCALE;
  // A locale reaching LOCALES without an entry above falls back to English copy,
  // so <html lang> must follow the copy served rather than the requested locale.
  // homeHref still uses `locale` -- that home page exists either way.
  const copyLocale = NOT_FOUND_COPY[locale] ? locale : SOURCE_LOCALE;
  const copy = NOT_FOUND_COPY[copyLocale];
  const homeHref = LOCALE_SUBPATHS[locale] ? `/${LOCALE_SUBPATHS[locale]}` : '/';
  // A bundle requested by a tab left open across a deploy lands here; the miss
  // must not be remembered under a name that is otherwise kept forever.
  res.setHeader('Cache-Control', 'no-store');
  res.status(404).type('html').send(
    `<!doctype html><html lang="${escapeHtml(copyLocale)}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="robots" content="noindex"><title>${escapeHtml(copy.title)}</title></head>` +
    `<body style="margin:0;display:grid;place-items:center;min-height:100vh;` +
    `background:#000;color:#f1f5f9;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">` +
    `<main style="text-align:center;padding:2rem">` +
    `<h1 style="font-size:1.5rem;margin:0 0 1rem">${escapeHtml(copy.title)}</h1>` +
    `<a href="${escapeHtml(homeHref)}" style="color:#ff6b35">${escapeHtml(copy.home)}</a>` +
    `</main></body></html>`
  );
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('Server error:', err.message);
  if (err && (err.status === 413 || err.type === 'entity.too.large')) {
    res.status(413).json({ error: 'payload_too_large' });
    return;
  }
  res.status(500).json({ error: 'Internal server error' });
});

// Create the HTTP server. Its only upgrade handler is the legacy relay sink,
// which holds old installs' dashboard sockets open and refuses everything else.
const server = http.createServer(app);
const legacyRelaySink = attachLegacyRelaySink(server);

// Start server
server.listen(PORT, () => {
  console.log(`[FSB Server] Running on http://localhost:${PORT}`);
  console.log(`[FSB Server] Database: ${DB_PATH}`);
});

// Phase 273 / INGEST-11 -- start hourly maintenance: delete events >7d,
// re-aggregate rollups + globals (allowlisted MCP labels currently use a
// display floor of 1; coarse regions retain k>=5 -- see housekeeper.js),
// nudge salt rotation.
const { startHousekeeper } = require('./src/telemetry/housekeeper');
const housekeeperInterval = startHousekeeper(db);

// Quick task 260516-7l5 -- 5-min GitHub stats poller. Same lifecycle as housekeeper:
// boot via setImmediate, interval = 5min, clearInterval on SIGINT/SIGTERM.
const { startGithubPoller } = require('./src/telemetry/github-poller');
const githubPollerInterval = startGithubPoller(db);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[FSB Server] Shutting down...');
  clearInterval(housekeeperInterval);
  clearInterval(githubPollerInterval);
  legacyRelaySink.close();
  server.close();
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  clearInterval(housekeeperInterval);
  clearInterval(githubPollerInterval);
  legacyRelaySink.close();
  server.close();
  db.close();
  process.exit(0);
});
