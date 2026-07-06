import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiResponse } from '../terraform-cloud-api.js';
import type { RawProject } from './schemas.js';
import { mapProject, projectSchema } from './schemas.js';

export const getProject = defineTool({
  name: 'get_project',
  displayName: 'Get Project',
  description: 'Get detailed information about a project by its ID.',
  summary: 'Get project details',
  icon: 'folder',
  group: 'Projects',
  input: z.object({
    project_id: z.string().describe('Project ID (e.g., "prj-...")'),
  }),
  output: z.object({
    project: projectSchema.describe('Project details'),
  }),
  handle: async params => {
    const res = await api<JsonApiResponse<RawProject>>(`/projects/${encodeURIComponent(params.project_id)}`);
    return {
      project: mapProject(res.data.id, res.data.attributes),
    };
  },
});
