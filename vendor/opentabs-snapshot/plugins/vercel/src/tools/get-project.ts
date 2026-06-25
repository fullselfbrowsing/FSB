import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { vercelApi } from '../vercel-api.js';
import { mapProject, projectSchema } from './schemas.js';

export const getProject = defineTool({
  name: 'get_project',
  displayName: 'Get Project',
  description: 'Get detailed information about a specific Vercel project by name or ID.',
  summary: 'Get project details',
  icon: 'folder-open',
  group: 'Projects',
  input: z.object({
    project: z.string().describe('Project name or ID'),
  }),
  output: projectSchema,
  handle: async params => {
    const data = await vercelApi<Record<string, unknown>>(`/v9/projects/${encodeURIComponent(params.project)}`);
    return mapProject(data);
  },
});
