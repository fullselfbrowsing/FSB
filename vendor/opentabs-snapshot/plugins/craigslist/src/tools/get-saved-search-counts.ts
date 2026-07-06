import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { accountsApi } from '../craigslist-api.js';
import { mapSavedSearchCount, savedSearchCountSchema } from './schemas.js';
import type { RawSavedSearchCount } from './schemas.js';

export const getSavedSearchCounts = defineTool({
  name: 'get_saved_search_counts',
  displayName: 'Get Saved Search Counts',
  description:
    'Get the number of new results for each saved search. Returns saved search IDs with their current result counts.',
  summary: 'Get counts for saved searches',
  icon: 'search',
  group: 'Searches',
  input: z.object({}),
  output: z.object({
    searches: z.array(savedSearchCountSchema).describe('Saved searches with their result counts'),
  }),
  handle: async () => {
    const data = await accountsApi<RawSavedSearchCount[]>('/savesearch/counts');
    return {
      searches: (data ?? []).map(mapSavedSearchCount),
    };
  },
});
