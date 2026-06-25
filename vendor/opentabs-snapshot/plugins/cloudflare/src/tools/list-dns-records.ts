// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../cloudflare-api.js';

export const listDnsRecords = defineTool({
  name: 'list_dns_records',
  displayName: 'List DNS Records',
  description: 'List the DNS records for a Cloudflare zone. Optionally filter by record type, name, or content.',
  summary: 'List DNS records for a zone',
  icon: 'list',
  group: 'DNS',
  input: z.object({
    zone_id: z.string().min(1).describe('Cloudflare zone ID the records belong to'),
    type: z
      .enum(['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'CAA'])
      .optional()
      .describe('Filter by DNS record type'),
    name: z.string().optional().describe('Filter by record name (FQDN)'),
    page: z.number().int().optional().describe('Page number for pagination (1-indexed)'),
  }),
  output: z.object({
    records: z
      .array(z.object({ id: z.string(), type: z.string(), name: z.string() }))
      .describe('List of DNS records'),
  }),
  handle: async (params: { zone_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /zones/:id/dns_records (default method).
    const data = await api<{ records: Array<{ id: string; type: string; name: string }> }>(
      `/zones/${encodeURIComponent(params.zone_id)}/dns_records`
    );
    return data;
  },
});
