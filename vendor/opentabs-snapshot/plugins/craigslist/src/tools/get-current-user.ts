import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getUserEmail, getUserId, wapi } from '../craigslist-api.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the currently authenticated Craigslist user profile including email, user ID, and default area.',
  summary: 'Get the current user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    userId: z.string().describe('Craigslist user ID'),
    email: z.string().describe('Account email address'),
    defaultAreaId: z.number().describe('Default geographic area ID'),
  }),
  handle: async () => {
    const resp = await wapi<{ apiVersion: string; defaultAreaId: number; userEmail: string }>('/user/info');
    return {
      userId: getUserId(),
      email: getUserEmail(),
      defaultAreaId: resp.data.defaultAreaId ?? 0,
    };
  },
});
