import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { chatApi } from '../teams-api.js';

export const editMessage = defineTool({
  name: 'edit_message',
  displayName: 'Edit Message',
  description: 'Edit a message in a Teams chat conversation. Only messages sent by the current user can be edited.',
  summary: 'Edit a chat message',
  icon: 'pencil',
  group: 'Messages',
  input: z.object({
    conversation_id: z.string().min(1).describe('Conversation/thread ID'),
    message_id: z.string().min(1).describe('Message ID to edit'),
    text: z.string().min(1).describe('New message content (supports HTML formatting)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the edit was successful'),
  }),
  handle: async params => {
    await chatApi<Record<string, unknown>>(
      `/v1/users/ME/conversations/${encodeURIComponent(params.conversation_id)}/messages/${encodeURIComponent(params.message_id)}`,
      {
        method: 'PUT',
        body: {
          content: params.text,
          messagetype: 'RichText/Html',
          contenttype: 'text',
        },
      },
    );
    return { success: true };
  },
});
