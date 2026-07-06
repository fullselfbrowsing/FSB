import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';

export const deleteDnsRecord = defineTool({
  name: 'delete_dns_record',
  displayName: 'Delete DNS Record',
  description: 'Delete a DNS record from a Netlify DNS zone. This action cannot be undone.',
  summary: 'Delete a DNS record',
  icon: 'trash-2',
  group: 'DNS',
  input: z.object({
    zone_id: z.string().describe('The DNS zone ID the record belongs to'),
    record_id: z.string().describe('The DNS record ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/dns_zones/${params.zone_id}/dns_records/${params.record_id}`, {
      method: 'DELETE',
    });
    return { success: true };
  },
});
