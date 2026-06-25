import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { chatApi } from '../bluesky-api.js';
import { conversationSchema, mapConversation } from './schemas.js';

export const muteConversation = defineTool({
  name: 'mute_conversation',
  displayName: 'Mute Conversation',
  description: 'Mute a conversation to stop receiving notifications from it.',
  summary: 'Mute a conversation',
  icon: 'volume-x',
  group: 'Chat',
  input: z.object({
    convo_id: z.string().describe('Conversation ID'),
  }),
  output: z.object({
    conversation: conversationSchema.describe('The muted conversation'),
  }),
  handle: async params => {
    const data = await chatApi<{ convo?: Record<string, unknown> }>('chat.bsky.convo.muteConvo', {
      method: 'POST',
      body: { convoId: params.convo_id },
    });
    return { conversation: mapConversation(data.convo ?? {}) };
  },
});
