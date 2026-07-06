import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';
import { mapProfile, profileSchema } from './schemas.js';

export const getUserProfile = defineTool({
  name: 'get_user_profile',
  displayName: 'Get User Profile',
  description:
    "Get a user's profile by their DID or handle. Returns detailed profile information including bio, follower counts, and viewer relationship.",
  summary: 'Get a user profile by DID or handle',
  icon: 'user',
  group: 'Profiles',
  input: z.object({
    actor: z.string().describe('DID or handle of the user to look up'),
  }),
  output: z.object({
    profile: profileSchema.describe('The user profile'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>>('app.bsky.actor.getProfile', {
      query: { actor: params.actor },
    });
    return { profile: mapProfile(data) };
  },
});
