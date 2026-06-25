import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import { type AsanaResponse, type RawUser, mapUser, userSchema } from './schemas.js';

export const getUser = defineTool({
  name: 'get_user',
  displayName: 'Get User',
  description: 'Get detailed information about a specific Asana user by their GID.',
  summary: 'Get a user by GID',
  icon: 'user',
  group: 'Users',
  input: z.object({
    user_gid: z.string().min(1).describe('User GID to retrieve'),
  }),
  output: z.object({
    user: userSchema.describe('The user'),
  }),
  handle: async params => {
    const data = await api<AsanaResponse<RawUser>>(`/users/${params.user_gid}`, {
      query: { opt_fields: 'name,email' },
    });
    return { user: mapUser(data.data) };
  },
});
