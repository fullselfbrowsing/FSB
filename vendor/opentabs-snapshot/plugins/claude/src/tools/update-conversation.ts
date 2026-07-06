import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { orgApi } from '../claude-api.js';
import { type RawConversation, conversationSchema, mapConversation } from './schemas.js';

export const updateConversation = defineTool({
  name: 'update_conversation',
  displayName: 'Update Conversation',
  description: 'Update a conversation name by UUID. Renames the conversation to the specified name.',
  summary: 'Rename a conversation',
  icon: 'pencil',
  group: 'Conversations',
  input: z.object({
    conversation_uuid: z.string().describe('UUID of the conversation to update'),
    name: z.string().describe('New name for the conversation'),
  }),
  output: z.object({
    conversation: conversationSchema.describe('The updated conversation'),
  }),
  handle: async params => {
    const data = await orgApi<RawConversation>(`/chat_conversations/${params.conversation_uuid}`, {
      method: 'PUT',
      body: { name: params.name },
    });
    return { conversation: mapConversation(data) };
  },
});
