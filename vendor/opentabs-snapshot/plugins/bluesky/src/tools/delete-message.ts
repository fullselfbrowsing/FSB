import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { chatApi } from '../bluesky-api.js';

export const deleteMessage = defineTool({
  name: 'delete_message',
  displayName: 'Delete Message',
  description: 'Delete a message for yourself in a conversation.',
  summary: 'Delete a message',
  icon: 'trash-2',
  group: 'Chat',
  input: z.object({
    convo_id: z.string().describe('Conversation ID'),
    message_id: z.string().describe('Message ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await chatApi('chat.bsky.convo.deleteMessageForSelf', {
      method: 'POST',
      body: { convoId: params.convo_id, messageId: params.message_id },
    });
    return { success: true };
  },
});
