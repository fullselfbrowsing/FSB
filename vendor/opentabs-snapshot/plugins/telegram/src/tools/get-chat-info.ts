import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type TLObject, getInputChannel, invokeApi } from '../telegram-api.js';
import { type RawChat, type RawChatFull, chatSchema, mapChat } from './schemas.js';

export const getChatInfo = defineTool({
  name: 'get_chat_info',
  displayName: 'Get Chat Info',
  description:
    'Get detailed information about a group chat or channel, including title, description, member count, and type. Works for both regular groups and supergroups/channels.',
  summary: 'Get chat or channel details',
  icon: 'info',
  group: 'Groups',
  input: z.object({
    peer_id: z.number().describe('Chat or channel numeric ID'),
    is_channel: z.boolean().optional().describe('Whether this is a channel/supergroup (default false — regular group)'),
  }),
  output: z.object({
    chat: chatSchema.describe('Chat/channel details'),
  }),
  handle: async params => {
    const isChannel = params.is_channel ?? false;

    if (isChannel) {
      const inputChannel = await getInputChannel(params.peer_id);
      const result = await invokeApi<TLObject>('channels.getFullChannel', {
        channel: inputChannel,
      });

      const data = result as unknown as RawChatFull;
      const chat = (data.chats?.[0] ?? {}) as RawChat;
      return { chat: mapChat(chat, data.full_chat?.about) };
    }

    const result = await invokeApi<TLObject>('messages.getFullChat', {
      chat_id: params.peer_id,
    });

    const data = result as unknown as RawChatFull;
    const chat = (data.chats?.[0] ?? {}) as RawChat;
    return { chat: mapChat(chat, data.full_chat?.about) };
  },
});
