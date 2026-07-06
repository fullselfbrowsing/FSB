import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiVoid } from '../todoist-api.js';

export const unarchiveProject = defineTool({
  name: 'unarchive_project',
  displayName: 'Unarchive Project',
  description: 'Restore an archived Todoist project. The project and its tasks become visible again.',
  summary: 'Unarchive a project',
  icon: 'archive-restore',
  group: 'Projects',
  input: z.object({
    project_id: z.string().describe('The ID of the project to unarchive'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the project was unarchived successfully'),
  }),
  handle: async params => {
    await apiVoid(`/projects/${params.project_id}/unarchive`, { method: 'POST' });
    return { success: true };
  },
});
