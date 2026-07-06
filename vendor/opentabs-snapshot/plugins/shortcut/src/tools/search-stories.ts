import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawStory, mapStory, searchResultSchema } from './schemas.js';

export const searchStories = defineTool({
  name: 'search_stories',
  displayName: 'Search Stories',
  description:
    'Search for stories by text query. Uses Shortcut search operators (e.g., "is:started", "type:bug", "label:backend"). Returns paginated results.',
  summary: 'Search stories by text query',
  icon: 'search',
  group: 'Stories',
  input: z.object({
    query: z.string().describe('Search query text — supports Shortcut search operators'),
    page_size: z.number().int().min(1).max(25).optional().describe('Results per page (default 25, max 25)'),
    next: z.string().optional().describe('Cursor token from a previous response for pagination'),
  }),
  output: searchResultSchema,
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      query: params.query,
      page_size: params.page_size,
      next: params.next,
    };
    const data = await api<{ data?: RawStory[]; total?: number; next?: string | null }>('/search/stories', { query });
    return {
      data: (data.data ?? []).map(mapStory),
      total: data.total ?? 0,
      next: data.next ?? '',
    };
  },
});
