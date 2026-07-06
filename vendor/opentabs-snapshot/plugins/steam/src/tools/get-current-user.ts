import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getAccountId, getSteamId64 } from '../steam-api.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the currently logged-in Steam user identity. Returns the account ID and Steam64 ID. The Steam64 ID is the 17-digit identifier used in profile URLs and API calls.',
  summary: 'Get current logged-in Steam user info',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    account_id: z.number().describe('Steam account ID (32-bit)'),
    steam_id64: z.string().describe('Steam64 ID (17-digit identifier)'),
  }),
  handle: async () => ({
    account_id: getAccountId(),
    steam_id64: getSteamId64(),
  }),
});
