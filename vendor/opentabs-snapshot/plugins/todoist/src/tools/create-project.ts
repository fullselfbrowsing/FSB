import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawProject, mapProject, projectSchema } from './schemas.js';

export const createProject = defineTool({
  name: 'create_project',
  displayName: 'Create Project',
  description: 'Create a new project in Todoist. Only the name is required — all other fields are optional.',
  summary: 'Create a new project',
  icon: 'folder-plus',
  group: 'Projects',
  input: z.object({
    name: z.string().describe('Name of the new project'),
    parent_id: z.string().optional().describe('Parent project ID to create a nested project'),
    color: z.string().optional().describe('Project color name (e.g. "berry_red", "blue", "green")'),
    is_favorite: z.boolean().optional().describe('Whether to mark the project as a favorite'),
    view_style: z.string().optional().describe('View style: "list" or "board"'),
  }),
  output: z.object({
    project: projectSchema.describe('The newly created project'),
  }),
  handle: async params => {
    const data = await api<RawProject>('/projects', {
      method: 'POST',
      body: params,
    });
    return { project: mapProject(data) };
  },
});
