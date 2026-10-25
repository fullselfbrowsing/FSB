import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FSB_MCP_VERSION, FSB_SERVER_NAME } from './version.js';

const serverIcon = {
  src: `data:image/png;base64,${readFileSync(new URL('../assets/fsb_logo_dark.png', import.meta.url)).toString('base64')}`,
  mimeType: 'image/png',
};

/**
 * Create and return the FSB MCP server instance.
 * Tool, resource, and prompt registration is handled separately
 * by the modules imported in index.ts.
 */
export function createServer(): McpServer {
  return new McpServer(
    { name: FSB_SERVER_NAME, version: FSB_MCP_VERSION, icons: [serverIcon] },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
        logging: {},
      },
    },
  );
}
