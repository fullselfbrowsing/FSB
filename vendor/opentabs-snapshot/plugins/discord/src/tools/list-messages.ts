// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../discord-api.js';

export const listMessages = defineTool({
  name: 'list_messages',
  displayName: 'List Messages',
  description: 'List recent messages in a Discord channel. Optionally page through history with a before/after message ID.',
  summary: 'read my discord messages in a channel',
  icon: 'message-square',
  group: 'Messages',
  input: z.object({
    channel_id: z.string().min(1).describe('The channel ID to read messages from'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of messages to return (1-100)'),
    before: z.string().optional().describe('Return messages before this message ID (pagination)'),
    after: z.string().optional().describe('Return messages after this message ID (pagination)'),
  }),
  output: z.object({
    messages: z.array(z.object({
      id: z.string(),
      content: z.string(),
      author: z.string(),
    })).describe('Recent messages in the channel'),
  }),
  handle: async (params: { channel_id: string; limit?: number; before?: string; after?: string }) => {
    // NEVER executed by the importer. Upstream: api GET /channels/:id/messages (default method).
    const data = await api<{ messages: unknown[] }>(`/channels/${params.channel_id}/messages`, {
      query: { limit: params.limit, before: params.before, after: params.after },
    });
    return { messages: data.messages as { id: string; content: string; author: string }[] };
  },
});
