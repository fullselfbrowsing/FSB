'use strict';

const fs = require('fs');
const path = require('path');

function splitLocaleFromPath(reqPath, localeSubpaths) {
  for (const sub of localeSubpaths) {
    if (reqPath === '/' + sub) {
      return { localeSubPath: sub, routeWithinLocale: '/' };
    }
    if (reqPath.startsWith('/' + sub + '/')) {
      return { localeSubPath: sub, routeWithinLocale: reqPath.slice(sub.length + 1) };
    }
  }
  return { localeSubPath: '', routeWithinLocale: reqPath };
}

function withoutTrailingSlash(routePath) {
  return routePath.length > 1 ? routePath.replace(/\/+$/, '') : routePath;
}

function redirectWithoutTrailingSlash(req, res) {
  const queryAt = req.originalUrl.indexOf('?');
  const pathname = queryAt === -1 ? req.originalUrl : req.originalUrl.slice(0, queryAt);
  const query = queryAt === -1 ? '' : req.originalUrl.slice(queryAt);
  res.redirect(308, pathname.replace(/\/+$/, '') + query);
}

/**
 * Serve prerendered marketing pages and the dedicated Angular CSR shell.
 * Client-only pages must never receive the prerendered Home document: doing so
 * leaks Home metadata/content until Angular bootstraps and gives crawlers the
 * wrong response when JavaScript is unavailable.
 */
function createShowcaseRouteFallback(options) {
  const {
    staticPath,
    localeSubpaths,
    marketingRoutes,
    clientShellRoutes,
    noIndexClientRoutes,
  } = options;

  return function showcaseRouteFallback(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    const split = splitLocaleFromPath(req.path, localeSubpaths);
    const canonicalRoute = withoutTrailingSlash(split.routeWithinLocale);
    const isMarketing = marketingRoutes.has(canonicalRoute);
    const isSpaShell = clientShellRoutes.has(canonicalRoute);

    if (!isMarketing && !isSpaShell) return next();
    if (split.routeWithinLocale !== canonicalRoute) {
      redirectWithoutTrailingSlash(req, res);
      return;
    }

    if (!staticPath) {
      res.status(503).type('text/plain').send('Showcase build not found. Run `npm --prefix showcase/angular run build` first.');
      return;
    }

    if (isMarketing) {
      const routeDir = canonicalRoute === '/' ? '' : canonicalRoute;
      const candidate = path.join(staticPath, split.localeSubPath, routeDir, 'index.html');
      if (fs.existsSync(candidate)) {
        res.sendFile(candidate);
        return;
      }
      next();
      return;
    }

    const shellCandidate = path.join(staticPath, split.localeSubPath, 'index.csr.html');
    if (!fs.existsSync(shellCandidate)) {
      res.status(503).type('text/plain').send('Showcase client shell not found. Rebuild the Angular showcase.');
      return;
    }
    if (noIndexClientRoutes.has(canonicalRoute)) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }
    res.sendFile(shellCandidate);
  };
}

module.exports = {
  createShowcaseRouteFallback,
  splitLocaleFromPath,
  withoutTrailingSlash,
};
