import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';
import { type RawUserStatus, mapUserStatus, userStatusSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the authenticated LeetCode user profile including username, premium status, and notification count.',
  summary: 'Get your LeetCode profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: userStatusSchema }),
  handle: async () => {
    const data = await graphql<{ userStatus: RawUserStatus }>(
      `query globalData {
				userStatus {
					userId
					username
					avatar
					isSignedIn
					isMockUser
					isPremium
					isVerified
					checkedInToday
					notificationStatus { lastModified numUnread }
					activeSessionId
				}
			}`,
    );
    return { user: mapUserStatus(data.userStatus) };
  },
});
