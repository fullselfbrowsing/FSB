const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { URL } = require('url');
const Database = require('better-sqlite3');
const { WebSocketServer } = require('ws');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { initializeDatabase } = require('./src/db/schema');
const Queries = require('./src/db/queries');
const authMiddleware = require('./src/middleware/auth');
const createAuthRouter = require('./src/routes/auth');
const createAgentsRouter = require('./src/routes/agents');
const createPairRouter = require('./src/routes/pair');
const { setupWSHandler } = require('./src/ws/handler');
const { RELAY_PER_MESSAGE_LIMIT_BYTES } = require('./src/ws/phantomstream-relay-compat');
const { createAcceptLanguageMiddleware } = require('./src/middleware/accept-language');
const { LOCALES, SOURCE_LOCALE } = require('./src/utils/locale-constants');

// Configuration
const PORT = parseInt(process.env.PORT) || 3847;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'fsb-data.db');

// Initialize database
const db = new Database(DB_PATH);
initializeDatabase(db);
const queries = new Queries(db);

// Express app
const app = express();
app.set('trust proxy', 1);  // BLOCKER #1 / INGEST-01 -- Fly.io single-edge proxy; req.ip = real client IP. NEVER remove. See .planning/research/STACK.md section 3 + tests/server-trust-proxy.test.js.

// Drop the default x-powered-by: Express header (information disclosure).
app.disable('x-powered-by');

// Security headers (Lighthouse Best Practices: HSTS, COOP, XFO, CSP, etc.).
// CSP keeps 'unsafe-inline' for scripts/styles because the showcase ships
// inline JSON-LD scripts (per page), an inline theme-bootstrap script in
// index.html, and Angular's component-scoped <style> emissions. Nonces are
// not viable without per-request server rendering. CDN allowlist covers
// Font Awesome (cdnjs) + Phosphor (unpkg) icon CSS and the dashboard's
// lazy-loaded html5-qrcode/lz-string from unpkg.
// NOTE: script-src-attr is intentionally NOT set to 'none' here. Angular 20
// emits the lazy-CSS pattern `<link rel="stylesheet" media="print"
// onload="this.media='all'">` for the global styles bundle; setting
// script-src-attr to 'none' blocks that onload handler, leaving the bundle
// stuck at media="print" so its @import for Font Awesome / Phosphor never
// applies to screen rendering -- icons disappear. Without an explicit
// script-src-attr, it falls back to script-src which permits 'unsafe-inline'.
// connect-src is restricted to 'self'; same-origin endpoint
// /api/public-stats/github/:endpoint_id serves cached GitHub stats so the
// browser never reaches api.github.com directly. Server-side polling lives in
// showcase/server/src/telemetry/github-poller.js (quick task 260516-7l5).
const SHOWCASE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://unpkg.com",
  "font-src 'self' data: https://cdnjs.cloudflare.com https://unpkg.com",
  "img-src 'self' data: blob: https://i.ytimg.com",
  "media-src 'self' blob:",
  "connect-src 'self'",
  // YouTube embeds on the /about page require frame-src; without this it falls
  // back to default-src 'self' and the demo videos render as a blocked iframe.
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join('; ');
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), interest-cohort=()');
  res.setHeader('Content-Security-Policy', SHOWCASE_CSP);
  next();
});

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
  exposedHeaders: ['X-FSB-Hash-Key']
}));
app.use(express.json({ limit: '1mb' }));

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

// Routes - auth (no middleware required for register)
app.use('/api/auth', createAuthRouter(queries));

