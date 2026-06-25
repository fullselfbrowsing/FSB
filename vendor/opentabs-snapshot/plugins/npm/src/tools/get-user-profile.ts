import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { spiferack } from '../npm-api.js';
import { userProfileSchema, mapUserProfile } from './schemas.js';
import type { RawProfilePage } from './schemas.js';

export const get_user_profile = defineTool({
  name: 'get_user_profile',
  displayName: 'Get User Profile',
  description: 'Get a public npm user profile by username. Returns username, avatar, package count, and organizations.',
  summary: 'Get an npm user profile',
  icon: 'user',
  group: 'Users',
  input: z.object({
    username: z.string().describe('npm username (e.g., "sindresorhus")'),
  }),
  output: z.object({
    user: userProfileSchema,
  }),
  handle: async params => {
    const data = await spiferack<RawProfilePage>(`/~${params.username}`);
    return { user: mapUserProfile(data) };
  },
});
