import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';
import { mapMessage, messageSchema } from './schemas.js';

export const replyToThread = defineTool({
  name: 'reply_to_thread',
  displayName: 'Reply to Thread',
  description: 'Reply to a message thread in Slack. Posts a reply linked to the specified parent message.',
  summary: 'Reply to a thread',
  icon: 'reply',
  group: 'Messages',
  input: z.object({
    channel: z.string().describe('Channel ID where the thread exists (e.g., C1234567890)'),
    thread_ts: z.string().describe('Timestamp of the parent message to reply to'),
    text: z.string().describe('Reply text — supports Slack mrkdwn formatting'),
  }),
  output: z.object({ message: messageSchema }),
  handle: async params => {
    const data = await slackApi<{ message: Record<string, unknown> }>('chat.postMessage', {
      channel: params.channel,
      text: params.text,
      thread_ts: params.thread_ts,
    });
    return { message: mapMessage(data.message) };
  },
});
