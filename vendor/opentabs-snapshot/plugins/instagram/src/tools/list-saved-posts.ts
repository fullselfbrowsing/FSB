import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import { type RawMedia, mapMedia, mediaSchema } from './schemas.js';

interface SavedResponse {
  items?: { media?: RawMedia }[];
  more_available?: boolean;
  next_max_id?: string;
}

export const listSavedPosts = defineTool({
  name: 'list_saved_posts',
  displayName: 'List Saved Posts',
  description: 'List posts saved by the authenticated user. Supports cursor pagination via max_id.',
  summary: 'List your saved posts',
  icon: 'bookmark',
  group: 'Saved',
  input: z.object({
    max_id: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    posts: z.array(mediaSchema).describe('Saved posts'),
    more_available: z.boolean().describe('Whether more saved posts are available'),
    next_max_id: z.string().describe('Cursor for next page, empty if no more'),
  }),
  handle: async params => {
    const data = await api<SavedResponse>('/feed/saved/posts/', { query: { max_id: params.max_id } });
    return {
      posts: (data.items ?? []).map(i => mapMedia(i.media ?? {})),
      more_available: data.more_available ?? false,
      next_max_id: data.next_max_id ?? '',
    };
  },
});
