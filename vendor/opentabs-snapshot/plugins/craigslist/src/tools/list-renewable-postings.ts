import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { wapi } from '../craigslist-api.js';

export const listRenewablePostings = defineTool({
  name: 'list_renewable_postings',
  displayName: 'List Renewable Postings',
  description:
    'List posting IDs that are eligible for renewal. Returns posting IDs and UUIDs that can be renewed using renew_all_postings.',
  summary: 'List postings eligible for renewal',
  icon: 'refresh-cw',
  group: 'Postings',
  input: z.object({}),
  output: z.object({
    ids: z.array(z.number()).describe('Posting IDs eligible for renewal'),
    uuids: z.array(z.string()).describe('Posting UUIDs eligible for renewal'),
  }),
  handle: async () => {
    const resp = await wapi<{ ids: number[]; uuids: string[] }>('/postings/bulk-action/renew/list');
    return {
      ids: resp.data.ids ?? [],
      uuids: resp.data.uuids ?? [],
    };
  },
});
