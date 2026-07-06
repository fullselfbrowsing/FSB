import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type TLObject, invokeApi } from '../telegram-api.js';

export const createGroup = defineTool({
  name: 'create_group',
  displayName: 'Create Group',
  description:
    'Create a new group chat with a title and a list of user IDs to invite. Returns the chat ID of the newly created group.',
  summary: 'Create a new group chat',
  icon: 'users-round',
  group: 'Groups',
  input: z.object({
    title: z.string().min(1).describe('Title for the new group chat'),
    user_ids: z.array(z.number()).min(1).describe('Array of user IDs to invite to the group'),
  }),
  output: z.object({
    chat_id: z.number().describe('ID of the newly created group chat'),
    success: z.boolean().describe('Whether the group was created'),
  }),
  handle: async params => {
    const users = params.user_ids.map(id => ({
      _: 'inputUser',
      user_id: id,
      access_hash: '0',
    }));

    const result = await invokeApi<TLObject & { chats?: { id?: number }[] }>('messages.createChat', {
      title: params.title,
      users,
    });

    const chatId = result.chats?.[0]?.id ?? 0;
    return { chat_id: chatId, success: chatId > 0 };
  },
});
