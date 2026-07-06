import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type TLObject, getInputPeer, invokeApi } from '../telegram-api.js';

export const forwardMessages = defineTool({
  name: 'forward_messages',
  displayName: 'Forward Messages',
  description:
    'Forward one or more messages from one conversation to another. The forwarded messages show the original sender attribution.',
  summary: 'Forward messages to another chat',
  icon: 'forward',
  group: 'Messages',
  input: z.object({
    from_peer_id: z.number().describe('Peer ID of the source conversation'),
    to_peer_id: z.number().describe('Peer ID of the destination conversation'),
    message_ids: z.array(z.number().int()).min(1).describe('Array of message IDs to forward'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the messages were forwarded'),
  }),
  handle: async params => {
    const fromPeer = await getInputPeer(params.from_peer_id);
    const toPeer = await getInputPeer(params.to_peer_id);

    const randomIds = params.message_ids.map(() => [
      Math.floor(Math.random() * 0xffffffff),
      Math.floor(Math.random() * 0xffffffff),
    ]);

    await invokeApi<TLObject>('messages.forwardMessages', {
      from_peer: fromPeer,
      to_peer: toPeer,
      id: params.message_ids,
      random_id: randomIds,
    });

    return { success: true };
  },
});
