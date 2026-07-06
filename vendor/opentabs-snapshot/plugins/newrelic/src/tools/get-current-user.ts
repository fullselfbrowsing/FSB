import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';
import { mapUser, mapAccount, mapOrganization, userSchema, accountSchema, organizationSchema } from './schemas.js';
import type { RawUser, RawAccount, RawOrganization } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the currently authenticated New Relic user profile including email, name, accounts, and organization.',
  summary: 'Get the current user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    user: userSchema.describe('Current user profile'),
    accounts: z.array(accountSchema).describe('Accounts the user has access to'),
    organization: organizationSchema.describe('User organization'),
  }),
  handle: async () => {
    const data = await graphql<{
      actor: { user: RawUser; accounts: RawAccount[]; organization: RawOrganization };
    }>(`{ actor { user { email name id } accounts { id name } organization { id name } } }`);
    return {
      user: mapUser(data.actor.user ?? {}),
      accounts: (data.actor.accounts ?? []).map(mapAccount),
      organization: mapOrganization(data.actor.organization ?? {}),
    };
  },
});
