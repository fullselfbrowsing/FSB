import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../posthog-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the profile of the currently authenticated PostHog user including email, name, and organization details.',
  summary: 'Get your PostHog profile',
  icon: 'user',
  group: 'Users',
  input: z.object({}),
  output: z.object({
    user: userSchema
      .extend({
        is_email_verified: z.boolean().describe('Whether the email address is verified'),
        is_2fa_enabled: z.boolean().describe('Whether two-factor authentication is enabled'),
      })
      .describe('The authenticated user profile'),
  }),
  handle: async () => {
    const data = await api<RawUser & Record<string, unknown>>('/api/users/@me/');
    return {
      user: {
        ...mapUser(data),
        is_email_verified: (data.is_email_verified as boolean) ?? false,
        is_2fa_enabled: (data.is_2fa_enabled as boolean) ?? false,
      },
    };
  },
});
