import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { callManager } from '../telegram-api.js';

export const sendMessage = defineTool({
  name: 'send_message',
  displayName: 'Send Message',
  description:
    'Send a text message to a Telegram conversation. Supports Markdown-style formatting. The message is sent immediately.',
  summary: 'Send a message to a chat',
  icon: 'send',
  group: 'Messages',
  input: z.object({
    peer_id: z.number().describe('Peer ID to send the message to (user, chat, or channel ID)'),
    text: z.string().min(1).describe('Message text to send (supports Markdown formatting)'),
    reply_to_msg_id: z.number().int().optional().describe('Message ID to reply to (creates a threaded reply)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the message was sent successfully'),
  }),
  handle: async params => {
    const sendParams: Record<string, unknown> = {
      peerId: params.peer_id,
      text: params.text,
    };

    if (params.reply_to_msg_id) {
      sendParams.replyToMsgId = params.reply_to_msg_id;
    }

    await callManager<void>('appMessagesManager', 'sendText', sendParams);
    return { success: true };
  },
});
