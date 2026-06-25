import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';
import { mapOrganization, organizationSchema } from './schemas.js';

export const getOrganization = defineTool({
  name: 'get_organization',
  displayName: 'Get Organization',
  description: 'Get detailed information about a specific organization by its slug.',
  summary: 'Get organization details',
  icon: 'building',
  group: 'Organizations',
  input: z.object({
    slug: z.string().min(1).describe('Organization slug'),
  }),
  output: z.object({
    organization: organizationSchema.describe('Organization details'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>>(`/organizations/${params.slug}`);
    return { organization: mapOrganization(data) };
  },
});
