import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import { type RawMedia, mapMedia, mediaSchema } from './schemas.js';

interface UserFeedResponse {
  items?: RawMedia[];
  more_available?: boolean;
  next_max_id?: string;
}

export const getUserPosts = defineTool({
  name: 'get_user_posts',
  displayName: 'Get User Posts',
  description:
    'Get recent posts by a user. Requires the user numeric ID (use get_user_profile to find it from a username). Supports cursor-based pagination via max_id.',
  summary: 'Get posts from a user',
  icon: 'image',
  group: 'Users',
  input: z.object({
    user_id: z.string().describe('User numeric ID (pk)'),
    count: z.number().int().min(1).max(33).optional().describe('Number of posts to return (default 12, max 33)'),
    max_id: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    posts: z.array(mediaSchema).describe('User posts'),
    more_available: z.boolean().describe('Whether more posts are available'),
    next_max_id: z.string().describe('Cursor for next page, empty if no more'),
  }),
  handle: async params => {
    const data = await api<UserFeedResponse>(`/feed/user/${params.user_id}/`, {
      query: { count: params.count ?? 12, max_id: params.max_id },
    });
    return {
      posts: (data.items ?? []).map(mapMedia),
      more_available: data.more_available ?? false,
      next_max_id: data.next_max_id ?? '',
    };
  },
});
