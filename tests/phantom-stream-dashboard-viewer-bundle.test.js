'use strict';

/**
 * Phase 23 Plan 01 -- PhantomStream dashboard viewer bundle guard.
 *
 * Verifies the shared browser-global viewer wrapper is built and loaded by
 * both dashboard shells before any renderer migration begins.
 *
 * Run: node tests/phantom-stream-dashboard-viewer-bundle.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const esbuildSource = fs.readFileSync(path.join(repoRoot, 'esbuild.config.js'), 'utf8');
const entrySource = fs.readFileSync(path.join(repoRoot, 'showcase', 'js', 'phantom-stream-viewer-entry.js'), 'utf8');
const bundlePath = path.join(repoRoot, 'showcase', 'js', 'phantom-stream-viewer.js');
const staticHtml = fs.readFileSync(path.join(repoRoot, 'showcase', 'dashboard.html'), 'utf8');
const angularJson = fs.readFileSync(path.join(repoRoot, 'showcase', 'angular', 'angular.json'), 'utf8');
const angularIndex = fs.readFileSync(path.join(repoRoot, 'showcase', 'angular', 'src', 'index.html'), 'utf8');
const angularDashboardTs = fs.readFileSync(
  path.join(repoRoot, 'showcase', 'angular', 'src', 'app', 'pages', 'dashboard', 'dashboard-page.component.ts'),
  'utf8'
);

let passed = 0;
function ok(condition, message) {
  assert.equal(Boolean(condition), true, message);
  passed += 1;
  console.log('  PASS:', message);
}

console.log('\n--- Shared PhantomStream dashboard viewer wrapper ---');

ok(esbuildSource.includes("name: 'showcase-phantom-stream-viewer'"),
  'esbuild declares showcase-phantom-stream-viewer entry');
ok(esbuildSource.includes('phantom-stream-viewer-entry.js'),
  'esbuild reads dashboard viewer wrapper entry');
ok(esbuildSource.includes('phantom-stream-viewer.js'),
  'esbuild emits dashboard viewer bundle');

ok(entrySource.includes("from '@full-self-browsing/phantom-stream/renderer'"),
  'viewer wrapper imports PhantomStream renderer surface');
ok(entrySource.includes("from '@full-self-browsing/phantom-stream/protocol'"),
  'viewer wrapper imports PhantomStream protocol constants');
ok(entrySource.includes('globalThis.FSBPhantomStreamViewer'),
  'viewer wrapper exposes browser global');
ok(entrySource.includes('createDashboardViewer'),
  'viewer wrapper exposes FSB createDashboardViewer adapter');
ok(entrySource.includes('dispatchMessage'),
  'viewer wrapper exposes dashboard message dispatch');
ok(entrySource.includes('mapPointToViewport'),
  'viewer wrapper exposes host-to-viewport point mapping');
ok(entrySource.includes('type === CONTROL.START'),
  'viewer wrapper maps CONTROL.START to host resync callback');
ok(entrySource.includes('type === CONTROL.SUBTREE_REQUEST'),
  'viewer wrapper contains subtree request callback seam without claiming routing');

console.log('\n--- Generated bundle ---');

ok(fs.existsSync(bundlePath), 'generated dashboard viewer bundle exists');
const bundleSource = fs.readFileSync(bundlePath, 'utf8');
ok(bundleSource.includes('FSBPhantomStreamViewer'),
  'generated bundle exposes FSBPhantomStreamViewer');
ok(bundleSource.includes('createDashboardViewer'),
  'generated bundle contains createDashboardViewer');
ok(bundleSource.includes('createViewer'),
  'generated bundle contains PhantomStream createViewer code');
ok(bundleSource.includes('mapHostPointToViewport'),
  'generated bundle exposes viewport point mapping helper');
ok(!/^\s*import\s/m.test(bundleSource),
  'generated viewer bundle has no remaining ESM import statements');

console.log('\n--- Dashboard shell loading ---');

const runtimeIndex = staticHtml.indexOf('js/dashboard-runtime-state.js');
const viewerIndex = staticHtml.indexOf('js/phantom-stream-viewer.js');
const dashboardIndex = staticHtml.indexOf('js/dashboard.js');
ok(runtimeIndex !== -1, 'static dashboard loads runtime-state script');
ok(viewerIndex !== -1, 'static dashboard loads PhantomStream viewer script');
ok(dashboardIndex !== -1, 'static dashboard loads dashboard.js');
ok(runtimeIndex < viewerIndex && viewerIndex < dashboardIndex,
  'static dashboard loads viewer after runtime-state and before dashboard.js');

ok(angularJson.includes('"glob": "phantom-stream-viewer.js"'),
  'Angular build copies phantom-stream-viewer.js from static js assets');
ok(angularJson.includes('"input": "../js"'),
  'Angular viewer asset copy uses shared showcase/js source');
ok(angularIndex.includes('assets/phantom-stream-viewer.js'),
  'Angular index loads PhantomStream viewer asset');
ok(angularIndex.indexOf('assets/dashboard-runtime-state.js') < angularIndex.indexOf('assets/phantom-stream-viewer.js'),
  'Angular index loads viewer after runtime-state');
ok(!angularDashboardTs.includes('@full-self-browsing/phantom-stream'),
  'Angular dashboard component does not import PhantomStream package directly');

console.log('\nPhantomStream dashboard viewer bundle guard: ' + passed + ' PASS / 0 FAIL');
