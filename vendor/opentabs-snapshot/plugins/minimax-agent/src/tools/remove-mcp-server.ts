import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';

export const removeMcpServer = defineTool({
  name: 'remove_mcp_server',
  displayName: 'Remove MCP Server',
  description: 'Remove an MCP server from the MiniMax Agent workspace by its ID.',
  summary: 'Remove an MCP server',
  icon: 'trash-2',
  group: 'MCP Servers',
  input: z.object({
    id: z.string().describe('MCP server ID to remove'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the server was removed successfully'),
  }),
  handle: async params => {
    await apiPost<{ base_resp: unknown }>('/matrix/api/v1/mcp/remove_server', { id: params.id });
    return { success: true };
  },
});
