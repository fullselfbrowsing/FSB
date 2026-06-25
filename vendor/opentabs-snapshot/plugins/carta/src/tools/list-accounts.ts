import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../carta-api.js';
import { accountSchema } from './schemas.js';

interface AccountSwitcherResponse {
  accounts: Array<{
    name: string;
    id: string;
    accountType: string;
    isFavorite: boolean;
    url: string;
  }>;
}

export const listAccounts = defineTool({
  name: 'list_accounts',
  displayName: 'List Accounts',
  description: 'List all Carta accounts the user has access to, including portfolio and organization accounts.',
  summary: 'List user accounts',
  icon: 'users',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    accounts: z.array(accountSchema),
  }),
  handle: async () => {
    const data = await api<AccountSwitcherResponse>('/api/fe-platform/account-switcher/');
    return {
      accounts: data.accounts.map(a => ({
        name: a.name,
        id: a.id,
        account_type: a.accountType,
        is_favorite: a.isFavorite,
      })),
    };
  },
});
