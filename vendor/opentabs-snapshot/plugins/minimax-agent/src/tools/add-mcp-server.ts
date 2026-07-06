import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';

export const addMcpServer = defineTool({
  name: 'add_mcp_server',
  displayName: 'Add MCP Server',
  description:
    'Add a new MCP server to the MiniMax Agent workspace. Provide a name, URL or command, and optional environment variables or arguments.',
  summary: 'Add an MCP server',
  icon: 'plus',
  group: 'MCP Servers',
  input: z.object({
    name: z.string().describe('Server name'),
    url: z.string().describe('Server URL or command'),
    env: z.record(z.string(), z.string()).optional().describe('Environment variables as key-value pairs'),
    args: z.record(z.string(), z.string()).optional().describe('Arguments as key-value pairs'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the server was added successfully'),
  }),
  handle: async params => {
    await apiPost<{ base_resp: unknown }>('/matrix/api/v1/mcp/add_or_edit_server', {
      name: params.name,
      url: params.url,
      ...(params.env != null && { env: params.env }),
      ...(params.args != null && { args: params.args }),
    });
    return { success: true };
  },
});
