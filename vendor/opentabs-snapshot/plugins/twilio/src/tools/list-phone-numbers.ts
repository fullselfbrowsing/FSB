import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { phoneNumberSchema, type RawPhoneNumber, mapPhoneNumber } from './schemas.js';

export const listPhoneNumbers = defineTool({
  name: 'list_phone_numbers',
  displayName: 'List Phone Numbers',
  description: 'List incoming phone numbers on the account with their capabilities, voice/SMS URLs, and status.',
  summary: 'List incoming phone numbers',
  icon: 'phone',
  group: 'Phone Numbers',
  input: z.object({
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of phone numbers to return per page (default 50, max 1000)'),
  }),
  output: z.object({
    phone_numbers: z.array(phoneNumberSchema).describe('List of incoming phone numbers'),
  }),
  handle: async params => {
    const data = await api<{ incoming_phone_numbers?: RawPhoneNumber[] }>('/IncomingPhoneNumbers.json', {
      query: {
        PageSize: params.page_size ?? 50,
      },
    });
    return { phone_numbers: (data.incoming_phone_numbers ?? []).map(mapPhoneNumber) };
  },
});
