import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import { type AsanaList, type RawWorkspace, mapWorkspace, workspaceSchema } from './schemas.js';

export const listWorkspaces = defineTool({
  name: 'list_workspaces',
  displayName: 'List Workspaces',
  description: 'List all workspaces the current user has access to.',
  summary: 'List all workspaces',
  icon: 'building',
  group: 'Workspaces',
  input: z.object({}),
  output: z.object({
    workspaces: z.array(workspaceSchema).describe('List of workspaces'),
  }),
  handle: async () => {
    const data = await api<AsanaList<RawWorkspace>>('/workspaces');
    return {
      workspaces: (data.data ?? []).map(mapWorkspace),
    };
  },
});
