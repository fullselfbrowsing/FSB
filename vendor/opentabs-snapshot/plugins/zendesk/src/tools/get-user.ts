import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../zendesk-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

export const getUser = defineTool({
  name: 'get_user',
  displayName: 'Get User',
  description: 'Get detailed information about a specific Zendesk user by their ID.',
  summary: 'Get a user by ID',
  icon: 'user',
  group: 'Users',
  input: z.object({
    user_id: z.number().int().describe('User ID to retrieve'),
  }),
  output: z.object({
    user: userSchema.describe('The user details'),
  }),
  handle: async params => {
    const data = await api<{ user: RawUser }>(`/users/${params.user_id}.json`);
    return { user: mapUser(data.user) };
  },
});
