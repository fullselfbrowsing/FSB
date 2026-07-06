import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type TLObject, invokeApi } from '../telegram-api.js';

export const deleteMessages = defineTool({
  name: 'delete_messages',
  displayName: 'Delete Messages',
  description:
    'Delete one or more messages from a conversation. Set revoke=true to delete for all participants (only works in private chats and groups where you have permission).',
  summary: 'Delete messages from a chat',
  icon: 'trash-2',
  group: 'Messages',
  input: z.object({
    peer_id: z.number().describe('Peer ID of the conversation'),
    message_ids: z.array(z.number().int()).min(1).describe('Array of message IDs to delete'),
    revoke: z.boolean().optional().describe('Delete for all participants, not just yourself (default false)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the messages were deleted'),
  }),
  handle: async params => {
    await invokeApi<TLObject>('messages.deleteMessages', {
      id: params.message_ids,
      revoke: params.revoke ?? false,
    });

    return { success: true };
  },
});
