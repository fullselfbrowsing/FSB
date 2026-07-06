import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type TLObject, getInputPeer, invokeApi } from '../telegram-api.js';

export const unpinMessage = defineTool({
  name: 'unpin_message',
  displayName: 'Unpin Message',
  description: 'Unpin a previously pinned message in a conversation.',
  summary: 'Unpin a message in a chat',
  icon: 'pin-off',
  group: 'Messages',
  input: z.object({
    peer_id: z.number().describe('Peer ID of the conversation'),
    message_id: z.number().int().describe('ID of the message to unpin'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the message was unpinned'),
  }),
  handle: async params => {
    const peer = await getInputPeer(params.peer_id);

    await invokeApi<TLObject>('messages.updatePinnedMessage', {
      peer,
      id: params.message_id,
      unpin: true,
    });

    return { success: true };
  },
});
