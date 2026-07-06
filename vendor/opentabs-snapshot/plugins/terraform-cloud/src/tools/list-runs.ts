import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiListResponse } from '../terraform-cloud-api.js';
import type { RawRun } from './schemas.js';
import { mapPagination, mapRun, paginationInput, paginationOutput, runSchema } from './schemas.js';

export const listRuns = defineTool({
  name: 'list_runs',
  displayName: 'List Runs',
  description: 'List runs for a workspace. Returns run status, message, and change detection.',
  summary: 'List runs for a workspace',
  icon: 'play',
  group: 'Runs',
  input: z.object({
    workspace_id: z.string().describe('Workspace ID (e.g., "ws-...")'),
    ...paginationInput.shape,
  }),
  output: z.object({
    runs: z.array(runSchema).describe('List of runs'),
    pagination: paginationOutput.describe('Pagination metadata'),
  }),
  handle: async params => {
    const res = await api<JsonApiListResponse<RawRun>>(`/workspaces/${encodeURIComponent(params.workspace_id)}/runs`, {
      query: {
        'page[number]': params.page ?? 1,
        'page[size]': params.page_size ?? 20,
      },
    });

    return {
      runs: res.data.map(r => mapRun(r.id, r.attributes)),
      pagination: mapPagination(res.meta?.pagination),
    };
  },
});
