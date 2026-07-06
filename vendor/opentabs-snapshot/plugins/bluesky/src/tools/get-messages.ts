import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { chatApi } from '../bluesky-api.js';
import { mapMessage, messageSchema } from './schemas.js';

export const getMessages = defineTool({
  name: 'get_messages',
  displayName: 'Get Messages',
  description: 'Get messages in a conversation. Returns messages sorted by most recent first.',
  summary: 'Get messages in a conversation',
  icon: 'messages-square',
  group: 'Chat',
  input: z.object({
    convo_id: z.string().describe('Conversation ID'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of messages to return (default 25, max 100)'),
  }),
  output: z.object({
    messages: z.array(messageSchema).describe('Array of messages'),
    cursor: z.string().describe('Pagination cursor for the next page'),
  }),
  handle: async params => {
    const data = await chatApi<{
      messages?: Record<string, unknown>[];
      cursor?: string;
    }>('chat.bsky.convo.getMessages', {
      query: { convoId: params.convo_id, cursor: params.cursor, limit: params.limit ?? 25 },
    });
    return {
      messages: (data.messages ?? []).map(mapMessage),
      cursor: data.cursor ?? '',
    };
  },
});
