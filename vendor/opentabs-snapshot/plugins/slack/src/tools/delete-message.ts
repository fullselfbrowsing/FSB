import { slackApi } from '../slack-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const deleteMessage = defineTool({
  name: 'delete_message',
  displayName: 'Delete Message',
  description:
    'Delete a Slack message. The caller must be the original author, or the channel must allow message deletion.',
  summary: 'Delete a message from a channel',
  icon: 'trash-2',
  group: 'Messages',
  input: z.object({
    channel: z.string().min(1).describe('Channel ID where the message is located (e.g., C01234567)'),
    ts: z
      .string()
      .min(1)
      .describe('Timestamp of the message to delete — serves as the unique message ID (e.g., 1234567890.123456)'),
  }),
  output: z.object({
    channel: z.string().describe('Channel ID of the deleted message'),
    ts: z.string().describe('Timestamp of the deleted message'),
  }),
  handle: async params => {
    const data = await slackApi<{ channel?: string; ts?: string }>('chat.delete', {
      channel: params.channel,
      ts: params.ts,
    });
    return {
      channel: data.channel ?? '',
      ts: data.ts ?? '',
    };
  },
});
