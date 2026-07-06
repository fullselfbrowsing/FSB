import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiListResponse } from '../terraform-cloud-api.js';
import type { RawOrganizationMembership } from './schemas.js';
import {
  mapOrganizationMembership,
  mapPagination,
  organizationMembershipSchema,
  paginationInput,
  paginationOutput,
} from './schemas.js';

export const listOrganizationMembers = defineTool({
  name: 'list_organization_members',
  displayName: 'List Organization Members',
  description: 'List members of an organization with their status and email.',
  summary: 'List organization members',
  icon: 'users',
  group: 'Organizations',
  input: z.object({
    organization: z.string().describe('Organization name'),
    ...paginationInput.shape,
  }),
  output: z.object({
    members: z.array(organizationMembershipSchema).describe('List of organization members'),
    pagination: paginationOutput.describe('Pagination metadata'),
  }),
  handle: async params => {
    const res = await api<JsonApiListResponse<RawOrganizationMembership>>(
      `/organizations/${encodeURIComponent(params.organization)}/organization-memberships`,
      {
        query: {
          'page[number]': params.page ?? 1,
          'page[size]': params.page_size ?? 20,
        },
      },
    );

    return {
      members: res.data.map(r => {
        const userData = r.relationships?.user?.data;
        const userId = userData && !Array.isArray(userData) ? userData.id : '';
        return mapOrganizationMembership(r.id, r.attributes, userId);
      }),
      pagination: mapPagination(res.meta?.pagination),
    };
  },
});
