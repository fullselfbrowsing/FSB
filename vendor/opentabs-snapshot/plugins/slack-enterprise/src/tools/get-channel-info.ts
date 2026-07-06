import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';
import { channelSchema, mapChannel } from './schemas.js';

export const getChannelInfo = defineTool({
  name: 'get_channel_info',
  displayName: 'Get Channel Info',
  description: 'Get detailed information about a Slack channel including topic, purpose, and member count.',
  summary: 'Get channel details',
  icon: 'info',
  group: 'Channels',
  input: z.object({
    channel: z.string().describe('Channel ID to get info for (e.g., C1234567890)'),
  }),
  output: z.object({ channel: channelSchema }),
  handle: async params => {
    const data = await slackApi<{ channel: Record<string, unknown> }>('conversations.info', {
      channel: params.channel,
    });
    return { channel: mapChannel(data.channel) };
  },
});
