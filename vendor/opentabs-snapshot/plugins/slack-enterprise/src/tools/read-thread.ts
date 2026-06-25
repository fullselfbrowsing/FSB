import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';
import { mapMessage, messageSchema } from './schemas.js';

export const readThread = defineTool({
  name: 'read_thread',
  displayName: 'Read Thread',
  description:
    'Read replies in a Slack thread. Returns all messages including the parent message, with optional pagination.',
  summary: 'Read thread replies',
  icon: 'messages-square',
  group: 'Messages',
  input: z.object({
    channel: z.string().describe('Channel ID containing the thread (e.g., C1234567890)'),
    ts: z.string().describe('Timestamp of the parent message (thread_ts)'),
    limit: z.number().optional().default(50).describe('Maximum number of replies to return (default 50, max 1000)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    messages: z.array(messageSchema),
    has_more: z.boolean(),
  }),
  handle: async params => {
    const apiParams: Record<string, unknown> = {
      channel: params.channel,
      ts: params.ts,
      limit: Math.min(params.limit ?? 50, 1000),
    };
    if (params.cursor) apiParams.cursor = params.cursor;

    const data = await slackApi<{
      messages: Array<Record<string, unknown>>;
      has_more: boolean;
    }>('conversations.replies', apiParams);

    return {
      messages: (data.messages ?? []).map(mapMessage),
      has_more: data.has_more ?? false,
    };
  },
});
