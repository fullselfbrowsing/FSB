import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiResponse } from '../terraform-cloud-api.js';
import { workspaceSchema, mapWorkspace } from './schemas.js';
import type { RawWorkspace } from './schemas.js';

export const unlockWorkspace = defineTool({
  name: 'unlock_workspace',
  displayName: 'Unlock Workspace',
  description: 'Unlock a workspace to allow new runs.',
  summary: 'Unlock a workspace',
  icon: 'lock-open',
  group: 'Workspaces',
  input: z.object({
    workspace_id: z.string().describe('Workspace ID (e.g., "ws-...")'),
  }),
  output: z.object({
    workspace: workspaceSchema,
  }),
  handle: async params => {
    const data = await api<JsonApiResponse<RawWorkspace>>(
      `/workspaces/${encodeURIComponent(params.workspace_id)}/actions/unlock`,
      { method: 'POST' },
    );

    return {
      workspace: mapWorkspace(data.data.id, data.data.attributes),
    };
  },
});
