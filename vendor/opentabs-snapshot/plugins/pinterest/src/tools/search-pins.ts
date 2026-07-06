import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourceGet, getBookmark } from '../pinterest-api.js';
import { pinSchema, mapPin } from './schemas.js';
import type { RawPin } from './schemas.js';

export const searchPins = defineTool({
  name: 'search_pins',
  displayName: 'Search Pins',
  description:
    'Search for pins on Pinterest by keyword query. Returns matching pins with images, descriptions, and links. Supports pagination via bookmark cursor.',
  summary: 'Search for pins by keyword',
  icon: 'search',
  group: 'Pins',
  input: z.object({
    query: z.string().describe('Search query text'),
    bookmark: z.string().optional().describe('Pagination cursor from a previous response'),
    page_size: z.number().int().min(1).max(50).optional().describe('Number of results per page (default 25, max 50)'),
  }),
  output: z.object({
    pins: z.array(pinSchema).describe('Matching pins'),
    bookmark: z.string().describe('Cursor for next page, empty if no more results'),
  }),
  handle: async params => {
    const resp = await resourceGet<{ results?: RawPin[] }>(
      'BaseSearchResource',
      {
        query: params.query,
        scope: 'pins',
        field_set_key: 'unauth_react',
        page_size: params.page_size ?? 25,
      },
      `/search/pins/?q=${encodeURIComponent(params.query)}`,
      params.bookmark,
    );

    const results = resp.resource_response.data?.results ?? [];
    return {
      pins: results.map(mapPin),
      bookmark: getBookmark(resp),
    };
  },
});
