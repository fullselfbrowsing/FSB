import { slackApi } from '../slack-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const setChannelPurpose = defineTool({
  name: 'set_channel_purpose',
  displayName: 'Set Channel Purpose',
  description: 'Set the purpose of a Slack channel',
  summary: 'Set the purpose of a channel',
  icon: 'target',
  group: 'Channels',
  input: z.object({
    channel: z.string().min(1).describe('Channel ID to set the purpose for (e.g., C01234567)'),
    purpose: z.string().min(1).max(250).describe('New purpose text for the channel (max 250 chars)'),
  }),
  output: z.object({
    purpose: z
      .object({
        value: z.string().describe('The purpose text that was set'),
        creator: z.string().describe('User ID who set the purpose'),
        last_set: z.number().describe('Unix timestamp of when the purpose was last set'),
      })
      .describe('Purpose metadata'),
  }),
  handle: async params => {
    const data = await slackApi<{
      channel?: { purpose?: { value?: string; creator?: string; last_set?: number } };
    }>('conversations.setPurpose', {
      channel: params.channel,
      purpose: params.purpose,
    });
    return {
      purpose: {
        value: data.channel?.purpose?.value ?? params.purpose,
        creator: data.channel?.purpose?.creator ?? '',
        last_set: data.channel?.purpose?.last_set ?? 0,
      },
    };
  },
});
