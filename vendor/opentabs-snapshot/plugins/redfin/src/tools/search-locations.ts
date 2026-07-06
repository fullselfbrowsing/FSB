import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../redfin-api.js';
import { type RawLocation, locationSchema, mapLocation } from './schemas.js';

interface AutocompletePayload {
  sections?: { rows?: RawLocation[] }[];
  exactMatch?: RawLocation;
}

export const searchLocations = defineTool({
  name: 'search_locations',
  displayName: 'Search Locations',
  description:
    'Search for locations on Redfin by name. Returns matching cities, counties, neighborhoods, ZIP codes, and addresses. Use the returned location IDs and types with search_properties.',
  summary: 'Search cities, zips, and neighborhoods',
  icon: 'map-pin',
  group: 'Search',
  input: z.object({
    query: z.string().min(1).describe('Location search text (e.g., "San Francisco", "94105", "Mission District")'),
    count: z.number().int().min(1).max(20).optional().describe('Maximum number of results (default 10)'),
  }),
  output: z.object({
    locations: z.array(locationSchema).describe('Matching locations'),
  }),
  handle: async params => {
    const data = await api<AutocompletePayload>('/stingray/do/location-autocomplete', {
      query: {
        location: params.query,
        v: 2,
        count: params.count ?? 10,
      },
    });

    const rows: RawLocation[] = [];
    if (data.exactMatch) rows.push(data.exactMatch);
    for (const section of data.sections ?? []) {
      for (const row of section.rows ?? []) {
        rows.push(row);
      }
    }

    return { locations: rows.map(mapLocation) };
  },
});
