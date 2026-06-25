import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { typeahead } from '../expedia-api.js';
import { locationSuggestionSchema, mapLocationSuggestion } from './schemas.js';
import type { RawTypeaheadResult } from './schemas.js';

interface TypeaheadResponse {
  q?: string;
  sr?: RawTypeaheadResult[];
}

export const searchLocations = defineTool({
  name: 'search_locations',
  displayName: 'Search Locations',
  description:
    'Search for cities, airports, neighborhoods, and hotels by name. Returns region IDs (gaiaId) needed for hotel and activity searches. Use "HOTELS" lob for hotel searches, "FLIGHTS" for flights.',
  summary: 'Search for destinations by name',
  icon: 'map-pin',
  group: 'Search',
  input: z.object({
    query: z.string().describe('Location name to search for (e.g. "San Francisco", "JFK")'),
    lob: z
      .enum(['HOTELS', 'FLIGHTS', 'PACKAGES', 'ACTIVITIES'])
      .optional()
      .describe('Line of business filter (default "HOTELS")'),
    max_results: z.number().int().min(1).max(20).optional().describe('Maximum results to return (default 10)'),
  }),
  output: z.object({
    query: z.string().describe('The search query'),
    suggestions: z.array(locationSuggestionSchema).describe('Location suggestions'),
  }),
  handle: async params => {
    const data = await typeahead<TypeaheadResponse>(params.query, {
      lob: params.lob ?? 'HOTELS',
      maxresults: params.max_results ?? 10,
    });

    const suggestions = (data.sr ?? []).map(mapLocationSuggestion);

    return {
      query: data.q ?? params.query,
      suggestions,
    };
  },
});
