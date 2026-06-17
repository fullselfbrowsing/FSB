'use strict';

/**
 * Phase 22 Plan 03 -- PhantomStream capture side-channel and diagnostics guard.
 *
 * Verifies overlay, dialog, scroll/watchdog, and stale-flush diagnostics remain
 * wired through the package-backed capture adapter and existing background
 * forwarding path.
 *
 * Run: node tests/phantom-stream-sidechannels.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const domStreamSource = fs.readFileSync(path.join(repoRoot, 'extension', 'content', 'dom-stream.js'), 'utf8');
const bundleSource = fs.readFileSync(path.join(repoRoot, 'extension', 'content', 'phantom-stream-capture.js'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(repoRoot, 'extension', 'background.js'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(repoRoot, 'showcase', 'js', 'dashboard.js'), 'utf8');
const angularSource = fs.readFileSync(
  path.join(repoRoot, 'showcase', 'angular', 'src', 'app', 'pages', 'dashboard', 'dashboard-page.component.ts'),
  'utf8'
);

let passed = 0;
function ok(condition, message) {
  assert.equal(Boolean(condition), true, message);
  passed += 1;
  console.log('  PASS:', message);
}

console.log('\n--- PhantomStream capture side channels ---');

ok(domStreamSource.includes('overlayProvider: readOverlayState'),
  'dom-stream adapter supplies FSB overlay provider to PhantomStream capture');
ok(domStreamSource.includes("case 'domStreamRequestOverlay'"),
  'dom-stream adapter preserves domStreamRequestOverlay control message');
ok(domStreamSource.includes('sendOverlayNow();'),
  'domStreamRequestOverlay forces an overlay send');
ok(domStreamSource.includes("action: 'domStreamOverlay'"),
  'dom-stream adapter forwards overlay payloads through existing background action');
ok(domStreamSource.includes("action: 'domStreamDialog'"),
  'dom-stream adapter forwards dialog payloads through existing background action');
ok(domStreamSource.includes("action: 'domStreamScroll'"),
  'dom-stream adapter forwards scroll side-channel through existing background action');

ok(bundleSource.includes('function setupDialogRelay()'),
  'PhantomStream capture bundle contains dialog relay setup');
ok(/document\.addEventListener\(["']fsb-dialog["']/.test(bundleSource),
  'PhantomStream capture listens for dialog open events');
ok(/document\.addEventListener\(["']fsb-dialog-dismiss["']/.test(bundleSource),
  'PhantomStream capture listens for dialog dismiss events');
ok(bundleSource.includes('function broadcastOverlayState'),
  'PhantomStream capture bundle owns overlay broadcast cadence');
ok(bundleSource.includes('OVERLAY_THROTTLE_MS = 500'),
  'PhantomStream capture bundle keeps 500ms overlay throttle');

console.log('\n--- Capture diagnostics and watchdogs ---');

ok(domStreamSource.includes('lastStaleFlushCount = next.staleFlushCount'),
  'dom-stream adapter records staleFlushCount from package mutation payloads');
ok(domStreamSource.includes('getStaleFlushCount: function()'),
  'dom-stream adapter exposes getStaleFlushCount debug accessor');
ok(domStreamSource.includes('staleFlushCount: typeof mutationPayload.staleFlushCount'),
  'dom-stream adapter forwards staleFlushCount at background action level');
ok(bundleSource.includes('MUTATION_STALE_THRESHOLD_MS = 5e3'),
  'PhantomStream capture bundle keeps 5s stale mutation threshold');
ok(bundleSource.includes('WATCHDOG_TICK_MS = 500'),
  'PhantomStream capture bundle keeps 500ms watchdog tick');
ok(bundleSource.includes('staleFlushCount++'),
  'PhantomStream capture bundle increments staleFlushCount on watchdog rescue');
ok(bundleSource.includes('clearTimeout(watchdogTimer)'),
  'PhantomStream capture bundle clears watchdog on stop');

ok(backgroundSource.includes('_lastDomStreamStaleFlushCount = request.staleFlushCount'),
  'background caches staleFlushCount from domStreamMutations');
ok(backgroundSource.includes("alarmsApi.create('fsb-domstream-watchdog', { periodInMinutes: 1 })"),
  'background arms fsb-domstream-watchdog on mutation activity');
ok(backgroundSource.includes("case 'domStreamOverlay'"),
  'background preserves domStreamOverlay forwarding case');
ok(backgroundSource.includes("case 'domStreamDialog'"),
  'background preserves domStreamDialog forwarding case');
ok(backgroundSource.includes("case 'domStreamScroll'"),
  'background preserves domStreamScroll forwarding case');

console.log('\n--- Dashboard side-channel consumers ---');

ok(dashboardSource.includes("if (msg.type === 'ext:dom-overlay')"),
  'static dashboard consumes ext:dom-overlay');
ok(dashboardSource.includes("if (msg.type === 'ext:dom-dialog')"),
  'static dashboard consumes ext:dom-dialog');
ok(dashboardSource.includes("if (msg.type === 'ext:dom-scroll')"),
  'static dashboard consumes ext:dom-scroll');
ok(angularSource.includes("if (msg.type === 'ext:dom-overlay')"),
  'Angular dashboard consumes ext:dom-overlay');
ok(angularSource.includes("if (msg.type === 'ext:dom-dialog')"),
  'Angular dashboard consumes ext:dom-dialog');
ok(angularSource.includes("if (msg.type === 'ext:dom-scroll')"),
  'Angular dashboard consumes ext:dom-scroll');

console.log('\nPhantomStream side-channel/diagnostic guard: ' + passed + ' PASS / 0 FAIL');
