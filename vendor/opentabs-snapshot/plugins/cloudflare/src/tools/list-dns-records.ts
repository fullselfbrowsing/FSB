import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi } from '../cloudflare-api.js';
import { dnsRecordSchema, mapDnsRecord, mapPagination, paginationSchema } from './schemas.js';

export const listDnsRecords = defineTool({
  name: 'list_dns_records',
  displayName: 'List DNS Records',
  description:
    'List DNS records for a zone. Returns record type, name, content, TTL, and proxy status. Supports filtering by type and name, with pagination.',
  summary: 'List DNS records for a zone',
  icon: 'list',
  group: 'DNS',
  input: z.object({
    zone_id: z.string().describe('Zone ID (32-char hex string)'),
    type: z
      .enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA', 'PTR', 'SOA'])
      .optional()
      .describe('Filter by record type'),
    name: z.string().optional().describe('Filter by record name (e.g., "www.example.com")'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    per_page: z.number().int().min(5).max(100).optional().describe('Results per page (default 50, max 100)'),
  }),
  output: z.object({
    records: z.array(dnsRecordSchema).describe('List of DNS records'),
    pagination: paginationSchema.describe('Pagination info'),
  }),
  handle: async params => {
    const data = await cloudflareApi<Record<string, unknown>[]>(
      `/zones/${encodeURIComponent(params.zone_id)}/dns_records`,
      {
        query: {
          type: params.type,
          name: params.name,
          page: params.page ?? 1,
          per_page: params.per_page ?? 50,
        },
      },
    );
    const records = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return {
      records: records.map(r => mapDnsRecord(r)),
      pagination: mapPagination(data.result_info as Record<string, unknown> | undefined),
    };
  },
});
