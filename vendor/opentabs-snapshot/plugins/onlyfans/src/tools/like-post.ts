import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onlyfans-api.js';

export const likePost = defineTool({
  name: 'like_post',
  displayName: 'Like Post',
  description: 'Toggle the like/favorite status on a post. If the post is already liked, it will be unliked.',
  summary: 'Like or unlike a post',
  icon: 'heart',
  group: 'Feed',
  input: z.object({
    post_id: z.number().int().describe('Post ID to like/unlike'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/posts/${params.post_id}/favorites/${params.post_id}`, { method: 'POST' });
    return { success: true };
  },
});
