import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourceGet, getBookmark } from '../pinterest-api.js';
import { pinSchema, mapPin } from './schemas.js';
import type { RawPin } from './schemas.js';

export const getRelatedPins = defineTool({
  name: 'get_related_pins',
  displayName: 'Get Related Pins',
  description:
    'Get pins related to a specific pin. Useful for discovering similar content and recommendations. Supports pagination via bookmark cursor.',
  summary: 'Get pins related to a specific pin',
  icon: 'sparkles',
  group: 'Pins',
  input: z.object({
    pin_id: z.string().describe('Pin ID to find related pins for'),
    page_size: z.number().int().min(1).max(50).optional().describe('Number of results (default 25, max 50)'),
    bookmark: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    pins: z.array(pinSchema).describe('Related pins'),
    bookmark: z.string().describe('Cursor for next page, empty if no more results'),
  }),
  handle: async params => {
    const resp = await resourceGet<RawPin[]>(
      'RelatedPinFeedResource',
      {
        pin: params.pin_id,
        page_size: params.page_size ?? 25,
        field_set_key: 'unauth_react',
      },
      `/pin/${params.pin_id}/`,
      params.bookmark,
    );

    const pins = resp.resource_response.data ?? [];
    return {
      pins: pins.map(mapPin),
      bookmark: getBookmark(resp),
    };
  },
});
