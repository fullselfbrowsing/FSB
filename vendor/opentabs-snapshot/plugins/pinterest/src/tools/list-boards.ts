import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourceGet, getBookmark } from '../pinterest-api.js';
import { boardSchema, mapBoard } from './schemas.js';
import type { RawBoard } from './schemas.js';

export const listBoards = defineTool({
  name: 'list_boards',
  displayName: 'List Boards',
  description:
    'List boards for a Pinterest user by username. Returns board names, pin counts, privacy settings, and cover images. Supports pagination via bookmark cursor.',
  summary: 'List boards for a user',
  icon: 'layout-grid',
  group: 'Boards',
  input: z.object({
    username: z.string().describe('Pinterest username to list boards for (e.g., "pinterest")'),
    page_size: z.number().int().min(1).max(50).optional().describe('Number of boards per page (default 25, max 50)'),
    bookmark: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    boards: z.array(boardSchema).describe('User boards'),
    bookmark: z.string().describe('Cursor for next page, empty if no more results'),
  }),
  handle: async params => {
    const resp = await resourceGet<RawBoard[]>(
      'BoardsResource',
      {
        username: params.username,
        page_size: params.page_size ?? 25,
        privacy_filter: 'all',
        sort: 'last_pinned_to',
        field_set_key: 'profile_grid_item',
        include_board_pins: false,
      },
      `/${params.username}/`,
      params.bookmark,
    );

    const boards = resp.resource_response.data ?? [];
    return {
      boards: boards.map(mapBoard),
      bookmark: getBookmark(resp),
    };
  },
});
