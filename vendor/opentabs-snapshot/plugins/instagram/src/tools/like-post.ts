import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';

export const likePost = defineTool({
  name: 'like_post',
  displayName: 'Like Post',
  description: 'Like an Instagram post by its media ID.',
  summary: 'Like a post',
  icon: 'heart',
  group: 'Posts',
  input: z.object({
    media_id: z.string().describe('Media numeric pk'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/web/likes/${params.media_id}/like/`, { method: 'POST', body: '', formEncoded: true });
    return { success: true };
  },
});
