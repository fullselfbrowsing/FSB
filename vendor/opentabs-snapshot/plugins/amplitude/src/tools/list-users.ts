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

export const listUsers = defineTool({
  name: 'list_users',
  displayName: 'List Users',
  description: 'List all members of the current Amplitude organization with their roles, email, and profile details.',
  summary: 'List organization members',
  icon: 'users',
  group: 'Users',
  input: z.object({}),
  output: z.object({
    users: z.array(userSchema).describe('List of organization members'),
  }),
  handle: async () => {
    const data = await gql<{ users: RawUser[] }>('Users', QUERY);
    return { users: (data.users ?? []).map(mapUser) };
  },
});
