import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawProject, mapProject, projectSchema } from './schemas.js';

export const getProject = defineTool({
  name: 'get_project',
  displayName: 'Get Project',
  description: 'Get detailed information about a specific Todoist project by its ID.',
  summary: 'Get a project by ID',
  icon: 'folder-open',
  group: 'Projects',
  input: z.object({
    project_id: z.string().describe('The ID of the project to retrieve'),
  }),
  output: z.object({
    project: projectSchema.describe('The requested project'),
  }),
  handle: async params => {
    const data = await api<RawProject>(`/projects/${params.project_id}`);
    return { project: mapProject(data) };
  },
});
