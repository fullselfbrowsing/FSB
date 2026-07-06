import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';

const mcpServerSchema = z.object({
  id: z.string().describe('MCP server ID'),
  name: z.string().describe('Server name'),
  url: z.string().describe('Server URL or command'),
  status: z.number().int().describe('Server status (0=disconnected, 1=connected)'),
  description: z.string().describe('Server description'),
});

interface RawMcpServer {
  id?: string;
  name?: string;
  url?: string;
  status?: number;
  description?: string;
  tools?: unknown[];
}

export const listMcpServers = defineTool({
  name: 'list_mcp_servers',
  displayName: 'List MCP Servers',
  description:
    'List all MCP servers added to the MiniMax Agent workspace. Returns server names, URLs, connection status, and descriptions.',
  summary: 'List added MCP servers',
  icon: 'server',
  group: 'MCP Servers',
  input: z.object({}),
  output: z.object({
    servers: z.array(mcpServerSchema).describe('List of MCP servers'),
  }),
  handle: async () => {
    const data = await apiPost<{
      servers?: RawMcpServer[];
      base_resp: unknown;
    }>('/matrix/api/v1/mcp/list_added_server', {});
    return {
      servers: (data.servers ?? []).map(s => ({
        id: s.id ?? '',
        name: s.name ?? '',
        url: s.url ?? '',
        status: s.status ?? 0,
        description: s.description ?? '',
      })),
    };
  },
});
