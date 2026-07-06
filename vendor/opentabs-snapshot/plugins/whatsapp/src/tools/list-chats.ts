import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getChatCollection, serializeChat } from '../whatsapp-api.js';
import { chatSchema } from './schemas.js';

export const listChats = defineTool({
  name: 'list_chats',
  displayName: 'List Chats',
  description:
    'List all WhatsApp chats sorted by most recent activity. Returns chat name, unread count, archive/pin/mute status, and whether it is a group.',
  summary: 'List all WhatsApp chats',
  icon: 'message-square',
  group: 'Chats',
  input: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of chats to return (default 50, max 100)'),
  }),
  output: z.object({
    chats: z.array(chatSchema),
    total: z.number().int().describe('Total number of chats available'),
  }),
  handle: async params => {
    const col = getChatCollection();
    const models = col?.getModelsArray() ?? [];
    const limit = params.limit ?? 50;
    const chats = models.slice(0, limit).map(serializeChat);
    return { chats, total: models.length };
  },
});
