import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourceGet, getBookmark } from '../pinterest-api.js';
import { boardSchema, mapBoard } from './schemas.js';
import type { RawBoard } from './schemas.js';

export const searchBoards = defineTool({
  name: 'search_boards',
  displayName: 'Search Boards',
  description:
    'Search for boards on Pinterest by keyword query. Returns matching boards with names, pin counts, and cover images. Supports pagination via bookmark cursor.',
  summary: 'Search for boards by keyword',
  icon: 'search',
  group: 'Boards',
  input: z.object({
    query: z.string().describe('Search query text'),
    bookmark: z.string().optional().describe('Pagination cursor from a previous response'),
    page_size: z.number().int().min(1).max(50).optional().describe('Number of results per page (default 25, max 50)'),
  }),
  output: z.object({
    boards: z.array(boardSchema).describe('Matching boards'),
    bookmark: z.string().describe('Cursor for next page, empty if no more results'),
  }),
  handle: async params => {
    const resp = await resourceGet<{ results?: RawBoard[] }>(
      'BaseSearchResource',
      {
        query: params.query,
        scope: 'boards',
        field_set_key: 'unauth_react',
        page_size: params.page_size ?? 25,
      },
      `/search/boards/?q=${encodeURIComponent(params.query)}`,
      params.bookmark,
    );

    const results = resp.resource_response.data?.results ?? [];
    return {
      boards: results.map(mapBoard),
      bookmark: getBookmark(resp),
    };
  },
});
