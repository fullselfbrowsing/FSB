import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { findChatByIdOrThrow, revokeMessages } from '../whatsapp-api.js';

export const revokeMessage = defineTool({
  name: 'revoke_message',
  displayName: 'Revoke Message',
  description:
    'Revoke (unsend) messages in a WhatsApp chat. Revoked messages are deleted for everyone in the chat. Only messages sent by the current user can be revoked.',
  summary: 'Unsend messages for everyone',
  icon: 'undo-2',
  group: 'Messages',
  input: z.object({
    chat_id: z.string().min(1).describe('Chat ID containing the messages'),
    message_ids: z.array(z.string().min(1)).min(1).describe('Message IDs to revoke (must be messages you sent)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    const chat = findChatByIdOrThrow(params.chat_id);
    await revokeMessages(chat, params.message_ids);
    return { success: true };
  },
});
