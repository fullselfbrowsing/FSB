import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';

export const renameChat = defineTool({
  name: 'rename_chat',
  displayName: 'Rename Chat',
  description: 'Rename a chat conversation.',
  summary: 'Rename a chat',
  icon: 'pencil',
  group: 'Chats',
  input: z.object({
    chat_id: z.number().describe('Chat ID to rename'),
    name: z.string().describe('New name for the chat'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the chat was renamed successfully'),
  }),
  handle: async params => {
    await apiPost('/matrix/api/v1/chat/rename_chat', {
      chatID: params.chat_id,
      name: params.name,
    });
    return { success: true };
  },
});
