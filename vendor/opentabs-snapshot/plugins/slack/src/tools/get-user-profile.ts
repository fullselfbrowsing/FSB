import { slackApi } from '../slack-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const getUserProfile = defineTool({
  name: 'get_user_profile',
  displayName: 'Get User Profile',
  description: "Retrieve a Slack user's profile information by user ID",
  summary: "Get a user's profile information",
  icon: 'user',
  group: 'Users',
  input: z.object({
    user: z.string().min(1).describe('User ID to retrieve the profile for (e.g., U01234567)'),
  }),
  output: z.object({
    user: z
      .object({
        id: z.string().describe('User ID'),
        name: z.string().describe('Username (handle)'),
        real_name: z.string().describe('Full display name'),
        profile: z
          .object({
            title: z.string().describe('Job title'),
            phone: z.string().describe('Phone number'),
            email: z.string().describe('Email address'),
            status_text: z.string().describe('Custom status text'),
            status_emoji: z.string().describe('Custom status emoji'),
            image_72: z.string().describe('URL to 72x72 profile image'),
          })
          .describe('Detailed profile information'),
        is_admin: z.boolean().describe('Whether the user is a workspace admin'),
        is_bot: z.boolean().describe('Whether the user is a bot'),
        tz: z.string().describe('Timezone identifier (e.g., America/Los_Angeles)'),
      })
      .describe('User profile data'),
  }),
  handle: async params => {
    const data = await slackApi<{
      user: {
        id: string;
        name: string;
        real_name?: string;
        profile?: {
          title?: string;
          phone?: string;
          email?: string;
          status_text?: string;
          status_emoji?: string;
          image_72?: string;
        };
        is_admin?: boolean;
        is_bot?: boolean;
        tz?: string;
      };
    }>('users.info', { user: params.user });
    return {
      user: {
        id: data.user.id,
        name: data.user.name,
        real_name: data.user.real_name ?? '',
        profile: {
          title: data.user.profile?.title ?? '',
          phone: data.user.profile?.phone ?? '',
          email: data.user.profile?.email ?? '',
          status_text: data.user.profile?.status_text ?? '',
          status_emoji: data.user.profile?.status_emoji ?? '',
          image_72: data.user.profile?.image_72 ?? '',
        },
        is_admin: data.user.is_admin ?? false,
        is_bot: data.user.is_bot ?? false,
        tz: data.user.tz ?? '',
      },
    };
  },
});
