import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { findChatByIdOrThrow, serializeChat } from '../whatsapp-api.js';
import { chatSchema } from './schemas.js';

export const getChat = defineTool({
  name: 'get_chat',
  displayName: 'Get Chat',
  description: 'Get details for a specific WhatsApp chat by its ID. Use list_chats to find chat IDs.',
  summary: 'Get a single chat by ID',
  icon: 'message-square',
  group: 'Chats',
  input: z.object({
    chat_id: z.string().min(1).describe('Chat ID (e.g., "15551234567@c.us" or "120363...@g.us")'),
  }),
  output: z.object({ chat: chatSchema }),
  handle: async params => {
    const chat = findChatByIdOrThrow(params.chat_id);
    return { chat: serializeChat(chat) };
  },
});
