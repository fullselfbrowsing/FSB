import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';

export const setChannelPurpose = defineTool({
  name: 'set_channel_purpose',
  displayName: 'Set Channel Purpose',
  description:
    'Set the purpose/description of a Slack channel. The purpose describes what the channel is used for and appears in channel details. Max 250 characters.',
  summary: 'Set channel purpose',
  icon: 'align-left',
  group: 'Conversations',
  input: z.object({
    channel: z.string().describe('Channel ID (e.g., C1234567890)'),
    purpose: z.string().max(250).describe('New purpose for the channel (max 250 chars)'),
  }),
  output: z.object({
    purpose: z.object({
      value: z.string(),
      creator: z.string(),
      last_set: z.number(),
    }),
  }),
  handle: async params => {
    const data = await slackApi<{ purpose: { value: string; creator: string; last_set: number } }>(
      'conversations.setPurpose',
      { channel: params.channel, purpose: params.purpose },
    );
    return {
      purpose: {
        value: data.purpose?.value ?? params.purpose,
        creator: data.purpose?.creator ?? '',
        last_set: data.purpose?.last_set ?? 0,
      },
    };
  },
});
