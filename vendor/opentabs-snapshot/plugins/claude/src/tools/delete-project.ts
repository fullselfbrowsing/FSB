import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { orgApi } from '../claude-api.js';

export const deleteProject = defineTool({
  name: 'delete_project',
  displayName: 'Delete Project',
  description: 'Permanently delete a project by its UUID. This action cannot be undone.',
  summary: 'Delete a project',
  icon: 'folder-x',
  group: 'Projects',
  input: z.object({
    project_uuid: z.string().describe('Project UUID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the project was deleted successfully'),
  }),
  handle: async ({ project_uuid }) => {
    await orgApi(`/projects/${project_uuid}`, { method: 'DELETE' });
    return { success: true };
  },
});
