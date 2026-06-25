import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getOrgId } from '../claude-api.js';
import { type RawAccount, accountSchema, mapAccount } from './schemas.js';

interface BootstrapResponse {
  account?: RawAccount;
}

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the profile of the currently authenticated Claude user including email, name, and verification status.',
  summary: 'Get the current user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    account: accountSchema.describe('The authenticated user account'),
  }),
  handle: async () => {
    const orgId = getOrgId();
    const data = await api<BootstrapResponse>(`/bootstrap/${orgId}/app_start`);
    return { account: mapAccount(data.account ?? {}) };
  },
});
