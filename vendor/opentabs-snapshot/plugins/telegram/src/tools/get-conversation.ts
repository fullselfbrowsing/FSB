import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type TLObject, getInputPeer, invokeApi } from '../telegram-api.js';
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

export const getConversation = defineTool({
  name: 'get_conversation',
  displayName: 'Get Conversation',
  description:
    'Get detailed information about a specific conversation (dialog), including unread count, top message, and peer info.',
  summary: 'Get details about a conversation',
  icon: 'message-circle',
  group: 'Conversations',
  input: z.object({
    peer_id: z.number().describe('Peer ID of the conversation to get details for'),
  }),
  output: z.object({
    conversation: dialogSchema.describe('Conversation details'),
  }),
  handle: async params => {
    const peer = await getInputPeer(params.peer_id);

    const result = await invokeApi<
      TLObject & { dialogs: TLObject[]; messages: TLObject[]; users: TLObject[]; chats: TLObject[] }
    >('messages.getPeerDialogs', {
      peers: [{ _: 'inputDialogPeer', peer }],
    });

    const users = buildUserMap((result.users ?? []) as RawUser[]);
    const chats = buildChatMap((result.chats ?? []) as RawChat[]);
    const messages = buildMessageMap((result.messages ?? []) as RawMessage[]);

    const dialog = (result.dialogs?.[0] ?? {}) as RawDialog;
    const conversation = mapDialog(dialog, users, chats, messages);

    return { conversation };
  },
});
