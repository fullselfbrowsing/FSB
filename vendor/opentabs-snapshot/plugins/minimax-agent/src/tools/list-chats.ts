import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';
import { chatSchema, mapChat } from './schemas.js';
import type { RawChat } from './schemas.js';

export const listChats = defineTool({
  name: 'list_chats',
  displayName: 'List Chats',
  description: 'List chat conversations with pagination support. Returns chats sorted by most recent activity.',
  summary: 'List chat conversations',
  icon: 'list',
  group: 'Chats',
  input: z.object({
    page_num: z.number().int().min(1).optional().describe('Page number (default 1)'),
    page_size: z.number().int().min(1).max(50).optional().describe('Results per page (default 20)'),
    chat_type: z.number().int().optional().describe('Chat type filter (2=agent tasks)'),
  }),
  output: z.object({
    items: z.array(chatSchema).describe('List of chats'),
    has_more: z.boolean().describe('Whether more results are available'),
  }),
  handle: async params => {
    const data = await apiPost<{
      chats?: RawChat[];
      has_more?: boolean;
    }>('/matrix/api/v1/chat/list_chat', {
      page_num: params.page_num ?? 1,
      page_size: params.page_size ?? 20,
      ...(params.chat_type != null && { chat_type: params.chat_type }),
    });
    return {
      items: (data.chats ?? []).map(mapChat),
      has_more: data.has_more ?? false,
    };
  },
});
