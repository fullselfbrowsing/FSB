import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type TLObject, getInputPeer, invokeApi } from '../telegram-api.js';

export const editMessage = defineTool({
  name: 'edit_message',
  displayName: 'Edit Message',
  description:
    'Edit the text content of a previously sent message. Only messages sent by the current user can be edited.',
  summary: 'Edit a sent message',
  icon: 'pencil',
  group: 'Messages',
  input: z.object({
    peer_id: z.number().describe('Peer ID of the conversation containing the message'),
    message_id: z.number().int().describe('ID of the message to edit'),
    text: z.string().min(1).describe('New message text'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the message was edited successfully'),
  }),
  handle: async params => {
    const peer = await getInputPeer(params.peer_id);

    await invokeApi<TLObject>('messages.editMessage', {
      peer,
      id: params.message_id,
      message: params.text,
    });

    return { success: true };
  },
});
