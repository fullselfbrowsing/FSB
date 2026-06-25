import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';

export const deleteMessage = defineTool({
  name: 'delete_message',
  displayName: 'Delete Message',
  description:
    'Delete a message from a Slack channel. The caller must be the original author, or the channel must allow message deletion. This action is permanent and irreversible.',
  summary: 'Delete a message',
  icon: 'trash-2',
  group: 'Messages',
  input: z.object({
    channel: z.string().describe('Channel ID where the message is located (e.g., C1234567890)'),
    timestamp: z.string().describe('Timestamp of the message to delete'),
  }),
  output: z.object({ success: z.boolean() }),
  handle: async params => {
    await slackApi('chat.delete', {
      channel: params.channel,
      ts: params.timestamp,
    });
    return { success: true };
  },
});
