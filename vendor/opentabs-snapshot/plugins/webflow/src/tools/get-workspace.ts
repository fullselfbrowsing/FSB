import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../webflow-api.js';
import { workspaceSchema, mapWorkspace } from './schemas.js';
import type { RawWorkspace } from './schemas.js';

interface WorkspaceResponse {
  workspace?: RawWorkspace;
}

export const getWorkspace = defineTool({
  name: 'get_workspace',
  displayName: 'Get Workspace',
  description:
    'Get detailed information about a specific Webflow workspace by its URL slug. Returns workspace name, seat usage, and billing details.',
  summary: 'Get workspace details',
  icon: 'building-2',
  group: 'Workspaces',
  input: z.object({
    workspace_slug: z.string().describe('Workspace URL slug (e.g., "my-workspace-abc123")'),
  }),
  output: z.object({ workspace: workspaceSchema }),
  handle: async params => {
    const data = await api<WorkspaceResponse>(`/workspaces/${params.workspace_slug}`);
    return { workspace: mapWorkspace(data.workspace ?? {}) };
  },
});
