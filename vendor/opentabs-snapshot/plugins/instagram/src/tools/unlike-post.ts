import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';

export const unlikePost = defineTool({
  name: 'unlike_post',
  displayName: 'Unlike Post',
  description: 'Remove a like from an Instagram post.',
  summary: 'Unlike a post',
  icon: 'heart-off',
  group: 'Posts',
  input: z.object({
    media_id: z.string().describe('Media numeric pk'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/web/likes/${params.media_id}/unlike/`, { method: 'POST', body: '', formEncoded: true });
    return { success: true };
  },
});
