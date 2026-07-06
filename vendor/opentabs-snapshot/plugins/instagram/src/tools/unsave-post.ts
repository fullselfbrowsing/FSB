import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';

export const unsavePost = defineTool({
  name: 'unsave_post',
  displayName: 'Unsave Post',
  description: 'Remove a saved post from your saved collection.',
  summary: 'Unsave a post',
  icon: 'bookmark-minus',
  group: 'Posts',
  input: z.object({
    media_id: z.string().describe('Media numeric pk'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/web/save/${params.media_id}/unsave/`, { method: 'POST', body: '', formEncoded: true });
    return { success: true };
  },
});
