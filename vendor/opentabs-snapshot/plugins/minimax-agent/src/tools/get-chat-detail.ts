import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';
import { chatSchema, mapChat, messageSchema, mapMessage } from './schemas.js';
import type { RawChat, RawMessage } from './schemas.js';

export const getChatDetail = defineTool({
  name: 'get_chat_detail',
  displayName: 'Get Chat Detail',
  description: 'Get detailed information about a specific chat conversation including its messages.',
  summary: 'Get chat details and messages',
  icon: 'message-square',
  group: 'Chats',
  input: z.object({
    chat_id: z.number().describe('Chat ID to retrieve'),
  }),
  output: z.object({
    chat: chatSchema.describe('Chat details'),
    messages: z.array(messageSchema).describe('Messages in the chat'),
  }),
  handle: async params => {
    const data = await apiPost<{
      chat?: RawChat;
      messages?: RawMessage[];
    }>('/matrix/api/v1/chat/get_chat_detail', {
      chatID: params.chat_id,
    });
    return {
      chat: mapChat(data.chat ?? {}),
      messages: (data.messages ?? []).map(mapMessage),
    };
  },
});
