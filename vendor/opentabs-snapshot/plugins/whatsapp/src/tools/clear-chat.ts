import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { findChatByIdOrThrow, clearChat as clearChatAction } from '../whatsapp-api.js';

export const clearChat = defineTool({
  name: 'clear_chat',
  displayName: 'Clear Chat',
  description:
    'Clear all messages from a WhatsApp chat. The chat remains in the list but all messages are removed locally.',
  summary: 'Clear all messages from a chat',
  icon: 'eraser',
  group: 'Chats',
  input: z.object({
    chat_id: z.string().min(1).describe('Chat ID to clear'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    const chat = findChatByIdOrThrow(params.chat_id);
    await clearChatAction(chat);
    return { success: true };
  },
});
