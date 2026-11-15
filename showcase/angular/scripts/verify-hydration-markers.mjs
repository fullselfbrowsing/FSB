#!/usr/bin/env node
// Post-build check that the prerendered pages can be hydrated.
//
// With provideClientHydration() the server stamps each prerendered page so the
// browser can adopt its DOM instead of emptying <app-root> and drawing the page
// again. If the provider is dropped, or a build option stops the stamps being
// written, nothing fails: the site silently goes back to redrawing every page on
// load. This asserts, on every prerendered index.html:
//   1. <app-root> carries an `ngh` attribute;
//   2. a <script id="ng-state" type="application/json"> holds the hydration data.
// and on every client-only shell (index.csr.html) that it is marked as such
// (`ngcm` on <body>) and carries no server DOM to adopt.
//
// Run after `ng build`:
//   node scripts/verify-hydration-markers.mjs
// Zero dependencies; exit 1 with a report on failure.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST_ROOT = process.env.DIST_ROOT
  || join(process.cwd(), '..', 'dist', 'showcase-angular', 'browser');

if (!existsSync(DIST_ROOT)) {
  console.error(`verify-hydration-markers: build output not found at ${DIST_ROOT}`);
  process.exit(1);
}

function walk(dir, found = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== 'assets' && name !== 'media') walk(full, found);
    } else if (name === 'index.html' || name === 'index.csr.html') {
      found.push(full);
    }
  }
  return found;
}

const failures = [];
let pages = 0;
let shells = 0;

for (const file of walk(DIST_ROOT)) {
  const label = relative(DIST_ROOT, file);
  const html = readFileSync(file, 'utf8');
  const appRoot = (html.match(/<app-root\b[^>]*>/) || [''])[0];

  if (file.endsWith('index.csr.html')) {
    shells++;
    if (!/<body\b[^>]*\bngcm\b/.test(html)) failures.push(`${label}: client shell is not marked ngcm`);
    if (/\bngh=/.test(appRoot)) failures.push(`${label}: client shell carries server hydration data`);
    continue;
  }

  pages++;
  if (!/\bngh="[^"]*"/.test(appRoot)) {
    failures.push(`${label}: <app-root> has no ngh attribute (page would be redrawn on load)`);
  }
  const state = html.match(/<script id="ng-state" type="application\/json">([\s\S]*?)<\/script>/);
  if (!state) {
    failures.push(`${label}: no ng-state script`);
    continue;
  }
  try {
    const data = JSON.parse(state[1]);
    if (!Array.isArray(data.__nghData__) || data.__nghData__.length === 0) {
      failures.push(`${label}: ng-state holds no hydration data`);
    }
  } catch (error) {
    failures.push(`${label}: ng-state is not valid JSON (${error.message})`);
  }
}

if (pages === 0) failures.push('no prerendered index.html found');

if (failures.length) {
  console.error(`verify-hydration-markers: ${failures.length} problem(s)`);
  for (const failure of failures) console.error('  FAIL: ' + failure);
  process.exit(1);
}
console.log(`verify-hydration-markers: PASS (${pages} prerendered pages, ${shells} client shells)`);
