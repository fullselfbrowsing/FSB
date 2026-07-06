import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { callerIdSchema, type RawCallerId, mapCallerId } from './schemas.js';

export const listCallerIds = defineTool({
  name: 'list_caller_ids',
  displayName: 'List Caller IDs',
  description:
    'List verified outgoing caller IDs on the account. These are phone numbers verified for use as caller ID.',
  summary: 'List verified outgoing caller IDs',
  icon: 'phone-outgoing',
  group: 'Phone Numbers',
  input: z.object({
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of caller IDs to return per page (default 50, max 1000)'),
  }),
  output: z.object({
    caller_ids: z.array(callerIdSchema).describe('List of verified outgoing caller IDs'),
  }),
  handle: async params => {
    const data = await api<{ outgoing_caller_ids?: RawCallerId[] }>('/OutgoingCallerIds.json', {
      query: {
        PageSize: params.page_size ?? 50,
      },
    });
    return { caller_ids: (data.outgoing_caller_ids ?? []).map(mapCallerId) };
  },
});
