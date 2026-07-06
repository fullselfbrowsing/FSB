import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../amplitude-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

const QUERY = `query Users {
  users {
    id alias avatarVersion blurb createdAt defaultAllProjectRole
    defaultAppId email firstName fullName hasAvatar hasOutstandingInvite
    isConnectedToSlack lastName loginId name orgRole orgTeam title pronouns
  }
}`;

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the profile of the currently authenticated Amplitude user including name, email, organization role, and account details.',
  summary: 'Get the authenticated user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: userSchema }),
  handle: async () => {
    const data = await gql<{ users: RawUser[] }>('Users', QUERY);
    const currentEmail = document.querySelector<HTMLElement>('[data-testid="user-email"]')?.textContent;
    const me = data.users.find(u => u.loginId === currentEmail || u.email === currentEmail) ?? data.users[0];
    return { user: mapUser(me ?? {}) };
  },
});
