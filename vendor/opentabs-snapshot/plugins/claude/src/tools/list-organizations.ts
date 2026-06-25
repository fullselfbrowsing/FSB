import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../claude-api.js';
import { type RawOrganization, mapOrganization, organizationSchema } from './schemas.js';

export const listOrganizations = defineTool({
  name: 'list_organizations',
  displayName: 'List Organizations',
  description:
    'List all organizations the authenticated user belongs to. Returns organization details including billing type and capabilities.',
  summary: 'List all organizations',
  icon: 'building',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    organizations: z.array(organizationSchema).describe('List of organizations'),
  }),
  handle: async () => {
    const data = await api<RawOrganization[]>('/organizations');
    return { organizations: data.map(mapOrganization) };
  },
});
