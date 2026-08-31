'use strict';

/**
 * Regression coverage for upload_file MCP route tab resolution.
 *
 * Run: node tests/upload-file-route.test.js
 */

const assert = require('assert');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const dispatcher = require(path.join(REPO_ROOT, 'extension', 'ws', 'mcp-tool-dispatcher.js'));

async function withUploadSpy(fn) {
  const previousUpload = globalThis.executeUploadFile;
  const calls = [];
  globalThis.executeUploadFile = async function executeUploadFile(tabId, selector, filePath, options) {
    calls.push({ tabId, selector, filePath, options });
    return {
      success: true,
      method: 'cdp_set_file_input',
      selector,
      file: path.basename(filePath)
    };
  };
  try {
    await fn(calls);
  } finally {
    if (previousUpload === undefined) delete globalThis.executeUploadFile;
    else globalThis.executeUploadFile = previousUpload;
  }
}

async function dispatch(params, tab, payloadExtras = {}) {
  return dispatcher.dispatchMcpToolRoute({
    tool: 'upload_file',
    params,
    tab,
    payload: {
      tool: 'upload_file',
      agentId: params && params.agentId,
      params: params || {},
      ...payloadExtras
    }
  });
}

(async () => {
  console.log('\n--- upload_file route tab resolution ---');

  await withUploadSpy(async (calls) => {
    const result = await dispatch({
      selector: 'input[type=file]',
      file_path: '/tmp/report.pdf',
      agentId: 'legacy:popup'
    }, { id: 7 });

    assert.strictEqual(result.success, true, 'legacy-style route succeeds with tab.id fallback');
    assert.strictEqual(calls.length, 1, 'upload handler called once');
    assert.strictEqual(calls[0].tabId, 7, 'tab.id fallback is passed to executeUploadFile');
    assert.strictEqual(calls[0].selector, 'input[type=file]', 'selector forwarded');
    assert.strictEqual(calls[0].filePath, '/tmp/report.pdf', 'file_path forwarded');
    assert.strictEqual(calls[0].options.allowManagedScreenshot, false,
      'ordinary uploads receive no managed screenshot exception');
  });

  await withUploadSpy(async (calls) => {
    const result = await dispatch({
      selector: '#upload',
      file_path: '/Users/me/.fsb/screenshots/fsb-screenshot-1-550e8400-e29b-41d4-a716-446655440000.png',
      agentId: 'legacy:popup',
      managedScreenshotAttested: true
    }, { id: 7 }, { managedScreenshotAttested: true });

    assert.strictEqual(result.success, true, 'attested managed screenshot route succeeds');
    assert.strictEqual(calls[0].options.allowManagedScreenshot, true,
      'only the private top-level bridge marker enables the managed screenshot exception');
  });

  await withUploadSpy(async (calls) => {
    await dispatch({
      selector: '#upload',
      file_path: '/Users/me/.fsb/screenshots/fsb-screenshot-1-550e8400-e29b-41d4-a716-446655440000.png',
      agentId: 'legacy:popup',
      managedScreenshotAttested: true
    }, { id: 7 });

    assert.strictEqual(calls[0].options.allowManagedScreenshot, false,
      'a marker forged inside public tool params is ignored');
  });

  await withUploadSpy(async (calls) => {
    const result = await dispatch({
      selector: '#upload',
      file_path: '/tmp/avatar.png',
      tabId: 9,
      agentId: 'agent_a'
    }, { id: 7 });

    assert.strictEqual(result.success, true, 'explicit tabId route succeeds');
    assert.strictEqual(calls.length, 1, 'upload handler called once');
    assert.strictEqual(calls[0].tabId, 9, 'params.tabId wins over tab.id');
  });

  await withUploadSpy(async (calls) => {
    const result = await dispatch({
      selector: '#upload',
      file_path: '/tmp/avatar.png',
      agentId: 'legacy:popup'
    }, null);

    assert.strictEqual(result.success, false, 'missing params.tabId and tab.id fails');
    assert.strictEqual(result.errorCode, 'mcp_route_invalid_params', 'missing target returns invalid params');
    assert.strictEqual(result.error, 'upload_file requires a resolved tab', 'error message is unchanged');
    assert.strictEqual(calls.length, 0, 'upload handler is not called without a resolved tab');
  });

  console.log('upload_file route tab resolution: PASS');
})().catch((err) => {
  console.error('upload_file route tab resolution: FAIL');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
