import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';
import { type RawMatchedUser, mapUserProfile, userProfileSchema } from './schemas.js';

export const getUserProfile = defineTool({
  name: 'get_user_profile',
  displayName: 'Get User Profile',
  description:
    'Get a LeetCode user public profile by username. Returns real name, bio, ranking, company, school, and skill tags.',
  summary: 'Get a user profile by username',
  icon: 'user',
  group: 'Users',
  input: z.object({
    username: z.string().describe('LeetCode username'),
  }),
  output: z.object({ profile: userProfileSchema }),
  handle: async params => {
    const data = await graphql<{ matchedUser: RawMatchedUser }>(
      `query userPublicProfile($username: String!) {
				matchedUser(username: $username) {
					username
					profile {
						realName aboutMe userAvatar reputation ranking
						company school websites countryName skillTags
					}
				}
			}`,
      { username: params.username },
    );
    return { profile: mapUserProfile(data.matchedUser ?? {}) };
  },
});
