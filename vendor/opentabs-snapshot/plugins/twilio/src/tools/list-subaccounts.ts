import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { accountSchema, type RawAccount, mapAccount } from './schemas.js';

export const listSubaccounts = defineTool({
  name: 'list_subaccounts',
  displayName: 'List Subaccounts',
  description: 'List all subaccounts under the current Twilio account. Returns account SIDs, names, and statuses.',
  summary: 'List Twilio subaccounts',
  icon: 'users',
  group: 'Account',
  input: z.object({
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of accounts to return per page (default 50, max 1000)'),
  }),
  output: z.object({
    accounts: z.array(accountSchema).describe('List of subaccounts'),
  }),
  handle: async params => {
    const data = await api<{ accounts?: RawAccount[] }>('.json', {
      baseUrl: 'https://api.twilio.com/2010-04-01/Accounts',
      query: {
        PageSize: params.page_size ?? 50,
      },
    });
    return { accounts: (data.accounts ?? []).map(mapAccount) };
  },
});
