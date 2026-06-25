import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';
import { organizationSchema, mapOrg } from './schemas.js';

export const listOrganizations = defineTool({
  name: 'list_organizations',
  displayName: 'List Organizations',
  description: 'List all organizations the current user belongs to.',
  summary: 'List organizations',
  icon: 'building',
  group: 'Organizations',
  input: z.object({}),
  output: z.object({ organizations: z.array(organizationSchema) }),
  handle: async () => {
    const data = await graphql<{ organizations: Array<Record<string, unknown>> }>(queries.GET_ORGANIZATIONS);
    return { organizations: data.organizations.map(mapOrg) };
  },
});
