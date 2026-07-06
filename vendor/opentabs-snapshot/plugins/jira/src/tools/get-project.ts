import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../jira-api.js';
import { mapProject, projectSchema } from './schemas.js';

export const getProject = defineTool({
  name: 'get_project',
  displayName: 'Get Project',
  description: 'Get detailed information about a Jira project by its key or ID.',
  summary: 'Get details of a project',
  icon: 'folder-open',
  group: 'Projects',
  input: z.object({
    project_key: z.string().describe('Project key (e.g. "KAN") or project ID'),
  }),
  output: z.object({
    project: projectSchema.describe('The project details'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>>(`/project/${encodeURIComponent(params.project_key)}`);
    return { project: mapProject(data) };
  },
});
