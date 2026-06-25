import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { wapi } from '../craigslist-api.js';

export const renewAllPostings = defineTool({
  name: 'renew_all_postings',
  displayName: 'Renew All Postings',
  description:
    'Renew all eligible postings in bulk. Check list_renewable_postings first to see which postings are eligible. This action renews all renewable postings at once.',
  summary: 'Bulk renew all eligible postings',
  icon: 'rotate-cw',
  group: 'Postings',
  input: z.object({}),
  output: z.object({
    success: z.boolean().describe('Whether the renewal request succeeded'),
  }),
  handle: async () => {
    await wapi<Record<string, unknown>>('/postings/bulk-action/renew/run', {
      method: 'POST',
      body: '{}',
      contentType: 'application/json',
    });
    return { success: true };
  },
});
