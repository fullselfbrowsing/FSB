import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { geocodeLocation } from '../costco-api.js';
import { geoLocationSchema, mapGeoLocation } from './schemas.js';

export const geocodeLocationTool = defineTool({
  name: 'geocode_location',
  displayName: 'Geocode Location',
  description: 'Convert a ZIP code or city name to geographic coordinates. Useful for finding nearby warehouses.',
  summary: 'Convert ZIP/city to coordinates',
  icon: 'map-pin',
  group: 'Locations',
  input: z.object({
    query: z.string().describe('ZIP code or city name (e.g., "95101", "San Jose")'),
    country: z.string().optional().describe('Country code (default "USA")'),
  }),
  output: z.object({
    locations: z.array(geoLocationSchema),
  }),
  handle: async params => {
    const country = params.country ?? 'USA';
    const data = await geocodeLocation(params.query, country);
    return { locations: data.map(mapGeoLocation) };
  },
});
