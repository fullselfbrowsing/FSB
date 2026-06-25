import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi } from '../cloudflare-api.js';
import { dnsRecordSchema, mapDnsRecord } from './schemas.js';

export const createDnsRecord = defineTool({
  name: 'create_dns_record',
  displayName: 'Create DNS Record',
  description: 'Create a new DNS record for a zone. Supports A, AAAA, CNAME, MX, TXT, and other record types.',
  summary: 'Create a DNS record',
  icon: 'plus',
  group: 'DNS',
  input: z.object({
    zone_id: z.string().describe('Zone ID (32-char hex string)'),
    type: z.string().describe('Record type (A, AAAA, CNAME, MX, TXT, NS, SRV, CAA, etc.)'),
    name: z.string().describe('DNS record name (e.g., "example.com", "www", "@" for root)'),
    content: z.string().describe('Record content (e.g., IP address, CNAME target, TXT value)'),
    ttl: z.number().int().optional().describe('TTL in seconds (1 for automatic, default 1)'),
    proxied: z.boolean().optional().describe('Whether to proxy traffic through Cloudflare (default false)'),
    priority: z.number().int().optional().describe('Priority for MX and SRV records'),
    comment: z.string().optional().describe('Optional comment for the record'),
  }),
  output: dnsRecordSchema,
  handle: async params => {
    const body: Record<string, unknown> = {
      type: params.type,
      name: params.name,
      content: params.content,
      ttl: params.ttl ?? 1,
    };
    if (params.proxied !== undefined) body.proxied = params.proxied;
    if (params.priority !== undefined) body.priority = params.priority;
    if (params.comment !== undefined) body.comment = params.comment;

    const data = await cloudflareApi<Record<string, unknown>>(
      `/zones/${encodeURIComponent(params.zone_id)}/dns_records`,
      { method: 'POST', body },
    );
    return mapDnsRecord(data.result as Record<string, unknown>);
  },
});
