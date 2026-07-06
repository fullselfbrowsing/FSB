import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../zendesk-api.js';
import { type RawOrganization, mapOrganization, organizationSchema } from './schemas.js';

export const listOrganizations = defineTool({
  name: 'list_organizations',
  displayName: 'List Organizations',
  description: 'List all organizations in the Zendesk account with optional pagination.',
  summary: 'List organizations',
  icon: 'building-2',
  group: 'Organizations',
  input: z.object({
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1)'),
    per_page: z.number().int().min(1).max(100).optional().describe('Number of results per page (default 25, max 100)'),
  }),
  output: z.object({
    organizations: z.array(organizationSchema).describe('List of organizations'),
    count: z.number().int().describe('Total number of organizations'),
  }),
  handle: async params => {
    const data = await api<{ organizations: RawOrganization[]; count: number }>('/organizations.json', {
      query: {
        page: params.page,
        per_page: params.per_page,
      },
    });
    return {
      organizations: (data.organizations ?? []).map(mapOrganization),
      count: data.count ?? 0,
    };
  },
});
