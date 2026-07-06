import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../zendesk-api.js';
import { type RawOrganization, mapOrganization, organizationSchema } from './schemas.js';

export const getOrganization = defineTool({
  name: 'get_organization',
  displayName: 'Get Organization',
  description: 'Get detailed information about a specific Zendesk organization by its ID.',
  summary: 'Get an organization by ID',
  icon: 'building-2',
  group: 'Organizations',
  input: z.object({
    organization_id: z.number().int().describe('Organization ID to retrieve'),
  }),
  output: z.object({
    organization: organizationSchema.describe('The organization details'),
  }),
  handle: async params => {
    const data = await api<{ organization: RawOrganization }>(`/organizations/${params.organization_id}.json`);
    return { organization: mapOrganization(data.organization) };
  },
});
