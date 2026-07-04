#!/usr/bin/env node
// Local crawler smoke harness for the prerendered static Angular output.
// Builds are produced under showcase/dist/showcase-angular/browser; this script
// serves that directory and runs smoke-crawler.mjs against localhost.

import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const STATIC_ROOT = resolve(__dirname, '..', '..', 'dist', 'showcase-angular', 'browser');
const HOST = '127.0.0.1';
const PORT = Number.parseInt(process.env.CRAWLER_SMOKE_PORT || '4221', 10);

const CONTENT_TYPES = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.xml': 'application/xml'
};

function assertBuildOutputReady() {
  const indexPath = join(STATIC_ROOT, 'index.html');
  if (!existsSync(indexPath)) {
    console.error(
      `[smoke-crawler-local] Missing static build output at ${STATIC_ROOT}. ` +
      'Run `npm --prefix showcase/angular run build` first.'
    );
    process.exit(2);
  }
}

function contentTypeFor(filePath) {
  return CONTENT_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function resolveRequestPath(pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch (_err) {
    return null;
  }

  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
  const candidate = resolve(STATIC_ROOT, `.${sep}${normalizedPath}`);
  if (candidate !== STATIC_ROOT && !candidate.startsWith(`${STATIC_ROOT}${sep}`)) {
    return null;
  }
  return candidate;
}

async function findStaticFile(pathname) {
  const candidate = resolveRequestPath(pathname);
  if (!candidate) return null;

  try {
    const exact = await stat(candidate);
    if (exact.isFile()) return candidate;
    if (exact.isDirectory()) {
      const indexPath = join(candidate, 'index.html');
      const index = await stat(indexPath);
      if (index.isFile()) return indexPath;
    }
  } catch (_err) {
    const indexPath = join(candidate, 'index.html');
    try {
      const index = await stat(indexPath);
      if (index.isFile()) return indexPath;
    } catch (_inner) {
      return null;
    }
  }

  return null;
}

function createStaticServer() {
  return createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }

    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
    const filePath = await findStaticFile(url.pathname);
    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentTypeFor(filePath) });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(filePath).pipe(res);
  });
}

function listen(server) {
  return new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(PORT, HOST, () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
}

function close(server) {
  return new Promise((resolveClose) => {
    server.close(() => resolveClose());
  });
}

function runSmoke() {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [join(__dirname, 'smoke-crawler.mjs')], {
      stdio: 'inherit',
      env: {
        ...process.env,
        BASE_URL: `http://${HOST}:${PORT}`
      }
    });
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (signal) {
        resolveRun(1);
        return;
      }
      resolveRun(typeof code === 'number' ? code : 1);
    });
  });
}

async function main() {
  assertBuildOutputReady();
  const server = createStaticServer();
  let exitCode = 0;

  try {
    await listen(server);
    console.log(`[smoke-crawler-local] serving ${STATIC_ROOT} at http://${HOST}:${PORT}`);
    exitCode = await runSmoke();
  } catch (err) {
    exitCode = 2;
    if (err && err.code === 'EADDRINUSE') {
      console.error(
        `[smoke-crawler-local] Port ${PORT} is already in use. ` +
        'Set CRAWLER_SMOKE_PORT to a free port and retry.'
      );
    } else {
      console.error(`[smoke-crawler-local] ${err && err.message ? err.message : err}`);
    }
  } finally {
    await close(server);
  }

  process.exit(exitCode);
}

main();
