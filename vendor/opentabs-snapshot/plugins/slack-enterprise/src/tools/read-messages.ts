import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';
import { mapMessage, messageSchema, paginationMetadataSchema } from './schemas.js';

export const readMessages = defineTool({
  name: 'read_messages',
  displayName: 'Read Messages',
  description:
    'Read recent messages from a Slack channel with optional date-range filtering and pagination. Returns messages in reverse chronological order.',
  summary: 'Read messages from a channel',
  icon: 'message-square',
  group: 'Messages',
  input: z.object({
    channel: z.string().describe('Channel ID to read messages from (e.g., C1234567890)'),
    limit: z.number().optional().default(20).describe('Maximum number of messages to return (default 20, max 1000)'),
    oldest: z.string().optional().describe('Only return messages after this Unix timestamp (inclusive)'),
    latest: z.string().optional().describe('Only return messages before this Unix timestamp (inclusive)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response for fetching the next page'),
  }),
  output: z.object({
    messages: z.array(messageSchema),
    has_more: z.boolean(),
    pagination: paginationMetadataSchema,
  }),
  handle: async params => {
    const apiParams: Record<string, unknown> = {
      channel: params.channel,
      limit: Math.min(params.limit ?? 20, 1000),
    };
    if (params.oldest) apiParams.oldest = params.oldest;
    if (params.latest) apiParams.latest = params.latest;
    if (params.cursor) apiParams.cursor = params.cursor;

    const data = await slackApi<{
      messages: Array<Record<string, unknown>>;
      has_more: boolean;
      response_metadata?: { next_cursor?: string };
    }>('conversations.history', apiParams);

    return {
      messages: (data.messages ?? []).map(mapMessage),
      has_more: data.has_more ?? false,
      pagination: { next_cursor: data.response_metadata?.next_cursor },
    };
  },
});
