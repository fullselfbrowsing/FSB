import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type TLObject, getInputPeer, invokeApi } from '../telegram-api.js';

export const markConversationRead = defineTool({
  name: 'mark_conversation_read',
  displayName: 'Mark Conversation Read',
  description:
    'Mark all messages in a conversation as read up to the specified message ID. This clears the unread count for the conversation.',
  summary: 'Mark messages as read',
  icon: 'check-check',
  group: 'Conversations',
  input: z.object({
    peer_id: z.number().describe('Peer ID of the conversation to mark as read'),
    max_id: z.number().int().optional().describe('Mark messages up to this ID as read (default: mark all as read)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    const peer = await getInputPeer(params.peer_id);

    await invokeApi<TLObject>('messages.readHistory', {
      peer,
      max_id: params.max_id ?? 0,
    });

    return { success: true };
  },
});
