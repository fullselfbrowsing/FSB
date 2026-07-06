import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { chatApi } from '../teams-api.js';
import { conversationSchema, mapConversation } from './schemas.js';

export const listConversations = defineTool({
  name: 'list_conversations',
  displayName: 'List Conversations',
  description:
    'List recent chat conversations. Returns chats sorted by last activity. Use the conversation ID from results with read_messages to read messages.',
  summary: 'List recent chats',
  icon: 'message-square',
  group: 'Chats',
  input: z.object({
    page_size: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of conversations to return (default 20, max 50)'),
  }),
  output: z.object({
    conversations: z.array(conversationSchema).describe('List of conversations'),
    total_count: z.number().describe('Total number of conversations'),
  }),
  handle: async params => {
    const pageSize = params.page_size ?? 20;
    const data = await chatApi<{
      conversations?: Array<Record<string, unknown>>;
      _metadata?: { totalCount?: number };
    }>('/v1/users/ME/conversations', {
      query: {
        view: 'superchat',
        pageSize,
        startTime: 0,
        targetType: 'Thread|Passport',
      },
    });

    const conversations = (data.conversations ?? []).map(c => mapConversation(c as Record<string, unknown>));
    return {
      conversations,
      total_count: data._metadata?.totalCount ?? conversations.length,
    };
  },
});
