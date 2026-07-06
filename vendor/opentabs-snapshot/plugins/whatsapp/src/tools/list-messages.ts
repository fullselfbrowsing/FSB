import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { findChatByIdOrThrow, loadMessages, serializeMessage } from '../whatsapp-api.js';
import { messageSchema } from './schemas.js';

export const listMessages = defineTool({
  name: 'list_messages',
  displayName: 'List Messages',
  description:
    'List recent messages in a WhatsApp chat. Messages are returned in chronological order (oldest first). Loads earlier messages from the server if needed.',
  summary: 'List messages in a chat',
  icon: 'messages-square',
  group: 'Messages',
  input: z.object({
    chat_id: z.string().min(1).describe('Chat ID to read messages from'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of messages to return (default 20, max 100)'),
  }),
  output: z.object({
    messages: z.array(messageSchema),
    total_loaded: z.number().int().describe('Total number of messages loaded in memory for this chat'),
  }),
  handle: async params => {
    const chat = findChatByIdOrThrow(params.chat_id);
    const msgs = await loadMessages(chat);
    const limit = params.limit ?? 20;
    const recent = msgs.slice(-limit);
    return {
      messages: recent.map(serializeMessage),
      total_loaded: msgs.length,
    };
  },
});
