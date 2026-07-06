import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../gitlab-api.js';
import { mapProject, projectSchema } from './schemas.js';

export const getProject = defineTool({
  name: 'get_project',
  displayName: 'Get Project',
  description: 'Get detailed information about a specific project by its path (e.g., "group/project").',
  summary: 'Get project details',
  icon: 'folder-git-2',
  group: 'Projects',
  input: z.object({
    project: z.string().min(1).describe('Project path (e.g., "group/project") or numeric project ID'),
  }),
  output: z.object({
    project: projectSchema.describe('The project'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>>(`/projects/${encodeURIComponent(params.project)}`);
    return { project: mapProject(data) };
  },
});
