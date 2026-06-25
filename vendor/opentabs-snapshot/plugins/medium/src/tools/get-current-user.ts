import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../medium-api.js';
import { userSchema, type RawUser, mapUser } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the profile of the currently authenticated Medium user including name, bio, follower counts, and membership status.',
  summary: 'Get your Medium profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: userSchema }),
  handle: async () => {
    const data = await gql<{ viewer: RawUser }>(
      'ViewerQuery',
      `query ViewerQuery {
        viewer {
          id name username bio imageId mediumMemberAt twitterScreenName
          membership { tier id }
          viewerEdge { id createdAt }
          socialStats { followerCount followingCount }
        }
      }`,
    );
    return { user: mapUser(data.viewer) };
  },
});
