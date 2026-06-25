import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onlyfans-api.js';
import { type RawChatMessage, chatMessageSchema, mapChatMessage } from './schemas.js';

interface MessagesResponse {
  list?: RawChatMessage[];
  hasMore?: boolean;
}

export const getChatMessages = defineTool({
  name: 'get_chat_messages',
  displayName: 'Get Chat Messages',
  description: 'Get messages in a chat conversation. Returns messages in reverse chronological order.',
  summary: 'Read messages in a chat',
  icon: 'messages-square',
  group: 'Chat',
  input: z.object({
    chat_id: z.number().int().describe('Chat ID (from list_chats)'),
    limit: z.number().int().min(1).max(50).optional().describe('Number of messages to return (default 20)'),
    offset: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
  }),
  output: z.object({
    messages: z.array(chatMessageSchema).describe('Chat messages'),
    has_more: z.boolean().describe('Whether more messages are available'),
  }),
  handle: async params => {
    const data = await api<MessagesResponse>(`/chats/${params.chat_id}/messages`, {
      query: {
        limit: params.limit ?? 20,
        offset: params.offset ?? 0,
        skip_users: 'all',
      },
    });
    return {
      messages: (data.list ?? []).map(mapChatMessage),
      has_more: data.hasMore ?? false,
    };
  },
});
