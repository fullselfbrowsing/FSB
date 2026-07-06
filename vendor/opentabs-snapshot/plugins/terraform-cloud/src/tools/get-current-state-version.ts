import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiResponse } from '../terraform-cloud-api.js';
import { stateVersionSchema, mapStateVersion } from './schemas.js';
import type { RawStateVersion } from './schemas.js';

export const getCurrentStateVersion = defineTool({
  name: 'get_current_state_version',
  displayName: 'Get Current State Version',
  description: 'Get the current (latest) state version for a workspace.',
  summary: 'Get current state version',
  icon: 'database',
  group: 'State',
  input: z.object({
    workspace_id: z.string().describe('Workspace ID (e.g., "ws-...")'),
  }),
  output: z.object({
    state_version: stateVersionSchema,
  }),
  handle: async params => {
    const data = await api<JsonApiResponse<RawStateVersion>>(
      `/workspaces/${encodeURIComponent(params.workspace_id)}/current-state-version`,
    );

    return {
      state_version: mapStateVersion(data.data.id, data.data.attributes),
    };
  },
});
