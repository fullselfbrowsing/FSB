import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi } from '../cloudflare-api.js';
import { mapZone, zoneSchema } from './schemas.js';

export const getZone = defineTool({
  name: 'get_zone',
  displayName: 'Get Zone',
  description: 'Get detailed information about a specific zone (domain) by its zone ID.',
  summary: 'Get zone details',
  icon: 'globe',
  group: 'Zones',
  input: z.object({
    zone_id: z.string().describe('Zone ID (32-char hex string)'),
  }),
  output: zoneSchema,
  handle: async params => {
    const data = await cloudflareApi<Record<string, unknown>>(`/zones/${encodeURIComponent(params.zone_id)}`);
    return mapZone(data.result as Record<string, unknown>);
  },
});
