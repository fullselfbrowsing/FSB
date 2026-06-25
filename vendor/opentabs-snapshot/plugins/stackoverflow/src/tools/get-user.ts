import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stackoverflow-api.js';
import { userSchema, mapUser } from './schemas.js';

export const getUser = defineTool({
  name: 'get_user',
  displayName: 'Get User',
  description:
    'Get a Stack Overflow user profile by their user ID. Returns reputation, badge counts, question/answer counts, and profile information.',
  summary: 'Get user profile by ID',
  icon: 'user',
  group: 'Users',
  input: z.object({
    user_id: z.number().int().describe('User ID'),
  }),
  output: z.object({
    user: userSchema.describe('User profile'),
  }),
  handle: async params => {
    const data = await api(`/users/${params.user_id}`);
    const item = data.items?.[0];
    if (!item) throw ToolError.notFound(`User ${params.user_id} not found`);
    return { user: mapUser(item) };
  },
});
