import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onlyfans-api.js';
import { type RawPost, mapPost, postSchema } from './schemas.js';

export const getPost = defineTool({
  name: 'get_post',
  displayName: 'Get Post',
  description: 'Get a single post by its ID. Returns the full post content including media attachments.',
  summary: 'Get a post by ID',
  icon: 'file-text',
  group: 'Feed',
  input: z.object({
    post_id: z.number().int().describe('Post ID'),
  }),
  output: z.object({
    post: postSchema.describe('Post details'),
  }),
  handle: async params => {
    const data = await api<RawPost>(`/posts/${params.post_id}`);
    return { post: mapPost(data) };
  },
});
