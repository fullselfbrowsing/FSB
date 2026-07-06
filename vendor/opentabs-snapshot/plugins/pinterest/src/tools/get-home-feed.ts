import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourceGet, getBookmark } from '../pinterest-api.js';
import { pinSchema, mapPin } from './schemas.js';
import type { RawPin } from './schemas.js';

export const getHomeFeed = defineTool({
  name: 'get_home_feed',
  displayName: 'Get Home Feed',
  description:
    'Get the personalized home feed of pins for the authenticated user. Returns recommended pins based on interests and activity. Supports pagination via bookmark cursor.',
  summary: 'Get the personalized home feed',
  icon: 'home',
  group: 'Pins',
  input: z.object({
    bookmark: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    pins: z.array(pinSchema).describe('Home feed pins'),
    bookmark: z.string().describe('Cursor for next page, empty if no more results'),
  }),
  handle: async params => {
    const resp = await resourceGet<RawPin[]>(
      'UserHomefeedResource',
      {
        field_set_key: 'hifi',
        in_nux: false,
        prependPartner: [],
        prependUserNews: false,
      },
      '/',
      params.bookmark,
    );

    const pins = resp.resource_response.data ?? [];
    return {
      pins: pins.map(mapPin),
      bookmark: getBookmark(resp),
    };
  },
});
