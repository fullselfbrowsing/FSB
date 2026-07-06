import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const navigateToAccount = defineTool({
  name: 'navigate_to_account',
  displayName: 'Navigate to Account',
  description:
    'Navigate the browser to the Expedia account settings page where the user can manage their profile, OneKey rewards, payment methods, and preferences.',
  summary: 'Open the account settings page',
  icon: 'settings',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    url: z.string().describe('URL of the account page'),
    navigated: z.boolean().describe('Whether the browser was navigated'),
  }),
  handle: async () => {
    window.location.href = '/account';
    return {
      url: 'https://www.expedia.com/account',
      navigated: true,
    };
  },
});
