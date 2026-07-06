import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';
import { type RawPost, mapPost, postSchema } from './schemas.js';

export const getSubmissions = defineTool({
  name: 'get_submissions',
  displayName: 'Get Submissions',
  description: 'Get posts submitted to a blog by other users. Only available for blogs you own.',
  summary: 'Get submitted posts for a blog',
  icon: 'inbox',
  group: 'Posts',
  input: z.object({
    blog_name: z.string().describe('Blog name'),
    offset: z.number().int().min(0).optional().describe('Post offset for pagination'),
  }),
  output: z.object({
    posts: z.array(postSchema).describe('Submitted posts'),
  }),
  handle: async params => {
    const data = await api<{ posts: RawPost[] }>(`/blog/${params.blog_name}/posts/submission`, {
      query: {
        offset: params.offset,
        npf: true,
      },
    });
    return { posts: (data.posts ?? []).map(mapPost) };
  },
});
