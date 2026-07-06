import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type TLObject, getInputPeer, invokeApi } from '../telegram-api.js';

export const pinMessage = defineTool({
  name: 'pin_message',
  displayName: 'Pin Message',
  description:
    'Pin a message in a conversation. Pinned messages are highlighted and easily accessible. Set silent=true to pin without sending a notification to chat members.',
  summary: 'Pin a message in a chat',
  icon: 'pin',
  group: 'Messages',
  input: z.object({
    peer_id: z.number().describe('Peer ID of the conversation'),
    message_id: z.number().int().describe('ID of the message to pin'),
    silent: z.boolean().optional().describe('Pin without sending a notification (default false)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the message was pinned'),
  }),
  handle: async params => {
    const peer = await getInputPeer(params.peer_id);

    await invokeApi<TLObject>('messages.updatePinnedMessage', {
      peer,
      id: params.message_id,
      silent: params.silent ?? false,
    });

    return { success: true };
  },
});
