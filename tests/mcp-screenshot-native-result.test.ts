import test from 'node:test';
import assert from 'node:assert/strict';
import { registerScreenshotTools } from '../mcp/src/tools/screenshots.ts';
import { screenshotStore } from '../mcp/src/screenshot-store.ts';

test('MCP screenshot handler returns native image content and managed-path metadata', async () => {
  let handler: ((params: Record<string, unknown>) => Promise<Record<string, unknown>>) | null = null;
  let sentMessage: Record<string, unknown> | null = null;
  const server = {
    tool(name: string, _description: string, _shape: unknown, registered: typeof handler) {
      assert.equal(name, 'capture_screenshot');
      handler = registered;
    },
  };
  const bridge = {
    isConnected: true,
    async sendAndWait(message: Record<string, unknown>) {
      sentMessage = message;
      return {
        success: true,
        image_data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
        mime_type: 'image/png',
        metadata: {
          capture_id: 'capture-native',
          output_width: 1,
          output_height: 1,
          byte_length: 24,
          delivery_status: 'captured',
          warnings: [],
        },
      };
    },
  };
  const queue = {
    async enqueue(_name: string, execute: () => Promise<unknown>) { return execute(); },
  };
  const agentScope = {
    async ensure() { return 'agent-native'; },
    ownershipTokenFor() { return 'token-native'; },
    currentOwnershipToken() { return 'token-native'; },
  };
  const originalWrite = screenshotStore.write;
  screenshotStore.write = async () => ({ filePath: '/private/fsb-screenshot-native.png' });

  try {
    registerScreenshotTools(
      server as never,
      bridge as never,
      queue as never,
      agentScope as never,
    );
    assert.ok(handler);
    const result = await handler!({ mode: 'viewport', tab_id: 7 });
    const content = result.content as Array<Record<string, unknown>>;
    assert.equal(content[0].type, 'text');
    assert.equal(content[1].type, 'image');
    assert.equal(content[1].data, 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB');
    assert.equal(content[1].mimeType, 'image/png');
    assert.equal(String(content[0].text).includes('iVBORw0KGgo'), false);
    const metadata = JSON.parse(String(content[0].text));
    assert.equal(metadata.file_path, '/private/fsb-screenshot-native.png');
    assert.equal(metadata.delivery_status, 'mcp_image_and_file_delivered');

    assert.equal(sentMessage?.type, 'mcp:capture-screenshot');
    const payload = sentMessage?.payload as Record<string, unknown>;
    assert.equal(payload.mode, 'viewport');
    assert.equal(payload.tab_id, 7);
    assert.equal(payload.agentId, 'agent-native');
    assert.equal(payload.ownershipToken, 'token-native');
    assert.equal(payload.visualSession, undefined);

    screenshotStore.write = async () => ({
      filePath: null,
      warning: { code: 'SCREENSHOT_FILE_WRITE_FAILED', message: 'simulated read-only directory' },
    });
    const imageOnlyResult = await handler!({ mode: 'viewport' });
    const imageOnlyContent = imageOnlyResult.content as Array<Record<string, unknown>>;
    assert.equal(imageOnlyContent[1].type, 'image');
    assert.equal(imageOnlyContent[1].data, 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB');
    const imageOnlyMetadata = JSON.parse(String(imageOnlyContent[0].text));
    assert.equal(imageOnlyMetadata.file_path, null);
    assert.equal(imageOnlyMetadata.delivery_status, 'mcp_image_delivered');
    assert.equal(imageOnlyMetadata.warnings.at(-1).code, 'SCREENSHOT_FILE_WRITE_FAILED');
  } finally {
    screenshotStore.write = originalWrite;
  }
});

test('MCP screenshot handler preserves typed retryable capture errors', async () => {
  let handler: ((params: Record<string, unknown>) => Promise<Record<string, unknown>>) | null = null;
  const server = {
    tool(_name: string, _description: string, _shape: unknown, registered: typeof handler) {
      handler = registered;
    },
  };
  const bridge = {
    isConnected: true,
    async sendAndWait() {
      return {
        success: false,
        code: 'SCREENSHOT_DEBUGGER_BUSY',
        error: 'Another debugger owns this tab.',
        retryable: true,
      };
    },
  };
  const queue = {
    async enqueue(_name: string, execute: () => Promise<unknown>) { return execute(); },
  };
  const agentScope = {
    async ensure() { return 'agent-busy'; },
    ownershipTokenFor() { return null; },
    currentOwnershipToken() { return null; },
  };

  registerScreenshotTools(server as never, bridge as never, queue as never, agentScope as never);
  assert.ok(handler);
  const result = await handler!({ mode: 'viewport' });
  assert.equal(result.isError, true);
  const content = result.content as Array<Record<string, unknown>>;
  const error = JSON.parse(String(content[0].text));
  assert.deepEqual(error, {
    success: false,
    code: 'SCREENSHOT_DEBUGGER_BUSY',
    error: 'Another debugger owns this tab.',
    retryable: true,
  });
});
