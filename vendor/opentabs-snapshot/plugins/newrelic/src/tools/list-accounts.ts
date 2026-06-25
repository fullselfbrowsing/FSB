import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';
import { mapAccount, accountSchema } from './schemas.js';
import type { RawAccount } from './schemas.js';

export const listAccounts = defineTool({
  name: 'list_accounts',
  displayName: 'List Accounts',
  description: 'List all New Relic accounts accessible to the current user.',
  summary: 'List accessible accounts',
  icon: 'building-2',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    accounts: z.array(accountSchema).describe('List of accounts'),
  }),
  handle: async () => {
    const data = await graphql<{
      currentUser: { accounts: RawAccount[] };
    }>(`{ currentUser { accounts { id name } } }`);
    return { accounts: (data.currentUser.accounts ?? []).map(mapAccount) };
  },
});
