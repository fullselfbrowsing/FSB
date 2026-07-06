import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';
import { type RawPost, mapPost, postSchema } from './schemas.js';

export const getDashboard = defineTool({
  name: 'get_dashboard',
  displayName: 'Get Dashboard',
  description:
    "Get posts from the authenticated user's Tumblr dashboard. Returns posts from followed blogs in reverse chronological order.",
  summary: 'Get your Tumblr dashboard',
  icon: 'layout-dashboard',
  group: 'Dashboard',
  input: z.object({
    limit: z.number().int().min(1).max(20).optional().describe('Number of posts to return (default 20, max 20)'),
    offset: z.number().int().min(0).optional().describe('Post offset for pagination'),
    type: z
      .enum(['text', 'photo', 'quote', 'link', 'chat', 'audio', 'video', 'answer'])
      .optional()
      .describe('Filter by post type'),
    since_id: z.string().optional().describe('Return posts after this post ID'),
  }),
  output: z.object({
    posts: z.array(postSchema).describe('Dashboard posts'),
  }),
  handle: async params => {
    const data = await api<{ posts: RawPost[] }>('/user/dashboard', {
      query: {
        npf: true,
        limit: params.limit,
        offset: params.offset,
        type: params.type,
        since_id: params.since_id,
      },
    });
    return { posts: (data.posts ?? []).map(mapPost) };
  },
});
