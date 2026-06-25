import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getDid } from '../bluesky-api.js';
import { mapProfile, profileSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: "Get the authenticated user's profile including name, handle, bio, follower counts, and avatar.",
  summary: "Get the authenticated user's profile",
  icon: 'user-circle',
  group: 'Profiles',
  input: z.object({}),
  output: z.object({
    profile: profileSchema.describe('The authenticated user profile'),
  }),
  handle: async () => {
    const did = getDid();
    const data = await api<Record<string, unknown>>('app.bsky.actor.getProfile', {
      query: { actor: did },
    });
    return { profile: mapProfile(data) };
  },
});
