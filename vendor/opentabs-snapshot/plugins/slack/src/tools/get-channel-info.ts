import { channelSchema, mapChannel } from './channel-schema.js';
import { slackApi } from '../slack-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import type { SlackChannel } from './channel-schema.js';

export const getChannelInfo = defineTool({
  name: 'get_channel_info',
  displayName: 'Get Channel Info',
  description: 'Get detailed information about a Slack channel including topic, purpose, and member count',
  summary: 'Get detailed information about a channel',
  icon: 'info',
  group: 'Channels',
  input: z.object({
    channel: z.string().min(1).describe('Channel ID to get info for (e.g., C01234567)'),
  }),
  output: z.object({
    channel: channelSchema.describe('Detailed channel information'),
  }),
  handle: async params => {
    const data = await slackApi<{ channel?: SlackChannel }>('conversations.info', {
      channel: params.channel,
    });
    return { channel: mapChannel(data.channel ?? {}) };
  },
});
