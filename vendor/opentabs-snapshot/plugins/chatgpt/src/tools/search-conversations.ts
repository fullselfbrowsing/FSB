import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chatgpt-api.js';
import { conversationListItemSchema, mapConversationListItem } from './schemas.js';

interface RawSearchResult {
  conversation_id?: string;
  title?: string;
  update_time?: number;
  is_archived?: boolean;
  is_starred?: boolean | null;
  payload?: { snippet?: string };
}

export const searchConversations = defineTool({
  name: 'search_conversations',
  displayName: 'Search Conversations',
  description: 'Search ChatGPT conversations by text query. Searches across conversation titles and message content.',
  summary: 'Search conversations by keyword',
  icon: 'search',
  group: 'Conversations',
  input: z.object({
    query: z.string().describe('Search query text'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum results to return (default 28)'),
  }),
  output: z.object({
    conversations: z.array(conversationListItemSchema).describe('Matching conversations'),
    cursor: z.string().describe('Cursor for next page, empty if no more'),
  }),
  handle: async params => {
    const data = await api<{ items?: RawSearchResult[]; cursor?: string }>('/conversations/search', {
      query: {
        query: params.query,
        limit: params.limit ?? 28,
      },
    });
    // The search endpoint uses conversation_id instead of id and a nested payload for snippets
    const conversations = (data.items ?? []).map(item =>
      mapConversationListItem({
        id: item.conversation_id,
        title: item.title,
        update_time: item.update_time ? new Date(item.update_time * 1000).toISOString() : undefined,
        is_archived: item.is_archived,
        is_starred: item.is_starred ?? undefined,
        snippet: item.payload?.snippet,
      }),
    );
    return {
      conversations,
      cursor: data.cursor ?? '',
    };
  },
});
