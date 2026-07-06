import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { findChatByIdOrThrow, setArchive } from '../whatsapp-api.js';

export const archiveChat = defineTool({
  name: 'archive_chat',
  displayName: 'Archive Chat',
  description: 'Archive or unarchive a WhatsApp chat. Archived chats are hidden from the main chat list.',
  summary: 'Archive or unarchive a chat',
  icon: 'archive',
  group: 'Chats',
  input: z.object({
    chat_id: z.string().min(1).describe('Chat ID'),
    archive: z.boolean().describe('True to archive, false to unarchive'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    const chat = findChatByIdOrThrow(params.chat_id);
    await setArchive(chat, params.archive);
    return { success: true };
  },
});
