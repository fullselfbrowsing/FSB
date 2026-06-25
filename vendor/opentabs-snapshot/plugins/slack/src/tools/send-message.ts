import { slackApi } from '../slack-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const sendMessage = defineTool({
  name: 'send_message',
  displayName: 'Send Message',
  description: 'Send a message to a Slack channel or thread',
  summary: 'Send a message to a channel or thread',
  icon: 'send',
  group: 'Messages',
  input: z.object({
    channel: z.string().min(1).describe('Channel ID to send the message to (e.g., C01234567)'),
    text: z.string().min(1).describe('Message text to send — supports Slack mrkdwn formatting'),
    thread_ts: z
      .string()
      .optional()
      .describe('Thread timestamp to reply in a thread — pass the ts of the parent message'),
  }),
  output: z.object({
    channel: z.string().describe('Channel ID the message was posted to'),
    ts: z.string().describe('Timestamp of the posted message — used as a unique message ID'),
  }),
  handle: async params => {
    const data = await slackApi<{ channel?: string; ts?: string }>('chat.postMessage', {
      channel: params.channel,
      text: params.text,
      thread_ts: params.thread_ts,
    });
    return { channel: data.channel ?? '', ts: data.ts ?? '' };
  },
});
