import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiListResponse } from '../terraform-cloud-api.js';
import type { RawTeam } from './schemas.js';
import { mapPagination, mapTeam, paginationInput, paginationOutput, teamSchema } from './schemas.js';

export const listTeams = defineTool({
  name: 'list_teams',
  displayName: 'List Teams',
  description: 'List teams in an organization.',
  summary: 'List teams in an organization',
  icon: 'users',
  group: 'Teams',
  input: z.object({
    organization: z.string().describe('Organization name'),
    ...paginationInput.shape,
  }),
  output: z.object({
    teams: z.array(teamSchema).describe('List of teams'),
    pagination: paginationOutput.describe('Pagination metadata'),
  }),
  handle: async params => {
    const res = await api<JsonApiListResponse<RawTeam>>(
      `/organizations/${encodeURIComponent(params.organization)}/teams`,
      {
        query: {
          'page[number]': params.page ?? 1,
          'page[size]': params.page_size ?? 20,
        },
      },
    );

    return {
      teams: res.data.map(r => mapTeam(r.id, r.attributes)),
      pagination: mapPagination(res.meta?.pagination),
    };
  },
});
