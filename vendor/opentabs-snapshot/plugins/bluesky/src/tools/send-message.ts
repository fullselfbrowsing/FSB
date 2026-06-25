import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { chatApi } from '../bluesky-api.js';
import { mapMessage, messageSchema } from './schemas.js';

export const sendMessage = defineTool({
  name: 'send_message',
  displayName: 'Send Message',
  description: 'Send a direct message in a conversation.',
  summary: 'Send a DM',
  icon: 'send',
  group: 'Chat',
  input: z.object({
    convo_id: z.string().describe('Conversation ID'),
    text: z.string().describe('Message text content'),
  }),
  output: z.object({
    message: messageSchema.describe('The sent message'),
  }),
  handle: async params => {
    const data = await chatApi<Record<string, unknown>>('chat.bsky.convo.sendMessage', {
      method: 'POST',
      body: { convoId: params.convo_id, message: { text: params.text } },
    });
    return { message: mapMessage(data) };
  },
});
