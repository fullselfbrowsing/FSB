import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onlyfans-api.js';
import { type RawChat, chatSchema, mapChat } from './schemas.js';

interface ChatsResponse {
  list?: RawChat[];
  hasMore?: boolean;
  nextOffset?: number;
}

export const listChats = defineTool({
  name: 'list_chats',
  displayName: 'List Chats',
  description: 'List chat conversations. Returns conversations sorted by most recent activity with unread counts.',
  summary: 'List your chat conversations',
  icon: 'message-circle',
  group: 'Chat',
  input: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('Number of chats to return (default 10)'),
    offset: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
  }),
  output: z.object({
    chats: z.array(chatSchema).describe('Chat conversations'),
    has_more: z.boolean().describe('Whether more chats are available'),
  }),
  handle: async params => {
    const data = await api<ChatsResponse>('/chats', {
      query: {
        limit: params.limit ?? 10,
        offset: params.offset ?? 0,
        skip_users: 'all',
      },
    });
    return {
      chats: (data.list ?? []).map(mapChat),
      has_more: data.hasMore ?? false,
    };
  },
});
