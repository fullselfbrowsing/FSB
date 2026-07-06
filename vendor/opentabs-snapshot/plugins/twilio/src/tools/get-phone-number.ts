import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { phoneNumberSchema, type RawPhoneNumber, mapPhoneNumber } from './schemas.js';

export const getPhoneNumber = defineTool({
  name: 'get_phone_number',
  displayName: 'Get Phone Number',
  description: 'Get detailed information about a specific incoming phone number by its SID.',
  summary: 'Get phone number details by SID',
  icon: 'phone',
  group: 'Phone Numbers',
  input: z.object({
    sid: z.string().min(1).describe('Phone number SID (PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
  }),
  output: z.object({
    phone_number: phoneNumberSchema.describe('Phone number details'),
  }),
  handle: async params => {
    const data = await api<RawPhoneNumber>(`/IncomingPhoneNumbers/${params.sid}.json`);
    return { phone_number: mapPhoneNumber(data) };
  },
});
