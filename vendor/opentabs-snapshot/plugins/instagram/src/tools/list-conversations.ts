import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import { type RawThread, mapThread, threadSchema } from './schemas.js';

interface InboxResponse {
  inbox?: {
    threads?: RawThread[];
    unseen_count?: number;
    has_older?: boolean;
    oldest_cursor?: string;
  };
}

export const listConversations = defineTool({
  name: 'list_conversations',
  displayName: 'List Conversations',
  description:
    'List direct message conversations. Returns threads sorted by most recent activity. Supports cursor pagination.',
  summary: 'List DM conversations',
  icon: 'mail',
  group: 'Messaging',
  input: z.object({
    limit: z.number().int().min(1).max(20).optional().describe('Number of conversations to return (default 10)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    threads: z.array(threadSchema).describe('DM conversations'),
    unseen_count: z.number().int().describe('Number of unread conversations'),
    has_more: z.boolean().describe('Whether more conversations are available'),
    cursor: z.string().describe('Cursor for next page, empty if no more'),
  }),
  handle: async params => {
    const data = await api<InboxResponse>('/direct_v2/inbox/', {
      query: {
        visual_message_return_type: 'unseen',
        direction: 'older',
        thread_message_limit: 1,
        persistentBadging: 'true',
        limit: params.limit ?? 10,
        cursor: params.cursor,
      },
    });
    const inbox = data.inbox ?? {};
    return {
      threads: (inbox.threads ?? []).map(mapThread),
      unseen_count: inbox.unseen_count ?? 0,
      has_more: inbox.has_older ?? false,
      cursor: inbox.oldest_cursor ?? '',
    };
  },
});
