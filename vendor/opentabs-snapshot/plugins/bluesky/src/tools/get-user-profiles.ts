import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';
import { mapProfile, profileSchema } from './schemas.js';

export const getUserProfiles = defineTool({
  name: 'get_user_profiles',
  displayName: 'Get User Profiles',
  description: 'Get multiple user profiles in a single request. Accepts up to 25 DIDs or handles.',
  summary: 'Get multiple user profiles',
  icon: 'users',
  group: 'Profiles',
  input: z.object({
    actors: z.array(z.string()).min(1).max(25).describe('DIDs or handles of the users to look up (max 25)'),
  }),
  output: z.object({
    profiles: z.array(profileSchema).describe('The user profiles'),
  }),
  handle: async params => {
    const data = await api<{ profiles: Record<string, unknown>[] }>('app.bsky.actor.getProfiles', {
      query: { actors: params.actors },
    });
    return { profiles: data.profiles.map(mapProfile) };
  },
});
