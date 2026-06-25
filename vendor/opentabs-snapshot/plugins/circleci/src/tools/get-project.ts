import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type RawProject, mapProject, projectSchema } from './schemas.js';

export const getProject = defineTool({
  name: 'get_project',
  displayName: 'Get Project',
  description: 'Get project details by project slug. Returns project ID, name, organization, and VCS info.',
  summary: 'Get project details by slug',
  icon: 'folder',
  group: 'Projects',
  input: z.object({
    project_slug: z.string().describe('Project slug (e.g., "gh/org/repo")'),
  }),
  output: z.object({ project: projectSchema }),
  handle: async params => {
    const data = await api<RawProject>(`/project/${params.project_slug}`);
    return { project: mapProject(data) };
  },
});
