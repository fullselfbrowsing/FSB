import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getConsoleProto, grpc } from '../cockroachdb-api.js';

export const getUserProfile = defineTool({
  name: 'get_user_profile',
  displayName: 'Get User Profile',
  description: 'Get the profile and preferences of the currently authenticated CockroachDB Cloud user.',
  summary: 'Get current user profile',
  icon: 'user',
  group: 'Organization',
  input: z.object({}),
  output: z.object({
    traits: z.record(z.string(), z.unknown()).describe('User profile traits and preferences'),
  }),
  handle: async () => {
    const p = getConsoleProto();
    const data = await grpc<{ traits?: Record<string, unknown> }>('GetUserProfile', p.GetUserProfileResponse);
    return { traits: data.traits ?? {} };
  },
});
