import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../powerpoint-api.js';
import { userSchema } from './schemas.js';

interface RawMeResponse {
  id?: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
}

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the profile of the currently authenticated Microsoft 365 user including name, email, and user ID.',
  summary: 'Get the current user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    user: userSchema.describe('Current user profile'),
  }),
  handle: async () => {
    const data = await api<RawMeResponse>('/me', {
      query: { $select: 'displayName,mail,userPrincipalName,id' },
    });
    return {
      user: {
        id: data.id ?? '',
        display_name: data.displayName ?? '',
        email: data.mail || data.userPrincipalName || '',
      },
    };
  },
});
