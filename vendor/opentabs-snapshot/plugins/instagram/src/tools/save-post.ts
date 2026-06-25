import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';

export const savePost = defineTool({
  name: 'save_post',
  displayName: 'Save Post',
  description: 'Save an Instagram post to your saved collection.',
  summary: 'Save a post',
  icon: 'bookmark',
  group: 'Posts',
  input: z.object({
    media_id: z.string().describe('Media numeric pk'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/web/save/${params.media_id}/save/`, { method: 'POST', body: '', formEncoded: true });
    return { success: true };
  },
});
