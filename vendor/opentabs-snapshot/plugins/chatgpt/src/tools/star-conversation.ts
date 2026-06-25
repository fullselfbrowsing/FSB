import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chatgpt-api.js';

export const starConversation = defineTool({
  name: 'star_conversation',
  displayName: 'Star Conversation',
  description: 'Star a ChatGPT conversation to mark it as important.',
  summary: 'Star a conversation',
  icon: 'star',
  group: 'Conversations',
  input: z.object({
    conversation_id: z.string().describe('Conversation ID (UUID)'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the operation succeeded') }),
  handle: async params => {
    await api(`/conversation/${params.conversation_id}`, {
      method: 'PATCH',
      body: { is_starred: true },
    });
    return { success: true };
  },
});
