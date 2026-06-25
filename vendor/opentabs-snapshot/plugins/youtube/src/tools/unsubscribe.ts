import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-api.js';

export const unsubscribe = defineTool({
  name: 'unsubscribe',
  displayName: 'Unsubscribe',
  description: 'Unsubscribe from a YouTube channel.',
  summary: 'Unsubscribe from a channel',
  icon: 'bell-off',
  group: 'Channels',
  input: z.object({
    channel_id: z.string().describe('YouTube channel ID to unsubscribe from (starts with "UC")'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the unsubscription succeeded'),
  }),
  handle: async params => {
    await api('subscription/unsubscribe', {
      channelIds: [params.channel_id],
    });
    return { success: true };
  },
});
