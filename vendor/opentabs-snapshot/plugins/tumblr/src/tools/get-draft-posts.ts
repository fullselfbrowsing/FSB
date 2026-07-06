import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';
import { postSchema, type RawPost, mapPost } from './schemas.js';

export const getDraftPosts = defineTool({
  name: 'get_draft_posts',
  displayName: 'Get Draft Posts',
  description: 'List draft posts for a Tumblr blog. Use before_id for pagination.',
  summary: 'List draft posts',
  icon: 'file-edit',
  group: 'Posts',
  input: z.object({
    blog_name: z.string().describe('Blog name or URL'),
    before_id: z.string().optional().describe('Post ID cursor for pagination — returns drafts before this ID'),
  }),
  output: z.object({ posts: z.array(postSchema).describe('Draft posts') }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = { npf: true };
    if (params.before_id) {
      query.before_id = params.before_id;
    }
    const res = await api<{ posts: RawPost[] }>(`/blog/${params.blog_name}/posts/draft`, { query });
    return { posts: (res.posts ?? []).map(mapPost) };
  },
});
