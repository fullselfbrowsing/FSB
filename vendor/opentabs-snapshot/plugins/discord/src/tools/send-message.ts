// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../discord-api.js';

export const sendMessage = defineTool({
  name: 'send_message',
  displayName: 'Send Message',
  description:
    'Send a message to a Discord channel. Posts the content to the channel on your behalf; this is visible to everyone in the channel. Optionally reply to an existing message.',
  summary: 'send a message in discord',
  icon: 'send',
  group: 'Messages',
  input: z.object({
    channel_id: z.string().min(1).describe('The channel ID to send the message to'),
    content: z.string().min(1).max(2000).describe('The message text to send (max 2000 characters)'),
    reply_to_message_id: z.string().optional().describe('Message ID to reply to (omit to send a standalone message)'),
  }),
  output: z.object({
    message: z.object({
      id: z.string(),
      content: z.string(),
    }).describe('The sent message record'),
  }),
  handle: async (params: { channel_id: string; content: string; reply_to_message_id?: string }) => {
    // NEVER executed by the importer. Upstream: api POST /channels/:id/messages
    // (send -> WRITE; the {method:'POST'} literal reinforces the write class on both axes).
    const data = await api<{ message: { id: string; content: string } }>(`/channels/${params.channel_id}/messages`, {
      method: 'POST',
      body: { content: params.content, message_reference: params.reply_to_message_id },
    });
    return { message: data.message };
  },
});
