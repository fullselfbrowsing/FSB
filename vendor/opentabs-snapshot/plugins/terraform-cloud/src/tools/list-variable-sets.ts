import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiListResponse } from '../terraform-cloud-api.js';
import type { RawVariableSet } from './schemas.js';
import { mapPagination, mapVariableSet, paginationInput, paginationOutput, variableSetSchema } from './schemas.js';

export const listVariableSets = defineTool({
  name: 'list_variable_sets',
  displayName: 'List Variable Sets',
  description: 'List variable sets in an organization. Variable sets allow sharing variables across workspaces.',
  summary: 'List variable sets in an organization',
  icon: 'list',
  group: 'Variable Sets',
  input: z.object({
    organization: z.string().describe('Organization name'),
    ...paginationInput.shape,
  }),
  output: z.object({
    variable_sets: z.array(variableSetSchema).describe('List of variable sets'),
    pagination: paginationOutput.describe('Pagination metadata'),
  }),
  handle: async params => {
    const res = await api<JsonApiListResponse<RawVariableSet>>(
      `/organizations/${encodeURIComponent(params.organization)}/varsets`,
      {
        query: {
          'page[number]': params.page ?? 1,
          'page[size]': params.page_size ?? 20,
        },
      },
    );

    return {
      variable_sets: res.data.map(r => mapVariableSet(r.id, r.attributes)),
      pagination: mapPagination(res.meta?.pagination),
    };
  },
});
