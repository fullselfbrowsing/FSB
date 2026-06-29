#!/usr/bin/env node
/**
 * Phase 45 / Plan 02 -- T1 port contract verifier.
 *
 * This gate uses the Phase 44 readiness model as its source. It does not change
 * runtime behavior; it fails CI when a current/future T1 handler violates the
 * shared port contract or a guarded write can fire before UAT evidence exists.
 */

'use strict';

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';

import { reportReadiness } from './report-t1-readiness.mjs';
import {
  validateGuardedWriteRows,
  validateHandlerSource,
  normalizeSideEffectClass,
  isWriteLike,
} from './lib/t1-port-contract.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

export const HANDLER_BY_APP = Object.freeze({
  bitbucket: 'bitbucket.js',
  circleci: 'circleci.js',
  github: 'github.js',
  gitlab: 'gitlab.js',
  netlify: 'netlify.js',
  notion: 'notion.js',
  slack: 'slack.js',
  vercel: 'vercel.js',
});

export const ACTIVE_WRITE_UAT_SLUGS = Object.freeze([
  'notion.create_page',
  'notion.update_page',
  'notion.create_database',
  'notion.create_database_item',
  'slack.chat.postMessage',
]);

const HANDLERS_DIR = join(ROOT, 'extension', 'catalog', 'handlers');
const CATALOG_PATH = join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js');
const TOOL_DEFINITIONS_PATH = join(ROOT, 'mcp', 'ai', 'tool-definitions.cjs');

function safeOrigin(value) {
  try { return new URL(String(value || '')).origin; } catch (_err) { return ''; }
}

function handlerPathForApp(app) {
  const file = HANDLER_BY_APP[app];
  return file ? join(HANDLERS_DIR, file) : '';
}

function freshRequire(filePath) {
  delete require.cache[require.resolve(filePath)];
  return require(filePath);
}

function loadHandlerEntry(row, opts = {}) {
  const customLoad = opts.loadHandlerEntry;
  if (typeof customLoad === 'function') return customLoad(row);

  const p = handlerPathForApp(row.app);
  if (!p || !existsSync(p)) return null;
  const handlers = freshRequire(p);
  return handlers && handlers[row.slug] ? handlers[row.slug] : null;
}

function sourceForApp(app, opts = {}) {
  if (opts.sourceByApp && opts.sourceByApp[app] !== undefined) return String(opts.sourceByApp[app]);
  const p = handlerPathForApp(app);
  return p && existsSync(p) ? readFileSync(p, 'utf8') : '';
}

export function currentT1Rows(report) {
  const rows = report && Array.isArray(report.rows) ? report.rows : [];
  return rows.filter(function(row) {
    return row && (row.readiness === 't1-ready' || row.readiness === 't1-guarded-fail-closed');
  });
}

export function validateWriteEvidenceRows(rows, activeWriteUatSlugs = ACTIVE_WRITE_UAT_SLUGS) {
  const failures = [];
  const activeSet = new Set(activeWriteUatSlugs);
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    if (!row || !isWriteLike(row.sideEffectClass)) continue;
    if (row.readiness === 't1-guarded-fail-closed') continue;
    if (row.readiness === 't1-ready' && !activeSet.has(row.slug)) {
      failures.push(row.slug + ' is an active write without recorded UAT evidence');
    }
  }
  return { failures };
}

export function validateMcpSurfaceNoPerAppTools(registryNames, appNames) {
  const failures = [];
  const names = Array.isArray(registryNames) ? registryNames : [];
  const apps = Array.isArray(appNames) ? appNames : [];
  for (const app of apps) {
    const prefix = String(app || '').toLowerCase() + '_';
    for (const name of names) {
      const n = String(name || '').toLowerCase();
      if (n === app || n.startsWith(prefix)) {
        failures.push('MCP registry exposes app-specific capability tool: ' + name);
      }
    }
  }
  if (names.includes('invoke_capability') || names.includes('search_capabilities')) {
    failures.push('capability tools leaked into TOOL_REGISTRY');
  }
  return { failures };
}

