import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';
import { membershipSchema, mapMembership } from './schemas.js';

export const listOrganizationMembers = defineTool({
  name: 'list_organization_members',
  displayName: 'List Organization Members',
  description: 'List all members of an organization with their roles.',
  summary: 'List org members',
  icon: 'users',
  group: 'Organizations',
  input: z.object({
    organization_name: z.string().describe('Organization name'),
  }),
  output: z.object({ members: z.array(membershipSchema) }),
  handle: async ({ organization_name }) => {
    const data = await graphql<{ organizationMemberships: Array<Record<string, unknown>> }>(
      queries.GET_ORGANIZATION_MEMBERSHIPS,
      { organizationName: organization_name },
    );
    return { members: data.organizationMemberships.map(mapMembership) };
  },
});
