import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chatgpt-api.js';
import { conversationDetailSchema, mapConversationDetail } from './schemas.js';

export const getConversation = defineTool({
  name: 'get_conversation',
  displayName: 'Get Conversation',
  description:
    'Get a ChatGPT conversation with its full message history. Messages are returned in chronological order following the active branch of the conversation tree.',
  summary: 'Get a conversation with messages',
  icon: 'message-square',
  group: 'Conversations',
  input: z.object({
    conversation_id: z.string().describe('Conversation ID (UUID)'),
  }),
  output: z.object({ conversation: conversationDetailSchema }),
  handle: async params => {
    const data = await api<Record<string, unknown>>(`/conversation/${params.conversation_id}`);
    return { conversation: mapConversationDetail(data as Parameters<typeof mapConversationDetail>[0]) };
  },
});
