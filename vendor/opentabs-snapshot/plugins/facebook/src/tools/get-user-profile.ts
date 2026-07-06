import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../facebook-api.js';
import { type RawProfile, mapProfile, profileSchema } from './schemas.js';

export const getUserProfile = defineTool({
  name: 'get_user_profile',
  displayName: 'Get User Profile',
  description:
    'Get a Facebook user profile by their numeric user ID. Returns name, bio, profile picture, cover photo, friend count, and friendship status.',
  summary: 'Get a user profile by ID',
  icon: 'user-circle',
  group: 'Users',
  input: z.object({
    user_id: z.string().describe('Facebook user ID (numeric string)'),
  }),
  output: z.object({ profile: profileSchema }),
  handle: async params => {
    const data = await graphql<RawProfile>('ProfileCometHeaderQuery', {
      userID: params.user_id,
      shouldDeferProfilePhotoID: false,
      useVNextHeader: false,
      scale: 2,
    });
    return { profile: mapProfile(data) };
  },
});
