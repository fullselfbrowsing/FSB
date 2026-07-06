import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPageData, getCustomerInfo, isAuthenticated } from '../walmart-api.js';
import { mapUserProfile, type RawUserProfile, userProfileSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the authenticated Walmart user profile including name, email, and customer ID.',
  summary: 'Get the authenticated Walmart user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: userProfileSchema }),
  handle: async () => {
    if (!isAuthenticated()) {
      throw ToolError.auth('Not logged in to Walmart.');
    }

    try {
      const data = await fetchPageData('/');
      const bootstrapData = data.bootstrapData as Record<string, unknown> | undefined;
      const account = bootstrapData?.account as Record<string, unknown> | undefined;
      const accountData = account?.data as Record<string, unknown> | undefined;
      const accountInner = accountData?.account as Record<string, unknown> | undefined;
      const profile = accountInner?.profile as RawUserProfile | undefined;

      if (profile?.firstName) {
        return { user: mapUserProfile(profile) };
      }
    } catch {
      // Fall back to cookie-based info
    }

    const info = getCustomerInfo();
    if (info) {
      return {
        user: mapUserProfile({
          firstName: info.firstName,
          lastNameInitial: info.lastNameInitial,
          ceid: info.ceid,
        }),
      };
    }

    return { user: mapUserProfile({}) };
  },
});
