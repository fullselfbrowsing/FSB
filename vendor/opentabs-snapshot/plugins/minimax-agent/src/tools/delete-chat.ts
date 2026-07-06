import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';

export const deleteChat = defineTool({
  name: 'delete_chat',
  displayName: 'Delete Chat',
  description: 'Permanently delete a chat conversation. This action cannot be undone.',
  summary: 'Delete a chat',
  icon: 'trash-2',
  group: 'Chats',
  input: z.object({
    chat_id: z.number().describe('Chat ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the chat was deleted successfully'),
  }),
  handle: async params => {
    await apiPost('/matrix/api/v1/chat/delete_chat', {
      chatID: params.chat_id,
    });
    return { success: true };
  },
});
