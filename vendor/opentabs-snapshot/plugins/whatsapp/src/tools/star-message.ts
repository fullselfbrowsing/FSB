import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { findChatByIdOrThrow, starMessages } from '../whatsapp-api.js';

export const starMessage = defineTool({
  name: 'star_message',
  displayName: 'Star Message',
  description:
    'Star or unstar messages in a WhatsApp chat. Starred messages can be accessed later via the starred messages list.',
  summary: 'Star or unstar messages',
  icon: 'star',
  group: 'Messages',
  input: z.object({
    chat_id: z.string().min(1).describe('Chat ID containing the messages'),
    message_ids: z.array(z.string().min(1)).min(1).describe('Message IDs to star or unstar'),
    star: z.boolean().describe('True to star, false to unstar'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    const chat = findChatByIdOrThrow(params.chat_id);
    await starMessages(chat, params.message_ids, params.star);
    return { success: true };
  },
});
