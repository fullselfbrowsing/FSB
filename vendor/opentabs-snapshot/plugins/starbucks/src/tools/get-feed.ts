import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../starbucks-api.js';
import { mapStreamItem, streamItemSchema } from './schemas.js';

export const getFeed = defineTool({
  name: 'get_feed',
  displayName: 'Get Feed',
  description:
    'Get the personalized "For You" feed of promotions, offers, and content from Starbucks. Includes seasonal highlights, new products, and personalized recommendations.',
  summary: 'Get personalized promotions and offers feed',
  icon: 'rss',
  group: 'Feed',
  input: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('Maximum number of feed items to return (default 10)'),
    offset: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
  }),
  output: z.object({
    items: z.array(streamItemSchema).describe('Feed stream items'),
    total: z.number().describe('Total number of available items'),
  }),
  handle: async params => {
    interface StreamResponse {
      paging?: { total?: number };
      streamItems?: Array<Record<string, unknown>>;
    }
    const data = await api<StreamResponse>('/stream-items', {
      query: {
        limit: params.limit ?? 10,
        offset: params.offset ?? 0,
      },
    });
    return {
      items: (data.streamItems ?? []).map(s => mapStreamItem(s as Parameters<typeof mapStreamItem>[0])),
      total: data.paging?.total ?? 0,
    };
  },
});
