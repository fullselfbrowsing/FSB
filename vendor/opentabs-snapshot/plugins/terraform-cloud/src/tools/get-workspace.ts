import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiResponse } from '../terraform-cloud-api.js';
import { workspaceSchema, mapWorkspace } from './schemas.js';
import type { RawWorkspace } from './schemas.js';

export const getWorkspace = defineTool({
  name: 'get_workspace',
  displayName: 'Get Workspace',
  description: 'Get detailed information about a workspace by its ID.',
  summary: 'Get workspace details',
  icon: 'layers',
  group: 'Workspaces',
  input: z.object({
    workspace_id: z.string().describe('Workspace ID (e.g., "ws-...")'),
  }),
  output: z.object({
    workspace: workspaceSchema,
  }),
  handle: async params => {
    const data = await api<JsonApiResponse<RawWorkspace>>(`/workspaces/${encodeURIComponent(params.workspace_id)}`);

    return {
      workspace: mapWorkspace(data.data.id, data.data.attributes),
    };
  },
});
