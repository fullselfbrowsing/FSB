import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiVoid } from '../todoist-api.js';

export const deleteProject = defineTool({
  name: 'delete_project',
  displayName: 'Delete Project',
  description: 'Permanently delete a Todoist project and all of its tasks. This action cannot be undone.',
  summary: 'Delete a project',
  icon: 'folder-x',
  group: 'Projects',
  input: z.object({
    project_id: z.string().describe('The ID of the project to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the project was deleted successfully'),
  }),
  handle: async params => {
    await apiVoid(`/projects/${params.project_id}`, { method: 'DELETE' });
    return { success: true };
  },
});
