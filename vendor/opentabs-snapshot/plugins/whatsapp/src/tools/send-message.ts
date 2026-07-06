import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { findChatByIdOrThrow, sendTextMessage } from '../whatsapp-api.js';

export const sendMessage = defineTool({
  name: 'send_message',
  displayName: 'Send Message',
  description:
    'Send a text message to a WhatsApp chat. Supports plain text and basic formatting (*bold*, _italic_, ~strikethrough~, ```code```).',
  summary: 'Send a text message',
  icon: 'send',
  group: 'Messages',
  input: z.object({
    chat_id: z.string().min(1).describe('Chat ID to send the message to'),
    text: z.string().min(1).describe('Message text content'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the message was sent'),
  }),
  handle: async params => {
    const chat = findChatByIdOrThrow(params.chat_id);
    await sendTextMessage(chat, params.text);
    return { success: true };
  },
});
