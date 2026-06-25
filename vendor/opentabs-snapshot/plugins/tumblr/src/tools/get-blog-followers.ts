import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';
import { type RawFollower, followerSchema, mapFollower } from './schemas.js';

export const getBlogFollowers = defineTool({
  name: 'get_blog_followers',
  displayName: 'Get Blog Followers',
  description: 'Get the list of followers for a Tumblr blog.',
  summary: 'List blog followers',
  icon: 'users',
  group: 'Blogs',
  input: z.object({
    blog_name: z.string().describe('Blog name or identifier (e.g., "staff" or "staff.tumblr.com")'),
    limit: z.number().int().min(1).max(20).optional().describe('Number of followers to return (1-20)'),
    offset: z.number().int().min(0).optional().describe('Follower offset for pagination'),
  }),
  output: z.object({
    followers: z.array(followerSchema).describe('Blog followers'),
    total: z.number().describe('Total followers'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {};
    query.limit = params.limit ?? 20;
    if (params.offset !== undefined) query.offset = params.offset;

    const data = await api<{ users: RawFollower[]; totalUsers: number }>(`/blog/${params.blog_name}/followers`, {
      query,
    });

    return {
      followers: (data.users ?? []).map(mapFollower),
      total: data.totalUsers ?? 0,
    };
  },
});
