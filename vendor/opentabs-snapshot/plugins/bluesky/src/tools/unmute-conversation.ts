import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { chatApi } from '../bluesky-api.js';
import { conversationSchema, mapConversation } from './schemas.js';

export const unmuteConversation = defineTool({
  name: 'unmute_conversation',
  displayName: 'Unmute Conversation',
  description: 'Unmute a conversation.',
  summary: 'Unmute a conversation',
  icon: 'volume-2',
  group: 'Chat',
  input: z.object({
    convo_id: z.string().describe('Conversation ID'),
  }),
  output: z.object({
    conversation: conversationSchema.describe('The unmuted conversation'),
  }),
  handle: async params => {
    const data = await chatApi<{ convo?: Record<string, unknown> }>('chat.bsky.convo.unmuteConvo', {
      method: 'POST',
      body: { convoId: params.convo_id },
    });
    return { conversation: mapConversation(data.convo ?? {}) };
  },
});
