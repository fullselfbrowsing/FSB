import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getRegions, getCurrentRegion } from '../aws-api.js';
import { regionSchema, mapRegion } from './schemas.js';

export const listRegions = defineTool({
  name: 'list_regions',
  displayName: 'List Regions',
  description:
    'List all available AWS regions with their geographic locations and opt-in status. Also returns the current console region. Reads from page metadata — does not make an AWS API call.',
  summary: 'List all available AWS regions',
  icon: 'globe',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    current_region: z.string().describe('Currently selected console region'),
    regions: z.array(regionSchema).describe('All available AWS regions'),
  }),
  handle: async () => {
    const regions = getRegions();
    return {
      current_region: getCurrentRegion(),
      regions: regions.map(mapRegion),
    };
  },
});
