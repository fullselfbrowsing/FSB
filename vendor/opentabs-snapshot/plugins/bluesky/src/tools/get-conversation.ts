import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { chatApi } from '../bluesky-api.js';
import { conversationSchema, mapConversation } from './schemas.js';

export const getConversation = defineTool({
  name: 'get_conversation',
  displayName: 'Get Conversation',
  description: 'Get details about a specific conversation by its ID.',
  summary: 'Get conversation details',
  icon: 'message-circle',
  group: 'Chat',
  input: z.object({
    convo_id: z.string().describe('Conversation ID'),
  }),
  output: z.object({
    conversation: conversationSchema.describe('Conversation details'),
  }),
  handle: async params => {
    const data = await chatApi<{ convo?: Record<string, unknown> }>('chat.bsky.convo.getConvo', {
      query: { convoId: params.convo_id },
    });
    return { conversation: mapConversation(data.convo ?? {}) };
  },
});
