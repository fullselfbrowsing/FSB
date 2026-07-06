import { messageSchema, paginationMetadataSchema } from './channel-schema.js';
import { slackApi } from '../slack-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

const replySchema = messageSchema.extend({
  thread_ts: z.string().optional().describe('Parent message timestamp'),
});

export const readThread = defineTool({
  name: 'read_thread',
  displayName: 'Read Thread',
  description:
    'Read replies in a Slack thread. Returns all messages including the parent message, with optional pagination.',
  summary: 'Read replies in a thread',
  icon: 'message-square',
  group: 'Messages',
  input: z.object({
    channel: z.string().min(1).describe('Channel ID containing the thread (e.g., C01234567)'),
    ts: z.string().min(1).describe('Timestamp of the parent message (thread_ts)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of replies to return (default 20, max 1000)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    messages: z.array(replySchema).describe('Array of thread replies including the parent message'),
    has_more: z.boolean().describe('Whether there are more replies to fetch'),
    response_metadata: paginationMetadataSchema,
  }),
  handle: async params => {
    const data = await slackApi<{
      messages: z.infer<typeof replySchema>[];
      has_more: boolean;
      response_metadata?: { next_cursor: string };
    }>('conversations.replies', {
      channel: params.channel,
      ts: params.ts,
      limit: params.limit ?? 20,
      cursor: params.cursor,
    });
    return {
      messages: (data.messages ?? []).map(m => ({
        type: m.type ?? 'message',
        user: m.user,
        text: m.text ?? '',
        ts: m.ts ?? '',
        thread_ts: m.thread_ts,
      })),
      has_more: data.has_more ?? false,
      response_metadata: data.response_metadata?.next_cursor
        ? { next_cursor: data.response_metadata.next_cursor }
        : undefined,
    };
  },
});
