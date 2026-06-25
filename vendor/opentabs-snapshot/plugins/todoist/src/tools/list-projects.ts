import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawProject, type TodoistList, mapProject, projectSchema } from './schemas.js';

export const listProjects = defineTool({
  name: 'list_projects',
  displayName: 'List Projects',
  description:
    'List all projects in the Todoist workspace. Returns every project including inbox, personal, and shared projects with their metadata.',
  summary: 'List all projects',
  icon: 'folder',
  group: 'Projects',
  input: z.object({}),
  output: z.object({
    projects: z.array(projectSchema).describe('List of all projects'),
  }),
  handle: async () => {
    const data = await api<TodoistList<RawProject>>('/projects');
    return { projects: data.results.map(mapProject) };
  },
});
