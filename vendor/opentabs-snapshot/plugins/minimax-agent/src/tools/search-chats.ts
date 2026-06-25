import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';
import { chatSchema, mapChat } from './schemas.js';
import type { RawChat } from './schemas.js';

export const searchChats = defineTool({
  name: 'search_chats',
  displayName: 'Search Chats',
  description: 'Search for chat conversations by name.',
  summary: 'Search chats by keyword',
  icon: 'search',
  group: 'Chats',
  input: z.object({
    keyword: z.string().describe('Search keyword'),
  }),
  output: z.object({
    items: z.array(chatSchema).describe('Matching chats'),
    has_more: z.boolean().describe('Whether more results are available'),
  }),
  handle: async params => {
    const data = await apiPost<{
      chats?: RawChat[];
      has_more?: boolean;
    }>('/matrix/api/v1/chat/search_chat_by_name', {
      keyword: params.keyword,
    });
    return {
      items: (data.chats ?? []).map(mapChat),
      has_more: data.has_more ?? false,
    };
  },
});
