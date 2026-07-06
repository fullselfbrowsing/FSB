import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chatgpt-api.js';

export const archiveConversation = defineTool({
  name: 'archive_conversation',
  displayName: 'Archive Conversation',
  description:
    'Archive a ChatGPT conversation. Archived conversations are hidden from the main list but can be unarchived.',
  summary: 'Archive a conversation',
  icon: 'archive',
  group: 'Conversations',
  input: z.object({
    conversation_id: z.string().describe('Conversation ID (UUID)'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the operation succeeded') }),
  handle: async params => {
    await api(`/conversation/${params.conversation_id}`, {
      method: 'PATCH',
      body: { is_archived: true },
    });
    return { success: true };
  },
});
