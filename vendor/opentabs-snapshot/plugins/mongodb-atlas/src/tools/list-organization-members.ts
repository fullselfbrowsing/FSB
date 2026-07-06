import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getOrgId } from '../atlas-api.js';
import { type RawOrgMember, mapOrgMember, orgMemberSchema } from './schemas.js';

export const listOrganizationMembers = defineTool({
  name: 'list_organization_members',
  displayName: 'List Organization Members',
  description:
    'List all members of the current MongoDB Atlas organization with their roles, email, and last authentication time.',
  summary: 'List organization members',
  icon: 'users',
  group: 'Organizations',
  input: z.object({}),
  output: z.object({ members: z.array(orgMemberSchema).describe('Organization members') }),
  handle: async () => {
    const orgId = getOrgId();
    const raw = await api<RawOrgMember[]>(`/orgs/${orgId}/users`);
    return { members: (raw ?? []).map(mapOrgMember) };
  },
});
