import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiResponse } from '../terraform-cloud-api.js';
import type { RawProject } from './schemas.js';
import { mapProject, projectSchema } from './schemas.js';

export const updateProject = defineTool({
  name: 'update_project',
  displayName: 'Update Project',
  description: 'Update a project name or description.',
  summary: 'Update project settings',
  icon: 'folder-pen',
  group: 'Projects',
  input: z.object({
    project_id: z.string().describe('Project ID (e.g., "prj-...")'),
    name: z.string().optional().describe('New project name'),
    description: z.string().optional().describe('New project description'),
  }),
  output: z.object({
    project: projectSchema.describe('Updated project'),
  }),
  handle: async params => {
    const attributes = stripUndefined({
      name: params.name,
      description: params.description,
    });

    const res = await api<JsonApiResponse<RawProject>>(`/projects/${encodeURIComponent(params.project_id)}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'projects',
          attributes,
        },
      },
    });
    return {
      project: mapProject(res.data.id, res.data.attributes),
    };
  },
});
