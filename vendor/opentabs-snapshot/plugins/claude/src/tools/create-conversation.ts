import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiStream, getOrgId, orgApi } from '../claude-api.js';
import { type RawConversation, conversationSchema, mapConversation } from './schemas.js';

export const createConversation = defineTool({
  name: 'create_conversation',
  displayName: 'Create Conversation',
  description:
    'Create a new conversation and send an initial message. Creates the conversation, then sends a completion request to get the assistant response.',
  summary: 'Create a conversation with an initial message',
  icon: 'plus',
  group: 'Conversations',
  input: z.object({
    message: z.string().describe('Initial message to send in the new conversation'),
    model: z.string().optional().describe('Model to use (default claude-sonnet-4-6)'),
  }),
  output: z.object({
    conversation: conversationSchema.describe('The newly created conversation'),
    response: z.string().describe('The assistant response to the initial message'),
  }),
  handle: async params => {
    const uuid = crypto.randomUUID();
    const conversation = await orgApi<RawConversation>('/chat_conversations', {
      method: 'POST',
      body: { name: '', uuid },
    });

    const orgId = getOrgId();
    const response = await apiStream(`/organizations/${orgId}/chat_conversations/${uuid}/completion`, {
      prompt: params.message,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      model: params.model ?? 'claude-sonnet-4-6',
      attachments: [],
      files: [],
      rendering_mode: 'text',
    });

    return { conversation: mapConversation(conversation), response };
  },
});
