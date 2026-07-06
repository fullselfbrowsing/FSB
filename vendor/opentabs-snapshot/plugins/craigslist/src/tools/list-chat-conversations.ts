import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { capi } from '../craigslist-api.js';
import { chatConversationSchema, mapChatConversation } from './schemas.js';
import type { RawChatConversation } from './schemas.js';

export const listChatConversations = defineTool({
  name: 'list_chat_conversations',
  displayName: 'List Chat Conversations',
  description:
    'List chat conversations for the authenticated user. Returns all active conversations with posting info and unread counts.',
  summary: 'List chat conversations',
  icon: 'messages-square',
  group: 'Chat',
  input: z.object({}),
  output: z.object({
    conversations: z.array(chatConversationSchema).describe('List of chat conversations'),
    postingCount: z.number().describe('Total number of postings with conversations'),
  }),
  handle: async () => {
    const resp = await capi<{ items: RawChatConversation[]; postingCount: number }>('/chat');
    return {
      conversations: (resp.data.items ?? []).map(mapChatConversation),
      postingCount: resp.data.postingCount ?? 0,
    };
  },
});
