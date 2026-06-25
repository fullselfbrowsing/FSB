import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { type RawMessage, mapMessage, messageSchema } from './schemas.js';

export const listMessages = defineTool({
  name: 'list_messages',
  displayName: 'List Messages',
  description: 'List SMS/MMS messages. Supports filtering by recipient, sender, and date sent.',
  summary: 'List Messages',
  icon: 'message-square',
  group: 'Messages',
  input: z.object({
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of messages to return per page (default 20, max 1000)'),
    to: z.string().optional().describe('Filter by recipient phone number (E.164 format)'),
    from: z.string().optional().describe('Filter by sender phone number (E.164 format)'),
    date_sent: z.string().optional().describe('Filter by date sent (YYYY-MM-DD)'),
  }),
  output: z.object({
    messages: z.array(messageSchema).describe('Array of messages'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      PageSize: params.page_size ?? 20,
    };
    if (params.to) query.To = params.to;
    if (params.from) query.From = params.from;
    if (params.date_sent) query.DateSent = params.date_sent;

    const data = await api<{ messages: RawMessage[] }>('/Messages.json', { query });
    return { messages: (data.messages ?? []).map(mapMessage) };
  },
});
