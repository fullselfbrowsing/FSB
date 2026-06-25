import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../webflow-api.js';
import { permissionsOutputSchema } from './schemas.js';

export const getWorkspacePermissions = defineTool({
  name: 'get_workspace_permissions',
  displayName: 'Get Workspace Permissions',
  description:
    'Get the current user permissions for a Webflow workspace. Returns which actions the user can perform on workspace resources like sites, billing, members, and integrations.',
  summary: 'Get your workspace permissions',
  icon: 'shield',
  group: 'Workspaces',
  input: z.object({
    workspace_slug: z.string().describe('Workspace URL slug'),
  }),
  output: permissionsOutputSchema,
  handle: async params => {
    const data = await api<Record<string, Record<string, boolean>>>(`/workspaces/${params.workspace_slug}/permissions`);
    return { permissions: data };
  },
});
