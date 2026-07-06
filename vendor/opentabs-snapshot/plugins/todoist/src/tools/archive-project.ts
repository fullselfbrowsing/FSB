import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiVoid } from '../todoist-api.js';

export const archiveProject = defineTool({
  name: 'archive_project',
  displayName: 'Archive Project',
  description:
    'Archive a Todoist project. Archived projects are hidden from the default view but can be restored later.',
  summary: 'Archive a project',
  icon: 'archive',
  group: 'Projects',
  input: z.object({
    project_id: z.string().describe('The ID of the project to archive'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the project was archived successfully'),
  }),
  handle: async params => {
    await apiVoid(`/projects/${params.project_id}/archive`, { method: 'POST' });
    return { success: true };
  },
});
