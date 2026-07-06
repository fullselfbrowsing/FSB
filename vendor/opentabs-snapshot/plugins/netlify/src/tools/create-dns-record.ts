import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { dnsRecordSchema, type RawDnsRecord, mapDnsRecord } from './schemas.js';

export const createDnsRecord = defineTool({
  name: 'create_dns_record',
  displayName: 'Create DNS Record',
  description:
    'Create a new DNS record in a Netlify DNS zone. Supports A, AAAA, CNAME, MX, TXT, NS, and other record types. Specify hostname, type, value, and optionally TTL and priority.',
  summary: 'Create a DNS record',
  icon: 'plus',
  group: 'DNS',
  input: z.object({
    zone_id: z.string().describe('The DNS zone ID to create the record in'),
    hostname: z.string().describe('Fully qualified hostname for the record'),
    type: z.string().describe('Record type (e.g. A, AAAA, CNAME, MX, TXT, NS)'),
    value: z.string().describe('Record value (IP address, hostname, or text content)'),
    ttl: z.number().optional().describe('Time to live in seconds'),
    priority: z.number().optional().describe('Record priority (required for MX and SRV records)'),
  }),
  output: dnsRecordSchema,
  handle: async params => {
    const body: Record<string, unknown> = {
      hostname: params.hostname,
      type: params.type,
      value: params.value,
    };
    if (params.ttl !== undefined) body.ttl = params.ttl;
    if (params.priority !== undefined) body.priority = params.priority;
    const raw = await api<RawDnsRecord>(`/dns_zones/${params.zone_id}/dns_records`, {
      method: 'POST',
      body,
    });
    return mapDnsRecord(raw);
  },
});
