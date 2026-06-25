import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { orgApi } from '../claude-api.js';
import { type RawProject, mapProject, projectSchema } from './schemas.js';

export const getProject = defineTool({
  name: 'get_project',
  displayName: 'Get Project',
  description: 'Get detailed information about a specific project by its UUID.',
  summary: 'Get a project by UUID',
  icon: 'folder-open',
  group: 'Projects',
  input: z.object({
    project_uuid: z.string().describe('Project UUID to retrieve'),
  }),
  output: z.object({
    project: projectSchema.describe('The requested project'),
  }),
  handle: async ({ project_uuid }) => {
    const data = await orgApi<RawProject>(`/projects/${project_uuid}`);
    return { project: mapProject(data) };
  },
});
