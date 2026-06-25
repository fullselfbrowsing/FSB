import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiResponse } from '../terraform-cloud-api.js';
import type { RawUser } from './schemas.js';
import { mapUser, userSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the authenticated user profile including username, email, and 2FA status.',
  summary: 'Get your Terraform Cloud profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    user: userSchema.describe('Authenticated user profile'),
  }),
  handle: async () => {
    const res = await api<JsonApiResponse<RawUser>>('/account/details');
    return { user: mapUser(res.data.id, res.data.attributes) };
  },
});
