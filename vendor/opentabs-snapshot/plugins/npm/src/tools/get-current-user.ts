import { defineTool, getPageGlobal } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getUsername } from '../npm-api.js';

export const get_current_user = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the profile of the currently authenticated npm user including username and avatar.',
  summary: 'Get the authenticated npm user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    username: z.string().describe('npm username'),
    avatar_url: z.string().describe('Avatar URL'),
    email_verified: z.boolean().describe('Whether email is verified'),
  }),
  handle: async () => {
    const username = getUsername();
    const avatarLarge = getPageGlobal('__context__.context.user.avatars.large') as string | undefined;
    const emailVerified = getPageGlobal('__context__.context.userEmailVerified') as boolean | undefined;
    return {
      username,
      avatar_url: avatarLarge ? `https://www.npmjs.com${avatarLarge}` : '',
      email_verified: emailVerified ?? false,
    };
  },
});
