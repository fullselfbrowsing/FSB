import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../twitch-api.js';
import { userSchema, mapUser } from './schemas.js';
import type { RawUser } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the authenticated Twitch user profile including email, display name, follower count, partner/affiliate status, and account creation date.',
  summary: 'Get the authenticated Twitch user profile',
  icon: 'user',
  group: 'Users',
  input: z.object({}),
  output: z.object({ user: userSchema }),
  handle: async () => {
    const data = await gql<{ currentUser: RawUser }>(`{
      currentUser {
        id login displayName description
        profileImageURL(width: 300)
        createdAt hasPrime
        roles { isPartner isAffiliate }
        followers { totalCount }
      }
    }`);
    return { user: mapUser(data.currentUser) };
  },
});
