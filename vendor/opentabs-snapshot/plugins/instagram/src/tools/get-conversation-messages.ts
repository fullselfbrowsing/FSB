import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import { type RawMessage, mapMessage, messageSchema } from './schemas.js';

interface ThreadResponse {
  thread?: {
    thread_id?: string;
    thread_title?: string;
    items?: RawMessage[];
    has_older?: boolean;
    oldest_cursor?: string;
  };
}

export const getConversationMessages = defineTool({
  name: 'get_conversation_messages',
  displayName: 'Get Conversation Messages',
  description:
    'Get messages in a direct message conversation. Returns messages in reverse chronological order. Supports cursor pagination.',
  summary: 'Get messages in a DM conversation',
  icon: 'messages-square',
  group: 'Messaging',
  input: z.object({
    thread_id: z.string().describe('Conversation thread ID (from list_conversations)'),
    limit: z.number().int().min(1).max(20).optional().describe('Number of messages to return (default 10)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    messages: z.array(messageSchema).describe('Conversation messages'),
    has_more: z.boolean().describe('Whether more messages are available'),
    cursor: z.string().describe('Cursor for next page, empty if no more'),
  }),
  handle: async params => {
    const data = await api<ThreadResponse>(`/direct_v2/threads/${params.thread_id}/`, {
      query: {
        visual_message_return_type: 'unseen',
        direction: 'older',
        limit: params.limit ?? 10,
        cursor: params.cursor,
      },
    });
    const thread = data.thread ?? {};
    return {
      messages: (thread.items ?? []).map(mapMessage),
      has_more: thread.has_older ?? false,
      cursor: thread.oldest_cursor ?? '',
    };
  },
});
