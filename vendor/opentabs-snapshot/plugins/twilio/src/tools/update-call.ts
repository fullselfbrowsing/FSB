import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { type RawCall, callSchema, mapCall } from './schemas.js';

export const updateCall = defineTool({
  name: 'update_call',
  displayName: 'Update Call',
  description:
    'Modify an in-progress call. Use this to redirect a call to a new TwiML URL or to end a call by setting its status to "completed" or "canceled".',
  summary: 'Update Call',
  icon: 'pencil',
  group: 'Calls',
  input: z.object({
    sid: z.string().describe('Call SID to modify (e.g., CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
    url: z.string().optional().describe('New TwiML URL to redirect the call to'),
    method: z.string().optional().describe('HTTP method for the new TwiML URL (GET or POST)'),
    status: z.enum(['completed', 'canceled']).optional().describe('Set to "completed" or "canceled" to end the call'),
  }),
  output: callSchema,
  handle: async params => {
    const body: Record<string, string> = {};
    if (params.url) body.Url = params.url;
    if (params.method) body.Method = params.method;
    if (params.status) body.Status = params.status;

    const data = await api<RawCall>(`/Calls/${params.sid}.json`, { method: 'POST', body });
    return mapCall(data);
  },
});
