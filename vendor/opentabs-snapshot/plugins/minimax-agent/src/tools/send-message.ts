import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';

export const sendMessage = defineTool({
  name: 'send_message',
  displayName: 'Send Message',
  description: 'Send a text message to a chat conversation.',
  summary: 'Send a message to a chat',
  icon: 'send',
  group: 'Chats',
  input: z.object({
    chat_id: z.number().describe('Chat ID to send the message to'),
    text: z.string().describe('Message text to send'),
    chat_type: z.number().int().optional().describe('Chat type (2=agent task)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the message was sent successfully'),
  }),
  handle: async params => {
    await apiPost('/matrix/api/v1/chat/send_msg', {
      chatID: params.chat_id,
      text: params.text,
      ...(params.chat_type != null && { chat_type: params.chat_type }),
    });
    return { success: true };
  },
});
