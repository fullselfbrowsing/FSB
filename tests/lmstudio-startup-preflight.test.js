'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const backgroundSource = fs.readFileSync(
  path.join(__dirname, '..', 'extension', 'background.js'),
  'utf8'
);

function sliceFunction(startMarker, endMarker) {
  const start = backgroundSource.indexOf(startMarker);
  const end = backgroundSource.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, 'function markers exist for ' + startMarker);
  return backgroundSource.slice(start, end);
}

function makePreflightHarness(result) {
  const storageWrites = [];
  let discoveryCalls = 0;
  const context = {
    console,
    chrome: {
      storage: {
        local: {
          set: async (patch) => { storageWrites.push(patch); }
        }
      }
    },
    automationLogger: { info: () => {} }
  };
  context.globalThis = context;
  context.FSBModelDiscovery = {
    discoverModels: async (provider, credential, options) => {
      discoveryCalls++;
      assert.strictEqual(provider, 'lmstudio');
      assert.strictEqual(credential, '');
      assert.strictEqual(options.baseUrl, 'http://localhost:1234');
      return result;
    }
  };
  vm.runInNewContext(
    sliceFunction(
      'async function fsbResolveLmStudioModelForStart(providerConfig) {',
      'async function fsbReadAuthoritativeProviderEvidence'
    ),
    context
  );
  return {
    resolve: context.fsbResolveLmStudioModelForStart,
    storageWrites,
    get discoveryCalls() { return discoveryCalls; }
  };
}

(async function run() {
  const baseConfig = {
    providerKind: 'api',
    modelProvider: 'lmstudio',
    modelName: '',
    lmstudioBaseUrl: 'http://localhost:1234'
  };

  const one = makePreflightHarness({
    ok: true,
    models: [{ id: 'qwen/qwen3.6-27b' }]
  });
  const migrated = await one.resolve(baseConfig);
  assert.strictEqual(migrated.modelName, 'qwen/qwen3.6-27b', 'one compatible model is auto-selected');
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(one.storageWrites)),
    [{ modelName: 'qwen/qwen3.6-27b' }],
    'auto-selected model is persisted before startup continues'
  );

  const multiple = makePreflightHarness({
    ok: true,
    models: [{ id: 'qwen/a' }, { id: 'qwen/b' }]
  });
  await assert.rejects(
    () => multiple.resolve(baseConfig),
    /Multiple LM Studio chat models are loaded/,
    'multiple compatible models require explicit user selection'
  );
  assert.strictEqual(multiple.storageWrites.length, 0, 'ambiguous discovery does not mutate storage');

  const unavailable = makePreflightHarness({
    ok: false,
    reason: 'network-failed',
    message: 'connection refused'
  });
  await assert.rejects(
    () => unavailable.resolve(baseConfig),
    /LM Studio is not ready: connection refused/,
    'offline LM Studio fails with an actionable pre-session error'
  );

  const configured = makePreflightHarness({ ok: false });
  const unchanged = await configured.resolve({ ...baseConfig, modelName: 'qwen/qwen3.6-27b' });
  assert.strictEqual(unchanged.modelName, 'qwen/qwen3.6-27b', 'configured model passes through unchanged');
  assert.strictEqual(configured.discoveryCalls, 0, 'configured model does not trigger startup discovery');

  const handlerStart = backgroundSource.indexOf('async function handleStartAutomation(request, sender, sendResponse) {');
  const handlerEnd = backgroundSource.indexOf('\nasync function executeAutomationTask', handlerStart);
  const handler = backgroundSource.slice(handlerStart, handlerEnd);
  assert(
    handler.indexOf('fsbResolveLmStudioModelForStart(authoritativeProvider)')
      < handler.indexOf('// Check for existing conversation session'),
    'LM Studio preflight runs before conversation/session mutation'
  );
  assert(
    handler.indexOf('fsbResolveLmStudioModelForStart(authoritativeProvider)')
      < handler.indexOf('sendResponse({\n      success: true'),
    'LM Studio preflight runs before the success response'
  );

  const connectionHandler = sliceFunction("case 'lattice-test-connection': {", '\n    default:');
  assert(connectionHandler.includes('errorKind:'), 'connection diagnostics record a safe error classification');
  assert(!connectionHandler.includes('error: String(err && err.message'), 'connection diagnostics do not log provider response text');

  const summaryContext = {
    console,
    UniversalProvider: function () { throw new Error('local title must not instantiate provider'); },
    automationLogger: { debug: () => {} }
  };
  vm.runInNewContext(
    sliceFunction('async function summarizeTask(taskText, settings) {', '/**\n * PageLoadWatcher'),
    summaryContext
  );
  const title = await summaryContext.summarizeTask(
    'Go to LinkedIn and summarize all of my unread messages in a concise report please',
    { modelProvider: 'lmstudio' }
  );
  assert(title.length <= 60 && title.endsWith('...'), 'LM Studio task title is deterministic and capped at 60 characters');

  console.log('PASS lmstudio-startup-preflight.test.js');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
