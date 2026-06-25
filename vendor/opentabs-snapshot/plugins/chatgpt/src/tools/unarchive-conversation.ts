import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chatgpt-api.js';

export const unarchiveConversation = defineTool({
  name: 'unarchive_conversation',
  displayName: 'Unarchive Conversation',
  description: 'Unarchive a previously archived ChatGPT conversation, restoring it to the main conversation list.',
  summary: 'Unarchive a conversation',
  icon: 'archive-restore',
  group: 'Conversations',
  input: z.object({
    conversation_id: z.string().describe('Conversation ID (UUID)'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the operation succeeded') }),
  handle: async params => {
    await api(`/conversation/${params.conversation_id}`, {
      method: 'PATCH',
      body: { is_archived: false },
    });
    return { success: true };
  },
});
