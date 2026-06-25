import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';

export const createPost = defineTool({
  name: 'create_post',
  displayName: 'Create Post',
  description: 'Create a new text post on a Tumblr blog using NPF format. Defaults to published state.',
  summary: 'Create a post',
  icon: 'plus',
  group: 'Posts',
  input: z.object({
    blog_name: z.string().describe('Blog name to post to'),
    content: z.string().describe('Text content for the post'),
    tags: z.string().optional().describe('Comma-separated tags (e.g., "art, photography, nature")'),
    state: z.enum(['published', 'draft', 'queue', 'private']).optional().describe('Post state (default "published")'),
  }),
  output: z.object({
    id: z.string().describe('Created post ID'),
    state: z.string().describe('Post state'),
  }),
  handle: async params => {
    const state = params.state ?? 'published';
    const data = await api<{ id: number }>(`/blog/${params.blog_name}/posts`, {
      method: 'POST',
      body: {
        content: [{ type: 'text', text: params.content }],
        tags: params.tags,
        state,
      },
    });
    return { id: String(data.id), state };
  },
});
