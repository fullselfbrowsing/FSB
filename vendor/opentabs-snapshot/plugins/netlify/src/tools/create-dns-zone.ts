import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { dnsZoneSchema, type RawDnsZone, mapDnsZone } from './schemas.js';

export const createDnsZone = defineTool({
  name: 'create_dns_zone',
  displayName: 'Create DNS Zone',
  description:
    'Create a new DNS zone for a domain in a Netlify account. Optionally associate it with a specific site. The zone manages DNS records for the domain.',
  summary: 'Create a new DNS zone',
  icon: 'plus',
  group: 'DNS',
  input: z.object({
    account_slug: z.string().describe('The account slug to create the zone in'),
    name: z.string().describe('The domain name for the zone (e.g. "example.com")'),
    site_id: z.string().optional().describe('Optional site ID to associate the zone with'),
  }),
  output: dnsZoneSchema,
  handle: async params => {
    const body: Record<string, string> = {
      account_slug: params.account_slug,
      name: params.name,
    };
    if (params.site_id) body.site_id = params.site_id;
    const raw = await api<RawDnsZone>('/dns_zones', {
      method: 'POST',
      body,
    });
    return mapDnsZone(raw);
  },
});