export function validateHandlerRows(rows, opts = {}) {
  const failures = [];
  const list = Array.isArray(rows) ? rows : [];
  const seenSource = new Set();

  for (const row of list) {
    if (!row || row.proof !== 'handler') continue;
    const slug = row.slug || '(unknown)';
    const handlerFile = HANDLER_BY_APP[row.app];
    if (!handlerFile) {
      failures.push(slug + ' has handler proof but no verifier handler mapping for app ' + row.app);
      continue;
    }

    if (!seenSource.has(row.app)) {
      seenSource.add(row.app);
      const source = sourceForApp(row.app, opts);
      if (!source) {
        failures.push(slug + ' missing handler source for app ' + row.app);
      } else {
        failures.push(...validateHandlerSource(source, {
          slug: row.app,
          handlerFile,
        }).failures);
      }
    }

    const entry = loadHandlerEntry(row, opts);
    if (!entry || typeof entry.handle !== 'function') {
      failures.push(slug + ' missing handler export');
      continue;
    }

    const expectedOrigin = safeOrigin(row.runtimeOrigin);
    const actualOrigin = safeOrigin(entry.origin);
    if (!expectedOrigin || actualOrigin !== expectedOrigin) {
      failures.push(slug + ' handler origin mismatch: expected ' + expectedOrigin + ', got ' + actualOrigin);
    }

    const expectedClass = normalizeSideEffectClass(row.sideEffectClass);
    const actualClass = normalizeSideEffectClass(entry.sideEffectClass);
    if (actualClass !== expectedClass) {
      failures.push(slug + ' sideEffectClass mismatch: expected ' + expectedClass + ', got ' + actualClass);
    }
  }

  return { failures };
}

export async function validateCurrentT1PortGate(catalog, opts = {}) {
  const idx = catalog || require(CATALOG_PATH);
  const report = opts.report || reportReadiness(idx);
  const rows = opts.rows || currentT1Rows(report);
  const failures = [];

  failures.push(...validateHandlerRows(rows, opts).failures);
  failures.push(...validateWriteEvidenceRows(rows, opts.activeWriteUatSlugs || ACTIVE_WRITE_UAT_SLUGS).failures);

  const guardedRows = rows.filter(function(row) {
    return row && row.readiness === 't1-guarded-fail-closed';
  });
  const guarded = await validateGuardedWriteRows(guardedRows, {
    loadHandler: function(row) { return loadHandlerEntry(row, opts); },
  });
  failures.push(...guarded.failures);

  const td = opts.toolDefinitions || require(TOOL_DEFINITIONS_PATH);
  const registryNames = Array.isArray(td.TOOL_REGISTRY)
    ? td.TOOL_REGISTRY.map(function(tool) { return tool && tool.name; }).filter(Boolean)
    : [];
  const appNames = Object.keys(HANDLER_BY_APP);
  failures.push(...validateMcpSurfaceNoPerAppTools(registryNames, appNames).failures);

  return { failures, report, rows };
}

async function runCli() {
  const result = await validateCurrentT1PortGate();
  if (result.failures.length) {
    console.error('verify-t1-port-contract: FAIL (' + result.failures.length + ' failure' +
      (result.failures.length === 1 ? '' : 's') + ')');
    for (const failure of result.failures) console.error('  - ' + failure);
    process.exit(1);
  }
  const guarded = result.rows.filter(function(row) { return row.readiness === 't1-guarded-fail-closed'; }).length;
  const handlerRows = result.rows.filter(function(row) { return row.proof === 'handler'; }).length;
  console.log('verify-t1-port-contract: PASS (' + result.rows.length + ' T1 rows; ' +
    handlerRows + ' handler rows; ' + guarded + ' guarded fail-closed)');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runCli().catch(function(err) {
    console.error('verify-t1-port-contract: ERROR ' + (err && err.message ? err.message : String(err)));
    process.exit(1);
  });
}
