import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';

export const setChannelTopic = defineTool({
  name: 'set_channel_topic',
  displayName: 'Set Channel Topic',
  description:
    'Set the topic of a Slack channel. The topic appears in the channel header and is visible to all members. Max 250 characters.',
  summary: 'Set channel topic',
  icon: 'type',
  group: 'Conversations',
  input: z.object({
    channel: z.string().describe('Channel ID (e.g., C1234567890)'),
    topic: z.string().max(250).describe('New topic text for the channel (max 250 chars)'),
  }),
  output: z.object({
    topic: z.object({
      value: z.string(),
      creator: z.string(),
      last_set: z.number(),
    }),
  }),
  handle: async params => {
    const data = await slackApi<{ topic: { value: string; creator: string; last_set: number } }>(
      'conversations.setTopic',
      { channel: params.channel, topic: params.topic },
    );
    return {
      topic: {
        value: data.topic?.value ?? params.topic,
        creator: data.topic?.creator ?? '',
        last_set: data.topic?.last_set ?? 0,
      },
    };
  },
});
