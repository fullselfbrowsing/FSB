import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chatgpt-api.js';

export const getAccountInfo = defineTool({
  name: 'get_account_info',
  displayName: 'Get Account Info',
  description: 'Get ChatGPT account details including subscription plan, features, and entitlements.',
  summary: 'Get account subscription and features',
  icon: 'credit-card',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    plan_type: z.string().describe('Subscription plan type (e.g., "chatgptfreeplan", "chatgptplusplan")'),
    is_paid: z.boolean().describe('Whether the account has an active paid subscription'),
    features: z.array(z.string()).describe('List of enabled feature flags'),
  }),
  handle: async () => {
    const data = await api<{
      accounts: Record<
        string,
        {
          entitlement?: { subscription_plan?: string };
          features?: string[];
          is_paid?: boolean;
        }
      >;
      account_ordering: string[];
    }>('/accounts/check/v4-2023-04-27');

    const accountId = data.account_ordering[0] ?? '';
    const account = data.accounts[accountId];

    return {
      plan_type: account?.entitlement?.subscription_plan ?? '',
      is_paid: account?.is_paid ?? false,
      features: account?.features ?? [],
    };
  },
});
