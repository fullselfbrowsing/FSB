import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chatgpt-api.js';

export const unstarConversation = defineTool({
  name: 'unstar_conversation',
  displayName: 'Unstar Conversation',
  description: 'Remove the star from a ChatGPT conversation.',
  summary: 'Unstar a conversation',
  icon: 'star-off',
  group: 'Conversations',
  input: z.object({
    conversation_id: z.string().describe('Conversation ID (UUID)'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the operation succeeded') }),
  handle: async params => {
    await api(`/conversation/${params.conversation_id}`, {
      method: 'PATCH',
      body: { is_starred: false },
    });
    return { success: true };
  },
});
