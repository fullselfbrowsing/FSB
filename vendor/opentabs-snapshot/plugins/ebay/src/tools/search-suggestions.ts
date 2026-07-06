import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchJson } from '../ebay-api.js';

interface AutocompleteResponse {
  url?: string;
  activeFactors?: Record<string, string>;
}

export const searchSuggestions = defineTool({
  name: 'search_suggestions',
  displayName: 'Search Suggestions',
  description:
    'Get autocomplete suggestions for a search query. Returns the URL to the autocomplete JavaScript module and active search factors. Use this to understand what search features are available for the current user context.',
  summary: 'Get autocomplete suggestions for search',
  icon: 'text-cursor-input',
  group: 'Search',
  input: z.object({
    query: z.string().min(1).describe('Partial search text to get suggestions for'),
  }),
  output: z.object({
    url: z.string().describe('Autocomplete module URL'),
    active_factors: z.record(z.string(), z.string()).describe('Active search factors for the user'),
  }),
  handle: async params => {
    const data = await fetchJson<AutocompleteResponse>(
      `https://www.ebay.com/sch/ajax/autocomplete?kwd=${encodeURIComponent(params.query)}`,
    );
    return {
      url: data.url ?? '',
      active_factors: data.activeFactors ?? {},
    };
  },
});
