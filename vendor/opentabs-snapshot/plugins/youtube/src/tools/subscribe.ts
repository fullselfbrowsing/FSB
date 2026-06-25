import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-api.js';

export const subscribe = defineTool({
  name: 'subscribe',
  displayName: 'Subscribe',
  description: 'Subscribe to a YouTube channel. The channel will appear in the subscriptions feed.',
  summary: 'Subscribe to a channel',
  icon: 'bell',
  group: 'Channels',
  input: z.object({
    channel_id: z.string().describe('YouTube channel ID to subscribe to (starts with "UC")'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the subscription succeeded'),
  }),
  handle: async params => {
    await api('subscription/subscribe', {
      channelIds: [params.channel_id],
    });
    return { success: true };
  },
});
