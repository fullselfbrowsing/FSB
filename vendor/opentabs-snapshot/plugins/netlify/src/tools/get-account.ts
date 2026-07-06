import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { accountSchema, type RawAccount, mapAccount } from './schemas.js';

export const getAccount = defineTool({
  name: 'get_account',
  displayName: 'Get Account',
  description:
    'Get detailed information about a specific Netlify account (team) by its ID. Returns name, slug, plan capabilities, billing info, and owner IDs.',
  summary: 'Get account details by ID',
  icon: 'building',
  group: 'Account',
  input: z.object({
    account_id: z.string().describe('The account ID to retrieve'),
  }),
  output: accountSchema,
  handle: async params => {
    const raw = await api<RawAccount>(`/accounts/${params.account_id}`);
    return mapAccount(raw);
  },
});
