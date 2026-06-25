import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchSsrData, findSsrOperation } from '../tripadvisor-api.js';
import { searchResultSchema, mapSearchResult, type RawSearchResult } from './schemas.js';

export const listAttractions = defineTool({
  name: 'list_attractions',
  displayName: 'List Attractions',
  description:
    'List attractions and things to do in a city or area on TripAdvisor. Returns a page of attraction listings. Uses the geo-based attraction listing page URL.',
  summary: 'List things to do in an area',
  icon: 'list',
  group: 'Attractions',
  input: z.object({
    url: z
      .string()
      .describe(
        'Attraction listing page URL path (e.g., "/Attractions-g60713-Activities-San_Francisco_California.html")',
      ),
  }),
  output: z.object({
    attractions: z.array(searchResultSchema).describe('Attraction listings'),
  }),
  handle: async params => {
    const ssrData = await fetchSsrData(params.url);

    const attractionResults = findSsrOperation(ssrData, 'AttractionsPresentation_searchAttractions') as {
      attractions?: RawSearchResult[];
    } | null;

    const results: RawSearchResult[] = attractionResults?.attractions ?? [];

    return {
      attractions: results.map(mapSearchResult),
    };
  },
});
