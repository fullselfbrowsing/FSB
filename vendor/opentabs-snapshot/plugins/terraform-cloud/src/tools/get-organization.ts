import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiResponse } from '../terraform-cloud-api.js';
import type { RawOrganization } from './schemas.js';
import { mapOrganization, organizationSchema } from './schemas.js';

export const getOrganization = defineTool({
  name: 'get_organization',
  displayName: 'Get Organization',
  description: 'Get detailed information about a specific organization by name.',
  summary: 'Get organization details',
  icon: 'building-2',
  group: 'Organizations',
  input: z.object({
    organization: z.string().describe('Organization name'),
  }),
  output: z.object({
    organization: organizationSchema.describe('Organization details'),
  }),
  handle: async params => {
    const res = await api<JsonApiResponse<RawOrganization>>(
      `/organizations/${encodeURIComponent(params.organization)}`,
    );
    return {
      organization: mapOrganization(res.data.id, res.data.attributes),
    };
  },
});
