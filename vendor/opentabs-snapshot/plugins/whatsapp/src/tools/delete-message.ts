import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { findChatByIdOrThrow, deleteMessages } from '../whatsapp-api.js';

export const deleteMessage = defineTool({
  name: 'delete_message',
  displayName: 'Delete Message',
  description:
    'Delete messages from a WhatsApp chat. Messages are deleted locally only (they remain visible to other participants). Use revoke_message to unsend messages for everyone.',
  summary: 'Delete messages locally',
  icon: 'trash-2',
  group: 'Messages',
  input: z.object({
    chat_id: z.string().min(1).describe('Chat ID containing the messages'),
    message_ids: z.array(z.string().min(1)).min(1).describe('Message IDs to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    const chat = findChatByIdOrThrow(params.chat_id);
    await deleteMessages(chat, params.message_ids);
    return { success: true };
  },
});
