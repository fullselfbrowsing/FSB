import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type DialogsResult, invokeApi } from '../telegram-api.js';
import {
  type RawChat,
  type RawDialog,
  type RawMessage,
  type RawUser,
  buildChatMap,
  buildMessageMap,
  buildUserMap,
  dialogSchema,
  mapDialog,
} from './schemas.js';

export const listConversations = defineTool({
  name: 'list_conversations',
  displayName: 'List Conversations',
  description:
    'List recent Telegram conversations (dialogs) sorted by most recent activity. Returns chats, groups, channels, and bots. Use folder_id 0 for the main chat list, 1 for archived chats.',
  summary: 'List recent chats and conversations',
  icon: 'message-square',
  group: 'Conversations',
  input: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of conversations to return (default 20, max 100)'),
    folder_id: z.number().int().optional().describe('Folder/filter ID — 0 for main list (default), 1 for archive'),
  }),
  output: z.object({
    conversations: z.array(dialogSchema).describe('List of conversations'),
    count: z.number().describe('Total number of conversations'),
  }),
  handle: async params => {
    const limit = params.limit ?? 20;
    const folderId = params.folder_id ?? 0;

    const result = await invokeApi<DialogsResult>('messages.getDialogs', {
      offset_date: 0,
      offset_id: 0,
      offset_peer: { _: 'inputPeerEmpty' },
      limit,
      hash: 0,
      folder_id: folderId,
    });

    const users = buildUserMap((result.users ?? []) as RawUser[]);
    const chats = buildChatMap((result.chats ?? []) as RawChat[]);
    const messages = buildMessageMap((result.messages ?? []) as RawMessage[]);

    const conversations = ((result.dialogs ?? []) as RawDialog[]).map(d => mapDialog(d, users, chats, messages));

    return {
      conversations,
      count: result.count ?? conversations.length,
    };
  },
});
