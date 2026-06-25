import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';
import { type RawPost, mapPost, postSchema } from './schemas.js';

export const getQueuedPosts = defineTool({
  name: 'get_queued_posts',
  displayName: 'Get Queued Posts',
  description: 'Get posts in the queue for a blog. Queued posts are scheduled to be published automatically.',
  summary: 'Get queued posts for a blog',
  icon: 'clock',
  group: 'Posts',
  input: z.object({
    blog_name: z.string().describe('Blog name'),
    limit: z.number().int().min(1).max(20).optional().describe('Number of posts to return (default 20, max 20)'),
    offset: z.number().int().min(0).optional().describe('Post offset for pagination'),
  }),
  output: z.object({
    posts: z.array(postSchema).describe('Queued posts'),
  }),
  handle: async params => {
    const data = await api<{ posts: RawPost[] }>(`/blog/${params.blog_name}/posts/queue`, {
      query: {
        limit: params.limit,
        offset: params.offset,
        npf: true,
      },
    });
    return { posts: (data.posts ?? []).map(mapPost) };
  },
});
