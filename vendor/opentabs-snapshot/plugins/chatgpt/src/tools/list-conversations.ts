import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chatgpt-api.js';
import { conversationListItemSchema, mapConversationListItem } from './schemas.js';
import type { RawConversationListItem } from './schemas.js';

export const listConversations = defineTool({
  name: 'list_conversations',
  displayName: 'List Conversations',
  description: 'List ChatGPT conversations sorted by last updated. Supports pagination with offset and limit.',
  summary: 'List your ChatGPT conversations',
  icon: 'list',
  group: 'Conversations',
  input: z.object({
    offset: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of conversations to return (default 28, max 100)'),
    order: z.enum(['updated', 'created']).optional().describe('Sort order (default "updated")'),
  }),
  output: z.object({
    conversations: z.array(conversationListItemSchema).describe('List of conversations'),
    total: z.number().describe('Total number of conversations'),
  }),
  handle: async params => {
    const data = await api<{ items: RawConversationListItem[]; total: number }>('/conversations', {
      query: {
        offset: params.offset ?? 0,
        limit: params.limit ?? 28,
        order: params.order ?? 'updated',
      },
    });
    return {
      conversations: (data.items ?? []).map(mapConversationListItem),
      total: data.total ?? 0,
    };
  },
});
