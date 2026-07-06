import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';

export const updateMessage = defineTool({
  name: 'update_message',
  displayName: 'Update Message',
  description: 'Edit an existing Slack message. The caller must be the original author of the message.',
  summary: 'Edit an existing message',
  icon: 'pencil',
  group: 'Messages',
  input: z.object({
    channel: z.string().describe('Channel ID where the message is located (e.g., C1234567890)'),
    timestamp: z.string().describe('Timestamp of the message to update'),
    text: z.string().describe('New text for the message — replaces the entire message content'),
  }),
  output: z.object({ success: z.boolean(), ts: z.string() }),
  handle: async params => {
    const data = await slackApi<{ ts: string }>('chat.update', {
      channel: params.channel,
      ts: params.timestamp,
      text: params.text,
    });
    return { success: true, ts: data.ts ?? params.timestamp };
  },
});
