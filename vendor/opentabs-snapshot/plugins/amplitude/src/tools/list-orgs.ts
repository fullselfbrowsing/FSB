import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../amplitude-api.js';

const QUERY = `query Orgs {
  orgs { id name }
}`;

export const listOrgs = defineTool({
  name: 'list_orgs',
  displayName: 'List Organizations',
  description: 'List all Amplitude organizations the current user belongs to. Returns organization IDs and names.',
  summary: 'List all organizations',
  icon: 'building',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    orgs: z
      .array(
        z.object({
          id: z.string().describe('Organization numeric ID'),
          name: z.string().describe('Organization display name'),
        }),
      )
      .describe('List of organizations'),
  }),
  handle: async () => {
    const data = await gql<{
      orgs: Array<{ id?: string | number; name?: string }>;
    }>('Orgs', QUERY);
    return {
      orgs: (data.orgs ?? []).map(o => ({
        id: String(o.id ?? ''),
        name: o.name ?? '',
      })),
    };
  },
});
