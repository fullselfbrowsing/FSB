'use strict';

const assert = require('node:assert/strict');
const {
  createToolHarness,
  loadAgentScope,
  loadBuildModule,
} = require('./mcp-smoke-harness.js');

const VISUAL_FIELDS = { visual_reason: 'Upload captured screenshot', client: 'Codex' };

async function invokeWithAttestor(attestManagedPath, params = {}) {
  const manualModule = await loadBuildModule('tools/manual.js');
  const agentScope = await loadAgentScope();
  const harness = createToolHarness({
    bridgeResponses: {
      'mcp:execute-action': { success: true },
    },
  });
  manualModule.registerManualTools(
    harness.server,
    harness.bridge,
    harness.queue,
    agentScope,
    { screenshotAttestor: { attestManagedPath } },
  );
  const upload = harness.getHandler('upload_file');
  assert.equal(typeof upload, 'function');
  await upload({
    selector: 'input[type=file]',
    file_path: '/Users/me/.fsb/screenshots/source.png',
    ...VISUAL_FIELDS,
    ...params,
  });
  return harness.bridgeCalls.find((call) => call.message.type === 'mcp:execute-action')?.message.payload;
}

(async () => {
  const canonicalPath = '/Users/me/.fsb/screenshots/fsb-screenshot-1-550e8400-e29b-41d4-a716-446655440000.png';
  const attested = await invokeWithAttestor(async () => canonicalPath);
  assert.equal(attested.params.file_path, canonicalPath);
  assert.equal(attested.managedScreenshotAttested, true);

  const rejected = await invokeWithAttestor(async () => null, {
    managedScreenshotAttested: true,
  });
  assert.equal(rejected.params.file_path, '/Users/me/.fsb/screenshots/source.png');
  assert.equal(Object.hasOwn(rejected.params, 'managedScreenshotAttested'), false);
  assert.equal(Object.hasOwn(rejected, 'managedScreenshotAttested'), false);

  const failed = await invokeWithAttestor(async () => {
    throw new Error('filesystem unavailable');
  });
  assert.equal(failed.params.file_path, '/Users/me/.fsb/screenshots/source.png');
  assert.equal(Object.hasOwn(failed, 'managedScreenshotAttested'), false);

  console.log('mcp-managed-screenshot-attestation.test.js: PASS');
})().catch((error) => {
  console.error('mcp-managed-screenshot-attestation.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
