import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { chatApi } from '../bluesky-api.js';
import { conversationSchema, mapConversation } from './schemas.js';

export const markConversationRead = defineTool({
  name: 'mark_conversation_read',
  displayName: 'Mark Conversation Read',
  description: 'Mark a conversation as read.',
  summary: 'Mark a conversation as read',
  icon: 'check-circle',
  group: 'Chat',
  input: z.object({
    convo_id: z.string().describe('Conversation ID'),
  }),
  output: z.object({
    conversation: conversationSchema.describe('The conversation marked as read'),
  }),
  handle: async params => {
    const data = await chatApi<{ convo?: Record<string, unknown> }>('chat.bsky.convo.updateRead', {
      method: 'POST',
      body: { convoId: params.convo_id },
    });
    return { conversation: mapConversation(data.convo ?? {}) };
  },
});
