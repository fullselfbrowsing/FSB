import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { findChatByIdOrThrow, sendConversationMute } from '../whatsapp-api.js';

export const muteChat = defineTool({
  name: 'mute_chat',
  displayName: 'Mute Chat',
  description:
    'Mute or unmute a WhatsApp chat. Muted chats do not send notifications. Provide a duration in hours, or 0 to unmute.',
  summary: 'Mute or unmute a chat',
  icon: 'bell-off',
  group: 'Chats',
  input: z.object({
    chat_id: z.string().min(1).describe('Chat ID'),
    duration_hours: z
      .number()
      .int()
      .min(0)
      .describe('Mute duration in hours. Use 0 to unmute. Common values: 8 (8 hours), 168 (1 week), 8760 (1 year)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    const chat = findChatByIdOrThrow(params.chat_id);
    const muteExpiration =
      params.duration_hours === 0 ? 0 : Math.floor(Date.now() / 1000) + params.duration_hours * 3600;
    await sendConversationMute(chat, muteExpiration);
    return { success: true };
  },
});
