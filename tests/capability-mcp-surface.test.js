'use strict';

/**
 * Phase 28 Plan 04 (SURF-03 / SURF-05 / SURF-02) -- the INV-01 surface proof.
 *
 * A single file that proves, adjacent to one another, the four facts that gate
 * the lean two-tool capability surface (CONTEXT D-15 / D-10):
 *
 *   (a) BOTH tools on the wire (SURF-03): the BUILT MCP runtime registers
 *       search_capabilities AND invoke_capability via server.tool(). We
 *       enumerate server._registeredTools from a real createRuntime() instance
 *       -- the true wire proof, exactly the runtime probe Plan 02 used to show
 *       65 tools on the wire (63 + the 2 new). A defensive source-level check on
 *       capabilities.ts + runtime.ts backs the enumeration.
 *
 *   (b) Registry hash UNCHANGED (SURF-03 / INV-01): the two new tools register
 *       OUTSIDE TOOL_REGISTRY, so the frozen non-trigger registry hash
 *       (EXPECTED_NON_TRIGGER_REGISTRY_HASH, the value tool-definitions-parity
 *       locks) must NOT have moved. We recompute registryHash(nonTriggerTools)
 *       over the built mcp/ai/tool-definitions.cjs with the same stable()
 *       stringify and assert equality. tool-definitions-parity.test.js already
 *       proves this; re-asserting it HERE makes this one file the INV-01 proof
 *       for the phase (the two new tools on the wire AND the registry unmoved).
 *
 *   (c) Queue split (SURF-05): the built TaskQueue's readOnlyTools Set CONTAINS
 *       'search_capabilities' (bypasses the mutation queue) and does NOT contain
 *       'invoke_capability' (serialized). We probe the Set directly AND prove the
 *       behavior: a read-only search enqueued behind a slow in-flight invoke
 *       completes FIRST (bypass), never parks behind the mutation.
 *
 *   (d) RECIPE_NOT_FOUND verbatim (SURF-02): an unknown slug yields the typed
 *       RECIPE_NOT_FOUND error, and the built errors module surfaces RECIPE_.+
 *       verbatim (the /^RECIPE_.+$/ passthrough) instead of collapsing it to the
 *       generic action_rejected. We assert mapFSBError on the dual-field
 *       RECIPE_NOT_FOUND shape carries the code verbatim and is NOT collapsed.
 *
 * The two new tools must NEVER be added to TOOL_REGISTRY -- that would move the
 * hash and red BOTH this test and tool-definitions-parity.test.js.
 *
 * Zero-framework FSB convention (tests/capability-interpreter.test.js +
 * tests/mcp-recovery-messaging.test.js): passed/failed counters, check(cond,msg),
 * process.exit(failed>0?1:0). The BUILT mcp modules are dynamic-imported (ESM);
 * npm --prefix mcp run build runs earlier in the scripts.test chain. Run
 * standalone with: npm --prefix mcp run build && node tests/capability-mcp-surface.test.js
 *
 * Run: node tests/capability-mcp-surface.test.js
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const REPO_ROOT = path.resolve(__dirname, '..');

// The INV-01 lock value -- reused verbatim from tests/tool-definitions-parity.test.js:52.
// The two out-of-registry capability tools must NOT have moved this.
const EXPECTED_NON_TRIGGER_REGISTRY_HASH =
  '6354d78836bc8927f55af4562dec099f614ebbe034d018c163d7b8b2e5c6b60d';

// The four trigger tools sit IN TOOL_REGISTRY but are excluded from the frozen
// non-trigger baseline (mirrors tool-definitions-parity.test.js:35).
const TRIGGER_TOOL_NAMES = ['trigger', 'stop_trigger', 'get_trigger_status', 'list_triggers'];

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

// Recursive key-sort stringify + sha256 -- copied verbatim from
// tests/tool-definitions-parity.test.js:54-69 so the hash is computed
// identically to the lock.
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce(function (out, key) {
      out[key] = stable(value[key]);
      return out;
    }, {});
  }
  return value;
}

function registryHash(tools) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(tools.map(stable)))
    .digest('hex');
}

async function run() {
  // -------------------------------------------------------------------------
  // (a) BOTH tools on the wire (SURF-03) -- the true wire proof.
  // Enumerate the tools a real built-runtime instance registers, the same way
  // Plan 02's runtime probe did (server._registeredTools is keyed by tool name).
  // -------------------------------------------------------------------------
  console.log('\n--- (a) both capability tools on the wire (SURF-03) ---');

  const runtimeUrl = pathToFileURL(path.join(REPO_ROOT, 'mcp', 'build', 'runtime.js')).href;
  const { createRuntime } = await import(runtimeUrl);
  const { server } = createRuntime();

  const wireToolNames = Object.keys(server._registeredTools || {});
  check(wireToolNames.length > 0, 'built runtime registers tools on the wire (got ' + wireToolNames.length + ')');
  check(
    wireToolNames.indexOf('search_capabilities') !== -1,
    'search_capabilities is registered on the wire (server.tool())'
  );
  check(
    wireToolNames.indexOf('invoke_capability') !== -1,
    'invoke_capability is registered on the wire (server.tool())'
  );

  // Defensive source-level backstop: both tools register via server.tool() in
  // capabilities.ts AND registerCapabilityTools is wired into runtime.ts.
  const capSrc = fs.readFileSync(
    path.join(REPO_ROOT, 'mcp', 'src', 'tools', 'capabilities.ts'), 'utf8'
  );
  check(
    capSrc.indexOf("server.tool(\n        'search_capabilities'") !== -1 ||
    capSrc.indexOf("'search_capabilities'") !== -1,
    'capabilities.ts source registers search_capabilities'
  );
  check(
    capSrc.indexOf("'invoke_capability'") !== -1,
    'capabilities.ts source registers invoke_capability'
  );
  const runtimeSrc = fs.readFileSync(
    path.join(REPO_ROOT, 'mcp', 'src', 'runtime.ts'), 'utf8'
  );
  check(
    /registerCapabilityTools\s*\(/.test(runtimeSrc),
    'runtime.ts calls registerCapabilityTools'
  );

  // -------------------------------------------------------------------------
  // (b) Registry hash UNCHANGED (SURF-03 / INV-01).
  // The two new tools are out-of-registry, so the frozen non-trigger hash must
  // be byte-identical. Recompute it over the BUILT tool-definitions.cjs.
  // -------------------------------------------------------------------------
  console.log('\n--- (b) tool-definitions-parity registry hash UNCHANGED (INV-01) ---');

  const td = require(path.join(REPO_ROOT, 'mcp', 'ai', 'tool-definitions.cjs'));
  const nonTriggerTools = td.TOOL_REGISTRY.filter(function (tool) {
    return TRIGGER_TOOL_NAMES.indexOf(tool.name) < 0;
  });
  const actualHash = registryHash(nonTriggerTools);
  check(
    actualHash === EXPECTED_NON_TRIGGER_REGISTRY_HASH,
    'EXPECTED_NON_TRIGGER_REGISTRY_HASH is unchanged -- the two new tools are out-of-registry (INV-01)'
  );
  if (actualHash !== EXPECTED_NON_TRIGGER_REGISTRY_HASH) {
    console.error('  DIAG: expected ' + EXPECTED_NON_TRIGGER_REGISTRY_HASH);
    console.error('  DIAG: actual   ' + actualHash);
    console.error('  DIAG: a moved hash means a capability tool leaked into TOOL_REGISTRY');
  }
  // Belt-and-braces: neither new tool name is in TOOL_REGISTRY at all.
  const registryNames = td.TOOL_REGISTRY.map(function (t) { return t.name; });
  check(
    registryNames.indexOf('search_capabilities') === -1,
    'search_capabilities is NOT in TOOL_REGISTRY (must stay out-of-registry)'
  );
  check(
    registryNames.indexOf('invoke_capability') === -1,
    'invoke_capability is NOT in TOOL_REGISTRY (must stay out-of-registry)'
  );

  // -------------------------------------------------------------------------
  // (c) Queue split (SURF-05): search bypasses, invoke serializes.
  // -------------------------------------------------------------------------
  console.log('\n--- (c) read-only/queued split (SURF-05) ---');

  const queueUrl = pathToFileURL(path.join(REPO_ROOT, 'mcp', 'build', 'queue.js')).href;
  const { TaskQueue } = await import(queueUrl);
  const queue = new TaskQueue();

  // Direct Set probe (the field is `private` in TS but a plain instance field
  // on the compiled JS -- the single point of truth for the split).
  const readOnlyTools = queue.readOnlyTools;
  check(readOnlyTools instanceof Set, 'TaskQueue exposes a readOnlyTools Set');
  check(
    readOnlyTools.has('search_capabilities'),
    "readOnlyTools CONTAINS 'search_capabilities' (bypasses the mutation queue)"
  );
  check(
    !readOnlyTools.has('invoke_capability'),
    "readOnlyTools does NOT contain 'invoke_capability' (serialized through the queue)"
  );

  // Source-level backstop on the queue source (defensive, in case the build
  // ever diverges): the name is in the Set literal; invoke_capability is absent.
  const queueSrc = fs.readFileSync(path.join(REPO_ROOT, 'mcp', 'src', 'queue.ts'), 'utf8');
  check(
    /['"]search_capabilities['"]/.test(queueSrc),
    "queue.ts source lists 'search_capabilities' in the readOnlyTools Set"
  );
  check(
    queueSrc.indexOf('invoke_capability') === -1,
    'queue.ts source does NOT mention invoke_capability (it must serialize)'
  );

  // Behavioral proof: a read-only search enqueued AFTER a slow in-flight invoke
  // mutation must complete FIRST -- discovery never parks behind a mutation.
  const order = [];
  const slowInvoke = queue.enqueue('invoke_capability', async function () {
    await new Promise(function (r) { setTimeout(r, 40); });
    order.push('invoke');
    return 'invoke-result';
  });
  const fastSearch = queue.enqueue('search_capabilities', async function () {
    order.push('search');
    return 'search-result';
  });
  await Promise.all([slowInvoke, fastSearch]);
  check(
    order[0] === 'search' && order[1] === 'invoke',
    'search_capabilities bypasses and completes before a slow in-flight invoke_capability (queue split holds)'
  );

  // -------------------------------------------------------------------------
  // (d) RECIPE_NOT_FOUND verbatim (SURF-02).
  // An unknown slug surfaces the typed code verbatim via the built errors
  // module's /^RECIPE_.+$/ passthrough -- NOT collapsed to action_rejected.
  // -------------------------------------------------------------------------
  console.log('\n--- (d) unknown slug yields RECIPE_NOT_FOUND verbatim (SURF-02) ---');

  const errorsUrl = pathToFileURL(path.join(REPO_ROOT, 'mcp', 'build', 'errors.js')).href;
  const { mapFSBError } = await import(errorsUrl);

  // The dual-field shape the dispatcher returns for an unknown slug (Plan 03):
  // { success:false, code, errorCode, error } all 'RECIPE_NOT_FOUND' + slug.
  const unknownSlugResult = {
    success: false,
    code: 'RECIPE_NOT_FOUND',
    errorCode: 'RECIPE_NOT_FOUND',
    error: 'RECIPE_NOT_FOUND',
    slug: 'no.such.capability',
  };
  const mapped = mapFSBError(unknownSlugResult);
  const mappedText = (mapped && mapped.content && mapped.content[0] && mapped.content[0].text) || '';
  check(
    mappedText.indexOf('RECIPE_NOT_FOUND') !== -1,
    'mapFSBError surfaces RECIPE_NOT_FOUND verbatim for an unknown slug'
  );
  check(
    mappedText.indexOf('action_rejected') === -1,
    'RECIPE_NOT_FOUND is NOT collapsed to the generic action_rejected (the RECIPE_.+ passthrough)'
  );
  check(
    mapped && mapped.isError === true,
    'an unknown-slug RECIPE_NOT_FOUND maps to an error result (isError:true)'
  );

  // A sibling RECIPE_* code from interpretRecipe surfaces through the same arm.
  const interpretFailure = mapFSBError({
    success: false,
    code: 'RECIPE_SCHEMA_INVALID',
    errorCode: 'RECIPE_SCHEMA_INVALID',
    error: 'RECIPE_SCHEMA_INVALID',
  });
  const interpretText =
    (interpretFailure && interpretFailure.content && interpretFailure.content[0] &&
      interpretFailure.content[0].text) || '';
  check(
    interpretText.indexOf('RECIPE_SCHEMA_INVALID') !== -1,
    'a typed RECIPE_* interpret failure also surfaces verbatim (same passthrough arm)'
  );

  console.log('\ncapability-mcp-surface: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(function (err) {
  failed++;
  console.error('  FAIL: test harness threw:', err && err.stack ? err.stack : err);
  console.log('\ncapability-mcp-surface: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(1);
});
