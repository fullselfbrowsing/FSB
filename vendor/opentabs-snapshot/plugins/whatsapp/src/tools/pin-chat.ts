import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { findChatByIdOrThrow, setPin } from '../whatsapp-api.js';

export const pinChat = defineTool({
  name: 'pin_chat',
  displayName: 'Pin Chat',
  description: 'Pin or unpin a WhatsApp chat. Pinned chats appear at the top of the chat list. Maximum 3 pinned chats.',
  summary: 'Pin or unpin a chat',
  icon: 'pin',
  group: 'Chats',
  input: z.object({
    chat_id: z.string().min(1).describe('Chat ID'),
    pin: z.boolean().describe('True to pin, false to unpin'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    const chat = findChatByIdOrThrow(params.chat_id);
    await setPin(chat, params.pin);
    return { success: true };
  },
});
