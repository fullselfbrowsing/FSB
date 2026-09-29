import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WebSocketBridge } from '../bridge.js';
import type { TaskQueue } from '../queue.js';
import { AgentScope } from '../agent-scope.js';
import { sendAgentScopedBridgeMessage } from '../agent-bridge.js';
import { mapFSBError } from '../errors.js';
import { screenshotStore } from '../screenshot-store.js';
import { getToolByName, jsonSchemaToZod } from './schema-bridge.js';

type ScreenshotMetadata = Record<string, unknown> & {
  warnings?: Array<Record<string, unknown>>;
};

const SCREENSHOT_ERROR_CODES = new Set([
  'INVALID_SCREENSHOT_ARGUMENTS',
  'SCREENSHOT_TARGET_NOT_FOUND',
  'SCREENSHOT_REGION_OUT_OF_BOUNDS',
  'SCREENSHOT_TOO_LARGE',
  'SCREENSHOT_DEBUGGER_BUSY',
  'SCREENSHOT_CAPTURE_FAILED',
]);

function mapScreenshotError(result: Record<string, unknown>) {
  const code = typeof result.code === 'string'
    ? result.code
    : (typeof result.errorCode === 'string' ? result.errorCode : '');
  if (!SCREENSHOT_ERROR_CODES.has(code)) return mapFSBError(result);
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        success: false,
        code,
        error: typeof result.error === 'string' ? result.error : code,
        retryable: result.retryable === true,
      }, null, 2),
    }],
    isError: true,
  };
}

function sanitizedMetadata(result: Record<string, unknown>): ScreenshotMetadata {
  const metadata = result.metadata && typeof result.metadata === 'object'
    ? { ...(result.metadata as Record<string, unknown>) }
    : {};
  delete metadata.image_data;
  delete metadata.data;
  return metadata;
}

export function registerScreenshotTools(
  server: McpServer,
  bridge: WebSocketBridge,
  queue: TaskQueue,
  agentScope: AgentScope,
): void {
  const tool = getToolByName('capture_screenshot');
  if (!tool) throw new Error('capture_screenshot is missing from the shared tool registry');

  server.tool(
    tool.name,
    tool.description,
    jsonSchemaToZod(tool.inputSchema),
    async (params: Record<string, unknown>) => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }

      return queue.enqueue(tool.name, async () => {
        const targetTabId = typeof params.tab_id === 'number' ? params.tab_id : null;
        const result = await sendAgentScopedBridgeMessage(
          bridge,
          agentScope,
          'mcp:capture-screenshot',
          params,
          { timeout: 45_000, targetTabId },
        );
        if (result.success !== true) return mapScreenshotError(result);

        const imageData = typeof result.image_data === 'string' ? result.image_data : '';
        const mimeType = result.mime_type === 'image/png' ? 'image/png' : null;
        if (!imageData || !mimeType) {
          return mapScreenshotError({
            success: false,
            code: 'SCREENSHOT_CAPTURE_FAILED',
            error: 'The extension returned no PNG image payload.',
          });
        }

        const writeResult = await screenshotStore.write(imageData);
        const metadata = sanitizedMetadata(result);
        const warnings = Array.isArray(metadata.warnings) ? [...metadata.warnings] : [];
        if (writeResult.warning) warnings.push(writeResult.warning);
        metadata.warnings = warnings;
        metadata.file_path = writeResult.filePath;
        metadata.delivery_status = writeResult.filePath
          ? 'mcp_image_and_file_delivered'
          : 'mcp_image_delivered';

        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(metadata, null, 2) },
            { type: 'image' as const, data: imageData, mimeType },
          ],
        };
      });
    },
  );
}
