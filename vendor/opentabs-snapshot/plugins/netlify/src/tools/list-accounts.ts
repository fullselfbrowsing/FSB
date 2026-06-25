import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { accountSchema, type RawAccount, mapAccount } from './schemas.js';

export const listAccounts = defineTool({
  name: 'list_accounts',
  displayName: 'List Accounts',
  description:
    'List all Netlify accounts (teams) the authenticated user has access to. Returns account name, slug, plan capabilities, billing info, and owner IDs.',
  summary: 'List all accounts',
  icon: 'list',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    items: z.array(accountSchema).describe('List of accounts'),
  }),
  handle: async () => {
    const raw = await api<RawAccount[]>('/accounts');
    return { items: raw.map(mapAccount) };
  },
});
