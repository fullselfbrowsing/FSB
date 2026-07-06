import { ToolError, getPageGlobal, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apolloEntryToRawTitle, mapTitle, titleSchema } from './schemas.js';

/**
 * Search Netflix titles using the Apollo Client cache.
 * Netflix loads title metadata into the Apollo cache as the user browses.
 * This tool scans the cache for movies/shows matching the search query,
 * and also triggers a pathEvaluator search to load server-side results.
 */
export const searchTitles = defineTool({
  name: 'search_titles',
  displayName: 'Search Titles',
  description:
    'Search Netflix for movies and TV shows by keyword. Returns matching titles with metadata including type, rating, synopsis, and watch status. Use this to find specific content on Netflix.',
  summary: 'Search Netflix movies and shows',
  icon: 'search',
  group: 'Browse',
  input: z.object({
    query: z.string().describe('Search query (e.g., "Stranger Things", "action movies")'),
    limit: z.number().int().min(1).max(40).optional().describe('Max results to return (default 10, max 40)'),
  }),
  output: z.object({
    titles: z.array(titleSchema).describe('Matching titles'),
  }),
  handle: async params => {
    const limit = params.limit ?? 10;
    const queryLower = params.query.toLowerCase();

    /** Scan the Apollo Client cache for titles matching the query string. */
    const scanApolloCache = (): ReturnType<typeof mapTitle>[] => {
      const client = getPageGlobal('netflix.appContext.state.graphqlClient') as {
        cache?: { extract: () => Record<string, Record<string, unknown>> };
      } | null;

      if (!client?.cache) return [];

      const cache = client.cache.extract();
      const results: ReturnType<typeof mapTitle>[] = [];

      for (const entry of Object.values(cache)) {
        const typename = entry?.__typename as string | undefined;
        if (typename !== 'Movie' && typename !== 'Show') continue;

        const title = entry.title as string | undefined;
        if (!title || !title.toLowerCase().includes(queryLower)) continue;

        results.push(mapTitle(apolloEntryToRawTitle(entry)));
      }

      return results;
    };

    // First pass: check existing Apollo cache
    let titles = scanApolloCache();

    // If insufficient results, trigger a pathEvaluator search for server-side data
    if (titles.length < limit) {
      const pe = getPageGlobal('netflix.appContext.state.pathEvaluator') as {
        get?: (...args: unknown[]) => Promise<unknown>;
      } | null;

      if (pe?.get) {
        try {
          const peGet = pe.get.bind(pe);
          await peGet([
            'search',
            'byTerm',
            `|${params.query}`,
            'titles',
            { from: 0, to: limit - 1 },
            ['summary', 'title'],
          ]);

          // Re-scan after the search populates the cache
          titles = scanApolloCache();
        } catch {
          // PathEvaluator search may fail — return what we have
        }
      }
    }

    if (titles.length === 0) {
      throw ToolError.notFound(`No results found for "${params.query}".`);
    }

    return { titles: titles.slice(0, limit) };
  },
});
