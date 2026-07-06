import { slackApi } from '../slack-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const editMessage = defineTool({
  name: 'edit_message',
  displayName: 'Edit Message',
  description: 'Edit an existing Slack message. The caller must be the original author of the message.',
  summary: 'Edit an existing message',
  icon: 'pencil',
  group: 'Messages',
  input: z.object({
    channel: z.string().min(1).describe('Channel ID where the message is located (e.g., C01234567)'),
    ts: z
      .string()
      .min(1)
      .describe('Timestamp of the message to edit — serves as the unique message ID (e.g., 1234567890.123456)'),
    text: z
      .string()
      .min(1)
      .describe('New message text — replaces the entire message content. Supports Slack mrkdwn formatting.'),
  }),
  output: z.object({
    channel: z.string().describe('Channel ID of the edited message'),
    ts: z.string().describe('Timestamp of the edited message'),
    text: z.string().describe('Updated message text as rendered by Slack'),
  }),
  handle: async params => {
    const data = await slackApi<{ channel?: string; ts?: string; text?: string }>('chat.update', {
      channel: params.channel,
      ts: params.ts,
      text: params.text,
    });
    return {
      channel: data.channel ?? '',
      ts: data.ts ?? '',
      text: data.text ?? '',
    };
  },
});
