import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiListResponse } from '../terraform-cloud-api.js';
import type { RawOrganization } from './schemas.js';
import { mapOrganization, mapPagination, organizationSchema, paginationInput, paginationOutput } from './schemas.js';

export const listOrganizations = defineTool({
  name: 'list_organizations',
  displayName: 'List Organizations',
  description:
    'List all organizations the current user belongs to. Returns organization name, plan, and resource count.',
  summary: 'List your organizations',
  icon: 'building-2',
  group: 'Organizations',
  input: z.object({
    ...paginationInput.shape,
  }),
  output: z.object({
    organizations: z.array(organizationSchema).describe('List of organizations'),
    pagination: paginationOutput.describe('Pagination metadata'),
  }),
  handle: async params => {
    const res = await api<JsonApiListResponse<RawOrganization>>('/organizations', {
      query: {
        'page[number]': params.page ?? 1,
        'page[size]': params.page_size ?? 20,
      },
    });

    return {
      organizations: res.data.map(r => mapOrganization(r.id, r.attributes)),
      pagination: mapPagination(res.meta?.pagination),
    };
  },
});
