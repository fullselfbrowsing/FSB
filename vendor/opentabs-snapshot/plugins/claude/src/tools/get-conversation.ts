import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { orgApi } from '../claude-api.js';
import {
  type RawConversation,
  type RawMessage,
  conversationDetailSchema,
  mapConversation,
  mapMessage,
} from './schemas.js';

interface RawConversationDetail extends RawConversation {
  chat_messages?: RawMessage[];
}

export const getConversation = defineTool({
  name: 'get_conversation',
  displayName: 'Get Conversation',
  description:
    'Get a conversation by UUID including its full message history. Returns conversation metadata and all messages with their text content, sender, and ordering.',
  summary: 'Get a conversation with messages',
  icon: 'message-square',
  group: 'Conversations',
  input: z.object({
    conversation_uuid: z.string().describe('UUID of the conversation to retrieve'),
  }),
  output: conversationDetailSchema,
  handle: async params => {
    const data = await orgApi<RawConversationDetail>(`/chat_conversations/${params.conversation_uuid}`, {
      query: { tree: 'True', rendering_mode: 'messages' },
    });
    const base = mapConversation(data);
    return {
      ...base,
      messages: (data.chat_messages ?? []).map(mapMessage),
    };
  },
});
