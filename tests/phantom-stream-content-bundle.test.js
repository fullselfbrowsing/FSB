'use strict';

/**
 * Phase 22 capture bundle seam.
 *
 * Verifies the ESM PhantomStream capture package is bundled for classic
 * content-script injection before content/dom-stream.js consumes it.
 *
 * Run: node tests/phantom-stream-content-bundle.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const esbuildConfig = fs.readFileSync(path.join(repoRoot, 'esbuild.config.js'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(repoRoot, 'extension', 'background.js'), 'utf8');
const entrySource = fs.readFileSync(path.join(repoRoot, 'extension', 'content', 'phantom-stream-capture-entry.js'), 'utf8');
const bundlePath = path.join(repoRoot, 'extension', 'content', 'phantom-stream-capture.js');

let passed = 0;
function ok(condition, message) {
  assert.equal(Boolean(condition), true, message);
  passed += 1;
  console.log('  PASS:', message);
}

console.log('\n--- PhantomStream content bundle seam ---');

ok(esbuildConfig.includes("name: 'content-phantom-stream-capture'"),
  'esbuild has content-phantom-stream-capture entry');
ok(esbuildConfig.includes("outfile: path.join(SRC_ROOT, 'content', 'phantom-stream-capture.js')"),
  'esbuild emits extension/content/phantom-stream-capture.js');
ok(entrySource.includes("from '@full-self-browsing/phantom-stream/capture'"),
  'bundle entry imports PhantomStream capture package');
ok(entrySource.includes('globalThis.FSBPhantomStreamCapture'),
  'bundle entry exposes globalThis.FSBPhantomStreamCapture');
ok(fs.existsSync(bundlePath), 'generated PhantomStream content bundle exists');

const bundleSource = fs.readFileSync(bundlePath, 'utf8');
ok(bundleSource.includes('FSBPhantomStreamCapture'),
  'generated bundle exposes FSBPhantomStreamCapture');
ok(bundleSource.includes('createCapture'),
  'generated bundle contains createCapture symbol');
ok(!/\bimport\s+/.test(bundleSource),
  'generated content bundle has no remaining ESM import statements');

const bundleIndex = backgroundSource.indexOf("'content/phantom-stream-capture.js'");
const streamIndex = backgroundSource.indexOf("'content/dom-stream.js'");
ok(bundleIndex !== -1, 'CONTENT_SCRIPT_FILES injects PhantomStream capture bundle');
ok(streamIndex !== -1, 'CONTENT_SCRIPT_FILES injects content/dom-stream.js');
ok(bundleIndex < streamIndex, 'PhantomStream capture bundle is injected before dom-stream.js');

console.log('\nPhantomStream content bundle seam: ' + passed + ' PASS / 0 FAIL');
