import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getSkypeIdentity } from '../teams-api.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: "Get the authenticated user's profile information including their MRI identifier and email address.",
  summary: 'Get current user info',
  icon: 'user',
  group: 'People',
  input: z.object({}),
  output: z.object({
    mri: z.string().describe('User MRI identifier (e.g., "8:live:username")'),
    email: z.string().describe('Sign-in email address'),
  }),
  handle: async () => {
    const identity = await getSkypeIdentity();
    return {
      mri: `8:${identity.skypeid}`,
      email: identity.signinname,
    };
  },
});
