import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';
import { mapMember, memberSchema } from './schemas.js';

export const listOrganizationMembers = defineTool({
  name: 'list_organization_members',
  displayName: 'List Organization Members',
  description: 'List all members of a Supabase organization, including their roles.',
  summary: 'List members of an organization',
  icon: 'users',
  group: 'Organizations',
  input: z.object({
    slug: z.string().min(1).describe('Organization slug'),
  }),
  output: z.object({
    members: z.array(memberSchema).describe('List of organization members'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>[]>(`/organizations/${params.slug}/members`);
    return { members: data.map(mapMember) };
  },
});
