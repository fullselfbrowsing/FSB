import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi } from '../cloudflare-api.js';

export const deleteDnsRecord = defineTool({
  name: 'delete_dns_record',
  displayName: 'Delete DNS Record',
  description: 'Delete a DNS record from a zone. This action is irreversible.',
  summary: 'Delete a DNS record',
  icon: 'trash-2',
  group: 'DNS',
  input: z.object({
    zone_id: z.string().describe('Zone ID (32-char hex string)'),
    record_id: z.string().describe('DNS record ID to delete'),
  }),
  output: z.object({
    id: z.string().describe('ID of the deleted record'),
  }),
  handle: async params => {
    const data = await cloudflareApi<Record<string, unknown>>(
      `/zones/${encodeURIComponent(params.zone_id)}/dns_records/${encodeURIComponent(params.record_id)}`,
      { method: 'DELETE' },
    );
    const result = data.result as Record<string, unknown> | undefined;
    return { id: (result?.id as string) ?? params.record_id };
  },
});
