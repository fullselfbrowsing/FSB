import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../wikipedia-api.js';

export const opensearch = defineTool({
  name: 'opensearch',
  displayName: 'Opensearch',
  description:
    'Autocomplete search for Wikipedia article titles. Returns matching titles and their URLs. Faster and lighter than search_articles — use this for title suggestions and quick lookups.',
  summary: 'Autocomplete article title search',
  icon: 'text-search',
  group: 'Articles',
  input: z.object({
    query: z.string().describe('Search query text'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Maximum number of suggestions to return (default 10, max 20)'),
  }),
  output: z.object({
    suggestions: z.array(
      z.object({
        title: z.string().describe('Article title'),
        url: z.string().describe('Full URL of the article'),
      }),
    ),
  }),
  handle: async params => {
    // OpenSearch returns an array: [query, [titles], [descriptions], [urls]]
    const data = await api<[string, string[], string[], string[]]>({
      action: 'opensearch',
      search: params.query,
      limit: params.limit ?? 10,
      namespace: 0,
    });

    const titles = data[1] ?? [];
    const urls = data[3] ?? [];

    return {
      suggestions: titles.map((title, i) => ({
        title,
        url: urls[i] ?? '',
      })),
    };
  },
});
