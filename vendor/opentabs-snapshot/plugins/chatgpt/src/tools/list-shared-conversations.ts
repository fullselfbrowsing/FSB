import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chatgpt-api.js';
import { conversationListItemSchema, mapConversationListItem } from './schemas.js';
import type { RawConversationListItem } from './schemas.js';

export const listSharedConversations = defineTool({
  name: 'list_shared_conversations',
  displayName: 'List Shared Conversations',
  description: 'List ChatGPT conversations that have been shared via public links. Supports pagination.',
  summary: 'List shared conversations',
  icon: 'share',
  group: 'Conversations',
  input: z.object({
    offset: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
    limit: z.number().int().min(1).max(100).optional().describe('Number of results (default 25, max 100)'),
  }),
  output: z.object({
    conversations: z.array(conversationListItemSchema).describe('Shared conversations'),
    total: z.number().describe('Total number of shared conversations'),
  }),
  handle: async params => {
    const data = await api<{ items: RawConversationListItem[]; total: number }>('/shared_conversations', {
      query: {
        offset: params.offset ?? 0,
        limit: params.limit ?? 25,
      },
    });
    return {
      conversations: (data.items ?? []).map(mapConversationListItem),
      total: data.total ?? 0,
    };
  },
});
