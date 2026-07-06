import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { type RawCall, callSchema, mapCall } from './schemas.js';

export const listCalls = defineTool({
  name: 'list_calls',
  displayName: 'List Calls',
  description: 'List voice calls. Supports filtering by recipient, sender, and call status.',
  summary: 'List Calls',
  icon: 'phone-call',
  group: 'Calls',
  input: z.object({
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of calls to return per page (default 20, max 1000)'),
    to: z.string().optional().describe('Filter by called phone number (E.164 format)'),
    from: z.string().optional().describe('Filter by caller phone number (E.164 format)'),
    status: z
      .enum(['queued', 'ringing', 'in-progress', 'completed', 'busy', 'no-answer', 'canceled', 'failed'])
      .optional()
      .describe('Filter by call status'),
  }),
  output: z.object({
    calls: z.array(callSchema).describe('Array of calls'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      PageSize: params.page_size ?? 20,
    };
    if (params.to) query.To = params.to;
    if (params.from) query.From = params.from;
    if (params.status) query.Status = params.status;

    const data = await api<{ calls: RawCall[] }>('/Calls.json', { query });
    return { calls: (data.calls ?? []).map(mapCall) };
  },
});
