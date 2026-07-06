import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';

export const deleteProject = defineTool({
  name: 'delete_project',
  displayName: 'Delete Project',
  description: 'Delete a project. The project must have no workspaces.',
  summary: 'Delete a project',
  icon: 'folder-x',
  group: 'Projects',
  input: z.object({
    project_id: z.string().describe('Project ID (e.g., "prj-...")'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/projects/${encodeURIComponent(params.project_id)}`, {
      method: 'DELETE',
    });
    return { success: true };
  },
});
