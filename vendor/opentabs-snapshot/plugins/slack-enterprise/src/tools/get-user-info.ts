import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';
import { mapUserProfile, userProfileSchema } from './schemas.js';

export const getUserInfo = defineTool({
  name: 'get_user_info',
  displayName: 'Get User Info',
  description: 'Get detailed information about a Slack user including name, display name, and admin status.',
  summary: 'Get user profile',
  icon: 'user',
  group: 'Users',
  input: z.object({
    user: z.string().describe('User ID to retrieve the profile for (e.g., U1234567890)'),
  }),
  output: z.object({ user: userProfileSchema }),
  handle: async params => {
    const data = await slackApi<{ user: Record<string, unknown> }>('users.info', {
      user: params.user,
    });
    return { user: mapUserProfile(data.user) };
  },
});
