import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const navigateToBusiness = defineTool({
  name: 'navigate_to_business',
  displayName: 'Navigate to Business',
  description:
    'Navigate the browser to a specific Yelp business page by its URL alias. Opens the business detail page in the current tab.',
  summary: 'Open a business page in the browser',
  icon: 'external-link',
  group: 'Navigation',
  input: z.object({
    alias: z
      .string()
      .describe(
        'Business URL alias (e.g., "a-slice-of-new-york-san-jose"). Found in business URLs: yelp.com/biz/{alias}',
      ),
  }),
  output: z.object({
    url: z.string().describe('The URL that was navigated to'),
  }),
  handle: async params => {
    const url = `https://www.yelp.com/biz/${params.alias}`;
    window.location.href = url;
    return { url };
  },
});
