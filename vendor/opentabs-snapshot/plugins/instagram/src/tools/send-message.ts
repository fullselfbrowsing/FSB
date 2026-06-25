import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';

interface SendMessageResponse {
  status?: string;
  payload?: { thread_id?: string; item_id?: string };
}

export const sendMessage = defineTool({
  name: 'send_message',
  displayName: 'Send Message',
  description: 'Send a direct message to an existing conversation thread. Use list_conversations to find thread IDs.',
  summary: 'Send a direct message',
  icon: 'send',
  group: 'Messaging',
  input: z.object({
    thread_id: z.string().describe('Conversation thread ID'),
    text: z.string().describe('Message text to send'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the message was sent'),
    thread_id: z.string().describe('Thread the message was sent to'),
    item_id: z.string().describe('ID of the sent message'),
  }),
  handle: async params => {
    const body = new URLSearchParams();
    body.set('action', 'send_item');
    body.set('thread_ids', `[${params.thread_id}]`);
    body.set('client_context', crypto.randomUUID());
    body.set('text', params.text);

    const data = await api<SendMessageResponse>('/direct_v2/threads/broadcast/text/', {
      method: 'POST',
      body: body.toString(),
      formEncoded: true,
    });
    return {
      success: data.status === 'ok',
      thread_id: data.payload?.thread_id ?? params.thread_id,
      item_id: data.payload?.item_id ?? '',
    };
  },
});
