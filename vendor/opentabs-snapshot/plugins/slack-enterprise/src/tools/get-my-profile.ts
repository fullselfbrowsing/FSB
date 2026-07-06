import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';

export const getMyProfile = defineTool({
  name: 'get_my_profile',
  displayName: 'Get My Profile',
  description: "Get the current authenticated user's profile including user ID, username, team name, and admin status.",
  summary: 'Get your own profile',
  icon: 'user-check',
  group: 'Users',
  input: z.object({}),
  output: z.object({
    user_id: z.string(),
    user: z.string(),
    team: z.string(),
    team_id: z.string(),
    enterprise_id: z.string(),
  }),
  handle: async () => {
    const data = await slackApi<{
      user_id: string;
      user: string;
      team: string;
      team_id: string;
      enterprise_id?: string;
    }>('auth.test');
    return {
      user_id: data.user_id ?? '',
      user: data.user ?? '',
      team: data.team ?? '',
      team_id: data.team_id ?? '',
      enterprise_id: data.enterprise_id ?? '',
    };
  },
});
