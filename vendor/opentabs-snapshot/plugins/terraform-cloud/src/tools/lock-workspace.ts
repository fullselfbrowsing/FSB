import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiResponse } from '../terraform-cloud-api.js';
import { workspaceSchema, mapWorkspace } from './schemas.js';
import type { RawWorkspace } from './schemas.js';

export const lockWorkspace = defineTool({
  name: 'lock_workspace',
  displayName: 'Lock Workspace',
  description: 'Lock a workspace to prevent new runs. Provide an optional reason.',
  summary: 'Lock a workspace',
  icon: 'lock',
  group: 'Workspaces',
  input: z.object({
    workspace_id: z.string().describe('Workspace ID (e.g., "ws-...")'),
    reason: z.string().optional().describe('Reason for locking'),
  }),
  output: z.object({
    workspace: workspaceSchema,
  }),
  handle: async params => {
    const data = await api<JsonApiResponse<RawWorkspace>>(
      `/workspaces/${encodeURIComponent(params.workspace_id)}/actions/lock`,
      {
        method: 'POST',
        body: { reason: params.reason },
      },
    );

    return {
      workspace: mapWorkspace(data.data.id, data.data.attributes),
    };
  },
});
