import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onlyfans-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

export const listUsers = defineTool({
  name: 'list_users',
  displayName: 'List Users',
  description:
    'Bulk-resolve users by their numeric IDs. Returns profile data for up to 25 users at once. Use the a[] parameter for "author" view or r[] for "referenced" view.',
  summary: 'Look up multiple users by ID',
  icon: 'users',
  group: 'Users',
  input: z.object({
    user_ids: z.array(z.number().int()).min(1).max(25).describe('Array of numeric user IDs to resolve (max 25)'),
  }),
  output: z.object({
    users: z.array(userSchema).describe('Resolved user profiles'),
  }),
  handle: async params => {
    const qs = params.user_ids.map(id => `a[]=${id}`).join('&');
    const data = await api<Record<string, RawUser>>(`/users/list?${qs}`);
    const users = Object.values(data).map(mapUser);
    return { users };
  },
});
