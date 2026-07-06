import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchAutocompleteSuggestions } from '../yelp-api.js';
import { suggestionSchema, mapSuggestion } from './schemas.js';

export const autocomplete = defineTool({
  name: 'autocomplete',
  displayName: 'Autocomplete',
  description:
    'Get autocomplete suggestions for a search query. Returns suggested search terms, business names, and categories matching the prefix. Useful for building search-as-you-type experiences.',
  summary: 'Get search autocomplete suggestions',
  icon: 'text-cursor-input',
  group: 'Search',
  input: z.object({
    prefix: z.string().min(1).describe('Search text prefix to get suggestions for (e.g., "sushi", "dent")'),
    location: z.string().describe('Location context for suggestions (e.g., "San Jose, CA")'),
  }),
  output: z.object({
    suggestions: z.array(suggestionSchema).describe('List of autocomplete suggestions'),
  }),
  handle: async params => {
    const data = await fetchAutocompleteSuggestions(params.prefix, params.location);

    const suggestions = (data.response ?? []).flatMap(group => (group.suggestions ?? []).map(mapSuggestion));

    return { suggestions };
  },
});
