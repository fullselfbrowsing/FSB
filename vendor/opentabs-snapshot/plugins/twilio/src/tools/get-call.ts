import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { type RawCall, callSchema, mapCall } from './schemas.js';

export const getCall = defineTool({
  name: 'get_call',
  displayName: 'Get Call',
  description: 'Get a specific voice call by its SID.',
  summary: 'Get Call',
  icon: 'phone-call',
  group: 'Calls',
  input: z.object({
    sid: z.string().describe('Call SID (e.g., CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
  }),
  output: callSchema,
  handle: async params => {
    const data = await api<RawCall>(`/Calls/${params.sid}.json`);
    return mapCall(data);
  },
});
