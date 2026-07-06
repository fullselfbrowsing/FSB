import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import { type AsanaResponse, PROJECT_OPT_FIELDS, type RawProject, mapProject, projectSchema } from './schemas.js';

export const getProject = defineTool({
  name: 'get_project',
  displayName: 'Get Project',
  description: 'Get detailed information about a specific project by its GID.',
  summary: 'Get details of a specific project',
  icon: 'folder-open',
  group: 'Projects',
  input: z.object({
    project_gid: z.string().min(1).describe('Project GID to retrieve'),
  }),
  output: z.object({
    project: projectSchema.describe('Project details'),
  }),
  handle: async params => {
    const data = await api<AsanaResponse<RawProject>>(`/projects/${params.project_gid}`, {
      query: { opt_fields: PROJECT_OPT_FIELDS },
    });
    return { project: mapProject(data.data) };
  },
});
