import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onlyfans-api.js';
import { type RawChatMessage, chatMessageSchema, mapChatMessage } from './schemas.js';

export const sendChatMessage = defineTool({
  name: 'send_chat_message',
  displayName: 'Send Chat Message',
  description: 'Send a text message in a chat conversation. The chat must already exist.',
  summary: 'Send a message in a chat',
  icon: 'send',
  group: 'Chat',
  input: z.object({
    chat_id: z.number().int().describe('Chat ID (from list_chats)'),
    text: z.string().min(1).describe('Message text to send'),
  }),
  output: z.object({
    message: chatMessageSchema.describe('The sent message'),
  }),
  handle: async params => {
    const data = await api<RawChatMessage>(`/chats/${params.chat_id}/messages`, {
      method: 'POST',
      body: { text: params.text },
    });
    return { message: mapChatMessage(data) };
  },
});
