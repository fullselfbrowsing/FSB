import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getObfuscatedUserId, getPreloadAccountTree } from '../ga-api.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get information about the currently authenticated Google Analytics user, including their obfuscated user ID and associated accounts.',
  summary: 'Get current user info',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    user_id: z.string().describe('Obfuscated Google user ID'),
    account_count: z.number().describe('Number of GA accounts accessible to this user'),
    accounts: z
      .array(
        z.object({
          id: z.string().describe('GA account ID'),
          name: z.string().describe('Account display name'),
        }),
      )
      .describe('GA accounts accessible to the user'),
  }),
  handle: async () => {
    const userId = getObfuscatedUserId();
    const accountTree = getPreloadAccountTree() as {
      accounts?: Array<{ id?: string; name?: string }>;
    } | null;

    const accounts = (accountTree?.accounts ?? []).map(a => ({
      id: a.id ?? '',
      name: a.name ?? '',
    }));

    return {
      user_id: userId,
      account_count: accounts.length,
      accounts,
    };
  },
});
