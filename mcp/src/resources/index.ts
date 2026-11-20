import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WebSocketBridge } from '../bridge.js';
import type { AgentScope } from '../agent-scope.js';
import { sendBrowserMessage } from '../agent-bridge.js';
import { mapFSBError } from '../errors.js';

function formatResourceResponse(
  uriHref: string,
  result: Record<string, unknown> | null | undefined,
): { contents: Array<{ uri: string; text: string; mimeType: string }> } {
  if (!result || result.success === false) {
    const mapped = mapFSBError(result);
    const errorText = mapped.content[0]?.text || 'Unknown resource error';
    return {
      contents: [{ uri: uriHref, text: errorText, mimeType: 'text/plain' }],
    };
  }

  return {
    contents: [{
      uri: uriHref,
      text: JSON.stringify(result, null, 2),
      mimeType: 'application/json',
    }],
  };
}

/**
 * Register all MCP resources that expose FSB's data to AI agents.
 * Each resource checks bridge connectivity before attempting a read.
 */
export function registerResources(
  server: McpServer,
  bridge: WebSocketBridge,
  agentScope?: AgentScope,
): void {
  const notConnectedText =
    'Extension not connected. The FSB Chrome extension must be running and connected to the local FSB MCP bridge.';

  // A resource describes the browser its session is in. With several browsers
  // on one hub, a read that named none would be handed whichever is the
  // default, which need not be the one the session's tools are driving.
  const read = (
    message: Parameters<WebSocketBridge['sendAndWait']>[0],
    options: { timeout: number },
  ): Promise<Record<string, unknown>> => (agentScope
    ? sendBrowserMessage(bridge, agentScope, message, options)
    : bridge.sendAndWait(message, options));

  // 1. Current Page DOM
  server.registerResource(
    'current-page-dom',
    'browser://dom/snapshot',
    {
      title: 'Current Page DOM',
      description:
        'Structured DOM snapshot of the active tab with elements, selectors, forms, and page structure. Read this to understand what is on the current page before using action tools.',
      mimeType: 'application/json',
    },
    async (uri) => {
      if (!bridge.isConnected) {
        return {
          contents: [{ uri: uri.href, text: notConnectedText, mimeType: 'text/plain' }],
        };
      }

      const result = await read(
        { type: 'mcp:get-dom', payload: { maxElements: 2000, prioritizeViewport: true } },
        { timeout: 10_000 },
      );

      return formatResourceResponse(uri.href, result);
    },
  );

  // 2. Open Tabs
  server.registerResource(
    'open-tabs',
    'browser://tabs',
    {
      title: 'Open Tabs',
      description:
        'All open browser tabs with title, URL, and active status. Read this to see available tabs before switching.',
      mimeType: 'application/json',
    },
    async (uri) => {
      if (!bridge.isConnected) {
        return {
          contents: [{ uri: uri.href, text: notConnectedText, mimeType: 'text/plain' }],
        };
      }

      const result = await read(
        { type: 'mcp:get-tabs', payload: {} },
        { timeout: 10_000 },
      );

      return formatResourceResponse(uri.href, result);
    },
  );

  // 3. Site Guides
  server.registerResource(
    'site-guides',
    'fsb://site-guides',
    {
      title: 'Site Guides',
      description:
        'All FSB site guide definitions with selectors and workflows for supported websites. Read this to use optimized selectors for known sites.',
      mimeType: 'application/json',
    },
    async (uri) => {
      if (!bridge.isConnected) {
        return {
          contents: [{ uri: uri.href, text: notConnectedText, mimeType: 'text/plain' }],
        };
      }

      const result = await read(
        { type: 'mcp:get-site-guides', payload: {} },
        { timeout: 10_000 },
      );

      return formatResourceResponse(uri.href, result);
    },
  );

  // 4. FSB Memory
  server.registerResource(
    'fsb-memory',
    'fsb://memory',
    {
      title: 'FSB Memory',
      description:
        'Episodic, semantic, and procedural memory from previous automation sessions. Read this to benefit from past experience on similar tasks.',
      mimeType: 'application/json',
    },
    async (uri) => {
      if (!bridge.isConnected) {
        return {
          contents: [{ uri: uri.href, text: notConnectedText, mimeType: 'text/plain' }],
        };
      }

      const result = await read(
        { type: 'mcp:get-memory', payload: {} },
        { timeout: 10_000 },
      );

      return formatResourceResponse(uri.href, result);
    },
  );

  // 5. Extension Config
  server.registerResource(
    'extension-config',
    'fsb://config',
    {
      title: 'Extension Config',
      description:
        'Current FSB extension configuration including provider, model, and connection status. API keys are redacted. Read this to check extension health.',
      mimeType: 'application/json',
    },
    async (uri) => {
      if (!bridge.isConnected) {
        return {
          contents: [{ uri: uri.href, text: notConnectedText, mimeType: 'text/plain' }],
        };
      }

      const result = await read(
        { type: 'mcp:get-config', payload: {} },
        { timeout: 10_000 },
      );

      return formatResourceResponse(uri.href, result);
    },
  );
}
