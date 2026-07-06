import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';
import { type RawBlog, blogSchema, mapBlog } from './schemas.js';

export const getUserFollowing = defineTool({
  name: 'get_user_following',
  displayName: 'Get User Following',
  description: 'Get blogs followed by the authenticated Tumblr user with the total count.',
  summary: 'Get blogs you follow',
  icon: 'users',
  group: 'Account',
  input: z.object({
    limit: z.number().int().min(1).max(20).optional().describe('Number of blogs to return (default 20, max 20)'),
    offset: z.number().int().min(0).optional().describe('Blog offset for pagination'),
  }),
  output: z.object({
    blogs: z.array(blogSchema).describe('Followed blogs'),
    total: z.number().describe('Total blogs followed'),
  }),
  handle: async params => {
    const data = await api<{ blogs: RawBlog[]; total_blogs: number }>('/user/following', {
      query: {
        limit: params.limit ?? 20,
        offset: params.offset,
      },
    });
    return {
      blogs: (data.blogs ?? []).map(mapBlog),
      total: data.total_blogs ?? 0,
    };
  },
});
