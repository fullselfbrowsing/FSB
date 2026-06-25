import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { chatApi } from '../teams-api.js';

export const deleteMessage = defineTool({
  name: 'delete_message',
  displayName: 'Delete Message',
  description:
    'Delete a message from a Teams chat conversation. Only messages sent by the current user can be deleted.',
  summary: 'Delete a chat message',
  icon: 'trash-2',
  group: 'Messages',
  input: z.object({
    conversation_id: z.string().min(1).describe('Conversation/thread ID'),
    message_id: z.string().min(1).describe('Message ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion was successful'),
  }),
  handle: async params => {
    await chatApi<Record<string, unknown>>(
      `/v1/users/ME/conversations/${encodeURIComponent(params.conversation_id)}/messages/${encodeURIComponent(params.message_id)}`,
      { method: 'DELETE' },
    );
    return { success: true };
  },
});
