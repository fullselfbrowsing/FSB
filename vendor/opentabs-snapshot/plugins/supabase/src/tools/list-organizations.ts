import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';
import { mapOrganization, organizationSchema } from './schemas.js';

export const listOrganizations = defineTool({
  name: 'list_organizations',
  displayName: 'List Organizations',
  description: 'List all organizations the authenticated user belongs to.',
  summary: 'List all organizations',
  icon: 'building-2',
  group: 'Organizations',
  input: z.object({}),
  output: z.object({
    organizations: z.array(organizationSchema).describe('List of organizations'),
  }),
  handle: async () => {
    const data = await api<Record<string, unknown>[]>('/organizations');
    return { organizations: data.map(mapOrganization) };
  },
});
