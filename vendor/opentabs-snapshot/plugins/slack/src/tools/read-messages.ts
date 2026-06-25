import { messageSchema, paginationMetadataSchema } from './channel-schema.js';
import { slackApi } from '../slack-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const readMessages = defineTool({
  name: 'read_messages',
  displayName: 'Read Messages',
  description: 'Read recent messages from a Slack channel with optional date-range filtering and pagination',
  summary: 'Read recent messages from a channel',
  icon: 'book-open',
  group: 'Messages',
  input: z.object({
    channel: z.string().min(1).describe('Channel ID to read messages from (e.g., C01234567)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of messages to return (default 20, max 1000)'),
    oldest: z
      .string()
      .optional()
      .describe('Only return messages after this Unix timestamp (inclusive) — e.g., "1234567890.123456"'),
    latest: z
      .string()
      .optional()
      .describe('Only return messages before this Unix timestamp (inclusive) — e.g., "1234567890.123456"'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response for fetching the next page'),
  }),
  output: z.object({
    messages: z.array(messageSchema).describe('Array of messages in reverse chronological order'),
    response_metadata: paginationMetadataSchema,
  }),
  handle: async params => {
    const body: Record<string, unknown> = {
      channel: params.channel,
      limit: params.limit ?? 20,
    };
    if (params.oldest) {
      body.oldest = params.oldest;
    }
    if (params.latest) {
      body.latest = params.latest;
    }
    if (params.cursor) {
      body.cursor = params.cursor;
    }
    const data = await slackApi<{
      messages: z.infer<typeof messageSchema>[];
      response_metadata?: { next_cursor: string };
    }>('conversations.history', body);
    return {
      messages: (data.messages ?? []).map(m => ({
        type: m.type ?? 'message',
        user: m.user,
        text: m.text ?? '',
        ts: m.ts ?? '',
      })),
      response_metadata: data.response_metadata,
    };
  },
});
