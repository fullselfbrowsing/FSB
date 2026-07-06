import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiListResponse } from '../terraform-cloud-api.js';
import { paginationInput, paginationOutput, workspaceSchema, mapWorkspace, mapPagination } from './schemas.js';
import type { RawWorkspace } from './schemas.js';

export const listWorkspaces = defineTool({
  name: 'list_workspaces',
  displayName: 'List Workspaces',
  description: 'List workspaces in an organization. Supports filtering by name search and pagination.',
  summary: 'List workspaces in an organization',
  icon: 'layers',
  group: 'Workspaces',
  input: z.object({
    organization: z.string().describe('Organization name'),
    search: z.string().optional().describe('Search workspaces by name'),
    ...paginationInput.shape,
  }),
  output: z.object({
    workspaces: z.array(workspaceSchema).describe('List of workspaces'),
    pagination: paginationOutput,
  }),
  handle: async params => {
    const data = await api<JsonApiListResponse<RawWorkspace>>(
      `/organizations/${encodeURIComponent(params.organization)}/workspaces`,
      {
        query: {
          'page[number]': params.page ?? 1,
          'page[size]': params.page_size ?? 20,
          'search[name]': params.search,
        },
      },
    );

    return {
      workspaces: (data.data ?? []).map(r => mapWorkspace(r.id, r.attributes)),
      pagination: mapPagination(data.meta?.pagination),
    };
  },
});
