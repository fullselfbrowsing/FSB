import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../webflow-api.js';
import { workspaceSchema, mapWorkspace } from './schemas.js';
import type { RawWorkspace } from './schemas.js';

interface WorkspacesResponse {
  workspaces?: RawWorkspace[];
}

export const listWorkspaces = defineTool({
  name: 'list_workspaces',
  displayName: 'List Workspaces',
  description:
    'List all Webflow workspaces the current user belongs to. Returns workspace names, slugs, roles, and site counts.',
  summary: 'List all workspaces',
  icon: 'building-2',
  group: 'Workspaces',
  input: z.object({}),
  output: z.object({
    workspaces: z.array(workspaceSchema),
  }),
  handle: async () => {
    const data = await api<WorkspacesResponse>('/workspaces');
    return {
      workspaces: (data.workspaces ?? []).map(mapWorkspace),
    };
  },
});
