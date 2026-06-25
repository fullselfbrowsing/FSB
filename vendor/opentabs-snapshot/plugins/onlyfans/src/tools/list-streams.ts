import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onlyfans-api.js';
import { type RawPost, mapPost, postSchema } from './schemas.js';

interface StreamsFeedResponse {
  list?: RawPost[];
  hasMore?: boolean;
  marker?: number;
}

export const listStreams = defineTool({
  name: 'list_streams',
  displayName: 'List Streams',
  description:
    'Get the streams feed with content from subscribed creators. Similar to the main feed but focused on streaming content.',
  summary: 'Get the streams feed',
  icon: 'radio',
  group: 'Content',
  input: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('Number of items to return (default 10)'),
  }),
  output: z.object({
    posts: z.array(postSchema).describe('Stream feed posts'),
    has_more: z.boolean().describe('Whether more content is available'),
  }),
  handle: async params => {
    const data = await api<StreamsFeedResponse>('/streams/feed', {
      query: { limit: params.limit ?? 10, skip_users: 'all' },
    });
    return {
      posts: (data.list ?? []).map(mapPost),
      has_more: data.hasMore ?? false,
    };
  },
});
