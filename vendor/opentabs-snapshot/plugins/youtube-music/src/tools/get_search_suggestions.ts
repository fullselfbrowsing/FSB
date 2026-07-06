import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-music-api.js';
import { searchSuggestionSchema } from './schemas.js';

interface SuggestionsResponse {
  contents?: Array<{
    searchSuggestionsSectionRenderer?: {
      contents?: Array<{
        searchSuggestionRenderer?: {
          suggestion?: {
            runs?: Array<{ text?: string; bold?: boolean }>;
          };
          navigationEndpoint?: {
            searchEndpoint?: { query?: string };
          };
        };
      }>;
    };
  }>;
}

export const get_search_suggestions = defineTool({
  name: 'get_search_suggestions',
  displayName: 'Get Search Suggestions',
  description: 'Get search autocomplete suggestions for a query',
  summary: 'Get autocomplete suggestions for a search query',
  icon: 'text-search',
  group: 'Search',
  input: z.object({
    query: z.string().describe('Partial search text to get suggestions for'),
  }),
  output: z.object({
    suggestions: z.array(searchSuggestionSchema).describe('List of autocomplete suggestions'),
  }),
  async handle(params) {
    const data = await api<SuggestionsResponse>('music/get_search_suggestions', {
      input: params.query,
    });

    const section = data.contents?.[0]?.searchSuggestionsSectionRenderer;
    const entries = section?.contents ?? [];

    const suggestions = entries
      .map(entry => {
        const renderer = entry.searchSuggestionRenderer;
        if (!renderer) return null;
        const text = renderer.suggestion?.runs?.map(r => r.text ?? '').join('') ?? '';
        const query = renderer.navigationEndpoint?.searchEndpoint?.query ?? text;
        return { text, query };
      })
      .filter((s): s is { text: string; query: string } => s !== null && s.text !== '');

    return { suggestions };
  },
});
