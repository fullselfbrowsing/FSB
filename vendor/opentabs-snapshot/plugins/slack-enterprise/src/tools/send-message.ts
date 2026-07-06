import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';
import { mapMessage, messageSchema } from './schemas.js';

export const sendMessage = defineTool({
  name: 'send_message',
  displayName: 'Send Message',
  description:
    'Send a message to a Slack channel or direct message. Supports Slack mrkdwn formatting. To reply in a thread, use reply_to_thread instead.',
  summary: 'Send a message to a channel or DM',
  icon: 'send',
  group: 'Messages',
  input: z.object({
    channel: z.string().describe('Channel ID to send the message to (e.g., C1234567890)'),
    text: z.string().describe('Message text to send — supports Slack mrkdwn formatting'),
  }),
  output: z.object({ message: messageSchema }),
  handle: async params => {
    const data = await slackApi<{ message: Record<string, unknown> }>('chat.postMessage', {
      channel: params.channel,
      text: params.text,
    });
    return { message: mapMessage(data.message) };
  },
});
