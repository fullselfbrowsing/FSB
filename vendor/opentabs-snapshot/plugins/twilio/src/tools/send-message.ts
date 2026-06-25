import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { type RawMessage, mapMessage, messageSchema } from './schemas.js';

export const sendMessage = defineTool({
  name: 'send_message',
  displayName: 'Send Message',
  description: 'Send an SMS or MMS message. Requires a Twilio phone number as the sender.',
  summary: 'Send Message',
  icon: 'send',
  group: 'Messages',
  input: z.object({
    to: z.string().describe('Recipient phone number in E.164 format (e.g., +15551234567)'),
    from: z.string().describe('Sender Twilio phone number in E.164 format (e.g., +15559876543)'),
    body: z.string().describe('Message text content'),
    media_url: z.string().optional().describe('URL of media to include (for MMS)'),
  }),
  output: messageSchema,
  handle: async params => {
    const body: Record<string, string> = {
      To: params.to,
      From: params.from,
      Body: params.body,
    };
    if (params.media_url) body.MediaUrl = params.media_url;

    const data = await api<RawMessage>('/Messages.json', { method: 'POST', body });
    return mapMessage(data);
  },
});
