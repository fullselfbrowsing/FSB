import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourceGet, getBookmark } from '../pinterest-api.js';
import { pinSchema, mapPin } from './schemas.js';
import type { RawPin } from './schemas.js';

export const getUserPins = defineTool({
  name: 'get_user_pins',
  displayName: 'Get User Pins',
  description: 'Get pins created by a specific user. Supports pagination via bookmark cursor.',
  summary: 'Get pins created by a user',
  icon: 'grid-2x2',
  group: 'Pins',
  input: z.object({
    username: z.string().describe('Pinterest username'),
    page_size: z.number().int().min(1).max(50).optional().describe('Number of pins per page (default 25, max 50)'),
    bookmark: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    pins: z.array(pinSchema).describe('User pins'),
    bookmark: z.string().describe('Cursor for next page, empty if no more results'),
  }),
  handle: async params => {
    const resp = await resourceGet<RawPin[]>(
      'UserPinsResource',
      {
        username: params.username,
        field_set_key: 'grid_item',
        page_size: params.page_size ?? 25,
      },
      `/${params.username}/_created/`,
      params.bookmark,
    );

    const pins = resp.resource_response.data ?? [];
    return {
      pins: pins.map(mapPin),
      bookmark: getBookmark(resp),
    };
  },
});
