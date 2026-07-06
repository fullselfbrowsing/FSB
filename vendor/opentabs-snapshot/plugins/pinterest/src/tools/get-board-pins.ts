import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourceGet, getBookmark } from '../pinterest-api.js';
import { pinSchema, mapPin } from './schemas.js';
import type { RawPin } from './schemas.js';

export const getBoardPins = defineTool({
  name: 'get_board_pins',
  displayName: 'Get Board Pins',
  description:
    'Get pins on a specific board. Requires the board ID and the board URL path (e.g., "/username/board-name/"). Supports pagination via bookmark cursor.',
  summary: 'Get pins from a board',
  icon: 'image',
  group: 'Boards',
  input: z.object({
    board_id: z.string().describe('Board ID'),
    board_url: z.string().describe('Board URL path (e.g., "/username/board-name/")'),
    page_size: z.number().int().min(1).max(50).optional().describe('Number of pins per page (default 25, max 50)'),
    bookmark: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    pins: z.array(pinSchema).describe('Board pins'),
    bookmark: z.string().describe('Cursor for next page, empty if no more results'),
  }),
  handle: async params => {
    const resp = await resourceGet<RawPin[]>(
      'BoardFeedResource',
      {
        board_id: params.board_id,
        board_url: params.board_url,
        field_set_key: 'react_grid_pin',
        page_size: params.page_size ?? 25,
      },
      params.board_url,
      params.bookmark,
    );

    const pins = resp.resource_response.data ?? [];
    return {
      pins: pins.map(mapPin),
      bookmark: getBookmark(resp),
    };
  },
});
