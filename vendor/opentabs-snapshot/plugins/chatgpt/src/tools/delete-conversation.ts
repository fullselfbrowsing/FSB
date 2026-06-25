import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chatgpt-api.js';

export const deleteConversation = defineTool({
  name: 'delete_conversation',
  displayName: 'Delete Conversation',
  description: 'Permanently delete a ChatGPT conversation. This action cannot be undone.',
  summary: 'Delete a conversation permanently',
  icon: 'trash-2',
  group: 'Conversations',
  input: z.object({
    conversation_id: z.string().describe('Conversation ID (UUID)'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the operation succeeded') }),
  handle: async params => {
    await api(`/conversation/${params.conversation_id}`, {
      method: 'PATCH',
      body: { is_visible: false },
    });
    return { success: true };
  },
});
