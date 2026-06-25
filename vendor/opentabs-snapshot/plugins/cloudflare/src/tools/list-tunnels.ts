import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi, getAccountId } from '../cloudflare-api.js';

export const listTunnels = defineTool({
  name: 'list_tunnels',
  displayName: 'List Tunnels',
  description:
    'List Cloudflare Tunnels in the account. Tunnels create secure outbound-only connections from your infrastructure to Cloudflare, without opening inbound ports.',
  summary: 'List Cloudflare Tunnels',
  icon: 'cable',
  group: 'Network',
  input: z.object({
    is_deleted: z.boolean().optional().describe('Filter by deletion status (default false — only active tunnels)'),
  }),
  output: z.object({
    tunnels: z
      .array(
        z.object({
          id: z.string().describe('Tunnel ID (UUID)'),
          name: z.string().describe('Tunnel name'),
          status: z.string().describe('Tunnel status: "active", "inactive", "degraded"'),
          created_at: z.string().describe('ISO 8601 creation timestamp'),
          remote_config: z.boolean().describe('Whether the tunnel is remotely managed'),
        }),
      )
      .describe('List of tunnels'),
  }),
  handle: async params => {
    const accountId = getAccountId();
    if (!accountId) {
      throw ToolError.validation('Could not determine account ID. Navigate to an account page first.');
    }
    const data = await cloudflareApi<Record<string, unknown>[]>(
      `/accounts/${encodeURIComponent(accountId)}/cfd_tunnel`,
      { query: { is_deleted: params.is_deleted ?? false } },
    );
    const tunnels = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return {
      tunnels: tunnels.map(t => ({
        id: (t.id as string) ?? '',
        name: (t.name as string) ?? '',
        status: (t.status as string) ?? '',
        created_at: (t.created_at as string) ?? '',
        remote_config: (t.remote_config as boolean) ?? false,
      })),
    };
  },
});