// Routes - protected (require hash key)
const auth = authMiddleware(queries);
app.use('/api/agents', auth, createAgentsRouter(queries));
app.use('/api/pair', createPairRouter(queries, auth));
app.use('/api/stats', auth, (req, res) => {
  try {
    const stats = queries.getAgentStats(req.hashKey);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Phase 273 / INGEST-01..13 -- anonymous telemetry ingest (PUBLIC, no auth).
// Mount order: AFTER trust-proxy line (top of file), AFTER existing routes
// (no path overlap with /api/auth /api/agents /api/pair /api/stats),
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

// Serve showcase static files with cache headers
// In Docker: Angular dist is copied to /app/public
// Local dev: serve Angular dist output directly from showcase/dist/.
// The legacy vanilla showcase has been archived under showcase/legacy/ and is
// no longer served. If neither path exists, run `npm --prefix showcase/angular run build`.
const publicPath = path.join(__dirname, 'public');
const angularDistPath = path.join(__dirname, '..', 'showcase', 'dist', 'showcase-angular', 'browser');
const fs = require('fs');
const staticPath = fs.existsSync(publicPath)
  ? publicPath
  : fs.existsSync(angularDistPath)
    ? angularDistPath
    : null;
if (!staticPath) {
  console.warn('[server] No showcase build found at', publicPath, 'or', angularDistPath, '- run `npm --prefix showcase/angular run build` first.');
}

// Legacy .html redirects (per D-05)
const htmlRedirects = {
  '/index.html': '/',
  '/about.html': '/about',
  '/dashboard.html': '/dashboard',
  '/privacy.html': '/privacy',
  '/support.html': '/support',
};
app.get(Object.keys(htmlRedirects), (req, res) => {
  res.redirect(301, htmlRedirects[req.path]);
});

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
  app.use(express.static(staticPath, {
    maxAge: 0,
    etag: true,
    // Phase 216 SRV-01 / D-09: disable trailing-slash directory redirect so /about
    // does NOT 301 to /about/ before our custom middleware can serve about/index.html.
    // The custom middleware below handles marketing routes explicitly via path.join.
    redirect: false,
    setHeaders: function(res, filePath) {
      // Phase 216 SRV-03 / D-11: crawler files cache for 1 hour at the edge.
      // The .txt/.xml branch must come first and short-circuit so a future stray
      // filename (e.g. foo.html.txt) does not double-fire and pick up the no-cache header.
      if (filePath.endsWith('.txt') || filePath.endsWith('.xml')) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return;
      }
      // Existing policy: prevent stale JS/CSS/HTML -- dashboard updates must take effect immediately.
      if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
    }
  }));
}

// Phase 216 SRV-01 / SRV-02 / D-09 / D-10:
// Prefer per-route prerendered HTML for marketing routes; whitelist /dashboard
// exact-match for the SPA shell; fall through to a 404 otherwise. This replaces
// the previous all-routes -> root-index SPA fallback, which would have shadowed
// crawler files and served the wrong <title>/<meta> for /about /privacy /support
// after Phase 215 prerender landed.
const marketingRoutes = new Set(['/', '/about', '/agents', '/privacy', '/support']);
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }
  if (!staticPath) {
    if (marketingRoutes.has(req.path) || req.path === '/dashboard' || req.path === '/stats') {
      res.status(503).type('text/plain').send('Showcase build not found. Run `npm --prefix showcase/angular run build` first.');
      return;
    }
    return next();
  }
  if (marketingRoutes.has(req.path)) {
    const dir = req.path === '/' ? '' : req.path;
    const candidate = path.join(staticPath, dir, 'index.html');
    if (fs.existsSync(candidate)) {
      res.sendFile(candidate);
      return;
    }
    // Build pipeline regression -- prerendered file expected but missing. Fall
    // through to 404 rather than silently serving the wrong page; verify-server.sh
    // will surface this on the next run.
    return next();
  }
  if (req.path === '/dashboard' || req.path === '/stats') {
    // D-10 exact-match whitelist: /dashboard and /stats are SPA-shell routes
    // (RenderMode.Client per app.routes.server.ts). /dashboard/* and /stats/*
    // are NOT covered and fall through to 404.
    res.sendFile(path.join(staticPath, 'index.html'));
    return;
  }
  return next();
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Create HTTP server and WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: RELAY_PER_MESSAGE_LIMIT_BYTES + 1024
});

// Set up WS message handling
setupWSHandler(wss);

// WebSocket upgrade handler - authenticate via query params
server.on('upgrade', (request, socket, head) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    // Only accept upgrades on /ws path
    if (url.pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const hashKey = url.searchParams.get('key');
    const role = url.searchParams.get('role') || 'dashboard';

    if (!hashKey) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Validate hash key
    const keyRecord = queries.validateHashKey(hashKey);
    if (!keyRecord) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Upgrade the connection
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, { hashKey, role });
    });
  } catch (err) {
    console.error('WebSocket upgrade error:', err.message);
    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    socket.destroy();
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`[FSB Server] Running on http://localhost:${PORT}`);
  console.log(`[FSB Server] Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`[FSB Server] WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`[FSB Server] Database: ${DB_PATH}`);
});

// Phase 273 / INGEST-11 -- start hourly maintenance: delete events >7d,
// re-aggregate rollups + globals (k>=K_ANONYMITY_FLOOR anonymity floor;
// floor lowered from 5 to 2 in v0.9.70 -- see housekeeper.js header),
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
  wss.close();
  server.close();
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  clearInterval(housekeeperInterval);
  clearInterval(githubPollerInterval);
  wss.close();
  server.close();
  db.close();
  process.exit(0);
});
