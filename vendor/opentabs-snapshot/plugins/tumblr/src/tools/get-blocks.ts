import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';
import { type RawBlog, blogSchema, mapBlog } from './schemas.js';

export const getBlocks = defineTool({
  name: 'get_blocks',
  displayName: 'Get Blocks',
  description: 'Get the list of blogs blocked by a Tumblr blog.',
  summary: 'List blocked blogs',
  icon: 'shield',
  group: 'Moderation',
  input: z.object({
    blog_name: z.string().describe('Blog name or identifier (e.g., "staff" or "staff.tumblr.com")'),
    limit: z.number().int().min(1).max(20).optional().describe('Number of blocked blogs to return (1-20)'),
    offset: z.number().int().min(0).optional().describe('Offset for pagination'),
  }),
  output: z.object({
    blocked_blogs: z.array(blogSchema).describe('Blocked blogs'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {};
    query.limit = params.limit ?? 20;
    if (params.offset !== undefined) query.offset = params.offset;

    const data = await api<{ blockedTumblelogs: RawBlog[] }>(`/blog/${params.blog_name}/blocks`, { query });

    return {
      blocked_blogs: (data.blockedTumblelogs ?? []).map(mapBlog),
    };
  },
});
