'use strict';

/**
 * Phase 45 / Plan 02 -- T1 port contract verifier controls.
 *
 * Run: node tests/t1-port-contract-gate.test.js
 */

const path = require('path');
const { pathToFileURL } = require('url');

const REPO_ROOT = path.resolve(__dirname, '..');
const GATE_PATH = path.join(REPO_ROOT, 'scripts', 'verify-t1-port-contract.mjs');
const CONTRACT_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 't1-port-contract.mjs');
const CATALOG_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'recipe-index.generated.js');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

(async function run() {
  console.log('--- Phase 45: T1 port verifier gate controls ---');

  const gate = await import(pathToFileURL(GATE_PATH).href);
  const contract = await import(pathToFileURL(CONTRACT_PATH).href);
  const catalog = require(CATALOG_PATH);

  check(typeof gate.validateCurrentT1PortGate === 'function', 'validateCurrentT1PortGate() is exported');
  check(typeof gate.validateWriteEvidenceRows === 'function', 'validateWriteEvidenceRows() is exported');
  check(typeof gate.validateMcpSurfaceNoPerAppTools === 'function', 'validateMcpSurfaceNoPerAppTools() is exported');

  const current = await gate.validateCurrentT1PortGate(catalog);
  check(current.failures.length === 0,
    'current catalog passes the T1 port contract gate' +
    (current.failures.length ? ': ' + current.failures.join(' | ') : ''));

  const writeFailures = gate.validateWriteEvidenceRows([{
    slug: 'phase45.synthetic_active_write',
    sideEffectClass: 'write',
    readiness: 't1-ready',
  }], []).failures;
  check(writeFailures.some(function(f) { return f.indexOf('synthetic_active_write') !== -1; }),
    'active write without UAT evidence fails the verifier');

  const mcpFailures = gate.validateMcpSurfaceNoPerAppTools(
    ['open_tab', 'github_create_issue'],
    ['github']
  ).failures;
  check(mcpFailures.some(function(f) { return f.indexOf('github_create_issue') !== -1; }),
    'app-specific MCP tool name fails');

  const sourceFailures = gate.validateHandlerRows([{
    slug: 'phase45.bad_source',
    app: 'github',
    proof: 'handler',
    runtimeOrigin: 'https://github.com',
    sideEffectClass: 'read',
  }], {
    sourceByApp: { github: 'chrome.tabs.query({});' },
    loadHandlerEntry: function() {
      return {
        origin: 'https://github.com',
        sideEffectClass: 'read',
        async handle() { return { success: true }; },
      };
    },
  }).failures;
  check(sourceFailures.some(function(f) { return f.indexOf('chrome.scripting/chrome.tabs') !== -1; }),
    'handler source bypass fails through the verifier path');

  const guardedFailures = await contract.validateGuardedWriteRows([{
    slug: 'phase45.synthetic_guarded',
    sideEffectClass: 'write',
    runtimeOrigin: 'https://example.com',
  }], {
    loadHandler: function() {
      return {
        async handle(args, ctx) {
          await ctx.executeBoundSpec({
            url: 'https://example.com/api/mutate',
            method: 'POST',
            origin: 'https://example.com',
          }, ctx.tabId);
          return {
            success: false,
            code: contract.FALLBACK_CODE,
            errorCode: contract.FALLBACK_CODE,
            error: contract.FALLBACK_CODE,
            fellBackToDom: true,
          };
        },
      };
    },
  });
  check(guardedFailures.failures.some(function(f) { return f.indexOf('called executeBoundSpec') !== -1; }),
    'mutation-firing guarded write fails even when it returns the fallback code');

  console.log('\nt1-port-contract-gate: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('  FAIL: t1-port-contract-gate threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
