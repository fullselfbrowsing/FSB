import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { orgApi } from '../claude-api.js';
import { type RawProject, mapProject, projectSchema } from './schemas.js';

export const listProjects = defineTool({
  name: 'list_projects',
  displayName: 'List Projects',
  description:
    'List all projects in the current organization. Returns project name, description, document and file counts.',
  summary: 'List all projects',
  icon: 'folder',
  group: 'Projects',
  input: z.object({}),
  output: z.object({
    projects: z.array(projectSchema).describe('List of projects'),
  }),
  handle: async () => {
    const data = await orgApi<RawProject[]>('/projects');
    return { projects: data.map(mapProject) };
  },
});
