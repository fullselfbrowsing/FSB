import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { chatApi } from '../teams-api.js';
import { mapMessage, messageSchema } from './schemas.js';

export const readMessages = defineTool({
  name: 'read_messages',
  displayName: 'Read Messages',
  description:
    'Read messages from a chat conversation. Returns messages sorted by time (newest first). Use the conversation ID from list_conversations.',
  summary: 'Read messages from a chat',
  icon: 'message-square',
  group: 'Messages',
  input: z.object({
    conversation_id: z.string().min(1).describe('Conversation/thread ID to read messages from'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Number of messages to return (default 20, max 200)'),
  }),
  output: z.object({
    messages: z.array(messageSchema).describe('List of messages (newest first)'),
  }),
  handle: async params => {
    const data = await chatApi<{ messages?: Array<Record<string, unknown>> }>(
      `/v1/users/ME/conversations/${encodeURIComponent(params.conversation_id)}/messages`,
      {
        query: {
          pageSize: params.page_size ?? 20,
        },
      },
    );

    const messages = (data.messages ?? [])
      .filter(m => {
        const msgType = m.messagetype as string | undefined;
        return msgType === 'RichText/Html' || msgType === 'Text' || msgType === 'RichText';
      })
      .map(m => mapMessage(m as Record<string, unknown>));

    return { messages };
  },
});
