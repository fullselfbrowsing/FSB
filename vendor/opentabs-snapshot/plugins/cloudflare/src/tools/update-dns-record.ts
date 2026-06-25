import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi } from '../cloudflare-api.js';
import { dnsRecordSchema, mapDnsRecord } from './schemas.js';

export const updateDnsRecord = defineTool({
  name: 'update_dns_record',
  displayName: 'Update DNS Record',
  description: 'Update an existing DNS record. Requires the zone ID and record ID. All fields are overwritten.',
  summary: 'Update a DNS record',
  icon: 'pencil',
  group: 'DNS',
  input: z.object({
    zone_id: z.string().describe('Zone ID (32-char hex string)'),
    record_id: z.string().describe('DNS record ID'),
    type: z.string().describe('Record type (A, AAAA, CNAME, MX, TXT, NS, SRV, etc.)'),
    name: z.string().describe('DNS record name'),
    content: z.string().describe('Record content'),
    ttl: z.number().int().optional().describe('TTL in seconds (1 for automatic)'),
    proxied: z.boolean().optional().describe('Whether to proxy traffic through Cloudflare'),
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
      `/zones/${encodeURIComponent(params.zone_id)}/dns_records/${encodeURIComponent(params.record_id)}`,
      { method: 'PUT', body },
    );
    return mapDnsRecord(data.result as Record<string, unknown>);
  },
});
