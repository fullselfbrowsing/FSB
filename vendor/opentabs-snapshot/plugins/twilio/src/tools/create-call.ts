import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { type RawCall, callSchema, mapCall } from './schemas.js';

export const createCall = defineTool({
  name: 'create_call',
  displayName: 'Create Call',
  description: 'Initiate a voice call. Requires a TwiML URL that returns instructions for the call.',
  summary: 'Create Call',
  icon: 'phone-outgoing',
  group: 'Calls',
  input: z.object({
    to: z.string().describe('Recipient phone number in E.164 format (e.g., +15551234567)'),
    from: z.string().describe('Caller Twilio phone number in E.164 format (e.g., +15559876543)'),
    url: z.string().describe('TwiML URL that returns voice instructions for the call'),
    method: z.string().optional().describe('HTTP method for the TwiML URL (GET or POST)'),
    status_callback: z.string().optional().describe('URL to receive call status webhooks'),
    status_callback_method: z.string().optional().describe('HTTP method for the status callback URL (GET or POST)'),
  }),
  output: callSchema,
  handle: async params => {
    const body: Record<string, string> = {
      To: params.to,
      From: params.from,
      Url: params.url,
    };
    if (params.method) body.Method = params.method;
    if (params.status_callback) body.StatusCallback = params.status_callback;
    if (params.status_callback_method) body.StatusCallbackMethod = params.status_callback_method;

    const data = await api<RawCall>('/Calls.json', { method: 'POST', body });
    return mapCall(data);
  },
});
