import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiListResponse } from '../terraform-cloud-api.js';
import type { RawProject } from './schemas.js';
import { mapPagination, mapProject, paginationInput, paginationOutput, projectSchema } from './schemas.js';

export const listProjects = defineTool({
  name: 'list_projects',
  displayName: 'List Projects',
  description: 'List projects in an organization. Projects group workspaces together.',
  summary: 'List projects in an organization',
  icon: 'folder',
  group: 'Projects',
  input: z.object({
    organization: z.string().describe('Organization name'),
    ...paginationInput.shape,
  }),
  output: z.object({
    projects: z.array(projectSchema).describe('List of projects'),
    pagination: paginationOutput.describe('Pagination metadata'),
  }),
  handle: async params => {
    const res = await api<JsonApiListResponse<RawProject>>(
      `/organizations/${encodeURIComponent(params.organization)}/projects`,
      {
        query: {
          'page[number]': params.page ?? 1,
          'page[size]': params.page_size ?? 20,
        },
      },
    );

    return {
      projects: res.data.map(r => mapProject(r.id, r.attributes)),
      pagination: mapPagination(res.meta?.pagination),
    };
  },
});
