import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, QUERY_HASHES } from '../airbnb-api.js';
import { searchSuggestionSchema } from './schemas.js';

interface RawSuggestionItem {
  __typename?: string;
  title?: string;
  subtitle?: string;
  iconUrl?: string | null;
}

interface RawSuggestionResult {
  __typename?: string;
  items?: RawSuggestionItem[];
  title?: string;
}

interface AutoSuggestionsResponse {
  presentation?: {
    autoSuggestions?: {
      staysAutoSuggestionResults?: RawSuggestionResult[];
    };
  };
}

const mapSuggestionItem = (item: RawSuggestionItem) => ({
  display_name: item.title ?? '',
  type: item.subtitle ?? '',
  image_url: item.iconUrl ?? null,
});

export const searchSuggestions = defineTool({
  name: 'search_suggestions',
  displayName: 'Search Suggestions',
  description:
    'Get autocomplete suggestions for a location search query. Returns suggested destinations with names and types.',
  summary: 'Get search autocomplete suggestions',
  icon: 'search',
  group: 'Search',
  input: z.object({
    query: z.string().min(1).describe('Search text to get suggestions for (e.g., "Tokyo", "Paris")'),
  }),
  output: z.object({
    suggestions: z.array(searchSuggestionSchema).describe('Search suggestions'),
  }),
  handle: async params => {
    const data = await graphql<AutoSuggestionsResponse>('AutoSuggestionsQuery', QUERY_HASHES.AutoSuggestionsQuery, {
      skipExtendedSearchParams: false,
      autoSuggestionsRequest: {
        rawParams: [{ filterName: 'query', filterValues: [params.query] }],
        source: 'P2',
        treatmentFlags: [],
      },
    });

    const results = data.presentation?.autoSuggestions?.staysAutoSuggestionResults ?? [];
    const suggestions = results.flatMap(result =>
      (result.items ?? []).filter(item => item.__typename === 'LocationSuggestionItem').map(mapSuggestionItem),
    );

    return { suggestions };
  },
});
