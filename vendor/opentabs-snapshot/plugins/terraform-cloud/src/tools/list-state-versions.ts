import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiListResponse } from '../terraform-cloud-api.js';
import { paginationInput, paginationOutput, stateVersionSchema, mapStateVersion, mapPagination } from './schemas.js';
import type { RawStateVersion } from './schemas.js';

export const listStateVersions = defineTool({
  name: 'list_state_versions',
  displayName: 'List State Versions',
  description: 'List state versions for a workspace. Returns version history with serial numbers and status.',
  summary: 'List state versions for a workspace',
  icon: 'database',
  group: 'State',
  input: z.object({
    workspace_id: z.string().describe('Workspace ID (e.g., "ws-...")'),
    ...paginationInput.shape,
  }),
  output: z.object({
    state_versions: z.array(stateVersionSchema).describe('List of state versions'),
    pagination: paginationOutput,
  }),
  handle: async params => {
    const data = await api<JsonApiListResponse<RawStateVersion>>(
      `/workspaces/${encodeURIComponent(params.workspace_id)}/state-versions`,
      {
        query: {
          'page[number]': params.page ?? 1,
          'page[size]': params.page_size ?? 20,
        },
      },
    );

    return {
      state_versions: (data.data ?? []).map(r => mapStateVersion(r.id, r.attributes)),
      pagination: mapPagination(data.meta?.pagination),
    };
  },
});
