import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawProject, mapProject, projectSchema } from './schemas.js';

export const updateProject = defineTool({
  name: 'update_project',
  displayName: 'Update Project',
  description: 'Update an existing Todoist project. Only the fields provided will be changed.',
  summary: 'Update a project',
  icon: 'folder-pen',
  group: 'Projects',
  input: z.object({
    project_id: z.string().describe('The ID of the project to update'),
    name: z.string().optional().describe('New name for the project'),
    color: z.string().optional().describe('New color name (e.g. "berry_red", "blue", "green")'),
    is_favorite: z.boolean().optional().describe('Whether to mark the project as a favorite'),
    view_style: z.string().optional().describe('New view style: "list" or "board"'),
  }),
  output: z.object({
    project: projectSchema.describe('The updated project'),
  }),
  handle: async params => {
    const { project_id, ...body } = params;
    const data = await api<RawProject>(`/projects/${project_id}`, {
      method: 'POST',
      body,
    });
    return { project: mapProject(data) };
  },
});
