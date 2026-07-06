import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { api } from '../terraform-cloud-api.js';

export const deleteWorkspace = defineTool({
  name: 'delete_workspace',
  displayName: 'Delete Workspace',
  description: 'Permanently delete a workspace. This action cannot be undone.',
  summary: 'Delete a workspace',
  icon: 'trash-2',
  group: 'Workspaces',
  input: z.object({
    workspace_id: z.string().describe('Workspace ID (e.g., "ws-...")'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/workspaces/${encodeURIComponent(params.workspace_id)}`, {
      method: 'DELETE',
    });

    return { success: true };
  },
});
