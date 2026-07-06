import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { orgApi } from '../claude-api.js';

export const deleteConversation = defineTool({
  name: 'delete_conversation',
  displayName: 'Delete Conversation',
  description: 'Delete a conversation by UUID. This action is permanent and cannot be undone.',
  summary: 'Delete a conversation',
  icon: 'trash-2',
  group: 'Conversations',
  input: z.object({
    conversation_uuid: z.string().describe('UUID of the conversation to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion was successful'),
  }),
  handle: async params => {
    await orgApi(`/chat_conversations/${params.conversation_uuid}`, {
      method: 'DELETE',
    });
    return { success: true };
  },
});
