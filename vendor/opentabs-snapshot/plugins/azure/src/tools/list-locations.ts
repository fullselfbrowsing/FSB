import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import { type ArmListResponse, type RawLocation, mapLocation, locationSchema } from './schemas.js';

export const listLocations = defineTool({
  name: 'list_locations',
  displayName: 'List Locations',
  description:
    'List all available Azure regions/locations. Returns region name, display name, geography, and category (Recommended or Other). Does not require a subscription.',
  summary: 'List all Azure regions',
  icon: 'globe',
  group: 'Locations',
  input: z.object({}),
  output: z.object({
    locations: z.array(locationSchema).describe('List of Azure locations'),
  }),
  handle: async () => {
    const data = await armApi<ArmListResponse<RawLocation>>('/locations');
    return { locations: (data.value ?? []).map(mapLocation) };
  },
});
