import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { findChatByIdOrThrow, deleteChat as deleteChatAction } from '../whatsapp-api.js';

export const deleteChat = defineTool({
  name: 'delete_chat',
  displayName: 'Delete Chat',
  description: 'Delete a WhatsApp chat. This removes the chat from the chat list. Messages are only deleted locally.',
  summary: 'Delete a chat',
  icon: 'trash-2',
  group: 'Chats',
  input: z.object({
    chat_id: z.string().min(1).describe('Chat ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    const chat = findChatByIdOrThrow(params.chat_id);
    await deleteChatAction(chat);
    return { success: true };
  },
});
