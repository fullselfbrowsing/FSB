import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../medium-api.js';
import { userSchema, type RawUser, mapUser } from './schemas.js';

export const getUserProfile = defineTool({
  name: 'get_user_profile',
  displayName: 'Get User Profile',
  description:
    'Get a Medium user profile by their username. Returns name, bio, follower counts, and membership status.',
  summary: 'Get a user profile by username',
  icon: 'user',
  group: 'Users',
  input: z.object({
    username: z.string().describe('Medium username (without @)'),
  }),
  output: z.object({ user: userSchema }),
  handle: async params => {
    const data = await gql<{ userResult: RawUser | null }>(
      'UserByUsername',
      `query UserByUsername($username: ID!) {
        userResult(username: $username) {
          ... on User {
            id name username bio imageId mediumMemberAt twitterScreenName
            socialStats { followerCount followingCount }
            membership { tier id }
            viewerEdge { id createdAt }
          }
        }
      }`,
      { username: params.username },
    );
    // userResult returns an empty object {} (not null) when the user doesn't exist,
    // because the inline fragment on User doesn't match non-User types.
    if (!data.userResult?.id) {
      throw ToolError.notFound(`User not found: ${params.username}`);
    }
    return { user: mapUser(data.userResult) };
  },
});
