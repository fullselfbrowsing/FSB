import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { dnsRecordSchema, type RawDnsRecord, mapDnsRecord } from './schemas.js';

export const listDnsRecords = defineTool({
  name: 'list_dns_records',
  displayName: 'List DNS Records',
  description:
    'List all DNS records in a Netlify DNS zone. Returns record hostname, type (A, AAAA, CNAME, MX, TXT, NS, etc.), value, TTL, and priority.',
  summary: 'List DNS records in a zone',
  icon: 'list',
  group: 'DNS',
  input: z.object({
    zone_id: z.string().describe('The DNS zone ID to list records for'),
  }),
  output: z.object({
    items: z.array(dnsRecordSchema).describe('List of DNS records'),
  }),
  handle: async params => {
    const raw = await api<RawDnsRecord[]>(`/dns_zones/${params.zone_id}/dns_records`);
    return { items: raw.map(mapDnsRecord) };
  },
});
