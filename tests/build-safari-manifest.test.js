/**
 * Unit tests for transformManifest() in scripts/build-safari.mjs
 *
 * The Safari manifest transform is allowlist-driven on purpose: an
 * unclassified permission must be a HARD ERROR, so that adding a permission to
 * extension/manifest.json without deciding what Safari should do breaks the
 * Safari build immediately rather than silently shipping a permission Safari
 * ignores. The negative case at the bottom is the point of this file.
 *
 * Run: node tests/build-safari-manifest.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}
function passAssertEqual(a, b, msg) { passAssert(a === b, msg + ' (got ' + JSON.stringify(a) + ')'); }

(async function run() {
  const mod = await import('../scripts/build-safari.mjs');
  const { transformManifest } = mod;
  const SRC = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'));

  console.log('\n=== 1. blocked permissions are stripped ===');
  const out = transformManifest(SRC);
  for (const p of ['sidePanel', 'debugger', 'offscreen', 'system.memory']) {
    passAssert(!out.permissions.includes(p), `permission stripped: ${p}`);
  }

  console.log('\n=== 2. required permissions survive / are added ===');
  for (const p of ['activeTab', 'scripting', 'storage', 'unlimitedStorage', 'tabs', 'windows', 'webNavigation', 'alarms', 'clipboardWrite']) {
    passAssert(out.permissions.includes(p), `permission kept: ${p}`);
  }
  passAssert(out.permissions.includes('nativeMessaging'), 'nativeMessaging added');
  passAssert(!SRC.permissions.includes('nativeMessaging'),
    'nativeMessaging is NOT in the Chrome manifest (it would add a scary CWS install prompt)');

  console.log('\n=== 3. side_panel key removed ===');
  passAssertEqual(out.side_panel, undefined, 'side_panel key deleted');
  passAssert(!!SRC.side_panel, 'source manifest still has side_panel (Chrome untouched)');

  console.log('\n=== 4. no action.default_popup ===');
  passAssertEqual(out.action && out.action.default_popup, undefined,
    'no default_popup: Safari only fires action.onClicked when none is declared');

  console.log('\n=== 5. CSP names the MCP bridge ===');
  const csp = out.content_security_policy && out.content_security_policy.extension_pages;
  passAssert(typeof csp === 'string' && csp.includes('ws://localhost:7225'),
    'extension_pages CSP allows ws://localhost:7225');
  passAssert(csp.includes("script-src 'self'"), "CSP keeps script-src 'self'");
  // Naming connect-src at all only NARROWS what Chrome allows by default, and
  // the local-provider paths (lmstudioBaseUrl, customEndpoint) dial plain HTTP.
  passAssert(csp.includes('http:'), 'CSP still allows http: so local LLM providers keep working');
  // Must be the STANDALONE token: a bare includes('ws:') is already satisfied by
  // the ws://localhost:7225 entry and would prove nothing. ws-client.js derives
  // the dashboard socket from the user-editable serverUrl via
  // .replace(/^http/, 'ws'), so a self-hosted dashboard on http://host:port
  // needs plain ws: -- naming only the MCP bridge URL would refuse it.
  passAssert(csp.split(/[\s;]+/).includes('ws:'),
    'CSP allows plain ws: so a self-hosted dashboard over http:// keeps working');

  console.log('\n=== 6. Safari minimum version ===');
  passAssertEqual(out.browser_specific_settings.safari.strict_min_version, '18.0',
    'strict_min_version 18.0 (content_scripts.world:"MAIN" floor)');

  console.log('\n=== 7. offscreen resources dropped from web_accessible_resources ===');
  const war = (out.web_accessible_resources || []).flatMap((w) => w.resources || []);
  passAssert(!war.some((r) => r.startsWith('offscreen/')), 'no offscreen/ resource advertised');
  passAssert(war.includes('test-data/**/*'),
    'test-data WAR entry KEPT (utils/token-comparator.js fetches it at runtime)');

  console.log('\n=== 8. content_scripts pass through byte-identical ===');
  passAssertEqual(JSON.stringify(out.content_scripts), JSON.stringify(SRC.content_scripts),
    'content_scripts unchanged (canvas-interceptor MAIN world at document_start)');
  for (const k of ['manifest_version', 'name', 'version', 'description', 'homepage_url']) {
    passAssertEqual(JSON.stringify(out[k]), JSON.stringify(SRC[k]), `${k} unchanged`);
  }

  console.log('\n=== 9. transform does not mutate its input ===');
  const before = JSON.stringify(SRC);
  transformManifest(SRC);
  passAssertEqual(JSON.stringify(SRC), before, 'input manifest object is not mutated');

  console.log('\n=== 10. NEGATIVE: an unclassified permission is a hard error ===');
  let threw = null;
  try {
    transformManifest({ ...SRC, permissions: [...SRC.permissions, 'bookmarks'] });
  } catch (e) { threw = e; }
  passAssert(threw !== null, 'unknown permission throws');
  passAssert(threw && /unclassified permission/i.test(threw.message) && threw.message.includes('bookmarks'),
    'error names the offending permission');

  console.log('\n---');
  console.log('passed:', passed, 'failed:', failed);
  if (failed > 0) process.exit(1);
})().catch((e) => { console.error('TEST HARNESS ERROR:', e); process.exit(1); });
