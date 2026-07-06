import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { dnsZoneSchema, type RawDnsZone, mapDnsZone } from './schemas.js';

export const listDnsZones = defineTool({
  name: 'list_dns_zones',
  displayName: 'List DNS Zones',
  description:
    'List DNS zones for a Netlify account. Returns zone name, record count, associated site, and infrastructure details. Filter by account slug.',
  summary: 'List DNS zones',
  icon: 'globe',
  group: 'DNS',
  input: z.object({
    account_slug: z.string().optional().describe('Account slug to filter zones by'),
  }),
  output: z.object({
    items: z.array(dnsZoneSchema).describe('List of DNS zones'),
  }),
  handle: async params => {
    const raw = await api<RawDnsZone[]>('/dns_zones', {
      query: { account_slug: params.account_slug },
    });
    return { items: raw.map(mapDnsZone) };
  },
});
