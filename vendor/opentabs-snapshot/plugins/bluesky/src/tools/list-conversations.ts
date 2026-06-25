import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { chatApi } from '../bluesky-api.js';
import { conversationSchema, mapConversation } from './schemas.js';

export const listConversations = defineTool({
  name: 'list_conversations',
  displayName: 'List Conversations',
  description:
    "List the authenticated user's direct message conversations. Returns conversations sorted by most recent activity.",
  summary: 'List DM conversations',
  icon: 'message-circle',
  group: 'Chat',
  input: z.object({
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of conversations to return (default 25, max 100)'),
  }),
  output: z.object({
    conversations: z.array(conversationSchema).describe('Array of conversations'),
    cursor: z.string().describe('Pagination cursor for the next page'),
  }),
  handle: async params => {
    const data = await chatApi<{
      convos?: Record<string, unknown>[];
      cursor?: string;
    }>('chat.bsky.convo.listConvos', {
      query: { cursor: params.cursor, limit: params.limit ?? 25 },
    });
    return {
      conversations: (data.convos ?? []).map(mapConversation),
      cursor: data.cursor ?? '',
    };
  },
});
