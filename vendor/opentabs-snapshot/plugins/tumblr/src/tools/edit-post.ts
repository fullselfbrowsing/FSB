import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';

export const editPost = defineTool({
  name: 'edit_post',
  displayName: 'Edit Post',
  description: 'Edit an existing Tumblr post. Only provided fields are updated.',
  summary: 'Edit a post',
  icon: 'pencil',
  group: 'Posts',
  input: z.object({
    blog_name: z.string().describe('Blog name or URL'),
    post_id: z.string().describe('Post ID to edit'),
    content: z.string().optional().describe('New text content for the post'),
    tags: z.string().optional().describe('Comma-separated tags (replaces existing tags)'),
    state: z.enum(['published', 'draft', 'queue', 'private']).optional().describe('New post state'),
  }),
  output: z.object({ id: z.string().describe('Edited post ID') }),
  handle: async params => {
    const body: Record<string, unknown> = {};
    if (params.content !== undefined) {
      body.content = [{ type: 'text', text: params.content }];
    }
    if (params.tags !== undefined) {
      body.tags = params.tags;
    }
    if (params.state !== undefined) {
      body.state = params.state;
    }
    await api(`/blog/${params.blog_name}/posts/${params.post_id}`, { method: 'PUT', body });
    return { id: params.post_id };
  },
});
