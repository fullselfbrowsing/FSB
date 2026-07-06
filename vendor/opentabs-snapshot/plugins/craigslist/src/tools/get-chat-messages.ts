import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { capi } from '../craigslist-api.js';
import { chatMessageSchema, mapChatMessage } from './schemas.js';
import type { RawChatMessage } from './schemas.js';

export const getChatMessages = defineTool({
  name: 'get_chat_messages',
  displayName: 'Get Chat Messages',
  description:
    'Get messages for a specific chat conversation by conversation ID. Returns all messages in the conversation.',
  summary: 'Get messages in a chat conversation',
  icon: 'message-circle',
  group: 'Chat',
  input: z.object({
    conversation_id: z.number().int().min(1).describe('Conversation ID to retrieve messages for'),
  }),
  output: z.object({
    messages: z.array(chatMessageSchema).describe('Messages in the conversation'),
  }),
  handle: async params => {
    const resp = await capi<{ items: RawChatMessage[] }>(`/chat/${params.conversation_id}`);
    return {
      messages: (resp.data.items ?? []).map(mapChatMessage),
    };
  },
});
