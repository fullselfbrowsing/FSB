import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { findChatByIdOrThrow, markChatSeen } from '../whatsapp-api.js';

export const markChatRead = defineTool({
  name: 'mark_chat_read',
  displayName: 'Mark Chat Read',
  description:
    'Mark a WhatsApp chat as read or unread. Marking as read clears the unread badge; marking as unread highlights the chat.',
  summary: 'Mark a chat as read or unread',
  icon: 'check-check',
  group: 'Chats',
  input: z.object({
    chat_id: z.string().min(1).describe('Chat ID'),
    read: z.boolean().describe('True to mark as read, false to mark as unread'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    const chat = findChatByIdOrThrow(params.chat_id);
    await markChatSeen(chat, params.read);
    return { success: true };
  },
});
