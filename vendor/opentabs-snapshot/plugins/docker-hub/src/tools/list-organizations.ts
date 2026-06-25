import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../docker-hub-api.js';
import { mapOrganization, organizationSchema } from './schemas.js';
import type { PaginatedResponse, RawOrganization } from './schemas.js';

export const listOrganizations = defineTool({
  name: 'list_organizations',
  displayName: 'List Organizations',
  description:
    'List Docker Hub organizations the current user belongs to. Returns organization names, locations, and join dates.',
  summary: 'List your Docker Hub organizations',
  icon: 'building-2',
  group: 'Organizations',
  input: z.object({
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    page_size: z.number().int().min(1).max(100).optional().describe('Results per page (default 25, max 100)'),
  }),
  output: z.object({
    count: z.number().describe('Total number of organizations'),
    organizations: z.array(organizationSchema),
  }),
  handle: async params => {
    const data = await api<PaginatedResponse<RawOrganization>>('/v2/user/orgs', {
      query: {
        page: params.page,
        page_size: params.page_size ?? 25,
      },
    });
    return {
      count: data.count ?? 0,
      organizations: (data.results ?? []).map(mapOrganization),
    };
  },
});
