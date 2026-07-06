import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { dnsZoneSchema, type RawDnsZone, mapDnsZone } from './schemas.js';

export const getDnsZone = defineTool({
  name: 'get_dns_zone',
  displayName: 'Get DNS Zone',
  description:
    'Get detailed information about a specific DNS zone by its ID. Returns the zone name, record count, associated site, and timestamps.',
  summary: 'Get DNS zone details by ID',
  icon: 'globe',
  group: 'DNS',
  input: z.object({
    zone_id: z.string().describe('The DNS zone ID to retrieve'),
  }),
  output: dnsZoneSchema,
  handle: async params => {
    const raw = await api<RawDnsZone>(`/dns_zones/${params.zone_id}`);
    return mapDnsZone(raw);
  },
});
